// كشف مسار الواقع المعزز المتاح على هذا الجهاز دون افتراض: WebXR immersive-ar (Android/Chrome) أو Quick Look (iOS/iPadOS Safari)
// أو لا شيء (تُعرض رسالة عربية صادقة بما يمكن عمله). نقي قدر الإمكان: يستقبل navigator/document كمعاملات لتسهيل الاختبار.
export const AR_MODES = Object.freeze({ WEBXR: 'webxr', QUICKLOOK: 'quicklook', NONE: 'none' });

export const AR_MESSAGES = Object.freeze({
  insecure: 'الواقع المعزز يتطلب فتح الصفحة عبر اتصال آمن (HTTPS). افتح الموقع من عنوانه الرسمي، أو نزّل ملف GLB وافتحه في أي عارض ثلاثي الأبعاد.',
  ios: 'متصفحك لا يفتح الواقع المعزز مباشرة. على iPhone وiPad افتح هذه الصفحة في Safari (وليس داخل تطبيق آخر)، أو نزّل ملف GLB.',
  android: 'هذا المتصفح أو الجهاز لا يدعم الواقع المعزز عبر الويب. جرّب Chrome المحدَّث على هاتف Android يدعم خدمات Google Play للواقع المعزز (ARCore)، أو نزّل ملف GLB وافتحه في أي عارض.',
  desktop: 'الواقع المعزز يعمل من هاتف: افتح هذه الصفحة على هاتف Android (Chrome) أو على iPhone/iPad (Safari). ويمكنك هنا تنزيل ملف GLB وفتحه في أي عارض ثلاثي الأبعاد.',
  failed: 'تعذّر بدء جلسة الواقع المعزز على هذا الجهاز. تأكد من السماح للمتصفح باستعمال الكاميرا ثم أعد المحاولة، أو نزّل ملف GLB.',
});

const isIosLike = (ua, nav) => /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints || 0) > 1);

/**
 * @returns {Promise<{mode:string, platform:'ios'|'android'|'desktop', message:string}>}
 * message فارغة عند الدعم؛ وإلا نص عربي صادق. لا يحاول فتح أي جلسة (لا يطلب إذن الكاميرا).
 */
export async function detectArSupport({ navigator: nav = globalThis.navigator, document: doc = globalThis.document, isSecureContext = globalThis.isSecureContext } = {}) {
  const ua = nav?.userAgent || '', ios = isIosLike(ua, nav), android = /Android/i.test(ua);
  const platform = ios ? 'ios' : android ? 'android' : 'desktop';
  let ql = false;
  try { ql = !!doc?.createElement?.('a')?.relList?.supports?.('ar'); } catch { ql = false; }
  if (ql && ios) return { mode: AR_MODES.QUICKLOOK, platform, message: '' };
  if (isSecureContext === false) return { mode: AR_MODES.NONE, platform, message: AR_MESSAGES.insecure };
  let xr = false;
  try { xr = !!(nav?.xr && typeof nav.xr.isSessionSupported === 'function' && await nav.xr.isSessionSupported('immersive-ar')); } catch { xr = false; }
  if (xr) return { mode: AR_MODES.WEBXR, platform, message: '' };
  return { mode: AR_MODES.NONE, platform, message: AR_MESSAGES[platform] };
}

export default { AR_MODES, AR_MESSAGES, detectArSupport };
