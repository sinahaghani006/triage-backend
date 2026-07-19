const prisma = require("../config/prismaClient");

async function recordHistorySummary({ userId, sessionId, presentingProblemId, urgencyLevel, reasoningSummary }) {
  await prisma.patientHistorySummary.upsert({
    where: { sessionId },
    create: { userId, sessionId, presentingProblemId, urgencyLevel, reasoningSummary },
    update: { presentingProblemId, urgencyLevel, reasoningSummary },
  });
}

// Returns full episode objects (project manager decision, 2026-07-19):
// presentingProblemId, urgencyLevel, full reasoning, all questions/answers
// from that session, and the date — joined live from TriageResult
// (no data duplication) rather than stored redundantly.
async function getRecentHistorySummary(userId, limit = 5) {
  const summaries = await prisma.patientHistorySummary.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (summaries.length === 0) return [];

  const sessionIds = summaries.map((s) => s.sessionId);
  const triageResults = await prisma.triageResult.findMany({
    where: { sessionId: { in: sessionIds } },
  });
  const triageResultBySessionId = Object.fromEntries(
    triageResults.map((tr) => [tr.sessionId, tr])
  );

  return summaries.map((s) => {
    const tr = triageResultBySessionId[s.sessionId];
    const json = tr?.triageResultJson || {};
    return {
      sessionId: s.sessionId,
      presentingProblemId: s.presentingProblemId,
      urgencyLevel: s.urgencyLevel,
      reasoning: s.reasoningSummary,
      questionsAsked: json.questions_asked || [],
      patientResponses: json.patient_responses || [],
      createdAt: s.createdAt,
    };
  });
}

module.exports = { recordHistorySummary, getRecentHistorySummary };
