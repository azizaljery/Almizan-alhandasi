import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWallSolids, expectedFaceArea, pieceFaceArea, totalPlanArea, blockingPolygons, pointBlocked } from '../dist/draw/wall-geometry.mjs';
import { pointInPolygon, signedArea } from '../dist/draw/geom.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';

const W = (id, ax, ay, bx, by, t = .2, h = 3, extra = {}) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h, kind: 'wall', ...extra });
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

/** Count how many solid polygons cover each grid sample; returns {max, covered, area} */
function coverage(solids, bbox, step = .01) {
  const polys = solids.polygons.map(p => p.poly);
  let max = 0, covered = 0;
  for (let x = bbox.x0 + step / 2 + 1e-5; x < bbox.x1; x += step) for (let y = bbox.y0 + step / 2 + 3e-5; y < bbox.y1; y += step) {
    let n = 0; for (const poly of polys) if (pointInPolygon({ x, y }, poly, 0)) n++;
    if (n) covered++; max = Math.max(max, n);
  }
  return { max, covered, area: covered * step * step };
}

test('closed rectangle: corners are mitred, area = outer - inner, no overlap', () => {
  const t = .25, w = [W('a', 0, 0, 8, 0, t), W('b', 8, 0, 8, 6, t), W('c', 8, 6, 0, 6, t), W('d', 0, 6, 0, 0, t)];
  const s = buildWallSolids(w);
  assert.equal(s.segments.length, 4);
  near(totalPlanArea(s), (8 + t) * (6 + t) - (8 - t) * (6 - t), 1e-9);
  assert.equal(s.joints.length, 0);
  const xs = s.segments.flatMap(g => g.quad.map(p => p.x)), ys = s.segments.flatMap(g => g.quad.map(p => p.y));
  near(Math.min(...xs), -t / 2); near(Math.max(...xs), 8 + t / 2); near(Math.min(...ys), -t / 2); near(Math.max(...ys), 6 + t / 2);
  assert.equal(coverage(s, { x0: -.3, y0: -.3, x1: 8.3, y1: 6.3 }, .05).max, 1);
});

test('free ends get flat caps', () => {
  const s = buildWallSolids([W('a', 0, 0, 4, 0, .2)]);
  near(totalPlanArea(s), 4 * .2);
  assert.deepEqual(s.segments[0].quad.map(p => [p.x, p.y]), [[0, -.1], [4, -.1], [4, .1], [0, .1]]);
});

test('T junction: partition ends at the middle of a long wall, no gap / overlap', () => {
  const s = buildWallSolids([W('a', 0, 0, 10, 0, .25), W('b', 5, 0, 5, 4, .12)]);
  assert.equal(s.segments.length, 3);
  const expected = 10 * .25 + .12 * (4 - .125);
  near(totalPlanArea(s), expected, 1e-9);
  const cov = coverage(s, { x0: -.2, y0: -.3, x1: 10.2, y1: 4.2 }, .02);
  assert.equal(cov.max, 1);
  near(cov.area, expected, .15);
});

test('X junction of walls closes (no overlaps, full cross)', () => {
  const s = buildWallSolids([W('h', -3, 0, 3, 0, .2), W('v', 0, -3, 0, 3, .3)]);
  assert.equal(s.segments.length, 4);
  const expected = 6 * .2 + .3 * 6 - .2 * .3;
  near(totalPlanArea(s), expected, 1e-9);
  const cov = coverage(s, { x0: -3.1, y0: -3.1, x1: 3.1, y1: 3.1 }, .02);
  assert.equal(cov.max, 1);
  near(cov.area, expected, .15);
});

test('L corner with different thicknesses and an acute wedge never overlaps', () => {
  const s = buildWallSolids([W('a', 0, 0, 5, 0, .3), W('b', 0, 0, 0, 5, .12), W('c', 0, 0, 3, 1, .2)]);
  assert.equal(s.segments.length, 3);
  assert.equal(coverage(s, { x0: -.5, y0: -.5, x1: 5.2, y1: 5.2 }, .03).max, 1);
  assert.ok(s.polygons.some(p => pointInPolygon({ x: 0, y: 0 }, p.poly, 1e-9)));
});

test('collinear walls with different thickness share the node cross-line', () => {
  const s = buildWallSolids([W('a', 0, 0, 3, 0, .3), W('b', 3, 0, 6, 0, .12)]);
  assert.equal(s.segments.length, 2);
  near(totalPlanArea(s), 3 * .3 + 3 * .12, 1e-9);
});

test('coincident walls are merged, thickest wins', () => {
  const s = buildWallSolids([W('a', 0, 0, 4, 0, .2), W('b', 4, 0, 0, 0, .3)]);
  assert.equal(s.segments.length, 1);
  near(s.segments[0].t, .3);
});

test('diagonal walls mitre', () => {
  const s = buildWallSolids([W('a', 0, 0, 4, 3, .2), W('b', 4, 3, 8, 0, .2)]);
  assert.equal(coverage(s, { x0: -.3, y0: -.3, x1: 8.3, y1: 3.4 }, .03).max, 1);
  const A = s.segments[0].corners, B = s.segments[1].corners;
  const shared = [A.bL, A.bR].filter(p => [B.aL, B.aR].some(q => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9));
  assert.equal(shared.length, 2);
});

test('openings: pieces add up to the face area minus opening areas', () => {
  const walls = [W('a', 0, 0, 10, 0, .25, 3), W('b', 10, 0, 10, 6, .25, 3), W('c', 10, 6, 0, 6, .25, 3), W('d', 0, 6, 0, 0, .25, 3)];
  const openings = [
    { id: 'o1', wall: 'a', at: 2, w: .9, h: 2.1, sill: 0, kind: 'door' },
    { id: 'o2', wall: 'a', at: 5, w: 1.4, h: 1.2, sill: 1, kind: 'window' },
    { id: 'o3', wall: 'a', at: 8, w: 1.6, h: 2.4, sill: 0, kind: 'garage' },
    { id: 'o4', wall: 'b', at: 3, w: 2.4, h: 2.2, sill: 0, kind: 'slider' },
    { id: 'o5', wall: 'c', at: 5, w: 1.6, h: 2.3, sill: 0, kind: 'arch' },
  ];
  const s = buildWallSolids(walls, openings);
  assert.equal(s.openings.length, 5);
  for (const seg of s.segments) near(pieceFaceArea(seg), expectedFaceArea(seg), 1e-9);
  const a = s.segments.find(g => g.wallId === 'a');
  const kinds = a.pieces.map(p => p.kind);
  assert.equal(kinds.filter(k => k === 'lintel').length, 3);
  assert.equal(kinds.filter(k => k === 'sill').length, 1, 'only the window has a sill piece');
  for (const seg of s.segments) {
    const full = seg.pieces.filter(p => p.z0 === 0 && p.z1 === seg.h).sort((p, q) => p.x0 - q.x0);
    for (let i = 1; i < full.length; i++) assert.ok(full[i].x0 >= full[i - 1].x1 - 1e-9);
  }
  const o2 = s.openings.find(o => o.id === 'o2');
  near(o2.x0, 5 - .7); near(o2.x1, 5 + .7); near(o2.z0, 1); near(o2.z1, 2.2);
  near(o2.center.x, 5, 1e-9); near(o2.center.y, 0, 1e-9);
});

test('opening on a wall split by a T junction maps onto the right segment', () => {
  const s = buildWallSolids([W('a', 0, 0, 10, 0, .25), W('p', 6, 0, 6, 4, .12)], [{ id: 'o', wall: 'a', at: 8, w: 1, h: 1.2, sill: 1, kind: 'window' }]);
  const seg = s.segments.find(g => g.openings.length);
  near(seg.a.x, 6); near(seg.openings[0].center.x, 8, 1e-9); near(seg.openings[0].x0, 1.5);
  assert.equal(s.segments.reduce((n, g) => n + g.openings.length, 0), 1);
  for (const g of s.segments) near(pieceFaceArea(g), expectedFaceArea(g), 1e-9);
});

test('opening next to a mitred corner is slid clear, never producing negative piers', () => {
  const s = buildWallSolids([W('a', 0, 0, 5, 0, .4), W('b', 5, 0, 5, 5, .4)], [{ id: 'o', wall: 'a', at: 4.7, w: .9, h: 1.2, sill: 1, kind: 'window' }]);
  const seg = s.segments.find(g => g.wallId === 'a');
  assert.ok(seg.openings.length === 1 && seg.openings[0].adjusted);
  for (const p of seg.pieces) { assert.ok(p.x1 > p.x0); assert.ok(Math.abs(signedArea(p.poly)) > 0); }
  assert.equal(coverage(s, { x0: -.3, y0: -.3, x1: 5.3, y1: 5.3 }, .05).max, 1);
});

test('wall height defaults to the level height', () => {
  const s = buildWallSolids([{ id: 'x', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, t: .2, h: null }], [], { levelHeight: 3.4 });
  near(s.segments[0].h, 3.4);
});

test('collision helpers: doors are passable, windows and walls are not', () => {
  const s = buildWallSolids([W('a', 0, 0, 10, 0, .25, 3)], [
    { id: 'd', wall: 'a', at: 2, w: .9, h: 2.1, sill: 0, kind: 'door' },
    { id: 'w', wall: 'a', at: 6, w: 1.4, h: 1.2, sill: 1, kind: 'window' }]);
  assert.equal(pointBlocked(s, { x: 2, y: 0 }), false, 'door');
  assert.equal(pointBlocked(s, { x: 6, y: 0 }), true, 'window sill blocks a body');
  assert.equal(pointBlocked(s, { x: 4, y: 0 }), true, 'wall');
  assert.equal(pointBlocked(s, { x: 4, y: 1 }), false, 'free space');
  assert.ok(blockingPolygons(s).length >= 3);
});

test('sample villa: consistent solids, every opening placed, nothing overlaps', () => {
  const d = sampleVilla();
  const s = buildWallSolids(d.walls.filter(w => w.level === 'L1'), d.openings, { levelHeight: 3.2 });
  assert.ok(s.segments.length > d.walls.length);
  for (const g of s.segments) { near(pieceFaceArea(g), expectedFaceArea(g), 1e-9); assert.ok(g.quad.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))); }
  assert.equal(s.openings.length, d.openings.length);
  assert.equal(coverage(s, { x0: -.2, y0: -.2, x1: 12.2, y1: 14.2 }, .1).max, 1);
});

test('two-level variant (copy-level) builds identical solids per level', () => {
  let d = sampleVilla();
  d = applyCommand(d, { type: 'add-level', name: 'الدور الأول', copyFrom: 'L1' }).doc;
  const l2 = d.levels[1].id;
  const s1 = buildWallSolids(d.walls.filter(w => w.level === 'L1'), d.openings.filter(o => o.level === 'L1'));
  const s2 = buildWallSolids(d.walls.filter(w => w.level === l2), d.openings.filter(o => o.level === l2));
  assert.equal(s1.segments.length, s2.segments.length);
  assert.equal(s1.openings.length, s2.openings.length);
  near(totalPlanArea(s1), totalPlanArea(s2), 1e-9);
});
