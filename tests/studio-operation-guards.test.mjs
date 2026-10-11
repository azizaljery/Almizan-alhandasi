import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createStudioSession, appendStudioMessage, beginStudioOperation, isCurrentStudioOperation, acceptStudioUnderstanding, bindStudioRevision, cancelStudioOperation } from '../dist/studio-session.mjs';

// Exercise the actual public method without booting the DOM or contacting an AI
// service. Only its asynchronous generation boundary and UI dependencies are fake.
const source = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const start = source.indexOf('  async drawProposal(');
const end = source.indexOf('\n  showAdvanced()', start);
if (start < 0 || end < 0) throw Error('Cannot locate the public drawProposal method for behavioral testing.');
const method = source.slice(start, end);

for (const mode of ['ai', 'local']) {
  test(`${mode} draw cannot claim an unrelated replacement when its generation installs nothing`, async () => {
    let finishGeneration;
    const generation = new Promise(resolve => { finishGeneration = resolve; });
    const before = { id: 'original-model', geometryRevision: 0 };
    const newer = { id: 'manual-edit-during-generation', geometryRevision: 1 };
    const studioSession = createStudioSession({ id: `draw-guard-${mode}` });
    appendStudioMessage(studioSession, { role: 'user', source: 'customer', text: 'حافظ على المطبخ.' });
    const operation = beginStudioOperation(studioSession, 'understand');
    let generationStarted = false;
    const waitForGeneration = () => { generationStarted = true; return generation; };
    const context = {
      state: {
        studioSession,
        model: before,
        proposal: { rooms: [{ name: 'kitchen' }], questions: [] },
        proposalFingerprint: 'unchanged-inputs',
        requestProposal: { rooms: [{ name: 'kitchen' }], questions: [], fingerprint: 'unchanged-inputs' },
        alternatives: [before], failures: [],
      },
      studioProposalSource: mode,
      studioPending: {
        operation, latest: 'حافظ على المطبخ.', prompt: 'حافظ على المطبخ.',
        brief: { summary: 'الحفاظ على المطبخ.', questions: [], assumptions: [] },
        fingerprint: 'unchanged-inputs',
      },
      studioOperationContext: { model: before },
      studioAbort: null,
      beginStudioOperation, isCurrentStudioOperation, acceptStudioUnderstanding,
      assertStudioOperation: token => {
        if (!isCurrentStudioOperation(studioSession, token)) throw Error('STALE_STUDIO_OPERATION');
      },
      cancelStudioWork: () => cancelStudioOperation(studioSession),
      modelEpoch: 0,
      structuredClone,
      requestInput: () => ({}),
      requestFingerprint: () => 'unchanged-inputs',
      $: () => ({ textContent: 'نتيجة التوليد قديمة؛ لم يثبت هذا الطلب مخططًا.' }),
      applyRequest: () => { context.state.requestProposal = null; },
      generate: waitForGeneration,
      drawFromAIProposal: waitForGeneration,
    };
    vm.createContext(context);
    vm.runInContext(`var api = { ${method} };`, context);
    const pending = context.api.drawProposal();
    assert.equal(generationStarted, true, 'The actual draw method must reach generation before the competing edit.');

    // An opening-only edit leaves request inputs unchanged. The real generate()
    // rejects its stale worker result and currently catches that error internally,
    // so the awaiting caller receives no installed result.
    context.state.model = newer;
    context.state.alternatives = [newer];
    context.modelEpoch++;
    bindStudioRevision(studioSession, newer, 'edit');
    finishGeneration(undefined);

    await assert.rejects(pending, error => {
      // Missing harness dependencies are test failures, not successful rejection.
      assert.notEqual(error.name, 'ReferenceError');
      assert.notEqual(error.name, 'TypeError');
      return true;
    }, 'A different live model is not proof that this draw operation succeeded.');
    assert.equal(context.state.model, newer);
    assert.equal(context.state.alternatives[0], newer);
  });
}
