import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '/tmp/mizan-playwright-bridge.mjs';

const evidence = resolve('evidence/review-package/v45-comparative/natural-ui');
await mkdir(evidence, { recursive: true });
const prompt = 'غرفتين نوم ٤×٤ لكل غرفة، صالة ٦×٥، مطبخ ٣×٤. أبي جناحين متدرجين مرتبطين.';
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

async function run(label, root) {
  const resolvedRoot = resolve(root);
  const server = http.createServer(async (req, res) => {
    try {
      const path = resolve(resolvedRoot, decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/$/, '/index.html').replace(/^\//, ''));
      if (!path.startsWith(resolvedRoot + '/')) throw Error('path');
      res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.statusCode = 404; res.end('Not found'); }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const context = await (await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })).newContext({
    viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
  });
  const browser = context.browser();
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://*.workers.dev/**', route => route.abort());
  const pathFor = name => resolve(evidence, `${label}-${name}`);
  const saveDownload = async (selector, name) => {
    const downloadPromise = page.waitForEvent('download');
    await page.locator(selector).click();
    const download = await downloadPromise;
    const path = resolve(evidence, name);
    await download.saveAs(path);
    return path;
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.locator('[data-tab="brief"]').click();
    await page.locator('#panel-brief.on').waitFor();
    await page.locator('#idea').fill(prompt);
    await page.locator('#askLocal').click();
    await page.locator('#requestReview:not([hidden])').waitFor();
    const questions = (await page.locator('#requestQuestions').allTextContents()).map(item => item.trim()).filter(Boolean);
    const parsedRooms = await page.locator('#requestRooms').innerText();
    const facts = await page.locator('#requestFacts').innerText();
    const applyDisabled = await page.locator('#applyRequest').isDisabled();
    await page.screenshot({ path: pathFor('review.png'), fullPage: true });
    assert.equal(applyDisabled, false, `${label}: natural prompt should pass the explicit review without clarification: ${questions.join(' | ')}`);
    await page.locator('#applyRequest').click();
    await page.locator('#panel-design.on').waitFor();
    await page.locator('#gen').click();
    await page.waitForFunction(() => document.getElementById('gen')?.disabled === false, { timeout: 120000 });
    await page.locator('#panel-result.on #plan svg').waitFor({ timeout: 30000 });
    const generationError = await page.locator('#generationError').textContent();
    assert.equal(generationError, '', `${label}: ${generationError}`);
    const planPath = await saveDownload('#saveProject', `${label}-project.json`);
    const project = JSON.parse(await readFile(planPath, 'utf8'));
    const model = project.design?.embedded;
    assert.ok(model, `${label}: saved project should include generated model geometry`);
    const svgPath = await saveDownload('#exportPlan', `${label}-plan.svg`);
    await page.locator('[data-tab="boq"]').click();
    await page.locator('#panel-boq.on').waitFor();
    const csvPath = await saveDownload('#exportBOQ', `${label}-quantities.csv`);
    await page.locator('[data-tab="result"]').click();
    await page.locator('#panel-result.on').waitFor();
    await page.locator('#plan').scrollIntoViewIfNeeded();
    await page.screenshot({ path: pathFor('plan.png'), fullPage: true });
    const viewportChecks = [];
    for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
      await page.setViewportSize(viewport);
      await page.locator('#plan').scrollIntoViewIfNeeded();
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.document <= dimensions.viewport + 1, `${label}: horizontal overflow at ${viewport.width}px`);
      viewportChecks.push({ ...viewport, ...dimensions });
      await page.screenshot({ path: pathFor(`plan-${viewport.width}.png`), fullPage: true });
    }
    const summary = {
      label, prompt, reviewQuestions: questions, reviewFacts: facts, proposedRoomRows: parsedRooms,
      applyEnabled: !applyDisabled, roomCount: model.rooms.length, shape: model.shape,
      explicitWingCountInPrompt: 2, interpretedWingCount: model.shape === 'staggered' ? 2 : null,
      representedStaggeredWingCount: model.shape === 'staggered' ? model.massingParts?.filter(part => part.component === 'wing').length ?? null : null,
      roomGeometry: model.rooms.map(room => ({ name: room.name, type: room.type, width: room.w, length: room.h, area: room.w * room.h })),
      files: { project: planPath, svg: svgPath, csv: csvPath },
      svgBytes: (await readFile(svgPath)).length, csvBytes: (await readFile(csvPath)).length,
      viewportChecks, pageErrors: errors,
    };
    assert.deepEqual(errors, []);
    await writeFile(pathFor('report.json'), JSON.stringify(summary, null, 2) + '\n');
    return summary;
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

async function runAdversarial() {
  const resolvedRoot = resolve('dist');
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const path = resolve(resolvedRoot, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
      if (!path.startsWith(resolvedRoot + '/')) throw Error('path');
      res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.statusCode = 404; res.end('Not found'); }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [], steps = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://*.workers.dev/**', route => route.abort());
  const review = async prompt => {
    await page.locator('#idea').fill(prompt);
    await page.locator('#askLocal').click();
    await page.locator('#requestReview:not([hidden])').waitFor();
    const questions = (await page.locator('#requestQuestions').allTextContents()).map(item => item.trim()).filter(Boolean);
    const proposed = await page.locator('#requestRooms').innerText();
    const facts = await page.locator('#requestFacts').innerText();
    return { questions, proposed, facts, applyEnabled: !(await page.locator('#applyRequest').isDisabled()) };
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.locator('[data-tab="brief"]').click();
    await page.locator('input[name="requestMode"][value="modify"]').check();
    const noAdd = await review('لا تضف غرفة نوم');
    assert.equal(noAdd.applyEnabled, true);
    assert.equal((noAdd.proposed.match(/غرفة نوم/g) || []).length, 4);
    assert.equal((noAdd.proposed.match(/مجلس/g) || []).length, 2);
    await page.locator('#applyRequest').click();
    await page.locator('#panel-design.on').waitFor();
    steps.push({ case: 'لا تضف غرفة نوم preserves all four existing bedrooms and two majlis rooms', status: 'PASS' });

    await page.locator('[data-tab="brief"]').click();
    const withoutMajlis = await review('بدون مجلس');
    assert.equal(withoutMajlis.applyEnabled, true);
    assert.equal(/مجلس/.test(withoutMajlis.proposed), false);
    assert.equal((withoutMajlis.proposed.match(/غرفة نوم/g) || []).length, 4);
    await page.locator('#applyRequest').click();
    await page.locator('#panel-design.on').waitFor();
    steps.push({ case: 'بدون مجلس removes the requested rooms and preserves all four bedrooms', status: 'PASS' });

    await page.locator('[data-tab="brief"]').click();
    await page.locator('input[name="requestMode"][value="replace"]').check();
    const blockedCases = [];
    for (const [label, prompt, expected] of [
      ['area conflict', 'غرفة نوم ٤×٤ بمساحة ٢٠ م²', /تعطي مساحة 16.*كتبت مساحة 20/],
      ['unsupported north facade', 'غرفة نوم ٤×٦ بواجهة شمالية', /لا يثبت أي جدار خارجي.*لم نطبق الطلب/],
      ['generic staggered wing count', 'أبي أجنحة متدرجة مرتبطة، غرفتين نوم ومطبخ', /حدّد عدد الأجنحة/],
      ['unsupported three-wing count', 'أبي ٣ أجنحة متدرجة مرتبطة، غرفتين نوم ومطبخ', /يدعم جناحين فقط/],
      ['two then corrected three-wing count', 'جناحين متدرجين مرتبطين، لكن أبي ٣ أجنحة متدرجة، غرفتين نوم ومطبخ', /طلبت 3 أجنحة.*يدعم جناحين فقط/],
      ['conflicting two and three counts without correction', 'جناحين متدرجين مرتبطين و٣ أجنحة متدرجة، غرفتين نوم ومطبخ', /أعداد مختلفة.*بلا عبارة تصحيح/],
    ]) {
      const result = await review(prompt);
      assert.equal(result.applyEnabled, false, `${label} must block application`);
      assert.match(result.questions.join(' '), expected);
      blockedCases.push({ label, questions: result.questions, applyEnabled: result.applyEnabled });
    }
    const correctedCount = await review('٣ أجنحة متدرجة مرتبطة، لكن تصحيح صريح: أبي جناحين متدرجين مرتبطين، غرفتين نوم ومطبخ');
    assert.equal(correctedCount.applyEnabled, true);
    assert.match(correctedCount.facts, /عدد الأجنحة\s*جناحان.*يطابق التكوين المدعوم/s);
    steps.push({ case: 'explicit correction from three wings to two resolves in text order and remains applicable', status: 'PASS' });
    assert.deepEqual(errors, []);
    const report = { status: 'PASS', steps, blockedCases, pageErrors: errors, notes: ['All cases used the visible local request UI. The explicit 4×4 versus 20 m² conflict and north-facing facade remain unapplied. No live AI was called.'] };
    await writeFile(resolve(evidence, 'adversarial-ui-report.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

const results = [];
try {
  results.push(await run('baseline-v45', '/tmp/almizan-v45-base/dist'));
  results.push(await run('modified-source', 'dist'));
  const adversarial = await runAdversarial();
  await writeFile(resolve(evidence, 'comparison.json'), JSON.stringify({ status: 'PASS', prompt, results, adversarial }, null, 2) + '\n');
  console.log('Natural UI comparison passed for baseline and modified source.');
} catch (error) {
  await writeFile(resolve(evidence, 'comparison-failure.txt'), error.stack + '\n');
  throw error;
}
