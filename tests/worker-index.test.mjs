import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

const ORIGIN = 'https://almizan-handasi.aljeryabod.workers.dev';
const env = { ASSETS: { fetch: async req => new Response('asset:' + new URL(req.url).pathname) } };

test('المدخل الموحد: الملفات الثابتة من ASSETS', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/'), env);
  assert.equal(await res.text(), 'asset:/');
  assert.equal(await (await worker.fetch(new Request(ORIGIN + '/app.mjs'), env)).text(), 'asset:/app.mjs');
});
test('المدخل الموحد: /api/assistant يذهب للوكيل ولا يكشف الأسرار', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/api/assistant/status', { headers: { origin: ORIGIN } }), { ...env, ANTHROPIC_API_KEY: 'sk-ant-test', MIZAN_ACCESS_CODE: 'x' });
  const body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.configured, true); assert.equal(body.accessConfigured, true);
  assert.ok(!JSON.stringify(body).includes('sk-ant'));
});
test('المدخل الموحد: أصل الموقع الجديد مسموح وأصل غريب مرفوض', async () => {
  const bad = await worker.fetch(new Request(ORIGIN + '/api/assistant/status', { headers: { origin: 'https://evil.test' } }), env);
  assert.equal(bad.status, 403);
  const ok = await worker.fetch(new Request(ORIGIN + '/api/assistant', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env);
  assert.equal(ok.status, 204);
});
test('المدخل الموحد: /api/archive بلا قاعدة يعيد خطأ JSON آمنًا، وبلا هوية لا يفتح الأرشيف', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/api/archive/session'), env);
  assert.equal(res.status, 503); assert.equal((await res.json()).error, 'archive_unavailable');
  const spoof = await worker.fetch(new Request(ORIGIN + '/api/archive/designs', { headers: { 'oai-authenticated-user-id': 'victim' } }), { ...env, DB: {} });
  assert.equal(spoof.status, 401);
});
test('المدخل الموحد: مسار api مجهول يعيد 404 JSON', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/api/nope'), env);
  assert.equal(res.status, 404);
});
