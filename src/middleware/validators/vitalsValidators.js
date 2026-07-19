const { body } = require('express-validator');

const VALID_VITAL_TYPES = ['blood_pressure', 'blood_sugar', 'lipids', 'temperature'];

const createVitalValidator = [
  body('type')
    .notEmpty().withMessage('type is required')
    .isIn(VALID_VITAL_TYPES).withMessage(`type must be one of: ${VALID_VITAL_TYPES.join(', ')}`),
  body('value')
    .exists().withMessage('value is required'),
];

module.exports = { createVitalValidator, VALID_VITAL_TYPES };
