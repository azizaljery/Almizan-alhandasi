import clip from '../vendor/polygon-clipping.mjs';
import { fail, number } from './core.mjs';
export const EPS = 1e-9;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const on = (a, b, p) => Math.abs(cross(a, b, p)) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
function intersects(a, b, c, d) { return cross(a,b,c) * cross(a,b,d) < -EPS && cross(c,d,a) * cross(c,d,b) < -EPS || on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b); }
export function openRing(raw, path = 'ring') {
  if (!Array.isArray(raw)) fail('RING_REQUIRED', path);
  const points = raw.map((p, i) => { if (!Array.isArray(p) || p.length !== 2) fail('POINT_2D', path); return [number(p[0], path + i), number(p[1], path + i)]; });
  // The native arch duplicates the tangent point. Remove only coincident consecutive vertices.
  const r=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>=EPS);
  if (r.length > 1 && Math.hypot(r[0][0] - r.at(-1)[0], r[0][1] - r.at(-1)[1]) < EPS) r.pop();
  if (r.length < 3 || r.length > 2000) fail('RING_SIZE', path);
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS) fail('ZERO_EDGE', path);
    for (let j = i + 1; j < r.length; j++) if (j !== i + 1 && !(i === 0 && j === r.length - 1) && intersects(a, b, r[j], r[(j + 1) % r.length])) fail('SELF_INTERSECTION', path);
  }
  if (ringArea(r) < EPS) fail('ZERO_AREA', path); return r;
}
export const closeRing = r => [...r.map(p => [...p]), [...r[0]]];
export function signedArea(r) { const o = r[0]; let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += (p[0]-o[0])*(q[1]-o[1])-(q[0]-o[0])*(p[1]-o[1]); } return a/2; }
export const ringArea = r => Math.abs(signedArea(r));
export const multiArea = m => m.reduce((s, p) => s + ringArea(p[0]) - p.slice(1).reduce((q, h) => q + ringArea(h), 0), 0);
export const rect = (u0, z0, u1, z1) => [[u0,z0],[u1,z0],[u1,z1],[u0,z1],[u0,z0]];
export function layerMask(layer) {
  const outer = closeRing(openRing(layer.outer, layer.id + '.outer'));
  const holes = (layer.holes || []).map((h, i) => [closeRing(openRing(h, layer.id + '.holes.' + i))]);
  return holes.length ? clip.difference([outer], ...holes) : [[outer]];
}
export function intersectRect(mask, box) { return clip.intersection(mask, [rect(box.u0, box.z0, box.u1, box.z1)]); }
export function difference(a, b) { return clip.difference(a, b); }
export function intersection(a, b) { return clip.intersection(a, b); }
export function union(...a) { return a.length ? clip.union(...a) : []; }
export function bounds(mask) { const pts = mask.flat(2); return { u0: Math.min(...pts.map(p => p[0])), u1: Math.max(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])), z1: Math.max(...pts.map(p => p[1])) }; }
