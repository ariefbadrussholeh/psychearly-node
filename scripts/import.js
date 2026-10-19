'use strict';
// npm run import -- data.csv [YYYY-MM]
const db = require('../src/db');
const { importCsv } = require('../src/lib/importer');
const periods = require('../src/lib/periods');

const [file, code] = process.argv.slice(2);
if (!file) { console.error('Pemakaian: npm run import -- <file.csv> [YYYY-MM]'); process.exit(1); }
importCsv(file, code || periods.currentCode())
  .then((r) => {
    console.log(`Baris dibaca: ${r.rows}, diimpor: ${r.imported}, NIM ganda dilewati: ${r.duplicates}, komunitas baru: ${r.communities_created}`);
    if (r.invalid.length) console.log('Baris tidak valid:\n  ' + r.invalid.join('\n  '));
  })
  .then(() => db.pool.end())
  .catch((e) => { console.error('Impor gagal:', e.message); process.exit(1); });
