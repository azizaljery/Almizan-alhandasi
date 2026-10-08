# Archive cap and retry hardening review

## Before and after

The baseline cap reproducer is in `cap-repro-before.log`. Against commit `5e3e550c57d43dfffe8fe2a8f8b31ec5334ee56e`, a same-geometry PUT at 500 rows returned 409, changed the saved title, and advanced `current_version` from 500 to 501 while the version-row count stayed 500.

The fix rejects a full archive before updates and adds the same quota condition to each mutating SQL statement, so another write reaching the cap after the precheck cannot partially update the target. The create path now gates its design-row insert too, preventing orphan designs at capacity. `cap-after.log` shows the direct cap refusal, a successful/replayed version 500 at the boundary, and a competing create that reaches 500 before the target batch; all three pass. The refused paths leave the relevant record, version, receipt, novelty-claim, and idempotency counts unchanged.

## Retry behavior

`archive-request.test.mjs` verifies the pending signature changes with URL, HTTP action, target design, expected version, title, or project. The project comparison uses the normalized project signature with top-level `savedAt` cleared, matching the server's idempotency fingerprint semantics. The browser test commits a write, drops its response, then retries; the URL, method, target, expected version, title, normalized project, and idempotency key match, and only one version is present. The browser also confirms a successful save re-enables the receipt-gated export.

## Why similar layouts recur

`repetition-diagnostic.json` compares two user requests with the same plot, room program, and seed but different narrative, likes, avoids, lifestyle values, and top priorities. Both produce the same four candidate geometries and select the same rectangle. Changing the generation seed from 31 to 32 also selected that same geometry in this run.

The input path explains the result:

- The prompt text is recorded in `interpretation.originalText`; the local generation path only extracts supported shape intent from it. Wishes such as guest separation or privacy do not become geometric constraints.
- Plot dimensions, entry, streets, setbacks, coverage, maximum built area, and the room count, type, area, dimensions, position, and side are forwarded to generation or validation.
- Shape and wing count can become hard constraints. Unsupported desires remain review notes instead of geometry requirements.
- Likes and brief priorities can be serialized as soft preferences, but `decideReviewed` passes an empty `softPreferences` list to AZIZ. Rejects also remove disallowed shape candidates and become a hard allowed-shapes constraint; they do not rank geometry inside the remaining shapes. AZIZ's weights cover geometry validity, hard constraints, room area accuracy, and efficiency; privacy and access remain unscored.
- `discovery.avoids` and lifestyle selections are not included in `preferenceList`. Palette and cost inputs are not layout-generation inputs. The manually edited land survey is not a direct parameter to `runMultiEngineDesign`.
- The exploration pool applies a fixed set of legacy rectangular strategies, side assignments, and width ratios; `selectDiverse` compares translation/rotation/reflection invariant descriptors with a 0.12 threshold. That can preserve candidate variety while still returning visually similar plans.

The generator was not changed in this patch. New semantic constraints need explicit supported meanings and a reliable geometry/selection test before the interface claims they affect a design.

## Fingerprint scope

`noveltyHash` enforces a no-repeat rule only under `mizan-novelty-v2` canonicalization (millimetre rounding plus normalized rotations/reflections and plot context). It is not a complete structural-equivalence detector. `exactGeometryHash` binds the exact stored model, site position, and survey for receipt/integrity checks; it does not define structural uniqueness. The documentation, response wording, and test name now use that distinction.

## Verification

- `npm test`: 168 passed, 0 failed (`npm-test.log`).
- `node scripts/build.mjs`: passed; 128 browser import modules (`build.log`).
- Playwright archive smoke: 9 passed, including lost-response retry, receipt-gated export, failure state, and 390/820 px layouts (`browser-report.json`).
- No AI Worker implementation or secret changed.

## Hosting gate

The current Site is public version 46. Sites reports no live D1 bindings or tables, although this source declares logical binding `DB`. The official Sites checkout/push/archive workflow script was not available from the selected execution environment, and the deployment instruction forbids replacing it with manual packaging. Therefore no source push, saved Site version, D1 migration, or deployment was attempted. The 390/820 px evidence is a local build with a mocked archive API, not live D1 verification.
