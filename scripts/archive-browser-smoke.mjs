import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { decodeProject, quantitiesCSV } from '../dist/project.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const evidenceDir = resolve(fileURLToPath(new URL('../evidence/d1-archive-local', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const designs = [], versions = new Map();
const idempotencyResults = new Map(), writeRequests = [];
let nextId = 1, failNextWrite = false;
let loseNextWriteResponse = false;

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path.startsWith('/api/archive/')) return response.writeHead(404).end();
  const resolved = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!resolved.startsWith(root + sep) && resolved !== resolve(root, 'index.html')) return response.writeHead(403).end();
  try { response.writeHead(200, { 'content-type': mime[extname(resolved)] || 'application/octet-stream' }).end(await readFile(resolved)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address(), siteOrigin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/archive/session') return route.fulfill({ json: { authenticated: true, storageReady: true } });
    if (url.pathname === '/api/archive/designs' && route.request().method() === 'GET') return route.fulfill({ json: { designs, hasMore: false, nextCursor: null } });
    if (/^\/api\/archive\/designs\/[^/]+\/versions$/.test(url.pathname) && route.request().method() === 'GET') {
      const id = url.pathname.split('/')[4], rows = versions.get(id) || [];
      return route.fulfill({ json: { versions: rows.map(item => ({ version_number: item.version, created_at: Date.now(), engine_version: item.model.engineVersion, geometry_policy_version: 'mizan-novelty-v2' })).reverse() } });
    }
    const savedMatch = url.pathname.match(/^\/api\/archive\/designs\/([^/]+)\/versions\/(\d+)$/);
    if (savedMatch && route.request().method() === 'GET') {
      const [stored] = (versions.get(savedMatch[1]) || []).filter(item => item.version === Number(savedMatch[2]));
      if (!stored) return route.fulfill({ status: 404, json: { message: 'غير موجود' } });
      return route.fulfill({ json: { designId: savedMatch[1], title: stored.title, currentVersion: designs.find(item => item.id === savedMatch[1])?.current_version, version: stored.version, receiptId: stored.receiptId, project: stored.project, model: stored.model } });
    }
    const exportMatch = url.pathname.match(/^\/api\/archive\/designs\/([^/]+)\/exports\/(svg|csv)$/);
    if (exportMatch && route.request().method() === 'POST') {
      const id = exportMatch[1], kind = exportMatch[2], body = route.request().postDataJSON(), current = designs.find(item => item.id === id);
      const stored = (versions.get(id) || []).find(item => item.version === body.expectedVersion && item.receiptId === body.receiptId);
      if (!stored || current?.current_version !== body.expectedVersion) return route.fulfill({ status: 409, json: { error: 'archive_receipt_stale', message: 'الإيصال غير صالح للنسخة الحالية.' } });
      const project = decodeProject(stored.project);
      const text = kind === 'svg' ? buildPlanSVG(stored.model) : quantitiesCSV(stored.model, project.rates, project.costReserve, project.vat).replace(/^\uFEFF/, '');
      return route.fulfill({ status: 200, headers: { 'content-type': kind === 'svg' ? 'image/svg+xml; charset=utf-8' : 'text/csv; charset=utf-8', 'x-mizan-archive-receipt': stored.receiptId, 'x-mizan-archive-version': String(stored.version) }, body: text });
    }
    if (url.pathname === '/api/archive/designs' && route.request().method() === 'POST' || /^\/api\/archive\/designs\/[^/]+$/.test(url.pathname) && route.request().method() === 'PUT') {
      const body = route.request().postDataJSON(), create = route.request().method() === 'POST';
      const targetId = create ? '' : url.pathname.split('/')[4];
      const normalizedProject = JSON.parse(body.project); normalizedProject.savedAt = '';
      const context = { url: url.pathname, action: route.request().method(), targetId, expectedVersion: body.expectedVersion ?? null, title: body.title, project: JSON.stringify(normalizedProject) };
      writeRequests.push({ ...context, idempotencyKey: body.idempotencyKey });
      const previous = idempotencyResults.get(body.idempotencyKey);
      if (previous) {
        assert.deepEqual(context, previous.context, 'a retry must preserve the exact save operation and payload');
        return route.fulfill({ status: 200, json: previous.result });
      }
      if (failNextWrite) { failNextWrite = false; return route.fulfill({ status: 503, json: { error: 'archive_unavailable', message: 'تعذر الحفظ تجريبيًا؛ بقيت المدخلات على الشاشة.' } }); }
      const id = create ? `design-${nextId++}` : targetId;
      let entry = designs.find(item => item.id === id);
      if (create) { entry = { id, title: body.title, current_version: 0, created_at: Date.now(), updated_at: Date.now() }; designs.unshift(entry); versions.set(id, []); }
      entry.title = body.title; entry.current_version += 1; entry.updated_at = Date.now();
      const model = decodeProject(body.project).model;
      const receiptId = `${id}-receipt-v${entry.current_version}`;
      versions.get(id).push({ version: entry.current_version, title: entry.title, project: body.project, model, receiptId });
      const result = { designId: id, title: entry.title, version: entry.current_version, currentVersion: entry.current_version, receiptId };
      idempotencyResults.set(body.idempotencyKey, { context, result });
      if (loseNextWriteResponse) { loseNextWriteResponse = false; return route.abort('failed'); }
      return route.fulfill({ status: create ? 201 : 200, json: result });
    }
    if (route.request().url().startsWith(siteOrigin)) return route.continue();
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) return route.abort();
    return route.abort();
  });
  await page.goto(siteOrigin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#archiveStatus')?.textContent.includes('ولّد مخططًا أولًا'));
  await page.locator('[data-tab="design"]').click();
  await page.locator('#gen').click();
  await page.waitForFunction(() => document.querySelector('#out')?.style.display === 'block' && !document.querySelector('#exportPlan')?.disabled, { timeout: 30000 }).catch(() => {});
  await page.locator('#archivePanel > summary').click();
  assert.equal(await page.locator('#archiveSaveNew').isDisabled(), false, 'archive save is enabled after a current generated model');
  await page.locator('#archiveSaveNew').click();
  await page.waitForFunction(() => document.querySelector('#archiveStatus')?.textContent.includes('حُفظ التصميم في حسابك'));
  assert.equal(await page.locator('#exportPlan').isDisabled(), false, 'SVG export unlocks after archive save');
  const svgDownloadWait = page.waitForEvent('download');
  await page.locator('#exportPlan').click();
  const svgDownload = await svgDownloadWait;
  assert.equal(svgDownload.suggestedFilename(), 'mizan-handasi-plan.svg', 'SVG comes from the receipt checked export endpoint');
  results.push({ name: 'export requires a matching saved receipt and version', pass: true });
  results.push({ name: 'generate then archive enables current SVG export', pass: true });

  await page.locator('#vat').evaluate(element => { element.value = '17'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('#exportPlan')?.disabled === true);
  assert.equal(await page.locator('#exportBOQ').isDisabled(), true, 'CSV export locks after an unsaved change');
  await page.locator('#archiveSave').click();
  await page.waitForFunction(() => document.querySelector('#archiveStatus')?.textContent.includes('حُفظ التصميم في حسابك'));
  assert.equal(await page.locator('#exportBOQ').isDisabled(), false, 'CSV export unlocks after a versioned save');
  results.push({ name: 'dirty snapshot locks exports until next archive version', pass: true });

  await page.locator('#archiveVersions').selectOption('2');
  await page.locator('#archiveLoad').click();
  await page.waitForFunction(() => document.querySelector('#projectStatus')?.textContent.includes('تم فتح نسخة الحساب'));
  assert.equal(await page.locator('#exportPlan').isDisabled(), false, 'loading a stored exact version restores its export gate');
  results.push({ name: 'load an exact archived version and restore state', pass: true });

  await page.locator('#archiveVersions').selectOption('1');
  await page.locator('#archiveLoad').click();
  await page.waitForFunction(() => document.querySelector('#projectStatus')?.textContent.includes('تم فتح نسخة الحساب'));
  assert.equal(await page.locator('#exportPlan').isDisabled(), true, 'an older receipt cannot unlock exports after a newer version exists');
  results.push({ name: 'old saved version stays blocked from current export', pass: true });

  await page.locator('#vat').evaluate(element => { element.value = '18'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  loseNextWriteResponse = true;
  await page.locator('#archiveSave').click();
  await page.waitForFunction(() => document.querySelector('#archiveStatus')?.dataset.state === 'error');
  const beforeLostResponseRetry = writeRequests.at(-1);
  await page.locator('#archiveSave').click();
  await page.waitForFunction(() => document.querySelector('#archiveStatus')?.textContent.includes('حُفظ التصميم في حسابك'));
  assert.deepEqual(writeRequests.at(-1), beforeLostResponseRetry, 'lost-response retry repeats the same URL, method, target, version, payload, and key');
  assert.equal(versions.get(beforeLostResponseRetry.targetId).length, 3, 'a committed save with a lost response is not duplicated');
  results.push({ name: 'lost response retries the identical idempotent write without duplicating a version', pass: true });

  await page.locator('#vat').evaluate(element => { element.value = '19'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  failNextWrite = true;
  await page.locator('#archiveSave').click();
  await page.waitForFunction(() => document.querySelector('#archiveStatus')?.textContent.includes('تعذر الحفظ تجريبيًا'));
  assert.equal(await page.locator('#vat').inputValue(), '19', 'service failure preserves the user input');
  assert.equal(await page.locator('#exportPlan').isDisabled(), true, 'service failure keeps export locked');
  results.push({ name: 'service failure preserves edits and blocks export', pass: true });

  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#archivePanel').evaluate(element => { element.open = true; });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, panel: document.querySelector('.archive-panel-body').getBoundingClientRect().width }));
    assert.ok(dimensions.scroll <= dimensions.viewport + 1, `no page overflow at ${width}px: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.panel <= width - 20, `archive panel fits at ${width}px`);
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: `${evidenceDir}/archive-${width}.png` });
    results.push({ name: `archive layout at ${width}px`, pass: true, ...dimensions });
  }
  await page.close();
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
const report = { site: 'local static build; archive API mocked', tests: results.length, results };
await mkdir(evidenceDir, { recursive: true });
await writeFile(`${evidenceDir}/browser-report.json`, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
