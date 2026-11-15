// كاميرا المنظور الداخلي (نقية): نقطة وقوف واتجاه ومجال رؤية لغرفة مؤثثة، وإسقاط معالم الغرفة (فتحات وقطع رئيسية) على الصورة.
// بمستوى العين (1.45 م)، زاوية أفقية واسعة (78° افتراضيًا)، بلا ميل (خطوط رأسية مستقيمة). الاتجاه 0 = +y ويزداد مع عقارب الساعة (كالعارض).
import { pointInPolygon } from '../draw/geom.mjs';
import { fixtureCorners } from './staging.mjs';

export const INTERIOR_CAMERA = Object.freeze({ eye: 1.45, hfov: 78, hfovs: Object.freeze([78, 88]), aspect: 1.5, wallClear: .5, itemClear: .4, minDepth: 2.2, step: .4, headingStep: 10 });
const RAD = Math.PI / 180;
export const vfovOf = (hfov, aspect) => 2 * Math.atan(Math.tan(hfov * RAD / 2) / aspect) / RAD;

/** مسقط ثقب الإبرة: (x,y,z) بمحاور المستند (z للأعلى بالمتر من الأرض) → { u, v, depth } بإحداثيات الصورة 0..1 (u يمينًا، v للأسفل). */
export function pinhole(cam) {
  const h = cam.headingDeg * RAD, fx = Math.sin(h), fy = Math.cos(h), rx = Math.cos(h), ry = -Math.sin(h);
  const th = Math.tan(cam.hfov * RAD / 2), tv = th / cam.aspect;
  return (x, y, z) => { const dx = x - cam.x, dy = y - cam.y, depth = dx * fx + dy * fy; if (depth < .05) return { u: NaN, v: NaN, depth }; return { u: .5 + (dx * rx + dy * ry) / depth / (2 * th), v: .5 - (z - cam.eye) / depth / (2 * tv), depth }; };
}
function rayDist(poly, p, a) {
  const dx = Math.sin(a), dy = Math.cos(a); let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length], ex = B.x - A.x, ey = B.y - A.y, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
    const t = ((A.x - p.x) * ey - (A.y - p.y) * ex) / den, u = ((A.x - p.x) * dy - (A.y - p.y) * dx) / den;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}
const distEdge = (poly, p) => { let m = Infinity; for (let i = 0; i < poly.length; i++) { const A = poly[i], B = poly[(i + 1) % poly.length], dx = B.x - A.x, dy = B.y - A.y, k = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(p.x - A.x - k * dx, p.y - A.y - k * dy)); } return m; };
const ROLE_W = { seat: 1, sofa: 2.2, bed: 3, tv: 1.2, table: .8, chair: .7, nightstand: .4, wardrobe: 1, decor: .1 };

/** يختار نقطة وقوف واتجاهًا لغرفة مؤثثة (staged من stageRoom). يعيد { x, y, headingDeg, eye, hfov, vfov, aspect, score, visible } أو null. */
export function planInteriorCamera(staged, opt = {}) {
  const C = { ...INTERIOR_CAMERA, ...opt }, poly = staged.room.polygon, b = staged.room.bounds, items = staged.items.filter(i => i.kind !== 'rug');
  const boxes = items.map(i => fixtureCorners(i)), fovs = opt.hfov ? [opt.hfov] : C.hfovs || [C.hfov, 88];
  const nearItem = p => boxes.some(bx => { let m = Infinity; for (let k = 0; k < 4; k++) { const A = bx[k], B = bx[(k + 1) % 4], dx = B.x - A.x, dy = B.y - A.y, t = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(p.x - A.x - t * dx, p.y - A.y - t * dy)); } return m < C.itemClear || pointInPolygon(p, bx, 1e-9); });
  const angDiff = (ang, hd) => ((ang - hd + 540) % 360) - 180;
  let best = null;
  for (const hfov of fovs) {
    const half = hfov / 2 - 4;
    for (let x = b.x0 + C.wallClear; x <= b.x1 - C.wallClear + 1e-9; x += C.step) for (let y = b.y0 + C.wallClear; y <= b.y1 - C.wallClear + 1e-9; y += C.step) {
      const p = { x, y }; if (!pointInPolygon(p, poly, 1e-9) || distEdge(poly, p) < C.wallClear || nearItem(p)) continue;
      // الزوايا المنظورة لكل قطعة (ثابتة للنقطة، تُقاس لكل اتجاه)
      const view = items.map((it, i) => ({ it, angs: boxes[i].map(c => Math.atan2(c.x - x, c.y - y) / RAD), dist: Math.min(...boxes[i].map(c => Math.hypot(c.x - x, c.y - y))), cen: Math.hypot(it.x - x, it.y - y) }));
      for (let hd = 0; hd < 360; hd += C.headingStep) {
        const a = hd * RAD, d0 = rayDist(poly, p, a); if (!(d0 >= C.minDepth)) continue;
        let edgeMin = Infinity; for (const o of [-half, -half / 2, half / 2, half]) edgeMin = Math.min(edgeMin, rayDist(poly, p, a + o * RAD));
        if (edgeMin < 1.1) continue; // لا جدار ملتصق بحافة الإطار
        let seen = 0, vis = 0, clipped = 0;
        for (const v of view) {
          const w = ROLE_W[v.it.role] ?? .5, ds = v.angs.map(g => angDiff(g, hd)), inAll = ds.every(d => Math.abs(d) <= half), inAny = ds.some(d => Math.abs(d) <= half);
          if (v.dist < .7 || v.cen > 9) { if (inAny && w >= 1) clipped += w * (v.it.role === 'seat' ? .3 : 1); continue; }
          if (inAll) { seen += w * 1.4; vis++; } else if (Math.abs(angDiff(Math.atan2(v.it.x - x, v.it.y - y) / RAD, hd)) <= half) { seen += w * .35; clipped += w * (v.it.role === 'seat' ? .3 : 1); vis++; } // ظاهرة جزئيًا: تُعاقب القطع الكبيرة المقطوعة
        }
        let ops = 0; for (const o of staged.openings) { const ang = Math.atan2(o.center.x - x, o.center.y - y) / RAD, dd = angDiff(ang, hd), facing = o.normal ? (o.normal.x * (x - o.center.x) + o.normal.y * (y - o.center.y)) : 1; if (Math.abs(dd) <= half && facing > .3) ops += o.door ? .6 : 1; }
        const score = Math.min(d0, 7.5) * .55 + Math.min(edgeMin, 4) * .25 + seen * 1.1 - clipped * 1.2 + Math.min(ops, 3) * .5 - (hfov > C.hfov ? .8 : 0);
        if (!best || score > best.score + 1e-9) best = { x: +x.toFixed(3), y: +y.toFixed(3), headingDeg: hd, hfov, score, visible: vis };
      }
    }
  }
  if (!best) return null;
  return { ...best, eye: C.eye, aspect: C.aspect, vfov: +vfovOf(best.hfov, C.aspect).toFixed(2) };
}

/**
 * معالم الصورة: لكل فتحة وقطعة رئيسية مستطيلها في الصورة (u0,v0,u1,v1 بين 0 و1) إن كانت ظاهرة (أمام الكاميرا وداخل الإطار بمساحة معتبرة).
 * kind: door | window | piece؛ name = نوع الفتحة/القطعة. تُستعمل لعدّ الفتحات المرئية للوصف ولفحص الأمانة الداخلي.
 */
export function projectLandmarks(project, staged, { levelE = 0, minArea = .0025 } = {}) {
  const out = [], clamp = v => Math.max(0, Math.min(1, v));
  const push = (kind, name, pts, extra = {}) => {
    if (pts.some(p => !(p.depth > .3) || Number.isNaN(p.u))) return;
    const u0 = Math.min(...pts.map(p => p.u)), u1 = Math.max(...pts.map(p => p.u)), v0 = Math.min(...pts.map(p => p.v)), v1 = Math.max(...pts.map(p => p.v));
    const c = { u0: clamp(u0), v0: clamp(v0), u1: clamp(u1), v1: clamp(v1) }, a = (c.u1 - c.u0) * (c.v1 - c.v0), full = (u1 - u0) * (v1 - v0);
    if (a < minArea || a < full * .6) return; // ظاهرة جزئيًا فقط: لا تُحتسب
    out.push({ kind, name, ...c, depth: Math.min(...pts.map(p => p.depth)), ...extra });
  };
  for (const o of staged.openings) {
    const hw = o.w / 2, pts = []; for (const sx of [-1, 1]) for (const z of [o.z0, o.z1]) pts.push(project(o.center.x + o.dir.x * hw * sx, o.center.y + o.dir.y * hw * sx, levelE + z));
    push(o.door ? 'door' : 'window', o.kind, pts, { id: o.id });
  }
  staged.items.forEach(it => { if (it.kind === 'rug' || it.kind === 'plant') return; const pts = []; for (const c of fixtureCorners(it)) for (const z of [0, it.h]) pts.push(project(c.x, c.y, levelE + z)); push('piece', it.kind, pts, {}); });
  return out;
}
/** أعداد الوصف المغلق من المعالم المرئية: { doors, windows, pieces: { kind: n } }. */
export function describeLandmarks(lms) {
  const c = { doors: 0, windows: 0 }, pieces = {};
  for (const l of lms) { if (l.kind === 'door') c.doors++; else if (l.kind === 'window') c.windows++; else pieces[l.name] = (pieces[l.name] || 0) + 1; }
  return { counts: { doors: Math.min(8, c.doors), windows: Math.min(8, c.windows) }, pieces };
}
