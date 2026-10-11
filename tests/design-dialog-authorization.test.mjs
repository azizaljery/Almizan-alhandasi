import test from 'node:test';
import assert from 'node:assert/strict';
import { diffRoomPrograms } from '../dist/design-dialog.mjs';
const rooms = [
  { id: 'living-1', name: 'صالة عائلية', type: 'living', area: 40, position: 'middle' },
  { id: 'bed-1', name: 'غرفة نوم', type: 'bedroom', area: 24, position: 'back' },
  { id: 'kitchen-1', name: 'مطبخ', type: 'kitchen', area: 20, position: 'front' },
];
const without = id => rooms.filter(r => r.id !== id);
for (const request of ['غيّر موقع الصالة', 'غير موقع الصالة', 'استبدل مكان الصالة', 'احذف الغرف', 'لا تحذف غرفة النوم', 'احذف المطبخ وغير موقع غرفة النوم', 'غير موقع غرفة النوم واحذف المطبخ', 'لا أريد حذف غرفة النوم', 'احذف غرفة النوم الثانية', 'لا تحذف المطبخ بل غير موقع غرفة النوم']) {
  test(`removal needs specific affirmative authorization: ${request}`, () => {
    assert.ok(diffRoomPrograms(rooms, without('bed-1'), request).blockers.length);
  });
}
test('specific room deletion remains compatible with Arabic articles and English', () => {
  for (const request of ['احذف غرفة النوم', 'أزل غرفة النوم', 'delete غرفة النوم']) {
    assert.deepEqual(diffRoomPrograms(rooms, without('bed-1'), request).blockers, []);
  }
});
test('authorizing one room never permits deleting another', () => {
  assert.ok(diffRoomPrograms(rooms, [rooms[0]], 'احذف المطبخ').blockers.length);
});
test('duplicate rooms cannot be deleted by an ambiguous name', () => {
  const before = [...rooms, { ...rooms[1], id: 'bed-2', area: 30 }];
  const after = before.filter(r => r.id !== 'bed-1');
  const result = diffRoomPrograms(before, after, 'احذف غرفة النوم');
  assert.ok(result.blockers.length);
  assert.deepEqual(result.removed.map(r => r.id), ['bed-1']);
  assert.deepEqual(result.changed, []);
});
test('reordering duplicates is not a modification', () => {
  const before = [rooms[1], { ...rooms[1], id: 'bed-2', area: 30 }];
  assert.equal(diffRoomPrograms(before, [...before].reverse(), '', { requireChange: false }).noChange, true);
});
test('audit snapshots and difference are detached from caller state', () => {
  const before = structuredClone(rooms), after = structuredClone(without('bed-1'));
  const result = diffRoomPrograms(before, after, 'احذف غرفة النوم');
  assert.deepEqual(result.before, before);
  assert.deepEqual(result.after, after);
  before[1].area = 999;
  after[0].name = 'mutated';
  assert.equal(result.before[1].area, 24);
  assert.equal(result.after[0].name, 'صالة عائلية');
  assert.equal(result.removed[0].area, 24);
});

test('a unique short room name is accepted without a generic room wildcard', () => {
  assert.deepEqual(diffRoomPrograms(rooms, without('living-1'), 'احذف الصالة').blockers, []);
  assert.ok(diffRoomPrograms(rooms, without('kitchen-1'), 'احذف المطبخ الخارجي').blockers.length);
});
test('legacy rooms without IDs preserve unchanged duplicates during deletion', () => {
  const first = { name: 'غرفة نوم', type: 'bedroom', area: 24 };
  const second = { ...first, area: 30 };
  const result = diffRoomPrograms([first, second], [second], 'احذف غرفة النوم');
  assert.deepEqual(result.removed, [first]);
  assert.deepEqual(result.changed, []);
  assert.ok(result.blockers.length);
});
test('geometry-relevant fields remain visible in the difference', () => {
  const before = [{ ...rooms[0], width: 8, length: 6 }];
  const after = [{ ...before[0], width: 12, length: 4 }];
  const result = diffRoomPrograms(before, after, 'غير أبعاد الصالة');
  assert.equal(result.noChange, false);
  assert.deepEqual(result.changed[0].fields.map(f => f.name), ['width', 'length']);
});

test('Arabic compound command authorizes deleting the living room only', () => {
  const request = 'احذف الصالة وانقل المطبخ';
  assert.ok(diffRoomPrograms(rooms, without('kitchen-1'), request).blockers.length);
  assert.deepEqual(diffRoomPrograms(rooms, without('living-1'), request).blockers, []);
});
test('English compound command authorizes deleting the living room only', () => {
  const before = [
    { name: 'living room', type: 'living', area: 40 },
    { name: 'kitchen', type: 'kitchen', area: 20 },
  ];
  const request = 'delete the living room and move the kitchen';
  assert.ok(diffRoomPrograms(before, [before[0]], request).blockers.length);
  assert.deepEqual(diffRoomPrograms(before, [before[1]], request).blockers, []);
});
