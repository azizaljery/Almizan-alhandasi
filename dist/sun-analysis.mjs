// تحليل الشمس والتوجيه لتصميم واحد: وحدة نقية بلا DOM (تُختبر في node).
// لكل فراغ له نافذة خارجية: اتجاه الواجهة بعد الشمال الحقيقي، وساعات الشمس المباشرة التقريبية عليها صيفًا (21 يونيو) وشتاءً (21 ديسمبر)
// من هندسة الشمس وحدها. ثم مؤشرات للتصميم كله ودرجة توجيه 0–100 مفسَّرة لمناخ حار.
// ما لا يُحسب (ويُقال للعميل): تظليل الجيران والأسوار والأشجار، الكاسرات والمظلات، نوع الزجاج، الغيوم والغبار، وأي رقم لتوفير الطاقة.
import { analyzeDoc } from './draw/digest.mjs';
import { ROOM_TYPES } from './draw/catalog.mjs';
import { sunPosition, sunriseSunset, DAYS } from './sun.mjs';
import { compassKey, compassAdj, compassName, trueToPlan } from './geo-land.mjs';

const D = Math.PI / 180, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const norm360 = a => ((a % 360) + 360) % 360;
/** الشمس «على الواجهة» حين ترتفع 5° فأكثر وزاوية سقوطها على الجدار (ثلاثية الأبعاد: الارتفاع والسمت معًا) أقل من نحو 78° عن عموده:
 * الشمس المماسّة للجدار، أو العالية جدًا فوقه ظهرًا، لا تُعدّ شمسًا مباشرة على النافذة. */
export const MIN_ALTITUDE_DEG = 5, FACING_COS = 0.2, HOT_FROM_SOLAR_HOUR = 13, STEP_HOURS = 1 / 12;
export const SUN_LIMITS = 'حساب هندسي تقريبي من موضع الشمس واتجاه الواجهات فقط: لا يحسب ظل الجيران والأسوار والأشجار ولا الكاسرات ونوع الزجاج، وليس دراسة حمل حراري ولا تقدير توفير طاقة.';

/** ساعات الشمس المباشرة على واجهة اتجاهها الحقيقي bearing في يوم: { total, morning, afternoon, hot } (hot: بعد 13:00 شمسيًا). */
export function facadeSunHours(latitudeDeg, bearingDeg, dayOfYear) {
  const { sunrise, sunset } = sunriseSunset(latitudeDeg, dayOfYear), out = { total: 0, morning: 0, afternoon: 0, hot: 0 };
  if (sunrise === null) return out;
  for (let t = sunrise + STEP_HOURS / 2; t < sunset; t += STEP_HOURS) {
    const s = sunPosition({ latitudeDeg, dayOfYear, solarHour: t });
    if (s.altitudeDeg < MIN_ALTITUDE_DEG || Math.cos(s.altitudeDeg * D) * Math.cos((s.azimuthDeg - bearingDeg) * D) < FACING_COS) continue;
    out.total += STEP_HOURS; if (t < 12) out.morning += STEP_HOURS; else out.afternoon += STEP_HOURS; if (t >= HOT_FROM_SOLAR_HOUR) out.hot += STEP_HOURS;
  }
  for (const k of Object.keys(out)) out[k] = r1(out[k]);
  return out;
}
/** اتجاه حقيقي لمتجه في المخطط (+y للمخطط اتجاهه north درجة عن الشمال الحقيقي). */
export const planBearing = (x, y, north = 0) => norm360(Math.atan2(x, y) / D + north);

/** جودة واجهة فراغ معيشة في مناخ حار (0..1) بحسب جهتها الثُمانية. */
const LIVING_QUALITY = { n: 1, s: .85, ne: .75, se: .7, e: .6, nw: .4, sw: .3, w: .15 };
const LIVING_WHY = {
  n: 'ضوء هادئ ثابت بلا شمس مباشرة تُذكر', s: 'شمس شتوية دافئة، وشمس الصيف عالية تحجبها مظلة أفقية', ne: 'شمس صباح خفيفة', se: 'شمس الصباح والضحى',
  e: 'شمس الصباح ثم ظل بقية اليوم', nw: 'شمس آخر العصر صيفًا', sw: 'شمس العصر الحارة', w: 'شمس العصر الحارة مباشرة',
};
const NS_WEIGHT = { n: 1, s: 1, ne: .5, se: .5, nw: .25, sw: 0, e: .25, w: 0 };
const BED = ['bedroom', 'master'], LIVE = ['living', 'majlis'];
/** تصنيف تعرّض واجهة (للتلوين والشرح): hot شمس عصر صيفية طويلة، warm شمس عصر أقصر، winter شمس شتوية (جنوبية)، morning شمس صباح، calm هادئة. */
export const EXPOSURE = Object.freeze({
  hot: { ar: 'شمس العصر الحارة', color: '#b8502e' }, warm: { ar: 'شمس عصر جزئية', color: '#d9903a' }, winter: { ar: 'شمس شتوية، مظللة صيفًا', color: '#c9a646' },
  morning: { ar: 'شمس الصباح', color: '#e3c770' }, calm: { ar: 'ضوء هادئ بلا شمس مباشرة تُذكر', color: '#7f9aa8' },
});
const exposureOf = F => (F.summer.hot >= 3 ? 'hot' : F.summer.hot >= 1 ? 'warm' : F.winter.total >= 4 && F.summer.total < 2.5 ? 'winter' : (F.summer.morning + F.winter.morning) / 2 >= 2 ? 'morning' : 'calm');

function levelTops(doc) { let acc = 0; const tops = {}; for (const [i, l] of doc.levels.entries()) { const E = Number.isFinite(l.elevation) && (i === 0 || l.elevation > 0) ? l.elevation : acc; acc = E + (l.height || 3.2); tops[l.id] = acc; } return tops; }
/** كتل المبنى للظل: محيط كل دور بارتفاع سطحه (والأعلى مع سترته). */
export function massing(doc, model = analyzeDoc(doc)) {
  const tops = levelTops(doc), built = model.levels.filter(l => l.analysis.outlines.length), parapet = Number.isFinite(doc.roof?.parapet) ? doc.roof.parapet : 0.9;
  return built.map((l, i) => ({ level: l.level.id, height: r2(tops[l.level.id] + (i === built.length - 1 ? parapet : 0)), outlines: l.analysis.outlines.map(o => o.polygon) }));
}
/** اتجاه الشمس في إحداثيات المخطط (متجه أفقي واحدي نحو الشمس) لسمت حقيقي az. */
export function sunDirPlan(azimuthDeg, north = 0) { const p = trueToPlan(Math.sin(azimuthDeg * D), Math.cos(azimuthDeg * D), north); return { x: p.x, y: p.y }; }
/** إزاحة ظل نقطة ارتفاعها height على الأرض: عكس اتجاه الشمس بطول height/tan(alt). null إن كانت الشمس تحت الأفق. */
export function shadowOffset(height, azimuthDeg, altitudeDeg, north = 0) {
  if (!(altitudeDeg > 0.5)) return null;
  const d = sunDirPlan(azimuthDeg, north), len = Math.min(height / Math.tan(altitudeDeg * D), 60);
  return { dx: -d.x * len, dy: -d.y * len, length: r2(len) };
}
const cross = (a, b) => a.x * b.y - a.y * b.x;
function rayHits(p, dir, maxT, poly) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], e = { x: b.x - a.x, y: b.y - a.y }, den = cross(dir, e); if (Math.abs(den) < 1e-9) continue;
    const ap = { x: a.x - p.x, y: a.y - p.y }, t = cross(ap, e) / den, u = cross(ap, dir) / den;
    if (t > 1e-6 && t <= maxT && u >= 0 && u <= 1) return true;
  }
  return false;
}
/** هل تقع نقطة على الأرض في ظل كتلة المبنى (المبنى نفسه فقط) لشمس معيّنة؟ */
export function pointShaded(p, masses, azimuthDeg, altitudeDeg, north = 0) {
  if (!(altitudeDeg > 0.5)) return true;
  const dir = sunDirPlan(azimuthDeg, north), tan = Math.tan(altitudeDeg * D);
  return masses.some(m => m.outlines.some(poly => rayHits(p, dir, m.height / tan, poly)));
}
/** ساعات الشمس على نقطة في الحوش في يوم، مع ظل المبنى نفسه. */
export function groundSunHours(p, masses, latitudeDeg, dayOfYear, north = 0) {
  const { sunrise, sunset } = sunriseSunset(latitudeDeg, dayOfYear); if (sunrise === null) return 0;
  let h = 0;
  for (let t = sunrise + STEP_HOURS / 2; t < sunset; t += STEP_HOURS) { const s = sunPosition({ latitudeDeg, dayOfYear, solarHour: t }); if (s.altitudeDeg >= MIN_ALTITUDE_DEG && !pointShaded(p, masses, s.azimuthDeg, s.altitudeDeg, north)) h += STEP_HOURS; }
  return r1(h);
}

/**
 * تحليل التصميم. site: { lat, lng, north } (من solarSite في geo-land). north = الاتجاه الحقيقي لمحور +y للمخطط.
 * يعيد: rooms (واجهات كل فراغ وساعاتها)، glazing (الزجاج بحسب الجهة)، bedrooms، living، outdoor، score (0..100)، parts، ups، downs، lines (سطران)، recs.
 */
export function analyzeSun(doc, site = {}, { model = analyzeDoc(doc) } = {}) {
  const lat = Number.isFinite(site.lat) ? site.lat : 24.71, north = Number.isFinite(site.north) ? site.north : 0;
  const hoursCache = new Map(), hours = b => { const k = Math.round(b); if (!hoursCache.has(k)) hoursCache.set(k, { summer: facadeSunHours(lat, k, DAYS.juneSolstice), winter: facadeSunHours(lat, k, DAYS.decemberSolstice) }); return hoursCache.get(k); };
  const rooms = new Map(), glazing = Object.fromEntries(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map(k => [k, { width: 0, area: 0 }]));
  let totalArea = 0, totalWidth = 0, hotWeighted = 0;
  for (const lv of model.levels) for (const op of lv.openings) {
    if (!op.window) continue;
    for (const s of op.sides) {
      if (!s.exterior || !s.room || s.room.unlabelled || ROOM_TYPES[s.room.type]?.open) continue;
      const bearing = planBearing(s.outward.x, s.outward.y, north), key = compassKey(bearing), h = hours(bearing), area = op.w * op.h;
      const id = lv.level.id + ':' + s.room.id;
      if (!rooms.has(id)) rooms.set(id, { id: s.room.id, name: s.room.name, type: s.room.type, level: lv.level.name, levelId: lv.level.id, facades: [] });
      const R = rooms.get(id); let F = R.facades.find(x => x.key === key && Math.abs(x.bearing - bearing) < 1);
      if (!F) { F = { key, bearing: r1(bearing), name: compassName(bearing), adj: compassAdj(bearing), width: 0, area: 0, windows: 0, summer: h.summer, winter: h.winter, segments: [] }; R.facades.push(F); }
      F.width = r2(F.width + op.w); F.area = r2(F.area + area); F.windows++; F.segments.push({ p: { x: op.p.x, y: op.p.y }, u: { x: op.u.x, y: op.u.y }, w: op.w });
      glazing[key].width = r2(glazing[key].width + op.w); glazing[key].area = r2(glazing[key].area + area);
      totalArea += area; totalWidth += op.w; hotWeighted += area * h.summer.hot;
    }
  }
  const list = [...rooms.values()];
  for (const R of list) {
    R.facades.sort((a, b) => b.area - a.area); const main = R.facades[0];
    R.main = main.key; R.hot = Math.max(...R.facades.map(x => x.summer.hot)); R.morning = Math.max(...R.facades.map(x => (x.summer.morning + x.winter.morning) / 2));
    for (const F of R.facades) F.exposure = exposureOf(F);
    R.exposure = ['hot', 'warm', 'winter', 'morning', 'calm'].find(e => R.facades.some(F => F.exposure === e));
  }
  // غرف النوم: شمس صباحية (ساعتان فأكثر في المتوسط) بلا شمس عصر حارة
  const bedsAll = model.levels.flatMap(l => l.rooms.filter(r => !r.unlabelled && BED.includes(r.type)).map(r => ({ id: l.level.id + ':' + r.id, name: r.name })));
  const beds = bedsAll.map(b => ({ ...b, a: rooms.get(b.id) || null })), bedMorning = beds.filter(b => b.a && b.a.morning >= 2 && b.a.hot < 2), bedHot = beds.filter(b => b.a && b.a.hot >= 3), bedNoWin = beds.filter(b => !b.a);
  // المجلس والصالة
  const liveAll = model.levels.flatMap(l => l.rooms.filter(r => !r.unlabelled && LIVE.includes(r.type)).map(r => ({ id: l.level.id + ':' + r.id, name: r.name })));
  const living = liveAll.map(x => { const a = rooms.get(x.id); return a ? { name: x.name, key: a.main, facade: a.facades[0].adj, quality: LIVING_QUALITY[a.main], why: LIVING_WHY[a.main], hot: a.hot } : { name: x.name, key: null, quality: null, why: 'بلا نافذة خارجية في المخطط' }; });
  const liveRated = living.filter(x => x.quality !== null);
  // الزجاج الحار: الغرب والجنوب الغربي (والشمال الغربي يُذكر) — طول ومساحة
  const west = { width: r2(glazing.w.width + glazing.sw.width), area: r2(glazing.w.area + glazing.sw.area) }, westShare = totalArea ? west.area / totalArea : 0;
  const heatIdx = totalArea ? hotWeighted / totalArea : 0; // متوسط ساعات شمس العصر الصيفية على الزجاج
  const nsShare = totalArea ? Object.entries(glazing).reduce((s, [k, g]) => s + g.area * NS_WEIGHT[k], 0) / totalArea : 0;
  // الحوش: المسبح والمسطحات الخضراء
  const masses = massing(doc, model), OUT_NAME = { pool: 'المسبح', lawn: 'المسطح الأخضر', pergola: 'الجلسة الخارجية' };
  const outdoor = (doc.fixtures || []).filter(x => OUT_NAME[x.kind]).map(x => ({ kind: x.kind, name: OUT_NAME[x.kind], at: { x: x.x, y: x.y }, summer: groundSunHours({ x: x.x, y: x.y }, masses, lat, DAYS.juneSolstice, north), winter: groundSunHours({ x: x.x, y: x.y }, masses, lat, DAYS.decemberSolstice, north) }));

  // ---- الدرجة: 40 حمل العصر على الزجاج + 20 غرف النوم + 20 المجلس والصالة + 20 حصة الشمال والجنوب
  const pHeat = totalArea ? 40 * (1 - Math.min(1, heatIdx / 4.5)) : 20;
  const pBeds = beds.length ? 20 * (bedMorning.length / beds.length) : 10;
  const pLive = liveRated.length ? 20 * (liveRated.reduce((s, x) => s + x.quality, 0) / liveRated.length) : 10;
  const pNS = totalArea ? 20 * nsShare : 10;
  const score = Math.max(0, Math.min(100, Math.round(pHeat + pBeds + pLive + pNS)));
  const parts = [
    { id: 'heat', label: 'شمس العصر الصيفية على الزجاج', points: r1(pHeat), max: 40, detail: totalArea ? `متوسط ${r1(heatIdx)} ساعة شمس مباشرة بعد الواحدة ظهرًا (صيفًا) على زجاج البيت؛ الزجاج الغربي والجنوبي الغربي ${r1(west.width)} م طولًا (${Math.round(westShare * 100)}٪ من الزجاج)` : 'لا نوافذ خارجية في المخطط' },
    { id: 'beds', label: 'غرف النوم بشمس الصباح', points: r1(pBeds), max: 20, detail: beds.length ? `${bedMorning.length} من ${beds.length} غرف نوم تأخذ شمس الصباح بلا شمس عصر حارة` : 'لا غرف نوم في المخطط' },
    { id: 'living', label: 'واجهة المجلس والصالة', points: r1(pLive), max: 20, detail: liveRated.length ? liveRated.map(x => `${x.name} ${x.facade}`).join('، ') : 'لا مجلس أو صالة بنافذة خارجية' },
    { id: 'ns', label: 'الزجاج على الشمال والجنوب', points: r1(pNS), max: 20, detail: totalArea ? `${Math.round((glazing.n.area + glazing.s.area) / totalArea * 100)}٪ من الزجاج على الشمال والجنوب (الأسهل تظليلًا)` : '—' },
  ];
  const ups = [], downs = [];
  if (totalArea && westShare <= 0.1) ups.push(west.width ? `الزجاج على الغرب والجنوب الغربي قليل (${r1(west.width)} م فقط)` : 'لا زجاج على الغرب ولا الجنوب الغربي');
  if (westShare > 0.25) downs.push(`${Math.round(westShare * 100)}٪ من الزجاج (${r1(west.width)} م طولًا) على الغرب والجنوب الغربي: شمس العصر الحارة`);
  else if (westShare > 0.1) downs.push(`${r1(west.width)} م من الزجاج على الغرب والجنوب الغربي`);
  if (beds.length && bedMorning.length / beds.length >= 0.6) ups.push(`${bedMorning.length} من ${beds.length} غرف نوم تأخذ شمس الصباح`);
  if (bedHot.length) downs.push(`${bedHot.map(b => b.name).join('، ')}: شمس عصر مباشرة ${r1(Math.max(...bedHot.map(b => b.a.hot)))} ساعة صيفًا`);
  if (beds.length && !bedMorning.length && !bedHot.length) downs.push('لا غرفة نوم تأخذ شمس الصباح');
  for (const x of liveRated) (x.quality >= 0.7 ? ups : x.quality <= 0.4 ? downs : []).push(`${x.name} واجهته ${x.facade}: ${x.why}`);
  if (totalArea && nsShare >= 0.55) ups.push('أغلب الزجاج على الشمال والجنوب، وهما الأسهل تظليلًا');
  // سطران بلغة بسيطة للشارة
  const bedLine = !beds.length ? 'لا غرف نوم في المخطط.' : bedMorning.length === beds.length ? 'غرف النوم كلها تأخذ شمس الصباح.' : bedMorning.length ? `${bedMorning.length} من ${beds.length} غرف نوم تأخذ شمس الصباح${bedHot.length ? `، و${bedHot.length === 1 ? 'واحدة' : bedHot.length} عليها شمس العصر` : ''}.` : bedHot.length ? `${bedHot.length === beds.length ? 'غرف النوم' : bedHot.length + ' من غرف النوم'} على شمس العصر — يُنصح بكاسرات.` : 'غرف النوم بلا شمس صباح مباشرة.';
  const hotLive = liveRated.filter(x => x.quality <= 0.4), goodLive = liveRated.filter(x => x.quality >= 0.7);
  const liveLine = hotLive.length ? `زجاج ${hotLive.map(x => x.name).join(' و')} ${hotLive[0].facade === 'غربية' || hotLive.length > 1 ? 'على جهة العصر' : hotLive[0].facade} — يُنصح بكاسرات.` : goodLive.length ? `${goodLive.map(x => x.name).join(' و')} على واجهة ${goodLive[0].facade} مريحة${west.width > 0.1 && westShare > 0.1 ? `؛ وفي البيت ${r1(west.width)} م زجاج غربي` : ''}.` : west.width > 0.1 ? `في البيت ${r1(west.width)} م زجاج على الغرب والجنوب الغربي.` : 'لا زجاج يُذكر على جهة العصر.';
  // توصيات عملية بلا أرقام توفير
  const noon = d => r1(sunPosition({ latitudeDeg: lat, dayOfYear: d, solarHour: 12 }).altitudeDeg), recs = [];
  const hotRooms = list.filter(r => r.exposure === 'hot');
  if (hotRooms.length) recs.push(`نوافذ ${hotRooms.slice(0, 4).map(r => r.name).join('، ')} تواجه شمس العصر: كاسرات رأسية أو مشربية أو شيش خارجي أمامها، وزجاج مزدوج عاكس للحرارة، ويمكن تصغيرها أو رفع جلستها.`);
  if (glazing.s.area + glazing.se.area > 0) recs.push(`النوافذ الجنوبية: مظلة أو بروز أفقي فوقها يحجب شمس الصيف العالية (${noon(DAYS.juneSolstice)}° ظهرًا) ويُدخل شمس الشتاء المنخفضة (${noon(DAYS.decemberSolstice)}° ظهرًا).`);
  if (glazing.e.area + glazing.ne.area > 0) recs.push('النوافذ الشرقية: شمس الصباح لطيفة شتاءً؛ ستارة خارجية أو شيش يكفي صيفًا.');
  if (bedNoWin.length) recs.push(`${bedNoWin.map(b => b.name).join('، ')}: لا نافذة خارجية مرسومة — راجعها في المرسم.`);
  for (const o of outdoor) recs.push(`${o.name}: نحو ${o.summer} ساعة شمس صيفًا و${o.winter} شتاءً في موضعه (بظل المبنى نفسه فقط)${o.kind === 'pool' && o.summer >= 9 ? ' — مظلة أو برجولة على جزء منه تريح في الصيف' : o.kind === 'lawn' && o.winter < 3 ? ' — ظل شتوي طويل؛ اختر نباتات تتحمل الظل' : ''}.`);
  if (!recs.length) recs.push('لا توصيات خاصة: التعرّض للشمس معتدل في هذا التوزيع.');
  return {
    site: { lat, lng: site.lng ?? null, north, label: site.label || '', source: site.source || 'default' },
    rooms: list, glazing, totals: { area: r2(totalArea), width: r2(totalWidth) }, west: { ...west, share: r2(westShare) }, heatIndex: r1(heatIdx), nsShare: r2(nsShare),
    bedrooms: { count: beds.length, morning: bedMorning.length, hot: bedHot.length, share: beds.length ? r2(bedMorning.length / beds.length) : null },
    living, outdoor, masses, score, parts, ups, downs, lines: [bedLine, liveLine], recs, limits: SUN_LIMITS,
  };
}

/** ترتيب تصاميم الجلسة بحسب درجة التوجيه (الأعلى أولًا). docs: مستندات مفسَّرة. يعيد [{ index, score, lines }]. */
export function rankByOrientation(docs, site) {
  return docs.map((d, index) => { try { const a = analyzeSun(d, site); return { index, score: a.score, lines: a.lines }; } catch { return { index, score: null, lines: [] }; } })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.index - b.index);
}

export default { analyzeSun, facadeSunHours, rankByOrientation, massing, shadowOffset, pointShaded, groundSunHours, SUN_LIMITS };
