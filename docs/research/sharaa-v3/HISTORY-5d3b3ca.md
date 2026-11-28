Historical snapshot from production 5d3b3ca (superseded by README.md and STATUS.md).


---

STATUS.md

# شرعاء V3 — حالة التسليم (2026-11-28)

الحالة العامة: **وحدة مستقلة جزئية، غير موصولة بالواجهة الحية.** لا تُفعَّل للتوليد، ولا يظهر منها شيء للعميل في الموقع بعد.

## ما سُلِّم في هذا الإصدار
- `dist/sharaa-v3/` — بنك أسئلة (148 سؤالًا)، سياسة عمق المقابلة، حالة دعم المعلومات `factSupport`، بوابة الجاهزية `generationGate`، محوّل معاينة إلى شرعاء الحالي، فحوص جودة أولية، وواجهة نموذجية لم تُركَّب في الصفحة الرئيسية.
- `tests/sharaa-v3/` — 37 اختبارًا ناجحًا على كود الموقع الحالي.
- `docs/research/sharaa-v3/` — مصفوفة التتبع `TRACE.md` ونتائج 30 سيناريو `scenarios.json`.
- لم يُمسّ محرك عزيز، ولا أوزان Mizan Score وعقوباته وبواباته، ولا `home.mjs`.

## حالة البنود حسب قرار المالك
| البنود | الحالة |
| --- | --- |
| 6 — محرك العلاقات الهندسية | قيد التنفيذ |
| 9 — واجهة المقابلة | قيد التنفيذ؛ التركيب في `home.mjs` يحتاج بناءً فوق `SharaSession` الحالي، فمحوّل فرع التطوير القديم لا ينطبق على الموقع |
| 16 — منظومة Design Quality | قيد التنفيذ |
| 3 — معرفة سعودية موثقة (مناخ، شمس، رياح) | غير مقيَّم: لا مصادر موثقة ولا بيانات مناخ حاليًا |
| 13 — تكامل ثنائي الاتجاه مع عزيز والمراجع | غير مقيَّم: لا عقد مراجع يُقرأ، والاتجاه الموجود معاينة فقط |
| 1، 2، 4، 5، 7، 8، 10، 11، 12، 14، 15، 17، 18 | جزئي؛ التفصيل والأدلة في `TRACE.md` |

## حدود معروفة (مقاسة)
- بين 23 و46 معلومة مؤكدة لكل سيناريو لا يستهلكها المحرك الحالي.
- طلب الفناء الداخلي (S15) يُسجَّل غير مربوط ولا يمنع التوليد.
- لم تُشغَّل اختبارات متصفح ولا لقطات الجوال والمكتب لواجهة V3.
- نصوص الأسئلة وتصنيف العمق تقديرية وتحتاج مراجعة معمارية.

---

TRACE.md

# SHARAA V3 — مصفوفة تتبع البنود السبعة عشر

الحالة: DONE = مُنفَّذ ومُختبر في هذا الفرع · PARTIAL = جزء منفّذ ومُختبر والباقي مذكور · NOT_DONE = لم يُنفَّذ · NOT_EVALUATED = تعذّر التقييم وسببه مذكور.
كل دليل مسار ملف ورقم سطر أو اسم اختبار. أعداد الأسطر من `wc -l` على الفرع في هذا الالتزام.

| # | البند | الحالة | الدليل / ما يلزم |
|---|---|---|---|
| 1 | مصفوفة التتبع | DONE (هذا الملف) | الحالات مبنية على قراءة الكود والاختبارات والتشغيل لا على الادعاء |
| 2 | بنك الأسئلة 146 | PARTIAL | 148 سؤالًا؛ أُضيفا `hospitality.majlisBath` (سطر 320) و`daily.qibla` (سطر 653)؛ إصلاح بوابة `future.elevator` إلى AND (سطر 1125) وكانت OR (تسمح بالمصعد لأرض أحادية الدور إذا أُكّد التوسع). لا تكرار نصّي تام. ما لم يُنفّذ: مراجعة معماريين لصياغة الأسئلة والتصنيف |
| 3 | وحدة معرفة سعودية (مناخ، شمس، رياح، خصوصية، أرض) | NOT_EVALUATED | لا مصدر موثق جُمع في هذا التشغيل ولا بيانات مناخ في الفرع؛ `siteFacts` يعتمد `climate` المُدخل ولا يخترع بيانات. لا تُسجَّل قيم شمس أو رياح |
| 4 | محرك اختيار السؤال | PARTIAL | عمق المقابلة `core/standard/detail/optional` في `dist/sharaa-v3/policy.mjs`؛ `nextQuestion(b,{depth})` (سطر 1351). القياس: أسرة بلا أطفال 85 → 38 سؤالًا، أسرة كبيرة 117 → 60 (ملف `scratch` ومنطق `tests/sharaa-v3/engine.test.mjs`) |
| 5 | SHARAA-BRIEF/3.0.0 وحالة الدعم | PARTIAL | `factSupport(b)` (سطر 1367) يعطي كل معلومة: consumer و importance و verification و support (candidate / unmapped / unconfirmed / not_applicable). الاختبار يمنع الإسقاط الصامت للإلزامي. ما لم يُنفّذ: حقول العلاقات وتوثيق المصدر الكامل في المخطط |
| 6 | محرك العلاقات (قرب، باب مباشر، جدار مشترك، اتصال بصري، استقلال مداخل، مسارات) | NOT_DONE | يوجد `addRelation` في الربط فقط لعدد محدود من العلاقات؛ لم يُبنَ محرك علاقات هندسي ولا تُميّز قرب المسار عن القرب الهندسي |
| 7 | عقد السؤال (سبب، شروط، نوع، أثر، وجهة، تحقق) | PARTIAL | الحقول الموجودة: `text,type,gate,tier,consumer`. غير موجود: السبب المعماري والأثر الهندسي وآلية التحقق لكل سؤال |
| 8 | تقليل الأسئلة وتمايز المقابلة | PARTIAL | نفس دليل البند 4. تختلف المجموعات: أطفال وكبار وإقامة والدين ومجلسان تُسأل فقط عند تحقق شرطها (اختبارات `profiles differ`) |
| 9 | واجهة المقابلة (حر، موجّه، تأكيد، خيارات مرئية، تعديل) | NOT_DONE | لم تُعدَّل `dist/sharaa-v3/ui.mjs` في هذا التشغيل؛ لا يوجد مفتاح عمق في الواجهة. شرعاء V2 لم يُمسّ |
| 10 | كشف التعارضات | PARTIAL | موجود 3 تعارضات (`conflicts`)؛ يُمنع التوليد عند التعارض (سيناريو S17، `generationGate`). ما لم يُنفّذ: تعارضات المساحة والخصوصية والمداخل والميزانية والقيود المكانية |
| 11 | ذاكرة القرارات وتتبع المتطلبات | PARTIAL | `history` و`revision` و`reviseLand` يحفظ الحقائق (اختبار `land change` في `core.test.mjs`). لا سجل مراجعات مستقل |
| 12 | بوابة جاهزية التوليد | PARTIAL | `readiness` في الكود الأصلي؛ `generationGate` في `scenarios.mjs` يمنع عند تعارض أو أساسي ناقص أو إلزامي غير مدعوم أو غير مؤكد. لم تُربط البوابة بمسار الواجهة الحي. لا تمييز بين "بحث غير مكتمل" و"استحالة مثبتة" |
| 13 | تكامل ثنائي الاتجاه مع عزيز والمراجع | NOT_EVALUATED | لا يوجد في الفرع كود عزيز ولا عقد مراجع يُقرأ. يوجد اتجاه واحد: `previewProjection` (معاينة فقط). المخطط الناتج لا يُختبر بعد |
| 14 | هيكل المشروع | PARTIAL | وحدات جديدة: `policy.mjs` و`scenarios.mjs`؛ لا ازدواج مع V2؛ الاستيرادات تُبنى (build PASS) |
| 15 | الاختبارات | PARTIAL | اختبارات Node: `core` 10، `quality` 7، `engine` 13، `scenarios` 7. الاختبارات المتصفحية وأداء الواجهة لم تُشغَّل |
| 16 | منظومة Design Quality | NOT_DONE | `quality.mjs` يحوي فحص نسبة الصالة ومسار المشي وفصل المداخل فقط، و4 فحوص NOT_EVALUATED. لا Concept Generator ولا Saudi Hospitality Intelligence ولا Refinement Loop |
| 17 | الاستقلال وعدم تغيير Mizan Score | PARTIAL | لم يُمسّ أي ملف خارج `dist/sharaa-v3`, `dist/villa-layout*`(قراءة فقط), `tests/sharaa-v3`, `docs/research/sharaa-v3`. لا اختبار انحدار لأوزان Mizan Score وعقوباته وبواباته بعد |
| 18 | 30 سيناريو على المحرك الفعلي | PARTIAL | `dist/sharaa-v3/scenarios.mjs` يشغّل 30 سيناريو على `dist/villa-layout.mjs`. النتائج في `docs/research/sharaa-v3/scenarios.json`. النقص: الفحوص السلوكية لبعض السيناريوهات (S11 مضلع، S15 فناء، S30 طابقان) تقع خارج مسار المحرك الحالي وتُسجَّل NOT_EVALUATED / NOT_SUPPORTED |

## نتائج مقاسة (مرجع)
- الأسئلة المُنفّذة لكل سيناريو: 38 إلى 58 في العمق standard، 85 إلى 113 في full.
- الحقائق المؤكدة غير المربوطة بالمحرك (unmapped) في كل سيناريو: 23 إلى 46. أي أن المحرك يستهلك جزءًا صغيرًا فقط من المتطلبات. هذا هو الحد الحقيقي لاكتمال البنود 5 و6 و13.
- كل تصميم مولّد اجتاز `checkDoc` بلا أخطاء (30 سيناريو).

---

INCREMENT-2.md

# V3 increment 2
Adds an opt-in interactive RTL interview inside the existing home stage, inherited land, adaptive questions, explicit revisions, conflict editing, free-text number proposals, native projection preview, JSON export, and independent geometry evidence quality checks. Existing V2 generation remains untouched. No automatic handoff or generation from V3; projection is not a validated consumer contract. No persistent storage or remote AI. Geometry review expects externally verified room/route/door evidence; it is not connected to AZIZ geometry, not Mizan Score, and does not validate image fidelity, daylight or ventilation. Thresholds are provisional design heuristics. Seven pure JavaScript assertions passed in authoring runtime; Node tests added but not run, browser/build/native integration not run. Full 17 items remain incomplete. Agent must test actual browser and connect canonical contract with no silent loss before enabling generation. Do not deploy automatically.
