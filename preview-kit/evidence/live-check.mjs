import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const O = process.argv[2]; const b = await chromium.launch(); const out = {};
for (const [label, host] of [['allowed', '127.0.0.1'], ['other-host', 'localhost']]) {
  for (const page of ['launcher.html', 'home.html', 'studio.html', 'view3d.html']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' }); const p = await ctx.newPage(); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); }); p.on('pageerror', e => errs.push('pageerror:' + String(e).slice(0, 140)));
    await p.goto(`http://${host}:8765/${page}`, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const banner = await p.$('#mizan-preview-banner'); let info = null;
    if (banner) { info = await p.evaluate(() => { const b = document.getElementById('mizan-preview-banner'); const r = b.getBoundingClientRect(); return { dir: b.dir, items: b.querySelectorAll('li').length, head: b.querySelector('strong').textContent, top: r.top, h: Math.round(r.height), w: Math.round(r.width), vw: innerWidth, scrollW: document.documentElement.scrollWidth }; });
      await p.locator('#mizan-preview-banner summary').click(); await p.waitForTimeout(200); }
    await p.screenshot({ path: `${O}/${label}-${page}.png` });
    out[`${label}/${page}`] = { banner: !!banner, info, errs: errs.filter(e => !/fonts\.g|ERR_|Failed to load resource/.test(e)) }; await ctx.close();
  }
}
// هاتف
const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage(); await p.goto('http://127.0.0.1:8765/home.html'); await p.waitForTimeout(1500);
out.mobile = await p.evaluate(() => ({ banner: !!document.getElementById('mizan-preview-banner'), scrollW: document.documentElement.scrollWidth, vw: innerWidth })); await p.screenshot({ path: `${O}/mobile-home.png` });
console.log(JSON.stringify(out, null, 1)); await b.close();
