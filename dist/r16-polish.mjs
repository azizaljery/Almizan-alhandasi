// (الجولة السادسة عشرة) تحسين التصميم نفسه حتى يستحق «جاهز» (قرار المالك: «لا أريد رفع نسبة الجاهزية بتخفيف المعايير. أريد رفع
// جودة التصاميم حتى تستحق هذه النسبة»). يعمل في المولّد على المستند الذي يبنيه، بعد رسم المواقف وقبل المراجعة، ويصلح العيوب التي
// تقيسها privacy-defects.mjs بحلول معمارية معروفة — لكل أرض ولكل مخطط على حدة، ولا يُخفي شيئًا: كل تغيير يُكتب في ملاحظات البديل.
//  1) نافذة غرفة خاصة على المواقف أو الصالة على الشارع: تُنقل إلى جدار خارجي آخر للغرفة لا يطل عليها؛ أو تُلغى إن كان للغرفة
//     نافذة أخرى سليمة؛ وإلا (تفضيل لا حل أول) تُرفع جلستها إلى 1.6 م (نافذة علوية تُدخل الضوء ولا تكشف الغرفة).
//  2) الماستر لا تُدخل إلا من الصالة عبر غرفة الملابس: باب للماستر من ممر الغرف/مدخل الجناح الملاصق لها، وتصير غرفة الملابس داخل
//     الجناح (يُغلق بابها على الصالة).
//  3) ضيف الرجال يعبر العائلة إلى الطعام: باب مقلط بين المجلس (أو دهليز الرجال) والطعام إن تلاصقا.
// كل القيم هنا قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا).
import { analyzeDoc } from './draw/digest.mjs';
import { applyCommand } from './draw/doc.mjs';
import { measureR16, viewQuad, R16_LIMITS, isPrivateRoom } from './privacy-defects.mjs';
import { pointInPolygon, segmentIntersection } from './draw/geom.mjs';

const r2 = v => Math.round(v * 100) / 100;
const OUT_DIR = { s: { x: 0, y: -1 }, n: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
const isFamilyHall = r => r.type === 'living' && !/الضيوف|الطعام|مغاسل/.test(r.name || '');
const isMenMajlis = r => r.type === 'majlis' && !/النساء/.test(r.name || '');
function touch(A, B) {
  if (A.some(p => pointInPolygon(p, B, 1e-6)) || B.some(p => pointInPolygon(p, A, 1e-6))) return true;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segmentIntersection(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return false;
}
const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
const projAt = (w, p) => { const L = wallLen(w) || 1; return ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / L; };
/** موضع حر على جزء من جدار [s0,s1] لفتحة بعرض wd (لا يتداخل مع فتحات الجدار، وبهامش 0.15 م). */
function freeAt(doc, wall, s0, s1, wd, prefer = null) {
  const lo = Math.min(s0, s1) + wd / 2 + .15, hi = Math.max(s0, s1) - wd / 2 - .15; if (hi < lo - 1e-9) return null;
  const ops = doc.openings.filter(o => o.wall === wall.id), ok = at => ops.every(o => Math.abs(o.at - at) >= (o.w + wd) / 2 + .12);
  const mid = prefer ?? (lo + hi) / 2, cands = [];
  for (let k = 0; k <= 40; k++) for (const sg of [1, -1]) { const at = mid + sg * k * .1; if (at >= lo - 1e-9 && at <= hi + 1e-9) cands.push(at); }
  return cands.find(ok) ?? null;
}
const roomDoors = (lv, room) => lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === room.id)).map(op => { const me = op.sides.find(s => s.room.id === room.id); return { op, other: me.other === 'outside' ? null : lv.roomsById.get(me.other) || null }; });
const sharedEdges = (a, b) => { const ids = new Set(b.edges.map(e => e.edgeId)); return a.edges.filter(e => ids.has(e.edgeId)).sort((p, q) => q.length - p.length); };

/** نوافذ الغرف الخاصة التي تطل على المواقف (أو الصالة على الشارع) بلا حجب، في الدور الأرضي. */
function exposedWindows(doc, G) {
  const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id);
  const streets = [...new Set([doc.entry || 's', ...(doc.streets || [])])].filter(s => OUT_DIR[s]);
  const out = [];
  for (const op of G.openings.filter(o => o.window)) for (const s of op.sides.filter(x => x.exterior && x.other === 'outside')) {
    if (!isPrivateRoom(s.room) || (op.o.sill ?? 0) >= R16_LIMITS.highSill - 1e-6) continue;
    const V = viewQuad(op, s.outward), park = bays.some(z => touch(V, z.polygon));
    const street = isFamilyHall(s.room) && streets.some(st => s.outward.x * OUT_DIR[st].x + s.outward.y * OUT_DIR[st].y > .7);
    if (park || street) out.push({ op, room: s.room, out: s.outward, why: park ? 'المواقف' : 'الشارع' });
  }
  return out;
}
function exposedEdge(doc, G, room, e, wd) {
  const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id);
  const streets = [...new Set([doc.entry || 's', ...(doc.streets || [])])].filter(s => OUT_DIR[s]);
  const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, pseudo = { p: mid, w: Math.min(wd, e.length), wall: { t: .2 } };
  if (bays.some(z => touch(viewQuad(pseudo, e.out), z.polygon))) return true;
  if (isFamilyHall(room) && streets.some(st => e.out.x * OUT_DIR[st].x + e.out.y * OUT_DIR[st].y > .7)) return true;
  return false;
}

/**
 * يصلح عيوب الخصوصية والحركة القابلة للإصلاح الموضعي على المستند (يعدّله في مكانه — مستند يملكه المولّد). يعيد { notes_ar[], changed }.
 */
export function polishR16(doc) {
  const notes = []; let changed = false;
  // 1) النوافذ المكشوفة
  for (let pass = 0; pass < 12; pass++) {
    const G = analyzeDoc(doc).levels[0]; if (!G) break;
    const ex = exposedWindows(doc, G); if (!ex.length) break;
    const x = ex[0], o = x.op.o, room = x.room;
    const others = G.openings.filter(op => op.window && op.id !== x.op.id && op.sides.some(s => s.room.id === room.id && s.exterior && s.other === 'outside'));
    const sound = others.filter(op => !ex.some(y => y.op.id === op.id));
    const glaze = sound.reduce((t, op) => t + op.w * op.h, 0);
    // (أ) نقل النافذة إلى جدار خارجي آخر للغرفة لا يطل على المواقف ولا (للصالة) على الشارع
    let moved = false;
    if (glaze < .08 * room.area) {
      for (const e of room.edges.filter(e => e.exterior && e.length >= Math.min(o.w, 1.0) + .5).sort((p, q) => q.length - p.length)) {
        if (Math.abs(e.out.x * x.out.x + e.out.y * x.out.y) > .7 && e.out.x * x.out.x + e.out.y * x.out.y > 0) continue; // الجهة نفسها
        if (exposedEdge(doc, G, room, e, o.w)) continue;
        const wall = doc.walls.find(w => w.id === e.wallIds?.[0]); if (!wall) continue;
        const wd = Math.min(o.w, e.length - .5), at = freeAt(doc, wall, projAt(wall, e.a), projAt(wall, e.b), wd); if (at == null) continue;
        try { doc.openings = doc.openings.filter(q => q.id !== o.id); const r = applyCommand(doc, { type: 'add-opening', wall: wall.id, kind: o.kind, at, w: wd, h: o.h, sill: o.sill }); Object.assign(doc, r.doc); moved = true; } catch { doc.openings.push(o); continue; }
        notes.push(`نُقلت نافذة «${room.name}» من الجدار المطل على ${x.why} إلى جدار ${e.side} لا يطل عليه (خصوصية — قيمة تصميمية افتراضية للميزان).`);
        break;
      }
    }
    if (moved) { changed = true; continue; }
    // (ب) للغرفة نافذة أخرى سليمة تكفي (≥ 8% من أرضيتها): تُلغى المكشوفة
    if (glaze >= .08 * room.area) { doc.openings = doc.openings.filter(q => q.id !== o.id); notes.push(`أُلغيت نافذة «${room.name}» المطلة على ${x.why}؛ يكفيها نوافذها الأخرى (خصوصية).`); changed = true; continue; }
    // (ج) تفضيل أخير: جلسة عالية 1.6 م (نافذة علوية تُدخل الضوء ولا تكشف الغرفة)
    const live = doc.openings.find(q => q.id === o.id); if (!live) continue;
    // عرض النافذة العلوية: زجاجها ≥ 5% من أرضية الغرفة ما اتسع جدارها (دون تداخل مع فتحات الجدار نفسه)
    const edge = room.edges.find(e => e.exterior && Math.abs((x.op.p.x - e.a.x) * (e.b.y - e.a.y) - (x.op.p.y - e.a.y) * (e.b.x - e.a.x)) / (e.length || 1) < .3);
    const wall = doc.walls.find(w => w.id === live.wall), h = .9;
    let wd = Math.max(live.w, Math.min(3.6, room.area * .05 / h));
    if (edge && wall) { const s0 = Math.min(projAt(wall, edge.a), projAt(wall, edge.b)), s1 = Math.max(projAt(wall, edge.a), projAt(wall, edge.b)); const ops = doc.openings.filter(q => q.wall === wall.id && q.id !== live.id); for (; wd > live.w; wd -= .1) { const lo = s0 + wd / 2 + .15, hi = s1 - wd / 2 - .15, at = Math.max(lo, Math.min(hi, live.at)); if (hi >= lo && ops.every(q => Math.abs(q.at - at) >= (q.w + wd) / 2 + .12)) { live.at = Math.round(at * 1000) / 1000; break; } } }
    live.sill = R16_LIMITS.highSill; live.h = h; live.w = Math.round(Math.max(live.w, wd) * 100) / 100;
    notes.push(`نافذة «${room.name}» المطلة على ${x.why} بجلسة عالية ${R16_LIMITS.highSill} م (لا جدار خارجي آخر للغرفة لا يطل عليه) — تفضيل قابل للتغيير: زجاج معتم بدلها إن أراد العميل.`);
    changed = true;
  }
  // 2) الماستر عبر غرفة الملابس من الصالة: باب من ممر الغرف أو مدخل الجناح أو البهو الملاصق
  {
    const model = analyzeDoc(doc);
    for (const lv of model.levels) for (const M of lv.rooms.filter(r => r.type === 'master')) {
      const ds = roomDoors(lv, M).filter(d => d.other), inner = r => r.type === 'bath' || /ملابس/.test(r.name || '');
      if (!ds.length || !ds.every(d => inner(d.other))) continue;
      const hallDoors = ds.flatMap(d => roomDoors(lv, d.other).filter(z => z.other && isFamilyHall(z.other)).map(z => ({ via: d.other, op: z.op, hall: z.other })));
      if (!hallDoors.length) continue;
      const lobbies = lv.rooms.filter(r => (r.type === 'corridor' || r.type === 'entrance') && !/الرجال|النساء|الخدمة|خدمة/.test(r.name || '') && !(r.type === 'entrance' && /العائلة/.test(r.name || '')));
      let done = false;
      for (const L of lobbies) {
        for (const e of sharedEdges(M, L)) {
          if (e.length < 1.2) continue;
          const wall = doc.walls.find(w => w.id === e.wallIds?.[0]); if (!wall) continue;
          const at = freeAt(doc, wall, projAt(wall, e.a), projAt(wall, e.b), .9); if (at == null) continue;
          try { const r = applyCommand(doc, { type: 'add-opening', wall: wall.id, kind: 'door', at, w: .9 }); Object.assign(doc, r.doc); } catch { continue; }
          for (const h of hallDoors) doc.openings = doc.openings.filter(q => q.id !== h.op.id);
          notes.push(`«${M.name}» تُدخل من «${L.name}» مباشرة، وصارت «${hallDoors[0].via.name}» داخل الجناح (لا عبور من الصالة إلى الماستر عبرها).`);
          done = true; changed = true; break;
        }
        if (done) break;
      }
    }
  }
  // 3) مسار ضيف الرجال إلى الطعام: باب مقلط بين المجلس (أو دهليز الرجال) والطعام إن تلاصقا
  {
    const model = analyzeDoc(doc), G = model.levels[0];
    const m = measureR16(doc, {}, model).find(g => g.id === 'GUEST_DINING');
    if (G && m && m.applicable && !m.pass) {
      const men = G.rooms.filter(isMenMajlis), hosts = [...men, ...G.rooms.filter(r => /الرجال/.test(r.name || '') && ['corridor', 'entrance'].includes(r.type))];
      let done = false;
      for (const h of hosts) { for (const D of G.rooms.filter(r => r.type === 'dining')) {
        for (const e of sharedEdges(h, D)) {
          if (e.length < 1.3) continue;
          const wall = doc.walls.find(w => w.id === e.wallIds?.[0]); if (!wall || wall.kind === 'fence') continue;
          const at = freeAt(doc, wall, projAt(wall, e.a), projAt(wall, e.b), .9); if (at == null) continue;
          try { const r = applyCommand(doc, { type: 'add-opening', wall: wall.id, kind: 'door', at, w: .9 }); Object.assign(doc, r.doc); } catch { continue; }
          notes.push(`باب مقلط بين «${h.name}» و«${D.name}»: يصل ضيف الرجال إلى الطعام دون أن يعبر منطقة العائلة (تفضيل سعودي افتراضي للميزان).`);
          done = true; changed = true; break;
        }
        if (done) break; } if (done) break; }
    }
  }
  return { notes_ar: notes, changed };
}
export default { polishR16 };
void r2;
