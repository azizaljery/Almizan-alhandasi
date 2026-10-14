// DEC-001 — candidateId collisions inside AZIZ. Direct tests of createAziz (no test imported it before).
// Contract: same id + different content => reject EVERY member, detected before the confidence filter,
// result independent of arrival order. Same id + identical content keeps its pre-existing behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAziz, fixedClock, fnv1aHash, stableStringify } from '../dist/integration/aziz/index.js';

const CLOCK = fixedClock('2026-10-14T00:00:00.000Z');
const REQ = { requestId: 'req-collision', context: { plotArea: 600, cityCode: 'unspecified', locale: 'ar' }, hardConstraints: [], softPreferences: [] };
const FP = fnv1aHash(stableStringify({ requestId: REQ.requestId, hardConstraints: REQ.hardConstraints, softPreferences: REQ.softPreferences, context: REQ.context }));
const rect = (x, y, w, h) => ({ points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const SHAPES = { RECT: { area: 331.5, rooms: 3 }, L: { area: 367.2, rooms: 4 }, U: { area: 413.1, rooms: 5 } };

function cand(id, engineId, shape, conf = 0.8) {
  const { area, rooms: n } = SHAPES[shape], h = area / 20;
  const rooms = Array.from({ length: n }, (_, i) => ({ roomId: `r${i}`, type: 'living', zone: 'family', boundary: rect(0, i, 20, h / n), clearArea: area / n }));
  return { candidateId: id, producedBy: engineId, producedByVersion: '1.0.0', invocationId: 'inv-' + engineId, schemaVersion: '1.0.0',
    createdAt: '2026-10-14T00:00:00.000Z', label: shape, geometryHash: 'h-' + shape, footprint: rect(0, 0, 20, h), rooms, adjacency: [], entryPoints: [],
    metrics: { grossArea: area, buildRatio: area / 600, roomCount: n }, engineConfidence: conf };
}
function out(engineId, candidates) {
  const t = CLOCK.nowIso();
  return { engineId, engineVersion: '1.0.0', invocationId: 'inv-' + engineId,
    capabilities: { disciplines: ['architectural'], supportsGeometry: true, supportsRequirements: false, supportsScoring: false, deterministic: true },
    confidence: 0.8, execution: { startedAt: t, completedAt: t, durationMs: 0, version: '1.0.0', status: 'ok' },
    provenance: { engineId, engineVersion: '1.0.0', invocationId: 'inv-' + engineId, requestedAt: t, completedAt: t, inputHash: FP },
    assumptions: [], warnings: [], constraintsEvaluated: [], candidates };
}
const aziz = createAziz({ activeProfile: 'balanced' }, CLOCK);
const run = (outputs) => aziz.process({ ...REQ, engineOutputs: outputs });

const perms = (a) => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
// every engine order x every candidate order inside each engine
function variants(outputs) {
  const all = [];
  for (const op of perms(outputs)) {
    const per = op.map((o) => perms(o.candidates).map((cs) => ({ ...o, candidates: cs })));
    const walk = (i, acc) => { if (i === per.length) { all.push(acc); return; } for (const v of per[i]) walk(i + 1, [...acc, v]); };
    walk(0, []);
  }
  return all;
}
// the geometry the selected id actually refers to (AZIZ exposes no geometry on its result)
function winnerAreas(st) {
  const id = st.selectedCandidateId;
  if (!id) return [];
  const rejectedEngines = new Set(st.candidatesRejected.filter((r) => r.candidateId === id).map((r) => r.engineId));
  return [...new Set(st.provenance.filter((p) => p.action === 'proposed' && p.subject === id && !rejectedEngines.has(p.actor))
    .map((p) => p.evidence.find((e) => e.startsWith('footprintArea=')) ?? ''))].sort();
}
const signature = (st) => JSON.stringify({ status: st.status, selected: st.selectedCandidateId, areas: winnerAreas(st),
  survived: [...st.candidatesSurvived].sort(), rejected: st.candidatesRejected.map((r) => `${r.candidateId}|${r.engineId}|${r.code}`).sort() });
async function allOutcomes(outputs) {
  const sigs = new Set(), states = [];
  for (const v of variants(outputs)) { const st = await run(v); sigs.add(signature(st)); states.push(st); }
  return { sigs, states };
}
const assertNoResurrection = (st, id) => {
  assert.ok(!st.candidatesSurvived.includes(id), 'rejected id survived');
  assert.notEqual(st.selectedCandidateId, id, 'rejected id selected');
  assert.ok(!st.scores.some((s) => s.candidateId === id), 'rejected id scored');
  assert.ok(!st.provenance.some((p) => p.action === 'accepted' && p.subject === id), 'rejected id accepted in trace');
};

test('same id, different content, ONE engine: every member rejected, independent of order', async () => {
  const { sigs, states } = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT'), cand('X', 'e1', 'L')])]);
  assert.equal(sigs.size, 1, 'outcome must not depend on candidate order');
  for (const st of states) {
    assert.equal(st.status, 'all-rejected');
    assert.equal(st.candidatesRejected.filter((r) => r.candidateId === 'X' && r.code === 'DUPLICATE_CANDIDATE').length, 2);
    assertNoResurrection(st, 'X');
  }
});

test('same id, different content, ONE engine, plus a unique candidate: only the unique one continues', async () => {
  const { sigs, states } = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT'), cand('X', 'e1', 'L'), cand('Y', 'e1', 'U')])]);
  assert.equal(sigs.size, 1);
  for (const st of states) { assert.equal(st.selectedCandidateId, 'Y'); assert.deepEqual(st.candidatesSurvived, ['Y']); assertNoResurrection(st, 'X'); }
});

test('same engine: identical twin + a different member under one id => all rejected (any order)', async () => {
  const { sigs, states } = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT'), cand('X', 'e1', 'RECT'), cand('X', 'e1', 'L')])]);
  assert.equal(sigs.size, 1);
  for (const st of states) { assert.equal(st.status, 'all-rejected'); assertNoResurrection(st, 'X'); }
});

test('different engines, different content: every member rejected, independent of order (regression)', async () => {
  const { sigs, states } = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT')]), out('e2', [cand('X', 'e2', 'L')])]);
  assert.equal(sigs.size, 1);
  for (const st of states) { assert.equal(st.status, 'all-rejected'); assertNoResurrection(st, 'X'); }
});

test('three engines colliding on one id: all rejected; unique candidate survives alone (regression)', async () => {
  const three = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT')]), out('e2', [cand('X', 'e2', 'L')]), out('e3', [cand('X', 'e3', 'U')])]);
  assert.equal(three.sigs.size, 1);
  assert.ok(three.states.every((st) => st.status === 'all-rejected'));
  const mixed = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT'), cand('Y', 'e1', 'U')]), out('e2', [cand('X', 'e2', 'L')])]);
  assert.equal(mixed.sigs.size, 1);
  assert.ok(mixed.states.every((st) => st.selectedCandidateId === 'Y' && st.candidatesSurvived.length === 1));
});

test('collision is detected BEFORE the confidence filter: a low-confidence peer cannot let the other member through', async () => {
  const { sigs, states } = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT', 0.9)]), out('e2', [cand('X', 'e2', 'L', 0.1)])]);
  assert.equal(sigs.size, 1);
  for (const st of states) {
    assert.equal(st.status, 'all-rejected');
    assert.deepEqual(st.candidatesRejected.map((r) => r.code), ['DUPLICATE_CANDIDATE', 'DUPLICATE_CANDIDATE']);
    assertNoResurrection(st, 'X');
  }
});

test('a low-confidence candidate with a UNIQUE id is still rejected by confidence (behaviour preserved)', async () => {
  const st = await run([out('e1', [cand('A', 'e1', 'RECT', 0.9), cand('B', 'e1', 'L', 0.1)])]);
  assert.equal(st.selectedCandidateId, 'A');
  assert.deepEqual(st.candidatesRejected.map((r) => `${r.candidateId}|${r.code}`), ['B|LOW_CONFIDENCE']);
});

test('pre-existing policy kept: identical content under one id across engines is rejected as before', async () => {
  const { sigs, states } = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT')]), out('e2', [cand('X', 'e2', 'RECT')])]);
  assert.equal(sigs.size, 1);
  assert.ok(states.every((st) => st.status === 'all-rejected'));
});

test('pre-existing policy kept: identical twin inside ONE engine collapses to a single candidate as before', async () => {
  const { sigs, states } = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT'), cand('X', 'e1', 'RECT')])]);
  assert.equal(sigs.size, 1);
  for (const st of states) { assert.equal(st.status, 'selected'); assert.equal(st.selectedCandidateId, 'X'); assert.deepEqual(winnerAreas(st), ['footprintArea=331.5']); }
});

test('control: no collision keeps the previous behaviour and is order independent', async () => {
  const { sigs, states } = await allOutcomes([out('e1', [cand('X', 'e1', 'RECT')]), out('e2', [cand('Y', 'e2', 'L')]), out('e3', [cand('Z', 'e3', 'U')])]);
  assert.equal(sigs.size, 1);
  assert.ok(states.every((st) => st.status === 'selected' && st.candidatesSurvived.length === 3));
});

test('different ids with identical design still dedupe order-independently (regression)', async () => {
  const { sigs } = await allOutcomes([out('e1', [cand('A', 'e1', 'RECT')]), out('e2', [cand('B', 'e2', 'RECT')])]);
  assert.equal(sigs.size, 1);
});
