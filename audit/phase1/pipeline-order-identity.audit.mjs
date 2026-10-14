// AUDIT probe — (a) pipeline order independence across all permutations of reviewed pairs,
// (b) run-to-run determinism of decisionId, (c) identity propagation Planner -> AZIZ -> review -> decision -> finalDesignState -> model.
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { buildDesignRequest, runMultiEngineDesign } from '../../dist/multi-engine.mjs';
import { runPipeline, decideReviewed } from '../../dist/integration/pipeline.mjs';
const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const request = await buildDesignRequest({ plot, rooms: normalizeRooms(defaultRooms()) });
const base = await runPipeline(request, { shapes: ['rect', 'l', 'u', 'pavilions'] });
console.log('pairs:', base.pairs.map((p) => p.candidate.actualShape).join(','), '| failures:', JSON.stringify(base.failures.map((f) => f.shape + ':' + f.reason.slice(0, 40))));
const perms = (a) => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
const outcomes = new Map();
for (const p of perms(base.pairs)) {
  const r = await decideReviewed(request, p);
  const k = JSON.stringify({ s: r.decision.status, sel: r.decision.selectedCandidateId, did: r.decision.decisionId, rev: r.decision.reviewIds, az: r.aziz.candidatesSurvived.slice().sort(), rej: r.aziz.candidatesRejected.map((x) => x.candidateId + x.code).sort() });
  outcomes.set(k, (outcomes.get(k) ?? 0) + 1);
}
console.log('(a) pair-order permutations:', [...outcomes.values()].reduce((a, b) => a + b, 0), '-> distinct outcomes:', outcomes.size);
const again = await runPipeline(request, { shapes: ['rect', 'l', 'u', 'pavilions'] });
console.log('(b) decisionId identical across two fresh runs:', again.decision.decisionId === base.decision.decisionId);
const r = base, sel = r.decision.selectedCandidateId, pair = r.pairs.find((p) => p.candidate.candidateId === sel);
const chain = { decision: sel, ranking: r.preferenceRanking.selectedCandidateId, finalState: r.finalDesignState.candidateId, reviewBound: pair.review.candidateId, reviewIdsHasIt: r.decision.reviewIds.includes(pair.review.reviewId), azizSurvivorsHas: r.aziz.candidatesSurvived.includes(sel), geometryHashDecision: r.decision.geometryHash.value === r.finalDesignState.geometryHash.value };
console.log('(c) chain', JSON.stringify(chain));
const m = await runMultiEngineDesign({ plot, rooms: normalizeRooms(defaultRooms()), selectedShape: 'rect', idea: '', seed: 1 });
console.log('    model.integration.candidateId === decision.selectedCandidateId:', m.selectedModel.integration.candidateId === m.decision.selectedCandidateId, '| reviewId:', m.selectedModel.integration.reviewId === m.reviews?.find?.((x) => x.candidateId === m.decision.selectedCandidateId)?.reviewId);
