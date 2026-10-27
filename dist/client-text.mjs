// (الجولة الثامنة عشرة) النص الذي يراه العميل لا يحمل لغة داخلية: معرّفات الملفات والبدائل (alt-2، edit-alt2-opt-full)،
// ومعرّفات حالات الاختبار (C8)، وأسماء الأنماط الداخلية (centralhall:ch1)، وعبارات الاختبار («محاكاة اختبار القبول»).
// المراجع المستقل r17 وجد أسماء ملفات و«محاكاة اختبار القبول» في صور الفرق المعروضة للعميل.
// وحدة نقية بلا DOM: تُستعمل في الاختبارات وفي رسم صور الأدلة.
import { toClientAr, clientLint } from './client-language.mjs';

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

/**
 * (الجولة العشرون، توجيه المالك سابعًا؛ المراجعة العمياء r19: C10 بديل واحد من خمسة، وH3/H4 بلا مخطط — ولا صورة تقول للعميل ذلك)
 * إشعار العميل حين يقل المعروض عن المطلوب أو لا يُنتج مخطط: العدد صريحًا، والسبب، وما يمكن تغييره. نص عربي بلا لغة داخلية.
 * { requested, shown, shortfall_ar, hidden:[{reasons_ar}], report_ar } → { title_ar, lines_ar[] } أو null إن عُرض العدد كاملًا.
 */
export function shortfallNotice({ requested = 1, shown = 0, shortfall_ar = null, hidden = [], report_ar = null } = {}) {
  if (shown >= requested && !report_ar) return null;
  const clean = t => toClientAr(String(t || '').replace(/\(قرار المالك\)/g, '').replace(/المرشحون المبنيون من أنماط تنظيمية مختلفة (\d+)، اجتاز البوابات منهم (\d+)/, (_, a, b) => `جرّبتُ ${a} ${+a >= 3 && +a <= 10 ? 'تنظيمات مختلفة' : 'تنظيمًا مختلفًا'}، اجتاز الفحص منها ${b}`)
    .replace(/بوابات الجودة والسلامة/g, 'فحوص الجودة والسلامة').replace(/المراجعة المعمارية المستقلة \([A-Z_،, ]+\)/g, 'المراجعة المعمارية').replace(/\s+/g, ' ').replace(/\s+([.،؛])/g, '$1').trim());
  if (!shown) {
    // (01b، قرار المالك: الحالات الثلاث منفصلة) بديل مكتمل حُجب لمخالفة إلزامية ≠ لا بديل مكتمل؛ وكلاهما «لا يثبت أن طلبك مستحيل» ما لم يثبت تعارض.
    // سطر «عُرض N من M» من المولّد لا يُنقل حين لا يُعرض شيء (كان يقول «عُرض 1 من 4» والمعروض صفر)
    const closing = 'لم أعرض مخططًا يخالف طلبك أو يفتقد شرطًا أساسيًا. عدّل أحد البنود أعلاه وسأعيد البحث.';
    if (hidden?.length && !report_ar) {
      const why = clean(shortfall_ar).replace(/^عُرض \d+ من \d+ مطلوبة؛ ?/, '');
      return { title_ar: 'لم أعرض مخططًا صالحًا لطلبك', lines_ar: [`وصلتُ إلى ${hidden.length === 1 ? 'تصميم مكتمل' : hidden.length + ' تصاميم مكتملة'} لكنه يخالف شرطًا أساسيًا فلم أعرضه: ${[...new Set(hidden.flatMap(h => h.reasons_ar || []))].slice(0, 2).map(clean).join('؛ ')}.`,
        why ? 'ما جرّبته: ' + why : null, 'هذا لا يثبت أن طلبك مستحيل؛ قد يوجد تنظيم صالح لم يصل إليه البحث.', closing].filter(Boolean) };
    }
    const lines = [...new Set(String(report_ar || shortfall_ar || 'لم يتسع أي تنظيم سليم لهذا الطلب على هذه الأرض.').split('\n').map(clean).filter(Boolean))].filter(l => !closing.startsWith(l));
    if (!lines.some(l => /مستحيل|لا يعني أن|لا يثبت/.test(l)) && !/ثبت|تعارض/.test(report_ar || '')) lines.push('هذا لا يثبت أن طلبك مستحيل؛ قد يوجد تنظيم صالح لم يصل إليه البحث.');
    return { title_ar: 'لم أُعدّ مخططًا لطلبك على هذه الأرض', lines_ar: [...lines, closing] };
  }
  const why = clean(shortfall_ar).replace(/^عُرض \d+ من \d+ مطلوبة؛ ?/, '');
  return { title_ar: `عُرض ${shown} من ${requested} ${requested === 1 ? 'تصميم' : 'تصاميم'} طلبتها`,
    lines_ar: [`أعرض لك ${shown === 1 ? 'تصميمًا واحدًا' : shown === 2 ? 'تصميمين' : shown + ' تصاميم'} فقط من ${requested} طلبتها.`, why ? 'السبب: ' + why : null,
      hidden?.length ? `لم أعرض ${hidden.length} ${hidden.length === 1 ? 'تصميمًا' : 'تصاميم'} لأن فيها مخالفة لشرط أساسي: ${[...new Set(hidden.flatMap(h => h.reasons_ar || []))].slice(0, 2).map(clean).join('؛ ')}` : null,
      'لم أُكمل العدد بنسخ مكررة أو معكوسة أو بتصاميم تخالف شرطًا من طلبك. يمكنك طلب تصميم آخر بعد تعديل بند، أو العمل على المعروض في المرسم.'].filter(Boolean) };
}
export default { INTERNAL_PATTERNS, internalLeaks, isClientSafe, designName, shortfallNotice };
