const AppError = require('../utils/AppError');

// Thin gateway around the AI member's module, so if the real export path or
// shape ever changes, only this one file needs updating — sessionsController
// never talks to src/ai directly.
//
// Backend-side patientResponses shape (used by sessionsController, driven by
// our own /sessions API contract with Frontend):
//   { presentingProblemId, patientDetails: { age, gender }, answers: [{questionId, answer}] }
//
// AI-side patientResponses shape (confirmed from src/ai/index.js, 2026-07-12):
// a FLAT array of { questionId, answer }, where presenting_complaint/age/gender
// are reserved questionIds mixed in with the clinical answers. toAiPatientResponses()
// below does that translation so neither side has to change its own contract.
function toAiPatientResponses({ presentingProblemId, patientDetails = {}, answers = [] }) {
  const reserved = [];
  if (presentingProblemId !== undefined && presentingProblemId !== null) {
    reserved.push({ questionId: 'presenting_complaint', answer: presentingProblemId });
  }
  if (patientDetails.age !== undefined && patientDetails.age !== null) {
    reserved.push({ questionId: 'age', answer: patientDetails.age });
  }
  if (patientDetails.gender !== undefined && patientDetails.gender !== null) {
    reserved.push({ questionId: 'gender', answer: patientDetails.gender });
  }
  return [...reserved, ...answers];
}

// Contract confirmed with the AI member (2026-07-12):
//   async function runAiTriageAnalysis({ sessionId, patientResponses })
//     -> { urgencyLevel: 'emergency'|'doctor_review'|'home_treatment'|'normal',
//          triageResultJson: object }
// NOTE: the AI module's current contract has no way to ask for more
// questions mid-session — if it needs more info, it safely falls back to
// 'doctor_review' rather than blocking. Nothing for Sessions to handle
// differently; documented here so it isn't a surprise later.
async function runAiTriageAnalysis({ sessionId, patientResponses }) {
  let aiModule;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    aiModule = require('../ai');
  } catch (err) {
    throw new AppError(
      'AI module (src/ai) is not available in this environment yet',
      503,
      'AI_SERVICE_UNAVAILABLE',
    );
  }

  if (typeof aiModule.runAiTriageAnalysis !== 'function') {
    throw new AppError(
      'src/ai does not export runAiTriageAnalysis as documented in the contract',
      500,
      'AI_CONTRACT_MISMATCH',
    );
  }

  const result = await aiModule.runAiTriageAnalysis({
    sessionId,
    patientResponses: toAiPatientResponses(patientResponses),
  });

  if (!result || typeof result.urgencyLevel !== 'string' || !result.triageResultJson) {
    throw new AppError(
      'AI module returned an unexpected shape (expected { urgencyLevel, triageResultJson })',
      502,
      'AI_RESPONSE_INVALID',
    );
  }

  return result;
}

// Contract confirmed with the AI member (2026-07-12): getPresentingProblemsList()
// -> [{ id, label }, ...] (32 items, label in Persian). Only id/label — the
// AI member confirmed the "suggestedFollowUpAreas" field on their side is
// internal prompt-engineering guidance, NOT patient-facing question text, so
// it is intentionally not exposed here.
function getPresentingProblems() {
  let aiModule;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    aiModule = require('../ai');
  } catch (err) {
    throw new AppError(
      'AI module (src/ai) is not available in this environment yet',
      503,
      'AI_SERVICE_UNAVAILABLE',
    );
  }

  if (typeof aiModule.getPresentingProblemsList !== 'function') {
    throw new AppError(
      'src/ai does not export getPresentingProblemsList as documented in the contract',
      500,
      'AI_CONTRACT_MISMATCH',
    );
  }

  const list = aiModule.getPresentingProblemsList();
  if (!Array.isArray(list)) {
    throw new AppError(
      'AI module returned an unexpected shape from getPresentingProblemsList (expected an array)',
      502,
      'AI_RESPONSE_INVALID',
    );
  }

  return list.map(({ id, label }) => ({ id, label }));
}

module.exports = { runAiTriageAnalysis, toAiPatientResponses, getPresentingProblems };
