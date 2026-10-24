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
import { measureR20, R20_MANDATORY } from './r20-checks.mjs';

export const R16_DEFECTS = Object.freeze({
  WINDOW_PARKING: { ar: 'نافذة غرفة خاصة تطل على ساحة المواقف أو البوابة (أقل من 3 م) بلا حجب', tier: 'architectural' },
  HALL_STREET: { ar: 'نافذة الصالة العائلية تطل على فناء أمامي مفتوح على الشارع بلا حجب', tier: 'architectural' },
  MASTER_VIA_DRESS: { ar: 'جناح النوم الرئيسي لا يُدخل إلا من الصالة عبر غرفة الملابس أو الحمام', tier: 'architectural' },
  GUEST_DINING: { ar: 'ضيف الرجال يعبر منطقة العائلة ليصل إلى الطعام', tier: 'mizan-mandatory' },
  PARKING_SHALLOW: { ar: 'موقف موازٍ للشارع في ارتداد أقل من 5.5 م أمام نافذة', tier: 'mizan-mandatory' },
  // (الجولة السابعة عشرة) — القياس أسفل الملف (measureHall)
  HALL_SMALL: { ar: 'الصالة العائلية صغيرة نسبةً إلى مجلس الرجال (أقل من 0.8 من مساحته)', tier: 'architectural' },
  HALL_THROUGH: { ar: 'الصالة العائلية ممر عابر: مسارات الحركة الرئيسية لا تترك فيها جلسة عائلية 3.0 × 3.6 م', tier: 'architectural' },
  // (الجولة التاسعة عشرة) — القياس أسفل الملف (measureUpper)
  WET_STACK: { ar: 'حمام في الدور العلوي فوق فراغ جاف حساس في الأرضي (مجلس، طعام، مدخل، صالة، نوم) لا فوق رطب أو خدمة', tier: 'architectural' },
  MASTER_STAIR_DOOR: { ar: 'باب الغرفة الرئيسية على الفراغ المفتوح الذي يصل إليه الدرج (والعميل طلبها بعيدة عن الدرج)', tier: 'architectural' },
});
/**
 * (الجولة التاسعة عشرة، توجيه المالك) العيوب التي تُعامل «مخالفة إلزامية» في الميزان: لا يُعرض البديل صالحًا أيًّا كانت درجته (محجوب).
 *  - GUEST_DINING: خصوصية العائلة — ضيف الرجال يعبر منطقة العائلة إلى الطعام (يُعفى بطلب العميل فصل المجلس عن الطعام).
 *  - PARKING_SHALLOW: موقف لا تدخله السيارة عمليًا (موازٍ في ارتداد ضحل أمام نافذة) — يُعفى بطلب العميل موقفًا موازيًا.
 * هذه قيم الميزان الافتراضية (غير نظامية)؛ المراجع المستقل عدّها إلزامية في r17–r18. البنود الصريحة من طلب العميل والبوابات تبقى محجوبة كما هي.
 */
// (الجولة العشرون) ومعها المجلس المعزول ونافذة المجلس/المقلط على حوش العائلة (r20-checks.mjs، المراجعة العمياء r19)
export const MANDATORY_R16 = Object.freeze(['GUEST_DINING', 'PARKING_SHALLOW', ...(globalThis.process?.env?.R14_OFF || '').includes('r20chk') ? [] : R20_MANDATORY]);
/** (الجولة التاسعة عشرة) ما يحتاج مراجعة متخصصة (صحية/إنشائية) لا يحكم عليه الميزان: يُذكر منفصلًا عن العيب والمخالفة. */
export const SPECIALIST_R16 = Object.freeze(['WET_STACK']);
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
    // (الجولة الثامنة عشرة) الطعام الذي يصله الضيف لا يُفتح على منطقة العائلة (مدخل العائلة أو الصالة أو ممر النوم) بفتحة بلا باب:
    // الضيف الجالس فيه يكون في مدخل العائلة نفسه، والعائلة لا تُغلقه — وهذا نص التفضيل في البرنامج نفسه («والطعام يُغلق على العائلة
    // بباب»). C8-2 في after-17 وصل ضيفه إلى الطعام من «مدخل الرجال» والطعام مفتوح بقوس على «مدخل العائلة» فاجتاز القياس
    // (المراجع المستقل r17 حكم عليه «بعد تعديل»). ممر وسيط بين الطعام والصالة (لا فتحة مباشرة) لا يُعدّ هنا: المراجع قبله في C5-1 وC6-1 وC10-3.
    let exposed = null;
    if (route) {
      const dn = G.rooms.find(r => r.type === 'dining' && r.name === route[route.length - 1]);
      const famSide = o => (o.type === 'entrance' && !/الرجال|الضيوف/.test(o.name || '')) || isFamilyHall(o) || (o.type === 'corridor' && /الغرف|النوم|الجناح/.test(o.name || ''));
      const open = dn ? roomDoors(G, dn).filter(d => d.other && famSide(d.other) && d.op.o?.kind === 'arch') : [];
      if (open.length) exposed = open.map(d => d.other.name);
    }
    const applicable = men.length > 0 && din.length > 0 && !noLink;
    const ok = !!route && !exposed;
    push('GUEST_DINING', ok || !applicable, { route, crosses: viaFam, exposedTo: exposed }, ok || !applicable ? [] : exposed ? [`«${route[route.length - 1]}» الذي يصله ضيف الرجال مفتوح بلا باب على ${exposed.map(n => `«${n}»`).join(' و')} — الضيف في منطقة العائلة ولا تُغلق عليه`] : [viaFam?.length ? `من «${men[0].name}» إلى «${din[0].name}» يعبر الضيف ${viaFam.map(n => `«${n}»`).join(' ثم ')}` : `لا مسار للضيف من «${men[0].name}» إلى «${din[0].name}» إلا عبر منطقة العائلة`], applicable, noLink);
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
  // (الجولة السابعة عشرة) الصالة العائلية صغيرة نسبةً إلى مجلس الرجال، أو ممر عابر لا تبقى فيه جلسة عائلية (المراجع المستقل r16: C9-2)
  for (const g of measureHall(doc, request, model)) out.push(g);
  for (const g of measureUpper(doc, request, model)) out.push(g);
  if (!String(globalThis.process?.env?.R14_OFF || '').includes('r20chk')) for (const g of measureR20(doc, request, model)) out.push(g);
  return out;
}

// ———————————————————————————— (الجولة التاسعة عشرة) الدور العلوي ————————————————————————————
//  WET_STACK          — حمام علوي يقع ≥ 25٪ منه فوق فراغ جاف حساس في الأرضي (مجلس، طعام، مدخل، صالة، غرفة نوم): تمديدات الصرف والعزل المائي
//                       فوق سقف فراغ مأهول — عيب معماري، ومعه بند «يحتاج مراجعة صحية وإنشائية متخصصة» (لا يحكم الميزان على الصرف ولا العزل).
//                       الحمام فوق رطب (مطبخ، دورة مياه، حمام، غسيل، خدمة) أو فوق ممر/درج لا يُعد. المراجع المستقل r18: C7-1.
//  MASTER_STAIR_DOOR  — (حين يطلب العميل الرئيسية بعيدة عن الدرج) باب الرئيسية يُفتح على الفراغ المفتوح الذي يصل إليه الدرج: الدرج وما
//                       يتصل به بفتحات بلا أبواب (قوس) فراغ واحد للعين والصوت. مسار المشي وحده (السجل: ≥ 6 م) لا يكفي — المراجع r18: C7-1.
export const UPPER_LIMITS = Object.freeze({ wetShare: .25 });
const DRY_SENSITIVE = new Set(['majlis', 'dining', 'entrance', 'living', 'bedroom', 'master']);
export function measureUpper(doc, request = {}, model = analyzeDoc(doc)) {
  const out = [], [G, U] = model.levels; if (!G || !U) return out;
  const push = (id, pass, value, reasons, applicable = true) => out.push({ id, ar: R16_DEFECTS[id].ar, tier: R16_DEFECTS[id].tier, pass: !!pass, applicable, value, reasons_ar: reasons, clientAsked: false, specialist: SPECIALIST_R16.includes(id) });
  // (أ) تراكب الحمامات
  {
    const rows = [], bad = [];
    for (const b of U.rooms.filter(r => r.type === 'bath')) {
      const xs = b.net.map(p => p.x), ys = b.net.map(p => p.y), hit = new Map(); let n = 0, wet = 0;
      for (let x = Math.min(...xs) + .1; x < Math.max(...xs); x += .2) for (let y = Math.min(...ys) + .1; y < Math.max(...ys); y += .2) {
        if (!pointInPolygon({ x, y }, b.net)) continue; n++; const g = G.roomAt({ x, y }); if (!g) continue;
        if (DRY_SENSITIVE.has(g.type) && !/مغاسل|ممر/.test(g.name || '')) hit.set(g.name, (hit.get(g.name) || 0) + 1); else if (['bath', 'kitchen', 'service', 'laundry'].includes(g.type) || /غسيل|خادمة|مخزن/.test(g.name || '')) wet++;
      }
      const over = [...hit].filter(([, v]) => n && v / n >= UPPER_LIMITS.wetShare).map(([k, v]) => ({ over: k, pct: Math.round(100 * v / n) }));
      rows.push({ bath: b.name, overWetPct: n ? Math.round(100 * wet / n) : 0, overDry: over });
      for (const o of over) bad.push(`«${b.name}» فوق «${o.over}» (${o.pct}٪) — يحتاج مراجعة صحية وإنشائية متخصصة (الصرف والعزل المائي وفتحة صيانة)`);
    }
    push('WET_STACK', !bad.length, { baths: rows }, bad, rows.length > 0);
  }
  // (ب) باب الرئيسية والدرج
  {
    const t = String(request.text || '').replace(/[ةه]/g, 'ه');
    const asked = /(?:ماستر|رئيسي)[^،.]{0,40}بعيد[^،.]{0,15}(?:درج|سلم)/.test(t) || (request.rules || []).some(r => r.kind === 'far' && [r.a, r.b].includes('master') && [r.a, r.b].includes('stairs'));
    const M = U.rooms.find(r => r.type === 'master'), stair = U.rooms.find(r => r.type === 'stairs' || /^الدرج/.test(r.name || ''));
    if (!asked || !M || !stair) push('MASTER_STAIR_DOOR', true, null, [], false);
    else {
      // الفراغ المفتوح للدرج: الدرج وكل ما يتصل به بفتحة بلا باب (قوس/فتحة)، تكرارًا
      const openTo = r => U.openings.filter(op => op.sides.some(x => x.room.id === r.id) && !op.window && (op.o?.kind === 'arch' || op.o?.kind === 'opening')).map(op => op.sides.find(x => x.room.id === r.id)).map(me => (me && me.other !== 'outside' ? U.roomsById.get(me.other) : null)).filter(Boolean);
      const cl = new Set([stair.id]), q = [stair]; while (q.length) for (const o of openTo(q.pop())) if (!cl.has(o.id) && ['corridor', 'living', 'entrance', 'stairs'].includes(o.type)) { cl.add(o.id); q.push(o); }
      const doors = roomDoors(U, M).filter(d => d.other && d.other.type !== 'bath' && !/ملابس/.test(d.other.name || ''));
      const onStair = doors.filter(d => cl.has(d.other.id));
      push('MASTER_STAIR_DOOR', !onStair.length, { stairSpace: [...cl].map(id => U.roomsById.get(id)?.name), doorsTo: doors.map(d => d.other.name) }, onStair.length ? [`باب «${M.name}» على «${onStair[0].other.name}» — وهي فراغ واحد مفتوح مع الدرج (${[...cl].map(id => U.roomsById.get(id)?.name).filter(Boolean).join('، ')})`] : [], true);
    }
  }
  return out;
}

// ———————————————————————————— (الجولة السابعة عشرة) الصالة العائلية ————————————————————————————
//  HALL_SMALL   — الصالة العائلية (أكبرها في دور المجلس) أصغر من 0.8 × مساحة مجلس الرجال: أولوية معكوسة لبيت عائلي.
//  HALL_THROUGH — مسارات الحركة الرئيسية التي تعبر الصالة (من مدخل العائلة إلى غرف النوم والمطبخ والطعام والدرج… حين يكون أقصر
//                 طريقها عبر الصالة) مع مناطق فتح أبوابها لا تترك فيها مستطيل جلسة عائلية حرًّا 3.0 × 3.6 م.
//  القيمتان (0.8، و3.0 × 3.6 م: كنبة ثلاثية ومقعدان متقابلان وطاولة وسطى بهوامشها) قيم تصميمية افتراضية للميزان — غير نظامية،
//  ويغلبها طلب العميل نصًّا (صالة صغيرة / صغّر الصالة).
export const R17_LIMITS = Object.freeze({ hallToMajlis: .8, seatW: 3.0, seatL: 3.6, routeW: .9, doorZone: .9, cell: .1 });
const PASS_TYPES = new Set(['entrance', 'corridor', 'living', 'stairs', 'dining']);
const DEST_TYPES = new Set(['bedroom', 'master', 'kitchen', 'dining', 'stairs', 'office', 'service', 'laundry', 'majlis', 'living', 'corridor']);
const isMenSpace = r => isMenMajlis(r) || /الرجال|الضيوف/.test(r.name || '');

/** نقطة الباب داخل الغرفة: مركز الفتحة مزاحًا إلى داخلها بنصف سماكة الجدار و0.45 م. */
function doorIn(op, room, extra = .45) {
  const me = op.sides.find(s => s.room.id === room.id); if (!me) return op.p;
  const t = (op.wall?.t || .2) / 2 + extra; return { x: op.p.x - me.outward.x * t, y: op.p.y - me.outward.y * t };
}
/**
 * مسارات الحركة الرئيسية في دور: أقصر طريق (بمسافة المشي بين الأبواب) من أبواب مدخل العائلة إلى كل فراغ مقصود، عبر فراغات الحركة
 * وحدها (مدخل، ممر، صالة، درج، طعام). يعيد [{ dest, rooms:[...], legs:[{room, a, b}] }] — legs: كل عبور لغرفة من باب إلى باب.
 */
export function mainRoutes(lv) {
  const doorsOf = new Map(lv.rooms.map(r => [r.id, []]));
  for (const op of lv.openings) if (op.door) for (const s of op.sides) doorsOf.get(s.room.id)?.push(op);
  // المصادر: أبواب المدخل العائلي الخارجية (لا مدخل الرجال)، وإلا أبواب الصالة الخارجية، وفي العلوي: الدرج
  const fam = lv.rooms.filter(r => r.type === 'entrance' && !isMenSpace(r));
  let src = [];
  for (const r of fam) for (const op of doorsOf.get(r.id)) if (op.sides.some(s => s.room.id === r.id && s.other === 'outside')) src.push({ op, room: r });
  if (!src.length) for (const r of lv.rooms.filter(x => x.type === 'stairs')) for (const op of doorsOf.get(r.id)) src.push({ op, room: r, virtual: true });
  if (!src.length) for (const r of lv.rooms.filter(isFamilyHall)) for (const op of doorsOf.get(r.id)) if (op.sides.some(s => s.room.id === r.id && s.other === 'outside')) src.push({ op, room: r });
  // ديكسترا على الأبواب: الانتقال من باب إلى باب داخل غرفة حركة بمسافة المشي بينهما
  const dist = new Map(), prev = new Map(), done = new Set();
  for (const s of src) { dist.set(s.op.id, 0); prev.set(s.op.id, null); }
  const byId = new Map(lv.openings.map(o => [o.id, o]));
  for (;;) {
    let u = null, du = Infinity; for (const [k, v] of dist) if (!done.has(k) && v < du) { du = v; u = k; }
    if (u == null) break; done.add(u);
    const op = byId.get(u);
    for (const s of op.sides) {
      const R = s.room; if (!PASS_TYPES.has(R.type) || isMenSpace(R)) continue;
      // لا يُعبر فراغ من الباب الذي دخل منه إلى الخارج (المصدر يدخل المدخل فقط)
      for (const o2 of doorsOf.get(R.id)) {
        if (o2.id === u) continue;
        const a = doorIn(op, R), b = doorIn(o2, R), nd = du + Math.hypot(a.x - b.x, a.y - b.y) + .01;
        if (nd < (dist.get(o2.id) ?? Infinity)) { dist.set(o2.id, nd); prev.set(o2.id, { from: u, room: R }); }
      }
    }
  }
  const routes = [];
  for (const D of lv.rooms) {
    if (!DEST_TYPES.has(D.type) || isMenSpace(D) || (D.type === 'majlis' && !isWomen(D))) continue;
    let best = null; for (const op of doorsOf.get(D.id)) { const d = dist.get(op.id); if (d != null && (!best || d < best.d)) best = { op, d }; }
    if (!best) continue;
    const legs = []; for (let k = best.op.id; prev.get(k); k = prev.get(k).from) { const p = prev.get(k); legs.unshift({ room: p.room, a: byId.get(p.from), b: byId.get(k) }); }
    routes.push({ dest: D, d: best.d, legs });
  }
  return routes;
}
/**
 * هل تتسع الصالة لجلسة عائلية w × l (بأي اتجاه) تبقى معها كل أبواب الصالة متصلة بممر صافٍ ≥ 0.9 م حول الجلسة، دون أن تقع الجلسة
 * في منطقة فتح باب (0.9 م أمامه)؟ — أي: الحركة الرئيسية تلتف حول الجلسة لا تقطعها. يعيد { fits, at, freeArea, doors }.
 */
export function seatingZone(hall, routes, lv, L = R17_LIMITS) {
  const poly = hall.net, xs = poly.map(p => p.x), ys = poly.map(p => p.y), c = .15;
  const x0 = Math.min(...xs), y0 = Math.min(...ys), nx = Math.max(1, Math.floor((Math.max(...xs) - x0) / c + 1e-6)), ny = Math.max(1, Math.floor((Math.max(...ys) - y0) / c + 1e-6));
  const ctr = (i, j) => ({ x: x0 + (i + .5) * c, y: y0 + (j + .5) * c });
  const inside = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) inside[j * nx + i] = pointInPolygon(ctr(i, j), poly, 1e-9) ? 1 : 0;
  const doors = lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === hall.id));
  const zone = op => { const me = op.sides.find(s => s.room.id === hall.id), t = (op.wall?.t || .2) / 2, inn = { x: -me.outward.x, y: -me.outward.y }, u = { x: -inn.y, y: inn.x }, hw = Math.max(op.w, L.doorZone) / 2;
    return [[-hw, t], [hw, t], [hw, t + L.doorZone], [-hw, t + L.doorZone]].map(([q, d]) => ({ x: op.p.x + u.x * q + inn.x * d, y: op.p.y + u.y * q + inn.y * d })); };
  // منطقة فتح الباب للأبواب المفصلية وحدها (القوس والمنزلق لا يدور فيهما مصراع؛ اتصالهما بالممشى يُفحص أدناه)
  const dz = new Uint8Array(nx * ny); for (const op of doors.filter(o => o.kind === 'door' || o.kind === 'door2')) { const z = zone(op); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (pointInPolygon(ctr(i, j), z, 1e-9)) dz[j * nx + i] = 1; }
  const cellOf = p => [Math.max(0, Math.min(nx - 1, Math.floor((p.x - x0) / c))), Math.max(0, Math.min(ny - 1, Math.floor((p.y - y0) / c)))];
  const dcell = doors.map(op => cellOf(doorIn(op, hall, .3)));
  const R = Math.max(1, Math.round(L.routeW / 2 / c)); // نصف عرض الممر بالخلايا
  let free = 0; for (let k = 0; k < nx * ny; k++) free += inside[k];
  const tryAt = (i0, j0, W, H) => {
    // الجلسة لا تقع في منطقة فتح باب
    for (let j = j0; j < j0 + H; j++) for (let i = i0; i < i0 + W; i++) if (!inside[j * nx + i] || dz[j * nx + i]) return false;
    const blockedAt = (i, j) => i < 0 || j < 0 || i >= nx || j >= ny || !inside[j * nx + i] || (i >= i0 && i < i0 + W && j >= j0 && j < j0 + H);
    // الخلية «ممشى» إن خلا مربع نصف قطره R حولها (جسم بعرض 0.9 م يمر فيها)
    const walk = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let ok = !blockedAt(i, j); for (let dj = -R + 1; ok && dj < R; dj++) for (let di = -R + 1; ok && di < R; di++) if (blockedAt(i + di, j + dj)) ok = false; walk[j * nx + i] = ok ? 1 : 0; }
    // كل باب يصل إلى أقرب خلية ممشى (عتبة الباب نفسها تُعد ممشى — الباب أضيق من الممر)
    const near = ([ci, cj]) => { let best = null, bd = Infinity; for (let j = Math.max(0, cj - 4); j <= Math.min(ny - 1, cj + 4); j++) for (let i = Math.max(0, ci - 4); i <= Math.min(nx - 1, ci + 4); i++) if (walk[j * nx + i]) { const d = Math.abs(i - ci) + Math.abs(j - cj); if (d < bd) { bd = d; best = j * nx + i; } } return best; };
    const starts = dcell.map(near); if (starts.some(x => x == null)) return false;
    const seen = new Uint8Array(nx * ny), q = [starts[0]]; seen[starts[0]] = 1;
    while (q.length) { const k = q.pop(), i = k % nx, j = (k - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b2 = j + dj; if (a < 0 || b2 < 0 || a >= nx || b2 >= ny) continue; const kk = b2 * nx + a; if (!seen[kk] && walk[kk]) { seen[kk] = 1; q.push(kk); } } }
    return starts.every(k => seen[k]);
  };
  for (const [w, l] of [[L.seatW, L.seatL], [L.seatL, L.seatW]]) {
    const W = Math.ceil(w / c - 1e-6), H = Math.ceil(l / c - 1e-6); if (W > nx || H > ny) continue;
    for (let j = 0; j + H <= ny; j++) for (let i = 0; i + W <= nx; i++) if (tryAt(i, j, W, H)) return { fits: true, at: { x: r2(x0 + i * c), y: r2(y0 + j * c), w: r2(W * c), l: r2(H * c) }, freeArea: r2(free * c * c), doors: doors.length, routes: routes.length };
  }
  return { fits: false, at: null, freeArea: r2(free * c * c), doors: doors.length, routes: routes.length };
}
/** القياسان على المستند: الصالة العائلية الكبرى في دور مجلس الرجال. */
export function measureHall(doc, request = {}, model = analyzeDoc(doc)) {
  const out = [], text = String(request.text || '');
  const smallAsked = /صال(?:ة|ه)[^،.]{0,12}(?:صغير|ضيق|صغّر|صغر)|(?:صغّر|صغر)[^،.]{0,6}الصال/.test(text);
  const lv = model.levels.find(l => l.rooms.some(isMenMajlis)) || model.levels[0]; if (!lv) return out;
  const hall = lv.rooms.filter(isFamilyHall).sort((a, b) => b.area - a.area)[0] || null;
  const men = lv.rooms.filter(isMenMajlis).sort((a, b) => b.area - a.area)[0] || null;
  const mk = (id, pass, value, reasons, applicable) => ({ id, ar: R16_DEFECTS[id].ar, tier: R16_DEFECTS[id].tier, pass: !!pass, applicable, value, reasons_ar: reasons, clientAsked: smallAsked });
  {
    const ok = !hall || !men || hall.area >= R17_LIMITS.hallToMajlis * men.area - 1e-6;
    out.push(mk('HALL_SMALL', ok, hall && men ? { hall: r2(hall.area), majlis: r2(men.area), ratio: r2(hall.area / men.area) } : null,
      ok ? [] : [`«${hall.name}» ${r2(hall.area)} م² مقابل «${men.name}» ${r2(men.area)} م² (${r2(hall.area / men.area)} من مساحته؛ الحد ${R17_LIMITS.hallToMajlis})`], !!(hall && men)));
  }
  {
    let z = null, routes = [];
    if (hall) { try { routes = mainRoutes(lv); z = seatingZone(hall, routes, lv); } catch { z = null; } }
    const through = routes.filter(r => r.legs.some(g => g.room.id === hall?.id) && r.dest.id !== hall?.id).map(r => r.dest.name);
    const ok = !z || z.fits;
    out.push(mk('HALL_THROUGH', ok, z ? { seat: z.at, doors: z.doors, freeArea: z.freeArea, through: [...new Set(through)] } : null,
      ok ? [] : [`في «${hall.name}» (${r2(hall.rect.w)}×${r2(hall.rect.l)} م، ${z.doors} أبواب) لا موضع لجلسة ${R17_LIMITS.seatW}×${R17_LIMITS.seatL} م يلتف حولها ممر ${R17_LIMITS.routeW} م يصل أبوابها كلها دون أن تقع في منطقة فتح باب — الصالة ممر عابر إلى ${[...new Set(through)].slice(0, 4).map(n => `«${n}»`).join('، ')}`], !!z));
  }
  return out;
}
export default { measureR16, R16_DEFECTS, R16_LIMITS, isPrivateRoom, viewQuad };
