// فهم Claude المكاني: مخطط الأداة في الوكيل، والتنقيح الصارم، والدمج مع الفهم المحلي، ووصوله إلى التصميم.
// كل ردود المزوّد محاكاة؛ لا مفتاح حقيقي ولا اتصال.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_SUBJECTS, sanitizeAiRequirements } from '../dist/ai-requirements.mjs';
import { SUBJECTS } from '../dist/rules.mjs';
import { extractRequirements, withAi } from '../dist/requirements.mjs';
import { BRIEF_SCHEMA, createWorker, validateBrief } from '../worker/server.mjs';
import { validateSuggestion } from '../dist/assistant.mjs';
import { SharaSession, generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';

const ORIGIN = 'https://mizan.example', ENV = { ANTHROPIC_API_KEY: 'unit-test-only', MIZAN_ACCESS_CODE: 'private-test-code', ALLOWED_ORIGIN: ORIGIN };
const BASE = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
const LAND = { width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1 };
const aiReq = () => ({
  rules: [
    { kind: 'place', a: 'kitchen', side: 'back', mode: 'half', quote: 'المطبخ ورى' },
    { kind: 'near', a: 'maid', b: 'kitchen', quote: 'الشغالة عند المطبخ' },
    { kind: 'place', a: 'sofa', side: 'back', quote: 'خارج المفردات' },
    { kind: 'teleport', a: 'kitchen', quote: 'نوع غير معروف' },
  ],
  prefs: ['closedKitchen', 'hack'], extras: [{ kind: 'maid', bath: true }], areas: [{ room: 'majlis', m2: 35 }, { room: 'pool', m2: 40 }],
  unclear: ['التصميم يكون مودرن'], absent: [], floors: 1,
});

test('مفردات Claude هي مفردات الفهم المحلي نفسها (لا فراغ يفهمه أحدهما دون الآخر)', () => {
  assert.deepEqual([...AI_SUBJECTS].sort(), SUBJECTS.map(s => s.id).sort());
  assert.ok(BRIEF_SCHEMA.properties.requirements, 'خاصية requirements في أداة الوكيل');
  assert.ok(!BRIEF_SCHEMA.required.includes('requirements'), 'اختيارية: رد قديم بلا requirements يبقى صالحًا');
});
test('التنقيح يُسقط ما خرج عن المفردات ولا يرفض الجواب كله', () => {
  const r = sanitizeAiRequirements(aiReq());
  assert.deepEqual(r.rules.map(x => x.kind + ':' + x.a), ['place:kitchen', 'near:maid']);
  assert.deepEqual(r.prefs, ['closedKitchen']); assert.deepEqual(r.areas, { majlis: 35 }); assert.deepEqual(r.unclear, ['التصميم يكون مودرن']);
  assert.equal(sanitizeAiRequirements('x'), null);
  // الوكيل والمتصفح يمرّران requirements المنقّحة
  const brief = { summary: 'ملخص', assumptions: [], questions: [], unhandled: [], rooms: [{ name: 'مطبخ', type: 'kitchen', area: 14, position: 'back', side: 'any' }], requirements: aiReq() };
  assert.equal(validateBrief(brief).requirements.rules.length, 2);
  assert.equal(validateSuggestion(validateBrief(brief)).requirements.rules.length, 2);
  // ملاحظة تعديل بلا غرف مقبولة إن حملت قواعد
  assert.equal(validateBrief({ ...brief, rooms: [] }).rooms.length, 0);
});
test('الدمج: المحلي يتقدم عند التعارض، وما فات المحلي يُضاف من Claude، و«لم أفهم» حكم Claude', () => {
  const local = extractRequirements('المطبخ في الأمام، وخل التصميم مودرن', { counts: BASE });
  const m = withAi(local, sanitizeAiRequirements(aiReq()));
  const kitchen = m.rules.filter(r => r.kind === 'place' && r.a === 'kitchen');
  assert.equal(kitchen.length, 1); assert.equal(kitchen[0].side, 'front', 'المحلي يتقدم');
  assert.ok(m.rules.some(r => r.kind === 'near' && r.a === 'maid'), 'قاعدة فاتت المحلي');
  assert.equal(m.prefs.openKitchen, false); assert.deepEqual(m.extras.maid, { bath: true, ext: false }); assert.equal(m.areas.majlis, 35);
  assert.deepEqual(m.unclear, ['التصميم يكون مودرن']); assert.equal(m.source, 'claude');
  assert.equal(withAi(local, null), local);
});
test('الوكيل يرسل تعليمات requirements ويعيدها منقّحة (مزوّد محاكى)', async () => {
  let sent = null;
  const worker = createWorker({}, async (url, init) => { sent = JSON.parse(init.body); return Response.json({ stop_reason: 'tool_use', model: 'm', content: [{ type: 'tool_use', id: 't', name: 'submit_home_brief', input: { summary: 's', assumptions: [], questions: [], unhandled: [], rooms: [], requirements: aiReq() } }] }); });
  const res = await worker.fetch(new Request(ORIGIN + '/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Mizan-Access-Code': 'private-test-code', 'CF-Connecting-IP': '192.0.2.9' }, body: JSON.stringify({ prompt: 'المطبخ ورى والشغالة عند المطبخ', plot: { width: 20, length: 30, floors: 1, streets: { s: true } } }) }), ENV);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.brief.requirements.rules.length, 2);
  assert.match(sent.system, /requirements/); assert.ok(sent.tools[0].input_schema.properties.requirements);
});
test('من محادثة شرعاء إلى المخطط: ما فهمه Claude يُنفَّذ ويظهر في السجل', async () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'free');
  const msgs = s.answer('free', { text: 'الشغالة تكون عند المطبخ والمطبخ ورى البيت', counts: {}, requirements: sanitizeAiRequirements({ rules: [{ kind: 'near', a: 'maid', b: 'kitchen', quote: 'الشغالة عند المطبخ' }, { kind: 'place', a: 'kitchen', side: 'back', mode: 'half', quote: 'المطبخ ورى البيت' }], extras: [{ kind: 'maid' }], unclear: [] }) });
  assert.ok(msgs.find(m => m.kind === 'list').items.some(t => /الخادمة/.test(t)));
  s.answer('counts', BASE);
  const out = await generateInitialDesign({ land: LAND, counts: s.counts, requirements: s.requirements });
  const led = out.ledger.filter(x => x.id.startsWith('R'));
  assert.ok(led.length >= 2 && led.every(x => x.ok), led.map(x => x.text + ' ' + x.why).join('؛ '));
  // وفي التعديل: ai يُمرَّر إلى redesign
  const ds = createSession({ land: LAND, counts: s.counts, requirements: s.requirements, result: out });
  const { reply } = await redesign(ds, { text: 'خل المكتب ورى', ai: sanitizeAiRequirements({ rules: [{ kind: 'place', a: 'office', side: 'back', mode: 'half', quote: 'المكتب ورى' }], extras: [{ kind: 'office' }], unclear: [] }) });
  assert.ok(reply.done.some(t => /المكتب/.test(t)), JSON.stringify(reply));
});
