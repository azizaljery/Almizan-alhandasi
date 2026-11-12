// موضع الشمس التقريبي (ارتفاع واتجاه) من خط العرض ويوم السنة والتوقيت الشمسي، ومعه: مسار اليوم، الشروق والغروب،
// وتحويل التوقيت الشمسي إلى ساعة المملكة من خط الطول (معادلة الزمن).
// معادلات فلكية تقريبية شائعة: الميل الشمسي بصيغة كوبر (Cooper 1969)، زاوية الساعة 15° لكل ساعة، ومعادلة الزمن بصيغة Spencer المختصرة.
// دقتها في حدود درجة أو درجتين؛ لا تُستعمل لدراسة إظلال معتمدة.
// الموقع: من أرض العميل على الخريطة إن حدّدها (GEO_KEY في المتصفح)، وإلا من مدينته، وإلا مدينة يختارها.
import { GEO_KEY, normalizeGeo } from './geo-land.mjs';
const D = Math.PI / 180;

/** موقع أرض العميل المحفوظ في المتصفح (إن حدّده على الخريطة أو اختار مدينته). بلا متصفح أو بلا تحديد: null. */
export function storedSite(store = globalThis.localStorage) {
  try { return normalizeGeo(JSON.parse(store?.getItem(GEO_KEY) || 'null')); } catch { return null; }
}
const site = storedSite();
/**
 * خطوط عرض تقريبية لمدن سعودية. إن حدّد العميل أرضه على الخريطة (أو اختار مدينتها) يتقدّم «موقع أرضك» القائمة،
 * فيبدأ به كل ما يعرض هذه القائمة (ومنه منزلق الشمس في المجسم) بلا تعديل فيه.
 */
export const CITIES = Object.freeze({
  ...(site ? { site: { ar: site.source === 'map' ? 'موقع أرضك على الخريطة' : `مدينة أرضك: ${site.cityName}`, lat: Math.round(site.lat * 100) / 100, lng: site.lng, site: true } } : {}),
  riyadh: { ar: 'الرياض', lat: 24.7 }, jeddah: { ar: 'جدة', lat: 21.5 }, makkah: { ar: 'مكة المكرمة', lat: 21.4 },
  madinah: { ar: 'المدينة المنورة', lat: 24.5 }, dammam: { ar: 'الدمام', lat: 26.4 }, abha: { ar: 'أبها', lat: 18.2 }, tabuk: { ar: 'تبوك', lat: 28.4 }, hail: { ar: 'حائل', lat: 27.5 },
});

export const declination = dayOfYear => 23.45 * Math.sin(D * (360 / 365) * (284 + dayOfYear));
/** { altitudeDeg, azimuthDeg (من الشمال باتجاه عقارب الساعة), declinationDeg } */
export function sunPosition({ latitudeDeg, dayOfYear, solarHour }) {
  const decl = declination(dayOfYear);
  const H = 15 * (solarHour - 12), phi = latitudeDeg * D, d = decl * D, h = H * D;
  const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  let az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)) / D + 180;
  az = ((az % 360) + 360) % 360;
  return { altitudeDeg: alt / D, azimuthDeg: az, declinationDeg: decl };
}

/** أيام مرجعية من السنة (الاعتدالان بحسب صيغة كوبر التي يصفّر ميلها يومي 81 و264، بفارق يوم أو يومين عن التقويم). */
export const DAYS = Object.freeze({ marchEquinox: 81, juneSolstice: 172, septemberEquinox: 264, decemberSolstice: 355 });
/** الشروق والغروب بالتوقيت الشمسي (مركز القرص على الأفق، بلا انكسار): { sunrise, sunset, dayLength } بالساعات. */
export function sunriseSunset(latitudeDeg, dayOfYear) {
  const x = -Math.tan(latitudeDeg * D) * Math.tan(declination(dayOfYear) * D);
  if (x >= 1) return { sunrise: null, sunset: null, dayLength: 0 };
  if (x <= -1) return { sunrise: 0, sunset: 24, dayLength: 24 };
  const half = Math.acos(x) / D / 15;
  return { sunrise: 12 - half, sunset: 12 + half, dayLength: 2 * half };
}
/** مسار الشمس ليوم: نقاط فوق الأفق من الشروق إلى الغروب بخطوة stepHours (توقيت شمسي). */
export function sunPath(latitudeDeg, dayOfYear, stepHours = 0.25) {
  const { sunrise, sunset } = sunriseSunset(latitudeDeg, dayOfYear), out = [];
  if (sunrise === null) return out;
  for (let t = sunrise; t < sunset; t += stepHours) out.push({ solarHour: t, ...sunPosition({ latitudeDeg, dayOfYear, solarHour: t }) });
  out.push({ solarHour: sunset, ...sunPosition({ latitudeDeg, dayOfYear, solarHour: sunset }) });
  return out;
}
/** معادلة الزمن بالدقائق (Spencer 1971 مختصرة): الفرق بين التوقيت الشمسي الظاهري والمتوسط. */
export function equationOfTime(dayOfYear) {
  const B = 2 * Math.PI * (dayOfYear - 81) / 364;
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}
/** التوقيت الشمسي ← ساعة المملكة (UTC+3، خط الزوال المرجعي 45° شرقًا). */
export function solarToClock(solarHour, longitudeDeg, dayOfYear, tzHours = 3) {
  return solarHour - equationOfTime(dayOfYear) / 60 - (longitudeDeg - 15 * tzHours) / 15;
}
export const clockText = h => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
/** اليوم الخامس عشر من كل شهر (1..12) كرقم يوم في السنة. */
export const monthDay = month => [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][Math.max(1, Math.min(12, month)) - 1];
export const MONTHS_AR = Object.freeze(['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']);

export default { sunPosition, CITIES, declination, sunriseSunset, sunPath, equationOfTime, solarToClock, storedSite, DAYS };
