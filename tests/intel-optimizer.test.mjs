// مولّد البدائل بالتحسين: الانعكاس، التحقق من القيود، والبحث المحلي بأرقام.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, parseDoc, serialize, applyCommand } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { optimizeVariants, mirrorDoc, verifyVariant, evaluateDoc, docProblems, THRESHOLDS } from '../dist/intel/variant-optimizer.mjs';
import { rect, label, open, run } from './fixtures/draw-cases.mjs';

const base = () => createDoc({ title: 'اختبار البدائل' });
const areas = doc => Object.fromEntries(analyzeDoc(doc).levels[0].rooms.map(r => [r.name, Math.round(r.area * 100) / 100]));
/** بيت 12×4: غرفة نوم على الغرب بنافذة غربية، صالة في الوسط بمدخل جنوبي، مخزن على الشرق بنافذة شرقية (مساحتان متماثلتان). */
function westBedroomHouse() {
  let d = run(base(), { type: 'set-plot', polygon: [{ x: -2, y: -2 }, { x: 14, y: -2 }, { x: 14, y: 6 }, { x: -2, y: 6 }], north: 0, entry: 's', streets: ['s', 'e'], entries: ['s'] });
  d = rect(d, 0, 0, 4, 4); d = rect(d, 4, 0, 8, 4); d = rect(d, 8, 0, 12, 4);
  d = open(d, 6, 0, 'door2', { entry: true }); d = open(d, 4, 2, 'door'); d = open(d, 8, 2, 'door');
  d = open(d, 0, 2, 'window'); d = open(d, 12, 2, 'window'); d = open(d, 6, 4, 'window');
  d = label(d, 2, 2, 'غرفة نوم', 'bedroom'); d = label(d, 6, 2, 'الصالة', 'living'); d = label(d, 10, 2, 'المخزن', 'storage');
  return d;
}

test('mirrorDoc: مستند صالح، المساحات والفتحات محفوظة، والمدخل والشوارع تنعكس شرق/غرب', () => {
  const doc = westBedroomHouse(), m = mirrorDoc(doc);
  assert.doesNotThrow(() => parseDoc(serialize(m.doc)));
  assert.deepEqual(areas(m.doc), areas(doc));
  assert.equal(m.doc.openings.length, doc.openings.length);
  assert.deepEqual(m.doc.streets, ['s', 'w']); assert.equal(m.doc.entry, 's');
  // النافذة الغربية (x=0) تصبح شرقية والغرفة التي تحملها هي الغرفة نفسها بالاسم
  const lv = analyzeDoc(m.doc).levels[0];
  const bed = lv.rooms.find(r => r.name === 'غرفة نوم');
  assert.ok(bed.centroid.x > 8, 'غرفة النوم انتقلت إلى الشرق');
  assert.ok(lv.openings.some(op => op.window && op.sides.some(s => s.room.id === bed.id && s.exterior && s.compass === 'e')));
  assert.equal(verifyVariant(analyzeDoc(doc), m.doc).ok, true);
  assert.equal(mirrorDoc(createDoc()), null);
});

test('verifyVariant يرفض كسر القيود: حذف غرفة، تغيير مساحة فوق السماح، وفراغًا بلا وصول', () => {
  const doc = westBedroomHouse(), baseModel = analyzeDoc(doc);
  const noLabel = applyCommand(doc, { type: 'delete', ids: [doc.labels[2].id] }).doc;
  const v1 = verifyVariant(baseModel, noLabel); assert.equal(v1.ok, false); assert.ok(v1.problems.some(p => /عدد الفراغات/.test(p)));
  // تحريك الجدار الفاصل يغيّر مساحتي الغرفتين بأكثر من 25٪
  const moved = applyCommand(doc, { type: 'move-node', level: 'L1', from: { x: 4, y: 0 }, to: { x: 1.5, y: 0 } }).doc;
  const moved2 = applyCommand(moved, { type: 'move-node', level: 'L1', from: { x: 4, y: 4 }, to: { x: 1.5, y: 4 } }).doc;
  const v2 = verifyVariant(baseModel, moved2); assert.equal(v2.ok, false); assert.ok(v2.problems.some(p => /مساحة/.test(p)), v2.problems.join(' | '));
  const sep = doc.walls.find(w => Math.abs(w.a.x - 4) < 1e-9 && Math.abs(w.b.x - 4) < 1e-9), door = doc.openings.find(o => o.wall === sep.id);
  const sealed = applyCommand(doc, { type: 'delete', ids: [door.id] }).doc;
  const v3 = verifyVariant(baseModel, sealed); assert.equal(v3.ok, false); assert.ok(v3.problems.some(p => /لا يُوصل/.test(p)), v3.problems.join(' | '));
  // مشكلة موجودة في الأصل لا تُحسب على البديل
  assert.ok(docProblems(sampleVilla(), analyzeDoc(sampleVilla())).length > 0);
  assert.equal(verifyVariant(analyzeDoc(sampleVilla()), sampleVilla()).ok, true);
});

test('optimizeVariants: غرفة نوم على الغرب ومخزن بمساحة مماثلة على الشرق → بديل بالتبديل أو الانعكاس يرفع المناخ بالأرقام', () => {
  const doc = westBedroomHouse();
  const t = Date.now(), r = optimizeVariants(doc), ms = Date.now() - t;
  assert.ok(ms < 3000, 'ms=' + ms);
  assert.ok(r.variants.length >= 1 && r.variants.length <= 3);
  assert.equal(r.base.total, evaluateDoc(doc).total);
  const v = r.variants[0];
  assert.ok(v.gain >= THRESHOLDS.minGain); assert.equal(Math.round((v.total - r.base.total) * 100) / 100, v.gain);
  assert.ok(v.climate > r.base.climate, 'المناخ تحسّن');
  assert.ok(v.ops.length >= 1 && v.ops.every(o => ['swap', 'entry', 'mirror'].includes(o.kind) && /[؀-ۿ]/.test(o.text)));
  assert.ok(v.changes.length >= 1 && v.changes.every(c => /→/.test(c)));
  assert.doesNotThrow(() => parseDoc(serialize(v.doc)));
  assert.deepEqual(Object.keys(areas(v.doc)).sort(), Object.keys(areas(doc)).sort());
  // الترتيب تنازلي وكل بديل مختلف العمليات
  for (let i = 1; i < r.variants.length; i++) assert.ok(r.variants[i - 1].total >= r.variants[i].total);
  assert.equal(new Set(r.variants.map(x => x.ops.map(o => o.text).join('|'))).size, r.variants.length);
  assert.match(r.note, /غير معايرة/);
});

test('optimizeVariants يجرّب نقل المدخل إلى جهة شارع فقط، ويعيد قائمة فارغة وملاحظة عندما لا يوجد تحسين', () => {
  const doc = westBedroomHouse();
  const r = optimizeVariants(doc, { thresholds: { depth: 1 } });
  const entryOps = r.variants.flatMap(v => v.ops.filter(o => o.kind === 'entry'));
  for (const o of entryOps) assert.match(o.text, /الشرقية|الجنوبية/); // الشوارع s و e فقط
  const none = optimizeVariants(doc, { thresholds: { minGain: 1000 } });
  assert.equal(none.variants.length, 0); assert.match(none.note, /لم يجد/);
  assert.ok(none.evaluated > 0);
});

test('الفيلا النموذجية: البحث ينتهي ضمن السقف ويعيد بدائل صالحة أو لا شيء بصدق', () => {
  const r = optimizeVariants(sampleVilla());
  assert.ok(r.evaluated <= THRESHOLDS.maxEvals);
  for (const v of r.variants) { assert.doesNotThrow(() => parseDoc(serialize(v.doc))); assert.ok(v.total > r.base.total); assert.equal(v.before.total, r.base.total); }
});
