/**
 * aiConnector.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا). بازسازی نیست. ***
 * هیچ نسخه‌ی قبلی این فایل پیدا نشد. طراحی از صفر بر اساس بریف رسمی:
 * «اتصال provider-agnostic به AI (از env var مثل AI_MODEL)».
 *
 * *** وضعیت provider — نیازمند تصمیم مدیر پروژه، جزئیات هنوز باز است: ***
 * طبق بریف: Gemini free tier رد شده (استفاده از داده کاربر برای training).
 * Groq نامزد بوده ولی نیاز به راستی‌آزمایی مستقل دارد (رایگان بودن، عدم
 * فیلترینگ در ایران، عدم استفاده از داده برای training). این فایل provider
 * واقعی را هاردکد نمی‌کند — از طریق AI_MODEL و AI_PROVIDER در env پیکربندی
 * می‌شود تا تصمیم provider بدون تغییر کد این فایل قابل تغییر باشد.
 *
 * تا وقتی provider نهایی تأیید نشده، این فایل فقط با mockProvider قابل تست
 * است (نگاه کن به createMockProvider در پایین فایل).
 */

class AIConnectorError extends Error {
  constructor(message, { cause, code } = {}) {
    super(message);
    this.name = 'AIConnectorError';
    this.code = code || 'AI_CONNECTOR_ERROR';
    if (cause) this.cause = cause;
  }
}

/**
 * اعتبارسنجی حداقلی ورودی قبل از ارسال به هر provider.
 * سناریوی مرجع ۴: ورودی نامعتبر → باید AIConnectorError پرتاب شود.
 */
function validatePromptInput(prompt) {
  if (!prompt || typeof prompt !== 'object') {
    throw new AIConnectorError('ورودی prompt نامعتبر است: باید یک object باشد.', {
      code: 'INVALID_PROMPT_SHAPE',
    });
  }
  if (typeof prompt.system !== 'string' || prompt.system.trim() === '') {
    throw new AIConnectorError('ورودی prompt نامعتبر است: system خالی یا نامعتبر است.', {
      code: 'INVALID_PROMPT_SYSTEM',
    });
  }
  if (typeof prompt.user !== 'string' || prompt.user.trim() === '') {
    throw new AIConnectorError('ورودی prompt نامعتبر است: user خالی یا نامعتبر است.', {
      code: 'INVALID_PROMPT_USER',
    });
  }
}

/**
 * یک provider واقعی باید این شکل را پیاده کند:
 *   async ({ system, user }) => { rawText: string, meta: { provider, model } }
 * این تابع خودش هیچ provider واقعی‌ای را import نمی‌کند — انتخاب provider
 * در لایه‌ی بالاتر (aiTriageService.js) بر اساس AI_PROVIDER انجام می‌شود تا
 * این فایل به یک وابستگی خاص قفل نشود.
 */
async function callAIProvider(prompt, providerFn, { timeoutMs = 15000 } = {}) {
  validatePromptInput(prompt);

  if (typeof providerFn !== 'function') {
    throw new AIConnectorError('providerFn معتبر نیست — باید یک تابع async باشد.', {
      code: 'INVALID_PROVIDER_FN',
    });
  }

  let timeoutHandle;
  try {
    const result = await Promise.race([
      providerFn(prompt),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new AIConnectorError('درخواست به AI provider timeout شد.', { code: 'TIMEOUT' })),
          timeoutMs
        );
      }),
    ]);

    if (!result || typeof result.rawText !== 'string') {
      throw new AIConnectorError('پاسخ provider ساختار نامعتبر دارد (rawText یافت نشد).', {
        code: 'INVALID_PROVIDER_RESPONSE',
      });
    }

    return result;
  } catch (err) {
    if (err instanceof AIConnectorError) throw err;
    throw new AIConnectorError(`خطا در ارتباط با AI provider: ${err.message}`, {
      code: 'PROVIDER_CALL_FAILED',
      cause: err,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * mock provider برای تست بدون تماس واقعی با هیچ سرویسی.
 * فقط برای استفاده در تست‌های ایزوله یا end-to-end با mock — هرگز در تولید.
 */
function createMockProvider(mockResponseJson) {
  return async function mockProviderFn(_prompt) {
    return {
      rawText: JSON.stringify(mockResponseJson),
      meta: { provider: 'mock', model: 'mock-v1' },
    };
  };
}

module.exports = {
  AIConnectorError,
  callAIProvider,
  createMockProvider,
  validatePromptInput,
};
