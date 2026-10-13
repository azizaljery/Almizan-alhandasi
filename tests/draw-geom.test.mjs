import test from 'node:test';
import assert from 'node:assert/strict';
import G from '../dist/draw/geom.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

test('area, orientation, centroid and bounds of a rectangle and an L', () => {
  const r = rect(0, 0, 5, 4);
  near(G.signedArea(r), 20); near(G.signedArea([...r].reverse()), -20); near(G.area([...r].reverse()), 20);
  assert.deepEqual(G.centroid(r), { x: 2.5, y: 2 });
  assert.equal(G.signedArea(G.ccw([...r].reverse())), 20);
  const L = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
  near(G.area(L), 12); near(G.perimeter(L), 16);
  assert.deepEqual(G.bounds(L), { x0: 0, y0: 0, x1: 4, y1: 4, w: 4, h: 4 });
});

test('point in polygon: inside, outside, on the edge; the interior point of an L lies inside it', () => {
  const L = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
  assert.ok(G.pointInPolygon({ x: 1, y: 1 }, L)); assert.ok(!G.pointInPolygon({ x: 3, y: 3 }, L)); assert.ok(G.pointInPolygon({ x: 4, y: 1 }, L));
  const c = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 9, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 10 }, { x: 0, y: 10 }]; // a "U": centroid is outside
  assert.ok(!G.pointInPolygon(G.centroid(c), c));
  const ip = G.interiorPoint(c); assert.ok(G.pointInPolygon(ip, c));
});

test('segment and line intersections, closest point', () => {
  const x = G.segmentIntersection({ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 });
  assert.deepEqual(G.pt(x.point), { x: 2, y: 2 }); near(x.t, .5);
  assert.equal(G.segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null);
  assert.equal(G.segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }), null);
  const c = G.closestOnSegment({ x: 3, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }); assert.deepEqual(c.point, { x: 3, y: 0 }); near(c.dist, 5);
  assert.deepEqual(G.closestOnSegment({ x: -3, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 0 }).point, { x: 0, y: 0 });
  assert.deepEqual(G.pt(G.lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: -3 }, { x: 0, y: 1 })), { x: 5, y: 0 });
});

test('inset of a rectangle by different wall thicknesses gives the clear room', () => {
  const r = rect(0, 0, 5, 4), out = G.insetPolygon(r, [.1, .1, .2, .1]); // top wall thicker
  const b = G.bounds(out);
  near(b.x0, .1, 1e-9); near(b.x1, 4.9, 1e-9); near(b.y0, .1, 1e-9); near(b.y1, 3.8, 1e-9);
  assert.equal(G.insetPolygon(rect(0, 0, .1, 4), .2), null);
  const L = G.ccw([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }]);
  near(G.area(G.insetPolygon(L, .1)), 12 - (16 * .1) + 6 * .01 * 1 - 0, 1.0); // sanity: smaller than the original
  assert.ok(G.area(G.insetPolygon(L, .1)) < 12);
});

test('angle snapping keeps the length and lands on the grid of angles', () => {
  const s = G.snapAngle({ x: 0, y: 0 }, { x: 5, y: .4 }, Math.PI / 4);
  near(s.y, 0, 1e-9); near(G.len(s), Math.hypot(5, .4), 1e-9);
  const d = G.snapAngle({ x: 1, y: 1 }, { x: 4, y: 3.7 }, Math.PI / 4);
  near(d.x - 1, d.y - 1, 1e-9);
  near(G.angleBetween({ x: 1, y: 0 }, { x: 0, y: 1 }), Math.PI / 2);
});
