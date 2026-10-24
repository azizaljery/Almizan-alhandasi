// (الجولة العشرون — توجيه المالك r20، رابعًا) لا إصلاح يفسد بقية المخطط: بعد أي تغيير على غرفة أو علاقة (في التوليد أو التعديل أو الصقل)
// تُعاد كل الشروط المرتبطة على المخطط كله قبل قبول التغيير — الصالة ≥ المجلس، ودورات المياه المطلوبة، والضوء، والحركة، والخصوصية،
// والمقاسات، والمخالفات الإلزامية. التغيير الذي يُسقط شرطًا كان متحققًا قبله يُرفض (أو يُعاد المستند كما كان) ويُذكر السبب.
import { analyzeDoc } from './draw/digest.mjs';
import { measureR16 } from './privacy-defects.mjs';
import { reviewDoc } from './draw/review.mjs';

const PROG_TYPES = ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'bath', 'service'];
const HABITABLE = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen']);
/**
 * صورة الشروط على مستند: { checks: { id → { pass, ar } }, counts: { نوع → عدد }, dark: [غرف مأهولة بلا نافذة], unreachable: n }.
 * كل الشروط مقيسة من المستند وحده (المقاييس نفسها التي تحكم حالة العرض).
 */
export function invariants(doc, request = {}) {
  const model = analyzeDoc(doc), checks = {};
  try { for (const g of measureR16(doc, request, model)) if (g.applicable && !g.clientAsked) checks[g.id] = { pass: g.pass, ar: g.ar, why: (g.reasons_ar || [])[0] || '' }; } catch { /* لا قياس */ }
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
export default { invariants, regressions, guardChange, guarded };
