# الميزان الهندسي — شيفرة إصلاح 02b + 01 (R21)

## حدود الحزمة

- هذه **وحدات JavaScript ES Modules كاملة وقابلة للتشغيل** وليست فرقًا حرفيًا جاهزًا للدمج في المستودع؛ ملفات `02b-explicit-dims-rework.diff` و`review-01-shared-brief-H6.md` ونسخة `2bfcd9e` لم تكن متاحة مباشرة في جلسة إعداد هذه الحزمة.
- **لا تستبدل** محرك AZIZ أو Mizan Score أو معايير r19 المجمدة. لا تنسخ فوق الدوال الحالية عشوائيًا؛ اربط الوحدات بمهايئات واضحة بعد قراءة شيفرة المستودع الحقيقية.
- لم يُنفّذ أي تعديل على فرع المشروع أو الإنتاج. اختبارات هذه الحزمة محلية فقط.

## 1. `src/clear-dimensions.mjs` — إصلاح 02b

استخرج حدود الفراغ الصافي **بعد** حساب الوجوه الداخلية الفعلية للجدران والفتحات الثابتة والأعمدة والفتحات الرأسية. مرر `outer` مضلعًا متعامد الأضلاع و`holes` للفراغات الممنوعة. إذا كانت الهندسة مائلة أو منحنية، أوقف هذا الفاحص واستخدم فاحصًا هندسيًا مناسبًا؛ لا تعتبر رفض الهندسة غير المدعومة إثباتًا للاستحالة.

```js
import { validateClearDimensions } from './src/clear-dimensions.mjs';
const check = validateClearDimensions({
  outer: [{x:0,y:0},{x:4,y:0},{x:4,y:5},{x:0,y:5}],
  required: {width:4,height:5},
  qualifier: 'exact', // exact ±.03, unspecified ±.05, approximate ±.30
  allowRotation: true
});
if (!check.ok) {
  // host engine: attach structured failure to the candidate;
  // DO NOT mark the entire land/project as impossible.
}
```

- الفحص يشترط **الأمرين معًا**: (أ) أبعاد الصندوق الخارجي الصافي ضمن السماحية، (ب) وجود مستطيل صافٍ داخل المضلع يحقق الأبعاد المطلوبة. هذا يمنع تمرير غرفة L أو ضيق 6.5 سم بسبب الاعتماد على صندوق محيط فقط.
- هذا الفاحص لا ينشئ هندسة جديدة. **يجب أن يبقى تثبيت الامتدادات في `solve` و`programV2` من رقعة 02b الأصلية**، ثم يُستخدم هذا الفحص بوابةً بعد `realizeV2`.
- `clearSpanFromCentrelines` يستخدم فقط عندما تكون إحداثيات المصدر **محاور الجدران**. إذا كانت إحداثيات المصدر الوجوه الداخلية فلا تخصم نصف السماكة مرة ثانية.
- لا تغير دقة الرسم 2D/3D دون اختبار بصمات الجدران والنوافذ والأبواب بعد التفصيل.
- السماحيات الثلاث المذكورة في التقرير **سياسة افتراضية مؤقتة** وليست اشتراطًا نظاميًا. لا تغيّر طلب العميل الصريح أو قيودًا موثقة.

## 2. `src/privacy-gate.mjs` — منع تراجع C6

```js
import {screenWindowPrivacy,compareAcceptance} from './src/privacy-gate.mjs';
const privacy = screenWindowPrivacy({
 window:{a:{x:2,y:-1},b:{x:2,y:1},sillHeight:0.9,headHeight:2.2},
 parkingPoints:[{x:0,y:0}],interiorPoints:[{x:4,y:0}],opaqueScreens:[]
});
const gate = compareAcceptance(beforePlanReview, afterPlanReview, {
 mandatory: existingMandatoryRuleIds,
 protect: ['privacy','daylight','ventilation','circulation']
});
```

- استخدم عينات نقاط متعددة من الموقف ومن داخل الصالة (وليس مركزًا واحدًا فقط).
- `screenWindowPrivacy` **فحص محافظ ثنائي الأبعاد**، لا يحسب ارتفاع التضاريس أو تغير منسوب الوقوف أو الزوايا ثلاثية الأبعاد أو الإضاءة أو التهوية. لا تُعتمد C6 على أساسه وحده؛ يجب تشغيل فاحصات المشروع الأصلية ومراجعة هندسية.
- لا تجعل `1.64 m` عتبة خصوصية عامة: تحقق من خطوط الرؤية الحقيقية.
- إذا غيّر إصلاح المقاسات مواقع النوافذ، لا تسمح بتراجع قواعد الخصوصية والإضاءة والتهوية التي كانت ناجحة قبل التعديل، إلا بقرار مبرر ومراجعة مستقلة.

## 3. `src/shared-brief.mjs` — إصلاح 01

```js
import {canonicalBrief,assertSharedBrief} from './src/shared-brief.mjs';
const brief=canonicalBrief({text: originalClientText, parsed: existingParserOutput,
 counts: existingCounts,prefs: existingPrefs,rules: existingRules});
assertSharedBrief(brief,brief);
const generated=await existingGenerator(brief);
const reviewed=await existingReviewer(generated,brief);
```

- في `dist/requirements.mjs`: احتفظ بالنص الأصلي، والقيود المهيكلة، ومصادرها. لا تعِد تفسير النص مستقلاً داخل `programV2` و`reviewRequest`.
- `مجلس رجال بمقلط` يعني وجود **وظيفة مقلط**؛ لا تفرض بابًا مباشرًا أو غرفة منفصلة دون نص صريح أو قيد موثق. استخدم محلل المشروع العربي الرئيسي لتفاصيل اللهجات، وهذا الملحق ليس بديلًا عن NLP.
- H3: إذا فشل مرشح بسبب شرط المقلط، احفظ سبب الرفض/الحجب، لكن لا تعرض المخطط المخالف كصالح. ابحث عن بدائل صحيحة ضمن ميزانية معلنة، ولا تعتبر الفشل استحالة.

## 4. `src/review-evidence.mjs` — حجب H2/H10 وصدق الرسائل

```js
import {rejection,assertBlocked,classifyRun,clientNotice} from './src/review-evidence.mjs';
const reason=rejection({candidateId:'H2-1',stage:'review',rule:'PARKING_ACCESS',
 source:'design_policy',reason:'تعذر وصول السيارة للموقف',
 measured:2.1,limit:2.5,unit:'m'}); // values here are illustrative ONLY
const candidate={status:'blocked',rejections:[reason]};
assertBlocked(candidate);
const result=classifyRun({candidates:[candidate]});
const notice=clientNotice(result,{requested:3,shown:0});
```

- `measured` و`limit` يجب أن يؤخذا من **فاحص المشروع الحقيقي**. لا تنسخ القيم التوضيحية إلى الإنتاج. في بوابات غير رقمية يجوز `null` مع `reason` صريح، ولا تُختلق أرقام.
- رفض مرشح داخلي، حجب بديل نهائي، وعدم وجود بديل صالح: حالات مختلفة؛ جميعها تُسجل في السجل الداخلي دون إظهار مصطلحات البحث للعميل.
- لا تستخدم `PROVEN_CONFLICT` إلا مع شهادة تحقق مستقلة موثقة، وإلا `SEARCH_INCOMPLETE`.

## 5. `src/bath-band.mjs` — أعماق الحمامات

النطاقات `deep=1.95–2.9 m` و`side=1.5–2.4 m` **تفضيلات بحث** لا متطلبات نظامية. يجب إثبات ملاءمة التجهيزات، فراغات الأبواب، التهوية، الاشتراطات المعمول بها، وطلب العميل.

## 6. بروتوكول القبول

1. اقرأ الشيفرة الفعلية و`02b-explicit-dims-rework.diff` و`review-02b-explicit-dims.md` و`review-01-shared-brief-H6.md`، ثم اكتب مهايئات تربط الدوال الفعلية بالوحدات المقترحة. لا تعدّل ملفات الإنتاج.
2. قارن رقعة 02b مع الدوال الموجودة `programV2`, `solve`, `scoreV2`, `realizeV2`, `rules.mjs:677` وطبقة العرض 2D/3D؛ لا تنسخ دوال موجودة مرة أخرى.
3. أضف اختبارات C6 (الخصوصية/الإضاءة/التهوية)، H2 (سبب حجب الموقف)، H3 (مقلط/ممر خمس غرف)، H10 (المقاسات الصافية وعدد البدائل)، غرف L والشقوق 6.5 سم، وغرف الماستر/النوم والصالة، واختبارات الدوران.
4. شغّل اختبارات المستودع بالكامل، وقياس أثر 01 و02b منفصلين ومجتمعين على بذرة التطوير والحالات المعروفة، وبنفس الموارد؛ لا تفتح بذرة القياس أو H11–H15.
5. سلّم `git diff` حقيقيًا مع أسماء الملفات والأسطر ونتائج قبل/بعد، وحالات الفشل والتراجع، ولقطات 2D/3D؛ لا تطلب دمجًا قبل مراجعة المالك.
6. لا تُعدّ فحوص الخصوصية أو الحمامات أو تطابق الجدران اعتمادًا معماريًا/إنشائيًا. مراجعة معماري سعودي مرخّص مطلوبة قبل طلب النشر، والنشر يحتاج موافقة صريحة على إصدار محدد.

## التشغيل

```bash
cd mizan-r21-02b-01-patches
npm test
```
