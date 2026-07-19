const express = require('express');
const authenticate = require('../middleware/authenticate');
const userController = require('../controllers/userController');
const validateRequest = require('../middleware/validateRequest');
const { updateMedicalHistoryValidator } = require('../middleware/validators/medicalHistoryValidators');
const { createVitalValidator } = require('../middleware/validators/vitalsValidators');

const router = express.Router();
router.use(authenticate);
router.get('/me/history-summary', userController.getHistorySummary);
router.get('/me/medical-history', userController.getMedicalHistory);
router.put('/me/medical-history', updateMedicalHistoryValidator, validateRequest, userController.updateMedicalHistory);
router.post('/me/vitals', createVitalValidator, validateRequest, userController.createVital);
router.get('/me/vitals', userController.listVitals);

module.exports = router;
