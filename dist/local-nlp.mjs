import { TYPES, normalizeRooms } from './planner.mjs';

const numbers = { صفر: 0, واحد: 1, واحدة: 1, اثنين: 2, اثنتين: 2, ثنتين: 2, ثلاث: 3, ثلاثة: 3, اربع: 4, اربعة: 4, خمس: 5, خمسة: 5, ست: 6, ستة: 6, سبع: 7, سبعة: 7, ثمان: 8, ثمانية: 8, تسع: 9, تسعة: 9, عشر: 10, عشرة: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const terms = [
  ['غرفة طعام|صالة طعام|غرف طعام|dining rooms?', 'dining'],
  ['غرفة خدمة|غرف خدمة|خادمة|شغالة|سائق|سواق|service rooms?|maids? rooms?', 'service'],
  ['غرفتين نوم|غرف نوم|غرفة نوم|غرفتين|bedrooms?', 'bedroom'],
  ['مجلس نساء|مجلس رجال|مجالس|مجلسين|مجلسان|مجلس|majlis', 'majlis'],
  ['صالة عائلية|صالة للعائلة|صالة للعايل|صالات|صالتين|صالة|living rooms?', 'living'],
  ['مطابخ|مطبخين|مطبخ|kitchens?', 'kitchen'],
  ['دورات مياه|دورة مياه|حمامات|حمامين|حمام|bathrooms?', 'bath'],
  ['مستودعات|مستودع|مخزن|تخزين|storerooms?|storage', 'storage'],
];
const entity = new RegExp(terms.map(([term], i) => `(?<t${i}>${term})`).join('|'), 'giu');
const countWord = Object.keys(numbers).sort((a, b) => b.length - a.length).join('|');
const beforeCount = new RegExp(`(?:^|[\\s،,؛;و])(${countWord}|\\d+)\\s*$`, 'i');
const afterCount = new RegExp(`^\\s+(${countWord}|\\d+)(?=\\s|$)`, 'i');
const negation = /(?:ما\s?(?:ابي|ابغى|احتاج)|مو محتاج|مب ابي|بدون|من غير|بلا|و?لا(?:\s+اريد)?|الغ|الغي|احذف|شيل|no|without|remove)\s*(?:اي\s+|any\s+)?$/i;
const normalizeText = value => String(value || '').replace(/[٠-٩۰-۹]/g, d => String('٠١٢٣٤٥٦٧٨٩'.includes(d) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(d) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[أإآ]/g, 'ا').replace(/[\u064B-\u065F\u0670]/g, '').replace(/٫/g, '.');
const clean = rooms => rooms.length ? normalizeRooms(rooms).map(({ name, type, area, position, side }) => ({ name, type, area, position, side })) : [];
const defaults = type => ({ type, name: TYPES[type].name, area: TYPES[type].area, position: type === 'majlis' ? 'front' : type === 'bedroom' ? 'back' : 'middle', side: 'any' });

export async function requestLocalBrief({ prompt, previous }) {
  const text = normalizeText(prompt).trim();
  if (text.length < 3 || text.length > 4000) throw Error('اكتب وصفًا بين 3 و4000 حرف.');
  let rooms = clean(Array.isArray(previous?.rooms) ? previous.rooms : []);
  const matches = [...text.matchAll(entity)], assumptions = [], questions = [], unhandled = [], groups = new Map();
  for (const [index, match] of matches.entries()) {
    const type = terms[terms.findIndex((_, i) => match.groups[`t${i}`] !== undefined)][1];
    const prefix = text.slice(index ? matches[index - 1].index + matches[index - 1][0].length : 0, match.index);
    const suffix = text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length);
    const clause = suffix.split(/[،,؛;\n]/)[0];
    const dimensions = clause.match(/(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)/i);
    const area = clause.match(/(?:ب?مساح[ةه]|area)\s*(\d+(?:\.\d+)?)/i) || clause.match(/(\d+(?:\.\d+)?)\s*(?:م²|م2|متر مربع|sqm|m2)/i);
    const leading = prefix.match(beforeCount), trailing = !dimensions && !area ? clause.match(afterCount) : null;
    const token = (leading || trailing)?.[1]?.toLowerCase();
    const explicit = token !== undefined ? (numbers[token] ?? Number(token)) : /غرفتين|مجلسين|مجلسان|صالتين|حمامين|مطبخين/.test(match[0]) ? 2 : null;
    if (explicit !== null && (!Number.isInteger(explicit) || explicit < 0 || explicit > 10)) throw Error('عدد كل نوع من الفراغات يجب أن يكون بين 0 و10؛ لم أختصر طلبك تلقائيًا.');
    const remove = negation.test(prefix.trim()), named = /نساء|رجال/.test(match[0]) ? match[0] : null;
    const current = rooms.filter(r => r.type === type && (!named || normalizeText(r.name) === named));
    const requestedArea = dimensions ? Number(dimensions[1]) * Number(dimensions[2]) : area ? Number(area[1]) : null;
    const add = /(?:اضف|زد|add)\s*(?:\d+|[\p{L}]+)?\s*$/iu.test(prefix);
    const item = { type, named, remove, count: remove ? 0 : explicit ?? (named || add ? 1 : current.length || 1), explicit, area: requestedArea,
      position: /خلف|back/i.test(clause) ? 'back' : /امام|front/i.test(clause) ? 'front' : /وسط|middle/i.test(clause) ? 'middle' : null,
      side: /يمين|right/i.test(clause) ? 'right' : /يسار|left/i.test(clause) ? 'left' : /تلقائي|auto/i.test(clause) ? 'any' : null,
      add };
    if (requestedArea !== null && (!Number.isFinite(requestedArea) || requestedArea < 4 || requestedArea > 120 || (dimensions && Math.min(Number(dimensions[1]), Number(dimensions[2])) < 1))) throw Error('راجع مساحة ' + match[0] + '؛ المساحة المقبولة بين 4 و120 م².');
    if (dimensions && !remove) unhandled.push(`استُخدمت ${dimensions[1]} × ${dimensions[2]} م لمساحة ${match[0]} فقط. لا يثبّت المحرك الطول والعرض؛ راجع أبعاد الناتج ولا تعتبر الطلب محققًا.`);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(item);
  }
  for (const [type, items] of groups) {
    const existing = rooms.filter(r => r.type === type);
    let replacement = [...existing];
    if (items.every(i => i.named && !i.remove) && !items.some(i => i.add)) replacement = existing.filter(r => /نساء|رجال/.test(r.name) && !items.some(i => normalizeText(r.name) === i.named));
    for (const item of items) {
      const scope = replacement.filter(r => !item.named || normalizeText(r.name) === item.named);
      if (!item.named && items.length === 1 && item.explicit === null && !item.remove && !item.add && scope.length > 1 && (item.area !== null || item.position || item.side)) {
        questions.push(`يوجد ${scope.length} من نوع ${TYPES[type].name}. حدّد العدد أو اسم الفراغ لتطبيق تعديل المساحة أو الموقع؛ أبقيتها دون تغيير.`); continue;
      }
      replacement = replacement.filter(r => item.add || (item.named && normalizeText(r.name) !== item.named));
      for (let n = 0; n < item.count; n++) {
        const old = scope[n] || (item.named ? existing.find(r => normalizeText(r.name) === item.named) : existing[n]) || defaults(type);
        replacement.push({ ...old, name: item.named || old.name || TYPES[type].name, type,
          area: item.area ?? old.area, position: item.position ?? old.position, side: item.side ?? old.side });
      }
      if (!item.named && replacement.length > 1) replacement = replacement.map((r, n) => ({ ...r, name: existing[n]?.name || `${TYPES[type].name} ${n + 1}` }));
      assumptions.push(`راجع ${item.named || TYPES[type].name}: ${replacement.length} فراغًا بعد التعديل؛ حُفظت خصائص الغرف السابقة ما لم تطلب تغييرها.`);
    }
    rooms = [...rooms.filter(r => r.type !== type), ...replacement];
  }
  if (/خصوصي|خصوصية|مستقل|ابواب|باب|جناح|ملحق|درج|مسبح|حديقة|privacy|entrance|suite|stairs/i.test(text)) unhandled.push('اشتراطات الخصوصية والمداخل المستقلة والأجنحة والأبواب والملحقات والحدائق تحتاج تخطيطًا إضافيًا؛ لم تُنفّذ بهذا الفهم المحلي.');
  if (!matches.length) questions.push('لم أفهم تعديلًا محددًا للغرف؛ بقي برنامجك كما هو.');
  if (rooms.length > 30) throw Error('النص ينتج أكثر من 30 فراغًا؛ لم يُحذف أي طلب لإخفاء التجاوز.');
  if (!rooms.length) questions.push('أصبح البرنامج بلا غرف. أضف فراغًا واحدًا على الأقل قبل التوليد.');
  return { summary: 'برنامج مقترح محليًا؛ راجع المساحات والافتراضات والطلبات غير المنفذة قبل تطبيقه.', rooms: clean(rooms), assumptions: assumptions.slice(0, 12), questions: questions.slice(0, 12), unhandled: [...new Set(unhandled)].slice(0, 12) };
}
