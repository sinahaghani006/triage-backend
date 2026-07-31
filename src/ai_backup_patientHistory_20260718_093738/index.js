/**
 * index.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا). بازسازی نیست. ***
 * نقطه ورود این ماژول طبق بریف رسمی:
 *   runAiTriageAnalysis({ sessionId, patientResponses }) -> { urgencyLevel, triageResultJson }
 *
 * *** نگاشت home_care (داخلی) → home_treatment (قرارداد خارجی Backend) ***
 * قانون پروژه: این ماژول داخلاً از 'home_care' استفاده می‌کند (چون
 * urgencyClassifier.js و URGENCY_ORDER همینطور طراحی شده‌اند)، اما
 * Backend انتظار 'home_treatment' را دارد. این فایل، نه urgencyClassifier.js،
 * مسئول این تبدیل نهایی است.
 *
 * *** یادآوری فرض طراحی (نگاه کن به aiTriageService.js) ***
 * امضای رسمی فقط patientResponses را ذکر کرده. این فایل فرض می‌کند
 * patientResponses یک object با شکل زیر است، نه صرفاً آرایه‌ای از رشته:
 *   {
 *     presentingProblemId, age, sex, weightKg,
 *     questionsAsked: string[],
 *     responses: string[]
 *   }
 * این فرض باید توسط مدیر پروژه تأیید یا اصلاح شود.
 */

const { runAiTriageAnalysisCore, generateTriageQuestionsCore } = require('./aiTriageService');
const { getPresentingProblemsList } = require('./presentingProblems');
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
    questionsAsked: patientResponses?.questionsAsked || [],
    patientResponses: patientResponses?.responses || [],
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

module.exports = {
  runAiTriageAnalysis,
  mapInternalToExternalUrgency,
  generateTriageQuestions,
  getPresentingProblemsList,
};
/**
 * *** قابلیت جدید — نقطه ورود مرحله‌ی تولید سؤال پویا. ***
 * به دستور صریح مدیر پروژه، برای فراخوانی بعد از انتخاب شکایت توسط
 * بیمار، قبل از submit-symptoms نهایی. این تابع runAiTriageAnalysis
 * موجود را جایگزین یا تغییر نمی‌دهد — کاملاً مستقل و جداست.
 *
 * خروجی مستقیماً قابل نمایش در UI است: آرایه‌ای از ۳ سؤال، هرکدام با
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
 * @param {function} params.providerFn
 * @returns {Promise<{ questions: Array<{questionText: string, options: string[]}> }>}
 */
async function generateTriageQuestions({ presentingProblemId, initialDescription, age, sex, weightKg, providerFn }) {
  if (!providerFn) {
    throw new Error('generateTriageQuestions: providerFn الزامی است (mock برای تست، provider واقعی در تولید).');
  }
  return generateTriageQuestionsCore({ presentingProblemId, initialDescription, age, sex, weightKg, providerFn });
}
