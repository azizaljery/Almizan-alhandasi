import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPoint, ndcToPixels } from '../dist/view-projection.mjs';

const close = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) < tolerance;

// eye looking from +z toward the origin, standard up. tan(45°) ≈ 1 keeps the
// expected numbers simple: a point at the frustum edge lands near |1|.
const eye = { x: 0, y: 0, z: 10 }, target = { x: 0, y: 0, z: 0 }, up = { x: 0, y: 1, z: 0 }, fov90 = 90;

test('a point at the look-at target projects to the exact centre of the frame', () => {
  const p = projectPoint(eye, target, up, fov90, 1, { x: 0, y: 0, z: 0 });
  assert.equal(p.visible, true); assert.equal(p.x, 0); assert.equal(p.y, 0);
});

test('a point to the world +x side of the target lands on the positive (right) side of the frame', () => {
  const p = projectPoint(eye, target, up, fov90, 1, { x: 5, y: 0, z: 0 });
  assert.equal(p.visible, true); assert.ok(close(p.x, .5)); assert.equal(p.y, 0);
});

test('a point above the target lands on the positive (up) side, which maps to a smaller pixel top', () => {
  const p = projectPoint(eye, target, up, fov90, 1, { x: 0, y: 5, z: 0 });
  assert.equal(p.visible, true); assert.ok(close(p.y, .5));
  const px = ndcToPixels(p, 800, 600);
  assert.ok(px.top < 300, 'a point above the look-at target must sit above screen centre');
});

test('a point behind the eye (opposite the view direction) is never visible', () => {
  const p = projectPoint(eye, target, up, fov90, 1, { x: 0, y: 0, z: 20 });
  assert.equal(p.visible, false);
});

test('a point in front of the camera but far outside the horizontal field of view is not visible', () => {
  const p = projectPoint(eye, target, up, fov90, 1, { x: 30, y: 0, z: 0 });
  assert.equal(p.visible, false);
});

test('a near-vertical top-down camera (the roof-off top view, never perfectly vertical) keeps mirrored points symmetric', () => {
  // RoomViewer's own top preset clamps phi away from exactly 0, so the eye always keeps a
  // small horizontal offset from the target — this mirrors that, instead of the degenerate
  // perfectly-overhead case where forward and up are parallel and "right" is undefined.
  const topEye = { x: .35, y: 20, z: .2 }, topTarget = { x: 0, y: 0, z: 0 };
  const right = projectPoint(topEye, topTarget, up, 42, 16 / 9, { x: 3, y: 0, z: 0 });
  const left = projectPoint(topEye, topTarget, up, 42, 16 / 9, { x: -3, y: 0, z: 0 });
  assert.equal(right.visible, true); assert.equal(left.visible, true);
  assert.ok(right.x * left.x < 0, 'opposite world sides land on opposite sides of the frame');
  assert.ok(close(right.x, -left.x, .05), 'an offset this small barely breaks the symmetry');
});

test('invalid camera parameters are rejected rather than producing silent NaNs', () => {
  assert.throws(() => projectPoint(eye, target, up, 0, 1, target));
  assert.throws(() => projectPoint(eye, target, up, 180, 1, target));
  assert.throws(() => projectPoint(eye, target, up, fov90, 0, target));
  assert.throws(() => projectPoint(eye, target, up, fov90, -1, target));
});

test('ndcToPixels maps the full [-1,1] range to exact viewport corners and centre', () => {
  assert.deepEqual(ndcToPixels({ x: 0, y: 0 }, 800, 600), { left: 400, top: 300 });
  assert.deepEqual(ndcToPixels({ x: 1, y: 1 }, 800, 600), { left: 800, top: 0 });
  assert.deepEqual(ndcToPixels({ x: -1, y: -1 }, 800, 600), { left: 0, top: 600 });
});
