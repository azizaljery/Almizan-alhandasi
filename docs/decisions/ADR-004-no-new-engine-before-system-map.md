# ADR-004 — No new engine before system map gate

Status: ACCEPTED

Decision:
Do not create a new engine or perform major refactor until the system-map gate is satisfied.

Gate:
- every production component classified
- every source of truth known or UNKNOWN
- every main consumer documented
- every main data flow contracted or gap-recorded
- every critical claim evidenced or UNVERIFIED
- every known duplicate recorded without deletion
