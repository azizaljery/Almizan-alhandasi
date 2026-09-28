# ADR-AUDIT Validation Architecture

Status: PROPOSED
Decision: ADR-AUDIT-0003

The validation model is intentionally split into three layers.

## Layer 1 — JSON Schema Validation

Artifact:
`docs/system-map/schemas/adr-audit.schema.json`

Purpose:
- required fields
- types
- enums
- identifier patterns
- commit hash shapes
- structural approval constraints
- pre-baseline implementation prohibition

This layer validates one machine-readable ADR-AUDIT decision object from
`docs/system-map/decisions.registry.json`.

It does not inspect the repository or prove evidence truth.

## Layer 2 — Audit Rule Engine Validation

Current machine-readable rule set:
`docs/system-map/decision-integrity.rules.json`

Purpose:
- No Runtime Modification Rule
- Evidence Chain Integrity
- Baseline Consistency
- ADR Dependency Rule
- Traceability Rule
- cross-registry/repository checks

Status:
RULE MODEL EXISTS.
A standalone executable validator is NOT IMPLEMENTED in this audit phase.

Reason:
The current governance freeze allows audit artifacts only. Introducing executable audit tooling requires its own approved scope decision.

## Layer 3 — Human Review

Purpose:
- decide whether the evidence supports the decision
- review exceptions and contradictions
- prevent self-approval
- record approval/rejection/supersession

Automated validation is necessary but never sufficient for APPROVED.

## Canonical field naming

The current machine-readable registry uses camelCase:
- decisionId
- auditPhase
- decisionType
- affectedArtifacts
- repositoryScope
- baselineDependency
- automatedValidation
- decisionHealth
- approvalGate

The proposed JSON Schema follows that existing registry shape.

The snake_case ADR-AUDIT Markdown template remains a human-facing representation only until a later mapping rule is approved.

## Validation chain

```text
ADR-AUDIT decision object
        ↓
Layer 1 — JSON Schema
        ↓
Layer 2 — Audit Rules
        ↓
Layer 3 — Human Review
        ↓
Approval Gate
```

No layer may silently upgrade a decision to APPROVED.
