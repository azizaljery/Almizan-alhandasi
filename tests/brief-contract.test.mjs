import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBriefText, extractPlotDimensions, extractExplicitProgramRequirements, bindRequestedDimensions, verifyProposedProgram } from '../dist/brief-contract.mjs';
import { requestLocalBrief } from '../dist/local-nlp.mjs';

const rooms = [
  { name: 'مجلس الرجال', type: 'majlis', area: 63, dimensions: { width: 9, length: 7 } },
  { name: 'مجلس النساء', type: 'majlis', area: 48, dimensions: { width: 8, length: 6 } },
  { name: 'المطبخ', type: 'kitchen', area: 48, dimensions: { width: 8, length: 6 } },
  { name: 'مستودع', type: 'storage', area: 20, dimensions: { width: 5, length: 4 } },
  { name: 'غرفة نوم 1', type: 'bedroom', area: 25 },
  { name: 'غرفة نوم 2', type: 'bedroom', area: 25 },
  { name: 'جناح الوالدة', type: 'bedroom', area: 40 },
];
const request = 'أريد ثلاث غرف نوم ومجلس رجال 9×7 ومجلس نساء 8×6 والمطبخ 8×6 ومستودع 5×4';

test('explicit Arabic bedroom count and exact room dimensions are extracted', () => {
  const found = extractExplicitProgramRequirements(request);
  assert.ok(found.some(x => x.id === 'bedrooms' && x.kind === 'exact-count' && x.expected === 3));
  assert.ok(found.some(x => x.id === 'dimensions:majlis:men' && x.expected === 63));
  assert.ok(found.some(x => x.id === 'dimensions:majlis:women' && x.expected === 48));
  assert.ok(found.some(x => x.id === 'dimensions:kitchen' && x.expected === 48));
  assert.ok(found.some(x => x.id === 'dimensions:storage' && x.expected === 20));
});

test('valid explicit villa requirements pass without inventing additional rooms', () => {
  const result = verifyProposedProgram(request, rooms);
  assert.equal(result.pass, true);
  assert.equal(result.violations.length, 0);
});

test('an explicit bedroom count is exact unless the user says minimum', () => {
  const four = [...structuredClone(rooms), { name: 'غرفة نوم 4', type: 'bedroom', area: 20 }];
  const exact = verifyProposedProgram('3 bedrooms', four);
  assert.equal(exact.pass, false);
  assert.match(exact.violations.join(' '), /بالضبط/);
  assert.equal(verifyProposedProgram('at least 3 bedrooms', four).pass, true);
  assert.equal(verifyProposedProgram('على الأقل 3 غرف نوم', four).pass, true);
});

test('same-area room with different exact dimensions is blocked', () => {
  const wrong = structuredClone(rooms);
  wrong[2].dimensions = { width: 12, length: 4 }; // Still 48 m², but not 8 × 6 m.
  const result = verifyProposedProgram(request, wrong);
  assert.equal(result.pass, false);
  assert.match(result.violations.join(' '), /أبعاد.*بالضبط/);
  assert.match(result.violations.join(' '), /المساحة وحدها لا تثبت/);
});

test('exact dimensions allow a quarter-turn and cannot be replaced by area alone', () => {
  const rotated = structuredClone(rooms);
  rotated[2].dimensions = { width: 6, length: 8 };
  assert.equal(verifyProposedProgram('kitchen 8×6', rotated).pass, true);
  const areaOnly = structuredClone(rooms);
  delete areaOnly[2].dimensions;
  assert.equal(verifyProposedProgram('kitchen 8×6', areaOnly).pass, false);
});

test('connected suggestions regain only user-requested exact dimensions when a whole same-type group agrees', () => {
  const requested = [
    { name: 'غرفة نوم 1', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 } },
    { name: 'غرفة نوم 2', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 } },
  ];
  const unrelated = { name: 'مطبخ', type: 'kitchen', area: 12 };
  const proposed = [{ name: 'نوم أ', type: 'bedroom', area: 16 }, { name: 'نوم ب', type: 'bedroom', area: 16 }, unrelated];
  const bound = bindRequestedDimensions(proposed, requested);
  assert.deepEqual(bound.slice(0, 2).map(room => room.dimensions), [{ width: 4, length: 4 }, { width: 4, length: 4 }]);
  assert.deepEqual(bound[2], unrelated);
  assert.equal(proposed[0].dimensions, undefined, 'binding must not mutate the AI response');
});

test('different same-type dimensions bind only through a unique room identity and matching area', () => {
  const requested = [
    { name: 'المطبخ الرئيسي', type: 'kitchen', area: 48, dimensions: { width: 8, length: 6 } },
    { name: 'مطبخ الخدمة', type: 'kitchen', area: 20, dimensions: { width: 5, length: 4 } },
  ];
  const proposed = [
    { name: 'مطبخ الخدمة', type: 'kitchen', area: 20 },
    { name: 'مطبخ رئيسي', type: 'kitchen', area: 48 },
  ];
  const bound = bindRequestedDimensions(proposed, requested);
  assert.deepEqual(bound.map(room => room.dimensions), [{ width: 5, length: 4 }, { width: 8, length: 6 }]);
  assert.throws(() => bindRequestedDimensions([
    { name: 'مطبخ', type: 'kitchen', area: 48 }, { name: 'مطبخ', type: 'kitchen', area: 20 },
  ], requested), /لم أُخمّن الربط/);
});

test('an iterative modify retains prior exact dimensions and changes only the explicitly revised room', async () => {
  const previous = [
    { name: 'مجلس الرجال', type: 'majlis', area: 63, dimensions: { width: 9, length: 7 }, position: 'front', side: 'any' },
    { name: 'مجلس النساء', type: 'majlis', area: 48, dimensions: { width: 8, length: 6 }, position: 'front', side: 'any' },
    { name: 'المطبخ', type: 'kitchen', area: 48, dimensions: { width: 8, length: 6 }, position: 'middle', side: 'any' },
    { name: 'غرفة نوم 1', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' },
  ];
  const revised = await requestLocalBrief({ prompt: 'غيّر المطبخ إلى 9×6', previous: { rooms: previous } });
  const aiRoomsWithoutDimensions = revised.rooms.map(({ name, type, area, position, side }) => ({ name, type, area, position, side }));
  const result = bindRequestedDimensions(aiRoomsWithoutDimensions, revised.rooms);
  assert.deepEqual(Object.fromEntries(result.map(room => [room.name, room.dimensions])), {
    'مجلس الرجال': { width: 9, length: 7 }, 'مجلس النساء': { width: 8, length: 6 },
    'غرفة نوم 1': { width: 4, length: 4 }, 'المطبخ': { width: 9, length: 6 },
  });
});

test('local modify parser flags a dimension edit when multiple same-type rooms make identity ambiguous', async () => {
  const prior = [
    { name: 'مطبخ رئيسي', type: 'kitchen', area: 48, dimensions: { width: 8, length: 6 }, position: 'middle', side: 'any' },
    { name: 'مطبخ خدمة', type: 'kitchen', area: 20, dimensions: { width: 5, length: 4 }, position: 'middle', side: 'any' },
  ];
  const local = await requestLocalBrief({ prompt: 'عدّل المطبخ إلى 7×6', previous: { rooms: prior } });
  assert.ok(local.questions.some(question => /حدّد العدد أو اسم الفراغ/.test(question)));
  // Although the previous dimensions would otherwise match the AI response,
  // the app must show this parser question and keep the approval gate closed.
  assert.ok(local.rooms.every(room => room.dimensions));
  const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /if \(ambiguousRoomEdit\) throw Error\(ambiguousRoomEdit\)/);
  assert.match(app, /bindRequestedDimensions\(result\.brief\.rooms, localConstraints\.rooms\)/);
  assert.match(app, /request\.rooms\.some\(r => r\.type === 'office'\)/, 'office remains fail-closed under the unchanged Worker schema');
  assert.doesNotMatch(app, /r\.type === 'office' \|\| r\.dimensions/, 'dimensions no longer bypass the connected-AI review path');
});

test('exact-dimension binding fails closed on missing rooms, wrong area, and contradictory AI rectangles', () => {
  const requested = [
    { name: 'مطبخ رئيسي', type: 'kitchen', area: 48, dimensions: { width: 8, length: 6 } },
    { name: 'مطبخ خدمة', type: 'kitchen', area: 20, dimensions: { width: 5, length: 4 } },
  ];
  assert.throws(() => bindRequestedDimensions([{ name: 'مطبخ رئيسي', type: 'kitchen', area: 48 }], requested), /يتضمن 1/);
  assert.throws(() => bindRequestedDimensions([
    { name: 'مطبخ رئيسي', type: 'kitchen', area: 47 }, { name: 'مطبخ خدمة', type: 'kitchen', area: 20 },
  ], requested), /لم يطابق/);
  const square = [{ name: 'مكتب دراسة', type: 'office', area: 16, dimensions: { width: 2, length: 8 } }];
  assert.throws(() => bindRequestedDimensions(square, [
    { name: 'مكتب دراسة', type: 'office', area: 16, dimensions: { width: 4, length: 4 } },
  ]), /أبعادًا متعارضة/);
});

test('single hard dimension among indistinguishable same-type rooms requires clarification, never greedy mapping', () => {
  const requested = [
    { name: 'مطبخ', type: 'kitchen', area: 48, dimensions: { width: 8, length: 6 } },
    { name: 'مطبخ', type: 'kitchen', area: 20 },
  ];
  const proposed = [{ name: 'مطبخ', type: 'kitchen', area: 48 }, { name: 'مطبخ', type: 'kitchen', area: 20 }];
  assert.throws(() => bindRequestedDimensions(proposed, requested), /لم أُخمّن الربط/);
});

test('Arabic numerals and English bedroom count are recognized', () => {
  assert.equal(normalizeBriefText('٣ غرف نوم'), '3 غرف نوم');
  assert.equal(normalizeBriefText('۳ غرف نوم'), '3 غرف نوم');
  assert.equal(verifyProposedProgram('3 bedrooms', rooms).pass, true);
  assert.equal(verifyProposedProgram('4 bedrooms', rooms).pass, false);
});

test('Arabic dual bedroom wording is treated as an exact count of two', () => {
  const two = rooms.filter(room => room.type === 'bedroom').slice(0, 2);
  for (const wording of ['أريد غرفتين نوم', 'أريد غرفتا نوم', 'أريد غرفتان نوم', 'أريد غرفتي نوم']) {
    const found = extractExplicitProgramRequirements(wording);
    assert.ok(found.some(x => x.id === 'bedrooms' && x.kind === 'exact-count' && x.expected === 2), wording);
    assert.equal(verifyProposedProgram(wording, two).pass, true, wording);
    assert.equal(verifyProposedProgram(wording, rooms).pass, false, wording);
  }
});

test('negated bedroom counts are exclusions, not positive room requirements', () => {
  for (const wording of ['لا أريد 3 غرف نوم', 'لا أريد ثلاث غرف نوم', 'I do not want 3 bedrooms']) {
    const rule = extractExplicitProgramRequirements(wording).find(x => x.id === 'bedrooms');
    assert.equal(rule?.kind, 'excluded-count', wording);
    assert.equal(verifyProposedProgram(wording, rooms).pass, false, wording);
    assert.equal(verifyProposedProgram(wording, [...rooms, { name: 'غرفة نوم 4', type: 'bedroom', area: 22 }]).pass, true, wording);
  }
});

test('positive bedroom requirements survive unrelated negative count clauses', () => {
  const wording = '3 bedrooms, not 4 bedrooms';
  const requirements = extractExplicitProgramRequirements(wording).filter(x => x.id === 'bedrooms');
  assert.deepEqual(requirements.map(x => [x.kind, x.expected]), [['exact-count', 3], ['excluded-count', 4]]);
  assert.equal(verifyProposedProgram(wording, rooms).pass, true);
  assert.equal(verifyProposedProgram(wording, rooms.slice(0, 5)).pass, false);
  assert.equal(verifyProposedProgram(wording, [...rooms, { name: 'غرفة نوم 4', type: 'bedroom', area: 22 }]).pass, false);
});

test('negated room dimensions are rejected when present and require evidence when unknown', () => {
  const wording = 'لا أريد مطبخ 8×6';
  assert.ok(extractExplicitProgramRequirements(wording).some(x => x.kind === 'excluded-room-dimensions'));
  assert.equal(verifyProposedProgram(wording, rooms).pass, false);
  const changed = structuredClone(rooms);
  changed[2].dimensions = { width: 12, length: 4 };
  assert.equal(verifyProposedProgram(wording, changed).pass, true);
  delete changed[2].dimensions;
  assert.equal(verifyProposedProgram(wording, changed).pass, false);
});

test('latest room dimension revision overrides the original dimension', () => {
  const prompt = 'المتطلبات الأصلية المعتمدة:\nالمطبخ 8×6\n\nالتعديل المطلوب الآن:\nكبر المطبخ الى 9×6';
  const updated = structuredClone(rooms);
  updated[2].area = 54;
  updated[2].dimensions = { width: 9, length: 6 };
  assert.equal(verifyProposedProgram(prompt, updated).pass, true);
  assert.equal(verifyProposedProgram(prompt, rooms).pass, false);
});

test('positive room dimensions survive a separate excluded-dimension clause', () => {
  const wording = 'kitchen 8×6, but not kitchen 9×6';
  const requirements = extractExplicitProgramRequirements(wording).filter(x => x.id === 'dimensions:kitchen');
  assert.deepEqual(requirements.map(x => [x.kind, x.width, x.length]), [['room-dimensions', 8, 6], ['excluded-room-dimensions', 9, 6]]);
  assert.equal(verifyProposedProgram(wording, rooms).pass, true);
  const tooSmall = structuredClone(rooms); tooSmall[2].dimensions = { width: 6, length: 4 };
  assert.equal(verifyProposedProgram(wording, tooSmall).pass, false);
  const excluded = structuredClone(rooms); excluded[2].dimensions = { width: 9, length: 6 }; excluded[2].area = 54;
  assert.equal(verifyProposedProgram(wording, excluded).pass, false);
});

test('explicit land dimensions are read from the client brief without confusing room sizes', () => {
  assert.deepEqual(extractPlotDimensions('أرضي ٥٠×٢٥ م، وأريد مطبخ 8×6'), { width: 50, length: 25 });
  assert.deepEqual(extractPlotDimensions('الأرض 30x40'), { width: 30, length: 40 });
  assert.equal(extractPlotDimensions('المطبخ 8×6'), null);
  assert.equal(extractPlotDimensions('لا أريد أرض 30×40'), null);
  assert.equal(extractPlotDimensions('الأرض 500×300'), null);
});
