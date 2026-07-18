/**
 * urgencyClassifier.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا). بازسازی نیست. ***
 * جست‌وجوی کامل دیسک کاربر (فایل‌های مشخص + zip ها) و کل تاریخچه‌ی git
 * (git log --all --full-history -- src/ai) هیچ نسخه‌ی قابل‌اثباتی از این
 * فایل یا خواهرانش پیدا نکرد. این پیاده‌سازی از صفر، صرفاً بر اساس قوانین
 * کسب‌وکار مستندشده در بریف رسمی مدیرعامل سینا نوشته شده است — به‌خصوص:
 *   - منطق محافظه‌کارانه escalate-only (هرگز downgrade خودکار)
 *   - هر ابهام یا عدم قطعیت → doctor_review
 *   - AI هرگز جایگزین تأیید پزشکی واقعی نمی‌شود
 *
 * منبع دیگر: schemas.js همین پروژه (TriageResultSchema, AIRawResponseSchema)
 * که در همین طراحی جدید ساخته شد.
 *
 * قبل از استفاده در تولید باید توسط مدیر پروژه بازبینی نهایی شود.
 */

const { stripForeignLanguageArtifacts } = require('./responseValidator');

// ترتیب فوریت از کم به زیاد — دقیقاً مطابق سند: normal < home_care < doctor_review < emergency
const URGENCY_ORDER = ['normal', 'home_care', 'doctor_review', 'emergency'];

/**
 * یک پله در جهت escalate (فوری‌تر) حرکت می‌کند. هرگز در جهت عکس حرکت نمی‌کند.
 */
function escalateOneLevel(level) {
  const idx = URGENCY_ORDER.indexOf(level);
  if (idx === -1 || idx === URGENCY_ORDER.length - 1) return level;
  return URGENCY_ORDER[idx + 1];
}

/**
 * قلب منطق محافظه‌کارانه. از urgency_suggestion خام AI شروع می‌کند و
 * فقط در جهت escalate تغییرش می‌دهد — هرگز downgrade خودکار.
 *
 * قانون ۱: اگر confidence < 0.65 و سطح normal یا home_care باشد، یک پله
 *   escalate کن. آستانه‌ی 0.65 در این طراحی جدید تعیین شده و قابل تنظیم
 *   است — باید توسط مدیر پروژه تأیید یا اصلاح شود.
 * قانون ۲: اگر clinical_alerts غیرخالی باشد ولی سطح همچنان normal باشد،
 *   مستقیم به doctor_review escalate کن.
 *
 * قانون ۳ (خطای کامل AI => doctor_review) در buildFallbackTriageResult
 * پیاده‌سازی شده، نه اینجا — چون آن حالت اصلاً aiRaw معتبر ندارد.
 *
 * *** خروجی جدید: escalationReasons ***
 * علاوه بر سطح نهایی، این تابع حالا مشخص می‌کند کدام قاعده(ها) باعث
 * escalate خودکار شدند — تا buildTriageResultFromAI بتواند برای مسیر
 * escalate خودکار (که AI موقع نوشتن reasoning از آن خبر نداشت) یک
 * توضیح مکانیکی و کاملاً غیرتشخیصی اضافه کند.
 */
function applyConservativeRules({ urgencySuggestion, confidence, clinicalAlerts }) {
  let level = urgencySuggestion;
  const escalationReasons = [];

  if (
    typeof confidence === 'number' &&
    confidence < 0.65 &&
    (level === 'normal' || level === 'home_care')
  ) {
    level = escalateOneLevel(level);
    escalationReasons.push('low_confidence');
  }

  if (Array.isArray(clinicalAlerts) && clinicalAlerts.length > 0 && level === 'normal') {
    level = 'doctor_review';
    escalationReasons.push('clinical_alerts');
  }

  return { level, escalationReasons };
}

/**
 * متن مکانیکی و ثابت (نه تولیدشده توسط AI) که توضیح می‌دهد چرا سیستم
 * به‌صورت خودکار escalate کرده — کاملاً بدون هیچ قضاوت پزشکی، فقط
 * توضیح قاعده‌ی escalate-only. این متن به reasoning خام AI اضافه
 * می‌شود، نه جایگزین آن.
 */
function buildEscalationExplanation(escalationReasons) {
  const parts = [];
  if (escalationReasons.includes('low_confidence')) {
    parts.push(
      'این ارجاع به‌صورت خودکار و طبق قاعده‌ی احتیاطی سیستم انجام شده، چون سطح اطمینان تحلیل اولیه برای تصمیم‌گیری قطعی کافی نبود.'
    );
  }
  if (escalationReasons.includes('clinical_alerts')) {
    parts.push(
      'این ارجاع به‌صورت خودکار و طبق قاعده‌ی احتیاطی سیستم انجام شده، چون علائم هشداری در پاسخ‌های ثبت‌شده وجود دارد که نیاز به بررسی مستقیم پزشک دارد.'
    );
  }
  return parts.join(' ');
}

/**
 * ساخت نتیجه نهایی از یک پاسخ معتبرشده AI (is_complete === true).
 *
 * *** نکته مهم درباره recommendations: ***
 * AIRawResponseSchema فعلی (schemas.js) هیچ فیلدی برای متن توصیه ندارد،
 * در حالی‌که SYSTEM_INSTRUCTIONS در promptGenerator.js فعلاً از AI متن
 * توصیه نمی‌خواهد (تصمیم آگاهانه در همین طراحی جدید). اگر این قابلیت بعداً
 * اضافه شود، schemas.js و promptGenerator.js باید هم‌زمان و با تأیید مدیر
 * پروژه به‌روزرسانی شوند. تا آن زمان، این تابع عمداً recommendations را خالی برمی‌گرداند
 * (پیش‌فرض امن schema) و هیچ متن پزشکی حدسی تولید نمی‌کند، چون این دقیقاً
 * همان کاری‌ست که قانون غیرقابل‌مذاکره پروژه («AI هرگز جایگزین تأیید پزشکی
 * نمی‌شود») منع می‌کند.
 */
function buildTriageResultFromAI({
  aiRaw,
  meta,
  sessionId,
  presentingProblemId,
  questionsAsked = [],
  patientResponses = [],
}) {
  const { level: finalLevel, escalationReasons } = applyConservativeRules({
    urgencySuggestion: aiRaw.urgency_suggestion,
    confidence: aiRaw.confidence,
    clinicalAlerts: aiRaw.clinical_alerts,
  });

  const rawReasoning = aiRaw.reasoning || '';
  // *** لایه‌ی دفاعی جدید: artifact زبان خارجی فقط از متن reasoning پاک
  // می‌شود — هرگز روی urgency_level یا clinical_alerts دست‌کاری نمی‌کنیم،
  // چون throw کردن کل نتیجه (و fallback به doctor_review) می‌تواند یک
  // تشخیص emergency واقعی را به‌اشتباه تنزل دهد — دقیقاً همان چیزی که
  // قانون escalate-only (هرگز downgrade خودکار) ممنوع کرده است.
  const baseReasoning = stripForeignLanguageArtifacts(rawReasoning);
  // اگر escalate خودکار رخ داده (یعنی AI موقع نوشتن reasoning از این
  // تصمیم خبر نداشت)، یک توضیح مکانیکی و غیرتشخیصی اضافه می‌کنیم تا
  // «چرایی ارجاع» در همه‌ی مسیرهای doctor_review پوشش داده شود، نه فقط
  // وقتی خود AI مستقیم doctor_review پیشنهاد داده.
  const escalationExplanation =
    escalationReasons.length > 0 ? buildEscalationExplanation(escalationReasons) : '';
  const finalReasoning = escalationExplanation
    ? `${baseReasoning} ${escalationExplanation}`.trim()
    : baseReasoning;

  return {
    session_id: sessionId,
    presenting_problem_id: presentingProblemId,
    urgency_level: finalLevel,
    confidence: typeof aiRaw.confidence === 'number' ? aiRaw.confidence : 0,
    reasoning: finalReasoning,
    clinical_alerts: aiRaw.clinical_alerts || [],
    recommendations: [], // عمداً خالی — نگاه کن به کامنت بالا
    questions_asked: questionsAsked,
    patient_responses: patientResponses,
    generated_at: new Date().toISOString(),
    model_meta: {
      provider: meta && meta.provider,
      model: meta && meta.model,
      fallback_used: false,
    },
  };
}

/**
 * ساخت نتیجه fallback ایمن — قانون طلایی #۳ سند: در هر نوع خطای AI یا
 * provider (timeout، پاسخ نامعتبر، عدم قطعیت غیرقابل‌حل)، همیشه و فقط
 * doctor_review. هرگز چیز دیگری، هرگز حدس زدن سطح فوریت.
 */
function buildFallbackTriageResult({
  sessionId,
  presentingProblemId,
  questionsAsked = [],
  patientResponses = [],
  failureReason,
}) {
  return {
    session_id: sessionId,
    presenting_problem_id: presentingProblemId,
    urgency_level: 'doctor_review',
    confidence: 0,
    reasoning: `AI در دسترس نبود یا خروجی نامعتبر بود (دلیل: ${failureReason || 'نامشخص'}). طبق قانون escalate-only پروژه، به‌صورت ایمن doctor_review انتخاب شد.`,
    clinical_alerts: [],
    recommendations: [],
    questions_asked: questionsAsked,
    patient_responses: patientResponses,
    generated_at: new Date().toISOString(),
    model_meta: {
      fallback_used: true,
    },
  };
}

module.exports = {
  URGENCY_ORDER,
  escalateOneLevel,
  applyConservativeRules,
  buildEscalationExplanation,
  buildTriageResultFromAI,
  buildFallbackTriageResult,
};
