// DEC-002 / ID-01 — a restored model whose geometry no longer matches its stored geometryHash must not keep
// presenting a stale candidateId / review as if it were verified. Fail CLOSED to "needs review"; never reject the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, normalizeRooms, validatePlot } from '../dist/planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { encodeProject, decodeProject } from '../dist/project.mjs';

const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const rooms = normalizeRooms(defaultRooms());
const out = await runMultiEngineDesign({ plot, rooms, selectedShape: 'rect', idea: '', seed: 1 });
const save = (model) => encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 10, vat: 15, idea: '', discovery: { likes: [], rejects: [], avoids: [], life: {} }, model });
const text = save(out.selectedModel);

test('untouched project: identity survives restore unchanged and is not flagged', () => {
  const m = decodeProject(text).model;
  assert.deepEqual(m.integration, out.selectedModel.integration);
  assert.notEqual(m.integration.requiresReview, true);
});

test('tampered door position: restored identity is invalidated and flagged for review', () => {
  const t = JSON.parse(text);
  const door = t.design.embedded.openings.find((o) => o.type === 'door' && typeof o.pos === 'number');
  door.pos += 0.1;
  const m = decodeProject(JSON.stringify(t)).model;
  assert.equal(m.integration.candidateId, null, 'stale candidateId must not survive');
  assert.equal(m.integration.geometryHash, null);
  assert.equal(m.integration.reviewId, null);
  assert.equal(m.integration.reviewOverall, 'NOT_EVALUATED');
  assert.equal(m.integration.requiresReview, true);
  assert.equal(m.integration.previousCandidateId, out.selectedModel.integration.candidateId, 'lineage kept');
  assert.equal(m.integration.restoreCheck, 'GEOMETRY_HASH_MISMATCH');
});

test('tampered room size is rejected earlier by the existing validateModel gate (defence in depth, unchanged)', () => {
  const t = JSON.parse(text);
  t.design.embedded.rooms[0].w -= 0.01;
  assert.throws(() => decodeProject(JSON.stringify(t)), /المساحة غير مطابقة/);
});

test('tampered window (passes every earlier validator) is caught by the identity check', () => {
  const t = JSON.parse(text);
  const win = t.design.embedded.openings.find((o) => o.type === 'window' && typeof o.pos === 'number');
  assert.ok(win, 'fixture has a window');
  win.pos += 0.05;
  const m = decodeProject(JSON.stringify(t)).model;
  assert.equal(m.integration.requiresReview, true);
  assert.equal(m.integration.candidateId, null);
  assert.equal(m.integration.restoreCheck, 'GEOMETRY_HASH_MISMATCH');
});

test('forged geometryHash value is detected (hash edited instead of geometry)', () => {
  const t = JSON.parse(text);
  t.design.embedded.integration.geometryHash.value = '0'.repeat(64);
  const m = decodeProject(JSON.stringify(t)).model;
  assert.equal(m.integration.requiresReview, true);
  assert.equal(m.integration.candidateId, null);
});

test('the file is still readable after a mismatch (no rejection) and the flag survives re-save/re-open', () => {
  const t = JSON.parse(text);
  t.design.embedded.openings.find((o) => o.type === 'door' && typeof o.pos === 'number').pos += 0.1;
  const first = decodeProject(JSON.stringify(t));
  const again = decodeProject(save(first.model));
  assert.equal(again.model.integration.requiresReview, true);
  assert.equal(again.model.integration.candidateId, null);
});

test('legacy models without integration are untouched', () => {
  const t = JSON.parse(text);
  delete t.design.embedded.integration;
  const m = decodeProject(JSON.stringify(t)).model;
  assert.equal(m.integration, undefined);
});
