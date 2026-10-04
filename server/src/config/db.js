const { Pool } = require('pg');
const env = require('./env');

// NUMERIC comes back as a string by default in node-postgres, which would
// make every arithmetic operation in JavaScript wrong. This parser keeps
// numeric / bigint columns as JavaScript numbers.
const { types } = require('pg');
types.setTypeParser(types.builtins.NUMERIC, (value) => (value === null ? null : parseFloat(value)));
types.setTypeParser(types.builtins.INT8, (value) => (value === null ? null : parseInt(value, 10)));

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

/**
 * Parameterised query helper.
 * All SQL in this project uses $1, $2 placeholders, never string
 * concatenation, so user input can never be interpreted as SQL.
 */
async function query(text, params = []) {
  const started = Date.now();
  const result = await pool.query(text, params);
  const ms = Date.now() - started;
  if (ms > 300) console.warn(`[db] slow query ${ms}ms: ${text.slice(0, 80)}...`);
  return result;
}

const queryOne = async (text, params = []) => (await query(text, params)).rows[0] || null;

const queryMany = async (text, params = []) => (await query(text, params)).rows;

/**
 * Run a callback inside a transaction. Everything inside is committed
 * together or rolled back together - used by the allocation endpoints so a
 * failed allocation can never leave a half updated task behind.
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  const row = await queryOne('SELECT 1 AS ok');
  return row?.ok === 1;
}

module.exports = { pool, query, queryOne, queryMany, transaction, healthCheck };