const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const controller = require('../controllers/department.controller');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getOne);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    code: { required: true, type: 'string', maxLength: 10 },
    name: { required: true, type: 'string', maxLength: 120 },
    description: { type: 'string' },
    budget_hours: { type: 'number', min: 0, default: 0 },
  }),
  controller.create
);

router.put('/:id', requireRole('ADMIN'), controller.update);
router.delete('/:id', requireRole('ADMIN'), controller.remove);

module.exports = router;