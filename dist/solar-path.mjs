// A small, location-aware solar preview. It is deliberately separate from the
// layout engine: it describes sky position only and does not claim to model
// neighbouring buildings, terrain, glazing, or actual shading.
const radians = degrees => degrees * Math.PI / 180;
const degrees = radians => radians * 180 / Math.PI;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function solarPreview({ latitude = 24.7136, month = 6, hour = 12, wallHeight = 3.2 } = {}) {
  if (!Number.isFinite(latitude) || latitude < -66 || latitude > 66) throw Error('أدخل خط عرض بين ‎-66° و66° لعرض المعاينة.');
  if (!Number.isFinite(month) || month < 1 || month > 12) throw Error('الشهر يجب أن يكون بين 1 و12.');
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
    visible,
    altitude: +altitude.toFixed(1),
    azimuth: +azimuth.toFixed(1),
    shadowLength: shadowLength === null ? null : +clamp(shadowLength, 0, 999).toFixed(1),
    declination: +declination.toFixed(1),
  };
}

export const monthName = month => ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][Math.round(month) - 1] || '—';
