// الحزمة المنفصلة (قرار المالك 2026-10-27) — الرقعة A: بوابة الدش وإعادة تخطيط الحمام (المفتاح r21shower).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const load = () => read('./fixtures-r21-sep/c6-final-alt-1.json');
import { showerGate, evaluateFullBaths, isFullBath, completeShowers } from '../dist/bath-shower.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';

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
test('الدش: حمام 1.98×2.18 م بمرحاض ومغسلة على جدار واحد: إعادة التوزيع تُدخل دشًا صالحًا (قبل: بلا دش، بعد: بوابة ناجحة)', () => {
  const d = read('./fixtures-r21-sep/r20-r31dfci.json');
  const n0 = d.fixtures.filter(f => f.kind === 'shower').length, before = showerGate(d), r = completeShowers(d), after = showerGate(d);
  assert.equal(before.pass, false); assert.ok(r.failed.length === 0, JSON.stringify(r.failed)); assert.equal(after.pass, true);
  assert.equal(d.fixtures.filter(f => f.kind === 'shower').length, n0 + 1); assert.ok(r.notes.some(n => /توزيع تجهيزات/.test(n)));
});
