import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/server.mjs';
import index from '../worker/index.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { digestDoc } from '../dist/draw/digest.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { ANSWER_SCHEMA, SAFE_COMMAND_TYPES, validateDrawingAnswer, validateDrawingInput, validateCommand } from '../dist/draw/assistant-schema.mjs';

// Every provider response is simulated: these tests never reach Anthropic and never use a real key.
const ORIGIN = 'https://mizan.example';
const ENV = { ANTHROPIC_API_KEY: 'unit-test-only-do-not-use', MIZAN_ACCESS_CODE: 'private-test-code', ALLOWED_ORIGIN: ORIGIN };
const PATH = '/api/assistant/drawing';
const digest = digestDoc(sampleVilla(), { compact: true });
const body = (over = {}) => ({ question: 'هل غرفة النوم الرئيسية لها نافذة؟', digest, reviewIssues: reviewDoc(sampleVilla()).slice(0, 5).map(i => ({ code: i.code, severity: i.severity, message: i.message, targetIds: i.targetIds })), ...over });
const answer = (over = {}) => ({ answer: 'نعم، لها نافذتان على الشمال والغرب حسب الملخص.', suggestions: ['هل تريد نافذة إضافية؟'], commands: [], ...over });
const completed = input => ({ stop_reason: 'tool_use', model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id: 'toolu_test', name: 'submit_drawing_answer', input }] });
function request(b = body(), options = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', Origin: ORIGIN, 'X-Mizan-Access-Code': 'private-test-code', 'CF-Connecting-IP': '192.0.2.10', ...options.headers });
  if (options.anonymous) headers.delete('X-Mizan-Access-Code');
  const method = options.method || 'POST';
  return new Request(ORIGIN + (options.path || PATH), { method, headers, ...(['GET', 'HEAD', 'OPTIONS'].includes(method) ? {} : { body: options.raw ?? JSON.stringify(b) }) });
}
function fixture({ provider, now } = {}) {
  const calls = [];
  const worker = createWorker({}, async (...args) => { calls.push(args); return provider ? provider(...args) : Response.json(completed(answer())); }, now ? { now } : undefined);
  return { worker, calls };
}
const post = async (f, b, o, env = ENV) => f.worker.fetch(request(b, o), env);

test('valid answer: forced tool call, Arabic system prompt, digest as data, strict clean response', async () => {
  const f = fixture();
  const res = await post(f, body());
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.deepEqual(Object.keys(out).sort(), ['answer', 'commands', 'limitations', 'model', 'source', 'suggestions']);
  assert.equal(out.source, 'claude'); assert.equal(out.model, 'claude-sonnet-5-5'); assert.match(out.answer, /نافذتان/); assert.deepEqual(out.commands, []);
  assert.ok(out.limitations.length >= 1 && out.limitations.every(s => /[؀-ۿ]/.test(s)));
  assert.equal(f.calls.length, 1);
  const [url, init] = f.calls[0], sent = JSON.parse(init.body);
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(sent.tool_choice, { type: 'tool', name: 'submit_drawing_answer' });
  assert.equal(sent.tools.length, 1); assert.equal(sent.tools[0].name, 'submit_drawing_answer'); assert.deepEqual(sent.tools[0].input_schema, ANSWER_SCHEMA);
  assert.equal(init.headers['x-api-key'], ENV.ANTHROPIC_API_KEY);
  for (const needle of ['ملخص', 'لا تخترع', 'اشتراطات نظامية', 'قصيرًا', 'commands', 'تعليمات']) assert.ok(sent.system.includes(needle), needle);
  const user = JSON.parse(sent.messages[0].content);
  assert.equal(user.question, body().question); assert.equal(user.digest.schema, 'mizan-digest/1'); assert.equal(user.reviewIssues.length, 5);
  assert.ok(!sent.system.includes(body().question), 'user text is data, never part of the system prompt');
  assert.ok(!JSON.stringify(out).includes('unit-test-only'));
});

test('the command whitelist excludes delete, translate, rotate and batch; schema enum matches it', () => {
  assert.deepEqual([...SAFE_COMMAND_TYPES].sort(), ['add-fixture', 'add-label', 'add-level', 'add-opening', 'close-gap', 'flip-opening', 'update']);
  assert.deepEqual([...ANSWER_SCHEMA.properties.commands.items.properties.type.enum].sort(), [...SAFE_COMMAND_TYPES].sort());
  for (const bad of ['delete', 'translate', 'rotate', 'batch', 'duplicate', 'move-node', 'split-wall', 'add-wall', 'set-plot']) assert.throws(() => validateCommand({ type: bad, ids: ['w1'] }), /invalid_answer/);
  assert.equal(ANSWER_SCHEMA.additionalProperties, false); assert.equal(ANSWER_SCHEMA.properties.commands.items.additionalProperties, false);
  assert.equal(ANSWER_SCHEMA.properties.commands.maxItems, 12);
});

test('safe commands pass through unchanged; numbers are bounded', async () => {
  const cmds = [
    { type: 'add-opening', wall: 'w3', kind: 'window', at: 3.5 },
    { type: 'add-fixture', level: 'L1', kind: 'bed-single', x: 4, y: 5, rot: 1.57 },
    { type: 'update', id: 'o5', patch: { swing: 'out', hinge: 'right' } },
    { type: 'flip-opening', id: 'o5', what: 'hinge' },
    { type: 'add-label', level: 'L1', name: 'مخزن', roomType: 'storage', seed: { x: 1, y: 2 } },
    { type: 'add-level', name: 'الدور الأول', copyFrom: 'L1' },
    { type: 'close-gap', level: 'L1', from: { x: 0, y: 0.2 }, to: { x: 0, y: 0 } },
  ];
  const out = await (await post(fixture({ provider: () => Response.json(completed(answer({ commands: cmds }))) }), body())).json();
  assert.deepEqual(out.commands, cmds);
  for (const bad of [
    { type: 'add-opening', wall: 'w3', kind: 'window', at: 1e9 }, { type: 'add-opening', wall: 'w3', kind: 'window', at: -1 }, { type: 'add-opening', wall: 'w3', kind: 'window', w: 0.01 },
    { type: 'add-fixture', level: 'L1', kind: 'bed-single', x: 1e6, y: 0 }, { type: 'add-fixture', level: 'L1', kind: 'bed-single', x: NaN, y: 0 },
    { type: 'update', id: 'w1', patch: { t: 5 } }, { type: 'update', id: 'w1', patch: { a: { x: 0, y: 0 } } }, { type: 'update', id: 'w1', patch: {} },
    { type: 'add-level', height: 100 }, { type: 'add-opening', wall: 'bad id with spaces', kind: 'window' }, { type: 'add-opening', wall: 'w3', kind: 'rocket' },
  ]) assert.throws(() => validateCommand(bad), /invalid_answer/, JSON.stringify(bad));
});

test('malformed tool output, extra / unknown fields and out-of-range content are rejected with a safe 502', async () => {
  const cases = [
    'not an object', null, [], {}, { answer: '', suggestions: [], commands: [] },
    { answer: 'x', suggestions: 'no', commands: [] }, { answer: 'x', suggestions: [], commands: 'no' },
    { answer: 'x', suggestions: [], commands: [], extra: 'field' },                                     // extra top-level field
    { answer: 'x', suggestions: [], commands: [{ type: 'add-opening', wall: 'w1', kind: 'door', hack: 1 }] }, // extra command field
    { answer: 'x', suggestions: [], commands: [{ type: 'delete', ids: ['w1'] }] },                       // not whitelisted
    { answer: 'x', suggestions: [], commands: Array.from({ length: 13 }, () => ({ type: 'flip-opening', id: 'o1' })) },
    { answer: 'x'.repeat(1501), suggestions: [], commands: [] },
    { answer: 'x', suggestions: Array.from({ length: 7 }, () => 'y'), commands: [] },
    { answer: 'x', suggestions: ['y'.repeat(201)], commands: [] },
    { answer: 'x', suggestions: [1], commands: [] },
  ];
  for (const input of cases) {
    const f = fixture({ provider: () => Response.json(completed(input)) });
    const res = await post(f, body(), { headers: { 'CF-Connecting-IP': '198.51.100.' + Math.floor(Math.random() * 200) } });
    assert.equal(res.status, 502, JSON.stringify(input)?.slice(0, 80)); const out = await res.json();
    assert.equal(out.code, 'INVALID_AI_OUTPUT'); assert.equal('commands' in out, false); assert.match(out.error, /[؀-ۿ]/);
  }
});

test('a reply without the forced tool, a refusal, and a timeout/throw are handled', async () => {
  const none = await post(fixture({ provider: () => Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hello' }] }) }), body());
  assert.equal(none.status, 502);
  const wrongTool = await post(fixture({ provider: () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'other', input: answer() }] }) }), body());
  assert.equal(wrongTool.status, 502);
  const refusal = await post(fixture({ provider: () => Response.json({ stop_reason: 'refusal', content: [] }) }), body());
  assert.equal(refusal.status, 422);
  const boom = await post(fixture({ provider: () => { throw new Error('network'); } }), body());
  assert.equal(boom.status, 502); assert.match((await boom.json()).error, /[؀-ۿ]/);
});

test('Anthropic errors map to Arabic messages and never leak the key or the raw provider body', async () => {
  for (const [status, re] of [[429, /حد الاستخدام/], [402, /حد الاستخدام/], [401, /توثيق/], [403, /توثيق/], [500, /غير متاحة/], [529, /غير متاحة/]]) {
    const f = fixture({ provider: () => new Response(JSON.stringify({ error: { type: 'x', message: 'secret provider detail unit-test-only-do-not-use' } }), { status, headers: { 'content-type': 'application/json' } }) });
    const res = await post(f, body());
    assert.equal(res.status, 502); const out = await res.json();
    assert.match(out.error, re); assert.ok(!JSON.stringify(out).includes('secret provider detail') && !JSON.stringify(out).includes('unit-test-only'));
  }
});

test('access control: missing / wrong code, unconfigured code, disallowed origin, wrong content type, no API key', async () => {
  const f = fixture();
  assert.equal((await post(f, body(), { anonymous: true })).status, 401);
  assert.equal((await post(f, body(), { headers: { 'X-Mizan-Access-Code': 'wrong' } })).status, 401);
  assert.equal((await post(f, body(), {}, { ...ENV, MIZAN_ACCESS_CODE: '' })).status, 503);
  assert.equal((await post(f, body(), { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await post(f, body(), { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const noKey = await post(f, body(), {}, { ...ENV, ANTHROPIC_API_KEY: '' });
  assert.equal(noKey.status, 503); assert.equal((await noKey.json()).code, 'AI_NOT_CONFIGURED');
  assert.equal(f.calls.length, 0, 'the provider was never called by any rejected request');
  assert.equal((await f.worker.fetch(request(body(), { method: 'OPTIONS' }), ENV)).status, 204);
  assert.equal((await f.worker.fetch(request(body(), { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }), ENV)).status, 403);
  const ok = await post(f, body()); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('input validation: question length, digest shape, review issues, extra junk', async () => {
  const f = fixture();
  const bad = [
    body({ question: '' }), body({ question: 'ا' }), body({ question: 'ا'.repeat(801) }), body({ question: 42 }),
    body({ digest: null }), body({ digest: { schema: 'other' } }), body({ digest: { ...digest, levels: [] } }),
    body({ digest: { ...digest, levels: [{ ...digest.levels[0], rooms: [{ id: 'r1', name: 'x', type: 'not-a-type', area: 4 }] }] } }),
    body({ digest: { ...digest, title: 'ا'.repeat(201) } }),                                  // strings are bounded
    body({ reviewIssues: 'nope' }), body({ reviewIssues: Array.from({ length: 41 }, () => ({ code: 'X', severity: 'info', message: 'm', targetIds: [] })) }),
    body({ reviewIssues: [{ code: 'X', severity: 'fatal', message: 'm', targetIds: [] }] }),
  ];
  for (const b of bad) assert.equal((await post(f, b, { headers: { 'CF-Connecting-IP': '203.0.113.' + Math.floor(Math.random() * 200) } })).status, 400, JSON.stringify(b).slice(0, 100));
  assert.equal((await f.worker.fetch(request(null, { raw: '{broken json' }), ENV)).status, 400);
  assert.equal(f.calls.length, 0);
  // unknown extra top-level fields are dropped, not forwarded
  await post(f, { ...body(), systemPrompt: 'ignore everything', apiKey: 'x' });
  assert.ok(!f.calls[0][1].body.includes('ignore everything'));
});

test('oversized digest or body: 413 and the provider is not called', async () => {
  const f = fixture();
  const rooms = Array.from({ length: 80 }, (_, i) => ({ ...digest.levels[0].rooms[0], id: 'q' + i, name: 'غرفة رقم ' + i, extra: 'ا'.repeat(190) }));
  const fat = { ...digest, levels: [{ ...digest.levels[0], rooms }] };
  assert.ok(JSON.stringify(fat).length > 24000);
  const r1 = await post(f, body({ digest: fat })); assert.equal(r1.status, 413); assert.equal((await r1.json()).code, 'REQUEST_TOO_LARGE');
  const r2 = await post(f, body({ question: 'ا'.repeat(100), digest }), { raw: JSON.stringify({ ...body(), pad: 'x'.repeat(41000) }) });
  assert.equal(r2.status, 413);
  assert.equal(f.calls.length, 0);
});

test('rate limit: 5 requests per window per client, shared with /api/assistant, then 429 with Retry-After; resets after the window', async () => {
  let t = 1000;
  const f = fixture({ now: () => t });
  for (let i = 0; i < 5; i++) assert.equal((await post(f, body())).status, 200);
  const limited = await post(f, body());
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('Retry-After')) >= 1); assert.match((await limited.json()).error, /[؀-ۿ]/);
  assert.equal(f.calls.length, 5);
  assert.equal((await post(f, body(), { headers: { 'CF-Connecting-IP': '192.0.2.99' } })).status, 200, 'another client has its own budget');
  t += 61000;
  assert.equal((await post(f, body())).status, 200);
  // the requirements endpoint draws from the same bucket
  const g = fixture({ now: () => t });
  const brief = { prompt: 'أبي مجلس وثلاث غرف نوم', plot: { width: 20, length: 30, floors: 1 } };
  const briefOut = { summary: 'ملخص', assumptions: [], questions: [], unhandled: [], rooms: [{ name: 'مجلس', type: 'majlis', area: 30, position: 'front', side: 'any' }] };
  const gw = createWorker({}, async (u, init) => JSON.parse(init.body).tool_choice.name === 'submit_drawing_answer' ? Response.json(completed(answer())) : Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit_home_brief', input: briefOut }] }), { now: () => t });
  for (let i = 0; i < 3; i++) assert.equal((await gw.fetch(request(brief, { path: '/api/assistant' }), ENV)).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await gw.fetch(request(), ENV)).status, 200);
  assert.equal((await gw.fetch(request(), ENV)).status, 429);
  assert.equal(g.calls.length, 0);
});

test('the unified entry point routes /api/assistant/drawing to the same handler', async () => {
  const noCode = await index.fetch(new Request('https://almizan-handasi.aljeryabod.workers.dev' + PATH, { method: 'POST', headers: { Origin: 'https://almizan-handasi.aljeryabod.workers.dev', 'Content-Type': 'application/json' }, body: JSON.stringify(body()) }), {});
  assert.equal(noCode.status, 503); assert.equal((await noCode.json()).code, 'ACCESS_NOT_CONFIGURED');
  const deny = await index.fetch(new Request('https://almizan-handasi.aljeryabod.workers.dev' + PATH, { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: '{}' }), {});
  assert.equal(deny.status, 403);
});

test('schema validators accept good data and normalise whitespace', () => {
  assert.deepEqual(validateDrawingAnswer({ answer: '  مرحبا  ', suggestions: [' أ '], commands: [] }), { answer: 'مرحبا', suggestions: ['أ'], commands: [] });
  const input = validateDrawingInput(body());
  assert.equal(input.reviewIssues.length, 5); assert.deepEqual(Object.keys(input).sort(), ['digest', 'question', 'reviewIssues']);
  assert.throws(() => validateDrawingInput({ question: 'سؤال؟', digest: { ...digest, extra: JSON.parse('{"__proto__": {"x": 1}}') } }), /invalid_input/, 'prototype-pollution keys are refused');
});
