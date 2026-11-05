// (طلب المالك 2026-10-31) مولّد الواجهات بالقواعد: واجهة مختلفة لكل تصميم ولكل عميل، بحسب الطراز الذي يختاره (كلاسيكي /
// نيوكلاسيكي / حديث / «نجدي معاصر» مقترح) — لا صور جاهزة. وحدة نقية بلا DOM ولا شبكة ولا Math.random ولا زمن:
//   - الهندسة من المسقط نفسه: الجدران الخارجية لكل دور (topology.analyzeWalls) وفتحاتها الحقيقية (doc.openings) وارتفاعات الأدوار
//     والدروة (doc.roof.parapet) والمدخل والشوارع. لا تُضاف فتحة ليست في المسقط، ولا تُخفَض الدروة/الساتر عمّا في المستند.
//   - الطراز يحدد «مفردات» (كرنيش، إطارات، أعمدة، كاسرات، شرفات…) والبذرة الحتمية تختار ضمن الطراز (اللوحة اللونية، نمط
//     التيجان فوق النوافذ، إيقاع الزوايا، نوع الإطار الحديث…) فيختلف تصميمان بالطراز نفسه، وتثبت النتيجة لنفس المدخلات.
//   - البذرة = بصمة هندسة التصميم (الجدران والفتحات والأدوار) + مفتاح العميل (من طلبه). تُحفظ في doc.finish.facade.seed عند
//     تسليم التصميم للمرسم/المجسّم حتى لا يتغير اللون مع كل تعديل يدوي.
// المصادر ومستوى كل قاعدة في docs/research/facade-styles/REPORT.md. ما لا مصدر له موسوم «قيمة تصميمية للميزان».
import { analyzeWalls } from './draw/topology.mjs';
import { dist, norm, sub, dot, add, mul } from './draw/geom.mjs';

export const FACADE_VERSION = 'facade-styles/1';
/** الطرز: main = الثلاثة التي طلبها المالك؛ najdi = مقترح رابع معلن. */
export const STYLE_IDS = Object.freeze(['classic', 'neoclassic', 'modern', 'najdi']);
export const STYLE_AR = Object.freeze({ classic: 'كلاسيكي', neoclassic: 'نيوكلاسيكي', modern: 'حديث (معاصر)', najdi: 'نجدي معاصر (مقترح)', auto: 'اختر لي' });
export const ORNAMENT = Object.freeze({ low: 1, medium: 2, high: 3 });
export const ORNAMENT_AR = Object.freeze({ low: 'هادئة', medium: 'متوسطة', high: 'غنية' });
export const SIDES = Object.freeze(['s', 'n', 'e', 'w']);
export const SIDE_AR = Object.freeze({ s: 'الجنوبية', n: 'الشمالية', e: 'الشرقية', w: 'الغربية' });
const OUT = { s: { x: 0, y: -1 }, n: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };

// ------------------------------------------------------------------------------------------ الحتمية
export function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
export function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
/** بصمة هندسة التصميم فقط (لا التشطيب): الأدوار والجدران والفتحات. */
export function geometryKey(doc) {
  const L = (doc.levels || []).map(l => [l.id, r2(l.height || 0)]);
  const W = (doc.walls || []).map(w => [w.id, w.level, r2(w.a.x), r2(w.a.y), r2(w.b.x), r2(w.b.y), r2(w.t || 0), w.kind || 'wall']);
  const O = (doc.openings || []).map(o => [o.id, o.wall, o.kind, r2(o.at), r2(o.w), r2(o.h || 0), r2(o.sill || 0), !!o.entry]);
  return fnv(JSON.stringify([L, W, O, doc.entry || 's']));
}
/** مفتاح العميل من طلبه (الأرض والأعداد والنص) — نفس الطلب = نفس المفتاح. */
export function clientKeyOf(input = {}) {
  const req = input.requirements || {};
  return fnv(JSON.stringify([input.land || null, req.counts || null, String(input.idea || req.text || '').slice(0, 400)]));
}
export const facadeSeed = (doc, clientKey = 0) => fnv(geometryKey(doc) + '|' + (clientKey >>> 0));

// ------------------------------------------------------------------------------------------ الطرز (القواعد)
// كل لوحة: wall الجدار، accent الحجر/التأكيد، trim الإطارات والكرانيش، plinth القاعدة، frame الألمنيوم/الخشب، door باب المدخل، glass، metal.
const PALETTES = {
  classic: [
    { name: 'حجر جيري كريمي', wall: '#e9dcc0', accent: '#d8c49c', trim: '#f4ead6', plinth: '#b8a07a', frame: '#4b3a2b', door: '#4a3122', glass: '#9db4c0', metal: '#3a2f27' },
    { name: 'حجر رملي دافئ', wall: '#e2cfa8', accent: '#cdb487', trim: '#efe3c8', plinth: '#a98f68', frame: '#5a4532', door: '#3f2a1d', glass: '#a2b8c2', metal: '#3b3026' },
    { name: 'حجر عاجي', wall: '#efe6d3', accent: '#dccdb0', trim: '#f8f2e6', plinth: '#bfae8e', frame: '#3d3a36', door: '#2f2a26', glass: '#a5bcc6', metal: '#2f2c29' },
  ],
  neoclassic: [
    { name: 'أبيض عاجي وحجر فاتح', wall: '#f3eee4', accent: '#e2d7c2', trim: '#fbf8f2', plinth: '#cfc3ad', frame: '#2f3133', door: '#3a3530', glass: '#a3bac6', metal: '#2b2d30' },
    { name: 'رمادي دافئ فاتح', wall: '#e7e3dc', accent: '#d3cdc2', trim: '#f6f4ef', plinth: '#b9b2a6', frame: '#26292c', door: '#2c2c2c', glass: '#9fb5c1', metal: '#24272a' },
    { name: 'كريمي ناعم', wall: '#efe5d2', accent: '#dccdb2', trim: '#f9f3e8', plinth: '#c4b394', frame: '#3b3732', door: '#4b3a2c', glass: '#a1b7c3', metal: '#33302c' },
  ],
  modern: [
    { name: 'أبيض وأنثراسيت وخشب', wall: '#f2f2ef', accent: '#3b3f44', trim: '#8c6a4a', plinth: '#d9d9d5', frame: '#2a2c2f', door: '#8c6a4a', glass: '#8fa9b6', metal: '#2a2c2f' },
    { name: 'رمادي وبيج وأسود', wall: '#e4e1db', accent: '#c9b89c', trim: '#1f2123', plinth: '#d0ccc4', frame: '#1f2123', door: '#1f2123', glass: '#92aab6', metal: '#1f2123' },
    { name: 'أبيض وحجر داكن', wall: '#f5f4f0', accent: '#5b5650', trim: '#a8a39a', plinth: '#dedbd5', frame: '#33363a', door: '#5b5650', glass: '#8ea7b4', metal: '#33363a' },
  ],
  najdi: [
    { name: 'طيني فاتح', wall: '#d9bf98', accent: '#c4a47a', trim: '#efe2c8', plinth: '#a88a64', frame: '#6b4a2e', door: '#7a5232', glass: '#9aa9a8', metal: '#5a4330' },
    { name: 'طيني أحمر', wall: '#c99f78', accent: '#b0835c', trim: '#ead8bd', plinth: '#957052', frame: '#5e3f27', door: '#6e4527', glass: '#98a6a4', metal: '#503a28' },
    { name: 'رملي نجدي', wall: '#e0caa5', accent: '#ccae84', trim: '#f2e7d2', plinth: '#ae936e', frame: '#634329', door: '#80573a', glass: '#9cabaa', metal: '#563f2d' },
  ],
};
/**
 * مفردات كل طراز (rules) — المصدر في التقرير:
 *  classic: تماثل وحجر كامل وكرنيش تاج بأسنان وأحزمة بين الأدوار وزوايا حجرية (quoins) وإطارات نوافذ بتيجان مثلثة/مقوسة ومدخل بعمودين وجملون.
 *  neoclassic: الكلاسيكي مبسطًا: سطح أملس وإطارات مسطحة وكرنيش بسيط بلا أسنان وأكتاف مسطحة (pilasters) وحزوز أفقية في الأرضي.
 *  modern: بلا زخرفة: خطوط أفقية، إطار بارز (U أو L مقلوب) حول كتلة مميزة بمادة مختلفة، كاسرات أفقية ورأسية، غطاء دروة معدني رفيع.
 *  najdi (مقترح): ألوان ترابية مطفأة، شرفات مثلثة/مدرجة أعلى الدروة، شريط مثلثات بارز، فتحات بعمق ظل وإطار خشبي، باب خشبي بزخارف هندسية.
 */
export const STYLES = Object.freeze({
  classic: { base: 'stone', plinth: [.7, .9], cornice: 'crown', dentils: true, strings: 'band', quoins: true, pilasters: false, surround: 'architrave', head: ['triangle', 'segment', 'alternate', 'keystone'], entry: 'portico', parapet: 'balustrade', fins: false, featureFrame: false, overhang: false, crenels: false, frieze: false, rustication: false },
  neoclassic: { base: 'render', plinth: [.55, .75], cornice: 'plain', dentils: false, strings: 'thin', quoins: false, pilasters: true, surround: 'flat', head: ['lintel', 'lintel-key'], entry: 'pilasters', parapet: 'panels', fins: false, featureFrame: false, overhang: false, crenels: false, frieze: false, rustication: true },
  modern: { base: 'paint', plinth: [0, 0], cornice: 'none', dentils: false, strings: 'joint', quoins: false, pilasters: false, surround: 'none', head: ['none'], entry: 'canopy', parapet: 'metal', fins: true, featureFrame: ['U', 'L'], overhang: true, crenels: false, frieze: false, rustication: false },
  najdi: { base: 'render', plinth: [.5, .7], cornice: 'none', dentils: false, strings: 'none', quoins: false, pilasters: false, surround: 'reveal', head: ['triangle-relief', 'none'], entry: 'najdi-door', parapet: 'plain', fins: false, featureFrame: false, overhang: false, crenels: ['triangle', 'stepped'], frieze: true, rustication: false },
});
const HEX = /^#[0-9a-f]{6}$/i;
/** أقصى ارتفاع للفيلا 14 م من منسوب الرصيف (اشتراطات إنشاء المباني السكنية، المستوى أ في docs/research/saudi-residential-regulations-2026-10-21.md). */
export const MAX_VILLA_HEIGHT = 14;

/**
 * المواصفة المحسومة للواجهة: الطراز والبذرة واللوحة والمعاملات. opts تتقدم على doc.finish.facade.
 * opts: { style: classic|neoclassic|modern|najdi|auto, ornament: low|medium|high, color: '#rrggbb' (لون الجدار), clientKey, seed }
 */
export function resolveFacade(doc, opts = {}) {
  const f = doc.finish?.facade || {};
  const want = opts.style ?? f.style ?? null;
  const clientKey = opts.clientKey ?? f.clientKey ?? 0;
  const seed = (opts.seed ?? f.seed ?? facadeSeed(doc, clientKey)) >>> 0;
  const R = prng(seed);
  let style = want, chosenBy = 'client';
  if (!STYLE_IDS.includes(style)) {
    if (want !== 'auto') return null; // لا طراز ← المجسّم الافتراضي كما كان (لا تغيير لسلوك المستندات القديمة)
    style = ['classic', 'neoclassic', 'modern'][Math.floor(prng(seed ^ 0x9e3779b9)() * 3)]; chosenBy = 'mizan-auto';
  }
  const ornamentKey = ORNAMENT[opts.ornament ?? f.ornament] ? (opts.ornament ?? f.ornament) : 'medium', orn = ORNAMENT[ornamentKey];
  const rules = STYLES[style], pals = PALETTES[style];
  const palIndex = Math.floor(R() * pals.length), palette = { ...pals[palIndex] };
  const userColor = opts.color ?? f.styleColor ?? null;
  if (userColor && HEX.test(userColor)) palette.wall = userColor.toLowerCase();
  const pick = arr => (Array.isArray(arr) ? arr[Math.floor(R() * arr.length)] : arr);
  const lerp = ([a, b]) => r2(a + (b - a) * R());
  const params = {
    plinthH: lerp(rules.plinth), head: pick(rules.head), frame: rules.featureFrame ? pick(rules.featureFrame) : null, crenel: rules.crenels ? pick(rules.crenels) : null,
    corniceH: style === 'classic' ? r2(.38 + .14 * R()) : style === 'neoclassic' ? r2(.22 + .08 * R()) : 0,
    quoinLong: r2(.55 + .15 * R()), quoinShort: r2(.3 + .1 * R()), quoinH: r2(.28 + .06 * R()),
    finStep: r2(.5 + .3 * R()), triSize: r2(.24 + .1 * R()), crenelW: r2(.4 + .15 * R()), crenelH: r2(.3 + .1 * R()),
    panes: style === 'classic' ? 2 + Math.floor(R() * 2) : style === 'neoclassic' ? 2 : 1,
    columnW: r2(.32 + .06 * R()),
  };
  return { version: FACADE_VERSION, style, styleAr: STYLE_AR[style], chosenBy, requested: want, seed, ornament: ornamentKey, orn, palette, paletteName: palette.name, palIndex, params, rules };
}

// ------------------------------------------------------------------------------------------ الهندسة من المسقط
/**
 * الواجهات الأربع من المسقط: لكل جهة قطع جدران خارجية تواجهها (العمودي الخارجي ضمن 45°) لكل دور، وفتحاتها الحقيقية.
 * u أفقي كما يراه الواقف أمام الجهة (يساره = 0)، depth البعد عنه، z من الأرض الطبيعية (منسوب التشطيب الأرضي = plinth).
 */
export function facadeGeometry(doc, { plinth = .45 } = {}) {
  const levels = []; let acc = 0;
  for (const [i, lv] of (doc.levels || []).entries()) { const E = Number.isFinite(lv.elevation) && (i === 0 || lv.elevation > 0) ? lv.elevation : acc, H = lv.height || 3.2; acc = E + H; levels.push({ id: lv.id, i, E, H }); }
  const parapet = Number.isFinite(doc.roof?.parapet) ? doc.roof.parapet : .9;
  const wallsById = new Map((doc.walls || []).map(w => [w.id, w]));
  const per = levels.map(L => {
    const walls = (doc.walls || []).filter(w => w.level === L.id && w.kind !== 'fence' && w.kind !== 'parapet');
    let A; try { A = analyzeWalls(walls); } catch { A = { spaces: [], outlines: [] }; }
    const pieces = [];
    for (const s of A.spaces) for (const e of s.edges) if (e.outside) {
      const d = norm(sub(e.b, e.a)), n = { x: d.y, y: -d.x }, len = dist(e.a, e.b);
      if (len < .05) continue;
      pieces.push({ a: e.a, b: e.b, d, n, len, t: e.t || .2, wallIds: e.wallIds || [] });
    }
    return { ...L, pieces, outlines: (A.outlines || []).map(o => o.polygon) };
  });
  const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  const sides = Object.fromEntries(SIDES.map(s => [s, { pieces: [], openings: 0 }]));
  const skipped = { diagonal: 0, openingsUnplaced: [] };
  const H = (side, p) => (side === 's' ? p.x : side === 'n' ? -p.x : side === 'e' ? p.y : -p.y);
  const D = (side, p) => (side === 's' ? p.y : side === 'n' ? -p.y : side === 'e' ? -p.x : p.x);
  const ext = new Map(); // opening id -> placed
  for (const L of per) {
    const upper = per[L.i + 1];
    for (const pc of L.pieces) {
      const side = SIDES.find(s => dot(pc.n, OUT[s]) > .7);
      if (!side) { skipped.diagonal++; continue; }
      const mid = add(pc.a, mul(pc.d, pc.len / 2)), inward = add(mid, mul(pc.n, -(pc.t / 2 + .35)));
      const covered = !!upper && upper.outlines.some(poly => inPoly(inward, poly));
      const ha = H(side, pc.a), hb = H(side, pc.b);
      const z0 = L.i === 0 ? 0 : plinth + L.E, z1 = plinth + L.E + L.H;
      const openings = [];
      for (const o of doc.openings || []) {
        if (o.level !== L.id || !pc.wallIds.includes(o.wall)) continue;
        const w = wallsById.get(o.wall); if (!w) continue;
        const wd = norm(sub(w.b, w.a)), c = add(w.a, mul(wd, o.at));
        const along = dot(sub(c, pc.a), pc.d); if (along < -1e-6 || along > pc.len + 1e-6) continue;
        const off = Math.abs(dot(sub(c, pc.a), pc.n)); if (off > pc.t + .05) continue;
        const hc = H(side, c), sill = o.sill || 0, oh = o.h || (o.kind?.startsWith('window') ? 1.2 : 2.1);
        openings.push({ id: o.id, kind: o.kind, entry: !!o.entry, u0: hc - o.w / 2, u1: hc + o.w / 2, z0: plinth + L.E + sill, z1: plinth + L.E + sill + oh, w: o.w, h: oh, sill });
        ext.set(o.id, side);
      }
      sides[side].pieces.push({ level: L.id, li: L.i, top: !upper, covered, u0: Math.min(ha, hb), u1: Math.max(ha, hb), depth: r3(D(side, pc.a)), z0, z1, parapet: covered ? null : { z0: z1, z1: z1 + parapet }, openings, wallIds: pc.wallIds });
      sides[side].openings += openings.length;
    }
  }
  // دمج القطع المتتالية على الخط نفسه (المسقط يقسم الجدار الخارجي عند كل التقاء بجدار داخلي): واجهة واحدة متصلة لكل بروز
  for (const s of SIDES) {
    const P = sides[s].pieces.slice().sort((a, b) => a.li - b.li || a.depth - b.depth || a.u0 - b.u0), out = [];
    for (const p of P) {
      const q = out[out.length - 1];
      if (q && q.li === p.li && Math.abs(q.depth - p.depth) < .02 && q.covered === p.covered && p.u0 - q.u1 < .03) { q.u1 = Math.max(q.u1, p.u1); q.openings.push(...p.openings); q.wallIds = [...new Set([...q.wallIds, ...p.wallIds])]; }
      else out.push({ ...p, openings: [...p.openings] });
    }
    for (const p of out) p.openings.sort((a, b) => a.u0 - b.u0);
    sides[s].pieces = out;
  }
  // تطبيع u: يسار الواقف = 0
  for (const s of SIDES) {
    const P = sides[s].pieces; if (!P.length) { sides[s].width = 0; continue; }
    const min = Math.min(...P.map(p => p.u0)), max = Math.max(...P.map(p => p.u1));
    for (const p of P) { p.u0 = r3(p.u0 - min); p.u1 = r3(p.u1 - min); for (const o of p.openings) { o.u0 = r3(o.u0 - min); o.u1 = r3(o.u1 - min); } }
    sides[s].width = r3(max - min);
    sides[s].top = r3(Math.max(...P.map(p => (p.parapet ? p.parapet.z1 : p.z1))));
    P.sort((a, b) => b.depth - a.depth || a.li - b.li || a.u0 - b.u0); // الأبعد أولًا (الأقرب يُرسم فوقه فيحجبه)
  }
  // الفتحات الخارجية التي لم تُوضع على جهة (جدار مائل) تُعدّ ولا تُخترع
  for (const o of doc.openings || []) if (!ext.has(o.id)) { const w = wallsById.get(o.wall); if (w && per.some(L => L.pieces.some(p => p.wallIds.includes(o.wall)))) { /* قد تكون على قطعة داخلية من الجدار نفسه */ } }
  const streets = new Set([doc.entry || 's', ...((doc.streets || doc.plot?.streets || []).filter(Boolean))]);
  return { sides, levels, parapet, plinth, streets, entry: doc.entry || 's', skipped, exteriorOpenings: [...ext.keys()] };
}

// ------------------------------------------------------------------------------------------ تركيب الواجهة (عناصر مرسومة)
const ORN_ROLES = new Set(['cornice', 'dentil', 'string', 'quoin', 'pilaster', 'column', 'capital', 'pediment', 'keystone', 'surround', 'sill', 'balustrade', 'panel', 'fin', 'canopy', 'frame', 'crenel', 'frieze', 'groove', 'reveal', 'apron', 'door-motif']);
/**
 * عناصر الواجهة لجهة واحدة: [{ t:'rect'|'poly'|'line'|'path', role, ...geom, fill, stroke, opening? }] بالمتر (z لأعلى).
 * كل فتحة مرسومة تحمل opening = معرّفها في المسقط؛ لا عنصر «فتحة» بلا معرّف.
 */
export function composeElevation(doc, side, spec, geom = facadeGeometry(doc)) {
  const S = geom.sides[side], P = spec.palette, R = spec.rules, K = spec.params, o = spec.orn, prims = [];
  // الزخرفة لا تغطي فتحة حقيقية: عناصر «على الوجه» (أعمدة، زوايا، أكتاف، إطارات) تُحذف إن تقاطعت مع فتحة غير فتحتها؛
  // والفتحات تُرسم بعد زخارف قطعتها (sink مؤجل) فلا يحجب إطار نافذة زجاج نافذة مجاورة.
  const GUARDED = new Set(['column', 'capital', 'quoin', 'pilaster', 'frame', 'canopy']);
  let sink = prims, avoid = [], allow = null; const skipped = [];
  const hits = (x0, z0, x1, z1) => avoid.some(q => q.id !== allow && x0 < q.u1 + .03 && x1 > q.u0 - .03 && z0 < q.z1 + .03 && z1 > q.z0 - .03);
  const push = (x) => { if (GUARDED.has(x.role) && x.t === 'rect' && hits(x.x, x.z, x.x + x.w, x.z + x.h)) { skipped.push(x.role); return x; } sink.push(x); return x; };
  const rect = (role, x0, z0, x1, z1, fill, extra = {}) => push({ t: 'rect', role, x: r3(Math.min(x0, x1)), z: r3(Math.min(z0, z1)), w: r3(Math.abs(x1 - x0)), h: r3(Math.abs(z1 - z0)), fill, ...extra });
  const poly = (role, pts, fill, extra = {}) => push({ t: 'poly', role, pts: pts.map(([x, z]) => [r3(x), r3(z)]), fill, ...extra });
  const line = (role, x0, z0, x1, z1, stroke, sw = .02, extra = {}) => push({ t: 'line', role, x0: r3(x0), z0: r3(z0), x1: r3(x1), z1: r3(z1), stroke, sw, ...extra });
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
  if (!S || !S.pieces.length) return { side, prims, width: 0, top: 0, empty: true };
  const street = geom.streets.has(side), front = side === geom.entry;
  const topAll = S.top, maxH = topAll;
  const crenelOK = !!K.crenel && maxH + K.crenelH <= MAX_VILLA_HEIGHT; // الشرفات فوق الدروة لا تتجاوز أقصى ارتفاع للفيلا
  rect('ground', -1.5, -.25, S.width + 1.5, 0, '#cbbfa8');
  // الكتلة المميزة (الحديث): القطعة الأمامية ذات المدخل، وإلا الأعرض فتحات
  let feature = null;
  if (R.featureFrame) {
    const cands = S.pieces.filter(p => p.openings.length);
    const withEntry = cands.find(p => p.openings.some(q => q.entry));
    const best = withEntry || cands.slice().sort((a, b) => (b.openings.reduce((s, q) => s + q.w, 0) - a.openings.reduce((s, q) => s + q.w, 0)) || a.u0 - b.u0)[0];
    if (best) { const ops = best.openings.filter(q => withEntry ? q.entry : true); const u0 = Math.max(best.u0, Math.min(...ops.map(q => q.u0)) - .7), u1 = Math.min(best.u1, Math.max(...ops.map(q => q.u1)) + .7); feature = { u0, u1, piece: best }; }
  }
  for (const pc of S.pieces) {
    avoid = pc.openings; allow = null; const pieceDeferred = [];
    const { u0, u1, z0, z1 } = pc, ground = pc.li === 0, len = u1 - u0;
    // الجدار
    rect('wall', u0, z0, u1, z1, P.wall, { base: R.base, level: pc.level });
    if (R.base === 'stone') for (let z = z0 + (ground ? spec.params.plinthH : 0) + .35; z < z1 - .05; z += .35) line('coursing', u0, z, u1, z, shade(P.wall, .9), .012);
    // القاعدة
    if (ground && K.plinthH > 0) rect('plinth', u0, 0, u1, K.plinthH, P.plinth);
    if (ground && !(K.plinthH > 0)) line('groove', u0, .15, u1, .15, shade(P.wall, .7), .03);
    // حزوز أفقية في الأرضي (نيوكلاسيكي) عند الكثافة ≥ 2
    if (ground && R.rustication && o >= 2) for (let z = K.plinthH + .45; z < z1 - .3; z += .45) line('groove', u0, z, u1, z, shade(P.wall, .82), .02);
    // الكتلة المميزة الحديثة: لوح بمادة التأكيد خلف الفتحات (الإطار البارز يُرسم بعد الدروة)
    if (feature && feature.piece === pc) rect('panel', feature.u0, z0 + (ground ? .15 : 0), feature.u1, pc.parapet ? pc.parapet.z1 : z1, P.accent);
    // أكتاف مسطحة (نيوكلاسيكي) عند طرفي القطع الطويلة
    if (R.pilasters && len >= 5 && o >= 2) for (const x of [u0, u1 - .4]) rect('pilaster', x, ground ? K.plinthH : z0, x + .4, z1, P.trim);
    // الزوايا الحجرية (كلاسيكي)
    if (R.quoins && len >= 2.5) for (const [x, dir] of [[u0, 1], [u1, -1]]) {
      let k = 0; for (let z = (ground ? K.plinthH : z0) + .02; z + K.quoinH <= z1 - .05; z += K.quoinH + .02, k++) { const w = k % 2 ? K.quoinShort : K.quoinLong; rect('quoin', x, z, x + dir * w, z + K.quoinH, P.accent); }
    }
    // الأحزمة بين الأدوار (أعلى الدور المغطى بدور فوقه)
    if (!pc.parapet || !pc.top) {
      if (pc.covered || !pc.top) {
        if (R.strings === 'band') rect('string', u0 - .08, z1 - .12, u1 + .08, z1 + .12, P.trim);
        else if (R.strings === 'thin') rect('string', u0 - .04, z1 - .06, u1 + .04, z1 + .06, P.trim);
        else if (R.strings === 'joint') line('string', u0, z1, u1, z1, shade(P.wall, .6), .04);
      }
    }
    // الفتحات (من المسقط فقط) وإطاراتها
    for (const op of pc.openings) {
      allow = op.id;
      const { u0: a, u1: b, z0: c, z1: d } = op, win = /^window/.test(op.kind), door = !win, wv = b - a;
      // الإطار/الجوانب قبل الفتحة
      if (R.surround === 'architrave') { const fw = o >= 2 ? .18 : .12; rect('surround', a - fw, c - (win ? .02 : 0), b + fw, d + fw, P.trim); if (win) rect('sill', a - fw - .06, c - .14, b + fw + .06, c - .02, P.accent); if (win && o >= 3 && c - .85 > (ground ? K.plinthH : pc.z0)) rect('apron', a, c - .75, b, c - .2, shade(P.wall, .93), { stroke: P.trim, sw: .04 }); }
      else if (R.surround === 'flat') { rect('surround', a - .12, c - (win ? .02 : 0), b + .12, d + .1, P.trim); if (win) rect('sill', a - .16, c - .1, b + .16, c, P.trim); if (win && o >= 3 && c - .9 > (ground ? K.plinthH : pc.z0)) rect('apron', a, c - .7, b, c - .2, shade(P.wall, .95), { stroke: P.trim }); }
      else if (R.surround === 'reveal') { rect('reveal', a - .1, c - .1, b + .1, d + .1, shade(P.wall, .72)); }
      // الفتحة نفسها (مؤجلة إلى ما بعد زخارف القطعة)
      const deferred = []; sink = deferred;
      if (win) {
        rect('opening', a, c, b, d, P.glass, { opening: op.id, kind: op.kind, stroke: P.frame, sw: R.surround === 'reveal' ? .08 : .05 });
        const paneW = { classic: .6, neoclassic: .9, modern: 2.2, najdi: .5 }[spec.style] || 1, panes = Math.max(1, Math.min(6, Math.round(wv / paneW)));
        for (let k = 1; k < panes; k++) line('mullion', a + wv * k / panes, c, a + wv * k / panes, d, P.frame, .035);
        if (spec.params.panes >= 3 && d - c > 1) line('mullion', a, c + (d - c) * .62, b, c + (d - c) * .62, P.frame, .03);
      } else {
        const fill = op.kind === 'slider' ? P.glass : op.kind === 'arch' ? '#3b3530' : op.kind === 'garage' ? shade(P.frame, 1.6) : (op.entry ? P.door : shade(P.door, 1.25));
        if (op.kind === 'arch') { const rr = Math.min(wv / 2, d - c); push({ t: 'path', role: 'opening', opening: op.id, kind: op.kind, cmds: [['M', a, c], ['L', a, d - rr], ['A', wv / 2, rr, b, d - rr], ['L', b, c], ['Z']], fill, stroke: P.frame, sw: .04 }); }
        else rect('opening', a, c, b, d, fill, { opening: op.id, kind: op.kind, stroke: P.frame, sw: .05 });
        if (op.kind === 'door2' || (op.kind === 'slider')) line('mullion', (a + b) / 2, c, (a + b) / 2, d, P.frame, .03);
        if (op.kind === 'garage') for (let z = c + .25; z < d; z += .25) line('mullion', a, z, b, z, P.frame, .02);
        if (ground && c > .05) rect('step', a - .3, Math.max(0, c - .45), b + .3, c, shade(P.plinth || P.wall, .9));
        if (R.entry === 'najdi-door' && op.entry && o >= 1) { // زخرفة هندسية على الباب الخشبي (مثلثات)
          const n = Math.max(2, Math.round(wv / .3)); for (let k = 0; k < n; k++) { const x = a + wv * (k + .5) / n; poly('door-motif', [[x - .1, d - .25], [x + .1, d - .25], [x, d - .1]], P.trim); poly('door-motif', [[x - .1, c + .35], [x + .1, c + .35], [x, c + .5]], P.trim); }
        }
      }
      sink = prims; pieceDeferred.push(...deferred);
      // رأس الفتحة
      const head = spec.params.head;
      if (win && R.surround === 'architrave' && o >= 2) {
        const hz = d + .18, hx0 = a - .3, hx1 = b + .3;
        const kind = head === 'alternate' ? (Math.round(a * 10) % 2 ? 'triangle' : 'segment') : head;
        if (ground || o >= 3) {
          if (kind === 'triangle') { rect('cornice', hx0, hz, hx1, hz + .1, P.trim); poly('pediment', [[hx0, hz + .1], [hx1, hz + .1], [(hx0 + hx1) / 2, hz + .1 + Math.min(.55, (hx1 - hx0) * .22)]], P.trim); }
          else if (kind === 'segment') { rect('cornice', hx0, hz, hx1, hz + .1, P.trim); push({ t: 'path', role: 'pediment', cmds: [['M', hx0, hz + .1], ['Q', (hx0 + hx1) / 2, hz + .1 + Math.min(.6, (hx1 - hx0) * .3), hx1, hz + .1], ['Z']], fill: P.trim }); }
          else rect('cornice', hx0, hz, hx1, hz + .12, P.trim);
        }
        if (kind === 'keystone' || !ground) poly('keystone', [[(a + b) / 2 - .12, d - .05], [(a + b) / 2 + .12, d - .05], [(a + b) / 2 + .16, d + .18], [(a + b) / 2 - .16, d + .18]], P.accent);
      } else if (win && R.surround === 'flat') {
        rect('cornice', a - .2, d + .1, b + .2, d + .2, P.trim);
        if (head === 'lintel-key' && o >= 2) poly('keystone', [[(a + b) / 2 - .1, d], [(a + b) / 2 + .1, d], [(a + b) / 2 + .13, d + .1], [(a + b) / 2 - .13, d + .1]], P.accent);
      } else if (win && R.surround === 'reveal' && ((head === 'triangle-relief' && o >= 2) || o >= 3)) {
        poly('frieze', [[(a + b) / 2 - .22, d + .2], [(a + b) / 2 + .22, d + .2], [(a + b) / 2, d + .5]], P.trim);
      }
      // كاسرات الشمس (الحديث): أفقية فوق النوافذ، ورأسية على الشرق والغرب عند الكثافة ≥ 2
      if (R.fins && win) {
        if (R.overhang) rect('canopy', a - .25, d + .05, b + .25, d + .15, P.metal);
        if (((side === 'e' || side === 'w') && o >= 2) || o >= 3) { sink = pieceDeferred; for (let x = a + K.finStep / 2; x < b; x += K.finStep) rect('fin', x - .03, c - .05, x + .03, d + .05, P.metal); sink = prims; } // أمام الزجاج
      }
    }
    // الدروة والكرنيش والشرفات
    if (pc.parapet) {
      const { z0: p0, z1: p1 } = pc.parapet;
      rect('parapet', u0, p0, u1, p1, P.wall, { minHeight: r3(p1 - p0) });
      if (R.cornice === 'crown') {
        rect('cornice', u0 - .15, p0 - .06, u1 + .15, p0 + K.corniceH, P.trim);
        if (R.dentils && o >= 2) for (let x = u0 + .05; x < u1 - .1; x += .2) rect('dentil', x, p0 - .2, x + .1, p0 - .06, P.trim);
        if (o >= 2) for (let x = u0 + .3; x < u1 - .3; x += .26) rect('balustrade', x, p0 + K.corniceH + .1, x + .1, p1 - .15, shade(P.wall, .88));
        rect('coping', u0 - .08, p1 - .1, u1 + .08, p1, P.trim);
      } else if (R.cornice === 'plain') {
        rect('cornice', u0 - .08, p0 - .04, u1 + .08, p0 + K.corniceH, P.trim);
        if (o >= 2 && len > 3) { const n = Math.max(1, Math.round(len / 2.4)), w = len / n; for (let k = 0; k < n; k++) rect('panel', u0 + k * w + .25, p0 + K.corniceH + .15, u0 + (k + 1) * w - .25, p1 - .25, shade(P.wall, .95), { stroke: P.trim }); }
        rect('coping', u0 - .05, p1 - .08, u1 + .05, p1, P.trim);
      } else if (R.parapet === 'metal') {
        rect('coping', u0, p1 - .05, u1, p1, P.metal);
      }
      if (R.frieze) { const s = K.triSize, n = Math.max(2, Math.floor(len / s)); for (let k = 0; k < n; k++) { const x = u0 + (len - n * s) / 2 + k * s; poly('frieze', [[x + .03, p0 + .2], [x + s - .03, p0 + .2], [x + s / 2, p0 + .2 + s * .8]], P.trim); } }
      if (crenelOK && pc.top) { const w = K.crenelW, n = Math.max(1, Math.floor(len / (2 * w))); for (let k = 0; k < n; k++) { const x = u0 + (len - (2 * n - 1) * w) / 2 + 2 * k * w;
        if (K.crenel === 'stepped') { rect('crenel', x, p1, x + w, p1 + K.crenelH * .5, P.wall); rect('crenel', x + w * .25, p1 + K.crenelH * .5, x + w * .75, p1 + K.crenelH, P.wall); }
        else poly('crenel', [[x, p1], [x + w, p1], [x + w / 2, p1 + K.crenelH]], P.wall); } }
    }
    // المدخل
    for (const op of pc.openings.filter(q => q.entry && !/^window/.test(q.kind))) {
      allow = op.id;
      const { u0: a, u1: b, z1: d } = op, base = ground ? K.plinthH : pc.z0, cw = K.columnW;
      if (R.entry === 'portico' && o >= 1) {
        const top = Math.min(d + .7, z1 - .1);
        for (const x of [a - .45 - cw, b + .45]) { if (hits(x - .08, base, x + cw + .08, top)) { skipped.push('column'); continue; } rect('column', x, base, x + cw, top - .18, P.trim); rect('capital', x - .08, top - .18, x + cw + .08, top - .04, P.accent); rect('capital', x - .06, base, x + cw + .06, base + .12, P.accent); }
        rect('cornice', a - .6 - cw, top - .04, b + .6 + cw, top + .14, P.trim);
        if (o >= 2) poly('pediment', [[a - .7 - cw, top + .14], [b + .7 + cw, top + .14], [(a + b) / 2, top + .14 + Math.min(.9, (b - a + 1.4) * .22)]], P.trim);
      } else if (R.entry === 'pilasters') {
        for (const x of [a - .45, b + .15]) rect('pilaster', x, base, x + .3, d + .3, P.trim);
        rect('canopy', a - .7, d + .3, b + .7, d + .45, P.trim);
      } else if (R.entry === 'canopy') {
        rect('canopy', a - .9, d + .15, b + .9, d + .3, P.accent);
      } else if (R.entry === 'najdi-door') {
        rect('frame', a - .2, d, b + .2, d + .15, P.trim);
        if (o >= 2) { const n = Math.max(3, Math.round((b - a + .4) / K.triSize)); for (let k = 0; k < n; k++) { const x = a - .2 + (b - a + .4) * k / n, w = (b - a + .4) / n; poly('frieze', [[x, d + .15], [x + w, d + .15], [x + w / 2, d + .15 + w * .8]], P.trim); } }
      }
    }
    allow = null;
    if (feature && feature.piece === pc) {
      const fw = .3, fz1 = (pc.parapet ? pc.parapet.z1 : z1) + .1, fc = P.trim === P.frame ? shade(P.wall, .85) : P.trim, b0 = ground ? .15 : z0;
      rect('frame', feature.u0 - fw, fz1 - fw, feature.u1 + fw, fz1, fc);
      rect('frame', feature.u1, b0, feature.u1 + fw, fz1, fc);
      if (K.frame === 'U') rect('frame', feature.u0 - fw, b0, feature.u0, fz1, fc);
    }
    prims.push(...pieceDeferred);
  }
  const top = Math.max(S.top, ...prims.map(p => (p.t === 'rect' ? p.z + p.h : p.t === 'poly' ? Math.max(...p.pts.map(q => q[1])) : 0)));
  return { side, prims, width: S.width, top: r3(top), street, front, crenels: crenelOK, empty: false, skipped };
}

/** مقاييس قابلة للاختبار: عدد عناصر كل دور، وكثافة الزخرفة، والفتحات المرسومة بمعرّفاتها. */
export function elevationMetrics(E) {
  const by = {}; for (const p of E.prims) by[p.role] = (by[p.role] || 0) + 1;
  const ornament = E.prims.filter(p => ORN_ROLES.has(p.role)).length;
  const openings = E.prims.filter(p => p.role === 'opening').map(p => p.opening);
  const fills = [...new Set(E.prims.filter(p => p.fill && p.role !== 'ground').map(p => p.fill))].sort();
  return { roles: by, ornament, openings, fills, width: E.width, top: E.top, perMeter: E.width ? r3(ornament / E.width) : 0 };
}

// ------------------------------------------------------------------------------------------ SVG
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** رسم الواجهة SVG (نص) — يعمل في node والمتصفح. */
export function elevationSvg(doc, side, spec, { geom = facadeGeometry(doc), title = true, px = 32 } = {}) {
  const E = composeElevation(doc, side, spec, geom);
  const W = Math.max(6, E.width + 4), Ht = Math.max(4, E.top + 1.6), x0 = -2, zTop = E.top + 1.2;
  const Y = z => r3(zTop - z), X = x => r3(x);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} -0.2 ${r3(W)} ${r3(Ht + .5)}" width="${Math.round(W * px)}" height="${Math.round((Ht + .5) * px)}" data-facade-side="${side}" data-facade-style="${spec.style}" data-seed="${spec.seed}" direction="rtl" role="img" aria-label="الواجهة ${SIDE_AR[side]} — طراز ${esc(spec.styleAr)}">`);
  out.push(`<rect x="${x0}" y="-0.2" width="${r3(W)}" height="${r3(Ht + .5)}" fill="#fbf8f2"/>`);
  if (E.empty) { out.push(`<text x="${r3(x0 + W / 2)}" y="${r3(Ht / 2)}" font-size=".4" text-anchor="middle" fill="#6b675e">لا جدار خارجي يواجه هذه الجهة</text></svg>`); return out.join(''); }
  for (const p of E.prims) {
    const st = p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw ?? .02}"` : '';
    const data = `${p.opening ? ` data-opening="${esc(p.opening)}" data-kind="${esc(p.kind)}"` : ''} data-role="${p.role}"`;
    if (p.t === 'rect') out.push(`<rect x="${X(p.x)}" y="${Y(p.z + p.h)}" width="${p.w}" height="${p.h}" fill="${p.fill}"${st}${data}/>`);
    else if (p.t === 'poly') out.push(`<polygon points="${p.pts.map(([x, z]) => X(x) + ',' + Y(z)).join(' ')}" fill="${p.fill}"${st}${data}/>`);
    else if (p.t === 'line') out.push(`<line x1="${X(p.x0)}" y1="${Y(p.z0)}" x2="${X(p.x1)}" y2="${Y(p.z1)}" stroke="${p.stroke}" stroke-width="${p.sw}"${data}/>`);
    else if (p.t === 'path') out.push(`<path d="${p.cmds.map(c => c[0] === 'Z' ? 'Z' : c[0] === 'A' ? `A${r3(c[1])},${r3(c[2])} 0 0 1 ${X(c[3])},${Y(c[4])}` : c[0] === 'Q' ? `Q${X(c[1])},${Y(c[2])} ${X(c[3])},${Y(c[4])}` : `${c[0]}${X(c[1])},${Y(c[2])}`).join(' ')}" fill="${p.fill}"${st}${data}/>`);
  }
  // خطوط المناسيب والأبعاد
  const gl = Y(0);
  out.push(`<line x1="${x0}" y1="${gl}" x2="${r3(x0 + W)}" y2="${gl}" stroke="#4a463f" stroke-width=".03"/>`);
  out.push(`<line x1="0" y1="${r3(gl + .45)}" x2="${E.width}" y2="${r3(gl + .45)}" stroke="#4a463f" stroke-width=".015"/><text x="${r3(E.width / 2)}" y="${r3(gl + .38)}" font-size=".26" text-anchor="middle" fill="#4a463f">${E.width.toFixed(2)} م</text>`);
  out.push(`<text x="${r3(x0 + W - .2)}" y="${r3(Y(E.top) - .1)}" font-size=".24" text-anchor="start" fill="#4a463f">أعلى نقطة +${E.top.toFixed(2)} م</text>`);
  if (title) out.push(`<text x="${r3(x0 + W - .2)}" y="0.25" font-size=".32" text-anchor="start" fill="#1f3b33" font-weight="700">الواجهة ${SIDE_AR[side]}${E.front ? ' (المدخل)' : E.street ? ' (على الشارع)' : ''} — ${esc(spec.styleAr)}</text>`);
  out.push('</svg>');
  return out.join('');
}

// ------------------------------------------------------------------------------------------ المجسّم ثلاثي الأبعاد
/**
 * إعدادات المجسّم من الطراز (يقرؤها draw/scene3d.mjs). null = لا طراز ← السلوك القديم حرفيًا.
 * اختيارات العميل الصريحة في doc.finish (اللون والمادة والكسوة) تتقدم دائمًا على ألوان الطراز.
 */
export function facadeStyle3D(doc) {
  const spec = resolveFacade(doc); if (!spec) return null;
  const R = spec.rules, P = spec.palette, K = spec.params, o = spec.orn;
  return {
    spec, colors: { render: P.wall, accent: P.accent, plinth: P.plinth, coping: P.trim, aluminium: P.frame, entryDoor: P.door, trim: P.trim, metal: P.metal },
    base: R.base, plinth: K.plinthH > 0, stoneAccent: spec.style === 'neoclassic' ? 'entry' : 'none',
    surround: R.surround === 'architrave' ? { w: o >= 2 ? .18 : .12, proj: .07 } : R.surround === 'flat' ? { w: .12, proj: .05 } : null,
    overhang: !!R.overhang, fins: !!R.fins && o >= 2,
    roofCornice: R.cornice === 'crown' ? { h: K.corniceH, proj: .22 } : R.cornice === 'plain' ? { h: K.corniceH, proj: .14 } : null,
    strings: R.strings === 'band' ? { h: .24, proj: .08 } : R.strings === 'thin' ? { h: .12, proj: .05 } : null,
    hoods: R.surround === 'architrave' && o >= 2, portico: R.entry === 'portico', canopy: R.entry === 'canopy' || R.entry === 'pilasters',
    crenels: K.crenel ? { w: K.crenelW, h: K.crenelH, kind: K.crenel } : null, maxHeight: MAX_VILLA_HEIGHT,
  };
}

// ------------------------------------------------------------------------------------------ التسليم
/**
 * نسخة من المستند تحمل اختيار الواجهة للمرسم والمجسّم (doc.finish.facade.style/seed/ornament/clientKey). المخطط نفسه حرفيًا.
 * choice: { style, ornament, color, source } من ملف الاحتياجات؛ style 'auto' يُحسم هنا حتميًا ويُعلَن أنه اختيار الميزان.
 */
export function withFacade(doc, choice, clientKey = 0) {
  if (!choice || !choice.style) return doc;
  const d = JSON.parse(JSON.stringify(doc));
  const seed = facadeSeed(doc, clientKey);
  const spec = resolveFacade(d, { style: choice.style, ornament: choice.ornament, color: choice.color, clientKey, seed });
  if (!spec) return doc;
  d.finish = d.finish || {};
  d.finish.facade = { ...(d.finish.facade || {}), style: spec.style, styleAr: spec.styleAr, styleChosenBy: spec.chosenBy, styleSource: choice.source || null, ornament: spec.ornament, seed, clientKey: clientKey >>> 0, ...(choice.color ? { styleColor: choice.color } : {}), facadeVersion: FACADE_VERSION };
  return d;
}

export default { FACADE_VERSION, STYLE_IDS, STYLE_AR, STYLES, resolveFacade, facadeGeometry, composeElevation, elevationSvg, elevationMetrics, facadeStyle3D, withFacade, facadeSeed, geometryKey, clientKeyOf };
