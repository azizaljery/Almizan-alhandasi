# Current Architecture

This page is derived from observed repository code and test evidence only.

## Static code observations

- `dist/app.mjs` imports and invokes:
  - `runMultiEngineDesign`
  - `calculateMizanScore`
  - `quantityRows` / `estimate`
  - 2D and 3D rendering modules
  - Gemini engineering review adapter
- `dist/multi-engine.mjs` builds a DesignRequest, invokes `runPipeline`, maps returned candidate/review pairs into website models, and selects the model whose candidateId equals the AZIZ decision selectedCandidateId.
- `dist/integration/pipeline.mjs` integrates Claude generation, validation, Gemini review, identity/hash helpers and AZIZ decision runtime.
- `dist/project.mjs` embeds integrated models for persistence and validates them before restoration.
- `dist/estimates.mjs` derives quantities from the model via planner `quantities(model)`.
- `dist/plan-view.mjs` renders rooms, walls and openings directly from the model.
- `dist/viewer3d.mjs` derives 3D wall pieces and openings directly from the model.
- `dist/mizan-score.mjs` currently implements a heuristic score over privacy, movement, efficiency, daylight, ventilation, economy and preliminary compliance.

Static code inspection is INFERRED evidence, not VERIFIED_RUNTIME.

## Verified by automated tests

- `tests/release-consistency.test.mjs` verifies that the AZIZ-selected model is the exact tested source consumed by:
  - 2D SVG room geometry
  - 3D wall pieces
  - BOQ quantity rows
- `tests/multi-engine.test.mjs` verifies the integrated Claude -> Gemini -> AZIZ path for south, north, east and west entries and validates all returned RECT/L/U models.
- `tests/multi-engine.test.mjs` verifies integrated save/restore preserves selected and alternative geometry exactly in the tested round-trip.
- `tests/claude-integration.test.mjs` verifies deployed Claude source files match vendor Claude sources byte-for-byte in the test environment.

## Not established as runtime/production truth

- Browser visual acceptance is not proven.
- Production deployment identity is not proven.
- Production Cloudflare Worker byte-for-byte provenance is not proven.
- Mizan Score browser execution has not yet been runtime-traced.
- Canonical source package for AZIZ is not yet established.
- Canonical source package for Engineering Core is not yet established.
- Design Core canonical ownership/source remains unresolved.

Unknowns remain UNKNOWN until evidence is stronger than static inspection or documentation.
