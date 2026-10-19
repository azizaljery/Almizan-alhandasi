// يشغّل حالات القبول المعمارية على الشيفرة الحالية ويحفظ: المستندات، ومقاييس كل بديل، وسجل المطابقة،
// ومصفوفة اختلاف البدائل، والزمن. الاستعمال: node scripts/acceptance-run.mjs <stage> [نمط الحالات] [--engine v1|v2]
// (أو MIZAN_ENGINE=v2). الافتراضي v1: المولّد المنشور dist/villa-layout.mjs؛ و v2: dist/villa-layout-v2.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as V1 from '../dist/villa-layout.mjs';
import * as V2 from '../dist/villa-layout-v2.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { verifyRequest, docRooms } from '../dist/rules.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { serialize } from '../dist/draw/doc.mjs';

const argv = process.argv.slice(2), ei = argv.indexOf('--engine');
const engine = (ei >= 0 ? argv[ei + 1] : process.env.MIZAN_ENGINE) || 'v1';
if (!['v1', 'v2'].includes(engine)) throw Error('المحرك v1 أو v2 فقط');
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--engine');
const stage = pos[0] || 'before', only = pos[1] ? new RegExp(pos[1]) : null;
const { generateVillaDesigns, generateVillaTwoFloors } = engine === 'v2' ? V2 : V1;
const OUT = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const r2 = v => Math.round(v * 100) / 100;

/** مقاييس موضوعية لمخطط واحد: الحركة، الفراغات بلا نوافذ، العيوب، المطابقة. */
export function metrics(doc, req, entry) {
  const { rooms } = docRooms(doc), net = rooms.reduce((a, r) => a + r.area, 0);
  const circ = rooms.filter(r => ['entrance', 'corridor', 'living'].includes(r.type) && /مدخل|ممر|ردهة|مغاسل/.test(r.name)).reduce((a, r) => a + r.area, 0);
  const rv = reviewDoc(doc), by = c => rv.filter(i => i.code === c).length;
  const led = verifyRequest(doc, req, { entry });
  const beds = rooms.filter(r => r.type === 'bedroom' || r.type === 'master');
  const hall = rooms.find(r => r.name === 'الصالة' && r.li === 0) || rooms.find(r => /^الصالة/.test(r.name));
  return {
    hall: hall ? { w: r2(Math.min(hall.x1 - hall.x0, hall.y1 - hall.y0)), l: r2(Math.max(hall.x1 - hall.x0, hall.y1 - hall.y0)), ratio: r2(Math.max(hall.x1 - hall.x0, hall.y1 - hall.y0) / Math.min(hall.x1 - hall.x0, hall.y1 - hall.y0)) } : null,
    rooms: rooms.length, net: r2(net), circulationPct: r2(100 * circ / Math.max(1, net)), bedrooms: beds.length,
    noWindow: by('NO_WINDOW'), minWidth: by('MIN_WIDTH'), unreachable: by('UNREACHABLE_ROOM'), swingBlocked: by('SWING_BLOCKED'), bathPrivacy: by('BATH_PRIVACY'),
    reviewWarnings: rv.filter(i => i.severity === 'warning').length,
    ledger: led.map(x => ({ text: x.text, ok: x.ok, why: x.why })), ledgerFails: led.filter(x => !x.ok).length,
  };
}
/** اختلاف تنظيمي بين بديلين (0..1): إزاحة مراكز الفراغات المتناظرة بالاسم نسبة لقطر المبنى، بعد أفضل انعكاس أفقي. */
export function difference(a, b) {
  const A = docRooms(a), B = docRooms(b);
  const norm = (R, flip) => new Map(R.rooms.filter(r => r.area >= 6).map(r => { const w = R.B.x1 - R.B.x0, d = R.B.y1 - R.B.y0; let x = ((r.x0 + r.x1) / 2 - R.B.x0) / w; if (flip) x = 1 - x; return [r.name + '@' + r.li, { x, y: ((r.y0 + r.y1) / 2 - R.B.y0) / d }]; }));
  const one = flip => { const p = norm(A, false), q = norm(B, flip); let s = 0, n = 0; for (const [k, v] of p) { const u = q.get(k); if (!u) { s += .5; n++; continue; } s += Math.hypot(v.x - u.x, v.y - u.y) / Math.SQRT2; n++; } for (const k of q.keys()) if (!p.has(k)) { s += .5; n++; } return n ? s / n : 0; };
  return r2(Math.min(one(false), one(true)));
}

const summary = [];
for (const C of CASES) {
  if (only && !only.test(C.id)) continue;
  const dir = OUT + C.id + '/'; mkdirSync(dir, { recursive: true });
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = { floors: 1, ...C.land }, entry = land.entries[0];
  const row = { id: C.id, engine, name: C.name, text: C.text, understood: req.understood, unclear: req.unclear, unsupported: req.unsupported, designs: [], notes: [] };
  if (C.irregular && engine === 'v1') row.notes.push('المولّد يقبل أرضًا مستطيلة فقط (عرض × طول)؛ شكل الأرض في الطلب لا يُمثَّل. وُلّد على مستطيل محيط.');
  if (C.irregular && engine === 'v2') row.notes.push('المولّد الثاني: الأرض مضلع فعلي (الواجهة 18 م، الخلف 24 م، العمق 30 م) والارتدادات داخل حدوده.');
  if (engine === 'v1') delete land.polygon;
  const t0 = performance.now();
  let out;
  try {
    const fn = (land.floors >= 2 || req.prefs?.floors === 2) ? generateVillaTwoFloors : generateVillaDesigns;
    out = fn({ land, counts: req.counts, requirements: req, keep: C.want || 4 });
  } catch (e) { row.error = e.message; }
  row.ms = Math.round(performance.now() - t0);
  if (out) {
    out.designs.forEach((d, i) => { writeFileSync(dir + `alt-${i + 1}.json`, serialize(d.doc)); row.designs.push({ file: `alt-${i + 1}.json`, mode: d.mode, summary: d.summary, ...metrics(d.doc, req, entry) }); });
    row.requestedAlternatives = C.want || 4; row.producedAlternatives = out.designs.length;
    row.diversity = out.designs.map((a, i) => out.designs.map((b, j) => (i === j ? 0 : difference(a.doc, b.doc))));
    row.modes = [...new Set(out.designs.map(d => d.mode))];
    const pairs = row.diversity.flatMap((r, i) => r.filter((_, j) => j > i));
    row.minDifference = pairs.length ? Math.min(...pairs) : null; row.meanDifference = pairs.length ? r2(pairs.reduce((a, b) => a + b, 0) / pairs.length) : null;
    if (out.rejected) row.rejectedCandidates = out.rejected.length;
  }
  if (C.edit && out) {
    try {
      const first = await generateInitialDesign({ land, counts: req.counts, requirements: req });
      const s0 = createSession({ land, counts: req.counts, requirements: req, result: first });
      writeFileSync(dir + 'edit-before.json', serialize(first.doc));
      const t1 = performance.now();
      const { session, reply } = await redesign(s0, { text: C.edit });
      const after = JSON.parse(session.designs[1].doc);
      writeFileSync(dir + 'edit-after.json', session.designs[1].doc);
      const bRooms = docRooms(first.doc).rooms.map(r => r.name).sort(), aRooms = docRooms(after).rooms.map(r => r.name).sort();
      row.edit = { text: C.edit, ms: Math.round(performance.now() - t1), reply, samePattern: session.designs[1].pat === session.designs[0].pat, difference: difference(first.doc, after), roomsKept: bRooms.every(n => aRooms.includes(n)), roomsLost: bRooms.filter(n => !aRooms.includes(n)), after: metrics(after, session.input.requirements, entry) };
    } catch (e) { row.edit = { text: C.edit, error: e.message, code: e.code || null }; }
  }
  writeFileSync(dir + 'result.json', JSON.stringify(row, null, 1));
  summary.push(row);
  const best = row.designs[0];
  console.log(`${C.id} ${C.name}: ${row.error ? 'خطأ: ' + row.error : `${row.producedAlternatives}/${row.requestedAlternatives} بدائل، أنماط ${row.modes.join('/')}, اختلاف أدنى ${Math.min(...row.diversity.flatMap((r, i) => r.filter((_, j) => j > i)))}، أفضل: إخفاق ${best.ledgerFails}، بلا نافذة ${best.noWindow}، حركة ${best.circulationPct}%`} ${row.ms}ms${row.edit ? ' | تعديل: ' + (row.edit.error ? 'خطأ ' + row.edit.error.slice(0, 80) : `نفس النمط ${row.edit.samePattern}، غرف محفوظة ${row.edit.roomsKept}، فرق ${row.edit.difference}`) : ''}`);
}
writeFileSync(OUT + 'summary.json', JSON.stringify(summary, null, 1));
