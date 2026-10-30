// (الجولة العشرون — توجيه المالك r20، رابعًا) لا إصلاح يفسد بقية المخطط: بعد أي تغيير على غرفة أو علاقة (في التوليد أو التعديل أو الصقل)
// تُعاد كل الشروط المرتبطة على المخطط كله قبل قبول التغيير — الصالة ≥ المجلس، ودورات المياه المطلوبة، والضوء، والحركة، والخصوصية،
// والمقاسات، والمخالفات الإلزامية. التغيير الذي يُسقط شرطًا كان متحققًا قبله يُرفض (أو يُعاد المستند كما كان) ويُذكر السبب.
import { analyzeDoc } from './draw/digest.mjs';
import { measureR16 } from './privacy-defects.mjs';
import { reviewDoc } from './draw/review.mjs';
import { verifyRequest } from './rules.mjs';
import { briefOf, RELATIONS } from './shared-brief.mjs';

const PROG_TYPES = ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'bath', 'service'];
const HABITABLE = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen']);
/**
 * صورة الشروط على مستند: { checks: { id → { pass, ar } }, counts: { نوع → عدد }, dark: [غرف مأهولة بلا نافذة], unreachable: n }.
 * كل الشروط مقيسة من المستند وحده (المقاييس نفسها التي تحكم حالة العرض).
 */
export function invariants(doc, request = {}) {
  // الملاحظات (tier: note — المدخلان المتجاوران، الحمام بلا نافذة) معلومات للعميل لا شروط: لا تمنع تغييرًا يُصلح عيبًا
  const model = analyzeDoc(doc), checks = {};
  try { for (const g of measureR16(doc, request, model)) if (g.applicable && !g.clientAsked && g.tier !== 'note') checks[g.id] = { pass: g.pass, ar: g.ar, why: (g.reasons_ar || [])[0] || '' }; } catch { /* لا قياس */ }
  const counts = {}, dark = [];
  for (const lv of model.levels) for (const r of lv.rooms) {
    if (PROG_TYPES.includes(r.type)) counts[r.type] = (counts[r.type] || 0) + 1;
    if (HABITABLE.has(r.type) && !lv.openings.some(op => op.window && op.sides.some(s => s.room.id === r.id && (s.other === 'outside' || lv.roomsById.get(s.other)?.type === 'courtyard')))) dark.push(r.name);
  }
  let unreachable = 0, noWindow = 0; try { const rv = reviewDoc(doc); unreachable = rv.filter(i => i.code === 'UNREACHABLE_ROOM').length; noWindow = rv.filter(i => i.code === 'NO_WINDOW').length; } catch { /* */ }
  return { checks, counts, dark, unreachable, noWindow };
}
/** ما سقط بالتغيير: شرط كان ناجحًا فرسب، أو عدد غرف برنامج نقص، أو غرفة مأهولة فقدت نوافذها، أو فراغ صار لا يُبلغ. */
export function regressions(before, after) {
  const out = [];
  for (const [id, b] of Object.entries(before.checks)) { const a = after.checks[id]; if (b.pass && a && !a.pass) out.push({ id, ar: `${a.ar}: ${a.why}` }); }
  for (const [t, n] of Object.entries(before.counts)) if ((after.counts[t] || 0) < n) out.push({ id: 'COUNT_' + t.toUpperCase(), ar: `نقص عدد «${t}» من ${n} إلى ${after.counts[t] || 0}` });
  for (const name of after.dark) if (!before.dark.includes(name)) out.push({ id: 'DAYLIGHT', ar: `«${name}» فقدت نوافذها على الخارج` });
  if (after.unreachable > before.unreachable) out.push({ id: 'REACH', ar: `فراغات لا تُبلغ صارت ${after.unreachable} (كانت ${before.unreachable})` });
  if (after.noWindow > before.noWindow) out.push({ id: 'NO_WINDOW', ar: `غرف بلا نافذة صارت ${after.noWindow} (كانت ${before.noWindow})` });
  return out;
}
/** يقبل التغيير أو يرفضه: { ok, regressions } */
export function guardChange(docBefore, docAfter, request = {}) {
  const r = regressions(invariants(docBefore, request), invariants(docAfter, request));
  return { ok: r.length === 0, regressions: r };
}
/**
 * يطبق تعديلًا موضعيًا (fn يعدّل المستند في مكانه) ثم يحرسه: إن أسقط شرطًا يُعاد المستند كما كان. يعيد { applied, result, regressions }.
 */
export function guarded(doc, fn, request = {}) {
  const snap = JSON.parse(JSON.stringify(doc)), before = invariants(doc, request);
  const result = fn(doc);
  const reg = regressions(before, invariants(doc, request));
  if (reg.length) { for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, snap); return { applied: false, result, regressions: reg }; }
  return { applied: true, result, regressions: [] };
}

// ------------------------------------------------------------------------------------------------ (الجولة 21 — مقترح 08) التعديل الآمن
// مكيَّف من kit-r21/src/constraints.mjs applySafeEdit، في طبقة المعاملة (design-session) قبل حفظ أي تعديل موضعي. المدقق موسَّع بكل قواعد النظام
// الحالية لا بقواعد الحزمة وحدها: (1) invariants أعلاه (المخالفات الإلزامية والعيوب والأعداد والضوء والوصول)، (2) سجل بنود العميل verifyRequest
// (المقاسات الصريحة مقيسة من المرسوم، والمواضع، والقرب والبعد، والأعداد، والتفضيلات)، (3) علاقات العقد الموحد الصلبة: DIRECT_DOOR باب فعلي بين
// المجلس والطعام، وGUEST_ACCESS (GUEST_DINING مقيسًا بالأبواب الفعلية ولو طلبه العميل نصًا).
// الفرق المقصود عن الحزمة: الرفض لما **يسقطه التعديل** (شرط كان متحققًا فصار راسبًا) لا لكل رسوب قائم قبله — وإلا رُفض كل تعديل على مخطط فيه
// عيب واحد ولو كان التعديل يصلح غيره. وما يغيّره العميل نفسه في الدور (exempt: معرّفات بنود السجل أو أنواع invariants) لا يُعد سقوطًا.
const ledgerOk = x => (x.status ? x.status === 'done' || x.status === 'pending-render' : !!x.ok);
function directDoorOk(doc, model) {
  for (const lv of model.levels) for (const op of lv.openings) {
    if (!op.door) continue;
    const rs = op.sides.map(sd => (sd.room ? sd.room : null)).filter(Boolean), ot = op.sides.map(sd => (sd.other && sd.other !== 'outside' ? lv.roomsById.get(sd.other) : null)).filter(Boolean);
    const all = [...rs, ...ot];
    if (all.some(r => r.type === 'majlis' && !/النساء/.test(r.name || '')) && all.some(r => r.type === 'dining')) return true;
  }
  return false;
}
/** صورة تحقق كاملة لمستند: { inv, client: [{ id, text, ok }], brief: [{ id, kind, ok }], hard: [ما رسب] }. */
export function validateEdit(doc, request = {}, { entry = 's' } = {}) {
  const inv = invariants(doc, request), model = analyzeDoc(doc);
  let client = []; try { client = verifyRequest(doc, request, { entry }).map(x => ({ id: x.id, kind: x.kind, text: x.text, ok: ledgerOk(x) })); } catch { client = []; }
  const brief = [], B = briefOf(request);
  for (const r of B.relations || []) {
    if (r.level !== 'HARD') continue;
    if (r.kind === RELATIONS.DIRECT_DOOR) brief.push({ id: 'BRIEF:' + r.id, kind: r.kind, quote: r.quote, ok: directDoorOk(doc, model) });
    if (r.kind === RELATIONS.GUEST_ACCESS) { let ok = true; try { const g = measureR16(doc, request, model).find(x => x.id === 'GUEST_DINING'); ok = !g || !g.applicable || g.pass; } catch { ok = true; } brief.push({ id: 'BRIEF:' + r.id, kind: r.kind, quote: r.quote, ok }); }
  }
  return { inv, client, brief, hard: [...Object.entries(inv.checks).filter(([, c]) => !c.pass).map(([id]) => id), ...client.filter(c => !c.ok).map(c => c.id), ...brief.filter(b => !b.ok).map(b => b.id)] };
}
/**
 * المعاملة: edit دالة تعدّل نسخة من المستند أو المستند بعد التعديل نفسه. يعيد { accepted, doc, before, after, violations, reason }.
 * المستند الأصلي لا يُمس أبدًا؛ المقبول نسخة مستقلة.
 */
export function applySafeEdit(original, edit, request = {}, { entry = 's', exempt = [] } = {}) {
  const ex = new Set(exempt), before = validateEdit(original, request, { entry });
  let doc;
  if (typeof edit === 'function') { doc = JSON.parse(JSON.stringify(original)); const r = edit(doc); if (r && typeof r === 'object' && r.levels) doc = r; }
  else doc = edit;
  const after = validateEdit(doc, request, { entry });
  const violations = regressions(before.inv, after.inv).filter(x => !ex.has(x.id));
  for (const c of after.client) { const b = before.client.find(y => y.id === c.id); if (b && b.ok && !c.ok && !ex.has(c.id)) violations.push({ id: c.id, ar: `بند من طلبك لم يعد متحققًا: «${c.text}»` }); }
  for (const c of after.brief) { const b = before.brief.find(y => y.id === c.id); if (b && b.ok && !c.ok && !ex.has(c.id)) violations.push({ id: c.id, ar: c.kind === RELATIONS.DIRECT_DOOR ? 'الباب المباشر بين المجلس والطعام الذي طلبته لم يعد موجودًا' : 'ضيف الرجال لم يعد يصل إلى الطعام دون عبور العائلة' }); }
  return violations.length ? { accepted: false, doc: original, before, after, violations, reason: 'HARD_CONSTRAINT_VIOLATION' } : { accepted: true, doc, before, after, violations: [], reason: null };
}
export default { invariants, regressions, guardChange, guarded, validateEdit, applySafeEdit };
