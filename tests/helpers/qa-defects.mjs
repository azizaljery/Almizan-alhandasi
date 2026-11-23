// كاشف عيوب التخطيط المعروفة (منقول من قياس defects.mjs السابق) على مستند واحد. قراءة فقط.
import { digestDoc } from '../../dist/draw/digest.mjs';
const BED = t => t === 'bedroom' || t === 'master';
const HALL_NAME = /^(الصالة|الردهة|صالة الحركة|الصالة العلوية)$/;
export const DEFECT_LABELS = Object.freeze({
  HALL_OVERSIZED: 'صالة مضخمة', HALL_STRIP: 'صالة شريطية', CIRC_OVER30: 'حركة أكثر من 30٪ من الدور', BED_SMALL: 'غرفة نوم صغيرة', BED_RATIO: 'نسبة غرفة نوم مفرطة',
  HAB_NO_WINDOW: 'غرفة معيشة بلا نافذة', BED_ON_ENTRY_OR_MAJLIS: 'باب غرفة نوم على المدخل/المجلس', MAJLIS_BED_WALL: 'جدار مشترك مجلس-نوم', BED_KITCHEN_WALL: 'جدار مشترك مطبخ-نوم',
  MAJLIS_SMALL: 'مجلس صغير', MAJLIS_RATIO: 'نسبة مجلس مفرطة', MAJLIS_TO_FAMILY_HALL: 'المجلس يفتح على صالة الأسرة', KITCHEN_NO_WINDOW: 'مطبخ بلا نافذة', KITCHEN_NOT_DINING: 'المطبخ لا يجاور الطعام',
  KITCHEN_ON_MAJLIS: 'المطبخ يفتح على المجلس', BATH_ON_ENTRY: 'حمام على المدخل', FILLER_ROOM_BIG: 'غرفة حشو كبيرة', TINY_ROOM: 'غرفة دقيقة', BED_WALK_OVER16: 'مشي إلى النوم أكثر من 16 م',
  UNREACHABLE: 'غرفة لا يُوصل إليها', MAID_MISSING: 'غرفة الخادمة مفقودة', DRIVER_MISSING: 'غرفة السائق مفقودة', STAIR_IN_ENTRY: 'الدرج في غرفة المدخل', WET_UNSTACKED: 'مبللة علوية غير متراصة',
});
export function defectsOfDoc(doc, { maid = false, driver = false } = {}) {
  const D = {}; const add = (k, msg) => { (D[k] ||= []).push(msg); };
  const dg = digestDoc(doc);
  const all = dg.levels.flatMap((lv, li) => lv.rooms.map(r => ({ ...r, li })));
  const byId = new Map(all.map(r => [r.id, r]));
  let maxWalk = 0; const circs = [];
  dg.levels.forEach((lv, li) => {
    const rs = lv.rooms.filter(r => !r.unlabelled), net = rs.reduce((s, r) => s + r.area, 0) || 1;
    const circ = rs.filter(r => ['corridor', 'entrance', 'stairs'].includes(r.type) || r.type === 'living' && HALL_NAME.test(r.name)).reduce((s, r) => s + r.area, 0);
    circs.push(+(circ / net).toFixed(2));
    for (const h of rs.filter(r => r.type === 'living' && HALL_NAME.test(r.name))) {
      if (h.area > 40 || h.area / net > .25) add('HALL_OVERSIZED', `L${li} ${h.name} ${h.area}م²`);
      if (h.size[1] / h.size[0] > 2.2) add('HALL_STRIP', `L${li} ${h.name} ${h.size.join('×')}`);
    }
    if (circ / net > .30) add('CIRC_OVER30', `L${li} ${Math.round(100 * circ / net)}٪`);
    for (const r of rs) {
      const nb = (r.neighbours || []).map(i => byId.get(i)).filter(Boolean);
      if (BED(r.type)) {
        if (r.area < (r.type === 'master' ? 16 : 12)) add('BED_SMALL', `${r.name} ${r.area}م²`);
        if (r.size[1] / r.size[0] > 1.5) add('BED_RATIO', `${r.name} ${r.size.join('×')}`);
        if (!r.windows.count) add('HAB_NO_WINDOW', r.name);
        if (r.doors.some(d => { const o = byId.get(d.connects); return o && (o.type === 'entrance' || o.type === 'majlis'); })) add('BED_ON_ENTRY_OR_MAJLIS', r.name);
        if (nb.some(o => o.type === 'majlis' && o.li === li)) add('MAJLIS_BED_WALL', r.name);
        if (nb.some(o => o.type === 'kitchen' && o.li === li)) add('BED_KITCHEN_WALL', r.name);
      }
      if (r.type === 'majlis') {
        if (r.area < 14) add('MAJLIS_SMALL', `${r.name} ${r.area}م²`);
        if (r.size[1] / r.size[0] > 1.8) add('MAJLIS_RATIO', `${r.name} ${r.size.join('×')}`);
        if (r.doors.some(d => byId.get(d.connects)?.type === 'living')) add('MAJLIS_TO_FAMILY_HALL', r.name);
        if (!r.windows.count) add('HAB_NO_WINDOW', r.name);
      }
      if (r.type === 'kitchen') {
        if (!r.windows.count) add('KITCHEN_NO_WINDOW', r.name);
        const din = rs.filter(o => o.type === 'dining'); if (din.length && !din.some(o => (r.neighbours || []).includes(o.id))) add('KITCHEN_NOT_DINING', r.name);
        if (r.doors.some(d => byId.get(d.connects)?.type === 'majlis')) add('KITCHEN_ON_MAJLIS', r.name);
      }
      if (r.type === 'bath' && r.doors.length && r.doors.every(d => byId.get(d.connects)?.type === 'entrance')) add('BATH_ON_ENTRY', r.name);
      if (/متعددة الاستعمال|جلسة|عائلية/.test(r.name) && r.area >= 18) add('FILLER_ROOM_BIG', `${r.name} ${r.area}م²`);
      if (r.type === 'storage' && r.area < 2) add('TINY_ROOM', `${r.name} ${r.area}`);
    }
    const g = new Map(); for (const [a, b] of lv.circulation.graph) { (g.get(a) || g.set(a, []).get(a)).push(b); (g.get(b) || g.set(b, []).get(b)).push(a); }
    const src = li === 0 ? lv.circulation.entryRooms[0] : (lv.stairs[0]?.room || null);
    if (src) {
      const dist = new Map([[src, 0]]), q = [src];
      while (q.length) { const a = q.shift(); for (const b of g.get(a) || []) { if (dist.has(b)) continue; const A = byId.get(a), B = byId.get(b); if (!A || !B) continue; dist.set(b, dist.get(a) + Math.hypot(A.centroid.x - B.centroid.x, A.centroid.y - B.centroid.y)); q.push(b); } }
      for (const r of rs) if (BED(r.type) && dist.has(r.id)) maxWalk = Math.max(maxWalk, dist.get(r.id));
    }
    for (const id of lv.circulation.unreachable) add('UNREACHABLE', id);
  });
  if (maxWalk > 16) add('BED_WALK_OVER16', maxWalk.toFixed(1) + 'م');
  if (maid && !all.some(r => /خادمة/.test(r.name))) add('MAID_MISSING', 'غرفة الخادمة مطلوبة');
  if (driver && !all.some(r => /سائق/.test(r.name))) add('DRIVER_MISSING', 'غرفة السائق مطلوبة');
  if (dg.levels.length > 1) {
    const L0 = dg.levels[0], sr = L0.rooms.find(r => r.stairs?.length), ent = L0.rooms.find(r => L0.circulation.entryRooms.includes(r.id));
    if (sr && ent && sr.id === ent.id) add('STAIR_IN_ENTRY', sr.name);
    const wet = l => all.filter(r => r.li === l && ['bath', 'kitchen', 'laundry'].includes(r.type)), up = wet(1), gr = wet(0);
    const un = up.filter(u => !gr.some(x => Math.hypot(u.centroid.x - x.centroid.x, u.centroid.y - x.centroid.y) <= 2.5));
    if (un.length) add('WET_UNSTACKED', `${un.length}/${up.length}`);
  }
  return { codes: D, maxWalk: +maxWalk.toFixed(1), circ: circs };
}
