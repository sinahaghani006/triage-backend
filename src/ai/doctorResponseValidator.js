/**
 * doctorResponseValidator.js
 *
 * لایه‌ی اعتبارسنجی/پاک‌سازی خروجی خام AI برای «دستیار هوشمند دکتر».
 * تأیید مدیر پروژه — یافته‌ی evidence واقعی (این گفتگو): در ۱ از ۴ تست
 * زنده‌ی Groq، یک کلمه‌ی غیرفارسی (ویتنامی، "khó") داخل خروجی JSON ظاهر
 * شد — دقیقاً همان کلاس باگی که قبلاً برای مسیر تریاژ بیمار مستند و
 * فیکس شده بود (نگاه کن به FOREIGN_LANGUAGE_ARTIFACT_PATTERN در
 * responseValidator.js).
 *
 * *** طبق قانون معماری پروژه: کد patient-facing و doctor-facing باید
 * کاملاً جدا بمانند — این فایل عمداً منطق مشابه responseValidator.js را
 * کپی می‌کند، نه import. ***
 *
 * *** تفاوت مهم با نسخه‌ی بیمار — چرا نمی‌شود عیناً کپی کرد: ***
 * نسخه‌ی مسیر بیمار همه‌ی حروف لاتین (a-zA-Z) را هم مسدود می‌کند، چون
 * هیچ متن انگلیسی‌ای در خروجی patient-facing انتظار نمی‌رود. ولی خروجی
 * این ابزار (doctor-facing) ممکن است به‌درستی شامل مخفف‌های پزشکی
 * لاتین باشد (مثل ECG، CT، MRI) — پس مسدودکردن کل حروف لاتین اینجا
 * false-positive زیاد تولید می‌کند و محتوای معتبر را خراب می‌کند.
 * بنابراین این نسخه فقط لاتین *دارای علامت (accented)* + سیریلیک + CJK
 * را هدف می‌گیرد — دقیقاً همان بازه‌هایی که کلمه‌ی واقعی مشاهده‌شده
 * ("khó" — دارای علامت هوک بالای o) را می‌گیرد، بدون مسدودکردن
 * مخفف‌های لاتین ساده و معتبر.
 *
 * ⚠️ محدودیت شناخته‌شده: این فیلتر کلمات انگلیسی ساده و بدون علامت
 * (مثل leaked "the" یا "contact") را نمی‌گیرد — همان‌طور که تجربه‌ی
 * مسیر بیمار نشان داد این نوع نشت هم ممکن است رخ دهد. تا الان evidence
 * واقعی این مسیر فقط نشت کلمه‌ی دارای علامت را نشان داده؛ اگر در آینده
 * نشت لاتین ساده هم دیده شد، باید مشابه فیکس دوم مسیر بیمار
 * (اضافه‌کردن a-zA-Z) اینجا هم اعمال شود — ولی با یک لیست سفید از
 * مخفف‌های پزشکی معتبر (ECG, CT, MRI, ...) تا false-positive ایجاد
 * نشود. این کار عمداً الان انجام نشده چون هنوز هیچ نمونه‌ی واقعی از
 * این حالت خاص دیده نشده — طبق همون قاعده‌ی «فقط با شواهد واقعی».
 */

const FOREIGN_LANGUAGE_ARTIFACT_PATTERN = /[À-ÿ\u1E00-\u1EFF\u0400-\u04FF\u4E00-\u9FFF]/;

function containsForeignLanguageArtifact(text) {
  return typeof text === 'string' && FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(text);
}

/**
 * حذف کلمات دارای این الگو از یک رشته، بدون رد کردن کل رشته — همان
 * فلسفه‌ی sanitize-in-place مسیر بیمار (نگاه کن به sanitizeIfSalvageable
 * در responseValidator.js پروژه‌ی تریاژ).
 * @param {string} text
 * @returns {string}
 */
function stripForeignLanguageArtifactsFromDoctorOutput(text) {
  if (typeof text !== 'string') return text;
  return text
    .split(/\s+/)
    .filter((word) => !FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word))
    .join(' ')
    .replace(/\s+([.,،؛])/g, '$1')
    .trim();
}

/**
 * پاک‌سازی کامل خروجی JSON دستیار دکتر از کلمات زبان غیرمنتظره —
 * روی هر فیلد متنی (clinical_summary، هر possibility/rationale در
 * differential_interpretation، هر آیتم suggested_management،
 * urgent_flag_reason) اعمال می‌شود.
 *
 * *** طراحی: sanitize-in-place، نه reject/retry — چون این یک نقص
 * محتوایی محلی است (یک کلمه)، نه یک خطای ساختاری کل پاسخ؛ رد کردن کل
 * پاسخ و تحمیل retry برای یک کلمه نامتناسب است، دقیقاً هم‌راستا با
 * تصمیم مشابه در responseValidator.js مسیر بیمار. ***
 *
 * @param {object} doctorAssistResult - خروجی parse‌شده‌ی JSON (بعد از JSON.parse)
 * @returns {object} همان شیء با فیلدهای متنی پاک‌سازی‌شده
 */
function sanitizeDoctorAssistOutput(doctorAssistResult) {
  if (!doctorAssistResult || typeof doctorAssistResult !== 'object') return doctorAssistResult;

  const result = { ...doctorAssistResult };

  if (typeof result.clinical_summary === 'string') {
    result.clinical_summary = stripForeignLanguageArtifactsFromDoctorOutput(result.clinical_summary);
  }

  if (Array.isArray(result.differential_interpretation)) {
    result.differential_interpretation = result.differential_interpretation.map((item) => ({
      ...item,
      possibility:
        typeof item?.possibility === 'string'
          ? stripForeignLanguageArtifactsFromDoctorOutput(item.possibility)
          : item?.possibility,
      rationale:
        typeof item?.rationale === 'string'
          ? stripForeignLanguageArtifactsFromDoctorOutput(item.rationale)
          : item?.rationale,
    }));
  }

  if (Array.isArray(result.suggested_management)) {
    result.suggested_management = result.suggested_management.map((item) =>
      typeof item === 'string' ? stripForeignLanguageArtifactsFromDoctorOutput(item) : item
    );
  }

  if (typeof result.urgent_flag_reason === 'string') {
    result.urgent_flag_reason = stripForeignLanguageArtifactsFromDoctorOutput(result.urgent_flag_reason);
  }

  return result;
}

/**
 * *** طراحی پرچم‌گذاری hallucination بالینی — تأیید مدیر پروژه: فقط
 * طراحی/پیش‌نویس، پیاده‌سازی نهایی می‌تواند نگه داشته شود. ***
 *
 * یافته‌ی evidence: در یکی از ۴ تست، AI ادعا کرد بیمار «دیابت» دارد
 * در حالی که سابقه‌ی واقعی ارسالی «فشار خون بالا» بود — یعنی یک
 * بیماری زمینه‌ای که در ورودی نبود، در خروجی ادعا شد.
 *
 * *** طراحی: پرچم‌گذاری، نه رد‌کردن — هم‌راستا با فلسفه‌ی
 * human-in-the-loop پروژه. *** این تابع پاسخ را تغییر نمی‌دهد، فقط
 * یک لیست هشدار برمی‌گرداند که Backend/UI می‌تواند به پزشک نشان دهد
 * (مثلاً «⚠️ این مورد مستقیماً از سابقه‌ی ثبت‌شده نیامده، لطفاً تأیید
 * کنید»).
 *
 * *** روش: تشخیص واژگانی ساده روی یک لیست کوچک از نام‌های رایج
 * بیماری‌های مزمن/دارو (نه یک NLP کامل) — اگر یکی از این کلمات در
 * clinical_summary/differential_interpretation/suggested_management
 * ظاهر شود ولی هیچ‌کدام از آیتم‌های chronicConditions/currentMedications
 * ورودی حاوی همان کلمه نباشند، پرچم زده می‌شود. ***
 *
 * ⚠️ محدودیت شناخته‌شده (مثل CLINICAL_CONCEPT_SYNONYMS مسیر بیمار):
 * این لیست کوچک و اولیه است، فقط بر اساس یک نمونه‌ی واقعی دیده‌شده
 * (دیابت). با داده‌ی بیشتر باید گسترش یابد. همچنین false-positive
 * ممکن است رخ دهد — مثلاً اگر AI به‌درستی یک تشخیص افتراقی احتمالی
 * (نه ادعای قطعی سابقه) مطرح کند (مثل «احتمال دیابت نوع ۲ باید رد
 * شود»)، این با یک ادعای اشتباه درباره‌ی سابقه‌ی موجود بیمار فرق دارد؛
 * این تشخیص فعلاً این دو حالت را از هم جدا نمی‌کند — یک محدودیت
 * شناخته‌شده که نیاز به تصمیم/تنظیم بیشتر دارد پیش از استفاده‌ی واقعی.
 *
 * @param {object} doctorAssistResult - خروجی (پاک‌سازی‌شده یا خام) دستیار دکتر
 * @param {object} [medicalHistory] - همان medicalHistory خام ارسالی به prompt
 * @returns {string[]} فهرست هشدارهای «این ادعا مستقیم از سابقه نیامده»
 */
const COMMON_CHRONIC_CONDITION_KEYWORDS = ['دیابت', 'فشار خون', 'آسم', 'صرع', 'تیروئید'];

function flagUnverifiedClinicalClaims(doctorAssistResult, medicalHistory) {
  const historyText = [
    ...(medicalHistory?.chronicConditions || []),
    ...(medicalHistory?.currentMedications || []),
  ].join(' ');

  const outputText = [
    doctorAssistResult?.clinical_summary || '',
    ...(doctorAssistResult?.differential_interpretation || []).map((d) => `${d?.possibility || ''} ${d?.rationale || ''}`),
    ...(doctorAssistResult?.suggested_management || []),
  ].join(' ');

  const warnings = [];
  for (const keyword of COMMON_CHRONIC_CONDITION_KEYWORDS) {
    if (outputText.includes(keyword) && !historyText.includes(keyword)) {
      warnings.push(
        `⚠️ خروجی به «${keyword}» اشاره کرده، ولی این مورد مستقیماً در سابقه‌ی پزشکی ثبت‌شده‌ی ورودی نبود — لطفاً پزشک این ادعا را با پرونده‌ی واقعی بیمار تطبیق دهد.`
      );
    }
  }
  return warnings;
}

module.exports = {
  containsForeignLanguageArtifact,
  stripForeignLanguageArtifactsFromDoctorOutput,
  sanitizeDoctorAssistOutput,
  flagUnverifiedClinicalClaims,
  FOREIGN_LANGUAGE_ARTIFACT_PATTERN,
};

