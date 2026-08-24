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

const secondRoundQuestionsValidator = [
  ...sessionIdParamValidator,
  body('presentingProblemId')
    .notEmpty().withMessage('presentingProblemId is required'),
  body('patientDetails')
    .isObject().withMessage('patientDetails is required'),
  body('patientDetails.gender')
    .notEmpty().withMessage('patientDetails.gender is required'),
  body('round1QuestionsAsked')
    .isArray({ min: 1 }).withMessage('round1QuestionsAsked must be a non-empty array of the 5 round-1 question texts'),
  body('round1QuestionsAsked.*')
    .isString().withMessage('each item in round1QuestionsAsked must be a string (the questionText, not the full question object)'),
  body('round1Responses')
    .isArray({ min: 1 }).withMessage('round1Responses must be a non-empty array of the patient answers to round-1 questions'),
  body('round1Responses.*')
    .isString().withMessage('each item in round1Responses must be a string (the selected answer text)'),
  body('round1Responses')
    .custom((value, { req }) => {
      const asked = req.body.round1QuestionsAsked;
      if (Array.isArray(asked) && Array.isArray(value) && asked.length !== value.length) {
        throw new Error(
          `round1QuestionsAsked and round1Responses must have the same length (got ${asked.length} questions and ${value.length} responses) -- they must correspond index-by-index`
        );
      }
      return true;
    }),
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

module.exports = { sessionIdParamValidator, createSessionValidator, submitSymptomsValidator, secondRoundQuestionsValidator };
