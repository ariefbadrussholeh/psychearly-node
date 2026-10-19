'use strict';

const express = require('express');
const config = require('../config');
const data = require('../data');
const periodsLib = require('../lib/periods');
const { IndividualClassifier } = require('../lib/individual');
const { round } = require('../lib/util');
const { intParam, notFound } = require('./util');

const router = express.Router();
const PER_PAGE = 25;

/** Menu Individu: status check-in per mahasiswa (NIM). Hanya untuk pengelola yang login. */
router.get('/individuals', async (req, res) => {
  const cls = new IndividualClassifier(config);
  await data.periods.current();
  const periods = await data.periods.list();
  const period = periods.find((p) => p.code === String(req.query.period || '')) || (await data.periods.current());

  const communityId = intParam(req.query.community) || 0;
  const status = ['GREEN', 'YELLOW', 'RED'].includes(req.query.status) ? req.query.status : '';
  const q = String(req.query.q || '').trim().slice(0, 100);
  let page = Math.max(1, intParam(req.query.page) || 1);

  const prevPeriod = await data.periods.previousOf(period.code);
  const countAll = await data.checkins.listIndividuals({ periodId: period.id, communityId, status, q, limit: 0, offset: 0 });
  const total = countAll.total;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  page = Math.min(page, pages);

  const { rows: raw } = await data.checkins.listIndividuals({
    periodId: period.id, prevPeriodId: prevPeriod?.id, communityId, status, q, limit: PER_PAGE, offset: (page - 1) * PER_PAGE,
  });

  const rows = raw.map((r) => {
    const sum = Number(r.risk_sum);
    const prev = r.prev_sum !== null && r.prev_sum !== undefined ? Number(r.prev_sum) : null;
    return {
      ...r,
      score: cls.score(sum),
      status: cls.classify(sum),
      trend: cls.trend(sum, prev),
      delta: prev !== null ? round((sum - prev) / 6, 2) : null,
    };
  });

  res.page('individuals/index', {
    title: 'Individu',
    periods, period,
    communities: await data.communities.active(),
    communityId, status, q, rows, total, page, pages, perPage: PER_PAGE,
    distribution: await data.checkins.statusCounts(period.id, communityId || null),
    hasPrev: Boolean(prevPeriod),
  });
});

router.get('/individuals/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const student = id ? await data.students.withCommunity(id) : null;
  if (!student) return notFound(res);

  const cls = new IndividualClassifier(config);
  const rows = await data.checkins.forStudent(id);
  const byCode = Object.fromEntries(rows.map((r) => [r.period_code, r]));

  // Riwayat kronologis dengan perbandingan terhadap bulan kalender sebelumnya (bila ada check-in-nya).
  const history = rows.map((r) => {
    const sum = cls.sum(r);
    const prevRow = byCode[periodsLib.previousCode(r.period_code)] || null;
    const prevSum = prevRow ? cls.sum(prevRow) : null;
    return {
      period_code: r.period_code,
      calendar_context: r.calendar_context,
      sum,
      score: cls.score(sum),
      status: cls.classify(sum),
      trend: cls.trend(sum, prevSum),
      indicators: cls.indicators(r),
      prev_indicators: prevRow ? cls.indicators(prevRow) : null,
      submitted_at: r.submitted_at,
    };
  });

  const wanted = String(req.query.period || '');
  const selected = history.find((h) => h.period_code === wanted) || history[history.length - 1] || null;

  res.page('individuals/show', {
    title: student.name || student.nim,
    student,
    history: [...history].reverse(),
    selected,
    chart: { labels: history.map((h) => periodsLib.label(h.period_code)), risk: history.map((h) => h.score) },
  });
});

module.exports = router;
