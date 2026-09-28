# MIZAN SYSTEM MAP — Human Review Gate

Status: ACTIVE
Mode: READ-ONLY ARCHITECTURE AUDIT
Scope: docs/system-map/

Purpose:
Copilot gathers evidence. Human review decides what becomes accepted architectural truth.

## Review order

### 1. Registry integrity
- Every registry parses with JSON.parse.
- componentId, flowId, consumerId, evidenceId, claimId are unique.
- No dangling references.
- Every referenced component exists.
- Only these verification states are allowed:
  - VERIFIED_RUNTIME
  - VERIFIED_TEST
  - VERIFIED_HASH
  - DOCUMENTED
  - INFERRED
  - CONTRADICTED
  - UNKNOWN
- No file outside docs/system-map/ was changed by the audit task.

### 2. Critical claims first
Review claims about:
- source of truth
- AZIZ selection
- Mizan Score inputs
- 2D/3D/BOQ consumption of the selected model
- identity/hash propagation
- geometry mutation
- project save/restore
- Engineering Review boundaries

### 3. Evidence audit
For every critical claim:
- Does the evidence exist?
- Does it prove the exact statement?
- Does the scope match?
- Are limitations explicit?
- Was a narrow test inflated into a broad claim?
- Is contradicting evidence present but unrecorded?

### 4. Inference discipline
Static imports/calls remain INFERRED.
They do not become VERIFIED_RUNTIME without direct runtime evidence, saved trace/instrumentation, or equivalent execution proof.

### 5. Baseline freeze
After factual corrections only, create SYSTEM MAP BASELINE metadata recording:
- commit
- registry versions
- review date
- known unknowns
- unresolved contradictions

No silent edits after baseline. Every later change must be a new commit/version.

## Gate before ADRs

Do not treat architectural decisions as binding until all are true:
- Critical components mapped
- Critical flows mapped
- Source-of-truth claims reviewed
- Lineage breaks located
- Contradictions visible
- Duplicate/mirror candidates recorded
- Human review completed
- Baseline committed

## Important status of pre-existing ADR files

Any ADR created before this gate is satisfied is PRE-BASELINE material only.
It must not be treated as a binding architectural decision until reviewed after the SYSTEM MAP BASELINE is frozen.

Principle:
Evidence collection is automated.
Architectural truth is human-reviewed.
