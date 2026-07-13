const { body, param } = require('express-validator');

const sessionIdParamValidator = [
  param('id').isUUID().withMessage('id must be a valid UUID'),
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

module.exports = { sessionIdParamValidator, submitSymptomsValidator };
