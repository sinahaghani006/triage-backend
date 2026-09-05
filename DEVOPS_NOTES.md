# نکات محیطی/DevOps

این فایل یادداشت‌های فنی محیطی است که حین کار روی پروژه کشف شده‌اند
— مشابه نکته‌ی «PowerShell 5.1» در سند انتقال پروژه. هدف: جلوگیری
از تکرار همان مشکلات توسط توسعه‌دهنده‌ی بعدی.

## BOM در فایل‌های migration.sql (کشف‌شده 2026-08-29)

حداقل ۳ فایل migration قدیمی (`add_national_id`,
`add_doctor_review_status`, `add_phone_number`) با یک UTF-8 BOM
نامرئی در ابتدای فایل ذخیره شده بودند (احتمالاً از یک روش نوشتن
PowerShell قبلی که BOM اضافه می‌کند). این باعث می‌شد
`prisma migrate dev` نتواند shadow database بسازد (خطای
`P3006: syntax error near "ALTER"`) — یعنی هیچ migration جدیدی روی
این پروژه قابل ساخت نبود تا وقتی فیکس شد.

برای نوشتن فایل بدون BOM از PowerShell، همیشه از این استفاده کن:
```powershell
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
```
نه `Out-File`/`Set-Content` معمولی (که می‌توانند BOM اضافه کنند).

## هرگز `prisma migrate dev` را مستقیم روی این پروژه اجرا نکن

این پروژه هیچ محیط staging/local جدا ندارد — `DATABASE_URL` و
`DIRECT_URL` هر دو مستقیم به همان Neon production واقعی وصل‌اند.
`migrate dev` وقتی «drift» بین migration history و schema واقعی
تشخیص دهد، می‌تواند **پیشنهاد reset کامل schema (پاک‌کردن همه‌ی
داده‌ها) بدهد** — این تقریباً یک‌بار (2026-08-30) نزدیک بود رخ دهد
(خوشبختانه پاسخ پیش‌فرض ترمینال "no" بود).

روش امن برای migration جدید:
1. SQL دستی بنویس (نه از طریق `migrate dev --create-only` که drift
   کل تاریخچه را چک می‌کند).
2. با یک `$transaction` که در پایان عمداً `throw` می‌کند (rollback)
   تست کن — این به تو اجازه می‌دهد ببینی SQL درست اجرا می‌شود و
   نتیجه‌ی backfill منطقی است، بدون این‌که چیزی واقعی تغییر کند.
3. واقعی (بدون throw) اجرا کن.
4. با `prisma migrate resolve --applied <name>` تاریخچه را ثبت کن.

## Prisma interactive transaction timeout پیش‌فرض کوتاه است

پیش‌فرض `$transaction` تعاملی فقط ۵۰۰۰ms است، در حالی که تأخیر
اتصال به این Neon instance (مخصوصاً چند دستور SQL پشت‌سرهم) می‌تواند
نزدیک یا بیشتر از این مقدار باشد (مشاهده‌شده: ۵۲۲۳ms). این باعث
خطای `P2028: Transaction not found/already closed` می‌شود.

راه‌حل: پاس دادن `{ timeout: 30000 }` به‌عنوان آپشن دوم `$transaction`:
```js
await prisma.$transaction(async (tx) => { ... }, { timeout: 30000, maxWait: 10000 });
```

## `DATABASE_URL` (با pgbouncer) برای migration دستی مناسب نیست

برای `$transaction` تعاملی چندمرحله‌ای، از `DIRECT_URL` استفاده کن،
نه `DATABASE_URL` پیش‌فرض:
```js
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});
```

## هیچ `prisma migrate deploy` خودکاری در فرآیند build/deploy وجود ندارد

`package.json` فقط `prisma generate` را در `postinstall` دارد؛
`vercel.json` هیچ build command سفارشی ندارد. یعنی migration ها
هرگز خودکار روی production اجرا نمی‌شوند — همیشه باید دستی زده
شوند (این ریشه‌ی واقعی schema drift کشف‌شده در 2026-08-30 بود: چند
migration با `db push`/SQL دستی زده شده بودند ولی هیچ‌وقت رسماً در
`_prisma_migrations` ثبت نشده بودند).

## 🔴 Gemini API از IP ایران در دسترس نیست (کشف‌شده 2026-08-31)

فراخوانی مستقیم Gemini API از یک ماشین/شبکه‌ی ایرانی با خطای
`403 Forbidden` (صفحه‌ی استاندارد بلاک Google) مواجه می‌شود. این
یک محدودیت ساختاری دائمی است، نه یک باگ قابل‌رفع در کد ما.

**اثر عملی:** `geminiProvider.js` (و هر provider مبتنی بر Gemini
در آینده) **هرگز نمی‌تواند از یک ماشین توسعه‌ی لوکال در ایران تست
شود**. تنها راه تست، deploy روی Vercel (زیرساخت آمریکایی) و صدا
زدن از آنجاست — دقیقاً همان روشی که برای ارزیابی اولیه استفاده شد
(یک route تست موقت روی یک preview deployment، نه لوکال).

این یک استدلال محکم‌تر برای بدهی فنی قبلاً ثبت‌شده (نیاز به محیط
staging/local جدا) است — بدون چنین محیطی، حتی توسعه‌ی معمول روی
هر provider مبتنی بر Gemini باید مستقیم روی یک deployment واقعی
(نه لوکال) انجام شود.

## نام مدل‌های Gemini سریع منسوخ می‌شوند (کشف‌شده 2026-08-31)

اولین تلاش با `gemini-2.0-flash` بلافاصله `404 NOT_FOUND` داد؛
پیام خطای خودِ API صریحاً مدل جایگزین (`gemini-3.6-flash`) را
پیشنهاد داد. بر خلاف مدل‌های Groq (`gpt-oss-120b`) که در طول این
پروژه ثابت مانده‌اند، مدل‌های Google با سرعت بیشتری منسوخ/جایگزین
می‌شوند. **قبل از هر استفاده‌ی جدید از Gemini، نام مدل را با
مستندات رسمی یا حتی یک تست سریع تأیید کن، فرض نکن نامی که قبلاً
کار کرده هنوز معتبر است.**

## بعد از هر migration دستی SQL خام، schema.prisma را با DB واقعی sync کن (کشف‌شده 2026-08-30)

اگر یک migration دستی (SQL خام، نه از طریق Prisma) یک `DEFAULT` یا
constraint روی یک ستون در دیتابیس واقعی تنظیم می‌کند، این باید
**صریحاً** هم در `schema.prisma` منعکس شود (مثلاً با `@default(...)`).
اگر این کار انجام نشود، Prisma Client آن ستون را یک آرگومان الزامی
در نظر می‌گیرد که باید در هر `.create()` فرستاده شود — و چون کد آن
را نمی‌فرستد، **validation خودِ Prisma Client قبل از رسیدن به
دیتابیس fail می‌شود** (`PrismaClientValidationError`), و چون
`errorHandler.js` این نوع خطا را نمی‌شناسد، به‌صورت یک `500`
عمومی و غیرقابل‌ردیابی به کاربر نمایش داده می‌شود.

مثال واقعی: migration `visit_number` (TASK 7) یک `DEFAULT
nextval(...)` مستقیم روی دیتابیس تنظیم کرد ولی این هرگز در
`schema.prisma` اعلام نشد — نتیجه: `POST /sessions` کاملاً از کار
افتاد تا وقتی `@default(autoincrement())` (که فقط یک annotation
informational است، نه ساخت sequence جدید) به schema اضافه شد.

**قاعده:** بعد از هر migration دستی SQL خام، همیشه با یک تست
مستقیم (`prisma.<model>.create()` با حداقل داده) بررسی کن که آیا
Prisma Client فیلدی را به‌اشتباه الزامی می‌داند که در دیتابیس
پیش‌فرض دارد.

**بدهی فنی رسمی (تصمیم PM، برای بعد از دمو):**
- ساخت یک محیط staging/local کاملاً جدا از production.
- یک فرآیند رسمی migrate deploy (حتی یک اسکریپت ساده‌ی pre-push)
  به‌جای اجرای دستی پراکنده.

## `npm run dev` (Turbopack) تأیید کامل تایپ TypeScript انجام نمی‌دهد (کشف‌شده Frontend، 2026-08-31)

طی چند commit پیاپی (فیکس جستجوی synonym و چند تسک بعد از آن)، تست فقط
با `npm run dev` انجام می‌شد و همیشه بدون خطا اجرا می‌شد. ولی یک فیلد
جدید (`synonyms`) که در type اصلی (`PresentingProblem`) اضافه نشده
بود، فقط در `npm run build` (دقیقاً همان چیزی که Vercel در deploy
واقعی اجرا می‌کند) به‌عنوان خطای TypeScript ظاهر می‌شد — نه در
`npm run dev`.

**اثر عملی:** ۶ deploy پیاپی روی Vercel به‌خاطر همین یک خطا Error
(fail) شدند، بدون این‌که کسی متوجه شود — چون Vercel همچنان صفحه‌ی
آخرین deploy موفق قبلی را serve می‌کرد و ظاهر صفحه طبیعی به‌نظر
می‌رسید. برای چند ساعت، هر تستی که «روی production» انجام می‌شد، در
واقع روی یک نسخه‌ی قدیمی‌تر بود.

**قاعده:**
- قبل از هر commit/push، همیشه `npm run build` (نه فقط
  `npm run dev`) را لوکال اجرا کن و منتظر بمان تا کاملاً موفق شود.
- بعد از هر build ناموفق یا مشکوک، `.next` و `tsconfig.tsbuildinfo`
  را پاک کن و دوباره اجرا کن تا از کش گمراه‌کننده مطمئن شوی.
- بعد از هر push، حتماً وضعیت واقعی deploy را در Vercel Dashboard چک
  کن (نه فرض بر اساس push موفق گیت) — باید «Ready» سبز باشد، نه فقط
  نبود خطا در ترمینال محلی.

## کاراکترهای فارسی/غیر-ASCII داخل خودِ فایل `.ps1` می‌توانند خراب شوند (کشف‌شده Frontend، 2026-08-31)

وقتی یک اسکریپت PowerShell حاوی متن فارسی مستقیم در `Write-Host`
نوشته می‌شود و فایل بدون UTF-8 BOM ذخیره شود، Windows PowerShell 5.1
(`powershell.exe`، نه PowerShell 7/`pwsh`) آن را با codepage پیش‌فرض
سیستم (نه UTF-8) می‌خواند — نتیجه: متن فارسی به مجموعه‌ای از
کاراکترهای نامفهوم (`Ø¨Ù„ÙˆÚ©...`) تبدیل می‌شود که خودش می‌تواند به
خطای parse منجر شود.

یک مشکل جدا و خطرناک‌تر: در یک heredoc **دوقول‌نقل** (`@"…"@`)،
بک‌تیک کاراکتر escape خودِ PowerShell است. اگر متنی مثل نام دستور
داخل بک‌تیک (فرمت رایج مارک‌داون) داخل چنین heredoc-ای باشد،
PowerShell دنباله‌ی بک‌تیک+n را به escape «خط جدید» تفسیر می‌کند و
بخشی از متن را بی‌صدا حذف/جایگزین می‌کند — نتیجه یک فایل خروجی با
کامنت‌های شکسته (فاقد `//` در ابتدای خط) که باعث خطای parse در
TypeScript می‌شود، بدون هیچ پیام خطای واضحی از خود PowerShell در
لحظه‌ی نوشتن فایل.

**قاعده:**
- در `Write-Host` هر اسکریپتی که با `powershell -File` اجرا می‌شود
  (نه پیست مستقیم در کنسول)، فقط از متن انگلیسی/ASCII استفاده کن.
- هرگز از heredoc دوقول‌نقل (`@"…"@`) برای متنی که ممکن است بک‌تیک
  داشته باشد استفاده نکن — یا از heredoc تک‌قول‌نقل (`@'…'@`، بدون
  تفسیر escape) استفاده کن، یا بهتر، محتوای واقعی را در یک فایل جدا
  بگذار و با `Get-Content -Encoding UTF8` بخوان، نه این‌که مستقیم در
  خودِ اسکریپت heredoc کنی.
