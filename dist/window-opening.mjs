// (الجولة 21 — 02c، قرار المالك 2026-10-26 على نافذة الممر o23) هندسة فتح النافذة وما تشغله ضلفتها أثناء الحركة.
// المستند لا يحدد تشغيل النافذة: openings تحمل kind ('window' | 'window2') ولا تحمل نوع التشغيل (ثابتة/منزلقة/مفصلية) ولا جهة الفتح (swing=null).
// لذلك يُعدّ تشغيلها «غير محدد» وتُفحص بأسوأ حالة معلنة: ضلفات مفصلية تنفتح إلى الخارج 90° مفصلاتها عند أي من طرفي كل ضلفة، بعرض ضلفة أقصى
// 0.9 م (قيمة تصميمية افتراضية للميزان — غير متحققة من مصنّع ولا كود). إن حُدّد في المستند op.o.operation = 'fixed' | 'sliding' | 'inward' سقط غلاف
// الخارج؛ ولا يُفترض شيء من غير نص. هذا فحص ثنائي الأبعاد لمسقط الضلفة، لا يحسب الشبك ولا الستائر ولا أيدي الفتح.
// «مطلوبة وظيفيًا»: functionOf() يفصل الإضاءة والتهوية والسلامة، ولا يمنح استثناءً من خلوص الساتر إلا بإثبات الثلاثة؛ السلامة (مخرج طوارئ/
// حريق) لا مصدر لها في الميزان فتبقى «غير متحقق»، فلا استثناء عام للممرات.
import { ROOM_TYPES } from './draw/catalog.mjs';

export const OPENING_DEFAULTS = Object.freeze({ leafMax: 0.9, margin: 0.1, source: 'قيمة تصميمية افتراضية للميزان — أقصى عرض ضلفة 0.9 م وهامش 0.1 م؛ غير متحققة من مصنّع أو كود' });
const hyp = Math.hypot;

/** الأثر الأرضي للنافذة: قطعة وجهها الخارجي، واتجاه الخارج، وأغلفة دوران الضلفات (أرباع أقراص). */
export function windowFootprint(op, side, D = OPENING_DEFAULTS) {
  const t0 = (op.wall?.t || .2) / 2, out = side.outward, u = { x: -out.y, y: out.x }, hw = op.w / 2;
  const origin = { x: op.p.x + out.x * t0 - u.x * hw, y: op.p.y + out.y * t0 - u.y * hw }; // بداية وجه النافذة الخارجي على المحور u
  const operation = op.o?.operation || 'unspecified';
  const leaves = Math.max(1, Math.ceil(op.w / D.leafMax - 1e-9)), lw = op.w / leaves;
  const swings = operation === 'unspecified' || operation === 'casement-out' || operation === 'outward';
  const quarter = [];
  if (swings) for (let i = 0; i < leaves; i++) quarter.push({ s0: i * lw, s1: (i + 1) * lw, r: lw });
  return { opening: op.id, kind: op.kind, operation, assumption: operation === 'unspecified' ? 'نوع التشغيل غير محدد في المستند: فُحصت أسوأ حالة (ضلفات مفصلية إلى الخارج 90°)' : `التشغيل المعلن في المستند: ${operation}`,
    origin, u, out, width: op.w, leaves, leafWidth: Math.round(lw * 1000) / 1000, quarter, margin: D.margin,
    face: { a: origin, b: { x: origin.x + u.x * op.w, y: origin.y + u.y * op.w } } };
}
/** إحداثيات نقطة بالنسبة للنافذة: s على امتداد الوجه، n بعدًا إلى الخارج. */
export const toLocal = (fp, p) => ({ s: (p.x - fp.origin.x) * fp.u.x + (p.y - fp.origin.y) * fp.u.y, n: (p.x - fp.origin.x) * fp.out.x + (p.y - fp.origin.y) * fp.out.y });
/** هل النقطة داخل الحيز الذي تشغله ضلفة (بأي مفصل ممكن) أثناء الفتح، مع الهامش؟ */
export function inSwing(fp, p) {
  const { s, n } = toLocal(fp, p), m = fp.margin;
  if (n < -m) return false;
  for (const q of fp.quarter) {
    if (s < q.s0 - m || s > q.s1 + m) continue;
    if (n <= q.r + m && (hyp(s - q.s0, n) <= q.r + m || hyp(s - q.s1, n) <= q.r + m)) return true;
  }
  return false;
}
/** أدنى مسافة بين قطعة (الساتر) ووجه النافذة؛ وهل تتعارض القطعة مع غلاف الضلفة. يعتمد أخذ عينات كل 2 سم. */
export function segmentVsWindow(fp, a, b) {
  const L = hyp(b.x - a.x, b.y - a.y), steps = Math.max(2, Math.ceil(L / 0.02));
  let dmin = Infinity, swing = false, worst = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, { s, n } = toLocal(fp, p);
    const ds = s < 0 ? -s : s > fp.width ? s - fp.width : 0, d = n >= 0 ? hyp(ds, n) : hyp(ds, n);
    if (d < dmin) dmin = d;
    if (!swing && inSwing(fp, p)) { swing = true; worst = { s: Math.round(s * 1000) / 1000, n: Math.round(n * 1000) / 1000 }; }
  }
  return { clearance: Math.round(dmin * 1000) / 1000, swingConflict: swing, at: worst };
}
/**
 * هل النافذة مطلوبة وظيفيًا؟ ثلاثة أبعاد منفصلة: light/ventilation من كتالوج الغرفة (windowRequired) أو كونها النافذة الوحيدة للغرفة؛ safety
 * (مخرج طوارئ/حريق) لا مصدر لها في الميزان ⇐ 'unverified' دائمًا. exemptFromClearance لا تصير true إلا إن أُثبتت الثلاثة: غير ممكن هنا.
 */
export function functionOf(op, side, lv) {
  const room = side.room, def = ROOM_TYPES[room.type] || {};
  const others = lv.openings.filter(o => o.window && o.id !== op.id && o.sides.some(s => s.room.id === room.id && s.other === 'outside'));
  const light = def.windowRequired ? 'required' : others.length ? 'not-required (للغرفة نوافذ أخرى)' : 'not-required-by-mizan (الغرفة وحيدة النافذة؛ لا بوابة في الميزان تطلبها)';
  const ventilation = def.windowRequired ? 'required' : (!others.length && /bath|wc|toilet|laundry/.test(room.type)) ? 'required' : light.startsWith('not-required') ? 'not-required-by-mizan' : 'not-required';
  const safety = 'unverified';
  return { room: room.name, roomType: room.type, light, ventilation, safety, exemptFromClearance: light.startsWith('not-required') && ventilation.startsWith('not-required') && safety === 'not-required' };
}
export default { OPENING_DEFAULTS, windowFootprint, toLocal, inSwing, segmentVsWindow, functionOf };
