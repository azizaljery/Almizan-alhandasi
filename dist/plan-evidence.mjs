import { validateModel, quantities } from './planner.mjs';
import { circulationNetwork } from './circulation.mjs';

export const UNASSESSED = 'غير مُقيّم';
// Version of the evidence formulas below (how each axis's score/status is
// derived from the model). Bump it whenever an axis's measurement, status
// rule or thresholds change, so a displayed score can be traced back to the
// exact rule that produced it.
export const PLAN_EVIDENCE_VERSION = 'plan-evidence/1.0.0';
const measured = (score, detail, data = {}) => ({ status: 'ESTIMATE', score, detail, data });
export const unavailable = detail => ({ status: 'NOT_EVALUATED', score: null, detail });

// All comparison scores are explicit proxies. Missing routes are never zero
// metres and windows never stand in for privacy or ventilation performance.
export function assessPlan(model) {
  const errors = validateModel(model);
  const q = quantities(model);
  const network = circulationNetwork(model);
  const routes = model.rooms.map(room => ({ roomId: room.id, type: room.type, path: network.toRoom(room.id) }));
  const complete = !errors.length && routes.length > 0 && routes.every(r => r.path !== null);
  const connected = routes.filter(r => r.path !== null);
  const guests = routes.filter(r => r.type === 'majlis');
  const family = routes.filter(r => ['bedroom', 'master-bedroom', 'living', 'dining'].includes(r.type));
  const pairs = guests.flatMap(g => family.map(f => ({ from: g.roomId, to: f.roomId,
    sharedCorridors: g.path && f.path ? g.path.spaces.filter(s => f.path.spaces.includes(s)) : null })));
  const shared = pairs.filter(p => p.sharedCorridors?.length);
  const averageRouteM = complete ? connected.reduce((s, r) => s + r.path.metres, 0) / connected.length : null;
  const occupied = model.rooms.filter(r => ['bedroom', 'master-bedroom', 'living', 'majlis', 'dining'].includes(r.type));
  const withWindows = occupied.filter(r => model.openings.some(o => o.type === 'window' && o.roomId === r.id));
  const servicePairs = model.rooms.filter(r => r.type === 'kitchen').flatMap(k =>
    model.rooms.filter(r => ['dining', 'storage', 'service'].includes(r.type)).map(s => ({ from: k.id, to: s.id, path: network.betweenRooms(k.id, s.id) })));
  const privacy = complete && pairs.length
    ? measured((pairs.length - shared.length) / pairs.length * 100, 'مقارنة اشتراك مسارات الضيافة والعائلة في الممرات؛ الخصوصية البصرية والصوتية غير مُقيّمة.', { pairs })
    : unavailable('لا توجد مسارات مكتملة وفئات ضيافة وعائلة كافية لمقارنة فصل الحركة.');
  return {
    version: PLAN_EVIDENCE_VERSION,
    nativeValidation: { status: errors.length ? 'FAIL' : 'PASS', errors },
    access: { status: errors.length ? 'NOT_EVALUATED' : complete ? 'PASS' : 'FAIL', score: errors.length ? null : connected.length / Math.max(1, routes.length) * 100,
      detail: 'اتصال الأبواب عبر الممرات؛ الوصول الشامل والإخلاء غير مُقيّمين.', data: { routes, disconnectedRoomIds: routes.filter(r => !r.path).map(r => r.roomId) } },
    privacy,
    circulation: complete ? measured(Math.max(0, 100 - Math.max(0, averageRouteM - 8) * 6), `متوسط المسارات عبر محاور الممرات ${averageRouteM.toFixed(1)} م؛ عتبة 8 م للمقارنة فقط.`, { averageRouteM, routes }) : unavailable('المسارات ناقصة أو الهندسة غير صالحة؛ لا يمكن حساب متوسط موثوق.'),
    serviceFlow: complete && servicePairs.length && servicePairs.every(p => p.path)
      ? measured(Math.max(0, 100 - servicePairs.reduce((s, p) => s + p.path.metres, 0) / servicePairs.length * 5), 'أطوال مسارات المطبخ إلى الطعام والخدمات؛ معامل مقارنة 5 نقاط/م.', { pairs: servicePairs }) : unavailable('بيانات مسارات المطبخ والخدمات غير كافية.'),
    efficiency: measured(q.rooms / q.footprint * 100, `صافي الغرف ${q.rooms.toFixed(1)} م² من بصمة ${q.footprint.toFixed(1)} م².`),
    wasteControl: measured(Math.max(0, 100 - q.reserve / q.footprint * 100), 'المساحة غير الموزعة من البصمة الفعلية، مع استبعاد الفناء.'),
    daylight: occupied.length && !errors.length ? measured(withWindows.length / occupied.length * 100, `${withWindows.length} من ${occupied.length} فراغات مأهولة لها نافذة مرسومة؛ الإضاءة الفعلية غير مُقيّمة.`) : unavailable('بيانات الفراغات والفتحات غير كافية.'),
    ventilation: unavailable('لا توجد بيانات تدفق هواء أو فتحات تشغيل أو نظام تهوية.'),
    acoustic: unavailable('لا توجد خصائص عزل المواد أو مصادر الضوضاء.'),
    solarOrientation: unavailable('لا توجد بيانات موقع جغرافي وتظليل مرتبطة بهذا التقييم.'),
    futureExpansion: unavailable('لا توجد سعات إنشائية أو مخطط توسع.'),
    economy: unavailable('لا توجد أسعار مؤرخة أو تصميم أنظمة كامل.'),
    constructability: unavailable('لا توجد بيانات تربة أو نموذج إنشائي أو تنسيق تنفيذي.'),
    compliance: unavailable('لا يوجد مرجع نظامي محقق مستقلًا لهذا المخطط.'),
    reference: unavailable('المكتبة إرشادية؛ لا يوجد مخطط مرجعي محقق ومطابق بعلاقات وأبعاد قابلة للمقارنة.')
  };
}

export function aggregateAxes(axes) {
  const evaluated = axes.filter(a => a.score !== null && Number.isFinite(a.score) && a.weight > 0);
  const weight = evaluated.reduce((s, a) => s + a.weight, 0);
  return { score: weight ? evaluated.reduce((s, a) => s + a.score * a.weight, 0) / weight : null,
    evaluatedWeight: weight, totalWeight: axes.reduce((s, a) => s + a.weight, 0), evaluatedAxes: evaluated.length, totalAxes: axes.length };
}
