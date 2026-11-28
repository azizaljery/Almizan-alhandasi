// تباين النص في كل لحظة من دورة النهار والليل (لا في الأطوار الخمسة الثابتة فقط): كان النص يختفي أثناء الانتقال بين النهار والغروب.
// العناصر فوق تدرج لوني خارج القياس (كما في design-contrast-tone).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUDIT = `(()=>{
const parse=c=>{const m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
const lum=({r,g,b})=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
const bgOf=el=>{const st=[];for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0){st.push(c);if(c.a>=1)break}}let b={r:255,g:255,b:255,a:1};for(const c of st.reverse())b=over(c,b);return b};
const out=[];
for(const e of document.body.querySelectorAll('*')){const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own)continue;const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)continue;const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;
let g=false;for(let x=e;x;x=x.parentElement){const cx=getComputedStyle(x);if(cx.backgroundImage&&cx.backgroundImage!=='none'){g=true;break}const c=parse(cx.backgroundColor);if(c&&c.a>=1)break}
const fg=parse(cs.color),bg=bgOf(e),f=over(fg,bg),L1=lum(f),L2=lum(bg),ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);const size=parseFloat(cs.fontSize),large=size>=24||(size>=18.66&&parseInt(cs.fontWeight)>=700);
if(ratio<(large?3:4.5))out.push({t:e.textContent.trim().slice(0,24),ratio:+ratio.toFixed(2),cls:(e.className+'').slice(0,40),tag:e.tagName,g})}
return out})()`;

const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

test('نصوص الصفحة الرئيسية والأدوات مقروءة في كل طور من الدورة (خطوة 0.04)', { timeout: 600000 }, async t => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { if (process.env.MIZAN_REQUIRE_BROWSER_TESTS) throw e; return t.skip('Playwright غير متاح في هذه البيئة'); }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const server = http.createServer((req, res) => { const f = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!f.startsWith(root) || !existsSync(f) || extname(f) === '') { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  let browser; try { browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); } catch (e) { server.close(); if (process.env.MIZAN_REQUIRE_BROWSER_TESTS) throw e; return t.skip('تعذّر تشغيل Chromium'); }
  try {
    for (const path of ['/home.html', '/tools.html']) for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light' });
      const page = await ctx.newPage();
      for (let i = 0; i <= 25; i++) {
        const phase = i / 25;
        await page.addInitScript(p => { try { sessionStorage.setItem('mizan.ambient.clock', JSON.stringify({ phase: p, paused: true, at: Date.now() })); } catch {} }, phase);
        await page.goto(base + path, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('body[data-ambient="on"]', { timeout: 20000 }); await page.waitForTimeout(400);
        const bad = (await page.evaluate(AUDIT)).filter(x => !x.g);
        assert.deepEqual(bad.map(b => `${b.ratio} ${b.tag}.${b.cls} «${b.t}»`), [], `${path}/${width}/طور ${phase.toFixed(2)}: نص دون AA`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
});
