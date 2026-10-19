'use strict';

const config = require('../config');
const periodsLib = require('./periods');
const { numberFmt } = require('./util');

const escapeHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const statusMeta = (status) => config.statuses[status] || config.statuses.INSUFFICIENT_DATA;

module.exports = {
  cfg: config,
  periodLabel: periodsLib.label,
  statusMeta,

  /** HTML badge (aman: seluruh teks di-escape). Cetak dengan <%- %>. */
  statusBadge(status, withLabel = false) {
    const m = statusMeta(status);
    const text = status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT DATA' : status;
    let out = `<span class="pe-badge pe-badge--${m.badge}">${escapeHtml(text)}</span>`;
    if (withLabel) out += ` <span class="text-secondary small">${escapeHtml(m.label)}</span>`;
    return out;
  },

  trendLabel: (t) => ({ IMPROVING: 'Membaik', STABLE: 'Stabil', WORSENING: 'Memburuk', UNAVAILABLE: 'Belum tersedia' }[t] || t),
  trendIcon: (t) =>
    ({ IMPROVING: 'ph-arrow-down-right', STABLE: 'ph-arrow-right', WORSENING: 'ph-arrow-up-right', UNAVAILABLE: 'ph-minus' }[t] || 'ph-minus'),
  reviewLabel: (s) => ({ PENDING: 'Menunggu peninjauan', REVIEWED: 'Sudah ditinjau', ACTION_PLANNED: 'Tindakan direncanakan' }[s] || s),

  scoreFmt: (v) => (v === null || v === undefined || v === '' ? '–' : numberFmt(v, 2)),
  pctFmt: (v) => (v === null || v === undefined || v === '' ? '–' : `${numberFmt(Number(v) * 100, 0)}%`),
  numberFmt,

  /** Waktu tampil menurut zona waktu aplikasi: "YYYY-MM-DD HH:mm". */
  dateTime(v) {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.APP_TIMEZONE || 'Asia/Jakarta',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  },

  /** JSON aman untuk disisipkan di <script>. */
  jsonForScript: (v) =>
    JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),

  ucfirstLower: (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase(),
};
