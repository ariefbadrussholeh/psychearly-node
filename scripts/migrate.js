'use strict';
// Menjalankan semua file di supabase/migrations/*.sql yang belum pernah dijalankan.
// Alternatif: tempel isi file SQL ke Supabase Dashboard > SQL Editor.
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

(async () => {
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  await db.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    console.log('Menjalankan', f);
    await db.tx(async (c) => {
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    });
    n++;
  }
  console.log(n ? `Selesai: ${n} migrasi dijalankan.` : 'Database sudah up to date.');
  await db.pool.end();
})().catch((e) => { console.error('Migrasi gagal:', e.message); process.exit(1); });
