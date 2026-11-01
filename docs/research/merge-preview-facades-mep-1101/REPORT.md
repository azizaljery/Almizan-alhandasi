# تقرير الدمج النهائي: ملاحظات المعاينة + طرز الواجهات + الأنظمة الهندسية

التاريخ: 2026-11-01 · الفرع: `dev/preview-feedback-facades-mep` · الأساس: `f8e1844` (staging-preview الحالي)

> هذا فرع تطوير فقط. لم يُنشر شيء، ولم يتغير `main` ولا `deploy` ولا `staging-preview`، ولا أسرار ولا قواعد بيانات ولا إعدادات خارجية.

## 1) ما دُمج

| الفرع | الإيداع | المحتوى | تقريره |
|---|---|---|---|
| `dev/preview-feedback-1031` | `aa30116` | إصلاح ملاحظات المعاينة: الأبعاد المعكوسة، الأفكار غير المطبقة، قائمة التصدير المقصوصة، تبسيط المرسم | `docs/research/preview-feedback-1031/REPORT.md` |
| `dev/facade-styles` | `b26cea8` | وكيل واجهات لكل تصميم: كلاسيكي / حديث / نيوكلاسيكي | `docs/research/facade-styles/REPORT.md` |
| `dev/mep-systems` | `d4a7372` | دمج حزمة الأنظمة الهندسية v0.1.0 | `docs/research/mep-integration/` (نص تقريره في §4 أدناه) |

سلسلة الدمج فوق `f8e1844`: `379e1e6` (aa30116) ← `d17fa7d` (b26cea8) ← `77c521b` (d4a7372) ← `f78a55c` (تعديل فحص الرحلة).

## 2) التعارض وحله

- ملف واحد فقط: `dist/design.mjs`، في موضعين. الحل بإبقاء الطرفين:
  - الاستيراد: `request-ledger.mjs` (ملاحظات المعاينة) و`facade-ui.mjs` (الواجهات).
  - `storeForStudio` يسلّم `docWithFacade(doc, session)`.
  - `onApprove` يحتفظ بحارس المسودة المخفية (`presentationOf(...)?.status === 'hidden'`).
- لا تعارض في بقية الملفات المشتركة (تحققت بالدمج الفعلي).
- **تعديل فحص قائم (معلن):** في `scripts/preview-feedback-1031/journey.mjs` فحص «المرسم يفتح المستند نفسه حرفيًا» صار يستثني الحقل `finish.facade` وحده (الذي تضيفه الواجهات عمدًا لتسليم الطراز)، ويبقى كل ما عداه مطابقًا حرفيًا. لم يُضعَف أي اختبار آخر.

## 3) الملفات المشتركة المعدلة (كما أعلنها كل فرع)

### أ) ملاحظات المعاينة (aa30116)
| الملف | المواضع | السبب |
|---|---|---|
| `dist/sharaa/brief.mjs` | `STRONG`، `describeRelation`، `labelOf` | «ولازم» تُقرأ لزومًا؛ الملاصقة لا توصف «بباب مباشر» |
| `dist/sharaa/flow.mjs` | `COUNT_FORM_TYPES`، `#unconfirmedItems`، `#applyAnswer('confirm')`، `landBar` | المقلط، الواجهة والعمق |
| `dist/sharaa/adapter.mjs` | `supportRows` | «بدون …» |
| `dist/design.mjs` | `show()`، `presentationOf`/`ltr`/`landDims`، `statusCard`، `onApprove` | السجل الكامل، المسودة المرفوضة، الأبعاد |
| `dist/present.css` | أسطر جديدة في آخره | العرض |
| `dist/design-session.mjs` | `summarizeDoc` (x, y, aligned) | الأبعاد الموجّهة |
| `dist/draw/digest.mjs`، `dist/draw/editor/render2d.mjs` | إعادة تصدير `roomSpan`، تسمية أبعاد الغرفة | أفقي × رأسي |
| `dist/studio.html/.css/.mjs` | الوضع البسيط، قائمة التصدير، التعديل بلمسة، الأبعاد | ملاحظات المالك |
| `dist/home.html/.mjs`، `dist/home-flow.mjs` | صف «الواجهة والعمق» وزر التبديل | الواجهة والعمق |
| `scripts/{studio-browser,studio-qty-browser,studio-structure-browser,studio-tour-import-browser,home-dna-browser,final-browser}.mjs` | سطر `addInitScript` | تبدأ بالوضع المتقدم |
| جديد | `dist/request-ledger.mjs`، `dist/draw/room-span.mjs`، `dist/draw/menu-place.mjs`، `tests/preview-feedback-1031.test.mjs`، `scripts/preview-feedback-1031/*` | |

### ب) طرز الواجهات (b26cea8)
| الملف | الموضع | السبب |
|---|---|---|
| `dist/design.mjs` | استيراد؛ بطاقة الواجهات بعد `grid`؛ `storeForStudio` و`onStudio` | بطاقة الواجهات وتسليم الطراز |
| `dist/design-session.mjs` | `createSession` (`input.facade`)، `facadeStatus` | ملف الاحتياج وصدق الحالة |
| `dist/plan-edit.mjs` | `doFacade` | الصدق نفسه |
| `dist/home.mjs` | استدعاءا `createSession` يمرران `facade` | نقل الطراز من شرعاء |
| `dist/sharaa/brief.mjs` | `PREF_VALUES.facadeStyle`، `applyExtraction` | قراءة الطراز |
| `dist/sharaa/flow.mjs` | سؤال `facade_style` | السؤال الواحد |
| `dist/sharaa/adapter.mjs` | نهاية `toEngineInput` (حقل `facade`) | requirements لا تتغير |
| `dist/draw/scene3d.mjs` | `buildBuildingScene` | الطراز في المجسّم |
| `tests/plan-edit.test.mjs` | تعديل اختبار | |
| جديد | `dist/facade-styles.mjs`، `dist/facade-choice.mjs`، `dist/facade-ui.mjs`، `dist/draw/facade3d.mjs`، `tests/facade-styles.test.mjs`، `tests/fixtures/facade/*`، `scripts/facade-styles-browser.mjs` | |

### ج) الأنظمة الهندسية (d4a7372)
- ملف مشترك واحد: `dist/design.html` (فقرة/رابط واحد إلى `systems.html`).
- جديد: `dist/engineering-systems/` (الحزمة كما هي، 77 ملفًا، `verify-bundle` ناجح)، `dist/mep-binding.mjs`، `dist/systems.html/.mjs/.css`، `tests/mep-integration.test.mjs`، `tests/fixtures/mep/*`، `scripts/mep-fixtures.mjs`، `scripts/mep-systems-browser.mjs`، وأدلة في `docs/research/mep-integration/`.
- لم يُعدَّل: محركات العمارة، `gemini-engineering-layer.mjs`، `engineering.mjs`.

## 4) نص تقرير وكيل الأنظمة الهندسية (لم يستطع كتابته في المستودع)

- التخزين: `localStorage['mizan.mep.systems.v1']` بالصيغة `mizan-mep-systems/1`، منفصلًا عن جلسة التصميم.
- الحزمة تعطي `NOT_CALCULATED` مع `null` عند نقص البيانات، و`BLOCKED` للمسارات المحجوبة بسببها؛ `constructionApproved=false` و`codeCompliance=NOT_EVALUATED`.
- `fromDrawDoc` يرفض `north ≠ 0`.
- مضلع «شوكة» يخرج من `analyzeDoc` v2 (حالة C4) عولج في طبقة الربط فقط (`NET_POLYGON_SPIKE_REMOVED`) والمحرك لم يُمس؛ يستحق مراجعة لاحقة.
- بصمات الملفات المثبتة في الحزمة لا تطابق git (`sourceMatchesPinnedFiles=false` على 429098a وf8e1844 معًا).
- مخرجات محركات العمارة مطابقة حرفيًا لـ f8e1844 في مصفوفات الانحدار.

## 5) نتائج الاختبار والبناء (على الدمج النهائي)

| الفحص | النتيجة |
|---|---|
| `npm test` الكامل (وحده على الجهاز) | 1641 اختبارًا: **1638 ناجحًا و3 فاشلة** — الثلاثة هي اختبارات الدش الموروثة نفسها (معايرة حالة العرض، اتساق الحكم في كل الحالات، قياسا الدور العلوي على C7-1). لا فشل جديد |
| البناء | ناجح، 156 وحدة (esbuild محلي 0.28.2؛ البناء المقفل 0.25.12 غير متحقق منه هنا لحجب npm) |
| رحلة المعاينة 1024×1366 | 9 فحوص ناجحة، 0 رسوب |
| رحلة المعاينة 1366×900 | 9 فحوص ناجحة، 0 رسوب |
| رحلة الواجهات | 6 من 6 (C1 وC7 × 3 طرز)، المسقط لم يتغير، 0 أخطاء |
| رحلة الأنظمة | 58/58 بالحالة GUIDED (انظر §7) |
| اختبارات pending الأربعة | لم تُشغَّل (خارج `npm test`) |

## 6) نتائج المتصفح التي تحتاج انتباهًا (صدقًا)

1. **الجوال 390×844 في رحلة المعاينة: رسوب.** زر «الوضع المتقدم» (`#modeToggle`) يقع جزئيًا خارج الشاشة (x=−45)، وأزرار التكبير العائمة والبطاقة الفارغة تتراكب على شريط الأدوات، فيتعذر النقر عليه. المصدر `aa30116` نفسه وليس الدمج (نفس القياس على الفرعين). ملاحظة: النسخة المنشورة `f8e1844` أسوأ على الجوال (الصفحة تفيض أفقيًا إلى 736 بكسل). **عيب مفتوح** لم يُصلح، لأن إصلاحه يستلزم إعادة الاختبار الكامل.
2. رحلة الأنظمة بالحالة الافتراضية `C7` المولَّدة من شرعاء انتهت بـ«لم يجد المحرك حلًا بعد» على الدمج. الوكيل وثّق رحلته بالحالة `GUIDED`. نتيجة `GUIDED` على الدمج مدرجة في §7.

## 7) رحلة الأنظمة على الدمج

رحلة `scripts/mep-systems-browser.mjs --case GUIDED` على الدمج النهائي (1366×900 و390×844): **58 فحصًا ناجحًا، 0 رسوب، 0 أخطاء**، و23 تنزيلًا فُحصت صيغها؛ المحجوب الوحيد طلب الخطوط الخارجية. نفس نتيجة وكيل الأنظمة على فرعه (58/58).

الحالة الافتراضية `C7` المولَّدة من شرعاء لم تُنتج تصميمًا على الدمج («لم يجد المحرك حلًا بعد»)؛ **لم أقارنها بفرع الأنظمة وحده**، فلا أعرف إن كان السبب تفاعل الفروع أم أن الحالة لا تُحل أصلًا: غير متحقق.

## 8) الثغرات المتبقية

- لا حسابات هندسية حقيقية للإنارة وقصر الدائرة وشبكات الضغط وتغطية الحريق والإنتاج الشمسي؛ لا مطابقة للكود السعودي (`NOT_EVALUATED`)، والمخرجات تصميم أولي يراجعه مهندس مختص.
- الأنظمة مخزنة في المتصفح فقط، وكمياتها غير مدمجة في المخرجات النهائية، وتعمل على الخيط الرئيسي.
- قرارات المالك المعلقة من الوكلاء: عتبة إزاحة الموقف (6.5 م مقابل ≈5.85 م)؛ رفض المرشح بدل مسودة ستُحجب؛ خط أبعاد كلي لتناقض 26 مقابل 19.95؛ إضافة «التسمية» و«الممحاة» للوضع البسيط؛ تعديل مساحة الغرفة رقميًا؛ إظهار «نجدي معاصر (مقترح)» أو إخفاؤه؛ طرح سؤال الطراز في كل المسارات؛ ماذا يحدث إن لم يختر العميل.
- فشل الدش الثلاثة الموروثة بانتظار قرارك في توقعاتها.

## 9) طريقة التراجع

- الفرع جديد ولم يُدمج في أي فرع آخر: يكفي عدم استعماله. للعودة: الأساس `f8e1844` (staging-preview) وmain `d32121e` لم يتغيرا.
- التراجع الجزئي: `git revert -m 1 <دمج>` لأي من `379e1e6` أو `d17fa7d` أو `77c521b` بالترتيب العكسي.
- الأنظمة الهندسية معزولة: صفحة `systems.html` ورابط واحد في `design.html`.
