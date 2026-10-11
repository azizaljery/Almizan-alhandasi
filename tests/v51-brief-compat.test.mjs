import test from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../dist/brief-contract.mjs';
const bedrooms = n => Array.from({ length: n }, (_, i) => ({ name: `غرفة نوم ${i + 1}`, type: 'bedroom', area: 20 }));
for (const phrase of ['3 غرف نوم على الأقل', 'بحد أدنى 3 غرف نوم', '3 bedrooms minimum', 'على الأقل ثلاث غرف نوم']) {
  test(`minimum scope: ${phrase}`, () => {
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(4)).pass, true);
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(2)).pass, false);
  });
}
for (const phrase of ['Three bedrooms', '٣ غرف نوم', '۳ غرف نوم', 'ثلاث غرف نوم']) {
  test(`exact count: ${phrase}`, () => {
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(3)).pass, true);
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(4)).pass, false);
  });
}
test('unrelated minimum does not relax bedroom count', () => {
  assert.equal(contract.verifyProposedProgram('3 bedrooms and at least 2 kitchens', bedrooms(4)).pass, false);
});
test('explicit large numeric count and zero are not silently dropped', () => {
  assert.equal(contract.verifyProposedProgram('31 bedrooms', bedrooms(3)).pass, false);
  assert.equal(contract.verifyProposedProgram('0 bedrooms', bedrooms(1)).pass, false);
});
const kitchen = { name: 'kitchen', type: 'kitchen', area: 48 };
for (const text of ['kitchen 8x6, no rotation', 'مطبخ 8×6، بدون تدوير']) {
  test(`rotation policy: ${text}`, () => {
    assert.equal(contract.verifyProposedProgram(text, [{ ...kitchen, dimensions: { width: 6, length: 8 } }]).pass, false);
    assert.equal(contract.verifyProposedProgram(text, [{ ...kitchen, dimensions: { width: 8, length: 6 } }]).pass, true);
  });
}
test('binding retains explicit orientation without overwriting conflicts', () => {
  const requested = [{ ...kitchen, dimensions: { width: 8, length: 6, allowRotation: false } }];
  assert.equal(contract.bindRequestedDimensions([kitchen], requested)[0].dimensions.allowRotation, false);
  assert.throws(() => contract.bindRequestedDimensions([{ ...kitchen, dimensions: { width: 6, length: 8 } }], requested), /متعارض/);
});
test('actual geometry cannot inherit truth from requested metadata or equal area', () => {
  const metadata = { ...kitchen, dimensions: { width: 8, length: 6 } };
  assert.equal(contract.verifyProgramGeometry('kitchen 8x6', [{ ...metadata, w: 12, h: 4 }]).pass, false);
  assert.equal(contract.verifyProgramGeometry('kitchen 8x6', [metadata]).pass, false);
  assert.equal(contract.verifyProgramGeometry('kitchen 8x6', [{ ...metadata, w: 6, h: 8 }]).pass, true);
  assert.equal(contract.verifyProgramGeometry('kitchen 8x6, no rotation', [{ ...metadata, w: 6, h: 8 }]).pass, false);
});
test('negative count and dimension clauses retain V51 exclusion semantics', () => {
  const text = '3 bedrooms, not 4 bedrooms; kitchen 8x6, but not kitchen 9x6';
  const rules = contract.extractExplicitProgramRequirements(text);
  assert.deepEqual(rules.map(rule => rule.kind), ['exact-count', 'excluded-count', 'room-dimensions', 'excluded-room-dimensions']);
  assert.equal(contract.verifyProgramGeometry(text, [...bedrooms(3), { ...kitchen, w: 8, h: 6 }]).pass, true);
});
test('actual geometry uses engineering tolerance, not program metadata rounding', () => {
  assert.equal(contract.verifyProgramGeometry('kitchen 8x6', [{ ...kitchen, w: 8.005, h: 6 }]).pass, false);
});
test('binding never drops a stricter orientation in a same-type group', () => {
  const requested = [
    { ...kitchen, name: 'kitchen main', dimensions: { width: 8, length: 6 } },
    { ...kitchen, name: 'kitchen service', dimensions: { width: 8, length: 6, allowRotation: false } },
  ];
  const bound = contract.bindRequestedDimensions(requested.map(({ dimensions, ...room }) => room), requested);
  assert.equal(bound[1].dimensions.allowRotation, false);
});
test('adjacent bathroom count cannot overwrite the bedroom requirement', () => {
  const text = '3 bedrooms 2 bathrooms';
  assert.equal(contract.extractExplicitProgramRequirements(text).find(rule => rule.id === 'bedrooms').expected, 3);
  assert.equal(contract.verifyProposedProgram(text, bedrooms(3)).pass, true);
  assert.equal(contract.verifyProposedProgram(text, bedrooms(2)).pass, false);
});
test('conflicting supplied rectangle is rejected without mutating either program', () => {
  const proposed = [{ ...kitchen, dimensions: { width: 12, length: 4 } }];
  const requested = [{ ...kitchen, dimensions: { width: 8, length: 6 } }];
  const before = structuredClone({ proposed, requested });
  assert.throws(() => contract.bindRequestedDimensions(proposed, requested), /متعارض/);
  assert.deepEqual({ proposed, requested }, before);
});
