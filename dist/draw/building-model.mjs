// النموذج الرأسي للمبنى من مستند المرسم (نقي: لا DOM ولا THREE): لكل دور منسوبه وارتفاعه، مقاطع الجدران
// المكتملة (wall-geometry)، الفراغات مصنّفة (مسقوفة/مكشوفة) ومغطاة بدور أعلى أم لا، وتصنيف وجهي كل جدار
// (داخلي/خارجي). هو أساس الواجهات والقطاع والموقع العام، ويتبع اصطلاحات المجسم ثلاثي الأبعاد (scene3d):
// منسوب الدور = منسوب أرضيته التشطيبية، وسقفه = بلاطة سماكتها SLAB تنتهي عند منسوب الدور الذي فوقه،
// والدروة فوق السقف المكشوف بارتفاع doc.roof.parapet، وأرض الموقع الطبيعية أدنى من ±0.00 بقيمة PLINTH.
import { buildWallSolids } from './wall-geometry.mjs';
import { analyzeWalls } from './topology.mjs';
import { ROOM_TYPES, roomTypeName } from './catalog.mjs';
import { add, mul, dot, pointInPolygon } from './geom.mjs';
import { stairLayout } from './stairs3d.mjs';
import { compassOf, SIDE_AR } from './digest.mjs';

/** افتراضات العرض الرأسي — مطابقة لقيم المجسم ثلاثي الأبعاد الافتراضية (scene3d DEFAULTS)، لا قيم كود. */
export const VERTICAL_DEFAULTS = Object.freeze({ slab: .2, plinth: .45, coping: .07 });

/** متجهات الجهات بمحاور المستند (y شمال المستند). */
export const SIDE_VECTORS = Object.freeze({ n: { x: 0, y: 1 }, s: { x: 0, y: -1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } });
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
/** يمين الناظر إلى الواجهة: perp(d) عكس عقارب الساعة. */
const rightOf = d => ({ x: -d.y, y: d.x });
const sideOfVec = v => Object.entries(SIDE_VECTORS).find(([, u]) => Math.abs(u.x - v.x) < 1e-9 && Math.abs(u.y - v.y) < 1e-9)?.[0];

/**
 * الواجهات الأربع: الأمامية جهة المدخل (doc.entries[0] أو doc.entry أو أول شارع، وإلا الجنوب)، الخلفية مقابلها،
 * واليمنى واليسرى بالنسبة لمن يقف أمام الواجهة الأمامية ناظرًا إليها.
 */
export function facadeSides(doc) {
  const f = [doc.entries?.[0], doc.entry, doc.streets?.[0]].find(s => SIDE_VECTORS[s]) || 's';
  const right = sideOfVec(rightOf(SIDE_VECTORS[f])), left = OPP[right];
  const name = s => SIDE_AR[compassOf(SIDE_VECTORS[s], doc.north || 0)] || '';
  const mk = (role, side, ar) => ({ role, side, vec: SIDE_VECTORS[side], ar, compassAr: name(side), title: `الواجهة ${ar} (${name(side)})` });
  return [mk('front', f, 'الأمامية'), mk('back', OPP[f], 'الخلفية'), mk('right', right, 'اليمنى'), mk('left', left, 'اليسرى')];
}

/** النموذج الرأسي: الأدوار ومقاطعها وفراغاتها. */
export function buildingModel(doc, opts = {}) {
  const slab = opts.slab ?? VERTICAL_DEFAULTS.slab, plinth = opts.plinth ?? VERTICAL_DEFAULTS.plinth;
  const parapet = doc.roof?.parapet ?? .9;
  const levelsDoc = doc.levels?.length ? doc.levels : [{ id: 'L1', name: 'الدور الأرضي', elevation: 0, height: 3.2 }];
  let acc = 0;
  const levels = levelsDoc.map((lv, i) => {
    const E = Number.isFinite(lv.elevation) && (i === 0 || lv.elevation > 0) ? lv.elevation : acc, H = lv.height || 3.2; acc = E + H;
    const walls = doc.walls.filter(w => w.level === lv.id);
    const openings = doc.openings.filter(o => o.level === lv.id || walls.some(w => w.id === o.wall));
    const solids = buildWallSolids(walls, openings, { levelHeight: H, defaultThickness: doc.settings?.defaultThickness });
    const analysis = analyzeWalls(walls);
    return { i, id: lv.id, name: lv.name, E, H, walls, openings, solids, analysis };
  });
  const inSpace = (p, s) => s.polygon && pointInPolygon(p, s.polygon, 1e-9) && !s.holes.some(h => pointInPolygon(p, h, 1e-9));
  for (const L of levels) {
    const labels = doc.labels.filter(l => l.level === L.id);
    L.spaces = L.analysis.spaces.filter(s => s.net).map(s => {
      const label = labels.find(l => inSpace(l.seed, s)) || null, type = label?.type || 'other';
      return { ...s, label, type, name: label?.name || roomTypeName(type), open: !!ROOM_TYPES[type]?.open };
    });
    const next = levels[L.i + 1];
    for (const s of L.spaces) s.covered = !!next && next.analysis.outlines.some(o => pointInPolygon(s.inside, o.polygon, 1e-9));
    L.locate = p => L.spaces.find(s => inSpace(p, s)) || null;
    L.coveredAt = p => !!next && next.analysis.outlines.some(o => pointInPolygon(p, o.polygon, 1e-9));
    const rise = next ? next.E - L.E : L.H;
    L.stairs = doc.stairs.filter(s => s.level === L.id).map(s => ({ stair: s, layout: stairLayout(s, rise), E: L.E, rise, toRoof: !next }));
    // كل مقطع: الفراغ على كل وجه، وهل الوجه خارجي (لا فراغ أو فراغ مكشوف)، وهل فوقه دروة
    for (const seg of L.solids.segments) {
      const mid = add(seg.a, mul(seg.dir, seg.length / 2)), off = seg.t / 2 + .09;
      seg.sideL = L.locate(add(mid, mul(seg.left, off))); seg.sideR = L.locate(add(mid, mul(seg.left, -off)));
      seg.extL = !seg.sideL || seg.sideL.open; seg.extR = !seg.sideR || seg.sideR.open;
      seg.fence = seg.kind === 'fence' || seg.kind === 'parapet';
      // الدروة: جدار بين فراغ مسقوف غير مغطى بدور أعلى والخارج (أو فناء مكشوف)
      const roofed = s => s && !s.open && !s.covered;
      seg.parapet = !seg.fence && parapet > 0 && ((seg.extL && roofed(seg.sideR)) || (seg.extR && roofed(seg.sideL)));
    }
  }
  const top = levels[levels.length - 1];
  const roofTop = top.E + top.H;
  return { doc, levels, slab, plinth, parapet, coping: VERTICAL_DEFAULTS.coping, ground: -plinth, roofTop, parapetTop: roofTop + parapet, inSpace };
}

/**
 * هندسة الواجهة: الوجوه الخارجية المتجهة نحو الناظر مُسقطة على مستوى الواجهة (u أفقي من يسار الناظر، z رأسي
 * بالمتر من ±0.00)، مرتبة من الأبعد إلى الأقرب (رسام: الأقرب يغطي الأبعد). كل وجه يحمل فتحاته.
 * @param {object} model ناتج buildingModel
 * @param {{side:string, vec:{x,y}}} facade
 */
export function elevationGeometry(model, facade) {
  const d = facade.vec, r = rightOf(d), faces = [];
  const U = p => dot(p, r), D = p => dot(p, d);
  for (const L of model.levels) {
    for (const seg of L.solids.segments) {
      const sides = [];
      if (seg.extL) sides.push({ n: seg.left, A: seg.corners.aL, B: seg.corners.bL, side: 'L' });
      if (seg.extR) sides.push({ n: mul(seg.left, -1), A: seg.corners.aR, B: seg.corners.bR, side: 'R' });
      for (const s of sides) {
        const facing = dot(s.n, d);
        if (facing < .2) continue; // وجه لا يقابل الناظر
        const ua = U(s.A), ub = U(s.B), u0 = Math.min(ua, ub), u1 = Math.max(ua, ub);
        if (u1 - u0 < .02) continue;
        const z0 = L.i === 0 ? model.ground : L.E, z1 = L.E + seg.h;
        const flip = ua > ub; // اتجاه المقطع على الواجهة
        const openings = seg.openings.map(o => {
          const p0 = add(seg.a, mul(seg.dir, o.x0)), p1 = add(seg.a, mul(seg.dir, o.x1));
          const a = U(p0), b = U(p1);
          return { id: o.id, kind: o.kind, entry: o.entry, u0: Math.min(a, b), u1: Math.max(a, b), z0: L.E + o.z0, z1: L.E + o.z1, w: o.w, h: o.h, sill: o.z0, hinge: o.hinge, flip, level: L.id };
        });
        const z1p = seg.parapet ? L.E + L.H + model.parapet : z1;
        faces.push({ level: L.id, levelIndex: L.i, segId: seg.id, segIds: [seg.id], wallIds: [...seg.wallIds], kind: seg.fence ? 'fence' : 'wall', parapet: !!seg.parapet, u0, u1, z0, z1: Math.max(z1, z1p),
          depth: (D(s.A) + D(s.B)) / 2, facing, openings });
      }
    }
  }
  // دمج الوجوه المتجاورة على المستوى نفسه (جدار واحد قُطع عند تقاطعات الجدران الداخلية) حتى لا تظهر خطوط وهمية
  const key = f => [f.level, f.kind, f.parapet, Math.round(f.depth * 50), Math.round(f.z0 * 1000), Math.round(f.z1 * 1000)].join('|');
  const groups = new Map();
  for (const f of faces) { const kf = key(f); if (!groups.has(kf)) groups.set(kf, []); groups.get(kf).push(f); }
  const merged = [];
  for (const list of groups.values()) {
    list.sort((p, q) => p.u0 - q.u0);
    let cur = null;
    for (const f of list) {
      if (cur && f.u0 <= cur.u1 + .03) { cur.u1 = Math.max(cur.u1, f.u1); cur.segIds.push(...f.segIds); cur.wallIds.push(...f.wallIds); cur.openings.push(...f.openings); cur.depth = (cur.depth + f.depth) / 2; }
      else { if (cur) merged.push(cur); cur = { ...f, segIds: [...f.segIds], wallIds: [...f.wallIds], openings: [...f.openings] }; }
    }
    if (cur) merged.push(cur);
  }
  faces.length = 0; faces.push(...merged);
  faces.sort((p, q) => p.depth - q.depth || p.z0 - q.z0);
  // فتحة محجوبة بالكامل بوجه أقرب (فناء خلف جناح، أو خلف سور) لا تُعد من فتحات هذه الواجهة الظاهرة
  const e = .01;
  for (const f of faces) for (const o of f.openings) {
    const by = faces.find(g => g !== f && g.depth > f.depth + .05 && g.u0 <= o.u0 + e && g.u1 >= o.u1 - e && g.z0 <= o.z0 + e && g.z1 >= o.z1 - e);
    o.hidden = !!by; o.outer = !by && f.facing > .2;
  }
  const walls = faces.filter(f => f.kind !== 'fence');
  const ext = faces.length ? { u0: Math.min(...faces.map(f => f.u0)), u1: Math.max(...faces.map(f => f.u1)), z0: model.ground, z1: Math.max(...faces.map(f => f.z1)) } : null;
  const bext = walls.length ? { u0: Math.min(...walls.map(f => f.u0)), u1: Math.max(...walls.map(f => f.u1)) } : ext;
  return { facade, faces, extent: ext, buildingExtent: bext, openings: faces.flatMap(f => f.openings.map(o => ({ ...o, face: f.segId, depth: f.depth }))), visible: faces.flatMap(f => f.openings.filter(o => !o.hidden).map(o => o.id)) };
}

export default { VERTICAL_DEFAULTS, SIDE_VECTORS, facadeSides, buildingModel, elevationGeometry };
