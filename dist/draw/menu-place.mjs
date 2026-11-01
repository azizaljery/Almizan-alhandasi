// (ملاحظات المعاينة 2026-10-31) موضع قائمة منسدلة داخل نافذة العرض — دالة نقية تُختبر بلا متصفح.
// btnRect: مستطيل الزر (left,right,top,bottom)، menuSize: {w,h}، vw/vh: النافذة. تُحاذى حافة القائمة اليمنى بحافة الزر اليمنى (RTL)،
// وإن خرجت يسارًا تُزاح لتبقى كاملة داخل النافذة بهامش pad؛ وتفتح فوق الزر إن لم يتسع تحته.
export function placeMenu(btnRect, menuSize, vw, vh, pad = 8) {
  const w = Math.min(menuSize.w, vw - 2 * pad), h = Math.min(menuSize.h, vh - 2 * pad);
  let left = btnRect.right - w; if (left < pad) left = Math.min(btnRect.left, vw - pad - w); left = Math.max(pad, Math.min(left, vw - pad - w));
  let top = btnRect.bottom + 4; if (top + h > vh - pad) top = Math.max(pad, btnRect.top - 4 - h);
  return { left: Math.round(left), top: Math.round(top), width: Math.round(w), maxHeight: Math.round(h) };
}
