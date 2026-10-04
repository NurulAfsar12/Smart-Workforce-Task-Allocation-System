const app = require('./app');
const env = require('./config/env');
const db = require('./config/db');

async function start() {
  try {
    const ok = await db.healthCheck();
    if (!ok) throw new Error('health check returned unexpected result');
    console.log(`[db] connected to ${env.db.database} on ${env.db.host}:${env.db.port}`);
  } catch (err) {
    console.error(`[db] connection failed: ${err.message}`);
    console.error('     check your server/.env file and that PostgreSQL is running');
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`[api] Smart Workforce API listening on http://localhost:${env.port}`);
    console.log(`[api] health check: http://localhost:${env.port}/health`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await db.pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();