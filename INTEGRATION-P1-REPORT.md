# MIZAN v33 — P1 integrated candidate

Source baseline: Sites v33 source export, commit `dbc41c0ec424e389f81f0f14f13d288682e6744d`.

## Integrated path

`UI -> Claude P1 corrected planner -> Gemini P1 bound preliminary review -> AZIZ Candidate4R3 decision -> selected model -> existing 2D/3D/BOQ/editor/project-save`

The previously rejected external Gemini adapter proposal is not included.

## Verified in this candidate

- Baseline before edits: 78/78 site tests, build exit 0.
- Final after integration: 86/86 site tests, build exit 0.
- Dedicated multi-engine tests: 8/8.
- RECT/L/U generated and reviewed for south/north/east/west entry directions.
- AZIZ returns `SELECTED_PRELIMINARY`; construction approval remains false.
- Current street/neighbor setback controls are passed to the corrected Claude generation path and affect geometry identity/placement.
- Built-area cap failure is explicit; requested room program is not shrunk.
- Project save/import preserves exact integrated RECT/L/U geometry rather than rebuilding legacy strategies.
- Existing add/remove opening editor path was exercised on an integrated U model and remained valid.
- Corrected Claude source is vendored and mirrored into `dist/claude`; protected engine core files remain the delivered P1 versions.
- Corrected Gemini P1 review and AZIZ compiled modules are isolated under `dist/integration/`.
- 97 JavaScript modules under `dist/integration` pass `node --check`; no missing relative imports were found.
- Public-source secret scan found no `sk-...` token-like provider keys.

## Important limits still open

- Browser visual/cross-device acceptance has not yet been executed on this candidate.
- AI brief preferences are carried into the request but the first AZIZ integration weights only proven geometry/area/constraint axes; privacy/MEP/reference soft axes remain NOT_EVALUATED rather than fabricated.
- Production Cloudflare Worker remains the manually deployed `gentle-sun-5ef5`; its byte-for-byte source provenance is not established here and is not modified by this candidate.
- This package is not yet a production deployment.

## Main authored integration changes

- `dist/multi-engine.mjs` — website adapter and request construction.
- `dist/integration/pipeline.mjs` — frozen handoff pipeline adapted to static site paths and existing setback controls.
- `dist/integration/...` — corrected Gemini review modules, contract/reference support, compiled AZIZ runtime.
- `dist/app.mjs` — generation now uses the multi-engine pipeline and selected AZIZ model.
- `dist/project.mjs` — exact integrated model persistence/backward compatible legacy recipe rebuild.
- `tests/multi-engine.test.mjs` — integrated flow/save/editor/cap/direction tests.
- `vendor/claude-planner` + `dist/claude/compat-layer.mjs` — frozen corrected Claude P1 handoff.
