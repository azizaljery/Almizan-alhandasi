# AUDIT DECISION RECORD (ADR-AUDIT)

```yaml
decision_id: ADR-AUDIT-XXXX
title: ""
date: ""
author: ""

audit_phase:
  - SYSTEM_DISCOVERY
  - SYSTEM_MAP
  - REGISTRY_INTEGRITY
  - EVIDENCE_AUDIT
  - CONTRADICTION_DETECTION
  - LINEAGE_AUDIT
  - HUMAN_REVIEW
  - SYSTEM_MAP_BASELINE

status:
  PROPOSED
  APPROVED
  REJECTED
  SUPERSEDED

decision_type:
  PROCESS_RULE
  EVIDENCE_RULE
  STATUS_MODEL
  DOD_CHANGE
  CONTRADICTION_CLASSIFICATION
  LINEAGE_CONVENTION
  BASELINE_REQUIREMENT
  OWNERSHIP_DEFINITION
  OTHER

description: ""
rationale: ""

evidence:
  - ""

affected_artifacts:
  - ""

repository_scope:
  allowed:
    - docs/system-map/*.json
    - docs/system-map/*.md
    - docs/system-map/generated/*
  forbidden:
    - AZIZ
    - Planner
    - Mizan Score Runtime
    - Engineering Core
    - Design Core
    - 2D
    - 3D
    - BOQ
    - Contracts Runtime

baseline_dependency:
  baseline_status: NOT_FROZEN
  implementation_allowed: false

implementation_rule: |
  During ARCHITECTURE TRUTH AUDIT
  this decision may update only audit artifacts.

human_review_required: true
notes: []
```

## Decision DoD

A decision is not APPROVED until all are true:

- Decision ID assigned
- Description documented
- Rationale documented
- Audit phase identified
- Affected artifacts listed
- Repository files updated
- Commit created
- Human review completed

Traceability:

```text
Discussion
→ Decision Record
→ Repository Update
→ Commit
→ Traceable Audit History
```
