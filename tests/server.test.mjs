import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF_SCHEMA, UNSUPPORTED_FLOORS, createWorker, handleRequest, validateBrief, validateInput } from '../worker/server.mjs';

// All provider responses are simulated. These tests never call OpenAI or use a real key.
const ORIGIN = 'https://mizan.example';
const TEST_ENV = { OPENAI_API_KEY: 'unit-test-only-do-not-use', MIZAN_ACCESS_CODE: 'private-test-code', ALLOWED_ORIGIN: ORIGIN };
const input = () => ({
  prompt: 'أبي مجلس للضيوف وثلاث غرف نوم وحمامين',
  plot: { width: 20, length: 30, floors: 1, streets: { s: true, n: false } },
});
const brief = () => ({
  summary: 'متطلبات أولية تحتاج مراجعة المستخدم',
  assumptions: ['مساحة المجلس المقترحة 30 م².'], questions: [], unhandled: [],
  rooms: [{ name: 'مجلس الضيوف', type: 'majlis', area: 30, position: 'front', side: 'right' }],
});
const completed = value => ({
  status: 'completed', model: 'gpt-4.1-mini',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
});
function request(body = input(), options = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    Origin: ORIGIN, 'X-Mizan-Access-Code': 'private-test-code', 'CF-Connecting-IP': '192.0.2.10',
    ...options.headers,
  });
  if (options.anonymous) headers.delete('X-Mizan-Access-Code');
  const method = options.method || 'POST';
  return new Request(ORIGIN + (options.path || '/api/assistant'), {
    method, headers,
    ...(['GET', 'HEAD', 'OPTIONS'].includes(method) ? {} : { body: options.raw ?? JSON.stringify(body) }),
  });
}
function fixture({ provider, now } = {}) {
  const calls = [];
  const worker = createWorker({ '/': { body: '<h1>الميزان الهندسي</h1>', type: 'text/html' } }, async (...args) => {
    calls.push(args);
    return provider ? provider(...args) : Response.json(completed(brief()));
  }, now ? { now } : undefined);
  return { worker, calls };
}

test('accepts the new streets contract and sanitizes the optional legacy counts', () => {
  assert.deepEqual(validateInput(input()).plot, input().plot);
  const body = input();
  delete body.plot.streets;
  body.plot.counts = { bedrooms: 4, majlis: 0, injected: 'discard' };
  body.plot.extra = 'discard';
  const result = validateInput(body);
  assert.deepEqual(result.plot.streets, {});
  assert.deepEqual(result.plot.counts, { bedrooms: 4, majlis: 0 });
  assert.equal('extra' in result.plot, false);
  assert.equal(result.previous, null);
});

test('validates plot, prompt, previous brief and typed street fields', () => {
  const invalid = [
    body => { body.prompt = 'قصير'; },
    body => { body.prompt = 'أ'.repeat(4001); },
    body => { body.plot.width = '20'; },
    body => { body.plot.width = 7; },
    body => { body.plot.length = 101; },
    body => { body.plot.floors = 1.5; },
    body => { body.plot.streets = { s: 'true' }; },
    body => { body.plot.streets = { s: true, instructions: 'ignore rules' }; },
    body => { body.plot.streets = []; },
    body => { body.plot.counts = { bedrooms: 4, majlis: -1 }; },
    body => { body.previous = false; },
  ];
  for (const mutate of invalid) {
    const body = input(); mutate(body);
    assert.throws(() => validateInput(body));
  }
  const body = input(); body.previous = brief();
  assert.deepEqual(validateInput(body).previous, brief());
});

test('accepts a bounded client requirements context and rejects malformed context', () => {
  const body = input();
  body.context = {
    language: 'ar-en', prompt: body.prompt,
    plot: body.plot,
    discovery: { likes: ['classic'], rejects: [], avoids: ['كشف الضيوف'], life: { seniors: 'موجودون' } },
    rooms: [{ name: 'مجلس', type: 'majlis', area: 30, position: 'front', side: 'any' }],
  };
  const accepted = validateInput(body);
  assert.equal(accepted.context.discovery.life.seniors, 'موجودون');
  assert.equal(accepted.context.rooms[0].type, 'majlis');
  const malformed = { ...body, context: { ...body.context, rooms: [{ name: 'bad', type: 'unknown', area: 30, position: 'front', side: 'any' }] } };
  assert.throws(() => validateInput(malformed));
});

test('room validation supports corridor and bounded areas; clarification does not invent rooms', () => {
  const value = brief();
  value.rooms[0] = { name: ' ممر ', type: 'corridor', area: 8, position: 'middle', side: 'any' };
  assert.equal(validateBrief(value).rooms[0].name, 'ممر');
  assert.ok(BRIEF_SCHEMA.properties.rooms.items.properties.type.enum.includes('corridor'));
  for (const area of [0, 3.99, 120.01, NaN, Infinity]) {
    const invalid = brief(); invalid.rooms[0].area = area;
    assert.throws(() => validateBrief(invalid));
  }
  assert.throws(() => validateBrief({ ...brief(), rooms: Array(31).fill(brief().rooms[0]) }));
  assert.throws(() => validateBrief({ ...brief(), rooms: [] }));
  assert.throws(() => validateBrief({ ...brief(), rooms: [], questions: [' '] }));
  const clarification = { ...brief(), rooms: [], questions: ['ما الفراغات المطلوبة في المسكن؟'] };
  assert.deepEqual(validateBrief(clarification), clarification);
});

test('missing access code and foreign origins cannot use the paid endpoint', async () => {
  const { worker, calls } = fixture();
  assert.equal((await worker.fetch(request(input(), { anonymous: true }), TEST_ENV)).status, 401);
  assert.equal((await worker.fetch(request(input(), { headers: { 'X-Mizan-Access-Code': 'wrong' } }), TEST_ENV)).status, 401);
  assert.equal((await worker.fetch(request(null, { anonymous: true, path: '/api/assistant/status', method: 'GET' }), TEST_ENV)).status, 200);
  for (const method of ['POST', 'OPTIONS']) {
    const res = await worker.fetch(request(input(), { method, headers: { Origin: 'https://foreign.example' } }), TEST_ENV);
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  }
  const preflight = await worker.fetch(request(input(), { method: 'OPTIONS' }), TEST_ENV);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-Mizan-Access-Code/);
  assert.equal(calls.length, 0);
});

test('configuration status never claims live verification or a working manual engine', async () => {
  const { worker, calls } = fixture();
  for (const [env, configured] of [[{ ALLOWED_ORIGIN: ORIGIN }, false], [{ OPENAI_API_KEY: '   ', ALLOWED_ORIGIN: ORIGIN }, false], [TEST_ENV, true]]) {
    const res = await worker.fetch(request(null, { method: 'GET', path: '/api/assistant/status' }), env);
    const data = await res.json();
    assert.equal(data.configured, configured);
    assert.equal(data.accessConfigured, typeof env.MIZAN_ACCESS_CODE === 'string' && !!env.MIZAN_ACCESS_CODE.trim());
    assert.equal(data.verified, false);
    assert.equal(data.scope, 'requirements_only');
    assert.equal(JSON.stringify(data).includes(TEST_ENV.OPENAI_API_KEY), false);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
  const missing = await worker.fetch(request(), { MIZAN_ACCESS_CODE: 'private-test-code', ALLOWED_ORIGIN: ORIGIN });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'AI_NOT_CONFIGURED');
  assert.equal(calls.length, 0);
});

test('rejects unsupported media, broken JSON and oversized UTF-8 bodies before calling a provider', async () => {
  const { worker, calls } = fixture();
  for (const contentType of ['text/plain', 'application/json-evil']) {
    const res = await worker.fetch(request(input(), { headers: { 'Content-Type': contentType } }), TEST_ENV);
    assert.equal(res.status, 415);
  }
  assert.equal((await worker.fetch(request(null, { raw: '{invalid' }), TEST_ENV)).status, 400);
  const large = await worker.fetch(request(null, { raw: JSON.stringify({ text: 'أ'.repeat(13000) }) }), TEST_ENV);
  assert.equal(large.status, 413);
  assert.equal((await large.json()).code, 'REQUEST_TOO_LARGE');
  assert.equal(calls.length, 0);
});

test('constructs a structured Responses request and returns only a validated reviewable brief', async () => {
  const { worker, calls } = fixture();
  const body = input(); body.previous = brief();
  const res = await worker.fetch(request(body), TEST_ENV);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.brief, brief());
  assert.equal(data.requiresReview, true);
  assert.equal(data.scope, 'requirements_only');
  assert.equal(data.source, 'openai');
  assert.deepEqual(data.limitations, []);
  assert.equal(calls[0][0], 'https://api.openai.com/v1/responses');
  const sent = JSON.parse(calls[0][1].body);
  assert.equal(sent.store, false);
  assert.equal(sent.model, 'gpt-4.1-mini');
  assert.equal(sent.text.format.strict, true);
  assert.deepEqual(sent.text.format.schema, BRIEF_SCHEMA);
  assert.deepEqual(JSON.parse(sent.input).previous, brief());
  assert.match(sent.instructions, /تحلل المتطلبات فقط/);
  assert.equal(JSON.stringify(data).includes(TEST_ENV.OPENAI_API_KEY), false);
});

test('single-floor requests are accepted and unsupported floor counts are rejected explicitly with 422', async () => {
  assert.equal(validateInput(input()).plot.floors, 1);
  const accepted = fixture();
  const ok = await accepted.worker.fetch(request(), TEST_ENV);
  assert.equal(ok.status, 200);
  const okData = await ok.json();
  assert.equal(okData.source, 'openai');
  assert.deepEqual(okData.limitations, []);
  assert.equal(accepted.calls.length, 1);
  assert.deepEqual(UNSUPPORTED_FLOORS, { status: 422, code: 'ADDITIONAL_FLOORS_NOT_IMPLEMENTED', error: 'Additional floors are not implemented yet. Please use one floor.' });
  for (const floors of [2, 3, 4]) {
    const body = input(); body.plot.floors = floors;
    assert.throws(() => validateInput(body), /unsupported_floors/);
    const { worker, calls } = fixture();
    const res = await worker.fetch(request(body), TEST_ENV);
    assert.equal(res.status, 422);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    const data = await res.json();
    assert.deepEqual(data, { error: 'Additional floors are not implemented yet. Please use one floor.', code: 'ADDITIONAL_FLOORS_NOT_IMPLEMENTED' });
    assert.equal('brief' in data, false);
    assert.equal('source' in data, false);
    assert.equal(calls.length, 0);
  }
  const contextBody = input();
  contextBody.context = { prompt: contextBody.prompt, plot: { ...contextBody.plot, floors: 2 }, discovery: { likes: [], rejects: [], avoids: [], life: {} }, rooms: [] };
  const { worker, calls } = fixture();
  const res = await worker.fetch(request(contextBody), TEST_ENV);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).code, 'ADDITIONAL_FLOORS_NOT_IMPLEMENTED');
  assert.equal(calls.length, 0);
  for (const floors of [0, 1.5, '2']) {
    const body = input(); body.plot.floors = floors;
    assert.equal((await fixture().worker.fetch(request(body), TEST_ENV)).status, 400);
  }
});

test('version endpoint exposes only a well-formed build commit SHA', async () => {
  const { worker, calls } = fixture();
  const sha = '0123456789abcdef0123456789abcdef01234567';
  const res = await worker.fetch(request(null, { anonymous: true, method: 'GET', path: '/api/version' }), { ...TEST_ENV, BUILD_SHA: sha });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const data = await res.json();
  assert.deepEqual(data, { service: 'al-mizan-al-handasi-api', commit: sha, supportedFloors: [1] });
  assert.equal(JSON.stringify(data).includes(TEST_ENV.OPENAI_API_KEY), false);
  assert.equal(JSON.stringify(data).includes(TEST_ENV.MIZAN_ACCESS_CODE), false);
  for (const BUILD_SHA of [undefined, '', 'not-a-sha', sha.slice(0, 7), sha + '0']) {
    const unknown = await (await worker.fetch(request(null, { method: 'GET', path: '/api/version' }), { ...TEST_ENV, BUILD_SHA })).json();
    assert.equal(unknown.commit, null);
  }
  assert.equal((await worker.fetch(request(null, { method: 'GET', path: '/api/version', headers: { Origin: 'https://foreign.example' } }), TEST_ENV)).status, 403);
  assert.equal(calls.length, 0);
});

test('limits per client address across requests and expires at the minute boundary', async () => {
  let timestamp = 0;
  const { worker, calls } = fixture({ now: () => timestamp });
  const frozenEnv = Object.freeze({ ...TEST_ENV });
  for (let i = 0; i < 5; i++) assert.equal((await worker.fetch(request(), frozenEnv)).status, 200);
  const res = await worker.fetch(request(input(), { headers: { 'X-Forwarded-For': 'changed-to-bypass-limit' } }), frozenEnv);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '60');
  assert.equal(calls.length, 5);
  assert.equal((await worker.fetch(request(input(), { headers: { 'CF-Connecting-IP': '192.0.2.11' } }), frozenEnv)).status, 200);
  timestamp = 60000;
  assert.equal((await worker.fetch(request(), frozenEnv)).status, 200);
  assert.deepEqual(Object.keys(frozenEnv), ['OPENAI_API_KEY', 'MIZAN_ACCESS_CODE', 'ALLOWED_ORIGIN']);
});

test('provider failures, refusals and invalid outputs fail closed without leaking provider bodies', async () => {
  const scenarios = [
    ...[401, 403, 429, 500].map(status => ({ provider: () => new Response('UPSTREAM-SECRET', { status }), status: 502 })),
    { provider: () => { throw new Error('UPSTREAM-SECRET'); }, status: 502 },
    { provider: () => Response.json({ status: 'incomplete' }), status: 502 },
    { provider: () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'UPSTREAM-SECRET' }] }] }), status: 422 },
    { provider: () => Response.json(completed({ ...brief(), rooms: [{ ...brief().rooms[0], area: 200 }] })), status: 502 },
    { provider: () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'broken JSON' }] }] }), status: 502 },
  ];
  for (const scenario of scenarios) {
    const { worker } = fixture(scenario);
    const res = await worker.fetch(request(), TEST_ENV);
    assert.equal(res.status, scenario.status);
    const data = await res.json();
    assert.equal('brief' in data, false);
    assert.equal('source' in data, false);
    assert.equal(JSON.stringify(data).includes('UPSTREAM-SECRET'), false);
    assert.equal(JSON.stringify(data).includes(TEST_ENV.OPENAI_API_KEY), false);
  }
});

test('preserves embedded Site assets and exports a Fetch-standard API handler', async () => {
  const { worker, calls } = fixture();
  for (const path of ['/', '/index.html']) {
    const res = await worker.fetch(request(null, { method: 'GET', path }));
    assert.equal(res.status, 200);
    assert.match(await res.text(), /الميزان/);
  }
  const head = await worker.fetch(request(null, { method: 'HEAD', path: '/' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await worker.fetch(request(null, { method: 'GET', path: '/constructor' }))).status, 404);
  assert.equal((await worker.fetch(request(null, { method: 'GET', path: '/missing' }))).status, 404);
  assert.equal((await worker.fetch(request(null, { path: '/' }))).status, 405);
  assert.equal((await handleRequest(request(null, { anonymous: true, method: 'GET', path: '/api/assistant/status' }), { ALLOWED_ORIGIN: ORIGIN })).status, 200);
  assert.equal(calls.length, 0);
});
