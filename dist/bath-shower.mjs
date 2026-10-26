// (الجولة 21 — 02c، قرار المالك 2026-10-26 ثالثًا) بوابة إلزامية: «الحمام الكامل» بلا تجهيز استحمام صالح للاستخدام لا يُقبل؛ و«دورة المياه»
// (مرحاض ومغسلة) لا تتطلب دشًا فتُستثنى. الحمام الكامل = غرفة bath اسمها يبدأ بـ«حمام» (هكذا يسمّي المولّد حمامات الأجنحة: «حمام الرئيسية» و«حمام
// غرفة N»)، أما «دورة مياه…» فمرحاض ومغسلة. (طلب العميل الصريح لدورة مياه بدش غير ممثل في البرنامج الحالي — حدّ معلن.)
// الصلاحية بفحص هندسي لا بوجود الرمز: (1) الدش (أو الحوض) داخل الوجوه الداخلية للغرفة، (2) لا يتقاطع مع مرحاض ولا مغسلة ولا قطعة أخرى،
// (3) مسقط وصول حر أمام جانب مفتوح (0.7 م) داخل الغرفة بلا قطع ثابتة، (4) لا يعيق فتح باب الحمام (swingBlockers) ولا مقدمة الباب،
// (5) العرض الصافي للغرفة يبلغ حد حمام الاستحمام (MIN_CLEAR_WIDTH.bath في plan-review.mjs)، (6) التهوية: نافذة على الخارج أو «ميكانيكية»
// ملاحظة BATH_NO_WINDOW القائمة (لا تمنع، ومجرى الشفط غير ممثل ⇒ غير متحقق). السباكة والتصريف غير ممثلين ⇒ «لم يُتحقق». لا اعتماد صحي.
import { analyzeDoc } from './draw/digest.mjs';
import { pointInPolygon } from './draw/geom.mjs';
import { fixtureRect, swingBlockers, penetration } from './draw/review.mjs';
import { applyCommand } from './draw/doc.mjs';
import { MIN_CLEAR_WIDTH, FIXED_FIXTURES } from './plan-review.mjs';

export const SHOWER_RULE = Object.freeze({ access: 0.7, source: 'قيم تصميمية افتراضية للميزان (مسقط الوصول 0.7 م) وحد العرض الصافي المرشح في plan-review.mjs — غير متحققة من كود صحي' });
export const isFullBath = room => room.type === 'bath' && /^حمام(\s|$)/.test(room.name || '');
const STANDING = new Set(['shower', 'bathtub']);
const inNet = (poly, net) => poly.every(p => pointInPolygon(p, net, 1e-6));
const bbox = poly => ({ x0: Math.min(...poly.map(p => p.x)), x1: Math.max(...poly.map(p => p.x)), y0: Math.min(...poly.map(p => p.y)), y1: Math.max(...poly.map(p => p.y)) });
const rectPoly = b => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];

/** منطقة فتح باب الحمام (عرض الباب × عمقه من جهة الحمام) — الصيغة نفسها لـWC_DOOR_CLASH في circulation-proof.mjs، فلا يوضع دش تُسقطه بوابة الحركة. */
function doorZones(lv, room) {
  const zs = [];
  for (const op of lv.openings.filter(o => o.door && ['door', 'door2'].includes(o.kind))) for (const sd of op.sides.filter(x => x.room.id === room.id)) {
    const inward = { x: -sd.outward.x, y: -sd.outward.y }, hw = op.w / 2 - .02, t = (op.wall?.t ?? .2) / 2 + .02, depth = op.w, P = (k, d) => ({ x: op.p.x + op.u.x * k + inward.x * d, y: op.p.y + op.u.y * k + inward.y * d });
    zs.push({ op: op.id, poly: [P(-hw, t), P(hw, t), P(hw, t + depth), P(-hw, t + depth)] });
  }
  return zs;
}
/** صلاحية تجهيز الاستحمام في حمام كامل. يعيد { ok, reasons[], details }. */
export function showerUsability(doc, lv, room, model) {
  const reasons = [], fxAll = (doc.fixtures || []).filter(f => f.level === lv.level.id && room.net && pointInPolygon({ x: f.x, y: f.y }, room.net, 1e-6));
  const wet = fxAll.filter(f => STANDING.has(f.kind));
  const details = { fixtures: fxAll.map(f => f.kind), shower: wet.map(f => f.id) };
  if (!wet.length) return { ok: false, reasons: ['لا دش ولا حوض استحمام في الحمام'], details };
  let best = null;
  for (const sh of wet) {
    const why = [], poly = fixtureRect(sh);
    if (!inNet(poly, room.net)) why.push('الدش يخرج عن الوجوه الداخلية للغرفة');
    for (const o of fxAll) if (o.id !== sh.id && o.h >= .1 && o.kind !== 'rug' && penetration(poly.map(p => p), fixtureRect(o, -0.01)) > 0.01) why.push(`الدش يتقاطع مع ${o.kind}`);
    for (const z of doorZones(lv, room)) if (penetration(poly, z.poly) > 1e-6) why.push(`الدش داخل منطقة فتح باب الحمام ${z.op}`);
    // مسقط الوصول: أحد جوانب الدش المفتوحة (0.7 م) داخل الغرفة بلا قطع ثابتة
    const B = bbox(poly), A = SHOWER_RULE.access, sides = [{ x0: B.x0, x1: B.x1, y0: B.y0 - A, y1: B.y0 }, { x0: B.x0, x1: B.x1, y0: B.y1, y1: B.y1 + A }, { x0: B.x0 - A, x1: B.x0, y0: B.y0, y1: B.y1 }, { x0: B.x1, x1: B.x1 + A, y0: B.y0, y1: B.y1 }];
    const solids = fxAll.filter(o => o.id !== sh.id && o.h >= .1 && o.kind !== 'rug').map(o => fixtureRect(o, 0.02));
    const freeSide = sides.some(S => { const rp = rectPoly(S); return inNet(rp, room.net) && !solids.some(sp => penetration(rp, sp) > 0.005); });
    if (!freeSide) why.push(`لا مسقط وصول حر ${A} م أمام الدش داخل الغرفة`);
    if (!why.length) return { ok: true, reasons: [], details: { ...details, shower: [sh.id] } };
    if (!best) best = why;
  }
  reasons.push(...best);
  return { ok: false, reasons, details };
}
/** فحص حمام كامل كاملًا (دش + باب + عرض + تهوية). */
export function evaluateFullBath(doc, lv, room, model) {
  const u = showerUsability(doc, lv, room, model), reasons = [...u.reasons];
  const w = Math.min(room.rect.w, room.rect.l), minW = MIN_CLEAR_WIDTH.bath.min;
  if (u.ok && w < minW - 1e-6) reasons.push(`العرض الصافي ${Math.round(w * 100) / 100} م أقل من حد حمام الاستحمام ${minW} م`);
  const doors = lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === room.id));
  let doorClear = doors.length > 0;
  for (const op of doors) { const bl = swingBlockers(model, lv, op); if (bl.some(b => b.kind !== 'fixture' || FIXED_FIXTURES.includes((doc.fixtures || []).find(f => f.id === b.id)?.kind))) doorClear = false; }
  if (u.ok && !doorClear) reasons.push('فتح باب الحمام يصطدم بجهاز ثابت أو جدار');
  const window = lv.openings.some(op => op.window && op.sides.some(s => s.room.id === room.id && s.other === 'outside'));
  return { room: room.name, ok: u.ok && reasons.length === 0, reasons, shower: u.details.shower, widthM: Math.round(w * 100) / 100, minWidthM: minW, doorClear, ventilation: window ? 'window' : 'mechanical (مجرى الشفط غير ممثل: غير متحقق)', plumbing: 'unverified' };
}
/** كل الحمامات الكاملة في المستند. لا يعدّل. */
export function evaluateFullBaths(doc, model = analyzeDoc(doc)) {
  const out = []; for (const lv of model.levels) for (const r of lv.rooms) if (isFullBath(r)) out.push(evaluateFullBath(doc, lv, r, model));
  return out;
}
/** بوابة: الحمامات الكاملة المرفوضة (تمنع القبول). */
export function showerGate(doc, model = analyzeDoc(doc)) { const baths = evaluateFullBaths(doc, model); return { baths, failing: baths.filter(b => !b.ok), pass: baths.every(b => b.ok) }; }

/** يضيف دشًا في الحمامات الكاملة الناقصة إن وُجد موضع صالح (يعدّل doc في مكانه). يعيد ملاحظات المواضع وما تعذّر. */
export function completeShowers(doc) {
  const notes = [], failed = []; let model = analyzeDoc(doc);
  for (const lv of model.levels) for (const room of lv.rooms.filter(isFullBath)) {
    if (evaluateFullBath(doc, lv, room, model).ok) continue;
    if (showerUsability(doc, lv, room, model).ok) continue; // الدش صالح؛ عيب آخر (عرض/باب) لا يُعالج بإضافة دش
    // دش مرسوم غير صالح (يخرج عن الوجوه الداخلية أو يتقاطع): يُزال ويُعاد وضعه؛ فإن تعذّر الموضع يُستعاد كما كان
    const before = JSON.stringify(doc.fixtures), bad = (doc.fixtures || []).filter(f => f.level === lv.level.id && STANDING.has(f.kind) && room.net && pointInPolygon({ x: f.x, y: f.y }, room.net, 1e-6));
    if (bad.length) { doc.fixtures = doc.fixtures.filter(f => !bad.some(b => b.id === f.id)); model = analyzeDoc(doc); }
    const lvR = model.levels.find(l => l.level.id === lv.level.id), roomR = lvR.rooms.find(r => r.id === room.id);
    const net = roomR.net, B = bbox(net), d = 0.9, cands = [];
    for (let x = B.x0 + d / 2; x <= B.x1 - d / 2 + 1e-9; x += 0.05) for (let y = B.y0 + d / 2; y <= B.y1 - d / 2 + 1e-9; y += 0.05) {
      const f = { x, y, rot: 0, w: d, d, h: 2 }, poly = fixtureRect(f); if (!inNet(poly, net)) continue;
      // ملاصقة الجدران: عدد الأضلاع الملامسة (أقل من 2 سم عن حد الصافي)
      const pb = bbox(poly), touch = [Math.abs(pb.x0 - B.x0) < .02, Math.abs(pb.x1 - B.x1) < .02, Math.abs(pb.y0 - B.y0) < .02, Math.abs(pb.y1 - B.y1) < .02].filter(Boolean).length;
      cands.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, touch });
    }
    cands.sort((a, b) => b.touch - a.touch);
    let placed = false;
    for (const c of cands.slice(0, 400)) {
      const snap = JSON.stringify(doc.fixtures), n = doc.fixtures.length;
      try { Object.assign(doc, applyCommand(doc, { type: 'add-fixture', level: lv.level.id, kind: 'shower', x: c.x, y: c.y, rot: 0 }).doc); } catch { continue; }
      const m2 = analyzeDoc(doc), lv2 = m2.levels.find(l => l.level.id === lv.level.id), r2 = lv2.rooms.find(r => r.id === room.id);
      if (r2 && evaluateFullBath(doc, lv2, r2, m2).ok) { notes.push(`أُضيف دش في «${room.name}» (${Math.round(c.x * 100) / 100}، ${Math.round(c.y * 100) / 100}) بعد فحص التقاطع ومسقط الوصول وفتح الباب والعرض الصافي (قيمة تصميمية افتراضية للميزان).`); placed = true; model = m2; break; }
      doc.fixtures = JSON.parse(snap); if (doc.fixtures.length !== n) doc.fixtures.length = n;
    }
    if (!placed) { if (bad.length) { doc.fixtures = JSON.parse(before); model = analyzeDoc(doc); } failed.push({ room: room.name, why: 'لا موضع دش صالح (تقاطع/وصول/فتح الباب/العرض الصافي)' }); }
    else if (bad.length) notes[notes.length - 1] += ' (استُبدل دش مرسوم غير صالح)';
  }
  return { notes, failed };
}
export default { SHOWER_RULE, isFullBath, showerUsability, evaluateFullBath, evaluateFullBaths, showerGate, completeShowers };
