import { previewGeometryCommand } from './geometry-editor.mjs';

const copy = value => structuredClone(value);
const fail = (code, message) => Object.assign(new Error(message), { code });
function revisionOf(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) throw fail('INVALID_MODEL', 'لا يوجد مخطط صالح للتحرير.');
  const revision = model.geometryRevision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw fail('INVALID_REVISION', 'رقم نسخة الهندسة غير صالح.');
  return revision;
}

// Each session owns its model and history. Public values are detached snapshots;
// a preview is not installed until its current token is explicitly committed.
export function createGeometrySession(initialModel, { landSurvey = null, historyLimit = 50 } = {}) {
  if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) throw fail('INVALID_HISTORY_LIMIT', 'حد سجل التراجع غير صالح.');
  let revision = revisionOf(initialModel);
  let current = { ...copy(initialModel), geometryRevision: revision };
  let survey = copy(landSurvey), pending = null, previewSequence = 0;
  const undoStack = [], redoStack = [];
  const nextRevision = candidate => {
    const next = Math.max(revision + 1, candidate ?? 0);
    if (!Number.isSafeInteger(next)) throw fail('INVALID_REVISION', 'تجاوز رقم نسخة الهندسة الحد المدعوم.');
    return next;
  };
  const install = (model, next) => {
    current = { ...copy(model), geometryRevision: next };
    revision = next;
    pending = null;
  };
  const pushUndo = model => {
    undoStack.push(copy(model));
    if (undoStack.length > historyLimit) undoStack.shift();
  };
  const getState = () => ({
    model: copy(current), revision, pending: copy(pending),
    canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    undoDepth: undoStack.length, redoDepth: redoStack.length,
  });
  const preview = command => {
    // A failed/latest drag proposal cancels the prior preview: it must never
    // leave a previously valid proposal available for accidental confirmation.
    pending = null;
    if (!command || command.baseRevision !== revision) throw fail('STALE_REVISION', 'تغيّر المخطط منذ بدء التعديل؛ أعد اختيار العنصر.');
    const result = previewGeometryCommand(copy(current), copy(command), { landSurvey: copy(survey), revision });
    if (!result?.model || result.baseRevision !== revision || result.nextRevision !== nextRevision()) throw fail('INVALID_PREVIEW', 'نتيجة معاينة التعديل لا تطابق نسخة المخطط.');
    const requiresConfirmation = result.impact?.requiresConfirmation === true || JSON.stringify(current.program) !== JSON.stringify(result.model.program);
    pending = { ...copy(result), previewId: `geometry-preview-${++previewSequence}`, impact: { ...copy(result.impact || {}), requiresConfirmation } };
    return copy(pending);
  };
  const commit = ({ previewId, confirmProgramChange = false } = {}) => {
    if (!pending || previewId !== pending.previewId || pending.baseRevision !== revision) throw fail('STALE_PREVIEW', 'انتهت صلاحية معاينة التعديل؛ اطلب معاينة جديدة.');
    if (pending.impact.requiresConfirmation && confirmProgramChange !== true) throw fail('IMPACT_CONFIRMATION_REQUIRED', 'التعديل يغيّر برنامج الغرف؛ راجع الأثر وأكّد قبول المساحات الجديدة.');
    const next = nextRevision(), proposed = pending.model;
    pushUndo(current);
    redoStack.length = 0;
    install(proposed, next);
    return getState();
  };
  const cancel = () => { pending = null; return getState(); };
  const undo = () => {
    if (!undoStack.length) return cancel();
    const next = nextRevision();
    redoStack.push(copy(current));
    install(undoStack.pop(), next);
    return getState();
  };
  const redo = () => {
    if (!redoStack.length) return cancel();
    const next = nextRevision();
    pushUndo(current);
    install(redoStack.pop(), next);
    return getState();
  };
  const replaceModel = (model, options = {}) => {
    const next = nextRevision(revisionOf(model));
    const replacement = copy(model);
    const nextSurvey = Object.hasOwn(options, 'landSurvey') ? copy(options.landSurvey) : survey;
    install(replacement, next);
    survey = nextSurvey;
    undoStack.length = 0;
    redoStack.length = 0;
    return getState();
  };
  // Use when an external operation changes editing context (for example survey
  // selection). Unlike cancel, this also expires commands captured by async UI.
  const invalidatePending = () => {
    install(current, nextRevision());
    return getState();
  };
  return Object.freeze({ getState, preview, commit, cancel, undo, redo, replaceModel, invalidatePending });
}
