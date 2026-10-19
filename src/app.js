'use strict';

require('dotenv').config({ quiet: true });
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const helmet = require('helmet');

const db = require('./db');
const helpers = require('./lib/view-helpers');

const isProd = process.env.NODE_ENV === 'production';
const VIEWS = path.join(__dirname, 'views');

function createApp() {
  if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24)) {
    throw new Error('SESSION_SECRET wajib diisi (minimal 24 karakter) di production.');
  }

  const app = express();
  app.disable('x-powered-by');
  // Di belakang proxy hosting (Render, Railway, Koyeb, nginx): IP klien dan cookie aman bergantung pada ini.
  app.set('trust proxy', process.env.TRUST_PROXY === undefined ? (isProd ? 1 : false) : Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY === 'true');
  app.set('view engine', 'ejs');
  app.set('views', VIEWS);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://unpkg.com', 'data:'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets'), { maxAge: isProd ? '7d' : 0 }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, maxAge: isProd ? '7d' : 0 }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  app.use(
    session({
      store: new PgStore({ pool: db.pool, tableName: 'session', createTableIfMissing: false }),
      secret: process.env.SESSION_SECRET || 'dev-only-secret',
      name: 'psy.sid',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: isProd ? 'auto' : false, maxAge: 8 * 60 * 60 * 1000 },
    })
  );

  // Variabel bersama untuk semua view + flash + token CSRF.
  app.use((req, res, next) => {
    Object.assign(res.locals, helpers);
    res.locals.isProd = isProd;
    res.locals.logged = Boolean(req.session.userId);
    res.locals.userName = req.session.userName || '';
    res.locals.navPath = req.path.split('/')[1] || '';

    res.locals.flash = req.session.flash || {};
    const oldInput = req.session.old || {};
    res.locals.hasOld = Object.keys(oldInput).length > 0;
    res.locals.oldInput = oldInput;
    res.locals.old = (key, fallback = '') => (oldInput[key] !== undefined ? oldInput[key] : fallback);
    if (req.session.flash) delete req.session.flash;
    if (req.session.old) delete req.session.old;

    if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
    const token = req.session.csrf;
    res.locals.csrfField = () => `<input type="hidden" name="_csrf" value="${token}">`;

    req.flash = (type, value) => {
      req.session.flash = { ...(req.session.flash || {}), [type]: value };
    };
    req.keepOld = () => {
      req.session.old = { ...req.body };
    };
    next();
  });

  // Perlindungan CSRF untuk semua permintaan yang mengubah data.
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const sent = Buffer.from(String(req.body?._csrf || ''));
    const real = Buffer.from(String(req.session.csrf || ''));
    if (sent.length !== real.length || !crypto.timingSafeEqual(sent, real)) {
      return res.status(403).page('error', { title: 'Ditolak', code: 403, message: 'Token keamanan tidak valid atau kedaluwarsa. Muat ulang halaman lalu coba lagi.' });
    }
    next();
  });

  // res.page(view, data): render view lalu bungkus dengan layout. Skrip halaman ada di <view>-scripts.ejs
  // (nama tanpa titik: Express menganggap ".scripts" sebagai ekstensi/mesin view).
  express.response.page = function page(view, data = {}) {
    const res = this;
    const fail = (e) => res.req.next(e);
    try {
      const scriptsView = `${view}-scripts`;
      const hasScripts = fs.existsSync(path.join(VIEWS, `${scriptsView}.ejs`));
      res.render(view, data, (err, body) => {
        if (err) return fail(err);
        const finish = (scripts) =>
          res.render('layouts/main', { title: data.title || 'PSYCHEARLY', body, scripts }, (e2, html) => (e2 ? fail(e2) : res.send(html)));
        if (!hasScripts) return finish('');
        res.render(scriptsView, data, (e3, scripts) => (e3 ? fail(e3) : finish(scripts)));
      });
    } catch (e) {
      fail(e);
    }
  };

  app.use(require('./routes/public'));
  app.use(require('./routes/auth'));
  app.use(require('./routes/admin'));

  app.use((req, res) => res.status(404).page('error', { title: 'Tidak ditemukan', code: 404, message: 'Halaman yang kamu cari tidak ada.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return;
    if (req.errorRendered) return res.status(500).type('text').send('Terjadi kesalahan di server.');
    req.errorRendered = true;
    res.status(500).page('error', {
      title: 'Terjadi kesalahan',
      code: 500,
      message: isProd ? 'Terjadi kesalahan di server. Coba lagi sebentar lagi.' : String(err.stack || err),
    });
  });

  return app;
}

module.exports = { createApp };
