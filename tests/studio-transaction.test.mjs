import { rebindSolarContext } from '../dist/solar-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createStudioSession, appendStudioMessage, beginStudioOperation, isCurrentStudioOperation, acceptStudioUnderstanding, cancelStudioOperation, invalidateStudioApproval } from '../dist/studio-session.mjs';
import { validatePlot, normalizeRooms } from '../dist/planner.mjs';
import { requestFingerprint } from '../dist/client-request.mjs';

// Execute the application's transaction functions, replacing only DOM/rendering
// and the deferred worker boundary. This is behavioral VM coverage, not a browser.
const source = readFileSync(process.env.STUDIO_TRANSACTION_APP || new URL('../dist/app.mjs', import.meta.url), 'utf8');
function slice(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Application function boundary missing: ${start}`);
  return source.slice(a, b);
}
const stampSource = source.match(/^const studioInputStamp = .*;$/m)?.[0] || '';
const functions = [
  stampSource,
  slice('function assertStudioOperation(', 'function studioAudit('),
  slice('function markDirty()', 'function syncWorkspace('),
  slice('function applyRequest()', 'function engineeringSignature('),
  slice('function engineeringSignature()', 'function renderStreets('),
  slice('async function generate(', 'function renderBOQ('),
  slice('async function importProject(', 'async function exportResult('),
].join('\n');
const drawMethod = slice('  async drawProposal(', '\n  showAdvanced()');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const plain = value => JSON.parse(JSON.stringify(value));
function harness() {
  const widgets = new Map();
  const $ = id => {
    if (!widgets.has(id)) widgets.set(id, { value: '', textContent: '', disabled: false, hidden: false, classList: { toggle() {}, contains() { return false; } }, scrollIntoView() {} });
    return widgets.get(id);
  };
  $('idea').value = 'الطلب الأصلي'; $('costReserve').value = '0'; $('vat').value = '0';
  const plot = validatePlot({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } });
  const program = [{ name: 'صالة عائلية', type: 'living', area: 28, position: 'middle', side: 'any' }];
  const model = { id: 'unchanged-live-model', plot, program };
  const session = createStudioSession({ id: 'transaction-fixture' });
  appendStudioMessage(session, { role: 'user', source: 'customer', text: 'وسع الصالة.' });
  const state = { studioSession: session, model, program: structuredClone(program), palette: 'classic', clientDesires: [{ id: 'old-desire' }], manualEdits: false, requestAppliedPrompt: 'الطلب الأصلي', briefContext: { source: 'old' }, discovery: { likes: [], rejects: [], avoids: [], life: {} }, selectedShape: null, rates: {}, landSurvey: null, alternatives: [], history: [], failures: [], proposal: null, requestProposal: null };
  const worker = deferred();
  const context = {
    state, plot: structuredClone(plot), modelEpoch: 0, generationSequence: 0,
    studioRestoring: false, studioOperationContext: null, studioPending: null, studioProposalSource: null, studioAbort: null,
    exploration: { signature: '', previous: [], seed: 1 },
    workerCalls: [], imports: [], messages: [],
    $, all: () => [], structuredClone, validatePlot, normalizeRooms, requestFingerprint,
    beginStudioOperation, isCurrentStudioOperation, acceptStudioUnderstanding, cancelStudioOperation, invalidateStudioApproval,
    MAX_PROJECT_BYTES: 2_000_000, DESIGN_CHOICES: {},
    window: { confirm: () => true },
    rawPlot: () => structuredClone(context.plot),
    restorePlot: value => { context.plot = structuredClone(value); },
    publicRooms: list => list.map(({ name,type,area,position,side,dimensions }) => ({ name,type,area,position,side,...(dimensions ? { dimensions } : {}) })),
    requestInput: () => ({ prompt: $('idea').value, rooms: context.publicRooms(state.program), plot: context.rawPlot(), discovery: structuredClone(state.discovery), mode: 'modify' }),
    workspaceSignature: (p,r) => JSON.stringify([p,r]), signature: (p,r) => JSON.stringify([p,r]),
    archiveIsCurrent: () => false, renderArchiveControls() {}, syncWorkspace() {}, emitStudioState() {},
    syncPalette() {}, renderDiscovery() {}, rating() {}, toast() {},
    renderRows: () => context.markDirty(), switchTab: () => context.markDirty(),
    message: (id,text) => { $(id).textContent = text; context.messages.push({ id,text }); },
    rebindSolarContext, restoreSolarSettings() {},
    runPlanner: input => { context.workerCalls.push(input); return worker.promise; },
    applyProjectState: (project,detail) => { context.imports.push({ project,detail }); state.model = project.model; },
  };
  vm.createContext(context);
  vm.runInContext(functions + `\nvar api = { ${drawMethod} };
var computeStamp = typeof studioInputStamp === 'function' ? studioInputStamp : () => JSON.stringify([requestFingerprint(requestInput()), state.palette]);`, context);
  return { context, state, $, worker, initial: { model, program: structuredClone(program), plot: structuredClone(plot), palette: state.palette, clientDesires: structuredClone(state.clientDesires), manualEdits: state.manualEdits } };
}
function startDraw(h) {
  const { context:c, state:s, $ } = h;
  c.studioOperationContext = { model: s.model, program: structuredClone(s.program), idea: $('idea').value, applied: s.requestAppliedPrompt, briefContext: structuredClone(s.briefContext), discovery: structuredClone(s.discovery), selectedShape: s.selectedShape, plot: c.rawPlot(), palette: s.palette, clientDesires: structuredClone(s.clientDesires), manualEdits: s.manualEdits };
  $('idea').value = 'وسع الصالة.';
  const operation = beginStudioOperation(s.studioSession, 'understand');
  const fingerprint = requestFingerprint(c.requestInput());
  const brief = { rooms: [{ ...s.program[0], area: 30 }], questions: [], summary: 'توسيع الصالة.', assumptions: [], desires: [{ id: 'proposal-desire' }], palette: 'modern', rejectedShapes: [], plotPatch: { width: 21 }, fingerprint };
  c.studioOperationContext.fingerprint = fingerprint;
  c.studioOperationContext.stamp = c.computeStamp();
  s.requestProposal = brief;
  c.studioProposalSource = 'local';
  c.studioPending = { operation, latest: 'وسع الصالة.', prompt: 'وسع الصالة.', brief, fingerprint };
  const promise = c.api.drawProposal();
  // Attach a rejection observer immediately while the test controls the worker.
  const rejection = assert.rejects(promise, error => { assert.notEqual(error.name, 'ReferenceError', error.stack); assert.notEqual(error.name, 'TypeError', error.stack); return true; });
  assert.equal(c.workerCalls.length, 1, 'Real local applyRequest and generate must reach the worker.');
  return rejection;
}

for (const field of ['room', 'plot', 'palette']) test(`advanced ${field} edits survive cancellation and a late draw completion`, async () => {
  const h = harness(), rejected = startDraw(h);
  if (field === 'room') h.state.program[0].area = 33;
  else if (field === 'plot') h.context.plot.width = 24;
  else h.state.palette = 'hijazi';
  const expected = { program: structuredClone(h.state.program), plot: structuredClone(h.context.plot), palette: h.state.palette };
  h.context.markDirty(); // the existing advanced editor's change path
  h.context.cancelStudioWork();
  h.worker.resolve({ models: [], selectedModel: { id: 'late-worker-model' } });
  await rejected;
  assert.deepEqual(plain(h.state.program), expected.program);
  assert.deepEqual(plain(h.context.plot), expected.plot);
  assert.equal(h.state.palette, expected.palette);
  assert.equal(h.state.model, h.initial.model);
});
for (const field of ['room', 'plot']) test(`newer ${field} draft survives failed draw even before a rendering callback`, async () => {
  const h = harness(), rejected = startDraw(h);
  if (field === 'room') h.state.program[0].area = 34;
  else h.context.plot.width = 25;
  const expected = { program: structuredClone(h.state.program), plot: structuredClone(h.context.plot), palette: h.state.palette };
  h.worker.reject(new Error('simulated worker failure'));
  await rejected;
  assert.deepEqual(plain(h.state.program), expected.program);
  assert.deepEqual(plain(h.context.plot), expected.plot);
  assert.equal(h.state.palette, expected.palette);
});
test('direct cancel never rolls back a newer draft before markDirty runs', async () => {
  const h = harness(), rejected = startDraw(h);
  h.state.program[0].area = 35; h.context.plot.width = 26;
  const expected = { program: structuredClone(h.state.program), plot: structuredClone(h.context.plot), palette: h.state.palette };
  h.context.cancelStudioWork();
  h.worker.resolve({ models: [] });
  await rejected;
  assert.deepEqual(plain(h.state.program), expected.program);
  assert.deepEqual(plain(h.context.plot), expected.plot);
  assert.equal(h.state.palette, expected.palette);
});
test('failed local draw restores palette, desires, edit status and draft when no newer edit exists', async () => {
  const h = harness(), rejected = startDraw(h);
  assert.equal(h.state.palette, 'modern'); assert.equal(h.state.manualEdits, true);
  assert.deepEqual(plain(h.state.clientDesires), [{ id: 'proposal-desire' }]);
  h.worker.reject(new Error('simulated worker failure'));
  await rejected;
  assert.equal(h.state.palette, h.initial.palette);
  assert.deepEqual(plain(h.state.clientDesires), h.initial.clientDesires);
  assert.equal(h.state.manualEdits, h.initial.manualEdits);
  assert.deepEqual(plain(h.state.program), h.initial.program);
  assert.deepEqual(plain(h.context.plot), h.initial.plot);
  assert.equal(h.$('idea').value, 'الطلب الأصلي');
});
for (const change of ['draft', 'message', 'epoch', 'revision']) test(`delayed local import cannot overwrite a new studio ${change}`, async () => {
  const h = harness();
  const importing = h.context.importProject({ size: 5, text: async () => '{}' });
  await new Promise(setImmediate); // cross-realm file.text resolves; worker stays deferred
  assert.equal(h.context.workerCalls.length, 1);
  if (change === 'draft') h.state.studioSession.draftText = 'نص أحدث أثناء القراءة';
  if (change === 'message') appendStudioMessage(h.state.studioSession, { role: 'user', source: 'customer', text: 'رسالة أحدث أثناء القراءة' });
  if (change === 'epoch') cancelStudioOperation(h.state.studioSession);
  if (change === 'revision') h.state.studioSession.revision++;
  h.worker.resolve({ project: { model: { id: 'imported-old-result' } } });
  await importing;
  assert.equal(h.context.imports.length, 0);
  assert.equal(h.state.model, h.initial.model);
  assert.match(h.$('projectStatus').textContent, /تغيّرت المدخلات/);
  assert.equal(h.$('gen').disabled, false);
});
test('local import still applies after its worker resolves if the session did not change', async () => {
  const h = harness(), project = { model: { id: 'valid-import' } };
  const importing = h.context.importProject({ size: 5, text: async () => '{}' });
  await new Promise(setImmediate); h.worker.resolve({ project }); await importing;
  assert.equal(h.context.imports.length, 1);
  assert.equal(h.state.model, project.model);
});

test('message entered while local file bytes are still loading prevents replacement', async () => {
  const h = harness(), file = deferred();
  const importing = h.context.importProject({ size: 5, text: () => file.promise });
  appendStudioMessage(h.state.studioSession, { role: 'user', source: 'customer', text: 'أبق الجلسة الحالية.' });
  file.resolve('{}');
  await new Promise(setImmediate);
  assert.equal(h.context.workerCalls.length, 1);
  h.worker.resolve({ project: { model: { id: 'stale-file-model' } } });
  await importing;
  assert.equal(h.context.imports.length, 0);
  assert.equal(h.state.model, h.initial.model);
  assert.equal(h.state.studioSession.messages.at(-1).text, 'أبق الجلسة الحالية.');
});
