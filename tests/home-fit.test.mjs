import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialDesign, suggestFit, friendlyBuildError, SharaSession } from '../dist/home-flow.mjs';
import { defaultRooms } from '../dist/planner.mjs';

const land = { length: 23, width: 22, streets: ['s'], entries: ['s'] };
const defaults = { bedrooms: 4, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 };
const discovery = new SharaSession().discovery();

test('البرنامج الافتراضي على أرض 22×23 لا يتسع في دور واحد (حالة الفشل المبلّغ عنها)', async () => {
  await assert.rejects(() => generateInitialDesign({ land, rooms: defaultRooms(defaults), discovery }));
});

test('suggestFit يقترح برنامجًا أصغر ينجح فعلًا، ولا يعدّل الأصل', async () => {
  const before = { ...defaults };
  const fit = await suggestFit({ land, counts: defaults, discovery });
  assert.ok(fit, 'يجب أن يوجد اقتراح');
  assert.deepEqual(defaults, before);
  const diffs = Object.keys(before).filter(k => fit[k] !== before[k]);
  assert.ok(diffs.length >= 1 && diffs.every(k => fit[k] < before[k]));
  await generateInitialDesign({ land, rooms: defaultRooms(fit), discovery });
});

test('friendlyBuildError يختصر رسالة المحركات ويُبقي غيرها كما هي', () => {
  const msg = friendlyBuildError(Error('No candidate passed native validation | rect: لم يجد محرك التخطيط ... | pavilions: ...'));
  assert.ok(msg.length < 140 && !msg.includes('rect'));
  assert.equal(friendlyBuildError(Error('خطأ آخر')), 'خطأ آخر');
});
