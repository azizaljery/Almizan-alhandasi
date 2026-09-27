import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { buildPlanSVG, PlanViewport } from '../dist/plan-view.mjs';
import { AI_ENABLED, validateSuggestion, requestBrief, getAssistantStatus } from '../dist/assistant.mjs';
import { reviewPlan } from '../dist/audit.mjs';
import { requestLocalBrief } from '../dist/local-nlp.mjs';
import { applySunOrientation } from '../dist/sun-orientation.mjs';

const m = generateModel({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }, defaultRooms());
test('generated SVG is valid XML with complete viewBox and escaped user-controlled room names', () => {
  const copy = structuredClone(m); copy.rooms[0].name = '<script>alert("x")</script>&';
  const svg = buildPlanSVG(copy); assert.ok(svg.includes('&lt;script&gt;')); assert.equal(svg.includes('<script>'), false);
  assert.equal((svg.match(/data-room-id=/g) || []).length, 12); assert.equal(/NaN|Infinity/.test(svg), false);
  // XML parser is diagnostic only; no browser, network, or screenshot is used.
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

test('AI release requires the private site access code and never exposes the provider key', async () => {
  let calls = 0; assert.equal(AI_ENABLED, true);
  await assert.rejects(requestBrief({}, { fetcher: async () => { calls++; } }), /رمز دخول/); assert.equal(calls, 0);
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'); assert.match(html, /جارٍ التحقق من خدمة فهم المتطلبات/); assert.equal(html.includes('OPENAI_API_KEY='), false);
});

test('assistant status is validated before the interface calls it ready', async () => {
  const status = await getAssistantStatus({ fetcher: async (url, options) => {
    assert.match(url, /workers\.dev\/api\/assistant\/status$/); assert.equal(options.credentials, 'omit');
    return Response.json({ configured: true, accessConfigured: true, verified: false });
  } });
  assert.equal(status.configured, true);
  await assert.rejects(getAssistantStatus({ fetcher: async () => Response.json({ configured: 'yes' }) }), /تعذر التحقق/);
});

test('assistant connection failures provide recoverable messages and never return a proposal', async () => {
  const options = { enabled: true, accessCode: 'private-code' };
  await assert.rejects(requestBrief({}, { ...options, fetcher: async () => { throw new TypeError('Failed to fetch'); } }), /تعذّر الاتصال/);
  await assert.rejects(requestBrief({}, { ...options, fetcher: async () => { throw new DOMException('Timeout', 'TimeoutError'); } }), /الوقت المحدد/);
  await assert.rejects(requestBrief({}, { ...options, fetcher: async () => new Response('{broken', { headers: { 'Content-Type': 'application/json' } }) }), /غير متصلة/);
  await assert.rejects(requestBrief({}, { ...options, fetcher: async () => Response.json(null) }), /مصدر الاقتراح/);
  await assert.rejects(requestBrief({}, { ...options, fetcher: async () => Response.json({ error: 'رمز دخول الذكاء غير صحيح.' }, { status: 401 }) }), /رمز دخول الذكاء غير صحيح/);
});

test('planning review produces bounded area, route and conflict outputs from the generated model', () => {
  const review = reviewPlan(m);
  assert.equal(review.areas[0][0], 'مساحة الأرض'); assert.equal(review.areas[0][1], 600);
  assert.ok(review.routes.guests.length); assert.ok(review.routes.family.length);
  assert.ok(review.score >= 0 && review.score <= 100); assert.match(review.note, /لا يتضمن/);
});

test('local Arabic understanding proposes changes for counts and negation without network access', async () => {
  const brief = await requestLocalBrief({ prompt: 'أبي ثلاث غرف نوم ومجلسين، بدون خادمة', previous: { rooms: defaultRooms() } });
  assert.equal(brief.rooms.filter(room => room.type === 'bedroom').length, 3);
  assert.equal(brief.rooms.filter(room => room.type === 'majlis').length, 2);
  assert.equal(brief.rooms.filter(room => room.type === 'service').length, 0);
  assert.match(brief.summary, /محليًا/);
});

test('directional preference changes only placement fields and respects the actual entry side', () => {
  const rooms = defaultRooms({ bedrooms: 1, majlis: 1, baths: 0, kitchens: 0, halls: 1, dining: 0 });
  const oriented = applySunOrientation(rooms, 'w');
  assert.deepEqual(oriented.map(room => [room.name, room.area, room.type]), rooms.map(room => [room.name, room.area, room.type]));
  assert.ok(oriented.every(room => ['front', 'middle', 'back'].includes(room.position)));
});

test('future assistant path accepts only validated suggestions and never changes the model itself', async () => {
  const brief = { summary: 'اقتراح', questions: [], assumptions: ['المساحة افتراض'], unhandled: [], rooms: defaultRooms() }, previous = JSON.stringify(m);
  const result = await requestBrief({ prompt: 'أريد منزلاً', plot: m.plot }, { enabled: true, accessCode: 'private-code', fetcher: async (url, opts) => {
    assert.match(url, /workers\.dev\/api\/assistant$/); assert.equal(opts.credentials, 'omit'); assert.equal(opts.headers.Authorization, undefined); assert.equal(opts.headers['X-Mizan-Access-Code'], 'private-code');
    return Response.json({ source: 'openai', brief });
  } });
  assert.equal(result.brief.rooms.length, 12); assert.equal(JSON.stringify(m), previous);
  await assert.rejects(requestBrief({}, { enabled: true, accessCode: 'x', fetcher: async () => new Response('<html>') }), /غير متصلة/);
  await assert.rejects(requestBrief({}, { enabled: true, accessCode: 'x', fetcher: async () => Response.json({ source: 'fake', brief }) }), /مصدر/);
  assert.throws(() => validateSuggestion({ ...brief, rooms: [{ ...brief.rooms[0], area: 0 }] }));
  assert.equal(validateSuggestion({ ...brief, questions: ['ما المطلوب؟'], rooms: [] }).rooms.length, 0);
});

test('entrypoint has unique IDs, all fixed UI references exist, and imports are static local assets', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'), app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(ids.length, new Set(ids).size);
  for (const [, id] of app.matchAll(/\$\('([^']+)'\)/g)) if (!id.startsWith('amount-')) assert.ok(ids.includes(id), id);
  assert.equal((html.match(/data-tab=/g) || []).length, 3); assert.equal((html.match(/id="panel-/g) || []).length, 3);
  assert.equal(/data-go="boq" hidden/.test(html), false); assert.equal(/data-tab="boq" hidden/.test(html), false);
  assert.match(html, /<script type="module" src="\.\/app.mjs"><\/script>/); assert.equal(html.includes('<script>const A='), false);
  assert.equal(/<script[^>]*three\.min\.js/.test(html), false, '3D CDN loading must not block the initial interface or 2D');
  for (const [, path] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) assert.ok(readFileSync(new URL('../dist/' + path, import.meta.url)).length);
});

test('no static "node:*" builtin import is reachable from the browser entrypoints, so the ⁨اكتشف⁩ button and app always bind', () => {
  // A static `import x from 'node:...'` anywhere in the graph reachable from app.mjs/portal.mjs
  // fails to resolve in a browser and aborts the whole ES module graph before any click listener
  // (including the intro "اكتشف" button) gets bound. Dynamic, guarded `await import('node:...')`
  // remains fine since it never appears in a `from '...'` clause and only runs under Node.
  const distDir = new URL('../dist/', import.meta.url), visited = new Set(), offenders = [];
  const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  function walk(relPath) {
    const fileUrl = new URL(relPath, distDir);
    if (visited.has(fileUrl.href)) return;
    visited.add(fileUrl.href);
    const source = stripComments(readFileSync(fileUrl, 'utf8'));
    for (const [, spec] of source.matchAll(/from\s*['"](node:[a-zA-Z0-9_/-]+)['"]/g)) offenders.push(`${relPath} -> ${spec}`);
    for (const [, spec] of source.matchAll(/(?:import|export)\s+(?:[^'"()]*?from\s+)?['"](\.[^'"]+)['"]/g)) {
      walk(new URL(spec, fileUrl).pathname.replace(new RegExp('^' + distDir.pathname), ''));
    }
  }
  walk('app.mjs'); walk('portal.mjs');
  assert.ok(visited.size > 100, `expected the module graph walk to reach many files, only found ${visited.size}`);
  assert.deepEqual(offenders, []);
});
