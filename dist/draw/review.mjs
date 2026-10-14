// "AI understands the drawing", part 2: deterministic design review + room-type suggestions.
//
// Every message is a *design guideline from the app's catalog* (dist/draw/catalog.mjs), never a legal or
// building-code requirement. Where the catalog has no number (window-to-floor ratio, step sizes, the
// clearance of an opening from a wall end) the value lives in GUIDELINES below, is marked "إرشادي"
// (indicative) in the message and can be overridden per call with options.thresholds.
//
// DOOR SWING CONVENTION (used by SWING_BLOCKED and by the local assistant's fixture placement):
//   wall a->b, u = unit(a->b), n = perp(u) = (-u.y, u.x) is the LEFT side of the wall direction.
//   swing 'in'  : the leaf opens towards the LEFT  side (+n). For walls drawn counter-clockwise around a
//                 room (how the sample/shell walls are drawn) the left side is the room interior.
//   swing 'out' : the leaf opens towards the RIGHT side (-n).
//   hinge 'left': hinge at the end of the opening nearest to a (smaller `at`); 'right': nearest to b.
//   The open leaf stands perpendicular to the wall; the swept area is the quarter disc of radius w
//   (door2: two leaves of radius w/2 hinged at both ends). Sliders, arches and garage doors do not swing.
// FIXTURE FOOTPRINT: a rectangle w x d centred on (x, y), rotated counter-clockwise by `rot` (radians).
import { ROOM_TYPES, FIXTURES, WALL_DEFAULTS, OPENING_KINDS, roomTypeName, fixtureName } from './catalog.mjs';
import { applyCommand, DrawError } from './doc.mjs';
import { analyzeDoc, digestDoc, compassOf, SIDE_AR, isWindowKind } from './digest.mjs';
import { exteriorWallIds } from './topology.mjs';
import { sub, add, mul, norm, perp, dot, cross, dist, rotate, pointInPolygon, closestOnSegment, segmentIntersection } from './geom.mjs';

/** Values the catalog does not define. All are indicative design guidance (إرشادي), not regulations. */
export const GUIDELINES = Object.freeze({
  windowToFloor: 0.1,       // glazed area / floor area for rooms whose catalog type has windowRequired
  openingEndClearance: 0.1, // m, free wall between an opening and the end of its wall
  riser: [0.15, 0.19],      // m, a typical step rise range (indicative)
  tread: [0.25, 0.30],      // m, a typical step run range (indicative)
  fixtureOverlap: 0.03,     // m of interpenetration tolerated before two fixtures count as overlapping
});

export const GUIDE_NOTE = ' (إرشاد تصميمي من كتالوج التطبيق وليس اشتراطًا نظاميًا)';
export const RULES = Object.freeze({
  GAP: { severity: 'error', integrity: true }, STUB: { severity: 'info', integrity: true },
  UNLABELLED_ROOM: { severity: 'warning', integrity: true }, ORPHAN_LABEL: { severity: 'warning', integrity: true }, DUPLICATE_LABEL: { severity: 'warning', integrity: true },
  NO_ENTRY: { severity: 'warning' }, ENTRY_UNFLAGGED: { severity: 'info' }, UNREACHABLE_ROOM: { severity: 'warning' },
  NO_WINDOW: { severity: 'warning' }, WINDOW_RATIO: { severity: 'info' }, MIN_AREA: { severity: 'warning' }, MIN_WIDTH: { severity: 'warning' },
  CORRIDOR_NARROW: { severity: 'warning' }, BATH_PRIVACY: { severity: 'warning' }, BEDROOM_FROM_ENTRY: { severity: 'info' },
  SWING_BLOCKED: { severity: 'warning' }, FIXTURE_OVERLAP: { severity: 'warning' }, FIXTURE_OUTSIDE: { severity: 'warning' },
  STAIR_NARROW: { severity: 'warning' }, STAIR_STEPS: { severity: 'info' }, EXTERIOR_THIN: { severity: 'info' }, OPENING_NEAR_END: { severity: 'info' },
});

const n1 = v => String(Math.round(v * 10) / 10), n2 = v => String(Math.round(v * 100) / 100);
const rot2 = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

// ---------------------------------------------------------------- geometry helpers (exported for the assistant)
/** Corners of a wall as a rectangle (centre-line a-b, thickness t). */
export function wallRect(w, shrink = 0) {
  const u = norm(sub(w.b, w.a)), h = Math.max(0.005, w.t / 2 - shrink), n = mul(perp(u), h);
  return [add(w.a, n), add(w.b, n), sub(w.b, n), sub(w.a, n)];
}
/** Footprint polygon of a fixture (see header). */
export function fixtureRect(f, grow = 0) {
  const hw = f.w / 2 + grow, hd = f.d / 2 + grow;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => { const r = rot2({ x, y }, f.rot || 0); return { x: f.x + r.x, y: f.y + r.y }; });
}
/** Separating-axis test; returns the smallest penetration depth (> 0 overlapping) or <= 0 when apart. */
export function penetration(A, B) {
  let min = Infinity;
  for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
    const e = sub(poly[(i + 1) % poly.length], poly[i]), ax = norm({ x: -e.y, y: e.x });
    const pa = A.map(p => dot(p, ax)), pb = B.map(p => dot(p, ax));
    const depth = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (depth <= 0) return depth;
    min = Math.min(min, depth);
  }
  return min;
}
const inPoly = (p, poly) => pointInPolygon(p, poly, 1e-9);

/** Swept leaf areas of a door as sectors: [{ hinge, closed (unit dir), side (unit dir), r }]. Empty for non-swinging kinds. */
export function swingSectors(op) {
  const { o, wall: w } = op;
  if (o.kind !== 'door' && o.kind !== 'door2') return [];
  const u = norm(sub(w.b, w.a)), n = perp(u), side = o.swing === 'out' ? mul(n, -1) : n;
  const p0 = add(w.a, mul(u, o.at - o.w / 2)), p1 = add(w.a, mul(u, o.at + o.w / 2));
  if (o.kind === 'door2') return [{ hinge: p0, closed: u, side, r: o.w / 2 }, { hinge: p1, closed: mul(u, -1), side, r: o.w / 2 }];
  return o.hinge === 'right' ? [{ hinge: p1, closed: mul(u, -1), side, r: o.w }] : [{ hinge: p0, closed: u, side, r: o.w }];
}
/** Sample points inside the swept sector (kept away from the wall line and the corners; see comments in code). */
export function sectorPoints(sec) {
  const pts = [];
  for (const k of [0.3, 0.5, 0.7, 0.85]) for (const deg of [20, 45, 70]) {
    const a = deg * Math.PI / 180;
    pts.push(add(sec.hinge, add(mul(sec.closed, Math.cos(a) * sec.r * k), mul(sec.side, Math.sin(a) * sec.r * k))));
  }
  return pts;
}
/** What blocks the swing of door `op`? -> [{ kind:'wall'|'fixture'|'door'|'column', id }] */
export function swingBlockers(model, lv, op, overrides = {}) {
  const doc = model.doc;
  const o = { ...op.o, ...overrides };
  const me = { ...op, o };
  const secs = swingSectors(me);
  if (!secs.length) return [];
  const pts = secs.flatMap(sectorPoints), found = new Map();
  const hit = (kind, id) => found.set(kind + id, { kind, id });
  for (const w of lv.walls) {
    if (w.id === op.wall.id) continue;
    const rect = wallRect(w, 0.03);
    if (pts.some(p => inPoly(p, rect))) hit('wall', w.id);
  }
  for (const f of doc.fixtures) {
    if (f.level !== lv.level.id || f.h < 0.1 || f.kind === 'rug') continue;
    const rect = fixtureRect(f, -0.02);
    if (pts.some(p => inPoly(p, rect))) hit('fixture', f.id);
  }
  for (const c of doc.columns || []) {
    if (c.level !== lv.level.id) continue;
    const s = c.size / 2;
    if (pts.some(p => Math.abs(p.x - c.x) <= s && Math.abs(p.y - c.y) <= s)) hit('column', c.id);
  }
  for (const other of lv.openings) {
    if (other.id === op.id) continue;
    for (const sec of swingSectors(other)) {
      const theirs = sectorPoints(sec);
      const covers = (s, p) => { const d = sub(p, s.hinge), a = dot(d, s.closed), b = dot(d, s.side); return a >= -1e-9 && b >= -1e-9 && Math.hypot(a, b) <= s.r + 1e-9; };
      if (secs.some(s => theirs.some(p => covers(s, p))) || pts.some(p => covers(sec, p))) hit('door', other.id);
    }
  }
  return [...found.values()];
}

// ---------------------------------------------------------------- suggestions
const FIX_SETS = {
  bath: ['wc', 'shower', 'bathtub', 'basin'], kitchen: ['kitchen-run', 'stove', 'fridge'],
};
const bedIn = f => (f['bed-double'] || 0) + (f['bed-single'] || 0);
/**
 * Ranked room-type candidates for a room of the digest (never certain; confidence <= 0.9).
 * room: a digest room entry. context: { digest?, doc? } (digest is used for neighbours / entry distance).
 */
export function suggestRoomType(room, context = {}) {
  const f = room.fixtures || {}, score = {}, why = {};
  const add_ = (type, s, reason) => { score[type] = Math.min(0.9, (score[type] || 0) + s); (why[type] ||= []).push(reason); };
  const area = room.area || 0, w = room.size?.[0] || 0, l = room.size?.[1] || 0;
  const wet = FIX_SETS.bath.filter(k => f[k]);
  if (f.wc || f.shower || f.bathtub) add_('bath', 0.8, 'فيها ' + wet.map(fixtureName).join(' و'));
  else if (f.basin) add_('bath', 0.45, 'فيها مغسلة');
  if (f['washing-machine'] && !wet.length && !f['kitchen-run']) add_('laundry', 0.7, 'فيها غسالة');
  const k = FIX_SETS.kitchen.filter(x => f[x]);
  if (k.length) add_('kitchen', 0.75 + 0.05 * (k.length - 1), 'فيها ' + k.map(fixtureName).join(' و'));
  if (bedIn(f)) {
    if (f['bed-double'] && area >= 14) { add_('master', 0.6, 'فيها سرير مزدوج ومساحتها كبيرة نسبيًا'); add_('bedroom', 0.5, 'فيها سرير'); }
    else add_('bedroom', 0.8, 'فيها ' + (f['bed-double'] ? 'سرير مزدوج' : 'سرير مفرد'));
  }
  if (f['majlis-sofa']) add_('majlis', 0.8, 'فيها جلسة عربية');
  const lounge = (f['sofa-3'] || 0) + (f['sofa-2'] || 0) + (f.armchair || 0) + (f['tv-unit'] || 0) + (f['coffee-table'] || 0);
  if (lounge && !f['majlis-sofa'] && !bedIn(f)) { add_('living', 0.55, 'فيها كنب ووحدة جلوس'); if (area >= 16) add_('majlis', 0.3, 'مساحة تصلح للضيافة'); }
  if (f['dining-table'] && !k.length) add_('dining', 0.7, 'فيها طاولة طعام');
  if (f.desk && !bedIn(f)) add_('office', 0.6, 'فيها مكتب عمل');
  if (f.car) add_('garage', 0.9, 'فيها سيارة');
  if (room.stairs?.length) add_('stairs', area <= 14 ? 0.85 : 0.5, 'يقع فيها درج');
  const toOutside = (room.doors || []).some(d => d.connects === 'outside' && d.kind !== 'window');
  if (toOutside) add_('entrance', area <= 14 ? 0.7 : 0.4, 'فيها باب يؤدي إلى الخارج');
  const ratio = w > 0 ? l / w : 0;
  if (ratio >= 2.5 && w <= 1.8 && !Object.keys(f).length) add_('corridor', 0.7, 'شكلها طويل وضيق');
  if (!Object.keys(f).length && !toOutside && !room.stairs?.length) {
    if (area < 3.5) add_('storage', 0.45, 'مساحتها صغيرة وبلا تجهيزات');
    else if (area <= 6.5 && !(room.windows?.count)) add_('storage', 0.35, 'صغيرة وبلا نافذة');
    if (area >= 8 && area < 16 && (room.windows?.count || 0) > 0) add_('bedroom', 0.3, 'مساحة ونافذة تناسبان غرفة نوم');
    if (area >= 16) { add_('majlis', 0.3, 'مساحة كبيرة'); add_('living', 0.3, 'مساحة كبيرة'); }
  }
  // neighbours (needs the digest): a room next to an entrance that is big enough for guests, etc.
  const rooms = (context.digest?.levels || []).flatMap(lv => lv.rooms);
  const near = (room.neighbours || []).map(id => rooms.find(r => r.id === id)).filter(Boolean);
  if (near.some(r => r.type === 'bath') && !wet.length && area >= 9) add_('bedroom', 0.1, 'مجاورة لدورة مياه');
  if (near.some(r => r.type === 'entrance') && area >= 16) add_('majlis', 0.15, 'مجاورة للمدخل ومساحتها تصلح للضيافة');
  const list = Object.entries(score).filter(([, s]) => s >= 0.15).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([type, s]) => ({ type, confidence: Math.round(s * 100) / 100, reason: `${why[type].join('؛ ')} — اقتراح تقريبي وليس تأكيدًا` }));
  return list.length ? list : [{ type: 'other', confidence: 0.1, reason: 'لا توجد قرائن كافية (تجهيزات أو مساحة أو فتحات) لاقتراح نوع؛ اختر النوع بنفسك' }];
}

// ---------------------------------------------------------------- review
function verified(doc, fix) {
  if (!fix) return null;
  try { let d = doc; for (const c of fix.commands) d = applyCommand(d, c).doc; return fix; } catch (e) { if (e instanceof DrawError) return null; throw e; }
}
const longest = list => list.reduce((m, e) => (!m || e.length > m.length ? e : m), null);
const posOnWall = (wall, p) => dot(sub(p, wall.a), norm(sub(wall.b, wall.a)));

/**
 * Review a drawing. options: { digest?, model?, rules?: {CODE:false}, only?: [CODE], thresholds?: {...GUIDELINES} }
 * Returns Issue[] = { id, severity, code, message (Arabic), targetIds[], fix: null | { label, commands[] } }, most severe first.
 */
export function reviewDoc(doc, options = {}) {
  const model = options.model || analyzeDoc(doc);
  const digest = options.digest || digestDoc(doc, { model });
  const G = { ...GUIDELINES, ...(options.thresholds || {}) };
  const on = code => (options.only ? options.only.includes(code) : options.rules?.[code] !== false);
  const issues = [];
  const push = (code, message, targetIds, fix = null, severity = RULES[code].severity) => {
    if (!on(code)) return;
    const base = `${code}:${targetIds.join('+')}`;
    let id = base, i = 2; while (issues.some(x => x.id === id)) id = base + '#' + i++;
    issues.push({ id, severity, code, message: message + (RULES[code].integrity ? '' : GUIDE_NOTE), targetIds, fix: verified(doc, fix) });
  };
  const digestRoom = id => digest.levels.flatMap(l => l.rooms).find(r => r.id === id);
  const typeName = r => roomTypeName(r.type);

  for (const lv of model.levels) {
    const a = lv.analysis, L = lv.level.id;
    // --- drawing integrity
    for (const g of a.gaps) {
      push('GAP', `ثغرة في الجدران في ${lv.level.name} بمقدار ${n2(g.dist * 100)} سم تمنع إغلاق الغرفة.`, g.wallId ? [g.wallId] : [], { label: 'سدّ الثغرة', commands: [{ type: 'close-gap', level: L, from: g.at, to: g.point }] });
    }
    for (const e of a.stubs) {
      const ids = e.wallIds;
      const removable = ids.filter(id => a.edges.filter(x => x.wallIds.includes(id)).every(x => a.stubs.includes(x)));
      push('STUB', `جدار معلّق لا يُغلق غرفة في ${lv.level.name} (${ids.join('، ')}).`, ids, removable.length === ids.length ? { label: 'حذف الجدار المعلّق', commands: [{ type: 'delete', ids: removable }] } : null);
    }
    for (const r of lv.rooms) if (r.unlabelled) {
      const dr = digestRoom(r.id), cand = suggestRoomType(dr, { digest })[0];
      const fix = cand.type !== 'other' ? { label: `تسمية الغرفة «${roomTypeName(cand.type)}» (اقتراح تقريبي)`, commands: [{ type: 'add-label', level: L, name: roomTypeName(cand.type), roomType: cand.type, seed: r.inside }] } : null;
      push('UNLABELLED_ROOM', `غرفة مساحتها ${n1(r.area)} م² بلا تسمية في ${lv.level.name}. ${cand.type !== 'other' ? `الأقرب: ${roomTypeName(cand.type)} (${cand.reason}).` : cand.reason + '.'}`, [r.id], fix);
    }
    for (const l of lv.orphanLabels) push('ORPHAN_LABEL', `التسمية «${l.name}» تقع خارج أي غرفة مغلقة؛ حرّكها داخل غرفة أو احذفها.`, [l.id], { label: 'حذف التسمية اليتيمة', commands: [{ type: 'delete', ids: [l.id] }] });
    for (const d of lv.duplicates) push('DUPLICATE_LABEL', `في الغرفة «${lv.roomsById.get(d.roomId).name}» أكثر من تسمية (${d.labelIds.join('، ')}).`, d.labelIds, { label: 'حذف التسميات الزائدة', commands: [{ type: 'delete', ids: d.labelIds.slice(1) }] });

    // --- circulation
    if (lv.levelIndex === 0 && lv.rooms.length && !lv.entries.length) push('NO_ENTRY', 'لا يوجد باب يؤدي من غرفة إلى الخارج؛ أضف باب مدخل.', []);
    if (lv.entries.length && !lv.entries.some(e => e.flagged)) {
      const first = lv.entries[0];
      push('ENTRY_UNFLAGGED', 'يوجد باب للخارج لكن لم يُحدَّد أيّ باب كباب المدخل الرئيسي.', [first.via], { label: 'تحديده كباب المدخل', commands: [{ type: 'update', id: first.via, patch: { entry: true } }] });
    }
    if (lv.seedKind) for (const r of lv.rooms) if (!lv.reach.has(r.id)) push('UNREACHABLE_ROOM', `«${r.name}» لا يمكن الوصول إليها عبر الأبواب من ${lv.seedKind === 'entry' ? 'المدخل' : 'الدرج'}؛ لا يوجد باب أو فتحة تربطها بباقي الغرف.`, [r.id]);

    // --- rooms
    for (const r of lv.rooms) {
      const def = ROOM_TYPES[r.type], dr = digestRoom(r.id);
      if (r.unlabelled || r.type === 'other') continue;
      if (def.windowRequired && dr.windows.count === 0) {
        const edge = longest(r.edges.filter(e => e.exterior));
        let fix = null;
        if (edge) {
          const wall = doc.walls.find(w => w.id === edge.wallIds[0]);
          if (wall) fix = { label: `إضافة نافذة في الجدار ${SIDE_AR[edge.side]}`, commands: [{ type: 'add-opening', wall: wall.id, kind: 'window', at: Math.round(posOnWall(wall, mul(add(edge.a, edge.b), 0.5)) * 1000) / 1000 }] };
        }
        push('NO_WINDOW', `«${r.name}» (${typeName(r)}) بلا نافذة على الخارج، والكتالوج يعدّ هذا النوع من الغرف مأهولًا ويحتاج نافذة.`, [r.id], fix);
      } else if (def.windowRequired && dr.windows.ratioToFloor < G.windowToFloor) {
        push('WINDOW_RATIO', `مساحة زجاج «${r.name}» ${n2(dr.windows.ratioToFloor * 100)}٪ من مساحة أرضيتها، أقل من النسبة الإرشادية ${n2(G.windowToFloor * 100)}٪ (نسبة إرشادية من تقدير التطبيق وليست من الكتالوج).`, [r.id]);
      }
      if (def.minArea && r.area < def.minArea - 1e-6) push('MIN_AREA', `مساحة «${r.name}» ${n1(r.area)} م² أقل من الحد الإرشادي في الكتالوج لنوع «${typeName(r)}» (${def.minArea} م²).`, [r.id]);
      const width = r.shape === 'rectangle' ? r.rect.w : r.eqWidth;
      if (r.type === 'corridor') {
        if (width < def.minWidth - 1e-6) push('CORRIDOR_NARROW', `عرض الممر «${r.name}» نحو ${n2(width)} م أقل من الحد الإرشادي في الكتالوج (${def.minWidth} م).`, [r.id]);
      } else if (def.minWidth && width < def.minWidth - 1e-6) {
        push('MIN_WIDTH', `عرض «${r.name}» ${r.shape === 'rectangle' ? '' : 'التقريبي '}${n2(width)} م أقل من الحد الإرشادي في الكتالوج لنوع «${typeName(r)}» (${def.minWidth} م).`, [r.id]);
      }
    }

    // --- bathroom privacy and sight lines
    const PUBLIC = ['majlis', 'living', 'kitchen', 'dining'];
    for (const op of lv.openings) {
      if (!op.door || !op.left || !op.right) continue;
      const pair = [op.left, op.right], bath = pair.find(r => r.type === 'bath'), other = pair.find(r => r !== bath);
      if (bath && other && PUBLIC.includes(other.type)) push('BATH_PRIVACY', `باب «${bath.name}» يفتح مباشرة على ${roomTypeName(other.type)} («${other.name}») وهذا يُضعف الخصوصية.`, [op.id, bath.id, other.id]);
    }
    for (const entry of lv.openings.filter(op => op.door && ((op.left && !op.right) || (!op.left && op.right)) && op.o.entry)) {
      const inner = entry.left || entry.right, dir = entry.left ? entry.n : mul(entry.n, -1); // from the outdoors into the room
      const far = add(entry.p, mul(dir, 40));
      const hits = [];
      for (const w of lv.walls) {
        if (w.id === entry.wall.id) continue;
        const h = segmentIntersection(entry.p, far, w.a, w.b);
        if (h && h.t * 40 > 0.05) hits.push({ w, t: h.t * 40, at: h.u * dist(w.a, w.b), point: h.point });
      }
      hits.sort((p, q) => p.t - q.t);
      for (const h of hits) {
        const door = lv.openings.find(op => op.wall.id === h.w.id && op.door && Math.abs(op.o.at - h.at) <= op.w / 2);
        if (!door) break;
        const beyond = lv.roomAt(add(h.point, mul(dir, h.w.t / 2 + 0.15)));
        if (door.kind === 'door' || door.kind === 'door2') {
          if (beyond && (beyond.type === 'bedroom' || beyond.type === 'master') && beyond.id !== inner.id) push('BEDROOM_FROM_ENTRY', `باب «${beyond.name}» يقع على امتداد باب المدخل مباشرة فيراه الداخل من الباب.`, [door.id, entry.id, beyond.id]);
          break;
        }
        // arches and sliders are see-through: keep looking
      }
    }

    // --- door swings
    const seenPairs = new Set();
    for (const op of lv.openings) {
      const blockers = swingBlockers(model, lv, op);
      if (!blockers.length) continue;
      const fresh = blockers.filter(b => !(b.kind === 'door' && seenPairs.has([b.id, op.id].sort().join())));
      blockers.filter(b => b.kind === 'door').forEach(b => seenPairs.add([b.id, op.id].sort().join()));
      if (!fresh.length) continue;
      let fix = null;
      for (const ov of [{ swing: op.o.swing === 'out' ? 'in' : 'out' }, { hinge: op.o.hinge === 'right' ? 'left' : 'right' }, { swing: op.o.swing === 'out' ? 'in' : 'out', hinge: op.o.hinge === 'right' ? 'left' : 'right' }]) {
        if (!swingBlockers(model, lv, op, ov).length) {
          const cmds = [];
          if (ov.swing) cmds.push({ type: 'flip-opening', id: op.id, what: 'swing' });
          if (ov.hinge) cmds.push({ type: 'flip-opening', id: op.id, what: 'hinge' });
          fix = { label: ov.swing && ov.hinge ? 'عكس اتجاه الفتح والمفصلة' : ov.swing ? 'عكس اتجاه فتح الباب' : 'عكس جهة المفصلة', commands: cmds };
          break;
        }
      }
      const names = fresh.map(b => b.kind === 'wall' ? `جدار ${b.id}` : b.kind === 'fixture' ? `قطعة ${fixtureName(doc.fixtures.find(f => f.id === b.id)?.kind)} (${b.id})` : b.kind === 'door' ? `باب آخر (${b.id})` : `عمود ${b.id}`);
      push('SWING_BLOCKED', `مسار فتح الباب ${op.id} تعترضه ${names.join('، ')}.`, [op.id, ...fresh.map(b => b.id)], fix);
    }

    // --- fixtures
    const fx = doc.fixtures.filter(f => f.level === L);
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      if (!['car', 'tree', 'plant'].includes(f.kind) && !lv.roomAt({ x: f.x, y: f.y })) push('FIXTURE_OUTSIDE', `القطعة ${fixtureName(f.kind)} (${f.id}) تقع خارج أي غرفة.`, [f.id]);
      if (f.h < 0.1) continue;
      for (let j = i + 1; j < fx.length; j++) {
        const g = fx[j]; if (g.h < 0.1) continue;
        if (penetration(fixtureRect(f), fixtureRect(g)) > G.fixtureOverlap) push('FIXTURE_OVERLAP', `القطعتان ${fixtureName(f.kind)} (${f.id}) و${fixtureName(g.kind)} (${g.id}) متداخلتان.`, [f.id, g.id]);
      }
    }

    // --- stairs
    for (const s of doc.stairs.filter(x => x.level === L)) {
      const minW = ROOM_TYPES.stairs.minWidth;
      if (s.w < minW - 1e-6) push('STAIR_NARROW', `عرض الدرج ${s.id} ${n2(s.w)} م أقل من الحد الإرشادي في الكتالوج (${minW} م).`, [s.id], { label: `توسيع الدرج إلى ${minW} م`, commands: [{ type: 'update', id: s.id, patch: { w: minW } }] });
      if ((s.kind || 'straight') === 'straight') {
        const H = lv.level.height, [r0, r1] = G.riser, [t0, t1] = G.tread;
        const counts = s.steps ? [s.steps] : Array.from({ length: Math.max(0, Math.floor(H / r0) - Math.ceil(H / r1) + 1) }, (_, i) => Math.ceil(H / r1) + i);
        const ok = counts.some(n => { const tread = s.run / (n - 1); return n > 1 && tread >= t0 - 1e-9 && tread <= t1 + 1e-9; });
        if (!ok && counts.length) {
          const tooShort = counts.every(n => s.run / (n - 1) < t0);
          push('STAIR_STEPS', `طول الدرج ${s.id} (${n2(s.run)} م) مع ارتفاع الدور ${n2(H)} م ${tooShort ? 'قصير' : 'طويل'} بالنسبة إلى المدى المعتاد للخطوة (قائمة ${n2(r0 * 100)}–${n2(r1 * 100)} سم وموطئ ${n2(t0 * 100)}–${n2(t1 * 100)} سم) وهي أرقام إرشادية من تقدير التطبيق.`, [s.id]);
        }
      }
    }

    // --- walls
    const exterior = exteriorWallIds(a);
    const interior = lv.walls.filter(w => !exterior.has(w.id));
    if (interior.length) {
      const maxInt = Math.max(...interior.map(w => w.t));
      for (const w of lv.walls.filter(x => exterior.has(x.id) && x.t < maxInt - 1e-6)) {
        const target = Math.min(1, Math.max(maxInt, WALL_DEFAULTS.exterior));
        push('EXTERIOR_THIN', `الجدار الخارجي ${w.id} (${n2(w.t * 100)} سم) أرفع من أسمك جدار داخلي (${n2(maxInt * 100)} سم).`, [w.id], { label: `رفع سماكته إلى ${n2(target * 100)} سم`, commands: [{ type: 'update', id: w.id, patch: { t: target } }] });
      }
    }
    for (const op of lv.openings) {
      const Lw = dist(op.wall.a, op.wall.b), start = op.o.at - op.w / 2, end = Lw - op.o.at - op.w / 2;
      const c = G.openingEndClearance;
      if (Math.min(start, end) < c - 1e-6) {
        const newAt = start < end ? Math.min(Lw - op.w / 2 - c, op.w / 2 + c) : Math.max(op.w / 2 + c, Lw - op.w / 2 - c);
        push('OPENING_NEAR_END', `${OPENING_KINDS[op.kind]?.ar || 'فتحة'} ${op.id} قريبة جدًا (${n2(Math.max(0, Math.min(start, end)) * 100)} سم) من طرف جدارها؛ المسافة الإرشادية ${n2(c * 100)} سم.`, [op.id], Lw - op.w >= 2 * c ? { label: 'تحريكها بعيدًا عن الطرف', commands: [{ type: 'update', id: op.id, patch: { at: Math.round(newAt * 1000) / 1000 } }] } : null);
      }
    }
  }
  const order = { error: 0, warning: 1, info: 2 };
  return issues.sort((p, q) => order[p.severity] - order[q.severity]);
}

/** One-line Arabic rendering of a list of issues (used by the local assistant). */
export function summarizeIssuesAr(issues, max = 6) {
  if (!issues.length) return 'لم أجد ملاحظات في الفحص الآلي. هذا لا يغني عن مراجعة مهندس.';
  const sev = { error: 'خطأ', warning: 'تنبيه', info: 'ملاحظة' };
  const head = `وجدت ${issues.length} ملاحظة${issues.length > max ? ` وهذه أهمها` : ''}.`;
  return head + ' ' + issues.slice(0, max).map((i, k) => `${k + 1}) ${sev[i.severity]}: ${i.message.replace(GUIDE_NOTE, '')}`).join(' ');
}

export default { GUIDELINES, RULES, reviewDoc, suggestRoomType, summarizeIssuesAr, swingSectors, swingBlockers, wallRect, fixtureRect, penetration };
