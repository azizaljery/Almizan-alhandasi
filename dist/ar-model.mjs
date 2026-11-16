// نموذج الواقع المعزز: كتلة المبنى من المستند المعتمد نفسه بمقياس 1:1 بالمتر (نقي: لا DOM ولا THREE ولا شبكة).
// يُبنى من buildingModel (نفس مقاطع الجدران والفتحات والمناسيب التي تعتمدها الواجهات والقطاعات) ثم يُصدَّر منه
// GLB (ar-glb.mjs) وUSDZ (ar-usdz.mjs) ويُعرض بـWebXR (ar-viewer.mjs) من المصدر نفسه، فلا يختلف الحجم بين المسارات.
//
// المحتوى: جدران بفتحاتها (أعمدة/عتبات/عتب)، زجاج النوافذ والأبواب المنزلقة وضلف الأبواب، بلاطات الأدوار والسقف،
// الدروة فوق الأسطح المكشوفة، ومنصة المنسوب (plinth). لا أثاث ولا درج ولا سور ولا نباتات ولا إضاءة ليلية.
// اصطلاح الإحداثيات (glTF/USD، المحور الرأسي Y): مسقط (x, y) → (x, ارتفاع, -y). المبنى مركزه الأفقي عند الأصل وقاعدته على y = 0.
import { buildingModel } from './draw/building-model.mjs';

export const AR_SCHEMA = 'mizan-ar-model/1';

/** مواد النموذج (ألوان خطية تقريبية بدرجات هادئة؛ ليست مواد الواجهة التفصيلية). */
export const AR_MATERIALS = Object.freeze([
  { id: 'walls', name: 'Walls', color: [0.91, 0.88, 0.82], alpha: 1, roughness: 0.92 },
  { id: 'slabs', name: 'Slabs', color: [0.70, 0.68, 0.64], alpha: 1, roughness: 0.95 },
  { id: 'parapet', name: 'Parapet', color: [0.84, 0.81, 0.75], alpha: 1, roughness: 0.92 },
  { id: 'glass', name: 'Glass', color: [0.60, 0.78, 0.88], alpha: 0.35, roughness: 0.1 },
  { id: 'doors', name: 'Doors', color: [0.42, 0.29, 0.18], alpha: 1, roughness: 0.7 },
]);

const GLASS_KINDS = new Set(['window', 'window2', 'slider']);
const DOOR_KINDS = new Set(['door', 'door2', 'garage']);
const PANE = 0.025; // نصف سماكة الزجاج/الضلفة (م)

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const P3 = (p, h) => [p.x, h, -p.y];
const area2 = poly => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + (p.x * q.y - q.x * p.y); }, 0) / 2;

/** تثليث مضلع بسيط (بلا ثقوب) بقص الآذان؛ يعيد ثلاثيات فهارس. يتسامح مع التداخل الشاذ بالعودة إلى مروحة. */
export function triangulate(poly) {
  const n = poly.length; if (n < 3) return [];
  const idx = poly.map((_, i) => i); if (area2(poly) < 0) idx.reverse();
  const cr = (a, b, c) => (poly[b].x - poly[a].x) * (poly[c].y - poly[a].y) - (poly[b].y - poly[a].y) * (poly[c].x - poly[a].x);
  const inside = (p, a, b, c) => { const d1 = cr(a, b, p), d2 = cr(b, c, p), d3 = cr(c, a, p); return d1 >= -1e-12 && d2 >= -1e-12 && d3 >= -1e-12; };
  const out = []; let guard = n * n + 10;
  while (idx.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cr(a, b, c) <= 1e-12) continue; // رأس محدّب فقط
      let ok = true;
      for (const j of idx) { if (j === a || j === b || j === c) continue; const q = poly[j]; if ((q.x === poly[a].x && q.y === poly[a].y) || (q.x === poly[b].x && q.y === poly[b].y) || (q.x === poly[c].x && q.y === poly[c].y)) continue; if (inside(j, a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([a, b, c]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) { // رؤوس مستقيمة/مكررة: نحذف أول رأس شبه مستقيم أو نمرّ إلى مروحة
      const k = idx.findIndex((b, i) => Math.abs(cr(idx[(i + idx.length - 1) % idx.length], b, idx[(i + 1) % idx.length])) <= 1e-9);
      if (k >= 0) idx.splice(k, 1); else break;
    }
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  else if (idx.length > 3) for (let i = 1; i + 1 < idx.length; i++) out.push([idx[0], idx[i], idx[i + 1]]);
  return out;
}

class Sink {
  constructor() { this.b = new Map(AR_MATERIALS.map(m => [m.id, { pos: [], nor: [] }])); }
  tri(mat, p0, p1, p2, n) {
    const g = cross3(sub3(p1, p0), sub3(p2, p0)), l = Math.hypot(g[0], g[1], g[2]);
    if (l < 1e-10) return; // مثلث منحلّ
    const nn = n || [g[0] / l, g[1] / l, g[2] / l];
    const P = dot3(g, nn) < 0 ? [p0, p2, p1] : [p0, p1, p2], B = this.b.get(mat);
    for (const p of P) { B.pos.push(p[0], p[1], p[2]); B.nor.push(nn[0], nn[1], nn[2]); }
  }
  /** مجسم موشوري: مضلع مسقط (م) من ارتفاع y0 إلى y1. */
  prism(mat, poly, y0, y1) {
    if (!poly || poly.length < 3 || !(y1 - y0 > 1e-6)) return;
    const ccw = area2(poly) >= 0 ? poly : [...poly].reverse();
    for (const [a, b, c] of triangulate(ccw)) {
      this.tri(mat, P3(ccw[a], y1), P3(ccw[b], y1), P3(ccw[c], y1), [0, 1, 0]);
      this.tri(mat, P3(ccw[a], y0), P3(ccw[b], y0), P3(ccw[c], y0), [0, -1, 0]);
    }
    for (let i = 0; i < ccw.length; i++) {
      const a = ccw[i], b = ccw[(i + 1) % ccw.length], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const n = [dy / l, 0, dx / l]; // خارج المضلع (مسقط (dy,-dx) → ثلاثي الأبعاد (dy,0,dx))
      this.tri(mat, P3(a, y0), P3(b, y0), P3(b, y1), n); this.tri(mat, P3(a, y0), P3(b, y1), P3(a, y1), n);
    }
  }
}

const rect = (seg, x0, x1, off) => { // مستطيل رقيق على محور الجدار: من x0 إلى x1 وسماكة 2*off حول خط المنتصف
  const at = s => ({ x: seg.a.x + seg.dir.x * s, y: seg.a.y + seg.dir.y * s });
  const A = at(x0), B = at(x1), l = seg.left;
  return [{ x: A.x - l.x * off, y: A.y - l.y * off }, { x: B.x - l.x * off, y: B.y - l.y * off }, { x: B.x + l.x * off, y: B.y + l.y * off }, { x: A.x + l.x * off, y: A.y + l.y * off }];
};

/**
 * @param {object} doc مستند mizan-draw/1
 * @param {{slab?:number, plinth?:number}} [opts]
 * @returns نموذج: materials/meshes/bbox/stats؛ كل mesh = {material, positions:Float32Array, normals:Float32Array, indices:Uint32Array}
 */
export function buildArModel(doc, opts = {}) {
  if (!doc || !Array.isArray(doc.walls) || !doc.walls.length) throw new Error('AR_NO_WALLS');
  const bm = buildingModel(doc, opts), T = bm.slab, S = new Sink();
  let wallPieces = 0, windows = 0, doors = 0;
  for (const L of bm.levels) {
    const next = bm.levels[L.i + 1], rise = next ? next.E - L.E : L.H, base = L.i === 0 ? bm.ground : L.E;
    for (const seg of L.solids.segments) {
      if (seg.kind === 'fence' || seg.kind === 'parapet') continue; // الأسوار وحواجز السطح المرسومة جدرانًا مستقلة ليست كتلة المبنى
      for (const p of seg.pieces) { S.prism('walls', p.poly, L.E + p.z0, L.E + p.z1); wallPieces++; }
      if (L.i === 0) S.prism('slabs', seg.quad, base, L.E); // منصة المنسوب تحت الجدران (تحت الأبواب أيضًا)
      if (seg.parapet) S.prism('parapet', seg.quad, L.E + L.H, L.E + L.H + bm.parapet);
      for (const o of seg.openings) {
        if (GLASS_KINDS.has(o.kind)) { S.prism('glass', rect(seg, o.x0, o.x1, PANE / 2), L.E + o.z0, L.E + o.z1); windows++; }
        else if (DOOR_KINDS.has(o.kind)) { S.prism('doors', rect(seg, o.x0, o.x1, PANE), L.E + o.z0, L.E + o.z1); doors++; }
      }
    }
    const solidHere = seg => seg.kind !== 'fence' && seg.kind !== 'parapet';
    for (const j of L.solids.joints) {
      const node = L.solids.nodes[j.node], segs = (node?.items || []).map(i => i.seg).filter(solidHere);
      if (!segs.length) continue;
      const h = Math.max(...segs.map(s => s.h));
      S.prism('walls', j.poly, L.E, L.E + h);
      if (L.i === 0) S.prism('slabs', j.poly, base, L.E);
    }
    for (const sp of L.spaces) { // بلاطة كل فراغ مغلق: أرضية الدور الأعلى/السقف (الفراغات المكشوفة بلا بلاطة)
      if (sp.open) continue;
      const poly = sp.net || sp.polygon; if (!poly || poly.length < 3) continue;
      if (L.i === 0) S.prism('slabs', poly, base, L.E);
      S.prism('slabs', poly, L.E + rise - T, L.E + rise);
    }
  }
  // تحويل إلى مصفوفات + توسيط أفقي + قاعدة y = 0
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const { pos } of S.b.values()) for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
  if (!Number.isFinite(mn[0])) throw new Error('AR_EMPTY_MODEL');
  const sx = -(mn[0] + mx[0]) / 2, sy = -mn[1], sz = -(mn[2] + mx[2]) / 2, r6 = v => Math.round(v * 1e6) / 1e6;
  const meshes = []; let triangles = 0;
  for (const m of AR_MATERIALS) {
    const { pos, nor } = S.b.get(m.id); if (!pos.length) continue;
    const positions = new Float32Array(pos.length); for (let i = 0; i < pos.length; i += 3) { positions[i] = r6(pos[i] + sx); positions[i + 1] = r6(pos[i + 1] + sy); positions[i + 2] = r6(pos[i + 2] + sz); }
    const n = pos.length / 3, indices = new Uint32Array(n); for (let i = 0; i < n; i++) indices[i] = i;
    meshes.push({ material: m.id, positions, normals: new Float32Array(nor), indices }); triangles += n / 3;
  }
  const bbox = { min: [r6(mn[0] + sx), 0, r6(mn[2] + sz)], max: [r6(mx[0] + sx), r6(mx[1] + sy), r6(mx[2] + sz)] };
  const size = bbox.max.map((v, i) => r6(v - bbox.min[i]));
  return {
    schema: AR_SCHEMA, name: 'mizan-villa', units: 'm', upAxis: 'Y',
    materials: AR_MATERIALS.filter(m => meshes.some(x => x.material === m.id)), meshes, bbox, size,
    stats: { triangles, levels: bm.levels.length, wallPieces, windows, doors, plinth: bm.plinth, roofTop: bm.roofTop, parapet: bm.parapet },
  };
}

export default { AR_SCHEMA, AR_MATERIALS, triangulate, buildArModel };
