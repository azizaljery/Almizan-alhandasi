// مقابلة معمارية متفرعة، محلية وقابلة للتفسير. لا تتطلب مفتاح ذكاء ولا تستنتج نمط الأسرة من المدينة.
import { normalizeAr } from '../requirements.mjs';
import { parseFamily } from '../shara/family.mjs';
import { SAUDI_TARGETS } from './saudi-quality.mjs';
import { cityById } from '../geo-land.mjs';

export const INTERVIEW_SCHEMA = 'architect-interview/1';
const SIDE = { n: 'الشمالي', s: 'الجنوبي', e: 'الشرقي', w: 'الغربي' };
const opt = (id, label, text = '') => ({ id, label, text });
const question = (id, text, reason, options, affects, key = '') => ({ id, text, reason: 'أسأل لأن ' + reason, options, affects, contextKey: key, free: true });
const fact = (value, source = 'unknown', evidence = '') => ({ value, source, evidence });
const pick = a => typeof a === 'string' ? a : a?.choice || a?.picks?.[0] || null;
const noKids = t => /(?:بدون|بلا) (?:ابناء|اطفال|عيال)|(?:ما|ليس) عند(?:ي|نا) (?:عيال|اطفال|اولاد|ابناء)|ما (?:عندي|عندنا) عيال|لا يوجد (?:ابناء|اطفال)/.test(t);

/** Typed facts with provenance. Unknown is never converted to false. Later explicit corrections win. */
export function interviewFacts(texts = [], land = null, answers = {}) {
  const fs = { children: fact(null), childCount: fact(null), ages: fact(null), parents: fact(null), mobility: fact(null), guests: fact(null) };
  for (const raw of texts) {
    const t = normalizeAr(raw), f = parseFamily(raw);
    if (noKids(t)) { fs.children = fact(false, 'said', raw); fs.childCount = fact(0, 'said', raw); fs.ages = fact(null); }
    else if (f.boys + f.girls + f.kids > 0 || /(?:عندي|عندنا|معنا) (?:اطفال|عيال|ابناء)/.test(t)) {
      fs.children = fact(true, 'said', raw); fs.childCount = fact(f.boys + f.girls + f.kids || null, 'said', raw);
    }
    if (f.ages && fs.children.value === true) fs.ages = fact(f.ages, 'said', raw);
    if (/(?:بدون|بلا) والدين/.test(t)) fs.parents = fact('none', 'said', raw);
    else if (/(?:الوالدين|والديني|امي|والدتي|ابوي|والدي)[^،.]{0,22}(?:يزور|تزور|زيار|زياره فقط|لا [يت]سكن|ما [يت]سكن|لا تسكن|ما تسكن|ليست? معنا)/.test(t)) fs.parents = fact('visiting', 'said', raw);
    else if (f.elderly.length && /يسكن|تسكن|ساكن|معي|معنا|مقيم|تعيش|يعيش/.test(t)) fs.parents = fact('resident', 'said', raw);
    if (f.guests) fs.guests = fact(f.guests, 'said', raw);
  }
  const household = pick(answers.a_household);
  if (household && (!texts.length || answers.a_household.at >= texts.length)) {
    if (['couple', 'single'].includes(household)) { fs.children = fact(false, 'answer', 'a_household'); fs.childCount = fact(0, 'answer', 'a_household'); }
    if (household === 'children') fs.children = fact(true, 'answer', 'a_household');
  }
  const parents = pick(answers.a_parents);
  if (['resident', 'visiting', 'none'].includes(parents) && answers.a_parents.at >= texts.length) fs.parents = fact(parents, 'answer', 'a_parents');
  const mobility = pick(answers.a_mobility);
  if (fs.parents.value === 'resident' && ['independent', 'stepfree'].includes(mobility) && answers.a_mobility.contextKey === 'resident') fs.mobility = fact(mobility, 'answer', 'a_mobility');
  fs.site = { streets: [...(land?.streets || [])], entries: [...(land?.entries || [])], floors: land?.floors || 1,
    location: land?.geo ? { lat: land.geo.lat, lng: land.geo.lng, city: land.geo.city || null } : null, width: land?.width, length: land?.length };
  return fs;
}

/** Ordered by decision impact, not a claim of learned AI/psychological scoring. One question is shown at a time. */
export function architectInterview({ texts = [], land = null, answers = {}, skipped = [], brief = null } = {}) {
  const facts = interviewFacts(texts, land, answers), f = facts, q = [];
  const kidsKey = JSON.stringify([f.children.value, f.childCount.value]);
  const siteKey = JSON.stringify([land?.width, land?.length, land?.streets || [], land?.entries || [], land?.geo?.lat, land?.geo?.lng, land?.geo?.city]);
  if (f.children.value === null) q.push(question('a_household', 'من يسكن المنزل معك الآن؟ وهل لديكم أبناء؟', 'تركيبة الأسرة تحدد جناح النوم، ولا أستنتج وجود الأطفال من عدد الغرف.', [opt('couple', 'زوجان بلا أبناء', 'انا وزوجتي بدون اطفال'), opt('children', 'أسرة مع أبناء', 'عندنا اطفال'), opt('single', 'أسكن وحدي', 'اسكن وحدي بدون اطفال')], ['sleeping-program']));
  if (f.parents.value === null) q.push(question('a_parents', 'هل الوالدان أو أحدهما يسكن معكم، أم يزوركم؟', 'السكن الدائم يحتاج غرفة أرضية قريبة من العائلة؛ الزيارة لا تعني إضافة غرفة دائمة.', [opt('resident', 'يسكن معنا', 'الوالدين يسكنون معنا'), opt('visiting', 'زيارة فقط', 'الوالدين زيارة فقط'), opt('none', 'لا يسكن معنا', 'بدون والدين')], ['parents-ground']));
  if (f.parents.value === 'resident' && f.mobility.value === null) q.push(question('a_mobility', 'لمن يسكن معكم من الوالدين: هل تحتاجون مسارًا بلا درجات وتجهيزًا لحركة أسهل؟', 'الحاجة للحركة تُسأل صراحة؛ العمر وحده لا يعني عجزًا أو استخدام كرسي.', [opt('independent', 'حركة مستقلة', 'الوالدين حركتهم مستقلة'), opt('stepfree', 'مسار بلا درجات وتجهيز وصول', 'احتاج مسار بلا درجات للوالدين')], ['parents-ground', 'step-free'], 'resident'));
  if (f.children.value === true) {
    if (!f.childCount.value) q.push(question('a_child_count', 'كم عدد الأبناء الذين سيسكنون معكم؟', 'غرف النوم تتبع عدد المقيمين الفعلي، فلا أفترض عددًا من كلمة «أسرة».', [1, 2, 3, 4, 5, 6].map(n => opt(String(n), `${n}`, `عندنا ${n} اطفال`)), ['sleeping-program'], 'children'));
    if (f.ages.value === null) q.push(question('a_child_ages', 'أعمار الأبناء تقريبًا؟', 'احتياجات طفل صغير تختلف عن مراهق؛ الأعمار تغيّر الإشراف والخصوصية.', [opt('young', 'أطفال صغار', 'الابناء صغار'), opt('older', 'مراهقون أو بالغون', 'الابناء كبار'), opt('mixed', 'أعمار مختلفة', 'الابناء صغار وكبار')], ['sleeping-program', 'child-supervision'], kidsKey));
    q.push(question('a_room_sharing', 'كيف تفضّلون توزيع غرف الأبناء؟', 'تقاسم الغرفة قرار أسري؛ لا أعتمد قاعدة تلقائية «طفلان لكل غرفة» بوصفها طلبكم.', [opt('individual', 'غرفة لكل ابن/ابنة'), opt('shared', 'تقاسم بعض الغرف بإشرافنا'), opt('later', 'نحددها من جدول البرنامج')], ['sleeping-program'], kidsKey));
  }
  const men = brief?.program?.some(r => r.id === 'majlis_men' && r.count > 0) !== false;
  if (men) q.push(question('a_entries', 'سأفصل مدخل الرجال عن مدخل النساء والعائلة. هل يناسب ذلك طريقة استقبالكم؟', 'استقلال الاستقبال يجب أن يظهر في الباب ومسار الوصول، ويؤثر في توزيع الواجهة.', [opt('separate', 'مدخلان مستقلان', 'مدخل رجال مستقل ومدخل النساء مستقل'), opt('shared', 'نفضّل استقبالًا مشتركًا', 'الاستقبال مشترك')], ['independent-entries']));
  if (men) q.push(question('a_dining', 'أعتمد المقلط بين خدمة المطبخ ومجلس الرجال بمسارين قصيرين لا يمران بالصالة. هل تحتاج مقلطًا مستقلًا؟', 'قرب الطعام يُقاس عبر الأبواب ومسار التقديم، لا بتلاصق أسماء الغرف.', [opt('separate', 'نعم، مقلط مستقل'), opt('none', 'لا نحتاج مقلطًا مستقلًا', 'بدون غرفة طعام')], ['kitchen-dining', 'men-dining']));
  if ((land?.entries?.length || 0) > 1 && men) q.push(question('a_guest_street', 'أرضك على أكثر من واجهة: من أي جهة يستقبل الرجال؟', 'اختيارك يغيّر موضع المجلس والمدخل؛ تعدد الشوارع لا يحدد اختيار الأسرة تلقائيًا.', land.entries.map(s => opt(s, `الشارع ${SIDE[s]}`, `المجلس في جهة ${SIDE[s]}`)), ['guest-location', 'independent-entries'], siteKey));
  q.push(question('a_site_noise', `${f.site.location ? 'بحسب معلومات الموقع التي أدخلتها، ' : ''}أي شارع عند أرضك أكثر ضوضاء أو كشفًا للنوم؟`, 'النوم يحتاج واجهة أهدأ؛ اسم المدينة وحده لا يثبت حالة الجار أو الضوضاء.', [...(land?.streets || []).map(s => opt(s, `الشارع ${SIDE[s]}`)), opt('none', 'لا يوجد فرق واضح'), opt('unknown', 'لم أعاين الموقع بعد')], ['bedroom-exposure'], siteKey));
  const city = cityById(land?.geo?.city);
  if (city && ['jeddah','dammam','khobar','jazan','yanbu'].includes(city.id)) q.push(question('a_coastal_site', `في موقع أرضك في ${city.ar}، هل تلاحظون تعرضًا للهواء البحري أو الرطوبة والملوحة؟`, 'التعرض الفعلي يغيّر مواصفات حماية المعادن والخامات؛ اختيار مدينة ساحلية وحده لا يثبت حالة أرضك.', [opt('exposed','نعم، تعرض واضح'),opt('no','لا نلاحظ ذلك'),opt('unknown','نحتاج معاينة')], ['material-exposure'], siteKey));
  if (city && ['abha','taif','bahah'].includes(city.id)) q.push(question('a_sloped_site', `هل أرضك في ${city.ar} مستوية أم بها فرق مناسيب؟`, 'فرق المناسيب يؤثر في المدخل والمواقف وتصريف المطر؛ لا أفترض ميل كل أرض في المدينة.', [opt('level','مستوية بحسب الرفع'),opt('sloped','يوجد فرق مناسيب'),opt('unknown','لا يوجد رفع مساحي بعد')], ['site-levels','step-free'], siteKey));
  q.push(question('a_growth', f.children.value === false ? 'هل تريدون حجز مرونة لغرفة إضافية مستقبلًا أم التركيز على احتياجكم الحالي؟' : 'هل تتوقعون تغيّر عدد المقيمين أو الحاجة لفصل جناح مستقبلًا؟', 'التوسّع يجب أن يُسجل قبل التصميم، ولا أضيف غرفًا أو دورًا دون موافقتك.', [opt('current', 'الاحتياج الحالي'), opt('reserve', 'مرونة مستقبلية تُراجع مع المهندس')], ['future-flexibility'], String(f.children.value)));
  const isSkipped = x => Array.isArray(skipped) ? skipped.includes(x.id) : skipped[x.id] === x.contextKey;
  const pending = q.filter(x => !isSkipped(x) && (!answers[x.id]?.resolved || answers[x.id].contextKey !== x.contextKey));
  const selected = id => { const question = q.find(x => x.id === id), a = answers[id]; return question && a?.resolved && a.contextKey === question.contextKey ? pick(a) : null; };
  const contract = { schema: 'architect-contract/1', enabled: true, enforce: true, separateEntries: selected('a_entries') !== 'shared' && men,
    diningService: selected('a_dining') !== 'none' && men, parentsResident: f.parents.value === 'resident', stepFree: f.mobility.value === 'stepfree',
    quietSide: ['n', 's', 'e', 'w'].includes(selected('a_site_noise')) ? selected('a_site_noise') : null, siteUnobserved: selected('a_site_noise') === 'unknown',
    roomSharing: selected('a_room_sharing'), childRoomsReviewed: (brief?.program || []).filter(r=>['bedroom_boys','bedroom_girls'].includes(r.id)).every(r=>r.source==='edit'),
    coastalExposure: selected('a_coastal_site'), siteSlope: selected('a_sloped_site'),
    futureFlexibility: selected('a_growth') === 'reserve', limits: { ...SAUDI_TARGETS }, facts,
    unresolved: pending.map(x => ({ id: x.id, affects: x.affects })), skipped: q.filter(isSkipped).map(x => x.id),
    interviewState: { answers: structuredClone(answers), skips: Array.isArray(skipped) ? Object.fromEntries(q.filter(isSkipped).map(x=>[x.id,x.contextKey])) : { ...skipped } },
    source: 'مقابلة شرعاء؛ الافتراضي السعودي معلن وقابل للتعديل' };
  return { schema: INTERVIEW_SCHEMA, facts, questions: pending, contract, answered: Object.keys(answers).length };
}

/** Validate choices; arbitrary free text is preserved, never falsely marked as a resolved structured decision. */
export function recordArchitectAnswer(question, value, at = 0) {
  const choice = pick(value), text = typeof value === 'string' && !question.options.some(o => o.id === value) ? value : value?.text || '';
  const option = question.options.find(o => o.id === choice);
  if (!option && !String(text).trim()) throw Error('اختر إجابة أو اكتب تفصيلًا، أو استخدم «تخطَّ».');
  return { choice: option?.id || null, text: String(text).trim().slice(0, 1500), contextKey: question.contextKey, at, resolved: !!option };
}
