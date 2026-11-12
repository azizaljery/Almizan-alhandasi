// منطق الصفحة الرئيسية: الأرض (طول وعرض وشوارع ومداخل) ← شرعاء ← تصميم أولي داخل المرسم.
// وحدة نقية بلا DOM: كل ما فيها قابل للاختبار بـ node. الواجهة في home.mjs.
import { validatePlot, defaultRooms } from './planner.mjs';
import { footprintDiagnostics } from './claude/planner.mjs';
import { rankByDNA, geometryFingerprint } from './design-dna.mjs';
import { compareOpeningAware } from './opening-aware.mjs';
import { normalizeDiscovery } from './client-brief.mjs';
import { runMultiEngineDesign } from './multi-engine.mjs';
import { requestLocalBrief } from './local-nlp.mjs';
import { legacyToDoc } from './draw/import-legacy.mjs';
import { applyCommand } from './draw/doc.mjs';
import { generateTwoFloors, MultiFloorError, splitProgram, STAIR_W, STAIR_H } from './multi-floor.mjs';
import { generateVillaDesigns, generateVillaTwoFloors, countsFromRooms, NARROW, generatorFootprint } from './villa-layout.mjs';
import { extractRequirements } from './requirements.mjs';
import { buildBrief, answerToText, GUIDED_STEPS, SOURCE_AR, FLOOR_AR, ADDABLE } from './shara/brief-engine.mjs';
import { SPACE } from './shara/lexicon.mjs';
import { docToLegacy } from './draw/export-legacy.mjs';
import { climb, fitFacts, programNeed } from './fit-ladder.mjs';
import { normalizeGeo } from './geo-land.mjs';
import { normalizeStreetWidths } from './municipal-rules.mjs';

// الحوش الخارجي والمصعد يفهمهما المحلي ويرسمهما؛ لا نعرض قول الذكاء إنه «غير ممثل/غير مدعوم» فيناقض ما رُسم
const OUTDOOR_AI_NOISE = x => /مسبح|شلال|حديقة|عشب|احواض|أحواض|مصعد|اسانسير|أسانسير|ليفت/.test(x) && /غير (?:مدعوم|ممثل|منفذ|متاح|مطبق)|لا (?:يمكن|يدعم|يمثل|يُمثل)|خارج (?:برنامج|نطاق)/.test(x);
export const SHARA_NAME = 'شرعاء';
export const SHARA_WELCOME = 'أهلاً بك، أنا شرعاء، مساعدك الذكي لفهم احتياجاتك في تصميم منزلك.';
export const SHARA_GOAL = 'سأسألك عن نمط حياتك لأفهمك، ثم أبني عليه تصميمًا دقيقًا يناسبك.';
export const SIDE_LABELS = Object.freeze({ n: 'شمال', s: 'جنوب', e: 'شرق', w: 'غرب' });
const SIDES = Object.keys(SIDE_LABELS);

// ------------------------------------------------------------------------------------------------ الأرض
/**
 * الأرض كما يدخلها العميل: الطول (شمال/جنوب) والعرض (شرق/غرب) بالمتر، والشوارع، والمداخل.
 * «الاتجاه» هو المدخل: قد يكون للأرض مدخلان على جهتين، وتطل على شارعين أو ثلاثة.
 * الشمال أعلى الرسم؛ وإن حدّد العميل أرضه على الخريطة حُفظ انحرافه عن الشمال الحقيقي في land.geo.north (‎-45..45°‎) مع الإحداثيات.
 * streetWidths (اختياري): عرض الشارع بالمتر لكل ضلع على شارع — يُستعمل في مطابقة الاشتراطات فقط.
 * المحرك الحالي يستعمل المدخل الأول فقط للتوزيع، والمداخل الأخرى تُسجَّل في الوثيقة ولا تؤثر في التوليد.
 */
export function normalizeLand(raw = {}) {
  const length = Number(raw.length), width = Number(raw.width);
  const list = (v, name) => {
    if (!Array.isArray(v) || !v.length) throw Error(`اختر ${name} واحدًا على الأقل.`);
    if (v.some(s => !SIDES.includes(s))) throw Error(`${name} غير معروف؛ الجهات شمال وجنوب وشرق وغرب فقط.`);
    return [...new Set(v)];
  };
  const streets = list(raw.streets, 'شارعًا'), entries = list(raw.entries, 'مدخلًا');
  const off = entries.filter(s => !streets.includes(s));
  if (off.length) throw Error(`المدخل يجب أن يطل على شارع: ${off.map(s => SIDE_LABELS[s]).join('، ')} ليست من الشوارع المحددة.`);
  // الأدوار: واحد أو اثنان فقط. plot يبقى بدور واحد لأنه أرض المحرك لكل دور؛ عدد الأدوار في land.floors.
  const floors = raw.floors === undefined || raw.floors === null || raw.floors === '' ? 1 : Number(raw.floors);
  if (!Number.isInteger(floors) || floors < 1) throw Error('عدد الأدوار يجب أن يكون 1 أو 2.');
  if (floors > 2) throw Error('ثلاثة أدوار أو أكثر غير مدعومة بعد؛ المتاح دور أو دوران.');
  const plot = validatePlot({ width, length, floors: 1, streets: Object.fromEntries(streets.map(s => [s, true])), entry: entries[0] });
  // اختياريان لا يدخلان التوليد: عروض الشوارع (للارتداد النظامي في بطاقة المطابقة) وموقع الأرض (للشمس والشمال الحقيقي)
  const streetWidths = normalizeStreetWidths(raw.streetWidths, streets), geo = normalizeGeo(raw.geo);
  return { plot, land: { length, width, streets, entries, floors, ...(raw.floorsExplicit ? { floorsExplicit: true } : {}), ...(Object.keys(streetWidths).length ? { streetWidths } : {}), ...(geo ? { geo } : {}) } };
}

// ------------------------------------------------------------------------------------------------ شرعاء
const COUNT_FIELDS = Object.freeze([
  { id: 'bedrooms', label: 'غرف النوم', min: 1, max: 10 },
  { id: 'majlis', label: 'المجالس', min: 0, max: 10 },
  { id: 'baths', label: 'دورات المياه', min: 0, max: 10 },
  { id: 'kitchens', label: 'المطابخ', min: 0, max: 10 },
  { id: 'halls', label: 'الصالات', min: 0, max: 10 },
  { id: 'dining', label: 'غرف الطعام', min: 0, max: 10 },
]);
export const ENGINEERING_FIELDS = COUNT_FIELDS;
const msg = (text, extra = {}) => ({ from: 'shara', text, ...extra });
export const MAX_QUESTIONS_PER_ROUND = 3;

/**
 * جلسة حوار شرعاء: مهندس معماري يستقبل العميل. تعيد رسائل بسيطة تعرضها الواجهة.
 * المبدأ: بعد كلام العميل يُعرض «البرنامج المعماري كما فهمته» جدولًا كاملًا معلَّلًا (قلتَ / افتراض عرفي / استنتاج من الأسرة)
 * قابلًا للتعديل في مكانه، ولا يُعاد سؤاله عمّا فُهم؛ تُسأل فقط الأسئلة التي تغيّر التصميم (ثلاثة في الدور كحد أقصى)
 * وكل سؤال بسببه الهندسي، ويمكن التوليد في أي لحظة بلا حقل إلزامي. المنطق في shara/brief-engine.mjs.
 */
export class SharaSession {
  constructor({ land = null } = {}) {
    this.mode = null; this.phase = 'mode'; this.land = land;
    this.texts = []; this.ai = null; this.edits = []; this.disabledCustoms = []; this.skipped = []; this.countOverrides = {};
    this.brief = null; this.asked = 0; this.guidedStep = 0; this.log = []; this.rounds = 0;
    this.counts = {}; this.requirements = null; this.idea = '';
  }
  start() {
    return this.#push([
      msg(SHARA_WELCOME),
      msg('كيف تحب أن نبدأ؟', { kind: 'choice', id: 'mode', options: [{ id: 'free', label: 'أتحدث بحرية' }, { id: 'guided', label: 'اسألني أسئلة محددة' }] }),
    ]);
  }
  #push(list) { this.log.push(...list); return list; }
  /** يبني الموجز من كل ما قاله العميل حتى الآن ويحدّث ما يستهلكه المولّد. */
  #rebuild() {
    this.idea = this.texts.join('، ').slice(0, 4000);
    const b = buildBrief(this.idea, { ai: this.ai, disabledCustoms: this.disabledCustoms, edits: this.edits, land: this.land, skipped: this.skipped });
    // الأعداد النهائية التي يكتبها العميل بنفسه (المسار القديم) تحكم
    const counts = { ...b.counts, ...this.countOverrides };
    // مصدر كل صف (قلتَه / افتراض عرفي / استنتاج): يحدد سلّم الاتساع به ما يُخفَّف أولًا إن لم تتسع الأرض
    const sources = Object.fromEntries(b.program.map(r => [r.id, r.source]));
    this.brief = b; this.counts = counts; this.requirements = { ...b.requirements, counts: { ...counts }, sources };
    return b;
  }
  #programMsg() {
    const b = this.brief;
    const rows = b.program.map(r => ({ id: r.id, label: r.label, count: r.count, floor: r.floor, floorLabel: FLOOR_AR[r.floor] || r.floor, area: r.area, areaLabel: r.area ? `≈ ${r.area * r.count} م²` : '—', source: r.source, sourceLabel: SOURCE_AR[r.source] || r.source, reason: r.reason, bath: !!r.bath }));
    const addable = ADDABLE.filter(id => !rows.some(r => r.id === id)).map(id => ({ id, label: labelOf(id) }));
    return msg('البرنامج المعماري كما فهمته. عدّل أي صف في مكانه (±، حذف، إضافة)؛ ما لم تذكره افترضته وقلتُ لماذا.', { kind: 'program', id: 'program', rows, totals: b.totals, counts: this.counts, customs: b.customs, addable, floors: b.floors });
  }
  #askMsg(q) { return msg(q.text, { kind: 'ask', id: q.id, reason: q.reason, options: q.options || [], multi: !!q.multi, free: q.free !== false, placeholder: q.placeholder || 'أو اكتب جوابك بحرية…' }); }
  #generateMsg() {
    this.phase = 'ready';
    const left = this.brief.questions.filter(q => !this.skipped.includes(q.id)).length;
    return msg(left ? 'يمكنك توليد التصميم الآن بهذا البرنامج، أو الإجابة عن السؤال أعلاه لتحسينه. لا حقل إلزامي.' : 'البرنامج مكتمل من جهتي. اضغط «توليد التصميم» لأفتح لك تصميمًا أوليًا داخل المرسم تعدّل عليه بيدك.', { kind: 'generate', id: 'generate' });
  }
  /** دور كامل بعد كلام جديد: الجدول، ثم ما فُهم من العلاقات، ثم ما لن يُطبَّق، ثم سؤال واحد (إن بقي)، ثم التوليد. */
  #round() {
    const b = this.#rebuild(); const out = [this.#programMsg()];
    {
      if (b.understood.length) out.push(msg('فهمت من كلامك وسأطبّقه في التصميم:', { kind: 'list', id: 'understood', items: b.understood }));
      const notes = [...b.notes, ...(this.aiNotes || [])];
      if (notes.length) out.push(msg(notes.join('\n'), { kind: 'note' }));
      if (b.unsupported.length) out.push(msg('ما لن أطبّقه في هذا الإصدار (بصدق):', { kind: 'list', id: 'unsupported', items: b.unsupported }));
      if (b.requirements.unclear?.length) out.push(msg('هذه العبارات لم أفهمها بدقة، فلن أطبّقها كما هي. أعد صياغتها مباشرة مثل: «المطبخ في الخلف»، «الماستر بعيدة عن المجلس».', { kind: 'list', id: 'unclear', items: b.requirements.unclear.map(x => '«' + x + '»') }));
    }
    this.rounds++;
    const q = this.#nextQuestion();
    if (q) out.push(this.#askMsg(q));
    out.push(this.#generateMsg());
    return out;
  }
  #nextQuestion() {
    if (this.asked >= MAX_QUESTIONS_PER_ROUND) return null;
    const q = this.brief.questions.find(q => !this.skipped.includes(q.id));
    if (q) this.asked++;
    return q || null;
  }
  #addText(value) {
    const text = String(typeof value === 'string' ? value : value?.text || '').trim();
    if (text.length < 3) throw Error('اكتب وصفًا قصيرًا على الأقل.');
    this.texts.push(text.slice(0, 2000));
    if (value && typeof value === 'object' && value.requirements && typeof value.requirements === 'object') this.ai = value.requirements;
    // ملاحظات الذكاء المتصل (إن وُجد) تُعرض مرة واحدة ولا تُفسَّر برنامجًا
    this.aiNotes = value && typeof value === 'object' ? [...(value.assumptions || []), ...(value.questions || [])].filter(x => typeof x === 'string' && x.trim() && !OUTDOOR_AI_NOISE(x)).slice(0, 4) : [];
    return text;
  }
  /** answer(id, value): value حسب نوع السؤال. يعيد الرسائل التالية. */
  answer(id, value) {
    if (id === 'mode') {
      if (!['free', 'guided'].includes(value)) throw Error('اختيار غير معروف.');
      this.mode = value;
      if (value === 'free') { this.phase = 'free'; return this.#push([msg('تحدّث معي بحرية عن بيتك وأسرتك وكيف تحب أن تعيش فيه؛ سأحوّل كلامك إلى برنامج معماري كامل ولن أسألك عمّا فهمته.', { kind: 'text', id: 'free' })]); }
      this.phase = 'guided'; this.guidedStep = 0;
      return this.#push([msg(SHARA_GOAL), this.#askMsg(GUIDED_STEPS[0])]);
    }
    if (id === 'free' || id === 'more') {
      this.#addText(value); this.asked = 0; this.phase = 'program';
      return this.#push(this.#round());
    }
    const g = GUIDED_STEPS.findIndex(s => s.id === id);
    if (g >= 0) {
      const text = answerToText(GUIDED_STEPS[g], value);
      if (text.trim()) this.texts.push(text.trim());
      if (g + 1 < GUIDED_STEPS.length) { this.guidedStep = g + 1; return this.#push([this.#askMsg(GUIDED_STEPS[g + 1])]); }
      this.asked = 0; this.phase = 'program';
      if (!this.texts.length) this.texts.push('بيت لأسرة');
      return this.#push(this.#round());
    }
    if (id === 'skip') {
      const qid = String(value || ''); if (!qid) throw Error('لا سؤال لتخطّيه.');
      const gi = GUIDED_STEPS.findIndex(s => s.id === qid);
      if (gi >= 0) return this.answer(qid, { picks: [], text: '' });
      if (!this.skipped.includes(qid)) this.skipped.push(qid);
      this.#rebuild(); const q = this.#nextQuestion(); const out = [];
      if (q) out.push(this.#askMsg(q));
      out.push(this.#generateMsg());
      return this.#push(out);
    }
    const q = this.brief?.questions.find(q => q.id === id);
    if (q) {
      const text = answerToText(q, value);
      if (!this.skipped.includes(id)) this.skipped.push(id); // لا يُعاد السؤال نفسه ولو لم يُفهم الجواب
      if (text.trim()) this.texts.push(text.trim());
      const before = JSON.stringify(this.brief?.requirements?.prefs?.outdoor || null);
      this.#rebuild(); const out = [this.#programMsg()];
      if (JSON.stringify(this.brief?.requirements?.prefs?.outdoor || null) !== before) {
        const line = this.brief.understood.filter(u => /^في الحوش الخارجي/.test(u));
        if (line.length) out.push(msg('حدّثتُ فهمي للحوش الخارجي:', { kind: 'list', id: 'understood', items: line }));
      }
      const next = this.#nextQuestion(); if (next) out.push(this.#askMsg(next));
      out.push(this.#generateMsg());
      return this.#push(out);
    }
    if (id === 'program') {
      const op = value?.op, rid = String(value?.id || ''), n = Number(value?.count);
      if (!['inc', 'dec', 'set', 'remove', 'add'].includes(op) || !rid) throw Error('تعديل غير معروف.');
      const cur = this.brief?.program.find(r => r.id === rid)?.count || 0;
      const want = op === 'inc' ? cur + 1 : op === 'dec' ? cur - 1 : op === 'remove' ? 0 : op === 'add' ? (Number.isInteger(n) && n > 0 ? n : 1) : n;
      if (!Number.isInteger(want) || want < 0 || want > 10) throw Error('العدد بين 0 و10.');
      this.edits = this.edits.filter(e => e.id !== rid);
      this.edits.push(want === 0 ? { op: 'remove', id: rid } : { op: 'set', id: rid, count: want });
      this.#rebuild();
      return this.#push([this.#programMsg()]);
    }
    if (id === 'custom') {
      const cid = String(value?.id || ''), on = value?.on !== false;
      if (!cid) throw Error('عرف غير معروف.');
      this.disabledCustoms = this.disabledCustoms.filter(c => c !== cid); if (!on) this.disabledCustoms.push(cid);
      this.#rebuild();
      return this.#push([this.#programMsg()]);
    }
    if (id === 'counts') {
      // المسار القديم: أعداد يكتبها العميل بنفسه تحكم الأعداد النهائية؛ الحقول الفارغة تبقى كما فُهمت (لا خطأ على الفراغ)
      const next = { ...this.countOverrides };
      for (const f of COUNT_FIELDS) {
        const raw = value?.[f.id]; if (raw === undefined || raw === null || raw === '' || (typeof raw === 'number' && Number.isNaN(raw))) continue;
        const v = Number(raw);
        if (!Number.isInteger(v) || v < f.min || v > f.max) throw Error(`${f.label}: عدد صحيح بين ${f.min} و${f.max}.`);
        next[f.id] = v;
      }
      this.countOverrides = next;
      if (!this.brief) { this.texts.length || this.texts.push('بيت'); }
      this.#rebuild();
      return this.#push([this.#generateMsg()]);
    }
    throw Error('خطوة غير معروفة.');
  }
  /** تغيّرت الأرض والحوار قائم: يبقى الكلام، ويُعاد حساب البرنامج (أدواره ومساحاته تتبع الأرض). */
  setLand(land) { this.land = land; if (this.brief) this.#rebuild(); }
  /** حالة الحوار كما تُحفظ في التخزين (بيانات فقط): منها يُستعاد الحوار عند الرجوع إلى شرعاء من أي صفحة. */
  toJSON() {
    return { v: 1, mode: this.mode, phase: this.phase, land: this.land, texts: [...this.texts], ai: this.ai, edits: [...this.edits], disabledCustoms: [...this.disabledCustoms],
      skipped: [...this.skipped], countOverrides: { ...this.countOverrides }, asked: this.asked, guidedStep: this.guidedStep, rounds: this.rounds, aiNotes: [...(this.aiNotes || [])] };
  }
  /** يستعيد جلسة محفوظة بـ toJSON؛ البرنامج يُعاد بناؤه من الكلام نفسه (المصدر واحد فلا يختلف عمّا عُرض). يعيد null إن فسدت البيانات. */
  static restore(data, { land = null } = {}) {
    if (!data || data.v !== 1 || !Array.isArray(data.texts)) return null;
    const s = new SharaSession({ land: land || data.land || null });
    s.mode = ['free', 'guided'].includes(data.mode) ? data.mode : null;
    s.phase = ['mode', 'free', 'guided', 'program', 'ready'].includes(data.phase) ? data.phase : 'mode';
    s.texts = data.texts.filter(t => typeof t === 'string').map(t => t.slice(0, 2000)); s.ai = data.ai && typeof data.ai === 'object' ? data.ai : null;
    s.edits = Array.isArray(data.edits) ? data.edits : []; s.disabledCustoms = Array.isArray(data.disabledCustoms) ? data.disabledCustoms : []; s.skipped = Array.isArray(data.skipped) ? data.skipped : [];
    s.countOverrides = data.countOverrides && typeof data.countOverrides === 'object' ? { ...data.countOverrides } : {};
    s.asked = Number.isInteger(data.asked) ? data.asked : 0; s.rounds = Number.isInteger(data.rounds) ? data.rounds : 0;
    s.guidedStep = Number.isInteger(data.guidedStep) ? Math.max(0, Math.min(GUIDED_STEPS.length - 1, data.guidedStep)) : 0; s.aiNotes = Array.isArray(data.aiNotes) ? data.aiNotes : [];
    try { if (s.texts.length || Object.keys(s.countOverrides).length) { if (!s.texts.length) s.texts.push('بيت'); s.#rebuild(); } else if (['program', 'ready'].includes(s.phase)) s.phase = s.mode ? s.mode : 'mode'; }
    catch { return null; }
    return s;
  }
  /** الرسائل التي يكمل منها العميل بعد الاستعادة: أين توقف (اختيار الطريقة، الكتابة الحرة، السؤال الموجّه) أو البرنامج وزر التوليد. */
  resume() {
    if (this.brief) return this.#push([this.#programMsg(), this.#generateMsg()]);
    if (this.phase === 'free') return this.#push([msg('أكمل من حيث توقفت: حدّثني بحرية عن بيتك وأسرتك.', { kind: 'text', id: 'free' })]);
    if (this.phase === 'guided') return this.#push([this.#askMsg(GUIDED_STEPS[this.guidedStep])]);
    return this.start();
  }
  /** ما يستهلكه المولّد من الاكتشاف (client-brief). */
  discovery() { return this.brief ? this.brief.discovery : normalizeDiscovery(undefined); }
  rooms() { return defaultRooms(this.counts); }
  /** جدول البرنامج الحالي (للاختبارات والواجهة). */
  program() { return this.brief ? this.brief.program : []; }
}
function labelOf(id) { return SPACE[id]?.label || { guest_wc: 'دورة مياه الضيوف', bath_suite: 'حمامات غرف النوم', bath: 'دورة مياه' }[id] || id; }

/**
 * يفهم نص العميل الحر محليًا (بلا شبكة) ويعيد أعداد الفراغات التي ذُكرت صراحة فقط.
 * ما لم يُذكر لا يُخمَّن. الأنواع غير المذكورة لا تظهر في counts.
 */
export async function interpretFree(text, { local = requestLocalBrief } = {}) {
  const brief = await local({ prompt: text, previous: { rooms: [] } });
  const tally = {};
  for (const r of brief.rooms || []) tally[r.type] = (tally[r.type] || 0) + 1;
  const map = { bedrooms: 'bedroom', majlis: 'majlis', baths: 'bath', kitchens: 'kitchen', halls: 'living', dining: 'dining' };
  const counts = {};
  for (const [field, type] of Object.entries(map)) if (tally[type] !== undefined) counts[field] = tally[type];
  return { text, counts, assumptions: brief.assumptions || [], questions: [...(brief.questions || []), ...(brief.unhandled || [])] };
}

// ------------------------------------------------------------------------------------------------ من المرشح إلى المرسم
/** يحوّل نموذج المحرك إلى مستند مرسم، ويضيف الشوارع والمداخل المتعددة التي لا يعرفها المحوّل. */
export function modelToStudioDoc(model, land, { title = 'تصميم أولي من شرعاء' } = {}) {
  const { doc, report } = legacyToDoc(model, { title });
  let out = doc;
  if (land) out = applyCommand(out, { type: 'set-plot', streets: land.streets, entries: land.entries }).doc;
  return { doc: out, report };
}

const PASS_CODES = ['VILLA_EXHAUSTED', 'VILLA_NO_BLEND'];
/**
 * التوليد كما يراه الموقع: **يصمّم دائمًا**. يجرّب الطلب كما هو؛ فإن لم يجد المولّد توزيعًا سليمًا مشى «سلّم الاتساع»
 * (fit-ladder.mjs): دوران إن لم يحدَّد عدد الأدوار، ثم تصغير، ثم استبعاد الأقل أولوية، حتى يخرج تصميم سليم، ويعيد معه
 * `fit` (ما خُفّف، والحقائق بالأرقام) لتُعرض على العميل بيانًا صريحًا. الطلب الأصلي لا يُعدَّل: سجل التنفيذ يبقى يقيس عليه.
 * strict: السلوك الدقيق بلا سلّم (للتشخيص والاختبار)؛ engine='legacy' كذلك. fitHint: درجات سلّم سبق نجاحها لهذا الطلب.
 */
export async function generateInitialDesign(args) {
  const { strict = false, fitHint = null, ...a } = args;
  if (strict || a.engine === 'legacy') return generateExact(a);
  normalizeLand(a.land); // أخطاء الإدخال تُرمى كما هي
  let first = null;
  if (!fitHint) try { return await generateExact(a); } catch (err) { if (PASS_CODES.includes(err.code) || /غرفة نوم واحدة على الأقل/.test(err.message || '')) throw err; first = err; }
  const disc = normalizeDiscovery(a.discovery);
  const c0 = a.counts && Object.values(a.counts).some(v => Number.isInteger(v) && v > 0) ? a.counts : countsFromRooms(a.rooms || []);
  const req0 = { ...(a.requirements || extractRequirements(a.idea || '', { counts: c0, discovery: disc })) }; req0.counts = { ...(req0.counts || {}), ...c0 };
  let last = first;
  const attempt = async (req, { probe }) => {
    try { return await generateExact({ ...a, rooms: safeRooms(req.counts), counts: req.counts, requirements: req, engine: 'villa', keep: probe ? 1 : undefined }); }
    catch (err) { if (PASS_CODES.includes(err.code)) throw err; last = err; return null; }
  };
  const got = await climb(req0, a.land, attempt, { hint: fitHint });
  if (!got) {
    if (fitHint) return generateInitialDesign({ ...a, strict: false });
    let f = null; try { f = fitFacts(a.land); } catch { /* بلا حقائق */ }
    const err = Error(`لم أستطع توليد تصميم سليم لهذه الأرض حتى بأصغر برنامج (غرفة نوم ومطبخ وصالة)${f ? `: المسطح القابل للبناء بعد الارتدادات ${f.W} × ${f.D} م، وأصغر ما يدعمه المولّد حاليًا عرض ${NARROW.trainMinW} م وعمق ${NARROW.slimMinD} م` : ''}. هذا حدّ في المولّد لا حكم على أرضك؛ يمكنك الرسم يدويًا في المرسم.`);
    err.code = 'FIT_IMPOSSIBLE'; err.cause = last; throw err;
  }
  const out = got.out, f = (() => { try { return fitFacts(a.land); } catch { return null; } })();
  out.fit = { applied: got.applied, floors: got.floors, floorsAsked: got.asked, facts: f, need: programNeed(req0), firstError: String(first?.message || '').slice(0, 300) };
  if (got.applied.length || got.floors !== got.asked.floors) out.notes = ['لم أجد توزيعًا سليمًا للبرنامج كاملًا على هذه الأرض؛ صمّمت أقرب ما يتسع، والتفاصيل في «بيان ما تغيّر عن طلبك» مع خيارات تقررها أنت.', ...(out.notes || [])];
  for (const alt of out.alternatives || []) alt.fit = out.fit;
  return out;
}
function safeRooms(counts) { try { return defaultRooms(counts); } catch { return []; } }

/** التوليد الدقيق للطلب كما هو: أي فشل يُرمى كما هو (لا بديل صامت). */
async function generateExact({ land, rooms, discovery, idea = '', seed = 1, counts = null, requirements = null, engine = 'auto', exclude = [], prefer = null, shown = [], blend = null, keep = undefined }) {
  const { plot, land: normLand0 } = normalizeLand(land);
  // عدد الأدوار المذكور في كلام العميل («دورين») يتقدم على الافتراضي في بيانات الأرض
  const reqFloors = requirements?.prefs?.floors ?? null;
  const normLand = reqFloors && reqFloors !== normLand0.floors ? { ...normLand0, floors: reqFloors } : normLand0;
  const disc = normalizeDiscovery(discovery);
  if (normLand.floors >= 2 && engine === 'legacy') return generateMultiFloorDesign({ plot, land: normLand, rooms, discovery: disc, idea, seed });
  if (normLand.floors >= 2) {
    const c2 = counts && Object.values(counts).some(v => Number.isInteger(v) && v > 0) ? counts : countsFromRooms(rooms);
    const req2 = requirements || extractRequirements(idea || '', { counts: c2, discovery: disc });
    try { return villaTwoFloors({ land: normLand, counts: c2, requirements: req2, exclude, prefer, shown, blend, keep }); }
    catch (err) { if (engine === 'villa') throw err; if (!['VILLA_NO_FIT', 'VILLA_BUILD_FAILED', 'VILLA_NO_UPPER', 'VILLA_NO_GROUND'].includes(err.code)) throw err; if (exclude.length || shown.length || blend) throw err; const out = await generateMultiFloorDesign({ plot, land: normLand, rooms, discovery: disc, idea, seed }); out.notes.unshift('المولّد المهني لم يجد توزيعًا لدورين (' + err.message + ')؛ استُخدم المحرك السابق.'); return out; }
  }
  // المولّد المهني أولًا (أجنحة نوم بحماماتها، صالة محورية، مجلس بممر ضيوف ودورة مياه)؛ المحرك السابق احتياط فقط
  const villaCounts = counts && Object.values(counts).some(v => Number.isInteger(v) && v > 0) ? counts : countsFromRooms(rooms);
  let villaFail = null;
  const req = requirements || extractRequirements(idea || '', { counts: villaCounts, discovery: disc });
  if (engine !== 'legacy') try { return villaDesign({ plot, land: normLand, rooms, discovery: disc, idea, counts: villaCounts, requirements: req, exclude, prefer, shown, blend, keep }); }
  catch (err) { if (engine === 'villa') throw err; if (!['VILLA_NO_FIT', 'VILLA_BUILD_FAILED'].includes(err.code) || exclude.length || shown.length || blend) throw err; villaFail = err.message; }
  const result = await runMultiEngineDesign({ plot, rooms, idea, discovery: disc, seed });
  const { doc, report } = modelToStudioDoc(result.selectedModel, land);
  const notes = [];
  if (villaFail) notes.push('المولّد المهني لم يجد توزيعًا لهذا البرنامج (' + villaFail + ')؛ استُخدم المحرك السابق.');
  if (report.areaMismatch.length) notes.push(`${report.areaMismatch.length} فراغ تختلف مساحته عن المطلوب بعد التحويل؛ راجعها في المرسم.`);
  if (report.unmatched.length) notes.push(`${report.unmatched.length} فراغ لم يُطابَق بعد التحويل.`);
  if (land.entries.length > 1) notes.push('المحرك يوزّع الغرف بحسب المدخل الأول فقط؛ بقية المداخل مسجّلة في الأرض ولم تؤثر في التوزيع.');
  // بصمة التصميم: تقييم كل بديل بميزان العميل. اختيار AZIZ يبقى هو المعتمد؛ البدائل تُعرض للقرار.
  let dna = null, alternatives = [];
  try {
    dna = rankByDNA({ plot, rooms, discovery: disc, idea, counts: counts || {}, models: result.models, selectedIndex: result.selectedIndex });
    for (const row of dna.rows) {
      try { alternatives.push({ index: row.index, strategy: row.strategy, doc: row.index === result.selectedIndex ? doc : modelToStudioDoc(result.models[row.index], land).doc }); } catch { /* بديل لم يتحوّل: لا يُعرض */ }
    }
    dna.geometryFingerprint = geometryFingerprint(doc);
    // مقارنة ثانوية تراعي الفتحات (AZ-06): للعرض فقط، لا تغيّر selectedIndex ولا ترتيب البدائل.
    try { dna.openingAware = compareOpeningAware({ models: result.models, selectedIndex: result.selectedIndex }); } catch { dna.openingAware = null; }
  } catch (err) { notes.push('تعذّر حساب بصمة التصميم: ' + (err.message || err)); }
  return { doc, report, notes, dna, alternatives, alternativesCount: result.models.length, selectedIndex: result.selectedIndex, strategy: result.selectedModel.strategy };
}

/** المولّد المهني لدور واحد: البدائل مستندات مرسم مباشرة؛ بصمة التصميم تُحسب من نماذجها المصدّرة. */
function villaDesign({ plot, land, rooms, discovery, idea, counts, requirements, exclude = [], prefer = null, shown = [], blend = null, keep = undefined }) {
  // حتى خمسة بدائل مختلفة مرئيًا من المرة الأولى
  const out = generateVillaDesigns({ land, counts, requirements, keep: blend ? 1 : keep || 5, exclude, prefer, shown, blend });
  const best = out.designs[0], notes = [...new Set(best.notes)];
  let dna = null; const alternatives = out.designs.map((d, i) => ({ index: i, strategy: 'villa-' + d.mode, doc: d.doc, pat: d.pat, summary: d.summary, notes: d.notes }));
  try {
    const models = out.designs.map(d => ({ ...docToLegacy(d.doc).model, strategy: 'villa-' + d.mode }));
    dna = rankByDNA({ plot, rooms, discovery, idea, counts, models, selectedIndex: 0 });
    dna.geometryFingerprint = geometryFingerprint(best.doc);
    try { dna.openingAware = compareOpeningAware({ models, selectedIndex: 0 }); } catch { dna.openingAware = null; }
  } catch (err) { notes.push('تعذّر حساب بصمة التصميم: ' + (err.message || err)); }
  return { doc: best.doc, report: { areaMismatch: [], unmatched: [] }, notes, dna, alternatives, alternativesCount: out.designs.length, selectedIndex: 0, strategy: 'villa-' + best.mode, engine: out.engine, summary: best.summary, pat: best.pat, ledger: best.ledger || [], same: !!best.same, mirror: !!best.mirror };
}

/** المولّد المهني لدورين: البدائل مستندات بمستويين؛ بصمة التصميم المقارنة تُعرض لدور واحد فقط كما سبق. */
function villaTwoFloors({ land, counts, requirements, exclude = [], prefer = null, shown = [], blend = null, keep = undefined }) {
  const out = generateVillaTwoFloors({ land, counts, requirements, keep: blend ? 1 : keep || 5, exclude, prefer, shown, blend });
  const best = out.designs[0];
  return { doc: best.doc, report: { areaMismatch: [], unmatched: [] }, notes: [...best.notes, 'بصمة التصميم المقارنة تُحسب لدور واحد؛ البدائل متاحة.'], dna: null, alternatives: out.designs.map((d, i) => ({ index: i, strategy: 'villa2-' + d.mode, doc: d.doc, pat: d.pat, summary: d.summary, notes: d.notes })), alternativesCount: out.designs.length, selectedIndex: 0, strategy: 'villa2-' + best.mode, floors: 2, engine: out.engine, summary: best.summary, pat: best.pat, ledger: best.ledger || [], same: !!best.same, mirror: !!best.mirror };
}

/** دوران: الأرضي والعلوي بسلم متطابق (انظر multi-floor.mjs). بلا بصمة تصميم ولا بدائل: تُقدَّم لدور واحد فقط. */
async function generateMultiFloorDesign({ plot, land, rooms, discovery, idea, seed }) {
  const out = await generateTwoFloors({ plot, land, rooms, discovery, idea, seed, toDoc: modelToStudioDoc });
  const notes = [...out.notes];
  if (out.report.areaMismatch.length) notes.push(`${out.report.areaMismatch.length} فراغ تختلف مساحته عن المطلوب بعد التحويل؛ راجعها في المرسم.`);
  if (out.report.unmatched.length) notes.push(`${out.report.unmatched.length} فراغ لم يُطابَق بعد التحويل.`);
  if (land.entries.length > 1) notes.push('المحرك يوزّع الغرف بحسب المدخل الأول فقط؛ بقية المداخل مسجّلة في الأرض ولم تؤثر في التوزيع.');
  notes.push('بصمة التصميم والبدائل غير متاحة في الدورين؛ تظهر لدور واحد فقط.');
  return { doc: out.doc, report: out.report, notes, dna: null, alternatives: [], alternativesCount: 1, selectedIndex: out.selectedIndex, strategy: out.strategy, floors: 2, multiFloor: out.program };
}

/**
 * تشخيص فشل التوليد: أرقام محسوبة من محرك الأرض نفسه + تجارب فعلية على المحرك لكل تعديل ممكن.
 * لا يُطبَّق شيء هنا. يعيد حقائق وخيارات، وكل خيار نجح فعلًا أو فشل فعلًا في تجربة؛ والقرار للعميل.
 * المحرك لا يخبرنا أي غرفة بعينها هي المعطِّلة؛ لذلك تظهر النتيجة كتجارب (ينجح/لا ينجح) لا كتفسير مفترض.
 */
export async function diagnoseFit({ land, counts, discovery, idea = '', maxGrow = 4, engine = 'auto' }) {
  const { plot, land: normLand } = normalizeLand(land);
  land = normLand;
  const floors = land.floors;
  // حقائق الأرض من مسطح المولّد نفسه (الارتدادات النظامية لهذه الأرض ووجه الجدار الخارجي)، لا من افتراض المحرك السابق (3 م لكل شارع)؛ engine='legacy' يبقى على حقائق محركه
  const d = footprintDiagnostics(plot);
  if (engine !== 'legacy') try {
    const fp = generatorFootprint(land, plot), sn = ['s', 'n'].includes(plot.entry), gw = Math.max(0, plot.width - fp.sb.w - fp.sb.e), gd = Math.max(0, plot.length - fp.sb.n - fp.sb.s);
    Object.assign(d, { setbacks: { ...fp.sb }, afterSetbacks: { width: gw, depth: gd, area: gw * gd }, net: { width: fp.w, depth: fp.h, area: fp.area }, frontage: sn ? fp.w : fp.h, depth: sn ? fp.h : fp.w });
  } catch { /* تبقى حقائق المحرك السابق */ }
  const programArea = c => defaultRooms(c).reduce((a, r) => a + (r.area || 0), 0);
  const required = programArea(counts);
  const perType = COUNT_FIELDS.filter(f => counts[f.id] > 0).map(f => {
    const unit = defaultRooms({ bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0, [f.id]: 1 }).reduce((a, r) => a + r.area, 0);
    return { id: f.id, label: f.label, count: counts[f.id], unit, total: unit * counts[f.id] };
  });
  const facts = {
    plotArea: d.plotWidth * d.plotLength, plotWidth: d.plotWidth, plotLength: d.plotLength, entry: d.entry,
    setbacks: d.setbacks, coverage: d.coverage, afterSetbacks: d.afterSetbacks, coverageCap: d.coverageCap,
    net: d.net, frontage: d.frontage, depth: d.depth, required, share: d.net.area > 0 ? required / (d.net.area * floors) : 0, perType, floors,
  };
  if (floors >= 2) {
    // مساحة كل دور مع غرفة السلم، مقابل المساحة المبنية المتاحة للدور الواحد (الأرضي) وكتلته هي سقف العلوي
    const sp = splitProgram(defaultRooms(counts)), stair = STAIR_W * STAIR_H, sumA = l => l.reduce((a, r) => a + r.area, 0);
    facts.floorsFacts = [
      { label: 'الدور الأرضي', rooms: sp.ground.length, required: sumA(sp.ground) + stair, available: d.net.area },
      { label: 'الدور العلوي', rooms: sp.upper.length, required: sumA(sp.upper) + stair, available: d.net.area },
    ];
    facts.stairArea = stair;
  }
  const works = async (l, c) => { try { await generateInitialDesign({ land: l, rooms: defaultRooms(c), discovery, idea, counts: c, engine, strict: true }); return true; } catch { return false; } };
  const floor = { bedrooms: 1, majlis: 0, baths: 1, kitchens: 1, halls: 0, dining: 0 };
  const options = [];
  for (const f of COUNT_FIELDS) {
    if (counts[f.id] <= floor[f.id]) continue;
    const to = { ...counts, [f.id]: counts[f.id] - 1 };
    options.push({ kind: 'reduce', field: f.id, label: `${f.label}: ${counts[f.id]} ← ${to[f.id]}`, counts: to, land, ok: await works(land, to), area: programArea(to) });
  }
  for (const dim of ['width', 'length']) {
    for (let n = 1; n <= maxGrow; n++) {
      const grown = { ...land, [dim]: land[dim] + n };
      if (await works(grown, counts)) { options.push({ kind: 'land', field: dim, label: `${dim === 'width' ? 'عرض' : 'طول'} الأرض: ${land[dim]} ← ${grown[dim]} م`, counts, land: grown, ok: true }); break; }
      if (n === maxGrow) options.push({ kind: 'land', field: dim, label: `${dim === 'width' ? 'عرض' : 'طول'} الأرض حتى +${maxGrow} م`, counts, land, ok: false });
    }
  }
  if (land.streets.length > 1) {
    for (const s of land.streets.filter(x => x !== land.entries[0])) {
      const moved = { ...land, entries: [s, ...land.entries.filter(x => x !== s && x !== land.entries[0])] };
      options.push({ kind: 'entry', field: s, label: `نقل المدخل الأول إلى جهة ${SIDE_LABELS[s]}`, counts, land: moved, ok: await works(moved, counts) });
    }
  }
  return { facts, options };
}

/** رسالة قصيرة للعميل بدل تفاصيل كل محرك. الخطأ الأصلي يبقى في التفاصيل التقنية. */
export function friendlyBuildError(err) {
  const raw = String(err?.message || err || '');
  if (err instanceof MultiFloorError) return raw;
  if (/No candidate passed|لم يجد محرك/.test(raw)) return 'لم أجد توزيعًا يتسع لهذا البرنامج في دور واحد على هذه الأرض، دون حذف أو تصغير أي غرفة.';
  return raw || 'تعذّر توليد التصميم.';
}

// ------------------------------------------------------------------------------------------------ معاينة الأرض
/** معاينة SVG للأرض: المستطيل بنسبته، والشوارع خطوط خارجه، والمداخل علامات على الضلع. نص آمن (أرقام فقط). */
export function landPreviewSvg({ length, width, streets = [], entries = [] } = {}) {
  const L = Number(length), W = Number(width);
  const ok = Number.isFinite(L) && Number.isFinite(W) && L > 0 && W > 0;
  const box = 220, pad = 34, k = ok ? (box - pad * 2) / Math.max(L, W) : 1;
  const w = ok ? W * k : 100, h = ok ? L * k : 130;
  const x = (box - w) / 2, y = (box - h) / 2;
  const street = { n: `<rect class="pv-street" x="${x - 6}" y="${y - 14}" width="${w + 12}" height="8" rx="4"/>`, s: `<rect class="pv-street" x="${x - 6}" y="${y + h + 6}" width="${w + 12}" height="8" rx="4"/>`,
    e: `<rect class="pv-street" x="${x + w + 6}" y="${y - 6}" width="8" height="${h + 12}" rx="4"/>`, w: `<rect class="pv-street" x="${x - 14}" y="${y - 6}" width="8" height="${h + 12}" rx="4"/>` };
  const door = { n: `<rect class="pv-door" x="${x + w / 2 - 14}" y="${y - 3}" width="28" height="6" rx="3"/>`, s: `<rect class="pv-door" x="${x + w / 2 - 14}" y="${y + h - 3}" width="28" height="6" rx="3"/>`,
    e: `<rect class="pv-door" x="${x + w - 3}" y="${y + h / 2 - 14}" width="6" height="28" rx="3"/>`, w: `<rect class="pv-door" x="${x - 3}" y="${y + h / 2 - 14}" width="6" height="28" rx="3"/>` };
  const label = (t, lx, ly) => `<text class="pv-label" x="${lx}" y="${ly}" text-anchor="middle">${t}</text>`;
  return `<svg viewBox="0 0 ${box} ${box}" role="img" aria-label="معاينة الأرض"><rect class="pv-plot" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`
    + streets.filter(s => street[s]).map(s => street[s]).join('') + entries.filter(s => door[s]).map(s => door[s]).join('')
    + label('شمال', box / 2, 12) + label('جنوب', box / 2, box - 5) + label('شرق', box - 14, box / 2 + 4) + label('غرب', 14, box / 2 + 4) + '</svg>';
}
