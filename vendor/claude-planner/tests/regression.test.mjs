// regression.test.mjs -- Priority 7: boundaries, invalid shapes, fallback, courtyards/voids,
// deliberate model breakage, backward compatibility, schema lock, determinism, seeded fuzz.
// Every expectation here was first observed on the engine, then locked. A failing test means
// behaviour changed -- intended or not -- and must be reviewed, not re-baselined blindly.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateModel, plan, validateModel, validatePlot, normalizeRooms, defaultRooms, footprint,
  quantities, polygonArea, pointInPolygon, SHAPES, ROOF_POLICIES, normalizeShapeKey,
} from '../src/planner.mjs';
import { quantityRows, estimate } from '../src/estimates.mjs';

/**
 * @typedef {import('../src/PlannerOutputContract.mjs').PlotInput} PlotInput
 * @typedef {import('../src/PlannerOutputContract.mjs').RoomRequest} RoomRequest
 * @typedef {import('../src/PlannerOutputContract.mjs').Direction} Direction
 * @typedef {import('../src/PlannerOutputContract.mjs').ShapeKey} ShapeKey
 * @typedef {import('../src/PlannerOutputContract.mjs').Rect} Rect
 */
const E = 1e-6;
/** @type {Direction[]} */
const ENTRIES = ['s', 'n', 'e', 'w'];
/** @type {ShapeKey[]} */
const SHAPE_KEYS = ['rect', 'l', 'u'];
/** @type {Omit<PlotInput, 'width' | 'length'>} */
const base = { floors: 1, entry: 's', streets: { s: true } };
/** Callers always pass width and length in `extra`. @param {Direction} entry @param {Partial<PlotInput>} [extra] */
const at = (entry, extra = {}) => /** @type {PlotInput} */ ({ ...base, entry, streets: { [entry]: true }, ...extra });
const program = () => defaultRooms({ bedrooms: 4, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 });
/** @param {Partial<RoomRequest>} [patch] @returns {RoomRequest} */
const room = (patch = {}) => ({ name: 'فراغ', type: 'storage', area: 8, position: 'middle', side: 'any', ...patch });
const KNOWN_FAILURES = /لم يجد|أكبر|تعذر/;
/** @param {number} a @param {number} b @param {number} [tol] */
const close = (a, b, tol = E) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------------------
test('R01 validatePlot accepts every exact limit and rejects just beyond it', () => {
  const ok = { width: 30, length: 40 };
  const accept = [['width', 8], ['width', 100], ['length', 8], ['length', 100], ['floors', 1], ['floors', 3],
    ['streetSetback', 0], ['streetSetback', 15], ['neighborSetback', 0], ['neighborSetback', 15], ['coverage', 0.1], ['coverage', 0.9]];
  const reject = [['width', 7.999], ['width', 100.001], ['length', 7.999], ['length', 100.001], ['floors', 0], ['floors', 4],
    ['streetSetback', -0.001], ['streetSetback', 15.001], ['neighborSetback', 15.001], ['coverage', 0.0999], ['coverage', 0.9001]];
  for (const [k, v] of accept) assert.doesNotThrow(() => validatePlot(/** @type {PlotInput} */ ({ ...base, ...ok, [k]: v })), `${k}=${v} must be accepted`);
  for (const [k, v] of reject) assert.throws(() => validatePlot(/** @type {PlotInput} */ ({ ...base, ...ok, [k]: v })), Error, `${k}=${v} must be rejected`);
});

test('R02 a street flag counts only when exactly true, and the entry must face a street', () => {
  const p = { ...base, width: 30, length: 40 };
  // @ts-expect-error -- intentionally non-boolean street flags: each must be rejected at runtime
  for (const streets of [{ s: 1 }, { s: 'true' }, { s: {} }, { n: true }, {}]) assert.throws(() => validatePlot({ ...p, streets }), Error, JSON.stringify(streets));
  assert.doesNotThrow(() => validatePlot({ ...p, entry: 'n', streets: { n: true, s: false } }));
});

test('R03 room program limits: area 4..120, name <= 70 chars, 1..30 rooms', () => {
  for (const area of [4, 120]) assert.doesNotThrow(() => normalizeRooms([room({ area })]));
  for (const area of [3.999, 120.001, -4, Infinity]) assert.throws(() => normalizeRooms([room({ area })]), Error, 'area ' + area);
  assert.doesNotThrow(() => normalizeRooms([room({ name: 'ن'.repeat(70) })]));
  assert.throws(() => normalizeRooms([room({ name: '   ' })]));
  assert.equal(normalizeRooms(Array.from({ length: 30 }, () => room())).length, 30);
  assert.throws(() => normalizeRooms(Array.from({ length: 31 }, () => room())));
});

test('R04 minimum buildable width is 7.0 m: below it every program fails cleanly, at it a model is produced', () => {
  // Default setbacks 3 (street) / 1.5 (neighbour): plot 10 m -> footprint exactly 7.00 m.
  assert.equal(footprint({ ...base, width: 10, length: 30 }).w, 7);
  const m = generateModel({ ...base, width: 10, length: 30 }, [room({ area: 4 })]);
  assert.deepEqual(validateModel(m), []);
  for (const width of [8, 9, 9.5]) {
    assert.throws(() => generateModel({ ...base, width, length: 30 }, [room({ area: 4 })]), (e) => e instanceof Error && KNOWN_FAILURES.test(e.message), 'width ' + width);
  }
});

// ---------------------------------------------------------------------------------------
// Invalid shape keys
// ---------------------------------------------------------------------------------------
test('R05 shape keys: case/space-normalised, unsupported rejected explicitly, prototype-safe, fallback after normalisation', () => {
  // v2.2.0 locked 'U' -> rect (silent). That recorded a defect; changed on review (batch v2.2.1).
  for (const [input, expected] of [[' U ', 'u'], ['U', 'u'], ['u', 'u'], ['\tL\n', 'l'], ['RECT', 'rect'], [' rect ', 'rect']]) {
    const m = generateModel({ ...base, width: 35, length: 45, shape: input }, program());
    assert.equal(m.shape, expected, JSON.stringify(input)); assert.equal(m.shapeFallback, false); assert.deepEqual(validateModel(m), []);
  }
  for (const input of [undefined, null, '', '   ']) assert.equal(generateModel({ ...base, width: 30, length: 40, shape: input }, program()).shape, 'rect', JSON.stringify(input));
  for (const input of ['x', 'Rect2', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 5, {}]) {
    // @ts-expect-error -- intentionally unsupported shape values (numbers, objects): must be rejected at runtime
    assert.throws(() => generateModel({ ...base, width: 30, length: 40, shape: input }, program()), /شكل المبنى غير مدعوم/, String(input));
    assert.throws(() => normalizeShapeKey(input), /شكل المبنى غير مدعوم/);
  }
  assert.deepEqual(Object.keys(SHAPES), SHAPE_KEYS);
  assert.equal(/** @type {Record<string, unknown>} */ ({}).rect, undefined);
  const backOnly = [room({ type: 'bedroom', area: 20, position: 'back' }), room({ type: 'bedroom', area: 20, position: 'back' })];
  for (const input of [' U ', 'L ', 'U']) {
    const m = generateModel({ ...base, width: 30, length: 40, shape: input }, backOnly);
    assert.equal(m.shape, 'rect'); assert.equal(m.shapeFallback, true, JSON.stringify(input));
    assert.equal(m.warnings.filter(w => w.startsWith('تعذّر')).length, 1);
  }
});

// ---------------------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------------------
test('R06 L and U fall back to a valid rect, flagged, with exactly one fallback warning', () => {
  const backOnly = [room({ type: 'bedroom', area: 20, position: 'back' }), room({ type: 'bedroom', area: 20, position: 'back' })];
  for (const shape of /** @type {('l'|'u')[]} */ (['l', 'u'])) for (const entry of ENTRIES) {
    const m = generateModel(at(entry, { width: 30, length: 40, shape }), backOnly);
    assert.equal(m.shape, 'rect'); assert.equal(m.shapeFallback, true);
    assert.equal(m.warnings.filter(w => w.includes(SHAPES[shape])).length, 1, `${shape}/${entry} fallback warnings`);
    assert.equal(m.courtyards.length, 0);
    assert.deepEqual(validateModel(m), []);
  }
});

test('R07 when the shape and the rect fallback both fail: a clean Error, inputs untouched', () => {
  for (const shape of SHAPE_KEYS) {
    const p = { ...base, width: 16, length: 30, shape }, rooms = defaultRooms(), before = structuredClone([p, rooms]);
    assert.throws(() => generateModel(p, rooms), (e) => e instanceof Error && KNOWN_FAILURES.test(e.message), shape);
    assert.deepEqual([p, rooms], before);
  }
});

test('R08 a rect request never reports a fallback', () => {
    // Plot sizes chosen to fit the 12-room program for all four entries (20x30 does not fit e/w:
  // the local depth drops to ~13 m -- a genuine capacity limit, not a fallback case).
  for (const entry of ENTRIES) for (const [width, length] of [[40, 30], [30, 40], [60, 45]]) {
    const m = generateModel(at(entry, { width, length, shape: 'rect' }), program());
    assert.equal(m.shapeFallback, false); assert.equal(m.warnings.some(w => w.includes('تعذّر')), false);
  }
});

// ---------------------------------------------------------------------------------------
// Courtyards / voids
// ---------------------------------------------------------------------------------------
test('R09 U courtyard is the polygon notch: its 4 corners are footprint vertices, open on the entry side', () => {
  for (const entry of ENTRIES) for (const [width, length] of [[35, 45], [45, 35], [60, 60]]) {
    const m = generateModel(at(entry, { width, length, shape: 'u' }), program());
    assert.equal(m.shape, 'u', `${entry} ${width}x${length}`);
    const [c] = m.courtyards, b = m.boundingBox, poly = m.buildingFootprint;
    const corners = [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]];
    for (const [x, y] of corners) assert.ok(poly.some(p => close(p.x, x) && close(p.y, y)), `corner ${x},${y} not a vertex (${entry})`);
    assert.equal(pointInPolygon(poly, { x: c.x + c.w / 2, y: c.y + c.h / 2 }), false, 'courtyard centre must be outside the built polygon');
    assert.ok(c.x >= b.x - E && c.y >= b.y - E && c.x + c.w <= b.x + b.w + E && c.y + c.h <= b.y + b.h + E, 'courtyard inside bounding box');
    const openEdge = { s: close(c.y, b.y), n: close(c.y + c.h, b.y + b.h), w: close(c.x, b.x), e: close(c.x + c.w, b.x + b.w) };
    assert.equal(openEdge[entry], true, `courtyard must open on the ${entry} (entry) edge`);
    assert.ok(close(polygonArea(poly) + c.w * c.h, b.w * b.h, 1e-6), 'polygon + courtyard = bounding box');
  }
});

test('R10 every U courtyard is emitted OPEN_TO_SKY with roofable false', () => {
  assert.deepEqual([...ROOF_POLICIES], ['OPEN_TO_SKY', 'PARTIALLY_COVERED', 'COVERED_ATRIUM']);
  assert.ok(Object.isFrozen(ROOF_POLICIES));
  for (const entry of ENTRIES) {
    const [c] = generateModel(at(entry, { width: 35, length: 45, shape: 'u' }), program()).courtyards;
    assert.equal(c.roofPolicy, 'OPEN_TO_SKY'); assert.equal(c.roofable, false);
  }
});

// ---------------------------------------------------------------------------------------
// Deliberate breakage: validateModel must catch each one
// ---------------------------------------------------------------------------------------
const uModel = () => generateModel({ ...base, width: 35, length: 45, shape: 'u' }, program());
/** @param {string[]} errors @param {string} prefix */
const hasError = (errors, prefix) => errors.some(e => e.startsWith(prefix));

test('R11 validateModel rejects a room or corridor moved into the courtyard', () => {
  const m1 = uModel(), c1 = m1.courtyards[0];
  Object.assign(m1.rooms[0], { x: c1.x + 0.2, y: c1.y + 0.2 });
  assert.ok(hasError(validateModel(m1), 'غرفة تقع داخل الفناء'));
  const m2 = uModel(), c2 = m2.courtyards[0];
  Object.assign(m2.corridors[0], { x: c2.x + 0.2, y: c2.y + 0.2, w: 1.6, h: 2 });
  assert.ok(hasError(validateModel(m2), 'ممر يعبر الفناء'));
});

test('R12 validateModel rejects a building outline that leaves the buildable footprint', () => {
  for (const shape of SHAPE_KEYS) {
    const m = generateModel({ ...base, width: 35, length: 45, shape }, program());
    m.buildingFootprint[0] = { x: m.footprint.x - 1, y: m.footprint.y - 1 };
    assert.ok(hasError(validateModel(m), 'كتلة المبنى تتجاوز'), shape);
  }
});

test('R13 roofPolicy: inconsistent or unknown states are rejected; reserved states are schema-valid', () => {
  const msg = 'حالة تسقيف الفناء';
  const m1 = uModel(); m1.courtyards[0].roofable = true;
  assert.ok(hasError(validateModel(m1), msg), 'OPEN_TO_SKY with roofable true');
  // @ts-expect-error -- intentionally unknown roofPolicy
  const m2 = uModel(); m2.courtyards[0].roofPolicy = 'ROOF';
  assert.ok(hasError(validateModel(m2), msg), 'unknown policy');
  for (const policy of ['PARTIALLY_COVERED', 'COVERED_ATRIUM']) {
    const m = uModel(); Object.assign(m.courtyards[0], { roofPolicy: policy, roofable: true });
    assert.deepEqual(validateModel(m), [], policy + ' + roofable true must be valid');
    Object.assign(m.courtyards[0], { roofable: false });
    assert.ok(hasError(validateModel(m), msg), policy + ' + roofable false must be rejected');
  }
});

// ---------------------------------------------------------------------------------------
// Backward compatibility and schema lock
// ---------------------------------------------------------------------------------------
const MODEL_KEYS = ['boundingBox', 'building', 'buildingFootprint', 'corridors', 'courtyards', 'drawnFloors', 'footprint', 'links',
  'openings', 'plot', 'program', 'reserves', 'rooms', 'shape', 'shapeFallback', 'version', 'walls', 'warnings'];

test('R14 v1 surface preserved: building == boundingBox, version 2, plan alias, stable ids', () => {
  assert.equal(plan, generateModel);
  for (const shape of SHAPE_KEYS) for (const entry of ENTRIES) {
    const rooms = program(), m = generateModel(at(entry, { width: 35, length: 45, shape }), rooms);
    assert.equal(m.version, 2);
    for (const k of /** @type {(keyof Rect)[]} */ (['x', 'y', 'w', 'h'])) assert.ok(close(m.building[k], m.boundingBox[k], 1e-9), `${shape}/${entry} building.${k}`);
    assert.deepEqual(m.rooms.map(r => r.id).sort(), rooms.map((_, i) => 'room-' + i).sort());
    assert.deepEqual(m.program.map(r => r.id), rooms.map((_, i) => 'room-' + i));
    if (m.shape === 'rect') assert.ok(m.corridors.some(c => c.id === 'spine'), 'rect keeps v1 corridor id "spine"');
  }
});

test('R15 schema lock: model and courtyard carry exactly the contract fields', () => {
  for (const shape of SHAPE_KEYS) {
    const m = generateModel({ ...base, width: 35, length: 45, shape }, program());
    assert.deepEqual(Object.keys(m).sort(), MODEL_KEYS, shape + ': a field was added or removed -- update the Contract first');
    m.courtyards.forEach(c => assert.deepEqual(Object.keys(c).sort(), ['h', 'name', 'roofPolicy', 'roofable', 'w', 'x', 'y']));
    m.openings.forEach(o => {
      const allowed = ['connects', 'h', 'id', 'pos', 'roomId', 'sill', 'type', 'w', 'wallId'];
      Object.keys(o).forEach(k => assert.ok(allowed.includes(k), 'unexpected opening field ' + k));
    });
    m.rooms.forEach(r => assert.ok(['resolvedSide', 'corridorId', 'doorSide', 'targetArea'].every(k => k in r)));
  }
});

// ---------------------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------------------
test('R16 deterministic across shapes, entries and interleaved calls (no hidden state)', () => {
  /** @param {ShapeKey} shape @param {Direction} entry */
  const snap = (shape, entry) => JSON.stringify(generateModel(at(entry, { width: 35, length: 45, shape }), program()));
  const first = Object.fromEntries(SHAPE_KEYS.flatMap(s => ENTRIES.map(e => [s + e, snap(s, e)])));
  for (const key of ['us', 'rects', 'le', 'un', 'rectw', 'us', 'ln']) {
    const shape = key.slice(0, -1), entry = key.slice(-1);
    assert.equal(snap(/** @type {ShapeKey} */ (shape), /** @type {Direction} */ (entry)), first[key], key + ' changed after other generations');
  }
});

// ---------------------------------------------------------------------------------------
// Seeded fuzz: every outcome is either a clean known Error or a fully valid model
// ---------------------------------------------------------------------------------------
test('R17 seeded fuzz (150 cases): clean failure or fully valid model, never anything in between', () => {
  let seed = 20260923;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  /** @template T @param {readonly T[]} list @returns {T} */
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  /** @type {import('../src/PlannerOutputContract.mjs').RoomType[]} */
  const types = ['bedroom', 'majlis', 'living', 'dining', 'kitchen', 'bath', 'storage', 'service'];
  let valid = 0, failed = 0;
  for (let k = 0; k < 150; k++) {
    const entry = pick(ENTRIES), shape = pick(SHAPE_KEYS);
    const p = at(entry, { shape, width: 12 + Math.round(rnd() * 50), length: 12 + Math.round(rnd() * 50), floors: 1 + Math.floor(rnd() * 3) });
    const rooms = Array.from({ length: 1 + Math.floor(rnd() * 14) }, (_, i) => room({
      name: 'ف' + i, type: pick(types), area: 4 + Math.round(rnd() * 36), position: pick(/** @type {const} */ (['front', 'middle', 'back'])), side: pick(/** @type {const} */ (['any', 'any', 'left', 'right'])),
    }));
    const before = JSON.stringify([p, rooms]);
    let m;
    try { m = generateModel(p, rooms); } catch (e) {
      assert.ok(e instanceof Error && KNOWN_FAILURES.test(e.message), `case ${k}: unexpected failure: ${e}`); failed++;
      assert.equal(JSON.stringify([p, rooms]), before, `case ${k}: input mutated on failure`);
      continue;
    }
    valid++;
    assert.equal(JSON.stringify([p, rooms]), before, `case ${k}: input mutated`);
    assert.deepEqual(validateModel(m), [], `case ${k}`);
    assert.equal(m.rooms.length, rooms.length, `case ${k}: room count`);
    m.rooms.forEach(r => assert.ok(close(r.w * r.h, r.targetArea, 1e-5), `case ${k}: area of ${r.name}`));
    assert.ok(m.shape === shape || (m.shape === 'rect' && m.shapeFallback), `case ${k}: ${shape} -> ${m.shape} without fallback flag`);
    const q = quantities(m);
    assert.ok(q.footprint > 0 && q.rooms <= q.footprint + E, `case ${k}: quantities`);
  }
  assert.ok(valid >= 40 && failed >= 10, `fuzz must exercise both paths (valid ${valid}, failed ${failed})`);
});

// ---------------------------------------------------------------------------------------
// Estimates boundaries
// ---------------------------------------------------------------------------------------
test('R18 estimate: reserve 0..50 and VAT 0..30 inclusive; negative rate rejected; blank rate is unpriced, not zero', () => {
  const rows = quantityRows(generateModel({ ...base, width: 30, length: 40 }, program()));
  for (const [reserve, vat] of [[0, 0], [50, 30]]) assert.doesNotThrow(() => estimate(rows, {}, reserve, vat));
  for (const [reserve, vat] of [[50.01, 15], [-0.01, 15], [10, 30.01], [10, -1], [NaN, 15]]) assert.throws(() => estimate(rows, {}, reserve, vat), Error, `${reserve}/${vat}`);
  assert.throws(() => estimate(rows, { walls: -1 }, 10, 15));
  const r = estimate(rows, { walls: 0, paint: '' }, 0, 0);
  assert.equal(r.priced, 1); assert.equal(r.unpriced, rows.length - 1); assert.equal(r.grand, 0);
});
