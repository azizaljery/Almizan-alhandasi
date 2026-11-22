import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, applyCommand, serialize, mergeFinish } from '../dist/draw/doc.mjs';
import { newWorkspace, validateWorkspace, validateProduct, productTakeoff, shoppingList, roomsForDoc, applyProduct, calibratedScale, snapTracePoint, vectorPlanToDoc, renovationDiff, importOfferCsv, compareOffers, validateTask, addPayment, executionSummary, csv } from '../dist/client-tools/model.mjs';
import { validateVisionResult } from '../dist/client-tools/vision-schema.mjs';
import { createClientToolsWorker } from '../worker/client-tools.mjs';
import { hasProject, archiveCurrent, clearProject, restorePast } from '../dist/project-lifecycle.mjs';
import { reviewToolsDocument } from '../dist/client-tools/model.mjs';
import { gateLogReset, gateLog } from '../dist/design-review.mjs';

function document() {
  let doc = createDoc({ title: 'اختبار الأدوات' });
  doc = applyCommand(doc, { type: 'add-rect', level: 'L1', a: { x: 0, y: 0 }, b: { x: 6, y: 5 }, t: .2 }).doc;
  return applyCommand(doc, { type: 'add-label', level: 'L1', name: 'صالة', roomType: 'living', seed: { x: 2, y: 2 } }).doc;
}
const product = patch => validateProduct({ name: 'منتج اختباري', category: 'floor', price: 45, unit: 'م²', pack: 1.44, preset: 'woodOak', color: '#ac946d', pricedAt: '2026-11-22', ...patch });

test('floor quantities come from actual geometry and packs round up after waste', () => {
  const doc = document(), room = roomsForDoc(doc)[0], p = product({});
  const q = productTakeoff(p, room, { quantity: 999, waste: 10 });
  assert.equal(q.quantity, room.area); assert.equal(q.packs, Math.ceil(room.area * 1.1 / 1.44)); assert.equal(q.total, Math.round(q.packs * 1.44 * 45 * 100) / 100);
  assert.throws(() => product({ unit: 'عدد' }), /المتر المربع/);
  assert.throws(() => productTakeoff(product({ category: 'light', unit: 'عدد' }), room), /غير صالحة/);
});
test('product choice changes presentation only and remains attached to the actual room label', () => {
  const doc = document(), before = serialize(doc), room = roomsForDoc(doc)[0], next = applyProduct(doc, product({}), room.key);
  assert.equal(serialize(doc), before); assert.deepEqual(next.walls, doc.walls); assert.deepEqual(next.openings, doc.openings); assert.deepEqual(next.labels, doc.labels);
  assert.equal(next.finish.roomProducts[room.labelId].floor, 'woodOak');
  assert.throws(() => mergeFinish({}, { roomProducts: JSON.parse('{"__proto__":{"paint":"#ffffff"}}') }), /غير صالح/);
  assert.throws(() => mergeFinish({}, { roomProducts: { r1: { paint: 'url(javascript:bad)' } } }), /لون غير صالح/);
});
test('tools use the current shared review gate without changing geometry or borrowing a foreign brief', () => {
  const doc = document(), before = serialize(doc), room = roomsForDoc(doc)[0], styled = applyProduct(doc, product({}), room.key);
  gateLogReset(); const original = reviewToolsDocument(doc), result = reviewToolsDocument(styled, { sourceDoc: doc });
  assert.equal(result.geometryHash, original.geometryHash); assert.deepEqual(gateLog().map(r => r.route), ['manual', 'manual']); assert.equal(serialize(doc), before);
  const foreign = document(); foreign.title = 'عميل آخر'; foreign.walls[0].a.x = -1;
  const noInheritance = reviewToolsDocument(doc, { session: { current: 0, input: { idea: 'طلب خاص لا يخص هذا الرسم', requirements: { prefs: { elevator: true } } }, designs: [{ doc: serialize(foreign) }] } });
  assert.equal(noInheritance.planVersion, original.planVersion);
});
test('shopping retains missing-room evidence and imported product links cannot execute code', () => {
  const s = newWorkspace(), p = product({}); s.products.push(p); s.selections.push({ id: 's', roomKey: 'deleted', productId: p.id, waste: 0, quantity: 10, basis: '' });
  assert.equal(shoppingList(s, document()).lines[0].stale, true);
  assert.throws(() => product({ source: 'javascript:alert(1)' }), /رابط ويب/);
  assert.equal(validateWorkspace(JSON.parse(JSON.stringify(s))).products[0].id, p.id);
});
test('automatic wall estimates follow current room geometry while manual quantities remain explicit', () => {
  const doc = document(), room = roomsForDoc(doc)[0], s = newWorkspace(), p = product({ category: 'wall', unit: 'م²' }); s.products.push(p);
  s.selections.push({ id: 'selection', roomKey: room.key, productId: p.id, quantity: 1, mode: 'room-wall', waste: 0, basis: 'تقدير: محيط الغرفة' });
  assert.equal(shoppingList(s, doc).lines[0].quantity, Math.round(room.perimeter * room.height * 100) / 100);
  s.selections[0].mode = 'manual'; assert.equal(shoppingList(s, doc).lines[0].quantity, 1);
});
test('a tools-only project is preserved when starting a new project and can be restored', () => {
  const map = new Map(), store = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
  const s = newWorkspace(); s.mood.summary = 'لوحة إلهام قبل رسم المنزل'; store.setItem('mizan.client.tools.v1', JSON.stringify(s));
  assert.equal(hasProject(store), true); const old = archiveCurrent(store); assert.ok(old); clearProject(store); assert.equal(store.getItem('mizan.client.tools.v1'), null);
  assert.equal(restorePast(store, store, old.id), true); assert.equal(JSON.parse(store.getItem('mizan.client.tools.v1')).mood.summary, s.mood.summary);
});
test('calibration uses original image dimensions and vector import creates editable metric walls', () => {
  const scale = calibratedScale([{ x: .1, y: .1 }, { x: .9, y: .1 }], 8, 1000, 800);
  assert.equal(scale, .01); assert.throws(() => calibratedScale([{ x: 0, y: 0 }, { x: .001, y: .001 }], 4, 100, 100), /متقاربتان/);
  const doc = vectorPlanToDoc({ walls: [{ a: { x: .1, y: .1 }, b: { x: .9, y: .1 } }], openings: [{ wallIndex: 0, kind: 'door', position: .5, widthFraction: .125 }], rooms: [] }, { scale, width: 1000, height: 800 });
  assert.equal(doc.walls[0].b.x - doc.walls[0].a.x, 8); assert.equal(doc.openings[0].w, 1); assert.equal(doc.walls[0].a.y, 7.2);
  assert.throws(() => vectorPlanToDoc({ walls: [] }, { scale: null, width: 1000, height: 800 }), /غير صالحة/);
});
test('renovation keeps a literal baseline and separates removed/new walls including changed same-ID geometry', () => {
  const a = document(), before = serialize(a), b = structuredClone(a); b.walls[0].a.y += .5;
  const diff = renovationDiff(a, b); assert.equal(diff.removed.length, 1); assert.equal(diff.added.length, 1); assert.equal(diff.kept, 3); assert.ok(diff.demolitionArea > 0); assert.equal(serialize(a), before);
});
test('renovation ignores purely administrative wall splits and counts only physical extensions', () => {
  const a = document(), b = structuredClone(a), old = b.walls.shift(), middle = { x: (old.a.x + old.b.x) / 2, y: (old.a.y + old.b.y) / 2 };
  b.walls.push({ ...old, b: middle }, { ...old, id: 'w99', a: old.b, b: middle }); b.counters.walls = 99;
  const split = renovationDiff(a, b); assert.equal(split.demolitionArea, 0); assert.equal(split.newWallArea, 0); assert.equal(split.kept, 4);
  const extended = structuredClone(a); extended.walls[0].b.x += 1;
  const difference = renovationDiff(a, extended); assert.equal(difference.demolitionArea, 0); assert.equal(difference.newWallArea, a.levels[0].height);
});
test('manual traces snap close endpoints so cursor rounding does not leave invisible open-room gaps', () => {
  const plan = { walls: [{ a: { x: .1, y: .1 }, b: { x: .9, y: .1 } }], openings: [], rooms: [{ name: 'صالة', type: 'living', center: { x: .5, y: .5 } }] };
  for (const [rawA, rawB] of [[{x:.9008,y:.1006},{x:.9,y:.9}],[{x:.8998,y:.8998},{x:.1,y:.9}],[{x:.1001,y:.9004},{x:.1005,y:.1004}]]) {
    plan.walls.push({ a: snapTracePoint(plan, rawA, 1000, 750), b: snapTracePoint(plan, rawB, 1000, 750) });
  }
  const doc = vectorPlanToDoc(plan, { scale: .01, width: 1000, height: 750 }); assert.equal(roomsForDoc(doc).length, 1); assert.ok(roomsForDoc(doc)[0].area > 40);
});
test('offers normalize only comparable units and never treat missing or unpriced work as a complete cheap bid', () => {
  const reference = [{ code: 'A', name: 'جدار', quantity: 10, unit: 'م²' }, { code: 'B', name: 'باب', quantity: 2, unit: 'عدد' }];
  const items = importOfferCsv('code,name,unit,quantity,rate\nA,"مبانٍ، شامل",م²,8,50\nB,باب,عدد,2,0');
  const [c] = compareOffers(reference, [{ id: 'o', name: 'المقاول', items }]);
  assert.equal(c.total, 400); assert.equal(c.comparableTotal, 500); assert.equal(c.complete, true); assert.equal(c.mismatches[0].kind, 'quantity');
  const [bad] = compareOffers(reference, [{ id: 'b', name: 'ناقص', items: [{ ...items[0], unit: 'م' }] }]); assert.equal(bad.complete, false); assert.equal(bad.comparableTotal, 0); assert.deepEqual(bad.missing, ['B']);
  assert.throws(() => importOfferCsv('code,name,unit,quantity,rate\nA,أ,م,1,2\nA,ب,م,1,2'), /مكررة/);
  assert.throws(() => importOfferCsv('code,name,unit,quantity,rate\nA,أ,م,-1,2'), /غير صالحة/);
  assert.match(csv([{ code: '=HYPERLINK("bad")' }], ['code']), /'=HYPERLINK/);
});
test('accepted work needs evidence notes; payments require acceptance and cannot exceed budget', () => {
  const s = newWorkspace();
  assert.throws(() => validateTask({ title: 'عمل', status: 'accepted', budget: 100 }), /ملاحظة/);
  assert.throws(() => validateTask({ title: 'عمل', status: 'planned', start: '2026-12-01', end: '2026-11-01' }), /تسبق/);
  const t = validateTask({ title: 'تركيب', status: 'submitted', budget: 100 }); s.tasks.push(t);
  assert.throws(() => addPayment(s, { taskId: t.id, amount: 10 }), /مستلمة/);
  Object.assign(t, validateTask({ ...t, status: 'accepted', acceptedAt: '2026-11-22', acceptanceNote: 'فُحصت الأعمال حسب نطاقها' }));
  s.payments.push(addPayment(s, { taskId: t.id, amount: 70 })); assert.throws(() => addPayment(s, { taskId: t.id, amount: 31 }), /تتجاوز/);
  assert.equal(executionSummary(s).progress, 100); assert.equal(executionSummary(s).paid, 70);
});
test('vision schemas reject unsupported room types, dangling openings and non-finite coordinates', () => {
  const plan = { walls: [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }], openings: [], rooms: [], notes: [] };
  assert.equal(validateVisionResult('plan', plan).walls.length, 1);
  assert.throws(() => validateVisionResult('plan', { ...plan, openings: [{ wallIndex: 2, kind: 'door', position: .5, widthFraction: .2 }] }), /invalid/);
  assert.throws(() => validateVisionResult('plan', { ...plan, walls: [{ a: { x: NaN, y: 0 }, b: { x: 1, y: 0 } }] }), /invalid/);
});
test('backup validation rejects malformed trace coordinates before the canvas can consume them', () => {
  const s = newWorkspace(); s.imported = { blobId: 'image', sourceBlobId: 'source', width: 1000, height: 800, points: [], scale: null, plan: { walls: [], openings: [], rooms: [], notes: [] } };
  assert.equal(validateWorkspace(s).imported.plan.walls.length, 0);
  s.imported.plan.walls.push({ a: { x: 4, y: 0 }, b: { x: 1, y: 0 } }); assert.throws(() => validateWorkspace(s), /بيانات تتبع/);
});
const env = { ANTHROPIC_API_KEY: 'test-provider-credential', MIZAN_ACCESS_CODE: 'test-client-code' };
const image = { type: 'image/png', data: Buffer.from('\x89PNG\r\n\x1a\n' + 'test-bytes', 'binary').toString('base64') };
const request = (body, code = env.MIZAN_ACCESS_CODE, origin = 'https://example.test') => new Request('https://example.test/api/client-tools/vision', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'X-Mizan-Access-Code': code }, body: JSON.stringify(body) });
test('vision endpoint authenticates and validates before sending any customer image to provider', async () => {
  let calls = 0; const w = createClientToolsWorker(async () => { calls++; throw Error('must not call'); });
  assert.equal((await w.fetch(request({ mode: 'mood', images: [image] }, 'bad'), env)).status, 401);
  assert.equal((await w.fetch(request({ mode: 'mood', images: [image] }, env.MIZAN_ACCESS_CODE, 'https://other.test'), env)).status, 403);
  assert.equal((await w.fetch(request({ mode: 'mood', images: [{ ...image, type: 'image/svg+xml' }] }), env)).status, 400);
  assert.equal((await w.fetch(request({ mode: 'mood', images: [image] }), {})).status, 503); assert.equal(calls, 0);
});
test('vision uses current server credential, validates forced tool result, hides credentials, and bounds requests', async () => {
  let called = 0; const w = createClientToolsWorker(async (url, options) => {
    called++; assert.equal(options.headers['x-api-key'], env.ANTHROPIC_API_KEY);
    const body = JSON.parse(options.body); assert.equal(body.tool_choice.name, 'submit_client_tool_result'); assert.equal(body.messages[0].content[0].source.data, image.data);
    return Response.json({ content: [{ type: 'tool_use', name: 'submit_client_tool_result', input: { summary: 'ألوان طبيعية', palette: ['#aabbcc'], materials: ['خشب'], designDirections: ['بساطة'] } }] });
  });
  const response = await w.fetch(request({ mode: 'mood', images: [image] }), env), text = await response.text();
  assert.equal(response.status, 200); assert.ok(!text.includes(env.ANTHROPIC_API_KEY)); assert.ok(!text.includes(env.MIZAN_ACCESS_CODE)); assert.equal(JSON.parse(text).requiresReview, true);
  for (let i = 0; i < 4; i++) await w.fetch(request({ mode: 'mood', images: [image] }), env);
  assert.equal((await w.fetch(request({ mode: 'mood', images: [image] }), env)).status, 429); assert.equal(called, 5);
  const bad = createClientToolsWorker(async () => Response.json({ content: [{ type: 'text', text: 'not a valid result' }] }));
  assert.equal((await bad.fetch(request({ mode: 'mood', images: [image] }), env)).status, 502);
});
