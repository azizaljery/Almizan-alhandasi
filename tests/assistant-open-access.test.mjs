// الوصول بلا رمز في نسخة المعاينة: الإنتاج (رمز مهيأ) لا يتغير، والمفتوح مشروط بـOPEN_ASSISTANT=1 ومقيّد بالنطاق والحدّ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantOpen, requestBrief } from '../dist/assistant.mjs';
import * as server from '../worker/server.mjs';

const handler = server.default || server;
const ORIGIN = 'https://almizan-handasi-staging.aljeryabod.workers.dev';
const body = JSON.stringify({ prompt: 'أريد ثلاث غرف نوم ومجلس ومطبخ', plot: { width: 12.5, depth: 25, floors: 1 }, previous: { summary: 'x', rooms: [] } });
const post = (env, headers = {}) => handler.fetch(new Request(ORIGIN + '/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, body }), env);

test('بلا رمز مهيأ وبلا OPEN_ASSISTANT: يُرفض (503) كما كان', async () => {
  const r = await post({ ALLOWED_ORIGIN: ORIGIN, ANTHROPIC_API_KEY: 'k' });
  assert.equal(r.status, 503);
});
test('رمز مهيأ: يبقى إلزاميًا حتى لو OPEN_ASSISTANT=1، والرمز الخاطئ 401', async () => {
  const env = { ALLOWED_ORIGIN: ORIGIN, ANTHROPIC_API_KEY: 'k', MIZAN_ACCESS_CODE: 'abcd1234', OPEN_ASSISTANT: '1' };
  assert.equal((await post(env)).status, 401);
  assert.equal((await post(env, { 'X-Mizan-Access-Code': 'wrong' })).status, 401);
});
test('OPEN_ASSISTANT=1 بلا رمز: يتجاوز البوابة (لا 401 ولا 503 للحماية)', async () => {
  const r = await post({ ALLOWED_ORIGIN: ORIGIN, OPEN_ASSISTANT: '1' });
  const j = await r.json();
  assert.notEqual(r.status, 401); assert.notEqual(r.status, 403); assert.notEqual(j.code, 'ACCESS_NOT_CONFIGURED');
});
test('النطاق غير المسموح يُرفض حتى في الوضع المفتوح', async () => {
  const r = await handler.fetch(new Request(ORIGIN + '/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body }), { ALLOWED_ORIGIN: ORIGIN, OPEN_ASSISTANT: '1', ANTHROPIC_API_KEY: 'k' });
  assert.equal(r.status, 403);
});
test('الحالة تعلن openAccess فقط عند عدم وجود رمز وتفعيل العلم ووجود المفتاح', async () => {
  const st = async env => (await handler.fetch(new Request(ORIGIN + '/api/assistant/status', { headers: { Origin: ORIGIN } }), env)).json();
  assert.equal((await st({ ALLOWED_ORIGIN: ORIGIN, OPEN_ASSISTANT: '1', ANTHROPIC_API_KEY: 'k' })).openAccess, true);
  assert.equal((await st({ ALLOWED_ORIGIN: ORIGIN, MIZAN_ACCESS_CODE: 'abcd1234', OPEN_ASSISTANT: '1', ANTHROPIC_API_KEY: 'k' })).openAccess, false);
  assert.equal((await st({ ALLOWED_ORIGIN: ORIGIN, ANTHROPIC_API_KEY: 'k' })).openAccess, false);
});
test('العميل: بلا رمز وبلا openAccess يطلب الرمز دون أي اتصال؛ ومع openAccess يرسل بلا ترويسة رمز', async () => {
  let calls = 0;
  await assert.rejects(requestBrief({ prompt: 'x' }, { fetcher: async () => { calls++; } }), /رمز دخول/); assert.equal(calls, 0);
  let seen = null;
  await assert.rejects(requestBrief({ prompt: 'x' }, { openAccess: true, fetcher: async (u, o) => { seen = o.headers; return Response.json(null); } }), /مصدر الاقتراح/);
  assert.equal('X-Mizan-Access-Code' in seen, false);
});
test('assistantOpen: أي فشل في الحالة = مغلق', async () => {
  assert.equal(await assistantOpen({ fetcher: async () => { throw new Error('x'); } }), false);
});

test('حمولة الصفحة الرئيسية والتصميم تجتاز تحقق الخادم (كانت ترجع 400 فيسقط الذكاء إلى الفهم المحلي)', async () => {
  const { readFileSync } = await import('node:fs');
  const { normalizeLand } = await import('../dist/home-flow.mjs');
  const { validateInput } = await import('../worker/server.mjs');
  const { plot } = normalizeLand({ length: 25, width: 12.5, streets: ['n'], entries: ['n'] });
  for (const f of ['home.mjs', 'design.mjs']) {
    const src = readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
    assert.equal(/previous: \{ summary: '[^']*', rooms: \[\] \}/.test(src), false, f + ' يرسل previous غير صالح');
  }
  assert.doesNotThrow(() => validateInput({ prompt: 'بيت دور واحد ثلاث غرف نوم ومجلس ومطبخ', plot, previous: null }));
});
