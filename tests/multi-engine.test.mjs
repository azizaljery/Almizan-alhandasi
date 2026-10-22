import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, normalizeRooms, validatePlot, quantities, validateModel, placeOpening, removeOpening, openingPoint } from '../dist/planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { encodeProject, decodeProject } from '../dist/project.mjs';
import { requestLocalBrief } from '../dist/local-nlp.mjs';
import { generateStaggeredModel, staggeredTopology } from '../dist/staggered-planner.mjs';

const baseRooms = normalizeRooms(defaultRooms());
const compactTwoWingRooms = normalizeRooms([
  { name: 'غرفة نوم 1', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' },
  { name: 'غرفة نوم 2', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' },
  { name: 'صالة عائلية', type: 'living', area: 30, dimensions: { width: 6, length: 5 }, position: 'middle', side: 'any' },
  { name: 'مطبخ', type: 'kitchen', area: 12, dimensions: { width: 3, length: 4 }, position: 'middle', side: 'any' },
]);
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
  assert.ok(out.models.length >= 3 && out.models.length <= 6);
  assert.ok(out.models.some(m => m.shape === 'rect'));
  assert.ok(out.models.some(m => m.shape === 'u'));
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

test('integrated generation explains the unsupported multi-floor boundary in Arabic', async () => {
  const plot = plotFor('s', { floors: 2 });
  await assert.rejects(
    runMultiEngineDesign({ plot, rooms: structuredClone(baseRooms), discovery }),
    error => {
      assert.match(error.message, /محرك التصميم الحالي يرسم الدور الأرضي فقط/);
      assert.match(error.message, /اختر «دور واحد» ثم أعد التوليد/);
      assert.doesNotMatch(error.message, /ADDITIONAL_FLOORS_NOT_IMPLEMENTED/);
      return true;
    },
  );
});

test('integrated generation honors current setback controls', async () => {
  const defaultOut = await runMultiEngineDesign({ plot: plotFor('s'), rooms: structuredClone(baseRooms), discovery });
  const wideOut = await runMultiEngineDesign({ plot: plotFor('s', { streetSetback: 6, neighborSetback: 3 }), rooms: structuredClone(baseRooms), discovery });
  assert.notEqual(defaultOut.selectedModel.integration.geometryHash.value, wideOut.selectedModel.integration.geometryHash.value);
  assert.notEqual(wideOut.selectedModel.building.y, defaultOut.selectedModel.building.y);
  assert.equal(wideOut.selectedModel.plot.streetSetback, 6);
  assert.equal(wideOut.selectedModel.plot.neighborSetback, 3);
});

test('explicit room dimensions and an office survive parsing, solver selection and measured plan geometry', async () => {
  const brief = await requestLocalBrief({ prompt: 'غرفتين نوم ٤×٤ والثالثة مكتب ٣×٣، صالة ٦×٥ ومطبخ ٣×٤', previous: { rooms: [] } });
  const rooms = normalizeRooms(brief.rooms);
  assert.equal(rooms.length, 5); assert.equal(rooms.filter(r => r.type === 'bedroom').length, 2); assert.equal(rooms.filter(r => r.type === 'office').length, 1);
  const out = await runMultiEngineDesign({ plot: plotFor('s'), rooms, discovery });
  assert.equal(out.decision.status, 'SELECTED_PRELIMINARY');
  for (const model of out.models) {
    assert.deepEqual(validateModel(model), []);
    assert.equal(model.rooms.length, 5);
    for (const requested of rooms.filter(r => r.dimensions)) {
      const actual = model.rooms.find(r => r.id === requested.id);
      assert.ok(actual, `${requested.name} is present`);
      assert.ok(Math.abs(actual.w-requested.dimensions.width)<1e-5 && Math.abs(actual.h-requested.dimensions.length)<1e-5 || Math.abs(actual.w-requested.dimensions.length)<1e-5 && Math.abs(actual.h-requested.dimensions.width)<1e-5,
        `${requested.name}: requested ${requested.dimensions.width}×${requested.dimensions.length}, got ${actual.w}×${actual.h}`);
    }
  }
  assert.ok(out.reviews.every(review => review.checks.find(c => c.id === 'hard-constraints')?.status === 'PASS'));
  const office = out.selectedModel.rooms.find(r => r.type === 'office'); assert.equal(office.w, 3); assert.equal(office.h, 3);
  const text = encodeProject({ plot: plotFor('s'), rooms, palette: 'resort', rates: {}, costReserve: 0, vat: 0, idea: '', discovery, model: out.selectedModel, alternatives: out.models, history: [] });
  const restored = decodeProject(text); assert.deepEqual(normalizeRooms(restored.rooms), rooms); assert.deepEqual(restored.model, out.selectedModel);
});

test('staggered composition keeps exact office and room dimensions through reviews, SVG, quantities, and project restore', async () => {
  const brief = await requestLocalBrief({ prompt: 'غرفتين نوم ٤×٤ والثالثة مكتب ٣×٣، صالة ٦×٥ ومطبخ ٣×٤', previous: { rooms: [] } });
  const rooms = normalizeRooms(brief.rooms), plot = plotFor('s');
  const model = generateStaggeredModel(plot, rooms);
  assert.deepEqual(validateModel(model), []);
  assert.deepEqual(staggeredTopology(model).errors, []);
  assert.equal(model.shape, 'staggered');
  assert.equal(model.massingParts.filter(part => part.component === 'wing').length, 2);
  assert.equal(model.massingParts.filter(part => part.component === 'link').length, 1);
  assert.equal(model.corridors.filter(corridor => corridor.id.startsWith('staggered-link-')).length, 1);
  assert.equal(model.links.filter(([a, b]) => a.startsWith('staggered-link-') || b.startsWith('staggered-link-')).length, 2);
  const polygonArea = Math.abs(model.buildingFootprint.reduce((sum, point, index, polygon) => {
    const next = polygon[(index + 1) % polygon.length]; return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  assert.ok(Math.abs(polygonArea - model.massingParts.reduce((sum, part) => sum + part.w * part.h, 0)) < 1e-6);
  for (const requested of rooms.filter(room => room.dimensions)) {
    const actual = model.rooms.find(room => room.id === requested.id);
    assert.ok(Math.abs(actual.w - requested.dimensions.width) < 1e-5 && Math.abs(actual.h - requested.dimensions.length) < 1e-5
      || Math.abs(actual.w - requested.dimensions.length) < 1e-5 && Math.abs(actual.h - requested.dimensions.width) < 1e-5);
  }
  const out = await runMultiEngineDesign({ plot, rooms, idea: 'جناحين متدرجين مرتبطين', discovery });
  assert.deepEqual(out.models.map(item => item.shape), ['staggered']);
  assert.equal(out.decision.status, 'SELECTED_PRELIMINARY');
  assert.ok(out.reviews.every(review => review.checks.find(check => check.id === 'native-validation')?.status === 'PASS'));
  assert.match(buildPlanSVG(out.selectedModel, { showFurniture: true }), /<svg/);
  const text = encodeProject({ plot, rooms, palette: 'resort', rates: {}, costReserve: 0, vat: 0, idea: 'جناحين متدرجين مرتبطين', discovery, model: out.selectedModel, alternatives: out.models, history: [] });
  const restored = decodeProject(text);
  assert.deepEqual(restored.model, out.selectedModel);
  assert.deepEqual(restored.alternatives, out.models);
});

test('staggered composition remains valid for each entrance orientation', () => {
  for (const entry of ['s', 'n', 'e', 'w']) {
    const model = generateStaggeredModel(plotFor(entry), structuredClone(compactTwoWingRooms));
    assert.deepEqual(validateModel(model), [], entry);
    assert.deepEqual(staggeredTopology(model).errors, [], entry);
    assert.equal(model.shape, 'staggered');
  }
});

test('failed exact-fit generation does not mutate the confirmed room dimensions', () => {
  const rooms = normalizeRooms([{ name: 'غرفة نوم', type: 'bedroom', area: 100, dimensions: { width: 10, length: 10 }, position: 'back', side: 'any' }, { name: 'صالة', type: 'living', area: 25, dimensions: { width: 5, length: 5 }, position: 'middle', side: 'any' }]);
  const before = structuredClone(rooms);
  const tightPlot = validatePlot({ width: 8, length: 8, floors: 1, streets: { s: true }, entry: 's', streetSetback: 0, neighborSetback: 0, coverage: .9 });
  assert.throws(() => generateStaggeredModel(tightPlot, rooms));
  assert.deepEqual(rooms, before);
});

test('staggered shape fails closed when the current program would produce three wings', () => {
  assert.throws(() => generateStaggeredModel(plotFor('s'), structuredClone(baseRooms)), /ينتج 3 أجنحة.*يدعم جناحين فقط.*لم ندمج الأجنحة أو نحذف غرفًا/);
});

test('integrated project save restores exact explored geometry instead of regenerating old strategies', async () => {
  const plot = plotFor('s'), rooms = structuredClone(baseRooms);
  const out = await runMultiEngineDesign({ plot, rooms, discovery });
  const text = encodeProject({ plot, rooms, palette: 'resort', rates: {}, costReserve: 0, vat: 0, idea: '', discovery, model: out.selectedModel, alternatives: out.models, history: [] });
  const restored = decodeProject(text);
  assert.deepEqual(restored.model, out.selectedModel);
  assert.deepEqual(restored.alternatives, out.models);
  assert.deepEqual(restored.alternatives.map(m => m.shape), out.models.map(m => m.shape));
});

test('integrated U model remains editable with existing opening tools', async () => {
  const out = await runMultiEngineDesign({ plot: plotFor('s'), rooms: structuredClone(baseRooms), discovery });
  const model = out.models.find(m => m.shape === 'u');
  const wall = model.walls.find(w => w.type === 'ext' && !model.openings.some(o => o.wallId === w.id));
  assert.ok(wall);
  const point = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  const edited = placeOpening(model, { type: 'window', point });
  assert.deepEqual(validateModel(edited), []);
  assert.equal(edited.openings.length, model.openings.length + 1);
  const created = edited.openings.find(o => !model.openings.some(x => x.id === o.id));
  const restored = removeOpening(edited, openingPoint(edited, created));
  assert.deepEqual(validateModel(restored), []);
  assert.equal(restored.openings.length, model.openings.length);
});

test('integrated path fails clearly when the explicit built-area cap makes every explored layout infeasible', async () => {
  const plot = plotFor('s', { maxBuiltArea: 250 });
  await assert.rejects(() => runMultiEngineDesign({ plot, rooms: structuredClone(baseRooms), discovery }), /MAX_BUILT_AREA_EXCEEDED|No candidate|لم يتمكن/);
});
