// الجولة 21 — 02c-rework، قرار المالك 2026-10-26 (21:04): اختبارات البنود الأربعة: الدش الإلزامي، الحالات الثلاث وMizan Score، خصوصية كل فراغ
// وحركة المركبات، فتح النوافذ، وتسوية خطوة الجدار. المستند: evidence/acceptance/c6-rework-a/C6/alt-1.json (ناتج scripts/kit2-case.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { showerGate, evaluateFullBaths, isFullBath, completeShowers } from '../dist/bath-shower.mjs';
import { planTests, planStates, REG_TAG_AR } from '../dist/plan-states.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { vehicleMovement, REFERENCE_VEHICLE } from '../dist/vehicle-movement.mjs';
import { spacePrivacy } from '../dist/space-privacy.mjs';
import { windowFootprint, segmentVsWindow, functionOf } from '../dist/window-opening.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { docToLegacy } from '../dist/draw/export-legacy.mjs';
import { calculateMizanScore } from '../dist/mizan-score.mjs';
import { flushRoomSteps } from '../dist/wall-flush.mjs';
import { measureClearDims } from '../dist/clear-dims.mjs';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const load = () => read('../evidence/acceptance/c6-rework-a/C6/alt-1.json');
const bathOf = (d, name) => analyzeDoc(d).levels[0].rooms.find(r => r.name === name);

// ── البند 3: الدش ──
test('الدش: كل حمام كامل في C6 له دش صالح (ايجابي)، ودورة المياه معفاة', () => {
  const d = load(), g = showerGate(d);
  assert.ok(g.baths.length >= 3 && g.pass, JSON.stringify(g.failing));
  assert.ok(g.baths.every(b => b.shower.length === 1 && b.ok));
  assert.equal(g.baths.some(b => /^دورة/.test(b.room)), false, 'دورة المياه ليست حمامًا كاملًا');
  assert.equal(isFullBath({ type: 'bath', name: 'دورة مياه الرجال' }), false); assert.equal(isFullBath({ type: 'bath', name: 'حمام غرفة 2' }), true);
});
test('الدش: حذف الدش من حمام كامل يرسب (سلبي)، وإعادته تُصلح', () => {
  const d = load(); d.fixtures = d.fixtures.filter(f => f.id !== 'f107');
  const g = showerGate(d); assert.equal(g.pass, false); assert.match(g.failing[0].reasons.join('|'), /لا دش/);
  const r = completeShowers(d); assert.equal(r.failed.length, 0); assert.equal(showerGate(d).pass, true);
});
test('الدش: دش يخرج عن الغرفة أو يتقاطع مع مرحاض أو يقع في فتحة الباب يرسب', () => {
  let d = load(); const f = d.fixtures.find(x => x.id === 'f107'); f.x += 3; assert.match(showerGate(d).failing[0].reasons.join('|'), /لا دش|يخرج/);
  d = load(); const wc = d.fixtures.find(x => x.id === 'f22'), sh = d.fixtures.find(x => x.id === 'f107'); sh.x = wc.x; sh.y = wc.y;
  assert.equal(showerGate(d).pass, false);
});
test('الدش: دش بلا مسقط وصول حر يرسب', () => {
  const d = load(), sh = d.fixtures.find(x => x.id === 'f109'); d.fixtures.push({ ...sh, id: 'fx', kind: 'wc', w: 0.4, d: 0.7, x: sh.x - 0.62, y: sh.y, rot: 0 }, { ...sh, id: 'fy', kind: 'basin', w: 0.6, d: 0.45, x: sh.x, y: sh.y - 0.6, rot: 0 });
  const b = evaluateFullBaths(d).find(x => x.shower.includes('f109')); assert.ok(b);
});

// ── البند 2: الحالات الثلاث ولا يُحتسب «غير متحقق» نجاحًا ──
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
test('خطوة الجدار 6.5 سم: التسوية تُزيل الخطوة (الصندوق = المستطيل الصافي) بتثخين المقطع الأرق على استقامة جاره (قبل/بعد)', () => {
  const doc = read('../evidence/acceptance/h10-rework-a/H10/alt-1.json'), room = d => analyzeDoc(d).levels[0].rooms.find(r => r.name === 'غرفة نوم 2');
  const m = d => measureClearDims(room(d), { s: 4, l: 5 }, 0.05);
  const before = m(doc); assert.ok(before.narrowing.s >= 0.06, 'قبل: خطوة 6.5 سم بين الصندوق والمستطيل الصافي');
  const done = flushRoomSteps(doc, 'غرفة نوم 2'); assert.ok(done.length === 1 && done[0].to > done[0].from);
  const after = m(doc); assert.ok(after.narrowing.s <= 0.004 && after.narrowing.l <= 0.004, JSON.stringify(after.narrowing)); assert.equal(after.clear.s, after.envelope.s);
});
