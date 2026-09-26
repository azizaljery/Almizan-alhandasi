# P1-GEM-01 — local adapter handoff (archive revision r1)

Contract: **MIZAN-IR/1.0.0**, unchanged. No Git/production operations.
Package versions remain `engineering-core@1.0.0`, `engineering-math@1.0.0`,
`design-intelligence@1.1.0-dev`; r1 is a delivery revision, not a published package version.

## Entry points

```js
import { reviewCandidate, verifyBoundReview } from './packages/design-intelligence/adapters/mizan-review-v1.js';
const review = await reviewCandidate(candidateEnvelope, designRequest);
await verifyBoundReview(review, candidateEnvelope, designRequest);
```

`new DesignIntelligenceEngine().reviewCandidate(candidate, request)` delegates to this new async API.
Low-level `adaptCandidateEnvelope` is exported from
`packages/engineering-core/contracts/mizan-ir-v1.adapter.js`.
Do not pass CandidateEnvelope to legacy `CoordinationOrchestrator.coordinate`.
The full DesignRequest is required to recompute inputHash: merely echoing it would not verify binding.

Keep the delivered directory structure: adapters import the **unchanged** control-room
`reference/identity.mjs` and `contracts/mizan-envelope-v1.schema.json` at the source root.
No npm dependencies. Node >=22 with Web Crypto and JSON import attributes required;
the handoff records the actual tested Node/npm versions. Browser copies are not built or changed.

## Boundary and conversion

The frozen CandidateEnvelope accepts **m/m2/m3 only**. A millimetre Envelope is rejected,
not silently reinterpreted. G01 metre/millimetre equivalence is exercised on the legacy API;
canonical native geometry is converted once into an internal `METRIC_MM` snapshot.
`unitScaleToMm=1` on that snapshot; fields ending Mm are already millimetres.
Native geometry, including unknown extension fields, remains an immutable, exact clone.
There is no coordinate rotation, room generation, name-based device inference or invented adjacency.
The only generated level identifier is `LVL-GF`; it has no assumed elevation, height or slab.
Opening centre positions are derived along the referenced wall at `pos`; IDs/connects are retained.
The footprint is the area source. No courtyard subtraction and no display massingParts dependency.

Inputs are schema-checked against the frozen schema plus finite/JSON/resource, hash, ID,
simple-polygon, reference and unit checks. The built-in schema walker supports only the frozen
schema vocabulary, not arbitrary schemas. Separate QA uses Python jsonschema Draft202012.
This **does not replace Claude validateModel**. That upstream gate is explicitly NOT_EVALUATED.
Orthogonal footprint vs rectangular space/void intersection is checked by cell integration.
Non-orthogonal containment is NOT_EVALUATED. Physical door fit/access, setbacks, room overlaps,
and a general 3D clash solver are not certified by the limited adapter checks.

## Evidence and coverage

Registry `gemini-ir-preliminary/1.0.0` has 28 immutable check IDs in code.
Counts and evaluatedRatio come from the shared reference `summarizeChecks`.
Every evidenceId resolves to a finding containing source candidate and geometry hash.
PASS means only the stated check scope. FAIL yields BLOCKED; estimates/missing evidence yield
PRELIMINARY_INCOMPLETE. Optional MEP/structural extension records are preserved but have no
supported evaluation contract in this adapter; their existence alone cannot become PASS.
Aggregate confidence is UNAVAILABLE; individual pattern annotations are labelled HEURISTIC.
Review IDs hash all semantic results; telemetry time is excluded. This is content binding, not a digital signature.

Supported explicit checks include polygon area, plot bounds/dimensions, requested coverage,
maxBuiltArea tolerance, direct request-room ID areas and room_count_exact. Other must constraints
are listed as NOT_EVALUATED. Renamed room IDs without an explicit supported mapping remain unresolved.
Additional floors remain a limitation. Pattern retrieval uses site dimensions/street layout;
candidate-topology matching and soft preferences are explicitly not evaluated in this adapter.
No fake sharedLength edges are generated. Main retains AI/selection responsibility.

Rule dates/thresholds were not changed. Source metadata claiming certification is nested as
`declaredSource`, with externalVerification=NOT_AVAILABLE. No external standards verification
was performed. Synthetic default references are marked SYNTHETIC and not used as validation evidence.
BOQ retains original coefficients with ESTIMATE metadata. Its door/window counts are estimates,
not a count of native opening records. Undated fixed prices are not current-market verification.

## Legacy compatibility

Original exports and 69 tests preserved. Legacy status aggregation remains for compatibility,
including the old empty-input COORDINATION_PASSED expectation. Added `legacyStatusOnly`,
`preliminaryOnly`, `statusScope`, and explicit missing-unit assumptions warn consumers of its scope.
Do not use that string as acceptance. The new ReviewEnvelope is the coverage-aware API.
Legacy METRIC_M/METRIC_MM supported; absent units remain an explicitly assumed METRIC_MM.
Unknown units, non-finite JSON and malformed dimensional scalars now throw.
Mm fields no longer multiply with the global coordinate scale. Missing headroom/plenum data
does not receive fake numerical defaults; incomplete legacy issue counts still are not coverage.
Legacy prices retain old verdict strings for API compatibility and now carry benchmarkMetadata.
New Envelope never exposes those strings as compliance decisions.

## Commands

Run in each package: `npm run typecheck`, `npm test`, `npm run build`.
Typecheck means JS syntax plus entry checks; build writes a manifest, not bundling or TypeScript compilation.
From source root:
`node packages/design-intelligence/scripts/p1-acceptance.mjs /absolute/review-output`
then `python3 packages/design-intelligence/scripts/p1-schema-validation.py /absolute/review-output`
with QA-only jsonschema 4.23.0 available. No npm install is needed and no lockfile is fabricated.
No native Claude code, browser copies, website, AI, Worker, AZIZ or deployment has been modified.
