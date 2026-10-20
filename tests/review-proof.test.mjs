// إثبات أن المراجع المستقل (dist/plan-review.mjs) يرفض المخططات المعيبة فعلًا (passed=false بالبوابة المتوقعة)
// ولا يكتفي بخفض الدرجة. المجموعة تُبنى من بدائل after-4 الناجحة بتحويرات مضبوطة (scripts/defect-corpus.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../dist/plan-review.mjs';
import { buildCorpus, evaluateCorpus, loadBase, MUTATIONS, mirrorX, requestFor } from '../scripts/defect-corpus.mjs';

const base = loadBase('after-4');
const corpus = buildCorpus({ base });
const res = evaluateCorpus(corpus, R, { clean: base });
const byType = t => res.rows.filter(r => r.mutation === t);
const doc = (c, f) => base.find(b => b.case === c && b.file === f);

test('المجموعة: ≥ 40 مستندًا معيبًا، كل نوع عيب مطبَّق ومعه بوابته المتوقعة', () => {
  assert.ok(corpus.length >= 40, `المستندات المعيبة ${corpus.length}`);
  for (const m of MUTATIONS) assert.ok(byType(m.id).length >= 2, `العيب ${m.id} طُبّق ${byType(m.id).length} مرات فقط`);
  for (const c of corpus) { assert.ok(c.expected.length >= 1); assert.ok(c.note && c.note.length > 5, c.id); }
});

test('كل مستند معيب مرفوض (passed=false) بالبوابة المتوقعة نفسها — لا مجرد درجة أقل', () => {
  const missed = res.rows.filter(r => !r.detected || r.passed);
  assert.deepEqual(missed.map(r => `${r.id}: ${r.fired.join('+') || 'لا بوابة'}`), []);
});

test('لا رفض كاذب: كل بدائل after-4 السليمة تجتاز البوابات', () => {
  const bad = res.clean.filter(r => !r.passed);
  assert.deepEqual(bad.map(r => `${r.id}: ${r.fired.join('+')}`), []);
});

test('الدرجة وحدها لا تكفي: معيبون كثيرون بدرجة أعلى من أدنى سليم، ومع ذلك كلهم مرفوضون', () => {
  const cleanMin = Math.min(...res.clean.map(r => r.score));
  const high = res.rows.filter(r => r.score >= cleanMin);
  assert.ok(high.length >= 10, `المعيبون فوق أدنى درجة سليمة: ${high.length}`);
  assert.ok(high.every(r => !r.passed));
  assert.ok(res.summary.scores.defective.mean < res.summary.scores.clean.mean);
});

test('العيوب التي كان المراجع 1.0.0 يمرّرها صارت تُرفض: نافذة صغيرة، فتح باب، تراكب، موضع، نسخة معكوسة', () => {
  for (const t of ['window-too-small', 'swing-blocked', 'overlap-label', 'overlap-walls', 'kitchen-front', 'bedrooms-front', 'mirror-pair', 'mirror-nudged-pair']) {
    const rows = byType(t);
    assert.ok(rows.length && rows.every(r => r.detected && !r.passed), t);
  }
});

test('WINDOW_SIZE: نافذة 0.5×0.5 في غرفة نوم ترسب، والبديل السليم ينجح', () => {
  const b = doc('C1', 'alt-1.json'); const ok = R.reviewDesign(b.doc, b.request, { external: false });
  assert.equal(ok.gates.find(g => g.id === 'WINDOW_SIZE').ok, true);
  const c = corpus.find(x => x.mutation === 'window-too-small' && x.case === 'C1');
  const r = R.reviewDesign(c.doc, c.request, { external: false });
  assert.deepEqual(r.failedGates, ['WINDOW_SIZE']);
  assert.match(r.rejectReasons_ar[0], /أقل من 3٪/);
  assert.equal(R.DESIGN_THRESHOLDS.windowToFloorMin.verified, false);
});

test('DOOR_SWING: الجدار أو الباب في مسار الفتح يرسب؛ قطعة السباكة ملاحظة إلا في strict', () => {
  const c = corpus.find(x => x.mutation === 'swing-blocked');
  assert.ok(R.reviewDesign(c.doc, c.request, { external: false }).failedGates.includes('DOOR_SWING'));
  const b = doc('C1', 'alt-1.json');
  const loose = R.reviewDesign(b.doc, b.request, { external: false }), strict = R.reviewDesign(b.doc, b.request, { external: false, strict: true });
  const g = loose.gates.find(x => x.id === 'DOOR_SWING');
  assert.equal(g.ok, true); assert.ok(g.value.fixedFixtureBlocked >= 1); assert.ok(g.notes_ar.length >= 1);
  assert.equal(strict.passed, false); assert.ok(strict.failedGates.includes('DOOR_SWING'));
});

test('INTEGRITY: غرفتان على فراغ واحد أو فراغ مغلق بلا تسمية يرسب', () => {
  for (const t of ['overlap-label', 'overlap-walls']) {
    const c = corpus.find(x => x.mutation === t);
    const g = R.reviewDesign(c.doc, c.request, { external: false }).gates.find(x => x.id === 'INTEGRITY');
    assert.equal(g.ok, false, t); assert.ok(g.reasons_ar.length >= 1);
  }
});

test('PLACEMENT: «المطبخ في الخلف» يُقاس من المستند؛ و«تطل على الحوش الخلفي» بجدار خارجي يواجه الخلف', () => {
  const c = corpus.find(x => x.mutation === 'kitchen-front');
  const g = R.reviewDesign(c.doc, c.request, { external: false }).gates.find(x => x.id === 'PLACEMENT');
  assert.equal(g.ok, false); assert.match(g.reasons_ar[0], /المطبخ/);
  const c2 = doc('C2', 'alt-1.json'), g2 = R.reviewDesign(c2.doc, c2.request, { external: false }).gates.find(x => x.id === 'PLACEMENT');
  assert.equal(g2.ok, true); assert.equal(g2.applicable, true);
  const none = R.reviewDesign(c2.doc, { counts: c2.request.counts }, { external: false }).gates.find(x => x.id === 'PLACEMENT');
  assert.equal(none.applicable, false); assert.equal(none.ok, true);
});

test('DISTINCT: النسخة المعكوسة من بديل تُرفض في reviewDesigns({distinct}) ولا تُرفض بدونه', () => {
  const b = doc('C10', 'alt-2.json'), m = mirrorX(b.doc);
  const plain = R.reviewDesigns([b.doc, m], b.request, { external: false });
  assert.ok(plain.every(r => r.passed));
  const out = R.reviewDesigns([b.doc, m], b.request, { external: false, distinct: true });
  const rej = out.filter(r => r.failedGates.includes('DISTINCT'));
  assert.equal(rej.length, 1); assert.equal(rej[0].passed, false);
  assert.match(rej[0].rejectReasons_ar.at(-1), /نسخة شكلية/);
  assert.ok(out[0].passed);
});

test('البدائل الأصلية: شرط الاختلاف يكشف الأزواج الشكلية في after-4 (C1 و C2 و C6 و C7 و C8) ويقبل البقية', () => {
  const flagged = Object.fromEntries(res.cleanSets.map(s => [s.case, s.rejectedAsDuplicate]));
  for (const id of ['C1', 'C2', 'C6', 'C7', 'C8']) assert.equal(flagged[id].length, 1, id);
  for (const id of ['C3', 'C4', 'C5', 'C9', 'C10']) assert.deepEqual(flagged[id], [], id);
});

test('طلب الحالة يُقرأ من acceptance-cases (لا قيم مخترعة)', () => {
  const q = requestFor('C6');
  assert.match(q.text, /المطبخ في الخلف/); assert.equal(q.counts.bedrooms, 3);
});
