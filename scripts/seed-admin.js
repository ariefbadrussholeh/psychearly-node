'use strict';
// Membuat akun pengelola awal dari ADMIN_EMAIL / ADMIN_PASSWORD (tidak menimpa bila sudah ada).
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const data = require('../src/data');

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@psychearly.test').trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || 'Psychearly#2026';
  if (await data.users.findByEmail(email)) return { created: false, email };
  await data.users.create({ name: 'Pengelola Kemahasiswaan', email, password_hash: await bcrypt.hash(pass, 12) });
  return { created: true, email };
}
module.exports = { ensureAdmin };

if (require.main === module) {
  ensureAdmin()
    .then((r) => console.log(r.created ? `Akun pengelola dibuat: ${r.email}` : `Akun ${r.email} sudah ada.`))
    .then(() => db.pool.end())
    .catch((e) => { console.error(e.message); process.exit(1); });
}
