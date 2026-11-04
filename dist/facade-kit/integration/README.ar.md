# الربط مع وكيل موقع الميزان

المحول يستدعي الدوال الموجودة في `dist/facade-realism/model.mjs` و`dist/draw/doc.mjs`. راجعت نسخها عند الإيداع `c8acdd3e4d14f30c59213d3abcca5625e9f0707e`؛ لا تستبدل الملفات الأصلية بالحزمة. تحقق من واجهات الدوال إذا تغير الفرع.

## توصيل الدوال

مثال بعد نسخ الحزمة إلى `dist/facade-kit/`؛ ضع هذا الملف في `dist/` وعدل مصدر المستند وقواعد البروز حسب تطبيقك:

```js
import * as THREE from './vendor/three.module.js'; // نسخة الموقع r160
import {buildAllSides,sideTransform} from './facade-realism/model.mjs';
import {validateDoc} from './draw/doc.mjs';
import {connectMizanFacadeAgent} from './facade-kit/integration/mizan-adapter.mjs';
import {createFacadeViewer,exportFacadeGLB,downloadBlob}
  from './facade-kit/src/index.mjs';

export function connectFacadePanel({studio,facadeRules,canvas}) {
  const actions=connectMizanFacadeAgent({
    getDocument:()=>studio.getActiveDocument(), // استبدله بمصدر المستند الفعلي
    buildAllSides,sideTransform,validateDoc,
    getFacadeOptions:doc=>({
      frontSide:facadeRules.frontSideFor(doc),
      maxProjectionM:facadeRules.maxProjectionFor(doc), // الأربع جهات، من المشروع
      roofSurfaces:facadeRules.roofSurfacesFor(doc), // [] إن لم تتوفر هندسة موثوقة
      sourceRevision:'REPLACE_WITH_TESTED_SITE_COMMIT',
      stone:{widthM:.6,heightM:.3,jointM:.008,recessM:.012}
    })
  });
  let viewer;
  return {
    actions,
    async show(style='A') {
      const envelope=await actions.call('facade.generate',{
        expectedDocumentHash:await actions.documentHash(),style
      });
      // أعد التحقق من الحداثة فور العرض؛ قد يتغير المستند أثناء تجهيز الواجهة.
      const current=await actions.call('facade.get',{resultId:envelope.resultId});
      viewer?.dispose();
      viewer=await createFacadeViewer(THREE,canvas,current.result);
      return current;
    },
    async exportGLB(resultId) {
      const current=await actions.call('facade.get',{resultId});
      if(viewer?.model.group.userData.resultHash!==current.resultId)
        throw new Error('VIEWER_RESULT_MISMATCH');
      downloadBlob(await exportFacadeGLB(viewer.model),'mizan-facade.glb');
    },
    // استدعها عند تبديل المشروع أو إغلاق اللوحة أو تغيير العمارة.
    clear(){viewer?.dispose();viewer=null;actions.clear();}
  };
}
```

`studio` و`facadeRules` أسماء نقاط ربط توضيحية؛ ليست ادعاء بوجود كائنين بهذين الاسمين في الموقع. يجب على الوكيل ربطهما بمصادر الحالة الموجودة فعلاً. الدوال الأصلية ثلاثتها موجودة في المصدر الذي فُحص.

لا تستخدم `dist/facade-realism.html` داخل شاشة العملاء. الحزمة لا تعتمد تلك الصفحة. لا تضف المثال أو بيانات C1 أو الاختبارات أو تقارير البحث إلى حزمة العملاء. اسمح فقط بوحدات التشغيل ومكتباتها وتراخيصها والأصول المعتمدة.

## تسجيل الأدوات لدى الوكيل

`agent-tools.schema.json` يحتوي أسماء الأدوات ومخططات JSON لمدخلاتها. حوّلها إلى تنسيق أدوات الوكيل الحالي؛ لا تغيّر مزود النموذج أو مفاتيحه. عند الاستدعاء مرر الاسم والوسائط إلى `actions.call(name,args)`. لا تسمح للوكيل باستدعاء JavaScript حر أو تعديل مستند العمارة عبر هذه الأدوات.

| الأمر | الناتج والسلوك |
|---|---|
| `facade.generate` | نتيجة مع `resultId` وبصمة المستند؛ يرفض البصمة القديمة |
| `facade.edit` | تعديل `style` وحقول `stone` المحددة فقط، مع إعادة توليد من المستند الحالي |
| `facade.validate` | `integrity` و`fresh` والتحذيرات؛ لا اعتماد بصري أو نظامي |
| `facade.get` | قراءة نتيجة سليمة وحديثة؛ خلاف ذلك خطأ `STALE_FACADE` |

النقطة/الشرطة في أسماء الأدوات قد لا تناسب تنسيق وكيلك؛ يمكن تحويل الاسم في طبقة التسجيل فقط مع إعادته إلى الاسم الأصلي قبل `actions.call`.

لا ترسل الغلاف الكامل الذي يضم آلاف المضلعات إلى سياق النموذج اللغوي. خزنه في واجهة التطبيق، وأعد للوكيل ملخصًا: `resultId`، والبديل، والبصمات، والتحذيرات. اعرض الهندسة داخل التطبيق عبر النتيجة المحلية. لا توجد خدمة خادم أو شبكة أو وسيط مفاتيح داخل الحزمة.

إن كان التوليد على الخادم، اجعل مصدر المستند وقواعد البروز من جلسة المستخدم المصادق عليها، ولا تقبلها من النموذج كمدخلات موثوقة. خصص مثيلًا لكل جلسة، وحد زمن/حجم الطلبات في طبقة الخدمة. التنفيذ الحالي متزامن هندسيًا؛ المخططات الضخمة تحتاج Web Worker/عامل خادم، وهو غير مضمّن.

## تحميل خامات المشروع

```js
import {loadSurfaceMaps,createFacadeViewer} from './facade-kit/src/index.mjs';
const stone=await loadSurfaceMaps(THREE,reviewedStoneManifest,{
  baseUrl:location.href,maxAnisotropy:4
});
const viewer=await createFacadeViewer(THREE,canvas,packet,{
  surfaceAssets:{stone},
  environmentAsset:reviewedHdrManifest,
  assetOptions:{baseUrl:location.href}
});
// بعد إغلاق العرض: viewer.dispose(); ثم stone.dispose();
```

حقول HDR: `{id,type:'environment',name,rightsStatus,source,license,file:{url,sha256}}`. المدعوم RGBE `.hdr` وليس EXR. ملف الصورة حتى 32 MiB؛ خرائط الأسطح حتى 16 مليون بكسل بعد فكها. HDR حتى 8 ملايين بكسل، مع تحقق من أبعاده قبل فكّه؛ استخدم ملفات موثوقة ومحدودة الأبعاد.

التحميل من المصدر نفسه افتراضيًا؛ تُرفض إعادة التوجيه. `allowRemote:true` اختيار صريح من التطبيق فقط مع CORS والسياسات المعتمدة. لا يستخدم المصير صورًا من الإنترنت أو يختار ترخيصًا تلقائيًا. تأكد من normal OpenGL ومن أبعاد الخامة بالمتر؛ خرائط sRGB للون فقط، والبقية بيانات خطية.

## اختبار الدمج

```sh
npm test
npm run check
node scripts/verify-in-repo.mjs /absolute/path/to/Almizan-alhandasi
```

بعد الربط شغل بناء الموقع واختباراته وفحوص حزمة العملاء. جرّب مخططين مختلفين، والجهات الأربع، وتغيير البديل، وتعديل جدار بعد التوليد، وتغيير قواعد البروز، وتصدير PNG/GLB، والجوال وSafari. لا يكفي اختبار C1 لاعتماد جميع المخططات.

اعرض صور A/B/C الملونة والرمادية بالكاميرا والإضاءة نفسهما، ثم مقربات حجر وزجاج ومدخل. لا تغيّر الاختبارات الأصلية لإخفاء فرق هندسي. أبقِ الفرع والمعاينة منفصلين عن الإنتاج إلى أن يراجع المالك الصور.
