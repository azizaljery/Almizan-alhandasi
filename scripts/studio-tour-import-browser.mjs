// Live check, in a real Chromium, of (1) importing plans of the previous system into the studio and
// (2) the automatic 3D walkthrough with its WebM recording.
//   node scripts/studio-tour-import-browser.mjs [outDir]     (files go outside the repo, default /tmp/claude-0/tour-import)
// Needs: Playwright + Chromium (see CLAUDE notes), ffprobe/ffmpeg for inspecting the recorded video.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const outDir = process.argv[2] || '/tmp/claude-0/tour-import';
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- files a user would really have: a saved project of the previous system (3 plans), a bare model, junk
const planner = await import(pathToFileURL(join(root, 'planner.mjs')).href), projectLib = await import(pathToFileURL(join(root, 'project.mjs')).href);
const plot = planner.validatePlot({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }), rooms = planner.normalizeRooms(planner.defaultRooms());
const gen = strategy => planner.generateModel(plot, rooms, { strategy });
const main = gen('compact'), alt = gen('balanced'), older = gen('frontage');
const files = {
  project: join(outDir, 'old-project.json'), bare: join(outDir, 'old-model.json'), junk: join(outDir, 'junk.json'), notjson: join(outDir, 'broken.json'),
};
await writeFile(files.project, projectLib.encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 10, vat: 15, idea: '', model: main, alternatives: [alt], history: [{ model: older, palette: 'modern' }] }));
await writeFile(files.bare, JSON.stringify(alt));
await writeFile(files.junk, JSON.stringify({ hello: 'world' }));
await writeFile(files.notjson, '{ not json');

const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) logs.push('console: ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const steps = [];
const ok = (name, cond, extra = '') => { steps.push({ name, pass: !!cond }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const shot = n => page.screenshot({ path: join(outDir, n + '.png') });
const toastText = () => page.locator('#toast').innerText().catch(() => '');
const fresh = async () => { await page.goto(base + '/studio.html'); await page.evaluate(() => localStorage.clear()); await page.goto(base + '/studio.html'); await page.waitForFunction(() => window.__mizanStudio, null, { timeout: 30000 }); };
const openViaWelcome = async file => { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#welcome [data-start=import]')]); await chooser.setFiles(file); };
const openViaButton = async file => { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnOpen')]); await chooser.setFiles(file); };

// ================================================================================================ 1. import
await fresh();
ok('the welcome card offers to import an old plan', await page.locator('#welcome [data-start=import]').isVisible());
await openViaWelcome(files.project);
await page.waitForSelector('dialog[open]', { timeout: 15000 });
const choices = await page.locator('dialog[open] .pick .btn').allInnerTexts();
ok('a project with three plans asks which one to import', choices.length === 3 && /المخطط الأساسي/.test(choices[0]) && /البديل 1/.test(choices[1]) && /نسخة سابقة 1/.test(choices[2]), choices.join(' | ').replace(/\n/g, ' '));
await shot('10-chooser');
await page.locator('dialog[open] .pick .btn').first().click();
await page.waitForFunction(() => __mizanStudio.doc.walls.length > 0, null, { timeout: 15000 });
const imp = await page.evaluate(() => { const e = __mizanStudio, r = globalThis.__mizanImportReport; return { walls: e.doc.walls.length, openings: e.doc.openings.length, labels: e.doc.labels.length, spaces: e.lv.rooms.length, entry: e.doc.entry, title: e.doc.title, report: { rooms: r.rooms, skipped: r.skipped.length, unmatched: r.unmatched.length, areaMismatch: r.areaMismatch.length }, input: document.querySelector('#docTitle').value }; });
ok('the main plan is in the drawing: walls and openings as generated', imp.walls === main.walls.length && imp.openings === main.openings.length, JSON.stringify(imp));
ok('every generated room is a named closed room, nothing skipped or misplaced', imp.report.rooms === 12 && imp.report.skipped === 0 && imp.report.unmatched === 0 && imp.report.areaMismatch === 0 && imp.spaces === 13);
ok('the entry side and title came across', imp.entry === 's' && /20×30/.test(imp.title) && imp.input === imp.title);
ok('the studio says what it imported', /استُورد المخطط: 12 غرفة/.test(await toastText()), await toastText());
await page.waitForFunction(() => window.__mizanViewer?.built, null, { timeout: 60000 });
const built = await page.evaluate(() => ({ rooms: __mizanViewer.built.rooms.size, named: [...__mizanViewer.built.rooms.values()].filter(r => r.label).length, tris: __mizanViewer.built.stats.triangles }));
ok('the imported plan is live in 3D with all its rooms', built.named === 13 && built.tris > 2000, JSON.stringify(built));
await page.waitForTimeout(800); await shot('11-imported-main');
const rooms2d = await page.evaluate(() => [...document.querySelectorAll('#tab-rooms .room')].length); ok('the rooms list shows them', rooms2d >= 12, 'rows=' + rooms2d);
const review = await page.evaluate(() => document.querySelector('#reviewCount')?.textContent); console.log('INFO review items:', review);

// the same file again, choosing the alternative
await openViaButton(files.project); await page.waitForSelector('dialog[open]');
await page.locator('dialog[open] .pick .btn').nth(1).click();
await page.waitForFunction(([n]) => __mizanStudio.doc.walls.length === n, [alt.walls.length], { timeout: 15000 });
ok('choosing the alternative imports that plan instead', await page.evaluate(([n]) => __mizanStudio.doc.walls.length === n && __mizanStudio.doc.openings.length > 0, [alt.walls.length]));
await page.waitForTimeout(500);
// cancelling the chooser changes nothing
await openViaButton(files.project); await page.waitForSelector('dialog[open]');
const wallsBefore = await page.evaluate(() => __mizanStudio.doc.walls.length);
await page.locator('dialog[open] .row .btn').click();
await page.waitForTimeout(300);
ok('cancel closes the chooser and keeps the current drawing', !(await page.locator('dialog[open]').count()) && await page.evaluate(() => __mizanStudio.doc.walls.length) === wallsBefore);

// a single plan needs no question
await fresh(); await openViaButton(files.bare);
await page.waitForFunction(() => __mizanStudio.doc.walls.length > 0, null, { timeout: 15000 });
ok('a bare model opens straight away, no chooser', !(await page.locator('dialog[open]').count()) && await page.evaluate(() => __mizanStudio.doc.labels.length) === 13);
// refusing junk
await fresh(); await openViaButton(files.junk); await page.waitForFunction(() => /ليس مشروع رسم/.test(document.getElementById('toast')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
ok('a JSON that is no plan is refused with a reason', /ليس مشروع رسم/.test(await toastText()) && await page.evaluate(() => __mizanStudio.doc.walls.length) === 0, await toastText());
await openViaButton(files.notjson); await page.waitForFunction(() => /ليس JSON/.test(document.getElementById('toast')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
ok('a broken file is refused with a reason', /ليس JSON/.test(await toastText()), await toastText());
// studio files still open as before
await page.evaluate(() => document.querySelector('#btnExample').click()); await page.waitForFunction(() => __mizanStudio.doc.walls.length > 0);
const exampleJson = await page.evaluate(() => JSON.stringify(__mizanStudio.doc)); const exFile = join(outDir, 'studio-project.json'); await writeFile(exFile, exampleJson);
await fresh(); await openViaButton(exFile); await page.waitForFunction(() => __mizanStudio.doc.walls.length > 0);
ok('a studio project file still opens normally', /فُتح الملف/.test(await toastText()) && await page.evaluate(() => __mizanStudio.doc.title) === 'فيلا نموذجية', await toastText());

// ================================================================================================ 2. tour
await fresh(); await openViaButton(files.bare); await page.waitForFunction(() => __mizanStudio.doc.walls.length > 0);
await page.evaluate(() => { __mizanTourOptions = { orbitMs: 3000, approachMs: 1000, roomMs: 1200, maxRooms: 4 }; });
await page.waitForFunction(() => window.__mizanTour && window.__mizanViewer?.built, null, { timeout: 60000 });
ok('tour buttons are shown, recording is available in this browser', await page.locator('#autoTour').isVisible() && await page.locator('#recordTour').isEnabled());
const modes = new Set(); const sampler = setInterval(async () => { try { modes.add(await page.evaluate(() => __mizanViewer.mode + ':' + document.querySelector('#autoTourStatus').textContent.replace(/ · \d+٪/, ''))); } catch { /* page busy */ } }, 250);
await page.click('#autoTour');
await page.waitForFunction(() => document.querySelector('#stopAutoTour').hidden === false, null, { timeout: 15000 });
const mid = await page.evaluate(() => ({ playDisabled: document.querySelector('#autoTour').disabled, locked: __mizanViewer.canvas.style.pointerEvents, touring: document.querySelector('#threePane').classList.contains('touring') }));
ok('while it runs: start is disabled, the canvas is locked, the pane is marked', mid.playDisabled && mid.locked === 'none' && mid.touring, JSON.stringify(mid));
await page.waitForTimeout(1500); await shot('20-tour-orbit');
await page.waitForFunction(() => document.querySelector('#autoTourStatus').textContent.includes('داخل'), null, { timeout: 30000 }); await page.waitForTimeout(400); await shot('21-tour-room');
await page.waitForFunction(() => /اكتملت الجولة/.test(document.querySelector('#autoTourStatus').textContent), null, { timeout: 60000 });
clearInterval(sampler);
const seenKinds = [...modes]; const sawOrbit = seenKinds.some(m => m.startsWith('orbit:') && m.includes('دورة حول المبنى')), sawApproach = seenKinds.some(m => m.includes('الاقتراب من المدخل')), sawRoom = seenKinds.some(m => m.startsWith('walk:') && m.includes('داخل '));
ok('it went around the building, approached the door, then walked into rooms', sawOrbit && sawApproach && sawRoom, seenKinds.join(' | '));
const end = await page.evaluate(() => ({ mode: __mizanViewer.mode, locked: __mizanViewer.canvas.style.pointerEvents, play: !document.querySelector('#autoTour').disabled, stopHidden: document.querySelector('#stopAutoTour').hidden, touring: document.querySelector('#threePane').classList.contains('touring'), seg: document.querySelector('#modeSeg .on')?.dataset.mode, link: document.querySelector('#tourDownload').hidden }));
ok('afterwards: orbit view, canvas unlocked, buttons back, no download link (no recording)', end.mode === 'orbit' && end.locked === '' && end.play && end.stopHidden && !end.touring && end.seg === 'orbit' && end.link, JSON.stringify(end));

// stop button and a mid-tour edit. Under software GL every Playwright round-trip takes ~1 s, so these two steps run
// inside the page, with a tour that is far too long to finish by itself.
await page.evaluate(() => { __mizanTourOptions = { orbitMs: 30000, approachMs: 1000, roomMs: 3000, maxRooms: 6 }; });
const stopRun = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id);
  $('autoTour').click();
  for (let i = 0; i < 200 && !(__mizanTour.busy && /دورة حول المبنى/.test($('autoTourStatus').textContent)); i++) await sleep(100);
  const running = __mizanTour.busy; await sleep(600); const tris = __mizanViewer.built.stats.triangles, walls = __mizanStudio.doc.walls.length;
  __mizanStudio.exec({ type: 'add-wall', level: __mizanStudio.doc.levels[0].id, a: { x: 3, y: 8 }, b: { x: 5.5, y: 8 }, t: .12 }, 'test');
  await sleep(1200); // longer than the 380 ms debounce of the live model
  const during = { tris: __mizanViewer.built.stats.triangles, mode: __mizanViewer.mode, busy: __mizanTour.busy };
  let drawn = 0; const orig = __mizanViewer.renderNow.bind(__mizanViewer); __mizanViewer.renderNow = () => { drawn++; orig(); };
  const t0 = performance.now(); $('stopAutoTour').click();
  for (let i = 0; i < 400 && __mizanTour.busy; i++) await sleep(50);
  __mizanViewer.renderNow = orig;
  const stoppedAfter = Math.round(performance.now() - t0); const status = $('autoTourStatus').textContent;
  for (let i = 0; i < 150 && __mizanViewer.built.stats.triangles === tris; i++) await sleep(100);
  return { drawn, running, tris, walls, during, stoppedAfter, status, after: { busy: __mizanTour.busy, play: !$('autoTour').disabled, mode: __mizanViewer.mode, locked: __mizanViewer.canvas.style.pointerEvents, tris: __mizanViewer.built.stats.triangles, walls: __mizanStudio.doc.walls.length } };
});
// software GL needs ~1.6 s per frame, so latency is judged in frames: at most one more frame after the click
ok('stop ends the tour at once (at most the frame in flight and the final redraw) and says so', stopRun.running && !stopRun.after.busy && stopRun.drawn <= 2 && /أُوقفت الجولة/.test(stopRun.status), JSON.stringify({ framesAfterClick: stopRun.drawn, ms: stopRun.stoppedAfter, status: stopRun.status }));
ok('stop restores the controls: orbit view, canvas unlocked, start enabled', stopRun.after.play && !stopRun.after.busy && stopRun.after.mode === 'orbit' && stopRun.after.locked === '');
ok('an edit made while the tour runs does not rebuild the model under the camera', stopRun.during.busy && stopRun.during.tris === stopRun.tris && stopRun.during.mode !== undefined, JSON.stringify(stopRun.during));
ok('…and the 3D model catches up right after the tour ends', stopRun.after.tris !== stopRun.tris && stopRun.after.walls === stopRun.walls + 1, JSON.stringify({ before: stopRun.tris, after: stopRun.after.tris }));

// ---- recording
await page.evaluate(() => { __mizanTourOptions = { orbitMs: 4000, approachMs: 1200, roomMs: 1500, maxRooms: 3 }; });
await page.click('#recordTour');
await page.waitForFunction(() => /⏺ تسجيل/.test(document.querySelector('#autoTourStatus').textContent), null, { timeout: 15000 });
await page.waitForFunction(() => /اكتملت الجولة وحُفظ الفيديو/.test(document.querySelector('#autoTourStatus').textContent), null, { timeout: 90000 });
const dl = await page.evaluate(() => { const a = document.querySelector('#tourDownload'); return { hidden: a.hidden, text: a.textContent, name: a.download, href: a.href.slice(0, 5) }; });
ok('the recorded video is offered for download on this device only', !dl.hidden && dl.name === 'mizan-tour.webm' && dl.href === 'blob:' && /WebM/.test(dl.text), JSON.stringify(dl));
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#tourDownload')]);
const webm = join(outDir, 'tour.webm'); await download.saveAs(webm);
let probe = {};
try {
  const raw = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames:format=duration,size', '-of', 'json', webm]).toString();
  probe = JSON.parse(raw);
} catch (e) { console.log('ffprobe failed: ' + e.message.slice(0, 200)); }
const stream = probe.streams?.[0] || {}, size = Number(probe.format?.size || 0), frames = Number(stream.nb_read_frames || 0);
ok('the file is a real WebM video with picture frames', /vp[89]/.test(stream.codec_name || '') && stream.width > 300 && stream.height > 200 && frames >= 5 && size > 10000, JSON.stringify({ codec: stream.codec_name, w: stream.width, h: stream.height, frames, size, duration: probe.format?.duration }));
// the video must show the camera moving: frames from the start, the middle and the end must differ
let moved = false;
try {
  // pick by frame index (software GL gives uneven frame timing, so timestamps can land on the same frame)
  const pick = [0, Math.floor((frames - 1) / 2), frames - 1];
  pick.forEach((n, i) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', webm, '-vf', `select=eq(n\\,${n})`, '-vsync', '0', '-frames:v', '1', join(outDir, `frame${i}.png`)]));
  const crc = i => execFileSync('ffmpeg', ['-v', 'error', '-i', join(outDir, `frame${i}.png`), '-f', 'md5', '-']).toString().trim();
  const sums = [0, 1, 2].map(crc); moved = new Set(sums).size === 3; console.log('INFO frame hashes', sums.join(' '));
} catch (e) { console.log('frame extraction failed: ' + e.message.slice(0, 200)); }
ok('frames at the start, middle and end are all different (the camera really moved)', moved);

// ================================================================================================ 3. mobile layout
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const mp = await phone.newPage();
mp.on('pageerror', e => logs.push('mobile pageerror: ' + e.message)); await mp.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await mp.goto(base + '/studio.html'); await mp.waitForFunction(() => window.__mizanStudio);
await mp.setInputFiles('#fileInput', files.bare); // the header overflows a 390 px screen in the existing layout; not part of this change
await mp.waitForFunction(() => __mizanStudio.doc.walls.length > 0); await mp.evaluate(() => document.querySelector('.seg [data-view="3d"]').click()); await mp.waitForFunction(() => window.__mizanViewer?.built, null, { timeout: 60000 });
const reach = await mp.evaluate(() => { const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; }; return { auto: r('autoTour'), rec: r('recordTour'), vw: innerWidth, vh: innerHeight }; });
ok('on a phone the tour buttons are inside the screen', reach.auto.l >= 0 && reach.auto.r <= reach.vw && reach.rec.l >= 0 && reach.rec.r <= reach.vw && reach.auto.t >= 0 && reach.rec.b <= reach.vh, JSON.stringify(reach));
await mp.screenshot({ path: join(outDir, '30-mobile-3d.png') });
await phone.close();

ok('no console or page errors in the whole run', logs.length === 0, logs.slice(0, 5).join(' || '));
await browser.close(); server.close();
const failed = steps.filter(s => !s.pass);
console.log(`\n${steps.length - failed.length}/${steps.length} checks passed`);
process.exit(failed.length ? 1 : 0);
