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

function containsForeignLanguageArtifact(text) {
  return typeof text === 'string' && FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(text);
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
  const match = words.find((word) => FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word));
  return match || null;
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

  const cleanedWords = words.filter((word) => !FOREIGN_LANGUAGE_ARTIFACT_PATTERN.test(word));
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
const CLINICAL_CONCEPT_SYNONYMS = {
  fever: ['تب', 'دما', 'لرز', 'حرارت بدن', 'حرارت'],
  contact_exposure: ['تماس', 'ارتباط نزدیک', 'فرد بیمار', 'بیماری عفونی', 'کسی که'],
  swallowing: ['بلع', 'بلعیدن', 'قورت'],
  duration_timing: ['چند روز', 'چند ساعت', 'مدت', 'از کی', 'چند وقت', 'ساعت گذشته', 'روز گذشته'],
  severity: ['شدت', 'چقدر شدید', 'خفیف', 'متوسط بوده', 'شدید بوده'],
  breathing: ['تنفس', 'نفس کشیدن', 'تنگی نفس'],
  pain_radiation: ['انتشار', 'منتشر می‌شود', 'به بازو', 'به فک', 'به گردن'],
  aggravating_factors: ['بدتر می‌شود', 'تشدید می‌شود', 'با فعالیت', 'با استراحت'],
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
};
