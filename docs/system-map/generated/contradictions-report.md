# CONTRADICTIONS REPORT

Status: CURRENT
Stage: CONTRADICTION_DETECTION
Resolution policy: NOT_ATTEMPTED

This report records the current known contradictions and potential lineage issues.
It does not resolve, merge, refactor, or enforce architecture.

## Contradictions

### CONTR-0001 — README shape limitations vs tested RECT/L/U support
- Classification: SOURCE_OF_TRUTH
- Verification: CONTRADICTED
- Evidence: EVD-DOC-0001, EVD-TEST-0002
- Resolution: NOT_ATTEMPTED

### CONTR-0002 — Persistence documentation vs exact integrated restore
- Classification: SOURCE_OF_TRUTH
- Verification: CONTRADICTED
- Evidence: EVD-DOC-0002, EVD-TEST-0003
- Resolution: NOT_ATTEMPTED

### CONTR-0003 — Mizan Score vs home-design evaluation.score
- Classification: OWNERSHIP
- Verification: INFERRED
- Evidence: EVD-CODE-0001, EVD-CODE-0003
- Resolution: NOT_ATTEMPTED

### CONTR-0004 — AZIZ selectedModel vs home-design bestId
- Classification: FLOW
- Verification: INFERRED
- Evidence: EVD-CODE-0001, EVD-CODE-0002, EVD-TEST-0001
- Resolution: NOT_ATTEMPTED

### CONTR-0005 — AZIZ scoring implementation vs declared score-definition boundary
- Classification: OWNERSHIP
- Verification: INFERRED
- Evidence: EVD-DOC-0003, EVD-CODE-0004, EVD-CODE-0005
- Resolution: NOT_ATTEMPTED

### CONTR-0006 — Two Gemini engineering review paths without mapped boundary distinction
- Classification: FLOW
- Verification: INFERRED
- Evidence: EVD-CODE-0006
- Resolution: NOT_ATTEMPTED

### CONTR-0007 — Engineering Core source-of-truth split across non-identical copies
- Classification: SOURCE_OF_TRUTH
- Verification: CONTRADICTED
- Evidence: EVD-HASH-0002, EVD-CODE-0006
- Resolution: NOT_ATTEMPTED

## Potential Lineage Candidates

### PLC-0001 — Downstream geometryHash propagation
- Status: IDENTIFIED
- Verification: INFERRED
- Evidence: EVD-TEST-0001
- Disposition: DEFER_TO_LINEAGE_AUDIT

### PLC-0002 — bestId is not directly bound to canonical candidateId
- Status: IDENTIFIED
- Verification: INFERRED
- Evidence: EVD-CODE-0010
- Disposition: DEFER_TO_LINEAGE_AUDIT

### PLC-0003 — UI Gemini review lacks direct canonical candidateId/geometryHash binding
- Status: IDENTIFIED
- Verification: INFERRED
- Evidence: EVD-CODE-0011, EVD-CODE-0006
- Disposition: DEFER_TO_LINEAGE_AUDIT

## Registry State

- Contradictions: 7
- Potential lineage candidates: 3
- Evidence records: 18
- Claims: 17
- Registry Integrity: PASS

## Resolution Guard

- No contradiction has been resolved.
- No ownership decision has been enforced.
- No runtime path has been merged.
- No production component has been modified during this audit execution window.

## Stage State

CONTRADICTION_DETECTION remains IN_PROGRESS until:
- CD-011 Resolution Guard
- CD-012 Human Review
- CD-013 Closure Review

Baseline remains NOT_FROZEN.
Development remains BLOCKED_UNTIL_BASELINE.
