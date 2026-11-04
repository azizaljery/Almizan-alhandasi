// اختبارات المرحلة الأولى: مولّد المفاهيم المعزول (dist/facade-kit/concepts). لا نشر ولا ربط بالإنتاج.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { runBuilding } from '../dist/facade-kit/concepts/run.mjs';
import { realize, assess, packageConcept, generate, gateAndSelect } from '../dist/facade-kit/concepts/generate.mjs';
import { signature, compareSignatures, verdict, labelGrid } from '../dist/facade-kit/concepts/signature.mjs';
import { analyzeFacade } from '../dist/facade-kit/concepts/analyze.mjs';
import { createFacadePackage, STYLES } from '../dist/facade-kit/src/model.mjs'; import { hash } from '../dist/facade-kit/src/core.mjs';
import { buildAllSides, sideTransform } from '../dist/facade-realism/model.mjs';
import { intersection, multiArea, layerMask } from '../dist/facade-kit/src/polygons.mjs';
const BUILDINGS=['C1','C4','C7','RECT','L','U'];
const R={}; for(const n of BUILDINGS) R[n]=await runBuilding(n);
const ZERO={s:0,n:0,e:0,w:0};
test('كل مبنى (RECT/L/U وC1/C4/C7): 12 مفهومًا تجتاز بوابتي الأمانة والمعقولية',()=>{
  for(const n of BUILDINGS){ const c=R[n].gen.candidates; assert.equal(c.length,12,n); for(const k of c){ assert.ok(k.assess.fidelity.pass,n+k.id); assert.ok(k.assess.plausibility.pass,n+k.id); } }
});
test('لكل مبنى ثلاثة مفاهيم مختارة كل زوج منها مقبول في بوابة التفرد (4 أبعاد مختلفة من 7 وحافة)',()=>{
  for(const n of BUILDINGS){ const sel=R[n].sel.selected; assert.ok(sel,n+' لا ثلاثية'); assert.equal(sel.ids.length,3);
    const c=sel.ids.map(i=>R[n].gen.candidates.find(x=>x.id===i)); for(const [i,j] of [[0,1],[0,2],[1,2]]){ const cmp=compareSignatures(c[i].sig,c[j].sig); assert.ok(verdict(cmp).accepted,`${n} ${c[i].id}/${c[j].id}`); assert.ok(cmp.differentDims>=4); assert.ok(cmp.edgeZone>=.35); } }
});
test('اختبار الحواف: الحواف (بلا الفتحات) تختلف بين الثلاثة بنسبة ≥ 35% على كل المباني',()=>{
  for(const n of BUILDINGS){ const sel=R[n].sel.selected.ids.map(i=>R[n].gen.candidates.find(x=>x.id===i)); for(const [i,j] of [[0,1],[0,2],[1,2]]) assert.ok(compareSignatures(sel[i].sig,sel[j].sig).edgeZone>=.35,n); }
});
test('الأمانة الهندسية: حزمة النواة تحفظ هندسة المسقط، لا بروز، ولا منطقة تغطي فتحة',async()=>{
  for(const n of BUILDINGS){ const r=R[n];     for(const id of r.sel.selected.ids){ const cand=r.gen.candidates.find(c=>c.id===id), pkg=await packageConcept(r.built,r.transforms,r.front,cand);
      assert.equal(pkg.style.id,'X'); assert.equal(pkg.concept.id,id); assert.deepEqual(pkg.maxProjectionM,ZERO);
      assert.equal(pkg.sourceGeometryHash,(await createFacadePackage(r.built,{style:'B',frontSide:r.front,maxProjectionM:ZERO,transforms:r.transforms,roofSurfaces:[]})).sourceGeometryHash);
      const wallsOut=Object.fromEntries(pkg.built[r.front].layers.filter(l=>l.role==='wall').map(l=>[l.piece,l]));
      const zones=pkg.built[r.front].layers.filter(l=>l.role==='concept-zone'); assert.ok(zones.length>=3,n+id);
      for(const z of zones){ assert.ok(Math.abs(z.o1-wallsOut[z.piece].o1)<1e-12,'وجه المنطقة = وجه الجدار'); }
      const ops=pkg.built[r.front].F.pieces.flatMap(p=>p.openings.map(o=>({...o,piece:p.i})));
      for(const z of zones)for(const o of ops.filter(o=>o.piece===z.piece)) assert.ok(multiArea(intersection(layerMask(z),[[[o.u0,o.z0],[o.u1,o.z0],[o.u1,o.z1],[o.u0,o.z1],[o.u0,o.z0]]]))<1e-9,'منطقة تغطي فتحة '+o.id);
      const srcOps=r.built[r.front].F.pieces.flatMap(p=>p.openings.map(o=>o.id)).sort(), outOps=pkg.built[r.front].F.pieces.flatMap(p=>p.openings.map(o=>o.id)).sort(); assert.deepEqual(outOps,srcOps);
    } }
});
test('انحدار الأمانة: حزم A/B/C (سياسة المشروع) مطابقة بايت-ببايت لما قبل إضافة النمط X',async()=>{
  const BASE={A:['1ed5208cf8eafbc3b41feadafe5cc03268416f16f131f5aad08d9db23041014a','28a01825fb5ccb870876d8d49d7a95a172125af4c0b561e32d1722f441eefc24'],B:['e93863953502cac9dbd7063c7728341fac1e7564f06a2b519d84fc660583c471','44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'],C:['33a74041b9ce9cd01f21b8571cde3e443803cf51d349946356c5e6f2585b89b0','44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a']}; // مأخوذة من الالتزام 78c9477 قبل التعديل
  const doc=JSON.parse(fs.readFileSync(new URL('./fixtures/facade/C1.json',import.meta.url),'utf8'));
  for(const v of ['A','B','C']){ const built=buildAllSides(doc,v), tr=Object.fromEntries(Object.keys(built).map(s=>[s,sideTransform(s,built[s].off)]));
    const p=await createFacadePackage(built,{style:v,frontSide:'s',maxProjectionM:ZERO,transforms:tr,roofSurfaces:[],sourceRevision:'regr',stone:{widthM:.6,heightM:.3,jointM:.008,recessM:.012}});
    assert.equal(await hash(p.built),BASE[v][0],v+' built'); assert.equal(await hash(p.cuts),BASE[v][1],v+' cuts'); }
});
test('خط الأساس: A/B/C بلا بروز متطابقة معماريًا (تباعد صفر) — الاختلاف مواد فقط',()=>{
  const r=R.C1, a=analyzeFacade(r.built,r.front), s=signature(a,[]); const cmp=compareSignatures(s,s); assert.equal(cmp.novelty,0); assert.equal(verdict(cmp).accepted,false);
});
test('تغيير اللون/الخامة وحده ليس تنوعًا: نفس التركيب بلوحة مختلفة ⇒ توقيع مطابق ويُرفض كتكرار',()=>{
  const r=R.C1, c=r.gen.candidates[0], a=analyzeFacade(r.built,r.front);
  const again=signature(a,realize(a,r.built,r.front,{...c.params,palette:'P3'})); const cmp=compareSignatures(c.sig,again); assert.equal(cmp.novelty,0); assert.equal(verdict(cmp).accepted,false);
});
test('الحتمية: نفس المبنى والبذرة ⇒ نفس الثلاثية',async()=>{
  const again=await runBuilding('RECT'); assert.deepEqual(again.sel.selected.ids,R.RECT.sel.selected.ids);
});
test('بوابة الأمانة ترفض منطقة تغطي فتحة',()=>{
  const r=R.RECT, a=analyzeFacade(r.built,r.front), w=a.pieces[0].windows[0];
  const comp={name:'bad',piece:a.pieces[0].piece,tone:'dark',group:'x',poly:[[[w.u0-.2,w.z0-.2],[w.u1+.2,w.z0-.2],[w.u1+.2,w.z1+.2],[w.u0-.2,w.z1+.2],[w.u0-.2,w.z0-.2]]],mp:[[[[w.u0-.2,w.z0-.2],[w.u1+.2,w.z0-.2],[w.u1+.2,w.z1+.2],[w.u0-.2,w.z1+.2],[w.u0-.2,w.z0-.2]]]],bb:{u0:w.u0-.2,u1:w.u1+.2,z0:w.z0-.2,z1:w.z1+.2},area:1};
  const res=assess(a,[comp]); assert.equal(res.fidelity.checks.find(c=>c.id==='openings-clear').ok,false); assert.equal(res.fidelity.pass,false);
});
test('النواة: النمط X يتطلب مفهومًا، والمفهوم يتطلب X، وخامة/نغمة مجهولة ترفض',async()=>{
  const r=R.RECT, base={frontSide:r.front,maxProjectionM:ZERO,transforms:r.transforms,roofSurfaces:[]};
  await assert.rejects(createFacadePackage(r.built,{...base,style:'X'}),/CONCEPT_REQUIRED/);
  await assert.rejects(createFacadePackage(r.built,{...base,style:'A',concept:{id:'k',zones:[]}}),/CONCEPT_REQUIRES_STYLE_X/);
  const z={name:'z',piece:0,ring:[[0,0],[1,0],[1,1],[0,1]],mat:'gold',tone:'dark'};
  await assert.rejects(createFacadePackage(r.built,{...base,style:'X',concept:{id:'k',zones:[z]}}),/CONCEPT_MATERIAL/);
  await assert.rejects(createFacadePackage(r.built,{...base,style:'X',concept:{id:'k',zones:[{...z,mat:'stone',tone:'neon'}]}}),/CONCEPT_TONE/);
  assert.ok(STYLES.A&&STYLES.B&&STYLES.C&&STYLES.X);
});
test('الأنماط المعتمدة A/B/C لم تُمسّ: تجاهل المفهوم لا يغيّر طبقاتها (صفر مناطق concept-zone)',async()=>{
  const r=R.C1; for(const v of ['A','B','C']){ const p=await createFacadePackage(buildAllSides(r.doc,v),{style:v,frontSide:'s',maxProjectionM:ZERO,transforms:r.transforms,roofSurfaces:[]}); assert.equal(Object.values(p.built).flatMap(b=>b.layers).filter(l=>l.role==='concept-zone').length,0); }
});
