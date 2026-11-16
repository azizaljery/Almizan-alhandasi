// «حسّن هذا التصميم»: استمثال حتمي بعد اختيار العميل تصميمًا. يولّد تعديلات صغيرة منفصلة على المستند المرسوم نفسه
// (إزاحة جدار فاصل داخلي ≤ 0.3 م، أو توسيع نافذة خطوة واحدة 0.3 م)، يفلترها بكل فحوص النظام (سلامة المخطط، المراجعة، البلدية، سجل الطلب، الحركة)،
// ويقبل الأعلى درجةً بشرط أن يتحسن المجموع بما لا يقل عن REFINE_LIMITS.minGain ولا ينخفض أي مؤشر ولا يتغير نمط التوزيع.
// ما لم يتحقق ذلك يعيد «لا تحسين متاح» بالأرقام الفعلية، ولا يختلق تحسينًا. نقي: بلا DOM ولا شبكة ولا عشوائية (تعداد مرتب منتهٍ، فنفس المدخل ← نفس المخرج).
// الأرقام: minGain وmaxCandidates من المالك (تكليف الميزة)؛ خطوات الإزاحة والتوسيع افتراض تصميمي من الميزان (غير متحقق من مصدر خارجي)،
// وكل ما عداها يُؤخذ من الشيفرة القائمة (plan-score وvillaLayout.quality وmunicipal-rules وrules.verifyRequest).
import { parseDoc, serialize, applyCommandInPlace } from './draw/doc.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { exteriorWallIds } from './draw/topology.mjs';
import { fixtureRect } from './draw/review.mjs';
import { closestOnSegment } from './draw/geom.mjs';
import { quality, checkDoc, visualSig, visualSim, fixWindowJunctions } from './villa-layout.mjs';
import { checkMunicipal } from './municipal-rules.mjs';
import { verifyRequest } from './rules.mjs';
import { scorePlan, SCORE_LIMITS } from './plan-score.mjs';
import { ensureScores } from './design-session.mjs';
import { solarSite } from './geo-land.mjs';

/** حدود الاستمثال المعلنة. */
export const REFINE_LIMITS = Object.freeze({
  maxCandidates: 60,   // أقصى عدد مرشحين يُقيَّمون (مفردة + مركّبة)
  minGain: 2,          // أدنى تحسن في المجموع (من 100) ليُقبل
  maxPartDrop: 0,      // لا ينخفض أي مؤشر عن قيمته الأصلية ولا بنقطة
  minSim: .85,         // أدنى تشابه بصري مع الأصل (نمط التوزيع نفسه) وأقل من التطابق الحرفي
  shifts: Object.freeze([.1, .2, .3]), // خطوات إزاحة الجدار (م)
  widen: .3,           // خطوة توسيع النافذة (م)
  maxWindow: 2.5,      // أقصى عرض للنافذة بعد التوسيع (م)
  chain: 16,           // من الحد الأقصى: ما يُخصَّص لضم تعديلات إلى أفضل مفرد (حتى ثلاثة تعديلات)
});

const HABIT = new Set(['bedroom', 'master', 'majlis', 'kitchen', 'office', 'service']);
const EXCL = new Set(['stairs', 'elevator', 'courtyard', 'garage', 'balcony', 'other']);
const TOL = .03, r3 = v => Math.round(v * 1000) / 1000, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const num = v => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(v);
const clone = v => JSON.parse(JSON.stringify(v));
const RANK = { ok: 0, na: 0, review: 1, fail: 2 };
const SIDE = { n: 'الشمالية', ne: 'الشمالية الشرقية', e: 'الشرقية', se: 'الجنوبية الشرقية', s: 'الجنوبية', sw: 'الجنوبية الغربية', w: 'الغربية', nw: 'الشمالية الغربية' };

// ------------------------------------------------------------------------------------------ السياق والقياس
function contextOf(session, d) {
  const doc = parseDoc(d.doc), input = session.input || {}, req = input.requirements || {}, land = input.land || {};
  const entry = land.entries?.[0] || doc.plot?.entry || 's', site = solarSite(land.geo || null);
  return { doc, req, land, entry, site: { lat: site.lat, north: site.north }, bedrooms: doc.labels.filter(l => l.type === 'bedroom' || l.type === 'master').length };
}
/** قياس مستند بكل فحوص النظام؛ لا يرمي. */
function measure(doc, ctx) {
  const chk = checkDoc(doc); if (!chk.ok) return { ok: false, why: 'check' };
  let q; try { q = quality(doc, { bedrooms: ctx.bedrooms }); } catch { return { ok: false, why: 'quality' }; }
  let mun; try { mun = checkMunicipal(doc, ctx.land); } catch { return { ok: false, why: 'municipal' }; }
  let ledger; try { ledger = verifyRequest(doc, ctx.req, { entry: ctx.entry }); } catch { return { ok: false, why: 'ledger' }; }
  const model = analyzeDoc(doc), reach = new Set();
  for (const lv of model.levels) for (const r of lv.rooms) if (!r.unlabelled && lv.reach.has(r.id)) reach.add(lv.level.id + ':' + r.id);
  const rooms = new Map(); for (const lv of model.levels) for (const r of lv.rooms) if (!r.unlabelled) rooms.set(r.id, { name: r.name, area: r.area, w: Math.min(r.rect.w, r.rect.l), l: Math.max(r.rect.w, r.rect.l) });
  const score = scorePlan(doc, { ledger, site: ctx.site });
  return { ok: true, q, mun, ledger, reach, rooms, score };
}
/** هل يحفظ المرشح كل ما كان سليمًا في الأصل؟ يعيد null إن حفظه، وإلا سبب الرفض. */
function guard(base, m) {
  if (!m.ok) return 'invalid';
  if (m.q.reject) return 'quality';
  for (const k of Object.keys(m.q.issues)) if ((m.q.issues[k] || 0) > (base.q.issues[k] || 0)) return 'quality';
  if (m.q.cost > base.q.cost + 1e-9) return 'quality';
  for (const it of base.mun.items) { const c = m.mun.items.find(x => x.id === it.id); if (!c || RANK[c.verdict] > RANK[it.verdict]) return 'municipal'; }
  const now = new Map(m.ledger.map(x => [x.text, x.ok]));
  for (const x of base.ledger) if (x.ok && now.get(x.text) !== true) return 'request';
  for (const k of base.reach) if (!m.reach.has(k)) return 'circulation';
  for (const id of base.rooms.keys()) if (!m.rooms.has(id)) return 'rooms';
  return null;
}
/** شروط القبول على الدرجة: تحسن كافٍ، وبلا انخفاض أي مؤشر. يعيد true/false. */
function scoreOk(base, m, minGain) {
  const a = base.score, b = m.score; if (b.total - a.total < minGain) return false;
  for (const p of a.parts) { const q = b.parts.find(x => x.id === p.id); if (!q || q.score < p.score - REFINE_LIMITS.maxPartDrop) return false; }
  return b.parts.length === a.parts.length;
}

// ------------------------------------------------------------------------------------------ التعديلات
const vert = w => Math.abs(w.a.x - w.b.x) < 1e-6, horiz = w => Math.abs(w.a.y - w.b.y) < 1e-6;
const wlen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
const segDist = (p, a, b) => closestOnSegment(p, a, b).dist;
const levelRoomsAt = (model, levelId, p) => model.levelById.get(levelId)?.roomAt(p) || null;

/** الغرف على جانبي جدار (عند ثلاث نقاط من طوله): null إن كان خارجيًا أو لا غرفة على أحد جانبيه أو من نوع لا يُزاح جداره. */
function sidesOf(model, w) {
  const n = vert(w) ? { x: 1, y: 0 } : { x: 0, y: 1 }, L = wlen(w), out = { plus: new Set(), minus: new Set() };
  for (const f of [.25, .5, .75]) {
    const p = { x: w.a.x + (w.b.x - w.a.x) * f, y: w.a.y + (w.b.y - w.a.y) * f }, h = (w.t || .12) / 2 + .2;
    const A = levelRoomsAt(model, w.level, { x: p.x + n.x * h, y: p.y + n.y * h }), B = levelRoomsAt(model, w.level, { x: p.x - n.x * h, y: p.y - n.y * h });
    if (!A || !B || A.unlabelled || B.unlabelled || EXCL.has(A.type) || EXCL.has(B.type)) return null;
    out.plus.add(A); out.minus.add(B);
  }
  if (L < .8) return null;
  return { n, plus: [...out.plus], minus: [...out.minus] };
}
/** يزيح جدارًا فاصلًا بمقدار delta على عموده، ويمدّ/يقصّر الجدران الملاصقة له، ويحرّك ما التصق به من قطع. يعيد false إن لم يصلح. يعدّل doc. */
function shiftWall(doc, wid, delta) {
  const w = doc.walls.find(x => x.id === wid); if (!w || !(vert(w) || horiz(w))) return false;
  const n = vert(w) ? { x: 1, y: 0 } : { x: 0, y: 1 }, mv = p => ({ x: r3(p.x + n.x * delta), y: r3(p.y + n.y * delta) });
  const along = v => (vert(w) ? vert(v) : horiz(v)); // موازٍ لـw
  const followers = [], supports = [];
  for (const v of doc.walls) {
    if (v === w || v.level !== w.level || (v.kind || 'wall') === 'fence') continue;
    for (const e of ['a', 'b']) if (segDist(v[e], w.a, w.b) <= TOL) { if (along(v)) return false; followers.push([v, e]); }
    // جدار موازٍ يلاصق طرف w أو يتراكب معه: لا يُزاح
    if (along(v) && Math.abs((vert(w) ? v.a.x - w.a.x : v.a.y - w.a.y)) < .02) { const lo = vert(w) ? Math.min(v.a.y, v.b.y) : Math.min(v.a.x, v.b.x), hi = vert(w) ? Math.max(v.a.y, v.b.y) : Math.max(v.a.x, v.b.x), wl = vert(w) ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x), wh = vert(w) ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x); if (Math.min(hi, wh) - Math.max(lo, wl) > -.02) return false; }
  }
  // طرفا w يرتكزان على جدران عمودية عليه يجب أن تمتد إلى الموضع الجديد
  for (const e of ['a', 'b']) {
    const np = mv(w[e]);
    for (const s of doc.walls) {
      if (s === w || s.level !== w.level || (s.kind || 'wall') === 'fence' || followers.some(f => f[0] === s)) continue;
      if (segDist(w[e], s.a, s.b) <= TOL) { if (along(s)) return false; supports.push([s, np]); }
    }
  }
  for (const [s, np] of supports) if (segDist(np, s.a, s.b) > 1e-6 || Math.min(Math.hypot(np.x - s.a.x, np.y - s.a.y), Math.hypot(np.x - s.b.x, np.y - s.b.y)) < .1) return false;
  // ما لا يجوز قربه: سلالم وأعمدة
  const near = p => { const d = Math.abs((p.x - w.a.x) * n.x + (p.y - w.a.y) * n.y); return d < 1.2 && segDist({ x: p.x - n.x * ((p.x - w.a.x) * n.x + (p.y - w.a.y) * n.y), y: p.y - n.y * ((p.x - w.a.x) * n.x + (p.y - w.a.y) * n.y) }, w.a, w.b) < .8; };
  if ((doc.stairs || []).some(s => s.level === w.level && near(s)) || (doc.columns || []).some(c => c.level === w.level && near(c))) return false;
  // القطع الملتصقة بالجدار تتبعه
  const wt = (w.t || .12) / 2, wl = wlen(w), ux = (w.b.x - w.a.x) / wl, uy = (w.b.y - w.a.y) / wl;
  const follow = [];
  for (const f of doc.fixtures || []) {
    if (f.level !== w.level) continue;
    const pts = fixtureRect(f); let dMin = Infinity, tMin = Infinity, tMax = -Infinity;
    for (const p of pts) { const dn = Math.abs((p.x - w.a.x) * n.x + (p.y - w.a.y) * n.y); dMin = Math.min(dMin, dn); const t = (p.x - w.a.x) * ux + (p.y - w.a.y) * uy; tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
    if (dMin <= wt + .06 && tMax > -.05 && tMin < wl + .05) follow.push(f);
  }
  // الجدران الملاصقة تتمدد/تتقلص وفتحاتها تتبع بعدها عن طرفها a
  for (const [v, e] of followers) {
    const L0 = wlen(v); v[e] = mv(v[e]); const L1 = wlen(v); if (L1 < .3) return false;
    for (const o of doc.openings) if (o.wall === v.id) { if (e === 'a') o.at = r3(o.at + (L1 - L0)); if (o.at - o.w / 2 < .05 - 1e-9 || o.at + o.w / 2 > L1 - .05 + 1e-9) return false; }
  }
  w.a = mv(w.a); w.b = mv(w.b);
  for (const f of follow) { f.x = r3(f.x + n.x * delta); f.y = r3(f.y + n.y * delta); }
  return true;
}
function widenWindow(doc, oid, step) {
  const o = doc.openings.find(x => x.id === oid); if (!o) return false;
  const w = r3(o.w + step); if (w > REFINE_LIMITS.maxWindow + 1e-9) return false;
  try { applyCommandInPlace(doc, { type: 'update', id: oid, patch: { w } }); } catch { return false; }
  const now = doc.openings.find(x => x.id === oid); return !!now && Math.abs(now.w - w) < 1e-6 && Math.abs(now.at - o.at) < 1e-6;
}
const same = (a, b, n) => Math.abs(a - b) <= n;
/** جدران الأدوار الأخرى المتراصة فوق الجدار نفسه أو تحته (يُزاح معها ليبقى التراص). */
function stackedWith(doc, w) {
  const out = [];
  for (const v of doc.walls) {
    if (v === w || v.level === w.level || (v.kind || 'wall') === 'fence' || !(vert(v) === vert(w) && (vert(v) || horiz(v)))) continue;
    const c = vert(w) ? [w.a.x, v.a.x] : [w.a.y, v.a.y]; if (!same(c[0], c[1], .02)) continue;
    const lo = vert(w) ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x), hi = vert(w) ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x);
    const vl = vert(w) ? Math.min(v.a.y, v.b.y) : Math.min(v.a.x, v.b.x), vh = vert(w) ? Math.max(v.a.y, v.b.y) : Math.max(v.a.x, v.b.x);
    if (Math.min(hi, vh) - Math.max(lo, vl) >= .5) out.push(v);
  }
  return out;
}

/** تعداد المرشحين المنفصلين بترتيب ثابت: كل مرشح { id, kind, apply(doc)→bool، text(قبل/بعد) }. */
export function enumerateEdits(doc) {
  const model = analyzeDoc(doc), edits = [], seen = new Set(), CIRC = new Set(['living', 'entrance', 'corridor']);
  // إزاحة الجدران الفاصلة: أولًا ما يلاصق فراغ حركة (صالة/ممر/مدخل) فهو الأقرب لرفع كفاءة المساحة
  const walls = [];
  for (const lv of model.levels) {
    const ext = exteriorWallIds(lv.analysis);
    for (const w of lv.walls) {
      if ((w.kind || 'wall') !== 'wall' || ext.has(w.id) || !(vert(w) || horiz(w))) continue;
      const s = sidesOf(model, w); if (!s) continue;
      walls.push({ w, s, pri: [...s.plus, ...s.minus].some(r => CIRC.has(r.type)) ? 0 : 1, li: lv.levelIndex });
    }
  }
  walls.sort((a, b) => a.pri - b.pri || a.li - b.li || a.w.id.localeCompare(b.w.id, 'en', { numeric: true }));
  // الأولوية لما يُقصّر فراغ حركة بإزاحة الجدار نحوه (تقدير مساحة الحركة المنزوعة = الخطوة × طول الجدار)؛ ما يوسّع الحركة يُستبعد لأنه يخفض كفاءة المساحة
  const ds = []; for (const d of REFINE_LIMITS.shifts) ds.push(d, -d);
  for (const { w, s, pri } of walls) for (const delta of ds) {
    const group = [w, ...stackedWith(doc, w)], key = group.map(x => x.id).sort().join('+') + '@' + delta;
    if (seen.has(key)) continue; seen.add(key);
    const toward = delta > 0 ? s.plus : s.minus, away = delta > 0 ? s.minus : s.plus;
    const est = Math.abs(delta) * wlen(w) * ((toward.some(r => CIRC.has(r.type)) ? 1 : 0) - (away.some(r => CIRC.has(r.type)) ? 1 : 0));
    if (est < 0) continue;
    edits.push({ id: 'shift:' + key, kind: 'shift', delta, est: r3(est), pri, ids: group.map(x => x.id),
      toward: toward.map(r => r.name), away: away.map(r => r.name), levelId: w.level,
      apply: d => group.every(g => shiftWall(d, g.id, delta)) });
  }
  edits.sort((a, b) => b.est - a.est || Math.abs(a.delta) - Math.abs(b.delta) || a.pri - b.pri);
  // توسيع النوافذ الخارجية في الفراغات المعيشية: أولًا ما تقصر نسبة نوافذه عن الحد المستهدف
  const wins = [];
  for (const lv of model.levels) for (const op of lv.openings) {
    if (!op.window) continue;
    const side = op.sides.find(x => x.exterior && x.room && !x.room.unlabelled && HABIT.has(x.room.type)); if (!side) continue;
    const area = lv.openings.filter(o => o.window && o.sides.some(x => x.room.id === side.room.id && x.exterior)).reduce((a, o) => a + o.area, 0);
    wins.push({ op, side, short: side.room.area > 0 && area / side.room.area < SCORE_LIMITS.winRatio ? 0 : 1 });
  }
  wins.sort((a, b) => a.short - b.short || a.op.id.localeCompare(b.op.id, 'en', { numeric: true }));
  for (const { op, side } of wins) edits.push({ id: 'widen:' + op.id, kind: 'widen', ids: [op.id], group: 0, room: side.room.name, side: side.compass, from: op.w, to: r3(op.w + REFINE_LIMITS.widen), apply: d => widenWindow(d, op.id, REFINE_LIMITS.widen) });
  return edits;
}
/** يختار المرشحين المفردين تحت الحد: النوافذ حتى 8 (ما تقصر نسبة نوافذه أولًا) والباقي إزاحات بترتيب أولويتها. */
function pickSingles(edits, max) {
  const B = edits.filter(e => e.kind === 'widen').slice(0, 8), A = edits.filter(e => e.kind === 'shift').slice(0, Math.max(0, max - B.length));
  return [...A, ...B];
}
function build(base, edits) {
  const d = clone(base);
  for (const e of edits) if (!e.apply(d)) return null;
  return fixWindowJunctions(d);
}

// ------------------------------------------------------------------------------------------ وصف التغيير بالأرقام
function describe(edits, base, cand, a, b) {
  const lines = [];
  for (const e of edits) {
    if (e.kind === 'shift') {
      const to = [...new Set(e.toward)].join('، '), away = [...new Set(e.away)].join('، ');
      lines.push({ kind: 'shift', text: `أُزيح الجدار الفاصل بين «${away}» و«${to}» ${num(Math.abs(e.delta))} م نحو «${to}»` + (e.ids.length > 1 ? ` (مع الجدار المتراص معه في الدور الآخر لئلا يختل التراص)` : '') });
    } else lines.push({ kind: 'widen', text: `وُسّعت نافذة «${e.room}» (الواجهة ${SIDE[e.side] || ''}) من ${num(e.from)} إلى ${num(e.to)} م` });
  }
  const rooms = [];
  for (const [id, r0] of a.rooms) { const r1_ = b.rooms.get(id); if (r1_ && Math.abs(r1_.area - r0.area) >= .05) rooms.push({ name: r0.name, before: r2(r0.area), after: r2(r1_.area) }); }
  return { lines, rooms };
}
/** جدول قبل/بعد لكل مؤشر. */
export function deltaTable(before, after) {
  return before.parts.map(p => { const q = after.parts.find(x => x.id === p.id); return { id: p.id, label: p.label, weight: p.weight, before: p.score, after: q ? q.score : p.score, diff: q ? q.score - p.score : 0 }; });
}

// ------------------------------------------------------------------------------------------ المحسِّن
/**
 * يحسّن تصميمًا من الجلسة. لا يغيّر الجلسة. يعيد:
 * { status: 'improved'|'none', before: score, tried, passed, rejected:{سبب:عدد}, weakest, reason?, after?, doc?, table?, total?, changes?, rooms?, sim? }
 */
export function refineDesign(session, index = session.current, opts = {}) {
  const lim = { ...REFINE_LIMITS, ...opts }, d = session.designs[index]; if (!d) throw Error('التصميم غير موجود.');
  const ctx = contextOf(session, d), base = measure(ctx.doc, ctx); if (!base.ok) throw Error('تعذّر قياس التصميم المعروض.');
  const baseSig = visualSig(ctx.doc), baseText = serialize(ctx.doc);
  const singles = pickSingles(enumerateEdits(ctx.doc), lim.maxCandidates - lim.chain);
  const rejected = {}, rej = k => { rejected[k] = (rejected[k] || 0) + 1; };
  let tried = 0, passed = 0;
  const evalEdits = edits => {
    tried++; const doc = build(ctx.doc, edits); if (!doc) { rej('geometry'); return null; }
    const sim = visualSim(visualSig(doc), baseSig), text = serialize(doc);
    if (text === baseText) { rej('same'); return null; }
    if (sim < lim.minSim) { rej('pattern'); return null; }
    const m = measure(doc, ctx), g = guard(base, m); if (g) { rej(g); return null; }
    passed++; return { edits, doc, m, sim };
  };
  const fine = m => m.score.parts.reduce((s, p) => s + p.weight * p.score, 0) / (m.score.parts.reduce((s, p) => s + p.weight, 0) || 1); // المجموع بلا تقريب
  const mono = c => c.m.score.parts.every(p => p.score >= base.score.parts.find(x => x.id === p.id).score - lim.maxPartDrop);
  const cand = [];
  for (const e of singles) { const r = evalEdits([e]); if (r) cand.push(r); }
  // سلسلة جشعة حتمية: أفضل مفرد غير منخفض المؤشرات، ثم يُضم إليه من بقية المفردات ما يرفع أكثر (حتى ثلاثة تعديلات)
  const pool = cand.filter(c => mono(c) && fine(c.m) > fine(base)).sort((a, b) => fine(b.m) - fine(a.m));
  let cur = pool[0] || null, left = Math.min(lim.chain, lim.maxCandidates - tried);
  for (let step = 0; step < 2 && cur && left > 0; step++) {
    const used = new Set(cur.edits.flatMap(e => e.ids)); let best = null;
    for (const c of pool) {
      if (left <= 0) break; if (cur.edits.includes(c.edits[0]) || c.edits[0].ids.some(x => used.has(x))) continue;
      left--; const r = evalEdits([...cur.edits, c.edits[0]]); if (r) { cand.push(r); if (mono(r) && fine(r.m) > fine(cur.m) && (!best || fine(r.m) > fine(best.m))) best = r; }
    }
    if (!best) break; cur = best;
  }
  const good = cand.filter(c => scoreOk(base, c.m, lim.minGain));
  // الأعلى مجموعًا، ثم الأقل إزاحةً (مجموع الخطوات)، ثم أقل عدد تعديلات، ثم ترتيب التعداد
  const cost = c => c.edits.reduce((s, e) => s + (e.kind === 'shift' ? Math.abs(e.delta) : lim.widen), 0);
  good.sort((a, b) => b.m.score.total - a.m.score.total || cost(a) - cost(b) || a.edits.length - b.edits.length);
  const weakest = [...base.score.parts].sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score))[0] || null;
  const out = { status: 'none', before: base.score, tried, passed, rejected, minGain: lim.minGain, weakest: weakest ? { id: weakest.id, label: weakest.label, score: weakest.score, why: weakest.bad } : null };
  if (!good.length) {
    const best = cand.map(c => c.m.score.total - base.score.total).reduce((m, v) => Math.max(m, v), 0);
    const bits = Object.entries(rejected).filter(([k]) => k !== 'same').map(([k, n]) => `${n} ${REJ_AR[k] || k}`);
    out.reason = `لا تحسين متاح لهذا التصميم بتعديلات صغيرة آمنة. المؤشر الأضعف: ${weakest ? `${weakest.label} (${weakest.score}/100) — ${weakest.bad}` : '—'}. جرّبت ${tried} تعديلًا صغيرًا (إزاحة جدار فاصل حتى ${num(Math.max(...lim.shifts))} م، أو توسيع نافذة ${num(lim.widen)} م): ${passed} منها سلم من كل الفحوص، وأفضل ما سلم رفع المجموع ${best > 0 ? num(best) : 'صفرًا'} من ${lim.minGain} المطلوبة${bits.length ? `؛ والباقي سقط: ${bits.join('، ')}` : ''}. لن أقترح تعديلًا يخسر شيئًا من الفحوص أو من مؤشراتك الأخرى.`;
    return out;
  }
  const win = good[0], table = deltaTable(base.score, win.m.score), desc = describe(win.edits, ctx.doc, win.doc, base, win.m);
  return { ...out, status: 'improved', after: win.m.score, doc: serialize(win.doc), table, total: { before: base.score.total, after: win.m.score.total, gain: win.m.score.total - base.score.total }, changes: desc.lines, rooms: desc.rooms, sim: r2(win.sim), ledger: win.m.ledger };
}
const REJ_AR = { geometry: 'لم يصلح هندسيًا (جدار يرتكز على غيره أو سلم قريب)', pattern: 'غيّر نمط التوزيع', invalid: 'كسر سلامة المخطط', quality: 'زاد ملاحظات المراجعة أو كلفتها', municipal: 'أضرّ ببند بلدي', request: 'كسر بندًا من طلبك', circulation: 'قطع الحركة', rooms: 'أضاع فراغًا' };

/** نص ملاحظة التحسين بالأرقام (يُضاف لملاحظات التصميم الجديد). */
export function refineNote(res, fromIndex) {
  const t = res.total, parts = res.table.filter(r => r.diff !== 0).map(r => `${r.label} ${r.before} ← ${r.after}`);
  const rooms = (res.rooms || []).map(r => `«${r.name}» ${num(r.before)} ← ${num(r.after)} م²`);
  return [`تحسين على التصميم ${fromIndex + 1}: درجة المطابقة ${t.before} ← ${t.after} (+${t.gain}) بلا مخالفة بلدية ولا بند من طلبك ولا مؤشر منخفض، ونمط التوزيع نفسه (تشابه بصري ${Math.round(res.sim * 100)}٪).`,
    ...res.changes.map(c => c.text + '.'), ...(parts.length ? ['المؤشرات المتغيرة: ' + parts.join('؛ ') + '.'] : []), ...(rooms.length ? ['المساحات المتغيرة: ' + rooms.join('؛ ') + '.'] : [])];
}

/**
 * «اعتمد التحسين»: يضيف التصميم المحسَّن إلى الجلسة تصميمًا جديدًا في آخرها ويجعله المعروض؛ الأصل يبقى كما هو بلا استبدال.
 * يعيد نسخة جديدة من الجلسة (لا يعدّل الممرَّرة).
 */
export function applyRefinement(session, index, res, { maxDesigns = 30 } = {}) {
  if (!res || res.status !== 'improved') throw Error('لا تحسين لاعتماده.');
  const s = clone(session), src = s.designs[index];
  const e = { doc: res.doc, pat: src.pat || null, summary: (src.summary ? src.summary + ' — ' : '') + `محسَّن (${res.total.before} ← ${res.total.after})`, notes: [...refineNote(res, index), ...(src.notes || [])], floors: src.floors || 1, feedback: { picks: [], text: '', changes: [`تحسين التصميم ${index + 1}: ${res.total.before} ← ${res.total.after}`], reply: { refine: { from: index + 1, total: res.total, table: res.table, changes: res.changes, rooms: res.rooms, sim: res.sim }, done: [], failed: [], picks: [], unclear: [], unsupported: [], kept: false, unchanged: false, otherFails: [] }, refine: index },
    engine: src.engine || '', ledger: res.ledger || null, mirror: src.mirror ?? null, fit: src.fit || null };
  s.designs.push(e);
  s.seen ||= []; try { s.seen.push(visualSig(parseDoc(res.doc))); } catch { /* بلا بصمة */ }
  if (s.designs.length > maxDesigns) s.designs.splice(0, s.designs.length - maxDesigns);
  s.current = s.designs.length - 1;
  ensureScores(s);
  return s;
}

export default { refineDesign, applyRefinement, refineNote, deltaTable, enumerateEdits, REFINE_LIMITS };
