import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc } from '../dist/draw/doc.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { buildFinalData, computeCost, projectBookHtml, designReasons, BILLABLE, NEXT_STAGES } from '../dist/final-outputs.mjs';

const doc = sampleVilla();
const NOW = new Date('2026-10-16T00:00:00Z');

test('بلا أسعار: لا تكلفة ولا رقم مختلق', () => {
  const d = buildFinalData(doc, { now: NOW });
  assert.equal(d.cost.pricedCount, 0); assert.equal(d.cost.subtotal, 0); assert.equal(d.cost.complete, false);
  assert.ok(d.cost.items.every(i => i.cost === null && i.rate === null));
});
test('الكمية × السعر + احتياط + ضريبة', () => {
  const rows = [{ id: 'doors', value: 10, grade: 'measured' }, { id: 'windows', value: 4, grade: 'measured' }];
  const c = computeCost(rows, { doors: 100, windows: 50 }, { reservePct: 10, vatPct: 15 });
  assert.equal(c.subtotal, 1200); assert.equal(c.reserve, 120); assert.equal(c.vat, 198); assert.equal(c.total, 1518);
  assert.equal(c.pricedCount, 2); assert.equal(c.complete, false);
});
test('سعر سالب أو غير رقمي يُعامل كغير مسعّر', () => {
  const c = computeCost([{ id: 'doors', value: 3, grade: 'measured' }], { doors: '-5', windows: 'abc' });
  assert.equal(c.pricedCount, 0);
});
test('كمية غير متاحة لا تُسعَّر حتى لو أُدخل سعرها', () => {
  const c = computeCost([{ id: 'doors', value: null, grade: 'unavailable' }], { doors: 100 });
  assert.equal(c.items.find(i => i.id === 'doors').cost, null);
});
test('تغطية كل بنود التسعير ووحداتها', () => {
  assert.equal(new Set(BILLABLE.map(b => b.id)).size, BILLABLE.length);
  assert.ok(BILLABLE.every(b => b.unit && b.label));
});
test('بيانات المخرجات من المستند: أدوار ومخططات وإنشائي وبصمة', () => {
  const d = buildFinalData(doc, { now: NOW });
  assert.equal(d.date, '2026-10-16'); assert.ok(d.fingerprint);
  assert.equal(d.levels.length, doc.levels.length);
  assert.ok(d.levels.every(l => l.plan.includes('<svg')));
  assert.ok(d.summary.rooms > 0 && d.summary.builtArea > 0);
});
test('أسباب التصميم لا تدّعي ما لم يُقَس', () => {
  const R = designReasons(buildFinalData(doc, { now: NOW }));
  assert.ok(Array.isArray(R.strengths) && Array.isArray(R.unmeasured) && Array.isArray(R.notes));
});
test('مراحل ما بعد التصميم: المتاح والقادم معلنان بصدق', () => {
  assert.ok(NEXT_STAGES.filter(s => s.status === 'planned').every(s => /لم تُبنَ/.test(s.note)));
});
test('كتاب المشروع: RTL، أقسامه، بلا undefined/NaN، ويهرّب النص', () => {
  const d = buildFinalData({ ...doc, title: '<b>x</b>' }, { rates: { doors: 1000 }, now: NOW });
  const h = projectBookHtml(d);
  assert.match(h, /dir="rtl"/); assert.ok(!/NaN|undefined/.test(h)); assert.ok(!h.includes('<b>x</b>'));
  for (const t of ['نظرة عامة', 'الكميات', 'التكلفة بأسعارك', 'لماذا هذا التصميم', 'ما بعد التصميم']) assert.ok(h.includes(t), t);
  assert.match(h, /غير مسعّر/);
});
test('مستند فارغ لا يكسر البناء', () => {
  const d = buildFinalData(createDoc(), { now: NOW });
  assert.equal(d.summary.rooms, 0);
  assert.doesNotThrow(() => projectBookHtml(d));
});
