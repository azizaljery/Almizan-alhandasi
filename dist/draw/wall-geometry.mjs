// Gap-free wall solids for one level of a `mizan-draw/1` document.  PURE: no THREE, no DOM.
//
// Walls are drawn as centre-lines with a thickness.  This module
//   1. splits them at every junction (T, X, L) into *segments* between nodes,
//   2. mitres the offset lines of all segments meeting at a node, so that corners and
//      T / X junctions close with no gap and no overlap (free ends get flat caps),
//   3. cuts the openings (doors, windows, arches, sliders, garage doors) out of the
//      segments as separate wall *pieces*: piers, lintel above, sill below.
//
// Plan coordinates: metres, x right, y up.  Heights (z0, z1) are metres above the level floor.
// Segment frame: origin = segment.a, axis `dir` (a -> b), `left` = dir rotated 90 degrees CCW.
import { NODE_TOL, sub, add, mul, dot, cross, dist, norm, perp, segmentIntersection, closestOnSegment, lineIntersection, signedArea, pointInPolygon } from './geom.mjs';

const EPS_PIECE = 1e-4;
const MITRE_LIMIT = 6; // corner points further than MITRE_LIMIT * thickness from the node are bevelled (very acute wedges)

class NodeIndex {
  constructor(tol) { this.tol = tol; this.cells = new Map(); this.nodes = []; }
  get(p) {
    const s = this.tol * 4, cx = Math.floor(p.x / s), cy = Math.floor(p.y / s);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const id of this.cells.get((cx + i) + ',' + (cy + j)) || []) if (dist(this.nodes[id], p) <= this.tol) return id;
    }
    const id = this.nodes.length;
    this.nodes.push({ id, x: p.x, y: p.y, items: [] });
    const k = cx + ',' + cy;
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(id);
    return id;
  }
}

const isUsableWall = (w, tol) => w && w.a && w.b && dist(w.a, w.b) > tol;

/**
 * @param {Array} walls     level walls {id,a,b,t,h,kind}
 * @param {Array} openings  openings of the document (those whose wall is not in `walls` are ignored)
 * @param {{tol?:number, levelHeight?:number, defaultThickness?:number}} opts
 */
export function buildWallSolids(walls, openings = [], opts = {}) {
  const tol = opts.tol ?? NODE_TOL, levelHeight = opts.levelHeight ?? 3.2, defT = opts.defaultThickness ?? .2;
  const list = walls.filter(w => isUsableWall(w, tol));
  const index = new NodeIndex(tol);

  // 1. cut every wall at junctions ------------------------------------------------------------------
  const raw = [];
  for (const w of list) {
    const length = dist(w.a, w.b), cuts = [0, length];
    for (const v of list) {
      if (v === w) continue;
      const hit = segmentIntersection(w.a, w.b, v.a, v.b, tol / length);
      if (hit) cuts.push(hit.t * length);
      for (const end of [v.a, v.b]) { const c = closestOnSegment(end, w.a, w.b); if (c.dist <= tol) cuts.push(c.t * length); }
    }
    cuts.sort((m, n) => m - n);
    const u = [];
    for (const c of cuts) if (!u.length || c - u[u.length - 1] > tol) u.push(c);
    if (u.length > 1 && length - u[u.length - 1] <= tol) u[u.length - 1] = length;
    if (u[0] !== 0) u[0] = 0;
    const d = norm(sub(w.b, w.a));
    for (let i = 0; i + 1 < u.length; i++) {
      const pa = add(w.a, mul(d, u[i])), pb = add(w.a, mul(d, u[i + 1]));
      const n1 = index.get(pa), n2 = index.get(pb);
      if (n1 === n2) continue;
      raw.push({ wall: w, s0: u[i], s1: u[i + 1], n1, n2 });
    }
  }

  // 2. merge coincident pieces -----------------------------------------------------------------------
  const byKey = new Map(), segments = [];
  for (const r of raw) {
    const key = Math.min(r.n1, r.n2) + '-' + Math.max(r.n1, r.n2);
    const t = r.wall.t ?? defT, h = r.wall.h ?? levelHeight;
    let seg = byKey.get(key);
    if (seg) { seg.t = Math.max(seg.t, t); seg.h = Math.max(seg.h, h); seg.wallIds.push(r.wall.id); seg.sources.push({ wall: r.wall, s0: r.s0, s1: r.s1, reversed: seg.n1 !== r.n1 }); continue; }
    const a = index.nodes[r.n1], b = index.nodes[r.n2];
    seg = { id: 'G' + segments.length, wallId: r.wall.id, wallIds: [r.wall.id], kind: r.wall.kind || 'wall', finish: r.wall.finish || null, n1: r.n1, n2: r.n2,
      a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, t, h, sources: [{ wall: r.wall, s0: r.s0, s1: r.s1, reversed: false }] };
    byKey.set(key, seg); segments.push(seg);
  }
  for (const seg of segments) {
    seg.length = dist(seg.a, seg.b);
    seg.dir = norm(sub(seg.b, seg.a));
    seg.left = perp(seg.dir);
    index.nodes[seg.n1].items.push({ seg, end: 'a', dir: seg.dir });
    index.nodes[seg.n2].items.push({ seg, end: 'b', dir: mul(seg.dir, -1) });
  }

  // 3. mitre corners at nodes ------------------------------------------------------------------------
  const joints = [];
  for (const node of index.nodes) {
    const items = node.items;
    node.degree = items.length;
    if (!items.length) continue;
    const N = { x: node.x, y: node.y };
    // each item gets `outLeft` / `outRight`: the plan points of its outward-left / outward-right corners
    if (items.length === 1) {
      const it = items[0], half = it.seg.t / 2;
      it.outLeft = add(N, mul(perp(it.dir), half));
      it.outRight = add(N, mul(perp(it.dir), -half));
      continue;
    }
    items.sort((p, q) => Math.atan2(p.dir.y, p.dir.x) - Math.atan2(q.dir.y, q.dir.x));
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const cur = items[i], nxt = items[(i + 1) % n];
      const P = add(N, mul(perp(cur.dir), cur.seg.t / 2)); // outward-left line of cur
      const Q = add(N, mul(perp(nxt.dir), -nxt.seg.t / 2)); // outward-right line of nxt
      const den = cross(cur.dir, nxt.dir);
      let cp = P, cq = Q;
      if (Math.abs(den) > 1e-9) {
        const hit = lineIntersection(P, cur.dir, Q, nxt.dir);
        const limit = MITRE_LIMIT * Math.max(cur.seg.t, nxt.seg.t);
        if (hit && dist(hit, N) <= limit) { cp = hit; cq = hit; }
        else joints.push({ node: node.id, poly: [N, P, Q] });
      }
      cur.outLeft = cp; nxt.outRight = cq;
    }
  }

  // 4. per segment outline ---------------------------------------------------------------------------
  for (const seg of segments) {
    const ia = index.nodes[seg.n1].items.find(i => i.seg === seg), ib = index.nodes[seg.n2].items.find(i => i.seg === seg);
    const along = p => dot(sub(p, seg.a), seg.dir);
    // end a: outward = dir, so outLeft = left side; end b: outward = -dir, so outLeft = RIGHT side of the segment
    const aL = ia.outLeft, aR = ia.outRight, bR = ib.outLeft, bL = ib.outRight;
    seg.cap = { aL: along(aL), aR: along(aR), bL: along(bL), bR: along(bR) };
    seg.corners = { aL, aR, bL, bR };
    // the node itself is added to an end whose two corners do not line up with it (T / X junctions), so the
    // wedge between the mitred ends is filled by the wall that owns it and nothing is left over
    const Na = { x: index.nodes[seg.n1].x, y: index.nodes[seg.n1].y }, Nb = { x: index.nodes[seg.n2].x, y: index.nodes[seg.n2].y };
    seg.nodeA = Na; seg.nodeB = Nb;
    seg.needA = Math.abs(cross(sub(aL, Na), sub(aR, Na))) > 1e-9; seg.needB = Math.abs(cross(sub(bL, Nb), sub(bR, Nb))) > 1e-9;
    seg.quad = [aR, bR, ...(seg.needB ? [Nb] : []), bL, aL, ...(seg.needA ? [Na] : [])].map(p => ({ x: p.x, y: p.y }));
    seg.deg = [index.nodes[seg.n1].degree, index.nodes[seg.n2].degree];
    seg.node = [seg.n1, seg.n2];
    // which ends meet another wall (concave corner / junction) -> used for ambient occlusion
    seg.joint = [jointEnd(index.nodes[seg.n1], seg), jointEnd(index.nodes[seg.n2], seg)];
  }

  // 5. openings -> segments -> pieces ----------------------------------------------------------------
  const openingsOut = [];
  const bySource = new Map();
  for (const seg of segments) for (const s of seg.sources) { if (!bySource.has(s.wall.id)) bySource.set(s.wall.id, []); bySource.get(s.wall.id).push({ seg, ...s }); }
  for (const seg of segments) seg.openings = [];
  for (const o of openings) {
    const srcs = bySource.get(o.wall);
    if (!srcs) continue;
    // the opening belongs to the segment it overlaps most; when it straddles a junction it is slid clear of it
    let best = null;
    for (const s of srcs) {
      const overlap = Math.min(o.at + o.w / 2, s.s1) - Math.max(o.at - o.w / 2, s.s0);
      if (overlap > .1 && (!best || overlap > best.overlap)) best = { s, overlap };
    }
    if (!best) continue;
    const { s } = best, seg = s.seg, L = s.s1 - s.s0;
    let c = o.at - s.s0; if (s.reversed) c = L - c;
    const lo = Math.max(seg.cap.aL, seg.cap.aR, 0) + .03, hi = Math.min(seg.cap.bL, seg.cap.bR, seg.length) - .03;
    let w = o.w, x0 = c - w / 2;
    if (w > hi - lo) { w = hi - lo; x0 = lo; } else x0 = Math.max(lo, Math.min(hi - w, x0));
    if (w < .1) continue;
    const x1 = x0 + w, H = seg.h, z0 = Math.max(0, o.sill ?? 0), z1 = Math.min(H, z0 + (o.h ?? 2.1));
    if (z1 - z0 < .05) continue;
    seg.openings.push({ id: o.id, wallId: o.wall, segId: seg.id, kind: o.kind, x0, x1, c: (x0 + x1) / 2, w, z0, z1, h: z1 - z0, sill: z0,
      swing: o.swing || null, hinge: s.reversed ? (o.hinge === 'right' ? 'left' : 'right') : (o.hinge || 'left'), entry: !!o.entry,
      adjusted: Math.abs(x0 - (c - o.w / 2)) > 1e-6 || Math.abs(w - o.w) > 1e-6, reversedSource: !!s.reversed,
      t: seg.t, dir: seg.dir, left: seg.left, center: add(seg.a, mul(seg.dir, (x0 + x1) / 2)) });
  }

  const solids = { nodes: index.nodes, segments, joints, openings: openingsOut, polygons: [] };
  for (const seg of segments) {
    seg.openings.sort((p, q) => p.x0 - q.x0);
    // drop overlaps (later one loses)
    seg.openings = seg.openings.filter((o, i, arr) => i === 0 || o.x0 >= arr[i - 1].x1 - 1e-6);
    seg.pieces = piecesOf(seg);
    for (const o of seg.openings) openingsOut.push(o);
    solids.polygons.push({ segId: seg.id, poly: seg.quad });
  }
  for (const j of joints) solids.polygons.push({ joint: true, poly: j.poly });
  solids.byId = new Map(segments.map(s => [s.id, s]));
  return solids;
}

function jointEnd(node, seg) {
  if (node.items.length >= 3) return true;
  if (node.items.length === 2) {
    const o = node.items.find(i => i.seg !== seg), me = node.items.find(i => i.seg === seg);
    return dot(o.dir, me.dir) > -.985; // not a straight continuation
  }
  return false;
}

/** Footprint of the part [x0, x1] of a segment (plan coordinates); the segment's mitred end edges are kept at the ends. */
export function footprint(seg, x0, x1, atStart, atEnd) {
  const h = seg.t / 2, c = seg.cap;
  const sL = atStart ? c.aL : x0, sR = atStart ? c.aR : x0, eL = atEnd ? c.bL : x1, eR = atEnd ? c.bR : x1;
  const P = (s, off) => add(add(seg.a, mul(seg.dir, s)), mul(seg.left, off));
  const poly = [P(sR, -h), P(eR, -h)];
  if (atEnd && seg.needB) poly.push({ ...seg.nodeB });
  poly.push(P(eL, h), P(sL, h));
  if (atStart && seg.needA) poly.push({ ...seg.nodeA });
  return poly;
}

function piecesOf(seg) {
  const H = seg.h, out = [];
  const make = (kind, x0, x1, z0, z1, extra = {}) => {
    if (x1 - x0 < EPS_PIECE || z1 - z0 < EPS_PIECE) return;
    const atStart = x0 <= EPS_PIECE, atEnd = x1 >= seg.length - EPS_PIECE;
    const P = (s, off) => add(add(seg.a, mul(seg.dir, s)), mul(seg.left, off)), h = seg.t / 2, k = seg.corners;
    const corners = { sL: atStart ? k.aL : P(x0, h), sR: atStart ? k.aR : P(x0, -h), eL: atEnd ? k.bL : P(x1, h), eR: atEnd ? k.bR : P(x1, -h) };
    out.push({ segId: seg.id, wallId: seg.wallId, kind, x0, x1, z0, z1, startCap: atStart, endCap: atEnd, poly: footprint(seg, x0, x1, atStart, atEnd), corners, ...extra });
  };
  let cursor = 0;
  if (!seg.openings.length) { make('full', 0, seg.length, 0, H); return out; }
  for (const o of seg.openings) {
    make('pier', cursor, o.x0, 0, H);
    make('sill', o.x0, o.x1, 0, o.z0, { opening: o.id });
    make('lintel', o.x0, o.x1, o.z1, H, { opening: o.id });
    cursor = o.x1;
  }
  make('pier', cursor, seg.length, 0, H);
  return out;
}

/** Vertical face area a segment has on ONE side: L*H minus the openings (clipped). Used to verify piece accounting. */
export function expectedFaceArea(seg) {
  return seg.length * seg.h - seg.openings.reduce((s, o) => s + o.w * o.h, 0);
}
export const pieceFaceArea = seg => seg.pieces.reduce((s, p) => s + (p.x1 - p.x0) * (p.z1 - p.z0), 0);

/** 2D plan polygons of the whole level (segment quads + bevel joints). */
export const planPolygons = solids => solids.polygons.map(p => p.poly);
export const totalPlanArea = solids => solids.polygons.reduce((s, p) => s + Math.abs(signedArea(p.poly)), 0);

/** Footprints of everything a walking person (body spans zLo..zHi above the floor) can not pass through. */
export function blockingPolygons(solids, zLo = .25, zHi = 1.8) {
  const out = [];
  for (const seg of solids.segments) {
    if (seg.kind === 'fence' || seg.kind === 'parapet') { if (seg.h > zLo) { for (const p of seg.pieces) out.push(p.poly); } continue; }
    for (const p of seg.pieces) if (p.z1 > zLo && p.z0 < zHi) out.push(p.poly);
  }
  for (const j of solids.joints) out.push(j.poly);
  return out;
}

/** Is the plan point inside any wall solid (in the given height band)? */
export function pointBlocked(solids, p, zLo = .25, zHi = 1.8) {
  for (const poly of blockingPolygons(solids, zLo, zHi)) if (pointInPolygon(p, poly, 0)) return true;
  return false;
}

export default { buildWallSolids, footprint, expectedFaceArea, pieceFaceArea, planPolygons, totalPlanArea, blockingPolygons, pointBlocked };
