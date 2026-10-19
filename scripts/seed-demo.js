'use strict';
// npm run seed:demo  -- MENGHAPUS seluruh data check-in/komunitas lalu mengisi data simulasi.
const path = require('path');
const db = require('../src/db');
const data = require('../src/data');
const periodsLib = require('../src/lib/periods');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const { importCsv, makeRng, randInt } = require('../src/lib/importer');
const { AssessmentService } = require('../src/lib/assessment');
const { ensureAdmin } = require('./seed-admin');

const CSV = path.join(__dirname, '..', 'data', 'sample_checkins.csv');
const FACULTIES = {
  'Faculty of Mathematics and Natural Sciences': 'MNS',
  'Faculty of Economics and Business': 'FEB',
  'Medical Faculty': 'MED',
  'Faculty of Engineering': 'ENG',
  'Faculty of Law': 'LAW',
  'Faculty of Humanities': 'HUM',
  'Faculty of Social and Political Sciences': 'SOC',
};
// Konteks kalender akademik per nomor bulan (contoh umum, ubah di dashboard).
const CONTEXT = {
  1: 'Libur semester ganjil', 2: 'Awal semester genap', 3: 'Perkuliahan reguler', 4: 'Ujian tengah semester',
  5: 'Perkuliahan reguler', 6: 'Ujian akhir semester genap', 7: 'Libur semester', 8: 'Penerimaan mahasiswa baru',
  9: 'Awal semester ganjil', 10: 'Ujian tengah semester', 11: 'Perkuliahan reguler', 12: 'Ujian akhir semester ganjil',
};
// Pergeseran rata-rata skor risiko untuk 1..4 bulan sebelum bulan berjalan (lebih rendah dari sekarang).
const SHIFT = { 1: -0.35, 2: -0.5, 3: -0.3, 4: -0.6 };
const pad = (n) => String(n).padStart(2, '0');

async function seedDemo() {
  await ensureAdmin();
  await db.query('TRUNCATE assessments, indicator_stats, checkins, students, communities, periods RESTART IDENTITY CASCADE');

  // Populasi diundang diperkirakan dari jumlah NIM unik per fakultas (partisipasi ~60%).
  const rows = parse(fs.readFileSync(CSV, 'utf8'), { delimiter: ';', bom: true, relax_column_count: true, skip_empty_lines: true });
  rows.shift();
  const seen = new Set();
  const uniq = {};
  for (const r of rows) {
    const nim = String(r[1] || '').trim().toUpperCase();
    if (nim && !seen.has(nim)) { // NIM ganda: baris pertama yang dipakai (sama dengan impor)
      seen.add(nim);
      const f = String(r[2]).trim();
      (uniq[f] ||= new Set()).add(nim);
    }
  }
  for (const [name, code] of Object.entries(FACULTIES)) {
    const invited = Math.ceil((uniq[name]?.size || 0) / 0.6 / 10) * 10;
    await db.query('INSERT INTO communities (code, name, invited_count, is_active) VALUES ($1,$2,$3,true)', [code, name, invited]);
  }

  const rng = makeRng(20261017); // deterministik
  const current = periodsLib.currentCode();
  const currentPeriod = await data.periods.forCode(current);

  // Bulan berjalan: impor langsung dari CSV.
  await importCsv(CSV, current, { rng });

  // Empat bulan sebelumnya: variasi dari jawaban bulan berjalan, tidak semua mahasiswa mengisi.
  const base = (await db.query('SELECT student_id, community_id, i1, i2, i3, i4, i5, i6 FROM checkins WHERE period_id = $1', [currentPeriod.id])).rows;
  const tz = process.env.APP_TIMEZONE || 'Asia/Jakarta';
  const codes = [current];
  let code = current;
  for (let k = 1; k <= 4; k++) {
    code = periodsLib.previousCode(code);
    codes.push(code);
    const period = await data.periods.forCode(code);
    for (const b of base) {
      if (randInt(rng, 1, 100) > 85) continue; // tidak mengisi bulan itu
      const ans = [];
      for (let n = 1; n <= 6; n++) {
        let risk = n === 4 ? 4 - b.i4 : b[`i${n}`];
        risk = Math.max(0, Math.min(4, Math.round(risk + SHIFT[k] + (randInt(rng, -100, 100) / 100) * 0.9)));
        ans.push(n === 4 ? 4 - risk : risk);
      }
      const local = `${code}-${pad(randInt(rng, 1, 28))} ${pad(randInt(rng, 8, 21))}:${pad(randInt(rng, 0, 59))}:00`;
      await db.query(
        `INSERT INTO checkins (period_id, student_id, community_id, i1, i2, i3, i4, i5, i6, consent, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,($10::timestamp AT TIME ZONE $11))`,
        [period.id, b.student_id, b.community_id, ...ans, local, tz]
      );
    }
  }

  for (const c of codes) {
    await db.query('UPDATE periods SET calendar_context=$2, updated_at=now() WHERE code=$1', [c, CONTEXT[parseInt(c.slice(5), 10)]]);
  }

  // Hitung berurutan (lama ke baru) agar perbandingan bulan sebelumnya tersedia.
  const svc = new AssessmentService();
  for (const c of [...codes].sort()) await svc.runForPeriod((await data.periods.forCode(c)).id);

  // Contoh riwayat tindak lanjut pada satu penilaian RED/YELLOW bulan lalu (jika ada).
  const red = (await db.query(
    `SELECT a.id FROM assessments a JOIN periods p ON p.id = a.period_id
      WHERE a.risk_status IN ('RED','YELLOW') AND p.code < $1 ORDER BY p.code DESC, a.risk_score DESC LIMIT 1`,
    [current]
  )).rows[0];
  if (red) {
    await db.query(
      `UPDATE assessments SET review_status='ACTION_PLANNED', responsible_unit=$2, review_note=$3, reviewed_at=now() WHERE id=$1`,
      [red.id, 'Wakil Dekan Kemahasiswaan dan Layanan Konseling', 'Beban tugas dikaji ulang dan sesi dukungan sebaya ditambahkan.']
    );
  }
}
module.exports = { seedDemo };

if (require.main === module) {
  seedDemo()
    .then(() => console.log('Data demo dimuat. Seluruh data ini adalah ilustrasi.'))
    .then(() => db.pool.end())
    .catch((e) => { console.error('Seed demo gagal:', e); process.exit(1); });
}
