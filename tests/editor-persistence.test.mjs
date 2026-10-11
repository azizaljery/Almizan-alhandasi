import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, generateTopologyModel, defaultRooms, normalizeRooms, validatePlot, validateModel, openingPoint, removeOpening, placeOpening, quantities } from '../dist/planner.mjs';
import { generatePavilionModel } from '../dist/pavilion-planner.mjs';
import { generateStaggeredModel } from '../dist/staggered-planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { encodeProject, decodeProject, MAX_PROJECT_BYTES } from '../dist/project.mjs';
import { geoJSONFromVertices, validateLandSurvey } from '../dist/land-survey.mjs';
const plot = validatePlot({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } });
const rooms = defaultRooms();
const base = generateModel(plot, rooms);
const state = model => ({ plot: model.plot, rooms: model.program, model, palette: 'modern', rates: { windows: 150 }, costReserve: 5, vat: 15, idea: '' });
const edit = model => {
  const window = model.openings.find(o => o.type === 'window');
  if (window) return removeOpening(model, openingPoint(model, window));
  // Topology generators initially have doors only; add one valid facade window.
  for (const wall of model.walls.filter(w => w.type === 'ext')) {
    try { return placeOpening(model, { type: 'window', point: { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 } }); } catch {}
  }
  throw Error('Fixture needs an editable exterior wall.');
};

test('22 to 21 openings stays 21 after save/import, including reduced window quantities', () => {
  assert.equal(base.openings.length, 22);
  const model = edit(base);
  assert.equal(model.openings.length, 21);
  assert.deepEqual(validateModel(model), []);
  const text = encodeProject(state(model));
  const restored = decodeProject(text).model;
  assert.equal(restored.openings.length, 21);
  assert.equal(quantities(restored).windows, quantities(base).windows - 1);
  assert.deepEqual(restored, model);
  assert.equal(JSON.parse(text).design.geometryVersion, 1);
});
for (const strategy of ['compact', 'balanced', 'frontage', 'claude-rect']) {
  test(`edited ${strategy} model is restored from actual geometry`, () => {
    const model = edit(generateModel(plot, rooms, { strategy }));
    assert.deepEqual(decodeProject(encodeProject(state(model))).model, model);
  });
}
for (const topology of ['courtyard', 'u-court']) {
  test(`edited ${topology} topology and built-area remain exact`, () => {
    const model = edit(generateTopologyModel({ ...plot, width: 35, length: 45 }, rooms, { topology }));
    assert.deepEqual(validateModel(model), []);
    assert.deepEqual(decodeProject(encodeProject(state(model))).model, model);
  });
}
test('pavilion and staggered geometry survive without requiring integration wrapper', () => {
  const largePlot = validatePlot({ ...plot, width: 35, length: 45 });
  const compact = normalizeRooms([
    { name: 'غرفة نوم 1', type: 'bedroom', area: 16, position: 'back', side: 'any' },
    { name: 'غرفة نوم 2', type: 'bedroom', area: 16, position: 'back', side: 'any' },
    { name: 'صالة', type: 'living', area: 30, position: 'middle', side: 'any' },
    { name: 'مطبخ', type: 'kitchen', area: 12, position: 'middle', side: 'any' },
  ]);
  for (const model of [edit(generatePavilionModel(largePlot, normalizeRooms(rooms))), edit(generateStaggeredModel(largePlot, compact))]) {
    assert.deepEqual(validateModel(model), []);
    assert.deepEqual(decodeProject(encodeProject(state(model))).model, JSON.parse(JSON.stringify(model)));
  }
});
test('selected model, alternatives and history retain their independent edits', () => {
  const model = edit(base), historyModel = edit(edit(base));
  const restored = decodeProject(encodeProject({ ...state(model), alternatives: [base, model], history: [{ model: historyModel, palette: 'classic' }] }));
  assert.deepEqual(restored.model, model);
  assert.deepEqual(restored.alternatives, [base, model]);
  assert.deepEqual(restored.history[0].model, historyModel);
});
test('legacy recipe-only files still regenerate original models', () => {
  const raw = JSON.parse(encodeProject(state(base)));
  delete raw.design.embedded;
  delete raw.design.geometryVersion;
  assert.deepEqual(decodeProject(JSON.stringify(raw)).model, base);
});
test('existing integrated identity and review hashes are preserved, never recomputed as approval', async () => {
  const result = await runMultiEngineDesign({ plot, rooms: normalizeRooms(rooms), selectedShape: 'rect', idea: '', discovery: {} });
  const model = edit(result.selectedModel);
  const identity = structuredClone(model.integration);
  const raw = JSON.parse(encodeProject(state(model)));
  assert.deepEqual(decodeProject(JSON.stringify(raw)).model.integration, identity);
  delete raw.design.geometryVersion; // previously supported integrated embedding
  assert.deepEqual(decodeProject(JSON.stringify(raw)).model, model);
});
test('actual geometry cannot silently fall back or disagree with its recipe', () => {
  const original = JSON.parse(encodeProject(state(edit(base))));
  for (const mutate of [
    p => { p.design.geometryVersion = 99; },
    p => { p.design.geometryVersion = 1; delete p.design.embedded; },
    p => { p.design.embedded.rooms[0].w = -1; },
    p => { p.design.embedded.strategy = 'frontage'; },
    p => { p.design.plot.width += 1; },
    p => { p.design.rooms[0].area += 1; },
    p => { p.design.embedded.version = 99; },
  ]) {
    const raw = structuredClone(original);
    assert.throws(() => { mutate(raw); decodeProject(JSON.stringify(raw)); });
  }
});
test('encode rejects invalid geometry and oversized output instead of losing it', () => {
  const invalid = structuredClone(base); invalid.rooms[0].w = -1;
  assert.throws(() => encodeProject(state(invalid)));
  const huge = structuredClone(base); huge.warnings = ['x'.repeat(MAX_PROJECT_BYTES)];
  assert.throws(() => encodeProject(state(huge)), /ميغابايت/);
  assert.throws(() => decodeProject('x'.repeat(MAX_PROJECT_BYTES + 1)), /ميغابايت/);
});
test('actual geometry preserves survey binding and rejects a mismatched model survey', () => {
  const survey = validateLandSurvey({ version: 1, geometry: geoJSONFromVertices([[46.6753,24.7136],[46.6755,24.7136],[46.6755,24.7139],[46.6753,24.7139]]), references: [20,30,20,30], engineLink: 'survey-rectangle', binding: { width: 20, length: 30, source: 'confirmed-edge-references' }, mapView: { center: [24.7136,46.6753], zoom: 16, provider: 'local' } });
  const model = edit(base);
  const text = encodeProject({ ...state(model), landSurvey: survey, modelLandSurvey: survey });
  const restored = decodeProject(text);
  assert.deepEqual(restored.model, model);
  assert.deepEqual(restored.modelLandSurvey, survey);
  const raw = JSON.parse(text); raw.modelLandSurvey.binding.width = 21;
  assert.throws(() => decodeProject(JSON.stringify(raw)));
});
