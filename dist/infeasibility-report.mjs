// (الجولة 21 — المراجعة العمياء r20: إشعار H6 عام مليء بالمصطلحات الداخلية ويقترح تقليل الغرف أو دورًا ثانيًا لبرنامج عادي على أرض 24×28،
// وإشعار H10 متناقض: المتاح للبناء نحو 541 م² والبرنامج يحتاج نحو 265 م² ثم يقترح تقليل الغرف؛ وإشعار H4 يوحي بأن الأرض لا تكفي
// والعجز في المحرك) تقرير التعذّر للعميل: صحيح ومحدد وبلا مصطلحات داخلية، ومتسق مع نفسه:
//  (1) الأرقام الحقيقية: الأرض، والمساحة القابلة للبناء بعد الارتدادات ونسبة البناء، وأدنى مساحة للبرنامج — ومنها الحكم: هل الأرض تكفي؟
//  (2) كل مقاس صريح مقابل أبعاد البناء.
//  (3) ما منع التنظيمات فعلًا مقيسًا (عددًا من المجرّب)، بعبارة العميل.
//  (4) البنود التي إن خُففت وجد المحرك حلًا — مقيسة بإعادة البحث دونها (لا تخمين)، أو «لم يكفِ تخفيف أي بند وحده».
//  (5) خيارات محددة. لا يُقال «الأرض صغيرة» ولا يُقترح تقليل الغرف أو دور ثانٍ ما دامت المساحة تكفي: يُقال «لم يجد المحرك حلًا ضمن …».
// وحدة نقية بلا أرقام حالات ولا أسمائها.
import { toClientAr } from './client-language.mjs';

const r1 = v => Math.round(v * 10) / 10;
const cnt = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`);

/** أسباب فشل البحث في الأبعاد (رموز التقييم) بعبارة العميل، وما يمكنه تخفيفه. */
export const TREE_WHY_AR = Object.freeze({
  'dims:kitchen': ['مقاس المطبخ الذي حددته لا يجتمع مع بقية الفراغات في صف واحد', 'قبول مقاس المطبخ تقريبيًا (±30 سم)'],
  'dims:majlis': ['مقاس المجلس الذي حددته لا يجتمع مع بقية الفراغات في صف واحد', 'قبول مقاس المجلس تقريبيًا (±30 سم)'],
  'dims:bedroom': ['مقاس غرف النوم الذي حددته', 'قبول مقاس غرف النوم تقريبيًا'],
  'dims:master': ['مقاس غرفة النوم الرئيسية الذي حددته', 'قبول مقاس الرئيسية تقريبيًا'],
  'dims:dining': ['مقاس الطعام الذي حددته', 'قبول مقاس الطعام تقريبيًا'],
  'dims:hall': ['مقاس الصالة الذي حددته', 'قبول مقاس الصالة تقريبيًا'],
  'small:suite': ['غرف النوم أصغر من الحد المعتاد', null],
  'corr-long': ['ممر غرف النوم أطول من 12.5 م', null],
  'hall-aspect': ['الصالة تصير ممرًا طويلًا', null],
  'slab-span': ['بحر سقف أطول من 6 م دون جدار', null],
  'foyer-big': ['المدخل أكبر من حاجته', null],
  'small:majlis': ['المجلس أصغر من الحد المعتاد', 'قبول مجلس أصغر'],
  'majlis-width': ['المجلس أضيق من 4.2 م للجلسة المتقابلة', null],
  'women-width': ['مجلس النساء أضيق من 4.2 م', 'قبول مجلس نساء أصغر'],
  'kitchen-dining': ['المطبخ لا يلاصق الطعام', null],
  'guest-link': ['المجلس لا يلاصق الطعام (طريق الضيف إلى الطعام)', 'قبول تقديم الضيافة من خارج المجلس'],
  'kitchen-street': ['المطبخ على واجهة الشارع', null],
  'master-smaller': ['غرفة النوم الرئيسية أصغر من غيرها', null],
  'no-fit': ['لا يتسع التنظيم بأدنى مقاساته', null],
});
/** أسباب رفض التصاميم المبنية (نصوص الفحص) مجمّعة بعبارة العميل. */
const BUILT_WHY = [
  [/«مجلس النساء» عرضه الصافي|مجلس النساء[^.]*أصغر من/, 'مجلس النساء أضيق أو أصغر من الحد المعتاد (4.2 م للجلسة المتقابلة)', 'قبول مجلس نساء أصغر'],
  [/«(?:مجلس الرجال|المجلس)» عرضه الصافي|«(?:مجلس الرجال|المجلس)» [\d.]+ م² أصغر من/, 'مجلس الرجال أصغر من الحد المعتاد (24 م² وعرض 4.2 م)', 'قبول مجلس رجال أصغر'],
  [/الرئيسية [\d.]+ م² أصغر من/, 'غرفة النوم الرئيسية أصغر من غرفة نوم أخرى', 'قبول غرف نوم متساوية تقريبًا'],
  [/وصل «maid»|الخادمة[^.]*(?:لا يصل|لم تتسع|بالحركة)/, 'غرفة الخادمة لا يصلها باب من المطبخ أو الحركة', 'غرفة الخادمة بمدخل من الخارج'],
  [/دورة مياه يومية/, 'دورة مياه للعائلة قرب الصالة لم تتسع', null],
  [/دورات المياه المرسومة|دورة مياه إضافية|دورة مياه الرجال لم تتسع/, 'لم تتسع كل دورات المياه المطلوبة', 'دورة مياه أقل'],
  [/الطعام عرضه الصافي|الطعام[^.]*أصغر من/, 'الطعام أضيق من 3.3 م', null],
  [/بلا نافذة/, 'فراغ يحتاج نافذة لم يجد واجهة خارجية', null],
  [/يفتح مباشرة على/, 'باب المجلس يفتح على فراغ عائلي', null],
  [/الحركة الفعلية/, 'الحركة مع الأثاث لا تتسع في بعض الفراغات', null],
  [/الإنشائية|التراكب|بلا جدار أرضي|فوق فراغ/, 'جدران الدور الأول لا تقع فوق جدران الأرضي', 'غرفة نوم في الأرضي أو أعمدة وجسور بتصميم إنشائي مستقل'],
  [/بند من طلبك|تخالف بندًا|لم يتحقق: «/, 'تصاميم لا تحقق بندًا من طلبك', null],
  [/لا يمكن الوصول|لا يصلها|لا يوجد باب/, 'فراغ لا يصله باب', null],
];
const TWO_WHY_AR = { stack: ['جدار في الدور الأول أطول من 5 م لا يقع تحته جدار في الأرضي', 'غرفة نوم في الأرضي (يقل ما يُحمل فوق المجلس والصالة)، أو أعمدة وجسور تحمل جدران الدور الأول بتصميم إنشائي مستقل'], ov: ['غرفة في الدور الأول فوق فراغ غير مبني في الأرضي', null], 'majlis-short': ['المجلس أصغر من 24 م²', 'قبول مجلس أصغر'], 'majlis-w': ['المجلس أضيق من 4.2 م', null], lost: ['غرفة في الدور الأول لا يصلها باب', null], 'master-smaller-real': ['الرئيسية أصغر من غرفة نوم أخرى', null], 'far-stair': ['الرئيسية قريبة من الدرج خلاف طلبك', null] };

/** يجمع أسباب الرفض من خطأ المحرك: [{ ar, n, option }] مرتبة بالأكثر. */
export function failureCauses(e) {
  const out = new Map(), add = (ar, n, option) => { const o = out.get(ar) || { ar, n: 0, option }; o.n += n; out.set(ar, o); };
  const tree = e?.treeStats?.why || {};
  for (const [k, n] of Object.entries(tree)) { const m = TREE_WHY_AR[k]; if (m) add(m[0], n, m[1]); }
  for (const [k, n] of Object.entries(e?.twoFloorWhy || {})) { const m = TWO_WHY_AR[k]; if (m) add(m[0], n, m[1]); }
  const seen = new Map();
  for (const r of e?.rejected || []) { const hit = new Set(); for (const w of r.why || []) for (const [re, ar, opt] of BUILT_WHY) if (re.test(String(w)) && !hit.has(ar)) { hit.add(ar); add(ar, 1, opt); } void seen; }
  return [...out.values()].sort((a, b) => b.n - a.n);
}

/**
 * explainFailure({ error, feasibility, counterfactual:[{ item_ar, ok, how_ar }], twoFloors }) → { title_ar, lines_ar, options_ar, report_ar, cause, numbers }
 * cause: 'area' (الأرض لا تكفي فعلًا) | 'dims' (مقاس أكبر من البناء) | 'engine' (المساحة تكفي ولم يجد المحرك حلًا).
 */
export function explainFailure({ error = null, feasibility = null, counterfactual = [], twoFloors = false, land = null, status = null } = {}) {
  const N = feasibility?.numbers || null, lines = [], options = [];
  const hard = feasibility?.hard || [];
  const avail = N ? Math.min(N.coverageArea, N.buildableArea) : null;
  const areaShort = hard.some(h => h.id === 'AREA'), dimShort = hard.filter(h => /^DIM_/.test(h.id)), widthShort = hard.some(h => h.id === 'WIDTH');
  const conflicts = hard.filter(h => h.id === 'CONFLICT');
  const timeUp = status?.reason === 'TIME_LIMIT', unsupported = status?.reason === 'UNSUPPORTED_CASE';
  const cause = conflicts.length ? 'conflict' : areaShort ? 'area' : dimShort.length || widthShort ? 'dims' : timeUp ? 'time' : unsupported ? 'unsupported' : 'engine';
  if (N) {
    const plot = land && Number(land.width) && Number(land.length) ? `الأرض ${Number(land.width)}×${Number(land.length)} م (${Math.round(land.width * land.length)} م²). ` : '';
    lines.push(`${plot}بعد الارتدادات يبقى للبناء ${N.buildableW}×${N.buildableD} م (${N.buildableArea} م²)، ونسبة البناء المسموحة 75٪ = ${N.coverageArea} م²؛ فالمتاح للبناء ${avail} م²${N.floors === 2 ? ' في كل دور' : ''}.`);
    lines.push(`برنامجك يحتاج نحو ${N.neededGrossPerFloor} م²${N.floors === 2 ? ' في الدور الأكبر' : ''} (صافي فراغاته ${N.programNet} م²، ومعها الجدران والحركة — تقدير الميزان).`);
    const lowB = N.lowerBoundPerFloor ?? null;
    if (cause === 'area') lines.push(`المساحة لا تكفي: حتى بأصغر المقاسات المعتمدة يحتاج البرنامج ${lowB ?? N.neededGrossPerFloor} م² صافيًا والمتاح ${avail} م².`);
    else if (N.neededGrossPerFloor > avail) lines.push(`المساحة ضيقة: بالمقاسات المعتادة يحتاج البرنامج نحو ${N.neededGrossPerFloor} م² والمتاح ${avail} م²، وبأصغر المقاسات المعتمدة نحو ${lowB} م² — فقد يتسع بمقاسات أصغر.`);
    else lines.push(`المساحة تكفي البرنامج (يبقى نحو ${Math.max(0, avail - N.neededGrossPerFloor)} م²)${cause === 'engine' ? '؛ فالعائق ليس صغر الأرض بل ترتيب الفراغات بالشروط المطلوبة معًا' : ''}.`);
  }
  for (const h of hard) if (h.id !== 'AREA') lines.push(h.ar);
  if (cause === 'conflict') {
    lines.unshift('في طلبك بندان لا يجتمعان في أي مخطط، فلم أرسم حتى تختار أحدهما.');
    for (const o of feasibility?.options_ar || []) options.push(o);
  } else if (cause === 'time') {
    lines.unshift('انتهى وقت البحث قبل أن أجد تصميمًا سليمًا. هذا لا يعني أن طلبك مستحيل: لم يُكمل المحرك البحث.');
    options.push('أن تعيد المحاولة (يُكمل البحث من البداية بوقت أطول)');
  } else if (cause === 'unsupported') {
    lines.unshift('هذا النوع من الطلبات لا يدعمه المحرك بعد (ليس حكمًا على طلبك).');
  } else if (cause === 'area') {
    lines.unshift('برنامجك أكبر مما تتسع له هذه الأرض.');
    for (const o of feasibility?.options_ar || []) options.push(o);
  } else if (cause === 'dims') {
    lines.unshift('أحد المقاسات التي حددتها لا يتسع في هذه الأرض.');
    for (const o of feasibility?.options_ar || []) options.push(o);
  } else {
    lines.unshift('لم يجد المحرك مخططًا سليمًا لطلبك على هذه الأرض ضمن التنظيمات التي جرّبها، مع أن المساحة تكفي.');
    const causes = failureCauses(error).slice(0, 4), tried = error?.treeStats?.tried || null;
    if (causes.length) lines.push('أكثر ما منع التنظيمات التي جرّبتها: ' + causes.map(c => `${c.ar} (${cnt(c.n, 'مرة واحدة', 'مرتين', 'مرات', 'مرة')})`).join('؛ ') + (tried ? ` — من ${cnt(tried, 'تنظيم واحد', 'تنظيمين', 'تنظيمات', 'تنظيمًا')} جُرّبت.` : '.'));
    const ok = counterfactual.filter(c => c.ok), no = counterfactual.filter(c => !c.ok);
    for (const c of ok) { lines.push(`جرّبتُ إعادة البحث ${c.how_ar}: فوجدتُ ${cnt(c.found || 1, 'تصميمًا سليمًا', 'تصميمين سليمين', 'تصاميم سليمة', 'تصميمًا سليمًا')}.`); options.push(c.option_ar || `${c.how_ar.replace(/^(?:دون|مع) /, m => m)} `); }
    if (counterfactual.length && !ok.length) lines.push(`جرّبتُ إعادة البحث ${no.map(c => c.how_ar).join('، ثم ')}، ولم يكفِ تخفيف أي بند وحده.`);
    for (const c of causes) if (c.option && !options.includes(c.option)) options.push(c.option);
    if (twoFloors && !options.some(o => /الأرضي/.test(o))) options.push('غرفة نوم في الأرضي (يقل ما يُحمل فوق المجلس والصالة)');
    if (N && N.neededGrossPerFloor > avail) options.push('مساحات أصغر لبعض الغرف أو غرفة أقل (المساحة ضيقة بالمقاسات المعتادة)');
    options.push('أن تطلب مني تصميمًا آخر بعد تخفيف أحد البنود أعلاه، أو أن تبدأ من المرسم بتوزيع تقترحه أنت.');
  }
  const opts = [...new Set(options.map(o => toClientAr(String(o).trim())).filter(Boolean))];
  const title_ar = { conflict: 'بندان متعارضان في طلبك', area: 'برنامجك أكبر من الأرض', dims: 'مقاس لا يتسع في الأرض', time: 'انتهى وقت البحث', unsupported: 'طلب لا يدعمه المحرك بعد' }[cause] || 'لم أجد تصميمًا سليمًا ضمن ما جرّبته';
  const lines_ar = [...lines.map(toClientAr).filter(Boolean), opts.length ? 'ما يمكنك تغييره: ' + opts.map(o => o.replace(/[.،؛\s]+$/, '')).join('؛ ') + '.' : null, 'لم أعرض مخططًا يخالف طلبك أو يفتقد شرطًا أساسيًا.'].filter(Boolean);
  return { title_ar, lines_ar, options_ar: opts, report_ar: lines_ar.join('\n'), cause, numbers: N ? { ...N, available: avail } : null };
}

/**
 * فحص الاتساق الذاتي لتقرير (للاختبار): الأرقام لا يناقض بعضها بعضًا. يعيد قائمة التناقضات (فارغة = متسق).
 * - «المساحة تكفي» مع اقتراح تقليل الغرف أو دور ثانٍ أو أرض أكبر/أعمق = تناقض.
 * - «المساحة لا تكفي» والمطلوب ≤ المتاح = تناقض.
 */
export function reportContradictions(rep) {
  const out = [], t = (rep.lines_ar || []).join('\n'), N = rep.numbers;
  const suff = /المساحة تكفي/.test(t), insuff = /المساحة لا تكفي|أكبر مما تتسع له/.test(t), tight = /المساحة ضيقة/.test(t);
  if (/(?<!يعني أن طلبك )مستحيل|لا يمكن تحقيق/.test(t) && rep.cause !== 'area' && rep.cause !== 'dims' && rep.cause !== 'conflict') out.push('يصف الطلب بالمستحيل بلا دليل');
  if (rep.cause === 'time' && /لا يتسع|أكبر من الأرض/.test(t)) out.push('انتهاء الوقت يُقدَّم كأنه قيد في الأرض');
  if (!tight && !insuff && /غرفة أقل|تقليل عدد الغرف/.test(t)) out.push('يقترح تقليل الغرف والمساحة غير ضيقة');
  if (suff && insuff) out.push('يقول إن المساحة تكفي ولا تكفي معًا');
  if (suff && /تقليل عدد الغرف|دوران بدل|دور ثانٍ|أرض أكبر|أرض أعمق|أرض أعرض/.test(t)) out.push('المساحة تكفي ويقترح تصغير البرنامج أو أرضًا أكبر');
  if (N && insuff && N.neededGrossPerFloor <= N.available) out.push(`يقول إن المساحة لا تكفي والمطلوب ${N.neededGrossPerFloor} ≤ المتاح ${N.available}`);
  if (N && suff && N.neededGrossPerFloor > N.available) out.push(`يقول إن المساحة تكفي والمطلوب ${N.neededGrossPerFloor} > المتاح ${N.available}`);
  return out;
}
/**
 * فحص اتساق أي نص يراه العميل (لا تقارير هذا الملف وحدها — ومنها إشعارات الجولات السابقة): إن ذكر مساحة متاحة (W × D م أو «المتاح … م²»)
 * ومساحة يحتاجها البرنامج أصغر منها، فلا يجوز أن يقترح تقليل الغرف أو دورًا ثانيًا أو أرضًا أكبر، ولا أن يصف الطلب بالمستحيل.
 */
export function textContradictions(text) {
  const t = String(text || ''), out = [], num = s => Number(String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const avail = []; for (const m of t.matchAll(/\(?(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*م\)?/g)) avail.push(num(m[1]) * num(m[2]));
  for (const m of t.matchAll(/(?:المتاح(?: للبناء)?|يبقى للبناء[^0-9]*\()\s*(\d+)\s*م²/g)) avail.push(num(m[1]));
  const need = [...t.matchAll(/يحتاج(?: البرنامج)? نحو (\d+) م²/g)].map(m => num(m[1]));
  const A = avail.length ? Math.max(...avail) : null, Nd = need.length ? Math.min(...need) : null;
  if (A && Nd && Nd < A * .92 && /تقليل عدد الغرف|دور ثانٍ|دوران بدل|أرض أكبر|أرض أعمق|أرض أعرض/.test(t) && !/المساحة ضيقة/.test(t)) out.push(`المتاح ${Math.round(A)} م² والمطلوب ${Nd} م² ويقترح تصغير البرنامج أو أرضًا أكبر`);
  if (A && Nd && Nd < A * .92 && /(?<!يعني أن طلبك )مستحيل|لا يمكن تحقيق الطلب/.test(t)) out.push('يصف الطلب بالمستحيل والمساحة تكفي');
  if (/تقليل عدد الغرف|دور ثانٍ|دوران بدل/.test(t) && !/المساحة لا تكفي|المساحة ضيقة|أكبر مما تتسع|يزيد عن المتاح|لا يتسع/.test(t)) out.push('يقترح تصغير البرنامج أو دورًا ثانيًا بلا قياس يثبت ضيق المساحة');
  return out;
}
export default { textContradictions, explainFailure, failureCauses, reportContradictions, TREE_WHY_AR };
