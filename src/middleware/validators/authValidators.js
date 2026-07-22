const { body } = require('express-validator');

const registerValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('name is required')
    .isLength({ max: 120 }).withMessage('name must be at most 120 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('email is required')
    .isEmail().withMessage('email must be a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('password is required')
    .isLength({ min: 8 }).withMessage('password must be at least 8 characters'),
];

const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('email is required')
    .isEmail().withMessage('email must be a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('password is required'),
  body('role')
    .optional()
    .isIn(['patient', 'doctor', 'admin']).withMessage('role must be patient, doctor, or admin'),
];

const patientDetailsValidator = [
  body('birthDate')
    .notEmpty().withMessage('birthDate is required')
    .isISO8601().withMessage('birthDate must be a valid date (YYYY-MM-DD)')
    .custom((value) => new Date(value) <= new Date())
    .withMessage('birthDate cannot be in the future'),
  body('weightKg').optional().isFloat({ gt: 0 }).withMessage('weightKg must be a positive number'),
  body('heightCm').optional().isFloat({ gt: 0 }).withMessage('heightCm must be a positive number'),
  body('gender').optional().isString(),
];

module.exports = { registerValidator, loginValidator, patientDetailsValidator };
