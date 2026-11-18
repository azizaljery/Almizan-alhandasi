import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalD1 } from './fixtures/local-d1-admin.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { generateVillaDesigns } from '../dist/villa-layout.mjs';
const deliveredFixture = generateVillaDesigns({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, keep: 1 }).designs[0].doc;
const deliverable = () => structuredClone(deliveredFixture);
import { serialize } from '../dist/draw/doc.mjs';
import { createDeliveryRegistry } from '../worker/delivery-registry.mjs';
import { designSignature, signatureSimilarity } from '../dist/design-signature.mjs';
import { documentHash, deliveryClientKey } from '../dist/delivery-ui.mjs';
import { saveBoundSnapshot, loadBoundSnapshot, SNAPSHOT_KEY } from '../dist/bound-snapshot.mjs';

class RegistryDB extends LocalD1 {
  constructor() { super(); this.sqlite.exec(readFileSync('db/delivery-registry.sql', 'utf8')); }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const out = statements.map(s => { const r = this.sqlite.prepare(s.sql).run(...s.values); return { success: true, meta: { changes: Number(r.changes) } }; }); this.sqlite.exec('COMMIT'); return out; }
    catch (e) { this.sqlite.exec('ROLLBACK'); throw e; }
  }
}
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const call = async (h, db, doc, { key = 'a'.repeat(64), claim = true, origin = 'https://site.test', raw = null } = {}) => {
  const r = await h.fetch(new Request('https://site.test/api/delivery/' + (claim ? 'claim' : 'check'), { method: 'POST', headers: { origin, 'x-delivery-key': key, 'content-type': 'application/json', 'CF-Connecting-IP': key.slice(0, 5) }, body: raw ?? JSON.stringify({ doc: serialize(doc) }) }), { DB: db });
  return { status: r.status, data: await r.json() };
};
function transformed(d, { flip = false, rotate = false, scale = 1 } = {}) {
  d = structuredClone(d); const pt = p => { let x = p.x, y = p.y; if (flip) x = -x; if (rotate) [x, y] = [-y, x]; return { x: x * scale + 30, y: y * scale + 40 }; };
  for (const w of d.walls) { w.a = pt(w.a); w.b = pt(w.b); w.t *= scale; }
  for (const l of d.labels) { l.seed = pt(l.seed); l.name = 'عميل مختلف'; }
  d.labels.reverse(); d.title = 'اسم جديد'; return d;
}
test('architectural identity ignores names, ordering, translation, scale, mirror and rotation', () => {
  const doc = sampleVilla(), sig = designSignature(doc);
  for (const params of [{}, { flip: true }, { rotate: true }, { rotate: true, flip: true }, { scale: 1.2 }]) {
    const other = designSignature(transformed(doc, params));
    assert.equal(signatureSimilarity(sig, other).copy, true, JSON.stringify(params));
    assert.ok(signatureSimilarity(sig, other).whole > .999);
  }
});
test('preflight does not reserve; delivery reserves globally; a different client gets no private data', async () => {
  const db = new RegistryDB(), h = createDeliveryRegistry(), d = deliverable();
  assert.equal((await call(h, db, d, { claim: false })).data.available, true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM delivery_claims').get().n, 0);
  const a = await call(h, db, d); assert.equal(a.status, 201, JSON.stringify(a)); assert.equal(a.data.receipt.documentHash, await documentHash(d));
  const b = await call(h, db, d, { key: 'b'.repeat(64) }); assert.equal(b.status, 409); assert.equal(b.data.error, 'design_reserved');
  assert.ok(!JSON.stringify(b.data).includes(a.data.receipt.id)); assert.ok(!JSON.stringify(b.data).includes('signature'));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM delivery_claims').get().n, 1);
});
test('same client can retry idempotently and develop a revision; relabelling does not release the first claim', async () => {
  const db = new RegistryDB(), h = createDeliveryRegistry(), d = deliverable();
  const a = await call(h, db, d), again = await call(h, db, d); assert.deepEqual(again.data.receipt, a.data.receipt);
  const changed = structuredClone(d); changed.title = 'نسخة مطورة'; changed.labels[0].name = 'الاسم الجديد';
  const own = await call(h, db, changed); assert.equal(own.status, 201); assert.notEqual(own.data.receipt.id, a.data.receipt.id);
  for (const r of [a.data.receipt, own.data.receipt]) {
    const verified = await h.fetch(new Request('https://site.test/api/delivery/verify?id=' + r.id + '&hash=' + r.documentHash), { DB: db });
    assert.equal((await verified.json()).valid, true, 'previous deliveries remain verifiable after a revision');
  }
  const other = await call(h, db, changed, { key: 'b'.repeat(64) }); assert.equal(other.status, 409);
});
test('two independent worker isolates racing for the same design cannot both deliver', async () => {
  const db = new RegistryDB(), a = createDeliveryRegistry(), b = createDeliveryRegistry(), d = deliverable();
  const out = await Promise.all([call(a, db, d), call(b, db, d, { key: 'b'.repeat(64) })]);
  assert.deepEqual(out.map(x => x.status).sort(), [201, 409]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM delivery_claims').get().n, 1);
});
test('atomic revision gate also blocks simultaneous near-copies with different exact hashes', async () => {
  const db = new RegistryDB(), d = deliverable(), near = structuredClone(d);
  const edge = Math.max(...near.walls.flatMap(w => [w.a.x, w.b.x]));
  for (const w of near.walls) for (const k of ['a', 'b']) if (Math.abs(w[k].x - edge) < .001) w[k].x += .04;
  const a = designSignature(d), b = designSignature(near); assert.notEqual(a.key, b.key); assert.equal(signatureSimilarity(a, b).copy, true);
  const out = await Promise.all([call(createDeliveryRegistry(), db, d), call(createDeliveryRegistry(), db, near, { key: 'b'.repeat(64) })]);
  assert.deepEqual(out.map(x => x.status).sort(), [201, 409]); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM delivery_claims').get().n, 1);
});
test('registry fails closed without schema, invalid geometry, origin or client key', async () => {
  const h = createDeliveryRegistry(), db = new RegistryDB(), d = deliverable();
  assert.equal((await call(h, new LocalD1(), d)).status, 503);
  assert.equal((await call(h, db, d, { origin: 'https://other.test' })).status, 403);
  assert.equal((await call(h, db, d, { key: '' })).status, 401);
  assert.equal((await call(h, db, d, { raw: '{bad' })).status, 400);
  const bad = structuredClone(d); bad.openings = []; assert.equal((await call(h, db, bad)).status, 422);
});
test('customer keys remain stable per project, differ across customers and snapshots never cross projects', async () => {
  const s = store(); assert.equal(deliveryClientKey(s, 'one'), deliveryClientKey(s, 'one')); assert.notEqual(deliveryClientKey(s, 'one'), deliveryClientKey(s, 'two'));
  const original = deliveryClientKey(s, 'one'); s.setItem('mizan.delivery.active.one', 'one.new.customer');
  assert.notEqual(deliveryClientKey(s, 'one'), original); s.setItem('mizan.delivery.active.one', ''); assert.equal(deliveryClientKey(s, 'one'), original);
  assert.throws(() => deliveryClientKey({ getItem: () => null, setItem() { throw Error('quota'); } }, 'one'), /تعذر حفظ مفتاح/);
  const d = sampleVilla(), image = 'data:image/png;base64,aGVsbG8=';
  await saveBoundSnapshot(s, d, image, { view: 'facade' }); assert.equal((await loadBoundSnapshot(s, d)).image, image);
  const other = structuredClone(d); other.walls[0].h = 5; assert.equal(await loadBoundSnapshot(s, other), null);
  s.setItem(SNAPSHOT_KEY, image); assert.equal(await loadBoundSnapshot(s, d), null);
});
