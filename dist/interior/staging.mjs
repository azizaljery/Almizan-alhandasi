// تأثيث المجلس والصالة وغرفة النوم الرئيسية من نموذج التصميم الفعلي (نقي: لا DOM ولا THREE).
// المدخل: مستند المرسم (جدران وفتحات وتسميات الغرف). المخرج: نسخة من المستند فيها قطع أثاث بمقاسات كتالوج FIXTURES الحقيقية
// موضوعة داخل مضلع الغرفة، بعيدًا عن أرجحة الأبواب، وبلا تداخل. لا يلمس المستند الأصلي ولا يغيّر الجدران ولا الفتحات.
// قيم الترتيب (فجوات، مسافات الجلوس) تقديرات تصميمية للتصوير لا اشتراطات كود؛ كلها «غير متحقق» نظاميًا.
import { buildingModel } from '../draw/building-model.mjs';
import { FIXTURES, isDoorKind } from '../draw/catalog.mjs';
import { pointInPolygon, signedArea } from '../draw/geom.mjs';

export const STAGE_ROOMS = Object.freeze(['majlis', 'living', 'master']);
export const STAGING = Object.freeze({
  wallGap: .03, // فجوة بين ظهر القطعة والجدار (م)
  doorDepth: 1.0, doorPad: .15, // منطقة أرجحة الباب: عمق ممنوع أمام الباب وهامش عرضي (م)
  windowPad: .05, windowDepth: .7, // القطع الطويلة (> 1.2 م) لا تحجب نافذة
  tallH: 1.2, cornerStep: .1, maxShift: 1.2,
  seatW: 2.0, seatMin: 1.2, seatMax: 2.4, // وحدة الجلسة العربية (م)
  maxSeats: 10, tvToSofa: 2.7, sofaBackGap: .3,
});

/** ألوان الأقمشة والأخشاب لكل طراز (تُطبَّق على مواد الأثاث المشتركة في العارض؛ أسماء المواد من fixtures3d). */
export const STYLE_PALETTES = Object.freeze({
  N: { rug: '#a2503a', majlisFabric: '#8a3a2c', majlisCream: '#d8c29a', fabric: '#c9a77d', woodMid: '#7a5232', woodLight: '#b58b5b', pillowA: '#e0cfa8', pillowB: '#9a4a32', duvet: '#d8c8a8', duvetAccent: '#8a3a2c' },
  H: { rug: '#3f6a56', majlisFabric: '#2f5a45', majlisCream: '#e3d6b8', fabric: '#b9a88a', woodMid: '#5a3a24', woodLight: '#8f6a45', pillowA: '#efe5cc', pillowB: '#7a2a32', duvet: '#e8dfc8', duvetAccent: '#2f5a45' },
  S: { rug: '#b59a76', majlisFabric: '#b89a72', majlisCream: '#d9cdb3', fabric: '#c2ab88', woodMid: '#8a6a46', woodLight: '#c0a073', pillowA: '#e8dec8', pillowB: '#6a5a48', duvet: '#dcd2bc', duvetAccent: '#8a6f4a' },
  C: { rug: '#d9c59c', majlisFabric: '#c9b48a', majlisCream: '#eadfc3', fabric: '#d9ccae', woodMid: '#8a6a44', woodLight: '#b8955f', pillowA: '#f3ecd8', pillowB: '#b89a5a', duvet: '#efe6d0', duvetAccent: '#b89a5a' },
  M: { rug: '#a8a296', majlisFabric: '#a9a396', majlisCream: '#e3ded2', fabric: '#bfb9ab', woodMid: '#b08a5e', woodLight: '#cfae82', pillowA: '#ece8de', pillowB: '#7d8076', duvet: '#e2ddd0', duvetAccent: '#8d8a7e' },
  J: { rug: '#8b7b68', majlisFabric: '#8b7b68', majlisCream: '#d6cab4', fabric: '#a89a85', woodMid: '#5f4430', woodLight: '#8f6e4c', pillowA: '#e4dac6', pillowB: '#6b5a48', duvet: '#d4c9b4', duvetAccent: '#6b5a48' },
});
/** الأرضية لكل طراز ونوع غرفة (من قيم FINISH_ENUMS.floor). */
export const STYLE_FLOORS = Object.freeze({
  N: { majlis: 'tile', living: 'tile', master: 'wood' }, H: { majlis: 'marble', living: 'marble', master: 'wood' }, S: { majlis: 'marble', living: 'marble', master: 'wood' },
  C: { majlis: 'marble', living: 'marble', master: 'wood' }, M: { majlis: 'wood', living: 'wood', master: 'wood' }, J: { majlis: 'marble', living: 'marble', master: 'wood' },
});

// ------------------------------------------------------------------------------------------------ هندسة مستوية صغيرة
const D2R = Math.PI / 180; void D2R;
const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
/** مستطيل موجَّه: مركز ومحور العرض u ومحور العمق v (وحدتان متعامدتان) وأبعاده. */
const obb = (cx, cy, u, v, w, d) => ({ cx, cy, u, v, w, d });
const corners = o => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: o.cx + o.u.x * o.w / 2 * a + o.v.x * o.d / 2 * b, y: o.cy + o.u.y * o.w / 2 * a + o.v.y * o.d / 2 * b }));
function overlap(a, b, gap = 0) { // SAT مع هامش
  const axes = [a.u, a.v, b.u, b.v], A = corners(a), B = corners(b);
  for (const ax of axes) {
    const pa = A.map(p => p.x * ax.x + p.y * ax.y), pb = B.map(p => p.x * ax.x + p.y * ax.y);
    if (Math.max(...pa) <= Math.min(...pb) + gap - 1e-9 || Math.max(...pb) <= Math.min(...pa) + gap - 1e-9) return false;
  }
  return true;
}
/** مستطيل قطعة أثاث بقاعدة المستند: rot مع عقارب الساعة، الأمام = (sin rot, cos rot)، العرض = (cos rot, -sin rot). */
export const fixtureObb = f => { const s = Math.sin(f.rot || 0), c = Math.cos(f.rot || 0); return obb(f.x, f.y, { x: c, y: -s }, { x: s, y: c }, f.w, f.d); };
export const fixtureCorners = f => corners(fixtureObb(f));

function roomEdges(polygon) {
  const ccw = signedArea(polygon) > 0, edges = [];
  for (let i = 0; i < polygon.length; i++) {
    const A = polygon[i], B = polygon[(i + 1) % polygon.length], L = Math.hypot(B.x - A.x, B.y - A.y); if (L < .3) continue;
    const t = norm({ x: B.x - A.x, y: B.y - A.y });
    let n = ccw ? { x: -t.y, y: t.x } : { x: t.y, y: -t.x }; // الداخل
    const mid = { x: (A.x + B.x) / 2 + n.x * .15, y: (A.y + B.y) / 2 + n.y * .15 };
    if (!pointInPolygon(mid, polygon, 1e-9)) n = { x: -n.x, y: -n.y };
    edges.push({ A, B, L, t, n });
  }
  return edges;
}
const distToSeg = (p, A, B) => { const dx = B.x - A.x, dy = B.y - A.y, k = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - A.x - k * dx, p.y - A.y - k * dy); };

/** فتحات الغرفة (أبواب ونوافذ) من النموذج الرأسي: كل فتحة قريبة من حدّ المضلع (≤ 0.4 م). */
export function roomOpenings(level, room) {
  const out = [];
  for (const seg of level.solids.segments) for (const o of seg.openings || []) {
    const c = o.center; if (!c) continue;
    let near = Infinity; for (let i = 0; i < room.polygon.length; i++) near = Math.min(near, distToSeg(c, room.polygon[i], room.polygon[(i + 1) % room.polygon.length]));
    if (near > .4 || out.some(x => x.id === o.id)) continue;
    out.push({ id: o.id, kind: o.kind, door: isDoorKind(o.kind), center: { x: c.x, y: c.y }, dir: norm(o.dir || seg.dir), w: o.w, z0: o.z0, z1: o.z1, swing: o.swing || null, wallT: o.t ?? seg.t });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ المُؤثِّث
class Stage {
  constructor(room, openings, level) {
    this.room = room; this.poly = room.polygon; this.holes = room.holes || []; this.edges = roomEdges(room.polygon); this.openings = openings; this.level = level;
    this.items = []; this.placed = []; this.zones = []; this.notes = [];
    for (const o of openings) {
      let e = null, best = Infinity; for (const ed of this.edges) { const d = distToSeg(o.center, ed.A, ed.B); if (d < best) { best = d; e = ed; } }
      if (!e) continue; o.edge = e;
      const depth = o.door ? STAGING.doorDepth : STAGING.windowDepth, pad = o.door ? STAGING.doorPad : STAGING.windowPad;
      const c = { x: o.center.x + e.n.x * (depth / 2 - .1), y: o.center.y + e.n.y * (depth / 2 - .1) };
      this.zones.push({ box: obb(c.x, c.y, e.t, e.n, o.w + pad * 2, depth), door: o.door, o });
    }
  }
  inside(p) { return pointInPolygon(p, this.poly, 1e-6) && !this.holes.some(h => pointInPolygon(p, h, 1e-9)); }
  free(box, { tall = false, ignoreZones = false, ignorePlaced = false } = {}) {
    if (!corners(box).every(p => this.inside(p))) return false;
    if (!ignorePlaced && this.placed.some(p => overlap(box, p.box, 0))) return false;
    if (!ignoreZones && this.zones.some(z => (z.door || tall) && overlap(box, z.box, 0))) return false;
    return true;
  }
  add(kind, box, rot, extra = {}) {
    const f = { kind, x: +box.cx.toFixed(3), y: +box.cy.toFixed(3), rot: +rot.toFixed(4), w: +box.w.toFixed(3), d: +box.d.toFixed(3), h: extra.h ?? FIXTURES[kind].h, ...(extra.role ? { role: extra.role } : {}) };
    this.items.push(f); if (kind !== 'rug') this.placed.push({ kind, box }); return f;
  }
  /** قطعة ظهرها إلى الجدار، مركزها عند s على الحافة؛ rotOffset للقطع التي تدور (السرير: الرأس نحو الجدار). */
  againstWall(edge, kind, s, w, d, { headToWall = false, h } = {}) {
    const c = { x: edge.A.x + edge.t.x * s + edge.n.x * (d / 2 + STAGING.wallGap), y: edge.A.y + edge.t.y * s + edge.n.y * (d / 2 + STAGING.wallGap) };
    const rot = headToWall ? Math.atan2(-edge.n.x, -edge.n.y) : Math.atan2(edge.n.x, edge.n.y);
    const u = { x: Math.cos(rot), y: -Math.sin(rot) }, v = { x: Math.sin(rot), y: Math.cos(rot) };
    return { box: obb(c.x, c.y, u, v, w, d), rot, h };
  }
  /** المقاطع الحرة على حافة (لا بابًا ولا نافذة للقطع الطويلة). */
  intervals(edge, { windows = false, pad = 0 } = {}) {
    const blocked = [];
    for (const z of this.zones) {
      if (z.o.edge !== edge) continue; if (!z.door && !windows) continue;
      const s = (z.o.center.x - edge.A.x) * edge.t.x + (z.o.center.y - edge.A.y) * edge.t.y, hw = z.o.w / 2 + (z.door ? STAGING.doorPad : STAGING.windowPad) + pad;
      blocked.push([s - hw, s + hw]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    const out = []; let cur = 0;
    for (const [a, b] of blocked) { if (a > cur) out.push([cur, Math.min(a, edge.L)]); cur = Math.max(cur, b); }
    if (cur < edge.L) out.push([cur, edge.L]);
    return out.filter(([a, b]) => b - a > .4);
  }
  windowsOn(edge) { return this.zones.filter(z => !z.door && z.o.edge === edge).reduce((s, z) => s + z.o.w, 0); }
  doorsOn(edge) { return this.zones.filter(z => z.door && z.o.edge === edge).length; }
  /** يحاول وضع القطعة عند s مع إزاحات صغيرة؛ يعيد القطعة المضافة أو null. */
  tryWall(edge, kind, s, w, d, opts = {}) {
    const tall = (opts.h ?? FIXTURES[kind].h) > STAGING.tallH;
    for (let k = 0; k * STAGING.cornerStep <= STAGING.maxShift; k++) for (const sg of k ? [1, -1] : [0]) {
      const ss = s + sg * k * STAGING.cornerStep; if (ss - w / 2 < .012 || ss + w / 2 > edge.L - .012) continue;
      const p = this.againstWall(edge, kind, ss, w, d, opts);
      if (this.free(p.box, { tall })) return this.add(kind, p.box, p.rot, { h: opts.h, role: opts.role });
    }
    return null;
  }
  /** قطعة حرّة المكان (وسط الغرفة) باتجاه محدد. */
  tryFree(kind, cx, cy, rot, w, d, opts = {}) {
    const u = { x: Math.cos(rot), y: -Math.sin(rot) }, v = { x: Math.sin(rot), y: Math.cos(rot) };
    for (const [dx, dy] of [[0, 0], [.2, 0], [-.2, 0], [0, .2], [0, -.2], [.4, 0], [-.4, 0], [0, .4], [0, -.4]]) {
      const box = obb(cx + dx, cy + dy, u, v, w, d);
      if (this.free(box, { ignoreZones: !!opts.ignoreZones, ignorePlaced: !!opts.rug })) return this.add(kind, box, rot, { role: opts.role, h: opts.h });
    }
    return null;
  }
  /** سجادة: أكبر مستطيل ≤ المطلوب يقع داخل الغرفة ولا يلمس الجدار (هامش 0.3) ويُصغَّر تدريجيًا. */
  rug(cx, cy, rot, w, d) {
    for (let k = 1; k >= .55; k -= .075) {
      const u = { x: Math.cos(rot), y: -Math.sin(rot) }, v = { x: Math.sin(rot), y: Math.cos(rot) }, box = obb(cx, cy, u, v, w * k, d * k);
      const grown = obb(cx, cy, u, v, w * k + .6, d * k + .6);
      if (this.free(grown, { ignoreZones: true, ignorePlaced: true })) return this.add('rug', box, rot, { h: FIXTURES.rug.h });
    }
    return null;
  }
}
const longest = (st, f = () => true) => st.edges.filter(f).sort((a, b) => b.L - a.L);

function stageMajlis(st) {
  const F = FIXTURES['majlis-sofa'], seats = [];
  const edges = longest(st).sort((a, b) => (b.L - st.doorsOn(b) * 1.2) - (a.L - st.doorsOn(a) * 1.2));
  for (const e of edges) {
    if (seats.length >= STAGING.maxSeats) break;
    for (const [a, b] of st.intervals(e, { windows: false })) {
      let cur = a + .02;
      while (b - cur >= STAGING.seatMin && seats.length < STAGING.maxSeats) {
        const w = Math.min(STAGING.seatMax, Math.max(STAGING.seatMin, Math.min(STAGING.seatW, b - cur)));
        const f = st.tryWall(e, 'majlis-sofa', cur + w / 2, w, F.d, { role: 'seat' });
        if (f) { seats.push(f); cur += w + .02; } else cur += STAGING.cornerStep * 3;
      }
    }
  }
  if (!seats.length) { st.notes.push('لم تتسع الجلسة العربية'); return; }
  const c = st.room.centroid || st.room.inside, b = st.room.bounds, rot = (b.w >= b.h) ? Math.PI / 2 : 0;
  const rugBox = st.rug(c.x, c.y, rot, Math.min(4.2, b.w - 1.8), Math.min(3.4, b.h - 1.8));
  const tables = Math.min(2, Math.max(1, Math.floor(st.room.area / 14)));
  const T = FIXTURES['coffee-table'];
  for (let i = 0; i < tables; i++) { const off = tables === 1 ? 0 : (i ? .9 : -.9); st.tryFree('coffee-table', c.x + (b.w >= b.h ? off : 0), c.y + (b.w >= b.h ? 0 : off), rot, T.w, T.d, { role: 'table' }); }
  void rugBox;
}
function stageLiving(st) {
  const tvEdge = longest(st).map(e => ({ e, score: e.L - st.windowsOn(e) * 1.5 - st.doorsOn(e) * 2.5 })).sort((a, b) => b.score - a.score)[0]?.e;
  if (!tvEdge) return;
  const TV = FIXTURES['tv-unit'], S3 = FIXTURES['sofa-3'], AC = FIXTURES.armchair, CT = FIXTURES['coffee-table'];
  const ints = st.intervals(tvEdge, { windows: true }).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const iv = ints[0] || [0, tvEdge.L], tv = st.tryWall(tvEdge, 'tv-unit', (iv[0] + iv[1]) / 2, TV.w, TV.d, { role: 'tv' });
  if (!tv) st.notes.push('لم تتسع وحدة التلفاز');
  const sTv = tv ? ((tv.x - tvEdge.A.x) * tvEdge.t.x + (tv.y - tvEdge.A.y) * tvEdge.t.y) : (iv[0] + iv[1]) / 2;
  // عمق الغرفة أمام الشاشة: أبعد نقطة على الخط العمودي حتى الجدار المقابل
  const depthAt = dist => { const p = { x: tvEdge.A.x + tvEdge.t.x * sTv + tvEdge.n.x * dist, y: tvEdge.A.y + tvEdge.t.y * sTv + tvEdge.n.y * dist }; return st.inside(p); };
  let depth = 0; while (depth < 14 && depthAt(depth + .1)) depth += .1;
  const gap = Math.max(1.9, Math.min(STAGING.tvToSofa, depth - S3.d - STAGING.sofaBackGap - TV.d));
  const sofaDist = TV.d + gap + S3.d / 2, face = { x: -tvEdge.n.x, y: -tvEdge.n.y }, rot = Math.atan2(face.x, face.y);
  const at = dist => ({ x: tvEdge.A.x + tvEdge.t.x * sTv + tvEdge.n.x * dist, y: tvEdge.A.y + tvEdge.t.y * sTv + tvEdge.n.y * dist });
  const sc = at(sofaDist);
  if (!st.tryFree('sofa-3', sc.x, sc.y, rot, S3.w, S3.d, { role: 'sofa' })) st.notes.push('لم تتسع الكنبة الثلاثية');
  const mid = at(TV.d + gap / 2 + S3.d * .25 + .1);
  st.rug(mid.x, mid.y, rot, 3.2, 2.4);
  st.tryFree('coffee-table', mid.x, mid.y, rot, CT.w, CT.d, { role: 'table' });
  const side = { x: -tvEdge.n.y, y: tvEdge.n.x }; // محور العرض
  for (const sg of [-1, 1]) {
    const p = { x: mid.x + side.x * sg * 1.55, y: mid.y + side.y * sg * 1.55 }, toC = { x: mid.x - p.x, y: mid.y - p.y };
    st.tryFree('armchair', p.x, p.y, Math.atan2(toC.x, toC.y), AC.w, AC.d, { role: 'chair' });
  }
  const plant = FIXTURES.plant; // نبتة في ركن حرّ
  for (const e of longest(st)) { const [a, b] = [0, e.L]; const f = st.tryWall(e, 'plant', b - .5, plant.w, plant.d, { role: 'decor' }); if (f) break; }
}
function stageMaster(st) {
  const BED = FIXTURES['bed-double'], NS = FIXTURES.nightstand, WD = FIXTURES.wardrobe, TV = FIXTURES['tv-unit'];
  const bedEdge = longest(st).map(e => ({ e, score: e.L - st.windowsOn(e) * 2.5 - st.doorsOn(e) * 3 })).sort((a, b) => b.score - a.score)[0]?.e; if (!bedEdge) return;
  const iv = st.intervals(bedEdge, { windows: true, pad: .2 }).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || [0, bedEdge.L];
  const sMid = (iv[0] + iv[1]) / 2, bed = st.tryWall(bedEdge, 'bed-double', sMid, Math.min(BED.w, 2.2), BED.d, { headToWall: true, role: 'bed' });
  if (!bed) { st.notes.push('لم يتسع السرير'); return; }
  const sBed = (bed.x - bedEdge.A.x) * bedEdge.t.x + (bed.y - bedEdge.A.y) * bedEdge.t.y;
  for (const sg of [-1, 1]) st.tryWall(bedEdge, 'nightstand', sBed + sg * (bed.w / 2 + NS.w / 2 + .05), NS.w, NS.d, { headToWall: true, role: 'nightstand' });
  const foot = { x: bed.x + bedEdge.n.x * .45, y: bed.y + bedEdge.n.y * .45 };
  st.rug(foot.x, foot.y, Math.atan2(bedEdge.n.x, bedEdge.n.y) + Math.PI / 2, 2.8, 2.2);
  const others = longest(st, e => e !== bedEdge);
  for (const e of others) { const ints = st.intervals(e, { windows: true }); const iv2 = ints.sort((a, b) => (b[1] - a[1]) - (b[0] - a[0]))[0]; if (iv2 && iv2[1] - iv2[0] >= WD.w + .1 && st.tryWall(e, 'wardrobe', iv2[0] + WD.w / 2 + .05, WD.w, WD.d, { role: 'wardrobe' })) break; }
  const opp = others.find(e => e.n.x * bedEdge.n.x + e.n.y * bedEdge.n.y < -.9);
  if (opp) { const ints = st.intervals(opp, { windows: true }).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]; if (ints && ints[1] - ints[0] >= TV.w) st.tryWall(opp, 'tv-unit', (ints[0] + ints[1]) / 2, TV.w, TV.d, { role: 'tv' }); }
}
const STAGERS = { majlis: stageMajlis, living: stageLiving, master: stageMaster };
/** للمُؤثِّث الداخلي المتقدّم (interior-dress): الصنف والمؤثّثات نفسها بلا تغيير في سلوكها. */
export { Stage, STAGERS, obb, overlap as obbOverlap };

/** الغرف القابلة للتأثيث في المستند: الأكبر من كل نوع (مجلس/صالة/رئيسية) مع مفتاحها. */
export function stageableRooms(doc) {
  const model = buildingModel(doc), out = [];
  for (const L of model.levels) for (const s of L.spaces) if (STAGE_ROOMS.includes(s.type) && s.polygon?.length >= 3) out.push({ level: L, room: s });
  const best = {}; for (const r of out) { const t = r.room.type; if (!best[t] || r.room.area > best[t].room.area) best[t] = r; }
  return STAGE_ROOMS.filter(t => best[t]).map(t => ({ type: t, key: best[t].room.key || best[t].room.id, levelId: best[t].level.id, area: best[t].room.area, name: best[t].room.name, _r: best[t] }));
}

/**
 * يؤثث غرفة واحدة. يعيد { doc, room, items, counts, openings, notes }:
 *  doc = نسخة من المستند بلا قطع الغرفة القديمة وبقطع التأثيث وأرضية الطراز؛ items = قطع الغرفة (kind, x, y, rot, w, d, h);
 *  counts = عدد كل نوع قطعة رئيسية؛ openings = فتحات الغرفة (للأمانة والمنظور)؛ notes = ما لم يتسع.
 */
export function stageRoom(doc, type, styleId = 'M') {
  if (!STAGE_ROOMS.includes(type)) throw new Error('نوع غرفة غير مدعوم للتأثيث: ' + type);
  const found = stageableRooms(doc).find(r => r.type === type); if (!found) return null;
  const { level, room } = found._r, openings = roomOpenings(level, room), st = new Stage(room, openings, level);
  STAGERS[type](st);
  const out = structuredClone(doc); out.fixtures = (out.fixtures || []).filter(f => !(f.level === level.id && pointInPolygon({ x: f.x, y: f.y }, room.polygon, 1e-9)));
  let id = 0; const used = new Set(out.fixtures.map(f => f.id));
  const nid = () => { let k; do { k = 'f_s' + (++id); } while (used.has(k)); used.add(k); return k; };
  const items = st.items.map(f => ({ id: nid(), level: level.id, kind: f.kind, x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d, h: f.h }));
  out.fixtures.push(...items);
  const style = STYLE_FLOORS[styleId] ? styleId : 'M'; out.finish = { ...(out.finish || {}), floors: { ...(out.finish?.floors || {}), [type]: STYLE_FLOORS[style][type] } };
  const counts = {}; for (const f of st.items) if (f.kind !== 'plant' || true) counts[f.kind] = (counts[f.kind] || 0) + 1;
  const ob = openings.map(o => ({ id: o.id, kind: o.kind, door: o.door, center: o.center, w: o.w, z0: o.z0, z1: o.z1, dir: o.dir, normal: o.edge?.n || null }));
  return { doc: out, type, style, levelId: level.id, level: { E: level.E, H: level.H }, room: { key: room.key || room.id, type, name: room.name, area: room.area, bounds: room.bounds, polygon: room.polygon, centroid: room.centroid, inside: room.inside }, items: st.items, fixtureIds: items.map(i => i.id), counts, openings: ob, notes: st.notes };
}
