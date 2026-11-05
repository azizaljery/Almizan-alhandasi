// مؤشر الخصوصية السعودي: قياس قابل للعدّ لعرفٍ سعودي عام في توزيع البيت (ليس اشتراطًا نظاميًا).
// نقي: يقرأ مستند mizan-draw/1 فقط ويعيد درجة 0-100 مع مخالفات بصيغة «ما المشكلة، أين، وما الإصلاح».
//  - رسم المجاورة: الغرف من التسميات (labels) داخل الفراغات المغلقة، والأبواب من الفتحات (openings) عبر analyzeDoc.
//  - خط الرؤية: أشعة حقيقية من نقطة الوقوف تتقاطع مع الجدران؛ تمرّ عبر فتحة باب (مفتوحًا) وتتوقف عند الجدار.
//  - كل الأوزان والعتبات أدناه تقديرية غير معايرة (THRESHOLDS) ومعلنة في النتيجة.
import { analyzeDoc } from '../draw/digest.mjs';
import { add, mul, dist, segmentIntersection } from '../draw/geom.mjs';

export const PRIVACY_VERSION = 'privacy-index/1';
export const CUSTOM_NOTE = 'قواعد عرف سعودي عام في توزيع البيت (ليست اشتراطًا نظاميًا)، والأوزان تقديرية غير معايرة.';

/** عتبات وأوزان تقديرية غير معايرة. */
export const THRESHOLDS = Object.freeze({
  weights: { guestPath: 30, womenSeparation: 20, bedroomSight: 25, kitchenService: 15, maidEntrance: 10 },
  rayStepDeg: 1.5,      // زاوية بين شعاعين في مروحة الرؤية
  rayFanDeg: 180,       // اتساع المروحة حول اتجاه الدخول
  rayReach: 40,         // م: أقصى مدى للشعاع
  standOff: 0.3,        // م: نقطة الوقوف داخل الباب (بعد نصف سماكة الجدار)
  minSegment: 0.05,     // م: أقل طول لمقطع شعاع يُحسب له فراغ
});

// ------------------------------------------------------------------ أدوار الفراغات (من النوع والاسم)
const RE = {
  men: /رجال|الرجال/u, women: /نساء|النساء|حريم/u, guest: /ضيوف|ضيافة|زوار/u,
  maid: /خادم|شغال|عامل/u, driver: /سائق|سواق/u, dining: /مقلط|طعام|سفرة/u, service: /خدمة/u,
};
const BEDROOM = new Set(['bedroom', 'master']);
const SERVICE_TYPES = new Set(['kitchen', 'laundry', 'storage', 'service', 'garage']);

/** تصنيف فراغ إلى منطقة: men / women / family / service / neutral. */
export function zoneOfRoom(room, ctx = {}) {
  const n = room.name || '', t = room.type;
  if (RE.men.test(n)) return 'men';
  if (RE.women.test(n)) return 'women';
  if (t === 'majlis') return 'men'; // مجلس بلا صفة: مجلس الرجال عرفًا
  if (RE.maid.test(n) || RE.driver.test(n) || SERVICE_TYPES.has(t)) return 'service';
  if (BEDROOM.has(t) || t === 'living') return 'family';
  if (t === 'bath') return ctx.bathZone?.(room) || 'family';
  if (t === 'corridor') return ctx.corridorZone?.(room) || 'neutral';
  if (t === 'dining') return RE.guest.test(n) || RE.dining.test(n) ? 'neutral' : 'family';
  return 'neutral'; // مدخل، سلم، مكتب، غير محدد
}

// ------------------------------------------------------------------ خط الرؤية
/**
 * يتتبع شعاعًا من p في الاتجاه d: يعبر فتحات الأبواب (مفتوحة) ويتوقف عند الجدار. يعيد قائمة الفراغات التي يمرّ بها بالترتيب.
 * lv: مستوى من analyzeDoc. ignoreWall: جدار نقطة الوقوف نفسه.
 */
export function traceRay(lv, p, d, { reach = THRESHOLDS.rayReach, ignoreWall = null } = {}) {
  const far = add(p, mul(d, reach));
  const hits = [];
  for (const w of lv.walls) {
    if (w.id === ignoreWall) continue;
    const h = segmentIntersection(p, far, w.a, w.b);
    if (h && h.t * reach > 1e-6) hits.push({ w, t: h.t * reach, at: h.u * dist(w.a, w.b), point: h.point });
  }
  hits.sort((a, b) => a.t - b.t);
  const rooms = []; let from = 0;
  const seg = (t0, t1) => {
    if (t1 - t0 < THRESHOLDS.minSegment) return;
    const r = lv.roomAt(add(p, mul(d, (t0 + t1) / 2)));
    if (r && (!rooms.length || rooms[rooms.length - 1].id !== r.id)) rooms.push(r);
  };
  for (const h of hits) {
    seg(from, h.t);
    const door = lv.openings.find(op => op.door && op.wall.id === h.w.id && Math.abs(op.o.at - h.at) <= op.w / 2);
    if (!door) return { rooms, blockedAt: h.t, wall: h.w.id };
    from = h.t;
  }
  seg(from, reach);
  return { rooms, blockedAt: null, wall: null };
}

/** مروحة أشعة من فتحة: p نقطة الفتحة، dir اتجاه النظر (وحدة). يعيد خريطة roomId -> { room, via: أسماء الفراغات المعبورة }. */
export function sightFan(lv, p, dir, { ignoreWall = null, fan = THRESHOLDS.rayFanDeg, step = THRESHOLDS.rayStepDeg } = {}) {
  const seen = new Map();
  const base = Math.atan2(dir.y, dir.x), half = fan / 2 * Math.PI / 180, inc = step * Math.PI / 180;
  for (let a = -half + inc / 2; a < half; a += inc) {
    const d = { x: Math.cos(base + a), y: Math.sin(base + a) };
    const { rooms } = traceRay(lv, p, d, { ignoreWall });
    rooms.forEach((r, i) => { if (!seen.has(r.id)) seen.set(r.id, { room: r, via: rooms.slice(0, i).map(x => x.name) }); });
  }
  return seen;
}

// ------------------------------------------------------------------ مسارات على رسم المجاورة
/** أقصر مسار بعدد الفراغات «المكلفة» (cost=1) بين فراغين؛ outside عقدة محايدة. */
function cheapestPath(graph, from, to, costOf) {
  const best = new Map([[from, 0]]), prev = new Map(), queue = [from];
  while (queue.length) {
    queue.sort((a, b) => best.get(a) - best.get(b));
    const id = queue.shift();
    if (id === to) break;
    for (const e of graph.get(id) || []) {
      const c = best.get(id) + costOf(e.to);
      if (c < (best.get(e.to) ?? Infinity)) { best.set(e.to, c); prev.set(e.to, id); if (!queue.includes(e.to)) queue.push(e.to); }
    }
  }
  if (!best.has(to)) return null;
  const path = [to]; while (path[0] !== from) path.unshift(prev.get(path[0]));
  return { cost: best.get(to), path };
}

// ------------------------------------------------------------------ المؤشر
/**
 * @param {object} doc مستند mizan-draw/1
 * @returns {{ score:number|null, applicable:number, criteria:object[], violations:object[], roles:object, note:string, version:string }}
 */
export function privacyIndex(doc, options = {}) {
  const model = options.model || analyzeDoc(doc);
  const lv = model.levels[0];
  const empty = { version: PRIVACY_VERSION, score: null, applicable: 0, criteria: [], violations: [], roles: {}, note: CUSTOM_NOTE + ' لا توجد غرف مغلقة مسمّاة في الدور الأرضي.' };
  if (!lv || !lv.rooms.length) return empty;
  const rooms = lv.rooms.filter(r => !r.unlabelled);
  if (!rooms.length) return empty;
  const byId = new Map(rooms.map(r => [r.id, r]));

  // --- الأدوار
  const majlis = rooms.filter(r => r.type === 'majlis');
  const womenMajlis = majlis.find(r => RE.women.test(r.name)) || null;
  const menMajlis = majlis.find(r => RE.men.test(r.name)) || majlis.find(r => r !== womenMajlis) || null;
  const bedrooms = rooms.filter(r => BEDROOM.has(r.type));
  const maid = rooms.find(r => RE.maid.test(r.name) && r.type !== 'bath') || null;
  const kitchen = rooms.find(r => r.type === 'kitchen') || null;
  const dining = rooms.find(r => r.type === 'dining') || null;
  const living = rooms.filter(r => r.type === 'living');

  // رسم المجاورة: فراغ -> [{to, via}] مع عقدة outside للأبواب الخارجية
  const graph = new Map(rooms.map(r => [r.id, []])); graph.set('outside', []);
  const link = (a, b, via) => { graph.get(a).push({ to: b, via }); graph.get(b).push({ to: a, via }); };
  const exteriorDoors = new Map(); // roomId -> openings
  for (const op of lv.openings) {
    if (!op.door) continue;
    const a = op.left && byId.has(op.left.id) ? op.left : null, b = op.right && byId.has(op.right.id) ? op.right : null;
    if (a && b && a.id !== b.id) link(a.id, b.id, op.id);
    const inner = a && !b ? a : b && !a ? b : null;
    if (inner && op.kind !== 'garage') { link(inner.id, 'outside', op.id); (exteriorDoors.get(inner.id) || exteriorDoors.set(inner.id, []).get(inner.id)).push(op); }
  }
  const neighbours = id => (graph.get(id) || []).map(e => e.to).filter(x => x !== 'outside');
  // دورة مياه: منطقتها من جيرانها عبر الأبواب (دورة على ممر الرجال = رجال...)
  const ctx = {
    womenMajlisExists: !!womenMajlis,
    bathZone: r => { const z = neighbours(r.id).map(id => zoneOfRoom(byId.get(id), {})).filter(z => z !== 'neutral'); return z[0] || (RE.guest.test(r.name) ? 'neutral' : 'family'); },
    corridorZone: r => { const ns = neighbours(r.id).map(id => byId.get(id)); if (ns.some(x => BEDROOM.has(x.type))) return 'family'; const z = ns.map(x => zoneOfRoom(x, {})).filter(z => z === 'men' || z === 'women'); return z.length && z.every(v => v === z[0]) ? z[0] : 'neutral'; },
  };
  const zone = new Map(rooms.map(r => [r.id, zoneOfRoom(r, ctx)]));
  const guestWc = rooms.find(r => r.type === 'bath' && (RE.men.test(r.name) || RE.guest.test(r.name)))
    || rooms.find(r => r.type === 'bath' && zone.get(r.id) === 'men') || null;
  const isFamily = id => id !== 'outside' && zone.get(id) === 'family';
  const familyCost = id => (isFamily(id) ? 1 : id === 'outside' ? 0.01 : 0); // الخروج ثم الدخول مسار ضعيف لا مرفوض
  const livingCost = id => (id === 'outside' ? 0.01 : byId.get(id)?.type === 'living' ? 1 : 0);

  // المداخل: الأبواب الموسومة entry (أو أي باب للخارج) على فراغ غير خدمي
  const entryOps = lv.openings.filter(op => op.door && op.kind !== 'garage' && ((op.left && !op.right) || (!op.left && op.right)));
  const flagged = entryOps.filter(op => op.o.entry);
  const candidates = (flagged.length ? flagged : entryOps).filter(op => byId.has((op.left || op.right).id));
  const nonService = candidates.filter(op => zone.get((op.left || op.right).id) !== 'service');
  const guestEntries = nonService.length ? nonService : candidates; // لا مدخل غير خدمي: يُعدّ كل باب خارجي مدخلًا
  const mainEntry = guestEntries.find(op => zone.get((op.left || op.right).id) !== 'men') || guestEntries[0] || null;

  const criteria = [], violations = [];
  const W = THRESHOLDS.weights;
  const names = ids => ids.map(id => (id === 'outside' ? 'الخارج' : byId.get(id)?.name || id));
  const addCriterion = (id, label, weight, earned, details, status = earned === null ? 'na' : earned >= weight - 1e-9 ? 'ok' : 'violation') => criteria.push({ id, label, weight, earned, status, details });
  const violate = (criterion, problem, where, fix) => violations.push({ criterion, problem, where, fix });

  // (أ) مسار الضيف: من المدخل إلى مجلس الرجال ودورة مياه الضيوف دون عبور منطقة العائلة
  if (!menMajlis) addCriterion('guestPath', 'مسار الضيف لا يعبر منطقة العائلة', W.guestPath, null, 'لا يوجد مجلس في الدور الأرضي؛ المعيار غير منطبق.');
  else {
    const targets = [['مجلس الرجال', menMajlis], ['دورة مياه الضيوف', guestWc]];
    let earned = 0; const details = [];
    for (const [what, target] of targets) {
      const part = W.guestPath / targets.length;
      if (!target) { details.push(`${what}: لا توجد دورة مياه للضيوف في الدور الأرضي.`); violate('guestPath', 'لا توجد دورة مياه مخصصة للضيوف قريبة من المجلس.', [menMajlis.name], 'أضف دورة مياه تفتح على ردهة المجلس أو مدخله لا على الصالة.'); continue; }
      const paths = guestEntries.map(op => cheapestPath(graph, (op.left || op.right).id, target.id, familyCost)).filter(Boolean);
      const best = paths.sort((a, b) => a.cost - b.cost)[0];
      if (!best) { details.push(`${what}: لا مسار عبر الأبواب من أي مدخل.`); violate('guestPath', `لا يصل الضيف عبر الأبواب من المدخل إلى ${what}.`, [target.name], 'اربط المدخل بالمجلس بباب أو ردهة.'); continue; }
      const crossed = best.path.filter(isFamily);
      if (!crossed.length) { earned += part; details.push(`${what}: المسار ${names(best.path).join(' ← ')} بلا عبور للعائلة.`); }
      else { details.push(`${what}: المسار ${names(best.path).join(' ← ')} يعبر ${crossed.length} فراغ عائلي.`); violate('guestPath', `الضيف يمرّ بمنطقة العائلة (${names(crossed).join('، ')}) في طريقه إلى ${what}.`, names(best.path).filter(n => n !== 'الخارج'), `افصل مدخل الرجال عن مدخل العائلة أو افتح بابًا مباشرًا من الردهة إلى ${target.name} يتجاوز ${names(crossed)[0]}.`); }
    }
    addCriterion('guestPath', 'مسار الضيف لا يعبر منطقة العائلة', W.guestPath, Math.round(earned * 100) / 100, details.join(' '));
  }

  // (ب) مجلس النساء مفصول عن مجلس الرجال: لا باب مباشر ولا خط رؤية من المدخل الرئيسي
  if (!womenMajlis || !menMajlis) addCriterion('womenSeparation', 'فصل مجلس النساء عن مجلس الرجال والمدخل', W.womenSeparation, null, 'لا يوجد مجلس نساء مسمّى في الدور الأرضي؛ المعيار غير منطبق.');
  else {
    let earned = 0; const details = [];
    const direct = (graph.get(womenMajlis.id) || []).find(e => e.to === menMajlis.id);
    if (direct) { details.push('يوجد باب مباشر بين المجلسين.'); violate('womenSeparation', 'باب مباشر بين مجلس النساء ومجلس الرجال.', [womenMajlis.name, menMajlis.name], 'أغلق الباب المباشر واجعل الوصول عبر ردهة أو ممر خاص بكل مجلس.'); }
    else { earned += W.womenSeparation / 2; details.push('لا باب مباشر بين المجلسين.'); }
    const seen = mainEntry ? sightFromOpening(lv, mainEntry) : new Map();
    const hit = seen.get(womenMajlis.id);
    if (hit) { details.push(`خط رؤية من المدخل الرئيسي إلى مجلس النساء عبر ${hit.via.join(' ← ') || 'الباب مباشرة'}.`); violate('womenSeparation', 'مجلس النساء يقع على خط رؤية من باب المدخل الرئيسي عند فتح الأبواب.', [mainEntry ? (mainEntry.left || mainEntry.right).name : 'المدخل', ...hit.via, womenMajlis.name], 'حرّك باب مجلس النساء بعيدًا عن محور المدخل أو أضف ساترًا/ردهة منكسرة.'); }
    else { earned += W.womenSeparation / 2; details.push(mainEntry ? 'لا خط رؤية من المدخل الرئيسي إلى مجلس النساء.' : 'لا باب مدخل محدد؛ عُدّ خط الرؤية غير قائم.'); }
    addCriterion('womenSeparation', 'فصل مجلس النساء عن مجلس الرجال والمدخل', W.womenSeparation, earned, details.join(' '));
  }

  // (ج) غرف النوم خارج خط الرؤية من المدخل ومن باب المجلس
  if (!bedrooms.length) addCriterion('bedroomSight', 'غرف النوم خارج خط الرؤية من المدخل والمجلس', W.bedroomSight, null, 'لا غرف نوم في الدور الأرضي؛ المعيار غير منطبق (غرف الأدوار العليا خارج خط الرؤية).');
  else {
    const vantages = [];
    for (const op of guestEntries) vantages.push({ label: 'باب «' + (op.left || op.right).name + '» الخارجي', seen: sightFromOpening(lv, op) });
    for (const m of majlis) for (const op of lv.openings.filter(o => o.door && (o.left?.id === m.id || o.right?.id === m.id) && o.left && o.right)) {
      const out = op.left.id === m.id ? mul(op.n, -1) : op.n; // من المجلس إلى الخارج منه
      vantages.push({ label: 'باب ' + m.name, seen: sightFan(lv, add(op.p, mul(out, op.wall.t / 2 + THRESHOLDS.standOff)), out, { ignoreWall: op.wall.id }) });
    }
    let exposed = 0; const details = [];
    for (const b of bedrooms) {
      const v = vantages.find(x => x.seen.has(b.id));
      if (!v) continue;
      exposed++; const via = v.seen.get(b.id).via;
      details.push(`${b.name} مكشوفة من ${v.label}${via.length ? ' عبر ' + via.join(' ← ') : ''}.`);
      violate('bedroomSight', `باب «${b.name}» على خط رؤية من ${v.label} عند فتح الأبواب.`, [v.label, ...via, b.name], 'انقل باب الغرفة إلى جدار لا يواجه محور الرؤية، أو اعكس جهة مفصلته، أو أضف ساترًا/كسرة في الممر.');
    }
    const earned = Math.round(W.bedroomSight * (bedrooms.length - exposed) / bedrooms.length * 100) / 100;
    addCriterion('bedroomSight', 'غرف النوم خارج خط الرؤية من المدخل والمجلس', W.bedroomSight, earned, details.length ? details.join(' ') : `كل غرف النوم (${bedrooms.length}) خارج خط الرؤية من ${vantages.length} نقطة وقوف.`);
  }

  // (د) المطبخ يخدم المقلط/المجلس دون عبور الصالة
  if (!kitchen) addCriterion('kitchenService', 'المطبخ يخدم المقلط والمجلس دون عبور الصالة', W.kitchenService, null, 'لا مطبخ في الدور الأرضي؛ المعيار غير منطبق.');
  else {
    const targets = [dining ? ['المقلط/الطعام', dining] : null, menMajlis ? ['المجلس', menMajlis] : null].filter(Boolean);
    if (!targets.length) addCriterion('kitchenService', 'المطبخ يخدم المقلط والمجلس دون عبور الصالة', W.kitchenService, null, 'لا مقلط ولا مجلس يخدمهما المطبخ؛ المعيار غير منطبق.');
    else {
      let earned = 0; const details = [];
      for (const [what, t] of targets) {
        const part = W.kitchenService / targets.length, best = cheapestPath(graph, kitchen.id, t.id, livingCost);
        if (!best) { details.push(`${what}: لا مسار من المطبخ.`); violate('kitchenService', `لا مسار خدمة من المطبخ إلى ${what}.`, [kitchen.name, t.name], 'أضف باب خدمة أو ممرًا بين المطبخ و' + t.name + '.'); continue; }
        const crossed = best.path.filter(id => livingCost(id) >= 1);
        if (!crossed.length) { earned += part; details.push(`${what}: ${names(best.path).join(' ← ')} بلا عبور للصالة${best.path.includes('outside') ? ' (مسار عبر الخارج؛ ضعيف لكنه مقبول)' : ''}.`); }
        else { details.push(`${what}: ${names(best.path).join(' ← ')} يعبر الصالة.`); violate('kitchenService', `خدمة ${what} من المطبخ تعبر ${names(crossed).join('، ')}.`, names(best.path), `افتح باب خدمة من المطبخ إلى ${t.name} مباشرة أو ممر خدمة خلفي، أو انقل المطبخ ليجاور ${t.name}.`); }
      }
      addCriterion('kitchenService', 'المطبخ يخدم المقلط والمجلس دون عبور الصالة', W.kitchenService, Math.round(earned * 100) / 100, details.join(' '));
    }
  }

  // (هـ) غرفة الخادمة بمدخل خدمة
  if (!maid) addCriterion('maidEntrance', 'غرفة الخادمة بمدخل خدمة', W.maidEntrance, null, 'لا غرفة خادمة مسمّاة؛ المعيار غير منطبق.');
  else {
    const best = cheapestPath(graph, maid.id, 'outside', id => (id !== 'outside' && zone.get(id) !== 'service' && byId.get(id)?.type !== 'corridor' ? 1 : 0));
    const crossed = best ? best.path.filter(id => id !== 'outside' && zone.get(id) !== 'service' && byId.get(id)?.type !== 'corridor') : null;
    if (best && !crossed.length) addCriterion('maidEntrance', 'غرفة الخادمة بمدخل خدمة', W.maidEntrance, W.maidEntrance, `مسار الخدمة: ${names(best.path).join(' ← ')} ← الخارج.`);
    else {
      addCriterion('maidEntrance', 'غرفة الخادمة بمدخل خدمة', W.maidEntrance, 0, best ? `الوصول إلى الخارج يعبر ${names(crossed).join('، ')}.` : 'لا مسار من غرفة الخادمة إلى الخارج.');
      violate('maidEntrance', best ? `غرفة الخادمة لا تملك مدخل خدمة؛ خروجها يعبر ${names(crossed).join('، ')}.` : 'غرفة الخادمة بلا مسار إلى الخارج.', [maid.name, ...(best ? names(crossed) : [])], 'أضف باب خدمة خارجيًا لغرفة الخادمة أو للمطبخ المجاور لها.');
    }
  }

  const applicable = criteria.filter(c => c.earned !== null);
  const totalW = applicable.reduce((s, c) => s + c.weight, 0), totalE = applicable.reduce((s, c) => s + c.earned, 0);
  const roles = { menMajlis: menMajlis?.name || null, womenMajlis: womenMajlis?.name || null, guestWc: guestWc?.name || null, kitchen: kitchen?.name || null, dining: dining?.name || null, maid: maid?.name || null, bedrooms: bedrooms.map(b => b.name), living: living.map(l => l.name), mainEntry: mainEntry ? (mainEntry.left || mainEntry.right).name : null, zones: Object.fromEntries(rooms.map(r => [r.name, zone.get(r.id)])) };
  return { version: PRIVACY_VERSION, score: totalW ? Math.round(totalE / totalW * 100) : null, applicable: applicable.length, criteria, violations, roles, note: CUSTOM_NOTE };
}

/** مروحة رؤية من باب خارجي إلى داخل البيت (نقطة الوقوف داخل الباب). */
function sightFromOpening(lv, op) {
  const inward = op.left ? op.n : mul(op.n, -1);
  return sightFan(lv, add(op.p, mul(inward, op.wall.t / 2 + THRESHOLDS.standOff)), inward, { ignoreWall: op.wall.id });
}

export const ZONE_AR = Object.freeze({ men: 'الرجال', women: 'النساء', family: 'العائلة', service: 'الخدمة', neutral: 'محايد' });
export default { PRIVACY_VERSION, THRESHOLDS, CUSTOM_NOTE, ZONE_AR, privacyIndex, zoneOfRoom, traceRay, sightFan };
