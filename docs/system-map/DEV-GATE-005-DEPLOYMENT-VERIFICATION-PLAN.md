# خطة نشر إصلاح DEV-GATE-005 والتحقق منه

## الحالة المرجعية
- Development Gate: `PASS`
- Development: `UNBLOCKED FOR CONTROLLED DEVELOPMENT`
- Production: `BLOCKED`
- DEV-GATE-004: `BLOCKED` للإنتاج
- DEV-GATE-005: `FAIL` بسبب `ADDITIONAL_FLOORS_NOT_IMPLEMENTED`
- الإصلاح المحلي: `90/90 PASS`
- Baseline: `SMB-20260929-001` — مجمد ولا يُعدّل

## الهدف
نشر إصلاح جعل عدد الأدوار الافتراضي دورًا واحدًا، ثم إثبات نجاحه على Production دون رفع 005 إلى PASS قبل اكتمال الأدلة الحية.

## 1. ما قبل النشر
- [ ] تثبيت Commit المرشح وتسجيل SHA الكامل.
- [ ] مراجعة Diff وحصره في إصلاح 005 واختباره وتوثيقه، أو توثيق أي تغيير إضافي.
- [ ] إعادة Targeted Regression الخاص بعدد الأدوار.
- [ ] إعادة كامل الاختبارات: 90/90 PASS أو أحدث نتيجة بلا فشل.
- [ ] نجاح Production Build نظيف.
- [ ] التأكد أن الواجهة تبدأ افتراضيًا على دور واحد.
- [ ] تحديد الإصدار السابق ومعرفه كهدف Rollback.
- [ ] تسجيل نافذة النشر والمنفذ.

### Go / No-Go
النشر مسموح فقط عند نجاح الاختبار المخصص، الحزمة الكاملة، البناء، ومعرفة هدف Rollback وعدم وجود تغييرات غير مراجعة.

## 2. النشر المتحكم به
- [ ] النشر من Commit المثبت فقط.
- [ ] تسجيل Build Run ID وDeployment ID/Version وTimestamp.
- [ ] حفظ سجلات النشر.
- [ ] عدم تغيير DB أو Cron أو إعدادات غير لازمة.
- [ ] إبقاء Production = `BLOCKED_PENDING_VERIFICATION`.

## 3. Smoke Verification
- [ ] HTTP 200.
- [ ] تحميل Desktop وMobile.
- [ ] لا Page/Console errors حرجة.
- [ ] لا Network failures حرجة.
- [ ] تثبيت هوية النسخة الحية بقدر ما تسمح المنصة.

## 4. إعادة اختبار سبب الفشل
- [ ] فتح تدفق التوليد الافتراضي دون تعديل عدد الأدوار.
- [ ] إثبات أن القيمة الظاهرة والمُرسلة هي دور واحد.
- [ ] نجاح التوليد.
- [ ] عدم ظهور `ADDITIONAL_FLOORS_NOT_IMPLEMENTED`.
- [ ] Screenshots قبل وبعد التوليد.
- [ ] Console وNetwork logs للتدفق.
- [ ] تكرار السيناريو على Desktop وMobile.

## 5. التحقق الوظيفي المرتبط
- [ ] 2D PASS.
- [ ] 3D PASS.
- [ ] 3D openings PASS.
- [ ] BOQ PASS.
- [ ] Save/Restore PASS.
- [ ] Project Persistence بعد Refresh PASS.
- [ ] اختبار إدخال دورين عمدًا: رسالة واضحة، بلا Crash أو نجاح زائف.
- [ ] عدم تغير حدود AZIZ/Mizan Score وRECT/L/U.

## 6. قرار DEV-GATE-005
### PASS
يُمنح فقط إذا كانت النسخة المنشورة محددة، التوليد الافتراضي ناجحًا على Desktop وMobile، الخطأ غائبًا، ولا أخطاء حرجة، واجتازت 2D/3D/BOQ/Save-Restore، واكتملت حزمة الأدلة.

### FAIL
إذا ظهر العطل الأصلي أو Regression حرج مثبت.

### BLOCKED
إذا تعذر الحكم بسبب نقص البيئة أو الأدلة، لا بسبب فشل وظيفي مثبت.

## 7. Rollback
يبدأ فورًا عند فشل التحميل أو التوليد أو ظهور Regression/أخطاء حرجة أو عدم تطابق الإصدار.
- [ ] إعادة الإصدار السابق المحدد.
- [ ] تسجيل Rollback ID والوقت والسبب.
- [ ] التحقق من HTTP 200 والتدفقات الأساسية.
- [ ] إبقاء Production = BLOCKED.

## 8. حزمة الأدلة
- [ ] Commit SHA.
- [ ] نتائج Targeted Regression وFull Suite.
- [ ] Build logs.
- [ ] Deployment/Run ID وTimestamp.
- [ ] Screenshots Desktop/Mobile.
- [ ] Console/Page/Network logs.
- [ ] نتائج 2D/3D/BOQ/Save-Restore/Persistence.
- [ ] نتيجة الاختبار السلبي للدورين.
- [ ] قرار PASS/FAIL/BLOCKED ومبرراته.
- [ ] دليل Rollback إن استُخدم.

## الحالة حتى اكتمال التحقق
```yaml
Development: UNBLOCKED_FOR_CONTROLLED_DEVELOPMENT
Production: BLOCKED
DEV-GATE-004: BLOCKED
DEV-GATE-005: FAIL_PENDING_DEPLOY_AND_RETEST
Baseline: SMB-20260929-001_FROZEN
```
