// اختبار التطابق الهندسي بين المسقط (2D) والمجسّم (3D): يُبنى المجسّم كما يبنيه الموقع ثم تُقاس هندسته وتُقارن بالمستند.
//   الوضع الافتراضي: صفحة view3d.html الحقيقية في Chromium (WebGL برمجي) — المستند في localStorage كما يسلّمه الاستوديو،
//   والقياس من globalThis.__mizanViewer.built (المشهد المعروض فعلًا) عبر scripts/consistency-2d3d-lib.mjs.
//   --node : المشهد نفسه (buildBuildingScene) في Node بلا متصفح (أسرع؛ يستعمله الاختبار).
// الاستعمال: node scripts/consistency-2d3d.mjs [ملفات أو مجلد=evidence/acceptance/after-9] [--node] [--out evidence/consistency-2d3d/r9] [--shots]
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, normalize, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { stairLayout } from '../dist/draw/stairs3d.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';
import { measure3d, compare2d3d } from './consistency-2d3d-lib.mjs';

const r3 = v => Math.round(v * 1000) / 1000;

/** ما يقوله المستند (2D) بالأرقام التي يجب أن يطابقها المجسّم. */
export function expected2d(doc) {
  let acc = 0;
  const levels = doc.levels.map((lv, i) => { const E = Number.isFinite(lv.elevation) && (i === 0 || lv.elevation > 0) ? lv.elevation : acc, H = lv.height || 3.2; acc = E + H; return { id: lv.id, elevation: E, height: H }; });
  const defT = doc.settings?.defaultThickness ?? 0.2;
  const walls = doc.walls.map(w => {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    return { id: w.id, level: w.level, a: w.a, b: w.b, L, u, n: { x: -u.y, y: u.x }, t: w.t ?? defT, h: w.h ?? null, kind: w.kind || 'wall' };
  }).filter(w => w.L > 0.05);
  // جدار يطابق جدارًا آخر على الخط نفسه بالكامل يُدمج معه في المجسّم (لا وسم خاص به)
  for (const w of walls) {
    const other = walls.find(q => q !== w && q.level === w.level && Math.abs(q.u.x * w.u.y - q.u.y * w.u.x) < 1e-3 && Math.abs((q.a.x - w.a.x) * w.n.x + (q.a.y - w.a.y) * w.n.y) < 0.01
      && (() => { const s = p => (p.x - w.a.x) * w.u.x + (p.y - w.a.y) * w.u.y, a = Math.min(s(q.a), s(q.b)), b = Math.max(s(q.a), s(q.b)); return a <= 0.01 && b >= w.L - 0.01; })() && walls.indexOf(q) < walls.indexOf(w));
    if (other) w.coveredBy = other.id;
  }
  const wallIds = new Set(walls.map(w => w.id));
  const openings = doc.openings.filter(o => wallIds.has(o.wall)).map(o => {
    const w = walls.find(x => x.id === o.wall), lev = levels.find(l => l.id === w.level), H = w.h ?? lev.height, sill = Math.max(0, o.sill ?? 0);
    return { id: o.id, level: w.level, wall: o.wall, kind: o.kind, at: o.at, w: o.w, sill, h: Math.min(H, sill + (o.h ?? 2.1)) - sill };
  });
  const model = analyzeDoc(doc), rooms = [];
  const stairs = (doc.stairs || []).map(s => {
    const li = levels.findIndex(l => l.id === s.level), next = levels[li + 1], rise = next ? next.elevation - levels[li].elevation : levels[li].height;
    const lay = stairLayout(s, rise), pts = lay.steps.flatMap(st => st.poly);
    return { id: s.id, level: s.level, li, hole: lay.hole, toRoof: !next, bbox: { x0: r3(Math.min(...pts.map(p => p.x))), x1: r3(Math.max(...pts.map(p => p.x))), y0: r3(Math.min(...pts.map(p => p.y))), y1: r3(Math.max(...pts.map(p => p.y))) }, top: r3(lay.steps[lay.steps.length - 1].top) };
  });
  const polyArea = p => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q.x * r.y - r.x * q.y; }, 0)) / 2;
  model.levels.forEach((L, li) => {
    for (const r of L.rooms) {
      if (!r.net?.length) continue;
      const inSpace = p => pointInPolygon(p, r.net, 1e-9) && !(r.space?.holes || []).some(h => pointInPolygon(p, h, 1e-9));
      const holeArea = stairs.filter(s => s.li === li - 1 && !s.toRoof && s.hole.every(inSpace)).reduce((a, s) => a + polyArea(s.hole), 0);
      const xs = r.net.map(p => p.x), ys = r.net.map(p => p.y);
      rooms.push({ id: r.id, level: L.level.id, name: r.label?.name || r.name, type: r.type, void: r.type === 'void', area: r.area, holeArea, bbox: { x0: r3(Math.min(...xs)), x1: r3(Math.max(...xs)), y0: r3(Math.min(...ys)), y1: r3(Math.max(...ys)) } });
    }
  });
  return { levels, walls, openings, rooms, stairs };
}

/** المشهد في Node (المبني نفسه دون عرض). */
export async function runNode(doc, tol) {
  const THREE = await import('../dist/vendor/three.module.js');
  const { buildBuildingScene } = await import('../dist/draw/scene3d.mjs');
  const exp = expected2d(doc), built = buildBuildingScene(doc, THREE, { textures: false });
  try { const mea = measure3d(THREE, built, exp); return { exp, mea, mismatches: compare2d3d(exp, mea, tol) }; } finally { built.dispose?.(); }
}

/** صفحة view3d.html الحقيقية في Chromium؛ jobs: [{ key, doc, shot? }] */
export async function runBrowser(jobs, { shotsDir = null, tol } = {}) {
  const root = new URL('../dist/', import.meta.url).pathname, lib = new URL('./consistency-2d3d-lib.mjs', import.meta.url).pathname;
  const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__lib/consistency.mjs') { res.writeHead(200, { 'content-type': MIME['.mjs'] }); return res.end(readFileSync(lib)); }
    const f = normalize(join(root, p)); if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const results = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
    await ctx.route('**/*', route => { const u = new URL(route.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) ? route.continue() : route.abort(); });
    for (const j of jobs) {
      const t0 = Date.now(), p = await ctx.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(base + '/view3d.html?blank=1', { waitUntil: 'domcontentloaded' });
      await p.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), JSON.stringify(j.doc));
      await p.goto(base + '/view3d.html', { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 });
      const exp = expected2d(j.doc);
      const mea = await p.evaluate(async e => { const { measure3d } = await import('/__lib/consistency.mjs'); return measure3d(globalThis.THREE, globalThis.__mizanViewer.built, e); }, exp);
      if (j.shot && shotsDir) { await p.evaluate(() => globalThis.__mizanViewer.setMode('dollhouse')); await p.waitForTimeout(800); await p.locator('#threeHost').screenshot({ path: join(shotsDir, j.key + '-3d.png') }); }
      await p.close();
      results.push({ key: j.key, exp, mea, mismatches: compare2d3d(exp, mea, tol), ms: Date.now() - t0, pageErrors: errors });
    }
  } finally { await b.close(); server.close(); }
  return results;
}

export const summarize = (exp, mm) => ({ walls: exp.walls.length, openings: exp.openings.length, rooms: exp.rooms.length, levels: exp.levels.length, mismatches: mm.length, major: mm.filter(m => m.severity === 'major').length, minor: mm.filter(m => m.severity === 'minor').length, byCode: mm.reduce((a, m) => (a[m.code] = (a[m.code] || 0) + 1, a), {}) });

// ------------------------------------------------------------------------------------------------ CLI
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ROOT = new URL('../', import.meta.url).pathname;
  const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const out = join(ROOT, opt('--out') || 'evidence/consistency-2d3d/r9'); mkdirSync(out, { recursive: true });
  const inputs = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
  const files = [];
  for (const inp of inputs.length ? inputs : ['evidence/acceptance/after-9']) {
    const p = join(ROOT, inp);
    if (statSync(p).isDirectory()) { for (const c of readdirSync(p).filter(d => statSync(join(p, d)).isDirectory()).sort((a, b) => +a.slice(1) - +b.slice(1))) for (const f of readdirSync(join(p, c)).filter(f => /^alt-\d+\.json$/.test(f)).sort()) files.push({ key: `${c}-${f.replace('.json', '')}`, path: join(p, c, f) }); }
    else files.push({ key: inp.split('/').slice(-2).join('-').replace('.json', ''), path: p });
  }
  const jobs = files.map(f => { const j = JSON.parse(readFileSync(f.path, 'utf8')); return { key: f.key, src: relative(ROOT, f.path), doc: j.doc || j, shot: argv.includes('--shots') && /^C7-/.test(f.key) }; });
  const mode = argv.includes('--node') ? 'node' : 'browser';
  const dir = join(out, mode); mkdirSync(dir, { recursive: true });
  const results = [];
  if (mode === 'node') for (const j of jobs) { const t0 = Date.now(); const r = await runNode(j.doc); results.push({ key: j.key, ...r, ms: Date.now() - t0 }); }
  else results.push(...await runBrowser(jobs, { shotsDir: dir }));
  const summary = { mode, note: 'المجسّم مقيس من مشهده المبني فعلًا (أشعة ورؤوس مثلثات) ومقارن بالمستند؛ التسامحات: موضع/عرض/سماكة/ارتفاع 2 سم (وإزاحة حتى 5 سم مع عرض مطابق = طفيفة)، حدود الأرضية 3 سم، امتداد الجدار 16 سم (تقاطعات الزوايا)، المساحة 1%.', docs: [] };
  for (const r of results) {
    const j = jobs.find(x => x.key === r.key);
    writeFileSync(join(dir, r.key + '.json'), JSON.stringify({ source: j.src, mode, ms: r.ms, pageErrors: r.pageErrors || [], summary: summarize(r.exp, r.mismatches), mismatches: r.mismatches, measured: { levels: r.mea.levels, openings: r.mea.openings, stairs: r.mea.stairs } }, null, 1));
    summary.docs.push({ key: r.key, source: j.src, ms: r.ms, ...summarize(r.exp, r.mismatches), pageErrors: (r.pageErrors || []).length, sample: r.mismatches.slice(0, 6).map(m => m.message) });
    const sm = summarize(r.exp, r.mismatches); console.log(r.key.padEnd(12), `${r.ms}ms`, 'جوهرية:', sm.major, 'طفيفة:', sm.minor, JSON.stringify(sm.byCode));
  }
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 1));
}
