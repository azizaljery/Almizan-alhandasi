import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import archiveWorker from '../worker/site-archive.mjs';
import { defaultRooms, generateModel, generateTopologyModel, validateModel, removeOpening, openingPoint } from '../dist/planner.mjs';
import { encodeProject, decodeProject, quantitiesCSV } from '../dist/project.mjs';
import { quantityRows, estimate } from '../dist/estimates.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';

class Prepared {
  constructor(database, sql) { this.database = database; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.database.sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.database.sqlite.prepare(this.sql).all(...this.values) }; }
  async run() {
    const result = this.database.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    const migrations = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries.map(entry => `drizzle/${entry.tag}.sql`)
      .map(file => readFileSync(file, 'utf8').replace(/--> statement-breakpoint/g, '\n')).join('\n');
    this.sqlite.exec(migrations);
    this.failNextBatch = false;
    this.beforeNextBatch = null;
  }
  prepare(sql) { return new Prepared(this, sql); }
  async batch(statements) {
    const before = this.beforeNextBatch;
    this.beforeNextBatch = null;
    if (before) await before();
    if (this.failNextBatch) { this.failNextBatch = false; throw new Error('simulated d1 unavailable'); }
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close() { this.sqlite.close(); }
}

const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { n: false, s: true, e: false, w: false }, streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null };
const rooms = defaultRooms({ bedrooms: 2, majlis: 1, baths: 1, kitchens: 1, halls: 1, dining: 1 });
function project({ width = plot.width, palette = 'resort', name = 'منزل الاختبار', model: suppliedModel = null, plot: suppliedPlot = null, rooms: suppliedRooms = null, landSurvey = null } = {}) {
  const p = suppliedPlot ? structuredClone(suppliedPlot) : { ...plot, width };
  const program = suppliedRooms || rooms;
  const model = suppliedModel || generateModel(p, program);
  return encodeProject({ plot: p, rooms: program, palette, rates: { walls: 120 }, costReserve: 5, vat: 15, idea: name, discovery: { likes: [], rejects: [], avoids: [], life: {} }, model, alternatives: [], history: [], landSurvey, modelLandSurvey: landSurvey });
}
function makeRequest(path, { method = 'GET', user = 'user-a', origin = 'https://site.test', body, headers = {} } = {}) {
  return new Request(`https://site.test${path}`, { method, headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(origin ? { origin } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function call(db, path, options = {}) { return archiveWorker.fetch(makeRequest(path, options), { TRUST_SITES_HEADER: '1', DB: db, ASSETS: { fetch: async () => new Response('asset') } }); }

let db;
before(() => { db = new LocalD1(); });
after(() => { db.close(); });

test('default API uses the Sites forwarded user ID, ignores client ownership, and rejects missing identity', async () => {
  const before = db.sqlite.prepare('SELECT count(*) AS count FROM archive_designs').get().count;
  const emailOnly = await call(db, '/api/archive/designs', { user: null, headers: { 'oai-authenticated-user-email': 'person@example.test' } });
  assert.equal(emailOnly.status, 401);
  assert.equal((await emailOnly.json()).error, 'sign_in_required');
  const clientOwner = await call(db, '/api/archive/designs', {
    method: 'POST', user: 'sites-forwarded-user',
    body: { owner: 'attacker', ownerUserId: 'attacker', project: project(), title: 'محاولة', idempotencyKey: 'idempotency-key-identity-01' },
  });
  assert.equal(clientOwner.status, 400);
  assert.equal((await clientOwner.json()).error, 'invalid_request');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM archive_designs').get().count, before);
  const session = await call(db, '/api/archive/session', { user: 'sites-forwarded-user' });
  assert.deepEqual(await session.json(), { authenticated: true, storageReady: true });
});

test('session, sign-in, same-origin writes, and D1 failure fail closed', async () => {
  const noDb = await archiveWorker.fetch(makeRequest('/api/archive/session', { user: null }), {});
  assert.equal(noDb.status, 503); assert.equal((await noDb.json()).storageReady, undefined);
  const session = await call(db, '/api/archive/session', { user: null });
  assert.deepEqual(await session.json(), { authenticated: false, storageReady: true });
  const anonymous = await call(db, '/api/archive/designs', { user: null });
  assert.equal(anonymous.status, 401);
  const crossSite = await call(db, '/api/archive/designs', { method: 'POST', origin: 'https://attacker.test', body: { project: project(), title: 'تجربة', idempotencyKey: 'idempotency-key-0001' } });
  assert.equal(crossSite.status, 403);
  const staleProject = JSON.parse(project()); staleProject.draft.plot.width = 22;
  const stale = await call(db, '/api/archive/designs', { method: 'POST', body: { project: JSON.stringify(staleProject), title: 'مدخلات قديمة', idempotencyKey: 'idempotency-key-stale-model-01' } });
  assert.equal(stale.status, 400); assert.equal((await stale.json()).error, 'stale_model');
  db.failNextBatch = true;
  const unavailable = await call(db, '/api/archive/designs', { method: 'POST', body: { project: project(), title: 'شبكة', idempotencyKey: 'idempotency-key-0002' } });
  assert.equal(unavailable.status, 503); assert.match((await unavailable.json()).message, /بقيت مدخلاتك/);
});

test('create, idempotent replay, exact saved model, versions, optimistic update, and ownership isolation', async () => {
  const projectText = project();
  const altered = JSON.parse(projectText); altered.apiKey = 'DO-NOT-ARCHIVE'; altered.draft.accessCode = 'DO-NOT-ARCHIVE';
  const first = await call(db, '/api/archive/designs', { method: 'POST', body: { project: JSON.stringify(altered), title: 'بيتي', idempotencyKey: 'idempotency-key-create-0001' } });
  assert.equal(first.status, 201);
  const created = await first.json(); assert.equal(created.version, 1); const id = created.designId;
  const replay = await call(db, '/api/archive/designs', { method: 'POST', body: { project: projectText, title: 'بيتي', idempotencyKey: 'idempotency-key-create-0001' } });
  assert.equal(replay.status, 200); assert.equal((await replay.json()).designId, id);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM archive_design_versions').get().count, 1);
  const listA = await call(db, '/api/archive/designs'); assert.equal((await listA.json()).designs.length, 1);
  const listB = await call(db, '/api/archive/designs', { user: 'user-b' }); assert.equal((await listB.json()).designs.length, 0);
  const hidden = await call(db, `/api/archive/designs/${id}`, { user: 'user-b' }); assert.equal(hidden.status, 404);
  const saved = await call(db, `/api/archive/designs/${id}`); const savedBody = await saved.json();
  assert.equal(saved.status, 200); assert.equal(savedBody.version, 1); assert.ok(savedBody.model.rooms.length);
  assert.ok(!savedBody.project.includes('DO-NOT-ARCHIVE'));
  assert.equal(savedBody.decisionTrace.source, 'server-derived-from-validated-project');
  assert.equal(savedBody.geometryPolicyVersion, 'mizan-novelty-v2');
  assert.ok(savedBody.noveltyHash && savedBody.exactGeometryHash && savedBody.receiptId);
  const receipt = db.sqlite.prepare('SELECT novelty_hash, exact_geometry_hash, geometry_policy_version FROM archive_receipts WHERE receipt_id = ?').get(savedBody.receiptId);
  assert.equal(receipt.novelty_hash, savedBody.noveltyHash);
  assert.equal(receipt.exact_geometry_hash, savedBody.exactGeometryHash);
  assert.equal(receipt.geometry_policy_version, savedBody.geometryPolicyVersion);
  const restoredProject = decodeProject(savedBody.project);
  const svg = await call(db, `/api/archive/designs/${id}/exports/svg`, { method: 'POST', body: { receiptId: savedBody.receiptId, expectedVersion: 1 } });
  assert.equal(svg.status, 200); assert.equal(await svg.text(), buildPlanSVG(savedBody.model));
  const csv = await call(db, `/api/archive/designs/${id}/exports/csv`, { method: 'POST', body: { receiptId: savedBody.receiptId, expectedVersion: 1 } });
  assert.equal(csv.status, 200); assert.equal(await csv.text(), quantitiesCSV(savedBody.model, restoredProject.rates, restoredProject.costReserve, restoredProject.vat).replace(/^\uFEFF/, ''));
  const invalidReceipt = await call(db, `/api/archive/designs/${id}/exports/svg`, { method: 'POST', body: { receiptId: '00000000-0000-4000-8000-000000000000', expectedVersion: 1 } });
  assert.equal(invalidReceipt.status, 409);
  const versions = await call(db, `/api/archive/designs/${id}/versions`); assert.equal((await versions.json()).versions.length, 1);

  const update = await call(db, `/api/archive/designs/${id}`, { method: 'PUT', body: { project: project({ width: 22, palette: 'modern' }), title: 'بيتي المعدل', idempotencyKey: 'idempotency-key-update-0001', expectedVersion: 1 } });
  assert.equal(update.status, 200, await update.clone().text()); assert.equal((await update.json()).version, 2);
  const staleReceipt = await call(db, `/api/archive/designs/${id}/exports/svg`, { method: 'POST', body: { receiptId: savedBody.receiptId, expectedVersion: 1 } });
  assert.equal(staleReceipt.status, 409); assert.equal((await staleReceipt.json()).error, 'archive_receipt_stale');
  const reusedOnAnotherVersion = await call(db, `/api/archive/designs/${id}`, { method: 'PUT', body: { project: project({ width: 22, palette: 'modern' }), title: 'بيتي المعدل', idempotencyKey: 'idempotency-key-update-0001', expectedVersion: 2 } });
  assert.equal(reusedOnAnotherVersion.status, 409); assert.equal((await reusedOnAnotherVersion.json()).error, 'idempotency_conflict');
  db.failNextBatch = true;
  const failedUpdate = await call(db, `/api/archive/designs/${id}`, { method: 'PUT', body: { project: project({ width: 23, palette: 'classic' }), title: 'إعادة محاولة', idempotencyKey: 'idempotency-key-update-retry-01', expectedVersion: 2 } });
  assert.equal(failedUpdate.status, 503); assert.equal(db.sqlite.prepare('SELECT current_version FROM archive_designs WHERE id = ?').get(id).current_version, 2);
  const retriedUpdate = await call(db, `/api/archive/designs/${id}`, { method: 'PUT', body: { project: project({ width: 23, palette: 'classic' }), title: 'إعادة محاولة', idempotencyKey: 'idempotency-key-update-retry-01', expectedVersion: 2 } });
  assert.equal(retriedUpdate.status, 200); assert.equal((await retriedUpdate.json()).version, 3);
  const stale = await call(db, `/api/archive/designs/${id}`, { method: 'PUT', body: { project: project({ width: 22 }), title: 'نسخة قديمة', idempotencyKey: 'idempotency-key-stale-0001', expectedVersion: 1 } });
  assert.equal(stale.status, 409);
  const versionOne = await call(db, `/api/archive/designs/${id}/versions/1`); assert.equal((await versionOne.json()).version, 1);
  const ownKeyConflict = await call(db, '/api/archive/designs', { method: 'POST', body: { project: project(), title: 'مختلف', idempotencyKey: 'idempotency-key-create-0001' } });
  assert.equal(ownKeyConflict.status, 409);
});

test('idempotency records bind owner, operation, target design, expected version, and payload', async () => {
  const isolated = new LocalD1();
  try {
    const first = await call(isolated, '/api/archive/designs', { user: 'same-user', method: 'POST', body: { project: project(), title: 'أول', idempotencyKey: 'idempotency-key-cross-design' } });
    const id1 = (await first.json()).designId;
    const second = await call(isolated, '/api/archive/designs', { user: 'same-user', method: 'POST', body: { project: project({ width: 24 }), title: 'ثانٍ', idempotencyKey: 'idempotency-key-second-create' } });
    const id2 = (await second.json()).designId;
    const crossOperation = await call(isolated, `/api/archive/designs/${id1}`, { user: 'same-user', method: 'PUT', body: { project: project({ width: 22 }), title: 'عملية مختلفة', idempotencyKey: 'idempotency-key-cross-design', expectedVersion: 1 } });
    assert.equal(crossOperation.status, 409); assert.equal((await crossOperation.json()).error, 'idempotency_conflict');
    const sameKeyOtherOwner = await call(isolated, '/api/archive/designs', { user: 'other-user', method: 'POST', body: { project: project({ width: 26 }), title: 'مالك آخر', idempotencyKey: 'idempotency-key-cross-design' } });
    assert.equal(sameKeyOtherOwner.status, 201, await sameKeyOtherOwner.clone().text());
    const update1 = await call(isolated, `/api/archive/designs/${id1}`, { user: 'same-user', method: 'PUT', body: { project: project({ width: 22 }), title: 'تحديث', idempotencyKey: 'idempotency-key-cross-design-update', expectedVersion: 1 } });
    assert.equal(update1.status, 200, await update1.clone().text());
    const wrongTarget = await call(isolated, `/api/archive/designs/${id2}`, { user: 'same-user', method: 'PUT', body: { project: project({ width: 22 }), title: 'تحديث', idempotencyKey: 'idempotency-key-cross-design-update', expectedVersion: 1 } });
    assert.equal(wrongTarget.status, 409); assert.equal((await wrongTarget.json()).error, 'idempotency_conflict');
    const stored = isolated.sqlite.prepare('SELECT operation, target_design_id, expected_version FROM archive_idempotency WHERE owner_user_id = ? AND idempotency_key = ?').get('same-user', 'idempotency-key-cross-design');
    assert.deepEqual({ ...stored }, { operation: 'create', target_design_id: '', expected_version: 0 });
    const updateStored = isolated.sqlite.prepare('SELECT operation, target_design_id, expected_version FROM archive_idempotency WHERE owner_user_id = ? AND idempotency_key = ?').get('same-user', 'idempotency-key-cross-design-update');
    assert.deepEqual({ ...updateStored }, { operation: 'update', target_design_id: id1, expected_version: 1 });
  } finally { isolated.close(); }
});

test('global novelty fingerprint claims hide the other owner and record id', async () => {
  const response = await call(db, '/api/archive/designs', { method: 'POST', user: 'user-b', body: { project: project(), title: 'محاولة', idempotencyKey: 'idempotency-key-cross-0001' } });
  assert.equal(response.status, 409);
  const error = await response.json();
  assert.equal(error.error, 'geometry_already_archived');
  assert.equal(JSON.stringify(error).includes('user-a'), false);
  assert.equal(Object.hasOwn(error, 'designId'), false);
});

test('delete is owner-scoped and leaves geometry-only tombstones that permanently reserve prior versions', async () => {
  const isolated = new LocalD1();
  try {
    const created = await call(isolated, '/api/archive/designs', { user: 'user-a', method: 'POST', body: { project: project(), title: 'ملكي', idempotencyKey: 'idempotency-key-delete-create' } });
    const design = await created.json();
    const updated = await call(isolated, `/api/archive/designs/${design.designId}`, { user: 'user-a', method: 'PUT', body: { project: project({ width: 22 }), title: 'ملكي المعدل', idempotencyKey: 'idempotency-key-delete-update', expectedVersion: 1 } });
    assert.equal(updated.status, 200, await updated.clone().text());
    const denied = await call(isolated, `/api/archive/designs/${design.designId}`, { method: 'DELETE', user: 'user-b', body: { expectedVersion: 2 } });
    assert.equal(denied.status, 404);
    const deleted = await call(isolated, `/api/archive/designs/${design.designId}`, { method: 'DELETE', body: { expectedVersion: 2 } });
    assert.equal(deleted.status, 200); assert.deepEqual(await deleted.json(), { deleted: true });
    const tombstones = isolated.sqlite.prepare('SELECT novelty_hash, owner_user_id, design_id, tombstoned_at FROM archive_geometry_claims').all();
    assert.equal(tombstones.length, 2);
    assert.ok(tombstones.every(row => row.owner_user_id === null && row.design_id === null && row.tombstoned_at !== null));
    const replacement = await call(isolated, '/api/archive/designs', { user: 'user-b', method: 'POST', body: { project: project(), title: 'ملكي', idempotencyKey: 'idempotency-key-recreate-0001' } });
    assert.equal(replacement.status, 409); assert.equal((await replacement.json()).error, 'geometry_already_archived');
    const replacementVersion = await call(isolated, '/api/archive/designs', { user: 'user-b', method: 'POST', body: { project: project({ width: 22 }), title: 'ملكي', idempotencyKey: 'idempotency-key-recreate-0002' } });
    assert.equal(replacementVersion.status, 409); assert.equal((await replacementVersion.json()).error, 'geometry_already_archived');
  } finally { isolated.close(); }
});

test('integrated P1 staggered polygon survives archive, reopening, quantities, openings, and server export', async () => {
  const isolated = new LocalD1();
  try {
    const p1Plot = { width: 35, length: 35, floors: 1, streets: { n: false, s: true, e: false, w: false }, entry: 's', streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null };
    const p1Rooms = defaultRooms({ bedrooms: 1, majlis: 0, baths: 1, kitchens: 1, halls: 1, dining: 0 });
    const generated = await runMultiEngineDesign({ plot: p1Plot, rooms: p1Rooms, selectedShape: 'staggered', seed: 1 });
    const model = generated.selectedModel;
    assert.equal(model.engineVersion, 'mizan-p1-integrated');
    assert.equal(model.shape, 'staggered');
    assert.equal(model.buildingFootprint.length, 12);
    assert.deepEqual(validateModel(model), []);
    const projectText = project({ plot: p1Plot, rooms: model.program, model, name: 'P1 متدرج' });
    const beforeProject = decodeProject(projectText);
    const beforeRows = quantityRows(model), beforeTotals = estimate(beforeRows, beforeProject.rates, beforeProject.costReserve, beforeProject.vat);
    const created = await call(isolated, '/api/archive/designs', { user: 'p1-user', method: 'POST', body: { project: projectText, title: 'P1 متدرج', idempotencyKey: 'idempotency-key-p1-staggered' } });
    assert.equal(created.status, 201, await created.clone().text());
    const receipt = await created.json();
    const savedResponse = await call(isolated, `/api/archive/designs/${receipt.designId}/versions/1`, { user: 'p1-user' });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    const reopened = decodeProject(saved.project);
    assert.deepEqual(validateModel(saved.model), []);
    for (const key of ['plot', 'footprint', 'building', 'buildingFootprint', 'boundingBox', 'rooms', 'corridors', 'courtyards', 'walls', 'openings', 'links', 'massingParts']) {
      assert.deepEqual(saved.model[key] ?? null, model[key] ?? null, `saved ${key}`);
      assert.deepEqual(reopened.model[key] ?? null, model[key] ?? null, `reopened ${key}`);
    }
    assert.equal(saved.model.massingParts.filter(p => p.component === 'wing').length, 2);
    assert.equal(saved.model.massingParts.filter(p => p.component === 'link').length, 1);
    assert.deepEqual(quantityRows(saved.model), beforeRows);
    assert.deepEqual(estimate(quantityRows(saved.model), reopened.rates, reopened.costReserve, reopened.vat), beforeTotals);
    assert.equal(buildPlanSVG(saved.model), buildPlanSVG(model));
    assert.equal(saved.model.openings.length, model.openings.length);
    const svg = await call(isolated, `/api/archive/designs/${receipt.designId}/exports/svg`, { user: 'p1-user', method: 'POST', body: { receiptId: receipt.receiptId, expectedVersion: 1 } });
    assert.equal(svg.status, 200); assert.equal(await svg.text(), buildPlanSVG(model));
    const csv = await call(isolated, `/api/archive/designs/${receipt.designId}/exports/csv`, { user: 'p1-user', method: 'POST', body: { receiptId: receipt.receiptId, expectedVersion: 1 } });
    assert.equal(csv.status, 200); assert.equal(await csv.text(), quantitiesCSV(model, beforeProject.rates, beforeProject.costReserve, beforeProject.vat).replace(/^\uFEFF/, ''));
  } finally { isolated.close(); }
});

test('self-intersecting or missing integrated footprint polygons reject without saving', async () => {
  const isolated = new LocalD1();
  try {
    const p1Plot = { width: 30, length: 35, floors: 1, streets: { n: false, s: true, e: false, w: false }, entry: 's', streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null };
    const p1Rooms = defaultRooms({ bedrooms: 2, majlis: 1, baths: 1, kitchens: 1, halls: 1, dining: 1 });
    const model = (await runMultiEngineDesign({ plot: p1Plot, rooms: p1Rooms, selectedShape: 'rect', seed: 7 })).selectedModel;
    const raw = JSON.parse(project({ plot: p1Plot, rooms: model.program, model }));
    const b = model.boundingBox;
    raw.design.embedded.buildingFootprint = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }];
    const malformed = await call(isolated, '/api/archive/designs', { user: 'polygon-user', method: 'POST', body: { project: JSON.stringify(raw), title: 'مضلع متقاطع', idempotencyKey: 'idempotency-key-bowtie-001' } });
    assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error, 'invalid_project');
    raw.design.embedded.buildingFootprint = undefined;
    const missing = await call(isolated, '/api/archive/designs', { user: 'polygon-user', method: 'POST', body: { project: JSON.stringify(raw), title: 'مضلع مفقود', idempotencyKey: 'idempotency-key-missing-001' } });
    assert.equal(missing.status, 400); assert.equal((await missing.json()).error, 'invalid_project');
    assert.equal(isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_designs').get().count, 0);
  } finally { isolated.close(); }
});

test('archive rejects new versions at its bounded local storage ceiling', async () => {
  const isolated = new LocalD1();
  try {
    const created = await call(isolated, '/api/archive/designs', { user: 'quota-user', method: 'POST', body: { project: project(), title: 'سجل الحصة', idempotencyKey: 'idempotency-key-quota-0001' } });
    const id = (await created.json()).designId;
    const insert = isolated.sqlite.prepare(`INSERT INTO archive_design_versions
      (design_id, owner_user_id, version_number, project_snapshot_json, exact_model_json, novelty_geometry_json, exact_geometry_hash, topology_json, decision_trace_json, novelty_hash, geometry_policy_version, engine_version, created_at)
      VALUES (?, ?, ?, '{}', '{}', '{}', NULL, '{}', '{}', ?, 'mizan-novelty-v2', 'test', ?)`);
    for (let version = 2; version <= 500; version++) insert.run(id, 'quota-user', version, `seed-${version}`, version);
    isolated.sqlite.prepare('UPDATE archive_designs SET current_version = 500 WHERE id = ?').run(id);
    const before = isolated.sqlite.prepare(`SELECT
      (SELECT count(*) FROM archive_designs) AS designs,
      (SELECT count(*) FROM archive_design_versions) AS versions,
      (SELECT count(*) FROM archive_geometry_claims) AS claims,
      (SELECT count(*) FROM archive_receipts) AS receipts,
      (SELECT count(*) FROM archive_idempotency) AS idempotency`).get();
    const capped = await call(isolated, '/api/archive/designs', { user: 'quota-user', method: 'POST', body: { project: project({ width: 22 }), title: 'ما بعد الحد', idempotencyKey: 'idempotency-key-quota-0002' } });
    const after = isolated.sqlite.prepare(`SELECT
      (SELECT count(*) FROM archive_designs) AS designs,
      (SELECT count(*) FROM archive_design_versions) AS versions,
      (SELECT count(*) FROM archive_geometry_claims) AS claims,
      (SELECT count(*) FROM archive_receipts) AS receipts,
      (SELECT count(*) FROM archive_idempotency) AS idempotency`).get();
    assert.equal(capped.status, 507); assert.equal((await capped.json()).error, 'archive_storage_limit');
    assert.deepEqual(after, before);
  } finally { isolated.close(); }
});

test('a same-geometry PUT at the 500-version cap refuses without mutating the design', async () => {
  const isolated = new LocalD1();
  try {
    const created = await call(isolated, '/api/archive/designs', { user: 'quota-same-user', method: 'POST', body: { project: project(), title: 'سجل الحصة', idempotencyKey: 'idempotency-key-quota-same-01' } });
    assert.equal(created.status, 201);
    const first = await created.json(), id = first.designId;
    const insert = isolated.sqlite.prepare(`INSERT INTO archive_design_versions
      (design_id, owner_user_id, version_number, project_snapshot_json, exact_model_json, novelty_geometry_json, exact_geometry_hash, topology_json, decision_trace_json, novelty_hash, geometry_policy_version, engine_version, created_at)
      VALUES (?, ?, ?, '{}', '{}', '{}', NULL, '{}', '{}', ?, 'mizan-novelty-v2', 'test', ?)`);
    for (let version = 2; version <= 499; version++) insert.run(id, 'quota-same-user', version, `seed-${version}`, version);
    isolated.sqlite.prepare('UPDATE archive_designs SET current_version = 499 WHERE id = ?').run(id);

    const finalAllowed = await call(isolated, `/api/archive/designs/${id}`, { user: 'quota-same-user', method: 'PUT', body: { project: project({ width: 22 }), title: 'آخر نسخة مسموحة', idempotencyKey: 'idempotency-key-quota-last-01', expectedVersion: 499 } });
    assert.equal(finalAllowed.status, 200);
    assert.equal((await finalAllowed.json()).version, 500);
    const lostResponseRetry = await call(isolated, `/api/archive/designs/${id}`, { user: 'quota-same-user', method: 'PUT', body: { project: project({ width: 22 }), title: 'آخر نسخة مسموحة', idempotencyKey: 'idempotency-key-quota-last-01', expectedVersion: 499 } });
    assert.equal(lostResponseRetry.status, 200);
    assert.equal((await lostResponseRetry.json()).version, 500);

    const before = {
      design: isolated.sqlite.prepare('SELECT title, current_version, created_at, updated_at FROM archive_designs WHERE id = ?').get(id),
      counts: isolated.sqlite.prepare(`SELECT
        (SELECT count(*) FROM archive_design_versions) AS versions,
        (SELECT count(*) FROM archive_geometry_claims) AS claims,
        (SELECT count(*) FROM archive_receipts) AS receipts,
        (SELECT count(*) FROM archive_idempotency) AS idempotency`).get(),
    };
    const cappedSameGeometry = await call(isolated, `/api/archive/designs/${id}`, { user: 'quota-same-user', method: 'PUT', body: { project: project({ width: 22 }), title: 'يجب ألا يتغير هذا العنوان', idempotencyKey: 'idempotency-key-quota-same-02', expectedVersion: 500 } });
    const after = {
      design: isolated.sqlite.prepare('SELECT title, current_version, created_at, updated_at FROM archive_designs WHERE id = ?').get(id),
      counts: isolated.sqlite.prepare(`SELECT
        (SELECT count(*) FROM archive_design_versions) AS versions,
        (SELECT count(*) FROM archive_geometry_claims) AS claims,
        (SELECT count(*) FROM archive_receipts) AS receipts,
        (SELECT count(*) FROM archive_idempotency) AS idempotency`).get(),
    };
    assert.deepEqual(after, before);
    assert.equal(cappedSameGeometry.status, 507);
    assert.equal((await cappedSameGeometry.json()).error, 'archive_storage_limit');
    assert.equal(isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_design_versions WHERE design_id = ? AND version_number = 501').get(id).count, 0);
  } finally { isolated.close(); }
});

test('a competing archive write that reaches the 500-version cap blocks an in-flight same-geometry PUT atomically', async () => {
  const isolated = new LocalD1();
  try {
    const created = await call(isolated, '/api/archive/designs', { user: 'quota-race-user', method: 'POST', body: { project: project(), title: 'السجل الأصلي', idempotencyKey: 'idempotency-key-quota-race-01' } });
    assert.equal(created.status, 201);
    const id = (await created.json()).designId;
    const insert = isolated.sqlite.prepare(`INSERT INTO archive_design_versions
      (design_id, owner_user_id, version_number, project_snapshot_json, exact_model_json, novelty_geometry_json, exact_geometry_hash, topology_json, decision_trace_json, novelty_hash, geometry_policy_version, engine_version, created_at)
      VALUES (?, ?, ?, '{}', '{}', '{}', NULL, '{}', '{}', ?, 'mizan-novelty-v2', 'test', ?)`);
    for (let version = 2; version <= 499; version++) insert.run(id, 'quota-race-user', version, `seed-${version}`, version);
    isolated.sqlite.prepare('UPDATE archive_designs SET current_version = 499 WHERE id = ?').run(id);

    let stateAfterCompetitor;
    isolated.beforeNextBatch = async () => {
      const competitor = await call(isolated, '/api/archive/designs', { user: 'competing-user', method: 'POST', body: { project: project({ width: 24 }), title: 'حفظ متزامن', idempotencyKey: 'idempotency-key-quota-race-02' } });
      assert.equal(competitor.status, 201);
      stateAfterCompetitor = {
        design: isolated.sqlite.prepare('SELECT title, current_version, created_at, updated_at FROM archive_designs WHERE id = ?').get(id),
        targetVersions: isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_design_versions WHERE design_id = ?').get(id).count,
        targetReceipts: isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_receipts WHERE design_id = ?').get(id).count,
        targetIdempotency: isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_idempotency WHERE design_id = ?').get(id).count,
        totalVersions: isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_design_versions').get().count,
      };
    };
    const refused = await call(isolated, `/api/archive/designs/${id}`, { user: 'quota-race-user', method: 'PUT', body: { project: project(), title: 'تعديل محظور عند السباق', idempotencyKey: 'idempotency-key-quota-race-03', expectedVersion: 499 } });
    assert.equal(refused.status, 507);
    assert.equal((await refused.json()).error, 'archive_storage_limit');
    const after = {
      design: isolated.sqlite.prepare('SELECT title, current_version, created_at, updated_at FROM archive_designs WHERE id = ?').get(id),
      targetVersions: isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_design_versions WHERE design_id = ?').get(id).count,
      targetReceipts: isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_receipts WHERE design_id = ?').get(id).count,
      targetIdempotency: isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_idempotency WHERE design_id = ?').get(id).count,
      totalVersions: isolated.sqlite.prepare('SELECT count(*) AS count FROM archive_design_versions').get().count,
    };
    assert.deepEqual(after, stateAfterCompetitor);
    assert.equal(after.totalVersions, 500);
  } finally { isolated.close(); }
});

test('archive session does not report ready before all migration tables exist', async () => {
  const database = new LocalD1();
  try {
    database.sqlite.exec('DROP TABLE archive_receipts');
    const response = await call(database, '/api/archive/session', { user: null });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'archive_unavailable');
  } finally { database.close(); }
});


test('edited non-integrated geometry survives archive save/open with 22 to 21 openings', async () => {
 const isolated = new LocalD1();
 try {
  const program = defaultRooms(), model = generateModel(plot, program);
  assert.equal(model.openings.length,22);
  const win = model.openings.find(o=>o.type==='window');
  const edited = removeOpening(model,openingPoint(model,win));
  assert.equal(edited.openings.length,21);
  const response=await call(isolated,'/api/archive/designs',{method:'POST',body:{project:project({model:edited,rooms:program}),title:'edited synthetic geometry',idempotencyKey:'edited-window-roundtrip-001'}});
  const receipt=await response.json();assert.equal(response.status,201,JSON.stringify(receipt));
  const opened=await(await call(isolated,`/api/archive/designs/${receipt.designId}`)).json();
  assert.equal(opened.model.openings.length,21);
  const restored=decodeProject(opened.project);
  assert.deepEqual(restored.model.openings,edited.openings);
  assert.deepEqual(opened.model.openings,edited.openings);
  assert.equal(restored.model.openings.some(o=>o.id===win.id),false);
  assert.ok(opened.exactGeometryHash);
 } finally { isolated.close(); }
});

test('archive sanitizer retains topology and explicit built area for both courtyard families', async () => {
 for(const topology of ['courtyard','u-court']) {
  const isolated=new LocalD1();
  try {
   const p={...plot,width:30,length:40},program=defaultRooms(),model=generateTopologyModel(p,program,{topology});
   const response=await call(isolated,'/api/archive/designs',{method:'POST',body:{project:project({model,plot:p,rooms:program}),title:topology,idempotencyKey:'edited-topology-roundtrip-001'}});
   const receipt=await response.json();assert.equal(response.status,201,JSON.stringify(receipt));
   const opened=await(await call(isolated,`/api/archive/designs/${receipt.designId}`)).json();
   assert.equal(opened.model.topology,model.topology);
   assert.equal(opened.model.builtArea,model.builtArea);
   assert.deepEqual(decodeProject(opened.project).model.openings,model.openings);
  } finally {isolated.close();}
 }
});


test('archive retains atomic editor revision and exact committed partition geometry', async () => {
 const { createGeometrySession } = await import('../dist/geometry-session.mjs');
 const isolated = new LocalD1();
 try {
  const model = generateModel(plot, defaultRooms());
  const session = createGeometrySession(model);
  const preview = session.preview({id:'archive-partition-command',type:'move-partition',baseRevision:0,wallId:'wall-6',deltaM:.2});
  const edited = session.commit({previewId:preview.previewId,confirmProgramChange:true}).model;
  const response = await call(isolated,'/api/archive/designs',{method:'POST',body:{project:project({model:edited,rooms:edited.program}),title:'partition geometry',idempotencyKey:'partition-revision-roundtrip-001'}});
  const receipt = await response.json(); assert.equal(response.status,201,JSON.stringify(receipt));
  const opened = await(await call(isolated,`/api/archive/designs/${receipt.designId}`)).json();
  assert.equal(opened.model.geometryRevision,1);
  for (const field of ['rooms','walls','openings','program']) assert.deepEqual(opened.model[field],edited[field]);
  assert.equal(decodeProject(opened.project).model.geometryRevision,1);
 } finally { isolated.close(); }
});

test('archive retains site solar metadata and legacy-unverified association through exact project roundtrip',async()=>{
 const isolated=new LocalD1();try{
  const original=decodeProject(project());const context={version:1,source:'explicit-user',latitude:24.7,longitude:46.7,instant:'2026-06-21T12:00:00+03:00',northAngleDeg:35,northConfirmed:true};
  original.siteSolar=context;original.modelSurveyAssociated=false;original.history=[{model:original.model,palette:original.palette,siteSolar:context,modelSurveyAssociated:false}];
  const response=await call(isolated,'/api/archive/designs',{method:'POST',body:{project:encodeProject(original),title:'solar context',idempotencyKey:'site-solar-roundtrip-001'}});const receipt=await response.json();assert.equal(response.status,201,JSON.stringify(receipt));
  const opened=await(await call(isolated,`/api/archive/designs/${receipt.designId}`)).json(),restored=decodeProject(opened.project);assert.deepEqual(restored.siteSolar,context);assert.equal(restored.modelSurveyAssociated,false);assert.deepEqual(restored.history[0].siteSolar,context);assert.equal(restored.history[0].modelSurveyAssociated,false);
 }finally{isolated.close();}
});
