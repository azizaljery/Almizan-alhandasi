// قيم الكود: غلاف SBC 602 بحسب المنطقة (ما لم يتحقق يبقى افتراضًا معلَّمًا) وفحص الدرج مقابل SBC 201 §1011.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SBC602_ENVELOPE, envelopeFor, DEFAULT_ZONE, SBC602_SOURCE } from '../dist/mep/sbc602-envelope.mjs';
import { ASSUMPTIONS, LEGACY_ENVELOPE } from '../dist/mep/auto-inputs.mjs';
import { SBC201_STAIR, checkStairs, stairCheckLines } from '../dist/draw/stair-check.mjs';
import { createDoc, applyCommand } from '../dist/draw/doc.mjs';
import { sectionSheet } from '../dist/draw/section-sheet.mjs';

test('SBC 602: المنطقة 1 (الرياض) قيم متحققة من مصدرين، وافتراضات الأنظمة تستعملها', () => {
  assert.equal(DEFAULT_ZONE, 1);
  const e = envelopeFor(1);
  assert.deepEqual([e.wallU.value, e.roofU.value, e.glassU.value, e.shgc], [.342, .202, 2.668, .25]);
  assert.ok([e.wallU, e.roofU, e.glassU].every(v => v.status === 'verified' && /SBC 602/.test(v.source)));
  assert.deepEqual([ASSUMPTIONS.wallU, ASSUMPTIONS.roofU, ASSUMPTIONS.glassU], [.342, .202, 2.668]);
  assert.equal(SBC602_SOURCE.refs.length, 2);
});

test('SBC 602: ما اختلف فيه المصدران (جدار المنطقة 2) لا يُخترع — يبقى الافتراض السابق معلَّمًا «غير متحقق»', () => {
  assert.equal(SBC602_ENVELOPE[2].wallU.value, null); assert.equal(SBC602_ENVELOPE[2].wallU.status, 'unverified');
  const e = envelopeFor(2, LEGACY_ENVELOPE);
  assert.equal(e.wallU.value, LEGACY_ENVELOPE.wallU); assert.equal(e.wallU.status, 'unverified'); assert.match(e.wallU.source, /غير متحقق/);
  assert.equal(e.roofU.value, .238);
  assert.deepEqual([envelopeFor(3).wallU.value, envelopeFor(3).roofU.value], [.453, .273]);
  assert.equal(envelopeFor(9).zone, 1, 'منطقة مجهولة → الافتراضية');
});

function stairDoc(rise = 3.2, w = 1.2, run = 4, kind = 'U') {
  let doc = createDoc({ title: 'درج' });
  const run_ = c => { doc = applyCommand(doc, c).doc; };
  run_({ type: 'add-rect', level: 'L1', a: { x: 0, y: 0 }, b: { x: 8, y: 8 }, t: .25 });
  run_({ type: 'add-level', name: 'الدور الأول', height: rise });
  run_({ type: 'add-stair', level: 'L1', kind, x: 3, y: 1, rot: 0, w, run });
  return doc;
}

test('فحص الدرج: المولّد يقسم 3.2 م على 19 قائمة (≈168 مم ≤ 175 مم) فيحقق الحكم العام، والعرض الضيق يُرفض', () => {
  const doc = stairDoc();
  assert.ok(doc.stairs.length === 1 && doc.levels.length === 2, 'مستند بدرجين ودورين');
  const r = checkStairs(doc), s = r.stairs[0], by = Object.fromEntries(s.checks.map(c => [c.id, c]));
  assert.equal(s.N, 19); assert.ok(Math.abs(s.riserM - 3.2 / 19) < 1e-9);
  assert.equal(by['riser-max'].status, 'ok'); assert.equal(by['riser-min'].status, 'ok');
  assert.equal(by.tread.status, 'ok'); assert.equal(by.width.status, 'ok'); assert.equal(by['flight-rise'].status, 'ok');
  assert.equal(by.headroom.status, 'unverified', 'ارتفاع السقف لا يُدّعى');
  assert.equal(r.ok, true, 'كل ما قيس يحقق؛ ارتفاع السقف خارج الحكم'); assert.equal(SBC201_STAIR.riserMaxM.value, .175); assert.equal(SBC201_STAIR.exceptions, 'غير متحقق');
  assert.ok(!stairCheckLines(r).some(l => l.includes('لا يحقق الحكم العام')), 'لا سطر رفض لدرج مطابق');
  const nr = checkStairs(stairDoc(3.2, .9)), narrow = nr.stairs[0].checks.find(c => c.id === 'width'); assert.equal(narrow.status, 'fail'); assert.equal(nr.ok, false);
  assert.ok(stairCheckLines(nr).some(l => l.includes('لا يحقق الحكم العام') && l.includes('1011')));
  const svg = sectionSheet(doc).svg; assert.ok(svg.includes('SBC 201'), 'نتيجة الفحص على لوحة القطاع');
  assert.equal(checkStairs(createDoc()).ok, null, 'بلا درج: لا حكم');
});
