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

const { AIRawResponseSchema, TriageQuestionsRawSchema, SecondRoundQuestionsSchema, SecondRoundEscalationSchema } = require('./schemas');

class ResponseValidationError extends Error {
  constructor(message, { cause, code, rawText } = {}) {
    super(message);
    this.name = 'ResponseValidationError';
    this.code = code || 'RESPONSE_VALIDATION_ERROR';
    if (cause) this.cause = cause;
    if (rawText !== undefined) this.rawText = rawText;
  }
}

function stripCodeFenceWrapper(rawText) {
  if (typeof rawText !== 'string') return rawText;
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

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
 * *** عقب‌گرد فوری — تصمیم اضطراری بر اساس شواهد واقعی production. ***
 * افزودن بازه‌های یونیکد CJK (commit قبلی، cb52be1) باعث نرخ رد ۷۵٪ در
 * تست‌های واقعی شد — با اینکه بررسی تئوریک هیچ همپوشانی مستقیمی بین
 * بازه‌های CJK و بلاک یونیکد فارسی/عربی (۰۶۰۰-۰۶FF) یا علائم نگارشی
 * رایج فارسی پیدا نکرد. چون علت دقیق (کدام کاراکتر واقعی باعث شده) بدون
 * متن خام مدل قابل‌تشخیص نیست، و نرخ ۷۵٪ رد بسیار بدتر از ریسک اصلی
 * (نشت نادر یک کلمه‌ی خارجی) است، بازه‌های CJK **موقتاً غیرفعال** شدند —
 * الگو به حالت قبل (فقط لاتین accented، همان چیزی که با نرخ نرمال کار
 * می‌کرد) برگشت.
 *
 * *** ⚠️ این تغییر قبلاً یک‌بار به‌صورت محلی انجام شده بود ولی هرگز
 * commit/push/deploy نشده بود — این فایل همان فیکس را نهایی می‌کند. ***
 *
 * *** برای این‌که این‌بار بدون حدس تشخیص بدهیم: ***
 * findForeignLanguageArtifactMatch اضافه شده تا وقتی (و اگر) دوباره
 * چنین چیزی رخ داد، خود کاراکتر/کلمه‌ی محرک در پیام خطا (که در
 * error_logs.message ذخیره می‌شود) قابل‌مشاهده باشد — نه فقط یک پیام
 * عمومی. اگر می‌خواهید CJK دوباره فعال شود، این کار را فقط بعد از
 * دیدن شواهد واقعی (کدام کاراکتر) در همین لاگ‌های جدید انجام دهید.
 */
const FOREIGN_LANGUAGE_ARTIFACT_PATTERN = /[À-ÿ\u1E00-\u1EFF]/;

function containsForeignLanguageArtifact(text) {
  return typeof text === 'string' && FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(text);
}

/**
 * پیدا کردن خودِ کاراکتر/کلمه‌ی محرک — فقط برای گنجاندن در پیام خطا،
 * تا در error_logs.message قابل‌مشاهده باشد (چون error_logs متن خام
 * کامل مدل را ذخیره نمی‌کند).
 * @param {string} text
 * @returns {string|null} کلمه‌ی حاوی کاراکتر مشکوک، یا null اگر چیزی نبود
 */
function findForeignLanguageArtifactMatch(text) {
  if (typeof text !== 'string') return null;
  const words = text.split(/\s+/);
  const match = words.find((word) => FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word));
  return match || null;
}

function stripForeignLanguageArtifacts(text) {
  if (typeof text !== 'string') return text;
  const cleaned = text
    .split(/\s+/)
    .filter((word) => !FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word))
    .join(' ')
    .replace(/\s+([.,،؛])/g, '$1')
    .trim();
  return cleaned;
}

const SUSPICIOUS_RECOMMENDATION_PATTERNS = [
  /استامینوفن|ایبوپروفن|آسپرین|آموکسی‌?سیلین|پاراستامول|acetaminophen|ibuprofen|aspirin|amoxicillin|paracetamol|tylenol|advil/i,
  /قرص|کپسول|شربت|آمپول|میلی‌?گرم|\bmg\b|بار در روز|هر\s*[\d۰-۹٠-٩]+\s*ساعت/,
  /مبتلا(ید|هستید)?|تشخیص قطعی|بیماری شما (است|هست)/,
];

function isRecommendationSuspicious(text) {
  if (typeof text !== 'string') return true;
  return SUSPICIOUS_RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeRecommendations(recommendations) {
  if (!Array.isArray(recommendations)) return [];
  return recommendations.filter((r) => !isRecommendationSuspicious(r));
}

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

  if (result.data.questions.length !== 5) {
    throw new ResponseValidationError(
      `تعداد سؤالات باید دقیقاً ۵ باشد، ولی AI ${result.data.questions.length} سؤال برگرداند.`,
      { code: 'QUESTIONS_COUNT_MISMATCH', rawText }
    );
  }

  for (const q of result.data.questions) {
    if (containsForeignLanguageArtifact(q.questionText) || q.options.some(containsForeignLanguageArtifact)) {
      const matchedWord =
        findForeignLanguageArtifactMatch(q.questionText) ||
        q.options.map(findForeignLanguageArtifactMatch).find(Boolean) ||
        '(نامشخص)';
      throw new ResponseValidationError(
        `یکی از سؤالات حاوی کلمه‌ای از زبان غیرمنتظره است (احتمالاً artifact مدل) — برای جلوگیری از گیج‌کردن بیمار رد شد. کلمه‌ی محرک: "${matchedWord}"`,
        { code: 'LANGUAGE_ARTIFACT_DETECTED', rawText }
      );
    }
  }

  return result.data;
}

/**
 * *** قابلیت جدید — اعتبارسنجی پاسخ دور دوم جریان پرسش دومرحله‌ای. ***
 * تأیید مدیر پروژه در همین گفتگو. جدا از validateQuestionsResponse و
 * validateAIResponse چون خروجی این مرحله دو شکل ممکن دارد (escalate
 * true/false) — نگاه کن به SecondRoundQuestionsSchema/SecondRoundEscalationSchema
 * در schemas.js.
 *
 * *** طراحی: branching بر اساس فیلد escalate در کد انجام می‌شود (نه با
 * zod union) — چون شبیه‌ساز محلی zod از union پشتیبانی نمی‌کرد و این
 * روش با zod واقعی هم به همان اندازه درست و حتی خواناتر است. ***
 *
 * @param {string} rawText
 * @returns {{escalate:false, questions: Array} | {escalate:true, urgency_suggestion:string, confidence:number, reasoning:string, clinical_alerts:string[], recommendations:string[], is_complete:boolean}}
 * @throws {ResponseValidationError}
 */
function validateSecondRoundResponse(rawText) {
  const parsed = safeParseJson(rawText);

  if (typeof parsed?.escalate !== 'boolean') {
    throw new ResponseValidationError(
      'پاسخ AI فیلد escalate (boolean) را ندارد یا نوعش نادرست است.',
      { code: 'SECOND_ROUND_SCHEMA_MISMATCH', rawText }
    );
  }

  if (parsed.escalate === true) {
    const result = SecondRoundEscalationSchema.safeParse(parsed);
    if (!result.success) {
      throw new ResponseValidationError(
        'پاسخ escalate:true با SecondRoundEscalationSchema مطابقت ندارد (شاید urgency_suggestion خارج از doctor_review/emergency باشد).',
        { code: 'SECOND_ROUND_ESCALATION_SCHEMA_MISMATCH', cause: result.error, rawText }
      );
    }
    return result.data;
  }

  // escalate === false
  const result = SecondRoundQuestionsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ResponseValidationError(
      'پاسخ escalate:false با SecondRoundQuestionsSchema مطابقت ندارد.',
      { code: 'SECOND_ROUND_QUESTIONS_SCHEMA_MISMATCH', cause: result.error, rawText }
    );
  }

  if (result.data.questions.length !== 5) {
    throw new ResponseValidationError(
      `تعداد سؤالات دور دوم باید دقیقاً ۵ باشد، ولی AI ${result.data.questions.length} سؤال برگرداند.`,
      { code: 'SECOND_ROUND_QUESTIONS_COUNT_MISMATCH', rawText }
    );
  }

  for (const q of result.data.questions) {
    if (containsForeignLanguageArtifact(q.questionText) || q.options.some(containsForeignLanguageArtifact)) {
      const matchedWord =
        findForeignLanguageArtifactMatch(q.questionText) ||
        q.options.map(findForeignLanguageArtifactMatch).find(Boolean) ||
        '(نامشخص)';
      throw new ResponseValidationError(
        `یکی از سؤالات دور دوم حاوی کلمه‌ای از زبان غیرمنتظره است (احتمالاً artifact مدل) — برای جلوگیری از گیج‌کردن بیمار رد شد. کلمه‌ی محرک: "${matchedWord}"`,
        { code: 'LANGUAGE_ARTIFACT_DETECTED', rawText }
      );
    }
  }

  return result.data;
}

module.exports = {
  ResponseValidationError,
  safeParseJson,
  validateAIResponse,
  validateQuestionsResponse,
  validateSecondRoundResponse,
  containsForeignLanguageArtifact,
  findForeignLanguageArtifactMatch,
  stripForeignLanguageArtifacts,
  sanitizeRecommendations,
  isRecommendationSuspicious,
};
