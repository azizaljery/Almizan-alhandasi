// A true staggered-wing composition built from the validated pavilion base.
// Wings remain separate footprints; open-to-sky gaps alternate with covered links.
import { generatePavilionModel } from './pavilion-planner.mjs';
import { validateModel, quantities, GEOMETRY } from './claude/planner.mjs';

export const STAGGERED_COMPOSER_VERSION = '1.0.0';
const E = 1e-5, EXT = GEOMETRY.exterior, PARTITION = GEOMETRY.partition;
const near = (a, b) => Math.abs(a - b) <= E;

function rectMap(r, point) {
  const a = point(r.x, r.y), b = point(r.x + r.w, r.y + r.h);
  return { ...r, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}
const keyPoint = p => `${p.x.toFixed(7)},${p.y.toFixed(7)}`;

function exteriorRing(rectangles) {
  const xs = [...new Set(rectangles.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rectangles.flatMap(r => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  const occupied = (i, j) => {
    const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2;
    return rectangles.some(r => x > r.x - E && x < r.x + r.w + E && y > r.y - E && y < r.y + r.h + E);
  };
  const edges = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) if (occupied(i, j)) {
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
    if (j === 0 || !occupied(i, j - 1)) edges.push([{ x: x0, y: y0 }, { x: x1, y: y0 }]);
    if (i === xs.length - 2 || !occupied(i + 1, j)) edges.push([{ x: x1, y: y0 }, { x: x1, y: y1 }]);
    if (j === ys.length - 2 || !occupied(i, j + 1)) edges.push([{ x: x1, y: y1 }, { x: x0, y: y1 }]);
    if (i === 0 || !occupied(i - 1, j)) edges.push([{ x: x0, y: y1 }, { x: x0, y: y0 }]);
  }
  const from = new Map();
  for (const edge of edges) { const k = keyPoint(edge[0]); if (!from.has(k)) from.set(k, []); from.get(k).push(edge); }
  const first = edges.shift();
  if (!first) throw Error('STAGGERED_EMPTY_FOOTPRINT');
  const ring = [first[0], first[1]], used = new Set([first]);
  while (!near(ring.at(-1).x, ring[0].x) || !near(ring.at(-1).y, ring[0].y)) {
    const choices = from.get(keyPoint(ring.at(-1))) || [];
    const next = choices.find(edge => !used.has(edge));
    if (!next) throw Error('STAGGERED_FOOTPRINT_NOT_CLOSED');
    used.add(next); ring.push(next[1]);
    if (ring.length > edges.length + 4) throw Error('STAGGERED_FOOTPRINT_LOOP');
  }
  ring.pop();
  const clean = ring.filter((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
    return !(near(a.x, p.x) && near(p.x, b.x) || near(a.y, p.y) && near(p.y, b.y));
  });
  if (clean.length < 4) throw Error('STAGGERED_FOOTPRINT_DEGENERATE');
  return clean;
}

function insetRing(ring) {
  const normals = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length], length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  });
  return ring.map((p, i) => ({
    x: p.x + (normals[i].x + normals[(i + ring.length - 1) % ring.length].x) * EXT / 2,
    y: p.y + (normals[i].y + normals[(i + ring.length - 1) % ring.length].y) * EXT / 2,
  }));
}

export function staggeredTopology(model) {
  const parts = model.massingParts || [], wings = parts.filter(p => p.component === 'wing'), links = parts.filter(p => p.component === 'link');
  const shape = model.shape === 'staggered' && wings.length === 2 && links.length === 1
    && wings.every((p, i) => i === 0 || Math.abs((p.x + p.w / 2) - (wings[i - 1].x + wings[i - 1].w / 2)) > .5)
    && links.every(p => p.h >= GEOMETRY.corridor + EXT * 2 - E);
  return { errors: shape ? [] : ['التكوين المتدرج المدعوم هو جناحان بالضبط مع وصلة عرضية مغطاة واحدة.'], wingCount: shape ? wings.length : null, linkCount: shape ? links.length : null };
}

export function generateStaggeredModel(plot, rooms) {
  const base = generatePavilionModel(plot, rooms), footprint = base.footprint, f = base.building;
  const toLocal = (x, y) => plot.entry === 's' ? { x: x - f.x, y: y - f.y }
    : plot.entry === 'n' ? { x: f.x + f.w - x, y: f.y + f.h - y }
    : plot.entry === 'e' ? { x: y - f.y, y: f.x + f.w - x }
    : { x: f.y + f.h - y, y: x - f.x };
  const box = rectMap(f, toLocal);
  const local = (x, y) => { const p = toLocal(x, y); return { x: p.x - box.x, y: p.y - box.y }; };
  const localRect = r => rectMap(r, local);
  const originalWings = base.massingParts.filter(p => p.name.startsWith('جناح ')).map(localRect).sort((a, b) => a.y - b.y);
  if (originalWings.length !== 2) throw Error(`البرنامج الحالي ينتج ${originalWings.length} أجنحة؛ التكوين المتدرج يدعم جناحين فقط. لم ندمج الأجنحة أو نحذف غرفًا؛ راجع توزيع المناطق قبل التوليد.`);
  const minGap = GEOMETRY.corridor + 2 * EXT;
  const addedGap = originalWings.length > 1 ? Math.max(0, minGap - (originalWings[1].y - (originalWings[0].y + originalWings[0].h))) : 0;
  const deltaX = originalWings.map((_, i) => i % 2 ? 0.9 : 0);
  const deltaY = originalWings.map((_, i) => i * addedGap);
  const bands = originalWings.map((w, i) => ({ ...w, x: w.x + deltaX[i], y: w.y + deltaY[i], component: 'wing', name: `جناح متدرج ${i + 1}` }));
  const gapSizes = bands.slice(0, -1).map((w, i) => bands[i + 1].y - (w.y + w.h));
  if (gapSizes.some(g => g < minGap - E)) throw Error('STAGGERED_LINK_GAP_TOO_SMALL');

  const localRooms = base.rooms.map(localRect);
  const localCorridors = base.corridors.map(localRect);
  const spine = localCorridors.find(c => c.id === 'spine');
  if (!spine) throw Error('STAGGERED_SPINE_MISSING');
  const positions = [...new Set(localRooms.map(r => r.position))];
  const bandForY = y => {
    const found = bands.find((_, i) => y >= originalWings[i].y - E && y <= originalWings[i].y + originalWings[i].h + E);
    return found ? bands.indexOf(found) : bands.reduce((best, _, i) => Math.abs(y - (originalWings[i].y + originalWings[i].h / 2)) < Math.abs(y - (originalWings[best].y + originalWings[best].h / 2)) ? i : best, 0);
  };
  const bandForPosition = position => {
    const y = localRooms.find(r => r.position === position)?.y;
    return y == null ? -1 : bandForY(y + localRooms.find(r => r.position === position).h / 2);
  };
  const roomIndex = new Map(positions.map(p => [p, bandForPosition(p)]));
  if ([...roomIndex.values()].some(i => i < 0)) throw Error('STAGGERED_ROOM_BAND_MISSING');

  const centerX = i => spine.x + spine.w / 2 + deltaX[i];
  const segmentCorridors = bands.map((b, i) => ({ id: `staggered-spine-${i + 1}`, name: 'ممر طولي للجناح',
    x: centerX(i) - spine.w / 2, y: b.y + (i ? -.4 : EXT), w: spine.w,
    h: b.y + b.h + (i < bands.length - 1 ? .4 : -EXT) - (b.y + (i ? -.4 : EXT)) }));
  const branchCorridors = localCorridors.filter(c => c.id !== spine.id).map(c => {
    const i = bandForY(c.y + c.h / 2), dy = deltaY[i], dx = deltaX[i];
    return { ...c, x: c.x + dx, y: c.y + dy, _band: i };
  });
  const bridgeCorridors = bands.slice(0, -1).map((b, i) => {
    const c1 = centerX(i), c2 = centerX(i + 1), y = b.y + b.h + (gapSizes[i] - spine.w) / 2;
    return { id: `staggered-link-${i + 1}`, name: 'ممر رابط عرضي', x: Math.min(c1, c2) - spine.w / 2, y,
      w: Math.abs(c2 - c1) + spine.w, h: spine.w };
  });
  const links = [];
  for (const c of branchCorridors) {
    const old = base.links.find(link => link.includes(c.id));
    if (!old) throw Error('STAGGERED_BRANCH_LINK_MISSING:' + c.id);
    links.push([segmentCorridors[c._band].id, c.id]);
  }
  bridgeCorridors.forEach((c, i) => { links.push([segmentCorridors[i].id, c.id], [c.id, segmentCorridors[i + 1].id]); });

  const connectorRects = bands.slice(0, -1).map((b, i) => ({
    x: Math.min(centerX(i), centerX(i + 1)) - spine.w / 2 - EXT, y: b.y + b.h,
    w: Math.abs(centerX(i + 1) - centerX(i)) + spine.w + 2 * EXT, h: gapSizes[i],
    component: 'link', name: 'رواق رابط متدرج',
  }));
  const parts = [...bands, ...connectorRects];
  const localRing = exteriorRing(parts);
  const minX = Math.min(...localRing.map(p => p.x)), maxX = Math.max(...localRing.map(p => p.x));
  const minY = Math.min(...localRing.map(p => p.y)), maxY = Math.max(...localRing.map(p => p.y));
  const sideway = ['e', 'w'].includes(plot.entry), availableWidth = sideway ? footprint.h : footprint.w, availableDepth = sideway ? footprint.w : footprint.h;
  const width = maxX - minX, height = maxY - minY;
  if (width > availableWidth + E || height > availableDepth + E) throw Error('لم يتسع التكوين المتدرج داخل المساحة المتاحة؛ لم تُصغّر الغرف.');
  const originX = (availableWidth - width) / 2 - minX, originY = (availableDepth - height) / 2 - minY;
  const worldPlaced = (x, y) => {
    return plot.entry === 's' ? { x: footprint.x + x, y: footprint.y + y }
      : plot.entry === 'n' ? { x: footprint.x + footprint.w - x, y: footprint.y + footprint.h - y }
      : plot.entry === 'e' ? { x: footprint.x + footprint.w - y, y: footprint.y + x }
      : { x: footprint.x + y, y: footprint.y + footprint.h - x };
  };
  const localToWorld = (x, y) => worldPlaced(x + originX, y + originY);
  const worldRect = r => rectMap(r, localToWorld);
  const movedRoom = r => { const i = roomIndex.get(r.position), moved = { ...r, x: r.x + deltaX[i], y: r.y + deltaY[i], corridorId: r.corridorId === spine.id ? segmentCorridors[i].id : r.corridorId }; return worldRect(moved); };
  const newRing = localRing.map(p => ({ x: p.x + originX, y: p.y + originY }));
  const insideRing = insetRing(newRing);
  const newWalls = insideRing.map((a, i) => {
    const b = insideRing[(i + 1) % insideRing.length];
    return { id: `staggered-exterior-${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: 'ext', t: EXT, h: GEOMETRY.height };
  });
  const internalMap = new Map();
  for (const wall of base.walls.filter(w => w.type === 'int')) {
    const a = local(wall.x1, wall.y1), b = local(wall.x2, wall.y2), i = bandForY((a.y + b.y) / 2);
    const moved = { ...wall, x1: a.x + deltaX[i] + originX, y1: a.y + deltaY[i] + originY,
      x2: b.x + deltaX[i] + originX, y2: b.y + deltaY[i] + originY };
    internalMap.set(wall.id, moved); newWalls.push(moved);
  }
  const findExterior = (point, width) => newWalls.filter(w => w.type === 'ext').find(w => {
    const vertical = near(w.x1, w.x2), horizontal = near(w.y1, w.y2);
    return vertical ? near(point.x, w.x1) && point.y - width / 2 >= Math.min(w.y1, w.y2) - E && point.y + width / 2 <= Math.max(w.y1, w.y2) + E
      : horizontal && near(point.y, w.y1) && point.x - width / 2 >= Math.min(w.x1, w.x2) - E && point.x + width / 2 <= Math.max(w.x1, w.x2) + E;
  });
  const newOpenings = base.openings.map(o => {
    const oldWall = base.walls.find(w => w.id === o.wallId);
    if (!oldWall) throw Error('STAGGERED_OPENING_WALL_MISSING:' + o.id);
    let wall, point;
    if (oldWall.type === 'ext') {
      point = local(oldWall.x1 + (oldWall.x2 - oldWall.x1) * o.pos, oldWall.y1 + (oldWall.y2 - oldWall.y1) * o.pos);
      const i = bandForY(point.y); point.x += deltaX[i] + originX; point.y += deltaY[i] + originY;
      wall = findExterior(point, o.w);
      if (!wall) throw Error('STAGGERED_EXTERIOR_OPENING_MISSING:' + o.id);
    } else wall = internalMap.get(oldWall.id);
    if (!wall) throw Error('STAGGERED_INTERNAL_OPENING_MISSING:' + o.id);
    let connects = o.connects;
    if (connects?.includes(spine.id)) {
      const oldPoint = local(oldWall.x1 + (oldWall.x2 - oldWall.x1) * o.pos, oldWall.y1 + (oldWall.y2 - oldWall.y1) * o.pos);
      connects = connects.map(id => id === spine.id ? segmentCorridors[bandForY(oldPoint.y)].id : id);
    }
    const pos = oldWall.type === 'ext'
      ? Math.hypot(point.x - wall.x1, point.y - wall.y1) / Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1)
      : o.pos;
    return { ...o, wallId: wall.id, pos, ...(connects ? { connects } : {}) };
  });

  const movedParts = parts.map(p => worldRect(p));
  const building = worldRect({ x: minX, y: minY, w: width, h: height });
  const corridors = [...segmentCorridors, ...branchCorridors.map(({ _band, ...c }) => c), ...bridgeCorridors].map(worldRect);
  const reserves = base.reserves.map(r => { const localReserve = localRect(r), i = bandForY(localReserve.y + localReserve.h / 2); return worldRect({ ...localReserve, x: localReserve.x + deltaX[i], y: localReserve.y + deltaY[i] }); });
  const model = { ...base, shape: 'staggered', requestedShape: 'staggered', actualShape: 'staggered', shapeFallback: false,
    architecture: { tag: 'جناحان متدرجان مرتبطان', form: 'جناحان متبادلان جانبيًا تصل بينهما وصلة عرضية', idea: 'تكوين من جناحين بفجوة خارجية ورواق رابط قابل للفحص.', bestFor: 'مقارنة توزيع المناطق على أرض أوسع', tradeoff: 'يحتاج مساحة إضافية ولا يثبت صلاحية التنفيذ', massing: 'staggered' },
    plot: { ...base.plot, shape: 'staggered' }, building, boundingBox: { ...building },
    buildingFootprint: newRing.map(p => worldPlaced(p.x, p.y)), rooms: localRooms.map(movedRoom), corridors,
    reserves, links, walls: newWalls.map(w => { const a = worldPlaced(w.x1, w.y1), b = worldPlaced(w.x2, w.y2); return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }),
    openings: newOpenings, massingParts: movedParts, strategy: 'staggered',
    fallback: { allowed: false, applied: false, reason: null },
    warnings: [...base.warnings, 'كتل الأجنحة متبادلة جانبيًا، تفصلها فجوات خارجية ويصل بينها رواق عرضي مسقوف. هذا توزيع تخطيطي أولي.'] };
  const errors = [...validateModel(model), ...staggeredTopology(model).errors];
  if (errors.length) throw Error('STAGGERED_VALIDATION_FAILED:' + errors.join(';'));
  model.builtArea = quantities(model).footprint;
  if (model.builtArea > (plot.maxBuiltAreaM2 ?? plot.maxBuiltArea ?? Infinity) + E) throw Error('STAGGERED_MAX_BUILT_AREA_EXCEEDED');
  return model;
}
