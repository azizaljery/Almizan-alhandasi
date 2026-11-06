// دوال نقية صغيرة لعرض الحقول الناقصة: قيمة مفقودة لا تظهر كـ«null» أو «NaN»، وأخطاء الأرض تُربط بحقولها، والتكلفة قبل تسعير أي بند لا تُعرض كصفر.

export const MISSING_AR = '—';
export const UNPRICED_TOTAL_AR = 'لم تُسعّر البنود بعد';

/** نص آمن لقيمة قد تكون ناقصة: null/undefined/NaN/فارغ تُعرض بالبديل (الافتراضي «—»). */
export function displayOr(value, fallback = MISSING_AR) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
  const text = String(value).trim();
  return text === '' || text === 'null' || text === 'undefined' || text === 'NaN' ? fallback : text;
}

/** التكلفة «غير مسعّرة» حتى يدخل العميل سعر وحدة واحدًا على الأقل؛ الإجمالي حينها ليس صفرًا بل حالة فارغة. */
export function isCostUnpriced(cost) {
  return !cost || !(Number(cost.pricedCount) > 0);
}

/**
 * أخطاء حقول الأرض قبل المتابعة، كل خطأ مرتبط بحقله:
 * الطول والعرض (بين 8 و100 م)، والشوارع، والمدخل. يُرجع null للحقل السليم.
 */
export function landFieldErrors(raw = {}) {
  const dimension = (value, label) => {
    const n = value === '' || value === null || value === undefined ? NaN : Number(value);
    return Number.isFinite(n) && n >= 8 && n <= 100 ? null : `أدخل ${label} بالمتر، بين 8 و100.`;
  };
  const hasStreet = Array.isArray(raw.streets) && raw.streets.length > 0;
  const hasEntry = Array.isArray(raw.entries) && raw.entries.length > 0;
  return {
    length: dimension(raw.length, 'طول الأرض'),
    width: dimension(raw.width, 'عرض الأرض'),
    streets: hasStreet ? null : 'اختر شارعًا واحدًا على الأقل من الجهات المطلّة على شارع.',
    entries: !hasStreet || hasEntry ? null : 'اختر جهة المدخل من الجهات المطلّة على الشارع.',
  };
}

export function hasLandErrors(errors) {
  return Object.values(errors).some(Boolean);
}
