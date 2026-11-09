// تخطيط المصعد: بئر واحد متراصّ في الموضع نفسه على كل الأدوار، داخل الصالة/الممر، بباب على الصالة وكابينة مرسومة.
// يعمل على مستند الرسم بعد اكتمال التوزيع الداخلي (مثل garden-plan): لا يغيّر ترتيب البدائل ولا بصمتها.
// نقي: لا DOM. ما لا يتسع يُعلَن في report.notes بدل أن يُرسم قسرًا. أبعاد البئر في ELEVATOR_SPEC وكلها «غير متحقق» (انظر catalog.mjs).
import { applyCommand } from '../dist/draw/doc.mjs';
import { analyzeWalls } from '../dist/draw/topology.mjs';
import { pointInPolygon, closestOnSegment } from '../dist/draw/geom.mjs';
import { ELEVATOR_SPEC, roomTypeName } from '../dist/draw/catalog.mjs';
import { fixtureRect } from '../dist/draw/review.mjs';

const r2 = v => Math.round(v * 100) / 100;
const CIRC = new Set(['living', 'corridor', 'entrance']);
/** أثاث الصالة المنقول: يُزال إن وقع في البئر أو أمام بابه؛ أما غيره (سرير، دولاب...) فيستبعد الموضع. */
const SOFT = new Set(['rug', 'plant', 'sofa-3', 'sofa-2', 'armchair', 'coffee-table', 'tv-unit', 'majlis-sofa']);
/** منطقة الوقوف أمام باب المصعد: عرض الباب + 50 سم وعمق ELEVATOR_SPEC.landing. */
function landingBox(door, S) {
  const hw = (S.doorW + .5) / 2, n = door.n, m = door.mid;
  const a = { x: m.x - n.y * hw, y: m.y + n.x * hw }, b = { x: m.x + n.y * hw + n.x * S.landing, y: m.y - n.x * hw + n.y * S.landing };
  return boxOf([a, b]);
}
const inside = (p, poly) => pointInPolygon(p, poly, 1e-6);
const boxOf = pts => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;

/** فراغات الدور: [{ polygon, label }] مع تسمية كل فراغ (نوعها واسمها). */
function spacesOf(doc, level) {
  const sp = analyzeWalls(doc.walls.filter(w => w.level === level)).spaces.filter(s => s.net);
  return sp.map(s => ({ polygon: s.polygon, net: s.net, label: doc.labels.find(l => l.level === level && pointInPolygon(l.seed, s.net)) || null }));
}

/** بصمة الدرج الفعلية (U: ذراعان بعرض w وفاصل 10 سم؛ مستقيم/L: ذراع واحد) كما في stairs3d.mjs. */
function stairBoxes(doc, level) {
  return doc.stairs.filter(s => s.level === level).map(s => {
    const r = s.rot || 0, fx = Math.sin(r), fy = Math.cos(r), qx = Math.cos(r), qy = -Math.sin(r), w = s.w ?? 1.1, run = s.run ?? 3.2, side = s.flip ? -1 : 1;
    const a0 = s.kind === 'U' ? Math.min(-w / 2, -w / 2 + side * (w + .1)) : -w / 2, a1 = s.kind === 'U' ? Math.max(w / 2, w / 2 + side * (w + .1)) : w / 2, b1 = s.kind === 'L' ? Math.max(w, run - w) + w + Math.max(w * 1.2, run * .55) : run;
    const pts = [[a0, 0], [a1, 0], [a1, b1], [a0, b1]].map(([u, v]) => ({ x: s.x + qx * u + fx * v, y: s.y + qy * u + fy * v }));
    return boxOf(pts);
  });
}

/** أقصى عمق حرّ خارج حافة البئر (من نقطة منتصف الحافة نحو الخارج) داخل مضلع الصالة؛ 0 إن كانت الحافة على جدار. */
function freeDepth(mid, n, poly, max = 3) {
  if (!inside({ x: mid.x + n.x * .04, y: mid.y + n.y * .04 }, poly)) return 0; // الحافة على الجدار تمامًا
  let k = -1; // -1: شقّ بين الحافة والجدار أضيق من 25 سم
  for (let t = .25; t <= max + 1e-9; t += .25) { if (!inside({ x: mid.x + n.x * t, y: mid.y + n.y * t }, poly)) break; k = t; }
  return k;
}

/**
 * الفتحات التي يمسّها البئر (أو تقع أمام الجدار الذي يُلصق به): الأبواب تُزاح على جدارها خارج البئر، والنوافذ تستبعد الموضع.
 * يعيد { hard, moves:[{ id, at }] }.
 */
function openingConflicts(doc, level, box, m = .15) {
  const E = { x0: box.x0 - m, x1: box.x1 + m, y0: box.y0 - m, y1: box.y1 + m }, moves = [], taken = new Map();
  for (const o of doc.openings) {
    if (o.level !== level) continue;
    const w = doc.walls.find(x => x.id === o.wall); if (!w) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
    let hit = false;
    for (let t = -o.w / 2; t <= o.w / 2 + 1e-9; t += o.w / 4) {
      const p = { x: w.a.x + ux * (o.at + t), y: w.a.y + uy * (o.at + t) };
      if (p.x > E.x0 && p.x < E.x1 && p.y > E.y0 && p.y < E.y1) { hit = true; break; }
    }
    if (!hit) continue;
    if (!['door', 'door2', 'arch'].includes(o.kind) || o.entry) return { hard: true, moves: [] };
    // مدى البئر المسقط على الجدار
    const ts = [[E.x0, E.y0], [E.x1, E.y0], [E.x1, E.y1], [E.x0, E.y1]].map(([x, y]) => (x - w.a.x) * ux + (y - w.a.y) * uy), tmin = Math.min(...ts), tmax = Math.max(...ts);
    const others = doc.openings.filter(q => q.wall === o.wall && q.id !== o.id).map(q => [q.at - q.w / 2, q.at + q.w / 2]).concat((taken.get(o.wall) || []));
    const ok = at => at - o.w / 2 >= .15 && at + o.w / 2 <= L - .15 && !others.some(([a0, a1]) => at + o.w / 2 > a0 - .1 && at - o.w / 2 < a1 + .1) && (at + o.w / 2 <= tmin + 1e-9 || at - o.w / 2 >= tmax - 1e-9);
    const opts = [tmin - o.w / 2 - .02, tmax + o.w / 2 + .02].filter(ok).sort((p, q) => Math.abs(p - o.at) - Math.abs(q - o.at));
    if (!opts.length) return { hard: true, moves: [] };
    moves.push({ id: o.id, at: r2(opts[0]), from: o.at }); taken.set(o.wall, [...(taken.get(o.wall) || []), [opts[0] - o.w / 2, opts[0] + o.w / 2]]);
  }
  return { hard: false, moves };
}

/**
 * المرشحون: مستطيلات بئر داخل مضلع صالة الأرضي ومضلع صالة الأول معًا.
 * تُرتَّب بقربها من الدرج وبكونها مدسوسة في ركن، وتُستبعد التي تسدّ ممرًا أو فتحة أو قطعة أثاث ثابتة.
 */
export const DBG={};
export function elevatorCandidates(doc) {
  for(const k of Object.keys(DBG)) delete DBG[k]; const bump=k=>(DBG[k]=(DBG[k]||0)+1,true);
  const [L0, L1] = [doc.levels[0]?.id, doc.levels[1]?.id]; if (!L0 || !L1) return [];
  const S = ELEVATOR_SPEC, G = spacesOf(doc, L0).filter(s => s.label && CIRC.has(s.label.type)), U = spacesOf(doc, L1).filter(s => s.label && CIRC.has(s.label.type));
  const stairs = stairBoxes(doc, L0), sc = stairs.length ? { x: (stairs[0].x0 + stairs[0].x1) / 2, y: (stairs[0].y0 + stairs[0].y1) / 2 } : null;
  const entries = doc.openings.filter(o => o.level === L0 && o.entry).map(o => { const w = doc.walls.find(x => x.id === o.wall); return w ? closestOnSegment({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }, w.a, w.b).point : null; }).filter(Boolean);
  const out = [], seen = new Set();
  for (const g of G) for (const u of U) {
    const bg = boxOf(g.polygon), bu = boxOf(u.polygon), I = { x0: Math.max(bg.x0, bu.x0), x1: Math.min(bg.x1, bu.x1), y0: Math.max(bg.y0, bu.y0), y1: Math.min(bg.y1, bu.y1) };
    bump('pair'); if (I.x1 - I.x0 < S.shaftW || I.y1 - I.y0 < S.shaftW) { bump('Ismall'); continue; }
    for (const [sw, sd] of [[S.shaftW, S.shaftD], [S.shaftD, S.shaftW]]) {
      const xs = [], ys = [];
      for (let x = I.x0 + sw / 2; x <= I.x1 - sw / 2 + 1e-6; x += .25) xs.push(r2(x));
      xs.push(r2(I.x1 - sw / 2));
      for (let y = I.y0 + sd / 2; y <= I.y1 - sd / 2 + 1e-6; y += .25) ys.push(r2(y));
      ys.push(r2(I.y1 - sd / 2));
      for (const cx of xs) for (const cy of ys) {
        const box = { x0: cx - sw / 2, x1: cx + sw / 2, y0: cy - sd / 2, y1: cy + sd / 2 };
        const key = [r2(box.x0), r2(box.y0), sw].join(','); if (seen.has(key)) continue; seen.add(key);
        const corners = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
        bump('pos'); if (!corners.every(c => inside(c, g.polygon) && inside(c, u.polygon))) continue; bump('inbox');
        if (stairs.some(b => overlap(box, b, .3)) && bump('stair')) continue;
        // الحواف: اتجاه الخارج ومنتصفها؛ على جدار (عمق 0) أو حرّة (عمق ≥ ممر)
        const edges = [{ n: { x: 0, y: -1 }, mid: { x: cx, y: box.y0 } }, { n: { x: 1, y: 0 }, mid: { x: box.x1, y: cy } }, { n: { x: 0, y: 1 }, mid: { x: cx, y: box.y1 } }, { n: { x: -1, y: 0 }, mid: { x: box.x0, y: cy } }]
          .map(e => ({ ...e, dg: freeDepth(e.mid, e.n, g.polygon), du: freeDepth(e.mid, e.n, u.polygon) }));
        // شقّ ضيق بين البئر وجدار (أقل من 45 سم) فراغ ميت: يُستبعد
        if (edges.some(e => (e.dg !== 0 && e.dg < .45) || (e.du !== 0 && e.du < .45)) && bump('sliver')) continue;
        // البئر يلتصق بجدار على كل دور (وإلا صار جزيرة حرة داخل الصالة فيختلّ تحليل الفراغات)
        if ((!edges.some(e => e.dg === 0) || !edges.some(e => e.du === 0)) && bump('notuck')) continue;
        const door = edges.filter(e => Math.min(e.dg, e.du) >= S.landing + .05).sort((a, b) => Math.min(b.dg, b.du) - Math.min(a.dg, a.du))[0];
        if (!door && bump('door')) continue;
        const cf = [L0, L1].map(L => openingConflicts(doc, L, box)); if (cf.some(c => c.hard) && bump('openhard')) continue;
        const moves = cf.flatMap(c => c.moves);
        const land = landingBox(door, S);
        if (stairs.some(b => overlap(land, b, 0)) && bump('landstair')) continue; // أمام الباب درج
        const zone = [box, land], hit = doc.fixtures.filter(f => (f.level === L0 || f.level === L1) && !['tree', 'car'].includes(f.kind) && zone.some(z => overlap(z, boxOf(fixtureRect(f)), .05)));
        if (hit.some(f => !SOFT.has(f.kind)) && bump('hard')) continue;
        const tucked = edges.filter(e => e.dg === 0 && e.du === 0).length;
        let score = (sc ? Math.hypot(cx - sc.x, cy - sc.y) : 4) - tucked * 1.5;
        if (entries.some(p => Math.hypot(p.x - cx, p.y - cy) < 2.5)) score += 6;
        score += hit.filter(f => f.kind !== 'rug').length * 1.2 + moves.length * 2;
        out.push({ box, land, cx, cy, sw, sd, door, tucked, score, hall: g.label.name, upperHall: u.label.name, remove: hit.map(f => f.id), moves });
      }
    }
  }
  return out.sort((a, b) => a.score - b.score);
}

/** دوران الكابينة بحيث يقع وجه الباب (+d محليًا) نحو اتجاه الخارج n. */
function carRot(n) {
  let best = 0, bd = -2;
  for (const rot of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const back = fixtureRect({ x: 0, y: 0, w: 0, d: 2, rot })[0], dot = -back.x * n.x - back.y * n.y;
    if (dot > bd) { bd = dot; best = rot; }
  }
  return best;
}

/** يضيف البئر على كل الأدوار. يعيد المستند الجديد أو يرمي إن فشل أي أمر. */
function build(doc0, cand, levels) {
  const S = ELEVATOR_SPEC; let doc = doc0;
  const { box, cx, cy, door } = cand;
  for (const L of levels) {
    // أثاث الصالة الواقع في البئر أو أمام بابه يُزال
    for (const f of doc.fixtures.filter(f => f.level === L && cand.remove.includes(f.id))) doc = applyCommand(doc, { type: 'delete', ids: [f.id] }).doc;
    for (const mv of cand.moves) { const o = doc.openings.find(q => q.id === mv.id); if (o && o.level === L) doc = applyCommand(doc, { type: 'update', id: mv.id, patch: { at: mv.at } }).doc; }
    const nWalls = doc.walls.length;
    doc = applyCommand(doc, { type: 'add-rect', level: L, a: { x: box.x0, y: box.y0 }, b: { x: box.x1, y: box.y1 }, t: S.wall }).doc;
    // الباب على جدار حافة الصالة: أحدث جدار يغطي منتصف تلك الحافة
    const mid = door.mid, fresh = doc.walls.slice(nWalls).filter(w => w.level === L && closestOnSegment(mid, w.a, w.b).dist < .02);
    const host = fresh[fresh.length - 1]; if (!host) throw new Error('لا جدار لباب المصعد');
    const at = Math.hypot(mid.x - host.a.x, mid.y - host.a.y);
    doc = applyCommand(doc, { type: 'add-opening', wall: host.id, kind: 'arch', at, w: S.doorW, h: S.doorH }).doc;
    doc = applyCommand(doc, { type: 'add-label', level: L, name: 'المصعد', roomType: 'elevator', seed: { x: cx, y: cy } }).doc;
    // الكابينة في وسط البئر ووجه بابها نحو الصالة
    doc = applyCommand(doc, { type: 'add-fixture', level: L, kind: 'elevator-car', x: r2(cx), y: r2(cy), rot: carRot(door.n), w: S.cabW, d: S.cabD, h: S.cabH }).doc;
  }
  return doc;
}

/**
 * يخطّط مصعدًا واحدًا في doc (دوران فأكثر). verify(doc) اختياري: يقبل المرشح أو يرفضه (checkDoc + عدم زيادة ملاحظات المراجعة).
 * يرجع { doc, report: { placed, notes, missing, spec } }.
 */
export function planElevator(doc0, { verify = null, maxTry = 14 } = {}) {
  const report = { placed: [], notes: [], missing: false, spec: ELEVATOR_SPEC };
  if (!doc0.levels || doc0.levels.length < 2) { report.missing = true; report.notes.push('المصعد يلزمه دوران فأكثر؛ هذا التصميم دور واحد فلم يُرسم.'); return { doc: doc0, report }; }
  const cands = elevatorCandidates(doc0);
  if (!cands.length) { report.missing = true; report.notes.push('لم أجد داخل الصالة موضعًا يتسع لبئر المصعد (1.7 × 1.9 م) على الدورين معًا دون سدّ الدرج أو ممر أو باب؛ يمكن إضافته في المرسم.'); return { doc: doc0, report }; }
  const levels = doc0.levels.slice(0, 2).map(l => l.id);
  for (const c of cands.slice(0, maxTry)) {
    try {
      const doc = build(doc0, c, levels);
      if (verify && !verify(doc)) continue;
      report.placed.push({ x: r2(c.cx), y: r2(c.cy), w: r2(c.sw), d: r2(c.sd), stops: levels.length, hall: c.hall, removed: c.remove.length, movedDoors: c.moves.length });
      if (c.moves.length) report.notes.push(`أُزيح ${c.moves.length} باب على جداره ليتّسع البئر؛ راجع مواضع الأبواب في المرسم.`);
      if (c.remove.length) report.notes.push(`أُزيلت ${c.remove.length} قطعة أثاث من الصالة (جلسة أو سجادة) لإفساح البئر وموقف الباب؛ أعد ترتيبها في المرسم.`);
      report.notes.push(`المصعد (${roomTypeName('elevator')}) في ${c.hall}، يخدم الدورين بالموضع نفسه وبابه على الصالة. أبعاد البئر ${r2(c.sw)} × ${r2(c.sd)} م افتراض تصميمي «غير متحقق» من الكود ويعتمدها مورّد المصعد.`);
      return { doc, report };
    } catch { /* مرشح غير صالح: التالي */ }
  }
  report.missing = true;
  report.notes.push('جرّبت أنسب المواضع للمصعد داخل الصالة فلم يسلم أيها من ملاحظات المراجعة؛ لم يُرسم. يمكن إضافته في المرسم.');
  return { doc: doc0, report };
}

export default { planElevator, elevatorCandidates };
