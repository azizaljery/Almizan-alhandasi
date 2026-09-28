# ARCHITECTURE TRUTH AUDIT — Working Update Rule

Status: ACTIVE
Scope: control/mizan-master-checkpoint

## Rule

Any audit rule, definition, status model, evidence rule, contradiction classification, lineage convention, acceptance gate, or baseline requirement that is explicitly adopted during the audit must be reflected in the repository promptly.

## During the audit

Allowed update targets:
- docs/system-map/*.md
- docs/system-map/*.json
- docs/system-map/generated/*

Blocked until SYSTEM MAP BASELINE is FROZEN:
- AZIZ runtime/source changes
- Planner changes
- Mizan Score implementation changes
- Design Core changes
- Engineering Core changes
- 2D/3D/BOQ changes
- contract changes outside the audit registries
- production/deployment changes

## Meaning of "write it into the code"

During ARCHITECTURE TRUTH AUDIT:
- governance decisions become machine-readable registries, status snapshots, audit rules, and reports
- runtime behavior is not changed merely because a rule was discussed

After baseline freeze and ADR review:
- accepted architectural decisions may be implemented in source/runtime code through separate reviewed changes

## Update discipline

For every adopted change:
1. Identify the affected registry/document.
2. Update only the minimum required audit artifact.
3. Preserve current-vs-target separation.
4. Re-run Registry Integrity when registries change.
5. Record any contradiction or lineage candidate without fixing it.
6. Do not silently rewrite history; use a new commit.

Principle:
Discussion becomes governed repository state promptly, but production behavior changes only after the audit baseline and post-baseline decisions.


## Default interpretation of future suggestions

While ARCHITECTURE TRUTH AUDIT is active and SYSTEM MAP BASELINE is not FROZEN:

- New suggestions are treated by default as `Audit Governance Change`.
- They update audit artifacts, policies, registries, reports, status snapshots, or review gates only.
- They do NOT imply a runtime/source implementation change.

A suggestion becomes eligible for runtime implementation only after:
1. SYSTEM MAP BASELINE = FROZEN
2. Relevant PRE-BASELINE ADRs are reviewed
3. The resulting architectural decision is ACCEPTED
4. A separate implementation change is authorized/reviewed

If the user explicitly requests a runtime change before those gates, record the request as a post-baseline implementation candidate unless the governance freeze is explicitly lifted.

Traceability chain:

```text
Discussion
→ Decision
→ Audit Artifact Update
→ Commit
```

Never:

```text
Discussion
→ Memory
→ Maybe Later
```
