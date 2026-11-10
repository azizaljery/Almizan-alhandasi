// الشكل الخارجي: ما تسأله شرعاء بعد اعتماد المخطط، وكيف يتحول الجواب إلى واجهة واقعية تخص هذا المخطط وذوق صاحبه.
// وحدة نقية (بلا DOM): تُستعمل في صفحة التصميم، وفي العرض ثلاثي الأبعاد، ومن لوحة شرعاء («غيّر الواجهة إلى نجدي بحجر فاتح»).
//
// العقد:
//   الجواب يُحفظ في session.input.requirements.prefs.exterior = { feel, style, tone, openings, screen, entrance, night, notes }
//   - feel: ما يستهوي العميل (grand هيبة | warm دفء | simple بساطة | heritage تراث | modern حداثة | auto)
//   - style: 'S' سلماني | 'modern' معاصر | 'H' حجازي | 'N' نجدي | 'C' كلاسيكي | 'auto' دع الميزان يقترح
//   - tone / openings / screen / entrance / night: معرّف خيار من EXTERIOR_QUESTIONS أو 'auto'
//   اختيار الواجهة = الطراز (جواب العميل ← ذوقه السابق ← اقتراح الميزان لهذا المخطط) ثم قالب معماري من مكتبة الطراز
//   يُرجَّح بما طلبه (ألوان/مواد، فتحات، طابع) وبعدد أدوار المخطط، وتُكسر المساواة ببصمة المخطط حتى لا يتطابق مخططان مختلفان.
//   الاختلاف معماري (تكوين/كتل/إيقاع/مداخل/عمق/فتحات): القالب يحمل ذلك كله، واللون جزء منه لا بديل عنه.
import { rankStyles, STYLE_AR } from './facade-j/facade-realism/choose-style.mjs';
import { designHash } from './facade-j/facade-realism/variation.mjs';

export const EXTERIOR_KEY = 'mizan.exterior.v1';
export const EXTERIOR_EVENT = 'mizan:exterior';
const AUTO = Object.freeze({ id: 'auto', label: 'دع الميزان يقترح' });

/** الطرز الخمسة المعتمدة فقط (قرار المالك). «معاصر» يجمع المعاصر الحجري والمعاصر الخفيف، ويُحسم بينهما بالمواد. */
export const EXTERIOR_STYLES = Object.freeze([
  { id: 'S', label: 'سلماني', hint: 'كتل حجرية بلون الرمل وأكاليل مثلثة وفتحات عميقة' },
  { id: 'modern', label: 'معاصر', hint: 'خطوط نظيفة وزجاج وكتل واضحة' },
  { id: 'H', label: 'حجازي', hint: 'رواشين خشبية وجدران فاتحة' },
  { id: 'N', label: 'نجدي', hint: 'جدران طينية اللون وشرفات مثلثة وفتحات صغيرة' },
  { id: 'C', label: 'كلاسيكي', hint: 'تماثل وأعمدة وكرانيش' },
]);

const ALL_TONES = [
  { id: 'light', label: 'فاتح: أبيض أو عاجي' }, { id: 'warm', label: 'ترابي دافئ: رملي أو بيج أو طيني' },
  { id: 'stone', label: 'حجر طبيعي ظاهر' }, { id: 'dark', label: 'لمسات داكنة وخشب' }];
/** المواد التي تحملها مكتبة كل طراز فعلًا: لا يُعرض على العميل ما لا يستطيع الطراز تنفيذه. */
const STYLE_TONES = { N: ['warm', 'light', 'stone'], H: ['light', 'warm', 'dark'], C: ['light', 'warm', 'stone'], S: ['warm', 'light', 'stone', 'dark'] };
/** ما يستهوي العميل ← الطرز التي تحمله (يُرشَّح بها سؤال الطراز، ويُختار منها إن ترك الطراز للميزان). */
const FEEL_STYLES = { grand: ['C', 'S'], warm: ['S', 'N', 'H'], simple: ['modern', 'S'], heritage: ['N', 'H', 'S'], modern: ['modern'] };
const FEEL_AR = { grand: 'الهيبة والفخامة', warm: 'الدفء والألفة', simple: 'البساطة والهدوء', heritage: 'الأصالة والتراث', modern: 'الحداثة والانفتاح' };

/** كل الأسئلة بكل خياراتها (للتطبيع وفهم الكلام). الحوار الفعلي يأخذها من exteriorQuestions(answers) التي تتبع الأجوبة السابقة. */
export const EXTERIOR_QUESTIONS = Object.freeze([
  { id: 'feel', text: 'قبل الطراز والمواد: ما الذي يستهويك أنت في بيتٍ تراه من الشارع؟', reason: 'أسأل عنك أولًا لأن الواجهة تعبّر عن صاحبها؛ جوابك يوجّه الطراز والتفاصيل التي أقترحها بعده.', options: [
    { id: 'grand', label: 'هيبة وفخامة' }, { id: 'warm', label: 'دفء وألفة' }, { id: 'simple', label: 'بساطة وهدوء' }, { id: 'heritage', label: 'أصالة وتراث' }, { id: 'modern', label: 'حداثة وانفتاح' }, AUTO] },
  { id: 'style', text: 'أي طراز تحب أن يظهر به بيتك من الخارج؟', reason: 'الطراز يحدد تكوين الواجهة كله: الكتل والمدخل وشكل الفتحات، لا اللون وحده.', options: [...EXTERIOR_STYLES, AUTO] },
  { id: 'tone', text: 'ما الألوان والمواد الأقرب لذوقك؟', reason: 'أرجّح بها قوالب الواجهة التي تحمل هذه المواد فعلًا.', options: [...ALL_TONES, AUTO] },
  { id: 'openings', text: 'كيف تحب الفتحات على الواجهة؟', reason: 'الزجاج الواسع يفتح البيت على الخارج، والفتحات الأقل تحفظ الخصوصية وتخفف الحرارة.', options: [
    { id: 'wide', label: 'زجاج واسع وإطلالة' }, { id: 'balanced', label: 'متوازنة' }, { id: 'private', label: 'فتحات أقل وخصوصية' }, AUTO] },
  { id: 'screen', text: 'اخترتَ زجاجًا واسعًا: هل تريده خلف ساتر (مشربية أو شرائح) يحفظ الخصوصية ويكسر الشمس؟', reason: 'الزجاج الواسع على الشارع يكشف الداخل ويزيد الحرارة؛ الساتر يبقي الإطلالة ويحجب النظر.', options: [
    { id: 'yes', label: 'نعم، زجاج خلف ساتر' }, { id: 'no', label: 'لا، زجاج مكشوف' }, AUTO] },
  { id: 'entrance', text: 'وكيف تحب مدخل بيتك؟', reason: 'المدخل أول ما يراه الضيف؛ يحدد حضور البيت من الشارع.', options: [
    { id: 'grand', label: 'بارز مهيب' }, { id: 'recessed', label: 'غائر مظلّل' }, { id: 'simple', label: 'بسيط هادئ' }, AUTO] },
  { id: 'night', text: 'وفي الليل: كيف تحب أن يظهر البيت؟', reason: 'الإنارة جزء من الواجهة؛ أرجّح بها القوالب المضاءة، وتستطيع رؤية البيت ليلًا من زر «ليل» في العرض.', options: [
    { id: 'lit', label: 'مضاء يُبرز تفاصيله' }, { id: 'calm', label: 'إنارة هادئة خافتة' }, AUTO] },
]);
const QBY = Object.fromEntries(EXTERIOR_QUESTIONS.map(q => [q.id, q]));

/**
 * أسئلة الحوار بترتيبها لهذا العميل، وكل سؤال يتبع ما سبقه:
 *  - الطراز: تتقدم الطرز التي تحمل ما قال إنه يستهويه (suggested: true)، والسبب يذكر ذلك.
 *  - المواد: خيارات الطراز المختار فقط.
 *  - الساتر: يُسأل فقط لمن اختار زجاجًا واسعًا.
 *  - الفتحات في الطراز النجدي: السبب يذكر أن فتحاته صغيرة بطبعها.
 */
export function exteriorQuestions(answers = {}) {
  const a = normalizeExterior(answers), out = [QBY.feel];
  const sug = FEEL_STYLES[a.feel] || [];
  out.push(sug.length ? { ...QBY.style, reason: 'قلتَ إن ما يستهويك ' + FEEL_AR[a.feel] + '؛ قدّمتُ لك الطرز التي تحمل ذلك. ' + QBY.style.reason,
    options: [...sug.map(id => ({ ...EXTERIOR_STYLES.find(o => o.id === id), suggested: true })), ...EXTERIOR_STYLES.filter(o => !sug.includes(o.id)), AUTO] } : QBY.style);
  const tones = STYLE_TONES[a.style];
  out.push(tones ? { ...QBY.tone, text: 'ما الألوان والمواد الأقرب لذوقك في الطراز ال' + EXTERIOR_STYLES.find(o => o.id === a.style).label + '؟', options: [...tones.map(id => ALL_TONES.find(t => t.id === id)), AUTO] } : QBY.tone);
  out.push(a.style === 'N' ? { ...QBY.openings, reason: 'الطراز النجدي فتحاته صغيرة عميقة بطبعه؛ جوابك يحدد أين يقع بيتك بين الأصالة والانفتاح. ' + QBY.openings.reason } : QBY.openings);
  if (a.openings === 'wide') out.push(QBY.screen);
  out.push(QBY.entrance, QBY.night);
  return out;
}

const FIELDS = ['feel', 'style', 'tone', 'openings', 'screen', 'entrance', 'night'];
const optionIds = f => QBY[f].options.map(o => o.id);
const labelOf = (f, id) => QBY[f]?.options.find(o => o.id === id)?.label || '';
/** نص الجواب كما يُعرض على العميل (المدخل يُسبق بكلمته حتى لا يلتبس «بسيط هادئ» بطابع البيت). */
export const answerLabel = (f, id) => (f === 'entrance' && id !== 'auto' ? 'مدخل ' : '') + labelOf(f, id);

/** يطبّع أي كائن إلى جواب صالح؛ المجهول يصير 'auto'. */
export function normalizeExterior(x) {
  const out = {}; for (const f of FIELDS) out[f] = optionIds(f).includes(x?.[f]) ? x[f] : 'auto';
  out.notes = typeof x?.notes === 'string' ? x.notes.trim().slice(0, 400) : '';
  return out;
}
export const isAutoExterior = x => !x || FIELDS.every(f => (x[f] || 'auto') === 'auto');

/** جواب الشكل الخارجي المحفوظ في الجلسة (أو null إن لم يُسأل العميل بعد). */
export function readExterior(session) {
  const e = session?.input?.requirements?.prefs?.exterior; return e ? normalizeExterior(e) : null;
}
/** يعيد جلسة جديدة فيها الجواب؛ الطراز الصريح يُكتب أيضًا في prefs.style/styleWish حتى تتفق كل الصفحات. لا يغيّر الأصل. */
export function setExterior(session, answers) {
  const s = JSON.parse(JSON.stringify(session)), ext = normalizeExterior(answers);
  s.input = s.input || {}; s.input.requirements = s.input.requirements || {}; const prefs = s.input.requirements.prefs = s.input.requirements.prefs || {};
  prefs.exterior = ext;
  const W = STYLE_WISH[ext.style]; if (W) { prefs.style = W.id; prefs.styleWish = W.wish; }
  return s;
}
const STYLE_WISH = { S: { id: 'salmani', wish: 'سلماني' }, modern: { id: 'modern', wish: 'حديث معاصر' }, H: { id: 'hijazi', wish: 'حجازي' }, N: { id: 'najdi', wish: 'نجدي' }, C: { id: 'classic', wish: 'كلاسيكي' } };
const PREF_STYLE = { salmani: 'S', modern: 'modern', hijazi: 'H', najdi: 'N', classic: 'C' };

// ------------------------------------------------------------------------------------------------ فهم الكلام
const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const TEXT_RULES = [
  ['style', 'S', /سلماني/], ['style', 'N', /نجدي|تراثي/], ['style', 'H', /حجازي|رواشين|روشان/], ['style', 'C', /كلاسيك/],
  ['style', 'modern', /مودرن|مودرين|عصري|حديث|معاصر|modern/],
  ['tone', 'stone', /حجر|ترافرتين|رخام/], ['tone', 'dark', /داكن|غامق|اسود|خشب|برونز/], ['tone', 'light', /ابيض|عاجي|فاتح|اوف وايت|كريمي/],
  ['tone', 'warm', /رملي|بيج|طيني|ترابي|دافئ|دافي|اوكر/],
  ['openings', 'private', /خصوصيه|ستر|فتحات (?:اقل|قليله|صغيره)|نوافذ (?:اقل|قليله|صغيره)|بدون زجاج كثير/],
  ['openings', 'wide', /زجاج (?:واسع|كبير|كثير|كامل)|نوافذ (?:واسعه|كبيره|عريضه|بانوراميه)|واجهه زجاجيه|اطلاله|بانورام/],
  ['openings', 'balanced', /فتحات متوازنه|نوافذ عاديه/],
  ['screen', 'yes', /مشربي|ساتر|شرائح|زعانف|خلف ستار/], ['screen', 'no', /زجاج مكشوف|بدون ساتر|بلا ساتر/],
  ['entrance', 'grand', /مدخل (?:بارز|مهيب|فخم|كبير|ملكي)|بوابه (?:كبيره|فخمه|مهيبه)/], ['entrance', 'recessed', /مدخل (?:غائر|مظلل|داخل|مرتد)|رواق/], ['entrance', 'simple', /مدخل (?:بسيط|هادئ|هادي|عادي)/],
  ['night', 'lit', /مضاء|اضاءه (?:ليليه|قويه|خارجيه)|اناره (?:ليليه|قويه|خارجيه)|يلمع بالليل|انوار/], ['night', 'calm', /اضاءه (?:هادئه|خافته)|اناره (?:هادئه|خافته)/],
  ['feel', 'grand', /هيبه|فخامه|فخم|فاخر|مهيب|قصر/], ['feel', 'heritage', /اصاله|تراث|اصيل|قديم/], ['feel', 'warm', /دفء|دافي|الفه|حميم/],
  ['feel', 'simple', /بساطه|بسيط|هادي|هادئ|هدوء|بلا زخرف|بدون زخرف|مينيمال|خطوط نظيفه/], ['feel', 'modern', /حداثه|انفتاح|منفتح/],
];
/** يستخرج من كلام حر ما يخص الشكل الخارجي. أول مطابقة لكل حقل تفوز (الأكثر تحديدًا أولًا في TEXT_RULES). */
export function parseExteriorText(text) {
  const t = norm(text), found = {}, understood = [];
  for (const [f, id, re] of TEXT_RULES) { if (found[f] || !re.test(t)) continue; found[f] = id; understood.push(answerLabel(f, id)); }
  return { found, understood };
}
/**
 * يطبّق كلامًا حرًا على جواب الشكل الخارجي في الجلسة (للوحة شرعاء في أي صفحة).
 * @returns {{session, understood: string[], changed: boolean}} الجلسة الأصلية نفسها إن لم يُفهم شيء أو لم يتغير شيء.
 */
export function applyExteriorText(session, text) {
  const { found, understood } = parseExteriorText(text); if (!understood.length) return { session, understood: [], changed: false };
  const before = readExterior(session) || normalizeExterior({}), after = { ...before, ...found };
  const changed = FIELDS.some(f => before[f] !== after[f]);
  if (!changed) return { session, understood, changed: false };
  after.notes = [before.notes, String(text || '').trim()].filter(Boolean).join(' · ').slice(-400);
  return { session: setExterior(session, after), understood, changed: true };
}
/** وصف عربي مختصر للجواب (لما تعرضه شرعاء وما يُكتب بجانب الواجهة). */
export function describeExterior(ext) {
  const e = normalizeExterior(ext), out = [];
  for (const f of FIELDS) if (e[f] !== 'auto') out.push(answerLabel(f, e[f]));
  return out;
}

// ------------------------------------------------------------------------------------------------ اختيار الطراز والقالب
/** كلمات تُقرأ من اسم القالب ووصفه (المكتوبين في مكتبة الطراز) لتحديد ما يحمله فعلًا. */
const TAGS = {
  stone: /حجر|ترافرتين|مرجان/, dark: /اسود|داكن|خشب|برونز|غامق|تيك/, light: /ابيض|عاجي|لؤلؤ|فاتح|ثلج|جص|رندر/, warm: /طين|رمل|مغره|دافئ|بيج|اوكر|ترابي/,
  wide: /زجاج|ستار|بانورام|شريط نوافذ|عريض|خلجان|واسع|نوافذ كبير|شبابيك (?:طويله|عريضه|ثلاثيه)/, private: /صماء|صامت|كوات|ضيق|محجوب|مصمت|ساتر|مشربي|شاشات|شيش|صلد|صغيره/,
  calm: /بلا زخرف|بسيط|صاف|هادئ|مسطح|صامت|رقيق/, recessed: /غائر|مرتد|رواق|لوجيا|عميق/, screen: /ساتر|مشربي|شرائح|زعانف|بريسولاي|شاشات|شيش|محجوب|ستار خشب/, lit: /انار|مضاء|ليد|فوانيس/, rich: /زخرف|تاج|اكاليل|اكليل|نقش|مدرج|كورنث|روشان|اسنان|شرفات|تيجان|ايوني|جملون/, entrance: /مدخل|بوابه|رواق|برج|مظله/,
};
/** لوحات الألوان التي تطابق كل خيار، بأرقامها في وحدة كل طراز (مقروءة من جداول PALETTES/PAL في وحدات الطرز). */
const TONE_PAL = {
  M: { light: [0, 2, 3], warm: [1, 4], dark: [5], stone: [5] },
  N: { light: [3], warm: [0, 1, 2, 4, 5] },
  H: { light: [0, 3, 4], warm: [2, 5], dark: [3] },
  S: { light: [1], warm: [0, 2], dark: [3], stone: [0, 1, 2, 3] },
};
const tagsOf = t => { const s = norm((t.ar || '') + ' ' + (t.note || '')); return Object.fromEntries(Object.entries(TAGS).map(([k, re]) => [k, re.test(s)])); };
const levelsOf = doc => Math.max(1, Math.min(3, (doc?.levels || []).length || 1));
const tplFloors = t => t?.p?.floors ?? t?.p?.fl ?? t?.p?.flr ?? null;
/** طرز قوالبها تفرض عدد أدوارها على الواجهة مهما طُلب: يُستبعد منها ما لا يطابق أدوار المخطط متى وُجد مطابق. */
const FORCES_FLOORS = new Set(['S']);

/**
 * الطراز: جواب العميل الصريح، ثم ذوقه المفهوم سابقًا (prefs.style)، ثم اقتراح الميزان لهذا المخطط.
 * «معاصر» يُحسم بين الحجري J والخفيف M بالمواد المطلوبة، وإلا ببصمة المخطط.
 * @returns {{id: string, source: 'answer'|'feel'|'taste'|'mizan', reason: string}}
 */
export function resolveStyle(doc, exterior, prefs = {}) {
  const ext = normalizeExterior(exterior), h = designHash(doc);
  const modern = () => (ext.tone === 'stone' || ext.tone === 'dark') ? 'J' : (ext.tone === 'light' || ext.openings === 'wide') ? 'M' : (h % 2 ? 'J' : 'M');
  const pick = (k, source, reason) => ({ id: k === 'modern' ? modern() : k, source, reason });
  if (ext.style !== 'auto') return pick(ext.style, 'answer', 'اختيارك');
  // ترك الطراز للميزان لكنه قال ما يستهويه: يُختار من الطرز التي تحمل ذلك، بترتيب ملاءمتها لهذا المخطط
  const feel = FEEL_STYLES[ext.feel];
  if (feel) { let rk = []; try { rk = rankStyles(doc, '', {}).map(r => r.id); } catch { /* يبقى ترتيب القائمة */ }
    const fam = id => (id === 'M' || id === 'J' ? 'modern' : id), best = rk.map(fam).find(id => feel.includes(id)) || feel[0];
    return pick(best, 'feel', 'يناسب ما يستهويك: ' + FEEL_AR[ext.feel]); }
  const pk = PREF_STYLE[prefs?.style]; if (pk) return pick(pk, 'taste', 'ذوقك الذي ذكرته لشرعاء');
  let ranked = []; try { ranked = rankStyles(doc, prefs?.styleWish || '', {}); } catch { /* مستند ناقص: يبقى الترتيب الثابت */ }
  const top = ranked.find(r => r.id !== 'J') || { id: 'M', reason: '' };
  return { id: top.id, source: 'mizan', reason: 'اقتراح الميزان لتصميمك' + (top.reason ? ': ' + top.reason : '') };
}

/**
 * قالب معماري من مكتبة الطراز لهذا المخطط وهذا الذوق. حتمي: المدخلات نفسها تعطي القالب نفسه.
 * @param {{id,ar,note,p}[]} templates مكتبة قوالب الطراز
 * @returns {{tpl: string, tseed: number, ar: string, score: number, matched: string[], pool: number} | null}
 */
export function pickTemplate(templates, { doc, exterior, prefs = {}, styleId = '' } = {}) {
  if (!templates?.length) return null;
  const ext = normalizeExterior(exterior), taste = new Set(prefs?.taste || []), lv = levelsOf(doc), h = designHash(doc);
  // الذوق السابق يملأ ما لم يُجب عنه: الخصوصية ← فتحات أقل، الإضاءة والمساحات المفتوحة ← زجاج واسع، البساطة ← هادئ، الرحابة ← مدخل بارز
  const openings = ext.openings !== 'auto' ? ext.openings : taste.has('privacy') ? 'private' : (taste.has('light') || taste.has('open')) ? 'wide' : 'auto';
  // ما يستهويه يحدد مقدار التفاصيل: البساطة ← هادئ، الهيبة والتراث ← غني؛ وإلا ذوقه السابق
  const character = ext.feel === 'simple' ? 'calm' : (ext.feel === 'grand' || ext.feel === 'heritage') ? 'rich' : taste.has('calm') ? 'calm' : 'auto';
  const entrance = ext.entrance !== 'auto' ? ext.entrance : (ext.feel === 'grand' || taste.has('spacious')) ? 'grand' : 'auto';
  const pals = TONE_PAL[styleId]?.[ext.tone];
  const same = templates.filter(t => tplFloors(t) === lv), usable = FORCES_FLOORS.has(styleId) && same.length ? same : templates;
  const scored = usable.map(t => {
    const g = tagsOf(t), matched = []; let s = 0;
    const fl = tplFloors(t); if (fl != null) s += fl === lv ? 3 : -3; // القالب يثبّت عدد الأدوار: يُفضَّل ما يطابق المخطط
    if (ext.tone !== 'auto') { if (g[ext.tone]) { s += 2; matched.push(labelOf('tone', ext.tone)); } else if (pals && pals.includes(t.p?.pal)) { s += 2; matched.push(labelOf('tone', ext.tone)); } }
    if (openings === 'wide') { if (g.wide) { s += 2; matched.push(labelOf('openings', 'wide')); } if (g.private) s -= 1.5; }
    if (openings === 'private') { if (g.private) { s += 2; matched.push(labelOf('openings', 'private')); } if (g.wide) s -= 1.5; }
    if (openings === 'balanced' && !g.wide && !g.private) s += 1;
    if (character !== 'auto') { if (g[character]) { s += 1.5; matched.push(character === 'calm' ? 'هادئ بسيط الخطوط' : 'غني بالتفاصيل'); } if (character === 'calm' && g.rich) s -= 1.5; if (character === 'rich' && g.calm) s -= 1.5; }
    if (entrance === 'grand' && g.entrance) { s += 2; matched.push('مدخل ' + labelOf('entrance', 'grand')); }
    if (entrance === 'recessed' && g.recessed) { s += 2; matched.push('مدخل ' + labelOf('entrance', 'recessed')); }
    if (entrance === 'simple' && g.entrance) s -= 1;
    if (ext.screen === 'yes' && g.screen) { s += 2; matched.push(labelOf('screen', 'yes')); }
    if (openings === 'wide' && ext.screen === 'no' && g.screen) s -= 1.5;
    if (ext.night === 'lit' && ((t.p?.led ?? 0) > 0 || (t.p?.light ?? 0) > 1 || g.lit)) { s += 1; matched.push(labelOf('night', 'lit')); }
    return { t, s, matched };
  });
  // المتقاربون (حتى نقطة واحدة) يتساوون وبصمة المخطط تختار بينهم؛ وإن ضاق الاختيار عن ثلاثة يُكمَّل بمن يليهم (حتى نقطتين)
  // حتى لا يحصل مخططان مختلفان على الواجهة نفسها لمجرد تطابق الأجوبة.
  scored.sort((a, b) => b.s - a.s || a.t.id.localeCompare(b.t.id));
  const best = scored[0].s; let pool = scored.filter(x => x.s >= best - 1);
  if (pool.length < 3) pool = scored.filter(x => x.s >= best - 2).slice(0, Math.max(pool.length, 3));
  const c = pool[(h >>> 3) % pool.length];
  return { tpl: c.t.id, tseed: 1 + (h % 97), ar: c.t.ar, score: c.s, matched: c.matched, pool: pool.length };
}

/**
 * الاختيار الكامل. loadTemplates(styleId) → Promise<templates[]> (في المتصفح: من وحدة الطراز).
 * @returns {Promise<{style, styleAr, source, reason, tpl, tseed, tplAr, matched: string[], why: string}>}
 */
export async function chooseExterior({ doc, exterior, prefs = {}, loadTemplates }) {
  const st = resolveStyle(doc, exterior, prefs); let list = [];
  try { list = (await loadTemplates(st.id)) || []; } catch { list = []; }
  const pk = pickTemplate(list, { doc, exterior, prefs, styleId: st.id });
  const styleAr = STYLE_AR[st.id] || st.id;
  const why = [st.reason, pk ? 'قالب «' + pk.ar + '»' + (pk.matched.length ? ' يطابق: ' + [...new Set(pk.matched)].join('، ') : ' اختير ببصمة مخططك') : 'بلا قالب'].filter(Boolean).join(' · ');
  return { style: st.id, styleAr, source: st.source, reason: st.reason, tpl: pk?.tpl || '', tseed: pk?.tseed || 1, tplAr: pk?.ar || '', matched: pk ? [...new Set(pk.matched)] : [], why };
}

// ------------------------------------------------------------------------------------------------ التخزين
/** نسخة في التخزين المحلي تقرؤها صفحة العرض ثلاثي الأبعاد حتى لو لم تُحمَّل الجلسة. */
export function storeExterior(storage, exterior) { try { storage.setItem(EXTERIOR_KEY, JSON.stringify(normalizeExterior(exterior))); return true; } catch { return false; } }
export function loadExterior(storage) { try { const x = JSON.parse(storage.getItem(EXTERIOR_KEY) || 'null'); return x ? normalizeExterior(x) : null; } catch { return null; } }

export const EXTERIOR_FIELDS = Object.freeze(FIELDS);
export default { exteriorQuestions, answerLabel, EXTERIOR_FIELDS, EXTERIOR_QUESTIONS, EXTERIOR_STYLES, EXTERIOR_KEY, EXTERIOR_EVENT, normalizeExterior, readExterior, setExterior, parseExteriorText, applyExteriorText, describeExterior, resolveStyle, pickTemplate, chooseExterior, storeExterior, loadExterior, isAutoExterior };
