// (الجولة الرابعة عشرة) صدق التعديل: هوية المخطط بالمناطق، ومطابقة البدائل المعروضة.
// شرط المالك: التعديل يبدأ من المخطط المعروض ويحفظ كل ما لم يُطلب تغييره (ومنه الحوش)؛ لا يُعاد أبدًا بديل سبق عرضه على أنه
// «نتيجة التعديل»؛ وإن لم يوجد حل موضعي يُقال ذلك بسببه الهندسي وتُعرض خيارات: إبقاء المخطط، أو إعادة توزيع منطقة واحدة مع
// بقاء بصمة المناطق الأخرى، أو رؤية البدائل التي تحقق الطلب. وحدة نقية بلا DOM.
import { analyzeDoc } from './draw/digest.mjs';
import { fnv } from './plan-fingerprint.mjs';
import { archSignatureV2, archDifferenceV2 } from './arch-difference.mjs';

export const PLAN_ZONES = Object.freeze({
  men: 'منطقة ضيافة الرجال (المجلس ومدخله ودورة مياهه)',
  women: 'منطقة النساء',
  sleep: 'منطقة النوم (الغرف وحماماتها وممرها)',
  family: 'منطقة العائلة (الصالة والطعام والمدخل والحوش)',
  service: 'منطقة الخدمة (المطبخ والخادمة والغسيل)',
});
/** منطقة الغرفة في المخطط (للبصمة بالمناطق). */
export function planZoneOf(r) {
  const n = r.name || '', t = r.type || '';
  if (/النساء/.test(n)) return 'women';
  if (/الرجال|مغاسل/.test(n) || (t === 'majlis' && !/النساء/.test(n))) return 'men';
  if (['bedroom', 'master'].includes(t) || /^حمام (?:غرفة|الرئيسية)|مشتركة|غرفة (?:ال)?ملابس|مدخل الجناح|ممر الغرف|ممر النوم|وصلة/.test(n)) return 'sleep';
  if (['kitchen', 'laundry', 'service', 'pantry'].includes(t) || /الخادمة|السائق|الغسيل|مخزن|الخدمة/.test(n)) return 'service';
  return 'family';
}
const q = v => Math.round(v / .05) * .05;
/** بصمة كل منطقة: أسماء غرفها وأنواعها ومضلعاتها (مقربة 5 سم) لكل دور. */
export function zoneFingerprints(doc) {
  const m = analyzeDoc(doc), Z = {};
  for (const lv of m.levels) for (const r of lv.rooms) {
    const z = planZoneOf(r); (Z[z] ||= []).push(`${lv.level.id}|${r.name}|${r.type}|${r.net.map(p => q(p.x).toFixed(2) + ',' + q(p.y).toFixed(2)).sort().join(';')}`);
  }
  const out = {};
  for (const [z, a] of Object.entries(Z)) out[z] = { hash: fnv(a.sort().join('\n')), rooms: a.length };
  return out;
}
/** المناطق التي تغيّرت بين مخططين (بصمة المنطقة) والتي بقيت حرفيًا. */
export function zoneDiff(before, after) {
  const A = zoneFingerprints(before), B = zoneFingerprints(after), keys = [...new Set([...Object.keys(A), ...Object.keys(B)])];
  const changed = keys.filter(k => A[k]?.hash !== B[k]?.hash), kept = keys.filter(k => A[k]?.hash === B[k]?.hash);
  return { changed, kept, changed_ar: changed.map(k => PLAN_ZONES[k] || k), kept_ar: kept.map(k => PLAN_ZONES[k] || k) };
}
/** بصمة الغرف كلها (لمطابقة بديل معروض حرفيًا). */
export const roomsHash = doc => fnv(Object.entries(zoneFingerprints(doc)).sort().map(([k, v]) => k + v.hash).join('|'));
/**
 * هل المخطط بديل سبق عرضه؟ مطابق حرفيًا (بصمة الغرف) أو التنظيم نفسه (المقياس الوظيفي v2 «ليس مختلفًا معماريًا»).
 * shown: [{ doc, index }]. يعيد { index, identical } أو null.
 */
export function matchShown(doc, shown = []) {
  const h = roomsHash(doc); let sig = null;
  for (const s of shown) {
    if (!s?.doc) continue;
    if (roomsHash(s.doc) === h) return { index: s.index, identical: true };
    try { sig ||= archSignatureV2(doc); const d = archDifferenceV2(sig, archSignatureV2(s.doc)); if (d.verdict === 'variant') return { index: s.index, identical: false, total: d.total }; } catch { /* لا مقارنة */ }
  }
  return null;
}
/**
 * من يشغل الثلث الخارجي من جهة في المبنى (الخلف/الأمام…) مجمّعًا بالمناطق — لشرح السبب الهندسي بلغة العميل:
 * «خلف البيت تشغله منطقة النوم («غرفة النوم الرئيسية»، «غرفة نوم 2»…)». side: back|front|e|w|n|s، entry: جهة المدخل.
 */
export function sideOccupants(doc, side, entry = 's') {
  const m = analyzeDoc(doc), G = m.levels[0]; if (!G) return null;
  const F = p => (entry === 's' ? { x: p.x, y: p.y } : entry === 'n' ? { x: -p.x, y: -p.y } : entry === 'e' ? { x: p.y, y: -p.x } : { x: -p.y, y: p.x });
  const rooms = G.rooms.filter(r => !['corridor'].includes(r.type) && r.area >= 3).map(r => ({ r, c: F(r.centroid) }));
  if (!rooms.length) return null;
  const ys = rooms.map(o => o.c.y), y0 = Math.min(...ys), y1 = Math.max(...ys), t = (y1 - y0) / 3;
  const sel = side === 'back' ? rooms.filter(o => o.c.y >= y1 - t) : side === 'front' ? rooms.filter(o => o.c.y <= y0 + t) : null;
  if (!sel?.length) return null;
  const by = {};
  for (const { r } of sel) (by[planZoneOf(r)] ||= []).push(r.name);
  return Object.entries(by).map(([z, names]) => ({ zone: z, zone_ar: PLAN_ZONES[z], rooms: [...new Set(names)] }));
}
export default { PLAN_ZONES, planZoneOf, zoneFingerprints, zoneDiff, roomsHash, matchShown };
