// «بديل آخر» = فكرة معمارية جديدة داخل الطراز نفسه (منطقة مختلفة من فضاء التصميم)، لا إعادة تلوين.
// السجل في ذاكرة الجلسة فقط (ذاكرة التصميم عبر الجلسات مؤجّلة).
import { viableRegions, regionDistance, regionId, familyOf, parseRegion, baseRegion } from './variation.mjs';
export const EXHAUSTED_MSG = 'لا يوجد حاليًا بديل مختلف بما يكفي ضمن هذا الطراز وقيود المبنى. يمكنك تجربة طراز آخر أو تعديل تفضيلات التصميم.';
export const MIN_DISTANCE = 2; // أقل عدد مقابض مختلفة ليُعدّ التصميم جديدًا (اللوحة/البذرة وحدها لا تُحسب)
const h32 = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const order = (arr, salt) => arr.map(r => [h32(regionId(r) + '|' + salt), r]).sort((a, b) => a[0] - b[0]).map(x => x[1]); // ترتيب عشوائي حتمي
/** سجل الجلسة: shown = المناطق المعروضة سابقًا لكل (طراز). */
export function createHistory() { return { shown: new Map(), step: new Map() }; }
export function markShown(hist, styleId, region) { const l = hist.shown.get(styleId) || []; if (!l.some(r => regionDistance(r, region) === 0)) l.push(region); hist.shown.set(styleId, l); }
const valid = (c, shown) => shown.every(s => regionDistance(c, s) >= MIN_DISTANCE);
function exhaustedFamilies(pool, shown) { const fams = [...new Set(pool.map(familyOf))]; return fams.filter(f => !pool.some(c => familyOf(c) === f && valid(c, shown))); }
/** يبحث عن بديل واحد: يستكشف 12 مرشحًا ثم حتى 36؛ لا يتجاوز ذلك. */
export function nextAlternative(doc, styleId, hist, { floors, limits } = {}) {
  const pool = viableRegions(doc, { floors, limits }), shown = hist.shown.get(styleId) || [];
  if (!pool.length) return { status: 'NO_VALID_CANDIDATE', region: null, exhaustedFamilies: [], message: EXHAUSTED_MSG };
  const step = hist.step.get(styleId) || 0, cands = order(pool, styleId + '#' + step);
  const seenFam = new Set(shown.map(familyOf));
  for (const limit of [12, 36]) {
    const batch = cands.slice(0, limit).filter(c => valid(c, shown));
    // الأفضلية لعائلة لم تُستكشف بعد
    const pick = batch.find(c => !seenFam.has(familyOf(c))) || batch[0];
    if (pick) { hist.step.set(styleId, step + 1); markShown(hist, styleId, pick); return { status: 'NEW_ALTERNATIVE', region: pick, exhaustedFamilies: exhaustedFamilies(pool, hist.shown.get(styleId)), message: '' }; }
  }
  // لم يُعثر ضمن 36؛ ابحث في كامل المجموعة الصغيرة (≤ مئات) ثم أعلن النفاد بصدق
  const any = cands.find(c => valid(c, shown));
  if (any) { hist.step.set(styleId, step + 1); markShown(hist, styleId, any); return { status: 'NEW_ALTERNATIVE', region: any, exhaustedFamilies: exhaustedFamilies(pool, hist.shown.get(styleId)), message: '' }; }
  return { status: 'DESIGN_SPACE_EXHAUSTED', region: null, exhaustedFamilies: exhaustedFamilies(pool, shown), message: EXHAUSTED_MSG };
}
/** يقترح حتى 3 بدائل متباعدة فيما بينها (0/1/2/3 بصدق) دون تسجيلها كمعروضة. */
export function proposeAlternatives(doc, styleId, hist, { floors, limits, max = 3 } = {}) {
  const pool = viableRegions(doc, { floors, limits }), shown = [...(hist.shown.get(styleId) || [])], out = [];
  for (const c of order(pool, styleId + '#propose').slice(0, 36)) { if (out.length >= Math.min(3, max)) break; if (valid(c, [...shown, ...out]) && !out.some(o => familyOf(o) === familyOf(c) && out.length < 2)) out.push(c); }
  for (const c of order(pool, styleId + '#propose2')) { if (out.length >= Math.min(3, max)) break; if (valid(c, [...shown, ...out])) out.push(c); }
  return out;
}
export { parseRegion, baseRegion, regionId };
