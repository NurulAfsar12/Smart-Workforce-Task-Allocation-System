const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/report.controller');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', controller.dashboard);
router.get('/workload', controller.workload);
router.get('/projects', controller.projects);
router.get('/skills', controller.skills);
router.get('/performance', controller.performance);
router.get('/deadline-risk', controller.deadlineRisk);
router.get('/allocation-log', controller.allocationLog);
router.get('/effort', controller.effort);

module.exports = router;