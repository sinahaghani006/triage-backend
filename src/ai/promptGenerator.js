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

/**
 * *** قابلیت جدید — پشتیبانی از patientHistory، به دستور صریح مدیر پروژه. ***
 *
 * *** قرارداد حریم خصوصی — حیاتی: ***
 * این تابع عمداً فقط ۴ فیلد مشخص را از هر ورودی می‌خواند: relativeDate،
 * previousComplaint، outcome، recommendationSummary. هر فیلد دیگری که
 * Backend ممکن است به‌اشتباه اضافه کند (مثلاً نام یا کد ملی بیمار)
 * نادیده گرفته می‌شود، چون اصلاً خوانده نمی‌شود — نه اینکه فیلتر شود.
 * این یک لایه‌ی دفاعی است، نه جایگزین مسئولیت Backend برای عدم ارسال
 * داده‌ی هویتی از همان ابتدا.
 *
 * حداکثر ۵ مورد پردازش می‌شود؛ مواردی بیشتر از ۵ نادیده گرفته می‌شوند.
 *
 * @param {Array<{relativeDate?: string, previousComplaint?: string, outcome?: string, recommendationSummary?: string}>} [patientHistory]
 * @returns {string} متن قالب‌بندی‌شده برای درج در prompt، یا رشته‌ی خالی اگر سابقه‌ای نباشد.
 */
function formatPatientHistory(patientHistory) {
  if (!Array.isArray(patientHistory) || patientHistory.length === 0) {
    return '';
  }

  const entries = patientHistory.slice(0, 5).map((entry, i) => {
    const relativeDate = typeof entry?.relativeDate === 'string' ? entry.relativeDate : 'تاریخ نامشخص';
    const previousComplaint =
      typeof entry?.previousComplaint === 'string' ? entry.previousComplaint : 'نامشخص';
    const outcome = typeof entry?.outcome === 'string' ? entry.outcome : 'نامشخص';
    const recommendationSummary =
      typeof entry?.recommendationSummary === 'string' && entry.recommendationSummary.trim() !== ''
        ? ` | خلاصه: ${entry.recommendationSummary}`
        : '';
    return `${i + 1}. [${relativeDate}] شکایت: ${previousComplaint} | نتیجه: ${outcome}${recommendationSummary}`;
  });

  return entries.join('\n');
}

const SYSTEM_INSTRUCTIONS = `
تو یک دستیار غربالگری بالینی هستی، نه یک پزشک. وظیفه‌ات فقط طبقه‌بندی
اولیه‌ی فوریت بر اساس اطلاعات داده‌شده است، نه تشخیص یا تجویز درمان.

*** نحوه‌ی استدلال — این بخش حیاتی است: ***
سن، جنس، وزن، شکایت اصلی، و تمام سوابق پرسش‌وپاسخی که از بیمار گرفته
شده را با هم در نظر بگیر، نه فقط عنوان شکایت اصلی به‌تنهایی. اگر پاسخ‌ها
نشانه‌ی علامت هشدار یا شدت غیرمنتظره‌ای داشته باشند، حتی اگر شکایت اصلی
در ظاهر ساده به‌نظر برسد (مثلاً «سردرد»)، باید همین موضوع در reasoning
و urgency_suggestion تو منعکس شود. reasoning تو باید صریحاً نشان دهد
که کدام پاسخ‌های خاص بیمار روی تصمیم تو تأثیر گذاشتند — نه یک توضیح
کلی که فقط اسم شکایت را تکرار کند.

*** دستورالعمل ویژه برای وقتی urgency_suggestion تو doctor_review است: ***
در این حالت، reasoning باید ۲ تا ۳ جمله باشد، نه یک برچسب کوتاه، و باید
صریحاً به پاسخ‌های خاصی که بیمار داده ارجاع بدهد (مثلاً «با توجه به
پاسخ‌هایی که دادید [X، Y، Z]، این ترکیب نیاز به بررسی مستقیم پزشک
دارد»).

*** اگر سابقه‌ی مراجعات اخیر بیمار در اختیارت گذاشته شده: ***
آن را هم در تحلیل لحاظ کن. مثلاً اگر بیمار به‌تازگی (طبق سابقه) برای
همین شکایت یا شکایت مشابه مراجعه کرده، یا نتیجه‌ی مراجعه‌ی قبلی خودش
نیازمند توجه پزشک بوده، این می‌تواند نشانه‌ی تکرارشونده یا حادتر بودن
وضعیت باشد و باید در reasoning و urgency_suggestion تو منعکس شود. اگر
سابقه‌ای داده نشده، طبیعی است — فقط بر اساس اطلاعات فعلی تصمیم بگیر.

*** مرز حیاتی و غیرقابل‌مذاکره: ***
این توضیح باید فقط «چرایی نیاز به ارجاع» باشد، نه تشخیص و نه توصیه‌ی
درمانی. هرگز جمله‌ای مثل «احتمالاً شما به [نام بیماری] مبتلا هستید» یا
هر توصیه‌ی دارویی/درمانی ننویس — فقط توضیح بده که کدام پاسخ‌ها یا چه
ترکیبی از آن‌ها باعث شده این تصمیم به تشخیص یک پزشک انسانی نیاز داشته
باشد.

خروجی تو باید دقیقاً یک شیء JSON با این ساختار باشد و هیچ متن دیگری
(توضیح، markdown، پیش‌نویس) نداشته باشد:

{
  "urgency_suggestion": یکی از [${URGENCY_LEVELS.join(', ')}],
  "confidence": عددی بین 0 و 1,
  "reasoning": "توضیح کوتاه بالینی که مشخصاً به پاسخ‌های بیمار ارجاع می‌دهد",
  "clinical_alerts": ["هر علامت هشدار جدی که باید به پزشک انسانی اطلاع داده شود"],
  "is_complete": true اگر اطلاعات کافی برای طبقه‌بندی داری، در غیر این صورت false
}

قوانین:
- اگر مطمئن نیستی یا اطلاعات کافی نداری، is_complete را false بگذار و
  confidence را پایین نگه‌دار — سیستم به‌صورت خودکار به doctor_review
  escalate می‌کند، پس تو نیازی به احتیاط‌کاری بیش‌ازحد در urgency_suggestion
  نداری؛ فقط صادقانه confidence واقعی‌ات را گزارش بده.
- هرگز تشخیص قطعی یا نسخه‌ی دارویی صادر نکن.
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
 * @param {string[]} [params.questionsAsked]
 * @param {string[]} [params.patientResponses]
 * @param {Array} [params.patientHistory] - خلاصه‌ی حداکثر ۵ مراجعه‌ی اخیر؛ نگاه کن به formatPatientHistory
 * @returns {{ system: string, user: string }}
 */
function generateTriagePrompt({
  presentingProblemId,
  age,
  sex,
  weightKg,
  questionsAsked = [],
  patientResponses = [],
  patientHistory = [],
}) {
  if (!presentingProblemId || typeof age !== 'number' || !sex || typeof weightKg !== 'number') {
    throw new Error('generateTriagePrompt: ورودی ناقص — presentingProblemId, age, sex, weightKg الزامی هستند.');
  }

  const qaLines = questionsAsked
    .map((q, i) => `س${i + 1}: ${q}\nج${i + 1}: ${patientResponses[i] ?? '(پاسخ داده نشده)'}`)
    .join('\n');

  const historyText = formatPatientHistory(patientHistory);

  const userContent = `
شکایت اصلی (presenting_problem_id): ${presentingProblemId}
سن: ${age}
جنس: ${sex === 'male' ? 'مرد' : 'زن'}
وزن: ${weightKg} کیلوگرم

${qaLines ? `سوابق پرسش و پاسخ (این پاسخ‌ها را در تصمیم نهایی واقعاً لحاظ کن، نه صرفاً بازگو):\n${qaLines}` : 'هنوز هیچ سؤال و پاسخی ثبت نشده است.'}

${historyText ? `سابقه‌ی مراجعات اخیر بیمار (حداکثر ۵ مورد آخر):\n${historyText}` : ''}

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
اساس شکایت اولیه‌ی بیمار، دقیقاً ۳ سؤال بالینی مرتبط و مفید برای
تصمیم‌گیری بعدی طراحی کنی — نه سؤالات عمومی یا نامرتبط.

*** نحوه‌ی طراحی سؤالات — این بخش حیاتی است: ***
اول با خودت مشخص کن این شکایت به کدام حوزه‌ی بالینی تعلق دارد (مثلاً
قلبی-تنفسی، گوارشی، عصبی، پوستی، ادراری، اسکلتی-عضلانی، و…) و علائم
هشدار (red flags) شناخته‌شده‌ی آن حوزه چه هستند. سپس ۳ سؤالت را طوری
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
آن را هم لحاظ کن — مثلاً اگر بیمار به‌تازگی برای همین شکایت یا شکایت
مرتبط مراجعه کرده، می‌توانی سؤالی درباره‌ی تفاوت وضعیت فعلی با آن
مراجعه بپرسی (مثلاً «آیا وضعیت نسبت به مراجعه‌ی قبلی بهتر شده، بدتر
شده، یا فرقی نکرده؟»). اگر سابقه‌ای داده نشده، طبیعی است — فقط بر
اساس شکایت فعلی سؤال طراحی کن.

هر سؤال باید چندگزینه‌ای باشد (بین ۲ تا ۴ گزینه)، نه متن آزاد، تا بیمار
به‌سادگی بتواند از بین گزینه‌ها انتخاب کند.

خروجی تو باید دقیقاً یک شیء JSON با این ساختار باشد و هیچ متن دیگری
(توضیح، markdown) نداشته باشد:

{
  "questions": [
    { "questionText": "متن سؤال ۱", "options": ["گزینه۱", "گزینه۲", "..."] },
    { "questionText": "متن سؤال ۲", "options": ["گزینه۱", "گزینه۲", "..."] },
    { "questionText": "متن سؤال ۳", "options": ["گزینه۱", "گزینه۲", "..."] }
  ]
}

قوانین:
- دقیقاً ۳ سؤال، نه کمتر نه بیشتر.
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
 * @returns {{ system: string, user: string }}
 */
function generateQuestionsPrompt({ presentingProblemId, initialDescription, age, sex, weightKg, patientHistory = [] }) {
  if (!presentingProblemId || typeof age !== 'number' || !sex || typeof weightKg !== 'number') {
    throw new Error('generateQuestionsPrompt: ورودی ناقص — presentingProblemId, age, sex, weightKg الزامی هستند.');
  }

  const historyText = formatPatientHistory(patientHistory);

  const userContent = `
شکایت اصلی (presenting_problem_id): ${presentingProblemId}
سن: ${age}
جنس: ${sex === 'male' ? 'مرد' : 'زن'}
وزن: ${weightKg} کیلوگرم
توضیح اولیه‌ی بیمار: ${initialDescription || '(توضیح اولیه ثبت نشده)'}

${historyText ? `سابقه‌ی مراجعات اخیر بیمار (حداکثر ۵ مورد آخر):\n${historyText}` : ''}

بر اساس این شکایت، طبق فرمت خواسته‌شده در دستورالعمل سیستم، دقیقاً ۳
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
};
