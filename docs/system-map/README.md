# MIZAN SYSTEM MAP

Machine-readable architectural truth registry.

Rules:
- JSON registries describe current observed truth only.
- Target architecture is stored separately.
- Unknown stays UNKNOWN.
- Every critical claim must link to evidenceIds or remain UNVERIFIED/UNKNOWN.
- Refactors are forbidden until the map gate is satisfied.
- File names, comments and README text are not runtime proof.
- dist is not canonical source merely because runtime consumes it.
- vendor is not a proven mirror without hash/content comparison.
- One passing test proves only the assertions and scope of that test.

Primary registries:
- components.registry.json
- data-flows.registry.json
- consumers.registry.json
- evidence.registry.json
- claims.registry.json

Human views:
- classifications.md
- current-architecture.md
- target-architecture.md
- discrepancies.md

Proof model:
Claim → Evidence → Scope → Limitations

Principle:
Map truth first. Refactor second.
