// متطلبات العميل من كلامه الحر: ما يتجاوز أعداد الغرف (حمام لكل غرفة، مطبخ مفتوح، غرفة خادمة، مدخل مستقل،
// مقاسات مذكورة، مكتب ومستودع وغسيل...). قواعد نصية حتمية بلا شبكة، ولا تخمين: ما لم يُذكر لا يظهر.
// والقواعد المكانية (أمام/خلف/جهات/بجوار/قرب/بعيد/الدور) من rules.mjs، ثم يُتحقق منها هندسيًا بعد التوليد.
// المخرجات تُمرَّر إلى مولّد الفيلا (villa-layout.mjs) وتُعرض للعميل قبل التوليد: ما فهمته، وما سيُطبَّق، وما لن يُطبَّق.

import { buildSharedBrief, parseRequestedCount } from './shared-brief.mjs';
import { extractRules, mergeRules, ruleText, subjectAr, SIDE_LABELS, OPPOSITE_SIDE } from './rules.mjs';

const AR_NUM = { 'واحد': 1, 'واحده': 1, 'اثنين': 2, 'اثنان': 2, 'ثنتين': 2, 'ثلاث': 3, 'ثلاثه': 3, 'اربع': 4, 'اربعه': 4, 'خمس': 5, 'خمسه': 5, 'ست': 6, 'سته': 6, 'سبع': 7, 'سبعه': 7, 'ثمان': 8, 'ثمانيه': 8, 'تسع': 9, 'تسعه': 9, 'عشر': 10, 'عشره': 10, 'عشرين': 20, 'ثلاثين': 30, 'اربعين': 40, 'خمسين': 50, 'خمسه عشر': 15, 'خمسطعش': 15, 'عشرطعش': 15 };
/** تطبيع عربي: حذف التشكيل والتطويل، توحيد الألف والتاء المربوطة والياء، والأرقام الهندية إلى لاتينية. */
export function normalizeAr(text) {
  return String(text || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    // الفاصلة العشرية العربية «٥٫٥» = 5.5 (كانت تُقرأ 5 وتسقط الكسر)، وفاصل الآلاف «١٬٢٠٠» يُحذف
    .replace(/(\d|[٠-٩])٫(?=\d|[٠-٩])/g, '$1.').replace(/(\d|[٠-٩])٬(?=\d|[٠-٩])/g, '$1')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    // «4x5» و«4 م x 5» و«4*5» أبعاد؛ حرف x داخل كلمة إنجليزية («next») يبقى كما هو
    .replace(/(\d(?:\s*(?:م|m))?)\s*[xX*]\s*(?=\d)/g, '$1×').replace(/\s+/g, ' ').trim().toLowerCase();
}
const num = s => (s in AR_NUM ? AR_NUM[s] : Number(s));

// كلمات الفراغات ← المفتاح المستعمل في المولّد
const ROOM_WORDS = [
  ['master', 'غرفه (?:النوم )?(?:الرئيسيه|ماستر)|الماستر|ماستر|master(?: bed ?room| suite)?'],
  ['majlis', 'مجلس(?: الرجال| رجال| النساء| نساء)?|majlis'],
  ['hall', 'صاله(?: عائليه| المعيشه| معيشه)?|الصاله|living(?: room)?|family hall'],
  ['dining', '(?:صاله|غرفه)? ?(?:ال)?طعام|dining(?: room)?'],
  ['kitchen', '(?:ال)?مطبخ|kitchen'],
  ['bedroom', 'غرفه نوم|غرف نوم|غرف (?:لل|ال|ل)?(?:اولاد|اطفال|بنات|عيال|ابناء)|غرفتين|غرفتان|(?:باقي |بقيه )?(?:ال)?غرف|غرفه|(?:kids |children )?bed ?rooms?'],
];
// مواد الواجهة وطرزها (تُحمل في المتطلبات؛ عرضها في المجسّم لاحقًا)
const FACADE_MATERIALS = [
  ['stone', 'حجر', 'حجر(?:ي|يه)?|stone'], ['marble', 'رخام', 'رخام|marble'], ['granite', 'جرانيت', 'جرانيت|granite'],
  ['wood', 'خشب', 'خشب(?:ي|يه)?|wood(?:en)?'], ['glass', 'زجاج', 'زجاج(?:ي|يه)?|glass'], ['brick', 'طوب', 'طوب|بريك|brick'],
  ['cladding', 'كلادينج', 'كلادينج|كلادنق|كلادينق|الوكبوند|alucobond|cladding'], ['plaster', 'لياسة ودهان', 'لياسه|دهان|بلاستر|plaster|paint(?:ed)?'],
];
const FACADE_STYLES = [
  ['najdi', 'نجدي', 'نجدي(?:ه)?|najdi'], ['salmani', 'سلماني', 'سلماني(?:ه)?|salmani'], ['modern', 'حديث', 'حديث(?:ه)?|مودرن|عصري(?:ه)?|modern|contemporary'],
  ['classic', 'كلاسيكي', 'كلاسيك(?:ي|يه)?|classic(?:al)?'], ['hijazi', 'حجازي', 'حجازي(?:ه)?|hijazi'],
];
const pickWord = (list, s) => { for (const [id, ar, re] of list) if (new RegExp(`(?<![\\u0600-\\u06FFa-z])(?:ال|بال|و)?(?:${re})(?![\\u0600-\\u06FFa-z])`).test(s)) return { id, ar }; return null; };
/** يربط موضعًا في النص المطبَّع بعبارة العميل الأصلية (الكلمات تتطابق واحدة بواحدة بعد التطبيع). */
function origMapper(text) {
  const orig = String(text || '').trim().split(/\s+/).filter(Boolean), normTok = orig.map(w => normalizeAr(w));
  const joined = normTok.join(' ');
  if (joined !== normalizeAr(text)) return (t, a, b) => t.slice(a, b).trim();
  const starts = []; let p = 0; for (const w of normTok) { starts.push(p); p += w.length + 1; }
  const idx = pos => { let i = 0; while (i + 1 < starts.length && starts[i + 1] <= pos) i++; return i; };
  return (t, a, b) => orig.slice(idx(a), idx(Math.max(a, b - 1)) + 1).join(' ').replace(/^[،,.؛;:!?؟]+|[،,.؛;:!?؟]+$/g, '').trim();
}
// (الجولة التاسعة عشرة، توجيه المالك رابعًا) سماحية المقاس الصريح لكل ضلع على حدة (لا المساحة): ±0.05 م افتراضًا و«بالضبط» — تفاوت
// اللياسة والتشطيب على وجهي الجدار، لا تقريب تصميمي؛ و«بالضبط» ±0.03 م؛ و±0.30 م فقط حين يقول العميل «تقريبًا/حوالي». (كانت ±0.3 افتراضًا: مطبخ 3.86×4.96
// اعتُدّ مطابقًا لطلب 4×5 — المالك لا يقبل ذلك.) RULES_DIM_TOL مصدر واحد لها في الشيفرة والتقارير ونص العميل.
export const DIM_TOL = Object.freeze({ exact: .03, default: .05, approx: .3 });
const tolOf = s => /بالضبط|تماما|بالظبط|exact(?:ly)?/.test(s) ? DIM_TOL.exact : /تقريبا|حوالي|تقريبي|نحو|approx(?:imately)?|about|around/.test(s) ? DIM_TOL.approx : DIM_TOL.default;

/**
 * يستخرج المتطلبات من النص. counts: أعداد مفهومة مسبقًا (من الفهم المحلي أو الذكاء) تُستعمل أساسًا.
 * يعيد { counts, extras:{maid,driver,office,prayer,storage,laundry}, prefs, areas, understood[], unsupported[] }.
 */
/** (الجولة 21 — مقترح) نص العميل والعقد الموحد (shared-brief.mjs) وعدد التصاميم المطلوب نصًا: يحملها الطلب نفسه فيقرؤها المولّد والمراجع معًا. */
function sharedOf(text, rules, dims) {
  if (R21_OFF.has('r21brief')) return {};
  const brief = buildSharedBrief(String(text || ''), { rules, dims });
  return { text: String(text || ''), brief, ...(brief.requestedCount ? { want: brief.requestedCount } : {}) };
}
const R21_OFF = new Set(String(globalThis.process?.env?.R14_OFF || '').split(',').filter(Boolean));
export function extractRequirements(text, { counts = {}, discovery = null, clauses = true } = {}) {
  const t = normalizeAr(text), understood = [], unsupported = [], countFixes = [];
  const has = re => re.test(t);
  const prefs = {}, extras = {}, areas = {}, dims = {}, textCounts = {}, ambiguous = [];
  const c = { ...counts };
  const quoteOf = origMapper(text);

  // حمام لكل غرفة — ونفيه («مو لازم كل غرفة بحمام»، «ما أبي كل غرفة بحمام»، «ما يحتاج حمام لكل غرفة») حمامات مشتركة لا العكس
  const ensuiteNeg = has(/(?<![\u0600-\u06FF])و?(?:مو|مب|ما|لا|ليس|مش|غير) ?(?:لازم|شرط|ضروري|ابي|ابغي|ابغا|نبي|نبغي|اريد|نريد|يحتاج|احتاج|نحتاج)? ?(?:يكون |تكون )?(?:(?:كل|جميع) (?:ال)?غرف(?:ه)?[^،,.]{0,14}(?:حمام|دوره مياه)|حمام (?:خاص )?(?:لكل|في كل) غرفه)/);
  if (ensuiteNeg) { prefs.sharedBaths = true; understood.push('غرف النوم (عدا الرئيسية) تتشارك دورات المياه'); }
  else if (has(/(كل|جميع) (ال)?غرف(ه)?( ال)?(نوم)? ?(ب|مع|فيها|لها|عندها|داخلها)? ?(حمام|دوره مياه|دورات مياه)|حمام (خاص )?(لكل|في كل) غرفه|(كل|جميع) (ال)?غرف ماستر|غرف(ه)? ماستر (كلها|جميعها)|حمامات داخليه/)) {
    prefs.allEnsuite = true; understood.push('كل غرفة نوم بحمامها الملحق');
  }
  else if (has(/حمام(ات)? مشترك|(تتشارك|يتشاركون|تشترك|مشتركه في) (ال)?(حمام|دوره مياه)|حمام (بين|لكل) (كل )?غرفتين|دوره مياه مشتركه|(مو|ما|لا|ليس) (لازم|شرط|ضروري) (كل غرفه|حمام لكل)/)) {
    prefs.sharedBaths = true; understood.push('غرف النوم (عدا الرئيسية) تتشارك دورات المياه');
  }
  // الماستر وغرفة الملابس
  if (has(/غرفه (ال)?ملابس|دريسنج|دريسنق|walk ?in/)) { prefs.masterDressing = true; understood.push('غرفة ملابس للغرفة الرئيسية'); }
  const mm = t.match(/(\d+|واحد|اثنين|ثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه) غرف(ه)? (نوم )?ماستر/);
  if (mm) { const n = num(mm[1]); if (Number.isInteger(n) && n >= 1 && n <= 10) { c.bedrooms = Math.max(c.bedrooms || 0, n); textCounts.bedrooms = c.bedrooms; prefs.allEnsuite = true; understood.push(`${n} غرف نوم ماستر (كل غرفة بحمامها)`); } }
  // «4 غرف» أو «ثلاث غرف نوم»: عدد صريح واحد لغرف النوم يتقدم على العد التقريبي من الكلمات
  const NUMW = '\\d+|واحد|اثنين|ثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان|ثمانيه|تسع|تسعه|عشر|عشره';
  const bedRe = new RegExp(`(?<![\\u0600-\\u06FF0-9])و?(${NUMW}) (?:غرف|غرفه)(?: (?:ال)?نوم)?(?! (?:ال)?(?:ملابس|غسيل|خادمه|سائق|طعام|ماستر))(?![\\u0600-\\u06FF])( (?:لل|ل|ال)?(?:عيال|اولاد|اطفال|بنات|ابناء|بزران))?`, 'g');
  // «الماستر وثلاث غرف للعيال» = أربع غرف نوم
  const masterSaid = /ماستر|(?:غرفه (?:ال)?نوم |ال)رئيسيه/.test(t);
  // و«ثلاث غرف للعيال» مع «غرفة لأبوي وأمي» = غرفة الوالدين من غرف النوم أيضًا (المولّد يعدّها منها)
  const elderSaid = /غرف(?:ه)?(?: نوم)?(?: ارضيه)? (?:لل|ل)(?:ابوي|امي|والد|والده|والدين|جدي|جدتي|كبار السن|كبير السن|اهلي)|غرف(?:ه)? (?:ال)?(?:والد|والده|والدين)/.test(t);
  // «ثلاث غرف نوم أخرى/غير الماستر» مع ذكر الرئيسية = الرئيسية + ثلاث
  const bedMatches = [...t.matchAll(bedRe)];
  const bedHits = bedMatches.map(m => num(m[1]) + (m[2] && masterSaid ? 1 : 0) + (m[2] && elderSaid ? 1 : 0) + (!m[2] && masterSaid && /^ ?(?:ال)?(?:اخري|اخرى|ثانيه|غير (?:ال)?(?:ماستر|رئيسيه))/.test(t.slice(m.index + m[0].length, m.index + m[0].length + 16)) ? 1 : 0)).filter(n => Number.isInteger(n) && n >= 1 && n <= 10);
  const exactBeds = has(/غرف(?:ه)?(?: (?:ال)?نوم)? (?:بالضبط|بالظبط|فقط|بس|لا اكثر|لا اقل|تماما)|exactly \d+ bed/);
  // تصحيح في منتصف الكلام («خمس غرف… لا لا خلها أربع»، «بدل خمس خلها أربع»): آخر عدد بعد أداة التصحيح هو المعتمد،
  // لا مجموع العددين ولا عدد النموذج الذي جمعهما
  const CORR = /(?<![\u0600-\u06FF])(?:لا لا|لا،|لا(?= خل)|لا(?= بس)|لا خلاص|لأ|بل|بدل|خلها|خليها|خلهن|خليهن|اقصد|قصدي|يعني|غيرت رايي|عدلت|اقول)(?![\u0600-\u06FF])/;
  let corrected = null;
  if (bedMatches.length > 1 && !mm) {
    let cur = bedHits[0];
    for (let i = 1; i < bedMatches.length && i < bedHits.length; i++) {
      // أداة التصحيح قريبة من العدد الجديد (لا «خمس غرف، خلها كلها بحمام، وثلاث للعيال»)
      const gap = t.slice(bedMatches[i - 1].index + bedMatches[i - 1][0].length - 2, bedMatches[i].index + 2), mk = gap.match(CORR);
      if (mk && gap.length <= 60 && gap.length - (mk.index + mk[0].length) <= 18) { corrected = { from: cur, to: bedHits[i] }; cur = bedHits[i]; }
    }
    if (corrected && cur === bedHits[bedHits.length - 1]) { c.bedrooms = cur; textCounts.bedrooms = cur; understood.push(`${cur} غرف نوم (صحّحت العدد من ${corrected.from} إلى ${cur})`); }
  }
  // «وغرفة رابعة للوالدة»: غرفة زائدة على العدد المذكور
  const ordinalExtra = bedHits.length === 1 && /غرفه (?:نوم )?(?:رابعه|خامسه|سادسه|ثالثه) /.test(t) && !corrected ? 1 : 0;
  const totalSaid = (t.match(/غرف (?:ال)?نوم (?:ال)?(?:ثانيه|باقيه|اخري|اخرى|للعيال|للاولاد)? ?عددها (\d+|ثلاث|اربع|خمس|اثنين|ثنتين)/) || [])[1];
  if (corrected) { /* تم أعلاه */ }
  else if (bedHits.length === 1 && !mm) { const n = bedHits[0] + ordinalExtra; c.bedrooms = n; textCounts.bedrooms = n; understood.push(`${n} غرف نوم${exactBeds ? ' (بالضبط)' : ''}`); }
  else if (!bedHits.length && totalSaid && !mm) { const n = num(totalSaid) + (masterSaid ? 1 : 0); if (n >= 1 && n <= 10) { c.bedrooms = n; textCounts.bedrooms = n; understood.push(`${n} غرف نوم`); } }
  else if (bedHits.length > 1 && !mm) understood.push(`أعداد غرف نوم متعددة في الكلام (${bedHits.join('، ')}): يُعتمد العدد في النموذج`);
  const enBeds = !mm && !bedHits.length && t.match(/(?<![a-z0-9])(\d+|one|two|three|four|five|six|seven|eight) bed ?rooms?(?![a-z])/);
  if (enBeds) { const n = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }[enBeds[1]] || Number(enBeds[1]); if (n >= 1 && n <= 10) { c.bedrooms = n; textCounts.bedrooms = n; understood.push(`${n} غرف نوم`); } }
  if (has(/ماستر|الرئيسيه/) && !c.bedrooms) c.bedrooms = 1;
  if (has(/ماستر|غرفه (?:ال)?نوم (?:ال)?رئيسيه|master/)) understood.push('غرفة نوم رئيسية (ماستر)');
  // المطبخ
  // المطبخ: «مقفل مو مفتوح» مغلق؛ يُسمح بكلمتين بين المطبخ والصفة («المطبخ يكون مفتوح»)
  const K2 = '(?: [^ ،,.]+){0,2} ';
  if (has(new RegExp(`مطبخ${K2}(مغلق|مقفل|مسكر|مستقل|بباب)|مطبخ${K2}(مو|مب|غير|ما يكون|لا يكون) ?مفتوح`))) { prefs.openKitchen = false; understood.push('مطبخ مغلق بباب'); }
  else if (has(new RegExp(`مطبخ${K2}(مفتوح|مكشوف) (ع|على|علي) (ال)?صاله(?! (ال)?طعام)`))) { prefs.kitchenOpenHall = true; understood.push('مطبخ مفتوح على الصالة'); }
  else if (has(new RegExp(`مطبخ${K2}(مفتوح|امريكي|اميركي|مكشوف)|(open|اوبن) ?(kitchen|كيتشن)`))) { prefs.openKitchen = true; understood.push('مطبخ مفتوح على الطعام'); }
  if (has(/مطبخ (تحضيري|خارجي|ثاني)|مطبخين/)) { c.kitchens = Math.max(c.kitchens || 0, 2); understood.push('مطبخ ثانٍ (تحضيري)'); }
  // الطعام: «مفتوح على الطعام» أو «غرفة طعام» تعني وجودها
  if (has(/طعام|سفره|اكل/) && !c.dining && !/(بدون|بلا|من غير|ما ابي|ما ابغي|لا اريد|ما احتاج|لا احتاج) (ال)?(غرفه |صاله )?(ال)?(طعام|سفره)/.test(t)) { c.dining = 1; }
  // المداخل
  if (has(/مدخل (مستقل|منفصل|خاص|ثاني) ?(لل)?(نساء|نسوان|عائله|حريم|اهل)|مدخل (لل)?(نساء|العائله|الحريم)|مدخلين|(نساء|النساء|العائله|الحريم)[^،,.]{0,8} ?(ب|مع|له|لها)? ?مدخل (مستقل|منفصل|خاص)/)) { prefs.familyEntrance = true; understood.push('مدخل مستقل للعائلة/النساء'); }
  if (has(/مدخل (مستقل|منفصل|خاص)? ?(لل)?(رجال|ضيوف|مجلس)|مجلس (ب|له|مع) ?مدخل|مجلس (ال)?رجال[^،,.]{0,14}(مستقل|منفصل)|مستقل(ه)? ب ?مدخل/)) { prefs.guestEntrance = true; understood.push('مجلس الرجال بمدخل مستقل عن العائلة'); }
  if (has(/مجلس (ال)?(نساء|حريم)[^،,.]{0,14}(مستقل|منفصل|بعيد)/)) { prefs.womenSeparate = true; understood.push('مجلس النساء منفصل عن منطقة الرجال (لا باب بينهما)'); }
  if (has(/(حمامات|دورات المياه|الحمام|دوره المياه)[^،,.]{0,10}(ما|لا|مو) ?(تفتح|يفتح|تطل|يطل|تكون|يكون) (ع|على|علي|في) (ال)?صاله/)) { prefs.bathsOffHall = true; understood.push('دورات المياه لا تفتح على الصالة مباشرة'); }
  // فراغات إضافية
  const maid = t.match(/(غرفه )?(خادمه|خدامه|عامله|شغاله|الخادمه|العامله)([^،,.]{0,25})/);
  // (الجولة الثانية عشرة) «غرفة خادمة بدون حمام» نفيٌ صريح (كانت كلمة «حمام» وحدها تُقرأ طلبًا): noBath يمنع حمام الخادمة الافتراضي
  const maidNoBath = !!maid && /(?:بدون|بلا|من غير|مو|ما|لا|ما لها|ما له|ما تحتاج|ما يحتاج) ?(?:لها |له )?(?:حمام|دوره مياه)/.test(maid[3]);
  if (maid) { extras.maid = { bath: !maidNoBath && (/حمام|دوره مياه/.test(maid[3]) || has(/خادمه (ب|مع) ?حمام/)), ...(maidNoBath ? { noBath: true } : {}), ext: has(/خادمه[^،.]{0,40}(باب|مدخل) (على|ع|علي|من|ل) ?(ال)?(حوش|خارج|برا|ساحه)/) }; understood.push('غرفة خادمة' + (extras.maid.bath ? ' بحمام' : '') + (extras.maid.ext ? ' وباب على الحوش' : '')); }
  // غرفة ضيوف للنوم (قرب المجلس)
  const gr = t.match(/غرف(ه)? (نوم )?(ال|لل|ل)?(ضيوف|ضيف)([^،,.]{0,20})/);
  if (gr) { extras.guestRoom = { bath: /حمام|دوره مياه/.test(gr[5]) }; understood.push('غرفة نوم للضيوف' + (extras.guestRoom.bath ? ' بحمامها' : '')); }
  const driver = t.match(/(غرفه )?(سائق|سواق|السائق|السواق)([^،,.]{0,25})/);
  if (driver) { extras.driver = { bath: /حمام|دوره مياه/.test(driver[3]) }; understood.push('غرفة سائق بمدخل خارجي' + (extras.driver.bath ? ' وحمام' : '')); }
  if (has(/(^|[\sو])(ال)?مكتب(?!ه)/)) { const ext = has(/مكتب[^،,.]{0,12}(مدخل|باب) (خارجي|مستقل|خاص|من برا|من الخارج)/); extras.office = ext ? { ext: true } : true; understood.push(ext ? 'مكتب بمدخل خارجي مستقل' : 'مكتب'); }
  if (has(/مصلي|مصلا/)) { extras.prayer = true; understood.push('مصلى'); }
  if (has(/مستودع|مخزن|بانتري|بنتري/)) { extras.storage = true; understood.push('مخزن'); }
  if (has(/غسيل|غسيل الملابس|لاندري|مغسله ملابس/)) { extras.laundry = true; understood.push('غرفة غسيل'); }
  // كبار السن
  if (has(/كبار السن|كبير السن|(ا|ل)لوالد|(?<![\u0600-\u06FF])(و|ل|لل)?(امي|ابوي|جدتي|جدي)(?![\u0600-\u06FF])|(?<![\u0600-\u06FF])(لل|ل)(ام|اب)(?![\u0600-\u06FF])/) || discovery?.life?.seniors) { prefs.elderlyRoom = true; understood.push('غرفة نوم قريبة من الصالة لكبار السن'); }
  // مقاسات صريحة: «مجلس 5×6» أو «مجلس 30 م²»
  for (const [key, words] of ROOM_WORDS) {
    const GAP = '\\s*(?:(?:تقريبا|حوالي|بالضبط|تماما)\\s*)?(?:(?:كبيره|كبير|واسعه|واسع|صغيره|صغير|فخم|فخمه)\\s*)?(?:(?:كل|لكل) (?:وحده|واحده|غرفه|وحده منها|واحد)\\s*)?(?:(?:ب|و)?(?:مساحه|مساحتها|مساحته|مقاس|مقاسها|مقاسه|ابعاد|ابعادها|ابعاده)\\s*)?';
    // «4×5»، «4 في 5»، «4 م × 5 م»، «4 by 5»، «عرض 4 وطول 5»، «طول 5 وعرض 4»
    const N = '(\\d+(?:\\.\\d+)?)', U = '\\s*(?:م|متر|m)?\\s*';
    const re = new RegExp(`(?:${words})${GAP}${N}${U}(?:×|في|by)\\s*${N}`), mx = t.match(re);
    const reWL = new RegExp(`(?:${words})${GAP}(?:ب|و)?(?:ال)?(?:عرض(?:ها|ه)?|width)\\s*${N}${U}(?:و|،|,|and)?\\s*(?:ب)?(?:ال)?(?:طول(?:ها|ه)?|length)\\s*${N}`), mw = t.match(reWL);
    const reLW = new RegExp(`(?:${words})${GAP}(?:ب|و)?(?:ال)?(?:طول(?:ها|ه)?|length)\\s*${N}${U}(?:و|،|,|and)?\\s*(?:ب)?(?:ال)?(?:عرض(?:ها|ه)?|width)\\s*${N}`), ml = t.match(reLW);
    const m = mx || mw || (ml ? Object.assign([ml[0], ml[2], ml[1]], { index: ml.index }) : null);
    if (m) {
      const w = num(m[1]), l = num(m[2]), a = w * l;
      if (a >= 4 && a <= 150 && !areas[key]) {
        areas[key] = Math.round(a * 100) / 100;
        const near = t.slice(Math.max(0, m.index - 10), m.index).split(/[،,.؛;]/).pop() + t.slice(m.index, m.index + m[0].length + 14).split(/[،,.؛;]/)[0];
        dims[key] = { w: Math.min(w, l), l: Math.max(w, l), tol: tolOf(near), quote: quoteOf(t, m.index, m.index + m[0].length) };
        understood.push(`${label(key)} ${m[1]}×${m[2]} م (${areas[key]} م²)`);
      }
      continue;
    }
    const re2 = new RegExp(`(?:${words})${GAP}(\\d+(?:\\.\\d+)?)\\s*(?:م2|م²|متر مربع|مترمربع|متر)`), m2 = t.match(re2);
    if (m2) { const a = num(m2[1]); if (a >= 4 && a <= 150 && !areas[key]) { areas[key] = a; understood.push(`${label(key)} ${a} م²`); } }
  }
  // أحجام وصفية (تكبير 30٪ من المقاس التصميمي، لا رقم مخترع)
  for (const [key, re] of [['majlis', /مجلس( رجال| الرجال)?( [^ ،,.]+){0,2} (كبير|واسع|فخم|عريض)(?![\u0600-\u06FF])/], ['hall', /صاله( عائليه)?( [^ ،,.]+){0,2} (كبيره|واسعه|فخمه|عريضه)(?![\u0600-\u06FF])/], ['kitchen', /مطبخ( [^ ،,.]+){0,2} (كبير|واسع|عريض)(?![\u0600-\u06FF])/], ['master', /(ماستر|الرئيسيه)( [^ ،,.]+){0,2} (كبيره|واسعه|كبير|واسع)(?![\u0600-\u06FF])/]]) {
    if (!areas[key] && re.test(t)) { prefs['big_' + key] = true; understood.push(`${label(key)} ${['hall', 'master'].includes(key) ? 'واسعة' : 'واسع'}`); }
  }
  // سعة المجلس: «يتسع لعشرين شخص» ← المساحة بافتراض تصميمي 1.6 م² للشخص في جلسة جدارية (ليس اشتراطًا نظاميًا)
  const cap = t.match(/مجلس[^،,.]{0,22}?(?:يتسع|يكفي|يستوعب|ياخذ|يشيل|يجلس فيه|ل) ?(?:ل|الي|الى)? ?(\d+|عشرين|ثلاثين|اربعين|خمسين|خمسه عشر|عشر|عشره) ?(?:شخص|اشخاص|نفر|انفار|ضيف|ضيوف|رجال|رجل|واحد)/);
  if (cap && !areas.majlis) { const n = num(cap[1]); if (n >= 4 && n <= 80) { areas.majlis = Math.round(n * 1.6); understood.push(`مجلس يتسع لـ${n} شخصًا ≈ ${areas.majlis} م² (افتراض تصميمي 1.6 م² للشخص)`); } }
  // مقارنة بالتصميم المعروض: «المجلس أكبر»، «الصالة أصغر» ← معامل تكبير/تصغير معلن (25٪)
  const tweaks = {};
  // «صغّر المجلس» و«كبّر الصالة» (الفعل قبل الفراغ) كما «المجلس أصغر»؛ ومع مقاس صريح يكفي المقاس (لا معامل فوقه)
  const VB = (v, w) => new RegExp(`(?<![\\u0600-\\u06FF])(?:${v})(?:و|ي)? (?:لي |لنا )?(?:ال)?${w}(?! ?\\d)`);
  for (const [re, key, ar] of [[/مجلس (اكبر|اوسع)/, ['majlisScale', 1.25], 'المجلس أكبر'], [/مجلس (اصغر|اضيق)/, ['majlisScale', .8], 'المجلس أصغر'],
    [VB('صغر|ضيق|قلل', 'مجلس'), ['majlisScale', .8], 'المجلس أصغر'], [VB('كبر|وسع', 'مجلس'), ['majlisScale', 1.25], 'المجلس أكبر'], [VB('صغر|ضيق|قلل', 'صاله'), ['hallScale', .8], 'الصالة أصغر'], [VB('كبر|وسع', 'صاله'), ['hallScale', 1.25], 'الصالة أكبر'], [VB('كبر|وسع', 'مطبخ'), ['kitchenScale', 1.2], 'المطبخ أكبر'], [/صاله (اكبر|اوسع)/, ['hallScale', 1.25], 'الصالة أكبر'], [/صاله (اصغر|اضيق)/, ['hallScale', .8], 'الصالة أصغر'], [/مطبخ (اكبر|اوسع)/, ['kitchenScale', 1.2], 'المطبخ أكبر'], [/(غرف|غرفه)( ال)?( نوم)? (اكبر|اوسع)|ماستر (اكبر|اوسع)/, ['bedroomScale', 1.2], 'غرف النوم أكبر'], [/(البيت|المبني|المسطح|البناء) (اصغر|اقل)/, ['envScale', .9], 'المبنى أصغر']]) {
    if (re.test(t) && !(key[0] in tweaks) && !(key[0] === 'majlisScale' && dims.majlis) && !(key[0] === 'hallScale' && dims.hall) && !(key[0] === 'kitchenScale' && dims.kitchen)) { tweaks[key[0]] = key[1]; understood.push(ar); }
  }
  // القواعد المكانية وعدم الوجود وعدد الأدوار
  const R = extractRules(t);
  const rules = R.rules;
  // «ما نحتاج مجلس نساء» / «ما أبي مجلس نساء»: بدون مجلس النساء فقط — كانت تُقرأ «بدون مجلس» فتُلغى المجالس كلها
  // ومنها مجلس الرجال الذي طلبه العميل. يبقى مجلس واحد ما لم ينفِ المجلس نفسه في موضع آخر.
  const NO_WOMEN = `(?<![\\u0621-\\u064A])[وف]?(?:بدون|بلا|من غير|(?:ما|لا) ?(?:ابي|ابغي|ابغا|نبي|نبغي|نبغا|اريد|نريد|احتاج|نحتاج|يحتاج)) (?:ال)?(?:مجلس|مجالس) (?:ال)?(?:نساء|حريم|نسوان)`;
  let absentKeys = R.absent;
  if (absentKeys.includes('majlis') && new RegExp(NO_WOMEN).test(t) && !extractRules(t.replace(new RegExp(NO_WOMEN, 'g'), ' ')).absent.includes('majlis')) {
    absentKeys = absentKeys.filter(k => k !== 'majlis'); c.majlis = c.majlis === 0 ? 0 : Math.min(c.majlis ?? 1, 1); understood.push('بدون مجلس نساء (مجلس واحد)');
  }
  // عدد المجالس من الكلام نفسه: ذكر «المجلس» مرة بعد مرة ليس مجالس جديدة. مجلس رجال ومجلس نساء = 2، أحدهما = 1،
  // والعدد الصريح («مجلسين»، «مجلس واحد») يتقدم. يُصحَّح به عدد النموذج الذي يعدّ كل ذكر للمجلس غرفة.
  {
    const negW = /(?:بدون|بلا|من غير|(?:ما|لا) ?(?:ابي|ابغي|نبي|نبغي|اريد|نريد|احتاج|نحتاج|يحتاج)) (?:ال)?(?:مجلس|مجالس) (?:ال)?(?:نساء|حريم|نسوان)|no (?:women|ladies)(?:'s)? majlis/;
    // «مجلس النساء مستقل عن الرجال» يفترض مجلسًا للرجال أيضًا (فصل بين مجلسين، لا مجلس واحد)
    const men = /مجلس(?:ا)? (?:ال|لل)?(?:رجال|ضيوف)|(?:men|guest)(?:'s)? majlis|majlis (?:لل|ل)?(?:رجال|men)|(?:مستقل|منفصل|بعيد|معزول)(?:ه)? (?:عن|من) (?:مجلس )?(?:ال)?رجال/.test(t);
    const women = /مجلس(?:ا)? (?:ال|لل)?(?:نساء|حريم|نسوان)|(?:women|ladies)(?:'s)? majlis/.test(t.replace(new RegExp(negW.source, 'g'), ' '));
    const ex = t.match(/(?<![\u0600-\u06FF])(?:مجلسين|مجلسان)(?![\u0600-\u06FF])|(\d+|ثلاث|اربع) مجالس|مجلس (?:واحد|وحيد)(?![\u0600-\u06FF])/);
    const explicit = ex ? (ex[1] ? num(ex[1]) : /مجلسين|مجلسان/.test(ex[0]) ? 2 : 1) : null;
    const said = explicit ?? (men || women ? (men && women ? 2 : 1) : null);
    if (said !== null && Number.isInteger(said) && c.majlis !== 0 && c.majlis !== said) { countFixes.push(`المجالس ${said} (لا ${c.majlis ?? 'غير محدد'})`); c.majlis = said; }
    // (الجولة الثانية عشرة) «المجالس» بالجمع بلا تحديد (لا عدد صريح، ولا رجال ونساء معًا): غامض — مجلس أم مجلسان؟ يُسأل العميل،
    // والافتراضي المعلن (قيمة تصميمية افتراضية للميزان، العرف السعودي حين لا يُذكر الرجال والنساء): مجلس رجال واحد ما لم يحدد النموذج غيره
    const plural = t.match(/(?<![؀-ۿ])(?:و|ب|بال|ال|لل|وال)?مجالس(?![؀-ۿ])/);
    if (plural && explicit === null && !(men && women) && !absentKeys.includes('majlis')) {
      ambiguous.push({ type: 'majlis-plural', quote: quoteOf(t, plural.index, plural.index + plural[0].length) || 'المجالس' });
      if (!(Number.isInteger(c.majlis) && c.majlis > 0)) { c.majlis = 1; understood.push('مجلس رجال واحد (قيمة تصميمية افتراضية للميزان؛ «المجالس» غامضة: سؤال للعميل)'); }
    }
    // المطبخ: ذكره مرتين ليس مطبخين — المطبخ الثاني يُطلب صراحة
    if (c.kitchens > 1 && !/مطبخين|مطبخ (?:ال)?(?:تحضيري|خارجي|ثاني)|(?:2|two|اثنين) (?:مطابخ|kitchens)/.test(t)) { countFixes.push(`مطبخ واحد (لا ${c.kitchens})`); c.kitchens = 1; }
  }
  for (const k of absentKeys) {
    if (k === 'majlis') { c.majlis = 0; understood.push('بدون مجلس'); }
    else if (k === 'dining') { c.dining = 0; understood.push('بدون غرفة طعام'); }
    else { delete extras[k]; understood.push('بدون ' + ({ office: 'مكتب', prayer: 'مصلى', maid: 'غرفة خادمة', driver: 'غرفة سائق' }[k] || k)); }
  }
  // «احذف المكتب»، «شيل المصلى»، «ما نبغى خدامة»، «ما فيه داعي لغرفة خادمة ولا سواق»: حذف أو رفض صريح —
  // (حدود الكلمة بالحروف العربية وحدها: الفاصلة «،» من نطاق U+0600 فلا تُعدّ حرفًا)
  // كانت تُقرأ طلبَ إضافة (الكلمة وحدها تكفي لإضافة الفراغ). تُحذف من الإضافات وتُسجَّل «بدون …».
  const DROP_WORD = { مكتب: 'office', مصلي: 'prayer', مصلا: 'prayer', خادمه: 'maid', خدامه: 'maid', شغاله: 'maid', عامله: 'maid', سائق: 'driver', سواق: 'driver', غسيل: 'laundry', مخزن: 'storage', مستودع: 'storage' };
  const DROP_AR = { office: 'مكتب', prayer: 'مصلى', maid: 'غرفة خادمة', driver: 'غرفة سائق', laundry: 'غرفة غسيل', storage: 'مخزن' };
  const DW = Object.keys(DROP_WORD).join('|');
  const DROP_RE = new RegExp(`(?<![\\u0621-\\u064A])[وف]?(?:(?:احذف|احذفو|احذفوا|حذف|شيل|شيلو|شيلوا|امسح|الغ|الغي|ازل|ازيل|بلاش)(?: لي| لنا)? |(?:ما|لا) ?(?:ابي|ابغي|ابغا|نبي|نبغي|نبغا|اريد|نريد|احتاج|نحتاج|يحتاج) |(?:ما )?(?:فيه |في )?(?:له |لها )?داعي ?)(?:ال|لل|ل)?(?:غرفه )?(?:ال)?(${DW})(?![\\u0621-\\u064A])((?: ولا (?:ال|لل|ل)?(?:غرفه )?(?:ال)?(?:${DW})(?![\\u0621-\\u064A]))*)`, 'g');
  const drop = new Set();
  for (const m of t.matchAll(DROP_RE)) { drop.add(DROP_WORD[m[1]]); for (const w of (m[2] || '').matchAll(new RegExp(`(${DW})`, 'g'))) drop.add(DROP_WORD[w[1]]); }
  for (const k of drop) {
    delete extras[k];
    for (let i = understood.length - 1; i >= 0; i--) if (understood[i].startsWith(DROP_AR[k])) understood.splice(i, 1);
    understood.push('بدون ' + DROP_AR[k]);
  }
  if (R.noCorridors) { prefs.noCorridors = true; understood.push('أقل ما يمكن من الممرات (الحركة عبر الصالة)'); }
  if (R.floors) { prefs.floors = R.floors; understood.push(R.floors === 2 ? 'دوران (أرضي وأول)' : 'دور واحد'); }
  for (const r of rules) understood.push(r.text);
  // (الجولة الثانية عشرة) مواقف السيارات تُرسم في الارتداد داخل حدود الأرض (موقف أو موقفان)؛ الكراج المغلق داخل المبنى لا يُرسم بعد
  // طلب موقف صريح لا ذكر السيارات عرضًا («بعيد عن الشارع عشان الإزعاج والسيارات» ليس طلب موقف)
  if (has(/مواقف|موقفين|موقف (?:ل|ال)?سيار|مظله (?:ل|ال)?سيار|(?:كراج|قراج|جراج|garage|parking|carport)[^،.]{0,20}سيار|(?:^|[\s،.])(?:ل|ب)سيار(?:ه|تين|ات)|سيارتين/i)) { prefs.parking = true; understood.push('مواقف سيارات في الارتداد داخل حدود الأرض'); }
  if (has(/كراج|قراج|جراج/)) unsupported.push('الكراج المغلق داخل المبنى: لا يُرسم في هذا الإصدار؛ تُرسم مواقف مكشوفة في الارتداد بدلًا منه.');
  if (has(/(بيت|فيلا|منزل|مبني) (صغير|اقتصادي)|اقتصادي/) && !tweaks.envScale) { tweaks.envScale = .9; tweaks.bedroomScale = (tweaks.bedroomScale || 1) * .95; understood.push('مسطح أصغر (اقتصادي): المبنى أصغر بنحو 10٪ من المقاسات التصميمية المعتادة'); }
  if (has(/(?<![\u0600-\u06FF])(?<!(?:حمام|حمامها|بحمام|بحمامها|دوره مياه) (?:ال)?)(?:ال)?ملحق(?![\u0600-\u06FF])/)) unsupported.push('الملحق الخارجي: لا يُرسم في هذا الإصدار؛ يمكن إضافته في المرسم.');
  if (has(/(?<![\u0600-\u06FF])و?(?:ال)?(?:سطح|روف)(?![\u0600-\u06FF])/)) unsupported.push('السطح وغرفة السطح: لا تُرسم في هذا الإصدار.');
  if (has(/(?<![\u0600-\u06FF])و?(?:ال)?(?:بلكون|بلكونه|بلكونات|شرفه|شرفات|تراس)(?![\u0600-\u06FF])/)) unsupported.push('الشرفات والتراس: لا تُرسم في هذا الإصدار.');
  if (has(/فناء|حوش داخلي|كورت ?يارد/)) unsupported.push('الفناء الداخلي: هذا المولّد لا يرسمه بعد؛ ما يزيد عن المبنى يبقى ساحات خارجية.');
  if (has(/مسبح|حمام سباحه/)) unsupported.push('المسبح: خارج المبنى ولا يُرسم في هذا الإصدار.');
  if (has(/مصعد|اسانسير/)) unsupported.push('المصعد: غير مدعوم في هذا الإصدار.');
  if (has(/قبو|بدروم/)) unsupported.push('القبو: غير مدعوم في هذا الإصدار.');
  // شكل الأرض غير المستطيل: يُحمل بنيويًا ويُعلن أنه غير مدعوم (المولّد مستطيل فقط)
  let site = null;
  const sh = t.match(/(?:ال)?(?:ارض|قطعه|القطعه|الارض)[^،.؛]{0,24}?(شبه منحرف|منحرف(?:ه)?|غير منتظم(?:ه)?|غير مستطيل(?:ه)?|مثلث(?:ه)?|مثلثيه|زاويه حاده|مايل(?:ه)?|غير مربع(?:ه)?|منكسر(?:ه)?)|(?<![a-z])(?:irregular|trapezoid(?:al)?|triangular|non-rectangular) (?:plot|land|site)/);
  if (sh) {
    const shapeAr = sh[1] ? sh[1].replace(/ه$/, '') : 'غير منتظم', g = re => { const m = t.match(re); return m ? Number(m[1]) : null; };
    site = { irregular: true, shape: /منحرف|trapez/.test(sh[0]) ? 'trapezoid' : /مثلث|triang/.test(sh[0]) ? 'triangle' : 'irregular', shapeAr, front: g(/(?:ال)?واجهه (\d+(?:\.\d+)?)/), back: g(/(?:ال)?خلف(?:يه)? (\d+(?:\.\d+)?)/), depth: g(/عمق(?:ها|ه)? (\d+(?:\.\d+)?)/), quote: quoteOf(t, sh.index, Math.min(t.length, sh.index + sh[0].length)) };
    unsupported.push(`شكل الأرض (${shapeAr}${site.front ? `: الواجهة ${site.front} م` : ''}${site.back ? `، الخلف ${site.back} م` : ''}${site.depth ? `، العمق ${site.depth} م` : ''}): المولّد يقبل أرضًا مستطيلة فقط؛ سيُصمَّم على مستطيل ويُعلَّم البند «لم يُتحقق».`);
  }
  // «احتفظ بهذا التوزيع»: تعديل لا يغيّر المخطط
  const keepLayout = has(/(?:احتفظ|حافظ|خل|خلي|ابق|ابقي|ثبت|بدون ما تغير|لا تغير|ما تغير|لا تغيير)(?: علي| على)? ?(?:ب?هذا |ب?هذي |ب?نفس |ب)?(?:ال)?(?:توزيع|تقسيم|مخطط|مسقط)|نفس (?:ال)?(?:توزيع|تقسيم|مخطط|مسقط)|(?<![a-z])keep (?:the |this )?(?:same )?(?:layout|plan)(?![a-z])/);
  if (keepLayout) understood.push('الإبقاء على التوزيع الحالي كما هو');
  // الواجهة: مادة أو طراز — تُحمل كتعديل facade، وعرضها في المجسّم لاحقًا
  const fm = t.match(/(?<![؀-ۿa-z])(?:ال|و|بال)?(?:واجهه|واجهات|facade|elevation)s?(?![؀-ۿa-z])([^،,.؛]{0,40})/);
  if (fm) {
    const zone = t.slice(Math.max(0, fm.index - 30), fm.index).split(/[،,.؛;]/).pop() + ' ' + fm[0], mat = pickWord(FACADE_MATERIALS, zone), sty = pickWord(FACADE_STYLES, zone);
    if (mat || sty) {
      // (الجولة الثامنة عشرة) نطاق الواجهة: «الأمامية فقط» / «كل الواجهات» / «والسور» — وإلا يبقى غير محدد (الافتراضي في التعديل: كل الواجهات
      // الظاهرة والدروة، ويُسأل العميل) — المراجع المستقل r17: الحجر على الواجهة الأمامية وحدها بدا «خفيفًا»
      const scope = /(?:واجهه|واجهات) ?(?:ال)?امامي(?:ه)? ?(?:فقط|بس|وحدها)|(?:فقط|بس) ?(?:ال)?(?:واجهه|واجهات) ?(?:ال)?امامي/.test(t) ? 'front' : /(?:ال)?سور/.test(t) ? 'all+fence' : /(?:كل|جميع) (?:ال)?(?:واجهات|جهات)/.test(t) ? 'all' : null;
      tweaks.facade = { ...(mat ? { material: mat.id, materialAr: mat.ar } : {}), ...(sty ? { style: sty.id, styleAr: sty.ar } : {}), keepLayout: !!keepLayout, ...(scope ? { scope } : {}) };
      understood.push(`الواجهة: ${[mat?.ar, sty?.ar].filter(Boolean).join('، ')} (يُحفظ في المتطلبات، وعرضه في المجسّم لاحقًا)`);
    }
  }
  // اقتباس كل قاعدة بكلام العميل الأصلي
  for (const r of rules) if (Array.isArray(r.at)) r.quote = quoteOf(t, r.at[0], r.at[1]) || r.quote;
  const orphanQuotes = (R.orphans || []).map(o => quoteOf(t, o.at[0], o.at[1]) || o.quote).filter(Boolean);

  // حمام لكل غرفة يرفع عدد دورات المياه إلى ما يكفي
  if (prefs.allEnsuite && c.bedrooms) {
    const need = c.bedrooms + Math.min(2, c.majlis || 0) + (extras.maid?.bath ? 1 : 0) + (extras.driver?.bath ? 1 : 0);
    if (!c.baths || c.baths < need) { c.baths = need; understood.push(`عدد دورات المياه ${need} (حمام لكل غرفة${c.majlis ? (c.majlis > 1 ? ' + دورتا مياه الرجال والنساء' : ' + دورة مياه الرجال') : ''}${extras.maid?.bath ? ' + حمام الخادمة' : ''}${extras.driver?.bath ? ' + حمام السائق' : ''})`); }
  }
  // دورات مياه مشتركة: «تتشارك حمام» ليس عددًا؛ العدد اللازم = الضيوف + الرئيسية + واحدة لكل غرفتين + الخدمة
  if (prefs.sharedBaths && !prefs.allEnsuite && c.bedrooms) {
    const need = Math.min(2, c.majlis || 0) + 1 + Math.ceil((c.bedrooms - 1) / 2) + (extras.maid?.bath ? 1 : 0) + (extras.driver?.bath ? 1 : 0);
    if (!c.baths || c.baths < need) { c.baths = need; understood.push(`عدد دورات المياه ${need} (الرئيسية بحمامها، وكل غرفتين تتشاركان واحدة${c.majlis ? '، ودورة مياه للضيوف' : ''})`); }
  }
  // (الجولة الثالثة عشرة، قرار المالك) نسبة الزجاج إلى أرضية الغرفة اختيار العميل لا قيمة افتراضية: عامة («الزجاج 12٪»، «نوافذ كبيرة») أو
  // لغرفة («المجلس زجاج 20٪»، «غرف النوم نوافذ صغيرة»، «نوافذ كبيرة للصالة»). «كبيرة» تُقرأ 15٪ و«صغيرة» 5٪ ويُذكر ذلك له. تُحمل في prefs.glazing
  { const GROOMS = [['women', 'مجلس (?:ال)?(?:نساء|حريم)'], ['majlis', '(?:ال)?مجلس(?: (?:ال)?رجال)?|(?:ال)?مجالس'], ['master', '(?:ال)?ماستر|(?:الغرفه )?الرئيسيه'], ['bedroom', 'غرف(?:ه)? (?:ال)?نوم|(?:ال)?غرف(?:ه)?'], ['living', '(?:ال)?صاله'], ['kitchen', '(?:ال)?مطبخ'], ['dining', '(?:ال)?طعام|(?:ال)?سفره']];
    const KW = /(?:ال)?(?:زجاج|نوافذ|نافذه|شبابيك|شباك|دريش)\w*/g, PCT = /(\d+(?:[.,]\d+)?) ?(?:٪|%|بالمئه|بالميه|في المئه|بالمائه)/, BIG = /(?:كبير|واسع|كثير|عريض)/, SMALL = /(?:صغير|قليل|ضيق)/;
    const ROOM_AR = { women: 'مجلس النساء', majlis: 'المجلس', master: 'الغرفة الرئيسية', bedroom: 'غرف النوم', living: 'الصالة', kitchen: 'المطبخ', dining: 'الطعام' };
    const glazing = { rooms: {} }; let any = false;
    for (const m of t.matchAll(KW)) {
      const a = Math.max(0, m.index - 28), b = Math.min(t.length, m.index + m[0].length + 22), win = t.slice(a, b), after = t.slice(m.index, b), before = t.slice(a, m.index + m[0].length);
      const conj = t[m.index - 1] === 'و' || t.slice(Math.max(0, m.index - 2), m.index) === 'و '; // «ونوافذ…»: عبارة جديدة لا تأخذ رقم ما قبلها
      const just = conj ? '' : t.slice(Math.max(0, m.index - 12), m.index), pm = after.match(PCT) || just.match(PCT); let pct = pm ? Number(pm[1].replace(',', '.')) : null, how = pct !== null ? `${pct}٪` : null;
      const wordWin = after + ' ' + (conj ? '' : t.slice(Math.max(0, m.index - 10), m.index));
      if (pct === null) { if (BIG.test(wordWin)) { pct = 15; how = 'كبيرة (قُرئت 15٪)'; } else if (SMALL.test(wordWin)) { pct = 5; how = 'صغيرة (قُرئت 5٪)'; } }
      if (pct === null || !(pct >= 1 && pct <= 60)) continue;
      const near = t.slice(Math.max(0, m.index - 14), m.index), roomRe = re => new RegExp(`(?<![\\u0600-\\u06FF])(?:لل|ل|و|ب|في)?(?:${re})(?![\\u0600-\\u06FF])`);
      const firstIn = str => { let best = null; for (const g of GROOMS) { const mm = str.match(roomRe(g[1])); if (mm && (!best || mm.index < best.i)) best = { g, i: mm.index }; } return best?.g || null; };
      const room = firstIn(after) || (!conj && (firstIn(near) || firstIn(before))) || null;
      if (room) { if (glazing.rooms[room[0]] === undefined) { glazing.rooms[room[0]] = pct; understood.push(`زجاج ${ROOM_AR[room[0]]} ${how} من أرضيتها (طلب العميل)`); any = true; } }
      else if (glazing.all === undefined) { glazing.all = pct; understood.push(`زجاج الغرف ${how} من أرضيتها (طلب العميل)`); any = true; }
    }
    if (any) prefs.glazing = glazing; }
  // (الجولة 21 — مقترح) عدد التصاميم الذي طلبه العميل نصًا (يقرؤه العقد الموحد parseRequestedCount؛ هنا سطر «فهمت» فقط)
  { const n = parseRequestedCount(text); if (n) understood.push(`${n} ${n === 1 ? 'تصميم' : n === 2 ? 'تصميمان' : 'تصاميم'} مطلوبة (طلب العميل)`); }
  const uc = clauses ? unclearClauses(text) : [];
  const unclear = clauses ? [...new Set([...uc, ...orphanQuotes.filter(o => !uc.some(u => u.includes(o)))])] : [];
  return {
    counts: c, extras, prefs, areas, dims, rules, tweaks, understood: [...new Set(understood)], unsupported, unclear,
    textCounts, givenCounts: { ...counts }, absent: [...new Set([...absentKeys, ...drop])], orphans: orphanQuotes, ...(site ? { site } : {}), ...(keepLayout ? { keepLayout: true } : {}),
    ...(corrected ? { countCorrection: { bedrooms: corrected } } : {}), ...(countFixes.length ? { countFixes } : {}), ...(ambiguous.length ? { ambiguous } : {}),
    ...sharedOf(text, rules, dims),
  };
}

// كلمات لا تحمل طلبًا (طلب، تحية، حشو) وكلمات البرنامج التي تُفهم أعدادًا
const FILLER = new Set('ابي ابغي ابغا ابا اريد نبي نبغي ودي ودنا حاب احب ابيه ابيها ابيهم بيت البيت فيلا الفيلا منزل المنزل فيها فيه يكون تكون تصير يصير لازم خل خلي خله خلها مع و في على ع من الي اللي الى عن ب ل يا لو سمحت الله يعطيك العافيه شكرا السلام عليكم مرحبا هلا اهلا ايضا كمان بعد زين طيب ان انه انها حق حقي حقنا لنا لي عندي عندنا عائله عايله كبيره صغيره نحن احنا نفر اشخاص شخص افراد اسره تصميم صمم صممي ارسم ارسمي حط حطي سو سوي يكون فيه واحد وحده اثنين ثنتين ثلاث اربع خمس ست سبع ثمان تسع عشر دور الدور ارضي واحد فقط بس بالضبط بالظبط تماما تقريبا حوالي منها منهم منهن الباقي باقي بقيه ثلاثه اربعه خمسه سته سبعه ثمانيه تسعه عشره i want we need need please a an the with and of in on house villa home'.split(' '));
const PROGRAM = /^(?:و|ب|ل|ال|بال|وال|لل)*(?:غرف|غرفه|غرفتين|نوم|ماستر|مجلس|مجالس|مجلسين|صاله|صالات|صالتين|مطبخ|مطابخ|طعام|سفره|حمام|حمامات|حمامين|دوره|دورات|مياه|خادمه|سائق|مكتب|مصلي|غسيل|مخزن|رجال|نساء|ضيوف|رئيسيه)$|^(?:bed ?rooms?|majlis|kitchens?|living|hall|dining|rooms?|bath(?:room)?s?|toilets?|maid|driver|office|master)$/;
/** عبارات من كلام العميل لم يُستخرج منها شيء: تُعرض له بصدق ليعيد صياغتها بدل أن تُهمل بصمت. */
export function unclearClauses(text) {
  const out = [];
  for (const raw of String(text || '').split(/[،,.؛;\n!?؟]+|\s(?=و(?:ابي|ابغى|ابغي|اريد|خل|خلي|ودي|لا |ما ))/)) {
    const clause = raw.trim(); if (clause.length < 4) continue;
    const r = extractRequirements(clause, { clauses: false });
    if (r.understood.length || r.unsupported.length) continue;
    const t = normalizeAr(clause), toks = t.split(' ').filter(w => w && !FILLER.has(w) && !FILLER.has(w.replace(/^و/, '')) && !/^\d+(?:[.,]\d+)?$/.test(w) && !PROGRAM.test(w));
    if (toks.length >= 1) out.push(clause.replace(/^و(?=\S)/, ''));
  }
  // بلا حدّ: لا تُسقط عبارة غير مفهومة لأن ما قبلها كثير
  return out;
}
const CLAUSE_SPLIT = /[،,.؛;\n!?؟]+|\s(?=و(?:ابي|ابغى|ابغي|اريد|خل|خلي|ودي|لا |ما ))/;
/**
 * مصير كل عبارة من كلام العميل: understood (فُهمت وما فُهم منها)، unsupported (فُهمت ولا يدعمها الإصدار)، unclear (لم تُفهم).
 * عبارة فُهم بعضها وسقط بعضها (علاقة بلا طرف: «بعيدة عن …») تأخذ مدخلًا ثانيًا unclear باقتباسه.
 * يعيد { clauses:[{ quote, fate, items, kind? }], dropped:[] } — dropped عبارة أو بند لم يصل إلى الطلب الكامل req (يجب أن تكون فارغة).
 */
export function coverage(text, req = null) {
  const full = req || extractRequirements(text);
  const und = new Set(full.understood || []), uns = new Set(full.unsupported || []), unc = full.unclear || [];
  const inUnclear = q => unc.some(u => u === q || u.includes(q) || q.includes(u));
  const clauses = [], dropped = [];
  for (const raw of String(text || '').split(CLAUSE_SPLIT)) {
    const quote = (raw || '').trim().replace(/^و(?=\S)/, ''); if (!quote || !normalizeAr(quote).replace(/[^\p{L}\p{N}]/gu, '')) continue;
    const r = extractRequirements(raw.trim(), { clauses: false }), entries = [];
    if (r.understood.length) entries.push({ quote, fate: 'understood', items: r.understood });
    if (r.unsupported.length) entries.push({ quote, fate: 'unsupported', items: r.unsupported });
    if (!entries.length) {
      const toks = normalizeAr(quote).split(' ').filter(Boolean), content = toks.filter(w => !FILLER.has(w) && !FILLER.has(w.replace(/^و/, '')) && !/^\d+(?:[.,]\d+)?$/.test(w) && !PROGRAM.test(w));
      if (content.length && quote.length >= 4) entries.push({ quote, fate: 'unclear', items: [] });
      else if (toks.some(w => PROGRAM.test(w) || /^\d/.test(w))) entries.push({ quote, fate: 'understood', kind: 'program', items: ['ضمن برنامج الغرف (الأعداد المحددة في النموذج أو المفهومة من الكلام)'] });
      else entries.push({ quote, fate: 'understood', kind: 'filler', items: ['لا يحمل طلبًا (تحية أو حشو)'] });
    }
    for (const o of r.orphans || []) entries.push({ quote: o, fate: 'unclear', kind: 'orphan', items: ['عبارة علاقة لم يُعرف طرفاها'] });
    // اتساق مع الطلب الكامل: ما فُهم في العبارة يجب أن يكون في الطلب، وما لم يُفهم يجب أن يُعرض في unclear
    for (const e of entries) {
      // عدد غرف النوم في عبارة وحدها قد يختلف عن عدد الطلب كله («ثلاث غرف أخرى» + «الرئيسية» في عبارة ثانية = أربع): ليس إسقاطًا
      const bedItem = x => /^\d+ غرف نوم/.test(x) && Number.isInteger(full.textCounts?.bedrooms);
      const ok = e.fate === 'unclear' ? inUnclear(e.quote) : e.fate === 'unsupported' ? e.items.every(x => uns.has(x)) : (e.kind ? true : e.items.some(x => und.has(x) || bedItem(x)));
      if (!ok) dropped.push({ ...e, why: 'لم يصل إلى الطلب الكامل' });
    }
    clauses.push(...entries);
  }
  return { clauses, dropped };
}
function label(key) { return { master: 'الغرفة الرئيسية', majlis: 'المجلس', hall: 'الصالة', dining: 'الطعام', kitchen: 'المطبخ', bedroom: 'غرفة النوم' }[key] || key; }

export default { extractRequirements, normalizeAr, coverage: (...a) => coverage(...a), detectConflicts: (...a) => detectConflicts(...a) };

const ABSENT_AR = { majlis: 'بدون مجلس', dining: 'بدون غرفة طعام', office: 'بدون مكتب', prayer: 'بدون مصلى', maid: 'بدون غرفة خادمة', driver: 'بدون غرفة سائق' };
const PREF_AR = { allEnsuite: 'كل غرفة نوم بحمامها الملحق', sharedBaths: 'غرف النوم (عدا الرئيسية) تتشارك دورات المياه', masterDressing: 'غرفة ملابس للغرفة الرئيسية', openKitchen: 'مطبخ مفتوح على الطعام', closedKitchen: 'مطبخ مغلق بباب', kitchenOpenHall: 'مطبخ مفتوح على الصالة', familyEntrance: 'مدخل مستقل للعائلة/النساء', guestEntrance: 'مجلس الرجال بمدخل مستقل عن العائلة', womenSeparate: 'مجلس النساء منفصل عن منطقة الرجال (لا باب بينهما)', bathsOffHall: 'دورات المياه لا تفتح على الصالة مباشرة', noCorridors: 'أقل ما يمكن من الممرات (الحركة عبر الصالة)', elderlyRoom: 'غرفة نوم قريبة من الصالة لكبار السن' };
const EXTRA_AR2 = { maid: 'غرفة خادمة', driver: 'غرفة سائق', office: 'مكتب', prayer: 'مصلى', storage: 'مخزن', laundry: 'غرفة غسيل', guestRoom: 'غرفة نوم للضيوف' };
/**
 * يدمج فهم Claude (منقّحًا بـ sanitizeAiRequirements) مع الفهم المحلي. المحلي يتقدم عند التعارض لأنه حتمي ومختبر؛
 * وما فهمه Claude وفات المحلي يُضاف. «لم أفهم» تصير حكم Claude (هو الأقدر على الصياغات الحرة).
 */
export function withAi(local, ai) {
  if (!ai || typeof ai !== 'object') return local;
  const out = JSON.parse(JSON.stringify(local)), und = [...(out.understood || [])];
  out.counts ||= {}; out.prefs ||= {}; out.extras ||= {}; out.areas ||= {};
  const aiRules = (ai.rules || []).map(r => ({ ...r, ai: true, text: ruleText(r) }));
  out.rules = mergeRules(aiRules, out.rules || []);
  for (const r of out.rules) if (!und.includes(r.text)) und.push(r.text);
  for (const k of ai.absent || []) { if (k === 'majlis' || k === 'dining') out.counts[k] = 0; else delete out.extras[k]; und.push(ABSENT_AR[k]); }
  if (ai.floors && !out.prefs.floors) { out.prefs.floors = ai.floors; und.push(ai.floors === 2 ? 'دوران (أرضي وأول)' : 'دور واحد'); }
  for (const p of ai.prefs || []) {
    if (p === 'closedKitchen') { if (out.prefs.openKitchen === undefined) { out.prefs.openKitchen = false; und.push(PREF_AR[p]); } continue; }
    if (out.prefs[p] === undefined) { out.prefs[p] = true; und.push(PREF_AR[p]); }
  }
  for (const [k, v] of Object.entries(ai.extras || {})) if (!out.extras[k]) {
    out.extras[k] = ['maid', 'driver', 'guestRoom'].includes(k) ? { bath: !!v.bath, ext: !!v.ext } : k === 'office' ? (v.ext ? { ext: true } : true) : true;
    und.push(EXTRA_AR2[k] + (v.bath ? ' بحمام' : '') + (v.ext ? ' بباب خارجي' : ''));
  }
  for (const [k, a] of Object.entries(ai.areas || {})) if (!out.areas[k]) { out.areas[k] = a; und.push(`${{ master: 'الغرفة الرئيسية', majlis: 'المجلس', hall: 'الصالة', dining: 'الطعام', kitchen: 'المطبخ', bedroom: 'غرفة النوم' }[k]} ${a} م²`); }
  out.understood = [...new Set(und.filter(Boolean))];
  // «لم أفهم» حكم Claude، لكن عبارة علاقة سقطت محليًا لا تختفي إلا إن غطّتها قاعدة من Claude باقتباسها
  const covered = o => aiRules.some(r => r.quote && normalizeAr(r.quote).includes(normalizeAr(o)));
  out.unclear = [...new Set([...(ai.unclear || []), ...(local.orphans || []).filter(o => !covered(o))])];
  out.source = 'claude';
  return out;
}

// ------------------------------------------------------------------------------------------ التعارضات قبل التوليد
const SUBJ_AR = id => subjectAr(id);
const FLOOR_AR = { ground: 'الدور الأرضي', upper: 'الدور العلوي' };
const AREA_ROOM_AR = { master: 'الغرفة الرئيسية', majlis: 'المجلس', hall: 'الصالة', dining: 'الطعام', kitchen: 'المطبخ', bedroom: 'غرفة النوم' };
const ABSENT_SUBJ = { majlis: ['majlis', 'majlis_w'], dining: ['dining'], office: ['office'], prayer: ['prayer'], maid: ['maid'], driver: ['driver'] };
const r1c = v => Math.round(v * 10) / 10;
/**
 * يكشف التعارضات في الطلب قبل التوليد، ولكل تعارض سؤال بلهجة سعودية بسيطة للعميل. لا يرمي ولا يغيّر الطلب.
 * يعيد [{ type, key, items, quotes, question_ar }]. land اختيارية: { width, length, floors, setbacks? }.
 * الحدود المستعملة هندسية بحتة (مساحة الأرض × الأدوار، أبعاد الأرض)؛ لا نسبة بناء نظامية مفترضة.
 */
export function detectConflicts(req = {}, land = {}) {
  const out = [], rules = req.rules || [], seen = new Set();
  // المفتاح من نوع التعارض ونصوصه (لا من أرقام القواعد التي يعيد الدمج ترقيمها)
  const add = (type, items, quotes, question_ar) => { const key = type + '|' + [...quotes.filter(Boolean).map(x => normalizeAr(x))].sort().join('|') + '|' + items.filter(x => !/^R\d+$/.test(x)).join('|'); if (seen.has(key)) return; seen.add(key); out.push({ type, key, items, quotes: quotes.filter(Boolean), question_ar }); };
  const q = r => r.quote || r.text;
  // 1) موضعان متقابلان لنفس الفراغ («المطبخ في الأمام» و«المطبخ في الخلف»)، أو يطل ولا يطل على الجهة نفسها
  const places = rules.filter(r => r.kind === 'place');
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
    const a = places[i], b = places[j]; if (a.a !== b.a) continue;
    const pos = x => x.mode !== 'avoid';
    if (pos(a) && pos(b) && OPPOSITE_SIDE[a.side] === b.side) add('place-opposite', [a.id, b.id], [q(a), q(b)], `ذكرت إن «${SUBJ_AR(a.a)}» يكون ${SIDE_LABELS[a.side]} و${SIDE_LABELS[b.side]} بنفس الوقت — وين تبيه بالضبط؟`);
    else if (a.side === b.side && (a.mode === 'avoid') !== (b.mode === 'avoid')) add('place-avoid', [a.id, b.id], [q(a), q(b)], `مرة قلت «${SUBJ_AR(a.a)}» على ${a.side === 'front' ? 'الشارع' : 'هذي الجهة'} ومرة قلت لا — أي واحد تقصد؟`);
  }
  // 2) ملاصق/قريب وبعيد/غير ملاصق لنفس الزوج
  const rels = rules.filter(r => ['adjacent', 'near', 'far', 'apart'].includes(r.kind));
  for (let i = 0; i < rels.length; i++) for (let j = i + 1; j < rels.length; j++) {
    const a = rels[i], b = rels[j], same = (a.a === b.a && a.b === b.b) || (a.a === b.b && a.b === b.a); if (!same) continue;
    const close = x => x.kind === 'adjacent' || x.kind === 'near';
    if (close(a) !== close(b)) { const c = close(a) ? a : b, f = close(a) ? b : a; add('relation-contradiction', [c.id, f.id], [q(c), q(f)], `ذكرت إن «${SUBJ_AR(c.a)}» ${c.kind === 'adjacent' ? 'جنب' : 'قريب من'} «${SUBJ_AR(c.b)}»، وذكرت إنه ${f.kind === 'far' ? 'بعيد عنه' : 'ما يلاصقه'} — تبيهم جنب بعض ولا بعيدين؟`); }
  }
  // 3) نفس الفراغ في الأرضي والعلوي
  const fl = rules.filter(r => r.kind === 'floor');
  for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) {
    const a = fl[i], b = fl[j];
    if (a.a === b.a && a.floor !== b.floor) add('floor-both', [a.id, b.id], [q(a), q(b)], `«${SUBJ_AR(a.a)}» تبيه في الدور الأرضي ولا العلوي؟ ذكرت الاثنين.`);
    // «غرف النوم فوق» و«غرفة الوالدة في الأرضي»: هل الثانية من ضمن الأولى؟
    // («غرف الأبناء» لا تشمل الرئيسية ولا غرفة الوالدين في المولّد، فلا تعارض معها)
    const grp = x => x.a === 'bedrooms', member = x => ['elderly', 'master', 'onebed'].includes(x.a);
    // (الجولة الثانية عشرة) ما دام السؤال بلا جواب يُرسم بالقراءة الحرفية (العدد المذكور في دوره، والغرفة الأخرى زيادة عليه في دورها)،
    // ويُذكر ذلك في السؤال نفسه؛ جواب العميل (req.answers) يحسمه فلا يُسأل ثانية
    for (const [g, m] of [[a, b], [b, a]]) if (grp(g) && member(m) && g.floor !== m.floor && !req.answers?.['floor-group-member']) {
      const n = req.textCounts?.bedrooms, lit = Number.isInteger(n) && m.a !== 'master' ? ` رسمت الآن القراءة الحرفية لكلامك: ${n} غرف نوم في ${FLOOR_AR[g.floor]}، و«${SUBJ_AR(m.a)}» زيادة عليها في ${FLOOR_AR[m.floor]} (${n + 1} غرف نوم)؛ إن كانت من ضمن الـ${n} قل «من ضمنها».` : '';
      add('floor-group-member', [g.id, m.id], [q(g), q(m)], `قلت ${SUBJ_AR(g.a)} في ${FLOOR_AR[g.floor]}، و«${SUBJ_AR(m.a)}» في ${FLOOR_AR[m.floor]} — «${SUBJ_AR(m.a)}» من ضمن عدد غرف النوم اللي ذكرته ولا زيادة عليها؟${lit}`);
    }
  }
  // (الجولة الثانية عشرة) كلمة برنامج غامضة: «المجالس» بالجمع بلا تحديد — مجلس أم مجلسان؟ (الافتراضي المرسوم مذكور في السؤال)
  for (const amb of req.ambiguous || []) if (amb.type === 'majlis-plural' && !req.answers?.['majlis-plural']) {
    const n = req.counts?.majlis;
    add('majlis-plural', ['counts.majlis'], [amb.quote], `ذكرت «${amb.quote}» بالجمع — تبي مجلس رجال ومجلس نساء، ولا مجلس رجال واحد؟ رسمت الآن ${n >= 2 ? 'مجلسين (رجال ونساء) كما في الأعداد' : 'مجلس رجال واحد (قيمة تصميمية افتراضية للميزان)'} حتى تجاوبني.`);
  }
  // 4) عدد الأدوار: الكلام مقابل بيانات الأرض، ودور واحد مع طلبات تحتاج دورين
  const said = req.prefs?.floors || null, landFloors = Number.isInteger(land?.floors) ? land.floors : null;
  if (said && landFloors && said !== landFloors) add('floors-mismatch', ['prefs.floors', 'land.floors'], [said === 2 ? 'دورين' : 'دور واحد'], `بيانات الأرض فيها ${landFloors === 2 ? 'دورين' : 'دور واحد'}، وكلامك يقول ${said === 2 ? 'دورين' : 'دور واحد'} — كم دور تبي؟`);
  const single = said === 1 || (!said && landFloors === 1);
  const upper = fl.filter(r => r.floor === 'upper'), stairsRules = rules.filter(r => r.a === 'stairs' || r.b === 'stairs');
  if (single && (upper.length || stairsRules.length)) {
    const what = [...new Set([...upper.map(r => `«${SUBJ_AR(r.a)}» في الدور العلوي`), ...stairsRules.map(r => `مكان «الدرج»`)])];
    add('single-floor-two-floor-features', [...upper, ...stairsRules].map(r => r.id), [...upper, ...stairsRules].map(q), `${said === 1 ? 'طلبت دور واحد' : 'بيانات الأرض دور واحد'}، وذكرت ${what.join(' و')} — تبي البيت دورين، ولا نخلي كل شي في الأرضي؟`);
  }
  // 5) «بدون X» مع قاعدة عن X
  for (const k of req.absent || []) for (const r of rules) if ((ABSENT_SUBJ[k] || []).some(s => r.a === s || r.b === s))
    add('absent-but-placed', ['absent.' + k, r.id], [q(r)], `قلت بدون «${SUBJ_AR(ABSENT_SUBJ[k][0])}»، وبعدين حددت مكانه — تبيه ولا لا؟`);
  // 6) العدد في الكلام مقابل العدد في النموذج
  const tc = req.textCounts || {}, given = req.givenCounts || {};
  // عدد النموذج الذي جمع العددين قبل التصحيح وبعده (أو أخذ الأول) ليس تعارضًا: العميل صحّح كلامه بنفسه
  const cc = req.countCorrection?.bedrooms, polluted = cc && (given.bedrooms === cc.from || given.bedrooms === cc.from + cc.to);
  // (الجولة الثانية عشرة) عدد النموذج = العدد المذكور + الغرفة الزائدة في الدور الآخر (القراءة الحرفية) ليس تعارضًا
  const literalSum = Number.isInteger(tc.bedrooms) && given.bedrooms === tc.bedrooms + 1 && out.some(c => c.type === 'floor-group-member') && req.answers?.['floor-group-member'] !== 'included';
  if (Number.isInteger(tc.bedrooms) && Number.isInteger(given.bedrooms) && given.bedrooms > 0 && tc.bedrooms !== given.bedrooms && !polluted && !literalSum)
    add('count-mismatch', ['textCounts.bedrooms', 'counts.bedrooms'], [`${tc.bedrooms} غرف نوم`], `فهمت من كلامك إن غرف النوم ${tc.bedrooms}، والعدد المختار في النموذج ${given.bedrooms} — كم غرفة نوم تبي بالضبط؟`);
  // 7) المقاسات مقابل الأرض: مجموع المساحات الصريحة أكبر من الأرض × الأدوار، أو بُعد أكبر من الأرض نفسها
  const W = Number(land?.width) || 0, L = Number(land?.length) || 0;
  if (W > 0 && L > 0) {
    const floors = said || landFloors || 1, sb = land.setbacks || null;
    const net = sb && ['n', 's', 'e', 'w'].every(k => Number.isFinite(sb[k])) ? Math.max(0, (W - sb.e - sb.w) * (L - sb.n - sb.s)) : null;
    const cap = (net ?? W * L) * floors, basis = net != null ? `مساحة الأرض بعد الارتدادات × ${floors === 2 ? 'دورين' : 'دور'}` : `مساحة الأرض كلها × ${floors === 2 ? 'دورين' : 'دور'} (بدون ارتدادات)`;
    const beds = Math.max(1, (req.counts?.bedrooms || 1) - (req.areas?.master ? 1 : 0));
    const sum = Object.entries(req.areas || {}).reduce((s, [k, a]) => s + a * (k === 'bedroom' ? beds : 1), 0);
    if (sum > cap) add('area-exceeds-land', Object.keys(req.areas || {}).map(k => 'areas.' + k), Object.values(req.dims || {}).map(d => d.quote), `مجموع المساحات اللي طلبتها حوالي ${r1c(sum)} م² صافي، وهذا أكبر من ${basis} (${r1c(cap)} م²) — تبي نصغّر المقاسات ولا نزيد دور؟`);
    const lo = Math.min(W, L), hi = Math.max(W, L);
    for (const [k, d] of Object.entries(req.dims || {})) if (d && (d.w > lo || d.l > hi))
      add('dims-exceed-land', ['dims.' + k], [d.quote], `مقاس ${AREA_ROOM_AR[k] || k} ${d.w}×${d.l} م أكبر من أبعاد الأرض (${lo}×${hi} م) — متأكد من المقاس؟`);
  }
  return out;
}

// ------------------------------------------------------------------------------------------ القراءة الحرفية (الجولة الثانية عشرة)
const LIT_MEMBERS = new Set(['elderly', 'onebed']);
/**
 * تعارض كُشف ولم يُجب عنه يُرسم بالقراءة الحرفية لكلام العميل، لا بافتراض صامت: «5 غرف نوم فوق… وغرفة لأمي في الأرضي»
 * = 5 في العلوي + غرفة الأم في الأرضي (6 غرف نوم). يبقى السؤال ظاهرًا (detectConflicts) حتى يجيب العميل؛ وجوابه (req.answers)
 * يغلب: «من ضمنها» ← العدد المذكور كله، «زيادة» ← القراءة الحرفية. يعدّل req.counts في مكانه ويسجّل req.literal (بند في السجل).
 * متكرر الاستدعاء بلا أثر مضاعف. يعيد req.
 */
export function applyLiteralReadings(req = {}, land = {}) {
  if (!req || typeof req !== 'object') return req;
  req.counts ||= {};
  const ans = req.answers?.['floor-group-member'];
  const rules = req.rules || [], n = req.textCounts?.bedrooms;
  const lit = [];
  if (Number.isInteger(n) && n > 0 && ans !== 'included') {
    const grp = rules.find(r => r.kind === 'floor' && r.a === 'bedrooms');
    const mem = grp ? rules.filter(r => r.kind === 'floor' && LIT_MEMBERS.has(r.a) && r.floor !== grp.floor) : [];
    for (const m of mem.slice(0, 1)) {
      const total = n + 1;
      if (!(Number.isInteger(req.counts.bedrooms) && req.counts.bedrooms >= total)) req.counts.bedrooms = total;
      lit.push({ type: 'floor-group-member', groupFloor: grp.floor, groupCount: n, member: m.a, memberFloor: m.floor, total, answered: !!ans,
        reading_ar: `${n} غرف نوم في ${FLOOR_AR[grp.floor]} و«${SUBJ_AR(m.a)}» زيادة عليها في ${FLOOR_AR[m.floor]} (${total} غرف نوم)`, why_ar: ans ? 'بجواب العميل («زيادة عليها»).' : 'القراءة الحرفية لكلام العميل؛ السؤال باقٍ حتى يجيب.' });
    }
  }
  if (ans === 'included' && Number.isInteger(n) && n > 0) req.counts.bedrooms = n;
  req.literal = lit;
  return req;
}
/**
 * (الجولة الثانية عشرة) جواب العميل على سؤال القراءة/الغموض من نصه: { 'floor-group-member': 'included'|'extra' } و/أو { 'majlis-plural': 1|2 }.
 * لا يخمّن: عبارة لا تطابق أحد الجوابين لا تُعدّ جوابًا.
 */
export function parseReadingAnswer(text, types = []) {
  const t = normalizeAr(text), out = {};
  if (types.includes('floor-group-member')) {
    const neg = /(?:مو|مب|ما|لا|ليست|ليس|غير|مش) ?(?:من ?ضمن|ضمن|منها|من العدد|محسوبه)/.test(t);
    if (!neg && /(?<![\u0600-\u06FF])(?:من ?ضمن(?:ها|هم|هن)?|ضمن (?:ال)?(?:عدد|خمس|غرف)|من (?:ال)?(?:عدد|خمس|اربع|ست)|محسوبه|تنحسب|داخل العدد|منها(?![\u0600-\u06FF]))/.test(t)) out['floor-group-member'] = 'included';
    else if (neg || /(?:زياده|زيادة|اضافيه|اضافه|زايده|خارج العدد|غير (?:ال)?(?:خمس|عدد)|فوق (?:ال)?(?:خمس|عدد)|لحالها|مستقله عن|سادسه|سابعه)/.test(t)) out['floor-group-member'] = 'extra';
  }
  if (types.includes('majlis-plural')) {
    if (/مجلسين|مجلسان|رجال ونساء|رجال و ?(?:ال)?نساء|(?:مجلس|مجالس) (?:لل|ال)?(?:نساء|حريم)|ثنين|اثنين/.test(t)) out['majlis-plural'] = 2;
    else if (/مجلس (?:واحد|وحيد)|واحد (?:بس|فقط)|(?:بس|فقط) (?:مجلس )?(?:ال)?رجال|رجال (?:بس|فقط)|ما (?:ابي|نبي|احتاج|نحتاج) (?:مجلس )?(?:ال)?نساء/.test(t)) out['majlis-plural'] = 1;
  }
  return out;
}
