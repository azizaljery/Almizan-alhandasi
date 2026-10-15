import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialDesign, diagnoseFit, friendlyBuildError, SharaSession } from '../dist/home-flow.mjs';
import { defaultRooms } from '../dist/planner.mjs';

const land = { length: 23, width: 22, streets: ['s'], entries: ['s'] };
const defaults = { bedrooms: 4, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 };
const discovery = new SharaSession().discovery();

test('البرنامج الافتراضي على أرض 22×23 لا يتسع في دور واحد (حالة الفشل المبلّغ عنها)', async () => {
  await assert.rejects(() => generateInitialDesign({ land, rooms: defaultRooms(defaults), discovery }));
});

test('diagnoseFit يعيد حقائق محسوبة وخيارات مجرّبة، ولا يعدّل الأصل ولا يطبّق شيئًا', async () => {
  const before = { ...defaults }, landBefore = JSON.stringify(land);
  const { facts, options } = await diagnoseFit({ land, counts: defaults, discovery });
  assert.deepEqual(defaults, before); assert.equal(JSON.stringify(land), landBefore);
  assert.equal(facts.plotArea, 506);
  assert.equal(facts.net.area, 351.5);
  assert.equal(facts.required, 228);
  assert.equal(facts.perType.reduce((a, t) => a + t.total, 0), 228);
  assert.ok(options.some(o => o.kind === 'reduce' && o.ok) && options.some(o => o.kind === 'reduce' && !o.ok), 'خيارات ناجحة وفاشلة معًا');
  for (const o of options.filter(o => o.ok)) await generateInitialDesign({ land: o.land, rooms: defaultRooms(o.counts), discovery });
  for (const o of options.filter(o => !o.ok)) await assert.rejects(() => generateInitialDesign({ land: o.land, rooms: defaultRooms(o.counts), discovery }));
});

test('friendlyBuildError يختصر رسالة المحركات ويُبقي غيرها كما هي', () => {
  const msg = friendlyBuildError(Error('No candidate passed native validation | rect: لم يجد محرك التخطيط ... | pavilions: ...'));
  assert.ok(msg.length < 140 && !msg.includes('rect'));
  assert.equal(friendlyBuildError(Error('خطأ آخر')), 'خطأ آخر');
});
