import { openingPoint, quantities } from './planner.mjs';

const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A transparent first-pass review. It deliberately reports heuristics, not code compliance.
export function reviewPlan(model) {
  const q = quantities(model);
  const land = model.plot.width * model.plot.length;
  const building = model.building.w * model.building.h;
  const outside = Math.max(0, land - building);
  const entry = model.openings.find(opening => opening.type === 'door' && opening.connects?.includes('outside'));
  const entryPoint = entry ? openingPoint(model, entry) : { x: model.building.x, y: model.building.y };
  const roomDoor = room => model.openings.find(opening => opening.type === 'door' && opening.roomId === room.id);
  const route = room => {
    const door = roomDoor(room);
    return { room: room.name, metres: Math.round(distance(entryPoint, door ? openingPoint(model, door) : entryPoint) * 10) / 10 };
  };
  const guests = model.rooms.filter(room => room.type === 'majlis').map(route);
  const family = model.rooms.filter(room => ['living', 'dining', 'bedroom'].includes(room.type)).map(route);
  const service = model.rooms.filter(room => ['kitchen', 'service', 'storage'].includes(room.type)).map(route);
  const issues = [];
  const majlis = model.rooms.filter(room => room.type === 'majlis');
  if (majlis.some(room => room.position !== 'front')) issues.push({ level: 'warn', text: 'مجلس ضيافة ليس في النطاق الأمامي؛ راجع فصل طريق الضيوف عن العائلة.' });
  if (majlis.length && model.rooms.some(room => room.type === 'living' && room.position === 'front')) issues.push({ level: 'warn', text: 'الصالة العائلية في النطاق الأمامي مع الضيافة؛ هذا ليس فصلًا مضمونًا للمسارات.' });
  const doors = model.openings.filter(opening => opening.type === 'door' && opening.roomId).map(opening => ({ opening, point: openingPoint(model, opening) }));
  for (let i = 0; i < doors.length; i++) for (let j = i + 1; j < doors.length; j++) {
    if (doors[i].opening.wallId === doors[j].opening.wallId && distance(doors[i].point, doors[j].point) < 1.2) {
      issues.push({ level: 'warn', text: 'فتحتا باب متقاربتان على الجدار نفسه؛ راجع اتجاهات الفتح قبل التنفيذ.' }); i = doors.length; break;
    }
  }
  if (!issues.length) issues.push({ level: 'ok', text: 'لم يرصد الفحص الآلي تعارضًا بسيطًا في تموضع الضيافة أو تقارب الأبواب. لا يغني ذلك عن مراجعة المسارات الفعلية.' });
  const score = Math.max(0, Math.min(100, 86 - issues.filter(issue => issue.level === 'warn').length * 14 - model.warnings.length * 2));
  return {
    score,
    areas: [
      ['مساحة الأرض', land], ['الكتلة المبنية', building], ['صافي الغرف', q.rooms],
      ['الممرات', q.circulation], ['احتياطي غير موزع', q.reserve], ['خارج الكتلة', outside],
    ],
    routes: { guests, family, service },
    issues,
    note: 'الأطوال خط مستقيم تقريبي من مدخل النموذج إلى باب الغرفة. لا يتضمن هذا الفحص الجيران أو الشمس أو أقواس فتح الأبواب أو مسارات سيارات.',
  };
}
