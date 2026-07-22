const express = require('express');
const sessionsController = require('../controllers/sessionsController');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const validateRequest = require('../middleware/validateRequest');
const {
  sessionIdParamValidator,
  createSessionValidator,
  submitSymptomsValidator,
} = require('../middleware/validators/sessionValidators');
const { feedbackValidator } = require('../middleware/validators/feedbackValidators');
const router = express.Router();
router.use(authenticate);
router.post('/', createSessionValidator, validateRequest, sessionsController.createSession);
router.get('/', sessionsController.listSessions);
router.get('/:id', sessionIdParamValidator, validateRequest, sessionsController.getSession);
router.post(
  '/:id/generate-questions',
  sessionIdParamValidator,
  validateRequest,
  sessionsController.generateSessionQuestions,
);
router.post(
  '/:id/submit-symptoms',
  submitSymptomsValidator,
  validateRequest,
  sessionsController.submitSymptoms,
);
router.post(
  '/:id/staff-finalize',
  requireRole('doctor', 'admin'),
  sessionIdParamValidator,
  validateRequest,
  sessionsController.staffFinalizeReview,
);
router.post(
  '/:id/close',
  sessionIdParamValidator,
  validateRequest,
  sessionsController.closeSession,
);
router.post(
  '/:id/cancel',
  sessionIdParamValidator,
  validateRequest,
  sessionsController.cancelSession,
);
router.post(
  '/:id/feedback',
  sessionIdParamValidator,
  feedbackValidator,
  validateRequest,
  sessionsController.submitFeedback,
);
module.exports = router;
