import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, generateModel, validateModel, overlap, quantities, SHAPES } from '../src/planner.mjs';

/**
 * @typedef {import('../src/PlannerOutputContract.mjs').PlotInput} PlotInput
 * @typedef {import('../src/PlannerOutputContract.mjs').Direction} Direction
 * @typedef {import('../src/PlannerOutputContract.mjs').ValidatedDesignGeometry} ValidatedDesignGeometry
 */
/** Plot fields shared by every case; width/length are added per test. @type {Omit<PlotInput, 'width' | 'length'>} */
const base = { floors: 1, entry: 's', streets: { s: true } };
const program = () => defaultRooms({ bedrooms: 4, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 });

test('three distinct shapes are offered and produce genuinely different footprints', () => {
  assert.deepEqual(Object.keys(SHAPES), ['rect', 'l', 'u']);
  const models = ['rect', 'l', 'u'].map(shape => generateModel({ ...base, width: 30, length: 40, shape }, program()));
  models.forEach((m, i) => { assert.equal(m.shape, ['rect', 'l', 'u'][i]); assert.equal(m.shapeFallback, false); assert.deepEqual(validateModel(m), []); });
  /** @param {ValidatedDesignGeometry} m */
  const sig = m => m.rooms.map(r => [r.x, r.y, r.w, r.h].map(v => v.toFixed(2)).join()).join('|');
  assert.notEqual(sig(models[0]), sig(models[1])); assert.notEqual(sig(models[1]), sig(models[2]));
});

test('U has an open courtyard that no room or corridor enters, excluded from built footprint', () => {
  for (const entry of /** @type {Direction[]} */ (['s', 'n', 'e', 'w'])) {
    const m = generateModel({ ...base, entry, streets: { [entry]: true }, width: 35, length: 45, shape: 'u' }, program());
    assert.equal(m.shape, 'u'); assert.equal(m.courtyards.length, 1);
    const c = m.courtyards[0]; assert.ok(c.w >= 2.5 && c.h > 2);
    [...m.rooms, ...m.corridors].forEach(r => assert.equal(overlap(r, c), false, r.name));
    const q = quantities(m); assert.ok(Math.abs(q.footprint + q.courtyard - m.building.w * m.building.h) < 1e-6);
  }
});

test('every room keeps its exact requested area in L and U, across entries', () => {
  for (const shape of ['l', 'u']) for (const entry of /** @type {Direction[]} */ (['s', 'n', 'e', 'w'])) {
    const rooms = program(), m = generateModel({ ...base, entry, streets: { [entry]: true }, width: 30, length: 40, shape }, rooms);
    assert.equal(m.rooms.length, rooms.length);
    m.rooms.forEach(r => assert.ok(Math.abs(r.w * r.h - r.targetArea) < 1e-5));
  }
});

test('L and U are deterministic and never mutate inputs', () => {
  for (const shape of ['l', 'u']) {
    const p = { ...base, width: 30, length: 40, shape }, rooms = program(), before = JSON.stringify([p, rooms]);
    assert.deepEqual(generateModel(p, rooms), generateModel(p, rooms)); assert.equal(JSON.stringify([p, rooms]), before);
  }
});

test('varied programs: every L/U result validates or falls back safely, never a broken model', () => {
  let native = { l: 0, u: 0 };
  for (let k = 0; k < 60; k++) for (const shape of /** @type {('l'|'u')[]} */ (['l', 'u'])) {
    const entry = /** @type {Direction[]} */ (['s', 'n', 'e', 'w'])[k % 4], p = { ...base, shape, entry, streets: { [entry]: true }, width: 24 + k % 17, length: 30 + k % 19 };
    const rooms = defaultRooms({ bedrooms: 1 + k % 6, majlis: k % 3, baths: 1 + k % 4, kitchens: 1, halls: 1 + k % 2, dining: k % 2 });
    try { const m = generateModel(p, rooms); assert.deepEqual(validateModel(m), []); if (m.shape === shape) native[shape]++; else assert.equal(m.shapeFallback, true); }
    catch (e) { assert.match(/** @type {Error} */ (e).message, /لم يجد|أكبر/); }
  }
  assert.ok(native.l >= 20, 'L natively solved ' + native.l); assert.ok(native.u >= 20, 'U natively solved ' + native.u);
});
