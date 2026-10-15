// منطق الصفحة الرئيسية: الأرض (طول وعرض وشوارع ومداخل) ← شرعاء ← تصميم أولي داخل المرسم.
// وحدة نقية بلا DOM: كل ما فيها قابل للاختبار بـ node. الواجهة في home.mjs.
import { validatePlot, defaultRooms } from './planner.mjs';
import { normalizeDiscovery, AVOIDS, LIFE } from './client-brief.mjs';
import { runMultiEngineDesign } from './multi-engine.mjs';
import { requestLocalBrief } from './local-nlp.mjs';
import { legacyToDoc } from './draw/import-legacy.mjs';
import { applyCommand } from './draw/doc.mjs';

export const SHARA_NAME = 'شرعاء';
export const SHARA_WELCOME = 'أهلاً بك، أنا شرعاء، مساعدك الذكي لفهم احتياجاتك في تصميم منزلك.';
export const SHARA_GOAL = 'سأسألك عن نمط حياتك لأفهمك، ثم أبني عليه تصميمًا دقيقًا يناسبك.';
export const SIDE_LABELS = Object.freeze({ n: 'شمال', s: 'جنوب', e: 'شرق', w: 'غرب' });
const SIDES = Object.keys(SIDE_LABELS);

// ------------------------------------------------------------------------------------------------ الأرض
/**
 * الأرض كما يدخلها العميل: الطول (شمال/جنوب) والعرض (شرق/غرب) بالمتر، والشوارع، والمداخل.
 * «الاتجاه» هو المدخل: قد يكون للأرض مدخلان على جهتين، وتطل على شارعين أو ثلاثة.
 * الشمال أعلى الرسم كما في الصفحة القديمة؛ لا زاوية شمال هنا.
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
  const plot = validatePlot({ width, length, floors: 1, streets: Object.fromEntries(streets.map(s => [s, true])), entry: entries[0] });
  return { plot, land: { length, width, streets, entries } };
}

// ------------------------------------------------------------------------------------------------ شرعاء
const COUNT_FIELDS = Object.freeze([
  { id: 'bedrooms', label: 'غرف النوم', min: 1, max: 10, def: 4 },
  { id: 'majlis', label: 'المجالس', min: 0, max: 10, def: 2 },
  { id: 'baths', label: 'دورات المياه', min: 0, max: 10, def: 3 },
  { id: 'kitchens', label: 'المطابخ', min: 0, max: 10, def: 1 },
  { id: 'halls', label: 'الصالات', min: 0, max: 10, def: 1 },
  { id: 'dining', label: 'غرف الطعام', min: 0, max: 10, def: 1 },
]);
export const ENGINEERING_FIELDS = COUNT_FIELDS;

// أسئلة نمط الحياة: القيم من قوائم client-brief نفسها حتى لا يرفضها normalizeDiscovery.
const HOUSEHOLD = Object.freeze([
  { id: 'guests', label: 'ضيوف متكررون' },
  { id: 'children', label: 'أطفال' },
  { id: 'seniors', label: 'كبار سن' },
  { id: 'future', label: 'توسع مستقبلي مهم' },
]);
const msg = (text, extra = {}) => ({ from: 'shara', text, ...extra });

/**
 * جلسة حوار شرعاء. تعيد رسائل (خطوات) بسيطة تعرضها الواجهة.
 * التكيّف: الأسئلة الفرعية تظهر فقط عند اختيار ذي صلة، ويُتخطى ما أجاب عنه العميل بحديثه الحر.
 * لا فهم دلالي حرّ هنا؛ النص الحر يمرّ على الفهم المحلي (أو الذكاء إن أُدخل رمز الدخول).
 */
export class SharaSession {
  constructor() {
    this.mode = null; this.phase = 'mode';
    this.life = {}; this.avoids = []; this.counts = Object.fromEntries(COUNT_FIELDS.map(f => [f.id, f.def]));
    this.idea = ''; this.freeRooms = null; this.followups = []; this.log = [];
  }
  start() {
    return this.#push([
      msg(SHARA_WELCOME),
      msg('كيف تحب أن نبدأ؟', { kind: 'choice', id: 'mode', options: [{ id: 'free', label: 'أتحدث بحرية' }, { id: 'guided', label: 'اسألني أسئلة محددة' }] }),
    ]);
  }
  #push(list) { this.log.push(...list); return list; }
  #household() {
    return msg('من سيعيش في البيت أو يزوره؟ يمكنك اختيار أكثر من إجابة.', { kind: 'multi', id: 'household', options: HOUSEHOLD });
  }
  #avoids() {
    return msg('ما الذي تريد تجنبه في بيتك؟ اختر ما يناسبك.', { kind: 'multi', id: 'avoids', options: AVOIDS.map((label, i) => ({ id: String(i), label })) });
  }
  #counts() {
    return msg('الآن أسئلة هندسية مباشرة: كم تحتاج من كل نوع؟', { kind: 'counts', id: 'counts', fields: COUNT_FIELDS.map(f => ({ ...f, value: this.counts[f.id] })) });
  }
  #ready() {
    this.phase = 'ready';
    return msg('تم تسجيل احتياجاتك. اضغط «توليد التصميم» لأفتح لك تصميمًا أوليًا داخل المرسم تعدّل عليه بيدك.', { kind: 'generate', id: 'generate' });
  }
  #nextFollowup() {
    const f = this.followups.shift();
    return f ? msg('أين تفضّل أن يكون الأطفال؟', { kind: 'choice', id: 'children', options: LIFE.children.map(label => ({ id: label, label })) }) : null;
  }
  /** answer(id, value): value حسب نوع السؤال. يعيد الرسائل التالية. */
  answer(id, value) {
    const out = [];
    if (id === 'mode') {
      if (!['free', 'guided'].includes(value)) throw Error('اختيار غير معروف.');
      this.mode = value;
      if (value === 'free') { this.phase = 'free'; return this.#push([msg('تحدّث معي بحرية عن بيتك وكيف تحب أن تعيش فيه.', { kind: 'text', id: 'free' })]); }
      this.phase = 'household';
      return this.#push([msg(SHARA_GOAL), this.#household()]);
    }
    if (id === 'free') {
      const text = String(typeof value === 'string' ? value : value?.text || '').trim();
      if (text.length < 3) throw Error('اكتب وصفًا قصيرًا على الأقل.');
      this.idea = text.slice(0, 4000); this.phase = 'counts';
      // أعداد مفهومة من النص تحلّ محل الافتراضات؛ ما لم يُفهم يبقى افتراضيًا ويُعرض للمراجعة.
      const seen = value?.counts && typeof value.counts === 'object' ? value.counts : {};
      for (const f of COUNT_FIELDS) if (Number.isInteger(seen[f.id]) && seen[f.id] >= f.min && seen[f.id] <= f.max) this.counts[f.id] = seen[f.id];
      const notes = [...(value?.assumptions || []), ...(value?.questions || [])].filter(x => typeof x === 'string' && x.trim()).slice(0, 4);
      return this.#push([msg('فهمت. راجع الأعداد التالية وعدّلها إن لزم.' + (notes.length ? '\n' + notes.join('\n') : '')), this.#counts()]);
    }
    if (id === 'household') {
      const picked = Array.isArray(value) ? value : [];
      const ids = HOUSEHOLD.map(h => h.id);
      if (picked.some(p => !ids.includes(p))) throw Error('اختيار غير معروف.');
      this.life = {};
      if (picked.includes('guests')) this.life.guests = LIFE.guests[1];
      if (picked.includes('seniors')) this.life.seniors = LIFE.seniors[0];
      if (picked.includes('future')) this.life.future = LIFE.future[0];
      if (picked.includes('children')) this.followups.push('children');
      this.phase = 'avoids';
      const follow = this.#nextFollowup();
      return this.#push(follow ? [follow] : [this.#avoids()]);
    }
    if (id === 'children') {
      if (!LIFE.children.includes(value)) throw Error('اختيار غير معروف.');
      this.life.children = value;
      return this.#push([this.#avoids()]);
    }
    if (id === 'avoids') {
      const picked = Array.isArray(value) ? value : [];
      if (picked.some(p => !AVOIDS[Number(p)])) throw Error('اختيار غير معروف.');
      this.avoids = picked.map(p => AVOIDS[Number(p)]);
      this.phase = 'counts';
      return this.#push([this.#counts()]);
    }
    if (id === 'counts') {
      const next = {};
      for (const f of COUNT_FIELDS) {
        const v = Number(value?.[f.id]);
        if (!Number.isInteger(v) || v < f.min || v > f.max) throw Error(`${f.label}: عدد صحيح بين ${f.min} و${f.max}.`);
        next[f.id] = v;
      }
      this.counts = next;
      return this.#push([this.#ready()]);
    }
    throw Error('خطوة غير معروفة.');
  }
  discovery() { return normalizeDiscovery({ likes: [], rejects: [], avoids: this.avoids, life: this.life }); }
  rooms() { return defaultRooms(this.counts); }
}

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

/** يشغّل محرك التوليد الحالي ويعيد التصميم المختار مستندًا للمرسم. أي فشل يُرمى كما هو (لا بديل صامت). */
export async function generateInitialDesign({ land, rooms, discovery, idea = '', seed = 1 }) {
  const { plot } = normalizeLand(land);
  const result = await runMultiEngineDesign({ plot, rooms, idea, discovery: normalizeDiscovery(discovery), seed });
  const { doc, report } = modelToStudioDoc(result.selectedModel, land);
  const notes = [];
  if (report.areaMismatch.length) notes.push(`${report.areaMismatch.length} فراغ تختلف مساحته عن المطلوب بعد التحويل؛ راجعها في المرسم.`);
  if (report.unmatched.length) notes.push(`${report.unmatched.length} فراغ لم يُطابَق بعد التحويل.`);
  if (land.entries.length > 1) notes.push('المحرك يوزّع الغرف بحسب المدخل الأول فقط؛ بقية المداخل مسجّلة في الأرض ولم تؤثر في التوزيع.');
  return { doc, report, notes, alternatives: result.models.length, selectedIndex: result.selectedIndex, strategy: result.selectedModel.strategy };
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
