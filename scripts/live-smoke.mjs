// Live smoke test: opens the PUBLISHED site in a real browser and exercises the
// sun-study, 3D compare, auto-tour and NLP paths. Run by .github/workflows/live-smoke.yml.
// It only reads the public site; it creates nothing and sends no secrets.
import { chromium } from 'playwright';

const BASE = (process.env.SITE_URL || 'https://almizan-handasi.aljeryabod.workers.dev').replace(/\/$/, '');
const results = [], errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : '')); };

for (const file of ['sun-day.mjs', 'sun-day-ui.mjs', 'sun-day.css', 'compare3d.mjs', 'compare3d.css', 'tour-recorder.mjs', 'tour-recorder-ui.mjs', 'local-nlp.mjs']) {
  const res = await fetch(`${BASE}/${file}?smoke=${Date.now()}`).catch(e => ({ ok: false, status: String(e) }));
  check('static file served: ' + file, res.ok, String(res.status));
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('response', r => { if (r.status() >= 400 && !/\/api\//.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
const click = id => page.evaluate(i => document.getElementById(i)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), id);
const set = (id, v) => page.evaluate(([i, v]) => { const e = document.getElementById(i); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
const text = id => page.evaluate(i => document.getElementById(i)?.textContent || '', id);

await page.goto(BASE + '/?smoke=' + Date.now(), { waitUntil: 'load' });
await page.waitForTimeout(1500);
const ids = ['sunDay', 'sunDaySlider', 'sunDayPlay', 'compare3d', 'compareSelectA', 'autoTour', 'recordTour', 'stopAutoTour', 'tourDownload', 'reportSlot', 'reportSoon'];
const missing = await page.evaluate(list => list.filter(i => !document.getElementById(i)), ids);
check('new page elements exist', missing.length === 0, missing.join(', '));
check('report placeholder is disabled and honest', await page.evaluate(() => { const b = document.getElementById('reportSoon'); return !!b && b.disabled && /غير متاح/.test(document.getElementById('reportSlot').textContent); }));

await page.evaluate(() => document.getElementById('studioAdvancedToggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
// NLP: the sentence the owner asked about must give 2 bedrooms, 2 baths, 1 majlis, and ask nothing.
await page.evaluate(t => { const e = document.getElementById('idea'); e.value = t; e.dispatchEvent(new Event('input', { bubbles: true })); }, 'ابي دور غرفتين وحمامين ومجلس');
await click('askLocal'); await page.waitForTimeout(1500);
const understood = await page.evaluate(() => document.body.innerText);
const questions = await page.evaluate(() => document.getElementById('requestQuestions')?.innerText || '');
check('NLP: the sentence raises no follow-up question', questions.trim() === '', questions.slice(0, 120));
await click('applyRequest'); await page.waitForTimeout(1500);
await click('gen'); await page.waitForTimeout(9000);

const roomCount = await page.evaluate(() => document.querySelectorAll('#roomSelect option').length);
check('a plan was generated from the sentence', roomCount >= 5, 'rooms in selector: ' + roomCount);

await set('solarLatitude', '24.7136'); await set('solarLongitude', '46.6753'); await set('solarInstant', '2026-06-21T09:00:00+03:00'); await set('solarNorth', '0');
await page.evaluate(() => { const c = document.getElementById('solarNorthConfirmed'); c.checked = true; c.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(1200);
const rows = await page.evaluate(() => document.querySelectorAll('#sunDayRooms tbody tr').length);
check('sun study: per-room table appears', rows >= 3, 'rows: ' + rows);
check('sun study: sunrise/sunset in Riyadh range', /05:\d\d.*18:\d\d/.test(await text('sunDaySummary')), await text('sunDaySummary'));
await page.evaluate(() => { const s = document.getElementById('sunDaySlider'); s.value = '900'; s.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(600);
check('sun study: slider rewrites the time', (await page.evaluate(() => document.getElementById('solarInstant').value)) === '2026-06-21T15:00:00+03:00');
await click('sunDayPlay'); await page.waitForTimeout(1500);
const played = await page.evaluate(() => document.getElementById('solarInstant').value);
await click('sunDayPlay');
check('sun study: play advances the time', played !== '2026-06-21T15:00:00+03:00', played);

await page.evaluate(() => document.querySelector('[data-studio-mode="3d"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(3000);
check('3D renders', (await page.evaluate(() => document.getElementById('view')?.dataset.renderStatus)) === 'ready');
await page.evaluate(() => { document.getElementById('compare3d').open = true; });
await page.waitForTimeout(4000);
const cmp = await page.evaluate(() => ({ canvases: document.querySelectorAll('#compare3d canvas').length, a: document.getElementById('compare3d').dataset.compareA, b: document.getElementById('compare3d').dataset.compareB }));
check('3D compare: two canvases and two different alternatives', cmp.canvases === 2 && cmp.a !== undefined && cmp.a !== cmp.b, JSON.stringify(cmp));
await page.evaluate(() => { document.getElementById('compare3d').open = false; });
await page.waitForTimeout(500);
check('3D compare: closing releases both canvases', (await page.evaluate(() => document.querySelectorAll('#compare3d canvas').length)) === 0);

await click('autoTour'); await page.waitForTimeout(2500);
check('auto-tour: starts and shows progress', /٪|%/.test(await text('autoTourStatus')) && !(await page.evaluate(() => document.getElementById('stopAutoTour').hidden)), await text('autoTourStatus'));
await click('stopAutoTour'); await page.waitForTimeout(1000);
check('auto-tour: stop works', /أُوقفت/.test(await text('autoTourStatus')), await text('autoTourStatus'));

check('no page errors or failed static requests', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
