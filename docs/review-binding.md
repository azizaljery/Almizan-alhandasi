# ربط المراجعة بالمخططات (الميزان)

> مراجعة آلية أولية؛ الاعتماد التنفيذي يحتاج المهندس المختص. لا يشمل الأحمال والأساسات والتسليح.

أرقام الأسطر من فرع `feat/v-review` عند كتابة الوثيقة.

## 1. ما هو ربط عزيز الحالي (قبل هذا العمل)

| البند | الوصف | الملف/السطر |
|---|---|---|
| ما يُستدعى | `runPipeline` ثم `decideReviewed` ثم `reviewCandidate` (مغلّف مرشح صارم CandidateEnvelope) | `dist/integration/pipeline.mjs:239`, `:163`, `:248` |
| أين يُنادى | من `runMultiEngineDesign` فقط عند دور واحد؛ ومنه من `home-flow` (توليد أول) و`app` و`layout-worker` | `dist/multi-engine.mjs:108`, `dist/home-flow.mjs:342`, `dist/app.mjs:826`, `dist/layout-worker.mjs:6` |
| ما يأخذه | طلب DesignRequest (أرض، برنامج غرف، قيود) + مرشح مولَّد من محرك الشبكة (rect/l/u) | `pipeline.mjs:115` |
| ما ينتجه | قرار `SELECTED_PRELIMINARY` أو `NEEDS_CLARIFICATION` مع أسباب | `pipeline.mjs:163` |
| كيف يُعرض | رسالة خطأ في صفحة التطبيق القديم، وأثر البحث في `state.multiEngine`؛ لا يُعرض لمخطط فيلا محرَّر | `dist/app.mjs:858` |
| لا يراجع مستند mizan-draw | المغلّف يشترط `corridorId` لكل غرفة؛ مستند الفيلا لا يحمل ممرات بهذا المعنى فلا يمكن بناؤه دون اختلاق روابط | `adaptCandidateEnvelope` في حزمة التكامل |

## 2. أين ولماذا يرفض أدوارًا متعددة

| الموضع | السلوك | ملاحظة |
|---|---|---|
| `dist/integration/pipeline.mjs:54` | `if (r.plot.floorsRequested !== 1) reasons.push('ADDITIONAL_FLOORS_NOT_IMPLEMENTED')` فيصير القرار NEEDS_CLARIFICATION | المولّد يرسم دورًا واحدًا بتصميمه |
| `dist/multi-engine.mjs:108` | `plot.floors !== 1` يتخطى المسار ويمرّ بنص الرفض | |
| `dist/multi-engine.mjs:186` | يُستبدل الرمز بجملة «يرسم الدور الأرضي فقط» | |
| محرك الفيلا | `generateVillaDesigns` / `generateVillaTwoFloors` (`dist/villa-layout.mjs:2585-2586`) و`generateTwoFloors` (`dist/multi-floor.mjs:127`) لا يمرّان بعزيز إطلاقًا | فمستند الدورين لم يُراجَع بعزيز أبدًا |

الإجراء: رفض **التوليد** لأكثر من دور بقي كما هو (اختبار يثبت بقاءه). ما تغيّر أن **المراجعة** لم تعد ترفض: `dist/integration/aziz-levels.mjs` يستدعي مقيِّم القيود الصلبة في عزيز نفسه (`evaluateHardConstraints`: صلاحية المضلعات، تراكب الغرف، خروج الغرفة عن حدود المبنى) لكل دور على حدة، محليًا بلا شبكة. ثم `reviewLevelRelations` في `dist/design-review.mjs` تقيس العلاقات بين الأدوار.

## 3. جرد المسارات (قبل وبعد)

| المسار | هل كان يُراجَع | بأي أداة | الفجوة | الملف/السطر بعد الربط |
|---|---|---|---|---|
| توليد أول | لا (عزيز يُنادى لدور واحد فقط في التطبيق القديم، ومستند الفيلا لا) | `scoreDesign`/`checkDoc` للدرجة فقط | لا تقرير مربوط بنسخة، لا تقييد للاعتماد | `design-session.mjs:74` |
| بدائل (`extendSession`/`redesign` تلقائي) | لا | درجات فقط | كالسابق | `design-session.mjs:171` (route=alternative) |
| دمج | لا | لا شيء بعد الدمج | الدمج يغيّر الهندسة دون مراجعة | `design-session.mjs:248` |
| تعديل يدوي في الجلسة (تحسين/أوامر) | لا | `checkDoc` عند الطلب | التعديل لا يُبطل أي تقرير | `design-refine.mjs:300`, `design-lock-edit.mjs:355,454` |
| محادثة (إصلاح، قرار الملاءمة، إضافة غرفة، نص حر) | لا | `fixProposals` | لا مراجعة بعد التنفيذ | `design-fixes.mjs:111,150`, `design-lock-edit.mjs:427`, `design-session.mjs:171` (route=chat) |
| المرسم (`studio.html`) | جزئيًا (`reviewDoc` إرشادي) | `reviewDoc` | لا بلدية ولا طلب ولا عزيز | `studio.mjs` (قسم مراجعة الميزان، route=manual) |
| محرر الهندسة القديم (`app.mjs`) | لا | لا شيء | تعديل الفتحات بلا مراجعة | `app.mjs` `reviewManualEdit` |

كل المسارات تمر بنقطة واحدة: `reviewGate({route, doc, ctx})` في `dist/design-review.mjs:447` عبر `stampDesign` (`:460`) أو `reviewLegacyModel` (`:477`). اختبار ساكن يتحقق أن كل ملف `design-*.mjs` يدفع تصميمًا للجلسة يستدعي `stampDesign`.

## 4. ما أُضيف

- `reviewDesign(doc, ctx)`: كل ملاحظة بمعرّف وشدة (إلزامي/تحذير/معلومة) وسبب وموقع (غرفة/جدار/فتحة/درج مع إحداثيات) وحالة (مخالف/متحقق/غير متحقق) ودليل. المصادر القائمة فقط: `checkDoc`، سجل الطلب `verifyRequest`، `checkMunicipal`، الخصوصية الهندسية، `reviewDoc`، `checkStairs`، الفتحات، `cond:*` من `requirement-evidence`، الأقفال، عزيز لكل دور. لم يُضف شرط إنشائي جديد؛ العلاقات بين الأدوار تحذيرات لا إلزامية.
- `planVersion`: بصمة هندسية قانونية (جدران، فتحات، غرف بنوعها وبذرتها، درج، أعمدة، أرض). اللون والتشطيب والتسمية (لغير المقفل) والعنوان لا تدخل. التقرير يظهر فقط إن طابق النسخة المعروضة وإلا «التقرير قديم — جارٍ المراجعة/أعد المراجعة».
- `approveDesign`/`approveReviewed`: يرفض بقائمة أسباب عند مخالفة إلزامية أو تقرير قديم، و«غير متحقق» إلزامي يتطلب قرارًا صريحًا يُسجَّل مع النسخة. **الإلزام مطفأ افتراضيًا** (`REVIEW_SWITCH.enforce=false`، أو `globalThis.MIZAN_REVIEW_ENFORCE`، أو `requirements.tweaks.reviewEnforce`)؛ في الوضع الافتراضي تظهر المراجعة ولا تمنع، ويُسجَّل القرار «إرشادي».
- الواجهة: `design-review-ui.mjs` وتنسيق `design-review.css` (RTL، أهداف لمس 44px، لا تمرير أفقي) في صفحة التصميم والمرسم.
- عزيز غير متاح: ملاحظة «عزيز: غير متاح» بحالة غير متحقق، ولا يُنسب إليه تحقق.

## 5. حدود صريحة

- عزيز هنا هو مقيِّم قيوده الصلبة المحلي؛ لا يشمل برنامج الغرف الأصلي ولا الإنشاء.
- بنود البلدية التي لا يقيسها المخطط (سور، موقف، منسوب) تبقى «غير متحقق».
- لا أحمال ولا أساسات ولا تسليح.
