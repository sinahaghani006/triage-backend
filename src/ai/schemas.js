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
 *
 * *** فیکس — تأییدشده با شواهد واقعی Backend (prisma schema): ***
 * weightKg در دیتابیس واقعی nullable است (`weightKg Float? @map("weight_kg")`)
 * — پس PatientContextSchema.weightKg هم باید اختیاری باشد، دقیقاً مثل
 * heightCm. قبل از این فیکس، این فیلد بدون `.optional()` بود که با واقعیت
 * دیتابیس در تضاد بود.
 */

const { z } = require('zod');

// ترتیب فوریت — طبق قانون escalate-only پروژه: normal < home_care < doctor_review < emergency
const URGENCY_LEVELS = ['normal', 'home_care', 'doctor_review', 'emergency'];

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
  weightKg: z.number().positive().max(500).optional(),
  heightCm: z.number().positive().max(300).optional(),
  questionsAsked: z.array(z.string()).default([]),
  patientResponses: z.array(z.string()).default([]),
  medicalHistory: MedicalHistorySchema,
});

const AIRawResponseSchema = z.object({
  urgency_suggestion: z.enum(URGENCY_LEVELS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  clinical_alerts: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  is_complete: z.boolean(),
});

const TriageResultSchema = z.object({
  session_id: z.string().min(1),
  presenting_problem_id: z.string().min(1),
  urgency_level: z.enum(URGENCY_LEVELS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  clinical_alerts: z.array(z.string()),
  recommendations: z.array(z.string()),
  questions_asked: z.array(z.string()),
  patient_responses: z.array(z.string()),
  generated_at: z.string(),
  model_meta: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    fallback_used: z.boolean(),
  }),
});

const TriageQuestionSchema = z.object({
  questionText: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(4),
});

/**
 * *** به‌روزرسانی — تأیید مدیر پروژه/مدیرعامل (این گفتگو)، بر اساس evidence
 * واقعی: باگ سؤالات عمومی برای «سایر علائم». ***
 *
 * *** چرا این فیلد اضافه شد: *** برای متن آزاد کاملاً قابل‌تفسیر (مثل
 * «دو هفته‌ست دست چپم بی‌حس می‌شه»)، مدل با وجود دستورالعمل صریح در
 * QUESTIONS_SYSTEM_INSTRUCTIONS، سه بار پشت‌سرهم (۲ بار قبل + ۱ بار بعد
 * از اضافه‌کردن یک مثال concrete در پرامپت) سؤالات کاملاً عمومی و
 * بی‌ربط تولید کرد — یعنی صرفاً توضیح بهتر در پرامپت کافی نبود.
 *
 * *** طراحی: اجبار commitment صریح، نه فقط توضیح ضمنی. *** به‌جای
 * امیدواری به اینکه مدل وسط یک پاراگراف طولانی دستورالعمل، تصمیم
 * «قابل‌تفسیر یا نه» را درست بگیرد، این فیلد مدل را مجبور می‌کند قبل
 * از نوشتن سؤالات، یک تصمیم صریح و جداگانه (نام حوزه‌ی بالینی، یا
 * دقیقاً «نامشخص» اگر واقعاً غیرقابل‌تفسیر بود) ثبت کند — مشابه یک
 * chain-of-thought اجباری در سطح schema، نه اختیاری در سطح متن.
 *
 * این فیلد برای همه‌ی presentingProblemId ها (نه فقط other_symptoms)
 * الزامی است تا ساختار schema یکنواخت بماند؛ برای دسته‌های از پیش‌
 * تعریف‌شده، حوزه‌ی بالینی معمولاً از خودِ نام دسته مشخص است، پس این
 * فیلد برایشان هزینه‌ی اضافه‌ای ندارد.
 *
 * *** این schema فعلاً هیچ محدودیتی روی مقدار این فیلد اعمال نمی‌کند
 * (فقط رشته‌ی غیرخالی) — اعتبارسنجی محتوایی (مثلاً اینکه آیا واقعاً
 * با سؤالات هم‌خوان است) خارج از دامنه‌ی zod schema است و نیاز به
 * evidence بیشتر دارد پیش از افزودن. ***
 */
const TriageQuestionsRawSchema = z.object({
  inferred_clinical_domain: z.string().min(1),
  questions: z.array(TriageQuestionSchema),
});

const ESCALATE_ONLY_URGENCY_LEVELS = ['doctor_review', 'emergency'];

const SecondRoundQuestionsSchema = z.object({
  escalate: z.boolean(),
  questions: z.array(TriageQuestionSchema).default([]),
});

const SecondRoundEscalationSchema = z.object({
  escalate: z.boolean(),
  urgency_suggestion: z.enum(ESCALATE_ONLY_URGENCY_LEVELS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  clinical_alerts: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  is_complete: z.boolean(),
});

module.exports = {
  URGENCY_LEVELS,
  PatientContextSchema,
  MedicalHistorySchema,
  AIRawResponseSchema,
  TriageResultSchema,
  TriageQuestionSchema,
  TriageQuestionsRawSchema,
  ESCALATE_ONLY_URGENCY_LEVELS,
  SecondRoundQuestionsSchema,
  SecondRoundEscalationSchema,
};

