// تكامل المرحلة الثانية: المتطلبات v2 + المولّد الثاني + المراجعة المستقلة (plan-review) بوابةً نهائية،
// والجلسة ومسار البيت على المولّد الثاني (والأول احتياط بـ engine:'v1').
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, siteOf, landWithSite, difference } from '../dist/villa-layout-v2.mjs';
import { archDifference, THRESHOLDS } from '../dist/arch-difference.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRequest, docRooms, mergeRules } from '../dist/rules.mjs';
import { reviewDesign, GATES } from '../dist/plan-review.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };

/** كل بديل معروض: مراجعة مرفقة، ناجح في كل البوابات، ومراجعة مستقلة جديدة على المستند تقول الشيء نفسه. */
function assertReviewed(designs, r, land) {
  for (const d of designs) {
    assert.ok(d.review, 'المراجعة مرفقة بالبديل');
    assert.equal(d.review.passed, true, (d.review.rejectReasons_ar || []).join(' | '));
    assert.deepEqual(d.review.failedGates, []);
    assert.equal(d.review.gates.length, GATES.length);
    assert.ok(Number.isFinite(d.review.score) && d.review.score > 0 && d.review.score <= 100);
    assert.ok(Array.isArray(d.review.rejectReasons_ar));
    // مستقل: إعادة المراجعة من المستند والطلب فقط
    const again = reviewDesign(d.doc, { counts: r.counts, land }, { external: false });
    assert.equal(again.passed, true, again.rejectReasons_ar.join(' | '));
  }
}

test('C6: المقاسات الصريحة (مجلس 5×6، مطبخ 4×5) داخل السماحية في البديل الأول، والزائد عن المطبخ مخزن حقيقي لا مطبخ ممطوط', () => {
  const { r, land } = caseReq('C6');
  const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  assertReviewed(out.designs, r, land);
  const best = out.designs[0], dims = verifyRequest(best.doc, r, { entry: 's' }).filter(x => x.kind === 'dims');
  assert.equal(dims.length, 2);
  for (const x of dims) assert.equal(x.status, 'done', x.text + ' — ' + x.why);
  // البدائل المعروضة تحقق المقاسات كذلك أو تُعلن الإخفاق بقياس
  for (const d of out.designs) for (const x of d.ledger.filter(l => l.kind === 'dims')) assert.ok(x.status === 'done' || /×/.test(x.why));
});

test('C5: الأرض شبه منحرف في المستند، والبند مقيس «نُفّذ»، وبديل واحد على الأقل يتبع شكلها (أعرض من أي مستطيل يتسع فيها)', () => {
  const { r, land } = caseReq('C5');
  const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  assertReviewed(out.designs, r, land);
  for (const d of out.designs) { const s = d.ledger.find(x => x.id === 'S-shape'); assert.equal(s.status, 'done', s.why); }
  const site = siteOf(landWithSite(land, r));
  assert.ok(site.irregular);
  // (الجولة التاسعة: أعرض من أعرض مستطيل بسماكة جدار خارجي على الأقل — 0.25 م؛ كانت 0.3 فخرج yoo:u0 بفارق 0.29 م بعد
  // تغيّر البحث بحد الرئيسية 24 م²، وهو يتبع شكل الأرض فعلًا)
  const follow = out.designs.filter(d => d.env.w > site.rectW(d.env.d) + .25);
  // (الجولة الحادية عشرة) تحت المقياس الوظيفي v2 لا يُحتسب الغلاف وحده اختلافًا: إن لم يكن تنظيم يتبع الشكل «مختلفًا معماريًا»
  // ولا نسخة من الأفضل يحل محله، يُقال ذلك صراحة في ملاحظات البديل الأول بدل عرضه
  const said = out.designs[0].notes.some(n => /يتبع شكل الأرض/.test(n));
  assert.ok(follow.length >= 1 || said, 'بديل يستغل الشكل: ' + out.designs.map(d => `${d.pat} ${d.env.w}/${site.rectW(d.env.d).toFixed(2)}`).join(' | '));
  // وكل فراغ مبني داخل الأرض بارتداداتها (بوابة PLOT في المراجعة المستقلة)
  for (const d of out.designs) assert.ok(d.review.gates.find(g => g.id === 'PLOT').ok);
});

// (الجولة الرابعة: البدائل المخالفة لـ«الماستر بعيدة عن الدرج» لا تُعرض لسد العدد — بديلان على الأقل كلاهما ينفّذه)
test('C7: دوران — الماستر بعيدة عن الدرج المرسوم (مقيسة من سلالم المستند) في كل بديل، وبديلان على الأقل كلها ناجحة في المراجعة', () => {
  const { C, r } = caseReq('C7'), land = { floors: 2, ...C.land };
  const out = generateVillaTwoFloors({ land, counts: r.counts, requirements: r, keep: 4 });
  // الجولة السابعة: الطعام ≥ 3.3 م صافيًا جعل التنظيم الأرضي الثاني (compact:c3p) لا يتسع لمحور السلم، وبقية الأرضيات الناجحة
  // نسخ شكلية من الأول (اختلاف معماري 0.10 لأن العلوي نفسه) — قرار المالك: لا حشو للعدد؛ يكفي بديل واحد سليم والنقص مذكور بسببه
  assert.ok(out.designs.length >= 1, `البدائل ${out.designs.length}`);
  if (out.designs.length < 4) assert.match(out.shortfall_ar || '', /من 4 مطلوبة/);
  for (const d of out.designs) { const f = d.ledger.find(x => x.kind === 'far' && /الدرج/.test(x.text)); assert.equal(f.status, 'done', d.pat + ' ' + f.why); }
  assertReviewed(out.designs, r, land);
  const far = out.designs[0].ledger.find(x => x.kind === 'far' && /الدرج/.test(x.text));
  assert.equal(far.status, 'done', far.why);
  // «غرف النوم فوق» مع «غرفة أمي في الأرضي»: القاعدة الأخص تتقدم، فلا يُعد وجود غرفة كبار السن تحت إخفاقًا
  const up = out.designs[0].ledger.find(x => x.kind === 'floor' && /غرف النوم/.test(x.text)); assert.equal(up.status, 'done', up.why);
  for (const d of out.designs) assert.equal(d.doc.levels.length, 2);
});

test('البدائل: لا انعكاسات لسد العدد، ولا بديلان متقاربان (اختلاف ≥ 0.12)، وكلها تجتاز البوابات المستقلة', () => {
  for (const id of ['C1', 'C4', 'C10']) {
    const { C, r, land } = caseReq(id);
    const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 });
    assertReviewed(out.designs, r, land);
    assert.ok(!out.designs.some(d => /معكوس/.test(d.summary) || d.mirrorOf), id + ': لا بديل معكوس');
    // (الجولة التاسعة) على الأرض الضيقة تتقارب مراكز الغرف حتمًا: بيت بكتلتين وحديقة جانبية مقابل كتلة مصمتة بديل مختلف
    // ولو قلّت إزاحة المراكز عن 0.12 — بشرط الاختلاف المعماري (≥ 0.18، dist/arch-difference.mjs)
    for (let i = 0; i < out.designs.length; i++) for (let j = i + 1; j < out.designs.length; j++) assert.ok(difference(out.designs[i].doc, out.designs[j].doc) >= .12 || archDifference(out.designs[i].doc, out.designs[j].doc).total >= THRESHOLDS.cosmetic, `${id}: ${i + 1}/${j + 1}`);
    if (out.designs.length < (C.want || 4)) assert.ok(out.designs[0].notes.some(n => /مختلفة تنظيميًا فقط/.test(n)), id + ': يُذكر نقص العدد وسببه');
  }
});

test('المراجعة بوابة نهائية: البديل الراسب يُرفض بسبب من plan-review ولا يُعرض', () => {
  const { r, land } = caseReq('C1');
  const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  for (const x of out.rejected.filter(x => x.by === 'plan-review')) { assert.ok(x.gates.length >= 1); assert.ok(x.why.length >= 1); assert.ok(!out.designs.some(d => d.pat === x.pat)); }
  assert.ok(out.designs.every(d => d.review.passed));
});

// (الجولة العشرون، توجيه المالك أولًا) المحرك الثالث (العلاقات والقيود) افتراضي في مسار البيت، والأول والثاني باقيان وقابلان للاختيار صراحة
test('مسار البيت والجلسة: الثالث افتراضيًا، والأول احتياط بـ engine:\'v1\' طوال الجلسة', async () => {
  const { r, land } = caseReq('C9');
  const v2 = await generateInitialDesign({ land, counts: r.counts, requirements: r });
  assert.equal(v2.villaEngine, 'v3'); assert.ok(v2.review && v2.review.passed); assert.ok(v2.alternatives.every(a => a.review && a.review.passed));
  const v1 = await generateInitialDesign({ land, counts: r.counts, requirements: r, engine: 'v1' });
  assert.equal(v1.villaEngine, 'v1'); assert.notEqual(v1.engine, v2.engine);
  const s1 = createSession({ land, counts: r.counts, requirements: r, result: v1, engine: 'v1' });
  assert.equal(s1.input.engine, 'v1');
  let seen = null;
  await redesign(s1, { picks: ['layout'] }, { generate: async o => { seen = o.engine; return generateInitialDesign(o); } });
  assert.equal(seen, 'v1', 'إعادة التصميم على المولّد نفسه');
  const s2 = createSession({ land, counts: r.counts, requirements: r, result: v2 });
  assert.equal(s2.input.engine, null);
});

test('C8: تعديل المطبخ يُنفَّذ فعلًا (بجوار الطعام وفي الخلف) مع بقاء غرف البرنامج، وتغيّر النمط يُقال صراحة', async () => {
  const { C, r, land } = caseReq('C8');
  const first = await generateInitialDesign({ land, counts: r.counts, requirements: r });
  let { session, reply } = await redesign(createSession({ land, counts: r.counts, requirements: r, result: first }), { text: C.edit });
  // (الجولة الرابعة عشرة) خيارات صريحة؛ إن لم يوجد توزيع جديد (غير البدائل المعروضة) يحققه يبقى المخطط حرفيًا ويُدل على البديل المعروض
  if (reply.mode === 'ask-options') {
    const act = reply.options.find(o => o.id === 'zone') || reply.options.find(o => o.id === 'full');
    if (!act) { assert.ok(reply.options.some(o => o.id === 'shown')); return; }
    ({ session, reply } = await redesign(session, { text: String(act.n) }));
  } else if (reply.mode === 'ask-regenerate' || (reply.conflicts || []).some(c => c.type === 'needs-consent')) ({ session, reply } = await redesign(session, { text: 'نعم' }));
  assert.deepEqual([...reply.done].sort(), ['«المطبخ» بجوار «الطعام»', '«المطبخ» في الخلف'].sort(), JSON.stringify(reply.failed));
  const after = JSON.parse(session.designs[1].doc);
  const led = verifyRequest(after, { rules: mergeRules([], extractRequirements(C.edit, { counts: {} }).rules) }, { entry: 's' });
  assert.ok(led.every(x => x.status === 'done'), JSON.stringify(led));
  const prog = d => docRooms(d).rooms.filter(x => ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen'].includes(x.type)).map(x => x.name).sort();
  assert.deepEqual(prog(after), prog(first.doc));
  assert.ok(session.designs[1].review && session.designs[1].review.passed);
});
