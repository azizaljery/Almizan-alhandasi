import { requestLocalBrief } from './local-nlp.mjs';
import { TYPES, POSITIONS, DIRECTIONS, validatePlot } from './planner.mjs';

export const requestText = value => String(value || '').replace(/[٠-٩۰-۹]/g, d => String('٠١٢٣٤٥٦٧٨٩'.includes(d) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(d) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[أإآ]/g, 'ا').replace(/[\u064B-\u065F\u0670]/g, '').replace(/٫/g, '.');
export const requestFingerprint = ({ prompt, rooms, plot, discovery, mode }) => JSON.stringify([prompt, rooms, plot, discovery, mode]);
const labels = { l: 'جناحان على شكل L', u: 'بيت الباحة U', pavilions: 'أجنحة مرتبطة برواق', staggered: 'جناحان متدرجان مرتبطان', rect: 'مستطيل', closed: 'فناء مغلق' };
export const requestShapeLabels = labels;
const shapePatterns = [
  ['closed', /فناء\s*(?:خاص\s*)?(?:مغلق|من اربع|اربعة جوانب)/i],
  ['pavilions', /اجنحة\s*(?:منفصلة|مرتبطة|يربطها|مع رواق)|(?:اجنحة|كتل).*?رواق|linked pavilions/i],
  ['staggered', /(?:اجنحة|جناح(?:ين|ان)?)\s*متدرج(?:ة|ين|ون|ان)?|(?:شكل|تكوين|كتل)\s*متدرج|staggered wings/i],
  ['l', /(?:شكل|حرف|بيت|جناحين|جناحان)\s*(?:حرف\s*)?l\b/i],
  ['u', /(?:شكل|حرف|بيت|باحة)\s*(?:حرف\s*)?u\b/i],
  ['rect', /(?:بيت|شكل|مخطط|كتلة)\s*مستطيل|rectangular/i],
];
const unique = list => [...new Set(list)];
const hasNegation = prefix => /(?:ما\s*(?:ابي|ابغى|اريد)|لا\s*(?:ابي|اريد)?|بدون|استبعد|غير|مو)\s*$/.test(prefix.trim());
const wingCountWords = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  واحد: 1, واحدة: 1, اثنان: 2, اثنتان: 2, اثنين: 2, اثنتين: 2, اثنا: 2, اثنتا: 2, ثنين: 2, ثنتين: 2,
  ثلاث: 3, ثلاثة: 3, ثلاثه: 3, اربع: 4, اربعة: 4, اربعه: 4, خمس: 5, خمسة: 5, خمسه: 5,
  ست: 6, ستة: 6, سته: 6, سبع: 7, سبعة: 7, سبعه: 7, ثمان: 8, ثمانية: 8, ثمانيه: 8,
  تسع: 9, تسعة: 9, تسعه: 9, عشر: 10, عشرة: 10, عشره: 10,
};
const wingNumberToken = `(?:\\d+(?:\\.\\d+)?|${Object.keys(wingCountWords).sort((a, b) => b.length - a.length).join('|')})`;
const wingMarker = new RegExp(`(?:^|[\\s،,؛]|(?<=و))(?:(?<explicit>${wingNumberToken})\\s+)?(?<noun>جناح(?:ين|ان)?|اجنحة|اجنحه|wings?)(?=$|[\\s،,؛.!؟])`, 'giu');
const wingCorrectionCue = /لكن|بل|قصدي|اقصد|التصحيح|تصحيح|صحح(?:ها|ه)?|اعني|بدل(?:ا)?(?: من)?|خلها|خليها|بالعكس|actually|instead|correction|i mean/i;
function extractWingCount(text) {
  const markers = [...text.matchAll(wingMarker)].map(match => {
    const explicit = match.groups.explicit;
    const noun = match.groups.noun.toLowerCase();
    const count = explicit !== undefined
      ? (wingCountWords[explicit.toLowerCase()] ?? Number(explicit))
      : /جناحين|جناحان/i.test(noun) ? 2
        : /جناح$/i.test(noun) || /^wing$/i.test(noun) ? 1
          : null;
    return { index: match.index, end: match.index + match[0].length, count };
  }).filter(marker => marker.count !== null);
  if (!markers.length) return { count: null, conflict: false, counts: [] };
  let count = markers[0].count, conflict = false;
  for (let index = 1; index < markers.length; index++) {
    const current = markers[index], previous = markers[index - 1];
    const correction = wingCorrectionCue.test(text.slice(previous.end, current.index));
    if (current.count === count) {
      if (correction) conflict = false;
      continue;
    }
    count = current.count;
    conflict = correction ? false : true;
  }
  return { count: conflict ? null : count, conflict, counts: markers.map(marker => marker.count) };
}

const special = [
    [/مدخل.*?مستقل|مداخل.*?مستقل|فصل.*?ضيوف|الضيوف.*?العائلة|guest.*?separat/i, 'استقلال مسار الضيوف عن العائلة', 'تحتاج تخطيطًا لمسارات ومداخل منفصلة؛ المخطط الحالي لا يضمن استقلالها.'],
    [/خصوصي|privacy/i, 'خصوصية العائلة وغرف النوم', 'تُراجع من الأبواب ومسارات المخطط؛ لا يكفي اختيار الشكل لإثباتها.'],
    [/والد(?:ة|تي)|كبار السن|كرسي متحرك|ذوي الاعاقة|wheelchair/i, 'سهولة وصول كبار السن', 'قرب الغرف قابل للفحص؛ المناسيب والدوران وتجهيزات الوصول غير مُقيّمة.'],
    [/مسبح|pool/i, 'مسبح', 'المسبح غير مدعوم في محرك توزيع الغرف الحالي.'],
    [/مصعد|(?:^|[\s،,؛])(?:درج|سلم)(?=$|[\s،,؛])|stairs|elevator/i, 'درج أو مصعد', 'الرسم الرأسي بين الأدوار غير مدعوم حاليًا.'],
    [/قريب.*?مطبخ|مطبخ.*?قريب|جنب.*?مطبخ|مطبخ.*?طعام/i, 'قرب المطبخ من الطعام', 'تُعرض المسافة الفعلية بعد التوليد، وتحتاج قرارًا إذا لم تناسبك.'],
    [/حديقة|فناء|باحة|garden/i, 'فراغ خارجي', 'تكوين الكتلة قابل للمراجعة؛ تنسيق الحديقة غير منفّذ.'],
    [/غرفة غسيل|رياضة|كراج|garage|laundry|gym/i, 'فراغ إضافي يحتاج تعريفًا', 'هذا الاستخدام غير ممثل بنوع غرفة مستقل؛ حدّد اسمه ومساحته واستخدامه مع المختص.'],
  ];

export function extractClientDesires(prompt) { const text = requestText(prompt); return special.filter(([pattern]) => pattern.test(text)).map(([,label,detail]) => ({label,detail})); }

export function extractShapeIntent(prompt) {
  const text = requestText(prompt), shapes = [], rejectedShapes = [], questions = [];
  for (const [shape, pattern] of shapePatterns) for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags + 'g'))) {
    const prefix = text.slice(Math.max(0, match.index - 40), match.index);
    if (hasNegation(prefix) || /(?:ما\s*(?:ابي|ابغى|اريد)|لا\s*(?:ابي|اريد)|بدون|استبعد)\s*(?:(?:على|بيت|شكل|حرف)\s*)*$/.test(prefix.trim())) rejectedShapes.push(shape);
    else shapes.push(shape);
  }
  const positiveShapes = unique(shapes), negativeShapes = unique(rejectedShapes);
  let shape = positiveShapes.length === 1 ? positiveShapes[0] : null;
  if (positiveShapes.length > 1) { questions.push(`طلبت أكثر من شكل (${positiveShapes.map(s => labels[s]).join('، ')}). اختر شكلًا واحدًا قبل تطبيق الطلب.`); shape = null; }
  if (positiveShapes.some(s => negativeShapes.includes(s))) { questions.push('الشكل نفسه مطلوب ومستبعد في الوصف؛ وضّح الاختيار الذي تريد تطبيقه.'); shape = null; }
  const wingIntent = shape === 'staggered' ? extractWingCount(text) : { count: null, conflict: false, counts: [] };
  const wingCount = wingIntent.count;
  if (shape === 'staggered' && wingIntent.conflict) questions.push(`وردت أعداد مختلفة للأجنحة (${unique(wingIntent.counts).join('، ')}) بلا عبارة تصحيح صريحة. حدّد العدد؛ لم نعتمد أيًّا منها.`);
  else if (shape === 'staggered' && wingCount === null) questions.push('حدّد عدد الأجنحة المتدرجة. المولد الحالي يدعم جناحين متدرجين مرتبطين فقط؛ لا نفترض العدد من وصف عام.');
  else if (shape === 'staggered' && wingCount !== 2) questions.push(`طلبت ${wingCount} أجنحة متدرجة، بينما المولد الحالي يدعم جناحين فقط؛ لم نستبدل العدد المطلوب.`);
  return { shape, wingCount, rejectedShapes: negativeShapes, questions };
}

export async function analyzeClientRequest({ prompt, rooms = [], plot, discovery = {}, mode = 'replace' }) {
  const text = requestText(prompt).trim();
  if (text.length < 3 || text.length > 4000) throw Error('اكتب طلبك أولًا، بين 3 و4000 حرف.');
  const brief = await requestLocalBrief({ prompt, previous: { rooms: mode === 'modify' ? rooms : [] } });
  const questions = [...brief.questions], limitations = [...brief.unhandled], assumptions = [...brief.assumptions], understood = [], plotPatch = {}, desires = [], rejectedShapes = [];
  const { shape, wingCount, rejectedShapes: negativeShapes, questions: shapeQuestions } = extractShapeIntent(prompt);
  rejectedShapes.push(...negativeShapes); questions.push(...shapeQuestions);
  if (shape === 'closed') limitations.push('الفناء المغلق من أربع جهات غير مدعوم؛ سيبقى طلبك محفوظًا ولن يُستبدل بشكل آخر.');
  const palettes = [['modern', /مودرن|modern/i], ['classic', /كلاسيكي|classic/i], ['hijazi', /حجازي|hejazi/i], ['resort', /منتجع|resort/i]].filter(([,pattern]) => pattern.test(text));
  const palette = palettes.length === 1 ? palettes[0][0] : null;
  if (palettes.length > 1) questions.push('ذكرت أكثر من طابع للخامات؛ اختر طابعًا واحدًا في خطوة الغرف والشكل.');
  if (shape) understood.push({ label: 'الشكل المطلوب', value: labels[shape], state: shape === 'closed' ? 'unsupported' : 'understood' });
  if (shape === 'staggered' && wingCount !== null) understood.push({ label: 'عدد الأجنحة', value: wingCount === 2 ? 'جناحان · يطابق التكوين المدعوم' : `${wingCount} أجنحة · غير مدعوم؛ لا نستبدل العدد بجناحين`, state: wingCount === 2 ? 'understood' : 'unsupported' });
  if (rejectedShapes.length) understood.push({ label: 'أشكال مستبعدة', value: rejectedShapes.map(s => labels[s]).join('، '), state: 'understood' });
  const width = text.match(/(?:عرض(?:ها| الارض)?|العرض|width)\s*(?:هو|يساوي|:)?\s*(\d+(?:\.\d+)?)/i);
  const length = text.match(/(?:طول(?:ها| الارض)?|الطول|length)\s*(?:هو|يساوي|:)?\s*(\d+(?:\.\d+)?)/i);
  const dimension = text.match(/(?:ارض(?:ي|نا|ها)?|الارض|plot)\s*(?:مساحتها|مقاسها|ابعادها)?\s*(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)/i);
  if (width) plotPatch.width = Number(width[1]);
  if (length) plotPatch.length = Number(length[1]);
  if (dimension && !width && !length) {
    plotPatch.width = Number(dimension[1]); plotPatch.length = Number(dimension[2]);
    assumptions.push('اعتُبر الرقم الأول في أبعاد الأرض عرضًا شرق/غرب والثاني طولًا شمال/جنوب؛ راجع الأبعاد في الخطوة التالية.');
  }
  const entry = text.match(/(?:المدخل|مدخل رئيسي|الدخول)\s*(?:من|في|جهة|على)?\s*(?:ال)?(شمال|جنوب|شرق|غرب)/);
  if (entry) {
    plotPatch.entry = Object.keys(DIRECTIONS).find(k => DIRECTIONS[k] === entry[1]);
    plotPatch.streets = { ...plot?.streets, [plotPatch.entry]: true };
    assumptions.push('فُعّلت جهة المدخل كشارع؛ راجع الشوارع المحيطة بالأرض.');
  }
  if (/دور(?:ان|ين)|طابق(?:ان|ين)|دورين|two floors/i.test(text)) plotPatch.floors = 2;
  else if (/ثلاث(?:ة)? (?:ادوار|طوابق)|3 (?:ادوار|طوابق)/.test(text)) plotPatch.floors = 3;
  else if (/دور واحد|دور ارضي|single.storey|one floor/i.test(text)) plotPatch.floors = 1;
  if (plotPatch.floors > 1) limitations.push('تم حفظ عدد الأدوار المطلوب؛ الرسم الحالي يدعم الدور الأرضي فقط.');
  if (Object.keys(plotPatch).length) {
    try { validatePlot({ ...plot, ...plotPatch }); }
    catch (error) { questions.push(error.message); }
    if (plotPatch.width || plotPatch.length) understood.push({ label: 'الأرض', value: `${plotPatch.width ?? plot.width} × ${plotPatch.length ?? plot.length} م`, state: 'understood' });
    if (entry) understood.push({ label: 'المدخل', value: entry[1], state: 'understood' });
  }
  desires.push(...extractClientDesires(text));
  if (/كبير|واسع|صغير|مساحات مناسبة/.test(text) && !/(?:مساح|م²|م2|متر مربع|\d\s*[×x*])/.test(text)) questions.push('وصفت مساحة بأنها كبيرة أو صغيرة؛ حدّد المساحة المطلوبة بالمتر المربع حتى لا نختارها عنك.');
  if (/غرف نوم|مجالس|حمامات|مطابخ|صالات/.test(text) && !/\d|واحد|اثنين|ثنتين|ثلاث|اربع|خمس|ست|سبع|ثمان|تسع|عشر/.test(text)) questions.push('ذكرت غرفًا بصيغة الجمع دون عدد واضح؛ حدّد عدد كل نوع قبل تطبيق البرنامج.');
  if (/غرف(?:ة)?(?:\s+نوم)?\s+(?:ل|حق)\s*(?:الاطفال|العيال|الوالدة)/.test(text)) questions.push('حدّد عدد غرف النوم ومساحة كل غرفة، ثم سمّها في الجدول حسب من يستخدمها.');
  for (const type of Object.keys(TYPES)) {
    const group = brief.rooms.filter(r => r.type === type);
    if (group.length) understood.push({ label: TYPES[type].name, value: `${group.length} · ${group.map(r => r.dimensions ? `${r.dimensions.width}×${r.dimensions.length} م (${r.area} م²)` : `${r.area} م²`).join('، ')}`, state: 'understood' });
  }
  if (brief.rooms.length) assumptions.unshift('أي مساحة لم تذكرها استُخدمت لها مساحة أولية ظاهرة في الجدول؛ يمكنك تعديلها قبل التوليد.');
  return {
    fingerprint: requestFingerprint({ prompt, rooms, plot, discovery, mode }), mode,
    rooms: brief.rooms, plotPatch, shape, wingCount, palette, rejectedShapes: negativeShapes, desires,
    understood, questions: unique(questions), limitations: unique(limitations), assumptions: unique(assumptions),
    summary: `فهمنا ${brief.rooms.length} فراغًا${shape ? ` وشكل ${labels[shape]}` : ''}. راجع التفاصيل قبل تطبيقها.`,
  };
}

export function auditClientRequest({ model, rooms, discovery = {}, desired = [] }) {
  if (!model) return [];
  const rows = [];
  const available = [...model.rooms];
  const exact = rooms.length === available.length && rooms.every(r => {
    const index = available.findIndex(m => (!r.id || m.id === r.id) && m.name === r.name && m.type === r.type && Math.abs(m.area - r.area) < .001 && m.position === r.position && (r.side === 'any' || m.resolvedSide === r.side) && (!r.dimensions || Math.abs(m.w - r.dimensions.width) < .001 && Math.abs(m.h - r.dimensions.length) < .001 || Math.abs(m.w - r.dimensions.length) < .001 && Math.abs(m.h - r.dimensions.width) < .001));
    if (index < 0) return false;
    available.splice(index, 1); return true;
  });
  rows.push({ label: 'الغرف والمساحات والأبعاد والمواقع', state: exact ? 'met' : 'unmet', detail: exact ? `${rooms.length} فراغًا مطابقًا للبرنامج؛ الأبعاد الملزمة طوبقت على المستطيلات الفعلية في المخطط، مع السماح بتدوير الغرفة 90°.` : 'توجد فروق بين الجدول والمخطط؛ حدّث التوليد قبل اعتماد النتيجة.' });
  const choice = { family_layout: 'l', concept_comparison: 'u', classic_living: 'pavilions', staggered_wings: 'staggered', courtyard_privacy: 'closed' }[discovery.likes?.[0]];
  rows.push({ label: choice ? 'الشكل المفضل' : 'شكل البيت الناتج', state: 'information', detail: choice ? `تفضيلك: ${labels[choice]} · الناتج: ${labels[model.shape] || model.shape}. التفضيل لا يقيّد البدائل؛ الشكل المكتوب صراحةً يقيدها إذا كان مدعومًا.` : `لم يُحدد شكل إلزامي؛ الناتج الحالي ${labels[model.shape] || model.shape}.` });
  for (const item of desired) rows.push({ label: item.label, state: 'pending', detail: item.detail });
  return rows;
}
