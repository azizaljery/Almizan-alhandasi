// Interior dressing planner (pure: no THREE, no DOM). Given one room of the built scene, the document's own fixtures for it and the room's
// openings, it returns ADDITIONAL illustrative pieces (seating for rooms the plan left empty, side tables, consoles, sideboards, bookcases,
// lamps, plants, wall art, towel rails) placed with the same clearance rules as the photo-staging code (door swings, window zones, walls).
// It never moves or removes a document fixture and never touches walls/openings/quantities. All sizes are design estimates («غير متحقق»).
import { FIXTURES } from './catalog.mjs';
import { Stage, STAGERS, fixtureObb, roomOpenings, obbOverlap, obb } from '../interior/staging.mjs';
import { PIECE_DEFAULTS } from './interior-pieces.mjs';
import { bounds as boundsOf } from './geom.mjs';

const dimsOf = k => FIXTURES[k] || PIECE_DEFAULTS[k] || { w: 1, d: 1, h: 1 };
const frontOf = rot => ({ x: Math.sin(rot), y: Math.cos(rot) });
const TALL = 1.1;

/**
 * @param {{ space: object, level: object, fixtures: object[], ceilZ: number, themeId: string, rnd: () => number }} ctx
 *   space = scene space (net polygon, holes, centroid, inside, area, type, key); level = scene level data (solids);
 *   fixtures = the document's fixtures that stand in this room.
 * @returns {{ items: object[], notes: string[] }} items: { kind, x, y, rot, w, d, h, piece: boolean, po?: object, role?: string }
 */
export function dressRoom({ space, level, fixtures = [], themeId = 'contemporary', rnd = Math.random }) {
  const type = space.type, b = boundsOf(space.net);
  const room = { polygon: space.net, holes: space.holes || [], centroid: space.centroid, inside: space.inside, bounds: b, area: space.area, key: space.key, type };
  const openings = roomOpenings({ solids: level.solids }, room), st = new Stage(room, openings, level), notes = [];
  const have = new Set(fixtures.map(f => f.kind)), extra = [];
  const tallOf = new Map();
  for (const f of fixtures) {
    const d = FIXTURES[f.kind]; if (!d) continue;
    const dm = { w: f.w ?? d.w, d: f.d ?? d.d, h: f.h ?? d.h }, box = fixtureObb({ x: f.x, y: f.y, rot: f.rot || 0, w: dm.w, d: dm.d });
    if (f.kind !== 'rug') { st.placed.push({ kind: f.kind, box }); tallOf.set(box, dm.h + (f.kind === 'kitchen-run' ? 1.2 : 0)); }
  }
  const put = (it) => { extra.push(it); return it; };
  const addPieceWall = (edge, kind, s, over = {}) => {
    const dm = { ...dimsOf(kind), ...over }, f = st.tryWall(edge, kind, s, dm.w, dm.d, { h: dm.h, role: over.role || 'decor' });
    if (!f) return null; st.items.pop(); st.placed.at(-1).h = dm.h; // the Stage keeps its own item list; we collect ours
    return put({ kind, x: f.x, y: f.y, rot: f.rot, w: dm.w, d: dm.d, h: dm.h, piece: !FIXTURES[kind], role: over.role || 'decor', po: over.po });
  };
  const addFree = (kind, x, y, rot, over = {}) => {
    const dm = { ...dimsOf(kind), ...over }, f = st.tryFree(kind, x, y, rot, dm.w, dm.d, { h: dm.h, role: over.role || 'decor' });
    if (!f) return null; st.items.pop(); st.placed.at(-1).h = dm.h;
    return put({ kind, x: f.x, y: f.y, rot: f.rot, w: dm.w, d: dm.d, h: dm.h, piece: !FIXTURES[kind], role: over.role || 'decor', po: over.po });
  };
  /** Picture / mirror / rail hung on the wall face behind a piece (or at a point of an edge) if nothing tall or an opening is in the way. */
  const hang = (kind, edge, s, w, h, po = {}) => {
    const d = .04, p = st.againstWall(edge, kind, s, w, d), box = p.box;
    for (const z of st.zones) if (obbOverlap(box, z.box, 0) && (!z.door || po.y > 1.0)) { if (z.o.edge === edge) return null; }
    for (const pl of st.placed) { const th = pl.h ?? tallOf.get(pl.box) ?? (FIXTURES[pl.kind]?.h || .5); if (th > (po.y ?? 1.5) - h / 2 - .02 && obbOverlap(box, pl.box, .02)) return null; }
    return put({ kind, x: +box.cx.toFixed(3), y: +box.cy.toFixed(3), rot: +p.rot.toFixed(4), w, d, h, piece: true, role: 'wall', po: { y: po.y ?? 1.55, ...po } });
  };
  const corners4 = o => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => ({ x: o.cx + o.u.x * o.w / 2 * a + o.v.x * o.d / 2 * c, y: o.cy + o.u.y * o.w / 2 * a + o.v.y * o.d / 2 * c }));
  const sOnEdge = (edge, p) => (p.x - edge.A.x) * edge.t.x + (p.y - edge.A.y) * edge.t.y;
  const edgeOf = p => { let e = null, best = Infinity; for (const ed of st.edges) { const dx = ed.B.x - ed.A.x, dy = ed.B.y - ed.A.y, k = Math.max(0, Math.min(1, ((p.x - ed.A.x) * dx + (p.y - ed.A.y) * dy) / (dx * dx + dy * dy || 1))), dd = Math.hypot(p.x - ed.A.x - k * dx, p.y - ed.A.y - k * dy); if (dd < best) { best = dd; e = ed; } } return { e, d: best }; };
  const freeSpans = (edge, minLen, windows = true) => st.intervals(edge, { windows }).filter(([a, c]) => c - a >= minLen).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
  const hangAbove = f => { // a picture centred above a wall-backed piece
    const fr = frontOf(f.rot), back = { x: f.x - fr.x * (f.d / 2 + .03 + .02), y: f.y - fr.y * (f.d / 2 + .03 + .02) }, { e, d } = edgeOf(back);
    if (!e || d > .2) return null; return hang('wall-art', e, sOnEdge(e, back), Math.min(1.4, f.w * .72), .8 * Math.min(1, f.w * .72 / 1.1) + .15, { y: f.h > 1.0 ? 1.7 : 1.45 });
  };
  /** Run a room stager (seating / bed set) and keep its result only if the anchor piece fitted; otherwise undo it completely. */
  const stage = (type2, anchors) => {
    const n0 = st.placed.length; STAGERS[type2](st);
    const got = st.items.splice(0);
    if (!got.some(f => anchors.includes(f.kind))) { st.placed.length = n0; notes.push('تعذّر تأثيث الغرفة: لم تتسع القطعة الرئيسية'); return false; }
    for (const f of got) put({ kind: f.kind, x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d, h: f.h, piece: false, role: f.role });
    return true;
  };
  const spots = [];
  const corner = (edge, which) => ({ s: which ? edge.L - .45 : .45 });

  // ------------------------------------------------------------------------------------------------ per room type
  if (type === 'majlis') {
    if (!have.has('majlis-sofa') && !have.has('sofa-3')) { stage('majlis', ['majlis-sofa']); }
    const seats = [...extra.filter(i => i.kind === 'majlis-sofa'), ...fixtures.filter(f => f.kind === 'majlis-sofa').map(f => ({ ...f, w: f.w ?? FIXTURES['majlis-sofa'].w, d: f.d ?? FIXTURES['majlis-sofa'].d, h: .45 }))];
    let tables = 0;
    for (const sf of seats.slice(0, 4)) { // side tables at the ends of the seat runs + a picture behind
      const u = { x: Math.cos(sf.rot || 0), y: -Math.sin(sf.rot || 0) };
      for (const sg of [-1, 1]) if (tables < 2 && addFree('side-table', sf.x + u.x * sg * (sf.w / 2 + .32), sf.y + u.y * sg * (sf.w / 2 + .32), 0, { role: 'table', w: .5, d: .5 })) { tables++; }
    }
    for (const sf of seats.slice(0, 2)) hangAbove({ ...sf, h: .45 });
    for (const e of st.edges.slice().sort((p, q) => q.L - p.L)) { const sp = freeSpans(e, 1.5)[0]; if (sp && addPieceWall(e, 'console', (sp[0] + sp[1]) / 2, { w: 1.3 })) break; }
    for (const e of st.edges) if (addPieceWall(e, 'plant', e.L - .45, { w: .4, d: .4, h: 1.1 })) break;
  } else if (type === 'living') {
    if (!have.has('sofa-3') && !have.has('sofa-2') && !have.has('majlis-sofa')) { stage('living', ['sofa-3']); }
    const sofa = extra.find(i => i.kind === 'sofa-3') || fixtures.find(f => f.kind === 'sofa-3' || f.kind === 'sofa-2');
    if (sofa) {
      const sw = sofa.w ?? FIXTURES['sofa-3'].w, u = { x: Math.cos(sofa.rot || 0), y: -Math.sin(sofa.rot || 0) };
      for (const sg of [-1, 1]) addFree('side-table', sofa.x + u.x * sg * (sw / 2 + .38), sofa.y + u.y * sg * (sw / 2 + .38), 0, { role: 'table', w: .45, d: .45 });
      addFree('floor-lamp', sofa.x + u.x * (sw / 2 + .38), sofa.y + u.y * (sw / 2 + .38), 0, { role: 'decor', w: .4, d: .4 });
      hangAbove({ ...sofa, w: sw, d: sofa.d ?? .95, h: .85, rot: sofa.rot || 0 });
    }
    const tvu = extra.find(i => i.kind === 'tv-unit') || fixtures.find(f => f.kind === 'tv-unit'); if (tvu) hangAbove({ ...tvu, w: (tvu.w ?? 1.8) * .6, h: 1.4 });
    for (const e of st.edges.slice().sort((p, q) => q.L - p.L)) { const sp = freeSpans(e, 1.1)[0]; if (sp && addPieceWall(e, 'bookcase', (sp[0] + sp[1]) / 2, { w: 1.0, h: 2.0, po: {} })) break; }
    for (const e of st.edges) if (addPieceWall(e, 'plant', e.L - .5, { w: .4, d: .4, h: 1.1 })) break;
  } else if (type === 'dining') {
    for (const e of st.edges.slice().sort((p, q) => q.L - p.L)) { const sp = freeSpans(e, 1.7)[0]; if (sp) { const f = addPieceWall(e, 'sideboard', (sp[0] + sp[1]) / 2, { w: Math.min(1.8, sp[1] - sp[0] - .2) }); if (f) { hangAbove({ ...f, h: .9 }); break; } } }
    for (const e of st.edges) if (addPieceWall(e, 'plant', .5, { w: .4, d: .4, h: 1.1 })) break;
  } else if (type === 'master' || type === 'bedroom') {
    if (!have.has('bed-double') && !have.has('bed-single')) { stage('master', ['bed-double']); }
    const bed = extra.find(i => i.kind === 'bed-double') || fixtures.find(f => f.kind === 'bed-double' || f.kind === 'bed-single');
    if (bed) {
      const bw = Math.min(bed.w ?? 1.8, 2.2), bd = bed.d ?? 2.1, ax = { x: Math.sin(bed.rot || 0), y: Math.cos(bed.rot || 0) };
      // the head wall is whichever end of the bed axis lies closer to a wall
      const ends = [1, -1].map(sg => edgeOf({ x: bed.x + ax.x * sg * (bd / 2 + .05), y: bed.y + ax.y * sg * (bd / 2 + .05) })).sort((p, q) => p.d - q.d), he = ends[0].e, hd = he ? he.n : { x: -ax.x, y: -ax.y };
      const foot = { x: bed.x + hd.x * (bd / 2 + .27), y: bed.y + hd.y * (bd / 2 + .27) };
      if (type === 'master') addFree('bench', foot.x, foot.y, Math.atan2(hd.x, hd.y) + Math.PI, { w: Math.min(1.4, bw * .78), d: .42, h: .45, role: 'bench' });
      if (he) hang('wall-art', he, sOnEdge(he, { x: bed.x, y: bed.y }), Math.min(1.5, bw * .75), .75, { y: 1.62 });
    }
    for (const e of st.edges.slice().sort((p, q) => q.L - p.L)) { const sp = freeSpans(e, 1.4)[0]; if (sp && addPieceWall(e, 'dresser', (sp[0] + sp[1]) / 2, { w: 1.2 })) { const f = extra.at(-1); hang('wall-mirror', e, sOnEdge(e, f), .7, 1.0, { y: 1.5 }); break; } }
    if (type === 'master' && space.area > 18) { // reading corner: armchair + floor lamp in the corner farthest from the bed
      const cs = space.net.map(p => ({ p, d: bed ? Math.hypot(p.x - bed.x, p.y - bed.y) : 0 })).sort((p, q) => q.d - p.d);
      for (const { p } of cs.slice(0, 4)) { const c = space.centroid || space.inside, vx = c.x - p.x, vy = c.y - p.y, l = Math.hypot(vx, vy) || 1, ax = p.x + vx / l * .85, ay = p.y + vy / l * .85; if (addFree('armchair', ax, ay, Math.atan2(vx, vy), { role: 'chair', w: .85, d: .85, h: .85 })) { addFree('floor-lamp', p.x + vx / l * .3 + (vy / l) * .3, p.y + vy / l * .3 - (vx / l) * .3, 0, { w: .4, d: .4 }); break; } }
    }
    for (const e of st.edges) if (addPieceWall(e, 'plant', e.L - .5, { w: .4, d: .4, h: 1.1 })) break;
  } else if (type === 'office') {
    if (!have.has('desk')) { const e = st.edges.slice().sort((p, q) => q.L - p.L)[0]; if (e) { const sp = freeSpans(e, 1.5)[0] || [0, e.L]; const f = addPieceWall(e, 'desk', (sp[0] + sp[1]) / 2, { w: 1.4, d: .7, h: .75 }); if (f) { const fr = frontOf(f.rot); addFree('chair', f.x + fr.x * .75, f.y + fr.y * .75, Math.atan2(-fr.x, -fr.y), { w: .5, d: .5, h: .9, role: 'chair' }); } } }
    for (const e of st.edges.slice().sort((p, q) => q.L - p.L)) { const sp = freeSpans(e, 1.1)[0]; if (sp && addPieceWall(e, 'bookcase', (sp[0] + sp[1]) / 2, { w: 1.0, h: 2.0 })) break; }
  } else if (type === 'entrance') {
    for (const e of st.edges.slice().sort((p, q) => q.L - p.L)) { const sp = freeSpans(e, 1.2)[0]; if (sp) { const f = addPieceWall(e, 'console', (sp[0] + sp[1]) / 2, { w: Math.min(1.3, sp[1] - sp[0] - .3) }); if (f) { hang('wall-mirror', e, sOnEdge(e, f), .8, 1.15, { y: 1.55 }); break; } } }
    for (const e of st.edges) if (addPieceWall(e, 'plant', .45, { w: .4, d: .4, h: 1.1 })) break;
  } else if (type === 'corridor') {
    const long = st.edges.slice().sort((p, q) => q.L - p.L).slice(0, 2); let k = 0;
    for (const e of long) for (const sp of freeSpans(e, 1.6).slice(0, 1)) { if (k < 2 && hang('wall-art', e, (sp[0] + sp[1]) / 2, .8, .6, { y: 1.5 })) k++; }
    if (Math.min(b.w, b.h) >= 1.5) { const e = long[0]; const sp = e && freeSpans(e, 1.4)[0]; if (sp) addPieceWall(e, 'console', (sp[0] + sp[1]) / 2, { w: 1.2 }); }
  } else if (type === 'bath') {
    for (const e of st.edges.slice().sort((p, q) => q.L - p.L)) { const sp = freeSpans(e, .8, true)[0]; if (sp && hang('towel-rail', e, sp[0] + .5, .6, .5, { y: 1.1 })) break; }
  } else if (type === 'storage' || type === 'laundry') {
    for (const e of st.edges.slice().sort((p, q) => q.L - p.L)) { const sp = freeSpans(e, 1.0)[0]; if (sp && addPieceWall(e, 'bookcase', (sp[0] + sp[1]) / 2, { w: Math.min(1.2, sp[1] - sp[0] - .1), h: 2.0, po: { doors: false } })) break; }
  }
  void spots; void corner; void obb; void TALL; void rnd;
  return { items: extra, notes: st.notes.concat(notes), openings };
}

export default { dressRoom };
