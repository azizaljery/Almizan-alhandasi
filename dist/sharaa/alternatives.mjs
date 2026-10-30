// شرعاء V2 — عند عجز المحرك: تمييز ثلاث نتائج (مستحيل هندسيًا / يخالف اشتراطًا نظاميًا / لم يجد المحرك حلًا بعد) ثم اقتراحات بديلة بضغطة.
// القواعد: لا يُدّعى الاستحالة إلا بحكم PROVEN_INFEASIBLE من المحرك نفسه؛ لا يُنفَّذ خيار إلا بضغط العميل (applyAlternative)؛
// خيار يمسّ بندًا إلزاميًا غير مُتنازَل عنه مسبقًا لا يُعرض كخيار تلقائي بل في مجموعة منفصلة تحتاج موافقة صريحة.
import * as B from './brief.mjs';
import { toEngineInput } from './adapter.mjs';
import { toClientAr, clientLint } from '../client-language.mjs';
// (تكامل R21) قاعدة R21 (مقترح 08): لا نص استثناء داخلي للعميل — رسالة المحرك العربية المعروفة (VILLA_*) بلغة العميل، وإلا لا شيء (كما clientErr في design.mjs)
const clientMsg = e => { const m = String(e?.message || ''); if (!/^VILLA_/.test(String(e?.code || '')) || !/[\u0600-\u06FF]/.test(m)) return ''; const t = toClientAr(m); return clientLint(t).length || /[A-Za-z]{4,}/.test(t) ? '' : t.slice(0, 160); };

export const OUTCOME = Object.freeze({ SOLVED: 'SOLVED', INFEASIBLE: 'PROVEN_INFEASIBLE', REGULATORY: 'REGULATORY_VIOLATION', INCOMPLETE: 'SEARCH_INCOMPLETE', ALL_HIDDEN: 'ALL_HIDDEN' });
const REASON_AR = { TIME_LIMIT: 'انتهى وقت البحث', SEARCH_EXHAUSTED_WITHOUT_PROOF: 'استنفد المحرك ما جرّبه دون أن يجد حلًا ودون أن يثبت استحالته', SOLVER_ERROR: 'تعثّر المحرك داخليًا', UNSUPPORTED_CASE: 'حالة لا يدعمها المحرك' };

/** فحص نظامي قبل المحرك: طلب يخالف اشتراطًا نظاميًا متحققًا (regulations-sa). ليس استحالة هندسية ولا فشل بحث. */
export function preflight(brief) {
  const reg = brief.conflicts.filter(c => c.type === 'regulatory-violation');
  if (!reg.length) return null;
  return { kind: OUTCOME.REGULATORY, title_ar: 'يخالف اشتراطًا نظاميًا', detail_ar: reg.map(c => c.reason), conflicts: reg.map(c => c.id), retryable: false, noteTier: 'اشتراط نظامي متحقق (المستوى أ)' };
}
/**
 * يصنّف نتيجة المحاولة. result: ناتج generateInitialDesign (نجاح) أو الخطأ المرمي منه (خطأ المحرك الثالث يحمل .result و.report_ar و.counterfactual).
 * لا يرفع أي حالة إلى «مستحيل» ما لم يقلها المحرك بدليل.
 */
export function classifyOutcome(result, brief) {
  const pre = brief && preflight(brief); if (pre) return pre;
  if (result && !(result instanceof Error) && !result.status) {
    const alts = result.alternatives || [], vis = alts.filter(x => x.presentation?.status !== 'hidden');
    const hidden = [...(result.hidden || result.alternativesInfo?.hidden || []).map(h => ({ reasons_ar: h.reasons_ar || [] })), ...alts.filter(x => x.presentation?.status === 'hidden').map(x => ({ reasons_ar: x.presentation.hidden_ar || [] }))], shown = vis.length;
    if (shown > 0) return { kind: OUTCOME.SOLVED, title_ar: 'وُجد تصميم', shown, hiddenCount: hidden.length };
    if (hidden.length) return { kind: OUTCOME.ALL_HIDDEN, title_ar: 'وُجدت تصاميم لكنها حُجبت', detail_ar: hidden.map(h => (h.reasons_ar || [])[0]).filter(Boolean), reasons: hidden.flatMap(h => h.reasons_ar || []), note_ar: 'لم يُثبت المحرك استحالة؛ كل تصميم وُجد خالف بندًا إلزاميًا من طلبك أو رسب في بوابة مراجعة، فلم يُعرض.', retryable: false };
    return { kind: OUTCOME.INCOMPLETE, title_ar: 'لم يجد المحرك حلًا بعد', reason: 'SEARCH_EXHAUSTED_WITHOUT_PROOF', detail_ar: [REASON_AR.SEARCH_EXHAUSTED_WITHOUT_PROOF], retryable: false };
  }
  const r = result?.result || result; // خطأ بـ.result أو ناتج generate() نفسه
  if (r?.status === 'PROVEN_INFEASIBLE') return { kind: OUTCOME.INFEASIBLE, title_ar: 'مستحيل هندسيًا (بدليل من المحرك)', detail_ar: [result.report_ar || result.message || ''].filter(Boolean), proof: r.proofReference || [], conflictingConstraintIds: r.conflictingConstraintIds || [], retryable: false, engineOptions: r.suggestions || [] };
  if (r?.status === 'SEARCH_INCOMPLETE') return { kind: OUTCOME.INCOMPLETE, title_ar: 'لم يجد المحرك حلًا بعد', reason: r.reason, detail_ar: [(REASON_AR[r.reason] || r.reason) + '. هذا لا يعني أن الطلب مستحيل.'], retryable: !!r.retryable, diagnosticId: r.diagnosticId, counterfactual: result.counterfactual || [] };
  return { kind: OUTCOME.INCOMPLETE, title_ar: 'لم يجد المحرك حلًا بعد', reason: 'SOLVER_ERROR', detail_ar: [('خطأ غير مصنّف من المحرك؛ لا يُعدّ استحالة. ' + clientMsg(result)).trim()], retryable: true };
}

// ------------------------------------------------------------------------------------------ كتالوج التنازلات
const ct = (b, id) => B.countOf(b, id) ?? 0;
/** كل خيار: { id, group, label, changes_ar, loses_ar, touches: [refs], apply(brief) }. التنازل «مسبق» إن اختاره العميل في سؤال الأولويات. */
function catalogue(b) {
  const L = [], tw = (k, v, label) => (d) => B.setField(d, 'features.tweaks', { ...(d.preferences.features.tweaks || {}), [k]: v }, { source: 'client_confirmed', priority: 'flexible', originalText: label });
  const C = { source: 'client_confirmed', priority: 'preferred' };
  L.push({ id: 'smaller_rooms', label: 'تصغير مساحات الغرف نحو 10٪', changes_ar: 'يُرسم المبنى بنحو 90٪ من المقاسات التصميمية المعتادة وغرف النوم 95٪ (قيمة «اقتصادي» في الميزان).', loses_ar: 'غرف أضيق قليلًا؛ مقاساتك الصريحة لا تُمَس.', touches: [], apply: d => B.setField(d, 'features.tweaks', { ...(d.preferences.features.tweaks || {}), envScale: .9, bedroomScale: .95 }, { ...C, priority: 'flexible', originalText: 'قبول مساحات أصغر' }) });
  if (ct(b, 'bedroom') > 1) L.push({ id: 'fewer_bedrooms', label: `تقليل غرف النوم إلى ${ct(b, 'bedroom') - 1}`, changes_ar: `غرف النوم ${ct(b, 'bedroom')} ← ${ct(b, 'bedroom') - 1}.`, loses_ar: 'غرفة نوم أقل.', touches: ['space:bedroom'], apply: d => B.upsertSpace(d, { type: 'bedroom', count: ct(d, 'bedroom') - 1, ...C, priority: 'mandatory', originalText: 'قبول غرفة نوم أقل' }) });
  if (ct(b, 'bath') > 1) L.push({ id: 'fewer_baths', label: `تقليل دورات المياه إلى ${ct(b, 'bath') - 1}`, changes_ar: `دورات المياه ${ct(b, 'bath')} ← ${ct(b, 'bath') - 1}.`, loses_ar: 'دورة مياه أقل (قد تُشارَك بين الغرف).', touches: ['space:bath'], apply: d => B.upsertSpace(d, { type: 'bath', count: ct(d, 'bath') - 1, ...C, priority: 'mandatory', originalText: 'قبول دورة مياه أقل' }) });
  if (ct(b, 'living') > 0) L.push({ id: 'smaller_hall', label: 'تقليل مساحة الصالة نحو 20٪', changes_ar: 'الصالة 80٪ من مقاسها التصميمي.', loses_ar: 'صالة أضيق.', touches: B.spaceOf(b, 'living')?.minClearWidthM ? ['space:living'] : [], apply: d => B.setField(d, 'features.tweaks', { ...(d.preferences.features.tweaks || {}), hallScale: .8 }, { ...C, priority: 'flexible', originalText: 'قبول صالة أصغر' }) });
  if (ct(b, 'female_majlis') > 0) L.push({ id: 'one_majlis', label: 'الاكتفاء بمجلس واحد', changes_ar: 'حذف مجلس النساء.', loses_ar: 'لا مجلس مستقل للنساء.', touches: ['space:female_majlis'], apply: d => B.upsertSpace(d, { type: 'female_majlis', count: 0, ...C, priority: 'mandatory', originalText: 'قبول مجلس واحد' }) });
  else if (ct(b, 'male_majlis') > 0) L.push({ id: 'drop_majlis', requiresConsent: true, recommended: false, confirmQ_ar: 'هل ترغب بالاستغناء عن المجلس مقابل حل الحجب؟', label: 'حذف المجلس (الاستقبال في الصالة)', changes_ar: 'المجالس 1 ← 0.', loses_ar: 'لا مجلس منفصل للضيوف.', touches: ['space:male_majlis'], apply: d => B.upsertSpace(d, { type: 'male_majlis', count: 0, ...C, priority: 'mandatory', originalText: 'قبول بلا مجلس' }) });
  if (ct(b, 'dining') > 0) L.push({ id: 'drop_dining', label: 'حذف غرفة الطعام المنفصلة', changes_ar: 'الطعام ← يُؤكل في الصالة.', loses_ar: 'لا غرفة طعام مستقلة.', touches: ['space:dining'], apply: d => B.upsertSpace(d, { type: 'dining', count: 0, ...C, priority: 'mandatory', originalText: 'قبول بلا غرفة طعام' }) });
  const extras = ['maid', 'driver', 'office', 'prayer', 'laundry', 'storage', 'guest_room'].filter(x => ct(b, x) > 0);
  if (extras.length) L.push({ id: 'drop_extras', label: 'حذف الفراغات الإضافية', changes_ar: 'حذف: ' + extras.map(B.nameOf).join('، ') + '.', loses_ar: 'لا ' + extras.map(B.nameOf).join(' ولا ') + '.', touches: extras.map(x => 'space:' + x), apply: d => extras.reduce((a, x) => B.upsertSpace(a, { type: x, count: 0, ...C, priority: 'mandatory', originalText: 'قبول بلا ' + B.nameOf(x) }), d) });
  if (b.land.floors === 2 && ct(b, 'bedroom') > 0) L.push({ id: 'to_upper', label: 'نقل غرف النوم إلى الدور الأول', changes_ar: 'غرف النوم في الدور العلوي.', loses_ar: 'سلم داخلي، وغرف النوم ليست في الأرضي.', touches: B.spaceOf(b, 'bedroom')?.floorPreference === 0 ? ['space:bedroom'] : [], apply: d => B.upsertSpace(d, { type: 'bedroom', count: ct(d, 'bedroom'), floorPreference: 1, ...C, priority: 'preferred', originalText: 'قبول غرف النوم في الدور الأول' }) });
  else if (b.land.floors === 1) L.push({ id: 'to_upper', label: 'نقل غرف إلى الدور الأول', changes_ar: 'يلزم دوران.', loses_ar: 'أرضك المختارة بدور واحد: يتغير ذلك من مرحلة الأرض لا من شرعاء.', touches: [], needsLandStep: true, apply: null });
  if (B.fieldValue(b, 'preferences.parkingCount') > 0) L.push({ id: 'drop_parking_ask', label: 'إلغاء طلب المواقف', changes_ar: 'يُحذف طلب المواقف من ملفك.', loses_ar: 'المحرك قد يبقي افتراضه الخاص للمواقف؛ التحكم فيه غير مدعوم.', touches: [], apply: d => B.setField(d, 'preferences.parkingCount', 0, { ...C, priority: 'flexible', originalText: 'سحب طلب المواقف' }) });
  if (b.preferences.features.guestEntrance) L.push({ id: 'drop_guest_entrance', label: 'التخلي عن المدخل المستقل لمجلس الرجال', changes_ar: 'يدخل الضيوف من مدخل العائلة أو الجانب بحسب المحرك.', loses_ar: 'خصوصية أقل بين الضيوف والعائلة.', touches: b.provenance['preferences.features.guestEntrance']?.priority === 'mandatory' ? ['feature:guestEntrance'] : [], apply: d => B.dropItem(d, 'feature:guestEntrance') });
  L.push({ id: 'accept_parallel_parking', hiddenOnly: 'parking', requiresConsent: true, label: 'قبول موقف موازٍ للشارع في الارتداد', changes_ar: 'يُسمح للميزان بموقف موازٍ للشارع بدل العمودي (5.5 م) حين لا يتسع العمودي، فتُرسل عبارة «موقف موازي» التي يقرؤها المحرك.', loses_ar: 'قد تقف السيارة أمام نافذة (خصوصية وإطلالة أقل)، ويبقى العدد نظاميًا لا يتحكم فيه العميل.', touches: [], apply: d => B.setField(d, 'features.parkingParallel', true, { source: 'client_confirmed', priority: 'preferred', originalText: 'قبول موقف موازٍ للشارع' }) });
  if (ct(b, 'male_majlis') > 0) L.push({ id: 'majlis_separate_dining', hiddenOnly: 'door', requiresConsent: true, label: 'فصل المجلس عن غرفة الطعام (لا يلزم تلاصقهما)', changes_ar: 'يُعفى شرط وصلة الضيافة بين المجلس والطعام، فتُرسل عبارة «مجلس منفصل عن الطعام» التي يقرؤها المحرك.', loses_ar: 'قد لا يلامس الطعام المجلس بباب خدمة، فتُقدَّم الضيافة من مسار آخر.', touches: [], apply: d => B.setField(d, 'features.guestLinkSeparate', true, { source: 'client_confirmed', priority: 'preferred', originalText: 'فصل المجلس عن الطعام' }) });
  return L;
}
/** خيارات تخفيف بنود الملف الصلبة (إلزامي ← تفضيل): دائمًا تمس إلزاميًا، وتُوسم «ينجح بتجربة المحرك» إن ثبت بالبحث المضاد. */
function relaxOptions(b, outcome) {
  const e = toEngineInput(b), cf = new Map((outcome.counterfactual || []).map(c => [c.id, c]));
  return e.requirements.rules.filter(r => r.level === 'must' || r.level === 'forbid').map(r => {
    const c = cf.get(r.id);
    return { id: 'relax:' + r.briefRef, group: 'mandatory', label: `تخفيف «${r.text}» إلى تفضيل`, changes_ar: 'يصير البند تفضيلًا يحاول المحرك تحقيقه ولا يلتزم به.', loses_ar: 'قد لا يتحقق هذا البند في التصميم.', touches: [r.briefRef], engineVerified: c ? c.ok : null, apply: d => B.decide(d, r.briefRef, { priority: 'preferred', confirm: true }) };
  });
}

/**
 * قائمة الخيارات مرتبة بحسب «الأولويات القابلة للتنازل» التي أجابها العميل (features.waivable)، ثم بقية التنازلات غير الإلزامية.
 * { auto: [...], needsConsent: [...], info: [...] } — needsConsent تمس شرطًا إلزاميًا ولا تُنفَّذ إلا بموافقة صريحة ثانية.
 * لا يُنفَّذ أي منها هنا؛ التنفيذ في applyAlternative عند الضغط.
 */
export function buildAlternatives(brief, outcome) {
  if (!outcome || outcome.kind === OUTCOME.SOLVED) return { auto: [], needsConsent: [], info: [] };
  if (outcome.kind === OUTCOME.REGULATORY) return { auto: [], needsConsent: [], info: [{ id: 'follow_regulation', label: 'التزم بالحد النظامي', changes_ar: 'يُسحب الطلب المخالف من ملفك.', loses_ar: 'لا يمكن التصميم بما يخالف الاشتراط.', conflictIds: outcome.conflicts }] };
  const waive = new Set(brief.preferences.features.waivable || []), order = [...waive];
  const MAP = { smaller_rooms: 'smaller_rooms', fewer_bedrooms: 'fewer_bedrooms', fewer_baths: 'fewer_baths', smaller_hall: 'smaller_hall', one_majlis: 'drop_majlis', drop_majlis: 'drop_majlis', drop_dining: 'drop_dining', to_upper: 'to_upper', drop_extras: 'drop_extras' };
  let all = catalogue(brief).map(o => ({ ...o, group: 'auto', preConsented: waive.has(MAP[o.id]) }));
  // ALL_HIDDEN: ربط الأسباب بالمفاتيح التي يملكها العميل فقط؛ ما لا مفتاح له يُعلن «غير مدعوم»
  const info = [];
  const text = outcome.kind === OUTCOME.ALL_HIDDEN ? (outcome.reasons || []).join(' ') : '';
  const flags = { parking: /موقف/.test(text), door: /باب داخلي|بلا باب/.test(text) };
  all = all.filter(o => !o.hiddenOnly || (outcome.kind === OUTCOME.ALL_HIDDEN && flags[o.hiddenOnly]));
  if (flags.parking && brief.preferences.features.parkingParallel !== true) info.push({ id: 'parking-note', label: 'سبب الحجب مواقف السيارات', changes_ar: 'المحرك يضع الموقف الموازي أمام نافذة حين لا يتسع العمودي؛ لا خيار لتحديد مكانه.', loses_ar: 'المتاح فقط قبول الموقف الموازي (في قائمة الموافقة) أو تغيير الأرض.', touches: [], apply: null });
  if (flags.door && brief.preferences.features.guestLinkSeparate !== true) info.push({ id: 'door-note', label: 'سبب الحجب باب داخلي للمجلس', changes_ar: 'المحرك لا يقبل مجلسًا لا يتصل بفراغ داخلي؛ لا مفتاح لباب داخلي مباشرة.', loses_ar: 'المتاح فقط فصل المجلس عن الطعام (في قائمة الموافقة) أو حذف المجلس.', touches: [], apply: null });
  const rank = o => (o.preConsented ? order.indexOf(MAP[o.id]) : 1000);
  all.sort((x, y) => rank(x) - rank(y));
  const auto = [], needs = [];
  for (const o of all) {
    if (o.needsLandStep) { info.push(o); continue; }
    const touchesMand = o.touches.some(t => isMandatory(brief, t)) || !!o.requiresConsent, hold = touchesMand && !o.preConsented;
    (hold ? needs : auto).push({ ...o, group: hold ? 'mandatory' : 'auto', touchesMandatory: touchesMand });
  }
  if (flags.parking || flags.door) {
    const cav = 'تنبيه: هذا الخيار لا يعالج سبب الحجب المذكور مباشرة، وقد لا يغيّر النتيجة (قيس على أرض 25×12.5 و30×12.5 فبقيت التصاميم محجوبة).';
    for (const o of auto) if (!/majlis|parallel/.test(o.id)) o.caveat_ar = cav;
  }
  needs.sort((x, y) => (x.recommended === false) - (y.recommended === false));
  needs.push(...relaxOptions(brief, outcome).map(o => ({ ...o, touchesMandatory: true })));
  return { auto, needsConsent: needs, info };
}
function isMandatory(b, ref) {
  const [k, ...r] = ref.split(':'), id = r.join(':');
  if (k === 'space') return b.spaces.find(s => s.id === id)?.priority === 'mandatory';
  if (k === 'relation') return b.relations.find(s => s.id === id)?.priority === 'mandatory';
  if (k === 'placement') return b.placements.find(s => s.id === id)?.priority === 'mandatory';
  if (k === 'feature') return b.provenance['preferences.features.' + id]?.priority === 'mandatory';
  return false;
}
/** ينفّذ خيارًا واحدًا بضغط العميل ويسجّل قرارًا بما يتغير وما يُفقد. consent مطلوب صراحة لخيارات المجموعة الإلزامية. */
export function applyAlternative(brief, alts, optionId, { consent = false, confirmed = false } = {}) {
  const o = [...alts.auto, ...alts.needsConsent, ...alts.info].find(x => x.id === optionId);
  if (!o) throw Error('خيار غير موجود.');
  if (o.id === 'follow_regulation') { let b = brief; for (const c of brief.conflicts.filter(x => x.type === 'regulatory-violation')) b = B.resolveConflict(b, c.id, 'follow_regulation'); return b; }
  if (!o.apply) throw Error('هذا الخيار لا يُنفَّذ من هنا.');
  if (o.touchesMandatory && !o.preConsented && !consent) throw Error('الخيار يمس شرطًا إلزاميًا ويحتاج موافقتك الصريحة.');
  if (o.confirmQ_ar && confirmed !== true) throw Error('يلزم جوابك بنعم على: ' + o.confirmQ_ar);
  let b = o.apply(brief);
  b = structuredClone(b); b.decisions.push({ id: 'd' + (b.decisions.length + 1), description: `قبل العميل: ${o.label} — يتغير: ${o.changes_ar} — يُفقد: ${o.loses_ar}`, status: 'confirmed', alternativeId: o.id }); b.log.push({ seq: b.log.length + 1, op: 'alternative_applied', id: o.id, source: 'client_confirmed' });
  return b;
}
/** تنفيذ + إعادة المحاولة. generate: دالة غير متزامنة (engineInput) ← ناتج أو رمي خطأ. يعيد { brief, outcome }. */
export async function retryWith(brief, alts, optionId, generate, opts = {}) {
  const b = applyAlternative(brief, alts, optionId, opts);
  const pre = preflight(b); if (pre) return { brief: b, outcome: pre };
  try { const out = await generate(toEngineInput(b)); return { brief: b, outcome: classifyOutcome(out, b), result: out }; }
  catch (e) { return { brief: b, outcome: classifyOutcome(e, b), error: e }; }
}
