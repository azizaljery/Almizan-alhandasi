// (الجولة العشرون — توجيه المالك r20، ثالثًا وسابعًا) كشف الاستحالة والتعارض قبل التوليد.
// لا يُنتج مخطط خاطئ ولا نتيجة فارغة بلا تفسير: إن كان الطلب مستحيلًا على هذه الأرض (البرنامج أكبر من المساحة القابلة للبناء بعد الارتدادات
// ونسبة البناء، أو مقاس صريح أطول من الأرض، أو بندان متعارضان) يُعاد تقرير عربي: ما الذي تعارض، وما الخيارات، وما الذي يُغيَّر في الطلب.
// الأرقام: نسبة البناء 75٪ والارتداد الجانبي 1.5 م اشتراطان نظاميان (المستوى أ في data/regulations-sa.json)؛ معامل الجدران والحركة (1.15) وأدنى
// العروض قيم تقديرية للميزان (غير نظامية) — تُذكر كذلك. الحكم «مستحيل» يُطلق فقط حين يتجاوز المطلوبُ المتاحَ بلا شك؛ ما دون ذلك «تنبيه».
import { programV2, siteOf, landWithSite } from './villa-layout-v2.mjs';
import { SUBJECTS } from './rules.mjs';
import { detectConflicts } from './requirements.mjs';
import { MIN_NET, minNetOf, areaCertificate, dimensionCertificates, widthCertificate, logicalCertificate } from './certificates.mjs';
export { MIN_NET };
const SUBJECT_AR = Object.fromEntries(SUBJECTS.map(s => [s.id, s.ar]));

export const FEAS_LIMITS = Object.freeze({ grossFactor: 1.15, warnFactor: .92, minMajlisW: 4.2, minFoyerW: 2.4, wall: .25, tier: 'تقدير الميزان (غير نظامي)' });
const r1 = v => Math.round(v * 10) / 10;
const sum = a => a.reduce((s, v) => s + v, 0);
const AR_DIM = { majlis: 'المجلس', kitchen: 'المطبخ', dining: 'الطعام', master: 'غرفة النوم الرئيسية', bedroom: 'غرفة النوم', hall: 'الصالة' };

/**
 * analyzeFeasibility({ land, counts, requirements }) → { feasible, hard:[{id, ar}], warnings:[{id, ar}], options_ar:[...], numbers, report_ar }
 * hard: تعارض مؤكد يمنع التوليد. warnings: ما قد يقلل البدائل أو يحتاج قرار العميل (يُذكر ولا يمنع).
 */
// (الجولة 21 — مقترح) الحدود الدنيا وشهاداتها ومدققها المستقل في certificates.mjs (الجدول نفسه للمنتج والمدقق)
/** أنواع تعارض بنود العميل المنطقية: لا يوجد مخطط يحققها معًا (دليل منطقي)، فلا يُرسم حتى يختار العميل. */
export const LOGICAL_CONFLICTS = Object.freeze(['place-opposite', 'relation-contradiction', 'floor-both']); // ما له شهادة يتحقق منها المدقق؛ وسائر أنواع التعارض أسئلة للعميل لا استحالة
export function analyzeFeasibility({ land = {}, counts = {}, requirements = {}, provisional = false, logicalHard = false } = {}) {
  const hard = [], warn = [], options = new Set();
  let site, P;
  try { site = siteOf(landWithSite(land, requirements)); P = programV2(counts, requirements); }
  catch (e) { return { feasible: false, hard: [{ id: 'INPUT', ar: 'بيانات الأرض أو البرنامج غير صالحة: ' + (e.message || e) }], warnings: [], options_ar: ['راجع أبعاد الأرض واتجاه الشارع وعدد الغرف.'], numbers: null, report_ar: 'تعذّر قراءة الطلب: ' + (e.message || e) }; }
  const floors = Number(land.floors) >= 2 || requirements?.prefs?.floors === 2 ? 2 : 1;
  const plotA = (Number(land.width) || 0) * (Number(land.length) || 0) || (site.W + 3) * (site.D + 4.5);
  const coverA = plotA * (site.plot?.coverage ?? .75), boxA = site.W * site.D, availA = Math.min(coverA, boxA);
  const net = sum(P.blocks.map(b => b.area)) + P.hallArea + 8.5;
  const upperKinds = new Set(['suite', 'family']);
  const upNet = floors === 2 ? sum(P.blocks.filter(b => upperKinds.has(b.kind) && !b.elderly).map(b => b.area)) + 22 + 17 : 0, gNet = net - upNet + (floors === 2 ? 17 : 0);
  const gross = (floors === 2 ? Math.max(gNet, upNet) : net) * FEAS_LIMITS.grossFactor;
  // (الجولة 21) الحد الأدنى المثبت: أصغر المقاسات المعتمدة بلا جدران ولا حركة — دليل استحالة إن زاد على المتاح
  const lowAll = P.blocks.map(b => ({ b, a: minNetOf(b) })), lowSum = a => sum(a.map(x => x.a));
  const lowNet = lowSum(lowAll) + MIN_NET.hall + MIN_NET.foyer;
  const lowUp = floors === 2 ? lowSum(lowAll.filter(x => upperKinds.has(x.b.kind) && !x.b.elderly)) + MIN_NET.hall + 3.6 * 2.6 : 0, lowG = floors === 2 ? lowNet - lowUp + 3.6 * 2.6 + MIN_NET.hall : lowNet;
  const lower = floors === 2 ? Math.max(lowG, lowUp) : lowNet;
  const numbers = { buildableW: r1(site.W), buildableD: r1(site.D), buildableArea: Math.round(boxA), coverageArea: Math.round(coverA), available: Math.round(availA), programNet: Math.round(floors === 2 ? Math.max(gNet, upNet) : net), programNetTotal: Math.round(net), neededGrossPerFloor: Math.round(gross), lowerBoundPerFloor: Math.round(lower), floors };
  // (1) المساحة: «مستحيل» بالدليل فقط (الحد الأدنى > المتاح)؛ وما بين الحد الأدنى والتقدير المعتاد «ضيق» يُبحث فيه ولا يُرفض
  const areaCert = areaCertificate({ land, counts, requirements, floors });
  if (areaCert) {
    hard.push({ id: 'AREA', proof: 'area-lower-bound', certificate: areaCert, ar: `حتى بأصغر المقاسات المعتمدة في الميزان يحتاج البرنامج ${Math.round(lower)} م² صافيًا ${floors === 2 ? 'في الدور الأكبر' : ''} بلا جدران ولا حركة، والمتاح للبناء ${Math.round(availA)} م² (${r1(site.W)} × ${r1(site.D)} م بعد الارتدادات${coverA < boxA ? '، ونسبة البناء 75٪ — اشتراط نظامي' : ''}). بالمقاسات المعتادة يحتاج نحو ${Math.round(gross)} م² مع الجدران والحركة.`.replace(/\s+بلا/, ' بلا') });
    if (floors === 1) options.add('دوران بدل دور واحد (غرف النوم في الدور الأول)');
    options.add(`تقليل عدد الغرف أو مساحاتها بنحو ${Math.round(gross - availA)} م²`);
  } else if (gross > availA) warn.push({ id: 'AREA_TIGHT', ar: `المساحة ضيقة على البرنامج: بالمقاسات المعتادة يحتاج نحو ${Math.round(gross)} م² والمتاح ${Math.round(availA)} م²؛ قد يتسع بمقاسات أصغر.` });
  else if (gross > availA * FEAS_LIMITS.warnFactor) warn.push({ id: 'AREA_TIGHT', ar: `البرنامج يملأ معظم المساحة القابلة للبناء (${Math.round(gross)} من ${Math.round(availA)} م²): قد يقل عدد البدائل الممكنة، ولا حدائق داخل الكتلة تقريبًا.` });
  // (2) المقاسات الصريحة: الضلع الأطول لا يتجاوز أطول بعد قابل للبناء، والأقصر لا يتجاوز الأقصر
  for (const cert of dimensionCertificates({ land, requirements })) { const dm = P.dims[cert.key] || {}, k = cert.key;
    hard.push({ id: 'DIM_' + k.toUpperCase(), proof: 'dimension-bound', certificate: cert, ar: `مقاس «${AR_DIM[k] || k}» ${dm.w}×${dm.l} م لا يتسع في الأرض القابلة للبناء (${r1(site.W)} × ${r1(site.D)} م).` }); options.add(`تصغير مقاس «${AR_DIM[k] || k}» أو قبوله «تقريبًا»`); }
  // (3) العرض الأدنى للواجهة: مجلس الرجال (4.2 م صافيًا) ومدخل العائلة (2.4 م) — إن لم يتسعا أمامًا معًا فالمجلس على واجهة جانبية
  const frontNeed = (P.men ? FEAS_LIMITS.minMajlisW + .4 : 0) + FEAS_LIMITS.minFoyerW + .3;
  if (site.W < frontNeed) {
    const wCert = widthCertificate({ land, requirements, counts });
    if (wCert) { hard.push({ id: 'WIDTH', proof: 'width-bound', certificate: wCert, ar: `العرض القابل للبناء ${r1(site.W)} م أضيق من مجلس بجلستين متقابلتين (${FEAS_LIMITS.minMajlisW} م صافيًا).` }); options.add('أرض أعرض أو مجلس بمقاس أصغر يحدده العميل'); }
    else warn.push({ id: 'WIDTH_TIGHT', ar: `الواجهة القابلة للبناء ${r1(site.W)} م لا تتسع للمجلس ومدخل العائلة متجاورين؛ يُبحث عن مجلس بمدخل جانبي.` });
  }
  // (4) بنود الموضع المتعارضة: الفراغ نفسه في الأمام وفي الخلف معًا
  const place = (P.rules || []).filter(r => r.kind === 'place' && r.mode !== 'avoid');
  // (الجولة العشرون) تعارض بين بندين من العميل نفسه ليس استحالة على الأرض: الحوار يسأل العميل أيهما يريد (detectConflicts) ويُرفق السؤال
  // بالتصميم الأول — فهو ملاحظة معلنة لا رفض للتوليد. والاسم عربي (كان يظهر معرّفًا داخليًا «kitchen»)
  for (const a of new Set(place.map(r => r.a))) { const sides = new Set(place.filter(r => r.a === a).map(r => r.side)); if (sides.has('front') && sides.has('back')) warn.push({ id: 'PLACE_CONFLICT', ar: `بندان متعارضان في طلبك: «${SUBJECT_AR[a] || 'الفراغ نفسه'}» في الأمام وفي الخلف معًا — سأسألك أيهما تريد، والتصميم الأول مؤقت حتى تجيب.` }); }
  // (5) الدوران بلا غرف نوم للعلوي
  if (floors === 2 && !P.blocks.some(b => b.kind === 'suite' && !b.elderly)) warn.push({ id: 'NO_UPPER', ar: 'دوران مطلوبان ولا غرف نوم للدور الأول؛ دور واحد يكفي هذا البرنامج.' });
  // (6) (الجولة 21) تعارض منطقي بين بنود العميل (الموضع نفسه أمامًا وخلفًا، قريب وبعيد معًا، دور واحد وغرف فوق…): لا مخطط يحققها معًا —
  // استحالة مثبتة بالمنطق، يُسمّى البندان. في الحوار (provisional) يُرسم تصميم مؤقت ويُسأل العميل، كما في r20.
  let conflicts = []; try { conflicts = detectConflicts(requirements, land).filter(c => LOGICAL_CONFLICTS.includes(c.type) && !(requirements.answers || {})[c.type]); } catch { conflicts = []; }
  for (let c of conflicts) {
    const qs = (c.quotes || []).filter(Boolean).map(q => String(q).replace(/^\s*و(?=ال|[^ ]{3})/, '').trim()); c = { ...c, quotes: qs };
    const ruleIds = (c.items || []).filter(x => /^R\d+$/.test(x)), cert = ruleIds.length === 2 ? logicalCertificate(c.type, ruleIds[0], ruleIds[1]) : null;
    if (!cert) { warn.push({ id: 'CLIENT_CONFLICT', type: c.type, ar: `بندان في طلبك يحتاجان توضيحًا: ${qs.map(q => `«${q}»`).join(' و')}.`, question_ar: c.question_ar }); continue; }
    const item = { id: 'CONFLICT', type: c.type, items: c.items || [], quotes: qs, proof: 'logical-contradiction', certificate: cert, ar: `بندان في طلبك لا يجتمعان في أي مخطط: ${(c.quotes || []).filter(Boolean).map(q => `«${q}»`).join(' و') || 'بندان متقابلان'}.`, question_ar: c.question_ar };
    // (بعد npm test: tests/stage2-r20.test.mjs) عقد r20 باقٍ افتراضيًا: تعارض بندين من العميل ملاحظة وسؤال لا استحالة، والشهادة مرفقة بالملاحظة
    // ليتحقق منها من شاء. «استحالة مثبتة» بها فقط بطلب صريح (logicalHard) — قرار للمالك (docs/research/r21-proposal/PROPOSAL.md §03)
    if (provisional || !logicalHard) warn.push({ ...item, id: 'CLIENT_CONFLICT' }); else { hard.push(item); options.add(`اختيار أحد البندين: ${(c.quotes || []).filter(Boolean).map(q => `«${q}»`).join(' أو ')}`); }
  }
  const feasible = hard.length === 0;
  const report_ar = feasible ? (warn.length ? 'الطلب ممكن على هذه الأرض، مع ملاحظات: ' + warn.map(w => w.ar).join('؛ ') : 'الطلب ممكن على هذه الأرض.')
    : ['لا يمكن تحقيق الطلب كما هو على هذه الأرض:', ...hard.map(h => '— ' + h.ar), 'الخيارات المتاحة: ' + [...options].join('؛ ') + '.', 'لم يُرسم مخطط حتى لا يُعرض عليك تصميم يخالف طلبك؛ عدّل أحد البنود أعلاه وسأعيد التوليد.'].join('\n');
  return { feasible, hard, warnings: warn, options_ar: [...options], numbers, report_ar, conflictingConstraintIds: hard.flatMap(h => h.items?.length ? h.items : [h.id]), proofReference: hard.map(h => h.proof).filter(Boolean), certificates: hard.map(h => h.certificate || null) };
}
export default { analyzeFeasibility, FEAS_LIMITS };
