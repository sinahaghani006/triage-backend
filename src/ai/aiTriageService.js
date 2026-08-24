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
    // 🔒 فیکس (این گفتگو): هرگز err.message خام (که می‌تواند شامل پاسخ خام provider
    // باشد، مثل خطای HTTP کامل Groq) به بیمار در فیلد reasoning نمایش داده نشود.
    // فقط دسته‌بندی امن و عمومی؛ جزئیات خام صرفاً در لاگ سرور.
    const SAFE_REASON_MAP = {
      TIMEOUT: 'ارتباط با سرویس هوش مصنوعی با تأخیر مواجه شد.',
      INVALID_PROVIDER_RESPONSE: 'پاسخ دریافتی از سرویس هوش مصنوعی معتبر نبود.',
      PROVIDER_CALL_FAILED: 'در حال حاضر امکان ارتباط با سرویس هوش مصنوعی نیست.',
      INVALID_PROMPT_SHAPE: 'خطای داخلی در آماده‌سازی درخواست.',
      INVALID_PROMPT_SYSTEM: 'خطای داخلی در آماده‌سازی درخواست.',
      INVALID_PROMPT_USER: 'خطای داخلی در آماده‌سازی درخواست.',
      INVALID_PROVIDER_FN: 'خطای داخلی در پیکربندی سرویس هوش مصنوعی.',
    };

    let reason;
    if (err instanceof AIConnectorError) {
      reason = SAFE_REASON_MAP[err.code] || 'خطای ارتباطی با سرویس هوش مصنوعی.';
      console.error(`[AI_TRIAGE_FALLBACK] sessionId=${sessionId} code=${err.code} raw=${err.message}`);
    } else if (err instanceof ResponseValidationError) {
      reason = 'ساختار پاسخ سیستم هوش مصنوعی نامعتبر بود.';
      console.error(`[AI_TRIAGE_FALLBACK] sessionId=${sessionId} code=${err.code} raw=${err.message}`);
    } else {
      reason = 'خطای غیرمنتظره‌ی داخلی.';
      console.error(`[AI_TRIAGE_FALLBACK] sessionId=${sessionId} unexpected raw=${err.message}`);
    }

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

  // *** به‌روزرسانی — تأیید مدیر پروژه بر اساس شواهد واقعی (این گفتگو): ***
  // بودجه از ۲ به ۳ افزایش یافت (۱ تلاش اصلی + ۲ retry) چون شواهد واقعی
  // production نشان داد ۲ تلاش گاهی برای عبور از یک شکست اعتبارسنجی کافی
  // نیست. توجه: برخلاف generateSecondRoundCore، اینجا در صورت اتمام همه‌ی
  // تلاش‌ها همچنان throw می‌شود (نه fallback به doctor_review) — چون شکل
  // خروجی این تابع ({questions}) معادل TriageResult نیست و تبدیل آن به
  // escalate:true یک تغییر شکل API است که Backend باید صریحاً تأیید کند.
  const MAX_ATTEMPTS = 3;
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
 * *** به‌روزرسانی (باگ کشف‌شده در production، همین گفتگو): تشخیص تکرار ***
 * round1QuestionsAsked حالا هم به generateSecondRoundPrompt (برای
 * دستورالعمل به مدل) هم به validateSecondRoundResponse (برای تشخیص
 * کد-محورِ تکرار، نه فقط اتکا به قول مدل در پرامپت) پاس داده می‌شود.
 * اگر AI با وجود دستورالعمل صریح باز هم سؤالی هم‌پوشان با دور اول
 * برگرداند، validateSecondRoundResponse یک ResponseValidationError با
 * کد ROUND2_QUESTION_DUPLICATE_DETECTED پرتاب می‌کند که توسط همین
 * retry loop زیر مدیریت می‌شود — نیازی به تغییر منطق retry نبود، فقط
 * منبع خطای جدید به همان مسیر موجود وصل شد.
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

  // *** لاگ تشخیصی — تأیید مدیر پروژه، همین گفتگو. ***
  // هدف: پاسخ به سؤال Backend («آیا واقعاً چک تکرار صدا زده می‌شود؟») بدون
  // حدس. اگر این لاگ round1QuestionsAsked.length=0 نشان دهد، یعنی Backend
  // این پارامتر را هنگام صدا زدن generateSecondRoundQuestions پر نمی‌کند —
  // و طبق طراحی فعلی responseValidator.js، در آن حالت کل چک تکرار بی‌صدا
  // رد می‌شود (نه خطا، نه رفتار قابل‌مشاهده‌ی دیگر). این همان چیزی است که
  // باید در error_logs/لاگ‌های Vercel این ران‌ها بررسی شود.
  console.log(
    `generateSecondRoundCore: round1QuestionsAsked.length=${round1QuestionsAsked.length} (اگر ۰ باشد، چک تکرار دور دوم بی‌صدا رد می‌شود)`
  );

  // *** به‌روزرسانی — تأیید مدیر پروژه بر اساس شواهد واقعی (این گفتگو): ***
  // بودجه از ۲ به ۳ افزایش یافت (۱ تلاش اصلی + ۲ retry).
  const MAX_ATTEMPTS = 3;
  let lastValidationError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // callAIProvider عمداً بیرون try است: خطای اتصال نباید retry شود.
      let providerResult;
      try {
        providerResult = await callAIProvider(prompt, providerFn);
      } catch (err) {
        // 2026-08-24 fix (production blocker, this conversation): a real
        // provider/connection error (AIConnectorError) here used to throw
        // raw all the way up to the client as a 503, bypassing escalate-only.
        // Now it resolves to a safe doctor_review result, same as
        // runAiTriageAnalysisCore already does for this exact error class.
        console.error("generateSecondRoundCore: provider/connection error, falling back to doctor_review. raw=" + err.message);
        const connectorFallback = buildFallbackTriageResult({
          sessionId,
          presentingProblemId,
          questionsAsked: round1QuestionsAsked,
          patientResponses: round1Responses,
          failureReason: 'AI provider/connection error during round 2.',
        });
        const connectorValidated = TriageResultSchema.safeParse(connectorFallback);
        if (!connectorValidated.success) {
          throw err;
        }
        return {
          escalate: true,
          urgencyLevel: connectorValidated.data.urgency_level,
          triageResultJson: connectorValidated.data,
        };
      }

    try {
      const validated = validateSecondRoundResponse(providerResult.rawText, {
        round1QuestionTexts: round1QuestionsAsked,
      });

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
          // 2026-08-24 fix (production blocker, this conversation): previously,
          // any non-validation error (e.g. AIConnectorError from a real
          // provider/connection issue) was thrown raw here, bypassing the
          // escalate-only fallback and surfacing a raw 503 to the patient.
          // Now it always resolves to a safe doctor_review result, matching
          // the same golden rule already enforced in runAiTriageAnalysisCore.
          console.error(
            `generateSecondRoundCore: non-validation error (${err.code || err.name}), falling back to doctor_review instead of throwing raw. raw=${err.message}`
          );
          const connectorFallback = buildFallbackTriageResult({
            sessionId,
            presentingProblemId,
            questionsAsked: round1QuestionsAsked,
            patientResponses: round1Responses,
            failureReason: 'AI provider/connection error during round 2.',
          });
          const connectorValidated = TriageResultSchema.safeParse(connectorFallback);
          if (!connectorValidated.success) {
            throw err;
          }
          return {
            escalate: true,
            urgencyLevel: connectorValidated.data.urgency_level,
            triageResultJson: connectorValidated.data,
          };
        }
      lastValidationError = err;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `generateSecondRoundCore: تلاش ${attempt} با خطای اعتبارسنجی شکست خورد (${err.code})، در حال retry...`
        );
      }
    }
  }

  // *** به‌روزرسانی — تأیید مدیر پروژه بر اساس شواهد واقعی (این گفتگو): ***
  // قبلاً اینجا لغزش خطای اعتبارسنجی نهایی throw می‌شد — یعنی یک کاربر
  // واقعی وسط جریان دور دوم با یک خطای خام (۴۲۲/۵۰۰) گیر می‌کرد، بدون
  // هیچ تصمیم قابل‌نمایش. این با قانون طلایی خودِ پروژه («هر خطای
  // AI/validation => doctor_review، هرگز dead-end») ناهماهنگ بود — آن
  // قانون قبلاً فقط در runAiTriageAnalysisCore پیاده‌سازی شده بود، نه اینجا.
  // حالا به‌جای throw، دقیقاً همان الگو اعمال می‌شود: یک نتیجه‌ی
  // doctor_review خودکار ساخته و به شکل escalate:true (که Backend/Frontend
  // از قبل برای حالت escalate واقعی AI پشتیبانی می‌کنند، پس تغییر شکل API
  // لازم نیست) برگردانده می‌شود.
  console.warn(
    `generateSecondRoundCore: همه‌ی ${MAX_ATTEMPTS} تلاش با خطای اعتبارسنجی شکست خوردند (${lastValidationError?.code}) — طبق قانون escalate-only، fallback به doctor_review.`
  );

  const fallbackTriageResult = buildFallbackTriageResult({
    sessionId,
    presentingProblemId,
    questionsAsked: round1QuestionsAsked,
    patientResponses: round1Responses,
    failureReason: `دور دوم بعد از ${MAX_ATTEMPTS} تلاش با خطای اعتبارسنجی شکست خورد: ${lastValidationError?.message}`,
  });

  const fallbackValidated = TriageResultSchema.safeParse(fallbackTriageResult);
  if (!fallbackValidated.success) {
    // اگر حتی fallback هم schema را نقض کند، این یک باگ داخلی جدی است —
    // نباید بی‌صدا رد شود؛ اینجا throw کردن اصل خطای اعتبارسنجی قبلی
    // امن‌تر از بلعیدن یک باگ ناشناخته است.
    throw lastValidationError;
  }

  return {
    escalate: true,
    urgencyLevel: fallbackValidated.data.urgency_level,
    triageResultJson: fallbackValidated.data,
  };
}

module.exports = {
  runAiTriageAnalysisCore,
  generateTriageQuestionsCore,
  generateSecondRoundCore,
};
