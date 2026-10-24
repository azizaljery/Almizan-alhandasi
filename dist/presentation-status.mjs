// (الجولة الرابعة عشرة) حالة العرض لكل بديل — قرار المالك: «العدد لا يكون على حساب الجودة»، و«بديل يخالف شرطًا إلزاميًا للعميل
// يُحجب أيًّا كانت درجاته»، و«البديل الذي يحتاج تعديلات لا يُعرض أبدًا على أنه جاهز».
// (الجولة الخامسة عشرة) معايرة «يحتاج تعديلات» — القاعدة الموثقة (docs/research/presentation-calibration-r15.md):
//   - «محجوب»: يخالف بندًا إلزاميًا من طلب العميل أو رسب في بوابة مراجعة — لا يُعرض، ويُذكر السبب. لا ترفعه أي معايرة أبدًا.
//   - «يحتاج تعديلات»: فيه عيب جوهري يصلحه المعماري قبل أن يعرض المخطط على عميل (MAJOR أدناه): مجلس الرجال يلاصق غرفة
//     النوم الرئيسية، أو يدخله الضيف من ارتداد جانبي ضيق، أو بابه الخارجي يفتح عليه مباشرة بلا دهليز؛ أو غرفة نوم بلا حمام
//     تصل إليه؛ أو غرفة خادمة بلا حمام؛ أو مجلس مرسوم بلا أثاث.
//   - «جاهز للعرض المبدئي»: لا عيب جوهريًا. التفضيلات السعودية الافتراضية الأخرى التي لم تتحقق (دورة مياه يومية، مسار تقديم،
//     باب المقلط، الحوش الخلفي، تخطيط المواقف، مجلس يلاصق غرفة نوم عادية، غرفة ملابس أصغر قليلًا، مقاس ضمن السماح لا مطابق…)
//     تُعرض «ملاحظات» (notes_ar) مع البديل — لا تخفيها الحالة ولا تُقدَّم على أنها متحققة.
// كل المخرجات «مقترح معماري مبدئي» لا مخطط تنفيذي، ولا ادعاء سلامة إنشائية.
import { analyzeDoc } from './draw/digest.mjs';
import { measureSaudiProgram } from './saudi-program.mjs';
import { measureR16 } from './privacy-defects.mjs';

export const PROPOSAL_LABEL_AR = 'مقترح معماري مبدئي — ليس مخططًا تنفيذيًا معتمدًا، ويحتاج تحققًا إنشائيًا مستقلًا';
export const STATUS_AR = Object.freeze({ ready: 'جاهز للعرض المبدئي', 'needs-edits': 'يحتاج تعديلات', hidden: 'محجوب' });
const PREF_TIER_AR = 'تفضيل سعودي افتراضي للميزان (قابل للتغيير)';
const R16_TIER_AR = 'عيب معماري — قيمة تصميمية افتراضية للميزان';

/** عيوب عرض/جودة قيست من المستند (المراجع المستقل r13) غير البرنامج السعودي: غرفة ملابس رمزية لرئيسية كبيرة، مجلس بلا أثاث. */
export function qualityNotes(doc, model = analyzeDoc(doc)) {
  const out = [];
  for (const lv of model.levels) {
    const master = lv.rooms.find(r => r.type === 'master');
    const dress = lv.rooms.find(r => /غرفة (?:ال)?ملابس/.test(r.name || ''));
    if (master && master.area > 20 && dress) { const w = Math.min(dress.rect.w, dress.rect.l), l = Math.max(dress.rect.w, dress.rect.l); if (w < 2.0 - .05 || l < 2.5 - .05) out.push({ id: 'DRESSING', text_ar: `غرفة الملابس ${r2(w)}×${r2(l)} م أصغر من 2.0×2.5 م لرئيسية ${r2(master.area)} م²` }); }
    for (const m of lv.rooms.filter(r => r.type === 'majlis')) {
      const n = (doc.fixtures || []).filter(f => f.level === lv.level.id && m.space && pointIn(m.net, { x: f.x, y: f.y })).length;
      if (!n) out.push({ id: 'MAJLIS_FURNITURE', text_ar: `«${m.name}» مرسوم بلا أثاث` });
    }
  }
  return out;
}
const r2 = v => Math.round(v * 100) / 100;
function pointIn(poly, p) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }

/**
 * design: { doc, ledger?, review? }؛ request: { text, counts } كما في plan-review. يعيد
 * { status, label_ar, hidden_ar[], edits_ar[], prefs[], proposal_ar }.
 */
export function presentationStatus(design, request = {}) {
  const doc = design.doc, model = analyzeDoc(doc);
  const ledgerFails = (design.ledger || []).filter(x => !x.ok && !['unverified', 'pending-render'].includes(x.status));
  const rv = design.review || null, gateFails = rv && rv.passed === false ? (rv.failedGates || []) : [];
  // (الجولة السادسة عشرة) قراءة واحدة لـ«في الخلف» في السجل وحالة العرض ورد التعديل: ما لم يتحقق حرفيًا وتحققت قراءته النسبية
  // «متحقق جزئيًا» — يبقى بندًا إلزاميًا غير متحقق (محجوب، لا «جاهز»)، ويُذكر أنه جزئي بالنص نفسه الذي يقرؤه السجل الصارم
  const hidden = [...ledgerFails.map(x => x.partial ? `بند من طلبك متحقق جزئيًا فقط: «${x.text}» — ${x.partial.text_ar}؛ لا حرفيًا: ${x.partial.literal_ar || x.why}` : `بند من طلبك لم يتحقق: «${x.text}»${x.why ? ` — ${x.why}` : ''}`), ...gateFails.map(g => `رسب في بوابة المراجعة ${g}`)];
  let prefs = [];
  try { prefs = measureSaudiProgram(doc, request, model).filter(g => g.applicable && !g.pass && !g.clientAsked && !g.regulation && g.id !== 'SHADING'); } catch { prefs = []; }
  // المقلط ومسار التقديم بند واحد عند العميل: إن غاب المسار يُذكر مرة واحدة (SERVE_ROUTE)، ويبقى بند المقلط إن كان سببه انفتاح الطعام على العائلة
  if (prefs.some(g => g.id === 'SERVE_ROUTE')) prefs = prefs.filter(g => g.id !== 'MAJLIS_DINING' || g.value?.link);
  // (الجولة السادسة عشرة) عيوب أثبتتها المراجعة المستقلة r15 (privacy-defects.mjs): كلها عيوب تُصلح قبل العرض (لا ملاحظات)
  let r16 = []; try { r16 = measureR16(doc, request, model).filter(g => g.applicable && !g.pass && !g.clientAsked); } catch { r16 = []; }
  const items = [...prefs.map(g => ({ id: g.id, major: isMajorPref(g, model), text_ar: `${g.ar}: ${(g.reasons_ar || [])[0] || 'لم يتحقق'} (${PREF_TIER_AR})` })),
    ...r16.map(g => ({ id: g.id, major: true, text_ar: `${g.ar}: ${g.reasons_ar.join('؛ ')} (${g.tier === 'saudi-preference' ? PREF_TIER_AR : R16_TIER_AR})` })),
    ...qualityNotes(doc, model).map(q => ({ id: q.id, major: MAJOR_QUALITY.has(q.id), text_ar: q.text_ar })),
    ...toleranceNotes(design.ledger || [])];
  const edits = items.filter(x => x.major).map(x => x.text_ar), notes = items.filter(x => !x.major).map(x => x.text_ar);
  const status = hidden.length ? 'hidden' : edits.length ? 'needs-edits' : 'ready';
  return { status, label_ar: STATUS_AR[status], hidden_ar: hidden, edits_ar: edits, notes_ar: notes, prefs: prefs.map(g => g.id), major: items.filter(x => x.major).map(x => x.id), r16: r16.map(g => g.id), proposal_ar: PROPOSAL_LABEL_AR };
}
/** (الجولة الخامسة عشرة) تفضيلات سعودية يعدّها المعماري عيبًا يُصلح قبل العرض (لا ملاحظة): القاعدة الموثقة أعلى الملف. */
export const MAJOR_PREFS = Object.freeze(['MAJLIS_STREET_ENTRY', 'MAJLIS_LOBBY', 'BED_BATH', 'MAID_BATH']);
const MAJOR_QUALITY = new Set(['MAJLIS_FURNITURE']);
function isMajorPref(g, model) {
  if (MAJOR_PREFS.includes(g.id)) return true;
  // المجلس يلاصق غرفة النوم الرئيسية = عيب (مرفوض في الذوق السعودي)؛ ويلاصق غرفة نوم عادية = ملاحظة (عزل صوتي/خزانة فاصلة)
  if (g.id === 'MAJLIS_BED_WALL') {
    const masters = new Set(model.levels.flatMap(lv => lv.rooms.filter(r => r.type === 'master').map(r => r.name)));
    return (g.value?.pairs || []).some(p => masters.has(p.bedroom));
  }
  return false;
}
/** بنود المقاس المتحققة ضمن السماح لا بالمطابقة (المجلس 5.76 م والمطلوب 6 م): ملاحظة صريحة لا تُخفى. */
function toleranceNotes(ledger) {
  const out = [];
  for (const x of ledger) {
    if (!x.ok || x.kind !== 'dims' || !x.actual || !x.want) continue;
    const off = Math.max(Math.abs(x.actual.s - x.want.s), Math.abs(x.actual.l - x.want.l));
    if (off > .1) out.push({ id: 'DIM_TOLERANCE', major: false, text_ar: `${x.text}: المرسوم ${x.actual.s}×${x.actual.l} م — ضمن السماح ±0.3 م لا مطابق` });
  }
  return out;
}
export default { presentationStatus, qualityNotes, STATUS_AR, PROPOSAL_LABEL_AR, MAJOR_PREFS };
