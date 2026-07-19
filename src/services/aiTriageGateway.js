const AppError = require("../utils/AppError");
const { createGroqProvider } = require("../ai/providers/groqProvider");

function resolveProviderFn(mode = "triage") {
  const aiModel = process.env.AI_MODEL || "";
  const [provider, ...modelParts] = aiModel.split("/");
  const model = modelParts.join("/");

  if (provider === "mock") {
    if (mode === "questions") {
      return async () => ({
        rawText: JSON.stringify({
          questions: [
            { questionText: "علائم شما از چه زمانی شروع شده؟", options: ["امروز", "۲-۳ روز پیش", "بیش از یک هفته", "بیش از یک ماه"] },
            { questionText: "شدت درد را چگونه توصیف می‌کنید؟", options: ["خفیف", "متوسط", "شدید"] },
            { questionText: "آیا تب هم دارید؟", options: ["بله", "خیر", "مطمئن نیستم"] },
          ],
        }),
        meta: { provider: "mock", model: "mock-v1" },
      });
    }
    return async () => ({
      rawText: JSON.stringify({
        urgency_suggestion: "normal",
        confidence: 0.85,
        reasoning: "This is a mock AI response for demo purposes.",
        clinical_alerts: [],
        is_complete: true,
      }),
      meta: { provider: "mock", model: "mock-v1" },
    });
  }

  if (provider === "groq") {
    if (!process.env.GROQ_API_KEY) {
      throw new AppError("GROQ_API_KEY is not set but AI_MODEL is groq/*", 500, "AI_CONFIG_MISSING");
    }
    return createGroqProvider(model);
  }

  throw new AppError(`Unsupported AI_MODEL provider: "${provider}"`, 500, "AI_CONFIG_UNSUPPORTED");
}

// NOTE (assumption pending AI-member confirmation): questionsAsked/responses
// are derived by splitting our answers[] ({questionId,answer} pairs) into
// two parallel arrays, since the new AI contract wants flat string[] arrays.
// weightKg intentionally omitted for now (pending questionId decision).
function toAiPatientResponses({ presentingProblemId, patientDetails = {}, answers = [] }) {
  return {
    presentingProblemId,
    age: patientDetails.age,
    sex: patientDetails.gender,
    weightKg: patientDetails.weightKg ?? patientDetails.weight,
    questionsAsked: answers.map((a) => a.questionId),
    responses: answers.map((a) => a.answer),
  };
}

async function runAiTriageAnalysis({ sessionId, patientResponses, patientHistory }) {
  let aiModule;
  try {
    aiModule = require("../ai");
  } catch (err) {
    throw new AppError("AI module (src/ai) is not available in this environment yet", 503, "AI_SERVICE_UNAVAILABLE");
  }

  if (typeof aiModule.runAiTriageAnalysis !== "function") {
    throw new AppError("src/ai does not export runAiTriageAnalysis as documented in the contract", 500, "AI_CONTRACT_MISMATCH");
  }

  const providerFn = resolveProviderFn("triage");

  const result = await aiModule.runAiTriageAnalysis({
    sessionId,
    patientResponses: toAiPatientResponses(patientResponses),
    providerFn,
    patientHistory: patientHistory || [],
  });

  if (!result || typeof result.urgencyLevel !== "string" || !result.triageResultJson) {
    throw new AppError("AI module returned an unexpected shape (expected { urgencyLevel, triageResultJson })", 502, "AI_RESPONSE_INVALID");
  }

  return result;
}

// NOTE (2026-07-19, durable fix): reads directly from src/ai/presentingProblems.js
// instead of going through src/ai/index.js — index.js gets rewritten often for
// triage/questions features and repeatedly drops the getPresentingProblemsList
// re-export (4th regression). presentingProblems.js itself is a stable,
// independent list unrelated to those rewrites, so this bypasses the fragility
// entirely.
function getPresentingProblems() {
  let problemsModule;
  try {
    problemsModule = require("../ai/presentingProblems");
  } catch (err) {
    throw new AppError("AI module (src/ai/presentingProblems) is not available in this environment yet", 503, "AI_SERVICE_UNAVAILABLE");
  }

  if (typeof problemsModule.getPresentingProblemsList !== "function") {
    throw new AppError("src/ai/presentingProblems does not export getPresentingProblemsList", 500, "AI_CONTRACT_MISMATCH");
  }

  const list = problemsModule.getPresentingProblemsList();
  if (!Array.isArray(list)) {
    throw new AppError("AI module returned an unexpected shape from getPresentingProblemsList (expected an array)", 502, "AI_RESPONSE_INVALID");
  }

  return list.map(({ id, labelFa }) => ({ id, label: labelFa }));
}
// POST /sessions/:id/generate-questions — calls into src/ai for the
// initial batch of triage questions (project manager decision,
// 2026-07-15: reinstates the "ask 3 questions" flow). Contract with AI
// module still pending exact shape; assumes generateQuestions({
// presentingProblemId, patientDetails }) -> [{ questionId, text, type }].
function generateQuestions({ presentingProblemId, age, patientDetails = {}, patientHistory }) {
  let aiModule;
  try {
    aiModule = require("../ai");
  } catch (err) {
    throw new AppError("AI module (src/ai) is not available in this environment yet", 503, "AI_SERVICE_UNAVAILABLE");
  }

  if (typeof aiModule.generateTriageQuestions !== "function") {
    throw new AppError("src/ai does not export generateTriageQuestions as documented in the contract", 500, "AI_CONTRACT_MISMATCH");
  }

  const providerFn = resolveProviderFn("questions");

  return aiModule.generateTriageQuestions({
    presentingProblemId,
    age,
    sex: patientDetails.gender,
    weightKg: patientDetails.weightKg ?? patientDetails.weight,
    providerFn,
    patientHistory: patientHistory || [],
  });
}
module.exports = { runAiTriageAnalysis, toAiPatientResponses, getPresentingProblems, generateQuestions };