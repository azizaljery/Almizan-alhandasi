// تحجيم إنشائي مبدئي للأعمدة والجسور والبلاطة من مستند المرسم (mizan-draw/1).
// ليس تصميمًا إنشائيًا ولا اعتمادًا: كل رقم «تقدير» بافتراضات معلنة في result.assumptions،
// وما لا يمكن حسابه من الرسم يُعلن في result.unavailable. يُعاد الحساب من المستند الحالي مع كل تعديل.
// المراجع: الحدود الدنيا لعمق الجسر والبلاطة من جداول ACI 318 (fy=420 MPa)؛ مطابقة نسخة SBC 304 المعتمدة غير متحقق منها.
// نقي: لا DOM ولا تخزين.
import { planarize, analyzeWalls } from './topology.mjs';
import { pointInPolygon } from './geom.mjs';

/** كل الافتراضات هنا وتُعرض للعميل كما هي؛ يمكن تمرير بدائل عبر opts.assumptions. */
export const DEFAULT_ASSUMPTIONS = Object.freeze({
  fc: 25,              // MPa مقاومة الخرسانة (افتراض)
  fy: 420,             // MPa حديد التسليح (افتراض)
  rho: 0.01,           // نسبة تسليح العمود المفترضة (ليست تصميمًا)
  phi: 0.65,           // معامل تخفيض العمود المربوط
  maxSpan: 6.0,        // م: أقصى بحر جسر قبل اقتراح عمود وسيط
  minColumn: 0.25,     // م: أصغر ضلع عمود (ممارسة، لا نص كود)
  minBeamDepth: 0.30,  // م
  minBeamWidth: 0.20,  // م
  minSlab: 0.125,      // م: حد أدنى للبلاطة المصمتة
  slabDivisor: 24,     // بلاطة باتجاه واحد، طرف واحد مستمر (ACI Table 7.3.1.1) وهو متحفظ للاتجاهين
  concrete: 25,        // kN/m³
  masonry: 14,         // kN/m³ كثافة جدار البلوك مع اللياسة (افتراض)
  sdlFloor: 2.0,       // kN/m² أحمال ميتة إضافية (تشطيبات وخدمات)
  sdlRoof: 3.0,        // kN/m² عزل ومائيات
  liveFloor: 2.0,      // kN/m² حمل حي سكني (افتراض)
  liveRoof: 1.0,       // kN/m²
  deadFactor: 1.2, liveFactor: 1.6,
  cell: 0.25,          // م: دقة حساب مساحة التحميل
  snap: 0.5,           // م: عمود المستخدم يحل محل المقترح إن كان أقرب من هذا
});
const BEAM_RATIO = Object.freeze({ 0: 16, 1: 18.5, 2: 21 }); // ACI Table 9.3.1.1: بسيط/طرف مستمر/طرفان مستمران
const UNAVAILABLE = Object.freeze([
  'القص والثقب والانحراف: تحتاج تصميمًا تفصيليًا.',
  'الأحمال الجانبية (رياح وزلازل): غير مُدخلة.',
  'الأساسات: تحتاج تقرير تربة غير موجود في النظام.',
  'نحافة الأعمدة وتأثير الدرجة الثانية.',
  'قطر الحديد وتفاصيله: لا يُقدَّر هنا.',
]);

const r3 = v => Math.round(v * 1000) / 1000;
const up = (v, step) => Math.ceil(v / step - 1e-9) * step;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** @returns {{ levels: object[], assumptions: object, unavailable: string[], totals: object }} */
export function computeStructure(doc, opts = {}) {
  const A = { ...DEFAULT_ASSUMPTIONS, ...(opts.assumptions || {}) };
  const levels = doc.levels.map((lvl, idx) => ({ lvl, idx, ...structureOfLevel(doc, lvl, A, idx === doc.levels.length - 1) }));
  // تراكم الأحمال من الأعلى إلى الأسفل: عمود كل دور يحمل ما فوقه من أقرب عمود في الدور الأعلى.
  for (let i = levels.length - 2; i >= 0; i--) {
    const below = levels[i], above = levels[i + 1];
    if (!below.columns?.length || !above.columns?.length) continue;
    for (const c of above.columns) {
      let best = null; for (const b of below.columns) { const dd = d2(b, c); if (!best || dd < best.d) best = { d: dd, b }; }
      if (best) best.b.Pu += c.Pu;
    }
  }
  for (const L of levels) {
    if (!L.columns) continue;
    for (const c of L.columns) {
      const Ag = c.Pu / (A.phi * 0.8 * (0.85 * A.fc * (1 - A.rho) + A.fy * A.rho) * 1000); // m²: Pu(kN) / kN/m²
      c.areaRequired = r3(Ag); c.size = r3(Math.max(A.minColumn, up(Math.sqrt(Ag), 0.05))); c.Pu = Math.round(c.Pu);
    }
  }
  const totals = { columns: 0, beams: 0, beamLength: 0, concrete: { columns: 0, beams: 0, slabs: 0 } };
  for (const L of levels) {
    if (!L.columns) continue;
    const h = L.lvl.height || 3.2;
    totals.columns += L.columns.length; totals.beams += L.beams.length;
    totals.beamLength += L.beams.reduce((s, b) => s + b.length, 0);
    totals.concrete.columns += L.columns.reduce((s, c) => s + c.size * c.size * h, 0);
    totals.concrete.beams += L.beams.reduce((s, b) => s + b.width * b.depth * b.length, 0);
    totals.concrete.slabs += L.slab.area * L.slab.thickness;
  }
  for (const k of Object.keys(totals.concrete)) totals.concrete[k] = r3(totals.concrete[k]);
  totals.beamLength = r3(totals.beamLength);
  return { levels: levels.map(({ lvl, idx, ...rest }) => ({ id: lvl.id, name: lvl.name, ...rest })), assumptions: A, unavailable: [...UNAVAILABLE], totals };
}

function structureOfLevel(doc, lvl, A, isTop) {
  const walls = doc.walls.filter(w => w.level === lvl.id);
  if (!walls.length) return { empty: true };
  const analysis = analyzeWalls(walls);
  const outline = analysis.outlines[0]?.polygon;
  const warnings = [];
  if (!outline) return { empty: true, warnings: ['لا يوجد محيط مبنى مغلق؛ لا يمكن حساب البلاطة والأحمال.'] };

  // 0) خلايا المسقط (دقة 0.5 م) داخل المحيط دون الأفنية المسمّاة؛ تُستعمل لضمان تغطية الأعمدة
  const courtyards = (doc.labels || []).filter(l => l.level === lvl.id && (l.type === 'courtyard' || l.type === 'void')).map(l => analysis.spaces.find(s => s.net && pointInPolygon(l.seed, s.net))).filter(Boolean);
  const ox = outline.map(p => p.x), oy = outline.map(p => p.y), x0 = Math.min(...ox), y0 = Math.min(...oy), x1 = Math.max(...ox), y1 = Math.max(...oy);
  const coarse = [];
  for (let x = x0 + 0.25; x < x1; x += 0.5) for (let y = y0 + 0.25; y < y1; y += 0.5) { const p = { x, y }; if (pointInPolygon(p, outline) && !courtyards.some(c => pointInPolygon(p, c.net))) coarse.push(p); }

  // 1) الأعمدة: زوايا المحيط إلزامية؛ وما عداها يُضاف فقط حيث يلزم لتغطية المسقط (≤ 0.75×أقصى بحر من أقرب عمود)
  const { nodes, edges } = planarize(walls);
  const inc = nodes.map(() => []);
  edges.forEach(e => { inc[e.n1].push({ e, to: e.n2 }); inc[e.n2].push({ e, to: e.n1 }); });
  const dirOf = (n, to) => { const a = nodes[n], b = nodes[to], L = d2(a, b); return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
  const isCorner = n => { const ds = inc[n].map(i => dirOf(n, i.to)); return ds.length === 2 && Math.abs(ds[0].x * ds[1].y - ds[0].y * ds[1].x) > 0.1; };
  const isCand = n => inc[n].length >= 3 || isCorner(n);
  const distOutline = pt => { let m = Infinity; for (let i = 0; i < outline.length; i++) m = Math.min(m, distToSeg(pt, outline[i], outline[(i + 1) % outline.length])); return m; };
  const sel = new Set(nodes.map((_, i) => i).filter(n => isCorner(n) && distOutline(nodes[n]) < 0.2));
  if (!sel.size) for (const n of nodes.map((_, i) => i).filter(isCand)) sel.add(n);
  const R = A.maxSpan * 0.75;
  const nearestSel = pt => { let m = Infinity; for (const n of sel) m = Math.min(m, d2(nodes[n], pt)); return m; };
  for (let guard = 0; guard < 300; guard++) {
    let far = null; for (const p of coarse) { const dd = nearestSel(p); if (dd > R && (!far || dd > far.dd)) far = { p, dd }; }
    if (!far) break;
    let pick = null; for (let n = 0; n < nodes.length; n++) { if (sel.has(n) || !isCand(n)) continue; const dd = d2(nodes[n], far.p); if (dd >= far.dd - 0.5) continue; const aligned = [...sel].some(m => Math.abs(nodes[m].x - nodes[n].x) < 0.3 || Math.abs(nodes[m].y - nodes[n].y) < 0.3); const score = dd - (aligned ? 1.2 : 0); if (!pick || score < pick.score) pick = { n, dd, score }; }
    if (!pick) break;
    sel.add(pick.n);
  }

  // 2) الجسور: من كل عمود على امتداد كل جدار حتى عمود آخر أو حتى جسر رئيسي (دعم ثانوي)؛ ثم تقسيم ما تجاوز أقصى بحر
  const walk = () => {
    const out = [], seen = new Set();
    for (const start of sel) for (const first of inc[start]) {
      let cur = first.to, edge = first.e, dir = dirOf(start, first.to), t = edge.t; const path = [start, cur]; let end = null;
      for (let guard = 0; guard < 500; guard++) {
        if (sel.has(cur)) { end = 'column'; break; }
        const next = inc[cur].find(i => i.e !== edge && (() => { const d = dirOf(cur, i.to); return d.x * dir.x + d.y * dir.y > 0.95; })());
        if (!next) { end = inc[cur].length >= 3 ? 'beam' : null; break; }
        cur = next.to; edge = next.e; t = Math.max(t, edge.t); path.push(cur);
      }
      if (!end || cur === start) continue;
      const key = Math.min(start, cur) + '-' + Math.max(start, cur) + '-' + path.length;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ n1: start, n2: cur, t, path, endB: end });
    }
    return out;
  };
  let chains = walk(), splitCount = 0, splitLongest = 0, extra = [];
  for (let round = 0; round < 6; round++) {
    let changed = false;
    for (const c of chains) {
      const L = d2(nodes[c.n1], nodes[c.n2]); if (L <= A.maxSpan + 1e-6) continue;
      const parts = Math.ceil(L / A.maxSpan - 1e-9);
      for (let i = 1; i < parts; i++) {
        const target = { x: nodes[c.n1].x + (nodes[c.n2].x - nodes[c.n1].x) * i / parts, y: nodes[c.n1].y + (nodes[c.n2].y - nodes[c.n1].y) * i / parts };
        const snap = c.path.slice(1, -1).filter(n => !sel.has(n) && inc[n].length >= 3).map(n => ({ n, dd: d2(nodes[n], target) })).sort((p, q) => p.dd - q.dd)[0];
        if (snap && snap.dd <= 0.8) { sel.add(snap.n); changed = true; }
        else if (!extra.some(e => d2(e, target) < 0.3)) { extra.push(target); changed = true; }
      }
      splitCount++; splitLongest = Math.max(splitLongest, L);
    }
    if (!changed) break;
    chains = walk(); splitCount = 0;
  }
  const spanLimit = chains.filter(c => d2(nodes[c.n1], nodes[c.n2]) > A.maxSpan + 1e-6);
  void spanLimit;

  // نقاط التقسيم الوسيطة تصبح أعمدة؛ والجسر يُقطع عندها
  const colPts = [...sel].map(n => ({ x: nodes[n].x, y: nodes[n].y }));
  for (const e of extra) colPts.push({ x: e.x, y: e.y });
  const beams = [];
  for (const c of chains) {
    const a = nodes[c.n1], b = nodes[c.n2], L = d2(a, b);
    const cuts = extra.filter(e => distToSeg(e, a, b) < 0.05).map(e => ({ e, t: d2(a, e) / L })).sort((p, q) => p.t - q.t);
    const pts = [a, ...cuts.map(x => x.e), b];
    for (let i = 0; i + 1 < pts.length; i++) beams.push({ a: pts[i], b: pts[i + 1], t: c.t, split: pts.length > 2, supportB: i + 2 === pts.length ? c.endB : 'column' });
  }
  if (extra.length || chains.length) { const long = beams.filter(b => b.split).length; if (long) warnings.push(`بحور تجاوزت ${A.maxSpan} م فأُضيفت لها أعمدة وسيطة (${extra.length} عمودًا وسيطًا)؛ إن كانت لا تناسب التوزيع فانقلها.`); }

  // 4) أعمدة المستخدم تحلّ محل المقترحة القريبة، والباقي يُضاف كما هو
  const userCols = doc.columns.filter(c => c.level === lvl.id);
  const columns = [];
  for (const c of colPts) {
    if (userCols.find(k => d2(k, c) <= A.snap)) continue;
    columns.push({ id: 'P' + (columns.length + 1), x: r3(c.x), y: r3(c.y), source: 'proposed', Pu: 0, At: 0 });
  }
  for (const u of userCols) columns.push({ id: u.id, x: r3(u.x), y: r3(u.y), source: 'user', Pu: 0, At: 0, drawnSize: u.size });
  if (!columns.length) return { empty: true, warnings: ['لا توجد نقاط التقاء لتوضع عليها أعمدة.'] };

  // 5) البلاطة: سماكة واحدة للدور من أسوأ لوح. اللوح = فراغ مغلق، وبحره الفعلي لا يتجاوز maxSpan (وإلا لزمت جسور/أعمدة يعلنها التحذير أدناه).
  //    نسبة الضلعين ≤ 2: اتجاهان، ACI 318 §8.3.1.2(b) (αfm>2، وهو افتراض غير متحقق): h ≥ ln(0.8+fy/1400)/(36+9β) وليس أقل من 90 مم؛
  //    وإلا باتجاه واحد: ln/slabDivisor.
  const spaces = analysis.spaces.filter(s => s.net && s.area >= 1);
  let govern = { h: 0, spanShort: 0, space: null, mode: null };
  for (const s of spaces) {
    const sx = s.net.map(p => p.x), sy = s.net.map(p => p.y), w = Math.max(...sx) - Math.min(...sx), h = Math.max(...sy) - Math.min(...sy);
    const short = Math.min(A.maxSpan, Math.min(w, h)), long = Math.min(A.maxSpan * 1.5, Math.max(w, h)), beta = long / short;
    const two = beta <= 2, need = two ? short * (0.8 + A.fy / 1400) / (36 + 9 * beta) : short / A.slabDivisor;
    if (need > govern.h) govern = { h: need, spanShort: short, space: s.id, mode: two ? 'two-way' : 'one-way' };
  }
  const slabThickness = r3(Math.max(A.minSlab, up(govern.h, 0.01)));

  // 6) مساحة التحميل لكل عمود: أقرب عمود لكل خلية داخل المحيط (دون الأفنية المسمّاة)
  let plateArea = 0; const cellA = A.cell * A.cell;
  for (let x = x0 + A.cell / 2; x < x1; x += A.cell) for (let y = y0 + A.cell / 2; y < y1; y += A.cell) {
    const p = { x, y };
    if (!pointInPolygon(p, outline) || courtyards.some(s => pointInPolygon(p, s.net))) continue;
    plateArea += cellA;
    let best = null; for (const c of columns) { const dd = (c.x - x) ** 2 + (c.y - y) ** 2; if (!best || dd < best.dd) best = { dd, c }; }
    best.c.At += cellA;
  }
  // أبعد خلية عن أقرب عمود: فراغ كبير بلا جدران لا يستنتج الرسم دعامته؛ يُعلن ولا تُخترع له أعمدة
  let far = { d: 0, x: 0, y: 0 };
  for (let x = x0 + A.cell / 2; x < x1; x += A.cell * 2) for (let y = y0 + A.cell / 2; y < y1; y += A.cell * 2) {
    const p = { x, y }; if (!pointInPolygon(p, outline) || courtyards.some(s => pointInPolygon(p, s.net))) continue;
    let dd = Infinity; for (const c of columns) dd = Math.min(dd, d2(c, p)); if (dd > far.d) far = { d: dd, x, y };
  }
  if (far.d > A.maxSpan * 0.75) warnings.push(`منطقة قرب (${r3(far.x)}، ${r3(far.y)}) تبعد ${far.d.toFixed(1)} م عن أقرب عمود: فراغ كبير بلا جدران، والرسم لا يحدد دعامته؛ أضف أعمدة أو جدرانًا أو راجع مهندسًا.`);
  const sdl = isTop ? A.sdlRoof : A.sdlFloor, live = isTop ? A.liveRoof : A.liveFloor;
  const wuSlab = A.deadFactor * (A.concrete * slabThickness + sdl) + A.liveFactor * live; // kN/m²
  for (const c of columns) c.Pu = c.At * wuSlab;

  // 7) الجسور: عمق من البحر والاستمرارية، وحمل جدار البلوك فوقها يُضاف للأعمدة المجاورة
  const H = lvl.height || 3.2;
  const openingAreaByWall = new Map();
  for (const o of doc.openings.filter(x => x.level === lvl.id)) openingAreaByWall.set(o.wall, (openingAreaByWall.get(o.wall) || 0) + (o.w || 0) * (o.h || 0));
  const wallLen = new Map(walls.map(w => [w.id, d2(w.a, w.b)]));
  // حمل كل الجدران (ولو لم يقع تحتها جسر) يُوزَّع على أقرب عمود كل نصف متر؛ والفتحات تخفّف الحمل
  const nearestCol = pt => { let best = null; for (const c of columns) { const dd = d2(c, pt); if (!best || dd < best.dd) best = { dd, c }; } return best.c; };
  for (const e of edges) {
    const host = walls.find(w => e.wallIds.includes(w.id)), A0 = nodes[e.n1], B0 = nodes[e.n2], L = d2(A0, B0);
    const frac = host ? Math.min(0.8, (openingAreaByWall.get(host.id) || 0) / Math.max(0.01, wallLen.get(host.id) * H)) : 0;
    const line = (host?.t ?? e.t) * H * A.masonry * (1 - frac) * A.deadFactor; // kN/m
    const n = Math.max(1, Math.ceil(L / 0.5));
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; nearestCol({ x: A0.x + (B0.x - A0.x) * t, y: A0.y + (B0.y - A0.y) * t }).Pu += line * L / n; }
  }
  const outBeams = beams.map((b, i) => {
    const L = d2(b.a, b.b);
    const contEnd = end => beams.some(o => o !== b && (d2(o.a, end) < 0.05 || d2(o.b, end) < 0.05) && collinearAt(b, o, end));
    const cont = (contEnd(b.a) ? 1 : 0) + (b.supportB === 'column' && contEnd(b.b) ? 1 : 0);
    const depth = r3(Math.max(A.minBeamDepth, up(L / BEAM_RATIO[cont], 0.05)));
    const width = r3(Math.max(A.minBeamWidth, up(b.t, 0.05)));
    const self = A.deadFactor * A.concrete * width * depth * L; // kN وزن الجسر نفسه على طرفيه
    for (const end of [b.a, b.b]) nearestCol(end).Pu += self / 2;
    return { id: 'B' + (i + 1), a: { x: r3(b.a.x), y: r3(b.a.y) }, b: { x: r3(b.b.x), y: r3(b.b.y) }, length: r3(L), width, depth, continuity: cont, ratio: BEAM_RATIO[cont], split: b.split, supportEnd: b.supportB };
  });
  const slab = { mode: govern.mode, thickness: slabThickness, area: r3(plateArea), governingSpan: r3(govern.spanShort), governingSpace: govern.space, wu: r3(wuSlab) };
  const userMismatch = columns.filter(c => c.source === 'user' && c.drawnSize !== undefined);
  return { columns, beams: outBeams, slab, warnings, userMismatch, isTop };
}

function collinearAt(a, b, end) {
  const da = { x: a.b.x - a.a.x, y: a.b.y - a.a.y }, db = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
  const la = Math.hypot(da.x, da.y), lb = Math.hypot(db.x, db.y);
  return Math.abs((da.x * db.x + da.y * db.y) / (la * lb)) > 0.95;
}
function distToSeg(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; if (!L2) return d2(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2));
  return d2(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export default { computeStructure, DEFAULT_ASSUMPTIONS };
