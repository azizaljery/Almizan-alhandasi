import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { reviewDoc, suggestRoomType, GUIDELINES, GUIDE_NOTE, RULES, swingSectors } from '../dist/draw/review.mjs';
import { digestDoc, analyzeDoc } from '../dist/draw/digest.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import * as C from './fixtures/draw-cases.mjs';

const villa = sampleVilla();
const codes = issues => issues.map(i => i.code);
const find = (issues, code) => issues.filter(i => i.code === code);
const applyFix = (doc, issue) => issue.fix.commands.reduce((d, c) => applyCommand(d, c).doc, doc);

test('every issue has the documented shape, Arabic text and a verified fix (or none)', () => {
  const all = [C.gapDoc(), C.stubDoc(), C.windowlessBedroom(), C.tinyBath(), C.blockedSwing(), C.unlabelledKitchen(), C.orphanAndDuplicate(), villa].flatMap(d => reviewDoc(d).map(i => ({ d, i })));
  assert.ok(all.length > 10);
  const ids = new Set();
  for (const { d, i } of all) {
    assert.ok(['error', 'warning', 'info'].includes(i.severity)); assert.ok(RULES[i.code], i.code);
    assert.match(i.message, /[؀-ۿ]/); assert.ok(Array.isArray(i.targetIds));
    if (i.fix) { assert.match(i.fix.label, /[؀-ۿ]/); assert.ok(i.fix.commands.length); applyFix(d, i); }
    ids.add(i.id);
  }
  assert.ok(ids.size > 5);
});

test('every design message says it is a guideline from the catalog, not a legal requirement; none invents a regulation', () => {
  const issues = [C.windowlessBedroom(), C.tinyBath(), C.blockedSwing(), C.narrowCorridor(), C.thinExterior(), villa].flatMap(d => reviewDoc(d));
  for (const i of issues) {
    if (RULES[i.code].integrity) continue;
    assert.ok(i.message.endsWith(GUIDE_NOTE), i.code + ': ' + i.message);
    assert.ok(!/كود|نظام البناء|المادة|لائحة|بلدية|وفق\s+ال?اشتراطات/.test(i.message.replace(GUIDE_NOTE, '')), 'no regulatory claim: ' + i.message);
  }
  assert.match(GUIDE_NOTE, /إرشاد/); assert.match(GUIDE_NOTE, /ليس اشتراطًا نظاميًا/);
});

test('unclosed wall gap: error with a close-gap fix that really closes the room', () => {
  const d = C.gapDoc(), gap = find(reviewDoc(d), 'GAP');
  assert.equal(gap.length, 1); assert.equal(gap[0].severity, 'error'); assert.equal(gap[0].fix.commands[0].type, 'close-gap');
  const fixed = applyFix(d, gap[0]);
  assert.equal(digestDoc(fixed).levels[0].rooms.length, 1);
  assert.deepEqual(find(reviewDoc(fixed), 'GAP'), []);
});

test('dangling stub is reported; its removal fix deletes only the stub wall', () => {
  const d = C.stubDoc(), stub = find(reviewDoc(d), 'STUB');
  assert.equal(stub.length, 1); assert.equal(stub[0].fix.commands[0].type, 'delete');
  const fixed = applyFix(d, stub[0]);
  assert.equal(fixed.walls.length, d.walls.length - 1); assert.deepEqual(find(reviewDoc(fixed), 'STUB'), []);
});

test('unlabelled room suggests a type from its fixtures and offers an add-label fix', () => {
  const d = C.unlabelledKitchen(), issue = find(reviewDoc(d), 'UNLABELLED_ROOM')[0];
  assert.ok(issue); assert.match(issue.message, /مطبخ/);
  assert.equal(issue.fix.commands[0].type, 'add-label'); assert.equal(issue.fix.commands[0].roomType, 'kitchen');
  assert.deepEqual(find(reviewDoc(applyFix(d, issue)), 'UNLABELLED_ROOM'), []);
});

test('orphan and duplicate labels', () => {
  const issues = reviewDoc(C.orphanAndDuplicate());
  assert.equal(find(issues, 'ORPHAN_LABEL').length, 1); assert.equal(find(issues, 'DUPLICATE_LABEL').length, 1);
  assert.equal(find(issues, 'DUPLICATE_LABEL')[0].fix.commands[0].ids.length, 1, 'keeps the first label');
});

test('no entrance door; entrance not flagged; unreachable room', () => {
  assert.ok(codes(reviewDoc(C.noEntry())).includes('NO_ENTRY'));
  assert.ok(!codes(reviewDoc(C.oneRoom())).includes('NO_ENTRY'));
  let d = C.oneRoom({ door: false });
  d = C.open(d, 2.5, 0, 'door'); // a door to the outdoors that is not flagged as the entry
  const un = find(reviewDoc(d), 'ENTRY_UNFLAGGED')[0];
  assert.ok(un); assert.equal(un.fix.commands[0].patch.entry, true);
  const ur = find(reviewDoc(C.unreachableRoom()), 'UNREACHABLE_ROOM');
  assert.equal(ur.length, 1); assert.match(ur[0].message, /غرفة نوم/);
  assert.deepEqual(find(reviewDoc(C.twoRooms({ doorBetween: true })), 'UNREACHABLE_ROOM'), []);
  assert.ok(find(reviewDoc(villa), 'UNREACHABLE_ROOM').some(i => i.targetIds[0] === 'r7'), 'the villa laundry has no door');
});

test('habitable room without window (catalog windowRequired) gets an add-opening fix on its longest exterior wall', () => {
  const d = C.windowlessBedroom(), issue = find(reviewDoc(d), 'NO_WINDOW')[0];
  assert.ok(issue); assert.equal(issue.fix.commands[0].type, 'add-opening'); assert.equal(issue.fix.commands[0].kind, 'window');
  assert.deepEqual(find(reviewDoc(applyFix(d, issue)), 'NO_WINDOW'), []);
  assert.deepEqual(find(reviewDoc(C.tinyBath()), 'NO_WINDOW'), [], 'bath: windowRequired=false in the catalog');
});

test('window area under the guideline ratio is flagged as guidance, with the ratio stated', () => {
  const d = C.oneRoom({ type: 'living', name: 'صالة', w: 8, l: 8, window: false });
  const small = C.run(C.open(d, 4, 8, 'window', { w: 0.5 }));
  const issue = find(reviewDoc(small), 'WINDOW_RATIO')[0];
  assert.ok(issue); assert.equal(issue.severity, 'info'); assert.match(issue.message, /إرشادي/); assert.match(issue.message, new RegExp(String(GUIDELINES.windowToFloor * 100)));
  assert.deepEqual(find(reviewDoc(small, { thresholds: { windowToFloor: 0.001 } }), 'WINDOW_RATIO'), [], 'thresholds can be overridden');
});

test('room under catalog min area / min width', () => {
  const issues = reviewDoc(C.tinyBath());
  assert.equal(find(issues, 'MIN_AREA').length, 1); assert.equal(find(issues, 'MIN_WIDTH').length, 1);
  assert.match(find(issues, 'MIN_AREA')[0].message, /2\.5/);
  assert.deepEqual(find(reviewDoc(C.oneRoom({ type: 'bedroom', w: 4, l: 4 })), 'MIN_AREA'), []);
});

test('corridor narrower than the catalog corridor width', () => {
  const issue = find(reviewDoc(C.narrowCorridor()), 'CORRIDOR_NARROW');
  assert.equal(issue.length, 1); assert.match(issue[0].message, /1/);
  assert.equal(find(reviewDoc(C.narrowCorridor()), 'MIN_WIDTH').length, 0, 'reported once, under the corridor rule');
});

test('bathroom door opening straight onto the majlis is a privacy warning', () => {
  const issue = find(reviewDoc(C.bathOffMajlis()), 'BATH_PRIVACY');
  assert.equal(issue.length, 1); assert.equal(issue[0].severity, 'warning');
  assert.equal(find(reviewDoc(villa), 'BATH_PRIVACY').length, 2, 'villa: bath opens onto the living room and the kitchen');
});

test('a bedroom door in line with the entrance door is an info-level privacy note', () => {
  const issue = find(reviewDoc(C.bedroomFacingEntry()), 'BEDROOM_FROM_ENTRY');
  assert.equal(issue.length, 1); assert.equal(issue[0].severity, 'info');
  assert.deepEqual(find(reviewDoc(villa), 'BEDROOM_FROM_ENTRY'), []);
});

test('SWING CONVENTION: swing "in" opens to the left of a->b, hinge "left" is the end nearest a', () => {
  const m = analyzeDoc(C.blockedSwing()), op = m.levels[0].openings.find(o => o.door);
  const [sec] = swingSectors(op);
  assert.equal(op.wall.a.x < op.wall.b.x, true, 'south wall runs west to east');
  assert.ok(Math.abs(sec.hinge.x - (2 - 0.45)) < 1e-9 && sec.hinge.y === 0, 'hinge left = west end of the opening');
  assert.ok(Math.abs(sec.side.x) < 1e-12 && sec.side.y === 1, 'in = +y = left of a->b = room interior for a counter-clockwise shell');
  const flipped = swingSectors({ ...op, o: { ...op.o, swing: 'out', hinge: 'right' } })[0];
  assert.ok(Math.abs(flipped.hinge.x - 2.45) < 1e-9 && flipped.side.y === -1 && flipped.closed.x === -1);
});

test('door swing blocked by a fixture: reported with a fix that flips it clear', () => {
  const d = C.blockedSwing(), issue = find(reviewDoc(d), 'SWING_BLOCKED');
  assert.equal(issue.length, 1); assert.ok(issue[0].targetIds.includes('f1'));
  assert.ok(issue[0].fix); assert.equal(issue[0].fix.commands[0].type, 'flip-opening');
  assert.deepEqual(find(reviewDoc(applyFix(d, issue[0])), 'SWING_BLOCKED'), []);
});

test('door swing blocked by a wall and by another door swing', () => {
  const w = find(reviewDoc(C.doorIntoWall()), 'SWING_BLOCKED');
  assert.equal(w.length, 1); assert.ok(w[0].targetIds.some(id => id.startsWith('w')));
  const two = find(reviewDoc(C.collidingDoors()), 'SWING_BLOCKED');
  assert.equal(two.length, 1, 'a colliding pair is reported once'); assert.equal(two[0].targetIds.filter(id => id.startsWith('o')).length, 2);
  assert.deepEqual(find(reviewDoc(C.oneRoom()), 'SWING_BLOCKED'), []);
});

test('overlapping fixtures and a fixture outside any room', () => {
  assert.equal(find(reviewDoc(C.overlappingFixtures()), 'FIXTURE_OVERLAP').length, 1);
  assert.equal(find(reviewDoc(C.fixtureOutside()), 'FIXTURE_OUTSIDE').length, 1);
  assert.deepEqual(find(reviewDoc(C.oneRoom()), 'FIXTURE_OVERLAP'), []);
  assert.deepEqual(find(reviewDoc(villa), 'FIXTURE_OVERLAP'), [], 'rugs and coffee tables sit on purpose among the sofas');
});

test('stairs: narrow (catalog 1.0 m) and too short for the level height (guidance only)', () => {
  const narrow = find(reviewDoc(C.stairCase({ w: 0.8, run: 4.5 })), 'STAIR_NARROW');
  assert.equal(narrow.length, 1); assert.equal(narrow[0].fix.commands[0].patch.w, 1);
  const short = find(reviewDoc(C.stairCase({ w: 1.1, run: 2 })), 'STAIR_STEPS');
  assert.equal(short.length, 1); assert.equal(short[0].severity, 'info'); assert.match(short[0].message, /إرشادية/); assert.match(short[0].message, /قصير/);
  assert.deepEqual(find(reviewDoc(C.stairCase({ w: 1.1, run: 4.6 })), 'STAIR_STEPS'), [], 'a run that gives treads in the typical range passes');
  const long = find(reviewDoc(C.stairCase({ w: 1.1, run: 9 })), 'STAIR_STEPS');
  assert.equal(long.length, 1); assert.match(long[0].message, /طويل/);
});

test('exterior wall thinner than the interior partitions, with a fix that thickens it', () => {
  const d = C.thinExterior(), issues = find(reviewDoc(d), 'EXTERIOR_THIN');
  assert.equal(issues.length, 4); assert.equal(issues[0].fix.commands[0].patch.t, 0.25);
  assert.deepEqual(find(reviewDoc(villa), 'EXTERIOR_THIN'), []);
});

test('openings too close to a wall end', () => {
  const d = C.open(C.oneRoom({ type: 'living', name: 'صالة', w: 6, l: 4, window: false }), 0.8, 4, 'window'); // 1.4 m window: starts 10cm... nudge to 5 cm
  const near = C.run(d, { type: 'update', id: d.openings.find(o => o.kind === 'window').id, patch: { at: 0.75 } });
  const issues = find(reviewDoc(near), 'OPENING_NEAR_END');
  assert.equal(issues.length, 1); assert.equal(issues[0].severity, 'info');
  assert.deepEqual(find(reviewDoc(d), 'OPENING_NEAR_END').length, 0 + (0.8 - 0.7 < GUIDELINES.openingEndClearance ? 1 : 0));
  assert.ok(issues[0].fix.commands[0].patch.at > 0.75);
});

test('rules are individually toggleable', () => {
  const d = C.windowlessBedroom();
  assert.ok(codes(reviewDoc(d)).includes('NO_WINDOW'));
  assert.ok(!codes(reviewDoc(d, { rules: { NO_WINDOW: false } })).includes('NO_WINDOW'));
  assert.deepEqual([...new Set(codes(reviewDoc(d, { only: ['NO_WINDOW'] })))], ['NO_WINDOW']);
});

test('the villa review is deterministic, severity-sorted and has no errors', () => {
  const a = reviewDoc(villa), b = reviewDoc(villa);
  assert.deepEqual(a, b);
  const order = { error: 0, warning: 1, info: 2 };
  assert.ok(a.every((x, i) => i === 0 || order[a[i - 1].severity] <= order[x.severity]));
  assert.ok(!a.some(i => i.severity === 'error'));
  assert.equal(new Set(a.map(i => i.id)).size, a.length, 'ids are unique');
});

test('suggestRoomType: ranked candidates from fixtures, area, openings and position - never certain', () => {
  const room = (over) => ({ id: 'x', name: 'x', type: 'other', area: 10, size: [3, 3.5], fixtures: {}, windows: { count: 1 }, doors: [], neighbours: [], ...over });
  const top = (r, ctx) => suggestRoomType(r, ctx)[0];
  assert.equal(top(room({ fixtures: { wc: 1, basin: 1 }, area: 4 })).type, 'bath');
  assert.equal(top(room({ fixtures: { 'kitchen-run': 1, fridge: 1 } })).type, 'kitchen');
  assert.equal(top(room({ fixtures: { 'bed-double': 1 }, area: 18 })).type, 'master');
  assert.equal(top(room({ fixtures: { 'bed-single': 1 }, area: 10 })).type, 'bedroom');
  assert.equal(top(room({ fixtures: { 'majlis-sofa': 4 }, area: 28 })).type, 'majlis');
  assert.equal(top(room({ fixtures: { 'sofa-3': 1, 'tv-unit': 1 } })).type, 'living');
  assert.equal(top(room({ fixtures: { 'washing-machine': 1 }, area: 4 })).type, 'laundry');
  assert.equal(top(room({ fixtures: { car: 1 }, area: 20 })).type, 'garage');
  assert.equal(top(room({ area: 6, size: [1.2, 5], windows: { count: 0 } })).type, 'corridor');
  assert.equal(top(room({ area: 5, size: [2, 2.5], windows: { count: 0 }, doors: [{ kind: 'door2', connects: 'outside' }] })).type, 'entrance');
  assert.equal(top(room({ area: 2.5, size: [1.2, 2], windows: { count: 0 } })).type, 'storage');
  assert.equal(top(room({ area: 3, stairs: ['s1'], fixtures: {} })).type, 'stairs');
  for (const r of [room({ fixtures: { wc: 1 } }), room({ area: 9 })]) {
    const list = suggestRoomType(r); assert.ok(list.length >= 1 && list.length <= 3);
    for (const c of list) { assert.ok(c.confidence <= 0.9 && c.confidence > 0); assert.match(c.reason, /[؀-ۿ]/); assert.match(c.reason, /تقريبي|لا توجد قرائن/); }
    assert.ok(list.every((c, i) => i === 0 || list[i - 1].confidence >= c.confidence));
  }
  assert.equal(suggestRoomType(room({ area: 1, windows: { count: 0 } }))[0].type, 'storage');
  assert.equal(suggestRoomType({ id: 'q', area: 20, size: [4, 5], windows: { count: 0 }, doors: [] }).every(c => c.confidence < 0.5), true, 'bare big room: low confidence');
});

test('suggestRoomType uses the digest for neighbours and agrees with the villa labels', () => {
  const digest = digestDoc(villa), rooms = digest.levels[0].rooms;
  const type = id => suggestRoomType(rooms.find(r => r.id === id), { digest })[0].type;
  assert.equal(type('r6'), 'bath'); assert.equal(type('r5'), 'kitchen'); assert.equal(type('r8'), 'master'); assert.equal(type('r1'), 'majlis'); assert.equal(type('r4'), 'living');
  assert.equal(type('r2'), 'stairs', 'the entrance hall holds the stair, so a stair-room is the closest guess; the label still wins in the drawing');
});
