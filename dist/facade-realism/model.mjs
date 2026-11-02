// (طلب المالك 2026-11-02) عينة الواجهات الواقعية: نموذج هندسي واحد لثلاثة بدائل على الواجهة الأمامية (جهة المدخل) لمسقط C1.
// المصدر الوحيد للهندسة هو facadeGeometry في dist/facade-styles.mjs (للقراءة فقط): الفتحات وعددها وأماكنها وأبعادها من المسقط حرفيًا.
// كل طبقة تحمل plan:true إن كانت من المخطط (الجدار والفتحات والأبواب والزجاج)، وإلا فهي «تعديل مقترح» موسومة TAG.
// لا تغيّر هذه الوحدة توليد الطرز الأربعة ولا عتباتها؛ هي إضافة مستقلة.
import { facadeGeometry } from '../facade-styles.mjs';

export const TAG = 'تعديل مقترح يحتاج مراجعة مهندس مختص';
export const SIDE = 's';
export const CLASSES = Object.freeze(['stone', 'render', 'metal', 'timber', 'glass']);
export const CLASS_AR = Object.freeze({ stone: 'حجر', render: 'رندر/بياض', metal: 'ألمنيوم', timber: 'خشب مشابه', glass: 'زجاج' });
const EPS = 1e-6;
const r3 = v => Math.round(v * 1000) / 1000;

/**
 * الخامات: الاسم العربي والإنجليزي، الفئة، مكان الاستخدام، المرجع، وحالة التحقق.
 * «غير متحقق» حيث لم نقرأ المرجع؛ لا رقم فني هنا (الكثافة والامتصاص ومقاومة الانضغاط والحريق لم تُقرأ من المصادر).
 */
const REF_STONE = 'ASTM C568 (Limestone Dimension Stone) + EN 1469 (Slabs for cladding) — عنوانان فقط';
const REF_FIRE = 'EN 13501-1 — عنوان فقط؛ تصنيف الحريق للمنتج غير متحقق';
export const MATERIALS = Object.freeze({
  limestoneWhite: { ar: 'حجر جيري طبيعي أبيض', en: 'Natural white limestone', cls: 'stone', where: 'كسوة الواجهة كلها (البديل A): الجدار الأساسي، الكسوة، العتبات، الكرنيش، المدخل', ref: REF_STONE, verified: 'عنوان المرجع فقط — مضمونه لم يُقرأ؛ كل رقم فني غير متحقق — يُراجع بالمصدر' },
  limestoneBeige: { ar: 'حجر جيري بيج', en: 'Beige limestone', cls: 'stone', where: 'قاعدة الواجهة (45 سم) والحواف الرأسية (البديل B)، العتبات وحجر المدخل (البديل C)', ref: REF_STONE, verified: 'عنوان المرجع فقط — مضمونه لم يُقرأ؛ كل رقم فني غير متحقق — يُراجع بالمصدر' },
  render: { ar: 'رندر/بياض ملون', en: 'Coloured render (plaster)', cls: 'render', where: 'الجدار الأساسي للبديلين B وC (ما عدا القاعدة والحواف والفاسيا)', ref: REF_FIRE, verified: 'غير متحقق — لا مرجع مقروء لمكوّن الرندر' },
  aluminium: { ar: 'ألمنيوم بلون داكن للإطارات', en: 'Dark anthracite aluminium', cls: 'metal', where: 'إطارات النوافذ (A وB)، باب المدخل (A)، المظلة والكاسرات والدروة المعدنية (B)', ref: 'غير متحقق — لم يُحدَّد مرجع للإطارات بعد', verified: 'غير متحقق' },
  glass: { ar: 'زجاج بطبقة عاكسة خفيفة', en: 'Glass with light reflective coating', cls: 'glass', where: 'تعبئة النوافذ في البدائل الثلاثة، وباب المدخل الزجاجي (B)', ref: 'غير متحقق — لم يُقرأ مرجع الزجاج (معايير المنتج)', verified: 'غير متحقق — لا قيم نفاذية أو عزل تُكتب' },
  timberLook: { ar: 'خشب مشابه (إجرائي)', en: 'Timber-look (procedural imitation, not treated timber)', cls: 'timber', where: 'باب المدخل (C)، إطارات النوافذ (C)، لوح الفاسيا أعلى الدور الأرضي (C)', ref: 'غير متحقق — ليس خشبًا معالجًا ولا مواصفة خشب؛ مادة مرسومة فقط', verified: 'مشابه إجرائي — لا يُدّعى أنه خشب معالج أو مطابق لأي مواصفة' },
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

// ---------------------------------------------------------------- الأجزاء الأمامية من المسقط
export function frontPieces(doc) {
  const g = facadeGeometry(doc), S = g.sides[SIDE], byId = new Map((doc.walls || []).map(w => [w.id, w]));
  const pieces = S.pieces.map((p, i) => {
    const t = Math.max(0, ...p.wallIds.map(id => byId.get(id)?.t || 0)) || .2;
    const zTop = p.parapet ? p.parapet.z1 : p.z1;
    return {
      i, id: 'P' + i, u0: p.u0, u1: p.u1, z0: p.z0, z1: p.z1, zTop, t, C: -p.depth, depth: p.depth, top: !!p.top, hasParapet: !!p.parapet,
      openings: p.openings.map(o => ({ ...o, poly: openingPoly(o) })), wallIds: p.wallIds,
    };
  });
  return { pieces, plinth: g.plinth, width: S.width, top: S.top, openingIds: pieces.flatMap(p => p.openings.map(o => o.id)) };
}

// ---------------------------------------------------------------- منشئ الطبقات
/** يبني طبقات كسوة (مستطيلات مع ثقوب الفتحات) داخل منطقة على جزء أمامي واحد. */
function cladding(pc, { id, name, mat, zone, o0, o1, role = 'cladding' }) {
  return zoneParts(zone, pc.openings).map((part, k) => ({
    id: `${pc.id}/${id}${k ? '.' + k : ''}`, name, role, piece: pc.i, C: pc.C, mat, cls: MATERIALS[mat].cls, plan: false, tag: TAG,
    o0, o1, u0: part.rect.u0, u1: part.rect.u1, z0: part.rect.z0, z1: part.rect.z1,
    outer: rectPts(part.rect), holes: part.holes.map(h => h.poly),
  }));
}
/** صندوق بارز (كرنيش، عتبة، مظلة، كاسر، غطاء). لا يقطع فتحات: يُفحص ألا يتقاطع مع فتحة. */
function block(pc, { id, name, mat, u0, u1, z0, z1, o0, o1, role = 'projection' }) {
  const r = { u0, u1, z0, z1 };
  for (const o of pc.openings) if (overlaps(r, o)) throw new Error(`صندوق ${id} يتقاطع مع الفتحة ${o.id}`);
  return [{ id: `${pc.id}/${id}`, name, role, piece: pc.i, C: pc.C, mat, cls: MATERIALS[mat].cls, plan: false, tag: TAG, o0, o1, u0, u1, z0, z1, outer: rectPts(r), holes: [] }];
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

// ---------------------------------------------------------------- البدائل الثلاثة
/**
 * كل بديل: توزيع الكسوات، تكوين المدخل، البروزات والتجاويف (لا شرفات ولا فتحات جديدة)، المظلات والكاسرات، وتفاصيل النوافذ.
 * كل بروز ليس في المخطط موسوم TAG بحكم الدالة cladding/block/frame.
 */
export const VARIANTS = Object.freeze({
  A: { id: 'A', ar: 'حجر جيري أبيض كامل', summary: 'الكسوة كلها حجر أبيض؛ إطارات داكنة داخل تجويف عميق؛ كرنيش حجري بارز؛ مدخل بإطار حجري بارز؛ بلا مظلة.' },
  B: { id: 'B', ar: 'رندر بيج بقاعدة حجرية ومظلة معدنية', summary: 'رندر على الجدار؛ قاعدة حجرية بيج وحواف حجرية رأسية؛ مظلة معدنية فوق كل باب؛ كاسرات أفقية فوق النوافذ؛ باب زجاجي بإطار داكن.' },
  C: { id: 'C', ar: 'رندر فاتح مع فاسيا خشب مشابه وحجر على المدخل', summary: 'رندر على الجدار؛ قاعدة حجرية بيج؛ لوح خشب مشابه أعلى الدور الأرضي؛ عتبات حجرية؛ قبّة حجرية فوق المدخل بارزة؛ إطارات خشبية مشابهة في تجويف عميق؛ باب خشبي مشابه.' },
});

function buildA(pc, geo) {
  const L = [wallBase(pc, 'limestoneWhite')];
  L.push(...cladding(pc, { id: 'cladding', name: 'كسوة حجر جيري أبيض (35 مم)', mat: 'limestoneWhite', zone: fullZone(pc), o0: pc.t / 2, o1: pc.t / 2 + .035 }));
  for (const o of pc.openings) if (isEntry(o)) {
    L.push(...block(pc, { id: o.id + '.jambL', name: 'حجر المدخل يسار', mat: 'limestoneWhite', u0: o.u0 - .14, u1: o.u0, z0: pc.z0, z1: o.z1 + .14, o0: pc.t / 2, o1: pc.t / 2 + .14 }));
    L.push(...block(pc, { id: o.id + '.jambR', name: 'حجر المدخل يمين', mat: 'limestoneWhite', u0: o.u1, u1: o.u1 + .14, z0: pc.z0, z1: o.z1 + .14, o0: pc.t / 2, o1: pc.t / 2 + .14 }));
    L.push(...block(pc, { id: o.id + '.lintel', name: 'عتبة علوية للمدخل', mat: 'limestoneWhite', u0: o.u0 - .14, u1: o.u1 + .14, z0: o.z1, z1: o.z1 + .14, o0: pc.t / 2, o1: pc.t / 2 + .14 }));
  }
  if (pc.top) L.push(...block(pc, { id: 'cornice', name: 'كرنيش حجري بارز عند حافة السطح', mat: 'limestoneWhite', u0: pc.u0 - .08, u1: pc.u1 + .08, z0: pc.z1 - .06, z1: pc.z1 + .1, o0: pc.t / 2, o1: pc.t / 2 + .14 }));
  if (pc.top && pc.hasParapet) L.push(...block(pc, { id: 'coping', name: 'غطاء حجري للدروة', mat: 'limestoneWhite', u0: pc.u0 - .03, u1: pc.u1 + .03, z0: pc.zTop, z1: pc.zTop + .06, o0: -pc.t / 2 - .02, o1: pc.t / 2 + .05 }));
  const fw = .06;
  for (const o of pc.openings) {
    if (isWin(o)) {
      L.push(...block(pc, { id: o.id + '.sill', name: 'عتبة حجرية للنافذة ' + o.id, mat: 'limestoneWhite', u0: o.u0 - .05, u1: o.u1 + .05, z0: o.z0 - .05, z1: o.z0, o0: pc.t / 2, o1: pc.t / 2 + .07 }));
      L.push(frame(pc, o, { mat: 'aluminium', fw, o0: pc.t / 2 - .12, o1: pc.t / 2 - .02 }));
      L.push(infill(pc, o, { mat: 'glass', fw, o0: pc.t / 2 - .115, o1: pc.t / 2 - .105, role: 'glazing' }));
    } else {
      L.push(frame(pc, o, { mat: 'aluminium', fw: .04, o0: pc.t / 2 - .06, o1: pc.t / 2 - .02 }));
      L.push(infill(pc, o, { mat: 'aluminium', fw: .04, o0: pc.t / 2 - .06, o1: pc.t / 2 - .02, role: 'door' }));
    }
  }
  return L;
}
function buildB(pc, geo) {
  const L = [wallBase(pc, 'render')];
  L.push(...cladding(pc, { id: 'plinth', name: 'قاعدة حجر جيري بيج (45 سم)', mat: 'limestoneBeige', zone: plinthZone(pc, geo.plinth), o0: pc.t / 2, o1: pc.t / 2 + .03 }));
  L.push(...cladding(pc, { id: 'quoinL', name: 'حافة حجرية رأسية يسار (35 سم)', mat: 'limestoneBeige', zone: { u0: pc.u0, u1: pc.u0 + .35, z0: geo.plinth, z1: pc.zTop }, o0: pc.t / 2, o1: pc.t / 2 + .03 }));
  L.push(...cladding(pc, { id: 'quoinR', name: 'حافة حجرية رأسية يمين (35 سم)', mat: 'limestoneBeige', zone: { u0: pc.u1 - .35, u1: pc.u1, z0: geo.plinth, z1: pc.zTop }, o0: pc.t / 2, o1: pc.t / 2 + .03 }));
  for (const o of pc.openings) {
    if (isEntry(o)) {
      L.push(...block(pc, { id: o.id + '.canopy', name: 'مظلة معدنية فوق المدخل ' + o.id, mat: 'aluminium', u0: o.u0 - .5, u1: o.u1 + .5, z0: o.z1 + .08, z1: o.z1 + .16, o0: pc.t / 2, o1: pc.t / 2 + .9 }));
    }
    if (isWin(o)) {
      L.push(...block(pc, { id: o.id + '.louver', name: 'كاسر أفقي فوق النافذة ' + o.id, mat: 'aluminium', u0: o.u0 - .05, u1: o.u1 + .05, z0: o.z1 + .12, z1: o.z1 + .16, o0: pc.t / 2, o1: pc.t / 2 + .45 }));
      L.push(frame(pc, o, { mat: 'aluminium', fw: .05, o0: pc.t / 2 - .03, o1: pc.t / 2 + .01 }));
      L.push(infill(pc, o, { mat: 'glass', fw: .05, o0: pc.t / 2 - .02, o1: pc.t / 2 - .01, role: 'glazing' }));
    } else {
      L.push(frame(pc, o, { mat: 'aluminium', fw: .05, o0: pc.t / 2 - .03, o1: pc.t / 2 + .01 }));
      L.push(infill(pc, o, { mat: 'glass', fw: .05, o0: pc.t / 2 - .02, o1: pc.t / 2 - .01, role: 'door' }));
    }
  }
  if (pc.top && pc.hasParapet) L.push(...block(pc, { id: 'coping', name: 'غطاء معدني رفيع للدروة', mat: 'aluminium', u0: pc.u0, u1: pc.u1, z0: pc.zTop, z1: pc.zTop + .05, o0: -pc.t / 2, o1: pc.t / 2 + .03 }));
  return L;
}
function buildC(pc, geo) {
  const L = [wallBase(pc, 'render')];
  L.push(...cladding(pc, { id: 'plinth', name: 'قاعدة حجر جيري بيج (45 سم)', mat: 'limestoneBeige', zone: plinthZone(pc, geo.plinth), o0: pc.t / 2, o1: pc.t / 2 + .03 }));
  if (pc.top) L.push(...cladding(pc, { id: 'fascia', name: 'لوح خشب مشابه أعلى الدور الأرضي', mat: 'timberLook', zone: { u0: pc.u0, u1: pc.u1, z0: pc.z1 - .55, z1: pc.z1 }, o0: pc.t / 2, o1: pc.t / 2 + .03 }));
  for (const o of pc.openings) {
    if (isEntry(o)) {
      L.push(...block(pc, { id: o.id + '.hood', name: 'قبّة حجرية بارزة فوق المدخل ' + o.id, mat: 'limestoneBeige', u0: o.u0 - .25, u1: o.u1 + .25, z0: o.z1 + .12, z1: o.z1 + .2, o0: pc.t / 2, o1: pc.t / 2 + .25 }));
      L.push(...block(pc, { id: o.id + '.jambL', name: 'عتبة حجرية للمدخل يسار', mat: 'limestoneBeige', u0: o.u0 - .1, u1: o.u0, z0: pc.z0 + geo.plinth, z1: o.z1, o0: pc.t / 2, o1: pc.t / 2 + .05 }));
      L.push(...block(pc, { id: o.id + '.jambR', name: 'عتبة حجرية للمدخل يمين', mat: 'limestoneBeige', u0: o.u1, u1: o.u1 + .1, z0: pc.z0 + geo.plinth, z1: o.z1, o0: pc.t / 2, o1: pc.t / 2 + .05 }));
      L.push(frame(pc, o, { mat: 'timberLook', fw: .08, o0: pc.t / 2 - .14, o1: pc.t / 2 - .04 }));
      L.push(infill(pc, o, { mat: 'timberLook', fw: .08, o0: pc.t / 2 - .13, o1: pc.t / 2 - .12, role: 'door' }));
    } else {
      L.push(...block(pc, { id: o.id + '.sill', name: 'عتبة حجرية بيج للنافذة ' + o.id, mat: 'limestoneBeige', u0: o.u0 - .04, u1: o.u1 + .04, z0: o.z0 - .04, z1: o.z0, o0: pc.t / 2, o1: pc.t / 2 + .05 }));
      L.push(frame(pc, o, { mat: 'timberLook', fw: .08, o0: pc.t / 2 - .14, o1: pc.t / 2 - .04 }));
      L.push(infill(pc, o, { mat: 'glass', fw: .08, o0: pc.t / 2 - .13, o1: pc.t / 2 - .12, role: 'glazing' }));
    }
  }
  if (pc.top && pc.hasParapet) L.push(...block(pc, { id: 'coping', name: 'غطاء حجر بيج للدروة', mat: 'limestoneBeige', u0: pc.u0 - .03, u1: pc.u1 + .03, z0: pc.zTop, z1: pc.zTop + .06, o0: -pc.t / 2 - .02, o1: pc.t / 2 + .04 }));
  return L;
}
const BUILD = { A: buildA, B: buildB, C: buildC };

/** يبني طبقات بديل واحد على كل الأجزاء الأمامية. يرجع الطبقات مرتبة من الأبعد إلى الأقرب (للرسم الرسام). */
export function buildVariant(doc, id) {
  if (!BUILD[id]) throw new Error('بديل غير معروف: ' + id);
  const F = frontPieces(doc), geo = { plinth: F.plinth };
  const layers = F.pieces.flatMap(pc => BUILD[id](pc, geo));
  layers.sort((a, b) => a.C - b.C); // الأبعد أولًا: C = -العمق، والأقرب إلى الشارع له C أكبر
  return { variant: VARIANTS[id], F, layers };
}
export default { TAG, MATERIALS, VARIANTS, buildVariant, frontPieces, zoneParts, subtractRect, openingPoly };
