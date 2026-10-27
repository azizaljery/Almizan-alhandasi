// شرعاء V2 — ArchitecturalBrief: مصدر الحقيقة الواحد لاحتياجات العميل (حديث حر وأسئلة وقرارات).
// وحدة نقية بلا DOM ولا شبكة. لا تغيّر عقد أي محرك؛ المحوّل إلى المحرك في adapter.mjs.
// المخطط مطابق لمواصفة المالك (انظر brief.d.ts) مع إضافات معلنة: provenance وlog وrecheck وplacements وfeatures.
import { frontSetbackFor, SETBACK_NEIGHBOUR, COVERAGE_MAX } from '../regulations-sa.mjs';
import { normalizeAr } from '../requirements.mjs';

export const BRIEF_VERSION = 'sharaa-2.0';
export const SOURCES = Object.freeze(['land_step', 'client_free_text', 'client_answer', 'client_confirmed', 'ai_inference', 'design_default', 'verified_regulation']);
export const PRIORITIES = Object.freeze(['mandatory', 'preferred', 'flexible']);
export const VERIFICATIONS = Object.freeze(['confirmed', 'needs_confirmation', 'not_verified', 'unsupported']);
export const RELATIONS = Object.freeze(['near', 'direct_access', 'separate', 'avoid_visibility', 'same_floor', 'different_floor']);
export const SIDES = Object.freeze(['front', 'back', 'n', 's', 'e', 'w', 'left', 'right', 'center']);

/** المحاور العشرة (§2 من المواصفة). */
export const TOPICS = Object.freeze([
  { id: 'household', ar: 'الأسرة' }, { id: 'hospitality', ar: 'الضيافة' }, { id: 'privacy', ar: 'الخصوصية' }, { id: 'daily', ar: 'الحياة اليومية' },
  { id: 'wings', ar: 'الأجنحة' }, { id: 'services', ar: 'الخدمات' }, { id: 'parking', ar: 'المواقف' }, { id: 'environment', ar: 'البيئة' },
  { id: 'budget', ar: 'الميزانية' }, { id: 'priorities', ar: 'الأولويات' },
]);

/** الفراغات: engine = اسم الفراغ في قواعد المحرك (rules.mjs SUBJECTS) أو null إن لم يكن موضوع قاعدة. */
export const SPACE_TYPES = Object.freeze({
  bedroom: { ar: 'غرف النوم (شاملةً الرئيسية)', engine: 'bedrooms', counts: 'bedrooms' },
  master: { ar: 'غرفة النوم الرئيسية', engine: 'master', partOf: 'bedroom' },
  elderly: { ar: 'غرفة كبار السن', engine: 'elderly', partOf: 'bedroom' },
  male_majlis: { ar: 'مجلس الرجال', engine: 'majlis', counts: 'majlis' },
  female_majlis: { ar: 'مجلس النساء', engine: 'majlis_w', counts: 'majlis' },
  dining: { ar: 'غرفة الطعام', engine: 'dining', counts: 'dining' },
  guest_dining: { ar: 'المقلط (طعام الضيوف)', engine: 'dining', counts: 'dining', partial: true },
  kitchen: { ar: 'المطبخ', engine: 'kitchen', counts: 'kitchens' },
  living: { ar: 'الصالة العائلية', engine: 'hall', counts: 'halls' },
  bath: { ar: 'دورات المياه', engine: null, counts: 'baths' },
  guest_room: { ar: 'غرفة الضيوف', engine: 'guest', extra: 'guestRoom' },
  maid: { ar: 'غرفة الخادمة', engine: 'maid', extra: 'maid' },
  driver: { ar: 'غرفة السائق', engine: 'driver', extra: 'driver' },
  office: { ar: 'المكتب', engine: 'office', extra: 'office' },
  prayer: { ar: 'المصلى', engine: 'prayer', extra: 'prayer' },
  laundry: { ar: 'غرفة الغسيل', engine: 'laundry', extra: 'laundry' },
  storage: { ar: 'المخزن', engine: 'storage', extra: 'storage' },
});
/** نقاط مرجعية في العلاقات لا تُعدّ فراغات في البرنامج. */
export const ANCHORS = Object.freeze({ stairs: { ar: 'الدرج', engine: 'stairs' }, entrance: { ar: 'المدخل', engine: 'entrance' } });
export const nameOf = id => SPACE_TYPES[id]?.ar || ANCHORS[id]?.ar || String(id);

/**
 * جدول دعم المحرك الثالث (مشتق من 00-audit.md؛ كل سطر له دليل في الشيفرة).
 * status: supported | partial | unsupported. لا يُعدّ أي حقل «مدعومًا» إلا بقراءة مستهلكه في المولّد.
 */
export const ENGINE_SUPPORT = Object.freeze({
  'land.rect': { status: 'supported', ar: 'أبعاد الأرض المستطيلة', ev: 'planner.mjs:67' },
  'land.streets': { status: 'supported', ar: 'الشوارع والمدخل الأول', ev: 'home-flow.mjs:43-50' },
  'land.entries.extra': { status: 'partial', ar: 'المداخل الإضافية (تُسجَّل ولا تؤثر في التوزيع)', ev: 'home-flow.mjs:34,238' },
  'land.floors': { status: 'supported', ar: 'دور أو دوران', ev: 'home-flow.mjs:47-49' },
  'land.streetWidth': { status: 'supported', ar: 'عرض شارع المدخل', ev: 'villa-layout-v2.mjs:1524' },
  'land.polygon': { status: 'partial', ar: 'أرض غير مستطيلة (غير متحقق على المحرك الثالث)', ev: 'villa-layout-v2.mjs:1518' },
  'land.setbacksOverride': { status: 'unsupported', ar: 'ارتدادات مخصصة من العميل', ev: 'planner.mjs:71' },
  'space.count': { status: 'supported', ar: 'أعداد الفراغات الأساسية', ev: 'home-flow.mjs:60-67' },
  'space.extras': { status: 'supported', ar: 'الخادمة والسائق والمكتب والمصلى والمخزن والغسيل والضيوف', ev: 'villa-layout.mjs:80-85' },
  'space.guest_dining': { status: 'partial', ar: 'المقلط يُرسم كغرفة طعام تلاصق المجلس إن أمكن', ev: 'villa-layout-v3.mjs:75' },
  'space.dims': { status: 'partial', ar: 'المقاس الصريح يُرسم هدفًا بسماحية لا حدًا أدنى', ev: 'villa-layout-v2.mjs:165-177' },
  'space.floor': { status: 'supported', ar: 'دور فراغ معيّن في الدورين', ev: 'rules.mjs:79' },
  'placement.frontback': { status: 'supported', ar: 'الفراغ في الأمام أو الخلف', ev: 'villa-layout-v3.mjs:90-94' },
  'placement.other': { status: 'partial', ar: 'جهة بوصلة أو يمين/يسار أو الوسط (عقوبة وتحقق لا قيد صلب)', ev: 'rules.mjs:371,500' },
  'relation.near': { status: 'partial', ar: 'قريب: يقيسه المحرك بملامسة ≥ 0.8 م أو فاصل ≤ 2 م', ev: 'rules.mjs:307,578' },
  'relation.direct_access': { status: 'partial', ar: 'باب مباشر: المحرك يضمن الملاصقة (≥ 0.8 م) لا الباب', ev: 'rules.mjs:578' },
  'relation.separate': { status: 'supported', ar: 'غير ملاصق أو بعيد', ev: 'rules.mjs:559,564' },
  'relation.avoid_visibility': { status: 'unsupported', ar: 'تجنب الانكشاف البصري', ev: 'لا نوع قاعدة' },
  'relation.same_floor': { status: 'partial', ar: 'نفس الدور: يُطبَّق عبر دور كل فراغ فقط', ev: 'rules.mjs:510' },
  'relation.different_floor': { status: 'partial', ar: 'دوران مختلفان: يُطبَّق عبر دور كل فراغ فقط', ev: 'rules.mjs:510' },
  'pref.allEnsuite': { status: 'supported', ar: 'حمام لكل غرفة', ev: 'villa-layout.mjs:52' },
  'pref.sharedBaths': { status: 'supported', ar: 'حمامات مشتركة', ev: 'villa-layout.mjs:52' },
  'pref.masterDressing': { status: 'supported', ar: 'غرفة ملابس للرئيسية', ev: 'villa-layout-v2.mjs:1190' },
  'pref.kitchenStyle': { status: 'partial', ar: 'مطبخ مفتوح/مغلق/مفتوح على الصالة فقط', ev: 'villa-layout-v2.mjs:1741,1961' },
  'pref.familyEntrance': { status: 'supported', ar: 'مدخل عائلي مستقل', ev: 'villa-layout-v2.mjs:1744' },
  'pref.bathsOffHall': { status: 'supported', ar: 'الحمامات لا تفتح على الصالة', ev: 'villa-layout-v2.mjs:1820' },
  'pref.elderlyRoom': { status: 'supported', ar: 'غرفة كبار السن قرب الصالة', ev: 'villa-layout.mjs:101' },
  'pref.glazing': { status: 'supported', ar: 'نسبة الزجاج لكل غرفة', ev: 'villa-layout-v2.mjs:2359' },
  'pref.guestEntrance': { status: 'partial', ar: 'مدخل مستقل للضيوف: يتحقق منه التحقق بعد التوليد، والمجلس على الشارع أو جانبه', ev: 'rules.mjs:645; villa-layout-v3.mjs:71' },
  'pref.womenSeparate': { status: 'partial', ar: 'فصل مجلس النساء: تحقق بعد التوليد فقط', ev: 'rules.mjs:625' },
  'pref.noCorridors': { status: 'partial', ar: 'أقل ما يمكن من الممرات: تحقق بعد التوليد فقط', ev: 'rules.mjs:622' },
  'pref.parking': { status: 'partial', ar: 'المواقف: العدد نظامي ولا يتحكم فيه العميل', ev: 'site-parking.mjs' },
  'pref.privacy': { status: 'unsupported', ar: 'درجة الخصوصية العامة', ev: 'لا مستهلك' },
  'pref.naturalLight': { status: 'unsupported', ar: 'توجيه الإضاءة الطبيعية والإطلالة', ev: 'client-brief.mjs:34' },
  'pref.budget': { status: 'unsupported', ar: 'الميزانية ومستوى التشطيب', ev: 'لا حقل' },
  'space.unsupportedKinds': { status: 'unsupported', ar: 'الكراج المغلق والملحق والسطح والشرفة والفناء والمسبح والمصعد والقبو', ev: 'requirements.mjs:240-248' },
});
export const supportOf = id => ENGINE_SUPPORT[id]?.status || 'unsupported';
export function engineReadiness() {
  const out = { supported: [], partiallySupported: [], unsupported: [] };
  for (const [id, v] of Object.entries(ENGINE_SUPPORT)) out[v.status === 'supported' ? 'supported' : v.status === 'partial' ? 'partiallySupported' : 'unsupported'].push(id);
  return out;
}

// ------------------------------------------------------------------------------------------ الميتا: المصدر والأولوية والتحقق
/** أسبقية المصدر عند التعارض بين قيمتين لنفس الحقل: الأعلى لا يُستبدل بالأدنى. */
export const SOURCE_RANK = Object.freeze({ design_default: 1, ai_inference: 2, client_free_text: 3, land_step: 4, verified_regulation: 4, client_answer: 5, client_confirmed: 6 });
const DEFAULT_VERIFICATION = { land_step: 'confirmed', verified_regulation: 'confirmed', client_answer: 'confirmed', client_confirmed: 'confirmed', client_free_text: 'needs_confirmation', ai_inference: 'needs_confirmation', design_default: 'needs_confirmation' };
/**
 * يُطبّع ميتا أي معلومة ويفرض القواعد: استنتاج الذكاء والافتراض التصميمي لا يصيران إلزاميين ولا مؤكدين بلا تأكيد العميل.
 * يعيد { source, priority, verification, originalText?, priorityCapped? }.
 */
export function makeMeta({ source, priority = 'preferred', verification, originalText } = {}) {
  if (!SOURCES.includes(source)) throw Error('مصدر غير معروف: ' + source);
  if (!PRIORITIES.includes(priority)) throw Error('أولوية غير معروفة: ' + priority);
  let ver = verification ?? DEFAULT_VERIFICATION[source], pri = priority, capped = false;
  if (!VERIFICATIONS.includes(ver)) throw Error('حالة تحقق غير معروفة: ' + ver);
  if (source === 'ai_inference' || source === 'design_default') {
    if (ver === 'confirmed') ver = 'needs_confirmation';
    if (pri === 'mandatory') { pri = 'preferred'; capped = true; }
  }
  if (source === 'client_confirmed') ver = ver === 'unsupported' ? 'unsupported' : 'confirmed';
  return { source, priority: pri, verification: ver, ...(originalText ? { originalText: String(originalText).slice(0, 600) } : {}), ...(capped ? { priorityCapped: true } : {}) };
}
const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function mutate(brief, fn) { const d = clone(brief); fn(d); refreshActive(d); d.conflicts = deriveConflicts(d); return d; }
function pushLog(d, entry) { d.log.push({ seq: d.log.length + 1, ...entry }); if (d.log.length > 800) d.log.splice(0, d.log.length - 800); }

// ------------------------------------------------------------------------------------------ الأرض
const LEFT_RIGHT = { s: ['w', 'e'], n: ['e', 'w'], e: ['s', 'n'], w: ['n', 's'] }; // يسار/يمين الداخل من الشارع
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
/**
 * بيانات الأرض كما خرجت من مرحلة الأرض (land من normalizeLand): length شمال/جنوب، width شرق/غرب.
 * widthM = العرض (شرق/غرب)، depthM = الطول (شمال/جنوب). الارتدادات من regulations-sa فقط ولا تُفترض قيم أخرى.
 */
export function landContextFrom(engineLand, { landId = 'land-1', revision = 1 } = {}) {
  const L = engineLand || {};
  if (!(Number(L.length) > 0 && Number(L.width) > 0)) throw Error('بيانات الأرض ناقصة: الطول والعرض مطلوبان من مرحلة الأرض.');
  const entry = (L.entries || [])[0], front = frontSetbackFor(L.streetWidth);
  const sb = {};
  for (const s of ['n', 's', 'e', 'w']) sb[s] = s === entry ? front.value : (L.streets || []).includes(s) ? 3 : SETBACK_NEIGHBOUR.value;
  const [leftSide, rightSide] = LEFT_RIGHT[entry] || [];
  const otherStreets = (L.streets || []).filter(s => s !== entry);
  return {
    landId, revision, areaM2: Math.round(Number(L.length) * Number(L.width) * 100) / 100, widthM: Number(L.width), depthM: Number(L.length),
    streets: (L.streets || []).map(side => ({ side, ...(side === entry && Number(L.streetWidth) > 0 ? { widthM: Number(L.streetWidth) } : {}) })),
    entries: [...(L.entries || [])], floors: L.floors || 1,
    setbacks: entry ? { front: sb[entry], rear: sb[OPPOSITE[entry]], left: sb[leftSide], right: sb[rightSide], verified: front.known && otherStreets.length === 0 } : undefined,
    coverageMaxPct: COVERAGE_MAX.value,
    engineLand: clone({ length: Number(L.length), width: Number(L.width), streets: L.streets || [], entries: L.entries || [], floors: L.floors || 1, ...(L.polygon ? { polygon: L.polygon } : {}), ...(L.streetWidth ? { streetWidth: L.streetWidth } : {}) }),
  };
}

// ------------------------------------------------------------------------------------------ الإنشاء
/** ملف احتياجات جديد. لا يُسأل العميل عن الأرض: تُؤخذ من مرحلة الأرض فقط. */
export function createBrief({ land, landId = 'land-1', mode = 'free' } = {}) {
  const ctx = landContextFrom(land, { landId });
  return {
    version: BRIEF_VERSION, land: ctx,
    interaction: { mode: mode === 'guided' ? 'guided' : 'free', path: mode, completedTopics: [], asked: [] },
    household: {}, spaces: [], relations: [], placements: [],
    preferences: { features: {} },
    decisions: [], conflicts: [], engineReadiness: engineReadiness(),
    provenance: { 'land': { source: 'land_step', priority: 'mandatory', verification: 'confirmed' } },
    recheck: [], log: [],
  };
}

// ------------------------------------------------------------------------------------------ تغيير الأرض (المواصفة §6)
/**
 * أرض جديدة من المرحلة السابقة: تُزاد land.revision وتُعاد مراجعة القيود المتأثرة (المقاسات والدور والجهات)، ولا تُحذف إجابات العميل.
 * يعيد brief جديدًا؛ إن لم يتغير شيء يعيد الملف نفسه بلا زيادة.
 */
export function reviseLand(brief, newLand) {
  const next = landContextFrom(newLand, { landId: brief.land.landId, revision: brief.land.revision });
  const same = JSON.stringify(next.engineLand) === JSON.stringify(brief.land.engineLand);
  if (same) return brief;
  return mutate(brief, d => {
    const prev = d.land; next.revision = prev.revision + 1; d.land = next;
    const affected = [];
    for (const s of d.spaces) if (s.minClearWidthM || s.minClearDepthM || s.floorPreference != null || s.count > 0) {
      const why = s.minClearWidthM || s.minClearDepthM ? 'مقاس صريح يُقارن بالأرض الجديدة' : s.floorPreference != null ? 'الدور المطلوب يُقارن بعدد أدوار الأرض الجديدة' : 'العدد يُقارن بالمساحة المتاحة';
      if (s.minClearWidthM || s.minClearDepthM || s.floorPreference != null) affected.push({ id: 'space:' + s.id, reason: why });
    }
    for (const p of d.placements) affected.push({ id: 'placement:' + p.id, reason: 'الجهة تُقاس بالنسبة لمدخل الأرض الجديدة' });
    d.recheck = affected;
    for (const s of d.spaces) if (affected.some(a => a.id === 'space:' + s.id)) s.needsRecheck = true;
    for (const p of d.placements) p.needsRecheck = true;
    d.decisions.push({ id: 'd' + (d.decisions.length + 1), description: `تغيّرت الأرض (المراجعة ${prev.revision} ← ${next.revision}) وأُعيدت مراجعة ${affected.length} قيد؛ إجابات العميل محفوظة.`, status: 'confirmed' });
    pushLog(d, { op: 'land_revised', from: prev.revision, to: next.revision, affected: affected.length });
  });
}
/** يقرّ العميل أن القيد المعاد مراجعته ما زال صالحًا (يُسقط علم needsRecheck عنه). */
export function clearRecheck(brief, ref) {
  return mutate(brief, d => {
    const [kind, id] = String(ref).split(':');
    const list = kind === 'space' ? d.spaces : d.placements; const it = list.find(x => x.id === id);
    if (it) delete it.needsRecheck;
    d.recheck = d.recheck.filter(r => r.id !== ref);
  });
}

// ------------------------------------------------------------------------------------------ الفراغات
/**
 * يضيف/يحدّث فراغًا. إن كان للقيمة السابقة مصدر أعلى أسبقية فلا تُستبدل بمصدر أدنى (يُسجَّل فقط).
 * تغيير العميل لإجابة سابقة يحفظ التاريخ والنص الأصلي ويسجّل قرارًا ويُحدّث العلاقات المتأثرة.
 */
export function upsertSpace(brief, s) {
  if (!SPACE_TYPES[s.type]) throw Error('نوع فراغ غير معروف: ' + s.type);
  const meta = makeMeta(s);
  return mutate(brief, d => {
    const id = s.id || s.type, cur = d.spaces.find(x => x.id === id), t = SPACE_TYPES[s.type];
    const incoming = { id, type: s.type, count: Number.isInteger(s.count) ? s.count : (cur?.count ?? 1), floorPreference: s.floorPreference === undefined ? (cur?.floorPreference ?? null) : s.floorPreference,
      ...(s.minClearWidthM ? { minClearWidthM: s.minClearWidthM } : cur?.minClearWidthM ? { minClearWidthM: cur.minClearWidthM } : {}), ...(s.minClearDepthM ? { minClearDepthM: s.minClearDepthM } : cur?.minClearDepthM ? { minClearDepthM: cur.minClearDepthM } : {}),
      ...(s.dimTolerance ? { dimTolerance: s.dimTolerance } : cur?.dimTolerance ? { dimTolerance: cur.dimTolerance } : {}), ...(s.options || cur?.options ? { options: { ...(cur?.options || {}), ...(s.options || {}) } } : {}),
      ...(t.partOf ? { partOf: t.partOf } : {}), ...(s.implied ? { implied: true } : cur?.implied && !Number.isInteger(s.count) ? { implied: true } : {}) };
    const attrMeta = { source: meta.source, priority: meta.priority, verification: meta.verification, ...(meta.originalText ? { originalText: meta.originalText } : {}) };
    // مصدر أدنى أسبقية لا يستبدل قيمة قائمة، لكن يضيف خاصية جديدة (مقاس/دور) غير موجودة بميتاها الخاصة
    if (cur && SOURCE_RANK[meta.source] < SOURCE_RANK[cur.source]) {
      let added = false;
      if ((s.minClearWidthM || s.minClearDepthM) && !cur.minClearWidthM && !cur.minClearDepthM) { Object.assign(cur, { minClearWidthM: s.minClearWidthM, minClearDepthM: s.minClearDepthM, ...(s.dimTolerance ? { dimTolerance: s.dimTolerance } : {}) }); (cur.attr ||= {}).dims = attrMeta; added = true; }
      if (s.floorPreference != null && cur.floorPreference == null) { cur.floorPreference = s.floorPreference; (cur.attr ||= {}).floor = attrMeta; added = true; }
      pushLog(d, { op: added ? 'space_attr_added_lower_source' : 'space_ignored_lower_source', id, source: meta.source, kept: cur.source, originalText: meta.originalText }); return;
    }
    if (s.minClearWidthM || s.minClearDepthM) incoming.attr = { ...(cur?.attr || {}), dims: attrMeta };
    if (s.floorPreference != null) incoming.attr = { ...(incoming.attr || cur?.attr || {}), floor: attrMeta };
    if (!incoming.attr && cur?.attr) incoming.attr = cur.attr;
    if (!cur) { d.spaces.push({ ...incoming, priority: meta.priority, source: meta.source, verification: meta.verification, ...(meta.originalText ? { originalText: meta.originalText } : {}), ...(meta.priorityCapped ? { priorityCapped: true } : {}), history: [] }); pushLog(d, { op: 'space_added', id, count: incoming.count, source: meta.source, originalText: meta.originalText }); return; }
    const changed = cur.count !== incoming.count || cur.floorPreference !== incoming.floorPreference || cur.minClearWidthM !== incoming.minClearWidthM || cur.minClearDepthM !== incoming.minClearDepthM;
    // العميل لا يحتاج تأكيدًا ثانيًا لإجابته الصريحة؛ تغيير قيمة يحفظ السابقة في history
    if (changed) {
      cur.history.push({ count: cur.count, floorPreference: cur.floorPreference, source: cur.source, ...(cur.originalText ? { originalText: cur.originalText } : {}) });
      d.decisions.push({ id: 'd' + (d.decisions.length + 1), description: `تغيير «${nameOf(id)}»: ${cur.count} ← ${incoming.count}` + (incoming.floorPreference !== cur.floorPreference ? `، الدور ${incoming.floorPreference === 1 ? 'العلوي' : incoming.floorPreference === 0 ? 'الأرضي' : 'غير محدد'}` : ''), status: 'confirmed' });
      pushLog(d, { op: 'space_changed', id, before: cur.count, after: incoming.count, source: meta.source, originalText: meta.originalText });
    }
    Object.assign(cur, incoming, { priority: meta.priority, source: meta.source, verification: meta.verification }, meta.originalText ? { originalText: meta.originalText } : {}, meta.priorityCapped ? { priorityCapped: true } : {});
    if (!meta.priorityCapped) delete cur.priorityCapped;
    delete cur.needsRecheck;
  });
}
/** ميتا خاصية (dims|floor) من فراغ: لها مصدرها إن أُضيفت بمصدر مختلف، وإلا مصدر الفراغ نفسه. */
export const attrMetaOf = (s, k) => ({ priority: s.priority, verification: s.verification, source: s.source, originalText: s.originalText, ...(s.attr?.[k] || {}) });
export const spaceOf = (brief, id) => brief.spaces.find(s => s.id === id) || null;
export const countOf = (brief, id) => spaceOf(brief, id)?.count ?? null;

/** يغيّر أولوية أو يؤكد بند (فراغ/علاقة/جهة) بقرار العميل: المصدر client_confirmed. */
export function decide(brief, ref, { priority, confirm = true, originalText } = {}) {
  return mutate(brief, d => {
    const [kind, ...rest] = String(ref).split(':'), id = rest.join(':');
    const list = kind === 'space' ? d.spaces : kind === 'relation' ? d.relations : kind === 'placement' ? d.placements : null;
    const it = list?.find(x => x.id === id); if (!it) throw Error('بند غير موجود: ' + ref);
    if (it.verification === 'unsupported') { pushLog(d, { op: 'decide_unsupported_ignored', ref }); return; }
    const before = { priority: it.priority, verification: it.verification, source: it.source };
    if (it.attr) for (const a of Object.values(it.attr)) { if (confirm) { a.verification = 'confirmed'; a.source = 'client_confirmed'; } if (priority) a.priority = priority; }
    if (priority) { if (!PRIORITIES.includes(priority)) throw Error('أولوية غير معروفة.'); it.priority = priority; }
    if (confirm) { it.verification = 'confirmed'; it.source = 'client_confirmed'; delete it.priorityCapped; }
    if (originalText) it.originalText = String(originalText).slice(0, 600);
    (it.history ||= []).push({ ...before, ...(it.originalText ? { originalText: it.originalText } : {}) });
    d.decisions.push({ id: 'd' + (d.decisions.length + 1), description: `قرار العميل: «${labelOf(d, kind, it)}» ${priority ? ({ mandatory: 'شرط لازم', preferred: 'تفضيل', flexible: 'قابل للتنازل' })[priority] : 'مؤكد'}`, status: 'confirmed' });
    pushLog(d, { op: 'decided', ref, ...(priority ? { priority } : {}), source: 'client_confirmed', originalText });
  });
}
function labelOf(d, kind, it) {
  if (kind === 'space') return nameOf(it.type);
  if (kind === 'relation') return `${nameOf(it.from)} ${({ near: 'قريب من', direct_access: 'بباب مباشر على', separate: 'منفصل عن', avoid_visibility: 'لا يكشف', same_floor: 'في دور واحد مع', different_floor: 'في دور مختلف عن' })[it.relation]} ${nameOf(it.to)}`;
  return `${nameOf(it.space)} ${it.mode === 'avoid' ? 'لا يطل على' : 'في'} ${SIDE_AR[it.side] || it.side}`;
}
export const SIDE_AR = Object.freeze({ front: 'الأمام (الشارع)', back: 'الخلف', n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب', left: 'يسار الداخل', right: 'يمين الداخل', center: 'الوسط' });
export const describeRelation = r => `${nameOf(r.from)} ${({ near: 'قريب من', direct_access: 'بباب مباشر على', separate: r.detail === 'far' ? 'بعيد عن' : 'غير ملاصق لـ', avoid_visibility: 'لا ينكشف على', same_floor: 'في الدور نفسه مع', different_floor: 'في دور مختلف عن' })[r.relation]} ${nameOf(r.to)}`;
export const describePlacement = p => `${nameOf(p.space)} ${p.mode === 'avoid' ? 'لا يطل على' : 'في'} ${SIDE_AR[p.side] || p.side}`;

// ------------------------------------------------------------------------------------------ العلاقات والجهات
/** «قريب» ≠ «باب مباشر» ≠ «ملاصق»: كل علاقة تحفظ نوعها كما قاله العميل ولا يُحوَّل نوع إلى آخر. */
export function addRelation(brief, r) {
  if (!RELATIONS.includes(r.relation)) throw Error('نوع علاقة غير معروف: ' + r.relation);
  for (const e of [r.from, r.to]) if (!SPACE_TYPES[e] && !ANCHORS[e]) throw Error('طرف علاقة غير معروف: ' + e);
  if (r.from === r.to) throw Error('علاقة فراغ بنفسه.');
  const meta = makeMeta(r);
  return mutate(brief, d => {
    const id = `${r.from}|${r.to}|${r.relation}`, cur = d.relations.find(x => x.id === id);
    const unsupported = supportOf('relation.' + r.relation) === 'unsupported';
    const rec = { id, from: r.from, to: r.to, relation: r.relation, ...(r.detail ? { detail: r.detail } : {}), priority: meta.priority, source: meta.source, verification: unsupported ? 'unsupported' : meta.verification, ...(meta.originalText ? { originalText: meta.originalText } : {}), ...(meta.priorityCapped ? { priorityCapped: true } : {}), active: true, history: cur?.history || [] };
    if (cur) { if (SOURCE_RANK[meta.source] < SOURCE_RANK[cur.source]) { pushLog(d, { op: 'relation_ignored_lower_source', id }); return; } cur.history.push({ priority: cur.priority, source: cur.source, ...(cur.originalText ? { originalText: cur.originalText } : {}) }); Object.assign(cur, rec); }
    else d.relations.push(rec);
    pushLog(d, { op: cur ? 'relation_changed' : 'relation_added', id, source: meta.source, originalText: meta.originalText });
  });
}
export function addPlacement(brief, p) {
  if (!SPACE_TYPES[p.space] && !ANCHORS[p.space]) throw Error('فراغ غير معروف: ' + p.space);
  if (!SIDES.includes(p.side)) throw Error('جهة غير معروفة: ' + p.side);
  const mode = p.mode || 'zone', meta = makeMeta(p);
  return mutate(brief, d => {
    const id = `${p.space}@${p.side}${mode === 'avoid' ? '!' : ''}`, cur = d.placements.find(x => x.id === id);
    const rec = { id, space: p.space, side: p.side, mode, priority: meta.priority, source: meta.source, verification: meta.verification, ...(meta.originalText ? { originalText: meta.originalText } : {}), ...(meta.priorityCapped ? { priorityCapped: true } : {}), active: true, history: cur?.history || [] };
    if (cur) { if (SOURCE_RANK[meta.source] < SOURCE_RANK[cur.source]) return; cur.history.push({ priority: cur.priority, source: cur.source }); Object.assign(cur, rec); } else d.placements.push(rec);
    pushLog(d, { op: cur ? 'placement_changed' : 'placement_added', id, source: meta.source, originalText: meta.originalText });
  });
}
/** علاقة/جهة بفراغ عدده صفر أو غير موجود تُعطَّل (لا تُحذف): تعود فاعلة إن عاد الفراغ؛ وما أخرجه العميل بحسم تعارض يبقى معطّلًا. */
function refreshActive(d) {
  const present = id => !!ANCHORS[id] || d.spaces.some(s => s.id === id && s.count > 0);
  for (const r of d.relations) { r.active = !r.resolvedOut && present(r.from) && present(r.to); if (!r.active) r.inactiveReason = r.resolvedOut ? 'تنازل العميل عنه لحسم تعارض' : 'أحد الطرفين غير موجود في البرنامج'; else delete r.inactiveReason; }
  for (const p of d.placements) { p.active = !p.resolvedOut && present(p.space); if (!p.active) p.inactiveReason = p.resolvedOut ? 'تنازل العميل عنه لحسم تعارض' : 'الفراغ غير موجود في البرنامج'; else delete p.inactiveReason; }
}

// ------------------------------------------------------------------------------------------ الأسرة والتفضيلات
const PREF_SUPPORT = { privacy: 'pref.privacy', naturalLight: 'pref.naturalLight', budgetRange: 'pref.budget', parkingCount: 'pref.parking', kitchenStyle: 'pref.kitchenStyle' };
const PREF_VALUES = { kitchenStyle: ['open', 'closed', 'open_to_hall'] };
/** يضبط حقلًا في household أو preferences أو preferences.features مع مصدره. المسار مثل 'household.currentMembers'. */
export function setField(brief, path, value, meta) {
  const m = makeMeta(meta), [root, key] = path.split('.');
  if (!['household', 'preferences', 'features'].includes(root) || !key) throw Error('مسار غير صالح: ' + path);
  if (root === 'preferences' && PREF_VALUES[key] && !PREF_VALUES[key].includes(value)) throw Error('قيمة غير صالحة لـ' + key);
  return mutate(brief, d => {
    const target = root === 'household' ? d.household : root === 'preferences' ? d.preferences : d.preferences.features;
    const full = root === 'features' ? 'preferences.features.' + key : path, cur = d.provenance[full];
    if (cur && SOURCE_RANK[m.source] < SOURCE_RANK[cur.source] && target[key] !== undefined) { pushLog(d, { op: 'field_ignored_lower_source', path: full, source: m.source }); return; }
    const sid = root === 'preferences' ? PREF_SUPPORT[key] : root === 'features' ? 'pref.' + key : null;
    const unsupported = sid && supportOf(sid) === 'unsupported';
    const before = target[key];
    target[key] = value;
    const hist = [...(cur?.history || []), ...(before !== undefined ? [{ value: before, source: cur?.source, ...(cur?.originalText ? { originalText: cur.originalText } : {}) }] : [])];
    d.provenance[full] = { ...m, verification: unsupported ? 'unsupported' : m.verification, history: hist };
    pushLog(d, { op: 'field_set', path: full, value, source: m.source, originalText: m.originalText });
  });
}
export const fieldMeta = (brief, path) => brief.provenance[path] || null;
export const fieldValue = (brief, path) => { const [root, key] = path.split('.'); return (root === 'household' ? brief.household : root === 'preferences' ? brief.preferences : brief.preferences.features)[key]; };

// ------------------------------------------------------------------------------------------ التعارضات
const CONTRA = [['near', 'separate'], ['direct_access', 'separate'], ['same_floor', 'different_floor']];
/** تعارضات مشتقة من حالة الملف (دالة نقية): تتغير بتغيّر الملف وتختفي بالحل. القرارات المحسومة في brief.resolved. */
export function deriveConflicts(d) {
  const out = [], solved = new Set((d.decisions || []).filter(x => x.conflictId && x.status === 'confirmed').map(x => x.conflictId));
  const add = c => { if (!solved.has(c.id)) out.push(c); };
  const activeRel = (d.relations || []).filter(r => r.active !== false && r.verification !== 'unsupported'), act = (d.placements || []).filter(p => p.active !== false);
  const mand = items => items.some(i => i.priority === 'mandatory');
  for (const [a, b] of CONTRA) for (const x of activeRel.filter(r => r.relation === a)) for (const y of activeRel.filter(r => r.relation === b)) {
    const same = (x.from === y.from && x.to === y.to) || (x.from === y.to && x.to === y.from); if (!same) continue;
    add({ id: `c:rel:${x.id}~${y.id}`, type: 'relation-contradiction', reason: `بندان لا يجتمعان: «${describeRelation(x)}» و«${describeRelation(y)}».`, affectedRequirements: ['relation:' + x.id, 'relation:' + y.id], mandatory: mand([x, y]),
      options: [{ id: 'keep:' + x.id, ar: `أبقِ «${describeRelation(x)}»` }, { id: 'keep:' + y.id, ar: `أبقِ «${describeRelation(y)}»` }] });
  }
  const OPP = { front: 'back', back: 'front', n: 's', s: 'n', e: 'w', w: 'e', left: 'right', right: 'left' };
  for (const p of act.filter(p => p.mode !== 'avoid')) for (const q of act.filter(q => q.mode !== 'avoid' && q.space === p.space && q.id > p.id)) {
    if (OPP[p.side] === q.side) add({ id: `c:place:${p.id}~${q.id}`, type: 'place-opposite', reason: `«${nameOf(p.space)}» مطلوب في ${SIDE_AR[p.side]} وفي ${SIDE_AR[q.side]} معًا.`, affectedRequirements: ['placement:' + p.id, 'placement:' + q.id], mandatory: mand([p, q]), options: [{ id: 'keep:' + p.id, ar: `${nameOf(p.space)} في ${SIDE_AR[p.side]}` }, { id: 'keep:' + q.id, ar: `${nameOf(p.space)} في ${SIDE_AR[q.side]}` }] });
  }
  for (const p of act.filter(p => p.mode === 'avoid')) for (const q of act.filter(q => q.mode !== 'avoid' && q.space === p.space && q.side === p.side))
    add({ id: `c:place:${p.id}~${q.id}`, type: 'place-avoid', reason: `«${nameOf(p.space)}» مطلوب في ${SIDE_AR[q.side]} ومطلوب ألا يطل عليه.`, affectedRequirements: ['placement:' + p.id, 'placement:' + q.id], mandatory: mand([p, q]), options: [{ id: 'keep:' + p.id, ar: `لا يطل على ${SIDE_AR[p.side]}` }, { id: 'keep:' + q.id, ar: `في ${SIDE_AR[q.side]}` }] });
  const floors = d.land?.floors || 1;
  for (const s of d.spaces || []) if (s.count > 0 && s.floorPreference === 1 && floors === 1)
    add({ id: `c:floor:${s.id}`, type: 'single-floor-two-floor-features', reason: `«${nameOf(s.type)}» مطلوب في الدور العلوي وأرضك المختارة بدور واحد.`, affectedRequirements: ['space:' + s.id, 'land.floors'], mandatory: s.priority === 'mandatory',
      options: [{ id: 'ground:' + s.id, ar: `ضع «${nameOf(s.type)}» في الدور الأرضي` }, { id: 'edit_land', ar: 'عدّل الأرض إلى دورين (من مرحلة الأرض)', needsLandStep: true }] });
  const said = d.preferences?.features?.floorsSaid;
  if (said && said !== floors) add({ id: 'c:floors', type: 'floors-mismatch', reason: `بيانات الأرض ${floors === 2 ? 'دورين' : 'دور واحد'} وكلامك يقول ${said === 2 ? 'دورين' : 'دور واحد'}.`, affectedRequirements: ['land.floors', 'preferences.features.floorsSaid'], mandatory: true,
    options: [{ id: 'follow_land', ar: `اتبع بيانات الأرض (${floors === 2 ? 'دورين' : 'دور واحد'})` }, { id: 'edit_land', ar: 'عدّل عدد الأدوار من مرحلة الأرض', needsLandStep: true }] });
  return out;
}
/** يحسم تعارضًا بخيار من خياراته ويسجّل القرار. 'edit_land' يعيد الملف كما هو مع قرار معلّق (pending) يطلب العودة لمرحلة الأرض. */
export function resolveConflict(brief, conflictId, optionId, { originalText } = {}) {
  const c = brief.conflicts.find(x => x.id === conflictId); if (!c) throw Error('تعارض غير موجود.');
  const opt = c.options.find(o => o.id === optionId); if (!opt) throw Error('خيار غير معروف.');
  return mutate(brief, d => {
    if (optionId === 'edit_land') { d.decisions.push({ id: 'd' + (d.decisions.length + 1), description: 'العميل يعدّل الأرض إلى دورين من مرحلة الأرض؛ يُراجع الملف بعد التغيير.', status: 'pending', conflictId: conflictId + '#pending' }); pushLog(d, { op: 'conflict_needs_land_step', conflictId }); return; }
    const [kind, ...rest] = optionId.split(':'), id = rest.join(':');
    if (kind === 'keep') {
      for (const ref of c.affectedRequirements) { const [k, i] = [ref.split(':')[0], ref.split(':').slice(1).join(':')]; if (i === id) continue; const list = k === 'relation' ? d.relations : d.placements; const idx = list.findIndex(x => x.id === i); if (idx >= 0) { list[idx].resolvedOut = true; } }
    } else if (kind === 'follow_land') { delete d.preferences.features.floorsSaid; delete d.provenance['preferences.features.floorsSaid']; }
    else if (kind === 'ground') { const s = d.spaces.find(x => x.id === id); if (s) { (s.history ||= []).push({ floorPreference: s.floorPreference, source: s.source }); s.floorPreference = 0; s.source = 'client_confirmed'; s.verification = 'confirmed'; } }
    d.decisions.push({ id: 'd' + (d.decisions.length + 1), description: `حسم تعارض: ${opt.ar}`, status: 'confirmed', conflictId });
    pushLog(d, { op: 'conflict_resolved', conflictId, optionId, source: 'client_confirmed', originalText });
  });
}
// ------------------------------------------------------------------------------------------ من استخراج النص (requirements.mjs) إلى الملف
const SUBJ_TO_SPACE = { majlis: 'male_majlis', majlis_w: 'female_majlis', kitchen: 'kitchen', dining: 'dining', hall: 'living', master: 'master', bedrooms: 'bedroom', elderly: 'elderly', guest: 'guest_room', maid: 'maid', driver: 'driver', office: 'office', prayer: 'prayer', laundry: 'laundry', storage: 'storage', stairs: 'stairs', entrance: 'entrance', kids: 'bedroom', onebed: 'bedroom' };
const normQ = t => String(t || '').replace(/[ةه]/g, 'ه').replace(/[أإآ]/g, 'ا');
const RULE_REL = { adjacent: 'direct_access', near: 'near', far: 'separate', apart: 'separate' };
// قرائن اللزوم الصريحة فقط: «أبي/أريد» وحدها رغبة لا شرط (المواصفة §4: «قريب» يبقى تفضيلًا يحتاج توضيحًا)
const STRONG = /(?<![\u0600-\u06FF])(?:لازم|ضروري|ضروريا|يجب|يلزم|لا ?بد|اكيد|الزامي|شرط|بالضبط)(?![\u0600-\u06FF])|(?<![a-z])(?:must|required|mandatory|exactly)(?![a-z])/;
const WEAK = /(?:مو|مب|ليس|غير|مش) ?(?:شرط|ضروري|لازم)|اختياري|لو امكن|اذا امكن|ان امكن|قدر الامكان|optional|if possible/;
/** عبارة العميل (المطبَّعة) التي وردت فيها القاعدة: من الفاصل السابق إلى اللاحق. */
function clauseOf(text, r) {
  const t = normalizeAr(text); if (!Array.isArray(r.at)) return normalizeAr(r.quote || '');
  const L = t.slice(0, r.at[0]).split(/[،,.؛;\n!?؟]/).pop(), R = t.slice(r.at[1]).split(/[،,.؛;\n!?؟]/)[0];
  return L + t.slice(r.at[0], r.at[1]) + R;
}
/** درجة قاعدة المحرك ← أولوية الملف: إلزامي فقط بقرينة لزوم صريحة، و«مو شرط/لو أمكن» قابل للتنازل، وغير ذلك تفضيل. */
export function priorityOfRule(r, clause = '') {
  const c = clause || normalizeAr(r.quote || '');
  if (WEAK.test(c) || r.level === 'prefer') return WEAK.test(c) ? 'flexible' : 'preferred';
  return STRONG.test(c) ? 'mandatory' : 'preferred';
}
/**
 * يدمج ناتج extractRequirements(text) في الملف بمصدره (حديث حر ← needs_confirmation). لا يُنشئ إلزامًا مؤكدًا من الاستخراج.
 * source: 'client_free_text' (الافتراضي) أو 'ai_inference' لناتج الذكاء. يعيد { brief, unsupported[], unclear[], added[] }.
 */
export function applyExtraction(brief, req, text, { source = 'client_free_text' } = {}) {
  let b = brief; const added = [], unsupported = [...(req.unsupported || [])];
  const quote = q => (q && String(q).trim()) || String(text || '').slice(0, 200);
  const sp = (type, count, extra = {}) => { b = upsertSpace(b, { type, count, source, priority: extra.priority || 'preferred', originalText: extra.originalText || String(text).slice(0, 200), ...extra }); added.push('space:' + type); };
  const c = req.counts || {};
  // أعداد: ما قاله العميل في كلامه عددًا صريحًا يُحسب إلزاميًا بعد التأكيد؛ ما لم يُذكر لا يُخمَّن
  const tc = req.textCounts || {};
  if (Number.isInteger(c.bedrooms) && c.bedrooms > 0) sp('bedroom', c.bedrooms, { priority: Number.isInteger(tc.bedrooms) ? 'mandatory' : 'preferred' });
  if (Number.isInteger(c.majlis)) { if (c.majlis === 0) sp('male_majlis', 0, { priority: 'mandatory' }); else { sp('male_majlis', 1); if (c.majlis > 1) sp('female_majlis', 1); } }
  if (Number.isInteger(c.dining)) sp('dining', c.dining);
  if (Number.isInteger(c.kitchens) && c.kitchens > 0) sp('kitchen', c.kitchens);
  if (Number.isInteger(c.halls) && c.halls > 0) sp('living', c.halls);
  if (Number.isInteger(c.baths) && c.baths > 0) sp('bath', c.baths);
  if (/ماستر|الرئيسي|master/i.test(String(text)) || req.prefs?.masterDressing) sp('master', 1);
  const ex = req.extras || {};
  for (const [k, type] of [['maid', 'maid'], ['driver', 'driver'], ['office', 'office'], ['prayer', 'prayer'], ['storage', 'storage'], ['laundry', 'laundry'], ['guestRoom', 'guest_room']])
    if (ex[k]) sp(type, 1, { options: isObj(ex[k]) ? { bath: !!ex[k].bath, ext: !!ex[k].ext, ...(ex[k].noBath ? { noBath: true } : {}) } : {} });
  for (const k of req.absent || []) { const type = { majlis: 'male_majlis', dining: 'dining', office: 'office', prayer: 'prayer', maid: 'maid', driver: 'driver' }[k]; if (type) { sp(type, 0, { priority: 'mandatory' }); if (k === 'majlis') sp('female_majlis', 0, { priority: 'mandatory' }); } }
  // مقاسات صريحة
  for (const [key, dm] of Object.entries(req.dims || {})) {
    const type = { majlis: 'male_majlis', kitchen: 'kitchen', dining: 'dining', master: 'master', bedroom: 'bedroom', hall: 'living' }[key]; if (!type || !dm) continue;
    b = upsertSpace(b, { type, count: spaceOf(b, type)?.count ?? 1, minClearWidthM: dm.w, minClearDepthM: dm.l, dimTolerance: dm.tol, source, priority: 'mandatory', originalText: quote(dm.quote) });
    added.push('dims:' + type);
  }
  // قواعد مكانية
  for (const r of req.rules || []) {
    const guestDining = x => x === 'dining' && /مقلط|مقالط/.test(normQ(r.quote || r.text));
    const a = guestDining(r.a) ? 'guest_dining' : SUBJ_TO_SPACE[r.a], bb = guestDining(r.b) ? 'guest_dining' : SUBJ_TO_SPACE[r.b]; if (!a) continue;
    // الفراغ الذي ذكره العميل في بند يعني أنه يريده: يُسجَّل ضمنًا (يحتاج تأكيد العدد) ولا تُخمَّن غرف النوم
    for (const x of [a, bb]) if (x && SPACE_TYPES[x] && x !== 'bedroom' && x !== 'bath' && !spaceOf(b, x)) { b = upsertSpace(b, { type: x, count: 1, implied: true, source, priority: 'preferred', originalText: quote(r.quote) }); added.push('space:' + x); }
    const meta = { source, priority: priorityOfRule(r, clauseOf(text, r)), originalText: quote(r.quote) };
    try {
      if (r.kind === 'place') { if (!SIDES.includes(r.side)) continue; b = addPlacement(b, { space: a, side: r.side, mode: r.mode === 'avoid' ? 'avoid' : r.mode === 'touch' ? 'touch' : r.mode === 'center' ? 'center' : 'zone', ...meta }); added.push(`placement:${a}@${r.side}`); }
      else if (r.kind === 'floor') { b = upsertSpace(b, { type: a, count: spaceOf(b, a)?.count ?? 1, floorPreference: r.floor === 'upper' ? 1 : 0, source, priority: meta.priority, originalText: meta.originalText }); added.push(`floor:${a}`); }
      else if (RULE_REL[r.kind] && bb) { b = addRelation(b, { from: a, to: bb, relation: RULE_REL[r.kind], detail: r.kind === 'far' ? 'far' : r.kind === 'apart' ? 'apart' : r.kind === 'adjacent' ? 'adjacent' : undefined, ...meta }); added.push(`relation:${a}|${bb}`); }
    } catch (e) { unsupported.push('تعذّر تسجيل بند: ' + (r.text || r.kind)); }
  }
  // تفضيلات منطقية
  const P = req.prefs || {};
  const flag = (k, v = true) => { b = setField(b, 'features.' + k, v, { source, priority: 'preferred', originalText: String(text).slice(0, 200) }); added.push('feature:' + k); };
  for (const k of ['allEnsuite', 'sharedBaths', 'masterDressing', 'familyEntrance', 'guestEntrance', 'womenSeparate', 'bathsOffHall', 'noCorridors', 'elderlyRoom']) if (P[k]) flag(k);
  if (P.glazing) flag('glazing', P.glazing);
  if (P.openKitchen === true) { b = setField(b, 'preferences.kitchenStyle', 'open', { source, priority: 'preferred', originalText: String(text).slice(0, 200) }); }
  else if (P.openKitchen === false) { b = setField(b, 'preferences.kitchenStyle', 'closed', { source, priority: 'preferred', originalText: String(text).slice(0, 200) }); }
  if (P.kitchenOpenHall) b = setField(b, 'preferences.kitchenStyle', 'open_to_hall', { source, priority: 'preferred', originalText: String(text).slice(0, 200) });
  if (P.parking) b = setField(b, 'preferences.parkingCount', 1, { source, priority: 'flexible', originalText: String(text).slice(0, 200) });
  if (P.floors) { /* عدد الأدوار من الأرض؛ كلام العميل المخالف يظهر تعارضًا في المراجعة لا تغييرًا للأرض */ b = setField(b, 'features.floorsSaid', P.floors, { source, priority: 'preferred', originalText: String(text).slice(0, 200) }); }
  if (req.tweaks && Object.keys(req.tweaks).length) b = setField(b, 'features.tweaks', req.tweaks, { source, priority: 'flexible', originalText: String(text).slice(0, 200) });
  if (req.site?.irregular) unsupported.push(`شكل الأرض (${req.site.shapeAr}): المحرك يقبل أرضًا مستطيلة فقط`);
  return { brief: b, unsupported, unclear: req.unclear || [], added };
}
