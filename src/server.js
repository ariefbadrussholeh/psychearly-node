'use strict';

const app = require('./app');
const db = require('./db');

const port = parseInt(process.env.PORT || '3000', 10);
const server = app.listen(port, '0.0.0.0', () => console.log(`PSYCHEARLY berjalan di port ${port} (${process.env.NODE_ENV || 'development'})`));

function shutdown() {
  server.close(() => db.pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
