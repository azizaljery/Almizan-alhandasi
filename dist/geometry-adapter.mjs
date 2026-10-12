import { createGeometrySession } from './geometry-session.mjs';
import { validateModel } from './planner.mjs';

const clone = value => structuredClone(value);
const fail = (code, message) => Object.assign(new Error(message), { code });

// Neutral contract for renderer/editor integrations. It owns no UI or vendor
// types; each operation is backed by the same validated geometry session.
export function createGeometryAdapter(initialModel, options = {}) {
  const session = createGeometrySession(initialModel, options);
  const assertModel = model => {
    const errors = validateModel(model);
    if (errors.length) fail('INVALID_MODEL', errors.join(' | '));
    return model;
  };
  assertModel(session.getState().model);
  return Object.freeze({
    contract: 'mizan.geometry.v1',
    capabilities: Object.freeze({ preview: true, commit: true, undo: true, redo: true, roundTrip: true, version2: true }),
    getSnapshot() { return clone(session.getState()); },
    preview(command) { return clone(session.preview(clone(command))); },
    commit(request) { return clone(session.commit(clone(request))); },
    cancel() { return clone(session.cancel()); },
    undo() { return clone(session.undo()); },
    redo() { return clone(session.redo()); },
    replaceModel(model, replaceOptions) {
      assertModel(model);
      return clone(session.replaceModel(clone(model), replaceOptions));
    },
    invalidatePending() { return clone(session.invalidatePending()); },
  });
}
