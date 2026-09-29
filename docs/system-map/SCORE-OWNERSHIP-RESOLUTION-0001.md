# SCORE OWNERSHIP RESOLUTION 0001

Baseline: `SMB-20260929-001`  
Status: `IN_PROGRESS`  
Result: `null`  
Contradictions: `CONTR-0003`, `CONTR-0005`

## SOR-001 — Inventory

PASS.

Current score/decision paths found:

- `calculateMizanScore()` — measurement heuristic; does not select a winner.
- `evaluateDesign()` — legacy home-design measurement producing `evaluation.score`.
- `compareHomeModels()` — consumes `evaluation.score` and produces `bestId`.
- AZIZ `scoreCandidate()` — internal score vector/total.
- AZIZ `consensus-engine.js` — owns current AZIZ weights/profiles.
- AZIZ orchestration — consumes scores and performs candidate selection.

Current finding: multiple score-definition paths and multiple decision-like paths exist. No ownership decision or runtime patch has been made yet.

Next: `SOR-002` trace `calculateMizanScore()` and its consumers.

Production remains BLOCKED. Mizan Score V1 remains blocked until ownership resolution.
