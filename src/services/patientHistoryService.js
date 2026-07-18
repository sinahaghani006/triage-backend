const prisma = require("../config/prismaClient");

async function recordHistorySummary({ userId, sessionId, presentingProblemId, urgencyLevel, reasoningSummary }) {
  await prisma.patientHistorySummary.upsert({
    where: { sessionId },
    create: { userId, sessionId, presentingProblemId, urgencyLevel, reasoningSummary },
    update: { presentingProblemId, urgencyLevel, reasoningSummary },
  });
}

async function getRecentHistorySummary(userId, limit = 5) {
  return prisma.patientHistorySummary.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

module.exports = { recordHistorySummary, getRecentHistorySummary };
