# Reference knowledge and engineering identity contract

Status: design boundary for future reference-library and cross-project identity work. This document records required evidence and privacy constraints; it does not claim that a reference library or global duplicate service exists.

## Source evidence

Every imported rule or design reference must retain its originating organization or author, canonical source URI, document and version, publication/effective/retrieval dates, jurisdiction and geographic applicability, exact rule or section identifier, quoted or otherwise traceable evidence, verification state, and a machine-readable license/permission record. The permission record must state whether the source permits storage, derived geometry, caching, display, redistribution, and model training. Unknown permissions stay unknown and block the corresponding use. A municipality-specific conclusion requires a cited current source for that municipality and its effective date; examples and general guidance are not local rules.

Reference layouts should be indexed as sourced functional relationships and spatial patterns, not copied as a fixed room template. Store which source supports each relationship, the conditions where it applies, the geometry and program that were actually measured, and confidence/limitations. Do not accumulate large scraped libraries by default. A future ingestion batch needs an explicit scope, source-rights review, retention period, and deletion path.

## Engineering identity

A project fingerprint should derive from normalized, measured geometry and the functional relationship graph: plot/buildable geometry, room type and dimensions, actual shared boundaries, door/opening links, circulation graph, entry connections, and massing topology. It should ignore presentation color, furniture, labels, client identity, room IDs, translation, rotation, reflection, and permutation of equal rooms when those transformations leave the physical design equivalent. A hash proves only that two canonicalized records match; it does not prove engineering quality or legal uniqueness.

Candidate diversity and uniqueness are separate checks. Hard program, geometry, access, and source constraints must pass first. Exact duplicate rejection can then use canonical identity. Similarity scores may help order otherwise eligible candidates, but must not distort rooms or relationships to manufacture a difference. Existing project-local history can compare alternatives in that project. The current implementation has no durable cross-customer fingerprint index, no atomic global uniqueness transaction, and no evidence that a design is unique across all clients.

## Cross-customer privacy boundary

If global exact-duplicate prevention is later approved, keep the service response to a minimal exact-match decision. Never reveal another customer's drawing, room program, location, identity, project timing, or similarity details. Define tenant-scoped authorization, encrypted storage and transport, key separation, retention and deletion, access logging, abuse/rate controls, concurrency-safe reservation, and incident handling before rollout. Even a yes/no match can reveal that another project exists, so threat-model that metadata leak and review it with privacy/security owners. Do not persist direct identifiers in the fingerprint index.

## Claims and validation

Label every rule as verified, estimated, or unverified with a direct provenance trail. Preserve the source version and the geometry evidence used for each decision. Tests may prove parsing, local identity invariants, and synthetic geometry behavior; they cannot prove a municipality's requirements, legal licensing, cross-client uniqueness, or real-world construction suitability without the corresponding external evidence and review.
