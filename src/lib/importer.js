'use strict';

const fs = require('fs');
const { parse } = require('csv-parse/sync');
const db = require('../db');
const data = require('../data');
const periodsLib = require('./periods');
const { AssessmentService } = require('./assessment');

const COLUMNS = ['name', 'nim', 'faculty', 'perceived_stress', 'sleep_quality', 'fatigue', 'social_connectedness', 'academic_pressure', 'daily_functioning'];
const ANSWER_COLUMNS = COLUMNS.slice(3);
const pad = (n) => String(n).padStart(2, '0');

/** PRNG kecil dengan seed (mulberry32) agar data demo deterministik. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

/** Kode komunitas dari nama fakultas, dijamin unik. */
async function createCommunity(name, client) {
  const skip = new Set(['faculty', 'of', 'and', 'fakultas', 'dan', '&']);
  const words = name.split(/\s+/).filter((w) => w && !skip.has(w.toLowerCase()));
  let code = words.map((w) => w[0]).join('').toUpperCase();
  if (code.length < 3) code = (words[0] || name).replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
  const base = code || 'KOM';
  let attempt = base;
  let i = 2;
  while ((await client.query('SELECT 1 FROM communities WHERE code = $1', [attempt])).rowCount > 0) attempt = base + i++;
  const r = await client.query(
    'INSERT INTO communities (code, name, invited_count, is_active) VALUES ($1,$2,0,true) RETURNING id',
    [attempt, name]
  );
  return r.rows[0].id;
}

/**
 * Mengimpor check-in dari CSV (pemisah ; atau ,) ke satu periode.
 * Kolom: Name, NIM, Faculty, Perceived_Stress, Sleep_Quality, Fatigue,
 *        Social_Connectedness, Academic_Pressure, Daily_Functioning (jawaban mentah 0-4).
 *
 * Aturan sama dengan form check-in: satu NIM hanya satu check-in per periode.
 * Baris dengan NIM yang sudah ada pada periode itu dilewati dan dilaporkan.
 */
async function importCsv(path, periodCode, { rng = Math.random } = {}) {
  if (!fs.existsSync(path) || !periodsLib.CODE_RE.test(periodCode)) {
    throw new Error('File tidak ditemukan atau kode periode bukan YYYY-MM.');
  }

  const text = fs.readFileSync(path, 'utf8');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = parse(text, { delimiter, bom: true, relax_column_count: true, skip_empty_lines: true });

  const header = (rows.shift() || []).map((h) => String(h).trim().toLowerCase());
  const map = {};
  for (const col of COLUMNS) {
    const i = header.indexOf(col);
    if (i === -1) throw new Error(`Kolom '${col}' tidak ditemukan pada header CSV.`);
    map[col] = i;
  }

  const period = await data.periods.forCode(periodCode);
  const tz = process.env.APP_TIMEZONE || 'Asia/Jakarta';
  const maxDay = periodCode === periodsLib.currentCode() ? periodsLib.currentDay() : 28;

  const res = { rows: 0, imported: 0, duplicates: 0, duplicate_nims: [], invalid: [], communities_created: 0 };

  await db.tx(async (client) => {
    const byName = new Map();
    for (const c of (await client.query('SELECT id, name FROM communities')).rows) byName.set(c.name.toLowerCase(), c.id);

    let line = 1;
    for (const r of rows) {
      line++;
      if (r.every((v) => String(v ?? '').trim() === '')) continue;
      res.rows++;

      const nim = data.students.normalizeNim(r[map.nim]);
      const name = String(r[map.name] ?? '').trim();
      const fac = String(r[map.faculty] ?? '').trim();
      if (nim === '' || fac === '' || !/^[0-9A-Z]{5,20}$/.test(nim)) {
        res.invalid.push(`baris ${line}: NIM atau fakultas tidak valid`);
        continue;
      }

      const answers = [];
      let ok = true;
      for (const col of ANSWER_COLUMNS) {
        const v = String(r[map[col]] ?? '').trim();
        if (!/^[0-4]$/.test(v)) {
          ok = false;
          break;
        }
        answers.push(Number(v));
      }
      if (!ok) {
        res.invalid.push(`baris ${line} (NIM ${nim}): jawaban harus bilangan 0-4`);
        continue;
      }

      const key = fac.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, await createCommunity(fac, client));
        res.communities_created++;
      }

      let student = await data.students.findByNim(nim, client);
      if (!student) student = await data.students.create({ nim, name: name || null, community_id: byName.get(key) }, client);

      const dup = await client.query('SELECT 1 FROM checkins WHERE period_id=$1 AND student_id=$2', [period.id, student.id]);
      if (dup.rowCount > 0) {
        res.duplicates++;
        res.duplicate_nims.push(nim);
        continue;
      }

      const day = randInt(rng, 1, Math.max(1, maxDay));
      const local = `${periodCode}-${pad(day)} ${pad(randInt(rng, 8, 21))}:${pad(randInt(rng, 0, 59))}:00`;
      await client.query(
        `INSERT INTO checkins (period_id, student_id, community_id, i1, i2, i3, i4, i5, i6, consent, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,($11::timestamp AT TIME ZONE $12))`,
        [period.id, student.id, student.community_id, ...answers, true, local, tz]
      );
      res.imported++;
    }
  });

  // Perbarui penilaian periode ini (komunitas dihitung otomatis dari data yang masuk).
  await new AssessmentService().runForPeriod(period.id);

  return res;
}

module.exports = { importCsv, makeRng, randInt };
