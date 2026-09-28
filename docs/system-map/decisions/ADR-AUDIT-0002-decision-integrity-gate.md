---
decision_id: ADR-AUDIT-0002
title: Decision Integrity Gate for Audit Decisions
date: 2026-09-28
author: MAIN_CONTROL
audit_phase: SYSTEM_MAP
status: PROPOSED
decision_type: PROCESS_RULE
human_review_required: true
human_review_completed: false
production_code_change: false
baseline_required: true
---

# Decision

Every ADR-AUDIT decision must pass a machine-readable Decision Integrity Check before it is eligible for APPROVED status.

## Rationale

The decision record itself must be auditable. This prevents incomplete, untraceable, scope-breaking, or runtime-changing decisions from being approved during ARCHITECTURE TRUTH AUDIT.

## Evidence

- Discussion reference: PROJECT-CONVERSATION-2026-09-28-DECISION-INTEGRITY
- Template: docs/system-map/decisions/ADR-AUDIT-TEMPLATE.md
- Validation rules: docs/system-map/decision-integrity.rules.json

## Affected artifacts

- docs/system-map/decisions/ADR-AUDIT-TEMPLATE.md
- docs/system-map/decision-integrity.rules.json
- docs/system-map/decisions.registry.json
- docs/system-map/decisions/*.md

## Repository scope

Allowed:
- docs/system-map/*.json
- docs/system-map/*.md
- docs/system-map/generated/*

Forbidden:
- AZIZ
- Planner
- Mizan Score Runtime
- Engineering Core
- Design Core
- 2D
- 3D
- BOQ
- Contracts Runtime
- production/deployment code

## Baseline dependency

```yaml
baseline_status: NOT_FROZEN
implementation_allowed: false
```

## Implementation rule

This decision affects audit-governance artifacts only while ARCHITECTURE TRUTH AUDIT is active.

## Approval lifecycle

```text
Discussion
→ PROPOSED Decision Record
→ Proposal Commit
→ Automated Validation
→ Human Review
→ APPROVED
→ Approval Commit
```

## Traceability

```yaml
discussion_reference: PROJECT-CONVERSATION-2026-09-28-DECISION-INTEGRITY
evidence_ids:
  - docs/system-map/decisions/ADR-AUDIT-TEMPLATE.md
  - docs/system-map/decision-integrity.rules.json
registry_ids:
  - ADR-AUDIT-0002
proposal_commit_hash: null
approval_commit_hash: null
```

## Current approval state

Automated validation will be recorded after the proposal commit exists.

Human review is still required before this record may become APPROVED.
