import { fail, number } from './core.mjs';
const EPS = 1e-8;
export const point = (p, path = 'point', is3D = false) => {
  if (!p || typeof p !== 'object') fail('POINT_REQUIRED', path);
  number(p.x, path + '.x'); number(p.y, path + '.y'); if (is3D) number(p.z, path + '.z'); return p;
};
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
export const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) < EPS && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
export function segmentsIntersect(a, b, c, d) {
  return cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}
export function area(poly) {
  const o = poly[0]; let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += (p.x - o.x) * (q.y - o.y) - (q.x - o.x) * (p.y - o.y); }
  return Math.abs(a / 2);
}
export function polygon(poly, path) {
  if (!Array.isArray(poly) || poly.length < 3 || poly.length > 1000) fail('INVALID_POLYGON', path);
  poly.forEach((p, i) => point(p, `${path}[${i}]`));
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]; if (distance(a, b) < EPS) fail('ZERO_POLYGON_EDGE', path);
    for (let j = i + 1; j < poly.length; j++) {
      if (j === i + 1 || i === 0 && j === poly.length - 1) continue;
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % poly.length])) fail('SELF_INTERSECTION', path);
    }
  }
  number(area(poly), path + '.area', { positive: true }); return poly;
}
export function inside(p, poly, boundary = true) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]; if (onSegment(p, a, b)) return boundary;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
export const inRoom = (p, room) => inside(p, room.polygon) && !(room.holes || []).some(h => inside(p, h));
export function bounds(poly) { return { minX: Math.min(...poly.map(p => p.x)), minY: Math.min(...poly.map(p => p.y)), maxX: Math.max(...poly.map(p => p.x)), maxY: Math.max(...poly.map(p => p.y)) }; }
export function interiorPoint(room) {
  // Scan horizontal slabs; works for concave polygons and holes, unlike a bounding-box centre.
  const rings = [room.polygon, ...(room.holes || [])], ys = [...new Set(rings.flat().map(p => p.y))].sort((a, b) => a - b);
  let best = null, bestWidth = -1;
  for (let k = 1; k < ys.length; k++) {
    const y = (ys[k - 1] + ys[k]) / 2, xs = [];
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) { const p = { x: (xs[i - 1] + xs[i]) / 2, y }; if (inRoom(p, room) && xs[i] - xs[i - 1] > bestWidth) { best = p; bestWidth = xs[i] - xs[i - 1]; } }
  }
  if (!best) fail('NO_INTERIOR', room.id); return best;
}
export function distributePoints(room, count) {
  if (!Number.isInteger(count) || count < 1 || count > 2000) fail('INVALID_POINT_COUNT', room.id);
  const b = bounds(room.polygon), pool = [];
  const n = Math.max(5, Math.ceil(Math.sqrt(count) * 3));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = { x: b.minX + (x + .5) * (b.maxX - b.minX) / n, y: b.minY + (y + .5) * (b.maxY - b.minY) / n };
    if (inRoom(p, room)) pool.push(p);
  }
  if (pool.length < count) fail('POINT_LAYOUT_INCOMPLETE', room.id);
  const c = interiorPoint(room), chosen = [];
  let at = pool.reduce((best, p, i) => distance(p, c) < distance(pool[best], c) ? i : best, 0);
  chosen.push(pool.splice(at, 1)[0]);
  const scores = pool.map(p => distance(p, chosen[0]));
  while (chosen.length < count) {
    at = scores.reduce((best, score, i) => score > scores[best] ? i : best, 0);
    const next = pool.splice(at, 1)[0]; scores.splice(at, 1); chosen.push(next);
    for (let i = 0; i < pool.length; i++) scores[i] = Math.min(scores[i], distance(pool[i], next));
  }
  return chosen;
}
export function segmentBox(a, b, box, expand = 0) {
  let lo = 0, hi = 1;
  for (const key of ['x', 'y', 'z']) {
    const start = a[key], delta = b[key] - start, min = box.min[key] - expand, max = box.max[key] + expand;
    if (Math.abs(delta) < EPS) { if (start < min || start > max) return false; }
    else { const p = (min - start) / delta, q = (max - start) / delta; lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q)); if (lo > hi) return false; }
  }
  return true;
}
export const routeLength = points => points.slice(1).reduce((s, p, i) => s + distance(points[i], p), 0);
export function segmentWithin(a, b, domain) {
  if (!inside(a, domain.polygon) || !inside(b, domain.polygon) || (domain.holes || []).some(h => inside(a, h) || inside(b, h))) return false;
  // Split at every polygon-edge crossing; test all open intervals, not just endpoints.
  const ts = [0, 1], dx = b.x - a.x, dy = b.y - a.y;
  for (const ring of [domain.polygon, ...(domain.holes || [])]) for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], ex = q.x - p.x, ey = q.y - p.y, den = dx * ey - dy * ex;
    if (Math.abs(den) < EPS) continue;
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den, u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  return ts.slice(1).every((t, i) => { const v = (t + ts[i]) / 2, p = { x: a.x + dx * v, y: a.y + dy * v }; return inside(p, domain.polygon) && !(domain.holes || []).some(h => inside(p, h)); });
}
