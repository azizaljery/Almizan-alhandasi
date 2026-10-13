import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, applyCommand, validateDoc, createHistory, parseDoc, serialize, DrawError, COMMAND_TYPES } from '../dist/draw/doc.mjs';
import { analyzeWalls } from '../dist/draw/topology.mjs';

const run = (doc, cmd) => applyCommand(doc, cmd);
const rect = (doc, x0, y0, x1, y1) => run(doc, { type: 'add-rect', level: 'L1', a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, t: .2 }).doc;
const throwsCode = (fn, code) => assert.throws(fn, e => e instanceof DrawError && e.code === code, code);

test('a new document is valid and empty; commands never mutate their input', () => {
  const d = createDoc(); assert.deepEqual(validateDoc(d), []); assert.equal(d.walls.length, 0);
  const before = JSON.stringify(d); const out = run(d, { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  assert.equal(JSON.stringify(d), before); assert.equal(out.doc.walls.length, 1); assert.deepEqual(out.ids, ['w1']);
});

test('add-rect draws four joined walls and rooms are derived from them; an existing shared wall is not duplicated', () => {
  let d = rect(createDoc(), 0, 0, 5, 4);
  assert.equal(d.walls.length, 4);
  d = rect(d, 5, 0, 9, 4); // shares the x=5 wall
  assert.equal(d.walls.length, 7);
  assert.equal(analyzeWalls(d.walls).spaces.length, 2);
});

test('validation: too short / too long walls, unknown level, bad thickness', () => {
  const d = createDoc();
  throwsCode(() => run(d, { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: .01, y: 0 } }), 'WALL_TOO_SHORT');
  throwsCode(() => run(d, { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 500, y: 0 } }), 'WALL_TOO_LONG');
  throwsCode(() => run(d, { type: 'add-wall', level: 'L9', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }), 'NO_LEVEL');
  throwsCode(() => run(d, { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, t: 2 }), 'BAD_THICKNESS');
  throwsCode(() => run(d, { type: 'add-wall', level: 'L1', a: { x: 0, y: NaN }, b: { x: 3, y: 0 } }), 'BAD_NUMBER');
  throwsCode(() => run(d, { type: 'nope' }), 'BAD_COMMAND');
});

test('openings: clamped inside the wall, never overlapping, rejected when they cannot fit', () => {
  let d = rect(createDoc(), 0, 0, 5, 4);
  d = run(d, { type: 'add-opening', wall: 'w1', kind: 'window', at: 0.1 }).doc;
  assert.ok(d.openings[0].at >= d.openings[0].w / 2);
  d = run(d, { type: 'add-opening', wall: 'w1', kind: 'door', at: d.openings[0].at }).doc;
  const [o1, o2] = d.openings; assert.ok(Math.abs(o1.at - o2.at) >= (o1.w + o2.w) / 2 - 1e-6);
  assert.deepEqual(validateDoc(d), []);
  throwsCode(() => run(d, { type: 'add-opening', wall: 'w2', kind: 'garage' }), 'OPENING_TOO_WIDE');
  throwsCode(() => run(d, { type: 'add-opening', wall: 'w1', kind: 'window', sill: 2.5, h: 1.2 }), 'BAD_HEIGHT');
  throwsCode(() => run(d, { type: 'add-opening', wall: 'nope', kind: 'door' }), 'NO_WALL');
});

test('moving a node moves every wall end that meets there; shortening a wall pushes its openings inside', () => {
  let d = rect(createDoc(), 0, 0, 5, 4);
  d = run(d, { type: 'add-opening', wall: 'w1', kind: 'door', at: 4.5 }).doc;
  d = run(d, { type: 'move-node', level: 'L1', from: { x: 5, y: 0 }, to: { x: 3, y: 0 } }).doc;
  assert.deepEqual(d.walls.find(w => w.id === 'w1').b, { x: 3, y: 0 });
  assert.deepEqual(d.walls.find(w => w.id === 'w2').a, { x: 3, y: 0 });
  assert.ok(d.openings[0].at + d.openings[0].w / 2 <= 3 + 1e-9);
  throwsCode(() => run(d, { type: 'move-node', level: 'L1', from: { x: 99, y: 99 }, to: { x: 1, y: 1 } }), 'NO_NODE');
});

test('translate stretches the neighbours that were attached; keepJoints:false detaches', () => {
  let d = rect(createDoc(), 0, 0, 5, 4);
  d = run(d, { type: 'add-wall', level: 'L1', a: { x: 5, y: 2 }, b: { x: 9, y: 2 } }).doc; // not planar-joined at the end, starts on the x=5 wall
  const moved = run(d, { type: 'translate', ids: ['w2'], dx: 1, dy: 0 }).doc;
  assert.deepEqual(moved.walls.find(w => w.id === 'w2').a, { x: 6, y: 0 });
  assert.deepEqual(moved.walls.find(w => w.id === 'w1').b, { x: 6, y: 0 }, 'neighbour stretched');
  const free = run(d, { type: 'translate', ids: ['w2'], dx: 1, dy: 0, keepJoints: false }).doc;
  assert.deepEqual(free.walls.find(w => w.id === 'w1').b, { x: 5, y: 0 });
});

test('delete removes a wall with its openings; split-wall keeps openings on the right piece', () => {
  let d = rect(createDoc(), 0, 0, 6, 4);
  d = run(d, { type: 'add-opening', wall: 'w1', kind: 'window', at: 1.5 }).doc;
  d = run(d, { type: 'add-opening', wall: 'w1', kind: 'door', at: 4.5 }).doc;
  const split = run(d, { type: 'split-wall', id: 'w1', at: { x: 3, y: 0 } }).doc;
  assert.equal(split.walls.length, 5);
  const byWall = id => split.openings.filter(o => o.wall === id).map(o => o.kind);
  assert.deepEqual(byWall('w1'), ['window']); assert.deepEqual(byWall('w5'), ['door']);
  assert.ok(Math.abs(split.openings.find(o => o.kind === 'door').at - 1.5) < 1e-9);
  assert.deepEqual(validateDoc(split), []);
  const gone = run(d, { type: 'delete', ids: ['w1'] }).doc;
  assert.equal(gone.walls.length, 3); assert.equal(gone.openings.length, 0);
  throwsCode(() => run(d, { type: 'split-wall', id: 'w1', at: { x: 0.01, y: 0 } }), 'SPLIT_END');
});

test('labels keep their seed; update is whitelisted per collection', () => {
  let d = rect(createDoc(), 0, 0, 5, 4);
  d = run(d, { type: 'add-label', level: 'L1', name: 'مجلس', roomType: 'majlis', seed: { x: 2.5, y: 2 } }).doc;
  d = run(d, { type: 'update', id: 'r1', patch: { name: 'مجلس الرجال' } }).doc;
  assert.equal(d.labels[0].name, 'مجلس الرجال');
  throwsCode(() => run(d, { type: 'update', id: 'r1', patch: { id: 'x' } }), 'FIELD_LOCKED');
  throwsCode(() => run(d, { type: 'update', id: 'r1', patch: { type: 'castle' } }), 'BAD_TYPE');
  throwsCode(() => run(d, { type: 'add-label', level: 'L1', roomType: 'castle', seed: { x: 1, y: 1 } }), 'BAD_TYPE');
  const sp = analyzeWalls(d.walls).spaces[0];
  assert.ok(sp.net.length === 4);
});

test('levels: adding keeps elevations stacked; copy-level duplicates walls and openings', () => {
  let d = rect(createDoc(), 0, 0, 5, 4);
  d = run(d, { type: 'add-opening', wall: 'w1', kind: 'window' }).doc;
  d = run(d, { type: 'add-level', name: 'الدور الأول', height: 3, copyFrom: 'L1' }).doc;
  assert.equal(d.levels[1].elevation, 3.2); assert.equal(d.walls.filter(w => w.level === 'L2').length, 4);
  assert.equal(d.openings.filter(o => o.level === 'L2').length, 1);
  assert.deepEqual(validateDoc(d), []);
  d = run(d, { type: 'update', id: 'L1', patch: { height: 3.6 } }).doc;
  assert.equal(d.levels[1].elevation, 3.6);
});

test('batch is atomic: a failing sub-command leaves the document unchanged', () => {
  const d = rect(createDoc(), 0, 0, 5, 4);
  throwsCode(() => run(d, { type: 'batch', commands: [{ type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, { type: 'add-opening', wall: 'nope', kind: 'door' }] }), 'NO_WALL');
  assert.equal(d.walls.length, 4);
});

test('close-gap extends a free end onto its target', () => {
  let d = createDoc();
  d = run(d, { type: 'add-walls', level: 'L1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }, { x: 0, y: .2 }] }).doc;
  const gaps = analyzeWalls(d.walls).gaps; assert.equal(gaps.length, 1);
  d = run(d, { type: 'close-gap', level: 'L1', from: gaps[0].at, to: gaps[0].point }).doc;
  assert.equal(analyzeWalls(d.walls).gaps.length, 0); assert.equal(analyzeWalls(d.walls).spaces.length, 1);
});

test('history: undo/redo, branch cut on new edit, coalescing of rapid keyed edits', () => {
  const h = createHistory(createDoc());
  const d1 = run(h.doc, { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }).doc; h.commit(d1, 'جدار');
  const d2 = run(d1, { type: 'move-node', level: 'L1', from: { x: 3, y: 0 }, to: { x: 4, y: 0 } }).doc; h.commit(d2, 'سحب', { key: 'drag', now: 1000 });
  const d3 = run(d2, { type: 'move-node', level: 'L1', from: { x: 4, y: 0 }, to: { x: 5, y: 0 } }).doc; h.commit(d3, 'سحب', { key: 'drag', now: 1200 });
  assert.equal(h.depth, 2, 'two drag steps merged into one undo step');
  assert.equal(h.undo().walls[0].b.x, 3); assert.equal(h.undo().walls.length, 0); assert.equal(h.canUndo, false);
  assert.equal(h.redo().walls.length, 1); assert.equal(h.canRedo, true);
  h.commit(run(h.doc, { type: 'add-wall', level: 'L1', a: { x: 0, y: 1 }, b: { x: 3, y: 1 } }).doc, 'جديد');
  assert.equal(h.canRedo, false);
});

test('serialize / parse round-trips and rejects foreign or broken files', () => {
  let d = rect(createDoc({ title: 'فيلا' }), 0, 0, 5, 4);
  d = run(d, { type: 'add-opening', wall: 'w1', kind: 'door' }).doc;
  const back = parseDoc(serialize(d)); assert.deepEqual(back, d);
  assert.equal(applyCommand(back, { type: 'add-wall', level: 'L1', a: { x: 9, y: 9 }, b: { x: 9, y: 12 } }).ids[0], 'w5');
  throwsCode(() => parseDoc('{bad'), 'BAD_JSON'); throwsCode(() => parseDoc({ schema: 'other' }), 'BAD_SCHEMA');
  const broken = JSON.parse(serialize(d)); broken.openings[0].wall = 'zzz';
  throwsCode(() => parseDoc(broken), 'INVALID_DOC');
  assert.ok(COMMAND_TYPES.includes('add-rect') && COMMAND_TYPES.includes('batch'));
});
