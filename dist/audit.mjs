import { openingPoint, quantities } from './planner.mjs';
import { circulationNetwork } from './circulation.mjs';

const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A transparent first-pass review. It deliberately reports heuristics, not code compliance.
export function reviewPlan(model) {
  const q = quantities(model);
  const land = model.plot.width * model.plot.length;
  const building = model.building.w * model.building.h;
  const outside = Math.max(0, land - building);
  const network = circulationNetwork(model);
  const route = room => {
    const path = network.toRoom(room.id);
    return { room: room.name, roomId: room.id, metres: path ? Math.round(path.metres * 10) / 10 : null, points: path?.points || [], spaces: path?.spaces || [] };
  };
  const guests = model.rooms.filter(room => room.type === 'majlis').map(route);
  const family = model.rooms.filter(room => ['living', 'dining', 'bedroom'].includes(room.type)).map(route);
  const service = model.rooms.filter(room => ['kitchen', 'service', 'storage'].includes(room.type)).map(route);
  const issues = [];
  if ([...guests, ...family, ...service].some(r => r.metres === null)) issues.push({ level: 'warn', text: 'تعذر حساب مسار متصل إلى بعض الغرف؛ لا تُفسّر المسافة المفقودة على أنها صفر.' });
  if (guests.some(g => family.some(f => g.spaces.some(s => f.spaces.includes(s))))) issues.push({ level: 'warn', text: 'الضيوف والعائلة يستخدمون أجزاء من الممر نفسه؛ فصل الغرف إلى أمام وخلف لا يحقق استقلال الحركة.' });
  const occupied = model.rooms.filter(r => ['bedroom', 'living', 'majlis'].includes(r.type));
  const withoutWindows = occupied.filter(r => !model.openings.some(o => o.type === 'window' && o.roomId === r.id));
  if (withoutWindows.length) issues.push({ level: 'warn', text: 'فراغات مأهولة بلا نافذة خارجية: ' + withoutWindows.map(r => r.name).join('، ') + '.' });
  const circulationRatio = building ? q.circulation / building : 0;
  if (circulationRatio > .2) issues.push({ level: 'warn', text: 'الممرات تتجاوز 20٪ من الكتلة في هذا الحل؛ قارنها بالبدائل. هذه عتبة مقارنة وليست اشتراطًا نظاميًا.' });
  const majlis = model.rooms.filter(room => room.type === 'majlis');
  if (majlis.some(room => room.position !== 'front')) issues.push({ level: 'warn', text: 'مجلس ضيافة ليس في النطاق الأمامي؛ راجع فصل طريق الضيوف عن العائلة.' });
  if (majlis.length && model.rooms.some(room => room.type === 'living' && room.position === 'front')) issues.push({ level: 'warn', text: 'الصالة العائلية في النطاق الأمامي مع الضيافة؛ هذا ليس فصلًا مضمونًا للمسارات.' });
  const doors = model.openings.filter(opening => opening.type === 'door' && opening.roomId).map(opening => ({ opening, point: openingPoint(model, opening) }));
  for (let i = 0; i < doors.length; i++) for (let j = i + 1; j < doors.length; j++) {
    if (doors[i].opening.wallId === doors[j].opening.wallId && distance(doors[i].point, doors[j].point) < 1.2) {
      issues.push({ level: 'warn', text: 'فتحتا باب متقاربتان على الجدار نفسه؛ راجع اتجاهات الفتح قبل التنفيذ.' }); i = doors.length; break;
    }
  }
  const relationships = [];
  for (const [aType, bType] of [['majlis', 'dining'], ['kitchen', 'dining'], ['kitchen', 'storage'], ['living', 'bedroom']]) {
    for (const a of model.rooms.filter(r => r.type === aType)) {
      const pairs = model.rooms.filter(r => r.type === bType).map(b => ({ b, path: network.betweenRooms(a.id, b.id) })).filter(p => p.path).sort((a, b) => a.path.metres - b.path.metres);
      if (pairs.length) { const { b, path } = pairs[0]; relationships.push({ from: a.name, to: b.name, metres: Math.round(path.metres * 10) / 10 }); }
    }
  }
  if (!issues.length) issues.push({ level: 'ok', text: 'لم يرصد هذا الفحص المحدود تنبيهًا؛ لا يثبت صلاحية التصميم للتنفيذ أو تحقق الخصوصية.' });
  const score = Math.max(0, Math.min(100, 86 - issues.filter(issue => issue.level === 'warn').length * 14 - model.warnings.length * 2));
  return {
    score,
    areas: [
      ['مساحة الأرض', land], ['الكتلة المبنية', building], ['صافي الغرف', q.rooms],
      ['الممرات', q.circulation], ['احتياطي غير موزع', q.reserve], ['خارج الكتلة', outside],
    ],
    routes: { guests, family, service },
    relationships, circulationRatio, occupiedWithoutWindows: withoutWindows.length,
    areaBudget: Math.min(model.footprint.area, model.plot.maxBuiltArea ?? Infinity),
    issues,
    note: 'الأطوال عبر محاور الممرات المتصلة إلى الأبواب؛ ليست أقصر مسار مشاة مطلقًا. الترابط يعرض أقرب فراغ من النوع المطلوب، ولا يعني وجود باب مباشر. لا يتضمن هذا الفحص الجيران أو الشمس أو أقواس فتح الأبواب أو مسارات السيارات أو اعتماد الإخلاء.',
  };
}
