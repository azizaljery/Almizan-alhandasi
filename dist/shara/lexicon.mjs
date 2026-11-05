// معجم الفراغات كما يذكرها العميل السعودي (فصحى ولهجة نجدية وحجازية) وأعدادها بالكلمات والمثنى والأرقام الهندية.
// نقي: لا DOM ولا شبكة. النص يُطبَّع أولًا بـ normalizeAr (requirements.mjs) فالأشكال هنا بلا همزات ولا تاء مربوطة.
import { normalizeAr } from '../requirements.mjs';

const AR = '\\u0620-\\u064A\\u066E-\\u06D5'; // حروف فقط (لا علامات ترقيم عربية مثل «،» و«؛»)
/** أداة ملتصقة قبل الكلمة: و، ب، ل، ال، بال، لل، وال... */
const PRE = `(?<![${AR}])(?:[وفبك]?(?:ال|لل)|[وفبكل])?`;
const END = `ا?(?![${AR}])`; // ألف التنوين («مجلسًا» بعد التطبيع «مجلسا») لا تمنع المطابقة

/** الأعداد بالكلمات (مذكر ومؤنث ولهجة) 0..10 */
export const NUM_WORDS = Object.freeze({
  صفر: 0, واحد: 1, واحده: 1, وحده: 1, اثنين: 2, اثنان: 2, اثنتين: 2, ثنتين: 2, ثنين: 2, ثلاث: 3, ثلاثه: 3, ثلث: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5,
  ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, ثمن: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10,
});
const NUMW = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|');
/** رقم أو كلمة عدد ← عدد صحيح، أو null */
export const toNumber = s => { if (s === undefined || s === null) return null; const k = String(s).trim(); if (/^\d+$/.test(k)) return Number(k); return k in NUM_WORDS ? NUM_WORDS[k] : null; };

/**
 * الفراغات. لكل مدخل: id، الاسم بالفصحى، نمط الكلام (مطبَّع)، صيغ المثنى، الفئة، ما يستهلكه المولّد منه:
 *  - counts: مفتاح الأعداد في المولّد (bedrooms/majlis/baths/kitchens/halls/dining)
 *  - extra: مفتاح الفراغ الإضافي في requirements.extras
 *  - unsupported: نص صادق عمّا لا يُرسم في هذا الإصدار
 * area: المساحة التصميمية التقريبية (م²) للعرض؛ floor: الدور المقترح عند وجود دورين.
 * الترتيب مهم: الأخص قبل الأعم (مجلس الرجال قبل مجلس).
 */
export const SPACES = Object.freeze([
  { id: 'majlis_men', label: 'مجلس الرجال', re: 'مجلس(?:ا)? (?:ال|لل|ل)?(?:رجال|رجاجيل|رياجيل|شباب|ضيوف)|ديوانيه|دوانيه|مجلس (?:ال)?ديوانيه', dual: 'مجلسين (?:ال|لل)?رجال', counts: 'majlis', area: 26, floor: 'ground', zone: 'guest' },
  { id: 'majlis_women', label: 'مجلس النساء', re: 'مجلس(?:ا)? (?:ال|لل|ل)?(?:نساء|حريم|نسوان|عائله|عوائل|ستات|بنات)|صاله (?:ال)?(?:حريم|نساء)', dual: null, counts: 'majlis', area: 22, floor: 'ground', zone: 'guest' },
  { id: 'majlis', label: 'مجلس', re: 'مجلس|مجالس|مجلسين|مجلسان', dual: 'مجلسين|مجلسان', counts: 'majlis', area: 26, floor: 'ground', zone: 'guest', generic: true },
  { id: 'dining', label: 'المقلط (صالة الطعام)', re: 'مقلط|مقالط|مقلطين|صاله (?:ال)?طعام|غرفه (?:ال)?طعام|صالات (?:ال)?طعام|طعام|سفره|داينينج|داينينق|داينق', dual: 'مقلطين|صالتين طعام', counts: 'dining', area: 15, floor: 'ground', zone: 'guest' },
  { id: 'hall', label: 'الصالة العائلية', re: 'صاله(?: (?:ال)?(?:عائليه|عايليه|معيشه|جلوس|عيله|اهل|العيله|داخليه))?|صالات|صالتين|صالتان|صالون(?:ات)?|صالونين|ليفنج|ليفينج|ليفنق|لفنج|غرفه (?:ال)?معيشه|غرفه (?:ال)?جلوس|معيشه', dual: 'صالتين|صالتان|صالونين', counts: 'halls', area: 30, floor: 'ground', zone: 'family' },
  { id: 'kitchen_prep', label: 'مطبخ تحضيري', re: 'مطبخ (?:ال)?(?:تحضيري|تحضير|ثاني|خارجي|خفيف|صغير|مساعد)|مطبخ (?:ال)?(?:برا|خارج)', dual: null, counts: 'kitchens', area: 8, floor: 'ground', zone: 'service' },
  { id: 'kitchen', label: 'المطبخ الرئيسي', re: 'مطبخ(?: (?:ال)?رئيسي)?|مطابخ|مطبخين|مطبخان', dual: 'مطبخين|مطبخان', counts: 'kitchens', area: 13, floor: 'ground', zone: 'service', generic: true },
  { id: 'master', label: 'غرفة النوم الرئيسية (ماستر)', re: '(?:غرفه |غرفتين |جناح )?(?:ال)?(?:نوم )?(?:ال)?(?:ماستر|رئيسيه|رئيسي)(?: بدروم)?|غرفتي|غرفتنا|جناح (?:ال)?(?:والدين|زوجين)', dual: 'غرفتين (?:ال)?(?:نوم )?(?:ماستر|رئيسيه)', counts: 'bedrooms', area: 19, floor: 'upper', zone: 'private' },
  { id: 'elderly_room', label: 'غرفة الوالدين / كبار السن', re: 'غرف(?:ه|تين)? (?:نوم )?(?:ال|لل|ل)?(?:والده|والدتي|والد|والدي|والدين|ام|امي|اب|ابوي|ابي|جده|جدتي|جد|جدي|كبار السن|كبير السن|شياب|اهلي|الوالده|الوالد)', dual: null, counts: 'bedrooms', area: 16, floor: 'ground', zone: 'private' },
  { id: 'guest_room', label: 'غرفة نوم للضيوف', re: 'غرف(?:ه|تين)? (?:نوم )?(?:ال|لل|ل)?(?:ضيوف|ضيف|ضيافه)', dual: null, extra: 'guestRoom', area: 14, floor: 'ground', zone: 'guest' },
  { id: 'bedroom_girls', label: 'غرفة بنات', re: 'غرف(?:ه|تين|تان)? (?:نوم )?(?:ال|لل|ل)?(?:بنات|بناتي|البنات)', dual: 'غرف(?:تين|تان) (?:نوم )?(?:ال|لل|ل)?بنات', counts: 'bedrooms', area: 14, floor: 'upper', zone: 'private' },
  { id: 'bedroom_boys', label: 'غرفة أولاد', re: 'غرف(?:ه|تين|تان)? (?:نوم )?(?:ال|لل|ل)?(?:اولاد|عيال|عيالي|ابناء|شباب|صبيان|بزران|اطفال|صغار|ولد|ولدي|اولادي)', dual: 'غرف(?:تين|تان) (?:نوم )?(?:ال|لل|ل)?(?:اولاد|عيال|اطفال|ابناء)', counts: 'bedrooms', area: 14, floor: 'upper', zone: 'private' },
  { id: 'bedroom', label: 'غرفة نوم', re: 'غرف(?:ه)? (?:ال)?نوم|غرفتين(?: نوم)?|غرفتان|غرف(?! (?:ال)?(?:ملابس|غسيل|خادمه|سائق|طعام|معيشه|جلوس|تخزين))', dual: 'غرفتين(?: نوم)?|غرفتان', counts: 'bedrooms', area: 14, floor: 'upper', zone: 'private', generic: true },
  { id: 'maid', label: 'غرفة الخادمة', re: '(?:غرفه (?:ال)?)?(?:خادمه|خدامه|شغاله|شغالتين|خادمتين|عامله|عاملات|خدم)', dual: 'شغالتين|خادمتين', extra: 'maid', area: 9, floor: 'ground', zone: 'service' },
  { id: 'driver', label: 'غرفة السائق', re: '(?:غرفه (?:ال)?)?(?:سائق|سواق|دريول|درايفر)', dual: null, extra: 'driver', area: 9, floor: 'ground', zone: 'service' },
  { id: 'prayer', label: 'مصلى', re: 'مصلي|مصلا|مصلى|غرفه (?:ال)?صلاه', dual: null, extra: 'prayer', area: 8, floor: 'ground', zone: 'guest' },
  { id: 'office', label: 'مكتب', re: 'مكتب|مكتبين|غرفه (?:ال)?(?:دراسه|مذاكره)|اوفيس|غرفه (?:ال)?مكتب', dual: 'مكتبين', extra: 'office', area: 12, floor: 'ground', zone: 'guest' },
  { id: 'storage', label: 'مستودع', re: 'مستودع|مستودعات|مخزن|مخازن|بانتري|بنتري|غرفه (?:ال)?تخزين|غرفه (?:ال)?مونه', dual: null, extra: 'storage', area: 5, floor: 'ground', zone: 'service' },
  { id: 'laundry', label: 'غرفة غسيل', re: '(?:غرفه (?:ال)?)?غسيل|لاندري|مغسله(?: ملابس)?', dual: null, extra: 'laundry', area: 5, floor: 'ground', zone: 'service' },
  { id: 'dressing', label: 'غرفة ملابس للماستر', re: 'غرفه (?:ال)?ملابس|دريسنج|دريسنق|دريسينج|غرفه (?:ال)?خزائن', dual: null, pref: 'masterDressing', area: 0, floor: 'upper', zone: 'private' },
  { id: 'guest_wc', label: 'دورة مياه الضيوف', re: '(?:حمام|دوره مياه|تواليت) (?:ال|لل|ل)?(?:ضيوف|رجال|مجلس|ضيف)', dual: null, counts: 'baths', area: 4, floor: 'ground', zone: 'guest' },
  { id: 'bath', label: 'دورة مياه', re: 'حمامات|حمامين|حمام|دورات (?:ال)?مياه|دوره (?:ال)?مياه|دورتين مياه|تواليت|مغاسل', dual: 'حمامين|دورتين مياه', counts: 'baths', area: 5, floor: 'any', zone: 'private', generic: true },
  // ما لا يرسمه المولّد في هذا الإصدار (يُقال للعميل بصدق)
  { id: 'annex', label: 'ملحق خارجي', re: 'ملحق|ملاحق|ديوانيه خارجيه|استراحه', dual: null, unsupported: 'الملحق الخارجي: لا يُرسم في هذا الإصدار؛ يمكن إضافته في المرسم يدويًا.', area: 0, floor: 'ground', zone: 'outside' },
  { id: 'pool', label: 'مسبح', re: 'مسبح|مسابح|حمام سباحه|بركه', dual: null, unsupported: 'المسبح: خارج المبنى ولا يُرسم في هذا الإصدار.', area: 0, floor: 'ground', zone: 'outside' },
  { id: 'yard', label: 'حوش / حديقة', re: 'حوش|حديقه|جنينه|فناء خارجي|ساحه', dual: null, unsupported: 'الحوش والحديقة: ما يزيد عن المبنى يبقى ساحات خارجية في الارتدادات ولا تُصمَّم هنا.', area: 0, floor: 'ground', zone: 'outside' },
  { id: 'garage', label: 'مواقف / كراج', re: 'كراج|قراج|جراج|موقف|مواقف|مظله(?: سيارات)?|مظلات', dual: null, unsupported: 'مواقف السيارات (الكراج): تبقى في الارتداد الأمامي ولا تُرسم في هذا الإصدار.', area: 0, floor: 'ground', zone: 'outside' },
  { id: 'elevator', label: 'مصعد', re: 'مصعد|اسانسير|ليفت', dual: null, unsupported: 'المصعد: غير مدعوم في هذا الإصدار.', area: 0, floor: 'any', zone: 'service' },
  { id: 'basement', label: 'قبو', re: 'قبو|بدروم', dual: null, unsupported: 'القبو: غير مدعوم في هذا الإصدار.', area: 0, floor: 'any', zone: 'service' },
  { id: 'roof', label: 'غرفة السطح', re: 'سطح|روف|غرفه (?:ال)?سطح|ملحق (?:ال)?سطح', dual: null, unsupported: 'السطح وغرفة السطح: لا تُرسم في هذا الإصدار.', area: 0, floor: 'any', zone: 'outside' },
  { id: 'mashab', label: 'مشب', re: 'مشب|مشبين|غرفه (?:ال)?مشب', dual: null, unsupported: 'المشب (مجلس الشتاء بموقده): لا يُرسم فراغًا مستقلًا في هذا الإصدار؛ يمكن إدراجه في المجلس أو إضافته في المرسم.', area: 0, floor: 'ground', zone: 'guest' },
  { id: 'balcony', label: 'شرفة / تراس', re: 'بلكون|بلكونه|بلكونات|برنده|برندات|شرفه|شرفات|تراس|تراسات', dual: null, unsupported: 'الشرفات والتراس: لا تُرسم في هذا الإصدار.', area: 0, floor: 'any', zone: 'outside' },
  { id: 'courtyard', label: 'فناء داخلي', re: 'فناء(?! خارجي)|حوش داخلي|كورت ?يارد', dual: null, unsupported: 'الفناء الداخلي: هذا المولّد لا يرسمه بعد.', area: 0, floor: 'ground', zone: 'outside' },
]);
export const SPACE = Object.fromEntries(SPACES.map(s => [s.id, s]));

const rx = s => new RegExp(`${PRE}(?:${s.re})${END}`, 'g');
const RX = Object.fromEntries(SPACES.map(s => [s.id, rx(s)]));
const DUAL = new RegExp(`^(?:[وفبك]?(?:ال|لل)|[وفبكل])?(?:${SPACES.filter(s => s.dual).map(s => s.dual).join('|')})$`);
/** عدد قبل الاسم: «اربع غرف»، «اثنين مجلس»، «٢ صاله»، «عدد 3 حمامات» */
const BEFORE = new RegExp(`(?:^|[\\s،,؛;])(?:و|عدد |ب)?(${NUMW}|\\d+)\\s*(?:غرف|غرفه)?\\s*$`);
/** عدد بعد الاسم: «مجلس اثنين»، «صالات 2» (لا تُلتقط المقاسات مثل «مجلس 5×6» ولا الأعمار) */
const AFTER = new RegExp(`^\\s*(?:عدد\\s*)?(${NUMW}|\\d+)(?![\\s]*(?:×|في|م(?![${AR}])|متر|سنه|سنوات))${END}`);
/** نفي قبل الاسم: «بدون مجلس»، «ما ابي مقلط»، «لا احتاج سائق» */
/** نفي بعد الاسم: «مجلس النساء غير مطلوب»، «السائق ما احتاجه» */
const AFTER_NEG = /^\s*(?:غير مطلوب|مو مطلوب|مب مطلوب|غير لازم|مو لازم|ما احتاجه|ما احتاجها|ما ابيه|ما ابيها|ما ابغاه|ما ابغاها|ما نبيه|لا احتاجه|لا احتاجها|ما له داعي|ما لها داعي)(?![\u0620-\u064A])/;
const NEG = /(?:بدون|بلا|من غير|ما\s?(?:ابي|ابغي|ابغى|اريد|احتاج|نبي|نبغي|نحتاج|له داعي)|لا\s?(?:ابي|ابغي|اريد|احتاج|نحتاج|داعي ل|يحتاج)|مو\s?(?:محتاج|لازم)|مب\s?(?:محتاج|لازم)|ما\s?فيه|مافيه|الغ|الغي|احذف|شيل)\s*(?:اي\s+)?(?:غرفه\s+)?(?:ال)?$/;

/**
 * يستخرج كل ذكر لفراغ في النص مع عدده ونفيه ومقطع الكلام حوله.
 * يعيد قائمة { id, label, count, negated, explicit, text, index } بترتيب الورود. الأخص يغلب الأعم عند التداخل.
 */
/** مفردات حجازية ومحلية تُوحَّد قبل المطابقة: أوضة = غرفة */
const SYNONYMS = [[/(?<![\u0620-\u064A])(و?)اوضتين(?![\u0620-\u064A])/g, '$1غرفتين'], [/(?<![\u0620-\u064A])(و?)اوضه(?![\u0620-\u064A])/g, '$1غرفه'], [/(?<![\u0620-\u064A])(و?)اوض(?![\u0620-\u064A])/g, '$1غرف']];
export function findSpaces(raw) {
  let t = normalizeAr(raw);
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  const all = [];
  for (const s of SPACES) { const r = RX[s.id]; r.lastIndex = 0; let m; while ((m = r.exec(t))) { all.push({ s, start: m.index, end: m.index + m[0].length, text: m[0] }); if (!m[0]) r.lastIndex++; } }
  // إزالة التداخل: الأطول أولًا، ثم الأخص (ترتيب المعجم)
  all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || SPACES.indexOf(a.s) - SPACES.indexOf(b.s));
  const kept = []; for (const m of all) if (!kept.some(o => m.start < o.end && o.start < m.end)) kept.push(m);
  kept.sort((a, b) => a.start - b.start);
  const out = [];
  for (const [i, m] of kept.entries()) {
    const prefix = t.slice(kept[i - 1]?.end ?? 0, m.start), suffix = t.slice(m.end, kept[i + 1]?.start ?? t.length);
    const dual = DUAL.test(m.text.trim());
    let count = null, explicit = false;
    const b = prefix.match(BEFORE), a = suffix.match(AFTER);
    if (dual) { count = 2; explicit = true; }
    else if (b && toNumber(b[1]) !== null) { count = toNumber(b[1]); explicit = true; }
    else if (a && toNumber(a[1]) !== null && !/^\s*(?:غرف|غرفه)/.test(suffix)) { count = toNumber(a[1]); explicit = true; }
    const negated = NEG.test(prefix.trimEnd()) || AFTER_NEG.test(suffix);
    out.push({ id: m.s.id, label: m.s.label, count: negated ? 0 : count ?? 1, explicit, negated, text: m.text.trim(), index: m.start, clause: suffix.split(/[،,؛;.\n]/)[0].trim() });
  }
  return out;
}

/** هل في النص فراغ من هذا المعرّف غير منفي؟ */
export const mentions = (raw, id) => findSpaces(raw).some(m => m.id === id && !m.negated);

export default { SPACES, SPACE, findSpaces, mentions, toNumber, NUM_WORDS };
