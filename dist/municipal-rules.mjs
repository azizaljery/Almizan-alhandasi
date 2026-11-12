// مطابقة أولية لـ«اشتراطات إنشاء المباني السكنية» (وزارة البلديات والإسكان، 1446هـ/2024م) على أرض العميل وتصميمه.
// وحدة نقية بلا DOM. مبدؤها:
//  * كل بند يحمل مصدره وصفحته والعبارة التي طوبق عليها، وحالته: verified (طوبق على نص الوثيقة) أو review (لم يُطابق أو المصادر متعارضة).
//  * بند review لا يُحكم به «مطابق/مخالف» أبدًا: يُعرض «يُراجع مع المكتب الهندسي» مع السبب.
//  * الحكم يُحسب من مستند التصميم الفعلي (لا من نية المولّد)، وبالأرقام: المطلوب كذا والموجود كذا.
//  * لا تُعرف أنظمة بناء القطعة من موقعها: هذه الاشتراطات العامة للوزارة، وأنظمة المخطط المعتمد والأمانة تتقدم عليها.
//
// كيف طوبقت البنود (جلسة 2026‑11‑12): قُرئ ملف الوزارة (نسخة يوليو 2024 على momah.gov.sa) آليًا؛ النص المستخرج مشوَّه الحروف بنمط ثابت
// (ج↔ع، سقوط اللام الأخيرة: «ال يق ع» = «لا يقل عن»، «ال تجيد ع» = «لا تزيد على»، «جلة املعاوري» = «جهة المجاورين»)؛
// الأرقام واضحة. كل بند verified يحمل العبارة كما قُرئت بعد ردّ الحروف، وما عضده من خبر صحفي إن وُجد.
// نسخة ديسمبر 2024 على balady.gov.sa لم تُقرأ (الموقع يمنع القراءة الآلية)، فقد تختلف في مواضع — مذكور في تنبيه البطاقة.
import { analyzeDoc } from './draw/digest.mjs';
import { ROOM_TYPES, CARPORT_STALL } from './draw/catalog.mjs';

export const SOURCE = Object.freeze({
  title: 'اشتراطات إنشاء المباني السكنية — وزارة البلديات والإسكان (قرار وزاري رقم 4500943139/1، 1446هـ/2024م)',
  url: 'https://momah.gov.sa/sites/default/files/2024-07/ashtratat%20a%27nsha%20almbany%20alsknyt%20almnshwrt%20%60ly%20mwq%60%20alwzart%20.pdf',
  edition: 'نسخة يوليو 2024 المنشورة على موقع الوزارة',
  checkedAt: '2026-11-12',
});
export const DISCLAIMER = 'هذه مطابقة أولية للاشتراطات العامة للوزارة؛ أنظمة البناء تختلف بحسب الأمانة والمخطط المعتمد لحيّك، والاعتماد للمكتب الهندسي والبلدية.';
export const SCOPE_NOTE = 'الوثيقة نفسها تنص (ص 6 وص 16) على الالتزام بأنظمة البناء والمخطط المعتمد لكل منطقة تخطيطية، وأن للأمانة تحديد نسب البناء لمناطق خاصة؛ والميزان لا يعرف نظام بناء قطعتك من موقعها على الخريطة.';
const VERIFIED = 'verified', REVIEW = 'review';
const src = (page, clause) => ({ url: SOURCE.url, page, clause });

/** جدول البنود. value: الأرقام المستعملة في الحساب. quote: العبارة التي طوبق عليها (بعد ردّ الحروف المشوّهة). */
export const RULES = Object.freeze([
  { id: 'floors', title: 'عدد الأدوار', text: 'الفيلا السكنية: دوران وملحق علوي كحد أقصى.', value: { maxFloors: 2, annex: 1 }, source: src(13, '3-1'), status: VERIFIED,
    quote: '«بحد أقصى دورين وملحق علوي»' },
  { id: 'coverage_ground', title: 'نسبة البناء في الدور الأرضي', text: 'نسبة البناء الإجمالية للدور الأرضي شاملة الملاحق لا تزيد على 75٪ من مساحة الأرض.', value: { max: 0.75 }, source: src(17, 'الاشتراطات الخاصة بالفلل، فقرة 1'), status: VERIFIED,
    quote: '«نسبة البناء الإجمالية للدور الأرضي شاملة الملاحق …» مع 75٪', corroboration: 'صحيفة الوطن 15 يوليو 2024: رفع نسبة البناء في الأرضي والأول بالفلل من 70٪ إلى 75٪.',
    note: 'تعريف الوثيقة (ص 8): لا يدخل في النسبة المناور والفناءات الداخلية المكشوفة ولا غرف الكهرباء.' },
  { id: 'coverage_first', title: 'نسبة البناء في الدور الأول', text: 'نسبة البناء بالدور الأول لا تزيد على 75٪ من مساحة الأرض.', value: { max: 0.75 }, source: src(17, 'الاشتراطات الخاصة بالفلل، فقرة 2'), status: VERIFIED,
    quote: '«نسبة البناء بالدور الأول لا تزيد على 75٪»' },
  { id: 'annex_ratio', title: 'الملحق العلوي', text: 'نسبة البناء بالملحق العلوي لا تزيد على 70٪ من مساحة الدور الذي تحته.', value: { max: 0.70 }, source: src(17, 'الاشتراطات الخاصة بالفلل، فقرة 3'), status: VERIFIED,
    quote: '«نسبة البناء بالملحق العلوي لا تزيد على 70٪»' },
  { id: 'setback_front', title: 'الارتداد الأمامي (جهة الشارع الرئيسي)', text: 'في الشوارع الأقل من 30 م: خُمس عرض الشارع ولا يقل عن 3 م. في الشوارع 30 م فأكثر: لا يقل عن 6 م.', value: { fraction: 0.2, min: 3, wide: 30, wideMin: 6 }, source: src(17, 'الاشتراطات الخاصة بالفلل، فقرتان 4 و5'), status: VERIFIED,
    quote: '«في الشوارع التي يقل عرضها عن 30 مترًا الارتداد الأمامي للمبنى خُمس عرض الشارع ولا يقل عن 3م» و«في الشوارع التي عرضها 30 مترًا أو أكثر لا يقل الارتداد الأمامي للمبنى عن 6م»',
    note: 'الدراسة السابقة للميزان قرأت «لا يزيد على 6 م»؛ النص «لا يقل عن 6 م» (وهو خُمس 30 م).' },
  { id: 'setback_street', title: 'الارتداد جهة الشوارع الجانبية والخلفية', text: 'خُمس عرض الشارع ولا يقل عن 2 م.', value: { fraction: 0.2, min: 2 }, source: src(17, 'الاشتراطات الخاصة بالفلل، فقرة 4'), status: VERIFIED,
    quote: '«والارتداد للشوارع الخلفية والجانبية خُمس عرض الشارع، ولا يقل عن 2م»' },
  { id: 'setback_neighbor', title: 'الارتداد جهة المجاورين', text: 'الارتداد جهة المجاورين وممرات المشاة لا يقل عن 1.5 م.', value: { min: 1.5 }, source: src(17, 'الاشتراطات الخاصة بالفلل، فقرة 4'), status: VERIFIED,
    quote: '«والارتداد جهة المجاورين وممرات المشاة لا يقل عن 1.5م»', corroboration: 'صحيفة الوطن 15 يوليو 2024: تقليص الارتداد جهة المجاورين بالفلل من 2 م إلى 1.5 م.',
    note: 'هذا يحسم تعارض الدراسة السابقة: 2 م للشوارع الجانبية والخلفية، و1.5 م جهة الجار.' },
  // البندان التاليان مرجعان يشرحان حكم الارتدادات (لا يُعدّان بندين مستقلين في المطابقة حتى لا يُحسب العيب نفسه مرتين)
  { id: 'setback_upper', info: true, title: 'الدور الأول داخل الارتداد', text: 'لا يُسمح بالبناء في مساحة الحد الأدنى للارتداد النظامي للدور الأول والملحق العلوي.', value: {}, source: src(18, 'الاشتراطات الخاصة بالفلل، فقرة 7'), status: VERIFIED,
    quote: '«لا يسمح [ب]البناء في مساحة الحد الأدنى …» للدور الأول والملحق العلوي' },
  { id: 'setback_ground_build', info: true, title: 'البناء في ارتداد الدور الأرضي', text: 'يُسمح بالبناء في ارتدادات الدور الأرضي بحد أقصى 70٪ من طول محيط القطعة وبارتفاع لا يزيد على 4.5 م، بشروط.', value: { perimeter: 0.7, height: 4.5 }, source: src(19, 'الاشتراطات الخاصة بالفلل، فقرة 8'), status: REVIEW,
    reason: 'قُرئ الحدّان (70٪ من المحيط، 4.5 م) لكن شروط الفقرة لم تُقرأ كاملة من النص المستخرج.' },
  { id: 'annex_setback', title: 'ارتداد الملحق العلوي', text: 'يرتد الملحق العلوي عن حد الدور الذي تحته من جهة الشوارع.', value: { min: 1.5 }, source: src(18, 'الاشتراطات الخاصة بالفلل، فقرة 6'), status: REVIEW,
    reason: 'النص المستخرج لم يُظهر الرقم بوضوح، والخبر الصحفي يذكر خُمس عرض الشارع للشارع الرئيسي و1.5 م للجانبية: مصدران غير متطابقين.' },
  { id: 'height', title: 'الارتفاع الأقصى', text: 'الحد الأقصى لارتفاع الفلل السكنية 14 م من منسوب منتصف الرصيف أمام مدخل المبنى إلى سطح الملحق العلوي.', value: { max: 14 }, source: src(25, '5-1-5 فقرة 3'), status: VERIFIED,
    quote: '«الحد الأقصى لارتفاع الفلل السكنية 14 متر من منسوب منتصف الرصيف أمام مدخل المبنى»', corroboration: 'صحيفة الوطن 15 يوليو 2024: زيادة الحد الأقصى لارتفاع الفلل من 12 إلى 14 مترًا.' },
  { id: 'ground_level', title: 'منسوب أرضية الدور الأرضي', text: 'بين 0.30 م و1.20 م فوق منسوب منتصف الرصيف أمام مدخل المبنى.', value: { min: 0.30, max: 1.20 }, source: src(25, '5-1-5 فقرة 2'), status: VERIFIED,
    quote: '«الحد الأقصى لارتفاع أرضية الدور الأرضي السكني عن منسوب منتصف الرصيف أمام مدخل المبنى هو 1.20 م، ولا يقل الحد الأدنى له عن 30 سم»' },
  { id: 'roof_parapet', title: 'سترة السطح', text: 'ارتفاع سترة السطح بين 1.70 م و2.00 م؛ وسترة سطح الملحق العلوي بين 0.40 م و0.80 م.', value: { min: 1.70, max: 2.00, annexMin: 0.40, annexMax: 0.80 }, source: src(26, '5-1-5 فقرتان 5 و6'), status: VERIFIED,
    quote: '«الحد الأدنى لارتفاع سترة السطح (1.70م)، والحد الأعلى (2م)» و«الحد الأدنى لارتفاع سترة ملحق السطح (40سم) والحد الأعلى (80 سم)»',
    note: 'الدراسة السابقة ذكرت «سترة ≤ 0.80 م» فقط؛ ذاك حد سترة سطح الملحق، أما سترة السطح نفسه فـ1.70–2.00 م.' },
  { id: 'fence', title: 'السور', text: 'سور على حدود الملكية جهة المجاورين بارتفاع لا يزيد على 4.5 م.', value: { max: 4.5 }, source: src(17, 'الاشتراطات العامة، فقرة 8'), status: VERIFIED,
    quote: '«يلزم عمل أسوار بارتفاع لا يزيد على 4.5م على حدود الملكية جهة المجاورين بالمباني السكنية»' },
  { id: 'parking', title: 'مواقف السيارات', text: 'موقف سيارة داخل حدود الملكية للفيلا على أرض مساحتها 400 م² فأقل، وموقفان إن زادت على 400 م².', value: { area: 400, small: 1, large: 2 }, source: src(21, 'الاشتراطات الخاصة بالفلل، فقرة 14'), status: VERIFIED,
    quote: '«توفير موقف سيارة داخل حدود الملكية لكل فيلا تقع على أرض مساحتها 400م2 فأقل، وموقفين للسيارات للفلل التي تقع على أرض مساحتها تزيد على 400 م2»', corroboration: 'صحيفة الوطن 15 يوليو 2024 بالصيغة نفسها.' },
  { id: 'entry_ped', title: 'مدخل المشاة', text: 'الحد الأدنى لعرض المدخل في الفلل الخاصة 0.80 م.', value: { min: 0.80 }, source: src(27, '7-1-5 فقرة 2'), status: VERIFIED,
    quote: '«الحد الأدنى لعرض المدخل في الفلل الخاصة (0.80م) وفق متطلبات الكود السعودي السكني SBC 1101»' },
  { id: 'entry_car', title: 'مدخل السيارات', text: 'الحد الأدنى لعرض مدخل السيارات 3 م للفلل السكنية.', value: { min: 3 }, source: src(27, '7-1-5 فقرة 4'), status: VERIFIED,
    quote: '«الحد الأدنى لعرض مدخل السيارات 3م للفلل السكنية»' },
  { id: 'rooms', title: 'أدنى مساحات وعروض الفراغات', text: 'المجلس أو الطعام أو الصالة 11.2 م² وعرض 2.8 م؛ غرف النوم 6.5 م² وعرض 2.1 م؛ المطبخ 5 م² وعرض 1.8 م؛ الحمام 2.8 م² وعرض 1.4 م؛ دورة المياه (المرحاض) 1.5 م² وعرض 1 م؛ غرفة الحراسة أو السائق أو العاملة المنزلية 6.5 م² وعرض 2.1 م (غير شاملة للحمام).',
    value: { living: { area: 11.2, width: 2.8 }, bedroom: { area: 6.5, width: 2.1 }, kitchen: { area: 5, width: 1.8 }, bath: { area: 2.8, width: 1.4 }, wc: { area: 1.5, width: 1 }, staff: { area: 6.5, width: 2.1 } }, source: src(25, 'جدول 4-1-5'), status: VERIFIED,
    quote: 'صفوف الجدول كما قُرئت: «غرف المجلس أو الطعام أو الصالة 11.2 / 2.8»، «غرف النوم 6.5 / 2.1»، «المطبخ 5 / 1.8»، «الحمام 2.8 / 1.4»، «دورة المياه (المرحاض) 1.5 / 1»، «غرفة الحراسة أو غرفة السائق أو غرفة العاملة المنزلية (غير شاملة للحمام) 6.5 / 2.1»' },
  { id: 'corridor', title: 'الممرات الداخلية', text: 'الحد الأدنى لعرض الممرات الداخلية 0.90 م.', value: { min: 0.90 }, source: src(25, 'جدول 4-1-5'), status: VERIFIED, quote: '«الممرات الداخلية — 0.90»' },
  { id: 'stair', title: 'الدرج', text: 'الحد الأدنى لصافي عرض الدرج الرئيسي والبسطة 0.9 م في الفلل.', value: { min: 0.9 }, source: src(30, '12-1-5 فقرة 2'), status: VERIFIED, quote: '«الحد الأدنى لصافي عرض الدرج الرئيسي والبسطة 0.9م»' },
]);
export const ruleById = id => RULES.find(r => r.id === id) || null;

// ------------------------------------------------------------------------------------------ أدوات
const SIDES = ['n', 's', 'e', 'w'];
export const SIDE_AR = Object.freeze({ n: 'الشمالي', s: 'الجنوبي', e: 'الشرقي', w: 'الغربي' });
const SIDE_NAME = { n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب' }, SIDE_ADJ = { n: 'شمالي', s: 'جنوبي', e: 'شرقي', w: 'غربي' };
const OUT = { n: { x: 0, y: 1 }, s: { x: 0, y: -1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
const f = v => (Number.isFinite(v) ? String(r2(v)) : '—');
const pct = v => `${r1(v * 100)}٪`;
const TOL = 0.011; // سنتيمتر واحد: هامش تقريب القياس، لا تسامح نظامي
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** عروض الشوارع كما أدخلها العميل: { s: 15 } (م). تُهمل القيم غير الصالحة. */
export function normalizeStreetWidths(raw, streets = SIDES) {
  const out = {};
  for (const s of SIDES) { const v = Number(raw?.[s]); if (streets.includes(s) && Number.isFinite(v) && v >= 4 && v <= 120) out[s] = r2(v); }
  return out;
}

/**
 * الارتداد النظامي لكل ضلع بحسب وضع الأرض: الواجهة (جهة المدخل الأول) شارع رئيسي، بقية الشوارع جانبية/خلفية، والباقي مجاورون.
 * بلا عرض شارع: يُحسب بالحد الأدنى ويُعلَّم exact:false («أدخل عرض الشارع للدقة»).
 * يعيد { front, sides: { n: { kind, width, required, exact, basis, max } } } — max: أقصى ما قد يبلغه المطلوب إن جُهل العرض.
 */
export function requiredSetbacks(land = {}) {
  const streets = (land.streets || []).filter(s => SIDES.includes(s)), front = (land.entries || []).find(s => streets.includes(s)) || streets[0] || null;
  const widths = normalizeStreetWidths(land.streetWidths, streets), F = ruleById('setback_front').value, S = ruleById('setback_street').value, N = ruleById('setback_neighbor').value;
  const sides = {};
  for (const s of SIDES) {
    const w = widths[s] ?? null;
    if (s === front) {
      if (w === null) sides[s] = { kind: 'front', width: null, required: F.min, exact: false, max: F.wideMin, basis: `الحد الأدنى ${F.min} م (لم يُدخل عرض الشارع؛ قد يبلغ ${F.wideMin} م)` };
      else if (w >= F.wide) sides[s] = { kind: 'front', width: w, required: F.wideMin, exact: true, max: F.wideMin, basis: `شارع ${f(w)} م (30 م فأكثر) ← لا يقل عن ${F.wideMin} م` };
      else { const q = r2(Math.max(F.min, w * F.fraction)); sides[s] = { kind: 'front', width: w, required: q, exact: true, max: q, basis: `خُمس عرض الشارع ${f(w)} م = ${f(w * F.fraction)} م${w * F.fraction < F.min ? `، والحد الأدنى ${F.min} م` : ''}` }; }
    } else if (streets.includes(s)) {
      if (w === null) sides[s] = { kind: 'street', width: null, required: S.min, exact: false, max: F.wideMin, basis: `الحد الأدنى ${S.min} م لشارع جانبي/خلفي (لم يُدخل عرض الشارع)` };
      else { const q = r2(Math.max(S.min, w * S.fraction)); sides[s] = { kind: 'street', width: w, required: q, exact: w < F.wide, max: q, basis: `خُمس عرض الشارع ${f(w)} م = ${f(w * S.fraction)} م${w * S.fraction < S.min ? `، والحد الأدنى ${S.min} م` : ''}${w >= F.wide ? ' (النص يذكر الشوارع الأقل من 30 م؛ يُراجع للأعرض)' : ''}` }; }
    } else sides[s] = { kind: 'neighbor', width: null, required: N.min, exact: true, max: N.min, basis: `جهة مجاور ← ${N.min} م` };
  }
  return { front, sides };
}

/**
 * حدود البناء النظامية لهذه الأرض — **المصدر الوحيد** الذي يأخذ منه المولّد وسلّم الاتساع والبطاقة (لا تُكرَّر الأرقام في مكان آخر).
 * الارتداد يُقاس إلى **وجه المبنى الخارجي**: face مستطيل الوجه الخارجي المسموح (بعد الارتدادات ثم سقف نسبة البناء)،
 * و axis مستطيل محاور الجدران الخارجية = face مُزاحًا للداخل نصف سماكة الجدار (wallT/2) من كل جهة.
 * يعيد { front, sides, sb: { n, s, e, w } (الارتداد النظامي لكل ضلع)، face, axis, half, coverage, area }.
 */
export function buildEnvelope(land = {}, { wallT = 0 } = {}) {
  const W = Number(land.width), L = Number(land.length), { front, sides } = requiredSetbacks(land);
  const sb = Object.fromEntries(SIDES.map(s => [s, sides[s].required])), cov = ruleById('coverage_ground').value.max;
  const w = Math.max(0, W - sb.w - sb.e), h = Math.max(0, L - sb.n - sb.s), area = Math.min(w * h, W * L * cov), k = w * h > 0 ? Math.sqrt(area / (w * h)) : 0;
  const face = { x: sb.w + (w - w * k) / 2, y: sb.s + (h - h * k) / 2, w: w * k, h: h * k }, half = Math.max(0, wallT) / 2;
  const axis = { x: face.x + half, y: face.y + half, w: Math.max(0, face.w - 2 * half), h: Math.max(0, face.h - 2 * half) };
  return { front, sides, sb, face, axis, half, coverage: cov, area };
}

/**
 * «حسب وضع أرضك»: ما تعنيه الاشتراطات العامة لهذه الأرض بالأرقام.
 * يعيد { ok, width, length, area, front, sides, buildable: { x, y, w, d, area }, coverage: { max, area }, footprintMax, parking, floors, lines[], flags[] }.
 * lines: جمل بلغة بسيطة بالترتيب (تُعرض كما هي). لا يحكم على تصميم؛ يصف حدود الأرض فقط.
 */
export function landBrief(land = {}) {
  const W = Number(land.width), L = Number(land.length), streets = (land.streets || []).filter(s => SIDES.includes(s));
  if (!(W > 0 && L > 0) || !streets.length) return { ok: false, lines: [], flags: [] };
  const { front, sides } = requiredSetbacks(land), area = r2(W * L);
  const bw = r2(Math.max(0, W - sides.w.required - sides.e.required)), bd = r2(Math.max(0, L - sides.n.required - sides.s.required));
  const cov = ruleById('coverage_ground').value.max, capArea = r2(area * cov), env = r2(bw * bd), footprintMax = r2(Math.min(env, capArea));
  const P = ruleById('parking').value, parking = area <= P.area ? P.small : P.large;
  const streetText = streets.map(s => `${SIDE_ADJ[s]}${sides[s].width ? ` عرضه ${f(sides[s].width)} م` : ''}${s === front && streets.length > 1 ? ' (الواجهة)' : ''}`).join('، و');
  const others = SIDES.filter(s => s !== front);
  const lines = [
    `أرضك ${f(W)} × ${f(L)} م = ${f(area)} م² على ${streets.length === 1 ? 'شارع' : streets.length === 2 ? 'شارعين:' : 'ثلاثة شوارع أو أكثر:'} ${streetText}.`,
    `الارتداد الأمامي (${SIDE_NAME[front]}): ${f(sides[front].required)} م — ${sides[front].basis}.`,
    ...others.map(s => `الضلع ${SIDE_AR[s]}: ${f(sides[s].required)} م — ${sides[s].basis}.`),
    `المسطح القابل للبناء بعد الارتدادات: ${f(bw)} × ${f(bd)} م = ${f(env)} م².`,
    `أقصى مسقط للدور الأرضي ${pct(cov)} من الأرض = ${f(capArea)} م²${env < capArea ? `؛ لكن الارتدادات تحدّه عند ${f(env)} م² (${pct(env / area)} من الأرض)` : `، وهو أقل من مسطح الارتدادات فهو الحاكم`}. الدور الأول كذلك لا يزيد على ${pct(cov)}.`,
    `الارتفاع: دوران وملحق علوي كحد أقصى، ولا يزيد على 14 م من منسوب الرصيف.`,
    `المواقف: ${parking === 1 ? 'موقف واحد' : 'موقفان'} داخل حدود الأرض (${area <= P.area ? 'مساحتها 400 م² فأقل' : 'مساحتها تزيد على 400 م²'}).`,
  ];
  const flags = [];
  if (SIDES.some(s => streets.includes(s) && !sides[s].exact && sides[s].width === null)) flags.push('أدخل عرض الشارع للدقة: حُسب الارتداد جهة الشارع بالحد الأدنى، وقد يزيد إن كان الشارع أعرض من 15 م.');
  if (bw < 4 || bd < 4) flags.push('المسطح القابل للبناء ضيق جدًا بهذه الارتدادات؛ راجع أبعاد الأرض وعروض الشوارع مع المكتب الهندسي.');
  return { ok: true, width: W, length: L, area, front, sides, streets, buildable: { x: sides.w.required, y: sides.s.required, w: bw, d: bd, area: env }, coverage: { max: cov, area: capArea }, footprintMax, parking, lines, flags };
}

/** رسم مصغّر (SVG) للأرض: الشوارع، حدود البناء المسموحة، والارتدادات بأبعادها. نص آمن (أرقام وتسميات ثابتة فقط). */
export function landBriefSvg(brief, { north = 0 } = {}) {
  if (!brief?.ok) return '';
  const box = 300, pad = 52, k = (box - pad * 2) / Math.max(brief.width, brief.length), w = brief.width * k, h = brief.length * k, x = (box - w) / 2, y = (box - h) / 2;
  const b = brief.buildable, bx = x + b.x * k, by = y + (brief.length - b.y - b.d) * k, bw = b.w * k, bh = b.d * k, S = brief.sides;
  const street = { n: [x - 8, y - 22, w + 16, 12], s: [x - 8, y + h + 10, w + 16, 12], e: [x + w + 10, y - 8, 12, h + 16], w: [x - 22, y - 8, 12, h + 16] };
  const dim = (x1, y1, x2, y2, t, tx, ty) => `<line class="mb-dim" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text class="mb-num" x="${tx}" y="${ty}" text-anchor="middle">${t}</text>`;
  const cx = x + w / 2, cy = y + h / 2;
  const parts = [
    `<rect class="mb-plot" x="${x}" y="${y}" width="${w}" height="${h}"/>`,
    ...brief.streets.map(s => `<rect class="mb-street" x="${street[s][0]}" y="${street[s][1]}" width="${street[s][2]}" height="${street[s][3]}" rx="3"/>`),
    bw > 0 && bh > 0 ? `<rect class="mb-build" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>` : '',
    bw > 0 && bh > 0 ? `<text class="mb-big" x="${bx + bw / 2}" y="${by + bh / 2 - 2}" text-anchor="middle">${f(b.w)} × ${f(b.d)} م</text><text class="mb-sub" x="${bx + bw / 2}" y="${by + bh / 2 + 13}" text-anchor="middle">حدّ البناء ${f(b.area)} م²</text>` : '',
    dim(cx, y, cx, by, f(S.n.required), cx + 14, (y + by) / 2 + 4), dim(cx, by + bh, cx, y + h, f(S.s.required), cx + 14, (by + bh + y + h) / 2 + 4),
    dim(x, cy, bx, cy, f(S.w.required), (x + bx) / 2, cy - 5), dim(bx + bw, cy, x + w, cy, f(S.e.required), (bx + bw + x + w) / 2, cy - 5),
    `<text class="mb-lab" x="${box / 2}" y="${y - 28}" text-anchor="middle">شمال${brief.streets.includes('n') ? ' · شارع' : ' · جار'}</text>`,
    `<text class="mb-lab" x="${box / 2}" y="${y + h + 36}" text-anchor="middle">جنوب${brief.streets.includes('s') ? ' · شارع' : ' · جار'}</text>`,
    `<text class="mb-lab" x="${x + w + 28}" y="${cy}" text-anchor="middle" transform="rotate(90 ${x + w + 28} ${cy})">شرق${brief.streets.includes('e') ? ' · شارع' : ' · جار'}</text>`,
    `<text class="mb-lab" x="${x - 28}" y="${cy}" text-anchor="middle" transform="rotate(-90 ${x - 28} ${cy})">غرب${brief.streets.includes('w') ? ' · شارع' : ' · جار'}</text>`,
    `<g class="mb-north" transform="translate(${box - 24} 26) rotate(${-r1(north)})"><path d="M0 -14 L6 8 L0 4 L-6 8 Z"/><text x="0" y="-17" text-anchor="middle">ش</text></g>`,
  ];
  return `<svg viewBox="0 0 ${box} ${box}" role="img" aria-label="رسم الأرض وحدود البناء المسموحة والارتدادات">${parts.join('')}</svg>`;
}

// ------------------------------------------------------------------------------------------ المطابقة على التصميم
const dot = (a, b) => a.x * b.x + a.y * b.y;
function plotEdges(doc, land) {
  const poly = doc.plot?.polygon;
  if (poly?.length >= 3) {
    let A = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; A += p.x * q.y - q.x * p.y; }
    const pts = A < 0 ? [...poly].reverse() : poly;
    return { area: Math.abs(A) / 2, edges: pts.map((a, i) => { const b = pts[(i + 1) % pts.length], d = Math.hypot(b.x - a.x, b.y - a.y) || 1, u = { x: (b.x - a.x) / d, y: (b.y - a.y) / d }, out = { x: u.y, y: -u.x }; return { a, b, out, side: SIDES.reduce((m, s) => (dot(OUT[s], out) > dot(OUT[m], out) ? s : m), 'n') }; }) };
  }
  const W = Number(land?.width), L = Number(land?.length); if (!(W > 0 && L > 0)) return null;
  const c = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: L }, { x: 0, y: L }];
  return { area: W * L, edges: c.map((a, i) => { const b = c[(i + 1) % 4], d = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / d, y: (b.y - a.y) / d }, out = { x: u.y, y: -u.x }; return { a, b, out, side: ['s', 'e', 'n', 'w'][i] }; }) };
}
/** الارتداد الفعلي لكل ضلع ولكل دور: أقرب وجه خارجي لجدار (لا الأسوار) إلى حد الأرض. */
function actualSetbacks(doc, edges) {
  const out = {};
  for (const lv of doc.levels) {
    const walls = doc.walls.filter(w => w.level === lv.id && (w.kind || 'wall') === 'wall'); if (!walls.length) continue;
    const row = {};
    for (const e of edges) {
      let best = Infinity, axis = Infinity;
      for (const w of walls) {
        const d = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, u = { x: (w.b.x - w.a.x) / d, y: (w.b.y - w.a.y) / d }, half = (w.t || 0.2) / 2 * Math.sqrt(Math.max(0, 1 - dot(u, e.out) ** 2));
        for (const p of [w.a, w.b]) { const c = dot({ x: e.a.x - p.x, y: e.a.y - p.y }, e.out); axis = Math.min(axis, c); best = Math.min(best, c - half); }
      }
      const prev = row[e.side]; if (!prev || best < prev.face) row[e.side] = { face: r2(Math.max(0, best)), axis: r2(Math.max(0, axis)) };
    }
    out[lv.id] = row;
  }
  return out;
}
const item = (rule, verdict, extra = {}) => ({ id: rule.id, title: rule.title, verdict, ruleStatus: rule.status, rule: rule.text, source: rule.source, quote: rule.quote || null, reason: rule.reason || null, ...extra });
export const VERDICT_AR = Object.freeze({ ok: 'مطابق', fail: 'مخالف', review: 'يُراجع مع المكتب الهندسي', na: 'لا ينطبق' });

/**
 * مطابقة التصميم المعروض على البنود. land: أرض الجلسة (الأبعاد، الشوارع، المداخل، streetWidths اختياري).
 * يعيد { items[], summary: { ok, review, fail, na }, setbacks, disclaimer, source }.
 * كل بند: { id, title, verdict: ok|fail|review|na, required, actual, text (جملة بالأرقام), why?, ruleStatus, source, quote }.
 * بند حالته review لا يُحكم به ok/fail أبدًا.
 */
export function checkMunicipal(doc, land = {}) {
  const L = { ...land, streets: land.streets?.length ? land.streets : doc.streets || [], entries: land.entries?.length ? land.entries : doc.entries || (doc.entry ? [doc.entry] : []) };
  const model = analyzeDoc(doc), P = plotEdges(doc, L), items = [];
  const push = (id, verdict, extra) => { const rule = ruleById(id); items.push(item(rule, rule.status === REVIEW && (verdict === 'ok' || verdict === 'fail') ? 'review' : verdict, extra)); };
  const plotArea = P?.area || null;
  const levelArea = lv => { const o = lv.analysis.outlines.reduce((s, x) => s + x.area, 0), open = lv.rooms.filter(r => ROOM_TYPES[r.type]?.open).reduce((s, r) => s + (r.space?.grossArea ?? r.area), 0); return Math.max(0, o - open); };
  const built = model.levels.filter(lv => lv.walls.some(w => (w.kind || 'wall') === 'wall'));

  // عدد الأدوار
  { const n = built.length, max = ruleById('floors').value.maxFloors; push('floors', n <= max ? 'ok' : n === max + 1 ? 'review' : 'fail', { required: `${max} + ملحق`, actual: n, text: n <= max ? `في التصميم ${n === 1 ? 'دور واحد' : 'دوران'}؛ المسموح دوران وملحق علوي.` : n === max + 1 ? 'في التصميم ثلاثة مستويات؛ الثالث يُقبل إن كان ملحقًا علويًا بنسبته وارتداده.' : `في التصميم ${n} مستويات؛ المسموح دوران وملحق علوي.` }); }

  // نسب البناء
  const covText = (name, a, max) => `مسقط ${name} ${f(a)} م² ÷ مساحة الأرض ${f(plotArea)} م² = ${pct(a / plotArea)}؛ الحد ${pct(max)}.`;
  if (!plotArea || !built.length) { push('coverage_ground', 'review', { text: 'حدود الأرض غير مرسومة في المخطط فلم تُحسب النسبة.' }); }
  else {
    const g = levelArea(built[0]), max = ruleById('coverage_ground').value.max;
    push('coverage_ground', g / plotArea <= max + 1e-4 ? 'ok' : 'fail', { required: max, actual: r2(g / plotArea), text: covText('الدور الأرضي', g, max) + ' (بلا الفناءات المكشوفة؛ الملاحق والمظلات غير المرسومة لا تدخل).' });
    if (built[1]) { const a = levelArea(built[1]), m1 = ruleById('coverage_first').value.max; push('coverage_first', a / plotArea <= m1 + 1e-4 ? 'ok' : 'fail', { required: m1, actual: r2(a / plotArea), text: covText('الدور الأول', a, m1) }); }
    else push('coverage_first', 'na', { text: 'التصميم دور واحد.' });
    if (built[2]) { const a = levelArea(built[2]), below = levelArea(built[1]), m2 = ruleById('annex_ratio').value.max; push('annex_ratio', below > 0 && a / below <= m2 + 1e-4 ? 'ok' : 'fail', { required: m2, actual: below > 0 ? r2(a / below) : null, text: `الملحق ${f(a)} م² ÷ الدور تحته ${f(below)} م² = ${below > 0 ? pct(a / below) : '—'}؛ الحد ${pct(m2)}.` }); push('annex_setback', 'review', { text: 'في التصميم مستوى ثالث؛ ارتداده عن حد الدور تحته من جهة الشوارع يُراجع.' }); }
    else { push('annex_ratio', 'na', { text: 'لا ملحق علوي في التصميم.' }); push('annex_setback', 'na', { text: 'لا ملحق علوي في التصميم.' }); }
  }

  // الارتدادات: لكل ضلع بحسب نوعه؛ الدور الأول حكم، والأرضي داخل الارتداد «يُراجع» (مسموح بشروط)
  const need = requiredSetbacks(L), setbacks = [];
  if (!P || !built.length || !L.streets.length) {
    for (const id of ['setback_front', 'setback_street', 'setback_neighbor']) push(id, 'review', { text: 'حدود الأرض أو شوارعها غير معروفة في هذا المخطط فلم تُقس الارتدادات.' });
  } else {
    const act = actualSetbacks(doc, P.edges), groundId = built[0].level.id, upperIds = built.slice(1).map(l => l.level.id);
    const bySide = {};
    for (const s of SIDES) {
      const n = need.sides[s], g = act[groundId]?.[s] || null, ups = upperIds.map(id => act[id]?.[s]).filter(Boolean), u = ups.length ? ups.reduce((m, x) => (x.face < m.face ? x : m)) : null;
      if (!g) continue;
      const judge = a => (a.face >= n.max - TOL ? 'ok' : a.face < n.required - TOL ? 'fail' : n.exact ? 'ok' : 'unknown');
      const jg = judge(g), ju = u ? judge(u) : null;
      let verdict = 'ok', why = '';
      if (ju === 'fail') { verdict = 'fail'; why = `الدور الأول يبعد ${f(u.face)} م عن الحد والمطلوب ${f(n.required)} م (أقل بـ${Math.round((n.required - u.face) * 100)} سم)`; }
      else if (jg === 'fail') { verdict = 'review'; why = `الدور الأرضي يبعد ${f(g.face)} م عن الحد والمطلوب ${f(n.required)} م (أقل بـ${Math.round((n.required - g.face) * 100)} سم)`; }
      else if (jg === 'unknown' || ju === 'unknown') { verdict = 'review'; why = `الموجود ${f((u && u.face < g.face ? u : g).face)} م يحقق الحد الأدنى ${f(n.required)} م، لكن المطلوب قد يزيد حتى ${f(n.max)} م بحسب عرض الشارع — أدخل عرض الشارع للدقة`; }
      // الأرضي وحده داخل الارتداد: الفقرة 8 تسمح به بشروط ← يُراجع لا «مخالف»
      const low = u && u.face < g.face ? u : g, halfWall = low.axis - low.face;
      if ((verdict === 'fail' || jg === 'fail') && halfWall > 0.02 && low.axis >= n.required - TOL) why += `؛ محور الجدار الخارجي على ${f(low.axis)} م، والفرق نصف سماكة الجدار (${Math.round(halfWall * 100)} سم) لأن الارتداد يُقاس إلى وجه المبنى`;
      if (jg === 'fail' && ju !== 'fail') why += '؛ البناء في ارتداد الدور الأرضي مسموح بشروط (70٪ من المحيط وبارتفاع 4.5 م) تُراجع مع المكتب';
      const row = { side: s, kind: n.kind, width: n.width, required: n.required, exact: n.exact, basis: n.basis, ground: g.face, upper: u ? u.face : null, axis: low.axis, verdict, why };
      setbacks.push(row); bySide[s] = row;
    }
    const group = (id, kind, label) => {
      const rows = setbacks.filter(r => r.kind === kind); if (!rows.length) { push(id, 'na', { text: kind === 'street' ? 'لا شوارع جانبية أو خلفية لهذه الأرض.' : kind === 'neighbor' ? 'كل أضلاع الأرض على شوارع.' : 'لم تُحدَّد واجهة.' }); return; }
      const worst = rows.some(r => r.verdict === 'fail') ? 'fail' : rows.some(r => r.verdict === 'review') ? 'review' : 'ok';
      const text = rows.map(r => `${label(r)}: المطلوب ${f(r.required)} م${r.exact ? '' : ' على الأقل'} والموجود ${f(r.upper !== null ? Math.min(r.ground, r.upper) : r.ground)} م${r.why ? ' — ' + r.why : ''}`).join('؛ ') + '.';
      push(id, worst, { required: Math.max(...rows.map(r => r.required)), actual: Math.min(...rows.map(r => (r.upper !== null ? Math.min(r.ground, r.upper) : r.ground))), text, rows, ...(rows.some(r => !r.exact && r.width === null) ? { hint: 'أدخل عرض الشارع للدقة' } : {}) });
    };
    group('setback_front', 'front', r => `الواجهة ${SIDE_AR[r.side].replace(/ي$/, 'ية')}${r.width ? ` (شارع ${f(r.width)} م)` : ''}`);
    group('setback_street', 'street', r => `الضلع ${SIDE_AR[r.side]}${r.width ? ` (شارع ${f(r.width)} م)` : ' (شارع)'}`);
    group('setback_neighbor', 'neighbor', r => `الضلع ${SIDE_AR[r.side]} (جار)`);
  }

  // الارتفاع ومنسوب الأرضي وسترة السطح: من ارتفاعات الأدوار في المستند
  {
    let acc = 0, top = 0; for (const [i, l] of doc.levels.entries()) { const E = Number.isFinite(l.elevation) && (i === 0 || l.elevation > 0) ? l.elevation : acc, H0 = l.height || 3.2; acc = E + H0; if (built.some(b => b.level.id === l.id)) top = Math.max(top, acc); }
    const G = ruleById('ground_level').value, H = ruleById('height').value.max, lo = top + G.min, hi = top + G.max;
    push('height', hi <= H + TOL ? 'ok' : lo > H + TOL ? 'fail' : 'review', { required: H, actual: r2(top), text: `ارتفاع الأدوار المرسومة ${f(top)} م فوق أرضية الدور الأرضي؛ مع منسوب الأرضي النظامي (${f(G.min)}–${f(G.max)} م فوق الرصيف) يكون ${f(lo)}–${f(hi)} م من الرصيف، والحد ${H} م.` });
    push('ground_level', 'review', { required: `${f(G.min)}–${f(G.max)}`, actual: null, text: `منسوب أرضية الدور الأرضي عن الرصيف لا يُعرف من المسقط؛ المطلوب بين ${f(G.min)} و${f(G.max)} م، ويحدَّد بالرفع المساحي.` });
    const R = ruleById('roof_parapet').value, p = num(doc.roof?.parapet) ?? 0.9, given = num(doc.roof?.parapet) !== null;
    push('roof_parapet', p >= R.min - TOL && p <= R.max + TOL ? 'ok' : 'fail', { required: `${f(R.min)}–${f(R.max)}`, actual: p, text: `سترة السطح في مجسم التصميم ${f(p)} م${given ? '' : ' (القيمة الافتراضية للمجسم)'}، والمطلوب بين ${f(R.min)} و${f(R.max)} م${p < R.min ? ` (أقل بـ${Math.round((R.min - p) * 100)} سم)` : ''}.` });
  }

  // السور
  { const fences = doc.walls.filter(w => w.kind === 'fence'), max = ruleById('fence').value.max, hs = fences.map(w => num(w.h)).filter(v => v !== null), top = hs.length ? Math.max(...hs) : null;
    push('fence', !fences.length || top === null ? 'review' : top <= max + TOL ? 'ok' : 'fail', { required: max, actual: top, text: !fences.length ? `سور حدود الأرض غير مرسوم في المخطط؛ ارتفاعه لا يزيد على ${max} م.` : top === null ? `السور مرسوم بلا ارتفاع محدد؛ لا يزيد على ${max} م.` : `أعلى سور مرسوم ${f(top)} م؛ الحد ${max} م.` }); }

  // المواقف
  { const R = ruleById('parking').value, needN = plotArea ? (plotArea <= R.area + 1e-6 ? R.small : R.large) : null, ports = (doc.fixtures || []).filter(x => x.kind === 'carport'), garages = model.levels.flatMap(l => l.rooms.filter(r => r.type === 'garage'));
    const have = ports.reduce((s, x) => s + Math.max(1, Math.round((x.w || 0) * (x.d || 0) / (CARPORT_STALL.w * CARPORT_STALL.d))), 0) + garages.reduce((s, r) => s + Math.max(1, Math.floor(r.area / 15)), 0);
    if (needN === null) push('parking', 'review', { text: 'مساحة الأرض غير معروفة في المخطط.' });
    else if (!ports.length && !garages.length) push('parking', 'review', { required: needN, actual: 0, text: `المطلوب ${needN === 1 ? 'موقف واحد' : 'موقفان'} داخل حدود الأرض (مساحتها ${f(plotArea)} م²)، ولم يُرسم موقف أو مظلة سيارات في هذا التصميم؛ يُخصَّص في الارتداد الأمامي أو تُطلب مظلة من شرعاء.` });
    else push('parking', have >= needN ? 'ok' : 'fail', { required: needN, actual: have, text: `المطلوب ${needN === 1 ? 'موقف واحد' : 'موقفان'} (الأرض ${f(plotArea)} م²)، والمرسوم ${have === 1 ? 'موقف واحد' : have === 2 ? 'موقفان' : have + ' مواقف'} (${ports.length ? 'مظلة سيارات' : 'كراج'}؛ العدد من مساحة المظلة بمعدل ${CARPORT_STALL.w} × ${CARPORT_STALL.d} م للسيارة).` }); }

  // المداخل
  { const min = ruleById('entry_ped').value.min, es = doc.openings.filter(o => o.entry), w = es.length ? Math.min(...es.map(o => o.w)) : null;
    push('entry_ped', w === null ? 'review' : w >= min - TOL ? 'ok' : 'fail', { required: min, actual: w, text: w === null ? 'لا باب مدخل معلَّم في المخطط.' : `أضيق باب مدخل في التصميم ${f(w)} م؛ الحد الأدنى ${f(min)} م.` });
    push('entry_car', 'review', { required: ruleById('entry_car').value.min, actual: null, text: `بوابة السيارات على السور غير مرسومة في المخطط؛ عرضها لا يقل عن ${ruleById('entry_car').value.min} م.` }); }

  // الفراغات
  {
    const V = ruleById('rooms').value, bad = [], maybe = []; let n = 0;
    const cls = r => (['living', 'dining', 'majlis'].includes(r.type) ? ['living', 'المجلس/الطعام/الصالة'] : ['bedroom', 'master'].includes(r.type) ? ['bedroom', 'غرفة نوم'] : r.type === 'kitchen' && !/تحضيري/.test(r.name) ? ['kitchen', 'المطبخ'] : r.type === 'bath' ? ['bath', 'الحمام'] : r.type === 'service' && /خادم|سائق|عامل|حارس|حراس/.test(r.name) ? ['staff', 'غرفة العاملة/السائق'] : null);
    for (const lv of model.levels) for (const r of lv.rooms) {
      if (r.unlabelled) continue; const c = cls(r); if (!c) continue; n++;
      const need0 = V[c[0]], wd = Math.min(r.rect?.l || 0, r.rect?.w || 0), okA = r.area >= need0.area - 0.05, okW = wd >= need0.width - TOL;
      if (okA && okW) continue;
      const line = `${r.name} (${lv.level.name}): ${f(r.area)} م² وعرض ${f(wd)} م؛ الحد ${need0.area} م² وعرض ${need0.width} م`;
      if (c[0] === 'bath' && r.area >= V.wc.area - 0.05 && wd >= V.wc.width - TOL) maybe.push(line + ' — يصح إن كان مرحاضًا بلا استحمام (1.5 م² وعرض 1 م)'); else bad.push(line);
    }
    push('rooms', bad.length ? 'fail' : maybe.length ? 'review' : n ? 'ok' : 'review', { actual: n, text: bad.length ? `فراغات دون الحد الأدنى: ${bad.join('؛ ')}.` : maybe.length ? `كل الفراغات فوق الحد الأدنى عدا ما يُراجع: ${maybe.join('؛ ')}.` : n ? `${n} فراغًا (مجالس وصالات وطعام ونوم ومطابخ وحمامات) كلها فوق الحد الأدنى للمساحة والعرض. المقاسات صافية من وجه الجدار.` : 'لا فراغات مسمّاة في المخطط.', bad, maybe });
    const cmin = ruleById('corridor').value.min, cors = model.levels.flatMap(l => l.rooms.filter(r => r.type === 'corridor').map(r => ({ r, w: Math.min(r.rect?.l || 0, r.rect?.w || 0, r.eqWidth || Infinity), lv: l.level.name }))), narrow = cors.filter(c => c.w < cmin - TOL);
    push('corridor', !cors.length ? 'na' : narrow.length ? 'fail' : 'ok', { required: cmin, actual: cors.length ? r2(Math.min(...cors.map(c => c.w))) : null, text: !cors.length ? 'لا ممرات مسمّاة في التصميم.' : narrow.length ? `ممرات أضيق من ${cmin} م: ${narrow.map(c => `${c.r.name} (${c.lv}) ${f(c.w)} م`).join('، ')}.` : `أضيق ممر ${f(Math.min(...cors.map(c => c.w)))} م؛ الحد الأدنى ${cmin} م.` });
    const smin = ruleById('stair').value.min, st = (doc.stairs || []).map(s => num(s.w)).filter(v => v !== null);
    push('stair', !st.length ? 'na' : Math.min(...st) >= smin - TOL ? 'ok' : 'fail', { required: smin, actual: st.length ? Math.min(...st) : null, text: !st.length ? 'لا درج في التصميم.' : `عرض الدرج ${f(Math.min(...st))} م؛ الحد الأدنى للصافي ${smin} م.` });
  }
  const summary = { ok: 0, review: 0, fail: 0, na: 0 }; for (const it of items) summary[it.verdict]++;
  return { items, summary, setbacks, disclaimer: DISCLAIMER, scope: SCOPE_NOTE, source: SOURCE, needsStreetWidth: setbacks.some(r => !r.exact && r.width === null) };
}

/** سطر الملخص أعلى البطاقة. */
export function summaryText(s) {
  const parts = [`${s.ok} مطابق`, `${s.review} يُراجع`, `${s.fail} مخالف`]; if (s.na) parts.push(`${s.na} لا ينطبق`);
  return parts.join(' · ');
}

/**
 * مقارنة ارتدادات المولّد (المخزّنة في doc.plot.setbacks) بالمطلوب نظاميًا لهذه الأرض — للتقرير وللبطاقة. لا تغيّر شيئًا.
 * يعيد [{ side, kind, generator, required, exact, diff }] حيث diff = generator − required (سالب: المولّد أقل من المطلوب).
 */
export function generatorSetbackGaps(doc, land = {}) {
  const sb = doc.plot?.setbacks; if (!sb) return [];
  const need = requiredSetbacks({ ...land, streets: land.streets?.length ? land.streets : doc.streets || [], entries: land.entries?.length ? land.entries : doc.entries || [] });
  return SIDES.filter(s => Number.isFinite(sb[s])).map(s => ({ side: s, kind: need.sides[s].kind, generator: sb[s], required: need.sides[s].required, exact: need.sides[s].exact, diff: r2(sb[s] - need.sides[s].required) }));
}

export default { SOURCE, RULES, DISCLAIMER, requiredSetbacks, buildEnvelope, landBrief, landBriefSvg, checkMunicipal, summaryText, generatorSetbackGaps, VERDICT_AR };
