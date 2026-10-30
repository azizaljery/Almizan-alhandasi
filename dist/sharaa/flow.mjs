// شرعاء V2 — مسار الحوار: ثلاثة مسارات (حديث حر، أسئلة موجهة، «ساعدني أقرر») على ملف احتياجات واحد (ArchitecturalBrief).
// وحدة نقية بلا DOM. الأرض لا تُسأل أبدًا: تأتي من مرحلة الأرض (normalizeLand) وتُستعمل في الخلفية فقط لاختيار الأسئلة.
// اختيار السؤال التالي بالأولوية الخمسية (المواصفة §5): 1 تعارض يمنع التصميم، 2 شرط إلزامي غامض، 3 ما يؤثر كثيرًا في التوزيع،
// 4 تفضيل مهم لم يُذكر، 5 تجميلي/تسجيلي. لا يُسأل ما أُجيب عنه ولا ما لا يغيّر قرارًا هندسيًا.
import { extractRequirements, unclearClauses } from '../requirements.mjs';
import { analyzeFeasibility } from '../feasibility.mjs';
import { AVOIDS, LIFE } from '../client-brief.mjs';
import * as B from './brief.mjs';
import { toEngineInput, supportRows } from './adapter.mjs';
import { normalizeImperatives, extractRegulatoryAsks } from './phrases.mjs';

export const SHARA_V2_WELCOME = 'أهلًا بك، خلّنا نصمم بيتًا يناسب حياتك.';
export const SHARA_V2_LAND_NOTE = 'عرفت بيانات أرضك من الخطوة السابقة. الآن أبي أفهم كيف تحب يكون منزلك، وأرتب احتياجاتك هندسيًا قبل ما نبدأ الرسم.';
export const READINESS = Object.freeze({ READY: 'READY_TO_GENERATE', CLARIFY: 'NEEDS_CLARIFICATION', CONFLICT: 'CONFLICT_REQUIRES_DECISION', LIMITED: 'LIMITED_SUPPORT' });
export const READINESS_AR = Object.freeze({ READY_TO_GENERATE: 'جاهز للتصميم', NEEDS_CLARIFICATION: 'ينقصني توضيح', CONFLICT_REQUIRES_DECISION: 'تعارض يحتاج قرارك', LIMITED_SUPPORT: 'جاهز مع قيود في الدعم' });
const SIDE_LABEL = { n: 'شمال', s: 'جنوب', e: 'شرق', w: 'غرب' };
const COUNT_FIELDS = Object.freeze([
  { id: 'bedrooms', label: 'غرف النوم (شاملةً الرئيسية)', min: 1, max: 10 }, { id: 'majlis', label: 'المجالس', min: 0, max: 2 }, { id: 'baths', label: 'دورات المياه', min: 0, max: 10 },
  { id: 'kitchens', label: 'المطابخ', min: 0, max: 2 }, { id: 'halls', label: 'الصالات', min: 0, max: 3 }, { id: 'dining', label: 'غرف الطعام', min: 0, max: 2 },
]);
const msg = (text, extra = {}) => ({ from: 'shara', text, ...extra });
const PRI_AR = { mandatory: 'لازم', preferred: 'تفضيل', flexible: 'قابل للتنازل' };

// ------------------------------------------------------------------------------------------ الأرض في الخلفية
/** شريط «أرضك المختارة»: من بيانات مرحلة الأرض فقط، دون افتراض قيم غير موجودة. */
export function landBar(brief) {
  const L = brief.land, rows = [
    { k: 'الأبعاد', v: `العرض ${L.widthM} م (شرق/غرب) × الطول ${L.depthM} م (شمال/جنوب)` }, { k: 'المساحة', v: `${L.areaM2} م²` },
    { k: 'الشوارع', v: L.streets.map(s => SIDE_LABEL[s.side] + (s.widthM ? ` (${s.widthM} م)` : '')).join('، ') || 'غير محدد' },
    { k: 'المدخل', v: L.entries.map(s => SIDE_LABEL[s]).join('، ') || 'غير محدد' }, { k: 'الأدوار', v: L.floors === 2 ? 'دوران' : 'دور واحد' },
  ];
  if (L.setbacks) rows.push({ k: 'الارتدادات', v: `أمامي ${L.setbacks.front} م، خلفي ${L.setbacks.rear} م، جانبيان ${L.setbacks.left}/${L.setbacks.right} م` + (L.setbacks.verified ? ' (نظامية متحققة)' : ' (الأمامي قيمة تصميمية افتراضية حتى يُعرف عرض الشارع)') });
  return { title: 'أرضك المختارة', subtitle: 'من المرحلة السابقة', revision: L.revision, rows, editable: true };
}
/** تضيّق الأرض على البرنامج الحالي؟ يقيسها كاشف الاستحالة نفسه (بلا بحث): AREA_TIGHT أو استحالة بدليل. لا حدّ رقمي مخترع. */
export function landTightness(brief) {
  const e = toEngineInput(brief);
  if (e.counts.bedrooms < 1) return { known: false, tight: false, why_ar: 'البرنامج لم يُحدَّد بعد.' };
  let f; try { f = analyzeFeasibility({ land: { ...e.land }, counts: e.counts, requirements: e.requirements, provisional: true }); } catch { return { known: false, tight: false, why_ar: 'تعذّر قياس الضيق.' }; }
  const w = (f.warnings || []).find(x => x.id === 'AREA_TIGHT');
  return { known: true, tight: !f.feasible || !!w, provenInfeasible: !f.feasible, numbers: f.numbers, why_ar: !f.feasible ? f.report_ar : w ? w.ar : 'المساحة تكفي بحسب كاشف الميزان.' };
}

// ------------------------------------------------------------------------------------------ الجاهزية (المواصفة §6)
/** يحدد حالة الجاهزية من الملف: تعارض > نقص > قيود دعم > جاهز. يعيد أسبابها. لا يغيّر الملف. */
export function assessReadiness(brief) {
  const e = toEngineInput(brief), reasons = [];
  const conflicts = brief.conflicts.map(c => ({ id: c.id, type: c.type, text_ar: c.reason }));
  const clarify = e.blockers.filter(b => b.type !== 'CONFLICT' && b.type !== 'FLOOR_CONFLICT');
  const countsDone = brief.interaction.completedTopics.includes('counts');
  if (!countsDone) clarify.unshift({ type: 'COUNTS_MISSING', text_ar: 'لم تحدَّد أعداد الغرف بعد.' });
  const unsupportedCount = e.report.unsupported.length, limited = e.report.limited, softened = e.report.softened;
  let state;
  if (conflicts.length) { state = READINESS.CONFLICT; reasons.push(...conflicts); }
  else if (clarify.length) { state = READINESS.CLARIFY; reasons.push(...clarify); }
  else if (unsupportedCount || limited.length) { state = READINESS.LIMITED; reasons.push(...e.report.unsupported.map(u => ({ type: 'UNSUPPORTED', text_ar: u.text_ar })), ...limited.map(l => ({ type: 'LIMITED', text_ar: l.text_ar }))); }
  else state = READINESS.READY;
  return { state, label_ar: READINESS_AR[state], reasons, canGenerate: state === READINESS.READY || state === READINESS.LIMITED, needsAck: state === READINESS.LIMITED, softened, assumptions: e.report.assumptions };
}

// ------------------------------------------------------------------------------------------ الملف الحي والمراجعة
const tag = it => (it.verification === 'confirmed' ? 'confirmed' : it.verification === 'unsupported' ? 'unsupported' : 'awaiting');
/** «ملف احتياجات المنزل»: ما فهمه شرعاء، وما أكده العميل، وما ينتظر قرارًا، والتعارضات، وغير المدعوم. */
export function liveProfile(brief) {
  const rows = supportRows(brief).filter(r => !r.inactive).map(r => ({ ...r, state: tag(r) }));
  const fields = Object.entries(brief.provenance).filter(([k]) => k !== 'land').map(([path, m]) => ({ ref: path, label: path, value: B.fieldValue(brief, path), source: m.source, priority: m.priority, verification: m.verification, state: tag(m) }));
  const asked = new Set(brief.interaction.asked);
  const missing = B.TOPICS.filter(t => !brief.interaction.completedTopics.includes(t.id) && !asked.has('topic:' + t.id)).map(t => t.ar);
  const asm = toEngineInput(brief).report.assumptions.map(a => ({ ref: a.id, label: a.text_ar, source: a.source, verification: brief.decisions.some(d => d.assumptionId === a.id) ? 'confirmed' : 'needs_confirmation' }));
  return { assumptions: asm, confirmed: rows.filter(r => r.state === 'confirmed'), awaiting: rows.filter(r => r.state === 'awaiting'), unsupported: rows.filter(r => r.state === 'unsupported'), fields,
    inactive: supportRows(brief).filter(r => r.inactive), conflicts: brief.conflicts, missingTopics: missing, unclear: brief.interaction.unclear || [], note_ar: 'لا يُرسل للمحرك شرطًا إلزاميًا إلا بعد تأكيدك.' };
}
/** المراجعة النهائية الموجزة عند «ابدأ التصميم»: الأرض، الغرف، العلاقات، الإلزامي، التفضيلات، الافتراضات. */
export function finalReview(brief) {
  const e = toEngineInput(brief), R = assessReadiness(brief);
  const rooms = brief.spaces.filter(s => s.count > 0 && SPACE(s)).map(s => `${B.nameOf(s.type)}${s.count > 1 ? ' × ' + s.count : ''}`);
  const rel = [...brief.relations.filter(r => r.active !== false && r.verification !== 'unsupported').map(B.describeRelation), ...brief.placements.filter(p => p.active !== false).map(B.describePlacement)];
  const mand = [...brief.spaces.filter(s => s.priority === 'mandatory' && s.verification === 'confirmed' && s.count !== undefined).map(s => `${B.nameOf(s.type)}: ${s.count}`),
    ...e.requirements.rules.filter(r => r.level === 'must' || r.level === 'forbid').map(r => r.text)];
  const pref = e.requirements.rules.filter(r => r.level === 'prefer').map(r => r.text);
  return { land: landBar(brief), rooms, relations: rel, mandatory: mand, preferences: pref, assumptions: e.report.assumptions, limits: [...e.report.limited, ...e.report.unsupported].map(x => x.text_ar), softened: e.report.softened.map(x => x.text_ar), readiness: R,
    lines_ar: [`الأرض: ${brief.land.widthM}×${brief.land.depthM} م`, `الغرف: ${rooms.join('، ') || 'لم تُحدَّد'}`, `العلاقات: ${rel.join('؛ ') || 'لا شيء'}`, `الشروط الإلزامية: ${mand.join('؛ ') || 'لا شيء'}`, `التفضيلات: ${pref.join('؛ ') || 'لا شيء'}`, `الافتراضات: ${e.report.assumptions.map(a => a.text_ar).join('؛ ') || 'لا شيء'}`] };
}
const SPACE = s => !!B.SPACE_TYPES[s.type];

// ------------------------------------------------------------------------------------------ تحويل فهم الذكاء إلى شكل المستخرج (مصدره ai_inference)
const AI_SPACE = { maid: 'maid', driver: 'driver', office: 'office', prayer: 'prayer', storage: 'storage', laundry: 'laundry', guestRoom: 'guestRoom' };
/** ناتج الذكاء (بعد sanitizeAiRequirements) ← شكل extractRequirements ليدخل الملف بمصدر ai_inference ولا يصير إلزاميًا. */
export function fromAiRequirements(ai) {
  if (!ai || typeof ai !== 'object') return null;
  const prefs = {}; for (const p of ai.prefs || []) { if (p === 'closedKitchen') prefs.openKitchen = false; else prefs[p] = true; }
  const extras = {}; for (const [k, v] of Object.entries(ai.extras || {})) if (AI_SPACE[k]) extras[k] = v && typeof v === 'object' ? v : true;
  return { counts: {}, extras, prefs, rules: (ai.rules || []).map((r, i) => ({ ...r, id: r.id || 'A' + (i + 1), level: 'must', levelCue: 'default' })), dims: {}, absent: [], unsupported: [], unclear: ai.unclear || [], textCounts: {} };
}

// ------------------------------------------------------------------------------------------ الجلسة
export class SharaFlow {
  /** land: ناتج normalizeLand(...).land من مرحلة الأرض. لا يُسأل العميل عنه. */
  constructor({ land, landId = 'land-1', mode = null } = {}) {
    this.brief = B.createBrief({ land, landId, mode: mode || 'free' });
    this.phase = 'mode'; this.log = []; this.moreQuestions = false; this.reviewed = false;
    if (mode) { this.#setMode(mode); this.phase = 'ask'; }
  }
  snapshot() { return JSON.parse(JSON.stringify({ brief: this.brief, phase: this.phase, more: this.moreQuestions, reviewed: this.reviewed })); }
  static restore(snap) { const f = Object.create(SharaFlow.prototype); Object.assign(f, { brief: snap.brief, phase: snap.phase, log: [], moreQuestions: !!snap.more, reviewed: !!snap.reviewed }); return f; }
  #push(list) { this.log.push(...list); return list; }
  #setMode(m) { if (!['free', 'guided', 'decide'].includes(m)) throw Error('اختيار غير معروف.'); this.brief = { ...this.brief, interaction: { ...this.brief.interaction, mode: m === 'free' ? 'free' : 'guided', path: m } }; }
  get mode() { return this.brief.interaction.path; }
  readiness() { return assessReadiness(this.brief); }
  engineInput() { return toEngineInput(this.brief); }
  profile() { return liveProfile(this.brief); }
  landBar() { return landBar(this.brief); }
  review() { return finalReview(this.brief); }

  start() {
    return this.#push([msg(SHARA_V2_WELCOME), msg(SHARA_V2_LAND_NOTE), msg('كيف تحب نبدأ؟ تقدر تغيّر المسار في أي وقت وما يضيع شيء من كلامك.', { kind: 'choice', id: 'mode', options: [{ id: 'free', label: 'أشرح فكرتي' }, { id: 'guided', label: 'اسألني أسئلة محددة' }, { id: 'decide', label: 'ساعدني أقرر' }] })]);
  }

  /** أرض جديدة من المرحلة السابقة: تُزاد المراجعة وتُراجع القيود المتأثرة ولا تُحذف الإجابات. */
  changeLand(newLand) {
    const before = this.brief.land.revision; this.brief = B.reviseLand(this.brief, newLand);
    if (this.brief.land.revision === before) return [];
    this.brief = { ...this.brief, interaction: { ...this.brief.interaction, asked: this.brief.interaction.asked.filter(k => !/^(entrances|priorities)/.test(k)) } };
    const n = this.brief.recheck.length;
    return this.#push([msg(`تغيّرت أرضك (المراجعة ${this.brief.land.revision}). إجاباتك محفوظة كلها، وأعدت مراجعة ${n} قيد يتعلق بالأرض${n ? ' — سأعرضها عليك للتأكيد' : ''}.`, { kind: 'list', items: this.brief.recheck.map(r => r.reason) }), ...this.#next()]);
  }

  answer(id, value) {
    if (id === 'mode') { this.#setMode(value); this.phase = 'ask'; this.brief = { ...this.brief, interaction: { ...this.brief.interaction, switched: (this.brief.interaction.switched || 0) + 1 } };
      if (value === 'free' && !this.brief.interaction.asked.includes('free')) { this.#mark('free'); return this.#push([msg('تحدّث معي بحرية عن بيتك وكيف تحب أن تعيش فيه — أكتب لك ما فهمته وأسألك عمّا ينقص فقط.', { kind: 'text', id: 'free' })]); }
      return this.#push(this.#next()); }
    if (id === 'free') return this.#push(this.#free(value));
    if (id === 'counts') return this.#push(this.#counts(value));
    if (id === 'ask') return this.#push(this.#applyAnswer(value?.key, value?.value));
    if (id === 'conflict') { this.brief = B.resolveConflict(this.brief, value.conflictId, value.optionId, { originalText: value.originalText }); return this.#push([msg('سجّلت قرارك.'), ...this.#next()]); }
    if (id === 'more') { this.moreQuestions = true; return this.#push(this.#next()); }
    if (id === 'start') { this.reviewed = true; const r = this.review(); return this.#push([msg('هذه مراجعة أخيرة موجزة قبل التصميم:', { kind: 'review', id: 'review', review: r })]); }
    if (id === 'go') { const R = this.readiness(); if (!R.canGenerate) throw Error('الملف غير جاهز: ' + R.label_ar); this.#approveAssumptions(); this.phase = 'ready'; return this.#push([msg('تم تسجيل احتياجاتك. اضغط «توليد التصميم» لأفتح لك تصميمًا أوليًا.', { kind: 'generate', id: 'generate', readiness: R.state })]); }
    throw Error('خطوة غير معروفة.');
  }
  #mark(key) { const a = this.brief.interaction.asked; if (!a.includes(key)) this.brief = { ...this.brief, interaction: { ...this.brief.interaction, asked: [...a, key] } }; }
  #topicDone(t) { const c = this.brief.interaction.completedTopics; if (!c.includes(t)) this.brief = { ...this.brief, interaction: { ...this.brief.interaction, completedTopics: [...c, t] } }; }
  #approveAssumptions() {
    const e = this.engineInput(); const d = structuredClone(this.brief);
    for (const a of e.report.assumptions) if (!d.decisions.some(x => x.assumptionId === a.id)) d.decisions.push({ id: 'd' + (d.decisions.length + 1), description: 'وافق العميل على الافتراض: ' + a.text_ar, status: 'confirmed', assumptionId: a.id });
    this.brief = d;
  }

  // ---------------------------------------------------------------------------------------- الحديث الحر
  #free(value) {
    const raw = String(typeof value === 'string' ? value : value?.text || '').trim();
    if (raw.length < 3) throw Error('اكتب وصفًا قصيرًا على الأقل.');
    const norm = normalizeImperatives(raw).text;
    const counts = value?.counts && typeof value.counts === 'object' ? value.counts : {};
    const req = extractRequirements(norm, { counts });
    const out = [], res = B.applyExtraction(this.brief, req, norm, { originalText: null }); this.brief = res.brief;
    this.brief = this.#regulatory(raw);
    if (value?.requirements) { const ai = fromAiRequirements(value.requirements); if (ai) this.brief = B.applyExtraction(this.brief, ai, raw, { source: 'ai_inference' }).brief; }
    const unclear = [...new Set([...(res.unclear || []), ...unclearClauses(raw).filter(c => !(normalizeImperatives(c).changed.length))])];
    if (unclear.length) this.brief = { ...this.brief, interaction: { ...this.brief.interaction, unclear: [...new Set([...(this.brief.interaction.unclear || []), ...unclear])] } };
    this.#mark('free');
    if (req.understood?.length) out.push(msg('فهمت من كلامك، وهذا ما أنتظر تأكيدك عليه قبل أن أعتمده شرطًا:', { kind: 'list', items: req.understood }));
    if (res.unsupported.length) out.push(msg('لن أطبّقه في هذا الإصدار (مسجّل في ملفك ومعلن لك):', { kind: 'list', items: res.unsupported }));
    if (unclear.length) out.push(msg('هذه العبارات لم أفهمها بدقة فلن أطبّقها كما هي. أعد كتابتها بصيغة مباشرة مثل «الماستر بعيدة عن الدرج»:', { kind: 'list', items: unclear.map(x => '«' + x + '»') }));
    for (const n of [...(value?.assumptions || []), ...(value?.questions || [])].filter(x => typeof x === 'string' && x.trim()).slice(0, 3)) out.push(msg(n));
    return [...out, ...this.#next()];
  }
  #regulatory(raw) {
    const a = extractRegulatoryAsks(raw); let b = this.brief;
    const m = { source: 'client_free_text', priority: 'mandatory', originalText: a.quote || raw.slice(0, 200) };
    if (a.coveragePct !== undefined) b = B.setField(b, 'features.requestedCoveragePct', a.coveragePct, m);
    if (a.setback) b = B.setField(b, 'features.requestedSetback', a.setback, m);
    return b;
  }

  /** طلب لاحق بعد التصميم («أبعد الماستر عن الدرج»): يعود إلى الملف نفسه ولا يُنشئ ملفًا جديدًا. لا وعد بإعادة توليد هنا. */
  followUp(text) {
    const raw = String(text || '').trim(); if (raw.length < 3) throw Error('اكتب الطلب.');
    const n = normalizeImperatives(raw), req = extractRequirements(n.text, { clauses: false });
    const res = B.applyExtraction(this.brief, req, n.text, { originalText: raw });
    this.brief = res.brief;
    const reg = extractRegulatoryAsks(raw), hasReg = Object.keys(reg).length > 0;
    if (hasReg) this.brief = this.#regulatory(raw);
    const added = res.added.filter(a => /^(relation|placement|floor|feature)/.test(a));
    const out = [];
    if (!added.length && !hasReg) {
      this.brief = { ...this.brief, interaction: { ...this.brief.interaction, unclear: [...new Set([...(this.brief.interaction.unclear || []), raw])] } };
      out.push(msg('لم أفهم هذا الطلب بدقة فلم أغيّر شيئًا في ملفك. أعد كتابته مثل «الماستر بعيدة عن الدرج».', { kind: 'list', items: ['«' + raw + '»'] }));
    } else out.push(msg('أضفت هذا الطلب إلى ملف احتياجاتك نفسه (نصه الأصلي محفوظ). أكّد درجته لأعتمده:', { kind: 'list', items: added.map(refText(this.brief)).filter(Boolean) }), ...this.#next());
    this.phase = 'ask'; this.reviewed = false; this.#push(out);
    return { messages: out, added, imperatives: n.changed, readiness: this.readiness(), engineInput: this.engineInput(), regeneration: 'غير متحقق: إعادة التوليد بعد التعديل خارج حدود هذه الوحدة (الملف والمحوّل فقط).' };
  }

  // ---------------------------------------------------------------------------------------- الأعداد
  #counts(value) {
    const v = {}; for (const f of COUNT_FIELDS) { const n = Number(value?.[f.id]); if (!Number.isInteger(n) || n < f.min || n > f.max) throw Error(`${f.label}: عدد صحيح بين ${f.min} و${f.max}.`); v[f.id] = n; }
    const m = { source: 'client_answer', priority: 'mandatory' };
    let b = this.brief; const up = (type, count) => { b = B.upsertSpace(b, { type, count, ...m, originalText: 'عدّلها العميل في نموذج الأعداد' }); };
    up('bedroom', v.bedrooms); up('male_majlis', v.majlis >= 1 ? 1 : 0); up('female_majlis', v.majlis >= 2 ? 1 : 0); up('bath', v.baths); up('kitchen', v.kitchens); up('living', v.halls); up('dining', v.dining);
    // أعداد صرّح بها العميل وكانت «ضمنية» تصير مؤكدة بنفسها بتأكيد النموذج
    this.brief = b; this.#topicDone('counts'); this.#mark('counts');
    return [msg('سجّلت الأعداد.'), ...this.#next()];
  }
  #countsMsg(why) {
    const g = id => { const s = B.spaceOf(this.brief, id); return s && s.count !== undefined ? s.count : ''; };
    const vals = { bedrooms: g('bedroom'), majlis: (B.countOf(this.brief, 'male_majlis') ?? '') === '' ? '' : (B.countOf(this.brief, 'male_majlis') > 0 ? 1 : 0) + (B.countOf(this.brief, 'female_majlis') > 0 ? 1 : 0), baths: g('bath'), kitchens: g('kitchen'), halls: g('living'), dining: g('dining') };
    return msg('كم تحتاج من كل نوع؟ عدّل الأرقام وأكّدها (ما فهمته من كلامك معبّأ مسبقًا).', { kind: 'counts', id: 'counts', key: 'counts', why, fields: COUNT_FIELDS.map(f => ({ ...f, value: vals[f.id] })) });
  }

  // ---------------------------------------------------------------------------------------- الأسئلة
  /** مرشحو الأسئلة الآن: [{ key, cls, topic, order, build }] — cls الأولوية الخمسية. */
  candidates() {
    const b = this.brief, asked = new Set(b.interaction.asked), out = [], mode = this.mode, L = b.land;
    const add = (key, cls, topic, order, build) => { if (!asked.has(key)) out.push({ key, cls, topic, order, build }); };
    const has = id => (B.countOf(b, id) ?? 0) > 0, known = id => B.countOf(b, id) !== null;
    const countsDone = b.interaction.completedTopics.includes('counts');
    // (1) تعارضات
    for (const c of b.conflicts) add('conflict:' + c.id, 1, 'priorities', 0, () => msg((c.type === 'regulatory-violation' ? 'هذا الطلب يخالف اشتراطًا نظاميًا: ' : 'عندي تعارض يمنعني من الرسم: ') + c.reason + (c.type === 'regulatory-violation' ? ' لن أصمم بما يخالفه.' : ' أيهما تعتمد؟'), { kind: 'choice', id: 'conflict', key: 'conflict:' + c.id, conflictType: c.type, why: 'تعارض يمنع التصميم', options: c.options.map(o => ({ id: o.id, label: o.ar, conflictId: c.id })) }));
    // (2) توضيح إلزامي/تفضيل غامض: بنود الملف غير المؤكدة
    const unconf = this.#unconfirmedItems();
    if (unconf.length) add('confirm:' + unconf.map(u => u.ref).join(','), 2, 'priorities', 0, () => msg('أكّد لي درجة كل بند فهمته من كلامك — لازم أم تفضيل؟ (لا أرسل للمحرك شرطًا إلزاميًا إلا بعد تأكيدك):', { kind: 'confirm_items', id: 'ask', key: 'confirm', why: 'شرط غامض الدرجة', items: unconf.map(u => ({ ref: u.ref, text: u.text, suggested: u.priority, quote: u.quote, support: u.support })) }));
    if (countsDone === false && Object.keys(this.#statedCounts()).length) add('counts', 2, 'household', 0, () => this.#countsMsg('أعداد ذكرتها وتحتاج تأكيدًا'));
    // (3) ما يؤثر في التوزيع
    if (!countsDone) add('counts', 3, 'household', 0, () => this.#countsMsg('الأعداد تحدد حجم البرنامج'));
    if (!asked.has('household') && (mode !== 'free' || !countsDone) && b.household.currentMembers === undefined) add('household', 3, 'household', 1, () => msg('من سيعيش في البيت أو يزوره؟ أدخل عدد أفراد الأسرة واختر ما ينطبق.', { kind: 'household', id: 'ask', key: 'household', why: 'يحدد عدد الغرف وتوزيع الأدوار', options: [{ id: 'guests', label: 'ضيوف متكررون' }, { id: 'children', label: 'أطفال' }, { id: 'seniors', label: 'كبار سن' }, { id: 'future', label: 'توسع مستقبلي مهم' }] }));
    const tight = countsDone ? landTightness(b) : { tight: false };
    if (tight.tight) add('priorities', 3, 'priorities', -1, () => msg('أرضك ضيقة على البرنامج بحسب قياس الميزان (' + tight.why_ar + ') — لذلك أسألك مبكرًا: ما الذي تقبل التنازل عنه إن لم يتسع كل شيء؟ لن أتنازل عن شيء دون ضغطك أنت.', { kind: 'multi', id: 'ask', key: 'priorities', why: 'أرض ضيقة على البرنامج', options: waivableOptions(b) }));
    if (L.streets.length >= 2) add('entrances', 3, 'hospitality', 2, () => msg(`أرضك على ${L.streets.length} شوارع (${L.streets.map(s => SIDE_LABEL[s.side]).join('، ')}) والمدخل المسجل من الجهة ${L.entries.map(s => SIDE_LABEL[s]).join('، ')}. أين تريد مدخل الضيوف (المجلس)؟`, { kind: 'choice', id: 'ask', key: 'entrances', why: 'الشارعان يغيّران توزيع المداخل', note: 'المحرك يوزّع بحسب المدخل الأول فقط؛ اختيارك يُسجَّل ويُعلَن.', options: [{ id: 'same', label: 'من مدخل العائلة نفسه' }, ...L.streets.map(s => ({ id: s.side, label: 'من جهة ' + SIDE_LABEL[s.side] }))] }));
    if (has('male_majlis') && countsDone && (has('dining') || has('guest_dining')) && !b.relations.some(r => [r.from, r.to].includes('male_majlis') && [r.from, r.to].some(x => x === 'dining' || x === 'guest_dining')))
      add('guest_link', 3, 'hospitality', 3, () => msg('المقلط/غرفة الطعام وعلاقتها بالمجلس: كيف تريدها؟', { kind: 'choice', id: 'ask', key: 'guest_link', why: 'يغيّر مسار الضيف والخدمة', options: [{ id: 'near', label: 'قريبة من المجلس', hint: 'يقيسها المحرك بملامسة ≥ 0.8 م أو فاصل ≤ 2 م' }, { id: 'direct', label: 'ببابٍ مباشر على المجلس', hint: 'يركّب المحرك بابًا فعليًا على جدار مشترك إن أمكن، وإلا يُحجب التصميم بسبب صريح' }, { id: 'separate', label: 'منفصلة عن المجلس (لا يلزم تلاصقهما)', hint: 'يُعفي وصلة الضيافة في المحرك؛ قد تُقدَّم الضيافة من مسار لا يلامس المجلس' }, { id: 'any', label: 'لا يهم' }] }));
    if (has('male_majlis') && countsDone) add('guest_entrance', 3, 'privacy', 4, () => msg('هل يكون لمجلس الرجال مدخل مستقل عن مدخل العائلة؟', { kind: 'choice', id: 'ask', key: 'guest_entrance', why: 'يمس الخصوصية والمداخل', options: [{ id: 'must', label: 'نعم، لازم' }, { id: 'prefer', label: 'نعم، يفضّل' }, { id: 'no', label: 'لا يهم' }] }));
    // (4) تفضيل مهم لم يُذكر
    if (has('bedroom') && has('male_majlis') && countsDone) add('privacy_beds', 4, 'privacy', 1, () => msg('غرف النوم والمجلس: هل تريدها منفصلة؟', { kind: 'choice', id: 'ask', key: 'privacy_beds', why: 'خصوصية النوم', options: [{ id: 'apart_must', label: 'غير ملاصقة للمجلس، لازم' }, { id: 'apart_pref', label: 'غير ملاصقة، تفضيل' }, { id: 'far_pref', label: 'أبعد ما يمكن، تفضيل' }, { id: 'any', label: 'لا يهم' }] }));
    if (L.floors === 2 && has('master') !== undefined && countsDone) add('master_stairs', 4, 'wings', 2, () => msg('الدرج والغرفة الرئيسية: هل تريد الرئيسية بعيدة عن الدرج؟', { kind: 'choice', id: 'ask', key: 'master_stairs', why: 'أرض بدورين: موضع الدرج', options: [{ id: 'far_must', label: 'نعم، لازم' }, { id: 'far_pref', label: 'نعم، تفضيل' }, { id: 'any', label: 'لا يهم' }] }));
    if (countsDone) add('services', 4, 'services', 3, () => msg('هل تحتاج فراغات خدمة؟ اختر ما تريد (غير المختار لا أضيفه).', { kind: 'multi', id: 'ask', key: 'services', why: 'الخدمات تغيّر التوزيع', options: [['maid', 'غرفة خادمة'], ['driver', 'غرفة سائق'], ['laundry', 'غرفة غسيل'], ['storage', 'مخزن'], ['office', 'مكتب'], ['prayer', 'مصلى'], ['guest_room', 'غرفة ضيوف للنوم']].filter(([id]) => !known(id)).map(([id, label]) => ({ id, label })) }));
    if (has('kitchen') && countsDone) add('kitchen_style', 4, 'services', 4, () => msg('المطبخ: مغلق أم مفتوح؟', { kind: 'choice', id: 'ask', key: 'kitchen_style', why: 'يغيّر علاقة المطبخ بالطعام والصالة', options: [{ id: 'closed', label: 'مغلق بباب' }, { id: 'open', label: 'مفتوح على الطعام' }, { id: 'open_to_hall', label: 'مفتوح على الصالة' }, { id: 'any', label: 'لا يهم' }] }));
    if (b.household.seniors || b.household.life?.seniors) add('elderly', 4, 'wings', 5, () => msg('غرفة كبار السن: قريبة من الصالة؟', { kind: 'choice', id: 'ask', key: 'elderly', why: 'احتياج كبار السن', options: [{ id: 'yes', label: 'نعم، قريبة من الصالة' }, { id: 'any', label: 'لا يهم' }] }));
    if (countsDone) add('parking', 4, 'parking', 6, () => msg('كم سيارة تحتاج مواقف لها؟', { kind: 'choice', id: 'ask', key: 'parking', why: 'المواقف', note: 'عدد المواقف نظامي ويحدده المحرك؛ اختيارك يُسجَّل ولا يتحكم في العدد.', options: [{ id: '1', label: 'سيارة واحدة' }, { id: '2', label: 'سيارتان' }, { id: '3', label: 'ثلاث فأكثر' }, { id: '0', label: 'لا أحتاج' }] }));
    if (!tight.tight && countsDone) add('priorities', 4, 'priorities', 9, () => msg('لو ضاقت المساحة عند التوليد، ما الذي تقبل التنازل عنه؟ لن أتنازل عن شيء دون ضغطك.', { kind: 'multi', id: 'ask', key: 'priorities', why: 'للبدائل عند تعذّر الحل', options: waivableOptions(b) }));
    // (5) تجميلي/تسجيلي (غير مدعوم في التوليد): في المسارات الموجهة أو عند الطلب فقط
    if (countsDone) {
      add('avoids', 5, 'privacy', 1, () => msg('ما الذي تريد تجنبه في بيتك؟ (يُستعمل في ترتيب البدائل لا في التوليد)', { kind: 'multi', id: 'ask', key: 'avoids', why: 'ترتيب البدائل', options: AVOIDS.map((label, i) => ({ id: String(i), label })) }));
      add('natural_light', 5, 'environment', 2, () => msg('هل لديك طلب خاص بالإضاءة أو الإطلالة؟ (للتسجيل فقط: غير مدعوم في التوليد حاليًا)', { kind: 'text', id: 'ask', key: 'natural_light', why: 'تسجيل', optional: true }));
      add('budget', 5, 'budget', 3, () => msg('نطاق الميزانية بالريال (اختياري، للتسجيل فقط: لا يستعمله المحرك حاليًا).', { kind: 'budget', id: 'ask', key: 'budget', why: 'تسجيل', optional: true }));
    }
    return out;
  }
  #statedCounts() { return Object.fromEntries(['bedroom', 'male_majlis', 'kitchen', 'living', 'dining', 'bath'].filter(id => B.countOf(this.brief, id) !== null).map(id => [id, B.countOf(this.brief, id)])); }
  #unconfirmedItems() {
    const b = this.brief, out = [], sup = new Map(supportRows(b).map(r => [r.ref, r.support]));
    for (const r of b.relations) if (r.active !== false && r.verification === 'needs_confirmation') out.push({ ref: 'relation:' + r.id, text: B.describeRelation(r), priority: r.priority, quote: r.originalText, support: sup.get('relation:' + r.id) });
    for (const p of b.placements) if (p.active !== false && p.verification === 'needs_confirmation') out.push({ ref: 'placement:' + p.id, text: B.describePlacement(p), priority: p.priority, quote: p.originalText, support: sup.get('placement:' + p.id) });
    for (const s of b.spaces) {
      if (s.count > 0 && s.attr?.dims && s.attr.dims.verification === 'needs_confirmation' && s.minClearWidthM) out.push({ ref: 'space:' + s.id + '#dims', text: `مقاس ${B.nameOf(s.type)} ${s.minClearWidthM}×${s.minClearDepthM} م`, priority: s.attr.dims.priority, quote: s.attr.dims.originalText, support: 'partial' });
      if (s.count > 0 && s.attr?.floor && s.attr.floor.verification === 'needs_confirmation') out.push({ ref: 'space:' + s.id + '#floor', text: `${B.nameOf(s.type)} في الدور ${s.floorPreference === 1 ? 'العلوي' : 'الأرضي'}`, priority: s.attr.floor.priority, quote: s.attr.floor.originalText, support: 'supported' });
    }
    for (const [path, m] of Object.entries(b.provenance)) if (path.startsWith('preferences.features.') && m.verification === 'needs_confirmation' && !/requested|floorsSaid|tweaks/.test(path)) out.push({ ref: 'feature:' + path.slice('preferences.features.'.length), text: featureText(path.split('.').pop()), priority: m.priority, quote: m.originalText, support: B.supportOf('pref.' + path.split('.').pop()) });
    if (b.provenance['preferences.kitchenStyle']?.verification === 'needs_confirmation') out.push({ ref: 'field:preferences.kitchenStyle', text: 'المطبخ ' + ({ open: 'مفتوح على الطعام', closed: 'مغلق', open_to_hall: 'مفتوح على الصالة' })[b.preferences.kitchenStyle], priority: b.provenance['preferences.kitchenStyle'].priority, quote: b.provenance['preferences.kitchenStyle'].originalText, support: 'partial' });
    return out;
  }
  /** السؤال التالي أو null. الأقل cls أولًا، ثم الأقل order. في الحديث الحر لا يتجاوز cls 3 ما لم يطلب العميل المزيد. */
  nextQuestion() {
    const cap = this.mode === 'free' && !this.moreQuestions ? 3 : this.mode === 'free' || this.mode === 'decide' || this.mode === 'guided' ? (this.mode === 'guided' || this.mode === 'decide' || this.moreQuestions ? 5 : 3) : 5;
    const list = this.candidates().filter(c => c.cls <= cap).sort((a, b) => a.cls - b.cls || a.order - b.order);
    if (!list.length) return null;
    const c = list[0]; const m = c.build(); this.brief = { ...this.brief, interaction: { ...this.brief.interaction, currentTopic: c.topic } };
    const q = { ...m, key: m.key || c.key, qkey: c.key, cls: c.cls, topic: c.topic };
    if (this.mode === 'decide') q.advice = this.#advice(c.key);
    return q;
  }
  /** نصائح «ساعدني أقرر»: من افتراضات المحرك الموثقة نفسها ومن حدود كاشف الاستحالة؛ لا توصية مخترعة. */
  #advice(key) {
    const advice = {
      kitchen_style: 'افتراض الميزان للمطبخ: مغلق بباب خدمة إلى الحوش (من saudiDefaults). المفتوح يقرّبه من الطعام أو الصالة.',
      services: 'افتراض الميزان لغرفة الخادمة: بحمامها ما لم تقل «بدون حمام».', guest_link: 'افتراض الميزان إن وُجد مجلس رجال وطعام: باب خدمة (مقلط) بينهما ما لم تطلب فصلهما.',
      parking: 'عدد المواقف نظامي يحدده المحرك من مساحة الأرض (site-parking).',
    }[key];
    if (key === 'counts') { const n = this.#provableMax(); if (n) return n; }
    return advice || null;
  }
  #provableMax() {
    const b = this.brief, e = toEngineInput(b); let last = null;
    for (let n = Math.max(1, e.counts.bedrooms || 1); n <= 10; n++) {
      let f; try { f = analyzeFeasibility({ land: e.land, counts: { ...e.counts, bedrooms: n, majlis: Math.max(1, e.counts.majlis), kitchens: Math.max(1, e.counts.kitchens), halls: Math.max(1, e.counts.halls), dining: e.counts.dining, baths: Math.max(n, e.counts.baths) }, requirements: e.requirements, provisional: true }); } catch { return last; }
      if (!f.feasible) return `بحسب كاشف الميزان: ${n} غرف نوم مع مجلس ومطبخ وصالة تتجاوز المتاح بدليل على هذه الأرض (الحد الأدنى للمساحة) — فاختر أقل من ${n}.`;
      last = null;
    }
    return null;
  }
  #next() {
    const q = this.nextQuestion();
    if (q) return [q];
    const R = this.readiness();
    if (R.state === READINESS.CONFLICT || R.state === READINESS.CLARIFY) return [msg(`ما زال ينقصني قرار قبل التصميم: ${R.reasons.map(x => x.text_ar).slice(0, 3).join('؛ ')}`)];
    const out = [msg(R.state === READINESS.READY ? 'ملفك مكتمل وجاهز للتصميم.' : `ملفك جاهز مع قيود في الدعم: ${R.reasons.map(x => x.text_ar).slice(0, 4).join('؛ ')}`, { kind: 'readiness', readiness: R.state })];
    out.push(msg('تقدر تبدأ التصميم الآن، أو أسألك أسئلة إضافية لتحسين الدقة.', { kind: 'choice', id: 'ready', options: [{ id: 'start', label: 'ابدأ التصميم' }, ...(this.moreQuestions || this.mode !== 'free' ? [] : [{ id: 'more', label: 'أسئلة إضافية' }])] }));
    return out;
  }

  // ---------------------------------------------------------------------------------------- تطبيق الجواب
  #applyAnswer(key, v) {
    if (!key) throw Error('سؤال غير معروف.');
    const m = (priority = 'preferred') => ({ source: 'client_answer', priority, verification: 'confirmed' });
    let b = this.brief; const done = () => { this.brief = b; this.#mark(key.startsWith('conflict:') ? key : key); return [...this.#next()]; };
    if (key === 'confirm') {
      const dec = v?.decisions || {};
      for (const [ref, p] of Object.entries(dec)) {
        if (p === 'drop') b = B.dropItem(b, ref);
        else if (ref.includes('#')) { const [sid, attr] = ref.slice('space:'.length).split('#'); const s = B.spaceOf(b, sid); if (s?.attr?.[attr === 'dims' ? 'dims' : 'floor']) { b = B.decide(b, 'space:' + sid, { priority: p }); } }
        else b = B.decide(b, ref, { priority: p });
      }
      this.brief = b; this.#mark('confirm:' + this.#unconfirmedKeyFor(v)); return [msg('اعتمدت ما أكدته.'), ...this.#next()];
    }
    if (key === 'household') {
      const picked = Array.isArray(v?.picked) ? v.picked : [], ids = ['guests', 'children', 'seniors', 'future'];
      if (picked.some(p => !ids.includes(p))) throw Error('اختيار غير معروف.');
      const cur = Number(v?.currentMembers), fut = Number(v?.futureMembers);
      if (!(Number.isInteger(cur) && cur >= 1 && cur <= 40)) throw Error('عدد أفراد الأسرة الحالي بين 1 و40.');
      b = B.setField(b, 'household.currentMembers', cur, m());
      if (Number.isInteger(fut) && fut >= cur) b = B.setField(b, 'household.futureMembers', fut, m());
      const life = {}; if (picked.includes('guests')) life.guests = LIFE.guests[1]; if (picked.includes('seniors')) life.seniors = LIFE.seniors[0]; if (picked.includes('future')) life.future = LIFE.future[0]; if (picked.includes('children')) life.children = LIFE.children[0];
      b = B.setField(b, 'household.life', life, m());
      b = B.setField(b, 'household.specialNeeds', picked.filter(p => p === 'seniors' || p === 'children').map(p => p === 'seniors' ? 'كبار سن' : 'أطفال'), m());
      if (picked.includes('seniors')) b = B.setField(b, 'household.seniors', true, m());
      this.#topicDone('household'); return done();
    }
    if (key === 'priorities') {
      const ids = (Array.isArray(v) ? v : []).filter(x => waivableOptions(b).some(o => o.id === x));
      b = B.setField(b, 'features.waivable', ids, m('flexible')); this.#topicDone('priorities'); return done();
    }
    if (key === 'entrances') {
      const side = String(v); if (side !== 'same' && !b.land.streets.some(s => s.side === side)) throw Error('اختيار غير معروف.');
      b = B.setField(b, 'features.guestEntranceSide', side, m());
      if (side !== 'same' && !b.land.entries.includes(side) || side === 'same') b = B.setField(b, 'features.guestEntrance', side !== 'same', m());
      return done();
    }
    if (key === 'guest_link') {
      if (v === 'separate') b = B.setField(b, 'features.guestLinkSeparate', true, m('preferred'));
      if (v === 'near' || v === 'direct') { const to = B.spaceOf(b, 'guest_dining') ? 'guest_dining' : 'dining'; b = B.addRelation(b, { from: to, to: 'male_majlis', relation: v === 'near' ? 'near' : 'direct_access', ...(v === 'direct' ? { detail: 'door' } : {}), ...m(), originalText: 'اختيار العميل: ' + (v === 'near' ? 'قريبة من المجلس' : 'ببابٍ مباشر على المجلس') }); }
      return done();
    }
    if (key === 'guest_entrance') { if (v === 'must' || v === 'prefer') b = B.setField(b, 'features.guestEntrance', true, m(v === 'must' ? 'mandatory' : 'preferred')); else b = B.setField(b, 'features.guestEntrance', false, m('flexible')); if (v === 'no') b = B.dropItem(b, 'feature:guestEntrance'); return done(); }
    if (key === 'privacy_beds') {
      if (v !== 'any') b = B.addRelation(b, { from: 'bedroom', to: 'male_majlis', relation: 'separate', detail: v.startsWith('far') ? 'far' : 'apart', ...m(v.endsWith('must') ? 'mandatory' : 'preferred'), originalText: 'اختيار العميل: ' + ({ apart_must: 'غرف النوم غير ملاصقة للمجلس، لازم', apart_pref: 'غير ملاصقة، تفضيل', far_pref: 'أبعد ما يمكن، تفضيل' })[v] });
      return done();
    }
    if (key === 'master_stairs') {
      if (v !== 'any') { if (!B.spaceOf(b, 'master')) b = B.upsertSpace(b, { type: 'master', count: 1, ...m(), originalText: 'غرفة النوم الرئيسية' }); b = B.addRelation(b, { from: 'master', to: 'stairs', relation: 'separate', detail: 'far', ...m(v === 'far_must' ? 'mandatory' : 'preferred'), originalText: 'اختيار العميل: الرئيسية بعيدة عن الدرج' }); }
      return done();
    }
    if (key === 'services') {
      for (const id of Array.isArray(v) ? v : []) { if (!B.SPACE_TYPES[id] || !B.SPACE_TYPES[id].extra) throw Error('اختيار غير معروف.'); b = B.upsertSpace(b, { type: id, count: 1, ...m(), originalText: 'اختار العميل ' + B.nameOf(id) }); }
      this.#topicDone('services'); return done();
    }
    if (key === 'kitchen_style') { if (v !== 'any') b = B.setField(b, 'preferences.kitchenStyle', v, m()); return done(); }
    if (key === 'elderly') { if (v === 'yes') b = B.setField(b, 'features.elderlyRoom', true, m()); return done(); }
    if (key === 'parking') { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 3) throw Error('اختيار غير معروف.'); b = B.setField(b, 'preferences.parkingCount', n, m('flexible')); this.#topicDone('parking'); return done(); }
    if (key === 'avoids') { const arr = (Array.isArray(v) ? v : []).map(Number); if (arr.some(i => !AVOIDS[i])) throw Error('اختيار غير معروف.'); b = B.setField(b, 'household.avoids', arr.map(i => AVOIDS[i]), m('flexible')); return done(); }
    if (key === 'natural_light') { const t = String(v || '').trim(); if (t) b = B.setField(b, 'preferences.naturalLight', t.slice(0, 300), m('flexible')); return done(); }
    if (key === 'budget') { const lo = Number(v?.min), hi = Number(v?.max); if (Number.isFinite(lo) || Number.isFinite(hi)) b = B.setField(b, 'preferences.budgetRange', { ...(Number.isFinite(lo) ? { min: lo } : {}), ...(Number.isFinite(hi) ? { max: hi } : {}), currency: 'SAR' }, m('flexible')); this.#topicDone('budget'); return done(); }
    if (key === 'skip') { this.#mark(String(v)); return this.#next(); }
    if (key.startsWith('conflict:')) { b = B.resolveConflict(b, v.conflictId, v.optionId); this.brief = b; return [msg('سجّلت قرارك.'), ...this.#next()]; }
    throw Error('سؤال غير معروف: ' + key);
  }
  #unconfirmedKeyFor() { return this.#unconfirmedItems().map(u => u.ref).join(','); }
}
const featureText = k => ({ allEnsuite: 'كل غرفة نوم بحمامها', sharedBaths: 'حمامات مشتركة بين الغرف', masterDressing: 'غرفة ملابس للرئيسية', familyEntrance: 'مدخل مستقل للعائلة', guestEntrance: 'مدخل مستقل لمجلس الرجال', womenSeparate: 'مجلس النساء منفصل', bathsOffHall: 'الحمامات لا تفتح على الصالة', noCorridors: 'أقل ما يمكن من الممرات', elderlyRoom: 'غرفة كبار السن قرب الصالة', glazing: 'نسب زجاج مطلوبة', waivable: 'الأولويات القابلة للتنازل' })[k] || k;
const refText = brief => ref => { const [k, ...r] = ref.split(':'), id = r.join(':'); if (k === 'relation') { const x = brief.relations.find(y => y.id === id); return x && B.describeRelation(x); } if (k === 'placement') { const x = brief.placements.find(y => y.id === id); return x && B.describePlacement(x); } if (k === 'space') return B.nameOf(id.split('#')[0]); if (k === 'feature') return featureText(id); return null; };

/** خيارات «ما أقبل التنازل عنه»: كلها قابلة للتنفيذ في وحدة البدائل وتُعرض بحسب ما في الملف فعلًا. */
export function waivableOptions(brief) {
  const has = id => (B.countOf(brief, id) ?? 0) > 0, o = [];
  o.push({ id: 'smaller_rooms', label: 'تصغير مساحات الغرف' });
  if ((B.countOf(brief, 'bedroom') ?? 0) > 1) o.push({ id: 'fewer_bedrooms', label: 'تقليل عدد غرف النوم' });
  if ((B.countOf(brief, 'bath') ?? 0) > 1) o.push({ id: 'fewer_baths', label: 'تقليل عدد دورات المياه' });
  if (has('living')) o.push({ id: 'smaller_hall', label: 'تقليل مساحة الصالة' });
  if (has('male_majlis') || has('female_majlis')) o.push({ id: 'drop_majlis', label: 'حذف المجلس (أو أحد المجلسين)' });
  if (has('dining')) o.push({ id: 'drop_dining', label: 'حذف غرفة الطعام المنفصلة' });
  if (brief.land.floors === 2 || true) o.push({ id: 'to_upper', label: 'نقل غرف إلى الدور الأول' });
  if (['maid', 'driver', 'office', 'prayer', 'laundry', 'storage', 'guest_room'].some(has)) o.push({ id: 'drop_extras', label: 'حذف الفراغات الإضافية (خادمة/سائق/مكتب…)' });
  return o;
}
