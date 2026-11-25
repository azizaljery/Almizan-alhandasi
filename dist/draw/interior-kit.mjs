// Geometry toolkit for the rich interior furniture (interior-furniture.mjs): rounded boxes, lens-shaped pillows, lathe-turned legs and vessels, tubes along curves,
// leaves, all box-UV'd in metres so tiling textures keep a constant scale. Every mesh is a plain THREE.Mesh in a THREE.Group; scene3d merges them by material.
// Conventions (same as fixtures3d): origin = middle of the footprint on the floor, +x width, +y up, FRONT faces +z.
import { roundedBoxGeometry } from './fixtures3d.mjs';

export function metreUV(THREE, geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * Box with a genuinely round edge: a 6x6x6 grid whose coordinates crowd towards the edges so each quarter-round gets 2 segments, positions = inner box + r * unit direction
 * (analytic normals). 432 triangles. Used for upholstered parts, where the 3-segment chamfer of roundedBoxGeometry reads as faceted.
 */
export function softBoxGeometry(THREE, w, h, d, r = .05) {
  r = Math.max(.004, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  // small radii (< 7 cm: arm bases, plinths, trims) use a 4-grid with one smooth-shaded segment per quarter-round (192 triangles instead of 432); the silhouette difference is below a centimetre
  const coarse = r < .07, N = coarse ? 4 : 6, geo = new THREE.BoxGeometry(2, 2, 2, N, N, N), pos = geo.attributes.position, nor = geo.attributes.normal;
  const P = coarse ? [-1, -.7, 0, .7, 1] : [-1, -.92, -.7, 0, .7, .92, 1], Z0 = .7, hx = w / 2, hy = h / 2, hz = d / 2, ix = hx - r, iy = hy - r, iz = hz - r;
  const prof = u => { const k = Math.round((u + 1) * N / 2); return P[Math.max(0, Math.min(N, k))]; }; // uniform grid step is 1/3 -> index 0..6
  const ax = (u, inner) => { const a = Math.abs(u), sg = Math.sign(u) || 1; if (a <= Z0) return [u / Z0 * inner, 0]; const s = (a - Z0) / (1 - Z0); return [sg * inner, sg * Math.sin(s * Math.PI / 2)]; };
  for (let i = 0; i < pos.count; i++) {
    const [cx, dx] = ax(prof(pos.getX(i)), ix), [cy, dy] = ax(prof(pos.getY(i)), iy), [cz, dz] = ax(prof(pos.getZ(i)), iz), l = Math.hypot(dx, dy, dz) || 1;
    pos.setXYZ(i, cx + r * dx / l, cy + r * dy / l, cz + r * dz / l);
    if (dx || dy || dz) nor.setXYZ(i, dx / l, dy / l, dz / l);
  }
  return geo;
}

/** Soft cushion: a rounded box squeezed towards its corners (lens section) so it reads as stuffed fabric, not a block. */
export function pillowGeometry(THREE, w, h, d, { r = null, pinch = .38, crown = 0, low = false } = {}) {
  const rr = r ?? Math.min(h * .46, w * .2, d * .2), geo = low ? roundedBoxGeometry(THREE, w, h, d, rr) : softBoxGeometry(THREE, w, h, d, rr);
  const pos = geo.attributes.position, hx = w / 2, hz = d / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / hx, z = pos.getZ(i) / hz, q = (x * x + z * z) / 2, y = pos.getY(i);
    pos.setY(i, y * (1 - pinch * q) + Math.sign(y) * crown * h * (1 - q) * .5);
  }
  return geo;
}

/** Everything a furniture builder needs, bound to one Group and one material map. */
export function makeKit(THREE, mats, name, { low = false } = {}) {
  const g = new THREE.Group(); g.name = name;
  const M = n => (typeof n === 'string' ? (mats[n] || mats.fallback) : n);
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent = g) => {
    metreUV(THREE, geo);
    const m = new THREE.Mesh(geo, M(mat)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  // x,y0,z = centre x, BOTTOM y, centre z
  const box = (mat, sx, sy, sz, x, y0, z, ry = 0, rx = 0, rz = 0) => add(new THREE.BoxGeometry(sx, sy, sz), mat, x, y0 + sy / 2, z, rx, ry, rz);
  const rbox = (mat, sx, sy, sz, r, x, y0, z, ry = 0, rx = 0, rz = 0) => add(r >= .028 && !low ? softBoxGeometry(THREE, sx, sy, sz, r) : roundedBoxGeometry(THREE, sx, sy, sz, r), mat, x, y0 + sy / 2, z, rx, ry, rz);
  const cush = (mat, sx, sy, sz, x, y0, z, ry = 0, rx = 0, rz = 0, o = {}) => add(pillowGeometry(THREE, sx, sy, sz, { ...o, low }), mat, x, y0 + sy / 2, z, rx, ry, rz);
  const cyl = (mat, rt, rb, hh, x, y0, z, seg = 12, rx = 0, rz = 0, ry = 0) => add(new THREE.CylinderGeometry(rt, rb, hh, seg), mat, x, y0 + hh / 2, z, rx, ry, rz);
  const sph = (mat, rx_, ry_, rz_, x, y, z, ws = 8, hs = 6) => add(new THREE.SphereGeometry(1, ws, hs), mat, x, y, z, 0, 0, 0, rx_, ry_, rz_);
  const tor = (mat, R, r, x, y, z, rx = Math.PI / 2, ry = 0, rz = 0, rs = 6, ts = 18, sx = 1, sy = 1, sz = 1) => add(new THREE.TorusGeometry(R, r, rs, ts), mat, x, y, z, rx, ry, rz, sx, sy, sz);
  /** thin rod between two points */
  const rod = (mat, ax, ay, az, bx, by, bz, r = .01, seg = 6) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1e-6, m = add(new THREE.CylinderGeometry(r, r, len, seg), mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)); m.rotation.setFromQuaternion(m.quaternion); return m;
  };
  /** lathe-turned body of revolution; pts = [[radius, height], ...] from the bottom up */
  const lathe = (mat, pts, x, y0, z, seg = 12, sx = 1, sz = 1) => add(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat, x, y0, z, 0, 0, 0, sx, 1, sz);
  /** tube along a Catmull-Rom path of [x,y,z] points */
  const tube = (mat, path, r = .01, segs = 14, rad = 5) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(...p))), segs, r, rad, false), mat, 0, 0, 0);
  /** a pointed leaf (planar outline bent into a cup + droop), base at the origin, length along +y, double-sided material expected */
  const leaf = (mat, len, wid, x, y, z, yaw = 0, pitch = 0, roll = 0, cup = .5, droop = .35) => {
    const sh = new THREE.Shape(), N = 7; sh.moveTo(0, 0);
    for (let i = 1; i <= N; i++) { const t = i / N; sh.lineTo(wid * .5 * Math.pow(Math.sin(Math.PI * Math.pow(t, .75)), .9), len * t); }
    for (let i = N - 1; i >= 1; i--) { const t = i / N; sh.lineTo(-wid * .5 * Math.pow(Math.sin(Math.PI * Math.pow(t, .75)), .9), len * t); }
    const geo = new THREE.ShapeGeometry(sh, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i); p.setZ(i, cup * px * px / Math.max(wid, 1e-3) - droop * (py / len) * (py / len) * len * .5); }
    geo.computeVertexNormals();
    const m = add(geo, mat, x, y, z); m.rotation.order = 'YXZ'; m.rotation.set(pitch, yaw, roll); return m;
  };
  /** sub-group placed at (x, z) with a yaw, for objects that rotate as a unit (chairs around a table) */
  const sub = (x, y, z, ry = 0) => { const s = new THREE.Group(); s.position.set(x, y, z); s.rotation.y = ry; g.add(s); return s; };
  return { THREE, g, M, add, box, rbox, cush, cyl, sph, tor, rod, lathe, tube, leaf, sub };
}

/** [radius, y] profile of a classic turned leg of height h (foot, ball, taper, collar) */
export const turnedLeg = (h, r = .03) => [[r * .55, 0], [r * .75, h * .04], [r * .5, h * .1], [r * .62, h * .22], [r * .9, h * .3], [r * .55, h * .42], [r * .5, h * .7], [r * .8, h * .82], [r * .85, h * .9], [r * .7, h]];
