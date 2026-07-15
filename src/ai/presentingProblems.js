/**
 * presentingProblems.js
 *
 * *** فقط اسکلت ساختاری — محتوای بالینی هنوز تکمیل نشده. ***
 *
 * بریف رسمی گفته: «فهرست شکایات رایج — تعداد دقیق آیتم‌ها نامشخص است، بین
 * ۳۲ تا ۳۷، نیازمند تأیید با منبع واقعی، حدس نزن.»
 *
 * این فایل عمداً یک لیست کامل نمی‌سازد، چون این محتوای پزشکی است (نه
 * معماری) و ساختن یک لیست ۳۲-۳۷ تایی حدسی از شکایات بالینی دقیقاً همان
 * ریسکی است که این پروژه صریحاً منع کرده — یک فهرست ساختگی که شبیه واقعیت
 * به‌نظر می‌رسد.
 *
 * فقط ۲ آیتم نمونه، به‌وضوح مشخص‌شده به‌عنوان placeholder برای تست ساختار،
 * اضافه شده است — نه به‌عنوان لیست نهایی.
 *
 * *** پیش از استفاده در تولید، این فایل باید توسط مشاور پزشکی یا مدیر
 * پروژه با لیست کامل و تأییدشده جایگزین شود. ***
 */

/**
 * @typedef {object} PresentingProblem
 * @property {string} id - شناسه یکتا، همان presenting_problem_id که در
 *   promptGenerator.js و schemas.js استفاده می‌شود.
 * @property {string} labelFa - عنوان فارسی برای نمایش در UI (توسط Frontend).
 * @property {string[]} [synonyms] - مترادف‌های احتمالی برای جست‌وجو.
 */

/** @type {PresentingProblem[]} */
const PLACEHOLDER_PRESENTING_PROBLEMS = [
  {
    id: 'sore_throat',
    labelFa: 'گلودرد',
    synonyms: [],
    _placeholder: true,
  },
  {
    id: 'headache',
    labelFa: 'سردرد',
    synonyms: [],
    _placeholder: true,
  },
  {
    id: 'chest_pain',
    labelFa: 'درد قفسه سینه',
    synonyms: [],
    _placeholder: true,
  },
];

/**
 * برگرداندن لیست کامل شکایات رایج.
 * *** هشدار: در حال حاضر placeholder است، نه لیست نهایی تأییدشده. ***
 * @returns {PresentingProblem[]}
 */
function getPresentingProblemsList() {
  return PLACEHOLDER_PRESENTING_PROBLEMS;
}

/**
 * پیدا کردن یک شکایت با id.
 * @param {string} id
 * @returns {PresentingProblem|undefined}
 */
function findPresentingProblemById(id) {
  return PLACEHOLDER_PRESENTING_PROBLEMS.find((p) => p.id === id);
}

module.exports = {
  getPresentingProblemsList,
  findPresentingProblemById,
  // صادر شده تا مصرف‌کننده‌ها (تست‌ها، مدیر پروژه) به‌وضوح ببینند placeholder است:
  PLACEHOLDER_PRESENTING_PROBLEMS,
};
