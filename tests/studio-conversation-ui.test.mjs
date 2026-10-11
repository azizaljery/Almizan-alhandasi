import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlanSurfaceMount,studioRequirementRows,composeStudioPrompt} from '../dist/studio-simple.mjs';
class Node {
 constructor(id){this.id=id;this.children=[];this.parentNode=null;}
 get nextSibling(){const list=this.parentNode?.children||[];return list[list.indexOf(this)+1]||null;}
 append(node){this.insertBefore(node,null);}
 insertBefore(node,next){if(node.parentNode){const list=node.parentNode.children;list.splice(list.indexOf(node),1);}const index=next?this.children.indexOf(next):this.children.length;this.children.splice(index,0,node);node.parentNode=this;}
}
test('conversation relocates the one live plan subtree and restores original location without cloning',()=>{
 const original=new Node('original'),slot=new Node('studioPlanSlot'),out=new Node('out'),plan=new Node('plan'),viewer=new Node('view'),after=new Node('after');
 out.append(plan);out.append(viewer);original.append(out);original.append(after);const callback=()=>42;plan.listener=callback;
 const doc={getElementById:id=>({out,studioPlanSlot:slot})[id],createComment:()=>new Node('anchor')};const mount=createPlanSurfaceMount(doc);
 mount.showConversation();mount.showConversation();assert.equal(slot.children.length,1);assert.equal(slot.children[0],out);assert.equal(out.children[0],plan);assert.equal(plan.listener,callback);assert.equal(out.children[1],viewer);
 mount.showAdvanced();assert.equal(out.parentNode,original);assert.equal(out.nextSibling,after);assert.equal(slot.children.length,0);
 mount.showConversation();assert.equal(out.children[1],viewer);
});
test('requirements card retains every unsupported/unmet row instead of truncating mandatory evidence',()=>{
 const rows=Array.from({length:15},(_,i)=>({label:'طلب '+i,state:i%2?'unsupported':'unmet',detail:'دليل '+i}));assert.deepEqual(studioRequirementRows({requirementsAudit:rows}),rows);
});
test('restored accepted requirements are not described as measured geometry',()=>{
 const rows=studioRequirementRows({studioSession:{understanding:{constraints:[{text:'ثلاث غرف نوم',sourceMessageId:'m1'}]}}});assert.equal(rows[0].label,'ثلاث غرف نوم');assert.equal(rows[0].state,'unverified');assert.match(rows[0].detail,/لم تثبت/);
});
test('prompt uses persisted accepted customer sources, excluding suggestions and rejected requests',()=>{
 const session={messages:[{id:'m1',role:'user',text:'ثلاث غرف نوم'},{id:'m2',role:'assistant',text:'افتراض فناء كبير'},{id:'m3',role:'user',text:'احذف المطبخ'},{id:'m4',role:'user',text:'مطبخ 6×4'}],understandingHistory:[{sourceMessageIds:['m1']}],understanding:{sourceMessageIds:['m1','m4']}};
 const prompt=composeStudioPrompt(session,'قرّب الطعام');assert.match(prompt,/ثلاث غرف نوم/);assert.match(prompt,/مطبخ 6×4/);assert.match(prompt,/قرّب الطعام/);assert.doesNotMatch(prompt,/افتراض فناء|احذف المطبخ/);
});
test('HTML defines one original plan and viewer and separate understanding/plan approval actions',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 for(const id of ['out','plan','view','studioPlanSlot','studioApprove','studioApprovePlan','studioCancel'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
 assert.ok(html.indexOf('id="studioPlanSlot"')<html.indexOf('id="studioRequestForm"'));
 assert.match(html,/الموافقة هنا تعني اختيارك للتصميم الأولي/);
});
