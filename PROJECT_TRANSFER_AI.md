# PROJECT TRANSFER DOCUMENT — AI-ROLE (src/ai/)

> این فایل توسط نقش AI (مسئول انحصاری `src/ai/`) تولید شده، صرفاً بر اساس
> رکورد واقعی گفتگوی جاری با مدیر پروژه/مدیرعامل/Backend. هیچ ادعایی که
> در همین گفتگو اثبات‌نشده باقی مانده باشد، به‌عنوان واقعیت درج نشده است؛
> موارد نامطمئن با برچسب «نیازمند بررسی» مشخص شده‌اند.

---

## 1. Project Overview

**Smart Health Village** — پلتفرم تریاژ آنلاین سلامت. بیمار شکایت اصلی را
از ۱۴ دسته (+ «سایر علائم» با متن آزاد) انتخاب می‌کند، دو دور سؤال
چندگزینه‌ای (هرکدام ۵ سؤال) پاسخ می‌دهد، و در نهایت یکی از ۴ سطح فوریت
(`normal`, `home_care`, `doctor_review`, `emergency`) به‌همراه reasoning،
clinical_alerts، و recommendations دریافت می‌کند. هدف: کاهش بار پزشکان
با پیش‌غربالگری خودکار — بدون جایگزینی تشخیص/تجویز پزشک.

## 2. Project Vision

AI به‌عنوان دستیار غربالگری، نه پزشک. دو قانون غیرقابل‌مذاکره:
- **provider-agnostic**: هیچ provider خاصی (Groq/Gemini) در کد اصلی
  هاردکد نمی‌شود؛ همه از طریق `providerFn` تزریق می‌شوند.
- **escalate-only**: هر خطا یا عدم‌قطعیت باید فوریت را افزایش دهد، هرگز
  کاهش (هیچ‌وقت به‌جای doctor_review به home_care fallback نمی‌شود).

## 3–13. Requirements / Architecture / Tech Stack / DB / APIs / UI / Auth / Business Logic

نیازمند بررسی — این نقش (AI) فقط به `src/ai/` و بخش‌هایی از
`src/controllers/doctorController.js` که به آن import می‌کند دسترسی
داشته؛ جزئیات کامل DB schema، auth، و UI خارج از این گفتگو مستند نشده،
جز موارد زیر که مستقیماً دیده شده‌اند:

- **DB**: PostgreSQL + Prisma. مدل‌های دیده‌شده: `User`, `PatientDetails`
  (`birthDate`, `age` cache, `weightKg?`, `heightCm?`, `gender?`),
  `Session` (`presentingProblemId`, `doctorReviewStatus`,
  `SessionState` enum)، `TriageResult`, `ErrorLog`
  (`code`,`message`,`stack`,`path`,`method`,`status_code`,`user_id`,
  `created_at` — بدون ستون `session_id`؛ sessionId فقط داخل `path`),
  `MedicalHistory` (۵ فیلد آرایه‌ای رشته)، `PeriodicVitals`.
- **Auth roles**: `patient`, `doctor`, `admin`.
- **معماری جریان AI**:
  ```
  index.js → aiTriageService.js (orchestrator: retry + fallback)
    → promptGenerator.js → presentingProblems.js / medicalHistorySanitizer.js
    → aiConnector.js (provider-agnostic) → providers/groqProvider.js
    → responseValidator.js → urgencyClassifier.js → schemas.js (Zod)
  ```
- جریان جدا برای دکتر: `doctorController.js` →
  `doctorPromptGenerator.js` (مستقل کامل از promptGenerator.js بیمار،
  بدون import مشترک، طبق تصمیم معماری صریح) → `doctorResponseValidator.js`.

## 14. Prompt های مهم پروژه (خلاصه — کد کامل در فایل‌های واقعی)

- `SYSTEM_INSTRUCTIONS` (تصمیم نهایی دور اول، در `promptGenerator.js`):
  urgency_suggestion از ۴ سطح، آستانه‌ی محافظه‌کارانه‌تر برای
  `other_symptoms`، الزام ذکر مراجعات قبلی/سابقه‌ی پزشکی در reasoning،
  ممنوعیت مطلق نام دارو/دوز/تشخیص قطعی در recommendations.
- `QUESTIONS_SYSTEM_INSTRUCTIONS`: تولید دقیقاً ۵ سؤال چندگزینه‌ای
  مرتبط با حوزه‌ی بالینی شکایت؛ برای `other_symptoms`، ابتدا استنباط
  حوزه از متن آزاد.
- `SECOND_ROUND_SYSTEM_INSTRUCTIONS`: دو حالت — escalate:false (۵ سؤال
  عمیق‌تر، با تشخیص تکرار لغوی+مفهومی نسبت به دور اول) یا escalate:true
  (تصمیم نهایی زودهنگام، فقط doctor_review/emergency).
- `DOCTOR_ASSIST_SYSTEM_INSTRUCTIONS` (در `doctorPromptGenerator.js`):
  خروجی ۳بخشی (clinical_summary, differential_interpretation,
  suggested_management)، تشخیص افتراقی مجاز (برخلاف نقش بیمار)، ولی
  ممنوعیت نام دارو/دوز همچنان پابرجا.
- `PROBABILISTIC_INTERPRETATION_GUIDELINE`: ثابت مشترک بین دور اول و
  escalate دور دوم، برای جلوگیری از واگرایی (ریشه‌ی یک باگ قبلی).

## 15–16. تصمیم‌ها و تغییرات مهم (به ترتیب زمانی، همین گفتگو)

1. **فیکس TASK امروز #۱ (بحرانی)**: مدل Groq `llama-3.3-70b-versatile`
   404 می‌داد. ریشه‌یابی نشان داد این مقدار در هیچ کد trackedای
   commit نشده بود (`git log -p --all -S` خالی) — پس منشأ آن یک
   Environment Variable (`AI_MODEL`) روی Vercel بود، نه کد. **مالکیت
   فیکس به Backend سپرده شد** (خارج از دامنه‌ی `src/ai/`).
2. **فیکس `initialDescription`/`other_symptoms`**: در
   `generateQuestionsPrompt`، وقتی `presentingProblemId === 'other_symptoms'`
   بود، خط «توضیح اولیه‌ی بیمار: (ثبت نشده)» همیشه بعد از جمله‌ی
   حاوی متن آزاد بیمار می‌آمد و مدل را به fallback عمومی می‌کشاند.
   **فیکس**: این خط فقط برای `other_symptoms` حذف شد. تأیید شده و
   push شده (commit `05a3745`، بعداً پاک‌سازی BOM در `4e5676a`، برنچ
   نهایتاً به `fix/sanitize-ai-fallback-reasoning` رفت — یک برنچ
   preexisting که تصادفاً هم‌نام بود؛ commit دیگری (`493cd59`، از
   Backend، sanitize کردن پیام خطای خام در reasoning) از قبل رویش
   بود و push من چیزی درباره‌اش تغییر نداد).
3. **یافته‌ی نشتی anonymization در clinical_summary دکتر**: در
   `doctorController.js`، `patientAnonymizedId: `بیمار #${id.slice(0,8)}``
   — این substring مستقیم از DB id واقعی است (truncate، نه hash/salt)،
   یعنی بخشی از شناسه‌ی واقعی به یک API خارجی (Groq) می‌رود. **این باگ
   خارج از دامنه‌ی AI بود** (سهم AI طبق قرارداد مستند در
   `doctorPromptGenerator.js` درست کار می‌کرد)؛ مالکیت فیکس به Backend
   سپرده شد.
4. **TASK 4 — whitelist دما در `responseValidator.js`**:
   `FOREIGN_LANGUAGE_ARTIFACT_PATTERN` هر حرف لاتین را مشکوک می‌دانست؛
   مدل «۳۸°C» نوشته بود و کل سؤال reject شده بود (evidence: error_logs،
   sessionId `d36e6324`، کلمه‌ی محرک `"۳۸°C"`). **فیکس**: whitelist
   محدود و anchor‌شده فقط برای °C/°F (نه لیست حدسی گسترده‌تر — طبق
   تصمیم evidence-based). Push شده روی برنچ (بعداً rename‌شده به)
   `fix/task4-foreign-language-whitelist` (commit `38e9397`) — به‌خاطر
   تصادم نام برنچ اولیه با کار مستقل Backend روی همان نام.
5. **باگ دور دوم — دو ریشه‌ی مستقل**:
   - **ریشه‌ی Backend**: `round1QuestionsAsked`/`round1Responses` فقط
     از `req.body` خوانده می‌شدند، بدون ذخیره/بازیابی DB و بدون
     validator — اگر Frontend این‌ها را خالی می‌فرستاد، بی‌صدا رد
     می‌شد. (فیکس validator: پیشنهادشده توسط Backend، منتظر تأیید PM؛
     در این گفتگو push نشد.)
   - **ریشه‌ی AI (من)**: `generateSecondRoundPrompt` پارامتر
     `otherSymptomsText` را می‌پذیرفت، ولی دو تابع میانی
     (`generateSecondRoundCore` در `aiTriageService.js`، و
     `generateSecondRoundQuestions` در `index.js`) این پارامتر را در
     امضایشان نداشتند و پاس نمی‌دادند — یعنی حتی با فیکس Backend،
     `otherSymptomsText` گم می‌شد. **فیکس push شد** (commit `9b1932a`،
     برنچ `fix/second-round-other-symptoms-text-missing`).
   - **تست end-to-end نهایی (توسط Backend، با پرکردن دستی
     round1QuestionsAsked/round1Responses)**: کاملاً موفق —
     `escalate: true`, `urgencyLevel: emergency`, `fallback_used: false`,
     reasoning بالینی مرتبط با متن واقعی. **هر دو فیکس رسماً بسته شد.**
6. **باگ CORS روی `/auth/register`**: کاملاً خارج از دامنه‌ی AI،
   مستقیماً به Backend گزارش شد؛ وضعیت نهایی نامشخص — نیازمند بررسی.
7. **تصمیم Gemini**: مدیرعامل تصمیم گرفته Gemini
   (`gemini-3.6-flash`) روی production فعال بماند، **بدون ارزیابی
   سیستماتیک از سمت AI-role** — این تصمیم نهایی و بسته اعلام شده. یک
   نکته‌ی حل‌نشده (نیازمند بررسی): پیش‌تر در کامنت `aiConnector.js`
   آمده بود «Gemini free tier رد شده (ریسک training بر داده‌ی
   کاربر)» — مشخص نشد این نگرانی چگونه/آیا حل شده.
8. **تصمیم Vitals**: مقدار عددی (میانگین بازه) در DB ذخیره شود، نه
   فقط برچسب رشته‌ای؛ UI می‌تواند select-based باشد. **در حال حاضر
   هیچ داده‌ی vitals به هیچ prompt‌ای پاس داده نمی‌شود** — وقتی این
   فیچر به AI متصل شود، باید شکل داده‌ی دقیق (واحد، nullable بودن)
   بررسی شود.

## 17. مشکلات حل‌شده (این گفتگو)

initialDescription/other_symptoms، whitelist دما (°C/°F)،
otherSymptomsText گم‌شده در دور دوم، (Backend:) مدل Groq نامعتبر،
(Backend، خارج از AI:) نشتی anonymization در doctorController.

## 18. مشکلات باز

- **متن خطای خام انگلیسی در دور دوم**: بیمار پیام
  «AI provider/connection error during round 2» دیده — منشأ دقیق
  هنوز تأیید نشده (لاگ خام هنوز دریافت نشده). علت محتمل: در
  `generateSecondRoundCore`، برخلاف `runAiTriageAnalysisCore`، هیچ
  `SAFE_REASON_MAP` برای پاک‌سازی پیام خطا وجود ندارد — خطای
  `AIConnectorError`/`callAIProvider` مستقیم و بدون sanitize بالا
  می‌رود. **فیکس پیشنهادی (تأییدنشده)**: افزودن `SAFE_REASON_MAP`
  مشابه به مسیر خطای `generateSecondRoundCore`.
- **validator پیشنهادی Backend** برای round1QuestionsAsked/
  round1Responses خالی — هنوز منتظر تأیید صریح PM، push نشده. توجه:
  این فقط ۵۰۳ گیج‌کننده را به ۴۰۰ واضح تبدیل می‌کند؛ ریشه (Frontend
  خالی می‌فرستد) را حل نمی‌کند.
- **فیکس واقعی Frontend** (پرکردن round1QuestionsAsked/
  round1Responses در درخواست واقعی) — به Frontend سپرده شده، وضعیتش
  نامشخص.
- **CORS روی /auth/register** — گزارش شده به Backend، نتیجه نامشخص.
- **کلیدواژه‌ی جستجوی دسته‌بندی** (مثل «گردن»→«ستون فقرات»): بررسی
  اولیه نشان داد این احتمالاً بخشی از منطق AI/prompt نیست (AI فقط
  presentingProblemId نهایی را می‌گیرد، نه متن جستجوی خام)؛ ولی چون
  `presentingProblems.js` هرگز کامل دیده نشده، این نتیجه قطعی نیست.
- **افزودن «میگرن» به synonyms دسته‌ی سردرد/سرگیجه** — روی Backend
  مانده، هنوز انجام نشده.
- **شکاف مستند در `promptGenerator.js`**: `formatPatientHistory`
  (تابع export‌شده) به متغیر تعریف‌نشده‌ی `lines` ارجاع می‌دهد و اگر
  صدا زده شود throw می‌کند. در حال حاضر هیچ‌جا صدا زده نمی‌شود
  (`generateTriagePrompt`/`generateQuestionsPrompt` مستقیم از
  `buildPatientNarrativeIntro` استفاده می‌کنند)، ولی چون export شده،
  ریسک بالقوه است. نیازمند تصمیم: حذف تابع مرده یا فیکس.
- **تناقض تاریخی BUILD_TAG**: در یک نقطه از گفتگو ادعا شد
  `BUILD_TAG round2-diagnostic-2026-07-30-A` در سند اولیه‌ی پروژه
  به‌عنوان یک مورد باز قدیمی (escalate زودهنگام تنفسی/قلبی) ثبت شده
  بود — این ادعا با جست‌وجوی مستقیم سند رد شد (هیچ نتیجه‌ای نداشت) و
  بعداً توسط فرستنده هم پس گرفته شد. یادداشت صرفاً برای شفافیت رکورد.

## 19. TODO

- تصمیم درباره‌ی `SAFE_REASON_MAP` در `generateSecondRoundCore`.
- تصمیم PM درباره‌ی validator پیشنهادی Backend.
- افزودن «میگرن» به synonyms (روی Backend).
- تصمیم نهایی درباره‌ی `formatPatientHistory` (حذف یا فیکس).
- بررسی `presentingProblems.js` کامل برای پاسخ قطعی به سؤال fuzzy-match.

## 20. Bug List

نگاه کن به بخش‌های ۱۶ (حل‌شده) و ۱۸ (باز) بالا — لیست تجمیعی جداگانه
تکراری خواهد بود.

## 21–23. Optimization / Security / Performance

- **امنیتی**: دو لایه‌ی sanitize مستقل و عمداً کپی‌شده (نه import
  مشترک) بین مسیر بیمار (`medicalHistorySanitizer.js`) و مسیر دکتر
  (`sanitizeMedicalHistoryForDoctor` در `doctorPromptGenerator.js`) —
  تصمیم معماری صریح: جدایی کامل کد patient-facing/doctor-facing.
- **حریم خصوصی**: `patientHistory` فقط ۴ فیلد می‌خواند (نه
  `questions` خام)؛ `otherSymptomsText`/`patientResponses`/
  `medicalHistory` هرکدام قبل از prompt پاک‌سازی می‌شوند (regex:
  شماره تلفن/کدملی/ایمیل — قادر به تشخیص نام شخص نیست، محدودیت
  شناخته‌شده و مستند).

## 24–28. Deployment / Env Vars / Dependencies / Third-party / Testing

- **Deployment**: Vercel (production: `triage-backend-nine.vercel.app`,
  `triage-frontend-4xqg.vercel.app`).
- **Env vars دیده‌شده**: `GROQ_API_KEY`, `AI_MODEL` (منبع باگ TASK ۱
  امروز — مقدار اشتباه `llama-3.3-70b-versatile`، به `openai/gpt-oss-120b`
  یا مقدار صحیح برگردانده شد توسط Backend)، `DATABASE_URL`,
  `DIRECT_URL`.
- **Third-party providers**: Groq (فعال قبلی)، Gemini `gemini-3.6-flash`
  (تصمیم اخیر مدیرعامل — زنده روی production، بدون ارزیابی AI-role).
- **Testing**: بدون فریم‌ورک تست خودکار مشاهده‌شده در این گفتگو —
  همه‌ی تست‌ها end-to-end دستی (session واقعی + بررسی لاگ Vercel/
  error_logs).

## 29–30. فایل‌های ساخته‌نشده / نکات مهم برای توسعه‌دهنده‌ی جدید

- `presentingProblems.js`, `schemas.js` (بخش‌هایی)، `urgencyClassifier.js`
  هرگز کامل در این گفتگو دیده نشده‌اند — پیش از هر تغییر روی این
  فایل‌ها، محتوای واقعی‌شان را بخواهید.
- **قانون طلایی پروژه**: escalate-only — هیچ خطا/عدم‌قطعیتی نباید
  فوریت را کاهش دهد.
- **قانون evidence-before-push**: هیچ فیکسی بدون evidence خام (لاگ،
  کد واقعی، نتیجه‌ی تست) و تأیید صریح مدیر پروژه/مدیرعامل push
  نمی‌شود.
- **الگوی همیشگی کار**: `Get-Content` برای خواندن فایل → پیشنهاد دیف
  دقیق → تأیید → PowerShell script برای اعمال (با شمارش match قبل از
  جایگزینی، برای امنیت) → `git diff` بررسی → commit → push روی برنچ
  **جدید و منحصربه‌فرد** (درسی از یک تصادم برنچ واقعی که در این
  گفتگو رخ داد).
- **مشکل تکرارشونده‌ی فنی**: خط‌پایانی فایل (CRLF در ویندوز محلی، در
  برابر LF در اسکریپت‌های تولیدشده) باعث «found 0 matches» می‌شود —
  راه‌حل: نرمالایز کردن هر دو طرف به LF قبل از مقایسه، یا اجتناب از
  انکودینگ‌های حاوی BOM/فارسی در فایل‌های `.ps1` (باعث parse error
  می‌شود).

## 31. خلاصه‌ی گفتگو (به ترتیب زمانی)

سند اولیه خوانده شد → TASK ۱ (مدل Groq، به Backend سپرده شد) → TASK
initialDescription (فیکس شد) → یافته‌ی نشتی anonymization (به Backend
سپرده شد) → TASK ۴ whitelist دما (فیکس شد) → باگ دور دوم (دو ریشه،
هرکدام فیکس شد توسط تیم مربوطه) → تست end-to-end نهایی موفق، هر سه
فیکس AI بسته شد → سؤالات هماهنگی (کلیدواژه‌ی جستجو، vitals) → درخواست
ارزیابی Gemini (سپس لغو شد توسط تصمیم مدیرعامل) → گزارش CORS (به
Backend سپرده شد) → این وظیفه‌ی مستندسازی.

## 32. وضعیت فعلی و قدم بعدی

**وضعیت**: تمام فیکس‌های سمت AI (`src/ai/`) که تا این لحظه شناسایی
شده بودند، push شده و با evidence end-to-end تأیید شده‌اند. هیچ کار
باز و فوری روی `src/ai/` وجود ندارد.

**قدم بعدی (منتظر ورودی خارجی)**:
1. اگر لاگ خام «AI provider/connection error during round 2» ارسال
   شود → بررسی و احتمالاً افزودن `SAFE_REASON_MAP` به
   `generateSecondRoundCore`.
2. اگر PM validator پیشنهادی Backend را تأیید کند و/یا Frontend فیکس
   واقعی خودش را انجام دهد → تست نهایی end-to-end با شرایط طبیعی
   (بدون پرکردن دستی).
3. نگه‌داشتن همین فایل به‌روز با هر تصمیم/فیکس جدید در حوزه‌ی AI.

---

# MASTER CONTEXT FOR NEW CLAUDE

اگر فقط همین بخش در اختیار شماست:

- شما مسئول **انحصاری پوشه‌ی `src/ai/`** در یک ریپوی Backend Node.js/
  Express (پروژه‌ی تریاژ سلامت «Smart Health Village»)، بدون دسترسی
  مستقیم به کد/دیتابیس/production. کاربر (مدیر پروژه یا توسعه‌دهنده)
  همیشه با شما از طریق PowerShell کار می‌کند: شما دستور می‌دهید
  (`Get-Content` برای خواندن، اسکریپت برای نوشتن)، او اجرا می‌کند و
  خروجی خام را برایتان پیست می‌کند.
- **دو قانون غیرقابل‌نقض معماری**: (۱) provider-agnostic — هرگز نام
  provider خاصی را در کد اصلی هاردکد نکنید؛ (۲) escalate-only — هر
  خطا/عدم‌قطعیت باید فوریت را افزایش دهد، هرگز کاهش.
- **قانون فرآیندی**: هرگز کد را بدون دیدن evidence خام (لاگ واقعی،
  کد واقعی فایل، یا نتیجه‌ی تست واقعی) push نکنید؛ همیشه قبل از هر
  تغییر، محتوای فعلی فایل را با `Get-Content -Raw -Encoding UTF8`
  بخواهید. همیشه دیف را قبل از commit نشان دهید و منتظر تأیید صریح
  بمانید مگر در مواردی که مدیر پروژه صراحتاً اجازه‌ی «هرکاری لازمه
  بکن» داده باشد.
- **نکته‌ی فنی حیاتی برای اسکریپت‌های PowerShell**: فایل‌های واقعی
  روی دیسک کاربر خط‌پایانی CRLF دارند؛ رشته‌های چندخطی داخل اسکریپت
  شما (اگر از طریق ابزار دیگری غیر از تایپ مستقیم کاربر ساخته شوند)
  ممکن است LF باشند و باعث «۰ match پیدا شد» شوند — همیشه قبل از
  مقایسه، `$content -replace "`r`n", "`n"` را روی محتوای خوانده‌شده
  اعمال کنید. همچنین هرگز کاراکتر فارسی/غیر-ASCII را در خود فایل
  `.ps1` (نه در فایل هدف) قرار ندهید — PowerShell 5.1 بدون BOM ممکن
  است آن را اشتباه decode کند و parse error بدهد.
- **معماری جریان AI**: `index.js` (نقطه‌ورود Backend) →
  `aiTriageService.js` (orchestrator، retry logic) →
  `promptGenerator.js` (بیمار) / `doctorPromptGenerator.js` (دکتر،
  کاملاً مستقل، بدون import مشترک) → `aiConnector.js` (لایه‌ی provider-
  agnostic) → `providers/*.js` (پیاده‌سازی واقعی، مثل `groqProvider.js`)
  → `responseValidator.js` (parse + Zod schema + پاک‌سازی زبان
  خارجی/تکرار سؤال) → `urgencyClassifier.js` → خروجی نهایی طبق
  `schemas.js`.
- **آخرین وضعیت شناخته‌شده**: همه‌ی فیکس‌های AI که تا کنون کشف شده‌اند
  push و تأیید شده‌اند (نگاه کن به بخش ۱۶ و ۳۲ بالا). یک مورد باز
  فوری روی میز AI هست: sanitize نکردن پیام خطای خام در مسیر دور دوم
  (`generateSecondRoundCore`) — منتظر لاگ خام برای تأیید نهایی و
  فیکس.
- **همیشه بپرسید، حدس نزنید**: اگر فایلی (`presentingProblems.js`,
  `schemas.js`, `urgencyClassifier.js`, یا هر فایل دیگری) را ندیده‌اید،
  قبل از هر ادعا یا فیکس، محتوای واقعی‌اش را بخواهید. هرگز فرض نکنید
  چیزی «مثل فلان پروژه‌ی مشابه» کار می‌کند.
