import test from 'node:test';
import assert from 'node:assert/strict';
import { askDrawingAssistant, previewCommands, DRAWING_ENDPOINT } from '../dist/draw/assistant-client.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';

const villa = sampleVilla();
const ar = /[؀-ۿ]/;
// fake fetch: records calls, answers like the Worker
function fake(reply = {}, { status = 200, throws = null, contentType = 'application/json' } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    if (throws) throw throws;
    return new Response(JSON.stringify({ source: 'claude', model: 'claude-sonnet-5-5', answer: 'جواب تجريبي من المساعد.', suggestions: ['اقتراح'], commands: [], limitations: ['ملخص فقط'], ...reply }), { status, headers: { 'content-type': contentType } });
  };
  return { fetcher, calls };
}
const opts = (f, extra = {}) => ({ accessCode: 'code-1', fetcher: f.fetcher, ...extra });

test('a request the local interpreter resolves never touches the network', async () => {
  const f = fake();
  const r = await askDrawingAssistant(villa, 'كم مساحة المطبخ؟', opts(f));
  assert.equal(f.calls.length, 0); assert.equal(r.source, 'local'); assert.equal(r.intent, 'query'); assert.match(r.answer, /12\.68/);
  assert.deepEqual(r.proposals, []); assert.deepEqual(r.limitations, []); assert.equal(r.needsConfirm, false);
});

test('a resolved local edit becomes a proposal with a preview and is never applied', async () => {
  const f = fake(), before = JSON.stringify(villa);
  const r = await askDrawingAssistant(villa, 'أضف نافذة في الجدار الشمالي للمطبخ', opts(f));
  assert.equal(f.calls.length, 0); assert.equal(r.source, 'local'); assert.equal(r.proposals.length, 1);
  const p = r.proposals[0];
  assert.equal(p.commands[0].type, 'add-opening'); assert.match(p.label, ar); assert.match(p.preview.summary, /إضافة فتحة/);
  assert.equal(JSON.stringify(villa), before, 'the document is untouched');
  assert.doesNotThrow(() => applyCommand(villa, p.commands[0]));
});

test('proposal preview lists the rooms whose area changes (before / after)', async () => {
  const r = await askDrawingAssistant(villa, 'وسّع المجلس 50 سم من الجهة الشرقية', opts(fake()));
  const p = r.proposals[0];
  assert.ok(p.preview.beforeAreas.r1 < p.preview.afterAreas.r1);
  assert.ok(p.preview.beforeAreas.r2 > p.preview.afterAreas.r2, 'the entrance hall shrinks');
  assert.match(p.preview.summary, /تتغير المساحات/); assert.equal(r.needsConfirm, true);
  const direct = previewCommands(villa, p.commands);
  assert.equal(direct.doc.walls.length, villa.walls.length);
});

test('an ambiguous or unknown request goes to the service with a compact digest, issues, and the access code', async () => {
  const f = fake({ answer: 'أي جدار تقصد؟ الملخص لا يكفي.' });
  const r = await askDrawingAssistant(villa, 'وش رايك في توزيع الغرف؟', opts(f, { selection: ['r1'] }));
  assert.equal(f.calls.length, 1);
  const c = f.calls[0];
  assert.equal(c.url, DRAWING_ENDPOINT); assert.equal(c.init.method, 'POST'); assert.equal(c.init.credentials, 'omit');
  assert.equal(c.init.headers['X-Mizan-Access-Code'], 'code-1'); assert.equal(c.init.headers['Content-Type'], 'application/json');
  assert.equal(c.body.question, 'وش رايك في توزيع الغرف؟'); assert.equal(c.body.digest.compact, true); assert.equal(c.body.digest.schema, 'mizan-digest/1');
  assert.ok(c.body.reviewIssues.length > 0 && c.body.reviewIssues.length <= 20);
  assert.ok(JSON.stringify(c.body).length < 12000);
  assert.equal(r.source, 'claude'); assert.equal(r.model, 'claude-sonnet-5-5'); assert.match(r.answer, /الملخص/); assert.deepEqual(r.suggestions, ['اقتراح']); assert.deepEqual(r.limitations, ['ملخص فقط']);
  assert.deepEqual(r.proposals, []);
  const amb = await askDrawingAssistant(villa, 'وسّع المجلس', opts(f));
  assert.equal(f.calls.length, 2, 'ambiguity is resolved by the service when the code is available');
  assert.equal(amb.source, 'claude');
});

test('forceRemote sends even a locally resolvable question', async () => {
  const f = fake({ answer: 'نعم.' });
  const r = await askDrawingAssistant(villa, 'كم مساحة المطبخ؟', opts(f, { forceRemote: true, endpoint: 'https://example.test/x' }));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, 'https://example.test/x'); assert.equal(r.source, 'claude');
});

test('remote commands are dry-run: failing ones are dropped with an Arabic reason, the rest become one proposal', async () => {
  const good = { type: 'add-opening', wall: 'w3', kind: 'window', at: 1.2 };
  const missingWall = { type: 'add-opening', wall: 'w999', kind: 'window', at: 1 };
  const tooWide = { type: 'add-opening', wall: 'w6', kind: 'window', w: 7, at: 2 };      // 7 m window on a 5 m wall
  const badLabel = { type: 'add-label', level: 'L9', roomType: 'office', seed: { x: 1, y: 1 } };
  const f = fake({ commands: [good, missingWall, tooWide, badLabel] });
  const before = JSON.stringify(villa);
  const r = await askDrawingAssistant(villa, 'اقترح تحسينًا للإضاءة', opts(f));
  assert.equal(JSON.stringify(villa), before);
  assert.equal(r.proposals.length, 1); assert.deepEqual(r.proposals[0].commands.map(c => c.wall || c.type), ['w3']);
  const dropped = r.limitations.filter(l => /لم يُقبل/.test(l));
  assert.equal(dropped.length, 3, r.limitations.join(' | '));
  for (const l of dropped) assert.match(l, ar);
  assert.ok(dropped.some(l => /الجدار غير موجود/.test(l)) && dropped.some(l => /الدور غير موجود/.test(l)) && dropped.some(l => /أقصر من أن يتسع/.test(l)));
  assert.equal(r.needsConfirm, true); assert.equal(r.intent, 'edit');
});

test('every remote command can depend on the ones before it (running copy)', async () => {
  const f = fake({ commands: [{ type: 'add-level', name: 'الدور الأول', copyFrom: 'L1' }, { type: 'add-label', level: 'L2', name: 'مجلس', roomType: 'majlis', seed: { x: 3, y: 2.5 } }] });
  const r = await askDrawingAssistant(villa, 'ما رأيك في دور ثانٍ؟', opts(f));
  assert.equal(r.proposals[0].commands.length, 2); assert.match(r.proposals[0].preview.summary, /إضافة دور/);
});

test('a reply that breaks the contract (unsafe command, bad patch, wrong source, empty answer) is ignored: local fallback, no proposal', async () => {
  for (const reply of [{ commands: [{ type: 'delete', ids: ['w1'] }] }, { source: 'other' }, { answer: '' }, { commands: [{ type: 'update', id: 'w1', patch: { a: { x: 1, y: 1 } } }] }]) {
    const f = fake(reply);
    const r = await askDrawingAssistant(villa, 'وش رايك في توزيع الغرف؟', opts(f));
    assert.equal(r.source, 'local'); assert.equal(r.offline, true); assert.deepEqual(r.proposals, []);
    assert.ok(r.limitations.some(l => /لم يطابق|تجاهلته/.test(l)), r.limitations.join('|'));
  }
});

test('offline fallbacks: no access code, HTTP error, bad JSON, network error - all answer in Arabic from the local digest', async () => {
  const q = 'وش رايك في توزيع الغرف؟';
  const none = fake();
  const a = await askDrawingAssistant(villa, q, { fetcher: none.fetcher });
  assert.equal(none.calls.length, 0); assert.equal(a.source, 'local'); assert.equal(a.offline, true); assert.match(a.answer, /مجلس|غرفة/); assert.ok(a.limitations.some(l => /رمز/.test(l)));
  const http = fake({ error: 'رمز دخول الذكاء غير صحيح.' }, { status: 401 });
  const b = await askDrawingAssistant(villa, q, opts(http));
  assert.equal(b.source, 'local'); assert.ok(b.limitations.some(l => l.includes('رمز دخول الذكاء غير صحيح')));
  const html = fake({}, { contentType: 'text/html' });
  assert.equal((await askDrawingAssistant(villa, q, opts(html))).source, 'local');
  const down = fake({}, { throws: new TypeError('fetch failed') });
  const c = await askDrawingAssistant(villa, q, opts(down));
  assert.equal(c.source, 'local'); assert.ok(c.limitations.some(l => /تعذّر الاتصال/.test(l)));
  for (const r of [a, b, c]) { assert.match(r.answer, ar); assert.deepEqual(r.proposals, []); }
});

test('offline with an ambiguous request still returns the clarification question from the local interpreter', async () => {
  const r = await askDrawingAssistant(villa, 'وسّع المجلس', { fetcher: fake().fetcher });
  assert.equal(r.source, 'local'); assert.equal(r.offline, true); assert.ok(r.ambiguities.length > 0); assert.match(r.answer, /أي جهة/); assert.deepEqual(r.proposals, []);
});

test('an aborted request is rethrown, not hidden by the fallback', async () => {
  const f = fake({}, { throws: Object.assign(new Error('aborted'), { name: 'AbortError' }) });
  await assert.rejects(() => askDrawingAssistant(villa, 'وش رايك في توزيع الغرف؟', opts(f)), { name: 'AbortError' });
});

test('empty and over-long questions are answered locally without a request', async () => {
  const f = fake();
  assert.match((await askDrawingAssistant(villa, '   ', opts(f))).answer, /اكتب/);
  assert.match((await askDrawingAssistant(villa, 'ا'.repeat(801), opts(f))).answer, /800/);
  assert.equal(f.calls.length, 0);
});

test('the client module is browser-safe (relative imports only)', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['assistant-client', 'assistant-local', 'assistant-schema', 'digest', 'review']) {
    const src = readFileSync(new URL(`../dist/draw/${file}.mjs`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/^import .* from '([^']+)'/gm)) assert.ok(m[1].startsWith('./'), `${file}: ${m[1]}`);
  }
});
