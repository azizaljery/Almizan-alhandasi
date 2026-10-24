// (الجولة الثامنة عشرة) النص الذي يراه العميل لا يحمل لغة داخلية: معرّفات الملفات والبدائل (alt-2، edit-alt2-opt-full)،
// ومعرّفات حالات الاختبار (C8)، وأسماء الأنماط الداخلية (centralhall:ch1)، وعبارات الاختبار («محاكاة اختبار القبول»).
// المراجع المستقل r17 وجد أسماء ملفات و«محاكاة اختبار القبول» في صور الفرق المعروضة للعميل.
// وحدة نقية بلا DOM: تُستعمل في الاختبارات وفي رسم صور الأدلة.

/** أنماط اللغة الداخلية الممنوعة في نص العميل. */
export const INTERNAL_PATTERNS = Object.freeze([
  [/\b(?:edit-)?alt-?\d+\b/i, 'معرّف بديل/ملف (alt-N)'],
  [/\bopt-(?:full|zone)\b/i, 'معرّف خيار داخلي (opt-full/opt-zone)'],
  [/\.(?:json|png|mjs)\b/i, 'اسم ملف'],
  [/\bC\d{1,2}\b/, 'معرّف حالة اختبار (C8)'],
  [/محاكاة|اختبار القبول|هذا الدليل|حالة الاختبار/, 'لغة الاختبار الداخلية'],
  [/\b[a-z]{3,}:[a-z]{1,4}\d[a-z0-9]*\b/i, 'معرّف نمط داخلي (centralhall:ch1)'],
  [/\b(?:GUEST_DINING|HALL_SMALL|HALL_THROUGH|MAJLIS_[A-Z_]+|WINDOW_PARKING|PARKING_[A-Z]+)\b/, 'رمز قياس داخلي'],
]);
/** ما في النص من لغة داخلية: [{ match, why }] (فارغ = آمن للعميل). */
export function internalLeaks(text) {
  const s = String(text ?? ''), out = [];
  for (const [re, why] of INTERNAL_PATTERNS) { const m = re.exec(s); if (m) out.push({ match: m[0], why }); }
  return out;
}
export const isClientSafe = text => internalLeaks(text).length === 0;
/** اسم البديل للعميل: «التصميم 2» (لا alt-2). */
export const designName = i => `التصميم ${i}`;

export default { INTERNAL_PATTERNS, internalLeaks, isClientSafe, designName };
