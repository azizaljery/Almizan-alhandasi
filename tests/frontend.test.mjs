import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { buildPlanSVG, PlanViewport } from '../dist/plan-view.mjs';
import { AI_ENABLED, WORKER_URL, validateSuggestion, requestBrief } from '../dist/assistant.mjs';

const m = generateModel({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }, defaultRooms());
test('generated SVG is valid XML with complete viewBox and escaped user-controlled room names', () => {
  const copy = structuredClone(m); copy.rooms[0].name = '<script>alert("x")</script>&';
  const svg = buildPlanSVG(copy); assert.ok(svg.includes('&lt;script&gt;')); assert.equal(svg.includes('<script>'), false);
  assert.equal((svg.match(/data-room-id=/g) || []).length, 12); assert.equal(/NaN|Infinity/.test(svg), false);
  const result = spawnSync('python', ['-c', 'import sys; from xml.etree import ElementTree as E; r=E.fromstring(sys.stdin.buffer.read()); assert len(r.attrib["viewBox"].split()) == 4; assert r.attrib["preserveAspectRatio"] == "xMidYMid meet"'], { input: svg });
  assert.equal(result.status, 0, result.stderr.toString());
});

class FakeSVG extends EventTarget {
  constructor() { super(); this.v = { x: 0, y: 0, w: 20, h: 30 }; }
  setAttribute(key, value) { if (key === 'viewBox') { const [x, y, w, h] = value.split(' ').map(Number); this.v = { x, y, w, h }; } }
  getBoundingClientRect() { return { x: 40, y: 60, width: 1000, height: 500 }; }
  createSVGPoint() { return { x: 0, y: 0, matrixTransform(m) { return { x: this.x * m.a + m.e, y: this.y * m.d + m.f }; } }; }
  getScreenCTM() {
    const r = this.getBoundingClientRect(), v = this.v, scale = Math.min(r.width / v.w, r.height / v.h);
    const e = r.x + (r.width - v.w * scale) / 2 - v.x * scale, f = r.y + (r.height - v.h * scale) / 2 - v.y * scale;
    return { inverse: () => ({ a: 1 / scale, d: 1 / scale, e: -e / scale, f: -f / scale }) };
  }
  querySelectorAll() { return []; }
  closest() { return null; }
  setPointerCapture() {}
}
const pointer = (svg, type, properties) => { const e = new Event(type); Object.assign(e, { button: 0, ...properties }); svg.dispatchEvent(e); };
test('pan and anchor zoom remain correct with letterboxing, and room focus stays bounded', () => {
  const svg = new FakeSVG(), viewport = new PlanViewport({ set innerHTML(x) {}, querySelector: () => svg }, m, () => {}); viewport.apply();
  const client = { x: 310, y: 250 }, before = viewport.point(client.x, client.y); viewport.zoom(.5, client); const after = viewport.point(client.x, client.y);
  assert.ok(Math.abs(before.x - after.x) < 1e-8); assert.ok(Math.abs(before.y - after.y) < 1e-8);
  const from = viewport.point(500, 250);
  pointer(svg, 'pointerdown', { pointerId: 1, clientX: 500, clientY: 250 }); pointer(svg, 'pointermove', { pointerId: 1, clientX: 550, clientY: 280 }); pointer(svg, 'pointerup', { pointerId: 1, clientX: 550, clientY: 280 });
  const to = viewport.point(550, 280); assert.ok(Math.abs(from.x - to.x) < 1e-8); assert.ok(Math.abs(from.y - to.y) < 1e-8);
  viewport.focus(m.rooms[0].id); assert.ok(viewport.view.w > m.rooms[0].w); assert.ok(viewport.view.h > m.rooms[0].h);
  viewport.zoom(1e-9); assert.equal(viewport.view.w, 2.5); viewport.fit(true); assert.ok(viewport.view.w > m.plot.width);
});

test('two-pointer pinch zooms without one-finger state errors after cancellation', () => {
  const svg = new FakeSVG(), p = new PlanViewport({ set innerHTML(x) {}, querySelector: () => svg }, m, () => {}); p.apply(); const before = p.view.w;
  pointer(svg, 'pointerdown', { pointerId: 1, clientX: 400, clientY: 200 }); pointer(svg, 'pointerdown', { pointerId: 2, clientX: 600, clientY: 200 }); pointer(svg, 'pointermove', { pointerId: 2, clientX: 700, clientY: 200 });
  assert.ok(p.view.w < before); pointer(svg, 'pointercancel', { pointerId: 2 }); pointer(svg, 'pointerup', { pointerId: 1 }); assert.equal(p.pointers.size, 0);
});

test('AI client is enabled through the external Worker without exposing a browser secret', () => {
  assert.equal(AI_ENABLED, true);
  assert.equal(WORKER_URL, 'https://al-mizan-api.ajeryabod.workers.dev');
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /الذكاء الاصطناعي مفعّل/);
  assert.equal(html.includes('OPENAI_API_KEY='), false);
});

test('assistant path accepts only validated suggestions and never changes the model itself', async () => {
  const brief = { summary: 'اقتراح', questions: [], assumptions: ['المساحة افتراض'], unhandled: [], rooms: defaultRooms() }, previous = JSON.stringify(m);
  const result = await requestBrief({ prompt: 'أريد منزلاً', plot: m.plot }, { enabled: true, fetcher: async (url, opts) => {
    assert.equal(url, WORKER_URL + '/api/assistant'); assert.equal(opts.credentials, undefined); assert.equal(opts.headers.Authorization, undefined);
    return Response.json({ source: 'openai', brief });
  } });
  assert.equal(result.brief.rooms.length, 12); assert.equal(JSON.stringify(m), previous);
  await assert.rejects(requestBrief({}, { enabled: true, fetcher: async () => new Response('<html>') }), /غير متصلة/);
  await assert.rejects(requestBrief({}, { enabled: true, fetcher: async () => Response.json({ source: 'fake', brief }) }), /مصدر/);
  assert.throws(() => validateSuggestion({ ...brief, rooms: [{ ...brief.rooms[0], area: 0 }] }));
  assert.equal(validateSuggestion({ ...brief, questions: ['ما المطلوب؟'], rooms: [] }).rooms.length, 0);
});

test('entrypoint has unique IDs, all fixed UI references exist, and imports are static local assets', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'), app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(ids.length, new Set(ids).size);
  for (const [, id] of app.matchAll(/\$\('([^']+)'\)/g)) if (!id.startsWith('amount-')) assert.ok(ids.includes(id), id);
  assert.equal((html.match(/data-tab=/g) || []).length, 3); assert.equal((html.match(/id="panel-/g) || []).length, 3);
  assert.match(html, /<script type="module" src="\.\/app.mjs"><\/script>/); assert.equal(html.includes('<script>const A='), false);
  assert.equal(/<script[^>]*three\.min\.js/.test(html), false, '3D CDN loading must not block the initial interface or 2D');
  for (const [, path] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) assert.ok(readFileSync(new URL('../dist/' + path, import.meta.url)).length);
});