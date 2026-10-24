// يرسم صور الأدلة لمرحلة: مسقط كل بديل (كل دور) بالأبعاد والمناطق، ومجسّم ثلاثي الأبعاد لأفضل بديل في كل حالة.
// الاستعمال: node scripts/acceptance-render.mjs <stage> [نمط الحالات] [--engine v1|v2] [--no3d]
// (المحرك لا يغيّر الرسم هنا: الصور تُرسم من مستندات المرحلة نفسها؛ يُقبل العلم للاتساق مع acceptance-run.)
import http from 'node:http'; import { readFile, readdir } from 'node:fs/promises'; import { existsSync, readFileSync } from 'node:fs'; import { join, normalize, extname } from 'node:path';
const argv = process.argv.slice(2), flags = new Set(argv.filter(a => a.startsWith('--')));
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--engine');
const stage = pos[0] || 'before', only = pos[1] ? new RegExp(pos[1]) : null, no3d = flags.has('--no3d');
const root = new URL('../dist/', import.meta.url).pathname, ev = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
const HARNESS = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:Tahoma}canvas{display:block}</style></head><body><canvas id="c" width="1400" height="1000" style="width:1400px;height:1000px"></canvas><script type="module">
import { renderPlan, fitView, docBounds } from '/draw/editor/render2d.mjs'; import { analyzeDoc } from '/draw/digest.mjs'; import { exteriorWallIds } from '/draw/topology.mjs'; import { parseDoc } from '/draw/doc.mjs'; import { ZONES, zoneOf, thumbLabels } from '/design-session.mjs';
const sizeC = h => { const c = document.getElementById('c'); if (c.height !== h) { c.height = h; c.style.height = h + 'px'; } return c; };
const wrapAr = (ctx, text, w) => { const out = []; for (const para of String(text).split('\\n')) { let line = ''; for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); } return out; };
window.draw = (raw, levelIndex, title) => { sizeC(1000); const doc = parseDoc(raw), lv = doc.levels[levelIndex], m = analyzeDoc(doc), L = m.levelById.get(lv.id); const c = document.getElementById('c'), ctx = c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,1400,1000);
const b0 = docBounds(doc, lv.id), pp = doc.plot?.polygon || [], b = pp.length ? { x0: Math.min(b0.x0, ...pp.map(q => q.x)) + 1.6, y0: Math.min(b0.y0, ...pp.map(q => q.y)) + 1.6, x1: Math.max(b0.x1, ...pp.map(q => q.x)) - 1.6, y1: Math.max(b0.y1, ...pp.map(q => q.y)) - 1.6 } : b0, view = fitView({ x0: Math.min(b.x0, b0.x0) - 2.6, y0: Math.min(b.y0, b0.y0) - 2.6, x1: Math.max(b.x1, b0.x1) + 2.6, y1: Math.max(b.y1, b0.y1) + 1.4 }, 1400, 940, 40);
ctx.save(); ctx.translate(0, 60); renderPlan(ctx, { doc, levelId: lv.id, view, W: 1400, H: 940, analysis: L ? { rooms: L.rooms, gaps: [], exteriorWallIds: exteriorWallIds(L.analysis) } : null, flags: { grid: false, dims: true, areas: true, fixtures: true, underlay: false, roomDims: true }, roomFill: rm => ZONES[zoneOf(rm.label)].color }); ctx.restore();
ctx.fillStyle = '#1d2a24'; ctx.font = 'bold 26px Tahoma'; ctx.textAlign = 'right'; ctx.fillText(title + (doc.levels.length > 1 ? ' — ' + lv.name : ''), 1380, 40); return true; };
const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
// (الجولة السادسة عشرة) صورة الخيارات كما تُعرض للعميل قبل أن يختار: جملة واحدة، والخيارات المرقّمة، ولكل خيار مصغّر مخططه — بلا سطر «اختار العميل»
window.drawOptions = (title, message, options) => { const W = 1400, c0 = sizeC(1000), ctx0 = c0.getContext('2d'); ctx0.font = '19px Tahoma'; const lines = wrapAr(ctx0, message, 1340);
  const H = 120 + lines.length * 30 + 330; const c = sizeC(H), ctx = c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1d2a24'; ctx.font = 'bold 24px Tahoma'; ctx.textAlign = 'right'; ctx.fillText(title, 1380, 40);
  ctx.font = '19px Tahoma'; let y = 84; for (const l of lines) { ctx.fillText(l, 1380, y); y += 30; }
  const n = options.length, bw = Math.min(330, (W - 40) / n - 14); let x = 1380;
  for (const o of options) { const bx = x - bw; ctx.fillStyle = '#f4efe4'; ctx.fillRect(bx, y, bw, 300); ctx.strokeStyle = '#c9b88f'; ctx.strokeRect(bx, y, bw, 300);
    if (o.raw) { const d = parseDoc(o.raw), lv = d.levels[0], m = analyzeDoc(d), L = m.levelById.get(lv.id), bb = docBounds(d, lv.id), v = fitView({ x0: bb.x0 - .5, y0: bb.y0 - .5, x1: bb.x1 + .5, y1: bb.y1 + .5 }, bw - 16, 210, 4);
      ctx.save(); ctx.translate(bx + 8, y + 8); ctx.beginPath(); ctx.rect(0, 0, bw - 16, 210); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, bw - 16, 210); renderPlan(ctx, { doc: d, levelId: lv.id, view: v, W: bw - 16, H: 210, analysis: L ? { rooms: L.rooms, gaps: [], exteriorWallIds: exteriorWallIds(L.analysis) } : null, flags: { grid: false, dims: false, areas: false, fixtures: false, underlay: false, roomDims: false }, roomFill: rm => ZONES[zoneOf(rm.label)].color });
      if (L) { ctx.font = 'bold 14px Tahoma'; ctx.textAlign = 'center'; for (const t of thumbLabels(L.rooms)) { const tx = (t.x - v.cx) * v.scale + (bw - 16) / 2, ty = (v.cy - t.y) * v.scale + 105; ctx.fillStyle = 'rgba(255,255,255,.85)'; const w = ctx.measureText(t.text).width + 8; ctx.fillRect(tx - w / 2, ty - 13, w, 18); ctx.fillStyle = '#1d2a24'; ctx.fillText(t.text, tx, ty); } ctx.textAlign = 'right'; }
      ctx.restore(); }
    else { ctx.fillStyle = '#8a7a5a'; ctx.font = '15px Tahoma'; ctx.textAlign = 'center'; ctx.fillText('لا مخطط جديد', bx + bw / 2, y + 110); ctx.textAlign = 'right'; }
    // (الجولة السابعة عشرة) وسم صريح على كل خيار: يحقق طلبك / لا يحقق طلبك
    if (o.achieves === false || o.achieves === true) { const tag = o.achieves ? 'يحقق طلبك' : 'لا يحقق طلبك'; ctx.font = 'bold 15px Tahoma'; const tw = ctx.measureText(tag).width + 16; ctx.fillStyle = o.achieves ? '#2e6b3a' : '#b3261e'; ctx.fillRect(bx + bw - 8 - tw, y + 12, tw, 24); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(tag, bx + bw - 16, y + 30); }
    ctx.fillStyle = '#1d2a24'; ctx.font = 'bold 16px Tahoma'; let ty = y + 240; for (const l of wrapAr(ctx, '(' + o.n + ') ' + o.text, bw - 16).slice(0, 3)) { ctx.fillText(l, bx + bw - 8, ty); ty += 21; }
    x = bx - 14; }
  ctx.font = '13px Tahoma'; ctx.fillStyle = '#1d2a24'; ctx.fillText('الصورة كما تُعرض قبل اختيار العميل. مقترح معماري مبدئي — ليس مخططًا تنفيذيًا معتمدًا، ويحتاج تحققًا إنشائيًا مستقلًا.', 1380, H - 12); return true; };
window.drawDiff = async (rawB, rawA, title, notes = [], facades = null) => { const { diffFingerprint } = await import('/plan-fingerprint.mjs'); const B = parseDoc(rawB), A = parseDoc(rawA), D = diffFingerprint(B, A);
  const fac = facades ? await Promise.all(facades.map(loadImg)) : null, FH = fac ? 420 : 0;
  // (الجولة الخامسة عشرة) سبب عدم التنفيذ أو التحقق الجزئي والخيارات المرقّمة تحت المسقطين — الصورة تحمل ما قيل للعميل
  let c = sizeC(1000), ctx = c.getContext('2d'); ctx.font = '17px Tahoma'; const wrapped = []; for (const n of notes) { const isHead = n.startsWith('#'); ctx.font = isHead ? 'bold 18px Tahoma' : '17px Tahoma'; for (const l of wrapAr(ctx, isHead ? n.slice(1) : n, 1350)) wrapped.push([l, isHead]); }
  const H = 1000 + FH + (wrapped.length ? wrapped.length * 27 + 30 : 0); c = sizeC(H); ctx = c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,1400,H);
const lv = A.levels[0], bb = docBounds(A, lv.id), b0 = docBounds(B, B.levels[0].id), box = { x0: Math.min(bb.x0, b0.x0) - 1.2, y0: Math.min(bb.y0, b0.y0) - 1.2, x1: Math.max(bb.x1, b0.x1) + 1.2, y1: Math.max(bb.y1, b0.y1) + 1.2 }, view = fitView(box, 690, 860, 20);
const half = (doc, x, marks, label) => { const m = analyzeDoc(doc), L = m.levelById.get(doc.levels[0].id); ctx.save(); ctx.translate(x, 96); ctx.beginPath(); ctx.rect(0,0,690,860); ctx.clip(); renderPlan(ctx, { doc, levelId: doc.levels[0].id, view, W: 690, H: 860, analysis: L ? { rooms: L.rooms, gaps: [], exteriorWallIds: exteriorWallIds(L.analysis) } : null, flags: { grid: false, dims: false, areas: true, fixtures: true, underlay: false, roomDims: false }, roomFill: rm => ZONES[zoneOf(rm.label)].color });
  const X = v => (v - view.cx) * view.scale + 345, Y = v => (view.cy - v) * view.scale + 430;
  for (const [e, col, dash, fill] of marks) { const b = e.box; if (!b) continue; ctx.setLineDash(dash ? [7,4] : []); ctx.strokeStyle = col; ctx.lineWidth = e.kind === 'room' ? 2.5 : 3; const r = [X(b.x0) - (e.kind === 'room' ? 0 : 3), Y(b.y1) - (e.kind === 'room' ? 0 : 3), (b.x1 - b.x0) * view.scale + (e.kind === 'room' ? 0 : 6), (b.y1 - b.y0) * view.scale + (e.kind === 'room' ? 0 : 6)]; if (fill && e.kind === 'room') { ctx.fillStyle = fill; ctx.fillRect(...r); } ctx.strokeRect(...r); }
  ctx.restore(); ctx.fillStyle = '#1d2a24'; ctx.font = 'bold 20px Tahoma'; ctx.textAlign = 'center'; ctx.fillText(label, x + 345, 92); };
const pl = e => e.kind !== 'fixture';
half(B, 710, [...D.changed.filter(pl).map(e => [{ ...e, box: e.before?.box || e.box }, '#b5651d', false, 'rgba(181,101,29,.15)']), ...D.removed.filter(pl).map(e => [e, '#b5651d', true, 'rgba(181,101,29,.15)'])], 'قبل');
half(A, 0, [...D.changed.filter(pl).map(e => [e, '#c62828', false, 'rgba(198,40,40,.16)']), ...D.added.filter(pl).map(e => [e, '#c62828', false, 'rgba(198,40,40,.16)'])], 'بعد');
ctx.fillStyle = '#1d2a24'; ctx.font = 'bold 24px Tahoma'; ctx.textAlign = 'right'; ctx.fillText(title, 1380, 36); ctx.font = '15px Tahoma'; { const nm = [...new Set([...D.changed, ...D.added, ...D.removed].filter(e => e.kind === 'room').map(e => e.name || e.label || e.after?.name || e.before?.name).filter(Boolean))]; ctx.fillText(D.identical ? 'لم يتغيّر شيء في المخطط — كما هو حرفيًا' : nm.length ? ('ما تغيّر (مظلل): ' + nm.slice(0, 9).join('، ') + (nm.length > 9 ? '…' : '')).slice(0, 170) : 'تغيّرت جدران أو أبواب أو نوافذ (مظللة)؛ الغرف نفسها في أماكنها', 1380, 60); }
ctx.font = '13px Tahoma'; ctx.fillText('المقياس نفسه في الصورتين (المسطرة 5 م). المظلل: ما تغيّر (بني قبل، أحمر بعد)؛ المتقطع: ما أزيل. مقترح معماري مبدئي — ليس مخططًا تنفيذيًا معتمدًا، ويحتاج تحققًا إنشائيًا مستقلًا.', 1380, 985);
  // (الجولة السادسة عشرة) تعديل الواجهة: الواجهة قبل وبعد في صورة الفرق نفسها (المطلوب تغييره هو الواجهة)
  if (fac) { const fw = 680, fh = 380; ctx.drawImage(fac[0], 710, 1030, fw, fh); ctx.drawImage(fac[1], 10, 1030, fw, fh); ctx.fillStyle = '#1d2a24'; ctx.font = 'bold 20px Tahoma'; ctx.textAlign = 'center'; ctx.fillText('الواجهة قبل', 1050, 1022); ctx.fillText('الواجهة بعد', 350, 1022); ctx.textAlign = 'right'; }
  if (wrapped.length) { ctx.fillStyle = '#f4efe4'; ctx.fillRect(10, 1000 + FH, 1380, H - 1010 - FH); let y = 1030 + FH; for (const [l, head] of wrapped) { ctx.font = head ? 'bold 18px Tahoma' : '17px Tahoma'; ctx.fillStyle = head ? '#7a3e12' : '#1d2a24'; ctx.fillText(l, 1375, y); y += 27; } }
  return D.counts; };
window.ready = true;</script></body></html>`;
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__h.html') { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(HARNESS); }
  const f = normalize(join(root, p)); if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const p = await ctx.newPage(); await p.goto(base + '/__h.html'); await p.waitForFunction(() => window.ready);
const cases = (await readdir(ev, { withFileTypes: true })).filter(d => d.isDirectory() && (!only || only.test(d.name))).map(d => d.name).sort((a, b) => +a.slice(1) - +b.slice(1));
let id = null;
// صورة الواجهة الأمامية (ارتفاع منخفض من جهة المدخل)؛ تعيد true إن نجحت
const facadeShot = async (rawDoc, name) => {
  const dd = JSON.parse(rawDoc), az = { s: 0, n: 180, e: 90, w: -90 }[dd.entry || 's'] ?? 0;
  const z = await ctx.newPage(); await z.setViewportSize({ width: 1360, height: 860 }); let ok = false;
  try {
    await z.goto(base + '/home.html'); await z.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), rawDoc); await z.goto(base + '/view3d.html');
    await z.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 });
    await z.evaluate(() => { const e = document.getElementById('hour'); e.value = 10; e.dispatchEvent(new Event('input')); });
    await z.evaluate(a => { const v = globalThis.__mizanViewer; v.frameBuilding(); v.orbitTo({ azimuthDeg: a, elevationDeg: 9, distance: v.orbit.dist * .78 }); }, az + 18);
    await z.waitForTimeout(1500); await z.locator('#threeHost').screenshot({ path: ev + id + '/' + name }); ok = true;
  } catch (e) { console.log(id, name, 'فشل:', e.message); }
  await z.close(); return ok;
};
for (id of cases) {
  const files = (await readdir(ev + id)).filter(f => f.endsWith('.json') && f !== 'result.json');
  for (const f of files) {
    const raw = await readFile(ev + id + '/' + f, 'utf8'), n = JSON.parse(raw).levels.length;
    for (let li = 0; li < n; li++) { await p.evaluate(([r, i, t]) => window.draw(r, i, t), [raw, li, `${id} — ${f.replace('.json', '')}`]); await p.locator('#c').screenshot({ path: ev + id + '/' + f.replace('.json', '') + (n > 1 ? `-L${li + 1}` : '') + '.png' }); }
  }
  // (الجولة الرابعة عشرة) فرق كل تعديل مرسومًا (قبل | بعد) بالبصمة الهندسية: ما تغيّر مظلل وما أزيل متقطع
  const diffs = [];
  // نص الرد على العميل لكل تعديل (من result.json): التحقق الجزئي أو السبب، والخيارات المرقّمة، وما اختير
  let res = null; try { res = JSON.parse(await readFile(ev + id + '/result.json', 'utf8')); } catch { res = null; }
  const notesOf = e => {
    if (!e) return [];
    const out = [];
    if (e.partial?.plain_ar || e.partial?.text_ar) out.push('#متحقق جزئيًا: ' + (e.partial.plain_ar || e.partial.text_ar));
    else if (e.question_ar || (typeof e.consentAsked === 'string' && e.consentAsked)) out.push('#لم يُنفَّذ على هذا المخطط — السبب: ' + String(e.question_ar || e.consentAsked).replace(/ ?(?:؛ )?لتحقيقه حرفيًا: الخيارات[\s\S]*$| ?اختر رقمًا[\s\S]*$/, ''));
    else if (e.reply_ar || e.reply?.summary_ar) out.push('#الرد: ' + (e.reply_ar && !e.notDone ? e.reply_ar : e.reply?.summary_ar || e.reply_ar));
    // (الجولة السادسة عشرة) هذه الصورة بعد الاختيار: الاختيار في اختبار القبول محاكاة ويُكتب كذلك؛ الخيارات نفسها في صورة -options قبل الاختيار
    if (e.choice) out.push(`#بعد الاختيار (محاكاة اختبار القبول، لا اختيار عميل حقيقي): الخيار (${e.choice}) — ${(e.reply_ar || e.reply?.summary_ar || '').slice(0, 220)}`);
    return out;
  };
  // صورة الخيارات قبل الاختيار: رسالة العميل والخيارات بمصغّراتها (المعروض، أو المقترح المحفوظ، أو البديل المعروض)
  const optionShots = [];
  const addOptions = async (e, cur, prefix, out) => {
    if (!e?.options?.length) return;
    const msg = String(e.question_ar || (typeof e.consentAsked === 'string' ? e.consentAsked : '') || '').replace(/ ?اختر رقمًا[\s\S]*$/, '');
    const opts = [];
    for (const o of e.options) { let raw = null;
      if (o.thumb?.src === 'current') raw = await readFile(ev + id + '/' + cur, 'utf8');
      else if (o.thumb?.src === 'pending' && files.includes(`${prefix}-opt-${o.thumb.key}.json`)) raw = await readFile(ev + id + `/${prefix}-opt-${o.thumb.key}.json`, 'utf8');
      else if (o.thumb?.src === 'alt' && files.includes(`alt-${o.thumb.index + 1}.json`)) raw = await readFile(ev + id + `/alt-${o.thumb.index + 1}.json`, 'utf8');
      opts.push({ n: o.n, text: o.text_ar, raw, achieves: o.achieves }); }
    optionShots.push([`${id} — خيارات التعديل (${cur.replace('.json', '')})`, msg + ' اختر رقمًا:', opts, out]);
  };
  await addOptions(res?.edit, 'edit-before.json', 'edit', 'edit-options.png');
  for (const e of res?.editAll || []) await addOptions(e, `alt-${e.alt}.json`, `edit-alt${e.alt}`, `edit-alt${e.alt}-options.png`);
  if (files.includes('edit-before.json') && files.includes('edit-after.json')) diffs.push(['edit-before.json', 'edit-after.json', 'edit-diff.png', notesOf(res?.edit)]);
  for (const f of files) { const m = /^edit-alt(\d+)-after\.json$/.exec(f); if (m && files.includes(`alt-${m[1]}.json`)) diffs.push([`alt-${m[1]}.json`, f, `edit-alt${m[1]}-diff.png`, notesOf((res?.editAll || []).find(x => x.alt === +m[1]))]); }
  // مقترحات الخيارات (منطقة واحدة / توزيع جديد) مرسومة فرقًا عن المخطط المعروض
  for (const f of files) { const m = /^edit-alt(\d+)-opt-(zone|full)\.json$/.exec(f); if (m && files.includes(`alt-${m[1]}.json`)) diffs.push([`alt-${m[1]}.json`, f, `edit-alt${m[1]}-opt-${m[2]}-diff.png`, [`#خيار «${m[2] === 'zone' ? 'إعادة توزيع منطقة واحدة' : 'توزيع جديد غير البدائل المعروضة'}» كما عُرض على العميل (لم يُختر في هذا الدليل؛ يُعتمد فقط بموافقته)`]]); }
  for (const [t, m, o, out] of optionShots) { await p.evaluate(([a, b, c]) => window.drawOptions(a, b, c), [t, m, o]); await p.locator('#c').screenshot({ path: ev + id + '/' + out }); }
  for (const [bf, af, out, notes] of diffs) {
    const rb = await readFile(ev + id + '/' + bf, 'utf8'), ra = await readFile(ev + id + '/' + af, 'utf8');
    // تعديل واجهة (مادة الواجهة تغيّرت بين المستندين): صورتا الواجهة قبل وبعد تُرسمان وتدخلان صورة الفرق
    let fac = null; const fb = JSON.stringify(JSON.parse(rb).finish?.facade || {}), fa = JSON.stringify(JSON.parse(ra).finish?.facade || {});
    if (!no3d && fb !== fa) { const nb = out.replace('-diff.png', '-facade-before.png').replace('edit-diff.png', 'facade-edit-before.png'), na = out.replace('-diff.png', '-facade-after.png').replace('edit-diff.png', 'facade-edit-after.png'); const okB = await facadeShot(rb, nb), okA = await facadeShot(ra, na); if (okB && okA) fac = [nb, na].map(f => 'data:image/png;base64,' + readFileSync(ev + id + '/' + f).toString('base64')); }
    await p.evaluate(([x, y, t, n, f]) => window.drawDiff(x, y, t, n, f), [rb, ra, `${id} — فرق التعديل: ${bf.replace('.json', '')} ← ${af.replace('.json', '')}`, notes || [], fac]); await p.locator('#c').screenshot({ path: ev + id + '/' + out }); }
  if (no3d) { console.log(id, 'صور:', files.length); continue; }
  // ثلاثي الأبعاد لأفضل بديل
  const raw = await readFile(ev + id + '/' + (files.includes('alt-1.json') ? 'alt-1.json' : files[0]), 'utf8');
  const q = await ctx.newPage(); await q.setViewportSize({ width: 1360, height: 860 });
  await q.goto(base + '/home.html'); await q.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), raw);
  await q.goto(base + '/view3d.html');
  try { await q.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 }); await q.evaluate(() => { const e = document.getElementById('hour'); e.value = 9; e.dispatchEvent(new Event('input')); }); await q.waitForTimeout(1500); await q.locator('#threeHost').screenshot({ path: ev + id + '/3d-alt-1.png' }); await q.evaluate(() => globalThis.__mizanViewer.setMode('dollhouse')); await q.waitForTimeout(1500); await q.locator('#threeHost').screenshot({ path: ev + id + '/3d-alt-1-dollhouse.png' }); }
  catch (e) { console.log(id, '3D فشل:', e.message); }
  await q.close();
  // (الجولة الثانية عشرة) صورة الواجهة الأمامية (ارتفاع منخفض من جهة المدخل): التظليل والدروة والمادة والشارعان في أرض الزاوية؛
  // وفي تعديل الواجهة (C9) صورة الواجهة قبل التعديل وبعده من المستندين نفسيهما
  await facadeShot(raw, 'facade-alt-1.png');
  // (الجولة العاشرة) السلم في ثلاثي الأبعاد لكل بديل فيه سلم: الدور الأرضي وحده (القلبات والبسطة) ثم الدور العلوي (الفتحة والدرابزين)
  for (const f of files.filter(x => /^alt-\d+\.json$/.test(x))) {
    const rawS = await readFile(ev + id + '/' + f, 'utf8'), d = JSON.parse(rawS); if (!(d.stairs || []).length || d.levels.length < 2) continue;
    const s0 = d.stairs[0], L0 = d.levels.find(l => l.id === s0.level) || d.levels[0], L1 = d.levels[d.levels.indexOf(L0) + 1];
    const z = await ctx.newPage(); await z.setViewportSize({ width: 1100, height: 760 });
    try {
      await z.goto(base + '/home.html'); await z.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), rawS); await z.goto(base + '/view3d.html');
      await z.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 });
      // مركز السلم من تخطيطه نفسه (stairLayout) لا من نقطة البدء
      const c = await z.evaluate(async ([st, rise]) => { const { stairLayout } = await import('/draw/stairs3d.mjs'); const lay = stairLayout(st, rise); const pts = lay.steps.flatMap(x => x.poly); const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; }, [s0, (L1?.elevation ?? 3.2) - (L0.elevation || 0)]);
      const shot = async (lvl, elev, name) => { await z.evaluate(([lv, e, cx, cy]) => { const v = globalThis.__mizanViewer; v.setMode('dollhouse', { animate: false }); v.showLevel(lv); v.orbitTo({ target: [cx, e + .8, -cy], distance: 9, elevationDeg: 58, azimuthDeg: 30 }); }, [lvl, elev, c.x, c.y]); await z.waitForTimeout(1200); await z.locator('#threeHost').screenshot({ path: ev + id + '/' + f.replace('.json', '') + name }); };
      await shot(L0.id, L0.elevation || 0, '-stair3d-L1.png');
      if (L1) await shot(L1.id, L1.elevation, '-stair3d-L2.png');
    } catch (e) { console.log(id, f, 'سلم 3D فشل:', e.message); }
    await z.close();
  }
  console.log(id, 'صور:', files.length);
}
await b.close(); server.close();
