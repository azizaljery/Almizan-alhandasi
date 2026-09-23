# MIZAN Multi-Engine Collaboration

This repository is now the shared source of truth for active MIZAN Engineering development.

## Assigned branches

- `dev/claude-planner-v2` — Planner / Geometry v2 (Claude)
- `dev/gemini-design-intelligence` — Design Intelligence / Knowledge Engine (Gemini)
- `dev/aziz-engine-candidate4` — AZIZ Engine verification candidate (DeepSeek + auditor)
- `integration/multi-engine` — integration manager only; receives reviewed work
- `main` — stable baseline; do not push experimental work directly

Existing branch `dev/deepseek-planner-v2` is preserved and must not be overwritten.

## Required workflow

1. Pull latest `main` before starting.
2. Work only in the assigned branch/package.
3. Commit source, tests, manifests and evidence; do not paste code only in chat.
4. Never modify another engine's package.
5. Do not merge to `main` directly.
6. Open a PR from the assigned branch to `integration/multi-engine`.
7. Include exact commands, exit codes, test counts, build result and known limitations.
8. A reported test pass is not integration verification; integration manager re-runs checks.
9. No SHARA integration until Planner, Design Intelligence and AZIZ contracts are independently verified.

## Current package boundaries

### Claude
Owns Planner / Geometry only. Preserve the 24/24 checkpoint, continue typecheck and package build, and publish PlannerOutputContract.

### Gemini
Owns `@mizan/design-intelligence`. Preserve baseline 30/30 and development checkpoints. Synthetic knowledge must remain clearly isolated from production knowledge.

### AZIZ / DeepSeek + auditor
Owns `@mizan/aziz-engine`. Assemble Candidate #4, run typecheck/tests/build/runtime verification, and submit minimal fixes only for reproduced failures.

## Integration rule

Adapters belong at integration boundaries. Do not force one engine to adopt another engine's internal schema. The integration manager owns contract alignment and final adapters.

Status labels must reflect evidence:
- WRITTEN
- TEST EVIDENCE REPORTED
- INDEPENDENT VERIFICATION REQUIRED
- VERIFIED only after actual execution evidence.
