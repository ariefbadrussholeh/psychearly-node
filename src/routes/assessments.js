'use strict';

const express = require('express');
const data = require('../data');
const { back, intParam, notFound } = require('./util');

const router = express.Router();

/** Detail penilaian komunitas dan alur peninjauan manusia. */
router.get('/assessments/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const assessment = id ? await data.assessments.find(id) : null;
  if (!assessment) return notFound(res);

  res.page('assessments/show', {
    title: 'Peninjauan',
    assessment,
    community: await data.communities.find(assessment.community_id),
    period: await data.periods.find(assessment.period_id),
    stats: await data.stats.forAssessment(assessment.period_id, assessment.community_id),
    reasons: Array.isArray(assessment.reasons) ? assessment.reasons : [],
  });
});

router.post('/assessments/:id/review', async (req, res) => {
  const id = intParam(req.params.id);
  const assessment = id ? await data.assessments.find(id) : null;
  if (!assessment) return notFound(res);

  const status = String(req.body.review_status || '');
  const unit = String(req.body.responsible_unit || '').trim();
  const note = String(req.body.review_note || '').trim();
  const errors = [];
  if (!['PENDING', 'REVIEWED', 'ACTION_PLANNED'].includes(status)) errors.push('Status peninjauan tidak valid.');
  if (unit.length > 160) errors.push('Unit penanggung jawab maksimal 160 karakter.');
  if (note.length > 2000) errors.push('Catatan maksimal 2000 karakter.');
  if (errors.length) {
    req.keepOld();
    req.flash('errors', errors);
    return back(req, res, `/assessments/${id}`);
  }

  await data.assessments.updateReview(id, {
    review_status: status,
    responsible_unit: unit || null,
    review_note: note || null,
    reviewed_by: status === 'PENDING' ? null : req.session.userId,
    reviewed_at: status === 'PENDING' ? null : new Date(),
  });
  req.flash('message', 'Peninjauan disimpan.');
  back(req, res, `/assessments/${id}`);
});

module.exports = router;
