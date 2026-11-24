// «تصميم آخر»: صدق النفاد المبكر بالأرقام، واستعادة درجات السلّم عند «توزيع مختلف»، وبقاء بوابات التمايز كما هي (لا تخفيف).
// القياس الموثّق في docs/more-alternatives.md: أرض 12.5 (صافي 9.2 م) لا تتسع إلا لفكرة تنظيم واحدة بالمولّد الحالي؛ لا يُدّعى هنا بلوغ سبعة تصاميم لها.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, extendSession, redesign, exhaustedMessage } from '../dist/design-session.mjs';
import { designsAr, visualSig, visualSim, macroSig, macroSim, VISUAL_LIMIT, MACRO_LIMIT } from '../dist/villa-layout.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/qa-cases.json', import.meta.url), 'utf8')), C = id => fx.cases.find(c => c.id === id);
async function start(id) {
  const c = C(id), b = buildBrief(c.text, { land: c.land }), result = await generateInitialDesign({ land: c.land, rooms: [], discovery: b.discovery, idea: c.text, counts: b.counts, requirements: b.requirements });
  return createSession({ land: c.land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: c.text, result });
}
/** ما يفعله زر «تصميم آخر» في الصفحة: التالي، وعند اللين الهيكلي بالأقرب المعلن. */
async function pressNext(s) {
  let o = await extendSession(s, { target: s.designs.length + 1, relaxed: !!s.softEnd });
  if (o.softEnd && !o.added) o = await extendSession(o.session, { target: o.session.designs.length + 1, relaxed: true });
  return o;
}
async function exhaust(s, max = 9) { for (let i = 0; i < max; i++) { const o = await pressNext(s); s = o.session; if (!o.added) break; } return s; }

test('العدد بالعربية الصحيحة: لا «1 تصميمين»', () => {
  assert.equal(designsAr(1), 'تصميمًا واحدًا'); assert.equal(designsAr(2), 'تصميمين'); assert.equal(designsAr(3), '3 تصاميم'); assert.equal(designsAr(10), '10 تصاميم'); assert.equal(designsAr(11), '11 تصميمًا');
});
test('«توزيع مختلف» على جلسة مخفَّفة بالسلّم: تُستعاد درجات السلّم فيأتي نفاد صادق بأرقامه، لا «نفاد» من برنامج لا يتسع أصلًا', { timeout: 120000 }, async () => {
  const s = await start('n12.5x25-f1-b3'); assert.ok(s.designs[0].fit?.applied?.length, 'الجلسة مخفَّفة بالسلّم');
  await assert.rejects(() => redesign(s, { picks: ['layout'] }), e => {
    assert.equal(e.code, 'VILLA_EXHAUSTED'); assert.doesNotMatch(e.message, /1 تصميمين/); assert.match(e.message, /تصميمًا واحدًا/);
    assert.ok(e.stats && e.stats.W === 9.2 && e.stats.D === 20.2 && e.stats.ideas >= 1, 'أرقام النفاد مقيسة من المولّد: ' + JSON.stringify(e.stats)); return true;
  });
});
test('طريق «توزيع مختلف» وطريق زر «تصميم آخر» يعطيان العدد نفسه لجلسة مخفَّفة (x15x25-f1-b6jmp)', { timeout: 240000 }, async () => {
  let a = await start('x15x25-f1-b6jmp'), b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 4; i++) { try { a = (await redesign(a, { picks: ['layout'] })).session; } catch { break; } }
  b = await exhaust(b, 5);
  assert.equal(a.designs.length, b.designs.length, `picks=${a.designs.length} زر=${b.designs.length}`); assert.ok(a.designs.length >= 2);
});
for (const id of ['n12.5x25-f1-b3', 'n12.5x30-f1-b3', 'n12.5x30-f2-b4m']) {
  test(`${id}: النفاد المبكر يُعلن بالعدد الفعلي والسبب بالأرقام والخطوات المقيسة، والبوابات كما هي`, { timeout: 240000 }, async () => {
    const s = await exhaust(await start(id)), n = s.designs.length;
    assert.ok(s.exhausted, 'أُعلن النفاد'); assert.equal(s.exhausted.count, n, 'العدد المعلن = ما عُرض فعلًا');
    assert.ok(s.exhausted.stats && s.exhausted.stats.W > 0 && s.exhausted.stats.ideas >= 1, 'إحصاءات النفاد مسجلة');
    const msg = exhaustedMessage(n, s.exhausted.twoFloors, s.exhausted);
    assert.match(msg, new RegExp(`وصلنا إلى كل التوزيعات المختلفة الممكنة لأرضك وبرنامجك \\(${n} تصميمًا\\)`)); assert.doesNotMatch(msg, /1 تصميمين/);
    assert.match(msg, new RegExp(`عرضتُ عليك فعليًا ${designsAr(n)}`)); assert.match(msg, new RegExp(`${s.exhausted.stats.W} × ${s.exhausted.stats.D} م`)); assert.match(msg, /تتسع (?:لفكرة تنظيمية واحدة|لفكرتين تنظيميتين|لـ\d+ أفكار تنظيمية)/); assert.match(msg, /الحدود لم تُخفَّف/);
    for (const x of s.exhausted.suggest || []) { assert.ok(x.k > n && x.label); assert.ok(msg.includes(x.label), 'الاقتراح المقيس يظهر في الرسالة'); }
    // البوابات لم تُخفَّف: لا زوج فوق حدّ التشابه المعتمد، ولا تكرار هيكلي
    const sig = s.designs.map(d => visualSig(parseDoc(d.doc))), mac = s.designs.map(d => macroSig(parseDoc(d.doc)));
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) { assert.ok(visualSim(sig[i], sig[j]) <= VISUAL_LIMIT.relaxed + 1e-9, `بصري ${i}-${j}`); assert.ok(macroSim(mac[i], mac[j]) <= MACRO_LIMIT.relaxed + 1e-9, `هيكلي ${i}-${j}`); }
  });
}
test('أرض كبيرة (20×20): ستة تصاميم فأكثر دون تخفيف للبوابات (لا انحدار)', { timeout: 240000 }, async () => {
  const s = await exhaust(await start('r20x20-f1-b3'), 8); assert.ok(s.designs.length >= 6, 'عدد التصاميم ' + s.designs.length);
  const sig = s.designs.map(d => visualSig(parseDoc(d.doc))); for (let i = 0; i < sig.length; i++) for (let j = 0; j < i; j++) assert.ok(visualSim(sig[i], sig[j]) <= VISUAL_LIMIT.relaxed + 1e-9);
});
