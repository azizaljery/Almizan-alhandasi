import test from 'node:test';
import assert from 'node:assert/strict';
import { diffRoomPrograms } from '../dist/design-dialog.mjs';
const rooms = [
  { id: 'living', name: 'صالة عائلية', type: 'living', area: 30, position: 'middle' },
  { id: 'kitchen', name: 'مطبخ', type: 'kitchen', area: 48, dimensions: { width: 8, length: 6 } },
  { id: 'bed-1', name: 'غرفة نوم 1', type: 'bedroom', area: 16 },
  { id: 'bed-2', name: 'غرفة نوم 2', type: 'bedroom', area: 16 },
];
const without = (...ids) => rooms.filter(r => !ids.includes(r.id));
const rejected = diff => assert.ok(diff.blockers.some(message => /يحذف غرفًا/.test(message)));
for (const request of ['احذف الصالة وانقل المطبخ', 'انقل المطبخ واحذف الصالة']) {
  test(`Arabic clause targets bind deletion: ${request}`, () => {
    rejected(diffRoomPrograms(rooms, without('kitchen'), request));
    assert.deepEqual(diffRoomPrograms(rooms, without('living'), request).blockers, []);
  });
}
test('English deletion cannot borrow the moved room target', () => {
  const previous = [{ name: 'living room', type: 'living', area: 30 }, { name: 'kitchen', type: 'kitchen', area: 20 }];
  const request = 'delete the living room and move the kitchen';
  rejected(diffRoomPrograms(previous, [previous[0]], request));
  assert.deepEqual(diffRoomPrograms(previous, [previous[1]], request).blockers, []);
});
for (const request of ['without any other substantial changes please delete kitchen', 'no other substantial changes please delete kitchen', 'without ... delete kitchen', 'no ... delete kitchen', 'do not delete kitchen', 'Do not, under any circumstances, delete the kitchen', 'without, any changes, delete the kitchen', 'no, other changes, delete the kitchen', "don't delete kitchen", 'لا تحذف المطبخ']) {
  test(`negation is retained: ${request}`, () => rejected(diffRoomPrograms(rooms, without('kitchen'), request)));
}
for (const request of ['احذف كل غرف النوم', 'احذف جميع غرف النوم', 'delete all bedrooms']) {
  test(`explicit scoped all-of-type remains supported: ${request}`, () => {
    assert.deepEqual(diffRoomPrograms(rooms, without('bed-1', 'bed-2'), request).blockers, []);
    rejected(diffRoomPrograms(rooms, without('bed-1'), request));
    rejected(diffRoomPrograms(rooms, without('bed-1', 'bed-2', 'kitchen'), request));
  });
}
test('all in another action cannot authorize all room deletion', () => {
  rejected(diffRoomPrograms(rooms, without('bed-1', 'bed-2'), 'احذف الصالة وانقل كل غرف النوم'));
});
test('generic rooms cannot be interpreted as explicit bedroom authorization', () => {
  const previous = rooms.filter(r => r.id !== 'bed-2');
  rejected(diffRoomPrograms(previous, previous.filter(r => r.id !== 'bed-1'), 'احذف الغرف'));
});
test('qualified room names do not authorize shorter different room names', () => {
  rejected(diffRoomPrograms(rooms, without('kitchen'), 'احذف المطبخ الخارجي'));
});
test('duplicate identity is preserved and ambiguous names are rejected', () => {
  const previous = [{ id: 'a', name: 'غرفة نوم', type: 'bedroom', area: 16 }, { id: 'b', name: 'غرفة نوم', type: 'bedroom', area: 24 }];
  const result = diffRoomPrograms(previous, [previous[1]], 'احذف غرفة النوم');
  rejected(result);
  assert.deepEqual(result.removed, [previous[0]]);
  assert.deepEqual(result.changed, []);
  assert.equal(diffRoomPrograms(previous, [...previous].reverse(), '', { requireChange: false }).noChange, true);
  assert.deepEqual(diffRoomPrograms(previous, [], 'احذف كل غرف النوم').blockers, []);
});
test('legacy duplicate records remain matched without IDs', () => {
  const previous = [{ name: 'غرفة نوم', type: 'bedroom', area: 16 }, { name: 'غرفة نوم', type: 'bedroom', area: 24 }];
  const result = diffRoomPrograms(previous, [previous[1]], 'احذف غرفة النوم');
  assert.deepEqual(result.removed, [previous[0]]);
  assert.deepEqual(result.changed, []);
});
test('equal-area geometry changes are visible and snapshots survive caller mutation', () => {
  const before = structuredClone(rooms), after = structuredClone(rooms);
  after[1].dimensions = { width: 12, length: 4 };
  const result = diffRoomPrograms(before, after, 'غير أبعاد المطبخ إلى 12×4');
  assert.equal(result.noChange, false);
  assert.deepEqual(result.changed[0].fields, [{ name: 'dimensions', from: { width: 8, length: 6 }, to: { width: 12, length: 4 } }]);
  assert.deepEqual(result.before, before);
  assert.deepEqual(result.after, after);
  before[1].dimensions.width = 99;
  after[1].dimensions.length = 99;
  assert.equal(result.before[1].dimensions.width, 8);
  assert.equal(result.after[1].dimensions.length, 4);
});
test('production room-scoped area permission and negation remain intact', () => {
  const next = structuredClone(rooms);
  next[0].area = 35;
  assert.deepEqual(diffRoomPrograms(rooms, next, 'كبر الصالة إلى 35 م²').blockers, []);
  next[1].area = 52;
  assert.ok(diffRoomPrograms(rooms, next, 'كبر الصالة إلى 35 م²').blockers.some(message => /مساحة/.test(message)));
  for (const request of ['لا تكبر المطبخ', 'do not resize kitchen', 'without resize kitchen', 'no resize kitchen']) {
    assert.ok(diffRoomPrograms(rooms, next, request).blockers.some(message => /مساحة/.test(message)));
  }
});

test('all-of-type still requires a specific type rather than generic rooms', () => {
  rejected(diffRoomPrograms(rooms, without('bed-1', 'bed-2'), 'احذف كل الغرف'));
});
