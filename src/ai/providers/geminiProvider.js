/**
 * geminiProvider.js
 *
 * *** ماژول آزمایشی -- به دستور مدیر پروژه، به‌عنوان مسیر موازی احتمالی
 * fallback در کنار Groq (نه جایگزین فوری)، برای بررسی اینکه آیا سقف
 * بسیار بالاتر TPM جمنای (۲۵۰,۰۰۰ در برابر ۸۰۰۰ Groq) می‌تونه به حل
 * مشکل rate limit کمک کنه. ***
 *
 * طبق همون قرارداد groqProvider.js پیاده‌سازی شده تا با aiConnector.js/
 * aiTriageGateway.js بدون تغییر دیگه سازگار باشه: یک تابع async که
 * { system, user } می‌گیره و { rawText, meta } برمی‌گردونه.
 *
 * تفاوت‌های فرمت API (evidence از مستندات رسمی Gemini):
 * - endpoint و auth header متفاوت (x-goog-api-key، نه Authorization: Bearer)
 * - Gemini مفهوم system/user پیام جدا به سبک OpenAI نداره -- بخش system
 *   با فیلد جدای system_instruction فرستاده می‌شه، user در contents
 * - JSON mode با generationConfig.response_mime_type: "application/json"
 *   تنظیم می‌شه (معادل response_format گروک)
 * - ساختار پاسخ کاملاً متفاوته: candidates[0].content.parts[] (آرایه‌ای
 *   از parts، نه یک فیلد ساده) -- باید متن هر part رو جمع کرد
 *
 * *** نیازمند بررسی مدیر پروژه/AI-role قبل از استفاده‌ی واقعی: ***
 * - کیفیت تشخیص بالینی این مدل نسبت به gpt-oss-120b هنوز تأیید نشده
 * - سقف RPM جمنای (نه TPM) به‌مراتب پایین‌تره (۱۰-۱۵ در دقیقه طبق
 *   free tier) -- ممکنه زیر بار زیاد (حجم بالای درخواست، نه توکن)
 *   مشکل جدیدی ایجاد کنه که این پیاده‌سازی به‌تنهایی حلش نمی‌کنه
 *
 * *** 2026-09 fix: retry یک‌باره برای 503 ***
 * evidence از production: خطای 503 "currently experiencing high
 * demand... usually temporary" از خودِ Gemini دریافت شد. برخلاف 429
 * (rate limit خودمان، که retry فوری کمکی نمی‌کند)، این پیام صریحاً
 * می‌گوید موقتی است -- یک retry سریع بعد از تأخیر کوتاه قبل از
 * fallback به doctor_review منطقی است.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiOnce(model, resolvedApiKey, system, user) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": resolvedApiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Gemini API error (${response.status}): ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error("Gemini API response missing candidates[0].content.parts");
  }
  const rawText = parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!rawText) {
    throw new Error("Gemini API response contained no text parts");
  }
  return { rawText, meta: { provider: "gemini", model } };
}

function createGeminiProvider(model, apiKey) {
  const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY;
  return async function geminiProviderFn({ system, user }) {
    try {
      return await callGeminiOnce(model, resolvedApiKey, system, user);
    } catch (err) {
      if (err.status === 503) {
        console.warn(`geminiProvider: got 503 (high demand), retrying once after 1.5s delay. model=${model}`);
        await sleep(1500);
        return await callGeminiOnce(model, resolvedApiKey, system, user);
      }
      throw err;
    }
  };
}

module.exports = { createGeminiProvider };