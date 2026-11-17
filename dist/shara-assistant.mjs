// شرعاء المرافِقة: تُفتح من أي صفحة، تجيب عن أسئلة العميل من التصميم نفسه، وتنفّذ طلباته عليه.
// كل جواب مقيس من المستند المعروض (لا تخمين): ما لا يُعرف يُقال «لا أعرف» مع ما يمكن فعله.
// منطق خالص بلا واجهة: يُختبر في node، ولوحة shara-panel.mjs تعرضه وتنطقه.
import { normalizeAr, extractRequirements } from './requirements.mjs';
import { redesign as redesignSession, currentDoc, ledgerFor, summarizeDoc, wantsAlternative, scoreDesign } from './design-session.mjs';
import { fixProposals, applyFix } from './design-fixes.mjs';
import { STAGES } from './journey-nav.mjs';
import { checkMunicipal, summaryText, DISCLAIMER, SIDE_AR as PLOT_SIDE_AR } from './municipal-rules.mjs';
import { analyzeSun } from './sun-analysis.mjs';
import { solarSite } from './geo-land.mjs';
import { readExterior, describeExterior, isAutoExterior } from './exterior-brief.mjs';
import { guardKind, guardReply, splitParts, levelTotals } from './shara-guard.mjs';

const r1 = v => Math.round(v * 10) / 10;
const AR_LETTER = '\\u0620-\\u064A\\u066E-\\u06D5';
const has = (t, re) => re.test(t);

/** صفحات المسار كما يراها العميل (المصدر: journey-nav.mjs): الأرض ← شرعاء ← التصميم ← الشكل الخارجي ← ثلاثي الأبعاد ← المخططات ← جدول الكميات. */
export { STAGES };
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
  { re: /خزان|ملابس/, test: r => /ملابس|خزان/.test(r.name) },
  { re: /خادمه|شغاله|عامله/, test: r => /الخادمة/.test(r.name) },
  { re: /مكتب/, test: r => /مكتب/.test(r.name) },
  { re: /مخزن|مستودع/, test: r => /مخزن/.test(r.name) },
  { re: /غسيل/, test: r => r.type === 'laundry' || /غسيل/.test(r.name) },
  { re: /ممر/, test: r => r.type === 'corridor' },
  { re: /مصعد/, test: r => /مصعد/.test(r.name) },
];
const AR_L = AR_LETTER, esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** فراغات سُمّيت باسمها الكامل في السؤال («غرفة نوم 3»، «الصالة العلوية»، «حمام الرئيسية»): الأطول أولًا فلا يبتلع «الصالة» اسم «الصالة العلوية». */
function namedRooms(t, rooms) {
  const names = [...new Set(rooms.map(r => normalizeAr(r.name)))].filter(n => n.length > 2).sort((a, b) => b.length - a.length);
  let rest = ` ${t} `; const hit = new Set();
  for (const n of names) {
    const alt = n.replace(/^ال/, ''), re = new RegExp(`(?<![${AR_L}\\d])(?:[وبلفك]?${esc(n)}|[بل]${esc(alt)})(?![${AR_L}\\d])`);
    if (re.test(rest)) { hit.add(n); rest = rest.replace(re, ' '); }
  }
  return rooms.filter(r => hit.has(normalizeAr(r.name)));
}
function roomsAsked(t, rooms) {
  const named = namedRooms(t, rooms); if (named.length) return named;
  for (const w of ROOM_WORDS) if (w.re.test(t)) { const m = rooms.filter(w.test); if (m.length) return m; return []; }
  return null; // لم يُذكر فراغ
}
/** الدور المسؤول عنه بالنص الصريح «الدور الأول/الأرضي/الثاني». */
function levelAsked(t, rooms) {
  const levels = [...new Set(rooms.map(r => r.level))], key = /(?:دور|طابق)\s*(?:ال)?ارضي|(?:ال)?ارضي|ground/.test(t) ? 'ارضي' : /(?:دور|طابق)\s*(?:ال)?(?:اول|1)(?![\u0620-\u064A])/.test(t) ? 'اول' : /(?:دور|طابق)\s*(?:ال)?(?:ثاني|2)(?![\u0620-\u064A])/.test(t) ? 'ثاني' : /(?:دور|طابق)\s*(?:ال)?(?:ثالث|3)(?![\u0620-\u064A])/.test(t) ? 'ثالث' : null;
  return key ? levels.find(l => normalizeAr(l).includes(key)) || '' : null; // '' = ذُكر دور غير موجود
}
const sumArea = rs => Math.round(rs.reduce((a, r) => a + (r.area || 0), 0) * 100) / 100;
export { levelTotals };
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
  if (/(?:ابي|ابغي|ابغا|اريد|ودي)\s+(?:ان\s+)?(?:اعرف|اشوف|اعلم|اسال|اتاكد|افهم|اتعرف)(?![\u0620-\u064A])/.test(t)) return 'ask';
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

/**
 * أسئلة الاشتراطات البلدية: الجواب من checkMunicipal على المخطط المعروض وأرض الجلسة (بالمطلوب والموجود)، مع تنبيه الصدق دائمًا.
 * «يُراجع» يبقى «يُراجع»: لا يُحوَّل حكمًا في الكلام.
 */
const MUNI_Q = /بلدي|اشتراط|مطابق|يطابق|(?<![\u0620-\u064A])ت?طابق(?:ت|ه)?(?![\u0620-\u064A])|يخالف|نظامي|انظمه (?:ال)?بناء|نظام (?:ال)?بناء|كود (?:ال)?بناء|مخالف|ارتداد|نسبه (?:ال)?بناء|(?:كم|وش|ايش) (?:ال)?مسموح|رخصه/;
const KIND_AR = { front: 'الواجهة', street: 'شارع جانبي/خلفي', neighbor: 'جار' };
const m2 = v => String(Math.round(v * 100) / 100);
const VERDICT_AR = { ok: 'مطابق', review: 'يُراجع', fail: 'مخالف' };
/** مواضيع الاشتراطات المحددة ← معرّفات البنود التي تجيبها (من checkMunicipal على المخطط المعروض). */
const MUNI_TOPICS = [[/ارتفاع|علو (?:ال)?مبني/, ['height', 'roof_parapet']], [/(?:ال)?سور|اسوار/, ['fence']], [/موقف|مواقف|كراج|مظله/, ['parking']], [/ادوار|دور ثالث|دور ثاني|طوابق|كم دور|ملحق/, ['floors']], [/درج|سلم/, ['stair']], [/مدخل (?:ال)?سيار|بوابه/, ['entry_car']], [/مدخل (?:ال)?مشاه|مدخل (?:ال)?رئيسي/, ['entry_ped']], [/ممر|ممرات/, ['corridor']], [/مساحه (?:ال)?غرف|ابعاد (?:ال)?غرف|غرف (?:ال)?نوم/, ['rooms']]];
export function municipalAnswer(session, text) {
  const t = normalizeAr(text), doc = currentDoc(session), res = checkMunicipal(doc, session.input?.land || {});
  const act = [{ label: 'بطاقة مطابقة الاشتراطات', href: './design.html#regsCard' }];
  const segs = []; let extraActs = [];
  if (/ارتداد/.test(t)) {
    if (!res.setbacks.length) segs.push('لم أستطع قياس الارتدادات: حدود الأرض أو شوارعها غير معروفة في هذا المخطط.');
    else {
      const rows = res.setbacks.map(r => `الضلع ${PLOT_SIDE_AR[r.side]} (${KIND_AR[r.kind]}${r.width ? ' عرضه ' + m2(r.width) + ' م' : ''}): المطلوب ${m2(r.required)} م${r.exact ? '' : ' على الأقل'} والموجود ${m2(r.upper !== null ? Math.min(r.ground, r.upper) : r.ground)} م${r.verdict === 'fail' ? ' — مخالف' : r.verdict === 'review' ? ' — يُراجع' : ''}`);
      segs.push(`الارتدادات على أرضك بحسب الاشتراطات العامة للوزارة: ${rows.join('؛ ')}.${res.needsStreetWidth ? ' لم تُدخل عرض الشارع، فحسبتُ الارتداد جهة الشارع بحده الأدنى؛ أدخله في خطوة الأرض للدقة.' : ''}`);
      if (res.needsStreetWidth) extraActs = [{ label: 'أدخل عرض الشارع', href: './home.html#land' }];
    }
  }
  if (/نسبه (?:ال)?بناء/.test(t)) { const g = res.items.find(i => i.id === 'coverage_ground'), f = res.items.find(i => i.id === 'coverage_first'); if (g) segs.push(`${g.text}${f && f.verdict !== 'na' ? ' ' + f.text : ''}`); }
  const wantIds = new Set(); for (const [re, ids] of MUNI_TOPICS) if (re.test(t)) ids.forEach(i => wantIds.add(i));
  const items = res.items.filter(i => wantIds.has(i.id) && i.verdict !== 'na');
  if (items.length) segs.push(items.map(i => `${i.title} (${VERDICT_AR[i.verdict] || i.verdict}): ${i.text}`).join(' '));
  if (segs.length) return { kind: 'answer', text: `${segs.join(' ')} ${DISCLAIMER}`, actions: [...act, ...extraActs] };
  const bad = res.items.filter(i => i.verdict === 'fail'), rev = res.items.filter(i => i.verdict === 'review');
  return { kind: 'answer', text: `مطابقة أولية لهذا التصميم على الاشتراطات العامة للوزارة: ${summaryText(res.summary)}.`
    + (bad.length ? ' المخالف: ' + bad.map(i => `${i.title} — ${i.text}`).join(' ') : ' لا بند مخالف في ما قِسته.')
    + (rev.length ? ` يُراجع مع المكتب الهندسي: ${rev.map(i => i.title).join('، ')}.` : '') + ' ' + DISCLAIMER, actions: act };
}
/** شرح درجة التصميم ومؤشراتها من plan-score (الدرجة المخزنة في الجلسة أو تُحسب عند الطلب). تقدير آلي بأوزان الموقع لا حكم هندسي. */
const PART_WORDS = { req: /مطابقه (?:ما )?(?:طلب|رغب)/, eff: /كفاءه|المساحات (?:ال)?مهدره|(?:ال)?صالات (?:و)?(?:ال)?ممرات/, sun: /توجيه|شمس/, privacy: /خصوصيه/, light: /انار|تهويه|اضاءه/, kitchen: /قرب (?:ال)?مطبخ|مطبخ (?:من )?(?:ال)?طعام/, pipes: /تمديد|سباكه/ };
const partOf = t => Object.entries(PART_WORDS).find(([, re]) => re.test(t))?.[0] || null;
const WEAK_Q = /(?:اضعف|اسوا|اقل|انزل)\s*(?:ال)?(?:مؤشر|نقطه|نقاط|درجه|شي|ايش)|(?:ارفع|اطور|احسن|زياده|رفع|تحسين|ازيد)\s*(?:ال)?(?:درجه|تقييم)|وين (?:ال)?(?:ضعف|عيب)/;
const SCORE_Q = /(?:كم|وش|ايش|ليش|ليه|لماذا|كيف|شرح|اشرح|وضح) .*(?:درجه|تقييم|نقاط|مؤشر)|(?:درجه|تقييم|نقاط|مؤشرات) (?:ال)?(?:تصميم|بيت|مخطط)|^(?:ال)?درجه|(?:اضعف|اسوا|اقل|ارفع|اطور|احسن|زياده|رفع|تحسين) .*(?:مؤشر|درجه|تقييم)|(?:ليش|ليه|لماذا|كيف|وش|ايش|كم) .*(?:كفاءه|خصوصيه|انار|تهويه|تمديد)|(?:ليش|ليه|لماذا) .*(?:ما )?(?:حصل|وصل|طلع|جاب|اخذ) .*(?:100|مئه)/;
export function scoreAnswer(session, text = '') {
  const d = session.designs[session.current], sc = d.score || scoreDesign(session, d), t = normalizeAr(text);
  if (!sc) return { kind: 'answer', text: 'تعذّر حساب درجة هذا التصميم الآن؛ لم أقدّر لك رقمًا.' };
  const note = ' هي تقدير آلي بأوزان وضعها الموقع، وليست حكمًا هندسيًا أو اعتمادًا.', act = [{ label: 'اطلب تصميمًا آخر', say: 'ابي تصميم مختلف' }];
  const one = partOf(t), P = one && sc.parts.find(p => p.id === one);
  if (P) return { kind: 'answer', text: `${P.label}: ${P.score} من 100 (وزنه ${P.weight}٪ من درجة التصميم ${sc.total}). ${P.score >= 100 ? P.good : P.bad || P.good}.${P.score < 100 && P.good ? ' الإيجابي فيه: ' + P.good + '.' : ''}${note}`, actions: act };
  if (WEAK_Q.test(t)) {
    const low = sc.parts.filter(p => p.score < 100).sort((a, b) => a.score - b.score).slice(0, 2);
    if (!low.length) return { kind: 'answer', text: `كل مؤشرات هذا التصميم كاملة (الدرجة ${sc.total} من 100).${note}`, actions: act };
    return { kind: 'answer', text: `أضعف مؤشرات هذا التصميم (الدرجة ${sc.total} من 100): ${low.map(p => `${p.label} ${p.score} من 100 (وزنه ${p.weight}٪) — ${p.bad || p.good}`).join('؛ ')}. أكبر مكسب ممكن في المؤشر الأقل مع وزنه؛ لا أعد برقم بعد التعديل قبل أن يُقاس.${note}`, actions: act };
  }
  const parts = sc.parts.map(p => `${p.label}: ${p.score} من 100 (وزنه ${p.weight}٪)`).join('؛ ');
  return { kind: 'answer', text: `درجة هذا التصميم ${sc.total} من 100 (${sc.grade}). تتكوّن من مؤشرات يقيسها الموقع من المخطط نفسه: ${parts}. ${sc.why.join(' ')}`
    + (sc.missing?.length ? ' مؤشرات لم تُقَس لهذا التصميم: ' + sc.missing.map(id => SCORE_LABELS_AR[id] || id).join('، ') + '.' : '') + note, actions: act };
}
const SCORE_LABELS_AR = { req: 'مطابقة ما طلبته', eff: 'كفاءة المساحة', sun: 'التوجيه والشمس', privacy: 'خصوصية المجلس', light: 'الإنارة والتهوية', kitchen: 'قرب المطبخ من الطعام والخدمة', pipes: 'اقتصاد التمديدات' };
/** مساحة الأرض من الأبعاد التي أدخلها العميل (لا قياس من الخريطة). */
function landAnswer(session) {
  const L = session.input?.land || {}, w = Number(L.width), l = Number(L.length);
  if (!(w > 0 && l > 0)) return { kind: 'answer', text: 'لا أبعاد للأرض في الجلسة؛ أدخلها في خطوة الأرض لأحسب لك.', actions: [go('land')] };
  return { kind: 'answer', text: `أرضك ${r1(w)} × ${r1(l)} م = ${r1(w * l)} م²، من الأبعاد التي أدخلتها (الموقع لا يقيسها من الخريطة). ${L.streets?.length ? 'الشوارع المسجلة: ' + L.streets.map(x => PLOT_SIDE_AR[x] || x).join('، ') + '.' : ''}`.trim(), actions: [go('land')] };
}
/** أسئلة الشمس والتوجيه: من sun-analysis على المخطط المعروض وموقع الأرض (الخريطة، وإلا المدينة، وإلا الرياض افتراضيًا ويُقال). */
const SUN_Q = /شمس|توجيه|مشمس|ظل |الظل|حراره|حار |كاسرات/;
export function sunAnswer(session) {
  const site = solarSite(session.input?.land?.geo || null), a = analyzeSun(currentDoc(session), site);
  return { kind: 'answer', text: `درجة توجيه هذا التصميم ${a.score} من 100 (محسوبة لـ${site.label}). ${a.lines.join(' ')}`
    + (a.ups.length ? ' ما رفعها: ' + a.ups.slice(0, 2).join('؛ ') + '.' : '') + (a.downs.length ? ' ما خفضها: ' + a.downs.slice(0, 2).join('؛ ') + '.' : '') + ' التفصيل وحركة الظل في بطاقة «الشمس والتوجيه». ' + a.limits, actions: [{ label: 'بطاقة الشمس والتوجيه', href: './design.html#sunCard' }] };
}

/** جواب سؤال من المخطط نفسه. يعيد null إن لم يُعرف السؤال. */
export function answerQuestion(session, text, { page = 'design' } = {}) {
  const t = normalizeAr(text), doc = currentDoc(session), sum = summarizeDoc(doc), { specs, rooms } = sum;
  let asked = roomsAsked(t, rooms); const entry = session.input?.land?.entries?.[0] || 's', lvl = levelAsked(t, rooms);
  if (asked && lvl) asked = asked.filter(r => r.level === lvl);
  if (MUNI_Q.test(t) && !(asked?.length && /مساح|مقاس|ابعاد/.test(t))) { try { return municipalAnswer(session, text); } catch { /* يُكمل إلى بقية الأجوبة */ } }
  for (const [re, msg] of UNSUPPORTED) if (re.test(t)) return { kind: 'answer', text: msg };
  if (NOTES_Q.test(t) && !FIX_Q.test(t)) return notesAnswer(session);
  if (COMPARE_Q.test(t) && session.designs.length > 1) { try { return compareAnswer(session, t); } catch { /* يُكمل */ } }
  if (SUN_Q.test(t) && !asked?.length) { try { return sunAnswer(session); } catch { /* يُكمل */ } }
  if (SCORE_Q.test(t) && !asked?.length) { try { return scoreAnswer(session, text); } catch { /* يُكمل */ } }
  if (EXT_Q.test(t) && !asked?.length) return exteriorAnswer(session);
  const regQ = /يسمح|مسموح|نظام|اشتراط|عندنا|يجوز|الحي/.test(t);
  if (lvl === '' && !regQ) return { kind: 'answer', text: `لا يوجد هذا الدور في تصميمك؛ الأدوار فيه: ${[...new Set(rooms.map(r => r.level))].join('، ')}.` };
  if (lvl && !asked && !regQ) {
    const rs = rooms.filter(r => r.level === lvl);
    if (/مساح|كم متر|كم الدور|حجم|كم صافي/.test(t)) return { kind: 'answer', text: `صافي مساحة ${lvl} ${r1(sumArea(rs))} م²، وهي مجموع مساحات ${rs.length} فراغًا في جدول المساحات. مسطح البناء الكلي للبيت ${r1(specs.built)} م² (يشمل سماكة الجدران)؛ لا أقسمه على الأدوار من عندي.`, actions: [go('sheets')] };
    if (/غرف|فراغات|وش|ايش|فيه|يحتوي|يتكون|اسماء|قائمه/.test(t)) return { kind: 'answer', text: `${lvl}: ${rs.map(r => `${r.name} ${r1(r.area)} م²`).join('، ')}.` };
  }
  if (/ارضي/.test(t) && /(?:دور|طابق) (?:ال)?(?:اول|ثاني)/.test(t) && /اكبر|اصغر|اوسع|اضيق|قارن|ولا| او |فرق|ليش|ليه|لماذا/.test(t)) {
    const L = levelTotals(rooms), a = L.find(x => /ارضي/.test(normalizeAr(x.level))), b = L.find(x => /اول|ثاني/.test(normalizeAr(x.level)));
    if (a && b) return { kind: 'answer', text: `صافي ${a.level} ${r1(a.net)} م² (${a.count} فراغًا) و${b.level} ${r1(b.net)} م² (${b.count} فراغًا)، والفرق ${r1(Math.abs(a.net - b.net))} م². سبب هذا الفرق معماريًا ليس مسجلًا عندي (غير متحقق)؛ ما سجّله المولّد عن التصميم: ${session.designs[session.current].summary || 'لا وصف'}.`, actions: [go('sheets')] };
  }
  if (asked?.length && /اسماء|اسامي|قائمه|عددي|عدديلي|وش هي|ايش هي/.test(t)) return { kind: 'answer', text: asked.map(r => `${r.name} ${r1(r.area)} م² (${r.level})`).join('، ') + '.' };
  if (/صافي (?:ال)?مساح|مجموع (?:ال)?مساحات|مساحه (?:ال)?فراغات|كم صافي|صافي (?:ال)?فراغات/.test(t) && !asked?.length) return { kind: 'answer', text: `صافي مساحة الفراغات ${r1(specs.net)} م²: ${levelTotals(rooms).map(l => `${l.level} ${r1(l.net)} م² (${l.count} فراغًا)`).join('، ')}. مسطح البناء الكلي ${r1(specs.built)} م² يشمل الجدران.`, actions: [go('sheets')] };
  if (/(?:اكبر|اصغر|اوسع|اضيق)/.test(t) && (asked?.length || /غرفه|فراغ|مساحه/.test(t))) {
    const big = /اكبر|اوسع/.test(t), pool = asked?.length ? asked : rooms.filter(r => !['corridor', 'courtyard', 'storage'].includes(r.type)), pick = [...pool].sort((a, b) => big ? b.area - a.area : a.area - b.area)[0];
    if (pick && asked?.length > 1) return { kind: 'answer', text: `${asked.map(roomLine).join('؛ ')}. ${big ? 'الأكبر' : 'الأصغر'} بينها: ${pick.name} (${r1(pick.area)} م²).` };
    if (pick) return { kind: 'answer', text: `${big ? 'أكبر' : 'أصغر'} فراغ في تصميمك: ${roomLine(pick)}.` };
  }
  const od = /وين|اين|فيه|موجود|هل |كم /.test(t) ? outdoorAnswer(t, doc) : null; if (od) return od;
  if (/مساح(?:ه|ت) (?:ال)?ارض|ارضي كم|كم (?:مساحه )?(?:ال)?ارض|ابعاد (?:ال)?ارض/.test(t)) return landAnswer(session);
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
    if (/كم (?:عدد )?(?:ال)?(?:غرف|غرفه|حمام|حمامات|دوره|دورات|مجلس|مجالس)/.test(t) && !/مساح|مقاس|ابعاد|حجم|طول|عرض/.test(t)) return { kind: 'answer', text: `العدد ${asked.length} (${[...new Set(asked.map(r => r.level))].join(' و')}): ${asked.map(r => r.name).join('، ')}.` };
    return { kind: 'answer', text: asked.map(roomLine).join('؛ ') + '. المقاسات صافية من وجه الجدار إلى وجه الجدار.' };
  }
  // المساحة الكلية
  if (/مساح(?:ه|ت) (?:ال)?(?:بيت|بناء|مبني|فيلا|منزل|كليه|اجماليه|مسطح)|مسطح(?:ات)? (?:ال)?بناء|كم (?:متر|مسطح)|المساح(?:ه|ات)$/.test(t)) {
    return { kind: 'answer', text: `مسطح البناء ${r1(specs.built)} م² على ${floorsAr(specs.floors)} (غلاف الأرضي ${specs.width} × ${specs.depth} م)، وصافي الفراغات ${r1(specs.net)} م² (${levelTotals(rooms).map(l => `${l.level} ${r1(l.net)}`).join('، ')}). التفصيل في جدول المساحات.`, actions: [go('sheets')] };
  }
  // الأعداد
  if (/كم (?:عدد )?(?:ال)?(?:غرف|غرفه|حمام|حمامات|دور|ادوار|طابق|مجلس|مجالس|مدخل|مداخل)/.test(t)) {
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
  // التكلفة والكميات: سؤال السعر يتقدّم على سؤال المواد؛ لا أرقام أسعار من عندي أبدًا
  const given = /متر/.test(t) ? t.match(/(\d[\d,٬]*(?:\.\d+)?)\s*(?:ريال|ر\.?\s?س|sar)/i) : null;
  if (given && /تكلف|كلف|ميزاني|اجمالي|كم/.test(t) && specs.built > 0) { const price = Number(given[1].replace(/[,٬]/g, '')); if (price > 0) return { kind: 'answer', text: `بالسعر الذي ذكرتَه (${price.toLocaleString('en-US')} ريال للمتر) يكون الناتج الحسابي ${r1(specs.built)} م² × ${price.toLocaleString('en-US')} = ${Math.round(specs.built * price).toLocaleString('en-US')} ريال. هذا مجرد ضرب مسطح البناء الكلي في سعرك، وليس تسعيرًا لمشروعك؛ لا أعرف أسعار السوق (غير متحقق)، والتكلفة الأدق في جدول الكميات بأسعارك للبنود.`, actions: [go('boq')] }; }
  if (/تكلف|سعر|اسعار|بكم|ميزاني|كلف|يكلف|ارخص|غالي|كميات|حديد|خرسان|بلوك|مواد|ماده|تشطيب|تسليح|اسمنت/.test(t)) return { kind: 'answer', text: !/تكلف|سعر|اسعار|بكم|ميزاني|كلف|ارخص|غالي/.test(t)
      ? 'الكميات تُحسب من تصميمك نفسه: أرضيات الغرف، تشطيب الجدران الداخلية، بلوك الجدران، الأبواب والنوافذ، وخرسانة الأعمدة والجسور والبلاطات (والتسليح في جدول الكميات إن حُسب الإنشائي). أنواع المواد ودرجاتها تُحدَّد مع مكتبك الهندسي؛ لا أفترض لك نوعًا أو سعرًا. التفصيل في جدول الكميات.'
      : 'لا أقدّر لك سعرًا: السعر غير متحقق عندي لأن التكلفة = الكمية × سعر الوحدة بأسعارك أنت، تدخلها في جدول الكميات (لا أفترض أسعارًا). الكميات نفسها محسوبة من تصميمك، وتجدها هناك.', actions: [go('boq')] };
  // الخطوة التالية
  if (/الخطوه|بعدين|التالي|وش اسوي|كيف اكمل|كيف اعتمد|وش بعد/.test(t)) {
    const next = { design: 'إن أعجبك التصميم اضغط «أعجبني» لأسألك عن الشكل الخارجي ثم يُفتح العرض ثلاثي الأبعاد؛ وإن لم يعجبك قل لي ما تريد تغييره.', view3d: 'بعد مشاهدة البيت من الخارج والداخل انتقل إلى المخططات ثم جدول الكميات.', final: 'هذه آخر المراحل: المخططات ثم جدول الكميات وكتاب المشروع. يمكنك الرجوع وتعديل التصميم في أي وقت.' }[page] || '';
    return { kind: 'answer', text: 'المسار: الأرض ← شرعاء ← التصميم ← الشكل الخارجي ← ثلاثي الأبعاد ← المخططات ← جدول الكميات. ' + next, actions: page === 'design' ? [] : [go(page === 'view3d' ? 'sheets' : 'design')] };
  }
  return null;
}

/** ما لا يحمله جدول الفراغات: يُقال «غير متحقق» ولا يُجاب بمساحة بدله. */
const UNSUPPORTED = [
  [/ارتفاع (?:ال)?(?:سقف|غرفه|صاله|مجلس|مطبخ|دور)|سماكه|عرض (?:ال)?(?:جدار|حائط)/, 'هذا غير متحقق عندي: ما أحمله لكل فراغ هو مقاساه الأفقيان ومساحته ودوره وموضعه، لا ارتفاع السقف ولا سماكات الجدران. اسأل مكتبك الهندسي أو راجع القطاعات في المخططات.'],
  [/مسافه|يبعد|كم بعد|بعد (?:ال)?\S+ عن |كم متر بين/, 'قياس المسافة بين فراغين غير متحقق عندي. أعرف موضع كل فراغ (الدور، مقدمة البيت أو خلفه، يمين الداخل أو يساره) ومقاسه، وهل «بعيدًا» أو «بجوار» تحقق في طلباتك؛ اسألني «وين المجلس؟» أو «هل نفّذتِ طلبي؟».'],
];
const NOTES_Q = /ملاحظات|مقترحات|اخطاء|اخطا|عيوب|مشاكل|مشكله/, FIX_Q = /عالج|صلح|اصلح|نفذ|عدل|حل(?:ي|ها)?(?![\u0620-\u064A])/;
function notesAnswer(session) {
  const P = fixProposals(session);
  return { kind: 'answer', text: P.length ? `في هذا التصميم ${P.length} ${P.length === 1 ? 'ملاحظة' : 'ملاحظات'}: ` + P.map((p, i) => `${i + 1}) ${p.text}`).join(' ') + ' قل «عالجي الملاحظات» وأعالجها دون أن أُسقط شيئًا مما طلبته.' : 'لم أجد ملاحظات في الفحص الآلي لهذا التصميم. هذا لا يغني عن مراجعة مهندس.', actions: P.length ? [{ label: 'عالجي الملاحظات', say: 'عالجي الملاحظات' }] : [] };
}
const COMPARE_Q = /(?:قارن|مقارنه|الفرق بين|فرق).*(?:تصميم|الحالي|السابق|الاول|الثاني|البديل)|(?:اي|ايش|وش) (?:ال)?تصميم (?:هو )?(?:ال)?(?:افضل|اعلي|احسن)|(?:اعلي|افضل|احسن) (?:تصميم|درجه)|اي تصميم .*(?:اعلي|افضل|احسن)/;
const EXT_Q = /(?:وش|ايش|ما هو|ما هي|اي|كم) (?:ال)?(?:طراز|واجهه|شكل (?:ال)?خارجي|لون (?:ال)?(?:بيت|واجهه))\s*(?:ال)?(?:حالي|مختار|عندي|حقي|الان|اخترت)?(?:\s|$)|(?:طراز|واجهه) (?:ال)?(?:بيت|تصميم) (?:الحالي|عندي)/;
function designRow(session, i) {
  const d = session.designs[i], sc = d.score || scoreDesign({ ...session, current: i }, d), sum = summarizeDoc(currentDoc({ ...session, current: i }));
  return { n: i + 1, summary: d.summary || '', total: sc?.total ?? null, grade: sc?.grade || '', parts: sc?.parts || [], built: sum.specs.built, bedrooms: sum.specs.bedrooms, baths: sum.specs.baths, floors: sum.specs.floors };
}
/** مقارنة التصاميم المعروضة في الجلسة بدرجاتها ومساحاتها كما قاسها الموقع (لا حكم ذوقي). */
export function compareAnswer(session, t) {
  const n = session.designs.length, cur = session.current;
  if (/اعلي|افضل|احسن/.test(t) && !/الفرق|قارن/.test(t)) {
    const rows = session.designs.map((d, i) => ({ n: i + 1, total: (d.score || scoreDesign({ ...session, current: i }, d))?.total ?? -1 })), top = [...rows].sort((a, b) => b.total - a.total)[0];
    return { kind: 'answer', text: `أعلى درجة بين ${n} تصاميم عُرضت: التصميم رقم ${top.n} بدرجة ${top.total} من 100، والحالي رقم ${cur + 1} بدرجة ${rows[cur].total}. الدرجة تقدير آلي بأوزان الموقع لا حكم هندسي؛ الأنسب لك هو ما يوافق ذوقك وطلباتك.`, actions: [] };
  }
  const other = /(?:ال)?(?:اول|اولي)/.test(t) && cur !== 0 ? 0 : cur > 0 ? cur - 1 : 1, A = designRow(session, other), B = designRow(session, cur);
  const line = r => `التصميم رقم ${r.n}${r.n === cur + 1 ? ' (الحالي)' : ''}: ${r.summary || 'بلا وصف'}؛ درجته ${r.total} من 100، مسطح البناء ${r1(r.built)} م²، ${r.bedrooms} غرف نوم و${r.baths} دورات مياه.`;
  const diffs = B.parts.map(p => ({ p, q: A.parts.find(x => x.id === p.id) })).filter(x => x.q && x.q.score !== x.p.score).sort((a, b) => Math.abs(b.p.score - b.q.score) - Math.abs(a.p.score - a.q.score)).slice(0, 3);
  return { kind: 'answer', text: `${line(A)} ${line(B)}${diffs.length ? ' أكبر فروق المؤشرات (الحالي مقابل ' + A.n + '): ' + diffs.map(x => `${x.p.label} ${x.p.score} مقابل ${x.q.score}`).join('؛ ') + '.' : ''} الدرجة تقدير آلي لا حكم هندسي.`, actions: [] };
}
/** الشكل الخارجي المحفوظ في الجلسة؛ إن لم يُسأل العميل بعد قيل ذلك ولم يُخمَّن طراز. */
export function exteriorAnswer(session) {
  const ext = readExterior(session);
  if (!ext || isAutoExterior(ext)) return { kind: 'answer', text: 'لم تحدّد شكلًا خارجيًا بعد، فالمعالجة المعمارية تلقائية حتى تختارها؛ أي معالجة ستظهر غير متحقق قبل ذلك. قل مثلًا «الواجهة نجدية» أو «مودرن» وأعدّله لك.', actions: [go('exterior')] };
  return { kind: 'answer', text: `الشكل الخارجي المختار في جلستك: ${describeExterior(ext).join('، ')}. يظهر في العرض ثلاثي الأبعاد.`, actions: [go('view3d')] };
}

/**
 * طلب غامض بلا هدف يمكن تنفيذه («البيت ضيق»، «ما عجبني»، «غيّر لي»، «كبّر»): سؤال توضيحي واحد بأزرار، ولا يتغير شيء.
 * يعيد null إن كان الطلب محددًا (فراغ مسمّى أو متطلب مفهوم).
 */
const VAGUE = [
  [/(?:^| )(?:ما|مو|مب|ماني) (?:عجب|اعجب|عاجب|حبيت|حبي|يعجب|حلو|مرتاح)|ما اعجبني|مو عاجبني|ما عجبني/, 'ما الذي لم يعجبك فيه: توزيع الغرف، المساحات، الشكل الخارجي، أم تريد تصميمًا مختلفًا كليًا؟', [['توزيع الغرف', 'ابي توزيع مختلف للغرف'], ['المساحات', 'المساحات صغيرة'], ['الشكل الخارجي', 'خلي الواجهة غير'], ['تصميم مختلف', 'ابي تصميم مختلف']]],
  [/(?:البيت|الغرف|المكان|التصميم|الفيلا|المنزل)\s+(?:ضيق|صغير|زحمه|مزدحم|ما يكفي|مو كافي|ما يسع)|(?:ضيق|صغير|زحمه)(?: علي| شوي| مره)?$/, 'أي فراغ تحديدًا تريده أوسع؟ سمِّه لأكبّره دون أن أُسقط بقية طلباتك.', 'rooms'],
  [/^(?:ابي|ابغي|ابغا|اريد|ودي)?\s*(?:شي|شيء|حاجه)\s*(?:حلو|احلي|افضل|مميز|جديد|مختلف|غير)$/, 'تريد شيئًا أجمل في أي جانب: توزيع الغرف، الشكل الخارجي، أم الحوش والحديقة؟', [['توزيع الغرف', 'ابي توزيع مختلف للغرف'], ['الشكل الخارجي', 'خلي الواجهة غير'], ['الحوش والحديقة', 'ابي حديقة']]],
  [/^(?:غير|غيري|بدل|بدلي|عدل|عدلي)(?:\s+(?:لي|لي شي|شي|شيء|حاجه|اي شي|شوي))?$/, 'ماذا تريد أن أغيّر: فراغًا معينًا (مثل المجلس أو المطبخ) أم التوزيع كله؟', 'rooms'],
  [/^(?:كبر|كبري|وسع|وسعي|صغر|صغري|ضيق|ضيقي|قرب|ابعد|انقل|انقلي)(?:\s+(?:لي|شي|شوي|شويه))?$/, 'أي فراغ تقصد؟ سمِّه (مثل المجلس أو المطبخ) وأطبّق عليه الطلب.', 'rooms'],
];
export function vagueClarify(session, text) {
  const t = normalizeAr(text || '').replace(/[؟?!.،,]+$/g, '').trim(), rooms = session ? summarizeDoc(currentDoc(session)).rooms : [];
  if (!t || roomsAsked(t, rooms)?.length) return null;
  const verb = /^(?:كبر|كبري|وسع|وسعي)/.test(t) ? ' أكبر' : /^(?:صغر|صغري|ضيق|ضيقي)/.test(t) ? ' أصغر' : /^(?:ضيق|صغير)|(?:ضيق|صغير|زحمه|مزدحم)/.test(t) ? ' أكبر' : '';
  for (const [re, q, opts] of VAGUE) if (re.test(t)) {
    let actions;
    if (opts === 'rooms') { const names = ['المجلس', 'الصالة', 'المطبخ', 'غرفة النوم الرئيسية'].filter(n => rooms.some(r => r.name === n)).slice(0, 3); actions = (names.length ? names : [...new Set(rooms.map(r => r.name))].slice(0, 3)).map(n => ({ label: verb ? `${n}${verb}` : n, say: `${n}${verb || ' أكبر'}` })); }
    else actions = opts.map(([label, say]) => ({ label, say }));
    return { kind: 'clarify', text: q, actions };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ الأسئلة المركّبة
const PRON = /^(.*?)(?:ه|ها|هم|هن)$/;
/**
 * خطة الرد على رسالة مركّبة: كل جزء سؤال يُجاب من التصميم أو طلب تعديل (يُنفَّذ بعد الأجوبة). complete=false إن عجز المحرك المحلي عن جزء (فيُحال كله إلى عقل شرعاء ليجيب جزءًا جزءًا).
 * الضمير («مساحته»، «كبّريه») يرجع إلى آخر فراغ سُمّي في جزء سابق.
 */
export function planParts(session, text, { page = 'design' } = {}) {
  const raw = splitParts(text); if (!raw || !session) return null;
  const rooms = summarizeDoc(currentDoc(session)).rooms; let last = null; const parts = [];
  for (const p of raw) {
    let q = p; const t = normalizeAr(p), named = roomsAsked(t, rooms);
    if (!named?.length && last) {
      if (/مساح|مقاس|ابعاد|حجم/.test(t) && PRON.test(t.split(' ').pop())) q = `كم مساحة ${last}`;
      else if (/^(?:وين|فين|اين)/.test(t) && PRON.test(t.split(' ').pop())) q = `وين ${last}`;
      else if (/^(?:كبر|وسع)/.test(t)) q = `${last} أكبر`;
      else if (/^(?:صغر|ضيق)/.test(t)) q = `${last} أصغر`;
    }
    if (named?.length) last = named[0].name;
    let kind = classify(q);
    // متابعة على جواب الجزء السابق («وكيف حسبتِها؟») تُجاب بالجواب نفسه ولا تُكرَّر
    if (parts.length && parts[parts.length - 1].type === 'ask' && parts[parts.length - 1].answer && /^(?:كيف|ليش|ليه|لماذا)\s+(?:حسبت|طلعت|جبت|اخذت)/.test(t)) { parts.push({ text: q, type: 'ask', answer: parts[parts.length - 1].answer, dup: true }); continue; }
    if (kind === 'unclear') { let a = null; try { a = answerQuestion(session, q, { page }); } catch { a = null; } if (a) kind = 'ask'; }
    if (kind === 'ask') { let a = null; try { a = OPEN_Q.test(t) ? null : answerQuestion(session, q, { page }); } catch { a = null; } parts.push({ text: q, type: 'ask', answer: a }); }
    else if (kind === 'change') parts.push({ text: kind === 'change' && q === p ? p : q, type: 'change', answer: null });
    else parts.push({ text: q, type: 'other', answer: null });
  }
  const asks = parts.filter(x => x.type === 'ask' && !x.dup), changes = parts.filter(x => x.type === 'change'), others = parts.filter(x => x.type === 'other');
  if (!asks.length) return null; // كله طلب أو غامض: المسار العادي
  const complete = !others.length && asks.every(x => x.answer) && changes.length <= 1 && (!changes.length || parts[parts.length - 1].type === 'change');
  return { parts, asks, changes, complete };
}
const stripDisclaimer = tx => tx.split(DISCLAIMER).join('').replace(/\s{2,}/g, ' ').trim();
function composeAnswers(asks) {
  const seen = new Set(), actions = []; let anyDisc = false;
  const lines = asks.map((x, i) => { const tx = x.answer.text, d = tx.includes(DISCLAIMER); anyDisc ||= d; for (const a of x.answer.actions || []) { const k = a.href || a.say || a.label; if (!seen.has(k)) { seen.add(k); actions.push(a); } } return `${asks.length > 1 ? ['أولًا', 'ثانيًا', 'ثالثًا', 'رابعًا', 'خامسًا'][i] || (i + 1) + ')' : ''}${asks.length > 1 ? ': ' : ''}${stripDisclaimer(tx)}`; });
  return { text: lines.join(' ') + (anyDisc ? ' ' + DISCLAIMER : ''), actions };
}

/**
 * عند عدم الفهم: سؤال توضيحي واحد بدل قائمة عامة. إن ذُكر فراغ من التصميم سألتُ ماذا يريد فيه (مساحته، موضعه، أم أين هو)؛ وإلا سألتُ عن نوع الطلب.
 * الأزرار تُرسل صيغة مفهومة للمحرك، ولا يتغير شيء قبل نقر العميل.
 */
export function clarify(session, text, lead = '') {
  const t = normalizeAr(text || ''), rooms = session ? summarizeDoc(currentDoc(session)).rooms : [], asked = session ? roomsAsked(t, rooms) : null;
  if (asked?.length) { const n = asked[0].name; return { kind: 'unclear', text: `${lead} تقصد ${n} تحديدًا: تريد أن أغيّر مساحته أو موضعه، أم تسأل عن مقاسه ومكانه؟`.trim(), actions: [{ label: `${n} أكبر`, say: `${n} أكبر` }, { label: `كم مساحة ${n}؟`, say: `كم مساحة ${n}؟` }, { label: `وين ${n}؟`, say: `وين ${n}؟` }] }; }
  return { kind: 'unclear', text: `${lead} هل تسأل عن تصميمك، أم عن الاشتراطات البلدية، أم تريد تعديلًا عليه؟`.trim(), actions: [{ label: 'مطابقة الاشتراطات', say: 'هل التصميم يطابق الاشتراطات؟' }, { label: 'كم مساحة البيت؟', say: 'كم مساحة البيت؟' }, { label: 'ابي تصميم مختلف', say: 'ابي تصميم مختلف' }] };
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
export async function sharaTurn(session, text, { page = 'design', redesign = redesignSession, ai = null, exterior = null, fix = applyFix } = {}) {
  const kind = classify(text), t = normalizeAr(text || '');
  if (/^(?:شكرا|شكرًا|مشكور|مشكوره|يعطيك العافيه|الله يعطيك العافيه|تسلم|تسلمين|جزاك الله خير|ممتاز|تمام|زين|اوكي|ok|تم)(?:\s+\S+){0,2}$/i.test(t) && t.length < 30) return { kind: 'answer', text: 'العفو، حياك الله. إن عندك سؤال أو تعديل على بيتك فأنا حاضرة.', actions: [] };
  const g = guardKind(text); if (g) return { kind: 'answer', guarded: g, text: guardReply(g), actions: [] };
  // رسالة مركّبة: كل جزء يُجاب (أو يُنفَّذ) على حدة ويُجمع الرد؛ ما عجز المحرك عن أحد أجزائه فلا يُجاب نصفه هنا (التوجيه يحيله كله إلى عقل شرعاء)
  const plan = session ? planParts(session, text, { page }) : null;
  if (plan?.complete) {
    const body = composeAnswers(plan.asks);
    if (!plan.changes.length) return { kind: 'answer', text: body.text, actions: body.actions };
    const done = await sharaTurn(session, plan.changes[0].text, { page, redesign, ai, exterior, fix });
    return { ...done, text: `${body.text} ${done.kind === 'changed' ? 'ثم نفّذت طلبك: ' : ''}${done.text}`.trim(), actions: [...body.actions, ...(done.actions || [])] };
  }
  if (plan && !plan.complete && plan.asks.some(a => a.answer) && session) {
    // أجبتُ ما أستطيعه من تصميمك فقط، وأقول صراحة ما لم أجده (لا نصف جواب صامت)
    const body = composeAnswers(plan.asks.filter(a => a.answer)), miss = plan.parts.filter(x => !(x.type === 'ask' && x.answer));
    return { kind: 'answer', text: `${body.text} أما ${miss.map(x => `«${x.text}»`).join('، ')} فلا أجد جوابه في تصميمك ولا أخمّنه (غير متحقق)${plan.changes.length ? '؛ ولم أنفّذ طلب التعديل في هذه الرسالة، أرسله وحده' : ''}.`, actions: body.actions };
  }
  // الملاحظات ومقترحات الإصلاح: السؤال عنها يعدّدها، وطلب علاجها ينفّذها كلها (دون إسقاط رغبة للعميل)
  if (session && /ملاحظات|مقترحات|اخطاء|اخطا|عيوب|مشاكل|مشكله/.test(t)) {
    const P = fixProposals(session);
    if (/عالج|صلح|اصلح|نفذ|عدل|حل(?:ي|ها)?(?![${'\u0620-\u064A'}])/.test(t)) {
      if (!P.length) return { kind: 'answer', text: 'لا توجد ملاحظات تحتاج علاجًا في هذا التصميم.' };
      const out = await fix(session, 'all'), r = out.reply, parts = [r.relayout ? 'غيّرت توزيع الغرف لأعالج الملاحظات، وأبقيت كل ما طلبته محققًا.' : out.changed ? 'عالجت الملاحظات على توزيعك نفسه.' : 'لم أجد علاجًا يحافظ على طلباتك، فأبقيت التصميم كما هو.'];
      if (r.fixed.length) parts.push('عولج: ' + r.fixed.join('؛ ') + '.');
      if (r.failed.length) parts.push('تعذّر: ' + r.failed.map(f => `«${f.text}» — ${f.why}`).join(' '));
      const away = page !== 'design' && out.changed;
      return { kind: out.changed ? 'changed' : 'answer', changed: out.changed, session: out.changed ? out.session : undefined, text: parts.join(' '), actions: away ? [{ label: 'عرض التصميم المعدّل', href: './design.html' }] : [] };
    }
    return { kind: 'answer', text: P.length ? `في هذا التصميم ${P.length} ${P.length === 1 ? 'ملاحظة' : 'ملاحظات'}: ` + P.map((p, i) => `${i + 1}) ${p.text}`).join(' ') + ' قل «عالجي الملاحظات» وأعالجها دون أن أُسقط شيئًا مما طلبته.' : 'لم أجد ملاحظات في الفحص الآلي لهذا التصميم. هذا لا يغني عن مراجعة مهندس.', actions: P.length ? [{ label: 'عالجي الملاحظات', say: 'عالجي الملاحظات' }] : [] };
  }
  // «ابي صورة واقعية/احترافية للبيت»: ليست تعديلًا على التصميم؛ توجَّه إلى زر «صورة معمارية احترافية» في العرض ثلاثي الأبعاد
  if (/(?:صوره|صور|رندر|تصيير)\s(?:.*\s)?(?:واقعي|حقيقي|احترافي|فوتوغرافي)/.test(t)) return { kind: 'answer', text: 'أقدر أوريك بيتك بصورة واقعية: في العرض ثلاثي الأبعاد اضغط زر «صورة معمارية احترافية» تحت أزرار اللقطة، فتتحول لقطة مجسم تصميمك نفسه إلى صورة بمستوى التصوير المعماري مع مقارنة قبل وبعد. هي صورة محسّنة بالذكاء الاصطناعي للتصوّر لا للتنفيذ، والزر يظهر عندما تكون الخدمة مفعّلة.', actions: page === 'view3d' ? [] : [go('view3d')] };
  if (kind === 'help') return { kind, text: HELP };
  if (kind === 'nav') return navAnswer(t);
  if (!session) return { kind: 'unclear', text: 'لا يوجد تصميم مفتوح بعد. ابدأ من الأرض ثم حدّثني عن بيتك.', actions: [go('land')] };
  const vg = !plan && (kind === 'change' || kind === 'unclear') ? vagueClarify(session, text) : null; if (vg) return vg;
  if (kind === 'ask') {
    const a = answerQuestion(session, text, { page });
    if (a) return a;
    return clarify(session, text, 'لم أجد جواب سؤالك في التصميم.');
  }
  if (kind === 'unclear') {
    const a = answerQuestion(session, text, { page }); if (a) return a;
    return { ...clarify(session, text, 'لم أفهم طلبك بدقة فلم أغيّر شيئًا.'), kind };
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

/**
 * أين يُجاب هذا الكلام: 'local' (أمر أو سؤال محدد يفهمه المحرك المحلي: سريع ومجاني) أو 'remote' (سؤال مفتوح أو عن الخارج ← /api/shara).
 * الأمر المحلي الذي لم يُفهم (unclear) يُحوَّل إلى remote من اللوحة بعد تجربته محليًا.
 */
const OPEN_Q = /(?:^|\s)(?:حي|شارع|مدين(?:ه|ات)|منطق(?:ه|ات)|شرك(?:ه|ات)|مطور(?:ين)?|مشاريع|مشروع|مقاول(?:ين|ات)?|مورد(?:ين)?|اقرب|قريب(?:ه)?|الان|اليوم|جديد(?:ه)?|احدث|مستجد(?:ات)?|تحديث(?:ات)?|اخر (?:تحديث|اصدار|نسخه)|تعميم|رابط|سوق|افضل|يناسب|مناسب(?:ه)?|الفرق بين|رايك|انصح(?:ني)?|اوصي|ينفع|يجوز)(?:\s|$)/;
/** هل يجيب المحرك المحلي هذا السؤال النظامي بند ببند (موضوع محدد أو ارتداد/نسبة بناء)؟ */
const municipalKnown = (session, text) => { if (!session) return false; const t = normalizeAr(text); if (/اقدر|ابني|ابنيه|يسمح|يجوز|اضيف|ينفع|داخل (?:ال)?ارتداد|اتجاوز|استثناء|تنازل/.test(t)) return false; return /ارتداد|نسبه (?:ال)?بناء/.test(t) || MUNI_TOPICS.some(([re]) => re.test(t)); };
const wordCount = t => t.split(/\s+/).filter(Boolean).length;
export function routeOf(session, text, { page = 'design' } = {}) {
  const t = normalizeAr(text || ''), kind = classify(text);
  if (guardKind(text)) return 'local'; // الحقن/التسريب/المسح: ردّ ثابت محلي، لا يُرسل للخادم
  if (/^(?:شكرا|شكرًا|مشكور|مشكوره|يعطيك العافيه|الله يعطيك العافيه|تسلم|تسلمين|جزاك الله خير|ممتاز|تمام|زين|اوكي|ok|تم)(?:\s+\S+){0,2}$/i.test(t) && t.length < 30) return 'local';
  if (kind === 'help' || kind === 'nav') return 'local';
  const plan0 = session ? planParts(session, text, { page }) : null;
  if (plan0 && !plan0.complete) return 'remote';
  if (/ملاحظات|مقترحات|اخطاء|اخطا|عيوب|مشاكل|مشكله/.test(t) || /(?:صوره|صور|رندر|تصيير)\s(?:.*\s)?(?:واقعي|حقيقي|احترافي|فوتوغرافي)/.test(t)) return 'local';
  if (!session) return 'local';
  const plan = session ? planParts(session, text, { page }) : null;
  if (plan) return plan.complete ? 'local' : 'remote'; // مركّب: محليًا إن أمكن كل جزء، وإلا يجيب عقل شرعاء جزءًا جزءًا
  if (session && (kind === 'change' || kind === 'unclear') && vagueClarify(session, text)) return 'local';
  if (MUNI_Q.test(t) && wordCount(t) > 6 && !municipalKnown(session, text)) return 'remote'; // سؤال نظامي محدّد: الأداة تعيد البنود بنصها وصفحاتها وتقارنها بتصميمه؛ وإلا يبقى جواب المحرك المحلي العام
  if (kind === 'change') return OPEN_Q.test(t) && wordCount(t) > 8 ? 'remote' : 'local';
  let known = null; try { known = answerQuestion(session, text, { page }); } catch { known = null; }
  if (known && (!OPEN_Q.test(t) || (COMPARE_Q.test(t) && session.designs.length > 1)) && wordCount(t) <= 12) return 'local';
  return 'remote';
}

export default { sharaTurn, classify, answerQuestion, routeOf, clarify, STAGES };
