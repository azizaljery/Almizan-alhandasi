// (الجولة الثانية عشرة) بوابات البرنامج السعودي والموقع والمناخ في المراجعة المستقلة (plan-review): تُقاس من المستند المرسوم وطلب
// العميل وحدهما — لا من نية المولّد. لكل بند طبقته:
//  - «شرط العميل» إن طلبه العميل نصًا: بوابة ترسب إن لم يتحقق؛
//  - «قيمة تصميمية افتراضية للميزان» إن لم يطلبه: ملاحظة معلنة (لا رسوب) بالقيمة المقيسة — تغلبها طلبات العميل دائمًا.
// لا رقم نظامي هنا: كل العتبات قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا).
import { ROOM_TYPES } from './draw/catalog.mjs';
import { pointInPolygon, ccw, sub, dot, norm } from './draw/geom.mjs';
import { PARKING_RULE, requiredParking, plotArea } from './site-parking.mjs';
import { briefOf, briefMajlisDoor } from './shared-brief.mjs';

export const MIZAN_DEFAULT_AR = 'قيمة تصميمية افتراضية للميزان';
export const SAUDI_GATES = Object.freeze([
  { id: 'FAMILY_ENTRY_SCREEN', ar: 'مدخل العائلة منكسر أو بحاجز بصري: لا خط رؤية مستقيم من الباب الخارجي إلى الصالة أو الطعام أو الممرات العائلية' },
  { id: 'MAJLIS_LOBBY', ar: 'مجلس الرجال بدهليز: الباب الخارجي لا يفتح على المجلس مباشرة' },
  { id: 'MAJLIS_DINING', ar: 'باب خدمة (مقلط) بين مجلس الرجال والطعام في الدور الواحد، والطعام يُغلق على العائلة بباب' },
  { id: 'DAY_WC', ar: 'دورة مياه يومية تُدخل من الصالة أو بهو المدخل (لا عبر جناح نوم ولا منطقة الضيوف)' },
  { id: 'MAID_BATH', ar: 'غرفة الخادمة بحمامها' },
  { id: 'KITCHEN_SERVICE', ar: 'المطبخ ≥ 14 م² صافيًا وبباب خدمة خارجي غير الواجهة' },
  { id: 'PARKING', ar: 'المواقف المطلوبة نظاميًا (موقف لأرض ≤ 400 م²، وموقفان لما فوقها) مرسومة داخل حدود الأرض خارج المبنى' },
  { id: 'DEEP_PLAN_LIGHT', ar: 'مبنى أعمق من 18 م فيه حوش أو منور داخلي' },
  { id: 'SITE_FIT', ar: 'لا كتلة «شريط ضيق» على أرض عرضها القابل للبناء ≥ 14 م' },
  { id: 'SHADING', ar: 'تظليل النوافذ الخارجية (بروز أفقي أو زعانف) معرَّف في واجهة المستند' },
  // (الجولة الرابعة عشرة) بنود المراجع المستقل r13 — قيم تصميمية افتراضية للميزان (قوية في المولّد: لا يُعرض بديل يخالفها ما أمكن)
  { id: 'BED_BATH', ar: 'لكل غرفة نوم حمام: خاص بها (أو في مدخل جناحها)، أو مشترك يُفتح على الممر نفسه الذي تُفتح عليه' },
  { id: 'SERVE_ROUTE', ar: 'مسار تقديم من المطبخ إلى مجلس الرجال لا يمر بالصالة ولا بممرات العائلة ولا النوم (عبر المقلط أو ممر خدمة)' },
  { id: 'MAJLIS_BED_WALL', ar: 'المجلس لا يشترك في جدار مع غرفة نوم (فاصل خدمي أو دورة مياه أو ممر)' },
  { id: 'MAJLIS_STREET_ENTRY', ar: 'مدخل مجلس الرجال على واجهة الشارع أو قريب منها — لا عبر ارتداد جانبي أضيق من 3 م' },
  { id: 'REAR_YARD', ar: 'حوش خلفي خاص لا يقل عن 6 م متى سمح عمق الأرض (لا يُدفع المبنى إلى الخلف تاركًا فناءً أماميًا ميتًا)' },
  { id: 'PARKING_LAYOUT', ar: 'المواقف عمودية على الشارع بعمق 5.5 م، خارج ممرات المداخل، ولا أمام نافذة أو باب، ولا في تجويف داخل كتلة المبنى' },
]);
/** (الجولة الرابعة عشرة) البنود التي يعاملها المولّد «قيمة افتراضية قوية»: لا يُعرض بديل يخالفها إلا بطلب العميل أو إن لم يتسع غيره (ويُذكر). */
export const STRONG_DEFAULTS = Object.freeze(['MAID_BATH', 'BED_BATH', 'SERVE_ROUTE', 'MAJLIS_BED_WALL', 'MAJLIS_STREET_ENTRY', 'DAY_WC', 'REAR_YARD', 'PARKING_LAYOUT']);
const AR = Object.fromEntries(SAUDI_GATES.map(g => [g.id, g.ar]));
const R14_OFF_SP = new Set(String(globalThis.process?.env?.R14_OFF || '').split(',').filter(Boolean));
const r2 = v => Math.round(v * 100) / 100;
const nAr = t => String(t || '').replace(/[ةه]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');

/** ما طلبه العميل نصًا من بنود البرنامج (فيكون البند بوابة لا ملاحظة). */
export function clientAsks(request = {}) {
  const t = nAr(request.text);
  return {
    FAMILY_ENTRY_SCREEN: /مدخل (?:العائله |عائلي )?منكسر|ساتر|حاجز (?:بصري|نظر)|ما (?:ينكشف|يبين) (?:الداخل|البيت|الصاله)|خصوصيه المدخل/.test(t),
    MAJLIS_LOBBY: /دهليز|مقدمه (?:لل)?مجلس|ممر (?:لل)?مجلس|مدخل (?:لل)?مجلس (?:ب)?(?:دهليز|مقدمه)/.test(t),
    // (01b) الباب بين المجلس والطعام «طلب العميل» فقط بنص صريح (العقد الموحد DIRECT_DOOR) أو تعديل صريح — لا «مقلط» (وظيفة) ولا «جنب» (قرب)
    MAJLIS_DINING: R14_OFF_SP.has('r21maqlat') ? (!!request.majlisDining || /مقلط|مقالط|طعام (?:ال)?ضيوف|سفره (?:ال)?ضيوف|المجلس (?:علي|يفتح علي|متصل ب|جنب|بجانب|بجوار) ?(?:ال)?(?:طعام|سفره)/.test(t)) : (!!request.majlisDining || briefMajlisDoor(briefOf(request))),
    DAY_WC: /دوره مياه (?:يوميه|للصاله|للضيوف|للعائله)|حمام (?:ضيوف|للصاله|يومي)/.test(t),
    MAID_BATH: /(?:خادمه|خدامه|عامله|شغاله)[^،.]{0,20}(?:ب|مع|لها) ?(?:حمام|دوره مياه)/.test(t) && !/(?:خادمه|خدامه|عامله|شغاله)[^،.]{0,20}(?:بدون|بلا|من غير) ?(?:حمام|دوره مياه)/.test(t),
    MAID_NO_BATH: /(?:خادمه|خدامه|عامله|شغاله)[^،.]{0,20}(?:بدون|بلا|من غير) ?(?:حمام|دوره مياه)/.test(t),
    KITCHEN_SERVICE: /باب (?:خلفي|خدمه) (?:لل|في ال)?مطبخ|مطبخ[^،.]{0,15}باب (?:خلفي|خدمه|علي الحوش)/.test(t),
    PARKING: /موقف|مواقف|كراج|قراج|جراج|مظله سيار|سيارات/.test(t),
    SHADING: /تظليل (?:ال)?نوافذ|كاسرات? (?:ال)?شمس|مظلات? (?:علي )?(?:ال)?نوافذ/.test(t),
    NO_MAJLIS_DINING: /مجلس[^،.]{0,20}(?:بعيد|منفصل|مستقل) (?:عن|من) (?:ال)?(?:طعام|سفره)/.test(t),
    BED_BATH: /(?:حمام|دوره مياه) (?:لكل|في كل) غرف|كل غرفه (?:ب|فيها |لها )?(?:حمام|دوره مياه)/.test(t),
    NO_BED_BATH: /(?:بعض |)غرف[^،.]{0,15}(?:بدون|بلا|من غير) (?:حمام|دورات? مياه)/.test(t),
    SERVE_ROUTE: R14_OFF_SP.has('r21maqlat') ? /(?:تقديم|خدمه) (?:لل)?مجلس|باب (?:خدمه|تقديم) (?:لل|علي ال)?مجلس|مقلط/.test(t) : /(?:تقديم|خدمه) (?:لل)?مجلس|باب (?:خدمه|تقديم) (?:لل|علي ال)?مجلس/.test(t), // (01b) مسار التقديم بنص صريح لا من «مقلط»
    MAJLIS_BED_WALL: /المجلس[^،.]{0,20}(?:بعيد|منفصل) (?:عن|من) (?:ال)?(?:غرف|نوم)|عزل (?:المجلس|صوت)/.test(t),
    MAJLIS_STREET_ENTRY: /(?:باب|مدخل) (?:ال)?مجلس[^،.]{0,15}(?:علي|من) (?:ال)?شارع|مجلس (?:رجال )?علي (?:ال)?شارع/.test(t),
    MAJLIS_SIDE_OK: /(?:باب|مدخل) (?:ال)?مجلس[^،.]{0,15}(?:من )?(?:ال)?(?:جنب|جانب|ارتداد)/.test(t),
    REAR_YARD: /حوش (?:خلفي|ورا)|حديقه (?:خلفيه|ورا)/.test(t),
    PARKING_LAYOUT: /موقف[^،.]{0,15}(?:عمودي|قدام|امام)|مواقف[^،.]{0,15}(?:عموديه|قدام|امام)/.test(t),
    PARKING_PARALLEL: /موقف[^،.]{0,15}(?:موازي|طولي)/.test(t),
  };
}

const isMenMajlis = r => r.type === 'majlis' && !/النساء/.test(r.name || '');
const roomDoors = (lv, room) => lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === room.id)).map(op => { const me = op.sides.find(s => s.room.id === room.id); return { op, other: me.other === 'outside' ? null : lv.roomsById.get(me.other) || null, outside: me.other === 'outside' }; });
const familyCirc = r => !!r && ((r.type === 'living' && !/الضيوف/.test(r.name)) || (r.type === 'entrance' && !/الرجال|النساء/.test(r.name)) || (r.type === 'corridor' && /^(?:ممر|ممر الخدمه|ممر الخدمة|رواق)$/.test(r.name)));

/**
 * يقيس البنود العشرة على المستند (model = analyzeDoc(doc)). يعيد [{ id, ar, pass, applicable, clientAsked, value, reasons_ar }].
 * لا يحكم بالرسوب هنا: plan-review يجعل البند بوابة إن طلبه العميل وملاحظة إن كان افتراضيًا.
 */
export function measureSaudiProgram(doc, request = {}, model) {
  const ask = clientAsks(request), G = model.levels[0], out = [];
  const push = (id, pass, value, reasons, applicable = true) => out.push({ id, ar: AR[id], pass: !!pass, applicable, clientAsked: !!ask[id], value, reasons_ar: reasons });
  if (!G) return out;
  const one = model.levels.length === 1;
  // 1) مدخل العائلة: الباب الخارجي والفتحة المقابلة له (بلا باب يُغلق) على جدارين متوازيين وتتراكب مساقطهما
  {
    const bad = [], seen = [];
    for (const e of G.entries) {
      const R = G.roomsById.get(e.room); if (!R || R.type !== 'entrance' || /الرجال|النساء/.test(R.name)) continue;
      const E = G.openings.find(op => op.id === e.via); if (!E) continue;
      const proj = (op, u) => { const c = dot(op.p, u); return [c - op.w / 2, c + op.w / 2]; };
      for (const d of roomDoors(G, R)) {
        if (d.outside || !d.other || d.op === E || d.op.kind !== 'arch') continue;
        const par = Math.abs(dot(d.op.u, E.u)) > .99, depth = Math.abs(dot(sub(d.op.p, E.p), E.n));
        if (!par || depth < .5) continue;
        const a = proj(E, E.u), b = proj(d.op, E.u), ov = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
        seen.push({ room: R.name, to: d.other.name, overlap: r2(ov) });
        if (ov > .1 && ['living', 'dining', 'corridor', 'stairs', 'kitchen', 'bedroom', 'master'].includes(d.other.type)) bad.push(`من باب «${R.name}» الخارجي يُرى «${d.other.name}» مباشرة عبر فتحة بلا باب تقابله (تراكب ${r2(ov)} م)`);
      }
    }
    push('FAMILY_ENTRY_SCREEN', !bad.length, { checked: seen }, bad, G.entries.length > 0);
  }
  // 2) دهليز مجلس الرجال
  {
    const men = G.rooms.filter(isMenMajlis), bad = [];
    for (const m of men) if (roomDoors(G, m).some(d => d.outside)) bad.push(`الباب الخارجي يفتح على «${m.name}» مباشرة (بلا دهليز)`);
    push('MAJLIS_LOBBY', !bad.length, { majlis: men.map(m => m.name) }, bad, men.length > 0);
  }
  // 3) المقلط
  {
    const men = G.rooms.filter(isMenMajlis), din = G.rooms.filter(r => r.type === 'dining');
    const link = men.some(m => roomDoors(G, m).some(d => d.other?.type === 'dining' && ['door', 'door2', 'slider'].includes(d.op.kind)));
    const famOpen = din.filter(dn => roomDoors(G, dn).some(d => d.other && d.other.type !== 'majlis' && d.other.type !== 'kitchen' && d.op.kind === 'arch' && men.some(m => roomDoors(G, m).some(x => x.other?.id === dn.id))));
    const ok = link && !famOpen.length;
    push('MAJLIS_DINING', ok, { link, diningOpenToFamily: famOpen.map(r => r.name) }, ok ? [] : [!link ? 'لا باب بين مجلس الرجال والطعام' : `«${famOpen[0].name}» مفتوح على العائلة بفتحة بلا باب وهو على المجلس`], one && men.length > 0 && din.length > 0 && !ask.NO_MAJLIS_DINING);
  }
  // 4) دورة مياه يومية
  {
    const wcs = G.rooms.filter(r => r.type === 'bath' && roomDoors(G, r).some(d => familyCirc(d.other)));
    push('DAY_WC', wcs.length > 0, { wcs: wcs.map(r => r.name) }, wcs.length ? [] : ['لا دورة مياه تُدخل من الصالة أو بهو المدخل أو ممر عائلي'], true);
  }
  // 5) حمام الخادمة
  {
    const maid = model.levels.flatMap(lv => lv.rooms.filter(r => r.name === 'غرفة الخادمة').map(r => ({ lv, r })));
    const ok = maid.every(({ lv, r }) => roomDoors(lv, r).some(d => d.other?.type === 'bath' && /^حمام الخادمه|^حمام الخادمة/.test(nAr(d.other.name))));
    push('MAID_BATH', ok, { maid: maid.length }, ok ? [] : ['غرفة الخادمة بلا حمام يُفتح منها'], maid.length > 0 && !ask.MAID_NO_BATH);
  }
  // 6) المطبخ ومساحته وباب الخدمة (لا على واجهة الشارع)
  {
    const k = G.rooms.find(r => r.name === 'المطبخ');
    const entrySide = doc.entry || 's', sideOf = op => op.sides.find(s => s.exterior)?.compass;
    const svc = k ? roomDoors(G, k).filter(d => d.outside && sideOf(d.op) !== entrySide) : [];
    const area = k ? r2(k.area) : null, okA = !k || area >= 14 - .05, okD = !k || svc.length > 0;
    push('KITCHEN_SERVICE', okA && okD, { area, serviceDoor: svc.length > 0 }, [...(okA ? [] : [`المطبخ ${area} م² أصغر من 14 م²`]), ...(okD ? [] : ['المطبخ بلا باب خدمة خارجي (غير الواجهة)'])], !!k);
  }
  // 7) مواقف السيارات (مناطق «garage» في الدور الأرضي داخل الأرض خارج المبنى)
  {
    const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id);
    const plot = doc.plot?.polygon?.length >= 3 ? ccw(doc.plot.polygon) : null, bad = [];
    for (const z of bays) {
      if (plot && !z.polygon.every(p => pointInPolygon(p, plot, .05))) bad.push(`«${z.name}» خارج حدود الأرض`);
      if (z.polygon.some(p => G.roomAt(p)) || G.rooms.some(r => pointInPolygon(r.inside, z.polygon, 0))) bad.push(`«${z.name}» يتداخل مع المبنى`);
    }
    // العدد اشتراط نظامي متحقق (المستوى أ): موقف لأرض ≤ 400 م² وموقفان لما فوقها (PARKING_RULE بمصدره)
    const need = plot ? requiredParking(plotArea(plot)) : 1;
    if (bays.length && bays.length < need) bad.push(`${bays.length} موقف مرسوم والمطلوب نظاميًا ${need} لأرض ${need === 2 ? '>' : '≤'} 400 م²`);
    // يُقاس حيث يمثّل المستند مواقف الموقع (مناطق «garage»): المسقط المرسوم يدويًا أو بالمولّد الأول بلا مواقف لا يُحكم عليه بها —
    // والمولّد الثاني يرفض بنفسه البديل الذي لا يتسع فيه العدد المطلوب (buildDesign)
    push('PARKING', !bad.length, { bays: bays.length, required: need, rule: PARKING_RULE.item }, bays.length ? bad : ['المستند لا يمثّل مواقف الموقع (لا مناطق «garage»)؛ لم يُقس العدد النظامي'], bays.length > 0);
    out[out.length - 1].regulation = PARKING_RULE;
  }
  // 8) العمق والإضاءة: مبنى أعمق من 18 م على محور المدخل بلا حوش ولا منور
  {
    const ws = G.walls, xs = ws.flatMap(w => [w.a.x, w.b.x]), ys = ws.flatMap(w => [w.a.y, w.b.y]);
    const axisY = ['s', 'n'].includes(doc.entry || 's'), depth = xs.length ? r2(axisY ? Math.max(...ys) - Math.min(...ys) : Math.max(...xs) - Math.min(...xs)) : 0;
    const court = G.rooms.some(r => r.type === 'courtyard' || /منور|حوش/.test(r.name || '')) || (doc.zones || []).some(z => z.level === G.level.id && /منور/.test(z.name));
    const rec = court || depth <= 18 ? null : lightRecess(G, xs, ys);
    const lit = court || !!rec;
    push('DEEP_PLAN_LIGHT', depth <= 18 || lit, { depth, courtOrLightwell: court, recess: rec }, depth <= 18 || lit ? [] : [`عمق المبنى ${depth} م بلا حوش ولا منور ولا فناء مفتوح بين أجنحته`], depth > 0);
  }
  // 9) ملاءمة الكتلة للأرض: «شريط» (عرض المبنى < 0.6 من العرض القابل للبناء وعمقه > ضعفي عرضه) على أرض عرضها القابل للبناء ≥ 14 م
  {
    const ws = G.walls, xs = ws.flatMap(w => [w.a.x, w.b.x]), ys = ws.flatMap(w => [w.a.y, w.b.y]);
    const axisY = ['s', 'n'].includes(doc.entry || 's'), bw = axisY ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys), bd = axisY ? Math.max(...ys) - Math.min(...ys) : Math.max(...xs) - Math.min(...xs);
    const plot = doc.plot?.polygon || [], sb = doc.plot?.setbacks || {};
    const pw = plot.length ? (axisY ? Math.max(...plot.map(p => p.x)) - Math.min(...plot.map(p => p.x)) - (sb.e || 0) - (sb.w || 0) : Math.max(...plot.map(p => p.y)) - Math.min(...plot.map(p => p.y)) - (sb.n || 0) - (sb.s || 0)) : 0;
    const strip = pw >= 14 && bw < .6 * pw && bd > 2 * bw;
    push('SITE_FIT', !strip, { buildingW: r2(bw), buildingD: r2(bd), buildableW: r2(pw) }, strip ? [`كتلة شريط ${r2(bw)}×${r2(bd)} م على أرض عرضها القابل للبناء ${r2(pw)} م`] : [], pw > 0);
  }
  // 10) التظليل في الواجهة (تعريف المستند الذي يبنيه المجسّم)
  {
    const sh = doc.finish?.facade?.shading;
    push('SHADING', sh !== false, { shading: sh ?? 'default' }, sh === false ? ['التظليل مُلغى في واجهة المستند'] : [], true);
  }
  for (const g of measureR14(doc, request, model, ask)) push(g.id, g.pass, g.value, g.reasons, g.applicable);
  return out;
}

// ------------------------------------------------------------------------------------------ (الجولة الرابعة عشرة)
const BEDS = new Set(['bedroom', 'master']);
/** طول الجدار المشترك بين غرفتين (أنصاف الحواف على الحافة نفسها في تحليل الجدران). */
export function sharedWall(a, b) {
  const ids = new Set(b.edges.map(e => e.edgeId));
  return a.edges.filter(e => ids.has(e.edgeId)).reduce((s, e) => s + e.length, 0);
}
const doorOps = lv => lv.openings.filter(op => op.door);
const nbrs = (lv, room) => roomDoors(lv, room).filter(d => !d.outside && d.other).map(d => d.other);
/** صندوق المبنى (جدران الدور) وصندوق الأرض في الإطار القانوني للمدخل: x عبر الواجهة، y من الشارع إلى الخلف. */
function frameBoxes(doc, G) {
  const e = doc.entry || 's', F = p => (e === 's' ? { x: p.x, y: p.y } : e === 'n' ? { x: -p.x, y: -p.y } : e === 'e' ? { x: p.y, y: -p.x } : { x: -p.y, y: p.x });
  const wp = G.walls.filter(w => (w.kind || 'wall') !== 'fence').flatMap(w => [w.a, w.b]).map(F);
  const pp = (doc.plot?.polygon || []).map(F);
  const box = ps => ({ x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)), y1: Math.max(...ps.map(p => p.y)) });
  return { F, b: wp.length ? box(wp) : null, plot: pp.length >= 3 ? pp : null, pbox: pp.length >= 3 ? box(pp) : null };
}
/** حد المضلع (القانوني) عند x: أدنى y (الأمام) وأعلى y (الخلف). */
function plotYAt(P, x) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a.x - x) * (b.x - x) > 0) continue; if (Math.abs(a.x - b.x) < 1e-9) { lo = Math.min(lo, a.y, b.y); hi = Math.max(hi, a.y, b.y); continue; } const y = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  return [lo, hi];
}
function plotXAt(P, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a.y - y) * (b.y - y) > 0) continue; if (Math.abs(a.y - b.y) < 1e-9) { lo = Math.min(lo, a.x, b.x); hi = Math.max(hi, a.x, b.x); continue; } const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y); lo = Math.min(lo, x); hi = Math.max(hi, x); }
  return [lo, hi];
}
/**
 * البنود الستة الجديدة (BED_BATH, SERVE_ROUTE, MAJLIS_BED_WALL, MAJLIS_STREET_ENTRY, REAR_YARD, PARKING_LAYOUT) مقيسة من المستند.
 * كل العتبات قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا).
 */
export function measureR14(doc, request = {}, model, ask = clientAsks(request)) {
  const out = [], G = model.levels[0]; if (!G) return out;
  const one = model.levels.length === 1, sb = doc.plot?.setbacks || {};
  const push = (id, pass, value, reasons, applicable = true) => out.push({ id, pass, value, reasons, applicable });
  // 1) حمام لكل غرفة نوم: باب حمام في الغرفة، أو في فراغ تُفتح عليه الغرفة (مدخل جناحها أو الممر) وليس غرفة نوم أخرى
  {
    const bad = [], seen = [];
    for (const lv of model.levels) for (const R of lv.rooms.filter(r => BEDS.has(r.type))) {
      const direct = nbrs(lv, R);
      let ok = direct.some(o => o.type === 'bath'), via = ok ? 'خاص' : null;
      if (!ok) for (const V of direct) { if (BEDS.has(V.type) || V.type === 'bath') continue; const b = nbrs(lv, V).find(o => o.type === 'bath'); if (b) { ok = true; via = `«${b.name}» على «${V.name}»`; break; } }
      // مدخل جناح الغرفة نفسها (ممر قصير لا يخدم غيرها) يُفتح على ممر النوم الذي عليه الحمام المشترك
      if (!ok) for (const V of direct.filter(o => /مدخل الجناح/.test(o.name || '') && !nbrs(lv, o).some(x => BEDS.has(x.type) && x.id !== R.id))) { for (const C2 of nbrs(lv, V)) { if (BEDS.has(C2.type) || C2.type === 'bath') continue; const b = nbrs(lv, C2).find(o => o.type === 'bath' && /مشترك|دورة مياه$/.test(o.name || '')); if (b) { ok = true; via = `«${b.name}» على «${C2.name}»`; break; } } if (ok) break; }
      seen.push({ room: R.name, level: lv.level.name || lv.level.id, ok, via });
      if (!ok) bad.push(`«${R.name}» بلا حمام خاص ولا حمام مشترك يُفتح على الممر الذي تُفتح عليه`);
    }
    push('BED_BATH', !bad.length, { rooms: seen }, bad, seen.length > 0 && !ask.NO_BED_BATH);
  }
  // 2) مسار التقديم: من مجلس الرجال إلى المطبخ عبر أبواب، والفراغات الوسيطة طعام أو دهليز الرجال أو مغاسل أو ممر خدمة أو مخزن
  {
    const men = G.rooms.filter(isMenMajlis), kit = G.rooms.find(r => r.type === 'kitchen'), din = G.rooms.some(r => r.type === 'dining');
    const pass = new Set(), okMid = r => r.type === 'dining' || r.type === 'storage' || r.type === 'pantry' || (['corridor', 'entrance'].includes(r.type) && /الرجال|مغاسل|خدم|مقلط|تقديم/.test(r.name || ''));
    let route = null;
    if (men.length && kit) {
      const prev = new Map([[men[0].id, null]]), q = [men[0]];
      while (q.length && !route) { const r = q.shift(); for (const o of nbrs(G, r)) { if (prev.has(o.id)) continue; prev.set(o.id, r.id); if (o.id === kit.id) { route = []; for (let k = o.id; k; k = prev.get(k)) route.unshift(G.roomsById.get(k).name); break; } if (okMid(o)) q.push(o); } }
      void pass;
    }
    push('SERVE_ROUTE', !!route, { route }, route ? [] : ['لا مسار تقديم من المطبخ إلى مجلس الرجال إلا عبر الصالة أو ممرات العائلة'], one && men.length > 0 && !!kit && din && !ask.NO_MAJLIS_DINING);
  }
  // 3) المجلس لا يشترك في جدار مع غرفة نوم
  {
    const bad = [], seen = [];
    for (const lv of model.levels) for (const m of lv.rooms.filter(r => r.type === 'majlis')) for (const b of lv.rooms.filter(r => BEDS.has(r.type))) {
      const L = sharedWall(m, b); if (L > .3) { seen.push({ majlis: m.name, bedroom: b.name, length: r2(L) }); bad.push(`«${m.name}» يشترك في جدار ${r2(L)} م مع «${b.name}»`); }
    }
    push('MAJLIS_BED_WALL', !bad.length, { pairs: seen }, bad, model.levels.some(lv => lv.rooms.some(r => r.type === 'majlis')));
  }
  const fb = frameBoxes(doc, G);
  // 4) مدخل مجلس الرجال: على واجهة شارع، أو على جانب ارتداده ≥ 3 م وقريب من الواجهة (≤ 4 م من خطها الأمامي)
  {
    const streets = new Set([doc.entry || 's', ...(doc.streets || [])]);
    const host = G.rooms.filter(r => isMenMajlis(r) || (/الرجال/.test(r.name || '') && ['corridor', 'entrance'].includes(r.type)));
    const ext = host.flatMap(h => roomDoors(G, h).filter(d => d.outside).map(d => ({ h, op: d.op, side: d.op.sides.find(s => s.exterior)?.compass, out: d.op.sides.find(s => s.exterior)?.outward })));
    const bad = [], seen = [];
    for (const x of ext) {
      if (streets.has(x.side)) { seen.push({ side: x.side, street: true }); continue; }
      // عرض الارتداد أمام الباب: من الباب على اتجاهه إلى حد الأرض
      let gap = null;
      if (fb.plot) { const p = fb.F(x.op.p), o = fb.F({ x: x.out.x, y: x.out.y }); if (Math.abs(o.x) > .7) { const [lo, hi] = plotXAt(fb.plot, p.y); gap = o.x > 0 ? hi - p.x : p.x - lo; } else { const [lo, hi] = plotYAt(fb.plot, p.x); gap = o.y > 0 ? hi - p.y : p.y - lo; } }
      const fromFront = fb.b ? fb.F(x.op.p).y - fb.b.y0 : null;
      seen.push({ side: x.side, street: false, setback: gap === null ? null : r2(gap), fromFront: fromFront === null ? null : r2(fromFront) });
      if (gap !== null && (gap < 3 - .05 || fromFront > 4.05) && !ask.MAJLIS_SIDE_OK) bad.push(`مدخل «${x.h.name}» على جانب ${x.side} عبر ارتداد ${r2(gap)} م${fromFront > 4.05 ? ` وعلى بعد ${r2(fromFront)} م من الواجهة الأمامية` : ''} — يمشي الضيف بمحاذاة جدار البيت`);
    }
    push('MAJLIS_STREET_ENTRY', !bad.length, { doors: seen }, bad, ext.length > 0);
  }
  // 5) الحوش الخلفي ≥ 6 م متى سمح العمق؛ لا فناء أمامي ميت
  if (fb.b && fb.plot) {
    const xs = [fb.b.x0 + .2, (fb.b.x0 + fb.b.x1) / 2, fb.b.x1 - .2];
    const rear = Math.min(...xs.map(x => plotYAt(fb.plot, x)[1] - fb.b.y1)), front = Math.max(...xs.map(x => fb.b.y0 - plotYAt(fb.plot, x)[0]));
    const fNeed = Math.max(sb[doc.entry || 's'] ?? 3, 0);
    // مواقف أمام المبنى (لا بجانبه): يلزمها عمق 5.5 م وهامشاها أمام الواجهة
    const bays = (doc.zones || []).filter(z => z.type === 'garage').map(z => z.polygon.map(fb.F)).map(ps => ({ x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x)), y1: Math.max(...ps.map(p => p.y)) }));
    // الموقف أمام الواجهة يحتاج عمقه وخلوصًا 0.5 م عن نوافذها (وسماكة الجدار): عمق الموقف من حد الأرض + 0.8 م
    const pf = Math.min(...xs.map(x => plotYAt(fb.plot, x)[0])), fr = bays.filter(b => b.x1 > fb.b.x0 + .3 && b.x0 < fb.b.x1 - .3 && b.y1 <= fb.b.y0 + .05);
    const need = Math.max(fNeed, fr.length ? Math.max(...fr.map(b => b.y1 - pf)) + .8 : 0), slack = front - need;
    const ok = rear >= 6 - .05 || slack <= .5;
    push('REAR_YARD', ok, { rear: r2(rear), front: r2(front), frontNeeded: r2(need), slack: r2(slack) }, ok ? [] : [`الحوش الخلفي ${r2(rear)} م والفناء الأمامي ${r2(front)} م (يكفي ${r2(need)} م): المبنى مدفوع إلى الخلف ${r2(Math.min(slack, 6 - rear))} م بلا سبب`], true);
  }
  // 6) المواقف: عمودية بعمق ≥ 5.4 م، لا في تجويف داخل كتلة المبنى، ولا أمام نافذة أو باب (1.2 م أمامها)، ولا على ممر مدخل
  {
    const zs = (doc.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id), bad = [], seen = [];
    const ext = G.openings.filter(op => op.sides.some(s => s.exterior) && (op.door || op.window)).map(op => { const s = op.sides.find(x => x.exterior); return { op, out: s.outward, door: op.door }; });
    for (const z of zs) {
      const ps = z.polygon.map(fb.F), b = { x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)), y1: Math.max(...ps.map(p => p.y)) };
      const w = b.x1 - b.x0, d = b.y1 - b.y0, perp = d >= w, depth = Math.max(w, d);
      // تجويف: المبنى يحيط بالموقف من جانبيه (لا ركن L مفتوح من جانب) — عينات على بعد 0.8 م يمينه ويساره عند منتصف عمقه
      const Fi = q => { const e = doc.entry || 's'; return e === 's' ? q : e === 'n' ? { x: -q.x, y: -q.y } : e === 'e' ? { x: -q.y, y: q.x } : { x: q.y, y: -q.x }; };
      const ym = (Math.max(b.y0, fb.b ? fb.b.y0 : b.y0) + b.y1) / 2, atB = q => !!G.roomAt(Fi(q));
      const niche = !!fb.b && b.y1 > fb.b.y0 + .3 && atB({ x: b.x0 - .8, y: ym }) && atB({ x: b.x1 + .8, y: ym });
      const hits = [];
      for (const e of ext) {
        // الموقف العمودي: لا يسد بابًا (1.8 م أمامه) ولا يلاصق نافذة (0.5 م)؛ الموازي في ارتداد ضحل: لا نافذة في 1.2 م أمامه
        const p = fb.F(e.op.p), o = fb.F({ x: e.out.x, y: e.out.y }), u = { x: -o.y, y: o.x }, hw = e.op.w / 2 + .2, reach = e.door ? 1.8 : perp ? .5 : 1.2;
        const cs = [[-hw, 0], [hw, 0], [hw, reach], [-hw, reach]].map(([s, t]) => ({ x: p.x + u.x * s + o.x * t, y: p.y + u.y * s + o.y * t }));
        const B = { x0: Math.min(...cs.map(c => c.x)), x1: Math.max(...cs.map(c => c.x)), y0: Math.min(...cs.map(c => c.y)), y1: Math.max(...cs.map(c => c.y)) };
        if (B.x0 < b.x1 - .02 && B.x1 > b.x0 + .02 && B.y0 < b.y1 - .02 && B.y1 > b.y0 + .02) hits.push(e.door ? 'باب' : 'نافذة');
      }
      seen.push({ name: z.name, perpendicular: perp, depth: r2(depth), niche: !!niche, blocks: hits });
      const why = [];
      if (!perp && !ask.PARKING_PARALLEL) why.push('موازٍ للشارع');
      if (depth < 5.4) why.push(`عمقه ${r2(depth)} م`);
      if (niche) why.push('في تجويف داخل كتلة المبنى');
      if (hits.length) why.push(`أمام ${[...new Set(hits)].join(' و')}`);
      if (why.length) bad.push(`«${z.name}»: ${why.join('، ')}`);
    }
    push('PARKING_LAYOUT', !bad.length, { bays: seen }, bad, zs.length > 0);
  }
  return out;
}

/**
 * فناء مفتوح داخل غلاف المبنى (حوش خلفي بين جناحين، حديقة في ركن L، شق يتوغل ≥ 4 م): شبكة 0.5 م داخل صندوق الجدران، الخلايا التي
 * لا تقع في غرفة ولا على جدار، مجمّعة؛ يُعدّ مصدر ضوء إن كان ≥ 6 م² ويتسع لمربع 2.4 م ويحده المبنى من جهتين على الأقل.
 */
function lightRecess(G, xs, ys) {
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), st = .5;
  const nx = Math.ceil((x1 - x0) / st), ny = Math.ceil((y1 - y0) / st); if (nx * ny > 40000) return null;
  const open = new Uint8Array(nx * ny);
  const nearWall = p => G.walls.some(w => { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / L2)); return Math.hypot(p.x - w.a.x - t * dx, p.y - w.a.y - t * dy) < (w.t || .2) / 2 + .05; });
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const p = { x: x0 + (i + .5) * st, y: y0 + (j + .5) * st }; if (!G.roomAt(p) && !nearWall(p)) open[i * ny + j] = 1; }
  const seen = new Uint8Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) {
    if (!open[k] || seen[k]) continue;
    const q = [k]; seen[k] = 1; let n = 0, bi0 = Infinity, bi1 = -1, bj0 = Infinity, bj1 = -1; const edge = new Set();
    while (q.length) { const c = q.pop(), i = Math.floor(c / ny), j = c % ny; n++; bi0 = Math.min(bi0, i); bi1 = Math.max(bi1, i); bj0 = Math.min(bj0, j); bj1 = Math.max(bj1, j);
      if (i === 0) edge.add('x0'); if (i === nx - 1) edge.add('x1'); if (j === 0) edge.add('y0'); if (j === ny - 1) edge.add('y1');
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const c2 = a * ny + b; if (open[c2] && !seen[c2]) { seen[c2] = 1; q.push(c2); } } }
    const area = n * st * st, w = (bi1 - bi0 + 1) * st, d = (bj1 - bj0 + 1) * st;
    // مغلق (حوش) أو مفتوح من جهة واحدة (حوش بين جناحين، شق) ≥ 2.4 م؛ وركن L مفتوح من جهتين متجاورتين حديقةً حقيقية ≥ 3.5 م و15 م²
    const ok = edge.size === 0 || (edge.size === 1 && Math.min(w, d) >= 2.4) || (edge.size === 2 && !(edge.has('x0') && edge.has('x1')) && !(edge.has('y0') && edge.has('y1')) && Math.min(w, d) >= 3.5 && area >= 15);
    if (area >= 6 && Math.min(w, d) >= 2.4 && ok) return { area: r2(area), w: r2(w), d: r2(d), open: [...edge] };
  }
  return null;
}

/** ملخص قصير للأدلة: لكل بند تحقق أو لا. */
export function saudiSummary(doc, request = {}, model) {
  return Object.fromEntries(measureSaudiProgram(doc, request, model).filter(g => g.applicable).map(g => [g.id, g.pass]));
}

export default { SAUDI_GATES, measureSaudiProgram, clientAsks, saudiSummary };
