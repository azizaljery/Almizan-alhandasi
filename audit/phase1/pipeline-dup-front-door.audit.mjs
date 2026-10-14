// AUDIT probe — decideReviewed front door for duplicate / forged candidateIds (behaviour recorded, nothing changed).
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { buildDesignRequest } from '../../dist/multi-engine.mjs';
import { generateCandidate, decideReviewed } from '../../dist/integration/pipeline.mjs';
import { reviewCandidate } from '../../dist/integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const request = await buildDesignRequest({ plot, rooms: normalizeRooms(defaultRooms()) });
const mk = async (s) => { const { candidate } = await generateCandidate(request, s); return { candidate, review: await reviewCandidate(candidate, request) }; };
const A = await mk('rect'), B = await mk('u');
const out = async (label, pairs) => console.log(label.padEnd(58), await decideReviewed(request, pairs).then((r) => 'OK ' + r.decision.status, (e) => 'THROWS ' + String(e.message).slice(0, 60)));
await out('1 identical duplicate [A,A]', [A, structuredClone(A)]);
const F = structuredClone(B); F.candidate.candidateId = A.candidate.candidateId; F.review.candidateId = A.candidate.candidateId;
await out('2 forged: U-geometry carrying RECT id [A,F]', [A, F]);
await out('3 forged reversed [F,A]', [F, A]);
await out('4 forged alone [F]', [F]);
