# P1-CLA-01 — LOCAL IMPLEMENTATION ONLY

Contract: MIZAN-IR/1.0.0, CR-01. Package: planner-pkg 2.3.1-p1-cla-01.
Baseline ZIP: claude-planner-v2.3.0-ir-compat1.zip, SHA-256 2d50b86dc1170ba21f3c975eb747b32deeb0dfeebb6b493260f39797107355f3.
The package's older manifests and evidence are historical, not P1 acceptance. The external P1 handoff and fresh-extraction logs are authoritative for this batch.

## Scope and behavior

- Four native files remain byte-identical: planner.mjs, PlannerOutputContract.mjs, estimates.mjs, migrations.mjs.
- massingParts are exact orthogonal polygon slices in the native plot frame. No padding; no room-based approximation. RECT retains undefined massingParts. L/U use actual buildingFootprint, including reserved/wall areas and excluding the notch once.
- Strategies compact/balanced/frontage remain aliases for the same RECT solver; courtyard/u-court remain aliases for U (not an enclosed courtyard solver). strategy:l invokes L and has a profile. Alternatives deduplicate exact geometric content, not area or card title. Results retain {models, failures}; when all fail the legacy API throws a search-failure message.
- generateModelLegacy accepts allowFallback:true explicitly; default false rejects unavailable requested shapes. Accepted fallback carries requestedShape, actualShape and fallback {allowed,applied,reason}. Native geometry is not modified.
- maxBuiltArea (legacy) and maxBuiltAreaM2 (canonical field name) are accepted as positive finite numbers or null. Conflicting aliases are rejected. The cap is enforced on quantities().footprint after native validation with tolerance max(1e-6,abs(cap)*1e-8). model.plot.maxBuiltArea echoes the normalized cap. Rooms are not resized or deleted. Search failure is not proof of infeasibility. Coverage and setbacks still run in the native engine.
- The 12-room acceptance program exceeds both 228 and 250 m2 in the current solver's results; rejection is expected and compliant. No attempt is made to fake a smaller model.
- independent-guard.test.mjs restored byte-for-byte from v2.2.11 archive (package version 2.2.0); existing 65 tests untouched, restored baseline 75, then P1 tests added.
- Mutation anchors and all 20 target mappings retained. A full clean baseline must pass, including every selected target. Mutants run isolated, targeting the named tests through Node's structured reporter, not parsing human not-ok output. A targeted assertion failure is KILLED; a new domain Error originating in the exact mutated source is also KILLED (M16). Loader errors, runtime TypeErrors, missing targets, malformed output, timeouts, signals or baseline failures are INCONCLUSIVE. Passing targets are SURVIVED. Exit 0 all killed; 1 survived; 2 inconclusive/setup. Only temporary source copies are made writable. NODE_TEST_CONTEXT is removed from child runner environments to prevent inherited parent-runner mode suppressing structured results; no dependency/network/security settings are changed.
- TypeScript pinned to 6.0.3 with npm-generated integrity in package-lock.json. npm ci is a separate acceptance gate from runtime tests.

## Limits

This is the legacy projection boundary, not the complete DesignRequest/Candidate envelope adapter. Identities, review binding, client persistence, opening-edit exports and ENGINE_VERSION remain integration-room work. Only one drawn floor is supported by native geometry; native warnings and quantities.floors remain intact. No Gemini/AZIZ/AI/UI/Worker changes, Git writes or deployment. No protected-source or contract changes requested for this repair.

Fresh archive verification commands: npm ci; npm run planner:typecheck; npm run planner:test; npm run planner:build; npm run planner:mutants. Raw logs and per-command exit/timestamps are supplied outside the immutable source ZIP to avoid changing the verified artifact after testing.
