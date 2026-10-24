// (الجولة السادسة عشرة) قياسات العيوب المعمارية التي أثبتتها المراجعة المستقلة r15 ولم يكن النظام يقيسها
// (docs/research/system-vs-reviewer-r15.md §4). كلها تُقاس من المستند المرسوم وحده (لا من نية المولّد)، وكلها قيم تصميمية
// افتراضية للميزان أو تفضيلات سعودية (غير متحققة نظاميًا) — لا رقم نظامي هنا. أي بند يطلبه العميل نصًا يغلبها.
//
//  WINDOW_PARKING   — نافذة غرفة خاصة (مجلس النساء، غرفة نوم، الطعام، الصالة العائلية) تطل على ساحة المواقف/البوابة: مجال
//                     رؤيتها (عرضها + 1 م من كل جانب، بعمق 3 م خارج الجدار) يقطع موقف سيارة، بلا حجب (جلسة عالية ≥ 1.6 م
//                     أو سور حاجب بينهما).
//  HALL_STREET      — نافذة الصالة العائلية تطل على الشارع (فناء أمامي مفتوح على الشارع/البوابة) بلا حجب.
//  MASTER_VIA_DRESS — جناح النوم الرئيسي لا يُدخل إلا من الصالة العائلية عبر غرفة الملابس أو الحمام.
//  GUEST_DINING     — ضيف الرجال لا يصل إلى الطعام من المجلس إلا عبر منطقة العائلة (الصالة أو مدخل العائلة أو ممراتها) —
//                     طبقة التفضيل السعودي.
//  PARKING_SHALLOW  — موقف موازٍ للشارع في ارتداد أمامي أقل من 5.5 م وأمام نافذة.
import { analyzeDoc } from './draw/digest.mjs';
import { pointInPolygon, segmentIntersection } from './draw/geom.mjs';

export const R16_DEFECTS = Object.freeze({
  WINDOW_PARKING: { ar: 'نافذة غرفة خاصة تطل على ساحة المواقف أو البوابة (أقل من 3 م) بلا حجب', tier: 'architectural' },
  HALL_STREET: { ar: 'نافذة الصالة العائلية تطل على فناء أمامي مفتوح على الشارع بلا حجب', tier: 'architectural' },
  MASTER_VIA_DRESS: { ar: 'جناح النوم الرئيسي لا يُدخل إلا من الصالة عبر غرفة الملابس أو الحمام', tier: 'architectural' },
  GUEST_DINING: { ar: 'ضيف الرجال يعبر منطقة العائلة ليصل إلى الطعام', tier: 'saudi-preference' },
  PARKING_SHALLOW: { ar: 'موقف موازٍ للشارع في ارتداد أقل من 5.5 م أمام نافذة', tier: 'architectural' },
});
/** قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا). */
export const R16_LIMITS = Object.freeze({ viewDepth: 3, viewSide: 1, highSill: 1.6, bayDepth: 5.5 });

const r2 = v => Math.round(v * 100) / 100;
const isWomen = r => r.type === 'majlis' && /النساء/.test(r.name || '');
const isMenMajlis = r => r.type === 'majlis' && !/النساء/.test(r.name || '');
const isFamilyHall = r => r.type === 'living' && !/الضيوف|الطعام|مغاسل/.test(r.name || '');
/** الغرف الخاصة التي لا تطل على المواقف/البوابة (المراجع المستقل r15). */
export const isPrivateRoom = r => isWomen(r) || r.type === 'bedroom' || r.type === 'master' || r.type === 'dining' || isFamilyHall(r);
const roomDoors = (lv, room) => lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === room.id)).map(op => { const me = op.sides.find(s => s.room.id === room.id); return { op, other: me.other === 'outside' ? null : lv.roomsById.get(me.other) || null, outside: me.other === 'outside' }; });
const nbrs = (lv, room) => roomDoors(lv, room).filter(d => !d.outside && d.other).map(d => d.other);

/** الجهة القانونية (x عبر الواجهة، y من الشارع إلى الخلف) لمدخل الأرض. */
function frame(entry) {
  return entry === 's' ? p => ({ x: p.x, y: p.y }) : entry === 'n' ? p => ({ x: -p.x, y: -p.y }) : entry === 'e' ? p => ({ x: p.y, y: -p.x }) : p => ({ x: -p.y, y: p.x });
}
const OUT_DIR = { s: { x: 0, y: -1 }, n: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };

/** مجال رؤية نافذة: مستطيل أمامها (عرضها + side من كل جانب) بعمق depth، كمضلع في إحداثيات المستند. */
export function viewQuad(op, out, depth = R16_LIMITS.viewDepth, side = R16_LIMITS.viewSide) {
  const u = { x: -out.y, y: out.x }, hw = op.w / 2 + side, p = op.p, t0 = (op.wall?.t || .2) / 2;
  return [[-hw, t0], [hw, t0], [hw, t0 + depth], [-hw, t0 + depth]].map(([s, t]) => ({ x: p.x + u.x * s + out.x * t, y: p.y + u.y * s + out.y * t }));
}
/** تقاطع مضلعين محدبين صغيرين بالعينات (حواف ونقاط داخلية) — يكفي لمستطيلات المواقف ومجالات الرؤية. */
function polysTouch(A, B) {
  if (A.some(p => pointInPolygon(p, B, 1e-6)) || B.some(p => pointInPolygon(p, A, 1e-6))) return true;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segmentIntersection(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return false;
}
/** أقرب مسافة من مركز النافذة (على وجه الجدار الخارجي) إلى مضلع، باتجاه خروجها. */
function distAlong(op, out, poly) {
  const t0 = (op.wall?.t || .2) / 2; let m = Infinity;
  for (const q of poly) { const d = (q.x - op.p.x) * out.x + (q.y - op.p.y) * out.y - t0; if (d >= -.05) m = Math.min(m, Math.max(0, d)); }
  return m;
}
/** سور حاجب (جدار من نوع «سور») يقطع الخط بين النافذة والهدف. */
function fenceBetween(lv, a, b) {
  return lv.walls.some(w => (w.kind || 'wall') === 'fence' && segmentIntersection(a, b, w.a, w.b));
}
const screened = op => (op.o?.sill ?? 0) >= R16_LIMITS.highSill - 1e-6;

/**
 * يقيس العيوب الخمسة على المستند. يعيد [{ id, ar, tier, applicable, pass, value, reasons_ar, clientAsked }].
 * request: { text } (للإعفاء بطلب العميل: «موقف موازي»، «المجلس بعيد عن الطعام»…).
 */
export function measureR16(doc, request = {}, model = analyzeDoc(doc)) {
  const out = [], G = model.levels[0]; if (!G) return out;
  const text = String(request.text || '');
  const push = (id, pass, value, reasons, applicable = true, clientAsked = false) => out.push({ id, ar: R16_DEFECTS[id].ar, tier: R16_DEFECTS[id].tier, pass: !!pass, applicable, value, reasons_ar: reasons, clientAsked });
  const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id);
  const extWins = G.openings.filter(op => op.window).flatMap(op => op.sides.filter(s => s.exterior && s.other === 'outside').map(s => ({ op, room: s.room, out: s.outward })));
  // (أ) نافذة غرفة خاصة على المواقف
  {
    const bad = [], seen = [];
    for (const w of extWins) {
      if (!isPrivateRoom(w.room)) continue;
      const V = viewQuad(w.op, w.out);
      for (const z of bays) {
        if (!polysTouch(V, z.polygon)) continue;
        const d = distAlong(w.op, w.out, z.polygon), c = z.polygon.reduce((a, p) => ({ x: a.x + p.x / z.polygon.length, y: a.y + p.y / z.polygon.length }), { x: 0, y: 0 });
        const scr = screened(w.op) ? 'جلسة عالية' : fenceBetween(G, w.op.p, c) ? 'سور حاجب' : null;
        seen.push({ room: w.room.name, opening: w.op.id, bay: z.name || z.id, dist: r2(d), screened: scr });
        if (!scr) bad.push(`نافذة «${w.room.name}» ${w.op.sides.find(s => s.room.id === w.room.id)?.compass ? 'على الجهة ' + w.op.sides.find(s => s.room.id === w.room.id).compass + ' ' : ''}تطل على «${z.name || 'موقف سيارة'}» من ${r2(d)} م بلا حجب`);
        break;
      }
    }
    push('WINDOW_PARKING', !bad.length, { windows: seen }, bad, bays.length > 0);
  }
  // (أ٢) نافذة الصالة العائلية على الشارع (فناء أمامي مفتوح على الشارع والبوابة)
  {
    const streets = [...new Set([doc.entry || 's', ...(doc.streets || [])])].filter(s => OUT_DIR[s]);
    const bad = [], seen = [];
    for (const w of extWins) {
      if (!isFamilyHall(w.room)) continue;
      const st = streets.find(s => w.out.x * OUT_DIR[s].x + w.out.y * OUT_DIR[s].y > .7); if (!st) continue;
      const scr = screened(w.op) ? 'جلسة عالية' : null;
      seen.push({ room: w.room.name, opening: w.op.id, street: st, screened: scr });
      if (!scr) bad.push(`نافذة «${w.room.name}» تطل على الشارع (${st}) عبر الفناء الأمامي بلا حجب`);
    }
    push('HALL_STREET', !bad.length, { windows: seen }, bad, true);
  }
  // (ب) الماستر عبر غرفة الملابس من الصالة
  {
    const bad = [], seen = [];
    for (const lv of model.levels) for (const M of lv.rooms.filter(r => r.type === 'master')) {
      const ns = nbrs(lv, M), inner = o => o.type === 'bath' || /ملابس/.test(o.name || '');
      if (!ns.length || !ns.every(inner)) continue;
      const via = ns.flatMap(o => nbrs(lv, o).filter(x => x.id !== M.id && !inner(x)).map(x => ({ o, x })));
      const fam = via.filter(v => isFamilyHall(v.x));
      seen.push({ room: M.name, via: via.map(v => `${v.o.name}←${v.x.name}`) });
      if (fam.length && via.every(v => isFamilyHall(v.x))) bad.push(`«${M.name}» لا تُدخل إلا من «${fam[0].x.name}» عبر «${fam[0].o.name}»`);
    }
    push('MASTER_VIA_DRESS', !bad.length, { suites: seen }, bad, model.levels.some(lv => lv.rooms.some(r => r.type === 'master')));
  }
  // (ج) مسار ضيف الرجال إلى الطعام لا يعبر منطقة العائلة (في دور المجلس)
  {
    const noLink = /مجلس[^،.]{0,20}(?:بعيد|منفصل|مستقل) (?:عن|من) (?:ال)?(?:طعام|سفر)/.test(text.replace(/[ةه]/g, 'ه'));
    const men = G.rooms.filter(isMenMajlis), din = G.rooms.filter(r => r.type === 'dining');
    const guestOk = r => r.type === 'dining' || /الرجال|مغاسل|مقلط|الضيوف|تقديم/.test(r.name || '') && ['corridor', 'entrance', 'living', 'bath'].includes(r.type);
    let route = null, viaFam = null;
    if (men.length && din.length) {
      for (const m of men) {
        const seen = new Set([m.id]), q = [m];
        while (q.length && !route) { const r = q.shift(); for (const o of nbrs(G, r)) { if (seen.has(o.id)) continue; seen.add(o.id); if (o.type === 'dining') { route = [m.name, o.name]; break; } if (guestOk(o)) q.push(o); } }
        if (route) break;
      }
      if (!route) {
        // أقصر مسار عبر أي فراغ: ما الذي يعبره الضيف
        const m = men[0], prev = new Map([[m.id, null]]), q = [m]; let hit = null;
        while (q.length && !hit) { const r = q.shift(); for (const o of nbrs(G, r)) { if (prev.has(o.id)) continue; prev.set(o.id, r.id); if (o.type === 'dining') { hit = o; break; } if (!['bedroom', 'master', 'bath', 'kitchen'].includes(o.type)) q.push(o); } }
        if (hit) { viaFam = []; for (let k = prev.get(hit.id); k && k !== m.id; k = prev.get(k)) viaFam.unshift(G.roomsById.get(k).name); }
      }
    }
    const applicable = men.length > 0 && din.length > 0 && !noLink;
    push('GUEST_DINING', !!route || !applicable, { route, crosses: viaFam }, route || !applicable ? [] : [viaFam?.length ? `من «${men[0].name}» إلى «${din[0].name}» يعبر الضيف ${viaFam.map(n => `«${n}»`).join(' ثم ')}` : `لا مسار للضيف من «${men[0].name}» إلى «${din[0].name}» إلا عبر منطقة العائلة`], applicable, noLink);
  }
  // (د) موقف موازٍ في ارتداد ضحل أمام نافذة
  {
    const F = frame(doc.entry || 's'), bad = [], seen = [];
    const parallelAsked = /موقف[^،.]{0,15}(?:موازي|طولي)/.test(text);
    const wallYs = G.walls.filter(w => (w.kind || 'wall') !== 'fence').flatMap(w => [w.a, w.b]).map(F);
    const plotYs = (doc.plot?.polygon || []).map(F);
    for (const z of bays) {
      const ps = z.polygon.map(F), b = { x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)), y1: Math.max(...ps.map(p => p.y)) };
      const parallel = b.x1 - b.x0 > b.y1 - b.y0 + .05; if (!parallel) continue;
      // عمق الارتداد أمام الموقف: من حد الأرض الأمامي إلى أقرب جدار خلفه على امتداده
      const front = plotYs.length ? Math.min(...plotYs.map(p => p.y)) : b.y0;
      const behind = wallYs.filter(p => p.x > b.x0 - .3 && p.x < b.x1 + .3 && p.y >= b.y1 - .05).map(p => p.y);
      const depth = behind.length ? Math.min(...behind) - front : Infinity;
      const facing = extWins.filter(w => polysTouch(viewQuad(w.op, w.out), z.polygon)).map(w => w.room.name);
      seen.push({ bay: z.name || z.id, parallel, setback: r2(depth), windows: facing });
      if (depth < R16_LIMITS.bayDepth - .05 && facing.length && !parallelAsked) bad.push(`«${z.name || 'موقف'}» موازٍ للشارع في ارتداد ${r2(depth)} م أمام نافذة «${facing[0]}» — دخول السيارة غير عملي`);
    }
    push('PARKING_SHALLOW', !bad.length, { bays: seen }, bad, bays.length > 0, parallelAsked);
  }
  return out;
}
export default { measureR16, R16_DEFECTS, R16_LIMITS, isPrivateRoom, viewQuad };
