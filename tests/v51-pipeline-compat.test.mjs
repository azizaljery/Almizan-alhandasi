import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRooms,normalizeRooms,validatePlot} from '../dist/planner.mjs';
import {buildDesignRequest,runMultiEngineDesign} from '../dist/multi-engine.mjs';
import {runPipeline,generateCandidate,decideReviewed} from '../dist/integration/pipeline.mjs';
const plot=validatePlot({width:35,length:45,entry:'s',streets:{s:true},floors:1,coverage:.75,streetSetback:3,neighborSetback:1.5});
const rooms=()=>normalizeRooms(defaultRooms());
function explicitProgram(){const program=rooms().filter(r=>r.type!=='bedroom');for(let i=0;i<4;i++)program.push({name:'Bedroom '+i,type:'bedroom',area:20,position:'back',side:'any'});program.find(r=>r.type==='kitchen').area=48;return program;}
test('V51 central request refuses originalText count and missing dimensions bypass',async()=>{
 const program=explicitProgram(),before=structuredClone(program);
 await assert.rejects(buildDesignRequest({plot,rooms:program,idea:'3 bedrooms and kitchen 8x6'}),/EXPLICIT_PROGRAM_CONSTRAINT_VIOLATED/);
 assert.deepEqual(program,before);
});
test('V51 central request refuses same-area kitchen without explicit dimensions',async()=>{
 const program=explicitProgram();await assert.rejects(buildDesignRequest({plot,rooms:program,idea:'kitchen 8x6'}),/EXPLICIT_PROGRAM_CONSTRAINT_VIOLATED/);
});
test('V51 direct pipeline refuses text count bypass independently',async()=>{
 const request=await buildDesignRequest({plot,rooms:explicitProgram()});request.interpretation.originalText='3 bedrooms';
 const result=await runPipeline(request,{shapes:['rect']});assert.equal(result.decision.status,'NEEDS_CLARIFICATION');assert.equal(result.pairs.length,0);assert.equal(result.aziz,null);
});
test('V51 direct pipeline refuses text dimension bypass independently',async()=>{
 const request=await buildDesignRequest({plot,rooms:explicitProgram()});request.interpretation.originalText='kitchen 8x6';
 const result=await runPipeline(request,{shapes:['rect']});assert.equal(result.decision.status,'NEEDS_CLARIFICATION');assert.equal(result.pairs.length,0);assert.equal(result.aziz,null);
});
test('V51 preserves shape and wing constraints and preference request evidence',async()=>{
 const request=await buildDesignRequest({plot,rooms:rooms(),selectedShape:'staggered',idea:'avoid long corridors'});
 assert.deepEqual(request.hardConstraints.find(c=>c.kind==='shape_allowed').value.shapes,['staggered']);
 assert.equal(request.hardConstraints.find(c=>c.kind==='wing_count_exact').value.count,2);
 assert.ok(request.softPreferences.length>0);
});
test('V51 preserves exploration descriptors and preference evaluations for legacy programs',async()=>{
 const out=await runMultiEngineDesign({plot,rooms:rooms(),selectedShape:'rect',idea:'avoid long corridors',seed:1});
 assert.equal(out.decision.status,'SELECTED_PRELIMINARY');assert.ok(out.models.length>1);
 assert.ok(out.models.every(m=>m.shape==='rect'&&m.exploration.descriptor));assert.ok(out.preferenceEvaluations.length>0);
});

test('V51 reviewed candidate cannot satisfy forbidden rotation with area or requested metadata',async()=>{
 const request=await buildDesignRequest({plot,rooms:rooms()});
 const generated=await generateCandidate(request,'rect');
 const actual=generated.candidate.geometry.rooms.find(r=>r.type==='kitchen');
 assert.notEqual(actual.w,actual.h);
 const constrained=structuredClone(request);const p=constrained.program.find(r=>r.id===actual.id);
 p.exactDimensionsM={widthM:actual.h,lengthM:actual.w};
 constrained.interpretation.originalText=`kitchen ${actual.h}x${actual.w}, no rotation`;
 const {contentHash,candidateId}=await import('../dist/integration/control/reference/identity.mjs');
 const candidate=structuredClone(generated.candidate);candidate.inputHash=await contentHash(constrained);candidate.candidateId=await candidateId(candidate);
 const {reviewCandidate}=await import('../dist/integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js');
 const review=await reviewCandidate(candidate,constrained);
 const result=await decideReviewed(constrained,[{candidate,review}]);
 assert.equal(result.decision.status,'NO_SELECTION');assert.equal(result.aziz,null);
 assert.ok(result.rejected.some(item=>item.failedChecks.includes('explicit-program-geometry')));
});
test('V51 request retains explicit room rotation policy without changing schema',async()=>{
 const program=rooms();program[0].dimensions={width:8,length:4,allowRotation:false};program[0].area=32;
 const request=await buildDesignRequest({plot,rooms:program});assert.equal(request.hardConstraints.find(c=>c.kind==='room_dimensions_exact').value.rotationAllowed,false);
});
