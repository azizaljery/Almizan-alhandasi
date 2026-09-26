/*
 * Client-side requirements bridge.
 * It does not replace the protected AI service. It turns the approved,
 * reviewable AI/local result into a structured brief the planner can consume.
 */
const text = value => String(value ?? '').trim();
const unique = values => [...new Set((values || []).map(text).filter(Boolean))];
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

const hasAny = (source, words) => words.some(word => source.includes(word));

export function buildClientContext({ plot, discovery = {}, rooms = [], prompt = '' } = {}) {
  const d = discovery || {};
  const likes = unique(d.likes), rejects = unique(d.rejects), avoids = unique(d.avoids);
  const life = Object.fromEntries(Object.entries(d.life || {}).filter(([, value]) => text(value)));
  return {
    language: /[A-Za-z]/.test(prompt) && /[\u0600-\u06ff]/.test(prompt) ? 'ar-en' : /[A-Za-z]/.test(prompt) ? 'en' : 'ar',
    plot: plot ? {
      width: Number(plot.width), length: Number(plot.length), floors: Number(plot.floors), entry: text(plot.entry),
      streets: { ...(plot.streets || {}) }, coverage: Number(plot.coverage), maxBuiltArea: plot.maxBuiltArea ?? null,
    } : null,
    discovery: { likes, rejects, avoids, life },
    rooms: rooms.map(({ name, type, area, position, side }) => ({ name: text(name), type, area: Number(area), position, side })),
    prompt: text(prompt).slice(0, 4000),
  };
}

export function deriveRequirements({ prompt = '', context = {}, brief = {} } = {}) {
  const source = `${text(prompt)} ${text(brief.summary)} ${text((brief.assumptions || []).join(' '))} ${text((brief.unhandled || []).join(' '))}`.toLowerCase();
  const discovery = context.discovery || {};
  const avoids = unique(discovery.avoids), life = discovery.life || {};
  const rooms = Array.isArray(brief.rooms) && brief.rooms.length ? brief.rooms : (context.rooms || []);
  const hasGuests = rooms.some(r => ['majlis', 'dining'].includes(r.type)) || hasAny(source, ['ضيافة', 'مجلس', 'guest', 'majlis']);
  const hasFamily = rooms.some(r => ['living', 'bedroom'].includes(r.type)) || hasAny(source, ['عائلة', 'صالة', 'family', 'bedroom']);
  const priorities = [
    { key: 'privacy', label: 'خصوصية النوم والعائلة', score: clamp(45 + (hasAny(source, ['خصوص', 'privacy', 'نساء', 'غرف النوم']) ? 35 : 0) + (avoids.some(v => /كشف|نوم|خصوص/.test(v)) ? 15 : 0)) },
    { key: 'guestSeparation', label: 'فصل حركة الضيوف', score: clamp(35 + (hasGuests ? 30 : 0) + (avoids.some(v => /ضيوف|الضيافة/.test(v)) ? 25 : 0)) },
    { key: 'familyCore', label: 'وضوح قلب العائلة', score: clamp(35 + (hasFamily ? 30 : 0) + (life.children ? 15 : 0)) },
    { key: 'serviceAdjacency', label: 'ترابط الطعام والخدمات', score: clamp(30 + (rooms.some(r => ['kitchen', 'dining', 'storage'].includes(r.type)) ? 30 : 0) + (hasAny(source, ['مطبخ', 'طعام', 'خدمة', 'service']) ? 20 : 0)) },
    { key: 'accessibility', label: 'سهولة الحركة', score: clamp(30 + (life.seniors?.includes('موجود') || hasAny(source, ['كبار السن', 'سهولة', 'accessible']) ? 45 : 0) + (avoids.some(v => /ممر|حركة/.test(v)) ? 15 : 0)) },
    { key: 'future', label: 'مرونة المستقبل', score: clamp(30 + (life.future === 'مهمة' ? 50 : 0) + (hasAny(source, ['مستقبل', 'توسع', 'future']) ? 15 : 0)) },
    { key: 'daylight', label: 'الإضاءة والاتجاه', score: clamp(35 + (hasAny(source, ['ضوء', 'شمس', 'إضاءة', 'daylight']) ? 35 : 0) + (avoids.some(v => /شمس|الغرب/.test(v)) ? 15 : 0)) },
  ];
  const relationships = [];
  const addRelationship = (from, to, reason, weight = 'مهم') => relationships.push({ from, to, reason, weight });
  if (rooms.some(r => r.type === 'kitchen') && rooms.some(r => r.type === 'dining')) addRelationship('المطبخ', 'الطعام', 'تقليل مسافة تقديم الطعام');
  if (rooms.some(r => r.type === 'majlis') && rooms.some(r => r.type === 'dining')) addRelationship('المجالس', 'الطعام', 'مسار ضيافة واضح');
  if (rooms.some(r => r.type === 'living') && rooms.some(r => r.type === 'bedroom')) addRelationship('الصالة العائلية', 'غرف النوم', 'قرب يومي مع حفظ الخصوصية');
  if (rooms.some(r => r.type === 'storage') && rooms.some(r => r.type === 'kitchen')) addRelationship('المستودع', 'المطبخ', 'دعم الخدمة والتخزين');
  const constraints = unique([
    ...avoids.map(value => `تجنب: ${value}`),
    ...(brief.unhandled || []).map(value => `متطلب يحتاج معالجة هندسية: ${value}`),
  ]);
  const conflicts = [];
  const netArea = rooms.reduce((sum, room) => sum + (Number(room.area) || 0), 0);
  const available = Number(context.plot?.maxBuiltArea) || ((Number(context.plot?.width) || 0) * (Number(context.plot?.length) || 0) * (Number(context.plot?.coverage) || .6));
  if (available > 0 && netArea > available * .9) conflicts.push(`صافي الغرف ${Math.round(netArea)}م² يقترب من أو يتجاوز المساحة المتاحة قبل الجدران والممرات.`);
  if (Number(context.plot?.floors) > 1) conflicts.push('التحليل الحالي يطبق على الدور الأرضي؛ توزيع الأدوار الأخرى يحتاج قرارًا مستقلًا.');
  if (hasGuests && hasFamily && !hasAny(source, ['مدخل مستقل', 'فصل', 'مسار'])) conflicts.push('يوجد ضيوف وعائلة معًا، لكن استقلال المسارات لم يُحسم بعد.');
  const questions = unique([
    ...(brief.questions || []),
    ...(!context.plot?.entry ? ['ما جهة المدخل الرئيسي بالنسبة للشوارع؟'] : []),
    ...(hasGuests && hasFamily && !hasAny(source, ['مدخل مستقل', 'فصل']) ? ['هل تريد مسار ضيوف مستقلًا عن الصالة العائلية؟'] : []),
  ]).slice(0, 8);
  const sorted = [...priorities].sort((a, b) => b.score - a.score);
  return {
    version: 1,
    intent: text(brief.summary) || 'متطلبات تصميم سكني قابلة للمراجعة',
    priorities,
    topPriorities: sorted.slice(0, 3).map(item => item.label),
    constraints,
    relationships,
    conflicts,
    questions,
    assumptions: unique(brief.assumptions),
    readiness: Math.round(priorities.reduce((sum, item) => sum + item.score, 0) / priorities.length),
    disclaimer: 'هذه قراءة متطلبات وتوجيه للمحرك وليست اعتمادًا هندسيًا أو تحققًا إنشائيًا.',
  };
}

export default { buildClientContext, deriveRequirements };
