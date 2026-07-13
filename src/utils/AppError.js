// Standard application error carrying an HTTP status code and a stable
// machine-readable "code" string, so controllers never throw raw errors
// and the error handler never needs to guess the right status.
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // distinguishes expected errors from bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
