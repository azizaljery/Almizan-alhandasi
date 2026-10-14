// AUDIT probe — does footprint area close: rooms + corridors + reserves + wall-plan-area (+courtyards) ?
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { generateCandidate } from '../../dist/integration/pipeline.mjs';
import { buildDesignRequest } from '../../dist/multi-engine.mjs';
import { quantities } from '../../dist/claude/compat-layer.mjs';
const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
for (const shape of ['rect', 'l', 'u', 'pavilions']) {
  const request = await buildDesignRequest({ plot, rooms: normalizeRooms(defaultRooms()), selectedShape: shape });
  const g = (await generateCandidate(request, shape)).candidate.geometry, q = quantities(g);
  const w0 = g.walls[0];
  const wallPlan = g.walls.reduce((a, w) => a + Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * (w.t ?? w.thickness ?? 0), 0);
  console.log(shape.padEnd(10), 'wallKeys=', Object.keys(w0).join(','), '| footprint', q.footprint.toFixed(2), 'parts', (q.rooms + q.circulation + q.reserve).toFixed(2), 'wallPlan', wallPlan.toFixed(2), 'gap-after-walls', (q.footprint - (q.rooms + q.circulation + q.reserve) - wallPlan).toFixed(2));
}
