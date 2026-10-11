import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRooms,normalizeRooms,validatePlot} from '../dist/planner.mjs';
import {buildDesignRequest,runMultiEngineDesign} from '../dist/multi-engine.mjs';
import {generateCandidate,runPipeline,decideReviewed} from '../dist/integration/pipeline.mjs';
import {reviewCandidate} from '../dist/integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
const plot=validatePlot({width:35,length:45,entry:'s',streets:{s:true,n:false,e:false,w:false},floors:1,coverage:.75,streetSetback:3,neighborSetback:1.5});
const rooms=()=>normalizeRooms(defaultRooms());
const dimensional=(request,room,width,length,allowRotation=true)=>({...request,hardConstraints:[...request.hardConstraints,{id:'dimensions:'+room.id,kind:'explicit_dimensions',description:'Preserve requested room dimensions',value:{roomId:room.id,width,length,allowRotation},source:'user',priority:'must'}]});
test('request preserves room dimensions separately from area without mutating program',async()=>{
 const program=rooms();program[0].dimensions={width:8,length:4,allowRotation:true};const before=structuredClone(program);
 const request=await buildDesignRequest({plot,rooms:program});
 assert.deepEqual(request.hardConstraints.find(c=>c.kind==='explicit_dimensions')?.value,{roomId:'room-0',width:8,length:4,allowRotation:true});assert.deepEqual(program,before);
});
test('real pipeline refuses equal-area wrong dimensions before ranking',async()=>{
 const program=rooms();program[0].area=48;program[0].dimensions={width:8,length:6,allowRotation:true};
 await assert.rejects(runMultiEngineDesign({plot,rooms:program}),/EXPLICIT_DIMENSIONS_VIOLATED/);
});
test('real pipeline preserves legacy requests and accepts actual dimensions including rotation',async()=>{
 const request=await buildDesignRequest({plot,rooms:rooms()});const original=await generateCandidate(request,'rect');const room=original.candidate.geometry.rooms[0];
 for(const [w,h] of [[room.w,room.h],[room.h,room.w]]){
  const result=await runPipeline(dimensional(request,room,w,h),{shapes:['rect']});
  assert.equal(result.decision.status,'SELECTED_PRELIMINARY');assert.equal(result.pairs.length,1);
 }
 const legacy=await runPipeline(request,{shapes:['rect']});assert.equal(legacy.decision.status,'SELECTED_PRELIMINARY');
});
test('review gate cannot rank a same-area candidate with wrong requested geometry',async()=>{
 const request=await buildDesignRequest({plot,rooms:rooms()});const initial=await generateCandidate(request,'rect');const room=initial.candidate.geometry.rooms[0];
 const constrained=dimensional(request,room,room.w*2,room.h/2);
 // Generate under the same binding but bypass only generation gate, as a producer could.
 const {contentHash,candidateId}=await import('../dist/integration/control/reference/identity.mjs');
 const candidate=structuredClone(initial.candidate);candidate.inputHash=await contentHash(constrained);candidate.candidateId=await candidateId(candidate);
 const review=await reviewCandidate(candidate,constrained);const result=await decideReviewed(constrained,[{candidate,review}]);
 assert.equal(result.decision.status,'NO_SELECTION');assert.equal(result.aziz,null);assert.ok(result.rejected[0].failedChecks.includes('explicit-dimensions'));
});
test('rotation is forbidden when constraint explicitly disallows it',async()=>{
 const request=await buildDesignRequest({plot,rooms:rooms()});const generated=await generateCandidate(request,'rect');const room=generated.candidate.geometry.rooms[0];
 const result=await runPipeline(dimensional(request,room,room.h,room.w,false),{shapes:['rect']});
 assert.equal(result.decision.status,'NO_SELECTION');assert.ok(result.failures.some(f=>f.reason.includes('EXPLICIT_DIMENSIONS_VIOLATED')));
});
test('central request rejects extra bedrooms regardless of caller validation',async()=>{
 const program=rooms().filter(r=>r.type!=='bedroom');for(let i=0;i<4;i++) program.push({name:'Bedroom '+i,type:'bedroom',area:20,position:'back',side:'auto'});
 await assert.rejects(buildDesignRequest({plot,rooms:program,idea:'3 bedrooms and kitchen 8x6'}),/EXPLICIT_PROGRAM_CONSTRAINT_VIOLATED/);
});
test('direct pipeline validates explicit text dimensions even if caller omits hard constraint',async()=>{
 const program=rooms();program.find(r=>r.type==='kitchen').area=48;
 const request=await buildDesignRequest({plot,rooms:program});request.interpretation.originalText='kitchen 8x6';
 const result=await runPipeline(request,{shapes:['rect']});
 assert.equal(result.decision.status,'NO_SELECTION');assert.equal(result.aziz,null);assert.ok(result.failures.some(f=>f.reason.includes('EXPLICIT_DIMENSIONS_VIOLATED')));
});
test('direct pipeline refuses a text count mismatch before generating or ranking',async()=>{
 const request=await buildDesignRequest({plot,rooms:rooms()});request.interpretation.originalText='30 bedrooms';
 const result=await runPipeline(request,{shapes:['rect']});assert.equal(result.decision.status,'NEEDS_CLARIFICATION');assert.equal(result.pairs.length,0);assert.equal(result.aziz,null);
});
