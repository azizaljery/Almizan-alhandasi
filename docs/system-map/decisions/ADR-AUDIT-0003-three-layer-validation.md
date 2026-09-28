---
decision_id: ADR-AUDIT-0003
title: Three-Layer Validation for ADR-AUDIT Decisions
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

Validate ADR-AUDIT decisions through three distinct layers:

1. JSON Schema validation
2. repository-aware Audit Rule Engine validation
3. Human Review

## Rationale

Schema validation can prove structure, types, patterns and local conditions.
It cannot inspect repository state, evidence truth, cross-registry references or baseline consistency.
Human review remains required because automated checks cannot approve architectural truth by themselves.

## Proposed artifacts

- `docs/system-map/schemas/adr-audit.schema.json`
- `docs/system-map/ADR-AUDIT-VALIDATION-ARCHITECTURE.md`
- `docs/system-map/decision-integrity.rules.json`

## Canonical field-shape note

The current machine-readable decisions registry uses camelCase.
Therefore the proposed JSON Schema validates the existing camelCase decision objects rather than silently changing the registry to snake_case.

The human-facing Markdown template may continue to use snake_case until a mapping rule is separately approved.

## Execution boundary

No production/runtime code is changed.
A standalone executable Layer-2 validator is NOT implemented by this proposal and would require a separately approved audit-tooling scope.

## Approval status

PROPOSED.

Required before APPROVED:
- proposal commit recorded
- automated decision-integrity checks pass
- explicit human review completed
- approval commit created
