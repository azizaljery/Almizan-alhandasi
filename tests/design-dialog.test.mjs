import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffRoomPrograms, composeDesignConversation } from '../dist/design-dialog.mjs';
import { proposalInputsMatch, returnToConversation } from '../dist/studio-simple.mjs';

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

test('an unchanged or read-only room program is blocked before the redraw call', () => {
  const result = diffRoomPrograms(program, structuredClone(program), 'أبقِ المخطط كما هو', { initial: false });
  assert.equal(result.noChange, true);
  assert.ok(result.blockers.some(text => /لم يغيّر برنامج الغرف/.test(text)));
  const studioSource = readFileSync(new URL('../dist/studio-simple.mjs', import.meta.url), 'utf8');
  const approval = studioSource.slice(studioSource.indexOf("$('studioApprove')"), studioSource.indexOf("$('studioEdit')"));
  assert.match(approval, /if \(!conversation\.diff \|\| conversation\.diff\.blockers\.length\) return;/);
  assert.ok(approval.indexOf('api.drawProposal()') > approval.indexOf('conversation.diff.blockers.length'));
});

test('returning from results only reopens the composer and preserves draft, transcript, and model', () => {
  const effects = [];
  const draft = { value: 'قرّب المطبخ من الطعام', focus(options) { effects.push(['focus', options]); } };
  const transcript = ['الطلب الأول', 'تم توليد المخطط'];
  const model = { id: 'accepted-model' };
  const doc = {
    querySelector(selector) {
      assert.equal(selector, '[data-tab="design"]');
      return { click() { effects.push(['navigate', 'design']); } };
    },
    getElementById(id) {
      if (id === 'studioBrief') return draft;
      if (id === 'studioSimple') return { scrollIntoView(options) { effects.push(['scroll', options]); } };
      return null;
    },
  };
  assert.equal(returnToConversation(doc), true);
  assert.deepEqual(effects.map(effect => effect[0]), ['navigate', 'scroll', 'focus']);
  assert.equal(draft.value, 'قرّب المطبخ من الطعام');
  assert.deepEqual(transcript, ['الطلب الأول', 'تم توليد المخطط']);
  assert.equal(model.id, 'accepted-model');
  assert.equal(returnToConversation({ querySelector() { return null; } }), false);
});
