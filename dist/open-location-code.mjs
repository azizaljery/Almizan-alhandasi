// Open Location Code (Plus Codes): تنفيذ نقي بلا شبكة وبلا مكتبات، من مواصفة Google المنشورة:
// https://github.com/google/open-location-code/blob/main/Documentation/Specification/specification.md
// الأبجدية 20 رمزًا، الفاصل «+» بعد ثمانية أرقام، الحشو «0»، أزواج (خط عرض ثم طول) حتى 10 أرقام ثم شبكة 5×4 حتى 15.
// نتحقق منه في tests/open-location-code.test.mjs بقيم مرجعية من مستودع المواصفة (validityTests / shortCodeTests) وأمثلة معروفة.
export const ALPHABET = '23456789CFGHJMPQRVWX', SEP = '+', PAD = '0';
const SEP_POS = 8, PAIR_LEN = 10, MAX_LEN = 15, GRID_ROWS = 5, GRID_COLS = 4;
const LAT_UNITS = 25_000_000, LNG_UNITS = 8_192_000; // دقة 15 رقمًا: 1/2.5e7 و1/8.192e6 درجة
const PAIR_RES = [20, 1, 0.05, 0.0025, 0.000125];
const clip = v => Math.min(90, Math.max(-90, v));
const normLng = v => { while (v < -180) v += 360; while (v >= 180) v -= 360; return v; };

/** يرمّز موضعًا إلى رمز كامل بطول len (2..15، وأقل من 10 زوجي فقط). الافتراضي 10 (≈14 م). */
export function encode(lat, lng, len = 10) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new RangeError('invalid coordinates');
  if (len < 2 || len > MAX_LEN || (len < PAIR_LEN && len % 2 === 1)) throw new RangeError('invalid length');
  lat = clip(lat); lng = normLng(lng);
  let latV = Math.floor(Math.round((lat + 90) * LAT_UNITS * 1e6) / 1e6), lngV = Math.floor(Math.round((lng + 180) * LNG_UNITS * 1e6) / 1e6);
  if (latV >= 180 * LAT_UNITS) latV = 180 * LAT_UNITS - 1; // القطب الشمالي يقع في الخلية الأخيرة
  let code = '';
  for (let i = 0; i < MAX_LEN - PAIR_LEN; i++) { code = ALPHABET[(latV % GRID_ROWS) * GRID_COLS + (lngV % GRID_COLS)] + code; latV = Math.floor(latV / GRID_ROWS); lngV = Math.floor(lngV / GRID_COLS); }
  let pairs = '';
  for (let i = 0; i < PAIR_LEN / 2; i++) { pairs = ALPHABET[latV % 20] + ALPHABET[lngV % 20] + pairs; latV = Math.floor(latV / 20); lngV = Math.floor(lngV / 20); }
  const all = pairs + code;
  if (len >= PAIR_LEN) return all.slice(0, SEP_POS) + SEP + all.slice(SEP_POS, len);
  return all.slice(0, len).padEnd(SEP_POS, PAD) + SEP;
}

const clean = c => (typeof c === 'string' ? c.trim().toUpperCase() : '');
/** صالح (كامل أو قصير) بحسب المواصفة. */
export function isValid(code) {
  code = clean(code); if (!code) return false;
  const i = code.indexOf(SEP);
  if (i === -1 || i !== code.lastIndexOf(SEP) || i > SEP_POS || i % 2 === 1) return false;
  if (code.length === 1) return false;
  if (code.length - i - 1 === 1) return false; // رقم واحد بعد الفاصل غير مسموح
  const padAt = code.indexOf(PAD);
  if (padAt !== -1) {
    if (i < SEP_POS || padAt === 0) return false;
    const m = code.match(/(0+)/g); if (m.length > 1 || m[0].length % 2 === 1 || m[0].length > SEP_POS - 2) return false;
    if (code.slice(i + 1).length > 0) return false; // لا شيء بعد الفاصل مع الحشو
    if (padAt + m[0].length !== i) return false; // الحشو متصل بالفاصل
  }
  if (code.length - i - 1 > MAX_LEN - SEP_POS) return false;
  for (const ch of code) if (ch !== SEP && ch !== PAD && !ALPHABET.includes(ch)) return false;
  if (i === SEP_POS) { // كامل: حدود خط العرض والطول
    if (ALPHABET.indexOf(code[0]) > 8) return false;
    if (code.length > 1 && ALPHABET.indexOf(code[1]) > 17) return false;
  }
  return true;
}
export const isShort = code => isValid(code) && clean(code).indexOf(SEP) < SEP_POS;
export const isFull = code => isValid(code) && clean(code).indexOf(SEP) === SEP_POS;

/** يفك الرمز الكامل إلى مستطيل: { latLo, lngLo, latHi, lngHi, latCenter, lngCenter, length }. */
export function decode(code) {
  if (!isFull(code)) throw new RangeError('not a full code');
  const digits = clean(code).replace(SEP, '').replace(/0+$/, '').slice(0, MAX_LEN), len = digits.length;
  let latP = 0, lngP = 0;
  for (let i = 0; i < PAIR_LEN; i += 2) { latP = latP * 20 + (i < len ? ALPHABET.indexOf(digits[i]) : 0); lngP = lngP * 20 + (i + 1 < len ? ALPHABET.indexOf(digits[i + 1]) : 0); }
  let latG = 0, lngG = 0;
  for (let i = PAIR_LEN; i < MAX_LEN; i++) { const d = i < len ? ALPHABET.indexOf(digits[i]) : 0; latG = latG * GRID_ROWS + Math.floor(d / GRID_COLS); lngG = lngG * GRID_COLS + (d % GRID_COLS); }
  const latLo = (latP * 3125 + latG) / LAT_UNITS - 90, lngLo = (lngP * 1024 + lngG) / LNG_UNITS - 180;
  let latH, lngH;
  if (len <= PAIR_LEN) latH = lngH = PAIR_RES_FOR(len);
  else { const g = len - PAIR_LEN; latH = 1 / 8000 / GRID_ROWS ** g; lngH = 1 / 8000 / GRID_COLS ** g; }
  const latHi = Math.min(90, latLo + latH), lngHi = lngLo + lngH;
  return { latLo, lngLo, latHi, lngHi, latCenter: Math.min(90, (latLo + latHi) / 2), lngCenter: (lngLo + lngHi) / 2, length: len };
}
const PAIR_RES_FOR = len => 20 ** (2 - len / 2);

/** يعيد الرمز الكامل الأقرب إلى (lat, lng) لرمز قصير (حسب المواصفة: recoverNearest). */
export function recoverNearest(short, lat, lng) {
  if (isFull(short)) return clean(short);
  if (!isShort(short)) throw new RangeError('not a short code');
  short = clean(short); lat = clip(lat); lng = normLng(lng);
  const padLen = SEP_POS - short.indexOf(SEP), res = 20 ** (2 - padLen / 2), half = res / 2;
  const prefix = encode(lat, lng).slice(0, padLen), area = decode(prefix + short);
  let latC = area.latCenter, lngC = area.lngCenter;
  if (lat + half < latC && latC - res >= -90) latC -= res; else if (lat - half > latC && latC + res <= 90) latC += res;
  if (lng + half < lngC) lngC -= res; else if (lng - half > lngC) lngC += res;
  return encode(latC, lngC, area.length);
}
/** يقصّر رمزًا كاملًا بالنسبة لموضع مرجعي (حتى 6 أرقام)؛ يعيده كما هو إن تعذّر. */
export function shorten(code, lat, lng) {
  if (!isFull(code)) throw new RangeError('not a full code');
  code = clean(code); if (code.includes(PAD)) throw new RangeError('padded code');
  lat = clip(lat); lng = normLng(lng);
  const a = decode(code), range = Math.max(Math.abs(a.latCenter - lat), Math.abs(a.lngCenter - lng));
  for (let i = PAIR_RES.length - 2; i >= 1; i--) if (range < PAIR_RES[i] * 0.3) return code.slice((i + 1) * 2);
  return code;
}
export default { encode, decode, isValid, isShort, isFull, recoverNearest, shorten, ALPHABET };
