// (الجولة السابعة عشرة) مجموعة عيوب لنوعي عيب الصالة العائلية الجديدين (dist/privacy-defects.mjs: HALL_SMALL وHALL_THROUGH):
//  (1) إيجابيات حقيقية: بدائل after-16 التي سجّل فيها المراجع المستقل r16 صغر الصالة نسبةً إلى المجلس أو أنها ممر عابر
//      (C9-2: «الصالة 19.47 م² فقط بينما المجلس 34.61 م²… والصالة ممر»؛ C4-1: «الصالة 20.40 م² صغيرة… وتُستخدم ممرًا إلى الغرف»)؛
//  (2) إيجابيات مصنوعة على البدائل «الجاهزة» في المرحلة: (أ) جدار بفتحة يقسم الصالة فيصغرها؛ (ب) جدار بفتحة يضيّقها إلى 3.5 م؛
//  (3) سلبيات: البدائل «الجاهزة» في المرحلة كما هي، وبدائل after-16 التي لم يسجّل فيها المراجع عيب الصالة — يجب ألا يُكشف فيها.
// والكشف يجب أن يجعل حالة العرض «يحتاج تعديلات» (لا «جاهز»). المراجع وكيل ذكاء اصطناعي، ليس معماريًا بشريًا مرخّصًا.
// الاستعمال: node scripts/r17-defect-corpus.mjs [stage=after-17] → evidence/review-proof/r17-corpus.json
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDoc, applyCommand } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { measureHall } from '../dist/privacy-defects.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { CASES } from './acceptance-cases.mjs';

const stage = process.argv[2] || 'after-17', ROOT = new URL('../', import.meta.url).pathname;
const req = id => { const C = CASES.find(c => c.id === id); return { text: C.text, counts: C.counts, land: { floors: 1, ...C.land } }; };
const load = (st, id, f) => parseDoc(readFileSync(ROOT + `evidence/acceptance/${st}/${id}/${f}`, 'utf8'));
const TYPES = ['HALL_SMALL', 'HALL_THROUGH'];
const fails = (doc, id) => measureHall(doc, req(id)).filter(g => g.applicable && !g.pass && !g.clientAsked).map(g => g.id);
const status = (doc, id) => presentationStatus({ doc, ledger: [], review: { passed: true } }, req(id)).status;
const rows = [];
// (1) إيجابيات وسلبيات حقيقية من حكم المراجع r16
const V = JSON.parse(readFileSync(ROOT + 'docs/research/verdicts-r16.json', 'utf8'));
const REAL = { 'C9-2': ['HALL_SMALL', 'HALL_THROUGH'], 'C4-1': ['HALL_SMALL', 'HALL_THROUGH'] };
for (const v of V) {
  const key = `${v.case}-${v.alt}`, doc = load('after-16', v.case, `alt-${v.alt}.json`), got = fails(doc, v.case);
  if (REAL[key]) for (const t of REAL[key]) rows.push({ kind: 'real-r16', alt: key, expected: t, detected: got.includes(t), got, status: status(doc, v.case) });
  else rows.push({ kind: 'real-r16-clean', alt: key, expected: null, detected: got.length > 0, got, reviewer: v.verdict });
}
// (2)+(3) على البدائل الجاهزة في المرحلة
const ready = [];
for (const C of CASES) {
  const dir = ROOT + `evidence/acceptance/${stage}/${C.id}/`; if (!existsSync(dir + 'result.json')) continue;
  const res = JSON.parse(readFileSync(dir + 'result.json', 'utf8'));
  res.designs.forEach(d => { if (d.presentation?.status === 'ready') ready.push({ id: C.id, file: d.file, doc: load(stage, C.id, d.file) }); });
}
const clone = d => JSON.parse(JSON.stringify(d));
const isHall = r => r.type === 'living' && !/الضيوف|الطعام|مغاسل/.test(r.name || '');
for (const r of ready) {
  const got0 = fails(r.doc, r.id); rows.push({ kind: 'clean', alt: `${r.id}/${r.file}`, expected: null, detected: got0.length > 0, got: got0, status: status(r.doc, r.id) });
  const M = analyzeDoc(r.doc), lv = M.levels.find(l => l.rooms.some(x => x.type === 'majlis' && !/النساء/.test(x.name))) || M.levels[0];
  const hall = lv.rooms.filter(isHall).sort((a, b) => b.area - a.area)[0]; if (!hall) continue;
  const xs = hall.net.map(p => p.x), ys = hall.net.map(p => p.y), B = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  // (أ) جدار بفتحة 1.2 م يقسم الصالة عند 45% من طولها: يبقى جزء الصالة (حيث تسميتها) أصغر
  try {
    const d = clone(r.doc), horiz = B.x1 - B.x0 >= B.y1 - B.y0, c = horiz ? B.x0 + .45 * (B.x1 - B.x0) : B.y0 + .45 * (B.y1 - B.y0);
    const a = horiz ? { x: c, y: B.y0 - .06 } : { x: B.x0 - .06, y: c }, b = horiz ? { x: c, y: B.y1 + .06 } : { x: B.x1 + .06, y: c };
    let o = applyCommand(d, { type: 'add-wall', level: lv.level.id, a, b, t: .12 }); Object.assign(d, o.doc);
    const w = d.walls[d.walls.length - 1]; o = applyCommand(d, { type: 'add-opening', wall: w.id, kind: 'arch', at: Math.hypot(b.x - a.x, b.y - a.y) / 2, w: 1.2 }); Object.assign(d, o.doc);
    const got = fails(d, r.id); rows.push({ kind: 'synthetic', alt: `${r.id}/${r.file}`, mutation: 'جدار بفتحة يقسم الصالة (45% من طولها)', expected: 'HALL_SMALL|HALL_THROUGH', detected: got.some(t => TYPES.includes(t)), got, status: status(d, r.id) });
  } catch (e) { rows.push({ kind: 'synthetic-skip', alt: `${r.id}/${r.file}`, mutation: 'تقسيم الصالة', error: String(e.message || e) }); }
  // (ب) جدار بفتحة موازٍ لضلع الصالة الطويل يضيّقها إلى 3.5 م (جزء منها يصير ممرًا): لا تتسع جلسة 3.0 م وممر 0.9 م بجانبها
  try {
    const d = clone(r.doc), horiz = B.x1 - B.x0 >= B.y1 - B.y0, w0 = horiz ? B.y1 - B.y0 : B.x1 - B.x0;
    if (w0 > 3.9) {
      const lbl = d.labels.find(l => hall.labelIds.includes(l.id)), side = lbl ? (horiz ? (lbl.seed.y < (B.y0 + B.y1) / 2 ? 0 : 1) : (lbl.seed.x < (B.x0 + B.x1) / 2 ? 0 : 1)) : 0;
      const c = horiz ? (side === 0 ? B.y0 + 3.5 : B.y1 - 3.5) : (side === 0 ? B.x0 + 3.5 : B.x1 - 3.5);
      const a = horiz ? { x: B.x0 - .06, y: c } : { x: c, y: B.y0 - .06 }, b = horiz ? { x: B.x1 + .06, y: c } : { x: c, y: B.y1 + .06 };
      let o = applyCommand(d, { type: 'add-wall', level: lv.level.id, a, b, t: .12 }); Object.assign(d, o.doc);
      const w = d.walls[d.walls.length - 1]; o = applyCommand(d, { type: 'add-opening', wall: w.id, kind: 'arch', at: Math.hypot(b.x - a.x, b.y - a.y) / 2, w: 1.2 }); Object.assign(d, o.doc);
      const got = fails(d, r.id); rows.push({ kind: 'synthetic', alt: `${r.id}/${r.file}`, mutation: 'جدار بفتحة يضيّق الصالة إلى 3.5 م', expected: 'HALL_SMALL|HALL_THROUGH', detected: got.some(t => TYPES.includes(t)), got, status: status(d, r.id) });
    }
  } catch (e) { rows.push({ kind: 'synthetic-skip', alt: `${r.id}/${r.file}`, mutation: 'تضييق الصالة', error: String(e.message || e) }); }
}
const pos = rows.filter(r => r.expected), neg = rows.filter(r => r.expected === null);
const synth = pos.filter(r => r.kind === 'synthetic');
const summary = {
  note_ar: 'كشف نوعي عيب الصالة (HALL_SMALL وHALL_THROUGH): إيجابيات حقيقية من حكم المراجع المستقل r16 (وكيل ذكاء اصطناعي، ليس معماريًا بشريًا مرخّصًا)، وإيجابيات مصنوعة بتحوير واحد على بدائل «جاهزة»، وسلبيات (الجاهزة كما هي، وبدائل after-16 التي لم يسجّل فيها المراجع العيب). الإيجابية المصنوعة لا تُعد كشفًا إلا إن تغيّرت الصالة فعلًا عن قيمها: تحوير لا يمس الجلسة قد لا يكون عيبًا.',
  positives: pos.length, detected: pos.filter(r => r.detected).length, positivesNotReady: pos.filter(r => r.status && r.status !== 'ready').length,
  real: `${pos.filter(r => r.kind === 'real-r16' && r.detected).length}/${pos.filter(r => r.kind === 'real-r16').length}`,
  synthetic: `${synth.filter(r => r.detected).length}/${synth.length}`,
  byMutation: Object.fromEntries([...new Set(synth.map(r => r.mutation.replace(/^\d+ /, 'n ')))].map(m => [m, `${synth.filter(r => r.mutation.replace(/^\d+ /, 'n ') === m && r.detected).length}/${synth.filter(r => r.mutation.replace(/^\d+ /, 'n ') === m).length}`])),
  negatives: neg.length, falsePositives: neg.filter(r => r.detected).length, falsePositiveAlts: neg.filter(r => r.detected).map(r => `${r.alt} ${r.got.join(',')}`),
  missed: pos.filter(r => !r.detected).map(r => `${r.alt} ${r.mutation || r.expected}`),
};
mkdirSync(ROOT + 'evidence/review-proof', { recursive: true });
writeFileSync(ROOT + 'evidence/review-proof/r17-corpus.json', JSON.stringify({ stage, summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
