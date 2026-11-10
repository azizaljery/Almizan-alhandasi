// شرعاء المرافِقة: تُفتح من أي صفحة، تجيب عن أسئلة العميل من التصميم نفسه، وتنفّذ طلباته عليه.
// كل جواب مقيس من المستند المعروض (لا تخمين): ما لا يُعرف يُقال «لا أعرف» مع ما يمكن فعله.
// منطق خالص بلا واجهة: يُختبر في node، ولوحة shara-panel.mjs تعرضه وتنطقه.
import { normalizeAr, extractRequirements } from './requirements.mjs';
import { redesign as redesignSession, currentDoc, ledgerFor, summarizeDoc, wantsAlternative } from './design-session.mjs';

const r1 = v => Math.round(v * 10) / 10;
const AR_LETTER = '\\u0620-\\u064A\\u066E-\\u06D5';
const has = (t, re) => re.test(t);

/** صفحات المسار كما يراها العميل: الأرض ← شرعاء ← التصميم ← الشكل الخارجي ← ثلاثي الأبعاد ← المخططات ← جدول الكميات. */
export const STAGES = Object.freeze([
  { id: 'land', label: 'الأرض', href: './home.html' },
  { id: 'shara', label: 'شرعاء', href: './home.html' },
  { id: 'design', label: 'التصميم', href: './design.html' },
  { id: 'exterior', label: 'الشكل الخارجي', href: './design.html#exterior' },
  { id: 'view3d', label: 'ثلاثي الأبعاد', href: './view3d.html' },
  { id: 'sheets', label: 'المخططات', href: './final.html#plan0' },
  { id: 'boq', label: 'جدول الكميات', href: './final.html#qty' },
]);
const stage = id => STAGES.find(s => s.id === id);
const go = id => ({ label: stage(id).label, href: stage(id).href });

/** كلمات الفراغات في سؤال العميل ← ما يطابقها في أسماء/أنواع فراغات المخطط. */
const ROOM_WORDS = [
  { re: /مجلس (?:ال)?نساء|مجلس الحريم/, test: r => /النساء/.test(r.name) },
  { re: /مجلس (?:ال)?رجال/, test: r => r.type === 'majlis' && !/النساء/.test(r.name) },
  { re: /مجلس|مجالس/, test: r => r.type === 'majlis' },
  { re: /ماستر|رئيسيه/, test: r => r.type === 'master' || /الرئيسية/.test(r.name) },
  { re: /غرف(?:ه)? (?:ال)?نوم|غرف النوم|النوم/, test: r => r.type === 'bedroom' || r.type === 'master' },
  { re: /مطبخ/, test: r => r.type === 'kitchen' },
  { re: /طعام|سفره|مقلط/, test: r => r.type === 'dining' || /الطعام|المقلط/.test(r.name) },
  { re: /صاله|معيشه|الجلسه/, test: r => r.type === 'living' || /الصالة|جلسة/.test(r.name) },
  { re: /حمام|دوره|دورات/, test: r => r.type === 'bath' },
  { re: /مدخل/, test: r => r.type === 'entrance' },
  { re: /خادمه|شغاله|عامله/, test: r => /الخادمة/.test(r.name) },
  { re: /مكتب/, test: r => /مكتب/.test(r.name) },
  { re: /مخزن|مستودع/, test: r => /مخزن/.test(r.name) },
  { re: /غسيل/, test: r => r.type === 'laundry' || /غسيل/.test(r.name) },
  { re: /ممر/, test: r => r.type === 'corridor' },
  { re: /مصعد/, test: r => /مصعد/.test(r.name) },
];
function roomsAsked(t, rooms) {
  for (const w of ROOM_WORDS) if (w.re.test(t)) { const m = rooms.filter(w.test); if (m.length) return m; return []; }
  return null; // لم يُذكر فراغ
}
const floorsAr = n => n === 1 ? 'دور واحد' : n === 2 ? 'دورين' : n + ' أدوار';
const roomLine = r => `${r.name}: ${r.l} × ${r.w} م = ${r1(r.area)} م² (${r.level})`;

const Q_MARK = new RegExp(`؟|\\?|(?<![${AR_LETTER}])(?:كم|وين|اين|ليش|ليه|لماذا|هل|وش|ايش|ما هو|ما هي|ماهو|ماهي|كيف|متي|مين|من اللي|شنو|اشرح|اشرحي|وضح|وضحي|عرفني|قولي|فهمني)(?![${AR_LETTER}])`);
const ASK_VERB = new RegExp(`(?<![${AR_LETTER}])(?:ابي|ابغي|ابغا|اريد|ودي|خل|خلي|خله|كبر|كبري|صغر|صغري|غير|غيري|حط|حطي|ضيف|ضيفي|اضف|اضيفي|شيل|شيلي|احذف|انقل|انقلي|بدل|بدلي|وسع|وسعي|ضيق|قرب|ابعد|افصل|ادمج|اجعل|اجعلي|سو|سوي)`);

/**
 * نوع رسالة العميل: 'nav' انتقال، 'ask' سؤال عن التصميم، 'change' طلب تعديل، 'help' تعريف، 'unclear'.
 * الطلب الصريح («ابي/خل/كبّر…») يتقدم على صيغة السؤال («هل تقدرين تكبّرين المجلس؟» طلب).
 */
export function classify(text) {
  const t = normalizeAr(text || '');
  if (t.length < 2) return 'unclear';
  if (/(?:افتح|افتحي|ودني|ودني|روح|روحي|انتقل|انتقلي|ارجع|ارجعي|وريني|ورني|اعرض|اعرضي|ابي اشوف|شوفني).*(?:ثلاثي|3d|مجسم|واجه|مخطط|لوح|كميات|تكلف|تصميم|شكل الخارجي|الارض)/i.test(t)) return 'nav';
  if (/^(?:مرحبا|هلا|السلام|اهلا|هاي|صباح|مساء)|(?:وش|ايش|ماذا) (?:تسوين|تقدرين|تعرفين)|من انت|مين انت|ساعديني$|مساعده$/.test(t)) return 'help';
  if (/(?:تقدرين|تقدر|ممكن|يمكن|ينفع|لو سمحت|لو سمحتي|ياليت|يا ليت)/.test(t) && !/^(?:كم|وين|اين|ليش|ليه|لماذا)/.test(t) && !/(?:كم|وين|اين) /.test(t)) return 'change';
  const q = Q_MARK.test(t), v = ASK_VERB.test(t) || wantsAlternative(text);
  if (v && !/^(?:كم|وين|اين|ليش|ليه|لماذا)/.test(t)) return 'change';
  if (q) return 'ask';
  // بلا فعل ولا أداة سؤال: إن فهم منه مستخرج المتطلبات شيئًا فهو طلب («المطبخ في الخلف»)
  try { const m = extractRequirements(text, { counts: {} }); if (m.understood.length || m.unsupported.length) return 'change'; } catch { /* يبقى غير واضح */ }
  return 'unclear';
}

function navAnswer(t) {
  const pick = /ثلاثي|3d|مجسم/i.test(t) ? 'view3d' : /شكل الخارجي|واجه/.test(t) ? 'exterior' : /كميات|تكلف|سعر|اسعار/.test(t) ? 'boq' : /مخطط|لوح/.test(t) ? 'sheets' : /الارض/.test(t) ? 'land' : 'design';
  return { kind: 'nav', text: `تفضل، هذا رابط «${stage(pick).label}».`, actions: [go(pick)] };
}
const HELP = 'أنا شرعاء، معك في كل الصفحات. اسألني عن تصميمك («كم مساحة المجلس؟»، «وين المطبخ؟»، «هل نفّذتِ طلبي؟») أو اطلب تعديلًا بكلامك («كبّري المجلس»، «المطبخ في الخلف»، «ابي تصميم مختلف»، «الواجهة نجدية») وأنفّذه على التصميم المعروض وأخبرك بما تحقق وما لم يتحقق.';

/**
 * صياغة الطلب الحواري بصيغة يفهمها مستخرج المتطلبات: «كبّري المجلس» ← «المجلس أكبر»، «هل تقدرين تحطين المطبخ في الخلف؟» ← «المطبخ في الخلف».
 * لا تضيف معنى: تحذف أدوات التلطّف وفعل الأمر فقط.
 */
export function canonicalAsk(text) {
  let t = String(text || '').replace(/[؟?!.]+\s*$/, '').trim();
  t = t.replace(/^(?:هل\s+)?(?:تقدرين|تقدري|تقدر|ممكن|يمكن|ينفع|لو سمحتي|لو سمحت|يا ?ليت|ابيك|ابيكي|أبيك)\s+(?:انك\s+|انكي\s+|أن\s+)?/, '');
  const big = t.match(/^(?:ت?كب[ّ]?ر(?:ي|ين)?|ت?وس[ّ]?ع(?:ي|ين)?)\s+(.+)$/); if (big) return big[1] + ' أكبر';
  const small = t.match(/^(?:ت?صغ[ّ]?ر(?:ي|ين)?|ت?ضي[ّ]?ق(?:ي|ين)?)\s+(.+)$/); if (small) return small[1] + ' أصغر';
  return t.replace(/^(?:ت?حط(?:ي|ين)?|خل(?:ي|ين)?|ت?خل(?:ي|ين)?|اجعل(?:ي)?|تجعلين|ت?نقل(?:ي|ين)?|انقل(?:ي)?|سو(?:ي)?|تسوين)\s+/, '');
}

/** عناصر الحوش (مسبح، شلال، حديقة...) من قطع المخطط الخارجية. */
const OUTDOOR_WORDS = [[/مسبح/, 'pool', 'المسبح'], [/شلال/, 'waterfall', 'الشلال'], [/حديق|عشب|نجيل/, 'lawn', 'المسطح الأخضر'], [/مظل|كراج|موقف/, 'carport', 'مظلة السيارات'], [/برجول|جلسه خارجيه/, 'pergola', 'البرجولة'], [/شوا|باربكيو|باربيكيو/, 'bbq', 'ركن الشواء'], [/نافور/, 'fountain', 'النافورة'], [/احواض|حوض زرع/, 'planter', 'أحواض الزرع']];
function outdoorAnswer(t, doc) {
  for (const [re, kind, name] of OUTDOOR_WORDS) if (re.test(t)) {
    const n = (doc.fixtures || []).filter(f => f.kind === kind).length;
    return { kind: 'answer', text: n ? `${name} موجود في حوش هذا التصميم${n > 1 ? ' (' + n + ')' : ''}؛ تراه في مخطط الموقع العام وفي العرض ثلاثي الأبعاد.` : `${name} غير موجود في هذا التصميم. إن أردته قل: «ابي ${name.replace(/^ال/, '')}».`, actions: n ? [go('sheets')] : [] };
  }
  return null;
}

/** جواب سؤال من المخطط نفسه. يعيد null إن لم يُعرف السؤال. */
export function answerQuestion(session, text, { page = 'design' } = {}) {
  const t = normalizeAr(text), doc = currentDoc(session), sum = summarizeDoc(doc), { specs, rooms } = sum;
  const asked = roomsAsked(t, rooms), entry = session.input?.land?.entries?.[0] || 's';
  const od = /وين|اين|فيه|موجود|هل |كم /.test(t) ? outdoorAnswer(t, doc) : null; if (od) return od;
  // هل نُفّذ طلبي؟
  if (/نفذت|نفذتي|تنفذ|طلبي|طلباتي|حققت|حققتي|التزمت/.test(t)) {
    const L = ledgerFor(session, doc), bad = L.filter(x => !x.ok);
    if (!L.length) return { kind: 'answer', text: 'لا توجد طلبات مسجلة لأقيسها على هذا التصميم.' };
    return { kind: 'answer', text: `نُفّذ ${L.length - bad.length} من ${L.length} من طلباتك في هذا التصميم.` + (bad.length ? ' لم يتحقق: ' + bad.map(x => `«${x.text}»${x.why ? ' — ' + x.why : ''}`).join('؛ ') + '.' : ' كلها محققة.'), actions: bad.length ? [{ label: 'اطلب تصميمًا آخر', say: 'ابي تصميم مختلف' }] : [] };
  }
  // أين؟
  if (/(?:وين|اين|مكان|موقع|في اي دور|باي دور)/.test(t) && asked) {
    if (!asked.length) return { kind: 'answer', text: 'هذا الفراغ غير موجود في التصميم المعروض.' };
    return { kind: 'answer', text: asked.map(r => `${r.name} في ${r.level}${where(doc, r, entry) ? '، ' + where(doc, r, entry) : ''}`).join('؛ ') + '.' };
  }
  // كم مساحة/مقاس فراغ
  if (asked && /كم|مساح|مقاس|ابعاد|حجم|طول|عرض|قد ايش|قد ايه/.test(t)) {
    if (!asked.length) return { kind: 'answer', text: 'هذا الفراغ غير موجود في التصميم المعروض.' };
    if (/كم (?:عدد )?(?:غرف|غرفه|حمام|حمامات|دوره|دورات|مجلس|مجالس)/.test(t) && !/مساح|مقاس|ابعاد|حجم|طول|عرض/.test(t)) return { kind: 'answer', text: `في التصميم ${asked.length} (${[...new Set(asked.map(r => r.level))].join(' و')}): ${asked.map(r => r.name).join('، ')}.` };
    return { kind: 'answer', text: asked.map(roomLine).join('؛ ') + '. المقاسات صافية من وجه الجدار إلى وجه الجدار.' };
  }
  // المساحة الكلية
  if (/مساح(?:ه|ت) (?:ال)?(?:بيت|بناء|مبني|فيلا|منزل|كليه|اجماليه|مسطح)|مسطح(?:ات)? (?:ال)?بناء|كم (?:متر|مسطح)|المساح(?:ه|ات)$/.test(t)) {
    return { kind: 'answer', text: `مسطح البناء ${r1(specs.built)} م² على ${floorsAr(specs.floors)} (غلاف الأرضي ${specs.width} × ${specs.depth} م)، وصافي الفراغات ${r1(specs.net)} م². التفصيل في جدول المساحات.`, actions: [go('sheets')] };
  }
  // الأعداد
  if (/كم (?:عدد )?(?:غرف|غرفه|حمام|حمامات|دور|ادوار|طابق|مجلس|مجالس|مدخل|مداخل)/.test(t)) {
    return { kind: 'answer', text: `في التصميم: ${specs.bedrooms} غرف نوم، ${specs.baths} دورات مياه، ${specs.majlis} مجلس، ${floorsAr(specs.floors)}، و${specs.entries} مدخل خارجي.` };
  }
  // ما الفراغات؟
  if (/(?:وش|ايش|ما) (?:ال)?(?:غرف|فراغات)|(?:وش|ايش|ماذا) (?:فيه|يحتوي|يتكون)|جدول (?:ال)?مساحات|عدد(?:ي)? (?:لي )?(?:ال)?(?:غرف|فراغات)/.test(t)) {
    const by = new Map(); for (const r of rooms) by.set(r.level, [...(by.get(r.level) || []), `${r.name} ${r1(r.area)} م²`]);
    return { kind: 'answer', text: [...by].map(([lv, xs]) => `${lv}: ${xs.join('، ')}`).join(' — ') + '.' };
  }
  // لماذا هذا التوزيع؟
  if (/ليش|ليه|لماذا|سبب|فكره|ما يميز|وش يميز|اشرح|وضح/.test(t)) {
    const d = session.designs[session.current], notes = (d.notes || []).filter(Boolean).slice(0, 4);
    return { kind: 'answer', text: `هذا التصميم: ${d.summary || 'توزيع مقترح'}.` + (notes.length ? ' ما سجّله المولّد عنه: ' + notes.join(' ') : '') + ' هو مخطط مبدئي للنقاش وليس مخططًا تنفيذيًا.' };
  }
  // التكلفة والكميات
  if (/تكلف|سعر|اسعار|بكم|كميات|حديد|خرسان|بلوك/.test(t)) return { kind: 'answer', text: 'الكميات محسوبة من التصميم المعتمد، والتكلفة تُحسب بأسعارك أنت (لا أفترض أسعارًا). تجدها في جدول الكميات.', actions: [go('boq')] };
  // الخطوة التالية
  if (/الخطوه|بعدين|التالي|وش اسوي|كيف اكمل|كيف اعتمد|وش بعد/.test(t)) {
    const next = { design: 'إن أعجبك التصميم اضغط «أعجبني» لأسألك عن الشكل الخارجي ثم يُفتح العرض ثلاثي الأبعاد؛ وإن لم يعجبك قل لي ما تريد تغييره.', view3d: 'بعد مشاهدة البيت من الخارج والداخل انتقل إلى المخططات ثم جدول الكميات.', final: 'هذه آخر المراحل: المخططات ثم جدول الكميات وكتاب المشروع. يمكنك الرجوع وتعديل التصميم في أي وقت.' }[page] || '';
    return { kind: 'answer', text: 'المسار: الأرض ← شرعاء ← التصميم ← الشكل الخارجي ← ثلاثي الأبعاد ← المخططات ← جدول الكميات. ' + next, actions: page === 'design' ? [] : [go(page === 'view3d' ? 'sheets' : 'design')] };
  }
  return null;
}

/** موضع الفراغ في المبنى بالنسبة لواجهة المدخل: أمامي/خلفي ويمين/يسار الداخل. يعيد '' إن تعذّر القياس. */
function where(doc, room, entry = 's') {
  try {
    const lab = doc.labels.find(l => l.name === room.name && l.level === room.levelId); if (!lab) return '';
    const ws = doc.walls.filter(w => w.level === room.levelId && w.kind !== 'fence'), xs = ws.flatMap(w => [w.a.x, w.b.x]), ys = ws.flatMap(w => [w.a.y, w.b.y]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), at = lab.seed || lab.at, u = (at.x - x0) / (x1 - x0), v = (at.y - y0) / (y1 - y0);
    // واجهة المدخل «الأمام»: نسبة البعد عنها، ونسبة الجانب
    const depth = { s: v, n: 1 - v, w: u, e: 1 - u }[entry], side = { s: u, n: 1 - u, w: 1 - v, e: v }[entry];
    if (![depth, side].every(Number.isFinite)) return '';
    const d = depth < .38 ? 'في مقدمة البيت جهة المدخل' : depth > .62 ? 'في خلف البيت' : 'في وسط البيت';
    const s = side < .38 ? '، على يسار الداخل' : side > .62 ? '، على يمين الداخل' : '';
    return d + s;
  } catch { return ''; }
}

/**
 * دور واحد من الحوار. يعيد { kind, text, session?, actions?, changed? }.
 * kind: 'answer' جواب، 'changed' نُفّذ تعديل (session الجديدة)، 'nav' روابط، 'help'، 'unclear' لم يُفهم.
 * exterior: دالة اختيارية applyExteriorText(session, text) → { session, understood[], changed } لتغيير الشكل الخارجي بالكلام.
 */
export async function sharaTurn(session, text, { page = 'design', redesign = redesignSession, ai = null, exterior = null } = {}) {
  const kind = classify(text), t = normalizeAr(text || '');
  if (kind === 'help') return { kind, text: HELP };
  if (kind === 'nav') return navAnswer(t);
  if (!session) return { kind: 'unclear', text: 'لا يوجد تصميم مفتوح بعد. ابدأ من الأرض ثم حدّثني عن بيتك.', actions: [go('land')] };
  if (kind === 'ask') {
    const a = answerQuestion(session, text, { page });
    if (a) return a;
    return { kind: 'unclear', text: 'لم أجد جواب سؤالك في التصميم. أستطيع أن أجيبك عن المساحات والمقاسات ومواضع الغرف وما نُفّذ من طلبك وسبب التوزيع والخطوة التالية؛ أو اطلب تعديلًا بصيغة مباشرة مثل «كبّري المجلس».' };
  }
  if (kind === 'unclear') {
    const a = answerQuestion(session, text, { page }); if (a) return a;
    return { kind, text: 'لم أفهم طلبك بدقة فلم أغيّر شيئًا. اكتبه بصيغة مباشرة مثل: «المطبخ في الخلف»، «كبّري المجلس»، «ابي تصميم مختلف»، أو اسألني: «كم مساحة الصالة؟».' };
  }
  // طلب تغيير الشكل الخارجي بالكلام (لا يعيد توليد المخطط)
  if (exterior && /واجه|شكل الخارجي|طراز|ستايل|حجر|لون (?:ال)?(?:بيت|واجه)|نجدي|حجازي|سلماني|مودرن|كلاسيك|معاصر/.test(t)) {
    try { const e = exterior(session, text); if (e?.changed) return { kind: 'changed', exteriorOnly: true, session: e.session, text: 'عدّلت الشكل الخارجي: ' + e.understood.join('، ') + '. يظهر في العرض ثلاثي الأبعاد.', actions: [go('view3d')] }; } catch { /* يُكمل كطلب عادي */ }
  }
  try {
    const out = await redesign(session, { text: canonicalAsk(text), ai }), r = out.reply || {};
    const head = r.unchanged ? 'التصميم الحالي يحقق طلبك أصلًا، فلم أغيّر فيه شيئًا.' : r.kept ? 'أبقيت توزيعك نفسه وطبّقت التعديل عليه.' : r.different ? 'هذا توزيع مختلف عمّا عُرض عليك.' : 'عدّلت التصميم حسب طلبك.';
    const parts = [head];
    if (r.done?.length) parts.push('نفّذت: ' + r.done.join('، ') + '.');
    else if (!r.unchanged && !r.different && out.changes?.length) parts.push('طبّقت: ' + out.changes.join('، ') + '.');
    if (r.failed?.length) parts.push('لم أستطع في هذه الأرض مع بقية طلباتك: ' + r.failed.map(x => `«${x.text}»${x.why ? ' — ' + x.why : ''}`).join('؛ ') + '.');
    if (r.unsupported?.length) parts.push(r.unsupported.join(' '));
    if (r.unclear?.length && !r.altAsk) parts.push('لم أفهم: ' + r.unclear.map(x => `«${x}»`).join('، ') + '.');
    const away = page !== 'design' && !r.unchanged;
    if (away) parts.push('التصميم المعدّل يحتاج أن تراه وتعتمده قبل أن يتحدث العرض ثلاثي الأبعاد والمخططات.');
    return { kind: 'changed', changed: !r.unchanged, session: out.session, text: parts.join(' '), actions: away ? [{ label: 'عرض التصميم المعدّل', href: './design.html' }] : [] };
  } catch (e) {
    if (e.code === 'SHARA_UNCLEAR' || e.code === 'VILLA_EXHAUSTED') return { kind: 'unclear', text: e.message };
    return { kind: 'unclear', text: 'تعذّر تنفيذ الطلب: ' + (e.message || 'خطأ غير معروف') + ' لم أغيّر شيئًا في تصميمك.' };
  }
}

export default { sharaTurn, classify, answerQuestion, STAGES };
