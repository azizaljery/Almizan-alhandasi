// الحسابات المدمجة في مؤشرات المخطط. الوحدات: m, m²، والنسب من 0 إلى 1.
const finite = x => { if (!Number.isFinite(x)) throw Error('قيمة هندسية غير صالحة.'); return x; };
const positive = x => { finite(x); if (x <= 0) throw Error('القيمة الهندسية يجب أن تكون موجبة.'); return x; };
export const rectangleArea = (length, width) => positive(length) * positive(width);
export const coverageRatio = (builtArea, plotArea) => Math.max(0, finite(builtArea)) / positive(plotArea);
export const occupancyDensity = (people, area) => Math.max(0, finite(people)) / positive(area);
export const slabAspectRatio = (length, width) => Math.max(positive(length), positive(width)) / Math.min(length, width);
export const drainageSlope = (drop, length) => finite(drop) / positive(length);
export function weightedScore(criteria) {
  if (!Array.isArray(criteria) || !criteria.length) return 0;
  const weight = criteria.reduce((s, c) => s + Math.max(0, finite(c.weight)), 0);
  return weight ? criteria.reduce((s, c) => s + Math.max(0, finite(c.weight)) * Math.max(0, Math.min(100, finite(c.value))), 0) / weight : 0;
}
