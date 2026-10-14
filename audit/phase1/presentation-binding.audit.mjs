// AUDIT probe — is `presentation` (label, massingParts) covered by candidateId / geometryHash / review binding?
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { buildDesignRequest } from '../../dist/multi-engine.mjs';
import { generateCandidate, decideReviewed } from '../../dist/integration/pipeline.mjs';
import { reviewCandidate } from '../../dist/integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
import { verifyCandidateBinding } from '../../dist/integration/control/reference/identity.mjs';
const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const request = await buildDesignRequest({ plot, rooms: normalizeRooms(defaultRooms()), selectedShape: 'u' });
const { candidate } = await generateCandidate(request, 'u');
const review = await reviewCandidate(candidate, request);
const t = structuredClone(candidate);
const origLabel = t.presentation.label;
t.presentation.label = 'TAMPERED LABEL';
t.alternativeKey = candidate.alternativeKey; // unchanged on purpose
let bindingOk = false; try { bindingOk = await verifyCandidateBinding(t, request); } catch (e) { bindingOk = 'throws ' + e.message; }
console.log('1. label changed after binding -> verifyCandidateBinding:', bindingOk);
const r = await decideReviewed(request, [{ candidate: t, review }]).then((x) => x.decision.status, (e) => 'throws ' + e.message);
console.log('   decideReviewed accepts relabeled candidate:', r, '| label before/after:', origLabel, '->', t.presentation.label);
// massingParts: shift one part by 1 m while keeping union equal is hard; just report whether the field is hashed.
const m = structuredClone(candidate); if (m.presentation.massingParts?.length) { m.presentation.massingParts = [...m.presentation.massingParts].reverse(); }
let b2 = false; try { b2 = await verifyCandidateBinding(m, request); } catch (e) { b2 = 'throws ' + e.message; }
console.log('2. massingParts reordered after binding -> verifyCandidateBinding:', b2);
const d = await decideReviewed(request, [{ candidate: m, review }]).then((x) => x.decision.status + ' | geometryHash ' + x.decision.geometryHash.value.slice(0, 10), (e) => 'throws ' + e.message);
console.log('   decideReviewed:', d);
