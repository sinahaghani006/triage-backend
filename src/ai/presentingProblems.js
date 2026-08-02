/**
 * presentingProblems.js
 *
 * *** نسخه‌ی ۱۴ دسته + «سایر علائم» — طبق تصمیم مدیرعامل سینا (بخش ۷.۳
 * سند انتقال)، بازنویسی‌شده در همین گفتگو. ***
 * جایگزین نسخه‌ی قبلی (۱۰ موردی + «سایر علائم» به‌عنوان افزوده‌ی موقت).
 * این فایل به‌دستور صریح در پروژه «حساس» علامت‌گذاری شده (منبع ۴ رگرسیون
 * قبلی) — هر تغییر بعدی روی این فایل باید مشابه همین‌جا، با شواهد واقعی
 * از دیتابیس، تأیید شود.
 *
 * *** پیشینه‌ی ادغام قبلی (برای مرجع، از نسخه‌ی قبلی این فایل) ***
 * نسخه‌ی قبل‌تر (۱۵ → ۱۰) بر اساس بررسی واقعی دیتابیس ساخته شده بود:
 *   cough + fever                → cold_flu_symptoms
 *   diarrhea + nausea_vomiting   → gi_upset
 *   back_pain + minor_injury     → musculoskeletal_pain_or_injury
 *   ear_pain (ادغام برچسبی)      → sore_throat
 *   dizziness (ادغام برچسبی)    → headache
 *
 * *** نگاشت نسخه‌ی قبلی (۱۰+۱ فعال) به نسخه‌ی جدید (۱۴+۱) ***
 *   sore_throat                    → sore_throat_ear        (تغییر نام)
 *   headache                       → headache_dizziness     (تغییر نام)
 *   chest_pain                     → chest_pain_breathing   (تغییر نام + گسترش دامنه)
 *   cold_flu_symptoms              → cold_flu_symptoms      (id بدون تغییر)
 *   abdominal_pain                 → abdominal_pain         (id بدون تغییر)
 *   gi_upset                       → digestive_problems     (تغییر نام)
 *   skin_rash                      → skin_hair_nails        (تغییر نام + گسترش دامنه)
 *   urinary_symptoms               → urinary_symptoms       (id بدون تغییر)
 *   eye_redness                    → eye_problems           (تغییر نام)
 *   musculoskeletal_pain_or_injury → bone_joint_injury      (تغییر نام)
 *   other_symptoms                 → other_symptoms         (id بدون تغییر)
 * دسته‌های کاملاً جدید، بدون معادل قدیمی: general_symptoms, women_health,
 * children_health, mental_health.
 *
 * *** قرارداد حیاتی سازگاری با تاریخچه‌ی قدیمی — LEGACY_ID_ALIASES ***
 * هر presentingProblemId که در نسخه‌ی قبلیِ این فایل (چه در لیست فعال،
 * چه در LEGACY_ID_ALIASES خودش) معتبر بود ولی در این بازنویسی id اش
 * عوض یا حذف شد، اینجا نگه داشته شده تا یک Session قدیمیِ واقعی با آن id
 * هنوز نتیجه‌ی معتبر و قابل‌نمایش بگیرد، نه undefined:
 *   - cough, fever  → قبلاً به cold_flu_symptoms اشاره داشتند؛ چون این id
 *     بدون تغییر مانده، مقصدشان هم بدون تغییر است.
 *   - diarrhea      → قبلاً به gi_upset اشاره داشت؛ چون gi_upset به
 *     digestive_problems تغییر نام داد، مقصد diarrhea هم به‌روزرسانی شد.
 *   - sore_throat, headache, chest_pain, gi_upset, skin_rash, eye_redness,
 *     musculoskeletal_pain_or_injury → این ۷ id تا همین دیروز id فعال
 *     production بودند و قطعاً در session های واقعی اخیر ثبت شده‌اند؛
 *     هرکدام به id جدید معادلش نگاشته شده.
 * (ear_pain, dizziness, back_pain, minor_injury طبق تصمیم قبلاً تأییدشده
 * در ادغام ۱۵→۱۰ عمداً بیرون از LEGACY_ID_ALIASES ماندند، چون شواهد
 * دیتابیس در آن زمان صفر استفاده‌ی واقعی نشان داده بود. این بازنویسی آن
 * تصمیم را تغییر نداده.)
 *
 * *** نیازمند بررسی/تأیید قبل از push نهایی ***
 * لیست ۱۴ دسته + متن دقیق برچسب‌های فارسی مستقیماً از بخش ۷.۳ سند انتقال
 * (تأیید مدیرعامل) گرفته شده و تغییر داده نشده. اما synonyms برای ۴
 * دسته‌ی کاملاً تازه (general_symptoms, women_health, children_health,
 * mental_health) توسط من به‌صورت اولیه پیشنهاد شده‌اند و در هیچ گفتگوی
 * قبلی تأیید نشده‌اند -- قبل از commit/push نهایی این را با مدیر پروژه
 * چک کن.
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
    id: 'general_symptoms',
    labelFa: 'تب، ضعف یا بی‌حالی',
    synonyms: ['خستگی', 'بی‌حالی', 'ضعف عمومی'],
  },
  {
    id: 'cold_flu_symptoms',
    labelFa: 'سرماخوردگی، سرفه یا تب',
    synonyms: ['سرفه', 'تب', 'تب و لرز', 'سرماخوردگی'],
  },
  {
    id: 'sore_throat_ear',
    labelFa: 'گلودرد یا گوش‌درد',
    synonyms: ['درد گلو', 'گوش‌درد', 'درد گوش'],
  },
  {
    id: 'headache_dizziness',
    labelFa: 'سردرد یا سرگیجه',
    synonyms: ['سرگیجه', 'گیجی'],
  },
  {
    id: 'chest_pain_breathing',
    labelFa: 'درد قفسه سینه یا تنگی نفس',
    synonyms: ['درد سینه', 'تنگی نفس', 'مشکل تنفس'],
  },
  {
    id: 'abdominal_pain',
    labelFa: 'درد شکم یا معده',
    synonyms: ['دل‌درد', 'درد معده'],
  },
  {
    id: 'digestive_problems',
    labelFa: 'اسهال، تهوع یا یبوست',
    synonyms: ['اسهال', 'تهوع', 'استفراغ', 'یبوست', 'حالت تهوع'],
  },
  {
    id: 'urinary_symptoms',
    labelFa: 'سوزش، درد یا مشکل ادرار',
    synonyms: ['سوزش ادرار', 'تکرر ادرار'],
  },
  {
    id: 'skin_hair_nails',
    labelFa: 'جوش، حساسیت یا مشکلات پوست',
    synonyms: ['کهیر', 'راش پوستی', 'حساسیت پوستی', 'مشکل مو', 'مشکل ناخن'],
  },
  {
    id: 'eye_problems',
    labelFa: 'قرمزی، درد یا تاری دید',
    synonyms: ['قرمزی چشم', 'تاری دید'],
  },
  {
    id: 'bone_joint_injury',
    labelFa: 'کمردرد، درد مفاصل یا آسیب',
    synonyms: ['کمردرد', 'درد مفاصل', 'بریدگی', 'کوفتگی', 'آسیب'],
  },
  {
    id: 'women_health',
    labelFa: 'مشکلات بانوان یا بارداری',
    synonyms: ['بارداری', 'قاعدگی', 'مشکلات زنان'],
  },
  {
    id: 'children_health',
    labelFa: 'مشکلات نوزاد یا کودک',
    synonyms: ['کودک', 'نوزاد', 'شیرخوار'],
  },
  {
    id: 'mental_health',
    labelFa: 'اضطراب، استرس یا بی‌خوابی',
    synonyms: ['اضطراب', 'استرس', 'بی‌خوابی', 'افسردگی'],
  },
  {
    id: 'other_symptoms',
    labelFa: 'سایر علائم یا مشکل دیگر (متن آزاد)',
    synonyms: [],
  },
];

/**
 * نگاشت presentingProblemId های قدیمی (که در session های واقعی گذشته
 * ثبت شده‌اند ولی در این نسخه دیگر id فعال نیستند) به id جدیدی که
 * جایگزینشان شده. فقط برای findPresentingProblemById استفاده می‌شود —
 * هرگز در getPresentingProblemsList ظاهر نمی‌شود.
 * @type {Record<string, string>}
 */
const LEGACY_ID_ALIASES = {
  // از ادغام ۱۵→۱۰ (نسخه‌ی قبل‌تر از قبلی)
  cough: 'cold_flu_symptoms',
  fever: 'cold_flu_symptoms',
  diarrhea: 'digestive_problems',
  // id های فعال نسخه‌ی بلافصل قبلی (۱۰+۱) که در این بازنویسی تغییر نام دادند
  sore_throat: 'sore_throat_ear',
  headache: 'headache_dizziness',
  chest_pain: 'chest_pain_breathing',
  gi_upset: 'digestive_problems',
  skin_rash: 'skin_hair_nails',
  eye_redness: 'eye_problems',
  musculoskeletal_pain_or_injury: 'bone_joint_injury',
};

/**
 * برگرداندن لیست نهایی ۱۴+۱ موردی شکایات، برای نمایش در انتخاب شکایت
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
