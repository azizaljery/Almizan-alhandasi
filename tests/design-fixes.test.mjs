// مقترحات الإصلاح في مرحلة التصميم: تُعرض، تُنفَّذ بزر، ولا يُقبل علاج يُسقط رغبة للعميل، وما تعذّر يُشرح.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixProposals, applyFix } from '../dist/design-fixes.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, currentDoc } from '../dist/design-session.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { checkDoc } from '../dist/villa-layout.mjs';
import { applyCommand, parseDoc, serialize } from '../dist/draw/doc.mjs';

async function session(text, floors = 2) {
  const land = { width: 20, length: 30, floors, streets: ['s'], entries: ['s'] }, b = buildBrief(text, { land });
  const result = await generateInitialDesign({ land, rooms: [], discovery: b.discovery, idea: text, counts: b.counts, requirements: b.requirements });
  return createSession({ land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: text, result });
}
const hardUnmet = s => { const custom = new Set((s.input.requirements.rules || []).filter(r => r.custom).map(r => r.id)); return verifyRequest(currentDoc(s), s.input.requirements, { entry: 's' }).filter(x => !x.ok && !custom.has(x.id)).map(x => x.id); };

/** تصميم فيه ملاحظة لها علاج موضعي مضمون: باب يُعكس اتجاه فتحه ليصطدم بقطعة. */
function withBlockedSwing(s) {
  const doc = currentDoc(s);
  for (const o of doc.openings) { if (!/door/.test(o.kind || '')) continue; try { const d = applyCommand(doc, { type: 'flip-opening', id: o.id, what: 'swing' }).doc, t = JSON.parse(JSON.stringify(s)); t.designs[t.current].doc = serialize(d); if (fixProposals(t).some(p => p.how === 'patch')) return t; } catch { /* باب لا يُعكس */ } }
  return null;
}

test('المقترحات: كل مقترح له نوع ونص للعميل بلا معرّفات داخلية وطريقة علاج', async () => {
  const s = await session('فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ'), t = withBlockedSwing(s) || s, P = fixProposals(t);
  for (const p of P) { assert.ok(['request', 'custom', 'review'].includes(p.kind)); assert.ok(['patch', 'relayout'].includes(p.how)); assert.ok(p.text.length > 5); assert.ok(!/\s[of]\d+\b/.test(p.text), 'معرّف داخلي في النص: ' + p.text); assert.ok(!/إرشاد تصميمي من كتالوج/.test(p.text)); }
});
test('التنفيذ: العلاج الموضعي يعالج الملاحظة دون تغيير التوزيع، والنتيجة تصميم جديد سليم يُعرض مع الرد', async () => {
  const s = await session('فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ'), t = withBlockedSwing(s);
  if (!t) return; // لا باب يصلح للتجربة في هذا التوزيع
  const p = fixProposals(t).find(x => x.how === 'patch'), out = await applyFix(t, p.id, { generate: async () => { throw Error('لا حاجة لتوزيع آخر'); } });
  assert.equal(out.changed, true); assert.equal(out.reply.relayout, false); assert.equal(out.reply.failed.length, 0); assert.equal(out.reply.fixed.length, 1);
  assert.equal(out.session.designs.length, t.designs.length + 1); assert.equal(out.session.current, out.session.designs.length - 1);
  assert.ok(checkDoc(currentDoc(out.session)).ok); assert.ok(!fixProposals(out.session).some(x => x.key === p.key && x.how === 'patch'));
  assert.equal(out.session.designs.at(-1).feedback.reply.fixRun, true);
});
test('شرط العميل: «نفّذ الكل» لا يُسقط رغبة قالها العميل ولو غيّر التوزيع كله، وما بقي يُشرح سببه', async () => {
  const s = await session('دور واحد 4 غرف نوم ومجلس وصالة ومطبخ والمطبخ في الخلف والماستر بعيدة عن المجلس', 1);
  const before = hardUnmet(s), n = fixProposals(s).length, out = await applyFix(s, 'all');
  if (!n) { assert.equal(out.changed, false); assert.equal(out.reply.nothing, true); return; }
  const after = out.changed ? hardUnmet(out.session) : before;
  assert.ok(after.every(id => before.includes(id)), 'رغبة للعميل سقطت بعد العلاج: ' + after.join(','));
  assert.equal(out.reply.fixed.length + out.reply.failed.length >= 1, true);
  for (const f of out.reply.failed) assert.match(f.why, /جرّبت \d+ توزيعًا/);
  if (out.changed) assert.ok(checkDoc(currentDoc(out.session)).ok);
});
test('الصدق: حين لا يوجد توزيع يعالج الملاحظة يبقى التصميم كما هو ويُقال السبب', async () => {
  const s = await session('فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ'), P = fixProposals(s).filter(p => p.how === 'relayout');
  if (!P.length) return;
  const out = await applyFix(s, P[0].id, { generate: async () => { throw Error('لا مرشحين'); } });
  assert.equal(out.changed, false); assert.equal(out.reply.failed.length, 1); assert.match(out.reply.failed[0].why, /جرّبت 0 توزيعًا/); assert.equal(out.session, s);
});
