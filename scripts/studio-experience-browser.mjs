// Real UI acceptance, always executed in the local-browser CI job (no SKIP).
// Only an isolated preview is accepted; this never edits the deployed service.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serialize, parseDoc } from '../dist/draw/doc.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';

const base = (process.env.SITE_URL || 'http://127.0.0.1:4317').replace(/\/$/, '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Use an isolated local preview');
const out = process.env.STUDIO_EVIDENCE_DIR || join(process.env.QUALITY_EVIDENCE_DIR || 'evidence', 'studio');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], checks = [];
const check = (name, condition, detail) => { checks.push({ name, pass: !!condition, ...(detail ? { detail } : {}) }); console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`); assert.ok(condition, name); };
const ready = page => page.waitForFunction(() => globalThis.__mizanStudioExperience, null, { timeout: 30000 });
const documentOf = page => page.evaluate(() => JSON.parse(JSON.stringify(__mizanStudio.doc)));
async function point(page, x, y) {
  // A tool change can resize the option bar. Wait for layout/ResizeObserver and
  // the canvas paint before calculating pointer coordinates from that view.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(([x, y]) => { const editor = __mizanStudio, screen = editor.screen({ x, y }), bounds = editor.canvas.getBoundingClientRect(); return { x: bounds.left + screen.x, y: bounds.top + screen.y }; }, [x, y]);
}
async function clickWorld(page, x, y) { const p = await point(page, x, y); await page.mouse.click(p.x, p.y); }
async function example(page) { await page.locator('#studioProjectMenu summary').click(); await page.locator('#btnExample').click(); await page.waitForFunction(() => __mizanStudio.doc.fixtures.length === 19); }
async function pageIn(context) { const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); await page.goto(base + '/studio.html'); await ready(page); return page; }
try {
  let original, saved;
  if (!process.argv.includes('--mobile-only')) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  const page = await pageIn(context);
  check('Empty project starts with a clear guided entry', await page.locator('#welcome').isVisible());
  const quiet = await page.evaluate(() => { const e = __mizanStudio; return !e.opts.grid && !e.opts.axes && !e.opts.autoDims && !e.opts.dims; });
  check('Grid, axes and dimension chains are optional at startup', quiet);
  await page.locator('[data-tool="rect"]').click();
  await clickWorld(page, 2, 2); await clickWorld(page, 8, 7);
  await page.waitForFunction(() => __mizanStudio.doc.walls.length === 4);
  check('Draw a closed room using actual canvas pointer events', await page.evaluate(() => __mizanStudio.lv.rooms.length === 1));
  await page.locator('[data-tool="select"]').click(); await clickWorld(page, 5, 2);
  await page.waitForFunction(() => __mizanStudio.selection.size === 1);
  const length = page.locator('#tab-props .f').filter({ hasText: /^الطول/ }).locator('input');
  await length.fill('7.5'); await length.press('Tab');
  check('Selected wall length is editable in metres', (await documentOf(page)).walls.some(w => Math.abs(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) - 7.5) < .001));
  await page.locator('#undo').click();
  check('Undo restores the closed room after editing', await page.evaluate(() => __mizanStudio.lv.rooms.length === 1));
  await page.locator('[data-tool="fixture"]').click();
  await page.locator('#studioFurnitureSearch').fill('سرير');
  check('Furniture search filters real catalog cards', await page.locator('[data-fixture]').count() === 2);
  await page.locator('[data-fixture="bed-double"]').click(); await clickWorld(page, 5, 4);
  await page.waitForFunction(() => __mizanStudio.doc.fixtures.length === 1);
  await page.locator('[data-tool="select"]').click(); await clickWorld(page, 5, 4);
  await page.locator('#optbar button').filter({ hasText: 'تدوير 90' }).click();
  check('Rotate furniture through the normal editing history', Math.abs((await documentOf(page)).fixtures[0].rot - Math.PI / 2) < .001);
  await page.locator('#optbar button').filter({ hasText: 'تكرار' }).click();
  check('Duplicate furniture', (await documentOf(page)).fixtures.length === 2);
  await page.locator('#optbar button').filter({ hasText: 'حذف' }).click();
  await page.locator('#undo').click();
  check('Deleting and undoing preserve editable furniture', (await documentOf(page)).fixtures.length === 2);
  await example(page);
  original = await documentOf(page);
  await page.locator('#tgDims').click();
  check('Engineering display enables all dimension layers together', await page.evaluate(() => __mizanStudio.opts.dims && __mizanStudio.opts.autoDims && __mizanStudio.opts.axes));
  await page.locator('#tgDims').click(); await page.locator('#tgGrid').click(); await page.locator('#tgGrid').click();
  await page.locator('#studioRoomsShortcut').click(); await page.locator('#studioReviewShortcut').click();
  check('Review is reachable and annotations appear only while reviewing', await page.evaluate(() => document.getElementById('tab-review').classList.contains('on') && __mizanStudio.markers.length > 0));
  await page.locator('[data-tab="props"]').click();
  check('Review markers leave the working plan clean', await page.evaluate(() => __mizanStudio.markers.length === 0));
  await page.locator('#studioMoreTools summary').click();
  check('Less frequent drawing tools remain discoverable', await page.locator('[data-tool="stair"]').isVisible() && await page.locator('[data-tool="column"]').isVisible());
  await page.locator('#studioMoreTools summary').click();
  await page.locator('#studioHelp').click(); await page.waitForSelector('dialog[open]'); await page.keyboard.press('Escape');
  check('Help dialog closes and restores keyboard focus', await page.evaluate(() => document.activeElement.id === 'studioHelp'));
  assert.deepEqual(await documentOf(page), original);
  check('Changing tools, view flags and panels never changes project geometry', true);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btnSave').click()]);
  saved = await readFile(await download.path(), 'utf8');
  assert.equal(serialize(parseDoc(saved)), serialize(original));
  check('Downloaded JSON retains the complete editable document', true);
  await page.locator('#fileInput').setInputFiles({ name: 'round-trip.mizan.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  assert.deepEqual(await documentOf(page), original);
  check('Reopening the downloaded project preserves all geometry and identifiers', true);
  await page.waitForTimeout(2600); await page.screenshot({ path: join(out, 'after-desktop.png') });
  await page.locator('[data-tool="fixture"]').click(); await page.waitForTimeout(100); await page.screenshot({ path: join(out, 'furniture-desktop.png') });
  await page.locator('[data-tool="select"]').click(); await page.locator('[data-tab="props"]').click();
  await page.locator('[data-view="3d"]').click();
  await page.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 120000 });
  const preview = await page.evaluate(() => ({ rich: __mizanViewer.interior.rich, dressing: __mizanViewer.interior.on, mode: __mizanViewer.mode, stats: __mizanViewer.built.stats, boxes: __mizanViewer.built.fixtureBoxes.map(({ id, x, y, hw, hd }) => ({ id, x, y, hw, hd })) }));
  // Rugs deliberately have no collision box in the existing 3D engine.
  const expectedBoxes = original.fixtures.filter(f => f.kind !== 'rug').map(({ id, x, y, w, d }) => ({ id, x, y, hw: w / 2, hd: d / 2 }));
  assert.deepEqual(preview.boxes, expectedBoxes);
  check('3D uses detailed furniture with identical saved dimensions and no extra dressing', preview.rich && !preview.dressing, { ...preview, boxes: preview.boxes.length });
  check('First 3D view exposes the furnished interior', preview.mode === 'dollhouse');
  assert.deepEqual(await documentOf(page), original);
  await page.waitForTimeout(1600); await page.screenshot({ path: join(out, 'after-3d.png'), timeout: 90000 });
  await page.close(); await context.close();
  } else { original = sampleVilla(); saved = serialize(original); }
  for (const width of [360, 390, 820]) {
    const mobile = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    await mobile.addInitScript(doc => localStorage.setItem('mizan.studio.doc.v1', doc), saved);
    await mobile.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    const p = await pageIn(mobile); await p.waitForTimeout(600);
    const layout = await p.evaluate(() => { const e = __mizanStudio; return { overflow: document.documentElement.scrollWidth > innerWidth + 1, canvasWidth: e.W, canvasHeight: e.H, houseWidth: 12 * e.view.scale, houseHeight: 14 * e.view.scale, panelOpen: document.getElementById('app').dataset.panelOpen, targets: [...document.querySelectorAll('.top button')].filter(b => b.getBoundingClientRect().height > 0).map(b => b.getBoundingClientRect().height) }; });
    check(`${width}px: full-width plan fits the viewport without overflow`, !layout.overflow && layout.canvasWidth > width * .85 && Math.max(layout.houseWidth, layout.houseHeight) > Math.min(layout.canvasWidth, layout.canvasHeight) * .6 && layout.panelOpen === 'false', layout);
    check(`${width}px: header touch targets are at least 44px`, layout.targets.length && layout.targets.every(height => height >= 44), layout.targets);
    const controls = await p.locator('.floaters button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { id: button.id, left: r.left, right: r.right, height: r.height }; }));
    check(`${width}px: all six canvas controls remain fully reachable`, controls.length === 6 && controls.every(r => r.left >= 0 && r.right <= width && r.height >= 44), controls);
    await p.screenshot({ path: join(out, `after-${width}.png`) });
    await p.locator('[data-tool="fixture"]').click(); await p.locator('#studioFurnitureSearch').fill('كنبة'); await p.screenshot({ path: join(out, `furniture-${width}.png`) });
    await p.locator('[data-fixture="sofa-2"]').click();
    check(`${width}px: choosing furniture returns to the canvas`, await p.locator('#side').isHidden());
    await p.locator('[data-tool="select"]').click();
    // A real touch drag must not be interrupted by the inspector opening.
    const f = original.fixtures.find(fixture => fixture.kind.startsWith('sofa'));
    const a = await point(p, f.x, f.y), b = await point(p, f.x + .3, f.y + .3);
    const hit = await p.evaluate(({ x, y }) => ({ tag: document.elementFromPoint(x, y)?.tagName, tool: __mizanStudio.tool, scale: __mizanStudio.view.scale }), a);
    const cdp = await mobile.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 5, y: a.y + (b.y - a.y) * i / 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const moved = (await documentOf(p)).fixtures.find(current => current.id === f.id);
    check(`${width}px: touch selection and movement keep the plan usable`, await p.locator('#side').isHidden() && Math.hypot(moved.x - f.x, moved.y - f.y) > .1, { before: { x: f.x, y: f.y }, after: { x: moved.x, y: moved.y }, panelHidden: await p.locator('#side').isHidden(), hit });
    await p.locator('#undo').click();
    assert.deepEqual(await documentOf(p), original);
    await p.locator('#studioPanelToggle').click();
    check(`${width}px: explicit details button opens the sheet`, await p.locator('#side').isVisible());
    await p.locator('#studioPanelClose').click();
    await p.locator('#studioProjectMenu summary').click(); await p.locator('#studioHelpMenu').click();
    check(`${width}px: drawing help is available from the project menu`, await p.locator('dialog[open]').isVisible());
    await p.locator('.studio-help-close').click();
    await mobile.close();
  }
  check('No unhandled browser errors in the studio journeys', errors.length === 0, errors);
} finally {
  await writeFile(join(out, 'acceptance.json'), JSON.stringify({ mode: process.argv.includes('--mobile-only') ? 'mobile' : 'complete', checks, errors }, null, 2));
  await browser.close();
}
