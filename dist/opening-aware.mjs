// مقارنة تراعي الفتحات (AZ-06): تقييم ثانوي لكل بديل بحسب موضع الأبواب والنوافذ فعليًا.
//  - الخصوصية في plan-evidence تقيس اشتراك الممر فقط وتتجاهل الأبواب والنوافذ، فتعطي 0 أو قيمة واحدة لكل البدائل.
//  - هذه الوحدة نقية: لا تلمس النموذج ولا اختيار AZIZ ولا ترتيب البدائل (نفس فلسفة rankByDNA: العرض للقرار والقرار للعميل).
//  - كل محور بحالة: measured (هندسة الرسم نفسها) / estimated (يعتمد على افتراض معلن) / unavailable (لا بيانات).
//  - لا تُخترع عتبات: المحاور تحسب نسبًا من عدّ حقيقي، والمحور النسبي (حمل الأبواب) يُقارَن بين البدائل نفسها لا بمرجع.
import { openingPoint } from './planner.mjs';
import { circulationNetwork } from './circulation.mjs';

export const OPENING_AWARE_VERSION = 'opening-aware/1.0.0';

export const AXIS_LABELS = Object.freeze({
  bedroomDoorExposure: 'تعرّض أبواب غرف النوم للمدخل والمجلس',
  bedroomWindowExposure: 'نوافذ غرف النوم المطلة على الشارع أو الجار',
  guestPath: 'مسار الضيف إلى المجلس ودورة مياه دون عبور أبواب العائلة',
  corridorDoorLoad: 'عدد الأبواب على الممر الأكثر ازدحامًا',
});

const BEDROOM = new Set(['bedroom', 'master-bedroom']);
const FAMILY = new Set(['bedroom', 'master-bedroom', 'living', 'dining']);
// غرفة «ضيافة»: المجلس بالنوع أو أي غرفة اسمها يدل على الضيوف (نفس منطق ensuite.mjs).
const GUEST_NAME = /ضيوف|ضيافة|مجلس/u;
const isGuestRoom = r => !!r && (r.type === 'majlis' || GUEST_NAME.test(r.name || ''));
const EPS = 1e-6;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round1 = n => Math.round(n * 10) / 10;
const inRect = (p, r, tol = 0) => p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol;

function axis(key, status, score, detail, evidence = [], extra = {}) {
  return { key, label: AXIS_LABELS[key], status, score, detail, evidence, ...extra };
}
const unavailable = (key, detail) => axis(key, 'unavailable', null, detail);

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}
const pointPolylineDistance = (p, pts) => pts.length < 2 ? (pts[0] ? dist(p, pts[0]) : Infinity)
  : Math.min(...pts.slice(1).map((q, i) => pointSegmentDistance(p, pts[i], q)));

// سياق مشترك: يبني الفهارس مرة واحدة ويحمي من نموذج ناقص.
function context(model) {
  const rooms = new Map((model.rooms || []).map(r => [r.id, r]));
  const corridors = new Map((model.corridors || []).map(c => [c.id, c]));
  const walls = new Map((model.walls || []).map(w => [w.id, w]));
  const doors = (model.openings || []).filter(o => o.type === 'door' && walls.has(o.wallId) && Number.isFinite(o.pos));
  const windows = (model.openings || []).filter(o => o.type === 'window' && walls.has(o.wallId) && Number.isFinite(o.pos));
  return { rooms, corridors, walls, doors, windows, point: o => openingPoint(model, o) };
}
const doorRoomIds = (door, ctx) => [...new Set([...(door.connects || []).filter(id => ctx.rooms.has(id)), ...(door.roomId && ctx.rooms.has(door.roomId) ? [door.roomId] : [])])];
const doorCorridorId = (door, ctx) => (door.connects || []).find(id => ctx.corridors.has(id)) || null;

// ---------------------------------------------------------------------------------- 1) أبواب غرف النوم
// باب يفتح مباشرة على المجلس، أو باب ظاهر من باب المدخل/باب المجلس على خط مستقيم داخل الممر نفسه (الأبواب مغلقة افتراضيًا:
// المقصود ما يُرى عند فتحها، لا ما يُرى داخل الغرفة).
function bedroomDoorExposure(model, ctx) {
  const key = 'bedroomDoorExposure';
  const bedrooms = [...ctx.rooms.values()].filter(r => BEDROOM.has(r.type));
  if (!bedrooms.length) return unavailable(key, 'لا توجد غرف نوم في هذا البديل.');
  const bedDoors = [];
  const unresolved = [];
  for (const room of bedrooms) {
    const own = ctx.doors.filter(d => doorRoomIds(d, ctx).includes(room.id));
    if (!own.length) unresolved.push({ kind: 'no-door', roomId: room.id });
    for (const d of own) bedDoors.push({ door: d, room });
  }
  if (!bedDoors.length) return unavailable(key, 'لا يوجد باب مرسوم لأي غرفة نوم؛ لا يمكن قياس التعرض.');
  const entries = ctx.doors.filter(d => (d.connects || []).includes('outside'));
  const guestDoors = ctx.doors.filter(d => !(d.connects || []).includes('outside') && doorRoomIds(d, ctx).some(id => isGuestRoom(ctx.rooms.get(id))));
  const sources = [...entries.map(d => ({ door: d, kind: 'entry' })), ...guestDoors.map(d => ({ door: d, kind: 'guest-room' }))];
  const exposed = new Map(); // roomId -> أدلة
  const add = (roomId, ev) => { if (!exposed.has(roomId)) exposed.set(roomId, []); exposed.get(roomId).push(ev); };
  for (const { door, room } of bedDoors) {
    const ids = doorRoomIds(door, ctx);
    const reception = ids.map(id => ctx.rooms.get(id)).find(r => r && r.id !== room.id && isGuestRoom(r));
    if (reception) { add(room.id, { kind: 'direct-to-guest-room', openingId: door.id, roomId: room.id, otherRoomId: reception.id }); continue; }
    const cId = doorCorridorId(door, ctx);
    if (!cId) { unresolved.push({ kind: 'door-without-corridor', openingId: door.id, roomId: room.id }); continue; }
    const c = ctx.corridors.get(cId), p = ctx.point(door);
    for (const s of sources) {
      if (doorCorridorId(s.door, ctx) !== cId || s.door.id === door.id) continue;
      const q = ctx.point(s.door), tol = 0.2;
      // الخط المستقيم بين البابين يجب أن يبقى كله داخل مستطيل الممر نفسه (مع سماكة الجدار).
      let clear = true;
      const n = Math.max(2, Math.ceil(dist(p, q) / 0.1));
      for (let i = 0; i <= n && clear; i++) clear = inRect({ x: p.x + (q.x - p.x) * i / n, y: p.y + (q.y - p.y) * i / n }, c, tol);
      if (clear) add(room.id, { kind: s.kind === 'entry' ? 'sightline-from-entry' : 'sightline-from-guest-door', openingId: door.id, fromOpeningId: s.door.id, roomId: room.id, corridorId: cId, distanceM: round1(dist(p, q)) });
    }
  }
  const doorBedrooms = [...new Set(bedDoors.map(x => x.room.id))];
  const exposedRooms = doorBedrooms.filter(id => exposed.has(id));
  const score = (doorBedrooms.length - exposedRooms.length) / doorBedrooms.length * 100;
  const noEntry = !entries.length;
  return axis(key, unresolved.length || noEntry ? 'estimated' : 'measured', score,
    `${exposedRooms.length} من ${doorBedrooms.length} غرف نوم ببابها مكشوف (مباشر على المجلس أو في خط رؤية المدخل/باب المجلس داخل الممر نفسه).` +
    (noEntry ? ' لا يوجد باب مدخل بين الفتحات؛ خطوط الرؤية من المدخل غير متحقق منها.' : '') + (unresolved.length ? ` ${unresolved.length} باب/غرفة لم يمكن تصنيفها.` : ''),
    [...exposed.values()].flat(), { unresolved, bedroomIds: doorBedrooms, exposedRoomIds: exposedRooms });
}

// ---------------------------------------------------------------------------------- 2) نوافذ غرف النوم
// الاتجاه الخارجي من موضع الغرفة بالنسبة للجدار، ثم شعاع حتى حد الأرض: شارع (من plot.streets) أو جار (حد الأرض)
// أو فناء أو جزء آخر من المنزل. وجود مبنى فعلي عند الجار غير معروف، فيُعلن الحكم «تقديري».
function classifyWindow(model, ctx, room, win) {
  const wall = ctx.walls.get(win.wallId), t = wall.t || 0.25;
  const vertical = Math.abs(wall.x2 - wall.x1) < EPS, horizontal = Math.abs(wall.y2 - wall.y1) < EPS;
  if (!vertical && !horizontal) return { kind: 'unresolved', reason: 'جدار غير متعامد' };
  const p = ctx.point(win), centre = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const edgeDistance = vertical ? Math.min(Math.abs(wall.x1 - room.x), Math.abs(wall.x1 - room.x - room.w)) : Math.min(Math.abs(wall.y1 - room.y), Math.abs(wall.y1 - room.y - room.h));
  if (edgeDistance > t + 1e-3) return { kind: 'unresolved', reason: 'الجدار لا يلاصق الغرفة' };
  const n = vertical ? { x: Math.sign(wall.x1 - centre.x), y: 0 } : { x: 0, y: Math.sign(wall.y1 - centre.y) };
  const side = vertical ? (n.x > 0 ? 'e' : 'w') : (n.y > 0 ? 'n' : 's');
  const length = model.plot?.length, width = model.plot?.width;
  const limit = side === 'e' ? width : side === 'n' ? length : 0;
  if (!Number.isFinite(limit)) return { kind: 'unresolved', reason: 'أبعاد الأرض غير متاحة' };
  const wallCoord = vertical ? wall.x1 : wall.y1;
  const steps = Math.max(1, Math.ceil(Math.abs(limit - wallCoord) / 0.1));
  const others = [...ctx.rooms.values()].filter(r => r.id !== room.id), courts = model.courtyards || [];
  for (let i = 1; i <= steps; i++) {
    const q = { x: p.x + n.x * (t / 2 + 0.1 * i), y: p.y + n.y * (t / 2 + 0.1 * i) };
    const ci = courts.findIndex(c => inRect(q, c, 0.02));
    if (ci >= 0) return { kind: 'courtyard', side, courtyardIndex: ci };
    const hit = others.find(r => inRect(q, r)) || [...ctx.corridors.values()].find(c => inRect(q, c));
    if (hit) return { kind: 'own-building', side, blockedById: hit.id, distanceM: round1(dist(p, q)) };
  }
  const gap = Math.abs(limit - wallCoord);
  if (model.plot?.streets?.[side]) return { kind: 'street', side, distanceM: round1(gap) };
  // «قريب» = الجدار على حد الارتداد المعلن لهذا الجانب (أو أقل) مع سماكة الجدار؛ لا عتبة مخترعة.
  const setback = Number.isFinite(model.footprint?.sb?.[side]) ? model.footprint.sb[side] : Number.isFinite(model.plot?.neighborSetback) ? model.plot.neighborSetback : null;
  const near = setback === null ? null : gap <= setback + t + 1e-6;
  return { kind: 'neighbour', side, distanceM: round1(gap), setbackM: setback, near };
}

function bedroomWindowExposure(model, ctx) {
  const key = 'bedroomWindowExposure';
  const bedrooms = [...ctx.rooms.values()].filter(r => BEDROOM.has(r.type));
  if (!bedrooms.length) return unavailable(key, 'لا توجد غرف نوم في هذا البديل.');
  const evidence = [], unresolved = [], noWindow = [], exposedRoomIds = [];
  let sawNeighbour = false, evaluated = 0;
  for (const room of bedrooms) {
    const wins = ctx.windows.filter(w => w.roomId === room.id);
    if (!wins.length) { noWindow.push(room.id); continue; }
    const classes = wins.map(w => ({ w, c: classifyWindow(model, ctx, room, w) }));
    for (const { w, c } of classes) {
      if (c.kind === 'unresolved') unresolved.push({ openingId: w.id, roomId: room.id, reason: c.reason });
      else evidence.push({ kind: 'window-' + c.kind, openingId: w.id, roomId: room.id, side: c.side, ...(c.distanceM !== undefined ? { distanceM: c.distanceM } : {}), ...(c.kind === 'neighbour' ? { setbackM: c.setbackM, near: c.near } : {}), ...(c.blockedById ? { blockedById: c.blockedById } : {}), ...(c.courtyardIndex !== undefined ? { courtyardIndex: c.courtyardIndex } : {}), sillM: w.sill ?? null });
    }
    const known = classes.filter(x => x.c.kind !== 'unresolved');
    if (!known.length) continue;
    evaluated++;
    // معرَّض: نافذة على شارع، أو على حد جار عند الارتداد المعلن (أو أقل). بُعد الارتداد المجهول يُعامل كمعرَّض ويُعلَن تقديريًا.
    const nearNb = x => x.c.kind === 'neighbour' && x.c.near !== false;
    const exposed = known.some(x => x.c.kind === 'street' || nearNb(x));
    if (known.some(x => x.c.kind === 'neighbour' && (x.c.near === null || nearNb(x)))) sawNeighbour = true;
    if (exposed) exposedRoomIds.push(room.id);
  }
  if (!evaluated) return unavailable(key, 'لا نافذة مصنّفة لأي غرفة نوم' + (noWindow.length ? ` (${noWindow.length} غرف بلا نافذة مرسومة).` : '.'));
  const score = (evaluated - exposedRoomIds.length) / evaluated * 100;
  return axis(key, sawNeighbour || unresolved.length ? 'estimated' : 'measured', score,
    `${exposedRoomIds.length} من ${evaluated} غرف نوم لها نافذة على شارع أو على حد جار عند الارتداد المعلن.` + (sawNeighbour ? ' وجود مبنى فعلي عند الجار غير متحقق منه.' : '') +
    (noWindow.length ? ` ${noWindow.length} غرفة بلا نافذة مرسومة خارج الحساب.` : '') + ' ارتفاع العتبة مسجّل في الدليل ولا يدخل الدرجة.',
    evidence, { unresolved, noWindowRoomIds: noWindow, exposedRoomIds, assumption: sawNeighbour ? 'حد الأرض يُعامل كجار محتمل' : null });
}

// ---------------------------------------------------------------------------------- 3) مسار الضيف
// مسار المدخل إلى الوجهة (من شبكة الحركة الفعلية). «يعبر» إذا مرّ على باب غرفة عائلية (نوم/معيشة/طعام) غير الوجهة نفسها
// ضمن عرض الممر الذي يسلكه المسار.
function guestPath(model, ctx) {
  const key = 'guestPath';
  const guests = [...ctx.rooms.values()].filter(isGuestRoom);
  if (!guests.length) return unavailable(key, 'لا يوجد مجلس أو غرفة ضيافة في هذا البديل.');
  let net;
  try { net = circulationNetwork(model); } catch { return unavailable(key, 'تعذّر بناء شبكة الحركة لهذا النموذج.'); }
  const familyDoors = ctx.doors.filter(d => !(d.connects || []).includes('outside') && doorRoomIds(d, ctx).some(id => FAMILY.has(ctx.rooms.get(id).type)));
  const crossings = (path, destId) => {
    const out = [];
    for (const d of familyDoors) {
      const ids = doorRoomIds(d, ctx), familyRoom = ids.find(id => FAMILY.has(ctx.rooms.get(id).type) && id !== destId);
      const cId = doorCorridorId(d, ctx);
      if (!familyRoom || !cId || !path.spaces.includes(cId) || ids.includes(destId)) continue;
      const c = ctx.corridors.get(cId), half = (c.w >= c.h ? c.h : c.w) / 2 + (ctx.walls.get(d.wallId).t || 0.25);
      const d0 = pointPolylineDistance(ctx.point(d), path.points);
      if (d0 <= half) out.push({ openingId: d.id, roomId: familyRoom, corridorId: cId, distanceFromRouteM: round1(d0) });
    }
    return out;
  };
  const evidence = [], unresolved = [];
  let clean = 0, total = 0;
  for (const g of guests) {
    const path = net.toRoom(g.id);
    if (!path) { unresolved.push({ kind: 'unreachable', roomId: g.id }); continue; }
    const x = crossings(path, g.id); total++; if (!x.length) clean++;
    evidence.push({ kind: 'guest-room-route', roomId: g.id, routeM: round1(path.metres), crossesFamilyDoors: x });
  }
  // دورة مياه الضيوف: أي دورة مياه ليست ملحقة بغرفة عائلية، يكفي أن يوجد مسار واحد نظيف إليها.
  const baths = [...ctx.rooms.values()].filter(r => r.type === 'bath' && !ctx.doors.some(d => doorRoomIds(d, ctx).includes(r.id) && doorRoomIds(d, ctx).some(id => FAMILY.has(ctx.rooms.get(id).type))));
  const bathRoutes = baths.map(b => { const p = net.toRoom(b.id); return p ? { roomId: b.id, routeM: round1(p.metres), crossesFamilyDoors: crossings(p, b.id) } : null; }).filter(Boolean);
  if (bathRoutes.length) {
    total++; if (bathRoutes.some(b => !b.crossesFamilyDoors.length)) clean++;
    evidence.push({ kind: 'guest-bath-routes', options: bathRoutes });
  }
  if (!total) return unavailable(key, 'لا مسار مكتمل من المدخل إلى أي غرفة ضيافة.');
  return axis(key, unresolved.length ? 'estimated' : 'measured', clean / total * 100,
    `${clean} من ${total} وجهات ضيافة (مجلس/دورة مياه ضيوف) تُبلغ دون المرور على باب غرفة عائلية.` +
    (bathRoutes.length ? '' : ' لا دورة مياه مستقلة عن غرف العائلة في الرسم.') + (unresolved.length ? ` ${unresolved.length} غرفة ضيافة غير موصولة بالمدخل.` : '') +
    ' تحديد «دورة مياه الضيوف» افتراضه أنها أي دورة غير ملحقة بغرفة عائلية.',
    evidence, { unresolved });
}

// ---------------------------------------------------------------------------------- 4) أبواب الممر
function corridorDoorLoad(model, ctx) {
  const key = 'corridorDoorLoad';
  if (!ctx.corridors.size) return unavailable(key, 'لا توجد ممرات في هذا البديل.');
  const per = [...ctx.corridors.values()].map(c => ({ corridorId: c.id, doorIds: ctx.doors.filter(d => doorCorridorId(d, ctx) === c.id && !(d.connects || []).includes('outside')).map(d => d.id) }));
  const max = Math.max(...per.map(p => p.doorIds.length));
  // الدرجة تُحسب نسبيًا بين البدائل في compareOpeningAware (لا مرجع مطلق للعدد).
  return axis(key, 'measured', null, `أكثر ممر ازدحامًا عليه ${max} أبواب (دون باب المدخل).`, per, { value: max, scoreBasis: 'relative-among-alternatives' });
}

/** يقيّم بديلًا واحدًا. لا يغيّر النموذج. */
export function assessOpenings(model) {
  if (!model || !Array.isArray(model.rooms) || !Array.isArray(model.openings) || !Array.isArray(model.walls)) {
    return { version: OPENING_AWARE_VERSION, axes: {}, partialScore: null, coverage: { scored: 0, total: Object.keys(AXIS_LABELS).length }, note: 'غير متحقق: نموذج ناقص (غرف/فتحات/جدران).' };
  }
  const ctx = context({ ...model, corridors: model.corridors || [] });
  const guard = (key, fn) => { try { return fn(); } catch (e) { return unavailable(key, 'تعذّر الحساب: ' + (e.message || e)); } };
  const m = { ...model, corridors: model.corridors || [] };
  const axes = {
    bedroomDoorExposure: guard('bedroomDoorExposure', () => bedroomDoorExposure(m, ctx)),
    bedroomWindowExposure: guard('bedroomWindowExposure', () => bedroomWindowExposure(m, ctx)),
    guestPath: guard('guestPath', () => guestPath(m, ctx)),
    corridorDoorLoad: guard('corridorDoorLoad', () => corridorDoorLoad(m, ctx)),
  };
  return { version: OPENING_AWARE_VERSION, axes, ...summarize(axes) };
}

function summarize(axes) {
  const list = Object.values(axes), scored = list.filter(a => a.status !== 'unavailable' && Number.isFinite(a.score));
  return { partialScore: scored.length ? Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length * 10) / 10 : null, coverage: { scored: scored.length, total: list.length } };
}

/**
 * مقارنة ثانوية بين البدائل (لا تعيد ترتيبها ولا تغيّر اختيار AZIZ).
 * الدرجة الجزئية = متوسط غير موزون للمحاور التي لها درجة؛ المحاور غير المتاحة تُستبعد وتُعلن في coverage.
 */
export function compareOpeningAware({ models = [], selectedIndex = 0 } = {}) {
  const rows = models.map((model, index) => ({ index, strategy: model?.strategy || `alt-${index}`, ...assessOpenings(model) }));
  // محور حمل الأبواب نسبي: 100 لأقل حمل بين البدائل و0 لأعلاها؛ يُترك بلا درجة إن تساوت أو وُجد بديل واحد فقط.
  const loads = rows.map(r => r.axes.corridorDoorLoad).filter(a => a && a.status === 'measured');
  if (loads.length > 1) {
    const lo = Math.min(...loads.map(a => a.value)), hi = Math.max(...loads.map(a => a.value));
    if (hi > lo) for (const a of loads) a.score = (hi - a.value) / (hi - lo) * 100;
    for (const r of rows) Object.assign(r, summarize(r.axes));
  }
  const scored = rows.filter(r => r.partialScore !== null);
  const top = scored.length ? Math.max(...scored.map(r => r.partialScore)) : null;
  const leaders = scored.filter(r => r.partialScore === top);
  const bestIndex = leaders.length === 1 ? leaders[0].index : null;
  return {
    version: OPENING_AWARE_VERSION, rows, selectedIndex, bestIndex, tied: leaders.length > 1 ? leaders.map(r => r.index) : [],
    changesAzizPick: false,
    note: 'مقارنة ثانوية من هندسة الأبواب والنوافذ المرسومة؛ لا تغيّر اختيار AZIZ ولا ترتيب البدائل، والقرار للعميل. الأطوال والمسافات من الرسم، أما وجود مبنى عند الجار وفتح الأبواب فغير متحقق منهما.',
  };
}
