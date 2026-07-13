const express = require('express');
const { listPresentingProblems } = require('../controllers/presentingProblemsController');

const router = express.Router();

router.get('/', listPresentingProblems);

module.exports = router;
