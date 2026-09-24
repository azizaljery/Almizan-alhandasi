// Independent acceptance guard for Claude Planner v2.2.1-WIP.
// This file is deliberately outside the supplied package: it tests the public behaviour
// without modifying its source or weakening its own regression suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, validateModel, defaultRooms, footprintDiagnostics, quantities } from '../src/planner.mjs';
import { importModel } from '../src/migrations.mjs';

const plot = (shape = 'rect', entry = 's') => ({ width: 35, length: 45, floors: 1, entry, streets: { [entry]: true }, shape });
const model = (shape = 'rect', entry = 's') => generateModel(plot(shape, entry), defaultRooms());
const copy = value => JSON.parse(JSON.stringify(value));
const errors = value => validateModel(value).join('\n');

test('IG01 normalizes uppercase and padded U', () => {
  for (const key of ['U', ' u ', 'L', ' RECT ']) assert.doesNotThrow(() => generateModel(plot(key), defaultRooms()));
});

test('IG02 rejects unknown and prototype-shaped keys instead of silently generating rect', () => {
  for (const key of ['triangle', '__proto__', 'constructor', 1, {}]) {
    assert.throws(() => generateModel(plot(key), defaultRooms()), /شكل المبنى غير مدعوم/);
  }
});

test('IG03 reports buildable frontage in an undersized but schema-valid plot', () => {
  const one = [{ name: 'مستودع', type: 'storage', area: 4, position: 'middle', side: 'any' }];
  assert.throws(() => generateModel({ ...plot('rect'), width: 8, length: 30 }, one), /واجهة البناء الصافية 5 م/);
  assert.equal(footprintDiagnostics({ ...plot('rect'), width: 8, length: 30 }).frontage, 5);
});

test('IG04 rejects malformed courtyard dimensions and a misplaced courtyard', () => {
  for (const patch of [{ w: 0 }, { h: -1 }, { x: NaN }, { y: Infinity }, { x: -500 }]) {
    const m = model('u'); Object.assign(m.courtyards[0], patch);
    assert.notEqual(errors(m), '', JSON.stringify(patch));
  }
});

test('IG05 rejects a courtyard that no longer matches the U notch', () => {
  const m = model('u'); m.courtyards[0].x += 0.1;
  assert.match(errors(m), /الفناء لا يطابق فتحة مضلع المبنى/);
});

test('IG06 validates room area against the program record, not self-labelled geometry', () => {
  const m = model(); const r = m.rooms[0]; r.h *= 0.5; r.area = r.targetArea = r.w * r.h;
  assert.match(errors(m), /المساحة المطلوبة للفراغ لا تطابق البرنامج/);
});

test('IG07 rejects duplicate/unknown room identities', () => {
  const duplicate = model(); duplicate.rooms[1].id = duplicate.rooms[0].id;
  assert.match(errors(duplicate), /فراغ غير موجود في البرنامج أو مكرر/);
  const unknown = model(); unknown.rooms[0].id = 'room-99';
  assert.match(errors(unknown), /فراغ غير موجود في البرنامج أو مكرر/);
});

test('IG08 imports a v2.1 U model without mutation and restores roofPolicy', () => {
  const legacy = copy(model('u')); delete legacy.courtyards[0].roofPolicy;
  const before = JSON.stringify(legacy); const result = importModel(legacy);
  assert.equal(result.model.courtyards[0].roofPolicy, 'OPEN_TO_SKY');
  assert.equal(JSON.stringify(legacy), before);
});

test('IG09 rejects an incompatible legacy courtyard instead of guessing', () => {
  const legacy = copy(model('u')); delete legacy.courtyards[0].roofPolicy; legacy.courtyards[0].roofable = true;
  assert.throws(() => importModel(legacy), /لا يمكن استنتاج/);
});

test('IG10 reserved roof policies validate but cannot enter quantities', () => {
  const m = model('u'); Object.assign(m.courtyards[0], { roofPolicy: 'COVERED_ATRIUM', roofable: true });
  assert.deepEqual(validateModel(m), []);
  assert.throws(() => quantities(m), /حساب الكميات غير منفذ/);
});
