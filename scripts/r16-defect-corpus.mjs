// (الجولة السادسة عشرة) مجموعة عيوب لأنواع العيوب الجديدة (dist/privacy-defects.mjs):
//  (1) إيجابيات حقيقية: بدائل after-15 التي أثبت المراجع المستقل r15 فيها العيب (ملاحظاته في verdicts-r15.json) — يجب أن يُكشف العيب؛
//  (2) إيجابيات مصنوعة: تحوير واحد مضبوط على بديل «جاهز» من after-16 يُنتج العيب — يجب أن يُكشف هو نفسه؛
//  (3) سلبيات: البدائل «الجاهزة» في after-16 كما هي — يجب ألا يُكشف فيها أي عيب من الخمسة.
// والكشف يجب أن يجعل حالة العرض «يحتاج تعديلات» (لا «جاهز»).
// الاستعمال: node scripts/r16-defect-corpus.mjs [stage=after-16] → evidence/review-proof/r16-corpus.json
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { measureR16, isPrivateRoom } from '../dist/privacy-defects.mjs';
import { R20_DEFECTS } from '../dist/r20-checks.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { CASES } from './acceptance-cases.mjs';

const stage = process.argv[2] || 'after-16', ROOT = new URL('../', import.meta.url).pathname;
const req = id => { const C = CASES.find(c => c.id === id); return { text: C.text, counts: C.counts, land: { floors: 1, ...C.land } }; };
const load = (st, id, f) => parseDoc(readFileSync(ROOT + `evidence/acceptance/${st}/${id}/${f}`, 'utf8'));
// (الجولة العشرون) قياسات r20 صارت ضمن measureR16؛ هذه المجموعة تقيس قياسات r16 وحدها (قياسات r20 في r20-defect-corpus.mjs)
const R20_IDS = new Set(Object.keys(R20_DEFECTS));
const fails = (doc, id) => measureR16(doc, req(id)).filter(g => g.applicable && !g.pass && !g.clientAsked && !R20_IDS.has(g.id)).map(g => g.id);
const status = (doc, id) => presentationStatus({ doc, ledger: [], review: { passed: true } }, req(id)).status;
const rows = [];
// (1) إيجابيات حقيقية من حكم المراجع r15 (العيب مذكور نصًا في ملاحظاته)
const REAL = [
  ['C1', 1, 'WINDOW_PARKING'], ['C1', 2, 'WINDOW_PARKING'], ['C1', 2, 'HALL_STREET'], ['C1', 2, 'GUEST_DINING'], ['C6', 1, 'WINDOW_PARKING'], ['C6', 2, 'WINDOW_PARKING'],
  ['C7', 1, 'WINDOW_PARKING'], ['C7', 1, 'GUEST_DINING'], ['C8', 1, 'MASTER_VIA_DRESS'], ['C9', 1, 'MASTER_VIA_DRESS'], ['C9', 1, 'WINDOW_PARKING'], ['C9', 2, 'WINDOW_PARKING'],
  ['C9', 3, 'WINDOW_PARKING'], ['C9', 3, 'GUEST_DINING'], ['C10', 1, 'MASTER_VIA_DRESS'], ['C10', 2, 'HALL_STREET'], ['C10', 2, 'GUEST_DINING'], ['C10', 3, 'PARKING_SHALLOW'], ['C10', 3, 'WINDOW_PARKING'],
  ['C5', 4, 'GUEST_DINING'], ['C6', 2, 'GUEST_DINING'], ['C5', 2, 'PARKING_SHALLOW'],
];
for (const [id, i, want] of REAL) { const doc = load('after-15', id, `alt-${i}.json`), got = fails(doc, id); rows.push({ kind: 'real-r15', alt: `${id}-${i}`, expected: want, detected: got.includes(want), got, status: status(doc, id) }); }
// (2) إيجابيات مصنوعة على البدائل «الجاهزة» في المرحلة
const ready = [];
for (const C of CASES) {
  const dir = ROOT + `evidence/acceptance/${stage}/${C.id}/`; if (!existsSync(dir + 'result.json')) continue;
  const res = JSON.parse(readFileSync(dir + 'result.json', 'utf8'));
  res.designs.forEach(d => { if (d.presentation?.status === 'ready') ready.push({ id: C.id, file: d.file, doc: load(stage, C.id, d.file) }); });
}
const clone = d => JSON.parse(JSON.stringify(d));
for (const r of ready) {
  // سلبي: كما هو
  const got0 = fails(r.doc, r.id); rows.push({ kind: 'clean', alt: `${r.id}/${r.file}`, expected: null, detected: got0.length > 0, got: got0, status: status(r.doc, r.id) });
  const G = analyzeDoc(r.doc).levels[0];
  // (أ) موقف أمام نافذة غرفة خاصة (1 م خارج الجدار)
  const w = G.openings.filter(op => op.window && (op.o.sill ?? 0) < 1.6).flatMap(op => op.sides.filter(s => s.exterior && s.other === 'outside' && isPrivateRoom(s.room)).map(s => ({ op, s })))[0];
  if (w) {
    const d = clone(r.doc), o = w.s.outward, u = { x: -o.y, y: o.x }, p = w.op.p, at = (a, b) => ({ x: Math.round((p.x + u.x * a + o.x * b) * 100) / 100, y: Math.round((p.y + u.y * a + o.y * b) * 100) / 100 });
    d.zones = [...(d.zones || []), { id: 'zx1', level: G.level.id, name: 'موقف سيارة', type: 'garage', polygon: [at(-1.35, 1.2), at(1.35, 1.2), at(1.35, 6.7), at(-1.35, 6.7)] }];
    const got = fails(d, r.id); rows.push({ kind: 'synthetic', alt: `${r.id}/${r.file}`, mutation: `موقف أمام نافذة «${w.s.room.name}»`, expected: 'WINDOW_PARKING', detected: got.includes('WINDOW_PARKING'), got, status: status(d, r.id) });
  }
  // (ج) حذف باب المقلط (المجلس ↔ الطعام)
  const men = G.rooms.filter(x => x.type === 'majlis' && !/النساء/.test(x.name)), dn = G.rooms.filter(x => x.type === 'dining');
  const link = G.openings.filter(op => op.door && op.left && op.right && ((men.includes(op.left) && dn.includes(op.right)) || (men.includes(op.right) && dn.includes(op.left))));
  if (link.length) {
    const d = clone(r.doc); d.openings = d.openings.filter(o => !link.some(l => l.id === o.id));
    const got = fails(d, r.id); rows.push({ kind: 'synthetic', alt: `${r.id}/${r.file}`, mutation: 'حذف باب المقلط بين المجلس والطعام', expected: 'GUEST_DINING', detected: got.includes('GUEST_DINING'), got, status: status(d, r.id) });
  }
  // (ب) الماستر: حذف أبوابها إلا باب غرفة الملابس/الحمام، وفتح غرفة الملابس على الصالة إن تلاصقتا
  const M = G.rooms.find(x => x.type === 'master'), dress = G.rooms.find(x => /ملابس/.test(x.name || '')), hall = G.rooms.find(x => x.type === 'living' && x.name === 'الصالة');
  if (M && dress && hall) {
    const ids = new Set(dress.edges.map(e => e.edgeId)), shared = hall.edges.filter(e => ids.has(e.edgeId) && e.length >= 1.2)[0];
    const mDoors = G.openings.filter(op => op.door && op.sides.some(s => s.room.id === M.id) && !op.sides.some(s => s.room.id === dress.id || (s.other !== 'outside' && G.roomsById.get(s.other)?.type === 'bath')));
    const dm = G.openings.some(op => op.door && op.sides.some(s => s.room.id === M.id) && op.sides.some(s => s.room.id === dress.id));
    if (shared && dm) {
      const d = clone(r.doc); d.openings = d.openings.filter(o => !mDoors.some(m => m.id === o.id));
      const wall = d.walls.find(x => x.id === shared.wallIds[0]), L = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y), proj = q => ((q.x - wall.a.x) * (wall.b.x - wall.a.x) + (q.y - wall.a.y) * (wall.b.y - wall.a.y)) / L;
      d.openings.push({ id: 'ox1', level: wall.level, wall: wall.id, kind: 'door', at: Math.round((proj(shared.a) + proj(shared.b)) / 2 * 1000) / 1000, w: .8, h: 2.1, sill: 0, swing: 'in', hinge: 'left', entry: false });
      const got = fails(d, r.id); rows.push({ kind: 'synthetic', alt: `${r.id}/${r.file}`, mutation: 'الماستر لا تُدخل إلا عبر غرفة الملابس من الصالة', expected: 'MASTER_VIA_DRESS', detected: got.includes('MASTER_VIA_DRESS'), got, status: status(d, r.id) });
    }
  }
}
const pos = rows.filter(r => r.expected), neg = rows.filter(r => !r.expected);
const summary = {
  note_ar: 'كشف أنواع العيوب الجديدة (privacy-defects.mjs): الإيجابيات الحقيقية من حكم المراجع المستقل r15 (وكيل ذكاء اصطناعي، ليس معماريًا بشريًا مرخّصًا)، والمصنوعة بتحوير واحد على بدائل «جاهزة»، والسلبيات هي البدائل الجاهزة كما هي.',
  positives: pos.length, detected: pos.filter(r => r.detected).length, positivesNotReady: pos.filter(r => r.status !== 'ready').length,
  byType: Object.fromEntries([...new Set(pos.map(r => r.expected))].map(t => [t, `${pos.filter(r => r.expected === t && r.detected).length}/${pos.filter(r => r.expected === t).length}`])),
  negatives: neg.length, falsePositives: neg.filter(r => r.detected).length, missed: pos.filter(r => !r.detected).map(r => `${r.alt} ${r.expected}`),
};
mkdirSync(ROOT + 'evidence/review-proof', { recursive: true });
writeFileSync(ROOT + 'evidence/review-proof/r16-corpus.json', JSON.stringify({ stage, summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
