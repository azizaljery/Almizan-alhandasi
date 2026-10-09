import test from 'node:test';
import assert from 'node:assert/strict';
import { diffRoomPrograms, composeDesignConversation } from '../dist/design-dialog.mjs';
import { proposalInputsMatch } from '../dist/studio-simple.mjs';

const program = [
  { name: 'غرفة نوم 1', type: 'bedroom', area: 16, position: 'back', side: 'any' },
  { name: 'غرفة نوم 2', type: 'bedroom', area: 16, position: 'back', side: 'any' },
  { name: 'صالة عائلية', type: 'living', area: 30, position: 'middle', side: 'any' },
  { name: 'مطبخ', type: 'kitchen', area: 12, position: 'middle', side: 'any' },
];

test('changing the living-room position cannot authorize an unrelated bedroom deletion', () => {
  const next = structuredClone(program);
  next[2].position = 'front';
  next.splice(1, 1);
  const result = diffRoomPrograms(program, next, 'غيّر موقع الصالة', { initial: false });
  assert.equal(result.removed.length, 1);
  assert.ok(result.blockers.some(text => /يحذف غرفًا لم تحددها صراحةً/.test(text)));
});

test('rename wording alone never authorizes treating a deleted room as a rename', () => {
  const next = program.filter(room => room.name !== 'غرفة نوم 1');
  next.push({ name: 'جناح الوالدة', type: 'bedroom', area: 16, position: 'back', side: 'any' });
  const result = diffRoomPrograms(program, next, 'غيّر اسم غرفة نوم 1 إلى جناح الوالدة', { initial: false });
  assert.ok(result.blockers.some(text => /يحذف غرفًا لم تحددها صراحةً/.test(text)));
});

test('a named requested deletion is allowed, but one category mention cannot remove multiple rooms', () => {
  const one = diffRoomPrograms(program, program.filter(room => room.name !== 'غرفة نوم 1'), 'احذف غرفة نوم 1', { initial: false });
  assert.equal(one.blockers.some(text => /يحذف غرفًا/.test(text)), false);
  const both = diffRoomPrograms(program, program.filter(room => room.type !== 'bedroom'), 'احذف غرفة نوم 1', { initial: false });
  assert.ok(both.blockers.some(text => /يحذف غرفًا/.test(text)));
});

test('Arabic and English negative removal requests never authorize deletion', () => {
  for (const prompt of ['لا تحذف غرفة نوم 1', 'do not delete bedroom 1']) {
    const result = diffRoomPrograms(program, program.filter(room => room.name !== 'غرفة نوم 1'), prompt, { initial: false });
    assert.ok(result.blockers.some(text => /يحذف غرفًا لم تحددها صراحةً/.test(text)), prompt);
  }
});

test('a room-area request is scoped to its named room', () => {
  const next = structuredClone(program);
  next[2].area = 35;
  next[3].area = 24;
  const result = diffRoomPrograms(program, next, 'كبّر الصالة إلى 35 م²', { initial: false });
  assert.ok(result.blockers.some(text => /غيّر مساحة غرفة لم تحددها صراحةً/.test(text)));
  const scoped = diffRoomPrograms(program, next.slice(0, 3).concat([{ ...next[3], area: program[3].area }]), 'كبّر الصالة إلى 35 م²', { initial: false });
  assert.equal(scoped.blockers.some(text => /غيّر مساحة غرفة/.test(text)), false);
});

test('naming one of several same-type rooms cannot authorize area edits to its sibling', () => {
  const before = [
    { name: 'مجلس الرجال', type: 'majlis', area: 36, position: 'front' },
    { name: 'مجلس النساء', type: 'majlis', area: 30, position: 'back' },
  ];
  const both = structuredClone(before);
  both[0].area = 40;
  both[1].area = 35;
  const result = diffRoomPrograms(before, both, 'وسّع مجلس الرجال إلى 40 م²', { initial: false });
  assert.ok(result.blockers.some(text => /غيّر مساحة غرفة لم تحددها صراحةً/.test(text)));
  const onlyNamed = diffRoomPrograms(before, [both[0], before[1]], 'وسّع مجلس الرجال إلى 40 م²', { initial: false });
  assert.equal(onlyNamed.blockers.some(text => /غيّر مساحة غرفة/.test(text)), false);
});

test('Arabic and English negative resize requests never authorize area changes', () => {
  for (const prompt of ['لا تكبر المطبخ', 'do not resize kitchen']) {
    const next = structuredClone(program);
    next[3].area = 18;
    const result = diffRoomPrograms(program, next, prompt, { initial: false });
    assert.ok(result.blockers.some(text => /غيّر مساحة غرفة لم تحددها صراحةً/.test(text)), prompt);
  }
});

test('distance and adjacency requests cannot authorize an unrelated room-area change', () => {
  for (const prompt of ['غيّر موقع المطبخ 3 متر', 'قرّب المطبخ من الطعام وزد 2 متر']) {
    const next = structuredClone(program);
    next[3].area = 18;
    const result = diffRoomPrograms(program, next, prompt, { initial: false });
    assert.ok(result.blockers.some(text => /غيّر مساحة غرفة لم تحددها صراحةً/.test(text)), prompt);
  }
});

test('revision prompts retain original requirements while making the current change explicit', () => {
  const prompt = composeDesignConversation('ثلاث غرف نوم ومطبخ 8×6', ['أبقي المطبخ على 8×6'], 'غيّر موقع الصالة');
  assert.match(prompt, /المتطلبات الأصلية المعتمدة/);
  assert.match(prompt, /مطبخ 8×6/);
  assert.match(prompt, /التعديل المطلوب الآن:\nغيّر موقع الصالة/);
});

test('pending proposal approval is bound to the visible text and plot values', () => {
  const snapshot = { brief: 'غيّر موقع الصالة', plot: { width: 25, length: 40, entry: 's', maxBuiltArea: '500' } };
  assert.equal(proposalInputsMatch('غيّر موقع الصالة', { ...snapshot.plot }, snapshot), true);
  assert.equal(proposalInputsMatch('احذف المطبخ', { ...snapshot.plot }, snapshot), false);
  assert.equal(proposalInputsMatch(snapshot.brief, { ...snapshot.plot, width: 30 }, snapshot), false);
  assert.equal(proposalInputsMatch(snapshot.brief, { ...snapshot.plot, entry: 'n' }, snapshot), false);
  assert.equal(proposalInputsMatch(snapshot.brief, { ...snapshot.plot, maxBuiltArea: '600' }, snapshot), false);
});
