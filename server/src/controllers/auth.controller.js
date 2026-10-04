const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const session = await authService.login({
    email: req.body.email,
    password: req.body.password,
  });
  res.json({ success: true, ...session });
});

/** POST /api/auth/register - creates the login of an existing employee */
const register = asyncHandler(async (req, res) => {
  const session = await authService.registerEmployee(req.body);
  res.status(201).json({ success: true, ...session });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  // buildUser() (not the raw req.user row) so this returns the same shape as
  // /auth/login - the client reads user.employee.employee_id from both.
  res.json({ success: true, user: await authService.buildUser(req.user) });
});

/** POST /api/auth/change-password */
const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword({
    user_id: req.user.user_id,
    current_password: req.body.current_password,
    new_password: req.body.new_password,
  });
  res.json({ success: true, ...result });
});

module.exports = { login, register, me, changePassword };