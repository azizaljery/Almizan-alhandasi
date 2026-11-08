// اختبارات منطق تعليقات المخطط: سلاسل الأبعاد الثلاثية، المحاور، ترتيب التسميات بلا تراكب، تصنيف الجدران، الدرج، المقياس.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDoc, applyCommand, parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { exteriorWallIds } from '../dist/draw/topology.mjs';
import { dimensionChains, gridAxes, layoutLabels, wallClasses, stairInfo, pickScale, countOverlaps, boxesOverlap, cluster, fixtureSymbol, LINE_MM } from '../dist/draw/plan-annot.mjs';
import { duplicatesChain, pens } from '../dist/draw/editor/render2d.mjs';

/** بيت 8×6 م بجدار قاطع عند x=3 ونافذة شمالية وباب جنوبي. */
function house() {
  let doc = createDoc({ title: 'اختبار' });
  const run = c => { doc = applyCommand(doc, c).doc; };
  run({ type: 'add-rect', level: 'L1', a: { x: 0, y: 0 }, b: { x: 8, y: 6 }, t: .25 });
  run({ type: 'add-wall', level: 'L1', a: { x: 3, y: 0 }, b: { x: 3, y: 6 }, t: .12 });
  const north = doc.walls.find(w => Math.abs(w.a.y - 6) < 1e-6 && Math.abs(w.b.y - 6) < 1e-6);
  const south = doc.walls.find(w => Math.abs(w.a.y) < 1e-6 && Math.abs(w.b.y) < 1e-6);
  run({ type: 'add-opening', wall: north.id, kind: 'window', at: 5.5, w: 1.4 });
  run({ type: 'add-opening', wall: south.id, kind: 'door', at: 1.5, w: .9, swing: 'in', hinge: 'left' });
  return doc;
}
const level = doc => analyzeDoc(doc).levelById.get('L1');

test('drawing: سلاسل الأبعاد على الجهات الأربع بثلاثة مستويات والإجمالي من وجه إلى وجه', () => {
  const doc = house(), lv = level(doc), chains = dimensionChains(doc, 'L1', lv.analysis);
  assert.deepEqual(chains.map(c => c.side), ['n', 'e', 's', 'w']);
  const n = chains.find(c => c.side === 'n');
  assert.equal(n.axis, 'x'); assert.equal(n.sign, 1); assert.equal(n.extent, 6.125);
  const overall = n.chains.find(c => c.level === 'overall');
  assert.equal(overall.segments.length, 1); assert.equal(overall.segments[0].len, 8.25); // 8 م بين المحاور + 2 × 0.125
  const walls = n.chains.find(c => c.level === 'walls');
  assert.deepEqual(walls.segments.map(s => s.len), [3, 5]); // محور إلى محور: 0→3→8
  const opens = n.chains.find(c => c.level === 'openings');
  assert.equal(opens.ticks.length, 4); assert.equal(opens.ticks[0].pos, -0.125); assert.equal(opens.ticks[3].pos, 8.125); // ركن، حافتا النافذة، ركن
  assert.ok(opens.segments.some(s => s.len === 1.4), 'عرض النافذة يظهر في سلسلة الفتحات');
});

test('drawing: السلسلة المطابقة لما بعدها لا تُكرَّر، والجهة بلا فتحات تُسقط مستوى الفتحات', () => {
  const doc = house(), lv = level(doc), chains = dimensionChains(doc, 'L1', lv.analysis);
  const e = chains.find(c => c.side === 'e'); // لا فتحات شرقًا: سلسلة الفتحات تطابق الإجمالي فتُسقط؛ تبقى محاور الجدران (6.00) والإجمالي (6.25)
  assert.deepEqual(e.chains.map(c => c.level), ['walls', 'overall']);
  assert.equal(e.chains[0].segments[0].len, 6); assert.equal(e.chains[1].segments[0].len, 6.25);
  const s = chains.find(c => c.side === 's');
  assert.deepEqual(s.chains.map(c => c.level), ['openings', 'walls', 'overall']);
});

test('drawing: لا سلاسل لمستند بلا محيط مغلق (لا يُخترع بُعد)', () => {
  let doc = createDoc(); doc = applyCommand(doc, { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, t: .2 }).doc;
  assert.deepEqual(dimensionChains(doc, 'L1', level(doc).analysis), []);
});

test('drawing: المحاور من الأعمدة إن وُجدت وإلا من محيط المبنى؛ أرقام لـ X وحروف لـ Y', () => {
  const doc = house(), lv = level(doc);
  const fromOutline = gridAxes(doc, 'L1', { analysis: lv.analysis });
  assert.equal(fromOutline.source, 'outline');
  assert.deepEqual(fromOutline.x.map(a => a.label), ['1', '2', '3']); assert.deepEqual(fromOutline.x.map(a => a.pos), [0, 3, 8]);
  assert.deepEqual(fromOutline.y.map(a => a.label), ['A', 'B']);
  const fromCols = gridAxes(doc, 'L1', { columns: [{ x: 0, y: 0 }, { x: 8.2, y: 0 }, { x: 0, y: 6 }, { x: 8, y: 6.3 }], analysis: lv.analysis });
  assert.equal(fromCols.source, 'columns'); assert.equal(fromCols.x.length, 2); assert.equal(fromCols.y.length, 2);
  assert.deepEqual(cluster([0, .2, 5, 5.3, 9], .45), [0.1, 5.15, 9]);
});

test('drawing: ترتيب التسميات يزيل التراكب بين تسميتين متقاربتين ويبقيهما داخل الفراغ', () => {
  const ring = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
  const mk = (id, seed) => ({ id, seed, ring, lines: [{ text: 'غرفة طويلة الاسم', size: .4 }, { text: '12.00 م²', size: .3 }], areaHint: 24 });
  const lay = layoutLabels([mk('a', { x: 3, y: 2 }), mk('b', { x: 3.1, y: 2.1 })]);
  assert.equal(lay.overlaps, 0); assert.equal(countOverlaps(lay.placed), 0);
  assert.equal(lay.moved, 1, 'الثانية فقط تتحرك');
  for (const p of lay.placed) { assert.ok(p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= 6, 'داخل الفراغ أفقيًا'); assert.ok(p.y - p.h / 2 >= 0 && p.y + p.h / 2 <= 4, 'داخل الفراغ رأسيًا'); }
});

test('drawing: الفراغ الضيق يصغّر الخط ويُعلن التراكب القسري بدل إخفائه', () => {
  const tiny = [{ x: 0, y: 0 }, { x: .6, y: 0 }, { x: .6, y: .6 }, { x: 0, y: .6 }];
  const lay = layoutLabels([{ id: 't', seed: { x: .3, y: .3 }, ring: tiny, lines: [{ text: 'دورة مياه مشتركة', size: .35 }], areaHint: .36 }]);
  assert.equal(lay.placed[0].forced, true); assert.equal(lay.placed[0].scale, .6); assert.equal(lay.shrunk, 1); assert.equal(lay.overlaps, 0);
});

test('drawing: العوائق اللينة (الأثاث) تُحترم إن أمكن ثم يُسمح بالكتابة فوقها، والصلبة لا تُخترق', () => {
  const ring = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];
  const label = { id: 'r', seed: { x: 1.5, y: 1.5 }, ring, lines: [{ text: 'غرفة', size: .4 }], areaHint: 9 };
  const soft = layoutLabels([label], { obstacles: [{ x: 1.5, y: 1.5, w: 1.5, h: 1.5, soft: true }] });
  assert.equal(soft.moved, 1, 'تبتعد عن الأثاث عندما يتسع المكان');
  const full = layoutLabels([label], { obstacles: [{ x: 1.5, y: 1.5, w: 3, h: 3, soft: true }] });
  assert.equal(full.placed[0].forced, undefined); assert.equal(full.overlaps, 0, 'الكتابة فوق الأثاث الممتد لا تُعد تراكبًا');
  const hard = layoutLabels([label], { obstacles: [{ x: 1.5, y: 1.5, w: 3, h: 3 }] });
  assert.equal(hard.placed[0].forced, true); assert.equal(hard.overlaps, 1);
});

test('drawing: تداخل الصناديق', () => {
  assert.equal(boxesOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1.9, y: 0, w: 2, h: 2 }), true);
  assert.equal(boxesOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2.1, y: 0, w: 2, h: 2 }), false);
  assert.equal(countOverlaps([{ x: 0, y: 0, w: 1, h: 1 }, { x: .5, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }]), 1);
});

test('drawing: تصنيف الجدران خارجي/داخلي بسماكته في المفتاح', () => {
  const doc = house(), lv = level(doc), c = wallClasses(doc, 'L1', exteriorWallIds(lv.analysis));
  assert.equal([...c.byId.values()].filter(k => k === 'exterior').length, 4);
  assert.equal([...c.byId.values()].filter(k => k === 'interior').length, 1);
  assert.deepEqual(c.legend.map(g => g.label), ['جدار خارجي 25 سم', 'جدار داخلي (قاطع) 12 سم']);
});

test('drawing: الدرج يعطي عدد القوائم وسهم الصعود من أول قائمة إلى آخر درجة', () => {
  const info = stairInfo({ x: 0, y: 0, rot: 0, w: 1.1, run: 3.2, kind: 'straight' }, 3.2);
  assert.equal(info.N, 19); assert.ok(Math.abs(info.riser - 3.2 / 19) < 1e-3 && info.riser <= .175, 'القائمة ≤ 175 مم (SBC 201 §1011.5.2)'); assert.equal(info.text, 'صعود 19 قائمة');
  assert.ok(info.arrow.to.y > info.arrow.from.y, 'السهم نحو الأعلى في الإطار المحلي');
  assert.equal(info.treads.length, 18);
});

test('drawing: اختيار المقياس القياسي الأصغر الذي يُدخل المسقط في مساحة الرسم', () => {
  assert.equal(pickScale(16.95, 20.15, 271, 210), 100);
  assert.equal(pickScale(30, 20, 271, 210), 125);
  assert.equal(pickScale(8, 6, 271, 210), 50);
  assert.equal(pickScale(500, 500, 271, 210), 500);
});

test('drawing: سماكات الأقلام تحفظ نسب 0.18/0.35/0.5/0.7', () => {
  for (const k of [10, 40, 160]) { const p = pens(k); assert.ok(Math.abs(p.heavy / p.thin - LINE_MM.heavy / LINE_MM.thin) < 1e-9); assert.ok(Math.abs(p.medium / p.thin - LINE_MM.medium / LINE_MM.thin) < 1e-9); }
  assert.ok(pens(160).thin > pens(10).thin, 'تزداد بهدوء مع التكبير');
});

test('drawing: بُعد المستند المطابق لسلسلة تلقائية يُعد مكررًا، وغيره لا', () => {
  const doc = house(), chains = dimensionChains(doc, 'L1', level(doc).analysis);
  assert.equal(duplicatesChain({ a: { x: 0, y: 6.8 }, b: { x: 3, y: 6.8 } }, chains), true);
  assert.equal(duplicatesChain({ a: { x: 1, y: 3 }, b: { x: 2.5, y: 3 } }, chains), false);
});

test('drawing: رمز الأثاث المشترك يتبع دوران القطعة', () => {
  const s = fixtureSymbol({ kind: 'bed-double', x: 2, y: 3, w: 1.8, d: 2, rot: Math.PI / 2 });
  assert.equal(s.outline.length, 4); assert.equal(s.rects.length, 2); assert.equal(s.lines.length, 1);
  const xs = s.outline.map(p => p.x), ys = s.outline.map(p => p.y);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 2) < 1e-9, 'بعد الدوران 90° يصبح العمق على المحور x');
  assert.ok(Math.abs((Math.max(...ys) - Math.min(...ys)) - 1.8) < 1e-9);
});

test('drawing: مستند C1 الحقيقي: 4 جهات، إجمالي 16.95 × 20.15، وتسميات بلا تراكب', () => {
  const doc = parseDoc(readFileSync(new URL('../dist/facade-j/facade-realism/C1.json', import.meta.url), 'utf8'));
  const lv = level(doc), chains = dimensionChains(doc, 'L1', lv.analysis);
  assert.equal(chains.length, 4);
  assert.equal(chains.find(c => c.side === 'n').chains.find(c => c.level === 'overall').segments[0].len, 16.95);
  assert.equal(chains.find(c => c.side === 'e').chains.find(c => c.level === 'overall').segments[0].len, 20.15);
  for (const side of chains) for (const c of side.chains) for (const s of c.segments) assert.ok(s.len > 0, 'كل مقطع موجب');
});

test('drawing: كل سلسلة فيها علامتان على الأقل ومقاطعها = العلامات − 1 (مستندات مختلفة، منها ما هو قيد الرسم)', () => {
  let partial = createDoc();
  for (const [a, b] of [[[0, 0], [8, 0]], [[8, 0], [8, 6]], [[8, 6], [0, 6]], [[0, 6], [0, 0]]]) partial = applyCommand(partial, { type: 'add-wall', level: 'L1', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, t: .2 }).doc;
  for (const doc of [house(), partial, parseDoc(readFileSync(new URL('../dist/facade-j/facade-realism/C1.json', import.meta.url), 'utf8'))]) {
    for (const side of dimensionChains(doc, 'L1', level(doc).analysis)) for (const c of side.chains) { assert.ok(c.ticks.length >= 2, side.side + '/' + c.level); assert.equal(c.segments.length, c.ticks.length - 1); }
  }
});
