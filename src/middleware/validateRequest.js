const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

// Runs after any express-validator chain; turns validation failures into
// a single consistent 400 AppError instead of leaking raw validator output.
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    const error = new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    error.details = details;
    return next(error);
  }
  return next();
}

module.exports = validateRequest;
