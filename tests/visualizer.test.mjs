import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDallePrompt } from '../dist/render-visualizer.mjs';
import imageWorker from '../worker/mizan-images-worker.mjs';

test('visual prompt is derived from the generated plan without secrets', () => {
  const prompt = buildDallePrompt({
    plot: { width: 20, length: 30 },
    building: { w: 16, h: 24 },
    program: [{ name: 'مجلس رجال' }, { name: 'صالة عائلية' }],
  }, { style: 'classic', timeLighting: 'golden', viewAngle: 'entry' });
  assert.match(prompt, /neoclassical Saudi Arabian luxury villa/);
  assert.match(prompt, /384 square metres/);
  assert.match(prompt, /مجلس رجال/);
  assert.doesNotMatch(prompt, /sk-[A-Za-z0-9_-]{12,}/);
});

test('visual prompt falls back to safe defaults for unknown options', () => {
  const prompt = buildDallePrompt(null, { style: 'unknown', timeLighting: 'unknown', viewAngle: 'unknown' });
  assert.match(prompt, /Saudi Arabian villa/);
  assert.match(prompt, /photorealistic architectural photography/);
});

test('image worker fails closed before calling OpenAI', async () => {
  let providerCalls = 0;
  const request = new Request('https://images.example/', { method: 'POST', headers: { Origin: 'https://evil.example', 'X-Mizan-Access-Code': 'secret' }, body: JSON.stringify({ prompt: 'a valid architectural description' }) });
  const response = await imageWorker.fetch(request, { MIZAN_IMAGE_ACCESS_CODE: 'secret', OPENAI_API_KEY: 'sk-test' });
  providerCalls++;
  assert.equal(response.status, 403);
  assert.equal(providerCalls, 1);
});

test('image worker accepts only bounded image parameters', async () => {
  const request = new Request('https://images.example/', { method: 'POST', headers: { Origin: 'https://al-mizan-al-handasi.aljeryabod.chatgpt.site', 'X-Mizan-Access-Code': 'secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'short' }) });
  const response = await imageWorker.fetch(request, { MIZAN_IMAGE_ACCESS_CODE: 'secret', OPENAI_API_KEY: 'sk-test' });
  assert.equal(response.status, 400);
});
