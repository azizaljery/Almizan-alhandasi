// Snapping for the drawing editor. Pure: given the document and a raw point it returns the point the pen should land on,
// what it snapped to (so the UI can show it) and the alignment guide lines.
import { dist, closestOnSegment, segmentIntersection, lerp, clean } from '../geom.mjs';

/** A grid step that stays readable at this zoom (px per metre). */
export function gridStep(scale, base = .1) {
  const steps = [.05, .1, .25, .5, 1, 2, 5, 10];
  for (const s of steps) if (s * scale >= 12 && s >= base * .5) return s;
  return 10;
}
export const snapToGrid = (v, step) => clean(Math.round(v / step) * step);

/**
 * snapPoint(doc, levelId, raw, opts)
 *  opts: { scale (px/m), tolPx = 12, grid (m), from (point being drawn from), angleStep (deg, default 45), ortho (force),
 *          off: Set of kinds to skip, ignore: Set of wall ids to skip }
 * -> { p, kind: 'node'|'inter'|'mid'|'edge'|'align'|'ortho'|'grid'|'free', guides: [{ axis:'x'|'y', v }], ref? }
 */
export function snapPoint(doc, levelId, raw, opts = {}) {
  const { scale = 50, tolPx = 12, from = null, angleStep = 45, ortho = false, off = new Set(), ignore = new Set() } = opts;
  const grid = opts.grid ?? gridStep(scale, doc.settings?.grid ?? .1);
  const tol = tolPx / scale;
  const walls = doc.walls.filter(w => w.level === levelId && !ignore.has(w.id) && Math.abs(Math.min(w.a.x, w.b.x) - raw.x) < 1e5);
  const near = walls.filter(w => {
    const minx = Math.min(w.a.x, w.b.x) - tol, maxx = Math.max(w.a.x, w.b.x) + tol, miny = Math.min(w.a.y, w.b.y) - tol, maxy = Math.max(w.a.y, w.b.y) + tol;
    return raw.x >= minx && raw.x <= maxx && raw.y >= miny && raw.y <= maxy;
  });
  const result = (p, kind, extra = {}) => ({ p: { x: clean(p.x), y: clean(p.y) }, kind, guides: [], ...extra });

  // 1. wall ends (nodes)
  if (!off.has('node')) {
    let best = null;
    for (const w of near) for (const e of [w.a, w.b]) { const d = dist(e, raw); if (d <= tol && (!best || d < best.d)) best = { d, p: e }; }
    if (best) return result(best.p, 'node');
  }
  // 2. intersections of walls
  if (!off.has('inter')) {
    let best = null;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const h = segmentIntersection(near[i].a, near[i].b, near[j].a, near[j].b);
      if (h) { const p = lerp(near[i].a, near[i].b, h.t), d = dist(p, raw); if (d <= tol && (!best || d < best.d)) best = { d, p }; }
    }
    if (best) return result(best.p, 'inter');
  }
  // 3. mid points
  if (!off.has('mid')) {
    let best = null;
    for (const w of near) { const m = lerp(w.a, w.b, .5), d = dist(m, raw); if (d <= tol && (!best || d < best.d)) best = { d, p: m, id: w.id }; }
    if (best) return result(best.p, 'mid', { ref: best.id });
  }
  // 4. alignment with existing nodes (x or y), and with the pen's start
  let guides = [], p = { ...raw }, kind = 'free', snappedX = false, snappedY = false;
  if (!off.has('align')) {
    const xs = [], ys = [];
    for (const w of doc.walls) if (w.level === levelId && !ignore.has(w.id)) for (const e of [w.a, w.b]) { if (Math.abs(e.x - raw.x) <= tol) xs.push(e); if (Math.abs(e.y - raw.y) <= tol) ys.push(e); }
    if (from) { if (Math.abs(from.x - raw.x) <= tol) xs.push(from); if (Math.abs(from.y - raw.y) <= tol) ys.push(from); }
    if (xs.length) { xs.sort((a, b) => Math.abs(a.x - raw.x) - Math.abs(b.x - raw.x)); p.x = xs[0].x; snappedX = true; guides.push({ axis: 'x', v: xs[0].x, from: xs[0] }); }
    if (ys.length) { ys.sort((a, b) => Math.abs(a.y - raw.y) - Math.abs(b.y - raw.y)); p.y = ys[0].y; snappedY = true; guides.push({ axis: 'y', v: ys[0].y, from: ys[0] }); }
    if (snappedX || snappedY) kind = 'align';
  }
  // 5. on a wall (edge)
  if (!off.has('edge') && !(snappedX && snappedY)) {
    let best = null;
    for (const w of near) { const c = closestOnSegment(raw, w.a, w.b); if (c.dist <= tol * .7 && (!best || c.dist < best.d)) best = { d: c.dist, p: c.point, id: w.id }; }
    if (best) return result(best.p, 'edge', { ref: best.id });
  }
  // 6. angle from the start of the line being drawn
  if (from && !off.has('ortho')) {
    const dx = raw.x - from.x, dy = raw.y - from.y, L = Math.hypot(dx, dy);
    if (L > 1e-6) {
      const step = angleStep * Math.PI / 180, ang = Math.atan2(dy, dx), snapped = Math.round(ang / step) * step;
      const closeEnough = ortho || Math.abs(ang - snapped) * L <= tol * 1.2 || Math.abs(ang - snapped) < 3.5 * Math.PI / 180;
      if (closeEnough && !(snappedX && snappedY)) {
        const dir = { x: Math.cos(snapped), y: Math.sin(snapped) };
        const along = dx * dir.x + dy * dir.y;
        let len = along;
        if (grid && !snappedX && !snappedY) len = Math.round(along / grid) * grid;
        let q = { x: from.x + dir.x * len, y: from.y + dir.y * len };
        // keep alignment to a node when it lies on the angle line
        if (snappedX && Math.abs(dir.x) > 1e-6) { const t = (p.x - from.x) / dir.x; q = { x: p.x, y: from.y + dir.y * t }; }
        else if (snappedY && Math.abs(dir.y) > 1e-6) { const t = (p.y - from.y) / dir.y; q = { x: from.x + dir.x * t, y: p.y }; }
        return result(q, 'ortho', { guides, angle: snapped, length: Math.hypot(q.x - from.x, q.y - from.y) });
      }
    }
  }
  if (snappedX || snappedY) {
    if (!snappedX) p.x = snapToGrid(p.x, grid);
    if (!snappedY) p.y = snapToGrid(p.y, grid);
    return result(p, 'align', { guides });
  }
  if (!off.has('grid')) return result({ x: snapToGrid(raw.x, grid), y: snapToGrid(raw.y, grid) }, 'grid');
  return result(raw, 'free');
}

/** Nearest wall to a point (for placing doors and windows): { wall, at (m from a), dist } or null. */
export function nearestWall(doc, levelId, p, maxDist) {
  let best = null;
  for (const w of doc.walls) {
    if (w.level !== levelId) continue;
    const c = closestOnSegment(p, w.a, w.b), d = c.dist - w.t / 2;
    if (d <= maxDist && (!best || c.dist < best.dist)) best = { wall: w, at: c.t * dist(w.a, w.b), dist: c.dist, point: c.point };
  }
  return best;
}

export default { gridStep, snapToGrid, snapPoint, nearestWall };
