/**
 * promptGenerator.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا). بازسازی نیست. ***
 * هیچ نسخه‌ی قبلی این فایل پیدا نشد. طراحی از صفر بر اساس بریف رسمی:
 * «سیستم بر اساس پرونده بیمار پرامپت مناسب تولید می‌کند».
 *
 * قانون حیاتی رعایت‌شده: هیچ داده هویتی (نام، کد ملی، آدرس) در prompt قرار
 * نمی‌گیرد — فقط presentingProblemId، سن، جنس، وزن، و سوابق پرسش/پاسخ.
 *
 * *** شکاف شناخته‌شده: بند ۷ (توصیه‌های عمومی مراقبتی) ***
 * این پرامپت طبق تصمیم فعلی، از AI درخواست «توصیه‌ی متن پزشکی» نمی‌کند،
 * چون schemas.js فعلاً فیلدی برای آن ندارد و تولید توصیه‌ی پزشکی حدسی توسط
 * این ماژول با قانون «AI جایگزین تأیید پزشکی نمی‌شود» در تضاد است. اگر مدیر
 * پروژه بخواهد این قابلیت اضافه شود، باید ابتدا schemas.js و این فایل با هم،
 * با تأیید صریح، به‌روزرسانی شوند.
 */

const { URGENCY_LEVELS } = require('./schemas');

const SYSTEM_INSTRUCTIONS = `
تو یک دستیار غربالگری بالینی هستی، نه یک پزشک. وظیفه‌ات فقط طبقه‌بندی
اولیه‌ی فوریت بر اساس اطلاعات داده‌شده است، نه تشخیص یا تجویز درمان.

خروجی تو باید دقیقاً یک شیء JSON با این ساختار باشد و هیچ متن دیگری
(توضیح، markdown، پیش‌نویس) نداشته باشد:

{
  "urgency_suggestion": یکی از [${URGENCY_LEVELS.join(', ')}],
  "confidence": عددی بین 0 و 1,
  "reasoning": "توضیح کوتاه بالینی برای این طبقه‌بندی",
  "clinical_alerts": ["هر علامت هشدار جدی که باید به پزشک انسانی اطلاع داده شود"],
  "is_complete": true اگر اطلاعات کافی برای طبقه‌بندی داری، در غیر این صورت false
}

قوانین:
- اگر مطمئن نیستی یا اطلاعات کافی نداری، is_complete را false بگذار و
  confidence را پایین نگه‌دار — سیستم به‌صورت خودکار به doctor_review
  escalate می‌کند، پس تو نیازی به احتیاط‌کاری بیش‌ازحد در urgency_suggestion
  نداری؛ فقط صادقانه confidence واقعی‌ات را گزارش بده.
- هرگز تشخیص قطعی یا نسخه‌ی دارویی صادر نکن.
- علائمی مثل درد قفسه سینه، تنگی نفس شدید، از دست دادن هوشیاری، خونریزی
  شدید را همیشه در clinical_alerts ذکر کن، حتی اگر urgency_suggestion
  پایین‌تر باشد.
`.trim();

/**
 * تولید prompt نهایی برای ارسال به AI provider.
 * @param {object} params
 * @param {string} params.presentingProblemId
 * @param {number} params.age
 * @param {'male'|'female'} params.sex
 * @param {number} params.weightKg
 * @param {string[]} [params.questionsAsked]
 * @param {string[]} [params.patientResponses]
 * @returns {{ system: string, user: string }}
 */
function generateTriagePrompt({
  presentingProblemId,
  age,
  sex,
  weightKg,
  questionsAsked = [],
  patientResponses = [],
}) {
  if (!presentingProblemId || typeof age !== 'number' || !sex || typeof weightKg !== 'number') {
    throw new Error('generateTriagePrompt: ورودی ناقص — presentingProblemId, age, sex, weightKg الزامی هستند.');
  }

  const qaLines = questionsAsked
    .map((q, i) => `س${i + 1}: ${q}\nج${i + 1}: ${patientResponses[i] ?? '(پاسخ داده نشده)'}`)
    .join('\n');

  const userContent = `
شکایت اصلی (presenting_problem_id): ${presentingProblemId}
سن: ${age}
جنس: ${sex === 'male' ? 'مرد' : 'زن'}
وزن: ${weightKg} کیلوگرم

${qaLines ? `سوابق پرسش و پاسخ:\n${qaLines}` : 'هنوز هیچ سؤال و پاسخی ثبت نشده است.'}

بر اساس این اطلاعات، طبق فرمت خواسته‌شده در دستورالعمل سیستم پاسخ بده.
`.trim();

  return {
    system: SYSTEM_INSTRUCTIONS,
    user: userContent,
  };
}

module.exports = {
  generateTriagePrompt,
  SYSTEM_INSTRUCTIONS,
};
