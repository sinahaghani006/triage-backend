const { body, param } = require('express-validator');

const sessionIdParamValidator = [
  param('id').isUUID().withMessage('id must be a valid UUID'),
];

// 2026-07-22 (project manager decision): self-attestation gate. The patient
// must explicitly confirm this triage request is for themself, not a family
// member using their account. Required at session creation -- a session
// is never created without it.
const createSessionValidator = [
  body('confirmedSelf')
    .exists().withMessage('confirmedSelf is required')
    .isBoolean().withMessage('confirmedSelf must be a boolean')
    .custom((value) => value === true)
    .withMessage('confirmedSelf must be true -- you must confirm this triage is for yourself'),
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
