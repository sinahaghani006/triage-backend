# راهنمای Deploy — Backend Core (Neon + Vercel)

این سند مراحل لازم برای اولین deploy بخش Backend روی Vercel با دیتابیس Neon
را پوشش می‌دهد. کارهایی که نیاز به دسترسی به داشبورد Neon/Vercel (خارج از
دسترسی من) دارند علامت **[نیاز به اقدام شما]** خورده‌اند.

## ۱. ساخت دیتابیس Neon **[نیاز به اقدام شما]**

1. در [neon.tech](https://neon.tech) یک پروژه جدید بسازید (free tier).
2. یک دیتابیس با اسم `triage_db` بسازید (یا از دیتابیس پیش‌فرض استفاده کنید).
3. از داشبورد Neon، دو connection string را کپی کنید:
   - **Pooled connection** (معمولاً حاوی `-pooler` در هاست) → این می‌شود `DATABASE_URL`
   - **Direct connection** (بدون `-pooler`) → این می‌شود `DIRECT_URL`
4. این دو مقدار را نگه دارید — در مرحله ۳ در Vercel وارد می‌شوند.

## ۲. اجرای migration روی دیتابیس Neon (یک‌بار، قبل از اولین deploy)

از سیستم محلی خودتان (چون Prisma Migrate به connection مستقیم نیاز دارد):
```bash
# در .env محلی موقتاً DATABASE_URL و DIRECT_URL را به مقادیر Neon تغییر دهید
npx prisma migrate deploy
```
`migrate deploy` (نه `migrate dev`) استفاده می‌شود چون این‌جا محیط production
است — `migrate dev` سؤالات تعاملی می‌پرسد که برای CI/production مناسب نیست.

## ۳. ساخت پروژه Vercel و تنظیم Environment Variables **[نیاز به اقدام شما]**

1. ریپازیتوری را به Vercel وصل کنید (Import Project).
2. Framework Preset را روی **Other** بگذارید (این یک اپ Express است، نه Next.js).
3. در بخش Environment Variables این مقادیر را وارد کنید:

| Key | Value |
|---|---|
| `DATABASE_URL` | pooled connection string از Neon (مرحله ۱) |
| `DIRECT_URL` | direct connection string از Neon (مرحله ۱) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | یک رشته تصادفی طولانی و امن (نه همون مقدار نمونه‌ی `.env.example`) |
| `JWT_EXPIRES_IN` | `1d` (یا هر مقدار دلخواه) |
| `FRONTEND_ORIGIN` | URL واقعی *.vercel.app پروژه Frontend (بعداً که مشخص شد آپدیت کنید) |

4. Deploy بزنید.

## ۴. تغییرات کد که از قبل برای این deploy آماده شده (نیازی به اقدام شما نیست)

- `api/index.js` + `vercel.json`: اپ Express به‌عنوان یک تابع سرورلس Vercel wrap شده.
- `prisma/schema.prisma`: `binaryTargets` برای runtime سرورلس Vercel (`rhel-openssl-3.0.x`) و پشتیبانی `directUrl` اضافه شده.
- `src/config/prismaClient.js`: نمونه Prisma Client روی `global` کش می‌شود تا در فراخوانی‌های گرم (warm invocations) سرورلس، دوباره connection pool جدید ساخته نشود (جلوگیری از اتمام connection limit در Neon free tier).
- `package.json`: اسکریپت `postinstall: prisma generate` اضافه شده — چون Vercel باید Prisma Client را در مرحله build خودش تولید کند.
- کوکی httpOnly: در `NODE_ENV=production`، `SameSite=None` + `Secure=true` تنظیم می‌شود (چون Frontend و Backend روی دو ساب‌دامین متفاوت `*.vercel.app` هستند و طبق Public Suffix List، از نظر مرورگر **cross-site** محسوب می‌شوند، نه same-site).

## ۵. بعد از اولین deploy موفق

- آدرس واقعی Backend (`https://<your-project>.vercel.app`) را به عضو Frontend بدهید تا `baseURL` را در محیط خودشان آپدیت کند.
- به‌محض مشخص‌شدن آدرس واقعی *.vercel.app پروژه Frontend، مقدار `FRONTEND_ORIGIN` را در تنظیمات Vercel آپدیت کنید (و redeploy کنید — تغییر env vars روی Vercel نیاز به یک deploy جدید دارد تا اعمال شود).
- تست دستی حداقلی (بعد از هر deploy): `GET https://<backend-url>/health` باید `{"status":"ok"}` برگرداند.

## ۶. محدودیت‌های شناخته‌شده فعلی

- ماژول AI فعلاً با `mock` تست شده (طبق تصمیم مدیر پروژه) چون Gemini در ایران فیلتر است و اتصال واقعی فقط بعد از deploy روی Vercel (سرور خارج از ایران) قابل تست است. بعد از اولین deploy موفق، این تست باید انجام شود.
- دامنه اختصاصی فعلاً استفاده نمی‌شود؛ فقط subdomain رایگان `*.vercel.app`.
