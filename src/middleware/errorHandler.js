const AppError = require('../utils/AppError');
const { recordError } = require('../services/errorLogService');

// Centralized error handler: guarantees every response has a JSON body
// with a stable shape and a correct HTTP status code -- no raw stack
// traces leak to the client, and nothing crashes the process.
// Every 5xx (unexpected errors, and AppErrors with a 5xx statusCode, e.g.
// AI_SERVICE_UNAVAILABLE) is persisted to ErrorLogs; 4xx AppErrors (bad
// input, wrong credentials, invalid state transitions) are expected,
// client-caused, and not logged as errors.
// 2026-07-24: these AppError codes are technically 4xx (so the request
// itself gets a clean client response), but the ROOT CAUSE is not the
// client -- it's AI provider/model behavior we need visibility into.
// Logged regardless of status code so we can measure real occurrence
// rate, unlike genuine client mistakes (bad input, wrong password, etc.)
// which stay unlogged by design.
//
// 2026-07-27 fix: recordError() must be awaited here. On Vercel's
// serverless runtime, the execution context can be frozen right after
// res.json() sends the response, which was silently dropping every
// fire-and-forget recordError() call before its DB write completed --
// error_logs was missing entries for real production errors.
const AI_DIAGNOSTIC_CODES = new Set([
  'QUESTIONS_COUNT_MISMATCH',
  'QUESTIONS_SCHEMA_MISMATCH',
  'LANGUAGE_ARTIFACT_DETECTED',
  'INVALID_JSON',
  'SCHEMA_MISMATCH',
  'AI_SERVICE_UNAVAILABLE',
]);

async function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500 || AI_DIAGNOSTIC_CODES.has(err.code)) {
      await recordError({
        code: err.code,
        message: err.internalMessage || err.message,
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

  // Unexpected/programmer error -- don't leak internals to the client.
  await recordError({
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