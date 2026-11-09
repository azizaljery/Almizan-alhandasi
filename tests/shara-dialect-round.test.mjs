import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief } from '../dist/shara/brief-engine.mjs';

const rowIds = b => b.program.map(r => r.id);

test('«ما ابي حمامات مشتركة» = حمام لكل غرفة لا العكس', () => {
  const b = buildBrief('ما ابي حمامات مشتركة وابي مدخل للنساء من الجنب');
  assert.equal(b.requirements.prefs.sharedBaths, undefined);
  assert.equal(b.requirements.prefs.allEnsuite, true);
  assert.ok(b.understood.some(u => /رفضتَ الحمامات المشتركة/.test(u)));
  assert.equal(buildBrief('ابي حمامات مشتركة بين الغرف').requirements.prefs.sharedBaths, true, 'الإثبات ما زال يعمل');
});

test('«ودورين» بواو العطف تُفهم دورين، و«ما ابي درج» مع دورين تُوضَّح لا تُهمل', () => {
  const b = buildBrief('عندنا امي معنا، ما ابي درج، ودورين');
  assert.equal(b.requirements.prefs.floors, 2);
  assert.ok(!(b.requirements.unclear || []).some(c => /درج|دورين/.test(c)), 'لا تُعدّ غير مفهومة');
  assert.ok(b.notes.some(n => /بلا درج وبدورين معًا/.test(n)), 'تعارض معلن');
});

test('«ما ابي درج» مع دور واحد يُصمَّم دورًا واحدًا', () => {
  const b = buildBrief('ما ابي درج ولا دورين');
  assert.equal(b.floors, 1);
});

test('«بس/فقط» بعد قائمة صريحة: لا مجلس ولا مقلط افتراضيين', () => {
  const b = buildBrief('بيت صغير 3 غرف وصالة ومطبخ بس');
  assert.ok(!rowIds(b).includes('majlis_men') && !rowIds(b).includes('dining'));
  assert.ok(b.notes.some(n => /لم أفترض مجلسًا ولا مقلطًا/.test(n)));
  // لو ذُكر المجلس صراحة يبقى
  assert.ok(rowIds(buildBrief('ابي مجلس وصالة ومطبخ بس')).includes('majlis_men'));
  // بلا «بس» يبقى العرف
  assert.ok(rowIds(buildBrief('بيت 3 غرف وصالة ومطبخ')).includes('majlis_men'));
});

test('جلسة خارجية وبرجولة وشواية تُقال بصدق ولا تُهمل', () => {
  const b = buildBrief('ابي مسبح وجلسة خارجية وبرجولة وكوفي شوب');
  assert.ok(b.unsupported.some(u => /الجلسات الخارجية والبرجولة/.test(u)));
  assert.equal(b.requirements.prefs.outdoor.pool, true);
});
