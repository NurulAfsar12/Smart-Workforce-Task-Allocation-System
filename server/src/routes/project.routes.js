const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const controller = require('../controllers/project.controller');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.get('/:id/tasks', controller.listTasks);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    name: { required: true, type: 'string', maxLength: 150 },
    code: { type: 'string', maxLength: 20 },
    department_id: { required: true, type: 'int' },
    lead_id: { type: 'int' },
    description: { type: 'string' },
    start_date: { type: 'date' },
    end_date: { type: 'date' },
    budget_hours: { type: 'number', min: 0, default: 0 },
    status: { type: 'enum', values: ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'], default: 'PLANNED' },
  }),
  controller.create
);

router.put('/:id', requireRole('ADMIN'), controller.update);
router.delete('/:id', requireRole('ADMIN'), controller.remove);

module.exports = router;