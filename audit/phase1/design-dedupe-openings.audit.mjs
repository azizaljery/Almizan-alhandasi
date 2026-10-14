// AUDIT PHASE 1 probe — does AZIZ's "duplicate design" dedupe ignore openings (doors/windows/corridors)?
// Two legitimately different, correctly bound candidates (distinct geometryHash + candidateId, own reviews) that
// share identical room rectangles but differ in one door position. Expectation of lineage correctness: both reach AZIZ
// as DIFFERENT designs. Observation printed below.
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { buildDesignRequest } from '../../dist/multi-engine.mjs';
import { generateCandidate, decideReviewed } from '../../dist/integration/pipeline.mjs';
import { reviewCandidate } from '../../dist/integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
import { geometryHash, candidateId } from '../../dist/integration/control/reference/identity.mjs';

const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const request = await buildDesignRequest({ plot, rooms: normalizeRooms(defaultRooms()) });
const { candidate: c1 } = await generateCandidate(request, 'rect');

const c2 = structuredClone(c1);
const door = c2.geometry.openings.find((o) => o.type === 'door' && typeof o.pos === 'number');
const before = door.pos;
door.pos = before < 0.5 ? before + 0.08 : before - 0.08;           // same rooms, one door moved
c2.geometryHash = await geometryHash(c2);
c2.candidateId = await candidateId(c2);
const out = { sameRooms: JSON.stringify(c1.geometry.rooms) === JSON.stringify(c2.geometry.rooms),
  sameOpenings: JSON.stringify(c1.geometry.openings) === JSON.stringify(c2.geometry.openings),
  distinctGeometryHash: c1.geometryHash.value !== c2.geometryHash.value, distinctCandidateId: c1.candidateId !== c2.candidateId, doorMoved: [before, door.pos] };
const r1 = await reviewCandidate(c1, request), r2 = await reviewCandidate(c2, request);
const res = await decideReviewed(request, [{ candidate: c1, review: r1 }, { candidate: c2, review: r2 }]);
const res2 = await decideReviewed(request, [{ candidate: c2, review: r2 }, { candidate: c1, review: r1 }]);
const summarize = (r) => ({ status: r.decision.status, selected: r.decision.selectedCandidateId, azizSurvived: r.aziz.candidatesSurvived,
  azizRejected: r.aziz.candidatesRejected.map((x) => ({ id: x.candidateId.slice(0, 14), code: x.code, desc: x.description.slice(0, 60) })) });
console.log(JSON.stringify({ premise: out, c1: c1.candidateId.slice(0, 14), c2: c2.candidateId.slice(0, 14), order12: summarize(res), order21: summarize(res2) }, null, 1));
