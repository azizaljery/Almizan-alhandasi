// Real Chromium UI acceptance; no model mutations through test-only editor APIs.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/cua/lib/node_modules/playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, ignoreHTTPSErrors: true, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(15000);
  page.on('dialog', dialog => dialog.accept());
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const consoleErrors = []; page.on('console', message => { if (message.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|404 \(File not found\)/.test(message.text())) consoleErrors.push(message.text()); });
  const httpFailures = []; page.on('response', response => { if (response.status() >= 400) httpFailures.push({ status: response.status(), url: response.url() }); });
  await page.goto(process.env.MIZAN_URL || 'http://127.0.0.1:8766', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.mizanStudioAPI);
  const fixture = await page.evaluate(async () => {
    const { defaultRooms, validatePlot } = await import('./planner.mjs');
    const { runMultiEngineDesign } = await import('./multi-engine.mjs');
    const { encodeProject } = await import('./project.mjs');
    const plot = validatePlot({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }), rooms = defaultRooms();
    const result = await runMultiEngineDesign({ plot, rooms, selectedShape: 'rect', seed: 1 });
    const model = result.selectedModel, models = [model, ...result.models.filter(candidate => candidate.integration?.candidateId !== model.integration?.candidateId)].slice(0, 3);
    if (models.length !== 3) throw Error('CURRENT_ENGINE_EDITOR_FIXTURE_INVALID');
    return encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 0, vat: 0, idea: '', discovery: { likes: [], rejects: [], avoids: [], life: {} }, model, alternatives: models });
  });
  await page.locator('#projectFile').setInputFiles({ name: 'editor-fixture.json', mimeType: 'application/json', buffer: Buffer.from(fixture) });
  await page.waitForFunction(() => window.mizanStudioAPI.getState().hasModel && !document.querySelector('#gen').disabled);
  await page.evaluate(() => document.querySelector('#cinematicSkip')?.click());
  await page.waitForFunction(() => document.querySelector('#intro')?.classList.contains('off'));
  if (await page.locator('#cinematicSkip').isVisible()) {
    try { await page.locator('#cinematicSkip').click({ timeout: 1000 }); } catch { /* The cinematic may finish while the click is being actioned. */ }
  }
  const setup = page.locator('#studioLandDetails');
  if (!(await setup.evaluate(node => node.open))) await setup.locator('summary').first().click();
  await page.locator('#studioAdvancedToggle').click();
  await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('studio-advanced-open'));
  await page.locator('[data-tab=result]').click();
  const planTools = page.locator('#studioPlanTools');
  if (!(await planTools.evaluate(node => node.open))) await planTools.locator('summary').click();
  await page.locator('#togglePlanEditor').focus(); await page.locator('#togglePlanEditor').press('Enter');
  await page.waitForFunction(() => !document.querySelector('#planEditor').hidden);
  const ui = page.locator('#geometryEditorHost');
  await ui.locator('[data-ge=target]').selectOption('wall:wall-6');
  const state = () => page.evaluate(() => window.mizanStudioAPI.getState());
  const original = await state();
  assert.equal(original.alternativeCount, 3);
  const saveProjectLocally = async () => {
    await page.evaluate(() => {
      window.__saveProbe = { blobs: 0, anchorClicks: 0 };
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = value => { window.__saveProbe.blobs++; window.__saveProbe.blob = value; return create(value); };
      document.addEventListener('click', event => { if (event.target.closest?.('a[download]')) window.__saveProbe.anchorClicks++; }, true);
    });
    const downloading = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await page.evaluate(() => document.querySelector('#saveProject').click());
    const text = await page.evaluate(async () => window.__saveProbe.blob?.text() ?? null);
    const download = await downloading;
    if (!text) throw Error('PROJECT_BLOB_NOT_CREATED: ' + JSON.stringify(await page.evaluate(() => ({ probe: window.__saveProbe,
      status: document.querySelector('#projectStatus')?.textContent, generationDisabled: document.querySelector('#gen')?.disabled,
      saveDisabled: document.querySelector('#saveProject')?.disabled, editorHidden: document.querySelector('#planEditor')?.hidden }))));
    if (!download) evidence.push('browser blocked download event; project save Blob was captured and restored locally');
    else evidence.push('project save raised a real Chromium download event');
    return { text, alternatives: await page.evaluate(async text => (await import('./project.mjs')).decodeProject(text).alternatives.length, text), downloadEvent: !!download };
  };
  const downloadedAlternativeCount = async () => (await saveProjectLocally()).alternatives;
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
    const hit = svg.querySelector('[data-ge-wall="wall-6"]'), box = hit.getBoundingClientRect(), matrix = svg.getScreenCTM();
    const p = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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
  const controlSizes = await ui.locator('button,input[type=number],select').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({ control: node.dataset.ge, height: node.getBoundingClientRect().height })));
  assert.ok(controlSizes.every(item => item.height >= 44), JSON.stringify(controlSizes));
  const viewportEvidence = [];
  for (const viewport of [{ width: 768, height: 1024, label: 'tablet-portrait' }, { width: 390, height: 844, label: 'phone' }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(120);
    const layout = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth,
      editor: document.querySelector('#geometryEditorHost').getBoundingClientRect().width,
      controls: [...document.querySelectorAll('#geometryEditorHost button:not(:disabled),#geometryEditorHost input:not([type=checkbox]),#geometryEditorHost select')]
        .filter(node => node.getClientRects().length).map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })) }));
    assert.ok(layout.document <= layout.width + 1, `${viewport.label} horizontal overflow: ${JSON.stringify(layout)}`);
    assert.ok(layout.editor > 0 && layout.editor <= viewport.width, `${viewport.label} editor clipped: ${JSON.stringify(layout)}`);
    assert.ok(layout.controls.length > 0 && layout.controls.every(item => item.width > 0 && item.height >= 44), `${viewport.label} targets: ${JSON.stringify(layout.controls)}`);
    viewportEvidence.push({ label: viewport.label, viewportWidth: layout.width, documentWidth: layout.document, editorWidth: layout.editor, controls: layout.controls.length });
  }
  await page.locator('#plan').scrollIntoViewIfNeeded();
  const phoneTouchPoint = await wallClientPoint(), beforeTouch = await state();
  await page.evaluate(() => { window.__touchEvents = []; for (const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend']) document.addEventListener(type, e => window.__touchEvents.push({type:e.type,pointerType:e.pointerType,target:e.target.getAttribute?.('data-ge-wall'),x:e.clientX,y:e.clientY}), true); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 71, x: phoneTouchPoint.x, y: phoneTouchPoint.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 71, x: phoneTouchPoint.x + phoneTouchPoint.dx, y: phoneTouchPoint.y + phoneTouchPoint.dy }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual((await state()).model, beforeTouch.model, 'touch gesture previews without committing geometry');
  assert.equal(await ui.locator('[data-ge=confirm]').isEnabled(), true);
  await ui.locator('[data-ge=confirm]').click(); const afterTouch = await state();
  assert.equal(afterTouch.geometry.undoDepth, beforeTouch.geometry.undoDepth + 1);
  await ui.locator('[data-ge=undo]').click(); assert.deepEqual((await state()).model.rooms, beforeTouch.model.rooms);
  await cdp.detach(); await page.setViewportSize({ width: 1440, height: 1100 });
  evidence.push('Chromium touch drag at phone viewport previews, confirms once and undoes exactly');
  const saved = await state();
  const serialized = Buffer.from((await saveProjectLocally()).text);
  await ui.locator('[data-ge=undo]').click();
  await page.locator('#projectFile').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: serialized });
  await page.waitForFunction(() => !document.querySelector('#gen').disabled);
  assert.deepEqual((await state()).model.rooms, saved.model.rooms);
  assert.deepEqual((await state()).model.openings, saved.model.openings);
  evidence.push('captured project Blob decodes and file reimport preserves committed geometry');
  await page.screenshot({ path: '/tmp/geometry-editor-browser.png', fullPage: false });
  console.log(JSON.stringify({ browser: 'Chromium (Safari not run)', evidence, viewportEvidence, controlSizes, revisions: (await state()).renderedRevisions, errors, consoleErrors, httpFailures }, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.ok(httpFailures.every(item => item.url.endsWith('/api/archive/session')), JSON.stringify(httpFailures));
} finally { await browser.close(); }
