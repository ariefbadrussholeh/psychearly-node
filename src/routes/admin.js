'use strict';

const express = require('express');

const router = express.Router();

// Semua halaman di bawah ini hanya untuk pengelola yang sudah masuk.
const PROTECTED = ['/dashboard', '/individuals', '/assessments', '/communities'];
router.use(PROTECTED, (req, res, next) => {
  if (req.session.userId) return next();
  if (req.method === 'GET') req.session.redirectAfterLogin = req.originalUrl;
  res.redirect('/login');
});

router.use(require('./dashboard'));
router.use(require('./individuals'));
router.use(require('./assessments'));
router.use(require('./communities'));

module.exports = router;
