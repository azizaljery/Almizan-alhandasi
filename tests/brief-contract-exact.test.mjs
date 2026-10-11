import test from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../dist/brief-contract.mjs';
const bedrooms = n => Array.from({ length: n }, (_, i) => ({ name: `غرفة نوم ${i + 1}`, type: 'bedroom', area: 20 }));
for (const phrase of ['3 bedrooms', '٣ غرف نوم', '۳ غرف نوم', 'ثلاث غرف نوم', 'ثلاثة غرف نوم', 'three bedrooms', 'غرفتين نوم', 'غرفتا نوم', 'غرف نوم عدد 3']) {
  const n = /غرفتين|غرفتا/.test(phrase) ? 2 : 3;
  test(`exact count: ${phrase}`, () => {
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(n)).pass, true);
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(n - 1)).pass, false);
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(n + 1)).pass, false);
  });
}
for (const phrase of ['at least three bedrooms', '٣ غرف نوم على الأقل', 'على الأقل ثلاث غرف نوم']) {
  test(`minimum is explicit: ${phrase}`, () => {
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(4)).pass, true);
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(2)).pass, false);
  });
}
test('minimum qualifier stays scoped to the adjacent count', () => {
  assert.equal(contract.verifyProposedProgram('3 bedrooms and at least 2 kitchens', [...bedrooms(4), ...Array.from({ length: 2 }, () => ({ type: 'kitchen' }))]).pass, false);
  assert.equal(contract.verifyProposedProgram('على الأقل 2 مطبخ، 3 غرف نوم', [...bedrooms(4), { type: 'kitchen' }, { type: 'kitchen' }]).pass, false);
});
test('equal area cannot substitute different explicit dimensions', () => {
  assert.equal(contract.verifyProposedProgram('المطبخ 8×6', [{ type: 'kitchen', name: 'المطبخ', area: 48, w: 12, h: 4 }]).pass, false);
});
test('program constraints attach without mutating old projects or claiming geometry', () => {
  const original = [{ name: 'المطبخ', type: 'kitchen', area: 48 }];
  const saved = structuredClone(original);
  const constrained = contract.attachExplicitProgramConstraints('المطبخ 8×6', original);
  assert.deepEqual(original, saved);
  assert.deepEqual(constrained[0].dimensions, { width: 8, length: 6, allowRotation: true });
  assert.equal(contract.verifyProgramGeometry('المطبخ 8×6', constrained).pass, false);
});
test('actual geometry independently checks sides and permits real rotation', () => {
  const room = { name: 'المطبخ', type: 'kitchen', area: 48 };
  assert.equal(contract.verifyProgramGeometry('المطبخ 8×6', [{ ...room, w: 8, h: 6 }]).pass, true);
  assert.equal(contract.verifyProgramGeometry('المطبخ 8×6', [{ ...room, w: 6, h: 8 }]).pass, true);
  assert.equal(contract.verifyProgramGeometry('المطبخ 8×6', [{ ...room, w: 12, h: 4 }]).pass, false);
  assert.equal(contract.verifyProgramGeometry('المطبخ 8×6', [{ ...room, w: 8, h: 6.1 }]).pass, false);
  assert.equal(contract.verifyProgramGeometry('المطبخ 8×6', [{ ...room, w: NaN, h: 6 }]).pass, false);
  assert.equal(contract.verifyProgramGeometry('المطبخ 8×6', [room]).pass, false);
});
test('explicit rotation prohibition prevents swapped geometry', () => {
  assert.equal(contract.verifyProgramGeometry('المطبخ 8×6 بدون تدوير', [{ type: 'kitchen', name: 'المطبخ', w: 6, h: 8 }]).pass, false);
});
for (const phrase of ['3 غرف نوم على الأقل', 'بحد أدنى 3 غرف نوم', '3 bedrooms minimum']) {
  test(`minimum wording: ${phrase}`, () => {
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(4)).pass, true);
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(2)).pass, false);
  });
}
test('capitalized number words and zero remain exact', () => {
  assert.equal(contract.verifyProposedProgram('Three bedrooms', bedrooms(4)).pass, false);
  assert.equal(contract.verifyProposedProgram('0 bedrooms', bedrooms(1)).pass, false);
});
for (const [phrase, n] of [['إحدى عشرة غرف نوم', 11], ['اثنتا عشرة غرف نوم', 12], ['ثلاث عشرة غرف نوم', 13], ['عشرون غرف نوم', 20]]) {
  test(`compound Arabic number: ${phrase}`, () => {
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(n)).pass, true);
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(n - 1)).pass, false);
  });
}
test('geometry binding cannot accept another same-type room', () => {
  const program = [{ id: 'k1', type: 'kitchen', name: 'مطبخ', dimensions: { width: 8, length: 6 } }];
  assert.equal(contract.verifyAttachedProgramGeometry(program, [{ id: 'k1', w: 12, h: 4 }, { id: 'k2', w: 8, h: 6 }]).pass, false);
});
test('ambiguous dimension target is rejected without mutating the program', () => {
  const rooms = [{ id: 'a', name: 'مطبخ أ', type: 'kitchen', area: 48 }, { id: 'b', name: 'مطبخ ب', type: 'kitchen', area: 48 }];
  const before = structuredClone(rooms);
  assert.throws(() => contract.attachExplicitProgramConstraints('المطبخ 8×6', rooms), /حدد غرفة/);
  assert.deepEqual(rooms, before);
});
test('dimension contracts cover English kitchen and Arabic living room', () => {
  assert.equal(contract.verifyProgramGeometry('kitchen 8×6', [{ type: 'kitchen', name: 'Kitchen', w: 12, h: 4 }]).pass, false);
  assert.equal(contract.verifyProgramGeometry('الصالة 8×6', [{ type: 'living', name: 'الصالة', w: 12, h: 4 }]).pass, false);
});
test('large explicit counts are not silently discarded or partially parsed', () => {
  for (const phrase of ['31 bedrooms', 'twenty-one bedrooms', 'twenty one bedrooms', 'واحد وعشرون غرف نوم']) {
    const rules = contract.extractExplicitProgramRequirements(phrase);
    assert.equal(rules.find(rule => rule.id === 'bedrooms').expected, phrase.startsWith('31') ? 31 : 21);
    assert.equal(contract.verifyProposedProgram(phrase, bedrooms(1)).pass, false);
  }
});
