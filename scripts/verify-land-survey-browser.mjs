import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const playwright = await import(process.env.MIZAN_PLAYWRIGHT_PATH || 'playwright');
const { chromium } = playwright.default || playwright;

const evidence = resolve('evidence/land-survey'); await mkdir(evidence, { recursive: true });
const root = resolve('dist'), types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), path = resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
    if (!path.startsWith(root + '/')) throw Error('path');
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => {
  window.__geolocationCalls = 0;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition() { window.__geolocationCalls++; }, watchPosition() { window.__geolocationCalls++; } } });
});
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
const three = await readFile('/tmp/mizan-three-0.160.0.min.js');
await context.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js', route => route.fulfill({ contentType: 'text/javascript', body: three }));
await context.route('https://*.workers.dev/**', route => route.abort());
const tileRequests = [];
await context.route('https://tile.openstreetmap.org/**', async route => {
  tileRequests.push(route.request().url());
  await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Test tile outage' });
});

const page = await context.newPage(), errors = [], steps = [];
page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
const step = async (name, fn) => { await fn(); steps.push({ name, status: 'PASS' }); console.log('PASS:', name); };
const tab = async name => { await page.locator(`[data-tab="${name}"]`).click(); await page.locator(`#panel-${name}.on`).waitFor(); };
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal viewport overflow');
const save = async name => {
  const pending = page.waitForEvent('download'); await page.locator('#saveProject').click(); const download = await pending;
  const path = resolve(evidence, name); await download.saveAs(path); return JSON.parse(await readFile(path, 'utf8'));
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#panel-rating.on').waitFor(); await page.locator('#editLandSurvey').waitFor();
  await step('Land-first six-stage workflow does not request device location', async () => {
    assert.equal(await page.locator('#panel-rating.on').count(), 1); assert.equal(await page.locator('.tab').count(), 6);
    assert.equal(await page.evaluate(() => window.__geolocationCalls), 0); await noOverflow();
  });
  await step('OSM remains idle until the explicit consent is set, and a tile outage leaves local editing available', async () => {
    await page.locator('#editLandSurvey').click(); await page.locator('#landSurveyEditor').waitFor({ state: 'visible' });
    await page.locator('#surveyMapProvider').selectOption('osm'); await page.waitForTimeout(200); assert.equal(tileRequests.length, 0);
    assert.match(await page.locator('#surveyMapStatus').textContent(), /فعّل إقرار/);
    await page.locator('#surveyOsmConsent').check(); await page.locator('#surveyMapProvider').selectOption('osm');
    await page.waitForFunction(() => document.getElementById('surveyMapStatus').textContent.includes('تعذّر تحميل'));
    assert.ok(tileRequests.length > 0); assert.ok(tileRequests.every(url => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url)));
    await page.locator('#surveyMapProvider').selectOption('local');
    assert.match(await page.locator('#surveyMapStatus').textContent(), /الخلفية محلية/);
    await page.screenshot({ path: resolve(evidence, 'map-local-after-network-failure.png') });
  });
  await step('Draw, edit and measure a real four-corner WGS84 polygon with true-north bearings', async () => {
    await page.locator('#surveyAddCorner').click();
    let box = await page.locator('#parcelMap').boundingBox(); assert.ok(box);
    for (const [x, y] of [[.33, .32], [.67, .32], [.67, .68], [.33, .68]]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    assert.equal(await page.locator('#surveyCorners [data-coordinate="lat"]').count(), 4);
    const coords = [[24.7136, 46.6753], [24.7136, 46.6755], [24.7139, 46.6755], [24.7139, 46.6753]];
    for (let index = 0; index < coords.length; index++) {
      await page.locator(`[data-coordinate="lat"][data-point="${index}"]`).fill(String(coords[index][0]));
      await page.locator(`[data-coordinate="lon"][data-point="${index}"]`).fill(String(coords[index][1]));
    }
    await page.locator('#surveyCorners [data-coordinate="lon"][data-point="3"]').press('Tab');
    const edges = await page.locator('.survey-edge-readout').allTextContents();
    assert.match(edges[0], /90\.0° من الشمال الحقيقي.*شرق/); assert.match(edges[1], /0\.0° من الشمال الحقيقي.*شمال/);
    assert.match(edges[2], /270\.0° من الشمال الحقيقي.*غرب/); assert.match(edges[3], /180\.0° من الشمال الحقيقي.*جنوب/);
    assert.match(await page.locator('#surveyMeasurementSummary').textContent(), /مساحة تقديرية/);
    await page.locator('#surveyCorners [data-reference="0"]').fill('20.1');
    await page.locator('#surveyCorners [data-reference="1"]').fill('33.3');
    await page.locator('#surveyCorners [data-reference="2"]').fill('20.1');
    await page.locator('#surveyCorners [data-reference="3"]').fill('33.3');
    const centerLat = page.locator('#surveyCorners [data-coordinate="lat"][data-point="0"]');
    await centerLat.fill('24.71361');
    await page.locator('#surveyCorners [data-coordinate="lon"][data-point="0"]').fill('46.6753');
    const boxCenter = await page.locator('#surveyCenterLat').inputValue(); assert.equal(boxCenter, '24.7136');
    await page.locator('#surveyCorners [data-remove="3"]').click(); assert.equal(await page.locator('#surveyCorners [data-coordinate="lat"]').count(), 3);
    await page.locator('#surveyClear').click(); assert.equal(await page.locator('#surveyCorners [data-coordinate="lat"]').count(), 0);
    await page.locator('#parcelMap').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#parcelMap').getAttribute('data-adding'), 'true');
    box = await page.locator('#parcelMap').boundingBox(); assert.ok(box);
    for (const [x, y] of [[.33, .32], [.67, .32], [.67, .68], [.33, .68]]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    for (let index = 0; index < coords.length; index++) {
      await page.locator(`[data-coordinate="lat"][data-point="${index}"]`).fill(String(coords[index][0]));
      await page.locator(`[data-coordinate="lon"][data-point="${index}"]`).fill(String(coords[index][1]));
    }
    for (let index = 0; index < coords.length; index++) await page.locator(`[data-reference="${index}"]`).fill(String([20.1, 33.3, 20.1, 33.3][index]));
    await page.locator('#surveyCorners [data-reference="3"]').press('Tab');
    await page.locator('#surveyCenterLat').fill('24.7136'); await page.locator('#surveyCenterLon').fill('46.6753');
    await page.locator('#surveyMapCenter').click(); await page.locator('#surveyApply').click();
    assert.match(await page.locator('#landSurveySummary').textContent(), /4 زاوية/);
    await page.locator('#surveyBindConfirmed').click();
    assert.equal(await page.locator('#len').inputValue(), '33.3'); assert.equal(await page.locator('#wid').inputValue(), '20.1');
    assert.match(await page.locator('#surveyGeneratorLink').textContent(), /أطوال مرجعية أدخلها المستخدم/);
    assert.match(await page.locator('#area').textContent(), /٦٦٩/);
  });
  await step('Save/import/reopen restores the exact editable polygon, confirmed measurements, view and binding', async () => {
    const saved = await save('confirmed-survey-project.json');
    assert.equal(saved.draft.landSurvey.geometry.coordinates[0].length, 5);
    assert.deepEqual(saved.draft.landSurvey.references, [20.1, 33.3, 20.1, 33.3]);
    assert.equal(saved.draft.landSurvey.engineLink, 'survey-rectangle'); assert.deepEqual(saved.modelLandSurvey, null);
    await page.locator('#projectFile').setInputFiles(resolve(evidence, 'confirmed-survey-project.json'));
    await page.waitForFunction(() => document.getElementById('projectStatus').textContent.includes('تم استيراد'));
    assert.equal(await page.locator('#len').inputValue(), '33.3'); assert.equal(await page.locator('#wid').inputValue(), '20.1');
    await page.locator('#editLandSurvey').click(); await page.locator('#landSurveyEditor').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#surveyCorners [data-coordinate="lat"]').count(), 4);
    assert.equal(await page.locator('#surveyCenterLat').inputValue(), '24.7136');
    await page.locator('#surveyCancel').click(); assert.equal(await page.locator('#landSurveyEditor').isVisible(), false);
    await page.locator('#editLandSurvey').click(); await page.locator('#landSurveyEditor').waitFor({ state: 'visible' });
    await page.locator('#surveyCorners [data-coordinate="lat"][data-point="0"]').fill('24.71361');
    await page.locator('#surveyCorners [data-coordinate="lat"][data-point="0"]').press('Tab');
    await page.locator('#surveyApply').click();
    assert.equal(await page.locator('#landSurveyEditor').isVisible(), false);
    assert.match(await page.locator('#surveyGeneratorLink').textContent(), /غير مرتبط/);
    await tab('design'); await page.locator('#gen').click(); await page.waitForFunction(() => !document.getElementById('gen').disabled);
    assert.match(await page.locator('#generationError').textContent(), /غير مرتبطة بالمولد/);
  });
  await step('Clear confirmation removes only the saved survey and preserves generator dimensions', async () => {
    await tab('rating'); await page.locator('#clearLandSurvey').click();
    assert.match(await page.locator('#landSurveySummary').textContent(), /لم تُحفظ حدود/);
    assert.equal(await page.locator('#len').inputValue(), '33.3'); assert.equal(await page.locator('#wid').inputValue(), '20.1');
  });
  await step('Phone and iPad-sized viewports reach the map editor without horizontal overflow', async () => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
      await page.setViewportSize(viewport); await tab('rating'); await page.locator('#editLandSurvey').scrollIntoViewIfNeeded(); await page.locator('#editLandSurvey').click();
      await page.locator('#landSurveyEditor').waitFor({ state: 'visible' }); await noOverflow();
      assert.ok(await page.locator('#parcelMap').isVisible()); await page.screenshot({ path: resolve(evidence, `map-${viewport.width}.png`) });
      await page.locator('#surveyCancel').click();
    }
  });
  assert.deepEqual(errors, []);
  await writeFile(resolve(evidence, 'browser-report.json'), JSON.stringify({ status: 'PASS', steps, pageErrors: errors, tileRequests, limitations: ['OSM requests intentionally returned HTTP 503 to verify offline fallback', 'Viewport simulations used Chromium; no physical iPad tested', 'No official parcel data source is configured'] }, null, 2) + '\n');
} catch (error) {
  await writeFile(resolve(evidence, 'browser-report.json'), JSON.stringify({ status: 'FAIL', steps, pageErrors: errors, error: error.stack, tileRequests }, null, 2) + '\n');
  await page.screenshot({ path: resolve(evidence, 'browser-failure.png'), fullPage: true }).catch(() => {}); throw error;
} finally {
  await browser.close(); await new Promise(resolveClose => server.close(resolveClose));
}
