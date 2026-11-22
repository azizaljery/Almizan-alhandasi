import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createDoc, applyCommand, serialize } from '../dist/draw/doc.mjs';
import { csv } from '../dist/client-tools/model.mjs';
import { roomsForDoc } from '../dist/client-tools/model.mjs';

const BASE = process.env.SITE_URL || 'http://127.0.0.1:4317';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw Error('Client-tools acceptance writes synthetic fixtures: use an isolated local preview only.');
const OUT = process.env.TOOLS_EVIDENCE_DIR || process.env.QUALITY_EVIDENCE_DIR || '/workspace/almizan-client-tools-evidence'; await mkdir(OUT, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [], errors = [];
const check = (name, value) => { results.push({ name, pass: !!value }); console.log((value ? 'PASS ' : 'FAIL ') + name); assert.ok(value, name); };
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
const workspace = async p => p.evaluate(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')));
async function tab(id) { await page.locator('#tab-' + id).click(); await page.waitForTimeout(100); }
let doc = createDoc({ title: 'منزل اختبار الأدوات' });
doc = applyCommand(doc, { type: 'add-rect', level: 'L1', a: { x: 0, y: 0 }, b: { x: 6, y: 5 }, t: .2 }).doc;
doc = applyCommand(doc, { type: 'add-label', level: 'L1', name: 'صالة العائلة', roomType: 'living', seed: { x: 3, y: 2 } }).doc;
function minimalPdf() {
  const content = '0.5 w 50 50 500 350 re S 300 50 m 300 400 l S BT /F1 18 Tf 90 220 Td (TEST PLAN) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 450] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let text = '%PDF-1.4\n'; const offsets = [0]; for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`; } const start = Buffer.byteLength(text); text += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`; return Buffer.from(text);
}
try {
  await page.goto(BASE + '/tools.html');
  await page.evaluate(raw => { localStorage.setItem('mizan.studio.doc.v1', raw); }, serialize(doc)); await page.reload(); await page.waitForSelector('#mood-notes');
  check('six tools are discoverable from one workspace', await page.locator('[role=tab]').count() === 6);
  const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#eee4cb'; x.fillRect(0, 0, 800, 600); x.strokeStyle = '#23463b'; x.lineWidth = 7; x.strokeRect(80, 60, 640, 480); x.strokeRect(390, 60, 330, 230); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  await page.locator('.dropzone input').setInputFiles({ name: 'inspiration.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.mood-image img'); await page.locator('.mood-image textarea').fill('أحب لون الحجر والخشب'); await page.locator('#mood-notes').click();
  check('mood photos, sampled colours and annotations persist', (await workspace(page)).mood.items[0].colors.length > 0 && (await workspace(page)).mood.items[0].note.includes('الحجر'));
  await page.screenshot({ path: OUT + '/mood-desktop.png', fullPage: true });

  await tab('finishes'); await page.fill('#product-name', 'بورسلان اختبار'); await page.fill('#product-brand', 'مورد اختبار'); await page.fill('#product-price', '45'); await page.fill('#product-pack', '1.44'); await page.selectOption('#product-preset', 'woodOak');
  await page.getByRole('button', { name: 'إضافة إلى مكتبتي', exact: true }).click(); await page.waitForSelector('.product-row');
  await page.getByRole('button', { name: 'اعتماد الاختيار للغرفة', exact: true }).click(); await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('mizan.studio.doc.v1')).finish?.roomProducts?.r1);
  const chosen = await page.evaluate(() => JSON.parse(localStorage.getItem('mizan.studio.doc.v1')));
  check('finish changes the selected room while preserving geometry', chosen.finish.roomProducts.r1.floor === 'woodOak' && JSON.stringify(chosen.walls) === JSON.stringify(doc.walls));
  check('shopping list uses real room quantity and pack rounding', (await workspace(page)).selections[0].quantity > 20 && await page.locator('#tool-panel').getByText('إجمالي المنتجات:', { exact: false }).count() === 1);
  await page.getByRole('button', { name: 'تشغيل المعاينة', exact: true }).click(); await page.waitForSelector('.three-preview canvas', { timeout: 90000 }); await page.waitForTimeout(1300); await page.screenshot({ path: OUT + '/finishes-desktop.png', fullPage: true }); check('real 3D viewer renders the selected products', await page.locator('.three-preview canvas').count() === 1);

  await tab('tenders'); await page.getByRole('button', { name: 'جلب الكميات من المخطط', exact: true }).click(); await page.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).boq.length > 0);
  const boq = (await workspace(page)).boq;
  check('tender baseline excludes duplicate summary and block measurements', !boq.some(i => ['footprint', 'rooms', 'wallVolume', 'blocks'].includes(i.code)));
  await page.fill('#offer-name', 'المقاول الأول'); await page.locator('.dropzone input').setInputFiles({ name: 'offer-a.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(boq.map(i => ({ ...i, rate: 25 })))) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).offers.length === 1);
  await page.fill('#offer-name', 'عرض ناقص'); await page.locator('.dropzone input').setInputFiles({ name: 'offer-b.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(boq.slice(1).map(i => ({ ...i, rate: 20 })))) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).offers.length === 2);
  check('a missing-scope contractor offer is marked incomplete', await page.getByText('عرض غير مكتمل', { exact: true }).count() === 1);
  await page.screenshot({ path: OUT + '/tenders-desktop.png', fullPage: true });

  await tab('execution'); await page.fill('#task-title', 'تركيب الأرضية'); await page.fill('#task-owner', 'مقاول اختبار'); await page.fill('#task-budget', '1000'); await page.getByRole('button', { name: 'إضافة العمل', exact: true }).click(); await page.waitForSelector('.task-card');
  let task = (await workspace(page)).tasks[0]; await page.selectOption('#status-' + task.id, 'accepted'); await page.fill('#note-' + task.id, 'فُحصت الكمية والاستواء والتشطيب'); await page.getByRole('button', { name: 'حفظ الحالة والفحص', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).tasks[0].status === 'accepted');
  await page.locator('.task-card .dropzone input').setInputFiles({ name: 'site-photo.png', mimeType: 'image/png', buffer: png }); await page.waitForSelector('.photo-strip img');
  await page.fill('#payment-amount', '700'); await page.fill('#payment-note', 'سند اختبار'); await page.getByRole('button', { name: 'تسجيل الدفعة', exact: true }).click(); await page.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).payments.length === 1);
  await page.fill('#payment-amount', '301'); await page.getByRole('button', { name: 'تسجيل الدفعة', exact: true }).click(); await page.waitForFunction(() => document.getElementById('tools-message').textContent.includes('تتجاوز'));
  check('payments cannot exceed the accepted task budget', (await workspace(page)).payments.length === 1); await page.screenshot({ path: OUT + '/execution-desktop.png', fullPage: true });

  await tab('renovation'); await page.getByRole('button', { name: 'استخدام المخطط الحالي كأساس', exact: true }).click(); await page.waitForSelector('#demo-wall');
  await page.getByRole('button', { name: 'إزالة الجدار من المقترح', exact: true }).click(); await page.waitForFunction(() => document.getElementById('tools-message').textContent.includes('إنشائي'));
  check('demolition is blocked until structural review is explicitly acknowledged', JSON.parse((await workspace(page)).renovation.proposed).walls.length === 4);
  await page.locator('.check-row input').check(); await page.getByRole('button', { name: 'إزالة الجدار من المقترح', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(JSON.parse(localStorage.getItem('mizan.client.tools.v1')).renovation.proposed).walls.length === 3);
  check('renovation preserves the four-wall baseline', JSON.parse((await workspace(page)).renovation.baseline).walls.length === 4); await page.screenshot({ path: OUT + '/renovation-desktop.png', fullPage: true });

  await tab('import'); await page.locator('.dropzone input').setInputFiles({ name: 'old-plan.png', mimeType: 'image/png', buffer: png }); await page.waitForSelector('.plan-canvas[data-ready=true]');
  async function point(x, y) { await page.locator('.plan-canvas').evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' })); const b = await page.locator('.plan-canvas').boundingBox(); await page.mouse.click(b.x + x * b.width, b.y + y * b.height); }
  await point(.1, .1); await point(.9, .1); await page.fill('#known-length', '8'); await page.getByRole('button', { name: 'اعتماد المقياس', exact: true }).click();
  await page.waitForSelector('.plan-canvas[data-ready=true]'); await page.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).imported.scale > 0);
  await page.selectOption('#trace-mode', 'wall'); for (const [a, b] of [[ [.1,.1],[.9,.1] ],[ [.9,.1],[.9,.9] ],[ [.9,.9],[.1,.9] ],[ [.1,.9],[.1,.1] ]]) { await point(...a); await point(...b); }
  await page.selectOption('#trace-mode', 'room'); await page.fill('#trace-room-name', 'صالة مستوردة'); await page.selectOption('#trace-room-type', 'living'); await point(.5, .5);
  await page.locator('.check-row input').check();
  check('manual plan tracing persists walls, label and metric calibration', (await workspace(page)).imported.plan.walls.length === 4 && (await workspace(page)).imported.scale > 0);
  await page.screenshot({ path: OUT + '/import-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'فتح النسخة في المرسم', exact: true }).click(); await page.waitForURL(/studio\.html/);
  const imported = await page.evaluate(() => JSON.parse(localStorage.getItem('mizan.studio.doc.v1')));
  check('calibrated plan opens as real editable walls and labels in the existing studio', imported.walls.length === 4 && imported.labels[0].name === 'صالة مستوردة' && Math.abs(imported.walls[0].b.x - imported.walls[0].a.x - 8) < .03);
  check('traced walls form a closed measurable room after import', roomsForDoc(imported).length === 1 && roomsForDoc(imported)[0].area > 40);
  await page.goto(BASE + '/tools.html#import'); await page.waitForSelector('#trace-mode');
  await page.locator('.dropzone input').setInputFiles({ name: 'vector-plan.pdf', mimeType: 'application/pdf', buffer: minimalPdf() });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).imported.name === 'vector-plan.pdf', null, { timeout: 30000 });
  check('PDF pages render locally into a traceable plan image', (await workspace(page)).imported.width > 500);

  await page.route('**/api/client-tools/status', r => r.fulfill({ json: { available: true } }));
  await page.route('**/api/client-tools/vision', async r => { const b = r.request().postDataJSON(); check('vision request sends selected images and task mode', b.mode === 'mood' && b.images.length > 0); await r.fulfill({ json: { mode: 'mood', requiresReview: true, result: { summary: 'لوحة اختبار من ألوان الحجر والخشب', palette: ['#8a785f', '#d8c6a5'], materials: ['حجر', 'خشب'], designDirections: ['واجهة هادئة'] } } }); });
  await page.goto(BASE + '/tools.html#mood'); await page.waitForSelector('#tools-access'); await page.fill('#tools-access', 'test-only-code'); await page.getByRole('button', { name: 'تحليل الصور وصياغة لوحة الذوق', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).mood.summary.includes('لوحة اختبار'));
  check('structured AI mood result is saved without replacing customer notes', (await workspace(page)).mood.items[0].note.includes('الحجر'));

  const [backup] = await Promise.all([page.waitForEvent('download'), page.click('#export-backup')]); const backupPath = await backup.path(), bundle = JSON.parse(await readFile(backupPath, 'utf8'));
  check('backup includes the actual mood, PDF and site-photo files', bundle.assets.length >= 4 && bundle.document);
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'ar-SA' }), mobile = await other.newPage(); mobile.on('pageerror', e => errors.push(e.message)); await mobile.goto(BASE + '/tools.html'); await mobile.waitForSelector('#mood-notes'); mobile.once('dialog', d => d.accept()); await mobile.setInputFiles('#import-backup', backupPath);
  await mobile.waitForFunction(() => JSON.parse(localStorage.getItem('mizan.client.tools.v1')).payments.length === 1);
  check('backup restores on a separate browser with remapped attachments and drawing', (await workspace(mobile)).mood.items.length === 1 && (await workspace(mobile)).tasks[0].photos.length === 1);
  await mobile.waitForSelector('.mood-image img'); await mobile.waitForFunction(() => { const i = document.querySelector('.mood-image img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).catch(() => {}); check('restored photo data is readable', await mobile.locator('.mood-image img').evaluate(i => i.complete && i.naturalWidth > 0));
  for (const phase of [.12, .45, .9]) {
    const ratios = await mobile.evaluate(async phase => {
      const { ambientCycle, contrast } = await import('/ambient-cycle.mjs'); const c = ambientCycle(); c.pause(); c.seek(phase);
      const hex = s => '#' + s.match(/[\d.]+/g).slice(0, 3).map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
      const label = document.querySelector('.field'), paper = label.closest('.tool-card'), input = label.querySelector('textarea,input,select'), heading = document.querySelector('.tool-heading h2');
      return [contrast(hex(getComputedStyle(label).color), hex(getComputedStyle(paper).backgroundColor)), contrast(hex(getComputedStyle(input).color), hex(getComputedStyle(input).backgroundColor)), contrast(hex(getComputedStyle(heading).color), hex(getComputedStyle(document.body).backgroundColor))];
    }, phase);
    check('readable form/heading contrast through ambient phase ' + phase, ratios.every(r => r >= 4.5));
  }
  check('five mobile navigation links occupy one row', await mobile.locator('.mz-review-nav a').evaluateAll(links => Math.max(...links.map(a => a.getBoundingClientRect().top)) - Math.min(...links.map(a => a.getBoundingClientRect().top)) < 2));
  await mobile.screenshot({ path: OUT + '/mood-mobile.png', fullPage: true });
  for (const id of ['finishes', 'import', 'renovation', 'tenders', 'execution']) { await mobile.click('#tab-' + id); await mobile.waitForTimeout(100); check('mobile layout does not overflow: ' + id, await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); if (id === 'execution') await mobile.screenshot({ path: OUT + '/execution-mobile.png', fullPage: true }); }
  await mobile.emulateMedia({ media: 'print' });
  check('printing from night mode uses white paper and includes acceptance notes', await mobile.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)' && [...document.querySelectorAll('.print-only')].some(p => getComputedStyle(p).display !== 'none' && p.textContent.includes('فُحصت'))));
  await mobile.pdf({ path: OUT + '/execution-report.pdf', format: 'A4', printBackground: true }); await mobile.emulateMedia({ media: 'screen' });
  await mobile.evaluate(() => localStorage.setItem('mizan.client.tools.v1', '{broken')); await mobile.reload();
  await mobile.waitForSelector('#tab-mood[disabled]'); check('corrupted local data is preserved rather than silently overwritten', await mobile.evaluate(() => localStorage.getItem('mizan.client.tools.v1') === '{broken'));
  mobile.once('dialog', d => d.accept()); await mobile.setInputFiles('#import-backup', backupPath); await mobile.waitForSelector('#tab-mood:not([disabled])');
  check('a valid backup can recover a previously unreadable workspace', (await workspace(mobile)).payments.length === 1 && (await workspace(mobile)).mood.items.length === 1);
  check('no unhandled errors in real desktop/mobile flows', errors.length === 0);
} catch (e) { console.log('PAGE_MESSAGE', await page.locator('#tools-message').textContent().catch(() => 'unavailable')); await page.screenshot({ path: OUT + '/failure.png', fullPage: true }).catch(() => {}); await writeFile(OUT + '/failure-state.json', JSON.stringify(await workspace(page).catch(() => null), null, 2)); throw e; }
finally { await browser.close(); await writeFile(OUT + '/browser-results.json', JSON.stringify({ results, errors }, null, 2)); }
console.log(JSON.stringify({ passed: results.filter(r => r.pass).length, total: results.length, errors, evidence: OUT }));
