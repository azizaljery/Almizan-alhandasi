// اختبار الحياة اليومية: مستندات مبنية يدويًا بعيوب مقصودة (مسار ضيف عبر غرفة نوم، حمام لا يُوصل إليه، انكشاف، أثاث يسد ممرًا…)
// وسلامة التكامل مع reviewDesign (تحذير/معلومة فقط، مواقع بمسارات، قراءة فقط).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDoc } from '../dist/draw/doc.mjs';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { analyzeDailyLife, DAILY_LIMITS, DAILY_ASSUMPTIONS } from '../dist/daily-life.mjs';
import { reviewDesign, SEVERITY } from '../dist/design-review.mjs';
import { run, rect, wall, label, fixture, open } from './fixtures/draw-cases.mjs';

const doorAt = (d, x, y, kind = 'door', extra = {}) => open(d, x, y, kind, extra);
/** بيت صغير سليم: مدخل | مجلس | دورة ضيوف / صالة | مطبخ / نوم | حمام النوم. */
function goodHouse({ majlisDoor = true, bedBathDoor = true, hallDoor = 'door', bedDoorX = 2, sepMajlisEntry = false } = {}) {
  let d = rect(createDoc({ title: 'اختبار حياة يومية' }), 0, 0, 10, 12);
  for (const [a, b, c, e] of [[3, 0, 3, 4], [8, 0, 8, 4], [0, 4, 10, 4], [5, 4, 5, 8], [0, 8, 10, 8], [6, 8, 6, 12]]) d = wall(d, a, b, c, e);
  d = label(d, 1.5, 2, 'مدخل العائلة', 'entrance'); d = label(d, 5.5, 2, 'المجلس', 'majlis'); d = label(d, 9, 2, 'دورة مياه الضيوف', 'bath');
  d = label(d, 2.5, 6, 'الصالة', 'living'); d = label(d, 7.5, 6, 'المطبخ', 'kitchen'); d = label(d, 3, 10, 'غرفة نوم 1', 'bedroom'); d = label(d, 8, 10, 'حمام غرفة 1', 'bath');
  d = doorAt(d, 1.5, 0, 'door', { entry: true });
  if (majlisDoor) d = doorAt(d, 3, 2);
  if (sepMajlisEntry) d = doorAt(d, 5.5, 0, 'door', { entry: true });
  d = doorAt(d, 8, 2);
  d = doorAt(d, 1.5, 4, hallDoor); d = doorAt(d, 5, 6); d = doorAt(d, bedDoorX, 8, 'door');
  if (bedBathDoor) d = doorAt(d, 6, 10);
  return d;
}
const item = (r, code) => r.items.find(i => i.code === code || i.code.startsWith(code + ':'));
const items = (r, code) => r.items.filter(i => i.code === code || i.code.startsWith(code + ':'));

test('بيت سليم: مسار الضيف والأسرة والطعام والحمام متحققة، بحدود معلنة وبلا مخالفة', () => {
  const r = analyzeDailyLife(goodHouse());
  for (const code of ['guest-majlis', 'guest-bath', 'family-living', 'family-kitchen', 'family-bedrooms', 'baths']) assert.equal(item(r, code).state, 'verified', code + ': ' + item(r, code).reason);
  for (const f of items(r, 'food')) assert.equal(f.state, 'verified', f.reason);
  const g = item(r, 'guest-majlis'); assert.ok(g.evidence.paths[0].lengthM > 0 && g.evidence.paths[0].lengthM < DAILY_LIMITS.guestPathMax);
  assert.ok(g.evidence.paths[0].points.length >= 3, 'نقاط المسار للعرض على الرسم');
  assert.equal(g.evidence.assumptions, DAILY_ASSUMPTIONS); assert.equal(g.evidence.limits.guestPathMax, 20);
  assert.equal(item(r, 'exposure-entry').state, 'verified');
});

test('عيب مقصود: مسار الضيف إلى المجلس يمر بغرفة نوم', () => {
  // المجلس خلف غرفة النوم: لا باب بين المدخل والمجلس، وباب بين النوم والمجلس عبر الجدار x=6 في صف النوم
  let d = rect(createDoc({ title: 'ضيف عبر نوم' }), 0, 0, 12, 4);
  d = wall(d, 3, 0, 3, 4); d = wall(d, 7, 0, 7, 4);
  d = label(d, 1.5, 2, 'المدخل', 'entrance'); d = label(d, 5, 2, 'غرفة نوم', 'bedroom'); d = label(d, 9.5, 2, 'المجلس', 'majlis');
  d = doorAt(d, 1.5, 0, 'door', { entry: true }); d = doorAt(d, 3, 2); d = doorAt(d, 7, 2);
  const r = analyzeDailyLife(d), g = item(r, 'guest-majlis');
  assert.equal(g.state, 'violated'); assert.ok(g.evidence.crossed.includes('غرفة نوم'), g.reason); assert.match(g.reason, /مناطق الأسرة/);
});

test('عيب مقصود: حمام النوم لا يُوصل إليه (لا باب)', () => {
  const r = analyzeDailyLife(goodHouse({ bedBathDoor: false })), b = item(r, 'baths');
  assert.equal(b.state, 'violated'); assert.ok(b.evidence.unreachable.includes('غرفة نوم 1'), b.reason);
});

test('عيب مقصود: انكشاف غرفة النوم من المدخل عبر قوس محاذٍ لبابها', () => {
  const r = analyzeDailyLife(goodHouse({ hallDoor: 'arch', bedDoorX: 1.5 })), e = item(r, 'exposure-entry');
  assert.equal(e.state, 'violated'); assert.ok(e.evidence.seen.some(s => s.room === 'غرفة نوم 1'), JSON.stringify(e.evidence.seen));
  assert.ok(e.loc.segments.length >= 1 && e.loc.points.length >= 1);
});

test('عيب مقصود: المجلس بمدخل منفصل بلا باب داخلي → لا مسار طعام داخلي', () => {
  const r = analyzeDailyLife(goodHouse({ majlisDoor: false, sepMajlisEntry: true })), f = items(r, 'food').find(x => /المجلس/.test(x.title));
  assert.equal(f.state, 'violated'); assert.match(f.reason, /لا مسار أبواب داخلي/);
  assert.equal(item(r, 'guest-majlis').state, 'verified', 'الضيف يدخل من بابه مباشرة');
});

test('الأثاث: بلا أثاث مرسوم = غير متحقق (لا نجاح مفترض)', () => {
  const r = analyzeDailyLife(goodHouse());
  for (const c of ['furniture-clearance', 'furniture-doorzone', 'furniture-chairs', 'furniture-move']) assert.equal(item(r, c).state, 'unverified', c);
});
function furnRoom(fixtures) {
  let d = rect(createDoc({ title: 'أثاث' }), 0, 0, 4, 3);
  d = label(d, 2, 1.5, 'الصالة', 'living'); d = doorAt(d, 0, 1.5, 'door', { entry: true }); d = doorAt(d, 4, 1.5, 'door');
  return fixtures.reduce((x, f) => fixture(x, f.kind, f.x, f.y, f.rot || 0), d);
}
test('الأثاث: دولاب يسد الممر بين البابين → الممر الصافي أضيق من 0.9 م؛ وغرفة فارغة سليمة', () => {
  const blocked = item(analyzeDailyLife(furnRoom([{ kind: 'wardrobe', x: 2, y: 1.5, rot: Math.PI / 2 }])), 'furniture-clearance');
  assert.equal(blocked.state, 'violated', blocked.reason); assert.ok(blocked.evidence.rooms[0].clearM < DAILY_LIMITS.clearPassMin);
  const free = item(analyzeDailyLife(furnRoom([{ kind: 'sofa-2', x: 2, y: 0.5, rot: 0 }])), 'furniture-clearance');
  assert.equal(free.state, 'verified', free.reason);
});
test('الأثاث: قطعة أمام الباب تدخل منطقة الحركة 0.9 م', () => {
  const r = analyzeDailyLife(furnRoom([{ kind: 'sofa-2', x: 0.7, y: 1.5, rot: Math.PI / 2 }])), z = item(r, 'furniture-doorzone');
  assert.equal(z.state, 'violated', z.reason); assert.ok(z.evidence.hits.length >= 1);
});
test('الأثاث: طاولة طعام ملاصقة للجدار لا يتسع سحب الكراسي على ضلعها الطويل', () => {
  let d = rect(createDoc({ title: 'طعام' }), 0, 0, 4, 3);
  d = label(d, 2, 1.5, 'غرفة الطعام', 'dining'); d = doorAt(d, 0, 1.5, 'door', { entry: true });
  d = fixture(d, 'dining-table', 2, 0.55, 0);
  const c = item(analyzeDailyLife(d), 'furniture-chairs'); assert.equal(c.state, 'violated', c.reason);
});

test('بلا إلزام: كل بنود الحياة اليومية تحذير أو معلومة، وتظهر في reviewDesign بموقع ومسار وبلا تعديل للمستند', () => {
  const doc = goodHouse({ bedBathDoor: false }), before = serialize(doc);
  const rep = reviewDesign(doc, {}), daily = rep.findings.filter(f => f.source === 'daily');
  assert.ok(daily.length >= 10); assert.equal(serialize(doc), before);
  for (const f of daily) { assert.notEqual(f.severity, SEVERITY.MANDATORY, f.id); assert.ok(f.location && f.title && f.reason && f.evidence, f.id); assert.equal(f.sourceLabel, 'الحياة اليومية'); }
  const baths = daily.find(f => f.id === 'daily:baths'); assert.equal(baths.state, 'violated');
  const guest = daily.find(f => f.id.startsWith('daily:guest-majlis')); assert.ok(guest.location.shapes.some(s => s.type === 'segment'), 'مسار الضيف مرسوم كقطع'); assert.ok(guest.evidence.paths[0].rooms.length >= 2);
  assert.equal(rep.findings.filter(f => f.source === 'daily' && f.severity === SEVERITY.MANDATORY).length, 0, 'لا إلزام جديد');
});

test('مستند حقيقي من المحرك: تعمل الطبقة بلا أخطاء قياس ولا إلزام', () => {
  const doc = parseDoc(readFileSync(new URL('./fixtures/mobile-villa-b1.json', import.meta.url), 'utf8'));
  const r = analyzeDailyLife(doc); assert.ok(r.items.length >= 12);
  assert.ok(!r.items.some(i => /^error-/.test(i.code)), JSON.stringify(r.items.filter(i => /^error-/.test(i.code)).map(i => i.reason)));
  for (const i of r.items) assert.ok(['warning', 'info'].includes(i.severity));
});
test('مستند غير صالح يُرفض بوضوح', () => { assert.throws(() => analyzeDailyLife({}), /DAILY_BAD_DOC/); });
