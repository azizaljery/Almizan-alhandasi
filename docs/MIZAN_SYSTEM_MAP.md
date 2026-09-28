# MIZAN_SYSTEM_MAP

Subtitle: Architectural Truth, Data Lineage, and Ownership Registry

Status: SYSTEM MAP BASELINE — CURRENT/PROPOSED SEPARATED
Scope: Architecture, data lineage, ownership, evidence. No refactor authorized by this document alone.

## Executive rule

MIZAN is an engineering system, not a prompt stack.

The architectural layers are separated by responsibility:

- `PlannerOutputContract` = legal shape of planning/model data.
- `Mizan Score` = quality measurement authority.
- `AZIZ Engine` = candidate decision and competition manager.
- `Engineering Review` = scoped engineering findings/review authority.
- `2D / 3D / BOQ` = consumers/derivations from the selected canonical model.

No layer may silently absorb another layer's responsibility.

## Current vs Target

Every connection in this map must use one of:

- VERIFIED
- PARTIALLY_VERIFIED
- DOCUMENTED_ONLY
- PROPOSED
- NOT_EVALUATED
- BROKEN

Never present TARGET_FLOW as CURRENT_VERIFIED_FLOW.

---

# 1. Data Truth Registry

Canonical contract families to track:

- ClientBrief
- DesignRequest
- CandidateEnvelope
- PlannerOutputContract
- ValidatedDesignGeometry
- ReviewEnvelope
- MizanScoreResult
- DecisionRecord
- FinalDesignState

## PlannerOutputContract ownership

Classification: CANONICAL_SOURCE

Owns:
- PlotInput
- RoomRequest
- ValidatedDesignGeometry
- Quantities contract shape where defined

Does not own:
- candidate ranking
- client preference policy
- engineering approval
- visualization state
- Mizan Score equations
- AZIZ decision policy

Important semantic rule:
- `buildingFootprint` is the geometry truth for the building mass where the contract defines it.
- `boundingBox` is derived/supporting data, not a substitute for polygon truth.

---

# 2. Execution Flow Registry

## CURRENT_VERIFIED_FLOW

To be reconstructed from code + tests. Do not infer from desired architecture.

## TARGET_FLOW

```text
Client Brief
    ↓
Requirements / DesignRequest
    ↓
Independent Candidate Engines
    ↓
CandidateEnvelope[]
    ↓
Hard Constraints
    ↓
Mizan Score
    ↓
AZIZ Decision
    ↓
Selected Candidate
    ↓
Engineering Review
    ├─ ACCEPT WITH SCOPE
    ├─ NEEDS CLARIFICATION
    ├─ BLOCKED
    └─ REFINEMENT REQUEST
             ↓
      New Candidate Revision
             ↓
      Full Revalidation
             ↓
      Mizan Score Again
             ↓
      AZIZ Decision Again
             ↓
      FinalDesignState
             ↓
      2D / 3D / BOQ
```

Engineering Review must never silently mutate the selected candidate.

Every engineering-driven change must create:
- new `candidateId` or explicit new revision identity
- new `revision`
- new `geometryHash`
- new `reviewId`
- new `decisionId`

---

# 3. Consumer Registry

## 2D Renderer

May:
- READ canonical geometry
- READ labels
- READ openings
- READ selected state

Must not:
- generate canonical walls
- repair geometry silently
- change dimensions
- become a second geometry truth

## 3D Renderer

May:
- READ canonical wall pieces
- READ openings
- READ materials/display state

Must not:
- invent missing walls
- infer structural elements as canonical truth
- rewrite geometry

## BOQ Engine

May:
- READ canonical geometry
- DERIVE quantities

Must not:
- read visual meshes as geometry truth
- substitute bounding boxes for polygons
- silently repair invalid geometry

## Mizan Score

May:
- READ candidate
- READ evidence/context
- WRITE score vector
- WRITE penalties
- WRITE confidence

Must not:
- select winner
- mutate geometry
- issue refinement instructions

## AZIZ Engine

May:
- READ candidate envelopes
- READ hard-constraint results
- READ score vectors
- WRITE decision records
- WRITE selection/rejection/refinement decisions

Must not:
- redefine scoring equations
- mutate canonical geometry
- become engineering approval authority

## Engineering Review

May:
- READ selected candidate geometry
- WRITE findings
- WRITE review status
- WRITE refinement requests

Must not:
- mutate selected geometry in place
- claim executive/stamped approval unless separately established

---

# 4. Ownership Registry

Rule:

```text
One concept, one authoritative owner.
```

| Concept | Authoritative owner |
|---|---|
| Canonical geometry | Planner / Geometry Core |
| Geometry validation | Validation Core |
| Quality definition | Mizan Score |
| Candidate selection | AZIZ Engine |
| Engineering findings | Engineering Review |
| 2D rendering | 2D Renderer |
| 3D visualization | 3D Renderer |
| Quantity derivation | BOQ Engine |
| Client preferences | Requirements Engine |
| Identity / provenance policy | Control Room / Contracts |
| Project persistence | Project Store |

Mirrors and adapters are allowed; duplicate owners are not.

---

# 5. Evidence Registry

Every component record must include:

```text
component:
sourcePath:
runtimePath:
version:
sourceHash:
runtimeHash:
contractVersion:
tests:
lastVerifiedAt:
verificationEnvironment:
deploymentStatus:
provenanceStatus:
```

Verification levels are distinct:

- SOURCE_VERIFIED
- BUILD_VERIFIED
- INTEGRATION_VERIFIED
- BROWSER_VERIFIED
- PRODUCTION_VERIFIED

One level never implies another.

---

# 6. Data Lineage

Required lineage for any architectural element:

```text
requirementId
→ requestId
→ candidateId
→ candidateRevision
→ engineId
→ engineVersion
→ contractVersion
→ geometryElementId
→ validationRunId
→ scoreRunId
→ reviewId
→ decisionId
→ finalGeometryHash
→ consumerOutputs
```

If any required link cannot be proven, record:

```text
LINEAGE_BREAK
```

Do not fill lineage gaps with inference.

Example:

```text
Requirement: R-PRIVACY-004
    ↓
Design Request: DR-018
    ↓
Candidate: C-073 / Revision 2
    ↓
Engine: Planner-X v2.3.1
    ↓
Wall: W-102
    ↓
Validation: VR-882 / PASS
    ↓
Score: MS-142
    ↓
Review: ER-091 / PRELIMINARY
    ↓
Decision: AZ-055 / SELECTED_PRELIMINARY
    ↓
Final Geometry Hash
    ├─ SVG Hash
    ├─ 3D Model Hash
    └─ BOQ Hash
```

---

# 7. File Classification

Type:
- CANONICAL_SOURCE
- RUNTIME_BUILD
- INTEGRATION_ADAPTER
- HISTORICAL_DUPLICATE

State:
- ACTIVE
- SHADOW
- DEPRECATED
- ORPHANED
- UNVERIFIED
- CANDIDATE_FOR_ARCHIVE

Each important file should eventually be recorded as:

```text
path:
type:
status:
sourceOfTruth:
canonicalUpstream:
consumers:
removalImpact:
```

---

# 8. Mizan Score position

Mizan Score is a measurement authority, not a decision engine.

Initial contract shape:

```ts
interface MizanScoreAuthority {
  evaluate(
    candidate: CandidateEnvelope,
    context: ScoringContext
  ): MizanScoreResult;
}

interface MizanScoreResult {
  axes: Record<string, AxisScore>;
  penalties: Penalty[];
  confidence: ConfidenceReport;
  overall?: number;
  scoreVersion: string;
  evidenceIds: string[];
}
```

Forbidden fields in `MizanScoreResult`:
- selectedCandidateId
- winner
- refinementInstruction

Those belong to AZIZ.

---

# 9. AZIZ selection policy

Do not rank solely by `overall`.

Target funnel:

```text
Hard constraints
→ Remove invalid
→ Remove duplicates
→ Build Pareto frontier
→ Group candidate families
→ Score within families
→ Diversity-aware final selection
```

This preserves high-quality alternatives that trade privacy, economy, daylight, circulation, etc. differently.

---

# 10. Completion Criteria

MIZAN_SYSTEM_MAP is incomplete until it can answer quickly:

1. Where did this room/wall come from?
2. Which engine/version created it?
3. Which contracts did it cross?
4. Was it changed later? By whom?
5. Which constraints passed/failed?
6. What are its Mizan Score axes and evidence?
7. Why did AZIZ select/reject it?
8. What was Engineering Review's scope/status?
9. What is the final `geometryHash`?
10. Do 2D/3D/BOQ derive from the same hash?
11. What is verified vs not evaluated?
12. Is the deployed version the same version that was tested?

If the map cannot answer these, it is not complete.

---

# 11. Execution priority

1. MIZAN_SYSTEM_MAP
2. Mizan Score Specification
3. Design Core decision
4. Refactor / archive / delete only after evidence

No rename of AZIZ, SHARA, or engines during this mapping phase.

Principle:

```text
Map truth first. Refactor second.
```
