# DEC-002 — التحقق من الهوية عند استعادة المشروع (ID-01)

**الحالة:** مطبّق ومختبر · **التاريخ:** 2026-10-14 · **المرجع:** تقرير التدقيق المرحلة الأولى (ID-01)

## المشكلة
`decodeProject` كان يشغّل `validateModel` ولا يعيد حساب `geometryHash`. ملف مشروع تُعدّلت هندسته (مثلاً موضع نافذة) كان يُستعاد بـ`candidateId` ومراجعة قديمة كأنها مطابقة للهندسة الحالية.

## القرار
1. عند الاستعادة تُعاد حساب `geometryHash` من المخطط المدمج بنفس مفاتيح وملف التسلسل المستخدمين في `integration/pipeline.mjs` (`GEOMETRY_KEYS` + `mizan-json-sorted-keys-v1`).
2. عدم التطابق **لا يرفض الملف** (لا نفقد عمل المستخدم)؛ يفشل مغلقاً إلى «يحتاج مراجعة»: نفس تمثيل التحرير في `geometry-editor.mjs` (`candidateId=null`, `geometryHash=null`, `reviewId=null`, `reviewOverall='NOT_EVALUATED'`, `requiresReview=true`, `previousCandidateId` يحفظ النسب) مع حقل تشخيصي `restoreCheck='GEOMETRY_HASH_MISMATCH'`.
3. نماذج بلا `integration` (قديمة) أو معلَّمة سلفاً `requiresReview` أو بلا هوية: تبقى كما هي.
4. التحقق متزامن ليبقى `decodeProject` متزامناً (واجهة برمجية موجودة تستدعيها مسارات كثيرة): يستخدم `sha256` المتزامن الموجود في `integration/browser-crypto.mjs`، ويُثبَت تطابقه مع WebCrypto باختبار «مشروع غير معدّل لا يُعلَّم».
5. بوابات `validateModel` السابقة لم تتغير؛ تعديل حجم غرفة ما زال يُرفض قبل الوصول لهذا التحقق (اختبار يوثق ذلك).

## ما لا يغطيه (صراحةً)
- هذا يكشف **عدم تطابق الهندسة مع الهوية المخزّنة**، لا يثبت أن الهوية المخزّنة نفسها صدرت من خط الأنابيب (لا توقيع مشفّر). ملف مزوَّر بهندسة وهوية متسقتين معاً يمرّ كمشروع صالح. (غير متحقق: لا آلية توقيع في المنتج حالياً.)
- المسار الذي يستعيد من الأرشيف (`worker/site-archive.mjs`) يمر عبر `decodeProject` نفسه فيستفيد، لكن لم يُختبر هنا بمتصفح حقيقي على الأرشيف الحي.

## الدليل
- أحمر قبل الإصلاح: `audit/phase1/logs/restore-identity-RED.log` (2 نجاح / 4 فشل).
- بعد الإصلاح: `tests/restore-identity.test.mjs` 7/7؛ المجموعة الكاملة 957/957؛ البناء سليم (154 وحدة).
- متصفح Chromium حقيقي: `audit/phase1/restore-identity-browser.audit.mjs` ← `BROWSER CHECK: PASS` (سجل في `logs/restore-identity-browser.log`).
