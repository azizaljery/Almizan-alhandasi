// AUDIT probe — internal consistency of the geometry source for every shape that generates:
//   footprint(polygon) vs bounding-box area (F-002 class) ; footprint vs rooms+corridors+reserves(+courtyards) closure ;
//   BOQ floor row vs quantities ; presentation-board area (if exposed) vs footprint.
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { generateCandidate } from '../../dist/integration/pipeline.mjs';
import { buildDesignRequest } from '../../dist/multi-engine.mjs';
import { quantities } from '../../dist/claude/compat-layer.mjs';
import { quantityRows } from '../../dist/estimates.mjs';
const shoelace = (pts) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + (p.x * q.y - q.x * p.y); }, 0)) / 2;
const rows = [];
for (const [w, l] of [[35, 45], [30, 40], [40, 50]]) for (const shape of ['rect', 'l', 'u', 'pavilions', 'staggered']) {
  const plot = validatePlot({ width: w, length: l, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
  try {
    const request = await buildDesignRequest({ plot, rooms: normalizeRooms(defaultRooms()), selectedShape: shape });
    const { candidate } = await generateCandidate(request, shape);
    const g = candidate.geometry, q = quantities(g);
    const xs = g.buildingFootprint.map((p) => p.x), ys = g.buildingFootprint.map((p) => p.y);
    const bbox = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    const poly = shoelace(g.buildingFootprint);
    const parts = q.rooms + q.circulation + q.reserve;
    const boqFloor = quantityRows(g).find((r) => r.key === 'floor').quantity;
    rows.push({ plot: `${w}x${l}`, shape, actual: candidate.actualShape, footprint: +q.footprint.toFixed(2), poly: +poly.toFixed(2), bbox: +bbox.toFixed(2),
      bboxOverstates: +(bbox - poly).toFixed(2), partsSum: +parts.toFixed(2), courtyard: +q.courtyard.toFixed(2),
      closureGap: +(poly - parts - q.courtyard * 0).toFixed(3), boqFloor: +boqFloor.toFixed(2), boqFloorEqPartsSum: Math.abs(boqFloor - parts) < 1e-9 });
  } catch (e) { rows.push({ plot: `${w}x${l}`, shape, error: String(e.message).slice(0, 70) }); }
}
console.table(rows);
