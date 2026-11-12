import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { createGeo } from '../worker/geo.mjs';
import { nominatim, PROVIDERS } from '../worker/geo-providers.mjs';

const ORIGIN = 'https://almizan-handasi.aljeryabod.workers.dev';
const env = { ASSETS: { fetch: async () => new Response('asset') } };
const mk = (over = {}) => {
  const calls = []; let t = 1_000_000;
  const fetchImpl = over.fetchImpl ? async (u, o) => { calls.push({ u: String(u), o }); return over.fetchImpl(String(u), o); } : async (u, o) => { calls.push({ u: String(u), o }); return Response.json([{ lat: '24.77', lon: '46.73', display_name: 'حي النرجس، الرياض', type: 'suburb', address: { city: 'الرياض' } }]); };
  const geo = createGeo({ now: () => t, fetchImpl, sleep: async ms => { t += ms; }, ...(over.limits ? { limits: over.limits } : {}) });
  const get = (path, { ip = '1.1.1.1', headers = {}, method = 'GET' } = {}, e = {}) => geo.fetch(new Request(ORIGIN + path, { method, headers: { 'CF-Connecting-IP': ip, ...headers } }), e);
  return { geo, calls, get, tick: ms => { t += ms; } };
};

test('المدخل الموحد يوجّه /api/geo إلى وكيل الموقع لا إلى وكيل التحليل', async () => {
  const res = await worker.fetch(new Request(ORIGIN + '/api/geo/providers'), env);
  assert.equal(res.status, 200); const b = await res.json();
  assert.deepEqual(b.providers.map(p => p.id), ['nominatim']); assert.equal(b.nationalAddress, false); assert.equal(b.satellite, false);
  assert.equal((await worker.fetch(new Request(ORIGIN + '/api/geo/nope'), env)).status, 404);
});
test('providers: لا أسرار ولا مزوّدون مدفوعون، وقابل للإيقاف', async () => {
  const { get } = mk();
  const txt = await (await get('/api/geo/providers', {}, { GOOGLE_MAPS_KEY: 'k', MAPBOX_TOKEN: 'k', NATIONAL_ADDRESS_KEY: 'k' })).text();
  assert.ok(!/"k"|GOOGLE|MAPBOX|NATIONAL_ADDRESS/.test(txt)); assert.deepEqual(JSON.parse(txt).providers.map(p => p.id), ['nominatim']);
  assert.deepEqual((await (await get('/api/geo/providers', {}, { GEO_NOMINATIM_OFF: '1' })).json()).providers, []);
  assert.equal(PROVIDERS.length, 1);
});
test('search: يمرر الاستعلام إلى Nominatim بسياسته (UA وReferer وcountrycodes) ويقصر النتائج', async () => {
  const { get, calls } = mk();
  const res = await get('/api/geo/search?q=' + encodeURIComponent('حي النرجس'));
  assert.equal(res.status, 200); const b = await res.json();
  assert.equal(b.results[0].lat, 24.77); assert.equal(b.results[0].city, 'الرياض'); assert.equal(b.source, 'nominatim'); assert.match(b.attribution, /OpenStreetMap/);
  assert.equal(calls.length, 1);
  const u = new URL(calls[0].u); assert.equal(u.origin + u.pathname, 'https://nominatim.openstreetmap.org/search');
  assert.equal(u.searchParams.get('countrycodes'), 'sa'); assert.equal(u.searchParams.get('q'), 'حي النرجس'); assert.equal(u.searchParams.get('limit'), '5');
  assert.match(calls[0].o.headers['User-Agent'], /^AlMizanAlHandasi-GeoProxy\/1\.0 \(/); assert.equal(calls[0].o.headers.Referer, ORIGIN + '/');
  const w = mk(); await w.get('/api/geo/search?q=Paris&scope=world'); assert.equal(new URL(w.calls[0].u).searchParams.has('countrycodes'), false);
});
test('search: كاش يمنع تكرار الطلب لنص واحد، ومدخلات سيئة تُرفض قبل أي طلب', async () => {
  const { get, calls, tick } = mk();
  await get('/api/geo/search?q=riyadh'); tick(1500);
  const again = await (await get('/api/geo/search?q=Riyadh')).json(); assert.equal(again.cached, true); assert.equal(calls.length, 1);
  for (const q of ['', 'a', 'x'.repeat(121), '\u0001ab']) { tick(1500); assert.equal((await get('/api/geo/search?q=' + encodeURIComponent(q))).status, 400, JSON.stringify(q)); }
  assert.equal(calls.length, 1);
});
test('search: حد العميل طلب في الثانية، وفاصل ثانية بين طلبات التطبيق كله إلى Nominatim', async () => {
  const { get, calls, tick } = mk();
  assert.equal((await get('/api/geo/search?q=one')).status, 200);
  const r = await get('/api/geo/search?q=two'); assert.equal(r.status, 429); assert.equal(r.headers.get('Retry-After'), '1'); assert.match((await r.json()).error, /انتظر/);
  assert.equal(calls.length, 1);
  tick(1200); assert.equal((await get('/api/geo/search?q=two')).status, 200);
  // عميل آخر مباشرة: يُؤخَّر الطلب حتى يمر ثانية على الطلب السابق (الساعة الوهمية تتقدم بمقدار الانتظار)
  const times = []; const m = mk({ fetchImpl: async () => { times.push(Date.now()); return Response.json([]); } });
  await m.get('/api/geo/search?q=aa', { ip: '9.9.9.1' }); await m.get('/api/geo/search?q=bb', { ip: '9.9.9.2' }); assert.equal(m.calls.length, 2);
});
test('search: التسلسل يفصل بين الطلبات المتزامنة بثانية على الأقل', async () => {
  let t = 5_000; const stamps = [];
  const geo = createGeo({ now: () => t, sleep: async ms => { t += ms; }, fetchImpl: async () => { stamps.push(t); return Response.json([]); } });
  const rq = (q, ip) => geo.fetch(new Request(ORIGIN + '/api/geo/search?q=' + q, { headers: { 'CF-Connecting-IP': ip } }), {});
  const rs = await Promise.all([rq('aa', '1'), rq('bb', '2'), rq('cc', '3')]);
  assert.deepEqual(rs.map(r => r.status), [200, 200, 200]);
  assert.equal(stamps.length, 3); assert.ok(t - 5000 >= 2000, `ثلاثة طلبات تحتاج ثانيتين على الأقل، مضى ${t - 5000}`); // الساعة الوهمية تتقدم بمقدار الانتظار فقط
  const many = await Promise.all(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((q, i) => rq(q, 'x' + i)));
  assert.ok(many.some(r => r.status === 503), 'الطابور محدود'); assert.ok(many.filter(r => r.status === 503).every(r => r.headers.get('Retry-After')));
});
test('search: مفتاح الإيقاف، فشل المصدر، استجابة مشوّهة', async () => {
  assert.equal((await mk().get('/api/geo/search?q=riyadh', {}, { GEO_NOMINATIM_OFF: 'true' })).status, 503);
  const f = mk({ fetchImpl: async () => new Response('x', { status: 500 }) }); const r = await f.get('/api/geo/search?q=riyadh'); assert.equal(r.status, 502); assert.match((await r.json()).error, /الإحداثيات/);
  const g = mk({ fetchImpl: async () => Response.json({ not: 'array' }) }); assert.equal((await g.get('/api/geo/search?q=riyadh')).status, 502);
  const h = mk({ fetchImpl: async () => Response.json([{ lat: 'x', lon: '1', display_name: 'bad' }, { lat: '95', lon: '1', display_name: 'bad2' }, { lat: '24', lon: '46', display_name: 'good' }]) });
  assert.deepEqual((await (await h.get('/api/geo/search?q=riyadh')).json()).results.map(x => x.name), ['good']);
  const p = await nominatim.search('q', { fetchImpl: async () => Response.json([]) }); assert.deepEqual(p, []);
});
test('الأصل والطريقة: أصل غريب 403، POST 405، نفس الأصل مسموح', async () => {
  const { get } = mk();
  assert.equal((await get('/api/geo/providers', { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await get('/api/geo/providers', { headers: { Origin: ORIGIN } })).status, 200);
  const r = await get('/api/geo/search?q=riyadh', { method: 'POST' }); assert.equal(r.status, 405);
});

// ---- الروابط القصيرة
const redirect = (loc, status = 302) => new Response(null, { status, headers: { Location: loc } });
const SHORT = 'https://maps.app.goo.gl/AbCdEf123';
test('resolve: يتبع التحويل ويعيد الإحداثيات فقط ولا يفتح نطاق جوجل', async () => {
  const { get, calls } = mk({ fetchImpl: async () => redirect('https://www.google.com/maps/place/X/@24.7,46.6,17z/data=!3d24.7743!4d46.7386') });
  const res = await get('/api/geo/resolve?u=' + encodeURIComponent(SHORT)); assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { lat: 24.7743, lng: 46.7386 });
  assert.equal(calls.length, 1); assert.equal(calls[0].u, SHORT); assert.equal(calls[0].o.redirect, 'manual');
});
test('resolve: سلسلة تحويلات داخل القائمة (goo.gl ← maps.app.goo.gl ← جوجل) وتخزين النتيجة', async () => {
  const seq = ['https://maps.app.goo.gl/zzz', 'https://www.google.com/maps?q=24.7136,46.6753']; let i = 0;
  const { get, calls, tick } = mk({ fetchImpl: async () => redirect(seq[i++]) });
  const u = '/api/geo/resolve?u=' + encodeURIComponent('https://goo.gl/maps/abc');
  assert.deepEqual(await (await get(u)).json(), { lat: 24.7136, lng: 46.6753 }); assert.equal(calls.length, 2); assert.equal(calls[1].u, 'https://maps.app.goo.gl/zzz');
  tick(1500); assert.deepEqual(await (await get(u)).json(), { lat: 24.7136, lng: 46.6753 }); assert.equal(calls.length, 2);
  const m = mk({ fetchImpl: async () => redirect('https://www.google.com/maps/@24.7,46.6,15z') }); assert.equal((await (await m.get('/api/geo/resolve?u=' + encodeURIComponent(SHORT))).json()).approx, true);
});
test('resolve: SSRF — نطاقات خارج القائمة وIP وlocalhost ومنافذ وبيانات اعتماد كلها تُرفض قبل أي fetch', async () => {
  const { get, calls, tick } = mk();
  for (const u of ['http://127.0.0.1/maps', 'http://localhost/x', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/x', 'http://10.0.0.1/', 'https://evil.com/https://maps.app.goo.gl/x', 'https://maps.app.goo.gl.evil.com/x', 'https://user:pw@maps.app.goo.gl/x', 'https://maps.app.goo.gl:444/x', 'https://goo.gl/other', 'https://g.co/x', 'file:///etc/passwd', 'ftp://maps.app.goo.gl/x', 'https://www.google.com/maps/@1,2,3z', '', 'maps.app.goo.gl']) {
    tick(1500); const r = await get('/api/geo/resolve?u=' + encodeURIComponent(u));
    if (u === 'maps.app.goo.gl') { assert.equal(r.status, 400, u); continue; } // بلا مسار: ليس رابطًا مختصرًا
    assert.equal(r.status, 400, u); assert.equal((await r.json()).code, 'LINK_NOT_ALLOWED');
  }
  assert.equal(calls.length, 0);
});
test('resolve: تحويل إلى نطاق غير مسموح أو IP أو localhost لا يُتبع ولا يُطلب', async () => {
  for (const loc of ['http://169.254.169.254/latest', 'http://localhost:8787/admin', 'https://evil.example/redirect', 'http://127.0.0.1/', 'https://[::1]/', 'ftp://x/y', 'javascript:alert(1)']) {
    const { get, calls } = mk({ fetchImpl: async () => redirect(loc) });
    const r = await get('/api/geo/resolve?u=' + encodeURIComponent(SHORT)); assert.equal(r.status, 422, loc); assert.equal((await r.json()).code, 'NO_COORDINATES');
    assert.equal(calls.length, 1, loc); assert.equal(calls[0].u, SHORT);
  }
});
test('resolve: حد 5 تحويلات، لا تحويل، 200 بلا إحداثيات، مهلة/خطأ شبكة', async () => {
  const loop = mk({ fetchImpl: async () => redirect('https://maps.app.goo.gl/next') });
  const r = await loop.get('/api/geo/resolve?u=' + encodeURIComponent(SHORT)); assert.equal(r.status, 422); assert.equal((await r.json()).code, 'TOO_MANY_REDIRECTS'); assert.equal(loop.calls.length, 6);
  assert.equal((await mk({ fetchImpl: async () => new Response('<html>', { status: 200 }) }).get('/api/geo/resolve?u=' + encodeURIComponent(SHORT))).status, 422);
  const net = await mk({ fetchImpl: async () => { throw new Error('boom'); } }).get('/api/geo/resolve?u=' + encodeURIComponent(SHORT)); assert.equal(net.status, 502); assert.equal((await net.json()).code, 'RESOLVE_FAILED');
  const slow = mk({ limits: { ...(await import('../worker/geo.mjs')).GEO_LIMITS, hopTimeoutMs: 20 }, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  assert.equal((await slow.get('/api/geo/resolve?u=' + encodeURIComponent(SHORT))).status, 502);
});
test('resolve: الاستجابة إحداثيات فقط (لا ترويسات ولا روابط ولا نص الصفحة)', async () => {
  const { get } = mk({ fetchImpl: async () => redirect('https://www.google.com/maps?q=24.7136,46.6753&secret=abc') });
  const t = await (await get('/api/geo/resolve?u=' + encodeURIComponent(SHORT))).text(); assert.deepEqual(Object.keys(JSON.parse(t)), ['lat', 'lng']); assert.ok(!/secret|google/.test(t));
});
test('resolve: حد العميل (طلب/ثانية)', async () => {
  const { get } = mk({ fetchImpl: async () => redirect('https://www.google.com/maps?q=24.7136,46.6753') });
  assert.equal((await get('/api/geo/resolve?u=' + encodeURIComponent(SHORT + '1'))).status, 200);
  const r = await get('/api/geo/resolve?u=' + encodeURIComponent(SHORT + '2')); assert.equal(r.status, 429);
});
