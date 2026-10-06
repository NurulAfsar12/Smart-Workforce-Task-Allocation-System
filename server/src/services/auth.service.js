const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * The canonical user object sent to the client.
 * Both /auth/login and /auth/me must return this exact shape, otherwise the
 * client loses the nested `employee` object it reads employee_id from.
 */
async function buildUser(user) {
  const employee = user.employee_id
    ? await db.queryOne(
        `SELECT e.employee_id, e.employee_code, e.job_title, e.department_id, d.name AS department_name
           FROM employees e
           JOIN departments d ON d.department_id = e.department_id
          WHERE e.employee_id = $1`,
        [user.employee_id]
      )
    : null;

  return {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    employee,
  };
}

/** Shape returned to the client after a successful login. */
async function buildSession(user) {
  const token = jwt.sign(
    { sub: user.user_id, role: user.role, email: user.email },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  return { token, user: await buildUser(user) };
}

/**
 * A genuine bcrypt hash of a value nobody knows, used purely to equalise
 * response time when the submitted email does not exist.
 *
 * This MUST be a syntactically valid bcrypt hash. An earlier placeholder
 * string was not valid, so bcrypt.compare short-circuited in ~0.1 ms against
 * ~147 ms for a real hash - a 626x gap that made registered emails
 * enumerable by timing despite the intended mitigation.
 */
const DUMMY_HASH = '$2a$10$woPEglzJb9CH2Pn8RFtgK.x985sEZ56hwHzC.h2CI7dhCLTlNgAoy';

async function login({ email, password }) {
  const user = await db.queryOne(
    `SELECT user_id, email, password_hash, full_name, role, employee_id, is_active
       FROM users
      WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  // Always run a bcrypt comparison, even for an unknown email, so the
  // response time does not reveal whether the address is registered.
  const hash = user?.password_hash || DUMMY_HASH;
  const matches = await bcrypt.compare(password, hash);

  if (!user || !matches) throw ApiError.unauthorized('Invalid email or password');
  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated');

  await db.query('UPDATE users SET last_login_at = NOW() WHERE user_id = $1', [user.user_id]);

  return buildSession(user);
}

async function registerEmployee({ email, password, full_name, employee_id }) {
  const existing = await db.queryOne('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing) throw ApiError.conflict('A user with this email already exists');

  const password_hash = await bcrypt.hash(password, 10);
  const user = await db.queryOne(
    `INSERT INTO users (email, password_hash, full_name, role, employee_id)
     VALUES ($1, $2, $3, 'EMPLOYEE', $4)
     RETURNING user_id, email, full_name, role, employee_id, is_active`,
    [email, password_hash, full_name, employee_id]
  );
  return buildSession(user);
}

async function changePassword({ user_id, current_password, new_password }) {
  const user = await db.queryOne('SELECT password_hash FROM users WHERE user_id = $1', [user_id]);
  if (!user) throw ApiError.notFound('User not found');

  const matches = await bcrypt.compare(current_password, user.password_hash);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  const hash = await bcrypt.hash(new_password, 10);
  await db.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, user_id]);

  return { success: true, message: 'Password updated' };
}

module.exports = { login, registerEmployee, changePassword, buildSession, buildUser };