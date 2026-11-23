// واجهة القفل وتقرير الأثر: نموذج العرض النقي، ثم متصفح حقيقي (390 و1280): قفل مجموعة وغرفة، تعديل يمس مقفلًا → أسباب وتغييرات وأزرار موافقة/رفض صريحة،
// الرفض لا يغيّر شيئًا والموافقة تطبّق، أهداف لمس ≥ 44px، RTL، بلا تمرير أفقي.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, SESSION_KEY, currentDoc } from '../dist/design-session.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { lockParts, proposeChange } from '../dist/design-lock-edit.mjs';
import { lockableParts } from '../dist/design-lock.mjs';
import { lockModel, impactView, LOCK_GROUPS, STATUS_HEADLINE } from '../dist/design-lock-ui.mjs';

const text = '3 غرف نوم ومجلس رجال ومطبخ وصالة', land = { width: 25, length: 30, floors: 1, streets: ['s'], entries: ['s'] };
let memo = null;
async function base() {
  if (memo) return structuredClone(memo);
  const brief = buildBrief(text, { land }), first = await generateInitialDesign({ land, rooms: [], discovery: brief.discovery, idea: text, counts: brief.counts, requirements: brief.requirements });
  memo = createSession({ land, counts: brief.counts, requirements: brief.requirements, discovery: brief.discovery, idea: text, result: first }); return structuredClone(memo);
}
const LOCK_TYPES = ['majlis', 'living', 'bedroom', 'master', 'bath', 'dining', 'corridor', 'entrance'];

test('نموذج القفل: مجموعات وعدّادات وحالة كل غرفة، والقفل القديم لتصميم آخر يظهر «غير مطابق»', { timeout: 120000 }, async () => {
  const s = await base(), doc = currentDoc(s), m0 = lockModel(s, doc);
  assert.ok(m0.rooms.length > 10 && m0.lockedCount === 0 && m0.groups.length >= 4);
  assert.deepEqual(m0.groups.map(g => g.id).filter(id => LOCK_GROUPS.some(x => x.id === id)), m0.groups.map(g => g.id));
  const maj = m0.groups.find(g => g.id === 'majlis'); assert.equal(maj.total, 1); assert.equal(maj.allLocked, false);
  const s1 = lockParts(s, maj.ids), m1 = lockModel(s1, doc);
  assert.equal(m1.lockedCount, 1); assert.equal(m1.groups.find(g => g.id === 'majlis').allLocked, true); assert.equal(m1.rooms.find(r => r.type === 'majlis').state, 'locked');
  const stale = structuredClone(s1); stale.locks[0].net = stale.locks[0].net.map(p => ({ x: p.x + 1, y: p.y }));
  const m2 = lockModel(stale, doc); assert.deepEqual(m2.staleKeys, [stale.locks[0].key]); assert.equal(m2.rooms.find(r => r.type === 'majlis').state, 'stale'); assert.equal(m2.lockedCount, 0);
});
test('عرض الأثر: needsApproval يحمل الأسباب والتغييرات، والجدول بخمسة حقول، والصيغ الخمس لها عناوين', { timeout: 120000 }, async () => {
  const s = await base(), doc = currentDoc(s), ids = lockableParts(doc).filter(p => LOCK_TYPES.includes(p.type) && p.name !== 'المطبخ').map(p => p.id);
  const res = await proposeChange(lockParts(s, ids), { type: 'enlarge-room', target: 'المطبخ', gain: 3 });
  assert.equal(res.status, 'needsApproval'); const v = impactView(res);
  assert.ok(v.approval.reason && v.approval.changes.length >= 1 && v.approval.changes[0].reasons.length >= 1);
  assert.ok(v.rows.length > 0); for (const r of v.rows) for (const k of ['requirement', 'before', 'after', 'statusAr', 'evidence']) assert.ok(k in r, k);
  for (const st of ['applied', 'needsApproval', 'rejected', 'failed', 'unchanged']) assert.ok(STATUS_HEADLINE[st]);
  assert.equal(impactView(null), null); assert.equal(impactView({ status: 'failed', reason: 'س' }).hasRows, false);
});

const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
test('المتصفح (390 و1280): قفل، تعديل يمس مقفلًا، موافقة/رفض صريحان، أهداف 44px، بلا تمرير أفقي', { timeout: 280000 }, async t => {
  let chromium; try { ({ chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs')); } catch { return t.skip('Playwright غير متاح'); }
  const session = await base(), root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const server = http.createServer((req, res) => { const f = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!f.startsWith(root) || !existsSync(f) || extname(f) === '') { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = `http://127.0.0.1:${server.address().port}`;
  const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']; let browser;
  try { browser = await chromium.launch({ args }); } catch { try { browser = await chromium.launch({ args, executablePath: '/opt/pw-browsers/chromium' }); } catch { server.close(); return t.skip('تعذّر تشغيل Chromium'); } }
  try {
    for (const width of [390, 1280]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await page.goto(origin + '/design.html'); await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SESSION_KEY, JSON.stringify(session)]); await page.reload();
      await page.waitForSelector('#lockCard', { timeout: 30000 });
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('lockCard')).direction), 'rtl');
      for (const g of ['majlis', 'living', 'bedrooms', 'baths']) { await page.click(`[data-group="${g}"]`); await page.waitForTimeout(200); }
      for (const nm of ['صالة الطعام', 'مدخل العائلة', 'ممر الحديقة', 'مغاسل']) for (let k = 0; k < 2; k++) { const ok = await page.evaluate(n => { document.querySelector('#lockRoomsBox').open = true; const b = [...document.querySelectorAll('[data-room] button')].find(x => x.getAttribute('aria-label') === 'اقفل ' + n); if (!b) return false; b.click(); return true; }, nm); if (!ok) break; await page.waitForTimeout(200); }
      const small = await page.evaluate(() => [...document.querySelectorAll('#lockCard button,#lockCard select,#lockCard summary')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.textContent.trim().slice(0, 20)));
      assert.deepEqual(small, [], width + ': أهداف لمس أصغر من 44px');
      const before = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).designs.length, SESSION_KEY);
      await page.selectOption('#lockEnlargeTarget', { label: 'المطبخ' }); await page.click('#lockEnlarge'); await page.waitForSelector('#impactApproval', { timeout: 90000 });
      assert.equal(await page.evaluate(() => document.getElementById('impactCard').dataset.impactStatus), 'needsApproval');
      assert.ok(await page.evaluate(() => document.querySelectorAll('#impactChanges li').length >= 1 && document.getElementById('impactApproval').textContent.includes('الأسباب')));
      assert.ok(await page.evaluate(() => !!document.getElementById('impactApprove') && !!document.getElementById('impactReject')));
      const small2 = await page.evaluate(() => [...document.querySelectorAll('#impactCard button')].filter(e => e.getBoundingClientRect().height < 43.5).length); assert.equal(small2, 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': تمرير أفقي');
      await page.click('#impactReject'); await page.waitForTimeout(300);
      assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).designs.length, SESSION_KEY), before, 'الرفض لا يضيف تصميمًا');
      assert.equal(await page.evaluate(() => !!document.getElementById('impactCard')), false);
      await page.click('#lockEnlarge'); await page.waitForSelector('#impactApprove', { timeout: 90000 }); await page.click('#impactApprove'); await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).designs.length, SESSION_KEY), before + 1, 'الموافقة تضيف التصميم المعدّل');
      assert.equal(await page.evaluate(() => document.getElementById('impactCard')?.dataset.impactStatus), 'applied');
      await page.context().close();
    }
  } finally { await browser.close(); server.close(); }
});
