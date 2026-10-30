// تخطيط الباب الداخلي المباشر (dist/direct-door.mjs): وحدة هندسية نقية — الجدار المشترك، اتساع الباب، تزاحم الأبواب، حالات التعذر.
// ليست اختبار توليد: اختبارات التوليد الكامل (باب حقيقي في المستند) في tests/villa-direct-door.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planDirectDoor, sharedEdge, doorWidthFor, spanNeeded, DIRECT_DOOR_MIN_SPAN, DIRECT_DOOR_W, DIRECT_DOOR_W_MIN, DOOR_JAMB_CLEAR, DOOR_GAP } from '../dist/direct-door.mjs';

const R = (id, x0, y0, x1, y1, level = 'L1') => ({ id, x0, y0, x1, y1, level });

test('الحد المشترك: جداران متلامسان على خط واحد، وغير المتلامسين null', () => {
  const e = sharedEdge(R('a', 0, 0, 4, 4), R('b', 4, 1, 8, 6));
  assert.deepEqual({ axis: e.axis, at: e.at, from: e.from, to: e.to }, { axis: 'x', at: 4, from: 1, to: 4 });
  assert.equal(sharedEdge(R('a', 0, 0, 4, 4), R('b', 4.5, 0, 8, 4)), null, 'بينهما فراغ 0.5 م');
  assert.equal(sharedEdge(R('a', 0, 0, 4, 4), R('b', 4, 4, 8, 8)), null, 'تماس ركن فقط');
});

test('عرض الباب يتبع الطول المشترك: 0.9 م متى اتسع، وإلا 0.8 م، وإلا لا باب', () => {
  assert.equal(doorWidthFor(2.0), DIRECT_DOOR_W);
  assert.equal(doorWidthFor(spanNeeded(DIRECT_DOOR_W)), DIRECT_DOOR_W);
  assert.ok(Math.abs(spanNeeded(DIRECT_DOOR_W_MIN) - DIRECT_DOOR_MIN_SPAN) < 1e-9, 'باب 0.8 م يحتاج 1.22 م كما في المحرك');
  assert.equal(doorWidthFor(1.25), DIRECT_DOOR_W_MIN);
  assert.equal(doorWidthFor(1.31), DIRECT_DOOR_W_MIN);
  assert.equal(doorWidthFor(DIRECT_DOOR_MIN_SPAN), DIRECT_DOOR_W_MIN);
  assert.equal(doorWidthFor(1.2), null);
  assert.equal(doorWidthFor(0.87), null);
});

test('جدار مشترك كافٍ: باب جديد في منتصف الحد المشترك، على الجدار نفسه، بعرض صالح', () => {
  const a = R('kitchen', 0, 0, 4, 4), b = R('majlis', 4, 0, 8, 4);
  const p = planDirectDoor({ a, b, doors: [] });
  assert.equal(p.ok, true); assert.equal(p.via, 'new');
  assert.equal(p.door.kind, 'door'); assert.equal(p.door.w, DIRECT_DOOR_W);
  assert.deepEqual([p.door.a, p.door.b], ['kitchen', 'majlis']);
  assert.deepEqual({ axis: p.door.edge.axis, at: p.door.edge.at }, { axis: 'x', at: 4 });
  assert.equal(p.door.pos, 2, 'منتصف الحد 0..4');
  // الباب كله داخل الحد المشترك مع بعد ≥ 0.15 م عن الطرفين
  assert.ok(p.door.pos - p.door.w / 2 >= p.door.edge.from + DOOR_JAMB_CLEAR - 1e-9);
  assert.ok(p.door.pos + p.door.w / 2 <= p.door.edge.to - DOOR_JAMB_CLEAR + 1e-9);
});

test('الحد المشترك جزئي: الباب داخل الجزء المشترك فقط لا في كامل جدار أحد الفراغين', () => {
  const a = R('a', 0, 0, 6, 4), b = R('b', 6, 2.5, 10, 7);          // المشترك y من 2.5 إلى 4 (1.5 م)
  const p = planDirectDoor({ a, b });
  assert.equal(p.ok, true); assert.equal(p.door.w, DIRECT_DOOR_W);
  assert.ok(p.door.pos - p.door.w / 2 >= 2.5 + DOOR_JAMB_CLEAR - 1e-9 && p.door.pos + p.door.w / 2 <= 4 - DOOR_JAMB_CLEAR + 1e-9);
});

test('طول مشترك ضيق (0.87 م): تعذّر wall_too_short برسالة تذكر الطول والمطلوب', () => {
  const p = planDirectDoor({ a: R('master', 0, 0, 4, 4), b: R('hall', 4, 3.13, 9, 8) });
  assert.equal(p.ok, false); assert.equal(p.code, 'wall_too_short');
  assert.ok(Math.abs(p.span - 0.87) < 1e-6);
  assert.match(p.why_ar, /0\.87/); assert.match(p.why_ar, /1\.22/);
});

test('بلا تلامس: تعذّر not_adjacent مع المسافة بين الفراغين', () => {
  const p = planDirectDoor({ a: R('a', 0, 0, 4, 4), b: R('b', 5.5, 0, 9, 4) });
  assert.equal(p.ok, false); assert.equal(p.code, 'not_adjacent'); assert.ok(Math.abs(p.gap - 1.5) < 1e-9);
});

test('دوران مختلفان وفراغ واحد: تعذّر برمز خاص لكل حالة', () => {
  assert.equal(planDirectDoor({ a: R('a', 0, 0, 4, 4, 'L1'), b: R('b', 4, 0, 8, 4, 'L2') }).code, 'different_levels');
  const r = R('a', 0, 0, 4, 4); assert.equal(planDirectDoor({ a: r, b: r }).code, 'same_room');
});

test('باب موجود بين الفراغين: يُعاد كما هو دون إضافة (via=existing)', () => {
  const a = R('a', 0, 0, 4, 4), b = R('b', 4, 0, 8, 4);
  const had = { a: 'b', b: 'a', edge: { axis: 'x', at: 4, from: 0, to: 4 }, pos: 1, kind: 'door', w: 0.9 };
  const p = planDirectDoor({ a, b, doors: [had] });
  assert.equal(p.ok, true); assert.equal(p.via, 'existing'); assert.equal(p.door, had);
});

test('فتحة مفتوحة (قوس) بين الفراغين: لا تُحسب بابًا — تعذّر open_passage_instead', () => {
  const a = R('a', 0, 0, 4, 4), b = R('b', 4, 0, 8, 4);
  const arch = { a: 'a', b: 'b', edge: { axis: 'x', at: 4, from: 0, to: 4 }, pos: 2, kind: 'arch', w: 2.4 };
  const p = planDirectDoor({ a, b, doors: [arch] });
  assert.equal(p.ok, false); assert.equal(p.code, 'open_passage_instead');
});

test('باب آخر يشغل منتصف الجدار: الباب الجديد يُزاح إلى مجال خالٍ بفراغ ≥ 0.1 م', () => {
  const a = R('a', 0, 0, 4, 4), b = R('b', 4, 0, 8, 4);
  const other = { a: 'a', b: 'corr', edge: { axis: 'x', at: 4, from: 0, to: 4 }, pos: 2, kind: 'door', w: 0.9 };   // يحجز 1.55..2.45 (+0.1)
  const p = planDirectDoor({ a, b, doors: [other] });
  assert.equal(p.ok, true);
  const lo = p.door.pos - p.door.w / 2, hi = p.door.pos + p.door.w / 2;
  assert.ok(hi <= 2 - 0.45 - DOOR_GAP + 1e-9 || lo >= 2 + 0.45 + DOOR_GAP - 1e-9, `الباب [${lo}, ${hi}] لا يتقاطع مع الباب الآخر [1.55, 2.45]`);
  assert.ok(lo >= DOOR_JAMB_CLEAR - 1e-9 && hi <= 4 - DOOR_JAMB_CLEAR + 1e-9);
});

test('الجدار كله محجوز بأبواب أخرى: تعذّر no_clear_span', () => {
  const a = R('a', 0, 0, 2.6, 2.6), b = R('b', 2.6, 0, 6, 2.6);
  const other = { a: 'a', b: 'corr', edge: { axis: 'x', at: 2.6, from: 0, to: 2.6 }, pos: 1.3, kind: 'door', w: 0.9 };
  const p = planDirectDoor({ a, b, doors: [other] });
  assert.equal(p.ok, false); assert.equal(p.code, 'no_clear_span');
});

test('أبواب على جدران أخرى أو إحداثيات أخرى لا تحجز هذا الجدار', () => {
  const a = R('a', 0, 0, 4, 4), b = R('b', 4, 0, 8, 4);
  const far = { a: 'a', b: 'c', edge: { axis: 'x', at: 0, from: 0, to: 4 }, pos: 2, kind: 'door', w: 0.9 };
  const horiz = { a: 'a', b: 'd', edge: { axis: 'y', at: 4, from: 0, to: 4 }, pos: 2, kind: 'door', w: 0.9 };
  const p = planDirectDoor({ a, b, doors: [far, horiz] });
  assert.equal(p.ok, true); assert.equal(p.door.pos, 2);
});

test('لا تعديل للمدخلات', () => {
  const a = R('a', 0, 0, 4, 4), b = R('b', 4, 0, 8, 4), doors = [{ a: 'a', b: 'x', edge: { axis: 'x', at: 4, from: 0, to: 4 }, pos: 2, kind: 'door', w: 0.9 }];
  const snap = JSON.stringify({ a, b, doors }); planDirectDoor({ a, b, doors }); assert.equal(JSON.stringify({ a, b, doors }), snap);
});
