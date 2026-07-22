/**
 * promptGenerator.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا). بازسازی نیست. ***
 * هیچ نسخه‌ی قبلی این فایل پیدا نشد. طراحی از صفر بر اساس بریف رسمی:
 * «سیستم بر اساس پرونده بیمار پرامپت مناسب تولید می‌کند».
 *
 * قانون حیاتی رعایت‌شده: هیچ داده هویتی (نام، کد ملی، آدرس) در prompt قرار
 * نمی‌گیرد — فقط presentingProblemId، سن، جنس، وزن، و سوابق پرسش/پاسخ.
 *
 * *** شکاف شناخته‌شده: بند ۷ (توصیه‌های عمومی مراقبتی) ***
 * این پرامپت طبق تصمیم فعلی، از AI درخواست «توصیه‌ی متن پزشکی» نمی‌کند،
 * چون schemas.js فعلاً فیلدی برای آن ندارد و تولید توصیه‌ی پزشکی حدسی توسط
 * این ماژول با قانون «AI جایگزین تأیید پزشکی نمی‌شود» در تضاد است. اگر مدیر
 * پروژه بخواهد این قابلیت اضافه شود، باید ابتدا schemas.js و این فایل با هم،
 * با تأیید صریح، به‌روزرسانی شوند.
 */

const { URGENCY_LEVELS } = require('./schemas');
const { findPresentingProblemById } = require('./presentingProblems');
const { sanitizeMedicalHistory, hasAnyMedicalHistoryContent } = require('./medicalHistorySanitizer');

/**
 * محاسبه‌ی فاصله‌ی زمانی نسبی فارسی از یک تاریخ ISO تا الان.
 * فقط برای نمایش در prompt — منطق بالینی به این وابسته نیست.
 */
function computeRelativeDateFa(createdAt) {
  if (typeof createdAt !== 'string') return 'تاریخ نامشخص';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'تاریخ نامشخص';

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'تاریخ نامشخص';
  if (diffDays === 0) return 'امروز';
  if (diffDays === 1) return 'دیروز';
  if (diffDays < 7) return `${toPersianDigits(diffDays)} روز پیش`;
  if (diffDays < 30) return `${toPersianDigits(Math.floor(diffDays / 7))} هفته پیش`;
  return `${toPersianDigits(Math.floor(diffDays / 30))} ماه پیش`;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toPersianDigits(num) {
  return String(num)
    .split('')
    .map((ch) => (PERSIAN_DIGITS[ch] !== undefined ? PERSIAN_DIGITS[ch] : ch))
    .join('');
}

/**
 * *** قابلیت جدید — پشتیبانی از patientHistory با قرارداد واقعی Backend. ***
 *
 * قرارداد واقعی (تأییدشده با Backend، GET /users/me/history-summary):
 * هر Episode شامل presentingProblemId, createdAt, urgencyLevel, reasoning,
 * questions است — لیست کامل مراجعات اخیر، جدید-به-قدیم.
 *
 * *** قرارداد حریم خصوصی — حیاتی: ***
 * این تابع عمداً فقط ۴ فیلد را می‌خواند: presentingProblemId، createdAt،
 * urgencyLevel، reasoning. فیلد questions (که ممکن است متن پاسخ‌های خام
 * بیمار را داشته باشد و طولانی‌تر/کمتر قابل‌کنترل از نظر محتوا باشد) و
 * هر فیلد دیگری که Backend اضافه کند، عمداً خوانده نمی‌شود.
 *
 * حداکثر ۱۰ مورد پردازش می‌شود — با اینکه Backend لیست کامل را برمی‌گرداند،
 * این سقف برای جلوگیری از طولانی‌شدن بیش‌ازحد prompt گذاشته شده (قابل‌تنظیم).
 *
 * @param {Array<{presentingProblemId?: string, createdAt?: string, urgencyLevel?: string, reasoning?: string}>} [patientHistory]
 * @returns {string} متن قالب‌بندی‌شده برای درج در prompt، یا رشته‌ی خالی اگر سابقه‌ای نباشد.
 */
function formatPatientHistory(patientHistory) {
  if (!Array.isArray(patientHistory) || patientHistory.length === 0) {
    return '';
  }

  const capped = patientHistory.slice(0, 10);

  const introLine = `لازم به توضیح است بیمار در دوره‌ی اخیر ${toPersianDigits(capped.length)} بار مراجعه داشته است:`;

  const lines = capped.map((entry, i) => {
    const relativeDate = computeRelativeDateFa(entry?.createdAt);
    const problemId = typeof entry?.presentingProblemId === 'string' ? entry.presentingProblemId : 'نامشخص';
    const problemLabel = findPresentingProblemById(problemId)?.labelFa || problemId;
    const urgencyLevel = typeof entry?.urgencyLevel === 'string' ? entry.urgencyLevel : '';
    const urgencyPart = urgencyLevel ? ` (نتیجه: ${urgencyLevel})` : '';
    return `${toPersianDigits(i + 1)}. [${relativeDate}] ${problemLabel}${urgencyPart}`;
  });

  return `${introLine}\n${lines.join('\n')}`;
}

/**
 * *** قابلیت جدید — Task «اتصال Medical History»، تأیید مدیر پروژه در همین گفتگو. ***
 *
 * قرارداد واقعی Backend (GET /users/me/medical-history، تأییدشده با شواهد
 * خام از medicalHistoryValidators.js): پنج فیلد آرایه‌ای از متن آزاد —
 * chronicConditions, allergies, currentMedications, surgicalHistory,
 * familyHistory. بدون اعتبارسنجی محتوایی در Backend.
 *
 * *** قرارداد حریم خصوصی — حیاتی، دفاع لایه‌ی اول: ***
 * قبل از قالب‌بندی، این تابع medicalHistory را از طریق
 * sanitizeMedicalHistory (medicalHistorySanitizer.js) رد می‌کند که
 * الگوهای قابل‌تشخیص هویتی (شماره تلفن، کدملی، ایمیل) را حذف و هر فیلد
 * را به حداکثر ۱۰ مورد محدود می‌کند. این فیلتر اسم اشخاص را تشخیص
 * نمی‌دهد (محدودیت شناخته‌شده و مستند — نگاه کن به medicalHistorySanitizer.js)؛
 * دفاع دوم (دستورالعمل صریح به AI برای نادیده‌گرفتن هر چیز هویتی‌مانند)
 * در SYSTEM_INSTRUCTIONS و QUESTIONS_SYSTEM_INSTRUCTIONS قرار دارد.
 *
 * *** تصمیم تأییدشده درباره‌ی نام دارو: ***
 * ذکر نام داروی مصرفی توسط خود بیمار (در currentMedications) در ورودی
 * prompt مجاز است — چون این ورودی بیمار است، نه پیشنهاد AI. قانون سخت
 * «بدون نام دارو» فقط خروجی AI (reasoning/recommendations) را می‌بندد،
 * نه ورودی. این تمایز باید برای هر توسعه‌دهنده‌ی بعدی روشن باشد.
 *
 * @param {{chronicConditions?: string[], allergies?: string[], currentMedications?: string[], surgicalHistory?: string[], familyHistory?: string[]}} [medicalHistory]
 * @returns {string} متن قالب‌بندی‌شده برای درج در prompt، یا رشته‌ی خالی اگر داده‌ای نباشد.
 */
function formatMedicalHistory(medicalHistory) {
  if (!medicalHistory || typeof medicalHistory !== 'object') {
    return '';
  }

  const sanitized = sanitizeMedicalHistory(medicalHistory);
  if (!hasAnyMedicalHistoryContent(sanitized)) {
    return '';
  }

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

  const introLine =
    'سابقه‌ی پزشکی ثبت‌شده‌ی بیمار (این را در تحلیل واقعاً لحاظ کن؛ اگر هر نام شخص یا هر داده‌ی هویتی‌مانندی در این متن دیدی، کاملاً نادیده‌اش بگیر و هرگز آن را در پاسخت تکرار نکن):';

  return `${introLine}\n${lines.join('\n')}`;
}

const SYSTEM_INSTRUCTIONS = `
تو یک دستیار غربالگری بالینی هستی، نه یک پزشک. وظیفه‌ات فقط طبقه‌بندی
اولیه‌ی فوریت بر اساس اطلاعات داده‌شده است، نه تشخیص یا تجویز درمان.

*** نحوه‌ی استدلال — این بخش حیاتی است: ***
سن، جنس، وزن، قد (در صورت وجود)، شکایت اصلی، و تمام سوابق پرسش‌وپاسخی
که از بیمار گرفته شده را با هم در نظر بگیر، نه فقط عنوان شکایت اصلی
به‌تنهایی. این مشخصات جمعیت‌شناختی را واقعاً در urgency_suggestion و
reasoning‌ات دخالت بده، نه فقط دریافت کن — آستانه‌ی نگرانی برای یک
علامت می‌تواند بسته به سن بیمار فرق کند (مثلاً همان علامت در یک بیمار
سالمند معمولاً نیازمند توجه بیشتری است تا در یک بیمار جوان)؛ اگر وزن
یا قد به‌نظرت روی ارزیابی شدت علائم تأثیر منطقی دارد (مثلاً در ارزیابی
شدت کم‌آبی بدن)، از آن‌ها هم استفاده کن. اگر پاسخ‌ها نشانه‌ی علامت
هشدار یا شدت غیرمنتظره‌ای داشته باشند، حتی اگر شکایت اصلی در ظاهر ساده
به‌نظر برسد (مثلاً «سردرد»)، باید همین موضوع در reasoning و
urgency_suggestion تو منعکس شود. reasoning تو باید صریحاً نشان دهد که
کدام پاسخ‌های خاص بیمار روی تصمیم تو تأثیر گذاشتند — نه یک توضیح کلی
که فقط اسم شکایت را تکرار کند.

*** دستورالعمل ویژه برای وقتی urgency_suggestion تو doctor_review است: ***
در این حالت، reasoning باید ۲ تا ۳ جمله باشد، نه یک برچسب کوتاه، و باید
صریحاً به پاسخ‌های خاصی که بیمار داده ارجاع بدهد (مثلاً «با توجه به
پاسخ‌هایی که دادید [X، Y، Z]، این ترکیب نیاز به بررسی مستقیم پزشک
دارد»).

*** اگر سابقه‌ی مراجعات اخیر بیمار در اختیارت گذاشته شده: ***
این را نباید فقط بی‌صدا در پس‌زمینه لحاظ کنی — باید صریحاً در reasoning
به Episode مرتبط اشاره کنی، با ذکر فاصله‌ی زمانی نسبی و شکایت آن مراجعه
(مثلاً «با توجه به اینکه [فاصله‌ی زمانی] برای [شکایت قبلی] مراجعه کرده
بودید، ...»). این کار حتی وقتی شکایت فعلی با شکایت قبلی فرق دارد هم
لازم است — مثلاً اگر بیمار ۲۹ روز پیش گلودرد داشته و الان سردرد دارد،
باید همین ارتباط را صریحاً ذکر کنی. اگر بیمار به‌تازگی (طبق سابقه) برای
همین شکایت یا شکایت مشابه مراجعه کرده، یا نتیجه‌ی مراجعه‌ی قبلی خودش
نیازمند توجه پزشک بوده، این می‌تواند نشانه‌ی تکرارشونده یا حادتر بودن
وضعیت باشد و باید در reasoning و urgency_suggestion تو منعکس شود. اگر
سابقه‌ای داده نشده، طبیعی است — فقط بر اساس اطلاعات فعلی تصمیم بگیر و
هیچ اشاره‌ای به سابقه نکن.

*** اگر سابقه‌ی پزشکی بیمار (بیماری زمینه‌ای، آلرژی، داروی مصرفی، سابقه‌ی
جراحی، سابقه‌ی خانوادگی) در اختیارت گذاشته شده: ***
این اطلاعات را واقعاً در ارزیابی خطر و در urgency_suggestion لحاظ کن —
مثلاً بیماری زمینه‌ای یا دارویی خاص می‌تواند آستانه‌ی نگرانی برای برخی
علائم را بالا یا پایین ببرد. *** نکته‌ی حیاتی حریم خصوصی: *** این متن‌ها
توسط خود بیمار و بدون هیچ کنترلی نوشته شده‌اند. اگر در هر بخش از این
سابقه‌ی پزشکی به نام یک شخص، شماره تلفن، کد ملی، یا هر داده‌ی دیگری که
شبیه اطلاعات هویتی است برخوردی، آن را کاملاً نادیده بگیر و تحت هیچ
شرایطی آن را در reasoning یا هیچ بخش دیگری از پاسخت تکرار یا حتی اشاره
نکن — فقط از محتوای بالینی (نام بیماری، نوع آلرژی، نام دارو، نوع
جراحی) استفاده کن.

*** مرز حیاتی و غیرقابل‌مذاکره (درباره‌ی reasoning در حالت doctor_review): ***
این توضیح باید فقط «چرایی نیاز به ارجاع» باشد، نه تشخیص و نه توصیه‌ی
درمانی. هرگز جمله‌ای مثل «احتمالاً شما به [نام بیماری] مبتلا هستید» یا
هر توصیه‌ی دارویی/درمانی ننویس — فقط توضیح بده که کدام پاسخ‌ها یا چه
ترکیبی از آن‌ها باعث شده این تصمیم به تشخیص یک پزشک انسانی نیاز داشته
باشد.

*** recommendations — قانون سخت (Hard Constraint)، نه پیشنهاد: ***
حالا باید فیلد recommendations را هم پر کنی، ولی طبق این قواعد دقیق
بر اساس urgency_suggestion:

- اگر urgency_suggestion برابر normal یا home_care است: recommendations
  باید شامل ۲ تا ۴ راهنمایی عمومی مراقبتی غیردارویی باشد (مثل استراحت،
  مایعات کافی، چه زمانی به پزشک مراجعه کند).
- اگر urgency_suggestion برابر emergency است: recommendations باید
  شامل ۲ تا ۴ دستورالعمل ایمنی فوری (نه درمانی) باشد — مثل تماس با
  اورژانس، عدم جابه‌جایی بیمار، حفظ آرامش، باز نگه‌داشتن راه هوایی در
  صورت امکان.
- اگر urgency_suggestion برابر doctor_review است: recommendations را
  آرایه‌ی خالی [] بگذار — در این حالت توضیح در reasoning کافی است.

*** ممنوعیت مطلق در recommendations، تحت هیچ شرایطی نقض نشود: ***
۱. هرگز نام هیچ دارویی را ذکر نکن — حتی داروهای بدون‌نسخه (OTC) مثل
   استامینوفن، ایبوپروفن، آسپرین.
۲. هرگز دوز، مقدار مصرف، تعداد قرص، یا هر چیزی شبیه دستور نسخه ننویس.
۳. هرگز جمله‌ای که شبیه تشخیص قطعی بیماری باشد ننویس (مثل «شما به X
   مبتلا هستید») — recommendations فقط راهنمایی رفتاری/ایمنی است، نه
   تشخیص.
نقض هرکدام از این سه قانون، حتی یک‌بار، غیرقابل‌قبول است.

خروجی تو باید دقیقاً یک شیء JSON با این ساختار باشد و هیچ متن دیگری
(توضیح، markdown، پیش‌نویس) نداشته باشد:

{
  "urgency_suggestion": یکی از [${URGENCY_LEVELS.join(', ')}],
  "confidence": عددی بین 0 و 1,
  "reasoning": "توضیح کوتاه بالینی که مشخصاً به پاسخ‌های بیمار ارجاع می‌دهد",
  "clinical_alerts": ["هر علامت هشدار جدی که باید به پزشک انسانی اطلاع داده شود"],
  "recommendations": ["راهنمایی غیردارویی یا دستورالعمل ایمنی طبق قواعد بالا — آرایه‌ی خالی برای doctor_review"],
  "is_complete": true اگر اطلاعات کافی برای طبقه‌بندی داری، در غیر این صورت false
}

قوانین:
- اگر مطمئن نیستی یا اطلاعات کافی نداری، is_complete را false بگذار و
  confidence را پایین نگه‌دار — سیستم به‌صورت خودکار به doctor_review
  escalate می‌کند، پس تو نیازی به احتیاط‌کاری بیش‌ازحد در urgency_suggestion
  نداری؛ فقط صادقانه confidence واقعی‌ات را گزارش بده.
- هرگز تشخیص قطعی یا نسخه‌ی دارویی صادر نکن — نه در reasoning، نه در
  recommendations.
- علائمی مثل درد قفسه سینه، تنگی نفس شدید، از دست دادن هوشیاری، خونریزی
  شدید را همیشه در clinical_alerts ذکر کن، حتی اگر urgency_suggestion
  پایین‌تر باشد.
`.trim();

/**
 * تولید prompt نهایی برای ارسال به AI provider.
 * @param {object} params
 * @param {string} params.presentingProblemId
 * @param {number} params.age
 * @param {'male'|'female'} params.sex
 * @param {number} params.weightKg
 * @param {number} [params.heightCm] - اختیاری؛ اگر Backend ارسال نکند، از پرامپت حذف می‌شود
 * @param {string[]} [params.questionsAsked]
 * @param {string[]} [params.patientResponses]
 * @param {Array} [params.patientHistory] - خلاصه‌ی حداکثر ۵ مراجعه‌ی اخیر؛ نگاه کن به formatPatientHistory
 * @param {object} [params.medicalHistory] - { chronicConditions, allergies, currentMedications, surgicalHistory, familyHistory }؛ نگاه کن به formatMedicalHistory
 * @returns {{ system: string, user: string }}
 */
function generateTriagePrompt({
  presentingProblemId,
  age,
  sex,
  weightKg,
  heightCm,
  questionsAsked = [],
  patientResponses = [],
  patientHistory = [],
  medicalHistory,
}) {
  if (!presentingProblemId || typeof age !== 'number' || !sex || typeof weightKg !== 'number') {
    throw new Error('generateTriagePrompt: ورودی ناقص — presentingProblemId, age, sex, weightKg الزامی هستند.');
  }

  const qaLines = questionsAsked
    .map((q, i) => `س${i + 1}: ${q}\nج${i + 1}: ${patientResponses[i] ?? '(پاسخ داده نشده)'}`)
    .join('\n');

  const historyText = formatPatientHistory(patientHistory);
  const medicalHistoryText = formatMedicalHistory(medicalHistory);

  const userContent = `
شکایت اصلی (presenting_problem_id): ${presentingProblemId}
سن: ${age}
جنس: ${sex === 'male' ? 'مرد' : 'زن'}
وزن: ${weightKg} کیلوگرم
${typeof heightCm === 'number' ? `قد: ${heightCm} سانتی‌متر` : ''}

${qaLines ? `سوابق پرسش و پاسخ (این پاسخ‌ها را در تصمیم نهایی واقعاً لحاظ کن، نه صرفاً بازگو):\n${qaLines}` : 'هنوز هیچ سؤال و پاسخی ثبت نشده است.'}

${historyText}

${medicalHistoryText}

بر اساس این اطلاعات، طبق فرمت خواسته‌شده در دستورالعمل سیستم پاسخ بده.
`.trim();

  return {
    system: SYSTEM_INSTRUCTIONS,
    user: userContent,
  };
}

/**
 * *** قابلیت جدید — مدل سؤال‌محور پویا، به دستور صریح مدیر پروژه. ***
 * مرجع دقیق: نمونه‌ی هاردکد خود مدیرعامل سینا در بریف اولیه:
 * «شخصی به ما مراجعه کرده که سن او ۲۹ سال و وزن او ۷۵ کیلو و جنس او مرد
 * است، توضیح اولیه که به ما داده روزی سه ساعت سردرد دارد، برای این
 * موضوع با نقش تریاژ آنلاین سه سوال از وی بپرس تا پاسخ دهد و آن سه سوال
 * رو در قالب جیسان به من بده»
 *
 * موضوعات نمونه (شدت/مدت/علائم همراه) که مدیر پروژه قبلاً مثال زده بود
 * صرفاً نمونه‌اند، نه اسکریپت ثابت — این پرامپت از AI می‌خواهد بر اساس
 * شکایت خاص هر بیمار، سؤالات بالینی مرتبط را خودش تولید کند.
 */
const QUESTIONS_SYSTEM_INSTRUCTIONS = `
تو یک دستیار غربالگری بالینی هستی، نه یک پزشک. وظیفه‌ات این است که بر
اساس شکایت اولیه‌ی بیمار، دقیقاً ۵ سؤال بالینی مرتبط و مفید برای
تصمیم‌گیری بعدی طراحی کنی — نه سؤالات عمومی یا نامرتبط.

*** نحوه‌ی طراحی سؤالات — این بخش حیاتی است: ***
اول با خودت مشخص کن این شکایت به کدام حوزه‌ی بالینی تعلق دارد (مثلاً
قلبی-تنفسی، گوارشی، عصبی، پوستی، ادراری، اسکلتی-عضلانی، و…) و علائم
هشدار (red flags) شناخته‌شده‌ی آن حوزه چه هستند. سپس ۵ سؤالت را طوری
طراحی کن که دقیقاً همان علائم هشدار و ویژگی‌های تشخیصی‌افتراقی مرتبط با
همان حوزه را بسنجند.

*** سن و جنس و وزن بیمار را هم واقعاً در طراحی سؤالات لحاظ کن، نه فقط
دریافت کن. *** آستانه‌ی نگرانی برای یک علامت می‌تواند بسته به سن بیمار
فرق کند (مثلاً همان شکایت در یک بیمار سالمند معمولاً نیازمند توجه
بیشتری به علائم هشدار است تا در یک بیمار جوان). اگر سن یا سایر
مشخصات بیمار به‌نظرت روی انتخاب سؤالات تأثیر منطقی دارد، از آن استفاده
کن.

*** هرگز از یک الگوی ثابت (مثل «شدت + مدت + تب») برای همه‌ی شکایات
استفاده نکن. *** برای هر شکایت، سؤالات باید از نظر بالینی به آن حوزه‌ی
خاص اختصاصی باشند. برای مثال (فقط برای نشان دادن تفاوت رویکرد، نه
اسکریپت):
- «درد قفسه سینه» → سؤالات درباره‌ی انتشار درد به بازو/فک، تنگی نفس،
  تعریق، رابطه با فعالیت بدنی (علائم هشدار قلبی-تنفسی)
- «سردرد» → سؤالات درباره‌ی الگوی درد، حساسیت به نور/صدا، علائم عصبی
  همراه (علائم هشدار عصبی)
- «اسهال» → سؤالات درباره‌ی وجود خون در مدفوع، علائم کم‌آبی، مدت و
  دفعات (علائم هشدار گوارشی)
برای شکایتی که در این مثال‌ها نیست، خودت باید حوزه‌ی بالینی مناسب و
علائم هشدارش را تشخیص دهی و سؤالات را بر همان اساس بسازی.

*** اگر سابقه‌ی مراجعات اخیر بیمار در اختیارت گذاشته شده: ***
این را نباید فقط بی‌صدا در پس‌زمینه لحاظ کنی — اگر Episode مرتبطی در
سابقه هست (چه همان شکایت، چه شکایت متفاوت که ممکن است مرتبط باشد)،
**حداقل یکی از ۵ سؤالت باید صریحاً به آن Episode با ذکر فاصله‌ی زمانی
نسبی و شکایتش اشاره کند**، نه فقط ضمنی لحاظش کنی. برای مثال دقیقاً به
این شکل: «با توجه به اینکه [فاصله‌ی زمانی نسبی] برای [شکایت قبلی]
مراجعه کرده بودید، آیا آن کاملاً بهبود یافته؟» — این باید حتی وقتی
شکایت فعلی با شکایت قبلی فرق دارد هم انجام شود (مثلاً بیمار ۲۹ روز
پیش گلودرد داشته و الان سردرد دارد؛ سؤال باید همین ارتباط را صریحاً
ذکر کند). اگر سابقه‌ای داده نشده، طبیعی است — فقط بر اساس شکایت فعلی
سؤال طراحی کن و هیچ اشاره‌ای به سابقه نکن.

*** اگر سابقه‌ی پزشکی بیمار (بیماری زمینه‌ای، آلرژی، داروی مصرفی، سابقه‌ی
جراحی، سابقه‌ی خانوادگی) در اختیارت گذاشته شده: ***
در طراحی سؤالات از آن استفاده کن — مثلاً اگر بیمار سابقه‌ی آلرژی یا
بیماری زمینه‌ای مرتبط با حوزه‌ی بالینی شکایت فعلی دارد، می‌توانی یکی از
سؤالات را حول همین ارتباط بسازی. *** نکته‌ی حیاتی حریم خصوصی: *** این
متن‌ها توسط خود بیمار و بدون کنترل نوشته شده‌اند. اگر به نام شخص، شماره
تلفن، کد ملی، یا هر داده‌ی هویتی‌مانند دیگری برخوردی، آن را کاملاً
نادیده بگیر و هرگز در هیچ سؤالی تکرار یا حتی اشاره نکن. اگر سابقه‌ی
پزشکی داده نشده، طبیعی است — فقط بر اساس شکایت فعلی سؤال طراحی کن.

هر سؤال باید چندگزینه‌ای باشد (بین ۲ تا ۴ گزینه)، نه متن آزاد، تا بیمار
به‌سادگی بتواند از بین گزینه‌ها انتخاب کند.

خروجی تو باید دقیقاً یک شیء JSON با این ساختار باشد و هیچ متن دیگری
(توضیح، markdown) نداشته باشد:

{
  "questions": [
    { "questionText": "متن سؤال ۱", "options": ["گزینه۱", "گزینه۲", "..."] },
    { "questionText": "متن سؤال ۲", "options": ["گزینه۱", "گزینه۲", "..."] },
    { "questionText": "متن سؤال ۳", "options": ["گزینه۱", "گزینه۲", "..."] },
    { "questionText": "متن سؤال ۴", "options": ["گزینه۱", "گزینه۲", "..."] },
    { "questionText": "متن سؤال ۵", "options": ["گزینه۱", "گزینه۲", "..."] }
  ]
}

قوانین:
- دقیقاً ۵ سؤال، نه کمتر نه بیشتر.
- هر سؤال بین ۲ تا ۴ گزینه.
- هیچ تشخیص یا توصیه‌ی درمانی در این مرحله نده — فقط سؤال بپرس.
`.trim();

/**
 * تولید prompt برای مرحله‌ی تولید سؤال (قبل از submit-symptoms نهایی).
 * @param {object} params
 * @param {string} params.presentingProblemId
 * @param {string} [params.initialDescription] - توضیح اولیه‌ی بیمار (مثل «روزی سه ساعت سردرد دارد»)
 * @param {number} params.age
 * @param {'male'|'female'} params.sex
 * @param {number} params.weightKg
 * @param {Array} [params.patientHistory] - خلاصه‌ی حداکثر ۵ مراجعه‌ی اخیر؛ نگاه کن به formatPatientHistory
 * @param {object} [params.medicalHistory] - { chronicConditions, allergies, currentMedications, surgicalHistory, familyHistory }؛ نگاه کن به formatMedicalHistory
 * @returns {{ system: string, user: string }}
 */
function generateQuestionsPrompt({ presentingProblemId, initialDescription, age, sex, weightKg, patientHistory = [], medicalHistory }) {
  if (!presentingProblemId || typeof age !== 'number' || !sex || typeof weightKg !== 'number') {
    throw new Error('generateQuestionsPrompt: ورودی ناقص — presentingProblemId, age, sex, weightKg الزامی هستند.');
  }

  const historyText = formatPatientHistory(patientHistory);
  const medicalHistoryText = formatMedicalHistory(medicalHistory);

  const userContent = `
شکایت اصلی (presenting_problem_id): ${presentingProblemId}
سن: ${age}
جنس: ${sex === 'male' ? 'مرد' : 'زن'}
وزن: ${weightKg} کیلوگرم
توضیح اولیه‌ی بیمار: ${initialDescription || '(توضیح اولیه ثبت نشده)'}

${historyText}

${medicalHistoryText}

بر اساس این شکایت، طبق فرمت خواسته‌شده در دستورالعمل سیستم، دقیقاً ۵
سؤال چندگزینه‌ای مرتبط طراحی کن.
`.trim();

  return {
    system: QUESTIONS_SYSTEM_INSTRUCTIONS,
    user: userContent,
  };
}

module.exports = {
  generateTriagePrompt,
  SYSTEM_INSTRUCTIONS,
  generateQuestionsPrompt,
  QUESTIONS_SYSTEM_INSTRUCTIONS,
  formatPatientHistory,
  formatMedicalHistory,
};
