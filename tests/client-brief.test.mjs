import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDiscovery,buildClientBrief,applyBriefChoices} from '../dist/client-brief.mjs';
import {encodeProject,decodeProject} from '../dist/project.mjs';
import {defaultRooms,generateModel,validateModel} from '../dist/planner.mjs';
const d={likes:['family_layout'],rejects:['classic_living'],avoids:['غرف نوم مكشوفة أو قريبة من الضيافة','مطبخ بعيد عن الطعام والخدمات'],life:{guests:'متكررة',seniors:'موجودون'}};
const rooms=defaultRooms().map(r=>({...r,position:r.type==='majlis'?'back':r.type==='bedroom'?'front':r.position}));
const plot={width:30,length:40,floors:1,entry:'s',streets:{s:true}};
test('reviewed preferences affect the actual planner input without changing areas or sides',()=>{
 const before=structuredClone(rooms),brief=buildClientBrief(d,rooms);
 const next=applyBriefChoices(d,rooms,brief,brief.changes.map(c=>c.index));
 assert.deepEqual(rooms,before);assert.deepEqual(next.map(r=>[r.name,r.area,r.side]),rooms.map(r=>[r.name,r.area,r.side]));
 assert.ok(next.filter(r=>r.type==='bedroom').every(r=>r.position==='back'));
 assert.ok(next.filter(r=>r.type==='majlis').every(r=>r.position==='front'));
 const m=generateModel(plot,next);assert.deepEqual(validateModel(m),[]);assert.ok(m.program.filter(r=>r.type==='bedroom').every(r=>r.position==='back'));
 assert.ok(brief.questions.some(t=>t.includes('كبار السن')));
});
test('only selected changes apply and stale reviews reject',()=>{
 const brief=buildClientBrief(d,rooms),idx=brief.changes[0].index,next=applyBriefChoices(d,rooms,brief,[idx]);
 rooms.forEach((r,i)=>{if(i!==idx)assert.deepEqual(next[i],r)});
 assert.throws(()=>applyBriefChoices(d,[...rooms].reverse(),brief,[idx]),/تغيّر/);
 assert.throws(()=>applyBriefChoices({...d,life:{}},rooms,brief,[idx]),/تغيّر/);
 assert.deepEqual(applyBriefChoices(d,rooms,brief,[]),rooms);
});
test('discovery round-trips and legacy projects still load with empty preferences',()=>{
 const args={plot,rooms,palette:'classic',rates:{},costReserve:0,vat:0,idea:'رغبات البيت',model:null,discovery:d};
 const encoded=encodeProject(args);assert.deepEqual(decodeProject(encoded).discovery,d);
 const old=JSON.parse(encoded);delete old.draft.discovery;assert.deepEqual(decodeProject(JSON.stringify(old)).discovery,normalizeDiscovery());
 assert.ok(!encodeProject({...args,discovery:{...d,accessCode:'PRIVATE'}}).includes('PRIVATE'));
 old.draft.discovery={...d,life:{guests:'unknown'}};assert.throws(()=>decodeProject(JSON.stringify(old)));
});
test('invalid and contradictory saved choices reject; courtyard is explicitly unsupported',()=>{
 assert.throws(()=>normalizeDiscovery({...d,rejects:['family_layout']}));
 assert.throws(()=>normalizeDiscovery({...d,avoids:['unknown']}));
 const b=buildClientBrief({...normalizeDiscovery(),likes:['courtyard_privacy']},rooms);
 assert.ok(b.limits.some(t=>t.includes('لا ينشئ فناء')));assert.equal(b.changes.length,0);
});
