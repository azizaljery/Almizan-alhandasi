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

// ---- Room-level structural editing (resize by corner, split, delete/merge, corridor delete) ----
// All of these are built on the same atomic preview model as the partition/room moves:
// they only produce a proposal that validateModel() must accept, never mutate the input.
const CORNERS = Object.freeze({ 'top-right': ['right', 'top'], 'top-left': ['left', 'top'], 'bottom-right': ['right', 'bottom'], 'bottom-left': ['left', 'bottom'] });
const SIDE_LABEL = Object.freeze({ left: 'اليسار', right: 'اليمين', top: 'الأعلى', bottom: 'الأسفل' });
const intThickness = model => model.walls.find(w => w.type === 'int')?.t ?? .15;
const intHeight = model => model.walls.find(w => w.type === 'int')?.h ?? 3.2;
const nextId = (prefix, items) => prefix + (Math.max(-1, ...items.map(item => Number(String(item.id).split('-').at(-1)) || 0)) + 1);
function assertFeasible(room, label = room.name) {
  const minimum = TYPES[room.type]?.min;
  if (!(room.w > 0 && room.h > 0)) fail('INVALID_GEOMETRY', 'التعديل يلغي المساحة الصافية لإحدى الغرف.');
  if (!Number.isFinite(minimum) || room.w < minimum - 1e-5 || room.h < minimum - 1e-5 || Math.max(room.w / room.h, room.h / room.w) > 5)
    fail('INVALID_GEOMETRY', `PLANNER_ROOM_FEASIBILITY: ${label} يتجاوز حدود المولد الحالية: البعد الأدنى ${minimum} م ونسبة الاستطالة القصوى 5؛ ليست اشتراطات نظامية.`);
}
function syncProgramArea(next, room) {
  room.area = room.w * room.h; room.targetArea = room.area;
  const requested = next.program.find(r => r.id === room.id);
  if (!requested) fail('INVALID_GEOMETRY', 'غرفة بلا سجل برنامج مطابق.');
  requested.area = room.area;
  if (Object.hasOwn(requested, 'targetArea')) requested.targetArea = room.area;
}
// Displace whole partition walls (each full-span, between exactly two rooms) and resize their two rooms.
function shiftPartitions(next, partitions, moves, touched, impact) {
  for (const mv of moves) {
    const wall = next.walls.find(w => w.id === mv.wallId), partition = partitions.find(p => p.wallId === mv.wallId), horizontal = partition.orientation === 'horizontal';
    if (horizontal) { wall.y1 += mv.delta; wall.y2 += mv.delta; } else { wall.x1 += mv.delta; wall.x2 += mv.delta; }
    for (const [index, id] of partition.roomIds.entries()) {
      const room = next.rooms.find(r => r.id === id), sizeKey = horizontal ? 'h' : 'w', originKey = horizontal ? 'y' : 'x';
      room[sizeKey] += index === 0 ? mv.delta : -mv.delta;
      if (index === 1) room[originKey] += mv.delta;
      touched.add(id);
    }
    impact.wallIds.push(wall.id);
    impact.openingIds.push(...next.openings.filter(o => o.wallId === wall.id).map(o => o.id));
  }
}
function settleRooms(model, next, touched, impact) {
  for (const id of touched) {
    const room = next.rooms.find(r => r.id === id), before = model.rooms.find(r => r.id === id);
    assertFeasible(room); syncProgramArea(next, room);
    impact.rooms.push({ id, beforeArea: before ? before.w * before.h : 0, afterArea: room.area });
  }
}
function isLocked(model, roomId) { return hasDimensions(model.rooms.find(r => r.id === roomId)) || hasDimensions(model.program.find(r => r.id === roomId)); }
function spaceName(model, id) { return model.rooms.find(r => r.id === id)?.name || model.corridors.find(c => c.id === id)?.name || id; }
function newRoomName(model, type) {
  const base = TYPES[type]?.name || 'غرفة', taken = new Set(model.rooms.map(r => r.name));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
  return `${base} ${model.rooms.length + 1}`;
}
// For the UI: what each room can currently do. Previews re-derive and enforce all of this.
export function eligibleRoomEdits(model, { landSurvey = null } = {}) {
  const reason = unsupported(model, landSurvey);
  const partitions = reason ? [] : eligiblePartitions(model, { landSurvey });
  const t = reason ? 0 : intThickness(model);
  return (model?.rooms || []).map(room => {
    const none = { roomId: room.id, resize: { left: false, right: false, top: false, bottom: false }, split: { x: false, y: false }, mergeWith: [], eligible: false };
    if (reason) return { ...none, reason };
    if (isLocked(model, room.id)) return { ...none, reason: 'DIMENSIONS_LOCKED: أبعاد هذه الغرفة مثبتة صراحة؛ لا يعدّلها هذا الإجراء.' };
    const resize = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(side => [side, !!roomSideWall(partitions, room, side)]));
    const minimum = TYPES[room.type]?.min ?? 0;
    const split = { x: room.w >= 2 * minimum + t + 1e-5, y: room.h >= 2 * minimum + t + 1e-5 };
    const mergeWith = partitions.filter(p => p.eligible && p.roomIds.includes(room.id)).map(p => p.roomIds.find(id => id !== room.id));
    const eligible = Object.values(resize).some(Boolean) || split.x || split.y || mergeWith.length > 0;
    return { ...none, resize, split, mergeWith, eligible, reason: eligible ? null : 'لا يمكن تعديل هذه الغرفة من هذه الدفعة (محاطة بجدران خارجية أو حدود ممرات).' };
  });
}
export function eligibleCorridors(model, { landSurvey = null } = {}) {
  const reason = unsupported(model, landSurvey);
  return (model?.corridors || []).map(corridor => ({ corridorId: corridor.id, eligible: !reason && corridor.id !== 'spine',
    reason: reason || (corridor.id === 'spine' ? 'الممر الرئيسي هو عمود الحركة؛ لا يُحذف.' : null) }));
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
  } else if (command.type === 'resize-room') {
    const room = next.rooms.find(r => r.id === command.roomId), originalRoom = model.rooms.find(r => r.id === command.roomId);
    if (!room || !originalRoom) fail('ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    if (!Object.hasOwn(CORNERS, command.corner)) fail('INVALID_COMMAND', 'حدّد زاوية صالحة لتغيير حجم الغرفة.');
    for (const key of ['dxM', 'dyM']) if (command[key] != null && !Number.isFinite(command[key])) fail('INVALID_COMMAND', 'إزاحة الزاوية يجب أن تكون رقمًا بالمتر.');
    const dx = snap(command.dxM || 0), dy = snap(command.dyM || 0);
    if (!dx && !dy) fail('NO_CHANGE', 'الإزاحة أصغر من شبكة التحرير 0.05 م.');
    applied.dxM = dx; applied.dyM = dy;
    if (isLocked(model, originalRoom.id)) fail('DIMENSIONS_LOCKED', 'أبعاد هذه الغرفة مثبتة صراحة؛ لا يغيّرها هذا الإجراء.');
    const partitions = eligiblePartitions(model, { landSurvey }), [xSide, ySide] = CORNERS[command.corner], moves = [];
    for (const [side, delta] of [[xSide, dx], [ySide, dy]]) {
      if (!delta) continue;
      const match = roomSideWall(partitions, originalRoom, side);
      if (!match) fail('ROOM_RESIZE_BLOCKED', `تعذّر تغيير حجم الغرفة من جهة ${SIDE_LABEL[side]}: لا يوجد قاطع داخلي كامل مؤهل هناك (قد يكون جدارًا خارجيًا أو حد ممر أو قاطعًا جزئيًا أو غرفة مجاورة ذات أبعاد مثبتة).`);
      moves.push({ wallId: match.wallId, delta });
    }
    const touched = new Set([originalRoom.id]);
    shiftPartitions(next, partitions, moves, touched, impact);
    settleRooms(model, next, touched, impact);
    impact.requiresConfirmation = true;
  } else if (command.type === 'split-room') {
    const parent = next.rooms.find(r => r.id === command.roomId), original = model.rooms.find(r => r.id === command.roomId);
    if (!parent || !original) fail('ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    if (!['x', 'y'].includes(command.axis)) fail('INVALID_COMMAND', 'حدّد اتجاه التقسيم: رأسي (x) أو أفقي (y).');
    if (!Number.isFinite(command.atM)) fail('INVALID_COMMAND', 'موضع التقسيم يجب أن يكون رقمًا بالمتر من بداية الغرفة.');
    if (isLocked(model, original.id)) fail('DIMENSIONS_LOCKED', 'أبعاد هذه الغرفة مثبتة صراحة؛ لا تُقسَّم.');
    const newType = command.newType ?? original.type;
    if (!Object.hasOwn(TYPES, newType)) fail('INVALID_COMMAND', 'نوع الغرفة الجديدة غير معروف.');
    const t = intThickness(model), vertical = command.axis === 'x', cut = snap(command.atM), size = vertical ? original.w : original.h;
    if (!(cut > 0 && cut < size)) fail('INVALID_COMMAND', 'موضع التقسيم يجب أن يقع داخل الغرفة.');
    applied.atM = cut;
    const origin = vertical ? original.x : original.y, line = origin + cut, secondNew = command.newRoomAt !== 'first';
    const rects = [{ lo: origin, hi: line - t / 2 }, { lo: line + t / 2, hi: origin + size }];
    const newId = nextId('room-', [...next.rooms, ...next.program]), wallId = nextId('wall-', next.walls);
    const setSpan = (room, span) => { if (vertical) { room.x = span.lo; room.w = span.hi - span.lo; } else { room.y = span.lo; room.h = span.hi - span.lo; } };
    const created = { ...structuredClone(original), id: newId, name: String(command.newName ?? '').trim() || newRoomName(model, newType), type: newType };
    delete created.corridorId; delete created.doorSide; delete created.dimensions; delete created.exactDimensionsM; delete created.exactDimensions;
    if (created.name.length > 70) fail('INVALID_COMMAND', 'اسم الغرفة الجديدة أطول من 70 حرفًا.');
    setSpan(parent, rects[secondNew ? 0 : 1]); setSpan(created, rects[secondNew ? 1 : 0]);
    assertFeasible(parent); assertFeasible(created);
    const half = value => value < line - 1e-9 ? 0 : 1, ownerOf = half => (half === (secondNew ? 0 : 1)) ? parent.id : created.id;
    for (const opening of next.openings) {
      const touchesParent = opening.roomId === parent.id || opening.connects?.includes(parent.id);
      if (!touchesParent) continue;
      const wall = next.walls.find(w => w.id === opening.wallId), point = openingPoint(next, opening), horizontalWall = near(wall.y1, wall.y2);
      const along = vertical ? point.x : point.y;
      const runsAcross = vertical ? horizontalWall : !horizontalWall;
      if (runsAcross && Math.abs(along - line) < opening.w / 2 + t / 2 + 1e-6) fail('INVALID_GEOMETRY', 'خط التقسيم يمر بفتحة قائمة (باب أو نافذة)؛ حرّك موضع التقسيم أو الفتحة أولًا.');
      const owner = ownerOf(half(along));
      if (opening.roomId === parent.id) opening.roomId = owner;
      if (opening.connects) opening.connects = opening.connects.map(id => id === parent.id ? owner : id);
    }
    const wallLength = (vertical ? original.h : original.w) + t, doorW = .9;
    if (wallLength < doorW + .4) fail('INVALID_GEOMETRY', 'الغرفة أضيق من أن يتسع الجدار الجديد لباب بين القسمين.');
    next.walls.push({ id: wallId, x1: vertical ? line : original.x - t / 2, y1: vertical ? original.y - t / 2 : line, x2: vertical ? line : original.x + original.w + t / 2, y2: vertical ? original.y + original.h + t / 2 : line, type: 'int', t, h: intHeight(model) });
    const doorId = nextId('opening-', next.openings);
    next.openings.push({ type: 'door', w: doorW, h: 2.1, sill: 0, roomId: parent.id, connects: [parent.id, created.id], id: doorId, wallId, pos: .5 });
    next.rooms.push(created);
    next.program.push({ id: newId, name: created.name, type: created.type, area: 0, targetArea: 0, position: original.position, side: original.side });
    syncProgramArea(next, parent); syncProgramArea(next, created);
    impact.rooms.push({ id: parent.id, beforeArea: original.w * original.h, afterArea: parent.area }, { id: newId, beforeArea: 0, afterArea: created.area });
    impact.wallIds.push(wallId); impact.openingIds.push(doorId);
    impact.addedRoomId = newId; impact.requiresConfirmation = true;
  } else if (command.type === 'delete-room') {
    const original = model.rooms.find(r => r.id === command.roomId);
    if (!original) fail('ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    if (model.rooms.length <= 1) fail('ROOM_DELETE_BLOCKED', 'لا يمكن حذف آخر غرفة في المخطط.');
    if (isLocked(model, original.id)) fail('DIMENSIONS_LOCKED', 'أبعاد هذه الغرفة مثبتة صراحة؛ لا تُحذف بهذا الإجراء.');
    const partitions = eligiblePartitions(model, { landSurvey }).filter(p => p.eligible && p.roomIds.includes(original.id));
    if (!partitions.length) fail('ROOM_DELETE_BLOCKED', 'لا يوجد قاطع داخلي كامل يفصل هذه الغرفة عن جارة مناسبة لتتسع مكانها؛ لا يمكن حذفها دون هدم جدار خارجي أو حد ممر.');
    const area = id => { const r = model.rooms.find(x => x.id === id); return r.w * r.h; };
    const neighbourOf = p => p.roomIds.find(id => id !== original.id);
    let chosen;
    if (command.mergeIntoRoomId != null) {
      chosen = partitions.find(p => neighbourOf(p) === command.mergeIntoRoomId);
      if (!chosen) fail('ROOM_DELETE_BLOCKED', 'الغرفة المحددة ليست جارة مؤهلة لاستيعاب المساحة.');
    } else {
      chosen = [...partitions].sort((a, b) => (model.rooms.find(r => r.id === neighbourOf(b)).type === original.type) - (model.rooms.find(r => r.id === neighbourOf(a)).type === original.type) || area(neighbourOf(b)) - area(neighbourOf(a)))[0];
    }
    const survivorId = neighbourOf(chosen);
    if (isLocked(model, survivorId)) fail('DIMENSIONS_LOCKED', 'أبعاد الغرفة المجاورة مثبتة صراحة؛ لا تتسع.');
    applied.mergeIntoRoomId = survivorId;
    const survivor = next.rooms.find(r => r.id === survivorId), removed = next.rooms.find(r => r.id === original.id);
    const x = Math.min(survivor.x, removed.x), y = Math.min(survivor.y, removed.y);
    const w = Math.max(survivor.x + survivor.w, removed.x + removed.w) - x, h = Math.max(survivor.y + survivor.h, removed.y + removed.h) - y;
    Object.assign(survivor, { x, y, w, h });
    assertFeasible(survivor);
    next.walls = next.walls.filter(wall => wall.id !== chosen.wallId);
    next.openings = next.openings.filter(o => o.wallId !== chosen.wallId);
    for (const opening of next.openings) {
      if (opening.roomId === removed.id) opening.roomId = survivor.id;
      if (opening.connects) opening.connects = opening.connects.map(id => id === removed.id ? survivor.id : id);
    }
    next.openings = next.openings.filter(o => o.type !== 'door' || !o.connects || o.connects[0] !== o.connects[1]);
    next.rooms = next.rooms.filter(r => r.id !== removed.id);
    next.program = next.program.filter(r => r.id !== removed.id);
    syncProgramArea(next, survivor);
    impact.rooms.push({ id: survivor.id, beforeArea: model.rooms.find(r => r.id === survivor.id).w * model.rooms.find(r => r.id === survivor.id).h, afterArea: survivor.area });
    impact.removedRoomId = removed.id; impact.removedRoomArea = original.w * original.h; impact.wallIds.push(chosen.wallId);
    impact.requiresConfirmation = true;
  } else if (command.type === 'delete-corridor') {
    const corridor = next.corridors.find(c => c.id === command.corridorId);
    if (!corridor) fail('CORRIDOR_NOT_FOUND', 'الممر غير موجود.');
    if (corridor.id === 'spine') fail('CORRIDOR_NOT_ELIGIBLE', 'الممر الرئيسي هو عمود الحركة؛ لا يُحذف.');
    const doors = next.openings.filter(o => o.type === 'door' && o.connects?.includes(corridor.id));
    next.corridors = next.corridors.filter(c => c.id !== corridor.id);
    next.links = next.links.filter(pair => !pair.includes(corridor.id));
    next.openings = next.openings.filter(o => !(o.type === 'door' && o.connects?.includes(corridor.id)));
    impact.corridorId = corridor.id; impact.corridorArea = corridor.w * corridor.h; impact.openingIds.push(...doors.map(d => d.id));
    impact.requiresConfirmation = true;
  } else fail('UNSUPPORTED_COMMAND', 'نوع أمر التحرير غير مدعوم.');
  try { normalizeRooms(next.program); } catch (error) { fail('INVALID_GEOMETRY', error.message); }
  const errors = validateModel(next); if (errors.length) fail('INVALID_GEOMETRY', errors.join(' | '));
  validateWindows(next);
  if (next.integration) next.integration = { previousCandidateId: next.integration.candidateId || next.integration.previousCandidateId || null,
    candidateId: null, geometryHash: null, reviewId: null, reviewOverall: 'NOT_EVALUATED', reviewCoverage: null, requiresReview: true };
  next.geometryRevision = revision + 1;
  return { model: next, command: applied, impact, baseRevision: revision, nextRevision: revision + 1 };
}
