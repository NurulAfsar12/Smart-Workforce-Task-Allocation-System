const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/departments', require('./department.routes'));
router.use('/skills', require('./skill.routes'));
router.use('/employees', require('./employee.routes'));
router.use('/projects', require('./project.routes'));
router.use('/tasks', require('./task.routes'));
router.use('/allocation', require('./allocation.routes'));
router.use('/workload', require('./workload.routes'));
router.use('/reports', require('./report.routes'));

module.exports = router;