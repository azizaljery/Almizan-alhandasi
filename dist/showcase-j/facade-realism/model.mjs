// (طلب المالك 2026-11-02) عينة الواجهات الواقعية: نموذج هندسي واحد لثلاثة بدائل على الواجهة الأمامية (جهة المدخل) لمسقط C1.
// المصدر الوحيد للهندسة هو facadeGeometry في dist/facade-styles.mjs (للقراءة فقط): الفتحات وعددها وأماكنها وأبعادها من المسقط حرفيًا.
// كل طبقة تحمل plan:true إن كانت من المخطط (الجدار والفتحات والأبواب والزجاج)، وإلا فهي «تعديل مقترح» موسومة TAG.
// الجهات الأخرى (الشمالية والشرقية والغربية) تُبنى بالخامة الأساسية للبديل دون بروزات: الجدار الخارجي 25 سم يلاصق حد الارتداد الجانبي.
// لا تغيّر هذه الوحدة توليد الطرز الأربعة ولا عتباتها؛ هي إضافة مستقلة.
import { facadeGeometry } from '../facade-styles.mjs';

export const TAG = 'تعديل مقترح يحتاج مراجعة مهندس مختص';
export const SIDE = 's';
export const SIDES_ALL = Object.freeze(['s', 'n', 'e', 'w']);
/** أسماء الجهات كما يطلبها المالك: الواجهة الأمامية هي الجنوبية (مدخل المخطط)، والشمالية تُسمى باسمها الصحيح. */
export const SIDE_NAME = Object.freeze({ s: 'الأمامية — الجنوبية (جهة المدخل)', n: 'الشمالية', e: 'الشرقية', w: 'الغربية' });
export const CLASSES = Object.freeze(['stone', 'render', 'metal', 'timber', 'glass']);
export const CLASS_AR = Object.freeze({ stone: 'حجر', render: 'رندر/بياض', metal: 'ألمنيوم', timber: 'خشب مشابه', glass: 'زجاج' });
const EPS = 1e-6;
const FLUSH = .0015; // سماحية: أي بروز أقل من 1.5 مم يُعد لصقًا بالجدار
const r3 = v => Math.round(v * 1000) / 1000;

/**
 * الخامات: الاسم العربي والإنجليزي، الفئة، مكان الاستخدام، المرجع، وحالة التحقق.
 * «غير متحقق» حيث لم نقرأ المرجع؛ لا رقم فني هنا (الكثافة والامتصاص ومقاومة الانضغاط والحريق لم تُقرأ من المصادر).
 */
const REF_STONE = 'ASTM C568 (Limestone Dimension Stone) + EN 1469 (Slabs for cladding) — عنوانان فقط';
const REF_FIRE = 'EN 13501-1 — عنوان فقط؛ تصنيف الحريق للمنتج غير متحقق';
export const MATERIALS = Object.freeze({
  limestoneWhite: { ar: 'حجر جيري طبيعي أبيض', en: 'Natural white limestone', cls: 'stone', where: 'كسوة الواجهة الأمامية كلها (البديل A)، والجهات الأخرى في البديل A', ref: REF_STONE, verified: 'عنوان المرجع فقط — مضمونه لم يُقرأ؛ كل رقم فني غير متحقق — يُراجع بالمصدر' },
  limestoneBeige: { ar: 'حجر جيري بيج', en: 'Beige limestone', cls: 'stone', where: 'قاعدة الواجهة وحواف المبنى ودروة الإطار، والعتبات الوسادية (البديلان B وC)، وحجر المدخل (C)', ref: REF_STONE, verified: 'عنوان المرجع فقط — مضمونه لم يُقرأ؛ كل رقم فني غير متحقق — يُراجع بالمصدر' },
  render: { ar: 'رندر/بياض ملون', en: 'Coloured render (plaster)', cls: 'render', where: 'الجدار الأساسي للبديلين B وC في كل الجهات', ref: REF_FIRE, verified: 'غير متحقق — لا مرجع مقروء لمكوّن الرندر' },
  aluminium: { ar: 'ألمنيوم بلون داكن للإطارات', en: 'Dark anthracite aluminium', cls: 'metal', where: 'إطارات النوافذ في البدائل الثلاثة، وأبواب المدخل (A)، والمظلات والكاسرات (B)', ref: 'غير متحقق — لم يُحدَّد مرجع للإطارات بعد', verified: 'غير متحقق' },
  glass: { ar: 'زجاج بطبقة عاكسة خفيفة', en: 'Glass with light reflective coating', cls: 'glass', where: 'تعبئة النوافذ في البدائل الثلاثة، وباب المدخل الزجاجي (B)', ref: 'غير متحقق — لم يُقرأ مرجع الزجاج (معايير المنتج)', verified: 'غير متحقق — لا قيم نفاذية أو عزل تُكتب' },
  timberLook: { ar: 'خشب مشابه (إجرائي)', en: 'Timber-look (procedural imitation, not treated timber)', cls: 'timber', where: 'لوح الفاسيا أعلى الدور الأرضي وباب المدخل الخشبي (C)', ref: 'غير متحقق — ليس خشبًا معالجًا ولا مواصفة خشب؛ مادة مرسومة فقط', verified: 'مشابه إجرائي — لا يُدّعى أنه خشب معالج أو مطابق لأي مواصفة' },
});

// ---------------------------------------------------------------- هندسة ثنائية البعد (u, z) داخل الواجهة
const rectPts = r => [[r.u0, r.z0], [r.u1, r.z0], [r.u1, r.z1], [r.u0, r.z1]];
export function openingPoly(o) {
  if (o.kind !== 'arch') return rectPts(o);
  // قوس: ربع/نصف إهليليجي أعلى الفتحة كما في composeElevation (rr = min(عرض/2، ارتفاع))
  const wv = o.u1 - o.u0, rr = Math.min(wv / 2, o.z1 - o.z0), rx = wv / 2, cx = (o.u0 + o.u1) / 2, zc = o.z1 - rr;
  const pts = [[o.u0, o.z0], [o.u1, o.z0], [o.u1, zc]];
  for (let k = 0; k <= 24; k++) { const a = Math.PI * k / 24; pts.push([cx + rx * Math.cos(a), zc + rr * Math.sin(a)]); }
  return pts;
}
const overlaps = (a, b) => Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > EPS && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > EPS;
const inside = (o, r) => o.u0 >= r.u0 - EPS && o.u1 <= r.u1 + EPS && o.z0 >= r.z0 - EPS && o.z1 <= r.z1 + EPS;
/** r \ o: حتى أربعة مستطيلات متجاورة لا تتداخل مع o. */
export function subtractRect(r, o) {
  if (!overlaps(r, o)) return [r];
  const iu0 = Math.max(r.u0, o.u0), iu1 = Math.min(r.u1, o.u1), iz0 = Math.max(r.z0, o.z0), iz1 = Math.min(r.z1, o.z1), out = [];
  if (r.z0 < iz0 - EPS) out.push({ u0: r.u0, u1: r.u1, z0: r.z0, z1: iz0 });
  if (iz1 < r.z1 - EPS) out.push({ u0: r.u0, u1: r.u1, z0: iz1, z1: r.z1 });
  if (r.u0 < iu0 - EPS) out.push({ u0: r.u0, u1: iu0, z0: iz0, z1: iz1 });
  if (iu1 < r.u1 - EPS) out.push({ u0: iu1, u1: r.u1, z0: iz0, z1: iz1 });
  return out;
}
/** منطقة كسوة مستطيلة: الفتحة الداخلة كلها تصبح ثقبًا، والفتحة المتقاطعة جزئيًا تُقطع من المنطقة. لا تقاطع جزئي يبقى. */
export function zoneParts(zone, openings) {
  let rects = [zone];
  for (const o of openings) if (overlaps(zone, o) && !inside(o, zone)) rects = rects.flatMap(r => subtractRect(r, o));
  return rects.filter(r => r.u1 - r.u0 > EPS && r.z1 - r.z0 > EPS).map(r => {
    const holes = openings.filter(o => overlaps(r, o));
    for (const o of holes) if (!inside(o, r)) throw new Error('تقاطع جزئي غير متوقع لفتحة ' + o.id);
    return { rect: r, holes };
  });
}

// ---------------------------------------------------------------- الجهات من المسقط
/**
 * الجهة كما يراها الواقف خارج المبنى (u يزداد إلى يمينه). يعيد القطع الخارجية والفتحات بإحداثيات u الطبيعية (0 = أقصى اليسار)،
 * مع ربط كل قطعة بمستوى جدارها الأصلي (C = -العمق) وبحدود المسقط الحقيقية (offsets) لتحويلها إلى المشهد.
 */
export function sideGeometry(doc, side = SIDE) {
  const g = facadeGeometry(doc), S = g.sides[side], byId = new Map((doc.walls || []).map(w => [w.id, w]));
  const xs = [], ys = [];
  for (const p of S.pieces) for (const id of p.wallIds) { const w = byId.get(id); if (w) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); } }
  const off = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const bb = planBounds(doc);
  const pieces = S.pieces.map((p, i) => {
    const t = Math.max(0, ...p.wallIds.map(id => byId.get(id)?.t || 0)) || .2;
    const zTop = p.parapet ? p.parapet.z1 : p.z1;
    const id = (side === 's' ? 'P' : side) + i;
    return {
      i, id, u0: p.u0, u1: p.u1, z0: p.z0, z1: p.z1, zTop, t, C: -p.depth, depth: p.depth, top: !!p.top, hasParapet: !!p.parapet,
      openings: p.openings.map(o => ({ ...o, poly: openingPoly(o) })), wallIds: p.wallIds,
    };
  });
  return { side, pieces, plinth: g.plinth, width: S.width, top: S.top, off, bounds: bb, openingIds: pieces.flatMap(p => p.openings.map(o => o.id)) };
}
export function planBounds(doc) {
  const P = doc.plot?.polygon || [];
  return { minX: Math.min(...P.map(p => p.x)), maxX: Math.max(...P.map(p => p.x)), minY: Math.min(...P.map(p => p.y)), maxY: Math.max(...P.map(p => p.y)), setbacks: doc.plot?.setbacks || {} };
}
/** الواجهة الأمامية (الجنوبية) كما كانت: تُبقى الأسماء القديمة للاختبارات. */
export function frontPieces(doc) {
  const G = sideGeometry(doc, 's');
  return { pieces: G.pieces, plinth: G.plinth, width: G.width, top: G.top, openingIds: G.openingIds, side: 's', off: G.off };
}

/**
 * تحويل إحداثيات الطبقة (u، z، zl) إلى المشهد ثلاثي الأبعاد: X = س، Y = ارتفاع، Z = -ص (جنوب موجب إلى +Z).
 * zl = C + o حيث o هو البعد الخارجي عن محور الجدار. كل التحويلات دوران صِرف (det = +1) فلا تنعكس اللفائف.
 */
export function sideTransform(side, off) {
  switch (side) {
    case 's': return [[1, 0, 0, off.minX], [0, 1, 0, 0], [0, 0, 1, 0]];
    case 'n': return [[-1, 0, 0, off.maxX], [0, 1, 0, 0], [0, 0, -1, 0]];
    case 'e': return [[0, 0, 1, 0], [0, 1, 0, 0], [-1, 0, 0, -off.minY]];
    case 'w': return [[0, 0, -1, 0], [0, 1, 0, 0], [1, 0, 0, -off.maxY]];
    default: throw new Error('جهة غير معروفة: ' + side);
  }
}
/** نقطة من الطبقات إلى المسقط: (u, zl) في جهة معينة ← (س، ص) في المسقط. */
export function planPoint(side, off, u, zl) {
  const M = sideTransform(side, off);
  const X = M[0][0] * u + M[0][2] * zl + M[0][3], Z = M[2][0] * u + M[2][2] * zl + M[2][3];
  return { x: r3(X), y: r3(-Z) };
}

// ---------------------------------------------------------------- منشئ الطبقات
/** يبني طبقات كسوة (مستطيلات مع ثقوب الفتحات) داخل منطقة على جزء واحد. */
function cladding(pc, { id, name, mat, zone, o0, o1, role = 'cladding' }) {
  return zoneParts(zone, pc.openings).map((part, k) => ({
    id: `${pc.id}/${id}${k ? '.' + k : ''}`, name, role, piece: pc.i, C: pc.C, mat, cls: MATERIALS[mat].cls, plan: false, tag: TAG,
    o0, o1, u0: part.rect.u0, u1: part.rect.u1, z0: part.rect.z0, z1: part.rect.z1,
    outer: rectPts(part.rect), holes: part.holes.map(h => h.poly),
  }));
}
/** صندوق بارز (كرنيش، عتبة، مظلة، كاسر، غطاء). لا يقطع فتحات: يُفحص ألا يتقاطع مع فتحة. */
function block(pc, { id, name, mat, u0, u1, z0, z1, o0, o1, role = 'projection', poly = null, tag = TAG }) {
  const r = { u0, u1, z0, z1 };
  for (const o of pc.openings) if (overlaps(r, o)) throw new Error(`صندوق ${id} يتقاطع مع الفتحة ${o.id}`);
  const outer = poly || rectPts(r);
  return [{ id: `${pc.id}/${id}`, name, role, piece: pc.i, C: pc.C, mat, cls: MATERIALS[mat].cls, plan: false, tag, o0, o1, u0, u1, z0, z1, outer, holes: [] }];
}
/** حلقة بارزة حول فتحة (تأطير حجري): المستطيل الموسّع ناقص الفتحة نفسها. لا تتقاطع مع فتحة أخرى. */
function ring(pc, o, { grow, id, name, mat, o0, o1 }) {
  const r = { u0: o.u0 - grow, u1: o.u1 + grow, z0: o.z0 - grow, z1: o.z1 + grow };
  for (const x of pc.openings) if (x.id !== o.id && overlaps(r, x)) throw new Error(`تأطير ${id} يتقاطع مع الفتحة ${x.id}`);
  return { id: `${pc.id}/${id}`, name, role: 'surround', piece: pc.i, C: pc.C, mat, cls: MATERIALS[mat].cls, plan: false, tag: TAG, o0, o1, u0: r.u0, u1: r.u1, z0: r.z0, z1: r.z1, outer: rectPts(r), holes: [o.poly] };
}
/** إطار النافذة أو الباب: الحلقة بين الفتحة وتعبئتها المنكمشة. */
function frame(pc, o, { mat, fw, o0, o1 }) {
  const inner = { u0: o.u0 + fw, u1: o.u1 - fw, z0: o.z0 + fw, z1: o.z1 - fw };
  return { id: `${pc.id}/${o.id}.frame`, name: 'إطار ' + o.id, role: 'frame', piece: pc.i, C: pc.C, mat, cls: MATERIALS[mat].cls, plan: false, tag: TAG, o0, o1, u0: o.u0, u1: o.u1, z0: o.z0, z1: o.z1, outer: rectPts(o), holes: [rectPts(inner)], opening: o.id };
}
/** تعبئة الفتحة (زجاج أو باب) داخل الإطار. في المخطط. */
function infill(pc, o, { mat, fw, o0, o1, role }) {
  const r = { u0: o.u0 + fw, u1: o.u1 - fw, z0: o.z0 + fw, z1: o.z1 - fw };
  return { id: `${pc.id}/${o.id}.${role}`, name: role === 'door' ? 'باب ' + o.id : 'زجاج ' + o.id, role, piece: pc.i, C: pc.C, mat, cls: MATERIALS[mat].cls, plan: true, tag: null, o0, o1, u0: r.u0, u1: r.u1, z0: r.z0, z1: r.z1, outer: rectPts(r), holes: [], opening: o.id };
}
const wallBase = (pc, mat) => ({ id: `${pc.id}/wall`, name: 'الجدار الأساسي (المسقط)', role: 'wall', piece: pc.i, C: pc.C, mat, cls: MATERIALS[mat].cls, plan: true, tag: null, o0: -pc.t / 2, o1: pc.t / 2, u0: pc.u0, u1: pc.u1, z0: pc.z0, z1: pc.zTop, outer: rectPts({ u0: pc.u0, u1: pc.u1, z0: pc.z0, z1: pc.zTop }), holes: pc.openings.map(o => o.poly) });
const fullZone = pc => ({ u0: pc.u0, u1: pc.u1, z0: pc.z0, z1: pc.zTop });
const plinthZone = (pc, plinth) => ({ u0: pc.u0, u1: pc.u1, z0: pc.z0, z1: plinth });
const isEntry = o => o.entry && !/^window/.test(o.kind);
const isWin = o => /^window/.test(o.kind);

// ---------------------------------------------------------------- مواصفات الفتحات لكل بديل (عمق الارتداد وإطار وعتبة)
/** كل فتحة: إطار داكن أو خشبي داخل تجويف (ارتداد واضح عن وجه الجدار)، وتعبئة زجاجية أو باب، وعتبة وسادة بارزة للنوافذ. */
const SPEC = Object.freeze({
  A: { win: { frame: 'aluminium', fw: .06, o0: -.12, o1: -.02, glass: 'glass', gO0: -.115, gO1: -.105 }, door: { frame: 'aluminium', fw: .04, o0: -.06, o1: -.02, infill: 'aluminium', iO0: -.06, iO1: -.02 }, sill: { mat: 'limestoneWhite', proud: .07 } },
  B: { win: { frame: 'aluminium', fw: .05, o0: -.12, o1: -.02, glass: 'glass', gO0: -.115, gO1: -.105 }, door: { frame: 'aluminium', fw: .05, o0: -.12, o1: -.02, infill: 'glass', iO0: -.115, iO1: -.105 }, sill: { mat: 'limestoneBeige', proud: .07 } },
  C: { win: { frame: 'aluminium', fw: .08, o0: -.14, o1: -.04, glass: 'glass', gO0: -.13, gO1: -.12 }, door: { frame: 'timberLook', fw: .08, o0: -.14, o1: -.04, infill: 'timberLook', iO0: -.13, iO1: -.12 }, sill: { mat: 'limestoneBeige', proud: .05 } },
});
/** فتحات الجهة: الإطارات والتعبئات والعتبات. العتبة الوسادية تبرز (من وجه الجدار) وتُطلب على الواجهة الأمامية فقط. */
function openingLayers(pc, id, { sills }) {
  const S = SPEC[id], L = [], t2 = pc.t / 2;
  for (const o of pc.openings) {
    if (isWin(o)) {
      const w = S.win;
      if (sills) L.push(...block(pc, { id: o.id + '.sill', name: 'عتبة وسادة للنافذة ' + o.id, mat: S.sill.mat, u0: o.u0 - .05, u1: o.u1 + .05, z0: o.z0 - .05, z1: o.z0, o0: t2 - .02, o1: t2 + S.sill.proud, role: 'sill' }));
      L.push(frame(pc, o, { mat: w.frame, fw: w.fw, o0: t2 + w.o0, o1: t2 + w.o1 }));
      L.push(infill(pc, o, { mat: w.glass, fw: w.fw, o0: t2 + w.gO0, o1: t2 + w.gO1, role: 'glazing' }));
    } else {
      const d = S.door;
      L.push(frame(pc, o, { mat: d.frame, fw: d.fw, o0: t2 + d.o0, o1: t2 + d.o1 }));
      L.push(infill(pc, o, { mat: d.infill, fw: d.fw, o0: t2 + d.iO0, o1: t2 + d.iO1, role: 'door' }));
    }
  }
  return L;
}
/** جهات بلا بروزات: الجدار بالخامة الأساسية، وقاعدة وفاسيا ملتصقة بالجدار (لا تتجاوز وجهه)، والفتحات بتجويفها. */
function plainLayers(pc, geo, id) {
  const L = [wallBase(pc, id === 'A' ? 'limestoneWhite' : 'render')], t2 = pc.t / 2;
  if (id !== 'A') L.push(...cladding(pc, { id: 'plinth', name: 'قاعدة حجر جيري بيج (45 سم) ملتصقة', mat: 'limestoneBeige', zone: plinthZone(pc, geo.plinth), o0: t2, o1: t2 + FLUSH }));
  if (id === 'C' && pc.top) L.push(...cladding(pc, { id: 'fascia', name: 'لوح خشب مشابه ملتصق أعلى الدور الأرضي', mat: 'timberLook', zone: { u0: pc.u0, u1: pc.u1, z0: pc.z1 - .55, z1: pc.z1 }, o0: t2, o1: t2 + FLUSH }));
  L.push(...openingLayers(pc, id, { sills: false }));
  if (pc.top && pc.hasParapet) L.push(...block(pc, { id: 'coping', name: 'غطاء الدروة', mat: id === 'A' ? 'limestoneWhite' : 'aluminium', u0: pc.u0 - .03, u1: pc.u1 + .03, z0: pc.zTop, z1: pc.zTop + .05, o0: t2, o1: t2 + .05, role: 'cornice' }));
  if (id === 'A' && pc.top) L.push(...block(pc, { id: 'cornice', name: 'كرنيش حجري (بروز ≤ 25 سم)', mat: 'limestoneWhite', u0: pc.u0 - .08, u1: pc.u1 + .08, z0: pc.z1 - .06, z1: pc.z1 + .1, o0: t2, o1: t2 + .14, role: 'cornice' }));
  return L;
}

// ---------------------------------------------------------------- البدائل الثلاثة (الجهة الأمامية: التفاصيل كاملة)
/**
 * كل بديل: توزيع الكسوات، تكوين المدخل، البروزات والتجاويف (لا شرفات ولا فتحات جديدة)، المظلات والكاسرات، وتفاصيل النوافذ.
 * كل بروز ليس في المخطط موسوم TAG بحكم الدالة block/cladding.
 */
export const VARIANTS = Object.freeze({
  A: { id: 'A', ar: 'حجر جيري أبيض كامل', summary: 'كسوة حجر أبيض كاملة مع قاعدة بارزة 4 سم، شريط حجري أفقي عند 3.20 م، مدخل بإطار حجري وجملون صغير، تأطير حجري للنوافذ، كرنيش حجري.' },
  B: { id: 'B', ar: 'رندر بيج بقاعدة حجرية بارزة ومظلات وكاسرات معدنية', summary: 'رندر فاتح؛ قاعدة حجر بيج بارزة 10 سم؛ حواف رأسية حجرية؛ مظلة معدنية فوق كل مدخل؛ كاسرات أفقية فوق النوافذ؛ باب زجاجي بإطار داكن.' },
  C: { id: 'C', ar: 'رندر فاتح بفاسيا خشب مشابه وسقف مسنّن وعتبة حجرية للمدخل', summary: 'رندر فاتح؛ قاعدة حجر بيج ملتصقة؛ فاسيا خشب مشابه أعلى الدور؛ صف أسنان حجرية تحت الدروة؛ هود حجري فوق كل مدخل؛ باب خشبي مشابه؛ نوافذ بإطار داكن.' },
});

function buildFrontA(pc, geo) {
  const t2 = pc.t / 2, L = [wallBase(pc, 'limestoneWhite')];
  L.push(...cladding(pc, { id: 'cladding', name: 'كسوة حجر جيري أبيض (35 مم)', mat: 'limestoneWhite', zone: fullZone(pc), o0: t2, o1: t2 + .035 }));
  L.push(...block(pc, { id: 'plinth', name: 'قاعدة حجرية بارزة 4 سم', mat: 'limestoneWhite', u0: pc.u0, u1: pc.u1, z0: pc.z0, z1: geo.plinth, o0: t2 + .035, o1: t2 + .075 }));
  L.push(...block(pc, { id: 'string', name: 'شريط حجري أفقي عند 3.20 م', mat: 'limestoneWhite', u0: pc.u0, u1: pc.u1, z0: 3.2, z1: 3.28, o0: t2 + .035, o1: t2 + .075 }));
  for (const o of pc.openings) {
    if (isEntry(o)) {
      L.push(...block(pc, { id: o.id + '.jambL', name: 'حجر المدخل يسار', mat: 'limestoneWhite', u0: o.u0 - .14, u1: o.u0, z0: pc.z0, z1: o.z1 + .14, o0: t2, o1: t2 + .14 }));
      L.push(...block(pc, { id: o.id + '.jambR', name: 'حجر المدخل يمين', mat: 'limestoneWhite', u0: o.u1, u1: o.u1 + .14, z0: pc.z0, z1: o.z1 + .14, o0: t2, o1: t2 + .14 }));
      L.push(...block(pc, { id: o.id + '.lintel', name: 'عتبة علوية للمدخل', mat: 'limestoneWhite', u0: o.u0 - .14, u1: o.u1 + .14, z0: o.z1, z1: o.z1 + .14, o0: t2, o1: t2 + .14 }));
      const cx = (o.u0 + o.u1) / 2, b0 = o.u0 - .14, b1 = o.u1 + .14, zb = o.z1 + .14;
      L.push(...block(pc, { id: o.id + '.gable', name: 'جملون حجري فوق المدخل', mat: 'limestoneWhite', u0: b0, u1: b1, z0: zb, z1: zb + .22, o0: t2, o1: t2 + .14, role: 'pediment', poly: [[b0, zb], [b1, zb], [cx, zb + .22]] }));
    }
    if (isWin(o)) L.push(ring(pc, o, { grow: .07, id: o.id + '.surround', name: 'تأطير حجري للنافذة ' + o.id, mat: 'limestoneWhite', o0: t2 + .035, o1: t2 + .065 }));
  }
  if (pc.top && pc.hasParapet) L.push(...block(pc, { id: 'coping', name: 'غطاء حجر أبيض للدروة', mat: 'limestoneWhite', u0: pc.u0 - .03, u1: pc.u1 + .03, z0: pc.zTop, z1: pc.zTop + .06, o0: t2, o1: t2 + .06, role: 'cornice' }));
  if (pc.top) L.push(...block(pc, { id: 'cornice', name: 'كرنيش حجري بارز عند حافة السطح', mat: 'limestoneWhite', u0: pc.u0 - .08, u1: pc.u1 + .08, z0: pc.z1 - .06, z1: pc.z1 + .1, o0: t2, o1: t2 + .14, role: 'cornice' }));
  L.push(...openingLayers(pc, 'A', { sills: true }));
  return L;
}
function buildFrontB(pc, geo) {
  const t2 = pc.t / 2, L = [wallBase(pc, 'render')];
  L.push(...cladding(pc, { id: 'plinth', name: 'قاعدة حجر جيري بيج (45 سم)', mat: 'limestoneBeige', zone: plinthZone(pc, geo.plinth), o0: t2, o1: t2 + .1 }));
  L.push(...cladding(pc, { id: 'quoinL', name: 'حافة حجرية رأسية يسار (35 سم)', mat: 'limestoneBeige', zone: { u0: pc.u0, u1: pc.u0 + .35, z0: geo.plinth, z1: pc.zTop }, o0: t2, o1: t2 + .03 }));
  L.push(...cladding(pc, { id: 'quoinR', name: 'حافة حجرية رأسية يمين (35 سم)', mat: 'limestoneBeige', zone: { u0: pc.u1 - .35, u1: pc.u1, z0: geo.plinth, z1: pc.zTop }, o0: t2, o1: t2 + .03 }));
  for (const o of pc.openings) {
    if (isEntry(o)) L.push(...block(pc, { id: o.id + '.canopy', name: 'مظلة معدنية فوق المدخل ' + o.id, mat: 'aluminium', u0: o.u0 - .5, u1: o.u1 + .5, z0: o.z1 + .08, z1: o.z1 + .16, o0: t2, o1: t2 + .9 }));
    if (isWin(o)) L.push(...block(pc, { id: o.id + '.louver', name: 'كاسر أفقي فوق النافذة ' + o.id, mat: 'aluminium', u0: o.u0 - .05, u1: o.u1 + .05, z0: o.z1 + .12, z1: o.z1 + .16, o0: t2, o1: t2 + .45 }));
  }
  if (pc.top && pc.hasParapet) L.push(...block(pc, { id: 'coping', name: 'غطاء معدني رفيع للدروة', mat: 'aluminium', u0: pc.u0, u1: pc.u1, z0: pc.zTop, z1: pc.zTop + .05, o0: t2, o1: t2 + .03, role: 'cornice' }));
  L.push(...openingLayers(pc, 'B', { sills: true }));
  return L;
}
function buildFrontC(pc, geo) {
  const t2 = pc.t / 2, L = [wallBase(pc, 'render')];
  L.push(...cladding(pc, { id: 'plinth', name: 'قاعدة حجر جيري بيج (45 سم)', mat: 'limestoneBeige', zone: plinthZone(pc, geo.plinth), o0: t2, o1: t2 + .02 }));
  if (pc.top) L.push(...cladding(pc, { id: 'fascia', name: 'لوح خشب مشابه أعلى الدور الأرضي', mat: 'timberLook', zone: { u0: pc.u0, u1: pc.u1, z0: pc.z1 - .55, z1: pc.z1 }, o0: t2, o1: t2 + .03 }));
  if (pc.top) {
    for (let u = pc.u0 + .2, k = 0; u + .15 <= pc.u1 - .1; u += .35, k++) L.push(...block(pc, { id: 'dentil' + k, name: 'سن حجري تحت الدروة', mat: 'limestoneBeige', u0: u, u1: u + .15, z0: pc.z1, z1: pc.z1 + .12, o0: t2, o1: t2 + .12, role: 'dentil' }));
  }
  for (const o of pc.openings) {
    if (isEntry(o)) {
      L.push(...block(pc, { id: o.id + '.hood', name: 'هود حجري بارز فوق المدخل ' + o.id, mat: 'limestoneBeige', u0: o.u0 - .25, u1: o.u1 + .25, z0: o.z1 + .12, z1: o.z1 + .2, o0: t2, o1: t2 + .25 }));
      L.push(...block(pc, { id: o.id + '.jambL', name: 'عتبة حجرية للمدخل يسار', mat: 'limestoneBeige', u0: o.u0 - .1, u1: o.u0, z0: pc.z0 + geo.plinth, z1: o.z1, o0: t2, o1: t2 + .05 }));
      L.push(...block(pc, { id: o.id + '.jambR', name: 'عتبة حجرية للمدخل يمين', mat: 'limestoneBeige', u0: o.u1, u1: o.u1 + .1, z0: pc.z0 + geo.plinth, z1: o.z1, o0: t2, o1: t2 + .05 }));
    }
  }
  if (pc.top && pc.hasParapet) L.push(...block(pc, { id: 'coping', name: 'غطاء حجر بيج للدروة', mat: 'limestoneBeige', u0: pc.u0 - .03, u1: pc.u1 + .03, z0: pc.zTop, z1: pc.zTop + .06, o0: t2, o1: t2 + .04, role: 'cornice' }));
  L.push(...openingLayers(pc, 'C', { sills: true }));
  return L;
}
const FRONT = { A: buildFrontA, B: buildFrontB, C: buildFrontC };

/** يبني طبقات بديل واحد على جهة واحدة. الجهة الأمامية بتفاصيل كاملة، والجهات الأخرى بخامة البديل فقط. يرجع الطبقات من الأبعد إلى الأقرب. */
export function buildVariant(doc, id, side = SIDE) {
  if (!FRONT[id]) throw new Error('بديل غير معروف: ' + id);
  if (!SIDES_ALL.includes(side)) throw new Error('جهة غير معروفة: ' + side);
  const G = sideGeometry(doc, side), geo = { plinth: G.plinth };
  const layers = G.pieces.flatMap(pc => (side === 's' ? FRONT[id](pc, geo) : plainLayers(pc, geo, id)));
  const tById = new Map(G.pieces.map(p => [p.i, p.t]));
  for (const L of layers) L.t = tById.get(L.piece);
  layers.sort((a, b) => a.C - b.C); // الأبعد أولًا: C = -العمق، والأقرب إلى الخارج له C أكبر
  return { variant: VARIANTS[id], side, F: G, layers, off: G.off };
}
/** كل الجهات الأربع لبديل واحد (مفيد للمشهد ثلاثي الأبعاد). */
export function buildAllSides(doc, id) {
  return Object.fromEntries(SIDES_ALL.map(s => [s, buildVariant(doc, id, s)]));
}

/**
 * تقرير البروزات: كل طبقة تتجاوز وجه جدارها تُقاس مسافتها من حد الملكية المقابل وتُقارن بالحد النظامي للجهة.
 * الجهة الأمامية: حد 3 م (المسقط)، والاشتراط الوطني max(3، عرض الشارع / 5) و6 م لشارع 30 م فأكثر: عرض الشارع غير مُدخل فيُعلَّم «غير متحقق».
 * الجهات الأخرى: حد 1.5 م؛ البروز داخل الحد ممنوع إلا كرنيش حتى 25 سم.
 */
export function projectionReport(doc, built) {
  const B = planBounds(doc), S = B.setbacks, side = built.side, sign = side === 'n' || side === 'e' ? 1 : -1;
  const street = doc.plot?.streetWidth ?? doc.streetWidth ?? null;
  const rows = [];
  for (const L of built.layers) {
    const p = Math.max(0, L.o1 - L.t / 2);
    if (p <= FLUSH) continue;
    const wallPlane = (side === 's' || side === 'w') ? -L.C : L.C; // موضع محور الجدار في المسقط
    const tip = wallPlane + sign * (L.t / 2 + p);
    const dist = side === 's' ? tip - B.minY : side === 'n' ? B.maxY - tip : side === 'e' ? B.maxX - tip : tip - B.minX;
    const sb = S[side] ?? 0;
    let status;
    if (side === 's') {
      if (dist >= 6) status = 'ok';
      else if (dist >= sb) status = street == null ? 'غير متحقق: عرض الشارع غير مُدخل في المستند (streetWidth = null)؛ يبقى البروز مقبولًا إن كان عرض الشارع ≤ ' + r3(5 * dist) + ' م، وشرط 10 م للشوارع يحتاج العرض نفسه' : (dist >= sb && street <= 5 * dist ? 'ok' : 'violation');
      else status = 'violation';
    } else if (dist >= sb) status = 'ok';
    else if (L.role === 'cornice' && p <= .25) status = 'ok (كرنيش حتى 25 سم)';
    else status = 'violation';
    rows.push({ id: L.id, side, role: L.role, protrusion: r3(p), distFromPlotLine: r3(dist), setback: sb, status });
  }
  return rows;
}

export default { TAG, MATERIALS, VARIANTS, SIDE_NAME, buildVariant, buildAllSides, frontPieces, sideGeometry, sideTransform, planPoint, projectionReport, zoneParts, subtractRect, openingPoly };
