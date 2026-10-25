// قواعد العميل المكانية من كلامه: مواضع الفراغات (أمام/خلف/على الشارع/جهات الشمال والجنوب والشرق والغرب)،
// والعلاقات (بجانب/قريب من/بعيد عن)، والدور (الأرضي/العلوي)، وعدم الوجود («بدون مجلس»).
// ثلاث وظائف: extractRules (نص مطبَّع ← قواعد)، rulePenalty (تقييم في الإطار القانوني للمولّد)،
// verifyRules (تحقق هندسي من المستند الناتج: نُفّذ/لم يُنفَّذ مع السبب). نقي: لا DOM ولا شبكة.
import { analyzeDoc } from './draw/digest.mjs';
import { stairLayout } from './draw/stairs3d.mjs';

const AR = '\\u0600-\\u06FF';
const PRE = `(?<![${AR}])(?:[وفبك]?(?:ال|لل)|[وفبكل])?`; // أدوات ملتصقة: و، ب، ل، ال، بال، لل...
const END = `(?![${AR}])`;
// بدائل إنجليزية (النص مطبَّع بأحرف صغيرة): حدود كلمة لاتينية
const EN = re => `(?<![a-z])(?:${re})(?![a-z])`;

/** الفراغات التي يمكن الإشارة إليها في الكلام. */
export const SUBJECTS = Object.freeze([
  { id: 'majlis_w', ar: 'مجلس النساء', re: `مجلس (?:ال)?(?:نساء|حريم|نسوان|عائله)|مجالس (?:ال)?نساء|${EN("(?:women'?s?|ladies'?) majlis")}` },
  { id: 'elderly', ar: 'غرفة كبار السن', re: `غرفه(?: نوم)?(?: ارضيه)? (?:ال|لل|ل)?(?:والده|والد|والدين|ام|اب|ابوي|امي|ابوي وامي|جده|جدتي|جدي|كبار السن|كبير السن|شياب|اهلي)|والده|والدين|كبار السن|كبير السن|${EN("(?:parents'?|elderly|grandparents'?)(?: bed ?room| room)?")}` },
  { id: 'guest', ar: 'غرفة الضيوف', re: `غرف(?:ه)? (?:نوم )?(?:ال|لل|ل)?(?:ضيوف|ضيف)|${EN('guest (?:bed ?)?room')}` },
  { id: 'guestwc', ar: 'دورة مياه الضيوف', re: `(?:حمام|دوره مياه|دورات مياه|تواليت) (?:ال|لل|ل)?(?:ضيوف|رجال|مجلس)|${EN('guest (?:toilet|wc|bath ?room)')}` },
  { id: 'servicedoor', ar: 'باب الخدمة', re: `(?:باب|مدخل) (?:ال)?خدمه|${EN('service (?:door|entrance)')}` },
  { id: 'kids', ar: 'غرف الأبناء', plural: true, re: `غرف(?:ه)? (?:ال|لل|ل)?(?:اولاد|اطفال|بنات|عيال|ابناء|عيالي|صغار|شباب)|اولاد|اطفال|عيال|ابناء|بزران|${EN("(?:kids'?|children'?s?) (?:bed ?)?rooms?")}` },
  { id: 'onebed', ar: 'غرفة نوم', any: true, re: `غرفه نوم(?! (?:ال)?رئيسيه)|${EN('(?:a|one) bed ?room')}` },
  { id: 'master', ar: 'غرفة النوم الرئيسية', re: `غرفه (?:ال)?نوم (?:ال)?رئيسيه|غرفه (?:ال)?ماستر|غرفه (?:ال)?رئيسيه|ماستر|غرفتي|${EN('master(?: bed ?room| suite)?')}` },
  { id: 'maid', ar: 'غرفة الخادمة', re: `(?:غرفه (?:ال)?)?(?:خادمه|خدامه|عامله|شغاله)|${EN("maid'?s?(?: room)?")}` },
  { id: 'driver', ar: 'غرفة السائق', re: `(?:غرفه (?:ال)?)?(?:سائق|سواق)|${EN("driver'?s?(?: room)?")}` },
  { id: 'laundry', ar: 'غرفة الغسيل', re: `(?:غرفه (?:ال)?)?غسيل|${EN('laundry(?: room)?')}` },
  { id: 'storage', ar: 'المخزن', re: `مخزن|مستودع|${EN('(?:storage(?: room)?|store ?room|pantry)')}` },
  { id: 'bedrooms', ar: 'غرف النوم', plural: true, re: `(?:كل |جميع )?(?:ال)?غرف (?:ال)?نوم|(?:كل|جميع) (?:ال)?غرف|غرف(?! (?:ال)?(?:ملابس|غسيل|خادمه|سائق|طعام))|${EN('(?:all (?:the )?)?bed ?rooms')}` },
  { id: 'majlis', ar: 'المجلس', re: `مجلس(?: (?:ال)?رجال)?(?! (?:ال)?طعام)|مجالس|ديوانيه|${EN("(?:men'?s? )?majlis|guest (?:sitting|reception)(?: room)?")}` },
  { id: 'dining', ar: 'الطعام', re: `(?:غرفه|صاله|مجلس) (?:ال)?طعام|طعام|سفره|مقلط|مقالط|${EN('dining(?: room| area)?')}` },
  { id: 'kitchen', ar: 'المطبخ', re: `مطبخ(?! (?:ال)?(?:تحضيري|ثاني|خارجي))|${EN('kitchen')}` },
  { id: 'hall', ar: 'الصالة', re: `صاله(?: (?:ال)?(?:عائليه|معيشه|جلوس))?|ليفنج|معيشه|${EN('(?:living(?: room)?|family (?:hall|room|living)|hall)')}` },
  { id: 'office', ar: 'المكتب', re: `مكتب|${EN('(?:office|study)')}` },
  { id: 'prayer', ar: 'المصلى', re: `مصلي|مصلا|${EN('prayer(?: room)?')}` },
  // الدرج الداخلي: يُشار إليه في الكلام («بعيدة عن الدرج») فلا يُسقط بصمت؛ يُقاس من سلالم المستند
  { id: 'stairs', ar: 'الدرج', re: `درج(?: (?:ال)?داخلي)?|سلم(?: (?:ال)?داخلي)?|${EN('stair(?:s|case|way)?')}` },
  { id: 'entrance', ar: 'المدخل', re: `مدخل(?: (?:ال)?رئيسي)?|باب (?:ال)?(?:رئيسي|بيت)|${EN('(?:main )?entrance')}` },
]);
const S = Object.fromEntries(SUBJECTS.map(s => [s.id, { ...s, rx: new RegExp(`${PRE}(?:${s.re})${END}`, 'g') }]));
const subjAr = id => S[id]?.ar || id;

const COMPASS_AR = { n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب' };
const SIDE_AR = { front: 'في الأمام', back: 'في الخلف', n: 'في جهة الشمال', s: 'في جهة الجنوب', e: 'في جهة الشرق', w: 'في جهة الغرب', right: 'على يمين الداخل من الشارع', left: 'على يسار الداخل من الشارع', center: 'في وسط البيت' };
const OPP_SIDE = { front: 'back', back: 'front', n: 's', s: 'n', e: 'w', w: 'e', right: 'left', left: 'right' };
// المواضع (mode) — ثلاث درجات صرامة، كلها تُقاس من المخطط نفسه:
//  touch = «على الشارع / يطل على الحوش الخلفي»: يلامس الجدار الخارجي لتلك الجهة (أو يطل عليها بلا فراغ مبني أمامه).
//  zone  = «في الخلف / ورا / في الأمام / في الشرق / يمين الداخل» (الافتراضي، ومنه «المطبخ في الخلف»): في تلك الجهة
//          فعلًا — يلامس واجهتها (جدارها الخارجي، أو حافته مكشوفة نحوها ومركزه في نصفها)، أو مركزه في الثلث
//          الخارجي من امتداد المبنى من تلك الجهة ولا تقع بينه وبين واجهتها على امتداد عرضه غرفة سكنية غير خدمية
//          (نوم، مجلس، صالة، طعام، مكتب). مطبخ في وسط البيت وخلفه جناح النوم ليس «في الخلف» ولو كان مركزه في النصف الخلفي.
//  half  = في نصف المبنى من تلك الجهة فقط (مركزه): للصيغ المتساهلة صراحة («بعيد عن الشارع») ولنفي الجهة المقابلة
//          («ما يكون في الخلف» = في النصف الأمامي).
//  وأيضًا avoid (لا يلامس جدار تلك الجهة) و center (وسط المبنى).
const PLACES = [
  { side: 'front', mode: 'touch', re: `(?:يطل|تطل|مطل|مطله)? ?(?:ع|على|علي) (?:ال)?(?:شارع|واجهه)|جهه (?:ال)?شارع|(?:ب|في )?(?:ال)?واجهه` },
  { side: 'back', mode: 'touch', re: `(?:يطل|تطل|مطل|مطله) (?:ع|على|علي) (?:ال)?(?:حوش|حديقه|فناء|ارتداد)(?: (?:ال)?خلفي(?:ه)?)?|(?:ع|على|علي) (?:ال)?(?:حوش|حديقه) (?:ال)?خلفي(?:ه)?` },
  { side: 'front', mode: 'half', re: `(?:في|ب) ?(?:ال)?(?:امام|مقدمه|قدام)|(?:ال)?امامي(?:ه)?|قدام` },
  { side: 'back', mode: 'half', re: `بعيد(?:ه)? عن (?:ال)?شارع` },
  { side: 'back', mode: 'half', re: `(?:في|ب) ?(?:ال)?(?:خلف|ورا|وراء|عمق|اخر (?:ال)?بيت)|(?:ال)?خلفي(?:ه)?|ورا` },
  { side: 'e', mode: 'half', re: `(?:في |ب)?(?:ال)?(?:جهه|ناحيه|جانب) (?:ال)?(?:شرقي(?:ه)?|شرق)|(?:ال)?شرقي(?:ه)?|(?:جهه|ناحيه) (?:ال)?شرق|(?:في|ب) ?(?:ال)?شرق` },
  { side: 'w', mode: 'half', re: `(?:في |ب)?(?:ال)?(?:جهه|ناحيه|جانب) (?:ال)?(?:غربي(?:ه)?|غرب)|(?:ال)?غربي(?:ه)?|(?:جهه|ناحيه) (?:ال)?غرب|(?:في|ب) ?(?:ال)?غرب` },
  { side: 'n', mode: 'half', re: `(?:في |ب)?(?:ال)?(?:جهه|ناحيه|جانب) (?:ال)?(?:شمالي(?:ه)?|شمال)|(?:ال)?شمالي(?:ه)?|(?:جهه|ناحيه) (?:ال)?شمال|(?:في|ب) ?(?:ال)?شمال` },
  { side: 'right', mode: 'half', re: `(?:على |ع |في |ب)?(?:ال)?يمين(?: (?:ال)?(?:مدخل|داخل|بيت|واجهه))?` },
  { side: 'left', mode: 'half', re: `(?:على |ع |في |ب)?(?:ال)?يسار(?: (?:ال)?(?:مدخل|داخل|بيت|واجهه))?` },
  { side: 'center', mode: 'center', re: `(?:في |ب)?(?:ال)?(?:وسط|نص|منتصف) (?:ال)?(?:بيت|فيلا|مبني|دور)|(?:في|ب) ?(?:ال)?(?:وسط|نص|منتصف)` },
  { side: 's', mode: 'half', re: `(?:في |ب)?(?:ال)?(?:جهه|ناحيه|جانب) (?:ال)?(?:جنوبي(?:ه)?|جنوب)|(?:ال)?جنوبي(?:ه)?|(?:جهه|ناحيه) (?:ال)?جنوب|(?:في|ب) ?(?:ال)?جنوب` },
  // English
  { side: 'front', mode: 'touch', re: EN('(?:facing|on|overlooking|onto) the street|street side') },
  { side: 'back', mode: 'touch', re: EN('overlooking the (?:garden|back ?yard|yard)') },
  { side: 'front', mode: 'half', re: EN('(?:at|in|to) the front') },
  { side: 'back', mode: 'half', re: EN('away from the street') },
  { side: 'back', mode: 'half', re: EN('(?:at|in|to) the (?:back|rear)') },
  ...['north', 'south', 'east', 'west'].map(d => ({ side: d[0], mode: 'half', re: EN(`(?:(?:on|at|in|to) the )?${d}(?:ern)?(?: side)?`) })),
  { side: 'center', mode: 'center', re: EN('(?:in the )?(?:center|centre|middle)(?: of the (?:house|villa))?') },
  { side: 'right', mode: 'half', re: EN('(?:on|to) the right(?: of the entrance)?') },
  { side: 'left', mode: 'half', re: EN('(?:on|to) the left(?: of the entrance)?') },
].map(p => ({ ...p, mode: p.mode === 'half' && !/بعيد|away/.test(p.re) ? 'zone' : p.mode, rx: new RegExp(`(?<![${AR}])و?(?:${p.re})${END}`, 'g') }));
const FLOORS = [
  { floor: 'upper', re: `(?:في |ب)?(?:ال)?(?:دور|طابق) (?:ال)?(?:علوي|اول|ثاني|فوق)|(?:في |ب)?(?:ال)?علوي|فوق|${EN('upstairs|(?:on the )?(?:first|upper|second|top) floor')}` },
  { floor: 'ground', re: `(?:في |ب)?(?:ال)?(?:دور|طابق) (?:ال)?ارضي|(?:في |ب)(?:ال)?ارضي|(?:ال)?ارضي(?:ه)?|تحت(?! (?:ال)?(?:درج|سلم))|${EN('downstairs|(?:on the )?ground floor')}` },
].map(p => ({ ...p, rx: new RegExp(`(?<![${AR}])و?(?:${p.re})${END}`, 'g') }));
// العلاقات بالترتيب: النفي أولًا (لأن «مو قريب» يحوي «قريب»)
const RELS = [
  { kind: 'far', re: `(?:مو|مب|ما|لا|ليس|مش) ?(?:تكون|يكون|تصير|يصير)? ?(?:قريب(?:ه)?|جنب|بجنب|بجانب|ملاصق(?:ه)?|لاصق(?:ه)?|مجاور(?:ه)?) ?(?:من|عن|ل|لل)?|بعيد(?:ه)? (?:عن|من)|ابعد (?:ما يكون )?(?:عن|من)|منفصل(?:ه)? عن|معزول(?:ه)? عن|${EN("(?:far (?:away )?from|away from|not (?:be )?(?:near|close to|next to|adjacent to)|separated? from)")}` },
  { kind: 'adjacent', re: `بجانب|بجنب|جنب|جمب|ملاصق(?:ه)?(?: ل| لل)?|لاصق(?:ه)?|مجاور(?:ه)?(?: ل| لل)?|بجوار|جوار|لصق|مفتوح(?:ه)? (?:ع|على|علي)|يفتح (?:ع|على|علي)|تفتح (?:ع|على|علي)|متصل(?:ه)? (?:ب|مع)|يتصل (?:ب|مع)|تتصل (?:ب|مع)|${EN('next to|adjacent to|beside|opens? (?:on)?to|open to|connected to|attached to')}` },
  { kind: 'near', re: `قريب(?:ه)? (?:من|م|ل|لل)|قريب(?:ه)?|بالقرب من|قرب|عند|${EN('near(?: to)?|close to')}` },
].map(p => ({ ...p, rx: new RegExp(`(?<![${AR}])و?(?:${p.re})${END}`, 'g') }));
const NEG = new RegExp(`(?<![${AR}])و?(?:بدون|بلا|من غير|ما ابي|ما ابغي|لا ابي|لا ابغي|ما ابا|ما بي|ما نبي|ما نبغي|لا اريد|لا نريد|ما اريد|ما احتاج|لا احتاج|ما نحتاج|لا نحتاج|مافي|ما فيه|ما يحتاج|لا داعي ل|ما له داعي)(?: (?:ال)?(?:غرفه|صاله))? ((?:ال)?(?:مجلس|مجالس|طعام|سفره|ممرات|ممر|مكتب|مصلي|خادمه|سائق))`, 'g');
const NEG_EN = /(?<![a-z])(?:no|without|don'?t (?:want|need)(?: an?)?|do not (?:want|need)(?: an?)?|skip the) (majlis|dining(?: room)?|corridors?|office|study|prayer room|maid'?s? room|driver'?s? room)(?![a-z])/g;
// درجة الطلب: «يفضل/لو أمكن/ياليت» تفضيل، والنفي («لا/ما أبي/بدون/ممنوع») منع، وغير ذلك إلزام («لازم/ضروري/أبي»)
const PREFER_CUE = new RegExp(`(?<![${AR}])(?:و|ف)?(?:يفضل|نفضل|افضل|الافضل|يستحسن|لو امكن|اذا امكن|ان امكن|لو تقدر|اذا تقدر|قدر الامكان|قد ما تقدر|ياليت|يا ليت|ليت|حبذا|ودي لو|مو شرط|مب شرط|ليس شرطا|مو ضروري|مب ضروري|غير ضروري|مو لازم|مب لازم|اختياري)(?![${AR}])|(?<![a-z])(?:prefer(?:ably|red)?|ideally|if possible|nice to have|would be nice|optional(?:ly)?|not (?:required|necessary|a must))(?![a-z])`);
const MUST_CUE = new RegExp(`(?<![${AR}])(?:و|ف)?(?:لازم|ضروري|ضروريا|يجب|يلزم|لا ?بد|اكيد|شرط|الزامي|ابي|ابغي|ابغا|ابا|اريد|نبي|نبغي|نريد|بالضبط|ضروره)(?![${AR}])|(?<![a-z])(?:must|need(?:s)? to|required?|have to|has to|mandatory|should|exactly)(?![a-z])`);
const FORBID_CUE = new RegExp(`(?<![${AR}])(?:و|ف)?(?:ممنوع|يمنع|لا يجوز|اياك|ابدا)(?![${AR}])|(?<![a-z])(?:never|forbidden|must not|mustn'?t)(?![a-z])`);
/** درجة الطلب من نص نافذته: prefer يتقدم (لأن «مو ضروري» تحوي «ضروري»)، ثم النفي، ثم الإلزام الصريح أو الافتراضي. */
export function levelOf(window, negated = false) {
  if (PREFER_CUE.test(window)) return { level: 'prefer', levelCue: 'explicit' };
  if (negated || FORBID_CUE.test(window)) return { level: 'forbid', levelCue: negated ? 'negation' : 'explicit' };
  if (MUST_CUE.test(window)) return { level: 'must', levelCue: 'explicit' };
  return { level: 'must', levelCue: 'default' };
}
/** وزن العقوبة بحسب الدرجة: الإلزام والمنع سواء (حدّان)، والتفضيل أخف. */
export const LEVEL_WEIGHT = Object.freeze({ must: 1, forbid: 1, prefer: 0.35 });

const GROUND_ONLY = new Set(['majlis', 'majlis_w', 'kitchen', 'dining', 'entrance', 'driver', 'maid']);
const find = (rx, t) => { rx.lastIndex = 0; const out = []; let m; while ((m = rx.exec(t))) { out.push({ start: m.index, end: m.index + m[0].length, text: m[0] }); if (m[0] === '') rx.lastIndex++; } return out; };
function subjectsIn(t) {
  const all = [];
  for (const s of SUBJECTS) for (const m of find(S[s.id].rx, t)) all.push({ ...m, id: s.id });
  all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = []; for (const m of all) if (!out.some(o => m.start < o.end && o.start < m.end)) out.push(m);
  return out.sort((a, b) => a.start - b.start);
}
// الفاعل قبل الكلمة المفتاحية: الأقرب، ومعه سابقه إن عُطف عليه مباشرة («المطبخ والطعام في الخلف») ولم تكن قائمة برنامج طويلة
function subjectsBefore(subs, at, t) {
  const before = subs.filter(s => s.end <= at); if (!before.length) return [];
  const last = before[before.length - 1]; if (/[0-9]/.test(t.slice(last.end, at)) || at - last.end > 28) return [];
  const chain = [last];
  for (let i = before.length - 2; i >= 0; i--) { const gap = t.slice(before[i].end, chain[0].start).trim(); if (gap === '') chain.unshift(before[i]); else break; }
  const numBefore = /\d|واحد|اثنين|ثلاث|اربع|خمس/.test(t.slice(Math.max(0, chain[0].start - 8), chain[0].start));
  // عطف مباشر يُقبل فقط لقائمة من اثنين وبلا عدد قبلها؛ قائمة البرنامج («3 غرف ومجلس وصالة والمطبخ...») تُبقي الأقرب
  if (chain.length === 2 && !numBefore) return chain.map(c => c.id);
  // «المجالس والطعام والمطبخ تحت»: سلسلة معرّفة كلها (بأل) وبلا عدد قبلها = كلها فاعل؛ القائمة النكرة تبقى برنامجًا
  if (chain.length >= 3 && !numBefore && chain.every(c => /^\s*(?:و|ف)?(?:ال|بال|لل|وال)/.test(t.slice(c.start, c.end)))) return chain.map(c => c.id);
  return [last.id];
}

/**
 * يستخرج القواعد من نص مطبَّع (normalizeAr). يعيد { rules[], absent[], floors, noCorridors, orphans[] }.
 * rules: { id, kind:'place'|'near'|'adjacent'|'far'|'apart'|'cluster'|'floor', a, b?, side?, mode?, floor?, text,
 *          level:'must'|'prefer'|'forbid', levelCue:'explicit'|'negation'|'default', quote, at:[from,to] }.
 * orphans: عبارات علاقة («بعيدة عن …»، «جنب بعض»، «بين …») لم يُعرف طرفاها — تُعرض للعميل بدل أن تسقط بصمت.
 */
export function extractRules(t) {
  t = String(t || '');
  const rules = [], absent = new Set(), orphans = []; let floors = null, noCorridors = false;
  const seen = new Set();
  let made = null;
  const push = (r, span, neg = false) => {
    const k = [r.kind, r.a, r.b, r.side, r.floor].join('|'); if (seen.has(k) || (r.b && r.a === r.b)) return; seen.add(k);
    const rule = { id: 'R' + (rules.length + 1), ...r, text: ruleText(r) };
    if (made && span) made.push({ rule, span, neg });
    rules.push(rule);
  };
  // عدم الوجود
  for (const m of t.matchAll(NEG)) {
    const w = m[1].replace(/^ال/, '');
    if (/^(مجلس|مجالس)$/.test(w)) absent.add('majlis'); else if (/^(طعام|سفره)$/.test(w)) absent.add('dining');
    else if (/^ممر/.test(w)) noCorridors = true; else if (w === 'مكتب') absent.add('office'); else if (w === 'مصلي') absent.add('prayer'); else if (w === 'خادمه') absent.add('maid'); else if (w === 'سائق') absent.add('driver');
  }
  for (const m of t.matchAll(NEG_EN)) {
    const w = m[1];
    if (w === 'majlis') absent.add('majlis'); else if (/^dining/.test(w)) absent.add('dining'); else if (/^corridor/.test(w)) noCorridors = true;
    else if (w === 'office' || w === 'study') absent.add('office'); else if (/^prayer/.test(w)) absent.add('prayer'); else if (/^maid/.test(w)) absent.add('maid'); else if (/^driver/.test(w)) absent.add('driver');
  }
  if (/(?<![؀-ۿ])(?:ما|لا|بدون|مو) ?(?:ابي|ابغي|اريد|نبي)? ?ممرات|ممرات (?:قليله|اقل)|بلا ممرات|(?:ما|لا) (?:ابي|ابغي|اريد) ممر/.test(t)) noCorridors = true;
  // عدد الأدوار
  if (/(?<![؀-ۿ])(?:دورين|دوران|طابقين|طابقان|دور ارضي و ?(?:دور )?(?:اول|علوي)|ارضي و ?(?:اول|علوي))|(?<![a-z])(?:(?:two|2)[- ](?:floors?|stor(?:e)?ys?|levels?)|double[- ]stor(?:e)?y|duplex)(?![a-z])/.test(t)) floors = 2;
  else if (/(?<![؀-ۿ])(?:دور واحد|طابق واحد|دور ارضي فقط|ارضي فقط)|(?<![a-z])(?:(?:one|single|1)[- ](?:floor|stor(?:e)?y|level)|bungalow|ground floor only)(?![a-z])/.test(t)) floors = 1;
  const NEGW = new RegExp(`(?<![${AR}])(?:و|ف)?(?:لا|ما|مو|مب|ليس|مش|بلاش|غير|ابد|ممنوع|يمنع)(?![${AR}])|(?<![a-z])(?:not|don'?t|dont|never|avoid|no)(?![a-z])`);
  // «مو شرط/مو ضروري» تليين للطلب (تفضيل) لا نفي له
  const SOFT = new RegExp(`(?<![${AR}])(?:و|ف)?(?:مو|مب|ليس|غير|مش) ?(?:شرط(?:ا)?|ضروري|لازم)(?![${AR}])|(?<![a-z])not (?:required|necessary|a must)(?![a-z])`, 'g');
  const TOGETHER = new RegExp(`(?<![${AR}])(?:جنب|بجنب|بجانب|بجوار|ورا|مع|قرب|قريب(?:ه|ين)? من) بعض(?:ها|هم)?(?![${AR}])|(?<![${AR}])(?:متجاور(?:ه|ين)|متلاصق(?:ه|ين)|مع بعض)(?![${AR}])|(?<![a-z])(?:next to each other|together|adjacent to each other)(?![a-z])`, 'g');
  const BETWEEN = new RegExp(`(?<![${AR}])(?:بين|وسط ما بين)(?![${AR}])|(?<![a-z])between(?![a-z])`, 'g');
  const SPLIT = /[،,.؛;\n!?؟]+/g;
  const pieces = []; { let last = 0, m; SPLIT.lastIndex = 0; while ((m = SPLIT.exec(t))) { pieces.push([last, m.index]); last = m.index + m[0].length; } pieces.push([last, t.length]); }
  for (const [p0, p1] of pieces) {
    const raw = t.slice(p0, p1), lead = raw.length - raw.trimStart().length, clause = raw.trim();
    const off = p0 + lead - 1; // c[i] ↔ t[off + i]
    const c = ' ' + clause + ' ';
    if (c.trim().length < 3) continue;
    made = [];
    const subs = subjectsIn(c), used = [];
    const overlapsUsed = m => used.some(u => m.start < u.end && u.start < m.end);
    // النفي قبل العبارة: «لا تحط غرف النوم على الشارع»، «المجلس ما يكون جنب المطبخ»
    const negated = (from, to) => { const lastUsed = Math.max(0, ...used.filter(u => u.end <= to).map(u => u.end)); return NEGW.test(c.slice(Math.max(lastUsed, from - 16, 0), to).replace(SOFT, ' ')); };
    // بداية الفاعل: أقرب ورود لكل فراغ قبل العبارة (لا أول ورود في الجملة: «انقل المطبخ … وخل المطبخ في الخلف»)
    const firstStart = (ids, at = c.length) => { const v = Math.min(...ids.map(id => Math.max(...subs.filter(x => x.id === id && x.start < at).map(x => x.start)))); return Number.isFinite(v) ? v : at; };
    // «وعن المجلس»، «ومن المطبخ»: فراغات معطوفة بعد العبارة تأخذ العلاقة نفسها
    const coordinated = end => { const out = []; let at = end; for (;;) { const m = c.slice(at).match(/^\s*و\s*(?:عن|من|لل|ل|ب)?\s*/); if (!m) break; const nx = subs.find(x => x.start >= at + m[0].length - 3 && x.start <= at + m[0].length + 1); if (!nx) break;
      // «من المطبخ والطعام» أو «عن الشارع وعن المجلس» عطف؛ «الماستر ومجلس» (نكرة بلا حرف جر) بقية قائمة البرنامج
      if (!/(عن|من|ل|ب)\s*$/.test(m[0]) && !/^(?:و)?(?:ال|بال|لل)/.test(c.slice(nx.start, nx.end))) break;
      out.push(nx); at = nx.end; } return out; };
    const tailOf = end => { const m = c.slice(end).match(/^\s*(?:[^\s]+\s*){0,2}/); let s = m ? m[0] : ''; const cut = s.search(/\sو/); if (cut >= 0) s = s.slice(0, cut); return s.trimEnd(); };
    const orphan = (m, kind) => orphans.push({ kind, quote: (c.slice(m.start, m.end) + tailOf(m.end)).trim(), at: [off + m.start, off + m.end + tailOf(m.end).length] });
    // «بين A و B»
    for (const m of find(BETWEEN, c)) {
      const A = subjectsBefore(subs, m.start, c), after = subs.filter(x => x.start >= m.end && x.start - m.end <= 30).slice(0, 2);
      if (A.length !== 1 || after.length !== 2) { orphan(m, 'between'); continue; }
      used.push({ start: m.start, end: after[1].end });
      for (const b of after) push({ kind: 'adjacent', a: A[0], b: b.id }, [firstStart(A, m.start), after[1].end]);
    }
    // «جنب بعض»: فراغان معطوفان متجاوران، أو مجموعة غرف متجاورة
    for (const m of find(TOGETHER, c)) {
      if (overlapsUsed(m)) continue;
      const before = subs.filter(x => x.end <= m.start), last = before[before.length - 1]; if (!last) { orphan(m, 'together'); continue; }
      const prev = before[before.length - 2], joined = prev && /^\s*$/.test(c.slice(prev.end, last.start));
      if (joined) { used.push(m); const neg = negated(prev.start, m.start); push({ kind: neg ? 'apart' : 'adjacent', a: prev.id, b: last.id }, [prev.start, m.end], neg); }
      else if (S[last.id]?.plural) { used.push(m); push({ kind: 'cluster', a: last.id }, [last.start, m.end]); }
      else orphan(m, 'together');
    }
    // العلاقات بترتيب ورودها؛ «A قريبة من B وبعيدة عن C»: المعطوف بالواو يعود على الفاعل نفسه
    const relHits = [];
    for (const rel of RELS) for (const m of find(rel.rx, c)) if (!overlapsUsed(m) && !relHits.some(h => m.start < h.end && h.start < m.end)) relHits.push({ ...m, kind: rel.kind });
    relHits.sort((a, b) => a.start - b.start);
    let lastA = null, lastAStart = 0;
    for (const m of relHits) {
      const after = subs.find(x => x.start >= m.end && x.start - m.end <= 6);
      let A = subjectsBefore(subs, m.start, c), aStart = A.length ? firstStart(A, m.start) : m.start;
      if (lastA && /^و/.test(m.text)) { A = lastA; aStart = m.start; }
      if (!after || !A.length) continue;
      used.push({ start: m.start, end: after.end }); lastA = A; lastAStart = aStart;
      // «لا تحط المجلس جنب المطبخ»: النفي يقلب الملاصقة والقرب إلى «غير ملاصق»
      const negFar = m.kind === 'far' && /^و?(?:مو|مب|ما|لا|ليس|مش|not)(?![؀-ۿa-z])/.test(m.text);
      const neg = m.kind !== 'far' && negated(firstStart(A, m.start), m.start);
      const kind = neg ? 'apart' : m.kind;
      const co = coordinated(after.end), end = co.length ? co[co.length - 1].end : after.end;
      for (const b of [after, ...co]) for (const a of A) push({ kind, a, b: b.id }, [aStart, end], neg || negFar);
    }
    const consumed = new Set();
    for (const p of PLACES) for (const m of find(p.rx, c)) {
      if (overlapsUsed(m)) continue;
      // العبارة يجب ألا تكون جزءًا من فاعل؛ عدا «يمين المدخل/يسار المدخل» فالمدخل جزء من العبارة
      const inside = subs.filter(x => m.start < x.end && x.start < m.end);
      if (inside.some(x => !(x.id === 'entrance' && ['right', 'left'].includes(p.side) && x.start > m.start))) continue;
      inside.forEach(x => consumed.add(x));
      const A = subjectsBefore(subs.filter(x => !consumed.has(x)), m.start, c); if (!A.length) continue;
      used.push(m);
      const neg = negated(firstStart(A, m.start), m.start), span = [firstStart(A, m.start), m.end];
      for (const a of A) {
        if (!neg) push({ kind: 'place', a, side: p.side, mode: p.mode }, span);
        else if (p.mode === 'touch') push({ kind: 'place', a, side: p.side, mode: 'avoid' }, span, true);
        else if (OPP_SIDE[p.side]) push({ kind: 'place', a, side: OPP_SIDE[p.side], mode: 'half' }, span, true);
      }
      // «بعيدة عن الشارع وعن المجلس»
      if (/بعيد|away/.test(m.text)) { const co = coordinated(m.end); if (co.length) { used.push({ start: m.end, end: co[co.length - 1].end }); for (const b of co) for (const a of A) push({ kind: 'far', a, b: b.id }, [firstStart(A, m.start), co[co.length - 1].end]); } }
    }
    for (const f of FLOORS) for (const m of find(f.rx, c)) {
      if (overlapsUsed(m)) continue;
      // «غرفة نوم أرضية لأبوي»: الصفة داخل اسم الفراغ
      const host = subs.find(x => m.start >= x.start && m.end <= x.end + 1);
      let A = host ? [host.id] : subjectsBefore(subs, m.start, c);
      if (!A.length) continue;
      // «مجلس ومكتب فوق»: ما لا يصعد للعلوي (المجلس والمطبخ والخدمة) لا يُعطف عليه الدور إلا إن ذُكر وحده
      if (f.floor === 'upper' && A.length > 1) A = A.filter(a => !GROUND_ONLY.has(a));
      used.push(m);
      for (const a of A) push({ kind: 'floor', a, floor: f.floor }, [host ? host.start : firstStart(A, m.start), m.end]);
    }
    // عبارات علاقة لم يُعرف طرفاها: لا تسقط بصمت
    for (const m of relHits) if (!overlapsUsed(m)) orphan(m, 'relation');
    // درجة كل قاعدة واقتباسها من نافذتها في الجملة: من نهاية القاعدة السابقة (وذيلها) إلى نهاية هذه وذيلها حتى «و» التالية
    made.sort((x, y) => x.span[0] - y.span[0] || x.span[1] - y.span[1]);
    let winStart = 0, prevSpan = null;
    for (const e of made) {
      const [from, to] = e.span;
      if (prevSpan && (prevSpan[0] !== from || prevSpan[1] !== to)) winStart = Math.max(winStart, Math.min(from, prevSpan[1] + tailOf(prevSpan[1]).length));
      const tail = tailOf(to), win = c.slice(winStart, to + tail.length);
      Object.assign(e.rule, levelOf(win, e.neg), { quote: c.slice(from, to).trim(), at: [off + from, off + to] });
      prevSpan = e.span;
    }
    made = null;
  }
  return { rules, absent: [...absent], floors, noCorridors, orphans };
}
export function ruleText(r) {
  const A = `«${subjAr(r.a)}»`;
  if (r.kind === 'cluster') return `${A} متجاورة`;
  if (r.kind === 'apart') return `${A} غير ملاصق لـ«${subjAr(r.b)}»`;
  if (r.kind === 'place' && r.mode === 'avoid') return `${A} لا يطل على ${r.side === 'front' ? 'الشارع' : r.side === 'back' ? 'الواجهة الخلفية' : 'جهة ' + (COMPASS_AR[r.side] || r.side)}`;
  if (r.kind === 'place') return `${A} ${r.mode === 'touch' ? (r.side === 'front' ? 'على الشارع (الواجهة الأمامية)' : r.side === 'back' ? 'على الواجهة الخلفية' : SIDE_AR[r.side]) : SIDE_AR[r.side]}`;
  if (r.kind === 'floor') return `${A} في الدور ${r.floor === 'upper' ? 'العلوي' : 'الأرضي'}`;
  return `${A} ${{ adjacent: 'بجوار', near: 'قرب', far: 'بعيدًا عن' }[r.kind]} «${subjAr(r.b)}»`;
}
// ------------------------------------------------------------------------------------------ التقييم في الإطار القانوني
// الإطار: x عبر الواجهة (0..W)، y من المدخل (0) إلى الخلف (D). الجهات المطلقة تتحول بحسب المدخل والمرآة.
const CANON = { s: { n: 'y1', e: 'x1', w: 'x0' }, n: { s: 'y1', e: 'x0', w: 'x1' }, e: { w: 'y1', n: 'x1', s: 'x0' }, w: { e: 'y1', s: 'x1', n: 'x0' } };
export function canonSide(entry, side, mirror) {
  if (side === 'front' || side === entry) return 'y0';
  if (side === 'back') return 'y1';
  if (side === 'center') return 'c';
  // يمين/يسار الواقف في الشارع مواجهًا البيت: في الإطار القانوني x1 يمينه (قبل المرآة)
  let c = side === 'right' ? 'x1' : side === 'left' ? 'x0' : CANON[entry]?.[side] || null;
  if (c && mirror && c[0] === 'x') c = c === 'x0' ? 'x1' : 'x0';
  return c;
}
const BLOCK_OF = {
  majlis: b => b.kind === 'majlis' && !b.women, majlis_w: b => !!b.women, kitchen: b => b.id === 'kitchen1', dining: b => b.kind === 'dining',
  master: b => !!b.master, kids: b => b.kind === 'suite' && !b.master && !b.elderly && !b.guest, bedrooms: b => b.kind === 'suite' && !b.guest, elderly: b => !!b.elderly,
  maid: b => b.kind === 'maid', driver: b => b.kind === 'driver', office: b => b.kind === 'office', prayer: b => b.kind === 'prayer',
  laundry: b => b.id === 'kitchen1', storage: b => b.id === 'kitchen1', hall: b => b.kind === 'family',
  onebed: b => b.kind === 'suite' && !b.guest, guest: b => !!b.guest, guestwc: b => b.kind === 'majlis' && !b.women, servicedoor: b => b.id === 'kitchen1',
};
/** كتل البرنامج المقصودة بالفراغ (لتوزيع الأدوار). */
export function blocksFor(id, blocks) { const pick = BLOCK_OF[id]; return pick && !['laundry', 'storage', 'hall'].includes(id) ? blocks.filter(pick) : []; }
function rectsOf(id, placed, circ) {
  if (id === 'hall') { const h = circ.find(c => c.id === 'hall'); if (h) return [h.r]; }
  // الدرج: يُقيَّم فقط إن مرّر المولّد مستطيله ضمن الحركة ({ id: 'stairs', r })؛ وإلا لا عقوبة (ويبقى التحقق من المستند)
  if (id === 'stairs') { const s = circ.find(c => c.id === 'stairs' || c.id === 'stair'); return s ? [s.r] : []; }
  if (id === 'entrance') { const f = circ.find(c => c.id === 'foyer'); return f ? [f.r] : []; }
  const pick = BLOCK_OF[id]; return pick ? placed.filter(p => pick(p.block)).map(p => p.r) : [];
}
const gapOf = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));
const contact = (a, b) => {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (Math.abs(ox) < .3 && oy > 0) return oy; if (Math.abs(oy) < .3 && ox > 0) return ox; return 0;
};
// «قرب»: لفراغ واحد ≤ 2 م (ممر أو باب)، ولمجموعة غرف (غرف الأبناء قرب الماستر) ≤ 4.2 م (عرض صالة أو غرفة بينهما)
const nearGap = r => (S[r.a]?.plural ? 4.2 : 2.0);
const ctr = r => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
/**
 * «على الواجهة الخلفية / تطل على الحوش الخلفي» (touch): يتحقق أيضًا حين يرتد الفراغ عن حد المبنى لكن جهته تلك
 * مكشوفة بلا أي فراغ مبني أمامها في امتداده (يطل على حديقة أو فناء مفتوح على تلك الجهة، كصالة بين جناحي U).
 */
function openToward(r, side, others) {
  const ax = side[0] === 'y' ? ['x0', 'x1'] : ['y0', 'y1'], hi = side.endsWith('1');
  return !others.some(o => o !== r && Math.min(r[ax[1]], o[ax[1]]) - Math.max(r[ax[0]], o[ax[0]]) > .3 && (hi ? o[side.replace('1', '0')] >= r[side] - .05 : o[side.replace('0', '1')] <= r[side] + .05));
}
/** كم ينقص المستطيل عن تحقيق الموضع (0 = متحقق). sides بإحداثيات قانونية أو مستند. */
function placeDeficit(r, side, mode, B) {
  const w = B.x1 - B.x0, d = B.y1 - B.y0, c = ctr(r);
  if (mode === 'center') return Math.max(0, Math.abs(c.x - (B.x0 + B.x1) / 2) - w * .18) + Math.max(0, Math.abs(c.y - (B.y0 + B.y1) / 2) - d * .3);
  // «لا يطل على الشارع»: العجز = كم يلامس (موجب إن لامس)
  if (mode === 'avoid') return Math.max(0, .5 - placeDeficit(r, side, 'touch', B));
  if (mode === 'touch') return side === 'y0' ? r.y0 - B.y0 : side === 'y1' ? B.y1 - r.y1 : side === 'x0' ? r.x0 - B.x0 : B.x1 - r.x1;
  const f = side === 'y0' ? (B.y1 - c.y) / d : side === 'y1' ? (c.y - B.y0) / d : side === 'x0' ? (B.x1 - c.x) / w : (c.x - B.x0) / w;
  return Math.max(0, .5 - f) * (side[0] === 'x' ? w : d);
}
/**
 * «X في الخلف» (zone) — تحقق معماري لا مركزي: يعيد { def, why } حيث def = 0 متحقق، وإلا مقدار العجز بالمتر
 * (أقل الطرق الثلاث كلفة: مسافة ملامسة الواجهة، أو بُعد المركز عن الثلث الخارجي + عقوبة غرفة سكنية بينه وبين الواجهة).
 *  others: كل المستطيلات المبنية في الدور نفسه (للانكشاف نحو الجهة)، habit: الغرف السكنية غير الخدمية (عدا X وأقرانه).
 */
export function zoneCheck(r, side, B, others, habit, { literal = false } = {}) {
  const w = B.x1 - B.x0, d = B.y1 - B.y0, c = ctr(r), ext = side[0] === 'x' ? w : d;
  const tdef = placeDeficit(r, side, 'touch', B);
  // بُعد المركز عن تلك الواجهة كنسبة من امتداد المبنى (0 = عليها)
  const f = side === 'y0' ? (c.y - B.y0) / d : side === 'y1' ? (B.y1 - c.y) / d : side === 'x0' ? (c.x - B.x0) / w : (B.x1 - c.x) / w;
  if (tdef <= .45) return { def: 0, how: 'touch' };
  // (الجولة السادسة عشرة) «في الخلف» يُقرأ حرفيًا (literal): يلامس الواجهة الخلفية أو مركزه في ثلثها الخارجي بلا غرفة سكنية بينه
  // وبينها. «مفتوح على الخلف من منتصف العمق» قراءة نسبية — تحقق جزئي لا كلي (C6-2 في المراجعة المستقلة r15)
  const open = f <= .5 && openToward(r, side, others);
  if (open && !literal) return { def: 0, how: 'open' };
  // غرفة سكنية بين X والواجهة على امتداد عرضه: خلفه (نحو الجهة) وتتقاطع مع امتداده بمتر على الأقل (أو نصف عرضه)
  const ax = side[0] === 'y' ? ['x0', 'x1'] : ['y0', 'y1'], hi = side.endsWith('1'), span = r[ax[1]] - r[ax[0]];
  const between = habit.filter(o => o !== r && Math.min(r[ax[1]], o[ax[1]]) - Math.max(r[ax[0]], o[ax[0]]) >= Math.min(1.0, span * .5) && (hi ? o[side.replace('1', '0')] >= r[side] - .3 : o[side.replace('0', '1')] <= r[side] + .3));
  const third = Math.max(0, f - 1 / 3) * ext;
  const zdef = third + (between.length ? 2.5 + .5 * between.length : 0);
  if (zdef <= 0) return { def: 0, how: 'third' };
  return { def: Math.min(tdef, zdef), tdef, third, between, f, open };
}
/**
 * (الجولة الخامسة عشرة) «في الخلف» بالقراءة النسبية: الفراغ أبعد عن الشارع من كل فراغات الاستقبال في دوره (المجلس، الطعام،
 * المداخل) بنصف متر على الأقل، ولا يلامس الواجهة الأمامية. يعيد نصًا عربيًا مقيسًا أو null.
 */
function relativeBack(a, backSide, entry, rooms, B) {
  const front = docSide('front', entry); if (!front || front === 'c') return null;
  const ax = backSide[0], hi = backSide.endsWith('1'), depth = r => (hi ? ctr(r)[ax] : -ctr(r)[ax]);
  if (placeDeficit(a, front, 'touch', B) <= .45) return null;
  const rec = rooms.filter(o => o !== a && o.level === a.level && (o.type === 'majlis' || o.type === 'dining' || (o.type === 'entrance' && /مدخل/.test(o.name || ''))));
  if (!rec.length || rec.some(o => depth(o) > depth(a) - .5)) return null;
  const names = [...new Set(rec.filter(o => o.type !== 'entrance').map(o => o.name))];
  const ext = ax === 'x' ? B.x1 - B.x0 : B.y1 - B.y0, fromFront = Math.round(100 * Math.abs(ctr(a)[ax] - B[front]) / ext);
  return `«${a.name}» خلف ${names.length ? names.map(n => `«${n}»`).join(' و') : 'المداخل'} بالنسبة للشارع (أبعد منها عن الشارع، ومركزه على ${fromFront}% من عمق المبنى من الواجهة الأمامية)`;
}
// أنواع الكتل والغرف السكنية غير الخدمية (تمنع «في الخلف» إن وقعت بين الفراغ والواجهة)
const HABIT_KIND = new Set(['suite', 'majlis', 'family', 'dining', 'office', 'prayer']);
const HABIT_TYPE = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'office', 'prayer']);
/**
 * عقوبة القواعد لترتيب مرشح. يعيد { base, p:[بلا مرآة، بمرآة] } — الجهات الجانبية تعتمد على المرآة،
 * فيختار المولّد المرآة التي تحقق طلب العميل.
 */
export function rulePenalty(placed, circ, W, D, rules = [], entry = 's') {
  const B = { x0: 0, y0: 0, x1: W, y1: D }, diag = Math.hypot(W, D);
  let base = 0; const p = [0, 0];
  const step = r => {
    if (r.kind === 'floor') return;
    const A = rectsOf(r.a, placed, circ); if (!A.length) return;
    const any = !!S[r.a]?.any;
    if (r.kind === 'place') {
      for (const m of [0, 1]) {
        const side = canonSide(entry, r.side, !!m); if (!side) continue;
        const solids = [...placed.map(p => p.r), ...circ.filter(c => c.id !== 'stair' && c.id !== 'stairs').map(c => c.r)];
        const habit = r.mode === 'zone' ? [...placed.filter(p => HABIT_KIND.has(p.block.kind) && !A.includes(p.r)).map(p => p.r), ...circ.filter(c => c.id === 'hall' && !A.includes(c.r)).map(c => c.r)] : [];
        // المدخل في جهة: باب الدخول الثاني يحققه المولّد على تلك الواجهة؛ هنا يبقى تقريب النصف كما كان
        const pens = A.map(a => { const def = r.mode === 'zone' && r.a !== 'entrance' ? zoneCheck(a, side, B, solids, habit, { literal: r.side === 'back' }).def : r.mode === 'touch' && openToward(a, side, solids) ? 0 : placeDeficit(a, side, r.mode, B); return def > (r.mode === 'touch' ? .05 : 0) ? 45 + 18 * def : 0; });
        const pen = any ? Math.min(...pens) : pens.reduce((x, y) => x + y, 0);
        if (side[0] !== 'x') { base += pen; break; } p[m] += pen;
      }
      return;
    }
    if (r.kind === 'cluster') { for (const a of A) if (A.length > 1 && !A.some(b => b !== a && contact(a, b) >= 1.0)) base += 45; return; }
    const Bs = rectsOf(r.b, placed, circ); if (!Bs.length) return;
    if (r.kind === 'apart') { for (const a of A) for (const b of Bs) if (a !== b && contact(a, b) > .3) base += 60; return; }
    if (any) { const ok = A.some(a => Bs.some(b => r.kind === 'adjacent' ? contact(a, b) >= 1 : r.kind === 'near' ? contact(a, b) >= .8 || gapOf(a, b) <= 1.8 : contact(a, b) <= .3)); if (!ok) base += 55; return; }
    for (const a of A) {
      const best = Math.min(...Bs.map(b => r.kind === 'adjacent' ? (contact(a, b) >= 1.0 ? 0 : 1 + gapOf(a, b)) : r.kind === 'near' ? (contact(a, b) >= .8 || gapOf(a, b) <= nearGap(r) - .2 ? 0 : gapOf(a, b) - nearGap(r) + 1.2) : 0));
      if (r.kind === 'far') { const need = Math.max(7, diag * .4); for (const b of Bs) { const dd = Math.hypot(ctr(a).x - ctr(b).x, ctr(a).y - ctr(b).y); if (contact(a, b) > .3) base += 55; if (dd < need) base += 30 + 20 * (need - dd); } continue; } // عتبة التحقق نفسها: أي نقص عنها = بند غير منفّذ
      if (best > 0) base += 50 + 14 * best;
    }
  };
  // وزن كل قاعدة بدرجتها: الإلزام والمنع كاملان، والتفضيل أخف (قاعدة بلا درجة = إلزام، كما كانت)
  for (const r of rules) {
    const b0 = base, q0 = p[0], q1 = p[1]; step(r);
    const w = LEVEL_WEIGHT[r.level] ?? 1;
    if (w !== 1) { base = b0 + (base - b0) * w; p[0] = q0 + (p[0] - q0) * w; p[1] = q1 + (p[1] - q1) * w; }
  }
  return { base, p };
}

// ------------------------------------------------------------------------------------------ التحقق من المستند
const ROOM_OF = {
  majlis: r => /^(المجلس|مجلس الرجال|مجلس \d+)$/.test(r.name), majlis_w: r => r.name === 'مجلس النساء', kitchen: r => r.name === 'المطبخ', dining: r => /طعام/.test(r.name),
  master: r => r.name === 'غرفة النوم الرئيسية', kids: r => r.type === 'bedroom' && r.name !== 'غرفة كبار السن' && r.name !== 'غرفة الضيوف', bedrooms: r => (r.type === 'bedroom' || r.type === 'master') && r.name !== 'غرفة الضيوف',
  elderly: r => r.name === 'غرفة كبار السن', maid: r => r.name === 'غرفة الخادمة', driver: r => r.name === 'غرفة السائق', office: r => r.name === 'المكتب', prayer: r => r.name === 'المصلى',
  laundry: r => r.name === 'غرفة الغسيل', storage: r => r.name === 'المخزن', entrance: r => /^(مدخل العائلة|الردهة|مدخل الرجال)$/.test(r.name),
  hall: r => /^الصالة( العائلية| العلوية)?$/.test(r.name),
  onebed: r => (r.type === 'bedroom' || r.type === 'master') && r.name !== 'غرفة الضيوف', guest: r => r.name === 'غرفة الضيوف', guestwc: r => /^دورة مياه (الضيوف|الرجال)$/.test(r.name),
  servicedoor: r => r.name === 'المطبخ',
};
/** غرف المستند بمستطيلاتها الصافية (حسب الدور)، وحدود المبنى. +x شرق و+y شمال. */
export function docRooms(doc) {
  const A = analyzeDoc(doc), rooms = [];
  doc.levels.forEach((lv, i) => {
    const L = A.levelById.get(lv.id); if (!L) return;
    for (const r of L.rooms) { if (r.unlabelled || !r.net?.length) continue; const xs = r.net.map(q => q.x), ys = r.net.map(q => q.y); rooms.push({ name: r.name, type: r.type, level: lv.id, li: i, area: r.area, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }); }
  });
  const ws = doc.walls.filter(w => w.level === doc.levels[0].id), bx = ws.flatMap(w => [w.a.x, w.b.x]), by = ws.flatMap(w => [w.a.y, w.b.y]);
  return { rooms, B: { x0: Math.min(...bx), x1: Math.max(...bx), y0: Math.min(...by), y1: Math.max(...by) } };
}
/** سلالم المستند كمستطيلات (من درجاتها الفعلية)، في دورها وفي الدور الذي تصعد إليه (فتحة الدرج). */
export function docStairs(doc) {
  const out = [];
  (doc.stairs || []).forEach(s => {
    const li = doc.levels.findIndex(l => l.id === s.level); if (li < 0) return;
    let pts = [];
    try { pts = stairLayout(s, 3.2).steps.flatMap(st => st.poly); } catch { pts = []; }
    if (!pts.length) pts = [{ x: s.x - (s.w || 1.1) / 2, y: s.y }, { x: s.x + (s.w || 1.1) / 2, y: s.y + (s.run || 3.2) }];
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y), box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    for (const i of [li, li + 1]) if (doc.levels[i]) out.push({ name: 'الدرج', type: 'stairs', level: doc.levels[i].id, li: i, area: (box.x1 - box.x0) * (box.y1 - box.y0), ...box });
  });
  return out;
}
/** أبواب المستند: لكل غرفة جيرانها عبر الأبواب، وأبوابها الخارجية. */
export function doorInfo(doc) {
  const A = analyzeDoc(doc), nb = new Map(), ext = new Map(), names = new Map();
  for (const L of A.levels) {
    for (const r of L.rooms) { names.set(r.id, r.name); nb.set(r.id, new Set()); ext.set(r.id, 0); }
    for (const op of L.openings) {
      if (!op.door) continue;
      if (op.left && op.right && op.left.id !== op.right.id) { nb.get(op.left.id)?.add(op.right.id); nb.get(op.right.id)?.add(op.left.id); }
      const inner = op.left && !op.right ? op.left : op.right && !op.left ? op.right : null; if (inner) ext.set(inner.id, (ext.get(inner.id) || 0) + 1);
    }
  }
  const byName = n => [...names].filter(([, v]) => v === n).map(([k]) => k);
  return { nb, ext, names, byName, neighbors: n => byName(n).flatMap(id => [...(nb.get(id) || [])].map(x => names.get(x))), extDoors: n => byName(n).reduce((a, id) => a + (ext.get(id) || 0), 0) };
}
const docSide = (side, entry) => {
  const opp = { n: 's', s: 'n', e: 'w', w: 'e' }, RIGHT = { s: 'e', n: 'w', e: 'n', w: 's' };
  if (side === 'center') return 'c';
  const c = side === 'front' ? entry : side === 'back' ? opp[entry] : side === 'right' ? RIGHT[entry] : side === 'left' ? opp[RIGHT[entry]] : side;
  return { n: 'y1', s: 'y0', e: 'x1', w: 'x0' }[c];
};
const r1 = v => Math.round(v * 10) / 10;
/** (الجولة الخامسة عشرة) أدنى مسار مشي من وصول الدرج إلى باب غرفة «بعيدة عن الدرج» — قيمة تصميمية افتراضية للميزان. */
export const FAR_STAIR_PATH = 6.0;
/**
 * مسار المشي في دور الغرفة من مركز آخر درجة لأقرب درج يصل إليه إلى أقرب باب للغرفة: شبكة نقاط (وصول الدرج + منتصفات الأبواب)
 * تتصل داخل كل غرفة بخطوط مستقيمة (تقدير أدنى: أي التفاف حول ركن يزيده)، ودايكسترا. room: { name, level } من docRooms.
 * يعيد { dist, via[] } أو null إن لم يصل درج إلى دور الغرفة.
 */
export function stairPathTo(doc, room) {
  const A = analyzeDoc(doc), li = doc.levels.findIndex(l => l.id === room.level); if (li <= 0) return null;
  const L = A.levelById.get(room.level), below = doc.levels[li - 1]?.id; if (!L) return null;
  const R = L.rooms.find(x => x.name === room.name); if (!R) return null;
  const starts = [];
  for (const s of doc.stairs || []) {
    if (s.level !== below) continue;
    let lay = null; try { lay = stairLayout(s, (doc.levels[li].elevation ?? 3.2) - (doc.levels[li - 1].elevation || 0)); } catch { lay = null; }
    const last = lay?.steps?.[lay.steps.length - 1]?.poly; if (!last) continue;
    const top = { x: last.reduce((t, q) => t + q.x, 0) / last.length, y: last.reduce((t, q) => t + q.y, 0) / last.length };
    const host = L.roomAt(top); if (host) starts.push({ p: top, room: host.id });
  }
  if (!starts.length) return null;
  const doors = L.openings.filter(op => op.door && op.left && op.right && op.left.id !== op.right.id).map(op => ({ p: op.p, rooms: [op.left.id, op.right.id] }));
  const N = [...starts.map(s => ({ p: s.p, rooms: [s.room], start: true })), ...doors], d = N.map(n => (n.start ? 0 : Infinity)), prev = N.map(() => -1), done = N.map(() => false);
  for (;;) {
    let i = -1; for (let k = 0; k < N.length; k++) if (!done[k] && d[k] < Infinity && (i < 0 || d[k] < d[i])) i = k;
    if (i < 0) break; done[i] = true;
    if (!N[i].start && N[i].rooms.includes(R.id)) {
      const via = []; for (let k = prev[i]; k >= 0 && !N[k].start; k = prev[k]) { const nm = N[k].rooms.map(id => L.roomsById.get(id)?.name).filter(Boolean); via.unshift(nm.join('/')); }
      return { dist: d[i], via: [...new Set(via)].slice(0, 4) };
    }
    if (N[i].rooms.includes(R.id) && !N[i].start) continue;
    for (let k = 0; k < N.length; k++) { if (done[k] || N[k].start) continue; if (!N[i].rooms.some(x => N[k].rooms.includes(x))) continue; if (!N[i].start && N[i].rooms.includes(R.id)) continue; const w = Math.hypot(N[i].p.x - N[k].p.x, N[i].p.y - N[k].p.y); if (d[i] + w < d[k]) { d[k] = d[i] + w; prev[k] = i; } }
  }
  return null;
}
/**
 * يتحقق من كل قاعدة على المستند. يعيد [{ id, text, ok, why }] — ok=false مع سبب مقيس.
 */
export function verifyRules(doc, rules = [], { entry = 's' } = {}) {
  const { rooms, B } = docRooms(doc), out = [], diag = Math.hypot(B.x1 - B.x0, B.y1 - B.y0);
  const stairs = docStairs(doc);
  const sel = id => id === 'stairs' ? stairs : rooms.filter(r => ROOM_OF[id]?.(r));
  // الصالة: الرئيسية أولًا
  const pickHall = list => { const main = list.filter(r => r.name === 'الصالة'); return main.length ? main : list.slice(0, 1); };
  for (const r of rules) {
    let A = sel(r.a); if (r.a === 'hall') A = pickHall(A);
    const res = { id: r.id, text: r.text, kind: r.kind, level: r.level || 'must', ok: true, why: '' };
    if (!A.length) { res.ok = false; res.why = `لا يوجد «${subjAr(r.a)}» في هذا التصميم.`; out.push(res); continue; }
    if (r.kind === 'floor') {
      // القاعدة الأخص تتقدم: «غرف النوم فوق» مع «غرفة أمي في الأرضي» — غرفة كبار السن خارج القاعدة العامة
      const own = rules.filter(o => o !== r && o.kind === 'floor' && o.floor !== r.floor && o.a !== r.a).flatMap(o => sel(o.a));
      if (own.length) A = A.filter(a => !own.includes(a));
      const want = r.floor === 'upper' ? 1 : 0, bad = A.filter(a => (a.li > 0 ? 1 : 0) !== want);
      if (doc.levels.length < 2 && want === 1) { res.ok = false; res.why = 'التصميم بدور واحد؛ اختر دورين في بيانات الأرض أو اكتب «دورين».'; }
      else if (bad.length) { res.ok = false; res.why = `«${bad[0].name}» في ${bad[0].li ? 'الدور العلوي' : 'الدور الأرضي'}.`; }
      out.push(res); continue;
    }
    if (r.kind === 'place') {
      const side = docSide(r.side, entry), where = r.side === 'front' ? 'الواجهة الأمامية' : r.side === 'back' ? 'الخلف' : r.side === 'right' ? 'يمين الداخل' : r.side === 'left' ? 'يسار الداخل' : COMPASS_AR[r.side];
      const lvRooms = a => rooms.filter(o => o.level === a.level && o !== a && !['courtyard', 'terrace'].includes(o.type));
      // zone: الغرف السكنية غير الخدمية في الدور نفسه (عدا الفراغ وأقرانه في القاعدة نفسها)
      const zc = a => zoneCheck(a, side, B, lvRooms(a), lvRooms(a).filter(o => HABIT_TYPE.has(o.type) && !A.includes(o)), { literal: r.side === 'back' });
      const fail = a => r.mode === 'zone' ? zc(a).def > 0 : !(r.mode === 'touch' && openToward(a, side, lvRooms(a))) && placeDeficit(a, side, r.mode, B) > (r.mode === 'touch' ? .45 : r.mode === 'avoid' ? .15 : 0);
      // «مدخل ثاني من الشارع الشرقي»: المدخل في جهة = باب دخول خارجي على واجهة تلك الجهة (أيًّا كانت الغرفة التي يفتح عليها)
      if (r.a === 'entrance' && ['zone', 'half', 'touch'].includes(r.mode)) {
        const g = doc.levels[0].id, onSide = o => { const w = doc.walls.find(x => x.id === o.wall); if (!w) return false; const ax = side[0], v = B[side]; return Math.abs(w.a[ax] - v) < .35 && Math.abs(w.b[ax] - v) < .35; };
        const doorAt = doc.openings.find(o => o.entry && o.level === g && onSide(o));
        if (doorAt) { res.why = `باب دخول خارجي على واجهة ${where}.`; out.push(res); continue; }
      }
      const bad = S[r.a]?.any ? (A.every(fail) ? A.slice(0, 1) : []) : A.filter(fail);
      if (bad.length && r.mode === 'zone') {
        const z = zc(bad[0]), parts = [`لا يلامس الواجهة ${where === 'الخلف' ? 'الخلفية' : where === 'الواجهة الأمامية' ? 'الأمامية' : 'من جهة ' + where} (يبعد ${r1(z.tdef)} م)`];
        if (z.third > 0) parts.push(`ومركزه على ${Math.round(z.f * 100)}% من عمق المبنى من تلك الجهة لا في ثلثه الخارجي`);
        if (z.between?.length) parts.push(`و${z.between.length > 1 ? 'تقع' : 'يقع'} بينه وبين تلك الواجهة «${z.between.map(o => o.name).join('» و«')}»`);
        const menC = r.a === 'majlis' && side === docSide('back', entry) && rooms.some(x => x.name === 'مدخل الرجال' || x.name === 'مجلس الرجال' || x.name === 'المجلس');
        res.ok = false; res.why = `«${bad[0].name}» ${parts.join('، ')}.` + (menC ? ' مجلس الرجال يبقى على الواجهة الأمامية ليأخذ مدخله المستقل عن العائلة، وهذه الجهة خلف المبنى.' : '');
        // (الجولة الخامسة عشرة) القراءة النسبية لـ«في الخلف»: الفراغ خلف منطقة الاستقبال (المجلس والطعام والمداخل) بالنسبة للشارع
        // ولا يلامس الواجهة الأمامية — تُذكر «تحققًا جزئيًا» بجانب سبب القراءة الحرفية (الحكم يبقى غير متحقق حرفيًا).
        // النص نفسه يقرؤه السجل الصارم ورد التعديل، فلا تناقض بينهما.
        if (r.side === 'back') {
          const rel = relativeBack(bad[0], side, entry, rooms, B);
          if (rel) res.partial = { reading: 'relative', text_ar: rel + (z.open ? '، ويطل على الخلف بلا فراغ مبني خلفه' : ''), literal_ar: res.why };
          else if (z.open) res.partial = { reading: 'open-rear', text_ar: `«${bad[0].name}» يطل على الخلف بلا فراغ مبني خلفه، لكن مركزه على ${Math.round(z.f * 100)}% من عمق المبنى من الواجهة الخلفية`, literal_ar: res.why };
        }
        out.push(res); continue;
      }
      if (bad.length && r.mode === 'center') { res.ok = false; res.why = `«${bad[0].name}» ليس في وسط المبنى.`; out.push(res); continue; }
      if (bad.length && r.mode === 'avoid') { res.ok = false; res.why = `«${bad[0].name}» يلامس جدار ${where}.`; out.push(res); continue; }
      const menConflict = r.a === 'majlis' && side !== docSide('front', entry) && rooms.some(x => x.name === 'مدخل الرجال' || x.name === 'مجلس الرجال' || x.name === 'المجلس');
      if (bad.length) { res.ok = false; res.why = (r.mode === 'touch' ? `«${bad[0].name}» لا يلامس جدار ${where} (يبعد ${r1(placeDeficit(bad[0], side, 'touch', B))} م).` : `«${bad[0].name}» ليس في نصف المبنى من جهة ${where}.`) + (menConflict && side === docSide('back', entry) ? ' مجلس الرجال يبقى على الواجهة الأمامية ليأخذ مدخله المستقل عن العائلة، وهذه الجهة خلف المبنى.' : ''); }
      else if (r.mode === 'touch') { const far = A.find(a => placeDeficit(a, side, 'touch', B) > .45); if (far) res.why = `«${far.name}» يرتد ${r1(placeDeficit(far, side, 'touch', B))} م عن حد المبنى ويطل على ${where} بلا فراغ مبني أمامه (حديقة أو فناء مفتوح).`; }
      out.push(res); continue;
    }
    const same = (a, b) => a.level === b.level;
    if (r.kind === 'cluster') { const lone = A.find(a => A.length > 1 && !A.some(b => b !== a && same(a, b) && contact(a, b) >= .8)); if (lone) { res.ok = false; res.why = `«${lone.name}» لا تلاصق أيًّا من بقية المجموعة.`; } out.push(res); continue; }
    let Bs = sel(r.b); if (r.b === 'hall') Bs = pickHall(Bs);
    if (!Bs.length) { res.ok = false; res.why = `لا يوجد «${subjAr(r.b)}» في هذا التصميم.`; out.push(res); continue; }
    if (r.kind === 'apart') { for (const a of A) { const t = Bs.find(b => b !== a && same(a, b) && contact(a, b) > .3); if (t) { res.ok = false; res.why = `«${a.name}» ملاصق لـ«${t.name}».`; break; } } out.push(res); continue; }
    if (r.b === 'servicedoor') { const D = doorInfo(doc), k = A.find(a => D.extDoors(a.name) > 0); if (!k) { res.ok = false; res.why = 'المطبخ بلا باب خدمة خارجي في هذا التصميم.'; } out.push(res); continue; }
    if (S[r.a]?.any) { const ok = A.some(a => Bs.some(b => b !== a && same(a, b) && (r.kind === 'adjacent' ? contact(a, b) >= .8 : r.kind === 'near' ? contact(a, b) >= .6 || gapOf(a, b) <= 2 : contact(a, b) <= .3))); if (!ok) { res.ok = false; res.why = `لا توجد «${subjAr(r.a)}» تحقق ذلك.`; } out.push(res); continue; }
    for (const a of A) {
      const cands = Bs.filter(b => same(a, b) && b !== a);
      if (r.kind === 'far') {
        const need = Math.max(7, diag * .4);
        const close = Bs.find(b => b !== a && same(a, b) && (contact(a, b) > .3 || Math.hypot(ctr(a).x - ctr(b).x, ctr(a).y - ctr(b).y) < need));
        if (close) { res.ok = false; res.why = contact(a, close) > .3 ? `«${a.name}» ملاصق لـ«${close.name}».` : `المسافة بين «${a.name}» و«${close.name}» ${r1(Math.hypot(ctr(a).x - ctr(close).x, ctr(a).y - ctr(close).y))} م فقط.`; break; }
        // (الجولة الخامسة عشرة) «بعيدة عن الدرج» بمسار المشي لا بالمراكز: من آخر درجة (وصول الدرج) إلى باب الغرفة عبر الأبواب
        // ≥ FAR_STAIR_PATH م (قيمة تصميمية افتراضية للميزان) — باب على ممر ملاصق لبيت الدرج لا يحقق «بعيدة» ولو بعد مركزها
        if (r.b === 'stairs' || r.a === 'stairs') {
          const room = r.a === 'stairs' ? null : a; let pd = null; try { pd = room ? stairPathTo(doc, room) : null; } catch { pd = null; }
          if (pd && pd.dist < FAR_STAIR_PATH) { res.ok = false; res.why = `مسار المشي من وصول الدرج إلى باب «${a.name}» ${r1(pd.dist)} م فقط (المطلوب ≥ ${FAR_STAIR_PATH} م، قيمة تصميمية افتراضية للميزان)${pd.via.length ? ` عبر ${pd.via.map(n => `«${n}»`).join(' ثم ')}` : ''}.`; break; }
          if (pd) res.why = `مسار المشي من وصول الدرج إلى باب «${a.name}» ${r1(pd.dist)} م (≥ ${FAR_STAIR_PATH} م)${pd.via.length ? ` عبر ${pd.via.map(n => `«${n}»`).join(' ثم ')}` : ''}.`;
        }
        continue;
      }
      if (!cands.length) { res.ok = false; res.why = `«${a.name}» و«${subjAr(r.b)}» في دورين مختلفين.`; break; }
      const okOne = b => r.kind === 'adjacent' ? contact(a, b) >= .8 : contact(a, b) >= .6 || gapOf(a, b) <= nearGap(r);
      if (!cands.some(okOne)) { const g = Math.min(...cands.map(b => gapOf(a, b))); res.ok = false; res.why = `«${a.name}» ${r.kind === 'adjacent' ? 'لا يلاصق' : 'بعيد عن'} «${cands[0].name}»${g > .3 ? ` (بينهما ${r1(g)} م)` : ''}.`; break; }
    }
    out.push(res);
  }
  return withStatus(out);
}


const EXTRA_AR = { maid: ['غرفة الخادمة', 'maid'], driver: ['غرفة السائق', 'driver'], office: ['المكتب', 'office'], prayer: ['المصلى', 'prayer'], laundry: ['غرفة الغسيل', 'laundry'], storage: ['المخزن', 'storage'] };
const AREA_SUBJ = { master: 'master', majlis: 'majlis', hall: 'hall', dining: 'dining', kitchen: 'kitchen', bedroom: 'kids' };
/**
 * سجل التنفيذ الكامل لطلب العميل على المستند: القواعد المكانية + الفراغات الإضافية + المقاسات + «بدون» +
 * عدد الأدوار + الحمامات. كل بند { text, ok, why } مقيس من المستند نفسه، لا من نية المولّد.
 */
export function verifyRequest(doc, req = {}, { entry = 's' } = {}) {
  const out = verifyRules(doc, req.rules || [], { entry });
  const { rooms } = docRooms(doc), sel = id => rooms.filter(r => ROOM_OF[id]?.(r));
  for (const [k, [ar, id]] of Object.entries(EXTRA_AR)) if (req.extras?.[k]) {
    const got = sel(id).length > 0; out.push({ id: 'X-' + k, kind: 'extra', text: ar, ok: got, why: got ? '' : `«${ar}» لم تتسع في هذا التصميم.` });
    if (got && req.extras[k]?.bath) { const b = rooms.some(r => r.name === (k === 'maid' ? 'حمام الخادمة' : 'حمام السائق')); out.push({ id: 'X-' + k + '-bath', kind: 'extra', text: (k === 'maid' ? 'حمام الخادمة' : 'حمام السائق'), ok: b, why: b ? '' : 'عدد دورات المياه لا يكفي؛ زده واحدًا.' }); }
  }
  for (const [k, a] of Object.entries(req.areas || {})) {
    const sid = AREA_SUBJ[k]; if (!sid) continue;
    let list = sel(sid); if (sid === 'hall') { const m = list.filter(r => r.name === 'الصالة'); list = m.length ? m : list.slice(0, 1); } if (sid === 'majlis') list = list.slice(0, 1);
    if (!list.length) { out.push({ id: 'A-' + k, kind: 'area', text: `${subjAr(sid)} ${a} م²`, ok: false, why: 'الفراغ غير موجود في هذا التصميم.' }); continue; }
    const bad = list.find(r => r.area < a * .85 || r.area > a * 1.25);
    out.push({ id: 'A-' + k, kind: 'area', text: `${list.length > 1 ? subjAr(sid) : `«${list[0].name}»`} بمساحة ${a} م² تقريبًا`, ok: !bad, why: bad ? `مساحة «${bad.name}» الصافية ${r1(bad.area)} م².` : `الفعلي ${list.map(r => r1(r.area)).join('، ')} م² (صافٍ داخل الجدران).` });
  }
  const c = req.counts || {};
  if (c.majlis === 0) { const n = sel('majlis').length + sel('majlis_w').length; out.push({ id: 'C-majlis', kind: 'count', text: 'بدون مجلس', ok: n === 0, why: n ? 'يوجد مجلس؛ عدد المجالس في الأعداد ليس صفرًا.' : '' }); }
  if (c.dining === 0) { const n = sel('dining').length; out.push({ id: 'C-dining', kind: 'count', text: 'بدون غرفة طعام', ok: n === 0, why: n ? 'توجد غرفة طعام؛ عددها في الأعداد ليس صفرًا.' : '' }); }
  if (Number.isInteger(c.bedrooms) && c.bedrooms > 0) { const n = sel('bedrooms').length; out.push({ id: 'C-bed', kind: 'count', text: `${c.bedrooms} غرف نوم`, ok: n === c.bedrooms, why: n === c.bedrooms ? '' : `في التصميم ${n}.` }); }
  if (c.majlis >= 2) { const w = sel('majlis_w').length, m = sel('majlis').length; out.push({ id: 'C-maj2', kind: 'count', text: 'مجلس للرجال ومجلس للنساء', ok: w >= 1 && m >= 1, why: '' }); }
  // (الجولة الثانية عشرة) القراءة الحرفية لتعارض لم يُجب عنه: العدد المذكور في دوره، والغرفة الأخرى زيادة عليه في دورها — مقيس من المستند
  for (const L of req.literal || []) {
    const fl = x => (L[x] === 'upper' ? 1 : 0), memSel = sel(L.member), beds = sel('bedrooms').filter(r => !memSel.includes(r));
    const inG = beds.filter(r => (r.li > 0 ? 1 : 0) === fl('groupFloor')).length, mem = memSel.filter(r => (r.li > 0 ? 1 : 0) === fl('memberFloor')).length;
    const flAr = x => (L[x] === 'upper' ? 'الدور العلوي' : 'الدور الأرضي');
    out.push({ id: 'L-' + L.type, kind: 'count', text: `${L.groupCount} غرف نوم في ${flAr('groupFloor')}، و«${subjAr(L.member)}» زيادة عليها في ${flAr('memberFloor')}${L.answered ? '' : ' (القراءة الحرفية لطلبك)'}`, ok: inG === L.groupCount && mem >= 1,
      why: inG === L.groupCount && mem >= 1 ? `في ${flAr('groupFloor')} ${inG} غرف نوم، و«${subjAr(L.member)}» في ${flAr('memberFloor')}.` : `في ${flAr('groupFloor')} ${inG} غرف نوم${mem ? '' : `، ولا «${subjAr(L.member)}» في ${flAr('memberFloor')}`}.` });
  }
  const pr = req.prefs || {};
  if (pr.floors) { const n = doc.levels.length; out.push({ id: 'P-floors', kind: 'pref', text: pr.floors === 2 ? 'دوران' : 'دور واحد', ok: n === pr.floors, why: n === pr.floors ? '' : `التصميم ${n === 2 ? 'بدورين' : 'بدور واحد'}.` }); }
  if (pr.noCorridors) { const n = rooms.filter(r => r.name === 'ممر الغرف').length; out.push({ id: 'P-corr', kind: 'pref', text: 'بلا ممرات طويلة (الحركة عبر الصالة)', ok: n === 0, why: n ? 'يوجد ممر للغرف.' : '' }); }
  if (pr.allEnsuite) { const beds = sel('bedrooms').length, own = rooms.filter(r => /^حمام (الرئيسية|غرفة)/.test(r.name)).length; out.push({ id: 'P-ens', kind: 'pref', text: 'حمام خاص لكل غرفة نوم', ok: own >= beds, why: own >= beds ? '' : `${own} حمامات خاصة لـ${beds} غرف؛ زد عدد دورات المياه.` }); }
  if (pr.sharedBaths) { const n = rooms.filter(r => r.name === 'دورة مياه مشتركة').length; out.push({ id: 'P-sh', kind: 'pref', text: 'دورات مياه مشتركة بين الغرف', ok: n > 0 || sel('kids').length === 0, why: n ? '' : 'لا توجد دورة مياه مشتركة؛ عدد دورات المياه قليل.' }); }
  if (pr.womenSeparate || (c.majlis >= 2)) {
    const D = doorInfo(doc), MEN = new Set(['مجلس الرجال', 'مدخل الرجال', 'دورة مياه الرجال']), WOMEN = new Set(['مجلس النساء', 'ممر النساء', 'دورة مياه النساء']);
    const link = [...MEN].find(m => D.neighbors(m).some(n => WOMEN.has(n)));
    const menOwn = D.extDoors('مجلس الرجال') + D.extDoors('مدخل الرجال') > 0;
    out.push({ id: 'P-sep', kind: 'pref', text: 'مجلس الرجال بمدخله المستقل، ومجلس النساء منفصل عنه (لا باب بينهما)', ok: !link && menOwn, why: link ? `«${link}» يتصل بمنطقة النساء بباب.` : menOwn ? '' : 'مجلس الرجال بلا مدخل خارجي مستقل في هذا التصميم.' });
  }
  if (pr.bathsOffHall) { const D = doorInfo(doc), bad = [...D.names].filter(([id, n]) => /^(حمام|دورة مياه)/.test(n) && [...(D.nb.get(id) || [])].some(x => /^الصالة/.test(D.names.get(x)))).map(([, n]) => n); out.push({ id: 'P-bathhall', kind: 'pref', text: 'دورات المياه لا تفتح على الصالة مباشرة', ok: !bad.length, why: bad.length ? `«${bad[0]}» تفتح على الصالة${bad.length > 1 ? ` (و${bad.length - 1} غيرها)` : ''}؛ لا يوجد ممر بديل في هذا التوزيع.` : '' }); }
  for (const [k, ar] of [['office', 'المكتب'], ['maid', 'غرفة الخادمة']]) if (req.extras?.[k]?.ext) { const D = doorInfo(doc), n = D.extDoors(ar); out.push({ id: 'X-' + k + '-ext', kind: 'extra', text: `«${ar}» بباب خارجي`, ok: n > 0, why: n ? '' : 'لم يلامس جدارًا خارجيًا مناسبًا في هذا التصميم.' }); }
  if (req.extras?.guestRoom) { const g = rooms.some(r => r.name === 'غرفة الضيوف'), ok = g && (!req.extras.guestRoom.bath || rooms.some(r => r.name === 'حمام غرفة الضيوف')); out.push({ id: 'X-guest', kind: 'extra', text: 'غرفة نوم للضيوف' + (req.extras.guestRoom.bath ? ' بحمامها' : ''), ok, why: ok ? '' : g ? 'عدد دورات المياه لا يكفي لحمامها؛ زده واحدًا.' : 'لم تتسع غرفة الضيوف في هذا التصميم.' }); }
  if (pr.masterDressing) { const n = rooms.some(r => /^غرفة (ال)?ملابس$/.test(r.name)); out.push({ id: 'P-dress', kind: 'pref', text: 'غرفة ملابس للغرفة الرئيسية', ok: n, why: n ? '' : 'لم تتسع غرفة الملابس في هذا التصميم.' }); }
  if (pr.openKitchen) { const k = sel('kitchen')[0], d = sel('dining')[0], n = !!(k && d && contact(k, d) >= .8); out.push({ id: 'P-open', kind: 'pref', text: 'مطبخ مفتوح على الطعام', ok: n, why: n ? '' : 'المطبخ لا يجاور الطعام في هذا التصميم.' }); }
  if (pr.elderlyRoom) {
    const old = sel('elderly');
    if (old.length) {
      const halls = sel('hall').filter(h => h.level === old[0].level), g = halls.length ? Math.min(...halls.map(h => contact(old[0], h) >= .6 ? 0 : gapOf(old[0], h))) : null;
      if (g === null) out.push({ id: 'P-old', kind: 'pref', text: 'غرفة لكبار السن قرب الصالة', ok: false, status: 'unverified', why: 'غرفة كبار السن موجودة، ولا توجد صالة في دورها للقياس.' });
      else out.push({ id: 'P-old', kind: 'pref', text: 'غرفة لكبار السن قرب الصالة', ok: g <= 2, why: g <= 2 ? `«${old[0].name}» ${g ? `على ${r1(g)} م من الصالة` : 'تلاصق الصالة'}.` : `«${old[0].name}» تبعد ${r1(g)} م عن الصالة.` });
    } else if (rooms.some(r => r.type === 'master' && r.li === 0 && doc.levels.length > 1)) out.push({ id: 'P-old', kind: 'pref', text: 'غرفة لكبار السن قرب الصالة', ok: false, status: 'unverified', why: 'لا توجد غرفة باسم «غرفة كبار السن»؛ الغرفة الرئيسية في الأرضي قد تؤدي الغرض، ولا يمكن التحقق آليًا من أنها المقصودة.' });
    else out.push({ id: 'P-old', kind: 'pref', text: 'غرفة لكبار السن قرب الصالة', ok: false, why: 'لا توجد غرفة مخصصة لكبار السن.' });
  }
  if (pr.guestEntrance) {
    const D = doorInfo(doc), own = ['مدخل الرجال', 'مجلس الرجال', 'المجلس'].find(n => D.extDoors(n) > 0), entries = doc.openings.filter(o => o.entry).length;
    if (own) out.push({ id: 'P-guest', kind: 'pref', text: 'مدخل مستقل للضيوف إلى المجلس', ok: true, why: `«${own}» له باب خارجي.` });
    else if (entries >= 2) out.push({ id: 'P-guest', kind: 'pref', text: 'مدخل مستقل للضيوف إلى المجلس', ok: false, status: 'unverified', why: `في المخطط ${entries} مداخل، ولم يُعثر على باب خارجي يفتح على المجلس أو مدخل الرجال مباشرة؛ لا يمكن ربط أحدها بالمجلس آليًا.` });
    else out.push({ id: 'P-guest', kind: 'pref', text: 'مدخل مستقل للضيوف إلى المجلس', ok: false, why: 'المجلس لا يلامس الواجهة في هذا التصميم.' });
  }
  // مدخل العائلة/النساء المستقل: يُثبت فقط بباب خارجي إلى فراغ نسائي مسمّى؛ غير ذلك «لم يُتحقق» ولا يُعد منفّذًا
  if (pr.familyEntrance) {
    const D = doorInfo(doc), WOMEN = ['مدخل النساء', 'ممر النساء', 'مجلس النساء', 'مدخل العائلة'].filter(n => D.extDoors(n) > 0), men = ['مدخل الرجال', 'مجلس الرجال', 'المجلس'].some(n => D.extDoors(n) > 0);
    const w = WOMEN.find(n => n !== 'مدخل العائلة');
    if (w && men) out.push({ id: 'P-fam', kind: 'pref', text: 'مدخل مستقل للعائلة/النساء', ok: true, why: `«${w}» له باب خارجي مستقل عن مدخل الرجال.` });
    else out.push({ id: 'P-fam', kind: 'pref', text: 'مدخل مستقل للعائلة/النساء', ok: false, status: 'unverified', why: WOMEN.includes('مدخل العائلة') && men ? 'للعائلة مدخل («مدخل العائلة») وللرجال مدخل، لكن المخطط لا يسمّي مدخلًا خاصًا بالنساء؛ لا يمكن التحقق آليًا من أنه مدخل النساء المستقل.' : 'لم يُعثر على باب خارجي مستقل لمنطقة العائلة/النساء؛ يحتاج مراجعة.' });
  }
  if (pr.kitchenOpenHall) { const k = sel('kitchen')[0], h = sel('hall').filter(x => !k || x.level === k.level)[0], n = !!(k && h && contact(k, h) >= .8); out.push({ id: 'P-khall', kind: 'pref', text: 'مطبخ مفتوح على الصالة', ok: n, why: n ? '' : !k || !h ? 'المطبخ أو الصالة غير موجودين.' : 'المطبخ لا يجاور الصالة في هذا التصميم.' }); }
  if (pr.openKitchen === false) {
    // مقيس من فتحات المستند: كل فتحة بين المطبخ وفراغ داخلي آخر باب يُغلق (لا قوس/فتحة)؛ بلا مطبخ = لا يُحكم
    const M = analyzeDoc(doc), ops = M.levels.flatMap(L => L.openings.filter(op => op.door && op.left && op.right && [op.left, op.right].some(x => x.name === 'المطبخ')));
    const open = ops.filter(op => !['door', 'door2', 'slider'].includes(op.kind)).map(op => (op.left.name === 'المطبخ' ? op.right : op.left).name);
    if (!sel('kitchen').length) out.push({ id: 'P-kclosed', kind: 'pref', text: 'مطبخ مغلق بباب', ok: false, status: 'unverified', why: 'لا يوجد مطبخ باسم «المطبخ» في المخطط للقياس.' });
    else out.push({ id: 'P-kclosed', kind: 'pref', text: 'مطبخ مغلق بباب', ok: !open.length, why: open.length ? `المطبخ مفتوح على «${open[0]}» بفتحة بلا باب.` : `فتحات المطبخ الداخلية كلها أبواب (${ops.length}).` });
  }
  // الأبعاد الصريحة («4×5»): مقيسة من المستطيل الصافي للفراغ مع السماحية المعلنة
  const r2d = v => Math.round(v * 100) / 100;
  for (const [k, d] of Object.entries(req.dims || {})) {
    const sid = AREA_SUBJ[k]; if (!sid || !d || !(d.w > 0) || !(d.l > 0)) continue;
    let list = sel(sid); if (sid === 'hall') { const m = list.filter(r => r.name === 'الصالة'); list = m.length ? m : list.slice(0, 1); } if (sid === 'majlis') list = list.slice(0, 1);
    const tol = Number.isFinite(d.tol) ? d.tol : .05, want = [Math.min(d.w, d.l), Math.max(d.w, d.l)];
    const text = `${list.length === 1 ? `«${list[0].name}»` : subjAr(sid)} بأبعاد ${want[0]}×${want[1]} م (كل ضلع ±${tol} م)`;
    if (!list.length) { out.push({ id: 'D-' + k, kind: 'dims', text, ok: false, why: 'الفراغ غير موجود في هذا التصميم.' }); continue; }
    const got = list.map(r => { const s = [r.x1 - r.x0, r.y1 - r.y0].sort((a, b) => a - b); return { r, s, ok: Math.abs(s[0] - want[0]) <= tol && Math.abs(s[1] - want[1]) <= tol }; });
    const bad = got.find(g => !g.ok);
    const g0 = got[0]; // (الجولة الخامسة عشرة) المرسوم والمطلوب لملاحظة «ضمن السماح لا مطابق»
    // (الجولة 21 — 02b) القيمة المقيسة للفراغ الراسب نفسه (لا الأول دائمًا) والسماحية: يحملها سبب الحجب المُهيكل
    out.push({ id: 'D-' + k, kind: 'dims', text, ok: !bad, actual: { s: Math.round(g0.s[0] * 100) / 100, l: Math.round(g0.s[1] * 100) / 100 }, want: { s: want[0], l: want[1] }, tol, ...(bad ? { failing: { name: bad.r.name, s: r2d(bad.s[0]), l: r2d(bad.s[1]) } } : {}), why: (bad ? `«${bad.r.name}» ${r2d(bad.s[0])}×${r2d(bad.s[1])} م — العرض ${r2d(bad.s[0])} من ${want[0]} (فرق ${r2d(Math.abs(bad.s[0] - want[0]))} م) والطول ${r2d(bad.s[1])} من ${want[1]} (فرق ${r2d(Math.abs(bad.s[1] - want[1]))} م)، والسماحية ±${tol} م لكل ضلع` : `الفعلي ${got.map(g => `${r2d(g.s[0])}×${r2d(g.s[1])}`).join('، ')} م`) + ' (المستطيل الصافي داخل الجدران؛ كل ضلع على حدة لا المساحة).' });
  }
  // ما لا يمثّله المولّد: يُسجَّل بصدق «لم يُتحقق» أو «بانتظار العرض»، ولا يُعد منفّذًا أبدًا
  if (req.site?.irregular) out.push(verifySite(doc, req.site, entry));
  const fac = req.tweaks?.facade;
  if (fac && typeof fac === 'object') out.push({ id: 'F-facade', kind: 'facade', text: `الواجهة: ${[fac.materialAr, fac.styleAr].filter(Boolean).join('، ') || 'تعديل'}`, ok: false, status: 'pending-render', why: 'سُجّل طلب الواجهة في المتطلبات وحُفظ التوزيع؛ عرض مادة الواجهة في المجسّم لم يُنفَّذ بعد في هذا الإصدار.' });
  const BIG = { majlis: ['majlis', 30, 'مجلس واسع'], hall: ['hall', 35, 'صالة واسعة'], kitchen: ['kitchen', 15, 'مطبخ واسع'], master: ['master', 22, 'غرفة رئيسية واسعة'] };
  for (const [k, [sid, min, ar]] of Object.entries(BIG)) if (pr['big_' + k] && !(req.areas || {})[k]) {
    let list = sel(sid); if (sid === 'hall') { const m = list.filter(r => r.name === 'الصالة'); list = m.length ? m : list.slice(0, 1); }
    const r0 = list[0]; out.push({ id: 'B-' + k, kind: 'area', text: `${ar} (${min} م² صافية أو أكثر)`, ok: !!r0 && r0.area >= min, why: r0 ? (r0.area >= min ? `الفعلي ${r1(r0.area)} م².` : `الفعلي ${r1(r0.area)} م² فقط.`) : 'الفراغ غير موجود.' });
  }
  return withStatus(out);
}
/**
 * شكل الأرض من كلام العميل (req.site: الواجهة والخلف والعمق) مقيس من مضلع الأرض في المستند نفسه، ومعه احتواء
 * الجدران داخله. مستطيل في المستند = لم يُمثَّل الشكل (فشل صريح لا «منفّذ»). بلا أبعاد في الطلب = «لم يُتحقق».
 */
function verifySite(doc, site, entry) {
  const text = `شكل الأرض: ${site.shapeAr || 'غير منتظم'}${site.front && site.back ? ` (الواجهة ${site.front} م والخلف ${site.back} م${site.depth ? ` والعمق ${site.depth} م` : ''})` : ''}`;
  const res = { id: 'S-shape', kind: 'site', text, ok: false, why: '' };
  const poly = doc.plot?.polygon || [];
  const isRect = poly.length === 4 && poly.every((p, i) => { const q = poly[(i + 1) % 4]; return Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6; });
  if (poly.length < 3 || isRect) { res.why = 'الأرض في المستند مستطيل؛ شكل الأرض المطلوب لم يُمثَّل.'; return res; }
  // الضلع الأمامي: الأقرب إلى جهة المدخل؛ الخلفي: الأبعد. العمق: المسافة بينهما على محور المدخل
  const ax = ['s', 'n'].includes(entry) ? 'y' : 'x', sgn = entry === 's' || entry === 'w' ? 1 : -1;
  const edges = poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return { p, q, L: Math.hypot(q.x - p.x, q.y - p.y), m: sgn * (p[ax] + q[ax]) / 2, flat: Math.abs(p[ax] - q[ax]) < .05 * Math.hypot(q.x - p.x, q.y - p.y) }; }).filter(e => e.flat);
  if (edges.length < 2) { res.status = 'unverified'; res.why = 'مضلع الأرض في المستند بلا ضلعين موازيين للواجهة؛ لا يمكن قياس الواجهة والخلف آليًا.'; return res; }
  edges.sort((a, b) => a.m - b.m);
  const fr = edges[0], bk = edges[edges.length - 1], depth = bk.m - fr.m, r1v = v => Math.round(v * 10) / 10;
  const okDim = (got, want) => !(want > 0) || Math.abs(got - want) <= .5;
  const dimsOk = okDim(fr.L, site.front) && okDim(bk.L, site.back) && okDim(depth, site.depth);
  // الجدران داخل المضلع
  const inside = pt => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  const out = (doc.walls || []).filter(w => !inside(w.a) || !inside(w.b)).length;
  res.ok = dimsOk && !out;
  res.why = `في المستند: الواجهة ${r1v(fr.L)} م، الخلف ${r1v(bk.L)} م، العمق ${r1v(depth)} م${out ? `؛ ${out} جدار خارج حدود الأرض` : '؛ كل الجدران داخل حدود الأرض'}.` + (dimsOk ? '' : ' الأبعاد لا تطابق الطلب (±0.5 م).');
  return res;
}
/**
 * حالة كل بند: done (نُفّذ ومقيس)، failed (مقيس ولم يتحقق)، unverified (لا يمكن قياسه آليًا)، pending-render (مسجَّل وعرضه لاحقًا).
 * ok=true فقط مع done، فلا يُعد بند غير مقيس منفّذًا عند أي مستهلك قديم.
 */
export const LEDGER_STATUS = Object.freeze(['done', 'failed', 'unverified', 'pending-render']);
function withStatus(list) {
  for (const x of list) {
    if (!LEDGER_STATUS.includes(x.status)) x.status = x.ok ? 'done' : 'failed';
    if (x.status !== 'done') x.ok = false;
  }
  return list;
}

/** القاعدة الجديدة تحل محل القديمة لنفس الفراغ ونوع الطلب (مثل: «المطبخ في الأمام» بعد «المطبخ في الخلف»). */
export function mergeRules(old = [], add = [], opts = {}) {
  // (الجولة الحادية عشرة) يمين الداخل ويساره محور واحد أيضًا: «المجلس يمين» بعد «المجلس يسار» يحل محله (كان يُبقيهما فيبقى التعارض)
  const key = r => r.kind === 'place' ? `place|${r.a}|${['e', 'w'].includes(r.side) ? 'x' : ['front', 'back', 'n', 's'].includes(r.side) ? 'y' : ['right', 'left'].includes(r.side) ? 'lr' : r.side}` : r.kind === 'floor' ? `floor|${r.a}` : `rel|${r.a}|${r.b}`;
  // keepOld: بنود الطلب القديمة لا يُدمج بعضها في بعض (قد يكون بينها تعارض لم يُحسم بعد)؛ يحل الجديد محل ما يطابقه فقط
  if (opts.keepOld) { const nk = new Set(add.map(key)); return [...old.filter(r => !nk.has(key(r))), ...add].map((r, i) => ({ ...r, id: 'R' + (i + 1) })); }
  const m = new Map(); for (const r of [...old, ...add]) m.set(key(r), r);
  return [...m.values()].map((r, i) => ({ ...r, id: 'R' + (i + 1) }));
}


/** أسماء عربية للفراغات والجهات (لأسئلة التعارض والرسائل). */
export const subjectAr = subjAr;
export const SIDE_LABELS = Object.freeze({ ...SIDE_AR });
export const OPPOSITE_SIDE = Object.freeze({ ...OPP_SIDE });
export const GROUND_ONLY_SUBJECTS = Object.freeze([...GROUND_ONLY]);

export default { mergeRules, extractRules, rulePenalty, verifyRules, verifyRequest, canonSide, SUBJECTS, levelOf, LEVEL_WEIGHT, LEDGER_STATUS, docStairs };
