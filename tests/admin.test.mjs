import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdmin, COOKIE, PAGE_HEADERS } from '../worker/admin.mjs';
import { hashPassword, verifyPassword, passwordStrength, KDF, safeEqual } from '../worker/admin-auth.mjs';
import { LocalD1, client, assetsStub, ORIGIN } from './fixtures/local-d1-admin.mjs';
import { createClientArchive } from '../worker/client-archive.mjs';
import { generateInitialDesign, normalizeLand } from '../dist/home-flow.mjs';
import { createSession } from '../dist/design-session.mjs';

const GOOD = 'ميزان-Alpha-Tree-7391!';
const mk = (extra = {}) => { const db = new LocalD1(); const env = { DB: db, ASSETS: assetsStub({ '/admin.html': '<html></html>', '/version.json': JSON.stringify({ commit: 'abcdef1234567890', builtAt: '2026-11-13T00:00:00Z' }) }), ...extra }; let t = 1_800_000_000_000; const admin = createAdmin({ now: () => t }); return { db, env, admin, c: client(admin, env), tick: ms => { t += ms; } }; };
const setup = async (x, pw = GOOD) => x.c.call('/api/admin/setup', { method: 'POST', body: { password: pw, confirm: pw } });

test('تجزئة كلمة السر: ملح عشوائي، تحقق صحيح/خاطئ، ومجموع التكرارات ≥ 210000', async () => {
  assert.ok(KDF.per * KDF.rounds >= 210_000 && KDF.per <= 100_000);
  const a = await hashPassword(GOOD), b = await hashPassword(GOOD);
  assert.notEqual(a.salt, b.salt); assert.notEqual(a.hash, b.hash);
  assert.ok(!JSON.stringify(a).includes(GOOD));
  assert.equal(await verifyPassword(GOOD, a), true); assert.equal(await verifyPassword(GOOD + 'x', a), false);
  assert.equal(await verifyPassword(GOOD, { ...a, params: '{bad' }), false);
  assert.equal(await safeEqual('abc', 'abc'), true); assert.equal(await safeEqual('abc', 'abd'), false); assert.equal(await safeEqual('abc', 'abcd'), false);
});
test('قوة كلمة السر: الحد 12 والشائع والتكرار', () => {
  assert.equal(passwordStrength('short1!').ok, false);
  assert.equal(passwordStrength('password1234').ok, false);
  assert.equal(passwordStrength('aaaaaaaaaaaaaa').ok, false);
  assert.equal(passwordStrength('123456789012').ok, false);
  const s = passwordStrength(GOOD); assert.ok(s.ok && s.score >= 3);
  assert.ok(passwordStrength('correct-horse-battery-staple-9').score >= 3);
});
test('غياب الجداول: no_db وكل المسارات 503 ولا وضع مفتوح', async () => {
  const db = new LocalD1({ withTables: false }), env = { DB: db }, c = client(createAdmin(), env);
  assert.equal((await c.call('/api/admin/state')).data.state, 'no_db');
  const r = await c.call('/api/admin/setup', { method: 'POST', body: { password: GOOD, confirm: GOOD } });
  assert.equal(r.status, 503);
  assert.equal((await c.call('/api/admin/overview')).status, 503);
  const none = client(createAdmin(), {}); assert.equal((await none.call('/api/admin/state')).data.state, 'no_db');
});
test('الإعداد الأول: تأكيد/ضعف/نجاح، والكوكي بخصائص __Host- الآمنة، وبعدها الإعداد مغلق', async () => {
  const x = mk();
  assert.equal((await x.c.call('/api/admin/state')).data.state, 'setup');
  assert.equal((await x.c.call('/api/admin/overview')).status, 401);
  assert.equal((await setup(x, 'weak')).status, 400);
  assert.equal((await x.c.call('/api/admin/setup', { method: 'POST', body: { password: GOOD, confirm: GOOD + '1' } })).data.error, 'mismatch');
  assert.equal((await x.c.call('/api/admin/setup', { method: 'POST', body: { password: GOOD, confirm: GOOD }, origin: 'https://evil.test' })).status, 403);
  const ok = await setup(x); assert.equal(ok.status, 201);
  const sc = ok.headers.get('set-cookie'); assert.ok(sc.startsWith(COOKIE + '=') && /Secure/.test(sc) && /HttpOnly/.test(sc) && /SameSite=Strict/.test(sc) && /Path=\//.test(sc) && !/Domain/i.test(sc));
  const row = x.db.sqlite.prepare('SELECT * FROM admin_auth').get();
  assert.ok(row.hash && row.salt && !JSON.stringify(row).includes(GOOD));
  assert.equal((await setup(x, GOOD + 'zz')).status, 409);
  assert.equal(x.db.sqlite.prepare('SELECT COUNT(*) n FROM admin_auth').get().n, 1);
  assert.equal((await x.c.call('/api/admin/state')).data.state, 'authed');
});
test('سباق طلبي إعداد متزامنين لا ينشئان حسابين', async () => {
  const x = mk(), c2 = client(x.admin, x.env);
  const [a, b] = await Promise.all([setup(x, GOOD), c2.call('/api/admin/setup', { method: 'POST', body: { password: GOOD + 'Q', confirm: GOOD + 'Q' } })]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(x.db.sqlite.prepare('SELECT COUNT(*) n FROM admin_auth').get().n, 1);
});
test('الجلسات: دخول، 401 بلا جلسة، CSRF وOrigin، انتهاء، تجديد منزلق', async () => {
  const x = mk(); await setup(x);
  await x.c.call('/api/admin/logout', { method: 'POST', body: {} });
  const c = client(x.admin, x.env);
  assert.equal((await c.call('/api/admin/login', { method: 'POST', body: { password: 'wrong-password-123' } })).status, 401);
  const l = await c.call('/api/admin/login', { method: 'POST', body: { password: GOOD } }); assert.equal(l.status, 200);
  assert.equal((await c.call('/api/admin/overview')).status, 200);
  assert.equal((await c.call('/api/admin/settings', { method: 'PUT', body: { key: 'photo_enabled', value: '0' }, headers: { 'x-csrf-token': 'bad' } })).data.error, 'csrf');
  assert.equal((await c.call('/api/admin/settings', { method: 'PUT', body: { key: 'photo_enabled', value: '0' }, origin: 'https://evil.test' })).status, 403);
  assert.equal((await c.call('/api/admin/settings', { method: 'PUT', body: { key: 'photo_enabled', value: '0' } })).status, 200);
  // بلا كوكي
  assert.equal((await c.call('/api/admin/overview', { useCookie: false })).status, 401);
  // التجديد المنزلق: بعد 7 ساعات + نشاط، ثم 7 ساعات أخرى لا تزال سارية
  x.tick(7 * 3600_000); assert.equal((await c.call('/api/admin/overview')).status, 200);
  x.tick(7 * 3600_000); assert.equal((await c.call('/api/admin/overview')).status, 200);
  x.tick(9 * 3600_000); assert.equal((await c.call('/api/admin/overview')).status, 401);
});
test('الحد المطلق 24 ساعة للجلسة رغم التجديد', async () => {
  const x = mk(); await setup(x);
  for (let i = 0; i < 4; i++) { x.tick(7 * 3600_000); await x.c.call('/api/admin/overview'); }
  x.tick(1000); assert.equal((await x.c.call('/api/admin/overview')).status, 401);
});
test('تحديد المحاولات: 5 فاشلة لكل عميل ثم 429 حتى مع كلمة صحيحة، وعميل آخر غير متأثر', async () => {
  const x = mk(); await setup(x); await x.c.call('/api/admin/logout', { method: 'POST', body: {} });
  const bad = ip => x.c.call('/api/admin/login', { method: 'POST', body: { password: 'wrong-password-123' }, ip });
  for (let i = 0; i < 5; i++) assert.equal((await bad('9.9.9.9')).status, 401);
  const locked = await x.c.call('/api/admin/login', { method: 'POST', body: { password: GOOD }, ip: '9.9.9.9' });
  assert.equal(locked.status, 429); assert.ok(locked.headers.get('retry-after'));
  assert.equal((await x.c.call('/api/admin/login', { method: 'POST', body: { password: GOOD }, ip: '8.8.8.8' })).status, 200);
  x.tick(16 * 60_000);
  assert.equal((await x.c.call('/api/admin/login', { method: 'POST', body: { password: GOOD }, ip: '9.9.9.9' })).status, 200);
});
test('القفل العالمي المتزايد بعد 20 فشلًا من عناوين مختلفة', async () => {
  const x = mk(); await setup(x); await x.c.call('/api/admin/logout', { method: 'POST', body: {} });
  for (let i = 0; i < 24; i++) await x.c.call('/api/admin/login', { method: 'POST', body: { password: 'wrong-password-123' }, ip: '10.0.0.' + i });
  const r = await x.c.call('/api/admin/login', { method: 'POST', body: { password: GOOD }, ip: '10.9.9.9' });
  assert.equal(r.status, 429);
  x.tick(20 * 60_000);
  assert.equal((await x.c.call('/api/admin/login', { method: 'POST', body: { password: GOOD }, ip: '10.9.9.9' })).status, 200);
});
test('تغيير كلمة السر: يتطلب الحالية، يبطل الجلسات الأخرى، القديمة لا تعمل', async () => {
  const x = mk(); await setup(x);
  const other = client(x.admin, x.env); await other.call('/api/admin/login', { method: 'POST', body: { password: GOOD } });
  assert.equal((await other.call('/api/admin/overview')).status, 200);
  const NEW = 'نخلة-Beta-River-5520#';
  assert.equal((await x.c.call('/api/admin/password/change', { method: 'POST', body: { current: 'wrongwrongwrong', password: NEW, confirm: NEW } })).status, 403);
  assert.equal((await x.c.call('/api/admin/password/change', { method: 'POST', body: { current: GOOD, password: NEW, confirm: NEW + 'x' } })).data.error, 'mismatch');
  assert.equal((await x.c.call('/api/admin/password/change', { method: 'POST', body: { current: GOOD, password: 'short', confirm: 'short' } })).data.error, 'weak');
  assert.equal((await x.c.call('/api/admin/password/change', { method: 'POST', body: { current: GOOD, password: NEW, confirm: NEW } })).status, 200);
  assert.equal((await other.call('/api/admin/overview')).status, 401);
  assert.equal((await x.c.call('/api/admin/overview')).status, 200);
  const c3 = client(x.admin, x.env);
  assert.equal((await c3.call('/api/admin/login', { method: 'POST', body: { password: GOOD } })).status, 401);
  assert.equal((await c3.call('/api/admin/login', { method: 'POST', body: { password: NEW } })).status, 200);
});
test('الحذف: يتطلب الكلمة والتأكيد، يغلق الإدارة 503، لا إعداد أول، ADMIN_REOPEN يعيد الإعداد', async () => {
  const x = mk(); await setup(x);
  assert.equal((await x.c.call('/api/admin/password/disable', { method: 'POST', body: { password: GOOD, confirmText: 'لا' } })).data.error, 'confirm');
  assert.equal((await x.c.call('/api/admin/password/disable', { method: 'POST', body: { password: 'wrongwrongwrong', confirmText: 'احذف' } })).status, 403);
  assert.equal((await x.c.call('/api/admin/password/disable', { method: 'POST', body: { password: GOOD, confirmText: 'احذف' } })).status, 200);
  const row = x.db.sqlite.prepare('SELECT * FROM admin_auth').get(); assert.equal(row.disabled, 1); assert.equal(row.hash, null);
  const c = client(x.admin, x.env);
  for (const [p, m, b] of [['/api/admin/state', 'GET'], ['/api/admin/overview', 'GET'], ['/api/admin/login', 'POST', { password: GOOD }], ['/api/admin/setup', 'POST', { password: GOOD, confirm: GOOD }]]) {
    const r = await c.call(p, { method: m, body: b }); assert.equal(r.status, 503, p); assert.equal(r.data.error, 'closed');
  }
  assert.equal(x.db.sqlite.prepare('SELECT COUNT(*) n FROM admin_sessions').get().n, 0);
  // ADMIN_REOPEN
  const env2 = { ...x.env, ADMIN_REOPEN: '1' }, c2 = client(x.admin, env2);
  assert.equal((await c2.call('/api/admin/state')).data.state, 'setup');
  assert.equal((await c2.call('/api/admin/setup', { method: 'POST', body: { password: 'weak', confirm: 'weak' } })).status, 400);
  assert.equal((await c2.call('/api/admin/setup', { method: 'POST', body: { password: GOOD + 'R', confirm: GOOD + 'R' } })).status, 201);
  assert.equal(x.db.sqlite.prepare('SELECT disabled FROM admin_auth').get().disabled, 0);
  // بعد الإعادة، ADMIN_REOPEN وحده لا يسمح بالإعداد مجددًا (الحساب فعّال)
  const c3 = client(x.admin, env2); assert.equal((await c3.call('/api/admin/state')).data.state, 'login');
  assert.equal((await c3.call('/api/admin/setup', { method: 'POST', body: { password: 'Another-Long-Pass-99!', confirm: 'Another-Long-Pass-99!' } })).status, 409);
});
test('ADMIN_REOPEN بلا حذف سابق لا يفتح الإعداد ولا يكسر الحساب الفعّال', async () => {
  const x = mk({ ADMIN_REOPEN: '1' }); assert.equal((await setup(x)).status, 201);
  const c = client(x.admin, x.env); assert.equal((await c.call('/api/admin/state')).data.state, 'login');
});
test('كل /api/admin/* ترجع 401 بلا جلسة (عدا state/login/setup) ولا تسرّب شيئًا', async () => {
  const x = mk(); await setup(x); const c = client(x.admin, x.env);
  for (const p of ['/overview', '/designs', '/designs.csv', '/designs/1', '/designs/bulk', '/settings', '/audit', '/sessions', '/export', '/session']) {
    const r = await c.call('/api/admin' + p); assert.equal(r.status, 401, p); assert.ok(!/hash|salt/.test(r.text)); assert.match(r.headers.get('cache-control'), /no-store/);
  }
  for (const p of ['/logout', '/password/change', '/password/disable', '/designs/delete', '/sessions/revoke-all']) assert.equal((await c.call('/api/admin' + p, { method: 'POST', body: {} })).status, 401, p);
  assert.equal((await c.call('/api/admin/login', { method: 'POST', body: { password: 'x'.repeat(20) } })).data.message, 'بيانات الدخول غير صحيحة.');
});
test('صفحة /admin: ترويسات CSP وnoindex وno-store ولا innerHTML في admin.mjs', async () => {
  const x = mk(); const r = await x.admin.fetch(new Request(ORIGIN + '/admin'), x.env);
  assert.equal(r.status, 200); for (const k of ['content-security-policy', 'x-robots-tag', 'cache-control']) assert.ok(r.headers.get(k), k);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/); assert.doesNotMatch(r.headers.get('content-security-policy'), /unsafe-inline|https?:/);
  assert.equal(PAGE_HEADERS['x-frame-options'], 'DENY');
  const { readFileSync } = await import('node:fs'); const src = readFileSync('dist/admin.mjs', 'utf8') + readFileSync('dist/admin.html', 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|https?:\/\//.test(src.replace(/<meta[^>]*>/g, '')));
});
test('مفاتيح التحكم: التحقق، الأثر، والتدقيق بلا أسرار', async () => {
  const x = mk(); await setup(x);
  const put = (key, value) => x.c.call('/api/admin/settings', { method: 'PUT', body: { key, value } });
  assert.equal((await put('nope', '1')).status, 400); assert.equal((await put('photo_daily_cap', '9999')).status, 400); assert.equal((await put('photo_daily_cap', 'abc')).status, 400);
  assert.equal((await put('photo_daily_cap', '25')).status, 200);
  const { effectiveEnv, readSettings } = await import('../worker/site-settings.mjs');
  let s = await readSettings(x.env, () => Date.now() + 1e9); // تجاوز الكاش
  assert.equal(effectiveEnv({ PHOTO_DAILY_CAP: '40' }, s.values).PHOTO_DAILY_CAP, '25');
  await put('photo_enabled', '0'); s = await readSettings(x.env, () => Date.now() + 2e9);
  assert.equal(effectiveEnv({}, s.values).PHOTO_DAILY_CAP, '0');
  await put('geo_search_enabled', '0'); s = await readSettings(x.env, () => Date.now() + 3e9);
  assert.equal(effectiveEnv({}, s.values).GEO_NOMINATIM_OFF, '1');
  assert.equal(effectiveEnv({ GEO_NOMINATIM_OFF: '1' }, defaultsOn()).GEO_NOMINATIM_OFF, '1'); // المتغير وحده يوقف
  await put('maintenance_message', '<img src=x onerror=alert(1)> صيانة  قصيرة');
  const got = (await x.c.call('/api/admin/settings')).data.values.maintenance_message; assert.ok(!/[<>]/.test(got) && got.includes('صيانة'));
  assert.equal((await put('maintenance_message', 'ي'.repeat(201))).status, 400);
  const audit = (await x.c.call('/api/admin/audit')).data.rows; assert.ok(audit.some(r => r.action === 'setting') && !JSON.stringify(audit).includes(GOOD));
  const ov = (await x.c.call('/api/admin/overview')).data; assert.equal(ov.version.commit, 'abcdef123456'); assert.equal(ov.services.photo.on, false);
});
function defaultsOn() { return { photo_enabled: '1', geo_search_enabled: '1', photo_daily_cap: '' }; }
test('غياب جدول الإعدادات: القيم الافتراضية بلا تغيير', async () => {
  const { readSettings, effectiveEnv } = await import('../worker/site-settings.mjs');
  const db = new LocalD1({ withTables: false }); const s = await readSettings({ DB: db }, () => 5); assert.equal(s.available, false);
  assert.deepEqual(effectiveEnv({ PHOTO_DAILY_CAP: '40', X: 1 }, s.values), { PHOTO_DAILY_CAP: '40', X: 1 });
  assert.equal((await readSettings({}, () => 5)).available, false);
});

// ------------------------------------------------------------------ الأرشيف بموافقة
async function sample() {
  const { land } = normalizeLand({ length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 1, geo: { lat: 24.7743123, lng: 46.7386123, north: 3, cityName: 'حي النرجس' } });
  const result = await generateInitialDesign({ land, idea: 'فيلا 3 غرف نوم ومجلس', counts: { bedrooms: 3, majlis: 1 } });
  const s = createSession({ land, counts: {}, requirements: result.requirements, discovery: null, idea: 'اسمي سعد وجوالي 0555555555', result });
  return { doc: JSON.parse(s.designs[0].doc), land, program: s.input.requirements, exterior: { style: 'S', tone: 'warm', notes: 'جوالي 0555555555' } };
}
const token = () => 'T'.repeat(10) + 'abcdefghijklmnopqrstuv0123456789_-';
test('أرشيف بموافقة: لا حفظ بلا consent=true حرفيًا', async () => {
  const x = mk(), arch = createClientArchive(), c = client(arch, x.env), s = await sample();
  for (const consent of [undefined, false, 'true', 1]) { const r = await c.call('/api/archive-consent/designs', { method: 'POST', body: { ...s, consent, token: token() } }); assert.equal(r.status, 403, String(consent)); }
  assert.equal(x.db.sqlite.prepare('SELECT COUNT(*) n FROM client_designs').get().n, 0);
});
test('أرشيف بموافقة: تقريب الإحداثيات، إسقاط النص الحر والاسم، ترقيم تسلسلي، حذف بالرمز، ولا ترقيم مُعاد', async () => {
  const x = mk(), arch = createClientArchive(), c = client(arch, x.env), s = await sample();
  const r1 = await c.call('/api/archive-consent/designs', { method: 'POST', body: { ...s, consent: true, token: token() } });
  assert.equal(r1.status, 201); assert.equal(r1.data.number, 'D-000001');
  const row = x.db.sqlite.prepare('SELECT * FROM client_designs WHERE id=1').get(); const p = JSON.parse(row.payload);
  assert.equal(p.land.geo.lat, 24.77); assert.equal(p.land.geo.lng, 46.74); assert.equal(row.geo_lat, 24.77);
  assert.equal(p.land.geo.cityName, undefined); assert.equal(p.doc.title, 'تصميم'); assert.deepEqual(p.doc.texts, []);
  assert.ok(!row.payload.includes('0555555555') && !row.payload.includes('سعد') && !row.payload.includes('24.7743') && !row.payload.includes('46.7386'));
  assert.equal(p.exterior.notes, undefined); assert.equal(p.exterior.style, 'S'); assert.equal(row.style, 'S');
  assert.ok(!/ip|address/i.test(Object.keys(row).join()));
  const r2 = await c.call('/api/archive-consent/designs', { method: 'POST', body: { ...s, consent: true, token: token() + 'Z' } }); assert.equal(r2.data.number, 'D-000002');
  const del = (id, t) => c.call('/api/archive-consent/designs/' + id, { method: 'DELETE', headers: { 'x-archive-token': t } });
  assert.equal((await del(1, 'W'.repeat(40))).status, 404);
  assert.equal((await del(1, token())).status, 200);
  assert.equal((await del(1, token())).status, 404);
  const r3 = await c.call('/api/archive-consent/designs', { method: 'POST', body: { ...s, consent: true, token: token() + 'Y' } }); assert.equal(r3.data.number, 'D-000003');
});
test('أرشيف بموافقة: حدود الحجم والمعدل والأصل والمخطط وإغلاق الاستقبال', async () => {
  const x = mk(), arch = createClientArchive(), c = client(arch, x.env), s = await sample();
  const post = (body, o = {}) => c.call('/api/archive-consent/designs', { method: 'POST', body: { consent: true, token: token(), ...body }, ...o });
  assert.equal((await post(s, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await post({ ...s, doc: { schema: 'x' } })).status, 400);
  assert.equal((await post({ ...s, land: { ...s.land, length: -1 } })).status, 400);
  assert.equal((await post({ ...s, token: 'short' })).status, 400);
  const big = structuredClone(s.doc); big.labels = Array.from({ length: 5000 }, (_, i) => ({ id: 'r' + i, level: 'L1', text: 'ب'.repeat(150), at: { x: 1, y: 1 } }));
  const huge = await c.call('/api/archive-consent/designs', { method: 'POST', body: { consent: true, token: token(), ...s, doc: big }, raw: false });
  assert.ok([400, 413].includes(huge.status));
  // المعدل: 6 ثم 429
  const c2 = client(arch, x.env); let last;
  for (let i = 0; i < 7; i++) last = await c2.call('/api/archive-consent/designs', { method: 'POST', body: { ...s, consent: true, token: token() + i }, ip: '5.5.5.5' });
  assert.equal(last.status, 429);
  // إغلاق الاستقبال
  await setup(x); await x.c.call('/api/admin/settings', { method: 'PUT', body: { key: 'archive_intake_closed', value: '1' } });
  const { invalidateSettings } = await import('../worker/site-settings.mjs'); invalidateSettings(x.env);
  assert.equal((await post(s, { ip: '6.6.6.6' })).status, 503);
  assert.equal((await c.call('/api/archive-consent/status')).data.open, false);
  // لا جدول
  const none = client(createClientArchive(), { DB: new LocalD1({ withTables: false }) });
  assert.equal((await none.call('/api/archive-consent/designs', { method: 'POST', body: { ...s, consent: true, token: token() } })).status, 503);
});
test('الإدارة: قائمة التصاميم مرتبة ترقيميًا (تصاعدي/تنازلي) مع بحث وCSV وحذف دفعة وعرض كامل', async () => {
  const x = mk(), arch = createClientArchive(), ac = client(arch, x.env), s = await sample(); await setup(x);
  for (let i = 0; i < 5; i++) await ac.call('/api/archive-consent/designs', { method: 'POST', body: { ...s, consent: true, exterior: { style: i % 2 ? 'N' : 'S' }, token: token() + i }, ip: '7.7.7.' + i });
  const asc = (await x.c.call('/api/admin/designs?order=asc&per=2&page=2')).data; assert.deepEqual(asc.rows.map(r => r.number), ['D-000003', 'D-000004']); assert.equal(asc.total, 5);
  const desc = (await x.c.call('/api/admin/designs?order=desc')).data; assert.equal(desc.rows[0].number, 'D-000005');
  assert.equal((await x.c.call('/api/admin/designs?q=D-000002')).data.rows.length, 1);
  assert.equal((await x.c.call('/api/admin/designs?style=N')).data.total, 2);
  assert.ok(!('payload' in desc.rows[0]));
  const csv = await x.c.call('/api/admin/designs.csv?order=asc'); assert.ok(csv.text.split('\r\n').length === 6 && csv.text.includes('D-000001'));
  const one = (await x.c.call('/api/admin/designs/3')).data; assert.equal(one.number, 'D-000003'); assert.ok(one.design.doc.levels.length);
  const bulk = (await x.c.call('/api/admin/designs/bulk?ids=1,2,999')).data; assert.equal(bulk.rows.length, 2);
  assert.equal((await x.c.call('/api/admin/designs/bulk?after=3')).data.rows.length, 2);
  assert.equal((await x.c.call('/api/admin/designs/2', { method: 'DELETE' })).data.deleted, 1);
  assert.equal((await x.c.call('/api/admin/designs/delete', { method: 'POST', body: { ids: [1, 3] } })).data.deleted, 2);
  assert.equal((await x.c.call('/api/admin/designs/delete', { method: 'POST', body: { ids: [] } })).status, 400);
  assert.equal((await x.c.call('/api/admin/designs')).data.total, 2);
  const ex = JSON.parse((await x.c.call('/api/admin/export')).text); assert.ok(!JSON.stringify(ex).includes('hash') && ex.designsIndex.length === 2);
});
