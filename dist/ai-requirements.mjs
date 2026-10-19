// عقد فهم Claude للمتطلبات المكانية: مخطط الأداة (للوكيل) ومنقّح صارم (للوكيل والمتصفح معًا).
// Claude يحوّل كلام العميل إلى قواعد بنفس مفردات rules.mjs، فيتحقق منها المولّد والسجل كما يتحقق من الفهم المحلي.
// بلا استيراد: يُحمَّل في الوركر وفي المتصفح.

export const AI_SUBJECTS = Object.freeze(['majlis', 'majlis_w', 'elderly', 'guest', 'guestwc', 'servicedoor', 'kids', 'onebed', 'master', 'maid', 'driver', 'laundry', 'storage', 'bedrooms', 'dining', 'kitchen', 'hall', 'office', 'prayer', 'stairs', 'entrance']);
export const AI_LEVELS = Object.freeze(['must', 'prefer', 'forbid']);
export const AI_KINDS = Object.freeze(['place', 'near', 'adjacent', 'far', 'apart', 'cluster', 'floor']);
export const AI_SIDES = Object.freeze(['front', 'back', 'n', 's', 'e', 'w', 'right', 'left', 'center']);
export const AI_MODES = Object.freeze(['touch', 'half', 'avoid', 'center']);
export const AI_PREFS = Object.freeze(['allEnsuite', 'sharedBaths', 'masterDressing', 'openKitchen', 'closedKitchen', 'kitchenOpenHall', 'familyEntrance', 'guestEntrance', 'womenSeparate', 'bathsOffHall', 'noCorridors', 'elderlyRoom']);
export const AI_EXTRAS = Object.freeze(['maid', 'driver', 'office', 'prayer', 'storage', 'laundry', 'guestRoom']);
export const AI_AREAS = Object.freeze(['master', 'majlis', 'hall', 'dining', 'kitchen', 'bedroom']);
export const AI_ABSENT = Object.freeze(['majlis', 'dining', 'office', 'prayer', 'maid', 'driver']);

const textList = { type: 'array', items: { type: 'string' } };
/** خاصية requirements في أداة submit_home_brief. */
export const AI_REQUIREMENTS_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  properties: {
    rules: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      kind: { type: 'string', enum: AI_KINDS }, a: { type: 'string', enum: AI_SUBJECTS }, b: { type: 'string', enum: AI_SUBJECTS },
      side: { type: 'string', enum: AI_SIDES }, mode: { type: 'string', enum: AI_MODES }, floor: { type: 'string', enum: ['ground', 'upper'] }, level: { type: 'string', enum: AI_LEVELS },
      quote: { type: 'string' },
    }, required: ['kind', 'a', 'quote'] } },
    absent: { type: 'array', items: { type: 'string', enum: AI_ABSENT } },
    floors: { type: 'integer', enum: [1, 2] },
    prefs: { type: 'array', items: { type: 'string', enum: AI_PREFS } },
    extras: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: AI_EXTRAS }, bath: { type: 'boolean' }, ext: { type: 'boolean' } }, required: ['kind'] } },
    areas: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { room: { type: 'string', enum: AI_AREAS }, m2: { type: 'number' } }, required: ['room', 'm2'] } },
    unclear: textList,
  },
  required: ['rules', 'unclear'],
});

/** تعليمات تُلحق بتعليمات الوكيل لتعبئة requirements. */
export const AI_REQUIREMENTS_GUIDE = `15. املأ requirements بكل ما قاله العميل عن المواضع والعلاقات والأدوار والإضافات، بمفردات ثابتة فقط:
- الفراغات (a وb): majlis مجلس الرجال/المجلس، majlis_w مجلس النساء، master غرفة النوم الرئيسية، kids غرف الأبناء (مجموعة)، bedrooms كل غرف النوم، onebed غرفة نوم واحدة أيًّا كانت، elderly غرفة الوالدين/كبار السن، guest غرفة نوم الضيوف، guestwc دورة مياه الضيوف، hall الصالة، dining الطعام/المقلط، kitchen المطبخ، maid الخادمة، driver السائق، office المكتب، prayer المصلى، laundry الغسيل، storage المخزن، stairs الدرج الداخلي، entrance المدخل الرئيسي، servicedoor باب الخدمة.
- level: must إلزام («لازم/ضروري/أبي/ابغى») وهو الافتراضي، prefer تفضيل («يفضل/لو أمكن/ياليت»)، forbid منع (النفي: «لا/ما أبي/بدون/ممنوع»).
- kind: place موضع (side + mode)، near قرب، adjacent ملاصق/مفتوح على، far بعيد عن، apart غير ملاصق (لنفي الملاصقة)، cluster مجموعة متجاورة (لـkids أو bedrooms)، floor الدور (floor: ground أو upper).
- side: front جهة الشارع والمدخل، back الخلف، n/s/e/w الجهات الجغرافية، right/left يمين/يسار الواقف في الشارع مواجهًا البيت، center وسط البيت (مع mode center).
- mode: touch يلامس جدار تلك الجهة (يطل على الشارع/الحوش)، half في نصف المبنى من تلك الجهة، avoid لا يلامس جدار تلك الجهة («لا تحط غرف النوم على الشارع» = bedrooms front avoid)، center للوسط.
- النفي مهم: «ما يكون في الخلف» = front half. «بعيدة عن الشارع» = back half.
- quote: العبارة من كلام العميل حرفيًا.
- prefs/extras/areas/absent/floors عند ذكرها صراحة فقط؛ areas بالمتر المربع الصافي (الطول × العرض إن ذُكرا).
- unclear: العبارات التي لم تستطع تمثيلها بهذه المفردات، حرفيًا، بلا تخمين (مثل «تصميم عصري»). لا تخترع قاعدة لم تُذكر.`;

const str = (v, n) => typeof v === 'string' && v.trim() && v.length <= n;
/** ينقّي ما يعيده Claude: يُسقط كل بند خارج المفردات بدل رفض الجواب كله. يعيد null إن لم يكن كائنًا. */
export function sanitizeAiRequirements(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rules = [];
  for (const r of Array.isArray(raw.rules) ? raw.rules.slice(0, 40) : []) {
    if (!r || !AI_KINDS.includes(r.kind) || !AI_SUBJECTS.includes(r.a)) continue;
    const q = str(r.quote, 300) ? r.quote.trim() : '', lv = AI_LEVELS.includes(r.level) ? { level: r.level } : {};
    if (r.kind === 'place') { if (!AI_SIDES.includes(r.side)) continue; const mode = AI_MODES.includes(r.mode) ? r.mode : r.side === 'center' ? 'center' : 'half'; rules.push({ kind: 'place', a: r.a, side: r.side, mode, quote: q, ...lv }); continue; }
    if (r.kind === 'floor') { if (!['ground', 'upper'].includes(r.floor)) continue; rules.push({ kind: 'floor', a: r.a, floor: r.floor, quote: q, ...lv }); continue; }
    if (r.kind === 'cluster') { rules.push({ kind: 'cluster', a: r.a, quote: q, ...lv }); continue; }
    if (!AI_SUBJECTS.includes(r.b) || r.b === r.a) continue;
    rules.push({ kind: r.kind, a: r.a, b: r.b, quote: q, ...lv });
  }
  const list = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter(x => allowed.includes(x)))] : []);
  const extras = {};
  for (const e of Array.isArray(raw.extras) ? raw.extras.slice(0, 12) : []) if (e && AI_EXTRAS.includes(e.kind)) extras[e.kind] = { bath: e.bath === true, ext: e.ext === true };
  const areas = {};
  for (const a of Array.isArray(raw.areas) ? raw.areas.slice(0, 12) : []) if (a && AI_AREAS.includes(a.room) && Number.isFinite(a.m2) && a.m2 >= 4 && a.m2 <= 150) areas[a.room] = Math.round(a.m2 * 100) / 100;
  return {
    rules, absent: list(raw.absent, AI_ABSENT), floors: [1, 2].includes(raw.floors) ? raw.floors : null,
    prefs: list(raw.prefs, AI_PREFS), extras, areas,
    unclear: Array.isArray(raw.unclear) ? raw.unclear.filter(s => str(s, 300)).map(s => s.trim()).slice(0, 8) : [],
  };
}
