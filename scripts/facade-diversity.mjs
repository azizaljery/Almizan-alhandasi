// حزمة قياس تنوّع الواجهات: تصاميم متعددة × أنماط متاحة، ثم درجات اختلاف عددية بين كل زوج.
// الاستعمال: node scripts/facade-diversity.mjs [port=8206] [outDir=/tmp/claude-0/diversity]
// العتبات تجريبية وغير معايَرة (انظر THRESHOLDS) — هي مؤشر مقارن لا حكم جمالي.
import { createRequire } from 'module'; const { chromium } = createRequire('/tmp/claude-0/famwt/package.json')('playwright');
import { createServer } from 'http'; import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'fs'; import { resolve, extname, join, dirname } from 'path'; import { fileURLToPath } from 'url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../dist');
const port = +(process.argv[2] || 8206), out = process.argv[3] || '/tmp/claude-0/diversity';
mkdirSync(join(out, 'docs'), { recursive: true }); mkdirSync(join(out, 'shots'), { recursive: true });
export const THRESHOLDS = { note: 'تجريبية وغير معايَرة على عيّنة بشرية', distinct: 0.14, similar: 0.07 };
const { designList } = await import('../tests/fixtures/facade-designs.mjs');
const { rankStyles } = await import('../dist/facade-j/facade-realism/choose-style.mjs');
const ALL = ['J', 'M', 'N', 'H', 'S', 'C'], dir = join(root, 'facade-j/facade-realism/styles');
const present = new Set(ALL.filter(id => id === 'J' || existsSync(join(dir, { M: 'modern-light', N: 'najdi', H: 'hijazi', S: 'salmani', C: 'classic' }[id] + '.mjs'))));
const styles = ALL.filter(s => present.has(s)); console.log('styles:', styles.join(','), '(مفقود: ' + ALL.filter(s => !present.has(s)).join(',') + ')');
const designs = designList(); for (const [id, d] of designs) writeFileSync(join(out, 'docs', id + '.json'), JSON.stringify(d));
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };
const srv = createServer((q, s) => { let f = resolve(root, '.' + decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (existsSync(f) && statSync(f).isDirectory()) f += '/index.html'; if (existsSync(f)) { s.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); } else { s.writeHead(404); s.end(); } }).listen(port);
const b = await chromium.launch(); const O = 'http://127.0.0.1:' + port;
const jobs = []; for (const [id] of designs) for (const s of styles) jobs.push({ name: `${id}_${s}_0`, id, s, seed: 0 });
jobs.push({ name: `${designs[0][0]}_${styles[styles.length - 1]}_1`, id: designs[0][0], s: styles[styles.length - 1], seed: 1 }); // بديل آخر
// «بديل آخر»: لأول 3 تصاميم، بديلان معماريان (منطقتان مختلفتان) ضمن الطراز الأول المقترح
const { createHistory, markShown, nextAlternative } = await import('../dist/facade-j/facade-realism/alternatives.mjs');
const { baseRegion, regionId } = await import('../dist/facade-j/facade-realism/variation.mjs');
for (const [id, d] of designs.slice(0, 3)) { const s = rankStyles(d, '').map(x => x.id).find(x => styles.includes(x)), h = createHistory(); markShown(h, s, baseRegion(d));
  for (const n of [1, 2]) { const r = nextAlternative(d, s, h); if (r.region) jobs.push({ name: `${id}_${s}_r${n}`, id, s, seed: 0, region: regionId(r.region) }); } }
const status = {};
for (const j of jobs) {
  const f = join(out, 'shots', j.name + '.png'); if (process.env.REUSE && existsSync(f)) { status[j.name] = 'reused'; continue; }
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(O + '/home.html'); await pg.evaluate(r => localStorage.setItem('mizan.studio.doc.v1', r), readFileSync(join(out, 'docs', j.id + '.json'), 'utf8'));
  await pg.goto(O + `/facade-j/?hq=1&v=A&src=studio&cam=auto&style=${j.s}&seed=${j.seed}${j.region ? '&region=' + j.region : ''}&floors=${designs.find(d => d[0] === j.id)[1].levels.length}`);
  try { await pg.waitForFunction(() => globalThis.__FR?.ready === true, null, { timeout: 240000 }); } catch { errs.push('TIMEOUT'); }
  const info = await pg.evaluate(() => globalThis.__FR).catch(() => null);
  if (info && !info.error) { await (await pg.$('#fr')).screenshot({ path: f }); status[j.name] = 'ok'; } else status[j.name] = 'ERR ' + (info?.error || errs.join('|'));
  console.log(status[j.name], j.name); await pg.close();
}
// ---- القياس داخل المتصفح (canvas) ----
const imgs = {}; for (const j of jobs) if (status[j.name] === 'ok' || status[j.name] === 'reused') imgs[j.name] = readFileSync(join(out, 'shots', j.name + '.png')).toString('base64');
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } }); await pg.goto('about:blank');
const res = await pg.evaluate(async ({ imgs, jobs, designs, styles }) => {
  const W = 64, H = 40, feats = {};
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
  for (const [n, src] of Object.entries(imgs)) {
    const im = await load(src), c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H), hist = new Float32Array(512);
    for (let i = 0; i < W * H; i++) { const r = d[i * 4], gg = d[i * 4 + 1], bb = d[i * 4 + 2]; g[i] = (.299 * r + .587 * gg + .114 * bb) / 255; hist[(r >> 5) * 64 + (gg >> 5) * 8 + (bb >> 5)]++; }
    for (let i = 0; i < 512; i++) hist[i] /= W * H;
    const e = new Float32Array(W * H); for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) { const k = y * W + xx, gx = g[k + 1] - g[k - 1], gy = g[k + W] - g[k - W]; e[k] = Math.min(1, Math.hypot(gx, gy) * 2); }
    feats[n] = { g, e, hist };
  }
  const score = (a, b) => { let sg = 0, se = 0, sh = 0; for (let i = 0; i < W * H; i++) { sg += Math.abs(a.g[i] - b.g[i]); se += Math.abs(a.e[i] - b.e[i]); } for (let i = 0; i < 512; i++) sh += Math.abs(a.hist[i] - b.hist[i]); sg /= W * H; se /= W * H; sh /= 2;
    return { grey: sg, edge: se, hist: sh, combined: .4 * sg * 2 + .3 * se * 4 + .3 * sh }; };
  const names = Object.keys(feats), pairs = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pairs.push({ a: names[i], b: names[j], ...score(feats[names[i]], feats[names[j]]) });
  // صورة المصفوفة
  const TW = 300, TH = 188, pad = 6, lab = 26, cv = document.createElement('canvas'); cv.width = styles.length * (TW + pad) + 90; cv.height = designs.length * (TH + pad) + lab; document.body.appendChild(cv);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.fillStyle = '#000'; cx.font = '16px sans-serif';
  styles.forEach((s, ci) => cx.fillText(s, 90 + ci * (TW + pad) + TW / 2, 18));
  for (let ri = 0; ri < designs.length; ri++) { cx.fillText(designs[ri], 6, lab + ri * (TH + pad) + TH / 2); for (let ci = 0; ci < styles.length; ci++) { const n = `${designs[ri]}_${styles[ci]}_0`; if (imgs[n]) cx.drawImage(await load(imgs[n]), 90 + ci * (TW + pad), lab + ri * (TH + pad), TW, TH); } }
  return { pairs, matrix: cv.toDataURL('image/png').split(',')[1] };
}, { imgs, jobs, designs: designs.map(d => d[0]), styles });
writeFileSync(join(out, 'matrix.png'), Buffer.from(res.matrix, 'base64'));
// ---- تجميع ----
const parse = n => { const [d, s, a] = n.split('_'); return { d, s, a }; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, mean = (f) => avg(res.pairs.filter(f).map(p => p.combined));
const A = p => parse(p.a), B = p => parse(p.b);
const sameStyleDiffDesign = res.pairs.filter(p => A(p).s === B(p).s && A(p).d !== B(p).d && A(p).a === '0' && B(p).a === '0');
const sameDesignDiffStyle = res.pairs.filter(p => A(p).d === B(p).d && A(p).s !== B(p).s && A(p).a === '0' && B(p).a === '0');
const altPairs = res.pairs.filter(p => A(p).d === B(p).d && A(p).s === B(p).s && A(p).a !== B(p).a);
const diffAll = res.pairs.filter(p => A(p).a === '0' && B(p).a === '0' && !(A(p).s === B(p).s && A(p).d === B(p).d));
const rank = Object.fromEntries(designs.map(([id, d]) => [id, rankStyles(d, '').slice(0, 3).map(x => x.id + ':' + x.reason)]));
const report = { thresholds: THRESHOLDS, styles, missingStyles: ALL.filter(s => !present.has(s)), status, rankTop3: rank,
  summary: { sameStyleDifferentDesign: mean(p => sameStyleDiffDesign.includes(p)), sameDesignDifferentStyle: mean(p => sameDesignDiffStyle.includes(p)), alternativeSeed: altPairs.map(p => ({ pair: [p.a, p.b], ...p })),
    pairsBelowSimilar: diffAll.filter(p => p.combined < THRESHOLDS.similar).map(p => [p.a, p.b, +p.combined.toFixed(3)]), pairsAboveDistinct: diffAll.filter(p => p.combined >= THRESHOLDS.distinct).length, totalPairs: diffAll.length },
  pairs: res.pairs.map(p => ({ ...p, grey: +p.grey.toFixed(4), edge: +p.edge.toFixed(4), hist: +p.hist.toFixed(4), combined: +p.combined.toFixed(4) })) };
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1)); console.log(JSON.stringify(report.summary, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v).slice(0, 1500));
await b.close(); srv.close();
