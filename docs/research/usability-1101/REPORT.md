# إصلاح قابلية الاستخدام على الجوال — 2026-11-01

الفرع: dev/preview-feedback-facades-mep (فوق 4cd0b4c). التغيير CSS/تخطيط فقط؛ لا منطق حسابات ولا محركات ولا dist/claude ولا dist/engineering-systems.

## 1) final.html على 390×844
- **القياس قبل:** `document.scrollWidth` = 431 (الترويسة والمحتوى مزاحان 41px لأن اتجاه الصفحة RTL فيتمدد الفيض يسارًا).
- **السبب الجذري (بالقياس):** عناصر `TABLE` بعرض 400px داخل `.sec` عرضه 328px (التفاف الخلايا لا يكفي، `table{width:100%}` لا يضغط أدنى عرض الأعمدة). لا علاقة للترويسة نفسها (`header.fh` عرضه 390)؛ كانت مزاحة فقط تبعًا لاتساع إطار العرض.
- **الإصلاح:** `dist/final.css` ضمن `@media(max-width:640px)`: `table{display:block;max-width:100%;overflow-x:auto}` + `min-width:0` للحاويات. الجداول تتمرر داخل نفسها.
- **بعد:** 390×844 → 390؛ 360×800 → 360؛ 1366×900 → 1366 (لا عناصر خارج الحدود في الثلاثة).

## 2) المرسم dist/studio.css
أ) «مقسوم» على 390×844:
- قبل: الترويسة 148px، لوحة الرسم 208px (من 254 إلى 462)، لوحة المجسّم 97px، وشريط المجسّم (حتى y=567) يتجاوز حدود لوحته (ينتهي عند 559) ويتراكب على ما تحته.
- بعد: الصفحة تتمرر؛ لوحة الرسم 388px (`max(340px,46dvh)`)، شريط المجسّم في تدفق الصفحة فوق المجسّم (`order:-1`, `position:static`) والمجسّم 260px، والجانب ≥320px. تقاطع الشريط مع المجسّم/الرسم = 0، وelementFromPoint للأزرار الستة يرجع الزر نفسه.
- عيب إضافي وُجد: رسالة «WebGL غير متاح» (`.three-msg`) تغطي شريط المجسّم كله فتمنع نقره (يظهر في أي مقاس بلا WebGL). أُصلح بـ `pointer-events:none` على الرسالة (نص فقط) و`z-index` للشريط.

ب) 1024×768 متقدم:
- قبل: `#modeToggle` عند y=758–806 (أسفل الطيّ 768) وelementFromPoint لا يعيده.
- بعد: `position:sticky;bottom:0` داخل الشريط (≥981px) فيصير y=712–760 مرئيًا وhit=true، مع `scroll-padding-block-end:60px` كي لا يغطي الزر اللاصق آخر أدوات الشريط عند scrollIntoView.
- سطح المكتب 1366×900: هندسة `rail/plan/three/stage/#modeToggle` مطابقة قبل/بعد (الفرق الوحيد: أزرار شريط المجسّم صارت قابلة للنقر حين تظهر رسالة WebGL).

## الملفات المعدّلة
- dist/final.css، dist/studio.css
- scripts/preview-feedback-1031/mobile-hit.mjs: فحوص جديدة (لوحة الرسم ≥320 في split، لا تقاطع/إصابة أزرار المجسّم، final.html scrollWidth ≤ W، والقياس من أعلى الصفحة).
- tests/mobile-studio-1101.test.mjs: أُضيف المقاس 1024×768.

## النتائج
- mobile-hit: 390×844 FAILS 0 | 1366×900 FAILS 0 | 1024×768 FAILS 0.
- journey.mjs: 390×844، 1024×1366، 1366×900 كلها FAILS 0 (المرسم يفتح المستند نفسه، قائمة التصدير داخل النافذة، DXF غير فارغ).
- اختبارات node فرادى (كلها نجاح، 0 فشل): mobile-studio-1101 3، preview-feedback-1031 10، ui-compact-studio 3، studio-conversation-ui 5، studio-project 11، studio-session 11، export-studio 6، final-outputs 10، mep-persist-qty 12.
- اللقطات: before-/after-final-390، before-/after-studio-390-split، before-/after-studio-1024-advanced في هذا المجلد.

## غير متحقق
- متصفح واحد (Chromium/Playwright) فقط؛ لا Safari/iOS ولا جهاز حقيقي.
- المجسّم نفسه لم يُرسم في بيئة الفحص (لا WebGL)؛ لم يُتحقق من إعادة ضبط حجم لوحة WebGL فعليًا بعد تغيير ارتفاع المضيف (يعتمد على ResizeObserver الموجود في viewer-draw.mjs).
- المقاسات 601–980 (لوحي) لم تُغيَّر ولم تُفحص لـ«مقسوم».
- final.html فُحص بمستند «مثال جاهز» فقط؛ قسم الأنظمة بمستندات أخرى غير مفحوص.
- لم يُشغَّل npm test الكامل.
