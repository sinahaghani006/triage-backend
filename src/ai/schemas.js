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
 * فقط داده بالینی: شکایت، سن، جنس، وزن.
 */
const PatientContextSchema = z.object({
  presentingProblemId: z.string().min(1),
  age: z.number().int().positive().max(130),
  sex: z.enum(['male', 'female']),
  weightKg: z.number().positive().max(500),
  questionsAsked: z.array(z.string()).default([]),
  patientResponses: z.array(z.string()).default([]),
});

/**
 * AIRawResponseSchema — پاسخ خام مورد انتظار از AI provider، قبل از هر پردازش.
 * این schema باید دقیقاً با چیزی که در promptGenerator.js از AI خواسته می‌شود
 * مطابقت داشته باشد.
 *
 * *** نکته مهم: این schema فیلد متن توصیه (recommendations) ندارد. ***
 * اگر promptGenerator.js از AI بخواهد «توصیه‌های عمومی مراقبتی» تولید کند،
 * این یک شکاف واقعی است که باید جداگانه با مدیر پروژه حل شود قبل از این‌که
 * urgencyClassifier.js بتواند recommendations واقعی برگرداند.
 */
const AIRawResponseSchema = z.object({
  urgency_suggestion: z.enum(URGENCY_LEVELS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  clinical_alerts: z.array(z.string()).default([]),
  is_complete: z.boolean(),
  // فیلد زیر عمداً وجود ندارد تا زمانی که با مدیر پروژه حل شود:
  // recommendations: z.array(z.string())
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
  recommendations: z.array(z.string()), // فعلاً همیشه خالی — نگاه کن به یادداشت بالا
  questions_asked: z.array(z.string()),
  patient_responses: z.array(z.string()),
  generated_at: z.string(),
  model_meta: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    fallback_used: z.boolean(),
  }),
});

module.exports = {
  URGENCY_LEVELS,
  PatientContextSchema,
  AIRawResponseSchema,
  TriageResultSchema,
};
