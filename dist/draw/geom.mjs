// Small 2D geometry kit for the drawing studio. Plan coordinates are metres,
// x to the right and y UP (the SVG layer flips y once). Pure; no DOM.

export const EPS = 1e-9;
export const NODE_TOL = 0.005; // 5 mm: points closer than this are the same node

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = a => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const norm = a => { const l = len(a); return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }; };
export const perp = a => ({ x: -a.y, y: a.x }); // 90 degrees counter-clockwise
export const rotate = (p, angle, about = { x: 0, y: 0 }) => {
  const c = Math.cos(angle), s = Math.sin(angle), d = sub(p, about);
  return { x: about.x + d.x * c - d.y * s, y: about.y + d.x * s + d.y * c };
};
export const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const same = (a, b, tol = NODE_TOL) => dist(a, b) <= tol;
export const round = (v, step) => Math.round(v / step) * step;
export const clean = v => Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e9) / 1e9;
export const pt = p => ({ x: clean(p.x), y: clean(p.y) });

/** Closest point of segment ab to p. */
export function closestOnSegment(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = add(a, mul(ab, t));
  return { point, t, dist: dist(p, point) };
}

/** Proper or touching intersection of segments pq and rs; null when parallel. */
export function segmentIntersection(p, q, r, s, tol = 1e-9) {
  const d1 = sub(q, p), d2 = sub(s, r), den = cross(d1, d2);
  if (Math.abs(den) < 1e-12) return null;
  const w = sub(r, p), t = cross(w, d2) / den, u = cross(w, d1) / den;
  if (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)), point: add(p, mul(d1, t)) };
}

/** Intersection of two infinite lines (point + direction); null when parallel. */
export function lineIntersection(p1, d1, p2, d2) {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, mul(d1, t));
}

export const signedArea = poly => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
};
export const area = poly => Math.abs(signedArea(poly));
export const perimeter = poly => poly.reduce((s, p, i) => s + dist(p, poly[(i + 1) % poly.length]), 0);
export const ccw = poly => signedArea(poly) < 0 ? [...poly].reverse() : [...poly];

export function centroid(poly) {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-12) return poly.length ? { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length } : { x: 0, y: 0 };
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], f = p.x * q.y - q.x * p.y; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f; }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}
export function bounds(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return points.length ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
}

/** Even-odd point in polygon. Points on the boundary count as inside. */
export function pointInPolygon(p, poly, tol = 1e-9) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (closestOnSegment(p, a, b).dist <= tol) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A point guaranteed to lie strictly inside a simple polygon (centroid when inside, else a scan-line midpoint). */
export function interiorPoint(poly) {
  const c = centroid(poly);
  if (pointInPolygon(c, poly) && poly.every((p, i) => closestOnSegment(c, p, poly[(i + 1) % poly.length]).dist > 1e-6)) return c;
  const b = bounds(poly);
  for (const f of [.5, .37, .63, .25, .75, .12, .88]) {
    const y = b.y0 + b.h * f, xs = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      if ((p.y > y) !== (q.y > y)) xs.push(p.x + (y - p.y) * (q.x - p.x) / (q.y - p.y));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) return { x: (xs[i] + xs[i + 1]) / 2, y };
  }
  return c;
}

/**
 * Offset a CCW polygon inwards: edge i moves in by dists[i] (a single number applies to all).
 * Adjacent offset lines are re-intersected (mitre). Returns null when the result collapses.
 */
export function insetPolygon(poly, dists, { grow = false } = {}) {
  const n = poly.length;
  if (n < 3) return null;
  const d = Array.isArray(dists) ? dists : poly.map(() => dists);
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n], dir = norm(sub(q, p)), inward = perp(dir); // CCW polygon: interior is to the left
    return { p: add(p, mul(inward, d[i])), dir };
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const hit = lineIntersection(a.p, a.dir, b.p, b.dir);
    out.push(hit && dist(hit, poly[i]) < 50 ? hit : add(b.p, mul(b.dir, 0)));
  }
  const result = out.map(pt);
  const before = signedArea(poly), after = signedArea(result);
  if (!(after > 1e-6) || (!grow && after > before + 1e-6)) return null;
  return result;
}

/** Sutherland-style test: does polygon `inner` lie inside polygon `outer` (all vertices inside or on)? */
export const polygonInside = (inner, outer) => inner.every(p => pointInPolygon(p, outer, 1e-7));

/** Angle between directions in [0, PI]. */
export const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b)))));

/** Snap a direction to the nearest multiple of `step` radians from `from`, keeping length. */
export function snapAngle(from, to, step = Math.PI / 4) {
  const v = sub(to, from), l = len(v);
  if (l < EPS) return { ...to };
  const a = Math.round(Math.atan2(v.y, v.x) / step) * step;
  return { x: from.x + Math.cos(a) * l, y: from.y + Math.sin(a) * l };
}

export default { EPS, NODE_TOL, add, sub, mul, dot, cross, len, dist, lerp, norm, perp, rotate, angleOf, same, round, clean, pt, closestOnSegment, segmentIntersection, lineIntersection, signedArea, area, perimeter, ccw, centroid, bounds, pointInPolygon, interiorPoint, insetPolygon, polygonInside, angleBetween, snapAngle };
