import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { legacyToDoc } from '../dist/draw/import-legacy.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import { computeStructure, DEFAULT_ASSUMPTIONS } from '../dist/draw/structure.mjs';
import { computeDocQuantities } from '../dist/draw/quantities-doc.mjs';

const build = (w, l, strategy = 'compact') => legacyToDoc(generateModel({ width: w, length: l, floors: 1, streets: { s: true }, entry: 's' }, defaultRooms({ bedrooms: 3, majlis: 1 }), { strategy })).doc;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

test('الإنشاء: أعمدة وجسور وبلاطة من الرسم مع افتراضات معلنة وما لا يُحسب مُعلَن', () => {
  const r = computeStructure(build(18, 26)), L = r.levels[0];
  assert.ok(L.columns.length >= 4 && L.beams.length >= 4);
  assert.ok(L.slab.thickness >= DEFAULT_ASSUMPTIONS.minSlab);
  assert.ok(r.unavailable.length >= 4);
  assert.equal(r.assumptions.fc, 25);
  for (const c of L.columns) assert.ok(c.size >= DEFAULT_ASSUMPTIONS.minColumn && c.Pu > 0 && c.At >= 0);
  for (const b of L.beams) assert.ok(b.depth >= b.length / 21 - 1e-9, 'عمق الجسر ≥ L/21 على الأقل');
});

test('الإنشاء: اتزان الأحمال — مجموع أحمال الأعمدة ≥ حمل البلاطة ولا يقل عنه', () => {
  const L = computeStructure(build(18, 26)).levels[0];
  const slabLoad = L.slab.area * L.slab.wu, cols = sum(L.columns, c => c.Pu);
  assert.ok(cols >= slabLoad * 0.98, `الأعمدة ${cols} أقل من البلاطة ${slabLoad}`);
});

test('الإنشاء: التعديل يغيّر النتيجة (إضافة جدار داخلي تزيد أحمال الأعمدة)', () => {
  const doc = build(18, 26), before = computeStructure(doc).levels[0];
  const lvl = doc.levels[0].id, xs = doc.walls.map(w => w.a.x).concat(doc.walls.map(w => w.b.x));
  const ys = doc.walls.map(w => w.a.y).concat(doc.walls.map(w => w.b.y));
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const d2 = applyCommand(doc, { type: 'add-wall', level: lvl, a: { x: mid - 1.3, y: Math.min(...ys) + 9.0 }, b: { x: mid + 1.3, y: Math.min(...ys) + 9.0 }, t: 0.2 }).doc;
  const after = computeStructure(d2).levels[0];
  assert.ok(sum(after.columns, c => c.Pu) > sum(before.columns, c => c.Pu) + 5, 'وزن الجدار الجديد يصل إلى الأعمدة');
});

test('الإنشاء: عمود رسمه المستخدم يحلّ محل المقترح القريب ولا يُكرَّر', () => {
  const doc = build(18, 26), base = computeStructure(doc).levels[0], p = base.columns[0];
  const d2 = applyCommand(doc, { type: 'add-column', level: doc.levels[0].id, x: p.x + 0.1, y: p.y, size: 0.4 }).doc;
  const L = computeStructure(d2).levels[0];
  assert.equal(L.columns.length, base.columns.length, 'نفس العدد: استُبدل لا أُضيف');
  assert.equal(L.columns.filter(c => c.source === 'user').length, 1);
});

test('الإنشاء: تغيير الافتراضات يغيّر الأحمال (حمل حي أكبر)', () => {
  const doc = build(18, 26);
  const a = sum(computeStructure(doc).levels[0].columns, c => c.Pu), b = sum(computeStructure(doc, { assumptions: { liveFloor: 4, liveRoof: 4 } }).levels[0].columns, c => c.Pu);
  assert.ok(b > a);
});

test('الإنشاء: دوران — الأحمال تتراكم إلى الدور الأرضي', () => {
  const doc = build(18, 26); const L2 = { id: 'L2', name: 'العلوي', elevation: 3.2, height: 3.2 };
  doc.levels.push(L2);
  doc.walls.filter(w => w.level === 'L1').forEach((w, i) => doc.walls.push({ ...JSON.parse(JSON.stringify(w)), id: 'wu' + i, level: 'L2' }));
  const r = computeStructure(doc), g = r.levels[0], u = r.levels[1];
  assert.ok(sum(g.columns, c => c.Pu) > sum(u.columns, c => c.Pu) * 1.5, 'الأرضي يحمل العلوي وحمله');
  assert.ok(u.slab.wu < g.slab.wu + 5, 'العلوي سقف بأحمال أخف');
});

test('الإنشاء: بلا جدران/محيط يعيد فراغًا مُعلنًا لا أرقامًا', () => {
  const doc = build(18, 26); doc.walls = [];
  const r = computeStructure(doc); assert.ok(r.levels[0].empty); assert.equal(r.totals.columns, 0);
});

test('الكميات: خرسانة الهيكل تقدير معلن، والحديد غير قابل للحساب', () => {
  const rows = computeDocQuantities(build(18, 26)).rows, by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.concreteColumns.grade, 'estimated'); assert.equal(by.concreteBeams.grade, 'estimated'); assert.equal(by.rebar.grade, 'unavailable'); assert.equal(by.rebar.value, null);
});
