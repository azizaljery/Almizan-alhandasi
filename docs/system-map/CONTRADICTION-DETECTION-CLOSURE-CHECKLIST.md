# CONTRADICTION_DETECTION — Closure Checklist

Status: ACTIVE
Stage: CONTRADICTION_DETECTION
Resolution policy: NOT_ATTEMPTED

## Objective

Close the stage only when all known contradictions are:
- Identified
- Classified
- Documented
- Traceable

Resolution is not part of this stage.

## 1. Contradictions Coverage Review

- [ ] Review all approved contradiction axes.
- [ ] Confirm no discovered contradiction remains outside the registry.
- [ ] Review current Components for unregistered contradictions.
- [ ] Review current Flows for unregistered contradictions.
- [ ] Review current Claims for unregistered contradictions.
- [ ] Update contradictions.registry.json for newly discovered items.

Evidence:
- docs/system-map/contradictions.registry.json

## 2. Ownership Contradictions

- [ ] Review Score ownership overlap.
- [ ] Review AZIZ boundaries.
- [ ] Review Engineering Review boundaries.
- [ ] Classify each Ownership item.
- [ ] Link each item to evidence.

DoD:
Every Ownership contradiction is registered, classified, documented, and evidence-linked.

## 3. Flow Contradictions

- [ ] Review current Mizan Score path.
- [ ] Review compareHomeModels() overlap.
- [ ] Register overlap/contradiction points.
- [ ] Classify as FLOW where applicable.

## 4. Source-of-Truth Contradictions

- [ ] Review canonical model ownership.
- [ ] Review Source vs Runtime vs Mirror.
- [ ] Document conflicting claims.
- [ ] Link each to evidence.

## 5. Identity / Lineage Candidates

- [ ] Review candidateId.
- [ ] Review geometryHash.
- [ ] Review model identity propagation.
- [ ] Register unresolved items as Potential Lineage Issue.
- [ ] Do not create LINEAGE_BREAK before LINEAGE_AUDIT.

## 6. Contradictions Registry Integrity

- [ ] IDs unique.
- [ ] Verification states valid.
- [ ] Referenced evidence exists.
- [ ] Referenced claims exist.
- [ ] No orphan references.
- [ ] Re-run Registry Integrity.

Expected result: PASS

## 7. Contradictions Report Generation

- [ ] Update docs/system-map/generated/contradictions-report.md.
- [ ] Include all contradictions.
- [ ] Include classification.
- [ ] Include evidence.
- [ ] Include current state.

## 8. Resolution Guard

- [ ] Every contradiction has resolution: NOT_ATTEMPTED or equivalent.
- [ ] No refactor performed.
- [ ] No production engine modified.

DoD: No Resolution Attempted.

## 9. Human Verification

- [ ] Human review of contradictions registry.
- [ ] Human review of contradictions report.
- [ ] Classification reviewed.
- [ ] Evidence traceability reviewed.

DoD: Human Review Completed.

## Final Definition of Done

CONTRADICTION_DETECTION can become:

```text
status: COMPLETED
result: PASS
health: PASS
```

only when:
- All known contradictions are identified.
- All known contradictions are classified.
- All known contradictions are documented.
- All known contradictions are traceable.
- Ownership contradictions reviewed.
- Flow contradictions reviewed.
- Source-of-Truth contradictions reviewed.
- Identity/Lineage candidates documented.
- Contradictions Registry Integrity = PASS.
- Contradictions Report generated.
- Human Review completed.
- No resolution attempted.

## Exit Criteria

On closure:
- current_stage = LINEAGE_AUDIT
- baseline.status = NOT_FROZEN
- development = BLOCKED_UNTIL_BASELINE


## Closure principle

Do not close this stage because:
- the search has taken long enough
- the contradiction count is small
- a report exists
- the team feels ready to move on

Close only when the Closure Checklist is complete and the Definition of Done is satisfied by evidence.

Required closure conditions include:
- Human Review Completed
- Contradictions Registry Integrity = PASS
- Contradictions Report Generated
- All known contradictions are Identified, Classified, Documented, and Traceable
- No Resolution Attempted
