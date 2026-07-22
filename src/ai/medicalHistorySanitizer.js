/**
 * medicalHistorySanitizer.js
 *
 * *** فایل جدید — Task «اتصال Medical History»، تأیید مدیر پروژه در همین گفتگو. ***
 *
 * قرارداد واقعی Backend (GET /users/me/medical-history، تأییدشده با شواهد
 * خام از medicalHistoryValidators.js):
 *   { chronicConditions, allergies, currentMedications, surgicalHistory, familyHistory }
 * هر پنج فیلد آرایه‌ای از متن آزاد (string[]) هستند — بدون هیچ اعتبارسنجی
 * محتوایی (فقط isString در Backend چک می‌شود).
 *
 * *** دلیل وجود این فایل — تصمیم صریح تأییدشده: ***
 * چون این فیلدها متن آزادند، بیمار می‌تواند سهواً داده‌ی هویتی (اسم شخص،
 * شماره تلفن، کدملی) در آن‌ها بنویسد. طبق قانون حیاتی پروژه («هیچ داده‌ی
 * هویتی نباید به AI provider ارسال شود»)، قبل از قرار گرفتن در prompt باید
 * این متن‌ها پاک‌سازی شوند. این یک دفاع کدی مستقل است — همراه با یک
 * دستورالعمل مکمل در پرامپت (promptGenerator.js) که از AI می‌خواهد هر
 * چیز هویتی‌مانندی که با این حال دید را نادیده بگیرد.
 *
 * *** ⚠️ محدودیت صادقانه — باید همیشه در نظر گرفته شود: ***
 * این فیلتر فقط الگوهای دارای ساختار قابل‌تشخیص با regex را می‌گیرد:
 * شماره تلفن، کدملی (هر دنباله‌ی ۹ رقم یا بیشتر، فارسی یا لاتین)، و ایمیل.
 * این فیلتر نمی‌تواند اسم واقعی افراد را تشخیص دهد (مثل «علی محمدی» یا
 * «دکتر احمدی») چون اسم هیچ الگوی ساختاری ثابتی ندارد — تشخیص واقعی اسم
 * نیازمند یک مدل NLP (NER) است که در این لایه وجود ندارد و خارج از scope
 * این Task است. این محدودیت باید برای هر توسعه‌دهنده‌ی بعدی صریح و روشن
 * باشد؛ این فیلتر «بهترین تلاش با ابزار موجود» است، نه تضمین کامل.
 *
 * سقف تعداد آیتم هر فیلد: ۱۰ (طبق تصمیم تأییدشده، هم‌راستا با سقف
 * patientHistory در promptGenerator.js).
 */

const MAX_ITEMS_PER_FIELD = 10;
const REDACTED_PLACEHOLDER = '[حذف‌شده]';

// دنباله‌ی ۹ رقم یا بیشتر (فارسی ۰-۹ یا لاتین 0-9) — شماره تلفن/کدملی را می‌گیرد.
// عمداً محافظه‌کارانه (۹ رقم به بالا) تا اعداد کوتاه بالینی (مثل «۲ هفته») حذف نشوند.
const DIGIT_SEQUENCE_PATTERN = /[0-9۰-۹]{9,}/g;

// ایمیل — الگوی استاندارد.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const MEDICAL_HISTORY_FIELDS = [
  'chronicConditions',
  'allergies',
  'currentMedications',
  'surgicalHistory',
  'familyHistory',
];

/**
 * پاک‌سازی یک رشته‌ی متن آزاد از الگوهای قابل‌تشخیص هویتی.
 * @param {string} text
 * @returns {string}
 */
function sanitizeFreeText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(DIGIT_SEQUENCE_PATTERN, REDACTED_PLACEHOLDER).replace(EMAIL_PATTERN, REDACTED_PLACEHOLDER).trim();
}

/**
 * پاک‌سازی و محدودسازی یک آرایه‌ی فیلد Medical History.
 * @param {unknown} fieldValue
 * @returns {string[]}
 */
function sanitizeField(fieldValue) {
  if (!Array.isArray(fieldValue)) return [];
  return fieldValue
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .slice(0, MAX_ITEMS_PER_FIELD)
    .map(sanitizeFreeText)
    .filter((item) => item.length > 0);
}

/**
 * پاک‌سازی کامل شیء medicalHistory دریافتی از Backend.
 * ورودی و خروجی هر دو شکل یکسانی دارند (۵ فیلد آرایه‌ای)؛ فقط محتوا
 * پاک‌سازی و سقف تعداد اعمال می‌شود.
 *
 * @param {{chronicConditions?: string[], allergies?: string[], currentMedications?: string[], surgicalHistory?: string[], familyHistory?: string[]}} [medicalHistory]
 * @returns {{chronicConditions: string[], allergies: string[], currentMedications: string[], surgicalHistory: string[], familyHistory: string[]}}
 */
function sanitizeMedicalHistory(medicalHistory) {
  const result = {};
  for (const field of MEDICAL_HISTORY_FIELDS) {
    result[field] = sanitizeField(medicalHistory?.[field]);
  }
  return result;
}

/**
 * آیا بعد از پاک‌سازی، اصلاً چیزی برای نمایش در prompt باقی مانده؟
 * @param {ReturnType<typeof sanitizeMedicalHistory>} sanitized
 * @returns {boolean}
 */
function hasAnyMedicalHistoryContent(sanitized) {
  return MEDICAL_HISTORY_FIELDS.some((field) => Array.isArray(sanitized[field]) && sanitized[field].length > 0);
}

module.exports = {
  sanitizeMedicalHistory,
  hasAnyMedicalHistoryContent,
  sanitizeFreeText,
  MEDICAL_HISTORY_FIELDS,
  MAX_ITEMS_PER_FIELD,
};
