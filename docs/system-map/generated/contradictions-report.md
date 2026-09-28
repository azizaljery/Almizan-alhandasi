# CONTRADICTIONS REPORT

Status: IN_PROGRESS
Stage: CONTRADICTION_DETECTION
Resolution policy: NOT_ATTEMPTED

This report records contradictions and ownership/flow overlaps discovered so far.
It does not repair or resolve them.

## Confirmed contradictions

### CONTR-0001 — README shape limitations vs integrated RECT/L/U support
Classification: SOURCE_OF_TRUTH
Verification: CONTRADICTED

README states L/U and courtyard forms are unsupported.
The tested integrated path verifies RECT/L/U, including a U courtyard.

Evidence:
- EVD-DOC-0001
- EVD-TEST-0002

Resolution: NOT_ATTEMPTED

### CONTR-0002 — Persistence documentation vs integrated exact restore
Classification: SOURCE_OF_TRUTH
Verification: CONTRADICTED

README describes regeneration from stored inputs/strategies.
The integrated test verifies exact restoration of embedded integrated RECT/L/U geometry.

Evidence:
- EVD-DOC-0002
- EVD-TEST-0003

Resolution: NOT_ATTEMPTED

## Ownership / flow overlaps not yet proven contradictory

### CONTR-0003 — Mizan Score vs home-design evaluation.score
Classification: OWNERSHIP
Verification: INFERRED

Two scoring paths exist in inspected source:
- calculateMizanScore()
- home-design evaluateDesign()/compareHomeModels()

This is an ownership overlap. It is not yet classified as a runtime contradiction.

Resolution: NOT_ATTEMPTED

### CONTR-0004 — AZIZ selected model vs home-design bestId
Classification: FLOW
Verification: INFERRED

The inspected app uses the AZIZ-derived selectedModel as state.model.
A separate comparison path computes bestId from evaluation.score.

No evidence currently shows bestId replacing the selected model.
The boundary remains unresolved.

Resolution: NOT_ATTEMPTED

## Potential lineage issue

### PLC-0001 — geometryHash downstream propagation
The selected model carries geometryHash and the test proves that the same model feeds 2D/3D/BOQ.
Independent downstream output-hash lineage has not yet been established.

This is NOT a LINEAGE_BREAK yet.
Disposition: DEFER_TO_LINEAGE_AUDIT.

## Stage result

CONTRADICTION_DETECTION remains IN_PROGRESS.

Reason:
System Discovery and System Map coverage are not yet proven complete, so the audit cannot yet claim that all known contradictions across the full system have been discovered.
