import test from 'node:test';
import assert from 'node:assert/strict';
import { displayOr, isCostUnpriced, landFieldErrors, hasLandErrors, MISSING_AR, UNPRICED_TOTAL_AR } from '../dist/field-guards.mjs';
import { computeCost, BILLABLE } from '../dist/final-outputs.mjs';

test('displayOr shows a dash for missing values instead of null, undefined or NaN', () => {
  assert.equal(displayOr(null), MISSING_AR);
  assert.equal(displayOr(undefined), MISSING_AR);
  assert.equal(displayOr(NaN), MISSING_AR);
  assert.equal(displayOr('null'), MISSING_AR);
  assert.equal(displayOr(''), MISSING_AR);
  assert.equal(displayOr(null, ''), '');
});

test('displayOr keeps real values, including zero', () => {
  assert.equal(displayOr(0), '0');
  assert.equal(displayOr(12), '12');
  assert.equal(displayOr('غرفة'), 'غرفة');
});

test('isCostUnpriced is true until at least one item has a price', () => {
  assert.equal(isCostUnpriced(null), true);
  assert.equal(isCostUnpriced({ pricedCount: 0, totalCount: 6 }), true);
  assert.equal(isCostUnpriced({ pricedCount: 1, totalCount: 6 }), false);
});

test('computeCost with no rates reports an unpriced total, and one rate makes it priced', () => {
  const rows = BILLABLE.map((b, i) => ({ id: b.id, value: 10 + i, grade: 'measured' }));
  assert.equal(isCostUnpriced(computeCost(rows, {})), true);
  const oneRate = { [BILLABLE[0].id]: 50 };
  assert.equal(isCostUnpriced(computeCost(rows, oneRate)), false);
  assert.equal(UNPRICED_TOTAL_AR, 'لم تُسعّر البنود بعد');
});

test('landFieldErrors flags an empty land and attaches each message to its field', () => {
  const e = landFieldErrors({ length: NaN, width: NaN, streets: [], entries: [] });
  assert.match(e.length, /طول الأرض/);
  assert.match(e.width, /عرض الأرض/);
  assert.match(e.streets, /اختر شارعًا/);
  assert.equal(e.entries, null, 'no entry error until a street is chosen');
  assert.equal(hasLandErrors(e), true);
});

test('landFieldErrors enforces the 8 to 100 m range and treats blank input as missing', () => {
  assert.equal(landFieldErrors({ length: 8, width: 100, streets: ['s'], entries: ['s'] }).length, null);
  assert.equal(landFieldErrors({ length: 100, width: 8, streets: ['s'], entries: ['s'] }).width, null);
  assert.notEqual(landFieldErrors({ length: 7.5, width: 20, streets: ['s'], entries: ['s'] }).length, null);
  assert.notEqual(landFieldErrors({ length: 101, width: 20, streets: ['s'], entries: ['s'] }).length, null);
  assert.notEqual(landFieldErrors({ length: '', width: 20, streets: ['s'], entries: ['s'] }).length, null);
});

test('landFieldErrors asks for an entry once a street is selected but no entry is', () => {
  const e = landFieldErrors({ length: 20, width: 15, streets: ['s'], entries: [] });
  assert.equal(e.streets, null);
  assert.match(e.entries, /جهة المدخل/);
  assert.equal(hasLandErrors(landFieldErrors({ length: 20, width: 15, streets: ['s'], entries: ['s'] })), false);
});
