# نشر «أنت الشاعر» عبر GitHub وCloudflare

هذه الملفات تجعل GitHub ينشر التطبيق الكامل إلى Cloudflare Workers بعد تجهيز الموارد مرة واحدة. لا تستخدم GitHub Pages لهذا التطبيق، لأن التحليل بالذكاء الاصطناعي، الأرشيف، التسجيلات الصوتية، وتفعيل المستخدمين تحتاج خادمًا وقاعدة بيانات وتخزينًا آمنًا.

## الموارد التي تُنشأ في حساب Cloudflare

1. **Worker** باسم `ant-alshaer` (أو الاسم المحدد في متغير GitHub `CLOUDFLARE_WORKER_NAME`).
2. **D1 database** باسم `ant-alshaer-db` لحسابات المستخدمين والقصائد والأرشيف.
3. **R2 bucket** باسم `ant-alshaer-audio` للتسجيلات الصوتية.

## أسرار GitHub المطلوبة للنشر

أضف هذه القيم في: Repository Settings → Secrets and variables → Actions → Secrets.

| الاسم | الغرض |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | رمز Cloudflare بصلاحية تعديل Workers وD1 وR2 ضمن حساب التطبيق فقط. |
| `CLOUDFLARE_ACCOUNT_ID` | معرّف حساب Cloudflare الذي سيملك التطبيق. |
| `CLOUDFLARE_D1_DATABASE_ID` | معرّف قاعدة D1 الخاصة بتطبيق «أنت الشاعر». |

أضف المتغير التالي في قسم **Variables** بعد اكتمال الإعدادات:

| الاسم | القيمة |
| --- | --- |
| `CLOUDFLARE_DEPLOY_ENABLED` | `true` |

يمكن تغيير هذه المتغيرات الاختيارية إذا أردت أسماء مختلفة:

- `CLOUDFLARE_WORKER_NAME`
- `CLOUDFLARE_D1_DATABASE_NAME`
- `CLOUDFLARE_R2_BUCKET_NAME`

## أسرار تشغيل التطبيق داخل Cloudflare

أضفها من Cloudflare Workers → التطبيق → Settings → Variables and Secrets. لا تحفظ أيًّا منها في GitHub أو الكود.

| الاسم | مطلوب | الاستخدام |
| --- | --- | --- |
| `OPENAI_API_KEY` | نعم | تحليل القصة، تفريغ الصوت، وكتابة القصيدة. |
| `ADMIN_EMAIL` | نعم | تعريف مدير التطبيق. |
| `ADMIN_PASSWORD_HASH` | نعم | حماية لوحة الإدارة. |
| `ADMIN_SESSION_SECRET` | نعم | توقيع جلسة الإدارة. |
| `USER_AUTH_SECRET` | نعم | توقيع جلسات الزائر/المستخدم وتشفير إعدادات التفعيل. |
| `TWILIO_*` | لاحقًا | تفعيل البريد وSMS بعد إكمال إعداد Twilio. |

يبقى وضع الدخول المؤقت مفعّلًا عبر `GUEST_ACCESS_ENABLED=true` إلى أن تقرر إعادة تسجيل المستخدمين وتفعيل البريد وSMS.

## ماذا يحدث بعد الربط؟

كل تحديث يصل إلى فرع `main` يبني التطبيق وينشره تلقائيًا على Cloudflare. تحصل أولًا على رابط `workers.dev`، ثم يمكن ربط دومين خاص بالتطبيق من إعدادات Worker.

