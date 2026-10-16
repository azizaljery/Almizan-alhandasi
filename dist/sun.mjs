// موضع الشمس التقريبي (ارتفاع واتجاه) من خط العرض ويوم السنة والتوقيت الشمسي.
// معادلات فلكية تقريبية شائعة: الميل الشمسي بصيغة كوبر (Cooper 1969) وزاوية الساعة 15° لكل ساعة.
// دقتها في حدود بضع درجات؛ لا تُستعمل لدراسة إظلال معتمدة.
const D = Math.PI / 180;

/** خطوط عرض تقريبية لمدن سعودية (لاختيار المستخدم؛ موقع الأرض الفعلي غير معروف للتطبيق). */
export const CITIES = Object.freeze({
  riyadh: { ar: 'الرياض', lat: 24.7 }, jeddah: { ar: 'جدة', lat: 21.5 }, makkah: { ar: 'مكة المكرمة', lat: 21.4 },
  madinah: { ar: 'المدينة المنورة', lat: 24.5 }, dammam: { ar: 'الدمام', lat: 26.4 }, abha: { ar: 'أبها', lat: 18.2 }, tabuk: { ar: 'تبوك', lat: 28.4 }, hail: { ar: 'حائل', lat: 27.5 },
});

/** { altitudeDeg, azimuthDeg (من الشمال باتجاه عقارب الساعة), declinationDeg } */
export function sunPosition({ latitudeDeg, dayOfYear, solarHour }) {
  const decl = 23.45 * Math.sin(D * (360 / 365) * (284 + dayOfYear));
  const H = 15 * (solarHour - 12), phi = latitudeDeg * D, d = decl * D, h = H * D;
  const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  let az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)) / D + 180;
  az = ((az % 360) + 360) % 360;
  return { altitudeDeg: alt / D, azimuthDeg: az, declinationDeg: decl };
}

export default { sunPosition, CITIES };
