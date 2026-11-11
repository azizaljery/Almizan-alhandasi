// شرعاء المرافِقة: تجيب من التصميم نفسه، وتنفّذ الطلب عليه، وتقول بصدق ما لم تفهمه.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharaTurn, classify, canonicalAsk, answerQuestion, STAGES } from '../dist/shara-assistant.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, summarizeDoc, currentDoc } from '../dist/design-session.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';

async function session(text = 'فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ') {
  const land = { width: 20, length: 30, floors: 2, streets: ['s'], entries: ['s'] }, b = buildBrief(text, { land });
  const result = await generateInitialDesign({ land, rooms: [], discovery: b.discovery, idea: text, counts: b.counts, requirements: b.requirements });
  return createSession({ land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: text, result });
}
const S = await session();

test('التصنيف: السؤال سؤال، والطلب طلب ولو جاء بصيغة تلطّف، والانتقال انتقال', () => {
  for (const t of ['كم مساحة المجلس؟', 'وين المطبخ', 'ليش هذا التوزيع', 'هل نفذتي طلبي']) assert.equal(classify(t), 'ask', t);
  for (const t of ['كبّري المجلس', 'هل تقدرين تحطين المطبخ في الخلف؟', 'ممكن توسعين الصالة', 'ابي تصميم مختلف', 'المطبخ في الخلف', 'ابي مسبح']) assert.equal(classify(t), 'change', t);
  for (const t of ['افتحي ثلاثي الابعاد', 'وريني المخططات', 'ارجعي للتصميم']) assert.equal(classify(t), 'nav', t);
  assert.equal(classify('مرحبا'), 'help'); assert.equal(classify('الجو حلو اليوم'), 'unclear');
});
test('صياغة الطلب: تُحذف أدوات التلطّف وفعل الأمر فقط ولا يُضاف معنى', () => {
  assert.equal(canonicalAsk('كبّري المجلس'), 'المجلس أكبر'); assert.equal(canonicalAsk('ممكن توسعين الصالة'), 'الصالة أكبر');
  assert.equal(canonicalAsk('هل تقدرين تحطين المطبخ في الخلف؟'), 'المطبخ في الخلف'); assert.equal(canonicalAsk('ابي مسبح'), 'ابي مسبح');
});
test('الأسئلة: الجواب مقيس من المخطط المعروض نفسه', async () => {
  const sum = summarizeDoc(currentDoc(S)), maj = sum.rooms.find(r => r.type === 'majlis');
  const a = await sharaTurn(S, 'كم مساحة المجلس؟');
  assert.equal(a.kind, 'answer'); assert.ok(a.text.includes(`${maj.l} × ${maj.w}`) && a.text.includes(maj.level), a.text); assert.equal(a.session, undefined, 'السؤال لا يغيّر التصميم');
  const b = await sharaTurn(S, 'كم مساحة البيت'); assert.ok(b.text.includes(String(Math.round(sum.specs.built * 10) / 10)) && /دورين/.test(b.text), b.text);
  const c = await sharaTurn(S, 'وين المدخل'); assert.match(c.text, /مقدمة البيت/);
  const d = await sharaTurn(S, 'هل نفذتي طلبي؟'); assert.match(d.text, /نُفّذ \d+ من \d+/);
  const e = await sharaTurn(S, 'وين المسبح'); assert.match(e.text, /غير موجود/);
  const f = await sharaTurn(S, 'بكم يكلف'); assert.match(f.text, /بأسعارك/); assert.equal(f.actions[0].href, STAGES.find(s => s.id === 'boq').href);
});
test('الطلبات: تُنفَّذ على التصميم وتُحفظ في جلسة جديدة، وخارج صفحة التصميم يُطلب الاعتماد', async () => {
  const a = await sharaTurn(S, 'كبّري المجلس', { page: 'view3d' });
  assert.equal(a.kind, 'changed'); assert.equal(a.session.designs.length, S.designs.length + 1); assert.match(a.text, /المجلس أكبر/);
  assert.equal(a.actions[0].href, './design.html'); assert.match(a.text, /تعتمده/);
  const b = await sharaTurn(S, 'ابي تصميم مختلف', { page: 'design' });
  assert.equal(b.kind, 'changed'); assert.match(b.text, /توزيع مختلف/); assert.ok(!/لم أفهم/.test(b.text)); assert.deepEqual(b.actions, []);
});
test('الصدق: ما لم يُفهم لا يغيّر شيئًا ويُقال، وبلا تصميم مفتوح تدل على البداية', async () => {
  const a = await sharaTurn(S, 'الجو حلو اليوم'); assert.equal(a.kind, 'unclear'); assert.equal(a.session, undefined);
  const b = await sharaTurn(S, 'كم عمر المهندس؟'); assert.equal(b.kind, 'unclear'); assert.match(b.text, /لم أجد جواب سؤالك/);
  const c = await sharaTurn(null, 'كم مساحة المجلس؟'); assert.equal(c.kind, 'unclear'); assert.equal(c.actions[0].href, './home.html#land');
  assert.equal(answerQuestion(S, 'قصيدة عن البيت'), null);
});
test('الشكل الخارجي بالكلام: يُستدعى مطبّق الواجهة ولا يُعاد توليد المخطط', async () => {
  let called = 0; const ext = (s, t) => { called++; return { session: { ...s, tag: 1 }, understood: ['الطراز نجدي'], changed: true }; };
  const a = await sharaTurn(S, 'خلي الواجهة نجدية', { page: 'view3d', exterior: ext, redesign: () => { throw Error('لا يُعاد التوليد'); } });
  assert.equal(called, 1); assert.equal(a.exteriorOnly, true); assert.equal(a.session.designs.length, S.designs.length); assert.match(a.text, /نجدي/);
});
test('النافذة الجانبية مضافة لصفحات المسار، والمراحل بالترتيب المطلوب', () => {
  for (const f of ['design.html', 'view3d.html', 'final.html']) { const h = readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8'); assert.ok(h.includes('src="./shara-panel.mjs"'), f); assert.ok(h.includes('class="steps"'), f); }
  assert.deepEqual(STAGES.map(s => s.label), ['الأرض', 'شرعاء', 'التصميم', 'الشكل الخارجي', 'ثلاثي الأبعاد', 'المخططات', 'جدول الكميات']);
});
test('الملاحظات: السؤال عنها يعدّدها، وطلب علاجها ينفّذ كل المقترحات عبر مطبّق الإصلاح', async () => {
  const a = await sharaTurn(S, 'وش الملاحظات على التصميم؟'); assert.equal(a.kind, 'answer'); assert.match(a.text, /ملاحظ/);
  let called = 0; const fix = async (s, id) => { called++; assert.equal(id, 'all'); return { session: { ...s, tag: 2 }, changed: true, reply: { fixed: ['باب الحمام'], failed: [{ text: 'س', why: 'جرّبت 3 توزيعًا' }], relayout: true } }; };
  const { fixProposals } = await import('../dist/design-fixes.mjs');
  const b = await sharaTurn(S, 'عالجي الملاحظات', { page: 'view3d', fix });
  if (fixProposals(S).length) { assert.equal(called, 1); assert.equal(b.kind, 'changed'); assert.match(b.text, /عولج: باب الحمام/); assert.match(b.text, /تعذّر/); assert.equal(b.actions[0].href, './design.html'); }
  else assert.match(b.text, /لا توجد ملاحظات/);
});
