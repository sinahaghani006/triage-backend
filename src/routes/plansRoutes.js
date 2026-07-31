const express = require('express');
const plansController = require('../controllers/plansController');

const router = express.Router();
router.get('/', plansController.listPlans);

module.exports = router;