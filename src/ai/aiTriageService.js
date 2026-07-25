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
 * patientResponses (به‌عنوان یک object، نه فقط آرایه‌ای از متن) در اختیار
 * می‌گذارد. این یک فرض طراحی است، نه واقعیت تأییدشده — باید با مدیر پروژه
 * چک شود.
 *
 * provider واقعی (Groq یا هرچیز دیگر) اینجا import نمی‌شود؛ از طریق
 * providerFn تزریق می‌شود تا این فایل به‌راحتی با mock تست شود و به یک
 * وابستگی خاص قفل نشود.
 */

const { generateTriagePrompt, generateQuestionsPrompt, generateSecondRoundPrompt } = require('./promptGenerator');
const { callAIProvider, AIConnectorError } = require('./aiConnector');
const {
  validateAIResponse,
  validateQuestionsResponse,
  validateSecondRoundResponse,
  ResponseValidationError,
} = require('./responseValidator');
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
    heightCm,
    questionsAsked = [],
    patientResponses = [],
    patientHistory = [],
    medicalHistory,
  } = patientContext;

  let triageResult;

  try {
    const prompt = generateTriagePrompt({
      presentingProblemId,
      age,
      sex,
      weightKg,
      heightCm,
      questionsAsked,
      patientResponses,
      patientHistory,
      medicalHistory,
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

/**
 * *** قابلیت جدید — orchestrator مرحله‌ی تولید سؤال پویا. ***
 * به دستور صریح مدیر پروژه، بر اساس نمونه‌ی هاردکد مدیرعامل سینا.
 *
 * *** به‌روزرسانی (باگ کشف‌شده در production، همین گفتگو): retry خودکار ***
 * مدل گاهی تعداد سؤالات یا شکل پاسخ درستی برنمی‌گرداند (مثلاً ۳ سؤال
 * به‌جای ۵) — این یک نوسان طبیعی مدل است، نه لزوماً خطای دائمی. قبل از
 * این تغییر، اولین شکست اعتبارسنجی مستقیم throw می‌شد و در نهایت به یک
 * کرش ۵۰۰ خام در Backend منتهی می‌شد (چون ResponseValidationError یک
 * AppError نیست و errorHandler.js آن را نمی‌شناسد — این بخش دوم مشکل
 * در Backend است، نگاه کن به یادداشت پیشنهادی برای aiTriageGateway.js).
 * اینجا فقط روی ResponseValidationError (مشکل شکل/تعداد پاسخ) یک retry
 * انجام می‌شود — نه روی خطای اتصال/provider (AIConnectorError)، چون آن
 * نوع خطا نشانه‌ی مشکل شبکه/سرویس است، نه نوسان مدل، و retry فوری
 * معمولاً کمکی نمی‌کند.
 *
 * *** تصمیم طراحی مهم که باید تأیید شود: در صورت خطا (AIConnectorError یا
 * ResponseValidationError که حتی بعد از retry هم برطرف نشد)، این تابع بر
 * خلاف runAiTriageAnalysisCore، fallback نمی‌سازد — خطا را مستقیماً بالا
 * می‌فرستد (throw می‌کند). ***
 * دلیل: تولید سؤالات بالینی جعلی وقتی AI شکست خورده، همان ریسک ساختن
 * محتوای بالینی حدسی است که در کل این پروژه ممنوع شده. تصمیم گرفتن
 * درباره‌ی این‌که Backend در این حالت چه کند (مثلاً رد شدن از این مرحله
 * و رفتن مستقیم به submit-symptoms) باید توسط مدیر پروژه مشخص شود.
 *
 * @param {object} params
 * @param {string} params.presentingProblemId
 * @param {string} [params.initialDescription]
 * @param {number} params.age
 * @param {'male'|'female'} params.sex
 * @param {number} params.weightKg
 * @param {Array} [params.patientHistory]
 * @param {function} params.providerFn
 * @returns {Promise<{ questions: Array<{questionText: string, options: string[]}> }>}
 * @throws {AIConnectorError | ResponseValidationError}
 */
async function generateTriageQuestionsCore({
  presentingProblemId,
  initialDescription,
  age,
  sex,
  weightKg,
  patientHistory = [],
  medicalHistory,
  providerFn,
}) {
  const prompt = generateQuestionsPrompt({
    presentingProblemId,
    initialDescription,
    age,
    sex,
    weightKg,
    patientHistory,
    medicalHistory,
  });

  const MAX_ATTEMPTS = 2; // ۱ تلاش اصلی + ۱ retry — فقط برای خطای اعتبارسنجی
  let lastValidationError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // callAIProvider عمداً بیرون try است: خطای اتصال/provider (AIConnectorError)
    // نباید retry شود و باید فوراً بالا برود — طبق طراحی مستندشده بالا.
    const providerResult = await callAIProvider(prompt, providerFn);

    try {
      return validateQuestionsResponse(providerResult.rawText);
    } catch (err) {
      if (!(err instanceof ResponseValidationError)) {
        throw err;
      }
      lastValidationError = err;
      // فقط لاگ برای مشاهده‌پذیری — بدون هیچ داده‌ی بیمار در پیام.
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `generateTriageQuestionsCore: تلاش ${attempt} با خطای اعتبارسنجی شکست خورد (${err.code})، در حال retry...`
        );
      }
    }
  }

  // هر دو تلاش شکست خوردند — همان خطای اعتبارسنجی نهایی را بالا می‌فرستیم.
  throw lastValidationError;
}

/**
 * *** قابلیت جدید — orchestrator دور دوم جریان پرسش دومرحله‌ای. ***
 * تأیید مدیر پروژه در همین گفتگو. نگاه کن به generateSecondRoundPrompt
 * (promptGenerator.js) و SecondRoundQuestionsSchema/SecondRoundEscalationSchema
 * (schemas.js) برای طراحی کامل.
 *
 * *** طراحی کلیدی: در حالت escalate:true، این تابع مستقیماً از
 * buildTriageResultFromAI (همان تابعی که تصمیم نهایی معمول استفاده
 * می‌کند) بازاستفاده می‌کند — چون خروجی escalate:true دقیقاً همان شکل
 * AIRawResponseSchema را دارد (به‌علاوه‌ی فیلد escalate که بی‌ضرر است).
 * این یعنی صفر منطق تکراری برای ساخت TriageResult در این مسیر. ***
 *
 * *** رفتار خطا: مشابه generateTriageQuestionsCore، یک retry خودکار
 * فقط روی ResponseValidationError انجام می‌شود (نه AIConnectorError).
 * اگر بعد از retry هم شکست بخورد، خطا مستقیماً throw می‌شود — این تابع
 * هیچ fallback خاموشی نمی‌سازد، چون تصمیم درباره‌ی رفتار Backend در
 * این حالت (مثلاً رد شدن از دور دوم) باید توسط مدیر پروژه مشخص شود؛
 * دقیقاً هم‌راستا با تصمیم مستندشده‌ی generateTriageQuestionsCore. ***
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.presentingProblemId
 * @param {number} params.age
 * @param {'male'|'female'} params.sex
 * @param {number} params.weightKg
 * @param {number} [params.heightCm]
 * @param {string[]} params.round1QuestionsAsked - دقیقاً ۵ سؤال دور اول
 * @param {string[]} params.round1Responses - دقیقاً ۵ پاسخ دور اول
 * @param {Array} [params.patientHistory]
 * @param {object} [params.medicalHistory]
 * @param {function} params.providerFn
 * @returns {Promise<{escalate:false, questions: Array} | {escalate:true, urgencyLevel:string, triageResultJson:object}>}
 * @throws {AIConnectorError | ResponseValidationError | Error}
 */
async function generateSecondRoundCore({
  sessionId,
  presentingProblemId,
  age,
  sex,
  weightKg,
  heightCm,
  round1QuestionsAsked = [],
  round1Responses = [],
  patientHistory = [],
  medicalHistory,
  providerFn,
}) {
  const prompt = generateSecondRoundPrompt({
    presentingProblemId,
    age,
    sex,
    weightKg,
    heightCm,
    round1QuestionsAsked,
    round1Responses,
    patientHistory,
    medicalHistory,
  });

  const MAX_ATTEMPTS = 2; // ۱ تلاش اصلی + ۱ retry — فقط برای خطای اعتبارسنجی
  let lastValidationError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // callAIProvider عمداً بیرون try است: خطای اتصال نباید retry شود.
    const providerResult = await callAIProvider(prompt, providerFn);

    try {
      const validated = validateSecondRoundResponse(providerResult.rawText);

      if (validated.escalate === true) {
        const triageResult = buildTriageResultFromAI({
          aiRaw: validated,
          meta: providerResult.meta,
          sessionId,
          presentingProblemId,
          questionsAsked: round1QuestionsAsked,
          patientResponses: round1Responses,
        });

        const finalValidated = TriageResultSchema.safeParse(triageResult);
        if (!finalValidated.success) {
          throw new Error(
            `generateSecondRoundCore: triageResult ساخته‌شده (حالت escalate) با TriageResultSchema مطابقت ندارد: ${finalValidated.error.message}`
          );
        }

        return {
          escalate: true,
          urgencyLevel: finalValidated.data.urgency_level,
          triageResultJson: finalValidated.data,
        };
      }

      return { escalate: false, questions: validated.questions };
    } catch (err) {
      if (!(err instanceof ResponseValidationError)) {
        throw err;
      }
      lastValidationError = err;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `generateSecondRoundCore: تلاش ${attempt} با خطای اعتبارسنجی شکست خورد (${err.code})، در حال retry...`
        );
      }
    }
  }

  throw lastValidationError;
}

module.exports = {
  runAiTriageAnalysisCore,
  generateTriageQuestionsCore,
  generateSecondRoundCore,
};
