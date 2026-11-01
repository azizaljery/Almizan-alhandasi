// يقيس: المستند المعروض في design.html مقابل المستند في المرسم بعد «عدّل عليه بيدك»
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [dist, sessFile, shots, W = '1000', H = '1366'] = process.argv.slice(2);
const S = serve(dist, 8141 + Math.floor(Math.random() * 50));
const sess = JSON.parse(readFileSync(sessFile, 'utf8')).session;
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, locale: 'ar' });
const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.route(/workers\.dev|googleapis|gstatic/, r => r.abort());
// مشروع مرسم قديم محفوظ (أرض مقلوبة) يحاكي جهاز المالك — لمعرفة هل يظهر بدل التسليم
const stale = process.env.STALE ? readFileSync(process.env.STALE, 'utf8') : null;
await page.goto(S.ORIGIN + '/home.html');
await page.evaluate(([s, st]) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('mizan.design.session.v1', s); if (st) localStorage.setItem('mizan.studio.doc.v1', st); }, [JSON.stringify(sess), stale]);
if (process.env.FILL) await page.evaluate(n => { let i = 0; const big = 'x'.repeat(100000); try { for (; i < n; i++) localStorage.setItem('fill' + i, big); } catch (e) { return i; } return i; }, +process.env.FILL).then(n => console.log('FILLED', n));
await page.goto(S.ORIGIN + '/design.html'); await page.waitForTimeout(1500);
const dd = await page.evaluate(() => { const d = globalThis.__mizanDesign.doc; return { title: d.title, plot: d.plot, walls: d.walls.length, rooms: (d.rooms||[]).map(r => r.name || r.label).filter(Boolean).sort(), fp: JSON.stringify(d).length }; });
await page.screenshot({ path: shots + '/design-' + W + '.png' });
await page.click('#btnStudio'); await page.waitForURL(/studio/); await page.waitForTimeout(2500);
const sd = await page.evaluate(() => { const d = globalThis.__mizanStudio.doc; return { title: d.title, plot: d.plot, walls: d.walls.length, rooms: (d.rooms||[]).map(r => r.name || r.label).filter(Boolean).sort(), fp: JSON.stringify(d).length }; });
await page.screenshot({ path: shots + '/studio-' + W + '.png' });
console.log('DESIGN', JSON.stringify(dd).slice(0, 400)); console.log('STUDIO', JSON.stringify(sd).slice(0, 400));
console.log('SAME-DOC', JSON.stringify(dd) === JSON.stringify(sd));
// إعادة تحميل المرسم (يحدث في Safari حين يُفرّغ التبويب): هل يبقى المستند نفسه؟
await page.reload(); await page.waitForTimeout(2000);
const sd2 = await page.evaluate(() => { const d = globalThis.__mizanStudio.doc; return { title: d.title, plot: d.plot, walls: d.walls.length, rooms: (d.rooms||[]).map(r => r.name || r.label).filter(Boolean).sort(), fp: JSON.stringify(d).length }; });
console.log('AFTER-RELOAD-SAME', JSON.stringify(dd) === JSON.stringify(sd2), JSON.stringify(sd2).slice(0, 200));
await browser.close(); S.close();
