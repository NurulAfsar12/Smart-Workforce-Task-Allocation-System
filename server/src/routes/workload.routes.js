const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/workload.controller');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.employees);
router.get('/heatmap', controller.heatmap);
router.get('/distribution', controller.distribution);
router.get('/:employeeId', controller.employee);

module.exports = router;