'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const data = require('../data');
const { back } = require('./util');

const router = express.Router();
// Hash tiruan agar waktu respons sama untuk email yang tidak ada.
const DUMMY_HASH = bcrypt.hashSync('tidak-dipakai', 12);

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Terlalu banyak percobaan. Coba lagi sebentar lagi.');
    back(req, res, '/login');
  },
});

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.page('auth/login', { title: 'Masuk' });
});

router.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 190 || !password || password.length > 200) {
    req.keepOld();
    req.flash('error', 'Email atau kata sandi tidak valid.');
    return back(req, res, '/login');
  }

  const user = await data.users.findByEmail(email);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !ok) {
    req.keepOld();
    req.flash('error', 'Email atau kata sandi salah.');
    return back(req, res, '/login');
  }

  // Hanya path internal yang boleh jadi tujuan setelah masuk.
  const wanted = req.session.redirectAfterLogin;
  const target = typeof wanted === 'string' && /^\/(?!\/)/.test(wanted) ? wanted : '/dashboard';
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.save((e2) => {
      if (e2) throw e2;
      res.redirect(target);
    });
  });
});

router.post('/logout', (req, res) => {
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.flash = { message: 'Kamu sudah keluar.' };
    req.session.save(() => res.redirect('/login'));
  });
});

module.exports = router;
