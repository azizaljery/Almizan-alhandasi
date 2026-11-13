import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubmission, submitCopy, withdrawCopy, loadRecord, CONSENT_KEY } from '../dist/archive-consent.mjs';
import { sanitizeSubmission } from '../worker/client-archive.mjs';
import { generateInitialDesign, normalizeLand } from '../dist/home-flow.mjs';
import { createSession } from '../dist/design-session.mjs';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
async function filled() {
  const { land } = normalizeLand({ length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 1, geo: { lat: 24.7743123, lng: 46.7386123, north: 3 } });
  const result = await generateInitialDesign({ land, idea: 'x', counts: { bedrooms: 3, majlis: 1 } });
  const s = createSession({ land, counts: {}, requirements: { ...result.requirements, prefs: { allEnsuite: true, exterior: { style: 'S', tone: 'warm', notes: 'اسمي سعد 0555555555' } } }, discovery: null, idea: 'اسمي سعد وجوالي 0555555555', result });
  return store({ 'mizan.design.session.v1': JSON.stringify(s), 'mizan.studio.doc.v1': s.designs[0].doc });
}
test('لا إرسال بلا موافقة: submitCopy يرمي ولا يستدعي fetch', async () => {
  const local = await filled(); let calls = 0;
  for (const consent of [false, undefined, 'yes', 1]) await assert.rejects(submitCopy({ consent, local, fetchFn: async () => { calls++; return new Response('{}'); } }), /موافقتك/);
  assert.equal(calls, 0); assert.equal(loadRecord(local), null);
});
test('الحمولة: لا فكرة حرة ولا ملاحظات، والإحداثيات مقرّبة، ثم تنقية الخادم تسقط الباقي', async () => {
  const local = await filled(), b = buildSubmission(local), text = JSON.stringify(b);
  assert.ok(!text.includes('0555555555') && !text.includes('سعد')); assert.equal(b.land.geo.lat, 24.77); assert.equal(b.exterior.notes, undefined);
  const clean = sanitizeSubmission({ ...b, consent: true, token: 'a'.repeat(40) });
  assert.equal(clean.land.geo.lng, 46.74); assert.ok(clean.bytes < 450_000);
  assert.equal(JSON.parse(clean.payload).exterior.style, 'S');
  assert.equal(buildSubmission(store()), null);
});
test('إرسال بموافقة ثم تحديث بنفس الرمز ثم سحب يحذف السجل المحلي', async () => {
  const local = await filled(), reqs = [];
  const fetchFn = async (url, init) => { reqs.push([init.method, url, init.headers['x-archive-token'] || null]); return Response.json({ ok: true, id: 7, number: 'D-000007' }, { status: init.method === 'POST' ? 201 : 200 }); };
  await submitCopy({ consent: true, local, fetchFn }); const rec = loadRecord(local); assert.equal(rec.id, 7);
  await submitCopy({ consent: true, local, fetchFn });
  assert.deepEqual(reqs.map(r => r[0]), ['POST', 'PUT']); assert.equal(reqs[1][2], rec.token); assert.ok(reqs[1][1].endsWith('/designs/7'));
  await withdrawCopy({ local, fetchFn }); assert.equal(reqs[2][0], 'DELETE'); assert.equal(local.getItem(CONSENT_KEY), null);
});
test('فشل الخادم يُعلن ولا يسجّل نسخة محلية', async () => {
  const local = await filled();
  await assert.rejects(submitCopy({ consent: true, local, fetchFn: async () => Response.json({ error: 'intake_closed', message: 'استقبال الأرشيف متوقف مؤقتًا.' }, { status: 503 }) }), /متوقف/);
  assert.equal(loadRecord(local), null);
});
