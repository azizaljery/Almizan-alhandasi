// (الجولة 21 — مقترح، مكيَّف من kit-r21/src/results.mjs verifyLogicalContradiction) شهادات الاستحالة ومدققها المستقل.
// قاعدة المالك: لا «PROVEN_INFEASIBLE» إلا بشهادة يتحقق منها مدقق مستقل يعيد الحساب من الطلب والأرض نفسيهما (لا يثق بما قاله المنتج)،
// ومدقق الحدود (المساحة والعرض والمقاس) مختبر على كل حالة معروف لها حل فلا يصنفها مستحيلة (tests/stage2-r21-proposal.test.mjs §03).
// أنواع الشهادات:
//  AREA_LOWER_BOUND   — مجموع أصغر المقاسات المعتمدة في الميزان لفراغات البرنامج (بلا جدران ولا حركة) أكبر من المتاح للبناء. «مستحيل» هنا نسبةً
//                       إلى حدود الميزان الدنيا المعلنة (MIN_NET) لا مطلقًا — ويُقال ذلك للعميل.
//  DIMENSION_BOUND    — مقاس صريح (صافٍ + جداران داخليان على الأقل) أطول من بُعد البناء المقابل.
//  WIDTH_BOUND        — العرض القابل للبناء أضيق من أدنى عرض لمجلس بجلستين (المجلس ≥ 4.2 م في الاتجاهين).
//  LOGICAL_CONTRADICTION — بندان إلزاميان من العميل لا يجتمعان منطقيًا (الفراغ نفسه أمامًا وخلفًا، قريب وبعيد للزوج نفسه، دور أرضي وعلوي، دور
//                       واحد مع غرف في العلوي). يُتحقق من وجود البندين في الطلب بنصهما ومعناهما.
// وحدة نقية بلا أرقام حالات.
import { programV2, siteOf, landWithSite } from './villa-layout-v2.mjs';

/** أصغر المقاسات الصافية المعتمدة في الميزان (قيم تصميمية للميزان، غير نظامية) — الجدول نفسه يُستعمل في المنتج والمدقق ويُتحقق منه في الشهادة. */
export const MIN_NET = Object.freeze({ suite: 12, master: 16, bath: 3.5, majlis: 24, women: 20, dining: 12, kitchen: 10, maid: 7.8, maidBath: 2.5, driver: 7, wc: 2.5, office: 8, prayer: 6, family: 12, store: 1.5, hall: 4.2 * 4.2, foyer: 2.4 * 2.4 });
export const MIN_INNER_WALL = .12, MIN_MAJLIS_W = 4.2;
/** أدنى صافٍ لكتلة من البرنامج (منفصل عن أي تقدير للمساحة المعتادة). */
export function minNetOf(b) {
  if (b.fixedArea) return b.dimNet ? b.dimNet.s * b.dimNet.l : b.area * .9;
  if (b.kind === 'suite') return (b.master ? MIN_NET.master : MIN_NET.suite) + (b.bath ? MIN_NET.bath : 0);
  if (b.kind === 'majlis') return b.men || b.primary ? MIN_NET.majlis : MIN_NET.women;
  if (b.kind === 'maid') return MIN_NET.maid + (b.bath ? MIN_NET.maidBath : 0);
  return Math.min(b.area, MIN_NET[b.kind] ?? b.area * .8);
}
const availableOf = (land, requirements) => {
  const site = siteOf(landWithSite(land, requirements));
  const plotA = (Number(land.width) || 0) * (Number(land.length) || 0) || (site.W + 3) * (site.D + 4.5);
  const cover = plotA * (site.plot?.coverage ?? .75), box = site.W * site.D;
  return { site, available: Math.min(cover, box), cover, box };
};
const UPPER = new Set(['suite', 'family']);

/** المنتج: شهادة المساحة إن ثبتت، وإلا null. floors: 1 أو 2 (الدور الأكبر). */
export function areaCertificate({ land = {}, counts = {}, requirements = {}, floors = 1 } = {}) {
  const P = programV2(counts, requirements), { available } = availableOf(land, requirements);
  const items = P.blocks.map(b => ({ id: b.id, kind: b.kind, upper: floors === 2 && UPPER.has(b.kind) && !b.elderly, minNet: Math.round(minNetOf(b) * 100) / 100 }));
  const fixed = MIN_NET.hall + MIN_NET.foyer, stair = 3.6 * 2.6;
  const g = items.filter(i => !i.upper).reduce((a, i) => a + i.minNet, 0) + fixed + (floors === 2 ? stair : 0);
  const u = floors === 2 ? items.filter(i => i.upper).reduce((a, i) => a + i.minNet, 0) + MIN_NET.hall + stair : 0;
  const lowerBound = Math.max(g, u);
  return lowerBound > available + 1e-6 ? { type: 'AREA_LOWER_BOUND', floors, lowerBound: Math.round(lowerBound * 100) / 100, available: Math.round(available * 100) / 100, items, table: MIN_NET } : null;
}
/** المنتج: شهادة المقاس الصريح لكل مقاس أطول من بُعد البناء. */
export function dimensionCertificates({ land = {}, requirements = {} } = {}) {
  const { site } = availableOf(land, requirements), out = [];
  for (const [key, dm] of Object.entries(requirements.dims || {})) {
    if (!dm || !(dm.w > 0 && dm.l > 0)) continue;
    const s = Math.min(dm.w, dm.l), l = Math.max(dm.w, dm.l), tol = Number.isFinite(dm.tol) ? dm.tol : .05, bS = Math.min(site.W, site.D), bL = Math.max(site.W, site.D);
    if (s - tol + MIN_INNER_WALL > bS + 1e-6 || l - tol + MIN_INNER_WALL > bL + 1e-6) out.push({ type: 'DIMENSION_BOUND', key, s, l, tol, wall: MIN_INNER_WALL, buildable: { W: site.W, D: site.D } });
  }
  return out;
}
export function widthCertificate({ land = {}, requirements = {}, counts = {} } = {}) {
  const P = programV2(counts, requirements); if (!P.men && !P.blocks.some(b => b.kind === 'majlis')) return null;
  const { site } = availableOf(land, requirements);
  return Math.min(site.W, site.D) < MIN_MAJLIS_W + MIN_INNER_WALL - 1e-6 ? { type: 'WIDTH_BOUND', minWidth: MIN_MAJLIS_W + MIN_INNER_WALL, W: site.W, D: site.D } : null;
}
const OPP = { front: 'back', back: 'front' };
const close = r => r.kind === 'near' || r.kind === 'adjacent', far = r => r.kind === 'far' || r.kind === 'apart';
const samePair = (a, b) => (a.a === b.a && a.b === b.b) || (a.a === b.b && a.b === b.a);
/** المنتج: شهادة تعارض منطقي بين بندين من بنود العميل، أو null. */
export function logicalCertificate(type, idA, idB) { return idA && idB ? { type: 'LOGICAL_CONTRADICTION', conflict: type, a: idA, b: idB } : null; }

/**
 * المدقق المستقل: يعيد الحساب من الطلب والأرض (لا يقرأ الأرقام من الشهادة إلا ليقارنها). يعيد { valid, why }.
 */
export function verifyCertificate(cert, { land = {}, counts = {}, requirements = {} } = {}) {
  try {
    if (!cert || typeof cert !== 'object') return { valid: false, why: 'no-certificate' };
    if (cert.type === 'AREA_LOWER_BOUND') {
      if (JSON.stringify(cert.table) !== JSON.stringify(MIN_NET)) return { valid: false, why: 'table-mismatch' };
      const re = areaCertificate({ land, counts, requirements, floors: cert.floors || 1 });
      if (!re) return { valid: false, why: 'recomputed-bound-fits' };
      return Math.abs(re.lowerBound - cert.lowerBound) < .05 && Math.abs(re.available - cert.available) < .05 ? { valid: true } : { valid: false, why: 'numbers-mismatch' };
    }
    if (cert.type === 'DIMENSION_BOUND') {
      const re = dimensionCertificates({ land, requirements }).find(c => c.key === cert.key);
      return re && re.s === cert.s && re.l === cert.l ? { valid: true } : { valid: false, why: 'dimension-fits' };
    }
    if (cert.type === 'WIDTH_BOUND') return widthCertificate({ land, requirements, counts }) ? { valid: true } : { valid: false, why: 'width-fits' };
    if (cert.type === 'LOGICAL_CONTRADICTION') {
      const R = requirements.rules || [], A = R.find(r => r.id === cert.a), B = R.find(r => r.id === cert.b);
      if (!A || !B || A === B) return { valid: false, why: 'rules-missing' };
      if ([A, B].some(r => r.level && r.level !== 'must')) return { valid: false, why: 'not-mandatory' };
      if (cert.conflict === 'place-opposite') return A.kind === 'place' && B.kind === 'place' && A.a === B.a && A.mode !== 'avoid' && B.mode !== 'avoid' && OPP[A.side] === B.side ? { valid: true } : { valid: false, why: 'not-opposite' };
      if (cert.conflict === 'relation-contradiction') return samePair(A, B) && ((close(A) && far(B)) || (far(A) && close(B))) && !A.negated && !B.negated ? { valid: true } : { valid: false, why: 'not-contradictory' };
      if (cert.conflict === 'floor-both') return A.kind === 'floor' && B.kind === 'floor' && A.a === B.a && A.floor !== B.floor ? { valid: true } : { valid: false, why: 'not-both-floors' };
      return { valid: false, why: 'unsupported-conflict-type' };
    }
    return { valid: false, why: 'unknown-type' };
  } catch (e) { return { valid: false, why: 'checker-error' }; }
}
export default { MIN_NET, minNetOf, areaCertificate, dimensionCertificates, widthCertificate, logicalCertificate, verifyCertificate };
