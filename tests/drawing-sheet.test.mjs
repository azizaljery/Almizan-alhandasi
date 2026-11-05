// اختبارات لوحة المسقط (SVG) وتكاملها مع كتاب المشروع: مقاس اللوحة، المقياس، جدول العنوان، المفتاح، التراكب، والرجوع الآمن.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDoc, applyCommand, parseDoc } from '../dist/draw/doc.mjs';
import { computeStructure } from '../dist/draw/structure.mjs';
import { planSheet, planSheetSvg, PX_PER_MM } from '../dist/draw/plan-sheet.mjs';
import { SHEETS } from '../dist/draw/plan-annot.mjs';
import { buildFinalData, projectBookHtml, sheetNote, DEFAULT_SHEET } from '../dist/final-outputs.mjs';

const C1 = () => parseDoc(readFileSync(new URL('../dist/facade-j/facade-realism/C1.json', import.meta.url), 'utf8'));
function house() {
  let doc = createDoc({ title: 'بيت الاختبار' });
  const run = c => { doc = applyCommand(doc, c).doc; };
  run({ type: 'add-rect', level: 'L1', a: { x: 0, y: 0 }, b: { x: 8, y: 6 }, t: .25 });
  run({ type: 'add-wall', level: 'L1', a: { x: 3, y: 0 }, b: { x: 3, y: 6 }, t: .12 });
  run({ type: 'add-label', level: 'L1', name: 'مجلس', roomType: 'majlis', seed: { x: 5.5, y: 3 } });
  run({ type: 'add-label', level: 'L1', name: 'مطبخ', roomType: 'kitchen', seed: { x: 1.5, y: 3 } });
  run({ type: 'add-stair', level: 'L1', kind: 'straight', x: 6, y: .5, rot: 0, w: 1.1, run: 3.2 });
  const south = doc.walls.find(w => Math.abs(w.a.y) < 1e-6 && Math.abs(w.b.y) < 1e-6);
  run({ type: 'add-opening', wall: south.id, kind: 'door', at: 1.5, w: .9, swing: 'in', hinge: 'left', entry: true });
  run({ type: 'add-opening', wall: south.id, kind: 'window', at: 5, w: 1.4 });
  return doc;
}

test('sheet: لوحة A3 أفقية بمقياس قياسي يُدخل C1 (16.95 × 20.15 م) في منطقة الرسم: 1:100', () => {
  const r = planSheet(C1(), { levelId: 'L1', date: '2026-11-05', fingerprint: 'abc' });
  assert.equal(r.meta.sheet, 'A3'); assert.equal(r.meta.scale, 100);
  assert.match(r.svg, /width="420mm" height="297mm"/); assert.match(r.svg, new RegExp(`viewBox="0 0 ${420 * PX_PER_MM} ${297 * PX_PER_MM}"`));
  assert.equal(r.meta.labelOverlaps, 0, 'لا تراكب بين تسميات الفراغات');
  assert.equal(r.meta.dimTextOverlaps, 0, 'لا تراكب بين نصوص الأبعاد');
  assert.equal(r.meta.axes.source, 'outline');
});

test('sheet: A1 يعطي مقياسًا أكبر (1:50) للمسقط نفسه، والمقياس المفروض يُحترم', () => {
  assert.equal(planSheet(C1(), { sheet: 'A1' }).meta.scale, 50);
  assert.equal(planSheet(C1(), { sheet: 'A3', scale: 200 }).meta.scale, 200);
  assert.equal(planSheet(C1(), { sheet: 'XX' }).meta.sheet, 'A3', 'مقاس مجهول → A3');
  assert.ok(SHEETS.A1.w > SHEETS.A3.w);
});

test('sheet: جدول العنوان يحمل المشروع والمالك والأرض والدور والمقياس والتاريخ والبصمة والمكتب، وتنويه «ليس للتنفيذ»', () => {
  const svg = planSheetSvg(C1(), { date: '2026-11-05', fingerprint: 'fp-123', owner: 'أبو عزيز', office: 'مكتب الاختبار', sheetNo: 'A-07' });
  for (const s of ['تصميم أولي من شرعاء', 'أبو عزيز', '20.00 × 30.00 م', 'الدور الأرضي', '1:100', 'A-07 · 2026-11-05', 'fp-123', 'مكتب الاختبار', 'الميزان الهندسي', 'مفتاح الرموز', 'مخططًا معتمدًا']) assert.ok(svg.includes(s), 'ينقص: ' + s);
  assert.ok(svg.includes('غير مُدخل') === false);
  assert.ok(planSheetSvg(C1(), {}).includes('غير مُدخل'), 'المالك غير المُدخل يُعلن لا يُخترع');
});

test('sheet: الأعمدة المقترحة تُرسم وتظهر في المفتاح مع «افتراض» النظام الإنشائي، والمحاور من الأعمدة', () => {
  const doc = C1(), cols = computeStructure(doc).levels[0].columns;
  const r = planSheet(doc, { columns: cols });
  assert.equal(r.meta.columns, cols.length); assert.equal(r.meta.axes.source, 'columns');
  assert.ok(r.svg.includes('عمود خرساني (مقترح — تحجيم أولي)')); assert.ok(r.svg.includes('افتراض'));
  const noCols = planSheet(doc, {});
  assert.equal(noCols.meta.columns, 0); assert.ok(noCols.svg.includes('نوع الجدار (حامل/قاطع) افتراض'));
});

test('sheet: الرموز: جدار خارجي مصمت وداخلي مهشّر، باب بقوس، نافذة بخط مزدوج، درج بعدد القوائم، منسوب المدخل ±0.00', () => {
  const svg = planSheetSvg(house(), {});
  assert.match(svg, /<pattern id="ps\d+-hatch"/); assert.match(svg, /fill="url\(#ps\d+-hatch\)"/, 'الجدار الداخلي مهشّر');
  assert.match(svg, /class="walls">[^]*fill="#000"/, 'الجدار الخارجي مصمت');
  assert.match(svg, /<path d="M[\d., ]+A[\d. ]+ 0 0 [01] [\d.,]+" fill="none"/, 'قوس الباب');
  assert.ok(svg.includes('صعود 16 قائمة')); assert.ok(svg.includes('المدخل الرئيسي  ±0.00'));
  assert.ok(svg.includes('جدار خارجي 25 سم') && svg.includes('جدار داخلي (قاطع) 12 سم'));
  assert.ok(svg.includes('ش'), 'سهم الشمال'); assert.ok(/\d م<\/text>/.test(svg), 'المقياس الخطي');
});

test('sheet: التسميات تحمل الاسم والمساحة وأبعاد المستطيل، وسلاسل الأبعاد على الجهات الأربع', () => {
  const r = planSheet(house(), {});
  assert.ok(r.svg.includes('مجلس') && r.svg.includes('مطبخ'));
  assert.match(r.svg, /\d+\.\d\d × \d+\.\d\d/); assert.match(r.svg, /\d+\.\d\d م²/);
  assert.deepEqual(r.meta.chains.map(c => c.side), ['n', 'e', 's', 'w']);
  assert.ok(r.svg.includes('>8.25<'), 'الإجمالي من وجه إلى وجه');
});

test('sheet: مستند بلا محيط مغلق يعطي لوحة بلا سلاسل ولا يرمي خطأ', () => {
  let doc = createDoc(); doc = applyCommand(doc, { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, t: .2 }).doc;
  const r = planSheet(doc, {});
  assert.equal(r.meta.chains.length, 0); assert.ok(r.svg.startsWith('<svg'));
});

test('book: بيانات الكتاب تحمل لوحة المسقط (A3 افتراضًا) وبياناتها، والمسقط البسيط يبقى للتصدير', () => {
  const d = buildFinalData(C1(), { now: new Date('2026-11-05T00:00:00Z') });
  assert.equal(DEFAULT_SHEET, 'A3');
  const l = d.levels[0];
  assert.ok(l.plan.includes('class="plan-sheet"')); assert.equal(l.sheet.size, 'A3'); assert.equal(l.sheet.scale, 100); assert.equal(l.sheet.labelOverlaps, 0);
  assert.ok(l.sheet.columns > 0, 'أعمدة التحجيم الأولي تدخل اللوحة'); assert.equal(l.sheet.axes.source, 'columns');
  assert.ok(l.planSimple.startsWith('<svg') && !l.planSimple.includes('plan-sheet'));
  assert.ok(l.plan.includes(d.fingerprint) && l.plan.includes('2026-11-05'), 'البصمة والتاريخ في جدول العنوان');
  const a1 = buildFinalData(C1(), { sheet: 'A1', owner: 'المالك' }); assert.equal(a1.levels[0].sheet.size, 'A1'); assert.ok(a1.levels[0].plan.includes('المالك'));
});

test('book: كتاب المشروع يضم اللوحة بصنف الطباعة وسطر المقياس', () => {
  const d = buildFinalData(C1(), { now: new Date('2026-11-05T00:00:00Z') });
  const html = projectBookHtml(d, { css: '' });
  assert.ok(html.includes('pb-sheet')); assert.ok(html.includes('لوحة A3 أفقية بمقياس 1:100'));
  assert.ok(sheetNote({ sheet: null, sheetError: 'x' }).includes('تعذّرت'));
});
