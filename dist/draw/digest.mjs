// "AI understands the drawing", part 1: a compact, JSON-serialisable description of a drawing.
//
// analyzeDoc(doc)  -> internal model (polygons, wall pieces, openings resolved to rooms). Used by the
//                     digest, the review rules and the local assistant so all three agree on what a room is.
// digestDoc(doc)   -> Digest: plain data for humans and for an LLM (small; `compact:true` is smaller still).
// describeDigestAr -> a short Arabic summary (used when the AI service is offline).
//
// Conventions (also relied on by review.mjs / assistant-local.mjs):
//  * Plan coordinates are metres, x right, y UP.
//  * COMPASS: doc.north is the true bearing (degrees, clockwise from true north) of the plan's +y axis.
//    north = 0  -> plan +y is true north, +x is east.  north = 90 -> plan +y points true east.
//    The true bearing of a plan direction v is  (atan2(v.x, v.y) in degrees + doc.north) mod 360.
//  * Wall a->b: the LEFT side is perp(u) = (-u.y, u.x) (counter-clockwise); room faces are traced
//    counter-clockwise, so a room's outward normal on edge a->b is the RIGHT side (u.y, -u.x).
//  * A room's id is the id of the label whose seed lies in it; an unlabelled room keeps its space id (S#).
import { analyzeWalls } from './topology.mjs';
import { ROOM_TYPES, OPENING_KINDS, isDoorKind } from './catalog.mjs';
import { area as polyArea, perimeter as polyPerimeter, centroid as polyCentroid, pointInPolygon, dist, sub, add, mul, norm, perp, cross, dot, ccw, signedArea } from './geom.mjs';

export const DIGEST_SCHEMA = 'mizan-digest/1';
export const SIDES = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export const SIDE_AR = Object.freeze({ n: 'الشمالية', ne: 'الشمالية الشرقية', e: 'الشرقية', se: 'الجنوبية الشرقية', s: 'الجنوبية', sw: 'الجنوبية الغربية', w: 'الغربية', nw: 'الشمالية الغربية' });
export const SIDE_NAME_AR = Object.freeze({ n: 'الشمال', ne: 'الشمال الشرقي', e: 'الشرق', se: 'الجنوب الشرقي', s: 'الجنوب', sw: 'الجنوب الغربي', w: 'الغرب', nw: 'الشمال الغربي' });

const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
export const isWindowKind = kind => kind === 'window' || kind === 'window2';

/** True compass side (one of SIDES) of a plan direction vector, honouring doc.north. */
export function compassOf(vec, north = 0) {
  const bearing = ((Math.atan2(vec.x, vec.y) * 180 / Math.PI + (Number(north) || 0)) % 360 + 360) % 360;
  return SIDES[Math.round(bearing / 45) % 8];
}

/** Oriented minimum bounding rectangle: { w (short side), l (long side), angle } of a polygon. */
export function minRect(poly) {
  const pts = poly.map(p => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return { w: 0, l: 0, angle: 0 };
  const half = (list) => { const h = []; for (const p of list) { while (h.length >= 2 && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p, h[h.length - 1])) <= 1e-12) h.pop(); h.push(p); } h.pop(); return h; };
  const hull = [...half(pts), ...half([...pts].reverse())];
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const u = norm(sub(hull[(i + 1) % hull.length], hull[i])), v = perp(u);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of hull) { const a = dot(p, u), b = dot(p, v); u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
    const a = u1 - u0, b = v1 - v0;
    if (!best || a * b < best.area - 1e-9) best = { area: a * b, w: Math.min(a, b), l: Math.max(a, b), angle: Math.atan2(u.y, u.x) };
  }
  return best ? { w: best.w, l: best.l, angle: best.angle } : { w: 0, l: 0, angle: 0 };
}

/** 'rectangle' | 'L' | 'irregular' for a clear room polygon (holes make it irregular). */
export function shapeOf(poly, holes = []) {
  if (holes.length) return 'irregular';
  const p = ccw(poly), ring = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    const k = cross(sub(b, a), sub(c, b)) / Math.max(1e-9, dist(a, b) * dist(b, c));
    if (Math.abs(k) > 1e-3) ring.push({ p: b, k });
  }
  const right = ring.every(({ p: b }, i) => {
    const a = ring[(i + ring.length - 1) % ring.length].p, c = ring[(i + 1) % ring.length].p;
    return Math.abs(dot(norm(sub(b, a)), norm(sub(c, b)))) < 0.02;
  });
  if (!right) return 'irregular';
  if (ring.length === 4) return 'rectangle';
  if (ring.length === 6 && ring.filter(r => r.k < 0).length === 1) return 'L';
  return 'irregular';
}

const inSpace = (space, p) => !!space.net && pointInPolygon(p, space.net, 1e-9) && !space.holes.some(h => pointInPolygon(p, h, 1e-9));

/**
 * Internal model of the whole drawing. Pure; recomputed on demand (the drawings are small).
 * level = { level, analysis, walls, rooms[], roomsById, orphanLabels[], duplicates[], openings[], graph, ... }
 */
export function analyzeDoc(doc) {
  const north = Number(doc.north) || 0;
  const levels = doc.levels.map((level, levelIndex) => {
    const walls = doc.walls.filter(w => w.level === level.id);
    const analysis = analyzeWalls(walls);
    const labels = doc.labels.filter(l => l.level === level.id);
    const rooms = [];
    const used = new Set();
    for (const space of analysis.spaces) {
      if (!space.net) continue;
      const inside = labels.filter(l => inSpace(space, l.seed));
      inside.forEach(l => used.add(l.id));
      const label = inside[0] || null;
      const type = label && ROOM_TYPES[label.type] ? label.type : 'other';
      const rect = minRect(space.net);
      const per = polyPerimeter(space.net);
      const edges = space.edges.map(e => {
        const u = norm(sub(e.b, e.a)), out = { x: u.y, y: -u.x };
        return { ...e, length: dist(e.a, e.b), out, side: compassOf(out, north), exterior: !!e.outside };
      });
      rooms.push({
        id: label ? label.id : space.id, spaceId: space.id, space, label, labelIds: inside.map(l => l.id),
        name: label ? label.name : 'مساحة غير مسمّاة', type, unlabelled: !label, levelId: level.id,
        area: space.area, rect, perimeter: per, centroid: space.centroid, inside: space.inside,
        shape: shapeOf(space.net, space.holes), edges, net: space.net,
        // an equivalent width (a rectangle with the same area and perimeter); good for bent corridors
        eqWidth: (() => { const q = per / 4, disc = q * q - space.area; return disc > 0 ? q - Math.sqrt(disc) : q; })(),
      });
    }
    const roomsById = new Map(rooms.map(r => [r.id, r]));
    const orphanLabels = labels.filter(l => !used.has(l.id));
    const duplicates = rooms.filter(r => r.labelIds.length > 1).map(r => ({ roomId: r.id, labelIds: r.labelIds }));
    const roomAt = p => { let best = null; for (const r of rooms) if (inSpace(r.space, p) && (!best || r.area < best.area)) best = r; return best; };

    // openings resolved to the rooms on both sides of their wall
    const wallsById = new Map(walls.map(w => [w.id, w]));
    const openings = [];
    for (const o of doc.openings.filter(x => x.level === level.id || wallsById.has(x.wall))) {
      const wall = wallsById.get(o.wall); if (!wall) continue;
      const u = norm(sub(wall.b, wall.a)), n = perp(u), p = add(wall.a, mul(u, o.at));
      const reach = wall.t / 2 + 0.15;
      const left = roomAt(add(p, mul(n, reach))), right = roomAt(add(p, mul(n, -reach)));
      const door = isDoorKind(o.kind), win = isWindowKind(o.kind);
      const rec = { o, id: o.id, kind: o.kind, wall, p, u, n, left, right, door, window: win, w: o.w, h: o.h, area: o.w * o.h, level: level.id };
      // a window/door opens to the outdoors when one side has no room (or is an open court)
      const sideInfo = (self, other, outwardVec) => ({ room: self, other: other ? other.id : 'outside', exterior: !other || !!ROOM_TYPES[other.type]?.open, outward: outwardVec });
      rec.sides = [];
      if (left) rec.sides.push(sideInfo(left, right, mul(n, -1)));
      if (right) rec.sides.push(sideInfo(right, left, n));
      for (const s of rec.sides) s.compass = compassOf(s.outward, north);
      openings.push(rec);
    }

    // circulation: rooms joined by door-type openings
    const graph = new Map(rooms.map(r => [r.id, []]));
    const entryRooms = [];
    for (const op of openings) {
      if (!op.door) continue;
      const a = op.left, b = op.right;
      if (a && b && a.id !== b.id) { graph.get(a.id).push({ to: b.id, via: op.id }); graph.get(b.id).push({ to: a.id, via: op.id }); }
      const inner = a && !b ? a : b && !a ? b : null;
      if (inner) entryRooms.push({ room: inner.id, via: op.id, flagged: !!op.o.entry, kind: op.kind });
    }
    // entry: doors flagged entry, else any door to the outside
    const flagged = entryRooms.filter(e => e.flagged);
    // only the ground level has "the" entrance; a door to the outdoors upstairs is a balcony/terrace door
    const entries = levelIndex > 0 ? [] : flagged.length ? flagged : entryRooms.filter(e => e.kind !== 'garage');
    const stairs = doc.stairs.filter(s => s.level === level.id).map(s => ({ ...s, room: (roomAt({ x: s.x, y: s.y }) || {}).id || null }));
    const reach = new Map(); // roomId -> { doors, path }
    const seeds = entries.map(e => ({ id: e.room, via: 'entry' }));
    let seedKind = entries.length ? 'entry' : null;
    if (!seeds.length) {
      // upper levels: reachable from the stair that leads up from the level below
      const below = levelIndex > 0 ? doc.stairs.filter(s => s.level === doc.levels[levelIndex - 1].id) : [];
      for (const s of [...stairs, ...below]) { const r = roomAt({ x: s.x, y: s.y }); if (r) seeds.push({ id: r.id, via: 'stair' }); }
      if (seeds.length) seedKind = 'stair';
    }
    const queue = [];
    for (const s of seeds) if (!reach.has(s.id)) { reach.set(s.id, { doors: 0, path: [s.id] }); queue.push(s.id); }
    while (queue.length) {
      const id = queue.shift(), cur = reach.get(id);
      for (const e of graph.get(id) || []) if (!reach.has(e.to)) { reach.set(e.to, { doors: cur.doors + 1, path: [...cur.path, e.to], via: e.via }); queue.push(e.to); }
    }
    return { level, levelIndex, walls, analysis, labels, rooms, roomsById, roomAt, orphanLabels, duplicates, openings, graph, entries, seedKind, reach, stairs };
  });
  const roomIndex = new Map();
  for (const l of levels) for (const r of l.rooms) roomIndex.set(r.id, { level: l, room: r });
  return { doc, north, levels, roomIndex, levelById: new Map(levels.map(l => [l.level.id, l])) };
}

const sideList = list => [...new Set(list)].sort((a, b) => SIDES.indexOf(a) - SIDES.indexOf(b));

function roomEntry(model, lv, room, compact) {
  const doc = model.doc;
  const wins = lv.openings.filter(op => op.window && op.sides.some(s => s.room.id === room.id && s.exterior));
  const winArea = wins.reduce((s, op) => s + op.area, 0);
  const doors = [];
  for (const op of lv.openings) {
    if (!op.door) continue;
    const mine = op.sides.find(s => s.room.id === room.id);
    if (!mine) continue;
    doors.push({ id: op.id, kind: op.kind, connects: mine.other, width: r2(op.w), ...(op.o.entry ? { entry: true } : {}) });
  }
  const sideLen = new Map(), sideWall = new Map();
  for (const e of room.edges) if (e.exterior) {
    sideLen.set(e.side, (sideLen.get(e.side) || 0) + e.length);
    if (!sideWall.has(e.side) || e.length > sideWall.get(e.side).length) sideWall.set(e.side, { length: e.length, id: e.wallIds[0] });
  }
  // `wall` is the wall carrying the longest piece of that side: what an add-opening command needs
  const exteriorWalls = [...sideLen].sort((a, b) => SIDES.indexOf(a[0]) - SIDES.indexOf(b[0])).map(([side, length]) => ({ side, ...(compact ? {} : { length: r2(length) }), wall: sideWall.get(side).id }));
  const neighbours = [...new Set(room.edges.map(e => e.space).filter(Boolean).map(sid => lv.rooms.find(r => r.spaceId === sid)?.id).filter(Boolean))];
  const fixtures = {};
  for (const f of doc.fixtures) if (f.level === lv.level.id && lv.roomAt({ x: f.x, y: f.y })?.id === room.id) fixtures[f.kind] = (fixtures[f.kind] || 0) + 1;
  const stairsIn = lv.stairs.filter(s => s.room === room.id).map(s => s.id);
  return {
    id: room.id, name: room.name, type: room.type, ...(room.unlabelled ? { unlabelled: true } : {}), levelId: lv.level.id,
    area: r2(room.area), size: [r2(room.rect.w), r2(room.rect.l)], shape: room.shape,
    ...(compact ? {} : { perimeter: r2(room.perimeter) }),
    centroid: compact ? { x: r1(room.centroid.x), y: r1(room.centroid.y) } : { x: r2(room.centroid.x), y: r2(room.centroid.y) },
    exteriorWalls,
    windows: { count: wins.length, ...(compact ? {} : { totalArea: r2(winArea) }), ratioToFloor: room.area > 0 ? r2(winArea / room.area) : 0, sides: sideList(wins.flatMap(op => op.sides.filter(s => s.room.id === room.id && s.exterior).map(s => s.compass))) },
    doors,
    ...(compact ? {} : { neighbours }),
    ...(Object.keys(fixtures).length ? { fixtures } : {}),
    ...(stairsIn.length ? { stairs: stairsIn } : {}),
  };
}

/** Digest of a drawing. Options: { compact } */
export function digestDoc(doc, { compact = false, model = null } = {}) {
  const m = model || analyzeDoc(doc);
  let exteriorLen = 0, interiorLen = 0;
  const builtArea = {}, netArea = {};
  const levels = m.levels.map(lv => {
    const a = lv.analysis;
    for (const e of a.edges) {
      if (a.stubs.includes(e)) continue;
      const len = dist(a.nodes[e.n1], a.nodes[e.n2]);
      if (a.exteriorEdges.has(e.id)) exteriorLen += len; else interiorLen += len;
    }
    builtArea[lv.level.id] = r2(a.outlines.reduce((s, o) => s + o.area, 0));
    netArea[lv.level.id] = r2(lv.rooms.reduce((s, r) => s + r.area, 0));
    const reach = {}, unreachable = [];
    for (const r of lv.rooms) {
      const hit = lv.reach.get(r.id);
      if (hit) reach[r.id] = compact ? hit.doors : { doors: hit.doors, path: hit.path };
      else if (lv.seedKind) unreachable.push(r.id);
    }
    const graph = [];
    const seen = new Set();
    for (const [id, list] of lv.graph) for (const e of list) { if (seen.has(e.via)) continue; seen.add(e.via); graph.push([id, e.to, e.via]); }
    return {
      id: lv.level.id, name: lv.level.name, height: r2(lv.level.height), elevation: r2(lv.level.elevation),
      rooms: lv.rooms.map(r => roomEntry(m, lv, r, compact)),
      stairs: lv.stairs.map(s => ({ id: s.id, kind: s.kind, w: r2(s.w), run: r2(s.run), room: s.room })),
      circulation: { entry: lv.seedKind, entryRooms: [...new Set(lv.entries.map(e => e.room))], graph: compact ? graph.map(g => g.slice(0, 2)) : graph, reach, unreachable },
    };
  });
  const groundOutline = m.levels[0] ? m.levels[0].analysis.outlines.reduce((s, o) => s + o.area, 0) : 0;
  const totals = { footprintArea: r2(groundOutline), builtArea, netRoomArea: netArea, exteriorWallLength: r2(exteriorLen), interiorWallLength: r2(interiorLen) };
  if (m.doc.plot?.polygon?.length >= 3) {
    const plotArea = polyArea(m.doc.plot.polygon);
    totals.plotArea = r2(plotArea);
    totals.coverageRatio = plotArea > 0 ? r2(groundOutline / plotArea) : 0;
  }
  const counts = {
    levels: doc.levels.length, rooms: m.levels.reduce((s, l) => s + l.rooms.length, 0), walls: doc.walls.length,
    doors: doc.openings.filter(o => isDoorKind(o.kind) && o.kind !== 'arch').length, openArches: doc.openings.filter(o => o.kind === 'arch').length,
    windows: doc.openings.filter(o => isWindowKind(o.kind)).length, fixtures: doc.fixtures.length, stairs: doc.stairs.length,
  };
  const drawingState = {
    gaps: m.levels.flatMap(lv => lv.analysis.gaps.map(g => ({ level: lv.level.id, at: { x: r2(g.at.x), y: r2(g.at.y) }, to: { x: r2(g.point.x), y: r2(g.point.y) }, dist: r2(g.dist) }))),
    stubs: m.levels.reduce((s, lv) => s + lv.analysis.stubs.length, 0),
    unlabelledRooms: m.levels.flatMap(lv => lv.rooms.filter(r => r.unlabelled).map(r => r.id)),
    orphanLabels: m.levels.flatMap(lv => lv.orphanLabels.map(l => ({ id: l.id, name: l.name, level: lv.level.id }))),
    duplicateLabels: m.levels.flatMap(lv => lv.duplicates),
  };
  return {
    schema: DIGEST_SCHEMA, title: String(doc.title || '').slice(0, 120), north: r2(m.north), ...(compact ? { compact: true } : {}),
    ...(doc.entry ? { plotEntry: doc.entry } : {}),
    levels, totals, counts, drawingState,
  };
}

const NUM_AR = n => String(r2(n));

/** Short Arabic summary (used offline). Plain sentences, no bullets. */
export function describeDigestAr(digest) {
  const t = digest.totals || {}, c = digest.counts || {};
  const parts = [];
  const rooms = (digest.levels || []).flatMap(l => l.rooms.map(r => ({ ...r, level: l })));
  if (!rooms.length) {
    parts.push('لا توجد غرف مغلقة في المخطط بعد؛ ارسم جدرانًا مغلقة لتتكوّن الغرف.');
  } else {
    parts.push(`يضم المخطط ${NUM_AR(c.levels ?? digest.levels.length)} ${(c.levels ?? 1) > 1 ? 'أدوار' : 'دورًا'} و${NUM_AR(rooms.length)} غرفة بمساحة صافية إجمالية ${NUM_AR(Object.values(t.netRoomArea || {}).reduce((s, v) => s + v, 0))} م².`);
    if (t.footprintArea) parts.push(`مسقط الدور الأرضي ${NUM_AR(t.footprintArea)} م²${t.plotArea ? `، ونسبته إلى الأرض ${NUM_AR((t.coverageRatio || 0) * 100)}٪ من ${NUM_AR(t.plotArea)} م²` : ''}.`);
    const biggest = [...rooms].sort((a, b) => b.area - a.area)[0];
    parts.push(`أكبر غرفة هي ${biggest.name} (${NUM_AR(biggest.area)} م²، ${NUM_AR(biggest.size[0])}×${NUM_AR(biggest.size[1])} م).`);
    const no = rooms.filter(r => ROOM_TYPES[r.type]?.windowRequired && r.windows.count === 0).map(r => r.name);
    if (no.length) parts.push(`الغرف التي لا نافذة لها على الخارج: ${no.join('، ')}.`);
    const bad = [];
    for (const l of digest.levels) if (l.circulation?.unreachable?.length) bad.push(...l.circulation.unreachable.map(id => l.rooms.find(r => r.id === id)?.name || id));
    if (bad.length) parts.push(`غرف لا يصل إليها المسار من المدخل: ${bad.join('، ')}.`);
    parts.push(`عدد الأبواب ${NUM_AR(c.doors || 0)} والنوافذ ${NUM_AR(c.windows || 0)}${c.openArches ? ` والفتحات المفتوحة ${NUM_AR(c.openArches)}` : ''}.`);
  }
  const s = digest.drawingState || {};
  const issues = [];
  if (s.gaps?.length) issues.push(`${NUM_AR(s.gaps.length)} ثغرة في الجدران`);
  if (s.stubs) issues.push(`${NUM_AR(s.stubs)} جدار معلّق`);
  if (s.unlabelledRooms?.length) issues.push(`${NUM_AR(s.unlabelledRooms.length)} غرفة بلا تسمية`);
  if (s.orphanLabels?.length) issues.push(`${NUM_AR(s.orphanLabels.length)} تسمية خارج أي غرفة`);
  if (s.duplicateLabels?.length) issues.push(`${NUM_AR(s.duplicateLabels.length)} غرفة بأكثر من تسمية`);
  parts.push(issues.length ? `ملاحظات على الرسم: ${issues.join('، ')}.` : 'لا ثغرات ولا جدران معلّقة ولا تسميات ناقصة في الرسم.');
  return parts.join(' ');
}

export default { DIGEST_SCHEMA, SIDES, SIDE_AR, SIDE_NAME_AR, compassOf, minRect, shapeOf, analyzeDoc, digestDoc, describeDigestAr, isWindowKind };
