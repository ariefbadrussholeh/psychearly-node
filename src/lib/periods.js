'use strict';

/**
 * Periode = bulan kalender (zona waktu aplikasi, default WIB). Tidak ada buka/tutup manual:
 * check-in hanya diterima untuk bulan berjalan, dan bulan yang sudah lewat otomatis tertutup.
 */
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const TZ = () => process.env.APP_TIMEZONE || 'Asia/Jakarta';
const pad = (n) => String(n).padStart(2, '0');
const CODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function parts(code) {
  const [y, m] = code.split('-').map(Number);
  return { y, m };
}

/** Kode bulan berjalan "YYYY-MM" menurut zona waktu aplikasi. */
function currentCode(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
}

/** Tanggal (hari ke-n) hari ini menurut zona waktu aplikasi. */
function currentDay(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), day: 'numeric' });
  return parseInt(f.format(date), 10);
}

function previousCode(code) {
  const { y, m } = parts(code);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

function nextCode(code) {
  const { y, m } = parts(code);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/** Hari terakhir dalam bulan itu (angka). */
function lastDay(code) {
  const { y, m } = parts(code);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "Oktober 2026" dari "2026-10". */
function label(code) {
  const { y, m } = parts(code);
  return `${MONTHS[m - 1] || code} ${y}`;
}

module.exports = { CODE_RE, currentCode, currentDay, previousCode, nextCode, lastDay, label };
