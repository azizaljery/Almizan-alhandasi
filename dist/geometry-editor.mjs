import { validateModel, openingPoint, normalizeRooms, TYPES } from './planner.mjs';

const EPS = 1e-7;
const near = (a, b) => Math.abs(a - b) <= EPS;
const snap = value => Math.round(value * 20) / 20;
const fail = (code, detail) => { const error = Error(`${code}: ${detail}`); error.code = code; throw error; };
const hasDimensions = room => !!(room?.dimensions || room?.exactDimensionsM || room?.exactDimensions);
function unsupported(model, landSurvey) {
  if (landSurvey != null || model?.landSurvey != null || model?.modelLandSurvey != null) return 'SURVEY_CONTEXT_UNSUPPORTED: تعديل الهندسة المرتبطة بمسح أرض غير مدعوم في هذه الدفعة.';
  if (model?.version !== 1 || model.topology) return 'MODEL_UNSUPPORTED: التعديل متاح حاليًا للنموذج المستطيلي القديم فقط؛ لا نعيد توليد الأشكال الأخرى.';
  return null;
}
function describe(model, wall, reason) {
  const horizontal = near(wall.y1, wall.y2), vertical = near(wall.x1, wall.x2);
  const descriptor = { wallId: wall.id, orientation: horizontal ? 'horizontal' : vertical ? 'vertical' : null, roomIds: [], eligible: false };
  if (reason) return { ...descriptor, reason };
  if (wall.type !== 'int' || !descriptor.orientation) return { ...descriptor, reason: 'الجدار ليس قاطعًا داخليًا متعامدًا.' };
  const fixed = horizontal ? wall.y1 : wall.x1;
  const start = Math.min(horizontal ? wall.x1 : wall.y1, horizontal ? wall.x2 : wall.y2);
  const end = Math.max(horizontal ? wall.x1 : wall.y1, horizontal ? wall.x2 : wall.y2);
  const roomStart = r => horizontal ? r.x : r.y, roomLength = r => horizontal ? r.w : r.h;
  const normalStart = r => horizontal ? r.y : r.x, normalLength = r => horizontal ? r.h : r.w;
  const full = r => near(roomStart(r) - wall.t / 2, start) && near(roomStart(r) + roomLength(r) + wall.t / 2, end);
  const before = model.rooms.filter(r => full(r) && near(normalStart(r) + normalLength(r) + wall.t / 2, fixed));
  const after = model.rooms.filter(r => full(r) && near(normalStart(r) - wall.t / 2, fixed));
  if (before.length !== 1 || after.length !== 1) return { ...descriptor, reason: 'يلزم قاطع كامل يفصل غرفتين مستطيلتين؛ حدود الممرات والقواطع الجزئية غير مدعومة.' };
  descriptor.roomIds = [before[0].id, after[0].id];
  if (descriptor.roomIds.some(id => hasDimensions(model.rooms.find(r => r.id === id)) || hasDimensions(model.program.find(r => r.id === id)))) return { ...descriptor, reason: 'DIMENSIONS_LOCKED: أبعاد إحدى الغرف مثبتة صراحة؛ لا يغيّرها تحريك الجدار.' };
  return { ...descriptor, eligible: true };
}
export function eligiblePartitions(model, { landSurvey = null } = {}) {
  return (model?.walls || []).map(wall => describe(model, wall, unsupported(model, landSurvey)));
}
function validateWindows(model) {
  for (const opening of model.openings.filter(o => o.type === 'window' && o.roomId)) {
    const room = model.rooms.find(r => r.id === opening.roomId), wall = model.walls.find(w => w.id === opening.wallId);
    if (!room || !wall) fail('INVALID_GEOMETRY', 'تعذر ربط النافذة بالغرفة والجدار.');
    const point = openingPoint(model, opening), horizontal = near(wall.y1, wall.y2);
    const along = horizontal ? point.x : point.y, start = horizontal ? room.x : room.y, size = horizontal ? room.w : room.h;
    const normal = horizontal ? point.y : point.x, normalStart = horizontal ? room.y : room.x, normalSize = horizontal ? room.h : room.w;
    if (along - opening.w / 2 < start - EPS || along + opening.w / 2 > start + size + EPS || Math.min(Math.abs(normal - normalStart), Math.abs(normal - normalStart - normalSize)) > wall.t / 2 + EPS) fail('INVALID_GEOMETRY', 'التعديل يجعل نافذة خارج حدود غرفتها؛ عدّل موضعها أولًا.');
  }
}
// Produces an immutable proposal. The caller must explicitly confirm area impact
// before installing this model into the live design or undo/redo session.
export function previewGeometryCommand(model, command, { landSurvey = null, revision = model?.geometryRevision ?? 0 } = {}) {
  const reason = unsupported(model, landSurvey); if (reason) fail(reason.split(':')[0], reason.slice(reason.indexOf(':') + 1).trim());
  if (!command || typeof command.id !== 'string' || !command.id.trim() || !Number.isSafeInteger(command.baseRevision) || command.baseRevision < 0) fail('INVALID_COMMAND', 'يلزم معرّف أمر ومراجعة أصل صالحة.');
  if (!Number.isSafeInteger(revision) || revision < 0 || command.baseRevision !== revision) fail('STALE_REVISION', 'تغيّر المخطط منذ بدء المعاينة؛ أعد اختيار العنصر.');
  const beforeErrors = validateModel(model); if (beforeErrors.length) fail('INVALID_GEOMETRY', beforeErrors.join(' | '));
  const next = structuredClone(model), applied = structuredClone(command);
  const impact = { rooms: [], wallIds: [], openingIds: [], requiresConfirmation: false };
  if (command.type === 'move-partition') {
    const partition = eligiblePartitions(model, { landSurvey }).find(p => p.wallId === command.wallId);
    if (!partition?.eligible) fail(partition?.reason?.startsWith('DIMENSIONS_LOCKED') ? 'DIMENSIONS_LOCKED' : 'PARTITION_NOT_ELIGIBLE', partition?.reason || 'الجدار غير موجود.');
    if (!Number.isFinite(command.deltaM)) fail('INVALID_COMMAND', 'إزاحة القاطع يجب أن تكون رقمًا بالمتر.');
    const delta = snap(command.deltaM); if (!delta) fail('NO_CHANGE', 'الإزاحة أصغر من شبكة التحرير 0.05 م.');
    applied.deltaM = delta;
    const wall = next.walls.find(w => w.id === command.wallId), horizontal = partition.orientation === 'horizontal';
    if (horizontal) { wall.y1 += delta; wall.y2 += delta; } else { wall.x1 += delta; wall.x2 += delta; }
    for (const [index, id] of partition.roomIds.entries()) {
      const room = next.rooms.find(r => r.id === id), before = model.rooms.find(r => r.id === id);
      const sizeKey = horizontal ? 'h' : 'w', originKey = horizontal ? 'y' : 'x';
      room[sizeKey] += index === 0 ? delta : -delta;
      if (index === 1) room[originKey] += delta;
      if (room[sizeKey] <= 0) fail('INVALID_GEOMETRY', 'القاطع يلغي المساحة الصافية لإحدى الغرف.');
      // These are the existing packWing feasibility heuristics, not legal minima.
      const minimum = TYPES[room.type]?.min;
      if (!Number.isFinite(minimum) || room.w < minimum - 1e-5 || room.h < minimum - 1e-5 || Math.max(room.w / room.h, room.h / room.w) > 5) fail('INVALID_GEOMETRY', `PLANNER_ROOM_FEASIBILITY: ${room.name} يتجاوز حدود المولد الحالية: البعد الأدنى ${minimum} م ونسبة الاستطالة القصوى 5؛ ليست اشتراطات نظامية.`);
      room.area = room.w * room.h; room.targetArea = room.area;
      const requested = next.program.find(r => r.id === id);
      if (!requested) fail('INVALID_GEOMETRY', 'غرفة بلا سجل برنامج مطابق.');
      requested.area = room.area;
      if (Object.hasOwn(requested, 'targetArea')) requested.targetArea = room.area;
      impact.rooms.push({ id, beforeArea: before.w * before.h, afterArea: room.area });
    }
    impact.wallIds.push(wall.id);
    impact.openingIds.push(...next.openings.filter(o => o.wallId === wall.id).map(o => o.id));
    impact.requiresConfirmation = true;
  } else if (command.type === 'edit-opening') {
    const opening = next.openings.find(o => o.id === command.openingId);
    if (!opening) fail('OPENING_NOT_FOUND', 'الفتحة غير موجودة.');
    const wall = next.walls.find(w => w.id === opening.wallId), length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    let changed = false;
    for (const [input, output] of [['positionM', 'pos'], ['widthM', 'w'], ['heightM', 'h']]) if (Object.hasOwn(command, input)) {
      if (!Number.isFinite(command[input])) fail('INVALID_COMMAND', 'أبعاد الفتحة وموضعها يجب أن تكون أرقامًا بالمتر.');
      const value = snap(command[input]); applied[input] = value;
      const proposed = input === 'positionM' ? value / length : value;
      changed ||= !near(opening[output], proposed); opening[output] = proposed;
    }
    if (!changed) fail('NO_CHANGE', 'لم يتغير موضع الفتحة أو أبعادها.');
    impact.openingIds.push(opening.id);
  } else fail('UNSUPPORTED_COMMAND', 'نوع أمر التحرير غير مدعوم.');
  try { normalizeRooms(next.program); } catch (error) { fail('INVALID_GEOMETRY', error.message); }
  const errors = validateModel(next); if (errors.length) fail('INVALID_GEOMETRY', errors.join(' | '));
  validateWindows(next);
  if (next.integration) next.integration = { previousCandidateId: next.integration.candidateId || next.integration.previousCandidateId || null,
    candidateId: null, geometryHash: null, reviewId: null, reviewOverall: 'NOT_EVALUATED', reviewCoverage: null, requiresReview: true };
  next.geometryRevision = revision + 1;
  return { model: next, command: applied, impact, baseRevision: revision, nextRevision: revision + 1 };
}
