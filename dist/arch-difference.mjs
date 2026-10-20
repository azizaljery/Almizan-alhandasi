// الاختلاف المعماري بين مخططين (arch-difference): هل البديلان مختلفان في التنظيم فعلًا، أم أحدهما نسخة شكلية من الآخر؟
// شرط المالك: «يجب أن تكون البدائل الأربعة أو الخمسة مختلفة معماريًا في توزيع الغرف والحركة والعلاقات، لا مجرد اختلافات شكلية.»
//
// يقيس ثلاثة أشياء من المستند المرسوم وحده (mizan-draw/1 عبر analyzeDoc)، وكلها لا تتأثر بالانعكاس يمينًا ويسارًا ولا بالأسماء:
//  (أ) رسم التجاور (adjacency): عقدة لكل غرفة بفئتها الوظيفية + عقدة «الخارج»، وحافة لكل باب أو فتحة بين فراغين.
//      المسافة = مسافة تحرير الرسم (GED) المطبَّعة بتقريب Riesen–Bunke (تعيين ثنائي بالخوارزمية المجرية على تكاليف
//      العقد وجوارها المنقّح بـ Weisfeiler–Lehman، ثم حساب كلفة مسار التحرير الناتج فعلًا: عقد + حواف)، مقسومة على
//      كلفة حذف الرسمين كاملين (|V1|+|V2|+|E1|+|E2|) فتقع في 0..1. التقريب حدّ أعلى للـ GED الدقيق.
//  (ب) طوبولوجيا الحركة (circulation): لكل نطاق (ضيوف، عائلة، نوم، خدمة) تسلسل فئات الفراغات من المدخل إلى كل غرفة
//      (أقصر مسار، والأصغر معجميًا عند التعادل حتى لا يتغير بالانعكاس)، وتُقارن التسلسلات بتعيين على مسافة Levenshtein
//      المطبّعة؛ ومعها عدد الممرات وطولها الكلي.
//  (ج) ترتيب النطاقات على الأرض (zoning): شبكة 3×3 على صندوق المبنى موجّهة من الشارع (أمام/وسط/خلف × يسار/وسط/يمين
//      للواقف في الشارع)، وتوزيع مساحة كل نطاق على الخلايا؛ المسافة = متوسط مسافة نقل الكتلة (EMD بمسافة مانهاتن بين
//      الخلايا، مقسومة على خليتين) بين التوزيعين، والأصغر بين المقارنة المباشرة والمعكوسة يمينًا ويسارًا.
//  الإجمالي = 0.3·أ + 0.2·ب + 0.5·ج (WEIGHTS). الأوزان قيمة تصميمية معلنة، مُعايرة على أدلة القبول (evidence/review-proof/arch-difference.json).
//
// هذا منفصل تمامًا عن difference() القديم في scripts/acceptance-run.mjs (إزاحة مراكز الغرف المتناظرة بالاسم)، ولا يستبدله.
import { analyzeDoc } from './draw/digest.mjs';

export const ARCH_DIFF_VERSION = 'arch-difference/1.0.0';
/**
 * الأوزان: معايَرة على 10 أزواج حكم عليها إنسان من المساقط (6 «نفس التنظيم» و4 «مختلف»، scripts/arch-difference-run.mjs)
 * بأكبر هامش بين أعلى زوج «نفس التنظيم» وأدنى زوج «مختلف» مع ألا يقل وزن أي محور عن 0.2. أكبر هامش كان 0.2/0.2/0.6 (0.069)؛
 * اختير 0.3/0.2/0.5 (هامش 0.051) ليبقى نصف الوزن للتجاور والحركة كما يسمّيهما شرط المالك. المجموعة صغيرة: تُعاد المعايرة
 * كلما أُضيفت أحكام بشرية. ملاحظة القياس: بدائل after-4 متشابهة جدًا في التجاور (مدخل ← صالة ← ممر ← مدخل جناح ← غرفة)،
 * فيأتي معظم الاختلاف الحقيقي بينها من ترتيب النطاقات.
 */
export const WEIGHTS = Object.freeze({ adjacency: 0.3, circulation: 0.2, zoning: 0.5 });
/**
 * عتبات الحكم (قيمة تصميمية، معايَرة على after-4 و«قبل» والأزواج المعكوسة — evidence/review-proof/arch-difference.json (scripts/arch-difference-run.mjs)):
 *  < cosmetic  : نفس التنظيم (نسخة شكلية/معكوسة/أبعاد مختلفة فقط)
 *  < distinct  : اختلاف جزئي (يتغير جزء من التنظيم ويبقى الهيكل)
 *  ≥ distinct  : مختلف معماريًا
 */
export const THRESHOLDS = Object.freeze({ cosmetic: 0.18, distinct: 0.3 });
export const VERDICT_AR = Object.freeze({ cosmetic: 'نفس التنظيم (اختلاف شكلي)', partial: 'اختلاف جزئي', distinct: 'مختلف معماريًا' });

const CLASS = { bedroom: 'bed', master: 'master', majlis: 'majlis', living: 'living', dining: 'dining', kitchen: 'kitchen', service: 'service',
  bath: 'wet', laundry: 'wet', storage: 'store', corridor: 'circ', entrance: 'circ', stairs: 'stairs', office: 'office', courtyard: 'court', balcony: 'court', garage: 'garage', other: 'other' };
const ZONE = { majlis: 'guest', living: 'family', dining: 'family', bed: 'private', master: 'private', kitchen: 'service', service: 'service' };
export const ZONES = Object.freeze(['guest', 'family', 'private', 'service']);
const r3 = v => Math.round(v * 1000) / 1000;
const clsOf = r => CLASS[r.type] || 'other';

// ------------------------------------------------------------------------------------------- signature
/** كل ما يلزم للمقارنة من مستند واحد (يُحسب مرة ويُعاد استعماله في مصفوفة البدائل). */
export function archSignature(doc, model = analyzeDoc(doc)) {
  // عقدتا الخارج: OUT = أبواب المدخل المعلّمة (أو كل الأبواب الخارجية إن لم يُعلَّم شيء)، SVC = بقية الأبواب الخارجية (خدمة/جانبية)
  const nodes = [{ key: 'OUT', label: 'out', level: -1, zone: null }, { key: 'SVC', label: 'svc', level: -1, zone: null }], index = new Map([['OUT', 0], ['SVC', 1]]), edges = new Set();
  const flaggedAny = (model.levels[0]?.openings || []).some(op => op.door && op.o.entry && (!op.left || !op.right));
  const addEdge = (a, b) => { if (a === b) return; const k = a < b ? `${a}-${b}` : `${b}-${a}`; edges.add(k); };
  model.levels.forEach((lv, li) => {
    for (const r of lv.rooms) {
      if (r.unlabelled) continue;
      const c = clsOf(r);
      index.set(lv.level.id + ':' + r.id, nodes.length);
      nodes.push({ key: lv.level.id + ':' + r.id, label: (li ? `L${li}:` : '') + c, cls: c, level: li, zone: ZONE[c] || null, room: r });
    }
    for (const op of lv.openings) {
      if (!op.door) continue;
      const a = op.left && !op.left.unlabelled ? index.get(lv.level.id + ':' + op.left.id) : null, b = op.right && !op.right.unlabelled ? index.get(lv.level.id + ':' + op.right.id) : null;
      if (a != null && b != null) addEdge(a, b);
      else if (li === 0 && (a != null) !== (b != null) && op.kind !== 'garage' && !(op.left && op.right)) addEdge(!flaggedAny || op.o.entry ? 0 : 1, a ?? b);
    }
  });
  // السلالم تربط غرفة السلم في الدور بالغرفة فوقها
  for (let li = 0; li + 1 < model.levels.length; li++) {
    const lv = model.levels[li], up = model.levels[li + 1];
    for (const s of lv.stairs) {
      const a = s.room && index.get(lv.level.id + ':' + s.room), ru = up.roomAt({ x: s.x, y: s.y }), b = ru && index.get(up.level.id + ':' + ru.id);
      if (a != null && b != null) addEdge(a, b);
    }
  }
  const E = [...edges].map(k => k.split('-').map(Number));
  const adj = nodes.map(() => []);
  for (const [a, b] of E) { adj[a].push(b); adj[b].push(a); }
  // Weisfeiler–Lehman: تسميتان منقّحتان لتمييز العقد المتشابهة بفئتها حسب جوارها
  let wl = nodes.map(n => n.label);
  const wlLevels = [wl];
  for (let it = 0; it < 3; it++) { wl = nodes.map((n, i) => wl[i] + '|' + adj[i].map(j => wl[j]).sort().join(',')); wlLevels.push(wl); }

  // (ب) الحركة: أقصر مسار من المدخل (OUT)، والباب الخارجي الثانوي (SVC) بخطوة إضافية؛ والأصغر معجميًا عند التعادل
  //     (Dijkstra بأوزان واحدة، فلا يتغير التسلسل بالانعكاس ولا بترتيب الغرف في المستند)
  const dist = new Array(nodes.length).fill(Infinity), seq = new Array(nodes.length).fill(null), done = new Array(nodes.length).fill(false);
  dist[0] = 0; seq[0] = [];
  if (adj[1].length) { dist[1] = 1; seq[1] = ['svc']; }
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u] || (dist[i] === dist[u] && cmpSeq(seq[i], seq[u]) < 0))) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const v of adj[u]) {
      if (done[v] || v < 2) continue;
      const cand = [...seq[u], nodes[v].label];
      if (dist[u] + 1 < dist[v] || (dist[u] + 1 === dist[v] && cmpSeq(cand, seq[v]) < 0)) { dist[v] = dist[u] + 1; seq[v] = cand; }
    }
  }
  const routes = Object.fromEntries(ZONES.map(z => [z, []]));
  nodes.forEach((n, i) => { if (n.zone) routes[n.zone].push(seq[i] ? seq[i].slice(0, -1) : ['∅']); });
  const corridors = nodes.filter(n => n.room && n.room.type === 'corridor');
  const corridor = { count: corridors.length, length: r3(corridors.reduce((s, n) => s + n.room.rect.l, 0)) };

  // (ج) النطاقات على شبكة 3×3 موجّهة من الشارع، لكل دور
  const grids = model.levels.map((lv, li) => gridOf(doc, model, lv, nodes.filter(n => n.level === li && n.zone)));
  return { version: ARCH_DIFF_VERSION, nodes: nodes.map(({ room, ...n }) => n), edges: E, adj, wl: wlLevels, routes, corridor, grids, unreachable: nodes.filter((n, i) => i > 1 && dist[i] === Infinity).length };
}
function cmpSeq(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return a.length - b.length; }

/** محاور الشارع: front = اتجاه الخروج نحو شارع المدخل في إحداثيات المسقط، right = يمين الواقف في الشارع ناظرًا إلى البيت. */
function streetAxes(doc) {
  const side = doc.entry || (doc.entries || [])[0] || 's';
  const bearing = { n: 0, e: 90, s: 180, w: 270 }[side] ?? 180;
  const th = (bearing - (Number(doc.north) || 0)) * Math.PI / 180;
  const front = { x: Math.sin(th), y: Math.cos(th) };
  // الواقف في الشارع ينظر نحو -front؛ يمينه = تدوير -front بـ 90° مع عقارب الساعة
  const right = { x: front.y, y: -front.x };
  return { front, right };
}
function gridOf(doc, model, lv, zoneNodes) {
  const { front, right } = streetAxes(doc);
  const pts = lv.rooms.filter(r => !r.unlabelled).flatMap(r => r.net);
  if (!pts.length) return null;
  const P = p => ({ u: p.x * right.x + p.y * right.y, v: -(p.x * front.x + p.y * front.y) }); // u: يسار←يمين، v: أمام←خلف
  const us = pts.map(p => P(p).u), vs = pts.map(p => P(p).v);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  const cells = {};
  for (const z of ZONES) cells[z] = new Array(9).fill(0);
  for (const n of zoneNodes) {
    const poly = n.room.net.map(P);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const box = { u0: u0 + (u1 - u0) * col / 3, u1: u0 + (u1 - u0) * (col + 1) / 3, v0: v0 + (v1 - v0) * row / 3, v1: v0 + (v1 - v0) * (row + 1) / 3 };
      cells[n.zone][row * 3 + col] += clipArea(poly, box);
    }
  }
  return cells; // الصف 0 = الأمام (الشارع)، العمود 0 = يسار الواقف في الشارع
}
/** مساحة تقاطع مضلع مع مستطيل محاذٍ للمحاور (Sutherland–Hodgman). */
function clipArea(poly, b) {
  let out = poly;
  const clip = (inside, inter) => { const res = []; for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length], a = inside(p), c = inside(q); if (a) res.push(p); if (a !== c) res.push(inter(p, q)); } out = res; };
  const lerpU = (k) => (p, q) => { const t = (k - p.u) / (q.u - p.u); return { u: k, v: p.v + t * (q.v - p.v) }; };
  const lerpV = (k) => (p, q) => { const t = (k - p.v) / (q.v - p.v); return { u: p.u + t * (q.u - p.u), v: k }; };
  clip(p => p.u >= b.u0, lerpU(b.u0)); if (!out.length) return 0;
  clip(p => p.u <= b.u1, lerpU(b.u1)); if (!out.length) return 0;
  clip(p => p.v >= b.v0, lerpV(b.v0)); if (!out.length) return 0;
  clip(p => p.v <= b.v1, lerpV(b.v1)); if (out.length < 3) return 0;
  let s = 0; for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length]; s += p.u * q.v - q.u * p.v; }
  return Math.abs(s) / 2;
}

// -------------------------------------------------------------------------------------------- Hungarian
/** تعيين بأقل كلفة لمصفوفة مربعة (الخوارزمية المجرية، O(n³)). يعيد assign[i] = j. */
export function hungarian(cost) {
  const n = cost.length, INF = 1e18, u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Array(n + 1).fill(INF), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const assign = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]) assign[p[j] - 1] = j - 1;
  return assign;
}
const multisetGap = (a, b) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); let common = 0; for (const x of b) { const k = m.get(x) || 0; if (k) { common++; m.set(x, k - 1); } } return Math.max(a.length, b.length) - common; };

// ------------------------------------------------------------------------------------------- distances
/** (أ) GED مطبّع بين رسمي التجاور (0 = متماثلان). يعيد أيضًا تفصيل كلفة العقد والحواف. */
export function adjacencyDistance(A, B) {
  // التعيين الثنائي حدّ أعلى للـ GED؛ نحسبه في الاتجاهين ونأخذ الأصغر (أدق، ومتماثل)
  const x = adjacencyOneWay(A, B), y = adjacencyOneWay(B, A);
  return y.value < x.value ? { ...y, nodes: [...y.nodes].reverse(), edges: [...y.edges].reverse() } : x;
}
function adjacencyOneWay(A, B) {
  const n = A.nodes.length, m = B.nodes.length, N = n + m, BIG = 1e6;
  const nb = (S, i, lvl = 0) => S.adj[i].map(j => S.wl[lvl][j]);
  const C = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i < n && j < m) {
      const node = A.nodes[i].label === B.nodes[j].label ? 0 : 1;
      const edge = 0.5 * multisetGap(nb(A, i), nb(B, j));
      const refine = (A.wl[1][i] === B.wl[1][j] ? 0 : 0.15) + (A.wl[2][i] === B.wl[2][j] ? 0 : 0.1); // يفك التعادل بين المتشابهات
      C[i][j] = node + edge + refine;
    } else if (i < n && j >= m) C[i][j] = j - m === i ? 1 + 0.5 * A.adj[i].length : BIG;
    else if (i >= n && j < m) C[i][j] = i - n === j ? 1 + 0.5 * B.adj[j].length : BIG;
    else C[i][j] = 0;
  }
  const as = hungarian(C), f = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (as[i] < m) f[i] = as[i];
  // كلفة مسار التحرير الفعلية لتعيين f (عقد + حواف)، ثم تحسين محلي بتبديل أزواج التعيين (2-opt) ما دام يُنقص الكلفة:
  // يفك التعادل بين غرف متشابهة الجوار (غرفتا نوم على ممرين) الذي قد يخطئه التعيين الثنائي وحده
  const eB = new Set(B.edges.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
  const cost = g => {
    let nodeCost = 0; const mapped = new Set();
    for (let i = 0; i < n; i++) { if (g[i] < 0) nodeCost++; else { mapped.add(g[i]); if (A.nodes[i].label !== B.nodes[g[i]].label) nodeCost++; } }
    nodeCost += m - mapped.size;
    let kept = 0;
    for (const [a, b] of A.edges) { const x = g[a], y = g[b]; if (x >= 0 && y >= 0 && eB.has(x < y ? `${x}-${y}` : `${y}-${x}`)) kept++; }
    const edgeCost = A.edges.length - kept + B.edges.length - kept;
    return { nodeCost, edgeCost, total: nodeCost + edgeCost };
  };
  let best = cost(f);
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (f[i] === f[j]) continue;
      [f[i], f[j]] = [f[j], f[i]];
      const c = cost(f);
      if (c.total < best.total) { best = c; improved = true; } else [f[i], f[j]] = [f[j], f[i]];
    }
    if (!improved || best.total === 0) break;
  }
  const denom = n + m + A.edges.length + B.edges.length;
  return { value: denom ? r3(best.total / denom) : 0, nodeCost: best.nodeCost, edgeCost: best.edgeCost, nodes: [n, m], edges: [A.edges.length, B.edges.length] };
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] / Math.max(1, a.length, b.length);
}
/** مسافة بين قائمتي تسلسلات (تعيين بأقل كلفة، وغير المطابَق كلفته 1)، مطبّعة بالأكبر. */
function seqSetDistance(X, Y) {
  if (!X.length && !Y.length) return null;
  if (!X.length || !Y.length) return 1;
  const N = Math.max(X.length, Y.length), C = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i < X.length && j < Y.length ? lev(X[i], Y[j]) : 1)));
  const as = hungarian(C);
  return as.reduce((s, j, i) => s + C[i][j], 0) / N;
}
/** (ب) الحركة: تسلسلات الوصول لكل نطاق + عدد الممرات وطولها. */
export function circulationDistance(A, B) {
  const perZone = {};
  let s = 0, k = 0;
  for (const z of ZONES) { const d = seqSetDistance(A.routes[z], B.routes[z]); perZone[z] = d === null ? null : r3(d); if (d !== null) { s += d; k++; } }
  const routes = k ? s / k : 0;
  const cnt = Math.abs(A.corridor.count - B.corridor.count) / Math.max(1, A.corridor.count, B.corridor.count);
  const len = Math.abs(A.corridor.length - B.corridor.length) / Math.max(1, A.corridor.length, B.corridor.length);
  const corridors = 0.5 * cnt + 0.5 * len;
  return { value: r3(0.75 * routes + 0.25 * corridors), routes: r3(routes), perZone, corridors: r3(corridors), corridorA: A.corridor, corridorB: B.corridor };
}
const flipLR = g => g.map((_, i) => g[Math.floor(i / 3) * 3 + (2 - (i % 3))]);
/**
 * مسافة نقل الكتلة (Earth Mover's Distance) بين توزيعي نطاق على خلايا 3×3، بمسافة مانهاتن بين الخلايا، مقسومة على خليتين
 * (نقل النطاق كله خليتين = 1، والحد الأعلى 1). أثبت من مقارنة الخلايا خلية بخلية: انزلاق حدّ غرفة عبر خط الشبكة يكلّف
 * بقدر ما انتقل فعلًا لا خلية كاملة. تُحل بتدفق أقل كلفة صغير (9 مصادر × 9 مصبات).
 */
function emd(a, b) {
  const sa = a.reduce((x, y) => x + y, 0), sb = b.reduce((x, y) => x + y, 0);
  if (!sa && !sb) return null; if (!sa || !sb) return 1;
  const sup = a.map(x => x / sa), dem = b.map(x => x / sb);
  // نقل جشع على المسافات المرتبة يكفي هنا؟ لا: نستعمل أقصر مسار متتابع (مسافات صحيحة صغيرة) لضمان الأمثلية
  const d = (i, j) => Math.abs(Math.floor(i / 3) - Math.floor(j / 3)) + Math.abs((i % 3) - (j % 3));
  const flow = Array.from({ length: 9 }, () => new Array(9).fill(0));
  let cost = 0;
  for (let guard = 0; guard < 200; guard++) {
    // Bellman-Ford على الشبكة المتبقية: s→i (sup متبقٍ)، i→j (∞، كلفة d)، j→i (flow>0، كلفة -d)، j→t (dem متبقٍ)
    const N = 20, S = 18, T = 19, dist = new Array(N).fill(Infinity), prev = new Array(N).fill(null);
    dist[S] = 0;
    const ru = new Array(9).fill(0).map((_, i) => sup[i] - flow[i].reduce((x, y) => x + y, 0));
    const rv = new Array(9).fill(0).map((_, j) => dem[j] - flow.reduce((x, row) => x + row[j], 0));
    for (let it = 0; it < N; it++) {
      let ch = false;
      const relax = (u, v, c, cap) => { if (cap > 1e-12 && dist[u] + c < dist[v] - 1e-12) { dist[v] = dist[u] + c; prev[v] = { u, cap }; ch = true; } };
      for (let i = 0; i < 9; i++) relax(S, i, 0, ru[i]);
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { relax(i, 9 + j, d(i, j), Infinity); relax(9 + j, i, -d(i, j), flow[i][j]); }
      for (let j = 0; j < 9; j++) relax(9 + j, T, 0, rv[j]);
      if (!ch) break;
    }
    if (dist[T] === Infinity) break;
    let f = Infinity; for (let v = T; v !== S; v = prev[v].u) f = Math.min(f, prev[v].cap);
    if (f < 1e-9) break;
    for (let v = T; v !== S; v = prev[v].u) { const u = prev[v].u; if (u < 9 && v >= 9 && v < 18) flow[u][v - 9] += f; else if (u >= 9 && u < 18 && v < 9) flow[v][u - 9] -= f; }
    cost += f * dist[T];
  }
  return Math.min(1, cost / 2);
}
function gridDistance(gA, gB, flip) {
  let s = 0, k = 0; const perZone = {};
  for (const z of ZONES) { const d = emd(gA[z], flip ? flipLR(gB[z]) : gB[z]); perZone[z] = d === null ? null : r3(d); if (d !== null) { s += d; k++; } }
  return { value: k ? s / k : 0, perZone };
}
/** (ج) ترتيب النطاقات على شبكة 3×3 من الشارع؛ الأصغر بين المباشر والمعكوس يمينًا ويسارًا، لكل دور ثم المتوسط. */
export function zoningDistance(A, B) {
  const L = Math.max(A.grids.length, B.grids.length);
  let s = 0; const levels = [];
  for (let i = 0; i < L; i++) {
    const a = A.grids[i], b = B.grids[i];
    if (!a || !b) { levels.push({ level: i, value: 1 }); s += 1; continue; }
    const d0 = gridDistance(a, b, false), d1 = gridDistance(a, b, true), best = d1.value < d0.value ? { ...d1, mirrored: true } : { ...d0, mirrored: false };
    levels.push({ level: i, value: r3(best.value), mirrored: best.mirrored, perZone: best.perZone }); s += best.value;
  }
  return { value: r3(L ? s / L : 0), levels };
}
export function verdictOf(total) { return total < THRESHOLDS.cosmetic ? 'cosmetic' : total < THRESHOLDS.distinct ? 'partial' : 'distinct'; }

/**
 * الاختلاف المعماري بين مستندين (أو توقيعين جاهزين) في 0..1 مع التفصيل.
 * @returns {{ total, adjacency, circulation, zoning, verdict, verdict_ar, detail }}
 */
export function archDifference(a, b, { weights = WEIGHTS } = {}) {
  const A = a.version === ARCH_DIFF_VERSION ? a : archSignature(a), B = b.version === ARCH_DIFF_VERSION ? b : archSignature(b);
  const adj = adjacencyDistance(A, B), circ = circulationDistance(A, B), zon = zoningDistance(A, B);
  const wsum = weights.adjacency + weights.circulation + weights.zoning;
  const total = r3((weights.adjacency * adj.value + weights.circulation * circ.value + weights.zoning * zon.value) / wsum);
  const verdict = verdictOf(total);
  return { total, adjacency: adj.value, circulation: circ.value, zoning: zon.value, verdict, verdict_ar: VERDICT_AR[verdict], detail: { adjacency: adj, circulation: circ, zoning: zon } };
}

/** مصفوفة الاختلاف بين بدائل طلب واحد، مع الأزواج الشكلية فقط (أقل من عتبة cosmetic). */
export function archMatrix(docs, opts = {}) {
  const sig = docs.map(d => archSignature(d));
  const M = sig.map(() => new Array(sig.length).fill(0)), parts = [];
  for (let i = 0; i < sig.length; i++) for (let j = i + 1; j < sig.length; j++) {
    const d = archDifference(sig[i], sig[j], opts);
    M[i][j] = M[j][i] = d.total; parts.push({ i, j, total: d.total, adjacency: d.adjacency, circulation: d.circulation, zoning: d.zoning, verdict: d.verdict });
  }
  const totals = parts.map(p => p.total);
  return { matrix: M, pairs: parts, cosmeticPairs: parts.filter(p => p.verdict === 'cosmetic'), min: totals.length ? Math.min(...totals) : null, mean: totals.length ? r3(totals.reduce((x, y) => x + y, 0) / totals.length) : null };
}

export default { ARCH_DIFF_VERSION, WEIGHTS, THRESHOLDS, VERDICT_AR, ZONES, archSignature, archDifference, archMatrix, adjacencyDistance, circulationDistance, zoningDistance, verdictOf, hungarian };
