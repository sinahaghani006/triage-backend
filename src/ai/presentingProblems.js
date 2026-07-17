/**
 * presentingProblems.js
 *
 * *** نسخه‌ی دمو — نه لیست نهایی. ***
 *
 * به دستور مدیر پروژه (سینا)، برای یک دموی سریع به مدیرعامل، این لیست از
 * ۳ آیتم placeholder به ۱۵ مورد رایج و عمومی گسترش یافت. این هنوز لیست
 * نهایی ۳۲-۳۷ موردی که بریف اصلی خواسته بود نیست — فقط برای دمو کافی است.
 *
 * این ۱۵ مورد صرفاً «برچسب دسته‌بندی شکایت» هستند (سطحی که در سیستم‌های
 * غربالگری عمومی مثل NHS 111 هم دیده می‌شود) — نه توصیه‌ی درمانی، نه
 * تشخیص، نه دوز دارویی. هیچ محتوای بالینی فراتر از نام و مترادف اضافه
 * نشده است.
 *
 * *** پیش از اتصال به بیمار واقعی، این لیست باید توسط مشاور پزشکی یا
 * مدیر پروژه با نسخه‌ی کامل و تأییدشده جایگزین شود. ***
 */

/**
 * @typedef {object} PresentingProblem
 * @property {string} id - شناسه یکتا، همان presenting_problem_id که در
 *   promptGenerator.js و schemas.js استفاده می‌شود.
 * @property {string} labelFa - عنوان فارسی برای نمایش در UI (توسط Frontend).
 * @property {string[]} [synonyms] - مترادف‌های احتمالی برای جست‌وجو.
 */

/** @type {PresentingProblem[]} */
const DEMO_PRESENTING_PROBLEMS = [
  { id: 'sore_throat', labelFa: 'گلودرد', synonyms: ['درد گلو'] },
  { id: 'headache', labelFa: 'سردرد', synonyms: [] },
  { id: 'chest_pain', labelFa: 'درد قفسه سینه', synonyms: ['درد سینه'] },
  { id: 'fever', labelFa: 'تب', synonyms: ['تب و لرز'] },
  { id: 'cough', labelFa: 'سرفه', synonyms: [] },
  { id: 'abdominal_pain', labelFa: 'درد شکم', synonyms: ['دل‌درد'] },
  { id: 'back_pain', labelFa: 'کمردرد', synonyms: [] },
  { id: 'skin_rash', labelFa: 'جوش یا بثورات پوستی', synonyms: ['کهیر', 'راش پوستی'] },
  { id: 'diarrhea', labelFa: 'اسهال', synonyms: [] },
  { id: 'dizziness', labelFa: 'سرگیجه', synonyms: ['گیجی'] },
  { id: 'urinary_symptoms', labelFa: 'علائم ادراری', synonyms: ['سوزش ادرار', 'تکرر ادرار'] },
  { id: 'eye_redness', labelFa: 'قرمزی یا درد چشم', synonyms: [] },
  { id: 'ear_pain', labelFa: 'گوش‌درد', synonyms: [] },
  { id: 'nausea_vomiting', labelFa: 'تهوع یا استفراغ', synonyms: ['حالت تهوع'] },
  { id: 'minor_injury', labelFa: 'آسیب یا زخم سطحی', synonyms: ['بریدگی', 'کوفتگی'] },
];

/**
 * برگرداندن لیست شکایات رایج.
 * *** هشدار: این لیست دمو است، نه لیست نهایی تأییدشده (۱۵ مورد از ۳۲-۳۷ مورد). ***
 * @returns {PresentingProblem[]}
 */
function getPresentingProblemsList() {
  return DEMO_PRESENTING_PROBLEMS;
}

/**
 * پیدا کردن یک شکایت با id.
 * @param {string} id
 * @returns {PresentingProblem|undefined}
 */
function findPresentingProblemById(id) {
  return DEMO_PRESENTING_PROBLEMS.find((p) => p.id === id);
}

module.exports = {
  getPresentingProblemsList,
  findPresentingProblemById,
  DEMO_PRESENTING_PROBLEMS,
};

