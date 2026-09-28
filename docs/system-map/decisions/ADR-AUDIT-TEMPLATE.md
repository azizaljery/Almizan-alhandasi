# AUDIT DECISION RECORD (ADR-AUDIT)

```yaml
decision_id: ADR-AUDIT-XXXX
title: ""
date: ""
author: ""

audit_phase:
  SYSTEM_DISCOVERY
  SYSTEM_MAP
  REGISTRY_INTEGRITY
  EVIDENCE_AUDIT
  CONTRADICTION_DETECTION
  LINEAGE_AUDIT
  HUMAN_REVIEW
  SYSTEM_MAP_BASELINE

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
human_review_completed: false

traceability:
  discussion_reference: ""
  evidence_ids: []
  registry_ids: []
  proposal_commit_hash: ""
  approval_commit_hash: null

automated_validation:
  decision_id_present:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  title_present:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  decision_type_valid:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  audit_phase_valid:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  rationale_present:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  evidence_referenced:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  affected_artifacts_present:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  repository_scope_defined:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  implementation_rule_present:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  baseline_dependency_defined:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  forbidden_runtime_changes:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  human_review_required:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  runtime_change_check:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  evidence_chain_check:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  baseline_consistency_check:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  adr_dependency_check:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""
  traceability_check:
    status: PASS | FAIL | BLOCKED
    message: ""
    checked_at: ""

decision_health:
  status: PASS | FAIL | BLOCKED
  checks_total: 17
  checks_passed: 0
  checks_failed: 0
  checks_blocked: 0

approval_gate:
  eligible_for_approval: false
  blocking_checks: []
  reason: ""

notes: []
```

## Decision Integrity rule

An ADR-AUDIT record is validated against the machine-readable rules in:

`docs/system-map/decision-integrity.rules.json`

The machine-readable record in `docs/system-map/decisions.registry.json` is the validation target.

## Approval lifecycle

A decision uses two commits:

```text
Discussion
→ PROPOSED Decision Record
→ Proposal Commit
→ Automated Validation
→ Human Review
→ APPROVED
→ Approval Commit
```

The proposal commit satisfies the "commit exists" prerequisite.
The approval commit records the approved state.

## Decision DoD

A decision must not become `APPROVED` unless:

- Decision ID exists
- Description exists
- Rationale exists
- Audit phase is set
- Evidence is linked
- Affected artifacts are listed
- Repository scope is defined
- Implementation rule is present
- Baseline dependency is defined
- Runtime change rules pass
- Evidence-chain rules pass
- Traceability is complete through the proposal commit
- Automated Validation = PASS
- Human Review completed
- Proposal commit exists

An approved record must then be persisted in a separate approval commit.

## Important pre-baseline rule

While SYSTEM MAP BASELINE is not FROZEN:
- audit-governance decisions may be APPROVED and binding only within `docs/system-map/`
- production/runtime implementation remains forbidden
- architecture ADRs that would bind production remain PRE-BASELINE / NON-BINDING
