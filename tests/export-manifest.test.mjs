// EX-01 — Export Provenance Manifest. Traceability only: the manifest names the exported bytes, the verified identity
// of the source model and the app build. It must never alter export content or geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defaultRooms, normalizeRooms, validatePlot } from '../dist/planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { quantitiesCSV } from '../dist/project.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { buildExportManifest, identityOf, manifestFileName, serializeManifest, loadAppVersion, downloadManifest, MANIFEST_SCHEMA } from '../dist/export-manifest.mjs';

const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const out = await runMultiEngineDesign({ plot, rooms: normalizeRooms(defaultRooms()), selectedShape: 'rect', idea: '', seed: 1 });
const model = out.selectedModel;
const APP = { commit: '6af0b04570f2f3460b4591ca464dcff18a23ccb3', builtAt: '2026-10-14T10:13:13.514Z' };
const NOW = new Date('2026-10-14T12:00:00.000Z');
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('manifest binds the exact exported bytes (SHA-256 equals an independent Node hash) for text and binary payloads', async () => {
  const csv = quantitiesCSV(model, {}, 10, 15), svg = buildPlanSVG(model), png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128]);
  for (const [kind, fileName, payload] of [['archive-csv', 'q.csv', csv], ['archive-svg', 'p.svg', svg], ['board-png', 'b.png', png]]) {
    const m = await buildExportManifest({ kind, fileName, payload, model, app: APP, now: NOW });
    assert.equal(m.export.sha256, sha(typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload)));
    assert.equal(m.export.bytes, typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length);
    assert.equal(m.schema, MANIFEST_SCHEMA);
  }
});

test('manifest carries candidateId, geometryHash, review state and app build; identity is re-verified, not just copied', async () => {
  const m = await buildExportManifest({ kind: 'archive-csv', fileName: 'q.csv', payload: 'x', model, app: APP, now: NOW });
  assert.equal(m.source.identityStatus, 'VERIFIED');
  assert.equal(m.source.candidateId, model.integration.candidateId);
  assert.equal(m.source.geometryHash, model.integration.geometryHash.value);
  assert.equal(m.source.geometryHashRecomputed, m.source.geometryHash);
  assert.equal(m.source.geometryMatches, true);
  assert.equal(m.source.reviewId, model.integration.reviewId);
  assert.equal(m.source.reviewOverall, model.integration.reviewOverall);
  assert.deepEqual(m.app, APP);
});

test('a model whose geometry no longer matches its stored hash is reported MISMATCH, never VERIFIED', async () => {
  const tampered = structuredClone(model);
  tampered.openings.find((o) => o.type === 'window' && typeof o.pos === 'number').pos += 0.05;
  const m = await buildExportManifest({ kind: 'board-svg', fileName: 'b.svg', payload: 'x', model: tampered, app: APP, now: NOW });
  assert.equal(m.source.identityStatus, 'MISMATCH');
  assert.equal(m.source.geometryMatches, false);
  assert.notEqual(m.source.geometryHashRecomputed, m.source.geometryHash);
});

test('an edited (identity-invalidated) model is reported INVALIDATED with requiresReview and lineage; legacy model without identity is NONE', async () => {
  const edited = structuredClone(model);
  edited.integration = { previousCandidateId: model.integration.candidateId, candidateId: null, geometryHash: null, reviewId: null, reviewOverall: 'NOT_EVALUATED', reviewCoverage: null, requiresReview: true };
  const a = await identityOf(edited);
  assert.equal(a.identityStatus, 'INVALIDATED'); assert.equal(a.requiresReview, true); assert.equal(a.previousCandidateId, model.integration.candidateId); assert.equal(a.candidateId, null);
  const legacy = structuredClone(model); delete legacy.integration;
  assert.equal((await identityOf(legacy)).identityStatus, 'NONE');
});

test('drawing-studio exports have no candidate identity: status NONE plus the SHA-256 of the exact document (honest, AR-01)', async () => {
  const doc = '{"schema":"mizan-draw/1","title":"x"}';
  const m = await buildExportManifest({ kind: 'studio-dxf', fileName: 'x.dxf', payload: '0\nEOF', studioDocument: doc, app: APP, now: NOW });
  assert.equal(m.source.sourceKind, 'studio-document'); assert.equal(m.source.identityStatus, 'NONE'); assert.equal(m.source.candidateId, null);
  assert.equal(m.source.documentSha256, sha(Buffer.from(doc)));
});

test('building a manifest never mutates the model or the payload, and is deterministic for equal inputs', async () => {
  const before = JSON.stringify(model);
  const payload = new Uint8Array([1, 2, 3]), copy = [...payload];
  const a = await buildExportManifest({ kind: 'k', fileName: 'f.png', payload, model, app: APP, now: NOW });
  const b = await buildExportManifest({ kind: 'k', fileName: 'f.png', payload, model, app: APP, now: NOW });
  assert.equal(JSON.stringify(model), before); assert.deepEqual([...payload], copy);
  assert.equal(serializeManifest(a), serializeManifest(b));
});

test('file naming: sidecar keeps the full file name, so svg and png of the same base name never collide (review #5)', () => {
  assert.equal(manifestFileName('mizan-handasi-plan.svg'), 'mizan-handasi-plan.svg.manifest.json');
  assert.equal(manifestFileName('mizan-board-2026-10-14.svg') === manifestFileName('mizan-board-2026-10-14.png'), false);
  assert.equal(manifestFileName('a.b.csv'), 'a.b.csv.manifest.json');
});

test('loadAppVersion: success is cached; a failure is NOT cached (a transient error must not freeze the commit at null)', async () => {
  const bad = await loadAppVersion(async () => { throw new Error('offline'); }, { fresh: true });
  assert.deepEqual(bad, { commit: null, builtAt: null });
  const notOk = await loadAppVersion(async () => ({ ok: false }), { fresh: true });
  assert.deepEqual(notOk, { commit: null, builtAt: null });
  let calls = 0;
  const ok = await loadAppVersion(async () => { calls++; return { ok: true, json: async () => APP }; }, { fresh: true });
  assert.deepEqual(ok, APP); assert.equal(calls, 1);
  const again = await loadAppVersion(async () => { throw new Error('must not be called'); });
  assert.deepEqual(again, APP, 'cached after a success');
});

test('downloadManifest: hands save() the sidecar name and a JSON blob that hashes the exact payload; never throws or alters the export', async () => {
  const payload = new Uint8Array([9, 8, 7, 6]), saved = [];
  const m = await downloadManifest({ kind: 'k', fileName: 'x.png', mime: 'image/png', payload, model, app: APP }, (blob, name) => saved.push({ blob, name }));
  assert.equal(saved.length, 1); assert.equal(saved[0].name, 'x.png.manifest.json');
  const body = JSON.parse(await saved[0].blob.text());
  assert.equal(body.export.sha256, sha(Buffer.from(payload))); assert.deepEqual(body, JSON.parse(JSON.stringify(m)));
  assert.deepEqual([...payload], [9, 8, 7, 6], 'payload untouched');
  assert.equal(await downloadManifest({ kind: 'k', fileName: 'x.png', payload, model, app: APP }, () => { throw new Error('browser refused'); }), null, 'a failing save never propagates');
  assert.equal(await downloadManifest({ kind: '', fileName: '', payload }, () => {}), null, 'bad args never propagate');
});

test('every export site is wired to the manifest (source-level guard; PDF/print and the project JSON are documented exceptions)', () => {
  const src = (f) => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
  assert.match(src('app.mjs'), /downloadManifest\(\{ kind: 'archive-' \+ kind/);
  const ui = src('presentation-ui.mjs'); assert.match(ui, /saveWithManifest\(new Blob.*'board-svg'/s); assert.match(ui, /saveWithManifest\(b, .*'board-png'/);
  const st = src('studio.mjs'); for (const k of ['studio-3d-png', 'studio-plan-png', 'studio-dxf']) assert.ok(st.includes(`'${k}'`), k);
  assert.equal((st.match(/exportWithManifest\(/g) || []).length, 5, 'definition + 4 call sites (shot3d, png, png3d, dxf)');
});
