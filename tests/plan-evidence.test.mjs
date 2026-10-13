import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { assessPlan, aggregateAxes, PLAN_EVIDENCE_VERSION } from '../dist/plan-evidence.mjs';

const model = generateModel({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }, defaultRooms());

test('assessPlan on a fully connected model returns honest ESTIMATE/PASS evidence carrying a formula version', () => {
  const e = assessPlan(model);
  assert.equal(e.version, PLAN_EVIDENCE_VERSION);
  assert.equal(e.nativeValidation.status, 'PASS');
  assert.deepEqual(e.nativeValidation.errors, []);
  assert.equal(e.access.status, 'PASS');
  assert.ok(Number.isFinite(e.access.score));
  assert.equal(e.privacy.status, 'ESTIMATE');
  assert.ok(e.privacy.score >= 0 && e.privacy.score <= 100);
  assert.equal(e.circulation.status, 'ESTIMATE');
  assert.ok(Number.isFinite(e.circulation.data.averageRouteM));
  assert.ok(Number.isFinite(e.efficiency.score));
  assert.ok(Number.isFinite(e.daylight.score));
});

test('assessPlan marks axes it has no real data source for as NOT_EVALUATED, never a guessed score', () => {
  const e = assessPlan(model);
  for (const axis of [e.ventilation, e.acoustic, e.solarOrientation, e.futureExpansion, e.economy, e.constructability, e.compliance, e.reference]) {
    assert.equal(axis.status, 'NOT_EVALUATED');
    assert.equal(axis.score, null);
    assert.ok(axis.detail.length > 0, 'an unevaluated axis must still say why, in Arabic prose');
  }
});

test('assessPlan drops privacy, access, circulation and daylight to NOT_EVALUATED when doors leave rooms unreachable', () => {
  const broken = structuredClone(model);
  broken.openings = broken.openings.filter(o => o.type !== 'door');
  const e = assessPlan(broken);
  assert.ok(e.nativeValidation.errors.length > 0, 'removing every door must be flagged as a real validation failure');
  assert.equal(e.nativeValidation.status, 'FAIL');
  assert.equal(e.access.status, 'NOT_EVALUATED');
  assert.equal(e.access.score, null);
  assert.equal(e.privacy.status, 'NOT_EVALUATED');
  assert.equal(e.privacy.score, null);
  assert.equal(e.circulation.status, 'NOT_EVALUATED');
  assert.equal(e.circulation.score, null);
  assert.equal(e.daylight.status, 'NOT_EVALUATED');
  assert.equal(e.daylight.score, null);
});

test('aggregateAxes reweights across only the evaluated axes and returns null — not a fabricated zero — when none are evaluated', () => {
  assert.deepEqual(aggregateAxes([]), { score: null, evaluatedWeight: 0, totalWeight: 0, evaluatedAxes: 0, totalAxes: 0 });
  const axes = [{ score: 80, weight: 10 }, { score: null, weight: 10 }, { score: 40, weight: 20 }];
  const result = aggregateAxes(axes);
  assert.equal(result.evaluatedAxes, 2);
  assert.equal(result.totalAxes, 3);
  assert.equal(result.evaluatedWeight, 30);
  assert.equal(result.totalWeight, 40);
  assert.ok(Math.abs(result.score - (80 * 10 + 40 * 20) / 30) < 1e-9);
});
