// Tiny geometry accumulator: collects triangles per material key and turns them into ONE BufferGeometry
// per key (so a whole level is a few dozen draw calls).  Everything except toGeometries()/addGeometry()
// is pure JavaScript (no THREE) so it can be unit tested.
//
// 3D convention used by the whole 3D engine: plan (x, y) metres -> three (x, up, -y).

export const P3 = (x, y, h = 0) => [x, h, -y]; // plan point + height -> three position

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class MeshBuilder {
  constructor(THREE = null) { this.THREE = THREE; this.buckets = new Map(); }

  bucket(key, { color = false, alpha = false, uv1 = false } = {}) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { key, pos: [], nor: [], uv: [], uv1: uv1 ? [] : null, col: color || alpha ? [] : null, alpha: !!alpha, idx: [], count: 0, tags: [] };
      this.buckets.set(key, b);
    }
    return b;
  }

  /** Remember that triangles added to `key` from now on belong to `tag` (for picking: see tagAt). */
  mark(key, tag, opts) { const b = this.bucket(key, opts); b.tags.push({ at: b.idx.length / 3, tag }); }

  /** Low level: add a vertex. */
  vertex(b, p, n, uv, col, uv1) {
    b.pos.push(p[0], p[1], p[2]); b.nor.push(n[0], n[1], n[2]); b.uv.push(uv[0], uv[1]);
    if (b.uv1) b.uv1.push(...(uv1 || uv));
    if (b.col) { const c = col || [1, 1, 1, 1]; b.col.push(c[0], c[1], c[2]); if (b.alpha) b.col.push(c[3] ?? 1); }
    return b.count++;
  }

  tri(key, p0, p1, p2, n, uvs, cols, opts) {
    const b = this.bucket(key, opts);
    const gn = cross3(sub3(p1, p0), sub3(p2, p0));
    let order = [0, 1, 2];
    if (n && dot3(gn, n) < 0) order = [0, 2, 1];
    const nn = n || norm3(gn), P = [p0, p1, p2];
    const ids = order.map(i => this.vertex(b, P[i], nn, uvs ? uvs[i] : [0, 0], cols ? cols[i] : null));
    b.idx.push(ids[0], ids[1], ids[2]);
  }

  /** Quad p0..p3 (a loop, either winding); auto-oriented so that its front faces `n` (or by the loop order when n is absent). */
  quad(key, p0, p1, p2, p3, n, uvs, cols, opts) {
    const b = this.bucket(key, opts);
    const gn = cross3(sub3(p1, p0), sub3(p3, p0));
    const flip = n ? dot3(gn, n) < 0 : false;
    const nn = n ? norm3(n) : norm3(gn);
    const P = [p0, p1, p2, p3], U = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
    const ids = order.map(i => this.vertex(b, P[i], nn, U[i], cols ? cols[i] : null));
    b.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }

  /** Planar polygon given as 3D points (convex or star shaped about its first vertex) -> triangle fan, auto-oriented. */
  fan(key, pts, n, uvOf, opts, col = null) {
    const b = this.bucket(key, opts);
    const nn = n ? norm3(n) : norm3(cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0])));
    const ids = pts.map(p => this.vertex(b, p, nn, uvOf(p), col));
    for (let i = 1; i + 1 < pts.length; i++) {
      const gn = cross3(sub3(pts[i], pts[0]), sub3(pts[i + 1], pts[0]));
      if (dot3(gn, nn) >= 0) b.idx.push(ids[0], ids[i], ids[i + 1]); else b.idx.push(ids[0], ids[i + 1], ids[i]);
    }
  }

  /**
   * Axis-aligned (about Y) box.  centre (cx,cy,cz) size (sx,sy,sz) rotated by `ry` about the vertical axis through (px,pz).
   * keys: single key or {top,bottom,side,front,back,left,right}.  UVs in metres.
   */
  box(keys, cx, cy, cz, sx, sy, sz, ry = 0, opts = {}) {
    const k = typeof keys === 'string' ? { all: keys } : keys;
    const kk = f => k[f] ?? (['front', 'back', 'left', 'right'].includes(f) ? k.side : undefined) ?? k.all;
    const c = Math.cos(ry), s = Math.sin(ry), px = opts.px ?? cx, pz = opts.pz ?? cz;
    const T = (x, y, z) => { const dx = x - px, dz = z - pz; return [px + dx * c + dz * s, y, pz - dx * s + dz * c]; };
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    const Nrm = (nx, ny, nz) => [nx * c + nz * s, 0, -nx * s + nz * c];
    const faces = [
      ['top', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], sx, sz],
      ['bottom', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], sx, sz],
      ['front', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], Nrm(0, 0, 1), sx, sy],
      ['back', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], Nrm(0, 0, -1), sx, sy],
      ['right', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], Nrm(1, 0, 0), sz, sy],
      ['left', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], Nrm(-1, 0, 0), sz, sy],
    ];
    const up = [[0, 1, 0], [0, -1, 0]];
    for (const [name, a, b, c2, d, n, u, v] of faces) {
      const key = kk(name); if (!key || key === 'none') continue;
      const nn = name === 'top' ? up[0] : name === 'bottom' ? up[1] : norm3(n);
      const o = opts.uvOffset || [0, 0];
      this.quad(key, T(...a), T(...b), T(...c2), T(...d), nn, [[o[0], o[1]], [o[0] + u, o[1]], [o[0] + u, o[1] + v], [o[0], o[1] + v]], opts.color ? [opts.color, opts.color, opts.color, opts.color] : null, opts.bucket);
    }
  }

  /** Vertical prism over a plan polygon (CCW or CW) between heights y0..y1: caps are triangle-fan-free via earcut-lite ear clipping. */
  prism(keys, poly, y0, y1, opts = {}) {
    const k = typeof keys === 'string' ? { all: keys } : keys;
    const pts = poly.map(p => ({ x: p.x, y: p.y }));
    const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
    const ccw = area > 0 ? pts : [...pts].reverse(); // plan CCW
    const n = ccw.length;
    if (k.side || k.all) {
      let u = 0;
      for (let i = 0; i < n; i++) {
        const a = ccw[i], b = ccw[(i + 1) % n], len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-9) continue;
        const nx = (b.y - a.y) / len, ny = -(b.x - a.x) / len; // outward for CCW plan polygon
        this.quad(k.side || k.all, P3(a.x, a.y, y0), P3(b.x, b.y, y0), P3(b.x, b.y, y1), P3(a.x, a.y, y1), [nx, 0, -ny], [[u, 0], [u + len, 0], [u + len, y1 - y0], [u, y1 - y0]]);
        u += len;
      }
    }
    for (const [name, h, ny] of [['top', y1, 1], ['bottom', y0, -1]]) {
      const key = k[name] || k.all; if (!key || key === 'none') continue;
      const tris = earClip(ccw);
      const b = this.bucket(key, opts.bucket);
      const ids = ccw.map(p => this.vertex(b, [p.x, h, -p.y], [0, ny, 0], [p.x, -p.y], null));
      for (const [i, j, l] of tris) { if (ny > 0) b.idx.push(ids[i], ids[j], ids[l]); else b.idx.push(ids[i], ids[l], ids[j]); }
    }
  }

  /** Square-section bar from 3D point a to b; `tw` = width (horizontal-ish), `th` = thickness. */
  beam(key, a, b, tw, th, opts) {
    const d = norm3(sub3(b, a)); if (!Number.isFinite(d[0])) return;
    let s = cross3([0, 1, 0], d); if (Math.hypot(...s) < 1e-4) s = [1, 0, 0]; s = norm3(s);
    const u = norm3(cross3(d, s)), hw = tw / 2, ht = th / 2;
    const C = (p, i, j) => [p[0] + s[0] * hw * i + u[0] * ht * j, p[1] + s[1] * hw * i + u[1] * ht * j, p[2] + s[2] * hw * i + u[2] * ht * j];
    const A = [C(a, -1, -1), C(a, 1, -1), C(a, 1, 1), C(a, -1, 1)], B = [C(b, -1, -1), C(b, 1, -1), C(b, 1, 1), C(b, -1, 1)];
    const len = Math.hypot(...sub3(b, a));
    const side = (i, j, n) => this.quad(key, A[i], B[i], B[j], A[j], n, [[0, 0], [len, 0], [len, tw], [0, tw]], null, opts);
    side(0, 1, [-u[0], -u[1], -u[2]]); side(1, 2, s); side(2, 3, u); side(3, 0, [-s[0], -s[1], -s[2]]);
    this.quad(key, A[0], A[1], A[2], A[3], [-d[0], -d[1], -d[2]], null, null, opts);
    this.quad(key, B[0], B[1], B[2], B[3], d, null, null, opts);
  }

  /** Flat horizontal polygon with holes (plan coordinates) at height y; ny = +1 faces up, -1 faces down. Needs THREE.ShapeUtils. */
  flatPoly(key, outer, holes, y, ny, uvOf, opts = {}) {
    const THREE = this.THREE, b = this.bucket(key, opts.bucket);
    const all = [...outer, ...holes.flat()];
    const tris = THREE.ShapeUtils.triangulateShape(outer.map(p => new THREE.Vector2(p.x, p.y)), holes.map(h => h.map(p => new THREE.Vector2(p.x, p.y))));
    const ids = all.map(p => this.vertex(b, [p.x, y, -p.y], [0, ny, 0], uvOf ? uvOf(p) : [p.x, -p.y], null, opts.uv1Of ? opts.uv1Of(p) : null));
    for (const [i, j, l] of tris) {
      const A = all[i], B = all[j], C = all[l];
      const area = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x); // >0: CCW in plan = facing up
      if ((area > 0) === (ny > 0)) b.idx.push(ids[i], ids[j], ids[l]); else b.idx.push(ids[i], ids[l], ids[j]);
    }
  }

  /** Merge a THREE.BufferGeometry (with position/normal/uv) transformed by a THREE.Matrix4 into `key`. */
  addGeometry(key, geometry, matrix, opts) {
    const THREE = this.THREE;
    const b = this.bucket(key, opts);
    const pos = geometry.attributes.position, nor = geometry.attributes.normal, uv = geometry.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    const base = b.count;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      if (nor) nv.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else nv.set(0, 1, 0);
      b.pos.push(v.x, v.y, v.z); b.nor.push(nv.x, nv.y, nv.z);
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      if (b.uv1) b.uv1.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      if (b.col) { b.col.push(1, 1, 1); if (b.alpha) b.col.push(1); }
      b.count++;
    }
    const flip = matrix.determinant() < 0;
    const idx = geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, c = idx ? idx.getX(i + 1) : i + 1, d = idx ? idx.getX(i + 2) : i + 2;
      if (flip) b.idx.push(base + a, base + d, base + c); else b.idx.push(base + a, base + c, base + d);
    }
  }

  /** Merge every mesh of a THREE.Object3D (world matrices) bucketed by material (looked up in `keyOf`). */
  addObject(root, keyOf, parentMatrix = null) {
    const THREE = this.THREE;
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh) return;
      const key = keyOf(o.material, o); if (!key) return;
      const m = parentMatrix ? new THREE.Matrix4().multiplyMatrices(parentMatrix, o.matrixWorld) : o.matrixWorld;
      this.addGeometry(key, o.geometry, m);
    });
  }

  get triangleCount() { let n = 0; for (const b of this.buckets.values()) n += b.idx.length / 3; return n; }

  toGeometries() {
    const THREE = this.THREE, out = new Map();
    for (const b of this.buckets.values()) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      if (b.uv1) g.setAttribute('uv1', new THREE.Float32BufferAttribute(b.uv1, 2));
      if (b.col) g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, b.alpha ? 4 : 3));
      g.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox(); if (b.tags.length) g.userData.tags = b.tags;
      out.set(b.key, g);
    }
    return out;
  }
}

/** Ear clipping for a simple CCW plan polygon; returns index triples. */
export function earClip(poly) {
  const n = poly.length;
  if (n < 3) return [];
  const idx = poly.map((_, i) => i), tris = [];
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inTri = (p, a, b, c) => cross(a, b, p) >= -1e-12 && cross(b, c, p) >= -1e-12 && cross(c, a, p) >= -1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cross(a, b, c) <= 1e-12) continue;
      if (idx.some(j => j !== ia && j !== ib && j !== ic && inTri(poly[j], a, b, c))) continue;
      tris.push([ia, ib, ic]); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/** Tag recorded by MeshBuilder.mark() for triangle number `face` (binary search over the ordered tag list). */
export function tagAt(tags, face) {
  if (!tags || !tags.length) return null;
  let lo = 0, hi = tags.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (tags[mid].at <= face) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found >= 0 ? tags[found].tag : null;
}

export default { MeshBuilder, earClip, P3, tagAt };
