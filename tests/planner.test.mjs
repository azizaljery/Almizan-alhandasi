import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, generateModel, validateModel, validatePlot, normalizeRooms, quantities, wallPieces, openingPoint, overlap } from '../dist/planner.mjs';
import { quantityRows, estimate } from '../dist/estimates.mjs';

const plot = { width: 20, length: 30, floors: 2, entry: 's', streets: { s: true } };
const build = (p = plot, rooms = defaultRooms()) => generateModel(p, rooms);
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('default program preserves all 12 requested rooms and exact clear floor areas', () => {
  const m = build(); assert.equal(m.rooms.length, 12); assert.deepEqual(validateModel(m), []);
  const targets = normalizeRooms(defaultRooms());
  m.rooms.forEach(r => { const t = targets.find(t => t.id === r.id); near(r.w * r.h, t.area); assert.equal(r.position, t.position); });
  near(quantities(m).rooms, 228);
  m.rooms.forEach((a, i) => m.rooms.slice(i + 1).forEach(b => assert.equal(overlap(a, b), false)));
  assert.equal(m.openings.filter(o => o.type === 'door').length, 13);
});

test('same requirements produce the same model; generation does not mutate inputs', () => {
  const rooms = defaultRooms(), before = JSON.stringify([plot, rooms]), a = build(plot, rooms), b = build(plot, rooms);
  assert.deepEqual(a, b); assert.equal(JSON.stringify([plot, rooms]), before);
});

test('front/back and fixed left/right rotate consistently for all four entry directions', () => {
  for (const entry of ['s', 'n', 'e', 'w']) {
    const m = build({ ...plot, width: 30, length: 30, entry, streets: { [entry]: true } });
    assert.deepEqual(validateModel(m), []);
    const toLocal = r => {
      const x = r.x + r.w / 2, y = r.y + r.h / 2;
      return entry === 's' ? [x, y] : entry === 'n' ? [-x, -y] : entry === 'e' ? [y, -x] : [-y, x];
    };
    const left = m.rooms.find(r => r.side === 'left'), right = m.rooms.find(r => r.side === 'right');
    assert.ok(toLocal(left)[0] < toLocal(right)[0]);
    const front = m.rooms.filter(r => r.position === 'front').map(r => toLocal(r)[1]), back = m.rooms.filter(r => r.position === 'back').map(r => toLocal(r)[1]);
    assert.ok(Math.max(...front) < Math.min(...back));
    const e = openingPoint(m, m.openings.find(o => o.connects?.includes('outside')));
    if (entry === 's') near(e.y, m.building.y + .125);
    if (entry === 'n') near(e.y, m.building.y + m.building.h - .125);
    if (entry === 'w') near(e.x, m.building.x + .125);
    if (entry === 'e') near(e.x, m.building.x + m.building.w - .125);
  }
});

test('rejects invalid dimensions, streets, counts, floor counts and unbounded programs', () => {
  for (const patch of [{ width: 0 }, { length: Infinity }, { width: 101 }, { floors: 1.5 }, { floors: 4 }, { streets: {} }, { coverage: NaN }, { neighborSetback: -1 }]) assert.throws(() => validatePlot({ ...plot, ...patch }));
  for (const count of [-1, 1.1, 11, NaN]) assert.throws(() => defaultRooms({ bedrooms: count }));
  assert.throws(() => normalizeRooms([])); assert.throws(() => normalizeRooms(Array.from({ length: 31 }, () => defaultRooms()[0])));
  for (const patch of [{ type: '__proto__' }, { area: NaN }, { area: 3 }, { area: 121 }, { name: '' }, { name: 'ن'.repeat(71) }, { position: 'upstairs' }, { side: 'roof' }]) assert.throws(() => normalizeRooms([{ ...defaultRooms()[0], ...patch }]));
});

test('an infeasible small plot fails without shrinking or removing requested rooms', () => {
  const rooms = defaultRooms(), before = structuredClone(rooms);
  assert.throws(() => build({ ...plot, width: 8, length: 8 }, rooms), /أكبر|لم يجد/); assert.deepEqual(rooms, before);
  assert.throws(() => build({ ...plot, streetSetback: 15, neighborSetback: 15 }), /أكبر|لم يجد/);
});

test('supports all 30 bounded rooms and a small explicit program', () => {
  const rooms = defaultRooms({ bedrooms: 10, majlis: 5, baths: 10, kitchens: 1, halls: 2, dining: 2 });
  const m = build({ ...plot, width: 50, length: 60 }, rooms);
  assert.equal(m.rooms.length, 30); assert.deepEqual(validateModel(m), []);
  const small = build(plot, [{ name: 'مستودع', type: 'storage', area: 12, position: 'front', side: 'left' }]);
  assert.equal(small.rooms.length, 1); near(small.rooms[0].w * small.rooms[0].h, 12);
});

test('door reachability is physical, not merely a graph label', () => {
  const a = build(); a.openings = a.openings.filter(o => o.roomId !== a.rooms[0].id || o.type !== 'door'); assert.ok(validateModel(a).some(e => e.includes('مسار')));
  const b = build(), d = b.openings.find(o => o.roomId && o.type === 'door'); d.connects = [b.rooms.find(r => r.id !== d.roomId).id, 'spine']; assert.ok(validateModel(b).some(e => e.includes('فعلياً')));
  const c = build(); c.corridors.find(r => r.id !== 'spine').x += 10; assert.ok(validateModel(c).length);
});

test('detects walls crossing rooms or corridors, invalid openings and overlaps', () => {
  const a = build(), r = a.rooms[0]; a.walls.push({ id: 'bad', type: 'int', t: .15, h: 3.2, x1: r.x + r.w / 2, x2: r.x + r.w / 2, y1: r.y, y2: r.y + r.h }); assert.ok(validateModel(a).some(e => e.includes('يقطع')));
  const b = build(), c = b.corridors[0]; b.walls.push({ id: 'bad', type: 'int', t: .15, h: 3.2, x1: c.x, x2: c.x + c.w, y1: c.y + .6, y2: c.y + .6 }); assert.ok(validateModel(b).some(e => e.includes('يعوق')));
  const d = build(); d.openings[0].w = 100; assert.ok(validateModel(d).length);
  const e = build(); e.openings.push({ ...e.openings[0], id: 'copy' }); assert.ok(validateModel(e).some(s => s.includes('متداخلة')));
  const f = build(); f.openings[0].wallId = 'missing'; assert.ok(validateModel(f).some(s => s.includes('غير صالحة')));
});

test('shared collinear walls are deduplicated and window openings are exterior', () => {
  const m = build();
  for (let i = 0; i < m.walls.length; i++) for (const b of m.walls.slice(i + 1)) {
    const a = m.walls[i];
    if (a.x1 === a.x2 && b.x1 === b.x2 && Math.abs(a.x1 - b.x1) < 1e-5) assert.ok(Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2)) < 1e-5);
    if (a.y1 === a.y2 && b.y1 === b.y2 && Math.abs(a.y1 - b.y1) < 1e-5) assert.ok(Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)) < 1e-5);
  }
  m.openings.filter(o => o.type === 'window').forEach(o => assert.equal(m.walls.find(w => w.id === o.wallId).type, 'ext'));
});

test('3D wall pieces and quantities subtract the same openings and do not multiply undrawn floors', () => {
  const m = build(), q = quantities(m);
  const gross = m.walls.reduce((s, w) => s + Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * w.h, 0);
  const openingArea = m.openings.reduce((s, o) => s + o.w * o.h, 0);
  near(q.wallArea, gross - openingArea);
  near(q.wallArea, wallPieces(m).reduce((s, p) => s + p.length * p.height, 0));
  assert.deepEqual(q, quantities(build({ ...plot, floors: 3 })));
  assert.equal(q.floors, 1); assert.ok(m.warnings.some(s => s.includes('الأرضي فقط')));
});

test('estimates distinguish unpriced from zero rates and compute a partial total transparently', () => {
  const rows = quantityRows(build()); assert.equal(estimate(rows, {}, 7, 15).priced, 0);
  const e = estimate(rows, { doors: 800 }, 7, 15); assert.equal(e.unpriced, 5); near(e.subtotal, 13 * 800); near(e.grand, 13 * 800 * 1.07 * 1.15);
  const zero = estimate(rows, { doors: 0 }, 0, 0); assert.equal(zero.priced, 1); assert.equal(zero.grand, 0);
  assert.throws(() => estimate(rows, { doors: -1 }, 0, 0)); assert.throws(() => estimate(rows, { paint: NaN }, 0, 0)); assert.throws(() => estimate(rows, {}, NaN, 0));
});

test('varied bounded programs either validate or return an explicit fit failure', () => {
  let accepted = 0;
  for (let k = 0; k < 50; k++) {
    const entry = ['s', 'n', 'e', 'w'][k % 4], p = { ...plot, width: 20 + k % 7, length: 28 + k % 11, entry, streets: { [entry]: true } };
    const rooms = defaultRooms({ bedrooms: 1 + k % 5, majlis: k % 3, baths: 1 + k % 4, kitchens: 1, halls: 1, dining: k % 2 });
    try { const m = build(p, rooms); assert.deepEqual(validateModel(m), []); accepted++; }
    catch (e) { assert.match(e.message, /لم يجد|أكبر/); }
  }
  assert.ok(accepted >= 40);
});
