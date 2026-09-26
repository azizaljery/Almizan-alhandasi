import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reviewCandidate,verifyBoundReview,CHECK_REGISTRY,describeRuleReferences } from '../adapters/mizan-review-v1.js';
import { contentHash,geometryHash,candidateId,summarizeChecks,canonicalJSON } from '../../../reference/identity.mjs';
import { validateEnvelope } from '../../engineering-core/contracts/mizan-ir-v1.adapter.js';
const read=(g,n)=>JSON.parse(fs.readFileSync(new URL(`../../../fixtures/${g}/${n}.json`,import.meta.url)));
const pair=(n='u-s')=>[read('candidates',n),read('requests',n)];
const rebind=async(c,r)=>{c.inputHash=await contentHash(r);c.geometryHash=await geometryHash(c);c.candidateId=await candidateId(c);};
for(const shape of ['rect','l','u'])for(const direction of ['s','n','e','w'])test(`G03/G06 ${shape}-${direction}: schema review + actual coverage, no blanket pass`,async()=>{
  const [c,r]=pair(`${shape}-${direction}`),out=await reviewCandidate(c,r);
  validateEnvelope(out,'review');assert.equal(await verifyBoundReview(out,c,r),true);
  assert.deepEqual(out.coverage,summarizeChecks(out.checks));assert.equal(out.checks.length,CHECK_REGISTRY.length);
  assert.equal(out.overall,'PRELIMINARY_INCOMPLETE');assert.equal(out.preliminaryOnly,true);
  for(const id of ['structural-model','soil','electrical-layout','plumbing-routing','hvac-system','native-validation','access-connectivity','headroom-code'])assert.equal(out.checks.find(c=>c.id===id).status,'NOT_EVALUATED');
  assert.equal(out.confidence.kind,'UNAVAILABLE');assert.equal(out.confidence.value,null);
  const evidence=new Set(out.findings.map(f=>f.id));for(const check of out.checks)for(const id of check.evidenceIds)assert.ok(evidence.has(id));
  assert.equal(out.coverage.fail,0);
});
test('G04 alternatives for same request have distinct reviews; edits invalidate cached review',async()=>{
  const [c,r]=pair(),d=structuredClone(c);d.geometry.openings[0].pos+=0.01;d.alternativeKey='variant-opening';await rebind(d,r);
  const a=await reviewCandidate(c,r),b=await reviewCandidate(d,r);assert.notEqual(a.reviewId,b.reviewId);assert.notEqual(a.candidateId,b.candidateId);
  await assert.rejects(verifyBoundReview(a,d,r),/REVIEW_BINDING_MISMATCH/);
  c.geometry.rooms[0].w+=0.1;await assert.rejects(verifyBoundReview(a,c,r),/GEOMETRY_HASH_MISMATCH/);
});
test('G06 evidence coverage and labels cannot be replaced by a success string',async()=>{
  const [c,r]=pair();const out=await reviewCandidate(c,r);
  out.overall='PASS_WITHIN_SCOPE';await assert.rejects(verifyBoundReview(out,c,r),/UNSUPPORTED_PASS/);
  out.overall='PRELIMINARY_INCOMPLETE';out.coverage.notEvaluated=0;await assert.rejects(verifyBoundReview(out,c,r),/COVERAGE_MISMATCH/);
});
test('G06 explicit cap violation blocks, exact tolerance supported, absent cap not applicable',async()=>{
  const [c,r]=pair();let out=await reviewCandidate(c,r);const area=out.findings.find(f=>f.checkId==='polygon-area').data.areaM2;
  assert.equal(out.checks.find(x=>x.id==='max-built-area').status,'NOT_APPLICABLE');
  for(const [cap,status] of [[228,'FAIL'],[area,'PASS'],[area-0.5e-6,'PASS'],[area-1e-3,'FAIL']]){
    r.plot.maxBuiltAreaM2=cap;await rebind(c,r);out=await reviewCandidate(c,r);assert.equal(out.checks.find(x=>x.id==='max-built-area').status,status);if(status==='FAIL')assert.equal(out.overall,'BLOCKED');
  }
});
test('G06 unsupported must, extra floors and unresolved interpretation remain visible',async()=>{
  const [c,r]=pair();r.hardConstraints.push({id:'MUST-OTHER',kind:'special-system',value:true,description:'Required system',source:'user',priority:'must'});r.plot.floorsRequested=2;r.interpretation.status='needs_confirmation';r.interpretation.unresolved=['system details'];await rebind(c,r);
  const out=await reviewCandidate(c,r);for(const id of ['hard-constraints','requested-floors','interpretation'])assert.equal(out.checks.find(x=>x.id===id).status,'NOT_EVALUATED');assert.equal(out.checks.length,CHECK_REGISTRY.length);
});
test('G03/G06 intrusion into courtyard is detected even with fresh matching hashes',async()=>{
  const [c,r]=pair();const v=c.geometry.courtyards[0];Object.assign(c.geometry.rooms[0],{x:v.x,y:v.y,w:v.w,h:v.h});await rebind(c,r);
  const out=await reviewCandidate(c,r);assert.equal(out.overall,'BLOCKED');assert.equal(out.checks.find(x=>x.id==='courtyard-void').status,'FAIL');
});
test('G07 original rule dates are metadata, no external certification inferred',async()=>{
  const refs=describeRuleReferences();assert.ok(refs.length>0);
  for(const ref of refs){assert.equal(ref.externalVerification,'NOT_AVAILABLE');assert.equal(ref.externalVerifiedAt,null);assert.equal(ref.declaredSource.verifiedAt,'2026-09-23');}
  const out=await reviewCandidate(...pair());assert.ok(out.references.some(x=>x.classification==='SYNTHETIC'));assert.ok(out.references.some(x=>x.classification==='HEURISTIC'));
  assert.equal(out.checks.find(x=>x.id==='corridor-code').status,'NOT_EVALUATED');
  assert.equal(out.checks.find(x=>x.id==='area-factor-boq').status,'ESTIMATE');assert.equal(out.checks.find(x=>x.id==='market-prices').status,'NOT_EVALUATED');
});
test('G07 no calibrated confidence without calibration evidence',async()=>{
  const [c,r]=pair(),out=await reviewCandidate(c,r);out.confidence={kind:'CALIBRATED',value:1,calibrated:true,method:'Metadata only'};
  await assert.rejects(verifyBoundReview(out,c,r),/CALIBRATION_EVIDENCE_UNAVAILABLE/);
});
test('G08 repeated reviews preserve geometry and all semantic results',async()=>{
  const [c,r]=pair(),before=canonicalJSON(c),a=await reviewCandidate(c,r),b=await reviewCandidate(c,r);
  delete a.telemetry;delete b.telemetry;assert.deepEqual(a,b);assert.equal(canonicalJSON(c),before);
});
test('G08 display massing parts have no effect on geometry review',async()=>{
  const [c,r]=pair(),a=await reviewCandidate(c,r);c.presentation.massingParts=[{x:0,y:0,w:1,h:1}];const b=await reviewCandidate(c,r);
  assert.equal(a.reviewId,b.reviewId);assert.deepEqual(a.checks,b.checks);
});
test('G02 input errors leave no successful review',async()=>{
  for(const file of ['unknown-units','null-rooms','bad-opening-position','reserved-roof-policy','missing-candidate-id'])await assert.rejects(reviewCandidate(read('negative',file),read('requests','u-s')));
});
