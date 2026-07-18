const express = require('express');
const authenticate = require('../middleware/authenticate');
const userController = require('../controllers/userController');

const router = express.Router();
router.use(authenticate);
router.get('/me/history-summary', userController.getHistorySummary);

module.exports = router;
