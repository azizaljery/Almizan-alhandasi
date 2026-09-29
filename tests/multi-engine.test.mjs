import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, normalizeRooms, validatePlot, quantities, validateModel, placeOpening, removeOpening, openingPoint } from '../dist/planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { encodeProject, decodeProject } from '../dist/project.mjs';

const baseRooms = normalizeRooms(defaultRooms());
const discovery = { likes: [], rejects: [], avoids: [], life: {} };
const plotFor = (entry = 's', extra = {}) => validatePlot({
  width: 35, length: 45, floors: 1, entry,
  streets: { s: entry === 's', n: entry === 'n', e: entry === 'e', w: entry === 'w' },
  streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null,
  ...extra,
});

for (const entry of ['s','n','e','w']) test(`integrated Claude -> Gemini -> AZIZ works for ${entry}`, async () => {
  const plot = plotFor(entry), rooms = structuredClone(baseRooms), before = JSON.stringify({ plot, rooms });
  const out = await runMultiEngineDesign({ plot, rooms, idea: 'اختبار تكامل فعلي', discovery });
  assert.equal(JSON.stringify({ plot, rooms }), before);
  assert.equal(out.decision.status, 'SELECTED_PRELIMINARY');
  assert.equal(out.aziz.status, 'selected');
  assert.equal(out.models.length, 3);
  assert.deepEqual(out.models.map(m => m.shape), ['rect','l','u']);
  assert.ok(out.models.includes(out.selectedModel));
  for (const model of out.models) {
    assert.deepEqual(validateModel(model), []);
    assert.equal(model.engineVersion, 'mizan-p1-integrated');
    assert.equal(model.integration.reviewOverall, 'PRELIMINARY_INCOMPLETE');
    assert.equal(model.rooms.length, rooms.length);
    assert.ok(Number.isFinite(quantities(model).footprint));
    const svg = buildPlanSVG(model, { showFurniture: true });
    assert.match(svg, /<svg/); assert.ok(!/NaN|undefined/.test(svg));
  }
  const u = out.models.find(m => m.shape === 'u');
  assert.equal(u.courtyards.length, 1); assert.ok(u.massingParts?.length >= 3);
});

test('integrated generation honors current setback controls', async () => {
  const defaultOut = await runMultiEngineDesign({ plot: plotFor('s'), rooms: structuredClone(baseRooms), discovery });
  const wideOut = await runMultiEngineDesign({ plot: plotFor('s', { streetSetback: 6, neighborSetback: 3 }), rooms: structuredClone(baseRooms), discovery });
  assert.notEqual(defaultOut.selectedModel.integration.geometryHash.value, wideOut.selectedModel.integration.geometryHash.value);
  assert.notEqual(wideOut.selectedModel.building.y, defaultOut.selectedModel.building.y);
  assert.equal(wideOut.selectedModel.plot.streetSetback, 6);
  assert.equal(wideOut.selectedModel.plot.neighborSetback, 3);
});

test('integrated project save restores exact RECT/L/U geometry instead of regenerating old strategies', async () => {
  const plot = plotFor('s'), rooms = structuredClone(baseRooms);
  const out = await runMultiEngineDesign({ plot, rooms, discovery });
  const text = encodeProject({ plot, rooms, palette: 'resort', rates: {}, costReserve: 0, vat: 0, idea: '', discovery, model: out.selectedModel, alternatives: out.models, history: [] });
  const restored = decodeProject(text);
  assert.deepEqual(restored.model, out.selectedModel);
  assert.deepEqual(restored.alternatives, out.models);
  assert.deepEqual(restored.alternatives.map(m => m.shape), ['rect','l','u']);
});

test('integrated U model remains editable with existing opening tools and invalidates stale canonical identity', async () => {
  const out = await runMultiEngineDesign({ plot: plotFor('s'), rooms: structuredClone(baseRooms), discovery });
  const model = out.models.find(m => m.shape === 'u');
  const originalCandidateId = model.integration.candidateId;
  const originalGeometryHash = structuredClone(model.integration.geometryHash);
  const originalReviewId = model.integration.reviewId;
  const wall = model.walls.find(w => w.type === 'ext' && !model.openings.some(o => o.wallId === w.id));
  assert.ok(wall);
  const point = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  const edited = placeOpening(model, { type: 'window', point });
  assert.deepEqual(validateModel(edited), []);
  assert.equal(edited.openings.length, model.openings.length + 1);
  assert.equal(edited.integration.candidateId, null);
  assert.equal(edited.integration.geometryHash, null);
  assert.equal(edited.integration.reviewId, null);
  assert.equal(edited.integration.reviewOverall, null);
  assert.equal(edited.integration.reviewCoverage, null);
  assert.equal(edited.integration.lineageStatus, 'EDITED_UNBOUND');
  assert.equal(edited.integration.lineageReason, 'OPENING_ADDED');
  assert.equal(edited.integration.parentCandidateId, originalCandidateId);
  assert.deepEqual(edited.integration.parentGeometryHash, originalGeometryHash);
  assert.equal(edited.integration.parentReviewId, originalReviewId);

  const created = edited.openings.find(o => !model.openings.some(x => x.id === o.id));
  const restored = removeOpening(edited, openingPoint(edited, created));
  assert.deepEqual(validateModel(restored), []);
  assert.equal(restored.openings.length, model.openings.length);
  assert.equal(restored.integration.candidateId, null);
  assert.equal(restored.integration.geometryHash, null);
  assert.equal(restored.integration.lineageStatus, 'EDITED_UNBOUND');
  assert.equal(restored.integration.lineageReason, 'OPENING_REMOVED');
  assert.equal(restored.integration.parentCandidateId, originalCandidateId);
  assert.deepEqual(restored.integration.parentGeometryHash, originalGeometryHash);
});

test('integrated path fails clearly when the explicit built-area cap makes all three shapes infeasible', async () => {
  const plot = plotFor('s', { maxBuiltArea: 250 });
  await assert.rejects(() => runMultiEngineDesign({ plot, rooms: structuredClone(baseRooms), discovery }), /MAX_BUILT_AREA_EXCEEDED|No candidate|لم يتمكن/);
});
