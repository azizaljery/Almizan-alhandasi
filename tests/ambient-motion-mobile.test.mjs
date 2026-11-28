// زر «إيقاف الحركة» على الجوال في الصفحة الرئيسية: كان يتمدد عمودًا بارتفاع الشاشة (top:12px مع bottom!important من mobile.css)
// فيحجب محتوى المحادثة. الاختبار يقيس مستطيل الزر فعليًا على 390 بكسل ويطلب ألا يتجاوز حجم زر عادي.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

test('زر إيقاف الحركة على الجوال زر صغير لا عمود يحجب الصفحة', { timeout: 120000 }, async t => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { if (process.env.MIZAN_REQUIRE_BROWSER_TESTS) throw e; return t.skip('Playwright غير متاح في هذه البيئة'); }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = normalize(join(root, p === '/' ? 'index.html' : p));
    if (!f.startsWith(root) || !existsSync(f) || extname(f) === '') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try { browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); }
  catch (e) { server.close(); if (process.env.MIZAN_REQUIRE_BROWSER_TESTS) throw e; return t.skip('تعذّر تشغيل المتصفح'); }
  try {
    for (const [w, h] of [[390, 844], [360, 740]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`${base}/home.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ambient-motion', { state: 'attached', timeout: 20000 });
      const box = await page.evaluate(() => { const b = document.querySelector('.ambient-motion'); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { w: r.width, h: r.height, top: cs.top, bottom: cs.bottom, display: cs.display }; });
      assert.ok(box.h <= 80, `${w}px: ارتفاع الزر ${Math.round(box.h)}px يتجاوز حجم زر عادي (top=${box.top}, bottom=${box.bottom})`);
      assert.ok(box.w <= w * .6, `${w}px: عرض الزر ${Math.round(box.w)}px كبير`);
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
});
