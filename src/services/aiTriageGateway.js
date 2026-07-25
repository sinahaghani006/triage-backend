const AppError = require("../utils/AppError");
const { createGroqProvider } = require("../ai/providers/groqProvider");
const { ResponseValidationError } = require("../ai/responseValidator");
const { AIConnectorError } = require("../ai/aiConnector");

function resolveProviderFn(mode = "triage") {
  const aiModel = process.env.AI_MODEL || "";
  const [provider, ...modelParts] = aiModel.split("/");
  const model = modelParts.join("/");

  if (provider === "mock") {
    if (mode === "questions") {
      return async () => ({
        rawText: JSON.stringify({
          questions: [
            { questionText: "ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â´ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â² ÃƒÆ’Ã…Â¡ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â²ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â´ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â±ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¹ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â´ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã‹Å“Ãƒâ€¦Ã‚Â¸", options: ["ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â±ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â²", "ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€šÃ‚Â²-ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€šÃ‚Â³ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â±ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â² ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â´", "ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â´ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â² ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã…Â¡Ãƒâ€šÃ‚Â© ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚ÂªÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡", "ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â´ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â² ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã…Â¡Ãƒâ€šÃ‚Â© ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡"] },
            { questionText: "ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â´ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Âª ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â±ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â±ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ ÃƒÆ’Ã…Â¡ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã…Â¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚ÂªÃƒÆ’Ã¢â€žÂ¢Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚ÂµÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€šÃ‚Â ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã…Â¡Ãƒâ€šÃ‚Â©ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã‹Å“Ãƒâ€¦Ã‚Â¸", options: ["ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â®ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã¢â€žÂ¢Ãƒâ€šÃ‚Â", "ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚ÂªÃƒÆ’Ã¢â€žÂ¢Ãƒâ€¹Ã¢â‚¬Â ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â³ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â·", "ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â´ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯"] },
            { questionText: "ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚ÂªÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¨ ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â§ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â±ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã‹Å“Ãƒâ€¦Ã‚Â¸", options: ["ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡", "ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â®ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â±", "ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â·ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â  ÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã¢â‚¬ÂºÃƒâ€¦Ã¢â‚¬â„¢ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚Â³ÃƒÆ’Ã‹Å“Ãƒâ€šÃ‚ÂªÃƒÆ’Ã¢â€žÂ¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"] },
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

// 2026-07-22 fix: patientHistory AND medicalHistory must be embedded INSIDE
// patientResponses -- the real contract in src/ai/index.js only destructures
// { sessionId, patientResponses, providerFn }. Any sibling property (like the
// old top-level `patientHistory` param) is silently dropped by JS
// destructuring. This was the root cause of medicalHistory never reaching
// the AI layer, and it turns out patientHistory had the exact same bug.
function toAiPatientResponses({ presentingProblemId, patientDetails = {}, answers = [], patientHistory = [], medicalHistory }) {
  return {
    presentingProblemId,
    age: patientDetails.age,
    sex: patientDetails.gender,
    weightKg: patientDetails.weightKg ?? patientDetails.weight,
    heightCm: patientDetails.heightCm ?? patientDetails.height,
    questionsAsked: answers.map((a) => a.questionId),
    responses: answers.map((a) => a.answer),
    patientHistory,
    medicalHistory,
  };
}

async function runAiTriageAnalysis({ sessionId, patientResponses, patientHistory, medicalHistory }) {
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
    patientResponses: toAiPatientResponses({
      ...patientResponses,
      patientHistory: patientHistory || [],
      medicalHistory,
    }),
    providerFn,
  });

  if (!result || typeof result.urgencyLevel !== "string" || !result.triageResultJson) {
    throw new AppError("AI module returned an unexpected shape (expected { urgencyLevel, triageResultJson })", 502, "AI_RESPONSE_INVALID");
  }

  return result;
}

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

// 2026-07-22 fix: same embedding issue did NOT apply here -- generateTriageQuestions
// in src/ai/index.js already destructures patientHistory and medicalHistory as
// top-level params, so passing them as siblings is correct for THIS function.
// Only added medicalHistory (was previously missing entirely).
async function generateQuestions({ presentingProblemId, age, patientDetails = {}, patientHistory, medicalHistory }) {
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

  try {
    return await aiModule.generateTriageQuestions({
      presentingProblemId,
      age,
      sex: patientDetails.gender,
      weightKg: patientDetails.weightKg ?? patientDetails.weight,
      providerFn,
      patientHistory: patientHistory || [],
      medicalHistory,
    });
  } catch (err) {
    // 2026-07-23 (AI team fix): even with the retry AI-side now does, a
    // rare persistent validation failure would otherwise surface as a raw
    // 500 (errorHandler.js only recognizes AppError). Convert it to a
    // clean, actionable 422 the Frontend can show a retry button for.
    if (err instanceof ResponseValidationError) {
      throw new AppError(
        "Ã˜Â³Ã˜Â¤Ã˜Â§Ã™â€žÃ˜Â§Ã˜Âª Ã˜ÂªÃ™Ë†Ã™â€žÃ›Å’Ã˜Â¯Ã˜Â´Ã˜Â¯Ã™â€¡ Ã˜ÂªÃ™Ë†Ã˜Â³Ã˜Â· AI Ã™â€¦Ã˜Â¹Ã˜ÂªÃ˜Â¨Ã˜Â± Ã™â€ Ã˜Â¨Ã™Ë†Ã˜Â¯Ã™â€ Ã˜Â¯ Ã¢â‚¬â€ Ã™â€žÃ˜Â·Ã™ÂÃ˜Â§Ã™â€¹ Ã˜Â¯Ã™Ë†Ã˜Â¨Ã˜Â§Ã˜Â±Ã™â€¡ Ã˜ÂªÃ™â€žÃ˜Â§Ã˜Â´ ÃšÂ©Ã™â€ Ã›Å’Ã˜Â¯.",
        422,
        err.code
      );
    }
    if (err instanceof AIConnectorError) {
      throw new AppError(
        "در حال حاضر امکان ارتباط با سرویس هوش مصنوعی نیست — لطفاً کمی بعد دوباره تلاش کنید.",
        503,
        "AI_SERVICE_UNAVAILABLE"
      );
    }
    throw err;
  }
}

module.exports = { runAiTriageAnalysis, toAiPatientResponses, getPresentingProblems, generateQuestions };