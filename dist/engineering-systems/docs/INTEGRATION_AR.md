# الربط مع البرنامج الحالي

## المسار الرئيسي: مستند الرسم

في المصدر الذي قُرئ، `villa-layout-v2.mjs` و`villa-layout-v3.mjs` ينتجان مستند `mizan-draw/1`. الغرف تُستخرج من `analyzeDoc` الأصلي باستخدام الجدران والفتحات وتسميات الغرف. لا يكفي أخذ مستطيل حول التسمية.

المثال التالي يفترض أن التطبيق سبق أن اختار البديل واحتفظ بهويته. عدّل مسارات import بحسب موضع الحزمة:

```js
import { analyzeDoc } from './draw/digest.mjs';
import { validateDoc } from './draw/doc.mjs';
import {
  fromDrawDoc, createEngineeringPackage, toSvg
} from './engineering-systems/src/index.mjs';

const project = await fromDrawDoc(selectedAlternative.doc, {
  projectId: existingProjectId,
  sourceRevision: actualSourceRevision,
  analyzeDoc,
  validateDoc,
  services: editableServices,
  rules: projectRules,
  obstacles: approvedStructuralObstacles
});

const systems = await createEngineeringPackage(project, {
  disciplines: ['electrical', 'hvac', 'plumbing', 'fire', 'low_current']
});

const electricalSvg = await toSvg(project, systems, {
  levelId: 'L1', discipline: 'electrical'
});
```

لا تحفظ `systems` فوق `selectedAlternative.doc`. احفظهما ككيانين مرتبطين بهوية البديل وبصمة المصدر. SVG محلي قابل للعرض؛ في الواجهة استخدم آلية عرض الرسومات المعتمدة بالمشروع.

`fromDrawDoc` يتطلب حاليًا `north === 0`: محاور المدخل شرق/شمال بالفعل. زاوية شمال غير صفرية تُرفض حتى ينفَّذ تحويل شامل للإحداثيات في طبقة الربط. لا تكتفِ بتصفير الرقم. المدخل كله بالمتر؛ لا يُخمن المقياس من الأبعاد.

المحوّل يرفض التسميات اليتيمة أو المتكررة والفراغ المغلق غير المسمى. الفراغان `courtyard` و`balcony` لا يُحوّلان إلى غرف مكيفة. حدود حيز تمرير الخدمات في `rules.routingByLevel` يحددها المصمم صراحة، بما يستبعد الأفنية والمناطق المحظورة.

## واجهة الوكيل دون مزود إضافي

```js
import { createAgentActions } from './engineering-systems/src/index.mjs';

const actions = createAgentActions({
  getProject: async () => readCurrentNormalizedProject()
});
const snapshot = await actions.snapshot();
const result = await actions.generate({
  expectedArchitectureHash: snapshot.architectureHash,
  disciplines: ['electrical', 'hvac', 'plumbing']
});
```

أعد قراءة المشروع داخل `getProject`؛ لا تعِد نسخة محفوظة قديمة من الواجهة. عند التغيير، يفشل الطلب ببصمة متعارضة أو يحتاج إعادة الحساب. `actions.render` يستقبل البصمة والنتيجة والصيغة والدور. هذه الأفعال لا تتصل بنموذج أو شبكة، ولا تحفظ أو تنشر شيئًا تلقائيًا.

## عقود إضافية

`fromPlannerGeometry` يخص ناتج `PlannerOutputContract/2` القديم. مرّر `validateModel` الأصلي و`level: {id, elevationM, heightM}` صراحة. وجود `floors: 2` في طلبه لا يصنع دورًا ثانيًا؛ العقد المرسوم الذي جرى فحصه دور واحد.

`fromCandidateIR(candidate, request, options)` يحتاج `adaptCandidateEnvelope` الأصلي و`validateNativeModel` الأصلي و`projectId` المطابق. يحافظ على العقد المجمد ويستخرج هندسته بعد التحقق. هذا المسار متاح برمجيًا؛ لم يُثبت تكامل طرف إلى طرف له في هذه الدفعة. لا تستبدل تحقق المصدر بدالة تعيد مصفوفة فارغة لإجبار القبول.

## بنية المدخل

| الحقل | الوصف |
|---|---|
| `schema` | `MIZAN-MEP-INPUT/1` |
| `units` | `m`، وكل XYZ بالمتر |
| `frame` | `X_EAST_Y_NORTH_Z_UP` |
| `architecture.source` | هوية المصدر، مراجعته، بصمته، تحذيراته |
| `architecture.levels` | معرف الدور ومنسوب أرضيته وارتفاعه |
| `architecture.rooms` | معرف الغرفة والدور، المضلع الصافي، الثقوب، الارتفاع |
| `architecture.walls/openings` | خلفية معمارية قابلة للربط وليست جدرانًا ينشئها محرك الأنظمة |
| `architecture.obstacles` | صناديق أعمدة وكمرات وموانع بمناسيب Z مطلقة |
| `services` | بيانات الكهرباء والتكييف والصحي والشبكات والرايزرات |
| `rules` | أحياز المسارات، الأسعار، وأصل افتراضات المشروع |

اتجاه الدور لا يحدد Z تلقائيًا. مواقع الأجهزة تستخدم Z مطلقًا. `routeHeightM` نسبي لأرضية الدور. `startInvertM` و`endInvertM` نسبيان أيضًا؛ يسمح بالقيم السالبة للصرف تحت الأرضية. اتجاه الصرف من `fromId` إلى `toId` فقط، وليس انعكاسًا تلقائيًا.

## ربط الأجهزة بين التخصصات

ضع الاستهلاك الكهربائي الفعلي في جهاز التكييف أو المضخة تحت `ratedInputW`. ضع في الحمل الكهربائي المقابل `sourceEquipmentId` مساويًا لمعرف الجهاز. يُكشف الغياب والتكرار واختلاف القدرة. الأجهزة التي لا تحمل `ratedInputW` لا تدخل هذا التحقق؛ يجب استكمال بياناتها في واجهة المشروع.

القدرة الحرارية للمياه محسوبة في جدول مستقل، ولا تتحول تلقائيًا إلى حمل دائري. اختيار سخان فعلي ودائرته وعامل تشغيله خطوة منفصلة.

## الرايزرات وتعدد الأدوار

أدخل جهازين/عقدتين من التخصص نفسه في دورين مختلفين وعلى XY واحد، ثم:

```js
project.services.risers = [{
  id: 'PR1', discipline: 'plumbing',
  fromId: 'RISER-GF', toId: 'RISER-FF',
  layer: 'P-RISER', kind: 'cold_water', systemId: 'CW',
  widthM: 0.06, heightM: 0.06, clearanceM: 0.03
}];
```

يُرسم الرايزر بالمناسيب الفعلية ويظهر في سجلي الدورين. الرايزر المائل أو المزاح يحتاج مسارًا متخصصًا عبر Plugin؛ لا تُسحب العقد لتتطابق من تلقاء نفسها. اختراق البلاطة يظل بحاجة مراجعة، ولا يصدر المحرك إذنًا بالثقب.

## التخزين وإعادة الحساب في التطبيق

خزّن المعرفات والبصمات والوحدات وقيم المدخلات وأصل القاعدة مع كل مسودة. عند تحرير المخطط أعِد المحوّل، ثم أعد الحساب. `verifyBinding` يكشف تغيّر المدخل، و`verifyResult` يكشف تعديل محتوى النتيجة المحفوظة. التصدير يفحص الاثنين.

احفظ مرحلة مراجعة التخصصات مستقلة عن تقييم التوزيع المعماري. يجب أن يستطيع العميل فتح التصميم المعماري حتى مع نقص المناخ أو بيانات الكابلات؛ اعرض نواقص التخصص في موضعه، ولا تحوّله إلى تعطّل عام للبرنامج.
