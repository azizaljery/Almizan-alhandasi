import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDesignRequest, runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { validatePlot, defaultRooms, normalizeRooms } from '../dist/planner.mjs';
import { extractShapeIntent } from '../dist/client-request.mjs';
const plot=validatePlot({width:35,length:45,floors:1,entry:'s',streets:{s:true},streetSetback:3,neighborSetback:1.5,coverage:.75});
const rooms=normalizeRooms(defaultRooms()).map(r=>({...r,side:'any'}));
test('explicit textual shape is a bound constraint independent of local or connected AI UI',async()=>{
 const r=await buildDesignRequest({plot,rooms,idea:'أبي بيت على شكل L'});
 assert.deepEqual(r.hardConstraints.find(c=>c.kind==='shape_allowed').value.shapes,['l']);
 const out=await runMultiEngineDesign({plot,rooms,idea:'أبي بيت على شكل L'});
 assert.ok(out.models.length>0); assert.ok(out.models.every(m=>m.shape==='l'));
});
test('negated textual shape never reappears in allowed shapes',async()=>{
 const r=await buildDesignRequest({plot,rooms,idea:'ما أبي بيت على شكل U'});
 assert.equal(r.hardConstraints.find(c=>c.kind==='shape_allowed').value.shapes.includes('u'),false);
});
test('an explicit text shape remains binding while a style card stays a soft preference',async()=>{
 const r=await buildDesignRequest({plot,rooms,idea:'أبي بيت على شكل L',discovery:{likes:['concept_comparison'],rejects:[]}});
 assert.deepEqual(r.hardConstraints.find(c=>c.kind==='shape_allowed').value.shapes,['l']);
 await assert.rejects(buildDesignRequest({plot,rooms,idea:'أبي بيت على شكل L',selectedShape:'u'}),/يتعارض/);
 await assert.rejects(buildDesignRequest({plot,rooms,idea:'أبي على شكل L وعلى شكل U'}),/أكثر من شكل/);
 assert.equal(extractShapeIntent('أبي بيت فناء مغلق').shape,'closed');
});
test('a liked template does not narrow generation to a forced L or U',async()=>{
 const r=await buildDesignRequest({plot,rooms,discovery:{likes:['concept_comparison'],rejects:[]}});
 assert.equal(r.hardConstraints.some(c=>c.kind==='shape_allowed'),false);
 const out=await runMultiEngineDesign({plot,rooms,discovery:{likes:['concept_comparison'],rejects:[]}});
 assert.ok(out.models.some(m=>m.shape==='rect'));
 assert.ok(out.models.some(m=>m.shape==='pavilions'));
});
test('new brief context invalidates the generation snapshot and AI proposals bind inputs',()=>{
 const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
 assert.match(app,/function engineeringSignature\(\).*state\.briefContext/);
 assert.match(app,/sourceFingerprint !== requestFingerprint\(requestInput\(\)\)/);
 assert.match(app,/proposalFingerprint !== requestFingerprint\(requestInput\(\)\)/);
});

test('new-ideas exclusion includes displayed alternatives even after selected shape changes',()=>{
 const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
 assert.match(app,/state\.alternatives\.filter\(sameProgram\)/);
 assert.match(app,/state\.history\.map\(entry => entry\.model\)\.filter\(sameProgram\)/);
});

test('studio distinguishes current work from an explicitly downloaded or archived conversation',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
 assert.match(html,/حفظ المخطط والمحادثة/);
 assert.match(html,/تحديث الصفحة وحده لا يحفظ عملك/);
 assert.match(html,/«تنزيل المشروع»/);
 assert.match(html,/«أرشيف الحساب»/);
 assert.doesNotMatch(html,/سجل المحادثة لا يُستعاد|كلاهما لا يحفظ سجل المحادثة نفسه/);
 assert.match(app,/آخر مخطط ناجح لم يتغير في هذه الجلسة/);
 assert.doesNotMatch(app,/آخر مخطط ناجح محفوظ|المخطط السابق محفوظًا/);
});
