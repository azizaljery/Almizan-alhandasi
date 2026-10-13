import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { digestDoc, describeDigestAr, compassOf, minRect, shapeOf, analyzeDoc } from '../dist/draw/digest.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import { oneRoom, twoRooms, gapDoc, stubDoc, orphanAndDuplicate, unlabelledKitchen, rotatedNorth, run, rect, open, label, fixture } from './fixtures/draw-cases.mjs';
import { createDoc } from '../dist/draw/doc.mjs';

const villa = sampleVilla();
const room = (digest, id) => digest.levels.flatMap(l => l.rooms).find(r => r.id === id);

test('the digest is plain JSON and small enough for a model (villa < 8 KB, compact smaller)', () => {
  const full = digestDoc(villa), compact = digestDoc(villa, { compact: true });
  assert.deepEqual(JSON.parse(JSON.stringify(full)), full);
  const a = JSON.stringify(full).length, b = JSON.stringify(compact).length;
  assert.ok(a < 8192, 'full ' + a); assert.ok(b < a, 'compact smaller'); assert.ok(b < 6000, 'compact ' + b);
  assert.equal(full.schema, 'mizan-digest/1');
});

test('rooms carry name, type, clear area, min-rectangle size, shape and level', () => {
  const d = digestDoc(villa);
  assert.equal(d.levels[0].rooms.length, 9);
  const majlis = room(d, 'r1');
  assert.equal(majlis.name, 'مجلس الرجال'); assert.equal(majlis.type, 'majlis'); assert.equal(majlis.levelId, 'L1');
  assert.ok(Math.abs(majlis.area - 28) < 0.05);
  assert.deepEqual(majlis.size.map(v => Math.round(v * 10) / 10), [4.8, 5.8]);
  assert.equal(majlis.shape, 'rectangle');
  assert.ok(majlis.perimeter > 20 && majlis.centroid.x > 0);
});

test('compass sides honour doc.north: majlis touches the south and west exterior', () => {
  assert.deepEqual(room(digestDoc(villa), 'r1').exteriorWalls.map(w => w.side), ['s', 'w']);
  assert.equal(compassOf({ x: 0, y: 1 }, 0), 'n'); assert.equal(compassOf({ x: 1, y: 0 }, 0), 'e');
  assert.equal(compassOf({ x: 0, y: 1 }, 90), 'e', 'plan +y points true east');
  assert.equal(compassOf({ x: 0, y: -1 }, 180), 'n');
  const rotated = digestDoc(rotatedNorth(90));
  assert.equal(rotated.levels[0].rooms[0].windows.sides[0], 'e', 'north-wall window faces plan +y = east when north=90');
  assert.equal(digestDoc(rotatedNorth(0)).levels[0].rooms[0].windows.sides[0], 'n');
});

test('windows: count, area, ratio to floor and compass sides (exterior only)', () => {
  const master = room(digestDoc(villa), 'r8');
  assert.equal(master.windows.count, 2);
  assert.ok(master.windows.totalArea > 4 && master.windows.ratioToFloor > 0.25);
  assert.deepEqual(master.windows.sides, ['n', 'w']);
  const interior = room(digestDoc(villa), 'r5'); // kitchen: one exterior window only
  assert.equal(interior.windows.count, 1);
});

test('doors list what they connect (room ids or "outside") and width', () => {
  const d = digestDoc(villa), entrance = room(d, 'r2');
  assert.ok(entrance.doors.some(x => x.connects === 'outside' && x.entry && x.kind === 'door2' && x.width === 1.5));
  assert.ok(entrance.doors.some(x => x.connects === 'r1' && x.kind === 'arch'));
  assert.deepEqual(room(d, 'r7').doors, [], 'laundry has no door');
});

test('circulation: entry room, door-count path to every room, unreachable rooms', () => {
  const c = digestDoc(villa).levels[0].circulation;
  assert.deepEqual(c.entryRooms, ['r2']);
  assert.equal(c.reach.r2.doors, 0); assert.equal(c.reach.r1.doors, 1);
  assert.deepEqual(c.reach.r5.path, ['r2', 'r4', 'r6', 'r5']);
  assert.deepEqual(c.unreachable, ['r7'], 'the laundry has no door at all');
  assert.ok(c.graph.length >= 7);
  const compact = digestDoc(villa, { compact: true }).levels[0].circulation;
  assert.equal(compact.reach.r1, 1, 'compact reach is just the door count');
});

test('totals: footprint, built/net area, wall lengths, plot coverage', () => {
  const t = digestDoc(villa).totals;
  assert.ok(Math.abs(t.footprintArea - 174.56) < 0.5);
  assert.equal(t.plotArea, 320); assert.equal(t.coverageRatio, 0.55);
  assert.ok(t.builtArea.L1 > t.netRoomArea.L1);
  assert.ok(Math.abs(t.exteriorWallLength - 52) < 0.01);
  assert.ok(t.interiorWallLength > 40);
  assert.equal('plotArea' in digestDoc(oneRoom()).totals, false, 'no plot, no coverage');
});

test('counts and fixtures inside rooms', () => {
  const d = digestDoc(villa);
  assert.deepEqual({ levels: d.counts.levels, rooms: d.counts.rooms, doors: d.counts.doors, windows: d.counts.windows, stairs: d.counts.stairs }, { levels: 1, rooms: 9, doors: 8, windows: 11, stairs: 1 });
  assert.equal(room(d, 'r6').fixtures.wc, 1); assert.equal(room(d, 'r8').fixtures['bed-double'], 1);
  assert.ok(room(d, 'r2').stairs?.length === 1);
});

test('drawingState reports gaps, stubs, unlabelled rooms, orphan and duplicate labels', () => {
  assert.deepEqual(digestDoc(villa).drawingState, { gaps: [], stubs: 0, unlabelledRooms: [], orphanLabels: [], duplicateLabels: [] });
  const gap = digestDoc(gapDoc()).drawingState;
  assert.equal(gap.gaps.length, 1); assert.ok(gap.gaps[0].dist > 0.15 && gap.gaps[0].dist < 0.25); assert.equal(digestDoc(gapDoc()).levels[0].rooms.length, 0, 'no closed room while the gap is open');
  assert.equal(digestDoc(stubDoc()).drawingState.stubs, 1);
  const od = digestDoc(orphanAndDuplicate()).drawingState;
  assert.equal(od.orphanLabels.length, 1); assert.equal(od.orphanLabels[0].name, 'تسمية ضائعة'); assert.equal(od.duplicateLabels.length, 1);
  const un = digestDoc(unlabelledKitchen());
  assert.equal(un.drawingState.unlabelledRooms.length, 1);
  assert.equal(un.levels[0].rooms[0].type, 'other'); assert.equal(un.levels[0].rooms[0].unlabelled, true);
});

test('shape detection: rectangle, L and irregular; min rectangle of a rotated box', () => {
  const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  assert.equal(shapeOf(sq), 'rectangle');
  const L = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
  assert.equal(shapeOf(L), 'L');
  assert.equal(shapeOf([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }]), 'irregular');
  const c = Math.cos(0.5), s = Math.sin(0.5);
  const rot = sq.map(p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  const mr = minRect(rot);
  assert.ok(Math.abs(mr.w - 3) < 1e-6 && Math.abs(mr.l - 4) < 1e-6);
  let d = createDoc();
  d = run(d, { type: 'add-walls', level: 'L1', points: L, closed: true, t: 0.2 }, { type: 'add-label', level: 'L1', name: 'L', roomType: 'living', seed: { x: 1, y: 1 } });
  assert.equal(digestDoc(d).levels[0].rooms[0].shape, 'L');
});

test('two levels: reachability of an upper level needs a stair; describeDigestAr summarises in Arabic', () => {
  const d = run(oneRoom({ type: 'living', name: 'صالة' }), { type: 'add-level', name: 'الدور الأول', copyFrom: 'L1' });
  const dg = digestDoc(d);
  assert.equal(dg.levels.length, 2); assert.equal(dg.counts.levels, 2);
  assert.equal(dg.levels[1].circulation.entry, null, 'no stair, so no way to know where the upper level starts');
  const text = describeDigestAr(digestDoc(villa));
  assert.match(text, /مجلس الرجال|ممر/); assert.match(text, /غسيل/); assert.ok(text.length > 150 && text.length < 1200);
  assert.ok(!/[•\-*]\s/.test(text), 'sentences, no bullet characters');
  assert.match(describeDigestAr(digestDoc(gapDoc())), /ثغرة/);
  assert.match(describeDigestAr(digestDoc(createDoc())), /لا توجد غرف/);
});

test('analyzeDoc resolves openings to the rooms on each side', () => {
  const m = analyzeDoc(twoRooms({ doorBetween: true }));
  const between = m.levels[0].openings.find(o => o.door && o.left && o.right);
  assert.ok(between); assert.deepEqual([between.left.name, between.right.name].sort(), ['المجلس', 'غرفة نوم'].sort());
});
