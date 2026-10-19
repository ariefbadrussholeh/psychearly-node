'use strict';

require('dotenv').config({ quiet: true });
const { Pool, types } = require('pg');

// NUMERIC dan BIGINT dikembalikan sebagai angka JS (bukan string).
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

function sslOption(url) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
  // Default: SSL kecuali ke Postgres lokal.
  return /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(url || '') ? false : { rejectUnauthorized: false };
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL belum diisi. Salin .env.example ke .env lalu isi string koneksi Supabase.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: sslOption(url),
  max: parseInt(process.env.DB_POOL_MAX || '5', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (err) => console.error('Koneksi database idle error:', err.message));

/** Jalankan satu query. @returns {Promise<import('pg').QueryResult>} */
const query = (text, params) => pool.query(text, params);

/** Jalankan beberapa query dalam satu transaksi. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
