const AppError = require('../utils/AppError');
const { recordError } = require('../services/errorLogService');

// Centralized error handler: guarantees every response has a JSON body
// with a stable shape and a correct HTTP status code — no raw stack
// traces leak to the client, and nothing crashes the process.
// Every 5xx (unexpected errors, and AppErrors with a 5xx statusCode, e.g.
// AI_SERVICE_UNAVAILABLE) is persisted to ErrorLogs; 4xx AppErrors (bad
// input, wrong credentials, invalid state transitions) are expected,
// client-caused, and not logged as errors.
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      recordError({
        code: err.code,
        message: err.message,
        stack: err.stack,
        path: req.originalUrl,
        method: req.method,
        statusCode: err.statusCode,
        userId: req.user?.id || null,
      });
    }
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Unexpected/programmer error — don't leak internals to the client.
  recordError({
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    statusCode: 500,
    userId: req.user?.id || null,
  });
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again later.',
    },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

module.exports = { errorHandler, notFoundHandler };
