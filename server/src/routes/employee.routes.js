const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const controller = require('../controllers/employee.controller');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.get('/:id/tasks', controller.listTasks);

// --- skills of an employee ---
router.get('/:id/skills', controller.listSkills);
router.post(
  '/:id/skills',
  requireRole('ADMIN'),
  validate({
    skill_id: { required: true, type: 'int' },
    proficiency_level: { type: 'number', min: 1, max: 5, default: 3 },
    years_experience: { type: 'number', min: 0, max: 50, default: 0 },
    is_primary: { type: 'boolean', default: false },
    last_used_on: { type: 'date' },
  }),
  controller.addSkill
);
router.delete('/:id/skills/:skillId', requireRole('ADMIN'), controller.removeSkill);

// --- availability ---
router.get('/:id/availability', controller.listAvailability);
router.post(
  '/:id/availability',
  requireRole('ADMIN'),
  validate({
    date_from: { required: true, type: 'date' },
    date_to: { required: true, type: 'date' },
    status: { type: 'enum', values: ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'], default: 'AVAILABLE' },
    available_hours: { type: 'number', min: 0, max: 80, default: 0 },
    reason: { type: 'string', maxLength: 200 },
  }),
  controller.addAvailability
);
router.delete('/:id/availability/:availabilityId', requireRole('ADMIN'), controller.removeAvailability);

// --- create / update / delete ---
router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    employee_code: { required: true, type: 'string', maxLength: 20 },
    first_name: { required: true, type: 'string', maxLength: 60 },
    last_name: { required: true, type: 'string', maxLength: 60 },
    email: { required: true, type: 'email' },
    phone: { type: 'string', maxLength: 25 },
    job_title: { type: 'string', maxLength: 100 },
    department_id: { required: true, type: 'int' },
    manager_id: { type: 'int' },
    hire_date: { type: 'date' },
    employment_status: { type: 'enum', values: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'INACTIVE'], default: 'ACTIVE' },
    weekly_capacity_hours: { type: 'number', min: 1, max: 80, default: 40 },
    is_available: { type: 'boolean', default: true },
    avatar_url: { type: 'string' },
  }),
  controller.create
);

router.put('/:id', requireRole('ADMIN'), controller.update);
router.delete('/:id', requireRole('ADMIN'), controller.remove);

module.exports = router;