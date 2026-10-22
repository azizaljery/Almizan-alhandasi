// (الجولة الثالثة عشرة) الاشتراطات النظامية المربوطة بالكود تطابق ملف البحث data/regulations-sa.json بندًا بندًا (القيمة والمستوى
// والمصدر)، ولا يُربط إلا ما مستواه «أ» كبوابة؛ والزجاج 8% (المستوى ب) ملاحظة محتملة لا بوابة. سريع: لا توليد.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SETBACK_NEIGHBOUR, SETBACK_FRONT, COVERAGE_MAX, GLAZING_MIN, frontSetbackFor, streetWidthQuestion, parseStreetWidthAnswer } from '../dist/regulations-sa.mjs';
import { PARKING_RULE } from '../dist/site-parking.mjs';
import { GATES, GATE_TIER, DESIGN_THRESHOLDS } from '../dist/plan-review.mjs';

const DATA = JSON.parse(readFileSync(new URL('../data/regulations-sa.json', import.meta.url), 'utf8'));
const item = id => DATA.items.find(x => x.item === id);

test('كل بند مربوط موجود في ملف البحث بالقيمة والمستوى نفسيهما، وبوابات الرسوب من المستوى «أ» فقط', () => {
  assert.equal(item('setback.neighbour').value, SETBACK_NEIGHBOUR.value); assert.equal(item('setback.neighbour').level, 'official-confirmed'); assert.equal(SETBACK_NEIGHBOUR.level, 'official-confirmed');
  assert.equal(item('setback.front.street_lt_30m').value, 'max(3, streetWidth/5)'); assert.equal(item('setback.front.street_lt_30m').level, 'official-confirmed');
  assert.equal(item('setback.front.street_ge_30m').value, SETBACK_FRONT.min30); assert.equal(item('setback.front.street_ge_30m').level, 'official-confirmed');
  assert.equal(item('coverage.ground_floor_max').value, COVERAGE_MAX.value); assert.equal(item('coverage.ground_floor_max').level, 'official-confirmed');
  assert.equal(item('parking.spaces_per_villa').level, 'official-confirmed'); assert.equal(PARKING_RULE.level, 'official-confirmed');
  // الزجاج: المستوى ب في الملف وفي الكود — لا بوابة
  assert.equal(item('daylight.glazing_min_ratio').value, GLAZING_MIN.value); assert.equal(item('daylight.glazing_min_ratio').level, 'official-ocr+secondary'); assert.equal(GLAZING_MIN.level, 'official-ocr+secondary');
  assert.notEqual(GLAZING_MIN.tier, 'regulation');
  assert.equal(DESIGN_THRESHOLDS.windowToFloorMin.value, 0.03, 'بوابة الزجاج لم تُبدَّل (قرار المالك)');
  // كل بند له مصدر ورابط يطابقان الملف
  for (const [reg, id] of [[SETBACK_NEIGHBOUR, 'setback.neighbour'], [COVERAGE_MAX, 'coverage.ground_floor_max'], [SETBACK_FRONT, 'setback.front.street_lt_30m']]) { assert.ok(reg.source.length > 30 && reg.url === item(id).url, id); assert.equal(reg.tier, 'regulation'); }
  // البوابتان في المراجع بطبقة «اشتراط نظامي متحقق»
  for (const id of ['SETBACK_REG', 'COVERAGE']) { assert.ok(GATES.some(g => g.id === id), id); assert.equal(GATE_TIER[id], 'regulation'); }
  assert.equal(GATE_TIER.WINDOW_SIZE, 'mizan-default');
});

test('الارتداد الأمامي: خُمس عرض الشارع ولا يقل عن 3 م، و6 م لشوارع ≥ 30 م؛ والمجهول 3 م افتراضًا', () => {
  assert.deepEqual([10, 15, 20, 25, 29.9, 30, 40].map(w => frontSetbackFor(w).value), [3, 3, 4, 5, 5.98, 6, 8]);
  for (const w of [10, 20, 30]) assert.equal(frontSetbackFor(w).tier, 'regulation');
  const u = frontSetbackFor(undefined); assert.equal(u.value, 3); assert.equal(u.tier, 'mizan-default'); assert.equal(u.known, false);
  assert.equal(frontSetbackFor('abc').value, 3); assert.equal(frontSetbackFor(0).known, false);
});

test('سؤال عرض الشارع يُطرح حين يُجهل فقط، وجوابه يُقرأ بصيغ مختلفة', () => {
  assert.equal(streetWidthQuestion({ streets: ['s'], entries: ['s'] })?.type, 'street-width');
  assert.equal(streetWidthQuestion({ streets: ['s'], entries: ['s'], streetWidth: 20 }), null);
  assert.equal(streetWidthQuestion({}), null);
  assert.equal(parseStreetWidthAnswer('عرض الشارع 20 م'), 20); assert.equal(parseStreetWidthAnswer('الشارع ٢٥ متر'), 25); assert.equal(parseStreetWidthAnswer('15'), 15); assert.equal(parseStreetWidthAnswer('الشارع عرضه 32'), 32);
  assert.equal(parseStreetWidthAnswer('المطبخ 4×5'), null); assert.equal(parseStreetWidthAnswer('كبّر المجلس'), null); assert.equal(parseStreetWidthAnswer('2'), null);
});
