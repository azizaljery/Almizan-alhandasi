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
| Status | `BLOCKED` |
| Canonical copy | `UNRESOLVED` |
| Gate evidence | `docs/system-map/development-unblock-gate.json` |
| Supporting evidence | `CONTR-0007`, `EVD-HASH-0002` |
| Current finding | UI and integrated Engineering Core copies are proven non-identical; evidence does not determine which is canonical. |
| Closure requirement | Establish canonical copy or formally accept the split. |

## DEV-GATE-004 — Production Worker Byte Provenance

| Field | Value |
|---|---|
| Status | `BLOCKED` |
| Repository source | `worker/server.mjs` |
| Production byte provenance | `UNRESOLVED` |
| Gate evidence | `docs/system-map/development-unblock-gate.json` |
| Current finding | Repository Worker source exists; no byte-for-byte proof binds it to the deployed Production Worker. |
| Closure requirement | Record deployed artifact identity/hash and compare it with the intended repository artifact. |

## DEV-GATE-005 — Browser Visual Verification

| Field | Value |
|---|---|
| Status | `BLOCKED` |
| Browser visual report | `UNRESOLVED` |
| Gate evidence | `docs/system-map/development-unblock-gate.json` |
| Current finding | Repository tests do not establish browser visual verification. |
| Closure requirement | Produce traceable browser visual verification evidence for the intended deployment/scope. |

## DEV-GATE-006 — Production Deployment Identity

| Field | Value |
|---|---|
| Status | `BLOCKED` |
| Deployment identity | `UNRESOLVED` |
| Gate evidence | `docs/system-map/development-unblock-gate.json` |
| Current finding | Frozen baseline is repository-runtime scoped and does not establish deployed production identity. |
| Closure requirement | Bind the deployed production artifact/version to a traceable repository/build identity. |

## Rule

This registry records current evidence only. It does not resolve canonical ownership by assertion.
