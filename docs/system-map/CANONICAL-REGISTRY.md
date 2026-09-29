# CANONICAL REGISTRY

Baseline: `SMB-20260929-001`  
Registry status: `IN_PROGRESS`  
Last reviewed: `2026-09-29`  
Formal acceptance authority: `PROJECT_OWNER`

Evidence root: `docs/system-map/` on branch `control/mizan-master-checkpoint`.

## DEV-GATE-001 — Canonical Design Core

| Field | Value |
|---|---|
| Status | `FORMALLY_ACCEPTED` |
| Ownership model | `FORMALLY_COMPOSITE_DESIGN_CORE` |
| Canonical contract source | `vendor/claude-planner/src/PlannerOutputContract.mjs` |
| Contract runtime mirror | `dist/claude/PlannerOutputContract.mjs` |
| Canonical Claude Planner upstream | `vendor/claude-planner/src/` |
| Planner runtime mirror | `dist/claude/` |
| Runtime integration boundary | `dist/planner.mjs` |
| Build guard | `scripts/build.mjs` enforces byte equality for vendor → dist/claude |
| Decision | `docs/system-map/DEV-GATE-001-DESIGN-CORE-OWNERSHIP.json` |
| Runtime changed | `NO` |

## DEV-GATE-002 — Canonical AZIZ Source / Version

| Field | Value |
|---|---|
| Status | `FORMALLY_ACCEPTED` |
| Canonical delivered artifact | `dist/integration/aziz/` |
| Release identity | `AZIZ Candidate4R3` |
| Entry point | `dist/integration/aziz/index.js` |
| Integration consumer | `dist/integration/pipeline.mjs` |
| Authoring source | `NOT PRESENT IN REVIEWED REPOSITORY` |
| Source-map provenance | `index.js.map → ../src/index.ts` |
| Hash evidence | `FILE-SHA256SUMS.txt`, `FILE-SHA256SUMS-RELEASE.txt` |
| Release evidence | `INTEGRATION-P1-REPORT.md`, `RELEASE-TEST-87.log` |
| Decision | `docs/system-map/DEV-GATE-002-AZIZ-CANONICAL.json` |
| Runtime changed | `NO` |

## DEV-GATE-003 — Canonical Engineering Core

| Field | Value |
|---|---|
| Status | `FORMALLY_ACCEPTED` |
| Decision | `FORMALLY_ACCEPT_SPLIT_WITH_DISTINCT_ROLES` |
| Integrated acceptance core | `dist/integration/gemini/packages/engineering-core/` |
| Package identity | `@mizan/engineering-core@1.0.0` |
| Acceptance adapter | `dist/integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js` |
| UI preliminary copy | `dist/gemini/engineering-core/` |
| UI bridge | `dist/gemini-engineering-layer.mjs` |
| Evidence | Copies are non-identical; integrated copy has P1 safeguards and MIZAN-IR bound review path |
| Decision record | `docs/system-map/DEV-GATE-003-ENGINEERING-CORE-CANONICAL.json` |
| Runtime changed | `NO` |

## DEV-GATE-004 — Production Worker Byte Provenance

| Field | Value |
|---|---|
| Status | `BLOCKED` |
| Repository artifact | `worker/server.mjs` |
| Repository SHA-256 | `6f74364086632bf048f52b8b57176478335b684595615776f4249e18731c3c53` |
| Configured Worker | `gentle-sun-5ef5` |
| Wrangler main | `worker/server.mjs` |
| Repository hash evidence | `FILE-SHA256SUMS.txt`, `FILE-SHA256SUMS-RELEASE.txt` |
| Missing proof | Deployed Worker byte/version/hash identity |
| Decision record | `docs/system-map/DEV-GATE-004-WORKER-PROVENANCE.json` |
| Runtime changed | `NO` |

## DEV-GATE-005 — Browser Visual Verification

| Field | Value |
|---|---|
| Status | `IN_PROGRESS` |
| Health | `BLOCKED` |
| Verification target | `https://al-mizan-al-handasi.aljeryabod.chatgpt.site` |
| Current result | `NOT_VERIFIED` |
| Required evidence | screenshots, critical user-flow trace, acceptance checklist, bounded browser/device scope, known UI limitations |
| Execution record | `docs/system-map/DEV-GATE-005-browser-visual-verification.execution.json` |
| Runtime changed | `NO` |

## DEV-GATE-006 — Production Deployment Identity

| Field | Value |
|---|---|
| Status | `IN_PROGRESS` |
| Health | `BLOCKED` |
| Repository hosting project ID | `appgprj_6aa6d211421c8191ae8cb918a8cea058` |
| Static directory | `dist` |
| Site target | `https://al-mizan-al-handasi.aljeryabod.chatgpt.site` |
| Worker target | `gentle-sun-5ef5` |
| Current identity result | `NOT_PROVEN` |
| Missing proof | deployment ID/version + deployed artifact identity + commit/build binding + live verification |
| Execution record | `docs/system-map/DEV-GATE-006-production-deployment-identity.execution.json` |
| Runtime changed | `NO` |

