const rateLimit = require('express-rate-limit');

/**
 * Brute-force protection for credential endpoints.
 *
 * skipSuccessfulRequests is deliberately on: only FAILED attempts count
 * towards the limit. A legitimate user (or the automated test suite, which
 * logs in several times) is never penalised, while an attacker guessing
 * passwords exhausts the budget quickly.
 *
 * keyGenerator uses the client IP. The default implementation is kept because
 * it already handles IPv6 correctly.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many failed sign-in attempts. Please try again in 15 minutes.',
  },
});

/**
 * A broad ceiling on API traffic, so a single client cannot exhaust the
 * 10-connection database pool or the Node event loop. Deliberately generous:
 * this is a denial-of-speed-bump, not a quota.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please slow down.' },
});

module.exports = { authLimiter, apiLimiter };