const { body } = require('express-validator');

const updateMedicalHistoryValidator = [
  body('chronicConditions').optional().isArray().withMessage('chronicConditions must be an array'),
  body('chronicConditions.*').optional().isString(),
  body('allergies').optional().isArray().withMessage('allergies must be an array'),
  body('allergies.*').optional().isString(),
  body('currentMedications').optional().isArray().withMessage('currentMedications must be an array'),
  body('currentMedications.*').optional().isString(),
  body('surgicalHistory').optional().isArray().withMessage('surgicalHistory must be an array'),
  body('surgicalHistory.*').optional().isString(),
  body('familyHistory').optional().isArray().withMessage('familyHistory must be an array'),
  body('familyHistory.*').optional().isString(),
];

module.exports = { updateMedicalHistoryValidator };
