const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');

/**
 * Applies every SQL script in order to a fresh database.
 *   node scripts/setupDatabase.js           create database if missing + apply scripts
 *   node scripts/setupDatabase.js --reset   drop the schema first, then apply
 */

const ROOT = path.join(__dirname, '..', '..', 'database');

const SCRIPTS = [
  'schema/01_enums.sql',
  'schema/02_tables.sql',
  'functions/03_functions.sql',
  'triggers/04_triggers.sql',
  'views/05_views.sql',
  'seed/06_seed_reference.sql',
  'seed/07_seed_people.sql',
  'seed/08_seed_projects.sql',
  'seed/09_seed_activity.sql',
];

async function ensureDatabase() {
  const admin = new Client({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: 'postgres',
  });

  await admin.connect();
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [env.db.database]);

  if (rows.length === 0) {
    console.log(`[setup] creating database "${env.db.database}"`);
    await admin.query(`CREATE DATABASE "${env.db.database}"`);
  } else {
    console.log(`[setup] database "${env.db.database}" already exists`);
  }
  await admin.end();
}

async function resetSchema(client) {
  console.log('[setup] dropping and recreating the public schema');
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
}

async function run() {
  const reset = process.argv.includes('--reset');

  await ensureDatabase();

  const client = new Client({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });
  await client.connect();

  try {
    if (reset) await resetSchema(client);

    for (const script of SCRIPTS) {
      const sql = fs.readFileSync(path.join(ROOT, script), 'utf8');
      process.stdout.write(`[setup] applying ${script} ... `);
      await client.query(sql);
      console.log('ok');
    }

    const { rows } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM employees)   AS employees,
        (SELECT COUNT(*) FROM skills)      AS skills,
        (SELECT COUNT(*) FROM projects)   AS projects,
        (SELECT COUNT(*) FROM tasks)      AS tasks,
        (SELECT COUNT(*) FROM task_assignments) AS assignments
    `);

    console.log('\n[setup] done.');
    console.log(`[setup] employees=${rows[0].employees} skills=${rows[0].skills} ` +
                `projects=${rows[0].projects} tasks=${rows[0].tasks} assignments=${rows[0].assignments}`);
    console.log('[setup] logins: admin@smartworkforce.com / Password123!');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('\n[setup] failed:', err.message);
  process.exit(1);
});