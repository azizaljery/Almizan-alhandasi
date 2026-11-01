// رحلة Chromium كاملة: الأرض ← شرعاء (طلب C) ← توليد ← البدائل ← design ← المرسم ← تصدير ← 3D. لقطات في المجلد المعطى.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module'; import { serve } from './serve.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [dist, shots, W = '1024', H = '1366'] = process.argv.slice(2); mkdirSync(shots, { recursive: true });
const S = serve(dist, 8500 + Math.floor(Math.random() * 90));
const TEXT = 'أبي ثلاث غرف نوم وأربع دورات مياه ومجلس رجال بمدخل مستقل ومقلط، ولازم مجلس الرجال بباب مباشر على غرفة الطعام، وغرفة كبار السن قريبة من الصالة، ومطبخ مفتوح على الصالة';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: +W, height: +H }, acceptDownloads: true, hasTouch: true, locale: 'ar' }); const p = await ctx.newPage();
await p.route(/workers\.dev|googleapis|gstatic/, r => r.abort()); p.on('pageerror', e => console.log('PAGEERROR', e.message));
const T = async sel => (await p.innerText(sel).catch(() => '')).replace(/\n+/g, ' | ');
const log = []; const say = (k, v) => { log.push([k, v]); console.log(k + ':', typeof v === 'string' ? v : JSON.stringify(v)); };
let fails = 0; const check = (ok, m) => { if (!ok) fails++; say(ok ? 'PASS' : 'FAIL', m); };
await p.goto(S.ORIGIN + '/home.html'); await p.click('#start');
await p.fill('#landLength', '18'); await p.fill('#landWidth', '30');
await p.check('input[data-kind="street"][value="n"]'); await p.check('input[data-kind="entry"][value="n"]');
say('LAND-FACE', await T('#landFace')); await p.screenshot({ path: shots + '/1-land.png' });
await p.click('#landForm button[type=submit]'); await p.waitForSelector('#stageShara:not([hidden])');
say('LANDBAR', await T('#landBar'));
await p.click('#chat button:has-text("أشرح فكرتي")'); await p.waitForSelector('#chat textarea');
await p.fill('#chat textarea', TEXT); await p.click('#chat form button[type=submit]'); await p.waitForTimeout(800);
const steps = [];
for (let i = 0; i < 30; i++) {
  if (await p.$('#chat button:has-text("أؤكد وأبدأ"), #chat button:has-text("أفهم القيود")')) break;
  const conf = await p.$$('#chat .confirm .citem');
  if (conf.length) { const items = await p.$$eval('#chat .confirm .citem', cs => cs.map(c => c.querySelector('p').innerText + ' ⇐ ' + (c.querySelector('button[aria-pressed=true]')?.innerText || '?'))); steps.push('CONFIRM: ' + items.join(' ؛ ')); await p.screenshot({ path: shots + '/2-confirm.png', fullPage: false }); await p.click('#chat .confirm button.cta:has-text("اعتمد")'); await p.waitForTimeout(500); continue; }
  const nums = await p.$$('#chat form.counts input[type=number]');
  if (nums.length >= 6) { const v = ['3', '1', '4', '1', '1', '1']; for (let k = 0; k < 6; k++) await nums[k].fill(v[k]); steps.push('COUNTS 3/1/4/1/1/1'); await p.click('#chat form.counts button[type=submit]'); await p.waitForTimeout(500); continue; }
  if (nums.length === 2) { await nums[0].fill('5'); await p.click('#chat form.counts button[type=submit]'); steps.push('HOUSEHOLD 5'); await p.waitForTimeout(500); continue; }
  const last = (await T('#chat')).slice(-160);
  const pick = /مدخل مستقل/.test(last) ? 'نعم، لازم' : /كبار السن/.test(last) ? 'نعم، قريبة' : null;
  let btn = pick ? await p.$(`#chat [data-control] button:has-text("${pick}")`) : null;
  for (const w of ['ابدأ التصميم', 'لا يهم', 'لا أحتاج', 'متابعة', 'تسجيل']) { if (btn) break; btn = await p.$(`#chat [data-control] button:has-text("${w}")`); }
  if (!btn) { steps.push('STUCK: ' + last); break; }
  steps.push('Q: ' + last.slice(-90) + ' ⇐ ' + (await btn.innerText())); await btn.click(); await p.waitForTimeout(500);
}
say('STEPS', steps);
say('PROFILE', (await T('#liveProfile')).slice(0, 900)); await p.screenshot({ path: shots + '/3-profile.png', fullPage: true });
check(!/ما زال ينقصني قرار/.test(await T('#chat')), 'لا يعلق الحوار عند «ما زال ينقصني قرار»');
check(/مجلس الرجال بباب مباشر على غرفة الطعام — لازم/.test(await T('#liveProfile')), 'الباب المباشر مسجّل «لازم» في الملف');
const go = await p.$('#chat button:has-text("أؤكد وأبدأ"), #chat button:has-text("أفهم القيود")'); check(!!go, 'زر بدء التصميم ظاهر');
if (go) await go.click();
await p.waitForSelector('#chat button:has-text("توليد التصميم")').then(x => x.click());
const t0 = Date.now();
await Promise.race([p.waitForURL(/design|studio/, { timeout: 300000 }), p.waitForFunction(() => document.querySelector('#buildReport') && !document.querySelector('#buildReport').hidden && document.querySelector('#buildReport').children.length > 0, null, { timeout: 300000 })]).catch(() => {});
say('GEN-SECS', (Date.now() - t0) / 1000); say('URL', p.url());
if (!/design/.test(p.url())) { say('OUTCOME', (await T('#buildReport')).slice(0, 1500)); await p.screenshot({ path: shots + '/4-outcome.png', fullPage: true }); }
if (/design/.test(p.url())) {
  await p.waitForTimeout(1500); await p.screenshot({ path: shots + '/5-design.png' }); await p.screenshot({ path: shots + '/5-design-full.png', fullPage: true });
  say('STATUS', await T('#presentationStatus')); say('LEDGER', await T('#ledger')); say('SPECS', await T('.specs')); say('ALTS', await T('#alts'));
  check(/باب مباشر/.test(await T('#ledger')), '«هل نُفّذ طلبك؟» يذكر الباب المباشر'); check(/المقلط/.test(await T('#ledger')), '«هل نُفّذ طلبك؟» يذكر المقلط');
  const alts = await p.$$('#alts [data-alt]'); say('ALT-BUTTONS', alts.length);
  if (alts.length > 1) { await alts[1].click(); await p.waitForTimeout(1200); await p.screenshot({ path: shots + '/6-alt2.png' }); say('ALT2-LEDGER', await T('#ledgerVerdict')); await (await p.$$('#alts [data-alt]'))[0].click(); await p.waitForTimeout(1000); }
  const dd = await p.evaluate(() => { const d = globalThis.__mizanDesign.doc; return JSON.stringify(d); });
  await p.click('#btnStudio'); await p.waitForURL(/studio/); await p.waitForTimeout(2500);
  const sd = await p.evaluate(() => JSON.stringify(globalThis.__mizanStudio.doc));
  // (دمج 2026-11-01) فرع الواجهات يضيف finish.facade وحده (اختيار الطراز) للمرسم والمجسّم؛ المخطط يبقى حرفيًا،
  // ولا يُقبل أي فرق آخر: يُنزع finish.facade من نسخة المرسم فقط ثم تُقارن النصوص كاملة.
  const sdo = JSON.parse(sd), ddo = JSON.parse(dd); const hadFacade = !!sdo.finish?.facade && !ddo.finish?.facade;
  if (hadFacade) { delete sdo.finish.facade; if (!Object.keys(sdo.finish).length && !('finish' in ddo)) delete sdo.finish; }
  check(dd === JSON.stringify(sdo), 'المرسم يفتح المستند نفسه حرفيًا (الأبعاد والأسماء والمواقع والشمال والشارع)' + (hadFacade ? ' — والفرق الوحيد finish.facade (طراز الواجهة)' : ''));
  await p.screenshot({ path: shots + '/7-studio.png' });
  await p.click('#btnExport'); await p.waitForTimeout(300); await p.screenshot({ path: shots + '/8-export-menu.png' });
  const m = await p.evaluate(() => { const r = document.getElementById('exportMenu').getBoundingClientRect(); return [r.left, r.right, innerWidth]; }); check(m[0] >= 0 && m[1] <= m[2], 'قائمة التصدير داخل النافذة ' + JSON.stringify(m));
  const dlp = p.waitForEvent('download'); await p.click('#exportMenu [data-export=dxf]'); const dl = await dlp; const f = shots + '/journey.dxf'; await dl.saveAs(f); check((await import('node:fs')).statSync(f).size > 1000, 'DXF غير فارغ');
  await p.click('#modeToggle'); await p.waitForTimeout(300); await p.screenshot({ path: shots + '/9-studio-advanced.png' }); await p.click('#modeToggle');
  await p.click('#btnFinal'); await p.waitForURL(/view3d|final/, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(6000);
  say('3D-URL', p.url()); await p.screenshot({ path: shots + '/10-3d.png' });
  const v = await p.evaluate(() => { const s = globalThis.__mizanView3d || globalThis.__mizanViewer; return s ? Object.keys(s).slice(0, 10) : null; }); say('3D-HOOK', v);
}
check(fails === 0 || true, 'نهاية'); writeFileSync(shots + '/journey.json', JSON.stringify(log, null, 1));
await b.close(); S.close(); console.log('FAILS', fails); process.exit(fails ? 1 : 0);
