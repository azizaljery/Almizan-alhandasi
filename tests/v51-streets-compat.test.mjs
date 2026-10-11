import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeClientRequest } from '../dist/client-request.mjs';
import {defaultRooms,footprint} from '../dist/planner.mjs';
const plot={width:30,length:40,floors:1,streets:{n:false,s:true,e:false,w:false},entry:'s',streetSetback:3,neighborSetback:1.5,coverage:.75,maxBuiltArea:null};
test('north entrance on south-only land prompts clarification without adding a street',async()=>{
 const input={prompt:'المدخل من الشمال',plot:structuredClone(plot),rooms:defaultRooms(),mode:'modify'};
 const before=structuredClone(input), result=await analyzeClientRequest(input);
 assert.deepEqual(input,before);
 assert.equal(result.plotPatch.entry,'n');
 assert.equal(result.plotPatch.streets,undefined);
 assert.ok(result.questions.some(q=>/شارع|الشوارع/.test(q)));
 assert.ok(!result.assumptions.some(q=>/فُعّلت/.test(q)));
});
test('entrance changes preserve corner/multiple street envelopes and explicit setbacks',async()=>{
 for(const streets of [{...plot.streets,e:true},{n:true,s:true,e:true,w:true}]) {
  const p={...plot,streets}, before=footprint(p);
  const r=await analyzeClientRequest({prompt:'المدخل من الشرق',plot:p,rooms:defaultRooms(),mode:'modify'});
  assert.equal(r.plotPatch.streets,undefined);
  assert.deepEqual(footprint({...p,...r.plotPatch}),before);
 }
});
test('street edits invalidate the approved studio snapshot without changing legacy empty snapshots',async()=>{
 const {proposalInputsMatch}=await import('../dist/studio-simple.mjs');
 const p={width:30,length:40,entry:'s',maxBuiltArea:null,streets:{s:true}};
 assert.equal(proposalInputsMatch('طلب',p,{brief:'طلب',plot:structuredClone(p)}),true);
 assert.equal(proposalInputsMatch('طلب',{...p,streets:{s:true,n:true}},{brief:'طلب',plot:p}),false);
 assert.equal(proposalInputsMatch('طلب',{width:30,length:40,entry:'s',maxBuiltArea:null},{brief:'طلب',plot:{width:30,length:40,entry:'s',maxBuiltArea:null}}),true);
});
