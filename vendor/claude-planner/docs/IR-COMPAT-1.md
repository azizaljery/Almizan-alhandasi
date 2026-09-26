# IR-COMPAT-1 -- Bridging the live site to the v2.2.1 Planner

Date: 2026-09-25. Source of truth for the "old" side: a Safari web-archive snapshot of
https://al-mizan-al-handasi.aljeryabod.chatgpt.site/ (the currently-published site), containing
its actual planner.mjs (521 lines, no `ENGINE_VERSION` constant beyond `'rectangular-2'`) and the
files that import it: app.mjs, plan-view.mjs, viewer3d.mjs. Not reconstructed from memory --
extracted and read line by line.

## 1. Why a bridge, not a straight file swap

Swapping `dist/planner.mjs` for v2.2.1 as-is breaks the live site immediately:

| Symptom | Cause |
|---|---|
| `TypeError: generateAlternatives is not a function` | app.mjs line 302/321 calls `generateAlternatives(plot, rooms)`. v2.2.1 has no such export (`generateModel`/`plan` instead). |
| Alternative cards render blank / throw | app.mjs reads `model.architecture.{tag,form,idea,bestFor,tradeoff}` and `model.strategy`. v2.2.1's `ValidatedDesignGeometry` has neither field. |
| 2D/3D view of a U model is empty or wrong | plan-view.mjs / viewer3d.mjs read `model.massingParts` (array of boxes) to draw the mass. v2.2.1 has one polygon (`buildingFootprint`) instead, no `massingParts`. |
| Quantities panel wrong for U | old `quantities()` used `model.builtArea ?? building.w*building.h` -- a rectangle even for a U model. v2.2.1's `quantities()` already excludes the courtyard correctly, but the field name `builtArea` the old UI reads doesn't exist on the new model. |

`src/compat-layer.mjs` (new file, this batch) solves this without touching `app.mjs`,
`plan-view.mjs`, `viewer3d.mjs`, or `src/planner.mjs` itself.

## 2. The root cause this also happens to fix

The live site's own courtyard generator (`generateTopologyModel`, old planner.mjs lines 337-382)
built a courtyard by shrinking a fixed wing width in a loop (`for (let wing = ...; wing -= .25)`)
until two rectangular wings plus a corridor fit -- no real polygon, just stacked rectangles. When
no width worked it threw: `'تعذر ملاءمة نموذج الفناء الطوبولوجي ضمن الأرض والمساحات الحالية؛
استُخدم البديل المحوري دون تصغير الغرف.'` -- exactly the "box problem" message already diagnosed
(technical-files-archive.md, 2026-09-21/22): the site always looked like it offered 3 different
concepts but silently fell back to the same rectangle.

`compat-layer.mjs` calls v2.2.1's real Polygon-First engine (`generateModel({ ...plot, shape: 'u'
}, rooms)`) instead of reimplementing that loop. Verified directly (test C01, and manually against
a 30x45 m / 12-room plot that is a realistic size for this failure): the new engine succeeds and
produces a real courtyard where a plot of that size was the old loop's typical failure case.

## 3. Old <-> new field mapping

| Old field (app.mjs/plan-view.mjs/viewer3d.mjs read this) | v2.2.1 equivalent | Bridge behaviour |
|---|---|---|
| `generateAlternatives(plot, rooms)` | `generateModel(plot, rooms)` called twice (shape 'u', shape 'rect') | New export, same signature and return shape `{ models, failures }` |
| `model.version` (was 1) | `version` (is 2) | Passed through unchanged -- a real, intentional version bump, not hidden |
| `model.engineVersion` (`'rectangular-2'`) | (none) | Set to `'polygon-2'` -- deliberately a NEW string so a legacy model loaded from storage is never mistaken for a fresh one (see also migrations.mjs / IMPORT-MIGRATION.md, same principle) |
| `model.strategy` (`'compact'\|'balanced'\|'frontage'\|'courtyard'\|'u-court'`) | `shape` (`'rect'\|'l'\|'u'`) | Bridge keeps the OLD 5-name `strategy` field (for STRATEGIES/CONCEPT_PROFILES lookups) alongside the new `shape` |
| `model.architecture.{tag,form,idea,bestFor,tradeoff,massing}` | (none) | Bridge sets it from `CONCEPT_PROFILES[shape==='u' ? 'u' : strategy]`. compact/balanced/frontage text copied verbatim from the live site (not re-authored); the `u` entry is new copy, since the old `courtyard`/`u-court` text described the OLD generator's failure-prone method |
| `model.topology` (`'courtyard'\|'u-court'` or undefined) | (none) | Set only when shape is `'u'` and not a fallback, mirroring old semantics |
| `model.massingParts` (array of boxes) | `buildingFootprint` (one polygon) | Bridge derives boxes from the ACTUAL rooms/corridors either side of the courtyard (not guessed from the polygon shape) -- see `massingPartsOf()`. `undefined` for rect, matching the old site (plain rect never set it) |
| `model.builtArea` | `quantities(model).footprint` | Bridge sets `builtArea` to the same number `quantities()` returns, so both old (`model.builtArea ?? building.w*building.h`) and new call sites agree |
| `model.courtyards[]` (`{x,y,w,h,name}`) | same shape + `roofPolicy`, `roofable` (Priority 7) | Passed through unchanged; old renderer only reads x/y/w/h, ignores the extra fields harmlessly |
| `quantities(model)` | `quantities(model)` | Re-exported unchanged from planner.mjs; the old UI's `q.footprint/q.rooms/q.circulation/q.reserve/q.doors/q.windows` field names are identical in v2.2.1 already |

## 4. What is intentionally NOT bridged

- `model.reserves` shape, `model.walls`, `model.openings`: unchanged field names between old and
  new; no bridging needed, confirmed by inspection.
- The old `'l'`-shape ("حرف L") was never offered by `generateAlternatives` on the live site
  (only rect strategies + the two courtyard topology names) -- the bridge matches that: L is not
  added to the alternatives list. It IS reachable via `generateModelLegacy(plot, rooms, { strategy
  })` if a caller passes a shape key v2.2.1 supports directly, but `generateAlternatives` itself
  only iterates the original five old strategy names.
- `placeOpening` / `removeOpening` (old planner.mjs manual door/window editing, used by the 2D
  editor): NOT re-implemented in this batch. v2.2.1 has no equivalent yet. Out of scope for this
  IR; flagged here so it is not silently forgotten before any real cutover.

## 5. What this batch does NOT do

- Does not modify `src/planner.mjs`, `src/estimates.mjs`, `src/migrations.mjs`,
  `src/PlannerOutputContract.mjs` -- confirmed byte-identical to the prior v2.2.1 delivery (see
  evidence/src-hashes.txt and the sha256 table in the manifest).
- Does not modify `app.mjs`, `plan-view.mjs`, `viewer3d.mjs`, or any other file the second
  developer owns.
- Does not deploy anything. This is source only; publishing to the live Worker/site is a separate,
  later step (see the project's staged rollout plan -- staging first, then the live swap).
- Does not implement `placeOpening`/`removeOpening` compatibility (see 4).

## 6. Verification

tests/compat-layer.test.mjs, 13 tests (C01-C13), asserting against the exact field-access patterns
copied from the extracted app.mjs/plan-view.mjs/viewer3d.mjs (not idealised assumptions about what
they "should" read). Full chain: typecheck/tests/build/mutation -- see the batch manifest.
