// مقترحات الإصلاح في مرحلة التصميم: كل ملاحظة على التصميم المعروض (بند من طلب العميل لم يتحقق، أو ملاحظة من الفحص الآلي)
// تُعرض على العميل بزر «نفّذ»؛ والموقع يعالجها بنفسه — بتعديل موضعي إن كفى، أو بتغيير التوزيع كله إن لزم —
// بشرط واحد لا يُتنازل عنه: لا يُقبل علاج يُسقط رغبة قالها العميل. وما تعذّر يُشرح سببه ولا يُدّعى.
import { applyCommand, parseDoc, serialize } from './draw/doc.mjs';
import { reviewDoc, GUIDE_NOTE } from './draw/review.mjs';
import { verifyRequest } from './rules.mjs';
import { generateInitialDesign } from './home-flow.mjs';
import { visualSig, visualSim, checkDoc } from './villa-layout.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const MAX_DESIGNS = 12;
const entryDir = s => s.input?.land?.entries?.[0] || 's';
const ledgerOf = (s, doc) => { try { return verifyRequest(doc, s.input.requirements || {}, { entry: entryDir(s) }); } catch { return []; } };
const customIds = s => new Set(((s.input.requirements || {}).rules || []).filter(r => r.custom).map(r => r.id));
/** ملاحظات الفحص التي تُعرض على العميل: الأخطاء والتنبيهات (المعلومات الإرشادية الخفيفة لا تُعرض مقترحًا). */
const reviewOf = doc => { try { return reviewDoc(doc).filter(i => i.severity !== 'info'); } catch { return []; } };
/** مفتاح الملاحظة عبر التصاميم: رمزها واسم الفراغ/نوع الهدف (المعرّفات تتغير بين توزيع وآخر). */
function reviewKey(doc, i) {
  const names = i.targetIds.map(id => (doc.labels || []).find(l => l.id === id)?.name || (doc.fixtures || []).find(f => f.id === id)?.kind || '').filter(Boolean);
  return i.code + ':' + names.join('+');
}
// نص للعميل: بلا عبارة الإرشاد المكررة وبلا معرّفات الرسم الداخلية (o7، f10)
const plain = m => String(m || '').replace(GUIDE_NOTE, '').replace(/\s*\((?:[a-z]\d+)\)/g, '').replace(/\s[a-z]\d+(?=\s|$|[.،])/g, '').replace(/\s+/g, ' ').trim();

/**
 * مقترحات الإصلاح للتصميم المعروض.
 * كل مقترح: { id, kind: 'request' | 'custom' | 'review', text, why, how: 'patch' | 'relayout', severity }
 * - request: بند قاله العميل ولم يتحقق؛ custom: عرف افتراضي لم يتحقق؛ review: ملاحظة الفحص الآلي.
 * - how='patch': يُعالَج في موضعه (أمر رسم متحقَّق منه)؛ 'relayout': يحتاج توزيعًا آخر.
 */
export function fixProposals(session, doc = parseDoc(session.designs[session.current].doc)) {
  const out = [], custom = customIds(session);
  for (const x of ledgerOf(session, doc)) if (!x.ok) out.push({ id: 'L:' + x.id, kind: custom.has(x.id) ? 'custom' : 'request', text: x.text, why: x.why || '', how: 'relayout', severity: custom.has(x.id) ? 'warning' : 'error', ledgerId: x.id });
  for (const i of reviewOf(doc)) out.push({ id: 'R:' + i.id, kind: 'review', text: plain(i.message), why: i.fix ? 'العلاج: ' + i.fix.label : '', how: i.fix ? 'patch' : 'relayout', severity: i.severity, key: reviewKey(doc, i), code: i.code, issueId: i.id });
  return out;
}

/** يطبّق كل العلاجات الموضعية المتاحة للملاحظات المطلوبة على نسخة من المستند، ويعيد ما عولج فعلًا (بعد إعادة الفحص). */
function patchDoc(doc0, wantKeys) {
  let doc = doc0; const fixed = [];
  for (let round = 0; round < 6; round++) {
    const todo = reviewOf(doc).find(i => i.fix && (!wantKeys || wantKeys.has(reviewKey(doc, i))) && !fixed.some(f => f.id === i.id));
    if (!todo) break;
    try { let d = doc; for (const c of todo.fix.commands) d = applyCommand(d, c).doc; const still = reviewOf(d).some(i => i.id === todo.id); fixed.push({ id: todo.id, text: plain(todo.message), label: todo.fix.label, ok: !still }); if (!still) doc = d; } catch { fixed.push({ id: todo.id, text: plain(todo.message), label: todo.fix.label, ok: false }); }
  }
  return { doc, fixed: fixed.filter(f => f.ok) };
}

/** حال تصميم مرشّح أمام الأهداف: رغبات العميل غير المحققة، الأهداف الباقية، ومجموع الملاحظات. */
function measure(session, doc, targets) {
  const L = ledgerOf(session, doc), custom = customIds(session), R = reviewOf(doc), keys = new Set(R.map(i => reviewKey(doc, i)));
  const hard = L.filter(x => !x.ok && !custom.has(x.id)).map(x => x.id), soft = L.filter(x => !x.ok && custom.has(x.id)).map(x => x.id);
  const left = targets.filter(t => t.kind === 'review' ? keys.has(t.key) : L.some(x => x.id === t.ledgerId && !x.ok));
  return { hard, soft, left, issues: R.length, score: hard.length * 1000 + left.length * 100 + soft.length * 10 + R.length };
}

/**
 * تنفيذ مقترح أو كل المقترحات ('all').
 * 1) العلاج الموضعي أولًا (لا يغيّر التوزيع). 2) ما بقي يُبحث له عن توزيع آخر يعالجه؛ ولا يُقبل مرشّح يُسقط رغبة للعميل
 *    كانت محققة. 3) ما لم يوجد له علاج يبقى ويُشرح.
 * يعيد { session, reply, changed } — reply: { fixed[], failed[{text, why}], relayout, tried }.
 */
export async function applyFix(session, id = 'all', { generate = generateInitialDesign } = {}) {
  const s = clone(session), cur = s.designs[s.current], doc0 = parseDoc(cur.doc), all = fixProposals(s, doc0);
  const targets = id === 'all' ? all : all.filter(p => p.id === id);
  if (!targets.length) return { session, changed: false, reply: { fixed: [], failed: [], relayout: false, tried: 0, nothing: true } };
  const before = measure(s, doc0, targets), fixed = [];
  // 1) موضعي
  const wantKeys = new Set(targets.filter(t => t.kind === 'review').map(t => t.key));
  let { doc, fixed: patched } = patchDoc(doc0, wantKeys);
  if (patched.length && !checkDoc(doc).ok) { doc = doc0; patched = []; }
  for (const f of patched) fixed.push(f.text + ' ← ' + f.label);
  let now = measure(s, doc, targets), relayout = false, tried = 0, best = null;
  // 2) توزيع آخر لما بقي
  if (now.left.length) {
    const req = s.input.requirements, pool = [];
    const seenPats = [...new Set([...(s.seenPats || []), ...s.designs.map(d => d.pat).filter(Boolean)])];
    for (const opt of [{ exclude: [], shown: [] }, { exclude: seenPats, shown: s.seen || [] }]) {
      try { const r = await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: req.counts, requirements: req, ...opt }); for (const a of [r, ...(r.alternatives || [])]) if (a?.doc) pool.push({ a, r }); } catch { /* لا مرشحين من هذه المحاولة */ }
    }
    const sig0 = visualSig(doc0), seenDocs = new Set();
    for (const { a, r } of pool) {
      const key = serialize(a.doc); if (seenDocs.has(key)) continue; seenDocs.add(key);
      const p = patchDoc(a.doc, null), m = measure(s, p.doc, targets); tried++;
      // شرط العميل: لا رغبة محققة الآن تسقط، ولا يزيد غير المحقق
      if (m.hard.some(h => !before.hard.includes(h))) continue;
      if (!checkDoc(p.doc).ok) continue;
      if (m.left.length >= now.left.length && !(m.left.length === now.left.length && m.score < now.score - 5)) continue;
      if (!best || m.score < best.m.score) best = { doc: p.doc, m, a, r, same: visualSim(visualSig(p.doc), sig0) > .95 };
    }
    if (best) { doc = best.doc; relayout = !best.same; now = best.m; }
  }
  const leftIds = new Set(now.left.map(t => t.id));
  for (const t of targets) if (!leftIds.has(t.id) && !fixed.some(f => f.startsWith(t.text))) fixed.push(t.text);
  const failed = now.left.map(t => ({ text: t.text, why: t.kind === 'review' ? `جرّبت ${tried} توزيعًا ولم أجد ما يعالجها دون أن يُسقط طلبًا من طلباتك.` : (t.why ? t.why + ' ' : '') + `جرّبت ${tried} توزيعًا لهذه الأرض مع بقية طلباتك ولم يتحقق. يمكنك تخفيف طلب آخر (مقاس أو عدد) أو قبول التصميم كما هو.` }));
  const reply = { fixed, failed, relayout, tried, fixRun: true, done: fixed, picks: [], unclear: [], unsupported: [], kept: !relayout, unchanged: false, different: relayout, otherFails: [] };
  const changed = serialize(doc) !== cur.doc;
  if (!changed) return { session, changed: false, reply };
  const src = best && relayout ? best.a : null;
  s.designs.push({ doc: serialize(doc), pat: src?.pat || cur.pat || null, summary: src?.summary || cur.summary || '', notes: src?.notes || cur.notes || [], floors: cur.floors || 1, engine: src?.strategy || cur.engine || '', ledger: null, mirror: null, feedback: { picks: [], text: '', changes: ['معالجة الملاحظات'], reply } });
  try { s.seen = [...(s.seen || []), visualSig(doc)]; } catch { /* البصمة اختيارية */ }
  if (s.designs.length > MAX_DESIGNS) s.designs.splice(0, s.designs.length - MAX_DESIGNS);
  s.current = s.designs.length - 1;
  return { session: s, changed: true, reply };
}

export default { fixProposals, applyFix };
