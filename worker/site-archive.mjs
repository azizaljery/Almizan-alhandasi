import { decodeProject, encodeProject, MAX_PROJECT_BYTES, quantitiesCSV } from '../dist/project.mjs';
import { normalizeRooms, validateModel, validatePlot } from '../dist/planner.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { estimate, quantityRows } from '../dist/estimates.mjs';
import { GEOMETRY_POLICY_VERSION, geometryFingerprint, topologyFor } from './archive-canonical.mjs';

const API = '/api/archive';
const MAX_BODY_BYTES = 1_400_000;
const MAX_SNAPSHOT_BYTES = 300_000;
const MAX_MODEL_BYTES = 100_000;
const MAX_CANONICAL_BYTES = 100_000;
const MAX_TOPOLOGY_BYTES = 30_000;
const MAX_TRACE_BYTES = 15_000;
const MAX_ARCHIVED_VERSIONS = 500;
const encoder = new TextEncoder();

const response = (body, status = 200, headers = {}) => new Response(body === null ? null : JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
});
const errorResponse = (code, status, message) => response({ error: code, message }, status);
const utf8Size = value => encoder.encode(value).byteLength;
const jsonBytes = value => utf8Size(JSON.stringify(value));
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const randomId = () => crypto.randomUUID();

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function cleanIdentity(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > 255 || /[\u0000-\u001f\u007f]/.test(id)) return null;
  return id;
}

function requireOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw fail('same_origin_required', 'يجب أن يأتي الحفظ من الموقع نفسه.', 403);
}

function validateTitle(raw) {
  if (raw === undefined) return 'تصميم بدون عنوان';
  if (typeof raw !== 'string') throw fail('invalid_title', 'اسم التصميم غير صالح.');
  const title = raw.normalize('NFC').trim();
  if (!title || Array.from(title).length > 120 || /[\u0000-\u001f\u007f]/.test(title)) throw fail('invalid_title', 'اكتب اسمًا من 1 إلى 120 حرفًا للتصميم.');
  return title;
}

function exactKeys(object, allowed) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw fail('invalid_request', 'بيانات الطلب غير صالحة.');
  const set = new Set(allowed);
  if (Object.keys(object).some(key => !set.has(key))) throw fail('invalid_request', 'يحتوي الطلب على حقول غير مدعومة.');
}

async function readJson(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) throw fail('json_required', 'أرسل بيانات JSON صالحة.', 415);
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw fail('request_too_large', 'حجم الطلب أكبر من الحد المسموح للأرشيف.', 413);
  const chunks = [], reader = request.body?.getReader();
  let totalBytes = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) { await reader.cancel(); throw fail('request_too_large', 'حجم الطلب أكبر من الحد المسموح للأرشيف.', 413); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw fail('invalid_json', 'تعذرت قراءة بيانات الطلب.', 400); }
}

function requireDb(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function') throw fail('archive_unavailable', 'الأرشيف غير متاح حاليًا؛ بقيت مدخلاتك على الشاشة.', 503);
  return env.DB;
}

function safeTree(value, state = { nodes: 0 }, depth = 0) {
  if (++state.nodes > 25_000 || depth > 16) throw fail('invalid_project', 'تعذر حفظ هذا النموذج ضمن حدود الأرشيف.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && value.length > 4000) throw fail('invalid_project', 'يحتوي النموذج على نص أطول من الحد المسموح.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw fail('invalid_project', 'يحتوي النموذج على رقم غير صالح.');
    return value;
  }
  if (Array.isArray(value)) return value.map(item => safeTree(item, state, depth + 1));
  if (typeof value !== 'object') throw fail('invalid_project', 'يحتوي النموذج على قيمة غير مدعومة.');
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    out[key] = safeTree(child, state, depth + 1);
  }
  return out;
}

function boxFields(box, fields) {
  const out = {};
  for (const key of fields) {
    if (key === 'sb' && box?.sb && typeof box.sb === 'object') {
      out.sb = Object.fromEntries(['n', 's', 'e', 'w'].filter(side => Number.isFinite(box.sb[side])).map(side => [side, box.sb[side]]));
    } else if (box && Object.hasOwn(box, key)) out[key] = box[key];
  }
  return out;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function validateSimpleFootprint(model) {
  const ring = model.buildingFootprint;
  if (!Array.isArray(ring) || ring.length < 3 || ring.length > 128) throw fail('invalid_project', 'مضلع الكتلة المدمج غير صالح.');
  const points = ring.map(point => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw fail('invalid_project', 'إحداثيات مضلع الكتلة غير صالحة.');
    if (point.x < -1e-6 || point.y < -1e-6 || point.x > model.plot.width + 1e-6 || point.y > model.plot.length + 1e-6) throw fail('invalid_project', 'مضلع الكتلة يتجاوز حدود الأرض.');
    return point;
  });
  const same = (a, b) => Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.y - b.y) <= 1e-9;
  if (same(points[0], points.at(-1))) throw fail('invalid_project', 'مضلع الكتلة يجب أن يسرد كل زاوية مرة واحدة دون إغلاق مكرر.');
  const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (a, b, p) => Math.abs(orient(a, b, p)) <= 1e-9 && p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
  const intersects = (a, b, c, d) => {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if ((o1 > 1e-9 && o2 < -1e-9 || o1 < -1e-9 && o2 > 1e-9) && (o3 > 1e-9 && o4 < -1e-9 || o3 < -1e-9 && o4 > 1e-9)) return true;
    return Math.abs(o1) <= 1e-9 && onSegment(a, b, c) || Math.abs(o2) <= 1e-9 && onSegment(a, b, d) || Math.abs(o3) <= 1e-9 && onSegment(c, d, a) || Math.abs(o4) <= 1e-9 && onSegment(c, d, b);
  };
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (same(a, b)) throw fail('invalid_project', 'يحتوي مضلع الكتلة على ضلع صفري.');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i || j === (i + 1) % points.length || (j + 1) % points.length === i) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) throw fail('invalid_project', 'مضلع الكتلة يتقاطع مع نفسه.');
    }
  }
  if (!(polygonArea(points) > 1e-6)) throw fail('invalid_project', 'مساحة مضلع الكتلة تساوي صفرًا.');
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const actual = model.boundingBox;
  if (!actual || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(actual[key]) && Math.abs(actual[key] - bounds[key]) <= 1e-5)) throw fail('invalid_project', 'صندوق حدود الكتلة لا يطابق مضلعها.');
}

function validateArchiveModel(input) {
  if (!input || typeof input !== 'object' || !input.plot || !Array.isArray(input.program) || !Array.isArray(input.rooms) || !Array.isArray(input.corridors) || !Array.isArray(input.walls) || !Array.isArray(input.openings) || !Array.isArray(input.links)) throw fail('invalid_project', 'بيانات هندسة المخطط غير مكتملة.');
  if (input.version === 2) validateSimpleFootprint(input);
  let errors;
  try { errors = validateModel(input); }
  catch { throw fail('invalid_project', 'تعذر التحقق من هندسة المخطط؛ راجع حدود الكتلة والفتحات.'); }
  if (errors.length) throw fail('invalid_project', 'المخطط لا يجتاز التحقق الهندسي المحلي.');
}

function sanitizeModel(input) {
  validateArchiveModel(input);
  const model = {
    version: input.version,
    engineVersion: String(input.engineVersion || '').slice(0, 80),
    strategy: String(input.strategy || '').slice(0, 80),
    ...(typeof input.shape === 'string' ? { shape: input.shape.slice(0, 60) } : {}),
    ...(typeof input.topology === 'string' ? { topology: input.topology.slice(0, 60) } : {}),
    ...(input.builtArea !== undefined ? { builtArea: input.builtArea } : {}),
    ...(input.shapeFallback !== undefined ? { shapeFallback: safeTree(input.shapeFallback) } : {}),
    architecture: boxFields(input.architecture || {}, ['tag', 'form', 'idea', 'bestFor', 'tradeoff', 'massing']),
    plot: {
      ...validatePlot(input.plot),
      ...(typeof input.plot?.shape === 'string' ? { shape: input.plot.shape.slice(0, 60) } : {}),
    },
    footprint: boxFields(input.footprint, ['x', 'y', 'w', 'h', 'sb', 'area']),
    building: boxFields(input.building, ['x', 'y', 'w', 'h']),
    ...(input.buildingFootprint !== undefined ? { buildingFootprint: safeTree(input.buildingFootprint) } : {}),
    ...(input.boundingBox !== undefined ? { boundingBox: safeTree(input.boundingBox) } : {}),
    program: normalizeRooms(input.program),
    rooms: (input.rooms || []).map(room => boxFields(room, ['id', 'name', 'type', 'area', 'targetArea', 'position', 'side', 'dimensions', 'x', 'y', 'w', 'h', 'resolvedSide', 'corridorId', 'doorSide'])),
    corridors: (input.corridors || []).map(row => boxFields(row, ['id', 'name', 'x', 'y', 'w', 'h'])),
    reserves: (input.reserves || []).map(row => boxFields(row, ['name', 'x', 'y', 'w', 'h'])),
    links: (input.links || []).map(link => link.map(value => String(value).slice(0, 100))),
    walls: (input.walls || []).map(row => boxFields(row, ['id', 'x1', 'y1', 'x2', 'y2', 'type', 't', 'h'])),
    openings: (input.openings || []).map(row => boxFields(row, ['id', 'type', 'w', 'h', 'sill', 'roomId', 'connects', 'wallId', 'pos'])),
    courtyards: safeTree(input.courtyards || []),
    drawnFloors: safeTree(input.drawnFloors || []),
    ...(input.exploration !== undefined ? { exploration: safeTree(input.exploration) } : {}),
    ...(input.massingParts !== undefined ? { massingParts: safeTree(input.massingParts) } : {}),
    ...(input.integration !== undefined ? { integration: safeTree(input.integration) } : {}),
    warnings: (input.warnings || []).slice(0, 40).map(value => String(value).slice(0, 400)),
  };
  validateArchiveModel(model);
  return model;
}

async function checkedEncodedProject(decoded) {
  if (!decoded?.model) throw fail('model_required', 'ولّد مخططًا ناجحًا قبل إضافته إلى الأرشيف.');
  const clean = model => model ? sanitizeModel(model) : null;
  const draftPlot = validatePlot(decoded.plot), modelPlot = validatePlot(decoded.model.plot);
  const roomSignature = rooms => normalizeRooms(rooms).map(({ name, type, area, position, side, dimensions }) => [name, type, area, position, side, dimensions || null]);
  if (JSON.stringify(draftPlot) !== JSON.stringify(modelPlot) || JSON.stringify(roomSignature(decoded.rooms)) !== JSON.stringify(roomSignature(decoded.model.program))) throw fail('stale_model', 'المدخلات الحالية لا تطابق المخطط المولّد؛ أعد التوليد قبل الأرشفة.');
  let exactModel, snapshot, restored;
  try {
    exactModel = clean(decoded.model);
    snapshot = encodeProject({
      plot: decoded.plot,
      rooms: decoded.rooms,
      palette: decoded.palette,
      rates: decoded.rates,
      costReserve: decoded.costReserve,
      vat: decoded.vat,
      idea: decoded.idea,
      discovery: decoded.discovery,
      model: exactModel,
      alternatives: (decoded.alternatives || []).map(clean),
      history: (decoded.history || []).map(item => ({ model: clean(item.model), palette: item.palette, ...(item.landSurvey ? { landSurvey: item.landSurvey } : {}) })),
      landSurvey: decoded.landSurvey,
      modelLandSurvey: decoded.modelLandSurvey,
    });
    restored = decodeProject(snapshot);
  } catch {
    throw fail('model_roundtrip_failed', 'تعذر حفظ نسخة قابلة لإعادة الفتح من الهندسة الحالية؛ بقيت بياناتك دون تغيير.');
  }
  if (utf8Size(snapshot) > MAX_SNAPSHOT_BYTES) throw fail('archive_record_too_large', 'حجم ملف المشروع يتجاوز سعة النسخة المحفوظة؛ نزّل الملف المحلي أو قلّل عدد البدائل والنسخ.', 413);
  const modelJson = JSON.stringify(exactModel);
  if (utf8Size(modelJson) > MAX_MODEL_BYTES) throw fail('archive_model_too_large', 'بيانات هندسة المخطط أكبر من سعة النسخة المحفوظة.', 413);
  const surveyContext = { landSurvey: decoded.landSurvey, modelLandSurvey: decoded.modelLandSurvey };
  const { geometry, canonicalJson, hash, exactGeometryHash } = await geometryFingerprint(exactModel, surveyContext);
  const restoredFingerprint = await geometryFingerprint(restored.model, { landSurvey: restored.landSurvey, modelLandSurvey: restored.modelLandSurvey });
  if (restoredFingerprint.exactGeometryHash !== exactGeometryHash) throw fail('model_roundtrip_failed', 'تغيّرت هندسة المخطط أو موضعه أو حدود المسح أثناء الحفظ؛ أُلغي الأرشيف.');
  try {
    const beforeRows = quantityRows(exactModel), afterRows = quantityRows(restored.model);
    const sameRows = JSON.stringify(beforeRows) === JSON.stringify(afterRows);
    const beforeTotals = estimate(beforeRows, decoded.rates, decoded.costReserve, decoded.vat);
    const afterTotals = estimate(afterRows, restored.rates, restored.costReserve, restored.vat);
    if (!sameRows || JSON.stringify(beforeTotals) !== JSON.stringify(afterTotals)) throw new Error('quantities changed');
  } catch {
    throw fail('model_roundtrip_failed', 'تغيّرت الكميات عند إعادة فتح المخطط المحفوظ؛ أُلغي الأرشيف.');
  }
  const topology = topologyFor(exactModel);
  const topologyJson = JSON.stringify(topology);
  if (utf8Size(canonicalJson) > MAX_CANONICAL_BYTES || utf8Size(topologyJson) > MAX_TOPOLOGY_BYTES) throw fail('archive_geometry_too_large', 'بيانات هندسة هذا المخطط تتجاوز سعة الأرشيف.', 413);
  const trace = {
    schema: 'mizan-deterministic-design-trace-v1',
    source: 'server-derived-from-validated-project',
    generatedAt: new Date().toISOString(),
    geometryPolicyVersion: GEOMETRY_POLICY_VERSION,
    engineVersion: exactModel.engineVersion,
    strategy: exactModel.strategy,
    input: {
      plot: exactModel.plot,
      requestedSpaces: exactModel.program.map(room => ({ type: room.type, areaM2: room.area, dimensionsM: room.dimensions || null, position: room.position, side: room.side })),
      requestTextSha256: await sha256(decoded.idea),
      preferences: { likes: decoded.discovery.likes, rejects: decoded.discovery.rejects, avoids: decoded.discovery.avoids },
      explicitSurveyLinkedToGenerator: decoded.modelLandSurvey?.engineLink === 'survey-rectangle',
    },
    output: {
      rooms: exactModel.rooms.map(room => ({ type: room.type, boundsM: { x: room.x, y: room.y, width: room.w, length: room.h }, assignedCorridor: room.corridorId || null })),
      corridors: exactModel.corridors.map(item => ({ boundsM: { x: item.x, y: item.y, width: item.w, length: item.h } })),
      links: topology.corridors,
      warnings: exactModel.warnings,
    },
    note: 'ملخص مشتق من مدخلات ومخرجات المحرك بعد التحقق؛ ليس سلسلة تفكير للنموذج ولا اعتمادًا هندسيًا.',
  };
  const traceJson = JSON.stringify(trace);
  if (utf8Size(traceJson) > MAX_TRACE_BYTES) throw fail('archive_trace_too_large', 'سجل قرارات هذا المخطط يتجاوز سعة الأرشيف.', 413);
  return { snapshot, modelJson, canonicalJson, topologyJson, traceJson, hash, exactGeometryHash, engineVersion: exactModel.engineVersion };
}

async function archivePayload(raw, { owner, operation, targetDesignId = '' }) {
  exactKeys(raw, ['project', 'title', 'idempotencyKey', 'expectedVersion']);
  if (typeof raw.project !== 'string') throw fail('invalid_project', 'ملف المشروع غير موجود في طلب الأرشفة.');
  if (utf8Size(raw.project) > MAX_PROJECT_BYTES) throw fail('project_too_large', 'ملف المشروع يتجاوز 2 ميغابايت.', 413);
  if (raw.idempotencyKey !== undefined && (typeof raw.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(raw.idempotencyKey))) throw fail('invalid_idempotency_key', 'مفتاح حفظ الطلب غير صالح.');
  const expectedVersion = raw.expectedVersion;
  if (operation === 'update' && (!Number.isInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 1_000_000)) throw fail('expected_version_required', 'حدّث قائمة الأرشيف قبل حفظ نسخة جديدة.', 428);
  if (operation === 'create' && expectedVersion !== undefined) throw fail('invalid_request', 'طلب إنشاء تصميم جديد لا يقبل رقم نسخة متوقعًا.');
  let decoded;
  try { decoded = decodeProject(raw.project); }
  catch { throw fail('invalid_project', 'ملف المشروع أو هندسته غير صالح؛ لم يُحفظ أي سجل.'); }
  const content = await checkedEncodedProject(decoded);
  const title = validateTitle(raw.title);
  const { snapshot: _snapshot, traceJson: _traceJson, ...stableContent } = content;
  const snapshotForHash = JSON.parse(content.snapshot); snapshotForHash.savedAt = '';
  const traceForHash = JSON.parse(content.traceJson); traceForHash.generatedAt = '';
  const requestContext = { owner, operation, targetDesignId, expectedVersion: expectedVersion ?? 0 };
  const requestFingerprint = await sha256(JSON.stringify({ ...requestContext, title, ...stableContent, snapshot: snapshotForHash, trace: traceForHash }));
  return { ...requestContext, title, content, requestFingerprint, idempotencyKey: raw.idempotencyKey };
}

async function idempotentResult(db, owner, key, payload) {
  if (!key) return null;
  const row = await db.prepare('SELECT operation, target_design_id, expected_version, request_hash, design_id, version_number FROM archive_idempotency WHERE owner_user_id = ? AND idempotency_key = ?').bind(owner, key).first();
  if (!row) return null;
  if (row.operation !== payload.operation || row.target_design_id !== payload.targetDesignId || row.expected_version !== (payload.expectedVersion ?? 0) || row.request_hash !== payload.requestFingerprint) throw fail('idempotency_conflict', 'مفتاح الحفظ استُخدم لعملية أو هدف أو نسخة مختلفة. أعد المحاولة بمفتاح جديد.', 409);
  const design = await db.prepare('SELECT id, title, current_version, created_at, updated_at FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(row.design_id, owner).first();
  if (!design) throw fail('not_found', 'التصميم غير موجود في هذا الحساب.', 404);
  const receipt = await db.prepare('SELECT receipt_id FROM archive_receipts WHERE owner_user_id = ? AND design_id = ? AND version_number = ?').bind(owner, design.id, row.version_number).first();
  return { designId: design.id, version: row.version_number, currentVersion: design.current_version, title: design.title, createdAt: design.created_at, updatedAt: design.updated_at, receiptId: receipt?.receipt_id || null, replayed: true };
}

function versionInsert(db, designId, owner, version, content, createdAt) {
  return db.prepare(`INSERT INTO archive_design_versions
    (design_id, owner_user_id, version_number, project_snapshot_json, exact_model_json, novelty_geometry_json, exact_geometry_hash, topology_json, decision_trace_json, novelty_hash, geometry_policy_version, engine_version, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM archive_designs WHERE id = ? AND owner_user_id = ? AND current_version = ?)
      AND (SELECT count(*) FROM archive_design_versions) < ?`)
    .bind(designId, owner, version, content.snapshot, content.modelJson, content.canonicalJson, content.exactGeometryHash, content.topologyJson, content.traceJson, content.hash, GEOMETRY_POLICY_VERSION, content.engineVersion, createdAt, designId, owner, version, MAX_ARCHIVED_VERSIONS);
}

async function createDesign(db, owner, payload) {
  const { title, content, requestFingerprint, idempotencyKey, operation, targetDesignId, expectedVersion } = payload;
  if (idempotencyKey) {
    const replay = await idempotentResult(db, owner, idempotencyKey, payload);
    if (replay) return response({ ...replay, duplicate: false }, 200);
  }
  if (operation !== 'create' || targetDesignId !== '' || expectedVersion !== 0) throw fail('invalid_request', 'سياق إنشاء التصميم غير صالح.');
  const existingClaim = await db.prepare('SELECT owner_user_id, design_id, tombstoned_at FROM archive_geometry_claims WHERE novelty_hash = ?').bind(content.hash).first();
  if (existingClaim) throw fail('geometry_already_archived', 'لا يمكن إنشاء سجل جديد ببصمة مقارنة مطابقة لنسخة محفوظة.', 409);
  const id = randomId(), now = Date.now();
  const receiptId = randomId();
  const statements = [
    db.prepare(`INSERT INTO archive_designs (id, owner_user_id, title, current_version, created_at, updated_at)
      SELECT ?, ?, ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM archive_geometry_claims WHERE novelty_hash = ?)
        AND (SELECT count(*) FROM archive_design_versions) < ?`)
      .bind(id, owner, title, now, now, content.hash, MAX_ARCHIVED_VERSIONS),
    versionInsert(db, id, owner, 1, content, now),
    db.prepare(`INSERT INTO archive_geometry_claims (novelty_hash, owner_user_id, design_id, created_at, tombstoned_at)
      SELECT ?, ?, ?, ?, NULL WHERE EXISTS (SELECT 1 FROM archive_design_versions WHERE design_id = ? AND owner_user_id = ? AND version_number = 1 AND novelty_hash = ?)
      ON CONFLICT(novelty_hash) DO NOTHING`)
      .bind(content.hash, owner, id, now, id, owner, content.hash),
  ];
  statements.push(db.prepare(`INSERT INTO archive_receipts (receipt_id, owner_user_id, design_id, version_number, novelty_hash, exact_geometry_hash, geometry_policy_version, created_at)
    SELECT ?, ?, ?, 1, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM archive_design_versions WHERE design_id = ? AND owner_user_id = ? AND version_number = 1 AND novelty_hash = ?)
      AND EXISTS (SELECT 1 FROM archive_geometry_claims WHERE novelty_hash = ? AND owner_user_id = ? AND design_id = ? AND tombstoned_at IS NULL)`)
    .bind(receiptId, owner, id, content.hash, content.exactGeometryHash, GEOMETRY_POLICY_VERSION, now, id, owner, content.hash, content.hash, owner, id));
  if (idempotencyKey) statements.push(db.prepare(`INSERT INTO archive_idempotency
    (owner_user_id, idempotency_key, operation, target_design_id, expected_version, request_hash, design_id, version_number, created_at)
    SELECT ?, ?, 'create', '', 0, ?, ?, 1, ? WHERE EXISTS (SELECT 1 FROM archive_receipts WHERE receipt_id = ? AND owner_user_id = ? AND design_id = ? AND version_number = 1)`)
    .bind(owner, idempotencyKey, requestFingerprint, id, now, receiptId, owner, id));
  try {
    await db.batch(statements);
    const created = await db.prepare('SELECT id FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
    const receipt = await db.prepare('SELECT receipt_id FROM archive_receipts WHERE receipt_id = ? AND owner_user_id = ? AND design_id = ? AND version_number = 1').bind(receiptId, owner, id).first();
    if (created && receipt) return response({ designId: id, version: 1, currentVersion: 1, title, createdAt: now, updatedAt: now, receiptId, duplicate: false }, 201);
  } catch {
    if (idempotencyKey) {
      try { const replay = await idempotentResult(db, owner, idempotencyKey, payload); if (replay) return response({ ...replay, duplicate: false }, 200); }
      catch (error) { if (error.status) throw error; }
    }
    const claim = await db.prepare('SELECT owner_user_id, design_id, tombstoned_at FROM archive_geometry_claims WHERE novelty_hash = ?').bind(content.hash).first();
    if (claim) throw fail('geometry_already_archived', 'لا يمكن إنشاء سجل جديد ببصمة مقارنة مطابقة لنسخة محفوظة.', 409);
    const usage = await db.prepare('SELECT count(*) AS count FROM archive_design_versions').first();
    if (usage?.count >= MAX_ARCHIVED_VERSIONS) throw fail('archive_storage_limit', 'وصل الأرشيف إلى حد النسخ المحلي المسموح؛ نزّل ملفات المشاريع وراجع إدارة الأرشيف.', 507);
    throw fail('archive_unavailable', 'تعذر حفظ التصميم حاليًا؛ بقيت مدخلاتك على الشاشة.', 503);
  }
  const claim = await db.prepare('SELECT owner_user_id, design_id, tombstoned_at FROM archive_geometry_claims WHERE novelty_hash = ?').bind(content.hash).first();
  if (claim) throw fail('geometry_already_archived', 'لا يمكن إنشاء سجل جديد ببصمة مقارنة مطابقة لنسخة محفوظة.', 409);
  const usage = await db.prepare('SELECT count(*) AS count FROM archive_design_versions').first();
  if (usage?.count >= MAX_ARCHIVED_VERSIONS) throw fail('archive_storage_limit', 'وصل الأرشيف إلى حد النسخ المحلي المسموح؛ نزّل ملفات المشاريع وراجع إدارة الأرشيف.', 507);
  throw fail('archive_unavailable', 'تعذر حفظ التصميم حاليًا؛ بقيت مدخلاتك على الشاشة.', 503);
}

async function updateDesign(db, owner, id, payload) {
  const { title, content, requestFingerprint, idempotencyKey, expectedVersion, operation, targetDesignId } = payload;
  if (!Number.isInteger(expectedVersion)) throw fail('expected_version_required', 'حدّث قائمة الأرشيف قبل حفظ نسخة جديدة.', 428);
  if (operation !== 'update' || targetDesignId !== id) throw fail('invalid_request', 'سياق تحديث التصميم غير صالح.');
  if (idempotencyKey) {
    const replay = await idempotentResult(db, owner, idempotencyKey, payload);
    if (replay) return response({ ...replay, duplicate: false }, 200);
  }
  const current = await db.prepare('SELECT id, title, current_version, created_at, updated_at FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
  if (!current) throw fail('not_found', 'التصميم غير موجود في هذا الحساب.', 404);
  if (current.current_version !== expectedVersion) throw fail('version_conflict', 'حُفظت نسخة أحدث من هذا التصميم. حدّث قائمة الأرشيف قبل المتابعة.', 409);
  const usageBeforeWrite = await db.prepare('SELECT count(*) AS count FROM archive_design_versions').first();
  if (usageBeforeWrite?.count >= MAX_ARCHIVED_VERSIONS) throw fail('archive_storage_limit', 'وصل الأرشيف إلى حد النسخ المحلي المسموح؛ نزّل ملفات المشاريع وراجع إدارة الأرشيف.', 507);
  const claimed = await db.prepare('SELECT owner_user_id, design_id, tombstoned_at FROM archive_geometry_claims WHERE novelty_hash = ?').bind(content.hash).first();
  if (claimed && (claimed.owner_user_id !== owner || claimed.design_id !== id)) throw fail('geometry_already_archived', 'لا يمكن حفظ بصمة مقارنة مطابقة من سجل آخر.', 409);
  const next = expectedVersion + 1, now = Date.now();
  const receiptId = randomId();
  const reserveNovelty = db.prepare(`INSERT INTO archive_geometry_claims (novelty_hash, owner_user_id, design_id, created_at, tombstoned_at)
    SELECT ?, ?, ?, ?, NULL WHERE EXISTS (SELECT 1 FROM archive_designs WHERE id = ? AND owner_user_id = ? AND current_version = ?)
      AND (SELECT count(*) FROM archive_design_versions) < ?
    ON CONFLICT(novelty_hash) DO UPDATE SET owner_user_id = excluded.owner_user_id, design_id = excluded.design_id
      WHERE archive_geometry_claims.owner_user_id = excluded.owner_user_id AND archive_geometry_claims.design_id = excluded.design_id AND archive_geometry_claims.tombstoned_at IS NULL`)
    .bind(content.hash, owner, id, now, id, owner, expectedVersion, MAX_ARCHIVED_VERSIONS);
  const update = db.prepare(`UPDATE archive_designs SET title = ?, current_version = ?, updated_at = ?
    WHERE id = ? AND owner_user_id = ? AND current_version = ?
      AND (SELECT count(*) FROM archive_design_versions) < ?
      AND EXISTS (SELECT 1 FROM archive_geometry_claims WHERE novelty_hash = ? AND owner_user_id = ? AND design_id = ? AND tombstoned_at IS NULL)`)
    .bind(title, next, now, id, owner, expectedVersion, MAX_ARCHIVED_VERSIONS, content.hash, owner, id);
  const insertVersion = versionInsert(db, id, owner, next, content, now);
  const insertReceipt = db.prepare(`INSERT INTO archive_receipts (receipt_id, owner_user_id, design_id, version_number, novelty_hash, exact_geometry_hash, geometry_policy_version, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM archive_design_versions WHERE design_id = ? AND owner_user_id = ? AND version_number = ? AND novelty_hash = ?)
      AND EXISTS (SELECT 1 FROM archive_geometry_claims WHERE novelty_hash = ? AND owner_user_id = ? AND design_id = ? AND tombstoned_at IS NULL)`)
    .bind(receiptId, owner, id, next, content.hash, content.exactGeometryHash, GEOMETRY_POLICY_VERSION, now, id, owner, next, content.hash, content.hash, owner, id);
  const insertIdempotency = idempotencyKey
    ? db.prepare(`INSERT INTO archive_idempotency (owner_user_id, idempotency_key, operation, target_design_id, expected_version, request_hash, design_id, version_number, created_at)
      SELECT ?, ?, 'update', ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM archive_receipts WHERE receipt_id = ? AND owner_user_id = ? AND design_id = ? AND version_number = ?)`)
      .bind(owner, idempotencyKey, id, expectedVersion, requestFingerprint, id, next, now, receiptId, owner, id, next)
    : null;
  try { await db.batch([reserveNovelty, update, insertVersion, insertReceipt, ...(insertIdempotency ? [insertIdempotency] : [])]); }
  catch {
    if (idempotencyKey) {
      const replay = await idempotentResult(db, owner, idempotencyKey, payload);
      if (replay) return response({ ...replay, duplicate: false }, 200);
    }
    const fresh = await db.prepare('SELECT current_version FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
    if (!fresh) throw fail('not_found', 'التصميم غير موجود في هذا الحساب.', 404);
    if (fresh.current_version !== expectedVersion) throw fail('version_conflict', 'تغيّرت النسخة أثناء الحفظ؛ حدّث قائمة الأرشيف.', 409);
    const usage = await db.prepare('SELECT count(*) AS count FROM archive_design_versions').first();
    if (usage?.count >= MAX_ARCHIVED_VERSIONS) throw fail('archive_storage_limit', 'وصل الأرشيف إلى حد النسخ المحلي المسموح؛ نزّل ملفات المشاريع وراجع إدارة الأرشيف.', 507);
    const existingClaim = await db.prepare('SELECT owner_user_id, design_id, tombstoned_at FROM archive_geometry_claims WHERE novelty_hash = ?').bind(content.hash).first();
    if (existingClaim && (existingClaim.owner_user_id !== owner || existingClaim.design_id !== id)) throw fail('geometry_already_archived', 'لا يمكن حفظ بصمة مقارنة مطابقة من سجل آخر.', 409);
    throw fail('archive_unavailable', 'تعذر حفظ النسخة حاليًا؛ بقيت مدخلاتك على الشاشة.', 503);
  }
  const saved = await db.prepare('SELECT title, current_version, created_at, updated_at FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
  const receipt = await db.prepare('SELECT receipt_id FROM archive_receipts WHERE receipt_id = ? AND owner_user_id = ? AND design_id = ? AND version_number = ?').bind(receiptId, owner, id, next).first();
  if (saved?.current_version !== next || !receipt) {
    const fresh = await db.prepare('SELECT current_version FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
    if (!fresh) throw fail('not_found', 'التصميم غير موجود في هذا الحساب.', 404);
    if (fresh.current_version !== expectedVersion) throw fail('version_conflict', 'تغيّرت النسخة أثناء الحفظ؛ حدّث الأرشيف.', 409);
    const currentClaim = await db.prepare('SELECT owner_user_id, design_id FROM archive_geometry_claims WHERE novelty_hash = ?').bind(content.hash).first();
    if (currentClaim && (currentClaim.owner_user_id !== owner || currentClaim.design_id !== id)) throw fail('geometry_already_archived', 'لا يمكن حفظ بصمة مقارنة مطابقة من سجل آخر.', 409);
    const usage = await db.prepare('SELECT count(*) AS count FROM archive_design_versions').first();
    if (usage?.count >= MAX_ARCHIVED_VERSIONS) throw fail('archive_storage_limit', 'وصل الأرشيف إلى حد النسخ المحلي المسموح؛ نزّل ملفات المشاريع وراجع إدارة الأرشيف.', 507);
    throw fail('archive_unavailable', 'تعذر حفظ النسخة حاليًا؛ بقيت بياناتك على الشاشة.', 503);
  }
  return response({ designId: id, version: next, currentVersion: next, title: saved.title, createdAt: saved.created_at, updatedAt: saved.updated_at, receiptId, duplicate: false }, 200);
}

async function listDesigns(db, owner, url) {
  const cursor = url.searchParams.get('cursor');
  let rows;
  if (cursor !== null) {
    const match = cursor.match(/^(\d{1,16})\.([0-9a-f-]{36})$/i);
    if (!match) throw fail('invalid_cursor', 'تعذر متابعة قائمة الأرشيف. حدّث القائمة من البداية.');
    const timestamp = Number(match[1]);
    rows = await db.prepare(`SELECT id, title, current_version, created_at, updated_at FROM archive_designs
      WHERE owner_user_id = ? AND (updated_at < ? OR (updated_at = ? AND id < ?))
      ORDER BY updated_at DESC, id DESC LIMIT 101`).bind(owner, timestamp, timestamp, match[2]).all();
  } else {
    rows = await db.prepare(`SELECT id, title, current_version, created_at, updated_at FROM archive_designs
      WHERE owner_user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 101`).bind(owner).all();
  }
  const found = rows.results || [], hasMore = found.length > 100, designs = found.slice(0, 100);
  const last = designs[designs.length - 1];
  return response({ designs, hasMore, nextCursor: hasMore && last ? `${last.updated_at}.${last.id}` : null });
}

async function listVersions(db, owner, id) {
  const owns = await db.prepare('SELECT id FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
  if (!owns) throw fail('not_found', 'التصميم غير موجود في هذا الحساب.', 404);
  const rows = await db.prepare(`SELECT version_number, created_at, engine_version, geometry_policy_version FROM archive_design_versions
    WHERE design_id = ? AND owner_user_id = ? ORDER BY version_number DESC LIMIT 100`).bind(id, owner).all();
  return response({ versions: rows.results || [] });
}

async function getVersion(db, owner, id, versionNumber) {
  if (!/^\d{1,7}$/.test(versionNumber || '')) throw fail('invalid_version', 'رقم النسخة غير صالح.');
  const version = Number(versionNumber);
  const row = await db.prepare(`SELECT d.id AS design_id, d.title, d.current_version, v.version_number, v.project_snapshot_json,
    v.exact_model_json, v.topology_json, v.decision_trace_json, v.geometry_policy_version, v.engine_version, v.created_at,
    v.novelty_hash, v.exact_geometry_hash
    FROM archive_designs d JOIN archive_design_versions v ON v.design_id = d.id AND v.owner_user_id = d.owner_user_id
    WHERE d.id = ? AND d.owner_user_id = ? AND v.version_number = ?`).bind(id, owner, version).first();
  if (!row) throw fail('not_found', 'النسخة غير موجودة في هذا الحساب.', 404);
  const receipt = await db.prepare('SELECT receipt_id FROM archive_receipts WHERE owner_user_id = ? AND design_id = ? AND version_number = ?').bind(owner, id, version).first();
  return response({
    designId: row.design_id, title: row.title, currentVersion: row.current_version, version: row.version_number,
    project: row.project_snapshot_json, model: JSON.parse(row.exact_model_json), topology: JSON.parse(row.topology_json),
    decisionTrace: JSON.parse(row.decision_trace_json), geometryPolicyVersion: row.geometry_policy_version, noveltyHash: row.novelty_hash,
    exactGeometryHash: row.exact_geometry_hash, receiptId: receipt?.receipt_id || null, engineVersion: row.engine_version, createdAt: row.created_at,
  });
}

async function exportSavedDesign(db, owner, id, kind, raw) {
  exactKeys(raw, ['receiptId', 'expectedVersion']);
  if (typeof raw.receiptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(raw.receiptId) || !Number.isInteger(raw.expectedVersion) || raw.expectedVersion < 1) throw fail('archive_receipt_required', 'احفظ النسخة الحالية أولًا لاستلام إيصال التصدير.', 428);
  const row = await db.prepare(`SELECT d.current_version, v.project_snapshot_json, v.exact_model_json, v.novelty_hash,
    v.exact_geometry_hash, v.geometry_policy_version, r.receipt_id, r.novelty_hash AS receipt_novelty_hash,
    r.exact_geometry_hash AS receipt_exact_hash, r.geometry_policy_version AS receipt_policy
    FROM archive_designs d
    JOIN archive_design_versions v ON v.design_id = d.id AND v.owner_user_id = d.owner_user_id
    JOIN archive_receipts r ON r.design_id = v.design_id AND r.owner_user_id = v.owner_user_id AND r.version_number = v.version_number
    WHERE d.id = ? AND d.owner_user_id = ? AND r.receipt_id = ? AND r.version_number = ?`)
    .bind(id, owner, raw.receiptId, raw.expectedVersion).first();
  if (!row) throw fail('archive_receipt_invalid', 'إيصال التصدير لا يطابق سجل هذا الحساب.', 409);
  if (row.current_version !== raw.expectedVersion) throw fail('archive_receipt_stale', 'الإيصال يعود إلى نسخة سابقة؛ احفظ النسخة الحالية قبل التصدير.', 409);
  if (row.receipt_novelty_hash !== row.novelty_hash || row.receipt_exact_hash !== row.exact_geometry_hash || row.receipt_policy !== row.geometry_policy_version) throw fail('archive_receipt_invalid', 'تعذر مطابقة إيصال التصدير مع النسخة المحفوظة.', 409);
  const claim = await db.prepare('SELECT owner_user_id, design_id, tombstoned_at FROM archive_geometry_claims WHERE novelty_hash = ?').bind(row.novelty_hash).first();
  if (!claim || claim.owner_user_id !== owner || claim.design_id !== id || claim.tombstoned_at !== null) throw fail('archive_receipt_invalid', 'حجز بصمة المقارنة العالمي غير نشط لهذه النسخة.', 409);

  let model, project;
  try {
    model = JSON.parse(row.exact_model_json);
    validateArchiveModel(model);
    project = decodeProject(row.project_snapshot_json);
  } catch {
    throw fail('archive_receipt_invalid', 'تعذر التحقق من نسخة المشروع المحفوظة.', 409);
  }
  const fingerprint = await geometryFingerprint(model, { landSurvey: project.landSurvey, modelLandSurvey: project.modelLandSurvey });
  if (fingerprint.hash !== row.novelty_hash || fingerprint.exactGeometryHash !== row.exact_geometry_hash) throw fail('archive_receipt_invalid', 'تغيّرت بصمة المقارنة أو بصمة سلامة هندسة النسخة؛ أُلغي التصدير.', 409);
  try {
    const savedModelFingerprint = await geometryFingerprint(project.model, { landSurvey: project.landSurvey, modelLandSurvey: project.modelLandSurvey });
    if (savedModelFingerprint.exactGeometryHash !== row.exact_geometry_hash) throw new Error('snapshot/model mismatch');
    const modelRows = quantityRows(model), restoredRows = quantityRows(project.model);
    const modelTotals = estimate(modelRows, project.rates, project.costReserve, project.vat);
    const restoredTotals = estimate(restoredRows, project.rates, project.costReserve, project.vat);
    if (JSON.stringify(modelRows) !== JSON.stringify(restoredRows) || JSON.stringify(modelTotals) !== JSON.stringify(restoredTotals)) throw new Error('quantity mismatch');
  } catch {
    throw fail('archive_receipt_invalid', 'لم تتطابق الكميات عند إعادة فتح النسخة؛ أُلغي التصدير.', 409);
  }
  const body = kind === 'svg'
    ? buildPlanSVG(model)
    : quantitiesCSV(model, project.rates, project.costReserve, project.vat);
  const file = kind === 'svg' ? 'mizan-handasi-plan.svg' : 'mizan-handasi-quantities.csv';
  const mime = kind === 'svg' ? 'image/svg+xml; charset=utf-8' : 'text/csv; charset=utf-8';
  return new Response(body, { status: 200, headers: {
    'content-type': mime,
    'content-disposition': `attachment; filename="${file}"`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-mizan-archive-receipt': raw.receiptId,
    'x-mizan-archive-version': String(raw.expectedVersion),
    'x-mizan-novelty-policy': row.geometry_policy_version,
  } });
}

async function deleteDesign(db, owner, id, raw) {
  exactKeys(raw, ['expectedVersion']);
  if (!Number.isInteger(raw.expectedVersion) || raw.expectedVersion < 1) throw fail('expected_version_required', 'حدّث قائمة الأرشيف قبل حذف التصميم.', 428);
  const current = await db.prepare('SELECT current_version FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
  if (!current) throw fail('not_found', 'التصميم غير موجود في هذا الحساب.', 404);
  if (current.current_version !== raw.expectedVersion) throw fail('version_conflict', 'حُفظت نسخة أحدث؛ حدّث الأرشيف ثم أعد الحذف.', 409);
  const now = Date.now();
  await db.batch([
    db.prepare(`UPDATE archive_geometry_claims SET owner_user_id = NULL, design_id = NULL, tombstoned_at = ?
      WHERE owner_user_id = ? AND design_id = ? AND tombstoned_at IS NULL
        AND EXISTS (SELECT 1 FROM archive_designs WHERE id = ? AND owner_user_id = ? AND current_version = ?)`)
      .bind(now, owner, id, id, owner, raw.expectedVersion),
    db.prepare('DELETE FROM archive_designs WHERE id = ? AND owner_user_id = ? AND current_version = ?').bind(id, owner, raw.expectedVersion),
  ]);
  const remaining = await db.prepare('SELECT current_version FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
  if (!remaining) return response({ deleted: true }, 200);
  if (remaining.current_version !== raw.expectedVersion) throw fail('version_conflict', 'حُفظت نسخة أحدث؛ حدّث الأرشيف ثم أعد الحذف.', 409);
  throw fail('archive_unavailable', 'تعذر حذف التصميم؛ بقيت بياناتك كما هي.', 503);
}

async function routeApi(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith(`${API}/`)) return null;
  // Sites forwards this stable per-Site user ID for signed-in requests. Email is display-only.
  const owner = cleanIdentity(request.headers.get('oai-authenticated-user-id'));
  if (path === `${API}/session` && request.method === 'GET') {
    try {
      requireDb(env);
      const schema = await env.DB.prepare("SELECT count(*) AS table_count FROM sqlite_master WHERE type = 'table' AND name IN ('archive_designs', 'archive_design_versions', 'archive_geometry_claims', 'archive_idempotency', 'archive_receipts')").first();
      if (Number(schema?.table_count) !== 5) throw fail('archive_unavailable', 'الأرشيف غير جاهز بعد؛ بقيت بياناتك على الشاشة.', 503);
      return response({ authenticated: !!owner, storageReady: true });
    } catch (error) {
      if (error.status) return errorResponse(error.code, error.status, error.message);
      return errorResponse('archive_unavailable', 503, 'الأرشيف غير متاح حاليًا؛ بقيت بياناتك على الشاشة.');
    }
  }
  try {
    if (!owner) return errorResponse('sign_in_required', 401, 'سجّل الدخول إلى ChatGPT لفتح أرشيف حسابك.');
    const db = requireDb(env);
    if (request.method === 'GET' && path === `${API}/designs`) return await listDesigns(db, owner, url);
    if (request.method === 'POST' && path === `${API}/designs`) {
      requireOrigin(request);
      return await createDesign(db, owner, await archivePayload(await readJson(request), { owner, operation: 'create' }));
    }
    const exportMatch = path.match(/^\/api\/archive\/designs\/([0-9a-f-]{36})\/exports\/(svg|csv)$/i);
    if (exportMatch && request.method === 'POST') {
      requireOrigin(request);
      return await exportSavedDesign(db, owner, exportMatch[1], exportMatch[2].toLowerCase(), await readJson(request));
    }
    const match = path.match(/^\/api\/archive\/designs\/([0-9a-f-]{36})(?:\/versions(?:\/([0-9]{1,7}))?)?$/i);
    if (!match) return errorResponse('not_found', 404, 'المسار غير موجود.');
    const [, id, version] = match;
    if (request.method === 'GET' && version === undefined && path.endsWith('/versions')) return await listVersions(db, owner, id);
    if (request.method === 'GET' && version !== undefined) return await getVersion(db, owner, id, version);
    if (request.method === 'GET' && !path.includes('/versions')) {
      const design = await db.prepare('SELECT current_version FROM archive_designs WHERE id = ? AND owner_user_id = ?').bind(id, owner).first();
      if (!design) throw fail('not_found', 'التصميم غير موجود في هذا الحساب.', 404);
      return await getVersion(db, owner, id, String(design.current_version));
    }
    if (request.method === 'PUT' && !path.includes('/versions')) {
      requireOrigin(request);
      return await updateDesign(db, owner, id, await archivePayload(await readJson(request), { owner, operation: 'update', targetDesignId: id }));
    }
    if (request.method === 'DELETE' && !path.includes('/versions')) {
      requireOrigin(request);
      return await deleteDesign(db, owner, id, await readJson(request));
    }
    return errorResponse('method_not_allowed', 405, 'الطريقة غير مدعومة لهذا المسار.');
  } catch (error) {
    if (error?.status) return errorResponse(error.code, error.status, error.message);
    console.error('archive request failed', { path, name: error?.name || 'Error' });
    return errorResponse('archive_unavailable', 503, 'تعذر تنفيذ طلب الأرشيف؛ بقيت بياناتك على الشاشة.');
  }
}

export default {
  async fetch(request, env, ctx) {
    const api = await routeApi(request, env);
    if (api) return api;
    if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
