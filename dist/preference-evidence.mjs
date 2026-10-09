import { circulationNetwork } from './circulation.mjs';

const lower = value => String(value ?? '').toLowerCase();
const normalizeText = value => lower(value)
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[٠-٩۰-۹]/g, ' ')
  .replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').trim();

const SHAPES = Object.freeze({
  family_layout: 'l', concept_comparison: 'u', classic_living: 'pavilions',
  staggered_wings: 'staggered', courtyard_privacy: null,
});

function preference(id, kind, description, value = {}, weight = 1) {
  return { id, kind: kind === 'prefer_aesthetic' ? kind : 'custom', description, weight,
    value: { mizanKind: kind, ...value }, source: 'user' };
}

function discoveryAvoidKind(label) {
  const text = normalizeText(label);
  if (/ممر|corridor/.test(text) && /طويل|مظلم|long|dark/.test(text)) return 'avoid_long_corridors';
  if (/الضيوف|ضيافه|guest/.test(text) && /عائل|اسر|خصوص|family|privacy/.test(text)) return 'avoid_shared_guest_family_corridors';
  if (/مطبخ|طعام|سفره|kitchen|dining/.test(text) && /بعيد|far|قريب|near/.test(text)) return 'prefer_kitchen_dining_route';
  if (/نوم|bedroom/.test(text) && /ضيافه|الضيوف|guest/.test(text)) return 'avoid_bedroom_guest_proximity';
  if (/غرب|شمس|sun|west/.test(text)) return 'avoid_west_sun_openings';
  if (/صدى|صوت|echo|acoustic/.test(text)) return 'avoid_echo';
  return 'unmapped_discovery_preference';
}

const correctionCue = /لكن|بل|تصحيح(?:ا| صريح)?|التصحيح|قصدي|اقصد|اعني|بالعكس|actually|instead|however|but|correction|i mean/gi;
function correctedTopic(text, topic) {
  const sections = text.split(correctionCue);
  const clauses = section => section.split(/[،,؛.!؟\n]+|\b(?:and|but|however)\b|(?:\s+و(?=\s*(?:ابي|ابغى|ابغا|اريد|احب|ارغب|ودي|i\s+want)))/i).filter(Boolean);
  for (const section of [...sections].reverse()) {
    const match = clauses(section).reverse().find(clause => topic.test(clause));
    if (match) return match;
  }
  return text;
}
const avoidanceIntent = /(?:ما\s*(?:ابي|ابغى|ابغا|اريد|احب|اكره|تواجه|تطل)|لا\s*(?:ابي|ابغى|اريد|احب|اكره|تواجه|تطل|تفتح|تقابل)|اكره|لا\s*ينبغي(?:\s*ان)?|يجب\s*(?:الا|ان\s*لا)|لا\s*بد\s*(?:ان\s*)?لا|بدون|تجنب|اتجنب|avoid|don't\s*want|do\s*not\s*want|should\s*not|shouldn't|must\s*not|mustn't|not\s+face)/;
const positiveIntent = /(?:ابي|ابغى|ابغا|اريد|احب|ارغب|want|prefer|like)/;
const noConcern = /(?:ما\s*عندي\s*(?:اي\s*)?(?:مشكله|مانع)|عادي\s*عندي|لا\s*مشكله\s*(?:عندي)?|no\s*problem|don't\s*mind)/;

function promptKinds(idea) {
  const text = normalizeText(idea), found = [];
  const diningTopic = /سفره|طعام|dining|meal/;
  const majlisTopic = /مجلس|مجالس|majlis/;
  const dining = diningTopic.test(text), majlis = majlisTopic.test(text);
  const diningSection = dining && majlis ? correctedTopic(text, /سفره|طعام|dining|meal/) : text;
  const routeRelation = /قريب|قرب|بعيد|مساف|اتصال|مسار|طريق|near|close|far|connect|route/.test(diningSection);
  if (dining && majlis && routeRelation) {
    const all = /كلا|كلتا|الرجال.{0,25}النساء|نساء.{0,25}رجال|both|men.{0,25}women|women.{0,25}men/.test(text);
    const far = /بعيد|بعيده|بعيدين|far/.test(diningSection);
    const near = /قريب|قرب|near|close/.test(diningSection);
    const nearNegated = near && (avoidanceIntent.test(diningSection) || /not\s+(?:near|close)/.test(diningSection));
    const farNegated = far && (avoidanceIntent.test(diningSection) || /not\s+far/.test(diningSection));
    const explicitPositive = positiveIntent.test(diningSection) && !avoidanceIntent.test(diningSection);
    let relationKind = null;
    if (farNegated || (near && !nearNegated)) relationKind = 'prefer_dining_access_all_majlis';
    else if ((far && explicitPositive) || nearNegated) relationKind = 'prefer_dining_far_from_majlis';
    if (relationKind) found.push(preference('prompt:dining-majlis-access', relationKind,
      relationKind === 'prefer_dining_access_all_majlis'
        ? (all ? 'تقليل أطول مسار أبواب مقاس بين السفرة ومجالس الرجال والنساء.' : 'تقليل مسار الأبواب المقاس بين السفرة والمجلس.')
        : 'زيادة مسار الأبواب المقاس بين السفرة والمجلس حسب طلبك؛ هذا لا يعني فصل مداخل أو ضمان خصوصية.',
      { minMajlis: all ? 2 : 1, sourceText: idea, relation: relationKind === 'prefer_dining_access_all_majlis' ? 'nearer' : 'farther' }, 2));
    else found.push(preference('prompt:dining-majlis-unresolved', 'unresolved_dining_majlis_relation',
      'ذُكرت السفرة والمجالس معًا دون اتجاه قرب/بعد واضح؛ حدّد العلاقة المطلوبة.', { sourceText: idea }, 2));
    if (/خصوص|خاص|منفصل|private|separate/.test(text)) found.push(preference('prompt:guest-route-separation', 'avoid_shared_guest_family_corridors',
      'فصل حركة المجالس عن مسارات غرف النوم/المعيشة عبر الممرات المرسومة؛ لا يقيس الرؤية أو الخصوصية البصرية.', { sourceText: idea }, 2));
  }
  if (dining && majlis && !routeRelation) found.push(preference('prompt:dining-majlis-unresolved', 'unresolved_dining_majlis_relation',
    'ذُكرت السفرة والمجالس دون اتجاه قرب/بعد أو طلب مسار واضح؛ حدّد العلاقة المطلوبة.', { sourceText: idea }, 2));
  const guestRoute = /ضيف|ضيوف|ضيافه|مجلس|majlis|guest/;
  const familyRoute = /عائله|اسره|نوم|معيشه|family|bedroom|living/;
  const routeWord = /مسارات?|طرق?|ممر|منفصل|مشترك|خاص|خصوص|separate|shared|private|route|corridor/;
  if (guestRoute.test(text) && familyRoute.test(text) && routeWord.test(text)
    && !found.some(row => row.value?.mizanKind === 'avoid_shared_guest_family_corridors')) {
    found.push(preference('prompt:guest-route-separation', 'avoid_shared_guest_family_corridors',
      'تقليل تداخل مقاطع الممر بين مسارات الضيافة والعائلة؛ لا يثبت المداخل المستقلة أو الخصوصية البصرية.', { sourceText: idea }, 2));
  }
  if (/(?:مدخل|مداخل|entrance).{0,45}(?:منفصل|مستقل|خاص|استقلال|separate|independent|private)|(?:منفصل|مستقل|خاص|استقلال|separate|independent|private).{0,45}(?:مدخل|مداخل|entrance)/.test(text)) {
    found.push(preference('prompt:separate-guest-entry', 'require_separate_guest_entry',
      'طلب مدخل مستقل محفوظ، لكن المولد لا يرسم مداخل مستقلة موثقة؛ هذا الطلب غير قابل للتقييم هنا.', { sourceText: idea }, 3));
  }

  const bedroomTopic = /غرف(?: ال)?نوم|غرفه(?: ال)?نوم|غرفه|bedrooms?/;
  const kitchenTopic = /مطبخ|kitchen/;
  const facing = /تواجه|مواجهه|مقابل|تطل(?:\s*على)?|تفتح(?:\s*على)?|face|facing|overlook/;
  if (bedroomTopic.test(text) && kitchenTopic.test(text) && facing.test(text)) {
    const section = correctedTopic(text, bedroomTopic);
    const avoid = avoidanceIntent.test(section) && !noConcern.test(section);
    const prefer = positiveIntent.test(section) && !avoidanceIntent.test(section);
    const kind = avoid ? 'avoid_bedroom_kitchen_sightline'
      : prefer ? 'prefer_bedroom_kitchen_sightline' : 'unresolved_bedroom_kitchen_facing';
    found.push(preference(`prompt:${kind}`, kind,
      avoid ? 'تجنّب مواجهة غرف النوم للمطبخ؛ غير مُقيّم لغياب هندسة خط الرؤية.'
        : prefer ? 'طُلب توجيه غرف النوم نحو المطبخ؛ غير مُقيّم لغياب هندسة خط الرؤية.'
          : 'ذُكرت مواجهة غرف النوم للمطبخ دون اتجاه طلب واضح؛ يلزم توضيح المقصود.', { sourceText: idea }, 2));
  }

  const corridorTopic = /ممر(?:ات|ين|ه)?|corridors?/;
  const longWord = /طويل(?:ه|ين|ات)?|long/;
  if (corridorTopic.test(text) && longWord.test(text)) {
    const section = correctedTopic(text, /ممر(?:ات|ين|ه|corridors?)/);
    if (!noConcern.test(section)) {
      const avoid = avoidanceIntent.test(section);
      const preferLong = positiveIntent.test(section) && !avoidanceIntent.test(section);
      const kind = avoid ? 'avoid_long_corridors' : preferLong ? 'prefer_long_corridors' : 'unresolved_long_corridor_intent';
      found.push(preference(`prompt:${kind}`, kind,
        avoid ? 'تقليل أطول محور ممر مرسوم ومقارنته بمسارات الوصول؛ لا توجد عتبة طول مطلقة أو معيار نظامي.'
          : preferLong ? 'تفضيل الممرات الأطول محفوظ، لكن لا توجد عتبة أو مبرر هندسي لتطبيقه تلقائيًا؛ راجع الخيار يدويًا.'
            : 'ذُكرت الممرات الطويلة دون تفضيل صريح؛ حدّد هل تريد تقليلها.', { sourceText: idea }, 2));
    }
  }
  return found.map(row => {
    const kind = row.value?.mizanKind;
    const topic = kind === 'require_separate_guest_entry' ? /مدخل|مداخل|entrance/
      : kind?.includes('bedroom') ? /غرف(?: ال)?نوم|غرفه(?: ال)?نوم|غرفه|bedrooms?/
      : kind?.includes('dining') ? /سفره|طعام|dining|meal/
        : kind?.includes('corridor') ? /ممر(?:ات|ين|ه|corridors?)/
          : kind?.includes('guest') || kind?.includes('shared') ? /ضيوف|ضيافه|مجلس|عائله|اسره|guest|family/
            : /مجلس|majlis/;
    const section = correctedTopic(text, topic);
    const must = /(?:must|mandatory|required|require|لازم|يجب|لا\s*بد|ضروري|شرط|مطلوب)/.test(section);
    return must ? { ...row, value: { ...row.value, mustRequirement: true } } : row;
  });
}

/**
 * Convert selected discovery values and clearly recognized free-form requests
 * into typed, durable preferences. The custom AZIZ envelope retains these values;
 * the native evaluator below is the only component that claims to measure them.
 */
export function buildPreferenceRequests({ idea = '', discovery = {}, briefContext = null } = {}) {
  const rows = [];
  const add = row => {
    const kind = row.value?.mizanKind || row.kind;
    const mergeable = !['prefer_aesthetic', 'avoid_shape', 'unmapped_lifestyle_preference', 'unmapped_discovery_preference', 'unmapped_priority'].includes(kind);
    const prior = mergeable ? rows.find(x => (x.value?.mizanKind || x.kind) === kind) : rows.find(x => x.id === row.id);
    if (!prior) { rows.push(row); return; }
    prior.description = [prior.description, row.description].filter(Boolean).join(' · ');
    prior.weight = Math.max(prior.weight, row.weight);
    prior.value = { ...prior.value, ...row.value, sourceLabels: [...new Set([...(prior.value.sourceLabels || []), ...(prior.value.sourceLabel ? [prior.value.sourceLabel] : []), ...(row.value.sourceLabel ? [row.value.sourceLabel] : [])])] };
  };
  for (const key of discovery.likes || []) {
    const shape = SHAPES[key];
    add(preference(`discovery:like:${key}`, 'prefer_aesthetic', `تفضيل الشكل: ${key}`, { shape, unsupportedShape: shape === null }));
  }
  for (const key of discovery.rejects || []) {
    add(preference(`discovery:reject:${key}`, 'avoid_shape', `استبعاد الشكل: ${key}`, { shape: SHAPES[key], sourcePreference: key }));
  }
  for (const label of discovery.avoids || []) {
    const kind = discoveryAvoidKind(label);
    add(preference(`discovery:avoid:${label}`, kind, `تجنّب: ${label}`, { sourceLabel: label }));
    if (/ممر|corridor/.test(normalizeText(label)) && /مظلم|dark/.test(normalizeText(label))) {
      add(preference(`discovery:avoid:${label}:darkness`, 'avoid_dark_corridors', `تجنّب ظلمة الممرات: ${label}`, { sourceLabel: label }));
    }
    if (/نوم|bedroom/.test(normalizeText(label)) && /ضيافه|الضيوف|guest/.test(normalizeText(label))) {
      add(preference(`discovery:avoid:${label}:exposure`, 'avoid_exposed_bedrooms', `تجنّب انكشاف غرف النوم: ${label}`, { sourceLabel: label }));
    }
  }
  for (const [key, value] of Object.entries(discovery.life || {})) {
    if (!value) continue;
    const kind = key === 'children' && /قريب/.test(normalizeText(value)) ? 'prefer_children_near_living' : 'unmapped_lifestyle_preference';
    add(preference(`discovery:life:${key}`, kind, `أسلوب الحياة (${key}): ${value}`, { key, value }));
  }
  for (const row of promptKinds(idea)) add(row);
  for (const [index, value] of (briefContext?.topPriorities || []).entries()) {
    add(preference(`brief:priority:${index}`, 'unmapped_priority', String(value), { text: String(value) }));
  }
  return rows;
}

const notEvaluated = (pref, reason) => ({ id: pref.id, kind: pref.value?.mizanKind || pref.kind,
  label: pref.description, status: 'NOT_EVALUATED', score: null, objective: null, direction: null, detail: reason });

function pathPreference(model, pref, network) {
  const kind = pref.value?.mizanKind;
  const rooms = model.rooms || [];
  if (kind === 'prefer_dining_access_all_majlis' || kind === 'prefer_dining_far_from_majlis') {
    const dining = rooms.filter(r => r.type === 'dining'), majlis = rooms.filter(r => r.type === 'majlis');
    const required = Math.max(1, pref.value.minMajlis || 1);
    if (!dining.length || majlis.length < required) return notEvaluated(pref,
      `المطلوب يحتاج سفرة واحدة على الأقل و${required} مجلسًا على الأقل؛ المتاح ${dining.length} سفرة و${majlis.length} مجلس. لم يُغيّر عدد الغرف.`);
    const pairs = dining.flatMap(d => majlis.map(m => ({ diningRoom: d.name, majlisRoom: m.name, path: network.betweenRooms(d.id, m.id) })));
    const missing = pairs.filter(p => !p.path);
    if (missing.length) return { ...notEvaluated(pref, `لا يوجد مسار أبواب متصل عبر الممرات من السفرة إلى ${missing.map(p => p.majlisRoom).join('، ')}.`), status: 'FAIL', score: 0, data: { pairs: pairs.map(p => ({ diningRoom: p.diningRoom, majlisRoom: p.majlisRoom, metres: p.path?.metres ?? null })) } };
    const longest = Math.max(...pairs.map(p => p.path.metres));
    const direction = kind === 'prefer_dining_access_all_majlis' ? 'minimize' : 'maximize';
    return { id: pref.id, kind, label: pref.description, status: 'ESTIMATE', score: null, objective: longest, direction,
      data: { pairs: pairs.map(p => ({ diningRoom: p.diningRoom, majlisRoom: p.majlisRoom, metres: p.path.metres, corridors: p.path.spaces })),
        preferenceMetrics: pairs.map(p => ({ name: `route:${p.majlisRoom}`, value: p.path.metres, direction })) },
      detail: `توجد مسارات أبواب مرسومة إلى جميع المجالس: ${pairs.map(p => `${p.majlisRoom} ${p.path.metres.toFixed(1)}م`).join('، ')}. المقارنة تقيس أطول مسار بين البدائل (${direction === 'minimize' ? 'الأقصر' : 'الأبعد'} حسب طلبك)؛ لا تُفترض مجاورة مباشرة أو مداخل منفصلة ولا توجد عتبة رقمية لكلمة «قريب».` };
  }
  if (kind === 'prefer_kitchen_dining_route') {
    const kitchens = rooms.filter(r => r.type === 'kitchen'), dining = rooms.filter(r => r.type === 'dining');
    if (!kitchens.length || !dining.length) return notEvaluated(pref, 'لا توجد غرفة مطبخ وسفرة معًا في البرنامج؛ لم يُضف أو يُحذف أي فراغ.');
    const pairs = kitchens.flatMap(k => dining.map(d => ({ kitchen: k.name, dining: d.name, path: network.betweenRooms(k.id, d.id) })));
    if (pairs.some(p => !p.path)) return { ...notEvaluated(pref, 'تعذّر إثبات اتصال الأبواب بين المطبخ والسفرة في هذا المخطط.'), status: 'FAIL', score: 0 };
    const mean = pairs.reduce((sum, p) => sum + p.path.metres, 0) / pairs.length;
    return { id: pref.id, kind, label: pref.description, status: 'ESTIMATE', score: null, objective: mean, direction: 'minimize',
      detail: `متوسط مسار المطبخ إلى السفرة ${mean.toFixed(1)}م عبر الممرات المرسومة؛ ترتيب مقارن بين البدائل، دون عتبة «قريب» مفترضة.` };
  }
  return null;
}

function sharedCorridorPreference(model, pref, network) {
  const kind = pref.value?.mizanKind, rooms = model.rooms || [];
  const guests = rooms.filter(r => r.type === 'majlis');
  const family = rooms.filter(r => ['bedroom', 'master-bedroom', 'living'].includes(r.type));
  if (!guests.length || !family.length) return notEvaluated(pref, 'يلزم وجود مجلس وغرفة نوم أو معيشة ومسارات أبواب مرسومة؛ لا يُستنتج فصل الحركة من قرب الغرف أو بعدها.');
  const pairs = guests.flatMap(g => family.map(f => ({ guest: g, family: f, guestPath: network.toRoom(g.id), familyPath: network.toRoom(f.id) })));
  if (pairs.some(p => !p.guestPath || !p.familyPath)) return { ...notEvaluated(pref, 'توجد مسارات أبواب غير مكتملة؛ لا يمكن فحص فصل حركة المجالس عن العائلة.'), status: 'FAIL', score: 0 };
  const lengths = new Map((model.corridors || []).map(c => [c.id, Math.max(Number(c.w) || 0, Number(c.h) || 0)]));
  const observed = pairs.map(p => {
    const sharedCorridors = p.guestPath.spaces.filter(id => p.familyPath.spaces.includes(id));
    const sharedAxisM = sharedCorridors.reduce((sum, id) => sum + (lengths.get(id) || 0), 0);
    const denominator = Math.min(p.guestPath.metres, p.familyPath.metres);
    return { guest: p.guest.name, family: p.family.name, guestRouteM: p.guestPath.metres,
      familyRouteM: p.familyPath.metres, sharedCorridors, sharedAxisM,
      sharedRouteFractionProxy: denominator > 0 ? Math.min(1, sharedAxisM / denominator) : null };
  });
  const finiteFractions = observed.map(p => p.sharedRouteFractionProxy).filter(Number.isFinite);
  const meanSharedFraction = finiteFractions.length ? finiteFractions.reduce((a, b) => a + b, 0) / finiteFractions.length : null;
  const action = kind === 'avoid_bedroom_guest_shared_corridors' ? 'تجنّب اشتراك مسارات غرف النوم والمجالس' : 'فصل مسارات المجالس عن غرف النوم/المعيشة';
  const separatedRatio = meanSharedFraction === null ? null : 1 - meanSharedFraction;
  return { id: pref.id, kind, label: pref.description, status: 'ESTIMATE', score: null, objective: separatedRatio,
    direction: 'maximize', data: { pairs: observed, meanSharedRouteFractionProxy: meanSharedFraction },
    detail: `${action}: مقياس تقريبي لتداخل معرّفات مقاطع الممر على مسارات الدخول من المدخل إلى المجالس/السفرة ومناطق العائلة. متوسط نسبة التداخل المقدرة ${meanSharedFraction === null ? 'غير متاح' : `${(meanSharedFraction * 100).toFixed(0)}%`}. المؤشر لا يحدد موضع بهو ولا يثبت مداخل منفصلة أو رؤية محجوبة أو خصوصية بصرية؛ خط الرؤية والأبواب الداخلية غير مُقيّمة.` };
}

function bedroomGuestProximity(model, pref) {
  const bedrooms = (model.rooms || []).filter(r => ['bedroom', 'master-bedroom'].includes(r.type));
  const guests = (model.rooms || []).filter(r => r.type === 'majlis');
  if (!bedrooms.length || !guests.length) return notEvaluated(pref, 'يلزم وجود غرف نوم ومجالس مع حدود مستطيلة قابلة للقياس؛ لا يُفترض أي فراغ مفقود.');
  const pairs = bedrooms.map(bedroom => {
    const distances = guests.map(guest => {
      const dx = Math.max(0, guest.x - (bedroom.x + bedroom.w), bedroom.x - (guest.x + guest.w));
      const dy = Math.max(0, guest.y - (bedroom.y + bedroom.h), bedroom.y - (guest.y + guest.h));
      return { guest: guest.name, edgeGapM: Math.hypot(dx, dy) };
    }).sort((a, b) => a.edgeGapM - b.edgeGapM);
    return { bedroom: bedroom.name, nearestMajlis: distances[0].guest, nearestEdgeGapM: distances[0].edgeGapM };
  });
  const minimum = Math.min(...pairs.map(p => p.nearestEdgeGapM));
  return { id: pref.id, kind: pref.value?.mizanKind || pref.kind, label: pref.description, status: 'ESTIMATE', score: null,
    objective: minimum, direction: 'maximize', data: { minimumBedroomMajlisEdgeGapM: minimum, pairs,
      preferenceMetrics: [{ name: 'minimum_bedroom_majlis_edge_gap_m', value: minimum, direction: 'maximize' }] },
    detail: `أقرب فراغ هندسي بين حدود كل غرفة نوم وأقرب مجلس: ${pairs.map(p => `${p.bedroom}→${p.nearestMajlis} ${p.nearestEdgeGapM.toFixed(1)}م`).join('، ')}. هذا قياس قرب حدود المستطيلات فقط، بلا عتبة أو استنتاج خصوصية/خط رؤية.` };
}

function evaluateOne(model, pref) {
  const kind = pref.value?.mizanKind || pref.kind;
  if (kind === 'prefer_aesthetic' && pref.value?.shape) {
    const matched = model.shape === pref.value.shape;
    return { id: pref.id, kind, label: pref.description, status: matched ? 'PASS' : 'FAIL', score: matched ? 100 : 0, objective: null, direction: null,
      detail: `الشكل المفضل ${pref.value.shape}؛ الناتج ${model.shape}.` };
  }
  if (kind === 'prefer_aesthetic' && pref.value?.unsupportedShape) return notEvaluated(pref, 'الشكل المفضل يحتاج فناءً مغلقًا، وهو غير مدعوم؛ لم يُستبدل بشكل آخر.');
  if (kind === 'avoid_long_corridors') {
    const corridors = model.corridors || [];
    if (!corridors.length) return notEvaluated(pref, 'لا توجد محاور ممرات قابلة للقياس في الهندسة الحالية.');
    const lengths = corridors.map(c => Math.max(Number(c.w) || 0, Number(c.h) || 0));
    const longest = Math.max(...lengths), total = lengths.reduce((a, b) => a + b, 0);
    const network = circulationNetwork(model);
    const routes = (model.rooms || []).map(room => ({ roomName: room.name, path: network.toRoom(room.id) }));
    const disconnected = routes.filter(route => !route.path);
    const farthest = routes.filter(route => route.path).sort((a, b) => b.path.metres - a.path.metres)[0] || null;
    const reachable = routes.filter(route => route.path);
    const routeMeasure = disconnected.length ? `مسار المدخل إلى كل الغرف غير مكتمل (${disconnected.length} فراغات بلا مسار).`
      : `أطول مسار دخول عبر شبكة الممرات إلى ${farthest?.roomName || 'غرفة'} ${farthest?.path.metres.toFixed(1)}م.`;
    return { id: pref.id, kind, label: pref.description, status: 'ESTIMATE', score: null, objective: longest, direction: 'minimize',
      data: { longestCorridorAxisM: longest, totalModeledCorridorAxisM: total,
        totalModeledCorridorAreaM2: corridors.reduce((sum, c) => sum + Math.max(0, Number(c.w) || 0) * Math.max(0, Number(c.h) || 0), 0),
        segmentCount: corridors.length,
        longestEntryRouteM: disconnected.length ? null : farthest?.path.metres ?? null, farthestRoomName: disconnected.length ? null : farthest?.roomName ?? null,
        meanEntryRouteM: reachable.length === routes.length ? reachable.reduce((sum, x) => sum + x.path.metres, 0) / reachable.length : null,
        disconnectedRooms: disconnected.map(route => route.roomName),
        preferenceMetrics: disconnected.length ? null : [
          { name: 'longest_corridor_axis_m', value: longest, direction: 'minimize' },
          { name: 'total_corridor_axis_m', value: total, direction: 'minimize' },
          { name: 'modeled_corridor_area_m2', value: corridors.reduce((sum, c) => sum + Math.max(0, Number(c.w) || 0) * Math.max(0, Number(c.h) || 0), 0), direction: 'minimize' },
          { name: 'longest_entry_route_m', value: farthest?.path.metres ?? null, direction: 'minimize' },
          { name: 'mean_entry_route_m', value: reachable.length ? reachable.reduce((sum, x) => sum + x.path.metres, 0) / reachable.length : null, direction: 'minimize' },
        ] },
      detail: `أطول محور مقطع ممر مرسوم ${longest.toFixed(1)}م، ومجموع المحاور ${total.toFixed(1)}م ومساحة المقاطع النموذجية ${corridors.reduce((sum, c) => sum + c.w * c.h, 0).toFixed(1)}م² (${corridors.length} مقاطع). ${routeMeasure} تُعرض محاور الممرات، المساحة، وأطوال مسارات الدخول كأهداف منفصلة؛ لا تعني النتيجة أن الممرات قصيرة. لا توجد عتبة مطلقة أو معيار نظامي مفترض.` };
  }
  if (kind === 'avoid_long_corridors' || kind === 'prefer_long_corridors') {
    const equivalent = kind === 'avoid_long_corridors' ? pref : { ...pref, value: { ...pref.value, mizanKind: 'avoid_long_corridors' } };
    const row = evaluateOne(model, equivalent);
    if (kind === 'prefer_long_corridors' && row.direction) row.direction = 'maximize';
    return row;
  }
  if (kind === 'avoid_shared_guest_family_corridors' || kind === 'avoid_bedroom_guest_shared_corridors') return sharedCorridorPreference(model, pref, circulationNetwork(model));
  if (kind === 'avoid_bedroom_guest_proximity') return bedroomGuestProximity(model, pref);
  if (kind === 'prefer_dining_access_all_majlis' || kind === 'prefer_dining_far_from_majlis' || kind === 'prefer_kitchen_dining_route') return pathPreference(model, pref, circulationNetwork(model));
  if (kind === 'avoid_bedroom_kitchen_sightline' || kind === 'prefer_bedroom_kitchen_sightline' || kind === 'unresolved_bedroom_kitchen_facing') return notEvaluated(pref,
    'غير مُقيّم: لا توجد هندسة خطّ رؤية بين فتحات الغرف. لن نحوّل «عدم المواجهة» إلى «عدم المجاورة» ولا نزعم تحقق الخصوصية.');
  if (kind === 'avoid_exposed_bedrooms') return notEvaluated(pref, 'غير مُقيّم: لا توجد هندسة خطوط رؤية من الخارج/المدخل إلى أبواب ونوافذ غرف النوم؛ القرب من المجالس مؤشر منفصل ولا يثبت الانكشاف.');
  if (kind === 'avoid_dark_corridors') return notEvaluated(pref, 'غير مُقيّم: لا توجد بيانات إنارة طبيعية أو صناعية للممرات؛ قياس طول الممر لا يثبت الإضاءة.');
  if (kind === 'unresolved_dining_majlis_relation') return notEvaluated(pref, 'العلاقة غير محسومة: لم نعامل مجرد ذكر السفرة والمجالس كطلب قرب أو بعد. حدّد الاتجاه قبل الاعتماد.');
  if (kind === 'unresolved_long_corridor_intent') return notEvaluated(pref, 'لم نحول ذكر الممرات الطويلة إلى طلب تجنب دون تصريح؛ وضّح هل تريد تقليل طولها.');
  if (kind === 'require_separate_guest_entry') return notEvaluated(pref, 'المداخل المستقلة غير مدعومة/غير مثبتة هندسيًا في المولد؛ هذا الشرط يحتاج توضيحًا ومراجعة قبل الاعتماد.');
  if (kind === 'avoid_west_sun_openings') return notEvaluated(pref, 'غير مُقيّم: لا توجد بيانات موقع شمسي أو اتجاه فتحات/تظليل كافية لإثبات تجنب شمس الغرب.');
  if (kind === 'avoid_echo') return notEvaluated(pref, 'غير مُقيّم: لا توجد أبعاد/مواد/حسابات صوتية؛ لا يمكن إثبات منع الصدى.');
  if (kind === 'prefer_children_near_living') return notEvaluated(pref, 'غير مُقيّم: لا توجد غرفة مُعرّفة باسم الأطفال؛ لن نفترض أي غرفة نوم تخصهم.');
  if (kind === 'avoid_shape') return { id: pref.id, kind, label: pref.description, status: model.shape === pref.value.shape ? 'FAIL' : 'PASS', score: model.shape === pref.value.shape ? 0 : 100, objective: null, direction: null,
    detail: `الشكل المستبعد ${pref.value.shape}؛ الناتج ${model.shape}.` };
  return notEvaluated(pref, 'رُفعت الرغبة إلى طلب التصميم، لكن لا توجد هندسة/معيار كافٍ لتقييمها أو ترتيب البدائل عليها.');
}

export function evaluatePlanPreferences(model, preferences = []) {
  return preferences.map(pref => ({ ...evaluateOne(model, pref), weight: Number.isFinite(pref.weight) ? pref.weight : 1 }));
}

/** Normalize each measurable goal against this request's candidate set. No
 * absolute threshold is fabricated: corridor/route metrics only compare peers. */
export function rankPreferenceCandidates(entries, fallbackCandidateId = null) {
  const byId = new Map(entries.map(entry => [entry.candidateId, { ...entry, preferenceWeight: 0, preferenceTotal: 0,
    evaluations: structuredClone(entry.evaluations) }]));
  const preferenceIds = [...new Set([...byId.values()].flatMap(entry => entry.evaluations.map(row => row.id)))];
  const comparisons = [];
  for (const id of preferenceIds) {
    const rows = [...byId.values()].map(entry => ({ candidateId: entry.candidateId, row: entry.evaluations.find(value => value.id === id) })).filter(x => x.row);
    const measured = rows.filter(x => x.row.status === 'ESTIMATE' && Number.isFinite(x.row.objective));
    if (measured.length) {
      const vals = measured.map(x => x.row.objective), min = Math.min(...vals), max = Math.max(...vals);
      const direction = measured[0].row.direction;
      for (const { candidateId, row } of measured) {
        row.score = max === min ? 100 : direction === 'maximize' ? (row.objective - min) / (max - min) * 100 : (max - row.objective) / (max - min) * 100;
      }
      comparisons.push({ id, candidatesCompared: measured.length, direction, minimum: min, maximum: max });
    }
    for (const { candidateId, row } of rows) {
      if (row.status === 'FAIL') row.score = 0;
      else if (row.status === 'PASS' && row.score === null) row.score = 100;
      const candidate = byId.get(candidateId);
      if (row.status !== 'NOT_EVALUATED' && Number.isFinite(row.score)) {
        candidate.preferenceWeight += Number.isFinite(row.weight) ? row.weight : 1;
        candidate.preferenceTotal += row.score * (Number.isFinite(row.weight) ? row.weight : 1);
      }
    }
  }
  const normalized = [...byId.values()].map(entry => ({ ...entry,
    preferenceScore: entry.preferenceWeight ? entry.preferenceTotal / entry.preferenceWeight : null }));
  const ranked = [...normalized].sort((a, b) => (b.preferenceScore ?? -1) - (a.preferenceScore ?? -1)
    || (a.candidateId === fallbackCandidateId ? -1 : b.candidateId === fallbackCandidateId ? 1 : a.candidateId.localeCompare(b.candidateId)));
  const conciseRanked = ranked.map(({ preferenceWeight, preferenceTotal, ...entry }) => entry);
  const bestPreferenceCandidateId = conciseRanked.find(x => x.preferenceScore !== null)?.candidateId ?? fallbackCandidateId;
  const fallback = byId.get(fallbackCandidateId);
  const comparable = entry => entry?.evaluations || [];
  const dominates = (candidate, base) => {
    if (!candidate || !base) return false;
    const baseById = new Map(comparable(base).map(row => [row.id, row]));
    let strict = false, checked = 0;
    for (const row of comparable(candidate)) {
      const original = baseById.get(row.id);
      if (!original) return false;
      if (row.status === 'NOT_EVALUATED' || original.status === 'NOT_EVALUATED') {
        if (row.status !== original.status) return false;
        continue;
      }
      if (row.status === 'PASS' || row.status === 'FAIL' || original.status === 'PASS' || original.status === 'FAIL') {
        const score = x => x.status === 'PASS' ? 100 : x.status === 'FAIL' ? 0 : Number.isFinite(x.score) ? x.score : null;
        const a = score(row), b = score(original);
        if (a === null || b === null) continue;
        checked++; if (a < b - 1e-9) return false; if (a > b + 1e-9) strict = true;
        continue;
      }
      const metrics = row.data?.preferenceMetrics, baselineMetrics = original.data?.preferenceMetrics;
      if (Object.hasOwn(row.data || {}, 'preferenceMetrics') || Object.hasOwn(original.data || {}, 'preferenceMetrics')) {
        if (!Array.isArray(metrics) || !Array.isArray(baselineMetrics)) return false;
        const baselineByName = new Map(baselineMetrics.map(metric => [metric.name, metric]));
        for (const metric of metrics) {
          const before = baselineByName.get(metric.name);
          if (!before || !Number.isFinite(metric.value) || !Number.isFinite(before.value) || metric.direction !== before.direction) return false;
          checked++;
          const delta = metric.direction === 'maximize' ? metric.value - before.value : before.value - metric.value;
          if (delta < -1e-9) return false;
          if (delta > 1e-9) strict = true;
        }
      } else if (Number.isFinite(row.objective) && Number.isFinite(original.objective) && row.direction === original.direction) {
        checked++;
        const delta = row.direction === 'maximize' ? row.objective - original.objective : original.objective - row.objective;
        if (delta < -1e-9) return false; if (delta > 1e-9) strict = true;
      }
    }
    return checked > 0 && strict;
  };
  const dominatingCandidates = conciseRanked.filter(entry => entry.candidateId !== fallbackCandidateId && dominates(byId.get(entry.candidateId), fallback));
  // Preference evidence may select an alternative only relative to a valid
  // AZIZ survivor. A missing/rejected baseline is not permission to promote a
  // candidate that AZIZ rejected (or never considered eligible).
  const selectedCandidateId = dominatingCandidates[0]?.candidateId ?? fallbackCandidateId ?? null;
  const paretoFrontCandidateIds = conciseRanked.filter(candidate => !conciseRanked.some(other => other.candidateId !== candidate.candidateId && dominates(byId.get(other.candidateId), byId.get(candidate.candidateId)))).map(x => x.candidateId);
  return { ranked: conciseRanked, bestPreferenceCandidateId, selectedCandidateId,
    paretoFrontCandidateIds, selectionReason: !fallbackCandidateId ? 'no_aziz_baseline'
      : dominatingCandidates.length ? 'preference_dominates_aziz_baseline' : 'baseline_pareto_preserved',
    comparisons, activePreferenceCount: comparisons.length + new Set(entries.flatMap(e => e.evaluations.filter(x => x.status === 'PASS' || x.status === 'FAIL').map(x => x.id))).size };
}

/** Rank only candidates AZIZ accepted, and only use its selected survivor as
 * the fallback. This prevents preference ranking from resurrecting candidates
 * rejected for hard constraints, critical conflicts, or duplicate projections.
 */
export function rankAzizSurvivingPreferences(entries, aziz) {
  const survivorIds = new Set(Array.isArray(aziz?.candidatesSurvived)
    ? aziz.candidatesSurvived.filter(id => typeof id === 'string') : []);
  const entryIds = new Set(entries.map(entry => entry.candidateId));
  const survivingEntries = entries.filter(entry => survivorIds.has(entry.candidateId));
  const reportedWinner = aziz?.selectedCandidateId;
  const fallbackCandidateId = typeof reportedWinner === 'string'
    && survivorIds.has(reportedWinner) && entryIds.has(reportedWinner) ? reportedWinner : null;
  return { ...rankPreferenceCandidates(survivingEntries, fallbackCandidateId), fallbackCandidateId,
    survivingCandidateIds: survivingEntries.map(entry => entry.candidateId) };
}
