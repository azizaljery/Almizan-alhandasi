// الاتجاه المعاكس لـ import-legacy.mjs: من مستند المرسم (mizan-draw/1) إلى نموذج المخطط القديم،
// حتى يستطيع التقييم والمقارنة والتصدير القائمة (assessPlan، mizan-score، quantities) أن تعمل على ما رسمه العميل
// بعد التعديل، لا على ما ولّده المحرك فقط. (G3 في تدقيق التكامل، وAR-01 في ملف MIZAN.)
//
// قواعد الصدق:
//  - لا يُخفى أي فقد: كل ما لا يُترجم يُسجَّل في report (غرفة غير مستطيلة، فراغ بلا اسم، فتحة بلا جدار...).
//  - «البرنامج» في النموذج الناتج هو ما رُسم فعلًا (الغرف المسمّاة)، لا ما طُلب أصلًا؛ لذلك يُعلن ذلك في report.program.
//  - لا يُصلح هذا التحويل الهندسة: إن كانت الجدران تقطع غرفة أو الباب لا يفتح بين فراغين، يُعاد ذلك كما هو
//    في report.validation من validateModel نفسه.
// نقي: لا DOM ولا تخزين.
import { analyzeWalls, exteriorWallIds } from './topology.mjs';
import { pointInPolygon } from './geom.mjs';
import { ROOM_TYPES, LEGACY_TYPES, LEVEL_DEFAULT_HEIGHT } from './catalog.mjs';
import { validateModel, footprint as plotFootprint, validatePlot } from '../planner.mjs';

const finite = (...v) => v.every(x => typeof x === 'number' && Number.isFinite(x));
const r3 = v => Math.round(v * 1000) / 1000;
const EDGE_TOL = 0.02;

/** ما لا يعرفه المحرك القديم من أنواع الغرف يُحوَّل إلى أقرب نوع معروف ويُعلن. */
const LEGACY_TYPE_MAP = Object.freeze({
  master: 'bedroom', laundry: 'service', entrance: 'service', garage: 'service', balcony: 'service', stairs: 'service', other: 'service',
});

function bbox(poly) {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
const polyArea = poly => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + (p.x * q.y - q.x * p.y); }, 0)) / 2;
const axisAligned = poly => poly.every((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.abs(p.x - q.x) <= EDGE_TOL || Math.abs(p.y - q.y) <= EDGE_TOL; });
const isRectPoly = poly => poly && poly.length >= 4 && axisAligned(poly) && Math.abs(polyArea(poly) - bbox(poly).w * bbox(poly).h) <= Math.max(0.02, bbox(poly).w * bbox(poly).h * 0.01);
/** يقسّم مضلّعًا متعامدًا (بلا ثقوب) إلى مستطيلات متجاورة بلا تداخل: يأخذ الأكبر مساحةً من خلايا الشبكة الباقية في كل مرة (فالممر الرئيسي يبقى قطعة واحدة). */
function decomposeRect(poly) {
  const xs = [...new Set(poly.map(p => r3(p.x)))].sort((a, b) => a - b), ys = [...new Set(poly.map(p => r3(p.y)))].sort((a, b) => a - b);
  const nx = xs.length - 1, ny = ys.length - 1;
  const cell = Array.from({ length: ny }, (_, j) => Array.from({ length: nx }, (_, i) => pointInPolygon({ x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }, poly)));
  const out = [];
  for (;;) {
    let best = null;
    for (let j0 = 0; j0 < ny; j0++) for (let i0 = 0; i0 < nx; i0++) {
      if (!cell[j0][i0]) continue;
      let maxI = nx;
      for (let j1 = j0; j1 < ny && cell[j1][i0]; j1++) {
        let i1 = i0; while (i1 < maxI && cell[j1][i1]) i1++;
        maxI = i1; const area = (xs[maxI] - xs[i0]) * (ys[j1 + 1] - ys[j0]);
        if (!best || area > best.area + 1e-9) best = { area, i0, i1: maxI, j0, j1: j1 + 1 };
      }
    }
    if (!best) break;
    for (let j = best.j0; j < best.j1; j++) for (let i = best.i0; i < best.i1; i++) cell[j][i] = false;
    out.push({ x: r3(xs[best.i0]), y: r3(ys[best.j0]), w: r3(xs[best.i1] - xs[best.i0]), h: r3(ys[best.j1] - ys[best.j0]) });
  }
  return out;
}
/** شرائح أفقية أو رأسية: كل صف (أو عمود) من الخلايا يُدمج مع التالي إن تطابق امتداده. */
function slabs(poly, vertical) {
  const xs = [...new Set(poly.map(p => r3(p.x)))].sort((a, b) => a - b), ys = [...new Set(poly.map(p => r3(p.y)))].sort((a, b) => a - b);
  const nx = xs.length - 1, ny = ys.length - 1;
  const inCell = (i, j) => pointInPolygon({ x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }, poly);
  const out = [];
  const outer = vertical ? nx : ny, inner = vertical ? ny : nx;
  let open = [];
  for (let a = 0; a < outer; a++) {
    const runs = []; let start = -1;
    for (let b = 0; b <= inner; b++) {
      const on = b < inner && (vertical ? inCell(a, b) : inCell(b, a));
      if (on && start < 0) start = b; if (!on && start >= 0) { runs.push([start, b]); start = -1; }
    }
    const next = [];
    for (const [b0, b1] of runs) {
      const prev = open.find(o => o.b0 === b0 && o.b1 === b1 && o.a1 === a);
      if (prev) { prev.a1 = a + 1; next.push(prev); } else { const o = { a0: a, a1: a + 1, b0, b1 }; next.push(o); out.push(o); }
    }
    open = next;
  }
  return out.map(o => vertical
    ? { x: r3(xs[o.a0]), y: r3(ys[o.b0]), w: r3(xs[o.a1] - xs[o.a0]), h: r3(ys[o.b1] - ys[o.b0]) }
    : { x: r3(xs[o.b0]), y: r3(ys[o.a0]), w: r3(xs[o.b1] - xs[o.b0]), h: r3(ys[o.a1] - ys[o.a0]) });
}
const BRANCH = 1.2;
/** يختار أفضل تقسيم: أقل أبواب تقع عبر قطعتين، ثم أقل روابط ضعيفة، ثم أقل قطع. probes: مجموعات نقاط يجب أن تقع داخل قطعة واحدة. */
function chooseDecomposition(poly, probes) {
  const cands = [decomposeRect(poly), slabs(poly, true), slabs(poly, false)];
  const grade = parts => {
    let bad = 0;
    for (const set of probes) if (!parts.some(rc => set.every(pt => inRect(rc, pt)))) bad++;
    let weak = 0, linked = 0;
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      const sx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), sy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if ((sx >= -1e-3 && sy > 1e-3) || (sy >= -1e-3 && sx > 1e-3)) { linked++; if (!((sx >= -1e-3 && sy >= BRANCH - 0.01) || (sy >= -1e-3 && sx >= BRANCH - 0.01))) weak++; }
    }
    return [bad, weak, parts.length];
  };
  return cands.map(c => ({ c, g: grade(c) })).sort((p, q) => p.g[0] - q.g[0] || p.g[1] - q.g[1] || p.g[2] - q.g[2])[0].c;
}
const inRect = (r, p) => p.x >= r.x - 1e-6 && p.x <= r.x + r.w + 1e-6 && p.y >= r.y - 1e-6 && p.y <= r.y + r.h + 1e-6;

/**
 * الدور العلوي لا مدخل له من الخارج: الوصول إليه من السلم. لذلك تُستبدل أخطاء «لا مسار إلى المدخل» (التي تبدأ من باب خارجي)
 * بفحص مكافئ يبدأ من غرفة السلم: كل فراغ يُوصل إليه بالأبواب والروابط. إن لم يوجد سلم في الدور بقيت الأخطاء كما هي.
 * بقية الأخطاء (تداخل، أبواب لا تفتح، ...) تبقى دون تغيير. مسار الحركة الفعلي (circulationNetwork) لا يُفحص هنا.
 */
function upperLevelValidation(model, report, labels) {
  const stairIds = labels.filter(l => l.type === 'stairs').map(l => l.id).filter(id => model.rooms.some(r => r.id === id) || model.corridors.some(c => c.id === id));
  if (!stairIds.length) return report.validation;
  const reach = e => e.startsWith('لا يوجد مسار باب متصل بالمدخل') || e.startsWith('لا يوجد مسار حركة فعلي');
  const rest = report.validation.filter(e => !reach(e));
  const graph = new Map(), link = (a, b) => { if (!graph.has(a)) graph.set(a, new Set()); graph.get(a).add(b); };
  for (const [a, b] of [...model.links, ...model.openings.filter(o => o.type === 'door').map(o => o.connects)]) if (a && b) { link(a, b); link(b, a); }
  const seen = new Set(stairIds), queue = [...stairIds];
  while (queue.length) for (const n of graph.get(queue.shift()) || []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  report.arrival = 'stairs';
  return [...rest, ...model.rooms.filter(r => !seen.has(r.id)).map(r => 'لا يصل السلم إلى الفراغ: ' + r.name)];
}

/**
 * @param {object} doc  مستند صالح (mizan-draw/1)
 * @param {{ level?: string }} [opts]  الدور المطلوب تحويله (الأول افتراضيًا)
 * @returns {{ model: object, report: object }}
 */
export function docToLegacy(doc, { level } = {}) {
  const lvl = doc.levels.find(l => l.id === (level || doc.levels[0].id));
  if (!lvl) throw Error('الدور المطلوب غير موجود في المستند.');
  const report = { level: lvl.id, rooms: 0, corridors: 0, courtyards: 0, walls: 0, openings: 0, skipped: [], unnamed: [], typeMapped: [], warnings: [], program: 'مستخرج من الغرف المرسومة لا من الطلب الأصلي', validation: [] };
  const walls = doc.walls.filter(w => w.level === lvl.id);
  if (!walls.length) throw Error('لا توجد جدران في هذا الدور.');
  const analysis = analyzeWalls(walls);
  if (analysis.gaps.length) report.warnings.push(`${analysis.gaps.length} فجوة بين الجدران؛ قد لا تُغلق غرف.`);

  // نقاط الفحص نفسها التي يستعملها validateModel لكل باب: ثلاث نقاط على كل جانب
  const probes = [];
  for (const o of doc.openings.filter(x => x.level === lvl.id && x.kind !== 'window' && x.kind !== 'window2')) {
    const w = walls.find(x => x.id === o.wall); if (!w) continue;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), dx = (w.b.x - w.a.x) / len, dy = (w.b.y - w.a.y) / len, off = w.t / 2 + 0.02;
    const cx = w.a.x + dx * o.at, cy = w.a.y + dy * o.at;
    for (const sg of [1, -1]) probes.push([-o.w / 2 + 0.02, 0, o.w / 2 - 0.02].map(al => ({ x: cx + dx * al - sg * dy * off, y: cy + dy * al + sg * dx * off })));
  }

  // 1) الفراغات المسمّاة -> مستطيلات صافية
  const labels = doc.labels.filter(l => l.level === lvl.id);
  const rooms = [], corridors = [], courtyards = [], used = new Set();
  labels.forEach((label, i) => {
    const space = analysis.spaces.find(s => s.net && pointInPolygon(label.seed, s.net));
    if (!space) { report.skipped.push(`«${label.name}»: لا يقع داخل فراغ مغلق.`); return; }
    if (used.has(space.id)) { report.warnings.push(`«${label.name}» داخل فراغ سُمّي سابقًا؛ لم يُحسب مرتين.`); return; }
    used.add(space.id);
    const docType = ROOM_TYPES[label.type] ? label.type : 'other';
    if (docType === 'corridor' && !isRectPoly(space.net) && axisAligned(space.net) && !(space.holes || []).length) {
      // ممر على شكل L أو T أو غيره: يُقسَّم إلى مستطيلات مترابطة كما يفعل المحرك القديم (ممر رئيسي + فرعية)
      let parts = chooseDecomposition(space.net, probes.filter(set => pointInPolygon(set[1], space.net)));
      const slivers = parts.filter(rc => Math.min(rc.w, rc.h) < 0.3);
      if (slivers.length && slivers.length < parts.length) {
        report.warnings.push(`«${label.name}»: أُهملت ${slivers.length} شريحة أضيق من 30 سم (${r3(slivers.reduce((a, rc) => a + rc.w * rc.h, 0))} م²) لأنها ليست ممرًا.`);
        parts = parts.filter(rc => !slivers.includes(rc));
      }
      parts.forEach((rc, k) => corridors.push({ id: parts.length === 1 ? label.id : `${label.id}-${k + 1}`, name: label.name, ...rc, group: label.id }));
      report.corridors++; if (parts.length > 1) report.warnings.push(`«${label.name}» قُسِّم إلى ${parts.length} مستطيلات مترابطة.`);
      return;
    }
    if (!isRectPoly(space.net)) { report.skipped.push(`«${label.name}»: الفراغ غير مستطيل؛ النموذج القديم يتعامل مع المستطيلات فقط.`); return; }
    const b = bbox(space.net), rect = { x: r3(b.x), y: r3(b.y), w: r3(b.w), h: r3(b.h) };
    if (docType === 'corridor') { corridors.push({ id: label.id, name: label.name, ...rect }); report.corridors++; return; }
    if (docType === 'courtyard') { courtyards.push({ id: label.id, name: label.name, ...rect }); report.courtyards++; return; }
    let type = docType;
    if (!LEGACY_TYPES.includes(type)) { type = LEGACY_TYPE_MAP[type] || 'service'; report.typeMapped.push(`${label.name}: ${docType} ← ${type}`); }
    const area = rect.w * rect.h;
    rooms.push({ id: label.id, name: label.name, type, area, targetArea: area, position: 'middle', side: 'any', resolvedSide: 'any', ...rect });
    report.rooms++; void i;
  });
  for (const s of analysis.spaces) if (!used.has(s.id) && s.net && s.area >= 1) report.unnamed.push({ space: s.id, area: r3(s.area) });
  if (report.unnamed.length) report.warnings.push(`${report.unnamed.length} فراغ مغلق بلا اسم لم يدخل النموذج.`);

  const links = [];
  for (let i = 0; i < corridors.length; i++) for (let j = i + 1; j < corridors.length; j++) {
    const a = corridors[i], b = corridors[j]; if (!a.group || a.group !== b.group) continue;
    const sx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), sy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if ((sx >= -1e-3 && sy > 1e-3) || (sy >= -1e-3 && sx > 1e-3)) links.push([a.id, b.id]);
  }
  corridors.forEach(c => { delete c.group; });

  // 2) الجدران
  const ext = exteriorWallIds(analysis), h0 = lvl.height || LEVEL_DEFAULT_HEIGHT;
  const outLegacy = walls.map(w => ({ id: w.id, x1: r3(w.a.x), y1: r3(w.a.y), x2: r3(w.b.x), y2: r3(w.b.y), type: ext.has(w.id) ? 'ext' : 'int', t: w.t, h: finite(w.h) ? w.h : h0 }));
  const wallById = new Map(outLegacy.map(w => [w.id, w]));
  report.walls = outLegacy.length;

  // 3) الفتحات: pos كنسبة من طول الجدار، وconnects من الفراغين على جانبي الباب
  const nodeAt = p => [...rooms, ...corridors].find(n => inRect(n, p)) || courtyards.find(n => inRect(n, p)) || null;
  const openings = [];
  for (const o of doc.openings.filter(x => x.level === lvl.id)) {
    const w = wallById.get(o.wall);
    if (!w) { report.skipped.push(`فتحة ${o.id}: جدارها غير موجود في هذا الدور.`); continue; }
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), dx = (w.x2 - w.x1) / len, dy = (w.y2 - w.y1) / len;
    const cx = w.x1 + dx * o.at, cy = w.y1 + dy * o.at, off = w.t / 2 + 0.05;
    const sideA = nodeAt({ x: cx - dy * off, y: cy + dx * off }), sideB = nodeAt({ x: cx + dy * off, y: cy - dx * off });
    const isWindow = o.kind === 'window' || o.kind === 'window2';
    const base = { id: o.id, wallId: o.wall, pos: r3(o.at / len), w: o.w, h: o.h, sill: isWindow ? o.sill : 0 };
    if (isWindow) {
      const room = (sideA && !sideB) ? sideA : (sideB && !sideA) ? sideB : (sideA || sideB);
      openings.push({ ...base, type: 'window', ...(room ? { roomId: room.id } : {}) });
    } else {
      const a = sideA?.id ?? 'outside', b = sideB?.id ?? 'outside';
      const connects = o.entry && a !== 'outside' && b !== 'outside' ? [a, 'outside'] : [a, b];
      const door = { ...base, type: 'door', connects };
      if (o.kind === 'arch') door.openPlan = true;
      openings.push(door);
    }
    report.openings++;
  }

  // 4) الأرض والكتلة (من وثيقة الأرض نفسها)
  const poly = doc.plot?.polygon;
  let plot = null, fp = null;
  if (Array.isArray(poly) && poly.length >= 3) {
    const pb = bbox(poly), streets = Object.fromEntries(['n', 's', 'e', 'w'].map(s => [s, (doc.streets || []).includes(s)]));
    try {
      plot = validatePlot({ width: r3(pb.w), length: r3(pb.h), floors: doc.levels.length, streets, entry: doc.entry || (doc.entries || [])[0] || 's' });
      fp = plotFootprint(plot);
    } catch (e) { report.warnings.push('تعذّر بناء الأرض: ' + e.message); }
  } else report.warnings.push('لا توجد أرض محدّدة في المستند؛ لم يُحسب حدّ البناء.');
  const outline = analysis.outlines[0]?.polygon;
  const building = outline ? (b => ({ x: r3(b.x), y: r3(b.y), w: r3(b.w), h: r3(b.h) }))(bbox(outline)) : null;
  if (!building) report.warnings.push('لا يوجد محيط مبنى مغلق.');

  const model = {
    plot, footprint: fp, building, builtArea: building ? r3(building.w * building.h) : null, shape: 'rect',
    program: rooms.map(r => ({ id: r.id, name: r.name, type: r.type, area: r.area, position: 'middle', side: 'any' })),
    rooms, corridors, reserves: [], courtyards, links, walls: outLegacy, openings, warnings: [], strategy: 'drawing',
  };
  if (plot && fp && building) {
    try { report.validation = validateModel(model); } catch (e) { report.validation = ['تعذّر التحقق: ' + e.message]; }
    if (lvl.elevation > 0) report.validation = upperLevelValidation(model, report, labels);
  }
  else report.validation = ['لم يكتمل بناء النموذج (أرض أو محيط ناقص)؛ لم يُتحقَّق منه.'];
  return { model, report };
}

export default { docToLegacy };
