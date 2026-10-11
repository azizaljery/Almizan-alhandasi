// Original implementation of NOAA/Meeus solar-position equations. See
// docs/SITE-SOLAR-SOURCES.md for primary references, attribution and limits.
const rad = value => value * Math.PI / 180;
const deg = value => value * 180 / Math.PI;
const wrap = (value, period) => ((value % period) + period) % period;
const clampUnit = value => Math.max(-1, Math.min(1, value));
function finite(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} غير صالح.`);
  return value;
}
function parseInstant(instant) {
  if (typeof instant !== 'string') throw new Error('يلزم وقت ISO مع Z أو إزاحة رقمية صريحة.');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(instant);
  if (!match) throw new Error('صيغة الوقت غير صالحة؛ يلزم ISO مع Z أو إزاحة رقمية.');
  const [, ys, mos, ds, hs, mins, ss = '0', fraction = '', offset] = match;
  const [year, month, day, hour, minute, second] = [ys, mos, ds, hs, mins, ss].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1901 || year > 2099 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) throw new Error('التاريخ أو الوقت غير صالح؛ النطاق 1901–2099 دون ثوانٍ كبيسة.');
  if (offset === '-00:00') throw new Error('الإزاحة -00:00 تعني منطقة زمنية مجهولة؛ استخدم إزاحة معلومة.');
  let offsetMinutes = 0;
  if (offset !== 'Z') {
    const hours = Number(offset.slice(1, 3)), minutes = Number(offset.slice(4));
    if (hours > 23 || minutes > 59) throw new Error('إزاحة الوقت غير صالحة.');
    offsetMinutes = (offset[0] === '-' ? -1 : 1) * (hours * 60 + minutes);
  }
  const milliseconds = Date.UTC(year, month - 1, day, hour, minute, second, Number(fraction.padEnd(3, '0'))) - offsetMinutes * 60000;
  const utc = new Date(milliseconds);
  if (utc.getUTCFullYear() < 1901 || utc.getUTCFullYear() > 2099) throw new Error('لحظة UTC خارج النطاق 1901–2099.');
  return { milliseconds, utc: utc.toISOString(), offsetMinutes };
}

/** Geometric sun centre, no atmospheric refraction/parallax/terrain model.
 * A is true north clockwise from plan +Y. This is a coordinate rotation,
 * not a claim that the caller's north/location was independently surveyed.
 */
export function calculateSiteSolar({ latitude, longitude, instant, northAngleDeg, wallHeight = 3.2, source } = {}) {
  finite(latitude, -90, 90, 'خط العرض'); finite(longitude, -180, 180, 'خط الطول');
  finite(northAngleDeg, -360, 360, 'زاوية الشمال');
  if (typeof wallHeight !== 'number' || !Number.isFinite(wallHeight) || wallHeight <= 0) throw new Error('ارتفاع الكتلة يجب أن يكون موجبًا.');
  const parsed = parseInstant(instant), jd = parsed.milliseconds / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const meanLongitude = wrap(280.46646 + t * (36000.76983 + .0003032 * t), 360);
  const meanAnomaly = 357.52911 + t * (35999.05029 - .0001537 * t);
  const eccentricity = .016708634 - t * (.000042037 + .0000001267 * t);
  const m = rad(meanAnomaly);
  const centre = Math.sin(m) * (1.914602 - t * (.004817 + .000014 * t)) + Math.sin(2*m) * (.019993 - .000101*t) + Math.sin(3*m) * .000289;
  const omega = 125.04 - 1934.136*t;
  const apparentLongitude = meanLongitude + centre - .00569 - .00478*Math.sin(rad(omega));
  const meanObliquity = 23 + (26 + (21.448 - t*(46.815 + t*(.00059 - t*.001813)))/60)/60;
  const obliquity = rad(meanObliquity + .00256*Math.cos(rad(omega)));
  const declinationRad = Math.asin(clampUnit(Math.sin(obliquity)*Math.sin(rad(apparentLongitude))));
  const y = Math.tan(obliquity/2)**2, l = rad(meanLongitude);
  const equationOfTime = 4*deg(y*Math.sin(2*l)-2*eccentricity*Math.sin(m)+4*eccentricity*y*Math.sin(m)*Math.cos(2*l)-.5*y*y*Math.sin(4*l)-1.25*eccentricity*eccentricity*Math.sin(2*m));
  const utcMinutes = wrap(parsed.milliseconds, 86400000)/60000;
  const hourAngle = wrap(utcMinutes + equationOfTime + 4*longitude, 1440)/4 - 180;
  const phi = rad(latitude), h = rad(hourAngle), d = declinationRad;
  const east = -Math.cos(d)*Math.sin(h);
  const north = Math.sin(d)*Math.cos(phi)-Math.cos(d)*Math.cos(h)*Math.sin(phi);
  const up = Math.sin(phi)*Math.sin(d)+Math.cos(phi)*Math.cos(d)*Math.cos(h);
  const horizontal = Math.hypot(east, north), altitude = deg(Math.atan2(up, horizontal));
  // Azimuth is indeterminate only at a numerically vertical vector. The vector
  // remains valid there; renderers must not turn off a zenith sun for null azimuth.
  const azimuth = horizontal < 1e-12 ? null : wrap(deg(Math.atan2(east, north)), 360);
  const a = rad(northAngleDeg), x = east*Math.cos(a)+north*Math.sin(a), planY = -east*Math.sin(a)+north*Math.cos(a);
  const visible = up > 0;
  const shadowPerMeter = visible ? { x: -x/up, y: -planY/up } : null;
  return {
    status: 'approximate-site', visible, altitude, azimuth, declination: deg(d), equationOfTime, hourAngle,
    wallHeight, shadowLength: visible ? wallHeight*horizontal/up : null,
    enu: { east, north, up }, plan: { x, y: planY, up }, world: { x, y: up, z: -planY }, shadowPerMeter,
    provenance: { method: 'NOAA-Meeus-geometric-v1', latitude, longitude, instant: parsed.utc, suppliedInstant: instant, offsetMinutes: parsed.offsetMinutes, northAngleDeg, source: typeof source === 'string' ? source.trim().slice(0, 160) : 'user-supplied', inputVerified: false, refraction: false, range: '1901–2099', exclusions: ['atmospheric-refraction', 'topocentric-parallax', 'terrain-neighbours', 'survey-verification', 'daylight-energy-certification'] },
    disclaimer: 'اتجاه شمسي هندسي تقريبي من الموقع والوقت والشمال المدخلة؛ صحة بيانات الموقع غير مثبتة، دون انكسار جوي أو تضاريس أو جوار، وليس اعتماد إنارة أو طاقة.'
  };
}
