// The drawing document and every way of changing it.
// The UI, the AI assistant and the importers all go through applyCommand(), so an
// edit means the same thing (and is undone the same way) wherever it came from.
// Documents are plain JSON; commands never mutate their input.
import { ROOM_TYPES, OPENING_KINDS, FIXTURES, isRoomType, WALL_DEFAULTS, LEVEL_DEFAULT_HEIGHT, isDoorKind } from './catalog.mjs';
import { dist, sub, add, mul, closestOnSegment, same, rotate, pt, len, norm, dot, NODE_TOL, pointInPolygon } from './geom.mjs';

export const SCHEMA = 'mizan-draw/1';
export class DrawError extends Error { constructor(code, message, detail) { super(message); this.name = 'DrawError'; this.code = code; this.detail = detail; } }
const fail = (code, message, detail) => { throw new DrawError(code, message, detail); };
const num = (v, name) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail('BAD_NUMBER', `قيمة غير صالحة: ${name}.`); return v; };
const point = (p, name) => { if (!p || typeof p !== 'object') fail('BAD_POINT', `نقطة غير صالحة: ${name}.`); return { x: num(p.x, name + '.x'), y: num(p.y, name + '.y') }; };
const clone = v => structuredClone(v);
const COLLECTIONS = ['walls', 'openings', 'labels', 'zones', 'fixtures', 'stairs', 'columns', 'dimensions', 'texts'];
const PREFIX = { walls: 'w', openings: 'o', labels: 'r', zones: 'z', fixtures: 'f', stairs: 's', columns: 'c', dimensions: 'd', texts: 't', levels: 'L' };
export const MAX = Object.freeze({ walls: 4000, openings: 4000, fixtures: 3000, labels: 600, coordinate: 2000, wallLength: 400, minWall: .05 });

export function createDoc(options = {}) {
  const doc = {
    schema: SCHEMA, title: options.title || 'مشروع جديد',
    levels: [{ id: 'L1', name: 'الدور الأرضي', elevation: 0, height: LEVEL_DEFAULT_HEIGHT }],
    plot: options.plot || null, north: options.north ?? 0, entry: options.entry || null,
    roof: { parapet: .9, overhang: .0 }, settings: { grid: .1, defaultThickness: WALL_DEFAULTS.thickness },
    counters: { levels: 1 },
  };
  for (const c of COLLECTIONS) doc[c] = [];
  return doc;
}

export function nextId(doc, collection) {
  const prefix = PREFIX[collection];
  doc.counters[collection] = (doc.counters[collection] || 0) + 1;
  return prefix + doc.counters[collection];
}
const find = (doc, collection, id) => doc[collection].find(x => x.id === id);
export const getById = (doc, id) => { for (const c of [...COLLECTIONS, 'levels']) { const x = (doc[c] || []).find(e => e.id === id); if (x) return { collection: c, item: x }; } return null; };
const levelOf = (doc, id) => { const l = doc.levels.find(x => x.id === id); if (!l) fail('NO_LEVEL', 'الدور غير موجود.'); return l; };
const wallLength = w => dist(w.a, w.b);
const limit = (p, name = 'الإحداثية') => { if (Math.abs(p.x) > MAX.coordinate || Math.abs(p.y) > MAX.coordinate) fail('OUT_OF_RANGE', `${name} خارج النطاق المسموح (±${MAX.coordinate} م).`); return p; };

export const wallsOf = (doc, level) => doc.walls.filter(w => w.level === level);
export const openingsOn = (doc, wallId) => doc.openings.filter(o => o.wall === wallId);

/** Free interval for an opening centred at `at` of width w on wall w; throws when it can not fit. */
export function fitOpening(doc, wall, at, w, ignoreId = null) {
  const L = wallLength(wall), margin = .05;
  if (w > L - margin * 2 + 1e-9) fail('OPENING_TOO_WIDE', `الجدار (${L.toFixed(2)} م) أقصر من أن يتسع لفتحة بعرض ${w.toFixed(2)} م.`);
  let c = Math.max(w / 2 + margin, Math.min(L - w / 2 - margin, at));
  const others = openingsOn(doc, wall.id).filter(o => o.id !== ignoreId).sort((p, q) => p.at - q.at);
  const clash = (cc) => others.find(o => Math.abs(o.at - cc) < (o.w + w) / 2 - 1e-6);
  if (clash(c)) {
    // slide to the nearest free position
    const candidates = [];
    for (const o of others) { candidates.push(o.at - (o.w + w) / 2 - .02, o.at + (o.w + w) / 2 + .02); }
    const free = candidates.filter(cc => cc >= w / 2 + margin - 1e-9 && cc <= L - w / 2 - margin + 1e-9 && !clash(cc)).sort((p, q) => Math.abs(p - at) - Math.abs(q - at));
    if (!free.length) fail('OPENING_CLASH', 'لا يوجد موضع خالٍ لهذه الفتحة على الجدار.');
    c = free[0];
  }
  return c;
}

function newWall(doc, { level, a, b, t, h = null, kind = 'wall' }) {
  levelOf(doc, level);
  a = limit(point(a, 'a'), 'نقطة البداية'); b = limit(point(b, 'b'), 'نقطة النهاية');
  const length = dist(a, b);
  if (length < MAX.minWall) fail('WALL_TOO_SHORT', 'الجدار أقصر من 5 سم.');
  if (length > MAX.wallLength) fail('WALL_TOO_LONG', `الجدار أطول من ${MAX.wallLength} م.`);
  if (doc.walls.length >= MAX.walls) fail('TOO_MANY', 'تجاوز عدد الجدران الحد المسموح.');
  const thickness = t ?? doc.settings.defaultThickness;
  if (!(thickness >= .05 && thickness <= 1)) fail('BAD_THICKNESS', 'سماكة الجدار بين 5 و100 سم.');
  if (h !== null && !(h >= .3 && h <= 12)) fail('BAD_HEIGHT', 'ارتفاع الجدار بين 0.3 و12 م.');
  const wall = { id: nextId(doc, 'walls'), level, a: pt(a), b: pt(b), t: thickness, h, kind };
  doc.walls.push(wall);
  return wall;
}

/** Does an existing wall already cover segment ab (collinear and containing it)? */
function covered(doc, level, a, b) {
  return doc.walls.some(w => w.level === level && closestOnSegment(a, w.a, w.b).dist <= NODE_TOL && closestOnSegment(b, w.a, w.b).dist <= NODE_TOL
    && Math.abs((w.b.x - w.a.x) * (b.y - a.y) - (w.b.y - w.a.y) * (b.x - a.x)) < 1e-6 * Math.max(1, wallLength(w) * dist(a, b)));
}

function moveWallEnds(doc, wall, patch) {
  const old = { a: { ...wall.a }, b: { ...wall.b } };
  if (patch.a) wall.a = pt(limit(point(patch.a, 'a')));
  if (patch.b) wall.b = pt(limit(point(patch.b, 'b')));
  if (wallLength(wall) < MAX.minWall) fail('WALL_TOO_SHORT', 'الجدار أقصر من 5 سم.');
  // openings keep their distance from the A end; when the wall got shorter they are pushed inside or reported
  const L = wallLength(wall), dropped = [];
  for (const o of openingsOn(doc, wall.id)) {
    if (o.at + o.w / 2 > L - .02) { const want = L - o.w / 2 - .05; if (want < o.w / 2 + .05 - 1e-9) dropped.push(o.id); else o.at = want; }
  }
  return { old, dropped };
}

const PATCH_FIELDS = {
  walls: ['a', 'b', 't', 'h', 'kind', 'level', 'finish'],
  openings: ['at', 'w', 'h', 'sill', 'kind', 'swing', 'hinge', 'entry'],
  labels: ['name', 'type', 'seed', 'level', 'program'],
  zones: ['name', 'type', 'polygon', 'level'],
  fixtures: ['kind', 'x', 'y', 'rot', 'w', 'd', 'h', 'level', 'color'],
  stairs: ['kind', 'x', 'y', 'rot', 'w', 'run', 'level', 'flip', 'steps'],
  columns: ['x', 'y', 'size', 'round', 'level'],
  dimensions: ['a', 'b', 'offset', 'level', 'text'],
  texts: ['at', 'text', 'size', 'rot', 'level'],
  levels: ['name', 'height', 'elevation'],
};

function rebuildLevelElevations(doc) { let z = 0; for (const l of doc.levels) { l.elevation = z; z += l.height; } }

const HEX = /^#[0-9a-fA-F]{6}$/;
export const FINISH_ENUMS = Object.freeze({ base: ['render', 'stone', 'paint'], accent: ['entry', 'all', 'none'], floor: ['marble', 'tile', 'wood', 'wet', 'concrete'] });
/** Validated merge of the façade / material choices (colours are #rrggbb, everything else from a closed list). */
export function mergeFinish(cur, patch) {
  const out = structuredClone(cur || {});
  const color = (v, name) => { if (!HEX.test(v)) fail('BAD_COLOR', `لون غير صالح: ${name}.`); return v.toLowerCase(); };
  if (patch.facade) {
    const f = patch.facade, o = (out.facade = { ...(out.facade || {}) });
    if (f.base !== undefined) o.base = FINISH_ENUMS.base.includes(f.base) ? f.base : fail('BAD_FINISH', 'نوع الواجهة غير معروف.');
    if (f.accent !== undefined) o.accent = FINISH_ENUMS.accent.includes(f.accent) ? f.accent : fail('BAD_FINISH', 'نوع الكسوة غير معروف.');
    if (f.plinth !== undefined) o.plinth = !!f.plinth;
    for (const k of ['color', 'accentColor', 'plinthColor', 'copingColor']) if (f[k] !== undefined) o[k] = f[k] === null ? undefined : color(f[k], k);
  }
  for (const k of ['aluminium', 'entryDoor', 'fence', 'roof']) if (patch[k] !== undefined) out[k] = patch[k] === null ? undefined : color(patch[k], k);
  if (patch.floors) { out.floors = { ...(out.floors || {}) }; for (const [t, v] of Object.entries(patch.floors)) { if (!isRoomType(t)) fail('BAD_TYPE', 'نوع الغرفة غير معروف.'); if (v === null) delete out.floors[t]; else out.floors[t] = FINISH_ENUMS.floor.includes(v) ? v : fail('BAD_FINISH', 'نوع الأرضية غير معروف.'); } }
  return JSON.parse(JSON.stringify(out));
}

const HANDLERS = {
  'add-wall'(doc, c) { const w = newWall(doc, c); return { ids: [w.id] }; },
  'add-walls'(doc, c) {
    const pts = (c.points || []).map((p, i) => point(p, 'points[' + i + ']'));
    if (pts.length < 2) fail('TOO_FEW_POINTS', 'يلزم نقطتان على الأقل.');
    const ids = [], n = c.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (dist(a, b) < MAX.minWall) continue;
      if (covered(doc, c.level, a, b)) continue;
      ids.push(newWall(doc, { level: c.level, a, b, t: c.t, h: c.h, kind: c.kind }).id);
    }
    return { ids };
  },
  'add-rect'(doc, c) {
    const a = point(c.a, 'a'), b = point(c.b, 'b');
    if (Math.abs(a.x - b.x) < MAX.minWall || Math.abs(a.y - b.y) < MAX.minWall) fail('RECT_FLAT', 'المستطيل أصغر من اللازم.');
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    return HANDLERS['add-walls'](doc, { level: c.level, points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true, t: c.t, h: c.h });
  },
  'add-opening'(doc, c) {
    const wall = find(doc, 'walls', c.wall); if (!wall) fail('NO_WALL', 'الجدار غير موجود.');
    const kind = OPENING_KINDS[c.kind] ? c.kind : fail('BAD_KIND', 'نوع الفتحة غير معروف.');
    const def = OPENING_KINDS[kind];
    const w = c.w ?? def.w, h = c.h ?? def.h, sill = c.sill ?? def.sill;
    if (!(w >= def.min * .5 && w <= 8)) fail('BAD_WIDTH', 'عرض الفتحة غير صالح.');
    const maxH = (wall.h ?? levelOf(doc, wall.level).height);
    if (!(h > 0 && sill >= 0 && sill + h <= maxH + 1e-9)) fail('BAD_HEIGHT', `ارتفاع الفتحة مع الحافة يتجاوز ارتفاع الجدار (${maxH.toFixed(2)} م).`);
    if (doc.openings.length >= MAX.openings) fail('TOO_MANY', 'تجاوز عدد الفتحات الحد المسموح.');
    const at = fitOpening(doc, wall, num(c.at ?? wallLength(wall) / 2, 'at'), w);
    const o = { id: nextId(doc, 'openings'), level: wall.level, wall: wall.id, kind, at: Math.round(at * 1000) / 1000, w, h, sill, swing: c.swing || (isDoorKind(kind) ? 'in' : null), hinge: c.hinge || 'left', entry: !!c.entry };
    doc.openings.push(o); return { ids: [o.id] };
  },
  'add-label'(doc, c) {
    levelOf(doc, c.level);
    const roomType = c.roomType || 'other';
    if (!isRoomType(roomType)) fail('BAD_TYPE', 'نوع الغرفة غير معروف.');
    if (doc.labels.length >= MAX.labels) fail('TOO_MANY', 'تجاوز عدد التسميات الحد المسموح.');
    const l = { id: nextId(doc, 'labels'), level: c.level, name: String(c.name || ROOM_TYPES[roomType].ar).slice(0, 60), type: roomType, seed: limit(point(c.seed, 'seed')) };
    doc.labels.push(l); return { ids: [l.id] };
  },
  'add-zone'(doc, c) {
    levelOf(doc, c.level);
    const polygon = (c.polygon || []).map((p, i) => limit(point(p, 'polygon[' + i + ']')));
    if (polygon.length < 3) fail('TOO_FEW_POINTS', 'المنطقة تحتاج 3 نقاط على الأقل.');
    const z = { id: nextId(doc, 'zones'), level: c.level, name: String(c.name || 'منطقة').slice(0, 60), type: isRoomType(c.roomType) ? c.roomType : 'other', polygon: polygon.map(pt) };
    doc.zones.push(z); return { ids: [z.id] };
  },
  'add-fixture'(doc, c) {
    levelOf(doc, c.level);
    const def = FIXTURES[c.kind]; if (!def) fail('BAD_KIND', 'نوع القطعة غير معروف.');
    if (doc.fixtures.length >= MAX.fixtures) fail('TOO_MANY', 'تجاوز عدد القطع الحد المسموح.');
    const f = { id: nextId(doc, 'fixtures'), level: c.level, kind: c.kind, x: limit(point(c, 'fixture')).x, y: c.y, rot: c.rot || 0, w: c.w ?? def.w, d: c.d ?? def.d, h: c.h ?? def.h };
    doc.fixtures.push(f); return { ids: [f.id] };
  },
  'add-stair'(doc, c) {
    levelOf(doc, c.level);
    const s = { id: nextId(doc, 'stairs'), level: c.level, kind: c.kind || 'straight', x: limit(point(c, 'stair')).x, y: c.y, rot: c.rot || 0, w: c.w ?? 1.1, run: c.run ?? 3.2, flip: !!c.flip };
    doc.stairs.push(s); return { ids: [s.id] };
  },
  'add-column'(doc, c) {
    levelOf(doc, c.level);
    const k = { id: nextId(doc, 'columns'), level: c.level, x: limit(point(c, 'column')).x, y: c.y, size: c.size ?? .3, round: !!c.round };
    doc.columns.push(k); return { ids: [k.id] };
  },
  'add-dimension'(doc, c) {
    levelOf(doc, c.level);
    const a = limit(point(c.a, 'a')), b = limit(point(c.b, 'b'));
    if (dist(a, b) < .01) fail('DIM_FLAT', 'نقطتا القياس متطابقتان.');
    const d = { id: nextId(doc, 'dimensions'), level: c.level, a: pt(a), b: pt(b), offset: c.offset ?? .6 };
    doc.dimensions.push(d); return { ids: [d.id] };
  },
  'add-text'(doc, c) {
    levelOf(doc, c.level);
    const t = { id: nextId(doc, 'texts'), level: c.level, at: limit(point(c.at, 'at')), text: String(c.text || '').slice(0, 200), size: c.size ?? .25, rot: c.rot || 0 };
    if (!t.text.trim()) fail('EMPTY_TEXT', 'النص فارغ.');
    doc.texts.push(t); return { ids: [t.id] };
  },
  update(doc, c) {
    const hit = getById(doc, c.id); if (!hit) fail('NOT_FOUND', 'العنصر غير موجود.');
    const { collection, item } = hit, allowed = PATCH_FIELDS[collection] || [], patch = c.patch || {};
    for (const k of Object.keys(patch)) if (!allowed.includes(k)) fail('FIELD_LOCKED', `الحقل «${k}» غير قابل للتعديل.`);
    if (collection === 'labels' && patch.type && !isRoomType(patch.type)) fail('BAD_TYPE', 'نوع الغرفة غير معروف.');
    if (collection === 'walls') {
      if (patch.t !== undefined && !(patch.t >= .05 && patch.t <= 1)) fail('BAD_THICKNESS', 'سماكة الجدار بين 5 و100 سم.');
      const { a, b, ...rest } = patch; Object.assign(item, rest);
      if (a || b) { const r = moveWallEnds(doc, item, { a, b }); if (r.dropped.length) doc.openings = doc.openings.filter(o => !r.dropped.includes(o.id)); }
      return { ids: [item.id] };
    }
    if (collection === 'openings') {
      const wall = find(doc, 'walls', item.wall), w = patch.w ?? item.w;
      if (patch.kind && !OPENING_KINDS[patch.kind]) fail('BAD_KIND', 'نوع الفتحة غير معروف.');
      Object.assign(item, patch);
      if (patch.at !== undefined || patch.w !== undefined) item.at = Math.round(fitOpening(doc, wall, item.at, w, item.id) * 1000) / 1000;
      return { ids: [item.id] };
    }
    if (collection === 'levels') {
      Object.assign(item, patch);
      if (!(item.height >= 2 && item.height <= 8)) fail('BAD_HEIGHT', 'ارتفاع الدور بين 2 و8 م.');
      rebuildLevelElevations(doc); return { ids: [item.id] };
    }
    Object.assign(item, patch); return { ids: [item.id] };
  },
  'move-node'(doc, c) {
    const from = point(c.from, 'from'), to = limit(point(c.to, 'to'));
    const touched = [];
    for (const w of wallsOf(doc, c.level)) {
      for (const end of ['a', 'b']) if (same(w[end], from)) { const patch = { [end]: to }; touched.push([w, patch]); }
    }
    if (!touched.length) fail('NO_NODE', 'لا توجد نقطة التقاء هنا.');
    const dropped = [];
    for (const [w, patch] of touched) { const r = moveWallEnds(doc, w, patch); dropped.push(...r.dropped); }
    if (dropped.length) doc.openings = doc.openings.filter(o => !dropped.includes(o.id));
    return { ids: touched.map(([w]) => w.id), dropped };
  },
  translate(doc, c) {
    const d = { x: num(c.dx, 'dx'), y: num(c.dy, 'dy') };
    const ids = new Set(c.ids || []); if (!ids.size) fail('NO_IDS', 'لم يُحدد أي عنصر.');
    const move = p => pt(limit({ x: p.x + d.x, y: p.y + d.y }));
    const joints = c.keepJoints !== false;
    const selected = doc.walls.filter(w => ids.has(w.id));
    if (joints) {
      // non-selected walls whose end touches a moved end follow it (stretch), like dragging a room
      const targets = [];
      for (const s of selected) for (const end of ['a', 'b']) {
        for (const w of wallsOf(doc, s.level)) {
          if (ids.has(w.id)) continue;
          for (const e of ['a', 'b']) if (same(w[e], s[end])) targets.push([w, e, move(s[end])]);
        }
      }
      for (const [w, e, to] of targets) w[e] = to;
    }
    for (const w of selected) { w.a = move(w.a); w.b = move(w.b); }
    for (const coll of ['fixtures', 'stairs', 'columns']) for (const it of doc[coll]) if (ids.has(it.id)) { const p = move(it); it.x = p.x; it.y = p.y; }
    for (const it of doc.labels) if (ids.has(it.id)) it.seed = move(it.seed);
    for (const it of doc.texts) if (ids.has(it.id)) it.at = move(it.at);
    for (const it of doc.dimensions) if (ids.has(it.id)) { it.a = move(it.a); it.b = move(it.b); }
    for (const it of doc.zones) if (ids.has(it.id)) it.polygon = it.polygon.map(move);
    // a wall whose ends moved: clamp its openings
    for (const w of doc.walls) { const L = wallLength(w); for (const o of openingsOn(doc, w.id)) if (o.at + o.w / 2 > L) o.at = Math.max(o.w / 2, L - o.w / 2); }
    return { ids: [...ids] };
  },
  rotate(doc, c) {
    const angle = num(c.angle, 'angle'), about = point(c.about, 'about'), ids = new Set(c.ids || []);
    const turn = p => pt(limit(rotate(p, angle, about)));
    for (const w of doc.walls) if (ids.has(w.id)) { w.a = turn(w.a); w.b = turn(w.b); }
    for (const coll of ['fixtures', 'stairs']) for (const it of doc[coll]) if (ids.has(it.id)) { const p = turn(it); it.x = p.x; it.y = p.y; it.rot = (it.rot || 0) + angle; }
    for (const it of doc.columns) if (ids.has(it.id)) { const p = turn(it); it.x = p.x; it.y = p.y; }
    for (const it of doc.labels) if (ids.has(it.id)) it.seed = turn(it.seed);
    for (const it of doc.texts) if (ids.has(it.id)) { it.at = turn(it.at); it.rot = (it.rot || 0) + angle; }
    return { ids: [...ids] };
  },
  duplicate(doc, c) {
    const ids = new Set(c.ids || []), d = { x: num(c.dx ?? 1, 'dx'), y: num(c.dy ?? 1, 'dy') }, map = new Map(), created = [];
    const move = p => pt(limit({ x: p.x + d.x, y: p.y + d.y }));
    for (const w of [...doc.walls]) if (ids.has(w.id)) {
      const copy = { ...clone(w), id: nextId(doc, 'walls'), a: move(w.a), b: move(w.b) }; doc.walls.push(copy); map.set(w.id, copy.id); created.push(copy.id);
    }
    for (const o of [...doc.openings]) if (map.has(o.wall)) { const copy = { ...clone(o), id: nextId(doc, 'openings'), wall: map.get(o.wall) }; doc.openings.push(copy); created.push(copy.id); }
    for (const coll of ['fixtures', 'stairs', 'columns']) for (const it of [...doc[coll]]) if (ids.has(it.id)) { const p = move(it); const copy = { ...clone(it), id: nextId(doc, coll), x: p.x, y: p.y }; doc[coll].push(copy); created.push(copy.id); }
    for (const it of [...doc.labels]) if (ids.has(it.id)) { const copy = { ...clone(it), id: nextId(doc, 'labels'), seed: move(it.seed) }; doc.labels.push(copy); created.push(copy.id); }
    for (const it of [...doc.texts]) if (ids.has(it.id)) { const copy = { ...clone(it), id: nextId(doc, 'texts'), at: move(it.at) }; doc.texts.push(copy); created.push(copy.id); }
    return { ids: created };
  },
  'split-wall'(doc, c) {
    const w = find(doc, 'walls', c.id); if (!w) fail('NO_WALL', 'الجدار غير موجود.');
    const p = closestOnSegment(point(c.at, 'at'), w.a, w.b);
    const along = p.t * wallLength(w);
    if (along < MAX.minWall || wallLength(w) - along < MAX.minWall) fail('SPLIT_END', 'نقطة التقسيم قريبة جدًا من طرف الجدار.');
    const second = { ...clone(w), id: nextId(doc, 'walls'), a: pt(p.point), b: { ...w.b } };
    for (const o of openingsOn(doc, w.id)) if (o.at > along) { o.wall = second.id; o.at = Math.round((o.at - along) * 1000) / 1000; }
    w.b = pt(p.point); doc.walls.push(second);
    return { ids: [w.id, second.id] };
  },
  'close-gap'(doc, c) {
    const from = point(c.from, 'from'), to = limit(point(c.to, 'to'));
    for (const w of wallsOf(doc, c.level)) for (const e of ['a', 'b']) if (same(w[e], from)) { const old = w[e]; w[e] = pt(to); if (wallLength(w) < MAX.minWall) { w[e] = old; fail('WALL_TOO_SHORT', 'الإغلاق يجعل الجدار أقصر من اللازم.'); } return { ids: [w.id] }; }
    fail('NO_NODE', 'لا توجد نهاية حرة هنا.');
  },
  'flip-opening'(doc, c) {
    const o = find(doc, 'openings', c.id); if (!o) fail('NOT_FOUND', 'الفتحة غير موجودة.');
    if (c.what === 'hinge') o.hinge = o.hinge === 'left' ? 'right' : 'left'; else o.swing = o.swing === 'in' ? 'out' : 'in';
    return { ids: [o.id] };
  },
  delete(doc, c) {
    const ids = new Set(c.ids || []); if (!ids.size) fail('NO_IDS', 'لم يُحدد أي عنصر.');
    const before = doc.walls.length + doc.openings.length;
    for (const coll of COLLECTIONS) doc[coll] = doc[coll].filter(x => !ids.has(x.id));
    const wallIds = new Set(doc.walls.map(w => w.id));
    doc.openings = doc.openings.filter(o => wallIds.has(o.wall));
    return { ids: [...ids], removed: before - doc.walls.length - doc.openings.length };
  },
  'add-level'(doc, c) {
    const id = nextId(doc, 'levels');
    doc.levels.push({ id, name: String(c.name || 'الدور ' + (doc.levels.length + 1)).slice(0, 40), elevation: 0, height: c.height ?? LEVEL_DEFAULT_HEIGHT });
    rebuildLevelElevations(doc);
    if (c.copyFrom) HANDLERS['copy-level'](doc, { from: c.copyFrom, to: id });
    return { ids: [id] };
  },
  'copy-level'(doc, c) {
    levelOf(doc, c.from); levelOf(doc, c.to);
    const map = new Map();
    for (const w of wallsOf(doc, c.from)) { const copy = { ...clone(w), id: nextId(doc, 'walls'), level: c.to }; doc.walls.push(copy); map.set(w.id, copy.id); }
    for (const o of [...doc.openings]) if (map.has(o.wall)) doc.openings.push({ ...clone(o), id: nextId(doc, 'openings'), wall: map.get(o.wall), level: c.to });
    return { ids: [...map.values()] };
  },
  'set-plot'(doc, c) {
    if (c.polygon !== undefined) { doc.plot = c.polygon ? { polygon: c.polygon.map((p, i) => limit(point(p, 'plot[' + i + ']'))).map(pt), setbacks: c.setbacks || doc.plot?.setbacks || null } : null; }
    else if (doc.plot && c.setbacks) doc.plot.setbacks = c.setbacks;
    if (c.north !== undefined) doc.north = ((num(c.north, 'north') % 360) + 360) % 360;
    if (c.entry !== undefined) doc.entry = c.entry;
    return { ids: [] };
  },
  'set-meta'(doc, c) {
    if (c.title !== undefined) doc.title = String(c.title).slice(0, 120);
    if (c.roof) doc.roof = { ...doc.roof, ...c.roof };
    if (c.settings) doc.settings = { ...doc.settings, ...c.settings };
    if (c.finish) doc.finish = mergeFinish(doc.finish, c.finish);
    return { ids: [] };
  },
  batch(doc, c) {
    const ids = [];
    for (const sub of c.commands || []) { const r = HANDLERS[sub.type]; if (!r) fail('BAD_COMMAND', 'أمر غير معروف: ' + sub.type); ids.push(...(r(doc, sub).ids || [])); }
    return { ids };
  },
};
export const COMMAND_TYPES = Object.freeze(Object.keys(HANDLERS));

/** Apply one command to a copy of `doc`. Throws DrawError and leaves `doc` untouched on failure. */
export function applyCommand(doc, command) {
  const handler = HANDLERS[command?.type];
  if (!handler) fail('BAD_COMMAND', 'أمر غير معروف: ' + command?.type);
  const next = clone(doc);
  const result = handler(next, command) || {};
  return { doc: next, ids: result.ids || [], ...result };
}

/** Structural validation; returns issues, never throws. */
export function validateDoc(doc) {
  const issues = [], seen = new Set();
  const add = (severity, code, id, message) => issues.push({ severity, code, id, message });
  if (doc?.schema !== SCHEMA) add('error', 'SCHEMA', null, 'مخطط ملف غير معروف.');
  const levels = new Set((doc?.levels || []).map(l => l.id));
  for (const c of COLLECTIONS) for (const it of doc?.[c] || []) {
    if (seen.has(it.id)) add('error', 'DUP_ID', it.id, 'معرّف مكرر: ' + it.id); seen.add(it.id);
    if (it.level && !levels.has(it.level)) add('error', 'NO_LEVEL', it.id, 'عنصر في دور غير موجود.');
  }
  const walls = new Map((doc?.walls || []).map(w => [w.id, w]));
  for (const w of walls.values()) {
    if (![w.a?.x, w.a?.y, w.b?.x, w.b?.y].every(Number.isFinite)) add('error', 'BAD_WALL', w.id, 'إحداثيات جدار غير صالحة.');
    else if (wallLength(w) < MAX.minWall) add('error', 'ZERO_WALL', w.id, 'جدار شبه معدوم الطول.');
  }
  for (const o of doc?.openings || []) {
    const w = walls.get(o.wall);
    if (!w) { add('error', 'ORPHAN_OPENING', o.id, 'فتحة بلا جدار.'); continue; }
    if (!OPENING_KINDS[o.kind]) add('error', 'BAD_KIND', o.id, 'نوع فتحة غير معروف.');
    const L = wallLength(w);
    if (o.at - o.w / 2 < -1e-6 || o.at + o.w / 2 > L + 1e-6) add('warning', 'OPENING_OUTSIDE', o.id, 'فتحة تتجاوز طول جدارها.');
  }
  for (const w of walls.values()) {
    const list = (doc.openings || []).filter(o => o.wall === w.id).sort((p, q) => p.at - q.at);
    for (let i = 1; i < list.length; i++) if (list[i].at - list[i - 1].at < (list[i].w + list[i - 1].w) / 2 - 1e-6) add('warning', 'OPENING_OVERLAP', list[i].id, 'فتحتان متداخلتان.');
  }
  return issues;
}

/** Undo/redo history of whole documents (they are small); `key` merges rapid edits such as a drag. */
export function createHistory(initial, { limit: max = 200 } = {}) {
  let past = [], future = [], present = initial, lastKey = null, lastAt = 0;
  return {
    get doc() { return present; },
    get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
    get depth() { return past.length; },
    commit(next, label = '', { key = null, now = Date.now() } = {}) {
      if (next === present) return present;
      const merge = key && key === lastKey && now - lastAt < 1500 && past.length;
      if (!merge) { past.push({ doc: present, label }); if (past.length > max) past.shift(); }
      present = next; future = []; lastKey = key; lastAt = now; return present;
    },
    undo() { if (!past.length) return present; future.push({ doc: present }); present = past.pop().doc; lastKey = null; return present; },
    redo() { if (!future.length) return present; past.push({ doc: present }); present = future.pop().doc; lastKey = null; return present; },
    reset(doc) { past = []; future = []; present = doc; lastKey = null; },
    labels() { return past.map(p => p.label); },
  };
}

export const serialize = doc => JSON.stringify(doc);
export function parseDoc(text) {
  let raw; try { raw = typeof text === 'string' ? JSON.parse(text) : text; } catch { fail('BAD_JSON', 'الملف ليس JSON صالحًا.'); }
  if (raw?.schema !== SCHEMA) fail('BAD_SCHEMA', 'هذا الملف ليس مشروع رسم من الميزان.');
  const doc = { ...createDoc(), ...raw };
  for (const c of COLLECTIONS) if (!Array.isArray(doc[c])) doc[c] = [];
  if (!Array.isArray(doc.levels) || !doc.levels.length) fail('BAD_SCHEMA', 'الملف بلا أدوار.');
  doc.counters = doc.counters || {};
  for (const c of [...COLLECTIONS, 'levels']) for (const it of doc[c]) { const n = parseInt(String(it.id).slice(1), 10); if (Number.isFinite(n)) doc.counters[c] = Math.max(doc.counters[c] || 0, n); }
  const errors = validateDoc(doc).filter(i => i.severity === 'error');
  if (errors.length) fail('INVALID_DOC', 'الملف يحتوي أخطاء: ' + errors.slice(0, 3).map(e => e.message).join('، '), errors);
  return doc;
}

export default { SCHEMA, DrawError, MAX, createDoc, applyCommand, validateDoc, createHistory, parseDoc, serialize, fitOpening, wallsOf, openingsOn, getById, nextId, COMMAND_TYPES };
