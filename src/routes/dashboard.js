'use strict';

const express = require('express');
const config = require('../config');
const data = require('../data');
const periodsLib = require('../lib/periods');
const { AssessmentService } = require('../lib/assessment');
const { round } = require('../lib/util');
const { back, intParam } = require('./util');

const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';

/**
 * Dashboard keseluruhan: seluruh universitas atau satu komunitas.
 * Semua angka dihitung otomatis dari check-in (tidak ada tombol hitung).
 */
router.get('/dashboard', async (req, res) => {
  const current = await data.periods.current(); // pastikan baris bulan berjalan ada
  const communities = await data.communities.active();
  const periods = await data.periods.list();

  const period = periods.find((p) => p.code === String(req.query.period || '')) || current;
  const isCurrent = period.code === periodsLib.currentCode();

  // Cakupan: seluruh universitas (default) atau satu komunitas.
  const wanted = intParam(req.query.community);
  const community = communities.find((c) => c.id === wanted) || null;

  const svc = new AssessmentService();

  // Penilaian komunitas yang belum ada dibuat otomatis; bulan berjalan selalu disegarkan.
  for (const c of communities) {
    const exists = await data.assessments.exists(period.id, c.id);
    if (!exists || (isCurrent && community && community.id === c.id)) await svc.run(period.id, c.id);
  }

  const ids = Object.keys(config.indicators);
  const chart = { labels: [], risk: [], indicators: Object.fromEntries(ids.map((id) => [id, []])) };
  let a;
  let rows = {};
  let history;
  let reasons;

  if (community) {
    a = await data.assessments.forPeriodCommunity(period.id, community.id);
    const prevPeriod = await data.periods.previousOf(period.code);
    const cur = await data.stats.forAssessment(period.id, community.id);
    const prev = prevPeriod ? await data.stats.forAssessment(prevPeriod.id, community.id) : {};
    for (const [id, meta] of Object.entries(config.indicators)) {
      const score = cur[id]?.community_score ?? null;
      const prevScore = prev[id]?.community_score ?? null;
      rows[id] = {
        ...meta, id, score,
        delta: score !== null && prevScore !== null ? round(Number(score) - Number(prevScore), 2) : null,
        count: cur[id]?.response_count ?? 0,
      };
    }

    const hist = await data.assessments.history(community.id);
    for (const h of hist) {
      chart.labels.push(periodsLib.label(h.period_code));
      chart.risk.push(h.risk_score !== null ? Number(h.risk_score) : null);
      const hs = await data.stats.forAssessment(h.period_id, community.id);
      for (const id of ids) chart.indicators[id].push(hs[id]?.community_score ?? null);
    }
    history = [...hist].reverse();
    reasons = a && Array.isArray(a.reasons) ? a.reasons : [];
  } else {
    const snap = await svc.overall(period);
    a = { ...snap, id: null, review_status: null, responsible_unit: null };
    for (const [id, meta] of Object.entries(config.indicators)) rows[id] = { ...meta, id, ...snap.indicators[id] };

    const hist = await svc.overallHistory();
    for (const h of hist) {
      chart.labels.push(periodsLib.label(h.period_code));
      chart.risk.push(h.risk_score);
      for (const id of ids) chart.indicators[id].push(h.indicators[id].score);
    }
    history = [...hist].reverse().map((h) => ({ ...h, id: null, review_status: null, responsible_unit: null }));
    reasons = snap.reasons;
  }

  res.page('dashboard/index', {
    title: 'Dashboard',
    communities, periods, community, period, isCurrent,
    assessment: a,
    indicators: rows,
    history,
    overview: await data.assessments.overview(period.id),
    chart,
    reasons,
    distribution: await data.checkins.statusCounts(period.id, community ? community.id : null),
  });
});

/** Konteks kalender akademik untuk satu periode (misalnya ujian, penerimaan mahasiswa baru). */
router.post('/dashboard/context', async (req, res) => {
  const id = intParam(req.body.period_id);
  const period = id ? await data.periods.find(id) : null;
  if (!period) return res.status(404).page('error', { title: 'Tidak ditemukan', code: 404, message: 'Periode tidak ditemukan.' });

  const text = String(req.body.calendar_context || '').trim();
  if (text.length > 255) {
    req.flash('error', 'Konteks kalender maksimal 255 karakter.');
    return back(req, res, '/dashboard');
  }
  await data.periods.setContext(id, text || null);
  req.flash('message', 'Konteks kalender disimpan.');
  back(req, res, '/dashboard');
});

/** Hanya di luar production. Menghapus seluruh data lalu mengisi data simulasi. */
router.post('/dashboard/demo', async (req, res) => {
  if (isProd) {
    req.flash('error', 'Data demo dinonaktifkan di production.');
    return back(req, res, '/dashboard');
  }
  await require('../../scripts/seed-demo').seedDemo();
  req.flash('message', 'Data demo dimuat. Seluruh data ini adalah ilustrasi.');
  res.redirect('/dashboard');
});

module.exports = router;
