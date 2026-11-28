// قياسات من المستند والأبواب الفعلية، مستقلة عن درجة المولّد وجمال الصورة.
// الحدود أدناه أهداف تصميمية قابلة للتعديل، وليست مواد من كود البناء السعودي.
import { analyzeDoc, compassOf } from '../draw/digest.mjs';
import { pointInPolygon, segmentIntersection, dist } from '../draw/geom.mjs';

export const QUALITY_SCHEMA = 'architect-quality/1';
export const SAUDI_TARGETS = Object.freeze({ hallAspect: 1.8, hallWidth: 4, hallArea: 36, hallShare: .22, servingMetres: 8, guestDiningMetres: 10, parentBathMetres: 5 });
const round = n => Math.round(n * 100) / 100;
const privateRoom = r => ['bedroom', 'master', 'bath', 'wc', 'service', 'storage', 'laundry'].includes(r.type);
const womenRoom = r => r.type === 'majlis' && /نساء|نسائي|حريم/.test(r.name);
const menRoom = r => r.type === 'majlis' && /رجال|رجالي/.test(r.name);
const living = r => r.type === 'living';
const inside = (p, r) => pointInPolygon(p, r.net, 1e-7) && !(r.space.holes || []).some(h => pointInPolygon(p, h, -1));

// Visibility segments must stay in the actual clear polygon, including concavities/holes.
function visible(a, b, r) {
  if (!inside(a, r) || !inside(b, r)) return false;
  const cuts = [0, 1];
  for (const ring of [r.net, ...(r.space.holes || [])]) for (let i = 0; i < ring.length; i++) {
    const h = segmentIntersection(a, b, ring[i], ring[(i + 1) % ring.length], 1e-9);
    if (h && h.t > 1e-7 && h.t < 1 - 1e-7) cuts.push(h.t);
  }
  cuts.sort((a, b) => a - b);
  return cuts.slice(1).every((t, i) => { const k = (t + cuts[i]) / 2; return inside({ x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y) }, r); });
}
function shortest(nodes, edges, starts, goals, blocked = new Set()) {
  const ds = new Map(starts.map(id => [id, 0])), prev = new Map(), done = new Set();
  while (true) {
    let id = null, best = Infinity;
    for (const [k, d] of ds) if (!done.has(k) && d < best) { id = k; best = d; }
    if (id === null) return null;
    if (goals.has(id)) {
      const ids = [id]; while (prev.has(ids[0])) ids.unshift(prev.get(ids[0]));
      return { metres: round(best), roomIds: [...new Set(ids.map(i => nodes.get(i).room))], openingIds: [...new Set(ids.map(i => nodes.get(i).opening).filter(Boolean))], points: ids.map(i => nodes.get(i).p) };
    }
    done.add(id);
    for (const e of edges.get(id) || []) {
      if (blocked.has(nodes.get(e.to).room)) continue;
      const d = best + e.metres;
      if (d < (ds.get(e.to) ?? Infinity) - 1e-8) { ds.set(e.to, d); prev.set(e.to, id); }
    }
  }
}

/** Shortest polygonal route between in-room reference points, through actual doors. No body-clearance simulation. */
export function doorRoutes(level) {
  const nodes = new Map(), edges = new Map(), byRoom = new Map(), byOpening = new Map();
  const add = (id, p, room, opening = null) => { nodes.set(id, { p, room, opening }); edges.set(id, []); if (!byRoom.has(room)) byRoom.set(room, []); byRoom.get(room).push(id); return id; };
  const join = (a, b) => { const metres = dist(nodes.get(a).p, nodes.get(b).p); edges.get(a).push({ to: b, metres }); edges.get(b).push({ to: a, metres }); };
  for (const op of level.openings.filter(o => o.door && o.w >= .6 && o.kind !== 'garage')) {
    const ids = [];
    for (const s of op.sides) {
      if (s.room.type === 'court') continue;
      const p = { x: op.p.x - s.outward.x * (op.wall.t / 2 + .002), y: op.p.y - s.outward.y * (op.wall.t / 2 + .002) };
      if (!inside(p, s.room)) continue;
      ids.push(add(`${op.id}:${s.room.id}`, p, s.room.id, op.id));
    }
    byOpening.set(op.id, ids);
    if (ids.length === 2) join(ids[0], ids[1]);
  }
  for (const r of level.rooms) {
    const doors = [...(byRoom.get(r.id) || [])];
    if (!doors.length) continue;
    if (inside(r.inside, r)) add(`anchor:${r.id}`, r.inside, r.id);
    // Boundary vertices allow a valid turn around an L-shaped room; holes remain obstacles.
    for (const [i, p] of [r.net, ...(r.space.holes || [])].flat().entries()) add(`vertex:${r.id}:${i}`, p, r.id);
    const ids = byRoom.get(r.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (visible(nodes.get(ids[i]).p, nodes.get(ids[j]).p, r)) join(ids[i], ids[j]);
  }
  const roomDoors = id => (byRoom.get(id) || []).filter(i => nodes.get(i).opening);
  return {
    between(a, b, blocked = []) { return shortest(nodes, edges, nodes.has(`anchor:${a}`) ? [`anchor:${a}`] : [], new Set(nodes.has(`anchor:${b}`) ? [`anchor:${b}`] : []), new Set(blocked)); },
    fromEntry(entry, target, blocked = []) {
      const ban = new Set(blocked), starts = (byOpening.get(entry.via) || []).filter(i => nodes.get(i).room === entry.room && !ban.has(entry.room));
      return shortest(nodes, edges, starts, new Set(nodes.has(`anchor:${target}`) ? [`anchor:${target}`] : []), ban);
    },
  };
}

export function evaluateSaudiQuality(doc, contract = {}, { model = null } = {}) {
  const limits = { ...SAUDI_TARGETS, ...(contract.limits || {}) }, checks = [];
  const add = (id, title, state, reason, evidence = {}, roomIds = [], levelId = null) => checks.push({ id, title, state, required: true, reason, evidence, roomIds, levelId });
  if (Object.values(limits).some(n => !Number.isFinite(n) || n <= 0)) { add('limits', 'أهداف القياس', 'unknown', 'حدود الجودة يجب أن تكون أرقامًا موجبة منتهية.'); return finish(); }
  let m; try { m = model || analyzeDoc(doc); } catch { add('geometry', 'قراءة الهندسة', 'unknown', 'تعذّر تحليل المستند.'); return finish(); }
  for (const lv of m.levels) {
    const net = lv.rooms.reduce((s, r) => s + r.area, 0);
    for (const r of lv.rooms.filter(living)) {
      const aspect = r.rect.l / r.rect.w, cap = Math.max(limits.hallArea, limits.hallShare * net);
      const regular = r.shape === 'rectangle', failed = r.rect.w < limits.hallWidth - .02 || r.area > cap + .02 || (regular && aspect > limits.hallAspect + .02);
      add(`hall:${r.id}`, 'صالة متناسبة قابلة للتأثيث', failed ? 'fail' : regular ? 'pass' : 'unknown',
        `${r.name}: ${round(r.rect.w)} × ${round(r.rect.l)} م، ${round(r.area)} م²؛ المستهدف عرض ≥ ${limits.hallWidth} م، نسبة ≤ ${limits.hallAspect} ومساحة ≤ ${round(cap)} م².${regular ? '' : ' الشكل غير مستطيل: صلاحية منطقة الجلسة تحتاج مراجعة.'}`,
        { width: round(r.rect.w), length: round(r.rect.l), aspect: round(aspect), area: round(r.area), cap: round(cap), shape: r.shape, limits }, [r.id], lv.level.id);
    }
  }
  const ground = m.levels[0];
  if (!ground) { add('ground', 'الدور الأرضي', 'unknown', 'لا يوجد دور أرضي.'); return finish(); }
  const routes = doorRoutes(ground), rooms = ground.rooms;
  const men = rooms.filter(menRoom), women = rooms.filter(womenRoom), family = women.length ? women : rooms.filter(living);
  if (contract.separateEntries !== false && men.length && family.length) {
    const maleBan = rooms.filter(r => privateRoom(r) || living(r) || womenRoom(r) || r.type === 'kitchen').map(r => r.id);
    const femaleBan = rooms.filter(r => privateRoom(r) || menRoom(r) || r.type === 'kitchen').map(r => r.id);
    const male = ground.entries.flatMap(e => men.map(r => ({ entry: e, target: r.id, route: routes.fromEntry(e, r.id, maleBan) }))).filter(x => x.route);
    const female = ground.entries.flatMap(e => family.map(r => ({ entry: e, target: r.id, route: routes.fromEntry(e, r.id, femaleBan) }))).filter(x => x.route);
    const pair = male.flatMap(a => female.map(b => ({ male: a, female: b }))).find(({ male: a, female: b }) => a.entry.via !== b.entry.via && !a.route.roomIds.some(id => b.route.roomIds.includes(id)));
    add('independent-entries', 'مدخل رجال ومدخل نساء/عائلة مستقلان', pair ? 'pass' : 'fail', pair ? 'بابان خارجيان مختلفان ومساران داخليان لا يتشاركان غرفة؛ لا يعبر الرجال الصالة أو مجلس النساء.' : 'لم يُثبت بابان بمسارين مستقلين إلى مجلس الرجال والنساء/العائلة. اختلاف تسمية الباب لا يكفي.', pair || { entries: ground.entries, maleRoutes: male.length, femaleRoutes: female.length }, [...men, ...family].map(r => r.id), ground.level.id);
  } else add('independent-entries', 'استقلال المداخل', contract.separateEntries === false ? 'na' : 'unknown', contract.separateEntries === false ? 'اختار العميل استقبالًا مشتركًا.' : 'برنامج الضيافة أو وجهة العائلة غير مكتمل.');
  const diners = rooms.filter(r => r.type === 'dining'), kitchens = rooms.filter(r => r.type === 'kitchen');
  const servingBan = rooms.filter(r => privateRoom(r) || living(r) || r.type === 'majlis').map(r => r.id);
  const guestBan = rooms.filter(r => privateRoom(r) || living(r) || womenRoom(r) || r.type === 'kitchen').map(r => r.id);
  const routeCheck = (id, title, from, ban, max) => {
    if (contract.diningService === false) { add(id, title, 'na', 'اختار العميل الاستغناء عن غرفة الطعام المستقلة.'); return; }
    const pairs = from.flatMap(a => diners.map(b => ({ from: a.id, to: b.id, route: routes.between(a.id, b.id, ban) }))).filter(x => x.route).sort((a, b) => a.route.metres - b.route.metres);
    const best = pairs[0];
    add(id, title, !from.length || !diners.length ? 'unknown' : best && best.route.metres <= max ? 'pass' : 'fail', best ? `المسار بين نقطتي الغرفتين عبر الأبواب ${best.route.metres} م (المستهدف ≤ ${max} م)، دون عبور الصالة أو غرف النوم.` : 'لا يوجد مسار عبر الأبواب يحقق فصل الضيافة والخدمة؛ التلاصق بجدار لا يثبت الوصول.', best || { maxMetres: max }, best ? [best.from, best.to] : from.concat(diners).map(r => r.id), ground.level.id);
  };
  routeCheck('kitchen-dining', 'خدمة المطبخ إلى الطعام', kitchens, servingBan, limits.servingMetres);
  if (men.length) routeCheck('men-dining', 'وصول الرجال إلى الطعام', men, guestBan, limits.guestDiningMetres);
  if (contract.parentsResident) {
    const parents = rooms.filter(r => /كبار السن|الوالد|والدت|والدي|الأم|الوالدة/.test(r.name));
    const baths = rooms.filter(r => ['bath', 'wc'].includes(r.type));
    const paths = parents.flatMap(a => baths.map(b => ({ from: a.id, to: b.id, route: routes.between(a.id, b.id, rooms.filter(r => menRoom(r) || womenRoom(r) || r.type === 'kitchen').map(r => r.id)) }))).filter(p => p.route).sort((a, b) => a.route.metres - b.route.metres);
    add('parents-ground', 'غرفة الوالدين وحمام قريب في الأرضي', parents.length && paths[0]?.route.metres <= limits.parentBathMetres ? 'pass' : parents.length ? 'fail' : 'unknown', parents.length ? 'القياس عبر الأبواب على الأرضي؛ لا يثبت مساحة دوران الكرسي أو خلو المسار من الأثاث والعتبات.' : 'لم أجد غرفة موثقة للوالدين في الأرضي.', paths[0] || {}, parents.map(r => r.id), ground.level.id);
    if (contract.stepFree) add('step-free', 'مسار بلا درجات وعرض حركة مناسب', 'unknown', 'العتبات وميول الموقع وفراغ دوران الكرسي غير ممثلة بالكامل؛ يلزم فحص مختص. لا يمنح قرب الحمام اعتماد وصول شامل.');
  }
  if (contract.quietSide) {
    const affected = [];
    for (const lv of m.levels) for (const op of lv.openings.filter(o => o.window)) for (const s of op.sides) {
      if (s.exterior && ['bedroom', 'master'].includes(s.room.type) && compassOf(s.outward, 0) === contract.quietSide) affected.push({ roomId: s.room.id, openingId: op.id, side: contract.quietSide, trueCompass: s.compass });
    }
    add('bedroom-exposure', 'واجهة النوم والشارع الذي حدده العميل', affected.length ? 'fail' : 'pass', affected.length ? 'توجد نافذة نوم على الواجهة التي حددتها أكثر ضوضاء/كشفًا.' : 'لم أجد نافذة نوم على تلك الواجهة. هذا فحص اتجاهات فقط ولا يقيس العزل الصوتي أو كشف الجار.', { side: contract.quietSide, affected }, affected.map(a => a.roomId));
  }
  if (contract.siteUnobserved) add('site-survey', 'معاينة واجهات الموقع', 'unknown', 'العميل لم يعاين الموقع بعد؛ الضوضاء وكشف الجيران غير متحققين، ولا أستنتجهما من المدينة.');
  if (['exposed','unknown'].includes(contract.coastalExposure)) add('material-exposure', 'تعرض الخامات للرطوبة والملوحة', 'unknown', 'سُجلت حالة الموقع؛ مقاومة التآكل وتفاصيل الحماية والعزل تحتاج مواصفات ومراجعة مختص، ولا يثبتها لون الخامة في الصورة.');
  if (['sloped','unknown'].includes(contract.siteSlope)) add('site-levels', 'مناسيب الأرض وتصريف المطر', 'unknown', 'يلزم رفع مساحي وتفاصيل المدخل والتصريف؛ المولّد المسطّح لا يثبت صلاحية الدخول على أرض مائلة.');
  if (['shared', 'later'].includes(contract.roomSharing) && !contract.childRoomsReviewed) add('child-room-program', 'عدد غرف الأبناء وتقاسمها', 'unknown', 'اخترت تحديد التقاسم من البرنامج؛ حدّد صفوف غرف الأبناء في الجدول حتى لا يتحول افتراض طفلين لكل غرفة إلى قرار معتمد.');
  if (contract.futureFlexibility) add('future-flexibility', 'مرونة التوسع المستقبلي', 'unknown', 'سُجل طلب المرونة؛ قابلية الإضافة ومسارات الإنشاء والخدمات تحتاج دراسة مستقلة ولا تثبت بتكبير الغرف.');
  return finish();
  function finish() {
    const failed = checks.filter(c => c.state === 'fail'), unknown = checks.filter(c => c.state === 'unknown');
    return { schema: QUALITY_SCHEMA, status: failed.length ? 'needs-revision' : unknown.length ? 'unverified' : 'pass', eligible: !failed.length && !unknown.length, checks, failed: failed.map(c => c.id), unknown: unknown.map(c => c.id), limitations: ['المسارات بين نقاط داخل الغرف عبر الأبواب، بلا محاكاة أثاث أو جسم إنسان.', 'الحدود أهداف تصميمية وليست شهادة اشتراطات أو اعتمادًا إنشائيًا.'] };
  }
}

/** Stable selection: hard failures cannot be compensated with visual or generator scores. */
export function qualityAdmissible(report) {
  return !report.failed.length && !report.unknown.some(id => ['geometry', 'ground', 'limits', 'independent-entries', 'kitchen-dining', 'men-dining'].includes(id));
}
export function selectSaudiDesigns(designs, contract, keep = designs.length) {
  const reviewed = designs.map(d => ({ ...d, architectQuality: evaluateSaudiQuality(d.doc, contract) }));
  return { designs: reviewed.filter(d => qualityAdmissible(d.architectQuality)).slice(0, keep), rejected: reviewed.filter(d => !qualityAdmissible(d.architectQuality)).map(d => ({ pat: d.pat, mode: d.mode, report: d.architectQuality })), checked: reviewed.length };
}
