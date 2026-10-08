import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, generateModel } from '../dist/planner.mjs';
import { canonicalGeometry, geometryFingerprint, topologyFor } from '../worker/archive-canonical.mjs';

const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { n: false, s: true, e: false, w: false }, streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null };
const model = generateModel(plot, defaultRooms());
const turnSide = (side, turns) => ['n', 'e', 's', 'w'][(['n', 'e', 's', 'w'].indexOf(side) + turns) % 4];
function rotateQuarter(source, turns) {
  const out = structuredClone(source);
  const { width, length } = source.plot;
  const box = item => {
    const { x, y, w, h } = item;
    if (turns === 1) return { ...item, x: length - y - h, y: x, w: h, h: w };
    if (turns === 2) return { ...item, x: width - x - w, y: length - y - h };
    return { ...item, x: y, y: width - x - w, w: h, h: w };
  };
  const point = (x, y) => turns === 1 ? { x: length - y, y: x } : turns === 2 ? { x: width - x, y: length - y } : { x: y, y: width - x };
  out.plot.width = turns % 2 ? length : width;
  out.plot.length = turns % 2 ? width : length;
  out.plot.entry = turnSide(source.plot.entry, turns);
  out.plot.streets = Object.fromEntries(['n', 'e', 's', 'w'].map(side => [turnSide(side, turns), source.plot.streets[side] === true]));
  for (const key of ['rooms', 'corridors', 'reserves']) out[key] = source[key].map(box);
  out.building = box(source.building);
  out.walls = source.walls.map(wall => ({ ...wall, ...(() => { const a = point(wall.x1, wall.y1), b = point(wall.x2, wall.y2); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; })() }));
  return out;
}
function translate(source, dx, dy) {
  const out = structuredClone(source);
  for (const key of ['building', 'rooms', 'corridors', 'reserves']) for (const item of key === 'building' ? [out[key]] : out[key]) { item.x += dx; item.y += dy; }
  for (const wall of out.walls) { wall.x1 += dx; wall.x2 += dx; wall.y1 += dy; wall.y2 += dy; }
  return out;
}
function reflectAcrossVerticalAxis(source) {
  const out = structuredClone(source), { width } = source.plot;
  const reflectSide = side => ({ n: 'n', e: 'w', s: 's', w: 'e' })[side];
  const box = item => ({ ...item, x: width - item.x - item.w });
  const point = (x, y) => ({ x: width - x, y });
  out.plot.entry = reflectSide(source.plot.entry);
  out.plot.streets = Object.fromEntries(Object.entries(source.plot.streets).map(([side, present]) => [reflectSide(side), present]));
  for (const key of ['rooms', 'corridors', 'reserves']) out[key] = source[key].map(box);
  out.building = box(source.building);
  out.walls = source.walls.map(wall => ({ ...wall, ...(() => { const a = point(wall.x1, wall.y1), b = point(wall.x2, wall.y2); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; })() }));
  return out;
}
function reidentify(source) {
  const out = structuredClone(source), roomIds = new Map(), corridorIds = new Map(), wallIds = new Map();
  out.program.forEach((item, index) => roomIds.set(item.id, `new-room-${index}`));
  out.rooms.forEach((item, index) => roomIds.set(item.id, `new-room-${index}`));
  out.corridors.forEach((item, index) => corridorIds.set(item.id, `new-corridor-${index}`));
  out.walls.forEach((item, index) => wallIds.set(item.id, `new-wall-${index}`));
  out.program.forEach(item => { item.id = roomIds.get(item.id); });
  out.rooms.forEach(item => { item.id = roomIds.get(item.id); if (item.corridorId) item.corridorId = corridorIds.get(item.corridorId); });
  out.corridors.forEach(item => { item.id = corridorIds.get(item.id); });
  out.links = out.links.map(([a, b]) => [corridorIds.get(a), corridorIds.get(b)]);
  out.walls.forEach(item => { item.id = wallIds.get(item.id); });
  out.openings.forEach(item => { item.wallId = wallIds.get(item.wallId); if (item.roomId) item.roomId = roomIds.get(item.roomId); if (Array.isArray(item.connects)) item.connects = item.connects.map(id => roomIds.get(id) || corridorIds.get(id)); });
  return out;
}

test('geometry fingerprint ignores display names and canonicalizes rotations and reflections', async () => {
  const base = await geometryFingerprint(model);
  const renamed = structuredClone(model); renamed.program.forEach((room, i) => { room.name = `عنوان مختلف ${i}`; }); renamed.rooms.forEach((room, i) => { room.name = `غرفة أخرى ${i}`; });
  assert.equal((await geometryFingerprint(renamed)).hash, base.hash);
  for (const turns of [1, 2, 3]) assert.equal((await geometryFingerprint(rotateQuarter(model, turns))).hash, base.hash, `rotation ${turns}`);
  assert.equal((await geometryFingerprint(translate(model, 75, -41))).hash, base.hash, 'coordinate-origin translation');
  const reflected = reflectAcrossVerticalAxis(model), reflectedFingerprint = await geometryFingerprint(reflected);
  assert.equal(reflectedFingerprint.hash, base.hash, 'a reflected version is the same novelty');
  assert.notEqual(reflectedFingerprint.exactGeometryHash, base.exactGeometryHash, 'exact site and placement truth retains the actual reflection');
  assert.equal((await geometryFingerprint(reidentify(model))).hash, base.hash, 'generated IDs');
  const changedSetback = structuredClone(model); changedSetback.plot.streetSetback += 1;
  assert.notEqual((await geometryFingerprint(changedSetback)).hash, base.hash, 'setback policy remains part of novelty context');
});

test('geometry fingerprint changes with room type, topology, or millimetre geometry', async () => {
  const base = await geometryFingerprint(model);
  const typed = structuredClone(model); typed.program[0].type = typed.program[0].type === 'majlis' ? 'bedroom' : 'majlis';
  assert.notEqual((await geometryFingerprint(typed)).hash, base.hash);
  const linked = structuredClone(model); linked.rooms[0].corridorId = 'missing-corridor';
  assert.notDeepEqual(topologyFor(linked), topologyFor(model));
  assert.notEqual((await geometryFingerprint(linked)).hash, base.hash);
  const moved = structuredClone(model); moved.rooms[0].x += .001;
  assert.notEqual((await geometryFingerprint(moved)).hash, base.hash);
});

test('canonical representation is deterministic and rounds coordinates to one millimetre', () => {
  const first = structuredClone(model), sameMm = structuredClone(model);
  first.rooms[0].x += .0002; sameMm.rooms[0].x += .0004;
  assert.deepEqual(canonicalGeometry(first), canonicalGeometry(sameMm));
});
