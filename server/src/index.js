const app = require('./app');
const env = require('./config/env');
const db = require('./config/db');

/**
 * Refuse to start with an obviously unsafe configuration.
 *
 * A published placeholder secret lets anyone who has read the repository
 * forge an administrator token, so this is a hard failure in production and
 * a loud warning everywhere else (a developer should not be blocked from
 * running locally, but must be told).
 */
function assertSecureConfig() {
  const problems = [];
  const secret = env.jwt.secret || '';
  const weakSecrets = [
    'development_only_secret',
    'change_this_to_a_long_random_string',
    'secret',
    'password',
    'jwt_secret',
  ];

  if (secret.length < 32) problems.push('JWT_SECRET is shorter than 32 characters');
  if (weakSecrets.includes(secret.toLowerCase())) problems.push('JWT_SECRET is a known placeholder value');
  if (!/^[0-9a-f]{64,}$/i.test(secret) && secret.length < 64) {
    // Not fatal, but a hexadecimal random string is the recommended form.
    problems.push('JWT_SECRET does not look like a hex random string (generate with crypto.randomBytes)');
  }
  if (env.env === 'production' && env.db.user === 'postgres') {
    problems.push('the application is connecting as the postgres superuser');
  }

  if (problems.length) {
    const banner = `  ${problems.length} security configuration problem(s):\n` +
      problems.map((p) => `    - ${p}`).join('\n');
    if (env.env === 'production') {
      console.error(`[security] refusing to start in production:\n${banner}`);
      process.exit(1);
    }
    console.warn(`[security] WARNING: insecure configuration detected\n${banner}`);
  }
}

async function start() {
  assertSecureConfig();

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