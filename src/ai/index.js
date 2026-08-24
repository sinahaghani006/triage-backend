/**
 * index.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا). بازسازی نیست. ***
 * نقطه ورود این ماژول طبق بریف رسمی:
 *   runAiTriageAnalysis({ sessionId, patientResponses }) -> { urgencyLevel, triageResultJson }
 *
 * *** نگاشت home_care (داخلی) → home_treatment (قرارداد خارجی Backend) ***
 * قانون پروژه: این ماژول داخلاً از 'home_care' استفاده می‌کند (چون
 * urgencyClassifier.js و URGENCY_ORDER همین‌طور طراحی شده‌اند)، اما
 * Backend انتظار 'home_treatment' را دارد. این فایل، نه urgencyClassifier.js،
 * مسئول این تبدیل نهایی است.
 *
 * *** یادآوری فرض طراحی (نگاه کن به aiTriageService.js) ***
 * امضای رسمی فقط patientResponses را ذکر کرده. این فایل فرض می‌کند
 * patientResponses یک object با شکل زیر است، نه صرفاً آرایه‌ای از رشته:
 *   {
 *     presentingProblemId, age, sex, weightKg, heightCm,
 *     questionsAsked: string[],
 *     responses: string[],
 *     patientHistory: Array<...>,
 *     medicalHistory: { chronicConditions, allergies, currentMedications, surgicalHistory, familyHistory }
 *   }
 * این فرض باید توسط مدیر پروژه تأیید یا اصلاح شود.
 */

const { runAiTriageAnalysisCore, generateTriageQuestionsCore, generateSecondRoundCore } = require('./aiTriageService');

const INTERNAL_TO_EXTERNAL_URGENCY_MAP = {
  normal: 'normal',
  home_care: 'home_treatment', // تنها نگاشت غیر یک‌به‌یک
  doctor_review: 'doctor_review',
  emergency: 'emergency',
};

function mapInternalToExternalUrgency(internalLevel) {
  const external = INTERNAL_TO_EXTERNAL_URGENCY_MAP[internalLevel];
  if (!external) {
    throw new Error(`نگاشت خارجی برای urgency level ناشناخته یافت نشد: ${internalLevel}`);
  }
  return external;
}

/**
 * نقطه ورود اصلی که Backend صدا می‌زند.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.patientResponses - نگاه کن به یادداشت فرض طراحی بالا.
 * @param {function} [params.providerFn] - تزریق provider برای تست با mock؛
 *   در تولید Backend باید provider واقعی (بر اساس AI_MODEL) را تزریق کند.
 * @returns {Promise<{ urgencyLevel: string, triageResultJson: object }>}
 */
async function runAiTriageAnalysis({ sessionId, patientResponses, providerFn }) {
  if (!providerFn) {
    throw new Error(
      'runAiTriageAnalysis: providerFn الزامی است (mock برای تست، provider واقعی در تولید). ' +
        'این فایل خودش هیچ provider واقعی‌ای را انتخاب یا import نمی‌کند.'
    );
  }

  const patientContext = {
    presentingProblemId: patientResponses?.presentingProblemId,
    age: patientResponses?.age,
    sex: patientResponses?.sex,
    weightKg: patientResponses?.weightKg,
    heightCm: patientResponses?.heightCm,
    questionsAsked: patientResponses?.questionsAsked || [],
    patientResponses: patientResponses?.responses || [],
    patientHistory: patientResponses?.patientHistory || [],
    medicalHistory: patientResponses?.medicalHistory,
  };

  const { urgencyLevel, triageResultJson } = await runAiTriageAnalysisCore({
    sessionId,
    patientContext,
    providerFn,
  });

  return {
    urgencyLevel: mapInternalToExternalUrgency(urgencyLevel),
    triageResultJson,
  };
}

/**
 * *** قابلیت جدید — نقطه ورود مرحله‌ی تولید سؤال پویا. ***
 * به دستور صریح مدیر پروژه، برای فراخوانی بعد از انتخاب شکایت توسط
 * بیمار، قبل از submit-symptoms نهایی. این تابع runAiTriageAnalysis
 * موجود را جایگزین یا تغییر نمی‌دهد — کاملاً مستقل و جداست.
 *
 * خروجی مستقیماً قابل نمایش در UI است: آرایه‌ای از ۵ سؤال، هرکدام با
 * متن سؤال و آرایه‌ی گزینه‌ها.
 *
 * *** تصمیم طراحی: در صورت خطای AI/provider/validation، این تابع خطا
 * را throw می‌کند، نه fallback خاموش. Backend باید تصمیم بگیرد در این
 * حالت چه کند (مثلاً رد شدن از این مرحله). ***
 *
 * @param {object} params
 * @param {string} params.presentingProblemId
 * @param {string} [params.initialDescription]
 * @param {number} params.age
 * @param {'male'|'female'} params.sex
 * @param {number} params.weightKg
 * @param {Array} [params.patientHistory] - خلاصه‌ی حداکثر ۱۰ مراجعه‌ی اخیر بیمار
 * @param {object} [params.medicalHistory] - { chronicConditions, allergies, currentMedications, surgicalHistory, familyHistory } — هرگز داده‌ی هویتی
 * @param {function} params.providerFn
 * @returns {Promise<{ questions: Array<{questionText: string, options: string[]}> }>}
 */
async function generateTriageQuestions({
  sessionId,
  presentingProblemId,
  initialDescription,
  age,
  sex,
  weightKg,
  patientHistory = [],
  medicalHistory,
  providerFn,
}) {
  if (!providerFn) {
    throw new Error('generateTriageQuestions: providerFn الزامی است (mock برای تست، provider واقعی در تولید).');
  }
  const result = await generateTriageQuestionsCore({
    sessionId,
    presentingProblemId,
    initialDescription,
    age,
    sex,
    weightKg,
    patientHistory,
    medicalHistory,
    providerFn,
  });
  if (result.escalate === true) {
    return {
      escalate: true,
      urgencyLevel: mapInternalToExternalUrgency(result.urgencyLevel),
      triageResultJson: result.triageResultJson,
    };
  }
  return result;
}

module.exports = {
  runAiTriageAnalysis,
  mapInternalToExternalUrgency,
  generateTriageQuestions,
  generateSecondRoundQuestions,
};

/**
 * *** قابلیت جدید — نقطه ورود دور دوم جریان پرسش دومرحله‌ای. ***
 * تأیید مدیر پروژه در همین گفتگو. فراخوانی بعد از این‌که کاربر به ۵
 * سؤال دور اول پاسخ داد. کاملاً مستقل از generateTriageQuestions و
 * runAiTriageAnalysis — هیچ‌کدام را جایگزین یا تغییر نمی‌دهد.
 *
 * *** نگاشت urgency (فقط در حالت escalate:true): ***
 * دقیقاً همان نگاشت home_care→home_treatment که در runAiTriageAnalysis
 * استفاده می‌شود، اینجا هم لازم است — چون در حالت escalate، خروجی این
 * تابع همان شکل TriageResult نهایی را دارد که Backend مستقیم ثبت می‌کند.
 * (در عمل urgency همیشه doctor_review یا emergency است — که هیچ‌کدام
 * نگاشت غیریک‌به‌یک ندارند — ولی از همان تابع مشترک استفاده می‌شود تا
 * منطق نگاشت یک‌جا و بدون تکرار بماند.)
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
 */
async function generateSecondRoundQuestions({
  sessionId,
  presentingProblemId,
  age,
  sex,
  weightKg,
  heightCm,
  round1QuestionsAsked,
  round1Responses,
  patientHistory = [],
  medicalHistory,
  providerFn,
}) {
  if (!providerFn) {
    throw new Error('generateSecondRoundQuestions: providerFn الزامی است (mock برای تست، provider واقعی در تولید).');
  }

  const result = await generateSecondRoundCore({
    sessionId,
    presentingProblemId,
    age,
    sex,
    weightKg,
    heightCm,
    round1QuestionsAsked,
    round1Responses,
    patientHistory,
    medicalHistory,
    providerFn,
  });

  if (result.escalate === true) {
    return {
      escalate: true,
      urgencyLevel: mapInternalToExternalUrgency(result.urgencyLevel),
      triageResultJson: result.triageResultJson,
    };
  }

  return result; // { escalate: false, questions: [...] }
}
