// منطق الصفحة الرئيسية: الأرض (طول وعرض وشوارع ومداخل) ← شرعاء ← تصميم أولي داخل المرسم.
// وحدة نقية بلا DOM: كل ما فيها قابل للاختبار بـ node. الواجهة في home.mjs.
import { validatePlot, defaultRooms } from './planner.mjs';
import { footprintDiagnostics } from './claude/planner.mjs';
import { rankByDNA, geometryFingerprint } from './design-dna.mjs';
import { compareOpeningAware } from './opening-aware.mjs';
import { normalizeDiscovery, AVOIDS, LIFE } from './client-brief.mjs';
import { runMultiEngineDesign } from './multi-engine.mjs';
import { requestLocalBrief } from './local-nlp.mjs';
import { legacyToDoc } from './draw/import-legacy.mjs';
import { applyCommand } from './draw/doc.mjs';
import { generateTwoFloors, MultiFloorError, splitProgram, STAIR_W, STAIR_H, programFromCounts } from './multi-floor.mjs';
import { generateVillaDesigns as v1Designs, generateVillaTwoFloors as v1TwoFloors, countsFromRooms } from './villa-layout.mjs';
import { generateVillaDesigns as v2Designs, generateVillaTwoFloors as v2TwoFloors } from './villa-layout-v2.mjs';
// المولّد المهني: الإصدار الثاني (أنماط تنظيمية + مراجعة مستقلة نهائية) افتراضيًا؛ الأول متاح بـ engine:'v1'
const VILLA = { v1: { one: v1Designs, two: v1TwoFloors }, v2: { one: v2Designs, two: v2TwoFloors } };
const villaEngineOf = engine => (engine === 'v1' ? 'v1' : 'v2');
import { extractRequirements, withAi, detectConflicts } from './requirements.mjs';
import { docToLegacy } from './draw/export-legacy.mjs';

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
  // الأدوار: واحد أو اثنان فقط. plot يبقى بدور واحد لأنه أرض المحرك لكل دور؛ عدد الأدوار في land.floors.
  const floors = raw.floors === undefined || raw.floors === null || raw.floors === '' ? 1 : Number(raw.floors);
  if (!Number.isInteger(floors) || floors < 1) throw Error('عدد الأدوار يجب أن يكون 1 أو 2.');
  if (floors > 2) throw Error('ثلاثة أدوار أو أكثر غير مدعومة بعد؛ المتاح دور أو دوران.');
  const plot = validatePlot({ width, length, floors: 1, streets: Object.fromEntries(streets.map(s => [s, true])), entry: entries[0] });
  // مضلع الأرض (أرض غير منتظمة) يمر كما هو إلى المولّد الثاني؛ يُهمل إن لم يكن نقاطًا رقمية صالحة
  const polygon = Array.isArray(raw.polygon) && raw.polygon.length >= 3 && raw.polygon.every(p => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) ? raw.polygon.map(p => ({ x: Number(p.x), y: Number(p.y) })) : null;
  // (الجولة الثالثة عشرة) عرض شارع المدخل (م) إن عُرف: الارتداد الأمامي النظامي خُمس العرض (≥ 3 م، و≥ 6 م لشوارع ≥ 30 م)؛ وإلا 3 م افتراضًا ويُسأل
  const sw = raw.streetWidth === undefined || raw.streetWidth === null || raw.streetWidth === '' ? null : Number(raw.streetWidth);
  if (sw !== null && !(Number.isFinite(sw) && sw >= 4 && sw <= 120)) throw Error('عرض الشارع بالمتر بين 4 و120، أو اتركه فارغًا.');
  return { plot, land: { length, width, streets, entries, floors, ...(polygon ? { polygon } : {}), ...(sw ? { streetWidth: sw } : {}) } };
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
    this.life = {}; this.avoids = []; this.counts = {}; // لا قيم مسبقة: كل عدد يُدخله العميل أو يُفهم من كلامه
    this.idea = ''; this.freeRooms = null; this.followups = []; this.log = []; this.requirements = null;
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
    return msg('الآن أسئلة هندسية مباشرة: كم تحتاج من كل نوع؟', { kind: 'counts', id: 'counts', fields: COUNT_FIELDS.map(f => ({ ...f, value: this.counts[f.id] ?? '' })) });
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
      // ما يتجاوز الأعداد (حمام لكل غرفة، مطبخ مفتوح، خادمة، مدخل مستقل، مقاسات...) يُستخرج من النص نفسه ويصل للمولّد
      // فهم Claude (إن أُدخل رمز الدخول) يُدمج مع الفهم المحلي؛ المحلي يتقدم عند التعارض
      const req = withAi(extractRequirements(text, { counts: value?.counts && typeof value.counts === 'object' ? value.counts : {} }), value?.requirements || null);
      this.requirements = req;
      // أعداد مفهومة من النص تُعبّأ مسبقًا؛ ما لم يُفهم يبقى فارغًا ويُطلب من العميل.
      const seen = req.counts;
      for (const f of COUNT_FIELDS) if (Number.isInteger(seen[f.id]) && seen[f.id] >= f.min && seen[f.id] <= f.max) this.counts[f.id] = seen[f.id];
      const notes = [...(value?.assumptions || []), ...(value?.questions || [])].filter(x => typeof x === 'string' && x.trim()).slice(0, 4);
      const out = [];
      if (req.understood.length) out.push(msg('فهمت من كلامك وسأطبّقه في التصميم:', { kind: 'list', items: req.understood }));
      if (req.unsupported.length) out.push(msg('لن أطبّقه في هذا الإصدار:', { kind: 'list', items: req.unsupported }));
      if (req.unclear?.length) out.push(msg('هذه العبارات لم أفهمها بدقة، فلن أطبّقها كما هي. أعد كتابتها بصيغة مباشرة مثل: «المطبخ في الخلف»، «الماستر بعيدة عن المجلس»، «غرفة 4×5»، «المجلس على يمين المدخل».', { kind: 'list', items: req.unclear.map(x => '«' + x + '»') }));
      // تعارض في الكلام نفسه («المطبخ في الأمام وفي الخلف»): سؤال صريح قبل التوليد
      let conflicts = []; try { conflicts = detectConflicts(req, {}); } catch { conflicts = []; }
      if (conflicts.length) out.push(msg('قبل التصميم أبي أتأكد منك:', { kind: 'list', items: conflicts.map(c => c.question_ar) }));
      out.push(msg('راجع الأعداد التالية وعدّلها إن لزم.' + (notes.length ? '\n' + notes.join('\n') : '')));
      return this.#push([...out, this.#counts()]);
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
      // الأعداد النهائية من العميل تحكم؛ المتطلبات الأخرى تبقى كما فُهمت (وفي الإرشادي تُشتق من نمط الحياة)
      this.requirements = { ...(this.requirements || extractRequirements('', { discovery: this.discovery() })), counts: next };
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
export async function generateInitialDesign({ land, rooms, discovery, idea = '', seed = 1, counts = null, requirements = null, engine = 'auto', exclude = [], prefer = null }) {
  const { plot, land: normLand0 } = normalizeLand(land);
  // عدد الأدوار المذكور في كلام العميل («دورين») يتقدم على الافتراضي في بيانات الأرض
  const reqFloors = requirements?.prefs?.floors ?? null;
  const normLand = reqFloors && reqFloors !== normLand0.floors ? { ...normLand0, floors: reqFloors } : normLand0;
  const disc = normalizeDiscovery(discovery);
  if (normLand.floors >= 2 && engine === 'legacy') return generateMultiFloorDesign({ plot, land: normLand, rooms, discovery: disc, idea, seed });
  if (normLand.floors >= 2) {
    const c2 = counts && Object.values(counts).some(v => Number.isInteger(v) && v > 0) ? counts : countsFromRooms(rooms);
    const req2 = requirements || extractRequirements(idea || '', { counts: c2, discovery: disc });
    try { return villaTwoFloors({ land: normLand, counts: c2, requirements: req2, exclude, prefer, engine }); }
    catch (err) { if (!['VILLA_NO_FIT', 'VILLA_BUILD_FAILED', 'VILLA_NO_UPPER', 'VILLA_NO_GROUND'].includes(err.code)) throw err; if (exclude.length) throw err; const out = await generateMultiFloorDesign({ plot, land: normLand, rooms: rooms?.length ? rooms : programFromCounts(c2), discovery: disc, idea, seed }); out.notes.unshift('المولّد المهني لم يجد توزيعًا لدورين (' + err.message + ')؛ استُخدم المحرك السابق.'); return out; }
  }
  // المولّد المهني أولًا (أجنحة نوم بحماماتها، صالة محورية، مجلس بممر ضيوف ودورة مياه)؛ المحرك السابق احتياط فقط
  const villaCounts = counts && Object.values(counts).some(v => Number.isInteger(v) && v > 0) ? counts : countsFromRooms(rooms);
  let villaFail = null;
  const req = requirements || extractRequirements(idea || '', { counts: villaCounts, discovery: disc });
  if (engine !== 'legacy') try { return villaDesign({ plot, land: normLand, rooms, discovery: disc, idea, counts: villaCounts, requirements: req, exclude, prefer, engine }); }
  catch (err) { if (!['VILLA_NO_FIT', 'VILLA_BUILD_FAILED'].includes(err.code) || exclude.length) throw err; villaFail = err.message; }
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
function villaDesign({ plot, land, rooms, discovery, idea, counts, requirements, exclude = [], prefer = null, engine = 'auto' }) {
  const villaEngine = villaEngineOf(engine);
  const out = VILLA[villaEngine].one({ land, counts, requirements, keep: 4, exclude, prefer });
  const best = out.designs[0], notes = [...new Set(best.notes)];
  let dna = null; const alternatives = out.designs.map((d, i) => ({ index: i, strategy: 'villa-' + d.mode, doc: d.doc, pat: d.pat, summary: d.summary, notes: d.notes, review: d.review || null, ledger: d.ledger || null, mirror: !!d.mirror }));
  try {
    const models = out.designs.map(d => ({ ...docToLegacy(d.doc).model, strategy: 'villa-' + d.mode }));
    dna = rankByDNA({ plot, rooms, discovery, idea, counts, models, selectedIndex: 0 });
    dna.geometryFingerprint = geometryFingerprint(best.doc);
    try { dna.openingAware = compareOpeningAware({ models, selectedIndex: 0 }); } catch { dna.openingAware = null; }
  } catch (err) { notes.push('تعذّر حساب بصمة التصميم: ' + (err.message || err)); }
  return { doc: best.doc, report: { areaMismatch: [], unmatched: [] }, notes, dna, alternatives, alternativesCount: out.designs.length, alternativesInfo: alternativesInfo(out, 4), selectedIndex: 0, strategy: 'villa-' + best.mode, engine: out.engine, villaEngine, summary: best.summary, pat: best.pat, ledger: best.ledger || [], review: best.review || null, same: !!best.same, mirror: !!best.mirror };
}

/**
 * ما يُعرض للعميل عن البدائل: كم عُرض من المطلوب، وسبب النقص كما كتبه المولّد، وأسباب رفض المرشحين مجمّعة
 * (أول سبب لكل مرشح، بعدده). لا يُخترع شيء هنا: النصوص من المولّد ومحرك المراجعة نفسيهما.
 */
export function alternativesInfo(out, requested) {
  const rejected = Array.isArray(out?.rejected) ? out.rejected : [];
  const why = new Map();
  for (const r of rejected) { const t = String((r.why || [])[0] || 'بلا سبب مكتوب').slice(0, 220); why.set(t, (why.get(t) || 0) + 1); }
  return { requested, shown: out?.designs?.length || 0, shortfall_ar: out?.shortfall_ar || null, rejectedCount: rejected.length,
    rejected: [...why].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, count]) => ({ text, count })) };
}

/** المولّد المهني لدورين: البدائل مستندات بمستويين؛ بصمة التصميم المقارنة تُعرض لدور واحد فقط كما سبق. */
function villaTwoFloors({ land, counts, requirements, exclude = [], prefer = null, engine = 'auto' }) {
  const villaEngine = villaEngineOf(engine);
  const out = VILLA[villaEngine].two({ land, counts, requirements, keep: villaEngine === 'v2' ? 4 : 3, exclude, prefer });
  const best = out.designs[0];
  return { doc: best.doc, report: { areaMismatch: [], unmatched: [] }, notes: [...best.notes, 'بصمة التصميم المقارنة تُحسب لدور واحد؛ البدائل متاحة.'], dna: null, alternatives: out.designs.map((d, i) => ({ index: i, strategy: 'villa2-' + d.mode, doc: d.doc, pat: d.pat, summary: d.summary, notes: d.notes, review: d.review || null, ledger: d.ledger || null, mirror: !!d.mirror })), alternativesCount: out.designs.length, alternativesInfo: alternativesInfo(out, villaEngine === 'v2' ? 4 : 3), selectedIndex: 0, strategy: 'villa2-' + best.mode, floors: 2, engine: out.engine, villaEngine, summary: best.summary, pat: best.pat, ledger: best.ledger || [], review: best.review || null, same: !!best.same, mirror: !!best.mirror };
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
  const d = footprintDiagnostics(plot);
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
  const works = async (l, c) => { try { await generateInitialDesign({ land: l, rooms: defaultRooms(c), discovery, idea, counts: c, engine }); return true; } catch { return false; } };
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
