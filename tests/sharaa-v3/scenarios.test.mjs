import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS,runScenario} from '../../dist/sharaa-v3/scenarios.mjs';
const results=new Map();
const get=sc=>{if(!results.has(sc.id))results.set(sc.id,runScenario(sc));return results.get(sc.id)};
test('30 scenarios are defined', () => assert.equal(SCENARIOS.length,30));
test('every scenario produces a contract and a generation outcome', () => {
  for(const sc of SCENARIOS){const r=get(sc);
    assert.ok(r.contract.readiness,sc.id); assert.ok(r.after.ok||r.after.blocked||r.after.reason,sc.id);}
});
test('S17 conflicting guest counts are blocked before generation', () => {
  const r=get(SCENARIOS.find(s=>s.id==='S17'));
  assert.equal(r.contract.readiness,'CONFLICT_REQUIRES_DECISION');
  assert.ok(r.after.blocked&&r.after.blocked.startsWith('CONFLICT'));
});
test('S19 single design request yields one alternative; S20 three', () => {
  assert.equal(get(SCENARIOS.find(s=>s.id==='S19'))?.after.alternatives,1);
  assert.equal(get(SCENARIOS.find(s=>s.id==='S20'))?.after.alternatives,3);
});
test('S15 requested courtyard concept is reported as unmapped, not silently dropped', () => {
  assert.ok(get(SCENARIOS.find(s=>s.id==='S15')).contract.unmappedRequested.includes('architecture.concept'));
});
test('every generated design passes checkDoc with zero errors', () => {
  for(const sc of SCENARIOS){const r=get(sc);
    for(const c of r.after.checks||[])assert.equal(c.errors,0,sc.id);}
});
test('children and household facts are reported as unmapped (not consumed by the generator)', () => {
  const r=get(SCENARIOS.find(s=>s.id==='S02'));
  assert.ok(r.contract.unmappedRequested.includes('household.children'));
});
