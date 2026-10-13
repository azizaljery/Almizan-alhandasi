import { validateModel, openingPoint, normalizeRooms, TYPES } from './planner.mjs';

const EPS = 1e-7;
const near = (a, b) => Math.abs(a - b) <= EPS;
const snap = value => Math.round(value * 20) / 20;
const fail = (code, detail) => { const error = Error(`${code}: ${detail}`); error.code = code; throw error; };
const hasDimensions = room => !!(room?.dimensions || room?.exactDimensionsM || room?.exactDimensions);
function unsupported(model, landSurvey) {
  if (landSurvey != null || model?.landSurvey != null || model?.modelLandSurvey != null) return 'SURVEY_CONTEXT_UNSUPPORTED: تعديل الهندسة المرتبطة بمسح أرض غير مدعوم في هذه الدفعة.';
  const supportedVersion = model?.version === 1 || model?.version === 2;
  const shape = model?.actualShape ?? model?.shape ?? (model?.topology ? 'topology' : 'rect');
  if (!supportedVersion || shape !== 'rect' || model?.shapeFallback) return 'MODEL_UNSUPPORTED: التعديل الحالي يدعم الهندسة المستطيلة المحققة فقط، ولا يعيد توليد الأشكال الأخرى.';
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
// A partition's "before"/"after" rooms (see describe() above) sit offset from the
// wall's own centreline by half its thickness, so a room edge can only be matched
// to its bounding wall through this before/after role — never by comparing raw
// coordinates, which are not equal (they differ by wall.t / 2).
function partitionSide(partition, roomId) {
  const index = partition.roomIds.indexOf(roomId);
  if (index < 0) return null;
  if (partition.orientation === 'horizontal') return index === 0 ? 'top' : 'bottom';
  if (partition.orientation === 'vertical') return index === 0 ? 'right' : 'left';
  return null;
}
// The eligible partition wall bounding `room` on a given side ('left'|'right'|'top'|'bottom'), if any.
function roomSideWall(partitions, room, side) {
  return partitions.find(p => p.eligible && partitionSide(p, room.id) === side) || null;
}
// Per-room summary of whether a free rigid move is possible on each axis, for the
// UI to disable/explain before the user attempts a drag. Not the final authority —
// previewGeometryCommand({type:'move-room'}) re-derives and enforces this itself.
export function eligibleRoomMoves(model, { landSurvey = null } = {}) {
  const reason = unsupported(model, landSurvey);
  const partitions = reason ? [] : eligiblePartitions(model, { landSurvey });
  return (model?.rooms || []).map(room => {
    if (reason) return { roomId: room.id, eligible: false, axes: { x: false, y: false }, reason };
    if (hasDimensions(room) || hasDimensions(model.program.find(r => r.id === room.id)))
      return { roomId: room.id, eligible: false, axes: { x: false, y: false }, reason: 'DIMENSIONS_LOCKED: أبعاد هذه الغرفة مثبتة صراحة؛ لا ينقلها هذا الإجراء.' };
    const axes = {
      x: !!roomSideWall(partitions, room, 'left') && !!roomSideWall(partitions, room, 'right'),
      y: !!roomSideWall(partitions, room, 'bottom') && !!roomSideWall(partitions, room, 'top'),
    };
    const eligible = axes.x || axes.y;
    return { roomId: room.id, eligible, axes, reason: eligible ? null : 'الغرفة محاطة بجدار خارجي أو حد ممر أو قاطع جزئي أو غرفة ذات أبعاد مثبتة على كل الجهات؛ لا يمكن نقلها حرًا في أي اتجاه.' };
  });
}
// Per-room, per-edge summary of whether that single edge can be dragged to grow or
// shrink the room (changing its net dimensions, unlike move-room which keeps them
// fixed). An edge is draggable only when a fully eligible interior partition (see
// describe() above) borders the room on that side — which also already guarantees
// neither this room nor its neighbour across that wall has explicitly locked
// dimensions. Not the final authority — previewGeometryCommand({type:'resize-room'})
// re-derives and enforces this itself.
export function eligibleRoomResizes(model, { landSurvey = null } = {}) {
  const reason = unsupported(model, landSurvey);
  const partitions = reason ? [] : eligiblePartitions(model, { landSurvey });
  return (model?.rooms || []).map(room => {
    const blank = { left: false, right: false, top: false, bottom: false };
    if (reason) return { roomId: room.id, eligible: false, edges: blank, reason };
    const edges = {
      left: !!roomSideWall(partitions, room, 'left'),
      right: !!roomSideWall(partitions, room, 'right'),
      top: !!roomSideWall(partitions, room, 'top'),
      bottom: !!roomSideWall(partitions, room, 'bottom'),
    };
    const eligible = Object.values(edges).some(Boolean);
    return { roomId: room.id, eligible, edges, reason: eligible ? null : 'كل حواف هذه الغرفة جدار خارجي أو حد ممر أو قاطع جزئي أو غرفة مجاورة ذات أبعاد مثبتة؛ لا يمكن تغيير أبعادها بالسحب.' };
  });
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
  } else if (command.type === 'move-room') {
    const room = next.rooms.find(r => r.id === command.roomId), originalRoom = model.rooms.find(r => r.id === command.roomId);
    if (!room || !originalRoom) fail('ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    if (!['dxM', 'dyM'].some(key => Object.hasOwn(command, key) && command[key] != null) ) fail('INVALID_COMMAND', 'نقل الغرفة يحتاج إزاحة أفقية أو رأسية بالمتر.');
    for (const key of ['dxM', 'dyM']) if (Object.hasOwn(command, key) && command[key] != null && !Number.isFinite(command[key])) fail('INVALID_COMMAND', 'إزاحة نقل الغرفة يجب أن تكون رقمًا بالمتر.');
    const dx = snap(command.dxM || 0), dy = snap(command.dyM || 0);
    if (!dx && !dy) fail('NO_CHANGE', 'الإزاحة أصغر من شبكة التحرير 0.05 م.');
    applied.dxM = dx; applied.dyM = dy;
    if (hasDimensions(originalRoom) || hasDimensions(model.program.find(r => r.id === originalRoom.id))) fail('DIMENSIONS_LOCKED', 'أبعاد هذه الغرفة مثبتة صراحة؛ لا ينقلها هذا الإجراء.');
    const partitions = eligiblePartitions(model, { landSurvey });
    const sideLabel = { left: 'اليسار', right: 'اليمين', top: 'الأعلى', bottom: 'الأسفل' };
    const edges = [];
    if (dx) { edges.push({ side: 'left', delta: dx }); edges.push({ side: 'right', delta: dx }); }
    if (dy) { edges.push({ side: 'bottom', delta: dy }); edges.push({ side: 'top', delta: dy }); }
    const moves = [];
    for (const edge of edges) {
      const match = roomSideWall(partitions, originalRoom, edge.side);
      if (!match) fail('ROOM_MOVE_BLOCKED', `تعذّر نقل الغرفة من جهة ${sideLabel[edge.side]}: لا يوجد قاطع داخلي مؤهل هناك (قد يكون جدارًا خارجيًا، أو حد ممر، أو قاطعًا جزئيًا، أو غرفة مجاورة ذات أبعاد مثبتة). النقل الحر مدعوم فقط حين تحيط بالغرفة قواطع داخلية كاملة على كل جهة تتحرك.`);
      moves.push({ wallId: match.wallId, delta: edge.delta, orientation: match.orientation });
    }
    const touchedRoomIds = new Set([originalRoom.id]);
    for (const mv of moves) {
      const wall = next.walls.find(w => w.id === mv.wallId), partition = partitions.find(p => p.wallId === mv.wallId), horizontal = mv.orientation === 'horizontal';
      if (horizontal) { wall.y1 += mv.delta; wall.y2 += mv.delta; } else { wall.x1 += mv.delta; wall.x2 += mv.delta; }
      for (const [index, id] of partition.roomIds.entries()) {
        const r2 = next.rooms.find(r => r.id === id);
        const sizeKey = horizontal ? 'h' : 'w', originKey = horizontal ? 'y' : 'x';
        r2[sizeKey] += index === 0 ? mv.delta : -mv.delta;
        if (index === 1) r2[originKey] += mv.delta;
        touchedRoomIds.add(id);
      }
      impact.wallIds.push(wall.id);
      impact.openingIds.push(...next.openings.filter(o => o.wallId === wall.id).map(o => o.id));
    }
    for (const id of touchedRoomIds) {
      const r2 = next.rooms.find(r => r.id === id), before2 = model.rooms.find(r => r.id === id);
      if (r2.w <= 0 || r2.h <= 0) fail('INVALID_GEOMETRY', 'النقل يلغي المساحة الصافية لإحدى الغرف.');
      const minimum = TYPES[r2.type]?.min;
      if (!Number.isFinite(minimum) || r2.w < minimum - 1e-5 || r2.h < minimum - 1e-5 || Math.max(r2.w / r2.h, r2.h / r2.w) > 5) fail('INVALID_GEOMETRY', `PLANNER_ROOM_FEASIBILITY: ${r2.name} يتجاوز حدود المولد الحالية: البعد الأدنى ${minimum} م ونسبة الاستطالة القصوى 5؛ ليست اشتراطات نظامية.`);
      r2.area = r2.w * r2.h; r2.targetArea = r2.area;
      const requested = next.program.find(r => r.id === id);
      if (!requested) fail('INVALID_GEOMETRY', 'غرفة بلا سجل برنامج مطابق.');
      requested.area = r2.area;
      if (Object.hasOwn(requested, 'targetArea')) requested.targetArea = r2.area;
      impact.rooms.push({ id, beforeArea: before2.w * before2.h, afterArea: r2.area });
    }
    impact.requiresConfirmation = true;
  } else if (command.type === 'resize-room') {
    const room = next.rooms.find(r => r.id === command.roomId), originalRoom = model.rooms.find(r => r.id === command.roomId);
    if (!room || !originalRoom) fail('ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    const EDGE_FIELDS = { left: 'growLeftM', right: 'growRightM', top: 'growTopM', bottom: 'growBottomM' };
    const present = side => Object.hasOwn(command, EDGE_FIELDS[side]) && command[EDGE_FIELDS[side]] != null;
    const xSides = ['left', 'right'].filter(present), ySides = ['top', 'bottom'].filter(present);
    if (xSides.length > 1 || ySides.length > 1) fail('INVALID_COMMAND', 'لا يمكن تغيير حافتي الغرفة المتقابلتين (يسار ويمين، أو أعلى وأسفل) في أمر واحد؛ هذا نقل لا تغيير أبعاد.');
    const sides = [...xSides, ...ySides];
    if (!sides.length) fail('INVALID_COMMAND', 'تغيير أبعاد الغرفة يحتاج نمو حافة واحدة أفقية أو رأسية على الأقل بالمتر.');
    for (const side of sides) if (!Number.isFinite(command[EDGE_FIELDS[side]])) fail('INVALID_COMMAND', 'نمو حافة الغرفة يجب أن يكون رقمًا بالمتر.');
    const grows = Object.fromEntries(sides.map(side => [side, snap(command[EDGE_FIELDS[side]])]));
    if (!Object.values(grows).some(Boolean)) fail('NO_CHANGE', 'النمو أصغر من شبكة التحرير 0.05 م.');
    for (const side of sides) applied[EDGE_FIELDS[side]] = grows[side];
    if (hasDimensions(originalRoom) || hasDimensions(model.program.find(r => r.id === originalRoom.id))) fail('DIMENSIONS_LOCKED', 'أبعاد هذه الغرفة مثبتة صراحة؛ لا يغيّرها هذا الإجراء.');
    const partitions = eligiblePartitions(model, { landSurvey });
    const sideLabel = { left: 'اليسار', right: 'اليمين', top: 'الأعلى', bottom: 'الأسفل' };
    const touchedRoomIds = new Set([originalRoom.id]);
    for (const side of sides) {
      const grow = grows[side]; if (!grow) continue;
      const match = roomSideWall(partitions, originalRoom, side);
      if (!match) fail('ROOM_RESIZE_BLOCKED', `تعذّر تغيير حافة الغرفة من جهة ${sideLabel[side]}: لا يوجد قاطع داخلي مؤهل هناك (قد يكون جدارًا خارجيًا، أو حد ممر، أو قاطعًا جزئيًا، أو غرفة مجاورة ذات أبعاد مثبتة). تغيير الأبعاد مدعوم فقط حين تحد الغرفة من هذه الجهة قواطع داخلية كاملة.`);
      // The room matched via side='right'/'top' is always the partition's "before"
      // room (index 0), and via side='left'/'bottom' always the "after" room
      // (index 1) — see describe()/partitionSide() above. Reuse their exact
      // mutation so growing this edge and move-partition on the same wall agree.
      const delta = (side === 'right' || side === 'top') ? grow : -grow;
      const wall = next.walls.find(w => w.id === match.wallId), partition = partitions.find(p => p.wallId === match.wallId), horizontal = match.orientation === 'horizontal';
      if (horizontal) { wall.y1 += delta; wall.y2 += delta; } else { wall.x1 += delta; wall.x2 += delta; }
      for (const [index, id] of partition.roomIds.entries()) {
        const r2 = next.rooms.find(r => r.id === id);
        const sizeKey = horizontal ? 'h' : 'w', originKey = horizontal ? 'y' : 'x';
        r2[sizeKey] += index === 0 ? delta : -delta;
        if (index === 1) r2[originKey] += delta;
        touchedRoomIds.add(id);
      }
      impact.wallIds.push(wall.id);
      impact.openingIds.push(...next.openings.filter(o => o.wallId === wall.id).map(o => o.id));
    }
    for (const id of touchedRoomIds) {
      const r2 = next.rooms.find(r => r.id === id), before2 = model.rooms.find(r => r.id === id);
      if (r2.w <= 0 || r2.h <= 0) fail('INVALID_GEOMETRY', 'تغيير الأبعاد يلغي المساحة الصافية لإحدى الغرف.');
      const minimum = TYPES[r2.type]?.min;
      if (!Number.isFinite(minimum) || r2.w < minimum - 1e-5 || r2.h < minimum - 1e-5 || Math.max(r2.w / r2.h, r2.h / r2.w) > 5) fail('INVALID_GEOMETRY', `PLANNER_ROOM_FEASIBILITY: ${r2.name} يتجاوز حدود المولد الحالية: البعد الأدنى ${minimum} م ونسبة الاستطالة القصوى 5؛ ليست اشتراطات نظامية.`);
      r2.area = r2.w * r2.h; r2.targetArea = r2.area;
      const requested = next.program.find(r => r.id === id);
      if (!requested) fail('INVALID_GEOMETRY', 'غرفة بلا سجل برنامج مطابق.');
      requested.area = r2.area;
      if (Object.hasOwn(requested, 'targetArea')) requested.targetArea = r2.area;
      impact.rooms.push({ id, beforeArea: before2.w * before2.h, afterArea: r2.area });
    }
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
