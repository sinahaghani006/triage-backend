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
 *
 * *** فیکس — تأییدشده با شواهد واقعی production (۸ تست زنده، این گفتگو): ***
 * در ۳ از ۸ تست زنده‌ی اخیر (۳۷٪)، کاراکتر چینی (影响، 过去) یا سیریلیک
 * (контакт) مستقیماً در سؤالات فارسیِ نمایش‌داده‌شده به بیمار دیده شد. علت:
 * FOREIGN_LANGUAGE_ARTIFACT_PATTERN فقط لاتین accented را پوشش می‌داد
 * (نگاه کن به یادداشت عقب‌گرد CJK پایین‌تر) — سیریلیک و CJK اصلاً تشخیص
 * داده نمی‌شدند، پس نه رد می‌شدند نه پاک‌سازی، مستقیم به کاربر می‌رسیدند.
 *
 * راه‌حل انتخاب‌شده (ترکیب دو گزینه‌ی مطرح‌شده توسط مدیر پروژه):
 * ۱. تشخیص گسترش یافت (سیریلیک + CJK اضافه شدند)، **نه به‌شکل رد سخت
 *    مثل قبل، بلکه با یک لایه‌ی sanitize-in-place** (sanitizeIfSalvageable):
 *    اگر فقط بخش کوچکی از کلمات یک سؤال/گزینه مشکوک باشند (نسبت حذف ≤ ۳۰٪)،
 *    فقط همان کلمات حذف می‌شوند و بقیه‌ی متن سالم به کاربر می‌رسد — بدون
 *    نیاز به reject/retry کل پاسخ.
 * ۲. فقط اگر نسبت حذف بیش از ۳۰٪ باشد یا کل متن غیرقابل‌نجات شود (متن خالی
 *    بماند)، همان رفتار قبلی (throw → retry خودکار در aiTriageService.js،
 *    که از قبل با MAX_ATTEMPTS=2 وجود دارد) اعمال می‌شود.
 * این ترکیب دقیقاً از تکرار حادثه‌ی CJK قبلی (نرخ رد ۷۵٪) جلوگیری می‌کند،
 * چون دیگر هر تک‌کلمه‌ی خارجی باعث رد کل پاسخ نمی‌شود — فقط موارد واقعاً
 * غیرقابل‌اعتماد رد/retry می‌شوند.
 *
 * *** افزوده‌ی جدید — تضمین جمله‌ی تأکیدی «تشخیص قطعی فقط با معاینه‌ی
 * پزشک ممکن است»: *** نگاه کن به ensureDefinitiveDiagnosisDisclaimer
 * پایین‌تر در همین فایل — یک لایه‌ی safe-append مشابه sanitizeRecommendations
 * که این جمله‌ی الزامی پرامپت را تضمین می‌کند، مستقل از وفاداری مدل.
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

  // *** لایه‌ی دفاعی — نگاه کن به یادداشت ensureDefinitiveDiagnosisDisclaimer
  // پایین‌تر در همین فایل. ***
  logIfDefinitiveLanguageDetected(result.data.reasoning, 'round1-final');
  return {
    ...result.data,
    reasoning: ensureDefinitiveDiagnosisDisclaimer(result.data.reasoning),
  };
}

/**
 * *** به‌روزرسانی — نگاه کن به یادداشت فیکس بالای فایل. ***
 * قبلاً: فقط لاتین accented (À-ÿ, \u1E00-\u1EFF) — بازه‌های CJK بعد از
 * حادثه‌ی نرخ رد ۷۵٪ عقب‌گرد داده شده بودند (کامنت تاریخی پایین‌تر حفظ شده).
 * حالا: سیریلیک (\u0400-\u04FF) و CJK Unified Ideographs (\u4E00-\u9FFF)
 * هم اضافه شدند — چون شواهد واقعی production (این گفتگو) نشان داد هر دو
 * دسته واقعاً نشت می‌کنند. این‌بار برخلاف قبل، تشخیص باعث reject سخت کل
 * پاسخ نمی‌شود؛ نگاه کن به sanitizeIfSalvageable — فقط کلمه‌ی مشکل حذف
 * می‌شود، مگر آسیب خیلی زیاد باشد.
 *
 * *** یادداشت تاریخی (عقب‌گرد قبلی CJK) — برای مرجع، هنوز معتبر به‌عنوان
 * توضیح چرایی طراحی sanitize-in-place: ***
 * افزودن بازه‌های یونیکد CJK (commit قبلی، cb52be1) باعث نرخ رد ۷۵٪ در
 * تست‌های واقعی شد — چون آن‌موقع تشخیص فقط throw می‌کرد (reject کل پاسخ)،
 * نه sanitize. حالا که به‌جای reject سخت، ابتدا سعی در پاک‌سازی موضعی
 * می‌شود، همان ریسک تکرار نمی‌شود — فقط وقتی واقعاً بخش زیادی از متن خارجی
 * باشد (نادر) به رد/retry می‌رسیم.
 */
/**
 * *** به‌روزرسانی دوم — تأیید صریح مدیر پروژه (همین گفتگو): ***
 * شواهد Run 2 نشان داد یک کلمه‌ی انگلیسی ساده و بدون accent («contact»)
 * هم نشت کرده بود — پترن قبلی فقط لاتین accented را می‌گرفت، نه حروف
 * لاتین معمولی (a-z/A-Z). چون در هیچ‌کدام از ده‌ها سؤال بررسی‌شده تا
 * الان (طبق تأیید مدیر پروژه) هیچ اختصار/واحد لاتین معتبری (mg, kg,
 * COVID) داخل متن سؤال دیده نشده، اضافه‌کردن این بازه فعلاً ریسک
 * false-positive جدیدی ندارد. *** اگر بعداً یک الگوی جدید false-positive
 * دیده شد (مثلاً واحدهای اندازه‌گیری لاتین)، باید یک whitelist کوچک
 * برایشان اضافه شود — این کار عمداً الان انجام نشده چون هنوز هیچ
 * نمونه‌ی واقعی‌ای از این حالت دیده نشده. ***
 */
const FOREIGN_LANGUAGE_ARTIFACT_PATTERN = /[À-ÿ\u1E00-\u1EFF\u0400-\u04FFa-zA-Z\u4E00-\u9FFF]/;

/**
 * *** whitelist محدود — TASK 4، تأیید مدیر پروژه (این گفتگو)، بر اساس
 * شواهد واقعی (کلمه‌ی محرک "۳۸°C" در error_logs، sessionId d36e6324،
 * مسیر /generate-questions، 2026-08-19). عمداً محدود به دما (°C/°F) —
 * تنها الگویی که واقعاً در production دیده شده، نه پیش‌بینی. اگر واحد
 * دیگری (mg، mmHg و...) بعداً با شواهد واقعی مشابه دیده شد، باید جدا
 * اضافه شود — نه از قبل حدسی گسترش داده شود.
 * anchor کامل (^...$) عمداً است: باید کل کلمه دقیقاً همین شکل باشد، نه
 * صرفاً شامل این substring — کلمه‌ای مثل "Contact" هرگز match نمی‌شود.
 */
const WHITELISTED_MEASUREMENT_TOKEN_PATTERN = /^[\d۰-۹]*\s?°?(?:C|F)$/i;

function containsForeignLanguageArtifact(text) {
  if (typeof text !== 'string') return false;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word) && !WHITELISTED_MEASUREMENT_TOKEN_PATTERN.test(word));
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
  const match = words.find(
    (word) => FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word) && !WHITELISTED_MEASUREMENT_TOKEN_PATTERN.test(word)
  );
  return match || null;
}

function stripForeignLanguageArtifacts(text) {
  if (typeof text !== 'string') return text;
  const cleaned = text
    .split(/\s+/)
    .filter((word) => !FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word) || WHITELISTED_MEASUREMENT_TOKEN_PATTERN.test(word))
    .join(' ')
    .replace(/\s+([.,،؛])/g, '$1')
    .trim();
  return cleaned;
}

/**
 * *** قابلیت جدید — sanitize-in-place، نگاه کن به یادداشت فیکس بالای فایل. ***
 * نسخه‌ی «آگاه از آستانه»‌ی stripForeignLanguageArtifacts: اگر نسبت
 * کلمات حذف‌شده از یک آستانه‌ی مشخص بیشتر شود (یعنی متن آن‌قدر خراب است
 * که دیگر قابل‌اعتماد نیست)، به‌جای برگرداندن یک متن ناقص/گمراه‌کننده،
 * null برمی‌گرداند تا فراخوان تصمیم بگیرد کل پاسخ را رد/retry کند.
 *
 * @param {string} text
 * @returns {string|null} متن پاک‌شده، یا null اگر غیرقابل‌نجات باشد
 */
const MAX_REMOVED_WORD_RATIO = 0.3;

function sanitizeIfSalvageable(text) {
  if (typeof text !== 'string') return text;
  if (!containsForeignLanguageArtifact(text)) return text;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const cleanedWords = words.filter(
    (word) => !FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word) || WHITELISTED_MEASUREMENT_TOKEN_PATTERN.test(word)
  );
  const removedRatio = (words.length - cleanedWords.length) / words.length;

  if (removedRatio > MAX_REMOVED_WORD_RATIO || cleanedWords.length === 0) {
    return null;
  }

  return cleanedWords.join(' ').replace(/\s+([.,،؛؟])/g, '$1').trim();
}

/**
 * روی questionText و همه‌ی options یک سؤال sanitize-in-place اجرا می‌کند.
 * @param {{questionText: string, options: string[]}} question
 * @returns {{questionText: string, options: string[]}|null} سؤال پاک‌شده، یا null اگر غیرقابل‌نجات باشد
 */
function sanitizeQuestionIfSalvageable(question) {
  const cleanedQuestionText = sanitizeIfSalvageable(question.questionText);
  if (cleanedQuestionText === null) return null;

  const cleanedOptions = question.options.map(sanitizeIfSalvageable);
  if (cleanedOptions.some((opt) => opt === null)) return null;

  return { ...question, questionText: cleanedQuestionText, options: cleanedOptions };
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

/**
 * *** قابلیت جدید — تضمین کد-محور جمله‌ی الزامی «تشخیص قطعی فقط با
 * معاینه‌ی پزشک ممکن است» در reasoning. تأیید مدیرعامل/مدیر پروژه (این
 * گفتگو)، بر اساس شواهد واقعی: در ۲ از ۲ نمونه‌ی raw output واقعی
 * بررسی‌شده‌ی این گفتگو (یکی normal، یکی doctor_review)، این جمله‌ی
 * الزامیِ پرامپت (نگاه کن به PROBABILISTIC_INTERPRETATION_GUIDELINE در
 * promptGenerator.js) در reasoning غایب بود — دقیقاً همان الگویی که
 * قبلاً هم در این پروژه دیده شده (تکرار سؤالات دور دوم با وجود
 * دستورالعمل صریح ضدتکرار): اتکای صرف به پیروی مدل از پرامپت کافی نیست.
 *
 * *** طراحی: تکمیل ایمن (safe-append)، نه reject/retry. *** غیبت این
 * جمله یک نقص محتوایی است، نه یک نقض ایمنی حاد مثل نام دارو در
 * recommendations (که در sanitizeRecommendations حذف می‌شود) — پس رد
 * کردن کل پاسخ و تحمیل هزینه/تأخیر retry به آن نامتناسب است. در عوض،
 * اگر جمله غایب باشد، خودِ کد آن را در انتهای reasoning اضافه می‌کند؛
 * این هم ایمنی/شفافیت برای بیمار را تضمین می‌کند، هم مستقل از وفاداری
 * مدل به پرامپت است.
 *
 * *** تشخیص حضور — عمداً مبتنی بر مفهوم، نه تطبیق متن دقیق: *** چون
 * کوچک‌ترین بازنویسی مدل (کلمه‌ی متفاوت، ترتیب متفاوت) یک تطبیق متن
 * دقیق را می‌شکند، این تابع دنبال هم‌زمانی دو مفهوم کلیدی می‌گردد:
 * «تشخیص قطعی» و «معاینه». اگر هر دو در reasoning حضور داشته باشند،
 * فرض می‌شود جمله از قبل به‌شکلی گنجانده شده — محافظه‌کارانه است (ممکن
 * است گاهی جمله‌ای که این دو مفهوم را دارد ولی دقیقاً همین پیام را
 * نمی‌رساند به‌اشتباه «موجود» تشخیص داده شود)، ولی از افزودن جمله‌ی
 * تکراری/عجیب در انتهای reasoningهایی که از قبل چیزی مشابه گفته‌اند
 * جلوگیری می‌کند.
 *
 * *** یادداشت — مسئله‌ی جداگانه‌ی «عبارت قطعی به‌جای احتمالی در بدنه‌ی
 * reasoning» (مثلاً «نشان‌دهنده‌ی X است» به‌جای «می‌تواند نشان‌دهنده‌ی X
 * باشد») توسط این تابع فیکس نمی‌شود — نگاه کن به findDefinitiveLanguageMatch
 * / logIfDefinitiveLanguageDetected پایین‌تر در همین فایل. ***
 *
 * @param {string} reasoning
 * @returns {boolean}
 */
const DEFINITIVE_DIAGNOSIS_PHRASE_PATTERN = /تشخیص\s*قطعی/;
const PHYSICIAN_EXAMINATION_PHRASE_PATTERN = /معاینه/;
const MANDATORY_DISCLAIMER_SENTENCE = 'تشخیص قطعی فقط با معاینه‌ی پزشک ممکن است.';

function hasDefinitiveDiagnosisDisclaimer(reasoning) {
  if (typeof reasoning !== 'string') return false;
  return DEFINITIVE_DIAGNOSIS_PHRASE_PATTERN.test(reasoning) && PHYSICIAN_EXAMINATION_PHRASE_PATTERN.test(reasoning);
}

/**
 * اگر reasoning فاقد جمله‌ی الزامی تأکیدی باشد، آن را در انتها اضافه
 * می‌کند. اگر reasoning رشته نباشد یا خالی باشد، بدون تغییر برمی‌گرداند
 * (این تابع مسئول اعتبارسنجی نوع/وجود reasoning نیست — آن کار قبلاً
 * توسط AIRawResponseSchema/SecondRoundEscalationSchema انجام شده).
 *
 * @param {string} reasoning
 * @returns {string}
 */
function ensureDefinitiveDiagnosisDisclaimer(reasoning) {
  if (typeof reasoning !== 'string' || reasoning.trim().length === 0) return reasoning;
  if (hasDefinitiveDiagnosisDisclaimer(reasoning)) return reasoning;

  const trimmed = reasoning.trim();
  const alreadyEndsWithPunctuation = /[.!؟?]$/.test(trimmed);
  const separator = alreadyEndsWithPunctuation ? ' ' : '. ';
  return `${trimmed}${separator}${MANDATORY_DISCLAIMER_SENTENCE}`;
}

/**
 * *** قابلیت جدید — تشخیص (بدون بازنویسی) زبان قطعی به‌جای احتمالی در
 * بدنه‌ی reasoning. تأیید مدیر پروژه (این گفتگو)، بر اساس شواهد واقعی:
 * از ۶ نمونه‌ی raw output واقعی بررسی‌شده (۵ بیمار/session جدا)، ۲ مورد
 * (~۳۳٪، هر دو در urgency=normal) به‌جای عبارت احتمالی الزامی پرامپت
 * («می‌تواند نشان‌دهنده‌ی X باشد») از عبارت قطعی («نشان‌دهنده‌ی X است»)
 * استفاده کرده بودند. با این حجم نمونه، نمی‌شود قطعی گفت این یک الگوی
 * سیستماتیک همیشگی است یا نوسان طبیعی مدل — این تابع برای رصد نرخ واقعی
 * در طول زمان است، نه یک نتیجه‌گیری نهایی.
 *
 * *** طراحی: فقط تشخیص + لاگ، عمداً بدون بازنویسی خودکار متن — تأیید
 * صریح مدیر پروژه. *** برخلاف ensureDefinitiveDiagnosisDisclaimer (که
 * صرفاً یک جمله‌ی ثابت و از‌قبل‌نوشته را اضافه می‌کند)، تبدیل خودکار یک
 * جمله‌ی فارسی موجود از قطعی به احتمالی با regex ریسک بالایی برای تولید
 * متنی نامفهوم یا از نظر دستوری غلط دارد — این با افزودن یک جمله‌ی ثابت
 * در انتها کاملاً فرق دارد. تصمیم تأییدشده: فقط تشخیص و لاگ، تا نرخ
 * واقعی این الگو قابل‌ردیابی/گزارش‌گیری شود؛ تصمیم درباره‌ی بازنویسی
 * خودکار یا retry (اگر لازم شد) باید جداگانه و با شواهد بیشتر تأیید شود.
 *
 * *** محدودیت شناخته‌شده: *** لیست کوچک و اولیه‌ای از الگوهای رایج
 * قطعیت، بر اساس همان ۲ نمونه‌ی واقعی دیده‌شده — نه یک تشخیص‌دهنده‌ی
 * زبانی کامل. مثل CLINICAL_CONCEPT_SYNONYMS، باید با داده‌ی بیشتر
 * گسترش/تنظیم شود؛ ممکن است هم false negative (زبان قطعیِ دیگری که این
 * الگوها نمی‌گیرند) هم false positive (جمله‌ای که این الگو را دارد ولی
 * واقعاً مشکل‌ساز نیست) داشته باشد.
 */
const DEFINITIVE_LANGUAGE_PATTERNS = [
  /نشان‌دهنده‌ی[^.،؛]*\sاست\b/,
  /بیانگر[^.،؛]*\sاست\b/,
  /قطعاً/,
  /مسلماً/,
  /بدون شک/,
];

/**
 * @param {string} reasoning
 * @returns {string|null} خودِ عبارت مطابقت‌یافته (برای لاگ)، یا null اگر چیزی پیدا نشد
 */
function findDefinitiveLanguageMatch(reasoning) {
  if (typeof reasoning !== 'string') return null;
  for (const pattern of DEFINITIVE_LANGUAGE_PATTERNS) {
    const match = reasoning.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * فقط تشخیص می‌دهد و لاگ می‌کند — reasoning را کاملاً دست‌نخورده
 * برمی‌گرداند. نگاه کن به یادداشت DEFINITIVE_LANGUAGE_PATTERNS بالا
 * برای چرایی عدم بازنویسی خودکار.
 * @param {string} reasoning
 * @param {string} contextLabel - برای لاگ، مثلاً 'round1-final' یا 'round2-escalate'
 * @returns {string} همان reasoning ورودی، بدون هیچ تغییر
 */
function logIfDefinitiveLanguageDetected(reasoning, contextLabel) {
  const match = findDefinitiveLanguageMatch(reasoning);
  if (match) {
    console.warn(
      `[DEFINITIVE_LANGUAGE_DETECTED] context=${contextLabel} | matched="${match}" | این reasoning از عبارت قطعی به‌جای عبارت احتمالیِ الزامی پرامپت استفاده کرده — نگاه کن به یادداشت DEFINITIVE_LANGUAGE_PATTERNS در responseValidator.js. متن کامل reasoning: ${reasoning}`
    );
  }
  return reasoning;
}

/**
 * *** قابلیت جدید — تشخیص تکرار سؤالات دور دوم نسبت به دور اول. ***
 * تأیید مدیر پروژه در همین گفتگو، بر اساس شواهد واقعی: ۵ از ۶ ران واقعی
 * (۸۳٪) با ۲ تا ۴ سؤال تکراری با دور اول، با اینکه دستورالعمل پرامپت
 * (SECOND_ROUND_SYSTEM_INSTRUCTIONS) صراحتاً از تکرار منع کرده بود —
 * یعنی اتکای فقط به قول مدل کافی نبود، این یک لایه‌ی دفاعی کد است.
 *
 * روش: مقایسه‌ی هم‌پوشانی کلمات معنادار (بدون حروف‌اضافه/ضمایر رایج
 * فارسی) بین هر سؤال دور دوم و هر سؤال دور اول با شباهت Jaccard. این
 * روش عمداً بازنویسی‌های سطحی را هم می‌گیرد (نگاه کن به مثال در
 * SECOND_ROUND_SYSTEM_INSTRUCTIONS: «آیا درد به بازو منتشر می‌شود؟» در
 * برابر «آیا این درد به بازو شما هم می‌رسد؟» — این دو از نظر کلمه‌به‌کلمه
 * فرق دارند ولی هر دو دقیقاً همان بعد بالینی را می‌پرسند).
 *
 * این یک الگوریتم زبانی کامل نیست (فقط شباهت واژگانی، نه معنایی) — ولی
 * برای یک لایه‌ی دفاعی دوم (نه تنها منبع حقیقت) کافی و قابل‌تنظیم است.
 * آستانه (ROUND2_DUPLICATE_SIMILARITY_THRESHOLD) قابل‌تنظیم بر اساس داده‌ی
 * واقعی آینده است.
 */
/**
 * *** به‌روزرسانی — تأیید مدیر پروژه بر اساس شواهد خام واقعی (این گفتگو): ***
 * نسخه‌ی اول این تشخیص (فقط شباهت واژگانی خام/Jaccard) در عمل ۶ از ۶
 * ران واقعی محور «تب» را نگرفت، چون واژگان دو طرف اکثراً هم‌معنی ولی
 * متفاوت بودند («تب دارید» در برابر «دما یا لرز داشته‌اید»، «در تماس
 * بوده‌اید» در برابر «ارتباط نزدیک داشته‌اید») — شباهت لغوی خام این
 * هم‌معنایی را نمی‌بیند. فقط یک نمونه (محور «بلع»، ران ۶) تقریباً
 * کلمه‌به‌کلمه بود که Jaccard خام هم می‌گرفتش.
 *
 * راه‌حل: یک نگاشت کوچک «مفهوم بالینی → کلمات هم‌معنی» اضافه شد
 * (CLINICAL_CONCEPT_SYNONYMS)، بر اساس دقیقاً همان سه محوری که در داده‌ی
 * واقعی تکرار شدند (تب، تماس با فرد بیمار، بلع) به‌علاوه‌ی چند محور
 * رایج دیگر که در طراحی سؤالات این پروژه (نگاه کن به
 * QUESTIONS_SYSTEM_INSTRUCTIONS در promptGenerator.js) به‌کرات ذکر شده
 * (شدت، مدت، انتشار درد، عوامل تشدیدکننده). حالا تشخیص تکرار از دو
 * سیگنال مستقل استفاده می‌کند: (الف) شباهت واژگانی خام (Jaccard) —
 * برای بازنویسی‌های تقریباً کلمه‌به‌کلمه، (ب) اشتراک مفهوم بالینی —
 * برای پارافریزهای هم‌معنی. اگر هرکدام مثبت باشد، تکرار تشخیص داده
 * می‌شود.
 *
 * *** محدودیت شناخته‌شده: *** این نگاشت فقط محورهای دیده‌شده/رایج را
 * پوشش می‌دهد، نه هر مفهوم بالینی ممکن برای هر ۱۰ شکایت پروژه — یک
 * دیکشنری کامل نیست. اگر در داده‌های آینده محور تکراری جدیدی دیده شد
 * که این نگاشت نمی‌گیرد، باید کلمات هم‌معنی‌اش به همین شیء اضافه شود؛
 * نیازی به تغییر الگوریتم نیست، فقط داده.
 */
/**
 * *** افزوده‌ی جدید — محورهای اولیه برای ۴ دسته‌ی جدید presentingProblems
 * (mental_health, women_health, children_health, general_symptoms)،
 * تأیید مدیر پروژه، ۲ آگوست ۲۰۲۶: ***
 * برخلاف ۸ محور بالا که هرکدام از یک الگوی تکرار *واقعی* در production
 * استخراج شده بودند، این ۷ محور جدید یک **حدس منطقی اولیه** هستند —
 * چون این ۴ دسته تازه‌اند و هنوز هیچ session واقعی روی‌شان اجرا نشده،
 * پس هنوز هیچ داده‌ی واقعی از الگوی تکرار سؤال دور دوم برایشان وجود
 * ندارد. *** این محورها باید بعد از چند روز جمع‌آوری داده‌ی واقعی
 * production، دقیقاً مثل روندی که برای تب/تماس/بلع طی شد، بازبینی و
 * اصلاح شوند — ممکن است برخی حذف یا اضافه شوند. ***
 * نکته: «مدت علائم روانی» که برای mental_health درخواست شده بود را
 * محور جداگانه نساختم — چون duration_timing (بالا) از قبل عمومی است و
 * روی هر متنی که الگوی «مدت/چند روز/چند وقت» دارد کار می‌کند، صرف‌نظر
 * از دسته‌ی شکایت؛ افزودن یک محور تکراری برای همان چیز فایده‌ی عملکردی
 * نداشت.
 */
const CLINICAL_CONCEPT_SYNONYMS = {
  fever: ['تب', 'دما', 'لرز', 'حرارت بدن', 'حرارت'],
  contact_exposure: ['تماس', 'ارتباط نزدیک', 'فرد بیمار', 'بیماری عفونی', 'کسی که'],
  swallowing: ['بلع', 'بلعیدن', 'قورت'],
  duration_timing: ['چند روز', 'چند ساعت', 'مدت', 'از کی', 'چند وقت', 'ساعت گذشته', 'روز گذشته'],
  severity: ['شدت', 'چقدر شدید', 'خفیف', 'متوسط بوده', 'شدید بوده'],
  breathing: ['تنفس', 'نفس کشیدن', 'تنگی نفس'],
  pain_radiation: ['انتشار', 'منتشر می‌شود', 'به بازو', 'به فک', 'به گردن'],
  aggravating_factors: ['بدتر می‌شود', 'تشدید می‌شود', 'با فعالیت', 'با استراحت'],
  // --- محورهای اولیه‌ی جدید (پیشنهادی، نیازمند بازبینی با داده‌ی واقعی) ---
  sleep_pattern: ['خواب', 'بی‌خوابی', 'خوابیدن', 'الگوی خواب'],
  anxiety_stress: ['اضطراب', 'استرس', 'نگرانی'],
  pregnancy: ['بارداری', 'باردار', 'حاملگی'],
  menstruation: ['قاعدگی', 'پریود', 'عادت ماهانه'],
  child_age: ['سن کودک', 'چند ساله', 'چند ماهه', 'سن بچه'],
  feeding_nutrition: ['تغذیه', 'شیر خوردن', 'غذا خوردن', 'شیر مادر'],
  fatigue_weakness: ['ضعف', 'بی‌حالی', 'خستگی', 'رمق نداشتن'],
};

function findMatchingConcepts(text) {
  if (typeof text !== 'string') return new Set();
  const concepts = new Set();
  for (const [concept, synonyms] of Object.entries(CLINICAL_CONCEPT_SYNONYMS)) {
    if (synonyms.some((phrase) => text.includes(phrase))) {
      concepts.add(concept);
    }
  }
  return concepts;
}

function hasSharedConcept(setA, setB) {
  for (const c of setA) {
    if (setB.has(c)) return true;
  }
  return false;
}

const PERSIAN_STOPWORDS = new Set([
  'و', 'در', 'به', 'از', 'که', 'این', 'آن', 'یا', 'برای', 'با', 'هم', 'را',
  'است', 'آیا', 'شما', 'دارید', 'دارد', 'چه', 'چند', 'کدام', 'بین', 'روی',
  'تا', 'هر', 'بعد', 'قبل', 'دیگر', 'نیز', 'می', 'شد', 'شده', 'بودید',
  'بوده', 'کرده', 'کرد', 'یک', 'های', 'ها', 'را؟', 'چیست', 'چگونه', 'اگر',
  'وقتی', 'خود', 'شما؟', 'می‌شود', 'می‌شوید', 'داشته', 'داشتید',
]);

function extractSignificantWords(text) {
  if (typeof text !== 'string') return new Set();
  const cleaned = text.replace(/[؟?،,.!:؛«»"'()[\]]/g, ' ').toLowerCase();
  return new Set(
    cleaned
      .split(/\s+/)
      .filter((word) => word.length > 1 && !PERSIAN_STOPWORDS.has(word))
  );
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const ROUND2_DUPLICATE_SIMILARITY_THRESHOLD = 0.5;

/**
 * @param {string[]} round1QuestionTexts
 * @param {Array<{questionText: string}>} round2Questions
 * @returns {number[]} ایندکس‌های (۰-پایه) سؤالات دور دوم که با یکی از سؤالات دور اول تکراری تشخیص داده شدند (لغوی یا مفهومی)
 */
function findDuplicateRound2QuestionIndexes(round1QuestionTexts, round2Questions) {
  const round1WordSets = (round1QuestionTexts || []).map(extractSignificantWords);
  const round1ConceptSets = (round1QuestionTexts || []).map(findMatchingConcepts);
  if (round1WordSets.length === 0) return [];

  const duplicateIndexes = [];
  round2Questions.forEach((q2, idx) => {
    const words2 = extractSignificantWords(q2.questionText);
    const concepts2 = findMatchingConcepts(q2.questionText);

    const isLexicalDuplicate = round1WordSets.some(
      (words1) => jaccardSimilarity(words1, words2) >= ROUND2_DUPLICATE_SIMILARITY_THRESHOLD
    );
    const isConceptDuplicate = concepts2.size > 0 && round1ConceptSets.some((concepts1) => hasSharedConcept(concepts1, concepts2));

    if (isLexicalDuplicate || isConceptDuplicate) duplicateIndexes.push(idx);
  });
  return duplicateIndexes;
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

  const sanitizedQuestions = [];
  for (const q of result.data.questions) {
    if (!containsForeignLanguageArtifact(q.questionText) && !q.options.some(containsForeignLanguageArtifact)) {
      sanitizedQuestions.push(q);
      continue;
    }

    const sanitized = sanitizeQuestionIfSalvageable(q);
    if (sanitized === null) {
      const matchedWord =
        findForeignLanguageArtifactMatch(q.questionText) ||
        q.options.map(findForeignLanguageArtifactMatch).find(Boolean) ||
        '(نامشخص)';
      throw new ResponseValidationError(
        `یکی از سؤالات به‌قدری حاوی کلمات زبان غیرمنتظره است که پاک‌سازی موضعی کافی نیست — برای جلوگیری از گیج‌کردن بیمار رد شد. کلمه‌ی محرک: "${matchedWord}"`,
        { code: 'LANGUAGE_ARTIFACT_DETECTED', rawText }
      );
    }
    console.warn(`validateQuestionsResponse: کلمات زبان غیرمنتظره از یک سؤال پاک‌سازی شدند (سؤال سالم نگه داشته شد).`);
    sanitizedQuestions.push(sanitized);
  }

  return { ...result.data, questions: sanitizedQuestions };
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
 * *** پارامتر جدید round1QuestionTexts (اختیاری) — نگاه کن به یادداشت
 * findDuplicateRound2QuestionIndexes بالا. اگر داده نشود (مثلاً فراخوان
 * قدیمی)، بررسی تکرار به‌سادگی رد می‌شود — رفتار قبلی تغییر نمی‌کند. ***
 *
 * @param {string} rawText
 * @param {object} [options]
 * @param {string[]} [options.round1QuestionTexts] - متن ۵ سؤال دور اول، برای تشخیص تکرار
 * @returns {{escalate:false, questions: Array} | {escalate:true, urgency_suggestion:string, confidence:number, reasoning:string, clinical_alerts:string[], recommendations:string[], is_complete:boolean}}
 * @throws {ResponseValidationError}
 */
function validateSecondRoundResponse(rawText, { round1QuestionTexts = [] } = {}) {
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
    // *** لایه‌ی دفاعی — نگاه کن به یادداشت ensureDefinitiveDiagnosisDisclaimer
    // بالاتر در همین فایل. همان تضمین برای escalate دور دوم هم اعمال می‌شود. ***
    logIfDefinitiveLanguageDetected(result.data.reasoning, 'round2-escalate');
    return {
      ...result.data,
      reasoning: ensureDefinitiveDiagnosisDisclaimer(result.data.reasoning),
    };
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

  const sanitizedQuestions = [];
  for (const q of result.data.questions) {
    if (!containsForeignLanguageArtifact(q.questionText) && !q.options.some(containsForeignLanguageArtifact)) {
      sanitizedQuestions.push(q);
      continue;
    }

    const sanitized = sanitizeQuestionIfSalvageable(q);
    if (sanitized === null) {
      const matchedWord =
        findForeignLanguageArtifactMatch(q.questionText) ||
        q.options.map(findForeignLanguageArtifactMatch).find(Boolean) ||
        '(نامشخص)';
      throw new ResponseValidationError(
        `یکی از سؤالات دور دوم به‌قدری حاوی کلمات زبان غیرمنتظره است که پاک‌سازی موضعی کافی نیست — برای جلوگیری از گیج‌کردن بیمار رد شد. کلمه‌ی محرک: "${matchedWord}"`,
        { code: 'LANGUAGE_ARTIFACT_DETECTED', rawText }
      );
    }
    console.warn(`validateSecondRoundResponse: کلمات زبان غیرمنتظره از یک سؤال دور دوم پاک‌سازی شدند (سؤال سالم نگه داشته شد).`);
    sanitizedQuestions.push(sanitized);
  }

  // *** لاگ تشخیصی — تأیید مدیر پروژه، همین گفتگو (نگاه کن به aiTriageService.js). ***
  if (round1QuestionTexts.length === 0) {
    console.warn(
      'validateSecondRoundResponse: round1QuestionTexts خالی است — چک تکرار دور دوم رد می‌شود (اجرا نمی‌شود).'
    );
  }

  if (round1QuestionTexts.length > 0) {
    const duplicateIndexes = findDuplicateRound2QuestionIndexes(round1QuestionTexts, sanitizedQuestions);
    console.log(
      `validateSecondRoundResponse: چک تکرار اجرا شد — ${duplicateIndexes.length} سؤال تکراری از ${sanitizedQuestions.length} یافت شد.`
    );
    if (duplicateIndexes.length > 0) {
      throw new ResponseValidationError(
        `${duplicateIndexes.length} سؤال دور دوم (شماره‌ی ${duplicateIndexes.map((i) => i + 1).join('، ')}) با سؤالات دور اول هم‌پوشانی واژگانی بالا دارند — رد شد تا سؤال تکراری به بیمار نشان داده نشود.`,
        { code: 'ROUND2_QUESTION_DUPLICATE_DETECTED', rawText }
      );
    }
  }

  return { ...result.data, questions: sanitizedQuestions };
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
  sanitizeIfSalvageable,
  sanitizeRecommendations,
  isRecommendationSuspicious,
  findDuplicateRound2QuestionIndexes,
  hasDefinitiveDiagnosisDisclaimer,
  ensureDefinitiveDiagnosisDisclaimer,
  findDefinitiveLanguageMatch,
  logIfDefinitiveLanguageDetected,
};
