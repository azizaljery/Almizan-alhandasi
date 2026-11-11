// تعليقات المخطط المعماري (نقي: لا DOM). يجمع ما يجعل المسقط «كأنه مرسوم بيد مهندس»:
// سماكات الخطوط بالمليمتر، تصنيف الجدران (خارجي/داخلي)، محاور الأعمدة A-B-C/1-2-3،
// سلاسل الأبعاد الخارجية على ثلاثة مستويات (فتحات/جدران/إجمالي)، ترتيب تسميات الفراغات بلا تراكب،
// ومعلومات الدرج (عدد الدرجات وسهم الصعود). يستعمله مُصيّر المرسم (canvas) ولوحة الكتاب (SVG) معًا.
// المرجع: ممارسة مهنية عامة في إعداد المخططات المعمارية؛ لا يُنسب شيء هنا إلى كود بلدي بعينه.
import { dist, sub, norm, dot, ccw, pointInPolygon, add, mul } from './geom.mjs';
import { stairLayout } from './stairs3d.mjs';

/** سماكات الأقلام بالمليمتر على الورق (نسب ثابتة 0.18 : 0.35 : 0.5 : 0.7). */
export const LINE_MM = Object.freeze({ thin: .18, medium: .35, thick: .5, heavy: .7 });
/** المقاييس القياسية للمساقط المعمارية. */
export const STANDARD_SCALES = Object.freeze([50, 75, 100, 125, 150, 200, 250, 300, 400, 500]);
/** مقاسات اللوحات الأفقية بالمليمتر (ISO 216). */
export const SHEETS = Object.freeze({ A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 }, A2: { w: 594, h: 420 }, A1: { w: 841, h: 594 }, A0: { w: 1189, h: 841 } });
/** أسماء الجهات كما تُقرأ على اللوحة. */
export const SIDE_VEC = Object.freeze({ n: { x: 0, y: 1 }, s: { x: 0, y: -1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } });
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const r3 = v => Math.round(v * 1000) / 1000;

/** سماكة قلم بالبكسل من سماكته بالمليمتر: pxPerMm = بكسل لكل مليمتر على الورق. */
export const mmToPx = (mm, pxPerMm) => mm * pxPerMm;

/** اختيار أصغر مقياس قياسي (1:s) يجعل المسقط (بالأمتار) يدخل في مساحة الرسم (بالمليمتر). */
export function pickScale(wM, hM, areaWmm, areaHmm) {
  for (const s of STANDARD_SCALES) if (wM * 1000 / s <= areaWmm && hM * 1000 / s <= areaHmm) return s;
  return STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

/** تصنيف جدران الدور: خارجي/داخلي/حاجز/سور، مع مفتاح رموز مجمّع بالنوع والسماكة. */
export function wallClasses(doc, levelId, exteriorIds = new Set()) {
  const byId = new Map(), groups = new Map();
  for (const w of doc.walls) {
    if (w.level !== levelId) continue;
    const kind = w.kind === 'fence' ? 'fence' : w.kind === 'parapet' ? 'parapet' : exteriorIds.has(w.id) ? 'exterior' : 'interior';
    byId.set(w.id, kind);
    const key = kind + ':' + Math.round(w.t * 100);
    const g = groups.get(key) || { kind, t: w.t, count: 0 }; g.count++; groups.set(key, g);
  }
  const NAME = { exterior: 'جدار خارجي', interior: 'جدار داخلي (قاطع)', parapet: 'حاجز سطح', fence: 'سور' };
  const order = { exterior: 0, interior: 1, parapet: 2, fence: 3 };
  const legend = [...groups.values()].sort((a, b) => order[a.kind] - order[b.kind] || b.t - a.t).map(g => ({ ...g, label: `${NAME[g.kind]} ${Math.round(g.t * 100)} سم` }));
  return { byId, legend };
}

/** تجميع قيم متقاربة (≤ tol) في قيمة واحدة (متوسطها)، مرتبة تصاعديًا. */
export function cluster(values, tol = .45) {
  const s = [...values].filter(Number.isFinite).sort((a, b) => a - b), out = [];
  for (const v of s) { const last = out[out.length - 1]; if (last && v - last.max <= tol) { last.vals.push(v); last.max = v; } else out.push({ vals: [v], max: v }); }
  return out.map(g => r3(g.vals.reduce((a, b) => a + b, 0) / g.vals.length));
}

/**
 * محاور الأعمدة: من مراكز الأعمدة (نتيجة computeStructure أو أعمدة المستخدم) إن وُجدت، وإلا من زوايا محيط المبنى.
 * الأرقام 1.. لمحاور X (يسار→يمين) والحروف A.. لمحاور Y (أسفل→أعلى) كما في لوحة الإنشائي.
 */
export function gridAxes(doc, levelId, { columns = null, analysis = null, tol = .45 } = {}) {
  let pts = (columns || []).map(c => ({ x: c.x, y: c.y })), source = 'columns';
  if (!pts.length) { pts = doc.columns.filter(c => c.level === levelId).map(c => ({ x: c.x, y: c.y })); source = 'user-columns'; }
  if (!pts.length && analysis?.outlines?.length) { pts = analysis.outlines.flatMap(o => o.centerline); source = 'outline'; }
  if (!pts.length) return { x: [], y: [], source: 'none' };
  const xs = cluster(pts.map(p => p.x), tol), ys = cluster(pts.map(p => p.y), tol);
  return { x: xs.map((pos, i) => ({ label: String(i + 1), pos })), y: ys.map((pos, i) => ({ label: LETTERS[i] || 'A' + i, pos })), source };
}

/**
 * سلاسل الأبعاد الخارجية لكل جهة على ثلاثة مستويات: الفتحات (حواف الفتحات والأكتاف)، الجدران (محاور القواطع
 * الملاقية للواجهة)، والإجمالي. كل علامة tick = { pos (الإحداثي على طول الجهة), face (إحداثي الواجهة التي جاءت منها) }.
 * يعيد [] عندما لا يوجد محيط مغلق (لا يُخترع بُعد لمبنى بلا محيط).
 */
export function dimensionChains(doc, levelId, analysis, { tol = .02, reach = .35 } = {}) {
  const outlines = (analysis?.outlines || []).filter(o => o.polygon?.length >= 3);
  if (!outlines.length) return [];
  const walls = doc.walls.filter(w => w.level === levelId && w.kind !== 'fence');
  const openings = doc.openings.filter(o => o.level === levelId);
  const wallById = new Map(walls.map(w => [w.id, w]));
  const out = [];
  for (const side of ['n', 'e', 's', 'w']) {
    const sv = SIDE_VEC[side], vertical = side === 'e' || side === 'w', sign = (side === 'n' || side === 'e') ? 1 : -1;
    const A = p => vertical ? p.y : p.x, C = p => vertical ? p.x : p.y; // along / across
    const raw = [];
    let extent = -Infinity, aMin = Infinity, aMax = -Infinity, aMinFace = 0, aMaxFace = 0;
    for (const o of outlines) {
      const poly = ccw(o.polygon);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], L = dist(a, b); if (L < 1e-6) continue;
        const nrm = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L }; // الخارج على يمين الاتجاه (المضلع عكس عقارب الساعة)
        if (dot(nrm, sv) > .95) raw.push({ coord: r3(C(a)), from: r3(Math.min(A(a), A(b))), to: r3(Math.max(A(a), A(b))) });
        extent = Math.max(extent, sign * C(a));
        for (const p of [a, b]) { if (A(p) < aMin) { aMin = A(p); aMinFace = C(p); } if (A(p) > aMax) { aMax = A(p); aMaxFace = C(p); } }
      }
    }
    if (!raw.length) continue;
    extent *= sign;
    // دمج الواجهات المتصلة على خط واحد (المحيط يحمل رؤوسًا وسيطة عند التقاء القواطع)
    raw.sort((p, q) => p.coord - q.coord || p.from - q.from);
    const faces = [];
    for (const f of raw) { const last = faces[faces.length - 1]; if (last && Math.abs(last.coord - f.coord) <= tol && f.from <= last.to + tol) last.to = Math.max(last.to, f.to); else faces.push({ ...f }); }
    const push = (list, pos, face) => list.push({ pos: r3(pos), face: r3(face) });
    const overall = [], wallsT = [], opensT = [];
    push(overall, aMin, aMinFace); push(overall, aMax, aMaxFace);               // الإجمالي: من وجه إلى وجه
    // الفتحات: أركان الواجهة الخارجية (الأبعد عن المبنى) + حواف فتحاتها؛ الواجهات الغائرة لا تُدمج معها (تحتاج سلسلة خاصة)
    const outer = faces.filter(f => Math.abs(f.coord - extent) <= reach);
    for (const f of outer) { push(opensT, f.from, f.coord); push(opensT, f.to, f.coord); }
    // الجدران الملاقية للواجهة (عمودية عليها تقريبًا) تعطي علامة عند محورها: سلسلة محور إلى محور
    for (const w of walls) {
      const u = norm(sub(w.b, w.a)); if (Math.abs(dot(u, sv)) < .7) continue;
      for (const e of [w.a, w.b]) for (const f of faces) {
        if (A(e) < f.from - reach || A(e) > f.to + reach) continue;
        if (Math.abs(C(e) - f.coord) <= reach) push(wallsT, A(e), f.coord);
      }
    }
    // الفتحات على جدران الواجهة
    for (const o of openings) {
      const w = wallById.get(o.wall); if (!w) continue;
      const u = norm(sub(w.b, w.a)); if (Math.abs(dot(u, sv)) > .3) continue;
      const p0 = add(w.a, mul(u, o.at - o.w / 2)), p1 = add(w.a, mul(u, o.at + o.w / 2)), mid = add(w.a, mul(u, o.at));
      for (const f of outer) {
        if (A(mid) < f.from - tol || A(mid) > f.to + tol || Math.abs(C(mid) - f.coord) > reach) continue;
        push(opensT, A(p0), f.coord); push(opensT, A(p1), f.coord);
      }
    }
    const dedupe = list => {
      const s = [...list].sort((p, q) => p.pos - q.pos), res = [];
      for (const t of s) { const last = res[res.length - 1]; if (last && t.pos - last.pos <= tol) { if (sign * t.face > sign * last.face) last.face = t.face; } else res.push({ ...t }); }
      return res;
    };
    const levels = [{ level: 'openings', ticks: dedupe(opensT) }, { level: 'walls', ticks: dedupe(wallsT) }, { level: 'overall', ticks: dedupe(overall) }];
    const chains = [];
    for (let i = 0; i < levels.length; i++) {
      const L = levels[i];
      if (L.ticks.length < 2) continue; // لا سلسلة بعلامة واحدة
      const same = o => L.ticks.length === o.ticks.length && L.ticks.every((t, j) => Math.abs(t.pos - o.ticks[j].pos) <= tol);
      if (levels.slice(i + 1).some(same)) continue; // لا تكرار لسلسلة مطابقة لما بعدها
      const segments = []; for (let j = 0; j + 1 < L.ticks.length; j++) segments.push({ a: L.ticks[j].pos, b: L.ticks[j + 1].pos, len: r3(L.ticks[j + 1].pos - L.ticks[j].pos) });
      chains.push({ level: L.level, ticks: L.ticks, segments });
    }
    out.push({ side, axis: vertical ? 'y' : 'x', sign, extent: r3(extent), chains });
  }
  return out;
}

/** هل يتداخل مستطيلان {x,y,w,h} (المركز x,y)؟ */
export const boxesOverlap = (a, b, gap = 0) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;
/** عدد أزواج الصناديق المتداخلة. */
export function countOverlaps(boxes, gap = 0) { let n = 0; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxesOverlap(boxes[i], boxes[j], gap)) n++; return n; }
const boxInside = (b, ring, holes = []) => {
  const pts = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: b.x + sx * b.w / 2, y: b.y + sy * b.h / 2 }));
  return pts.every(p => pointInPolygon(p, ring, 1e-9) && !holes.some(h => pointInPolygon(p, h, 1e-9)));
};
/** عرض نص تقريبي بوحدة حجم الخط (للخط العربي المستعمل ≈ 0.55 من الارتفاع لكل حرف). */
export const approxTextWidth = (text, size) => String(text).length * size * .55;

/**
 * ترتيب تسميات الفراغات بلا تراكب. labels: [{ id, seed, ring, holes, lines:[{text,size}] }] بوحدة المتر.
 * يبدأ من بذرة التسمية ثم يبحث حلزونيًا داخل الفراغ عن موضع لا يتداخل مع ما سبق ولا مع obstacles؛
 * إن لم يجد يصغّر الخط (حتى minScale) ثم يضعه عند البذرة ويحسب التداخل بدل إخفائه.
 */
export function layoutLabels(labels, { measure = approxTextWidth, obstacles = [], step = .3, maxR = 3, minScale = .6, pad = .08, lineGap = 1.25 } = {}) {
  const placed = [], boxes = obstacles.map(o => ({ ...o }));
  let overlaps = 0, moved = 0, shrunk = 0;
  const order = [...labels].sort((a, b) => (b.areaHint || 0) - (a.areaHint || 0));
  for (const l of order) {
    const boxAt = (x, y, scale) => {
      const w = Math.max(...l.lines.map(t => measure(t.text, t.size * scale))) + pad * 2, h = l.lines.reduce((s, t) => s + t.size * scale * lineGap, 0) + pad;
      return { id: l.id, x, y, w, h, scale };
    };
    // العوائق «اللينة» (الأثاث مثلًا) تُحترم أولًا؛ فإن ضاق الفراغ يُسمح بالكتابة فوقها (النص أولى من رسم الأثاث الرفيع)
    const free = (b, hard) => !boxes.some(o => (!hard || !o.soft) && boxesOverlap(b, o, .02));
    const fits = b => !l.ring || boxInside(b, l.ring, l.holes || []);
    let best = null;
    for (const scale of [1, .85, .72, minScale]) {
      for (const hard of [false, true]) {
        const seedBox = boxAt(l.seed.x, l.seed.y, scale);
        if (fits(seedBox) && free(seedBox, hard)) { best = seedBox; break; }
        for (let r = step; r <= maxR && !best; r += step) {
          for (let k = 0; k < 16; k++) {
            const a = k * Math.PI / 8, b = boxAt(r3(l.seed.x + Math.cos(a) * r), r3(l.seed.y + Math.sin(a) * r), scale);
            if (fits(b) && free(b, hard)) { best = b; break; }
          }
        }
        if (best) break;
      }
      if (best) break;
    }
    if (best) { if (best.scale < 1) shrunk++; if (best.x !== l.seed.x || best.y !== l.seed.y) moved++; }
    else { best = boxAt(l.seed.x, l.seed.y, minScale); best.forced = true; shrunk++; overlaps += boxes.filter(o => !o.soft && boxesOverlap(best, o)).length; }
    boxes.push(best); placed.push(best);
  }
  return { placed, overlaps, moved, shrunk };
}

/** معلومات الدرج للرسم: الدرجات (مضلعات)، عدد القوائم، وسهم الصعود مع نصه. */
export function stairInfo(stair, rise = 3.2) {
  const lay = stairLayout(stair, rise);
  const treads = lay.steps.filter(s => s.type === 'tread'), landings = lay.steps.filter(s => s.type === 'landing');
  const f = lay.frame.f, from = { x: stair.x + f.x * .2, y: stair.y + f.y * .2 };
  const last = lay.steps[lay.steps.length - 1], c = last ? last.poly.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 }) : from;
  return { N: lay.N, riser: r3(lay.riser), treads, landings, arrow: { from, to: c }, text: `صعود ${lay.N} قائمة`, riserText: `قائمة ${Math.round(lay.riser * 1000)} مم` };
}

/**
 * رمز قطعة الأثاث بإحداثيات العالم (متر): { outline, lines:[[a,b]], ellipses:[{c,rx,ry,rot}], rects:[poly] }.
 * الإحداثيات المحلية: x يمينًا وy نحو «الأمام»؛ rot بعقارب الساعة كما في fixtureRect.
 */
export function fixtureSymbol(f) {
  const rot = f.rot || 0, w = f.w, d = f.d, cs = Math.cos(rot), sn = Math.sin(rot);
  const loc = (x, y) => ({ x: f.x + x * cs - y * sn, y: f.y + x * sn + y * cs });
  const rectL = (x0, y0, x1, y1) => [loc(x0, y0), loc(x1, y0), loc(x1, y1), loc(x0, y1)];
  // tints: مضلعات تُملأ بدرجة هادئة (وسائد، مساند، أحواض) فوق جسم القطعة؛ الرسّامان (Canvas وSVG) يقرآنها إن وُجدت.
  const sym = { outline: rectL(-w / 2, -d / 2, w / 2, d / 2), lines: [], ellipses: [], rects: [], tints: [], soft: f.kind === 'rug' || f.kind === 'tree' || f.kind === 'plant' || f.kind === 'lawn' };
  const L = (ax, ay, bx, by) => sym.lines.push([loc(ax, ay), loc(bx, by)]);
  const R = (x0, y0, x1, y1, tint = false) => { const q = rectL(x0, y0, x1, y1); sym.rects.push(q); if (tint) sym.tints.push(q); };
  const E = (x, y, rx, ry = rx) => sym.ellipses.push({ c: loc(x, y), rx, ry, rot: rx === ry ? 0 : rot });
  switch (f.kind) {
    case 'bed-double': case 'bed-single': {
      // سرير: لوح رأس، وسائد، وغطاء مطوي بزاوية مقلوبة
      const single = f.kind === 'bed-single', pw = single ? w * .7 : w * .4, hb = Math.min(.09, d * .05);
      sym.tints.push(rectL(-w / 2, -d / 2, w / 2, -d / 2 + hb)); L(-w / 2, -d / 2 + hb, w / 2, -d / 2 + hb);
      for (const sx of single ? [0] : [-1, 1]) { const cx = sx * w * .24, hw = pw / 2 * (single ? 1 : .9); R(cx - hw, -d / 2 + .14, cx + hw, -d / 2 + .42, true); }
      const fold = -d / 2 + Math.min(.62, d * .32), band = Math.min(.16, d * .08), tc = Math.min(.42, w * .28);
      L(-w / 2, fold, w / 2, fold); L(-w / 2, fold + band, w / 2 - tc, fold + band); L(w / 2 - tc, fold + band, w / 2, fold + band + tc);
      break; }
    case 'sofa-3': case 'sofa-2': case 'majlis-sofa': case 'armchair': {
      // كنبة/جلسة عربية: مسند ظهر، ذراعان، وتقسيم وسائد الجلوس؛ الجلسة العربية بمساند ظهر متتابعة
      const back = -d / 2 + d * .28, arm = Math.min(.14, w * .12);
      L(-w / 2, back, w / 2, back); L(-w / 2 + arm, back, -w / 2 + arm, d / 2); L(w / 2 - arm, back, w / 2 - arm, d / 2);
      const n = f.kind === 'sofa-3' ? 3 : f.kind === 'sofa-2' ? 2 : f.kind === 'armchair' ? 1 : Math.max(2, Math.round((w - 2 * arm) / .75)), seat = (w - 2 * arm) / n;
      for (let i = 1; i < n; i++) L(-w / 2 + arm + i * seat, back, -w / 2 + arm + i * seat, d / 2);
      if (f.kind === 'majlis-sofa') for (let i = 0; i < n; i++) sym.tints.push(rectL(-w / 2 + arm + i * seat + .04, -d / 2 + .03, -w / 2 + arm + (i + 1) * seat - .04, back - .03));
      else sym.tints.push(rectL(-w / 2, -d / 2, w / 2, back));
      break; }
    case 'coffee-table': R(-w / 2 + .06, -d / 2 + .06, w / 2 - .06, d / 2 - .06); break;
    case 'wardrobe': { const n = Math.max(2, Math.round(w / .5)); for (let i = 1; i < n; i++) L(-w / 2 + i * w / n, -d / 2, -w / 2 + i * w / n, d / 2); L(-w / 2, 0, w / 2, 0); break; }
    case 'nightstand': E(0, 0, Math.min(w, d) * .22); break;
    case 'desk': L(-w / 2, d / 2 - .1, w / 2, d / 2 - .1); break;
    case 'chair': L(-w / 2, -d / 2 + d * .2, w / 2, -d / 2 + d * .2); break;
    case 'rug': R(-w / 2 + .12, -d / 2 + .12, w / 2 - .12, d / 2 - .12); break;
    case 'wc': // مرحاض: خزان خلفي، وعاء بيضوي ومقعد داخلي
      sym.outline = null; R(-w / 2, -d / 2, w / 2, -d / 2 + d * .24, true);
      E(0, d * .13, w * .46, d * .36); E(0, d * .15, w * .3, d * .24); break;
    case 'basin': E(0, d * .06, w * .32, d * .3); E(0, -d * .34, .03); break;
    case 'shower': R(-w / 2 + .05, -d / 2 + .05, w / 2 - .05, d / 2 - .05); L(-w / 2, -d / 2, w / 2, d / 2); L(-w / 2, d / 2, w / 2, -d / 2); E(0, 0, .05); break;
    case 'bathtub': E(0, 0, w * .38, d * .44); E(0, -d * .34, .035); break;
    case 'stove': for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { E(a * w * .22, b * d * .22, w * .13); E(a * w * .22, b * d * .22, w * .05); } break;
    case 'kitchen-run': { // سطح عمل بحافة أمامية، وحوض مزدوج بخلاط
      L(-w / 2, d / 2 - .08, w / 2, d / 2 - .08); const cx = -w * .2;
      R(cx - .36, -.17, cx - .02, .17, true); R(cx + .02, -.17, cx + .36, .17, true); E(cx, -.23, .03);
      for (let i = 1; i <= 3; i++) if (cx + .42 + i * .07 < w / 2 - .06) L(cx + .42 + i * .07, -.15, cx + .42 + i * .07, .15);
      break; }
    case 'fridge': L(-w / 2, d / 2 - .07, w / 2, d / 2 - .07); L(0, d / 2 - .07, 0, d / 2); break;
    case 'washing-machine': E(0, .03, w * .32); E(0, .03, w * .2); L(-w / 2, -d / 2 + .1, w / 2, -d / 2 + .1); break;
    case 'tv-unit': L(-w * .35, 0, w * .35, 0); break;
    case 'dining-table': { // كراسٍ على الجانبين الطويلين بعدد يتبع الطول، وكرسيان عند الرأسين إن اتسع العرض
      const chair = (cx, cy, bx, by) => { R(cx - .2, cy - .2, cx + .2, cy + .2); L(cx - .2 * Math.abs(by) + bx * .17, cy - .2 * Math.abs(bx) + by * .17, cx + .2 * Math.abs(by) + bx * .17, cy + .2 * Math.abs(bx) + by * .17); };
      const n = Math.max(1, Math.floor(w / .62));
      for (let i = 0; i < n; i++) for (const sy of [-1, 1]) chair(-w / 2 + (i + .5) * w / n, sy * (d / 2 + .22), 0, sy);
      if (d >= .8 && w >= 1.5) for (const sx of [-1, 1]) chair(sx * (w / 2 + .22), 0, sx, 0);
      R(-w / 2 + .07, -d / 2 + .07, w / 2 - .07, d / 2 - .07);
      break; }
    case 'car': L(-w / 2 + .1, d * .28, w / 2 - .1, d * .28); L(-w / 2 + .1, -d * .18, w / 2 - .1, -d * .18); L(-w / 2 + .1, d * .28, -w / 2 + .1, -d * .18); L(w / 2 - .1, d * .28, w / 2 - .1, -d * .18); break;
    case 'tree': case 'plant': sym.ellipses.push({ c: loc(0, 0), rx: Math.min(w, d) * .5, ry: Math.min(w, d) * .5, rot: 0 }, { c: loc(0, 0), rx: Math.min(w, d) * .3, ry: Math.min(w, d) * .3, rot: 0 }); sym.outline = null; break;
    case 'elevator-car': sym.rects.push(rectL(-w / 2 + .06, -d / 2 + .06, w / 2 - .06, d / 2 - .06)); L(-w / 2 + .06, -d / 2 + .06, w / 2 - .06, d / 2 - .06); L(-w / 2 + .06, d / 2 - .06, w / 2 - .06, -d / 2 + .06); L(-w * .31, d / 2, w * .31, d / 2); break;
    case 'pool': {
      const cp = Math.min(.35, Math.min(w, d) * .08); sym.rects.push(rectL(-w / 2 + cp, -d / 2 + cp, w / 2 - cp, d / 2 - cp));
      for (let k = 1; k <= 3; k++) { const y = -d / 2 + cp + (d - 2 * cp) * k / 4; L(-w / 2 + cp + .3, y, w / 2 - cp - .3, y); } break; }
    case 'waterfall': L(-w / 2, -d / 2 + .45, w / 2, -d / 2 + .45); L(-w * .3, -d / 2, -w * .3, -d / 2 + .45); L(w * .3, -d / 2, w * .3, -d / 2 + .45); sym.ellipses.push({ c: loc(0, d / 2 - .35), rx: w * .3, ry: .12, rot }); break;
    case 'carport': { const n = Math.max(1, Math.round(w / 2.7)); for (let k = 0; k < n; k++) { const x0 = -w / 2 + k * w / n + .15, x1 = -w / 2 + (k + 1) * w / n - .15; sym.rects.push(rectL(x0, -d / 2 + .25, x1, d / 2 - .25)); L(x0, -d / 2 + .25, x1, d / 2 - .25); L(x0, d / 2 - .25, x1, -d / 2 + .25); } break; }
    case 'pergola': for (const sx of [-1, 1]) for (const sy of [-1, 1]) sym.rects.push(rectL(sx * (w / 2 - .12) - .08, sy * (d / 2 - .12) - .08, sx * (w / 2 - .12) + .08, sy * (d / 2 - .12) + .08)); for (let k = 1; k < 6; k++) L(-w / 2 + k * w / 6, -d / 2, -w / 2 + k * w / 6, d / 2); break;
    case 'bbq': sym.ellipses.push({ c: loc(-w * .18, 0), rx: Math.min(.2, d * .3), ry: Math.min(.2, d * .3), rot: 0 }); L(w * .15, -d / 2, w * .15, d / 2); break;
    case 'fountain': sym.ellipses.push({ c: loc(0, 0), rx: w * .5, ry: w * .5, rot: 0 }, { c: loc(0, 0), rx: w * .3, ry: w * .3, rot: 0 }, { c: loc(0, 0), rx: w * .08, ry: w * .08, rot: 0 }); sym.outline = null; break;
    case 'lawn': for (let k = -2; k <= 2; k++) L(-w / 2 + .2, k * d / 6, w / 2 - .2, k * d / 6); break;
    case 'planter': sym.rects.push(rectL(-w / 2 + .08, -d / 2 + .08, w / 2 - .08, d / 2 - .08)); for (let k = 0; k < Math.max(2, Math.round(w / .8)); k++) sym.ellipses.push({ c: loc(-w / 2 + (k + .5) * w / Math.max(2, Math.round(w / .8)), 0), rx: .2, ry: .2, rot: 0 }); break;
    default: break;
  }
  return sym;
}

/** نص الأبعاد: متران بعد الفاصلة بلا وحدة (الوحدة في المفتاح: «الأبعاد بالمتر»). */
export const fmtDim = v => v.toFixed(2);
/** نص المساحة. */
export const fmtAreaM2 = a => (a >= 100 ? a.toFixed(1) : a.toFixed(2)) + ' م²';

export default { LINE_MM, STANDARD_SCALES, SHEETS, SIDE_VEC, mmToPx, pickScale, wallClasses, cluster, gridAxes, dimensionChains, boxesOverlap, countOverlaps, layoutLabels, stairInfo, fmtDim, fmtAreaM2, approxTextWidth };
