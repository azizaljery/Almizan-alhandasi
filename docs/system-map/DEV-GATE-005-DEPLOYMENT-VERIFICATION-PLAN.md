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
- [x] تثبيت Commit المرشح وتسجيل SHA الكامل: `99b8f8b6ef51308e65c1aceff0349ec2fc6f0938` (Production code fix is in parent chain; `dist/index.html` fix commit `11f64ec42f04eac682bbfb76fded3fe55ea853f7`).
- [x] مراجعة Diff: إصلاح `dist/index.html` + Regression Test + CI verification workflow. لا تغييرات Worker/DB/Cron.
- [x] Targeted Regression PASS — workflow run `36705103180`.
- [x] Full Suite على مرشح `main`: `89/89 PASS — 0 FAIL` (أحدث Suite للمرشح بلا فشل؛ فرع التحكم سبق أن وصل 90/90 بعد اختبارات إضافية).
- [x] Production Build validation PASS — `node scripts/build.mjs` ضمن run `36705103180`.
- [x] الواجهة تبدأ افتراضيًا على دور واحد؛ مثبت بالاختبار المخصص.
- [x] Rollback Git target: `f3d23f937911443ec88a0c1645d9e129f08665ec`. Rollback Site target المرصود: source version `14`, projection revision `28`.
- [x] نافذة النشر: 2026-09-30. المنفذ المخطط: Production Site project `appgprj_6aa6d211421c8191ae8cb918a8cea058` / slug `al-mizan-al-handasi`.

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


## سجل التنفيذ الحالي — 2026-09-30

### Pre-Deploy Gate
```yaml
candidate_commit: 99b8f8b6ef51308e65c1aceff0349ec2fc6f0938
targeted_regression: PASS
full_suite: 89/89_PASS
build: PASS
rollback_git: f3d23f937911443ec88a0c1645d9e129f08665ec
rollback_site_source_version: 14
rollback_site_projection_revision: 28
go_no_go: GO_FOR_SITE_DEPLOYMENT
```

### Deployment execution
```yaml
status: BLOCKED_BY_MISSING_SITE_PUBLISH_ACTION_IN_CURRENT_TOOLING
production_state_changed: false
worker_changed: false
secrets_changed: false
db_changed: false
cron_changed: false
```

تم استكمال جميع عناصر ما قبل النشر المتاحة آليًا. النشر الفعلي إلى مشروع Sites الحالي لم يُنفذ لأن الأدوات المتصلة في هذه الجلسة لا تعرض إجراء نشر/تحديث مباشر لمشروع Sites المحدد. لا يتم تمثيل النشر كمنفذ قبل وجود دليل Deployment فعلي.
