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
  body('birthDate')
    .notEmpty().withMessage('birthDate is required')
    .isISO8601().withMessage('birthDate must be a valid date (YYYY-MM-DD)')
    .custom((value) => new Date(value) <= new Date())
    .withMessage('birthDate cannot be in the future'),
  body('weight')
    .notEmpty().withMessage('weight is required')
    .isFloat({ min: 1, max: 500 }).withMessage('weight must be a valid number of kilograms'),
];

const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('email is required')
    .isEmail().withMessage('email must be a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('password is required'),
];

module.exports = { registerValidator, loginValidator };
