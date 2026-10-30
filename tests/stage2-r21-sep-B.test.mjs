// الحزمة المنفصلة (قرار المالك 2026-10-27) — الرقعة B: هندسة فتح النوافذ، الحالات الثلاث والوسم النظامي، الخصوصية لكل فراغ، حركة المركبات (المفتاح r21tests).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const load = () => read('./fixtures-r21-sep/c6-final-alt-1.json');
import { planTests, planStates, REG_TAG_AR } from '../dist/plan-states.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { vehicleMovement, REFERENCE_VEHICLE } from '../dist/vehicle-movement.mjs';
import { spacePrivacy } from '../dist/space-privacy.mjs';
import { windowFootprint, segmentVsWindow, functionOf } from '../dist/window-opening.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { docToLegacy } from '../dist/draw/export-legacy.mjs';
import { calculateMizanScore } from '../dist/mizan-score.mjs';

test('ثلاث حالات منفصلة: معماري، اختبارات، نظامي — والنظامي «غير متحقق» ولا يتحول نجاحًا', () => {
  const d = load(), p = presentationStatus({ doc: d, ledger: [] }, {}), t = planTests(d);
  assert.equal(t.passed, true); assert.equal(p.states.regulatory.status, 'unverified'); assert.notEqual(p.states.regulatory.status, 'pass');
  assert.equal(p.regulatoryTag_ar, REG_TAG_AR); assert.equal(REG_TAG_AR, 'تصميم مبدئي — المطابقة النظامية لستارة الخصوصية لم تُتحقق بعد');
  const s = planStates('ready', { ready: 'جاهز' }, t); assert.ok(s.architectural && s.tests && s.regulatory);
});
test('Mizan Score: محور المطابقة غير متاح ولا يُحتسب «غير متحقق» نجاحًا، والدرجة لا تتغير بإضافة الساتر', () => {
  const withFence = load(), without = load(); without.walls = without.walls.filter(w => w.kind !== 'fence');
  const m1 = calculateMizanScore(docToLegacy(withFence, { level: 'L1' }).model), m0 = calculateMizanScore(docToLegacy(without, { level: 'L1' }).model);
  const comp = m1.axes.find(a => a.key === 'compliance');
  assert.equal(comp.score, null, 'المطابقة النظامية لا تحمل درجة'); assert.equal(comp.status, 'NOT_EVALUATED');
  assert.equal(m1.axes.find(a => a.key === 'compliance').score ?? null, m0.axes.find(a => a.key === 'compliance').score ?? null);
  assert.equal(m1.score === null || Number.isFinite(m1.score), true);
});

// ── البند 2: خصوصية كل فراغ ──
test('خصوصية كل فراغ بدرجته المطلوبة: الصالة (عالية) تنجح بلا خط مكشوف، المدخل والممر (منخفضة) مذكوران لا يرسّبان', () => {
  const r = spacePrivacy(load()), by = n => r.spaces.find(s => s.space === n);
  assert.equal(by('الصالة').degree, 'A'); assert.equal(by('الصالة').verdict, 'pass'); assert.equal(by('الصالة').exposedLines, 0);
  assert.equal(by('مدخل العائلة').degree, 'C'); assert.equal(by('ممر الغرف').degree, 'C');
  assert.ok(['noted', 'pass'].includes(by('ممر الغرف').verdict));
  const bed = r.spaces.find(s => s.type === 'bedroom'); if (bed) assert.equal(bed.degree, 'A');
});
test('خصوصية: إزالة الساتر تكشف الصالة (الفحص يفرّق، لا يمرّر دائمًا)', () => {
  const d = load(); d.walls = d.walls.filter(w => w.kind !== 'fence');
  const r = spacePrivacy(d), hall = r.spaces.find(s => s.space === 'الصالة'); assert.ok(hall.exposedLines > 0); assert.equal(hall.verdict === 'pass', false);
});

// ── البند 2: حركة المركبات والركاب ──
test('حركة المركبات: بابا المركبة المرجعية يُفتحان بإسقاط ≥ 0.8 م، والمرجعية «غير متحققة المصدر»', () => {
  const m = vehicleMovement(load()); assert.equal(m.passed, true); assert.match(REFERENCE_VEHICLE.source, /غير متحقق/);
  assert.ok(m.doors.length >= 4 && m.doors.every(x => x.pass && x.projection >= x.required));
});
test('حركة المركبات: ساتر يلاصق باب السيارة يرسب بقياس الفتح لا بالمسافة 0.745 م وحدها', () => {
  const d = load(), f = d.walls.find(w => w.kind === 'fence'), z = d.zones.find(q => q.id === 'z2'); const xs = z.polygon.map(p => p.x), cx = Math.min(...xs) + 0.45;
  f.a = { x: cx, y: 0.5 }; f.b = { x: cx, y: 5 };
  const m = vehicleMovement(d); assert.equal(m.passed, false); assert.ok(m.failing.length > 0);
});

// ── البند 1: هندسة فتح النوافذ ──
test('فتح النوافذ: غلاف الضلفة يُحسب لكل نافذة ويُكشف التصادم مع الساتر ولا إعفاء (exemptFromClearance=false دائمًا)', () => {
  const d = load(), lv = analyzeDoc(d).levels[0];
  for (const op of lv.openings.filter(o => o.window)) for (const s of op.sides.filter(x => x.other === 'outside')) {
    const fn = functionOf(op, s, lv); assert.equal(fn.exemptFromClearance, false); assert.equal(fn.safety, 'unverified');
    const fp = windowFootprint(op, s); assert.ok(fp && fp.leaves >= 1 && fp.leafWidth > 0 && fp.operation === 'unspecified');
  }
  const op = lv.openings.find(o => o.id === 'o23'), s = op.sides.find(x => x.other === 'outside'), fp = windowFootprint(op, s);
  const hit = segmentVsWindow(fp, { x: op.p.x - 0.3, y: op.p.y - 0.4 }, { x: op.p.x - 0.3, y: op.p.y + 0.4 });
  assert.ok(hit && 'swingConflict' in hit && 'clearance' in hit);
});

// ── البند 4: خطوة الجدار ──
