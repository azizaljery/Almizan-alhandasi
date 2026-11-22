// محرر التعديل مع القفل: يطبّق تعديلًا طلبه العميل على تصميم معروض مع الحفاظ حرفيًا على الأجزاء المقفلة (design-lock.mjs)،
// ثم يقيس الأثر بمدقّق مستقل (design-impact.mjs). يعمل على مستند التصميم/جلسته لا داخل محرك بعينه: تعديلاته الجراحية على المستند،
// وتعديل «إعادة التوليد» يمرّ بالمولّد (أيًّا كان: الحالي أو المرجعي) ثم يُفحص ناتجه بالقفل نفسه.
// نتيجة كل محاولة: status =
//   'applied'       طُبّق (جلسة جديدة بتصميم جديد؛ الأصل لا يُمسّ) والمقفل بقي حرفيًا ولا تراجع إلزاميًا.
//   'needsApproval' لا طريق يحفظ المقفل: لم يُطبَّق شيء؛ proposal فيه ما سيتغير في كل جزء مقفل وسببه، ولا يتابع إلا بـ approveProposal.
//   'rejected'      «مرفوض: تراجع إلزامي»: كل ما جُرّب يكسر شرطًا إلزاميًا كان متحققًا؛ لا يُعرض للموافقة.
//   'failed'        لا مرشح ممكن (لا غرفة تتسع…) مع السبب بالأرقام.
// لا يغيّر العدد أو المقاس أو الأدوار تلقائيًا: ما لم يطلبه العميل صراحة يُترك.
import { parseDoc, serialize, applyCommandInPlace } from './draw/doc.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { verifyLocks, createLocks, protectedIds, lockableParts, describeLockResult } from './design-lock.mjs';
import { impactReport, REJECT_LABEL, auditDoc } from './design-impact.mjs';
import { shiftWall } from './design-refine.mjs';
import { fixWindowJunctions } from './villa-layout.mjs';
import { swingSectors, sectorPoints, fixtureRect, penetration } from './draw/review.mjs';
import { ensureScores } from './design-session.mjs';
import { visualSig } from './villa-layout.mjs';
import { stampDesign } from './design-review.mjs';

export const EDIT_VERSION = 'design-lock-edit/1';
/** حدود تصميمية (افتراضات الميزان؛ ليست اشتراطات نظامية): أصغر غرفة نوم صافية، وأصغر ضلع، وحمام ملحق، وثخانة القاطع. */
export const EDIT_LIMITS = Object.freeze({ bedMinArea: 12, bedMinSide: 3.0, bathW: 1.6, bathD: 2.4, partition: .12, doorW: .9, bathDoorW: .8, winW: 1.4, hostMinArea: 12, hostMinSide: 2.4, maxShift: 2.0, shiftStep: .1 });
const clone = v => JSON.parse(JSON.stringify(v));
const r3 = v => Math.round(v * 1000) / 1000;
const CIRC = new Set(['living', 'corridor', 'entrance']);
const num = v => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(v);
const fail = (code, message) => Object.assign(new Error(message), { code });
const run = (d, c) => applyCommandInPlace(d, c);

// ------------------------------------------------------------------------------------------ إدارة الأقفال في الجلسة
/** يقفل غرفًا (بمعرّفات تسمياتها في مستند التصميم index). يعيد نسخة جديدة من الجلسة. */
export function lockParts(session, labelIds, { index = session.current, note = '' } = {}) {
  const s = clone(session), doc = parseDoc(s.designs[index].doc), have = new Set((s.locks || []).map(l => l.key));
  const fresh = createLocks(doc, labelIds, { note }).filter(l => !have.has(l.key));
  s.locks = [...(s.locks || []), ...fresh];
  s.lockLog = [...(s.lockLog || []), { op: 'lock', keys: fresh.map(l => l.key), design: index }];
  return s;
}
export function unlockPart(session, key) {
  const s = clone(session);
  s.locks = (s.locks || []).filter(l => l.key !== key);
  s.lockLog = [...(s.lockLog || []), { op: 'unlock', keys: [key] }];
  return s;
}
export const lockedKeys = session => new Set((session.locks || []).map(l => l.key));

// ------------------------------------------------------------------------------------------ هندسة مساعدة
const rectOfNet = net => {
  const xs = net.map(p => p.x), ys = net.map(p => p.y), r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const area = Math.abs(net.reduce((s, p, i) => { const q = net[(i + 1) % net.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;
  return Math.abs(area - (r.x1 - r.x0) * (r.y1 - r.y0)) < .02 ? r : null; // مستطيل فعلًا (لا L ولا منحنٍ)
};
const center = r => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
const rotFor = (bx, by) => Math.atan2(bx, -by);
const roomIn = (m, level, p) => m.levelById.get(level)?.roomAt(p) || null;

/** يضيف باب غرفة على قطعة حد بين غرفة وجارتها (دائرة حركة) بشرط ألّا يمس جدارًا محميًا. يعيد معرّف الفتحة أو null. */
function addDoorOnEdge(d, m, room, lv, prot, { nbPred = t => CIRC.has(t), width = EDIT_LIMITS.doorW, minLen = 1.3, kind = 'door', orient = null } = {}) {
  const pieces = room.edges.filter(e => e.space && !e.exterior).map(e => ({ e, nb: lv.rooms.find(r => r.spaceId === e.space) })).filter(x => x.nb && !x.nb.unlabelled && nbPred(x.nb.type, x.nb) && Math.hypot(x.e.b.x - x.e.a.x, x.e.b.y - x.e.a.y) >= minLen && (!orient || (orient === 'v' ? Math.abs(x.e.a.x - x.e.b.x) < 1e-6 : Math.abs(x.e.a.y - x.e.b.y) < 1e-6)));
  pieces.sort((p, q) => Math.hypot(q.e.b.x - q.e.a.x, q.e.b.y - q.e.a.y) - Math.hypot(p.e.b.x - p.e.a.x, p.e.b.y - p.e.a.y));
  for (const { e } of pieces) {
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    const wall = d.walls.find(w => w.level === lv.level.id && !prot.walls.has(w.id) && e.wallIds.includes(w.id) && distToSeg(mid, w.a, w.b) < .01);
    if (!wall) continue;
    const u = { x: (wall.b.x - wall.a.x) / wallLen(wall), y: (wall.b.y - wall.a.y) / wallLen(wall) }, n = { x: -u.y, y: u.x };
    const at0 = (mid.x - wall.a.x) * u.x + (mid.y - wall.a.y) * u.y;
    // الغرفة على أي جانب من الجدار؟ تفتح الدرفة إلى داخلها
    const side = (room.centroid.x - mid.x) * n.x + (room.centroid.y - mid.y) * n.y;
    // مواضع بديلة على القطعة إن زاحمت فتحة قائمة
    const half = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) / 2 - width / 2 - .25;
    for (const off of [0, .3, -.3, .6, -.6, .9, -.9]) {
      if (Math.abs(off) > Math.max(0, half)) continue;
      const at = at0 + off * ((e.b.x - e.a.x) * u.x + (e.b.y - e.a.y) * u.y >= 0 ? 1 : 1);
      const clash = d.openings.some(o => o.wall === wall.id && Math.abs(o.at - at) < (o.w + width) / 2 + .1);
      if (clash) continue;
      try { const r = run(d, { type: 'add-opening', wall: wall.id, kind, at, w: width, swing: side >= 0 ? 'in' : 'out', hinge: 'left' }); return r.ids[0]; } catch { /* جرّب غيره */ }
    }
  }
  return null;
}
function distToSeg(p, a, b) { const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2, t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2)) : 0; return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))); }
/** نافذة على أطول قطعة خارجية. */
function addWindowOnExterior(d, room, lv, prot, { width = EDIT_LIMITS.winW, kind = 'window' } = {}) {
  const pieces = room.edges.filter(e => e.exterior).sort((p, q) => Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y));
  for (const e of pieces) {
    const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); if (len < width + .3) continue;
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    const wall = d.walls.find(w => w.level === lv.level.id && !prot.walls.has(w.id) && e.wallIds.includes(w.id) && distToSeg(mid, w.a, w.b) < .01); if (!wall) continue;
    const u = { x: (wall.b.x - wall.a.x) / wallLen(wall), y: (wall.b.y - wall.a.y) / wallLen(wall) }, at0 = (mid.x - wall.a.x) * u.x + (mid.y - wall.a.y) * u.y;
    for (const off of [0, .4, -.4, .8, -.8]) {
      if (Math.abs(off) > (len - width) / 2 - .1) continue;
      const at = at0 + off, clash = d.openings.some(o => o.wall === wall.id && Math.abs(o.at - at) < (o.w + width) / 2 + .1); if (clash) continue;
      try { const r = run(d, { type: 'add-opening', wall: wall.id, kind, at, w: width }); return r.ids[0]; } catch { /* غيره */ }
    }
  }
  return null;
}
const hasOpening = (lv, room, pred) => lv.openings.some(o => pred(o) && o.sides.some(s => s.room.id === room.id));

/** يؤثث غرفة نوم مستطيلة (رأس السرير على جدار بلا باب وبلا نافذة قدر الإمكان) ويتجنب مسار فتح الأبواب. */
function furnishBedroom(d, lvId, rect, doorsOnRoom = []) {
  const secs = d.openings.flatMap(o => { const w = d.walls.find(x => x.id === o.wall); return w ? swingSectors({ o, wall: w }).map(sec => sectorPoints(sec)) : []; });
  const W = rect.x1 - rect.x0, H = rect.y1 - rect.y0, m = .1;
  const sides = { x0: { dir: [-1, 0], len: H }, x1: { dir: [1, 0], len: H }, y0: { dir: [0, -1], len: W }, y1: { dir: [0, 1], len: W } };
  const onWall = (s, inset, t) => (s === 'x0' ? { x: rect.x0 + inset, y: t } : s === 'x1' ? { x: rect.x1 - inset, y: t } : s === 'y0' ? { x: t, y: rect.y0 + inset } : { x: t, y: rect.y1 - inset });
  const mid = s => (s[0] === 'x' ? (rect.y0 + rect.y1) / 2 : (rect.x0 + rect.x1) / 2);
  const hasDoorNear = s => doorsOnRoom.some(p => (s === 'x0' && Math.abs(p.x - rect.x0) < .3) || (s === 'x1' && Math.abs(p.x - rect.x1) < .3) || (s === 'y0' && Math.abs(p.y - rect.y0) < .3) || (s === 'y1' && Math.abs(p.y - rect.y1) < .3));
  const hit = f => { const R = fixtureRect(f); return secs.some(pts => pts.some(p => R.some((_, i) => false) || inRect(p, R))) || d.fixtures.some(g => g.level === lvId && g.h >= .1 && penetration(R, fixtureRect(g)) > .03); };
  const order = Object.keys(sides).filter(s => !hasDoorNear(s)).sort((p, q) => sides[q].len - sides[p].len);
  for (const s of order) {
    const bw = 1.8, bd = 2.1; if (sides[s].len < bw + 1.0 || (s[0] === 'x' ? W : H) < bd + .9) continue;
    const c = onWall(s, m + bd / 2, mid(s)), [bx, by] = sides[s].dir;
    const bed = { kind: 'bed-double', level: lvId, x: c.x, y: c.y, rot: rotFor(bx, by), w: bw, d: bd, h: .55 };
    if (hit(bed)) continue;
    try { run(d, { type: 'add-fixture', ...bed }); } catch { continue; }
    for (const k of [-1, 1]) { const t = mid(s) + k * (bw / 2 + .3), p = onWall(s, m + .22, t), f = { kind: 'nightstand', level: lvId, x: p.x, y: p.y, rot: rotFor(bx, by) }; if (!hit({ ...f, w: .5, d: .4, h: .5 })) try { run(d, { type: 'add-fixture', ...f }); } catch { /* لم يتسع */ } }
    const o2 = Object.keys(sides).filter(z => z !== s && !hasDoorNear(z) && z !== (s === 'x0' ? 'x1' : s === 'x1' ? 'x0' : s === 'y0' ? 'y1' : 'y0')).sort((p, q) => sides[q].len - sides[p].len)[0];
    if (o2 && sides[o2].len >= 2.6) { const p = onWall(o2, m + .3, mid(o2)), f = { kind: 'wardrobe', level: lvId, x: p.x, y: p.y, rot: rotFor(...sides[o2].dir), w: Math.min(sides[o2].len - .6, 2.2), d: .6, h: 2.2 }; if (!hit(f)) try { run(d, { type: 'add-fixture', ...f }); } catch { /* لم يتسع */ } }
    return true;
  }
  return false;
}
const inRect = (p, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) if ((R[i].y > p.y) !== (R[j].y > p.y) && p.x < (R[j].x - R[i].x) * (p.y - R[i].y) / (R[j].y - R[i].y) + R[i].x) c = !c; return c; };

/** أدوات الحمام الملحق داخل مستطيل صافٍ للحمام (الأدوات على الجدار الطويل البعيد عن الباب). */
function furnishBath(d, lvId, rect, doorSide) {
  const W = rect.x1 - rect.x0, H = rect.y1 - rect.y0, long = W >= H ? ['y0', 'y1'] : ['x0', 'x1'];
  const s = long.find(z => z !== doorSide) || long[0], [lo, hi] = s[0] === 'x' ? [rect.y0, rect.y1] : [rect.x0, rect.x1];
  const dirs = { x0: [-1, 0], x1: [1, 0], y0: [0, -1], y1: [0, 1] }, [bx, by] = dirs[s];
  const onWall = (inset, t) => (s === 'x0' ? { x: rect.x0 + inset, y: t } : s === 'x1' ? { x: rect.x1 - inset, y: t } : s === 'y0' ? { x: t, y: rect.y0 + inset } : { x: t, y: rect.y1 - inset });
  const farHi = !(doorSide && ((doorSide === 'y1' && s[0] === 'x') || (doorSide === 'x1' && s[0] === 'y'))); // الطرف البعيد عن الباب
  const at = k => (farHi ? hi - k : lo + k);
  for (const [kind, inset, k, extra] of [['wc', .36, .45, {}], ['basin', .25, 1.16, {}], ['shower', .5, 0, { w: .9, d: .9 }]]) {
    const t = kind === 'shower' ? (farHi ? lo + .48 : hi - .48) : at(k), p = onWall(inset, t);
    try { run(d, { type: 'add-fixture', kind, level: lvId, x: p.x, y: p.y, rot: rotFor(bx, by), ...extra }); } catch { /* لم يتسع */ }
  }
}

// ------------------------------------------------------------------------------------------ إضافة غرفة نوم
const HOST_PRI = { office: 0, living: 1, bedroom: 2, master: 9, service: 3, storage: 4, other: 5 };
const MAIN_HALL = /^(الصالة|الردهة|صالة الحركة|الصالة العلوية)$/;
function withReq(cand, requirements, ens) { const r = clone(requirements || {}); r.counts = { ...(r.counts || {}) }; r.counts.bedrooms = (r.counts.bedrooms || 0) + 1; if (cand.hasBath) r.counts.baths = (r.counts.baths || 0) + 1; return { ...cand, requirementsAfter: r }; }
function hostOk(room, lv, doc, prot) {
  if (room.unlabelled || !room.net || prot.rooms.has(room.id)) return false;
  if (!(room.type in HOST_PRI)) return false; if (room.type === 'master') return false;
  if (room.type === 'living' && MAIN_HALL.test(room.name)) return false;
  if (doc.stairs.some(s => s.level === lv.level.id && inRect({ x: s.x, y: s.y }, room.net))) return false;
  return !!rectOfNet(room.net);
}
/**
 * مرشحو «أضف غرفة نوم»: يقتطع غرفة نوم من غرفة مضيفة غير مقفلة (مكتب/جلسة عائلية/غرفة نوم واسعة) بقاطع جديد،
 * فيعطيها بابها (من ممر/صالة) ونافذتها (خارجية) وأثاثها، وحمامًا ملحقًا إن طلب العميل حمامًا لكل غرفة.
 * لا يمس ما هو مقفل: لا يقص جدارًا محميًا ولا يضيف فتحة على جدار مقفل.
 */
export function planAddBedroom(doc, { locks = [], requirements = {}, level = null, limit = 14 } = {}) {
  const L = EDIT_LIMITS, prot = protectedIds(doc, locks), m0 = analyzeDoc(doc), ens = !!requirements?.prefs?.allEnsuite;
  const levels = level != null ? [level] : [...m0.levels.keys()].sort((a, b) => (b > 0 ? 1 : 0) - (a > 0 ? 1 : 0) || b - a); // الأعلى أولًا (غرف النوم في العلوي)
  const out = [], reasons = [];
  const needArea = L.bedMinArea + (ens ? L.bathW * L.bathD + .4 : 0), needSide = L.bedMinSide;
  for (const li of levels) {
    const lv = m0.levels[li], hosts = lv.rooms.filter(r => hostOk(r, lv, doc, prot)).sort((a, b) => HOST_PRI[a.type] - HOST_PRI[b.type] || b.area - a.area);
    if (!hosts.length) reasons.push(`الدور ${li + 1}: لا غرفة مضيفة غير مقفلة ومستطيلة.`);
    for (const host of hosts) {
      const R = rectOfNet(host.net); if (!R) continue;
      const W = R.x1 - R.x0, H = R.y1 - R.y0;
      if (W * H < needArea + (host.type === 'bedroom' ? L.bedMinArea : L.hostMinArea) && (host.type === 'bedroom' || W * H < needArea)) { reasons.push(`«${host.name}» (${num(W * H)} م²) لا تتسع لغرفة نوم${ens ? ' بحمامها' : ''} (${num(needArea)} م² على الأقل) وما يبقى منها.`); continue; }
      if (host.type !== 'bedroom' && W * H >= needArea && Math.min(W, H) >= needSide) { // تحويل الغرفة كلها إلى غرفة نوم
        const cand = tryAddBedroom(doc, m0, li, host, R, 'v', 0, 'low', { prot, ens, convert: true });
        if (cand.doc) out.push({ ...withReq(cand, requirements, ens), priority: HOST_PRI[host.type] * 10 + 5, key: `${li}:${host.id}:convert` }); else if (reasons.length < 12) reasons.push(`«${host.name}» (تحويل): ${cand.why}`);
      }
      for (const axis of ['v', 'h']) for (const newSide of ['low', 'high']) {
        const span = axis === 'v' ? W : H, cross = axis === 'v' ? H : W;
        const hostMin = host.type === 'bedroom' ? L.bedMinArea : L.hostMinArea;
        for (let k = 0; k < 2; k++) { // أصغر اقتطاع ثم أرحب منه بنصف متر
          const need = Math.max(needSide, needArea / cross) + (k ? .5 : 0), newNet = r3(need), restNet = span - newNet - L.partition;
          if (newNet * cross < needArea - 1e-6 || restNet < L.hostMinSide || restNet * cross < hostMin) continue;
          if (host.type === 'bedroom' && restNet < L.bedMinSide) continue;
          const c = axis === 'v' ? (newSide === 'low' ? R.x0 + newNet + L.partition / 2 : R.x1 - newNet - L.partition / 2) : (newSide === 'low' ? R.y0 + newNet + L.partition / 2 : R.y1 - newNet - L.partition / 2);
          const cand = tryAddBedroom(doc, m0, li, host, R, axis, c, newSide, { prot, ens });
          if (cand.doc) out.push({ ...withReq(cand, requirements, ens), priority: HOST_PRI[host.type] * 10 + (k ? 3 : 0), key: `${li}:${host.id}:${axis}:${newSide}:${k}` }); else if (reasons.length < 12) reasons.push(`«${host.name}»: ${cand.why}`);
          if (out.length >= limit) return { candidates: out.sort((a, b) => a.priority - b.priority), reasons };
        }
      }
    }
  }
  return { candidates: out.sort((a, b) => a.priority - b.priority), reasons };
}

/** سماكة الجدار على جهة من مستطيل الغرفة المضيفة (من أضلاعها)، أو سماكة القاطع على الجهة التي ينشئها. */
function thicknessOf(host, R, side) {
  const horiz = side[0] === 'y', coord = { x0: R.x0, x1: R.x1, y0: R.y0, y1: R.y1 }[side];
  const e = host.edges.find(x => (horiz ? Math.abs(x.a.y - x.b.y) < 1e-6 && Math.abs(x.a.y - coord) < .4 : Math.abs(x.a.x - x.b.x) < 1e-6 && Math.abs(x.a.x - coord) < .4));
  return e ? e.t : .12;
}
/** يحفر حمامًا ملحقًا في ركن مستطيل غرفة النوم newR: يعيد { bathR, walls, side } أو { why }. */
function carveBath(host, R, newR, partSide, lv0) {
  const L = EDIT_LIMITS, t = L.partition, sides = ['x0', 'x1', 'y0', 'y1'];
  const tOf = sd => (sd === partSide ? t : thicknessOf(host, R, sd));
  const isHostSide = sd => sd !== partSide;
  const edgeOnSide = (sd, pred) => host.edges.some(e => isHostSide(sd) && pred(e) && (sd[0] === 'y' ? Math.abs(e.a.y - e.b.y) < 1e-6 && Math.abs(e.a.y - { y0: R.y0, y1: R.y1 }[sd]) < .4 : Math.abs(e.a.x - e.b.x) < 1e-6 && Math.abs(e.a.x - { x0: R.x0, x1: R.x1 }[sd]) < .4) && overlapsRect(e, newR));
  const nbType = e => lv0.rooms.find(r => r.spaceId === e.space)?.type;
  const doorSides = sides.filter(sd => edgeOnSide(sd, e => e.space && CIRC.has(nbType(e)))), extSides = sides.filter(sd => edgeOnSide(sd, e => e.exterior));
  const opp = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };
  const order = [...(doorSides.length ? [opp[doorSides[0]]] : []), ...extSides, ...sides].filter((x, i, a) => a.indexOf(x) === i && !doorSides.includes(x) && x !== partSide);
  const doorPts = lv0.openings.filter(o => o.door && o.sides.some(sd => sd.room.id === host.id)).map(o => o.p);
  for (const fs of order) for (const cs of [-1, 1]) {
    const horiz = fs[0] === 'y', W = newR.x1 - newR.x0, H = newR.y1 - newR.y0;
    const bw = L.bathW, bd = L.bathD;
    let b;
    if (horiz) { const x0 = cs < 0 ? newR.x0 : newR.x1 - bw, y0 = fs === 'y0' ? newR.y0 : newR.y1 - bd; b = { x0, y0, x1: x0 + bw, y1: y0 + bd }; }
    else { const y0 = cs < 0 ? newR.y0 : newR.y1 - bw, x0 = fs === 'x0' ? newR.x0 : newR.x1 - bd; b = { x0, y0, x1: x0 + bd, y1: y0 + bw }; }
    const cornerSide = horiz ? (cs < 0 ? 'x0' : 'x1') : (cs < 0 ? 'y0' : 'y1');
    if (doorSides.includes(cornerSide) && edgeOnSide(cornerSide, e => e.space && CIRC.has(nbType(e))) && (horiz ? H : W) < bd + L.bedMinSide) continue;
    // لا يغطي باب الغرفة القائم ولا ينزل على فتحة موجودة في أضلاعه
    if (doorPts.some(p => p.x > b.x0 - .5 && p.x < b.x1 + .5 && p.y > b.y0 - .5 && p.y < b.y1 + .5)) continue;
    const remArea = W * H - bw * bd; if (remArea < L.bedMinArea || (horiz ? H - bd : W - bd) < 1.2 && Math.min(horiz ? W - bw : H - bw, horiz ? H : W) < L.bedMinSide) continue;
    // الجدران: داخلي موازٍ للجدار البعيد وجانبي عمودي عليه، ينتهيان على محور جداري الغرفة (T)
    const tf = tOf(fs), ts = tOf(cornerSide);
    let walls;
    if (horiz) {
      const sg = fs === 'y1' ? -1 : 1, yfar = fs === 'y1' ? newR.y1 : newR.y0, yline = yfar + sg * (bd + t / 2), xline = cs < 0 ? b.x1 + t / 2 : b.x0 - t / 2;
      const xside = cs < 0 ? newR.x0 - ts / 2 : newR.x1 + ts / 2, yend = fs === 'y1' ? newR.y1 + tf / 2 : newR.y0 - tf / 2;
      walls = [[{ x: xside, y: yline }, { x: xline, y: yline }], [{ x: xline, y: yline }, { x: xline, y: yend }]];
    } else {
      const sg = fs === 'x1' ? -1 : 1, xfar = fs === 'x1' ? newR.x1 : newR.x0, xline = xfar + sg * (bd + t / 2), yline = cs < 0 ? b.y1 + t / 2 : b.y0 - t / 2;
      const yside = cs < 0 ? newR.y0 - ts / 2 : newR.y1 + ts / 2, xend = fs === 'x1' ? newR.x1 + tf / 2 : newR.x0 - tf / 2;
      walls = [[{ x: xline, y: yside }, { x: xline, y: yline }], [{ x: xline, y: yline }, { x: xend, y: yline }]];
    }
    return { bathR: b, walls, farSide: fs, cornerSide, exterior: extSides.includes(fs) };
  }
  return { why: 'لا يتسع الحمام الملحق في ركن بعيد عن الباب.' };
}

function tryAddBedroom(doc, m0, li, host, R, axis, c, newSide, { prot, ens, convert = false }) {
  const L = EDIT_LIMITS, lv0 = m0.levels[li], lvId = lv0.level.id, d = clone(doc), why = s => ({ doc: null, why: s });
  let newR = R, restR = null, partSide = null;
  if (!convert) {
    const tOfSide = sd => thicknessOf(host, R, sd);
    let a, b;
    if (axis === 'v') { a = { x: c, y: R.y0 - tOfSide('y0') / 2 }; b = { x: c, y: R.y1 + tOfSide('y1') / 2 }; } else { a = { x: R.x0 - tOfSide('x0') / 2, y: c }; b = { x: R.x1 + tOfSide('x1') / 2, y: c }; }
    // لا يقطع باب أو نافذة على الجدارين اللذين ينتهي عليهما
    for (const o of d.openings) { const w = d.walls.find(x => x.id === o.wall); if (!w || w.level !== lvId) continue; const u = { x: (w.b.x - w.a.x) / wallLen(w), y: (w.b.y - w.a.y) / wallLen(w) }, p = { x: w.a.x + u.x * o.at, y: w.a.y + u.y * o.at }; const near = axis === 'v' ? (Math.abs(w.a.y - w.b.y) < 1e-6 && Math.abs(p.x - c) < o.w / 2 + .2 && (Math.abs(w.a.y - a.y) < .02 || Math.abs(w.a.y - b.y) < .02)) : (Math.abs(w.a.x - w.b.x) < 1e-6 && Math.abs(p.y - c) < o.w / 2 + .2 && (Math.abs(w.a.x - a.x) < .02 || Math.abs(w.a.x - b.x) < .02)); if (near) return why('القاطع يقطع فتحة قائمة على جدار الغرفة.'); }
    try { run(d, { type: 'add-wall', level: lvId, a, b, t: L.partition }); } catch (e) { return why('تعذّر رسم القاطع: ' + e.message); }
    newR = axis === 'v' ? (newSide === 'low' ? { ...R, x1: c - L.partition / 2 } : { ...R, x0: c + L.partition / 2 }) : (newSide === 'low' ? { ...R, y1: c - L.partition / 2 } : { ...R, y0: c + L.partition / 2 });
    restR = axis === 'v' ? (newSide === 'low' ? { ...R, x0: c + L.partition / 2 } : { ...R, x1: c - L.partition / 2 }) : (newSide === 'low' ? { ...R, y0: c + L.partition / 2 } : { ...R, y1: c - L.partition / 2 });
    partSide = axis === 'v' ? (newSide === 'low' ? 'x1' : 'x0') : (newSide === 'low' ? 'y1' : 'y0');
  }
  // القطع الثابتة في الجزء الجديد (أو التي يقطعها القاطع) تُحذف ويُؤثَّث من جديد
  for (const f of [...d.fixtures]) { if (f.level !== lvId || !inRect({ x: f.x, y: f.y }, host.net)) continue; const fr = fixtureRect(f); const inNew = convert || fr.some(p => p.x > newR.x0 - .01 && p.x < newR.x1 + .01 && p.y > newR.y0 - .01 && p.y < newR.y1 + .01); const cut = !convert && (fr.some(p => (axis === 'v' ? p.x < c : p.y < c)) && fr.some(p => (axis === 'v' ? p.x > c : p.y > c))); if (inNew || cut) d.fixtures = d.fixtures.filter(x => x.id !== f.id); }
  const nums = d.labels.filter(l => l.type === 'bedroom' || l.type === 'master').map(l => Number(/(\d+)\s*$/.exec(l.name)?.[1]) || 0), n = Math.max(1, ...nums) + 1;
  const hostLabel = d.labels.find(l => l.level === lvId && inRect(l.seed, host.net));
  if (!convert && hostLabel && inRectBox(hostLabel.seed, newR)) hostLabel.seed = { ...center(restR) };
  // الحمام الملحق
  let bath = null, bedSeed = center(newR);
  if (ens) {
    const cb = carveBath(host, R, newR, partSide, lv0); if (cb.why) return why(cb.why);
    try { for (const [p, q] of cb.walls) run(d, { type: 'add-wall', level: lvId, a: p, b: q, t: L.partition }); } catch (e) { return why('تعذّر رسم جدران الحمام: ' + e.message); }
    bath = cb;
    const b = cb.bathR, hz = cb.farSide[0] === 'y';
    // نقطة غرفة النوم: منتصف المتبقي بعيدًا عن الحمام
    const remR = hz ? (cb.farSide === 'y1' ? { ...newR, y1: b.y0 - L.partition } : { ...newR, y0: b.y1 + L.partition }) : (cb.farSide === 'x1' ? { ...newR, x1: b.x0 - L.partition } : { ...newR, x0: b.x1 + L.partition });
    bedSeed = center(remR); bath.remR = remR;
    try { run(d, { type: 'add-label', level: lvId, name: `حمام غرفة ${n}`, roomType: 'bath', seed: center(b) }); } catch (e) { return why('تعذّر تسمية الحمام: ' + e.message); }
  }
  if (convert) { if (!hostLabel) return why('الغرفة المضيفة بلا تسمية.'); hostLabel.name = `غرفة نوم ${n}`; hostLabel.type = 'bedroom'; hostLabel.seed = bedSeed; }
  else { try { run(d, { type: 'add-label', level: lvId, name: `غرفة نوم ${n}`, roomType: 'bedroom', seed: bedSeed }); } catch (e) { return why('تعذّر تسمية الغرفة: ' + e.message); } }
  // أبواب: لكل جزء بلا باب
  let m1 = analyzeDoc(d), lv1 = m1.levelById.get(lvId);
  const rBed = lv1.roomAt(bedSeed), rRest = restR ? lv1.roomAt(center(restR)) : null;
  if (!rBed || rBed.unlabelled || (rRest && rRest.id === rBed.id)) return why('القاطع لم يفصل الغرفتين.');
  for (const room of [rBed, rRest].filter(Boolean)) if (!hasOpening(lv1, room, o => o.door)) {
    const id = addDoorOnEdge(d, m1, room, lv1, prot); if (!id) return `تعذّر إعطاء «${room.name}» بابًا على ممر أو صالة بلا مساس بجدار مقفل.`.replace(/^/, '') && why(`تعذّر إعطاء «${room.name}» بابًا على ممر أو صالة بلا مساس بجدار مقفل.`);
    m1 = analyzeDoc(d); lv1 = m1.levelById.get(lvId);
  }
  if (bath) {
    const rBath = lv1.roomAt(center(bath.bathR)); if (!rBath || rBath.id === lv1.roomAt(bedSeed).id) return why('الحمام لم ينفصل عن غرفة النوم.');
    const sideWallVertical = bath.farSide[0] === 'y'; // الجدار الجانبي عمودي على الجدار البعيد
    const id = addDoorOnEdge(d, m1, rBath, lv1, prot, { nbPred: (t, nb) => nb.id === lv1.roomAt(bedSeed)?.id, width: L.bathDoorW, minLen: .9, orient: sideWallVertical ? 'v' : 'h' }); if (!id) return why('تعذّر وضع باب الحمام.');
    m1 = analyzeDoc(d); lv1 = m1.levelById.get(lvId);
    const rb = lv1.roomAt(center(bath.bathR)); if (rb && !hasOpening(lv1, rb, o => o.window)) addWindowOnExterior(d, rb, lv1, prot, { width: .6, kind: 'window' });
    const longSide = sideWallVertical ? (bath.cornerSide === 'x0' ? 'x1' : 'x0') : (bath.cornerSide === 'y0' ? 'y1' : 'y0'); // جهة الباب
    furnishBath(d, lvId, bath.bathR, longSide);
  }
  m1 = analyzeDoc(d); lv1 = m1.levelById.get(lvId);
  const bedRoom = lv1.roomAt(bedSeed);
  if (!hasOpening(lv1, bedRoom, o => o.window)) { if (!addWindowOnExterior(d, bedRoom, lv1, prot)) return why('غرفة النوم الجديدة بلا جدار خارجي يتسع لنافذة.'); }
  m1 = analyzeDoc(d); lv1 = m1.levelById.get(lvId);
  const rr = restR && lv1.roomAt(center(restR)); if (rr && !hasOpening(lv1, rr, o => o.window) && lv0.openings.some(o => o.window && o.sides.some(s => s.room.id === host.id))) addWindowOnExterior(d, rr, lv1, prot);
  const bedNet = lv1.roomAt(bedSeed), bedRect = bath ? bath.remR : newR;
  furnishBedroom(d, lvId, bedRect, lv1.openings.filter(o => o.door && o.sides.some(s => s.room.id === bedNet.id)).map(o => o.p));
  fixWindowJunctions(d);
  const reqAfter = clone(deriveReq(host)); void reqAfter;
  return { doc: d, desc: `${convert ? `حُوّلت «${host.name}» إلى «غرفة نوم ${n}»` : `أُضيفت «غرفة نوم ${n}» باقتطاعها من «${host.name}»`} (${num((newR.x1 - newR.x0) * (newR.y1 - newR.y0))} م² إجمالًا${bath ? ' مع حمام ملحق' : ''}) في ${lv0.level.name}.`, host: host.name, level: lv0.level.name, newName: `غرفة نوم ${n}`, convert, hasBath: !!bath };
}
const deriveReq = () => ({});
const inRectBox = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
const overlapsRect = (e, r) => { const x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), y0 = Math.min(e.a.y, e.b.y), y1 = Math.max(e.a.y, e.b.y); return Math.min(x1, r.x1 + .3) - Math.max(x0, r.x0 - .3) > 1 - 1e-6 || Math.min(y1, r.y1 + .3) - Math.max(y0, r.y0 - .3) > 1 - 1e-6 ? (Math.min(x1, r.x1 + .3) - Math.max(x0, r.x0 - .3) > .8 && Math.min(y1, r.y1 + .3) - Math.max(y0, r.y0 - .3) > -.4) || (Math.min(y1, r.y1 + .3) - Math.max(y0, r.y0 - .3) > .8 && Math.min(x1, r.x1 + .3) - Math.max(x0, r.x0 - .3) > -.4) : false; };
function remainderRect(newR, bath) {
  const b = bath.r, s = bath.side;
  if (s === 'y1') return { ...newR, y1: b.y0 - EDIT_LIMITS.partition }; if (s === 'y0') return { ...newR, y0: b.y1 + EDIT_LIMITS.partition };
  if (s === 'x1') return { ...newR, x1: b.x0 - EDIT_LIMITS.partition }; return { ...newR, x0: b.x1 + EDIT_LIMITS.partition };
}

// ------------------------------------------------------------------------------------------ توسيع غرفة
/**
 * مرشحو «وسّع غرفة»: يزيح جدارًا فاصلًا داخليًا نحو غرفة مجاورة غير مقفلة (خطوة 0.1 م حتى EDIT_LIMITS.maxShift) حتى تبلغ الغرفة المطلوبة
 * المساحة المستهدفة. جدار يلاصق جزءًا مقفلًا (أو يمر به) يُستبعد هنا؛ فإن لم يبقَ مرشح خرج طلب الموافقة بأقل ما يمس المقفل.
 * target: معرّف التسمية أو اسم الغرفة. gain: مساحة إضافية مطلوبة (م²).
 */
export function planEnlargeRoom(doc, { target, gain = 3, locks = [], includeProtected = false, limit = 40 } = {}) {
  const L = EDIT_LIMITS, prot = protectedIds(doc, locks), m0 = analyzeDoc(doc), out = [], reasons = [];
  let lvIdx = -1, room = null;
  for (const lv of m0.levels) for (const r of lv.rooms) if (!r.unlabelled && (r.id === target || r.name === target) && !room) { room = r; lvIdx = lv.levelIndex; }
  if (!room) return { candidates: [], reasons: [`الغرفة «${target}» غير موجودة.`] };
  if (prot.rooms.has(room.id)) return { candidates: [], reasons: [`«${room.name}» مقفلة؛ لا يوسّعها المحرر دون موافقة.`], targetLocked: true };
  const lv = m0.levels[lvIdx], area0 = room.area, goal = area0 + gain;
  const wallsSeen = new Set();
  for (const e of room.edges) {
    if (e.exterior || !e.space) continue;
    const nb = lv.rooms.find(r => r.spaceId === e.space); if (!nb || nb.unlabelled) continue;
    for (const wid of e.wallIds) {
      const w = doc.walls.find(x => x.id === wid); if (!w || wallsSeen.has(wid)) continue; wallsSeen.add(wid);
      const horiz = Math.abs(w.a.y - w.b.y) < 1e-6, vert = Math.abs(w.a.x - w.b.x) < 1e-6; if (!horiz && !vert) continue;
      const n = vert ? { x: 1, y: 0 } : { x: 0, y: 1 }, mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
      const toward = (nb.centroid.x - mid.x) * n.x + (nb.centroid.y - mid.y) * n.y >= 0 ? 1 : -1; // اتجاه الجار: تتسع غرفتنا نحوه
      if (!includeProtected && prot.walls.has(wid)) { reasons.push(`جدار «${room.name}»/«${nb.name}» جزء من حد غرفة مقفلة.`); continue; }
      for (let step = L.shiftStep; step <= L.maxShift + 1e-9; step = r3(step + L.shiftStep)) {
        const d = clone(doc);
        if (!shiftWall(d, wid, toward * step)) break; // يتوقف عند أول إزاحة لا تصلح (الأكبر لا تصلح أيضًا)
        fixWindowJunctions(d);
        const m = analyzeDoc(d), r2n = m.levels[lvIdx].rooms.find(r => r.id === room.id && !r.unlabelled);
        if (!r2n) break;
        if (r2n.area >= goal - 1e-6) { out.push({ doc: d, requirementsAfter: null, desc: `وُسّعت «${room.name}» من ${num(area0)} إلى ${num(r2n.area)} م² بإزاحة الجدار الفاصل مع «${nb.name}» ${num(step)} م.`, step, neighbour: nb.name, wall: wid, key: `${wid}:${toward * step}` }); break; }
      }
      if (out.length >= limit) break;
    }
  }
  out.sort((a, b) => a.step - b.step);
  if (!out.length && !reasons.length) reasons.push(`لا جدار فاصل داخلي يصلح للإزاحة حول «${room.name}».`);
  return { candidates: out, reasons, target: { id: room.id, name: room.name, area: area0 } };
}

// ------------------------------------------------------------------------------------------ اقتراح التعديل
function stampSession(session, index, cand, change, report, { applied }) {
  const s = clone(session), src = s.designs[index];
  const note = `تعديل بقفل: ${cand.desc}`;
  const e = { doc: serialize(cand.doc), pat: src.pat || null, summary: (src.summary ? src.summary + ' — ' : '') + 'معدّل مع حفظ المقفل', notes: [note, ...(src.notes || [])], floors: cand.doc.levels.length, feedback: { picks: [], text: change.text || '', changes: [cand.desc], reply: { lockEdit: { change: { type: change.type, text: change.text || null }, verdict: report.verdict, lock: { ok: report.lock.ok, checked: report.lock.checked }, summary: report.summary }, done: [], failed: [], picks: [], unclear: [], unsupported: [], kept: false, unchanged: false, otherFails: [] }, lockEdit: index },
    engine: src.engine || '', ledger: null, mirror: src.mirror ?? null, fit: src.fit || null };
  if (cand.requirementsAfter) s.input.requirements = clone(cand.requirementsAfter);
  s.designs.push(e); s.seen ||= []; try { s.seen.push(visualSig(parseDoc(e.doc))); } catch { /* بلا بصمة */ }
  s.current = s.designs.length - 1; delete s.designs[s.current].score; ensureScores(s);
  s.lockLog = [...(s.lockLog || []), { op: applied ? 'edit-applied' : 'edit', type: change.type, design: s.current }];
  stampDesign(s, s.current, change.type === 'commands' ? 'manual' : 'chat'); // بوابة المراجعة: تعديل بأوامر الرسم = يدوي، وما سواه بالمحادثة
  return s;
}
function lockViolationsOf(res) { return res.violated.reduce((n, r) => n + r.violations.length, 0); }
/** جدول «قبل/بعد» للأجزاء المقفلة المتغيرة مع السبب: ما سيتغير إن وافق العميل. */
export function proposalChanges(lockRes, change) {
  return lockRes.violated.map(r => ({ key: r.key, name: r.name, type: r.type, kinds: [...new Set(r.violations.map(v => v.kind))], reasons: r.violations.map(v => v.detail), before: r.violations[0]?.before ?? null, after: r.violations[0]?.after ?? null }));
}
const whyText = (change, lockRes) => lockRes.violated.length
  ? `لا أستطيع تنفيذ «${change.label || change.type}» دون تغيير ${lockRes.violated.length === 1 ? 'جزء مقفل' : lockRes.violated.length + ' أجزاء مقفلة'}: ` + lockRes.violated.map(r => `«${r.name}» (${r.violations.map(v => v.label).join('، ')})`).join('؛ ') + '. لن أغيّرها بلا موافقتك.'
  : '';

/**
 * يقترح/يطبّق تعديلًا. change: { type: 'add-bedroom'|'enlarge-room'|'regenerate'|'commands', ... }
 *   add-bedroom   { level? }          غرفة نوم إضافية (+ حمام ملحق إن كان الطلب «حمام لكل غرفة»)
 *   enlarge-room  { target, gain }    توسيع غرفة بمساحة gain م²
 *   regenerate    { picks, text }     إعادة توليد بملاحظات (يمرّ بالمولّد الحالي أو المرجعي: يُمرَّر generate)
 *   commands      { commands:[…] }    أوامر المرسم (applyCommand) كما هي
 * يعيد { status, change, report, proposal?, session?, candidate?, tried }.
 */
export async function proposeChange(session, change, { index = session.current, generate = null, rates = null, redesign = null } = {}) {
  const base = session.designs[index]; if (!base) throw fail('NO_DESIGN', 'التصميم غير موجود.');
  const docBefore = parseDoc(base.doc), locks = session.locks || [], land = session.input?.land || {}, reqBefore = session.input?.requirements || {};
  const baseLocks = locks.length ? verifyLocks(docBefore, locks) : null;
  if (baseLocks && !baseLocks.ok) return { status: 'failed', change, reason: 'التصميم المعروض لا يطابق لقطات الأقفال (قُفلت أجزاء من تصميم آخر).', lock: baseLocks, tried: 0 };
  let cands = [], reasons = [], tried = 0;
  if (change.type === 'add-bedroom') { const p = planAddBedroom(docBefore, { locks, requirements: reqBefore, level: change.level ?? null }); cands = p.candidates; reasons = p.reasons; }
  else if (change.type === 'enlarge-room') {
    const p = planEnlargeRoom(docBefore, { target: change.target, gain: change.gain ?? 3, locks }); cands = p.candidates; reasons = p.reasons;
    if (!cands.length && !p.targetLocked) { const q = planEnlargeRoom(docBefore, { target: change.target, gain: change.gain ?? 3, locks, includeProtected: true }); cands = q.candidates.map(c => ({ ...c, touchesLocked: true })); if (!cands.length) reasons = [...reasons, ...q.reasons]; }
  } else if (change.type === 'commands') {
    const d = clone(docBefore); try { for (const c of change.commands || []) run(d, c); } catch (e) { return { status: 'failed', change, reason: 'تعذّر تنفيذ الأمر: ' + e.message, tried: 1 }; }
    cands = [{ doc: d, requirementsAfter: null, desc: change.label || 'تعديل مباشر على الرسم', key: 'commands' }];
  } else if (change.type === 'regenerate') {
    const fn = redesign; if (!fn) throw fail('NO_REDESIGN', 'تمرير redesign مطلوب لإعادة التوليد.');
    try {
      const out = await fn(session, { picks: change.picks || [], text: change.text || '' }, generate ? { generate } : {});
      const last = out.session.designs.at(-1), d = parseDoc(last.doc);
      cands = [{ doc: d, requirementsAfter: out.session.input.requirements, desc: 'إعادة توليد التصميم بملاحظتك' + (out.changes?.length ? ': ' + out.changes.join('، ') : ''), key: 'regenerate', fromSession: out.session }];
    } catch (e) { return { status: 'failed', change, reason: 'تعذّر التوليد: ' + (e.message || e), tried: 1, code: e.code || null }; }
  } else throw fail('BAD_CHANGE', 'نوع تعديل غير مدعوم: ' + change.type);
  if (!cands.length) return { status: 'failed', change, reason: reasons.length ? reasons.slice(0, 5).join(' | ') : 'لا مرشح ممكن.', reasons, tried: 0 };
  // الترتيب: ما يحفظ المقفل أولًا (قياس رخيص)، ثم الأقل مخالفة، ثم ترتيب المخطِّط
  const scored = cands.map((c, i) => { const lr = locks.length ? verifyLocks(c.doc, locks) : { ok: true, checked: 0, kept: [], violated: [], results: [] }; return { c, i, lr, v: lockViolationsOf(lr) }; }).sort((a, b) => a.v - b.v || a.i - b.i);
  let best = null, firstRejected = null, bestAccepted = null;
  const accKey = it => [it.report.summary.counts.importantRegressed, it.report.summary.counts.indicatorsDown, it.report.summary.counts.regressed];
  const better = (a, b) => { const x = accKey(a), y = accKey(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
  for (const s of scored.slice(0, 12)) {
    tried++;
    const report = impactReport(docBefore, s.c.doc, { requirementsBefore: reqBefore, requirementsAfter: s.c.requirementsAfter || reqBefore, land, locks, rates });
    const item = { ...s, report };
    if (report.verdict === 'accepted') { if (!bestAccepted || better(item, bestAccepted)) bestAccepted = item; if (accKey(item).every(x => x === 0)) break; continue; }
    if (report.verdict === 'needsApproval' && (!best || s.v < best.v)) best = item;
    if (report.verdict === 'rejected' && !firstRejected) firstRejected = item;
  }
  if (bestAccepted) best = bestAccepted;
  const pick = best || firstRejected;
  const base_ = { change, tried, candidateCount: cands.length, reasons };
  if (!pick) return { status: 'failed', ...base_, reason: 'لم يُقَس أي مرشح.' };
  const { c, report } = pick;
  if (serialize(c.doc) === base.doc) return { status: 'unchanged', ...base_, report, reason: 'التعديل المطلوب لا يغيّر المخطط (متحقق أصلًا أو غير ممكن)؛ لم يُضف تصميم.' };
  if (report.verdict === 'accepted') {
    const s = c.fromSession ? withLocks(c.fromSession, session, c, report, change) : stampSession(session, index, c, change, report, { applied: true });
    return { status: 'applied', ...base_, report, candidate: { desc: c.desc, doc: serialize(c.doc) }, session: s };
  }
  if (report.verdict === 'rejected') return { status: 'rejected', ...base_, label: REJECT_LABEL, report, reason: `${REJECT_LABEL}: ${report.mandatoryRegressions.map(r => r.requirement).slice(0, 4).join('؛ ')}`, candidate: { desc: c.desc, doc: serialize(c.doc) } };
  const changes = proposalChanges(report.lock, change);
  return { status: 'needsApproval', ...base_, report, candidate: { desc: c.desc, doc: serialize(c.doc) },
    proposal: { id: `proposal-${(session.lockLog || []).length + 1}`, reason: whyText(change, report.lock), changes, desc: c.desc, requirementsAfter: c.requirementsAfter || null, impactSummary: report.summary, touchesLocked: !!c.touchesLocked, fromSession: c.fromSession ? true : false } };
}
function withLocks(freshSession, prev, c, report, change) {
  const s = clone(freshSession); s.locks = clone(prev.locks || []); s.lockLog = [...(prev.lockLog || []), { op: 'edit-applied', type: change.type, design: s.designs.length - 1 }];
  stampDesign(s, s.designs.length - 1, 'chat'); // بوابة المراجعة: إعادة توليد بملاحظة مع حفظ الأقفال
  const e = s.designs.at(-1); e.feedback = { ...(e.feedback || {}), reply: { ...(e.feedback?.reply || {}), lockEdit: { change: { type: change.type }, verdict: report.verdict, lock: { ok: report.lock.ok, checked: report.lock.checked }, summary: report.summary } } };
  return s;
}

/**
 * موافقة العميل على اقتراح needsApproval: يطبّق التصميم المقترح ويُبقي الأقفال المعتمَدة صراحةً بلقطاتها الجديدة (relock)
 * أو يفكّها (release). accept: قائمة مفاتيح الأقفال التي يوافق على تغييرها (أو 'all'). ما لم يُقبل منها يحجب التطبيق.
 */
export function approveProposal(session, result, { accept = 'all', index = session.current, relock = true } = {}) {
  if (!result || result.status !== 'needsApproval') throw fail('NOT_PENDING', 'لا اقتراح بانتظار الموافقة.');
  const need = result.proposal.changes.map(c => c.key), ok = accept === 'all' ? need : accept;
  const missing = need.filter(k => !ok.includes(k));
  if (missing.length) throw fail('APPROVAL_INCOMPLETE', 'لم توافق على تغيير: ' + result.proposal.changes.filter(c => missing.includes(c.key)).map(c => `«${c.name}»`).join('، '));
  const doc = parseDoc(result.candidate.doc);
  let s = result.proposal.fromSession ? null : null;
  const cand = { doc, desc: result.proposal.desc + ' (بموافقتك على تغيير الأجزاء المقفلة)', requirementsAfter: result.proposal.requirementsAfter };
  s = stampSession(session, index, cand, result.change, result.report, { applied: true });
  // الأقفال: المقبول يُعاد قفله بهندسته الجديدة (أو يُفكّ)؛ والباقي يبقى
  const keep = (session.locks || []).filter(l => !ok.includes(l.key));
  const after = analyzeDoc(doc), moved = [];
  if (relock) for (const l of session.locks || []) if (ok.includes(l.key)) {
    const lv = after.levels[l.levelIndex], room = lv?.rooms.find(r => !r.unlabelled && r.name === l.name && r.type === l.type);
    if (room) moved.push(room.id);
  }
  s.locks = [...keep, ...(relock ? createLocks(doc, moved) : [])];
  s.lockLog = [...(s.lockLog || []), { op: 'approved', keys: ok, relock }];
  stampDesign(s, s.current, result.change?.type === 'commands' ? 'manual' : 'chat'); // الأقفال تغيّرت بعد الموافقة: يُعاد الختم بها
  return s;
}

export { describeLockResult, lockableParts, auditDoc };
export default { EDIT_VERSION, EDIT_LIMITS, lockParts, unlockPart, lockedKeys, planAddBedroom, planEnlargeRoom, proposeChange, approveProposal, proposalChanges };
