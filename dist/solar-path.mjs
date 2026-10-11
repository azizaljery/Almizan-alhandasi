// An illustrative solar-hour preview, not a verified site/time calculation. It is deliberately separate from the
// layout engine: it describes sky position only and does not claim to model
// neighbouring buildings, terrain, glazing, or actual shading.
const radians = degrees => degrees * Math.PI / 180;
const degrees = radians => radians * 180 / Math.PI;
const unavailable = reason => ({ status: 'not-calculated', reason, visible: false, altitude: null, azimuth: null, shadowLength: null, declination: null, wallHeight: null, provenance: { locationKnown: false, northKnown: false, timeBasis: null }, disclaimer: 'لم تُحسب شمس الموقع؛ يلزم موقع وشمال وتاريخ ووقت ومنطقة زمنية موثقة ومحرك حساب يدعمها.' });

export function solarPreview({ latitude, month = 6, hour = 12, wallHeight = 3.2, mode = 'example' } = {}) {
  if (mode === 'site') return unavailable('SITE_CALCULATION_NOT_IMPLEMENTED');
  if (mode !== 'example') throw Error('وضع الشمس غير مدعوم.');
  if (latitude === undefined || latitude === null || latitude === '') return unavailable('MISSING_EXAMPLE_LATITUDE');
  if (!Number.isFinite(latitude) || latitude < -66 || latitude > 66) throw Error('أدخل خط عرض بين ‎-66° و66° لعرض المعاينة.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw Error('الشهر يجب أن يكون بين 1 و12.');
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) throw Error('الساعة يجب أن تكون بين 0 و24.');
  if (!Number.isFinite(wallHeight) || wallHeight <= 0) throw Error('ارتفاع الجدار يجب أن يكون أكبر من صفر.');

  // Representative day per month; adequate for an explanatory preview, not a
  // site-specific simulation or a substitute for a weather file.
  const day = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344][Math.round(month) - 1];
  const declination = 23.44 * Math.sin(radians((360 / 365) * (day - 81)));
  const hourAngle = 15 * (hour - 12);
  const lat = radians(latitude), dec = radians(declination), ha = radians(hourAngle);
  const altitude = degrees(Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)));
  const azimuth = (degrees(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat))) + 180 + 360) % 360;
  const visible = altitude > 0;
  const shadowLength = visible ? wallHeight / Math.tan(radians(altitude)) : null;
  return {
    status: 'approximate-example', reason: null, visible, altitude, azimuth, shadowLength, declination, wallHeight,
    provenance: { locationKnown: false, northKnown: false, timeBasis: 'solar-hour', latitude, month, hour, representativeDay: day, method: 'representative-day-declination', exclusions: ['longitude-clock-time-timezone', 'surveyed-north', 'terrain-neighbours', 'atmospheric-refraction'] },
    disclaimer: 'مثال تقريبي بخط العرض ويوم ممثل للشهر وساعة شمسية؛ ليس حسابًا موثقًا لشمس الموقع أو التوقيت المدني. الشمال في الرسم افتراضي.'
  };
}

export const monthName = month => ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][Math.round(month) - 1] || '—';

/** Unit direction toward sun and flat-ground displacement per metre of vertical
 * height. Model north maps to scene -Z; scene +Y is elevation. A surveyed north
 * offset, if independently supplied, rotates clockwise from model +north.
 * No display clipping, low-angle clamp, terrain, or occlusion is applied here.
 */
export function solarVectors(preview, { northOffsetDeg = 0 } = {}) {
  if (!Number.isFinite(northOffsetDeg)) throw Error('زاوية الشمال غير صالحة.');
  if (!preview || preview.status === 'not-calculated' || preview.altitude == null || preview.azimuth == null) return { visible: false, towardSun: null, world: null, shadowPerMeter: null };
  if (!Number.isFinite(preview.altitude) || Math.abs(preview.altitude) > 90 || !Number.isFinite(preview.azimuth)) throw Error('اتجاه الشمس غير صالح.');
  const alt = radians(preview.altitude), az = radians(preview.azimuth + northOffsetDeg);
  const towardSun = { east: Math.sin(az) * Math.cos(alt), north: Math.cos(az) * Math.cos(alt), up: Math.sin(alt) };
  const visible = preview.altitude > 0 && preview.visible !== false;
  return { visible, towardSun, world: { x: towardSun.east, y: towardSun.up, z: -towardSun.north }, shadowPerMeter: visible ? { east: -towardSun.east / towardSun.up, north: -towardSun.north / towardSun.up } : null };
}
