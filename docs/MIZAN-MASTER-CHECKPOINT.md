# MIZAN MASTER CHECKPOINT

Status: CONTROL BASELINE — NO PACKAGE MERGE AUTHORIZED
Control branch: `control/mizan-master-checkpoint`
Baseline branch: `main`

## Product vision

MIZAN is not a drawing utility. It is a multi-engine architectural decision system.

Target flow:

```text
Client Brief / Requirements
        ↓
Independent Design Engines
        ↓
50–100+ genuine DesignCandidates
        ↓
MIZAN Decision Engine
  - hard-constraint gate
  - conflict detection
  - domain-weighted consensus
  - multi-axis scoring
  - rejection
  - provenance / DecisionTrace
  - refinement requests
        ↓
Diverse shortlist
        ↓
Engineering Core
        ↕
Closed refinement loop
        ↓
3–4 validated final designs
        ↓
2D / 3D / Visualization
        ↓
SHARA Final Design
        ↓
BOQ / Delivery
```

**SHARA is a customer-facing identity for the final delivered product. It is not the internal engine name.**

## Source-of-truth rules

1. Planner is one engine only. It is not the platform brain.
2. Design candidates must differ geometrically/architecturally, not merely by score or description.
3. Hard user requirements cannot be defeated by a higher aggregate score.
4. Every important decision must be traceable to engine/version/constraint/evidence/confidence.
5. The decision core remains deterministic for identical engine results + configuration.
6. AI/non-deterministic generation stays outside the deterministic decision core.
7. Visualization may consume validated geometry; it must not silently create a second geometry truth.
8. Package verification is independent. Test results from one package never certify another.
9. Integration tests are a separate gate.
10. No direct production/Cloudflare changes during recovery and verification.

## Repository checkpoint — 2026-09-27

Repository: `azizaljery/Almizan-alhandasi`
Default branch: `main`
Observed `main` tree: 307 files.

### Important branches observed

- `main`
- `extract-project-files`
- `dev/claude-planner-v2`
- `dev/aziz-engine-candidate4`
- `dev/gemini-design-intelligence`
- `integration/gemini-engineering-layer`
- `integration/claude-aziz-r3`
- `integration/final-multi-engine-20260925`
- `integration/verified-runtime-20260925`
- `integration/mizan-release`
- `control/mizan-master-checkpoint`

### Reality found on current main

- Legacy/runtime website is present under `dist/`.
- Worker files are present under `worker/`, including `worker/server.mjs` and `worker/mizan-images-worker.mjs`.
- Claude planner is present both as runtime output under `dist/claude/` and as a vendored source package under `vendor/claude-planner/`.
- Engineering Core source is embedded under `dist/integration/gemini/packages/engineering-core/`; it is not yet normalized as a top-level workspace package.
- Decision-engine runtime is present under `dist/integration/aziz/`; naming is historical. Do not rename during recovery.
- Design-intelligence modules are present under `dist/gemini/design-intelligence/` and integrated mirrors.
- A top-level `packages/design-core/` source package was **not** observed on current `main` at this checkpoint. Its existence/verification must therefore be established from the authoritative handoff/source, not assumed from compiled/integration artifacts.
- `dev/claude-planner-v2`, `dev/aziz-engine-candidate4`, and `dev/gemini-design-intelligence` are lightweight handoff branches, not complete mirrors of current `main`.

## Evidence already present in main

`RELEASE-MANIFEST.md` records a clean-extraction release candidate with:
- 87/87 tests passed
- build passed
- same AZIZ-selected model consumed by 2D, 3D and BOQ
- automated browser visual gate not completed

`INTEGRATION-P1-REPORT.md` records:
- baseline 78/78
- final integration 86/86
- dedicated multi-engine tests 8/8
- browser visual/cross-device acceptance still open
- AI soft axes such as privacy/MEP/reference were explicitly not fabricated
- Cloudflare Worker production provenance was not established by that package

These are evidence for those specific integration candidates only. They do not certify independent packages unless independently reproduced.

## Official package status at this checkpoint

| Component | Status |
|---|---|
| Legacy/runtime site | PRESENT ON MAIN — verification evidence exists |
| Design Core | WRITTEN/HANDOFF KNOWN — authoritative source + independent verification pending |
| Engineering Core | PRESENT IN INTEGRATION TREE — independent verification evidence exists elsewhere; reproduce before certification |
| Decision Engine (historical AZIZ naming) | PRESENT AS INTEGRATED RUNTIME — independent source/package verification required before canonicalization |
| Planner | PRESENT — treat as ONE engine |
| Visualization / 2D / 3D | PRESENT IN LEGACY RUNTIME — frozen during core recovery |
| AI / Cloudflare Worker | PRESENT AS SEPARATE RUNTIME PATH — no changes during recovery |
| SHARA Final Design | PRODUCT IDENTITY RESERVED FOR FINAL CLIENT OUTPUT ONLY |

## Gates

### GATE 0 — Inventory
- establish authoritative source location for every component
- record branch, commit, path, version, tests, build evidence
- identify duplicates and compiled-only mirrors
- make no merge decisions

### GATE 1 — Independent verification
For each source package independently:
- typecheck / syntax validation as applicable
- fixture generation where applicable
- package tests
- build
- hashes/version
- record exact results

### GATE 2 — Contract compatibility
Verify adapters without modifying package internals:
- Design/requirements → decision engine
- Planner engine → decision engine
- Engineering Core → decision/refinement layer

### GATE 3 — Closed-loop test
Run deterministic closed loop with fake/controlled engines first:
```text
Requirements
→ many candidates
→ hard-constraint filtering
→ conflict + consensus
→ engineering review
→ structured refinement
→ re-evaluation
→ 3–4 diverse validated outputs
```

### GATE 4 — Real villa test
Use the agreed real villa program as a stress case after GATE 3 succeeds.

### GATE 5 — Visualization
Only after the decision/engineering loop is proven.

## Immediate control priorities

1. Freeze production-facing behavior while inventory is being established.
2. Reconstruct the authoritative Design Core source package and verify it independently.
3. Reconstruct/verify the independent Decision Engine source package; do not equate compiled `dist/integration/aziz` with canonical source.
4. Reproduce Engineering Core verification independently.
5. Define stable adapter contracts between packages without package-internal edits.
6. Build the 100+ Candidate Funnel and diversity-preserving shortlist behavior in the decision layer only after canonical sources are fixed.
7. Execute GATE 3 closed-loop tests before any new visualization work.

## Change control

Every work item must declare:

```text
ID:
Owner:
Package:
Purpose:
Inputs:
Outputs:
May Modify:
Must Not Modify:
Tests Required:
Depends On:
Status:
```

No new package or agent scope is accepted without this card.
