/**
 * aiTriageService.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا). بازسازی نیست. ***
 * این فایل orchestrator است: promptGenerator → aiConnector → responseValidator
 * → urgencyClassifier → TriageResultSchema را به‌هم وصل می‌کند.
 *
 * *** فرض طراحی که نیاز به تأیید مدیر پروژه دارد: ***
 * بریف رسمی امضای index.js را این‌طور مشخص کرده:
 *   runAiTriageAnalysis({ sessionId, patientResponses }) -> { urgencyLevel, triageResultJson }
 * این امضا فقط sessionId و patientResponses را ذکر کرده، نه presentingProblemId
 * یا داده‌های پرونده بیمار (سن، جنس، وزن) به‌طور جداگانه. چون این ماژول
 * مستقیم به DB وصل نمی‌شود، فرض شده Backend این داده‌ها را از قبل در قالب
 * patientResponses (به‌عنوان یک object، نه فقط آرایه‌ی متن) در اختیار می‌گذارد.
 * این یک فرض طراحی است، نه واقعیت تأییدشده — باید با مدیر پروژه چک شود.
 *
 * provider واقعی (Groq یا هرچیز دیگر) اینجا import نمی‌شود؛ از طریق
 * providerFn تزریق می‌شود تا این فایل به‌راحتی با mock تست شود و به یک
 * وابستگی خاص قفل نشود.
 */

const { generateTriagePrompt } = require('./promptGenerator');
const { callAIProvider, AIConnectorError } = require('./aiConnector');
const { validateAIResponse, ResponseValidationError } = require('./responseValidator');
const {
  buildTriageResultFromAI,
  buildFallbackTriageResult,
} = require('./urgencyClassifier');
const { TriageResultSchema } = require('./schemas');

/**
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.patientContext - { presentingProblemId, age, sex, weightKg, questionsAsked, patientResponses }
 * @param {function} params.providerFn - تابع async که aiConnector.js انتظار دارد.
 * @returns {Promise<{ urgencyLevel: string, triageResultJson: object }>}
 */
async function runAiTriageAnalysisCore({ sessionId, patientContext, providerFn }) {
  if (!sessionId) {
    throw new Error('runAiTriageAnalysisCore: sessionId الزامی است.');
  }
  if (!patientContext || !patientContext.presentingProblemId) {
    throw new Error('runAiTriageAnalysisCore: patientContext.presentingProblemId الزامی است.');
  }

  const {
    presentingProblemId,
    age,
    sex,
    weightKg,
    questionsAsked = [],
    patientResponses = [],
  } = patientContext;

  let triageResult;

  try {
    const prompt = generateTriagePrompt({
      presentingProblemId,
      age,
      sex,
      weightKg,
      questionsAsked,
      patientResponses,
    });

    const providerResult = await callAIProvider(prompt, providerFn);
    const aiRaw = validateAIResponse(providerResult.rawText);

    if (!aiRaw.is_complete) {
      // AI صراحتاً گفته اطلاعات کافی ندارد — طبق قانون escalate-only، مستقیم fallback.
      triageResult = buildFallbackTriageResult({
        sessionId,
        presentingProblemId,
        questionsAsked,
        patientResponses,
        failureReason: 'AI is_complete=false را گزارش کرد (اطلاعات ناکافی).',
      });
    } else {
      triageResult = buildTriageResultFromAI({
        aiRaw,
        meta: providerResult.meta,
        sessionId,
        presentingProblemId,
        questionsAsked,
        patientResponses,
      });
    }
  } catch (err) {
    // قانون طلایی #۳: هر خطای AI/provider/validation => doctor_review، هرگز چیز دیگر.
    const reason =
      err instanceof AIConnectorError || err instanceof ResponseValidationError
        ? err.message
        : `خطای غیرمنتظره: ${err.message}`;

    triageResult = buildFallbackTriageResult({
      sessionId,
      presentingProblemId,
      questionsAsked,
      patientResponses,
      failureReason: reason,
    });
  }

  const validated = TriageResultSchema.safeParse(triageResult);
  if (!validated.success) {
    // اگر حتی fallback هم schema را نقض کند، این یک باگ داخلی جدی است —
    // نباید بی‌صدا رد شود.
    throw new Error(
      `runAiTriageAnalysisCore: triageResult ساخته‌شده با TriageResultSchema مطابقت ندارد: ${validated.error.message}`
    );
  }

  return {
    urgencyLevel: validated.data.urgency_level,
    triageResultJson: validated.data,
  };
}

module.exports = {
  runAiTriageAnalysisCore,
};
