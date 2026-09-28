---
decision_id: ADR-AUDIT-0001
title: Audit Artifacts Only During Architecture Truth Audit
date: 2026-09-28
author: MAIN_CONTROL
audit_phase: SYSTEM_MAP
status: APPROVED
decision_type: PROCESS_RULE
human_review_required: true
production_code_change: false
baseline_required: true
---

# Decision

Any approved audit decision must be recorded promptly in `docs/system-map/` while ARCHITECTURE TRUTH AUDIT is active.

## Rationale

Prevent loss of governance decisions between discussion and repository state, while preserving the governance freeze on production/runtime code.

## Affected artifacts

- docs/system-map/*.json
- docs/system-map/*.md
- docs/system-map/generated/*

## Repository scope

Allowed:
- audit registries
- audit policies
- status snapshots
- generated audit reports

Forbidden before baseline freeze:
- AZIZ
- Planner
- Mizan Score Runtime
- Engineering Core
- Design Core
- 2D
- 3D
- BOQ
- runtime contracts
- production/deployment code

## Baseline dependency

```yaml
baseline_status: NOT_FROZEN
implementation_allowed: false
```

## Implementation rule

During ARCHITECTURE TRUTH AUDIT this decision may update only audit artifacts.

## Decision DoD

- Decision ID assigned: PASS
- Description documented: PASS
- Rationale documented: PASS
- Audit phase identified: PASS
- Affected artifacts listed: PASS
- Repository files updated: PASS
- Commit created: PASS
- Human review completed: PASS

## Traceability

```text
Discussion
→ ADR-AUDIT-0001
→ WORKING-UPDATE-RULE.md
→ Repository Commit
```
