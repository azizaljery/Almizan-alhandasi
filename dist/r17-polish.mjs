// (الجولة السابعة عشرة) تحسين التصميم نفسه لا تخفيف المعيار (قرار المالك). يعمل في المولّد على المستند الذي يبنيه، بعد تحسينات
// الجولة السادسة عشرة وقبل المراجعة، ويكتب كل تغيير في ملاحظات البديل:
//  1) الصالة العائلية ممر عابر (HALL_THROUGH، privacy-defects.mjs): تُزاح أبواب الصالة على جدرانها المشتركة (إلى أطرافها قرب مداخل
//     الحركة) حتى تتسع جلسة عائلية 3.0 × 3.6 م يلتف حولها ممر 0.9 م — دون أن يعترض مصراعٌ أثاثًا أو جدارًا أو بابًا آخر.
//  2) «مقهوي» (تفضيل سعودي افتراضي للميزان): غرفة تحضير قهوة صغيرة تُفتح على مجلس الرجال، تُقتطع من ركن الطعام الملاصق للمجلس متى
//     اتسع الطعام (يبقى صافيه ≥ 12 م² وطاولته المرسومة خارج الركن) ولم يقع في الركن باب أو نافذة أو أثاث.
// كل القيم قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا).
import { analyzeDoc } from './draw/digest.mjs';
import { applyCommand } from './draw/doc.mjs';
import { measureHall, isPrivateRoom } from './privacy-defects.mjs';
import { swingBlockers, swingSectors, sectorPoints } from './draw/review.mjs';
import { pointInPolygon } from './draw/geom.mjs';

const r2 = v => Math.round(v * 100) / 100;
const isFamilyHall = r => r.type === 'living' && !/الضيوف|الطعام|مغاسل/.test(r.name || '');
const isMenMajlis = r => r.type === 'majlis' && !/النساء/.test(r.name || '');
const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
const projAt = (w, p) => { const L = wallLen(w) || 1; return ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / L; };
const sharedEdges = (a, b) => { const ids = new Set(b.edges.map(e => e.edgeId)); return a.edges.filter(e => ids.has(e.edgeId)); };
function fixtureRect(f, grow = 0) {
  const c = Math.cos(f.rot || 0), s = Math.sin(f.rot || 0), hw = (f.w || .5) / 2 + grow, hd = (f.d || .5) / 2 + grow;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => ({ x: f.x + u * c - v * s, y: f.y + u * s + v * c }));
}
const polyHit = (A, B) => A.some(p => pointInPolygon(p, B, 1e-9)) || B.some(p => pointInPolygon(p, A, 1e-9));
/** ممر الباب (عرضه × 0.6 م على جهتيه) خالٍ من الأثاث. */
function doorwayClear(doc, lv, op) {
  const u = { x: (op.wall.b.x - op.wall.a.x) / wallLen(op.wall), y: (op.wall.b.y - op.wall.a.y) / wallLen(op.wall) }, n = { x: -u.y, y: u.x }, hw = op.w / 2, d = (op.wall.t || .2) / 2 + .6;
  const box = [[-hw, -d], [hw, -d], [hw, d], [-hw, d]].map(([a, b]) => ({ x: op.p.x + u.x * a + n.x * b, y: op.p.y + u.y * a + n.y * b }));
  return !doc.fixtures.some(f => f.level === lv.level.id && (f.h ?? 1) >= .1 && f.kind !== 'rug' && polyHit(fixtureRect(f), box));
}
const hallFails = doc => { try { return measureHall(doc, {}).find(g => g.id === 'HALL_THROUGH' && g.applicable && !g.pass) || null; } catch { return null; } };

/** (1) أبواب الصالة تُزاح حتى تتسع الجلسة العائلية. يعدّل المستند في مكانه. يعيد ملاحظة أو null. */
export function polishHallSeat(doc) {
  if (!hallFails(doc)) return null;
  const model = analyzeDoc(doc), lv = model.levels.find(l => l.rooms.some(isMenMajlis)) || model.levels[0];
  const hall = lv.rooms.filter(isFamilyHall).sort((a, b) => b.area - a.area)[0]; if (!hall) return null;
  const ops = lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === hall.id) && op.sides.every(s => s.other !== 'outside' || s.room.id !== hall.id));
  // المواضع الممكنة لكل باب: على جزء جداره المشترك بين الصالة والغرفة الأخرى، بعيدًا عن التقاطعات 0.15 م، ودون تداخل مع فتحات الجدار
  const options = [];
  for (const op of ops) {
    const other = op.sides.find(s => s.room.id !== hall.id)?.room; if (!other) continue;
    const segs = sharedEdges(hall, other).filter(e => e.wallIds?.includes(op.wall.id));
    for (const e of segs) {
      const t0 = Math.min(projAt(op.wall, e.a), projAt(op.wall, e.b)) + op.w / 2 + .15, t1 = Math.max(projAt(op.wall, e.a), projAt(op.wall, e.b)) - op.w / 2 - .15;
      for (let t = t0; t <= t1 + 1e-6; t += .2) {
        const at = Math.round(t * 1000) / 1000; if (Math.abs(at - op.o.at) < .1) continue;
        if (doc.openings.some(x => x.id !== op.id && x.wall === op.wall.id && Math.abs(x.at - at) < (x.w + op.w) / 2 + .12)) continue;
        options.push({ id: op.id, at, other: other.name });
      }
    }
  }
  const tryApply = moves => {
    const keep = moves.map(m => { const o = doc.openings.find(x => x.id === m.id); const old = o.at; o.at = m.at; return { o, old }; });
    let ok = !hallFails(doc);
    if (ok) {
      const m2 = analyzeDoc(doc), lv2 = m2.levels.find(l => l.level.id === lv.level.id);
      for (const m of moves) { const op = lv2.openings.find(x => x.id === m.id); if (!op || swingBlockers(m2, lv2, op).length || !doorwayClear(doc, lv2, op)) { ok = false; break; } }
      // كل الفراغات ما زالت تُبلغ
      if (ok && lv2.seedKind && lv2.rooms.some(r => r.type !== 'other' && !lv2.reach.has(r.id))) ok = false;
    }
    if (!ok) for (const k of keep) k.o.at = k.old;
    return ok;
  };
  // باب واحد أولًا (الأقرب إلى موضعه)، ثم بابان
  options.sort((a, b) => Math.abs(a.at - doc.openings.find(x => x.id === a.id).at) - Math.abs(b.at - doc.openings.find(x => x.id === b.id).at));
  for (const m of options) if (tryApply([m])) return `أُزيح باب «${m.other}» على جدار «${hall.name}» فاتسعت فيها جلسة عائلية 3.0 × 3.6 م يلتف حولها ممر الحركة (الصالة لا تبقى ممرًا عابرًا — قيمة تصميمية افتراضية للميزان).`;
  const byDoor = new Map(); for (const m of options) (byDoor.get(m.id) || byDoor.set(m.id, []).get(m.id)).push(m);
  const ids = [...byDoor.keys()];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = byDoor.get(ids[i]).slice(0, 14), B = byDoor.get(ids[j]).slice(0, 14);
    for (const a of A) for (const b of B) if (tryApply([a, b])) return `أُزيح بابا «${a.other}» و«${b.other}» على جدران «${hall.name}» فاتسعت فيها جلسة عائلية 3.0 × 3.6 م يلتف حولها ممر الحركة (قيمة تصميمية افتراضية للميزان).`;
  }
  return null;
}

export const PANTRY = Object.freeze({ name: 'مقهوي', d: 1.45, l: 1.75, dinMinNet: 12, kitMinNet: 14, door: .8, T: .12 });
/** (2) «مقهوي» يُفتح على مجلس الرجال من ركن المطبخ (ويُفتح عليه أيضًا: باب خدمة) أو الطعام الملاصق له. يعدّل المستند في مكانه. */
export function addMajlisPantry(doc) {
  const model = analyzeDoc(doc), G = model.levels[0]; if (!G) return null;
  if (G.rooms.some(r => r.name === PANTRY.name)) return null;
  const men = G.rooms.filter(isMenMajlis); if (!men.length) return null;
  const L = G.level.id, P = PANTRY;
  for (const M of men) for (const D of [...G.rooms.filter(r => r.type === 'kitchen'), ...G.rooms.filter(r => r.type === 'dining')]) {
    const isK = D.type === 'kitchen', minNet = isK ? P.kitMinNet : P.dinMinNet;
    const xs = D.net.map(p => p.x), ys = D.net.map(p => p.y), B = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    if (Math.abs(D.area - (B.x1 - B.x0) * (B.y1 - B.y0)) > .05 * D.area) { if (globalThis.__r17dbg) console.log("skip rect"); continue; } // طعام مستطيل
    for (const e of sharedEdges(D, M).filter(x => x.length >= P.l + .2)) { // حافة الطعام نفسها (وجه جداره) على الجدار المشترك
      const horiz = Math.abs(e.a.y - e.b.y) < 1e-6; if (!horiz && Math.abs(e.a.x - e.b.x) > 1e-6) continue;
      const wall = doc.walls.find(w => w.id === e.wallIds?.[0]); if (!wall || (wall.kind || 'wall') !== 'wall') continue;
      // جهة الطعام من الجدار المشترك، والركنان على طرفي الحافة المشتركة إن كانا ركنين للطعام
      const lineAt = horiz ? e.a.y : e.a.x, into = horiz ? (Math.abs(B.y0 - lineAt) < Math.abs(B.y1 - lineAt) ? 1 : -1) : (Math.abs(B.x0 - lineAt) < Math.abs(B.x1 - lineAt) ? 1 : -1);
      const face = lineAt;
      const lo = horiz ? Math.min(e.a.x, e.b.x) : Math.min(e.a.y, e.b.y), hi = horiz ? Math.max(e.a.x, e.b.x) : Math.max(e.a.y, e.b.y);
      const dLo = horiz ? B.x0 : B.y0, dHi = horiz ? B.x1 : B.y1;
      for (const end of ['lo', 'hi']) {
        if (end === 'lo' ? Math.abs(lo - dLo) > .2 : Math.abs(hi - dHi) > .2) { if (globalThis.__r17dbg) console.log("skip L96", D.name, end, lo, dLo, hi, dHi); continue; }
        const c = end === 'lo' ? dLo + P.l + P.T / 2 : dHi - P.l - P.T / 2; // محور الجدار العمودي على الجدار المشترك
        const dd = face + into * (P.d + P.T / 2); // محور الجدار الموازي
        // الطعام الباقي: صافيه ≥ 12 م²، وطاولته وكراسيه المرسومة كلها خارج الركن (فحص الأثاث أدناه)
        const W = dHi - dLo, Dp = horiz ? B.y1 - B.y0 : B.x1 - B.x0, rest = W * Dp - (P.l + P.T) * (P.d + P.T);
        if (rest < minNet + .3) { if (globalThis.__r17dbg) console.log("skip L101", D.name, end); continue; }
        if (Dp - P.d - P.T < 1.0 || Math.min(W - P.l - P.T, Dp) < (isK ? 3.0 : 2.8)) { if (globalThis.__r17dbg) console.log("skip L102", D.name, end); continue; } // يبقى للمضيف مستطيل رئيسي بعرضه الصافي، ولا شريط ميت بجانب المقهوي
        const rx0 = horiz ? (end === 'lo' ? dLo : c) : Math.min(face, dd), rx1 = horiz ? (end === 'lo' ? c : dHi) : Math.max(face, dd);
        const ry0 = horiz ? Math.min(face, dd) : (end === 'lo' ? dLo : c), ry1 = horiz ? Math.max(face, dd) : (end === 'lo' ? c : dHi);
        const notch = [{ x: rx0 - .15, y: ry0 - .15 }, { x: rx1 + .15, y: ry0 - .15 }, { x: rx1 + .15, y: ry1 + .15 }, { x: rx0 - .15, y: ry1 + .15 }];
        // لا أثاث في الركن ولا فتحة على جدرانه (باب الطعام إلى المجلس وغيره يبقى خارجه)
        // أثاث المطبخ في الركن (وحدة، ثلاجة، موقد) يُزاح على امتداد جداره بعيدًا عن الركن إن اتسع الجدار؛ وإلا لا يُقتطع
        const hits = doc.fixtures.filter(f => f.level === L && pointInPolygon({ x: f.x, y: f.y }, D.net, 1e-6) && polyHit(fixtureRect(f), notch));
        const moved = [];
        if (hits.length && isK && hits.every(f => ['kitchen-run', 'fridge', 'stove'].includes(f.kind))) {
          for (const f of hits) {
            const ux = Math.cos(f.rot || 0), uy = Math.sin(f.rot || 0), along = horiz ? Math.abs(ux) > .7 : Math.abs(uy) > .7; if (!along) { moved.length = 0; break; }
            const sgn = end === 'lo' ? 1 : -1, need = (() => { const pts = fixtureRect(f); const v = horiz ? pts.map(q => q.x) : pts.map(q => q.y); return end === 'lo' ? (c + P.T / 2 + .05) - Math.min(...v) : Math.max(...v) - (c - P.T / 2 - .05); })();
            if (need <= 0) continue;
            // وحدة المطبخ تُقصَّر من طرف الركن (طرفها الآخر ثابت) ما بقيت ≥ 2.0 م؛ وغيرها يُزاح بكامله
            const g = f.kind === 'kitchen-run' && f.w - need >= 2.0
              ? { ...f, w: f.w - need, x: horiz ? f.x + sgn * need / 2 : f.x, y: horiz ? f.y : f.y + sgn * need / 2 }
              : { ...f, x: horiz ? f.x + sgn * need : f.x, y: horiz ? f.y : f.y + sgn * need };
            const inside = fixtureRect(g).every(q => pointInPolygon(q, D.net, 1e-6));
            const clash = doc.fixtures.some(o => o.id !== f.id && !hits.includes(o) && o.level === L && (o.h ?? 1) >= .1 && o.kind !== 'rug' && polyHit(fixtureRect(o), fixtureRect(g)));
            if (!inside || clash) { moved.length = 0; break; }
            moved.push([f, g]);
          }
        }
        if (hits.length && moved.length !== hits.length) { if (globalThis.__r17dbg) console.log("skip L107", D.name, end); continue; }
        const inNotch = op => op.p.x > rx0 - .15 - op.w / 2 && op.p.x < rx1 + .15 + op.w / 2 && op.p.y > ry0 - .15 - op.w / 2 && op.p.y < ry1 + .15 + op.w / 2;
        // باب للمضيف يقع في الركن (باب المطبخ إلى الطعام مثلًا) يُزاح على جداره خارج الركن إن اتسع الحد المشترك؛ والنافذة لا تُمس
        const inN = G.openings.filter(op => op.sides.some(s => s.room.id === D.id) && inNotch(op));
        const shifts = [];
        for (const op of inN) {
          if (!op.door || op.wall.id === wall.id) { shifts.length = -1; break; }
          const other = op.sides.find(s => s.room.id !== D.id)?.room; const seg = other ? sharedEdges(D, other).find(e => e.wallIds?.includes(op.wall.id)) : null;
          if (!seg) { shifts.length = -1; break; }
          const s0 = Math.min(projAt(op.wall, seg.a), projAt(op.wall, seg.b)) + op.w / 2 + .15, s1 = Math.max(projAt(op.wall, seg.a), projAt(op.wall, seg.b)) - op.w / 2 - .15;
          let best = null;
          for (let t = s0; t <= s1 + 1e-6; t += .1) { const q = { ...op, p: { x: op.wall.a.x + (op.wall.b.x - op.wall.a.x) / wallLen(op.wall) * t, y: op.wall.a.y + (op.wall.b.y - op.wall.a.y) / wallLen(op.wall) * t } }; if (inNotch(q)) continue; if (doc.openings.some(x => x.id !== op.id && x.wall === op.wall.id && Math.abs(x.at - t) < (x.w + op.w) / 2 + .12)) continue; if (!best || Math.abs(t - op.o.at) < Math.abs(best - op.o.at)) best = t; }
          if (best == null) { shifts.length = -1; break; }
          shifts.push([op.id, Math.round(best * 1000) / 1000]);
        }
        if (inN.length && shifts.length !== inN.length) { if (globalThis.__r17dbg) console.log("skip L109", D.name, end); continue; }
        // لا فتحة تعبر موضع الجدارين الجديدين على الجدران الحاملة
        const snap = JSON.stringify(doc);
        try {
          const A1 = horiz ? { x: c, y: wall.a.y } : { x: wall.a.x, y: c }, A2 = horiz ? { x: c, y: dd } : { x: dd, y: c };
          const sideAt = end === 'lo' ? (horiz ? B.x0 : B.y0) : (horiz ? B.x1 : B.y1);
          // طرف الجدار الموازي على محور الجدار الجانبي للطعام (نصف سماكته خارج الوجه)
          const sideWall = doc.walls.find(w => w.level === L && (horiz ? Math.abs(w.a.x - w.b.x) < 1e-6 && Math.abs(Math.abs(w.a.x - sideAt) - (w.t || .2) / 2) < .03 && Math.min(w.a.y, w.b.y) <= dd + 1e-6 && Math.max(w.a.y, w.b.y) >= dd - 1e-6 : Math.abs(w.a.y - w.b.y) < 1e-6 && Math.abs(Math.abs(w.a.y - sideAt) - (w.t || .2) / 2) < .03 && Math.min(w.a.x, w.b.x) <= dd + 1e-6 && Math.max(w.a.x, w.b.x) >= dd - 1e-6));
          if (!sideWall) throw Error('side');
          const sAx = horiz ? sideWall.a.x : sideWall.a.y;
          const B1 = horiz ? { x: sAx, y: dd } : { x: dd, y: sAx };
          for (const [id, at] of shifts) { const o = doc.openings.find(x => x.id === id); if (o) o.at = at; }
          for (const [f, g] of moved) { const live = doc.fixtures.find(x => x.id === f.id); if (live) { live.x = g.x; live.y = g.y; live.w = g.w; } }
          let r = applyCommand(doc, { type: 'add-wall', level: L, a: A1, b: A2, t: P.T }); Object.assign(doc, r.doc);
          r = applyCommand(doc, { type: 'add-wall', level: L, a: B1, b: A2, t: P.T }); Object.assign(doc, r.doc);
          // باب المقهوي على جدار المجلس المشترك (داخل حدود الركن)
          const pos = horiz ? (end === 'lo' ? (dLo + c) / 2 : (c + dHi) / 2) : (end === 'lo' ? (dLo + c) / 2 : (c + dHi) / 2);
          const at = projAt(wall, horiz ? { x: pos, y: lineAt } : { x: lineAt, y: pos });
          if (doc.openings.some(o => o.wall === wall.id && Math.abs(o.at - at) < (o.w + P.door) / 2 + .12)) throw Error('door');
          r = applyCommand(doc, { type: 'add-opening', wall: wall.id, kind: 'door', at, w: P.door }); Object.assign(doc, r.doc);
          // من المطبخ: باب خدمة ثانٍ من المقهوي إلى المطبخ على الجدار الموازي (التقديم من المطبخ إلى المجلس لا يعبر الصالة)
          const wallsAB = isK ? doc.walls.slice(-2) : []; // الجداران الجديدان: A (عمودي على جدار المجلس) وB (موازٍ له)
          r = applyCommand(doc, { type: 'add-label', level: L, seed: { x: (rx0 + rx1) / 2, y: (ry0 + ry1) / 2 }, name: P.name, roomType: 'storage' }); Object.assign(doc, r.doc);
          // (المغسلة تُوضع بعد الأبواب على جدار لا يعترض مصراعًا ولا مدخلًا)
          // تحقق: المقهوي غرفة يُفتح بابها على المجلس، والمجلس والطعام ما زالا متصلين كما كانا، ولا غرفة فقدت الوصول
          const m2 = analyzeDoc(doc), G2 = m2.levels[0], Pn = G2.rooms.find(x => x.name === P.name), M2 = G2.rooms.find(x => x.name === M.name), D2 = G2.rooms.find(x => x.name === D.name);
          const nb = (A, Bn) => G2.openings.some(op => op.door && op.sides.some(s => s.room.id === A?.id) && op.sides.some(s => s.room.id === Bn?.id));
          const wasMD = G.openings.some(op => op.door && op.sides.some(s => s.room.id === M.id) && op.sides.some(s => s.room.id === D.id));
          if (!Pn || !nb(Pn, M2) || Pn.area < 1.8 || (wasMD && !nb(M2, D2))) throw Error('check');
          if (G2.seedKind && G2.rooms.some(x => x.type !== 'other' && !G2.reach.has(x.id))) throw Error('reach');
          const dnet = D2.area;
          if (dnet < minNet) throw Error('din');
          const op2 = G2.openings.find(o => o.wall.id === wall.id && Math.abs(o.o.at - at) < 1e-6);
          // الباب يُفتح إلى داخل المقهوي (لا يعترض جلسة المجلس)، ومدخله من جهة المجلس خالٍ: الجلسة الملاصقة للجدار تُقصَّر من طرف الركن
          if (op2) {
            const live = doc.openings.find(o => o.id === op2.id);
            const intoPantry = sw => { live.swing = sw; const mm = analyzeDoc(doc), gg = mm.levels[0], oo = gg.openings.find(o => o.id === live.id); const pts = swingSectors(oo).flatMap(sectorPoints); const pr = gg.rooms.find(x => x.name === P.name); return pts.length && pts.every(q => pointInPolygon(q, pr.net, 1e-6)) && !swingBlockers(mm, gg, oo).length; };
            if (!intoPantry('in') && !intoPantry('out')) throw Error('swing');
            const u = { x: (wall.b.x - wall.a.x) / wallLen(wall), y: (wall.b.y - wall.a.y) / wallLen(wall) }, n = { x: -u.y, y: u.x }, mSide = (M.centroid.x - op2.p.x) * n.x + (M.centroid.y - op2.p.y) * n.y > 0 ? 1 : -1;
            const t0 = (wall.t || .2) / 2, hw = P.door / 2 + .1, box = [[-hw, t0], [hw, t0], [hw, t0 + .6], [-hw, t0 + .6]].map(([a, b]) => ({ x: op2.p.x + u.x * a + n.x * b * mSide, y: op2.p.y + u.y * a + n.y * b * mSide }));
            for (const f of doc.fixtures.filter(f => f.level === L && f.kind !== 'rug' && pointInPolygon({ x: f.x, y: f.y }, M.net, 1e-6) && polyHit(fixtureRect(f), box))) {
              if (f.kind !== 'majlis-sofa' && f.kind !== 'sofa-3' && f.kind !== 'sofa-2') throw Error('seat');
              const fu = { x: Math.cos(f.rot || 0), y: Math.sin(f.rot || 0) }; if (Math.abs(fu.x * u.x + fu.y * u.y) < .7) throw Error('seat-dir');
              // طرف الجلسة البعيد عن الباب ثابت، وطرفها القريب يتراجع إلى ما بعد الباب بـ 0.1 م
              const proj = q => (q.x - op2.p.x) * u.x + (q.y - op2.p.y) * u.y, ends = fixtureRect(f).map(proj), lo2 = Math.min(...ends), hi2 = Math.max(...ends);
              const keepHi = Math.abs(hi2) > Math.abs(lo2), a2 = keepHi ? hw : lo2, b2 = keepHi ? hi2 : -hw, nw = b2 - a2; if (nw < 1.6) throw Error('seat-short');
              const mid = (a2 + b2) / 2, fc = (f.x - op2.p.x) * n.x + (f.y - op2.p.y) * n.y; f.w = Math.round(nw * 100) / 100; f.x = op2.p.x + u.x * mid + n.x * fc; f.y = op2.p.y + u.y * mid + n.y * fc;
            }
          }
          if (isK) {
            // باب الخدمة من المقهوي إلى المطبخ: على الجدار A أو B قرب ركنهما الداخلي، يُفتح إلى داخل المقهوي، ومدخله في المطبخ خالٍ من الأثاث
            let ok = false;
            for (const wN of wallsAB) {
              const LN = wallLen(wN); if (LN < P.door + .5) continue;
              const nearA2 = Math.hypot(wN.b.x - A2.x, wN.b.y - A2.y) < Math.hypot(wN.a.x - A2.x, wN.a.y - A2.y);
              for (const at2 of [nearA2 ? LN - P.door / 2 - .2 : P.door / 2 + .2, LN / 2]) {
                const snap2 = JSON.stringify(doc);
                try {
                  const rr = applyCommand(doc, { type: 'add-opening', wall: wN.id, kind: 'door', at: at2, w: P.door }); Object.assign(doc, rr.doc);
                  const kid = doc.openings[doc.openings.length - 1].id;
                  for (const sw of ['in', 'out']) {
                    doc.openings.find(o => o.id === kid).swing = sw;
                    const mm = analyzeDoc(doc), gg = mm.levels[0], kd = gg.openings.find(o => o.id === kid), pr = gg.rooms.find(x => x.name === P.name), kk = gg.rooms.find(x => x.name === D.name);
                    if (!kd || !kd.sides.some(q => q.room.id === pr?.id) || !kd.sides.some(q => q.room.id === kk?.id)) { if (globalThis.__r17dbg) console.log('kd-sides', wN.id, at2, kd?.sides.map(q=>q.room.name)); break; }
                    const pts = swingSectors(kd).flatMap(sectorPoints);
                    if (globalThis.__r17dbg) console.log('kd', wN.id, at2, sw, pts.every(q => pointInPolygon(q, pr.net, 1e-6)), swingBlockers(mm, gg, kd), doorwayClear(doc, gg, kd));
                    if (pts.every(q => pointInPolygon(q, pr.net, 1e-6)) && !swingBlockers(mm, gg, kd).length && doorwayClear(doc, gg, kd)) { ok = true; break; }
                  }
                  if (ok) break;
                  const back = JSON.parse(snap2); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, back);
                } catch { const back = JSON.parse(snap2); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, back); }
              }
              if (ok) break;
            }
            if (!ok) throw Error('kdoor');
          }
          {
            const mm = analyzeDoc(doc), gg = mm.levels[0], pr = gg.rooms.find(x => x.name === P.name), pd = gg.openings.filter(o => o.door && o.sides.some(q => q.room.id === pr.id));
            const bad = g => { const R = fixtureRect(g, .02); if (!R.every(q => pointInPolygon(q, pr.net, 1e-6))) return true; return pd.some(o => { const pts = swingSectors(o).flatMap(sectorPoints); if (pts.some(q => pointInPolygon(q, R, 1e-9))) return true; const uu = { x: (o.wall.b.x - o.wall.a.x) / wallLen(o.wall), y: (o.wall.b.y - o.wall.a.y) / wallLen(o.wall) }, nn = { x: -uu.y, y: uu.x }, h2 = o.w / 2 + .05, dd2 = (o.wall.t || .2) / 2 + .65; const bx = [[-h2, -dd2], [h2, -dd2], [h2, dd2], [-h2, dd2]].map(([a, b]) => ({ x: o.p.x + uu.x * a + nn.x * b, y: o.p.y + uu.y * a + nn.y * b })); return polyHit(R, bx); }); };
            const cx = (rx0 + rx1) / 2, cy = (ry0 + ry1) / 2, cands = [{ x: cx, y: ry0 + .3, rot: 0 }, { x: cx, y: ry1 - .3, rot: Math.PI }, { x: rx0 + .3, y: cy, rot: -Math.PI / 2 }, { x: rx1 - .3, y: cy, rot: Math.PI / 2 }];
            for (const q of [...cands]) for (const k of [-.45, .45]) cands.push(Math.abs(Math.sin(q.rot)) < .5 ? { ...q, x: q.x + k } : { ...q, y: q.y + k });
            const pick = cands.map(q => ({ kind: 'basin', level: L, x: q.x, y: q.y, rot: q.rot, w: .6, d: .45, h: .85 })).find(g => !bad(g));
            if (pick) { r = applyCommand(doc, { type: 'add-fixture', level: L, kind: 'basin', x: pick.x, y: pick.y, rot: pick.rot }); Object.assign(doc, r.doc); }
          }
          return isK ? `«${P.name}» ${r2(P.l)}×${r2(P.d)} م بين «${D.name}» و«${M.name}» ببابين: تحضير القهوة والتقديم من المطبخ إلى المجلس دون عبور الصالة — اقتُطع من ركن المطبخ الملاصق للمجلس، وبقي المطبخ ${r2(dnet)} م² (تفضيل سعودي افتراضي للميزان، قابل للتغيير).`
            : `«${P.name}» ${r2(P.l)}×${r2(P.d)} م يُفتح على «${M.name}» (تحضير القهوة والشاي للضيوف دون عبور البيت) — اقتُطع من ركن «${D.name}» الملاصق للمجلس، وبقي الطعام ${r2(dnet)} م² (تفضيل سعودي افتراضي للميزان، قابل للتغيير).`;
        } catch (err) { if (globalThis.__r17dbg) console.log("pantry-fail", M.name, D.name, end, err.message); const back = JSON.parse(snap); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, back); }
      }
    }
  }
  return null;
}

/** تحسينات الجولة السابعة عشرة على المستند (في مكانه). يعيد { notes_ar[] }. */
export function polishR17(doc, { pantry = true } = {}) {
  const notes = [];
  try { const n = polishHallSeat(doc); if (n) notes.push(n); } catch { /* يبقى كما رُسم */ }
  if (pantry) try { const n = addMajlisPantry(doc); if (n) notes.push(n); } catch { /* يبقى كما رُسم */ }
  return { notes_ar: notes };
}
export default { polishR17, polishHallSeat, addMajlisPantry, PANTRY };
void isPrivateRoom;
