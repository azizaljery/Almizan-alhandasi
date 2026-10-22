// (الجولة الثالثة عشرة، قرار المالك) نسبة الزجاج إلى أرضية الغرفة اختيار العميل/المستفيد وحده: 8 أو 10 أو 12 أو 20٪ أو أقل من 8٪ —
// لا نطاقات افتراضية لنوع الغرفة. يُقرأ طلبه من كلامه (requirements.mjs → prefs.glazing: { all?, rooms:{majlis, women, living, dining,
// kitchen, bedroom, master} }) ويُحمل كشرط عميل: المولّد يحاول بلوغه حيث يتسع الجدار (drawPlanV2) دون تصغير غرفة أو كسر بوابة؛ وإن لم
// يُذكر بقي سلوك النوافذ كما هو. المراجع يعرض النسبة المحققة لكل غرفة معلومةً وبجانبها ما طلبه العميل إن طلب؛ بوابة الرفض 3٪
// (WINDOW_SIZE) كما هي؛ ورقم الوزارة 8٪ مرجع مذكور بمستواه (ب) لا بوابة (dist/regulations-sa.mjs GLAZING_MIN).
export const GLAZING_CLIENT_AR = 'شرط العميل (نسبة الزجاج التي طلبها)';
const KEY = { majlis: 'majlis', living: 'living', dining: 'dining', kitchen: 'kitchen', bedroom: 'bedroom', master: 'master' };
/**
 * ما طلبه العميل لغرفة (٪ من أرضيتها) أو null إن لم يطلب شيئًا. type نوع الغرفة؛ name اسمها (لتمييز مجلس النساء)؛ glazing = prefs.glazing.
 */
export function clientGlazing({ type, name = '' } = {}, glazing = null) {
  if (!glazing) return null;
  const rooms = glazing.rooms || {};
  if (type === 'majlis' && /النساء|الحريم/.test(name) && rooms.women !== undefined) return rooms.women;
  const k = KEY[type]; if (k && rooms[k] !== undefined && !(type === 'majlis' && /النساء|الحريم/.test(name) && rooms.women !== undefined)) return rooms[k];
  if (type === 'master' && rooms.bedroom !== undefined) return rooms.bedroom;
  return glazing.all !== undefined ? glazing.all : null;
}
export default { clientGlazing, GLAZING_CLIENT_AR };
