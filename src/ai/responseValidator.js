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

const { AIRawResponseSchema } = require('./schemas');

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
 * parse امن متن خام به JSON، بدون فرض بر ساختار.
 */
function safeParseJson(rawText) {
  try {
    return JSON.parse(rawText);
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

module.exports = {
  ResponseValidationError,
  safeParseJson,
  validateAIResponse,
};
