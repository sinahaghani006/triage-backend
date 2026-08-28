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

// 2026-08-28 fix (production risk before demo, PM-approved): a simple
// in-process concurrency limiter for AI provider calls. Groq's on-demand
// tier has a strict TPM (tokens-per-minute) cap; multiple simultaneous
// patients hitting generate-questions/second-round-questions/submit-symptoms
// at once can burst past that cap and trigger 429 rate_limit_exceeded,
// which (correctly) falls back to doctor_review but silently disables
// the adaptive second-round-questions feature for the user.
//
// IMPORTANT KNOWN LIMITATION: this limiter is in-process (module-level
// state). On Vercel serverless, each warm function instance has its own
// copy of this state -- it does NOT coordinate across multiple concurrent
// instances. It only smooths bursts *within* a single warm instance, not
// the true aggregate load across all instances. It is a partial mitigation,
// not a full fix -- the durable fix is a higher-capacity Groq tier.
//
// Configurable via AI_MAX_CONCURRENT_CALLS env var (default 3 if unset or
// invalid). Requests beyond the limit wait in a FIFO queue rather than
// being rejected immediately; a queued request that waits longer than
// queueTimeoutMs fails with a QUEUE_TIMEOUT AIConnectorError (still
// resolves to a safe doctor_review fallback upstream, per the golden rule).
const DEFAULT_MAX_CONCURRENT_AI_CALLS = 3;
const DEFAULT_QUEUE_TIMEOUT_MS = 20000;

let activeAiCalls = 0;
const aiCallWaitQueue = [];

function getMaxConcurrentAiCalls() {
  const fromEnv = parseInt(process.env.AI_MAX_CONCURRENT_CALLS, 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_CONCURRENT_AI_CALLS;
}

function acquireAiCallSlot(queueTimeoutMs) {
  const maxConcurrent = getMaxConcurrentAiCalls();
  if (activeAiCalls < maxConcurrent) {
    activeAiCalls++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const entry = { resolve, timer: null };
    entry.timer = setTimeout(() => {
      const idx = aiCallWaitQueue.indexOf(entry);
      if (idx !== -1) aiCallWaitQueue.splice(idx, 1);
      reject(
        new AIConnectorError('در صف انتظار سرویس هوش مصنوعی timeout شد (ظرفیت هم‌زمان پر است).', {
          code: 'QUEUE_TIMEOUT',
        })
      );
    }, queueTimeoutMs);
    aiCallWaitQueue.push(entry);
  });
}

function releaseAiCallSlot() {
  activeAiCalls--;
  if (aiCallWaitQueue.length > 0) {
    const next = aiCallWaitQueue.shift();
    clearTimeout(next.timer);
    activeAiCalls++;
    next.resolve();
  }
}

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
async function callAIProvider(prompt, providerFn, { timeoutMs = 15000, queueTimeoutMs = 20000 } = {}) {
  validatePromptInput(prompt);

  if (typeof providerFn !== 'function') {
    throw new AIConnectorError('providerFn معتبر نیست — باید یک تابع async باشد.', {
      code: 'INVALID_PROVIDER_FN',
    });
  }

  await acquireAiCallSlot(queueTimeoutMs);

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
    releaseAiCallSlot();
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
