# حزمة تكامل شرعاء V2 + R21 — متوافقة مع بنية الميزان الهندسي

## مصدر المطابقة
فُحصت ملفات GitHub الفعلية في المستودع `azizaljery/almizan-alhandasi`، خصوصًا:
- شرعاء V2: `dev/sharaa-v2` عند `429098a`.
- مرشح R21: `dev/r21-launch-candidate` عند `f6d22c7` (حالة الرأس على الخادم لم تكن مثبتة في التقرير).
- `dist/home.mjs`, `dist/home.html`, `dist/sharaa/{flow,brief,adapter}.mjs`, `dist/requirements.mjs`, `dist/villa-layout-v2.mjs`, `dist/villa-layout-v3.mjs`.
- `scripts/build.mjs`, `scripts/run-tests.mjs`, `scripts/e2e-sharaa-v2.mjs`.
- `.github/workflows/deploy-staging.yml` و`wrangler.staging.toml` في مرشح R21.

**هذه ليست نسخة بديلة للمشروع ولا ترقيعًا للمحركات.** الميزات المعمارية موجودة بالفعل في الفروع المذكورة. هذه الحزمة تضيف فحوص توافق وتشغيل قبول وحارسًا إضافيًا قبل نشر المعاينة، حتى لا نكرر أخطاء الحزمة السابقة التي افترضت Vite و`public/`.

## محتويات الحزمة
- `scripts/release-kit/source-check.mjs`: يتحقق من وجود نقاط الربط الحقيقية، لا من هيكل Vite.
- `scripts/release-kit/run-acceptance.mjs`: يشغل اختبارات شرعاء والباب الحقيقي، مع خيار البناء والمتصفح والاختبار الكامل.
- `scripts/release-kit/verify-browser.mjs`: يشغّل سكربت Chromium الموجود أصلًا، ويجعل غياب نتيجة أو زر التوليد **فشلًا صريحًا** بدل EXIT=0 مضلل.
- `scripts/release-kit/guard.mjs`: يحجب نشر staging إن كان الفرع أو العلم أو Worker أو D1 أو الأصل غير صحيح، أو احتوى `dist/client` على ملف محظور أو مفتاح مكشوف.
- `scripts/release-kit/install.mjs`: يضيف خطوة الحارس إلى workflow **الموجود**؛ تجربة جافة افتراضيًا، `--apply` فقط على `dev/*`، ولا يغير أي ملف آخر.
- `tests/release-kit/*.test.mjs`: اختبارات محلية مستقلة عن اختبارات المشروع الأساسية.

## التثبيت — لا تعدّل الإنتاج
1. جهّز فرع تكامل جديدًا من نسخة التطوير المراد اختبارها، مثل `dev/sharaa-r21-integration`. لا تفترض أن دمج `429098a` و`f6d22c7` بلا تعارض؛ دمجهما وتدقيق التعارضات خطوة مستقلة يقوم بها المطور.
2. فك محتويات ZIP في **جذر المستودع**؛ لا تنسخ `release-kit` وحده، بل انسخ أيضًا `scripts/release-kit` و`tests/release-kit`.
3. شغّل الفحص المحلي للحزمة: `node --test tests/release-kit/*.test.mjs`.
4. في فرع شرعاء فقط: `node scripts/release-kit/run-acceptance.mjs`.
5. في مرشح R21 فقط: `node scripts/release-kit/run-acceptance.mjs --r21`.
6. بعد جمع الإصلاحات في فرع تكامل، شغّل: `node scripts/release-kit/run-acceptance.mjs --combined --build`، ثم `--combined --browser` إذا توفر Playwright وChromium، وأخيرًا `--combined --full` عند توفر وقت وقرص كافيين.
7. بعد وجود `.github/workflows/deploy-staging.yml` على فرع التكامل: `node scripts/release-kit/install.mjs` (جاف)، ثم `node scripts/release-kit/install.mjs --apply` (تعديل workflow فقط).
8. راجع فرق الملفات، ثم ادمج فرع التكامل يدويًا إلى `staging-preview` بعد الموافقة. عند دفع `staging-preview` سيعمل workflow الأصلي الذي أُضيف إليه الحارس؛ الحزمة لا تنفّذ هذا الدفع أو النشر.

## عقد المعاينة الفعلي
- ملفات الويب تُبنى من `dist/` إلى `dist/client` بواسطة `node scripts/build.mjs`.
- خادم Cloudflare مستقل عبر `wrangler.staging.toml` و`worker/index.mjs` وD1 مستقل.
- **لا** `index.html` في جذر المستودع، ولا `public/`، ولا Vite.
- قبل النشر، يشترط الحارس `MIZAN_PREVIEW_DEPLOY=1`, `MIZAN_DEPLOY_TARGET=staging`, `GITHUB_REF_NAME=staging-preview`، ولا يسمح بنطاق إنتاج أو D1 مطابق للإنتاج.
- الحارس يفحص إعدادات الملفات المحلية فقط؛ لا يمكنه إثبات عزل صلاحيات حساب Cloudflare أو Access أو المفاتيح الحقيقية. ذلك يحتاج تدقيقًا خارجيًا.

## شروط القبول التي لا يجوز تزويرها
- شرعاء V2: 1517 اختبارًا، 1514 ناجحة و3 إخفاقات موروثة حسب تقرير المطور. هذا ليس نجاحًا كاملًا.
- R21: 1549 اختبارًا، 1546 ناجحة و3 إخفاقات دش معلنة. **لا تغير توقعات r15/r19 لإخفائها**.
- أربعة اختبارات R21 المعلقة تبقى معلنة.
- H3=SEARCH_INCOMPLETE، المقاسات جزئية، المطابقة النظامية للساتر غير متحققة.
- اختبار المساعد بمفتاح حقيقي خاص بالمعاينة غير منفذ بهذه الحزمة.
- نجاح 2D و3D والتعديل على الموقع المنشور يحتاج اختبارًا فعليًا مستقلًا؛ سكربت Chromium المحلي ليس بديلًا عنه.

## ما لا تفعله الحزمة
لا Commit، لا Push، لا Merge، لا Deploy، لا تغيير للمحركات أو Mizan Score أو r19، لا فتح لعينات مختومة، ولا تغيير لكلمات المرور أو أسرار الإنتاج. ولا تدّعي أن دمج شرعاء وR21 قد تم.
