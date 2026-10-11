import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeometrySession } from '../dist/geometry-session.mjs';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { encodeProject, decodeProject } from '../dist/project.mjs';
const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } };
const model = () => generateModel(plot, defaultRooms());
const withoutRevision = value => { const out = structuredClone(value); delete out.geometryRevision; return out; };
const command = (session, heightM = 1) => {
  const state = session.getState();
  return { id: `window-height-${heightM}`, type: 'edit-opening', baseRevision: state.revision, openingId: state.model.openings.find(o => o.type === 'window').id, heightM };
};
const commit = (session, heightM = 1) => {
  const preview = session.preview(command(session, heightM));
  return session.commit({ previewId: preview.previewId });
};
test('preview is detached from base and caller and cancel never commits', () => {
  const input = model(), before = structuredClone(input), session = createGeometrySession(input);
  const preview = session.preview(command(session));
  assert.deepEqual(input, before);
  assert.deepEqual(withoutRevision(session.getState().model), before);
  assert.equal(session.getState().revision, 0);
  preview.model.rooms[0].name = 'caller mutation';
  preview.impact.requiresConfirmation = true;
  assert.notEqual(session.getState().pending.model.rooms[0].name, 'caller mutation');
  session.cancel();
  assert.equal(session.getState().pending, null);
  assert.equal(session.getState().undoDepth, 0);
  assert.throws(() => session.commit({ previewId: preview.previewId }), { code: 'STALE_PREVIEW' });
});
test('drag previews replace pending result and one commit creates exactly one undo', () => {
  const session = createGeometrySession(model());
  const first = session.preview(command(session, 1));
  const last = session.preview(command(session, 1.1));
  assert.notEqual(first.previewId, last.previewId);
  assert.throws(() => session.commit({ previewId: first.previewId }), { code: 'STALE_PREVIEW' });
  const result = session.commit({ previewId: last.previewId });
  assert.equal(result.revision, 1);
  assert.equal(result.model.geometryRevision, 1);
  assert.equal(result.undoDepth, 1);
  assert.equal(result.redoDepth, 0);
  assert.equal(result.pending, null);
});
test('stale commands and asynchronous preview results never overwrite a newer revision', () => {
  const session = createGeometrySession(model()), stale = command(session);
  const preview = session.preview(stale);
  session.commit({ previewId: preview.previewId });
  assert.throws(() => session.preview(stale), { code: 'STALE_REVISION' });
  assert.throws(() => session.commit({ previewId: preview.previewId }), { code: 'STALE_PREVIEW' });
  assert.equal(session.getState().revision, 1);
});
test('undo and redo restore exact model snapshots while revision only increases', () => {
  const initial = model(), session = createGeometrySession(initial);
  const first = commit(session).model;
  assert.equal(session.undo().revision, 2);
  assert.deepEqual(withoutRevision(session.getState().model), withoutRevision(initial));
  const restored = session.redo();
  assert.equal(restored.revision, 3);
  assert.deepEqual(withoutRevision(restored.model), withoutRevision(first));
  assert.equal(restored.undoDepth, 1);
  assert.equal(restored.redoDepth, 0);
});
test('new edit after undo discards redo and snapshot mutation cannot modify session', () => {
  const session = createGeometrySession(model());
  commit(session, 1); commit(session, 1.1); session.undo();
  assert.equal(session.getState().canRedo, true);
  commit(session, .9);
  assert.equal(session.getState().canRedo, false);
  const snapshot = session.getState(); snapshot.model.openings[0].w = 999;
  assert.notEqual(session.getState().model.openings[0].w, 999);
});
test('model replacement invalidates old previews and history with monotonic revision', () => {
  const session = createGeometrySession(model());
  commit(session);
  const stale = session.preview(command(session, 1.1));
  const replacement = model(); replacement.geometryRevision = 10;
  const state = session.replaceModel(replacement);
  assert.equal(state.revision, 10);
  assert.equal(state.canUndo, false);
  assert.equal(state.canRedo, false);
  assert.equal(state.pending, null);
  assert.throws(() => session.commit({ previewId: stale.previewId }), { code: 'STALE_PREVIEW' });
  assert.equal(session.replaceModel(model()).revision, 11);
});
test('explicit pending invalidation also invalidates captured commands', () => {
  const session = createGeometrySession(model()), captured = command(session);
  const preview = session.preview(captured);
  const state = session.invalidatePending();
  assert.equal(state.revision, 1);
  assert.equal(state.pending, null);
  assert.throws(() => session.preview(captured), { code: 'STALE_REVISION' });
  assert.throws(() => session.commit({ previewId: preview.previewId }), { code: 'STALE_PREVIEW' });
});
test('history limits do not change geometry and empty undo/redo is inert', () => {
  const session = createGeometrySession(model(), { historyLimit: 1 });
  assert.equal(session.undo().revision, 0); assert.equal(session.redo().revision, 0);
  commit(session, 1); commit(session, 1.1);
  assert.equal(session.getState().undoDepth, 1);
  session.undo(); assert.equal(session.getState().canUndo, false);
});
test('saved geometry revision reopens exactly and undo history is session-local', () => {
  const session = createGeometrySession(model());
  commit(session); session.undo(); session.redo();
  const state = session.getState();
  const saved = encodeProject({ plot, rooms: state.model.program, model: state.model, palette: 'modern', rates: {}, costReserve: 0, vat: 0, idea: '' });
  const reopened = createGeometrySession(decodeProject(saved).model).getState();
  assert.equal(reopened.revision, 3);
  assert.deepEqual(reopened.model, state.model);
  assert.equal(reopened.canUndo, false);
});
test('invalid revision inputs are rejected without coercion', () => {
  for (const revision of [-1, 1.1, NaN, '2']) assert.throws(() => createGeometrySession({ ...model(), geometryRevision: revision }), { code: 'INVALID_REVISION' });
  const session = createGeometrySession(model());
  const missing = command(session); delete missing.baseRevision;
  assert.throws(() => session.preview(missing), { code: 'STALE_REVISION' });
});
test('program-changing partitions require explicit impact confirmation', () => {
  const session = createGeometrySession(model());
  const before = session.getState();
  const preview = session.preview({ id: 'partition-1', type: 'move-partition', baseRevision: before.revision, wallId: 'wall-6', deltaM: .2 });
  assert.equal(preview.impact.requiresConfirmation, true);
  assert.throws(() => session.commit({ previewId: preview.previewId }), { code: 'IMPACT_CONFIRMATION_REQUIRED' });
  assert.deepEqual(session.getState().model, before.model);
  assert.equal(session.getState().canUndo, false);
  const result = session.commit({ previewId: preview.previewId, confirmProgramChange: true });
  assert.notDeepEqual(result.model.program, before.model.program);
  assert.equal(result.revision, 1);
  assert.deepEqual(withoutRevision(session.undo().model), withoutRevision(before.model));
});
test('failed latest preview clears prior preview rather than committing an old drag', () => {
  const session = createGeometrySession(model());
  const valid = session.preview(command(session));
  assert.throws(() => session.preview(command(session, -1)));
  assert.equal(session.getState().pending, null);
  assert.throws(() => session.commit({ previewId: valid.previewId }), { code: 'STALE_PREVIEW' });
});
