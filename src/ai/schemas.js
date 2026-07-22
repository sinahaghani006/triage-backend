/**
 * schemas.js
 *
 * *** طراحی جدید — به دستور صریح مدیر پروژه (سینا)، تاریخ تأیید: همین گفتگو. ***
 * این فایل بازسازی نیست. هیچ نسخه‌ی قبلی‌ای از این فایل در دسترس نبود (جست‌وجوی
 * کامل دیسک کاربر + git history هیچ مدرکی نداد). این طراحی از صفر، صرفاً بر
 * اساس بریف رسمی مدیرعامل سینا و قوانین حیاتی پروژه نوشته شده است.
 *
 * قبل از استفاده در تولید باید توسط مدیر پروژه بررسی و تأیید شود — به‌خصوص
 * لیست enum ها (presenting_problem_id ها، urgency levels) که باید با نسخه‌ی
 * نهایی presentingProblems.js هماهنگ شود.
 */

const { z } = require('zod');

// ترتیب فوریت — طبق قانون escalate-only پروژه: normal < home_care < doctor_review < emergency
const URGENCY_LEVELS = ['normal', 'home_care', 'doctor_review', 'emergency'];

/**
 * PatientContextSchema — ورودی که به AI ارسال می‌شود.
 * قانون حیاتی پروژه: هیچ داده هویتی (نام، کد ملی، آدرس) نباید اینجا باشد.
 * فقط داده بالینی: شکایت، سن، جنس، وزن، قد.
 *
 * heightCm اختیاری است — طبق مشاهده‌ی migration جدید Backend
 * (add_height_cm) که هنوز رسماً به این ماژول اعلام نشده بود؛ برای
 * سازگاری با نسخه‌های قبلی Backend که این فیلد را ارسال نمی‌کنند.
 */
/**
 * MedicalHistorySchema — Task «اتصال Medical History»، تأیید مدیر پروژه
 * در همین گفتگو.
 *
 * قرارداد واقعی Backend (GET /users/me/medical-history، تأییدشده با شواهد
 * خام از medicalHistoryValidators.js): پنج فیلد آرایه‌ای از متن آزاد،
 * بدون اعتبارسنجی محتوایی. این schema فقط شکل داده (آرایه‌ای از رشته) را
 * چک می‌کند — پاک‌سازی محتوایی (حذف شماره تلفن/کدملی/ایمیل) وظیفه‌ی
 * medicalHistorySanitizer.js است، نه این schema.
 */
const MedicalHistorySchema = z
  .object({
    chronicConditions: z.array(z.string()).default([]),
    allergies: z.array(z.string()).default([]),
    currentMedications: z.array(z.string()).default([]),
    surgicalHistory: z.array(z.string()).default([]),
    familyHistory: z.array(z.string()).default([]),
  })
  .optional();

const PatientContextSchema = z.object({
  presentingProblemId: z.string().min(1),
  age: z.number().int().positive().max(130),
  sex: z.enum(['male', 'female']),
  weightKg: z.number().positive().max(500),
  heightCm: z.number().positive().max(300).optional(),
  questionsAsked: z.array(z.string()).default([]),
  patientResponses: z.array(z.string()).default([]),
  medicalHistory: MedicalHistorySchema,
});

/**
 * AIRawResponseSchema — پاسخ خام مورد انتظار از AI provider، قبل از هر پردازش.
 * این schema باید دقیقاً با چیزی که در promptGenerator.js از AI خواسته می‌شود
 * مطابقت داشته باشد.
 *
 * *** به‌روزرسانی — به دستور صریح مدیر پروژه: ***
 * recommendations حالا بخشی از قرارداد خروجی AI است. مرز محتوایی سخت
 * (بدون نام دارو، بدون دوز، بدون تشخیص قطعی) در SYSTEM_INSTRUCTIONS
 * (promptGenerator.js) به‌عنوان یک قانون سخت درج شده، و علاوه بر آن یک
 * لایه‌ی دفاعی کد (sanitizeRecommendations در responseValidator.js) هر
 * موردی که با این مرز مطابقت نداشته باشد را حذف می‌کند — یعنی این مرز
 * فقط به قول مدل متکی نیست.
 */
const AIRawResponseSchema = z.object({
  urgency_suggestion: z.enum(URGENCY_LEVELS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  clinical_alerts: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  is_complete: z.boolean(),
});

/**
 * TriageResultSchema — خروجی نهایی این ماژول که به Backend تحویل داده می‌شود.
 * urgency_level اینجا سطح نهایی بعد از اعمال قوانین محافظه‌کارانه است، نه
 * urgency_suggestion خام AI.
 */
const TriageResultSchema = z.object({
  session_id: z.string().min(1),
  presenting_problem_id: z.string().min(1),
  urgency_level: z.enum(URGENCY_LEVELS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  clinical_alerts: z.array(z.string()),
  recommendations: z.array(z.string()), // برای normal/home_care/emergency از AI (پس از پاکسازی)؛ برای doctor_review همیشه خالی
  questions_asked: z.array(z.string()),
  patient_responses: z.array(z.string()),
  generated_at: z.string(),
  model_meta: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    fallback_used: z.boolean(),
  }),
});

/**
 * TriageQuestionSchema / TriageQuestionsRawSchema
 *
 * *** قابلیت جدید — به دستور صریح مدیر پروژه، برای مدل سؤال‌محور پویا. ***
 * مرجع: نمونه‌ی هاردکد خود مدیرعامل سینا در بریف اولیه («سه سوال از وی
 * بپرس... در قالب جیسان»). این schema پاسخ خام AI را برای مرحله‌ی تولید
 * سؤال (قبل از submit-symptoms نهایی) اعتبارسنجی می‌کند — کاملاً جدا از
 * AIRawResponseSchema که برای مرحله‌ی تشخیص نهایی urgency است.
 *
 * تعداد گزینه‌ها (۲ تا ۴) در schema چک می‌شود؛ تعداد دقیق سؤالات (همیشه ۵)
 * چون این شبیه‌ساز zod از .length() پشتیبانی نمی‌کند، در aiTriageService.js
 * به‌صورت جداگانه و صریح چک و در صورت نقض خطا پرتاب می‌شود.
 */
const TriageQuestionSchema = z.object({
  questionText: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(4),
});

const TriageQuestionsRawSchema = z.object({
  questions: z.array(TriageQuestionSchema),
});

module.exports = {
  URGENCY_LEVELS,
  PatientContextSchema,
  MedicalHistorySchema,
  AIRawResponseSchema,
  TriageResultSchema,
  TriageQuestionSchema,
  TriageQuestionsRawSchema,
};
