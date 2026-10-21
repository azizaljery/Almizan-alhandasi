// مراجعة إنشائية مبدئية لمستند المرسم (mizan-draw/1): استمرارية مسارات الأحمال وتوافق الأعمدة والجدران والبحور والفتحات بين الأدوار.
//
// هذه ليست تصميمًا إنشائيًا ولا حسابًا ولا اعتمادًا. كل ما هنا مؤشرات هندسية تُقرأ من الرسم نفسه لتنبيه المصمم والعميل
// إلى ما يستحق نظر مهندس إنشائي مرخّص مبكرًا. لا تُخرج هذه الوحدة أبدًا حكمًا بأن التصميم «سليم» أو صالح للبناء؛
// غياب الملاحظات يعني فقط أن هذه الفحوص المحدودة لم تجد ما تنبّه عليه.
//
// الافتراض: هيكل خرساني مسلح (أعمدة وجسور وبلاطات) مع جدران بلوك غير حاملة — الشائع في الفلل السعودية. لذلك:
//   • تُقترح «شبكة أعمدة مبدئية» عند تقاطعات الجدران (زوايا المحيط وتقاطعات الجدران الطويلة، وتباعد ≤ 6 م على كل خط)،
//     وتُقارن شبكة كل دور بالذي تحته (استمرارية الأعمدة).
//   • الجدار العلوي يُعدّ «محمولًا» إن كان فوق جدار سفلي (أو عمود)، وإلا فهو على جسر/بلاطة بين ركيزتين ويُقاس امتداده.
//   • البحر الصافي لكل لوح = ضعف أكبر بُعد لنقطة داخل الفراغ عن حدوده (يساوي الضلع الأقصر للمستطيل).
// كل الحدود في PRECHECK_LIMITS قيم تصميمية استرشادية غير متحقق منها مقابل كود البناء السعودي (SBC 304) ولا بحساب.
// نقي: لا DOM ولا تخزين؛ يُعاد الحساب من المستند الحالي.
import { analyzeDoc, minRect } from './draw/digest.mjs';
import { planarize, analyzeWalls } from './draw/topology.mjs';
import { pointInPolygon, area as polyArea, centroid as polyCentroid } from './draw/geom.mjs';
import { stairLayout } from './draw/stairs3d.mjs';

export const PRECHECK_VERSION = '1.0.0';
export const PRECHECK_DISCLAIMER = 'مراجعة مبدئية — ليست تصميمًا إنشائيًا ولا تغني عن مهندس إنشائي مرخّص';
export const LIMITS_NOTE = 'الحدود المستعملة قيم تصميمية استرشادية لم يُتحقق منها مقابل كود البناء السعودي (SBC 304) ولا بحساب إنشائي.';
export const PRECHECK_LIMITS = Object.freeze({
  lineTol: 0.2,        // م: جدار علوي «فوق» جدار سفلي إن كان خطاهما على هذا البعد أو أقل
  offsetMax: 0.6,      // م: إزاحة موازية أكبر من lineTol وحتى هذا البعد = «جدار مُزاح»
  pointTol: 0.25,      // م: جدار سفلي عمودي ينتهي/يعبر قرب الخط = ركيزة نقطية
  colAlign: 0.3,       // م: عمود علوي «على» عمود سفلي
  colOffsetMax: 1.0,   // م: إزاحة عمود يمكن معالجتها بمواءمة المحاور؛ أبعد من ذلك = عمود بلا عمود تحته
  beamSpan: 6.0,       // م: أقصى تباعد أعمدة على خط جدار عند اقتراح الشبكة
  majorChain: 4.0,     // م: خط جدار «رئيسي» (تقاطع خطين رئيسيين يأخذ عمودًا)
  minChain: 2.0,       // م: خطوط أقصر من هذا (قواطع الحمامات) لا تُعتبر خطوط جسور
  colMinGap: 1.2,      // م: لا عمودان مقترحان أقرب من هذا (إلا زوايا المحيط)
  slabWarn: 5.0,       // م: بحر صافٍ للبلاطة يستحق انتباهًا
  slabSerious: 6.0,    // م: بحر صافٍ يتجاوز المعتاد لبلاطة مصمتة في فيلا دون جسور/أعمدة إضافية
  lintelWarn: 3.0,     // م: فتحة تحت جدار علوي أعرض من هذا
  bridgeMax: 5.0,      // م: جدار علوي بلا ركيزة تحته لأطول من هذا
  heavyWall: 0.2,      // م: سماكة الجدار «الثقيل» (خارجي/بلوك 20)
  cantInfo: 0.3,       // م: بروز الدور العلوي عن الذي تحته
  cantWarn: 1.5,
  cantSerious: 2.5,
  aspectWarn: 3.0,     // نسبة الطول إلى العرض للمسقط
  reentrant: 0.85,     // مساحة المسقط ÷ مستطيله الأصغر أقل من هذا = زوايا داخلة واضحة
  eccentric: 0.15,     // إزاحة مركز الدور العلوي عن السفلي كنسبة من البعد
  wetOverlap: 1.0,     // م²: حمام علوي «فوق» فراغ رطب إن تداخلا بهذا القدر
  cell: 0.1,           // م: دقة الشبكة للبحور والبروزات
});
const SEV_RANK = { serious: 3, warn: 2, info: 1 };
const WET = new Set(['bath', 'laundry', 'kitchen']);
const DRY_SENSITIVE = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'office']);
const r2 = v => Math.round(v * 100) / 100;
const fmt = v => (Math.round(v * 100) / 100).toFixed(2);

// ---------------------------------------------------------------------------------------------- هندسة صغيرة
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segInfo(w) {
  const L = d2(w.a, w.b), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  return { w, id: w.id, a: w.a, b: w.b, L, u, n: { x: -u.y, y: u.x }, t: w.t ?? 0.2 };
}
const along = (s, p) => (p.x - s.a.x) * s.u.x + (p.y - s.a.y) * s.u.y;
const across = (s, p) => (p.x - s.a.x) * s.n.x + (p.y - s.a.y) * s.n.y;
const at = (s, k) => ({ x: s.a.x + s.u.x * k, y: s.a.y + s.u.y * k });
const parallel = (s, q) => Math.abs(s.u.x * q.u.y - s.u.y * q.u.x) < 0.02;
function distToSeg(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; if (!L2) return d2(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2));
  return d2(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}
const distToPoly = (p, poly) => { let m = Infinity; for (let i = 0; i < poly.length; i++) m = Math.min(m, distToSeg(p, poly[i], poly[(i + 1) % poly.length])); return m; };
const inAny = (p, polys, tol = 1e-9) => polys.some(q => pointInPolygon(p, q, tol));
const bboxOf = pts => { const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
/** اتحاد فترات [a,b] مرتبة. */
function unionIv(list) {
  const s = list.filter(([a, b]) => b - a > 1e-6).sort((p, q) => p[0] - q[0]), out = [];
  for (const iv of s) { const last = out[out.length - 1]; if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1]); else out.push([...iv]); }
  return out;
}
/** [0,L] مطروحًا منه الفترات. */
function complementIv(L, cover) {
  const out = []; let cur = 0;
  for (const [a, b] of unionIv(cover)) { if (a > cur + 1e-6) out.push([cur, Math.min(a, L)]); cur = Math.max(cur, b); }
  if (L > cur + 1e-6) out.push([cur, L]);
  return out.filter(([a, b]) => b - a > 1e-6);
}

// ---------------------------------------------------------------------------------------------- شبكة الأعمدة المقترحة
/** شبكة أعمدة مبدئية لدور: زوايا المحيط + تقاطعات الخطوط الرئيسية + ما يلزم لتباعد ≤ beamSpan على كل خط جدار. */
export function proposeColumnGrid(walls, outlines, K = PRECHECK_LIMITS, openings = [], preferred = []) {
  // preferred: أعمدة الدور الذي تحته؛ العمود الوسيط يُوضع عليها إن وقعت على الخط ضمن التباعد المسموح (استمرارية بين الأدوار)
  // مقاطع الفتحات: عمود وسيط (بلا تقاطع) لا يوضع داخل فتحة
  const opSegs = openings.map(o => { const w = walls.find(x => x.id === o.wall); if (!w) return null; const s = segInfo(w); return { a: at(s, o.at - o.w / 2 - 0.15), b: at(s, o.at + o.w / 2 + 0.15), t: s.t }; }).filter(Boolean);
  const inOpening = p => opSegs.some(q => distToSeg(p, q.a, q.b) <= q.t / 2 + 0.05);
  const { nodes, edges } = planarize(walls);
  if (!nodes.length) return { columns: [], chains: [] };
  const inc = nodes.map(() => []);
  for (const e of edges) { inc[e.n1].push({ e, to: e.n2 }); inc[e.n2].push({ e, to: e.n1 }); }
  const dir = (n, to) => { const a = nodes[n], b = nodes[to], L = d2(a, b); return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
  // سلاسل مستقيمة: أطول امتداد على خط واحد عبر العقد
  const used = new Set(), chains = [], chainsAt = nodes.map(() => []);
  for (const e of edges) {
    if (used.has(e.id)) continue; used.add(e.id);
    const seq = [e.n1, e.n2];
    for (const end of [0, 1]) {
      for (let guard = 0; guard < 500; guard++) {
        const n = end ? seq[seq.length - 1] : seq[0], prev = end ? seq[seq.length - 2] : seq[1];
        const d = dir(prev, n);
        const next = inc[n].find(i => !used.has(i.e.id) && (() => { const q = dir(n, i.to); return q.x * d.x + q.y * d.y > 0.995; })());
        if (!next) break; used.add(next.e.id);
        if (end) seq.push(next.to); else seq.unshift(next.to);
      }
    }
    const len = d2(nodes[seq[0]], nodes[seq[seq.length - 1]]);
    const c = { idx: chains.length, nodes: seq, len, a: nodes[seq[0]], b: nodes[seq[seq.length - 1]] };
    chains.push(c); for (const n of seq) chainsAt[n].push(c.idx);
  }
  const corner = n => { const ds = inc[n].map(i => dir(n, i.to)); for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) if (Math.abs(ds[i].x * ds[j].y - ds[i].y * ds[j].x) > 0.1) return true; return false; };
  const junction = n => inc[n].length >= 3 || (inc[n].length === 2 && corner(n));
  const outlinePolys = outlines.map(o => o.polygon);
  const onOutline = n => outlinePolys.some(p => distToPoly(nodes[n], p) < 0.15);
  // زاوية في المحيط نفسه (تغيّر اتجاه حافة المحيط عند العقدة)
  const outlineCorner = n => outlinePolys.some(poly => poly.some((p, i) => {
    if (d2(p, nodes[n]) > 0.15) return false;
    const a = poly[(i + poly.length - 1) % poly.length], b = poly[(i + 1) % poly.length];
    const u = { x: p.x - a.x, y: p.y - a.y }, v = { x: b.x - p.x, y: b.y - p.y };
    return Math.abs(u.x * v.y - u.y * v.x) / Math.max(1e-9, Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) > 0.1;
  }));
  const sel = new Map(); // node -> reason
  const req = new Set();
  nodes.forEach((_, n) => { if (outlineCorner(n)) { sel.set(n, 'outline-corner'); req.add(n); } });
  const major = c => c.len >= K.majorChain - 1e-6;
  nodes.forEach((_, n) => {
    if (sel.has(n)) return;
    const mj = chainsAt[n].map(i => chains[i]).filter(major);
    if (mj.length >= 2 && corner(n)) sel.set(n, 'major-intersection');
  });
  for (const c of chains.filter(major)) for (const n of [c.nodes[0], c.nodes[c.nodes.length - 1]]) if (!sel.has(n)) sel.set(n, 'line-end');
  // تباعد ≤ beamSpan على كل خط ≥ minChain
  const extra = [];
  for (const c of chains) {
    if (c.len < K.minChain) continue;
    const pos = c.nodes.map(n => ({ n, s: d2(nodes[c.nodes[0]], nodes[n]) }));
    for (let guard = 0; guard < 50; guard++) {
      const chosen = pos.filter(p => sel.has(p.n)).map(p => p.s).concat(extra.filter(e => e.chain === c.idx).map(e => e.s)).sort((a, b) => a - b);
      const marks = [...new Set([0, ...chosen, c.len].map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
      let fixed = false;
      for (let i = 0; i + 1 < marks.length && !fixed; i++) {
        if (marks[i + 1] - marks[i] <= K.beamSpan + 1e-6) continue;
        // أبعد تقاطع ضمن beamSpan من العمود السابق
        const cand = pos.filter(p => p.s > marks[i] + 0.5 && p.s <= marks[i] + K.beamSpan + 1e-6 && junction(p.n) && !sel.has(p.n)).sort((p, q) => q.s - p.s)[0];
        if (cand) sel.set(cand.n, 'span-limit');
        else {
          const ideal = marks[i] + Math.min(K.beamSpan, (marks[i + 1] - marks[i]) / Math.ceil((marks[i + 1] - marks[i]) / K.beamSpan));
          const pt = s => ({ x: c.a.x + (c.b.x - c.a.x) * s / c.len, y: c.a.y + (c.b.y - c.a.y) * s / c.len });
          // أقرب موضع إلى المثالي (لا يتجاوز beamSpan من السابق) خارج الفتحات
          let s = ideal;
          const dirx = (c.b.x - c.a.x) / c.len, diry = (c.b.y - c.a.y) / c.len;
          const pref = preferred.map(p => ({ k: (p.x - c.a.x) * dirx + (p.y - c.a.y) * diry, off: Math.abs((p.x - c.a.x) * -diry + (p.y - c.a.y) * dirx) }))
            .filter(p => p.off <= 0.05 && p.k > marks[i] + 0.5 && p.k <= marks[i] + K.beamSpan + 1e-6 && p.k < marks[i + 1] - 0.5 && !inOpening(pt(p.k))).sort((a, b) => Math.abs(a.k - ideal) - Math.abs(b.k - ideal));
          if (pref.length) { extra.push({ chain: c.idx, s: pref[0].k, ...pt(pref[0].k) }); fixed = true; continue; }
          for (let d = 0; d <= K.beamSpan; d += 0.05) { const c1 = ideal - d, c2 = ideal + d; if (c1 > marks[i] + 0.5 && !inOpening(pt(c1))) { s = c1; break; } if (c2 <= marks[i] + K.beamSpan && c2 < marks[i + 1] - 0.5 && !inOpening(pt(c2))) { s = c2; break; } }
          extra.push({ chain: c.idx, s, ...pt(s), inOpening: inOpening(pt(s)) });
        }
        fixed = true;
      }
      if (!fixed) break;
    }
  }
  // دمج المتقاربة (تبقى زوايا المحيط)
  const prio = n => (req.has(n) ? 100 : 0) + chainsAt[n].map(i => chains[i]).filter(major).length * 10 + inc[n].length;
  const list = [...sel.keys()].sort((a, b) => prio(b) - prio(a) || a - b), keep = [];
  for (const n of list) { if (!req.has(n) && keep.some(m => d2(nodes[m], nodes[n]) < K.colMinGap)) continue; keep.push(n); }
  const columns = keep.map(n => ({ x: r2(nodes[n].x), y: r2(nodes[n].y), reason: sel.get(n), node: n }))
    .concat(extra.map(e => ({ x: r2(e.x), y: r2(e.y), reason: 'intermediate-no-junction', ...(e.inOpening ? { inOpening: true } : {}) })));
  columns.sort((p, q) => p.y - q.y || p.x - q.x).forEach((c, i) => { c.id = 'C' + (i + 1); });
  return { columns, chains: chains.map(c => ({ a: c.a, b: c.b, len: r2(c.len), major: major(c) })) };
}

// ---------------------------------------------------------------------------------------------- البحر الصافي
/** ضعف أكبر بُعد لنقطة داخل المضلع عن حدوده (للمستطيل = ضلعه الأقصر)، ومركز تلك النقطة. */
export function clearSpan(poly, holes = [], cell = 0.1) {
  const b = bboxOf(poly); let best = { d: 0, p: null };
  const edges = [poly, ...holes];
  for (let x = b.x0 + cell / 2; x < b.x1; x += cell) for (let y = b.y0 + cell / 2; y < b.y1; y += cell) {
    const p = { x, y }; if (!pointInPolygon(p, poly) || holes.some(h => pointInPolygon(p, h))) continue;
    let m = Infinity; for (const e of edges) m = Math.min(m, distToPoly(p, e));
    if (m > best.d) best = { d: m, p };
  }
  // تصحيح الدقة: مركز الخلية قد يبعد حتى نصف خلية عن الأفضل
  return { span: r2(Math.min(2 * (best.d + cell / 2), minRect(poly).w)), at: best.p };
}

// ---------------------------------------------------------------------------------------------- الفحص
/**
 * @returns {{ disclaimer, version, status:'preliminary', limits, limitsNote, levels[], findings[], counts, summary, assumptions[], notChecked[] }}
 */
export function structuralPrecheck(doc, opts = {}) {
  const K = { ...PRECHECK_LIMITS, ...(opts.limits || {}) };
  const model = analyzeDoc(doc);
  const findings = [];
  const add = (severity, code, level, message, elements = [], extra = {}) => findings.push({ id: 'F' + (findings.length + 1), severity, code, level, message, elements, ...extra, disclaimer: PRECHECK_DISCLAIMER });

  // ---- بيانات كل دور
  const levels = [];
  doc.levels.forEach((lv, i) => {
    const walls = doc.walls.filter(w => w.level === lv.id && (w.kind || 'wall') === 'wall' && d2(w.a, w.b) > 0.05);
    const analysis = analyzeWalls(walls);
    const L = model.levelById.get(lv.id);
    const rooms = (L?.rooms || []).filter(r => r.net?.length);
    const grid = proposeColumnGrid(walls, analysis.outlines, K, doc.openings.filter(o => walls.some(w => w.id === o.wall)), i > 0 ? levels[i - 1].columns : []);
    const userCols = (doc.columns || []).filter(c => c.level === lv.id).map(c => ({ id: c.id, x: c.x, y: c.y, reason: 'drawn', size: c.size }));
    const columns = [...grid.columns.filter(c => !userCols.some(u => d2(u, c) < 0.5)).map(c => ({ ...c, id: `${lv.id}-${c.id}` })), ...userCols];
    const outlines = analysis.outlines.map(o => o.polygon);
    levels.push({ i, id: lv.id, name: lv.name, elevation: lv.elevation, height: lv.height, walls, segs: walls.map(segInfo), analysis, rooms, columns, chains: grid.chains, outlines,
      openings: doc.openings.filter(o => walls.some(w => w.id === o.wall)), overlay: { supports: [], spans: [], lintels: [], stair: [], wet: [], overhang: [], columnLinks: [], conflicts: [] } });
  });
  if (!levels.length || !levels[0].walls.length) add('serious', 'NO_WALLS', null, 'لا جدران في الدور الأرضي؛ لا يمكن إجراء المراجعة المبدئية.');

  // ---- ارتفاعات الأدوار متتابعة
  for (let i = 1; i < levels.length; i++) {
    const a = doc.levels[i - 1], b = doc.levels[i];
    if (Number.isFinite(a.elevation) && Number.isFinite(b.elevation) && Math.abs((a.elevation + (a.height || 3.2)) - b.elevation) > 0.02)
      add('warn', 'LEVEL_STACK', b.id, `منسوب «${b.name}» (${fmt(b.elevation)} م) لا يساوي منسوب الدور الذي تحته مع ارتفاعه (${fmt(a.elevation + (a.height || 3.2))} م).`, [a.id, b.id]);
  }

  // ---- (1) البحور الصافية للبلاطات: سقف كل فراغ مسقوف
  for (const L of levels) {
    let worst = null;
    for (const r of L.rooms) {
      if (['courtyard', 'void'].includes(r.type) || r.area < 1) continue;
      const { span, at: p } = clearSpan(r.net, r.space?.holes || [], K.cell);
      const rec = { level: L.id, room: r.id, name: r.name, span, at: p, poly: r.net, severity: span > K.slabSerious ? 'serious' : span > K.slabWarn ? 'warn' : 'ok' };
      L.overlay.spans.push(rec);
      if (!worst || span > worst.span) worst = rec;
      if (rec.severity !== 'ok') add(rec.severity, 'SLAB_SPAN', L.id, `بحر صافٍ ≈ ${fmt(span)} م في «${r.name}» (${L.name}) يتجاوز ${fmt(rec.severity === 'serious' ? K.slabSerious : K.slabWarn)} م: بلاطة مصمتة بهذا البحر تحتاج عادة جسورًا ساقطة أو عمودًا وسطيًا أو نظام بلاطة آخر يقرره مهندس إنشائي.`, [r.id], { value: span, limit: rec.severity === 'serious' ? K.slabSerious : K.slabWarn, at: p && { x: r2(p.x), y: r2(p.y) } });
    }
    L.maxSpan = worst ? { room: worst.room, name: worst.name, span: worst.span } : null;
  }

  // ---- (2) لكل دور علوي: استمرارية الجدران والأعمدة، الفتحات تحت الجدران، البروز، الدرج، الرطب
  for (let i = 1; i < levels.length; i++) {
    const U = levels[i], D = levels[i - 1];
    const lowerOutline = D.outlines;
    // 2أ) الجدران العلوية
    for (const s of U.segs) {
      const cover = [], offs = [];
      for (const g of D.segs) {
        if (!parallel(s, g)) continue;
        const off = Math.abs(across(s, g.a));
        if (off > K.offsetMax + 1e-6) continue;
        const k0 = Math.max(0, Math.min(along(s, g.a), along(s, g.b))), k1 = Math.min(s.L, Math.max(along(s, g.a), along(s, g.b)));
        if (k1 - k0 < 0.02) continue;
        (off <= K.lineTol + 1e-6 ? cover : offs).push([k0, k1, off, g.id]);
      }
      const pts = [];
      for (const g of D.segs) {
        if (parallel(s, g)) continue;
        // جدار سفلي يعبر الخط أو ينتهي عنده
        const da = across(s, g.a), db = across(s, g.b);
        if ((da > K.pointTol && db > K.pointTol) || (da < -K.pointTol && db < -K.pointTol)) continue;
        const t = Math.abs(da - db) < 1e-9 ? 0 : da / (da - db), p = { x: g.a.x + (g.b.x - g.a.x) * Math.max(0, Math.min(1, t)), y: g.a.y + (g.b.y - g.a.y) * Math.max(0, Math.min(1, t)) };
        const k = along(s, p); if (k < -K.pointTol || k > s.L + K.pointTol) continue;
        if (Math.abs(across(s, p)) > K.pointTol) continue;
        pts.push(Math.max(0, Math.min(s.L, k)));
      }
      for (const c of D.columns) { if (Math.abs(across(s, c)) <= K.pointTol) { const k = along(s, c); if (k >= -K.pointTol && k <= s.L + K.pointTol) pts.push(Math.max(0, Math.min(s.L, k))); } }
      const wallIv = unionIv(cover.map(([a, b]) => [a, b]));
      const offIv = complementIv(s.L, wallIv).flatMap(([a, b]) => offs.map(([c, d, off, gid]) => [Math.max(a, c), Math.min(b, d), off, gid]).filter(([p, q]) => q - p > 0.05));
      for (const [a, b] of wallIv) U.overlay.supports.push({ wall: s.id, a: at(s, a), b: at(s, b), status: 'wall' });
      const offMerged = [];
      for (const [a, b, off, gid] of offIv) { U.overlay.supports.push({ wall: s.id, a: at(s, a), b: at(s, b), status: 'offset', offset: r2(off) }); offMerged.push([a, b]); if (b - a >= 0.5) add('warn', 'WALL_OFFSET', U.id, `الجدار ${s.id} (${U.name}) مُزاح ${Math.round(off * 100)} سم عن الجدار ${gid} تحته على طول ${fmt(b - a)} م: الحمل لا ينتقل مباشرة؛ مواءمة المحورين أو جسر تحته.`, [s.id, gid], { value: r2(off), length: r2(b - a) }); }
      // أجزاء بلا جدار تحتها: تُقسم عند الركائز النقطية
      const free = complementIv(s.L, [...wallIv, ...offMerged]);
      const supportMarks = [...wallIv.flat(), ...offMerged.flat(), ...pts];
      for (const [a, b] of free) {
        const inner = [...new Set(pts.filter(k => k > a + 0.05 && k < b - 0.05).map(k => Math.round(k * 1000) / 1000))].sort((x, y) => x - y);
        const cuts = [a, ...inner, b];
        for (let j = 0; j + 1 < cuts.length; j++) {
          const k0 = cuts[j], k1 = cuts[j + 1], len = k1 - k0; if (len < 0.05) continue;
          const supA = supportMarks.some(k => Math.abs(k - k0) < 0.06), supB = supportMarks.some(k => Math.abs(k - k1) < 0.06);
          const mid = at(s, (k0 + k1) / 2), overVoid = !inAny(mid, lowerOutline, 0.15);
          const status = overVoid ? 'void' : supA && supB ? 'bridge' : 'free-end';
          U.overlay.supports.push({ wall: s.id, a: at(s, k0), b: at(s, k1), status, len: r2(len) });
          const heavy = s.t >= K.heavyWall - 1e-6;
          if (status === 'void') add(len > K.cantInfo ? 'serious' : 'warn', 'WALL_OVER_VOID', U.id, `جزء من الجدار ${s.id} (${U.name}) بطول ${fmt(len)} م فوق فراغ غير مبني في ${D.name}: لا شيء تحته إلا بلاطة/جسر كابولي.`, [s.id], { length: r2(len) });
          else if (len > K.bridgeMax + 1e-6) add('serious', 'WALL_UNSUPPORTED', U.id, `الجدار ${s.id} (${U.name}) يمتد ${fmt(len)} م بلا جدار ولا عمود تحته في ${D.name} (أكثر من ${fmt(K.bridgeMax)} م): يحتاج جسرًا حاملًا يصممه مهندس إنشائي أو إعادة توزيع الجدران.`, [s.id], { length: r2(len), limit: K.bridgeMax });
          else if (status === 'free-end' && len >= K.cantInfo) add(heavy ? 'warn' : 'info', 'WALL_FREE_END', U.id, `طرف الجدار ${s.id} (${U.name}) بطول ${fmt(len)} م يتجاوز آخر ركيزة تحته: حمله على البلاطة/جسر كابولي.`, [s.id], { length: r2(len) });
          else if (len >= 0.5) add(heavy ? 'warn' : 'info', 'WALL_ON_BEAM', U.id, `الجدار ${s.id} (${U.name}${heavy ? '، سماكة ' + Math.round(s.t * 100) + ' سم' : ''}) محمول على جسر/بلاطة بطول ${fmt(len)} م بين ركيزتين في ${D.name} (لا جدار تحته).`, [s.id], { length: r2(len) });
        }
      }
    }
    // 2ب) استمرارية الأعمدة المقترحة
    let aligned = 0, offset = 0, onWall = 0, none = 0, mid = 0;
    for (const c of U.columns) {
      let best = null; for (const b of D.columns) { const dd = d2(b, c); if (!best || dd < best.d) best = { d: dd, b }; }
      const overVoid = !inAny(c, lowerOutline, 0.15);
      if (best && best.d <= K.colAlign) { aligned++; U.overlay.columnLinks.push({ up: c, down: best.b, status: 'aligned' }); continue; }
      // عمود وسيط اقترحته الوحدة نفسها (لا تقاطع في الرسم): يُعرض في الصورة دون ملاحظة؛ ملاحظة الجدار/البحر تحمل الخطورة
      if (c.reason === 'intermediate-no-junction' && !overVoid) { mid++; U.overlay.columnLinks.push({ up: c, down: best?.b, status: best && best.d <= K.colOffsetMax ? 'offset' : 'none', intermediate: true }); continue; }
      // (الجولة الحادية عشرة) ركن بروز صغير (≤ cantWarn عن حافة الدور السفلي): لا عمود هناك أصلًا — البلاطة كابولي يحكمه فحص
      // البروز (OVERHANG) بحدوده؛ فلا يُعد «عمودًا فوق فراغ» جسيمًا (كان الاقتراح الآلي للأعمدة في كل ركن يضع عمودًا في طرف الكابولي)
      const voidDist = overVoid ? Math.min(...lowerOutline.map(q => distToPoly(c, q)), Infinity) : 0;
      if (overVoid && voidDist <= K.cantWarn + 1e-6) { none++; U.overlay.columnLinks.push({ up: c, status: 'void' }); add('warn', 'COLUMN_CANTILEVER_CORNER', U.id, `ركن الدور ${U.name} عند (${fmt(c.x)}، ${fmt(c.y)}) بارز ${fmt(voidDist)} م عن ${D.name}: لا عمود في طرف الكابولي؛ البلاطة البارزة يقررها مهندس إنشائي (انظر ملاحظة البروز).`, [c.id], { value: r2(voidDist) }); continue; }
      if (overVoid) { none++; U.overlay.columnLinks.push({ up: c, status: 'void' }); add('serious', 'COLUMN_OVER_VOID', U.id, `العمود المقترح ${c.id} (${U.name}) عند (${fmt(c.x)}، ${fmt(c.y)}) فوق فراغ غير مبني في ${D.name} (${fmt(voidDist)} م عن حافته).`, [c.id], { value: r2(voidDist) }); continue; }
      if (best && best.d <= K.colOffsetMax) { offset++; U.overlay.columnLinks.push({ up: c, down: best.b, status: 'offset', d: r2(best.d) }); add('warn', 'COLUMN_OFFSET', U.id, `العمود المقترح ${c.id} (${U.name}) مُزاح ${Math.round(best.d * 100)} سم عن العمود ${best.b.id} تحته: الأفضل توحيد المحور بين الدورين.`, [c.id, best.b.id], { value: r2(best.d) }); continue; }
      const wallBelow = D.segs.find(g => distToSeg(c, g.a, g.b) <= K.lineTol);
      if (wallBelow) { onWall++; U.overlay.columnLinks.push({ up: c, status: 'on-wall', wall: wallBelow.id }); add('warn', 'COLUMN_ON_WALL', U.id, `العمود المقترح ${c.id} (${U.name}) يقع فوق الجدار ${wallBelow.id} لا فوق عمود: جدار البلوك لا يحمل عمودًا؛ يلزم عمود تحته أو جسر تحويل.`, [c.id, wallBelow.id]); continue; }
      none++; U.overlay.columnLinks.push({ up: c, status: 'none' });
      add('serious', 'COLUMN_PLANTED', U.id, `العمود المقترح ${c.id} (${U.name}) عند (${fmt(c.x)}، ${fmt(c.y)}) لا عمود ولا جدار تحته في ${D.name}${best ? ` (أقرب عمود على بعد ${fmt(best.d)} م)` : ''}: عمود مزروع على بلاطة/جسر.`, [c.id]);
    }
    U.columnContinuity = { total: U.columns.length, aligned, offset, onWall, none, intermediate: mid, pct: U.columns.length ? Math.round(100 * aligned / U.columns.length) : null };
    add('info', 'COLUMN_SUMMARY', U.id, `استمرارية الأعمدة المقترحة بين ${D.name} و${U.name}: ${aligned} من ${U.columns.length} على عمود تحته مباشرة، ${offset} مُزاحة، ${onWall} فوق جدار، ${none} بلا ركيزة${mid ? `، و${mid} وسيطة مقترحة بلا مقابل` : ''}.`, [], { value: U.columnContinuity.pct });

    // 2ج) فتحات الدور السفلي تحت جدران علوية (أعتاب/جسور)
    const smallLintels = [];
    for (const o of D.openings) {
      const s = D.segs.find(g => g.id === o.wall); if (!s) continue;
      const k0 = o.at - o.w / 2, k1 = o.at + o.w / 2;
      const over = U.segs.filter(q => parallel(s, q) && Math.abs(across(s, q.a)) <= K.lineTol + 1e-6).map(q => [Math.max(k0, Math.min(along(s, q.a), along(s, q.b))), Math.min(k1, Math.max(along(s, q.a), along(s, q.b))), q.id]).filter(([a, b]) => b - a >= 0.1);
      if (!over.length) continue;
      const rec = { opening: o.id, wall: s.id, upper: over.map(x => x[2]), a: at(s, k0), b: at(s, k1), w: r2(o.w), kind: o.kind };
      D.overlay.lintels.push({ ...rec, severity: o.w > K.lintelWarn + 1e-6 ? 'warn' : 'info' });
      if (o.w > K.lintelWarn + 1e-6) add('warn', 'LINTEL_SPAN', D.id, `فتحة ${o.id} (${D.name}) بعرض ${fmt(o.w)} م في الجدار ${s.id} وفوقها الجدار ${rec.upper.join('، ')} في ${U.name}: عتب/جسر بأكثر من ${fmt(K.lintelWarn)} م يحمل جدارًا — يحدد مقاسه مهندس إنشائي.`, [o.id, s.id, ...rec.upper], { value: r2(o.w), limit: K.lintelWarn });
      else smallLintels.push(rec);
    }
    if (smallLintels.length) add('info', 'LINTELS', D.id, `${smallLintels.length} فتحة في ${D.name} تحت جدران ${U.name} (أعرضها ${fmt(Math.max(...smallLintels.map(x => x.w)))} م): كل منها يحتاج عتبًا أو جسرًا يحمل الجدار العلوي.`, smallLintels.map(x => x.opening));

    // 2د) البروز (كابولي): أجزاء الدور العلوي خارج مسقط الذي تحته
    {
      const cell = K.cell * 2, ub = U.outlines.length ? bboxOf(U.outlines.flat()) : null; const cells = [];
      if (ub) for (let x = ub.x0 + cell / 2; x < ub.x1; x += cell) for (let y = ub.y0 + cell / 2; y < ub.y1; y += cell) {
        const p = { x, y }; if (!inAny(p, U.outlines)) continue;
        if (inAny(p, lowerOutline, 0.15)) continue;
        cells.push({ p, d: Math.min(...lowerOutline.map(q => distToPoly(p, q)), Infinity) });
      }
      const depth = cells.length ? Math.max(...cells.map(c => c.d)) : 0, areaOut = cells.length * cell * cell;
      if (cells.length && depth > K.cantInfo) {
        const sev = depth > K.cantSerious ? 'serious' : depth > K.cantWarn ? 'warn' : 'info';
        const bb = bboxOf(cells.map(c => c.p));
        U.overlay.overhang.push({ x0: bb.x0 - cell / 2, y0: bb.y0 - cell / 2, x1: bb.x1 + cell / 2, y1: bb.y1 + cell / 2, depth: r2(depth), area: r2(areaOut), cells: cells.map(c => c.p), severity: sev });
        add(sev, 'CANTILEVER', U.id, `${U.name} يبرز عن ${D.name} بعمق ${fmt(depth)} م (مساحة ≈ ${fmt(areaOut)} م²): بلاطة/جسور كابولية يحدد تصميمها مهندس إنشائي.`, [], { value: r2(depth) });
      }
    }

    // 2هـ) الحمامات العلوية فوق فراغات رطبة (لمسارات الصرف)
    {
      const ov = (a, b) => { const A = bboxOf(a.net), B = bboxOf(b.net); return Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0)) * Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0)); };
      const wetU = U.rooms.filter(r => WET.has(r.type) && r.type !== 'kitchen'), wetD = D.rooms.filter(r => WET.has(r.type));
      let stacked = 0;
      for (const r of wetU) {
        const onWet = wetD.filter(g => ov(r, g) >= Math.min(K.wetOverlap, r.area * 0.3));
        const below = D.rooms.filter(g => ov(r, g) >= 0.5).sort((a, b) => ov(r, b) - ov(r, a));
        U.overlay.wet.push({ room: r.id, poly: r.net, stacked: onWet.length > 0, below: below.map(g => g.name) });
        if (onWet.length) { stacked++; continue; }
        const sensitive = below.filter(g => DRY_SENSITIVE.has(g.type));
        add(sensitive.length ? 'warn' : 'info', 'WET_NOT_STACKED', U.id, `«${r.name}» (${U.name}) ليس فوق فراغ رطب؛ تحته ${below.length ? below.map(g => '«' + g.name + '»').join('، ') : 'لا فراغ'}: مواسير الصرف ستمر في سقف ${sensitive.length ? 'فراغ معيشي' : 'الفراغ السفلي'} أو تحتاج مسارًا رأسيًا مستقلًا (تنسيق MEP).`, [r.id, ...below.map(g => g.id)]);
      }
      U.wetStacking = { upper: wetU.length, stacked, pct: wetU.length ? Math.round(100 * stacked / wetU.length) : null };
    }

    // 2و) عدم الانتظام الرأسي: مساحة الدور العلوي ومركزه
    {
      const aU = U.outlines.reduce((s, p) => s + polyArea(p), 0), aD = D.outlines.reduce((s, p) => s + polyArea(p), 0);
      if (aU > 0 && aD > 0) {
        const cU = polyCentroid(U.outlines.reduce((a, b) => polyArea(b) > polyArea(a) ? b : a)), cD = polyCentroid(D.outlines.reduce((a, b) => polyArea(b) > polyArea(a) ? b : a));
        const bb = bboxOf(D.outlines.flat()), ex = Math.abs(cU.x - cD.x) / Math.max(1e-6, bb.x1 - bb.x0), ey = Math.abs(cU.y - cD.y) / Math.max(1e-6, bb.y1 - bb.y0);
        U.mass = { areaRatio: r2(aU / aD), eccX: r2(ex), eccY: r2(ey) };
        if (Math.max(ex, ey) > K.eccentric) add('info', 'MASS_ECCENTRIC', U.id, `مركز ${U.name} مُزاح عن مركز ${D.name} بنسبة ${Math.round(100 * Math.max(ex, ey))}% من البعد: عدم انتظام رأسي يُراعى في توزيع الأعمدة والجسور.`, [], { value: r2(Math.max(ex, ey)) });
      }
    }
  }

  // ---- (3) الدرج: فتحة البلاطة فوقه وغرفته
  if (levels.length > 1 && !(doc.stairs || []).length) add('serious', 'STAIR_MISSING', levels[1].id, 'المستند بأكثر من دور ولا درج فيه: لا وصول رأسي ولا فتحة بلاطة محددة.');
  for (const s of doc.stairs || []) {
    const li = levels.findIndex(l => l.id === s.level); if (li < 0) continue;
    const L = levels[li], U = levels[li + 1];
    const rise = U ? (doc.levels[li + 1].elevation ?? 0) - (doc.levels[li].elevation ?? 0) || (doc.levels[li].height || 3.2) : (doc.levels[li].height || 3.2);
    let lay; try { lay = stairLayout(s, rise); } catch { lay = null; }
    if (!lay) { add('warn', 'STAIR_LAYOUT', L.id, `تعذّر حساب هيئة الدرج ${s.id}.`, [s.id]); continue; }
    const foot = lay.steps.flatMap(st => st.poly), fb = bboxOf(foot);
    const probe = [{ x: (fb.x0 + fb.x1) / 2, y: (fb.y0 + fb.y1) / 2 }, ...foot];
    const hostOf = (lvl, pts) => { const hits = new Map(); for (const p of pts) { const r = lvl.rooms.find(q => pointInPolygon(p, q.net, 0.06)); hits.set(r ? r.id : null, (hits.get(r ? r.id : null) || 0) + 1); } return hits; };
    const hostL = hostOf(L, probe), mainL = [...hostL].sort((a, b) => b[1] - a[1])[0];
    const roomL = L.rooms.find(r => r.id === mainL?.[0]);
    if (hostL.has(null)) add('serious', 'STAIR_OUTSIDE', L.id, `الدرج ${s.id} (${L.name}) يخرج عن الفراغات المغلقة للمبنى.`, [s.id]);
    else if (hostL.size > 1) add('serious', 'STAIR_CROSSES_WALL', L.id, `الدرج ${s.id} (${L.name}) يعبر جدارًا بين ${[...hostL.keys()].map(id => '«' + (L.rooms.find(r => r.id === id)?.name || id) + '»').join(' و')}.`, [s.id]);
    else if (roomL && roomL.type !== 'stairs') add('info', 'STAIR_ROOM', L.id, `الدرج ${s.id} داخل «${roomL.name}» لا في غرفة درج مخصصة.`, [s.id, roomL.id]);
    if (!U) continue;
    const hole = lay.hole, hb = bboxOf(hole);
    const holePts = [{ x: (hb.x0 + hb.x1) / 2, y: (hb.y0 + hb.y1) / 2 }, ...hole.map(p => ({ x: p.x + Math.sign((hb.x0 + hb.x1) / 2 - p.x) * 0.08, y: p.y + Math.sign((hb.y0 + hb.y1) / 2 - p.y) * 0.08 }))];
    const hostU = hostOf(U, holePts);
    const okTypes = new Set(['stairs', 'corridor', 'living', 'entrance', 'void']);
    const crossing = U.segs.filter(g => { for (let k = 0.1; k < g.L - 0.1; k += 0.1) { const p = at(g, k); if (p.x > hb.x0 + 0.1 && p.x < hb.x1 - 0.1 && p.y > hb.y0 + 0.1 && p.y < hb.y1 - 0.1) return true; } return false; });
    const rec = { stair: s.id, hole, holeSize: { w: r2(hb.x1 - hb.x0), l: r2(hb.y1 - hb.y0) }, lowerRoom: roomL?.name || null, upperRooms: [...hostU.keys()].map(id => U.rooms.find(r => r.id === id)?.name || null), ok: true };
    if (hostU.has(null)) { rec.ok = false; add('serious', 'STAIR_HOLE_OUTSIDE', U.id, `فتحة بلاطة الدرج ${s.id} في ${U.name} (${fmt(rec.holeSize.w)}×${fmt(rec.holeSize.l)} م) لا تقع كلها داخل فراغ في ${U.name}: الدرج يصعد إلى خارج المبنى أو إلى جدار.`, [s.id]); }
    for (const id of [...hostU.keys()].filter(Boolean)) { const r = U.rooms.find(q => q.id === id); if (r && !okTypes.has(r.type)) { rec.ok = false; add('serious', 'STAIR_HOLE_ROOM', U.id, `فتحة بلاطة الدرج ${s.id} تقع في «${r.name}» (${U.name}) لا في غرفة الدرج أو فراغ حركة.`, [s.id, r.id]); } }
    if (crossing.length) { rec.ok = false; add('serious', 'STAIR_HOLE_WALL', U.id, `جدار ${crossing.map(g => g.id).join('، ')} في ${U.name} يمر فوق فتحة بلاطة الدرج ${s.id}.`, [s.id, ...crossing.map(g => g.id)]); }
    const upStair = U.rooms.filter(r => r.type === 'stairs');
    if (roomL?.type === 'stairs' && upStair.length) {
      const B = bboxOf(roomL.net), ovA = Math.max(...upStair.map(r => { const A = bboxOf(r.net); return Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0)) * Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0)); }));
      rec.stairRoomOverlap = r2(ovA / Math.max(1e-6, roomL.area));
      if (ovA < 0.7 * roomL.area) add('warn', 'STAIR_ROOM_STACK', U.id, `غرفة الدرج في ${U.name} لا تتراكب مع غرفة الدرج في ${L.name} (تداخل ${Math.round(100 * ovA / roomL.area)}%).`, [s.id]);
    }
    L.overlay.stair.push({ ...rec, foot: lay.steps.map(st => st.poly) }); U.overlay.stair.push(rec);
    if (rec.ok) add('info', 'STAIR_HOLE', U.id, `فتحة بلاطة الدرج ${s.id} ≈ ${fmt(rec.holeSize.w)}×${fmt(rec.holeSize.l)} م في «${rec.upperRooms.filter(Boolean).join('، ')}» فوق «${rec.lowerRoom}»: حوافها تحتاج جسورًا حولها.`, [s.id]);
  }

  // ---- (4) الفتحات التي يقع فيها عمود مقترح (تقاطع جدار داخل فتحة)
  for (const L of levels) for (const o of L.openings) {
    const s = L.segs.find(g => g.id === o.wall); if (!s) continue;
    const k0 = o.at - o.w / 2, k1 = o.at + o.w / 2;
    for (const c of L.columns) {
      if (c.reason === 'intermediate-no-junction') continue; // موضعه اختيار المقترِح لا تقاطع في الرسم (يُعلن أدناه إن لم يجد موضعًا)
      if (Math.abs(across(s, c)) > s.t / 2 + 0.05) continue;
      const k = along(s, c); if (k <= k0 + 0.1 || k >= k1 - 0.1) continue;
      L.overlay.conflicts.push({ opening: o.id, column: c.id, x: c.x, y: c.y });
      add('serious', 'COLUMN_IN_OPENING', L.id, `العمود المقترح ${c.id} (تقاطع جدران) يقع داخل الفتحة ${o.id} في الجدار ${s.id} (${L.name}).`, [c.id, o.id, s.id]);
    }
  }

  for (const L of levels) {
    const mids = L.columns.filter(c => c.reason === 'intermediate-no-junction');
    if (mids.length) add('info', 'COLUMN_INTERMEDIATE', L.id, `${mids.length} عمود وسيط مقترح في ${L.name} على خطوط جدران أطول من ${fmt(K.beamSpan)} م بلا تقاطع مناسب${mids.some(c => c.inOpening) ? '؛ وبعضها لم يجد موضعًا خارج الفتحات' : ''}.`, mids.map(c => c.id));
  }

  // ---- (5) شكل المسقط
  {
    const G = levels[0];
    if (G?.outlines.length) {
      const main = G.analysis.outlines.reduce((a, b) => b.area > a.area ? b : a), rect = minRect(main.polygon), aspect = rect.w > 0 ? rect.l / rect.w : 0, fill = main.area / Math.max(1e-6, rect.w * rect.l);
      G.shape = { aspect: r2(aspect), fill: r2(fill), w: r2(rect.w), l: r2(rect.l), parts: G.outlines.length };
      if (aspect > K.aspectWarn) add('warn', 'PLAN_ASPECT', G.id, `المسقط ممتد بنسبة ${fmt(aspect)}:1 (${fmt(rect.l)}×${fmt(rect.w)} م): مبنى طويل ضيق يحتاج انتباهًا لفواصل التمدد والأحمال الجانبية.`, [], { value: r2(aspect) });
      if (fill < K.reentrant) add('info', 'PLAN_IRREGULAR', G.id, `المسقط غير منتظم (زوايا داخلة؛ يملأ ${Math.round(fill * 100)}% من مستطيله): يُراعى في توزيع العناصر المقاومة للأحمال الجانبية.`, [], { value: r2(fill) });
      if (G.outlines.length > 1) add('info', 'PLAN_PARTS', G.id, `المسقط الأرضي من ${G.outlines.length} كتل منفصلة: كل كتلة تُدرس إنشائيًا وحدها أو بفاصل.`);
    }
  }

  // ---- الخلاصة
  findings.sort((a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || String(a.level).localeCompare(String(b.level)));
  findings.forEach((f, i) => { f.id = 'F' + (i + 1); });
  const counts = { serious: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  const summary = `${PRECHECK_DISCLAIMER}. ${doc.levels.length} ${doc.levels.length > 1 ? 'أدوار' : 'دور'}؛ ملاحظات جسيمة ${counts.serious}، وتنبيهات ${counts.warn}، ومعلومات ${counts.info}. `
    + (counts.serious ? 'الملاحظات الجسيمة تستلزم مراجعة مهندس إنشائي قبل اعتماد المخطط.' : 'غياب الملاحظات الجسيمة هنا لا يعني اعتمادًا إنشائيًا؛ التحقق الهندسي المتخصص لازم في كل الأحوال.');
  return {
    disclaimer: PRECHECK_DISCLAIMER, version: PRECHECK_VERSION, status: 'preliminary', limits: K, limitsNote: LIMITS_NOTE,
    assumptions: [
      'هيكل خرساني مسلح (أعمدة وجسور وبلاطات) وجدران بلوك غير حاملة، وهو الشائع في الفلل السعودية؛ إن كان النظام جدرانًا حاملة تتغير القراءة.',
      'شبكة الأعمدة مقترحة آليًا عند تقاطعات الجدران للمراجعة فقط، لا مواقع ولا مقاسات نهائية.',
      'البحر الصافي يُقاس من حدود الفراغ الداخلية (ضعف أكبر بُعد عن الجدران).',
    ],
    notChecked: ['الأحمال وقيمها وتجميعها', 'مقاسات العناصر وتسليحها', 'الأحمال الجانبية (رياح/زلازل)', 'الأساسات والتربة', 'الانحرافات والاهتزاز', 'متطلبات كود البناء السعودي SBC 301/304 نصًا'],
    levels: levels.map(L => ({ id: L.id, name: L.name, disclaimer: PRECHECK_DISCLAIMER, columns: L.columns, maxSpan: L.maxSpan || null, columnContinuity: L.columnContinuity || null, wetStacking: L.wetStacking || null, mass: L.mass || null, shape: L.shape || null, overlay: L.overlay })),
    findings, counts, summary,
  };
}

/** نص عربي مختصر للعرض (كل سطر ملاحظة)، ويبدأ دائمًا بالتنبيه. */
export function precheckTextAr(report, { max = 30 } = {}) {
  const tag = { serious: 'جسيمة', warn: 'تنبيه', info: 'معلومة' };
  return [PRECHECK_DISCLAIMER, report.summary, ...report.findings.slice(0, max).map(f => `• [${tag[f.severity]}] ${f.message}`), LIMITS_NOTE].join('\n');
}

export default { structuralPrecheck, proposeColumnGrid, clearSpan, precheckTextAr, PRECHECK_DISCLAIMER, PRECHECK_LIMITS, PRECHECK_VERSION };
