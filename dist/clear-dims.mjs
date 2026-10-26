// (الجولة 21 — 02c، قرار المالك 2026-10-26 «القياس عند أضيق موضع صالح للاستخدام») فحص الأبعاد الصافية بوابةً بعد التفصيل:
// مكيَّف من حزمة المالك docs/owner/kit-r21-02b-01/src/clear-dimensions.mjs على مستند المشروع الحقيقي، لا نسخة منها.
//
// مرجع الإحداثيات (مثبت من الشيفرة، لا افتراض):
//   - جدران المستند (doc.walls) محاور: كل جدار { a, b, t } خطه المركزي وسماكته t.
//   - فراغ كل غرفة في analyzeDoc (dist/draw/topology.mjs، الخطوة 6) = `insetPolygon(poly, t/2)` لكل ضلع بسماكة جداره الفعلي، أي
//     **الوجوه الداخلية المنتهية**، والجزر الداخلية (أعمدة/فتحات رأسية مرسومة جدرانًا مغلقة) `holes` بعد تكبيرها نصف سماكتها.
//   لذلك هذا الفحص يأخذ `net` و`holes` كما هما ولا يخصم نصف سماكة مرة ثانية. `clearSpanFromCentrelines` للمحاور فقط
//   (امتداد القطع في شجرة المولّد قبل الرسم) ولا يُستدعى على `net` أبدًا.
//
// الشرطان معًا (القرار): (أ) أبعاد الصندوق المحيط بالصافي ضمن السماحية، و(ب) مستطيل صافٍ قابل للاستخدام داخل المضلع (خارج الجزر)
// يحقق الطول والعرض المطلوبين ضمن السماحية — فتُرفض غرفة L ودرجة السماكة (حتى 6.5 سم = (0.25−0.12)/2) التي يمررها الصندوق وحده.
// التدوير مسموح فقط حين لا يُلزم الطلب باتجاه (allowRotation). هندسة غير متعامدة: الفحص لا يُطبَّق (`applicable: false`) — ليس استحالة.
// السماحيات سياسة تشغيل قابلة للضبط والتفسير (DIM_TOL أدناه، يعيد تصديره requirements.mjs) لا معيار هندسي ولا اشتراط نظامي.
// المصدر الواحد للسماحيات (كان في requirements.mjs؛ نُقل هنا بلا تغيير في القيم ليُستورد بلا حلقة استيراد، ويُعاد تصديره من هناك)
export const DIM_TOL = Object.freeze({ exact: .03, default: .05, approx: .3 });

const EPS = 1e-6;
const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;

/** سياسة السماحية: القيم من DIM_TOL (المصدر الواحد)، ويجوز تجاوزها بسياسة صريحة مُتحقق منها. */
export const TOLERANCE_POLICY = Object.freeze({
  values: DIM_TOL,
  source: 'سياسة تشغيل للميزان (قرار المالك 2026-10-26): «بالضبط» ±0.03 م، بلا وصف ±0.05 م، «تقريبًا» ±0.30 م — قابلة للضبط، ليست اشتراطًا نظاميًا',
});
export function toleranceFor(qualifier = 'default', policy = {}) {
  const q = qualifier === 'unspecified' ? 'default' : qualifier === 'approximate' ? 'approx' : qualifier;
  if (!(q in DIM_TOL)) throw Error('Unknown qualifier');
  const v = policy[q] ?? DIM_TOL[q];
  if (!Number.isFinite(v) || v < 0) throw Error('Invalid tolerance');
  return v;
}

/** ينظف حلقة: يزيل النقاط المكررة والمتتالية على استقامة واحدة (insetPolygon يُبقي نقطة الدرجة). */
export function cleanRing(ring) {
  let pts = (ring || []).filter(finite).map(p => ({ x: p.x, y: p.y }));
  for (let changed = true; changed && pts.length > 2;) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const dup = Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
      const col = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < EPS * 10;
      if (dup || col) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts;
}
/** كل ضلع أفقي أو رأسي (مضلع متعامد موازٍ للمحاور). */
export function isOrthogonal(ring) {
  return Array.isArray(ring) && ring.length >= 4 && ring.every(finite) && ring.every((p, i) => { const q = ring[(i + 1) % ring.length]; return (Math.abs(p.x - q.x) < EPS) !== (Math.abs(p.y - q.y) < EPS); });
}
function pointIn(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const uniq = a => [...new Set(a.map(v => Math.round(v / EPS) * EPS))].sort((x, y) => x - y);

/**
 * كل المستطيلات الصافية القصوى على شبكة إحداثيات المضلع والجزر (الخلايا بين خطوط الرؤوس): خلية حرة = داخل المضلع خارج كل جزيرة.
 * يعيد المستطيلات الحرة كلها (لا الأكبر مساحة وحده)؛ الحجم صغير (غرف بعشرات الرؤوس على الأكثر).
 */
export function clearRectangles(outer, holes = []) {
  const rings = [outer, ...holes], xs = uniq(rings.flatMap(r => r.map(p => p.x))), ys = uniq(rings.flatMap(r => r.map(p => p.y)));
  const nx = xs.length - 1, ny = ys.length - 1;
  const ps = Array.from({ length: nx + 1 }, () => new Float64Array(ny + 1));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
    const blocked = !(pointIn(c, outer) && !holes.some(h => pointIn(c, h)));
    ps[i + 1][j + 1] = (blocked ? 1 : 0) + ps[i][j + 1] + ps[i + 1][j] - ps[i][j];
  }
  const out = [];
  for (let i = 0; i < nx; i++) for (let k = i + 1; k <= nx; k++) for (let j = 0; j < ny; j++) for (let l = j + 1; l <= ny; l++) {
    if (ps[k][l] - ps[i][l] - ps[k][j] + ps[i][j] > 0) break; // أي توسيع أعلى يشمل الخلية المحجوبة نفسها
    out.push({ x0: xs[i], y0: ys[j], x1: xs[k], y1: ys[l], w: xs[k] - xs[i], h: ys[l] - ys[j] });
  }
  return out;
}

/**
 * القياس الصافي لغرفة مقابل مقاس مطلوب.
 *  room: { net: [{x,y}…] الوجوه الداخلية، holes?: [[{x,y}…]] }؛ want: { s, l } (أو { w, l }) بالمتر؛ tol بالمتر.
 *  allowRotation: الطلب بلا اتجاه (المحلل الحالي لا يقرأ اتجاهًا) ⇐ true؛ وإن أُلزم: want.w على محور x وwant.l على y.
 * يعيد { applicable, ok, envelope{s,l}, clear{s,l,x0,y0,x1,y1} (أفضل مستطيل صافٍ للمقاس = عند أضيق موضع صالح), envelopeOK, clearOK,
 *        deviation{ envelope:{s,l}, clear:{s,l} } (المرسوم − المطلوب، بإشارة), narrowing (فرق الصندوق عن المستطيل الصافي في كل ضلع), reason_ar? }.
 */
export function measureClearDims(room, want, tol, { allowRotation = true } = {}) {
  const w0 = want.s ?? want.w, ws = Math.min(w0, want.l), wl = Math.max(w0, want.l);
  if (!(ws > 0) || !(wl > 0) || !Number.isFinite(tol) || tol < 0) throw Error('Invalid target dimensions');
  const outer = cleanRing(room?.net), holes = (room?.holes || []).map(cleanRing).filter(h => h.length >= 3);
  const xs = outer.map(p => p.x), ys = outer.map(p => p.y);
  const env = outer.length ? { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : { w: 0, h: 0 };
  const envelope = { s: r3(Math.min(env.w, env.h)), l: r3(Math.max(env.w, env.h)) };
  if (!isOrthogonal(outer) || !holes.every(isOrthogonal)) {
    return { applicable: false, ok: null, envelope, clear: null, reason_ar: 'حدود الغرفة غير متعامدة (ضلع مائل أو منحنٍ)؛ فحص المستطيل الصافي لا ينطبق عليها — يُراجع يدويًا، وليس دليل استحالة.' };
  }
  // الاتجاهات الممكنة للمقاس: [عرض على x، طول على y]
  // بلا تدوير: الاتجاه كما أُلزم (want.w على x وwant.l على y)؛ ومع التدوير: الاتجاهان
  const orient = allowRotation ? [{ ax: ws, ay: wl, rotated: false }, ...(Math.abs(ws - wl) > EPS ? [{ ax: wl, ay: ws, rotated: true }] : [])]
    : [{ ax: want.w ?? want.s, ay: want.l, rotated: false }];
  const rects = clearRectangles(outer, holes);
  if (!rects.length) return { applicable: true, ok: false, envelope, clear: null, envelopeOK: false, clearOK: false, reason_ar: 'لا مستطيل صافٍ داخل حدود الغرفة.' };
  // لكل اتجاه: أفضل مستطيل يعظّم أسوأ نسبة (ضلعه ÷ المطلوب) — القياس عند أضيق موضع للضلع الأضعف — والصندوق على المحورين نفسيهما
  const evals = orient.map(o => {
    let best = null;
    for (const r of rects) { const fit = Math.min(r.w / o.ax, r.h / o.ay); if (!best || fit > best.fit + 1e-9 || (Math.abs(fit - best.fit) <= 1e-9 && r.w * r.h > best.r.w * best.r.h)) best = { fit, r }; }
    const sx = o.ax <= o.ay; // الضلع المطلوب الأقصر على x؟
    const cS = sx ? best.r.w : best.r.h, cL = sx ? best.r.h : best.r.w, eS = sx ? env.w : env.h, eL = sx ? env.h : env.w;
    const envelopeOK = Math.abs(eS - ws) <= tol + EPS && Math.abs(eL - wl) <= tol + EPS, clearOK = cS >= ws - tol - EPS && cL >= wl - tol - EPS;
    return { o, r: best.r, fit: best.fit, cS, cL, eS, eL, envelopeOK, clearOK, ok: envelopeOK && clearOK };
  }).sort((a, b) => (b.ok - a.ok) || (b.envelopeOK - a.envelopeOK) || (b.fit - a.fit));
  const { o, r, cS, cL, eS, eL, envelopeOK, clearOK } = evals[0];
  const clear = { s: r3(cS), l: r3(cL), x0: r3(r.x0), y0: r3(r.y0), x1: r3(r.x1), y1: r3(r.y1), rotated: o.rotated };
  return {
    applicable: true, ok: envelopeOK && clearOK, envelope: { s: r3(eS), l: r3(eL) }, clear, envelopeOK, clearOK, tol, want: { s: ws, l: wl },
    deviation: { envelope: { s: r3(eS - ws), l: r3(eL - wl) }, clear: { s: r3(cS - ws), l: r3(cL - wl) } },
    narrowing: { s: r3(eS - cS), l: r3(eL - cL) }, rects: rects.length,
  };
}

/** نص قصير للعميل عن الانحراف الفعلي (يُعرض مع البديل: «يرى العميل أي انحراف فعلي عن المقاس الصريح»). */
export function deviationAr(m) {
  if (!m?.applicable || !m.clear) return '';
  const parts = [];
  for (const [k, ar] of [['s', 'العرض'], ['l', 'الطول']]) {
    const d = m.deviation.clear[k], e = m.deviation.envelope[k];
    if (Math.abs(d) > .005 || Math.abs(e) > .005) parts.push(`${ar} الصافي ${r2(m.clear[k])} م${Math.abs(e - d) > .005 ? ` (وأوسع موضع ${r2(m.envelope[k])} م)` : ''} من ${m.want[k]} م`);
  }
  return parts.join('، ');
}

/** للمحاور فقط (امتداد القطع في شجرة المولّد): الصافي بين الوجهين = المسافة بين المحورين − نصفا سماكتي الجدارين. */
export function clearSpanFromCentrelines(span, wallA, wallB) {
  if (![span, wallA, wallB].every(v => Number.isFinite(v) && v >= 0)) throw Error('Invalid centreline span');
  return span - wallA / 2 - wallB / 2;
}

export default { measureClearDims, clearRectangles, isOrthogonal, cleanRing, toleranceFor, TOLERANCE_POLICY, deviationAr, clearSpanFromCentrelines };
