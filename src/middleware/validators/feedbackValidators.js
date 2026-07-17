const { body } = require('express-validator');

const feedbackValidator = [
  body('rating')
    .notEmpty().withMessage('rating is required')
    .isInt({ min: 1, max: 5 }).withMessage('rating must be an integer between 1 and 5'),
  body('comment')
    .optional({ nullable: true })
    .isString().withMessage('comment must be a string')
    .isLength({ max: 2000 }).withMessage('comment must be at most 2000 characters'),
];

module.exports = { feedbackValidator };
