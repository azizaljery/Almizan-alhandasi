// (الجولة 21 — مقترح 07، مكيَّف من kit-r21/src/diversity.mjs) التنوع قبل الهندسة، ومحوّل المعيار المجمّد r19.
// السبب الجذري (docs/research/v3-diagnosis-r21.md، C10): الأشجار التي تصل إلى حل الأبعاد تُختار بالتفضيل ثم بعد جاكارد للتجاور (≥ 0.15) فقط،
// فتصل تنظيمات متقاربة وظيفيًا (المجلس والصالة والخدمة والنوم في الأحزمة نفسها) — من 12 مرشحًا في حوض C10 خمسة سليمة ولا زوج منها «مختلف».
// القاعدتان:
//  1) diversifyTopologies (كما في الحزمة): أول ظهور لكل بصمة وظيفية قبل أي تكرار — فرز أولي فقط، لا يحكم على الاختلاف.
//  2) r19Different: محوّل لا يغيّر المعيار — true فقط إن حكم sameOrDifferent المجمّد (dist/arch-criterion.mjs) «مختلف معماريًا»
//     (بعدان جوهريان على الأقل). لا يُعدَّل dist/arch-criterion.mjs ولا عتباته ولا وثيقته.
// وحدة نقية بلا أرقام حالات.
import { ARCH_CRITERION_R19, sameOrDifferent } from './arch-criterion.mjs';

/** أول ظهور لكل بصمة بالترتيب المعطى (الأفضل أولًا)، حتى limit. (kit diversifyTopologies) */
export function diversifyTopologies(topologies, limit, fingerprint) {
  const seen = new Set(), result = [];
  for (const item of topologies) {
    const key = fingerprint(item);
    if (seen.has(key)) continue;
    seen.add(key); result.push(item);
    if (result.length === limit) break;
  }
  return result;
}

/** المحوّل: حكم المعيار المجمّد على توقيعين/مستندين → true فقط عند «مختلف معماريًا». */
export const r19Different = (a, b) => sameOrDifferent(a, b).different === true;
/** المحوّل نفسه على نتيجة archDifferenceV2 محسوبة سلفًا (بلا إعادة حساب): القاعدة والعتبات من ARCH_CRITERION_R19 نفسه. */
export function r19DifferentOf(d) {
  if (!d) return false;
  const C = ARCH_CRITERION_R19, n = C.dimensions.filter(k => d[k] >= C.thresholds[k]).length;
  return n >= C.distinctMinSubstantive;
}

/**
 * بصمة وظيفية لتوزيع شبكي من المحرك الثالث (L = { R, nc, nr }) — تقريب قبل الهندسة لأبعاد المعيار: النطاقات (حزام العمق أمام/وسط/خلف
 * لمجلس الرجال والصالة والخدمة والنوم، وهل يأخذ العرض كله) والعلاقات (المجلس↔الطعام، الصالة↔النوم، المطبخ↔الطعام). مستقلة عن الانعكاس.
 */
export function layoutFingerprint(L) {
  const { R, nr, nc } = L;
  const adj = (a, b) => {
    if (!a || !b) return false;
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return (ox > 0 && (a.y1 === b.y0 || b.y1 === a.y0)) || (oy > 0 && (a.x1 === b.x0 || b.x1 === a.x0));
  };
  const band = r => (!r ? '-' : (r.y0 === 0 ? 'f' : '') + (r.y1 === nr ? 'b' : '') || 'm') + (r && r.x1 - r.x0 === nc ? 'W' : '');
  const sleep = Object.keys(R).filter(k => /^S\d+$/.test(k)).map(k => R[k]);
  const sBand = sleep.map(band).sort().join('+') || '-';
  const anyAdj = (a, list) => list.some(b => adj(a, b));
  return [band(R.M), band(R.H), band(R.KS), sBand, adj(R.M, R.DN) ? 'MD' : 'm.d', anyAdj(R.H, sleep) ? 'HS' : 'h.s', adj(R.KS, R.DN) ? 'KD' : 'k.d'].join('|');
}
export default { diversifyTopologies, r19Different, r19DifferentOf, layoutFingerprint };
