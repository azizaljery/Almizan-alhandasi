// (الجولة الرابعة عشرة) حالة العرض لكل بديل — قرار المالك: «العدد لا يكون على حساب الجودة»، و«بديل يخالف شرطًا إلزاميًا للعميل
// يُحجب أيًّا كانت درجاته»، و«البديل الذي يحتاج تعديلات لا يُعرض أبدًا على أنه جاهز».
//   - «جاهز للعرض المبدئي»: اجتاز كل بوابات المراجعة، ونُفّذ كل بند من طلب العميل، ولا تفضيل سعودي افتراضي مخالف.
//   - «يحتاج تعديلات»: اجتاز البوابات وبنود العميل، لكن فيه تفضيلات افتراضية للميزان لم تتحقق — تُذكر كلها بأسبابها.
//   - «محجوب»: يخالف بندًا إلزاميًا من طلب العميل أو رسب في بوابة مراجعة — لا يُعرض، ويُذكر السبب.
// كل المخرجات «مقترح معماري مبدئي» لا مخطط تنفيذي، ولا ادعاء سلامة إنشائية.
import { analyzeDoc } from './draw/digest.mjs';
import { measureSaudiProgram } from './saudi-program.mjs';

export const PROPOSAL_LABEL_AR = 'مقترح معماري مبدئي — ليس مخططًا تنفيذيًا معتمدًا، ويحتاج تحققًا إنشائيًا مستقلًا';
export const STATUS_AR = Object.freeze({ ready: 'جاهز للعرض المبدئي', 'needs-edits': 'يحتاج تعديلات', hidden: 'محجوب' });
const PREF_TIER_AR = 'تفضيل سعودي افتراضي للميزان (قابل للتغيير)';

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
  const hidden = [...ledgerFails.map(x => `بند من طلبك لم يتحقق: «${x.text}»${x.why ? ` — ${x.why}` : ''}`), ...gateFails.map(g => `رسب في بوابة المراجعة ${g}`)];
  let prefs = [];
  try { prefs = measureSaudiProgram(doc, request, model).filter(g => g.applicable && !g.pass && !g.clientAsked && !g.regulation && g.id !== 'SHADING'); } catch { prefs = []; }
  const edits = [...prefs.map(g => `${g.ar}: ${(g.reasons_ar || [])[0] || 'لم يتحقق'} (${PREF_TIER_AR})`), ...qualityNotes(doc, model).map(q => q.text_ar)];
  const status = hidden.length ? 'hidden' : edits.length ? 'needs-edits' : 'ready';
  return { status, label_ar: STATUS_AR[status], hidden_ar: hidden, edits_ar: edits, prefs: prefs.map(g => g.id), proposal_ar: PROPOSAL_LABEL_AR };
}
export default { presentationStatus, qualityNotes, STATUS_AR, PROPOSAL_LABEL_AR };
