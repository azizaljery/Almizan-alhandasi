# MIZAN Integration Envelope — MIZAN-IR/1.0.0

**Frozen for P1-CLA-01 / P1-GEM-01. Owner: main control room.**
هذه مواصفة تبادل جديدة حول العقود الأصلية. لا تستبدل PlannerOutputContract أوAzizInput ولا تزعم أن Gemini يقبلها اليوم. كل مالك يبني Adapter إلى هذه المواصفة في نطاقه. schemaVersion ثابت 1.0.0. JSON Schema يضبط شكل الرسائل؛ الشروط الدلالية هنا ملزمة كذلك.

## 1 — الوحدات والإحداثيات
المسار المشترك يستخدم m / m2 / m3. frame=PLOT_SW_X_EAST_Y_NORTH: الأصل الركن الجنوبي الغربي للأرض، X شرق، Y شمال. هذا يوافق عقد Claude الأصلي الذي قُرئ؛ لا تدوير إضافي لرسم هندسة المحرك. e/w/s/n اتجاهات جغرافية، وfront/back مفاهيم نسبية للمدخل. الغرف والممرات والجدران والفتحات والأفنية تتحول معًا عند أي تحويل مخصص.
الواجهة ثلاثية الأبعاد تتخذ تحويل عرض صريحًا موثقًا إلى محاورها ولا تعيد تعريف المصدر. المتر↔mm تحويل مرة واحدة في Adapter Gemini؛ مساحة netAreaSqM تبقى m2. يرفض UNIT_UNSUPPORTED عند وحدة غير معروفة أو مدخل غير متجانس. حقول ذات لاحقة Mm تبقى mm؛ لا تضرب مرة ثانية. القيم الافتراضية لا تتحول إلى حقيقة: يجب source=assumed وإظهار مدى الفحوص المتأثر.

## 2 — الهوية والبصمات
projectId ثابت للمشروع، requestId لإصدار متطلبات محدد، candidateId لبديل هندسي محدد، engineId الحقيقي لا يتغير بتغير RECT/L/U. لا تُعد ثلاثة أشكال من Claude ثلاثة مهندسين مستقلين.
خوارزمية المحتوى المشتركة: SHA-256، profile=mizan-json-sorted-keys-v1. implementation المرجعي identity.mjs. تُرتب مفاتيح الكائنات؛ تُحفظ المصفوفات بترتيبها. ليست JCS/RFC8785 وليست إثبات تكافؤ طوبولوجي. لا تقريب للأرقام أو إعادة ترتيب للمضلعات بغرض البصمة. مخرج Node ومخرج WebCrypto على نفس البايتات يجب أن يتطابقا.
inputHash=hash(DesignRequest كاملًا). geometryHash=hash({units,frame,geometry}) حيث geometry هو ValidatedDesignGeometry بعد إسقاط optional-undefined في مواضعها قبل إنتاج JSON فقط، لا بعد تلقيه عند boundary. NaN/Infinity تُرفض قبل stringify ولا تُحول إلى null. candidateId=hash({requestId,inputHash,geometryHash,producer,alternativeKey}) مع بادئة cand:. لا تضمّن candidateId في geometryHash ولا تشتق inputHash من مخرج يحمل البصمة ذاتها. timestamp/latency خارج المدخل والهندسة؛ لا تغير قرار المقارنة بسبب زمن التنفيذ.
حقل producer.sourceSha256 يشير إلى بايتات أرشيف مصدر محدد في بيان التسليم، وليس إلى اسم الإصدار. تحفظ بصمات الملفات الداخلية منفصلة.
كل Review يعيد بلا تغيير projectId/requestId/inputHash/candidateId/geometryHash من Candidate المقصود. المراجعة ذات هوية أو بصمة مختلفة تُرفض REVIEW_BINDING_MISMATCH. البصمة لا تثبت أن المصدر موثوق؛ provenance مستقل. تبقى بصمات FNV القديمة حقولًا تاريخية باسم خوارزميتها، لا تُعاد تسميتها SHA-256.

## 3 — Request
رسالة DesignRequest المرفقة: plot، program بعناصر id فريدة، hardConstraints، softPreferences، interpretation. floorsRequested قد تكون1..3 لكن drawnFloorsSupported=1 في هذه الدفعة. لا تُسكت متطلب طوابق إضافية ولا تضرب الكميات بعددها؛ يظهر LIMITATION.
maxBuiltAreaM2=null يعني لم يحدد سقف صريح، وليس صفرًا. قيمة موجبة تعني سقف إجمالي بصمة الدور المرسوم بعد استبعاد الفراغات الحقيقية. ينفذ السقف مع اشتراطات الارتداد وcoverage، لا بدلها. ما يزيد عن الحد بتسامح مساحة max(1e-6,abs(limit)*1e-8)m2 يُرفض MAX_BUILT_AREA_EXCEEDED. لا يسمح بتحويله إلى انكماش صامت للغرف؛ failure يعني لم يجد solver الحالي حلاً ضمن الحدود، لا برهان استحالة البناء.
معرفات program لا تُشتق من أسماء الغرف. الربط لroom-<index> الحالي يحفظ requestRoomIdMap صريحًا عند احتياج واجهة الربط؛ لا مطابقة أسماء تقريبية.
AI لا يقرر hard/must من رأيه. interpretation: confirmed أوneeds_confirmation، ومقتطف المستخدم أومصدر القيد. الغامض/غير المدعوم unresolved، لا يختفي في النص. حفظ الأبعاد الصريحة والغرف المطلوبة والسياسات مثل عدم المسبح من متطلبات العميل المؤكدة. لا تضيف AI ارتفاعات أو أنظمة غير معطاة بلا assumption.

## 4 — Candidate والهندسة
Candidate يحمل producer: engineId/packageVersion/sourceSha256/adapterVersion، requestedShape، actualShape، alternativeKey، fallback الذي يوضح هل سمح به المستخدم وسببه، geometry، presentation،قيود ومعلومات اشتقاق.
geometry هو عقد Claude native version2 دون تغيير أسماء fields. buildingFootprint المصدر الوحيد للكتلة المبنية، وليس boundingBox ولا مجموع مساحات الغرف. في U الفناء notch مستبعد بالفعل من المضلع؛ لا يُطرح ثانية ولا يحوّل إلى hole يغير نوع الكتلة. courtyards تحتفظ بـroofPolicy=OPEN_TO_SKY وroofable=false. covered states محجوزة فقط وغير مدعومة في هذه الدفعة، وتُرفض صراحةً في الكميات والتصدير.
المضلع ضمن إطار الأرض صالح غير ذاتي التقاطع، والمساحات finite positive، والغرف والممرات غير متداخلة مع void. walls/openings/links ومعرفاتها وعلاقاتها محفوظة. تحقق native validateModel إلزامي؛ schema validation لا يغنيه. adjacency/access مشتقة من connects وممرات موصولة هندسيًا؛ ممنوع إنشاء ضلع sharedLength:0.5 ثابتًا أو ادعاء أن كل غرفة على رواق تجاور كل البقية فعليًا.
requestId لا يتغير عند اختلاف strategy. تسمية courtyard وu-court لنفس U لا تخلق بديلين؛ dedup يقارن الهندسة المحددة وليس عنوان البطاقة أوالمساحة وحدها. L يُقدم عند نجاح حقيقي، والفشل يظهر مع requested/actual وسبب fallback. لا إلزام بثلاثة نتائج ناجحة على أرض لا تسمح بها.

## 5 — massingParts / مشتقات العرض
لا تعديل للمضلع للتغطية على خطأ العرض. لأشكال orthogonal RECT/L/U تُشتق مستطيلات positive finite، اتحادها يساوي منطقة buildingFootprint، دون تداخل داخلي إلا حدود مشتركة ودون فراغات غير مقصودة. ممنوع padding هندسي1cm لعلاج خط SVG؛ stroke يعالج في renderer.
بوابة القبول: مساحة الفرق المتماثل بين الاتحاد والمضلع <=max(1e-6,polygonArea*1e-8)m2؛ overlap بين مستطيلين أومع فناء <=المقدار نفسه؛ لا يكفي تساوي المساحات الإجمالية لأن فقدًا وتجاوزًا قد يلغي أحدهما الآخر. تُغطّى الغرف والممرات والاحتياط والجدران حيث تدخل الكتلة لا الغرف فقط. فحص الاتحاد لا يشترط أن تقع كل غرفة داخل مستطيل واحد؛ يمكن تقسيمها عبر قطع تلتئم. تبقى اختبارات الحماية السابقة دون تخفيف.
لـRECT يجوز حذف massingParts وفق عقد المستهلك القديم؛ حينها polygon يجب أن يطابق building. لـL/U غير المستطيل لا fallback على bounding box. إحداثيات قطاعات التحويل محفوظة لكل الجهات. display pieces ليست قياسBOQ.

## 6 — Review / التغطية / المعرفة
Gemini لا يعيد توليد الغرف ولا يغير native geometry. ينتج Review مرتبطًا بالمرشح مع checks معرفّة، findings، confidence، coverage، assumptions،references، preliminaryOnly=true.
حالة الفحص واحدة من PASS/FAIL/NOT_EVALUATED/ESTIMATE/NOT_APPLICABLE. كل check يحمل evidenceIds،reason؛ NOT_APPLICABLE يحتاج سببًا ولا يستعمل لإخفاء بيانات ناقصة. PASS يتطلب evidenceIds غير فارغة، فيما لا يعتبر التقدير نجاح امتثال. coverage مشتقة من counts لكل check وتُراجع لا تكتب100% ثابتة: total=pass+fail+notEvaluated+estimate+notApplicable؛ evaluatedRatio=(pass+fail)/(total-notApplicable)، ويكونnull إذا المقام0. لا تتغير النسبة بسبب حذف فحص مفترض من القائمة بعد التنفيذ؛ checkRegistryVersion يثبت القائمة المطبقة.
عند غياب أعمدة أو تربة أو أنظمةMEP: التخصص غير مقيم أوحمل مساحي ESTIMATE، ولا COORDINATION_PASSED شامل. مجموع الحالة PRELIMINARY_INCOMPLETE عند نقص applicable checks؛ FAIL blocker واضح؛ PASS ضمن النطاق فقط إذا كل فحوصه مكتملة. يحتفظ بمخرجات Core القديمة تحت raw إن احتاج دون أن تتحكم عبارتها في ختم قبول المنتج.
confidence={kind:HEURISTIC|CALIBRATED|UNAVAILABLE,value:0..1|null,calibrated:boolean,method:string}. الحالي heuristic؛ CALIBRATED لا يُقبل بلادليل calibration. عدم وجود بيانات لا يزيد الثقة. references تحقق خارجي مستقل وحقول edition/section/verifiedAt ليست بذاتها الدليل؛ defaults الصناعية تُسمى SYNTHETIC أوHEURISTIC ولا تظهر كمراجع معتمدة. غير الموثق لا يقلب قيدًا نظاميًا إلىPASS.
BOQ المشتق من عناصر الرسم مساحي/حجمي قابل للتتبع؛ حديد/قواعد بمعاملات المساحة ESTIMATE فقط؛ أسعار ثابتة تحمل تاريخًا/مصدرًا غير متاحين صراحةً، ولا تسمى سعر السوق الحالي.

## 7 — القرار وAI والتحسين

تملك الرئيسية Adapter إلى AZIZ الحالي؛ هذاEnvelope لا يزعم أن AzizInput يقبله مباشرة، ولا تغيّر المحادثتان الأخريان عقود AZIZ.
القيد الصريح المخالف يمنع الاختيار. الدليل غير المعروف لا يحصل على100 أوتعويض إجماعي. ويُرفض ادعاء محرك غير موثوق بحق النقض دون هوية ودليل.

ملف القبول `ARCHITECTURAL_PRELIMINARY_V1` يشمل الهندسة والمساحة والغرف والوصول المطلوب والقيود الصريحة التي يمكن التحقق منها. قيدmust غير مدعوم يمنع اعتماده آليًا ويطلب توضيحًا. نقص نموذجMEP لا يمنع مقارنة معمارية أولية إذا لم يكن شرطًاmust، لكنه يظهر INCOMPLETE وتبقى النتيجة غير تنفيذية.

مخرجDecision يحمل `SELECTED_PRELIMINARY` أو`NO_SELECTION` أو`NEEDS_CLARIFICATION`، والمرشح المختار أوnull، وأسباب القرار وأدلة الفحوص. المراجعة القديمة لا تُستخدم بعد تعديل الهندسة. تفسير التعادل يطابق السياسة الفعلية؛ لا يدعي «أعلى درجة» إذا اختار نتيجة أقل بسبب قاعدة التعادل.

**AI Gate:** على طلبين متطابقين في الأرض والبرنامج ومختلفين في أولوية الخصوصية مقابل الخدمة، يجب إثبات تغير القيود/الأوزان/أسئلة التوضيح وتتبع أثره إلى التقييم أو القرار. لا نشترط تغيير الفائز دائمًا؛ قد يبقى البديل نفسه أفضل مع تفسير. اختلاف النص أو اسمconcept وحده ليس نجاحًا. Prompt العميل بيانات لا صلاحية لتجاوز قيود أمنية أوهندسية.

التحسين محدود بثلاث جولات. يحفظmust والهوية وخريطة المتطلبات؛ يعود إلىClaude ثمGemini ثمAZIZ. لا تعديلJSON صامت ولا إصلاح هندسة فيrenderer. عند إخفاق الجميع يعادNO_SELECTION، لا أفضل المخالفين.

## 8 — العرض والتحرير والحفظ

FinalDesignState يحمل حالة مختار أوليًا/اعتمده العميل، وgeometryHash وdecisionId وmodel. العرضان والكميات يشيران إلى الهندسة نفسها. يسمح بمقارنة بديل آخر موسوم بوضوح، لا تقديمه كفائز. لا يخترع التصيير جدرانًا أوأبوابًا ولا يسقف فناءً مفتوحًا.

أي تحرير ينتجrevision وcandidate جديدين ويبطل المراجعة القديمة حتى إعادة الفحص. تملك الرئيسية ربط `placeOpening` و`removeOpening` و`ENGINE_VERSION` وملفproject وترحيل مشاريع الإصدار33. لاstub ولاno-op لتجميل النجاح. حفظ المشروع القديم يحافظ على نسخته الأصلية، معmapping واضح للإصدار والاستراتيجية، ورسالة عدم توافق قابلة للاستعادة عند العجز.

## 9 — الحماية وإثبات القبول

لاsecrets فيfixtures أوlogs أوGit. لاPOST مدفوع في دفعات المحركات. مصدرWorker ومصادقة الخادم وحدود الاستهلاك واختبار الأمان والنشر عند الرئيسية. غيابCron أوqueue ليس عيبًا فيAPI يعمل عند الطلب، ولا دليلًا علىوجودRateLimit أوغيابه. وجودOPENAI_API_KEY لا يثبت صلاحية المفتاح أوعمل الموديل.

لا نشر إنتاجي حتى توثيق مصدر آخرنشر ومصدرWorker المطابق، والتبعيات المقفلة المسموحة، والاختبارات الرسمية، والعقود، وAI، والمتصفح، والأمان، ثم فحص بايتات/معرّف النسخة المنشورة نفسها.
