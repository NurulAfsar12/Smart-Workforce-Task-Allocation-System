const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const db = require('../config/db');

/**
 * Verifies the JWT and loads the fresh user row.
 * The user is re-read on every request so a deactivated account or a
 * changed role takes effect immediately instead of at token expiry.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token'
    );
  }

  const user = await db.queryOne(
    `SELECT u.user_id, u.email, u.full_name, u.role, u.employee_id, u.is_active
       FROM users u
      WHERE u.user_id = $1`,
    [payload.sub]
  );

  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.is_active) throw ApiError.forbidden('Account has been deactivated');

  req.user = user;
  next();
});

/** Restrict a route to the given roles. */
const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires one of the roles: ${roles.join(', ')}`));
    }
    return next();
  };

/** Any logged in user, but employees are limited to their own record. */
const resolveEmployeeScope = asyncHandler(async (req, res, next) => {
  if (req.user.role === 'ADMIN') {
    req.scopeEmployeeId = null; // full access
    return next();
  }
  if (!req.user.employee_id) throw ApiError.forbidden('Your account is not linked to an employee');
  req.scopeEmployeeId = req.user.employee_id;
  next();
});

module.exports = { authenticate, requireRole, resolveEmployeeScope };