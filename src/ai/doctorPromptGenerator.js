/**
 * doctorPromptGenerator.js
 *
 * دستیار هوشمند دکتر — ابزار decision-support برای پزشک مجاز (role=doctor/admin)، نه بیمار.
 * تأیید مدیرعامل/مدیر پروژه.
 *
 * *** مستقل کامل از promptGenerator.js — بدون import مشترک، طبق تصمیم صریح. ***
 *
 * *** تفاوت‌های کلیدی نسبت به prompt تریاژ بیمار: ***
 * ۱. محدودیت دارو/دوز/تشخیص قطعی که برای بیمار وجود داشت، برای تشخیص
 *    افتراقی (بخش ۲) اینجا برداشته شده — چون مخاطب پزشک مجاز است، نه
 *    بیمار. *** به‌روزرسانی — تصمیم CEO (این گفتگو، بعد از evidence
 *    واقعی): سطح انتظار suggested_management پایین آمد؛ این بخش دیگر
 *    اصلاً درخواست نام دارو/دوز نمی‌کند (نه فقط «سعی نکن»، بلکه
 *    حذف کامل از prompt) — چون در ۴ از ۴ تست واقعی Groq، حتی با مثال
 *    concret، مدل نام دارو/دوز مشخص تولید نکرد؛ suggested_management
 *    الان فقط شامل آزمایش/معاینه/ارجاع تکمیلی است، نه دارودرمانی. ***
 * ۲. تاریخچه‌ی تریاژهای قبلی بیمار عمداً وارد این prompt نمی‌شود (تصمیم صریح
 *    مدیرعامل) — آن فقط در UI دکتر (Timeline) نمایش داده می‌شود. این prompt
 *    فقط روی مشکل/پاسخ‌های تریاژ *فعلی* متمرکز است.
 * ۳. Human-in-the-loop اجباری: خروجی این تابع هرگز مستقیم برای بیمار ارسال
 *    نمی‌شود — همیشه ابتدا توسط پزشک بازبینی/ویرایش می‌شود. این کنترل مسئولیت
 *    Backend/UI است، نه این فایل، ولی طراحی خروجی (فرمت قابل کپی/ویرایش)
 *    همین فرض را در نظر گرفته.
 * ۴. anonymization: هرگز نام واقعی بیمار وارد prompt نمی‌شود — فقط
 *    patientAnonymizedId (مثل «بیمار #۱۲۳۴»). تضمین این‌که این id واقعاً
 *    anonymized است و access control (role=doctor/admin) مسئولیت Backend
 *    است، نه این فایل.
 *
 * *** تصمیم نهایی مدیرعامل/مدیر پروژه (این گفتگو) — گزینه‌ی ۲: ***
 * پاک‌سازی حریم خصوصی سابقه‌ی پزشکی (regex-based: شماره تلفن/کدملی/ایمیل)
 * به‌عنوان یک لایه‌ی دفاعی کدی *مستقل* اینجا کپی شده — نه import از
 * medicalHistorySanitizer.js. دو دلیل رسمی:
 * ۱. قانون معماری پروژه: کد patient-facing و doctor-facing باید کاملاً
 *    جدا بمانند (import مشترک رد شد).
 * ۲. درس قبلی پروژه (تجربه‌ی «زبان قطعیت» در responseValidator.js): برای
 *    قوانین ایمنی/حریم خصوصی حیاتی، فقط دستورالعمل پرامپتی کافی نیست —
 *    باید یک دفاع کدی واقعی هم وجود داشته باشد (گزینه‌ی فقط-پرامپت رد شد).
 * *** به‌روزرسانی — بررسی مدیر پروژه (این گفتگو): پوشش لایه‌ی دفاعی
 * تکمیل شد. *** نسخه‌ی اول این فایل sanitizeFreeTextForDoctor را فقط
 * روی medicalHistory اعمال می‌کرد؛ مدیر پروژه درست تشخیص داد که
 * otherSymptomsText و patientResponses هم دو تا از پرریسک‌ترین منابع
 * متن آزاد بیمار هستند (دقیقاً جایی که ممکن است بیمار سهواً شماره
 * تلفن/داده‌ی هویتی تایپ کند) و باید از همین تابع رد شوند، نه فقط
 * سابقه‌ی پزشکی. حالا هر سه منبع ورودی آزاد (medicalHistory،
 * otherSymptomsText، patientResponses) قبل از ورود به prompt پاک‌سازی
 * می‌شوند — نگاه کن به generateDoctorAssistPrompt پایین‌تر.
 */

/**
 * *** لایه‌ی دفاعی کدی مستقل — نگاه کن به یادداشت تصمیم نهایی بالای فایل. ***
 * عمداً کپی شده، نه import، از همان منطق medicalHistorySanitizer.js
 * (پروژه‌ی تریاژ بیمار) — طبق قانون معماری «جدایی کامل کد patient-facing
 * و doctor-facing». هر تغییر آینده در منطق پاک‌سازی سمت بیمار، باید
 * دستی و جداگانه اینجا هم اعمال شود؛ این یک هزینه‌ی شناخته‌شده و پذیرفته‌شده‌ی
 * همین تصمیم معماری است، نه یک نقص.
 *
 * ⚠️ همان محدودیت شناخته‌شده‌ی نسخه‌ی اصلی: این فیلتر فقط الگوهای دارای
 * ساختار قابل‌تشخیص را می‌گیرد (شماره تلفن، کدملی، ایمیل) — نمی‌تواند
 * اسم واقعی افراد را تشخیص دهد. «بهترین تلاش با ابزار موجود» است، نه
 * تضمین کامل؛ دفاع دوم (دستورالعمل صریح به AI در
 * DOCTOR_ASSIST_SYSTEM_INSTRUCTIONS) همین محدودیت را پوشش می‌دهد.
 */
const DOCTOR_MAX_ITEMS_PER_FIELD = 10;
const DOCTOR_REDACTED_PLACEHOLDER = '[حذف‌شده]';
const DOCTOR_DIGIT_SEQUENCE_PATTERN = /[0-9۰-۹]{9,}/g;
const DOCTOR_EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * پاک‌سازی یک رشته‌ی متن آزاد از الگوهای قابل‌تشخیص هویتی.
 * @param {string} text
 * @returns {string}
 */
function sanitizeFreeTextForDoctor(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(DOCTOR_DIGIT_SEQUENCE_PATTERN, DOCTOR_REDACTED_PLACEHOLDER)
    .replace(DOCTOR_EMAIL_PATTERN, DOCTOR_REDACTED_PLACEHOLDER)
    .trim();
}

/**
 * پاک‌سازی و محدودسازی یک آرایه‌ی فیلد سابقه‌ی پزشکی.
 * @param {unknown} fieldValue
 * @returns {string[]}
 */
function sanitizeFieldForDoctor(fieldValue) {
  if (!Array.isArray(fieldValue)) return [];
  return fieldValue
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .slice(0, DOCTOR_MAX_ITEMS_PER_FIELD)
    .map(sanitizeFreeTextForDoctor)
    .filter((item) => item.length > 0);
}

/**
 * پاک‌سازی کامل شیء medicalHistory، مستقل از نسخه‌ی سمت بیمار.
 * @param {object} [medicalHistory]
 * @returns {{chronicConditions: string[], allergies: string[], currentMedications: string[], surgicalHistory: string[], familyHistory: string[]}}
 */
function sanitizeMedicalHistoryForDoctor(medicalHistory) {
  const fields = ['chronicConditions', 'allergies', 'currentMedications', 'surgicalHistory', 'familyHistory'];
  const result = {};
  for (const field of fields) {
    result[field] = sanitizeFieldForDoctor(medicalHistory?.[field]);
  }
  return result;
}

const DOCTOR_ASSIST_SYSTEM_INSTRUCTIONS = `
تو یک دستیار هوشمند بالینی برای کمک به تصمیم‌گیری پزشک هستی — نه یک
ابزار تریاژ بیمار. مخاطب مستقیم خروجی تو یک پزشک مجاز است، نه بیمار؛
پزشک همیشه قبل از هر اقدامی خروجی تو را بازبینی و در صورت نیاز ویرایش
می‌کند — تو هرگز مستقیم با بیمار در ارتباط نیستی.

*** تفاوت حیاتی با نقش تریاژ بیمار: ***
چون مخاطب یک پزشک مجاز است، برخلاف ابزار تریاژ بیمار، اینجا می‌توانی:
- تشخیص افتراقی و احتمالات بالینی مشخص‌تر مطرح کنی
- آزمایش‌ها، معاینات تکمیلی، یا ارجاع تخصصی مشخص پیشنهاد بدهی
*** نام دارو، دسته‌ی دارویی، یا هر دوز/مقدار مصرفی، حتی به‌عنوان
پیشنهاد برای بازبینی، تحت هیچ شرایطی در خروجی نباید ظاهر شود — این
محدودیت دقیقاً مثل نقش تریاژ بیمار است و برخلاف تشخیص افتراقی، اینجا
برداشته نشده. ***
این برداشتن محدودیت فقط برای همین ابزار و همین مخاطب است — تحت هیچ
شرایطی خروجی این ابزار نباید بدون بازبینی پزشک مستقیم به بیمار برسد؛
این تضمین مسئولیت Backend/UI است، ولی تو باید همیشه لحن و ساختار
خروجی را طوری بنویسی که واضح باشد این «پیشنهاد برای بازبینی پزشک»
است، نه «دستور قطعی» — پزشک تصمیم نهایی و مسئولیت بالینی را دارد.

*** ورودی که دریافت می‌کنی: ***
فقط اطلاعات مربوط به مراجعه‌ی *فعلی* بیمار (مشکل اصلی، پاسخ‌های
سؤالات تریاژ، سن/جنس/وزن/قد در صورت وجود، و سابقه‌ی پزشکی مثل بیماری
زمینه‌ای/آلرژی/دارو/جراحی/خانوادگی در صورت وجود). سابقه‌ی مراجعات
تریاژ *قبلی* بیمار عمداً به تو داده نمی‌شود — آن به‌صورت جدا در رابط
کاربری پزشک نمایش داده می‌شود. پس تحلیلت باید کاملاً بر پایه‌ی همین
مراجعه‌ی فعلی باشد، بدون فرض یا حدس درباره‌ی مراجعات قبلی.

*** نکته‌ی حیاتی حریم خصوصی — بدون تغییر نسبت به نقش تریاژ بیمار: ***
بیمار فقط با شناسه‌ی anonymized (مثل «بیمار #۱۲۳۴») به تو معرفی
می‌شود، هرگز نام واقعی. اگر در متن پاسخ‌های بیمار یا سابقه‌ی پزشکی به
نام شخص، شماره تلفن، کد ملی، یا هر داده‌ی هویتی‌مانند دیگری برخوردی،
کاملاً نادیده‌اش بگیر و هرگز آن را در پاسخت تکرار یا حتی اشاره نکن —
فقط از محتوای بالینی استفاده کن.

*** ساختار خروجی — دقیقاً سه بخش، برای اینکه پزشک بتواند مستقیم کپی
یا قبل از ارسال ویرایش کند: ***

۱. **خلاصه‌ی بالینی** (clinical_summary): یک پاراگراف کوتاه (۲ تا ۴
   جمله) که وضعیت فعلی بیمار را برای پزشک خلاصه می‌کند — سن/جنس،
   شکایت اصلی، مهم‌ترین یافته‌ها از پاسخ‌های تریاژ، و هر مورد مرتبط
   از سابقه‌ی پزشکی. این بخش باید مثل چیزی باشد که یک پزشک در ابتدای
   پرونده می‌نویسد، نه یک بازگویی خام سؤال‌وجواب.

۲. **تفسیر احتمالی / تشخیص افتراقی** (differential_interpretation):
   فهرستی از ۲ تا ۴ احتمال بالینی که با این ترکیب علائم سازگارند،
   هرکدام با یک جمله‌ی کوتاه دلیل. همیشه از عبارات احتمالی استفاده
   کن («می‌تواند با X سازگار باشد»، «احتمال Y هم باید بررسی شود»)،
   نه قطعی — چون تشخیص نهایی فقط با معاینه‌ی حضوری پزشک ممکن است؛ این
   فقط کمک به تمرکز اولیه‌ی پزشک است، نه جایگزین قضاوت بالینی او.

۳. **پیشنهاد بررسی/اقدام تکمیلی** (suggested_management): شامل
   آزمایش‌ها یا معاینات تکمیلی مشخص (نه «آزمایش لازم است» بلکه مثلاً
   «ECG دوازده‌لیدی، تروپونین سریالی، رادیوگرافی قفسه سینه»)، ارجاع به
   متخصص مرتبط در صورت نیاز، و معیار پیگیری یا فوریت مراجعه (مثلاً «در
   صورت عدم بهبود پس از ۴۸ ساعت» یا «ویزیت پیگیری تا یک هفته دیگر).
   *** این بخش هرگز نباید شامل نام دارو، دسته‌ی دارویی، یا هر دوز/
   مقدار مصرفی باشد — نه به‌عنوان پیشنهاد قطعی، نه حتی به‌عنوان «دوز
   رایج برای بازبینی پزشک». تصمیم دارودرمانی کاملاً بر عهده‌ی پزشک و
   خارج از دامنه‌ی این ابزار است؛ این محدودیت دقیقاً مثل نقش تریاژ
   بیمار است، با این تفاوت که تشخیص افتراقی (بخش ۲) همچنان مجاز و
   مشخص‌تر از نقش بیمار باقی می‌ماند. ***
   همیشه این را به‌عنوان «پیشنهاد برای بازبینی پزشک» قاب‌بندی کن، نه
   دستور قطعی — و اگر بیمار سابقه‌ی آلرژی یا مورد مرتبط دیگری دارد
   (طبق سابقه‌ی پزشکی داده‌شده)، حتماً آن را در همین بخش صریحاً یادآوری
   کن.

*** هشدار فوریت (اگر لازم بود): ***
اگر ترکیب علائم نشانه‌ی یک وضعیت اورژانسی یا نیازمند توجه فوری است،
این را صریحاً و برجسته در ابتدای خلاصه‌ی بالینی ذکر کن، و فیلد
urgent_flag را true بگذار — پزشک نباید مجبور باشد این را از لابه‌لای
متن استنباط کند.

خروجی تو باید دقیقاً یک شیء JSON با این ساختار باشد و هیچ متن دیگری
(توضیح، markdown، پیش‌نویس) نداشته باشد:

{
  "clinical_summary": "خلاصه‌ی بالینی ۲ تا ۴ جمله‌ای",
  "differential_interpretation": [
    { "possibility": "نام یا توضیح کوتاه احتمال بالینی", "rationale": "دلیل کوتاه" }
  ],
  "suggested_management": [
    "هر آیتم پیشنهاد آزمایش/معاینه/ارجاع تکمیلی، به‌صورت جمله‌ی مستقل و قابل‌کپی برای پزشک — بدون نام دارو یا دوز"
  ],
  "urgent_flag": true اگر وضعیت نیازمند توجه فوری پزشک است، در غیر این صورت false,
  "urgent_flag_reason": "در صورت urgent_flag=true، دلیل کوتاه؛ در غیر این صورت رشته‌ی خالی"
}

قوانین سخت:
- هرگز نام دارو، دسته‌ی دارویی، یا دوز/مقدار مصرف در suggested_management
  یا هر بخش دیگر خروجی ذکر نکن — این خارج از دامنه‌ی این ابزار است.
- هرگز نام واقعی بیمار یا هر داده‌ی هویتی دیگر در هیچ بخشی از خروجی
  تکرار نکن.
- همیشه لحن «پیشنهاد برای بازبینی پزشک» را حفظ کن، نه «دستور قطعی» —
  پزشک همیشه تصمیم‌گیرنده‌ی نهایی است.
- اگر اطلاعات ورودی برای یک تحلیل معنادار خیلی کم/مبهم است، این را
  صریحاً در clinical_summary ذکر کن (مثلاً «اطلاعات ثبت‌شده برای تحلیل
  دقیق‌تر محدود است»)، به‌جای حدس‌زدن جزئیاتی که داده نشده.
`.trim();

/**
 * ساخت prompt کامل برای دستیار هوشمند دکتر.
 *
 * *** ورودی عمداً بدون triageHistory — طبق تصمیم صریح مدیرعامل: سابقه‌ی
 * مراجعات قبلی بیمار وارد این prompt نمی‌شود، فقط در UI دکتر (Timeline)
 * جدا نمایش داده می‌شود. ***
 *
 * @param {object} params
 * @param {string} params.patientAnonymizedId - مثل «بیمار #۱۲۳۴»؛ هرگز نام واقعی
 * @param {number} params.age
 * @param {'male'|'female'} params.sex
 * @param {number} [params.weightKg]
 * @param {number} [params.heightCm]
 * @param {string} params.presentingProblemId
 * @param {string} [params.otherSymptomsText] - در صورتی که presentingProblemId برابر other_symptoms باشد
 * @param {string[]} params.questionsAsked - همه‌ی سؤالات تریاژ فعلی (دور اول + دور دوم، هرچقدر پرسیده شده)
 * @param {string[]} params.patientResponses - پاسخ‌های متناظر بیمار
 * @param {object} [params.medicalHistory] - { chronicConditions, allergies, currentMedications, surgicalHistory, familyHistory }
 * @returns {{ system: string, user: string }}
 */
function generateDoctorAssistPrompt({
  patientAnonymizedId,
  age,
  sex,
  weightKg,
  heightCm,
  presentingProblemId,
  otherSymptomsText,
  questionsAsked = [],
  patientResponses = [],
  medicalHistory,
}) {
  if (!patientAnonymizedId || typeof age !== 'number' || !sex || !presentingProblemId) {
    throw new Error(
      'generateDoctorAssistPrompt: ورودی ناقص — patientAnonymizedId, age, sex, presentingProblemId الزامی هستند.'
    );
  }

  const sexFa = sex === 'male' ? 'مرد' : 'زن';
  const weightPhrase = typeof weightKg === 'number' ? `، وزن ${weightKg} کیلوگرم` : '';
  const heightPhrase = typeof heightCm === 'number' ? `، قد ${heightCm} سانتی‌متر` : '';
  const sanitizedOtherSymptomsText =
    presentingProblemId === 'other_symptoms' ? sanitizeFreeTextForDoctor(otherSymptomsText) : '';
  const problemPhrase =
    presentingProblemId === 'other_symptoms' && sanitizedOtherSymptomsText
      ? `شکایت اصلی (متن آزاد بیمار): ${sanitizedOtherSymptomsText}`
      : `شکایت اصلی (presentingProblemId): ${presentingProblemId}`;

  const sanitizedPatientResponses = patientResponses.map((r) => sanitizeFreeTextForDoctor(r));
  const qaLines = questionsAsked
    .map((q, i) => `س${i + 1}: ${q}\nج${i + 1}: ${sanitizedPatientResponses[i] || '(پاسخ داده نشده)'}`)
    .join('\n');

  const medicalHistoryText = formatMedicalHistoryForDoctor(medicalHistory);

  const userContent = `
بیمار: ${patientAnonymizedId}، سن ${age} سال، جنس ${sexFa}${weightPhrase}${heightPhrase}.
${problemPhrase}

سؤالات و پاسخ‌های تریاژ ثبت‌شده در این مراجعه:
${qaLines || '(هیچ سؤال و پاسخی ثبت نشده است)'}

${medicalHistoryText}

طبق فرمت خواسته‌شده در دستورالعمل سیستم، خلاصه‌ی بالینی، تفسیر
احتمالی، و پیشنهاد اقدام/درمان را برای بازبینی پزشک آماده کن.
`.trim();

  return {
    system: DOCTOR_ASSIST_SYSTEM_INSTRUCTIONS,
    user: userContent,
  };
}

/**
 * قالب‌بندی سابقه‌ی پزشکی برای این prompt.
 *
 * *** به‌روزرسانی — تصمیم نهایی (گزینه‌ی ۲، نگاه کن به یادداشت بالای فایل): ***
 * قبل از قالب‌بندی، ورودی از sanitizeMedicalHistoryForDoctor (دفاع کدی
 * مستقل، بالای همین فایل) رد می‌شود — همان الگوهای شماره تلفن/کدملی/ایمیل
 * که برای بیمار حذف می‌شوند، اینجا هم حذف می‌شوند، بدون هیچ وابستگی به
 * ماژول سمت بیمار.
 *
 * @param {object} [medicalHistory]
 * @returns {string}
 */
function formatMedicalHistoryForDoctor(medicalHistory) {
  if (!medicalHistory || typeof medicalHistory !== 'object') return '';

  const sanitized = sanitizeMedicalHistoryForDoctor(medicalHistory);

  const FIELD_LABELS_FA = {
    chronicConditions: 'بیماری‌های زمینه‌ای',
    allergies: 'آلرژی‌ها',
    currentMedications: 'داروهای مصرفی فعلی',
    surgicalHistory: 'سوابق جراحی',
    familyHistory: 'سابقه‌ی خانوادگی',
  };

  const lines = Object.keys(FIELD_LABELS_FA)
    .map((field) => {
      const items = sanitized[field];
      if (!items || items.length === 0) return null;
      return `${FIELD_LABELS_FA[field]}: ${items.join('، ')}`;
    })
    .filter(Boolean);

  if (lines.length === 0) return '';

  return `سابقه‌ی پزشکی ثبت‌شده‌ی بیمار (اگر هر نام شخص یا داده‌ی هویتی‌مانند دیگری دیدی، کاملاً نادیده‌اش بگیر):\n${lines.join('\n')}`;
}

module.exports = {
  generateDoctorAssistPrompt,
  DOCTOR_ASSIST_SYSTEM_INSTRUCTIONS,
  formatMedicalHistoryForDoctor,
  sanitizeMedicalHistoryForDoctor,
  sanitizeFreeTextForDoctor,
};

