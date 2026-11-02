// (طلب المالك 2026-11-02) تطابق المسقط والبروزات والتنوع الشكلي لعينة الواجهات الواقعية (إضافة مستقلة؛ لا تغيّر tests/facade-realism.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import * as R from '../dist/facade-realism/index.mjs';

const C1 = parseDoc(readFileSync(new URL('./fixtures/facade/C1.json', import.meta.url), 'utf8'));
const ALL = R.buildAll(C1);
const EXPECTED_OPENINGS = { s: 8, n: 9, e: 5, w: 6 }; // الفتحات الخارجية في المسقط لكل جهة (من facadeGeometry)

test('(F-أ) كل فتحة خارجية في كل جهة بمقاسها ومكانها من المسقط، في البدائل الثلاثة', () => {
  for (const id of ['A', 'B', 'C']) for (const s of ['s', 'n', 'e', 'w']) {
    const x = ALL[id][s];
    assert.equal(x.checks.openingsInPlan, EXPECTED_OPENINGS[s], `${id}/${s}: عدد الفتحات`);
    assert.deepEqual(x.checks.sizeErrors, [], `${id}/${s}: مقاسات`);
    assert.equal(x.checks.fakeHoles, 0, `${id}/${s}: ثقوب بلا فتحة`);
    assert.equal(x.checks.frameHoles, 0, `${id}/${s}: إطار لا يطابق فتحة`);
    assert.ok(x.checks.openingsDrawnOnce, `${id}/${s}: فتحة مرسومة أكثر من مرة`);
  }
});

test('(F-تطابق المسقط) كل فتحة تقع على جدارها الفعلي في المسقط، بالتحويل نفسه المستخدم في المشهد', () => {
  for (const id of ['A', 'B', 'C']) for (const s of ['s', 'n', 'e', 'w']) {
    const p = ALL[id][s].plan;
    assert.equal(p.checked, EXPECTED_OPENINGS[s], `${id}/${s}: عدد ما فُحص`);
    assert.deepEqual(p.mismatches, [], `${id}/${s}: فتحات خارج جدارها`);
  }
});

test('(F-ج) كل بروز يبقى ضمن الحدود المستخرجة من الاشتراطات، أو يُعلَّم «غير متحقق» صراحةً', () => {
  for (const id of ['A', 'B', 'C']) for (const s of ['s', 'n', 'e', 'w']) {
    const bad = ALL[id][s].projections.filter(p => p.status === 'violation');
    assert.deepEqual(bad, [], `${id}/${s}: بروزات تدخل حد الارتداد`);
  }
  // الجهة الأمامية: عرض الشارع غير مُدخل، فكل بروز بين 3 و6 م من الحد يجب أن يُعلَّم «غير متحقق»
  for (const id of ['A', 'B', 'C']) for (const p of ALL[id].s.projections) {
    if (p.distFromPlotLine < 6) assert.match(p.status, /^(غير متحقق|ok$)/, `${id}: ${p.id}`);
  }
  // الشمالية والشرقية والغربية: البروز الوحيد المسموح هو الكرنيش حتى 25 سم
  for (const id of ['A', 'B', 'C']) for (const s of ['n', 'e', 'w']) for (const p of ALL[id][s].projections) {
    if (p.distFromPlotLine < p.setback) assert.ok(p.role === 'cornice' && p.protrusion <= .25, `${id}/${s}: ${p.id}`);
  }
});

test('(F-د) التنوع الشكلي: العمق الظاهر يختلف بين البدائل حتى بلون واحد (بعد الشكل، لا الخامة)', () => {
  for (const { pair, shapeDistance } of R.buildSample(C1).shape) {
    assert.ok(shapeDistance >= .2, `${pair}: بعد الشكل ${shapeDistance} أقل من .2`);
  }
});
