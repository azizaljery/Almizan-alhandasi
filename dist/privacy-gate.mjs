// (الجولة 21 — 02c، قرار المالك 2026-10-26 «لا نحل المقاسات على حساب الخصوصية») فحص خطوط الرؤية لنافذة تطل على المواقف، وبوابة
// «لا تراجع» قبل/بعد أي تعديل يحرّك النوافذ. مكيَّف من حزمة المالك docs/owner/kit-r21-02b-01/src/privacy-gate.mjs (segmentHit،
// screenWindowPrivacy، compareAcceptance) على مستند المشروع: النقاط من مضلعات المواقف الفعلية (أركانها ومنتصفات أضلاعها ومركزها)،
// ومن داخل الغرفة (أعماق وانحرافات أمام النافذة داخل وجوهها الداخلية)، والحواجب من جدران «سور» المرسومة بارتفاعها، وجدران المبنى تحجب.
// حدود صريحة: فحص ثنائي الأبعاد محافظ بمستوى عين واحد؛ لا يحسب التضاريس ولا منسوب الوقوف ولا الزوايا ثلاثية الأبعاد ولا الإضاءة ولا
// التهوية — تلك تُفحص بفاحصات المشروع الأصلية (acceptanceSnapshot أدناه يجمعها)، ولا يُعد أي منها اعتمادًا معماريًا أو إنشائيًا.
// لا عتبة مسافة عامة هنا (لا «1.64 م»): الحكم بخطوط الرؤية الحقيقية.
import { analyzeDoc } from './draw/digest.mjs';
import { pointInPolygon } from './draw/geom.mjs';
import { measureR16 } from './privacy-defects.mjs';
import { reviewDoc } from './draw/review.mjs';

/** قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا): مستوى العين، وارتفاع الساتر، وأبعاده عن الجدار. */
export const SCREEN_DEFAULTS = Object.freeze({ eyeHeight: 1.6, eyes: { outside: [1.2, 1.6], inside: [1.1, 1.6] }, screenHeight: 1.8, offsets: [0.9, 1.2, 0.75, 1.5], margin: 0.15, maxLength: 7, wallClear: 0.3, doorClear: 1.0, windowClear: 0.6, bayClear: 0.5, source: 'قيمة تصميمية افتراضية للميزان (ساتر خصوصية خارجي ارتفاعه 1.8 م > مستوى العين 1.6 م) — غير متحققة نظاميًا' });

export function segmentHit(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u, x: a.x + t * rx, y: a.y + t * ry } : null;
}
/**
 * خطوط الرؤية من كل نقطة خارجية إلى كل نقطة داخلية تعبر قطعة النافذة؛ مكشوفة ما لم يحجبها ساتر أعلى من مستوى العين قبل النافذة،
 * أو جدار مبنى (blockers) قبلها، أو كانت جلسة النافذة فوق مستوى العين.
 */
export function screenWindowPrivacy({ window, parkingPoints, interiorPoints, opaqueScreens = [], blockers = [], eyeHeight = SCREEN_DEFAULTS.eyeHeight, eyes = null }) {
  if (!window || !Array.isArray(parkingPoints) || !Array.isArray(interiorPoints)) throw Error('Missing geometry');
  const exposed = [];
  // (قرار المالك 2026-10-26) ارتفاعات العين: إن مُرّر eyes = { outside:[...], inside:[...] } فكل خط رؤية يُقاس بارتفاع عين الخارج (سائق جالس/واقف)
  // وعين الداخل (جالس/واقف): ارتفاعه عند النافذة بالاستيفاء الخطي بين العينين، ويُكشف فقط إن وقع بين جلسة النافذة ورأسها؛ ويحجبه الساتر إن كان
  // ارتفاعه ≥ ارتفاع الخط عند عبوره. بغير eyes يبقى السلوك القديم بمستوى عين واحد.
  const pairs = eyes ? eyes.outside.flatMap(o => eyes.inside.map(i => [o, i])) : [[eyeHeight, eyeHeight]];
  const aboveEyeLegacy = !eyes && (eyeHeight < window.sillHeight || eyeHeight > window.headHeight);
  const seen = new Set();
  for (const outside of parkingPoints) for (const inside of interiorPoints) {
    const hit = segmentHit(outside, inside, window.a, window.b);
    if (!hit || aboveEyeLegacy) continue;
    for (const [z0, z1] of pairs) {
      const zAt = t => z0 + (z1 - z0) * t;
      if (eyes && (zAt(hit.t) < window.sillHeight || zAt(hit.t) > window.headHeight)) continue;
      const screened = opaqueScreens.some(s => { const h = segmentHit(outside, inside, s.a, s.b); return h && h.t < hit.t && (s.height ?? 0) >= (eyes ? zAt(h.t) : eyeHeight); })
        || blockers.some(s => { const h = segmentHit(outside, inside, s.a, s.b); return h && h.t < hit.t - 1e-6; });
      if (!screened) { const k = `${outside.x},${outside.y},${inside.x},${inside.y}`; if (!seen.has(k)) { seen.add(k); exposed.push({ outside, inside, windowHit: { x: hit.x, y: hit.y }, eyes: eyes ? [z0, z1] : [eyeHeight, eyeHeight], zAtWindow: Math.round(zAt(hit.t) * 100) / 100 }); } }
    }
  }
  return { potentialExposure: exposed.length > 0, paths: exposed, samples: parkingPoints.length * interiorPoints.length * pairs.length, eyes: eyes || { outside: [eyeHeight], inside: [eyeHeight] }, limitations: 'فحص خطوط رؤية بارتفاعات عين محدودة؛ الإضاءة والتهوية والسلامة والزوايا ثلاثية الأبعاد الكاملة تُفحص منفصلة' };
}

const centroidOf = poly => poly.reduce((a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }), { x: 0, y: 0 });
/** نقاط عينة لمضلع موقف: الأركان ومنتصفات الأضلاع والمركز. */
export function bayPoints(poly) {
  const mids = poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; });
  return [...poly.map(p => ({ x: p.x, y: p.y })), ...mids, centroidOf(poly)];
}
/** نقاط داخل الغرفة أمام النافذة: أعماق 0.6 و1.5 و3 م وانحرافات 0 و±1 و±2 م، داخل وجوهها الداخلية فقط. */
export function interiorPoints(room, op, inward) {
  const u = { x: -inward.y, y: inward.x }, out = [];
  for (const d of [0.6, 1.5, 3]) for (const s of [0, -1, 1, -2, 2]) {
    const p = { x: op.p.x + inward.x * (d + (op.wall?.t || .2) / 2) + u.x * s, y: op.p.y + inward.y * (d + (op.wall?.t || .2) / 2) + u.y * s };
    if (room.net && pointInPolygon(p, room.net, 1e-6)) out.push(p);
  }
  return out;
}
/** هندسة فحص نافذة على المستند: قطعة النافذة على محور جدارها، والحواجب (أسوار مرسومة)، وجدران المبنى الأخرى. */
export function windowGeometry(doc, lv, op) {
  const u = op.u, hw = op.w / 2, sill = op.o?.sill ?? 0, head = sill + (op.o?.h ?? op.h ?? 1.2);
  const win = { a: { x: op.p.x - u.x * hw, y: op.p.y - u.y * hw }, b: { x: op.p.x + u.x * hw, y: op.p.y + u.y * hw }, sillHeight: sill, headHeight: head };
  const walls = (doc.walls || []).filter(w => w.level === lv.level.id);
  const opaqueScreens = walls.filter(w => w.kind === 'fence').map(w => ({ a: w.a, b: w.b, height: w.h ?? 0 }));
  const blockers = walls.filter(w => (w.kind || 'wall') === 'wall' && w.id !== op.wall.id).map(w => ({ a: w.a, b: w.b }));
  return { window: win, opaqueScreens, blockers };
}
/** فحص نافذة غرفة واحدة مقابل كل المواقف بعينات متعددة. */
export function windowExposure(doc, lv, op, side, bays) {
  const g = windowGeometry(doc, lv, op), inward = { x: -side.outward.x, y: -side.outward.y };
  return screenWindowPrivacy({ ...g, eyes: SCREEN_DEFAULTS.eyes, parkingPoints: bays.flatMap(z => bayPoints(z.polygon)), interiorPoints: interiorPoints(side.room, op, inward) });
}

/**
 * صورة القبول قبل/بعد (فاحصات المشروع الأصلية، لا فاحص جديد): لكل فحص { passed, category }.
 *  privacy: كل عيوب الخصوصية في privacy-defects.mjs (measureR16) المنطبقة؛ daylight: لكل غرفة مأهولة نافذة على الخارج أو حوش، وتقرير
 *  المراجعة NO_WINDOW؛ ventilation: لكل غرفة مأهولة نافذة تُفتح على الخارج، ودورات المياه بنوافذها (BATH_NO_WINDOW)؛ circulation: الوصول
 *  (UNREACHABLE_ROOM) ومقدمة كل باب خارجي خالية من الأسوار (1.0 م).
 */
export const requiresLightOrAir = r => HABITABLE.has(r?.type) || /bath|wc|toilet/i.test(r?.type || '');
const HABITABLE = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen']);
export function acceptanceSnapshot(doc, request = {}, model = analyzeDoc(doc)) {
  const checks = {};
  const put = (cat, id, passed, why = '') => { checks[`${cat}:${id}`] = { category: cat, passed: !!passed, why }; };
  try { for (const g of measureR16(doc, request, model)) if (g.applicable && !g.clientAsked) put(g.id === 'BATH_NO_WINDOW' ? 'ventilation' : g.tier === 'note' ? 'note' : 'privacy', g.id, g.pass, (g.reasons_ar || [])[0] || ''); } catch { /* */ }
  for (const lv of model.levels) {
    const fences = (doc.walls || []).filter(w => w.level === lv.level.id && w.kind === 'fence');
    for (const r of lv.rooms) {
      if (!HABITABLE.has(r.type)) continue;
      const wins = lv.openings.filter(op => op.window && op.sides.some(s => s.room.id === r.id && (s.other === 'outside' || lv.roomsById.get(s.other)?.type === 'courtyard')));
      put('daylight', r.name, wins.length > 0, wins.length ? '' : `«${r.name}» بلا نافذة على الخارج`);
      put('ventilation', r.name, wins.some(op => op.kind !== 'fixed'), '');
    }
    for (const op of lv.openings.filter(o => o.door && o.sides.some(s => s.other === 'outside'))) {
      const s = op.sides.find(x => x.other === 'outside'), ap = { x: op.p.x + s.outward.x * ((op.wall?.t || .2) / 2 + .5), y: op.p.y + s.outward.y * ((op.wall?.t || .2) / 2 + .5) };
      const near = fences.some(w => segDist(ap, w.a, w.b) < SCREEN_DEFAULTS.doorClear);
      put('circulation', 'door:' + op.id, !near, near ? 'سور قرب باب خارجي' : '');
    }
  }
  try { const rv = reviewDoc(doc); put('circulation', 'reach', !rv.some(i => i.code === 'UNREACHABLE_ROOM')); put('daylight', 'review', !rv.some(i => i.code === 'NO_WINDOW')); } catch { /* */ }
  return { checks };
}
/** (الحزمة) لا تراجع: الإلزامي يجب أن ينجح بعد التعديل، وكل فحص محمي (بفئته أو معرفه) نجح قبله يجب أن ينجح بعده. */
export function compareAcceptance(before, after, { mandatory = [], protect = [] } = {}) {
  const violations = [], prot = new Set(protect);
  for (const rule of mandatory) if (!after?.checks?.[rule]?.passed) violations.push({ rule, type: 'mandatory' });
  for (const [rule, b] of Object.entries(before?.checks || {})) {
    if (!(prot.has(rule) || prot.has(b.category))) continue;
    if (b.passed && after?.checks?.[rule] && !after.checks[rule].passed) violations.push({ rule, type: 'regression', why: after.checks[rule].why || '' });
  }
  return { pass: violations.length === 0, violations };
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function segPolyDist(a, b, poly) { if (pointInPolygon(a, poly, 0) || pointInPolygon(b, poly, 0)) return 0; let m = Infinity; for (let i = 0; i < poly.length; i++) m = Math.min(m, segSegDist(a, b, poly[i], poly[(i + 1) % poly.length])); return m; }
export function bayApproach(doc, poly) {
  const plot = doc.plot?.polygon; if (!plot || plot.length < 3) return null;
  const bb = q => ({ x0: Math.min(...q.map(p => p.x)), x1: Math.max(...q.map(p => p.x)), y0: Math.min(...q.map(p => p.y)), y1: Math.max(...q.map(p => p.y)) }), B = bb(poly), P = bb(plot);
  const streets = (doc.streets?.length ? doc.streets : [doc.entry || 's']), gap = { s: B.y0 - P.y0, n: P.y1 - B.y1, e: P.x1 - B.x1, w: B.x0 - P.x0 };
  const side = streets.filter(k => k in gap).sort((p, q) => gap[p] - gap[q])[0] || 's', E = { ...B };
  if (side === 's') E.y0 = P.y0; else if (side === 'n') E.y1 = P.y1; else if (side === 'e') E.x1 = P.x1; else E.x0 = P.x0;
  return { side, polygon: [{ x: E.x0, y: E.y0 }, { x: E.x1, y: E.y0 }, { x: E.x1, y: E.y1 }, { x: E.x0, y: E.y1 }] };
}
function segSegDist(a, b, c, d) {
  if (segmentHit(a, b, c, d)) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}
/**
 * ساتر خصوصية خارجي لنافذة مكشوفة على المواقف (سور قائم بذاته موازٍ للجدار): يُبحث على مسافات من الوجه الخارجي، وطوله من تقاطعات خطوط
 * الرؤية الفعلية (كل نقاط المواقف ← نقاط النافذة) مع خطه وهامش. يُرفض إن خرج من الأرض، أو قطع موقفًا، أو اقترب من جدار المبنى (لا يغيّر
 * طوبولوجيا الجدران)، أو من مقدمة باب خارجي، أو زاد على الطول الأقصى. يعيد { a, b, offset } أو null. لا يعدّل المستند.
 */
export function planWindowScreen(doc, lv, op, side, bays, D = SCREEN_DEFAULTS) {
  const out = side.outward, u = { x: -out.y, y: out.x }, t0 = (op.wall?.t || .2) / 2, hw = op.w / 2;
  const winPts = [-1, -.5, 0, .5, 1].map(k => ({ x: op.p.x + u.x * hw * k + out.x * t0, y: op.p.y + u.y * hw * k + out.y * t0 }));
  const parking = bays.flatMap(z => bayPoints(z.polygon));
  const plot = doc.plot?.polygon?.length >= 3 ? doc.plot.polygon : null;
  const walls = (doc.walls || []).filter(w => w.level === lv.level.id);
  const extDoors = lv.openings.filter(o => o.door && o.sides.some(s => s.other === 'outside')).map(o => { const s = o.sides.find(x => x.other === 'outside'); return { x: o.p.x + s.outward.x * ((o.wall?.t || .2) / 2 + .5), y: o.p.y + s.outward.y * ((o.wall?.t || .2) / 2 + .5) }; });
  for (const off of D.offsets) {
    // خط الساتر: نقطة الأصل أمام النافذة على بعد off من الوجه الخارجي، واتجاهه u
    const o0 = { x: op.p.x + out.x * (t0 + off), y: op.p.y + out.y * (t0 + off) };
    let lo = Infinity, hi = -Infinity;
    for (const P of parking) {
      const dP = (P.x - op.p.x) * out.x + (P.y - op.p.y) * out.y - t0; if (dP <= off + 1e-6) continue; // الموقف أمام خط الساتر فقط
      for (const W of winPts) { const k = off / dP, X = { x: W.x + (P.x - W.x) * k, y: W.y + (P.y - W.y) * k }, s = (X.x - o0.x) * u.x + (X.y - o0.y) * u.y; lo = Math.min(lo, s); hi = Math.max(hi, s); }
    }
    if (!(hi > lo)) continue;
    lo -= D.margin; hi += D.margin;
    if (hi - lo > D.maxLength) continue;
    const a = { x: o0.x + u.x * lo, y: o0.y + u.y * lo }, b = { x: o0.x + u.x * hi, y: o0.y + u.y * hi }, r3 = v => Math.round(v * 1000) / 1000;
    const seg = { a: { x: r3(a.x), y: r3(a.y) }, b: { x: r3(b.x), y: r3(b.y) } };
    if (plot && ![seg.a, seg.b].every(p => pointInPolygon(p, plot, -.05))) continue;
    if (bays.some(z => z.polygon.some((p, i) => segmentHit(seg.a, seg.b, p, z.polygon[(i + 1) % z.polygon.length])) || pointInPolygon(seg.a, z.polygon, 0) || pointInPolygon(seg.b, z.polygon, 0))) continue;
    if (walls.some(w => segSegDist(seg.a, seg.b, w.a, w.b) < (w.t ?? .2) / 2 + D.wallClear)) continue;
    if (extDoors.some(p => segDist(p, seg.a, seg.b) < D.doorClear)) continue;
    // الساتر لا يقترب من وجه أي نافذة خارجية (مستهدفة أو غيرها) أقل من windowClear: يبقى للنافذة مجال فتح وضوء (قرار المالك 2026-10-26)
    if (lv.openings.some(o => { if (!o.window) return false; const s2 = o.sides.find(x => x.other === 'outside'); if (!s2 || !(o.id === op.id || requiresLightOrAir(s2.room))) return false; const tt = (o.wall?.t || .2) / 2, h2 = o.w / 2, v = { x: -s2.outward.y, y: s2.outward.x };
      return segSegDist(seg.a, seg.b, { x: o.p.x + s2.outward.x * tt - v.x * h2, y: o.p.y + s2.outward.y * tt - v.y * h2 }, { x: o.p.x + s2.outward.x * tt + v.x * h2, y: o.p.y + s2.outward.y * tt + v.y * h2 }) < D.windowClear; })) continue;
    // ولا يقترب من الموقف ولا يقطع ممر دخوله إلى حد الأرض (حركة المركبات)
    if (bays.some(z => { const ap = bayApproach(doc, z.polygon); return segPolyDist(seg.a, seg.b, z.polygon) < D.bayClear || (ap && segPolyDist(seg.a, seg.b, ap.polygon) <= 0); })) continue;
    return { ...seg, offset: off, length: r3(hi - lo) };
  }
  return null;
}
export default { segmentHit, screenWindowPrivacy, bayPoints, interiorPoints, windowGeometry, windowExposure, acceptanceSnapshot, compareAcceptance, planWindowScreen, SCREEN_DEFAULTS };
