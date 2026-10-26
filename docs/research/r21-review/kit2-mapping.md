<div dir="rtl">

# مطابقة حزمة المالك الثانية (kit-r21-02b-01) بشيفرة المستودع — الخطوة الأولى

> **حالة:** مقترح للمراجعة، غير معتمد وغير مدموج. الفرع `dev/stage2-r21-proposal` فوق `2bfcd9e`. الحزمة في `docs/owner/kit-r21-02b-01/` (34/34 من اختباراتها المحلية). القرار الملزم: `docs/owner/decision-r21-02b-01-2026-10-26.md`. لم تُنسخ ملفات الحزمة إلى `dist/`: كل وحدة رُبطت بالدالة الحقيقية المقابلة بمهايئ، أو نُقل منطقها إلى الوحدة الصحيحة. بذرة التقييم وH11–H15 لم تُشغَّل.

**التصنيف:** «مغطى» = موجود في `2bfcd9e` بالمعنى نفسه فلم يُعَد؛ «تكييف» = منطق الحزمة رُبط بدالة قائمة أو عُدّل ليقرأ المستند/العقد الحقيقي؛ «جديد» = لا مقابل له قبل هذه الجولة.

## 1) `src/clear-dimensions.mjs` ← 02c

| دالة الحزمة | مقابلها في المستودع (الملف:الدالة) | القرار | السبب |
|---|---|---|---|
| `validateClearDimensions` | `dist/clear-dims.mjs:measureClearDims` يستدعيها `dist/rules.mjs:verifyRequest` (بند «D-…»، كان يقيس الصندوق `x0..x1` وحده) | **تكييف** | الشرطان معًا كما في الحزمة (الصندوق ضمن السماحية + مستطيل صافٍ يبلغ المطلوب)، لكن على `net` و`holes` من `analyzeDoc` بدل مضلع يمرره المستدعي، ويعيد المستطيل المختار (أضيق موضع) والانحراف بإشارته ليكتبهما السجل. الهندسة غير المتعامدة تعيد `applicable:false` ⇐ «لم يُتحقق» في السجل (الحزمة ترمي استثناء؛ الرمي داخل السجل كان سيُسقط البديل كله). |
| `enumerateClearRectangles` / `largestClearRectangle` | `clear-dims.mjs:clearRectangles` | **تكييف** | الخوارزمية نفسها (شبكة إحداثيات الرؤوس + مجاميع تراكمية)، مع قطع البحث حين يشمل التوسيع خلية محجوبة؛ واختيار المستطيل **الأنسب للمقاس** (أعظم أسوأ نسبة) لا الأكبر مساحة — وهو ما يفترضه اختبار الحزمة الأخير. |
| `pointInPolygon` / `orthogonal` | `clear-dims.mjs:isOrthogonal` + `cleanRing` | **تكييف** | `insetPolygon` (dist/draw/geom.mjs) يُبقي نقاط درجة على استقامة واحدة؛ تُزال قبل فحص التعامد وإلا عُدّت الغرفة غير متعامدة خطأً. |
| `toleranceFor` | `requirements.mjs:DIM_TOL` / `tolOf` (02b) ⇐ نُقل التعريف بقيمه نفسها إلى `clear-dims.mjs:DIM_TOL` ويُعاد تصديره | **مغطى + تكييف** | السماحيات كانت موجودة (±0.03/±0.05/±0.30)؛ نُقل المصدر الواحد لتفادي حلقة استيراد، وأُضيف `toleranceFor` و`TOLERANCE_POLICY` (سياسة تشغيل قابلة للضبط ومصدرها مكتوب). |
| `clearSpanFromCentrelines` | `villa-layout-v2.mjs:wallPair` + `dimPlan` (02b) | **مغطى** | الامتداد على المحاور = الصافي + نصف سماكة كل طرف بنوعه يُحسب في `solve` منذ 02b. أُضيفت الدالة إلى `clear-dims.mjs` للاختبار فقط ومكتوب أنها للمحاور وحدها. |
| — (مرجع الإحداثيات) | `dist/draw/topology.mjs` الخطوة 6: `net = insetPolygon(poly, t/2)` | **إثبات** | جدران المستند محاور، و`net` الوجوه الداخلية المنتهية؛ فالفحص يأخذ `net` كما هو ولا يخصم نصف سماكة مرة ثانية. |
| — (الجزر) | `rules.mjs:docRooms({net:true})` + `colHoles` | **جديد** | جزر الفراغ (`space.holes`) والأعمدة المرسومة (`doc.columns`) ممنوعة في المستطيل الصافي. |
| تثبيت الامتداد (ليس في الحزمة) | `villa-layout-v2.mjs:solve`/`programV2`/`dimPlan` (02b) | **مغطى، لم يُمس** | القرار: «يبقى تثبيت الامتدادات من 02b»؛ الفحص بوابة بعد `realizeV2` لا مولّد هندسة. |
| الصالة بمقاس صريح | `villa-layout-v2.mjs:programV2` (`P.hallDim`) + `fixExtOf`/`dimTolOf` + `tagHallDim` في `candidates` + `dz` في `optimizeSteps` | **جديد** | الصالة ورقة حركة (`C('hall')`) لا كتلة؛ تُحمل مقاسها كتلة افتراضية فتُثبَّت ورقتها على محور قطعها كذوات المقاس. |

## 2) `src/privacy-gate.mjs` ← 02c (C6)

| دالة الحزمة | مقابلها | القرار | السبب |
|---|---|---|---|
| `segmentHit` | `dist/privacy-gate.mjs:segmentHit` (و`geom.mjs:segmentIntersection` قائم) | **تكييف** | الصيغة نفسها؛ أبقيتها لتطابق عقد الحزمة في الاختبار. |
| `screenWindowPrivacy` | `privacy-gate.mjs:screenWindowPrivacy` + `windowGeometry`/`bayPoints`/`interiorPoints`/`windowExposure` | **تكييف** | النقاط من المستند: أركان كل موقف ومنتصفات أضلاعه ومركزه، ونقاط داخل الصالة على أعماق 0.6/1.5/3 م وانحرافات 0/±1/±2 م داخل وجوهها، والحواجب جدران «سور» بارتفاعها، و**جدران المبنى الأخرى تحجب** (لا تفعله الحزمة). |
| `compareAcceptance` | `privacy-gate.mjs:compareAcceptance` + `acceptanceSnapshot`؛ والقائم `change-guard.mjs:guarded/regressions` (r20) | **تكييف** | الحماية بالفئة أو المعرف على **فاحصات المشروع الأصلية**: الخصوصية (`measureR16` كلها)، والضوء (نافذة لكل غرفة مأهولة + `NO_WINDOW`)، والتهوية (نافذة تُفتح + `BATH_NO_WINDOW`)، والحركة (`UNREACHABLE_ROOM` + مقدمة كل باب خارجي خالية من الأسوار). `guarded` القائم يبقى حول الصقل كله. |
| (معالجة C6) | `r16-polish.mjs:polishR16` فرع «الصالة نافذتها العادية الوحيدة» (كان يُبقيها ويكتب «يُستحسن سور حاجب») + `privacy-gate.mjs:planWindowScreen` | **جديد** | ساتر خارجي قائم بذاته موازٍ للجدار، طوله من خطوط الرؤية الفعلية؛ يُقبل بالشروط الثلاثة (خطوط الرؤية، و`WINDOW_PARKING` الأصلي، ولا تراجع). لا عتبة 1.64 م. |
| — | `plan-review.mjs` بوابتا `PLOT` و`SETBACK_REG` | **تكييف (تصحيح نطاق)** | السور عنصر موقع لا مبنى: يُقاس داخل حدود الأرض لا داخل خط ارتداد المبنى (كما في `site-parking.mjs`)؛ لا يمس أي جدار مبنى. قرار للمالك (review-02c.md §2). |

## 3) `src/review-evidence.mjs` ← 02c (الأدلة) و01b (الحالات الثلاث)

| دالة الحزمة | مقابلها | القرار | السبب |
|---|---|---|---|
| `rejection` | `dist/review-evidence.mjs:rejection`؛ و`presentation-status.mjs:hiddenReasons` (02b) | **تكييف** | 02b كان يحمل المرشح والمرحلة والقاعدة والمصدر، والمقيس كائنًا أو `null` لبوابات المراجعة. الآن الحقول الموحدة للحزمة (`candidateId/stage/rule/source/reason/measured/limit/unit`) بأرقام من الفاحص الحقيقي، والتفصيل القديم في `measuredDetail/limitDetail`. |
| (المقيس والحد) | `review-evidence.mjs:gateEvidence` (من `value`/`threshold` في `plan-review.mjs:gateResult`)، `ledgerEvidence` (من بند السجل) | **جديد** | لكل بوابة رقمية مصدر رقمها (المواقف: `bays` مقابل `required`؛ الارتداد: `maxOverrun` مقابل سماحية 2 سم؛ النسب…)، وغير الرقمي `null` مع `measure_ar` صريح. |
| `assertBlocked` | `review-evidence.mjs:assertBlocked` | **تكييف** | يقبل حالة العرض `hidden` كذلك؛ يُستعمل في الاختبارات والأدوات لا في مسار العرض (الرمي هناك كان سيقلب الحجب إلى عرض عبر `catch` في `withPresentation`). |
| `classifyRun` | `review-evidence.mjs:classifyRun` مربوطة في `villa-layout-v2.mjs:withPresentation` (`out.run`) و`villa-layout-v3.mjs:attach`/`fail` (`out.result`) | **تكييف على عقد 03** | لا عقد ثانٍ: `SOLVED` / `PROVEN_INFEASIBLE` (بشهادة يقبلها `certificates.mjs`) / `SEARCH_INCOMPLETE` كما في 03، ومعها `outcome` بالحالات الثلاث. `PROVEN_CONFLICT` في الحزمة = `PROVEN_INFEASIBLE` عندنا. تغيّر واحد: بدائل كلها محجوبة لم تعد `SOLVED` (صارت `SEARCH_INCOMPLETE/ONLY_HIDDEN_ALTERNATIVES`). |
| `clientNotice` | `client-text.mjs:shortfallNotice` (القائم) + `review-evidence.mjs:clientNotice` (للعقد) | **تكييف** | النص القائم صار يفرّق «بديل مكتمل محجوب» عن «لا بديل»، ولا ينقل «عُرض 1 من 4» والمعروض صفر، ويقول «لا يثبت أن طلبك مستحيل». |
| (رفض المرشح) | `review-evidence.mjs:candidateRejections` على `rejected[]` في v2 (و`gateEv` عند رفض المراجعة) | **جديد** | الحالة الأولى (مرشح رُفض أثناء البحث) لها سببها المُهيكل في السجل الداخلي. |

## 4) `src/shared-brief.mjs` ← 01b

| دالة الحزمة | مقابلها | القرار | السبب |
|---|---|---|---|
| `canonicalBrief` | `dist/shared-brief.mjs:briefOf` (01) ⇐ `canonicalBrief = briefOf` مع ذاكرة لكل طلب | **مغطى + تكييف** | العقد الموحد موجود منذ 01؛ أُضيفت الذاكرة فيأخذ المستدعي القديم الكائن نفسه للمولّد والمراجع. |
| `assertSharedBrief` | `shared-brief.mjs:assertSharedBrief` | **جديد (اسم الحزمة)** | تحقق الهوية (الكائن نفسه) في الاختبار: `programV2().brief === sharedReviewRequest().brief`. |
| `hasGuestDining` + قراءة «مقلط» | `shared-brief.mjs:readGuestRelations` يستدعيها `requirements.mjs:extractRequirements` (`relations` قيود مهيكلة بمصدرها واقتباسها) ويبني منها `buildSharedBrief`؛ و`briefGuestDining` | **تكييف** | قراءة واحدة: «مقلط» = `GUEST_ACCESS` وظيفة طعام للضيوف مرتبطة بالمجلس (`directDoor/separateRoom: 'unspecified'`)؛ كانت في `unclear` عند المحلل ويقرؤها المراجع بابًا. |
| (الباب المباشر) | `shared-brief.mjs:briefMajlisDoor` (كان DIRECT_DOOR **أو** GUEST_ACCESS) | **تكييف** | الباب من نص صريح فقط. |
| (إعادة التفسير المستقلة) | `saudi-program.mjs:clientAsks` `MAJLIS_DINING`/`SERVE_ROUTE` (تعبيرات مستقلة على النص: «مقلط» و«جنب الطعام» بابًا) | **تكييف** | يقرأ العقد (`briefMajlisDoor(briefOf(request))`). |

## 5) `src/bath-band.mjs` ← 02c

| دالة الحزمة | مقابلها | القرار | السبب |
|---|---|---|---|
| `BATH_DEPTH_PREFERENCES` | `villa-layout-v2.mjs:SUITE_TD_RANGE`/`SUITE_T_RANGE` (02b) | **مغطى** | النطاقات نفسها (الرئيسية أوسع هناك) ومستعملة في البحث وحده. |
| `evaluateBath` | `dist/bath-band.mjs:evaluateBath` | **تكييف** | للاختبار والعقد. |
| (الوظائف) | `bath-band.mjs:evaluateSuiteBaths` على المستند: `swingBlockers` (draw/review.mjs)، `MIN_CLEAR_WIDTH.bath` (plan-review.mjs)، الأجهزة في `doc.fixtures`، النافذة | **جديد** | ملاحظة مع البديل لا بوابة (لم يُعاير حجبًا)؛ السباكة «لم يُتحقق». |

## 6) ما لم يُكيَّف ولماذا

- `src/index.mjs` و`package.json` في الحزمة: تجميع للحزمة وحدها؛ لا مقابل.
- إطار `classifyRun({candidates})` بحقل `status:'ready'|'blocked'`: حالة العرض في المستودع `ready/needs-edits/hidden`؛ «يحتاج تعديلات» بديل صالح معروض (ليس محجوبًا) — فالتصنيف على `presentation.status`.

</div>
