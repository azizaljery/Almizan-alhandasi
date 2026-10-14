// AUDIT PHASE 1 — probe (not part of `npm test`; file name deliberately does not match tests/*.test.mjs).
// Goal: measure what the REAL AZIZ does for candidateId collisions, for every input permutation,
// and compare with the approved contract:
//   C1  Same ID + Different Content  -> ALL colliding members rejected, decision independent of arrival order.
//   C2  collision is detected BEFORE the confidence filter / ranking.
//   C3  Same ID + Identical Content  -> "pre-existing policy" (recorded as observed; not judged).
//   C4  no resurrection: a rejected ID never appears in survivors / scores / selection / trace.
// Nothing here modifies repo code. Run:  node audit/phase1/aziz-permutation.audit.mjs
import { createAziz, fixedClock, fnv1aHash, stableStringify } from '../../dist/integration/aziz/index.js';
import fs from 'node:fs';

const CLOCK = fixedClock('2026-10-14T00:00:00.000Z');
const REQ = { requestId: 'audit-req', context: { plotArea: 600, cityCode: 'unspecified', locale: 'ar' }, hardConstraints: [], softPreferences: [] };
const FP = fnv1aHash(stableStringify({ requestId: REQ.requestId, hardConstraints: REQ.hardConstraints, softPreferences: REQ.softPreferences, context: REQ.context }));

const rect = (x, y, w, h) => ({ points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
// RECT ≈ 331.5 m², L ≈ 367.2 m², U ≈ 413.1 m² (the figures used by the archive)
const SHAPES = {
  RECT: { w: 20, h: 16.575, area: 331.5, rooms: 3 },
  L: { w: 20, h: 18.36, area: 367.2, rooms: 4 },
  U: { w: 20, h: 20.655, area: 413.1, rooms: 5 },
};
function cand(id, engineId, shape, conf = 0.8) {
  const s = SHAPES[shape];
  const rooms = Array.from({ length: s.rooms }, (_, i) => ({ roomId: `r${i}`, type: 'living', zone: 'family', boundary: rect(0, i, s.w, s.h / s.rooms), clearArea: s.area / s.rooms }));
  return {
    candidateId: id, producedBy: engineId, producedByVersion: '1.0.0', invocationId: 'inv-' + engineId, schemaVersion: '1.0.0',
    createdAt: '2026-10-14T00:00:00.000Z', label: shape, geometryHash: 'h-' + shape, footprint: rect(0, 0, s.w, s.h), rooms,
    adjacency: [], entryPoints: [], metrics: { grossArea: s.area, buildRatio: s.area / 600, roomCount: rooms.length }, engineConfidence: conf,
  };
}
function engineOut(engineId, candidates, confidence = 0.8) {
  return {
    engineId, engineVersion: '1.0.0', invocationId: 'inv-' + engineId,
    capabilities: { disciplines: ['architectural'], supportsGeometry: true, supportsRequirements: false, supportsScoring: false, deterministic: true },
    confidence, execution: { startedAt: CLOCK.nowIso(), completedAt: CLOCK.nowIso(), durationMs: 0, version: '1.0.0', status: 'ok' },
    provenance: { engineId, engineVersion: '1.0.0', invocationId: 'inv-' + engineId, requestedAt: CLOCK.nowIso(), completedAt: CLOCK.nowIso(), inputHash: FP },
    assumptions: [], warnings: [], constraintsEvaluated: [], candidates,
  };
}
const aziz = createAziz({ activeProfile: 'balanced' }, CLOCK);
const run = (outputs) => aziz.process({ ...REQ, engineOutputs: outputs });

function perms(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}
// Geometry that the decision ACTUALLY refers to: footprint areas of the "proposed" provenance entries of the
// selected id whose producer was not rejected for that id. (AZIZ exposes no geometry on its result, so this is the
// only evidence available from the result object itself.)
function winnerAreas(state) {
  const id = state.selectedCandidateId;
  if (!id) return [];
  const rejectedEngines = new Set(state.candidatesRejected.filter((r) => r.candidateId === id).map((r) => r.engineId));
  return [...new Set(state.provenance
    .filter((p) => p.action === 'proposed' && p.subject === id && !rejectedEngines.has(p.actor))
    .map((p) => (p.evidence.find((e) => e.startsWith('footprintArea=')) ?? '').replace('footprintArea=', '')))].sort();
}
// Signature of an outcome that must be arrival-order independent (now INCLUDES the geometry the id points at).
function sig(state) {
  return JSON.stringify({
    status: state.status,
    selected: state.selectedCandidateId,
    selectedGeometryAreas: winnerAreas(state),
    survived: [...state.candidatesSurvived].sort(),
    rejected: state.candidatesRejected.map((r) => `${r.candidateId}|${r.engineId}|${r.code}`).sort(),
  });
}

const results = [];
function scenario(name, contract, build, opts = {}) {
  // `build()` returns the base list of engine outputs; permute engine order AND candidate order within engines.
  const base = build();
  const variants = new Map();
  const outputsPerms = perms(base);
  const allVariants = [];
  for (const op of outputsPerms) {
    // also reverse candidate order inside each engine output
    for (const rev of [false, true]) {
      const outs = op.map((o) => ({ ...o, candidates: rev ? [...o.candidates].reverse() : [...o.candidates] }));
      allVariants.push(outs);
    }
  }
  const observed = [];
  const survivorsLeak = [];
  return Promise.all(allVariants.map((outs) => run(outs))).then((states) => {
    states.forEach((st, i) => {
      const s = sig(st);
      variants.set(s, (variants.get(s) ?? 0) + 1);
      observed.push({ sig: s, selectedLabel: winnerAreas(st).join('+') || null });
      if (opts.rejectedIds) {
        for (const id of opts.rejectedIds) {
          const leaked = st.candidatesSurvived.includes(id) || st.selectedCandidateId === id || st.scores.some((x) => x.candidateId === id);
          if (leaked) survivorsLeak.push(id);
        }
      }
    });
    const distinctSelectedGeometry = new Set(observed.map((o) => o.selectedLabel));
    const first = states[0];
    results.push({
      name, contract, permutations: allVariants.length, distinctOutcomes: variants.size,
      orderIndependent: variants.size === 1, distinctSelectedGeometry: [...distinctSelectedGeometry],
      status: [...new Set(states.map((s) => s.status))], selected: [...new Set(states.map((s) => s.selectedCandidateId))],
      rejectionCodes: [...new Set(states.flatMap((s) => s.candidatesRejected.map((r) => r.code)))],
      survivorsLeak: survivorsLeak.length, firstRejections: first.candidatesRejected.map((r) => ({ id: r.candidateId, by: r.engineId, code: r.code, evidence: r.evidence })),
      provenanceEntryIdDuplicates: (() => { const ids = first.provenance.map((p) => p.entryId); return ids.length - new Set(ids).size; })(),
    });
  });
}

await scenario('S1 cross-engine: X=RECT (e1) vs X=L (e2)', 'C1: reject both, order independent',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT')]), engineOut('e2', [cand('X', 'e2', 'L')])], { rejectedIds: ['X'] });

await scenario('S2 SAME engine: X=RECT, X=L in one output', 'C1: reject both, order independent',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT'), cand('X', 'e1', 'L')])], { rejectedIds: ['X'] });

await scenario('S2b SAME engine + a unique Y', 'C1 + unique continues',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT'), cand('X', 'e1', 'L'), cand('Y', 'e1', 'U')])], { rejectedIds: ['X'] });

await scenario('S3 three-way cross-engine X=RECT/L/U', 'C1: reject all three',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT')]), engineOut('e2', [cand('X', 'e2', 'L')]), engineOut('e3', [cand('X', 'e3', 'U')])], { rejectedIds: ['X'] });

await scenario('S4 collision group + unique Y (cross-engine)', 'C1: only Y passes',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT'), cand('Y', 'e1', 'U')]), engineOut('e2', [cand('X', 'e2', 'L')])], { rejectedIds: ['X'] });

await scenario('S5 identical content, cross-engine (X=RECT in e1 and e2)', 'C3: observe only',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT')]), engineOut('e2', [cand('X', 'e2', 'RECT')])]);

await scenario('S5b identical content, SAME engine (X=RECT twice)', 'C3: observe only',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT'), cand('X', 'e1', 'RECT')])]);

await scenario('S6 collision where one member is below confidence floor (X=RECT .9 vs X=L .1)', 'C2: collision detected BEFORE confidence -> both rejected as DUPLICATE',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT', 0.9)]), engineOut('e2', [cand('X', 'e2', 'L', 0.1)])], { rejectedIds: ['X'] });

await scenario('S7 2 identical + 1 different (X=RECT e1, X=RECT e2, X=L e3)', 'C1: reject all three',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT')]), engineOut('e2', [cand('X', 'e2', 'RECT')]), engineOut('e3', [cand('X', 'e3', 'L')])], { rejectedIds: ['X'] });

await scenario('S8 no collision (control): X=RECT, Y=L, Z=U', 'baseline behaviour',
  () => [engineOut('e1', [cand('X', 'e1', 'RECT')]), engineOut('e2', [cand('Y', 'e2', 'L')]), engineOut('e3', [cand('Z', 'e3', 'U')])]);

// Different IDs, identical design content (design-level dedupe path, orthogonal to ID collision)
await scenario('S9 different IDs, identical design (A,B same RECT)', 'design dedupe must be order independent',
  () => [engineOut('e1', [cand('A', 'e1', 'RECT')]), engineOut('e2', [cand('B', 'e2', 'RECT')])]);

fs.mkdirSync('/tmp/claude-0/audit/logs', { recursive: true });
fs.writeFileSync('/tmp/claude-0/audit/logs/aziz-permutation.json', JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`\n${r.name}\n  contract: ${r.contract}\n  permutations=${r.permutations} distinctOutcomes=${r.distinctOutcomes} orderIndependent=${r.orderIndependent}`);
  console.log(`  status=${JSON.stringify(r.status)} selected=${JSON.stringify(r.selected)} selectedGeometry=${JSON.stringify(r.distinctSelectedGeometry)}`);
  console.log(`  rejectionCodes=${JSON.stringify(r.rejectionCodes)} rejectedIdLeakedIntoSurvivors=${r.survivorsLeak} duplicateProvenanceEntryIds=${r.provenanceEntryIdDuplicates}`);
}
