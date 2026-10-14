// Pure perspective-projection math for placing DOM labels over the 3D view.
// Deliberately independent of THREE.js matrices (no camera.matrixWorld, no
// Vector3.project): it rebuilds the same look-at camera basis from plain
// {x,y,z} vectors, so it stays unit-testable without a WebGL/DOM double and
// without duplicating the fake-THREE test setup used for RoomViewer.
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = a => { const l = Math.hypot(a.x, a.y, a.z); return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 }; };

/**
 * Projects a world point into normalized device coordinates ([-1,1] on each
 * axis, +x right, +y up) for a look-at camera defined only by eye/target/up,
 * a vertical field of view in degrees, and the viewport aspect (width/height).
 * `visible` is false for points behind the eye or outside a small margin
 * past the frustum edges; x/y are still returned (0,0) in that case so a
 * caller can skip rendering without special-casing undefined numbers.
 */
export function projectPoint(eye, target, up, fovDeg, aspect, point) {
  if (!(fovDeg > 0 && fovDeg < 180) || !(aspect > 0)) throw Error('معطيات الكاميرا غير صالحة.');
  const forward = norm(sub(target, eye));
  const right = norm(cross(forward, up));
  const trueUp = cross(right, forward);
  const rel = sub(point, eye);
  const cx = dot(rel, right), cy = dot(rel, trueUp), cz = dot(rel, forward);
  if (!(cz > 1e-4)) return { visible: false, x: 0, y: 0 };
  const tanHalfFov = Math.tan(fovDeg * Math.PI / 360);
  const x = cx / (cz * tanHalfFov * aspect), y = cy / (cz * tanHalfFov);
  return { visible: Math.abs(x) <= 1.08 && Math.abs(y) <= 1.08, x, y };
}

/** Converts projectPoint's NDC output to CSS pixel offsets within a width×height overlay. */
export function ndcToPixels(ndc, width, height) {
  return { left: (ndc.x * .5 + .5) * width, top: (1 - (ndc.y * .5 + .5)) * height };
}
