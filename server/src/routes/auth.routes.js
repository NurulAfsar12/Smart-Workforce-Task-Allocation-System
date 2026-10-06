const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/login',
  authLimiter,
  validate({
    email: { required: true, type: 'email' },
    // No length rule here: a wrong password must reach the auth service and
    // return 401, not be rejected as an invalid request shape.
    password: { required: true, type: 'string' },
  }),
  controller.login
);

router.post(
  '/register',
  requireRole('ADMIN'),
  // Creating a user is a privileged, infrequent action, so it shares the
  // credential-endpoint throttle.
  authLimiter,
  validate({
    email: { required: true, type: 'email' },
    password: { required: true, type: 'string', minLength: 8 },
    full_name: { required: true, type: 'string', maxLength: 120 },
    employee_id: { required: true, type: 'int' },
  }),
  controller.register
);

router.get('/me', authenticate, controller.me);

router.post(
  '/change-password',
  authenticate,
  validate({
    current_password: { required: true, type: 'string' },
    new_password: { required: true, type: 'string', minLength: 8 },
  }),
  controller.changePassword
);

module.exports = router;