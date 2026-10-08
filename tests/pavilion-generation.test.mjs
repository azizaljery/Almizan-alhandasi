import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defaultRooms, normalizeRooms, validatePlot, validateModel, quantities, placeOpening, openingPoint, removeOpening } from '../dist/planner.mjs';
import { runMultiEngineDesign, buildDesignRequest } from '../dist/multi-engine.mjs';
import { pavilionTopology } from '../dist/pavilion-planner.mjs';
import { auditMassing } from '../dist/integration/control/reference/orthogonal-audit.mjs';
import { generateCandidate, decideReviewed } from '../dist/integration/pipeline.mjs';
import { geometryHash, candidateId } from '../dist/integration/control/reference/identity.mjs';
import { reviewCandidate } from '../dist/integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
import { encodeProject, decodeProject } from '../dist/project.mjs';
import { circulationNetwork } from '../dist/circulation.mjs';
import { validateSuggestion } from '../dist/assistant.mjs';

const discovery = { likes: ['classic_living'], rejects: [], avoids: [], life: {} };
const rooms = normalizeRooms(defaultRooms());
const exactStaggeredRooms = normalizeRooms([
  { name: 'غرفة نوم 1', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' },
  { name: 'غرفة نوم 2', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' },
  { name: 'صالة عائلية', type: 'living', area: 30, dimensions: { width: 6, length: 5 }, position: 'middle', side: 'any' },
  { name: 'مطبخ', type: 'kitchen', area: 12, dimensions: { width: 3, length: 4 }, position: 'middle', side: 'any' },
]);
const plotFor = (entry = 's', width = 35, length = 45, extra = {}) => validatePlot({ width, length, entry, floors: 1, streets: { [entry]: true }, ...extra });

for (const entry of ['s', 'n', 'e', 'w']) test(`chosen pavilions preserve every requested room and physical access for ${entry}`, async () => {
  const plot = plotFor(entry), before = JSON.stringify({ plot, rooms, discovery });
  const result = await runMultiEngineDesign({ plot, rooms, discovery, idea: 'أبي أجنحة مرتبطة برواق' });
  const model = result.selectedModel, topology = pavilionTopology(model);
  assert.equal(model.shape, 'pavilions');
  assert.deepEqual(result.models.map(m => m.shape), ['pavilions']);
  assert.equal(topology.pavilionCount, 3);
  assert.ok(topology.exteriorGapDepthsM.every(d => d >= 1.5));
  assert.deepEqual(validateModel(model), []);
  for (const r of rooms) {
    const actual = model.rooms.find(p => p.id === r.id);
    assert.ok(actual); assert.equal(actual.name, r.name); assert.equal(actual.position, r.position);
    assert.equal(actual.side, r.side); assert.equal(actual.area, r.area);
    assert.ok(Math.abs(actual.w * actual.h - r.area) < 1e-5);
    assert.ok(circulationNetwork(model).toRoom(r.id));
  }
  assert.equal(model.massingParts.length, 5);
  assert.equal(auditMassing(model.buildingFootprint, model.massingParts).pass, true);
  assert.ok(quantities(model).footprint < model.building.w * model.building.h - 20);
  assert.equal(result.reviews[0].checks.filter(c => c.status === 'FAIL').length, 0);
  assert.equal(JSON.stringify({ plot, rooms, discovery }), before);
});
test('the exact 20x30 default journey now generates real pavilions rather than an unsupported message', async () => {
  const result = await runMultiEngineDesign({ plot: plotFor('s', 20, 30), rooms, discovery, idea: 'أبي أجنحة مرتبطة برواق' });
  assert.equal(result.selectedModel.shape, 'pavilions');
  assert.equal(pavilionTopology(result.selectedModel).pavilionCount, 3);
  assert.deepEqual(validateModel(result.selectedModel), []);
});
test('pavilion provenance identifies the actual composing source and contracts agree', async () => {
  const request = await buildDesignRequest({ plot: plotFor(), rooms, discovery });
  const { candidate } = await generateCandidate(request, 'pavilions');
  assert.equal(candidate.producer.engineId, '@mizan/pavilion-composer');
  assert.equal(candidate.producer.sourceSha256, createHash('sha256').update(readFileSync('dist/pavilion-planner.mjs')).digest('hex'));
  assert.deepEqual(readFileSync('dist/integration/control/contracts/mizan-envelope-v1.schema.json'), readFileSync('dist/integration/gemini/contracts/mizan-envelope-v1.schema.json'));
});
test('staggered geometry carries the exact composer source identity into the bound candidate', async () => {
  const request = await buildDesignRequest({ plot: plotFor(), rooms: exactStaggeredRooms, idea: 'أبي جناحين متدرجين مرتبطين' });
  const { candidate } = await generateCandidate(request, 'staggered');
  assert.equal(candidate.producer.engineId, '@mizan/staggered-composer');
  assert.equal(candidate.producer.sourceSha256, createHash('sha256').update(readFileSync('dist/staggered-planner.mjs')).digest('hex'));
  assert.equal(candidate.actualShape, 'staggered');
  assert.equal(candidate.geometry.corridors.some(c => c.id.startsWith('staggered-link-')), true);
  const schema = JSON.parse(readFileSync('dist/integration/control/contracts/mizan-envelope-v1.schema.json', 'utf8'));
  assert.ok(schema.$defs.geometry.properties.shape.enum.includes('staggered'));
  assert.ok(schema.$defs.candidate.properties.actualShape.enum.includes('staggered'));
});

test('simulated AI response normalization preserves separate exact rooms and binds exactly two wings without live AI', async () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/simulated-ai-brief.json', 'utf8'));
  assert.equal(fixture.fixtureKind, 'SIMULATED_TEST_FIXTURE');
  assert.equal(fixture.liveAI, false);
  const brief = validateSuggestion(fixture);
  assert.equal(brief.rooms.filter(room => room.type === 'bedroom').length, 2);
  assert.deepEqual(brief.rooms.filter(room => room.type === 'bedroom').map(room => room.dimensions), [{ width: 4, length: 4 }, { width: 4, length: 4 }]);
  const request = await buildDesignRequest({ plot: plotFor(), rooms: normalizeRooms(brief.rooms), idea: 'جناحين متدرجين مرتبطين' });
  assert.deepEqual(request.hardConstraints.find(c => c.kind === 'wing_count_exact').value, { count: 2 });
  const { candidate } = await generateCandidate(request, 'staggered');
  assert.equal(candidate.presentation.massingParts.filter(part => part.component === 'wing').length, 2);
  for (const requested of brief.rooms.filter(room => room.dimensions)) {
    const actual = candidate.geometry.rooms.find(room => room.name === requested.name);
    assert.ok(actual);
    assert.ok(Math.abs(actual.w - requested.dimensions.width) < 1e-5 && Math.abs(actual.h - requested.dimensions.length) < 1e-5
      || Math.abs(actual.w - requested.dimensions.length) < 1e-5 && Math.abs(actual.h - requested.dimensions.width) < 1e-5);
  }
});
test('a rebound rectangle labelled pavilions fails geometry review and the decision gate', async () => {
  const request = await buildDesignRequest({ plot: plotFor(), rooms, discovery });
  const unrestricted = await buildDesignRequest({ plot: plotFor(), rooms });
  const { candidate } = await generateCandidate(unrestricted, 'rect');
  const { contentHash } = await import('../dist/integration/control/reference/identity.mjs');
  candidate.requestId = request.requestId; candidate.inputHash = await contentHash(request);
  candidate.requestedShape = candidate.actualShape = candidate.geometry.shape = 'pavilions';
  candidate.geometryHash = await geometryHash(candidate); candidate.candidateId = await candidateId(candidate);
  const review = await reviewCandidate(candidate, request);
  assert.equal(review.checks.find(c => c.id === 'native-validation').status, 'FAIL');
  await assert.rejects(decideReviewed(request, [{ candidate, review }]), /NATIVE_VALIDATION_FAILED/);
});
test('pavilions and another chosen shape remain distinct eligible producers', async () => {
  const result = await runMultiEngineDesign({ plot: plotFor(), rooms: rooms.map(r => ({ ...r, side: 'any' })), discovery: { ...discovery, likes: ['family_layout', 'classic_living'] } });
  const shapes = [...new Set(result.models.map(m => m.shape))];
  assert.ok(shapes.includes('l') && shapes.includes('pavilions'));
  assert.equal(result.aziz.status, 'selected');
});
test('built-area limits and a one-zone program fail without substitution or room changes', async () => {
  await assert.rejects(runMultiEngineDesign({ plot: plotFor('s', 20, 30, { maxBuiltArea: 350 }), rooms, discovery, idea: 'أبي أجنحة مرتبطة برواق' }), /تتجاوز سقف مساحة البناء/);
  const oneZone = rooms.map(r => ({ ...r, position: 'middle' }));
  await assert.rejects(runMultiEngineDesign({ plot: plotFor(), rooms: oneZone, discovery, idea: 'أبي أجنحة مرتبطة برواق' }), /منطقتين على الأقل/);
});
test('pavilion projects restore exact 2D/3D geometry and openings remain editable', async () => {
  const plot = plotFor(), result = await runMultiEngineDesign({ plot, rooms, discovery, idea: 'أبي أجنحة مرتبطة برواق' });
  const model = result.selectedModel;
  const wall = model.walls.find(w => w.type === 'ext' && !model.openings.some(o => o.wallId === w.id) && Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 2);
  assert.ok(wall);
  const edited = placeOpening(model, { type: 'window', point: { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 } });
  const added = edited.openings.find(o => !model.openings.some(p => p.id === o.id));
  assert.deepEqual(validateModel(edited), []);
  const removed = removeOpening(edited, openingPoint(edited, added));
  assert.deepEqual(removed.buildingFootprint, model.buildingFootprint);
  const saved = encodeProject({ plot, rooms, discovery, model, alternatives: result.models, palette: 'resort', rates: {}, costReserve: 0, vat: 0, idea: '', history: [] });
  assert.deepEqual(decodeProject(saved).model, model);
});
