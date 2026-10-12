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

test('selected alternatives retain a validated short-hall organization for two independent programs',async()=>{
 const fixtures=[
  normalizeRooms(defaultRooms()),
  normalizeRooms(defaultRooms({bedrooms:3,majlis:1,baths:2,kitchens:1})),
 ];
 const unionVerticalSpan=corridors=>{
  const xs=[...new Set(corridors.flatMap(c=>[c.x,c.x+c.w]))].sort((a,b)=>a-b);let longest=0;
  for(let i=0;i<xs.length-1;i++){
   if(xs[i+1]-xs[i]<1e-9)continue;const x=(xs[i]+xs[i+1])/2;
   const intervals=corridors.filter(c=>c.x<=x&&c.x+c.w>=x).map(c=>[c.y,c.y+c.h]).sort((a,b)=>a[0]-b[0]);
   let start=null,end=null;
   for(const [a,b]of intervals){if(start===null){start=a;end=b;}else if(a<=end+1e-8)end=Math.max(end,b);else{longest=Math.max(longest,end-start);start=a;end=b;}}
   if(start!==null)longest=Math.max(longest,end-start);
  }
  return longest;
 };
 for(const rooms of fixtures){
  const result=await runMultiEngineDesign({plot,rooms,selectedShape:'rect',seed:1});
  const baseline=result.models.find(m=>m.integration.alternativeKey==='rect-baseline');
  const clustered=result.models.find(m=>m.integration.alternativeKey.startsWith('rect-clustered-'));
  assert.ok(baseline&&clustered,'the existing global diversity gate should retain both access organizations');
  const clusteredAlternatives=result.models.filter(m=>m.integration.alternativeKey.startsWith('rect-clustered-'));
  assert.ok(clusteredAlternatives.length>=2,'retain distinct short-hall organizations when the same gate admits them');
  const clusteredGraphs=clusteredAlternatives.map(m=>spatialRelationDescriptor(m));
  assert.ok(clusteredGraphs.every(g=>g.valid));
  assert.ok(clusteredGraphs.some((a,i)=>clusteredGraphs.slice(i+1).some(b=>spatialRelationDistance(a,b)>.12)));
  for(const model of [baseline,clustered]){
   assert.deepEqual(model.program,rooms);
   assert.ok(result.decision.reviewIds.includes(model.integration.reviewId));
  }
  const baselineRatio=unionVerticalSpan(baseline.corridors)/baseline.building.h;
  const clusteredRatio=unionVerticalSpan(clustered.corridors)/clustered.building.h;
  assert.ok(baselineRatio>.9&&clusteredRatio<.75,`continuous corridor union ${baselineRatio.toFixed(3)} → ${clusteredRatio.toFixed(3)}`);
  const before=spatialRelationDescriptor(baseline),after=spatialRelationDescriptor(clustered);
  assert.ok(before.valid&&after.valid);
  assert.ok(spatialRelationDistance(before,after)>.12);
 }
});
