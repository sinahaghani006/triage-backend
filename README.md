# Triage Backend Core

هسته مرکزی بک‌اند پلتفرم تریاژ آنلاین سلامت — دیتابیس، احراز هویت، مدیریت
چرخه عمر Session، AuditLogs/ErrorLogs.

وضعیت فعلی: Auth، Sessions CRUD + state machine (با ادغام واقعی AI)،
AuditLogs/ErrorLogs، و `GET /presenting-problems` کامل و تست‌شده‌اند.
یکپارچه‌سازی با Frontend در حال انجام است. برای راهنمای deploy روی
Neon + Vercel به [`DEPLOY.md`](./DEPLOY.md) مراجعه کنید.

## ۱. راه‌اندازی محلی

```bash
npm install
cp .env.example .env   # سپس مقادیر DATABASE_URL و JWT_SECRET را تنظیم کنید
npx prisma generate
npx prisma migrate dev --name init
npm run dev             # اجرای سرور با nodemon روی PORT (پیش‌فرض 3000)
npm test                # اجرای تست‌ها (نیاز به DB واقعی ندارد؛ Prisma mock شده)
```

> ⚠️ نکته محیط اجرا: این پروژه در محیطی نوشته شده که به اینترنت دسترسی نداشت،
> بنابراین `npm install` و `prisma migrate` اجرا **نشده‌اند** و صرفاً کد و
> پیکربندی آماده شده است. لطفاً پیش از استفاده در محیط واقعی، این دستورات را
> اجرا کنید تا `node_modules` و migration واقعی ساخته شوند.

## ۲. ساختار پوشه‌بندی

```
src/
  config/       تنظیمات env و Prisma client
  controllers/  منطق endpointها
  middleware/   validation, auth, error handling
  routes/       تعریف مسیرهای HTTP
  utils/        AppError و ابزارهای کمکی
prisma/
  schema.prisma تعریف مدل‌های دیتابیس
  ERD.md        دیاگرام رابطه جداول
tests/          تست‌های jest + supertest
```

## ۳. جداول اسپرینت ۱

جزئیات کامل در `prisma/schema.prisma` و `prisma/ERD.md`.

- **users**: `id, name, email (unique), password_hash, created_at, updated_at`
  (تصمیم: `UserAuthentication` در این جدول ادغام شده — دلیل در ERD.md)
- **sessions**: `id, user_id (FK), current_state (enum S1..S10), created_at, updated_at`

## ۴. مستندسازی API

### `POST /auth/register`

ثبت‌نام کاربر جدید.

**Request body:**
```json
{
  "name": "Sara Ahmadi",
  "email": "sara@example.com",
  "password": "strongPassword123",
  "birthDate": "1995-06-01",
  "weight": 62.5
}
```
`birthDate` فرمت `YYYY-MM-DD` (ISO 8601)، الزامی، نباید در آینده باشه. در جدول
جدید `patient_details` ذخیره می‌شه و منبع محاسبه‌ی `age` در
`submit-symptoms` است (بخش ۸) — Frontend دیگه لازم نیست سن رو جدا بفرسته.

`weight` عدد، **اجباری** (تصمیم مدیر پروژه، ۱۳ ژوئیه ۲۰۲۶)، واحد **کیلوگرم**.
در `patient_details` ذخیره می‌شه (یک‌بار در ثبت‌نام، مثل `birthDate`، نه هر
بار در `submit-symptoms`). ⚠️ فعلاً فقط ذخیره می‌شه — هنوز به AI فرستاده
نمی‌شه، چون قرارداد دقیق (اسم `questionId` رزروشده) هنوز از سمت AI نهایی
نشده.

**Response `201 Created`:**
```json
{
  "user": {
    "id": "uuid",
    "name": "Sara Ahmadi",
    "email": "sara@example.com",
    "createdAt": "2026-07-12T10:00:00.000Z",
    "birthDate": "1995-06-01T00:00:00.000Z",
    "weightKg": 62.5
  },
  "token": "eyJhbGciOi..."
}
```

**Side effect (جدید): auto-login با httpOnly cookie**
علاوه بر `token` در body، یک کوکی httpOnly به اسم `token` هم روی پاسخ ست می‌شه
(`Secure` در production، `SameSite=Lax`، عمرش برابر `JWT_EXPIRES_IN`). این یعنی
مرورگر بلافاصله بعد از ثبت‌نام "لاگین" حساب می‌شه، بدون اینکه Frontend لازم باشه
توکن رو خودش جایی (مثل localStorage) نگه داره. `POST /auth/login` هم همین کوکی
رو صادر می‌کنه.

⚠️ **الزام برای Frontend:** چون کوکی httpOnly cross-origin هست، دو تا شرط لازمه:
1. درخواست‌های fetch/axios باید با `credentials: 'include'` ارسال بشن
2. آدرس دقیق Frontend (origin) باید در `.env` بک‌اند به‌عنوان `FRONTEND_ORIGIN`
   تنظیم بشه (مقدار فعلی، طبق تأیید تیم Frontend: `http://localhost:3001`) — وگرنه مرورگر کوکی رو رد می‌کنه

**خطاهای ممکن:**
| کد HTTP | error.code | علت |
|---|---|---|
| 400 | `VALIDATION_ERROR` | ورودی نامعتبر (جزئیات در `error.details`) |
| 409 | `EMAIL_TAKEN` | ایمیل قبلاً ثبت شده |

### `POST /auth/login`

ورود و دریافت توکن.

**Request body:**
```json
{ "email": "sara@example.com", "password": "strongPassword123" }
```

**Response `200 OK`:** ساختاری مشابه register (`user` + `token`) — کوکی httpOnly `token` هم مثل register ست می‌شه.

**خطاهای ممکن:**
| کد HTTP | error.code | علت |
|---|---|---|
| 400 | `VALIDATION_ERROR` | ورودی نامعتبر |
| 401 | `INVALID_CREDENTIALS` | ایمیل یا رمز عبور اشتباه |

### `GET /health`

بررسی سلامت سرویس (بدون نیاز به auth). پاسخ: `{ "status": "ok" }`

### احراز هویت روی مسیرهای آینده

توکن JWT برگشتی باید در هدر زیر ارسال شود:
```
Authorization: Bearer <token>
```
میان‌افزار `src/middleware/authenticate.js` این هدر را بررسی می‌کند و
`req.user = { id, email }` را در دسترس کنترلرهای بعدی (مثل Sessions) قرار می‌دهد.

## ۵. قالب خطای استاندارد (برای همه endpointهای آینده)

```json
{
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human readable message",
    "details": [{ "field": "email", "message": "..." }]
  }
}
```

## ۶. برای عضو Frontend — راهنمای اتصال (به‌روز، آماده یکپارچه‌سازی)

### احراز هویت
- `POST /auth/register` و `POST /auth/login` — هر دو حالا هم `token` در body برمی‌گردونن، هم یک **کوکی httpOnly به اسم `token`** خودکار ست می‌کنن (auto-login).
- برای مسیرهای محافظت‌شده (`/sessions/*`)، یکی از این دو راه کافیه:
  - همون کوکی رو بفرستید (پیش‌فرض مرورگر، نیازی به کد اضافه نیست) — فقط باید `credentials: 'include'` رو در fetch/axios تنظیم کنید
  - یا هدر `Authorization: Bearer <token>` رو دستی بفرستید (اگه کوکی رو ذخیره نکردید)

### الزامات CORS (مهم، قبل از شروع تست هماهنگ کنید)
- سرور بک‌اند الان `origin` رو محدود به مقدار `FRONTEND_ORIGIN` در `.env` می‌کنه (تنظیم‌شده روی `http://localhost:3001` طبق تأیید تیم Frontend)
- **لطفاً origin دقیق (پروتکل+هاست+پورت) که Frontend روش اجرا می‌شه رو اعلام کنید** تا در `.env` تنظیم بشه — وگرنه مرورگر کوکی/درخواست رو رد می‌کنه
- در تمام درخواست‌های fetch/axios از Frontend، `credentials: 'include'` رو فراموش نکنید

### Endpointهای موجود
| Method | Path | نیاز به auth |
|---|---|---|
| POST | `/auth/register` | خیر |
| POST | `/auth/login` | خیر |
| GET | `/presenting-problems` | خیر |
| POST | `/sessions` | بله |
| GET | `/sessions` | بله |
| GET | `/sessions/:id` | بله |
| POST | `/sessions/:id/submit-symptoms` | بله |
| POST | `/sessions/:id/staff-finalize` | بله (+ نقش staff) |
| POST | `/sessions/:id/close` | بله |
| POST | `/sessions/:id/cancel` | بله |
| GET | `/health` | خیر |

جزئیات کامل ورودی/خروجی هرکدوم در بخش‌های ۴ و ۸ همین فایل.

## ۷. برای عضو AI

قرارداد فراخوانی نهایی شد: `runAiTriageAnalysis({ sessionId, patientResponses })`
از `src/ai/index.js` export می‌شه، و در `POST /sessions/:id/submit-symptoms` صدا
زده می‌شه (جزئیات کامل در بخش ۸). `patientResponses` شامل
`{ presentingProblemId, patientDetails: {age, gender}, answers: [...] }` است.
✅ end-to-end با فایل واقعی تست و تأیید شد. همچنین `getPresentingProblemsList()`
(export جدید در همون فایل، آرایه‌ی `{id, label}`) برای `GET /presenting-problems`
(بخش ۹) استفاده می‌شه.

## ۸. Sessions API (وضعیت: پیاده‌سازی شده، تست end-to-end با AI واقعی انجام شد)

همه مسیرهای Sessions نیاز به هدر `Authorization: Bearer <token>` (یا کوکی httpOnly `token`) دارند.

### `POST /sessions`
ایجاد Session جدید. **تصمیم طراحی:** طبق دیاگرام، `create_session` مستقیماً از
S1 (که هرگز persist نمی‌شه) به S2 می‌ره؛ پس رکورد از ابتدا با
`currentState: "S2_collecting_information"` ساخته می‌شه.

**Response `201`:** `{ "session": { "id", "currentState", ... } }`

### `GET /sessions` — لیست Sessionهای کاربر لاگین‌شده
### `GET /sessions/:id` — دریافت یک Session (فقط اگر مالک آن باشید، وگرنه `404 SESSION_NOT_FOUND`)

### `POST /sessions/:id/submit-symptoms`
پیاده‌سازی کامل مسیر: `S2 --(submit_symptoms)--> S4 --(run_ai_analyzer)--> S3 --(assign_urgency_level)--> S5|S6|S7|S8`.

**Request body:**
```json
{
  "presentingProblemId": "uuid-or-id-from-ai-domain",
  "patientDetails": { "gender": "female" },
  "answers": [{ "questionId": "q1", "answer": "..." }]
}
```
⚠️ **تغییر:** `patientDetails.age` دیگه لازم نیست Frontend بفرسته — سن از
`birthDate` ذخیره‌شده در ثبت‌نام (بخش ۴) به‌صورت سرور-ساید محاسبه می‌شه (منبع
واحد و همیشه به‌روز، به‌جای اینکه هر بار جدا فرستاده و ممکنه ناهماهنگ بشه).
اگه کاربری (نادر — فقط حساب‌های خیلی قدیمی) `birthDate` نداشته باشه، خطای
`422 PATIENT_DETAILS_MISSING` برمی‌گرده.

✅ **تصمیم مدیر پروژه دربارهٔ finalize (۱۲ ژوئیه ۲۰۲۶):** چون `finalize_triage`
در دیاگرام اصلی `Role: System` بود (نه یک اکشن کاربر)، حالا:
- اگه نتیجه AI یکی از `emergency`/`home_treatment`/`normal` باشه (یعنی state
  محاسبه‌شده S6/S7/S8)، Backend **خودش بلافاصله همینجا** به
  `S9_completed_triage` می‌ره — هیچ فراخوانی جدایی از Frontend لازم نیست.
- اگه نتیجه `doctor_review` باشه (S5)، **هرگز خودکار finalize نمی‌شه** — چون
  یعنی منتظر بازبینی واقعی پزشکه. این حالت فقط با endpoint جدید و محدود
  `POST /sessions/:id/staff-finalize` (نقش `staff`، بخش پایین) به S9 می‌ره.

⚠️ **مهم برای Frontend:** چون S6/S7/S8 دیگه بلافاصله به S9 می‌رن، دیگه
نمی‌تونید از روی `currentState` تشخیص بدید نتیجه چی بوده — باید همیشه
`session.triageResult.urgencyLevel` رو چک کنید (چهار مقدار ثابت:
`"emergency"`, `"doctor_review"`, `"home_treatment"`, `"normal"` — دقیقاً
همینا، جای دیگه‌ای تغییر نمی‌کنن). `triageResult` مستقیم یک فیلد سطح بالا در
پاسخ `session` است (نه تودرتو در جای دیگه)، و **همیشه پر می‌شه** — چه نتیجه
S5 باشه چه S9 (یعنی برای S5 هم `triageResult.urgencyLevel === "doctor_review"`
موجوده، فقط `currentState` هنوز `S5_pending_doctor_review` می‌مونه تا
staff تأییدش کنه).

**نمونه پاسخ واقعی — حالتی که به S9 (یکی از S6/S7/S8) ختم شده:**
```json
{
  "session": {
    "id": "a1b2c3d4-e5f6-4789-a123-0123456789ab",
    "userId": "55456684-553c-455e-9458-94d6581960b3",
    "currentState": "S9_completed_triage",
    "presentingProblemId": "sore_throat",
    "createdAt": "2026-07-12T06:36:31.153Z",
    "updatedAt": "2026-07-12T06:38:36.794Z",
    "closedAt": null,
    "cancelledAt": null,
    "triageResult": {
      "urgencyLevel": "normal",
      "triageResultJson": { "...": "خروجی خام AI، ساختارش را خودشان مستند می‌کنند" }
    }
  }
}
```

**نمونه پاسخ برای حالت S5 (بازبینی پزشک، باز می‌مونه):**
```json
{
  "session": {
    "...": "...",
    "currentState": "S5_pending_doctor_review",
    "triageResult": {
      "urgencyLevel": "doctor_review",
      "triageResultJson": { "...": "..." }
    }
  }
}
```

این ورودی توسط `src/services/aiTriageGateway.js` به فرمتی که `src/ai/index.js`
واقعاً انتظار داره تبدیل می‌شه (آرایه‌ی تخت `{questionId, answer}` با سه شناسه
رزروشده `presenting_complaint`/`age`/`gender` + بقیه‌ی `answers`)، سپس
`runAiTriageAnalysis({ sessionId, patientResponses })` صدا زده می‌شه.

✅ **تطبیق با فایل واقعی AI انجام شد** (۱۲ ژوئیه ۲۰۲۶):
- فرمت `patientResponses`: AI انتظار آرایه‌ی تخت داره نه آبجکت تودرتو؛ تبدیل در
  `aiTriageGateway.js` انجام می‌شه، API عمومی من (این endpoint) برای Frontend
  همچنان ساختار تمیز و تودرتو رو حفظ می‌کنه — تغییر کاملاً داخلی بود.
- مقادیر `urgencyLevel`: AI مقدار داخلی `home_care` رو خودش به `home_treatment`
  ترجمه می‌کنه، پس چهار مقداری که من دریافت می‌کنم دقیقاً همون چهارتاست که
  بالا نوشتم.

نکته: قرارداد فعلی امکان "نیاز به سؤال بیشتر" رو نداره؛ اگه AI به این نتیجه
برسه، به‌جای توقف، خودش مسیر ایمن `doctor_review` رو انتخاب می‌کنه (یعنی S5).

**خطاهای ممکن:** `409 INVALID_STATE_TRANSITION`، `422 PATIENT_DETAILS_MISSING`
(کاربر birthDate ثبت‌شده نداره)، `503 AI_SERVICE_UNAVAILABLE`
(ماژول AI پیدا نشد)، `502 AI_RESPONSE_INVALID` (خروجی AI با فرمت قرارداد نمی‌خونه)

### `POST /sessions/:id/staff-finalize` (نقش `staff` لازم است)
`S5_pending_doctor_review --(finalize_triage)--> S9_completed_triage`

فقط برای موردی که بعد از بازبینی واقعی یک پزشک، پرونده نهایی بشه. یک
حداقلی‌سازی موقت برای فاز ۱ است — پنل واقعی پزشک برنامه‌ی فاز ۲ است و خارج از
scope این تیم سه‌نفره. حساب‌های `staff` فعلاً فقط دستی از طریق SQL ساخته
می‌شن (چون هیچ endpoint خودسرویسی برای این نقش وجود نداره):
```sql
UPDATE users SET role = 'staff' WHERE email = 'doctor@example.com';
```
**خطاهای ممکن:** `403 FORBIDDEN` (کاربر نقش staff نداره)، `404 SESSION_NOT_FOUND`،
`409 INVALID_STATE_TRANSITION` (session در S5 نیست)

### `POST /sessions/:id/close`
`S9 --(close_session)--> END` (فیلد `closedAt` ست می‌شه؛ بستن دوباره خطای
`409 SESSION_ALREADY_CLOSED` می‌ده)

### `POST /sessions/:id/cancel`
از هر state غیرترمینال مجازه؛ `--(cancel_session)--> S10 triage_cancelled_by_user`

### جدول جدید: `triage_results`
برای ذخیره خروجی AI، جدولی جدا اضافه شد (تصمیم داخلی، چون `TriageResults` جزو
مسئولیت‌های اصلی من است): `id, session_id (FK, unique), urgency_level,
triage_result_json, created_at`.

### 📖 مرجع رسمی — نگاشت کامل State Machine (S1 تا S10)
این بخش مرجع مشترک برای من، AI، و Frontend است — همه باید دقیقاً همین را ببینند.

| State | معنی | Persist می‌شه؟ | چطور بهش می‌رسیم | State بعدی |
|---|---|---|---|---|
| S1 | initial_state | ❌ گذرا، هرگز ذخیره نمی‌شه | — | S2 (بلافاصله، همزمان با `POST /sessions`) |
| S2 | collecting_information | ✅ | حالت اولیه‌ی هر session جدید | S4 (با `submit-symptoms`) |
| S4 | ai_triage_processing | ✅ (کوتاه‌مدت) | داخل `submit-symptoms`، قبل از فراخوانی AI | S3 |
| S3 | assign_urgency | ❌ گذرا، هرگز ذخیره نمی‌شه | بعد از پاسخ AI | یکی از S5/S6/S7/S8 |
| S5 | pending_doctor_review | ✅ | AI گفته `doctor_review` | **فقط** با `staff-finalize` → S9 (هرگز خودکار نه) |
| S6 | marked_emergency | ✅ (خیلی کوتاه) | AI گفته `emergency` | **بلافاصله خودکار** → S9 |
| S7 | marked_home_treatment | ✅ (خیلی کوتاه) | AI گفته `home_treatment` | **بلافاصله خودکار** → S9 |
| S8 | marked_normal | ✅ (خیلی کوتاه) | AI گفته `normal` | **بلافاصله خودکار** → S9 |
| S9 | completed_triage | ✅ (پایانی) | خودکار (از S6/S7/S8) یا دستی توسط staff (از S5) | با `close_session`، `closedAt` ست می‌شه (state همون S9 می‌مونه) |
| S10 | cancelled_by_user | ✅ (پایانی) | `cancel_session` از هر state غیرپایانی | END |

**نکات کلیدی که باید همه (AI، Frontend، Backend) بدونن:**
- **S9 و S10 هر دو "پایانی" هستن ولی معنای متفاوت دارن**: S9 یعنی تریاژ با نتیجه کامل شد؛ S10 یعنی کاربر قبل از رسیدن به نتیجه انصراف داد. اینا رقیب هم نیستن، دو مسیر جدا به END هستن.
- **S5 تنها استثناست که خودکار finalize نمی‌شه** — چون معنی «در انتظار پزشک» داره. S6/S7/S8 چون نتیجه نهایی خودِ AI هستن، نیازی به تأیید انسانی ندارن.
- چون S6/S7/S8 خیلی سریع (در یک تراکنش) به S9 می‌رن، عملاً **در پاسخ API که Frontend می‌بینه، `currentState` همیشه یا `S9` است یا `S5`** (به‌علاوه‌ی S2/S4 در حالت‌های میانی/خطا) — تشخیص نوع نتیجه همیشه از `session.triageResult.urgencyLevel` است، نه `currentState`.
- S1 و S3 **در دیتابیس اصلاً وجود ندارن** — این فقط یک انتخاب پیاده‌سازی داخلیه؛ منطق دیاگرام اصلی دست‌نخورده مونده (فقط دو گذر خیلی سریع، هیچ‌وقت جدا query یا نمایش داده نمی‌شن).

## ۹. `GET /presenting-problems` (جدید — هماهنگ‌شده با عضو AI، ۱۲ ژوئیه ۲۰۲۶)

Endpoint عمومی (بدون نیاز به auth)، برای اینکه Frontend فرم یک‌مرحله‌ای
symptoms رو بسازه.

**Response `200 OK`:**
```json
{
  "presentingProblems": [
    { "id": "fever", "label": "تب" },
    { "id": "chest_pain", "label": "درد قفسه سینه" }
  ]
}
```
۳۲ مورد، `label` به فارسی. مستقیم از `getPresentingProblemsList()` در
`src/ai/index.js` (export جدیدی که عضو AI اضافه کرد) خونده می‌شه.

⚠️ **نکته برای Frontend:** فیلد دیگه‌ای (مثل «راهنمای سؤال پیگیری») در این
خروجی نیست — عضو AI تأیید کرد که اون فیلد فقط برای prompt engineering داخلی
خودشه، متن سؤالی که به بیمار نمایش داده می‌شه رو AI به‌صورت پویا در طول
مکالمه می‌سازه، نه از یک لیست ثابت. پس `id` همینجا رو به‌عنوان
`presentingProblemId` در `POST /sessions/:id/submit-symptoms` (بخش ۸) بفرستید.

**خطاهای ممکن:** `503 AI_SERVICE_UNAVAILABLE`، `502 AI_RESPONSE_INVALID`

## ۱۰. AuditLogs و ErrorLogs (Stage 6)

این دو جدول از طریق API عمومی expose نمی‌شن — صرفاً لاگ داخلی سیستم هستن،
اما مستند می‌کنم برای شفافیت:

- **`audit_logs`**: رویدادهای بیزینسی (`user_registered`, `user_login`,
  `login_failed`, `session_created`, `session_state_transition`,
  `session_reviewed_by_staff`, `session_closed`, `session_cancelled`) با
  `userId`, `action`, `entityType`, `entityId`, `metadata` (JSON آزاد)
- **`error_logs`**: فقط خطاهای ۵xx (خطای غیرمنتظره یا `AppError` با
  statusCode ≥ 500) به‌صورت خودکار توسط `errorHandler` مرکزی ثبت می‌شن؛
  خطاهای ۴xx (ورودی نامعتبر، انتقال state نامعتبر و...) چون کاملاً مورد
  انتظار و ناشی از کلاینت هستن، در این جدول ثبت نمی‌شن.
- هر دو با یک الگوی «fire-and-forget» نوشته شدن: اگه خودِ نوشتن لاگ fail
  بشه، جریان اصلی درخواست/پاسخ هرگز قطع نمی‌شه.
