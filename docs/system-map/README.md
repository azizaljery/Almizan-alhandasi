# MIZAN SYSTEM MAP

Machine-readable architectural truth registry.

Rules:
- JSON registries describe current observed truth only.
- Target architecture is stored separately.
- Unknown stays UNKNOWN.
- Claims without evidenceId are UNVERIFIED.
- Refactors are forbidden until the map gate is satisfied.

Primary registries:
- components.registry.json
- data-flows.registry.json
- consumers.registry.json
- evidence.registry.json

Human views:
- classifications.md
- current-architecture.md
- target-architecture.md
- discrepancies.md
