const { body, param } = require('express-validator');

const sessionIdParamValidator = [
  param('id').isUUID().withMessage('id must be a valid UUID'),
];

// 2026-07-22 (project manager decision): self-attestation gate. The patient
// must explicitly confirm this triage request is for themself, not a family
// member using their account. Required at session creation -- a session
// is never created without it.
// 2026-07-22 TEMPORARY ROLLBACK: Frontend has no UI for this yet, so making
// it required broke session creation for all real users. Now optional and
// defaults to true if omitted -- re-enforce as fully required once Frontend
// ships the confirmation UI. This is a temporary safety rollback, not a
// cancellation of the identity-confirmation task.
const createSessionValidator = [
  body('confirmedSelf')
    .optional()
    .isBoolean().withMessage('confirmedSelf must be a boolean if provided'),
];

const submitSymptomsValidator = [
  ...sessionIdParamValidator,
  body('presentingProblemId')
    .notEmpty().withMessage('presentingProblemId is required'),
  body('patientDetails')
    .isObject().withMessage('patientDetails is required'),
  body('patientDetails.gender')
    .notEmpty().withMessage('patientDetails.gender is required'),
  body('answers')
    .isArray().withMessage('answers must be an array (can be empty)'),
];

module.exports = { sessionIdParamValidator, createSessionValidator, submitSymptomsValidator };
