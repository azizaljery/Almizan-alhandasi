# Release v2.1 — Geometry Overhaul Complete (Priorities 1–4)

**Date:** 2026-09-23  
**Status:** ✅ READY FOR INTEGRATION  
**Test Coverage:** 24/24 passing (12 original + 5 shapes + 7 geometry)

---

## What Changed from Baseline (17/17)

### Priority 1 — Polygon-First Geometry (COMPLETE)
- `buildingFootprint`: True geometric outline as Polygon (4 pts for rect, 6 for L, 8 for U)
- `boundingBox`: Derived from polygon (no independent construction — can never drift)
- `model.building`: Kept for backward compat; equals boundingBox now
- **Validation rewritten:** All critical checks (room/corridor containment, exterior door test, footprint bounds) now use polygon, not bounding box
  - `rectInPolygon()` catches rooms/corridors that would cross a notch (L's interior corner, U's courtyard cut)
  - `pointInPolygon()` tests exterior door connectivity against the real shape
  - `polygonBoundingBox()` is the only way to derive a bounding box (single source of truth)
- **Quantities fixed:** `footprint` now equals `polygonArea(buildingFootprint)`, not `bbox.w * bbox.h`
  - For L: real built area is ~53 m² smaller than the bbox (the notched corner)
  - For U: real built area is ~36 m² smaller than the bbox (the courtyard cut)
  - rect: no change

**Impact:** Visualization/UI code can now accurately calculate built area, and geometric notches are properly represented instead of appearing as full bounding boxes.

### Priority 2 — Courtyards/Voids Formalized (COMPLETE)
- `model.courtyards: Array<Courtyard>` — each has `name`, `x`, `y`, `w`, `h`, `roofable: false`
- **Validation:** Explicit checks prevent any room or corridor from overlapping any courtyard
- **Warnings:** Clear user notice when U-shape exists: "الفناء الأوسط مساحة مفتوحة غير مسقوفة..."
- `roofable` flag signals explicitly that courtyards are never covered (future-proofing for roof models)

**Impact:** Courtyards are now first-class entities with guaranteed no-overlap contracts, ready for visualization as distinct from interior spaces.

### Priority 3 — PlannerOutputContract (COMPLETE)
- `PlannerOutputContract.mjs`: Full JSDoc typedef documentation of every field in ValidatedDesignGeometry
- Covers coordinate system, invariants, guarantees, and v1→v2 migration guide
- No runtime enforcement yet (that's Priority 5: Typecheck), but schema is now formally specified
- Scope: documented for UI/integration layers; ready to drive Contract validation in future

**Impact:** Contract is explicit and documented; developers can build against it confidently.

### Priority 4 — Shape Engine Validation Extensions (COMPLETE)
New test suite `shape-geometry.test.mjs` (7 tests):
- Rect: 4-point axis-aligned rectangle
- L: 6-point true L with interior notch, area < bbox
- U: 8-point true U with front courtyard cut, area = bbox - courtyard
- Courtyard isolation: no rooms/corridors overlap any courtyard
- Roofable flag: always false for courtyards, across all shapes/entries
- Polygon area: always positive, consistent winding across all entries

**Impact:** Shape geometry is guaranteed correct; visualization can rely on buildingFootprint for accurate rendering.

---

## Test Results

| Test Suite | Count | Status |
|---|---|---|
| Original (v1 compat) | 12 | ✅ 12/12 |
| Shape Variations | 5 | ✅ 5/5 |
| Geometry Properties | 7 | ✅ 7/7 |
| **Total** | **24** | **✅ 24/24** |

Run: `node --test tests/planner.test.mjs tests/shapes.test.mjs tests/shape-geometry.test.mjs`

---

## Files Delivered

| File | Purpose |
|---|---|
| `planner-v2.1.mjs` | Main engine (59 KB, +25% from baseline, new polygon functions) |
| `PlannerOutputContract.mjs` | Contract spec (12 KB, documentation-only) |
| `estimates.mjs` | Quantities helper (1.8 KB, unchanged) |
| `tests/planner.test.mjs` | v1 compat tests (8.3 KB) |
| `tests/shapes.test.mjs` | Shape tests (3.2 KB) |
| `tests/shape-geometry.test.mjs` | Geometry tests (3.8 KB) |
| `planner-v2.1.mjs.sha256` | Integrity checksum |

---

## What's Next (Priorities 5+)

- **Priority 5:** Typecheck — Fix remaining 252 issues (8 real + 244 implicit-any) using Contract
- **Priority 6:** Package Build — Minify, bundle, dist/ integration
- **Priority 7:** Regression Tests — Extended coverage for edge cases (narrow plots, extreme aspect ratios)
- **Priority 8:** Integration Requirements — Update IR-1 to IR-4 with final Contract changes
- **Priority 9+:** Feature backlog (sun orientation, local NLP, image generation, equations)

---

## Migration Guide (v2.0 → v2.1)

**For visualization/UI code:**
```javascript
// OLD: Model building via bounding box
if (overlap(model.building, someRect)) { ... }

// NEW: Model building via polygon (more accurate)
import { rectInPolygon } from './planner.mjs';
if (rectInPolygon(someRect, model.buildingFootprint)) { ... }

// OLD: Footprint area (with manual courtyard subtraction)
const area = model.building.w * model.building.h - sum(courtyards, c => c.w * c.h);

// NEW: Footprint area (direct, includes courtyard cut)
import { quantities } from './planner.mjs';
const area = quantities(model).footprint;
```

**For contract validation:**
- All fields are now documented in `PlannerOutputContract.mjs`
- `buildingFootprint` is the source of truth for geometry (read from here, never build independently)
- `boundingBox` is always derived from `buildingFootprint` (never stale)
- `courtyards` are guaranteed non-overlapping with rooms/corridors (validateModel ensures this)

**For tests:**
- Add new shape-geometry tests to your regression suite
- Test L and U at varied aspect ratios and entries to catch notch/courtyard edge cases

---

## Verification Checklist

- [x] All 24 tests pass
- [x] Polygon areas are correct (L & U are smaller than bbox)
- [x] Courtyard overlap detection works (tested with fake rooms in courtyard)
- [x] Polygon winding is stable across all entries
- [x] Backward compat: model.building still exists (equals boundingBox)
- [x] No rooms/corridors were dropped or shrunk during refactoring
- [x] Contract is documented and ready for Typecheck phase

---

## Known Limitations (Not In Scope)

- Typecheck still reports 252 errors (implicit-any) — Priority 5 will address via Contract-driven types
- Roof modeling (courtyard as non-roofable) is partially defined; actual roof code is Priority 9+
- No asset/image generation yet (Priority 9+)
- No sun orientation calculations (Priority 9+)
- Narrow plot fallback (e.g. 20×30 with 8-person program) falls back to rect as designed

---

## Checksum

SHA256 of `planner-v2.1.mjs`:  
```
(see planner-v2.1.mjs.sha256)
```

Verify integrity: `sha256sum -c planner-v2.1.mjs.sha256`

---

**Next: Begin Priority 5 (Typecheck) using PlannerOutputContract.mjs as the schema source.**
