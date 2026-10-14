// Hit testing and rectangle selection for the drawing editor (pure).
import { closestOnSegment, dist, rotate, pointInPolygon, sub, norm, dot } from '../geom.mjs';
import { fixtureRect } from '../review.mjs';

const inRect = (p, c, w, d, rot) => { const r = rotate({ x: p.x - c.x, y: p.y - c.y }, -rot); return Math.abs(r.x) <= w / 2 && Math.abs(r.y) <= d / 2; };

/** Stair footprint (see stairs3d: (x,y) is the middle of the first riser, climbing along local +y, rot clockwise). */
export function stairBox(s) {
  const r = s.rot || 0, f = { x: Math.sin(r), y: Math.cos(r) }, q = { x: Math.cos(r), y: -Math.sin(r) }, w = s.w ?? 1.1, run = s.run ?? 3.2;
  const L = s.kind === 'L' ? Math.max(w, run - w) + w : s.kind === 'U' ? Math.max(w, run - w) + w : run;
  const wide = s.kind === 'L' ? w + Math.max(w * 1.2, run * .55) : s.kind === 'U' ? (w * 2 + .1) : w;
  const side = s.flip ? -1 : 1;
  const a0 = s.kind === 'straight' || !s.kind ? -w / 2 : (side > 0 ? -w / 2 : -(wide - w / 2)), a1 = a0 + wide;
  const to = (a, b) => ({ x: s.x + q.x * a + f.x * b, y: s.y + q.y * a + f.y * b });
  return [to(a0, 0), to(a1, 0), to(a1, L), to(a0, L)];
}

/** What is under point p (world metres) on this level? -> { kind, id } | null. `px` = metres per screen pixel. */
export function hitItem(doc, levelId, p, px = .02, { skip = new Set() } = {}) {
  const tol = 7 * px;
  const L = o => o.level === levelId && !skip.has(o.id);
  // openings sit on walls: test them before walls
  for (const o of doc.openings) {
    if (!L(o)) continue;
    const w = doc.walls.find(x => x.id === o.wall); if (!w) continue;
    const c = closestOnSegment(p, w.a, w.b), along = c.t * dist(w.a, w.b);
    if (c.dist <= Math.max(w.t / 2 + 2 * px, tol) && Math.abs(along - o.at) <= o.w / 2) return { kind: 'openings', id: o.id };
  }
  for (const f of doc.fixtures) if (L(f) && inRect(p, f, f.w + 2 * px, f.d + 2 * px, f.rot || 0)) return { kind: 'fixtures', id: f.id };
  for (const c of doc.columns) if (L(c) && Math.abs(p.x - c.x) <= c.size / 2 + tol && Math.abs(p.y - c.y) <= c.size / 2 + tol) return { kind: 'columns', id: c.id };
  for (const s of doc.stairs) if (L(s) && pointInPolygon(p, stairBox(s))) return { kind: 'stairs', id: s.id };
  for (const t of doc.texts) if (L(t) && dist(p, t.at) <= Math.max(.35, (t.size || .3) * 2)) return { kind: 'texts', id: t.id };
  for (const l of doc.labels) if (L(l) && dist(p, l.seed) <= 12 * px) return { kind: 'labels', id: l.id };
  for (const d of doc.dimensions) {
    if (!L(d)) continue;
    const u = norm(sub(d.b, d.a)), n = { x: -u.y, y: u.x }, off = d.offset ?? .6;
    const a = { x: d.a.x + n.x * off, y: d.a.y + n.y * off }, b = { x: d.b.x + n.x * off, y: d.b.y + n.y * off };
    if (closestOnSegment(p, a, b).dist <= tol) return { kind: 'dimensions', id: d.id };
  }
  let best = null;
  for (const w of doc.walls) {
    if (!L(w)) continue;
    const c = closestOnSegment(p, w.a, w.b);
    if (c.dist <= Math.max(w.t / 2, tol) && (!best || c.dist < best.d)) best = { d: c.dist, id: w.id };
  }
  return best ? { kind: 'walls', id: best.id } : null;
}

/** Wall end under p (within tol): { wall, end:'a'|'b', p } — used for dragging corners. */
export function hitNode(doc, levelId, p, px = .02) {
  const tol = 9 * px; let best = null;
  for (const w of doc.walls) if (w.level === levelId) for (const end of ['a', 'b']) { const d = dist(w[end], p); if (d <= tol && (!best || d < best.d)) best = { d, wall: w, end, p: w[end] }; }
  return best;
}

const inBox = (p, b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
/** Ids fully inside the box (window) or touching it (crossing). */
export function itemsInBox(doc, levelId, box, crossing = false) {
  const ids = [];
  const segHits = (a, b) => {
    if (inBox(a, box) && inBox(b, box)) return true;
    if (!crossing) return false;
    if (inBox(a, box) || inBox(b, box)) return true;
    const P = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
    for (let i = 0; i < 4; i++) { const c = P[i], d = P[(i + 1) % 4]; const r = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x); if (Math.abs(r) < 1e-12) continue; const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / r, u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / r; if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true; }
    return false;
  };
  for (const w of doc.walls) if (w.level === levelId && segHits(w.a, w.b)) ids.push(w.id);
  const wallSel = new Set(ids);
  for (const o of doc.openings) if (o.level === levelId && wallSel.has(o.wall)) ids.push(o.id);
  for (const f of doc.fixtures) if (f.level === levelId && inBox(f, box)) ids.push(f.id);
  for (const s of doc.stairs) if (s.level === levelId && inBox(s, box)) ids.push(s.id);
  for (const c of doc.columns) if (c.level === levelId && inBox(c, box)) ids.push(c.id);
  for (const l of doc.labels) if (l.level === levelId && inBox(l.seed, box)) ids.push(l.id);
  for (const t of doc.texts) if (t.level === levelId && inBox(t.at, box)) ids.push(t.id);
  for (const d of doc.dimensions) if (d.level === levelId && inBox(d.a, box) && inBox(d.b, box)) ids.push(d.id);
  return ids;
}

export default { hitItem, hitNode, itemsInBox, stairBox };
