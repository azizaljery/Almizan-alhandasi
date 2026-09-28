# Classifications

## Types
- SOURCE
- BUILD
- ADAPTER
- CONTRACT
- TEST
- EVIDENCE
- GENERATED
- VENDORED
- LEGACY
- DUPLICATE
- EXPERIMENTAL
- UNKNOWN

## States
- ACTIVE
- SHADOW
- DEPRECATED
- ORPHANED
- UNVERIFIED
- CANDIDATE_FOR_ARCHIVE

## Verification statuses
Only these values are allowed:
- VERIFIED_RUNTIME
- VERIFIED_TEST
- VERIFIED_HASH
- DOCUMENTED
- INFERRED
- CONTRADICTED
- UNKNOWN

### VERIFIED_RUNTIME
Use only when the actual execution path is traced from entry point to output, or a direct runtime record proves it.

### VERIFIED_TEST
Record the test file and exact test/symbol or precise description. A passing test proves only its assertions and scope.

### VERIFIED_HASH
Record both compared artifacts, algorithm, hash values, and whether each side is source or runtime/build.

### DOCUMENTED
The claim exists in documentation only. It does not prove implementation or runtime behavior.

### INFERRED
Record the reasoning steps. INFERRED must never be used as a basis for deletion or redesign.

### CONTRADICTED
Record both conflicting pieces of evidence. Do not choose one without stronger evidence.

### UNKNOWN
Use when source, tests or runtime records are insufficient.

Additional rules:
- Never use one test result to prove an entire pipeline.
- dist is not canonical source merely because it is used at runtime.
- vendor is not a proven mirror without hash/content comparison.
- comments and README files are not runtime proof.
- file names do not prove responsibility.
- DUPLICATE requires hash equality or explicit content comparison; name similarity is insufficient.
