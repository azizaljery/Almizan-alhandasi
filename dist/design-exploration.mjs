/** Architectural search around the frozen geometry solver. No room areas are relaxed.
 * Search envelopes are subsets of the user's buildable area; only translation is
 * applied to the solver output. Walls, openings and circulation stay metric-exact.
 */
import { generateModelLegacy } from './claude/compat-layer.mjs';
import { footprint, normalizeRooms, validatePlot, polygonArea } from './claude/planner.mjs';

export const DIVERSITY_THRESHOLD = .12;
export const MAX_ALTERNATIVES = 6;
const roles = { majlis: 0, dining: 0, living: 1, bedroom: 1, kitchen: 2, bath: 2 };
const concepts = [
  { tag: 'أجنحة حسب الاستخدام', idea: 'يجرب تجميع غرف الاستخدام المتقارب في جانب واحد من الرواق.', bestFor: 'مقارنة فصل الأنشطة اليومية', tradeoff: 'قد يزيد عمق بعض الأجنحة' },
  { tag: 'خدمات مجمّعة', idea: 'يجرب تجميع المطبخ والحمامات في جانب، مع إعادة توزيع الفراغات الحرة.', bestFor: 'مقارنة توزيع الخدمات', tradeoff: 'التجميع التخطيطي لا يثبت صلاحية تمديدات الخدمات' },
  { tag: 'توازن بين الأجنحة', idea: 'يبحث في تقسيمات مختلفة للفراغات بين الأجنحة بدل تكرار التقسيم نفسه.', bestFor: 'توزيع الأحمال الوظيفية بين الجانبين', tradeoff: 'قد تتغير مسافات الحركة بين الغرف' },
];
function random(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function explorationSpecs(seed = 1, { routeFocused = false } = {}) {
  const specs = ['rect', 'l', 'u'].map(shape => ({ shape, key: `${shape}-baseline`, mode: -1, widthRatio: 1, seed }));
  const rng = random(seed);
  for (let i = 0; i < 12; i++) {
    const widthRatio = [.48, .6, .74, .88, 1][i % 5];
    for (const shape of ['rect', 'l', 'u']) specs.push({ shape, key: `${shape}-explore-${seed}-${i}`, mode: i % 3, widthRatio, seed: Math.floor(rng() * 0xFFFFFFFF) });
  }
  // Deterministic functional zoning variants keep room identities/dimensions fixed,
  // but test additional side assignments when circulation is an explicit goal.
  if (routeFocused) {
    for (const mode of [3, 4, 5]) for (const shape of ['rect', 'l', 'u']) {
      specs.push({ shape, key: `${shape}-route-mode-${mode}-${seed}`, mode, widthRatio: 1,
        seed: (seed + mode * 131 + shape.charCodeAt(0) * 17) >>> 0 });
    }
  }
  return specs;
}
export function conceptFor(spec, shape) {
  const form = { rect: 'كتلة واحدة ورواق مركزي', l: 'جناحان حول حديقة جانبية', u: 'أجنحة تحيط بباحة مفتوحة' }[shape];
  const base = concepts[spec.mode >= 3 ? (spec.mode - 3) % concepts.length : Math.max(0, spec.mode)];
  return { ...base, tag: spec.mode < 0 ? 'التوزيع المرجعي' : base.tag,
    form, massing: shape, idea: spec.mode < 0 ? 'توزيع للمقارنة مع الأفكار الجديدة تحت المتطلبات نفسها.' : base.idea + (spec.widthRatio < .8 ? ' ويختبر كتلة أضيق وأكثر عمقًا ضمن الأرض.' : '') };
}
export function exploreGeometry(plot, rooms, shape, spec, strategy) {
  const original = normalizeRooms(rooms), rng = random(spec.seed);
  const assigned = original.map(r => {
    if (spec.mode < 0 || r.side !== 'any' || (shape === 'u' && r.position !== 'back' && r.area < 12)) return r;
    const role = roles[r.type] ?? 1;
    const left = spec.mode === 0 ? role !== 1 : spec.mode === 1 ? role === 2
      : spec.mode === 3 ? role === 0 : spec.mode === 4 ? role === 1
        : spec.mode === 5 ? role === 2 : rng() < .5;
    return { ...r, side: left ? 'left' : 'right' };
  });
  let m;
  if (spec.mode < 0) m = generateModelLegacy(plot, assigned, { strategy, allowFallback: false });
  else {
    const f = footprint(plot), sideways = ['e', 'w'].includes(plot.entry);
    const w = f.w * (sideways ? 1 : spec.widthRatio), h = f.h * (sideways ? spec.widthRatio : 1);
    const searchPlot = { ...plot, width: w / Math.sqrt(.9), length: h / Math.sqrt(.9), streetSetback: 0, neighborSetback: 0, coverage: .9 };
    m = generateModelLegacy(searchPlot, assigned, { strategy, allowFallback: false });
    const sf = m.footprint, dx = f.x + (f.w - sf.w) / 2 - sf.x, dy = f.y + (f.h - sf.h) / 2 - sf.y;
    const rect = r => ({ ...r, x: r.x + dx, y: r.y + dy });
    for (const key of ['rooms', 'corridors', 'reserves', 'courtyards', 'massingParts']) if (m[key]) m[key] = m[key].map(rect);
    m.building = rect(m.building); m.boundingBox = rect(m.boundingBox);
    m.buildingFootprint = m.buildingFootprint.map(rect);
    m.walls = m.walls.map(r => ({ ...r, x1: r.x1 + dx, x2: r.x2 + dx, y1: r.y1 + dy, y2: r.y2 + dy }));
    m.plot = { ...validatePlot({ ...plot, shape }), maxBuiltArea: plot.maxBuiltAreaM2 ?? plot.maxBuiltArea ?? null };
    m.footprint = f;
  }
  // The untouched client program is authoritative, including explicit sides. Native
  // L wings may discard side requests; restoring them makes the validation gate reject it.
  m.program = original;
  m.rooms = m.rooms.map(r => ({ ...r, side: original.find(p => p.id === r.id).side, position: original.find(p => p.id === r.id).position }));
  return m;
}

/** Invariant to translation, rotation, reflection and permutation of equal-type/area
 * rooms. Colours, labels, IDs and absolute site location cannot earn diversity. */
export function layoutDescriptor(m) {
  // Imported legacy recipes can lack a polygon. Measure their real rectangles and
  // documented void area without invoking a newer model's quantity contract.
  const sumArea = rows => (rows || []).reduce((s, r) => s + r.w * r.h, 0);
  const courtyard = sumArea(m.courtyards);
  const q = { footprint: m.buildingFootprint ? polygonArea(m.buildingFootprint) : m.builtArea ?? m.building.w * m.building.h - courtyard,
    courtyard, circulation: sumArea(m.corridors), rooms: sumArea(m.rooms), reserve: sumArea(m.reserves) };
  const scale = Math.sqrt(q.footprint), groups = new Map(), aspectGroups = new Map();
  const key = r => `${r.type}:${r.targetArea ?? r.area}`;
  const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  for (const r of m.rooms) add(aspectGroups, key(r), Math.abs(Math.log(r.w / r.h)));
  m.rooms.forEach((a, i) => m.rooms.slice(i + 1).forEach(b => add(groups, [key(a), key(b)].sort().join('|'), Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) / scale)));
  const flatten = map => [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, values]) => values.sort((a, b) => a - b));
  return { shape: m.shape || (courtyard ? 'u' : 'rect'), pairs: flatten(groups), aspects: flatten(aspectGroups), mass: [Math.abs(Math.log(m.building.w / m.building.h)), q.courtyard / q.footprint, q.circulation / q.rooms, q.reserve / q.rooms] };
}
const rms = (a, b) => a.length && a.length === b.length ? Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length) : a.length === b.length ? 0 : 1;
export function layoutDistance(a, b) {
  return Math.max(a.shape === b.shape ? 0 : .4, rms(a.pairs, b.pairs) * 2, rms(a.aspects, b.aspects) * .5, rms(a.mass, b.mass) * .5);
}
export function selectDiverseWithEvidence(candidates, previous = [], limit = MAX_ALTERNATIVES, prioritizedCandidateIds = []) {
  const history = previous.map(m => layoutDescriptor(m));
  const remaining = candidates.map(c => ({ ...c, descriptor: layoutDescriptor(c.candidate.geometry) }));
  const chosen = [], rejections = [];
  const assess = candidate => {
    const historyDistance = history.length ? Math.min(...history.map(d => layoutDistance(candidate.descriptor, d))) : Infinity;
    const batchDistance = chosen.length ? Math.min(...chosen.map(c => layoutDistance(candidate.descriptor, c.descriptor))) : Infinity;
    const reason = historyDistance + 1e-9 < DIVERSITY_THRESHOLD ? 'HISTORY_SIMILARITY'
      : batchDistance + 1e-9 < DIVERSITY_THRESHOLD ? 'BATCH_SIMILARITY' : null;
    return { reason, distance: Math.min(historyDistance, batchDistance), historyDistance, batchDistance };
  };
  const record = (candidate, check, reason = check.reason) => rejections.push({
    candidateId: candidate.candidate.candidateId ?? null, reason,
    distance: Number.isFinite(check.distance) ? check.distance : null,
    historyDistance: Number.isFinite(check.historyDistance) ? check.historyDistance : null,
    batchDistance: Number.isFinite(check.batchDistance) ? check.batchDistance : null,
    threshold: DIVERSITY_THRESHOLD,
  });
  // Priority changes order only. Every candidate must clear exactly the same
  // historical and within-batch distance gate before it can be selected.
  for (const id of new Set(prioritizedCandidateIds)) {
    if (chosen.length >= limit) break;
    const index = remaining.findIndex(c => c.candidate.candidateId === id);
    if (index < 0) continue;
    const candidate = remaining.splice(index, 1)[0], check = assess(candidate);
    if (check.reason) record(candidate, check);
    else chosen.push(candidate);
  }
  while (chosen.length < limit && remaining.length) {
    let best = -1, score = -1;
    remaining.forEach((candidate, i) => {
      const check = assess(candidate);
      const distance = check.distance === Infinity ? 1 : check.distance;
      if (!check.reason && distance > score) { best = i; score = distance; }
    });
    if (best < 0) break;
    chosen.push(remaining.splice(best, 1)[0]);
  }
  for (const candidate of remaining) {
    const check = assess(candidate);
    record(candidate, check, check.reason || 'LIMIT_REACHED');
  }
  const count = reason => rejections.filter(row => row.reason === reason).length;
  return { selected: chosen, rejections, summary: {
    generated: candidates.length, selected: chosen.length,
    excludedHistory: count('HISTORY_SIMILARITY'), excludedBatch: count('BATCH_SIMILARITY'),
    limitDeferred: count('LIMIT_REACHED'), threshold: DIVERSITY_THRESHOLD,
  } };
}
export function selectDiverse(candidates, previous = [], limit = MAX_ALTERNATIVES, prioritizedCandidateIds = []) {
  return selectDiverseWithEvidence(candidates, previous, limit, prioritizedCandidateIds).selected;
}
