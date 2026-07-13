const express = require('express');
const sessionsController = require('../controllers/sessionsController');
const authenticate = require('../middleware/authenticate');
const requireStaff = require('../middleware/requireStaff');
const validateRequest = require('../middleware/validateRequest');
const {
  sessionIdParamValidator,
  submitSymptomsValidator,
} = require('../middleware/validators/sessionValidators');

const router = express.Router();

router.use(authenticate); // every session route requires a logged-in user

router.post('/', sessionsController.createSession);
router.get('/', sessionsController.listSessions);
router.get('/:id', sessionIdParamValidator, validateRequest, sessionsController.getSession);
router.post(
  '/:id/submit-symptoms',
  submitSymptomsValidator,
  validateRequest,
  sessionsController.submitSymptoms,
);
// Staff-only, minimal Phase-1 stand-in for a real doctor review panel
// (Phase 2). Only ever applicable to S5_pending_doctor_review sessions —
// S6/S7/S8 are auto-finalized inside submit-symptoms itself.
router.post(
  '/:id/staff-finalize',
  requireStaff,
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

module.exports = router;
