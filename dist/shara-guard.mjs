// حارس رسائل شرعاء: يكشف أنماط حقن التعليمات وطلبات التسريب والتدمير قبل أي معالجة (محلية أو عند الخادم).
// منطق خالص مشترك بين المتصفح والخادم؛ لا يغيّر الرسالة، فقط يصنّفها ويعطي ردًّا آمنًا ثابتًا.
const norm = s => String(s || '').normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
const INJECT = [
  /(?:تجاهل|انس|الغ|اهمل|تخط)(?:ي)?\s.*(?:تعليمات|توجيهات|ما سبق|السابق|القواعد|قيود)/,
  /(?:اكشف|اظهر|اطبع|اعرض|اكتب|قول|قولي|ارسل|ارسلي)(?:ي)?\s.*(?:تعليمات (?:ال)?نظام|البرومبت|prompt|التعليمات (?:ال)?(?:داخليه|الاصليه|السريه))/,
  /تعليمات (?:ال)?نظام/, /system\s*(?:prompt|message|:)/, /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)/, /reveal\s+.*(?:key|prompt|instruction)/, /developer\s*mode|jailbreak|\bdan\b/,
  /(?:المفتاح|مفتاح)\s*(?:ال)?(?:سري|api)|api[\s_-]*key|\bsecret\b.*\bkey\b|anthropic_api_key/,
  /(?:انت|انتي)\s+(?:الان|هسه|حاليا)\s+(?:مساعد|روبوت|نموذج|بلا|حر)|you\s+are\s+now\b|act\s+as\b|pretend\s+(?:to\s+be|you)/,
];
const EXFIL = /(?:ارسل|ارسلي|شارك|ابعث|ابعثي|حول|حولي|اعط|اعطي|سلم|سلمي)(?:ي)?\s.*(?:بيانات|معلومات|تصميم|ارقام|اسرار|محادث).*(?:رابط|https?:|www\.|بريد|ايميل|@)|https?:\/\/\S+.*(?:ارسل|ابعث|شارك|ارفع)|(?:ارسل|ابعث|شارك|ارفع)\S*.*https?:\/\//;
const WIPE = /(?:احذف|امسح|الغ|دمر|شيل)(?:ي)?\s+(?:ال)?(?:تصميم|جلسه|بياناتي|كل شي|كل شيء)\s+(?:كله|كامل|كاملا|بالكامل|ال(?:مخزن|محفوظ))?/;
/** { kind: 'inject'|'exfil'|'wipe', } أو null. الأمر الصريح لحذف التصميم كله لا ينفذه المحرك من المحادثة. */
export function guardKind(text) {
  const t = norm(text);
  if (INJECT.some(re => re.test(t))) return 'inject';
  if (EXFIL.test(t)) return 'exfil';
  if (WIPE.test(t) && /(?:كله|كامل|بالكامل|بياناتي|الجلسه|كل شي)/.test(t)) return 'wipe';
  return null;
}
const REPLIES = {
  inject: 'لا أستطيع تجاهل تعليماتي ولا كشفها ولا تغيير دوري؛ أنا هنا لمساعدتك في تصميم بيتك والاشتراطات والكميات. اسألني عن مساحة غرفة أو درجة التصميم أو الارتدادات، أو اطلب تعديلًا على مخططك.',
  exfil: 'لا أرسل بياناتك أو تصميمك إلى أي رابط أو جهة، ولا أفتح الروابط. تصميمك يبقى في متصفحك؛ إن أردت نسخة منه فمكانها المخططات وجدول الكميات.',
  wipe: 'لا أحذف تصميمك كله من المحادثة. إن أردت بداية جديدة قل «ابي تصميم مختلف» فأعرض لك توزيعًا آخر دون أن أفقدك ما سبق، أو ابدأ من صفحة الأرض.',
};
export const guardReply = kind => REPLIES[kind] || REPLIES.inject;

// ------------------------------------------------------------------------------------------------ أدوات خالصة مشتركة
const SPLIT_BEFORE = /\s+و(?=(?:كم|وين|فين|اين|ليش|ليه|لماذا|هل|وش|ايش|كيف|مساح[ةه]|ابعاد|مقاس|درج[ةه]|عدد|نسب[ةه]|كبر|صغر|وسع|ضيق|خل|غير|حط|انقل)\S*)/;
const LEAD = /^و\s*(?=(?:كم|وين|فين|اين|ليش|ليه|لماذا|هل|وش|ايش|كيف|مساح|ابعاد|مقاس|درج|عدد|نسب))/;
/** يفكّك الرسالة إلى أجزاء بعلامة الاستفهام وبـ «و» قبل أداة سؤال أو فعل طلب. أقل من جزأين ← null. */
export function splitParts(text) {
  const src = String(text || '').replace(/[ً-ٰٟـ]/g, '').trim();
  const parts = src.split(/[؟?]+/).flatMap(seg => seg.split(SPLIT_BEFORE)).map(x => x.trim().replace(LEAD, '').replace(/^[،,؛;.]+|[،,؛;.]+$/g, '').trim()).filter(Boolean);
  return parts.length >= 2 ? parts : null;
}
const r2 = v => Math.round(v * 100) / 100;
/** مجاميع الأدوار من جدول الفراغات نفسه: صافي مساحات الفراغات المسجلة (لا مسطح البناء الذي يشمل الجدران). */
export function levelTotals(rooms) {
  const by = new Map();
  for (const r of rooms || []) { const e = by.get(r.level) || { level: r.level, count: 0, sum: 0 }; e.count++; e.sum += Number(r.area) || 0; by.set(r.level, e); }
  return [...by.values()].map(e => ({ level: e.level, count: e.count, net: r2(e.sum) }));
}
export default { guardKind, guardReply, splitParts, levelTotals };
