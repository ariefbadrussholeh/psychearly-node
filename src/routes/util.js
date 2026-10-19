'use strict';

/** Kembali ke halaman sebelumnya (hanya jika Referer berasal dari host yang sama). */
function back(req, res, fallback = '/') {
  const ref = req.get('referer');
  if (ref) {
    try {
      const u = new URL(ref);
      if (u.host === req.get('host')) return res.redirect(u.pathname + u.search);
    } catch (_) { /* abaikan */ }
  }
  return res.redirect(fallback);
}

const intParam = (v) => (/^\d{1,9}$/.test(String(v)) ? parseInt(v, 10) : null);

const notFound = (res) =>
  res.status(404).page('error', { title: 'Tidak ditemukan', code: 404, message: 'Halaman yang kamu cari tidak ada.' });

module.exports = { back, intParam, notFound };
