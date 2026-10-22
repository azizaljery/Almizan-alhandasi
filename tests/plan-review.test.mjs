// محرك المراجعة المستقل: مستندات مرسومة يدويًا تُسقط كل بوابة على حدة، ومستند سليم يمر من كلها.
import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, applyCommand } from '../dist/draw/doc.mjs';
import { reviewDesign, reviewDesigns, rejectionTable, evaluateGates, GATES, MIN_CLEAR_WIDTH, UNVERIFIED_AR, SCORE_WEIGHTS, pearson, spearman } from '../dist/plan-review.mjs';

const run = (doc, ...cs) => cs.reduce((d, c) => applyCommand(d, c).doc, doc);
const wall = (d, ax, ay, bx, by, t = 0.12, level = 'L1') => run(d, { type: 'add-wall', level, a: { x: ax, y: ay }, b: { x: bx, y: by }, t });
const label = (d, x, y, name, roomType, level = 'L1') => run(d, { type: 'add-label', level, name, roomType, seed: { x, y } });
function open(d, x, y, kind, extra = {}) {
  const w = d.walls.find(w => w.level === (extra.level || 'L1') && Math.abs((w.b.x - w.a.x) * (y - w.a.y) - (w.b.y - w.a.y) * (x - w.a.x)) < 1e-6 && Math.min(w.a.x, w.b.x) - 1e-6 <= x && x <= Math.max(w.a.x, w.b.x) + 1e-6 && Math.min(w.a.y, w.b.y) - 1e-6 <= y && y <= Math.max(w.a.y, w.b.y) + 1e-6);
  if (!w) throw new Error(`no wall at ${x},${y}`);
  const { level, ...rest } = extra; void level;
  return run(d, { type: 'add-opening', wall: w.id, kind, at: Math.hypot(x - w.a.x, y - w.a.y), ...rest });
}

/**
 * بيت سليم (مبنى 14×12 على أرض 20×24، ارتداد أمامي 3 وجانبي 1.5):
 *   الصف الأمامي y4..9 : مجلس (3..8) بمدخل ضيوف مستقل | مدخل العائلة (8..10) | مطبخ (10..17)
 *   الصف الأوسط y9..13 : صالة (3..12، 9×4) | غرفة نوم 1 (12..17)
 *   الصف الخلفي y13..16: غرفة نوم 2 (3..9) | حمام (9..12) | مخزن (12..17)
 */
function house(o = {}) {
  let d = createDoc({ title: 'بيت اختبار', plot: { polygon: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 24 }, { x: 0, y: 24 }], setbacks: { s: o.frontSetback ?? 3, n: 1.5, e: 1.5, w: 1.5 } }, entry: 's' });
  d = { ...d, streets: ['s'], entries: ['s'] }; // كما في مستندات المولّد؛ يحتاجها التحويل إلى النموذج القديم (Mizan/AZIZ)
  d = run(d, { type: 'add-rect', level: 'L1', a: { x: 3, y: 4 }, b: { x: 17, y: 16 }, t: 0.2 });
  d = wall(d, 3, 9, 17, 9); d = wall(d, 3, 13, 17, 13);
  d = wall(d, 8, 4, 8, 9); d = wall(d, 10, 4, 10, 9);
  if (!o.longHall) d = wall(d, 12, 9, 12, 13);
  d = wall(d, 12, 13, 12, 16);
  const bathX = o.narrowBath ? 11.2 : 9;
  d = wall(d, bathX, 13, bathX, 16);
  d = label(d, 5.5, 6.5, 'مجلس الرجال', 'majlis');
  d = label(d, 9, 6.5, o.bedroomByMajlis ? 'غرفة نوم 3' : 'مدخل العائلة', o.bedroomByMajlis ? 'bedroom' : 'entrance');
  d = label(d, 13.5, 6.5, 'المطبخ', 'kitchen');
  d = label(d, 7, 11, 'الصالة', 'living');
  if (!o.longHall) d = label(d, 14.5, 11, 'غرفة نوم 1', 'bedroom');
  d = label(d, bathX / 2 + 1.5, 14.5, o.diningBack ? 'غرفة الطعام' : 'غرفة نوم 2', o.diningBack ? 'dining' : 'bedroom');
  d = label(d, (bathX + 12) / 2, 14.5, 'حمام', 'bath');
  d = label(d, 14.5, 14.5, 'مخزن', 'storage');
  // أبواب
  if (!o.noGuestDoor) d = open(d, 5.5, 4, 'door', { entry: true });
  d = open(d, 9, 4, 'door', { entry: true, w: 1.0 });
  d = open(d, 9, 9, 'arch', { w: 1.2 });
  d = open(d, 11, 9, 'door');
  if (!o.longHall) d = open(d, 12, 11, 'door');
  if (!o.noBedroom2Door) d = open(d, 5, 13, 'door');
  d = open(d, (bathX + 12) / 2, 13, 'door', { w: 0.6 });
  if (!o.longHall) d = open(d, 14.5, 13, 'door');
  if (o.majlisFromHall) d = open(d, 5.5, 9, 'door');
  if (o.bedroomByMajlis) d = open(d, 8, 6.5, 'door');
  if (o.diningBack) d = open(d, bathX, 14.5, 'door', { w: 0.7 });
  // نوافذ
  d = open(d, 3, 6.5, 'window');
  d = open(d, 13.5, 4, 'window');
  if (!o.windowlessHall) d = open(d, 3, 11, 'window');
  d = open(d, 17, 11, 'window');
  d = open(d, 5, 16, 'window');
  if (o.stair) d = run(d, { type: 'add-stair', level: 'L1', kind: 'straight', x: o.stair.x, y: o.stair.y, rot: 0, w: 1.0, run: 2.4 });
  if (o.upper) {
    d = run(d, { type: 'add-level', name: 'الدور الأول' });
    const L2 = d.levels[1].id;
    d = run(d, { type: 'add-rect', level: L2, a: { x: 3, y: 4 }, b: { x: 17, y: 16 }, t: 0.2 });
    d = wall(d, 3, 10, 17, 10, 0.12, L2);
    d = label(d, 10, 7, 'الصالة العلوية', 'living', L2);
    d = label(d, 10, 13, 'غرفة نوم علوية', 'bedroom', L2);
    d = open(d, 10, 10, 'door', { level: L2 });
    d = open(d, 3, 7, 'window', { level: L2 });
    d = open(d, 10, 16, 'window', { level: L2 });
  }
  return d;
}
const gate = (doc, id, request = {}) => evaluateGates(doc, request).find(g => g.id === id);
const failing = (doc, request = {}) => evaluateGates(doc, request).filter(g => !g.ok).map(g => g.id);

test('بيت سليم يمر من كل البوابات ودرجته بين 0 و100 مفككة', () => {
  const doc = house();
  assert.deepEqual(failing(doc, { counts: { bedrooms: 2, majlis: 1, kitchens: 1 } }), []);
  const r = reviewDesign(doc, { counts: { bedrooms: 2 } }, { external: false });
  assert.equal(r.passed, true); assert.deepEqual(r.rejectReasons_ar, []);
  assert.ok(r.score > 0 && r.score <= 100, String(r.score));
  assert.deepEqual(r.breakdown.map(b => b.id), Object.keys(SCORE_WEIGHTS));
  for (const id of ['circulation', 'daylight', 'privacy', 'zoning', 'proportion']) assert.notEqual(r.breakdown.find(b => b.id === id).value, null, id);
  assert.equal(r.breakdown.find(b => b.id === 'furniture').value, null, 'لا أثاث: غير مُقيَّم ولا يدخل الوزن');
  assert.equal(r.breakdown.find(b => b.id === 'furniture').effectiveWeight, 0);
  assert.equal(r.gates.length, GATES.length);
});

test('REACH: غرفة بلا باب تُسقط بوابة الوصول مع اسمها', () => {
  const g = gate(house({ noBedroom2Door: true }), 'REACH');
  assert.equal(g.ok, false); assert.equal(g.value.unreachable, 1);
  assert.match(g.reasons_ar[0], /غرفة نوم 2/);
});

test('DAYLIGHT: صالة بلا نافذة خارجية ترسب', () => {
  const g = gate(house({ windowlessHall: true }), 'DAYLIGHT');
  assert.equal(g.ok, false); assert.match(g.reasons_ar[0], /الصالة/);
  assert.equal(gate(house(), 'DAYLIGHT').ok, true);
});

test('MIN_WIDTH: حمام عرضه 0.8 م يرسب، والعتبة موسومة غير متحققة نظاميًا مع مصدرها', () => {
  const g = gate(house({ narrowBath: true }), 'MIN_WIDTH');
  assert.equal(g.ok, false); assert.match(g.reasons_ar[0], /حمام/); assert.match(g.reasons_ar[0], new RegExp(UNVERIFIED_AR));
  assert.equal(g.verified, false); assert.equal(g.label, UNVERIFIED_AR);
  for (const v of Object.values(MIN_CLEAR_WIDTH)) { assert.equal(v.verified, false); assert.ok(v.source.length > 10); }
});

test('HALL_ASPECT: صالة 14×4 (3.5:1) ترسب، و9×4 (2.25:1) تنجح', () => {
  const g = gate(house({ longHall: true }), 'HALL_ASPECT');
  assert.equal(g.ok, false); assert.ok(g.value.worst > 3.4 && g.value.worst < 3.6, String(g.value.worst));
  assert.equal(gate(house(), 'HALL_ASPECT').ok, true);
});

test('WET_DOOR: حمام يفتح على غرفة الطعام يرسب', () => {
  const g = gate(house({ diningBack: true }), 'WET_DOOR');
  assert.equal(g.ok, false); assert.match(g.reasons_ar[0], /غرفة الطعام/);
});

test('GUEST_ROUTE: مجلس لا يُدخل إليه إلا من الصالة يرسب ويسمّي ما يعبره الضيف', () => {
  const g = gate(house({ noGuestDoor: true, majlisFromHall: true }), 'GUEST_ROUTE');
  assert.equal(g.ok, false); assert.match(g.reasons_ar[0], /الصالة/);
  assert.equal(g.value.routes[0].clean, false);
  const ok = gate(house(), 'GUEST_ROUTE');
  assert.equal(ok.ok, true); assert.equal(ok.value.routes[0].doors, 0, 'المجلس نفسه بمدخل مستقل');
});

test('BED_MAJLIS: غرفة نوم تفتح على المجلس مباشرة ترسب', () => {
  const g = gate(house({ bedroomByMajlis: true }), 'BED_MAJLIS');
  assert.equal(g.ok, false); assert.match(g.reasons_ar[0], /غرفة نوم 3/);
});

test('STAIRS: دوران بلا سلم يرسب، وسلم في الصالة يُوصل إليه ينجح، وسلم في مخزن معزول يرسب', () => {
  assert.equal(gate(house({ upper: true }), 'STAIRS').ok, false);
  const good = gate(house({ upper: true, stair: { x: 6, y: 11 } }), 'STAIRS');
  assert.equal(good.ok, true, good.reasons_ar.join(' | ')); assert.equal(good.value.room, 'r4');
  // نفصل المخزن: بلا الباب من غرفة النوم 1 (longHall يحذف الغرفة وبابها؛ نستعمل مستندًا يدويًا)
  const d = house({ upper: true, stair: { x: 14.5, y: 14.5 } });
  const iso = { ...d, openings: d.openings.filter(o => !(o.level === 'L1' && d.walls.find(w => w.id === o.wall && w.a.y === 13 && w.b.y === 13 && o.at > 11))) };
  const bad = gate(iso, 'STAIRS');
  assert.equal(bad.ok, false, 'السلم في فراغ لا يصل إليه المدخل'); assert.match(bad.reasons_ar.join(' '), /لا يصل إليه مسار/);
  assert.equal(gate(house(), 'STAIRS').applicable, false, 'دور واحد: لا ينطبق');
});

test('PLOT: ارتداد أمامي 4.5 م يجعل الواجهة داخل الارتداد فترسب', () => {
  const g = gate(house({ frontSetback: 4.5 }), 'PLOT');
  assert.equal(g.ok, false); assert.ok(g.value.maxOverrun >= 0.5, String(g.value.maxOverrun));
  assert.equal(gate(house(), 'PLOT').ok, true);
});

test('PROGRAM: ثلاث غرف نوم مطلوبة واثنتان مرسومتان ترسب', () => {
  const g = gate(house(), 'PROGRAM', { counts: { bedrooms: 3 } });
  assert.equal(g.ok, false); assert.match(g.reasons_ar[0], /المطلوب 3 والمرسوم 2/);
});

test('reviewDesigns يقدّم الناجح ثم الأعلى درجة، ورejectionTable يحمل عمودًا لكل بوابة وأسبابًا عربية', () => {
  const docs = [house({ windowlessHall: true }), house(), house({ longHall: true, windowlessHall: true })];
  const out = reviewDesigns(docs, {}, { external: false });
  assert.deepEqual(out.map(r => r.index), [1, 0, 2]);
  assert.equal(out[0].passed, true); assert.equal(out[1].passed, false);
  const t = rejectionTable(out);
  assert.equal(t.columns.length, GATES.length + 3);
  assert.equal(t.rows[2].cells.HALL_ASPECT.ok, false);
  assert.match(t.rows[1].verdict, /مرفوض/); assert.ok(t.rows[1].reasons_ar[0].includes('نافذة'));
});

test('AZIZ وMizan Score يُحسبان على المستند نفسه ويدخلان بوزن منخفض', () => {
  const r = reviewDesign(house(), { text: 'مجلس وغرفتان', counts: { bedrooms: 2, majlis: 1 }, land: { width: 20, length: 24, streets: ['s'], entries: ['s'] } });
  const mz = r.breakdown.find(b => b.id === 'mizan'), az = r.breakdown.find(b => b.id === 'aziz');
  assert.ok(mz.value > 0 && mz.value <= 100, JSON.stringify(r.external));
  assert.ok(az.value > 0 && az.value <= 100, JSON.stringify(r.external));
  assert.ok(mz.effectiveWeight < 5 && az.effectiveWeight < 5);
});

test('الإحصاء: بيرسون وسبيرمان', () => {
  assert.equal(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1);
  assert.equal(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  assert.equal(spearman([1, 2, 3, 4], [1, 4, 9, 16]), 1);
  assert.equal(pearson([1, 2], [1, 2]), null);
});
