import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms, validateModel, quantities } from '../dist/planner.mjs';
import { previewGeometryCommand, eligibleRoomEdits, eligibleCorridors } from '../dist/geometry-editor.mjs';
import { createGeometrySession } from '../dist/geometry-session.mjs';
import { evaluateRequirementEvidence } from '../dist/requirement-evidence.mjs';

const plot = { width: 20, length: 30, entry: 's', streets: { s: true }, floors: 1 };
const base = () => generateModel(plot, defaultRooms());
const run = (model, command) => previewGeometryCommand(model, { id: 'c', baseRevision: 0, ...command });
const area = (model, id) => { const r = model.rooms.find(x => x.id === id); return r.w * r.h; };

// ---- 1) resize a room by dragging a corner ----
test('dragging a corner moves exactly its two bounding partitions and resizes only the touched rooms', () => {
  const m = base(), before = structuredClone(m);
  const out = run(m, { type: 'resize-room', roomId: 'room-4', corner: 'top-right', dyM: .3 });
  assert.deepEqual(m, before, 'input is never mutated');
  assert.deepEqual(validateModel(out.model), []);
  const kitchen = out.model.rooms.find(r => r.id === 'room-4'), original = m.rooms.find(r => r.id === 'room-4');
  assert.ok(Math.abs(kitchen.h - original.h - .3) < 1e-9);
  assert.equal(kitchen.w, original.w);
  assert.deepEqual(out.impact.rooms.map(r => r.id).sort(), ['room-2', 'room-4']);
  assert.equal(out.impact.requiresConfirmation, true);
  for (const r of out.impact.rooms) assert.equal(out.model.program.find(p => p.id === r.id).area, area(out.model, r.id));
  assert.equal(out.model.geometryRevision, 1);
});

test('a corner drag can shrink a room too, and the opposite corner moves the opposite wall', () => {
  const m = base();
  const shrink = run(m, { type: 'resize-room', roomId: 'room-4', corner: 'top-right', dyM: -.2 });
  assert.ok(area(shrink.model, 'room-4') < area(m, 'room-4'));
  const other = run(m, { type: 'resize-room', roomId: 'room-4', corner: 'bottom-left', dyM: -.2 });
  assert.deepEqual(other.impact.rooms.map(r => r.id).sort(), ['room-0', 'room-4']);
  assert.ok(area(other.model, 'room-4') > area(m, 'room-4'));
});

test('a two-axis corner drag moves both walls atomically; a blocked side rejects the whole command', () => {
  const m = base();
  const both = run(m, { type: 'resize-room', roomId: 'room-9', corner: 'top-right', dxM: .2 });
  assert.deepEqual(validateModel(both.model), []);
  assert.throws(() => run(m, { type: 'resize-room', roomId: 'room-9', corner: 'top-right', dxM: .2, dyM: .2 }), /ROOM_RESIZE_BLOCKED/);
  assert.throws(() => run(m, { type: 'resize-room', roomId: 'room-0', corner: 'top-left', dxM: .2 }), /تعذّر تغيير حجم الغرفة من جهة اليسار/);
});

test('resize rejects locked rooms, bad corners, no-ops, infeasible sizes and stale revisions without mutation', () => {
  const m = base(), before = structuredClone(m);
  assert.throws(() => run(m, { type: 'resize-room', roomId: 'nope', corner: 'top-right', dyM: .3 }), /ROOM_NOT_FOUND/);
  assert.throws(() => run(m, { type: 'resize-room', roomId: 'room-4', corner: 'middle', dyM: .3 }), /INVALID_COMMAND/);
  assert.throws(() => run(m, { type: 'resize-room', roomId: 'room-4', corner: 'top-right', dyM: .01 }), /NO_CHANGE/);
  assert.throws(() => run(m, { type: 'resize-room', roomId: 'room-4', corner: 'top-right', dyM: -1.5 }), e => e.code === 'INVALID_GEOMETRY');
  assert.throws(() => previewGeometryCommand(m, { id: 'c', baseRevision: 3, type: 'resize-room', roomId: 'room-4', corner: 'top-right', dyM: .3 }), /STALE_REVISION/);
  const locked = structuredClone(m); locked.program.find(r => r.id === 'room-4').dimensions = { width: 7.3, length: 18 / 7.3 };
  assert.throws(() => run(locked, { type: 'resize-room', roomId: 'room-4', corner: 'top-right', dyM: .3 }), /DIMENSIONS_LOCKED/);
  assert.deepEqual(m, before);
});

// ---- 2a) add a room: split an existing room ----
test('splitting a room adds a real room, a real wall and a real door, and keeps the plan valid and reachable', () => {
  const m = base(), before = structuredClone(m);
  const out = run(m, { type: 'split-room', roomId: 'room-0', axis: 'x', atM: 3.65, newType: 'office' });
  assert.deepEqual(m, before);
  assert.deepEqual(validateModel(out.model), []);
  assert.equal(out.model.rooms.length, m.rooms.length + 1);
  assert.equal(out.model.program.length, m.program.length + 1);
  const created = out.model.rooms.find(r => r.id === out.impact.addedRoomId);
  assert.equal(created.type, 'office');
  assert.ok(created.name.length > 0 && !m.rooms.some(r => r.name === created.name));
  assert.equal(out.model.walls.length, m.walls.length + 1);
  const wall = out.model.walls.find(w => w.id === out.impact.wallIds[0]);
  assert.equal(wall.type, 'int');
  const door = out.model.openings.find(o => o.id === out.impact.openingIds[0]);
  assert.deepEqual([...door.connects].sort(), ['room-0', created.id].sort());
  assert.equal(door.wallId, wall.id);
  // the two halves plus the wall gap account for the parent's full width
  const parent = out.model.rooms.find(r => r.id === 'room-0'), original = m.rooms.find(r => r.id === 'room-0');
  assert.ok(Math.abs(parent.w + created.w + wall.t - original.w) < 1e-9);
  assert.equal(parent.h, original.h);
  for (const r of [parent, created]) assert.equal(out.model.program.find(p => p.id === r.id).area, r.w * r.h);
  assert.ok(Math.abs(area(out.model, 'room-0') + created.w * created.h + wall.t * original.h - original.w * original.h) < 1e-9);
});

test('the new room can take the first half instead, and an added corridor room uses the corridor type', () => {
  const m = base();
  const out = run(m, { type: 'split-room', roomId: 'room-4', axis: 'x', atM: 3.65, newType: 'corridor', newRoomAt: 'first', newName: 'ممر جانبي' });
  assert.deepEqual(validateModel(out.model), []);
  const created = out.model.rooms.find(r => r.id === out.impact.addedRoomId);
  assert.equal(created.name, 'ممر جانبي'); assert.equal(created.type, 'corridor');
  assert.ok(created.x < out.model.rooms.find(r => r.id === 'room-4').x);
});

test('splitting rejects locked rooms, too-small halves, bad axis/position and a cut through an existing opening', () => {
  const m = base(), before = structuredClone(m);
  assert.throws(() => run(m, { type: 'split-room', roomId: 'room-0', axis: 'z', atM: 3 }), /INVALID_COMMAND/);
  assert.throws(() => run(m, { type: 'split-room', roomId: 'room-0', axis: 'x', atM: 99 }), /INVALID_COMMAND/);
  assert.throws(() => run(m, { type: 'split-room', roomId: 'room-0', axis: 'y', atM: 2.2, newType: 'office' }), /PLANNER_ROOM_FEASIBILITY/);
  assert.throws(() => run(m, { type: 'split-room', roomId: 'room-5', axis: 'x', atM: 2.7, newType: 'storage' }), /يمر بفتحة قائمة/);
  assert.throws(() => run(m, { type: 'split-room', roomId: 'room-0', axis: 'x', atM: 3.65, newType: 'nope' }), /INVALID_COMMAND/);
  const locked = structuredClone(m); locked.program.find(r => r.id === 'room-0').dimensions = { width: 7.3, length: 32 / 7.3 };
  assert.throws(() => run(locked, { type: 'split-room', roomId: 'room-0', axis: 'x', atM: 3.65 }), /DIMENSIONS_LOCKED/);
  assert.deepEqual(m, before);
});

// ---- 2b) delete a room: merge into its neighbour ----
test('deleting a room merges its area into the chosen neighbour across a real partition', () => {
  const m = base(), before = structuredClone(m);
  const out = run(m, { type: 'delete-room', roomId: 'room-9', mergeIntoRoomId: 'room-3' });
  assert.deepEqual(m, before);
  assert.deepEqual(validateModel(out.model), []);
  assert.equal(out.model.rooms.length, m.rooms.length - 1);
  assert.equal(out.model.program.length, m.program.length - 1);
  assert.ok(!out.model.rooms.some(r => r.id === 'room-9') && !out.model.program.some(r => r.id === 'room-9'));
  assert.equal(out.model.walls.length, m.walls.length - 1);
  assert.ok(!out.model.openings.some(o => o.connects?.includes('room-9') || o.roomId === 'room-9'));
  const survivor = out.model.rooms.find(r => r.id === 'room-3');
  assert.ok(Math.abs(survivor.w * survivor.h - (area(m, 'room-3') + area(m, 'room-9') + m.walls.find(w => w.id === out.impact.wallIds[0]).t * m.rooms.find(r => r.id === 'room-3').h)) < 1e-9);
  assert.equal(out.model.program.find(p => p.id === 'room-3').area, survivor.w * survivor.h);
  assert.equal(out.impact.removedRoomId, 'room-9');
  assert.equal(out.applied?.mergeIntoRoomId ?? out.command.mergeIntoRoomId, 'room-3');
});

test('delete picks a deterministic neighbour when none is named, and reroutes doors of the removed room', () => {
  const m = base();
  const a = run(m, { type: 'delete-room', roomId: 'room-0' }), b = run(m, { type: 'delete-room', roomId: 'room-0' });
  assert.deepEqual(a.model, b.model);
  assert.deepEqual(validateModel(a.model), []);
  const survivorId = a.command.mergeIntoRoomId;
  const doorToSpine = m.openings.find(o => o.type === 'door' && o.connects.includes('room-0') && o.connects.includes('spine'));
  assert.deepEqual(a.model.openings.find(o => o.id === doorToSpine.id).connects.slice().sort(), ['spine', 'room-0'].map(id => id === 'room-0' ? survivorId : id).sort());
});

test('delete rejects the last room, rooms with no full partition, wrong neighbours and locked neighbours', () => {
  const m = base(), before = structuredClone(m);
  assert.throws(() => run(m, { type: 'delete-room', roomId: 'room-1' }), /ROOM_DELETE_BLOCKED/);
  assert.throws(() => run(m, { type: 'delete-room', roomId: 'room-9', mergeIntoRoomId: 'room-0' }), /ROOM_DELETE_BLOCKED/);
  assert.throws(() => run(m, { type: 'delete-room', roomId: 'nope' }), /ROOM_NOT_FOUND/);
  const lockedNeighbour = structuredClone(m); lockedNeighbour.program.find(r => r.id === 'room-3').dimensions = { width: 5.5, length: 20 / 5.5 };
  assert.throws(() => run(lockedNeighbour, { type: 'delete-room', roomId: 'room-9', mergeIntoRoomId: 'room-3' }), /ROOM_DELETE_BLOCKED|DIMENSIONS_LOCKED/);
  const single = structuredClone(m); single.rooms = [single.rooms[0]]; single.program = [single.program[0]];
  assert.throws(() => run(single, { type: 'delete-room', roomId: 'room-0' }), /ROOM_DELETE_BLOCKED|INVALID_GEOMETRY/);
  assert.deepEqual(m, before);
});

// ---- 2c) delete a corridor ----
test('the main spine is never deletable and a corridor that rooms depend on is rejected by reachability', () => {
  const m = base(), before = structuredClone(m);
  assert.throws(() => run(m, { type: 'delete-corridor', corridorId: 'spine' }), /CORRIDOR_NOT_ELIGIBLE/);
  assert.throws(() => run(m, { type: 'delete-corridor', corridorId: 'branch-back-left-0' }), /لا يوجد مسار باب متصل بالمدخل/);
  assert.throws(() => run(m, { type: 'delete-corridor', corridorId: 'nope' }), /CORRIDOR_NOT_FOUND/);
  assert.deepEqual(m, before);
});

test('a branch corridor that no room depends on any more can be deleted, with its links and doors', () => {
  let m = base();
  for (const id of ['room-5', 'room-10']) { // the rooms hanging off branch-back-left-0
    m = { ...run(m, { type: 'delete-room', roomId: id }).model, geometryRevision: 0 };
  }
  const doorsBefore = m.openings.filter(o => o.type === 'door' && o.connects.includes('branch-back-left-0'));
  const out = run(m, { type: 'delete-corridor', corridorId: 'branch-back-left-0' });
  assert.deepEqual(validateModel(out.model), []);
  assert.ok(!out.model.corridors.some(c => c.id === 'branch-back-left-0'));
  assert.ok(!out.model.links.some(pair => pair.includes('branch-back-left-0')));
  assert.ok(!out.model.openings.some(o => o.connects?.includes('branch-back-left-0')));
  assert.equal(out.impact.corridorId, 'branch-back-left-0');
  assert.deepEqual(out.impact.openingIds.slice().sort(), doorsBefore.map(d => d.id).sort());
});

test('the eligibility lists explain what each room and corridor can do', () => {
  const m = base();
  const edits = eligibleRoomEdits(m), kitchen = edits.find(r => r.roomId === 'room-4');
  assert.deepEqual(kitchen.resize, { left: false, right: false, top: true, bottom: true });
  assert.deepEqual(kitchen.mergeWith.sort(), ['room-0', 'room-2']);
  assert.equal(kitchen.eligible, true);
  const locked = structuredClone(m); locked.program.find(r => r.id === 'room-4').dimensions = { width: 7.3, length: 18 / 7.3 };
  assert.match(eligibleRoomEdits(locked).find(r => r.roomId === 'room-4').reason, /DIMENSIONS_LOCKED/);
  const corridors = eligibleCorridors(m);
  assert.equal(corridors.find(c => c.corridorId === 'spine').eligible, false);
  assert.equal(corridors.find(c => c.corridorId === 'branch-back-left-0').eligible, true);
  assert.match(eligibleRoomEdits(m, { landSurvey: { points: [] } })[0].reason, /SURVEY_CONTEXT_UNSUPPORTED/);
});

// ---- integration: session, undo/redo, persistence, downstream consumers ----
test('split and delete go through the same session: preview, confirm, undo, redo', () => {
  const m = base(), session = createGeometrySession(m);
  const preview = session.preview({ id: 's1', type: 'split-room', baseRevision: 0, roomId: 'room-0', axis: 'x', atM: 3.65, newType: 'office' });
  assert.equal(preview.impact.requiresConfirmation, true);
  assert.throws(() => session.commit({ previewId: preview.previewId }), e => e.code === 'IMPACT_CONFIRMATION_REQUIRED');
  const committed = session.commit({ previewId: preview.previewId, confirmProgramChange: true });
  assert.equal(committed.model.rooms.length, m.rooms.length + 1);
  const undone = session.undo();
  assert.deepEqual(undone.model.rooms, m.rooms);
  assert.equal(session.redo().model.rooms.length, m.rooms.length + 1);
});

test('edited plans survive save and reopen and still feed the evidence ledger and quantities', async () => {
  const { encodeProject, decodeProject } = await import('../dist/project.mjs');
  for (const command of [
    { type: 'split-room', roomId: 'room-0', axis: 'x', atM: 3.65, newType: 'office' },
    { type: 'delete-room', roomId: 'room-9', mergeIntoRoomId: 'room-3' },
    { type: 'resize-room', roomId: 'room-4', corner: 'top-right', dyM: .3 },
  ]) {
    const edited = run(base(), command).model;
    const text = encodeProject({ plot: edited.plot, rooms: edited.program, palette: 'resort', rates: {}, costReserve: 0, vat: 0, idea: '', discovery: { likes: [], rejects: [], avoids: [], life: {} }, model: edited, alternatives: [], history: [] });
    assert.deepEqual(decodeProject(text).model, edited, command.type);
    assert.ok(quantities(edited).rooms > 0);
    const evidence = evaluateRequirementEvidence({ model: edited, program: edited.program, plot: edited.plot });
    assert.ok(evidence.rows.length > 0, command.type);
  }
});
