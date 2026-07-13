const prisma = require('../config/prismaClient');

// Fire-and-forget style: audit logging must never break the main request
// flow. If the write itself fails, we log to console as a last resort but
// still let the original response go through.
async function recordAudit({ userId = null, action, entityType = null, entityId = null, metadata = null }) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entityType, entityId, metadata },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[AUDIT_LOG_WRITE_FAILED]', action, err);
  }
}

module.exports = { recordAudit };
