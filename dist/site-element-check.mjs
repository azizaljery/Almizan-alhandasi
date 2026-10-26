// (الجولة 21 — 02c، قرار المالك 2026-10-26 على ساتر الخصوصية C6) فحص «عنصر الموقع» (kind 'fence'): ساتر خارجي قائم بذاته ليس جزءًا من كتلة المبنى.
// يفصل بين: (1) حدود القطعة (يجب أن يقع داخلها كليًا)، (2) خط ارتداد المبنى (لا ينطبق على عنصر الموقع، ويُذكر البعد عنه معلومةً فقط)،
// (3) حركة المركبات (لا يقطع الموقف ولا ممر دخوله إلى حد الأرض ويبقى بينه وبين الموقف هامش)، (4) المداخل (باب خارجي وممر الدخول إلى الشارع)،
// (5) الإضاءة والتهوية (زاوية الحجب أمام النافذة وبعد الساتر عن الجدار لتبقى النافذة قابلة للفتح)، (6) الاشتراط النظامي: لا مصدر موثّق في
// regulations-sa.mjs لارتفاع السور/الساتر المصمت أو موضعه داخل الارتداد أو في فناء المواقف، فيُسجَّل «لم يتم التحقق» عبر regulatory-checks.mjs
// ولا يُعرض الساتر معتمدًا نظاميًا. القيم الرقمية هنا تصميمية افتراضية للميزان (مصرَّح بها)، لا حدود نظامية. ليس اعتمادًا معماريًا ولا إنشائيًا.
import { wallRect } from './draw/review.mjs';
import { pointInPolygon } from './draw/geom.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { unverifiedCheck, REGULATORY_STATUS } from './regulatory-checks.mjs';
import { segmentHit, bayApproach } from './privacy-gate.mjs';
import { windowFootprint, segmentVsWindow, functionOf } from './window-opening.mjs';

export const SITE_DEFAULTS = Object.freeze({
  bayClear: 0.5,        // أدنى هامش بين الساتر وحد الموقف (تصميمي؛ فتح باب السيارة غير متحقق)
  entryHalfWidth: 0.9,  // نصف عرض ممر دخول الأشخاص أمام الباب الرئيسي
  doorClear: 1.0,       // مقدمة أي باب خارجي
  minWindowOffset: 0.6, // أدنى بعد عن الجدار ليبقى مجال فتح النافذة
  source: 'قيم تصميمية افتراضية للميزان — غير نظامية وغير متحققة من اشتراطات البلدية',
});
const r3 = v => Math.round(v * 1000) / 1000;
const OUT = { s: { x: 0, y: -1 }, n: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }
function segSeg(a, b, c, d) { return segmentHit(a, b, c, d) ? 0 : Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b)); }
function segPoly(a, b, poly) { let m = Infinity; for (let i = 0; i < poly.length; i++) m = Math.min(m, segSeg(a, b, poly[i], poly[(i + 1) % poly.length])); return pointInPolygon(a, poly, 0) || pointInPolygon(b, poly, 0) ? 0 : m; }
function distToBoundary(p, poly) { let m = Infinity; for (let i = 0; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i], poly[(i + 1) % poly.length])); return m; }

function rayToPlot(doc, from, dir) {
  const plot = doc.plot.polygon, far = { x: from.x + dir.x * 200, y: from.y + dir.y * 200 }; let best = null;
  for (let i = 0; i < plot.length; i++) { const h = segmentHit(from, far, plot[i], plot[(i + 1) % plot.length]); if (h && (!best || h.t > best.t)) best = h; }
  return best ? { x: best.x, y: best.y } : far;
}

/**
 * يقيس كل «سور» في المستند. لا يعدّل المستند. يعيد { fences:[...], regulatory:[...], pendingRegulatory, geometryOk, failures_ar[] }.
 * كل فحص: { id, pass, measured, limit, unit, basis, status } حيث status 'measured' (قيمة تصميمية افتراضية) أو 'unverified' (لا مصدر).
 */
export function siteElementReport(doc, { levelId } = {}) {
  const fences = (doc.walls || []).filter(w => w.kind === 'fence' && (!levelId || w.level === levelId));
  const out = { fences: [], regulatory: [], pendingRegulatory: false, geometryOk: true, failures_ar: [], defaults: SITE_DEFAULTS };
  if (!fences.length) return out;
  const plot = doc.plot?.polygon?.length >= 3 ? doc.plot.polygon : null, model = analyzeDoc(doc);
  for (const f of fences) {
    const rect = wallRect(f), checks = [], put = (id, pass, measured, limit, unit, basis, status = 'measured') => { checks.push({ id, pass, measured, limit, unit, basis, status }); if (!pass) { out.geometryOk = false; out.failures_ar.push(`الساتر ${f.id}: ${basis}`); } };
    // 1) حدود القطعة (لا خط الارتداد)
    if (plot) {
      const inside = rect.every(p => pointInPolygon(p, plot, 1e-9));
      const edge = Math.min(...[f.a, f.b].map(p => distToBoundary(p, plot)));
      put('PLOT_BOUNDARY', inside, r3(edge), 0, 'm', inside ? `داخل حدود القطعة (أقرب طرف يبعد ${r3(edge)} م عن الحد)` : 'يخرج عن حدود القطعة');
    } else put('PLOT_BOUNDARY', true, null, null, 'm', 'لا مضلع أرض في المستند — غير متحقق', 'unverified');
    // 2) خط ارتداد المبنى: لا ينطبق على عنصر الموقع؛ المسافة للمعلومة
    const sb = doc.plot?.setbacks;
    checks.push({ id: 'BUILDING_SETBACK_LINE', pass: true, applicable: false, measured: null, limit: null, unit: 'm', status: 'not-applicable', basis: `عنصر موقع لا كتلة مبنى: لا يُقاس بخط ارتداد المبنى${sb ? ' (ارتدادات المستند ' + JSON.stringify(sb) + ')' : ''}؛ وإباحته داخل الارتداد نظاميًا غير متحققة (انظر الاشتراط النظامي)` });
    // 3) المركبات: الموقف + ممر دخوله
    const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === f.level);
    let worstBay = Infinity, worstAp = Infinity;
    for (const z of bays) {
      worstBay = Math.min(worstBay, segPoly(f.a, f.b, z.polygon));
      const ap = bayApproach(doc, z.polygon); if (ap) worstAp = Math.min(worstAp, segPoly(f.a, f.b, ap.polygon));
    }
    if (bays.length) {
      put('BAY_CLEARANCE', worstBay >= SITE_DEFAULTS.bayClear, r3(worstBay), SITE_DEFAULTS.bayClear, 'm', worstBay >= SITE_DEFAULTS.bayClear ? `الهامش بين الساتر وأقرب موقف ${r3(worstBay)} م` : `الساتر يبعد ${r3(worstBay)} م فقط عن الموقف (الحد التصميمي ${SITE_DEFAULTS.bayClear} م)`);
      put('BAY_APPROACH', worstAp > 0, r3(worstAp), 0, 'm', worstAp > 0 ? 'لا يقطع ممر دخول الموقف إلى حد الأرض' : 'يقطع ممر دخول الموقف إلى الشارع');
      checks.push({ id: 'CAR_DOOR_OPENING', pass: null, measured: r3(worstBay), limit: null, unit: 'm', status: 'unverified', basis: 'كفاية الهامش لفتح أبواب السيارة وسعة الانعطاف: غير متحقق (لا مصدر)' });
    }
    // 4) المداخل: أبواب خارجية + ممر الدخول الرئيسي إلى الشارع
    const lv = model.levels.find(l => l.level.id === f.level), ext = (lv?.openings || []).filter(o => o.door && o.sides.some(s => s.other === 'outside'));
    let worstDoor = Infinity, worstPath = Infinity;
    for (const o of ext) {
      const s = o.sides.find(x => x.other === 'outside'), ap = { x: o.p.x + s.outward.x * ((o.wall?.t || .2) / 2 + .5), y: o.p.y + s.outward.y * ((o.wall?.t || .2) / 2 + .5) };
      worstDoor = Math.min(worstDoor, segDist(ap, f.a, f.b));
      if (plot && o.o?.entry) { const dir = OUT[doc.entry || 's'] || s.outward, end = rayToPlot(doc, ap, dir); worstPath = Math.min(worstPath, segSeg(ap, end, f.a, f.b)); }
    }
    if (ext.length) put('DOOR_FRONT', worstDoor >= SITE_DEFAULTS.doorClear, r3(worstDoor), SITE_DEFAULTS.doorClear, 'm', worstDoor >= SITE_DEFAULTS.doorClear ? `أقرب باب خارجي يبعد ${r3(worstDoor)} م` : `الساتر يبعد ${r3(worstDoor)} م فقط عن باب خارجي`);
    if (Number.isFinite(worstPath)) put('ENTRY_PATH', worstPath >= SITE_DEFAULTS.entryHalfWidth, r3(worstPath), SITE_DEFAULTS.entryHalfWidth, 'm', worstPath >= SITE_DEFAULTS.entryHalfWidth ? `يبعد ${r3(worstPath)} م عن مسار الدخول من الباب الرئيسي إلى الشارع` : `يعترض مسار الدخول الرئيسي (${r3(worstPath)} م)`);
    // 5) النوافذ المجاورة: خلوص الساتر من وجه كل نافذة خارجية بلا استثناء، وهندسة فتحها (أسوأ حالة حين لا يحدد المستند التشغيل) وغلاف ضلفتها،
    //    ووظيفتها (إضاءة/تهوية/سلامة) وزاوية الحجب. لا استثناء عامًا للممرات: يُمنح استثناء الخلوص فقط بإثبات الأبعاد الثلاثة (غير ممكن للسلامة).
    const wins = [];
    for (const o of (lv?.openings || []).filter(o => o.window && o.sides.some(s => s.other === 'outside'))) {
      const s = o.sides.find(x => x.other === 'outside'), fp = windowFootprint(o, s), sv = segmentVsWindow(fp, f.a, f.b), d = sv.clearance;
      if (d > 3) continue;
      const fn = functionOf(o, s, lv), sill = o.o?.sill ?? 0, head = sill + (o.o?.h ?? 1.2), mid = (sill + head) / 2, ang = Math.atan2(Math.max(0, (f.h ?? 0) - mid), Math.max(d, 1e-6)) * 180 / Math.PI;
      wins.push({ opening: o.id, room: s.room.name, clearance: d, swingConflict: sv.swingConflict, operation: fp.operation, function: fn, obstructionAngleDeg: Math.round(ang * 10) / 10, sill, head });
      put('WINDOW_CLEARANCE:' + o.id, fn.exemptFromClearance || d >= SITE_DEFAULTS.minWindowOffset, r3(d), SITE_DEFAULTS.minWindowOffset, 'm', d >= SITE_DEFAULTS.minWindowOffset ? `نافذة «${s.room.name}» تبعد عن الساتر ${r3(d)} م` : `نافذة «${s.room.name}» لا يبقى أمامها الخلوص التصميمي (${r3(d)} م < ${SITE_DEFAULTS.minWindowOffset})؛ وظيفتها: إضاءة ${fn.light}، تهوية ${fn.ventilation}، سلامة ${fn.safety} (غير متحققة فلا استثناء)`);
      put('WINDOW_SWING:' + o.id, !sv.swingConflict, sv.swingConflict ? 0 : r3(d), 0, 'm', sv.swingConflict ? `الساتر يدخل غلاف ضلفة نافذة «${s.room.name}» أثناء الفتح (${fp.assumption})` : `الساتر خارج غلاف دوران ضلفة نافذة «${s.room.name}» (${fp.assumption})`);
      checks.push({ id: 'DAYLIGHT_OBSTRUCTION:' + o.id, pass: null, measured: Math.round(ang * 10) / 10, limit: null, unit: 'deg', status: 'unverified', basis: `زاوية حجب الساتر لنافذة «${s.room.name}» ${Math.round(ang * 10) / 10}° من منتصف النافذة — النافذة نفسها لم تتغير مساحتها ولا موضعها؛ حد زاوية الحجب المقبول غير متحقق (لا مصدر)` });
    }
    out.fences.push({ id: f.id, height: f.h ?? null, a: f.a, b: f.b, length: r3(Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y)), checks, windows: wins });
  }
  // 6) الاشتراط النظامي: غير متحقق (لا مصدر في regulations-sa.mjs)
  const h = Math.max(...fences.map(f => f.h ?? 0));
  out.regulatory = [
    unverifiedCheck({ rule: 'ارتفاع الساتر/السور المصمت وإباحته داخل الارتداد أو فناء المواقف', measuredLabel: 'ارتفاع الساتر المرسوم', measuredValue: h, unit: 'm', verificationNote: 'لا يوجد في مصادر الميزان (regulations-sa.mjs) اشتراط موثّق لارتفاع الأسوار/السواتر المصمتة أو لإباحتها داخل الارتداد؛ يُتحقق من اشتراطات البلدية والموقع ونوع العنصر وارتفاعه.' }),
    unverifiedCheck({ rule: 'نوع الساتر (مصمت قائم بذاته) وأثره على الجار والشارع والرؤية المرورية', measuredLabel: 'عدد السواتر', measuredValue: fences.length, unit: '', verificationNote: 'غير متحقق: يحتاج مراجعة جهة مرخّصة/البلدية.' }),
  ];
  out.pendingRegulatory = out.regulatory.some(c => c.status === REGULATORY_STATUS.UNVERIFIED);
  return out;
}
export default { siteElementReport, SITE_DEFAULTS };
