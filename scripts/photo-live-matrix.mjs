// مصفوفة الفحص الحي للصورة المعمارية الاحترافية: الطرازات الخمسة × (نهار/ذهبي/ليل) × (دور/دورين) — بلا استدعاء أي خدمة.
// المصفوفة الكاملة 5×3×2 = 30 صورة؛ المعتمد «تصميم جزئي متوازن»: لكل طراز 3 صور (كل إضاءة مرة واحدة، وكلا عدد الأدوار حاضر)،
// ولكل خلية (إضاءة × أدوار) طرازان على الأقل — 15 صورة بالمستوى القياسي + صورة سادسة عشرة بالمستوى الممتاز لأصعب حالة (رواشين الحجاز).
// كل صف له لقطة مدخلة مصيَّرة من محرك الواجهة نفسه (tests/fixtures/photo-matrix/<key>.jpg)، ولقطات الليل مصيَّرة بوضع الليل.
export const MATRIX_STYLES = Object.freeze(['N', 'H', 'S', 'C', 'M']); // نجدي، حجازي، سلماني، كلاسيكي، معاصر فاتح
export const STYLE_AR = Object.freeze({ N: 'نجدي', H: 'حجازي', S: 'سلماني', C: 'كلاسيكي', M: 'معاصر', J: 'معاصر بالحجر' });
export const LIGHT_AR = Object.freeze({ day: 'نهار', golden: 'ساعة ذهبية', sunset: 'غروب', night: 'ليل' });
export const MAX_IMAGES = 16;
const R = (style, lighting, floors, tier = 'standard') => Object.freeze({ style, lighting, floors, tier });
export const MATRIX_ROWS = Object.freeze([
  R('N', 'day', 1), R('N', 'golden', 2), R('N', 'night', 1),
  R('H', 'day', 2), R('H', 'golden', 1), R('H', 'night', 2),
  R('S', 'day', 1), R('S', 'golden', 2), R('S', 'night', 2),
  R('C', 'day', 2), R('C', 'golden', 1), R('C', 'night', 1),
  R('M', 'day', 1), R('M', 'golden', 2), R('M', 'night', 2),
  R('H', 'golden', 1, 'premium'),
]);
/** مفتاح اللقطة المدخلة للصف: نهارًا وذهبيًا تُستعمل لقطة النهار، وليلًا لقطة الليل. */
export const shotKey = r => `${r.style}-f${r.floors}-${r.lighting === 'night' ? 'night' : 'day'}`;
export const shotKeys = (rows = MATRIX_ROWS) => [...new Set(rows.map(shotKey))];
export const rowName = (r, i = 0) => `m${String(i + 1).padStart(2, '0')}-${r.style}-f${r.floors}-${r.lighting}-${r.tier}`;
/** تقدير عدد الصور حسب المستوى (لتقدير التكلفة). */
export const countByTier = (rows = MATRIX_ROWS) => rows.reduce((o, r) => (o[r.tier] = (o[r.tier] || 0) + 1, o), {});
/** تغطية المصفوفة: لكل طراز الإضاءات والأدوار، ولكل خلية عدد الطرز. */
export function coverage(rows = MATRIX_ROWS) {
  const perStyle = {}, cells = {};
  for (const r of rows) {
    (perStyle[r.style] ||= { lightings: new Set(), floors: new Set(), n: 0 }); const p = perStyle[r.style]; p.lightings.add(r.lighting); p.floors.add(r.floors); p.n++;
    const k = `${r.lighting}/${r.floors}`; if (r.tier === 'standard') (cells[k] ||= new Set()).add(r.style);
  }
  return { perStyle, cells: Object.fromEntries(Object.entries(cells).map(([k, s]) => [k, s.size])) };
}
/** صيغة VARIANTS الدنيا للملف .github/photo-live-check.conf: matrix = المصفوفة المعتمدة كلها. */
export const MATRIX_TOKEN = 'matrix';
/** يحلل ملف إعداد KEY=VALUE إلى كائن (أسطر # تعليقات). */
export function parseConf(text) {
  const o = {}; for (const line of String(text).split('\n')) { const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !line.trim().startsWith('#')) o[m[1]] = m[2]; } return o;
}
/** يحوّل VARIANTS=matrix أو قائمة style:lighting:floors[:tier] مفصولة بفواصل إلى صفوف؛ يرمي إن زادت عن MAX_IMAGES أو كانت قيمة غير معروفة. */
export function parseRows(spec) {
  const s = String(spec || '').trim(); if (!s || s === MATRIX_TOKEN) return [...MATRIX_ROWS];
  const rows = s.split(',').map(x => x.trim()).filter(Boolean).map(x => {
    const [style, lighting, floors, tier = 'standard'] = x.split(':');
    if (!MATRIX_STYLES.includes(style) || !Object.hasOwn(LIGHT_AR, lighting) || ![1, 2].includes(+floors) || !['standard', 'premium'].includes(tier)) throw new Error('صف غير صالح: ' + x);
    return R(style, lighting, +floors, tier);
  });
  if (rows.length > MAX_IMAGES) throw new Error(`أكثر من ${MAX_IMAGES} صورة غير مسموح (حماية الرصيد)`);
  return rows;
}
