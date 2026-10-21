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

// (v2 أدناه؛ التصدير الافتراضي في آخر الملف يجمع الإصدارين)


// ============================================================================================ الإصدار 2
// الاختلاف الوظيفي (arch-difference/2): شرط المالك (الجولة التاسعة):
// «لا تعتبر اختلاف موقع السلم أو شكل المبنى وحده اختلافًا معماريًا كافيًا. يجب أن تختلف البدائل في توزيع الوظائف والحركة
//  والخصوصية والعلاقات بين الفراغات، وأن تقدم حلولًا معمارية حقيقية، لا نسخًا معدلة من المخطط نفسه.»
//
// أربعة أبعاد صريحة، كل منها 0..1، تُحسب لكل دور ثم تُجمع بوزن الدور (الأرضي 0.6، والعلوية 0.4 بالتساوي):
//  (أ) توزيع الوظائف zoning: لكل نطاق (ضيافة، عائلة، نوم، خدمة) عمقه من الشارع (أمام/وسط/خلف) و«طرفيّته» العرضية، ولكل زوج
//      نطاقات هل هما في الجهة نفسها أم متقابلان أم أحدهما في الوسط (لا يتغير بالانعكاس)، وتماسّه مع واجهة الشارع ومع الحديقة
//      (الواجهة الخلفية أو الحوش)، وتجاور النطاقات بالجدران المشتركة.
//      لا تدخل فيه غرف السلم ولا الفراغ المزدوج ولا الممرات والمداخل والمغاسل والحمامات الملحقة والخزائن ودورات مياه الضيوف.
//  (ب) بنية الحركة circulation: نوع التوزيع (موزّع بالصالة / محور ممر واحد / ممرات متفرعة) عبر «فراغ الوصول» لكل غرفة نوم،
//      وتسلسل كل مدخل حتى أول فراغ رئيسي (صالة أو مجلس)، وعمق غرف النوم بخطوات الرسم، وعدد قطع الممرات، وعدد حلقات الحركة.
//  (ج) تدرّج الخصوصية privacy: ترتيب النطاقات بعمقها من المدخل (عام ← خاص)، وطوبولوجيا فصل الضيوف عن العائلة
//      (باب مباشر / عبر فراغ عازل / منفصلان)، وطريقة الوصول إلى مجلس النساء.
//  (د) العلاقات الأساسية relations: المطبخ–الطعام–الصالة–الحديقة، باب خدمة المطبخ، المجلس–المدخل–دورة مياه الضيوف،
//      المجلس–الطعام، خدمة المجلس من المطبخ دون المرور بالصالة، الرئيسية–غرف الأبناء، كبار السن–الصالة، مجلس النساء–الصالة.
// السلم والفراغ المزدوج «شفافان»: كلفة المرور فيهما صفر، ولا يدخلان نطاقًا ولا علاقة، والعمق في الأدوار العلوية يُقاس من
// الصالة العلوية لا من نقطة وصول السلم. فلا يغيّر موضع السلم ولا شكل الغلاف شيئًا بذاته؛ يُذكران في الشرح «غير محتسبين».
// الحكم «مختلف معماريًا» يتطلب اختلافًا جوهريًا (≥ عتبة البعد SUBSTANTIVE_V2) في بعدين على الأقل من الأربعة.
export const ARCH_DIFF_V2_VERSION = 'arch-difference/2.0.0';
export const DIMENSIONS_V2 = Object.freeze(['zoning', 'circulation', 'privacy', 'relations']);
export const DIM_AR = Object.freeze({ zoning: 'توزيع الوظائف', circulation: 'بنية الحركة', privacy: 'تدرّج الخصوصية', relations: 'العلاقات الأساسية' });
/** وزن كل بعد في الإجمالي (للترتيب والمقارنة فقط؛ الحكم بعدد الأبعاد الجوهرية لا بالإجمالي). */
export const WEIGHTS_V2 = Object.freeze({ zoning: 0.3, circulation: 0.25, privacy: 0.2, relations: 0.25 });
/** عتبة «الاختلاف الجوهري» لكل بعد — معايَرة على أحكام بشرية من المساقط (scripts/functional-diff-run.mjs، HUMAN_V2). */
export const SUBSTANTIVE_V2 = Object.freeze({ zoning: 0.25, circulation: 0.25, privacy: 0.2, relations: 0.2 });
export const FLOOR_WEIGHTS_V2 = Object.freeze({ ground: 0.6, upper: 0.4 });
export const VERDICT_V2_AR = Object.freeze({ variant: 'نسخة معدّلة من التنظيم نفسه', partial: 'اختلاف جزئي (بُعد جوهري واحد)', distinct: 'مختلف معماريًا' });
const ZONE_AR = { guest: 'الضيافة', family: 'المعيشة العائلية', private: 'النوم', service: 'الخدمة' };
const DEPTH_AR = ['في الأمام', 'في الوسط', 'في الخلف'];

function fnOf(r) {
  const n = r.name || '', t = r.type;
  if (t === 'stairs') return 'stairs';
  if (t === 'void') return 'void';
  if (t === 'courtyard' || t === 'balcony') return 'court';
  if (t === 'majlis') return /نساء/.test(n) ? 'majlisW' : 'majlis';
  if (t === 'living') return 'living';
  if (t === 'dining') return 'dining';
  if (t === 'kitchen') return 'kitchen';
  if (t === 'service') return 'maid';
  if (t === 'laundry') return 'laundry';
  if (t === 'master') return 'master';
  if (t === 'bedroom') return /كبار السن|المسن/.test(n) ? 'elderly' : 'kid';
  if (t === 'office') return 'office';
  if (t === 'entrance') return 'entry';
  if (t === 'corridor') {
    if (/مدخل الرجال/.test(n)) return 'menEntry';
    if (/النساء/.test(n)) return 'womenCorr';
    if (/مدخل الجناح/.test(n)) return 'lobby';
    if (/مغاسل/.test(n)) return 'wash';
    return 'corridor';
  }
  if (t === 'bath') return /دورة مياه (الرجال|النساء|الضيوف)/.test(n) ? 'guestWC' : 'bath';
  if (t === 'storage') return 'closet';
  return 'other';
}
// (دورة مياه الضيوف لا تدخل النطاقات: ملحق صغير يصنع «تجاورًا» زائفًا بين الضيافة والنوم؛ علاقتها بالمجلس في البعد (د))
const ZONE2 = { majlis: 'guest', majlisW: 'guest', living: 'family', dining: 'family', office: 'family', kitchen: 'service', maid: 'service', laundry: 'service', master: 'private', kid: 'private', elderly: 'private' };
/** فراغات شفافة: المرور فيها بلا كلفة (السلم وبسطته، الفراغ المزدوج، مدخل الجناح، المغاسل) */
const ZERO = new Set(['stairs', 'void', 'landing', 'lobby', 'wash']);
const PRIVATE = new Set(['master', 'kid', 'elderly']);
const FN_AR = { landing: 'بسطة السلم', entry: 'مدخل العائلة', menEntry: 'مدخل الرجال', womenCorr: 'ممر النساء', corridor: 'ممر', living: 'الصالة', majlis: 'المجلس', majlisW: 'مجلس النساء', dining: 'الطعام', kitchen: 'المطبخ', maid: 'الخادمة', guestWC: 'دورة مياه الضيوف', master: 'الرئيسية', kid: 'غرفة نوم', elderly: 'كبار السن', office: 'مكتب', laundry: 'الغسيل', bath: 'حمام', closet: 'خزانة', other: 'فراغ' };
const ACCESS = ['hall', 'corridor', 'entry', 'room'];
const ACCESS_AR = { hall: 'الصالة', corridor: 'ممر', entry: 'مدخل', room: 'غرفة أخرى' };
const ROUTE_AR = { hall: 'موزّع بالصالة', spine: 'محور ممر واحد', branched: 'ممرات متفرعة (جناحان أو T)', mixed: 'مختلط', none: '—' };

const dot = (a, b) => a.x * b.x + a.y * b.y;
/** شبكة الفراغات للبيت كله: عقدتا الخارج (OUT مداخل، SVC أبواب خدمة)، وحواف الأبواب والفتحات، وروابط السلالم بين الأدوار. */
export function archSignatureV2(doc, model = analyzeDoc(doc)) {
  const { front, right } = streetAxes(doc);
  const nodes = [{ fn: 'OUT', li: -1 }, { fn: 'SVC', li: -1 }], idx = new Map();
  model.levels.forEach((lv, li) => {
    for (const r of lv.rooms) {
      if (r.unlabelled) continue;
      const fn = fnOf(r);
      idx.set(lv.level.id + ':' + r.id, nodes.length);
      nodes.push({ fn, li, zone: ZONE2[fn] || null, area: r.area, room: r, street: 0, rear: 0, court: false, openRear: false, openStreet: false, extDoor: false });
    }
  });
  const adj = nodes.map(() => new Set()), link = (a, b) => { if (a !== b) { adj[a].add(b); adj[b].add(a); } };
  const node = (lv, r) => (r && !r.unlabelled ? idx.get(lv.level.id + ':' + r.id) : undefined);
  model.levels.forEach((lv, li) => {
    for (const op of lv.openings) {
      const a = node(lv, op.left), b = node(lv, op.right);
      // فتحات على الحوش أو الخارج: علاقة بالحديقة/الشارع (أبواب ونوافذ)
      for (const s of op.sides || []) {
        const i = node(lv, s.room); if (i == null || !s.exterior) continue;
        const other = s.other !== 'outside' ? nodes[node(lv, lv.roomsById.get(s.other))] : null;
        if (other && other.fn === 'court') { nodes[i].court = true; continue; }
        const f = dot(s.outward, front);
        if (f > 0.7) nodes[i].openStreet = true; else if (f < -0.7) nodes[i].openRear = true;
      }
      if (!op.door) continue;
      const A = a != null ? nodes[a] : null, B = b != null ? nodes[b] : null;
      if (A && B) { if (A.fn !== 'court' && B.fn !== 'court') link(a, b); continue; }
      if (li !== 0 || op.kind === 'garage' || (op.left && op.right)) continue;
      const i = a ?? b; if (i == null || nodes[i].fn === 'court') continue;
      nodes[i].extDoor = true;
      const guestish = ['majlis', 'majlisW', 'menEntry', 'womenCorr', 'entry'].includes(nodes[i].fn);
      link(op.o.entry || guestish ? 0 : 1, i);
    }
    // تماسّ الواجهات (للتوزيع): حواف خارجية بطول ≥ 1.2 م تواجه الشارع أو الخلف
    for (const r of lv.rooms) {
      const i = node(lv, r); if (i == null) continue;
      const c = r.centroid || { x: 0, y: 0 };
      for (const e of r.edges) {
        if (!e.exterior || e.length < 1.2) continue;
        let o = e.out; const mid = { x: (e.a.x + e.b.x) / 2 - c.x, y: (e.a.y + e.b.y) / 2 - c.y };
        if (dot(o, mid) < 0) o = { x: -o.x, y: -o.y };
        const f = dot(o, front);
        if (f > 0.7) nodes[i].street += e.length; else if (f < -0.7) nodes[i].rear += e.length;
      }
    }
  });
  for (let li = 0; li + 1 < model.levels.length; li++) {
    const lv = model.levels[li], up = model.levels[li + 1];
    for (const s of lv.stairs) {
      const a = s.room && idx.get(lv.level.id + ':' + s.room), ru = up.roomAt({ x: s.x, y: s.y }), b = ru && node(up, ru);
      if (a != null && b != null) link(a, b);
    }
  }
  // بسطة السلم: ممر صغير (≤ 10 م²) ملاصق لغرفة السلم يُعدّ جزءًا من السلم (شفافًا)، فلا يصنع موضعُ السلم «ممرًا» جديدًا
  nodes.forEach((n, i) => { if (n.fn === 'corridor' && n.area <= 10 && [...adj[i]].some(j => nodes[j].fn === 'stairs')) n.fn = 'landing'; });
  const A = adj.map(s => [...s].sort((x, y) => x - y));
  // الإطار لكل دور: صندوق الغرف الموسومة عدا السلم والفراغ المزدوج، بمحورَي الشارع (u يسار←يمين، v أمام←خلف)
  const P = p => ({ u: p.x * right.x + p.y * right.y, v: -(p.x * front.x + p.y * front.y) });
  const floors = model.levels.map((lv, li) => {
    const rs = nodes.filter(n => n.li === li && n.room && !['stairs', 'void'].includes(n.fn));
    const pts = rs.flatMap(n => n.room.net.map(P));
    if (!pts.length) return null;
    const u0 = Math.min(...pts.map(p => p.u)), u1 = Math.max(...pts.map(p => p.u)), v0 = Math.min(...pts.map(p => p.v)), v1 = Math.max(...pts.map(p => p.v));
    const band = (poly, axis) => [0, 1, 2].map(k => clipArea(poly, axis === 'v' ? { u0: u0 - 1, u1: u1 + 1, v0: v0 + (v1 - v0) * k / 3, v1: v0 + (v1 - v0) * (k + 1) / 3 } : { u0: u0 + (u1 - u0) * k / 3, u1: u0 + (u1 - u0) * (k + 1) / 3, v0: v0 - 1, v1: v1 + 1 }));
    const zones = {};
    for (const n of rs) {
      if (!n.zone) continue;
      const poly = n.room.net.map(P), z = zones[n.zone] || (zones[n.zone] = { area: 0, depth: [0, 0, 0], lat: [0, 0, 0], street: 0, garden: 0 });
      const d = band(poly, 'v'), l = band(poly, 'u');
      for (let k = 0; k < 3; k++) { z.depth[k] += d[k]; z.lat[k] += l[k]; }
      z.area += n.area;
      if (n.street >= 1.2) z.street += n.area;
      if (n.rear >= 1.2 || n.court) z.garden += n.area;
    }
    // تماسّ النطاقات بطول الجدران المشتركة: أي النطاقات تتجاور فعلًا (الضيافة بجوار النوم؟ الخدمة بجوار الضيافة؟)
    const contact = {}, bySpace = new Map(rs.map(n => [n.room.spaceId, n]));
    for (const n of rs) {
      if (!n.zone) continue;
      for (const e of n.room.edges) { const m = e.space && bySpace.get(e.space); if (!m || !m.zone || m.zone === n.zone) continue; const k = [n.zone, m.zone].sort().join('-'); contact[k] = (contact[k] || 0) + e.length / 2; }
    }
    for (const k of Object.keys(contact)) contact[k] = r3(Math.min(1, contact[k] / 3)); // 3 م من الجدار المشترك = تجاور كامل
    for (const z of Object.values(zones)) { const s = z.depth.reduce((x, y) => x + y, 0) || 1, t = z.lat.reduce((x, y) => x + y, 0) || 1; z.depth = z.depth.map(x => r3(x / s)); z.lat = z.lat.map(x => r3(x / t)); z.street = r3(z.street / z.area); z.garden = r3(z.garden / z.area); }
    // الغلاف والسلم (للشرح «غير محتسب» فقط)
    const all = nodes.filter(n => n.li === li && n.room && n.fn !== 'court'), ap = all.flatMap(n => n.room.net.map(P));
    const au = ap.map(p => p.u), av = ap.map(p => p.v), aw = Math.max(...au) - Math.min(...au), ad = Math.max(...av) - Math.min(...av);
    const fp = all.reduce((s, n) => s + n.area, 0), aspect = aw / Math.max(0.1, ad);
    const st = nodes.filter(n => n.li === li && n.fn === 'stairs').map(n => {
      const c = P(n.room.centroid), v = (c.v - v0) / Math.max(0.1, v1 - v0), side = Math.abs((c.u - u0) / Math.max(0.1, u1 - u0) - 0.5) * 2;
      return { depth: Math.max(0, Math.min(2, Math.floor(3 * v))), side: side < 1 / 3 ? 'center' : 'side', v: r3(v), s: r3(side), dims: [r3(u1 - u0), r3(v1 - v0)] };
    });
    return { li, zones, contact, envelope: { fill: r3(fp / Math.max(1, aw * ad)), aspect: r3(aspect) }, stairs: st };
  });
  const sig = { version: ARCH_DIFF_V2_VERSION, nodes: nodes.map(({ room, ...n }) => ({ ...n, name: room?.name })), adj: A, levels: model.levels.length };
  sig.floors = floors.map((f, li) => f && { ...f, ...floorStructure(sig, li) });
  sig.relations = relationsOf(sig);
  return sig;
}

// ------------------------------------------------------------------------------------------ graph helpers
const costOf = n => (ZERO.has(n.fn) ? 0 : 1);
/** أقصر مسار بكلفة العقد: d[v] = مجموع كلف العقد المدخولة حتى v (شاملة v، دون المصدر). block(n) يمنع المرور (لا الوصول). */
function dij(sig, sources, block = () => false) {
  const N = sig.nodes.length, d = new Array(N).fill(Infinity), done = new Array(N).fill(false);
  for (const s of sources) d[s] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < N; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0) break; done[u] = true;
    if (!sources.includes(u) && (u < 2 || block(sig.nodes[u]))) continue;
    for (const v of sig.adj[u]) { const nd = d[u] + costOf(sig.nodes[v]); if (nd < d[v]) d[v] = nd; }
  }
  return d;
}
const idsOf = (sig, pred) => sig.nodes.map((n, i) => (i > 1 && pred(n) ? i : -1)).filter(i => i >= 0);
/** الكلفة الوسيطة الدنيا بين مجموعتين (0 = متجاورتان أو عبر فراغ شفاف). */
function gap(sig, A, B, block) {
  if (!A.length || !B.length) return null;
  let best = Infinity;
  for (const a of A) { const d = dij(sig, [a], block); for (const b of B) if (b !== a) best = Math.min(best, d[b] - costOf(sig.nodes[b])); }
  return best;
}
const closeness = g => (g == null ? null : g <= 0 ? 1 : g <= 1 ? 0.5 : 0);
/** أصل العمق لدور: الخارج للأرضي، والصالة العلوية (وإلا نقطة وصول السلم) للأدوار العلوية. */
function originOf(sig, li) {
  if (li === 0) return [0];
  const halls = idsOf(sig, n => n.li === li && n.fn === 'living');
  if (halls.length) return halls;
  const arr = idsOf(sig, n => n.li === li && sig.adj[sig.nodes.indexOf(n)]?.some(j => sig.nodes[j].li === li - 1));
  return arr.length ? arr : [0];
}
function floorStructure(sig, li) {
  const origin = originOf(sig, li), d = dij(sig, origin, n => n.li !== li && li > 0 && n.fn !== 'stairs');
  const here = idsOf(sig, n => n.li === li);
  const priv = here.filter(i => PRIVATE.has(sig.nodes[i].fn));
  // فراغ الوصول لكل غرفة نوم: أقرب جار (عبر الشفاف) بأقل عمق، بأولوية صالة > ممر > مدخل > غرفة (مستقل عن ترتيب المستند)
  const accessOf = i => {
    const seen = new Set([i]), q = [i], cand = [];
    while (q.length) { const u = q.shift(); for (const v of sig.adj[u]) { if (seen.has(v) || v < 2) continue; seen.add(v); const n = sig.nodes[v]; if (ZERO.has(n.fn)) { q.push(v); continue; } cand.push(v); } }
    const min = Math.min(...cand.map(v => d[v])); const best = cand.filter(v => d[v] === min && d[v] < d[i]);
    const cls = v => { const f = sig.nodes[v].fn; return f === 'living' ? 'hall' : ['corridor', 'womenCorr'].includes(f) ? 'corridor' : ['entry', 'menEntry'].includes(f) ? 'entry' : 'room'; };
    const cs = best.map(v => ({ v, c: cls(v) })).sort((x, y) => ACCESS.indexOf(x.c) - ACCESS.indexOf(y.c));
    return cs[0] || { v: -1, c: 'room' };
  };
  const acc = priv.map(i => ({ i, ...accessOf(i) }));
  const access = Object.fromEntries(ACCESS.map(k => [k, acc.filter(a => a.c === k).length]));
  const serving = [...new Set(acc.filter(a => a.c === 'corridor').map(a => a.v))];
  const n = acc.length || 1;
  const routeType = !acc.length ? 'none' : access.hall / n >= 0.6 ? 'hall' : (access.corridor / n >= 0.6 ? (serving.length >= 2 ? 'branched' : 'spine') : 'mixed');
  const corridors = here.filter(i => sig.nodes[i].fn === 'corridor').length;
  // حلقات الحركة: الرقم الحلقي للدور (حواف − عقد + مكوّنات) دون الحمامات والخزائن ودورات مياه الضيوف
  const core = here.filter(i => !['bath', 'closet', 'guestWC', 'court', 'other'].includes(sig.nodes[i].fn)), cs = new Set(core);
  let E = 0; for (const i of core) for (const j of sig.adj[i]) if (j > i && cs.has(j)) E++;
  const comp = (() => { const seen = new Set(); let c = 0; for (const s of core) { if (seen.has(s)) continue; c++; const q = [s]; seen.add(s); while (q.length) { const u = q.pop(); for (const v of sig.adj[u]) if (cs.has(v) && !seen.has(v)) { seen.add(v); q.push(v); } } } return c; })();
  const cycles = Math.max(0, E - core.length + comp);
  const privDepth = priv.map(i => d[i]).filter(Number.isFinite);
  const zoneDepth = {};
  for (const z of ZONES) { const ds = here.filter(i => sig.nodes[i].zone === z && !['guestWC'].includes(sig.nodes[i].fn)).map(i => d[i]).filter(Number.isFinite); if (ds.length) zoneDepth[z] = r3(ds.reduce((x, y) => x + y, 0) / ds.length); }
  const out = { origin: li === 0 ? 'OUT' : 'hall', access, routeType, servingCorridors: serving.length, corridors, cycles, privateDepth: privDepth.length ? r3(privDepth.reduce((x, y) => x + y, 0) / privDepth.length) : null, zoneDepth };
  if (li === 0) {
    // تسلسل كل مدخل حتى أول فراغ رئيسي (صالة/مجلس)، دون الشفاف
    const goals = new Set(idsOf(sig, n => n.li === 0 && ['living', 'majlis', 'majlisW'].includes(n.fn)));
    out.entries = sig.adj[0].map(s => {
      const prev = new Map([[s, null]]), q = [s]; let hit = goals.has(s) ? s : -1;
      while (q.length && hit < 0) { const u = q.shift(); for (const v of [...sig.adj[u]].sort((x, y) => sig.nodes[x].fn.localeCompare(sig.nodes[y].fn))) { if (prev.has(v) || v < 2) continue; prev.set(v, u); if (goals.has(v)) { hit = v; break; } q.push(v); } }
      const seq = []; for (let v = hit >= 0 ? hit : s; v != null; v = prev.get(v)) if (!ZERO.has(sig.nodes[v].fn)) seq.unshift(sig.nodes[v].fn);
      return seq;
    }).sort((a, b) => a.join().localeCompare(b.join()));
    // فصل الضيوف عن العائلة: الكلفة الوسيطة بين مجلس الرجال والصالة دون المرور بالخارج
    const g = gap(sig, idsOf(sig, n => n.li === 0 && n.fn === 'majlis'), idsOf(sig, n => n.li === 0 && n.fn === 'living'));
    out.separation = g == null ? null : g <= 0 ? 'direct' : g <= 1 ? 'buffered' : 'separate';
    const W = idsOf(sig, n => n.li === 0 && n.fn === 'majlisW');
    out.women = !W.length ? null : (() => {
      const w = W[0], nb = sig.adj[w].map(j => sig.nodes[j].fn);
      if (sig.adj[w].includes(0) || sig.adj[w].some(j => sig.nodes[j].fn === 'womenCorr' && sig.adj[j].includes(0))) return 'own';
      if (nb.includes('entry') || sig.adj[w].some(j => sig.nodes[j].fn === 'womenCorr' && sig.adj[j].some(k => sig.nodes[k].fn === 'entry'))) return 'familyEntrance';
      if (nb.includes('living')) return 'hall';
      return 'other';
    })();
  }
  return out;
}
const SEP_V = { direct: 1, buffered: 0.5, separate: 0 };
const SEP_AR = { direct: 'باب مباشر بين المجلس والصالة', buffered: 'عبر فراغ عازل واحد', separate: 'منفصلان تمامًا' };
const WOMEN_AR = { own: 'مدخل خاص من الخارج', familyEntrance: 'من مدخل العائلة', hall: 'من الصالة', other: 'عبر فراغ آخر' };

/** العلاقات الأساسية في البيت كله: { key: { li, value 0..1, ar } } (1 = متصلان مباشرة، 0.5 = عبر فراغ وسيط، 0 = بعيدان). */
function relationsOf(sig) {
  const R = {}, F = (fn, li) => idsOf(sig, n => n.fn === fn && (li == null || n.li === li));
  const put = (key, li, value) => { if (value != null) R[key] = { li, value: r3(value) }; };
  const L0 = F('living', 0), K = F('kitchen'), D = F('dining'), M = F('majlis'), MW = F('majlisW'), WC = F('guestWC'), MA = F('master'), KD = F('kid'), EL = F('elderly');
  const kl = K.length ? sig.nodes[K[0]].li : 0, liv = F('living', kl).length ? F('living', kl) : L0;
  put('kitchen-dining', kl, closeness(gap(sig, K, D)));
  put('dining-living', kl, closeness(gap(sig, D, liv)));
  put('kitchen-living', kl, closeness(gap(sig, K, liv)));
  if (liv.length) {
    const rear = i => sig.nodes[i].openRear, court = i => sig.nodes[i].court;
    put('living-garden', sig.nodes[liv[0]].li, liv.some(rear) ? 1 : D.some(rear) && closeness(gap(sig, D, liv)) === 1 ? 0.5 : 0);
    // الحوش الداخلي محورًا: الصالة (أو الطعام/الممر الملاصق لها) تنفتح على حوش
    put('living-courtyard', sig.nodes[liv[0]].li, liv.some(court) ? 1 : [...D, ...F('corridor', sig.nodes[liv[0]].li)].some(court) ? 0.5 : 0);
  }
  if (K.length) put('kitchen-serviceDoor', kl, K.some(i => sig.adj[i].includes(1) || sig.adj[i].includes(0)) ? 1 : K.some(i => sig.adj[i].some(j => ['maid', 'laundry'].includes(sig.nodes[j].fn) && (sig.adj[j].includes(1) || sig.adj[j].includes(0)))) ? 0.5 : 0);
  if (M.length) {
    const m = M[0], nb = sig.adj[m];
    put('majlis-entrance', 0, nb.includes(0) || nb.some(j => sig.nodes[j].fn === 'menEntry') ? 1 : nb.some(j => sig.nodes[j].fn === 'entry') ? 0.5 : 0);
    put('majlis-guestWC', 0, closeness(gap(sig, M, WC)));
    put('majlis-dining', 0, closeness(gap(sig, M, D)));
    const g = gap(sig, K, M, n => n.fn === 'living' || PRIVATE.has(n.fn));
    put('kitchen-majlis-service', 0, g == null ? 0 : g <= 1 ? 1 : g <= 2 ? 0.5 : 0);
  }
  if (MW.length) put('womenMajlis-living', 0, closeness(gap(sig, MW, L0)));
  if (MA.length && KD.length) {
    const fl = sig.nodes[MA[0]].li, same = KD.filter(i => sig.nodes[i].li === fl);
    put('master-kids', fl, !same.length ? 0 : (() => { const g = gap(sig, MA, same, n => PRIVATE.has(n.fn)); return g <= 1 ? 1 : g <= 2 ? 0.5 : 0; })());
  }
  if (EL.length) { const fl = sig.nodes[EL[0]].li; put('elderly-living', fl, fl !== 0 ? 0 : closeness(gap(sig, EL, L0))); }
  return R;
}
export const RELATION_AR = Object.freeze({
  'kitchen-dining': 'المطبخ–الطعام', 'dining-living': 'الطعام–الصالة', 'kitchen-living': 'المطبخ–الصالة', 'living-garden': 'الصالة–الحديقة الخلفية', 'living-courtyard': 'الصالة–الحوش الداخلي',
  'kitchen-serviceDoor': 'باب خدمة للمطبخ', 'majlis-entrance': 'المجلس–مدخله', 'majlis-guestWC': 'المجلس–دورة مياه الضيوف', 'majlis-dining': 'المجلس–الطعام',
  'kitchen-majlis-service': 'خدمة المجلس من المطبخ دون المرور بالصالة', 'womenMajlis-living': 'مجلس النساء–الصالة', 'master-kids': 'الرئيسية–غرف الأبناء', 'elderly-living': 'كبار السن–الصالة',
});
const REL_LEVEL_AR = v => (v >= 1 ? 'متصلان مباشرة' : v >= 0.5 ? 'عبر فراغ وسيط' : 'بعيدان/منفصلان');

// --------------------------------------------------------------------------------------------- distances
const emd1 = (p, q) => { let c = 0, s = 0; for (let k = 0; k < 2; k++) { c += p[k] - q[k]; s += Math.abs(c); } return Math.min(1, s / 2); };
const ZONE_PAIRS = ['family-guest', 'guest-private', 'guest-service', 'family-private', 'family-service', 'private-service'];
/** مركز النطاق: عمقه (0 أمام … 1 خلف) وموضعه العرضي (0 طرف … 1 الطرف الآخر) من توزيعه على الأشرطة. */
const cen = b => (b[1] + 2 * b[2]) / 2;
/**
 * (أ) التوزيع بلا انعكاس: لكل نطاق عمقه و«طرفيّته» (|موضعه العرضي − الوسط|)، ولكل زوج نطاقات علاقتهما العرضية
 * (في الجهة نفسها +1، متقابلان −1، أحدهما وسط 0) — وهذه لا تتغير بالانعكاس، فلا حاجة لاختيار انعكاس واحد للمبنى كله؛
 * ثم تماسّ الواجهات (الشارع/الحديقة) وتجاور النطاقات بالجدران.
 */
function zoningFloor(fa, fb) {
  const zs = ZONES.filter(z => fa.zones[z] || fb.zones[z]);
  const per = {}; let place = 0, facade = 0;
  for (const z of zs) {
    const a = fa.zones[z], b = fb.zones[z];
    if (!a || !b) { per[z] = 1; place += 1; facade += 1; continue; }
    const dd = Math.abs(cen(a.depth) - cen(b.depth)), ds = Math.abs(Math.abs(cen(a.lat) - 0.5) - Math.abs(cen(b.lat) - 0.5)) * 2;
    const v = Math.min(1, 1.5 * (0.6 * dd + 0.4 * ds));
    per[z] = r3(v); place += v; facade += (Math.abs(a.street - b.street) + Math.abs(a.garden - b.garden)) / 2;
  }
  const n = zs.length || 1;
  const pairs = ZONE_PAIRS.filter(k => k.split('-').every(z => fa.zones[z] && fb.zones[z]));
  const L = (f, k) => { const [x, y] = k.split('-'); return 4 * (cen(f.zones[x].lat) - 0.5) * (cen(f.zones[y].lat) - 0.5); };
  const latDiff = pairs.map(k => ({ k, d: Math.abs(L(fa, k) - L(fb, k)) / 2 }));
  const lateral = latDiff.length ? latDiff.reduce((s, x) => s + x.d, 0) / latDiff.length : 0;
  const cpairs = ZONE_PAIRS.filter(k => k.split('-').every(z => fa.zones[z] || fb.zones[z]));
  const cd = k => Math.abs((fa.contact[k] || 0) - (fb.contact[k] || 0));
  const contact = cpairs.length ? cpairs.reduce((s, k) => s + cd(k), 0) / cpairs.length : 0;
  const value = 0.4 * place / n + 0.3 * lateral + 0.15 * facade / n + 0.15 * contact;
  return { value, perZone: per, lateralChanged: latDiff.filter(x => x.d >= 0.5).map(x => x.k), contactDiff: cpairs.filter(k => cd(k) >= 0.5), parts: { place: r3(place / n), lateral: r3(lateral), facade: r3(facade / n), contact: r3(contact) } };
}
function circulationFloor(fa, fb, li) {
  const na = ACCESS.reduce((s, k) => s + fa.access[k], 0), nb = ACCESS.reduce((s, k) => s + fb.access[k], 0);
  // الثقة بعدد غرف النوم في الدور: غرفة واحدة (كبار السن في الأرضي) لا تحدد «نوع توزيع» الدور
  const conf = Math.min(1, Math.min(na, nb) / 3) || (na || nb ? 1 : 0);
  const access = conf * (na && nb ? ACCESS.reduce((s, k) => s + Math.abs(fa.access[k] / na - fb.access[k] / nb), 0) / 2 : na || nb ? 1 : 0);
  const route = conf * (fa.routeType === fb.routeType ? 0 : fa.routeType === 'mixed' || fb.routeType === 'mixed' ? 0.5 : 1);
  const depth = conf * (fa.privateDepth == null || fb.privateDepth == null ? 0 : Math.min(1, Math.abs(fa.privateDepth - fb.privateDepth) / 2));
  const corr = Math.min(1, Math.abs(fa.corridors - fb.corridors) / Math.max(3, fa.corridors, fb.corridors));
  const cyc = Math.min(1, Math.abs(fa.cycles - fb.cycles) / 2);
  const entries = li === 0 ? (seqSetDistance(fa.entries || [], fb.entries || []) ?? 0) : null;
  const parts = { access, route, depth, corridors: corr, cycles: cyc, entries };
  const W = li === 0 ? { access: 0.25, route: 0.15, entries: 0.2, depth: 0.15, corridors: 0.15, cycles: 0.1 } : { access: 0.3, route: 0.2, depth: 0.2, corridors: 0.2, cycles: 0.1 };
  let s = 0, w = 0; for (const [k, x] of Object.entries(W)) { s += x * parts[k]; w += x; }
  return { value: s / w, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v == null ? null : r3(v)])) };
}
function privacyFloor(fa, fb, li) {
  const zs = ZONES.filter(z => fa.zoneDepth[z] != null && fb.zoneDepth[z] != null);
  let disc = 0, pairs = 0, prof = 0;
  for (let i = 0; i < zs.length; i++) {
    prof += Math.min(1, Math.abs(fa.zoneDepth[zs[i]] - fb.zoneDepth[zs[i]]) / 2);
    for (let j = i + 1; j < zs.length; j++) {
      const x = fa.zoneDepth[zs[i]] - fa.zoneDepth[zs[j]], y = fb.zoneDepth[zs[i]] - fb.zoneDepth[zs[j]];
      const sx = Math.abs(x) < 0.5 ? 0 : Math.sign(x), sy = Math.abs(y) < 0.5 ? 0 : Math.sign(y);
      pairs++; if (sx !== sy) disc += sx && sy ? 1 : 0.5;
    }
  }
  const gradient = zs.length ? 0.6 * (pairs ? disc / pairs : 0) + 0.4 * (prof / zs.length) : 0;
  const parts = { gradient };
  if (li === 0) {
    parts.separation = fa.separation && fb.separation ? Math.abs(SEP_V[fa.separation] - SEP_V[fb.separation]) : fa.separation || fb.separation ? 1 : null;
    parts.women = fa.women && fb.women ? (fa.women === fb.women ? 0 : 1) : fa.women || fb.women ? 1 : null;
  }
  const W = { gradient: 0.5, separation: 0.3, women: 0.2 };
  let s = 0, w = 0; for (const [k, x] of Object.entries(parts)) if (x != null) { s += W[k] * x; w += W[k]; }
  return { value: w ? s / w : 0, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v == null ? null : r3(v)])) };
}
/** مجموعات العلاقات الأربع كما في شرط المالك؛ البعد = متوسط المجموعات الحاضرة (لا تذوب علاقة الرئيسية بالأبناء بين عشر علاقات). */
export const RELATION_GROUPS = Object.freeze({
  family: ['kitchen-dining', 'dining-living', 'kitchen-living', 'living-garden', 'living-courtyard', 'kitchen-serviceDoor'],
  bedrooms: ['master-kids'],
  elderly: ['elderly-living'],
  guest: ['majlis-entrance', 'majlis-guestWC', 'majlis-dining', 'kitchen-majlis-service', 'womenMajlis-living'],
});
function relationsFloor(A, B, li) {
  const keys = [...new Set([...Object.keys(A.relations), ...Object.keys(B.relations)])].filter(k => (A.relations[k]?.li ?? B.relations[k]?.li) === li);
  if (!keys.length) return null;
  const per = {};
  for (const k of keys) { const a = A.relations[k], b = B.relations[k]; per[k] = r3(a && b ? Math.abs(a.value - b.value) : 1); }
  const groups = Object.values(RELATION_GROUPS).map(g => g.filter(k => k in per)).filter(g => g.length);
  return { value: groups.reduce((s, g) => s + g.reduce((x, k) => x + per[k], 0) / g.length, 0) / groups.length, perRelation: per };
}
function floorWeights(L) { return L <= 1 ? [1] : [FLOOR_WEIGHTS_V2.ground, ...new Array(L - 1).fill(FLOOR_WEIGHTS_V2.upper / (L - 1))]; }
export function verdictV2(dims, thresholds = SUBSTANTIVE_V2) {
  const substantive = DIMENSIONS_V2.filter(k => dims[k] >= thresholds[k]);
  return { substantive, verdict: substantive.length >= 2 ? 'distinct' : substantive.length === 1 ? 'partial' : 'variant' };
}

/**
 * الاختلاف الوظيفي بين مستندين (أو توقيعين v2): أربعة أبعاد 0..1 لكل دور، وحكم بعدد الأبعاد الجوهرية.
 * @returns {{ total, zoning, circulation, privacy, relations, substantive, verdict, verdict_ar, floors, detail }}
 */
export function archDifferenceV2(a, b, { thresholds = SUBSTANTIVE_V2, weights = WEIGHTS_V2 } = {}) {
  const A = a.version === ARCH_DIFF_V2_VERSION ? a : archSignatureV2(a), B = b.version === ARCH_DIFF_V2_VERSION ? b : archSignatureV2(b);
  const L = Math.max(A.floors.length, B.floors.length), fw = floorWeights(L);
  const run = () => {
    const floors = [];
    for (let li = 0; li < L; li++) {
      const fa = A.floors[li], fb = B.floors[li];
      if (!fa || !fb) { floors.push({ li, missing: true, zoning: 1, circulation: 1, privacy: 1, relations: 1 }); continue; }
      const z = zoningFloor(fa, fb), c = circulationFloor(fa, fb, li), p = privacyFloor(fa, fb, li), r = relationsFloor(A, B, li);
      floors.push({ li, zoning: r3(z.value), circulation: r3(c.value), privacy: r3(p.value), relations: r ? r3(r.value) : null, detail: { zoning: z.perZone, zoningParts: z.parts, zoningLateral: z.lateralChanged, zoningContact: z.contactDiff, circulation: c.parts, privacy: p.parts, relations: r?.perRelation || null } });
    }
    return floors;
  };
  const floors = run();
  const dims = {};
  for (const k of DIMENSIONS_V2) { let s = 0, w = 0; floors.forEach((f, i) => { if (f[k] != null) { s += fw[i] * f[k]; w += fw[i]; } }); dims[k] = r3(w ? s / w : 0); }
  const wsum = DIMENSIONS_V2.reduce((s, k) => s + weights[k], 0);
  const total = r3(DIMENSIONS_V2.reduce((s, k) => s + weights[k] * dims[k], 0) / wsum);
  const v = verdictV2(dims, thresholds);
  return { version: ARCH_DIFF_V2_VERSION, total, ...dims, substantive: v.substantive, verdict: v.verdict, verdict_ar: VERDICT_V2_AR[v.verdict], floors, sigA: A, sigB: B };
}

/** مصفوفة v2 بين بدائل طلب واحد، مع الأزواج التي هي «نسخ معدّلة» أو «اختلاف جزئي». */
export function archMatrixV2(docs, opts = {}) {
  const sig = docs.map(d => (d.version === ARCH_DIFF_V2_VERSION ? d : archSignatureV2(d)));
  const M = sig.map(() => new Array(sig.length).fill(0)), pairs = [];
  for (let i = 0; i < sig.length; i++) for (let j = i + 1; j < sig.length; j++) {
    const d = archDifferenceV2(sig[i], sig[j], opts);
    M[i][j] = M[j][i] = d.total;
    pairs.push({ i, j, total: d.total, zoning: d.zoning, circulation: d.circulation, privacy: d.privacy, relations: d.relations, substantive: d.substantive, verdict: d.verdict });
  }
  return { matrix: M, pairs, variantPairs: pairs.filter(p => p.verdict === 'variant'), partialPairs: pairs.filter(p => p.verdict === 'partial') };
}

// ------------------------------------------------------------------------------------------- explanation
const domBand = z => DEPTH_AR[z.depth.indexOf(Math.max(...z.depth))];
const latAr = z => (z.lat[1] >= Math.max(z.lat[0], z.lat[2]) ? 'وسطًا' : 'على طرف');
const posAr = z => `${domBand(z)} ${latAr(z)}${z.street >= 0.5 ? '، على الشارع' : ''}${z.garden >= 0.5 ? '، على الحديقة' : ''}`;
const FLOOR_AR = li => (li === 0 ? 'الدور الأرضي' : li === 1 ? 'الدور الأول' : `الدور ${li}`);
const ORDER_AR = zd => Object.entries(zd).sort((x, y) => x[1] - y[1]).map(([z]) => ZONE_AR[z]).join(' ثم ');

/**
 * شرح عربي للاختلاف بين بديلين: جملة لكل بعد (مختلف جوهريًا أم لا ولماذا)، و«غير محتسب» لموضع السلم والغلاف.
 * @returns {{ verdict, verdict_ar, substantive, dims, sentences: string[], ignored: string[], text }}
 */
export function explainDifference(a, b, opts = {}) {
  const d = a && a.verdict && a.floors && a.sigA ? a : archDifferenceV2(a, b, opts);
  const A = d.sigA, B = d.sigB, T = opts.thresholds || SUBSTANTIVE_V2, out = [];
  const tag = k => (d.substantive.includes(k) ? 'مختلف جوهريًا' : 'متقارب');
  for (const k of DIMENSIONS_V2) {
    const notes = [];
    d.floors.forEach(f => {
      if (f.missing) { notes.push(`${FLOOR_AR(f.li)} موجود في بديل واحد فقط`); return; }
      const fa = A.floors[f.li], fb = B.floors[f.li];
      if (k === 'zoning') for (const p of f.detail.zoningContact || []) { const [x, y] = p.split('-'); notes.push(`${FLOOR_AR(f.li)}: ${ZONE_AR[x]} و${ZONE_AR[y]} ${(fa.contact[p] || 0) >= 0.5 ? 'متجاوران' : 'غير متجاورين'} ← ${(fb.contact[p] || 0) >= 0.5 ? 'متجاوران' : 'غير متجاورين'}`); }
      if (k === 'zoning') for (const p of f.detail.zoningLateral || []) { const [x, y] = p.split('-'); const rel = F => { const v = 4 * (cen(F.zones[x].lat) - 0.5) * (cen(F.zones[y].lat) - 0.5); return v > 0.25 ? 'في الجهة نفسها' : v < -0.25 ? 'في جهتين متقابلتين' : 'أحدهما في الوسط'; }; notes.push(`${FLOOR_AR(f.li)}: ${ZONE_AR[x]} و${ZONE_AR[y]} ${rel(fa)} ← ${rel(fb)}`); }
      if (k === 'zoning') for (const z of ZONES) {
        const x = fa.zones[z], y = fb.zones[z];
        if (!x || !y) { if (x || y) notes.push(`${FLOOR_AR(f.li)}: ${ZONE_AR[z]} في بديل واحد فقط`); continue; }
        if ((f.detail.zoning[z] || 0) >= 0.3) notes.push(`${FLOOR_AR(f.li)}: ${ZONE_AR[z]} ${posAr(x)} ← ${posAr(y)}`);
      }
      if (k === 'circulation') {
        if (fa.routeType !== fb.routeType) notes.push(`${FLOOR_AR(f.li)}: نوع التوزيع ${ROUTE_AR[fa.routeType]} ← ${ROUTE_AR[fb.routeType]}`);
        if (fa.corridors !== fb.corridors) notes.push(`${FLOOR_AR(f.li)}: قطع الممرات ${fa.corridors} ← ${fb.corridors}`);
        if (fa.privateDepth != null && fb.privateDepth != null && Math.abs(fa.privateDepth - fb.privateDepth) >= 0.5) notes.push(`${FLOOR_AR(f.li)}: عمق غرف النوم من ${f.li ? 'الصالة العلوية' : 'المدخل'} ${fa.privateDepth} ← ${fb.privateDepth} خطوة`);
        if (fa.cycles !== fb.cycles) notes.push(`${FLOOR_AR(f.li)}: حلقات الحركة ${fa.cycles} ← ${fb.cycles}`);
        if (f.li === 0 && (f.detail.circulation.entries || 0) >= 0.2) notes.push(`تسلسل المداخل: ${(fa.entries || []).map(s => s.map(x => FN_AR[x] || x).join('→')).join('، ')} ← ${(fb.entries || []).map(s => s.map(x => FN_AR[x] || x).join('→')).join('، ')}`);
      }
      if (k === 'privacy') {
        const oa = ORDER_AR(fa.zoneDepth), ob = ORDER_AR(fb.zoneDepth);
        if ((f.detail.privacy.gradient || 0) >= 0.15) notes.push(`${FLOOR_AR(f.li)}: ترتيب النطاقات من الأعم إلى الأخص كان «${oa}» فصار «${ob}»`);
        if (f.li === 0 && fa.separation !== fb.separation) notes.push(`فصل الضيوف عن العائلة: ${SEP_AR[fa.separation] || '—'} ← ${SEP_AR[fb.separation] || '—'}`);
        if (f.li === 0 && fa.women !== fb.women) notes.push(`الوصول إلى مجلس النساء: ${WOMEN_AR[fa.women] || 'لا يوجد'} ← ${WOMEN_AR[fb.women] || 'لا يوجد'}`);
      }
      if (k === 'relations' && f.detail.relations) for (const [r, v] of Object.entries(f.detail.relations)) if (v > 0) {
        const x = A.relations[r], y = B.relations[r];
        notes.push(`${RELATION_AR[r]}: ${x ? REL_LEVEL_AR(x.value) : 'غير موجود'} ← ${y ? REL_LEVEL_AR(y.value) : 'غير موجود'}`);
      }
    });
    out.push(`${DIM_AR[k]} (${d[k]}، العتبة ${T[k]}): ${tag(k)}${notes.length ? ' — ' + notes.join('؛ ') : ' — لا تغيير يُذكر'}.`);
  }
  // غير محتسب بذاته: موضع السلم وشكل الغلاف
  const ignored = [];
  for (let li = 0; li < Math.min(A.floors.length, B.floors.length); li++) {
    const fa = A.floors[li], fb = B.floors[li]; if (!fa || !fb) continue;
    const sa = fa.stairs[0], sb = fb.stairs[0];
    // انتقل السلم: تغيّر شريطه أو انزاح ≥ 2 م عمقًا أو عرضًا في إطار الدور
    const moved = sa && sb && (sa.depth !== sb.depth || sa.side !== sb.side || Math.abs(sa.v - sb.v) * sa.dims[1] >= 2 || Math.abs(sa.s - sb.s) * sa.dims[0] / 2 >= 2);
    const where = x => `${DEPTH_AR[x.depth]} ${x.side === 'center' ? 'وسطًا' : 'على طرف'}`;
    if (moved) ignored.push(`${FLOOR_AR(li)}: موضع السلم تغيّر (${where(sa) === where(sb) ? `انزاح نحو ${Math.round(Math.hypot((sa.v - sb.v) * sa.dims[1], (sa.s - sb.s) * sa.dims[0] / 2))} م ${where(sa)}` : `${where(sa)} ← ${where(sb)}`})`);
    if (Math.abs(fa.envelope.fill - fb.envelope.fill) > 0.06 || Math.abs(Math.log(fa.envelope.aspect / fb.envelope.aspect)) > 0.15) ignored.push(`${FLOOR_AR(li)}: شكل الغلاف تغيّر (الامتلاء ${fa.envelope.fill} ← ${fb.envelope.fill}، نسبة العرض للعمق ${fa.envelope.aspect} ← ${fb.envelope.aspect})`);
  }
  const head = `الحكم: ${d.verdict_ar} — الأبعاد الجوهرية: ${d.substantive.length ? d.substantive.map(k => DIM_AR[k]).join('، ') : 'لا شيء'} (المطلوب بعدان على الأقل).`;
  const tail = ignored.length ? `غير محتسب بذاته: ${ignored.join('؛ ')}.` : '';
  return { verdict: d.verdict, verdict_ar: d.verdict_ar, substantive: d.substantive, dims: Object.fromEntries(DIMENSIONS_V2.map(k => [k, d[k]])), total: d.total, sentences: out, ignored, text: [head, ...out, tail].filter(Boolean).join('\n') };
}

export default { ARCH_DIFF_VERSION, WEIGHTS, THRESHOLDS, VERDICT_AR, ZONES, archSignature, archDifference, archMatrix, adjacencyDistance, circulationDistance, zoningDistance, verdictOf, hungarian,
  ARCH_DIFF_V2_VERSION, DIMENSIONS_V2, DIM_AR, WEIGHTS_V2, SUBSTANTIVE_V2, FLOOR_WEIGHTS_V2, VERDICT_V2_AR, RELATION_AR, archSignatureV2, archDifferenceV2, archMatrixV2, explainDifference, verdictV2 };
