// Real Chromium UI acceptance; no model mutations through test-only editor APIs.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/cua/lib/node_modules/playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, ignoreHTTPSErrors: true });
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(15000);
  page.on('dialog', dialog => dialog.accept());
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.MIZAN_URL || 'http://127.0.0.1:8766', { waitUntil: 'domcontentloaded' });
  console.error('loaded');
  await page.waitForFunction(() => !!window.mizanStudioAPI);
  const fixture = await page.evaluate(async () => {
    const { generateAlternatives, defaultRooms } = await import('./planner.mjs');
    const { encodeProject } = await import('./project.mjs');
    const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }, rooms = defaultRooms();
    const models = generateAlternatives(plot, rooms).models;
    const model = models.find(candidate => candidate.strategy === 'compact');
    return encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 0, vat: 0, idea: '', discovery: { likes: [], rejects: [], avoids: [], life: {} }, model, alternatives: models });
  });
  console.error('importing');
  await page.locator('#projectFile').setInputFiles({ name: 'editor-fixture.json', mimeType: 'application/json', buffer: Buffer.from(fixture) });
  await page.waitForFunction(() => window.mizanStudioAPI.getState().hasModel && !document.querySelector('#gen').disabled);
  console.error('imported', await page.locator('#projectStatus').textContent());
  if (await page.locator('#cinematicSkip').isVisible()) {
    try { await page.locator('#cinematicSkip').click({ timeout: 1000 }); } catch { /* The cinematic may finish while the click is being actioned. */ }
  }
  if (await page.locator('#studioAdvancedToggle').isVisible()) await page.locator('#studioAdvancedToggle').click();
  await page.locator('[data-tab=result]').click();
  await page.locator('#togglePlanEditor').click();
  const ui = page.locator('#geometryEditorHost');
  await ui.locator('[data-ge=target]').selectOption('wall:wall-6');
  const state = () => page.evaluate(() => window.mizanStudioAPI.getState());
  const original = await state();
  assert.equal(original.alternativeCount, 3);
  const downloadedAlternativeCount = async () => {
    const downloading = page.waitForEvent('download'); await page.locator('#saveProject').click();
    const download = await downloading, text = await readFile(await download.path(), 'utf8');
    return page.evaluate(async text => (await import('./project.mjs')).decodeProject(text).alternatives.length, text);
  };
  await ui.locator('[data-ge=delta]').fill('0.20'); await ui.locator('[data-ge=preview]').click();
  assert.deepEqual((await state()).model, original.model, 'numeric preview must not mutate model');
  assert.match(await ui.locator('[data-ge=impact]').textContent(), /بدائل|البدائل/, 'preview explicitly explains effect on alternatives');
  assert.equal(await ui.locator('[data-ge=confirm]').isEnabled(), true, await ui.locator('[data-ge=impact]').textContent());
  await ui.locator('[data-ge=delta]').fill('0.25');
  assert.equal(await ui.locator('[data-ge=confirm]').isEnabled(), false, 'changing numeric input invalidates prior preview');
  await ui.locator('[data-ge=delta]').fill('0.20'); await ui.locator('[data-ge=preview]').click();
  await ui.locator('[data-ge=confirm]').click();
  const committed = await state();
  assert.notDeepEqual(committed.model.rooms, original.model.rooms);
  assert.equal(committed.geometry.revision, original.geometry.revision + 1);
  assert.equal(committed.alternativeCount, 1);
  assert.equal(await downloadedAlternativeCount(), 1, 'area-edited model downloads without incompatible alternatives');
  evidence.push('numeric wall preview immutable, explicit confirm changes geometry; saved active alternatives reduce from3to1');
  await ui.locator('[data-ge=undo]').click(); assert.deepEqual((await state()).model.rooms, original.model.rooms);
  assert.equal((await state()).alternativeCount, 3); assert.equal(await downloadedAlternativeCount(), 3);
  await ui.locator('[data-ge=redo]').click(); assert.deepEqual((await state()).model.rooms, committed.model.rooms);
  assert.equal((await state()).alternativeCount, 1); assert.equal(await downloadedAlternativeCount(), 1);
  evidence.push('undo and redo restore exact room rectangles');
  const beforeLayer = await state(); await ui.locator('[data-ge=layer]').uncheck();
  assert.equal(await page.locator('[data-geometry-editor-overlay]').count(), 0);
  assert.deepEqual((await state()).model, beforeLayer.model); await ui.locator('[data-ge=layer]').check();
  evidence.push('layer toggle hides only overlay');
  // Exercise actual pointer capture on the rendered wall, then explicit cancel.
  await ui.locator('[data-ge=target]').selectOption('wall:wall-6');
  await page.locator('#plan').scrollIntoViewIfNeeded();
  const wallClientPoint = () => page.evaluate(() => {
    const svg = document.querySelector('#plan svg'), wall = window.mizanStudioAPI.getState().model.walls.find(w => w.id === 'wall-6');
    const at = t => { const p = svg.createSVGPoint(); p.x = wall.x1 + (wall.x2 - wall.x1) * t; p.y = -(wall.y1 + (wall.y2 - wall.y1) * t); return p.matrixTransform(svg.getScreenCTM()); };
    const p = at(.7); const matrix = svg.getScreenCTM();
    return { x: p.x, y: p.y, dx: Math.abs(wall.x2 - wall.x1) < .001 ? matrix.a * -.1 : 0, dy: Math.abs(wall.x2 - wall.x1) < .001 ? 0 : matrix.d * .1 };
  });
  const wallPoint = await wallClientPoint();
  const beforeDrag = await state();
  await page.mouse.move(wallPoint.x, wallPoint.y); await page.mouse.down();
  await page.mouse.move(wallPoint.x + wallPoint.dx, wallPoint.y + wallPoint.dy, { steps: 5 }); await page.mouse.up();
  assert.deepEqual((await state()).model, beforeDrag.model);
  assert.equal(await ui.locator('[data-ge=confirm]').isEnabled(), true, 'pointerup retains valid preview');
  await ui.locator('[data-ge=cancel]').click(); assert.deepEqual((await state()).model, beforeDrag.model);
  evidence.push('real mouse wall drag previews; pointerup does not commit; cancel restores');
  await page.locator('#plan').scrollIntoViewIfNeeded();
  const confirmDragPoint = await wallClientPoint(), beforeConfirmedDrag = await state();
  await page.mouse.move(confirmDragPoint.x, confirmDragPoint.y); await page.mouse.down();
  await page.mouse.move(confirmDragPoint.x + confirmDragPoint.dx, confirmDragPoint.y + confirmDragPoint.dy, { steps: 8 }); await page.mouse.up();
  assert.deepEqual((await state()).model, beforeConfirmedDrag.model);
  await ui.locator('[data-ge=confirm]').click();
  const afterConfirmedDrag = await state();
  assert.equal(afterConfirmedDrag.geometry.undoDepth, beforeConfirmedDrag.geometry.undoDepth + 1, 'many pointermove events commit exactly one undo entry');
  await ui.locator('[data-ge=undo]').click(); assert.deepEqual((await state()).model.rooms, beforeConfirmedDrag.model.rooms);
  await ui.locator('[data-ge=redo]').click(); assert.deepEqual((await state()).model.rooms, afterConfirmedDrag.model.rooms);
  evidence.push('second real mouse drag confirms once, undo/redo reproduce rectangles exactly');
  await ui.locator('[data-ge=delta]').fill('-0.05'); await ui.locator('[data-ge=preview]').click();
  const beforeWheel = await state();
  await page.locator('#plan').hover(); await page.mouse.wheel(0, 80);
  assert.equal(await ui.locator('[data-ge=confirm]').isEnabled(), false);
  assert.deepEqual((await state()).model, beforeWheel.model);
  evidence.push('wheel zoom cancels pending preview without geometry mutation');
  // Browser-dispatched touch PointerEvents exercise cancellation state, not browser gesture emulation.
  const cancellation = await page.evaluate(() => {
    const svg = document.querySelector('#plan svg'), wall = svg.querySelector('[data-ge-wall="wall-6"]');
    const before = JSON.stringify(window.mizanStudioAPI.getState().model);
    const box = wall.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    const fire = (target, type, id, dx = 0) => target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x + dx, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
    // Synthetic pointers cannot be captured by the browser; test uses normal capture logic through genuine mouse above.
    const originalCapture = svg.setPointerCapture; svg.setPointerCapture = () => {};
    fire(wall, 'pointerdown', 31); fire(svg, 'pointermove', 31, 7); fire(svg, 'pointercancel', 31);
    const canceled = document.querySelector('[data-ge=confirm]').disabled && before === JSON.stringify(window.mizanStudioAPI.getState().model);
    const nextWall = svg.querySelector('[data-ge-wall="wall-6"]');
    fire(nextWall, 'pointerdown', 41); fire(svg, 'pointermove', 41, 7); fire(svg, 'pointerdown', 42);
    const multi = document.querySelector('[data-ge=confirm]').disabled && before === JSON.stringify(window.mizanStudioAPI.getState().model);
    fire(svg, 'pointerup', 41); fire(svg, 'pointerup', 42);
    fire(svg, 'pointerdown', 51); fire(svg.querySelector('[data-ge-wall="wall-6"]'), 'pointerdown', 52);
    const reverseMulti = document.querySelector('[data-ge=confirm]').disabled && before === JSON.stringify(window.mizanStudioAPI.getState().model);
    fire(svg, 'pointerup', 51); fire(svg, 'pointerup', 52);
    svg.setPointerCapture = originalCapture;
    return { canceled, multi, reverseMulti };
  });
  assert.deepEqual(cancellation, { canceled: true, multi: true, reverseMulti: true }); evidence.push('browser PointerEvent cancel and second-touch paths preserve model');
  // Hosted opening dimensions are edited through the same visible panel.
  const openingId = committed.model.openings.find(o => o.wallId === 'wall-6')?.id || committed.model.openings.find(o => o.type === 'window').id;
  await ui.locator('[data-ge=target]').selectOption(`opening:${openingId}`);
  const beforeOpening = await state(), opening = beforeOpening.model.openings.find(o => o.id === openingId);
  await ui.locator('[data-ge=width]').fill(String(opening.w - .05)); await ui.locator('[data-ge=height]').fill(String(opening.h - .05)); await ui.locator('[data-ge=preview]').click();
  assert.equal(await ui.locator('[data-ge=confirm]').isEnabled(), true, await ui.locator('[data-ge=impact]').textContent());
  assert.deepEqual((await state()).model, beforeOpening.model);
  await ui.locator('[data-ge=confirm]').click();
  assert.equal((await state()).model.openings.find(o => o.id === openingId).h, Math.round((opening.h - .05) * 20) / 20);
  assert.equal((await state()).model.openings.find(o => o.id === openingId).w, Math.round((opening.w - .05) * 20) / 20);
  const afterOpening = await state();
  const volumes = await page.evaluate(async ({ before, after }) => { const { quantities } = await import('./planner.mjs'); return [quantities(before).wallVolume, quantities(after).wallVolume]; }, { before: beforeOpening.model, after: afterOpening.model });
  assert.ok(volumes[1] > volumes[0], 'smaller opening must increase measured wall volume');
  evidence.push('opening width and height preview, confirmation, measured wall-volume update');
  await page.waitForFunction(() => window.mizanStudioAPI.getState().renderedRevisions.three !== null, { timeout: 20000 });
  const webgl = await page.locator('#view canvas').evaluate(canvas => { const context = canvas.getContext('webgl2') || canvas.getContext('webgl'); return !!context && !context.isContextLost(); });
  assert.equal(webgl, true, 'live 3D canvas has an active WebGL context');
  const live = await state();
  assert.deepEqual(live.renderedRevisions, { plan: live.geometry.revision, three: live.geometry.revision, quantities: live.geometry.revision });
  evidence.push('2D, real 3D renderer and quantities consume identical committed revision');
  const saved = await state();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#saveProject').click(); const download = await downloadPromise;
  const serialized = await readFile(await download.path());
  await ui.locator('[data-ge=undo]').click();
  await page.locator('#projectFile').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: serialized });
  await page.waitForFunction(() => !document.querySelector('#gen').disabled);
  assert.deepEqual((await state()).model.rooms, saved.model.rooms);
  assert.deepEqual((await state()).model.openings, saved.model.openings);
  evidence.push('actual project download and file reimport preserve committed geometry');
  // Delay an actual worker result, then change only an opening while it is pending.
  // The program signature is unchanged, so this proves the revision/epoch guard.
  await page.route('**/layout-worker.mjs', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('async event => {', 'async event => { await new Promise(resolve => setTimeout(resolve, 4000));');
    await route.fulfill({ response, body });
  });
  await page.locator('#projectFile').setInputFiles({ name: 'late-result.json', mimeType: 'application/json', buffer: Buffer.from(fixture) });
  await page.waitForFunction(() => document.querySelector('#gen').disabled);
  await ui.locator('[data-ge=target]').selectOption(`opening:${openingId}`);
  const beforeLateEdit = await state(), priorOpening = beforeLateEdit.model.openings.find(o => o.id === openingId);
  await ui.locator('[data-ge=width]').fill(String(priorOpening.w - .05));
  await ui.locator('[data-ge=preview]').click();
  assert.equal(await ui.locator('[data-ge=confirm]').isEnabled(), true, await ui.locator('[data-ge=impact]').textContent());
  await ui.locator('[data-ge=confirm]').click();
  const duringImport = await state();
  assert.deepEqual(duringImport.program, beforeLateEdit.program, 'opening edit does not change the program signature');
  await page.waitForFunction(() => !document.querySelector('#gen').disabled);
  assert.deepEqual((await state()).model, duringImport.model, 'late worker must not overwrite the newer opening edit');
  assert.match(await page.locator('#projectStatus').textContent(), /تغيّرت المدخلات أثناء القراءة/);
  await page.unroute('**/layout-worker.mjs');
  evidence.push('late actual worker import cannot overwrite a newer opening-only committed revision');
  const sizes = await ui.locator('button,input[type=number],select').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({ control: node.dataset.ge, height: node.getBoundingClientRect().height })));
  assert.ok(sizes.every(item => item.height >= 44), JSON.stringify(sizes));
  await page.screenshot({ path: '/tmp/geometry-editor-browser.png', fullPage: false });
  console.log(JSON.stringify({ browser: 'Chromium', evidence, controlSizes: sizes, revisions: (await state()).renderedRevisions, errors }, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
