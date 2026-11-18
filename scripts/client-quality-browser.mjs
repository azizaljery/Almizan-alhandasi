// Local-only acceptance: compare the same 3D document, then reserve a delivery
// and prove a separate browser customer cannot deliver it. Uses isolated D1.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession } from '../dist/design-session.mjs';
import { serialize } from '../dist/draw/doc.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
const BASE = process.env.SITE_URL || 'http://127.0.0.1:4317';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw Error('This script reserves fixture designs: use only the local isolated preview.');
const OUT = process.env.QUALITY_EVIDENCE_DIR || '/workspace/almizan-quality-evidence'; await mkdir(OUT, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const land = { width: 25, length: 35, streets: ['s'], entries: ['s'], floors: 2 }, text = 'ابي دورين 4 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ ومقلط';
const requirements = extractRequirements(text, { counts: { bedrooms: 4, majlis: 2, baths: 5, kitchens: 1, halls: 1, dining: 1 } });
const result = await generateInitialDesign({ land, counts: requirements.counts, requirements, idea: text });
const session = createSession({ land, counts: requirements.counts, requirements, idea: text, result });
const state = { 'mizan.studio.doc.v1': serialize(result.doc), 'mizan.design.session.v1': JSON.stringify(session) };
await writeFile(OUT + '/fixture.json', JSON.stringify(state));
const executablePath = process.env.SMOKE_CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const results = [], errors = [];
const check = (name, ok, detail = null) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + JSON.stringify(detail) : '')); };
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/home.html'); await page.waitForTimeout(1800); await page.screenshot({ path: OUT + '/home.png', timeout: 90000 });
  await page.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, state);
  // Same document, style, camera, tier and sun in both versions.
  for (const prefix of (process.env.AFTER_ONLY === '1' ? [''] : ['/before', ''])) {
    const label = prefix ? 'before' : 'after';
    await page.goto(BASE + prefix + '/facade-j/index.html?src=studio&hq=1&style=S&q=low&samples=8&nav=1&cam=oblique&w=1280&h=800');
    await page.waitForFunction(() => globalThis.__FR?.ready, null, { timeout: 180000 });
    const info = await page.evaluate(() => ({ error: __FR.error, floors: __FR.floors, triangles: __FR.triangles, glError: __FR.glError, tier: __FR.tier }));
    check(label + ': real WebGL facade from the actual two-floor document', !info.error && info.floors === 2 && info.glError === 0, info);
    await page.evaluate(() => globalThis.__FR?.refiner?.cancel());
    await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/' + label + '-3d.png', timeout: 90000 });
    if (!prefix && !info.error) {
      const capture = await page.evaluate(async () => { const r = await __facadeHQ({ scale: 1, samples: 8 }); return { width: r.width, height: r.height, size: r.blob.size, samples: r.samples }; });
      check('HQ PNG encodes actual geometry', capture.size > 20000 && capture.samples >= 8, capture);
    }
  }
  await page.goto(BASE + '/design.html'); await page.waitForSelector('#btnApprove'); await page.screenshot({ path: OUT + '/design.png' });
  await page.goto(BASE + '/final.html'); await page.waitForSelector('#deliveryClaim');
  let downloaded = false; page.on('download', () => { downloaded = true; });
  await page.click('#epkGo'); await page.waitForTimeout(300);
  check('delivery ZIP is gated before reservation', !downloaded && /قبل تنزيل/.test(await page.locator('#deliveryStatus').innerText()));
  await page.click('#deliveryClaim'); await page.waitForFunction(() => /تم حجز/.test(document.querySelector('#deliveryStatus')?.textContent || ''), null, { timeout: 30000 });
  check('first customer gets a server-confirmed delivery receipt', /رقم التسليم/.test(await page.locator('#deliveryStatus').innerText()));
  await page.screenshot({ path: OUT + '/delivery.png' });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#epkGo')]);
  const filename = OUT + '/delivery-package.zip'; await download.saveAs(filename);
  check('reserved delivery produces an engineer ZIP', (await download.failure()) === null);
  await page.click('#deliveryNewClient'); await page.click('#deliveryClaim');
  await page.waitForFunction(() => /لعميل آخر/.test(document.getElementById('deliveryStatus')?.textContent || ''), null, { timeout: 30000 });
  check('copying a project for a new customer in the same browser does not transfer ownership', /لعميل آخر/.test(await page.locator('#deliveryStatus').innerText()));
  await page.click('#deliveryOriginalClient'); await page.click('#deliveryClaim');
  await page.waitForFunction(() => /تم حجز/.test(document.getElementById('deliveryStatus')?.textContent || ''), null, { timeout: 30000 });
  check('switching back preserves the original customer key', /تم حجز/.test(await page.locator('#deliveryStatus').innerText()));
  const [recovery] = await Promise.all([page.waitForEvent('download'), page.click('#deliveryRecovery')]);
  const privateRecoveryPath = await recovery.path();
  const verificationUrl = await page.locator('#deliveryStatus a').getAttribute('href');
  const verifyPage = await context.newPage(); await verifyPage.goto(verificationUrl);
  await verifyPage.waitForFunction(() => /إيصال صحيح/.test(document.getElementById('receiptState')?.textContent || ''));
  check('delivery receipt is verifiable without exposing the customer key', /إيصال صحيح/.test(await verifyPage.locator('#receiptState').innerText()));
  await writeFile(OUT + '/delivered-fixture.mizan.json', serialize(result.doc));
  await verifyPage.setInputFiles('#receiptFile', OUT + '/delivered-fixture.mizan.json');
  await verifyPage.waitForFunction(() => /الملف يطابق/.test(document.getElementById('fileState')?.textContent || ''));
  check('delivered drawing file matches its receipt', /الملف يطابق/.test(await verifyPage.locator('#fileState').innerText()));
  const foreign = await browser.newContext({ viewport: { width: 390, height: 844 } }), other = await foreign.newPage();
  await other.goto(BASE + '/home.html'); await other.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, state);
  await other.goto(BASE + '/final.html'); await other.waitForSelector('#deliveryClaim'); await other.click('#deliveryClaim');
  await other.waitForFunction(() => /لعميل آخر/.test(document.querySelector('#deliveryStatus')?.textContent || ''), null, { timeout: 30000 });
  check('another customer cannot deliver the reserved geometry', /لعميل آخر/.test(await other.locator('#deliveryStatus').innerText()));
  check('mobile delivery panel has no horizontal overflow', await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await other.screenshot({ path: OUT + '/reserved-mobile.png' });
  await other.setInputFiles('#deliveryImport', privateRecoveryPath);
  await other.waitForFunction(() => /تم حجز/.test(document.getElementById('deliveryStatus')?.textContent || ''), null, { timeout: 30000 });
  check('private recovery key restores the original customer reservation on another browser', /تم حجز/.test(await other.locator('#deliveryStatus').innerText()));
  check('no unhandled page errors', errors.length === 0, errors);
} finally { await browser.close(); await writeFile(OUT + '/browser-results.json', JSON.stringify(results, null, 2)); }
assert.ok(results.length >= 9 && results.every(r => r.ok), 'Some browser checks failed');
