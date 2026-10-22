// إثبات أن المراجع المستقل (dist/plan-review.mjs) يرفض المخططات المعيبة فعلًا (passed=false بالبوابة المتوقعة)
// ولا يكتفي بخفض الدرجة. المجموعة تُبنى من بدائل المرحلة الأحدث الناجحة (BASE_STAGE، الجولة العاشرة: after-10) بتحويرات
// مضبوطة (scripts/defect-corpus.mjs)؛ وكشف الأزواج الشكلية في after-4 يُقاس بالمقياس المعماري مباشرة.
import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../dist/plan-review.mjs';
import { buildCorpus, evaluateCorpus, loadBase, MUTATIONS, mirrorX, requestFor, BASE_STAGE } from '../scripts/defect-corpus.mjs';
import { archSignature, archDifference, THRESHOLDS } from '../dist/arch-difference.mjs';
import { memo } from './_memo.mjs';

const base = loadBase(BASE_STAGE);
// عيوب الدورين لا تُطبَّق إلا على بدائل بدورين (C7 وحدها؛ بديل واحد في after-10)
const TWO_FLOOR = new Set(['stairs-room-closed', 'stairs-deleted', 'stairs-moved-out', 'stair-too-short', 'stair-narrow']);
const corpus = buildCorpus({ base });
// (الجولة الثالثة عشرة) تقييم المجموعة كلها (≈ 90 مراجعة ثقيلة) يُحفظ على القرص ببصمة شيفرة المراجع ومولّد المجموعة ومستندات المرحلة
const res = memo('review-proof-corpus', { code: ['dist/plan-review.mjs', 'scripts/defect-corpus.mjs'], files: base.map(b => `evidence/acceptance/${BASE_STAGE}/${b.case}/${b.file}`), key: BASE_STAGE + '|' + corpus.map(c => c.id).join(',') }, () => evaluateCorpus(corpus, R, { clean: base }));
const byType = t => res.rows.filter(r => r.mutation === t);
const doc = (c, f) => base.find(b => b.case === c && b.file === f);

test('المجموعة: ≥ 40 مستندًا معيبًا، كل نوع عيب مطبَّق ومعه بوابته المتوقعة', () => {
  assert.ok(corpus.length >= 40, `المستندات المعيبة ${corpus.length}`);
  const twoFloorDocs = base.filter(b => b.doc.levels.length > 1).length;
  // wc-door-kitchen: لا دورة مياه تجاور المطبخ في بدائل after-10 فلا موضع للتحوير (طُبّق على after-4 في الجولات السابقة)
  const NA = new Set(['wc-door-kitchen']);
  // (الجولة الحادية عشرة) bedrooms-front: في بدائل after-11 لا يوجد صف نوم يُنقل إلى الواجهة إلا في بديل C4 الوحيد
  const ONCE = new Set(['bedrooms-front']);
  for (const m of MUTATIONS) if (!NA.has(m.id)) assert.ok(byType(m.id).length >= (TWO_FLOOR.has(m.id) ? Math.min(2, twoFloorDocs) : ONCE.has(m.id) ? 1 : 2), `العيب ${m.id} طُبّق ${byType(m.id).length} مرات فقط`);
  for (const c of corpus) { assert.ok(c.expected.length >= 1); assert.ok(c.note && c.note.length > 5, c.id); }
});

test('كل مستند معيب مرفوض (passed=false) بالبوابة المتوقعة نفسها — لا مجرد درجة أقل', () => {
  const missed = res.rows.filter(r => !r.detected || r.passed);
  assert.deepEqual(missed.map(r => `${r.id}: ${r.fired.join('+') || 'لا بوابة'}`), []);
});

test('لا رفض كاذب: كل البدائل السليمة في المرحلة الأحدث تجتاز البوابات', () => {
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
  for (const t of ['window-too-small', 'swing-blocked', 'overlap-label', 'overlap-walls', 'kitchen-front', 'bedrooms-front', 'mirror-pair', 'mirror-nudged-pair', 'stair-too-short', 'majlis-door-family']) {
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
  // (الجولة الحادية عشرة) بدائل after-11 لا مرحاض فيها داخل فتح الباب (المولّد يتحقق)، فالمثال من العيب wc-at-door: بوابة DOOR_SWING
  // تجعله ملاحظة ما لم يكن strict — وبوابة الحركة الفعلية (CIRCULATION) ترفضه في الحالتين
  const b = corpus.find(x => x.mutation === 'wc-at-door');
  const loose = R.reviewDesign(b.doc, b.request, { external: false }), strict = R.reviewDesign(b.doc, b.request, { external: false, strict: true });
  const g = loose.gates.find(x => x.id === 'DOOR_SWING');
  assert.equal(g.ok, true); assert.ok(g.value.fixedFixtureBlocked >= 1); assert.ok(g.notes_ar.length >= 1);
  assert.ok(loose.failedGates.includes('CIRCULATION'));
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
  assert.match(rej[0].rejectReasons_ar.at(-1), /نسخة معدّلة|نسخة شكلية/);
  assert.ok(out[0].passed);
});

test('البدائل الأصلية: المقياس المعماري يكشف الأزواج الشكلية في after-4 (C1 و C2 و C6 و C7 و C8) ولا يرى في البقية زوجًا شكليًا؛ وبدائل المرحلة الأحدث بلا نسخ شكلية', () => {
  const old = loadBase('after-4'), cosmetic = id => { const ds = old.filter(b => b.case === id).map(b => archSignature(b.doc)); let n = 0; for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) if (archDifference(ds[i], ds[j]).total < THRESHOLDS.cosmetic) n++; return n; };
  for (const id of ['C1', 'C2', 'C6', 'C7', 'C8']) assert.ok(cosmetic(id) >= 1, id);
  for (const id of ['C3', 'C4', 'C5', 'C9', 'C10']) assert.equal(cosmetic(id), 0, id);
  for (const s of res.cleanSets) assert.deepEqual(s.rejectedAsDuplicate, [], s.case);
});

test('STAIR_GEOMETRY وMAJLIS_PRIVACY: السلم القصير أو الضيق والمجلس على الطعام العائلي مرفوضة بالبوابة نفسها، وطبقتها «قيمة تصميمية افتراضية للميزان»', () => {
  for (const t of ['stair-too-short', 'stair-narrow', 'majlis-door-family']) { const rows = byType(t); assert.ok(rows.length >= 1, t); assert.ok(rows.every(r => r.detected && !r.passed), t); }
  const c = corpus.find(x => x.mutation === 'stair-too-short'), g = R.reviewDesign(c.doc, c.request, { external: false }).gates.find(x => x.id === 'STAIR_GEOMETRY');
  assert.equal(g.ok, false); assert.equal(g.tier, 'mizan-default'); assert.match(g.reasons_ar.join(' '), /النائمة/);
  const m = corpus.find(x => x.mutation === 'majlis-door-family');
  const asked = R.reviewDesign(m.doc, { ...m.request, text: m.request.text + '، والمجلس على الطعام (مقلط)' }, { external: false }).gates.find(x => x.id === 'MAJLIS_PRIVACY');
  const opened = R.reviewDesign(m.doc, m.request, { external: false }).gates.find(x => x.id === 'MAJLIS_PRIVACY');
  assert.equal(opened.ok, false);
  // طلب العميل يغلب الافتراضي: الطعام مسموح حين يطلبه، والصالة والمطبخ لا
  if (/«(صالة الطعام|الطعام)»/.test(opened.reasons_ar[0])) assert.equal(asked.ok, true);
});

test('طلب الحالة يُقرأ من acceptance-cases (لا قيم مخترعة)', () => {
  const q = requestFor('C6');
  assert.match(q.text, /المطبخ في الخلف/); assert.equal(q.counts.bedrooms, 3);
});
