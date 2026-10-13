import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWalls, exteriorWallIds } from '../dist/draw/topology.mjs';

const W = (id, ax, ay, bx, by, t = .2) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t });
const box = (x0, y0, x1, y1, p = 'b', t = .2) => [W(p + 1, x0, y0, x1, y0, t), W(p + 2, x1, y0, x1, y1, t), W(p + 3, x1, y1, x0, y1, t), W(p + 4, x0, y1, x0, y0, t)];
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

test('a closed rectangle gives one room whose clear area excludes half of each wall', () => {
  const r = analyzeWalls(box(0, 0, 5, 4));
  assert.equal(r.spaces.length, 1);
  near(r.spaces[0].grossArea, 20); near(r.spaces[0].area, 4.8 * 3.8);
  assert.equal(r.spaces[0].edges.every(e => e.outside), true);
  assert.equal(r.outlines.length, 1); near(r.outlines[0].area, 5.2 * 4.2);
  assert.equal(r.gaps.length, 0); assert.equal(r.stubs.length, 0);
});

test('a partition touching both sides (T junctions) splits the room in two and is interior', () => {
  const walls = [...box(0, 0, 8, 4), W('p', 5, 0, 5, 4, .12)];
  const r = analyzeWalls(walls);
  assert.equal(r.spaces.length, 2);
  const areas = r.spaces.map(s => s.area).sort((a, b) => a - b);
  near(areas[0], (8 - 5 - .1 - .06) * 3.8, 1e-6); near(areas[1], (5 - .1 - .06) * 3.8);
  const ext = exteriorWallIds(r);
  assert.ok(!ext.has('p')); assert.ok(ext.has('b1') && ext.has('b3'));
  const left = r.spaces.find(s => s.centroid.x < 5);
  assert.ok(left.edges.some(e => e.space && e.space !== left.id), 'left room knows its neighbour');
});

test('an open partition that does not reach the far wall leaves one room and a stub; a near miss is reported as a gap', () => {
  const r = analyzeWalls([...box(0, 0, 8, 4), W('p', 5, 0, 5, 3.8)]);
  assert.equal(r.spaces.length, 1); assert.equal(r.stubs.length, 1);
  assert.equal(r.gaps.length, 1); near(r.gaps[0].dist, .2, 1e-9); assert.deepEqual(r.gaps[0].point, { x: 5, y: 4 });
});

test('crossing walls (X junction) make four rooms', () => {
  const r = analyzeWalls([...box(0, 0, 8, 8), W('h', 0, 4, 8, 4, .12), W('v', 4, 0, 4, 8, .12)]);
  assert.equal(r.spaces.length, 4);
  for (const s of r.spaces) near(s.area, (4 - .1 - .06) * (4 - .1 - .06), 1e-6);
});

test('an L-shaped room and its clear area', () => {
  const L = [W('1', 0, 0, 6, 0), W('2', 6, 0, 6, 3), W('3', 6, 3, 3, 3), W('4', 3, 3, 3, 6), W('5', 3, 6, 0, 6), W('6', 0, 6, 0, 0)];
  const r = analyzeWalls(L);
  assert.equal(r.spaces.length, 1); near(r.spaces[0].grossArea, 27);
  near(r.spaces[0].area, 24.64, 1e-9); assert.equal(r.spaces[0].net.length, 6);
});

test('a closed loop inside a room (e.g. a shaft) becomes a hole of the host room, not a room-sized overlap', () => {
  const r = analyzeWalls([...box(0, 0, 10, 10), ...box(4, 4, 6, 6, 'i')]);
  assert.equal(r.spaces.length, 2);
  const host = r.spaces.find(s => s.grossArea > 50), inner = r.spaces.find(s => s.grossArea < 10);
  assert.equal(host.holes.length, 1); near(host.area, 9.8 * 9.8 - 2.2 * 2.2, 1e-6);
  near(inner.area, 1.8 * 1.8, 1e-6);
  assert.ok(host.edges.some(e => e.space === inner.id) === false, 'the host side of the island wall has no neighbour listed via its boundary edges');
});

test('wall endpoints within 5 mm join; separate buildings stay separate; no walls gives nothing', () => {
  const r = analyzeWalls([W('1', 0, 0, 4, 0), W('2', 4.003, 0, 4, 3), W('3', 4, 3, 0, 3), W('4', 0, 3, 0, 0)]);
  assert.equal(r.spaces.length, 1);
  assert.equal(analyzeWalls([...box(0, 0, 3, 3), ...box(10, 0, 13, 3, 'c')]).spaces.length, 2);
  assert.deepEqual(analyzeWalls([]).spaces, []);
});

test('duplicate / overlapping walls collapse to one edge with the larger thickness', () => {
  const r = analyzeWalls([...box(0, 0, 4, 3), W('dup', 0, 0, 4, 0, .3)]);
  assert.equal(r.spaces.length, 1);
  const bottom = r.spaces[0].edges.find(e => e.wallIds.includes('dup'));
  near(bottom.t, .3);
});
