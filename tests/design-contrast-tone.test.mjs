// تباين النص في صفحة التصميم وفق الساعة المثبّتة: النهار (وضع فاتح، سطح أبيض) والليل (سطح داكن).
// الاختبار القائم design-contrast يلتقط ساعة الصفحة بوقت عشوائي فيمر، وهنا نثبّت الطور في sessionStorage
// (mizan.ambient.clock بـpaused) فيُعاد إنتاج العيب الذي يظهر نهارًا فقط. الاختبار لا يغيّر القائم.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, SESSION_KEY } from '../dist/design-session.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';

const AUDIT = `(()=>{
const parse=c=>{const m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
const lum=({r,g,b})=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
const bgOf=el=>{const stack=[];for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0){stack.push(c);if(c.a>=1)break}}let base={r:255,g:255,b:255,a:1};for(const c of stack.reverse())base=over(c,base);return base};
const out=[];const root=document.querySelector("body")||document.body;
for(const e of root.querySelectorAll('*')){if(!e.childNodes.length)continue;const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own)continue;const cs=getComputedStyle(e);if(cs.visibility==='hidden'||cs.display==='none')continue;const r=e.getBoundingClientRect();if(r.width<2||r.height<2)continue;
let g=false;for(let x=e;x;x=x.parentElement){const cx=getComputedStyle(x);if(cx.backgroundImage&&cx.backgroundImage.includes('gradient')){g=true;break}const c=parse(cx.backgroundColor);if(c&&c.a>=1)break}if(g)continue;
const fg=parse(cs.color),bg=bgOf(e);const f=over(fg,bg),L1=lum(f),L2=lum(bg),ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);const size=parseFloat(cs.fontSize),bold=parseInt(cs.fontWeight)>=700,large=size>=24||(size>=18.66&&bold);
if(ratio<(large?3:4.5))out.push({t:e.textContent.trim().slice(0,30),ratio:+ratio.toFixed(2),fg:cs.color,bg:'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')'})}
return out})()`;

// الخلفيات المتدرجة خارج القياس (كما في design-contrast)، فلا تُقاس عناصرها هنا.
// طور الساعة: 0.45 نهارًا (وسط النهار، لا حدّ)، و0.85 ليلًا.
const CLOCKS = [{ phase: 0.45, name: 'النهار' }, { phase: 0.85, name: 'الليل' }];

test('تباين نصوص صفحة التصميم >= AA في النهار والليل (ساعة مثبّتة)', { timeout: 300000 }, async t => {
  let chromium; try { ({ chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs')); } catch { return t.skip('Playwright غير متاح في هذه البيئة'); }
  const text = '3 غرف نوم ومجلس رجال ومجلس نساء ومطبخ وصالة', land = { width: 20, length: 30, floors: 2, streets: ['s'], entries: ['s'] }, brief = buildBrief(text, { land });
  const first = await generateInitialDesign({ land, rooms: [], discovery: brief.discovery, idea: text, counts: brief.counts, requirements: brief.requirements });
  const session = createSession({ land, counts: brief.counts, requirements: brief.requirements, discovery: brief.discovery, idea: text, result: first });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => { const f = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!f.startsWith(root) || !existsSync(f) || extname(f) === '') { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']; let browser;
  try { browser = await chromium.launch({ args }); } catch { try { browser = await chromium.launch({ args, executablePath: '/opt/pw-browsers/chromium' }); } catch { server.close(); return t.skip('تعذّر تشغيل Chromium'); } }
  try {
    for (const clock of CLOCKS) for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light' });
      await ctx.addInitScript(p => { try { sessionStorage.setItem('mizan.ambient.clock', JSON.stringify({ phase: p, paused: true, at: Date.now() })); } catch {} }, clock.phase);
      const page = await ctx.newPage();
      await page.goto(base + '/design.html'); await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SESSION_KEY, JSON.stringify(session)]); await page.reload();
      await page.waitForSelector('[data-review-state="fresh"]', { timeout: 30000 }); await page.waitForTimeout(800);
      const phase = await page.evaluate(() => document.body.dataset.ambientPhase);
      assert.equal(phase, clock.name, `${clock.name}/${width}: الساعة غير مثبتة`);
      const bad = await page.evaluate(AUDIT);
      assert.deepEqual(bad.map(b => `${b.ratio} ${b.fg} على ${b.bg}: ${b.t}`), [], `${clock.name}/${width}: نص دون AA`);
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
});
