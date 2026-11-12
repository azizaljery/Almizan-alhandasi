// موقع الأرض على الخريطة: هندسة نقية بلا DOM ولا شبكة (تُختبر في node).
// - تحليل إحداثيات يكتبها العميل أو رابط خرائط Google.
// - بلاطات Web Mercator (مصدر واحد ثابت سهل التبديل).
// - مستطيل الأرض المدوَّر على الخريطة ↔ اتجاه الشمال الحقيقي وأضلاع الأرض (شمال/جنوب/شرق/غرب).
// - مناطق المملكة الـ13 ومدنها الرئيسية (إحداثيات تقريبية لمركز المدينة، تكفي لحساب الشمس لا للمساحة).
// الإحداثيات تبقى في متصفح العميل (جلسة التصميم) ولا تُرسل إلى خادم الميزان.

/** مصدر البلاطات: ثابت واحد. سياسة OSM: الرابط كما هو، الإسناد ظاهر، بلا تحميل مسبق، والتخزين المؤقت للمتصفح. */
export const TILE_SOURCE = Object.freeze({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', size: 256, minZoom: 4, maxZoom: 19,
  attribution: '© مساهمو OpenStreetMap', attributionHref: 'https://www.openstreetmap.org/copyright',
});
/** خدمة البحث بالاسم (Nominatim العامة): زر صريح فقط، طلب واحد في الثانية كحد أقصى، بلا إكمال تلقائي، والنتائج تُحفظ. ثابت واحد سهل التبديل. */
export const GEOCODER = Object.freeze({
  search: 'https://nominatim.openstreetmap.org/search', minIntervalMs: 1500, limit: 5, countrycodes: 'sa', language: 'ar',
  attribution: 'نتائج البحث من Nominatim — © مساهمو OpenStreetMap',
});
export const KSA_BOUNDS = Object.freeze({ latMin: 16, latMax: 32.6, lngMin: 34.3, lngMax: 55.9 });
export const DEFAULT_CENTER = Object.freeze({ lat: 24.7136, lng: 46.6753, zoom: 11 }); // الرياض

const D = Math.PI / 180, M_PER_DEG = 111320;
const fin = v => typeof v === 'number' && Number.isFinite(v);
const norm360 = a => ((a % 360) + 360) % 360;
const r6 = v => Math.round(v * 1e6) / 1e6;
export const validLatLng = (lat, lng) => fin(lat) && fin(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180;
export const inSaudi = (lat, lng) => validLatLng(lat, lng) && lat >= KSA_BOUNDS.latMin && lat <= KSA_BOUNDS.latMax && lng >= KSA_BOUNDS.lngMin && lng <= KSA_BOUNDS.lngMax;

// ------------------------------------------------------------------------------------------ تحليل النص/الرابط
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', '،': ',' };
const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const pair = (a, b) => { const lat = Number(a), lng = Number(b); return validLatLng(lat, lng) ? { lat: r6(lat), lng: r6(lng) } : null; };
function dms(text) {
  // 24°42'49.0"N 46°40'31.1"E
  const re = /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([NSEW])/gi, out = {};
  for (const m of text.matchAll(re)) { const v = (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * (/[SW]/i.test(m[4]) ? -1 : 1); if (/[NS]/i.test(m[4])) out.lat = v; else out.lng = v; }
  return fin(out.lat) && fin(out.lng) ? pair(out.lat, out.lng) : null;
}
/**
 * يحلّل ما يلصقه العميل: «24.7136, 46.6753»، أو رابط خرائط Google بأنماطه الشائعة
 * (‎!3d..!4d..‎ موضع الدبوس، ‎?q=‎ / ‎query=‎ / ‎ll=‎ / ‎destination=‎، ‎/place/lat,lng‎، ‎@lat,lng‎ مركز العرض)، أو درجات ودقائق وثوانٍ.
 * يعيد { ok:true, lat, lng, source, approx? } أو { ok:false, reason, message }.
 * الروابط المختصرة (maps.app.goo.gl / goo.gl/maps) لا تحمل الإحداثيات ولا يمكن فتحها من المتصفح: يُقال ذلك صراحة.
 */
export function parseLocationText(input) {
  let text = String(input ?? '').trim().replace(/[٠-٩٫،]/g, c => AR_DIGITS[c]);
  if (!text) return { ok: false, reason: 'empty', message: 'الصق إحداثيات مثل 24.7136, 46.6753 أو رابط الموقع من خرائط Google.' };
  if (/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|g\.page)\//i.test(text)) return { ok: false, reason: 'short-link', message: 'هذا رابط مختصر لا يحمل الإحداثيات، ولا يستطيع المتصفح فتحه بالنيابة عنك. افتحه في خرائط Google ثم انسخ الرابط الطويل من شريط العنوان، أو اضغط مطولًا على الموقع وانسخ الإحداثيات.' };
  try { text = decodeURIComponent(text); } catch { /* يبقى كما هو */ }
  const ok = (p, source, extra = {}) => ({ ok: true, ...p, source, inSaudi: inSaudi(p.lat, p.lng), ...extra });
  let m;
  if ((m = text.match(new RegExp(`!3d${NUM}!4d${NUM}`)))) { const p = pair(m[1], m[2]); if (p) return ok(p, 'google-pin'); }
  if ((m = text.match(new RegExp(`[?&](?:q|query|ll|sll|destination|daddr|center)=(?:loc:)?${NUM}\\s*,\\s*\\+?${NUM}`)))) { const p = pair(m[1], m[2]); if (p) return ok(p, 'google-query'); }
  if ((m = text.match(new RegExp(`/(?:place|search|dir)/${NUM},\\+?${NUM}`)))) { const p = pair(m[1], m[2]); if (p) return ok(p, 'google-place'); }
  if ((m = text.match(new RegExp(`@${NUM},${NUM}`)))) { const p = pair(m[1], m[2]); if (p) return ok(p, 'google-view', { approx: true }); }
  if ((m = text.match(new RegExp(`[?&]mlat=${NUM}.*?[?&]mlon=${NUM}`)))) { const p = pair(m[1], m[2]); if (p) return ok(p, 'osm'); }
  if ((m = text.match(new RegExp(`#map=\\d+/${NUM}/${NUM}`)))) { const p = pair(m[1], m[2]); if (p) return ok(p, 'osm', { approx: true }); }
  if ((m = text.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i))) { const p = pair(m[1], m[2]); if (p) return ok(p, 'geo'); }
  const d = dms(text); if (d) return ok(d, 'dms');
  if (!/^https?:/i.test(text) && (m = text.match(new RegExp(`^\\(?\\s*${NUM}\\s*[,;\\s]\\s*${NUM}\\s*\\)?$`)))) {
    let p = pair(m[1], m[2]);
    // «46.67, 24.71» (الطول أولًا): داخل المملكة لا يلتبسان، فيُصحَّح الترتيب ويُعلن
    if (p && !inSaudi(p.lat, p.lng) && inSaudi(p.lng, p.lat)) return ok({ lat: p.lng, lng: p.lat }, 'coords', { swapped: true });
    if (p) return ok(p, 'coords');
  }
  if (/^https?:/i.test(text)) return { ok: false, reason: 'no-coords', message: 'لم أجد إحداثيات في هذا الرابط. انسخ الرابط الطويل من شريط العنوان في خرائط Google (يحوي ‎@24.7,46.6‎)، أو الصق الإحداثيات مباشرة.' };
  return { ok: false, reason: 'unknown', message: 'لم أفهم الإحداثيات. اكتبها هكذا: 24.7136, 46.6753 (خط العرض ثم خط الطول).' };
}

// ------------------------------------------------------------------------------------------ بلاطات Web Mercator
const worldSize = z => TILE_SOURCE.size * 2 ** z;
export function project(lat, lng, z) {
  const s = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * D), n = worldSize(z);
  return { x: (lng + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export function unproject(x, y, z) {
  const n = worldSize(z);
  return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / D, lng: x / n * 360 - 180 };
}
export const metersPerPixel = (lat, z) => 156543.03392 * Math.cos(lat * D) / 2 ** z;
export function tileUrl(z, x, y, source = TILE_SOURCE) {
  const n = 2 ** z, xx = ((x % n) + n) % n;
  return source.url.replace('{z}', z).replace('{x}', xx).replace('{y}', y);
}
/**
 * البلاطات اللازمة لمشهد واحد فقط (ما يراه المستخدم الآن — لا تحميل مسبق): view = { lat, lng, zoom } وأبعاد اللوحة بالبكسل.
 * فوق أقصى تكبير للمصدر تُكبَّر بلاطات أقصى مستوى (scale) بدل طلب مستويات غير موجودة.
 */
export function visibleTiles(view, width, height, source = TILE_SOURCE) {
  const tz = Math.max(source.minZoom, Math.min(source.maxZoom, Math.floor(view.zoom))), scale = 2 ** (view.zoom - tz), size = source.size * scale;
  const c = project(view.lat, view.lng, tz), n = 2 ** tz;
  const x0 = c.x - width / 2 / scale, y0 = c.y - height / 2 / scale;
  const out = [];
  for (let ty = Math.floor(y0 / source.size); ty <= Math.floor((y0 + height / scale) / source.size); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(x0 / source.size); tx <= Math.floor((x0 + width / scale) / source.size); tx++)
      out.push({ z: tz, x: tx, y: ty, url: tileUrl(tz, tx, ty, source), left: (tx * source.size - x0) * scale, top: (ty * source.size - y0) * scale, size });
  }
  return out;
}
/** موضع نقطة جغرافية على اللوحة، والعكس. */
export function toScreen(view, width, height, lat, lng) {
  const c = project(view.lat, view.lng, view.zoom), p = project(lat, lng, view.zoom);
  return { x: p.x - c.x + width / 2, y: p.y - c.y + height / 2 };
}
export function fromScreen(view, width, height, x, y) {
  const c = project(view.lat, view.lng, view.zoom);
  return unproject(c.x + x - width / 2, c.y + y - height / 2, view.zoom);
}

// ------------------------------------------------------------------------------------------ مستطيل الأرض ↔ الشمال
/** إزاحة بالأمتار (شرقًا، شمالًا) من نقطة ← نقطة جغرافية (تقريب محلي مستوٍ، خطؤه مهمل على أبعاد قطعة). */
export function offsetMeters(lat, lng, east, north) {
  return { lat: lat + north / M_PER_DEG, lng: lng + east / (M_PER_DEG * Math.cos(lat * D)) };
}
export function metersBetween(a, b) {
  return { east: (b.lng - a.lng) * M_PER_DEG * Math.cos(a.lat * D), north: (b.lat - a.lat) * M_PER_DEG };
}
/**
 * مستطيل الأرض على الخريطة: المركز، العرض (محور x للمخطط، «شرق↔غرب») والطول (محور y، «شمال↔جنوب») بالمتر،
 * و bearing = الاتجاه الحقيقي (درجات مع عقارب الساعة من الشمال) لمحور +y للمخطط، أي للضلع المسمّى «شمال».
 * يعيد الأركان الأربعة [جنوب‑غرب، جنوب‑شرق، شمال‑شرق، شمال‑غرب] بتسمية المخطط.
 */
export function rectCorners({ lat, lng, width, length, bearing = 0 }) {
  const b = bearing * D, c = Math.cos(b), s = Math.sin(b), hw = width / 2, hl = length / 2;
  return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([x, y]) => offsetMeters(lat, lng, x * c + y * s, -x * s + y * c));
}
/** متجه المخطط (x,y) ← (شرق، شمال) حقيقيان، والعكس. */
export const planToTrue = (x, y, bearing = 0) => { const b = bearing * D; return { east: x * Math.cos(b) + y * Math.sin(b), north: -x * Math.sin(b) + y * Math.cos(b) }; };
export const trueToPlan = (east, north, bearing = 0) => { const b = bearing * D; return { x: east * Math.cos(b) - north * Math.sin(b), y: east * Math.sin(b) + north * Math.cos(b) }; };

const SIDE_ORDER = ['n', 'e', 's', 'w']; // مع عقارب الساعة
/**
 * يطبّع المستطيل بعد تدويره: يُعاد تسمية الأضلاع حتى يكون الضلع المسمّى «شمال» هو الأقرب إلى الشمال الحقيقي،
 * فيبقى انحراف الشمال ضمن [‎-45°، 45°‎)؛ وإن دار المستطيل ربع دورة يتبادل الطول والعرض وتنتقل الشوارع والمداخل وعروض الشوارع معه.
 * يعيد { width, length, north, streets, entries, streetWidths, swapped, turns }.
 */
export function normalizeRect({ width, length, bearing = 0, streets = [], entries = [], streetWidths = {} }) {
  const b = norm360(bearing), q = Math.floor((b + 45) / 90), k = q % 4, north = b - 90 * q;
  // بعد k ربع دورة مع عقارب الساعة: الضلع الذي كان اتجاهه b+270k… يصير «شمال». الضلع القديم old يصير ترتيبه (i + k) في الدورة.
  const map = Object.fromEntries(SIDE_ORDER.map((old, i) => [old, SIDE_ORDER[(i + k) % 4]]));
  const sw = {}; for (const [side, v] of Object.entries(streetWidths || {})) if (map[side] && fin(v)) sw[map[side]] = v;
  const odd = k % 2 === 1;
  return {
    width: odd ? length : width, length: odd ? width : length, north: Math.round(north * 10) / 10,
    streets: streets.filter(s => map[s]).map(s => map[s]), entries: entries.filter(s => map[s]).map(s => map[s]), streetWidths: sw, swapped: odd, turns: k,
  };
}
/** الاتجاه الحقيقي (0..360) للعمود الخارج من كل ضلع من أضلاع الأرض، بعد معرفة انحراف الشمال. */
export function sideBearings(north = 0) { return { n: norm360(north), e: norm360(north + 90), s: norm360(north + 180), w: norm360(north + 270) }; }
const COMPASS8 = ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'];
const COMPASS8_ADJ = ['شمالية', 'شمالية شرقية', 'شرقية', 'جنوبية شرقية', 'جنوبية', 'جنوبية غربية', 'غربية', 'شمالية غربية'];
export const COMPASS_KEYS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export const compassIndex = bearing => Math.round(norm360(bearing) / 45) % 8;
export const compassKey = bearing => COMPASS_KEYS[compassIndex(bearing)];
export const compassName = bearing => COMPASS8[compassIndex(bearing)];
export const compassAdj = bearing => COMPASS8_ADJ[compassIndex(bearing)];
/** وصف انحراف الشمال بلغة العميل. */
export function northText(north = 0) {
  const a = Math.round(Math.abs(north));
  if (a < 1) return 'الضلع الشمالي لأرضك يواجه الشمال الحقيقي تمامًا.';
  return `الضلع المسمّى «شمال» في أرضك منحرف ${a}° نحو ${north > 0 ? 'الشرق' : 'الغرب'} عن الشمال الحقيقي.`;
}

// ------------------------------------------------------------------------------------------ المناطق والمدن
/** مناطق المملكة الثلاث عشرة ومدنها الرئيسية. الإحداثيات تقريبية لمركز المدينة (للشمس والمناخ فقط). */
export const REGIONS = Object.freeze([
  { id: 'riyadh', ar: 'منطقة الرياض', cities: [['riyadh', 'الرياض', 24.71, 46.68], ['kharj', 'الخرج', 24.15, 47.31], ['dawadmi', 'الدوادمي', 24.51, 44.39], ['majmaah', 'المجمعة', 25.90, 45.34]] },
  { id: 'makkah', ar: 'منطقة مكة المكرمة', cities: [['makkah', 'مكة المكرمة', 21.39, 39.86], ['jeddah', 'جدة', 21.49, 39.19], ['taif', 'الطائف', 21.27, 40.42]] },
  { id: 'madinah', ar: 'منطقة المدينة المنورة', cities: [['madinah', 'المدينة المنورة', 24.47, 39.61], ['yanbu', 'ينبع', 24.09, 38.06]] },
  { id: 'qassim', ar: 'منطقة القصيم', cities: [['buraydah', 'بريدة', 26.33, 43.97], ['unaizah', 'عنيزة', 26.08, 43.99]] },
  { id: 'eastern', ar: 'المنطقة الشرقية', cities: [['dammam', 'الدمام', 26.43, 50.10], ['khobar', 'الخبر', 26.28, 50.21], ['ahsa', 'الأحساء', 25.38, 49.59], ['jubail', 'الجبيل', 27.00, 49.66], ['hafr', 'حفر الباطن', 28.43, 45.97]] },
  { id: 'asir', ar: 'منطقة عسير', cities: [['abha', 'أبها', 18.22, 42.50], ['khamis', 'خميس مشيط', 18.31, 42.73], ['bisha', 'بيشة', 20.00, 42.60]] },
  { id: 'tabuk', ar: 'منطقة تبوك', cities: [['tabuk', 'تبوك', 28.38, 36.57]] },
  { id: 'hail', ar: 'منطقة حائل', cities: [['hail', 'حائل', 27.52, 41.69]] },
  { id: 'northern', ar: 'منطقة الحدود الشمالية', cities: [['arar', 'عرعر', 30.98, 41.02]] },
  { id: 'jazan', ar: 'منطقة جازان', cities: [['jazan', 'جازان', 16.89, 42.55]] },
  { id: 'najran', ar: 'منطقة نجران', cities: [['najran', 'نجران', 17.49, 44.13]] },
  { id: 'bahah', ar: 'منطقة الباحة', cities: [['bahah', 'الباحة', 20.01, 41.47]] },
  { id: 'jawf', ar: 'منطقة الجوف', cities: [['sakaka', 'سكاكا', 29.97, 40.21], ['qurayyat', 'القريات', 31.33, 37.34]] },
].map(r => Object.freeze({ ...r, cities: Object.freeze(r.cities.map(([id, ar, lat, lng]) => Object.freeze({ id, ar, lat, lng, region: r.id }))) })));
export const ALL_CITIES = Object.freeze(REGIONS.flatMap(r => r.cities));
export const cityById = id => ALL_CITIES.find(c => c.id === id) || null;
export const regionById = id => REGIONS.find(r => r.id === id) || null;
/** أقرب مدينة رئيسية من القائمة (بالكيلومتر) — اقتراح يغيّره العميل، لا تحديد إداري. */
export function nearestCity(lat, lng) {
  if (!validLatLng(lat, lng)) return null;
  let best = null;
  for (const c of ALL_CITIES) { const d = metersBetween({ lat, lng }, c), km = Math.hypot(d.east, d.north) / 1000; if (!best || km < best.km) best = { city: c, km: Math.round(km) }; }
  return best;
}

// ------------------------------------------------------------------------------------------ ما يُحفظ في أرض الجلسة
/**
 * يطبّع الموقع المحفوظ مع الأرض: { lat, lng, north, city, region, cityName, source }.
 * source: 'map' (دبوس ومستطيل على الخريطة) أو 'city' (مدينة مختارة فقط). يعيد null إن لم يصلح شيء.
 */
export function normalizeGeo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const city = cityById(raw.city), lat = Number(raw.lat), lng = Number(raw.lng);
  const has = raw.lat !== null && raw.lat !== undefined && raw.lat !== '' && validLatLng(lat, lng);
  if (!has && !city) return null;
  let north = Number(raw.north); north = fin(north) ? Math.max(-45, Math.min(45, Math.round(north * 10) / 10)) : 0;
  const cityName = city?.ar || (typeof raw.cityName === 'string' ? raw.cityName.slice(0, 60) : '');
  return {
    lat: has ? r6(lat) : city.lat, lng: has ? r6(lng) : city.lng, north: has ? north : 0,
    ...(city ? { city: city.id, region: city.region } : {}), ...(cityName ? { cityName } : {}), source: has ? 'map' : 'city',
  };
}
export const GEO_KEY = 'mizan.land.geo.v1';
/** الموقع المستعمل في حساب الشمس: من الخريطة، وإلا من المدينة، وإلا الرياض افتراضيًا (ويُعلن ذلك). */
export function solarSite(geo) {
  const g = normalizeGeo(geo);
  if (g?.source === 'map') return { lat: g.lat, lng: g.lng, north: g.north, label: g.cityName ? `موقع أرضك على الخريطة (قرب ${g.cityName})` : 'موقع أرضك على الخريطة', source: 'map' };
  if (g) return { lat: g.lat, lng: g.lng, north: 0, label: `مدينة ${g.cityName} (لم تُحدَّد الأرض على الخريطة، فالشمال كما أدخلته)`, source: 'city' };
  return { lat: ALL_CITIES[0].lat, lng: ALL_CITIES[0].lng, north: 0, label: 'الرياض — افتراضي لأنك لم تحدد موقع أرضك ولا مدينتها', source: 'default' };
}

export default { TILE_SOURCE, GEOCODER, parseLocationText, project, unproject, visibleTiles, toScreen, fromScreen, rectCorners, normalizeRect, sideBearings, compassName, REGIONS, ALL_CITIES, nearestCity, normalizeGeo, solarSite, GEO_KEY };
