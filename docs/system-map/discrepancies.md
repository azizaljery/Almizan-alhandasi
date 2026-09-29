# Discrepancies

Open discrepancies after repository-scope discovery and map review:

1. Canonical source location for Design Core is not yet established.
2. AZIZ canonical source package is not yet established; integrated runtime exists.
3. Engineering Core canonical source across the UI and integration copies remains unresolved; the inspected copies are not byte-identical.
4. Production Worker byte-for-byte provenance remains unresolved and is distinct from repository test/build evidence.
5. Browser visual verification and production deployment verification remain distinct from repository test/build evidence.
6. Evidence reproducibility metadata is incomplete for several VERIFIED_TEST records; see EAGAP-0001.
7. Explicit compared hash values are absent for EVD-HASH-0001; see EAGAP-0002.
8. LBR-0001 remains INFERRED because no dedicated runtime assertion tests stale candidateId/geometryHash after manual opening edits; see EAGAP-0003.

Resolved or narrowed during audit:

- Current Mizan Score runtime is present at dist/mizan-score.mjs; future Mizan Score V1 remains a separate unimplemented target.
- Planner runtime boundary is registered as planner-engine.
- Critical selected-model flows to 2D, 3D, BOQ, Mizan Score, home-design evaluation, UI engineering review, and project persistence are mapped.
- Downstream identity limitations are recorded in LINEAGE_AUDIT rather than left as an untracked geometry-hash question.
