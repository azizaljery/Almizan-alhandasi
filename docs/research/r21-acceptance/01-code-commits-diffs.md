# 01 — الفروق الكاملة وقائمة الإيداعات والملفات والدوال

الفرع: `dev/stage2-r21-proposal-c6-site` (من `2992802`). الأساس المرجعي للفروق: `2bfcd9e` (رأس فرع المقترح قبل الحزمة الثانية). لا دمج في `dev/stage2-r21` ولا `dev/architect-v2` ولا `deploy`/`main`، ولا نشر. لم يُعدَّل `docs/research/arch-difference-criterion-r19.md` ولا `dist/arch-criterion.mjs` ولا AZIZ ولا Mizan Score. **الإيداعان الجديدان في هذه الجولة (`8adf8bf` و`4161910`) لا يمسان محركات v1/v2/v3**؛ أما تعديلات `villa-layout-v2/v3.mjs` الأقدم فمن إيداعات 02c/01b المعروضة سابقًا للمراجعة (القائمة أدناه).

## الفروق الكاملة (diff كامل لا ملخص) — المجلد `diffs/`

| الملف | المحتوى |
|---|---|
| `diffs/02c-full.diff` | كل إيداعات 02c (الشيفرة والاختبارات والسكربتات بلا الأدلة) بالترتيب، **مع الجديد**: `8adf8bf` و`4161910` |
| `diffs/01b-full.diff` | كل إيداعات 01b |
| `diffs/shared-tests.diff` | `2e5a16a`: اختبارات مشتركة (21 اختبارًا) وأداة ملخص المصفوفة |
| `diffs/owner-decision-c6-site-only.diff` | الجديد وحده بعد `2992802` (قرار المالك على الساتر) |
| `diffs/cumulative-vs-2bfcd9e.diff` | الفرق التراكمي كله `2bfcd9e..HEAD` (شيفرة/اختبارات/سكربتات) |

(وبقي `../r21-proposal/02c-clear-dims-privacy-evidence.diff` و`01b-shared-brief-maqlat.diff` كما سُلِّما مقابل `2bfcd9e` قبل الجديد.)

## الإيداعات: الملفات والدوال المصدَّرة المضافة (`+export`)

```
## 2cae32d 02c (قرار المالك 2026-10-26): بوابة الأبعاد الصافية بعد التفصيل — الصندوق والمستطيل الصافي معًا عند أضيق موضع (dist/clear-dims.mjs مكيَّف من clear-dimensions.mjs في الحزمة على الوجوه الداخلية للمستند)، والسجل يحمل المقيس والصندوق والانحراف؛ الهندسة غير المتعامدة «لم يُتحقق»؛ DIM_TOL نُقل بلا تغيير؛ مفتاح القياس r21clear؛ وأداة kit2-case للأدلة
  dist/clear-dims.mjs   | 143 ++++++++++++++++++++++++++++++++++++++++++++++++++
  dist/requirements.mjs |   3 +-
  dist/rules.mjs        |  40 ++++++++++----
  scripts/kit2-case.mjs |  40 ++++++++++++++
  4 files changed, 216 insertions(+), 10 deletions(-)
  exports+: DIM_TOL TOLERANCE_POLICY toleranceFor cleanRing isOrthogonal clearRectangles measureClearDims deviationAr clearSpanFromCentrelines docRooms 
## 558d6c8 02c: الأعمدة المرسومة (doc.columns) جزرٌ ممنوعة في المستطيل الصافي لبند المقاس
  dist/rules.mjs | 8 +++++++-
  1 file changed, 7 insertions(+), 1 deletion(-)
  exports+: 
## f75aafd 02c (قرار المالك: إصلاح تراجع C6 دون إفساد المقاسات): ساتر خصوصية خارجي لنافذة الصالة الوحيدة المطلة على المواقف — dist/privacy-gate.mjs مكيَّف من privacy-gate.mjs في الحزمة (خطوط رؤية بعينات متعددة من المواقف وداخل الغرفة، وجدران المبنى تحجب، والأسوار بارتفاعها؛ وcompareAcceptance قبل/بعد على فاحصات المشروع الأصلية للخصوصية والضوء والتهوية والحركة)؛ يُقبل الساتر فقط إن حجب كل الخطوط واجتاز WINDOW_PARKING الأصلي ولم يُسقط فحصًا ناجحًا؛ والسور عنصر موقع في بوابتي PLOT/SETBACK_REG (داخل الأرض لا داخل ارتداد المبنى)؛ وسبب عدم قبول تكبير الصالة في سجل التشخيص
  dist/plan-review.mjs     |  10 ++--
  dist/privacy-gate.mjs    | 150 +++++++++++++++++++++++++++++++++++++++++++++++
  dist/r16-polish.mjs      |  32 +++++++++-
  dist/villa-layout-v2.mjs |   7 ++-
  4 files changed, 191 insertions(+), 8 deletions(-)
  exports+: SCREEN_DEFAULTS segmentHit screenWindowPrivacy bayPoints interiorPoints windowGeometry windowExposure acceptanceSnapshot compareAcceptance planWindowScreen 
## f67336a 02c (حزمة المالك review-evidence): سبب مُهيكل بالحقول الموحدة لكل حجب (candidateId/stage/rule/source/reason/measured/limit/unit) بأرقام من الفاحص الحقيقي — قيمة بوابة المراجعة (H2: 1 موقف من 2 مطلوب نظاميًا) وبند السجل (الضلع الأسوأ عند أضيق موضع)، وnull مع سبب صريح لغير الرقمي؛ وأسباب رفض المرشحين أثناء البحث من قيم بواباتهم؛ وclassifyRun على عقد النتائج القائم (SOLVED فقط ببديل صالح معروض، والمحجوب كله SEARCH_INCOMPLETE/ONLY_HIDDEN_ALTERNATIVES، وoutcome بالحالات الثلاث)
  dist/presentation-status.mjs |  17 ++++---
  dist/review-evidence.mjs     | 103 +++++++++++++++++++++++++++++++++++++++++++
  dist/villa-layout-v2.mjs     |  14 ++++--
  dist/villa-layout-v3.mjs     |   8 +++-
  4 files changed, 131 insertions(+), 11 deletions(-)
  exports+: STAGES rejection assertBlocked gateEvidence ledgerEvidence classifyRun clientNotice candidateRejections 
## a5908f7 02c (قرار المالك خامسًا: الصالة بمقاس صريح قيد أثناء التوليد): ورقة الصالة في شجرة الأرضي تحمل مقاسها (P.hallDim) فتُثبَّت على محور قطعها في solve كذوات المقاس (fixExtOf/dimTolOf)، واتجاهها متغير بحث (dimO)، والمحور الآخر بجزاء التقييم، والحكم بالمستطيل الصافي بعد التفصيل؛ مفتاح القياس r21halldim
  dist/villa-layout-v2.mjs | 14 ++++++++++++--
  1 file changed, 12 insertions(+), 2 deletions(-)
  exports+: 
## d845450 02c (قرار المالك ثالثًا: نطاقات عمق الحمام تفضيل بحث): dist/bath-band.mjs مكيَّف من bath-band.mjs في الحزمة — حمام الجناح يُقيَّم بفاحصات المشروع الموجودة (الأجهزة داخل وجوهه: مرحاض ومغسلة ودش/حوض، وفتح الباب swingBlockers، والعرض الصافي MIN_CLEAR_WIDTH، والتهوية نافذة أو ميكانيكية، والسباكة «لم يُتحقق»)، وما لم يتسع ملاحظة صريحة مع البديل (لا بوابة: لم يُعاير حجبًا)
  dist/bath-band.mjs           | 46 ++++++++++++++++++++++++++++++++++++++++++++
  dist/presentation-status.mjs |  8 ++++++++
  2 files changed, 54 insertions(+)
  exports+: BATH_DEPTH_PREFERENCES evaluateBath evaluateSuiteBaths 
## 8adf8bf 02c: الساتر عنصر موقع — حدود القطعة، المركبات، المداخل، الإضاءة والتهوية، ارتفاعات العين، ووسم «تحتاج تحققًا نظاميًا»
  dist/design.mjs              |  2 +
  dist/presentation-status.mjs | 12 +++++-
  dist/privacy-gate.mjs        | 42 +++++++++++++++----
  dist/r16-polish.mjs          |  6 ++-
  dist/site-element-check.mjs  | 98 ++++++++++++++++++++++++++++++++++++++++++++
  5 files changed, 147 insertions(+), 13 deletions(-)
  exports+: REG_VERIFY_AR SCREEN_DEFAULTS screenWindowPrivacy requiresLightOrAir bayApproach SITE_DEFAULTS siteElementReport 
## 4161910 02c: قياس C6 قبل/بعد (عنصر موقع)، اختبارات الساتر، وسم التحقق النظامي
  dist/presentation-status.mjs      |  2 +-
  scripts/c6-site-measure.mjs       | 34 ++++++++++++++++
  scripts/kit2-case.mjs             |  2 +-
  tests/stage2-r21-c6-site.test.mjs | 84 +++++++++++++++++++++++++++++++++++++++
  4 files changed, 120 insertions(+), 2 deletions(-)
  exports+: 
## f8cbbef 01b (قرار المالك: الحالات الثلاث منفصلة): نص العميل حين لا يُعرض شيء — بديل مكتمل محجوب لمخالفة أساسية ≠ لا بديل مكتمل، وكلاهما «لا يثبت أن طلبك مستحيل»؛ لا يُنقل «عُرض 1 من 4» والمعروض صفر؛ والعدد في الواجهة من المعروض الصالح لا المحجوب؛ وأداتا القياس kit2-case وkit2-matrix-run
  dist/client-text.mjs       | 13 +++++++++++--
  dist/design.mjs            |  2 +-
  scripts/kit2-case.mjs      |  2 +-
  scripts/kit2-matrix-run.sh | 17 +++++++++++++++++
  4 files changed, 30 insertions(+), 4 deletions(-)
  exports+: 
## eb92c3a 01b (قرار المالك: توحيد «مجلس رجال بمقلط»): قراءة واحدة لعلاقة المجلس بالطعام (shared-brief.mjs readGuestRelations) يستدعيها المحلل فتُحفظ قيودًا مهيكلة بمصدرها واقتباسها في requirements.relations ويبني منها العقد — «مقلط» وظيفة طعام للضيوف مرتبطة بالمجلس (GUEST_ACCESS، الباب والغرفة المنفصلة unspecified) لا باب؛ الباب المباشر من نص صريح فقط (briefMajlisDoor = DIRECT_DOOR)، و«قريب» NEAR؛ والمراجع (saudi-program clientAsks MAJLIS_DINING/SERVE_ROUTE) يقرأ العقد لا تعبيرًا مستقلًا؛ «مجلس رجال بمقلط» صار مفهومًا (كان في unclear)؛ canonicalBrief/assertSharedBrief من الحزمة وbriefOf مرة واحدة لكل طلب؛ مفتاح القياس r21maqlat
  dist/requirements.mjs  | 12 ++++++++----
  dist/saudi-program.mjs |  7 +++++--
  dist/shared-brief.mjs  | 47 ++++++++++++++++++++++++++++++++++++-----------
  3 files changed, 49 insertions(+), 17 deletions(-)
  exports+: SHARED_BRIEF_VERSION readGuestRelations briefOf canonicalBrief assertSharedBrief briefMajlisDoor briefGuestDining 
## b656530 01b (H3 من جهة البحث): الشبكات الأربع الأولى كما كانت، وإن قلّت التوزيعات الصالحة فيها عن 8 تُجرَّب حتى أربع شبكات تالية بالقيود الصلبة والميزانية نفسها (حتمي، لا يمس ما وجد توزيعاته)؛ مفتاح القياس r21grids — على H3 وجد 26 توزيعًا في 4×3 لكن 11 من 14 تنظيمًا لا تتسع بأدنى أبعادها في عرض 21.5 م، فلم يتغير الناتج
  dist/villa-layout-v3.mjs | 15 +++++++++++----
  1 file changed, 11 insertions(+), 4 deletions(-)
  exports+: gridShapes 
## c0ab145 01b: تحديث اختباري 01 لقرار المالك («مقلط» وظيفة طعام للضيوف لا باب)، ووثيقة المطابقة kit2-mapping.md؛ npm test على الرأس: 1506/1506 ناجح (18.9 دقيقة)
  tests/stage2-r21-proposal.test.mjs | 10 ++++++----
  1 file changed, 6 insertions(+), 4 deletions(-)
  exports+: 
## 2e5a16a 02c/01b: اختبارات عقد الحزمة مكيَّفة على وحداتنا واختبارات القرار الثالث (أضيق موضع، وسماكات متغيرة، وغرف L ودرجة 6.5 سم، والتدوير، والأعمدة، والصالة والرئيسية، وH10، وC6 خصوصية/ضوء/تهوية/حركة، وحمام الجناح، وH2 بالمقيس والحد، والمقلط، والعقد الواحد، وH3 بلا مخطط)؛ وتحديث اختبار 02b (10) للحقول الموحدة؛ وأداة ملخص المصفوفة
  scripts/kit2-matrix.mjs           |  37 ++++++
  tests/stage2-r21-02b.test.mjs     |   6 +-
  tests/stage2-r21-02c-01b.test.mjs | 245 ++++++++++++++++++++++++++++++++++++++
  3 files changed, 286 insertions(+), 2 deletions(-)
  exports+: 
```

## الدوال المعدَّلة في ملفات قائمة (من رؤوس مقاطع الفرق؛ تقريبية بحسب أقرب تعريف سابق)

- `dist/rules.mjs`: `verifyRequest` (بند «D-…» يستدعي `measureClearDims`)، `docRooms` (`net` والأعمدة ثقوبًا).
- `dist/requirements.mjs`: `extractRequirements`، `sharedOf`، تخزين `relations`.
- `dist/plan-review.mjs`: `evaluateGates0` — بوابتا PLOT وSETBACK_REG: السور عنصر موقع (حدود القطعة لا الارتداد).
- `dist/presentation-status.mjs`: `presentationStatus` (الأسباب الموحدة، وسم «تحتاج تحققًا نظاميًا»، `regulatory_ar`، `siteElements`، `bathNotes`).
- `dist/design.mjs`: `statusCard` (يعرض بند التحقق النظامي)، `altsCard` (العدد من البدائل الصالحة المعروضة).
- `dist/r16-polish.mjs`: `polishR16` (ساتر الخصوصية يُقبل فقط بحجب خطوط الرؤية + WINDOW_PARKING + compareAcceptance + `siteElementReport.geometryOk`).
- `dist/client-text.mjs`: `shortfallNotice`. `dist/saudi-program.mjs`: `clientAsks`. `dist/shared-brief.mjs`: `buildSharedBrief`، `sharedReviewRequest`.
- `dist/villa-layout-v2.mjs` (سابق، بلا جديد هنا): `programV2`، `fixExtOf`، `refineHall`، `candidates`، `withPresentation`، `compactReview`، `measureRequest`.
- `dist/villa-layout-v3.mjs` (سابق): `attach`، `fail`، `gridShapes`، `synthTrees`.

## الجديد في هذه الجولة (ملف/دالة)

- `dist/site-element-check.mjs` (جديد): `siteElementReport(doc,{levelId})` و`SITE_DEFAULTS` — حدود القطعة، ارتداد المبنى (لا ينطبق)، هامش الموقف وممر دخوله (`BAY_CLEARANCE`، `BAY_APPROACH`)، مقدمة الأبواب الخارجية ومسار الدخول (`DOOR_FRONT`، `ENTRY_PATH`)، مجال فتح النافذة وزاوية الحجب، والاشتراط النظامي «غير متحقق» عبر `unverifiedCheck`.
- `dist/privacy-gate.mjs`: `screenWindowPrivacy` يقبل `eyes` (ارتفاعات عين خارجية/داخلية؛ ارتفاع الخط عند النافذة وعند الساتر)، `planWindowScreen` يرفض الساتر القريب من نافذة مأهولة أو موقف أو ممر دخوله، و`requiresLightOrAir` و`bayApproach` (مصدَّرتان)، `SCREEN_DEFAULTS.eyes/windowClear/bayClear`.
- `dist/presentation-status.mjs`: `REG_VERIFY_AR`، حقول `needsRegulatoryVerification`/`regulatory_ar`/`siteElements`. مفتاح إيقاف القياس: `R14_OFF=r21site`.
- أدوات قياس (لا تغيّر سلوكًا): `scripts/c6-site-measure.mjs`، `scripts/r21-regression-report.mjs`، `scripts/r21-dev-case.mjs`. اختبارات: `tests/stage2-r21-c6-site.test.mjs` (11).
