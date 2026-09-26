// Local, deterministic concept planner. Metres; x east, y north. Not a code-compliance engine.
import { generateModel as claudeGenerate, validateModel as claudeValidate, quantities as claudeQuantities } from './claude/planner.mjs';
export const TYPES = {
  bedroom: { name: 'غرفة نوم', area: 20, min: 2.6, color: '#e4e7f2' },
  majlis: { name: 'مجلس', area: 32, min: 3, color: '#f3e6c8' },
  living: { name: 'صالة عائلية', area: 28, min: 2.8, color: '#dceee7' },
  dining: { name: 'صالة طعام', area: 20, min: 2.5, color: '#f1e9d5' },
  kitchen: { name: 'مطبخ', area: 18, min: 2.2, color: '#e3edda' },
  bath: { name: 'دورة مياه', area: 6, min: 1.5, color: '#dcebf2' },
  storage: { name: 'مستودع', area: 8, min: 1.3, color: '#e9e5df' },
  service: { name: 'غرفة خدمة', area: 12, min: 2.2, color: '#f0e0dd' },
  corridor: { name: 'ممر إضافي', area: 8, min: 1.2, color: '#f4f1e8' },
};
export const POSITIONS = { front: 'أمام', middle: 'وسط', back: 'خلف' };
export const SIDES = { any: 'تلقائي', left: 'يسار المدخل', right: 'يمين المدخل' };
export const DIRECTIONS = { s: 'جنوب', n: 'شمال', e: 'شرق', w: 'غرب' };
export const GEOMETRY = { exterior: .25, partition: .15, corridor: 1.6, branch: 1.2, height: 3.2 };
export const ENGINE_VERSION = 'rectangular-2';
export const STRATEGIES = {
  'claude-rect': 'Claude 2.2.1 — مخطط مستطيل',
  compact: 'الرواق المحوري',
  balanced: 'الجناحان المتوازنان',
  frontage: 'الواجهة العريضة',
  courtyard: 'بيت الفناء',
  'u-court': 'بيت الباحة U',
};
export const CONCEPT_PROFILES = {
  compact: {
    tag: 'محور واضح',
    form: 'كتلة طولية بإيقاع منتظم ومدخل مقروء',
    idea: 'يربط المدخل بالفراغات عبر رواق رئيسي واضح، ويضغط مساحة الحركة قدر الإمكان.',
    bestFor: 'الأراضي العميقة والبرنامج الكبير',
    tradeoff: 'المحور أطول وقد يحتاج معالجة ضوء في المنتصف',
    massing: 'spine',
  },
  balanced: {
    tag: 'خصوصية متدرجة',
    form: 'جناح ضيافة وجناح عائلي حول قلب مشترك',
    idea: 'يوازن بين أبعاد الغرف، ويجعل وسط المنزل نقطة انتقال بين العام والخاص.',
    bestFor: 'العائلة والضيافة المتكررة',
    tradeoff: 'مساحة حركة أكبر مقابل فصل أوضح',
    massing: 'twin-wings',
  },
  frontage: {
    tag: 'اتصال بالحديقة',
    form: 'كتلة أقصر وأعرض مع حضور قوي للواجهة',
    idea: 'يوسّع الواجهة المعمارية ويزيد فرص الفتحات الخارجية والاتصال بالفراغ المفتوح.',
    bestFor: 'الأراضي العريضة والواجهات المهمة',
    tradeoff: 'يحتاج عرض أرض أكبر وقد يرفع طول الجدار الخارجي',
    massing: 'garden-front',
  },
};
const E = 1e-5, T = GEOMETRY.partition, X = GEOMETRY.exterior;
const sum = (list, fn) => list.reduce((a, v) => a + fn(v), 0);
const near = (a, b) => Math.abs(a - b) < E;
export const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > E && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > E;
export const inside = (a, b) => a.x >= b.x - E && a.y >= b.y - E && a.x + a.w <= b.x + b.w + E && a.y + a.h <= b.y + b.h + E;
export const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function validatePlot(raw) {
  if (!raw || !Number.isFinite(raw.width) || raw.width < 8 || raw.width > 100 || !Number.isFinite(raw.length) || raw.length < 8 || raw.length > 100) throw Error('أدخل طولاً وعرضاً بين 8 و100 متر.');
  if (!Number.isInteger(raw.floors) || raw.floors < 1 || raw.floors > 3) throw Error('عدد الأدوار من 1 إلى 3؛ هذه النسخة توزّع الأرضي فقط.');
  const streets = Object.fromEntries(Object.keys(DIRECTIONS).map(s => [s, raw.streets?.[s] === true]));
  if (!Object.hasOwn(DIRECTIONS, raw.entry) || !streets[raw.entry]) throw Error('اختر جهة مدخل مطلة على أحد الشوارع المفعّلة.');
  const streetSetback = raw.streetSetback ?? 3, neighborSetback = raw.neighborSetback ?? 1.5, coverage = raw.coverage ?? .75;
  if (![streetSetback, neighborSetback].every(n => Number.isFinite(n) && n >= 0 && n <= 15) || !Number.isFinite(coverage) || coverage < .1 || coverage > .9) throw Error('راجع افتراضات الارتدادات ونسبة البناء.');
  const maxBuiltArea = raw.maxBuiltArea ?? null;
  if (maxBuiltArea !== null && (!Number.isFinite(maxBuiltArea) || maxBuiltArea < 20 || maxBuiltArea > raw.width * raw.length)) throw Error('سقف البناء يجب أن يكون بين 20 م² ومساحة الأرض، أو اتركه فارغًا.');
  return { width: raw.width, length: raw.length, floors: raw.floors, streets, entry: raw.entry, streetSetback, neighborSetback, coverage, maxBuiltArea };
}
export function footprint(raw) {
  const p = validatePlot(raw);
  const sb = Object.fromEntries(Object.entries(p.streets).map(([s, on]) => [s, on ? p.streetSetback : p.neighborSetback]));
  const w = Math.max(0, p.width - sb.w - sb.e), h = Math.max(0, p.length - sb.n - sb.s);
  const area = Math.min(w * h, p.width * p.length * p.coverage);
  const scale = w * h > 0 ? Math.sqrt(area / (w * h)) : 0;
  return { x: sb.w + (w - w * scale) / 2, y: sb.s + (h - h * scale) / 2, w: w * scale, h: h * scale, sb, area };
}
export function normalizeRooms(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 30) throw Error('البرنامج يحتاج من 1 إلى 30 فراغاً.');
  return raw.map((r, i) => {
    if (!r || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 70 || !Object.hasOwn(TYPES, r.type) || !Number.isFinite(r.area) || r.area < 4 || r.area > 120 || !Object.hasOwn(POSITIONS, r.position) || !Object.hasOwn(SIDES, r.side)) throw Error('راجع اسم ونوع ومساحة وموقع الفراغ رقم ' + (i + 1) + '؛ المساحة بين 4 و120 م².');
    return { id: 'room-' + i, name: r.name.trim(), type: r.type, area: r.area, targetArea: r.area, position: r.position, side: r.side };
  });
}
export function defaultRooms({ bedrooms = 4, majlis = 2, baths = 3, kitchens = 1, halls = 1, dining = 1 } = {}) {
  const result = [];
  const add = (type, count, position) => {
    if (!Number.isInteger(count) || count < 0 || count > 10) throw Error('أعداد الفراغات يجب أن تكون أعداداً صحيحة بين 0 و10.');
    for (let i = 0; i < count; i++) result.push({ name: TYPES[type].name + (count > 1 ? ' ' + (i + 1) : ''), type, area: TYPES[type].area, position, side: type === 'majlis' && count === 2 ? (i ? 'right' : 'left') : 'any' });
  };
  add('majlis', majlis, 'front'); add('living', halls, 'middle'); add('dining', dining, 'middle'); add('kitchen', kitchens, 'middle'); add('bedroom', bedrooms, 'back');
  add('bath', baths, 'back');
  if (baths) result[result.length - baths].position = 'middle';
  return result;
}

// Partition a wing into full-width rows. Small rooms share a row with a cross passage.
// A bounded search can reject a program it cannot fit; this is not a proof of impossibility.
function packWing(rooms, width, strategy) {
  if (!rooms.length) return { rows: [], height: 0 };
  const memo = new Map(); let visits = 0;
  function solve(list) {
    if (!list.length) return { rows: [], height: 0, score: 0 };
    const key = list.map(r => r.id).sort().join(',');
    if (memo.has(key)) return memo.get(key);
    if (++visits > 1800) return null;
    const first = [...list].sort((a, b) => a.area - b.area)[0], other = list.filter(r => r !== first);
    const groups = [[first]];
    other.forEach((r, i) => { groups.push([first, r]); other.slice(i + 1).forEach(s => groups.push([first, r, s])); });
    let best = null;
    for (const group of groups) {
      const depth = sum(group, r => r.area) / (width - T * (group.length - 1));
      if (group.some(r => depth < TYPES[r.type].min - E || r.area / depth < TYPES[r.type].min - E || Math.max(depth * depth / r.area, r.area / (depth * depth)) > 5)) continue;
      const rest = solve(list.filter(r => !group.includes(r)));
      if (!rest) continue;
      const branch = group.length > 1 ? GEOMETRY.branch + T : 0;
      const height = depth + branch + (rest.rows.length ? T : 0) + rest.height;
      const aspectPenalty = sum(group, r => Math.abs(Math.log((r.area / depth) / depth))) * (strategy === 'balanced' ? 1.5 : .035);
      const interiorPenalty = strategy === 'frontage' ? Math.max(0, group.length - 1) * 5 : 0;
      const score = height + rest.score - rest.height + aspectPenalty + interiorPenalty;
      if (!best || score < best.score) best = { rows: [{ rooms: group, depth, branch }, ...rest.rows], height, score };
    }
    memo.set(key, best); return best;
  }
  return solve(rooms);
}
function packZone(rooms, width, strategy) {
  let states = [{ left: rooms.filter(r => r.side === 'left'), right: rooms.filter(r => r.side === 'right') }];
  for (const r of rooms.filter(r => r.side === 'any').sort((a, b) => b.area - a.area)) {
    states = states.flatMap(s => [{ left: [...s.left, r], right: s.right }, { left: s.left, right: [...s.right, r] }]);
    states.sort((a, b) => Math.abs(sum(a.left, r => r.area) - sum(a.right, r => r.area)) - Math.abs(sum(b.left, r => r.area) - sum(b.right, r => r.area)));
    states = states.slice(0, 48);
  }
  const cache = new Map();
  const pack = list => { const key = list.map(r => r.id).sort().join(','); if (!cache.has(key)) cache.set(key, packWing(list, width, strategy)); return cache.get(key); };
  let best = null;
  for (const s of states) {
    const left = pack(s.left), right = pack(s.right);
    if (!left || !right) continue;
    const height = Math.max(left.height, right.height);
    const score = height + Math.abs(left.height - right.height) * .02 + (strategy === 'compact' ? 0 : ((left.score || 0) - left.height + (right.score || 0) - right.height));
    if (!best || score < best.score) best = { left, right, height, score };
  }
  return best;
}

function mapper(p, f) {
  const point = (x, y) => p.entry === 's' ? { x: f.x + x, y: f.y + y } : p.entry === 'n' ? { x: f.x + f.w - x, y: f.y + f.h - y } : p.entry === 'e' ? { x: f.x + f.w - y, y: f.y + x } : { x: f.x + y, y: f.y + f.h - x };
  const rect = r => { const a = point(r.x, r.y), b = point(r.x + r.w, r.y + r.h); return { ...r, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; };
  return { point, rect };
}
function mergeWalls(raw) {
  const bins = new Map();
  raw.forEach(w => {
    const vertical = near(w.x1, w.x2), fixed = vertical ? w.x1 : w.y1;
    const a = Math.min(vertical ? w.y1 : w.x1, vertical ? w.y2 : w.x2), b = Math.max(vertical ? w.y1 : w.x1, vertical ? w.y2 : w.x2);
    const key = (vertical ? 'v' : 'h') + fixed.toFixed(5) + w.type;
    if (!bins.has(key)) bins.set(key, { vertical, fixed, type: w.type, t: w.t, ranges: [] });
    bins.get(key).ranges.push([a, b]);
  });
  const walls = [];
  for (const bin of bins.values()) {
    const ranges = [];
    bin.ranges.sort((a, b) => a[0] - b[0]).forEach(r => {
      const last = ranges.at(-1);
      if (last && r[0] <= last[1] + E) last[1] = Math.max(last[1], r[1]); else ranges.push([...r]);
    });
    ranges.forEach(([a, b]) => walls.push({ id: 'wall-' + walls.length, x1: bin.vertical ? bin.fixed : a, y1: bin.vertical ? a : bin.fixed, x2: bin.vertical ? bin.fixed : b, y2: bin.vertical ? b : bin.fixed, type: bin.type, t: bin.t, h: GEOMETRY.height }));
  }
  return walls;
}

export function generateModel(rawPlot, rawRooms, { strategy = 'compact' } = {}) {
  if (!Object.hasOwn(STRATEGIES, strategy)) throw Error('استراتيجية توزيع غير معروفة.');
  if (strategy === 'claude-rect') {
    const plot = validatePlot(rawPlot);
    const model = claudeGenerate({ ...plot, shape: 'rect' }, rawRooms);
    if (plot.maxBuiltArea !== null && claudeQuantities(model).footprint > plot.maxBuiltArea + E) throw Error('حل Claude يتجاوز سقف البناء المحدد؛ لم تُصغّر الغرف.');
    return { ...model, plot: { ...model.plot, maxBuiltArea: plot.maxBuiltArea }, engineVersion: 'claude-2.2.1', strategy,
      architecture: { ...CONCEPT_PROFILES.compact, tag: 'Claude 2.2.1', idea: 'توزيع حتمي يحافظ على المساحات المطلوبة ويتحقق من اتصال الغرف.' } };
  }
  const plot = validatePlot(rawPlot), f = footprint(plot), program = normalizeRooms(rawRooms);
  const sideways = ['e', 'w'].includes(plot.entry), maxWidth = Math.min(20, sideways ? f.h : f.w), maxDepth = sideways ? f.w : f.h;
  const required = sum(program, r => r.area);
  const areaBudget = Math.min(f.area, plot.maxBuiltArea ?? Infinity);
  if (required > areaBudget) throw Error('مجموع مساحات الغرف أكبر من سقف البناء المتاح قبل إضافة الجدران والممرات. لم تتغيّر مساحاتك.');
  let solution = null;
  for (let width = maxWidth; width >= Math.max(7, maxWidth - 5); width -= .5) {
    const wing = (width - X * 2 - T * 2 - GEOMETRY.corridor) / 2;
    if (wing < 1.5) continue;
    const zones = Object.keys(POSITIONS).map(position => ({ position, ...packZone(program.filter(r => r.position === position), wing, strategy) }));
    if (zones.some(z => !Number.isFinite(z.height))) continue;
    const depth = X * 2 + sum(zones, z => z.height) + T * (zones.filter(z => z.height).length - 1);
    if (depth > maxDepth + E || width * depth > areaBudget + E) continue;
    const score = width * depth + Math.abs(width - depth) * .2 + (strategy === 'compact' ? 0 : sum(zones, z => z.score - z.height) * 15);
    if (!solution || score < solution.score) solution = { width, wing, depth, zones, score };
  }
  if (!solution) throw Error('لم يجد محرك الكتلة المستطيلة توزيعاً يحافظ على المساحات والمواقع المطلوبة وممرات الوصول. جرّب تعديل المواقع أو المساحات أو أبعاد الأرض؛ لم تُحذف أو تُصغّر أي غرفة.');
  const { width, wing, depth, zones } = solution;
  const localWidth = sideways ? f.h : f.w, offset = (localWidth - width) / 2;
  const transform = mapper(plot, f), buildingLocal = { x: offset, y: 0, w: width, h: depth };
  const rooms = [], corridors = [{ id: 'spine', name: 'ممر رئيسي', x: offset + X + wing + T, y: X, w: GEOMETRY.corridor, h: depth - 2 * X }], reserves = [], links = [];
  let cursor = X;
  zones.filter(z => z.height).forEach((zone, zoneIndex, active) => {
    for (const side of ['left', 'right']) {
      const x = side === 'left' ? offset + X : offset + X + wing + 2 * T + GEOMETRY.corridor;
      let y = cursor;
      const packed = zone[side];
      packed.rows.forEach((row, rowIndex) => {
        let corridorId = 'spine';
        if (row.branch) {
          corridorId = 'branch-' + zone.position + '-' + side + '-' + rowIndex;
          corridors.push({ id: corridorId, name: 'ممر فرعي', x: side === 'left' ? x : x - T, y, w: wing + T, h: GEOMETRY.branch });
          links.push(['spine', corridorId]);
          y += row.branch;
        }
        // Put bedrooms / occupied rooms towards the facade, small wet rooms towards the spine.
        const order = [...row.rooms].sort((a, b) => TYPES[b.type].min - TYPES[a.type].min || b.area - a.area);
        if (side === 'right') order.reverse();
        let rx = x;
        order.forEach(r => { const w = r.area / row.depth; rooms.push({ ...r, x: rx, y, w, h: row.depth, resolvedSide: side, corridorId, doorSide: row.branch ? 'front' : side === 'left' ? 'right' : 'left' }); rx += w + T; });
        y += row.depth + (rowIndex < packed.rows.length - 1 ? T : 0);
      });
      const leftover = zone.height - packed.height - (packed.rows.length ? T : 0);
      if (leftover > .1) reserves.push({ name: 'غير موزّع', x, y: cursor + packed.height + (packed.rows.length ? T : 0), w: wing, h: leftover });
    }
    cursor += zone.height + (zoneIndex < active.length - 1 ? T : 0);
  });
  const rawWalls = [], portals = [];
  const wall = (x1, y1, x2, y2, type) => rawWalls.push({ x1, y1, x2, y2, type, t: type === 'ext' ? X : T });
  const bx = offset, by = 0, bw = width, bh = depth;
  wall(bx + X / 2, X / 2, bx + bw - X / 2, X / 2, 'ext');
  wall(bx + X / 2, bh - X / 2, bx + bw - X / 2, bh - X / 2, 'ext');
  wall(bx + X / 2, X / 2, bx + X / 2, bh - X / 2, 'ext');
  wall(bx + bw - X / 2, X / 2, bx + bw - X / 2, bh - X / 2, 'ext');
  rooms.forEach(r => {
    const leftExt = near(r.x, bx + X), rightExt = near(r.x + r.w, bx + bw - X), frontExt = near(r.y, X), backExt = near(r.y + r.h, bh - X);
    if (!leftExt) wall(r.x - T / 2, r.y - T / 2, r.x - T / 2, r.y + r.h + T / 2, 'int');
    if (!rightExt) wall(r.x + r.w + T / 2, r.y - T / 2, r.x + r.w + T / 2, r.y + r.h + T / 2, 'int');
    if (!frontExt) wall(r.x - T / 2, r.y - T / 2, r.x + r.w + T / 2, r.y - T / 2, 'int');
    if (!backExt) wall(r.x - T / 2, r.y + r.h + T / 2, r.x + r.w + T / 2, r.y + r.h + T / 2, 'int');
    const frontDoor = r.doorSide === 'front';
    portals.push({ type: 'door', x: frontDoor ? r.x + r.w / 2 : r.doorSide === 'right' ? r.x + r.w + T / 2 : r.x - T / 2, y: frontDoor ? r.y - T / 2 : r.y + r.h / 2, axis: frontDoor ? 'h' : 'v', w: r.type === 'bath' ? .8 : .9, h: 2.1, sill: 0, roomId: r.id, connects: [r.id, r.corridorId] });
    const extEdge = leftExt ? 'left' : rightExt ? 'right' : backExt ? 'back' : frontExt ? 'front' : null;
    if (extEdge) {
      const horizontal = ['front', 'back'].includes(extEdge);
      portals.push({ type: 'window', x: horizontal ? r.x + r.w / 2 : extEdge === 'left' ? bx + X / 2 : bx + bw - X / 2, y: horizontal ? extEdge === 'front' ? X / 2 : bh - X / 2 : r.y + r.h / 2, axis: horizontal ? 'h' : 'v', w: Math.min(r.type === 'bath' ? .7 : 1.4, (horizontal ? r.w : r.h) - .5), h: r.type === 'bath' ? .6 : 1.2, sill: r.type === 'bath' ? 1.7 : 1.1, roomId: r.id });
    }
  });
  portals.push({ type: 'door', x: corridors[0].x + GEOMETRY.corridor / 2, y: X / 2, axis: 'h', w: 1.1, h: 2.2, sill: 0, connects: ['outside', 'spine'] });
  const localWalls = mergeWalls(rawWalls);
  const openings = portals.map((o, i) => {
    const w = localWalls.find(w => o.axis === 'h' ? near(w.y1, w.y2) && near(w.y1, o.y) && o.x - o.w / 2 >= w.x1 - E && o.x + o.w / 2 <= w.x2 + E : near(w.x1, w.x2) && near(w.x1, o.x) && o.y - o.w / 2 >= w.y1 - E && o.y + o.w / 2 <= w.y2 + E);
    if (!w) throw Error('تعذر ربط إحدى الفتحات بجدار صالح.');
    const length = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const pos = Math.hypot(o.x - w.x1, o.y - w.y1) / length;
    const { x, y, axis, ...rest } = o;
    return { ...rest, id: 'opening-' + i, wallId: w.id, pos };
  });
  const walls = localWalls.map(w => { const a = transform.point(w.x1, w.y1), b = transform.point(w.x2, w.y2); return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; });
  const model = { version: 1, engineVersion: ENGINE_VERSION, strategy, architecture: { ...CONCEPT_PROFILES[strategy] }, plot, footprint: f, building: transform.rect(buildingLocal), program, rooms: rooms.map(transform.rect), corridors: corridors.map(transform.rect), reserves: reserves.map(transform.rect), links, walls, openings, drawnFloors: 1, warnings: [] };
  const errors = validateModel(model);
  if (errors.length) throw Error(errors[0]);
  if (plot.floors > 1) model.warnings.push('المعروض والكميات للدور الأرضي فقط؛ الأدوار الأخرى والسلالم لم تُصمّم.');
  const noWindows = model.rooms.filter(r => !openings.some(o => o.roomId === r.id && o.type === 'window'));
  if (noWindows.length) model.warnings.push('فراغات دون نافذة خارجية في هذا الحل: ' + noWindows.map(r => r.name).join('، ') + '. تحتاج مراجعة الإضاءة والتهوية.');
  if (reserves.length) model.warnings.push('المساحات الرمادية غير موزعة وليست غرفاً مطلوبة؛ تظهر مساحتها مستقلة.');
  model.warnings.push('المساحات صافية بين أوجه الجدران. هذا بديل تخطيطي بكتلة أرضية منتظمة ومدخل واحد؛ لغة الكتلة الخارجية لا تثبت مطابقة الكود أو الفصل التام بين الضيوف والعائلة.');
  return model;
}

// Topological studies are built from an adjacency graph (room ↔ corridor ↔ exterior),
// not by decorating a rectangular shell. They deliberately preserve requested areas.
function localRectForEntry(rect, entry) { return ['e', 'w'].includes(entry) ? { ...rect, w: rect.h, h: rect.w } : { ...rect }; }
function rectBounds(rects) {
  const minX = Math.min(...rects.map(r => r.x)), minY = Math.min(...rects.map(r => r.y));
  const maxX = Math.max(...rects.map(r => r.x + r.w)), maxY = Math.max(...rects.map(r => r.y + r.h));
  return { x: minX - X / 2, y: minY - X / 2, w: maxX - minX + X, h: maxY - minY + X };
}
function sharedBoundary(a, b) {
  if (near(a.x + a.w, b.x) || near(b.x + b.w, a.x)) {
    const from = Math.max(a.y, b.y), to = Math.min(a.y + a.h, b.y + b.h);
    if (to - from > E) return { axis: 'v', x: near(a.x + a.w, b.x) ? b.x : a.x, y: (from + to) / 2, length: to - from };
  }
  if (near(a.y + a.h, b.y) || near(b.y + b.h, a.y)) {
    const from = Math.max(a.x, b.x), to = Math.min(a.x + a.w, b.x + b.w);
    if (to - from > E) return { axis: 'h', x: (from + to) / 2, y: near(a.y + a.h, b.y) ? b.y : a.y, length: to - from };
  }
  return null;
}
function cellWalls(cells) {
  const raw = [], wall = (x1, y1, x2, y2, type) => raw.push({ x1, y1, x2, y2, type, t: type === 'ext' ? X : T });
  for (const cell of cells) {
    const edges = [
      { axis: 'h', fixed: cell.y, a: cell.x, b: cell.x + cell.w, side: 'top' },
      { axis: 'h', fixed: cell.y + cell.h, a: cell.x, b: cell.x + cell.w, side: 'bottom' },
      { axis: 'v', fixed: cell.x, a: cell.y, b: cell.y + cell.h, side: 'left' },
      { axis: 'v', fixed: cell.x + cell.w, a: cell.y, b: cell.y + cell.h, side: 'right' },
    ];
    for (const edge of edges) {
      const marks = [edge.a, edge.b], spans = [];
      for (const other of cells) {
        if (other === cell) continue;
        const touching = edge.axis === 'h'
          ? (edge.side === 'top' ? near(other.y + other.h, edge.fixed) : near(other.y, edge.fixed))
          : (edge.side === 'left' ? near(other.x + other.w, edge.fixed) : near(other.x, edge.fixed));
        if (!touching) continue;
        const start = Math.max(edge.a, edge.axis === 'h' ? other.x : other.y), end = Math.min(edge.b, edge.axis === 'h' ? other.x + other.w : other.y + other.h);
        if (end - start > E) { spans.push([start, end]); marks.push(start, end); }
      }
      [...new Set(marks.map(n => +n.toFixed(5)))].sort((a, b) => a - b).forEach((start, i, list) => {
        const end = list[i + 1]; if (!(end - start > E)) return;
        const mid = (start + end) / 2, insideNeighbor = spans.some(([a, b]) => mid > a - E && mid < b + E);
        const type = insideNeighbor ? 'int' : 'ext', offset = type === 'ext' ? X / 2 : 0;
        if (edge.axis === 'h') wall(start, edge.fixed + (edge.side === 'top' ? -offset : offset), end, edge.fixed + (edge.side === 'top' ? -offset : offset), type);
        else wall(edge.fixed + (edge.side === 'left' ? -offset : offset), start, edge.fixed + (edge.side === 'left' ? -offset : offset), end, type);
      });
    }
  }
  return mergeWalls(raw);
}
function openingOnWall(walls, portal, id) {
  const wall = walls.find(w => portal.axis === 'h'
    ? near(w.y1, w.y2) && near(w.y1, portal.y) && portal.x - portal.w / 2 >= Math.min(w.x1, w.x2) - E && portal.x + portal.w / 2 <= Math.max(w.x1, w.x2) + E
    : near(w.x1, w.x2) && near(w.x1, portal.x) && portal.y - portal.w / 2 >= Math.min(w.y1, w.y2) - E && portal.y + portal.w / 2 <= Math.max(w.y1, w.y2) + E);
  if (!wall) throw Error('تعذر ربط فتحة في النموذج الطوبولوجي بجدار صالح.');
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  return { ...portal, id, wallId: wall.id, pos: Math.hypot(portal.x - wall.x1, portal.y - wall.y1) / length, x: undefined, y: undefined, axis: undefined };
}
function stackWing(seed, side, corridor, startY, wingWidth) {
  const rooms = [], ordered = seed.filter(r => r.resolvedSide === side).sort((a, b) => ['front', 'middle', 'back'].indexOf(a.position) - ['front', 'middle', 'back'].indexOf(b.position) || b.area - a.area || a.id.localeCompare(b.id));
  let y = startY;
  for (const room of ordered) {
    const min = TYPES[room.type].min;
    let w = room.type === 'bath' || room.type === 'storage' ? Math.min(wingWidth, Math.max(min, Math.sqrt(room.area * 1.3))) : wingWidth;
    w = Math.min(wingWidth, Math.max(min, Math.min(w, room.area / min)));
    const h = room.area / w;
    if (h < min - E || !Number.isFinite(h)) throw Error('مساحة ' + room.name + ' لا تناسب جناحًا طوبولوجيًا بعرض كافٍ.');
    rooms.push({ ...room, x: side === 'left' ? corridor.x - w : corridor.x + corridor.w, y, w, h, corridorId: corridor.id, doorSide: side === 'left' ? 'right' : 'left' });
    y += h + T;
  }
  return { rooms, end: y - (rooms.length ? T : 0) };
}

export function generateTopologyModel(rawPlot, rawRooms, { topology = 'u-court' } = {}) {
  if (!['u-court', 'courtyard'].includes(topology)) throw Error('نموذج طوبولوجي غير معروف.');
  const plot = validatePlot(rawPlot), f = footprint(plot), program = normalizeRooms(rawRooms), base = generateModel(plot, program, { strategy: 'balanced' });
  const sideways = ['e', 'w'].includes(plot.entry), localW = sideways ? f.h : f.w, localD = sideways ? f.w : f.h;
  const seeds = program.map(room => {
    const found = base.rooms.find(r => r.id === room.id), local = localRectForEntry(found, plot.entry);
    return { ...room, resolvedSide: found.resolvedSide, w: local.w, h: local.h };
  });
  if (!seeds.some(r => r.resolvedSide === 'left') || !seeds.some(r => r.resolvedSide === 'right')) throw Error('يحتاج نموذج الفناء جناحين على الأقل؛ ثبّت بعض الغرف على جانبي المدخل أو استخدم البديل المحوري.');
  let solution = null;
  for (let wing = Math.min(7.2, localW * .29); wing >= 4.2; wing -= .25) {
    const c = GEOMETRY.corridor, courtW = localW - 2 * (wing + c) - 2 * X;
    if (courtW < 3.2) continue;
    const start = X + (topology === 'courtyard' ? c : 0), leftCorridor = { id: 'topo-left', name: 'رواق الفناء الأيسر', x: X + wing, y: start, w: c, h: 1 }, rightCorridor = { id: 'topo-right', name: 'رواق الفناء الأيمن', x: X + wing + c + courtW, y: start, w: c, h: 1 };
    try {
      const left = stackWing(seeds, 'left', leftCorridor, start, wing), right = stackWing(seeds, 'right', rightCorridor, start, wing), depth = Math.max(left.end, right.end) - start;
      const builtDepth = start + depth + c + X;
      const builtWidth = 2 * wing + 2 * c + courtW + 2 * X;
      if (builtDepth > localD + E || builtWidth * builtDepth > Math.min(f.area, plot.maxBuiltArea ?? Infinity) + E) continue;
      leftCorridor.h = depth; rightCorridor.h = depth;
      const back = { id: 'topo-back', name: 'رواق خلفي للفناء', x: leftCorridor.x, y: start + depth, w: c + courtW + c, h: c };
      const corridors = [leftCorridor, rightCorridor, back];
      if (topology === 'courtyard') corridors.unshift({ id: 'topo-front', name: 'رواق مدخل الفناء', x: leftCorridor.x, y: X, w: c + courtW + c, h: c });
      const topologyRooms = [...left.rooms, ...right.rooms];
      solution = { wing, courtW, rooms: topologyRooms, leftRooms: left.rooms, rightRooms: right.rooms, corridors, localBuilding: rectBounds([...topologyRooms, ...corridors]), courtyard: { x: leftCorridor.x + c, y: start, w: courtW, h: depth }, links: topology === 'courtyard' ? [['topo-left', 'topo-front'], ['topo-right', 'topo-front'], ['topo-left', 'topo-back'], ['topo-right', 'topo-back']] : [['topo-left', 'topo-back'], ['topo-right', 'topo-back']] };
      break;
    } catch { /* Try a wider wing. */ }
  }
  if (!solution) throw Error('تعذر ملاءمة نموذج الفناء الطوبولوجي ضمن الأرض والمساحات الحالية؛ استُخدم البديل المحوري دون تصغير الغرف.');
  const cells = [...solution.rooms, ...solution.corridors], localWalls = cellWalls(cells), portals = [];
  for (const room of solution.rooms) {
    const corridor = solution.corridors.find(c => c.id === room.corridorId), shared = sharedBoundary(room, corridor);
    if (!shared) throw Error('غرفة بلا اتصال فعلي برواق الفناء.');
    portals.push({ type: 'door', x: shared.x, y: shared.y, axis: shared.axis, w: Math.min(room.type === 'bath' ? .8 : .95, shared.length - .12), h: 2.1, sill: 0, roomId: room.id, connects: [room.id, corridor.id] });
    // Windows are intentionally placed by the editor on the final exposed segment;
    // this avoids pretending that one automatic location suits privacy, sun and furniture.
  }
  const entryCorridor = solution.corridors.find(c => c.id === (topology === 'courtyard' ? 'topo-front' : 'topo-left'));
  portals.push({ type: 'door', x: entryCorridor.x + entryCorridor.w / 2, y: entryCorridor.y - X / 2, axis: 'h', w: 1.15, h: 2.2, sill: 0, connects: ['outside', entryCorridor.id] });
  const openings = portals.map((portal, i) => openingOnWall(localWalls, portal, 'opening-' + i)).map(({ x, y, axis, ...o }) => o);
  const transform = mapper(plot, f), model = {
    version: 1, engineVersion: ENGINE_VERSION, strategy: topology, architecture: { tag: topology === 'courtyard' ? 'فناء حقيقي' : 'كتلة U حقيقية', form: topology === 'courtyard' ? 'أربعة أضلاع تحيط بفناء مفتوح' : 'جناحان ورواق خلفي يحيطان بباحة', idea: 'مولّد طوبولوجي قائم على علاقات الغرف والممرات والفراغ المفتوح.', bestFor: 'برنامج سكني يحتاج ضوءًا وخصوصية متدرجة', tradeoff: 'زيادة طول الواجهة والجدران مقارنة بالكتلة المدمجة', massing: topology },
    topology, plot, footprint: f, building: transform.rect(solution.localBuilding), program, rooms: solution.rooms.map(transform.rect), corridors: solution.corridors.map(transform.rect), reserves: [], links: solution.links, walls: localWalls.map(w => { const a = transform.point(w.x1, w.y1), b = transform.point(w.x2, w.y2); return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }), openings, courtyards: [transform.rect(solution.courtyard)], massingParts: [rectBounds([...solution.leftRooms, solution.corridors.find(c => c.id === 'topo-left')]), rectBounds([...solution.rightRooms, solution.corridors.find(c => c.id === 'topo-right')]), rectBounds([solution.corridors.find(c => c.id === 'topo-back')]), ...(topology === 'courtyard' ? [rectBounds([solution.corridors.find(c => c.id === 'topo-front')])] : [])].map(transform.rect), builtArea: sum(cells, r => r.w * r.h), drawnFloors: 1, warnings: ['هذا نموذج طوبولوجي يولّد فناء/باحة فعلية بين الأجنحة؛ يظل تصورًا معماريًا أوليًا يحتاج مراجعة كود وبنية وإنارة وتهوية.']
  };
  const errors = validateModel(model); if (errors.length) throw Error(errors[0]);
  return model;
}

// Alternatives include true topological forms when the submitted program can accommodate them.
export function generateAlternatives(plot, rooms, { includeClaude = false } = {}) {
  const models = [], fingerprints = new Set(), failures = [];
  if (includeClaude) {
    try { models.push(generateModel(plot, rooms, { strategy: 'claude-rect' })); }
    catch (error) { failures.push({ strategy: 'claude-rect', reason: error.message }); }
  }
  for (const topology of ['courtyard', 'u-court']) {
    try {
      const model = generateTopologyModel(plot, rooms, { topology });
      const key = topology + JSON.stringify(model.courtyards);
      if (!fingerprints.has(key)) { fingerprints.add(key); models.push(model); }
    } catch (error) { failures.push({ strategy: topology, reason: error.message }); }
  }
  for (const strategy of ['compact', 'balanced', 'frontage']) {
    try {
      const model = generateModel(plot, rooms, { strategy });
      const key = JSON.stringify(model.rooms.map(r => [r.id, r.x, r.y, r.w, r.h].map(v => typeof v === 'number' ? +v.toFixed(5) : v)).sort((a, b) => a[0].localeCompare(b[0])));
      if (!fingerprints.has(key)) { fingerprints.add(key); models.push(model); }
    } catch (error) { failures.push({ strategy, reason: error.message }); }
  }
  if (!models.length) throw Error(failures[0]?.reason || 'لم يُعثر على حل صالح.');
  return { models, failures };
}

export function openingPoint(model, o) {
  const w = model.walls.find(w => w.id === o.wallId);
  return { x: w.x1 + (w.x2 - w.x1) * o.pos, y: w.y1 + (w.y2 - w.y1) * o.pos };
}
export function placeOpening(model, { type, point }) {
  if (!['door', 'window'].includes(type) || !point || ![point.x, point.y].every(Number.isFinite)) throw Error('اختر بابًا أو نافذة ثم اضغط جدارًا صالحًا.');
  const copy = structuredClone(model);
  const closest = copy.walls.map(w => {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((point.x - w.x1) * dx + (point.y - w.y1) * dy) / len2));
    const x = w.x1 + dx * t, y = w.y1 + dy * t;
    return { w, t, x, y, distance: Math.hypot(point.x - x, point.y - y) };
  }).sort((a, b) => a.distance - b.distance)[0];
  if (!closest || closest.distance > .55) throw Error('اضغط مباشرة على جدار لإضافة الفتحة.');
  if (type === 'window' && closest.w.type !== 'ext') throw Error('النافذة يجب أن تكون على جدار خارجي.');
  const length = Math.hypot(closest.w.x2 - closest.w.x1, closest.w.y2 - closest.w.y1), width = type === 'door' ? .9 : 1.35;
  if (closest.t * length - width / 2 < .1 || closest.t * length + width / 2 > length - .1) throw Error('اترك مسافة عند طرفي الجدار للفتحة.');
  if (copy.openings.some(o => o.wallId === closest.w.id && Math.abs(o.pos - closest.t) * length < (o.w + width) / 2 + .08)) throw Error('هذه الفتحة تتداخل مع فتحة موجودة.');
  const opening = { id: 'opening-' + (Math.max(-1, ...copy.openings.map(o => Number(o.id.split('-').at(-1)) || 0)) + 1), type, wallId: closest.w.id, pos: closest.t, w: width, h: type === 'door' ? 2.1 : 1.2, sill: type === 'door' ? 0 : 1.05 };
  if (type === 'door') {
    const ux = (closest.w.x2 - closest.w.x1) / length, uy = (closest.w.y2 - closest.w.y1) / length, nx = -uy, ny = ux, d = closest.w.t / 2 + .03;
    const a = { x: closest.x + nx * d, y: closest.y + ny * d }, b = { x: closest.x - nx * d, y: closest.y - ny * d };
    const nodes = [...copy.rooms, ...copy.corridors];
    const nodeAt = p => nodes.find(r => p.x >= r.x - E && p.x <= r.x + r.w + E && p.y >= r.y - E && p.y <= r.y + r.h + E)?.id || (p.x < copy.building.x || p.x > copy.building.x + copy.building.w || p.y < copy.building.y || p.y > copy.building.y + copy.building.h ? 'outside' : null);
    const first = nodeAt(a), second = nodeAt(b);
    if (!first || !second || first === second) throw Error('لا يمكن وضع الباب هنا لأنه لا يصل بين فراغين صالحين.');
    opening.connects = [first, second];
  }
  copy.openings.push(opening); const errors = validateModel(copy); if (errors.length) throw Error(errors[0]);
  return copy;
}
export function removeOpening(model, point) {
  if (!point || ![point.x, point.y].every(Number.isFinite)) throw Error('اضغط على فتحة لإزالتها.');
  const copy = structuredClone(model), match = copy.openings.map(o => ({ o, p: openingPoint(copy, o) })).sort((a, b) => Math.hypot(point.x - a.p.x, point.y - a.p.y) - Math.hypot(point.x - b.p.x, point.y - b.p.y))[0];
  if (!match || Math.hypot(point.x - match.p.x, point.y - match.p.y) > .7) throw Error('لم تُحدّد فتحة قريبة لإزالتها.');
  if (match.o.connects?.includes('outside')) throw Error('لا يمكن حذف مدخل الوصول الأساسي من المحرر.');
  copy.openings = copy.openings.filter(o => o.id !== match.o.id); const errors = validateModel(copy); if (errors.length) throw Error(errors[0]);
  return copy;
}
export function validateModel(m) {
  if (m?.version === 2) {
    const errors = claudeValidate(m);
    if (!errors.length && m.plot.maxBuiltArea != null && claudeQuantities(m).footprint > m.plot.maxBuiltArea + E) errors.push('الكتلة تتجاوز سقف البناء المحدد.');
    return errors;
  }
  const errors = [], fail = s => errors.push(s);
  const containsPoint = (r, p) => p.x >= r.x - E && p.x <= r.x + r.w + E && p.y >= r.y - E && p.y <= r.y + r.h + E;
  const nodes = new Map([...m.rooms, ...m.corridors].map(r => [r.id, r]));
  if (nodes.size !== m.rooms.length + m.corridors.length || new Set(m.walls.map(w => w.id)).size !== m.walls.length || new Set(m.openings.map(o => o.id)).size !== m.openings.length) fail('معرّفات هندسية مكررة.');
  if (!inside(m.building, m.footprint)) fail('كتلة المبنى تتجاوز المساحة المتاحة.');
  const builtArea = m.builtArea ?? m.building.w * m.building.h;
  if (m.plot.maxBuiltArea !== null && m.plot.maxBuiltArea !== undefined && builtArea > m.plot.maxBuiltArea + E) fail('كتلة المبنى تتجاوز سقف البناء المطلوب.');
  if (m.rooms.length !== m.program.length) fail('عدد الغرف لا يطابق البرنامج.');
  m.corridors.forEach(c => { if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.w <= 0 || c.h <= 0 || !inside(c, m.building)) fail('ممر غير صالح.'); });
  m.openings.forEach(o => {
    const wall = m.walls.find(w => w.id === o.wallId);
    if (!wall || ![o.pos, o.w, o.h, o.sill].every(Number.isFinite) || o.w <= 0 || o.h <= 0 || o.sill < 0 || !['door', 'window'].includes(o.type)) { fail('فتحة غير صالحة.'); return; }
    if (o.type !== 'door') return;
    if (o.sill !== 0 || o.connects?.length !== 2) { fail('اتصال باب غير صالح.'); return; }
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1), dx = (wall.x2 - wall.x1) / length, dy = (wall.y2 - wall.y1) / length, p = openingPoint(m, o);
    const onNode = (id, point) => id === 'outside' ? !containsPoint(m.building, point) : nodes.has(id) && containsPoint(nodes.get(id), point);
    for (const along of [-o.w / 2 + .02, 0, o.w / 2 - .02]) {
      const a = { x: p.x + dx * along - dy * (wall.t / 2 + .02), y: p.y + dy * along + dx * (wall.t / 2 + .02) };
      const b = { x: p.x + dx * along + dy * (wall.t / 2 + .02), y: p.y + dy * along - dx * (wall.t / 2 + .02) };
      if (!(onNode(o.connects[0], a) && onNode(o.connects[1], b) || onNode(o.connects[1], a) && onNode(o.connects[0], b))) fail('الباب لا يفتح فعلياً بين الفراغين المرتبطين به.');
    }
  });
  m.links.forEach(([aId, bId]) => {
    const a = m.corridors.find(c => c.id === aId), b = m.corridors.find(c => c.id === bId);
    if (!a || !b) { fail('اتصال ممر مفقود.'); return; }
    const sharedX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), sharedY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (!(sharedX >= -.001 && sharedY >= GEOMETRY.branch - E || sharedY >= -.001 && sharedX >= GEOMETRY.branch - E)) fail('الممر الفرعي غير متصل هندسياً بالممر الرئيسي.');
  });
  for (const r of m.rooms) {
    if (![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0 || !inside(r, m.building)) fail('أبعاد غير صالحة للفراغ: ' + r.name);
    if (Math.abs(r.w * r.h - r.targetArea) > E) fail('المساحة غير مطابقة لطلبك: ' + r.name);
    if (r.side !== 'any' && r.resolvedSide !== r.side) fail('الجانب المطلوب لم يتحقق: ' + r.name);
    if (m.corridors.some(c => overlap(r, c))) fail('غرفة تتداخل مع ممر: ' + r.name);
  }
  m.rooms.forEach((a, i) => m.rooms.slice(i + 1).forEach(b => { if (overlap(a, b)) fail('غرف متداخلة: ' + a.name + ' و' + b.name); }));
  for (const w of m.walls) {
    if (![w.x1, w.y1, w.x2, w.y2, w.t, w.h].every(Number.isFinite) || w.t <= 0 || w.h <= 0 || Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < E || !(near(w.x1, w.x2) || near(w.y1, w.y2))) { fail('جدار غير صالح.'); continue; }
    if (m.rooms.some(r => near(w.x1, w.x2) ? w.x1 > r.x + E && w.x1 < r.x + r.w - E && Math.min(w.y1, w.y2) < r.y + r.h - E && Math.max(w.y1, w.y2) > r.y + E : w.y1 > r.y + E && w.y1 < r.y + r.h - E && Math.min(w.x1, w.x2) < r.x + r.w - E && Math.max(w.x1, w.x2) > r.x + E)) fail('يوجد جدار يقطع داخل غرفة.');
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), ops = m.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
    ops.forEach((o, i) => {
      if (o.pos * len - o.w / 2 < -E || o.pos * len + o.w / 2 > len + E || o.sill + o.h > w.h + E) fail('فتحة خارج حدود الجدار.');
      if (i && (o.pos - ops[i - 1].pos) * len < (o.w + ops[i - 1].w) / 2 - E) fail('فتحات متداخلة.');
      if (o.type === 'window' && w.type !== 'ext') fail('نافذة على جدار غير خارجي.');
    });
  }
  if (!errors.length && !m.topology) wallPieces(m).filter(p => p.bottom < 1.6 && p.bottom + p.height > 1.6).forEach(p => {
    const horizontal = Math.abs(Math.sin(p.angle)) < E;
    const r = { x: p.x - (horizontal ? p.length : p.thickness) / 2, y: p.y - (horizontal ? p.thickness : p.length) / 2, w: horizontal ? p.length : p.thickness, h: horizontal ? p.thickness : p.length };
    if (m.corridors.some(c => overlap(c, r))) fail('يوجد جدار يعوق المساحة الصافية للممر.');
  });
  const graph = new Map(), connect = (a, b) => { if (!graph.has(a)) graph.set(a, new Set()); graph.get(a).add(b); };
  [...m.links, ...m.openings.filter(o => o.type === 'door').map(o => o.connects)].forEach(pair => { if (pair?.length === 2) { connect(...pair); connect(pair[1], pair[0]); } });
  const reached = new Set(['outside']), queue = ['outside'];
  while (queue.length) for (const b of graph.get(queue.shift()) || []) if (!reached.has(b)) { reached.add(b); queue.push(b); }
  m.rooms.forEach(r => { if (!reached.has(r.id)) fail('لا يوجد مسار باب متصل بالمدخل للفراغ: ' + r.name); });
  return [...new Set(errors)];
}

// Exact wall pieces, with openings removed; consumed by both 3D and quantity take-off.
export function wallPieces(model) {
  const pieces = [];
  model.walls.forEach(w => {
    const length = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), ux = (w.x2 - w.x1) / length, uy = (w.y2 - w.y1) / length;
    const add = (start, end, bottom, height) => { if (end - start > E && height > E) pieces.push({ wallId: w.id, x: w.x1 + ux * (start + end) / 2, y: w.y1 + uy * (start + end) / 2, length: end - start, thickness: w.t, height, bottom, angle: Math.atan2(uy, ux), type: w.type }); };
    let cursor = 0;
    model.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos).forEach(o => {
      const start = o.pos * length - o.w / 2, end = o.pos * length + o.w / 2;
      add(cursor, start, 0, w.h); add(start, end, 0, o.sill); add(start, end, o.sill + o.h, w.h - o.sill - o.h); cursor = end;
    });
    add(cursor, length, 0, w.h);
  });
  return pieces;
}
export function quantities(model) {
  if (model.version === 2) return claudeQuantities(model);
  const netWallArea = sum(wallPieces(model), p => p.length * p.height);
  return { footprint: model.builtArea ?? model.building.w * model.building.h, rooms: sum(model.rooms, r => r.w * r.h), circulation: sum(model.corridors, r => r.w * r.h), reserve: sum(model.reserves, r => r.w * r.h), wallArea: netWallArea, finishArea: netWallArea * 2, wallVolume: sum(wallPieces(model), p => p.length * p.height * p.thickness), doors: model.openings.filter(o => o.type === 'door').length, windows: model.openings.filter(o => o.type === 'window').length, floors: 1 };
}
