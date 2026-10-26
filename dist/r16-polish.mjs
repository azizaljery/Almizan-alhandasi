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
import { measureR14 } from './saudi-program.mjs';
import { siteElementReport } from './site-element-check.mjs';
import { planWindowScreen, windowExposure, acceptanceSnapshot, compareAcceptance, SCREEN_DEFAULTS } from './privacy-gate.mjs';

const r2 = v => Math.round(v * 100) / 100;
const R14_OFF = new Set(String(globalThis.process?.env?.R14_OFF || '').split(',').filter(Boolean));
/** (الجولة الثامنة عشرة) عمق مواجهة نافذة غرفة النوم للمواقف عبر الارتداد (م) — قيمة تصميمية افتراضية للميزان. */
const BED_GATE_DEPTH = 8;
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
const nbrs = (lv, room) => roomDoors(lv, room).filter(d => d.other).map(d => d.other);
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
  const notes = [], skip = new Set(), screens = []; let changed = false;
  // 1) النوافذ المكشوفة
  for (let pass = 0; pass < 12; pass++) {
    const G = analyzeDoc(doc).levels[0]; if (!G) break;
    const ex = exposedWindows(doc, G).filter(y => !skip.has(y.op.o.id)); if (!ex.length) break;
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
    // (الجولة العشرون، المراجعة العمياء r19: C5-3) الصالة العائلية لا تُترك بنوافذ علوية وحدها: حل الخصوصية لا يُفقدها الإطلالة والضوء على
    // مستوى الجلوس — إن كانت هذه آخر نافذة عادية لها تبقى، ويبقى العيب مذكورًا (يُصلح بسور حاجب أو مشربية أو بتنظيم لا تطل فيه الصالة على الشارع)
    if (isFamilyHall(room) && !R14_OFF.has('r20hallsill') && !G.openings.some(op => op.window && op.id !== x.op.id && (op.o?.sill ?? 1) < 1.5 && op.sides.some(s => s.room.id === room.id))) {
      // (الجولة 21 — 02c، قرار المالك: إصلاح تراجع C6 دون إفساد المقاسات) النافذة والمقاس كما هما، وساتر خصوصية خارجي قائم بذاته بين النافذة
      // والمواقف (privacy-gate.mjs planWindowScreen): طوله من خطوط الرؤية الفعلية، ويُقبل فقط إن (1) حجب كل خطوط الرؤية بعينات متعددة من
      // المواقف وداخل الصالة، (2) واجتاز قياس المشروع الأصلي WINDOW_PARKING لهذه النافذة، (3) ولم يُسقط أي فحص خصوصية أو ضوء أو تهوية أو حركة
      // كان ناجحًا قبله (compareAcceptance). وإلا يُزال ويبقى العيب مذكورًا كما كان.
      if (x.why === 'المواقف' && !R14_OFF.has('r21screen')) {
        const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id), side = x.op.sides.find(s => s.room.id === room.id && s.other === 'outside');
        const sc = side ? planWindowScreen(doc, G, x.op, side, bays) : null;
        if (sc) {
          const snap = JSON.stringify(doc), before = acceptanceSnapshot(doc), was = new Set(doc.walls.map(w => w.id));
          let ok = false;
          try {
            Object.assign(doc, applyCommand(doc, { type: 'add-wall', level: G.level.id, a: sc.a, b: sc.b, t: .2, h: SCREEN_DEFAULTS.screenHeight, kind: 'fence' }).doc);
            const G2 = analyzeDoc(doc).levels[0], op2 = G2.openings.find(q => q.id === o.id), s2 = op2?.sides.find(s => s.room.name === room.name && s.other === 'outside');
            const sight = op2 && s2 ? windowExposure(doc, G2, op2, s2, bays) : { potentialExposure: true };
            const proj = measureR16(doc, {}).find(g => g.id === 'WINDOW_PARKING'), projOk = !(proj?.value?.windows || []).some(w => w.opening === o.id && !w.screened);
            const cmp = compareAcceptance(before, acceptanceSnapshot(doc), { protect: ['privacy', 'daylight', 'ventilation', 'circulation'] });
            const site = siteElementReport(doc, { levelId: G.level.id }); // (قرار المالك) عنصر موقع: حدود القطعة، المركبات، المداخل، الإضاءة والتهوية
            ok = !sight.potentialExposure && projOk && cmp.pass && site.geometryOk;
          } catch { ok = false; }
          if (ok) {
            const fid = doc.walls.find(w => !was.has(w.id))?.id;
            notes.push(`ساتر خصوصية خارجي (سور ${SCREEN_DEFAULTS.screenHeight} م بطول ${r2(sc.length)} م على بعد ${sc.offset} م من الجدار) بين نافذة «${room.name}» والمواقف: النافذة باقية بجلستها وإطلالتها وضوئها، والساتر يحجب خطوط الرؤية من المواقف (قيمة تصميمية افتراضية للميزان؛ لا يحل محل مراجعة معمارية). تحتاج تحققًا نظاميًا: ارتفاع الساتر وإباحته في الموقع غير متحققين من اشتراطات البلدية.`);
            if (fid) screens.push({ wall: fid, window: o.id, room: room.name, ...sc });
            changed = true; skip.add(o.id); continue;
          }
          for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, JSON.parse(snap));
        }
      }
      notes.push(`نافذة «${room.name}» المطلة على ${x.why} بقيت بجلستها: هي نافذتها العادية الوحيدة، ورفعها يُفقد الصالة الإطلالة والضوء — يُستحسن سور حاجب أو مشربية أمامها.`);
      skip.add(o.id); continue;
    }
    // عرض النافذة العلوية: زجاجها ≥ 5% من أرضية الغرفة ما اتسع جدارها (دون تداخل مع فتحات الجدار نفسه)
    const edge = room.edges.find(e => e.exterior && Math.abs((x.op.p.x - e.a.x) * (e.b.y - e.a.y) - (x.op.p.y - e.a.y) * (e.b.x - e.a.x)) / (e.length || 1) < .3);
    const wall = doc.walls.find(w => w.id === live.wall), h = .9;
    let wd = Math.max(live.w, Math.min(3.6, room.area * .05 / h));
    if (edge && wall) { const s0 = Math.min(projAt(wall, edge.a), projAt(wall, edge.b)), s1 = Math.max(projAt(wall, edge.a), projAt(wall, edge.b)); const ops = doc.openings.filter(q => q.wall === wall.id && q.id !== live.id); for (; wd > live.w; wd -= .1) { const lo = s0 + wd / 2 + .15, hi = s1 - wd / 2 - .15, at = Math.max(lo, Math.min(hi, live.at)); if (hi >= lo && ops.every(q => Math.abs(q.at - at) >= (q.w + wd) / 2 + .12)) { live.at = Math.round(at * 1000) / 1000; break; } } }
    live.sill = R16_LIMITS.highSill; live.h = h; live.w = Math.round(Math.max(live.w, wd) * 100) / 100;
    notes.push(`نافذة «${room.name}» المطلة على ${x.why} بجلسة عالية ${R16_LIMITS.highSill} م (لا جدار خارجي آخر للغرفة لا يطل عليه) — تفضيل قابل للتغيير: زجاج معتم بدلها إن أراد العميل.`);
    changed = true;
  }
  // 1-ب) (الجولة الثامنة عشرة) نافذة غرفة نوم تواجه المواقف وبوابة السيارات عبر الارتداد (أبعد من مجال الرؤية القريب 3 م، حتى 8 م)
  //      — المراجع المستقل r17: C6 وC3-2 وC5-2. للغرفة نافذة أخرى لا تواجهها: تُرفع جلسة المواجهة إلى 1.6 م (ضوء بلا كشف)؛ وإلا تبقى
  //      وتُذكر. تحسين تصميم لا قياس: القياس WINDOW_PARKING باقٍ على 3 م.
  {
    const G = analyzeDoc(doc).levels[0], bays = G ? (doc.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id) : [];
    const faces = (op, out) => bays.some(z => touch(viewQuad({ p: op.p, w: op.w, wall: op.wall }, out, BED_GATE_DEPTH, R16_LIMITS.viewSide), z.polygon));
    for (const op of G && bays.length ? G.openings.filter(o => o.window && (o.o.sill ?? 0) < R16_LIMITS.highSill - 1e-6) : []) {
      const s = op.sides.find(x => x.exterior && x.other === 'outside' && ['bedroom', 'master'].includes(x.room.type)); if (!s || !faces(op, s.outward)) continue;
      const room = s.room, others = G.openings.filter(q => q.window && q.id !== op.id && q.sides.some(x => x.room.id === room.id && x.exterior && x.other === 'outside' && !faces(q, x.outward)));
      if (!others.length) { notes.push(`نافذة «${room.name}» تواجه المواقف عبر الارتداد ولا جدار خارجي آخر للغرفة؛ بقيت (يُستحسن زجاج معتم أو سور حاجب).`); continue; }
      const live = doc.openings.find(q => q.id === op.o.id); if (!live) continue;
      live.sill = R16_LIMITS.highSill; live.h = .9;
      notes.push(`نافذة «${room.name}» المواجهة للمواقف وبوابة السيارات صارت علوية بجلسة ${R16_LIMITS.highSill} م، وللغرفة نافذتها الأخرى (خصوصية النوم — قيمة تصميمية افتراضية للميزان).`);
      changed = true;
    }
  }
  // 1-ج) (الجولة التاسعة عشرة؛ المراجع المستقل r18: C1 وC3 وC9-1 وC10-1) نافذة مجلس النساء أو صالة الطعام تواجه الشارع أو المواقف والبوابة
  //      (حتى 8 م): نافذة علوية بجلسة 1.6 م — تفضيل سعودي افتراضي للميزان قابل للتغيير (زجاج معتم بدلها إن أراد العميل). لا يُدفع ثمنها من
  //      الإضاءة: زجاج الغرفة كلها بعد التحويل ≥ 5٪ من أرضيتها (يُوسَّع عرض النافذة العلوية حتى ذلك ما اتسع جدارها)، وإلا تبقى النافذة
  //      ويُذكر السبب. التهوية: النافذة العلوية تُفتح (قلّاب) — قيمة تصميمية للميزان غير متحققة نظاميًا.
  if (!R14_OFF.has('r19sill')) {
    const G = analyzeDoc(doc).levels[0], bays = G ? (doc.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id) : [];
    const streets = [...new Set([doc.entry || 's', ...(doc.streets || [])])].filter(st => OUT_DIR[st]);
    const target = r => r.type === 'dining' || (r.type === 'majlis' && /النساء/.test(r.name || ''));
    const faces = (op, out) => streets.some(st => out.x * OUT_DIR[st].x + out.y * OUT_DIR[st].y > .7) || bays.some(z => touch(viewQuad({ p: op.p, w: op.w, wall: op.wall }, out, BED_GATE_DEPTH, R16_LIMITS.viewSide), z.polygon));
    for (const op of G ? G.openings.filter(o => o.window && (o.o.sill ?? 0) < R16_LIMITS.highSill - 1e-6) : []) {
      const sd = op.sides.find(x => x.exterior && x.other === 'outside' && target(x.room)); if (!sd || !faces(op, sd.outward)) continue;
      const room = sd.room, live = doc.openings.find(q => q.id === op.o.id); if (!live) continue;
      const glassOf = () => doc.openings.filter(q => (q.kind || '').startsWith('window') && G.openings.some(o2 => o2.id === q.id && o2.sides.some(x => x.room.id === room.id && x.exterior))).reduce((t, q) => t + q.w * (q.h ?? 1.2), 0);
      const old = { sill: live.sill, h: live.h, w: live.w, at: live.at };
      live.sill = R16_LIMITS.highSill; live.h = .9;
      // عرض النافذة العلوية حتى يبلغ زجاج الغرفة 5٪ من أرضيتها (على جدارها نفسه دون تداخل)
      const wall = doc.walls.find(w => w.id === live.wall), edge = room.edges.find(e => e.exterior && Math.abs((op.p.x - e.a.x) * (e.b.y - e.a.y) - (op.p.y - e.a.y) * (e.b.x - e.a.x)) / (e.length || 1) < .3);
      if (wall && edge && glassOf() < .05 * room.area) {
        const s0 = Math.min(projAt(wall, edge.a), projAt(wall, edge.b)), s1 = Math.max(projAt(wall, edge.a), projAt(wall, edge.b)), ops = doc.openings.filter(q => q.wall === wall.id && q.id !== live.id);
        for (let wd = Math.min(3.6, s1 - s0 - .3); wd > live.w; wd -= .1) { const lo = s0 + wd / 2 + .15, hi = s1 - wd / 2 - .15, at = Math.max(lo, Math.min(hi, old.at)); if (hi >= lo && ops.every(q => Math.abs(q.at - at) >= (q.w + wd) / 2 + .12)) { const w0 = live.w; live.w = Math.round(wd * 100) / 100; live.at = Math.round(at * 1000) / 1000; if (glassOf() >= .05 * room.area) break; live.w = w0; } }
      }
      if (glassOf() < .05 * room.area - 1e-6) { Object.assign(live, old); notes.push(`نافذة «${room.name}» تواجه ${streets.some(st => sd.outward.x * OUT_DIR[st].x + sd.outward.y * OUT_DIR[st].y > .7) ? 'الشارع' : 'المواقف'} وبقيت عادية: النافذة العلوية لا تُبقي للغرفة زجاجًا ≥ 5٪ من أرضيتها (الإضاءة أولًا) — يُستحسن زجاج معتم أو سور حاجب.`); continue; }
      notes.push(`نافذة «${room.name}» المواجهة ${streets.some(st => sd.outward.x * OUT_DIR[st].x + sd.outward.y * OUT_DIR[st].y > .7) ? 'للشارع' : 'للمواقف والبوابة'} علوية بجلسة ${R16_LIMITS.highSill} م وعرض ${live.w} م (زجاج الغرفة ${r2(100 * glassOf() / room.area)}٪ من أرضيتها) — تفضيل سعودي افتراضي للميزان قابل للتغيير (زجاج معتم بدلها إن أردت).`);
      changed = true;
    }
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
          // (الجولة السابعة عشرة) الطعام صار مقلطًا للضيوف أيضًا: يُسمّى كذلك (كما يسمّيه التفصيل حين يلاصق المجلس من البداية)
          if (D.name === 'صالة الطعام') for (const lb of doc.labels.filter(l => D.labelIds.includes(l.id))) lb.name = 'صالة الطعام والمقلط';
          notes.push(`باب مقلط بين «${h.name}» و«${D.name === 'صالة الطعام' ? 'صالة الطعام والمقلط' : D.name}»: يصل ضيف الرجال إلى الطعام دون أن يعبر منطقة العائلة (تفضيل سعودي افتراضي للميزان).`);
          done = true; changed = true; break;
        }
        if (done) break; } if (done) break; }
    }
  }
  // 3-ب) (الجولة الثامنة عشرة) الطعام الذي يصله ضيف الرجال مفتوح بقوس (بلا باب) على مدخل العائلة أو الصالة أو ممر النوم: يُغلق
  //      على العائلة بباب في الموضع نفسه (مزدوج إن اتسعت الفتحة ≥ 1.4 م) — «والطعام يُغلق على العائلة بباب» نص التفضيل في البرنامج
  {
    const model = analyzeDoc(doc), G = model.levels[0];
    const m = measureR16(doc, {}, model).find(g => g.id === 'GUEST_DINING');
    const fam = m?.value?.exposedTo || [];
    if (G && m && m.applicable && !m.pass && fam.length) {
      const D = G.rooms.find(r => r.type === 'dining' && r.name === m.value.route?.[m.value.route.length - 1]);
      for (const d of D ? roomDoors(G, D) : []) {
        if (!d.other || !fam.includes(d.other.name) || d.op.o.kind !== 'arch') continue;
        const o = doc.openings.find(q => q.id === d.op.o.id); if (!o) continue;
        const dbl = o.w >= 1.4 - 1e-9;
        Object.assign(o, dbl ? { kind: 'door2', w: Math.min(o.w, 1.6) } : { kind: 'door', w: Math.min(o.w, .9) }, { h: 2.1, sill: 0, swing: 'in', hinge: o.hinge || 'left' });
        notes.push(`«${D.name}» يُغلق على «${d.other.name}» ${dbl ? 'بباب مزدوج' : 'بباب'} بدل الفتحة المفتوحة: ضيف الرجال في الطعام لا يكون في منطقة العائلة (تفضيل سعودي افتراضي للميزان).`);
        changed = true;
      }
    }
  }
  // 4) غرفة نوم بلا حمام يصلها (C7-1 في المراجعة r15): دورة مياه مشتركة تُقتطع من طرف الممر الذي تُفتح عليه الغرفة — ممر عريض
  //    (≥ 1.9 م) أطول مما تحتاجه الحركة؛ تُفتح على الممر نفسه، ويبقى الممر ≥ 1.4 م طولًا ومفتوحًا على أبوابه كلها
  {
    const model = analyzeDoc(doc);
    let bad = []; try { bad = (measureR14(doc, {}, model).find(g => g.id === 'BED_BATH')?.value?.rooms || []).filter(x => !x.ok); } catch { bad = []; }
    for (const b of bad) {
      const lv = model.levels.find(l => (l.level.name || l.level.id) === b.level) || model.levels.find(l => l.rooms.some(r => r.name === b.room)); if (!lv) continue;
      const R = lv.rooms.find(r => r.name === b.room); if (!R) continue;
      const done = carveBath(doc, lv, R); if (done) { notes.push(done); changed = true; break; }
    }
  }
  return { notes_ar: notes, changed, screens };
}
const bbox = poly => ({ x0: Math.min(...poly.map(p => p.x)), x1: Math.max(...poly.map(p => p.x)), y0: Math.min(...poly.map(p => p.y)), y1: Math.max(...poly.map(p => p.y)) });
function carveBath(doc, lv, R) {
  const L = lv.level.id, T = .12;
  for (const SPAN of [1.6, 1.45, 1.8, 2.0, 1.25]) { const got = carveBathSpan(doc, lv, R, L, SPAN, T); if (got) return got; }
  return null;
}
function carveBathSpan(doc, lv, R, L, SPAN, T) {
  for (const d of roomDoors(lv, R).filter(x => x.other && x.other.type === 'corridor')) {
    const V = d.other, B = bbox(V.net), w = B.x1 - B.x0, h = B.y1 - B.y0, ax = w >= h ? 'x' : 'y', long = Math.max(w, h), short = Math.min(w, h);
    if (short < 1.9 || long < SPAN + T + 1.4 || Math.abs(V.area - w * h) > .05 * w * h) continue; // ممر مستطيل (قد يحمل رأسًا على استقامة)
    const vDoors = lv.openings.filter(op => op.door && op.sides.some(s => s.room.id === V.id));
    for (const end of ['lo', 'hi']) {
      const c = ax === 'x' ? (end === 'lo' ? B.x0 + SPAN + T / 2 : B.x1 - SPAN - T / 2) : (end === 'lo' ? B.y0 + SPAN + T / 2 : B.y1 - SPAN - T / 2);
      const inBath = q => (ax === 'x' ? (end === 'lo' ? q.x < c + T : q.x > c - T) : (end === 'lo' ? q.y < c + T : q.y > c - T));
      // لا باب من أبواب الممر في الطرف المقتطع (ولا باب الغرفة نفسها)
      if (vDoors.some(op => inBath(op.p))) continue;
      // الجدار الجديد بين خطّي الجدارين الحاملين (الوجه + نصف السماكة)
      // طرفا الجدار على خطّي محور الجدارين الحاملين (لا على وجهيهما) فتتصل الطوبولوجيا
      const host = (face, sign) => { const ws = doc.walls.filter(w => w.level === L && (w.kind || 'wall') === 'wall' && (ax === 'x' ? Math.abs(w.a.y - w.b.y) < 1e-6 && Math.min(w.a.x, w.b.x) <= c + 1e-6 && Math.max(w.a.x, w.b.x) >= c - 1e-6 : Math.abs(w.a.x - w.b.x) < 1e-6 && Math.min(w.a.y, w.b.y) <= c + 1e-6 && Math.max(w.a.y, w.b.y) >= c - 1e-6)); const at = w => (ax === 'x' ? w.a.y : w.a.x); const h0 = ws.filter(w => Math.abs(at(w) - (face + sign * (w.t || .2) / 2)) < .03).sort((p, q) => Math.abs(at(p) - face) - Math.abs(at(q) - face))[0]; return h0 ? at(h0) : null; };
      const e0 = host(ax === 'x' ? B.y0 : B.x0, -1), e1 = host(ax === 'x' ? B.y1 : B.x1, 1); if (e0 == null || e1 == null) continue;
      // لا فتحة على الجدارين الحاملين تعبر موضع الجدار الجديد (لا تقاطع تحت فتحة — بوابة التطابق 2D/3D)
      const crosses = doc.openings.some(o => { const w = doc.walls.find(x => x.id === o.wall); if (!w || w.level !== L) return false; const horiz = Math.abs(w.a.y - w.b.y) < 1e-6; if (ax === 'x' ? !horiz : horiz) return false; const lineAt = ax === 'x' ? w.a.y : w.a.x; if (Math.abs(lineAt - e0) > .01 && Math.abs(lineAt - e1) > .01) return false; const ux = (w.b.x - w.a.x), uy = (w.b.y - w.a.y), Lw = Math.hypot(ux, uy) || 1, pos = ax === 'x' ? w.a.x + ux / Lw * o.at : w.a.y + uy / Lw * o.at; return Math.abs(pos - c) < o.w / 2 + T / 2 + .15; }); // JUNC_CLEAR كما في المولّد
      if (crosses) continue;
      const ea = ax === 'x' ? { x: c, y: e0 } : { x: e0, y: c }, eb = ax === 'x' ? { x: c, y: e1 } : { x: e1, y: c };
      const snapshot = JSON.stringify(doc);
      try {
        let r = applyCommand(doc, { type: 'add-wall', level: L, a: ea, b: eb, t: T }); Object.assign(doc, r.doc);
        const wall = doc.walls[doc.walls.length - 1];
        r = applyCommand(doc, { type: 'add-opening', wall: wall.id, kind: 'door', at: Math.hypot(eb.x - ea.x, eb.y - ea.y) / 2, w: .8 }); Object.assign(doc, r.doc);
        const bx = ax === 'x' ? { x0: end === 'lo' ? B.x0 : c + T / 2, x1: end === 'lo' ? c - T / 2 : B.x1, y0: B.y0, y1: B.y1 } : { x0: B.x0, x1: B.x1, y0: end === 'lo' ? B.y0 : c + T / 2, y1: end === 'lo' ? c - T / 2 : B.y1 };
        // تسمية الممر تبقى في الجزء الباقي منه
        const rest = ax === 'x' ? { x: end === 'lo' ? (c + B.x1) / 2 : (B.x0 + c) / 2, y: (B.y0 + B.y1) / 2 } : { x: (B.x0 + B.x1) / 2, y: end === 'lo' ? (c + B.y1) / 2 : (B.y0 + c) / 2 };
        for (const lb of doc.labels.filter(l => l.level === L && V.labelIds.includes(l.id))) lb.seed = { x: r2(rest.x), y: r2(rest.y) };
        r = applyCommand(doc, { type: 'add-label', level: L, seed: { x: (bx.x0 + bx.x1) / 2, y: (bx.y0 + bx.y1) / 2 }, name: 'دورة مياه مشتركة', roomType: 'bath' }); Object.assign(doc, r.doc);
        // المرحاض والمغسلة على الجدار البعيد عن الباب (الطرف)
        const far = ax === 'x' ? (end === 'lo' ? { rot: -Math.PI / 2, x: bx.x0 + .35 } : { rot: Math.PI / 2, x: bx.x1 - .35 }) : (end === 'lo' ? { rot: 0, y: bx.y0 + .35 } : { rot: Math.PI, y: bx.y1 - .35 });
        const along = ax === 'x' ? [bx.y0 + .45, bx.y1 - .45] : [bx.x0 + .45, bx.x1 - .45];
        for (const [k, kind] of [[0, 'wc'], [1, 'basin']]) { const pos = ax === 'x' ? { x: far.x, y: along[k] } : { x: along[k], y: far.y }; r = applyCommand(doc, { type: 'add-fixture', level: L, kind, x: pos.x, y: pos.y, rot: far.rot }); Object.assign(doc, r.doc); }
        // تحقق: الغرفة صار لها حمام على ممرها، والممر ما زال يصل كل أبوابه
        const m2 = analyzeDoc(doc), lv2 = m2.levels.find(l => l.level.id === L), R2 = lv2.rooms.find(x => x.name === R.name), V2 = lv2.roomAt({ x: d.op.p.x + (V.centroid.x - d.op.p.x) * .2, y: d.op.p.y + (V.centroid.y - d.op.p.y) * .2 });
        const okBath = R2 && V2 && nbrs(lv2, V2).some(o => o.type === 'bath' && o.name === 'دورة مياه مشتركة');
        const lostReach = lv2.rooms.some(x => x.type !== 'other' && !lv2.reach.has(x.id)) && lv2.seedKind;
        if (!okBath || lostReach) throw Error('carve-check');
        return `اقتُطعت دورة مياه مشتركة (${SPAN}×${r2(short)} م) من طرف «${V.name}» العريض، تُفتح عليه — لـ«${R.name}» حمام على ممرها (قيمة تصميمية افتراضية للميزان).`;
      } catch { const back = JSON.parse(snapshot); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, back); }
    }
  }
  return null;
}
export default { polishR16 };
void r2;
