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
 * *** به‌روزرسانی — باگ کشف‌شده در production (همین گفتگو، تست واقعی). ***
 * الگوی قبلی (فقط حروف لاتین accented مثل ویتنامی) یک نمونه‌ی واقعی را
 * نگرفت: کاراکتر چینی «过去» (به معنی «قبلاً») وسط یک سؤال فارسی نشت
 * کرده بود و از فیلتر رد شده بود. این الگو حالا علاوه بر لاتین accented،
 * بازه‌های یونیکد CJK (چینی/ژاپنی/کره‌ای) را هم پوشش می‌دهد:
 *   - CJK Unified Ideographs (چینی رایج): \u4E00-\u9FFF
 *   - CJK Extension A (چینی کمیاب‌تر): \u3400-\u4DBF
 *   - هیراگانا (ژاپنی): \u3040-\u309F
 *   - کاتاکانا (ژاپنی): \u30A0-\u30FF
 *   - هانگول/کره‌ای: \uAC00-\uD7A3 و \u1100-\u11FF
 * این هنوز یک فیلتر heuristic است، نه پوشش کامل همه‌ی زبان‌های دنیا —
 * اگر بعداً نمونه‌ی نشت از زبان دیگری (مثلاً عربی با کاراکتر غیرمعمول،
 * یا سیریلیک) دیده شد، باید دوباره طبق همین الگو (با شواهد واقعی) گسترش
 * یابد.
 */
const FOREIGN_LANGUAGE_ARTIFACT_PATTERN =
  /[À-ÿ\u1E00-\u1EFF\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7A3\u1100-\u11FF]/;

function containsForeignLanguageArtifact(text) {
  return typeof text === 'string' && FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(text);
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
      throw new ResponseValidationError(
        'یکی از سؤالات حاوی کلمه‌ای از زبان غیرمنتظره است (احتمالاً artifact مدل) — برای جلوگیری از گیج‌کردن بیمار رد شد.',
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
      throw new ResponseValidationError(
        'یکی از سؤالات دور دوم حاوی کلمه‌ای از زبان غیرمنتظره است (احتمالاً artifact مدل) — برای جلوگیری از گیج‌کردن بیمار رد شد.',
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
  stripForeignLanguageArtifacts,
  sanitizeRecommendations,
  isRecommendationSuspicious,
};
