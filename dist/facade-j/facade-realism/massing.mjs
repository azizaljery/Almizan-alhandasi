// كتلة البيت: الدور العلوي الحقيقي (تراس وارتدادات من المخطط) ومفردات كتلة لكل طراز (بروزات، مظلات، إطارات، أروقة…).
//
// قسمان:
//  1) massingPlan(...)  — بيانات صِرفة بلا THREE (تُختبر في node): تراسات المخطط + عناصر الكتلة بإحداثيات المشهد
//     (X = س المسقط، Y = الارتفاع، Z = −ص؛ الواجهة الأمامية جنوبية = +Z).
//  2) buildMassing(THREE, ...) — يقصّ ما فوق التراس من المبنى وزخرفة الطراز، ثم يبني الهندسة (دمج لكل خامة + instancing للمكرر).
//
// الصدق:
//  - التراس والارتداد العلوي من المخطط (plan: true): فراغ «balcony» في الدور العلوي تحدّه جدران وحواجز منخفضة (fence).
//  - كل ما عداه (مظلة، إطار، كاسرات، رواق، دعامات…) زخرفة واجهة مقترحة ليست من المخطط (deco: true).
//  - لا عنصر مصمت أمام فتحة، ولا شيء في ممر المدخل، ولا شيء خارج حدود الأرض أو داخل الارتداد الجانبي.
//    البروز الأمامي يدخل الارتداد الأمامي (encroachFrontM) ويُعلن؛ نظاميته «غير متحققة» وتُراجع مع البلدية.
//  - القاعدة مبذورة من بصمة المخطط + الطراز + ذوق العميل: نفس المدخلات ← نفس الكتلة دائمًا.
import { sideTransform } from './model.mjs';
import { floorLevel } from './floors.mjs';
import { designHash } from './variation.mjs';

export const MASSING_NOTE = 'التراس وارتداد الدور العلوي من مخططك؛ عناصر الواجهة الزخرفية (مظلات، إطارات بارزة، كاسرات شمس، أروقة، دعامات) مقترحة للعرض وليست من المخطط';
/** مفردات كل طراز (المعرّفات التي يمكن أن تظهر في plan.vocab). */
export const VOCAB = Object.freeze({
  M: ['roof-cantilever', 'facade-frame', 'entry-canopy', 'entry-portal', 'louvers', 'two-material'],
  J: ['roof-cantilever', 'facade-frame', 'entry-canopy', 'entry-portal', 'louvers', 'two-material'],
  C: ['portico', 'portico-balustrade', 'portico-pediment', 'central-pilasters', 'keystones'],
  N: ['entry-block', 'shurfat', 'luhuj', 'gypsum-band', 'corner-batter', 'mazarib'],
  H: ['rawshan', 'entry-arch', 'parapet-coping'],
  S: ['stone-entry-frame', 'deep-piers', 'triangle-band'],
});
const RAILING = { M: 'glass', J: 'glass', C: 'balustrade', N: 'solid', H: 'timber', S: 'solid' };
const EPS = 1e-4, PLINTH = .45;

// ------------------------------------------------------------------ بذرة حتمية
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const EXT_KEYS = ['feel', 'tone', 'openings', 'screen', 'entrance'];
/** ذوق العميل المؤثر في الكتلة (القيم 'auto' أو الغائبة لا تغيّر البذرة). */
export function tasteOf(exterior) { const t = {}; for (const k of EXT_KEYS) { const v = exterior?.[k]; if (v && v !== 'auto') t[k] = String(v); } return t; }
export function massingSeed(doc, style, exterior) { return (designHash(doc) ^ fnv('mass|' + style + '|' + JSON.stringify(tasteOf(exterior)))) >>> 0; }

// ------------------------------------------------------------------ التراسات من المخطط
/** تراسات الأدوار العليا: فراغ «balcony» تحدّه جدران الدور نفسه. الحافة التي يحدّها حاجز منخفض (fence) مكشوفة، والتي يحدّها جدار هي وجه الكتلة المرتدة. */
export function findTerraces(doc) {
  const L = doc?.levels || [], out = [];
  for (let k = 1; k < L.length; k++) {
    const walls = (doc.walls || []).filter(w => w.level === L[k].id), byId = new Map(walls.map(w => [w.id, w]));
    for (const lab of (doc.labels || [])) {
      if (lab.level !== L[k].id || lab.type !== 'balcony' || !lab.seed) continue;
      const s = lab.seed, hit = { s: null, n: null, e: null, w: null };
      for (const w of walls) {
        const vert = Math.abs(w.a.x - w.b.x) < 1e-3, horz = Math.abs(w.a.y - w.b.y) < 1e-3, pad = (w.t || .2);
        if (vert && s.y > Math.min(w.a.y, w.b.y) - pad && s.y < Math.max(w.a.y, w.b.y) + pad) { const side = w.a.x > s.x ? 'e' : 'w', d = Math.abs(w.a.x - s.x); if (!hit[side] || d < hit[side].d) hit[side] = { d, at: w.a.x, w }; }
        if (horz && s.x > Math.min(w.a.x, w.b.x) - pad && s.x < Math.max(w.a.x, w.b.x) + pad) { const side = w.a.y > s.y ? 'n' : 's', d = Math.abs(w.a.y - s.y); if (!hit[side] || d < hit[side].d) hit[side] = { d, at: w.a.y, w }; }
      }
      if (!hit.s || !hit.n || !hit.e || !hit.w) continue;
      const T = { level: k, name: lab.name || 'تراس', x0: hit.w.at, x1: hit.e.at, y0: hit.s.at, y1: hit.n.at, edges: {}, doors: [] };
      for (const sd of ['s', 'n', 'e', 'w']) T.edges[sd] = hit[sd].w.kind === 'fence' || hit[sd].w.kind === 'parapet' ? 'open' : 'wall';
      for (const o of (doc.openings || [])) { // أبواب التراس (منزلق/باب) على حوافه الجدارية
        const w = byId.get(o.wall); if (!w || !/slider|door/.test(o.kind || '')) continue;
        const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, cx = w.a.x + (w.b.x - w.a.x) * o.at / len, cy = w.a.y + (w.b.y - w.a.y) * o.at / len;
        for (const sd of ['s', 'n', 'e', 'w']) { if (T.edges[sd] !== 'wall') continue; const ns = sd === 's' || sd === 'n', at = sd === 's' ? T.y0 : sd === 'n' ? T.y1 : sd === 'w' ? T.x0 : T.x1;
          if (ns ? (Math.abs(cy - at) < .2 && cx > T.x0 && cx < T.x1) : (Math.abs(cx - at) < .2 && cy > T.y0 && cy < T.y1)) T.doors.push({ edge: sd, c: ns ? cx : cy, w: o.w || 1.8, h: o.h || 2.2, kind: o.kind }); }
      }
      out.push(T);
    }
  }
  return out;
}

// ------------------------------------------------------------------ أوجه المبنى من النموذج المبني
const bbPts = pts => { const us = pts.map(p => p[0]), zs = pts.map(p => p[1]); return { u0: Math.min(...us), u1: Math.max(...us), y0: Math.min(...zs), y1: Math.max(...zs) }; };
/** قطع كل جهة بفتحاتها (كل الأدوار) من طبقات النموذج بعد extrudeFloors. u محلي للجهة، d = البعد خارج وجه الجدار. */
export function facesFromBuilt(built) {
  const faces = {};
  for (const [side, B] of Object.entries(built || {})) {
    if (!B?.layers || !B.F) continue;
    const M = sideTransform(side, B.off), pieces = [];
    for (const pc of B.F.pieces) {
      const wall = B.layers.find(L => L.id === pc.id + '/wall'); if (!wall) continue;
      const wb = bbPts(wall.outer), kind = new Map(pc.openings.map(o => [o.id, o])), ops = [];
      for (const L of B.layers) { if (L.role !== 'frame' || !L.id.startsWith(pc.id + '/')) continue;
        const r = bbPts(L.outer), base = String(L.opening || '').split('@')[0], o = kind.get(base), floor = L.floor || 0, door = floor === 0 && !!o && !/^window/.test(o.kind || '');
        ops.push({ id: L.opening, u0: r.u0, u1: r.u1, y0: r.y0, y1: r.y1, floor, door, entry: door && !!o?.entry }); }
      pieces.push({ id: pc.id, u0: wb.u0, u1: wb.u1, top: wb.y1, face: pc.C + pc.t / 2, t: pc.t, ops });
    }
    faces[side] = { side, M, pieces };
  }
  return faces;
}
const toWorld = (M, u, y, zl) => [M[0][0] * u + M[0][2] * zl + M[0][3], y, M[2][0] * u + M[2][2] * zl + M[2][3]];
const boxOverlap = (a, b, e = EPS) => a.min[0] < b.max[0] - e && a.max[0] > b.min[0] + e && a.min[1] < b.max[1] - e && a.max[1] > b.min[1] + e && a.min[2] < b.max[2] - e && a.max[2] > b.min[2] + e;
/** صندوق العنصر العالمي أيًّا كان نوعه. */
export function elementBox(el) { return { min: el.min, max: el.max }; }

// ------------------------------------------------------------------ الخطة
/**
 * @param doc      المستند الكامل (كل الأدوار، مدخله جنوبي) — للتراسات وحدود الأرض والبذرة
 * @param built    extrudeFloors(buildAllSides(groundDoc)) — للأوجه والفتحات الفعلية (بعد قالب الطراز)
 * @param style    معرّف الطراز (M,J,C,N,H,S)
 * @param exterior ذوق العميل (prefs.exterior)
 */
export function massingPlan({ doc, built, style, exterior = {}, floors = null }) {
  const taste = tasteOf(exterior), seed = massingSeed(doc, style, exterior), R = rng(seed);
  const pick = (arr) => arr[Math.floor(R() * arr.length) % arr.length];
  const faces = facesFromBuilt(built), F = faces.s, plan = { seed, style, taste, vocab: [], elements: [], terraces: [], dropped: [], entry: null, plot: null, encroachFrontM: 0, encroachUpperM: 0, maxProjectionM: 0, upperProjectionM: 0, floors: floors || 1 };
  plan.wallTop = Math.max(0, ...Object.values(faces).flatMap(f => f.pieces.map(p => p.top)));
  const P = (doc?.plot?.polygon || []), sb = doc?.plot?.setbacks || {};
  if (P.length) { const xs = P.map(p => p.x), ys = P.map(p => p.y); plan.plot = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), sb: { s: sb.s || 0, n: sb.n || 0, e: sb.e || 0, w: sb.w || 0 } }; }
  // حد العناصر: داخل الأرض بهامش 0.3 م أمامًا وخلفًا، وعند خط الارتداد الجانبي جانبًا
  const lim = plan.plot ? { min: [plan.plot.minX + Math.max(.3, plan.plot.sb.w), -1, -(plan.plot.maxY - .3)], max: [plan.plot.maxX - Math.max(.3, plan.plot.sb.e), 99, -(plan.plot.minY + .3)] } : null;
  plan.limit = lim;

  // --- التراسات (من المخطط)
  const nFloors = plan.floors;
  for (const T of findTerraces(doc)) {
    if (T.level >= nFloors) continue;
    const FL = floorLevel(T.level), OUT = 3;
    const v = { min: [T.x0 - (T.edges.w === 'open' ? OUT : 0), FL + .12, -T.y1 - (T.edges.n === 'open' ? OUT : 0)], max: [T.x1 + (T.edges.e === 'open' ? OUT : 0), 99, -T.y0 + (T.edges.s === 'open' ? OUT : 0)] };
    plan.terraces.push({ ...T, FL, railing: RAILING[style] || 'solid', void: v, plan: true });
  }
  const inVoid = b => plan.terraces.some(t => boxOverlap(b, t.void, .01));
  if (!F || !F.pieces.length) return plan;

  // --- الواجهة الأمامية: القطعة التي فيها المدخل (أو الأعرض). cp = القطعة الجاري العمل عليها (الواجهة قد تكون متدرجة من عدة قطع)
  const main = F.pieces.find(p => p.ops.some(o => o.entry)) || F.pieces.find(p => p.ops.some(o => o.door)) || F.pieces.slice().sort((a, b) => (b.u1 - b.u0) - (a.u1 - a.u0))[0];
  const M = F.M, U0 = main.u0, U1 = main.u1, H = main.top, roofY = H - .9, two = nFloors >= 2, FL1 = floorLevel(1);
  const gU0 = Math.min(...F.pieces.map(p => p.u0)), gU1 = Math.max(...F.pieces.map(p => p.u1));
  let cp = main, cface = main.face + .04; const use = pc => { cp = pc; cface = pc.face + .04; };
  const e = main.ops.find(o => o.entry) || main.ops.find(o => o.door) || null;
  const W = (u, y, d) => toWorld(M, u, y, cface + d);
  const wbox = (u0, u1, y0, y1, d0, d1) => { const a = W(u0, y0, d0), b = W(u1, y1, d1); return { min: [Math.min(a[0], b[0]), Math.min(y0, y1), Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]), Math.max(y0, y1), Math.max(a[2], b[2])] }; };
  // ممر المدخل: أمام الباب بارتفاعه كله حتى 4 م خارج الوجه — لا يدخله أي عنصر
  if (e) plan.entry = wbox(e.u0, e.u1, e.y0, e.y1, -.3, 4);
  const allOps = F.pieces.flatMap(p => p.ops.map(o => ({ o, box: null, p })));
  for (const x of allOps) { const f = x.p.face + .04, a = toWorld(M, x.o.u0, x.o.y0, f - .5), b = toWorld(M, x.o.u1, x.o.y1, f + 4); x.box = { min: [Math.min(a[0], b[0]), x.o.y0, Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]), x.o.y1, Math.max(a[2], b[2])] }; }
  /** هل الصندوق العالمي مقبول؟ (سبب الرفض أو null) */
  const reject = (b, { screen = false } = {}) => {
    if (lim && (b.min[0] < lim.min[0] - EPS || b.max[0] > lim.max[0] + EPS || b.min[2] < lim.min[2] - EPS || b.max[2] > lim.max[2] + EPS)) return 'خارج حد الأرض/الارتداد الجانبي';
    if (inVoid(b)) return 'فوق التراس';
    if (plan.entry && boxOverlap(b, plan.entry, .005)) return 'في ممر المدخل';
    if (!screen) for (const x of allOps) if (boxOverlap(b, x.box, .005)) return 'أمام الفتحة ' + x.o.id;
    return null;
  };
  let cur = '';
  const push = (el, opt) => { const why = reject(el, opt); if (why) { plan.dropped.push({ id: cur, part: el.part || el.kind, why }); return false; } plan.elements.push({ ...el, id: cur, deco: true, proj: +(el.max[2] - W(cp.u0, 0, 0)[2]).toFixed(3), ...(opt?.screen ? { screen: true } : {}) }); if (!plan.vocab.includes(cur)) plan.vocab.push(cur); return true; };
  const box = (mat, u0, u1, y0, y1, d0, d1, opt = {}) => { if (u1 - u0 < .02 || y1 - y0 < .01 || d1 - d0 < .005) return false; return push({ kind: 'box', mat, part: opt.part, inst: opt.inst, ...wbox(u0, u1, y0, y1, d0, d1) }, opt); };
  /** منشور: مضلع محدب في مستوى الواجهة (u,y) يُبثق بين d0 و d1 (الواجهة الجنوبية: المحور Z). */
  const prism = (mat, pts, d0, d1, opt = {}) => { const us = pts.map(p => p[0]), ys = pts.map(p => p[1]), b = wbox(Math.min(...us), Math.max(...us), Math.min(...ys), Math.max(...ys), d0, d1);
    return push({ kind: 'prism', axis: 'z', mat, part: opt.part, pts: pts.map(([u, y]) => { const w = W(u, y, 0); return [w[0], y]; }), a: b.min[2], b: b.max[2], ...b }, opt); };
  /** منشور جانبي: مضلع في المستوى (d,y) يُبثق على u (كوابيل وأكتاف). */
  const prismX = (mat, pts, u0, u1, opt = {}) => { const ds = pts.map(p => p[0]), ys = pts.map(p => p[1]), b = wbox(u0, u1, Math.min(...ys), Math.max(...ys), Math.min(...ds), Math.max(...ds));
    return push({ kind: 'prism', axis: 'x', mat, part: opt.part, pts: pts.map(([d, y]) => { const w = W(u0, y, d); return [w[2], y]; }), a: b.min[0], b: b.max[0], ...b }, opt); };
  const cyl = (mat, u, d, y0, y1, r, opt = {}) => { const c = W(u, y0, d); return push({ kind: 'cyl', mat, part: opt.part, x: c[0], z: c[2], r, min: [c[0] - r, y0, c[2] - r], max: [c[0] + r, y1, c[2] + r] }, opt); };
  /** الفواصل الخالية من الفتحات على القطعة الجارية ضمن نطاق رأسي. */
  const gaps = (y0, y1, a = cp.u0, b = cp.u1, pad = .18) => { const blk = cp.ops.filter(o => o.y1 > y0 && o.y0 < y1).map(o => [o.u0 - pad, o.u1 + pad]).sort((p, q) => p[0] - q[0]); const out = []; let c = a;
    for (const [s, t] of blk) { if (s > c + EPS) out.push([c, Math.min(s, b)]); c = Math.max(c, t); if (c >= b) break; } if (c < b - EPS) out.push([c, b]); return out.filter(g => g[1] - g[0] > .05); };
  /** المقاطع العليا من قطعة (خارج تراس أمامي). */
  const segsOf = pc => { let segs = [[pc.u0, pc.u1]]; for (const t of plan.terraces) { if (t.edges.s !== 'open') continue; const a = t.x0 - M[0][3], b = t.x1 - M[0][3]; segs = segs.flatMap(([s, q]) => b <= s || a >= q ? [[s, q]] : [[s, Math.max(s, a)], [Math.min(q, b), q]].filter(g => g[1] - g[0] > .4)); } return segs; };
  const topSegs = segsOf(main);
  const slackW = lim ? Math.max(0, W(gU0, 0, 0)[0] - lim.min[0]) : 0, slackE = lim ? Math.max(0, lim.max[0] - W(gU1, 0, 0)[0]) : 0;
  const zFront = Math.max(...F.pieces.map(p => toWorld(M, p.u0, 0, p.face + .04)[2]));
  /** أقصى بروز داخل حد الأرض، محسوبًا من وجه القطعة الجارية. */
  const cap = d => { const room = lim ? lim.max[2] - W(cp.u0, 0, 0)[2] : 2.5; return Math.max(0, Math.min(d, room - .02)); };
  const grand = taste.entrance === 'grand' || taste.feel === 'grand', simple = taste.entrance === 'simple' || taste.feel === 'simple';
  const ec = e ? (e.u0 + e.u1) / 2 : (U0 + U1) / 2;
  // جهة «كتلة المجلس» (الأعرض بعيدًا عن المدخل)
  const featLeft = (ec - U0) > (U1 - ec) + .3 ? true : (U1 - ec) > (ec - U0) + .3 ? false : R() < .5;

  if (style === 'M' || style === 'J') {
    const OV = .32, accent = 'accent', Pj = cap(simple ? .6 : grand ? 1.2 : pick([.7, .9, 1.1]));
    // 1) بلاطة سقف بارزة ببطانة خشب (على كل قطعة من الواجهة عند وجهها)
    cur = 'roof-cantilever';
    for (const pc of F.pieces) { use(pc); const Hp = pc.top;
      for (const [a, b] of segsOf(pc)) { if (b - a < 2) continue; const oL = Math.abs(a - gU0) < EPS ? Math.min(OV, slackW) : 0, oR = Math.abs(b - gU1) < EPS ? Math.min(OV, slackE) : 0;
        box(accent, a - oL, b + oR, Hp - .42, Hp + .04, -.3, Pj, { part: 'slab' }); box('timber', a - oL + .05, b + oR - .05, Hp - .45, Hp - .42, .03, Pj - .05, { part: 'soffit' }); } }
    // 2) إطار واجهة بارز يحيط بكتلة المجلس: القطعة الأعرض غير قطعة المدخل إن كانت الواجهة متدرجة، وإلا جناح الواجهة البعيد عن المدخل
    cur = 'facade-frame';
    const other = F.pieces.filter(p => p !== main && p.u1 - p.u0 >= 3).sort((p, q) => (q.u1 - q.u0) - (p.u1 - p.u0))[0] || null, fp = other || main; use(fp);
    const fLeft = other ? Math.abs(fp.u0 - gU0) < EPS || !(Math.abs(fp.u1 - gU1) < EPS) : featLeft, Hf = fp.top;
    const seg = segsOf(fp).slice().sort((p, q) => (fLeft ? p[0] - q[0] : q[1] - p[1]))[0] || [fp.u0, fp.u1];
    const tf = .32, full = !two || R() < .35, yB = full ? 0 : FL1 - .35, endU = fLeft ? seg[0] : seg[1], stop = other ? (fLeft ? seg[1] : seg[0]) : e ? (fLeft ? Math.min(seg[1], e.u0 - .7) : Math.max(seg[0], e.u1 + .7)) : (fLeft ? seg[1] : seg[0]);
    const gs = gaps(yB, Hf - .45, Math.min(endU, stop), Math.max(endU, stop)).filter(g => g[1] - g[0] >= tf + .06);
    let frame = null;
    if (gs.length) {
      const gIn = fLeft ? gs[gs.length - 1] : gs[0], inner = fLeft ? [gIn[1] - tf, gIn[1]] : [gIn[0], gIn[0] + tf];
      const atEnd = Math.abs(endU - (fLeft ? gU0 : gU1)) < EPS && (fLeft ? slackW : slackE) >= tf - .02;
      const outer = atEnd ? (fLeft ? [endU - tf, endU] : [endU, endU + tf]) : (fLeft ? [gs[0][0], gs[0][0] + tf] : [gs[gs.length - 1][1] - tf, gs[gs.length - 1][1]]);
      const a = Math.min(inner[0], outer[0]), b = Math.max(inner[1], outer[1]);
      if (b - a > 2.2) {
        const okI = box(accent, inner[0], inner[1], yB, Hf - .42, -.02, Pj, { part: 'fin' }), okO = box(accent, outer[0], outer[1], yB, Hf - .42, -.3, Pj, { part: 'fin' });
        if (!full) box(accent, a, b, yB, yB + .35, -.02, Pj, { part: 'beam' });
        if (okI || okO) frame = { a: a + tf, b: b - tf, yB: full ? PLINTH : yB + .35 };
      }
    }
    // 3) كاسرات شمس عمودية (خشب) داخل الإطار: بجانب الزجاج، وأمام الزجاج الواسع إن لم يوجد جدار مصمت أو طلب العميل ساترًا
    cur = 'louvers';
    { const za = frame ? frame.a : fp.u0 + .2, zb = frame ? frame.b : fp.u1 - .2, y0 = two ? FL1 + .15 : PLINTH + .1, y1 = Hf - .5;
      const g = gaps(y0, y1, za, zb, .1).filter(x => x[1] - x[0] >= .6).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
      const slats = (a, b, d, opt) => { const n = Math.max(2, Math.floor((b - a) / .15)), step = (b - a) / n; for (let i = 0; i < n; i++) box('timber', a + i * step + step / 2 - .022, a + i * step + step / 2 + .022, y0, y1, d, d + .12, { part: 'slat', inst: 'slat', ...opt }); };
      if (g) { const w = Math.min(g[1] - g[0], 2.1), nearL = fp.ops.some(o => Math.abs(o.u0 - .1 - g[1]) < .2 && o.y1 > y0); slats(nearL ? g[1] - w : g[0], nearL ? g[1] : g[0] + w, .02); }
      const wide = fp.ops.filter(o => !o.door && o.y1 > y0 && o.y0 < y1 && o.u0 >= za - .1 && o.u1 <= zb + .1).sort((p, q) => (q.u1 - q.u0) - (p.u1 - p.u0))[0];
      if (wide && (taste.screen === 'yes' || taste.openings === 'private')) slats(wide.u0 - .05, wide.u1 + .05, .28, { screen: true });
      else if (wide && !g && wide.u1 - wide.u0 >= 2.4 && taste.screen !== 'no') { const w = (wide.u1 - wide.u0) * .34; if (fLeft) slats(wide.u0 - .05, wide.u0 + w, .28, { screen: true }); else slats(wide.u1 - w, wide.u1 + .05, .28, { screen: true }); } }
    use(main);
    // 4) المدخل: كتلة مزدوجة الارتفاع أو مظلة معلّقة
    if (e) {
      const portal = !simple && (grand || R() < .5), dP = cap(.75);
      let done = false;
      if (portal) { cur = 'entry-portal';
        const upWin = main.ops.filter(o => o.floor >= 1 && o.u1 > e.u0 - .2 && o.u0 < e.u1 + .2), yT = two ? Math.min(H - .5, Math.max(FL1 + 2.6, ...upWin.map(o => o.y1)) + .6) : Math.min(H - .5, e.y1 + .95);
        for (const m of [.75, .45, .25]) { const pw = .42, L = [e.u0 - m - pw, e.u0 - m], Rr = [e.u1 + m, e.u1 + m + pw];
          const free = b => !reject(b); if (L[0] < U0 - EPS || Rr[1] > U1 + EPS || !free(wbox(L[0], L[1], 0, yT, -.02, dP)) || !free(wbox(Rr[0], Rr[1], 0, yT, -.02, dP)) || !free(wbox(L[0], Rr[1], yT - .42, yT, -.02, dP))) continue;
          box(accent, L[0], L[1], 0, yT - .42, -.02, dP, { part: 'pier' }); box(accent, Rr[0], Rr[1], 0, yT - .42, -.02, dP, { part: 'pier' }); box(accent, L[0], Rr[1], yT - .42, yT, -.02, dP, { part: 'beam' });
          box('steel', L[1], Rr[0], e.y1 + .3, e.y1 + .4, -.02, cap(1.25), { part: 'canopy' }); box('timber', L[1] + .03, Rr[0] - .03, e.y1 + .275, e.y1 + .3, .03, cap(1.2), { part: 'soffit' }); done = true; break; } }
      if (!done) { cur = 'entry-canopy'; const dC = cap(grand ? 1.7 : 1.45), m = .7, a = Math.max(U0, e.u0 - m), b = Math.min(U1, e.u1 + m);
        box('steel', a, b, e.y1 + .3, e.y1 + .45, -.02, dC, { part: 'canopy' }); box('timber', a + .04, b - .04, e.y1 + .275, e.y1 + .3, .03, dC - .05, { part: 'soffit' });
        // جدار نصلي يحمل المظلة من جهة واحدة
        const sides = featLeft ? [[b - .28, b], [a, a + .28]] : [[a, a + .28], [b - .28, b]];
        for (const s of sides) if (box(accent, s[0], s[1], 0, e.y1 + .3, -.02, dC, { part: 'blade' })) break; }
    }
    // 5) تباين خامتين: كسوة ثانية على جناح المدخل (بثقوب الفتحات)
    cur = 'two-material';
    { const a = other ? U0 : e ? (featLeft ? e.u0 - .9 : U0) : U0, b = other ? U1 : e ? (featLeft ? U1 : e.u1 + .9) : U1, y0 = PLINTH, y1 = two ? FL1 - .32 : H - .46;
      let rects = [{ u0: Math.max(U0, a), u1: Math.min(U1, b), y0, y1 }];
      for (const o of main.ops) { const h = { u0: o.u0 - .1, u1: o.u1 + .1, y0: o.y0 - (o.door ? 1 : .1), y1: o.y1 + .1 }; rects = rects.flatMap(r => cutRect(r, h)); }
      for (const r of rects) if (r.u1 - r.u0 > .12 && r.y1 - r.y0 > .12) box(style === 'J' ? 'timber' : 'stone2', r.u0, r.u1, r.y0, r.y1, -.02, .06, { part: 'clad' }); }
  }

  if (style === 'C' && e) {
    // 1) رواق مدخل بأعمدة وتاج وجبهة
    cur = 'portico';
    const dc = cap(grand ? 1.7 : simple ? 1.15 : 1.4) - .35, four = grand || R() < .5, cL = e.u0 - .6, cR = e.u1 + .6, yE = Math.max(e.y1 + .35, 3.3), yT = Math.max(yE + .5, 3.85);
    const colsU = four ? [cL - .5, cL, cR, cR + .5] : [cL, cR], a = colsU[0] - .32, b = colsU[colsU.length - 1] + .32;
    const okTop = box('stone', a, b, yE, yT, -.02, dc + .3, { part: 'entablature' });
    if (okTop) {
      box('stone', a - .08, b + .08, yT, yT + .1, -.02, dc + .38, { part: 'cornice' });
      box('stone', a - .2, b + .2, 0, PLINTH - .15, -.02, dc + .55, { part: 'platform' }); box('stone', a - .1, b + .1, PLINTH - .15, PLINTH, -.02, dc + .4, { part: 'platform' }); box('stone', a - .35, b + .35, 0, .15, -.02, dc + .7, { part: 'step' });
      for (const u of colsU) { box('stone', u - .25, u + .25, PLINTH, PLINTH + .2, dc - .25, dc + .25, { part: 'base' }); cyl('stone', u, dc, PLINTH + .2, yE - .2, .17, { part: 'shaft' }); box('stone', u - .24, u + .24, yE - .2, yE, dc - .24, dc + .24, { part: 'capital' }); }
      // أكتاف جدارية خلف الأعمدة
      for (const u of [colsU[0], colsU[colsU.length - 1]]) box('stone', u - .2, u + .2, PLINTH, yE, -.02, .12, { part: 'respond' });
      if (two) { cur = 'portico-balustrade'; // شرفة بدرابزين حجري فوق الرواق
        const y0 = yT + .1, pr = .2; box('stone', a, b, y0, y0 + .08, dc + .12, dc + .3, { part: 'rail' }); box('stone', a, b, y0 + .62, y0 + .72, dc + .1, dc + .32, { part: 'rail' });
        for (const [s0, s1] of [[a, a + .18], [b - .18, b]]) { box('stone', s0, s1, y0, y0 + .08, .02, dc + .12, { part: 'rail' }); box('stone', s0 - .01, s1 + .01, y0 + .62, y0 + .72, .02, dc + .12, { part: 'rail' }); }
        for (const u of [a, b - pr]) box('stone', u, u + pr, y0, y0 + .82, dc + .1, dc + .3, { part: 'pier' });
        const n = Math.max(3, Math.round((b - a - 2 * pr) / .2)); for (let i = 0; i < n; i++) { const u = a + pr + (i + .5) * (b - a - 2 * pr) / n; box('stone', u - .045, u + .045, y0 + .08, y0 + .62, dc + .16, dc + .26, { part: 'baluster', inst: 'bal' }); }
        const ns = Math.max(2, Math.round(dc / .2)); for (const u of [a + .09, b - .09]) for (let i = 0; i < ns; i++) { const d = .1 + (i + .5) * (dc) / ns; box('stone', u - .045, u + .045, y0 + .08, y0 + .62, d - .05, d + .05, { part: 'baluster', inst: 'bal' }); }
      } else { cur = 'portico-pediment'; const m = (a + b) / 2; prism('stone', [[a - .1, yT + .1], [b + .1, yT + .1], [m, yT + .1 + Math.min(.85, (b - a) * .22)]], -.02, dc + .38, { part: 'pediment' }); }
    }
    // 2) بروز محوري للكتلة الوسطى: دعامتان عملاقتان وتاج فوق الدروة
    cur = 'central-pilasters';
    { const pw = .5, y1 = H - .02; let placed = [];
      for (const [sgn, edge] of [[-1, e.u0 - 1.5], [1, e.u1 + 1.5]]) { const lo = sgn < 0 ? Math.max(U0, edge - 2.2) : edge, hi = sgn < 0 ? edge : Math.min(U1, edge + 2.2);
        const g = gaps(PLINTH, y1, lo, hi).filter(x => x[1] - x[0] >= pw + .04).sort((p, q) => sgn < 0 ? q[1] - p[1] : p[0] - q[0])[0]; if (!g) continue;
        const u0 = sgn < 0 ? g[1] - pw : g[0]; if (box('stone', u0, u0 + pw, 0, y1, -.02, .28, { part: 'pilaster' })) { placed.push(u0); box('stone', u0 - .06, u0 + pw + .06, y1 - .3, y1, -.02, .36, { part: 'capital' }); box('stone', u0 - .05, u0 + pw + .05, 0, .6, -.02, .34, { part: 'base' }); } }
      if (placed.length === 2 && topSegs.some(s => s[0] <= placed[0] + EPS && s[1] >= placed[1] + pw - EPS)) { box('stone', placed[0] - .06, placed[1] + pw + .06, H, H + .42, -.3, .3, { part: 'attic' }); box('stone', placed[0] - .14, placed[1] + pw + .14, H + .42, H + .52, -.34, .4, { part: 'attic-cornice' }); } }
    // 3) مفتاح عقد فوق نوافذ الواجهة
    cur = 'keystones';
    for (const o of main.ops) { if (o.door) continue; const c = (o.u0 + o.u1) / 2, y = o.y1 + .03; prism('stone', [[c - .08, y], [c + .08, y], [c + .13, y + .3], [c - .13, y + .3]], .0, .24, { part: 'keystone' }); }
  }

  if (style === 'N') {
    // 1) كتلة مدخل بارزة تعلو الدروة بشُرَف ولهوج وحزام جصي وعتبة
    if (e) { cur = 'entry-block';
      const dB = cap(grand ? .95 : .8), yT = two ? H + .3 : H + .4, upWin = main.ops.filter(o => o.floor >= 1 && o.u1 > e.u0 - 1 && o.u0 < e.u1 + 1), yBeam = two ? Math.max(FL1 + 2.6, ...upWin.map(o => o.y1)) + .35 : e.y1 + .4;
      let blk = null;
      for (const [m, pw] of [[.35, .65], [.2, .65], [.1, .65], [.1, .45], [.06, .3]]) { const L = [e.u0 - m - pw, e.u0 - m], Rr = [e.u1 + m, e.u1 + m + pw]; if (L[0] < U0 - EPS || Rr[1] > U1 + EPS || reject(wbox(L[0], L[1], 0, yT, -.02, dB)) || reject(wbox(Rr[0], Rr[1], 0, yT, -.02, dB)) || reject(wbox(L[0], Rr[1], yBeam, yT, -.02, dB))) continue;
        prismX('mud', [[-.02, 0], [dB + .08, 0], [dB, yT], [-.02, yT]], L[0], L[1], { part: 'pier' }); prismX('mud', [[-.02, 0], [dB + .08, 0], [dB, yT], [-.02, yT]], Rr[0], Rr[1], { part: 'pier' });
        box('mud', L[1], Rr[0], yBeam, yT, -.02, dB, { part: 'beam' }); if (two) box('mud', L[1], Rr[0], e.y1 + .4, FL1 + .55, -.02, dB - .25, { part: 'spandrel' });
        box('mud', L[0] - .25, Rr[1] + .25, 0, .2, -.02, dB + .45, { part: 'threshold' }); blk = { a: L[0], b: Rr[1], yBeam, yT, dB }; break; }
      if (!blk) { // لا متسع لكتفين بجانب الباب: كتلة عتب بارزة فوق المدخل
        const a = Math.max(U0, e.u0 - .3), b = Math.min(U1, e.u1 + .3), y0 = e.y1 + .35, y1 = two ? FL1 + .6 : H + .4, dH = cap(.55);
        if (box('mud', a, b, y0, y1, -.02, dH, { part: 'beam' })) blk = { a, b, yBeam: y0, yT: y1, dB: dH, low: two }; }
      if (blk) {
        cur = 'gypsum-band'; box('gypsum', blk.a - .02, blk.b + .02, blk.yT - .2, blk.yT - .08, blk.dB - .01, blk.dB + .03, { part: 'band' }); box('gypsum', blk.a - .02, blk.b + .02, blk.yBeam + .02, blk.yBeam + .1, blk.dB - .01, blk.dB + .03, { part: 'band' });
        cur = 'shurfat'; if (!blk.low) { const n = Math.max(3, Math.round((blk.b - blk.a) / .52)), st = (blk.b - blk.a) / n; for (let i = 0; i < n; i++) { const u = blk.a + i * st; prism('mud', [[u + .04, blk.yT], [u + st - .04, blk.yT], [u + st * .5, blk.yT + .42]], blk.dB - .38, blk.dB, { part: 'shurfa' }); } }
        cur = 'luhuj'; { const cy = (blk.yBeam + .1 + blk.yT - .2) / 2, c = (blk.a + blk.b) / 2, room = blk.yT - blk.yBeam; if (room > .75) for (const [du, dy] of [[-.36, -.12], [0, -.12], [.36, -.12], [-.18, .17], [.18, .17]]) prism('dark', [[c + du - .11, cy + dy - .1], [c + du + .11, cy + dy - .1], [c + du, cy + dy + .12]], blk.dB - .05, blk.dB + .004, { part: 'lahj' }); }
      }
    }
    // 2) أكتاف مائلة عند زاويتي الواجهة (ميل الجدران النجدي)
    cur = 'corner-batter';
    for (const [pc, s] of [[F.pieces.find(p => Math.abs(p.u0 - gU0) < EPS), 1], [F.pieces.find(p => Math.abs(p.u1 - gU1) < EPS), -1]]) { if (!pc) continue; use(pc); const u = s > 0 ? pc.u0 : pc.u1, yb = pc.top - 1.0;
      if (!segsOf(pc).some(g => (s > 0 ? Math.abs(g[0] - pc.u0) < EPS : Math.abs(g[1] - pc.u1) < EPS))) continue;
      for (const w of [.85, .55, .35]) if (prism('mud', s > 0 ? [[u, 0], [u + w, 0], [u + w * .55, yb], [u, yb]] : [[u - w, 0], [u, 0], [u, yb], [u - w * .55, yb]], -.02, .24, { part: 'batter' })) break; }
    // 3) مزاريب خشبية تحت الدروة على كل قطع الواجهة
    cur = 'mazarib';
    for (const pc of F.pieces) { use(pc); const y = pc.top - 1.02, w = pc.u1 - pc.u0, n = Math.max(1, Math.round(w / 3.4)); for (let i = 0; i < n; i++) { const u = pc.u0 + (i + .5) * w / n + (R() - .5) * .5; box('timber', u - .06, u + .06, y - .1, y, -.02, cap(.55), { part: 'mizrab' }); } }
    use(main);
  }

  if (style === 'H') {
    // 1) روشان خشبي بارز بمشربية على نوافذ العلوي (أو النافذة الرئيسية في الدور الواحد)
    cur = 'rawshan';
    { const cand = main.ops.filter(o => !o.door && (two ? o.floor >= 1 : true) && o.u1 - o.u0 >= .9 && !plan.terraces.some(t => t.edges.s === 'open' && o.floor >= t.level && o.u1 + M[0][3] > t.x0 && o.u0 + M[0][3] < t.x1)).sort((p, q) => (q.u1 - q.u0) - (p.u1 - p.u0));
      const max = grand ? 3 : simple ? 1 : 2, dR = cap(.72); let n = 0;
      for (const o of cand) { if (n >= max) break; const a = o.u0 - .32, b = o.u1 + .32, yb = o.y0 - .42, yt = o.y1 + .32;
        if (reject(wbox(a, b, yb - .5, yb, -.02, dR)) || reject(wbox(a, a + .07, yb, yt, 0, dR)) || reject(wbox(b - .07, b, yb, yt, 0, dR))) continue; n++;
        box('timber', a, b, yb - .12, yb, -.02, dR, { part: 'base' }); if (yb - .62 > .25) for (const u of [a + .08, (a + b) / 2 - .05, b - .18]) prismX('timber', [[-.02, yb - .12], [dR - .12, yb - .12], [-.02, yb - .62]], u, u + .1, { part: 'bracket' });
        box('timber', a - .06, b + .06, yt, yt + .1, -.02, dR + .1, { part: 'hood' }); box('timber', a + .05, b - .05, yt + .1, yt + .3, -.02, dR - .12, { part: 'crown' });
        box('timber', a, a + .07, yb, yt, 0, dR, { part: 'cheek' }); box('timber', b - .07, b, yb, yt, 0, dR, { part: 'cheek' });
        // واجهة الروشان: حشوة سفلية ومشربية (ساتر مثقّب أمام الزجاج)
        box('timber', a + .07, b - .07, yb, yb + .55, dR - .05, dR, { part: 'panel', screen: true }); box('timber', a + .07, b - .07, yt - .16, yt, dR - .05, dR, { part: 'panel', screen: true });
        const nv = Math.max(4, Math.round((b - a - .14) / .13)); for (let i = 1; i < nv; i++) { const u = a + .07 + i * (b - a - .14) / nv; box('timber', u - .016, u + .016, yb + .55, yt - .16, dR - .04, dR - .01, { part: 'lattice', inst: 'lat', screen: true }); }
        const nh = Math.max(3, Math.round((yt - yb - .71) / .13)); for (let i = 1; i < nh; i++) { const y = yb + .55 + i * (yt - yb - .71) / nh; box('timber', a + .07, b - .07, y - .016, y + .016, dR - .045, dR - .015, { part: 'lattice', inst: 'lat', screen: true }); } } }
    // 2) عقد للمدخل على كتفين
    if (e) { cur = 'entry-arch'; const dA = cap(.5), ri = (e.u1 - e.u0) / 2 + .22, ro = ri + .36, ys = e.y1 + .12, c = ec;
      const okL = !reject(wbox(c - ro, c - ri, 0, ys, -.02, dA)), okR = !reject(wbox(c + ri, c + ro, 0, ys, -.02, dA)), okA = !reject(wbox(c - ro, c + ro, ys, ys + ro, -.02, dA));
      if (okL && okR && okA) { box('stone', c - ro, c - ri, 0, ys, -.02, dA, { part: 'pier' }); box('stone', c + ri, c + ro, 0, ys, -.02, dA, { part: 'pier' });
        box('stone', c - ro - .05, c - ri + .05, ys - .14, ys, -.02, dA + .05, { part: 'impost' }); box('stone', c + ri - .05, c + ro + .05, ys - .14, ys, -.02, dA + .05, { part: 'impost' });
        const N = 12; for (let i = 0; i < N; i++) { const t0 = Math.PI * i / N, t1 = Math.PI * (i + 1) / N; prism('stone', [[c + ri * Math.cos(t0), ys + ri * Math.sin(t0)], [c + ro * Math.cos(t0), ys + ro * Math.sin(t0)], [c + ro * Math.cos(t1), ys + ro * Math.sin(t1)], [c + ri * Math.cos(t1), ys + ri * Math.sin(t1)]], -.02, dA, { part: 'voussoir' }); }
        box('stone', c - ro - .1, c + ro + .1, 0, .2, -.02, dA + .5, { part: 'threshold' }); } }
    // 3) دروة بسيطة بغطاء
    cur = 'parapet-coping';
    for (const [a, b] of topSegs) box('stone', a - Math.min(.06, slackW), b + Math.min(.06, slackE), H, H + .09, -.3, .1, { part: 'coping' });
  }

  if (style === 'S') {
    const dP = cap(.4);
    // 1) إطار مدخل حجري عميق
    if (e) { cur = 'stone-entry-frame'; const dE = cap(grand ? .9 : .72), pw = .55;
      for (const m of [.25, .12]) { const L = [e.u0 - m - pw, e.u0 - m], Rr = [e.u1 + m, e.u1 + m + pw], yT = e.y1 + .85; if (reject(wbox(L[0], L[1], 0, yT, -.02, dE)) || reject(wbox(Rr[0], Rr[1], 0, yT, -.02, dE)) || reject(wbox(L[0], Rr[1], e.y1 + .25, yT, -.02, dE))) continue;
        box('stone', L[0], L[1], 0, yT, -.02, dE, { part: 'pier' }); box('stone', Rr[0], Rr[1], 0, yT, -.02, dE, { part: 'pier' }); box('stone', L[1], Rr[0], e.y1 + .25, yT, -.02, dE, { part: 'lintel' });
        box('stone', L[0] - .2, Rr[1] + .2, 0, .2, -.02, dE + .5, { part: 'threshold' });
        cur = 'triangle-band'; const n = Math.max(3, Math.round((Rr[0] - L[1]) / .3)), st = (Rr[0] - L[1]) / n; for (let i = 0; i < n; i++) { const u = L[1] + i * st; prism('dark', i % 2 ? [[u + .03, yT - .12], [u + st - .03, yT - .12], [u + st / 2, yT - .4]] : [[u + .03, yT - .4], [u + st - .03, yT - .4], [u + st / 2, yT - .12]], dE - .04, dE + .004, { part: 'tri' }); }
        break; } }
    // 2) دعامات رأسية عميقة بين الفتحات وعتب علوي: الفتحات تقرأ غائرة ≥ 0.35 م
    cur = 'deep-piers';
    const spans = []; let yTop = H - .95;
    for (const pc of F.pieces) { use(pc); yTop = pc.top - .95; for (const [a, b] of segsOf(pc)) { let any = false;
      for (const g of gaps(PLINTH, yTop, a, b, .22)) { const w = g[1] - g[0]; if (w < .5) continue; const n = w > 2.6 ? 2 : 1, pw = Math.min(.7, w / n - (n > 1 ? .5 : 0));
        const us = n === 1 ? [[(g[0] + g[1]) / 2 - pw / 2, (g[0] + g[1]) / 2 + pw / 2]] : [[g[0], g[0] + pw], [g[1] - pw, g[1]]];
        for (const [p0, p1] of us) if (box('stone', p0, p1, 0, yTop, -.02, dP, { part: 'pier' })) any = true; }
      const head = Math.max(0, ...pc.ops.filter(o => o.u1 > a && o.u0 < b).map(o => o.y1)), yb = Math.max(yTop - .32, head + .06);
      if (any && yTop - yb >= .2 && box('stone', a, b, yb, yTop, -.02, dP, { part: 'beam' })) spans.push([a, b, yb, pc, yTop]); } }
    use(main);
    // 3) حزام مثلثات معاصر على العتب العلوي
    cur = 'triangle-band';
    for (const [a, b, yb, pc, yTop] of spans) { use(pc); const n = Math.max(4, Math.round((b - a) / .42)), st = (b - a) / n, h = yTop - yb; for (let i = 0; i < n; i++) { const u = a + i * st; prism('gypsum', [[u + .06, yb + h * .16], [u + st - .06, yb + h * .16], [u + st / 2, yTop - h * .16]], dP - .02, dP + .03, { part: 'tri' }); } }
    use(main);
  }

  // أقصى دخول في الارتداد الأمامي (يُعلن بصدق)
  // encroachFrontM: أي عنصر (درج ورواق ومظلة)؛ encroachUpperM: العناصر المعلّقة فوق 2.4 م (بلاطة السقف والإطار والرواشين)
  if (plan.plot) { const line = -(plan.plot.minY + plan.plot.sb.s); for (const el of plan.elements) { const d = +(el.max[2] - line).toFixed(3); plan.encroachFrontM = Math.max(plan.encroachFrontM, d); if (el.min[1] >= 2.4) plan.encroachUpperM = Math.max(plan.encroachUpperM, d); } }
  // البروز عن وجه الجدار الحامل نفسه (القالب قد يقدّم جدار الواجهة أو يؤخره عن خط المخطط)
  for (const el of plan.elements) { plan.maxProjectionM = Math.max(plan.maxProjectionM, el.proj); if (el.min[1] >= 2.4) plan.upperProjectionM = Math.max(plan.upperProjectionM, el.proj); }
  return plan;
}
/** r \ h (مستطيلات u,y). */
function cutRect(r, h) {
  if (!(Math.min(r.u1, h.u1) - Math.max(r.u0, h.u0) > EPS && Math.min(r.y1, h.y1) - Math.max(r.y0, h.y0) > EPS)) return [r];
  const a0 = Math.max(r.u0, h.u0), a1 = Math.min(r.u1, h.u1), b0 = Math.max(r.y0, h.y0), b1 = Math.min(r.y1, h.y1), out = [];
  if (r.u0 < a0 - EPS) out.push({ u0: r.u0, u1: a0, y0: r.y0, y1: r.y1 });
  if (a1 < r.u1 - EPS) out.push({ u0: a1, u1: r.u1, y0: r.y0, y1: r.y1 });
  if (r.y0 < b0 - EPS) out.push({ u0: a0, u1: a1, y0: r.y0, y1: b0 });
  if (b1 < r.y1 - EPS) out.push({ u0: a0, u1: a1, y0: b1, y1: r.y1 });
  return out;
}

// ------------------------------------------------------------------ عناصر التراس (من المخطط)
/** عناصر التراس: أرضية، جدران الكتلة المرتدة (بفتحة الباب المنزلق)، درابزين الحواف المكشوفة. بإحداثيات المشهد. */
export function terraceElements(T, { top }) {
  const E = [], FL = T.FL, x0 = T.x0, x1 = T.x1, z0 = -T.y1, z1 = -T.y0, add = (mat, part, min, max, o = {}) => E.push({ kind: 'box', mat, part, min, max, id: 'terrace', plan: true, ...o });
  add('paving', 'floor', [x0 - .1, FL - .3, z0 - .1], [x1 + .1, FL + .05, z1 + .1]);
  const tw = .125;
  for (const sd of ['s', 'n', 'e', 'w']) {
    const ns = sd === 's' || sd === 'n', at = sd === 's' ? z1 : sd === 'n' ? z0 : sd === 'w' ? x0 : x1, a = ns ? x0 : z0, b = ns ? x1 : z1;
    const seg = (mat, part, p, q, y0, y1, t0, t1, o) => add(mat, part, ns ? [p, y0, at + t0] : [at + t0, y0, p], ns ? [q, y1, at + t1] : [at + t1, y1, q], o);
    const inward = sd === 's' || sd === 'e' ? -1 : 1; // اتجاه داخل التراس على محور الحافة
    if (T.edges[sd] === 'wall') { // وجه الكتلة المرتدة: جدار كامل الارتفاع بفتحة الباب المنزلق
      const ds = T.doors.filter(d => d.edge === sd).map(d => { const c = ns ? d.c : -d.c; return { a: Math.max(a + .3, c - d.w / 2), b: Math.min(b - .3, c + d.w / 2), h: Math.min(d.h, 2.4) }; }).filter(d => d.b - d.a > .6).sort((p, q) => p.a - q.a);
      let c = a - tw; for (const d of ds) { seg('body', 'wall', c, d.a, FL, top, -tw, tw); seg('body', 'wall', d.a, d.b, FL + d.h, top, -tw, tw);
        const g0 = inward * -.03, g1 = inward * -.01; seg('glass', 'slider', d.a + .05, d.b - .05, FL + .08, FL + d.h - .05, Math.min(g0, g1), Math.max(g0, g1));
        const f0 = inward * -.06, f1 = inward * .02; for (const [p, q, y0, y1] of [[d.a, d.a + .05, FL + .05, FL + d.h], [d.b - .05, d.b, FL + .05, FL + d.h], [d.a, d.b, FL + d.h - .05, FL + d.h], [(d.a + d.b) / 2 - .025, (d.a + d.b) / 2 + .025, FL + .05, FL + d.h]]) seg('steel', 'slider-frame', p, q, y0, y1, Math.min(f0, f1), Math.max(f0, f1));
        const k0 = inward * -.5, k1 = inward * -.45; seg('interior', 'slider-back', d.a - .1, d.b + .1, FL, FL + d.h + .1, Math.min(k0, k1), Math.max(k0, k1)); c = d.b; }
      seg('body', 'wall', c, b + tw, FL, top, -tw, tw); seg('accent', 'coping', a - tw - .02, b + tw + .02, top, top + .06, -tw - .03, tw + .03);
    } else { // حافة مكشوفة: درابزين فوق جدار الأرضي
      const y0 = FL + .12, kind = T.railing;
      if (kind === 'glass') { seg('accent', 'curb', a, b, y0 - .14, y0 + .06, -.16, .16); seg('glass', 'rail-glass', a + .05, b - .05, y0 + .06, y0 + 1.05, -.012, .012); seg('steel', 'rail-top', a, b, y0 + 1.05, y0 + 1.09, -.03, .03);
        const n = Math.max(1, Math.round((b - a) / 1.5)); for (let i = 0; i <= n; i++) { const p = a + (b - a) * i / n; seg('steel', 'rail-post', Math.max(a, p - .02), Math.min(b, p + .02), y0 + .06, y0 + 1.05, -.025, .025, { inst: 'post' }); } }
      else if (kind === 'balustrade') { seg('stone', 'rail', a - .16, b + .16, y0 - .14, y0 + .1, -.16, .16); seg('stone', 'rail', a - .16, b + .16, y0 + .72, y0 + .84, -.15, .15);
        const n = Math.max(2, Math.round((b - a) / .22)); for (let i = 0; i < n; i++) { const p = a + (i + .5) * (b - a) / n; seg('stone', 'baluster', p - .05, p + .05, y0 + .1, y0 + .72, -.05, .05, { inst: 'bal' }); }
        const np = Math.max(1, Math.round((b - a) / 2.6)); for (let i = 0; i <= np; i++) { const p = a + (b - a) * i / np; seg('stone', 'pier', p - .14, p + .14, y0 - .14, y0 + .95, -.14, .14); } }
      else if (kind === 'timber') { seg('stone', 'curb', a - .14, b + .14, y0 - .14, y0 + .3, -.14, .14); seg('timber', 'rail', a, b, y0 + .3, y0 + .36, -.04, .04); seg('timber', 'rail', a, b, y0 + 1.0, y0 + 1.08, -.05, .05);
        const n = Math.max(2, Math.round((b - a) / .12)); for (let i = 0; i <= n; i++) { const p = a + (b - a) * i / n; seg('timber', 'spindle', Math.max(a, p - .018), Math.min(b, p + .018), y0 + .36, y0 + 1.0, -.018, .018, { inst: 'lat' }); } }
      else { seg('body', 'parapet', a - .14, b + .14, y0 - .14, y0 + .95, -.14, .14); seg('accent', 'coping', a - .18, b + .18, y0 + .95, y0 + 1.02, -.18, .18); }
    }
  }
  return E;
}

// ================================================================== البناء (THREE)
const PALETTE = {
  M: { accent: ['#d6cab4', 'mass-travertine-stone', .78], stone2: ['#bfae93', 'mass-travertine-stone-dark', .8], timber: '#8a5a36' },
  J: { accent: ['#cfc6b6', 'mass-limestone-stone', .7], stone2: ['#a79f92', 'mass-stone-grey', .8], timber: '#7b5232' },
  C: { stone: 'body', accent: ['#e6dac0', 'mass-limestone-stone', .8], timber: '#5b3d26' },
  N: { mud: 'body', accent: ['#c69d6b', 'mass-najdi-mud', .95], stone: ['#c69d6b', 'mass-najdi-mud', .95], timber: '#5d4027' },
  H: { stone: 'body', accent: ['#efe8d8', 'mass-coral-stone', .85], timber: '#5a3a24' },
  S: { stone: 'body', accent: ['#d2bd97', 'mass-riyadh-stone', .85], timber: '#6a4a2e' },
};
/** خامة الجدار الغالبة على الواجهة الأمامية (بعد تطبيق الطراز): أكبر شبكة ظاهرة غير شفافة قرب وجه الواجهة. */
function frontBodyMaterial(THREE, scene, S, skip) {
  let zf = -1e9; const bx = new THREE.Box3();
  for (const m of S.meshes) { const r = m.userData?.role; if (r === 'wall' || r === 'cladding') { bx.setFromObject(m); zf = Math.max(zf, bx.max.z); } }
  let cands = [];
  scene.traverse(o => { if (!(o.isMesh || o.isInstancedMesh) || !o.visible || skip.has(o) || o.name === 'ground') return; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || m.transparent || !m.isMeshStandardMaterial || (m.emissiveIntensity > .5 && m.emissive?.r > .2)) return;
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
    bx.setFromObject(o); if (bx.max.z < zf - .25 || bx.max.z > zf + .35) return; const a = (bx.max.x - bx.min.x) * (bx.max.y - bx.min.y); cands.push({ m, a, z: bx.max.z }); });
  // الأكبر مساحةً ثم الأقرب إلى الخارج (كسوة الحجر تعلو لوح الجدار المصمت)
  const amax = Math.max(0, ...cands.map(c => c.a)); cands = cands.filter(c => c.a >= amax * .45).sort((p, q) => q.z - p.z);
  return cands[0]?.m || null;
}
function prismGeo(THREE, el) {
  const pts = el.pts, n = pts.length, pos = [], P = (h, y, t) => el.axis === 'z' ? [h, y, t] : [t, y, h];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 1; i < n - 1; i++) { tri(P(pts[0][0], pts[0][1], el.a), P(pts[i][0], pts[i][1], el.a), P(pts[i + 1][0], pts[i + 1][1], el.a)); tri(P(pts[0][0], pts[0][1], el.b), P(pts[i][0], pts[i][1], el.b), P(pts[i + 1][0], pts[i + 1][1], el.b)); }
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], A = P(p[0], p[1], el.a), B = P(q[0], q[1], el.a), C = P(q[0], q[1], el.b), D = P(p[0], p[1], el.b); tri(A, B, C); tri(A, C, D); }
  // توجيه الأوجه إلى الخارج (المجسّم محدب): يُقلب المثلث الذي يتجه عموده نحو المركز
  const c = [0, 0, 0]; for (let i = 0; i < pos.length; i += 3) { c[0] += pos[i]; c[1] += pos[i + 1]; c[2] += pos[i + 2]; } const m = pos.length / 3; c[0] /= m; c[1] /= m; c[2] /= m;
  for (let i = 0; i < pos.length; i += 9) { const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2], bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, dx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3 - c[0], dy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3 - c[1], dz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3 - c[2];
    if (nx * dx + ny * dy + nz * dz < 0) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.computeVertexNormals(); return g;
}
/** إحداثيات UV بالأمتار (إسقاط صندوقي عالمي). */
function metricUV(THREE, g) {
  const p = g.attributes.position, n = g.attributes.normal, out = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) { out[i * 2] = p.getX(i); out[i * 2 + 1] = -p.getZ(i); } else if (ax >= az) { out[i * 2] = p.getZ(i); out[i * 2 + 1] = p.getY(i); } else { out[i * 2] = p.getX(i); out[i * 2 + 1] = p.getY(i); } }
  g.setAttribute('uv', new THREE.BufferAttribute(out, 2)); return g;
}
function elementGeo(THREE, el) {
  let g;
  if (el.kind === 'box') { g = new THREE.BoxGeometry(el.max[0] - el.min[0], el.max[1] - el.min[1], el.max[2] - el.min[2]); g.translate((el.min[0] + el.max[0]) / 2, (el.min[1] + el.max[1]) / 2, (el.min[2] + el.max[2]) / 2); }
  else if (el.kind === 'cyl') { g = new THREE.CylinderGeometry(el.r * .86, el.r, el.max[1] - el.min[1], 16, 1); g.translate(el.x, (el.min[1] + el.max[1]) / 2, el.z); }
  else g = prismGeo(THREE, el);
  if (g.index) { const t = g.toNonIndexed(); g.dispose(); g = t; }
  return metricUV(THREE, g);
}
function merge(THREE, geos) {
  const n = geos.reduce((t, g) => t + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of geos) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += c; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
}

/**
 * قصّ شبكة خارج صندوق محاذٍ للمحاور (يُحذف ما بداخله). يحفظ كل خصائص الرؤوس بالاستيفاء. يعيد: 0 لا تقاطع، 1 قُصّت، 2 أُخفيت كلها.
 * لا يمسّ الهندسة الأصلية (قد تكون مشتركة): تُستبدل بنسخة مقصوصة.
 */
export function clipMeshOutsideBox(THREE, mesh, bx) {
  const g = mesh.geometry; if (!g?.attributes?.position) return 0;
  mesh.updateWorldMatrix(true, false);
  const wb = new THREE.Box3().setFromObject(mesh); if (wb.isEmpty() || wb.max.x <= bx.min.x || wb.min.x >= bx.max.x || wb.max.y <= bx.min.y || wb.min.y >= bx.max.y || wb.max.z <= bx.min.z || wb.min.z >= bx.max.z) return 0;
  const E = .002;
  if (wb.min.x >= bx.min.x - E && wb.max.x <= bx.max.x + E && wb.min.y >= bx.min.y - E && wb.max.y <= bx.max.y + E && wb.min.z >= bx.min.z - E && wb.max.z <= bx.max.z + E) { mesh.visible = false; mesh.userData.massClipped = 'hidden'; return 2; }
  if (mesh.isInstancedMesh) { // النسخ التي مركزها داخل الفراغ تُصفَّر
    const m4 = new THREE.Matrix4(), c = new THREE.Vector3(); g.computeBoundingBox(); const gc = g.boundingBox.getCenter(new THREE.Vector3()), zero = new THREE.Matrix4().makeScale(0, 0, 0); let n = 0;
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m4); c.copy(gc).applyMatrix4(m4).applyMatrix4(mesh.matrixWorld); if (c.x > bx.min.x && c.x < bx.max.x && c.y > bx.min.y && c.y < bx.max.y && c.z > bx.min.z && c.z < bx.max.z) { mesh.setMatrixAt(i, zero); n++; } }
    if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.userData.massClipped = 'instances'; } return n ? 1 : 0; }
  const names = Object.keys(g.attributes), attrs = names.map(k => g.attributes[k]), sizes = attrs.map(a => a.itemSize), stride = 3 + sizes.reduce((a, b) => a + b, 0);
  const idx = g.index, triCount = (idx ? idx.count : g.attributes.position.count) / 3, v = new THREE.Vector3();
  const read = i => { const o = new Float64Array(stride); v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(mesh.matrixWorld); o[0] = v.x; o[1] = v.y; o[2] = v.z; let k = 3; for (let a = 0; a < attrs.length; a++) for (let c = 0; c < sizes[a]; c++) o[k++] = attrs[a].array[i * sizes[a] + c]; return o; };
  const lerp = (a, b, t) => { const o = new Float64Array(stride); for (let k = 0; k < stride; k++) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
  /** يقسم مضلعًا بمستوى axis=val: [الجزء الأدنى، الجزء الأعلى]. */
  const split = (poly, ax, val) => { const lo = [], hi = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], da = a[ax] - val, db = b[ax] - val;
      if (da <= 0) lo.push(a); if (da >= 0) hi.push(a); if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const p = lerp(a, b, da / (da - db)); lo.push(p); hi.push(p); } } return [lo.length >= 3 ? lo : null, hi.length >= 3 ? hi : null]; };
  const groups = g.groups?.length ? g.groups : [{ start: 0, count: triCount * 3, materialIndex: 0 }], out = [], outGroups = []; let changed = false;
  for (const G of groups) { const startV = out.length;
    for (let t = G.start / 3; t < (G.start + G.count) / 3; t++) {
      const ia = idx ? idx.getX(t * 3) : t * 3, ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2; let rest = [read(ia), read(ib), read(ic)];
      const mn = k => Math.min(rest[0][k], rest[1][k], rest[2][k]), mx = k => Math.max(rest[0][k], rest[1][k], rest[2][k]);
      if (mx(0) <= bx.min.x || mn(0) >= bx.max.x || mx(1) <= bx.min.y || mn(1) >= bx.max.y || mx(2) <= bx.min.z || mn(2) >= bx.max.z) { out.push(rest[0], rest[1], rest[2]); continue; }
      changed = true; const keep = [];
      for (const [ax, val, lowKept] of [[1, bx.min.y, true], [0, bx.min.x, true], [0, bx.max.x, false], [2, bx.min.z, true], [2, bx.max.z, false]]) { if (!rest) break; const [lo, hi] = split(rest, ax, val); if (lowKept) { if (lo) keep.push(lo); rest = hi; } else { if (hi) keep.push(hi); rest = lo; } }
      // (bx.max.y غير محدود عمليًا: ما بقي داخل الصندوق يُحذف)
      for (const poly of keep) for (let i = 1; i < poly.length - 1; i++) out.push(poly[0], poly[i], poly[i + 1]);
    }
    outGroups.push({ start: startV, count: out.length - startV, materialIndex: G.materialIndex }); }
  if (!changed) return 0;
  if (!out.length) { mesh.visible = false; mesh.userData.massClipped = 'hidden'; return 2; }
  const ng = new THREE.BufferGeometry(); let k = 3;
  for (let a = 0; a < attrs.length; a++) { const s = sizes[a], src = attrs[a], arr = new src.array.constructor(out.length * s); for (let i = 0; i < out.length; i++) for (let c = 0; c < s; c++) arr[i * s + c] = out[i][k + c]; ng.setAttribute(names[a], new THREE.BufferAttribute(arr, s, src.normalized)); k += s; }
  if (g.groups?.length) for (const G of outGroups) ng.addGroup(G.start, G.count, G.materialIndex);
  ng.computeBoundingBox(); ng.computeBoundingSphere(); mesh.geometry = ng; mesh.userData.massClipped = 'clipped'; mesh.userData.massOwnGeo = true; return 1;
}

/**
 * يبني الكتلة في المشهد. يُستدعى بعد تطبيق الطراز وبوابات البروز (عناصر الكتلة تُقاس وحدها هنا).
 * @returns {{ group, info, carve(mesh), dispose() }}
 */
export function buildMassing(THREE, { scene, S, plan, night = false }) {
  const t0 = (globalThis.performance || Date).now(), group = new THREE.Group(); group.name = 'massing';
  const own = [], pal = PALETTE[plan.style] || PALETTE.M, mats = {};
  const std = (color, name, rough, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }); m.name = name; own.push(m); return m; };
  const body = frontBodyMaterial(THREE, scene, S, new Set()) || std('#d9d2c4', 'mass-body-plaster', .9);
  const mat = key => { if (mats[key]) return mats[key];
    if (key === 'body') return (mats.body = body);
    if (key === 'timber') return (mats.timber = std(pal.timber || '#7b5232', 'mass-timber-slat', .62));
    if (key === 'steel') return (mats.steel = std('#1d1f21', 'mass-steel-dark', .42, { metalness: .6 }));
    if (key === 'gypsum') return (mats.gypsum = std('#f1ece0', 'mass-gypsum-plaster', .9));
    if (key === 'dark') return (mats.dark = std('#2a211a', 'mass-dark-recess', 1));
    if (key === 'paving') return (mats.paving = std('#cbbfa8', 'mass-terrace-paving-stone', .85));
    if (key === 'interior') { const m = new THREE.MeshBasicMaterial({ color: night ? '#f0c98a' : '#3a342c' }); m.name = 'interior'; own.push(m); return (mats.interior = m); }
    if (key === 'glass') { const m = new THREE.MeshPhysicalMaterial({ color: '#bcd0d6', roughness: .06, metalness: 0, transparent: true, opacity: .32, depthWrite: false }); m.name = 'mass-rail-glass'; own.push(m); return (mats.glass = m); }
    const p = pal[key] || pal.accent || pal.stone; return (mats[key] = p === 'body' ? body : p ? std(p[0], p[1], p[2]) : body); };

  // 1) قصّ ما فوق التراسات: المبنى وزخرفة الطراز معًا
  const voids = plan.terraces.map(t => new THREE.Box3(new THREE.Vector3(...t.void.min), new THREE.Vector3(...t.void.max)));
  const carved = { clipped: 0, hidden: 0 }, ownGeos = [];
  const carve = o => { if (!o || (!o.isMesh && !o.isInstancedMesh) || !o.visible || o.userData?.mass) return; for (const bx of voids) { const r = clipMeshOutsideBox(THREE, o, bx); if (r === 1) { carved.clipped++; if (o.userData.massOwnGeo) ownGeos.push(o.geometry); } else if (r === 2) { carved.hidden++; break; } } };
  if (voids.length) { const list = []; scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.name !== 'ground') list.push(o); }); list.forEach(carve); }

  // 2) العناصر: دمج لكل خامة، و instancing للصناديق المكررة
  const top = plan.wallTop, els = [...plan.elements, ...plan.terraces.flatMap(t => terraceElements(t, { top }))];
  const byMat = new Map(), byInst = new Map(); let tris = 0;
  for (const el of els) { if (el.kind === 'box' && el.inst) { const k = el.mat + '|' + el.inst; (byInst.get(k) || byInst.set(k, []).get(k)).push(el); } else (byMat.get(el.mat) || byMat.set(el.mat, []).get(el.mat)).push(el); }
  const addMesh = (m, key) => { m.castShadow = key !== 'glass' && key !== 'interior'; m.receiveShadow = key !== 'interior'; m.userData.mass = true; m.userData.matKey = key; if (key === 'glass') m.renderOrder = 3; group.add(m); return m; };
  for (const [key, list] of byMat) { const g = merge(THREE, list.map(el => elementGeo(THREE, el))); tris += g.attributes.position.count / 3; const m = addMesh(new THREE.Mesh(g, mat(key)), key); m.name = 'mass-' + key; }
  const unit = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(); let instUsed = false;
  for (const [k, list] of byInst) { const key = k.split('|')[0], im = new THREE.InstancedMesh(unit, mat(key), list.length); instUsed = true;
    list.forEach((el, i) => { m4.makeScale(el.max[0] - el.min[0], el.max[1] - el.min[1], el.max[2] - el.min[2]); m4.setPosition((el.min[0] + el.max[0]) / 2, (el.min[1] + el.max[1]) / 2, (el.min[2] + el.max[2]) / 2); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingBox?.(); im.computeBoundingSphere?.(); tris += list.length * 12; addMesh(im, key).name = 'mass-inst-' + k.replace('|', '-'); }
  if (!instUsed) unit.dispose();
  scene.add(group);
  const info = { body: body.name || '', style: plan.style, seed: plan.seed, vocab: plan.vocab, elements: plan.elements.length, terraces: plan.terraces.length, railing: plan.terraces[0]?.railing || null, meshes: group.children.length, triangles: Math.round(tris), carved, dropped: plan.dropped.length, encroachFrontM: plan.encroachFrontM, encroachUpperM: plan.encroachUpperM, maxProjectionM: plan.maxProjectionM, upperProjectionM: plan.upperProjectionM, note: MASSING_NOTE, ms: Math.round((globalThis.performance || Date).now() - t0) };
  return { group, info, carve, dispose() { scene.remove(group); group.traverse(o => { if (o.geometry && o.geometry !== unit) o.geometry.dispose(); }); unit.dispose(); for (const g of ownGeos) g.dispose(); for (const m of own) m.dispose(); group.clear(); } };
}

export default { massingPlan, buildMassing, findTerraces, facesFromBuilt, terraceElements, clipMeshOutsideBox, massingSeed, tasteOf, VOCAB, MASSING_NOTE };
