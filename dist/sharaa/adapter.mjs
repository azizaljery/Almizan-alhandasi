// شرعاء V2 — المحوّل من ArchitecturalBrief إلى ما يقبله المحرك الثالث اليوم (land + counts + requirements + discovery).
// لا يغيّر عقد المحرك ولا requirements.mjs؛ يبني الكائن نفسه الذي يبنيه extractRequirements ويُمرَّر إلى generateInitialDesign.
// المبادئ: (1) غير المؤكد لا يُرسل إلزاميًا أبدًا (يُرسل تفضيلًا أو يُحجب)؛ (2) غير المدعوم لا يُرسل ولا يُوعَد به؛
// (3) «قريب» ≠ «باب مباشر»؛ (4) لا حدود رقمية مخترعة: معايير المحرك الداخلية تُعلَن افتراضًا للموافقة؛ (5) لا تغيير لأي شرط إلزامي لتسهيل التوليد.
import { ruleText } from '../rules.mjs';
import { normalizeDiscovery, AVOIDS, LIFE } from '../client-brief.mjs';
import { defaultRooms } from '../planner.mjs';
import { SPACE_TYPES, ANCHORS, attrMetaOf, nameOf, supportOf, ENGINE_SUPPORT, describeRelation, describePlacement } from './brief.mjs';

const DIM_KEY = { male_majlis: 'majlis', kitchen: 'kitchen', dining: 'dining', master: 'master', bedroom: 'bedroom', living: 'hall' };
const ABSENT_KEY = { male_majlis: 'majlis', dining: 'dining', office: 'office', prayer: 'prayer', maid: 'maid', driver: 'driver' };
const FEATURE_PREFS = ['allEnsuite', 'sharedBaths', 'masterDressing', 'familyEntrance', 'guestEntrance', 'womenSeparate', 'bathsOffHall', 'noCorridors'];
const engineSubject = id => ANCHORS[id]?.engine ?? SPACE_TYPES[id]?.engine ?? null;

/** افتراضات تصميمية مصدرها معايير المحرك الداخلية الموجودة فعلًا (لا أرقام جديدة)؛ تُعرض للعميل ليوافق. */
export const ENGINE_MEASURES = Object.freeze({
  near: { id: 'near-measure', text_ar: '«قريب» يقيسه المحرك: ملامسة ≥ 0.8 م أو فاصل ≤ 2 م بين الفراغين (للمجموعات ≤ 4.2 م).', ev: 'rules.mjs:307,578' },
  door: { id: 'door-measure', text_ar: '«باب مباشر» يركّبه المحرك بابًا فعليًا على جدار مشترك طوله ≥ 1.3 م وعرضه 0.9 م، ويتحقق من عرضه (≥ 0.8 م) وحرية فتحه؛ إن تعذّر فالتصميم يُحجب بسببه الصريح ولا يُخفَّف الطلب.', ev: 'villa-layout-v2.mjs:r21directdoor، rules.mjs:directDoorCheck' },
  adjacent: { id: 'adjacent-measure', text_ar: '«باب مباشر/ملاصق» يضمنه المحرك كملامسة جدار ≥ 0.8 م؛ لا يضمن وجود باب بين الفراغين.', ev: 'rules.mjs:578' },
  far: { id: 'far-measure', text_ar: '«بعيد» يقيسه المحرك: لا ملامسة ومسافة بين المراكز ≥ max(7 م، 40% من قطر المبنى)، وللدرج مسار مشي ≥ 6 م.', ev: 'rules.mjs:565,570' },
  apart: { id: 'apart-measure', text_ar: '«غير ملاصق» يعني عند المحرك ألا يتلامس الجداران (≤ 0.3 م).', ev: 'rules.mjs:559' },
  dims: { id: 'dims-measure', text_ar: 'المقاس الصريح يُرسم هدفًا بسماحية ±5 سم (±3 سم «بالضبط»، ±30 سم «تقريبًا») لا حدًا أدنى.', ev: 'requirements.mjs:55' },
  parking: { id: 'parking-measure', text_ar: 'عدد المواقف نظامي من المحرك ولا يتحكم فيه العميل.', ev: 'site-parking.mjs' },
});

/** هل البند يُرسل صلبًا؟ إلزامي ومؤكد فقط. غير ذلك يُرسل تفضيلًا (prefer) أو يُحجب إن لم يقبل المحرك تفضيلًا. */
const isHard = it => it.priority === 'mandatory' && it.verification === 'confirmed';

export function toEngineInput(brief) {
  const report = { sent: [], softened: [], withheld: [], unsupported: [], limited: [], assumptions: [], inactive: [] };
  const blockers = [];
  const S = id => brief.spaces.find(s => s.id === id && s.count !== undefined) || null;
  const n = id => (S(id)?.count > 0 ? S(id).count : 0);
  const approve = k => { if (!report.assumptions.some(a => a.id === ENGINE_MEASURES[k].id)) report.assumptions.push({ ...ENGINE_MEASURES[k], source: 'design_default', verification: 'needs_confirmation', needsApproval: true }); };

  // ---- الأعداد
  const counts = { bedrooms: Math.max(n('bedroom'), S('master')?.count > 0 || S('elderly')?.count > 0 ? 1 : 0), majlis: 0, baths: n('bath'), kitchens: n('kitchen'), halls: n('living'), dining: n('dining') + (n('guest_dining') > 0 ? n('guest_dining') : 0) };
  if (n('male_majlis') > 0) counts.majlis = 1 + (n('female_majlis') > 0 ? 1 : 0);
  else if (n('female_majlis') > 0) { counts.majlis = 1; report.limited.push({ id: 'space:female_majlis', text_ar: 'مجلس نساء بلا مجلس رجال: يعد المحرك المجلس الأول للرجال؛ سيُرسم مجلس واحد.', ev: 'villa-layout.mjs:63' }); }
  if (S('guest_dining')) report.limited.push({ id: 'space:guest_dining', text_ar: ENGINE_SUPPORT['space.guest_dining'].ar, ev: ENGINE_SUPPORT['space.guest_dining'].ev });
  if (counts.bedrooms < 1) blockers.push({ type: 'NO_BEDROOM', text_ar: 'عدد غرف النوم غير محدد.' });
  // العدد غير المؤكد لا يمكن إرساله تفضيلًا: يحتاج تأكيدًا
  for (const s of brief.spaces) if (s.count !== undefined && s.verification !== 'confirmed' && SPACE_TYPES[s.type].counts) blockers.push({ type: 'UNCONFIRMED_COUNT', id: 'space:' + s.id, text_ar: `عدد «${nameOf(s.type)}» (${s.count}) لم يؤكده العميل.` });

  // ---- الفراغات الإضافية
  const extras = {};
  for (const [type, t] of Object.entries(SPACE_TYPES)) if (t.extra && n(type) > 0) {
    const o = S(type).options || {};
    extras[t.extra] = t.extra === 'office' ? (o.ext ? { ext: true } : true) : ['maid', 'driver', 'guestRoom'].includes(t.extra) ? { bath: !!o.bath, ...(o.noBath ? { noBath: true } : {}), ...(t.extra === 'maid' || t.extra === 'guestRoom' ? { ext: !!o.ext } : {}) } : true;
    if (S(type).verification !== 'confirmed') report.softened.push({ id: 'space:' + type, text_ar: `«${nameOf(type)}» مُرسل لكن غير مؤكد.` });
  }
  const absent = [];
  for (const [type, key] of Object.entries(ABSENT_KEY)) if (S(type)?.count === 0 && S(type).verification === 'confirmed' && (type !== 'male_majlis' || n('female_majlis') === 0)) absent.push(key);

  // ---- المقاسات (المحرك لا يقبل المقاس تفضيلًا: إما صلب مؤكد أو محجوب)
  const dims = {}, areas = {};
  for (const s of brief.spaces) if ((s.minClearWidthM || s.minClearDepthM) && DIM_KEY[s.type]) {
    const w = s.minClearWidthM, l = s.minClearDepthM;
    if (!(w > 0 && l > 0)) { report.withheld.push({ id: 'space:' + s.id, text_ar: `مقاس «${nameOf(s.type)}» ناقص أحد بعديه؛ لم يُرسل.` }); continue; }
    const dm = attrMetaOf(s, 'dims');
    if (dm.verification !== 'confirmed') { report.withheld.push({ id: 'space:' + s.id, text_ar: `مقاس «${nameOf(s.type)}» ${w}×${l} م غير مؤكد؛ لم يُرسل للمحرك لأنه يقبله شرطًا صلبًا فقط.` }); continue; }
    const key = DIM_KEY[s.type]; dims[key] = { w: Math.min(w, l), l: Math.max(w, l), tol: s.dimTolerance ?? 0.05, quote: dm.originalText || `${nameOf(s.type)} ${w}×${l}` }; areas[key] = Math.round(w * l * 100) / 100;
    report.sent.push({ id: 'space:' + s.id, as: 'dims', text_ar: `${nameOf(s.type)} ${w}×${l} م` }); approve('dims');
    report.limited.push({ id: 'space:' + s.id, text_ar: ENGINE_SUPPORT['space.dims'].ar, ev: ENGINE_SUPPORT['space.dims'].ev });
  }

  // ---- التفضيلات
  const F = brief.preferences.features || {}, prefs = {};
  for (const k of FEATURE_PREFS) if (F[k]) {
    const meta = brief.provenance['preferences.features.' + k], st = supportOf('pref.' + k);
    prefs[k] = true; report.sent.push({ id: 'feature:' + k, as: 'pref', text_ar: ENGINE_SUPPORT['pref.' + k]?.ar || k });
    if (st === 'partial') report.limited.push({ id: 'feature:' + k, text_ar: ENGINE_SUPPORT['pref.' + k].ar, ev: ENGINE_SUPPORT['pref.' + k].ev });
    if (meta?.verification !== 'confirmed') report.softened.push({ id: 'feature:' + k, text_ar: `«${ENGINE_SUPPORT['pref.' + k]?.ar || k}» غير مؤكد.` });
  }
  if (F.elderlyRoom || n('elderly') > 0) { prefs.elderlyRoom = true; report.sent.push({ id: 'feature:elderlyRoom', as: 'pref', text_ar: ENGINE_SUPPORT['pref.elderlyRoom'].ar }); }
  if (F.glazing) { prefs.glazing = F.glazing; report.sent.push({ id: 'feature:glazing', as: 'pref', text_ar: ENGINE_SUPPORT['pref.glazing'].ar }); }
  // مفاتيح المحرك النصية (ليست خيارات مكتوبة النوع): لا تُرسل إلا بتأكيد العميل لأنها تُعفي بوابة في المحرك.
  const hooks = [];
  for (const [k, phrase, sid] of [['parkingParallel', 'موقف موازي', 'pref.parkingParallel'], ['guestLinkSeparate', 'مجلس منفصل عن الطعام', 'pref.guestLinkSeparate']]) if (F[k]) {
    const meta = brief.provenance['preferences.features.' + k];
    if (meta?.verification === 'confirmed') { hooks.push(phrase); report.sent.push({ id: 'feature:' + k, as: 'engine-text-hook', text_ar: ENGINE_SUPPORT[sid].ar }); report.limited.push({ id: 'feature:' + k, text_ar: ENGINE_SUPPORT[sid].ar, ev: ENGINE_SUPPORT[sid].ev }); }
    else report.withheld.push({ id: 'feature:' + k, text_ar: `«${ENGINE_SUPPORT[sid].ar}» لم يؤكده العميل فلم يُرسل.` });
  }
  const hookText = hooks.join('، ');
  const ks = brief.preferences.kitchenStyle;
  if (ks === 'open') prefs.openKitchen = true; else if (ks === 'closed') prefs.openKitchen = false; else if (ks === 'open_to_hall') prefs.kitchenOpenHall = true;
  if (ks) report.sent.push({ id: 'pref:kitchenStyle', as: 'pref', text_ar: `المطبخ ${{ open: 'مفتوح على الطعام', closed: 'مغلق', open_to_hall: 'مفتوح على الصالة' }[ks]}` });
  if (brief.preferences.parkingCount > 0) { prefs.parking = true; report.limited.push({ id: 'pref:parkingCount', text_ar: ENGINE_SUPPORT['pref.parking'].ar, ev: ENGINE_SUPPORT['pref.parking'].ev }); approve('parking'); }
  // غير المدعوم: يُسجَّل ويُعلن ولا يُرسل
  for (const [k, sid] of [['privacy', 'pref.privacy'], ['naturalLight', 'pref.naturalLight']]) if (brief.preferences[k]) report.unsupported.push({ id: 'pref:' + k, text_ar: `${ENGINE_SUPPORT[sid].ar}: «${brief.preferences[k]}» مسجّل في ملفك ولن يُطبَّق في هذا الإصدار.` });
  if (brief.preferences.budgetRange) report.unsupported.push({ id: 'pref:budgetRange', text_ar: 'الميزانية مسجّلة في ملفك ولا يستعملها المحرك؛ لن يُراعى سقف الميزانية في التصميم.' });
  if (brief.land.entries.length > 1) report.limited.push({ id: 'land.entries', text_ar: ENGINE_SUPPORT['land.entries.extra'].ar, ev: ENGINE_SUPPORT['land.entries.extra'].ev });
  for (const k of F.unsupportedKinds || []) report.unsupported.push({ id: 'space:' + k, text_ar: k });

  // ---- القواعد: الجهات والعلاقات والأدوار
  const rules = [];
  const levelOf = (it, forbidIfAvoid = false) => (isHard(it) ? (forbidIfAvoid ? 'forbid' : 'must') : 'prefer');
  const push = (ref, it, rule) => {
    const lv = levelOf(it, rule.mode === 'avoid');
    if (lv === 'prefer' && it.priority === 'mandatory') report.softened.push({ id: ref, text_ar: `«${it.originalText || ref}» إلزامي لكنه غير مؤكد: يُرسل تفضيلًا فقط حتى يؤكده العميل.` });
    const r = { id: 'R' + (rules.length + 1), ...rule, level: lv, levelCue: 'explicit', quote: it.originalText || '', briefRef: ref };
    r.text = ruleText(r); rules.push(r); report.sent.push({ id: ref, as: 'rule', level: lv, text_ar: r.text });
    return r;
  };
  for (const p of brief.placements) {
    if (p.active === false) { report.inactive.push({ id: 'placement:' + p.id, text_ar: `${describePlacement(p)} — ${p.inactiveReason}` }); continue; }
    const a = engineSubject(p.space); if (!a) { report.withheld.push({ id: 'placement:' + p.id, text_ar: `لا يعرف المحرك «${nameOf(p.space)}» موضوع قاعدة.` }); continue; }
    const st = (p.side === 'front' || p.side === 'back') && p.mode !== 'center' ? 'supported' : 'partial';
    if (st === 'partial') report.limited.push({ id: 'placement:' + p.id, text_ar: ENGINE_SUPPORT['placement.other'].ar, ev: ENGINE_SUPPORT['placement.other'].ev });
    push('placement:' + p.id, p, { kind: 'place', a, side: p.side, mode: p.mode });
  }
  for (const r of brief.relations) {
    if (r.active === false) { report.inactive.push({ id: 'relation:' + r.id, text_ar: `${describeRelation(r)} — ${r.inactiveReason}` }); continue; }
    const a = engineSubject(r.from), b = engineSubject(r.to), ref = 'relation:' + r.id;
    if (r.relation === 'avoid_visibility' || r.verification === 'unsupported') { report.unsupported.push({ id: ref, text_ar: `${describeRelation(r)}: ${ENGINE_SUPPORT['relation.avoid_visibility'].ar} غير مدعوم؛ مسجّل في ملفك ولن يُطبَّق.` }); continue; }
    if (!a || !b) { report.withheld.push({ id: ref, text_ar: `${describeRelation(r)}: أحد الطرفين لا يعرفه المحرك موضوع قاعدة.` }); continue; }
    if (r.relation === 'same_floor' || r.relation === 'different_floor') { report.withheld.push({ id: ref, text_ar: `${describeRelation(r)}: يُطبَّق عبر دور كل فراغ على حدة (حدّد دور أحدهما).` }); report.limited.push({ id: ref, text_ar: ENGINE_SUPPORT['relation.' + r.relation].ar, ev: ENGINE_SUPPORT['relation.' + r.relation].ev }); continue; }
    const kind = r.relation === 'near' ? 'near' : r.relation === 'direct_access' ? 'adjacent' : (r.detail === 'far' ? 'far' : 'apart');
    const isDoor = r.relation === 'direct_access' && r.detail === 'door'; // باب حقيقي (r21directdoor)؛ غير ذلك ملاصقة جدار فقط
    approve(r.relation === 'near' ? 'near' : isDoor ? 'door' : r.relation === 'direct_access' ? 'adjacent' : kind);
    if (r.relation === 'near' || r.relation === 'direct_access') { const sid = isDoor ? 'relation.direct_door' : 'relation.' + r.relation; report.limited.push({ id: ref, text_ar: ENGINE_SUPPORT[sid].ar, ev: ENGINE_SUPPORT[sid].ev }); }
    if (r.relation === 'separate' && r.detail === undefined) report.assumptions.push({ id: 'separate-kind:' + r.id, text_ar: `«${describeRelation(r)}»: لم تُحدَّد درجة الفصل؛ سأعدّه «غير ملاصق» (الأخف) ما لم تطلب «بعيد».`, source: 'design_default', needsApproval: true });
    push(ref, r, { kind, a, b, ...(isDoor ? { door: true } : {}) });
  }
  for (const s of brief.spaces) if (s.count > 0 && s.floorPreference != null) {
    const a = engineSubject(s.type); if (!a) continue;
    if (s.floorPreference === 1 && brief.land.floors < 2) { blockers.push({ type: 'FLOOR_CONFLICT', id: 'space:' + s.id, text_ar: `«${nameOf(s.type)}» مطلوب في الدور العلوي وأرضك بدور واحد.` }); continue; }
    push('space:' + s.id, { ...s, ...attrMetaOf(s, 'floor') }, { kind: 'floor', a, floor: s.floorPreference === 1 ? 'upper' : 'ground' });
  }
  for (const c of brief.conflicts) blockers.push({ type: 'CONFLICT', id: c.id, text_ar: c.reason, mandatory: !!c.mandatory });
  // إلزامي غير مؤكد
  for (const it of [...brief.spaces.map(s => ['space:' + s.id, s]), ...brief.relations.filter(r => r.active !== false).map(r => ['relation:' + r.id, r]), ...brief.placements.filter(p => p.active !== false).map(p => ['placement:' + p.id, p])])
    if (it[1].priority === 'mandatory' && it[1].verification === 'needs_confirmation') blockers.push({ type: 'UNCONFIRMED_MANDATORY', id: it[0], text_ar: `«${it[1].originalText || it[0]}» إلزامي ولم يؤكده العميل.` });
  // استنتاج ذكاء لا يُرسل أبدًا إلزاميًا
  for (const r of rules) if (r.level === 'must' || r.level === 'forbid') {
    const [kind, ...rest] = r.briefRef.split(':'), id = rest.join(':'), list = kind === 'relation' ? brief.relations : kind === 'placement' ? brief.placements : brief.spaces, it = list.find(x => x.id === id);
    if (it && (it.source === 'ai_inference' || it.source === 'design_default')) throw Error('انتهاك داخلي: استنتاج/افتراض أُرسل إلزاميًا: ' + r.briefRef);
  }

  const L = brief.land.engineLand;
  const life = {}, hh = brief.household;
  for (const [k, v] of Object.entries(hh.life || {})) if (LIFE[k]?.includes(v)) life[k] = v;
  const avoids = (hh.avoids || []).filter(a => AVOIDS.includes(a));
  const discovery = normalizeDiscovery({ likes: [], rejects: [], avoids, life });
  const understood = report.sent.map(x => x.text_ar);
  const requirements = { text: hookText, idea: hookText, counts: { ...counts }, extras, prefs, areas, dims, rules, tweaks: F.tweaks || {}, understood, unsupported: report.unsupported.map(u => u.text_ar), unclear: [], textCounts: {}, givenCounts: { ...counts }, absent: [...new Set(absent)], orphans: [] };
  return { land: clone(L), counts, rooms: defaultRooms(counts), discovery, idea: hookText, requirements, report, blockers };
}
const clone = o => JSON.parse(JSON.stringify(o));

/** الصفوف التي يعرضها الملف الحي: كل بند مع صنف دعمه. */
export function supportRows(brief) {
  const rows = [];
  for (const s of brief.spaces) rows.push({ ref: 'space:' + s.id, label: `${nameOf(s.type)}${s.count !== 1 ? ' × ' + s.count : ''}`, source: s.source, priority: s.priority, verification: s.verification, support: s.type === 'guest_dining' ? 'partial' : (s.minClearWidthM ? 'partial' : 'supported') });
  for (const r of brief.relations) rows.push({ ref: 'relation:' + r.id, label: describeRelation(r), source: r.source, priority: r.priority, verification: r.verification, support: supportOf('relation.' + r.relation), inactive: r.active === false });
  for (const p of brief.placements) rows.push({ ref: 'placement:' + p.id, label: describePlacement(p), source: p.source, priority: p.priority, verification: p.verification, support: (p.side === 'front' || p.side === 'back') ? 'supported' : 'partial', inactive: p.active === false });
  return rows;
}
