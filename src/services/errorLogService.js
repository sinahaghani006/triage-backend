const prisma = require('../config/prismaClient');

// Same fire-and-forget guarantee as auditLogService: a failure to persist
// the error must never itself crash the error handler.
async function recordError({ code = null, message, stack = null, path = null, method = null, statusCode = null, userId = null }) {
  try {
    await prisma.errorLog.create({
      data: { code, message, stack, path, method, statusCode, userId },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ERROR_LOG_WRITE_FAILED]', err);
  }
}

module.exports = { recordError };
