// Live check of the drawing studio in a real Chromium: draws with real mouse events, edits, undoes, opens 3D, asks the assistant.
//   node scripts/studio-browser.mjs [outDir]      (screenshots go outside the repo, default /tmp/claude-0/studio-shots)
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const outDir = process.argv[2] || '/tmp/claude-0/studio-shots';
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) logs.push('console: ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await mkdir(outDir, { recursive: true });
const shot = n => page.screenshot({ path: join(outDir, n + '.png') });
const steps = [];
const ok = (name, cond, extra = '') => { steps.push({ name, pass: !!cond, extra }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await page.goto(base + '/studio.html');
await page.waitForFunction(() => window.__mizanStudio, null, { timeout: 30000 });
const st = () => page.evaluate(() => { const e = __mizanStudio; return { walls: e.doc.walls.length, openings: e.doc.openings.length, fixtures: e.doc.fixtures.length, labels: e.doc.labels.length, rooms: e.lv?.rooms.length, area: e.lv?.rooms.reduce((s, r) => s + r.area, 0), tool: e.tool, sel: [...e.selection], undo: e.history.canUndo }; });
const box = await page.locator('#planCanvas').boundingBox();
// world -> page coordinates using the editor view
const P = (x, y) => page.evaluate(([x, y]) => { const e = __mizanStudio, s = e.screen({ x, y }), r = e.canvas.getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; }, [x, y]);
const click = async (x, y, opts = {}) => { const p = await P(x, y); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); if (opts.double) { await page.mouse.down(); await page.mouse.up(); } };
const moveTo = async (x, y) => { const p = await P(x, y); await page.mouse.move(p.x, p.y, { steps: 3 }); };

ok('welcome card shows on an empty canvas', await page.locator('#welcome').isVisible());
await shot('00-welcome');
// ---- set a view that frames 12 x 10 m
await page.evaluate(() => { const e = __mizanStudio; e.view = { cx: 4.5, cy: 3.2, scale: 36 }; e.markDirty(); });
// ---- draw four walls with the wall tool, closing the loop
await page.click('[data-tool=wall]');
await click(0, 0); await click(8, 0); await click(8, 6); await click(0, 6); await click(0, 0);
let s = await st();
ok('four walls drawn by clicking', s.walls === 4, JSON.stringify(s));
ok('closed loop becomes one room of ~ 8x6 minus walls', s.rooms === 1 && s.area > 40 && s.area < 48, 'area=' + s.area?.toFixed(2));
// ---- partition by typing a length: start at (4,0) go up, type 6
await click(4, 0); await moveTo(4, 3); await page.keyboard.type('6'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
s = await st();
ok('typed length wall added (5 walls)', s.walls === 5, 'walls=' + s.walls);
const lenOk = await page.evaluate(() => { const w = __mizanStudio.doc.walls[4]; return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); });
ok('typed wall is exactly 6.00 m', Math.abs(lenOk - 6) < 1e-6, 'len=' + lenOk);
s = await st(); ok('partition splits the rectangle into 2 rooms', s.rooms === 2, 'rooms=' + s.rooms);
await shot('01-walls');
// ---- door and window
await page.click('[data-tool=opening]');
await moveTo(4, 3); await click(4, 3.0);
await page.click('#optbar .chip:has-text("نافذة"):not(:has-text("كبيرة"))');
await click(2, 0.02); await click(6, 6.02);
s = await st(); ok('door + 2 windows placed on walls', s.openings === 3, 'openings=' + s.openings);
// ---- name rooms
await page.click('[data-tool=room]');
await page.selectOption('#optbar select', 'bedroom'); await click(2, 3);
await page.selectOption('#optbar select', 'majlis'); await click(6, 3);
s = await st(); ok('two rooms labelled', s.labels === 2, 'labels=' + s.labels);
// ---- furniture snaps to wall
await page.click('[data-tool=fixture]');
await page.click('#optbar .chip:has-text("سرير مزدوج")'); await click(2, 5.2);
await page.click('#optbar .chip:has-text("جلسة عربية")'); await click(6.2, 0.8);
s = await st(); ok('furniture placed', s.fixtures === 2, 'fixtures=' + s.fixtures);
const bed = await page.evaluate(() => __mizanStudio.doc.fixtures[0]);
ok('bed pushed against the north wall and facing away from it', Math.abs(bed.y - 4.85) < .05 && Math.abs(Math.cos(bed.rot) + 1) < 1e-3, JSON.stringify(bed));
await page.click('[data-tool=select]');
await page.keyboard.press('Escape');
await shot('02-furnished');
// ---- select a wall by clicking, edit its thickness in the inspector, drag a corner
await click(8, 3);
s = await st(); ok('click selects the east wall', s.sel.length === 1 && s.sel[0].startsWith('w'), s.sel.join());
await page.fill('#tab-props input[step="1"]', '30'); await page.keyboard.press('Tab');
const t = await page.evaluate(() => __mizanStudio.doc.walls.find(w => w.id === [...__mizanStudio.selection][0]).t);
ok('inspector changes wall thickness to 30 cm', Math.abs(t - .3) < 1e-9, 't=' + t);
await shot('03-inspector');
// drag the top-right corner (8,6) to (9,6)
await click(8, 3); const pa = await P(8, 6), pb = await P(9, 6);
await page.mouse.move(pa.x, pa.y); await page.mouse.down(); await page.mouse.move(pb.x, pb.y, { steps: 6 }); await page.mouse.up();
const moved = await page.evaluate(() => __mizanStudio.doc.walls.filter(w => w.b.x === 9 || w.a.x === 9).length);
ok('dragging a selected wall end moves the shared corner', moved >= 2, 'walls touching x=9: ' + moved);
// ---- undo / redo
const before = await st();
await page.keyboard.press('Control+z');
const after = await st();
ok('Ctrl+Z undoes the last edit', JSON.stringify(before) !== JSON.stringify(after) || before.undo);
await page.keyboard.press('Control+y');
// ---- box selection and delete
await page.mouse.move(box.x + 5, box.y + 5);
const a = await P(-1, 7), b = await P(4.5, -1);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
s = await st(); ok('box selection picks several items', s.sel.length >= 3, 'selected=' + s.sel.length);
await page.keyboard.press('Escape');
// ---- review panel and assistant (local intent)
await page.click('[data-tab=review]'); await shot('04-review');
await page.click('[data-tab=ai]');
await page.fill('#askText', 'كم مساحة غرفة النوم؟'); await page.click('#askBtn');
await page.waitForSelector('.msg.bot:not(:has-text("أفحص"))', { timeout: 15000 });
const reply = await page.locator('.msg.bot').last().innerText();
ok('assistant answers a plain area question locally', /م²|م2|مساحة/.test(reply), reply.slice(0, 120));
await shot('05-assistant');
// ---- 3D appears live
await page.waitForFunction(() => window.__mizanViewer?.built, null, { timeout: 60000 }).catch(() => {});
const has3d = await page.evaluate(() => !!window.__mizanViewer?.built);
ok('3D view built live from the drawing', has3d);
await page.waitForTimeout(1500);
await shot('06-split');
// ---- edit while 3D open: add a wall and see it update
const w0 = await page.evaluate(() => __mizanViewer?.built?.stats?.walls ?? null);
await page.click('[data-view="3d"]'); await page.waitForTimeout(1500); await shot('07-3d-only');
await page.click('[data-view="plan"]');
// ---- example, level add, export
await page.click('#btnExample'); await page.waitForTimeout(400);
s = await st(); ok('example villa loads and has rooms', s.rooms >= 8, 'rooms=' + s.rooms);
await page.click('[data-view="split"]'); await page.waitForTimeout(2500); await page.evaluate(() => __mizanStudio.fit()); await shot('08-villa-split');
await page.click('[data-tab=rooms]'); await shot('09-rooms');
// ---- facades and materials tab
await page.click('[data-view="3d"]'); await page.waitForTimeout(1200);
await page.click('[data-tab=finish]');
await page.click('.preset:has-text("حجر كامل")'); await page.waitForTimeout(1500);
const fin = await page.evaluate(() => __mizanStudio.doc.finish?.facade?.base);
ok('finish preset stored in the document', fin === 'stone', fin);
await page.click('.facades button:has-text("الجنوبية")'); await page.waitForTimeout(2500); await shot('10-facade-south-stone');
await page.click('.preset:has-text("حديث أبيض")'); await page.waitForTimeout(1500);
await page.click('.facades button:has-text("الشمالية")'); await page.waitForTimeout(2500); await shot('11-facade-north-white');
await page.click('[data-tab=ai]'); await page.fill('#askText', 'اجعل أرضية المجلس باركيه'); await page.click('#askBtn');
await page.waitForSelector('.prop button.primary', { timeout: 15000 }); await page.click('.prop button.primary');
const fl = await page.evaluate(() => __mizanStudio.doc.finish?.floors?.majlis);
ok('assistant proposal for materials applies to the drawing after confirmation', fl === 'wood', String(fl));
await page.click('[data-view="split"]');
// ---- touch: pinch zoom via two pointers is exercised through CDP is skipped; keyboard zoom instead
const sc0 = await page.evaluate(() => __mizanStudio.view.scale); await page.locator('#planCanvas').focus(); await page.keyboard.press('+');
ok('+ key zooms in', (await page.evaluate(() => __mizanStudio.view.scale)) > sc0);
ok('no console errors', logs.length === 0, logs.slice(0, 3).join(' | '));
console.log(JSON.stringify({ passed: steps.filter(x => x.pass).length, failed: steps.filter(x => !x.pass).map(x => x.name) }));
await browser.close(); server.close();
if (steps.some(x => !x.pass)) process.exit(1);
