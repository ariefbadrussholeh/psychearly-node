'use strict';

const express = require('express');
const data = require('../data');
const { AssessmentService } = require('../lib/assessment');
const { back, intParam, notFound } = require('./util');

const router = express.Router();

async function validate(body, id = 0) {
  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  const invitedRaw = String(body.invited_count ?? '').trim();
  const errors = [];

  if (!/^[A-Z0-9_-]{1,40}$/.test(code)) errors.push('Kode wajib diisi (huruf, angka, - atau _, maksimal 40 karakter).');
  else if (await data.communities.codeTaken(code, id)) errors.push('Kode sudah dipakai komunitas lain.');
  if (!name || name.length > 160) errors.push('Nama wajib diisi (maksimal 160 karakter).');
  if (!/^\d{1,9}$/.test(invitedRaw)) errors.push('Jumlah yang diundang harus bilangan bulat 0 atau lebih.');

  return {
    errors,
    payload: { code, name, invited_count: parseInt(invitedRaw, 10) || 0, is_active: Boolean(body.is_active) },
  };
}

router.get('/communities', async (req, res) => res.page('communities/index', { title: 'Komunitas', items: await data.communities.list() }));

router.get('/communities/new', (req, res) => res.page('communities/form', { title: 'Komunitas baru', item: null }));

router.post('/communities', async (req, res) => {
  const { errors, payload } = await validate(req.body);
  if (errors.length) {
    req.keepOld();
    req.flash('errors', errors);
    return back(req, res, '/communities/new');
  }
  await data.communities.create(payload);
  req.flash('message', 'Komunitas ditambahkan.');
  res.redirect('/communities');
});

router.get('/communities/:id/edit', async (req, res) => {
  const id = intParam(req.params.id);
  const item = id ? await data.communities.find(id) : null;
  if (!item) return notFound(res);
  res.page('communities/form', { title: 'Ubah komunitas', item });
});

router.post('/communities/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const item = id ? await data.communities.find(id) : null;
  if (!item) return notFound(res);

  const { errors, payload } = await validate(req.body, id);
  if (errors.length) {
    req.keepOld();
    req.flash('errors', errors);
    return back(req, res, `/communities/${id}/edit`);
  }
  await data.communities.update(id, payload);

  // Jumlah yang diundang memengaruhi partisipasi: segarkan penilaian bulan berjalan.
  const period = await data.periods.current();
  await new AssessmentService().run(period.id, id);

  req.flash('message', 'Komunitas diperbarui.');
  res.redirect('/communities');
});

module.exports = router;
