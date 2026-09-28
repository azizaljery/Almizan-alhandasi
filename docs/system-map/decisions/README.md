# Audit Decision Records

This directory stores governance decisions made during ARCHITECTURE TRUTH AUDIT.

These records are not post-baseline architecture ADRs.

They govern the audit process itself.

Naming:
- ADR-AUDIT-XXXX.yaml

Lifecycle:
- PROPOSED
- APPROVED
- REJECTED
- SUPERSEDED

Decision traceability:
Discussion
→ Decision Record
→ Repository Update
→ Commit
→ Traceable Audit History

Approval rule:
A decision is not APPROVED until its Decision DoD is satisfied.

Production/runtime implementation remains blocked until:
1. SYSTEM MAP BASELINE = FROZEN
2. Relevant post-baseline ADR review is complete
3. A separate implementation change is authorized
