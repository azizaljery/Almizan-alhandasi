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

test('visual prompt includes the generated room geometry', () => {
  const prompt = buildDallePrompt({
    plot: { width: 20, length: 30 },
    building: { w: 16, h: 24 },
    rooms: [
      { name: 'مجلس الرجال', x: 1, y: 2, w: 6, h: 5 },
      { name: 'المطبخ', x: 7, y: 2, w: 4, h: 3.5 },
    ],
  });
  assert.match(prompt, /AUTHORITATIVE PLAN GEOMETRY/);
  assert.match(prompt, /مجلس الرجال\[x=1\.0,y=2\.0,w=6\.0,h=5\.0\]/);
  assert.match(prompt, /المطبخ\[x=7\.0,y=2\.0,w=4\.0,h=3\.5\]/);
  assert.match(prompt, /Do not add, remove, merge, rotate, mirror, or relocate rooms/);
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

test('image worker sends a plan reference through the image edit endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = '';
  let calledBody = null;
  globalThis.fetch = async (url, options) => {
    calledUrl = String(url);
    calledBody = JSON.parse(options.body);
    return Response.json({ data: [{ b64_json: 'cGxhbg==' }] });
  };
  try {
    const request = new Request('https://images.example/', {
      method: 'POST',
      headers: {
        Origin: 'https://al-mizan-al-handasi.aljeryabod.chatgpt.site',
        'X-Mizan-Access-Code': 'secret',
        'CF-Connecting-IP': '198.51.100.99',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Render the supplied floor plan as an architectural visualization.',
        size: '1536x1024',
        quality: 'hd',
        reference_image: 'data:image/png;base64,AAAA',
      }),
    });
    const response = await imageWorker.fetch(request, { MIZAN_IMAGE_ACCESS_CODE: 'secret', OPENAI_API_KEY: 'sk-test' });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.match(calledUrl, /\/v1\/images\/edits$/);
    assert.equal(calledBody.model, 'gpt-image-1');
    assert.equal(calledBody.input_fidelity, 'high');
    assert.equal(calledBody.images[0].image_url, 'data:image/png;base64,AAAA');
    assert.equal(data.url, 'data:image/png;base64,cGxhbg==');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('image worker rejects malformed plan references before OpenAI', async () => {
  const request = new Request('https://images.example/', {
    method: 'POST',
    headers: {
      Origin: 'https://al-mizan-al-handasi.aljeryabod.chatgpt.site',
      'X-Mizan-Access-Code': 'secret',
      'CF-Connecting-IP': '198.51.100.100',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: 'Render this plan as an architectural visualization.', reference_image: 'not-an-image' }),
  });
  const response = await imageWorker.fetch(request, { MIZAN_IMAGE_ACCESS_CODE: 'secret', OPENAI_API_KEY: 'sk-test' });
  assert.equal(response.status, 400);
});
