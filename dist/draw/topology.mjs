// Wall topology: from loose wall centre-lines to nodes, edges, closed spaces (rooms),
// building outlines and the gaps the user still has to close.
// Pure. All rooms are *derived* from the walls, so editing a wall always keeps the
// rooms consistent; nothing here is stored in the document.
import { NODE_TOL, sub, add, mul, dot, dist, norm, perp, segmentIntersection, closestOnSegment, signedArea, area, ccw, centroid, interiorPoint, insetPolygon, pointInPolygon, pt, bounds } from './geom.mjs';

class NodeIndex {
  constructor(tol = NODE_TOL) { this.tol = tol; this.cells = new Map(); this.nodes = []; }
  key(x, y) { return Math.floor(x / (this.tol * 4)) + ',' + Math.floor(y / (this.tol * 4)); }
  find(p) {
    const cx = Math.floor(p.x / (this.tol * 4)), cy = Math.floor(p.y / (this.tol * 4));
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const id of this.cells.get((cx + i) + ',' + (cy + j)) || []) if (dist(this.nodes[id], p) <= this.tol) return id;
    }
    return -1;
  }
  get(p) {
    const found = this.find(p);
    if (found >= 0) return found;
    const id = this.nodes.length; this.nodes.push({ id, x: p.x, y: p.y });
    const k = this.key(p.x, p.y); if (!this.cells.has(k)) this.cells.set(k, []); this.cells.get(k).push(id);
    return id;
  }
}

/** Split walls at every crossing / T-junction and merge coincident pieces into graph edges. */
export function planarize(walls, tol = NODE_TOL) {
  const index = new NodeIndex(tol), edges = new Map();
  const list = walls.filter(w => dist(w.a, w.b) > tol);
  for (const w of list) {
    const length = dist(w.a, w.b), cuts = [0, 1];
    for (const v of list) {
      if (v === w) continue;
      const hit = segmentIntersection(w.a, w.b, v.a, v.b, tol / length);
      if (hit) cuts.push(hit.t);
      for (const end of [v.a, v.b]) { const c = closestOnSegment(end, w.a, w.b); if (c.dist <= tol) cuts.push(c.t); }
    }
    cuts.sort((m, n) => m - n);
    const uniq = [];
    for (const c of cuts) if (!uniq.length || (c - uniq[uniq.length - 1]) * length > tol) uniq.push(c);
    if (uniq.length > 1 && (1 - uniq[uniq.length - 1]) * length <= tol) uniq[uniq.length - 1] = 1;
    for (let i = 0; i + 1 < uniq.length; i++) {
      const pa = { x: w.a.x + (w.b.x - w.a.x) * uniq[i], y: w.a.y + (w.b.y - w.a.y) * uniq[i] };
      const pb = { x: w.a.x + (w.b.x - w.a.x) * uniq[i + 1], y: w.a.y + (w.b.y - w.a.y) * uniq[i + 1] };
      const n1 = index.get(pa), n2 = index.get(pb);
      if (n1 === n2) continue;
      const key = Math.min(n1, n2) + '-' + Math.max(n1, n2);
      const t = w.t ?? .2;
      if (edges.has(key)) { const e = edges.get(key); e.wallIds.push(w.id); e.t = Math.max(e.t, t); continue; }
      edges.set(key, { id: 'E' + edges.size, n1, n2, wallIds: [w.id], t, kind: w.kind || 'wall' });
    }
  }
  return { nodes: index.nodes, edges: [...edges.values()] };
}

const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

/**
 * Full analysis of one level. Returns
 *  { nodes, edges, spaces[], outlines[], stubs[], gaps[], edgeSides }
 * spaces: closed faces (centre-line polygon, clear polygon, holes, area, neighbours).
 */
export function analyzeWalls(walls, { tol = NODE_TOL, gapReach = .35 } = {}) {
  const { nodes, edges } = planarize(walls, tol);
  const live = new Map(edges.map(e => [e.id, e]));
  const adj = nodes.map(() => []);
  for (const e of edges) { adj[e.n1].push(e); adj[e.n2].push(e); }
  // 1. prune dangling stubs (degree 1) iteratively
  const degree = nodes.map((_, i) => adj[i].length), stubs = [], queue = [];
  nodes.forEach((_, i) => { if (degree[i] === 1) queue.push(i); });
  while (queue.length) {
    const n = queue.pop();
    if (degree[n] !== 1) continue;
    const e = adj[n].find(x => live.has(x.id));
    if (!e) continue;
    live.delete(e.id); stubs.push(e); degree[e.n1]--; degree[e.n2]--;
    const other = e.n1 === n ? e.n2 : e.n1; if (degree[other] === 1) queue.push(other);
  }
  // 2. half edges around each remaining node, sorted CCW
  const out = nodes.map(() => []);
  const half = [];
  for (const e of live.values()) {
    const h1 = { id: half.length, e, from: e.n1, to: e.n2, face: -1 }, h2 = { id: half.length + 1, e, from: e.n2, to: e.n1, face: -1 };
    h1.twin = h2; h2.twin = h1; half.push(h1, h2); out[e.n1].push(h1); out[e.n2].push(h2);
  }
  for (const list of out) list.sort((p, q) => angle(nodes[p.from], nodes[p.to]) - angle(nodes[q.from], nodes[q.to]));
  const nextOf = h => { const list = out[h.to], i = list.indexOf(h.twin); return list[(i - 1 + list.length) % list.length]; };
  // 3. trace faces (face on the left of each half edge)
  const faces = [];
  for (const h of half) {
    if (h.face >= 0) continue;
    const loop = []; let cur = h;
    do { cur.face = faces.length; loop.push(cur); cur = nextOf(cur); } while (cur !== h && loop.length <= half.length);
    const poly = loop.map(x => ({ x: nodes[x.from].x, y: nodes[x.from].y }));
    faces.push({ id: faces.length, half: loop, poly, signed: signedArea(poly) });
  }
  // 4. components (union-find on nodes)
  const parent = nodes.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (const e of live.values()) parent[find(e.n1)] = find(e.n2);
  for (const f of faces) f.comp = find(f.half[0].from);
  const comps = new Map();
  for (const f of faces) { if (!comps.has(f.comp)) comps.set(f.comp, []); comps.get(f.comp).push(f); }
  const bounded = faces.filter(f => f.signed > 1e-9), unbounded = [];
  for (const list of comps.values()) { const outer = list.reduce((m, f) => f.signed < m.signed ? f : m, list[0]); outer.outer = true; unbounded.push(outer); }
  // 5. nesting: a component whose outer boundary lies inside a bounded face of another component is a hole of that face
  const host = new Map(); // outer face id -> hosting bounded face
  for (const o of unbounded) {
    const outline = ccw(o.poly), probe = outline[0];
    let best = null;
    for (const f of bounded) {
      if (f.comp === o.comp) continue;
      if (pointInPolygon(probe, f.poly, 1e-9) && !f.poly.some(q => dist(q, probe) < 1e-9) && (!best || f.signed < best.signed)) best = f;
    }
    if (best) { host.set(o.id, best); (best.holes ||= []).push(o); }
  }
  // 6. face descriptors
  const thickness = h => h.e.t;
  const spaces = bounded.map(f => {
    const n = f.half.length, poly = f.poly, t = f.half.map(thickness);
    let net = insetPolygon(poly, t.map(x => x / 2));
    const holes = (f.holes || []).map(o => {
      const outline = ccw(o.poly), tt = [...o.half].reverse().map(thickness); // reversed half-edge order matches ccw(outline) orientation
      return insetPolygon(outline, tt.map(x => -x / 2), { grow: true }) || outline;
    });
    const gross = f.signed;
    const holeArea = holes.reduce((s, h) => s + area(h), 0) ;
    const clear = net ? area(net) - holeArea : null;
    const neighbours = f.half.map(h => {
      const other = h.twin.face, of = faces[other];
      let ref;
      if (of.outer) ref = host.has(of.id) ? { space: host.get(of.id).id } : { outside: true };
      else ref = { space: of.id };
      return { halfEdge: h.id, edgeId: h.e.id, wallIds: h.e.wallIds, a: pt(nodes[h.from]), b: pt(nodes[h.to]), t: h.e.t, ...ref };
    });
    return { id: 'S' + f.id, faceId: f.id, polygon: poly.map(pt), net: net ? net.map(pt) : null, holes: holes.map(h => h.map(pt)), grossArea: gross, area: clear ?? gross, centroid: pt(centroid(net || poly)), inside: pt(interiorPoint(net || poly)), bounds: bounds(poly), edges: neighbours, comp: f.comp, ...(net ? {} : { collapsed: true }), vertexCount: n };
  });
  const spaceByFace = new Map(spaces.map(s => [s.faceId, s]));
  for (const s of spaces) for (const e of s.edges) if (e.space !== undefined) e.space = spaceByFace.get(e.space) ? spaceByFace.get(e.space).id : null;
  // 7. outlines of top-level components (building footprint including wall thickness)
  const outlines = unbounded.filter(o => !host.has(o.id) && o.poly.length >= 3 && Math.abs(o.signed) > 1e-9).map(o => {
    const poly = ccw(o.poly), order = signedArea(o.poly) < 0 ? [...o.half].reverse() : o.half;
    // outer boundary (walking CCW) -> grow outwards by half thickness
    const grown = insetPolygon(poly, order.map(h => -h.e.t / 2), { grow: true });
    return { comp: o.comp, centerline: poly.map(pt), polygon: (grown || poly).map(pt), area: area(grown || poly) };
  });
  // 8. exterior flag per edge piece, from the spaces' neighbour data
  const exteriorEdges = new Set(), edgeSides = new Map();
  for (const s of spaces) for (const e of s.edges) {
    const rec = edgeSides.get(e.edgeId) || { edgeId: e.edgeId, wallIds: e.wallIds, spaces: [] };
    rec.spaces.push(s.id); edgeSides.set(e.edgeId, rec);
    if (e.outside) exteriorEdges.add(e.edgeId);
  }
  for (const e of stubs) { edgeSides.set(e.id, { edgeId: e.id, wallIds: e.wallIds, spaces: [], stub: true }); }
  // 9. gaps: free ends that nearly touch another wall
  const gaps = [];
  nodes.forEach((n, i) => {
    if (adj[i].length !== 1) return;
    const own = new Set(adj[i][0].wallIds);
    let best = null;
    for (const w of walls) {
      if (own.has(w.id)) continue;
      const c = closestOnSegment(n, w.a, w.b);
      if (c.dist > tol && c.dist <= gapReach && (!best || c.dist < best.dist)) best = { dist: c.dist, point: pt(c.point), wallId: w.id };
    }
    // two free ends facing each other close the same gap
    for (let j = i + 1; j < nodes.length; j++) {
      if (adj[j].length !== 1) continue;
      const d = dist(n, nodes[j]);
      if (d > tol && d <= gapReach && (!best || d < best.dist)) best = { dist: d, point: pt(nodes[j]), node: j };
    }
    if (best) gaps.push({ node: i, at: pt(n), ...best });
  });
  // the same pair of free ends is found from both sides: keep one
  for (let i = gaps.length - 1; i >= 0; i--) {
    const g = gaps[i];
    if (gaps.some((h, j) => j < i && dist(h.at, g.point) < 1e-6 && dist(h.point, g.at) < 1e-6)) gaps.splice(i, 1);
  }
  return { nodes, edges, spaces, outlines, stubs, gaps, edgeSides, exteriorEdges };
}

/** Which wall id owns the exterior flag? (a wall is exterior if any piece of it faces outside) */
export function exteriorWallIds(analysis) {
  const ids = new Set();
  for (const e of analysis.edges) if (analysis.exteriorEdges.has(e.id)) for (const w of e.wallIds) ids.add(w);
  return ids;
}

export default { planarize, analyzeWalls, exteriorWallIds };
