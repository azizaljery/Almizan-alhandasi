import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBriefText, extractExplicitProgramRequirements, verifyProposedProgram } from '../dist/brief-contract.mjs';

const rooms = [
  { name: 'مجلس الرجال', type: 'majlis', area: 63 },
  { name: 'مجلس النساء', type: 'majlis', area: 48 },
  { name: 'المطبخ', type: 'kitchen', area: 48 },
  { name: 'مستودع', type: 'storage', area: 20 },
  { name: 'غرفة نوم 1', type: 'bedroom', area: 25 },
  { name: 'غرفة نوم 2', type: 'bedroom', area: 25 },
  { name: 'جناح الوالدة', type: 'bedroom', area: 40 },
];
const request = 'أريد ثلاث غرف نوم ومجلس رجال 9×7 ومجلس نساء 8×6 والمطبخ 8×6 ومستودع 5×4';

test('explicit Arabic bedroom count and dimension requirements are extracted', () => {
  const found = extractExplicitProgramRequirements(request);
  assert.ok(found.some(x => x.id === 'bedrooms' && x.expected === 3));
  assert.ok(found.some(x => x.id === 'area:majlis:men' && x.expected === 63));
  assert.ok(found.some(x => x.id === 'area:majlis:women' && x.expected === 48));
  assert.ok(found.some(x => x.id === 'area:kitchen' && x.expected === 48));
  assert.ok(found.some(x => x.id === 'area:storage' && x.expected === 20));
});

test('valid explicit villa requirements pass without inventing additional rooms', () => {
  const result = verifyProposedProgram(request, rooms);
  assert.equal(result.pass, true);
  assert.equal(result.violations.length, 0);
});

test('AI dropping a bedroom or changing kitchen dimensions is blocked', () => {
  const fewer = verifyProposedProgram(request, rooms.filter(x => x.name !== 'غرفة نوم 2'));
  assert.equal(fewer.pass, false);
  assert.match(fewer.violations.join(' '), /غرف نوم/);
  const wrong = structuredClone(rooms);
  wrong[2].area = 35;
  const check = verifyProposedProgram(request, wrong);
  assert.equal(check.pass, false);
  assert.match(check.violations.join(' '), /المطبخ/);
});

test('AI merging women and men majlis into one generic room is blocked', () => {
  const merged = rooms.filter(x => x.name !== 'مجلس النساء');
  const result = verifyProposedProgram(request, merged);
  assert.equal(result.pass, false);
  assert.match(result.violations.join(' '), /النساء/);
});

test('Arabic numerals and English bedroom count are recognized', () => {
  assert.equal(normalizeBriefText('٣ غرف نوم'), '3 غرف نوم');
  assert.equal(normalizeBriefText('۳ غرف نوم'), '3 غرف نوم');
  assert.equal(verifyProposedProgram('3 bedrooms', rooms).pass, true);
  assert.equal(verifyProposedProgram('4 bedrooms', rooms).pass, false);
});

test('latest room dimension revision overrides the original dimension', () => {
  const prompt = 'المتطلبات الأصلية المعتمدة:\nالمطبخ 8×6\n\nالتعديل المطلوب الآن:\nكبر المطبخ الى 9×6';
  const updated = structuredClone(rooms);
  updated[2].area = 54;
  assert.equal(verifyProposedProgram(prompt, updated).pass, true);
  assert.equal(verifyProposedProgram(prompt, rooms).pass, false);
});
