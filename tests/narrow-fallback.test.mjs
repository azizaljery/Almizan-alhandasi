// البديل الاحتياطي بصالة مخفَّفة (بعد نفاد البدائل بالحدود المعتادة فقط): الوسم بأرقامه الفعلية، الترتيب بعد العادية، البوابات، لا تكرار، وصدق النفاد حين لا يجتاز شيء.
// القياس الموثّق في docs/more-alternatives.md (قسم «البديل الاحتياطي»): يضيف بديلًا واحدًا لأراضي 12.5 م بدورين، ولا يضيف لدور واحد.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, extendSession, exhaustedMessage, fallbackLabel } from '../dist/design-session.mjs';
import { visualSig, visualSim, macroSig, macroSim, VISUAL_LIMIT, MACRO_LIMIT, HALL_LIMITS, HALL_RELAX, setHallRelax, planMetrics } from '../dist/villa-layout.mjs';
import { reviewGate, ctxOfSession } from '../dist/design-review.mjs';
import { azizPanelModel } from '../dist/aziz-panel.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

globalThis.__noProbe = true;
const fx = JSON.parse(readFileSync(new URL('./fixtures/qa-cases.json', import.meta.url), 'utf8')), C = id => fx.cases.find(c => c.id === id);
async function start(id) {
  const c = C(id), b = buildBrief(c.text, { land: c.land }), result = await generateInitialDesign({ land: c.land, rooms: [], discovery: b.discovery, idea: c.text, counts: b.counts, requirements: b.requirements });
  return createSession({ land: c.land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: c.text, result });
}
async function pressNext(s) {
  let o = await extendSession(s, { target: s.designs.length + 1, relaxed: !!s.softEnd });
  if (o.softEnd && !o.added) o = await extendSession(o.session, { target: o.session.designs.length + 1, relaxed: true });
  return o;
}
async function exhaust(s, max = 9) { for (let i = 0; i < max; i++) { const o = await pressNext(s); s = o.session; if (!o.added) break; } return s; }
const mand = (s, d) => reviewGate({ route: 'alternative', doc: JSON.parse(d.doc), ctx: ctxOfSession(s) }).summary.counts.mandatory.violated;
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

test('سلّم التخفيف يمسّ الصالة وحدها وبحدّ أعلى معلن، والمستوى 0 هو المعتاد', () => {
  for (const r of HALL_RELAX.slice(1)) { assert.deepEqual(Object.keys(r).sort(), ['minNetW', 'ratio', 'strip']); assert.ok(r.ratio <= 5.0 && r.ratio > HALL_LIMITS.ratio, 'النسبة ضمن سقف 1:5'); assert.ok(r.minNetW >= 3.2 && r.minNetW <= HALL_LIMITS.minNetW, 'العرض الصافي لا ينزل عن 3.2 م'); }
  for (let i = 2; i < HALL_RELAX.length; i++) assert.ok(HALL_RELAX[i].ratio > HALL_RELAX[i - 1].ratio && HALL_RELAX[i].minNetW <= HALL_RELAX[i - 1].minNetW, 'تدريجي لا قفزة');
  assert.equal(setHallRelax(0), HALL_LIMITS); assert.deepEqual({ ...HALL_LIMITS }, { ratio: 1.6, minNetW: 4.5 });
});

test('n12.5x25-f2-b3w: الاحتياطي يأتي بعد العادية، موسوم بأرقامه الفعلية، ودرجته بجانب الأول', { timeout: 300000 }, async () => {
  const s = await exhaust(await start('n12.5x25-f2-b3w')), fb = s.designs.map((d, i) => d.fallback ? i : -1).filter(i => i >= 0);
  assert.equal(fb.length, 1, 'بديل احتياطي واحد'); assert.equal(fb[0], s.designs.length - 1, 'آخر الترتيب بعد كل العادية'); assert.ok(s.designs.slice(0, fb[0]).every(d => !d.fallback));
  const d = s.designs[fb[0]], f = d.fallback, hall = planMetrics(parseDoc(d.doc)).levels.map(lv => lv.hall).filter(Boolean).sort((a, b) => b.ratio - a.ratio)[0];
  assert.equal(f.kind, 'hall'); assert.equal(f.source, 'generator'); assert.equal(f.score, d.score.total); assert.equal(f.firstScore, s.designs[0].score.total);
  assert.equal(f1(f.hall.w), f1(hall.w)); assert.equal(f1(f.hall.l), f1(hall.l)); assert.equal(f1(f.hall.ratio), f1(hall.ratio));
  for (const t of [`${f1(hall.w)} × ${f1(hall.l)}`, `1:${f1(hall.ratio)}`, `${f1(HALL_LIMITS.minNetW)}`, `1:${f1(HALL_LIMITS.ratio)}`, `${f.score}/100`, `${f.firstScore}/100`, 'مولّد الميزان', 'لا من عزيز', 'لا يُعرض على أنه بجودة الأول']) assert.ok(f.text.includes(t), 'الوسم يحوي: ' + t);
  assert.ok(f.hall.ratio > HALL_LIMITS.ratio || f.hall.w < HALL_LIMITS.minNetW, 'الصالة فعلًا خارج المعتاد (وإلا فلا وسم)');
  assert.ok(d.notes[0] === f.text, 'الوسم في ملاحظات التصميم');
  const m = azizPanelModel({ ...s, current: fb[0] }, parseDoc(d.doc)); assert.equal(m.fallback.text, f.text, 'لوحة عزيز تحمل الوسم نفسه');
  assert.equal(fallbackLabel(s, d, f.level).text, f.text, 'الوسم قابل لإعادة الحساب بالأرقام نفسها');
});

test('البوابات تُطبَّق على الاحتياطي: لا مخالفات إلزامية أكثر من أفضل معروض، ولا تكرار بصري/هيكلي، ولا نمط مكرر', { timeout: 300000 }, async () => {
  for (const id of ['n12.5x25-f2-b4m', 'n12.5x30-f2-b4m', 'n12.5x25-f2-b3w']) {
    const s = await exhaust(await start(id)), i = s.designs.findIndex(d => d.fallback); assert.ok(i >= 1, id + ': يوجد احتياطي');
    const best = Math.min(...s.designs.slice(0, i).map(d => mand(s, d))); assert.ok(mand(s, s.designs[i]) <= best, id + ': مخالفات إلزامية أكثر من أفضل معروض');
    const sig = s.designs.map(d => visualSig(parseDoc(d.doc))), mac = s.designs.map(d => macroSig(parseDoc(d.doc)));
    for (let a = 0; a < sig.length; a++) for (let b = 0; b < a; b++) { assert.ok(visualSim(sig[a], sig[b]) <= VISUAL_LIMIT.relaxed + 1e-9, `${id} بصري ${a}-${b}`); assert.ok(macroSim(mac[a], mac[b]) <= MACRO_LIMIT.relaxed + 1e-9, `${id} هيكلي ${a}-${b}`); }
    assert.equal(new Set(s.designs.map(d => d.pat)).size, s.designs.length, id + ': لا نمط مكرر');
    assert.ok(s.designs[i].score && s.designs[i].score.total > 0, 'الدرجة مسجَّلة');
  }
});

test('لا يعمل التخفيف إلا بعد النفاد العادي: أرض كبيرة لا تحوي وسمًا في أول ستة، والحدود المعتادة تعود بعد التوليد', { timeout: 300000 }, async () => {
  const s = await exhaust(await start('r20x20-f1-b3'), 6); assert.ok(s.designs.length >= 6); assert.ok(s.designs.every(d => !d.fallback), 'لا وسم قبل النفاد العادي');
  const a = await start('n12.5x25-f2-b3w'), b = await start('n12.5x25-f2-b3w'); assert.equal(a.designs[0].pat, b.designs[0].pat, 'الحدود المعتادة سارية بعد أي توليد احتياطي سابق');
});

test('دور واحد 12.5×25: لا بديل احتياطي، والنفاد صادق ولا يدّعي بديلًا', { timeout: 300000 }, async () => {
  const s = await exhaust(await start('n12.5x25-f1-b3')); assert.equal(s.designs.length, 1); assert.ok(s.designs.every(d => !d.fallback)); assert.ok(s.exhausted);
  const msg = exhaustedMessage(s.designs.length, s.exhausted.twoFloors, s.exhausted); assert.match(msg, /وصلنا إلى كل التوزيعات المختلفة الممكنة/); assert.doesNotMatch(msg, /1 تصميمين/);
});

test('رسالة النفاد تذكر الاحتياطي ومحاولاته بالأرقام', () => {
  const m = exhaustedMessage(3, null, { fallback: { shown: 1, tried: 4, rejected: 3 } });
  assert.match(m, /منها 1 بصالة أضيق من المعتاد/); assert.match(m, /في 4 محاولة، ولم يجتز بوابات المراجعة منها 3/);
  assert.match(exhaustedMessage(3, null, { fallback: { shown: 0, tried: 0, rejected: 0 } }), /ولم ينتج تخفيف حدّ الصالة وحدها تصميمًا جديدًا مختلفًا/);
});
