// محلّل مدخلات موقع الأرض: سطر واحد يلصقه العميل ← إحداثيات أو «ما يلزم لحلّها». وحدة نقية بلا DOM ولا شبكة (تُختبر في node).
// يتعرّف تلقائيًا على: إحداثيات عشرية/درجات ودقائق وثوانٍ (بأرقام عربية-هندية أيضًا)، روابط خرائط Google وApple وOpenStreetMap،
// الروابط القصيرة (تُحلّ خادميًا عبر /api/geo/resolve)، Plus Code (كامل وقصير)، العنوان الوطني المختصر، ونصًا حرًّا (يُبحث عنه).
// النتيجة دائمًا كائن: { ok:true, lat, lng, kind, understood, ... } أو { ok:false, needs, ... } أو { ok:false, reason, message }.
import { inSaudi, validLatLng, ALL_CITIES } from './geo-land.mjs';
import { isFull, isShort, isValid, decode, recoverNearest, ALPHABET } from './open-location-code.mjs';

/** النطاقات التي يحلّها الخادم فقط (ثلاثة). المسار شرط للنطاقين العامين: goo.gl/maps وg.co/kgs. */
export const SHORT_LINK_RULES = Object.freeze([
  Object.freeze({ host: 'maps.app.goo.gl', path: '/' }), Object.freeze({ host: 'goo.gl', path: '/maps' }), Object.freeze({ host: 'g.co', path: '/kgs' }),
]);
/** يعيد الرابط القصير مطبّعًا (https، بلا بيانات اعتماد ولا منفذ) إن كان من النطاقات الثلاثة، وإلا null. */
export function normalizeShortLink(raw) {
  let u; try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase(), rule = SHORT_LINK_RULES.find(r => r.host === host);
  if (!rule || !(u.pathname === rule.path || u.pathname.startsWith(rule.path === '/' ? '/' : rule.path + '/')) || u.pathname === '/') return null;
  u.protocol = 'https:'; u.hash = '';
  return u.toString();
}

const MSG = {
  empty: 'الصق رابط الموقع أو الإحداثيات (مثل 24.7136, 46.6753) أو اكتب اسم الحي أو العنوان.',
  range: 'الإحداثيات خارج النطاق الذي تعرضه الخريطة (خط العرض بين -85 و85، والطول بين -180 و180). تأكد من ترتيب الرقمين.',
  zero: 'الإحداثيات 0, 0 تقع في عرض المحيط الأطلسي وغالبًا تعني موقعًا غير محدد. الصق إحداثيات أرضك الفعلية.',
  unknown: 'لم أفهم هذا المدخل. جرّب إحداثيات مثل 24.7136, 46.6753 أو رابطًا من خرائط Google أو اسم الحي والمدينة.',
  noCoords: 'لم أجد إحداثيات في هذا الرابط. افتح الموقع في خرائط Google وانسخ رابط المشاركة أو الإحداثيات (اضغط مطولًا على الموقع).',
  national: code => `تعرّفت على العنوان الوطني المختصر (${code}) لكن خدمة العنوان الوطني غير مفعّلة حاليًا. استخدم رابط الموقع من خرائط Google أو الإحداثيات، أو اكتب اسم الحي والمدينة.`,
  long: 'المدخل أطول من المعقول. الصق الرابط أو الإحداثيات فقط.',
};
const r6 = v => Math.round(v * 1e6) / 1e6;
export const formatCoord = v => String(+v.toFixed(6));
const pairText = (lat, lng) => `${formatCoord(lat)}, ${formatCoord(lng)}`;
const norm = s => String(s ?? '').replace(/[٠-٩]/g, c => c.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 0x06F0).replace(/[٫]/g, '.').replace(/[،؛]/g, m => (m === '،' ? ',' : ';')).replace(/[٬]/g, ',');

function good(lat, lng, kind, label, extra = {}) {
  if (!validLatLng(lat, lng) || Math.abs(lat) > 90) return { ok: false, reason: 'range', message: MSG.range };
  if (lat === 0 && lng === 0) return { ok: false, reason: 'zero', message: MSG.zero };
  const p = { lat: r6(lat), lng: r6(lng) };
  return { ok: true, ...p, kind, source: kind, inSaudi: inSaudi(p.lat, p.lng), understood: `${label}: ${pairText(p.lat, p.lng)}`, ...extra };
}

// ---------------------------------------------------------------------------------------------- إحداثيات
const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const HEM_AR = [[/شمالا|شمالاً|شمال/g, 'N'], [/جنوبا|جنوباً|جنوب/g, 'S'], [/شرقا|شرقاً|شرق/g, 'E'], [/غربا|غرباً|غرب/g, 'W']];
function prep(text) {
  let t = norm(text).replace(/[º˚]/g, '°').replace(/[′ʹ’‘`´]/g, "'").replace(/[″”“]/g, '"').replace(/''/g, '"');
  for (const [re, l] of HEM_AR) t = t.replace(re, ` ${l} `);
  return t.replace(/\s+/g, ' ').trim();
}
const sign = h => (h && /[SW]/i.test(h) ? -1 : 1);
/** يجمع مكوّنين {value, hem} إلى (lat, lng) بحسب حرفي الاتجاه إن وُجدا، وإلا الأول خط العرض. */
function assign(a, b) {
  const ha = a.hem?.toUpperCase(), hb = b.hem?.toUpperCase();
  const isLat = h => h === 'N' || h === 'S', isLng = h => h === 'E' || h === 'W';
  if ((ha && !hb) || (!ha && hb)) return null; // حرف اتجاه واحد فقط: غامض
  if (ha && hb) {
    if (isLat(ha) && isLng(hb)) return { lat: a.value * sign(ha), lng: b.value * sign(hb) };
    if (isLng(ha) && isLat(hb)) return { lat: b.value * sign(hb), lng: a.value * sign(ha) };
    return null;
  }
  return { lat: a.value, lng: b.value };
}
const dmsVal = (d, m = 0, s = 0) => Number(d) + Number(m) / 60 + Number(s) / 3600;

/** يحاول قراءة النص كله كإحداثيات؛ يعيد { lat, lng, how } أو null أو { bad:true }. */
function readCoordinates(text) {
  const t = prep(text);
  let m;
  // درجات ودقائق وثوانٍ بالرموز: 24°42'49.0"N 46°40'31.1"E
  const D = '(?:([NSEW])\\s*)?(-?\\d{1,3})\\s*°\\s*(\\d{1,2})\\s*\'\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*"?\\s*([NSEW])?';
  if ((m = t.match(new RegExp(`^\\(?\\s*${D}\\s*[,;/]?\\s*${D}\\s*\\)?$`, 'i')))) {
    const mk = (pre, d, mi, s, suf) => ({ value: Math.sign(Number(d) || 1) * dmsVal(Math.abs(d), mi, s), hem: pre || suf });
    if ((m[1] && m[5]) || (m[6] && m[10])) return { bad: true };
    const r = assign(mk(m[1], m[2], m[3], m[4], m[5]), mk(m[6], m[7], m[8], m[9], m[10])); if (r) return { ...r, how: 'dms' };
    return { bad: true };
  }
  // درجات ودقائق عشرية: 24°42.8'N 46°40.5'E
  const DM = '(?:([NSEW])\\s*)?(-?\\d{1,3})\\s*°\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*\'\\s*([NSEW])?';
  if ((m = t.match(new RegExp(`^\\(?\\s*${DM}\\s*[,;/]?\\s*${DM}\\s*\\)?$`, 'i')))) {
    const mk = (pre, d, mi, suf) => ({ value: Math.sign(Number(d) || 1) * dmsVal(Math.abs(d), mi), hem: pre || suf });
    const r = assign(mk(m[1], m[2], m[3], m[4]), mk(m[5], m[6], m[7], m[8])); if (r) return { ...r, how: 'dms' };
    return { bad: true };
  }
  // 24 42 49 N 46 40 31 E (مسافات فقط)
  if ((m = t.match(/^(\d{1,3}) (\d{1,2}) (\d{1,2}(?:\.\d+)?) ?([NSEW]),? ?(\d{1,3}) (\d{1,2}) (\d{1,2}(?:\.\d+)?) ?([NSEW])$/i))) {
    const r = assign({ value: dmsVal(m[1], m[2], m[3]), hem: m[4] }, { value: dmsVal(m[5], m[6], m[7]), hem: m[8] }); if (r) return { ...r, how: 'dms' };
    return { bad: true };
  }
  // عشري مع حرف الاتجاه قبل الرقم: N24.7136 E46.6753
  if ((m = t.match(/^\(?\s*([NSEW]) ?(\d{1,3}(?:\.\d+)?) ?°?,? ?([NSEW]) ?(\d{1,3}(?:\.\d+)?) ?°?\s*\)?$/i))) {
    const r = assign({ value: Number(m[2]), hem: m[1] }, { value: Number(m[4]), hem: m[3] }); if (r) return { ...r, how: 'decimal' };
    return { bad: true };
  }
  // عشري مع حرف الاتجاه بعد الرقم: 24.7136 N, 46.6753 E أو 24.7136°N
  if ((m = t.match(/^\(?\s*(\d{1,3}(?:\.\d+)?) ?°? ?([NSEW]),? ?(\d{1,3}(?:\.\d+)?) ?°? ?([NSEW])\s*\)?$/i))) {
    const r = assign({ value: Number(m[1]), hem: m[2] }, { value: Number(m[3]), hem: m[4] }); if (r) return { ...r, how: 'decimal' };
    return { bad: true };
  }
  // «lat: 24.7 lng: 46.6» / «lat=..., lon=...»
  if ((m = t.match(new RegExp(`^lat(?:itude)?\\s*[:=]?\\s*${NUM}\\s*[,;]?\\s*(?:lng|lon|long|longitude)\\s*[:=]?\\s*${NUM}$`, 'i')))) return { lat: Number(m[1]), lng: Number(m[2]), how: 'decimal' };
  // فاصلة عشرية أوروبية بمسافة بين الرقمين: 24,7136 46,6753
  if ((m = t.match(/^(-?\d{1,3}),(\d+) (-?\d{1,3}),(\d+)$/))) return { lat: Number(`${m[1]}.${m[2]}`), lng: Number(`${m[3]}.${m[4]}`), how: 'decimal' };
  // عشري بسيط: 24.7136, 46.6753 | 24.7136 46.6753 | (24.7136;46.6753) | 24.7136°, 46.6753°
  if ((m = t.match(new RegExp(`^\\(?\\s*${NUM}\\s*°?\\s*(?:[,;/]\\s*|\\s+)\\+?${NUM}\\s*°?\\s*\\)?$`)))) return { lat: Number(m[1]), lng: Number(m[2]), how: 'decimal' };
  return null;
}
function fromCoordinates(c) {
  if (c.bad) return { ok: false, reason: 'ambiguous', message: 'لم أفهم اتجاهات الإحداثيات. اكتب خط العرض ثم خط الطول، مثل: 24.7136 N 46.6753 E.' };
  let { lat, lng } = c, swapped = false;
  if (c.how === 'decimal' && !inSaudi(lat, lng) && inSaudi(lng, lat)) { [lat, lng] = [lng, lat]; swapped = true; } // الطول أولًا
  return good(lat, lng, c.how === 'dms' ? 'dms' : 'coords', swapped ? 'قرأت الرقمين بترتيب (الطول، العرض) وصحّحته' : c.how === 'dms' ? 'فهمت إحداثيات بالدرجات والدقائق والثواني' : 'فهمت إحداثيات', { swapped });
}

// ---------------------------------------------------------------------------------------------- Plus Code
const PLUS_RE = new RegExp(`(?:^|[\\s,،(])([${ALPHABET}0]{2,8}\\+[${ALPHABET}]{0,7})(?=$|[\\s,،)])`, 'i');
const arNorm = s => s.toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/^مدينه\s+/, '').replace(/^ال/, '').trim();
const EN_ALIASES = { makkah: ['mecca', 'makkah', 'mekka'], madinah: ['medina', 'madinah', 'madina'], khobar: ['khobar', 'al khobar', 'alkhobar'], jeddah: ['jeddah', 'jedda', 'jiddah'], riyadh: ['riyadh', 'riyad'], dammam: ['dammam'], taif: ['taif'], abha: ['abha'], tabuk: ['tabuk'], hail: ['hail'], jazan: ['jazan', 'jizan'], najran: ['najran'], buraydah: ['buraydah', 'buraidah'] };
/** مدينة رئيسية من القائمة المدمجة بالاسم (عربي أو إنجليزي)، أو null. هي مرجع Plus Code القصير بلا شبكة. */
export function cityFromText(text) {
  const t = arNorm(prep(text).replace(/[,،.]/g, ' ').replace(/\s+/g, ' ')); if (!t) return null;
  const words = t.split(' ');
  for (const c of ALL_CITIES) {
    const a = arNorm(c.ar), names = [a, c.id, ...(EN_ALIASES[c.id] || [])];
    if (names.some(n => t === n || words.includes(n) || (n.includes(' ') && t.includes(n)))) return c;
  }
  return null;
}
/**
 * يحلّل Plus Code. الكامل يُفك مباشرة. القصير يحتاج مرجعًا: مدينة مذكورة بجانبه، أو ref = { lat, lng } (مركز الخريطة)،
 * وإلا يعيد needs:'locality' ليبحث العميل عن اسم المنطقة (إن وُجد) أو يطلب منه ذكر المدينة.
 */
export function parsePlusCode(text, { ref = null } = {}) {
  const m = norm(text).match(PLUS_RE); if (!m) return null;
  const code = m[1].toUpperCase();
  if (!isValid(code)) return { ok: false, reason: 'plus-invalid', message: `الرمز ${code} ليس رمز فتح موقع (Plus Code) صالحًا. تأكد من الرمز كما يظهر في خرائط Google.` };
  const rest = norm(text).replace(m[0], ' ').replace(/[,،]/g, ' ').replace(/\s+/g, ' ').trim();
  if (isFull(code)) {
    const a = decode(code);
    return good(a.latCenter, a.lngCenter, 'plus-code', 'فهمت رمز فتح الموقع (Plus Code)', { code, precisionM: Math.round((a.latHi - a.latLo) * 111320) });
  }
  const city = rest ? cityFromText(rest) : null;
  const useRef = city ? { lat: city.lat, lng: city.lng, label: city.ar } : ref && validLatLng(ref.lat, ref.lng) ? { lat: ref.lat, lng: ref.lng, label: 'مركز الخريطة' } : null;
  if (!useRef) {
    if (rest) return { ok: false, needs: 'locality', kind: 'plus-short', code, locality: rest.slice(0, 80), understood: `فهمت رمز فتح موقع قصيرًا (${code}) قرب «${rest.slice(0, 40)}»؛ أبحث عن المنطقة أولًا` };
    return { ok: false, reason: 'plus-short', code, message: `الرمز ${code} قصير ويحتاج مدينة. اكتبه مع اسم المدينة (مثل ${code} الرياض) أو حرّك الخريطة إلى منطقتك ثم أعد اللصق.` };
  }
  return resolveShortPlus(code, useRef);
}
/** يكمل Plus Code قصيرًا بالنسبة إلى مرجع (lat, lng). */
export function resolveShortPlus(code, ref) {
  if (!isShort(code) || !validLatLng(ref?.lat, ref?.lng)) return { ok: false, reason: 'plus-invalid', message: MSG.unknown };
  const full = recoverNearest(code, ref.lat, ref.lng), a = decode(full);
  return good(a.latCenter, a.lngCenter, 'plus-code', `فهمت رمز فتح الموقع ${String(code).toUpperCase()} قرب ${ref.label || 'المرجع'}`, { code: full, shortCode: String(code).toUpperCase(), precisionM: Math.round((a.latHi - a.latLo) * 111320) });
}

// ---------------------------------------------------------------------------------------------- الروابط
const URL_RE = /(?:https?:\/\/|geo:)[^\s<>"']+|(?:www\.)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.apple\.com|openstreetmap\.org|osm\.org|google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})[^\s<>"']*/i;
const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.(?:com|[a-z]{2,3}|com?\.[a-z]{2})$/i;
const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
const pairIn = (s, re) => { const m = String(s ?? '').match(re); return m ? [Number(m[1]), Number(m[2])] : null; };
const PAIR = new RegExp(`^\\s*(?:loc:)?${NUM}\\s*,\\s*\\+?${NUM}\\s*$`);

export function parseUrl(raw, opts = {}) {
  let text = raw.trim();
  if (/^geo:/i.test(text)) { const p = pairIn(text, /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i); return p ? good(p[0], p[1], 'geo', 'فهمت رابط الموقع (geo)') : { ok: false, reason: 'no-coords', message: MSG.noCoords }; }
  text = text.replace(/[).,،؛;]+$/, '');
  const short = normalizeShortLink(text);
  if (short) return { ok: false, needs: 'resolve', kind: 'short-link', url: short, understood: 'فهمت رابط خرائط مختصرًا؛ أفتحه لأستخرج الموقع' };
  let u; try { u = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); } catch { return { ok: false, reason: 'no-coords', message: MSG.noCoords }; }
  const host = u.hostname.toLowerCase(), q = u.searchParams, path = dec(u.pathname), full = dec(u.href);
  const get = (...names) => { for (const n of names) { const v = q.get(n); if (v) return v; } return null; };
  const textOrNone = (label, name) => { const t = String(name || '').trim(); return t.length >= 2 ? { ok: false, needs: 'search', kind: 'text', query: t.slice(0, 120), understood: `${label}: لا يحمل إحداثيات، فأبحث عن «${t.slice(0, 60)}»` } : null; };
  let m;
  if (host === 'maps.apple.com' || host === 'maps.apple') {
    const p = pairIn(get('ll', 'coordinate', 'sll', 'center', 'daddr', 'q') || '', PAIR) ; if (p) return good(p[0], p[1], 'apple', 'فهمت رابط خرائط Apple');
    return textOrNone('رابط خرائط Apple', get('address', 'q', 'name')) || { ok: false, reason: 'no-coords', message: MSG.noCoords };
  }
  if (/(^|\.)openstreetmap\.org$|^osm\.org$/.test(host)) {
    let p = null;
    if (q.get('mlat') && q.get('mlon')) p = [Number(q.get('mlat')), Number(q.get('mlon'))];
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) return good(p[0], p[1], 'osm', 'فهمت رابط OpenStreetMap (الدبوس)');
    if ((m = u.hash.match(new RegExp(`map=\\d+/${NUM}/${NUM}`)))) return good(Number(m[1]), Number(m[2]), 'osm', 'فهمت رابط OpenStreetMap (مركز العرض)', { approx: true });
    if (q.get('lat') && q.get('lon')) return good(Number(q.get('lat')), Number(q.get('lon')), 'osm', 'فهمت رابط OpenStreetMap');
    return { ok: false, reason: 'no-coords', message: MSG.noCoords };
  }
  const isGoogle = GOOGLE_HOST.test(host) || /^maps\.google\./i.test(host), label = isGoogle ? 'فهمت رابط جوجل' : 'فهمت الرابط';
  // موضع الدبوس الفعلي أولًا: !3dLAT!4dLNG
  if ((m = full.match(new RegExp(`!3d${NUM}!4d${NUM}`)))) return good(Number(m[1]), Number(m[2]), 'google-pin', label);
  for (const key of ['q', 'query', 'destination', 'daddr', 'll', 'sll', 'center', 'saddr']) {
    const v = q.get(key); if (!v) continue; const p = pairIn(dec(v), PAIR); if (p) return good(p[0], p[1], 'google-query', label);
  }
  if ((m = path.match(new RegExp(`/(?:place|search|dir|maps)/(?:[^/]*/)*?${NUM},\\s*\\+?${NUM}(?:/|$|\\?)`))) && !/@/.test(m[0])) return good(Number(m[1]), Number(m[2]), 'google-place', label);
  if ((m = full.match(new RegExp(`@${NUM},${NUM}`)))) {
    const pn = path.match(/\/place\/([^/@]+)/);
    return good(Number(m[1]), Number(m[2]), 'google-view', label + ' (مركز عرض الخريطة)', { approx: true, ...(pn ? { name: dec(pn[1]).slice(0, 80) } : {}) });
  }
  // لا إحداثيات: اسم المكان إن وُجد يُبحث عنه (أو يكون رمز فتح موقع)
  const name = (path.match(/\/(?:place|search)\/([^/@]+)/) || [])[1] || get('q', 'query');
  if (name) { const t = dec(name); const plus = parsePlusCode(t, opts); if (plus && (plus.ok || plus.needs)) return plus; return textOrNone(label, t) || { ok: false, reason: 'no-coords', message: MSG.noCoords }; }
  return { ok: false, reason: 'no-coords', message: MSG.noCoords };
}

/** يستخرج إحداثيات من رابط نهائي (يستعمله الخادم بعد تتبع الاختصار): يعيد { lat, lng, approx } أو null. */
export function coordsFromUrl(raw) {
  const r = parseUrl(raw);
  return r.ok ? { lat: r.lat, lng: r.lng, approx: !!r.approx } : null;
}

// ---------------------------------------------------------------------------------------------- العنوان الوطني
export const NATIONAL_SHORT_RE = /^([A-Za-z]{4})\s?-?\s?(\d{4})$/;

/**
 * المحلّل الموحّد. opts.ref = { lat, lng } مركز الخريطة الحالي (يُستعمل لإكمال Plus Code قصير بلا مدينة).
 * ok:true → الموقع جاهز. ok:false مع needs: 'resolve' (رابط قصير: استدعِ /api/geo/resolve) أو 'search' (نص: ابحث) أو
 * 'locality' (Plus Code قصير مع اسم منطقة: ابحث عنها ثم resolveShortPlus) أو 'national-address' (غير مفعّل حاليًا).
 */
export function parseGeoInput(input, opts = {}) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty', message: MSG.empty };
  if (raw.length > 600) return { ok: false, reason: 'too-long', message: MSG.long };
  const urlMatch = norm(raw).match(URL_RE);
  if (urlMatch) return parseUrl(urlMatch[0], opts);
  const t = norm(raw).trim();
  const na = t.match(NATIONAL_SHORT_RE);
  if (na) { const code = (na[1] + na[2]).toUpperCase(); return { ok: false, needs: 'national-address', kind: 'national-address', code, reason: 'national-address-disabled', understood: `فهمت عنوانًا وطنيًا مختصرًا: ${code}`, message: MSG.national(code) }; }
  const plus = parsePlusCode(t, opts); if (plus) return plus;
  const c = readCoordinates(t); if (c) return fromCoordinates(c);
  if (/^[\d\s.,;:°'"+\-()NSEWnsew]+$/.test(t) && /\d/.test(t)) return { ok: false, reason: 'unknown', message: 'لم أفهم الإحداثيات. اكتبها هكذا: 24.7136, 46.6753 (خط العرض ثم خط الطول).' };
  if (t.length < 2) return { ok: false, reason: 'unknown', message: MSG.unknown };
  return { ok: false, needs: 'search', kind: 'text', query: raw.replace(/\s+/g, ' ').slice(0, 120), understood: `فهمت اسم مكان: «${raw.slice(0, 60)}»؛ أبحث عنه` };
}
export default { parseGeoInput, parsePlusCode, resolveShortPlus, parseUrl, coordsFromUrl, normalizeShortLink, cityFromText, formatCoord, SHORT_LINK_RULES };
