// «تصميم آخر» حتى عشرين تصميمًا مختلفًا فعلًا حيث تسمح الأرض والبرنامج، بلا تكرار ولا تصميم معيب، وبنفاد صادق بعدده الحقيقي.
// شكوى المالك: «يعطيني أربعة أو خمسة تصاميم ولا يعطي غيرها … والأهم أنه لا يكرر».
// المسار هنا هو مسار الصفحة نفسه: توليد أولي ثم extendSession (الخطوة التي يكررها العامل في الخلفية وزر «تصميم آخر»).
// الحدود الدنيا مقيسة (انظر تقرير القياس في رسالة الـ commit) ومأخوذة بهامش أمان؛ ما دون الحد الأدنى فشل، وما فوقه مقبول.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, extendSession, exhaustedMessage, cappedMessage, softEndMessage, redesign, TARGET_DESIGNS, MAX_DESIGNS } from '../dist/design-session.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { checkDoc, visualSig, visualSim, VISUAL_LIMIT, splitFails, patIdea } from '../dist/villa-layout.mjs';
import { checkMunicipal } from '../dist/municipal-rules.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

const A = '3 غرف نوم ومجلس رجال ومجلس نساء ومطبخ وصالة';
const B = '4 غرف نوم ومجلس رجال ومجلس نساء ومطبخ وصالة وغرفة خادمة';
const GUARDED = ['setback_front', 'setback_street', 'setback_neighbor', 'roof_parapet', 'coverage_ground', 'coverage_first'];
// [الاسم، العرض، الطول، الأدوار، البرنامج، الحد الأدنى المطلوب من التصاميم المختلفة]
const CASES = [
  ['12.5×30 دور · 3 غرف', 12.5, 30, 1, A, 6],
  ['15×25 دور · 3 غرف', 15, 25, 1, A, 11],
  ['15×25 دوران · 3 غرف', 15, 25, 2, A, 12],
  ['18×30 دور · 3 غرف', 18, 30, 1, A, 15],
  ['20×30 دور · 3 غرف', 20, 30, 1, A, 20],
  ['20×30 دور · 4 غرف', 20, 30, 1, B, 20],
  ['20×30 دوران · 3 غرف', 20, 30, 2, A, 20],
  ['20×30 دوران · 4 غرف', 20, 30, 2, B, 20],
  ['25×35 دور · 3 غرف', 25, 35, 1, A, 20],
  ['25×35 دور · 4 غرف', 25, 35, 1, B, 20],
  ['30×30 دوران · 3 غرف', 30, 30, 2, A, 20],
  ['30×30 دوران · 4 غرف', 30, 30, 2, B, 20],
];

async function startSession(w, l, floors, text) {
  const land = { width: w, length: l, floors, streets: ['s'], entries: ['s'] }, b = buildBrief(text, { land });
  const result = await generateInitialDesign({ land, rooms: [], discovery: b.discovery, idea: text, counts: b.counts, requirements: b.requirements });
  return createSession({ land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: text, result });
}
/** يكمل الجلسة بالخطوة نفسها التي يكررها العامل حتى want تصميمًا أو النفاد (relaxed: يقبل الأقرب بإعلانه، وهو ما يفعله زر «تصميم آخر» بعد المختلف بوضوح). */
async function fill(s, want, relaxed = false) {
  for (let guard = 0; guard < 60 && s.designs.length < want; guard++) {
    const o = await extendSession(s, { target: want, relaxed }); s = o.session;
    if (!o.added) break;
  }
  return s;
}

for (const [name, w, l, floors, text, min] of CASES) test(`${name}: لا أقل من ${min} تصميمًا مختلفًا، بلا زوج متشابه فوق العتبة ولا معيب ولا مخالف`, async () => {
  let s = await startSession(w, l, floors, text);
  const first = s.designs.length;
  s = await fill(s, min);
  const n = s.designs.length;
  assert.ok(n >= min, `${name}: ${n} تصميمًا فقط (الأول ${first})${s.exhausted ? ' — نفاد: ' + JSON.stringify(s.exhausted) : ''}`);
  const land = s.input.land, hard0 = splitFails(s.designs[0].ledger || [], s.input.requirements).hard;
  const sigs = s.designs.map(d => visualSig(JSON.parse(d.doc)));
  // لا نسخ: كل زوج ≤ 68٪ في الإكمال التلقائي (يختلف 32٪ على الأقل) و≤ 75٪ في الدفعة الأولى المعتادة؛ وما فوق 60٪ يحمل إعلانه في ملاحظاته (لا تكرار صامت)
  for (let j = 1; j < n; j++) {
    let worst = 0; for (let i = 0; i < j; i++) worst = Math.max(worst, visualSim(sigs[j], sigs[i]));
    assert.ok(worst <= (j < first ? VISUAL_LIMIT.relaxed : VISUAL_LIMIT.mid) + 1e-9, `${name}: التصميم ${j + 1} يشبه سابقًا بنسبة ${Math.round(worst * 100)}٪`);
    if (worst > VISUAL_LIMIT.strict + 1e-9) assert.ok((s.designs[j].notes || []).some(t => /يختلف (?:بـ|عنه) \d+٪ على الأقل/.test(t)), `${name}: التصميم ${j + 1} يشبه سابقًا بنسبة ${Math.round(worst * 100)}٪ بلا إعلان`);
  }
  assert.equal(new Set(s.designs.map(d => d.doc)).size, n, 'مستندان متطابقان');
  for (const [i, d] of s.designs.entries()) {
    const doc = parseDoc(d.doc), tag = `${name} · ${i + 1}`;
    assert.ok(checkDoc(doc).ok, tag + ': مخطط سليم');
    // لا يخفق في بنود طلب العميل أكثر مما أخفق الأول (معيب لا مختلف)
    assert.ok(splitFails(d.ledger || [], s.input.requirements).hard <= hard0, tag + ': بنود طلب أخفقت أكثر من الأول');
    const res = checkMunicipal(doc, land);
    for (const id of GUARDED) { const it = res.items.find(x => x.id === id); assert.ok(it, tag + ': بند ' + id); assert.notEqual(it.verdict, 'fail', `${tag}: ${id} — ${it.text}`); }
    assert.ok(d.score && d.score.total > 0, tag + ': درجة المطابقة محسوبة');
  }
  // أفكار التنظيم: أكثر من فكرة واحدة (لا تنويع على فكرة واحدة فقط)
  assert.ok(new Set(s.designs.map(d => patIdea(d.pat))).size >= 2, 'فكرة تنظيم واحدة فقط');
});

test('النفاد صادق: أرض ضيقة تنتهي بعددها الحقيقي ورسالة تذكره، والزر بعدها لا يختلق تصميمًا', async () => {
  let s = await startSession(12.5, 30, 1, A);
  s = await fill(s, TARGET_DESIGNS + 5);
  // الإكمال التلقائي يقف عند المختلف بوضوح ولا يعلن النفاد؛ الأقرب بطلب العميل وحده
  assert.ok(s.softEnd && !s.exhausted, 'يجب أن يقف الإكمال التلقائي عند المختلف بوضوح');
  assert.match(softEndMessage(s.designs.length), /32٪ على الأقل/);
  const clear = s.designs.length;
  s = await fill(s, TARGET_DESIGNS + 5, true);
  assert.ok(s.exhausted, 'يجب أن يُعلن النفاد قبل العشرين على هذه الأرض');
  assert.ok(s.designs.length < TARGET_DESIGNS && s.designs.length >= clear);
  assert.equal(s.exhausted.count, s.designs.length, 'العدد المعلن هو عدد ما عُرض فعلًا');
  const msg = exhaustedMessage(s.designs.length);
  assert.match(msg, new RegExp(`وصلنا إلى كل التوزيعات المختلفة الممكنة لأرضك وبرنامجك \\(${s.designs.length} تصميمًا\\)`));
  // لا زوج فوق 75٪ حتى بعد الأقرب
  const sigs = s.designs.map(d => visualSig(JSON.parse(d.doc)));
  for (let j = 1; j < sigs.length; j++) for (let i = 0; i < j; i++) assert.ok(visualSim(sigs[j], sigs[i]) <= VISUAL_LIMIT.relaxed + 1e-9);
  const again = await extendSession(s, { target: TARGET_DESIGNS, relaxed: true });
  assert.equal(again.added, false); assert.equal(again.exhausted, true);
  assert.equal(again.session.designs.length, s.designs.length, 'لا تصميم جديد بعد النفاد');
});

test('الحد الأقصى للجلسة: لا إضافة بعد MAX_DESIGNS، ورسالته تذكر العدد', async () => {
  const s = await startSession(20, 30, 1, A);
  const big = { ...s, designs: Array.from({ length: MAX_DESIGNS }, (_, i) => ({ ...s.designs[0], doc: s.designs[0].doc + ' '.repeat(i) })) };
  const o = await extendSession(big, { target: MAX_DESIGNS + 5 });
  assert.equal(o.added, false); assert.equal(o.capped, true);
  assert.match(cappedMessage(MAX_DESIGNS), new RegExp(String(MAX_DESIGNS)));
});

test('طلب جديد (شكل أو عدد) يلغي نفاد الطلب السابق', async () => {
  let s = await startSession(12.5, 30, 1, A);
  s = await fill(await fill(s, TARGET_DESIGNS), TARGET_DESIGNS, true);
  assert.ok(s.exhausted);
  const o = await redesign(s, { picks: ['hall_big'] });
  assert.equal(o.session.exhausted, undefined, 'تغيّر الطلب فلا يسري نفاد السابق');
});
