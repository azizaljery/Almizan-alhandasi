import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createStudioSession, appendStudioMessage, acceptStudioUnderstanding, bindStudioRevision, approveStudioRevision } from '../dist/studio-session.mjs';
import { encodeProject, decodeProject } from '../dist/project.mjs';
import { generateModel, defaultRooms, openingPoint, removeOpening, validatePlot, normalizeRooms } from '../dist/planner.mjs';
import archiveWorker from '../worker/site-archive.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } };
const rooms = defaultRooms();
const model = generateModel(plot, rooms);
const snapshot = { plot, rooms, model, palette: 'modern', rates: {}, costReserve: 0, vat: 0, idea: '' };
const fresh = () => ({ ...createStudioSession({ id: 'studio-project-fixture' }), draftText: 'أريد الحفاظ على المطبخ ونقل الصالة.' });

test('session extension is versioned and round-trips draft without duplicating geometry', () => {
  const studioSession = fresh(), source = structuredClone(studioSession);
  const text = encodeProject({ ...snapshot, studioSession });
  const encoded = JSON.parse(text), restored = decodeProject(text);
  assert.equal(encoded.version, 1);
  assert.equal(encoded.studioSession.version, 1);
  assert.equal(restored.studioSession.draftText, studioSession.draftText);
  assert.deepEqual(restored.model, model);
  assert.deepEqual(studioSession, source);
  assert.equal(restored.studioSession.currentApproval, null);
  assert.equal(Object.hasOwn(encoded.studioSession, 'model'), false);
});
test('old project without session becomes explicit deterministic legacy state', () => {
  const raw = JSON.parse(encodeProject(snapshot)); delete raw.studioSession;
  const first = decodeProject(JSON.stringify(raw)), second = decodeProject(JSON.stringify(raw));
  assert.deepEqual(first.studioSession, second.studioSession);
  assert.equal(first.studioSession.id, 'studio-legacy');
  assert.match(first.studioSession.legacyDisclosure, /لا يحتوي سجل محادثة/);
  assert.equal(first.studioSession.currentApproval, null);
  assert.deepEqual(first.model, model);
});
test('unknown credential and geometry fields are excluded from persisted session', () => {
  const session = { ...fresh(), apiKey: 'PRIVATE-API-KEY', credentials: { accessCode: 'PRIVATE-CODE' }, model: { token: 'SECOND-GEOMETRY-COPY' }, messages: [{ id: 'message-1', role: 'user', text: 'حافظ على المطبخ.', source: 'customer', status: 'recorded', apiKey: 'NESTED-CREDENTIAL' }] };
  const text = encodeProject({ ...snapshot, studioSession: session, accessCode: 'TOP-LEVEL-SECRET' });
  for (const secret of ['PRIVATE-API-KEY','PRIVATE-CODE','SECOND-GEOMETRY-COPY','TOP-LEVEL-SECRET','NESTED-CREDENTIAL']) assert.ok(!text.includes(secret));
  const raw = JSON.parse(text); raw.studioSession.apiKey = 'IMPORTED-UNKNOWN-CREDENTIAL';
  assert.equal(Object.hasOwn(decodeProject(JSON.stringify(raw)).studioSession, 'apiKey'), false);
});
test('unsupported session version fails visibly and does not mutate caller', () => {
  const session = { ...fresh(), version: 999 }, before = structuredClone(session);
  assert.throws(() => encodeProject({ ...snapshot, studioSession: session }));
  assert.deepEqual(session, before);
  const raw = JSON.parse(encodeProject(snapshot)); raw.studioSession = session;
  assert.throws(() => decodeProject(JSON.stringify(raw)));
});

function localArchive() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const entry of JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries) sqlite.exec(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8').replace(/--> statement-breakpoint/g, '\n'));
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } }; },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return {
    close: () => sqlite.close(),
    async request(path, body) {
      return archiveWorker.fetch(new Request('https://site.test' + path, { method: body ? 'POST' : 'GET', headers: { 'oai-authenticated-user-id': 'studio-test-owner', origin: 'https://site.test', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db });
    },
  };
}
test('local archive preserves vetted session on reopen and idempotent save', async () => {
  const archive = localArchive();
  try {
    const session = fresh();
    const payload = { project: encodeProject({ ...snapshot, studioSession: session }), title: 'جلسة محفوظة', idempotencyKey: 'studio-session-save-key-0001' };
    const saved = await archive.request('/api/archive/designs', payload), receipt = await saved.json();
    assert.equal(saved.status, 201, JSON.stringify(receipt));
    const opened = await archive.request(`/api/archive/designs/${receipt.designId}`), body = await opened.json();
    assert.equal(opened.status, 200);
    const restored = decodeProject(body.project);
    assert.equal(restored.studioSession.draftText, session.draftText);
    assert.deepEqual(restored.model.openings, model.openings);
    const replay = await archive.request('/api/archive/designs', payload), replayBody = await replay.json();
    assert.equal(replay.status, 200, JSON.stringify(replayBody));
    assert.equal(replayBody.replayed, true);
  } finally { archive.close(); }
});

function approved(modelToBind = model) {
  let session = createStudioSession({ id: 'studio-approved-fixture' });
  session = appendStudioMessage(session, { role: 'user', text: 'أبق المطبخ كما هو.', source: 'customer' });
  session = acceptStudioUnderstanding(session, { summary: 'الحفاظ على المطبخ.', sourceMessageIds: [session.messages[0].id], constraints: [{ text: 'المطبخ محفوظ.', sourceMessageId: session.messages[0].id }], assumptions: [], rejectedProposals: [] });
  session = bindStudioRevision(session, modelToBind, 'select');
  return approveStudioRevision(session, { confirmed: true });
}
test('approval and reviewed identity survive only with matching saved geometry', () => {
  const session = approved();
  assert.ok(session.currentApproval);
  const restored = decodeProject(encodeProject({ ...snapshot, studioSession: session }));
  assert.deepEqual(restored.studioSession.currentApproval, session.currentApproval);
  assert.deepEqual(restored.studioSession.selectedRevision, session.selectedRevision);
  const changed = removeOpening(model, openingPoint(model, model.openings.find(opening => opening.type === 'window')));
  const mismatched = decodeProject(encodeProject({ ...snapshot, model: changed, studioSession: session }));
  assert.equal(mismatched.studioSession.currentApproval, null);
  assert.deepEqual(mismatched.model.openings, changed.openings);
  assert.ok(mismatched.studioSession.approvalHistory.length);
});
test('tampered actual opening position cannot keep the session approval on import', () => {
  const raw = JSON.parse(encodeProject({ ...snapshot, studioSession: approved() }));
  const window = raw.design.embedded.openings.find(opening => opening.type === 'window');
  window.pos += .001;
  const restored = decodeProject(JSON.stringify(raw));
  assert.equal(restored.studioSession.currentApproval, null);
  assert.equal(restored.model.openings.find(opening => opening.id === window.id).pos, window.pos);
});
test('archive sanitizer preserves matching approval references and transcript', async () => {
  const archive = localArchive();
  try {
    const session = approved();
    const response = await archive.request('/api/archive/designs', { project: encodeProject({ ...snapshot, studioSession: session }), title: 'مخطط بموافقة مرتبطة', idempotencyKey: 'studio-approved-save-key-01' });
    const receipt = await response.json(); assert.equal(response.status, 201, JSON.stringify(receipt));
    const opened = await archive.request(`/api/archive/designs/${receipt.designId}`);
    const restored = decodeProject((await opened.json()).project);
    assert.deepEqual(restored.studioSession.currentApproval, session.currentApproval);
    assert.deepEqual(restored.studioSession.messages, session.messages);
  } finally { archive.close(); }
});

test('integrated candidate and review references remain unchanged through session persistence', async () => {
  const result = await runMultiEngineDesign({ plot: validatePlot(plot), rooms: normalizeRooms(rooms), selectedShape: 'rect', idea: '', discovery: {} });
  const selected = result.selectedModel, session = approved(selected);
  const restored = decodeProject(encodeProject({ ...snapshot, model: selected, studioSession: session }));
  assert.deepEqual(restored.model.integration, selected.integration);
  assert.deepEqual(restored.studioSession.currentApproval, session.currentApproval);
  const raw = JSON.parse(encodeProject({ ...snapshot, model: selected, studioSession: session }));
  raw.design.embedded.integration.reviewId = 'different-review';
  assert.equal(decodeProject(JSON.stringify(raw)).studioSession.currentApproval, null);
});

test('incidental editor counter does not revoke an approval for identical geometry and review', () => {
  const session = approved();
  const raw = JSON.parse(encodeProject({ ...snapshot, studioSession: session }));
  raw.design.embedded.geometryRevision = 10;
  const restored = decodeProject(JSON.stringify(raw));
  assert.deepEqual(restored.studioSession.currentApproval, session.currentApproval);
  assert.equal(restored.model.geometryRevision, 10);
});
test('rejected proposals persist as rejected rather than becoming accepted constraints', () => {
  let session = approved();
  session = appendStudioMessage(session, { role: 'assistant', text: 'احذف المطبخ.', source: 'ai', status: 'rejected' });
  const user = session.messages.find(message => message.role === 'user');
  session = acceptStudioUnderstanding(session, { summary: 'الحفاظ على المطبخ.', sourceMessageIds: [user.id], constraints: [{ text: 'المطبخ محفوظ.', sourceMessageId: user.id }], assumptions: ['قد يلزم توسيع الرواق.'], rejectedProposals: ['احذف المطبخ.'] });
  const restored = decodeProject(encodeProject({ ...snapshot, studioSession: session })).studioSession;
  assert.equal(restored.messages.at(-1).status, 'rejected');
  assert.deepEqual(restored.understanding.rejectedProposals, ['احذف المطبخ.']);
  assert.deepEqual(restored.understanding.assumptions, ['قد يلزم توسيع الرواق.']);
  assert.deepEqual(restored.understanding.constraints, [{ text: 'المطبخ محفوظ.', sourceMessageId: user.id }]);
  assert.equal(restored.currentApproval, null);
});
