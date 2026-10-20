// مقياس الاختلاف المعماري (dist/arch-difference.mjs): الانعكاس ≈ 0، التطابق = 0، التماثل، المدى، ومعايرة على أحكام بشرية.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { archDifference, archSignature, archMatrix, hungarian, WEIGHTS, THRESHOLDS, verdictOf } from '../dist/arch-difference.mjs';
import { loadBase, mirrorX } from '../scripts/defect-corpus.mjs';

const after = loadBase('after-4'), before = loadBase('before');
const get = (set, c, n) => set.find(b => b.case === c && b.file === `alt-${n}.json`).doc;

test('الخوارزمية المجرية: تعيين بأقل كلفة', () => {
  const C = [[4, 1, 3], [2, 0, 5], [3, 2, 2]];
  const a = hungarian(C);
  assert.equal(a.reduce((s, j, i) => s + C[i][j], 0), 5);
  assert.deepEqual([...a].sort(), [0, 1, 2]);
});

test('الأوزان معلنة ومجموعها 1، والعتبات مرتّبة', () => {
  assert.equal(Math.round((WEIGHTS.adjacency + WEIGHTS.circulation + WEIGHTS.zoning) * 1000), 1000);
  assert.ok(THRESHOLDS.cosmetic < THRESHOLDS.distinct);
  assert.equal(verdictOf(0.05), 'cosmetic'); assert.equal(verdictOf(0.2), 'partial'); assert.equal(verdictOf(0.4), 'distinct');
});

test('المستند مع نفسه = 0، والمعكوس يمينًا ويسارًا ≈ 0 لكل بدائل after-4', () => {
  for (const b of after) {
    assert.equal(archDifference(b.doc, b.doc).total, 0, b.case + b.file);
    const m = archDifference(b.doc, mirrorX(b.doc));
    assert.ok(m.total < 0.01, `${b.case}/${b.file} معكوس = ${m.total}`);
    assert.equal(m.adjacency, 0, `${b.case}/${b.file} التجاور لا يتغير بالانعكاس`);
    assert.equal(m.circulation, 0, `${b.case}/${b.file} الحركة لا تتغير بالانعكاس`);
  }
});

test('تماثل ومدى: d(a,b) = d(b,a) و 0 ≤ d ≤ 1', () => {
  const docs = after.filter(b => b.case === 'C10').map(b => b.doc);
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const x = archDifference(docs[i], docs[j]), y = archDifference(docs[j], docs[i]);
    assert.ok(Math.abs(x.total - y.total) < 0.005, `${i}-${j}: ${x.total} / ${y.total}`);
    for (const k of ['total', 'adjacency', 'circulation', 'zoning']) assert.ok(x[k] >= 0 && x[k] <= 1, k);
  }
});

test('تبديل أسماء الغرف لا يغيّر شيئًا؛ حذف باب يغيّر التجاور والحركة', () => {
  const d = get(after, 'C1', 1), s = JSON.parse(JSON.stringify(d));
  const beds = s.labels.filter(l => l.type === 'bedroom'); [beds[0].name, beds[1].name] = [beds[1].name, beds[0].name];
  assert.equal(archDifference(d, s).total, 0);
  const t = JSON.parse(JSON.stringify(d)); t.openings = t.openings.filter(o => o.id !== 'o2'); // الفتحة بين مدخل العائلة والصالة
  const x = archDifference(d, t);
  assert.ok(x.adjacency > 0 && x.circulation > 0, JSON.stringify(x));
});

test('معايرة بشرية: الأزواج «نفس التنظيم» شكلية، والأزواج المختلفة ليست شكلية', () => {
  const same = [[before, 'C4', 1, 2], [before, 'C6', 2, 3], [before, 'C2', 1, 2], [after, 'C1', 1, 3], [after, 'C2', 1, 2], [after, 'C8', 2, 4], [after, 'C6', 1, 2], [after, 'C7', 1, 2]];
  const diff = [[after, 'C8', 1, 3], [after, 'C10', 1, 3], [after, 'C10', 3, 4], [after, 'C10', 1, 5]];
  for (const [set, c, i, j] of same) { const d = archDifference(get(set, c, i), get(set, c, j)); assert.equal(d.verdict, 'cosmetic', `${c} ${i}-${j} = ${d.total}`); }
  for (const [set, c, i, j] of diff) { const d = archDifference(get(set, c, i), get(set, c, j)); assert.notEqual(d.verdict, 'cosmetic', `${c} ${i}-${j} = ${d.total}`); }
});

test('مصفوفة C10 (after-4): لا زوج شكلي بين البدائل الخمسة، وأقلها فوق عتبة الشكلي', () => {
  const m = archMatrix(after.filter(b => b.case === 'C10').map(b => b.doc));
  assert.equal(m.matrix.length, 5); assert.equal(m.pairs.length, 10);
  assert.deepEqual(m.cosmeticPairs, []); assert.ok(m.min >= THRESHOLDS.cosmetic);
});

test('التوقيع: عقدة الخارج موصولة بالمداخل، وتسلسلات الحركة لكل نطاق', () => {
  const s = archSignature(get(after, 'C1', 1));
  assert.equal(s.nodes[0].label, 'out'); assert.ok(s.adj[0].length >= 2, 'مدخلان معلّمان على الأقل (عائلة ورجال)');
  assert.equal(s.nodes[1].label, 'svc'); assert.ok(s.adj[1].length >= 1, 'باب خدمة/جانبي (المطبخ، مجلس النساء)');
  for (const z of ['guest', 'family', 'private', 'service']) assert.ok(s.routes[z].length >= 1, z);
  assert.equal(s.unreachable, 0);
  assert.ok(s.grids[0].guest.reduce((a, b) => a + b, 0) > 0);
});

test('دليل المعايرة مكتوب ويتفق مع الأحكام البشرية', () => {
  const ev = JSON.parse(readFileSync(new URL('../evidence/review-proof/arch-difference.json', import.meta.url), 'utf8'));
  assert.ok(ev.human.every(h => h.agrees)); assert.ok(ev.mirror['after-4'].max < 0.05);
});
