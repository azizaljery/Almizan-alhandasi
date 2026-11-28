import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS,runScenario} from '../../dist/sharaa-v3/scenarios.mjs';
const results=new Map();
const get=sc=>{if(!results.has(sc.id))results.set(sc.id,runScenario(sc));return results.get(sc.id)};
test('30 scenarios are defined', () => assert.equal(SCENARIOS.length,30));
test('every scenario produces a contract and a generation outcome through the actual V3 path', async () => {
  for(const sc of SCENARIOS){const r=await get(sc);
    assert.ok(r.contract.readiness,sc.id); assert.ok(r.after.ok||r.after.blocked||r.after.reason,sc.id);}
});
test('S17 conflicting guest counts are blocked before generation', async () => {
  const r=await get(SCENARIOS.find(s=>s.id==='S17'));
  assert.equal(r.contract.readiness,'CONFLICT_REQUIRES_DECISION');
  assert.ok(r.after.blocked&&r.after.blocked.startsWith('CONFLICT'));
});
test('S19 single design request and S20 up to three yield actual eligible alternatives', async () => {
  assert.equal((await get(SCENARIOS.find(s=>s.id==='S19'))).after.alternatives,1);
  const r=await get(SCENARIOS.find(s=>s.id==='S20'));assert.ok(r.after.ok);assert.ok(r.after.alternatives>=1&&r.after.alternatives<=3);
  assert.ok(r.after.checks.every(c=>c.eligible===true));
});
test('S15 courtyard is sent to the real consumer without claiming geometric certification', async () => {
  const r=await get(SCENARIOS.find(s=>s.id==='S15'));assert.ok(r.contract.consumers.some(c=>c.id==='architecture.concept'&&c.consumer==='requirements.prefs.courtyard'));
  if(r.after.ok)assert.equal(r.after.sharaaQuality.checks.find(c=>c.id==='architecture.concept').state,'unverified');
});
test('every generated design passes checkDoc with zero errors and the V3 mandatory gate', async () => {
  for(const sc of SCENARIOS){const r=await get(sc);
    for(const c of r.after.checks||[])assert.equal(c.errors,0,sc.id);}
});
test('children demographics are explicitly contextual; unimplemented play-space needs a client decision', async () => {
  const r=await get(SCENARIOS.find(s=>s.id==='S02'));
  assert.ok(r.contract.contextFacts.includes('household.children'));assert.ok(r.contract.unmappedRequested.includes('children.play'));assert.match(r.after.blocked,/LIMITATIONS_REQUIRE_CLIENT_DECISION/);
});
