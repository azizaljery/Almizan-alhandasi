import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { LocalD1, assetsStub, ORIGIN } from './fixtures/local-d1-admin.mjs';
import { invalidateSettings } from '../worker/site-settings.mjs';

const env = () => ({ DB: new LocalD1(), ASSETS: assetsStub({ '/admin.html': '<h1>admin</h1>', '/home.html': 'home' }) });
const get = (e, p, init = {}) => worker.fetch(new Request(ORIGIN + p, init), e, {});
test('التوجيه: /admin وconsent وnotice ومفاتيح التحكم تؤثر على photo وgeo', async () => {
  const e = env();
  assert.equal((await get(e, '/admin')).headers.get('x-robots-tag').includes('noindex'), true);
  assert.equal((await get(e, '/api/admin/overview')).status, 401);
  assert.equal((await get(e, '/api/site/notice')).status, 200);
  assert.deepEqual(await (await get(e, '/api/site/notice')).json(), { message: '' });
  e.DB.sqlite.exec("INSERT INTO site_settings VALUES ('maintenance_message','صيانة قصيرة','x'),('photo_enabled','0','x'),('geo_search_enabled','0','x')");
  invalidateSettings(e);
  assert.equal((await (await get(e, '/api/site/notice')).json()).message, 'صيانة قصيرة');
  const st = await (await get(e, '/api/photo/status')).json(); assert.equal(st.configured, false);
  const g = await get(e, '/api/geo/search?q=الرياض'); assert.equal(g.status, 503);
  assert.equal((await get(e, '/api/archive-consent/status')).status, 200);
  assert.equal((await get(e, '/api/archive/designs')).status !== 404, true);
});
test('بلا جدول الإعدادات: السلوك الحالي بلا تغيير (الصورة بلا AI غير مهيأة، البحث لا يوقفه شيء)', async () => {
  const e = { DB: new LocalD1({ withTables: false }), ASSETS: assetsStub({}) };
  assert.equal((await (await get(e, '/api/site/notice')).json()).message, '');
  assert.equal((await get(e, '/api/geo/providers')).status, 200);
});
