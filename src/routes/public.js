'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const data = require('../data');
const periodsLib = require('../lib/periods');
const { AssessmentService } = require('../lib/assessment');
const { back } = require('./util');

const router = express.Router();

router.get('/', (req, res) => res.page('home', { title: 'Peringatan dini kesejahteraan komunitas' }));

router.get('/checkin', async (req, res) => {
  const code = periodsLib.currentCode();
  res.page('checkin/form', {
    title: 'Check-in bulanan',
    periodCode: code,
    lastDay: periodsLib.lastDay(code),
    communities: await data.communities.active(),
  });
});

// Pembatas laju longgar (kampus sering berbagi satu IP): menghambat percobaan massal, bukan mahasiswa biasa.
const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Terlalu banyak percobaan dari jaringan ini. Coba lagi sebentar lagi.');
    back(req, res, '/checkin');
  },
});

router.post('/checkin', submitLimiter, async (req, res) => {
  const period = await data.periods.current();
  const b = req.body;

  const valid =
    /^[0-9A-Za-z\s]{5,24}$/.test(String(b.nim || '')) &&
    /^[1-9]\d{0,9}$/.test(String(b.community_id || '')) &&
    Boolean(b.consent) &&
    ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'].every((f) => /^[0-4]$/.test(String(b[f] ?? '')));
  if (!valid) {
    req.keepOld();
    req.flash('error', 'Lengkapi NIM, fakultas, semua pertanyaan, dan persetujuan.');
    return back(req, res, '/checkin');
  }

  const nim = data.students.normalizeNim(b.nim);
  if (!/^[0-9A-Z]{5,20}$/.test(nim)) {
    req.keepOld();
    req.flash('error', 'Format NIM tidak valid.');
    return back(req, res, '/checkin');
  }

  let student = await data.students.findByNim(nim);
  if (!student) {
    const community = await data.communities.findActive(parseInt(b.community_id, 10));
    if (!community) {
      req.keepOld();
      req.flash('error', 'Kelompok tidak valid.');
      return back(req, res, '/checkin');
    }
    try {
      student = await data.students.create({ nim, name: null, community_id: community.id });
    } catch (e) {
      if (e.code !== '23505') throw e; // permintaan bersamaan sudah membuatnya
      student = await data.students.findByNim(nim);
    }
  }

  const alreadyMsg = () => {
    const next = periodsLib.nextCode(period.code);
    return `NIM ${nim} sudah mengisi check-in ${periodsLib.label(period.code)}. Check-in berikutnya bisa diisi mulai 1 ${periodsLib.label(next)}.`;
  };

  // Satu NIM, satu check-in per periode.
  if (await data.checkins.exists(period.id, student.id)) {
    req.keepOld();
    req.flash('error', alreadyMsg());
    return back(req, res, '/checkin');
  }

  try {
    await data.checkins.insert({
      period_id: period.id,
      student_id: student.id,
      community_id: student.community_id,
      i1: +b.i1, i2: +b.i2, i3: +b.i3, i4: +b.i4, i5: +b.i5, i6: +b.i6,
      consent: true,
    });
  } catch (e) {
    if (e.code !== '23505') throw e;
    // Dua pengiriman bersamaan dengan NIM yang sama: UNIQUE(period_id, student_id) menolak yang kedua.
    req.keepOld();
    req.flash('error', `NIM ${nim} sudah mengisi check-in bulan ini.`);
    return back(req, res, '/checkin');
  }

  // Realtime: penilaian komunitas diperbarui seketika. Kegagalan hitung tidak boleh
  // menggagalkan pengiriman mahasiswa; dashboard menghitung ulang saat dibuka.
  try {
    await new AssessmentService().run(period.id, student.community_id);
  } catch (e) {
    console.error('Penilaian otomatis gagal:', e.message);
  }

  res.redirect('/checkin/terima-kasih');
});

router.get('/checkin/terima-kasih', (req, res) => res.page('checkin/thanks', { title: 'Terima kasih' }));

module.exports = router;
