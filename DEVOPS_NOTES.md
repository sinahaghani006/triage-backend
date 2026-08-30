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

**بدهی فنی رسمی (تصمیم PM، برای بعد از دمو):**
- ساخت یک محیط staging/local کاملاً جدا از production.
- یک فرآیند رسمی migrate deploy (حتی یک اسکریپت ساده‌ی pre-push)
  به‌جای اجرای دستی پراکنده.