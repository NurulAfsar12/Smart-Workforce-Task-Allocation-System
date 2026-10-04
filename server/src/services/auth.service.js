const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/** Shape returned to the client after a successful login. */
async function buildSession(user) {
  const employee = user.employee_id
    ? await db.queryOne(
        `SELECT e.employee_id, e.employee_code, e.job_title, e.department_id, d.name AS department_name
           FROM employees e
           JOIN departments d ON d.department_id = e.department_id
          WHERE e.employee_id = $1`,
        [user.employee_id]
      )
    : null;

  const token = jwt.sign(
    { sub: user.user_id, role: user.role, email: user.email },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  return {
    token,
    user: {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      employee,
    },
  };
}

async function login({ email, password }) {
  const user = await db.queryOne(
    `SELECT user_id, email, password_hash, full_name, role, employee_id, is_active
       FROM users
      WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  // Compare against a dummy hash when the user does not exist so the
  // response time does not reveal whether the email is registered.
  const hash = user?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
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

module.exports = { login, registerEmployee, changePassword, buildSession };