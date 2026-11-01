// وحدة صغيرة بلا اعتماديات (يستوردها render2d وdigest دون حلقة).
/**
 * (ملاحظات المعاينة 2026-10-31) أبعاد الغرفة موجّهة: الأفقي (س، شرق–غرب في المسقط) × الرأسي (ص، شمال–جنوب) من صندوق الصافي،
 * حين تكون الغرفة موازية للمحاور. rect.l × rect.w (الأطول × الأقصر) لا يقول أيهما الأفقي — فكان المرسم يكتب «w × l» وصفحة التصميم
 * «l × w» للغرفة نفسها (أطوال معكوسة). الغرفة المائلة: aligned=false ويُرجع إلى الأطول × الأقصر صراحة.
 */
export function roomSpan(room) {
  const net = room?.net || room?.space?.net, rect = room?.rect;
  if (!net?.length || !rect) return null;
  const xs = net.map(p => p.x), ys = net.map(p => p.y), x = Math.max(...xs) - Math.min(...xs), y = Math.max(...ys) - Math.min(...ys);
  const aligned = Math.abs(Math.sin(2 * (rect.angle || 0))) < 1e-3;
  return aligned ? { x, y, aligned } : { x: rect.l, y: rect.w, aligned };
}
