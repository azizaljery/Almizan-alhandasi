// (الجولة 21 — 02c، قرار المالك 2026-10-26 ثالثًا) عمق شريط حمام الجناح: نطاقات بحث أولية لا شروط. مكيَّف من حزمة المالك
// docs/owner/kit-r21-02b-01/src/bath-band.mjs على المستند: نجاح الحمام لا يُقاس بعمقه وحده بل بفاحصات المشروع الموجودة —
//   الأجهزة تتسع (مرحاض ومغسلة مرسومان داخل الوجوه الداخلية للحمام، والدش/الحوض إن رُسم)، وفتح الباب (swingBlockers في dist/draw/review.mjs:
//   لا جدار ولا باب ولا قطعة سباكة مثبتة في مسار فتح باب الحمام)، والعرض الصافي (MIN_CLEAR_WIDTH في plan-review.mjs: حمام 1.4 م، دورة مياه
//   1.0 م — قيمة مرشحة «يُراجع» غير متحققة نظاميًا)، والتهوية (نافذة على الخارج، وإلا «تهوية ميكانيكية» ملاحظة BATH_NO_WINDOW)؛ ومسار السباكة لا
//   يمثله المستند ⇐ «لم يُتحقق» لا «متحقق». لا شيء هنا اعتماد صحي أو إنشائي.
import { analyzeDoc } from './draw/digest.mjs';
import { pointInPolygon } from './draw/geom.mjs';
import { swingBlockers } from './draw/review.mjs';
import { MIN_CLEAR_WIDTH, FIXED_FIXTURES } from './plan-review.mjs';

/** نطاقات البحث (= SUITE_TD_RANGE/SUITE_T_RANGE في villa-layout-v2.mjs لغرف الأبناء؛ الرئيسية أوسع هناك: 2.2–3.2 و1.9–2.8). */
export const BATH_DEPTH_PREFERENCES = Object.freeze({ deep: { min: 1.95, max: 2.9 }, side: { min: 1.5, max: 2.4 }, source: 'تفضيل بحث للميزان (قرار المالك 2026-10-26) — ليس مقاسًا نظاميًا للحمام' });

/** (الحزمة) تقييم عمق مع وظائف معلومة: المفضّل نطاقًا لا يكفي، والقبول المبدئي بالوظائف وطلب العميل. */
export function evaluateBath({ type, depth, fixturesFit = false, doorClearance = false, ventilation = false, clientRange = null }) {
  if (!(type in BATH_DEPTH_PREFERENCES) || type === 'source' || !Number.isFinite(depth) || depth <= 0) throw Error('Invalid bath');
  const { min, max } = BATH_DEPTH_PREFERENCES[type];
  const preferred = depth >= min && depth <= max, clientOK = !clientRange || (depth >= clientRange.min && depth <= clientRange.max);
  return { preferred, clientOK, functional: fixturesFit && doorClearance && ventilation, preliminaryAccept: clientOK && fixturesFit && doorClearance && ventilation, disclaimer: 'تحقق من الاشتراطات المنطبقة ومن مراجعة متخصصة' };
}

/**
 * حمامات المستند الملحقة بالأجنحة (حمام الرئيسية/حمام غرفة …): لكل منها قياسات المشروع الفعلية.
 * يعيد [{ name, w, l, fixtures:{wc,basin,shower}, fixturesFit, doorClearance, minWidthOk, ventilation:'window'|'mechanical', plumbing:'unverified', preliminaryAccept }]. (نطاق العمق تفضيل بحث في المولّد؛ لا يدخل القبول.)
 */
export function evaluateSuiteBaths(doc, model = analyzeDoc(doc)) {
  const out = [];
  for (const lv of model.levels) for (const r of lv.rooms) {
    if (!/^حمام (الرئيسية|غرفة)/.test(r.name || '')) continue;
    const fx = (doc.fixtures || []).filter(f => f.level === lv.level.id && r.net && pointInPolygon({ x: f.x, y: f.y }, r.net, 1e-6));
    const has = k => fx.some(f => f.kind === k);
    const w = Math.min(r.rect.w, r.rect.l), l = Math.max(r.rect.w, r.rect.l);
    const doors = lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === r.id));
    let doorClearance = doors.length > 0;
    for (const op of doors) { const bl = swingBlockers(model, lv, op); if (bl.some(b => b.kind !== 'fixture' || FIXED_FIXTURES.includes((doc.fixtures || []).find(f => f.id === b.id)?.kind))) doorClearance = false; }
    const win = lv.openings.some(op => op.window && op.sides.some(s => s.room.id === r.id && s.other === 'outside'));
    const minWidthOk = w >= MIN_CLEAR_WIDTH.bath.min - 1e-6;
    // حمام الجناح وظيفته الاستحمام: مرحاض ومغسلة ودش أو حوض استحمام داخل وجوهه (التوزيع الاحتياطي في المولّد قد يُسقط الدش حين يصطدم بمنطقة الباب)
    const fixturesFit = has('wc') && has('basin') && (has('shower') || has('bathtub'));
    out.push({ name: r.name, w: Math.round(w * 100) / 100, l: Math.round(l * 100) / 100, fixtures: { wc: has('wc'), basin: has('basin'), shower: has('shower') || has('bathtub') }, fixturesFit, doorClearance, minWidthOk,
      ventilation: win ? 'window' : 'mechanical', plumbing: 'unverified', preliminaryAccept: fixturesFit && doorClearance && minWidthOk });
  }
  return out;
}
export default { BATH_DEPTH_PREFERENCES, evaluateBath, evaluateSuiteBaths };
