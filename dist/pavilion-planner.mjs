// Isolated composition over the unchanged native rectangular planner.
// Real exterior gaps separate the requested position bands; a covered corridor links them.
import { generateModelLegacy } from './claude/compat-layer.mjs';
import { validateModel, quantities, GEOMETRY } from './claude/planner.mjs';

export const PAVILION_COMPOSER_VERSION = '1.0.0';
const E = 1e-5, GAP = 2, X = GEOMETRY.exterior, T = GEOMETRY.partition;
const near = (a, b) => Math.abs(a - b) < E;
const rectMap = (r, point) => {
  const a = point(r.x, r.y), b = point(r.x + r.w, r.y + r.h);
  return { ...r, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
};

export function pavilionTopology(model) {
  const toLocal = p => model.plot.entry === 's' ? p : model.plot.entry === 'n' ? { x: -p.x, y: -p.y }
    : model.plot.entry === 'e' ? { x: p.y, y: -p.x } : { x: -p.y, y: p.x };
  const ring = model.buildingFootprint.map(toLocal), levels = [...new Set(ring.map(p => p.y))].sort((a, b) => a - b);
  const slices = levels.slice(0, -1).map((bottom, i) => {
    const top = levels[i + 1], y = (bottom + top) / 2, xs = [];
    ring.forEach((a, k) => { const b = ring[(k + 1) % ring.length]; if ((a.y > y) !== (b.y > y)) xs.push(a.x); });
    xs.sort((a, b) => a - b);
    return { depth: top - bottom, width: xs.length === 2 ? xs[1] - xs[0] : null };
  });
  const full = Math.max(...slices.map(s => s.width || 0)), ribbon = GEOMETRY.corridor + 2 * X;
  const valid = [3, 5].includes(slices.length) && slices.every((s, i) => i % 2
    ? s.width !== null && near(s.width, ribbon) && s.depth >= 1.5 - E
    : s.width !== null && near(s.width, full) && full > ribbon + 1.5 && s.depth > 0);
  return { errors: valid ? [] : ['هندسة الأجنحة لا تحتوي كتلًا منفصلة بفواصل خارجية ورواق رابط.'],
    pavilionCount: valid ? (slices.length + 1) / 2 : null, exteriorGapDepthsM: slices.filter((_, i) => i % 2).map(s => s.depth), connectorWidthM: valid ? ribbon : null };
}

export function generatePavilionModel(plot, rooms) {
  const base = generateModelLegacy(plot, rooms, { strategy: 'compact', allowFallback: false });
  const f = base.footprint, sideways = ['e', 'w'].includes(plot.entry);
  const fromWorld = (x, y) => plot.entry === 's' ? { x: x - f.x, y: y - f.y }
    : plot.entry === 'n' ? { x: f.x + f.w - x, y: f.y + f.h - y }
    : plot.entry === 'e' ? { x: y - f.y, y: f.x + f.w - x }
    : { x: f.y + f.h - y, y: x - f.x };
  const localBox = rectMap(base.building, fromWorld);
  const local = (x, y) => { const p = fromWorld(x, y); return { x: p.x - localBox.x, y: p.y - localBox.y }; };
  const localRooms = base.rooms.map(r => rectMap(r, local));
  const localCorridors = base.corridors.map(r => rectMap(r, local));
  const spine = localCorridors.find(r => r.id === 'spine');
  if (!spine) throw Error('PAVILION_SPINE_MISSING');
  const bands = ['front', 'middle', 'back'].map(position => {
    const spaces = localRooms.filter(r => r.position === position);
    const branchIds = new Set(spaces.map(r => r.corridorId).filter(id => id !== spine.id));
    const occupied = [...spaces, ...localCorridors.filter(c => branchIds.has(c.id))];
    return { position, spaces, start: Math.min(...occupied.map(r => r.y)), end: Math.max(...occupied.map(r => r.y + r.h)) };
  }).filter(b => b.spaces.length).sort((a, b) => a.start - b.start);
  if (bands.length < 2) throw Error('الأجنحة تحتاج منطقتين على الأقل في الجدول: أمام أو وسط أو خلف.');
  const cuts = bands.slice(1).map(b => b.start - T / 2);
  if (bands.some((b, i) => i < cuts.length && b.end > cuts[i] + E)) throw Error('PAVILION_BANDS_OVERLAP');
  const offset = y => GAP * cuts.filter(c => y > c + E).length;
  const width = localBox.w, height = localBox.h + GAP * cuts.length;
  const availableWidth = sideways ? f.h : f.w, availableDepth = sideways ? f.w : f.h;
  if (width > availableWidth + E || height > availableDepth + E) {
    throw Error(`لم يجد المولّد توزيع الأجنحة ضمن العمق المتاح ${availableDepth.toFixed(2)} م؛ التوزيع الحالي يحتاج ${height.toFixed(2)} م بعد فصل الكتل، دون تقليص الغرف.`);
  }
  const pad = X - T / 2;
  const blocks = bands.map((b, i) => ({
    x: 0, y: i ? cuts[i - 1] + GAP * i - pad : 0, w: width,
    h: (i < cuts.length ? cuts[i] + GAP * i + pad : height) - (i ? cuts[i - 1] + GAP * i - pad : 0),
    name: `جناح ${b.position === 'front' ? 'الأمام' : b.position === 'middle' ? 'الوسط' : 'الخلف'}`,
  }));
  const ribbonLeft = spine.x - X, ribbonRight = spine.x + spine.w + X;
  const connectors = blocks.slice(0, -1).map((b, i) => ({
    x: ribbonLeft, y: b.y + b.h, w: ribbonRight - ribbonLeft,
    h: blocks[i + 1].y - (b.y + b.h), name: 'رواق رابط مسقوف',
  }));
  if (connectors.some(r => r.h < 1.5)) throw Error('PAVILION_GAP_TOO_SMALL');
  const ring = [{ x: 0, y: 0 }, { x: width, y: 0 }];
  blocks.forEach((b, i) => {
    ring.push({ x: width, y: b.y + b.h });
    if (i < blocks.length - 1) ring.push({ x: ribbonRight, y: b.y + b.h }, { x: ribbonRight, y: blocks[i + 1].y }, { x: width, y: blocks[i + 1].y });
  });
  ring.push({ x: 0, y: height });
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]; ring.push({ x: 0, y: b.y });
    if (i) ring.push({ x: ribbonLeft, y: b.y }, { x: ribbonLeft, y: blocks[i - 1].y + blocks[i - 1].h }, { x: 0, y: blocks[i - 1].y + blocks[i - 1].h });
  }
  ring.pop(); // The implicit closing edge ends at the first vertex.
  const normals = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length], length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  });
  const inset = ring.map((p, i) => ({
    x: p.x + (normals[i].x + normals[(i + ring.length - 1) % ring.length].x) * X / 2,
    y: p.y + (normals[i].y + normals[(i + ring.length - 1) % ring.length].y) * X / 2,
  }));
  const walls = inset.map((a, i) => {
    const b = inset[(i + 1) % inset.length];
    return { id: `pavilion-exterior-${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: 'ext', t: X, h: GEOMETRY.height };
  });
  const fragments = new Map();
  for (const wall of base.walls.filter(w => w.type === 'int')) {
    const a = local(wall.x1, wall.y1), b = local(wall.x2, wall.y2);
    if (near(a.y, b.y) && cuts.some(c => near(c, a.y))) continue;
    const levels = near(a.x, b.x) ? [...new Set([a.y, b.y, ...cuts.filter(c => c > Math.min(a.y, b.y) + E && c < Math.max(a.y, b.y) - E)])].sort((x, y) => x - y) : null;
    const pieces = levels ? levels.slice(0, -1).map((y, i) => ({ a: { x: a.x, y }, b: { x: a.x, y: levels[i + 1] } })) : [{ a, b }];
    fragments.set(wall.id, pieces.map((piece, i) => {
      const dy = offset((piece.a.y + piece.b.y) / 2);
      const result = { ...wall, id: `${wall.id}-pavilion-${i}`, x1: piece.a.x, y1: piece.a.y + dy, x2: piece.b.x, y2: piece.b.y + dy };
      walls.push(result); return result;
    }));
  }
  const openings = base.openings.map(opening => {
    const old = base.walls.find(w => w.id === opening.wallId);
    const point = local(old.x1 + (old.x2 - old.x1) * opening.pos, old.y1 + (old.y2 - old.y1) * opening.pos);
    point.y += offset(point.y);
    const candidates = old.type === 'ext' ? walls.filter(w => w.type === 'ext') : fragments.get(old.id) || [];
    const wall = candidates.find(w => near(w.x1, w.x2)
      ? near(point.x, w.x1) && point.y - opening.w / 2 >= Math.min(w.y1, w.y2) - E && point.y + opening.w / 2 <= Math.max(w.y1, w.y2) + E
      : near(point.y, w.y1) && point.x - opening.w / 2 >= Math.min(w.x1, w.x2) - E && point.x + opening.w / 2 <= Math.max(w.x1, w.x2) + E);
    if (!wall) throw Error(`PAVILION_OPENING_WALL_MISSING:${opening.id}`);
    return { ...opening, wallId: wall.id, pos: Math.hypot(point.x - wall.x1, point.y - wall.y1) / Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) };
  });
  const originX = (availableWidth - width) / 2, originY = (availableDepth - height) / 2;
  const world = (x, y) => {
    x += originX; y += originY;
    return plot.entry === 's' ? { x: f.x + x, y: f.y + y }
      : plot.entry === 'n' ? { x: f.x + f.w - x, y: f.y + f.h - y }
      : plot.entry === 'e' ? { x: f.x + f.w - y, y: f.y + x }
      : { x: f.x + y, y: f.y + f.h - x };
  };
  const movedRect = r => rectMap({ ...r, y: r.y + offset(r.y + r.h / 2) }, world);
  const spineRect = { ...spine, h: spine.h + GAP * cuts.length };
  const building = rectMap({ x: 0, y: 0, w: width, h: height }, world);
  const model = {
    ...base, shape: 'pavilions', requestedShape: 'pavilions', actualShape: 'pavilions', shapeFallback: false,
    plot: { ...base.plot, shape: 'pavilions' }, building, boundingBox: { ...building },
    buildingFootprint: ring.map(p => world(p.x, p.y)),
    rooms: localRooms.map(movedRect),
    corridors: localCorridors.map(c => c.id === spine.id ? rectMap(spineRect, world) : movedRect(c)),
    reserves: base.reserves.map(r => movedRect(rectMap(r, local))),
    walls: walls.map(w => { const a = world(w.x1, w.y1), b = world(w.x2, w.y2); return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }),
    openings, massingParts: [...blocks, ...connectors].map(r => rectMap(r, world)),
    strategy: 'pavilions', fallback: { allowed: false, applied: false, reason: null },
    warnings: [...base.warnings, `${blocks.length} أجنحة فعلية من مناطق الجدول، تفصلها فراغات خارجية ويربطها رواق مسقوف. الرواق مشترك؛ لا يثبت فصل الضيوف عن العائلة.`],
  };
  const errors = [...validateModel(model), ...pavilionTopology(model).errors];
  if (errors.length) throw Error('PAVILION_VALIDATION_FAILED:' + errors.join(';'));
  model.builtArea = quantities(model).footprint;
  if (model.builtArea > (plot.maxBuiltAreaM2 ?? plot.maxBuiltArea ?? Infinity) + E) throw Error('الأجنحة والرواق تتجاوز سقف مساحة البناء المحدد؛ لم يتم تصغير الغرف.');
  return model;
}
