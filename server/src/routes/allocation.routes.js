const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const controller = require('../controllers/allocation.controller');

const router = express.Router();
router.use(authenticate);

router.get('/pending', controller.pending);
router.get('/log', controller.log);
router.get('/preview/:taskId', controller.preview);
router.get('/explain/:taskId/:employeeId', controller.explain);
router.post('/run', requireRole('ADMIN'), controller.run);

module.exports = router;