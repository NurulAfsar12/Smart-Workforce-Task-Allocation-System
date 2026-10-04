const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const controller = require('../controllers/task.controller');

const router = express.Router();
router.use(authenticate);

const TASK_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];

// --- read ---
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.get('/:id/history', controller.getHistory);
router.get('/:id/logs', controller.listLogs);
router.get('/:id/candidates', controller.candidates);

// --- create / update / delete ---
router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    project_id: { required: true, type: 'int' },
    title: { required: true, type: 'string', maxLength: 200 },
    description: { type: 'string' },
    priority: { type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    estimated_hours: { required: true, type: 'number', min: 0.5, max: 1000 },
    deadline: { type: 'date' },
    auto_allocate: { type: 'boolean', default: false },
    required_skills: { type: 'array', default: [] },
  }),
  controller.create
);

router.put('/:id', requireRole('ADMIN'), controller.update);
router.delete('/:id', requireRole('ADMIN'), controller.remove);

// --- allocation ---
router.post('/:id/allocate', controller.allocate);
router.post(
  '/:id/assign',
  requireRole('ADMIN'),
  validate({ employee_id: { required: true, type: 'int' } }),
  controller.assignManually
);
router.post('/:id/release', requireRole('ADMIN'), controller.release);

// --- workflow ---
router.post(
  '/:id/transition',
  validate({ status: { required: true, type: 'enum', values: TASK_STATUSES } }),
  controller.transition
);

// --- required skills ---
router.put('/:id/skills', requireRole('ADMIN'), controller.setSkills);

// --- work logs ---
router.post(
  '/:id/logs',
  validate({
    hours_spent: { required: true, type: 'number', min: 0.25, max: 24 },
    log_date: { type: 'date' },
    work_description: { type: 'string', maxLength: 2000 },
    employee_id: { type: 'int' },
  }),
  controller.addLog
);
router.delete('/:id/logs/:logId', controller.deleteLog);

// --- comments ---
router.post(
  '/:id/comments',
  validate({ body: { required: true, type: 'string', minLength: 1, maxLength: 4000 } }),
  controller.addComment
);

module.exports = router;