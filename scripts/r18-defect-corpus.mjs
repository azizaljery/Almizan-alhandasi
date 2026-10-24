// (الجولة الثامنة عشرة) مجموعة عيوب لنوع العيب الجديد في قياس مسار ضيف الرجال (dist/privacy-defects.mjs، GUEST_DINING):
//  الطعام الذي يصله ضيف الرجال مفتوح بلا باب (قوس) على مدخل العائلة أو الصالة أو ممر النوم.
//  (1) إيجابيات حقيقية: بدائل after-17 التي سجّل فيها المراجع المستقل r17 أن ضيف الرجال لا يصل إلى الطعام إلا عبر العائلة (C1-2، C3-2،
//      C5-4، C7-2، C8-2، C9-4، C10-2) — C8-2 هو البديل الذي فات القياس القديم (بابه من «مدخل الرجال» موجود، والطعام مفتوح بقوس على
//      «مدخل العائلة»).
//  (2) إيجابيات مصنوعة على البدائل الجاهزة في المرحلة: (أ) باب الطعام إلى الصالة/مدخل العائلة يصير قوسًا؛ (ب) يُلغى باب المقلط بين المجلس
//      والطعام (وباب «مدخل الرجال» إلى الطعام إن وُجد).
//  (3) سلبيات: البدائل الجاهزة في المرحلة كما هي، وبدائل after-17 التي حكم عليها المراجع «يُعرض» — يجب ألا يُكشف فيها.
// والكشف يجعل حالة العرض «يحتاج تعديلات». المراجع وكيل ذكاء اصطناعي (Claude) بدور معماري، ليس معماريًا بشريًا مرخّصًا.
// الاستعمال: node scripts/r18-defect-corpus.mjs [stage=after-18] → evidence/review-proof/r18-corpus.json
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { measureR16 } from '../dist/privacy-defects.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { CASES } from './acceptance-cases.mjs';

const stage = process.argv[2] || 'after-18', ROOT = new URL('../', import.meta.url).pathname;
const req = id => { const C = CASES.find(c => c.id === id); return { text: C.text, counts: C.counts, land: { floors: 1, ...C.land } }; };
const load = (st, id, f) => parseDoc(readFileSync(ROOT + `evidence/acceptance/${st}/${id}/${f}`, 'utf8'));
const gd = (doc, id) => { const g = measureR16(doc, req(id)).find(x => x.id === 'GUEST_DINING'); return g && g.applicable && !g.pass && !g.clientAsked ? g : null; };
const status = (doc, id) => presentationStatus({ doc, ledger: [], review: { passed: true } }, req(id)).status;
const rows = [];
// (1)+(3-ب) حكم المراجع r17 على after-17
const V = JSON.parse(readFileSync(ROOT + 'docs/research/verdicts-r17.json', 'utf8'));
const REAL = new Set(['C1-2', 'C3-2', 'C5-4', 'C7-2', 'C8-2', 'C9-4', 'C10-2']);
for (const v of V) {
  const key = `${v.case}-${v.alt}`, doc = load('after-17', v.case, `alt-${v.alt}.json`), g = gd(doc, v.case);
  if (REAL.has(key)) rows.push({ kind: 'real-r17', alt: key, expected: true, detected: !!g, why: g?.reasons_ar?.[0] || null, status: status(doc, v.case) });
  else if (v.verdict === 'show') rows.push({ kind: 'real-r17-clean', alt: key, expected: false, detected: !!g, why: g?.reasons_ar?.[0] || null });
}
// (2)+(3-أ) البدائل الجاهزة في المرحلة
const S = JSON.parse(readFileSync(ROOT + `evidence/acceptance/${stage}/summary.json`, 'utf8'));
for (const c of S) (c.designs || []).forEach((d, i) => {
  if (d.presentation?.status !== 'ready') return;
  const key = `${c.id}-${i + 1}`, base = load(stage, c.id, d.file), g0 = gd(base, c.id);
  rows.push({ kind: 'stage-clean', alt: key, expected: false, detected: !!g0, why: g0?.reasons_ar?.[0] || null });
  const G = analyzeDoc(base).levels[0], din = G.rooms.find(r => r.type === 'dining'); if (!din) return;
  const famSide = o => (o.type === 'entrance' && !/الرجال|الضيوف/.test(o.name || '')) || (o.type === 'living' && !/الضيوف|الطعام|مغاسل/.test(o.name || '')) || (o.type === 'corridor' && /الغرف|النوم|الجناح/.test(o.name || ''));
  const doorsOf = r => G.openings.filter(op => op.door && op.sides.some(s => s.room.id === r.id)).map(op => ({ op, other: G.roomsById.get(op.sides.find(s => s.room.id === r.id).other) || null }));
  // (أ) باب الطعام إلى جهة العائلة يصير قوسًا
  const fam = doorsOf(din).filter(x => x.other && famSide(x.other) && x.op.o.kind !== 'arch');
  if (fam.length) { const doc = JSON.parse(JSON.stringify(base)); const o = doc.openings.find(q => q.id === fam[0].op.o.id); o.kind = 'arch'; delete o.swing; delete o.hinge;
    const g = gd(doc, c.id); rows.push({ kind: 'made-arch', alt: key, expected: true, detected: !!g, why: g?.reasons_ar?.[0] || null, status: status(doc, c.id) }); }
  // (ب) لا باب بين ضيافة الرجال والطعام
  const guest = doorsOf(din).filter(x => x.other && (x.other.type === 'majlis' && !/النساء/.test(x.other.name) || /الرجال|مقلط|مقهوي|مغاسل/.test(x.other.name || '')));
  if (guest.length) { const doc = JSON.parse(JSON.stringify(base)); doc.openings = doc.openings.filter(q => !guest.some(x => x.op.o.id === q.id));
    const g = gd(doc, c.id); rows.push({ kind: 'made-no-link', alt: key, expected: true, detected: !!g, why: g?.reasons_ar?.[0] || null, status: status(doc, c.id) }); }
});
const by = k => rows.filter(r => r.kind === k), cnt = (L, f) => L.filter(f).length;
const summary = {
  note_ar: 'المراجع المستقل وكيل ذكاء اصطناعي (Claude) بدور معماري، ليس معماريًا بشريًا مرخّصًا. الإيجابي المصنوع قد لا يصنع العيب دائمًا (مسار آخر للضيف عبر فراغات الضيافة).',
  stage,
  realPositives: { n: by('real-r17').length, detected: cnt(by('real-r17'), r => r.detected), needsEdits: cnt(by('real-r17'), r => r.detected && r.status !== 'ready') },
  madeArch: { n: by('made-arch').length, detected: cnt(by('made-arch'), r => r.detected) },
  madeNoLink: { n: by('made-no-link').length, detected: cnt(by('made-no-link'), r => r.detected) },
  falseAlarms: { n: by('real-r17-clean').length + by('stage-clean').length, detected: cnt([...by('real-r17-clean'), ...by('stage-clean')], r => r.detected) },
};
mkdirSync(ROOT + 'evidence/review-proof', { recursive: true });
writeFileSync(ROOT + 'evidence/review-proof/r18-corpus.json', JSON.stringify({ summary, rows }, null, 1));
for (const r of rows) console.log(r.kind.padEnd(15), r.alt.padEnd(6), r.expected ? 'يجب' : 'لا', r.detected ? 'كُشف' : '—', r.why || '');
console.log(JSON.stringify(summary, null, 1));
