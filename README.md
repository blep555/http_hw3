<div dir="rtl" align="right">

# تمرین عملی HTTP

نام و نام خانوادگی: الناز بهاروند  
شماره دانشجویی: 40231009  
درس: مهندسی اینترنت

## بخش 1: اجرای سرویس فقط در شبکه داخلی

برای این کار باید کاری کنیم که کاربر بیرون شبکه نتواند مستقیم به سرویس وصل شود. اگر پراکسی و سرویس روی یک سیستم باشند، می شود سرویس را روی آدرس <code dir="ltr">127.0.0.1:8081</code> اجرا کرد. این آدرس فقط از همان سیستم قابل دسترسی است و از بیرون نمی شود به آن وصل شد.

اگر سرویس روی یک سیستم دیگر در شبکه سازمان باشد، آن را روی IP خصوصی همان سیستم اجرا می کنیم. بعد با فایروال اجازه اتصال به پورت سرویس را فقط به IP پراکسی می دهیم. روی روتر هم برای پورت سرویس، انتقال پورت به اینترنت تنظیم نمی کنیم. داشتن IP خصوصی به تنهایی کافی نیست، چون ممکن است تنظیمات روتر یا فایروال دوباره راه دسترسی را باز کنند.

در این پروژه سرویس قدیمی روی پورت <code dir="ltr">8081</code> یک شبکه داخلی Docker اجرا می شود. برایش <code dir="ltr">ports</code> تعریف نشده، پس پورت آن روی سیستم میزبان منتشر نمی شود. فقط پراکسی به این شبکه وصل است و ورودی عمومی روی پورت <code dir="ltr">80</code> قرار دارد. خود میزبان و مدیر Docker هنوز به کانتینرها دسترسی دارند؛ هدف اینجا بستن مسیر مستقیم کاربران بیرونی است.

## بخش 2: فلسفه TLS Termination

سرویس قدیمی ممکن است HTTPS را پشتیبانی نکند یا اضافه کردن گواهی و تنظیمات TLS به آن سخت باشد. در روش <span dir="ltr">TLS Termination</span>، کاربر با HTTPS به پراکسی وصل می شود. پراکسی گواهی را ارائه می کند و ارتباط رمزنگاری شده همان جا تمام می شود. بعد درخواست را به سرویس داخلی می فرستد.

مزیتش این است که تنظیم گواهی، تمدید آن و مدیریت TLS در یک نقطه انجام می شود و لازم نیست کد سرویس قدیمی را عوض کنیم. اطلاعات و توکن کاربر هم در مسیر اینترنت به صورت متن ساده جابه جا نمی شوند.

ارتباط پراکسی تا سرویس داخلی می تواند HTTP باشد، ولی در این حالت آن قسمت رمزنگاری نشده است. اگر شبکه داخلی قابل اعتماد نباشد، برای این مسیر هم HTTPS یا mTLS در نظر می گیریم. همچنین این روش جای احراز هویت را نمی گیرد؛ TLS از ارتباط محافظت می کند و JWT مشخص می کند درخواست اجازه عبور دارد یا نه.

در اجرای این تمرین، طبق صورت سوال ورودی HTTP روی پورت <code dir="ltr">80</code> است. TLS در این نسخه پیاده نشده و توضیح این بخش درباره روش کار آن است. برای انتشار واقعی، توکن نباید روی HTTP عمومی ارسال شود و باید HTTPS هم راه اندازی شود.

## بخش 3: پیاده سازی پراکسی JWT

پراکسی با Node.js نوشته شده و پکیج جانبی ندارد. سرویس قدیمی هم همان ایمیج <code dir="ltr">ghcr.io/mccutchen/go-httpbin:2.20.0</code> است که در صورت تمرین معرفی شده.

درخواست اول به پورت <code dir="ltr">80</code> می رسد. پراکسی توکن داخل هدر <code dir="ltr">Authorization</code> را بررسی می کند و اگر معتبر باشد، متد، مسیر، پارامترها و بدنه درخواست را به سرویس داخلی می فرستد. کد وضعیت، هدرها و بدنه پاسخ سرویس هم به کاربر برمی گردد.

توکن با الگوریتم <code dir="ltr">HS256</code> امضا می شود. علاوه بر امضا، زمان انقضا، زمان صدور، صادرکننده، مخاطب و شناسه کاربر بررسی می شوند. اگر <code dir="ltr">nbf</code> داخل توکن باشد، زمان شروع اعتبار هم بررسی می شود. توکن بدون امضا، با الگوریتم دیگر، منقضی یا دستکاری شده رد می شود.

هدر احراز هویت قبل از ارسال به سرویس حذف می شود تا توکن در پاسخ مسیرهایی مثل <code dir="ltr">/headers</code> برنگردد. هدرهای هویت و فوروارد شده کاربر هم کنار گذاشته می شوند و پراکسی خودش مقدار درست را قرار می دهد. شناسه کاربر در <code dir="ltr">X-Authenticated-User</code> فرستاده می شود و برای کاراکترهای غیر ASCII از URL encoding استفاده می شود.

توکن را مدیر از طریق اسکریپت محلی می سازد. مسیر عمومی برای گرفتن توکن وجود ندارد؛ در نتیجه هر کسی که به پراکسی وصل شود نمی تواند برای خودش توکن بسازد. این پروژه سامانه ثبت نام و ورود نیست و ساخت توکن فقط برای اعضای مجاز و نمایش عملکرد تمرین انجام می شود.

### فایل ها

| فایل | کاربرد |
| --- | --- |
| <code dir="ltr">src/proxy.mjs</code> | بررسی درخواست و ارسال آن به سرویس داخلی |
| <code dir="ltr">src/jwt.mjs</code> | امضا و اعتبارسنجی JWT |
| <code dir="ltr">scripts/setup.mjs</code> | ساخت تنظیمات و کلید تصادفی |
| <code dir="ltr">scripts/token.mjs</code> | ساخت توکن کوتاه مدت برای کاربر مجاز |
| <code dir="ltr">compose.yaml</code> | اتصال پراکسی و سرویس در شبکه داخلی |
| <code dir="ltr">test/proxy.test.mjs</code> | تست احراز هویت و عبور درخواست ها |

### اجرا در ویندوز

پیش نیازها Node.js نسخه <code dir="ltr">22</code> یا جدیدتر، Docker Desktop با حالت Linux containers و فعال بودن Docker Compose هستند. دستورها برای PowerShell نوشته شده اند. اول وارد پوشه پروژه می شویم:

</div>

```powershell
cd "C:\Users\ALMAHDI\Desktop\mid-term7\web\hws\http_hw3"
npm run setup
docker compose up -d --build
docker compose ps
```

<div dir="rtl" align="right">

دستور setup فایل <code dir="ltr">.env</code> را با کلید تصادفی می سازد و اگر این فایل از قبل باشد تغییرش نمی دهد. فایل واقعی تنظیمات داخل گیت قرار نمی گیرد و فقط نمونه آن در مخزن هست. نیازی به <code dir="ltr">npm install</code> نیست.

برای ساخت یک توکن با اعتبار <code dir="ltr">900</code> ثانیه:

</div>

```powershell
$token = node --env-file=.env scripts/token.mjs elnaz 900
```

<div dir="rtl" align="right">

### بررسی نتیجه با سرویس واقعی

بدون توکن باید پاسخ <code dir="ltr">401</code> بگیریم:

</div>

```powershell
curl.exe -i "http://localhost/get"
```

<div dir="rtl" align="right">

با توکن معتبر باید پاسخ <code dir="ltr">200</code> و اطلاعات درخواست را ببینیم:

</div>

```powershell
curl.exe -i -H "Authorization: Bearer $token" "http://localhost/get?course=web"
curl.exe -i -H "Authorization: Bearer $token" --data "message=hello" "http://localhost/post"
curl.exe -i -H "Authorization: Bearer $token" "http://localhost/headers"
curl.exe -i -H "Authorization: Bearer $token" "http://localhost/status/418"
```

<div dir="rtl" align="right">

در خروجی هدرها نباید توکن دیده شود. مسیر آخر هم باید همان وضعیت <code dir="ltr">418</code> را از سرویس برگرداند.

برای تست توکن نامعتبر و منقضی:

</div>

```powershell
curl.exe -i -H "Authorization: Bearer invalid-token" "http://localhost/get"
$expired = node --env-file=.env scripts/token.mjs elnaz 1
Start-Sleep -Seconds 2
curl.exe -i -H "Authorization: Bearer $expired" "http://localhost/get"
```

<div dir="rtl" align="right">

هر دو درخواست باید <code dir="ltr">401</code> بگیرند. برای بررسی اینکه پورت داخلی روی میزبان منتشر نشده:

</div>

```powershell
docker compose port legacy 8081
Test-NetConnection localhost -Port 8081
```

<div dir="rtl" align="right">

برای سرویس legacy نباید پورت منتشر شده ای وجود داشته باشد. اگر برنامه دیگری روی پورت <code dir="ltr">8081</code> سیستم اجرا نشده باشد، تست اتصال مستقیم هم ناموفق می شود.

تست های خودکار بدون Docker اجرا می شوند و برای بررسی پراکسی از یک سرویس آزمایشی محلی استفاده می کنند. این تست ها جای تست نهایی با go-httpbin را نمی گیرند:

</div>

```powershell
npm test
```

<div dir="rtl" align="right">

تست ها رد شدن توکن های نامعتبر پیش از رسیدن به سرویس، عبور بدنه باینری و پارامترها، حذف توکن از هدرهای ارسالی، جلوگیری از جعل هویت، حفظ کد وضعیت، متدهای مختلف و پاسخ <code dir="ltr">502</code> در صورت قطع سرویس را بررسی می کنند.

### اجرا بدون Docker

اگر Go هم نصب باشد، می شود خود go-httpbin را مستقیم اجرا کرد. در ترمینال اول:

</div>

```powershell
go run github.com/mccutchen/go-httpbin/v2/cmd/go-httpbin@v2.20.0 -host 127.0.0.1 -port 8081
```

<div dir="rtl" align="right">

در ترمینال دوم، داخل پوشه پروژه:

</div>

```powershell
npm run setup
npm start
```

<div dir="rtl" align="right">

در این روش هم پراکسی روی پورت <code dir="ltr">80</code> است و سرویس فقط روی loopback اجرا می شود. Docker و اجرای مستقیم نباید همزمان روی پورت <code dir="ltr">80</code> فعال باشند. اگر این پورت اشغال باشد باید برنامه ای که آن را گرفته متوقف شود. در لینوکس، اجرای مستقیم روی پورت <code dir="ltr">80</code> به مجوز bind کردن پورت های پایین نیاز دارد؛ روش Docker این قسمت را مدیریت می کند.

### توقف و دیدن خطاها

</div>

```powershell
docker compose logs --tail 50
docker compose down
```

<div dir="rtl" align="right">

اگر کلید داخل <code dir="ltr">.env</code> عوض شود، توکن های قبلی دیگر معتبر نیستند. بعد از تغییر تنظیمات هم باید کانتینر پراکسی دوباره ساخته شود:

</div>

```powershell
docker compose up -d --force-recreate proxy
```

<div dir="rtl" align="right">

### منابع

- [راهنمای go-httpbin](https://github.com/mccutchen/go-httpbin)
- [ساختار JWT در RFC 7519](https://www.rfc-editor.org/rfc/rfc7519)
- [هدرهای اتصال و پراکسی در RFC 9110](https://www.rfc-editor.org/rfc/rfc9110)

</div>
