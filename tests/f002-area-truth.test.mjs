// T-05 / F-002 — area truth. Footprint area is the area of the REAL polygon (shoelace), never the bounding box.
// Reference values (plot 35x45, default program) were measured by the audit (audit/phase1/geometry-consistency.audit.mjs)
// and are pinned here so that any change to the generators or to quantities() is a visible, deliberate decision.
// This test observes only; it does not change the generator. If a value differs, STOP and record it — do not retune the numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, normalizeRooms, validatePlot, quantities } from '../dist/planner.mjs';
import { quantities as pinnedQuantities } from '../dist/claude/compat-layer.mjs';
import { quantityRows } from '../dist/estimates.mjs';
import { generateCandidate } from '../dist/integration/pipeline.mjs';
import { buildDesignRequest } from '../dist/multi-engine.mjs';

const PLOT = { width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 };
// F-002 reference: polygon area, bounding-box area (the "error marker" that must NOT be used), courtyard
const REF = {
  rect: { polygon: 331.51, bbox: 331.51, courtyard: 0 },
  l: { polygon: 367.19, bbox: 394.63, courtyard: 0 },
  u: { polygon: 413.10, bbox: 447.65, courtyard: 34.55 },
};
const shoelace = (pts) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + (p.x * q.y - q.x * p.y); }, 0)) / 2;
const bboxArea = (pts) => { const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.005, `${label}: ${actual} != ${expected} (±0.005)`);
const geometryFor = async (shape) => {
  const request = await buildDesignRequest({ plot: validatePlot(PLOT), rooms: normalizeRooms(defaultRooms()), selectedShape: shape });
  const { candidate } = await generateCandidate(request, shape);
  assert.equal(candidate.actualShape, shape, 'the shape actually generated must be the requested one');
  return candidate.geometry;
};

for (const shape of ['rect', 'l', 'u']) {
  test(`F-002 ${shape}: footprint equals the polygon area, with the pinned reference value`, async () => {
    const g = await geometryFor(shape), q = quantities(g);
    near(shoelace(g.buildingFootprint), REF[shape].polygon, 'polygon area');
    near(q.footprint, REF[shape].polygon, 'quantities().footprint');
    near(q.footprint, shoelace(g.buildingFootprint), 'footprint vs shoelace (exact relation, not only the reference)');
    near(q.courtyard, REF[shape].courtyard, 'courtyard');
  });

  test(`F-002 ${shape}: the bounding-box area is NOT what the footprint reports`, async () => {
    const g = await geometryFor(shape), q = quantities(g);
    near(bboxArea(g.buildingFootprint), REF[shape].bbox, 'bbox reference');
    if (shape === 'rect') near(q.footprint, bboxArea(g.buildingFootprint), 'rectangle: polygon == bbox');
    else assert.ok(bboxArea(g.buildingFootprint) - q.footprint > 20, 'footprint must stay well below the bbox for L/U');
  });

  test(`F-002 ${shape}: BOQ floor row is built from the parts (rooms+circulation+reserve), not from the bbox`, async () => {
    const g = await geometryFor(shape), q = quantities(g);
    const floor = quantityRows(g).find((r) => r.key === 'floor').quantity;
    near(floor, q.rooms + q.circulation + q.reserve, 'BOQ floor == sum of parts');
    assert.ok(Math.abs(floor - bboxArea(g.buildingFootprint)) > 1 || shape === 'rect', 'BOQ floor must not equal the bbox');
  });
}

test('F-002 U: the courtyard equals the bbox overstatement (bbox − polygon) — the relation that defines the error marker', async () => {
  const g = await geometryFor('u'), q = quantities(g);
  near(bboxArea(g.buildingFootprint) - q.footprint, q.courtyard, 'bbox − polygon == courtyard');
  near(q.courtyard, 34.55, 'courtyard reference');
});

test('F-002: the pinned legacy compat layer (dist/claude, read-only) agrees with the production quantities()', async () => {
  for (const shape of ['rect', 'l', 'u']) {
    const g = await geometryFor(shape);
    near(pinnedQuantities(g).footprint, quantities(g).footprint, `${shape} pinned vs production`);
  }
});
