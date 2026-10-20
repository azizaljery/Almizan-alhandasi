// يرسم مخططات معيبة من مجموعة إثبات الرفض (evidence/review-proof/corpus) مع حكم المراجع المستقل وأسباب الرفض،
// ويضع الفراغ أو الباب المحوَّر بإطار أحمر. الاستعمال: node scripts/review-proof-render.mjs [أنواع العيوب مفصولة بفواصل]
// (نفس أسلوب scripts/acceptance-render.mjs: خادم محلي لـ dist ورسم renderPlan في Chromium عبر Playwright.)
import http from 'node:http'; import { readFile, readdir } from 'node:fs/promises'; import { existsSync } from 'node:fs'; import { join, normalize, extname } from 'node:path';
import { reviewDesign, reviewDesigns } from '../dist/plan-review.mjs';
import { DISTINCT_DEFAULT } from './defect-corpus.mjs';
const root = new URL('../dist/', import.meta.url).pathname, ev = new URL('../evidence/review-proof/', import.meta.url).pathname;
const PICK = (process.argv[2] || 'no-window-bedroom,window-too-small,hall-strip,bedroom-narrow,corridor-075,wc-door-kitchen,guest-through-hall,bedroom-door-majlis,swing-blocked,overlap-walls,setback-front,kitchen-front,stairs-room-closed,mirror-pair').split(',');
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const HARNESS = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:Tahoma}canvas{display:block}</style></head><body><canvas id="c" width="1400" height="1240" style="width:1400px;height:1240px"></canvas><script type="module">
import { renderPlan, fitView, docBounds, toScreen } from '/draw/editor/render2d.mjs'; import { analyzeDoc } from '/draw/digest.mjs'; import { exteriorWallIds } from '/draw/topology.mjs'; import { parseDoc } from '/draw/doc.mjs'; import { ZONES, zoneOf } from '/design-session.mjs';
window.draw = (raw, levelIndex, info) => { const doc = parseDoc(raw), lv = doc.levels[levelIndex], m = analyzeDoc(doc), L = m.levelById.get(lv.id); const c = document.getElementById('c'), ctx = c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,1400,1240);
const W = 1400, H = 900, b = docBounds(doc, lv.id), view = fitView({ x0: b.x0 - 2.6, y0: b.y0 - 2.6, x1: b.x1 + 2.6, y1: b.y1 + 1.4 }, W, H, 40);
ctx.save(); ctx.translate(0, 70); renderPlan(ctx, { doc, levelId: lv.id, view, W, H, analysis: L ? { rooms: L.rooms, gaps: [], exteriorWallIds: exteriorWallIds(L.analysis) } : null, flags: { grid: false, dims: true, areas: true, fixtures: true, underlay: false, roomDims: true }, roomFill: rm => ZONES[zoneOf(rm.label)].color });
const S = p => toScreen(view, W, H, p);
const room = info.target && L.rooms.find(r => r.id === info.target || (r.labelIds || []).includes(info.target));
if (room) { ctx.strokeStyle = '#c0262d'; ctx.lineWidth = 6; ctx.setLineDash([14, 8]); ctx.beginPath(); room.net.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); }
const op = info.target && L.openings.find(o => o.id === info.target);
if (op) { const s = S(op.p); ctx.strokeStyle = '#c0262d'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(26, op.w * view.scale * 0.9), 0, 2 * Math.PI); ctx.stroke(); }
ctx.restore();
ctx.textAlign = 'right'; ctx.fillStyle = '#1d2a24'; ctx.font = 'bold 26px Tahoma'; ctx.fillText(info.title, 1380, 40);
ctx.font = '17px Tahoma'; ctx.fillStyle = '#55615a'; ctx.fillText(info.sub, 1380, 64);
const y0 = 975; ctx.fillStyle = info.passed ? '#e7f3ea' : '#fbe9e9'; ctx.fillRect(0, y0 - 5, 1400, 1240 - y0 + 5);
ctx.fillStyle = info.passed ? '#1f6b3a' : '#a3161c'; ctx.font = 'bold 28px Tahoma'; ctx.fillText(info.verdict, 1380, y0 + 32);
ctx.fillStyle = '#1d2a24'; ctx.font = '18px Tahoma'; let y = y0 + 66;
for (const line of info.lines) { ctx.fillText(line.length > 140 ? line.slice(0, 138) + '…' : line, 1380, y); y += 28; if (y > 1228) break; }
return true; };
window.ready = true;</script></body></html>`;
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__h.html') { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(HARNESS); }
  const f = normalize(join(root, p)); if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await (await b.newContext({ viewport: { width: 1400, height: 1240 } })).newPage();
await page.goto(base + '/__h.html'); await page.waitForFunction(() => window.ready);
const files = (await readdir(ev + 'corpus')).filter(f => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const baseDoc = async (c, f) => JSON.parse(await readFile(new URL(`../evidence/acceptance/after-4/${c}/${f}`, import.meta.url), 'utf8'));
const out = [];
for (const kind of PICK) {
  const f = files.find(x => x.startsWith(kind + '__')); if (!f) { console.log('لا مستند لـ', kind); continue; }
  const c = JSON.parse(await readFile(ev + 'corpus/' + f, 'utf8'));
  const clean = reviewDesign(await baseDoc(c.case, c.file), c.request, { external: false });
  let r;
  if (c.set) { const both = reviewDesigns([await baseDoc(c.case, c.file), c.doc], c.request, { external: false, distinct: DISTINCT_DEFAULT }); r = both.find(x => x.failedGates.includes('DISTINCT')) || both.find(x => x.index === 1); }
  else r = reviewDesign(c.doc, c.request, { external: false });
  const info = { title: `${c.ar}`, sub: `${c.case}/${c.file.replace('.json', '')} بعد التحوير: ${c.note} — البوابة المتوقعة: ${c.expected.join('، ')}`, target: c.target, passed: r.passed,
    verdict: r.passed ? `مقبول — الدرجة ${r.score} (لم يُكشف!)` : `مرفوض — البوابات الراسبة: ${r.failedGates.join('، ')} — الدرجة ${r.score} (البديل السليم ${clean.score}، ${clean.passed ? 'مقبول' : 'مرفوض'})`,
    lines: r.rejectReasons_ar.slice(0, 8) };
  const n = c.doc.levels.length;
  for (let li = 0; li < n; li++) {
    await page.evaluate(([raw, i, inf]) => window.draw(raw, i, inf), [JSON.stringify(c.doc), li, info]);
    const png = `${kind}__${c.case}-${c.file.replace('.json', '')}${n > 1 ? `-L${li + 1}` : ''}.png`;
    await page.locator('#c').screenshot({ path: ev + png }); out.push(png);
  }
  console.log(kind, r.passed ? 'مقبول' : 'مرفوض', r.failedGates.join('+'), r.score, 'vs', clean.score);
}
await b.close(); server.close();
console.log('صور:', out.length);
