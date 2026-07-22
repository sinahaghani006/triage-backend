/**
 * presentingProblems.js
 *
 * *** نسخه‌ی نهایی ۱۰ موردی — تأیید مدیرعامل سینا، پیاده‌سازی‌شده در همین گفتگو. ***
 * جایگزین نسخه‌ی دموی ۱۵ موردی قبلی. این فایل به‌دستور صریح در پروژه
 * «حساس» علامت‌گذاری شده (منبع ۴ رگرسیون قبلی) — هر تغییر بعدی روی این
 * فایل باید مشابه همین‌جا، با شواهد واقعی از دیتابیس، تأیید شود.
 *
 * *** پیشینه‌ی ادغام (برای مرجع آینده) ***
 * بررسی واقعی دیتابیس (جدول‌های sessions و patient_history_summaries،
 * تاریخ بررسی: همین گفتگو) نشان داد از ۱۵ id قبلی، فقط ۸ تا واقعاً در
 * ۹۶ session ثبت‌شده استفاده شده بودند:
 *   sore_throat(27), headache(13), chest_pain(8), skin_rash(5),
 *   abdominal_pain(4), cough(3), fever(2), diarrhea(1)
 * ۷ id دیگر (back_pain, dizziness, urinary_symptoms, eye_redness,
 * ear_pain, nausea_vomiting, minor_injury) صفر استفاده‌ی واقعی داشتند.
 *
 * تصمیم ادغام تأییدشده برای رسیدن از ۱۵ به ۱۰:
 *   - cough + fever              → cold_flu_symptoms   (id جدید)
 *   - diarrhea + nausea_vomiting → gi_upset             (id جدید)
 *   - back_pain + minor_injury   → musculoskeletal_pain_or_injury (id جدید)
 *   - ear_pain  → داخل sore_throat (فقط ادغام برچسب، id تغییر نکرد)
 *   - dizziness → داخل headache    (فقط ادغام برچسب، id تغییر نکرد)
 *   - chest_pain, abdominal_pain, skin_rash, urinary_symptoms, eye_redness: بدون تغییر
 *
 * *** قرارداد حیاتی سازگاری با تاریخچه‌ی قدیمی — LEGACY_ID_ALIASES ***
 * فقط سه id که واقعاً در sessionهای قدیمی ثبت شده بودند و در ادغام حذف
 * شدند (cough, fever, diarrhea) در LEGACY_ID_ALIASES نگه داشته شده‌اند.
 * هدف: findPresentingProblemById روی یک presentingProblemId قدیمیِ ذخیره‌شده
 * در دیتابیس (مثلاً یک Session قدیمی با presentingProblemId='cough')
 * باید هنوز یک نتیجه‌ی معتبر و قابل‌نمایش برگرداند، نه undefined — تا
 * صفحه‌ی تاریخچه برای آن رکورد خالی/خراب نشود.
 * (ear_pain, dizziness, back_pain, minor_injury عمداً در LEGACY_ID_ALIASES
 * نیستند چون طبق شواهد دیتابیس صفر استفاده‌ی واقعی داشتند — تصمیم تأییدشده
 * محدود به همین ۳ id بود.)
 *
 * getPresentingProblemsList() فقط ۱۰ id نهایی را برمی‌گرداند (برای لیست
 * انتخاب در session جدید). findPresentingProblemById() هم لیست جدید و
 * هم LEGACY_ID_ALIASES را چک می‌کند.
 */

/**
 * @typedef {object} PresentingProblem
 * @property {string} id - شناسه یکتا، همان presenting_problem_id که در
 *   promptGenerator.js و schemas.js استفاده می‌شود.
 * @property {string} labelFa - عنوان فارسی برای نمایش در UI (توسط Frontend).
 * @property {string[]} [synonyms] - مترادف‌های احتمالی برای جست‌وجو.
 */

/** @type {PresentingProblem[]} */
const FINAL_PRESENTING_PROBLEMS = [
  {
    id: 'sore_throat',
    labelFa: 'گلودرد یا گوش‌درد',
    synonyms: ['درد گلو', 'گوش‌درد', 'درد گوش'],
  },
  {
    id: 'headache',
    labelFa: 'سردرد یا سرگیجه',
    synonyms: ['سرگیجه', 'گیجی'],
  },
  {
    id: 'chest_pain',
    labelFa: 'درد قفسه سینه',
    synonyms: ['درد سینه'],
  },
  {
    id: 'cold_flu_symptoms',
    labelFa: 'سرماخوردگی، سرفه یا تب',
    synonyms: ['سرفه', 'تب', 'تب و لرز'],
  },
  {
    id: 'abdominal_pain',
    labelFa: 'درد شکم',
    synonyms: ['دل‌درد'],
  },
  {
    id: 'gi_upset',
    labelFa: 'اسهال، تهوع یا استفراغ',
    synonyms: ['اسهال', 'تهوع', 'استفراغ', 'حالت تهوع'],
  },
  {
    id: 'skin_rash',
    labelFa: 'جوش یا بثورات پوستی',
    synonyms: ['کهیر', 'راش پوستی'],
  },
  {
    id: 'urinary_symptoms',
    labelFa: 'علائم ادراری',
    synonyms: ['سوزش ادرار', 'تکرر ادرار'],
  },
  {
    id: 'eye_redness',
    labelFa: 'قرمزی یا درد چشم',
    synonyms: [],
  },
  {
    id: 'musculoskeletal_pain_or_injury',
    labelFa: 'کمردرد، آسیب یا زخم سطحی',
    synonyms: ['کمردرد', 'بریدگی', 'کوفتگی', 'آسیب'],
  },
];

/**
 * نگاشت presentingProblemId های قدیمی (که در سشن‌های واقعی گذشته ثبت
 * شده‌اند و در ادغام حذف شدند) به id جدیدی که جایگزینشان شده.
 * فقط برای findPresentingProblemById استفاده می‌شود — هرگز در
 * getPresentingProblemsList ظاهر نمی‌شود.
 * @type {Record<string, string>}
 */
const LEGACY_ID_ALIASES = {
  cough: 'cold_flu_symptoms',
  fever: 'cold_flu_symptoms',
  diarrhea: 'gi_upset',
};

/**
 * برگرداندن لیست نهایی ۱۰ موردی شکایات، برای نمایش در انتخاب شکایت
 * session جدید. هرگز شامل id های legacy نیست.
 * @returns {PresentingProblem[]}
 */
function getPresentingProblemsList() {
  return FINAL_PRESENTING_PROBLEMS;
}

/**
 * پیدا کردن یک شکایت با id — هم در لیست نهایی، هم (در صورت نبود) در
 * LEGACY_ID_ALIASES می‌گردد تا presentingProblemId های قدیمیِ ذخیره‌شده
 * در تاریخچه‌ی واقعی بیماران هرگز نتیجه‌ی undefined ندهند.
 *
 * @param {string} id
 * @returns {(PresentingProblem & { isLegacyAlias?: boolean, legacyId?: string }) | undefined}
 */
function findPresentingProblemById(id) {
  const direct = FINAL_PRESENTING_PROBLEMS.find((p) => p.id === id);
  if (direct) return direct;

  const aliasedId = LEGACY_ID_ALIASES[id];
  if (aliasedId) {
    const aliasedProblem = FINAL_PRESENTING_PROBLEMS.find((p) => p.id === aliasedId);
    if (aliasedProblem) {
      return { ...aliasedProblem, isLegacyAlias: true, legacyId: id };
    }
  }

  return undefined;
}

module.exports = {
  getPresentingProblemsList,
  findPresentingProblemById,
  FINAL_PRESENTING_PROBLEMS,
  LEGACY_ID_ALIASES,
};
