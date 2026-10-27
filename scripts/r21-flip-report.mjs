// (الجولة 21 — أدلة المراجعة، توثيق فقط) لكل بديل تغيّرت حالته بين قبل وبعد: يقيس الانكشاف على المستند نفسه (بدالة المحرك بعد)، ويرسم مسقطًا بإطار ومقياس
// واتجاه واحد للصورتين، ويكتب analysis.json. لا يعدّل محركًا ولا يحكم: الحكم في الوثيقة المكتوبة.
//   node scripts/r21-flip-report.mjs <id> [suffix]    (suffix = -v2 لمسار villa-layout-v2 المباشر كما في اختبار C9)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { windowExposure, bayPoints } from '../dist/privacy-gate.mjs';
import { degreeOf, spacePrivacy } from '../dist/space-privacy.mjs';
import { frameFor, planLayer, page, legend, renderPNGs, esc } from './plan-overlay-svg.mjs';
const id = process.argv[2], suf = process.argv[3] || '', dir = new URL(`../docs/research/r21-acceptance-rework/flip/${id}/`, import.meta.url).pathname;
const B = JSON.parse(readFileSync(dir + `before${suf}.json`, 'utf8')), A = JSON.parse(readFileSync(dir + `after${suf}.json`, 'utf8'));
const load = f => parseDoc(readFileSync(dir + f, 'utf8'));
const geomKey = d => JSON.stringify({ w: d.walls.filter(w => w.kind !== 'fence').map(w => [w.a, w.b, w.t]), o: d.openings.map(o => [o.wall, o.at, o.w, o.kind, o.sill]), z: (d.zones || []).map(z => [z.type, z.polygon]), f: (d.fixtures || []).length });
const r2 = v => Math.round(v * 100) / 100, P = p => ({ x: r2(p.x), y: r2(p.y) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function measure(doc, { noFences = false } = {}) {
  const d = noFences ? parseDoc(JSON.stringify({ ...JSON.parse(JSON.stringify(doc)), walls: doc.walls.filter(w => w.kind !== 'fence') })) : doc;
  const m = analyzeDoc(d), G = m.levels[0], bays = (d.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id), out = [];
  for (const op of G.openings.filter(o => o.window)) for (const s of op.sides.filter(x => x.other === 'outside')) {
    const deg = degreeOf(s.room), sill = op.o?.sill ?? 0, e = bays.length && sill < 1.2 ? windowExposure(d, G, op, s, bays) : { paths: [] };
    const near = e.paths.length ? e.paths.reduce((a, p) => dist(p.outside, p.inside) < dist(a.outside, a.inside) ? p : a) : null;
    out.push({ opening: op.id, room: s.room.name, roomId: s.room.id, degree: deg, at: P(op.p), width: op.w, sill, outward: s.outward, exposedLines: e.paths.length,
      nearest: near ? { parking: P(near.outside), window: P(near.windowHit), inside: P(near.inside), eyes: near.eyes, length: r2(dist(near.outside, near.inside)) } : null, paths: e.paths.map(p => ({ o: P(p.outside), w: P(p.windowHit), i: P(p.inside) })) });
  }
  return { windows: out, bays: bays.map(z => z.polygon.map(P)), fences: d.walls.filter(w => w.kind === 'fence').map(w => ({ id: w.id, a: P(w.a), b: P(w.b), h: w.h })) };
}
function draw(doc, F, meas, title, foot, focusRoom) {
  const G = analyzeDoc(doc).levels[0], L = G.level.id, body = [];
  body.push(planLayer(doc, L, F, { roomFill: r => (focusRoom && r.id === focusRoom ? '#f6d9d9' : null) }));
  const pp = doc.plot?.polygon; if (pp?.length) body.push(`<polygon points="${F.poly(pp)}" fill="none" stroke="#8a8a8a" stroke-width="1.5" stroke-dasharray="8 5"/>`);
  for (const z of (doc.zones || []).filter(z => z.type === 'garage' && z.level === L)) body.push(`<polygon points="${F.poly(z.polygon)}" fill="#bcd4ee" fill-opacity=".55" stroke="#2b5d9a" stroke-width="1.5"/>`);
  for (const f of meas.fences) body.push(`<line x1="${F.X(f.a.x)}" y1="${F.Y(f.a.y)}" x2="${F.X(f.b.x)}" y2="${F.Y(f.b.y)}" stroke="#b5651d" stroke-width="5"/>`);
  for (const w of meas.windows.filter(x => x.exposedLines && x.degree === 'A')) {
    for (const p of w.paths) body.push(`<line x1="${F.X(p.o.x)}" y1="${F.Y(p.o.y)}" x2="${F.X(p.i.x)}" y2="${F.Y(p.i.y)}" stroke="#c62828" stroke-opacity=".22" stroke-width="1"/>`);
    const n = w.nearest; if (n) { body.push(`<line x1="${F.X(n.parking.x)}" y1="${F.Y(n.parking.y)}" x2="${F.X(n.inside.x)}" y2="${F.Y(n.inside.y)}" stroke="#7f0000" stroke-width="3"/><circle cx="${F.X(n.parking.x)}" cy="${F.Y(n.parking.y)}" r="6" fill="#7f0000"/><circle cx="${F.X(n.inside.x)}" cy="${F.Y(n.inside.y)}" r="5" fill="#fff" stroke="#7f0000" stroke-width="2"/>`); }
  }
  for (const w of meas.windows) { const u = { x: -w.outward.y, y: w.outward.x }, h = w.width / 2; body.push(`<line x1="${F.X(w.at.x - u.x * h)}" y1="${F.Y(w.at.y - u.y * h)}" x2="${F.X(w.at.x + u.x * h)}" y2="${F.Y(w.at.y + u.y * h)}" stroke="${w.exposedLines && w.degree === 'A' ? '#ef6c00' : w.exposedLines ? '#e6c200' : '#4fa3d1'}" stroke-width="6"/>`); }
  body.push(legend(F, [{ color: '#2b5d9a', label: 'موقف' }, { color: '#ef6c00', label: 'نافذة فراغ درجة A مكشوفة (تُرسِّب)' }, { color: '#e6c200', label: 'مكشوفة لفراغ B/C (تُذكر فقط)' }, { color: '#4fa3d1', label: 'غير مكشوفة' }, { color: '#7f0000', label: 'أقرب خط رؤية (راصد●←داخل○)' }, { color: '#c62828', label: 'بقية خطوط A' }, { color: '#b5651d', label: 'ساتر/سور' }], F.H - 110));
  return page(F, title, body.join('\n'), foot);
}
const res = [], jobs = [];
const pairs = [];
for (const b of B.rows) { const a = A.rows.find(x => x.pat === b.pat); pairs.push({ b, a }); }
for (const a of A.rows) if (!B.rows.find(x => x.pat === a.pat)) pairs.push({ b: null, a });
const allDocs = [...B.rows.map(r => load(r.file)), ...A.rows.map(r => load(r.file))];
for (const { b, a } of pairs) {
  const bd = b && load(b.file), ad = a && load(a.file), rec = { pat: (b || a).pat, before: b && { status: b.status, file: b.file }, after: a && { status: a.status, file: a.file, edits_ar: a.edits_ar, hidden_ar: a.hidden_ar } };
  if (!a) { rec.note = 'البديل لم يعد يُنتَج/يُعرض بعد (غير موجود في مخرجات الرأس الجديد)'; res.push(rec); continue; }
  if (!b) { rec.note = 'بديل جديد لم يكن في مخرجات 1b1531d'; }
  rec.sameGeometry = bd ? geomKey(bd) === geomKey(ad) : null;
  rec.measureAfter = measure(ad); rec.measureAfterNoFence = measure(ad, { noFences: true });
  if (bd) { rec.measureBefore = measure(bd); }
  const sp = spacePrivacy(ad); rec.spacePrivacyAfter = sp.spaces.map(s => ({ space: s.space, degree: s.degree, verdict: s.verdict, exposedLines: s.exposedLines, minDistance: s.minDistance })); rec.failingAfter = sp.failing;
  if (bd) { const spb = spacePrivacy(bd); rec.spacePrivacyBefore = spb.spaces.map(s => ({ space: s.space, degree: s.degree, verdict: s.verdict, exposedLines: s.exposedLines, minDistance: s.minDistance })); rec.failingBefore = spb.failing; }
  const focus = rec.measureAfter.windows.filter(w => w.degree === 'A' && w.exposedLines).map(w => w.roomId)[0];
  if (b && (b.status !== a.status || rec.failingAfter.length)) {
    const pts = allDocs.flatMap(d => d.walls.flatMap(w => [w.a, w.b])).concat(...allDocs.map(d => d.plot?.polygon || []), ...allDocs.map(d => (d.zones || []).flatMap(z => z.polygon)));
    const F = frameFor({ walls: [{ a: { x: Math.min(...pts.map(p => p.x)), y: Math.min(...pts.map(p => p.y)) }, b: { x: Math.max(...pts.map(p => p.x)), y: Math.max(...pts.map(p => p.y)) } }] }, { W: 1400, H: 1050, bottom: 190 });
    const nm = String(rec.pat).replace(/[^\w-]/g, '_');
    const foot = (m, st, ex) => [`الحالة: ${st} — فراغات من الدرجة A بخطوط مكشوفة: ${m.windows.filter(w => w.degree === 'A' && w.exposedLines).map(w => `«${w.room}» ${w.exposedLines} خطًا (أقرب ${w.nearest?.length} م عبر ${w.opening})`).join('؛ ') || 'لا شيء'}`, `النموذج: خطوط رؤية ثنائية الأبعاد من نقاط المواقف إلى نقاط داخل الغرفة عبر قطعة النافذة، بأربع تركيبات ارتفاع عين؛ الأبواب لا تُقاس. الإطار والمقياس والاتجاه واحد في الصورتين.`];
    jobs.push({ html: draw(bd, F, rec.measureBefore, `${id} — ${rec.pat} — قبل (1b1531d): ${b.status}`, foot(rec.measureBefore, b.status), focus), path: dir + `img-before-${nm}${suf}.png` });
    jobs.push({ html: draw(ad, F, rec.measureAfter, `${id} — ${rec.pat} — بعد (0fd2a8f): ${a.status}`, foot(rec.measureAfter, a.status), focus), path: dir + `img-after-${nm}${suf}.png` });
    rec.images = [`img-before-${nm}${suf}.png`, `img-after-${nm}${suf}.png`];
  }
  res.push(rec);
}
await renderPNGs(jobs);
writeFileSync(dir + `analysis${suf}.json`, JSON.stringify({ id, text: B.text, pairs: res }, null, 1));
for (const r of res) console.log(id, r.pat, r.before?.status, '→', r.after?.status, 'sameGeom', r.sameGeometry, 'fail:', (r.failingAfter || []).join(' / ').slice(0, 160));
