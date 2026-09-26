import test from 'node:test';
import assert from 'node:assert/strict';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { defaultRooms, normalizeRooms, validatePlot, quantities, wallPieces } from '../dist/planner.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { quantityRows } from '../dist/estimates.mjs';

const discovery = { likes: [], rejects: [], avoids: [], life: {} };
const plot = validatePlot({
  width: 35, length: 45, floors: 1, entry: 's',
  streets: { s: true, n: false, e: false, w: false },
  streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null,
});
const rooms = normalizeRooms(defaultRooms());

test('AZIZ-selected model is the exact source consumed by 2D, 3D geometry and BOQ', async () => {
  const result = await runMultiEngineDesign({ plot, rooms: structuredClone(rooms), idea: 'release consistency check', discovery });
  const model = result.selectedModel;
  assert.ok(model);
  assert.equal(model.integration.candidateId, result.decision.selectedCandidateId);

  const svg = buildPlanSVG(model);
  for (const room of model.rooms) assert.match(svg, new RegExp(`data-room-id="${room.id}"`));
  assert.equal((svg.match(/data-room-id=/g) || []).length, model.rooms.length);

  const pieces = wallPieces(model);
  assert.ok(pieces.length > 0);
  const wallIds = new Set(model.walls.map(w => w.id));
  for (const piece of pieces) assert.ok(wallIds.has(piece.wallId), `unknown wall piece ${piece.wallId}`);

  const q = quantities(model);
  const rows = quantityRows(model);
  const floor = rows.find(r => r.key === 'floor');
  const doors = rows.find(r => r.key === 'doors');
  assert.ok(floor && doors);
  assert.ok(Math.abs(floor.quantity - (q.rooms + q.circulation + q.reserve)) < 1e-9);
  assert.equal(doors.quantity, q.doors);

  if (model.shape === 'u' && model.courtyards?.length) {
    const courtArea = model.courtyards.reduce((s, c) => s + c.w * c.h, 0);
    assert.ok(courtArea > 0);
    assert.ok(q.footprint < model.building.w * model.building.h);
  }
});
