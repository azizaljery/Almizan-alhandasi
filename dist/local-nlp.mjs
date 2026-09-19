import { TYPES, normalizeRooms } from './planner.mjs';

const numbers = { صفر: 0, واحد: 1, واحدة: 1, اثنين: 2, اثنتين: 2, ثنتين: 2, ثلاث: 3, ثلاثة: 3, اربع: 4, أربع: 4, اربعة: 4, أربعة: 4, خمس: 5, خمسة: 5, ست: 6, ستة: 6, سبع: 7, سبعة: 7, ثمان: 8, ثمانية: 8, تسع: 9, تسعة: 9, عشر: 10, عشرة: 10 };
const terms = [
  ['غرف نوم|غرفة نوم|غرفتين|غرف(?=\\s|$)', 'bedroom'], ['مجالس|مجلسين|مجلسان|مجلس', 'majlis'], ['صالة عائلية|صالات|صالتين|صالة', 'living'],
  ['غرفة طعام|صالة طعام|طعام', 'dining'], ['مطابخ|مطبخين|مطبخ', 'kitchen'], ['دورات مياه|حمامات|حمامين|حمام', 'bath'],
  ['مستودع|تخزين', 'storage'], ['غرفة خدمة|خادمة|شغالة|سائق|سواق|خدمة', 'service'],
];
const negation = /ما ?(أبي|ابي|أبغى|ابغى|احتاج)|مو محتاج|مب ابي|بدون|من غير|بلا|لا أريد|لا اريد|الغِ|الغي|احذف|شيل|طلع/;
const defaults = type => ({ type, name: TYPES[type].name, area: TYPES[type].area, position: type === 'majlis' ? 'front' : type === 'bedroom' ? 'back' : 'middle', side: 'any' });
const countFor = (text, term) => {
  const digit = text.match(new RegExp(`(\\d+)\\s*(?:${term})`)); if (digit) return Number(digit[1]);
  for (const [word, value] of Object.entries(numbers)) if (new RegExp(`(?:${word})\\s+(?:${term})|(?:${term})\\s+${word}`).test(text)) return value;
  if (/غرفتين|مجلسين|مجلسان|صالتين|حمامين|مطبخين/.test(text)) return 2;
  return null;
};

export async function requestLocalBrief({ prompt, previous }) {
  const text = String(prompt || '').trim();
  if (text.length < 3) throw Error('اكتب وصفًا أوضح، مثل: ثلاث غرف نوم ومجلس، بدون غرفة خادمة.');
  let rooms = Array.isArray(previous?.rooms) ? previous.rooms.map(room => ({ ...room })) : [];
  const assumptions = [];
  for (const [term, type] of terms) {
    const related = text.match(new RegExp(`[^،,.]*(?:${term})[^،,.]*`, 'g')) || [];
    if (!related.length) continue;
    const clause = related.at(-1), count = countFor(clause, term), remove = negation.test(clause);
    const target = remove ? 0 : Math.min(10, Math.max(0, count ?? 1));
    rooms = rooms.filter(room => room.type !== type);
    for (let index = 0; index < target; index++) rooms.push({ ...defaults(type), name: target > 1 ? `${TYPES[type].name} ${index + 1}` : TYPES[type].name });
    assumptions.push(`ضُبط ${TYPES[type].name} إلى ${target} بناءً على العبارة: «${clause.trim()}».`);
  }
  if (!assumptions.length) return { summary: 'لم يظهر طلب غرف أو أعداد واضح في النص؛ لم أغيّر برنامجك.', rooms, assumptions: [], questions: ['ما عدد الغرف أو التعديل الذي تريده؟'], unhandled: [] };
  if (rooms.length > 30) throw Error('النص ينتج أكثر من 30 فراغًا؛ اختصر الأعداد.');
  rooms = normalizeRooms(rooms).map(({ name, type, area, position, side }) => ({ name, type, area, position, side }));
  const counts = Object.entries(rooms.reduce((all, room) => ({ ...all, [room.type]: (all[room.type] || 0) + 1 }), {})).map(([type, count]) => `${TYPES[type].name}${count > 1 ? ` × ${count}` : ''}`).join('، ');
  return { summary: `برنامج مقترح محليًا: ${counts}. راجعه قبل نقله للجدول والتوليد.`, rooms, assumptions, questions: [], unhandled: [] };
}
