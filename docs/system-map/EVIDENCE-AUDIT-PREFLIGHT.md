# EVIDENCE_AUDIT — Preflight Only

Status: PREPARED_NOT_STARTED

This is preparation only. EVIDENCE_AUDIT does not become the active stage until LINEAGE_AUDIT closes.

## Current Evidence Inventory

- Total evidence records: 21
- VERIFIED_TEST: 4
- VERIFIED_HASH: 1
- DOCUMENTED: 3
- INFERRED: 13

## Known preflight questions

1. EVD-TEST-0001 / 0002 / 0003 have commit=null, sourceHash=null, executedAt=null.
2. EVD-HASH-0001 is currently typed VERIFIED_TEST and does not record explicit per-file hashes.
3. EVD-HASH-0002 has explicit Git blob hashes and a dated comparison.
4. Static code evidence remains INFERRED and must not be promoted without runtime/test/hash evidence.
5. Evidence scope and limitations must be reviewed claim-by-claim.
6. Registry Integrity PASS is not evidence that the underlying tests were re-executed at the current commit.

## Guard

- Do not start EVIDENCE_AUDIT before LINEAGE_AUDIT closure.
- Do not rewrite evidence strength to make coverage look better.
- Missing execution metadata must remain visible.
