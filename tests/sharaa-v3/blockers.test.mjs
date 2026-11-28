// قائمة «ما يمنع التوليد»: كل مانع يظهر بسببه ومعه إجراء، لا رسالة عامة فقط.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrief,answer,readiness,acknowledge} from '../../dist/sharaa-v3/core.mjs';
import {blockerItems} from '../../dist/sharaa-v3/ui.mjs';
const land={"widthM":18,"depthM":30,"entries":["n"],"streets":[{"side":"n"}],"floors":1};
const packet=b=>({brief:b,readiness:readiness(b)});
test('التعارض يُعرض بسببه وبحقليه القابلين للتعديل',()=>{
 let b=answer(createBrief(land),'hospitality.men',true);b=answer(b,'hospitality.typical',10);b=answer(b,'hospitality.peak',5);
 const c=blockerItems(packet(b)).find(i=>i.kind==='conflict');
 assert.ok(c&&c.reason.length>10);assert.deepEqual(c.fields.map(f=>f.id).sort(),['hospitality.peak','hospitality.typical']);
});
test('القرارات الأساسية الناقصة تُعدَّد بأسئلتها',()=>{
 const b=createBrief(land),items=blockerItems(packet(b));
 assert.equal(items.filter(i=>i.kind==='missing').length,readiness(b).missing.length);
 assert.ok(items.every(i=>i.reason&&i.fields?.length));
});
test('الشرط الإلزامي غير المثبت يُعرض ولا يُعرض له توثيق',()=>{
 const b=answer(createBrief(land),'privacy.entrySight',true,{priority:'mandatory'});
 const h=blockerItems(packet(b)).find(i=>i.kind==='hard'&&i.fields[0].id==='privacy.entrySight');
 assert.ok(h&&!h.acknowledge);
});
test('النقطة غير الإلزامية غير الموثقة تقبل التوثيق وبعده تختفي',()=>{
 const b=answer(createBrief(land),'privacy.entrySight',true,{priority:'preferred'});
 const u=blockerItems(packet(b)).find(i=>i.kind==='unaccepted');
 assert.ok(u&&u.acknowledge==='privacy.entrySight');
 assert.ok(!blockerItems(packet(acknowledge(b,['privacy.entrySight']))).some(i=>i.kind==='unaccepted'));
});
