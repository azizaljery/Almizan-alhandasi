# CD-006 — Flow Contradictions Checklist

Status: IN_PROGRESS
Result: null
Health: PASS

## Scope

Review the current flow relationships without resolving or changing them:

- Current Mizan Score Path
- compareHomeModels() / evaluation.score
- AZIZ selectedModel path
- selectedModel ↔ bestId overlap
- Gemini Engineering Review paths
- Flow → Claim → Evidence traceability
- Potential Lineage Candidates
- Resolution Guard
- Registry Integrity revalidation

## Subchecks

- [ ] CD-006-01 — Review current Mizan Score call path.
- [ ] CD-006-02 — Review candidate-to-score-current registry mapping.
- [ ] CD-006-03 — Review compareHomeModels() / evaluation.score path.
- [ ] CD-006-04 — Review AZIZ selectedCandidateId → selectedModel path.
- [ ] CD-006-05 — Review selectedModel → 2D flow.
- [ ] CD-006-06 — Review selectedModel → 3D flow.
- [ ] CD-006-07 — Review selectedModel → BOQ flow.
- [ ] CD-006-08 — Review selectedModel ↔ bestId overlap (CONTR-0004).
- [ ] CD-006-09 — Review integrated Gemini reviewCandidate() path.
- [ ] CD-006-10 — Review UI analyzeGeminiEngineering() path.
- [ ] CD-006-11 — Review dual Gemini Review overlap (CONTR-0006).
- [ ] CD-006-12 — Verify Flow → Claim → Evidence traceability.
- [ ] CD-006-13 — Record any potential lineage issue without declaring LINEAGE_BREAK.
- [ ] CD-006-14 — Resolution Guard + Registry Integrity revalidation.

## Completion DoD

CD-006 may become COMPLETED / PASS only when:
- every known Flow contradiction in current scope is identified, classified, documented, traceable, and evidence-linked;
- any new Flow contradiction is registered if discovered;
- potential lineage items are deferred to LINEAGE_AUDIT;
- no contradiction is resolved;
- no runtime path is merged or modified;
- no refactor or architecture enforcement occurs;
- registry integrity remains PASS.

## Guard

resolution: NOT_ATTEMPTED
runtime_changes: false
refactor_performed: false
baseline: NOT_FROZEN
development: BLOCKED_UNTIL_BASELINE
