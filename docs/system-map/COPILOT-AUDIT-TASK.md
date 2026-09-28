# COPILOT READ-ONLY ARCHITECTURE AUDIT

MODE: READ-ONLY ARCHITECTURE AUDIT

Primary objective:
Build a verifiable current-state system map for MIZAN / Almizan-alhandasi.

Non-objectives:
- Refactoring
- Bug fixing
- Architecture redesign
- File deletion or consolidation
- Implementing target architecture
- Resolving contradictions
- Implementing Mizan Score V1
- Modifying AZIZ, design-core, engineering-core, planner, UI, 2D, 3D, BOQ, Worker or deployment code

We are not asking you to "organize the project" or make it look cleaner.
We are asking you to extract current truth exactly as supported by code, tests and records.

If you need to change any file outside docs/system-map/:
1. Do not make that change.
2. Record the need in docs/system-map/discrepancies.md.
3. Continue documenting what can be established without modifying source.

## Required outputs

docs/system-map/
├── components.registry.json
├── data-flows.registry.json
├── consumers.registry.json
├── evidence.registry.json
├── claims.registry.json
├── current-architecture.md
├── discrepancies.md
└── generated/
    ├── dependency-graph.md
    ├── source-of-truth.md
    └── unverified-claims.md

Do not modify any file outside docs/system-map/.

## Start by inspecting

- dist/app.mjs
- dist/multi-engine.mjs
- dist/integration/pipeline.mjs
- dist/mizan-score.mjs
- dist/project.mjs
- dist/plan-view.mjs
- dist/viewer3d.mjs
- dist/estimates.mjs
- dist/engineering.mjs
- dist/gemini-engineering-layer.mjs
- dist/claude/PlannerOutputContract.mjs
- dist/integration/aziz/
- dist/integration/gemini/packages/engineering-core/
- tests/multi-engine.test.mjs
- tests/release-consistency.test.mjs
- tests/claude-integration.test.mjs
- RELEASE-TEST-87.log
- RELEASE-MANIFEST.md
- INTEGRATION-P1-REPORT.md

## Component extraction

For each production-relevant component, record:

- componentId
- displayName
- sourcePath
- runtimePaths
- buildPaths
- imports
- exports
- responsibilities
- consumers
- inputs
- outputs
- mutations
- fallbacks
- sourceOfTruth
- evidenceIds
- unknowns
- duplicateOrMirrorCandidates
- classification
- status

Never classify DUPLICATE because names are similar.
DUPLICATE requires hash equality or explicit content comparison.

## Data flow extraction

For each critical data flow, record:

- flowId
- producer
- consumer
- contract
- fieldsTransferred
- identityOrGeometryHashPropagation
- mutationPolicy
- failureBehavior
- verification
- evidenceIds
- openQuestions

## Consumer extraction

For each main consumer, record:

- exact fields read
- exact fields written
- forbidden writes
- mutation behavior
- fallback behavior
- behavior when required fields are missing
- whether fallback is explicit or silent
- verification
- evidenceIds

## Verification statuses

These are the only allowed verification states:

VERIFIED_RUNTIME
VERIFIED_TEST
VERIFIED_HASH
DOCUMENTED
INFERRED
CONTRADICTED
UNKNOWN

There is no eighth state.

### VERIFIED_RUNTIME

Do not use VERIFIED_RUNTIME merely because an import/call chain appears clear.

VERIFIED_RUNTIME requires at least one of:
1. A direct runtime log proving the path was executed.
2. Saved instrumentation/trace that links input to output.
3. Equivalent direct runtime evidence.

If an integration test executes the path, use VERIFIED_TEST for that claim.

Static code reading alone is INFERRED.

### VERIFIED_TEST

Record:
- exact test file
- exact test name/symbol or precise assertion scope
- what it proves
- what it does not prove

A passing test proves only its assertions and scope.

### VERIFIED_HASH

Record:
- artifact A
- artifact B
- algorithm
- hash value for each side
- whether each artifact is source, runtime or build output

### DOCUMENTED

The claim exists in documentation only.
It does not prove code or runtime behavior.

### INFERRED

Record the reasoning steps.
INFERRED must never be used as the basis for deletion, consolidation or redesign.

### CONTRADICTED

Record all conflicting evidence.
Do not choose one side unless stronger evidence resolves the conflict.

### UNKNOWN

Use when code, tests or runtime records are insufficient.

## Evidence rules

- Never use one test to prove an entire pipeline.
- dist is not canonical source merely because runtime consumes it.
- vendor is not a proven mirror without hash/content comparison.
- comments and README files are not runtime proof.
- file names do not prove responsibility.
- multiple DOCUMENTED or INFERRED records do not automatically upgrade a claim to VERIFIED.
- Claim status is determined by the strongest valid evidence supporting the exact statement within the same scope.
- If valid supporting and contradicting evidence remain unresolved, claim status = CONTRADICTED.

## Claim/evidence model

Every critical claim must have a stable unique claimId.

Each critical claim must follow:

Claim -> Evidence -> Scope -> Limitations

Example claim:

{
  "claimId": "CLM-FLOW-0007",
  "statement": "2D, 3D and BOQ consume the model selected by AZIZ in the tested integration candidate.",
  "status": "VERIFIED_TEST",
  "evidenceIds": ["EVD-TEST-0001"],
  "scope": "Tested integration candidate",
  "limitations": [
    "Production runtime not independently verified"
  ]
}

Example evidence:

{
  "evidenceId": "EVD-TEST-0001",
  "type": "VERIFIED_TEST",
  "sourcePath": "tests/release-consistency.test.mjs",
  "symbolOrTest": "AZIZ-selected model is the exact source consumed by 2D, 3D geometry and BOQ",
  "claimIds": ["CLM-FLOW-0007"],
  "scope": "Selected candidate propagation",
  "limitations": [
    "Does not prove browser rendering correctness",
    "Does not prove production deployment identity"
  ]
}

Claims without sufficient evidence must appear in:
docs/system-map/generated/unverified-claims.md

## Registry integrity rules

All registry JSON must parse successfully with JSON.parse.

Before finishing:
- verify all componentId values are unique
- verify all flowId values are unique
- verify all consumerId values are unique
- verify all evidenceId values are unique
- verify all claimId values are unique
- verify every referenced evidenceId exists
- verify every referenced claimId exists
- verify every componentId referenced by a data flow exists in Component Registry
- leave no dangling references

Do not manually "correct" registry content to satisfy validation if the underlying fact is not established.
Use UNKNOWN and discrepancies instead.

## LINEAGE_BREAK

Do not write only "lineage is broken".

Record the exact boundary where proof stops and assumption begins.

Use a structure equivalent to:

{
  "lineageBreakId": "LB-0001",
  "upstreamComponent": "candidate-producer",
  "downstreamComponent": "aziz-engine",
  "lastVerifiedArtifact": "geometryHash",
  "firstUnverifiedArtifact": "decisionCandidate",
  "reason": "No verified adapter or trace found",
  "evidenceIds": [],
  "status": "UNKNOWN"
}

For every lineage break, identify:
- where verified lineage ends
- where unverified lineage begins
- why the link is not proven

Record lineage breaks in discrepancies.md and summarize them in generated/unverified-claims.md.

## Current architecture boundaries to verify, not assume

PlannerOutputContract = Data Contract Authority
Mizan Score = Measurement / Evidence Authority
AZIZ = Decision / Orchestration Authority
Engineering Review = Findings / Refinement Authority
2D / 3D / BOQ = Downstream Consumers

Do not change these boundaries in this task.
Only determine where current code conforms, overlaps, contradicts or remains unknown.

## Acceptance gate

The task is not complete merely because files were created.

Acceptance requires:

1. Every known production component is represented in Component Registry.
2. Every major consumer is linked to its inputs and outputs.
3. Every critical flow has a known contract or is explicitly UNKNOWN.
4. Every critical claim has evidence or appears in unverified-claims.md.
5. Every LINEAGE_BREAK identifies both sides of the break.
6. Every duplicate/mirror candidate is documented without deletion.
7. current-architecture.md is derived from registries and does not contradict them.
8. No file outside docs/system-map/ was modified.
9. The final response lists every changed file.
10. Registry integrity checks pass with no duplicate IDs or dangling references.

## Required final response

Return a factual summary using this exact structure:

Files changed:
Components registered:
Data flows registered:
Consumers registered:
Claims registered:
Evidence records:
Unknowns:
Contradictions:
Lineage breaks:
Duplicate/mirror candidates:
Files outside docs/system-map modified: NONE

Do not invent counts in advance. Fill them only after inspection.

## Final rule

We are not asking you to make the project look organized.
We are asking you to show current truth, including unknowns, contradictions, overlap and broken lineage.

Map truth first. Refactor second.
