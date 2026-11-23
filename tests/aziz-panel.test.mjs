// لوحة «قرار المراجعة — محرك عزيز»: الشفافية بدل الصمت عند تخفيف الطلب (D4)، والتصغير قبل خفض العدد، ونسبة المصدر، وربطها بنسخة المخطط.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, currentDoc, SESSION_KEY } from '../dist/design-session.mjs';
import { azizPanelModel, WHO_AZIZ, PANEL_DISCLAIMER, PANEL_TITLE } from '../dist/aziz-panel.mjs';
import { ladderSteps } from '../dist/fit-ladder.mjs';
import { reviewDesign } from '../dist/design-review.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/qa-cases.json', import.meta.url), 'utf8')), C = id => fx.cases.find(c => c.id === id);
const L = (width, length) => ({ width, length, floors: 1, floorsExplicit: true, streets: ['s'], entries: ['s'] });
const CUSTOM = { shrink28: { id: 'shrink28', land: L(12.5, 28), text: '3 غرف نوم ومجلس رجال ومطبخ وصالة' } };
async function build(c) {
  const b = buildBrief(c.text, { land: c.land }), out = await generateInitialDesign({ land: c.land, rooms: [], discovery: b.discovery, idea: c.text, counts: b.counts, requirements: b.requirements });
  const session = createSession({ land: c.land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: c.text, result: out });
  return { out, session, doc: currentDoc(session), b };
}
const row = (m, k) => m.rows.find(r => r.key === k);

test('D4: 6 غرف نوم تُخفَّض إلى 2 على 12.5×25: اللوحة تعلن التخفيض بسببه بالأرقام ولا تصمت', { timeout: 120000 }, async () => {
  const { session, doc } = await build(C('x12.5x25-f1-b6j')), m = azizPanelModel(session, doc, {}), r = row(m, 'bedrooms');
  assert.ok(r, 'صف غرف النوم'); assert.equal(r.asked, 6); assert.equal(r.got, 2); assert.equal(r.status, 'cut'); assert.match(r.statusAr, /قُلّص/);
  assert.match(r.reason, /\d+ م²/, 'السبب بالأرقام: المتاح مقابل المطلوب'); assert.match(r.reason, /جرّبتُ تصغير المقاسات/, 'جُرّب التصغير أولًا');
  assert.match(m.headline, /قلّصت/); assert.ok(m.changed >= 1);
  const baths = row(m, 'baths'); assert.ok(baths && baths.got < baths.asked);
  assert.ok(m.candidates.attempts.total > 0 && m.candidates.attempts.rejected.length > 0, 'محاولات مرفوضة بأسبابها');
  for (const a of m.candidates.attempts.rejected) assert.ok(a.reason.length > 0);
});
test('D4: أرض 10×22 بغرفتي نوم: دورات المياه 3→2 معلنة بسببها', { timeout: 120000 }, async () => {
  const { session, doc } = await build(C('n10x22-f1-b2')), m = azizPanelModel(session, doc, {}), r = row(m, 'baths');
  assert.ok(r && r.asked === 3 && r.got === 2 && r.status === 'cut' && r.reason.length > 20);
  assert.equal(row(m, 'bedrooms').status, 'ok');
});
test('التصغير قبل خفض العدد: ترتيب السلّم، وحالة تُحلّ بالتصغير وحده دون خفض غرف', { timeout: 120000 }, async () => {
  const c0 = C('x12.5x25-f1-b6j'), b0 = buildBrief(c0.text, { land: c0.land }), ids = ladderSteps(b0.requirements).map(s => s.id), core = ids.findIndex(i => /^bed:|^majlis$/.test(i));
  assert.ok(ids.indexOf('shrink:hard') >= 0 && ids.indexOf('shrink:min') > ids.indexOf('shrink:hard'));
  assert.ok(ids.indexOf('shrink:min') < core, 'التصغير إلى الحد الأدنى قبل أول خفض لغرف النوم أو المجلس');
  const { out, session, doc } = await build(CUSTOM.shrink28), applied = out.fit.applied.map(a => a.id);
  assert.ok(applied.some(i => /^shrink:/.test(i)), 'صُغّرت المقاسات'); assert.ok(!applied.some(i => /^bed:|^majlis/.test(i)), 'لم تُخفَّض غرف');
  const m = azizPanelModel(session, doc, {}); assert.equal(row(m, 'bedrooms').status, 'ok'); assert.ok(m.rows.some(r => r.status === 'shrunk' && r.statusAr === 'صُغّرت المساحة' && r.reason.length > 10));
  assert.ok(out.fit.trace.some(x => x.kind === 'shrink'));
});
test('نسبة المصدر: وصف عزيز بسطرين، المرفوضات بأسبابها، وعزيز غير متاح لا يُنسب إليه شيء', { timeout: 120000 }, async () => {
  assert.equal(WHO_AZIZ.length, 2); assert.match(WHO_AZIZ[0], /القيود الهندسية الصلبة/); assert.match(WHO_AZIZ[0], /تراكب/); assert.match(WHO_AZIZ[1], /مدقق الميزان/);
  assert.equal(PANEL_DISCLAIMER, 'مراجعة آلية أولية؛ الاعتماد التنفيذي يحتاج المهندس المختص'); assert.equal(PANEL_TITLE, 'قرار المراجعة — محرك عزيز');
  const { session, doc } = await build(C('n12.5x25-f2-b4m')), m = azizPanelModel(session, doc, {});
  assert.equal(m.candidates.available, true); assert.ok(m.candidates.built >= 2); assert.ok(m.candidates.rejected.length >= 1 && m.candidates.rejected.every(r => r.why.length), 'مرشحون مرفوضون بأسبابهم');
  assert.ok(m.candidates.chosen && m.candidates.compare.length >= 1, 'مقارنة المختار بأقرب مرفوض');
  assert.equal(m.sources.find(s => s.id === 'aziz').status, 'pending'); assert.match(m.sources.find(s => s.id === 'generator').line, /مولّد الميزان/);
  const rep = reviewDesign(doc, { requirements: session.input.requirements, land: session.input.land });
  const ok = azizPanelModel(session, doc, { report: rep }); assert.equal(ok.sources.find(s => s.id === 'aziz').status, 'ran'); assert.match(ok.sources.find(s => s.id === 'checker').line, /مدقق الميزان/);
  const off = azizPanelModel(session, doc, { report: { ...rep, aziz: { status: 'unavailable', reason: 'x' } } }); assert.equal(off.sources.find(s => s.id === 'aziz').line, 'عزيز: غير متاح'); assert.ok(!off.sources.find(s => s.id === 'aziz').violations);
  assert.ok(ok.unverified.length >= 1 && ok.unverified.every(u => u.title), 'غير المتحقق منه ظاهر');
});
test('بلا عدد مرشحين من المحرك: «غير متاح» لا رقم مخترع؛ والارتباط بنسخة المخطط', { timeout: 120000 }, async () => {
  const { session, doc } = await build(C('r15x25-f1-b3')); session.designs[session.current].search = null;
  const m = azizPanelModel(session, doc, {}); assert.equal(m.candidates.available, false); assert.equal(m.candidates.built, null); assert.match(m.sources.find(s => s.id === 'generator').line, /غير متاح/);
  assert.match(m.headline, /يحقق كل ما طلبت/); assert.equal(m.stale, false);
  const pv = session.designs[session.current].review?.planVersion; assert.ok(pv, 'نسخة المخطط مختومة عند التوليد');
  assert.equal(azizPanelModel(session, doc, { currentPv: pv }).stale, false);
  const moved = azizPanelModel(session, doc, { currentPv: 'pv:other' }); assert.equal(moved.stale, true); assert.match(moved.staleNote, /تغيّر المخطط/);
});

const AUDIT = `(()=>{
const parse=c=>{const m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
const lum=({r,g,b})=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
const bgOf=el=>{const stack=[];for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0){stack.push(c);if(c.a>=1)break}}let base={r:255,g:255,b:255,a:1};for(const c of stack.reverse())base=over(c,base);return base};
const out=[];const root=document.getElementById("azizPanel");
for(const e of [root,...root.querySelectorAll('*')]){if(!e.childNodes.length)continue;const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());if(!own)continue;const cs=getComputedStyle(e);if(cs.visibility==='hidden'||cs.display==='none')continue;const r=e.getBoundingClientRect();if(r.width<2||r.height<2)continue;
const fg=parse(cs.color),bg=bgOf(e);const f=over(fg,bg),L1=lum(f),L2=lum(bg),ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);const size=parseFloat(cs.fontSize),bold=parseInt(cs.fontWeight)>=700,large=size>=24||(size>=18.66&&bold);
if(ratio<(large?3:4.5))out.push({t:e.textContent.trim().slice(0,30),cls:e.tagName.toLowerCase()+'.'+(e.className||'').toString().replace(/ /g,'.')+' < '+(e.parentElement.tagName.toLowerCase()+'.'+(e.parentElement.className||'').toString().replace(/ /g,'.'))+' < '+(e.parentElement.parentElement?.tagName.toLowerCase()+'.'+(e.parentElement.parentElement?.className||'').toString().replace(/ /g,'.')),ratio:+ratio.toFixed(2),fg:cs.color,bg:'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')'})}
return out})()`;
test('المتصفح: اللوحة يسار المخطط عند 1280 وفوقه عند 390، بلا تمرير أفقي، وتباينها AA فاتحًا وداكنًا', { timeout: 240000 }, async t => {
  const { session } = await build(C('x12.5x25-f1-b6j'));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => { const f = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!f.startsWith(root) || !existsSync(f) || extname(f) === '') { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  let chromium; try { ({ chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs')); } catch { try { ({ chromium } = await import('playwright')); } catch { server.close(); return t.skip('Playwright غير متاح'); } }
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    for (const scheme of ['light', 'dark']) for (const width of [390, 1280]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme })).newPage();
      await page.goto(base + '/design.html'); await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SESSION_KEY, JSON.stringify(session)]); await page.reload();
      await page.waitForSelector('#azizPanel', { timeout: 30000 }); await page.waitForSelector('[data-review-state="fresh"]', { timeout: 30000 }).catch(() => {});
      await page.waitForSelector('#azizPanel [data-az-row="bedrooms"]', { state: 'attached' });
      const g = await page.evaluate(() => { const p = document.getElementById('azizPanel').getBoundingClientRect(), pl = document.querySelector('.plancard').getBoundingClientRect(); const d = document.getElementById('azizPanel'); return { p: { l: p.left, r: p.right, t: p.top }, pl: { l: pl.left, r: pl.right, t: pl.top }, hs: document.documentElement.scrollWidth <= innerWidth, title: d.querySelector('h2').textContent, text: d.textContent, disc: document.getElementById('azDisc').textContent }; });
      assert.ok(g.hs, `بلا تمرير أفقي ${scheme} ${width}`);
      assert.equal(g.title, 'قرار المراجعة — محرك عزيز'); assert.match(g.text, /غرف النوم/); assert.match(g.text, /قُلّص/); assert.match(g.text, /عزيز محرك فحص محلي/); assert.equal(g.disc, 'مراجعة آلية أولية؛ الاعتماد التنفيذي يحتاج المهندس المختص');
      if (width === 1280) assert.ok(g.p.r <= g.pl.l + 1, 'اللوحة على يسار المخطط'); else assert.ok(g.p.t < g.pl.t, 'اللوحة فوق المخطط على الجوال');
      if (width === 390) await page.evaluate(() => document.querySelectorAll('#azizPanel details').forEach(d => { d.open = true; }));
      const bad = await page.evaluate(AUDIT); assert.deepEqual(bad, [], `تباين اللوحة ${scheme} ${width}: ` + JSON.stringify(bad.slice(0, 4)));
      await page.context().close();
    }
  } finally { await browser.close(); server.close(); }
});
