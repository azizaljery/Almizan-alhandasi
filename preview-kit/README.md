# حزمة معاينة الميزان الهندسي (شريط المعاينة ولوحة النواقص)

مصدرها «MIZAN Preview Integration Kit» (README.original-kit.md)، وقد كُيّفت لمشروعنا. **هذه شيفرة وسم وعرض نواقص للمعاينة فقط**: لا تنشر ولا تدمج ولا تقرأ أسرارًا، ولا تعدّل المحركات ولا AZIZ ولا Mizan Score. وهي ليست اعتمادًا معماريًا ولا نظاميًا.

## ما عُدّل عن الأصل ولماذا
| التعديل | السبب |
|---|---|
| `scripts/site-install.mjs` جديد | الأصل (`install.mjs`) يفترض Vite وملف `index.html` في الجذر ومجلد `public/`؛ مشروعنا يبني `dist/client` من `dist/` ولا يملك أيًّا منهما، فكان المثبّت الأصلي سيرفض العمل |
| يرفض أي مجلد موقع داخل المستودع | حتى لا تدخل ملفات المعاينة حزمة الإنتاج (`wrangler.toml` يخدم `dist/client`) |
| الحقن بمسار نسبي `./mizan-preview/…`، وفي أول الصفحة إن لم يوجد `</head>` | صفحات المعاينة المنشورة بمسارات نسبية، و`launcher.html` شظية بلا `<head>` |
| `preview.js` يجلب `status.json` نسبةً إلى موقعه | بدل `/mizan-preview/status.json` المطلق الذي ينكسر تحت أي جذر غير `/` |
| `src/status.mizan.json` | قالب حالات يعكس نواقصنا الفعلية (H3، والاختبارات الأربعة، والمقاسات، وتراجعات الخصوصية، وC9، وستارة C6 بنصّها المعتمد، والاختبارات المستقلة) |
| تنسيق داكن في `preview.css` | موقعنا يدعم الوضع الداكن |
`install.mjs` و`preflight.mjs` الأصليان باقيان كما هما (غير مستخدمين هنا).

## الاستعمال: ثلاث خطوات ثم فحص، كلها على نسخة منفصلة خارج المستودع
```bash
A="--repo . --preview-url https://PREVIEW-HOST --production-url https://PRODUCTION-HOST"
# 1) بناء مجلد الموقع من dist (يستبعد client/server وindex.html والخرائط والمصادر، ويكتب launcher.html بالإيداع الفعلي)
node preview-kit/scripts/build-preview-site.mjs --repo . --out /path/to/preview-site
# 2) الشريط ولوحة النواقص: تجربة جافة ثم --apply
node preview-kit/scripts/site-install.mjs $A --site-dir /path/to/preview-site
node preview-kit/scripts/site-install.mjs $A --site-dir /path/to/preview-site --apply
# 3) فحص ما قبل النشر (يحجب: مضيف غير مطابق، فرع محمي، مجلد داخل المستودع، ملفات العينات المختومة/.env، قيم تشبه الأسرار، صفحة بلا شريط، غياب علمي staging)
MIZAN_PREVIEW_DEPLOY=1 MIZAN_DEPLOY_TARGET=staging node preview-kit/scripts/site-preflight.mjs $A --site-dir /path/to/preview-site
# اختبارات الحزمة
node --test preview-kit/test/*.test.mjs
```
- يُشترط فرع غير محمي (يرفض `main` وmaster وdeploy وproduction وrelease)، ومضيفان مختلفان بـHTTPS.
- الشريط لا يظهر إلا إذا كان مضيف الصفحة هو `allowedHosts` المكتوب في `mizan-preview/status.json` (مطابقة تامة).
- حدّث `status.json` بأدلة فقط. `INDEPENDENT_TESTS` لا يصير `passed` إلا برمز خروج 0 ودليل.
- مضيف النسخة المنشورة (مثل أصل artifact) يُعرف بعد النشر؛ ضعه في `allowedHosts` حينها.
- `install.mjs` و`preflight.mjs` الأصليان لا يُستعملان هنا (يفترضان Vite).

## حدود
- لا يثبت أن الإنتاج لم يتغير؛ ذلك بفحص منفصل لعزل الموارد والصلاحيات.
- لم تُنشر معاينة جديدة بهذه الحزمة. الفحص أدناه محلي على نسخة مؤقتة.
- النشر ممنوع دون موافقة المالك الصريحة والمستقلة على كل إصدار.
