import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildDesignRequest, runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { defaultRooms, normalizeRooms, validatePlot } from '../dist/planner.mjs';
import { generateCandidate, decideReviewed } from '../dist/integration/pipeline.mjs';
import { reviewCandidate } from '../dist/integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
import { spatialRelationDescriptor, spatialRelationDistance } from '../dist/spatial-relations.mjs';
import { circulationNetwork } from '../dist/circulation.mjs';
const plot=validatePlot({width:35,length:45,floors:1,entry:'s',streets:{s:true},coverage:.75});
const request=idea=>buildDesignRequest({plot,rooms:normalizeRooms(defaultRooms()),idea,discovery:{likes:[],rejects:[],avoids:[],life:{}}});
const generate=(r,variant)=>generateCandidate(r,'rect',{}, {shape:'rect',key:`rect-organization-test-${variant}`,mode:-1,widthRatio:1,seed:1,search:{variant}});
test('two same-program organizations survive real review and AZIZ with physical relationship evidence',async()=>{
 const r=await request('I want dining near both majlis');
 const pairs=[];
 for(const variant of [0,2]) { const g=await generate(r,variant); pairs.push({...g,review:await reviewCandidate(g.candidate,r)}); }
 const result=await decideReviewed(r,pairs);
 assert.equal(result.rejected.length,0); assert.ok(result.decision.selectedCandidateId);
 const [a,b]=pairs.map(p=>p.candidate.geometry);
 assert.deepEqual(a.program,b.program); assert.deepEqual(a.plot,b.plot);
 const [da,db]=[a,b].map(spatialRelationDescriptor);
 assert.ok(da.valid && db.valid); assert.ok(spatialRelationDistance(da,db)>.24);
 assert.notDeepEqual(da.evidence.accessEdges,db.evidence.accessEdges);
 assert.notDeepEqual(da.evidence.sharedWalls,db.evidence.sharedWalls);
 for(const {candidate} of pairs){
  assert.equal(candidate.producer.packageVersion,JSON.parse(readFileSync('vendor/claude-planner/package.json')).version);
  assert.equal(candidate.producer.sourceSha256,createHash('sha256').update(readFileSync('dist/claude/planner.mjs')).digest('hex'));
 }
});
test('recognized near and far requests reach native search before geometry selection',async()=>{
 const near=(await generate(await request('I want dining near both majlis'),0)).candidate.geometry;
 const far=(await generate(await request('I want dining far from both majlis'),0)).candidate.geometry;
 for(const id of ['room-0','room-1'])assert.ok(circulationNetwork(near).betweenRooms('room-3',id).metres+3<circulationNetwork(far).betweenRooms('room-3',id).metres);
});

test('public alternatives expose reviewed organizations through the same diversity gate',async()=>{
 const r=await runMultiEngineDesign({plot,rooms:normalizeRooms(defaultRooms()),idea:'I want dining near both majlis',seed:1});
 const organizations=r.models.filter(m=>m.integration.alternativeKey.includes('-organization-'));
 assert.ok(organizations.length>=2);
 const [a,b]=organizations;
 assert.deepEqual(a.program,b.program); assert.deepEqual(a.plot,b.plot);
 assert.ok(spatialRelationDistance(spatialRelationDescriptor(a),spatialRelationDescriptor(b))>.24);
 for(const m of organizations)assert.ok(r.decision.reviewIds.includes(m.integration.reviewId));
 assert.equal(r.selectedModel.integration.candidateId,r.decision.selectedCandidateId);
 assert.equal(r.searchEvidence.reviewRejected,0);
});
