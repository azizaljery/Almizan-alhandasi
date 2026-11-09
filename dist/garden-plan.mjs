// تخطيط الحديقة: مسبح وشلال ومسطحات عشب وأحواض زراعة في الحوش الحرّ حول الفيلا.
// يعمل على مستند الرسم بعد اكتمال التوزيع الداخلي، ولا يغيّر الجدران ولا الغرف: يضيف قطعًا خارجية فقط.
// نقي: لا DOM. كل ما لا يتسع يُعلَن في report.notes بدل أن يُرسم قسرًا.
import { applyCommand } from './draw/doc.mjs';
import { fixtureRect } from './draw/review.mjs';

const ENTRY_VEC = { s: { x: 0, y: -1 }, n: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
const GAP_BUILDING = 1.0;   // م بين المبنى وأقرب عنصر حديقة (ممر + رصيف)
const GAP_BOUNDARY = .5;    // م من سور الأرض
export const POOL_SIZE = Object.freeze({ w: 3.5, d: 7.0, minShort: 2.5, minLong: 4.5, depth: 1.4 });
const r2 = v => Math.round(v * 100) / 100;

const bboxOf = pts => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });
const rectsOverlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;
const boxOf = f => bboxOf(fixtureRect(f));

/** الأشرطة الحرّة حول المبنى (مستطيلات): الخلفية أولًا ثم الجانبان ثم الأمامية. */
export function freeStrips(doc) {
  const poly = doc.plot?.polygon; if (!poly || poly.length < 3) return { strips: [], building: null };
  const P = bboxOf(poly), L0 = doc.levels[0]?.id;
  const pts = []; for (const w of doc.walls) if (w.level === L0 && w.kind !== 'fence') pts.push(w.a, w.b);
  if (!pts.length) return { strips: [], building: null };
  const B = bboxOf(pts), ev = ENTRY_VEC[doc.entry] || ENTRY_VEC.s;
  const mk = (name, x0, y0, x1, y1) => ({ name, x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 });
  const raw = [
    mk('x-', P.x0 + GAP_BOUNDARY, P.y0 + GAP_BOUNDARY, B.x0 - GAP_BUILDING, P.y1 - GAP_BOUNDARY),
    mk('x+', B.x1 + GAP_BUILDING, P.y0 + GAP_BOUNDARY, P.x1 - GAP_BOUNDARY, P.y1 - GAP_BOUNDARY),
    mk('y-', P.x0 + GAP_BOUNDARY, P.y0 + GAP_BOUNDARY, P.x1 - GAP_BOUNDARY, B.y0 - GAP_BUILDING),
    mk('y+', P.x0 + GAP_BOUNDARY, B.y1 + GAP_BUILDING, P.x1 - GAP_BOUNDARY, P.y1 - GAP_BOUNDARY),
  ].filter(s => s.w >= 1.5 && s.h >= 1.5);
  // الوجهة: اتجاه الشريط من مركز المبنى؛ الأمامي ما اتجاهه نحو المدخل
  const dirOf = n => ({ 'x-': { x: -1, y: 0 }, 'x+': { x: 1, y: 0 }, 'y-': { x: 0, y: -1 }, 'y+': { x: 0, y: 1 } })[n];
  for (const s of raw) { const d = dirOf(s.name), dot = d.x * ev.x + d.y * ev.y; s.role = dot > .9 ? 'front' : dot < -.9 ? 'rear' : 'side'; s.area = s.w * s.h; }
  const rank = { rear: 0, side: 1, front: 2 };
  raw.sort((a, b) => rank[a.role] - rank[b.role] || b.area - a.area);
  return { strips: raw, building: B, plot: P };
}

/** أول موضع يتسع فيه مستطيل w×d داخل الشريط بلا تداخل مع المأخوذ؛ يفضّل الأقرب إلى prefer. */
function findSpot(strip, w, d, taken, { prefer = null, margin = .3, accept = null } = {}) {
  let best = null;
  for (let x = strip.x0 + w / 2; x <= strip.x1 - w / 2 + 1e-6; x += .25) for (let y = strip.y0 + d / 2; y <= strip.y1 - d / 2 + 1e-6; y += .25) {
    const box = { x0: x - w / 2, x1: x + w / 2, y0: y - d / 2, y1: y + d / 2 };
    if (taken.some(t => rectsOverlap(box, t, margin))) continue;
    if (accept && !accept(box)) continue;
    const score = prefer ? Math.hypot(x - prefer.x, y - prefer.y) : Math.hypot(x - (strip.x0 + strip.x1) / 2, y - (strip.y0 + strip.y1) / 2);
    if (!best || score < best.score) best = { x, y, score };
  }
  return best;
}

/**
 * want: { pool, waterfall, lawn, planters } (قيم منطقية) وأبعاد اختيارية want.poolW / want.poolD.
 * يرجع { doc, report: { placed:[{kind,id,x,y,w,d}], notes:[], missing:[] } }
 */
export function planGarden(doc0, want = {}) {
  const report = { placed: [], notes: [], missing: [] };
  if (!want || !(want.pool || want.waterfall || want.lawn || want.planters)) return { doc: doc0, report };
  const { strips, building } = freeStrips(doc0);
  const L0 = doc0.levels[0]?.id;
  if (!strips.length || !building) { for (const k of ['pool', 'waterfall', 'lawn', 'planters']) if (want[k]) report.missing.push(k); report.notes.push('لا يوجد حوش حرّ حول المبنى يتسع لعناصر الحديقة المطلوبة.'); return { doc: doc0, report }; }
  let doc = doc0;
  const taken = doc.fixtures.filter(f => f.level === L0 && f.kind !== 'tree').map(boxOf);
  const put = (kind, x, y, w, d, rot = 0) => {
    const r = applyCommand(doc, { type: 'add-fixture', level: L0, kind, x: r2(x), y: r2(y), rot, w: r2(w), d: r2(d) }); doc = r.doc;
    taken.push({ x0: x - w / 2, x1: x + w / 2, y0: y - d / 2, y1: y + d / 2 });
    report.placed.push({ kind, id: r.ids[0], x: r2(x), y: r2(y), w: r2(w), d: r2(d), rot }); return r.ids[0];
  };
  let poolRect = null;
  if (want.pool) {
    const wantW = want.poolW || POOL_SIZE.w, wantD = want.poolD || POOL_SIZE.d;
    let done = false;
    for (const s of strips) {
      // اتجاه المحور الطويل مع بعد الشريط الأطول
      const alongX = s.w >= s.h;
      let long = Math.min(Math.max(wantW, wantD), (alongX ? s.w : s.h) - .6), short = Math.min(Math.min(wantW, wantD), (alongX ? s.h : s.w) - .6);
      long = Math.floor(long * 2) / 2; short = Math.floor(short * 2) / 2;
      if (long < POOL_SIZE.minLong || short < POOL_SIZE.minShort) continue;
      const w = alongX ? long : short, d = alongX ? short : long;
      const spot = findSpot(s, w, d, taken); if (!spot) continue;
      put('pool', spot.x, spot.y, w, d); poolRect = { x0: spot.x - w / 2, x1: spot.x + w / 2, y0: spot.y - d / 2, y1: spot.y + d / 2, strip: s, cx: spot.x, cy: spot.y };
      if (w < wantW - .01 && d < wantD - .01 || Math.max(w, d) < Math.max(wantW, wantD) - .01) report.notes.push(`المسبح ${r2(Math.min(w, d))} × ${r2(Math.max(w, d))} م (أصغر من المعتاد ${wantW} × ${wantD} م) ليتسع في ${s.role === 'rear' ? 'الحوش الخلفي' : s.role === 'side' ? 'الحوش الجانبي' : 'الحوش الأمامي'}.`);
      if (s.role === 'front') report.notes.push('المسبح في الحوش الأمامي لأن الخلفي والجانبين لا يتسعان: الخصوصية أقل، والأفضل توسيع الأرض أو تصغير الفيلا.');
      done = true; break;
    }
    if (!done) { report.missing.push('pool'); report.notes.push(`لا يتسع مسبح بالحد الأدنى (${POOL_SIZE.minShort} × ${POOL_SIZE.minLong} م) في أي حوش حرّ حول هذا المبنى؛ يلزم أرض أعرض أو مبنى أصغر.`); }
  }
  const outward = { 'x-': { x: -1, y: 0 }, 'x+': { x: 1, y: 0 }, 'y-': { x: 0, y: -1 }, 'y+': { x: 0, y: 1 } };
  if (want.waterfall) {
    const WF = { w: 2.4, d: 1.4 };
    const anchor = poolRect ? { x: poolRect.cx, y: poolRect.cy } : null;
    let done = false;
    const order = (poolRect ? [poolRect.strip, ...strips.filter(s => s !== poolRect.strip)] : strips).filter((s, _, a) => s.role !== 'front' || a.length === 1);
    search: for (const s of order) for (const rot of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const quarter = Math.abs(Math.sin(rot)) > .5, w = quarter ? WF.d : WF.w, d = quarter ? WF.w : WF.d;
      // ظهر الشلال (الصخور) يلتصق بسور الأرض الخارجي للشريط ويواجهه
      const back = fixtureRect({ x: 0, y: 0, w: 0, d: 2, rot })[0], out = outward[s.name];
      if (Math.abs(back.x - out.x) + Math.abs(back.y - out.y) > .3) continue;
      const accept = b => (out.x > 0 ? s.x1 - b.x1 : out.x < 0 ? b.x0 - s.x0 : out.y > 0 ? s.y1 - b.y1 : b.y0 - s.y0) <= .6;
      const spot = findSpot(s, w, d, taken, { prefer: anchor, accept }); if (!spot) continue;
      put('waterfall', spot.x, spot.y, w, d, rot); done = true; break search;
    }
    if (!done) { report.missing.push('waterfall'); report.notes.push('لم أجد موضعًا حرًا يتسع للشلال (2.4 × 1.4 م) بعد المسبح.'); }
  }
  if (want.planters) {
    let n = 0;
    for (const s of strips) {
      if (s.role === 'front' && strips.length > 1) continue;
      const alongX = s.w >= s.h, len = 3;
      // صف أحواض عند الطرف الأبعد عن المبنى (قرب السور)
      const out = { x: s.x0 + s.x1 > building.x0 + building.x1 ? 1 : -1 };
      for (let k = 0; k < 3; k++) {
        const w = alongX ? len : .7, d = alongX ? .7 : len;
        const bx = alongX ? null : (s.name === 'x-' ? s.x0 + .35 : s.x1 - .35), by = alongX ? (s.name === 'y-' ? s.y0 + .35 : s.y1 - .35) : null;
        const strip = alongX ? { ...s, y0: by - .35, y1: by + .35 } : { ...s, x0: bx - .35, x1: bx + .35 };
        const spot = findSpot(strip, w, d, taken, { margin: .6 }); if (!spot) break;
        put('planter', spot.x, spot.y, w, d); n++;
      }
    }
    if (!n) { report.missing.push('planters'); report.notes.push('لا يوجد طول حرّ على السور يتسع لأحواض الزراعة.'); }
  }
  if (want.lawn) {
    let area = 0;
    for (const s of strips) {
      if (s.role === 'front' && strips.length > 1) continue;
      // أكبر مستطيل عشب حر في الشريط بخطوات تقليص
      for (const k of [1, .8, .65, .5]) {
        const w = Math.floor(s.w * k * 2) / 2, d = Math.floor(s.h * k * 2) / 2; if (w < 2.5 || d < 2.5) continue;
        const spot = findSpot(s, Math.min(w, 8), Math.min(d, 8), taken, { margin: .2 }); if (!spot) continue;
        const lw = Math.min(w, 8), ld = Math.min(d, 8); put('lawn', spot.x, spot.y, lw, ld); area += lw * ld; break;
      }
    }
    if (!area) { report.missing.push('lawn'); report.notes.push('لا توجد مساحة حرّة تكفي لمسطح عشبي (2.5 × 2.5 م على الأقل).'); }
  }
  return { doc, report };
}

export default { planGarden, freeStrips, POOL_SIZE };
