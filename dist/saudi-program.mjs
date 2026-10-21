// (الجولة الثانية عشرة) بوابات البرنامج السعودي والموقع والمناخ في المراجعة المستقلة (plan-review): تُقاس من المستند المرسوم وطلب
// العميل وحدهما — لا من نية المولّد. لكل بند طبقته:
//  - «شرط العميل» إن طلبه العميل نصًا: بوابة ترسب إن لم يتحقق؛
//  - «قيمة تصميمية افتراضية للميزان» إن لم يطلبه: ملاحظة معلنة (لا رسوب) بالقيمة المقيسة — تغلبها طلبات العميل دائمًا.
// لا رقم نظامي هنا: كل العتبات قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا).
import { ROOM_TYPES } from './draw/catalog.mjs';
import { pointInPolygon, ccw, sub, dot, norm } from './draw/geom.mjs';

export const MIZAN_DEFAULT_AR = 'قيمة تصميمية افتراضية للميزان';
export const SAUDI_GATES = Object.freeze([
  { id: 'FAMILY_ENTRY_SCREEN', ar: 'مدخل العائلة منكسر أو بحاجز بصري: لا خط رؤية مستقيم من الباب الخارجي إلى الصالة أو الطعام أو الممرات العائلية' },
  { id: 'MAJLIS_LOBBY', ar: 'مجلس الرجال بدهليز: الباب الخارجي لا يفتح على المجلس مباشرة' },
  { id: 'MAJLIS_DINING', ar: 'باب خدمة (مقلط) بين مجلس الرجال والطعام في الدور الواحد، والطعام يُغلق على العائلة بباب' },
  { id: 'DAY_WC', ar: 'دورة مياه يومية تُدخل من الصالة أو بهو المدخل (لا عبر جناح نوم ولا منطقة الضيوف)' },
  { id: 'MAID_BATH', ar: 'غرفة الخادمة بحمامها' },
  { id: 'KITCHEN_SERVICE', ar: 'المطبخ ≥ 14 م² صافيًا وبباب خدمة خارجي غير الواجهة' },
  { id: 'PARKING', ar: 'موقف سيارة أو موقفان مرسومان داخل حدود الأرض خارج المبنى' },
  { id: 'DEEP_PLAN_LIGHT', ar: 'مبنى أعمق من 18 م فيه حوش أو منور داخلي' },
  { id: 'SITE_FIT', ar: 'لا كتلة «شريط ضيق» على أرض عرضها القابل للبناء ≥ 14 م' },
  { id: 'SHADING', ar: 'تظليل النوافذ الخارجية (بروز أفقي أو زعانف) معرَّف في واجهة المستند' },
]);
const AR = Object.fromEntries(SAUDI_GATES.map(g => [g.id, g.ar]));
const r2 = v => Math.round(v * 100) / 100;
const nAr = t => String(t || '').replace(/[ةه]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');

/** ما طلبه العميل نصًا من بنود البرنامج (فيكون البند بوابة لا ملاحظة). */
export function clientAsks(request = {}) {
  const t = nAr(request.text);
  return {
    FAMILY_ENTRY_SCREEN: /مدخل (?:العائله |عائلي )?منكسر|ساتر|حاجز (?:بصري|نظر)|ما (?:ينكشف|يبين) (?:الداخل|البيت|الصاله)|خصوصيه المدخل/.test(t),
    MAJLIS_LOBBY: /دهليز|مقدمه (?:لل)?مجلس|ممر (?:لل)?مجلس|مدخل (?:لل)?مجلس (?:ب)?(?:دهليز|مقدمه)/.test(t),
    MAJLIS_DINING: !!request.majlisDining || /مقلط|مقالط|طعام (?:ال)?ضيوف|سفره (?:ال)?ضيوف|المجلس (?:علي|يفتح علي|متصل ب|جنب|بجانب|بجوار) ?(?:ال)?(?:طعام|سفره)/.test(t),
    DAY_WC: /دوره مياه (?:يوميه|للصاله|للضيوف|للعائله)|حمام (?:ضيوف|للصاله|يومي)/.test(t),
    MAID_BATH: /(?:خادمه|خدامه|عامله|شغاله)[^،.]{0,20}(?:ب|مع|لها) ?(?:حمام|دوره مياه)/.test(t) && !/(?:خادمه|خدامه|عامله|شغاله)[^،.]{0,20}(?:بدون|بلا|من غير) ?(?:حمام|دوره مياه)/.test(t),
    MAID_NO_BATH: /(?:خادمه|خدامه|عامله|شغاله)[^،.]{0,20}(?:بدون|بلا|من غير) ?(?:حمام|دوره مياه)/.test(t),
    KITCHEN_SERVICE: /باب (?:خلفي|خدمه) (?:لل|في ال)?مطبخ|مطبخ[^،.]{0,15}باب (?:خلفي|خدمه|علي الحوش)/.test(t),
    PARKING: /موقف|مواقف|كراج|قراج|جراج|مظله سيار|سيارات/.test(t),
    NO_MAJLIS_DINING: /مجلس[^،.]{0,20}(?:بعيد|منفصل|مستقل) (?:عن|من) (?:ال)?(?:طعام|سفره)/.test(t),
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
    push('PARKING', bays.length >= 1 && !bad.length, { bays: bays.length }, bays.length ? bad : ['لا موقف سيارة مرسوم'], true);
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
