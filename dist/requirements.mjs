// متطلبات العميل من كلامه الحر: ما يتجاوز أعداد الغرف (حمام لكل غرفة، مطبخ مفتوح، غرفة خادمة، مدخل مستقل،
// مقاسات مذكورة، مكتب ومستودع وغسيل...). قواعد نصية حتمية بلا شبكة، ولا تخمين: ما لم يُذكر لا يظهر.
// المخرجات تُمرَّر إلى مولّد الفيلا (villa-layout.mjs) وتُعرض للعميل قبل التوليد: ما فهمته، وما سيُطبَّق، وما لن يُطبَّق.

const AR_NUM = { 'واحد': 1, 'واحده': 1, 'اثنين': 2, 'اثنان': 2, 'ثنتين': 2, 'ثلاث': 3, 'ثلاثه': 3, 'اربع': 4, 'اربعه': 4, 'خمس': 5, 'خمسه': 5, 'ست': 6, 'سته': 6, 'سبع': 7, 'سبعه': 7, 'ثمان': 8, 'ثمانيه': 8, 'تسع': 9, 'تسعه': 9, 'عشر': 10, 'عشره': 10 };
/** تطبيع عربي: حذف التشكيل والتطويل، توحيد الألف والتاء المربوطة والياء، والأرقام الهندية إلى لاتينية. */
export function normalizeAr(text) {
  return String(text || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[×xX*]/g, '×').replace(/\s+/g, ' ').trim();
}
const num = s => (s in AR_NUM ? AR_NUM[s] : Number(s));

// كلمات الفراغات ← المفتاح المستعمل في المولّد
const ROOM_WORDS = [
  ['master', 'غرفه (?:النوم )?(?:الرئيسيه|ماستر)|الماستر|ماستر'],
  ['majlis', 'مجلس(?: الرجال| رجال| النساء| نساء)?'],
  ['hall', 'صاله(?: عائليه| المعيشه| معيشه)?|الصاله'],
  ['dining', '(?:صاله|غرفه)? ?(?:ال)?طعام'],
  ['kitchen', '(?:ال)?مطبخ'],
  ['bedroom', 'غرفه نوم|غرف نوم|غرفه'],
];

/**
 * يستخرج المتطلبات من النص. counts: أعداد مفهومة مسبقًا (من الفهم المحلي أو الذكاء) تُستعمل أساسًا.
 * يعيد { counts, extras:{maid,driver,office,prayer,storage,laundry}, prefs, areas, understood[], unsupported[] }.
 */
export function extractRequirements(text, { counts = {}, discovery = null } = {}) {
  const t = normalizeAr(text), understood = [], unsupported = [];
  const has = re => re.test(t);
  const prefs = {}, extras = {}, areas = {};
  const c = { ...counts };

  // حمام لكل غرفة
  if (has(/(كل|جميع) (ال)?غرف(ه)?( ال)?(نوم)? ?(ب|مع|فيها|لها|عندها|داخلها)? ?(حمام|دوره مياه|دورات مياه)|حمام (خاص )?(لكل|في كل) غرفه|(كل|جميع) (ال)?غرف ماستر|غرف(ه)? ماستر (كلها|جميعها)|حمامات داخليه/)) {
    prefs.allEnsuite = true; understood.push('كل غرفة نوم بحمامها الملحق');
  }
  // الماستر وغرفة الملابس
  if (has(/غرفه (ال)?ملابس|دريسنج|دريسنق|walk ?in/)) { prefs.masterDressing = true; understood.push('غرفة ملابس للغرفة الرئيسية'); }
  const mm = t.match(/(\d+|واحد|اثنين|ثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه) غرف(ه)? (نوم )?ماستر/);
  if (mm) { const n = num(mm[1]); if (Number.isInteger(n) && n >= 1 && n <= 10) { c.bedrooms = Math.max(c.bedrooms || 0, n); prefs.allEnsuite = true; understood.push(`${n} غرف نوم ماستر (كل غرفة بحمامها)`); } }
  if (has(/ماستر|الرئيسيه/) && !c.bedrooms) c.bedrooms = 1;
  // المطبخ
  if (has(/مطبخ (مفتوح|امريكي|اميركي|مكشوف)|(open|اوبن) ?(kitchen|كيتشن)/)) { prefs.openKitchen = true; understood.push('مطبخ مفتوح على الطعام'); }
  else if (has(/مطبخ (مغلق|مقفل|مستقل)/)) { prefs.openKitchen = false; understood.push('مطبخ مغلق بباب'); }
  if (has(/مطبخ (تحضيري|خارجي|ثاني)|مطبخين/)) { c.kitchens = Math.max(c.kitchens || 0, 2); understood.push('مطبخ ثانٍ (تحضيري)'); }
  // الطعام: «مفتوح على الطعام» أو «غرفة طعام» تعني وجودها
  if (has(/طعام|سفره|اكل/) && !c.dining) { c.dining = 1; }
  // المداخل
  if (has(/مدخل (مستقل|منفصل|خاص|ثاني) ?(لل)?(نساء|نسوان|عائله|حريم|اهل)|مدخل (لل)?(نساء|العائله|الحريم)|مدخلين|(نساء|النساء|العائله|الحريم)[^،,.]{0,8} ?(ب|مع|له|لها)? ?مدخل (مستقل|منفصل|خاص)/)) { prefs.familyEntrance = true; understood.push('مدخل مستقل للعائلة/النساء'); }
  if (has(/مدخل (مستقل|منفصل|خاص)? ?(لل)?(رجال|ضيوف|مجلس)|مجلس (ب|له|مع) ?مدخل/)) { prefs.guestEntrance = true; understood.push('مدخل مستقل للضيوف إلى المجلس'); }
  // فراغات إضافية
  const maid = t.match(/(غرفه )?(خادمه|خدامه|عامله|شغاله|الخادمه|العامله)([^،,.]{0,25})/);
  if (maid) { extras.maid = { bath: /حمام|دوره مياه/.test(maid[3]) || has(/خادمه (ب|مع) ?حمام/) }; understood.push('غرفة خادمة' + (extras.maid.bath ? ' بحمام' : '')); }
  const driver = t.match(/(غرفه )?(سائق|سواق|السائق|السواق)([^،,.]{0,25})/);
  if (driver) { extras.driver = { bath: /حمام|دوره مياه/.test(driver[3]) }; understood.push('غرفة سائق بمدخل خارجي' + (extras.driver.bath ? ' وحمام' : '')); }
  if (has(/(^|[\sو])(ال)?مكتب(?!ه)/)) { extras.office = true; understood.push('مكتب'); }
  if (has(/مصلي|مصلا/)) { extras.prayer = true; understood.push('مصلى'); }
  if (has(/مستودع|مخزن|بانتري|بنتري/)) { extras.storage = true; understood.push('مخزن'); }
  if (has(/غسيل|غسيل الملابس|لاندري|مغسله ملابس/)) { extras.laundry = true; understood.push('غرفة غسيل'); }
  // كبار السن
  if (has(/كبار السن|كبير السن|الوالده|الوالد|ابوي|امي|جدتي|جدي|الوالدين/) || discovery?.life?.seniors) { prefs.elderlyRoom = true; understood.push('غرفة نوم قريبة من الصالة لكبار السن'); }
  // مقاسات صريحة: «مجلس 5×6» أو «مجلس 30 م²»
  for (const [key, words] of ROOM_WORDS) {
    const GAP = '\\s*(?:(?:ب)?(?:مساحه|مساحتها|مساحته|مقاس|ابعاد|ابعادها|ابعاده)\\s*)?';
    const re = new RegExp(`(?:${words})${GAP}(\\d+(?:\\.\\d+)?)\\s*(?:×|في)\\s*(\\d+(?:\\.\\d+)?)`), m = t.match(re);
    if (m) { const a = num(m[1]) * num(m[2]); if (a >= 4 && a <= 150 && !areas[key]) { areas[key] = Math.round(a * 100) / 100; understood.push(`${label(key)} ${m[1]}×${m[2]} م (${areas[key]} م²)`); } continue; }
    const re2 = new RegExp(`(?:${words})${GAP}(\\d+(?:\\.\\d+)?)\\s*(?:م2|م²|متر مربع|مترمربع|متر)`), m2 = t.match(re2);
    if (m2) { const a = num(m2[1]); if (a >= 4 && a <= 150 && !areas[key]) { areas[key] = a; understood.push(`${label(key)} ${a} م²`); } }
  }
  // أحجام وصفية (تكبير 30٪ من المقاس التصميمي، لا رقم مخترع)
  for (const [key, re] of [['majlis', /مجلس( رجال| الرجال)? (كبير|واسع|فخم)/], ['hall', /صاله( عائليه)? (كبيره|واسعه)/], ['kitchen', /مطبخ (كبير|واسع)/], ['master', /(ماستر|الرئيسيه) (كبيره|واسعه)/]]) {
    if (!areas[key] && re.test(t)) { prefs['big_' + key] = true; understood.push(`${label(key)} ${['hall', 'master'].includes(key) ? 'واسعة' : 'واسع'}`); }
  }
  if (has(/فناء|حوش داخلي|كورت ?يارد/)) unsupported.push('الفناء الداخلي: هذا المولّد لا يرسمه بعد؛ ما يزيد عن المبنى يبقى ساحات خارجية.');
  if (has(/مسبح|حمام سباحه/)) unsupported.push('المسبح: خارج المبنى ولا يُرسم في هذا الإصدار.');
  if (has(/مصعد|اسانسير/)) unsupported.push('المصعد: غير مدعوم في هذا الإصدار.');
  if (has(/قبو|بدروم/)) unsupported.push('القبو: غير مدعوم في هذا الإصدار.');

  // حمام لكل غرفة يرفع عدد دورات المياه إلى ما يكفي
  if (prefs.allEnsuite && c.bedrooms) {
    const need = c.bedrooms + Math.min(2, c.majlis || 0) + (extras.maid?.bath ? 1 : 0) + (extras.driver?.bath ? 1 : 0);
    if (!c.baths || c.baths < need) { c.baths = need; understood.push(`عدد دورات المياه ${need} (حمام لكل غرفة${c.majlis ? (c.majlis > 1 ? ' + دورتا مياه الرجال والنساء' : ' + دورة مياه الرجال') : ''}${extras.maid?.bath ? ' + حمام الخادمة' : ''}${extras.driver?.bath ? ' + حمام السائق' : ''})`); }
  }
  return { counts: c, extras, prefs, areas, understood: [...new Set(understood)], unsupported };
}
function label(key) { return { master: 'الغرفة الرئيسية', majlis: 'المجلس', hall: 'الصالة', dining: 'الطعام', kitchen: 'المطبخ', bedroom: 'غرفة النوم' }[key] || key; }

export default { extractRequirements, normalizeAr };
