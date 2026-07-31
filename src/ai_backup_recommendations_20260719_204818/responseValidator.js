/**
 * responseValidator.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا). بازسازی نیست. ***
 * هیچ نسخه‌ی قبلی این فایل پیدا نشد. طراحی از صفر بر اساس بریف رسمی:
 * «پاسخ را JSON دریافت و اعتبارسنجی می‌کند».
 *
 * این فایل خروجی خام aiConnector.js (rawText) را parse و با AIRawResponseSchema
 * (از schemas.js) اعتبارسنجی می‌کند. هر خطای parse یا schema باعث پرتاب خطا
 * می‌شود — این فایل هرگز مقدار پیش‌فرض حدسی برنمی‌گرداند؛ تصمیم fallback به
 * urgencyClassifier.js سپرده شده (طبق قانون طلایی #۳: هر خطا => doctor_review).
 */

const { AIRawResponseSchema, TriageQuestionsRawSchema } = require('./schemas');

class ResponseValidationError extends Error {
  constructor(message, { cause, code, rawText } = {}) {
    super(message);
    this.name = 'ResponseValidationError';
    this.code = code || 'RESPONSE_VALIDATION_ERROR';
    if (cause) this.cause = cause;
    if (rawText !== undefined) this.rawText = rawText;
  }
}

/**
 * *** لایه‌ی دفاعی جدید — به دستور صریح مدیر پروژه. ***
 * حتی وقتی provider با response_format روی JSON mode تنظیم شده، بعضی
 * وقت‌ها متن اضافه (مثل ```json ... ``` code fence، یا فاصله‌ی اضافه)
 * دور خروجی می‌ذارد. این تابع قبل از JSON.parse، چنین بسته‌بندی‌ای را
 * در صورت وجود حذف می‌کند — این جایگزین تنظیم response_format در
 * provider نیست، فقط یک لایه‌ی دفاعی اضافه است.
 */
function stripCodeFenceWrapper(rawText) {
  if (typeof rawText !== 'string') return rawText;
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

/**
 * parse امن متن خام به JSON، بدون فرض بر ساختار.
 */
function safeParseJson(rawText) {
  const cleaned = stripCodeFenceWrapper(rawText);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new ResponseValidationError('پاسخ AI یک JSON معتبر نیست.', {
      code: 'INVALID_JSON',
      cause: err,
      rawText,
    });
  }
}

/**
 * اعتبارسنجی کامل: parse + تطبیق با AIRawResponseSchema.
 * @param {string} rawText - متنی که از aiConnector.js (result.rawText) آمده.
 * @returns {import('./schemas').AIRawResponseSchema._output} داده‌ی معتبرشده.
 * @throws {ResponseValidationError} اگر JSON نامعتبر یا schema mismatch باشد.
 */
function validateAIResponse(rawText) {
  const parsed = safeParseJson(rawText);

  const result = AIRawResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new ResponseValidationError('پاسخ AI با قرارداد خروجی (AIRawResponseSchema) مطابقت ندارد.', {
      code: 'SCHEMA_MISMATCH',
      cause: result.error,
      rawText,
    });
  }

  return result.data;
}

/**
 * *** لایه‌ی دفاعی جدید — تشخیص و مدیریت artifact زبان خارجی. ***
 * به دستور مدیر پروژه، بعد از کشف باگ واقعی با Groq: گاهی مدل یک کلمه
 * از زبان دیگری (مثلاً ویتنامی) وسط متن فارسی/انگلیسی leak می‌کند.
 * تشخیص: حروف لاتین با علامت تشدید (accented) در فارسی/انگلیسی پزشکی
 * رایج عملاً وجود ندارند، پس نشانه‌ی قابل‌اعتمادی برای این artifact‌اند.
 */
const ACCENTED_LATIN_PATTERN = /[À-ÿ\u1E00-\u1EFF]/;

/**
 * آیا این متن حاوی کلمه‌ای با حروف لاتین accented (نشانه‌ی احتمالی leak
 * زبان دیگر) است؟
 */
function containsForeignLanguageArtifact(text) {
  return typeof text === 'string' && ACCENTED_LATIN_PATTERN.test(text);
}

/**
 * کلمات حاوی حروف لاتین accented را از متن حذف می‌کند (نه کل جمله)،
 * و فاصله‌های اضافه‌ی باقی‌مانده را جمع می‌کند. برای فیلدهای غیر بحرانی
 * مثل reasoning استفاده می‌شود — هرگز روی urgency_level یا clinical_alerts.
 */
function stripForeignLanguageArtifacts(text) {
  if (typeof text !== 'string') return text;
  const cleaned = text
    .split(/\s+/)
    .filter((word) => !ACCENTED_LATIN_PATTERN.test(word))
    .join(' ')
    .replace(/\s+([.,،؛])/g, '$1')
    .trim();
  return cleaned;
}

module.exports = {
  ResponseValidationError,
  safeParseJson,
  validateAIResponse,
  validateQuestionsResponse,
  containsForeignLanguageArtifact,
  stripForeignLanguageArtifacts,
};

/**
 * *** قابلیت جدید — اعتبارسنجی پاسخ مرحله‌ی تولید سؤال پویا. ***
 * جدا از validateAIResponse چون schema و مرحله‌ی جریان کاملاً متفاوتند.
 * علاوه بر schema (تعداد گزینه‌ها ۲-۴)، تعداد دقیق سؤالات (همیشه ۳) را
 * هم اینجا صریحاً چک می‌کند — چون شبیه‌ساز zod محلی از .length() پشتیبانی
 * نمی‌کرد؛ با zod واقعی هم این چک اضافی بی‌ضرر و فقط برای اطمینان مضاعف است.
 *
 * @param {string} rawText
 * @returns {{ questions: Array<{questionText: string, options: string[]}> }}
 * @throws {ResponseValidationError}
 */
function validateQuestionsResponse(rawText) {
  const parsed = safeParseJson(rawText);

  const result = TriageQuestionsRawSchema.safeParse(parsed);
  if (!result.success) {
    throw new ResponseValidationError('پاسخ AI با قرارداد سؤالات (TriageQuestionsRawSchema) مطابقت ندارد.', {
      code: 'QUESTIONS_SCHEMA_MISMATCH',
      cause: result.error,
      rawText,
    });
  }

  if (result.data.questions.length !== 3) {
    throw new ResponseValidationError(
      `تعداد سؤالات باید دقیقاً ۳ باشد، ولی AI ${result.data.questions.length} سؤال برگرداند.`,
      { code: 'QUESTIONS_COUNT_MISMATCH', rawText }
    );
  }

  // *** لایه‌ی دفاعی جدید: artifact زبان خارجی در سؤالاتی که مستقیم به
  // بیمار نشان داده می‌شوند، باعث throw می‌شود (نه strip) — چون اینجا
  // برخلاف تحلیل نهایی، هیچ urgency_level حساسی در معرض downgrade
  // اشتباه نیست؛ فقط باید یا سؤال تمیز باشد یا اصلاً نمایش داده نشود.
  for (const q of result.data.questions) {
    if (containsForeignLanguageArtifact(q.questionText) || q.options.some(containsForeignLanguageArtifact)) {
      throw new ResponseValidationError(
        'یکی از سؤالات حاوی کلمه‌ای از زبان غیرمنتظره است (احتمالاً artifact مدل) — برای جلوگیری از گیج‌کردن بیمار رد شد.',
        { code: 'LANGUAGE_ARTIFACT_DETECTED', rawText }
      );
    }
  }

  return result.data;
}
