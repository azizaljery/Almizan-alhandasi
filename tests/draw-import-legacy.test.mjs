import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { generateModel, defaultRooms, normalizeRooms, validatePlot } from '../dist/planner.mjs';
import { encodeProject } from '../dist/project.mjs';
import { validateDoc, parseDoc, serialize, DrawError } from '../dist/draw/doc.mjs';
import { analyzeWalls } from '../dist/draw/topology.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import { isLegacyModel, findLegacyModels, legacyToDoc, joinWallEnds, LEGACY_PROJECT_SCHEMA } from '../dist/draw/import-legacy.mjs';

const make = (entry = 's', strategy = 'compact', [width, length] = entry === 'e' || entry === 'w' ? [30, 20] : [20, 30]) => {
  const plot = validatePlot({ width, length, floors: 1, entry, streets: { [entry]: true } }), rooms = normalizeRooms(defaultRooms());
  return { plot, rooms, model: generateModel(plot, rooms, { strategy }) };
};
const worldOf = (wall, d) => { const L = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y); return { x: wall.a.x + (wall.b.x - wall.a.x) * d / L, y: wall.a.y + (wall.b.y - wall.a.y) * d / L }; };

test('only a legacy plan is recognised as one', () => {
  const { model } = make();
  assert.equal(isLegacyModel(model), true);
  assert.equal(isLegacyModel({ rooms: [], walls: [], openings: [] }), false);
  assert.equal(isLegacyModel(null), false);
  assert.equal(isLegacyModel({ schema: 'mizan-draw/1', walls: [], openings: [] }), false);
  assert.throws(() => legacyToDoc({ walls: [] }), e => e instanceof DrawError && e.code === 'NOT_LEGACY');
});

test('loose interior ends are joined onto the centre-line of the wall they touch', () => {
  // an interior wall that stops 5 cm short of the exterior centre-line (inside its 25 cm body), as the planner draws them
  const walls = [
    { id: 'ext', x1: 0, y1: 0, x2: 10, y2: 0, t: .25 },
    { id: 'int', x1: 4, y1: .05, x2: 4, y2: 6, t: .15 },
    { id: 'far', x1: 0, y1: 8, x2: 10, y2: 8, t: .25 },
  ];
  const joined = joinWallEnds(walls), int = joined.find(j => j.src.id === 'int');
  assert.deepEqual(int.a, { x: 4, y: 0 }, 'start joins the exterior centre-line');
  assert.ok(Math.abs(int.shiftA - .05) < 1e-12, 'and reports how far it moved');
  assert.deepEqual(int.b, { x: 4, y: 6 }, 'an end that touches nothing within reach stays loose');
  // already-connected ends do not move
  const T = joinWallEnds([{ id: 'a', x1: 0, y1: 0, x2: 10, y2: 0, t: .25 }, { id: 'b', x1: 5, y1: 0, x2: 5, y2: 4, t: .15 }]);
  assert.deepEqual(T.find(j => j.src.id === 'b').a, { x: 5, y: 0 });
  // ends of parallel or distant walls are never pulled anywhere
  assert.deepEqual(joinWallEnds([{ id: 'a', x1: 0, y1: 0, x2: 10, y2: 0, t: .25 }, { id: 'b', x1: 0, y1: .1, x2: 10, y2: .1, t: .15 }]).find(j => j.src.id === 'b').a, { x: 0, y: .1 });
});

for (const [entry, strategy] of [['s', 'claude-rect'], ['s', 'compact'], ['n', 'balanced'], ['e', 'frontage'], ['w', 'courtyard']]) {
  test(`a generated plan (${strategy}, entry ${entry}) becomes the same drawing: rooms, areas, openings, entry`, () => {
    const { model } = make(entry, strategy), { doc, report } = legacyToDoc(model);
    assert.deepEqual(validateDoc(doc), []);
    assert.equal(parseDoc(serialize(doc)).walls.length, doc.walls.length, 'round-trips through the project file');
    assert.deepEqual([report.skipped, report.unmatched, report.areaMismatch], [[], [], []]);
    assert.equal(report.walls, model.walls.length); assert.equal(report.openings, model.openings.length); assert.equal(report.rooms, model.rooms.length);
    assert.equal(doc.entry, entry); assert.deepEqual(doc.plot.polygon[2], { x: model.plot.width, y: model.plot.length });
    assert.equal(doc.levels[0].height, model.walls[0].h);
    // closed, connected drawing: no loose ends
    const analysis = analyzeWalls(doc.walls);
    assert.equal(analysis.stubs.length, 0); assert.equal(analysis.gaps.length, 0);
    // every legacy room is one closed space with exactly the clear area the planner promised
    for (const room of model.rooms) {
      const label = doc.labels.find(l => l.name === room.name), space = analysis.spaces.find(s => s.net && pointInPolygon(label.seed, s.net));
      assert.ok(space, 'room has a space: ' + room.name);
      assert.ok(Math.abs(space.area - room.w * room.h) < 1e-6, `${room.name}: ${space.area} vs ${room.w * room.h}`);
      assert.equal(label.type, room.type);
    }
    // every opening stands where the planner put it (to the millimetre, which is how the studio stores it)
    const byId = new Map(model.walls.map(w => [w.id, w])), used = new Set();
    for (const o of model.openings) {
      const w = byId.get(o.wallId), c = { x: w.x1 + (w.x2 - w.x1) * o.pos, y: w.y1 + (w.y2 - w.y1) * o.pos };
      const hit = doc.openings.filter(n => !used.has(n.id)).map(n => ({ n, d: Math.hypot(worldOf(doc.walls.find(x => x.id === n.wall), n.at).x - c.x, worldOf(doc.walls.find(x => x.id === n.wall), n.at).y - c.y) })).sort((p, q) => p.d - q.d)[0];
      assert.ok(hit && hit.d < .002, `opening ${o.id} off by ${hit?.d}`); used.add(hit.n.id);
      assert.equal(hit.n.w, o.w); assert.equal(hit.n.entry, !!o.connects?.includes('outside'));
      assert.equal(hit.n.kind.startsWith('window'), o.type === 'window');
    }
    assert.equal(doc.openings.filter(o => o.entry).length, 1, 'exactly one entrance');
  });
}

test('corridors that open into each other are one named space, not several', () => {
  const { model } = make('s', 'claude-rect'), { doc, report } = legacyToDoc(model);
  assert.equal(model.corridors.length, 4); assert.equal(doc.labels.filter(l => l.type === 'corridor').length, 1);
  assert.equal(report.corridorsMerged, 3);
  assert.equal(doc.labels.find(l => l.type === 'corridor').name, 'ممر رئيسي', 'the largest corridor keeps its name');
});

test('the imported drawing builds a real 3D model with every room in it', () => {
  const { model } = make('s', 'compact'), { doc } = legacyToDoc(model);
  const built = buildBuildingScene(doc, THREE, { textures: false });
  const named = [...built.rooms.values()].filter(r => r.label);
  assert.equal(named.length, model.rooms.length + 1, 'rooms + the corridor space');
  assert.ok(named.every(r => r.area > 1));
  assert.ok(built.stats.triangles > 500);
});

test('a saved project of the previous system yields its main design, alternatives and earlier versions', () => {
  const { plot, rooms, model } = make('s', 'compact'), alt = generateModel(plot, rooms, { strategy: 'balanced' }), older = generateModel(plot, rooms, { strategy: 'frontage' });
  const text = encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 10, vat: 15, idea: '', model, alternatives: [alt], history: [{ model: older, palette: 'modern' }] });
  assert.equal(JSON.parse(text).schema, LEGACY_PROJECT_SCHEMA);
  const { candidates, skipped } = findLegacyModels(text);
  assert.deepEqual(candidates.map(c => c.label), ['المخطط الأساسي', 'البديل 1', 'نسخة سابقة 1']);
  assert.deepEqual(skipped, []);
  assert.equal(candidates[0].summary.rooms, 12); assert.equal(candidates[0].summary.width, 20);
  for (const c of candidates) { const { doc, report } = legacyToDoc(c.model); assert.deepEqual(validateDoc(doc), []); assert.deepEqual([report.unmatched, report.skipped], [[], []]); }
});

test('bare models, wrapped models and a design kept only as a recipe are all found', () => {
  const { plot, rooms, model } = make('s', 'compact');
  assert.equal(findLegacyModels(model).candidates.length, 1);
  assert.equal(findLegacyModels({ model }).candidates.length, 1);
  assert.equal(findLegacyModels(JSON.stringify(model)).candidates.length, 1);
  const recipeOnly = { schema: LEGACY_PROJECT_SCHEMA, design: { plot, rooms: rooms.map(({ name, type, area, position, side }) => ({ name, type, area, position, side })), strategy: 'compact' }, alternatives: [], history: [] };
  const without = findLegacyModels(recipeOnly);
  assert.equal(without.candidates.length, 0); assert.match(without.skipped[0], /لا يحتوي هندسة محفوظة/);
  const calls = [];
  const withGen = findLegacyModels(recipeOnly, { generate: r => { calls.push(r.strategy); return generateModel(validatePlot(r.plot), normalizeRooms(r.rooms), { strategy: r.strategy }); } });
  assert.deepEqual(calls, ['compact']); assert.equal(withGen.candidates.length, 1);
  assert.deepEqual(legacyToDoc(withGen.candidates[0].model).report.unmatched, []);
  const failing = findLegacyModels(recipeOnly, { generate: () => { throw Error('boom'); } });
  assert.equal(failing.candidates.length, 0); assert.match(failing.skipped[0], /boom/);
});

test('files that are not legacy plans are reported, never guessed at', () => {
  assert.deepEqual(findLegacyModels({ hello: 'world' }).candidates, []);
  assert.deepEqual(findLegacyModels([]).candidates, []);
  assert.deepEqual(findLegacyModels(null).candidates, []);
  assert.throws(() => findLegacyModels('{not json'), e => e instanceof DrawError && e.code === 'BAD_JSON');
});

test('damaged parts are skipped and reported while the rest still imports', () => {
  const { model } = make('s', 'compact'), broken = structuredClone(model);
  const lostWall = broken.walls[3].id;
  broken.walls[3].x2 = NaN; broken.openings[0].pos = 'x'; broken.openings[1].wallId = 'wall-404';
  const { doc, report } = legacyToDoc(broken);
  assert.deepEqual(validateDoc(doc), []);
  // the two damaged openings and every opening that stood on the lost wall are skipped; nothing else
  const expected = model.openings.filter(o => o !== model.openings[0] && o !== model.openings[1] && o.wallId !== lostWall).length;
  assert.equal(report.walls, model.walls.length - 1); assert.equal(report.openings, expected);
  assert.ok(report.skipped.length >= 3, report.skipped.join(' | '));
  assert.ok(report.unmatched.length >= 1, 'a room whose wall is gone is reported instead of being named in a wrong place');
});

test('the importer reads the model without changing it', () => {
  const { model } = make('s', 'compact'), before = JSON.stringify(model);
  legacyToDoc(model); findLegacyModels({ model });
  assert.equal(JSON.stringify(model), before);
});
