# CANONICAL REGISTRY

Baseline: `SMB-20260929-001`  
Registry status: `IN_PROGRESS`  
Last reviewed: `2026-09-29`  
Formal acceptance authority: `PROJECT_OWNER`

Evidence root: `docs/system-map/` on branch `control/mizan-master-checkpoint`.

## DEV-GATE-001 — Canonical Design Core

| Field | Value |
|---|---|
| Status | `BLOCKED` |
| Canonical path / URI | `UNRESOLVED` |
| Gate evidence | `docs/system-map/development-unblock-gate.json` |
| Supporting evidence | `docs/system-map/discrepancies.md` |
| Current finding | Repository search performed during gate evaluation did not establish a canonical Design Core source. |
| Closure requirement | Establish canonical source with evidence, or Project Owner formally accepts an explicit alternative/scope. |

## DEV-GATE-002 — Canonical AZIZ Source / Version

| Field | Value |
|---|---|
| Status | `BLOCKED` |
| Canonical source / version | `UNRESOLVED` |
| Gate evidence | `docs/system-map/development-unblock-gate.json` |
| Supporting evidence | `dist/integration/gemini/packages/design-intelligence/docs/AZIZ_MAPPING.md` |
| Current finding | Integrated AZIZ runtime/mapping exists; canonical AZIZ source package/version is not established. |
| Closure requirement | Establish accepted canonical AZIZ source/version with traceable evidence, or formal acceptance by Project Owner. |

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
