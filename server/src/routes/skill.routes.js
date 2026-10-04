const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const controller = require('../controllers/skill.controller');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getOne);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    name: { required: true, type: 'string', maxLength: 80 },
    category: {
      type: 'enum',
      values: ['LANGUAGE', 'FRAMEWORK', 'DATABASE', 'DEVOPS', 'DESIGN',
               'TESTING', 'ANALYTICS', 'SOFT_SKILL', 'OTHER'],
      default: 'OTHER',
    },
    description: { type: 'string' },
  }),
  controller.create
);

router.put('/:id', requireRole('ADMIN'), controller.update);
router.delete('/:id', requireRole('ADMIN'), controller.remove);

module.exports = router;