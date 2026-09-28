# ARCHITECTURE TRUTH AUDIT — Execution Checklist

## Status model

Execution status:
- NOT_STARTED
- IN_PROGRESS
- COMPLETED

Audit result:
- PASS
- FAIL
- BLOCKED

While a stage is still running and no final result exists, result is `null`.

Audit health is separate:
- PASS = no known failed check
- FAIL = at least one known failed check
- BLOCKED = a dependency prevents progress

This avoids using PASS to mean both "finished successfully" and "healthy so far".

## 1. SYSTEM DISCOVERY
Objective: discover current system reality without architectural assumptions.

DoD PASS:
- production inventory recorded
- discovery sources recorded
- entry points recorded
- external systems/dependencies recorded
- unknown areas explicitly recorded
- first-pass architecture inventory generated

## 2. SYSTEM MAP
Objective: create the auditable system map.

DoD PASS:
- Components Registry populated
- Data Flows Registry populated
- Consumers Registry populated
- Claims Registry populated
- Evidence Registry populated
- critical entities have stable IDs
- no known critical entity is silently omitted

## 3. REGISTRY INTEGRITY
Objective: validate the registries themselves.

Checks:
- json_validity
- unique_ids
- reference_integrity
- orphan_records
- verification_states

DoD:
- PASS when all checks PASS
- FAIL when any completed check FAILS
- BLOCKED when a blocking dependency prevents completion

## 4. EVIDENCE AUDIT
Objective: verify Claim -> Evidence -> Scope -> Limitations.

Checks per claim:
- evidence exists or claim is explicitly UNKNOWN
- scope documented
- limitations documented
- verification state present
- evidence source identified

DoD PASS when every critical claim has a valid evidence chain or is explicitly UNKNOWN.

## 5. CONTRADICTION DETECTION
Objective: detect and classify contradictions, not solve them.

DoD PASS:
- discovered contradictions documented
- each discovered contradiction classified
- contradiction report generated

Unresolved contradictions are allowed.

## 6. LINEAGE AUDIT
Objective: identify where proof ends and assumption begins.

DoD PASS:
- critical lineage traced
- each discovered LINEAGE_BREAK records both sides of the break
- lineage report generated

Unresolved lineage breaks are allowed.

## 7. HUMAN REVIEW
Objective: human approval of collected architectural truth.

DoD PASS:
- components reviewed
- critical claims reviewed
- evidence reviewed
- contradictions reviewed
- lineage breaks reviewed
- factual corrections recorded
- disagreements recorded

## 8. SYSTEM MAP BASELINE
Objective: freeze an honest current-state system map.

DoD PASS:
- factual corrections applied
- known unknowns included
- unresolved contradictions included
- lineage breaks included
- registry hashes generated
- baseline hash generated
- human sign-off completed
- baseline status FROZEN

## Global Definition of Done

ARCHITECTURE TRUTH AUDIT is completed only when:
- System Discovery completed
- System Map completed
- Registry Integrity PASS
- Evidence Audit PASS
- Contradiction Detection PASS
- Lineage Audit PASS
- Human Review PASS
- Baseline FROZEN

A frozen baseline may still contain known unknowns, unresolved contradictions and lineage breaks.
