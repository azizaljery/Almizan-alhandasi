// hardening.test.mjs -- batch v2.2.1 (review follow-up to v2.2.0).
// Each test tampers with a valid model or input in one precise way and asserts the specific
// Arabic error that names the problem -- not merely "some error".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateModel, validateModel, validatePlot, defaultRooms, quantities, footprintDiagnostics,
  MIN_WING_WIDTH, ROOF_POLICY_SUPPORT, ROOF_POLICIES,
} from '../src/planner.mjs';
import { quantityRows } from '../src/estimates.mjs';
import { migrateModel, importModel } from '../src/migrations.mjs';

/** @typedef {import('../src/PlannerOutputContract.mjs').Rect} Rect */
const ENTRIES = /** @type {const} */ (['s', 'n', 'e', 'w']);
/** @param {'s'|'n'|'e'|'w'} entry @param {Partial<import('../src/PlannerOutputContract.mjs').PlotInput>} [extra] */
const at = (entry, extra = {}) => ({ floors: 1, entry, streets: { [entry]: true }, width: 35, length: 45, ...extra });
/** @param {'rect'|'l'|'u'} shape @param {'s'|'n'|'e'|'w'} [entry] */
const make = (shape, entry = 's') => generateModel(at(entry, { shape }), defaultRooms());
/** @param {string[]} errors @param {string} prefix */
const has = (errors, prefix) => errors.some(e => e.startsWith(prefix));
/** @param {unknown} v */
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------------------
// Item 2 -- courtyard geometry
// ---------------------------------------------------------------------------------------
test('H01 courtyard dimensions must be finite and positive', () => {
  for (const [k, v] of /** @type {[keyof Rect, number][]} */ ([['w', NaN], ['h', Infinity], ['x', NaN], ['w', 0], ['h', -2]])) {
    const m = make('u'); m.courtyards[0][k] = v;
    assert.ok(has(validateModel(m), 'أبعاد الفناء غير صالحة'), `${k}=${v}`);
  }
});

test('H02 courtyard must match the polygon notch exactly and lie inside the buildable area', () => {
  for (const entry of ENTRIES) {
    for (const [k, d] of /** @type {[keyof Rect, number][]} */ ([['x', 0.05], ['y', 0.05], ['w', -0.05], ['h', 0.05]])) {
      const m = make('u', entry); m.courtyards[0][k] += d;
      assert.ok(has(validateModel(m), 'الفناء لا يطابق فتحة مضلع المبنى'), `${entry} ${k}+${d}`);
    }
  }
  const m = make('u'); m.courtyards[0].x = -500;
  assert.ok(has(validateModel(m), 'الفناء يقع خارج المساحة المتاحة للبناء'));
});

test('H03 courtyard count must match the shape: U exactly one, rect and L none', () => {
  const u = make('u'); u.courtyards = [];
  assert.ok(has(validateModel(u), 'عدد الأفنية لا يطابق شكل المبنى'));
  const u2 = make('u'); u2.courtyards = [u2.courtyards[0], { ...u2.courtyards[0] }];
  assert.ok(has(validateModel(u2), 'عدد الأفنية لا يطابق شكل المبنى'));
  const court = make('u').courtyards[0];
  for (const shape of /** @type {const} */ (['rect', 'l'])) {
    const m = make(shape); m.courtyards = [clone(court)];
    assert.ok(has(validateModel(m), 'عدد الأفنية لا يطابق شكل المبنى'), shape);
  }
  for (const shape of /** @type {const} */ (['rect', 'l', 'u'])) for (const entry of ENTRIES) assert.deepEqual(validateModel(make(shape, entry)), [], `${shape}/${entry}`);
});

// ---------------------------------------------------------------------------------------
// Item 3 -- targetArea against the client's program, by id
// ---------------------------------------------------------------------------------------
test('H04 a room area is checked against the program by id; NaN never passes', () => {
  for (const v of [NaN, Infinity, -1, 0]) {
    const m = make('rect'); m.rooms[0].targetArea = v;
    assert.ok(has(validateModel(m), 'المساحة المطلوبة للفراغ لا تطابق البرنامج'), 'targetArea ' + v);
  }
  const shrunk = make('rect'), r = shrunk.rooms[0];
  r.h *= 0.5; r.targetArea = r.area = r.w * r.h; // geometry and its own labels edited together
  const errors = validateModel(shrunk);
  assert.ok(has(errors, 'المساحة المطلوبة للفراغ لا تطابق البرنامج') && has(errors, 'المساحة غير مطابقة لطلبك'));
  const ghost = make('rect'); ghost.rooms[0].id = 'room-99';
  assert.ok(has(validateModel(ghost), 'فراغ غير موجود في البرنامج أو مكرر'));
  const dup = make('rect'); dup.rooms[1].id = dup.rooms[0].id;
  assert.ok(has(validateModel(dup), 'فراغ غير موجود في البرنامج أو مكرر'));
});

test('H05 the program itself must be well-formed', () => {
  for (const patch of [{ area: NaN }, { area: 0 }, { targetArea: 999 }]) {
    const m = make('rect'); Object.assign(m.program[0], patch);
    assert.ok(has(validateModel(m), 'برنامج الغرف غير صالح'), JSON.stringify(patch));
  }
  const m = make('rect'); m.program[1].id = m.program[0].id;
  assert.ok(has(validateModel(m), 'برنامج الغرف غير صالح'));
});

// ---------------------------------------------------------------------------------------
// Item 5 -- explain the net buildable area; no global limit raised
// ---------------------------------------------------------------------------------------
test('H06 footprintDiagnostics reports setbacks, coverage and frontage/depth per entry', () => {
  const s = footprintDiagnostics(at('s', { width: 8, length: 30 }));
  assert.deepEqual(s.setbacks, { s: 3, n: 1.5, e: 1.5, w: 1.5 });
  assert.deepEqual([s.afterSetbacks.width, s.afterSetbacks.depth, s.frontage, s.depth, s.coverageScale], [5, 25.5, 5, 25.5, 1]);
  const e = footprintDiagnostics(at('e', { width: 30, length: 9 }));
  assert.deepEqual([e.net.width, e.net.depth, e.frontage, e.depth], [25.5, 6, 6, 25.5], 'e/w entries swap frontage and depth');
  const c = footprintDiagnostics(at('s', { width: 40, length: 40, coverage: 0.1 }));
  assert.ok(c.coverageScale < 1 && Math.abs(c.net.area - 160) < 1e-9, 'coverage caps area at 10% of 1600 m2');
});

test('H07 failures explain entry, setbacks, coverage and frontage/depth; the 8 m plot limit is not raised', () => {
  assert.equal(MIN_WING_WIDTH, 7);
  assert.doesNotThrow(() => validatePlot(at('s', { width: 8, length: 30 })));
  const one = [{ name: 'مستودع', type: /** @type {const} */ ('storage'), area: 4, position: /** @type {const} */ ('middle'), side: /** @type {const} */ ('any') }];
  assert.throws(() => generateModel(at('s', { width: 8, length: 30 }), one), (e) => e instanceof Error
    && /^لم يجد/.test(e.message) && e.message.includes('واجهة البناء الصافية 5 م') && e.message.includes('جهة المدخل: جنوب')
    && e.message.includes('جنوب 3، شمال 1.5، شرق 1.5، غرب 1.5') && e.message.includes('نسبة البناء 75%'));
  assert.throws(() => generateModel(at('e', { width: 20, length: 30 }), defaultRooms()), (e) => e instanceof Error
    && /^لم يجد/.test(e.message) && e.message.includes('واجهة 27 م × عمق 15.5 م') && e.message.includes('228 م²'));
  assert.throws(() => generateModel(at('s', { width: 8, length: 8 }), defaultRooms()), (e) => e instanceof Error
    && /أكبر/.test(e.message) && e.message.includes('(228 م²)') && e.message.includes('الصافي'));
});

// ---------------------------------------------------------------------------------------
// Item 6 -- import-layer migration and reserved roof states
// ---------------------------------------------------------------------------------------
/** A v2.1.x stored U model: identical to today's except the courtyard has no roofPolicy. */
const legacyU = (entry = /** @type {'s'|'n'|'e'|'w'} */ ('s')) => { const m = clone(make('u', entry)); delete m.courtyards[0].roofPolicy; return m; };

test('H08 importModel upgrades a v2.1.x U model without touching anything else, and never mutates input', () => {
  for (const entry of ENTRIES) {
    const stored = legacyU(entry), before = JSON.stringify(stored);
    assert.ok(has(validateModel(stored), 'حالة تسقيف الفناء'), 'the validator is not weakened');
    const { model, applied } = importModel(stored);
    assert.deepEqual(applied, ['courtyards[0].roofPolicy = OPEN_TO_SKY (v2.1.x: roofable false)']);
    assert.deepStrictEqual(model, clone(make('u', entry)));
    assert.equal(JSON.stringify(stored), before);
  }
  assert.deepEqual(importModel(make('u')).applied, []);
  assert.deepEqual(importModel(make('rect')).applied, []);
});

test('H09 migration refuses to guess, and importModel still rejects invalid geometry', () => {
  const roofed = legacyU(); roofed.courtyards[0].roofable = true;
  assert.throws(() => migrateModel(roofed), /لا يمكن استنتاج/);
  const unknown = legacyU(); delete unknown.courtyards[0].roofable;
  assert.throws(() => migrateModel(unknown), /لا يمكن استنتاج/);
  // @ts-expect-error -- intentionally not a stored model
  for (const v of [null, [], 'x', { version: 1 }, { version: 3 }]) assert.throws(() => migrateModel(v), Error, JSON.stringify(v));
  const shifted = legacyU(); shifted.courtyards[0].x += 0.5;
  assert.throws(() => importModel(shifted), /النموذج المستورد غير صالح/);
});

test('H10 reserved roof states are schema-valid but not computed: quantities and pricing refuse them', () => {
  assert.deepEqual(Object.keys(ROOF_POLICY_SUPPORT), [...ROOF_POLICIES]);
  assert.ok(Object.isFrozen(ROOF_POLICY_SUPPORT) && Object.values(ROOF_POLICY_SUPPORT).every(Object.isFrozen));
  assert.deepEqual(Object.entries(ROOF_POLICY_SUPPORT).filter(([, v]) => v.status === 'implemented').map(([k]) => k), ['OPEN_TO_SKY']);
  for (const policy of ['PARTIALLY_COVERED', 'COVERED_ATRIUM']) {
    const m = make('u'); Object.assign(m.courtyards[0], { roofPolicy: policy, roofable: true });
    assert.deepEqual(validateModel(m), [], policy + ' stays schema-valid');
    assert.throws(() => quantities(m), /حساب الكميات غير منفذ/, policy);
    assert.throws(() => quantityRows(m), /حساب الكميات غير منفذ/, policy);
  }
  assert.throws(() => quantities(legacyU()), /حساب الكميات غير منفذ/, 'missing roofPolicy');
  for (const entry of ENTRIES) assert.equal(make('u', entry).courtyards[0].roofPolicy, 'OPEN_TO_SKY');
});
