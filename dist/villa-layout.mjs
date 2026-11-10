// مولّد مخطط الفيلا المهني: يوزّع البرنامج على مناطق كما في ممارسة الفلل الخليجية
// (عامة قرب المدخل، عائلية في الوسط، خاصة بعيدًا عنه)، ويجعل كل غرفة نوم جناحًا بحمامه الملحق وخزانته،
// ويرتّب الحمامات ظهرًا لظهر على جدار مشترك، ويجعل الصالة محور الحركة بدل الممرات الطويلة،
// ويضع كل فراغ معيشي على جدار خارجي بنافذة.
// على مرحلتين (كما في أدبيات توليد المخططات): (1) بحث حتمي في أنماط معروفة (صالة مركزية، شكل T،
// صفّان وممر، صالة جانبية) وتوزيع الكتل وترتيبها، (2) حلّ الأبعاد بالنِّسب داخل الأرض القابلة للبناء بلا
// فراغ ميت. ثم يُبنى مستند المرسم بالجدران والفتحات والأثاث، ويُفحص كل بديل ويُرفض المعيب.
// المقاسات المستهدفة افتراضات تصميمية من التطبيق قابلة للضبط، وليست اشتراطات نظامية.
// نقي: لا DOM ولا تخزين ولا شبكة.
import { createDoc, applyCommand, validateDoc } from './draw/doc.mjs';
import { analyzeWalls } from './draw/topology.mjs';
import { footprint, validatePlot } from './planner.mjs';
import { planGarden } from './garden-plan.mjs';
import { pointInPolygon } from './draw/geom.mjs';
import { planElevator } from './elevator-plan.mjs';
import { reviewDoc, swingSectors, sectorPoints, fixtureRect, penetration } from './draw/review.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { rulePenalty, verifyRequest, blocksFor } from './rules.mjs';

export const VILLA_ENGINE_VERSION = 'villa-zones-2';
const LV = 'L1', SNAP = .05, EXT = .25, INT = .12, EPS = 1e-6;
const snap = v => Math.round(v / SNAP) * SNAP;
const r2 = v => Math.round(v * 100) / 100;

/** افتراضات تصميمية (م²/م) من التطبيق؛ ليست اشتراطات نظامية. */
export const DESIGN_TARGETS = Object.freeze({
  // دورة مياه الضيوف (الرجال/النساء): طولها وعمق شريط «المغاسل» يعطيان صافيًا ≥ 2.5 م² (الحد الإرشادي في كتالوج المرسم): 1.38 × 1.91 م
  majlis: 26, majlisMinW: 3.6, guestStripW: 1.6, guestWcL: 2.1, washD: 1.6,
  foyer: 10, hall: 30, family: 22, dining: 15, kitchen: 13, kitchen2: 8,
  bedroom: 14, master: 19, stripD: 1.7, masterStripD: 2.2, bathL: 2.5, masterBathL: 3.2,
  commonStripW: 1.6, commonBathL: 2.3, galleryW: 1.6,
});
/**
 * سقوف تضخّم الفراغ عن مقاسه (افتراض تصميمي من الميزان، ليس اشتراطًا نظاميًا): الفائض من مسطح الدور لا يُصبّ في غرفة واحدة.
 * soft: فوقه كلفة متصاعدة؛ hard: فوقه يُرفض الترتيب إن زادت الكتلة عن مقاسها بأكثر من slack م² (الكتل الصغيرة كالمطبخ لا تُرفض لبضعة أمتار). bedNet: أقصى صافي تقريبي لغرفة النوم بعد شريط حمامها (م²).
 * المقاس الذي حدده العميل نفسه (fixedArea، أو «كبير») هو المرجع: السقف يُقاس عليه لا على افتراض التطبيق.
 */
export const ROOM_CAPS = Object.freeze({ soft: 1.3, hard: 1.7, bedNet: { master: 31, bedroom: 24 }, filler: { min: 11, max: 24, min2: 9, max2: 16, living: 17 }, fillerHard: 1.45, fillerCost: 3, doubleFiller: 70, fillerStarve: .8, slack: 11, hall: 1.9 });
/**
 * الفراغات الخارجية المحفورة في الكتلة: «تراس» علوي فوق جزء من الأرضي، و«جلسة خارجية» أرضية تطل عليها الصالة.
 * تمتص فائض المسطح بدل غرف لم يطلبها العميل، وتجعل الكتلة غير صندوقية. حدود تصميمية للميزان (ليست اشتراطات نظامية):
 * min/max مساحة التراس، minSide أقل ضلع، cost كلفة لكل م² (أقل من كلفة غرفة الفائض)، parapet/seatWall ارتفاع الحاجز.
 */
export const OPEN_CAPS = Object.freeze({ terrace: { min: 9, max: 30, minSide: 2.6, cost: 1.2 }, patio: { area: 14, minSide: 3.0, cost: 1.6 }, parapet: 1.1, seatWall: .45, starve: .9 });
const MIN_SIDE = { majlis: 3.6, dining: 3.0, kitchen: 2.6, family: 3.4, suite: 3.0, foyer: 2.4, hall: 3.4, maid: 2.6, driver: 2.6, office: 2.8, prayer: 2.4 };

// ------------------------------------------------------------------------------------------ البرنامج
/**
 * يحوّل الأعداد إلى كتل تصميمية. counts: { bedrooms, majlis, baths, kitchens, halls, dining }.
 * لا قيم مسبقة: ما لم يُعطَ يُعد صفرًا (عدا غرفة نوم واحدة على الأقل).
 */
export function buildProgram(counts = {}, req = {}) {
  const n = k => (Number.isInteger(counts[k]) && counts[k] > 0 ? counts[k] : 0);
  const N = n('bedrooms'), M = n('majlis'), B = n('baths'), K = n('kitchens'), H = n('halls'), Dn = n('dining');
  if (N < 1) throw Error('البرنامج يحتاج غرفة نوم واحدة على الأقل.');
  const T = DESIGN_TARGETS, blocks = [], notes = [];
  let baths = B;
  const pr0 = req.prefs || {}, ex0 = req.extras || {};
  // دورات المياه بالترتيب: الرجال، النساء، الرئيسية، ثم بقية الغرف (مشتركة كل غرفتين ما لم يُطلب حمام لكل غرفة)
  const menWc = M > 0 && baths > 0 ? 1 : 0; baths -= menWc;
  const womenWc = M > 1 && baths > 0 ? 1 : 0; baths -= womenWc;
  const guestWc = menWc + womenWc;
  const masterBath = baths > 0 ? 1 : 0; baths -= masterBath;
  // الخادمة والسائق إن طلبا حمامًا يُحجز لهما قبل غرف النوم
  const reserve = (ex0.maid?.bath ? 1 : 0) + (ex0.driver?.bath ? 1 : 0), forRooms = Math.max(0, baths - reserve);
  const others = N - 1;
  let ensuite = 0, shared = 0;
  if (pr0.sharedBaths && !pr0.allEnsuite) shared = Math.min(forRooms, Math.ceil(others / 2));
  else if (pr0.allEnsuite || forRooms >= others) ensuite = Math.min(others, forRooms);
  else { for (let e = others; e >= 0; e--) { const sh = Math.ceil((others - e) / 2); if (e + sh <= forRooms) { ensuite = e; shared = sh; break; } } if (!ensuite && !shared && forRooms > 0) shared = Math.min(forRooms, Math.ceil(others / 2)); }
  baths -= ensuite + shared;
  const attached = masterBath + ensuite;
  for (let i = 0; i < M; i++) {
    const men = i === 0, women = i === 1;
    blocks.push({ id: 'majlis' + (i + 1), kind: 'majlis', rank: i ? .5 : 0, area: T.majlis * (i ? .85 : 1), name: M > 1 ? (women ? 'مجلس النساء' : men ? 'مجلس الرجال' : 'مجلس ' + (i + 1)) : 'المجلس', men, women, guestWc: (men && menWc === 1) || (women && womenWc === 1) });
  }
  for (let i = 0; i < Dn; i++) blocks.push({ id: 'dining' + (i + 1), kind: 'dining', rank: 1, area: T.dining, name: Dn > 1 ? 'صالة طعام ' + (i + 1) : 'صالة الطعام' });
  for (let i = 0; i < K; i++) blocks.push({ id: 'kitchen' + (i + 1), kind: 'kitchen', rank: 1.5 + i * .05, area: i ? T.kitchen2 : T.kitchen, name: i ? 'مطبخ تحضيري' : 'المطبخ' });
  for (let i = 1; i < H; i++) blocks.push({ id: 'family' + i, kind: 'family', rank: 2.5, area: T.family, name: H > 2 ? 'صالة عائلية ' + i : 'الصالة العائلية' });
  let sharedLeft = shared, ensLeft = ensuite;
  for (let i = 0; i < N; i++) {
    const master = i === 0;
    let bath = false, bathShared = false;
    if (master) bath = masterBath === 1;
    else if (ensLeft > 0) { bath = true; ensLeft--; }
    else if (sharedLeft > 0 && (i - 1 - ensuite) % 2 === 0) { bath = true; bathShared = true; sharedLeft--; }
    const strip = bath ? (master ? T.masterStripD * 5.2 : T.stripD * 4.4) : 0;
    blocks.push({ id: 'suite' + (i + 1), kind: 'suite', rank: master ? 3.9 : 3 + i * .01, master, bath, bathShared, area: (master ? T.master : T.bedroom) + strip, name: master ? 'غرفة النوم الرئيسية' : 'غرفة نوم ' + (i + 1) });
  }
  if (shared) notes.push(`غرف النوم غير الرئيسية تتشارك ${shared} ${shared > 1 ? 'دورات مياه' : 'دورة مياه'} على الممر${ensuite ? `، و${ensuite} منها بحمام خاص` : ''}.`);
  const noBath = N - attached - Math.min(others - ensuite, shared * 2); if (noBath > 0) notes.push(`عدد دورات المياه (${B}) لا يكفي لكل غرف النوم مع دورات الضيوف؛ بعض الغرف بلا دورة مياه قريبة.`);
  // متطلبات من كلام العميل (requirements.mjs): فراغات إضافية ومقاسات وتفضيلات
  const ex = req.extras || {}, pr = req.prefs || {}, ar = req.areas || {};
  let extraBathsLeft = baths;
  const takeBath = want => { if (!want) return false; if (extraBathsLeft > 0) { extraBathsLeft--; return true; } return false; };
  if (ex.guestRoom) { const bath = takeBath(ex.guestRoom.bath); blocks.push({ id: 'guestroom', kind: 'suite', guest: true, rank: .9, area: T.bedroom + (bath ? T.stripD * 4.4 : 0), bath, name: 'غرفة الضيوف' }); if (ex.guestRoom.bath && !bath) notes.push('حمام غرفة الضيوف لم يُضف لأن عدد دورات المياه لا يكفي؛ زد العدد واحدًا.'); }
  if (ex.maid) { const bath = takeBath(ex.maid.bath); blocks.push({ id: 'maid', kind: 'maid', rank: 1.7, area: 9 + (bath ? 4 : 0), bath, ext: !!ex.maid.ext, name: 'غرفة الخادمة' }); if (ex.maid.bath && !bath) notes.push('حمام الخادمة لم يُضف لأن عدد دورات المياه لا يكفي؛ زد العدد واحدًا.'); }
  if (ex.driver) { const bath = takeBath(ex.driver.bath); blocks.push({ id: 'driver', kind: 'driver', rank: .2, area: 9 + (bath ? 3.6 : 0), bath, name: 'غرفة السائق' }); if (ex.driver.bath && !bath) notes.push('حمام السائق لم يُضف لأن عدد دورات المياه لا يكفي؛ زد العدد واحدًا.'); }
  if (ex.office) blocks.push({ id: 'office', kind: 'office', rank: .8, area: 12, ext: !!ex.office?.ext, name: 'المكتب' });
  if (ex.prayer) blocks.push({ id: 'prayer', kind: 'prayer', rank: .6, area: 8, name: 'المصلى' });
  const kitchenStrip = [...(ex.laundry ? ['laundry'] : []), ...(ex.storage ? ['storage'] : [])];
  // الشريط يُقتطع من المطبخ: نكبّر كتلته بمساحته حتى يبقى المطبخ بمقاسه
  if (kitchenStrip.length) { const k = blocks.find(b => b.id === 'kitchen1'); if (k) k.area += kitchenStrip.length === 2 ? 9 : 5.5; }
  // المقاسات: الصريحة تحل محل الافتراض التصميمي، والوصفية «كبير» تكبّره 30٪
  // المقاس الذي يذكره العميل صافٍ داخل الجدران؛ الكتلة تُقاس على محاور الجدران فنضيف نصف سماكة الجدار حولها
  const setArea = (pred, a) => { for (const b of blocks.filter(pred)) { const strip = b.kind === 'suite' && b.bath ? b.area - (b.master ? T.master : T.bedroom) : 0; b.area = a + .5 * Math.sqrt(a) + strip; b.fixedArea = true; } };
  if (ar.majlis) setArea(b => b.id === 'majlis1', ar.majlis); else if (pr.big_majlis) setArea(b => b.id === 'majlis1', T.majlis * 1.3);
  if (ar.dining) setArea(b => b.kind === 'dining', ar.dining);
  if (ar.kitchen) setArea(b => b.id === 'kitchen1', ar.kitchen); else if (pr.big_kitchen) setArea(b => b.id === 'kitchen1', T.kitchen * 1.3);
  if (ar.master) setArea(b => b.master, ar.master); else if (pr.big_master) setArea(b => b.master, T.master * 1.3);
  if (ar.bedroom) setArea(b => b.kind === 'suite' && !b.master, ar.bedroom);
  const tw = req.tweaks || {};
  if (tw.bedroomScale) for (const b of blocks) if (b.kind === 'suite') b.area *= tw.bedroomScale;
  if (tw.majlisScale) for (const b of blocks) if (b.kind === 'majlis') b.area *= tw.majlisScale;
  if (tw.kitchenScale) for (const b of blocks) if (b.kind === 'kitchen' || b.kind === 'dining') b.area *= tw.kitchenScale;
  const hallArea = (ar.hall || (pr.big_hall ? T.hall * 1.35 : T.hall)) * (tw.hallScale || 1);
  if (pr.elderlyRoom) { const e = blocks.find(b => b.kind === 'suite' && !b.master) || blocks.find(b => b.master); if (e) { e.rank = 1.95; e.elderly = true; e.name = e.master ? e.name : 'غرفة كبار السن'; } }
  // ممر الضيوف ودورة مياههم يُقتطعان من كتلة المجلس: نضيف مساحتهما حتى يبقى المجلس بمقاسه
  for (const b of blocks) if (b.guestWc) b.area += 7;
  return { blocks, rules: Array.isArray(req.rules) ? req.rules : [], entry: req.entry || 's', hall: H > 0, hallArea, hallFixed: !!ar.hall, extraBaths: extraBathsLeft, guestWc, attached, notes, prefs: pr, kitchenStrip, counts: { bedrooms: N, majlis: M, baths: B, kitchens: K, halls: H, dining: Dn } };
}

/** أعداد من قائمة غرف المحرك القديم (normalizeRooms/defaultRooms). */
export function countsFromRooms(rooms = []) {
  const c = { bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0 };
  const map = { bedroom: 'bedrooms', majlis: 'majlis', bath: 'baths', kitchen: 'kitchens', living: 'halls', dining: 'dining' };
  for (const r of rooms) if (map[r.type]) c[map[r.type]]++;
  return c;
}

// ------------------------------------------------------------------------------------------ الوضع الهندسي
// كل كتلة موضوعة: { block, r:{x0,y0,x1,y1}, door: 'x0'|'x1'|'y0'|'y1' (جهة الحركة) }.
// الإحداثيات قانونية: x عبر الواجهة (0..W)، y من المدخل (0) إلى الخلف (D).
// أدنى بُعد في اتجاه التكديس لكل نوع (افتراض تصميمي): يمنع شرائح رفيعة غير قابلة للاستعمال
const MIN_RUN = { terrace: 2.6, suite: 3.2, majlis: 3.6, dining: 3.0, kitchen: 2.6, family: 3.4, maid: 2.6, driver: 2.6, office: 2.8, prayer: 2.4, foyer: 2.4, hall: 3.4 };
/** يوزّع الطول على الكتل بالنسبة لمساحاتها، مع حد أدنى لكل كتلة، ويعيد التوزيع على البقية. */
function distribute(len, blocks, cross) {
  const minOf = b => Math.max(MIN_RUN[b.kind] || 2.4, b.kind === 'suite' && b.bath && cross < 3.2 + (b.master ? 2.2 : 1.7) ? 3.2 + 2.1 : 0);
  let fixed = new Map();
  for (let it = 0; it < blocks.length; it++) {
    const free = blocks.filter(b => !fixed.has(b)), rest = len - [...fixed.values()].reduce((a, v) => a + v, 0);
    const tot = free.reduce((a, b) => a + b.area, 0); let changed = false;
    for (const b of free) { const d = rest * b.area / tot; if (d < minOf(b) && rest > 0) { fixed.set(b, minOf(b)); changed = true; } }
    if (!changed) return blocks.map(b => fixed.get(b) ?? rest * b.area / tot);
  }
  return blocks.map(b => fixed.get(b) ?? 0);
}
const stack = (blocks, x0, x1, y0, y1, door) => {
  const ds = distribute(y1 - y0, blocks, x1 - x0); let y = y0;
  return blocks.map((b, i) => { const d = ds[i]; const p = { block: b, r: { x0, y0: y, x1, y1: y + d }, door }; y += d; return p; });
};
const row = (blocks, x0, x1, y0, y1, door) => {
  const ws = distribute(x1 - x0, blocks, y1 - y0); let x = x0;
  return blocks.map((b, i) => { const w = ws[i]; const p = { block: b, r: { x0: x, y0, x1: x + w, y1 }, door }; x += w; return p; });
};
const byRank = (a, b) => a.rank - b.rank || a.id.localeCompare(b.id);
/**
 * مجلس الرجال بدورة مياه: شريط «مدخل الرجال + دورة المياه» بطول المجلس على جانبه (side)، أو «مغاسل + دورة مياه» في طرفه
 * الخلفي (back). الجانبي أولى (مدخل مستقل للضيف)، إلا إن جعل المجلس أطول من 1:1.8 والخلفي أقرب للتناسب.
 */
function menMajlisPlan(w, h) {
  const T = DESIGN_TARGETS, ratio = (a, b) => Math.max(a, b) / Math.max(.1, Math.min(a, b));
  const sideOk = h >= T.guestWcL + 1.6 && w - T.guestStripW >= 3.4, backOk = h - T.washD >= 3.4 && w >= T.guestWcL + 1.2;
  const rs = sideOk ? ratio(w - T.guestStripW, h) : Infinity, rb = backOk ? ratio(w, h - T.washD) : Infinity;
  if (sideOk && (rs <= 1.8 || rs <= rb)) return { plan: 'side', w: w - T.guestStripW, h };
  if (backOk) return { plan: 'back', w, h: h - T.washD };
  return { plan: null, w, h };
}
// ------------------------------------------------------------------ تناسب الصالة: المحور يُقسم إلى صالة + ممر
// الصالة الرئيسية المستهدفة: صافي عرضها ≥ 4.5 م ونسبتها ≤ 1:1.6 (افتراض تصميمي من التطبيق، لا اشتراط نظامي).
// المحور الطويل (أطول من 1.6 أمثال عرضه) لا يُترك صالة واحدة طويلة: تنتهي الصالة عند h، ويكمل بعدها «ممر الغرف»
// بعرض الممر، وتتمدد غرف الجهة الخلفية على ما بقي من عرض المحور فلا يضيع.
export const HALL_LIMITS = Object.freeze({ ratio: 1.6, minNetW: 4.5 });
const hallCap = wh => 1.55 * (wh - INT) + INT;
/** أعداد الكتل الأمامية (من مقدمة القائمة المرتبة) الأقرب لنسبة الطول frac، الأقرب أولًا (اثنان على الأكثر). */
function frontCounts(list, frac) {
  const n = list.length; if (n < 2) return [];
  const tot = list.reduce((a, b) => a + b.area, 0); let cum = 0; const opts = [];
  for (let k = 1; k < n; k++) { cum += list[k - 1].area; opts.push({ k, d: Math.abs(cum / tot - frac) }); }
  return opts.sort((a, b) => a.d - b.d).slice(0, 2).map(o => o.k);
}
/** الكتل المكدّسة تتسع في حدها: لا طول سالب ولا تجاوز للنهاية. */
const fitsRun = (pl, lim) => pl.length > 0 && pl.every(p => p.r.y1 - p.r.y0 > .5) && pl[pl.length - 1].r.y1 <= lim + .01;
/** خيارات توزيع ما يزيد من عرض المحور (بعد الممر) على غرف الجهتين الخلفية. */
const spineSplits = (wh, one = null, more = 'L') => { const ex = snap(wh - DESIGN_TARGETS.galleryW); if (ex < .6) return []; if (one) return [one === 'L' ? [ex, 0] : [0, ex]]; const h2 = snap(ex / 2); return [[h2, snap(ex - h2)], more === 'L' ? [ex, 0] : [0, ex]]; };
const areaOf = l => l.reduce((a, b) => a + b.area, 0);
/**
 * المحور المقسوم بجناح واحد (الصالة الجانبية وشكل L): الصالة [hx0, hx0+wh] × [f, h]، ثم ممر بعرض الممر على الجدار الخارجي،
 * والجناح (door نحو الصالة: 'x0' الجناح يمينها، 'x1' يسارها) تتمدد كتله الخلفية على باقي عرض المحور.
 */
function sideSpine(list0, wh, W, hx0, g, door, stair, ht) {
  const T = DESIGN_TARGETS, out = [], list = [...list0].sort(byRank), cw = T.galleryW;
  const f0 = Math.min(4.6, Math.max(2.8, T.foyer / wh)), cap = hallCap(wh);
  const hl = stair ? Math.max(cap, stair.len + 3.4) : Math.min(cap, Math.max(4.2, ht / wh));
  const wx0 = door === 'x0' ? hx0 + wh : 0, wx1 = door === 'x0' ? W : hx0;
  for (const k of frontCounts(list, (f0 + hl) / g)) {
    let h = snap(f0 + hl), F, f;
    for (let it = 0; it < 2; it++) { F = stack(list.slice(0, k), wx0, wx1, 0, h, door); f = foyerDepth(F, wh); if (Math.abs(h - f - hl) < .3) break; h = snap(f + hl); }
    if (g - h < 3.2 || h - f > hl + .4 || !fitsRun(F, h) || h - f < (stair ? stair.len + 3.2 : 3.2)) continue;
    const B = door === 'x0' ? stack(list.slice(k), hx0 + cw, W, h, g, 'x0') : stack(list.slice(k), 0, hx0 + wh - cw, h, g, 'x1');
    if (!fitsRun(B, g)) continue;
    const sx0 = door === 'x0' ? hx0 : hx0 + wh - cw;
    out.push({ pl: [...F, ...B], h, circ: [{ id: 'foyer', r: { x0: hx0, y0: 0, x1: hx0 + wh, y1: f } }, { id: 'hall', r: { x0: hx0, y0: f, x1: hx0 + wh, y1: h } }, { id: 'spine', r: { x0: sx0, y0: h, x1: sx0 + cw, y1: g } }] });
  }
  return out;
}
/**
 * بدائل المحور المقسوم لنمطي الصالة المركزية وT: جهتان (L يسار، R يمين) حول محور [wl, wl+wh]، من 0 إلى g.
 * يعيد [{ pl, circ, h, stairRect? }]؛ circ: الردهة، الصالة [f,h]، وممر المحور [h,g].
 */
function spineVariants(L, R, wl, wh, W, g, stair, ht) {
  const T = DESIGN_TARGETS, out = [];
  const f0 = Math.min(4.6, Math.max(2.8, T.foyer / wh)), cap = hallCap(wh);
  // مع السلم: جلسة ≥ 3.4 م أمامه تكفي؛ إطالة الصالة أكثر تطيل الصالة العلوية فوقها
  const hl = stair ? Math.min(cap, stair.len + 3.6) : Math.min(cap, Math.max(4.2, ht / wh));
  const h0 = snap(f0 + hl); if (g - h0 < 3.2) return out;
  const cx = wl + wh / 2;
  // لكل جهة: عدد كتلها الأمامية، أو «كامل» (null): كتلها بطول المحور كله بلا تمدد، والممر ملاصق لها
  const ks = list => [...frontCounts(list, h0 / g).slice(0, 1), null];
  for (const kL of ks(L)) for (const kR of ks(R)) {
    if (kL === null && kR === null) continue;
    // نهاية الصالة تُضبط على عمق الردهة الفعلي (حد غرفة) حتى يبقى طول الصالة كما قُدّر
    let h = h0, FL, FR, f;
    const front = (list, k, x0, x1, door, hh) => stack(k === null ? list : list.slice(0, k), x0, x1, 0, k === null ? g : hh, door);
    for (let it = 0; it < 2; it++) {
      FL = front(L, kL, 0, wl, 'x1', h); FR = front(R, kR, wl + wh, W, 'x0', h);
      f = foyerDepth([...FL, ...FR], wh);
      if (Math.abs(h - f - hl) < .3) break; h = snap(f + hl);
    }
    if (g - h < 3.2 || h - f > hl + .4 || !fitsRun(FL, kL === null ? g : h) || !fitsRun(FR, kR === null ? g : h)) continue;
    if (h - f < (stair ? stair.len + 3.2 : 3.2)) continue;
    // التمدد كله لجهة واحدة: للجهة ذات الكتل الخلفية الأكبر (الأقدر على عرض إضافي)
    for (const [eL, eR] of spineSplits(wh, kL === null ? 'R' : kR === null ? 'L' : null, kL !== null && kR !== null && areaOf(L.slice(kL)) < areaOf(R.slice(kR)) ? 'R' : 'L')) {
      const BL = kL === null ? [] : stack(L.slice(kL), 0, wl + eL, h, g, 'x1'), BR = kR === null ? [] : stack(R.slice(kR), wl + wh - eR, W, h, g, 'x0');
      if ((kL !== null && !fitsRun(BL, g)) || (kR !== null && !fitsRun(BR, g))) continue;
      const circ = [{ id: 'foyer', r: { x0: wl, y0: 0, x1: wl + wh, y1: f } }, { id: 'hall', r: { x0: wl, y0: f, x1: wl + wh, y1: h } }, { id: 'spine', r: { x0: wl + eL, y0: h, x1: wl + wh - eR, y1: g } }];
      out.push({ pl: [...FL, ...FR, ...BL, ...BR], circ, h, ...(stair ? { stairRect: { x0: cx - 1.3, y0: h - stair.len - .1, x1: cx + 1.3, y1: h - .1 } } : {}) });
    }
  }
  return out;
}
const W_ = r => r.x1 - r.x0, H_ = r => r.y1 - r.y0, A_ = r => W_(r) * H_(r);
const touch = (a, b) => {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if ((Math.abs(a.x1 - b.x0) < 1e-3 || Math.abs(a.x0 - b.x1) < 1e-3) && oy > 1e-3) return oy;
  if ((Math.abs(a.y1 - b.y0) < 1e-3 || Math.abs(a.y0 - b.y1) < 1e-3) && ox > 1e-3) return ox;
  return 0;
};

/** تقييم ترتيب كامل (كتل + فراغات حركة). أقل = أفضل. null = مرفوض. */
function score(placed, circ, W, D, program = {}) {
  const dbg = globalThis.__villaDebug, no = why => { if (dbg) dbg[why] = (dbg[why] || 0) + 1; return null; };
  // الفناء الداخلي (U): فراغ خارجي مفتوح، لا حركة؛ ملامسته تُحسب واجهة خارجية
  const court = circ.find(c => c.id === 'court'); if (court) circ = circ.filter(c => c !== court);
  let pen = 0;
  // حديقة طويلة ضيقة (أكثر من 2.2 أمثال عرضها) ليست حديقة بل ممر: تُرجَّح الأغلفة الأقل عمقًا
  if (court) pen += 30 * Math.max(0, H_(court.r) / W_(court.r) - 2.2);
  // لا كتلة خارج الغلاف: توزيع الحدود الدنيا قد يفيض عن العمق فتخرج الغرف عن المبنى
  if (placed.some(p => p.r.x1 > W + .01 || p.r.y1 > D + .01 || p.r.x0 < -.01 || p.r.y0 < -.01)) return no('overflow');
  const hasFiller = placed.some(p => p.block.filler);
  // الفراغات الخارجية المحفورة (تراس/جلسة خارجية): ملامستها واجهة خارجية لجيرانها
  const opens = placed.filter(p => p.block.open).map(p => p.r);
  for (const p of placed) {
    const b = p.block, r = p.r, a = A_(r);
    const ratio = a / b.area;
    if (b.open) {
      const C = OPEN_CAPS.terrace, s = Math.min(W_(r), H_(r));
      if (s < C.minSide - .05) return no('open-narrow');
      // يُدخل إليه من فراغ حركة بباب زجاجي، ويقع على حافة الكتلة (حفر في الكتلة لا فناء مغلق)
      if (Math.max(0, ...circ.map(c => touch(r, c.r))) < 1.8) return no('open-no-circ');
      const edge = (r.x0 < EPS ? H_(r) : 0) + (r.x1 > W - EPS ? H_(r) : 0) + (r.y0 < EPS ? W_(r) : 0) + (r.y1 > D - EPS ? W_(r) : 0);
      if (edge < s) return no('open-inner');
      if (a > C.max * 1.15) return no('open-bloat');
      pen += C.cost * a + 10 * Math.abs(Math.log(ratio)) + 8 * Math.max(0, Math.max(W_(r), H_(r)) / s - 2.2);
      continue;
    }
    // فراغ خارجي مع فراغ مطلوب منقوص تناقض: المسطح يُعطى للمطلوب أولًا
    if (opens.length && ratio < OPEN_CAPS.starve) return no('open-starves:' + b.kind);
    // فراغ فائض مع فراغ مطلوب منقوص تناقض: الفائض يُعطى للمطلوب أولًا
    if (hasFiller && !b.filler && ratio < ROOM_CAPS.fillerStarve) return no('filler-starves:' + b.kind);
    pen += 40 * Math.log(ratio) ** 2 * Math.max(1, b.area / 15) * (b.fixedArea ? 5 : 1);
    // فراغ الفائض ليس مطلوبًا: كلفته بمساحته ترجّح الغلاف الأصغر الذي لا يحتاجه (أو يحتاج أقل)
    if (b.filler) pen += ROOM_CAPS.fillerCost * b.area;
    // سقف التضخم: كتلة تتجاوز مقاسها كثيرًا (فائض صُبّ فيها) تُكلَّف ثم تُرفض؛ الصالات تُعالج بحدودها الخاصة
    if (program.caps !== false) { if (ratio > (b.filler ? ROOM_CAPS.fillerHard : ROOM_CAPS.hard) && a - b.area > ROOM_CAPS.slack) return no('bloat:' + (b.filler ? 'filler' : b.kind)); if (ratio > ROOM_CAPS.soft) pen += 30 * (ratio - ROOM_CAPS.soft) * Math.max(1, b.area / 15); }
    // المجلس أصغر من 70٪ من مقاسه التصميمي لا يليق بالضيافة (ولا تتسع دورة مياهه): يُرفض
    if (b.kind === 'majlis' && ratio < .7) return no('majlis-small');
    if (b.kind === 'majlis' && ratio < .85) pen += 40;
    const md = MIN_SIDE[b.kind] || 2.4, s = Math.min(W_(r), H_(r));
    if (s < md) { if (s < md * .8) return no('min-side:' + b.kind); pen += 50 * (md - s); }
    if (b.kind === 'suite' || ((b.kind === 'maid' || b.kind === 'driver') && b.bath)) {
      const T = DESIGN_TARGETS, a = isX(p.door) ? H_(r) : W_(r), dep = isX(p.door) ? W_(r) : H_(r);
      let bw = a, bdp = dep;
      if (b.bath) {
        const bl0 = b.master ? T.masterBathL : b.kind === 'suite' ? T.bathL : 2.2, closetMax = b.master ? 3.4 : b.kind === 'suite' ? 2.6 : 1.4;
        if (dep > bl0 + closetMax + .3 && a >= 1.3 + bl0 * .9) bdp = dep - (b.master ? 2.4 : 2.1); else bw = a - (b.master ? T.masterStripD : T.stripD);
      }
      const ms = Math.min(bw, bdp), want = b.kind !== 'suite' ? 9 : b.master ? T.master : T.bedroom;
      if (ms < (b.master ? 3.35 : b.kind === 'suite' ? 2.9 : 2.5)) return no('suite-narrow'); // صافي العرض بعد الجدران يقارب 2.75 م
      if (ms < 3.3) pen += 60 * (3.3 - ms);
      // غرفة ملابس مطلوبة للرئيسية: تحتاج عمقًا من الباب ≥ 3.9 م ليتسع الحمام والخزانة على الشريط
      if (b.master && b.bath && program.prefs?.masterDressing && dep < 3.9) pen += 70 + 40 * (3.9 - dep);
      pen += 25 * Math.log(bw * bdp / want) ** 2;
      // صافي غرفة النوم بعد الشريط: سقف مطلق يتناسب مع ما طلبه العميل إن كبّر المقاس
      if (program.caps !== false && b.kind === 'suite') { const strip0 = b.bath ? (b.master ? T.masterStripD * 5.2 : T.stripD * 4.4) : 0, grow = Math.max(1, (b.area - strip0) / want), cap = (b.master ? ROOM_CAPS.bedNet.master : ROOM_CAPS.bedNet.bedroom) * grow; if (bw * bdp > cap) return no('bed-bloat'); }
      // تناسب غرفة النوم بعد شريط الحمام: ≤ 1:1.5، وما فوق 1:2.2 شبه مرفوض (يُرفض بعد الرسم)
      if (b.kind === 'suite') { const br = Math.max(bw, bdp) / Math.max(.1, ms); pen += 50 * Math.max(0, br - PLAN_LIMITS.bedRatio) + (br > PLAN_LIMITS.rejectRatio ? 40 : 0); }
    }
    const asp = Math.max(W_(r), H_(r)) / s;
    if (asp > 2.1) pen += 18 * (asp - 2.1) * Math.max(1, b.area / 15);
    // المطبخ وصالة الطعام والجلسة: الشريط الطويل الضيق (فوق 1:1.9) لا يُفرش جيدًا؛ كلفة أشد من بقية الكتل
    if (program.caps !== false && ['kitchen', 'dining', 'family'].includes(b.kind) && asp > 1.9) pen += 15 * (asp - 1.9);
    // لا بد من تلامس مع فراغ حركة بطول باب
    const t = Math.max(0, ...circ.map(c => touch(r, c.r)));
    if (t < 1.1) return no('no-circ:' + b.kind);
    // غرفة النوم تفتح على مدخل العائلة مباشرة: يضعف الخصوصية
    if (b.kind === 'suite' && !b.guest && Math.max(0, ...circ.filter(c => c.id !== 'foyer').map(c => touch(r, c.r))) < 1.3) pen += 35;
    // واجهة خارجية للفراغات المعيشية
    const ext = (r.x0 < EPS ? H_(r) : 0) + (r.x1 > W - EPS ? H_(r) : 0) + (r.y0 < EPS ? W_(r) : 0) + (r.y1 > D - EPS ? W_(r) : 0) + (court ? touch(r, court.r) : 0) + opens.reduce((t, o) => t + touch(r, o), 0);
    // غرفة نوم بلا جدار خارجي لا نافذة لها: مرفوضة من التوليد (لا تحذير فقط)
    if (b.kind === 'suite' && ext < 1.6) return no('bed-no-ext');
    if (ext < 1.5) pen += b.kind === 'family' ? 15 : 60;
  }
  const find = id => placed.find(p => p.block.id === id);
  const k = find('kitchen1'), dn = find('dining1');
  if (k && dn) { if (touch(k.r, dn.r) >= 1.2) pen -= 14; else pen += program.twoFloor ? 16 : 40; } // المطبخ بجوار الطعام أصل وظيفي: في الدور الواحد عقوبته أقوى من فروق التناسب الجديدة (في أرضي الدورين تبقى 16 لقلة كتله)
  for (const p of placed) if (p.block.kind === 'majlis') {
    if (p.block.men && p.r.y0 > EPS) return no('men-not-front');
    if (p.block.men && p.block.guestWc) { const mp = menMajlisPlan(W_(p.r), H_(p.r)); if (!mp.plan) pen += 45; else if (mp.plan === 'back') pen += 8; }
    if (p.block.kind === 'majlis') {
      // نسبة المجلس بعد اقتطاع ممر الضيوف ودورة المياه: المجلس المستطيل الطويل غير مريح للجلسة العربية
      const T = DESIGN_TARGETS, mp = p.block.men && p.block.guestWc ? menMajlisPlan(W_(p.r), H_(p.r)) : null;
      const mw = mp ? mp.w : p.block.guestWc ? (isX(p.door) ? W_(p.r) - T.guestStripW : W_(p.r)) : W_(p.r), mh = mp ? mp.h : p.block.guestWc && !isX(p.door) ? H_(p.r) - T.guestStripW : H_(p.r);
      const asp = Math.max(mw, mh) / Math.max(.1, Math.min(mw, mh));
      // ≤ 1:1.8، وما فوق 1:2.2 شبه مرفوض؛ وعرض صافٍ يتسع لجلستين متقابلتين وخلوص بينهما (PLAN_LIMITS)
      pen += 28 * Math.max(0, asp - 1.75) * Math.max(1, p.block.area / 15) + 40 * Math.max(0, asp - PLAN_LIMITS.majlisRatio) + (asp > PLAN_LIMITS.rejectRatio ? 40 : 0);
      pen += 25 * Math.max(0, PLAN_LIMITS.majlisClear + 2 * PLAN_LIMITS.seatDepth - (Math.min(mw, mh) - INT));
    }
    pen += 4 * Math.max(0, p.r.y0);
    for (const q of placed) {
      if (q.block.kind === 'suite' && !q.block.guest && touch(p.r, q.r) > .5) pen += 22;
      if (p.block.men && q.block.kind === 'dining' && touch(p.r, q.r) >= 1.2) pen -= 10;
      if (p.block.men && q.block.women && touch(p.r, q.r) > .5) pen += 8;
    }
  }
  const maid = placed.find(p => p.block.kind === 'maid');
  if (maid && k) pen += touch(maid.r, k.r) >= 1 ? -8 : 10;
  const drv = placed.find(p => p.block.kind === 'driver');
  if (drv) { const extS = (drv.r.x0 < EPS || drv.r.x1 > W - EPS || drv.r.y0 < EPS) ? 0 : 30; pen += extS; }
  const master = placed.find(p => p.block.master);
  if (master) pen += 3 * Math.max(0, D * .6 - (master.r.y0 + master.r.y1) / 2);
  // الحركة: نسبة، والصالة
  const circA = circ.reduce((a, c) => a + A_(c.r), 0), ratio = circA / (W * D);
  if (ratio > .2) pen += 160 * (ratio - .2);
  const hall = circ.find(c => c.id === 'hall');
  if (hall) { const ha = A_(hall.r), ht = program.hallArea || DESIGN_TARGETS.hall; if (program.caps !== false && !program.hallFixed) pen += 6 * Math.max(0, ha - ht * ROOM_CAPS.hall); pen += (program.upperLounge ? 4.5 : 1.1) * Math.max(0, ha - ht * 1.3) + 2 * Math.max(0, ht * .5 - ha); if (program.hallFixed) pen += 6 * Math.max(0, Math.abs(ha - ht * 1.12) - ht * .12);
    // تناسب الصالة بالصافي (محاور الجدران ناقص سماكة الجدار الداخلي): نسبة ≤ 1.6 وعرض ≥ 4.5 م
    const nw = Math.min(W_(hall.r), H_(hall.r)) - INT, nl = Math.max(W_(hall.r), H_(hall.r)) - INT;
    pen += 120 * Math.max(0, nl / nw - HALL_LIMITS.ratio) + 60 * Math.max(0, HALL_LIMITS.minNetW - nw) + 1.5 * Math.max(0, ht * .75 - ha);
  }
  return pen;
}

/**
 * فائض مسطح الدور في الدورين (أحد الدورين أصغر برنامجًا من الآخر والغلاف واحد): يُخصَّص له فراغ نافع مسمّى
 * («جلسة عائلية») بدل أن يُصبّ في غرفة واحدة. يعيد قائمة الكتل مع كتلة الفائض إن بلغ الفائض حدًّا يستحق فراغًا.
 * need: احتياج الدور من الكتل والحركة. الحدود من ROOM_CAPS.filler (افتراض تصميمي). كتلة الفائض تُعلن في ملاحظات البديل.
 */
function withFiller(blocks, area, need, upper, where = null) {
  const F = ROOM_CAPS.filler, surplus = area - need * 1.12;
  if (surplus < F.min || blocks.some(b => b.filler)) return blocks;
  // فائض أصغر من جلسة معيشة لائقة (صافيها دون 14 م²، الحد الإرشادي للصالة في الكتالوج): غرفة متعددة الاستعمال لا «جلسة» ناقصة
  if (surplus < F.living) return [...blocks, { id: upper ? 'fillerU2' : 'fillerG2', kind: 'office', filler: true, rank: upper ? 2.6 : .85, area: Math.min(F.max2, surplus), name: 'غرفة متعددة الاستعمال' }];
  const out = [...blocks, { id: upper ? 'fillerU' : 'fillerG', kind: 'family', filler: true, rank: 2.5, area: Math.min(F.max, surplus), name: where === 'court' ? 'جلسة الحديقة' : 'جلسة عائلية' }];
  // فائض أكبر من جلسة واحدة: غرفة ثانية صغيرة متعددة الاستعمال (مكتب/دراسة/ألعاب) بدل جلسة متضخمة
  if (surplus - F.max >= F.min2) out.push({ id: upper ? 'fillerU2' : 'fillerG2', kind: 'office', filler: true, rank: upper ? 2.6 : .85, area: Math.min(F.max2, surplus - F.max), name: 'غرفة متعددة الاستعمال' });
  return out;
}
/** كل تقسيمات القائمة إلى قسمين، مع معاملة الكتل المتطابقة (غرف النوم العادية مثلًا) كعدد لا كهوية. */
function* subsets(list) {
  const groups = new Map();
  for (const b of list) { const k = [b.kind, !!b.master, !!b.bath, b.area, b.guestWc ? 1 : 0, b.guest ? 1 : 0, b.ext ? 1 : 0].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
  const gs = [...groups.values()];
  function* rec(i, A, B) {
    if (i === gs.length) { yield [A, B]; return; }
    const g = gs[i];
    for (let c = 0; c <= g.length; c++) yield* rec(i + 1, [...A, ...g.slice(0, c)], [...B, ...g.slice(c)]);
  }
  yield* rec(0, [], []);
}

/** يولّد الترتيبات المرشحة لكل الأنماط ويرتبها. */
export function searchLayouts(program, W, D, { keep = 8, stair = null, upper = null, relaxL = false, only = null, perMode = 0, noFiller = false } = {}) {
  if (upper) return searchUpper(program, W, D, upper, keep);
  const T = DESIGN_TARGETS, out = [];
  // أرضي الدورين: الفائض عن احتياجه (حين يكون العلوي أكبر برنامجًا) يأخذ «جلسة عائلية»؛ الفناء يستوعب فائضه بحديقته فيبقى بلا إضافة
  const blocks0 = program.blocks, blocks = program.twoFloor && stair && !noFiller ? withFiller(blocks0, W * D, blocks0.reduce((a, b) => a + b.area, 0) + T.foyer + (program.hallArea || T.hall) + 15, false) : blocks0;
  const suites = blocks.filter(b => b.kind === 'suite' && !b.guest).sort(byRank).reverse(); // الرئيسية أولًا
  // الشكل المطلوب يتقدم على غيره؛ بلا طلب: الفناء بديل مختلف جذريًا لا الخيار الأول
  const wantShape = wantedShape(program);
  const bias = mode => (wantShape ? (mode === wantShape ? -150 : 250) : mode === 'court' ? 15 : 0);
  // only: نمط واحد أو قائمة أنماط يُقتصر البحث عليها (غلاف خُصّص لنمط بعينه)
  const allow = m => !only || (Array.isArray(only) ? only.includes(m) : only === m);
  // الشكل الذي طلبه العميل صراحةً يتقدم على سقوف التضخم الافتراضية (طلب العميل فوق افتراض الميزان): يُعاد تقييمه بلا رفض التضخم
  const progFree = { ...program, caps: false };
  const push = (mode, placed, circ, meta) => { if (!allow(mode)) return; const s = score(placed, circ, W, D, wantShape && mode === wantShape ? progFree : program); if (s === null) return; const rp = rulePenalty(placed, circ, W, D, program.rules, program.entry); out.push({ mode, placed, circ, raw: s + bias(mode), rp, pen: s + bias(mode) + rp.base + Math.min(...rp.p), ...meta }); };
  // المحور الأعرض يعطي صالة بصافي ≥ 4.5 م؛ الأضيق يبقى للأراضي التي لا تتسع لغيره
  // العميل حدّد موضع الصالة (مثلًا «على الحوش الخلفي»): لا يُقسم المحور؛ طلبه يتقدم على التناسب الافتراضي، ويُعلن قصور الصالة بالأرقام
  const splitOk = !(program.rules || []).some(r => r.a === 'hall' || r.b === 'hall');
  const hubWidths = (stair ? [4.8, 5.2, 5.6] : [3.6, 4.2, 4.8, 5.4]).filter(h => W - h >= 7.2).slice(-3);

  // (1) صالة مركزية بين جناحين، و(2) شكل T: جناحان + ممر عرضي + صف خلفي
  if ((allow('center') || allow('tee')) && blocks.length <= 15) for (const wh of hubWidths) for (const sp of [.5, .42, .58]) {
    const wl = snap((W - wh) * sp), wr = W - wh - wl;
    if (wl < 3.6 || wr < 3.6) continue;
    for (let kBack = 0; kBack <= (stair ? Math.max(3, Math.min(suites.length + 1, 4)) : Math.min(suites.length + 1, 4)); kBack++) {
      // الصف الخلفي: الرئيسية ثم بقية الأجنحة (وقد تضاف العائلية)
      const fam = blocks.find(b => b.kind === 'family');
      const backSets = kBack === 0 ? [[]] : [suites.slice(0, kBack), ...(fam && kBack <= suites.length ? [[...suites.slice(0, kBack - 1), fam]] : [])].filter(s => s.length === kBack && s.every(Boolean));
      // أرضي الدورين (السلم في نهاية الصالة) بلا أجنحة نوم: الصف الخلفي للمطبخ والطعام (والخادمة) على الحوش الخلفي،
      // وبينه وبين الصالة ممر خدمة بعرض المبنى؛ السلم يبقى في نهاية الصالة والممران بجانبيه يصلان الممر الخلفي
      if (stair && kBack > 0 && !backSets.length) {
        const kit = blocks.find(b => b.kind === 'kitchen'), din = blocks.find(b => b.kind === 'dining'), maid = blocks.find(b => b.kind === 'maid');
        const svc = kBack === 2 ? [kit, din] : kBack === 3 ? [maid, kit, din] : null;
        if (svc && svc.every(Boolean) && blocks.length - svc.length >= 2) {
          backSets.push(svc);
          // صف الخدمة بعرض المبنى أوسع من المطبخ والطعام: جلسة الفائض تنضم إليه مطلةً على الحوش الخلفي بدل تضخيمهما
          const fill = blocks.filter(b => b.filler);
          if (fill.length && blocks.length - svc.length - 1 >= 2) backSets.push([...svc, fill[0]]);
          if (fill.length > 1 && blocks.length - svc.length - 2 >= 2) backSets.push([...svc, ...fill]);
        }
      }
      for (const backSet of backSets) {
        const rest = blocks.filter(b => !backSet.includes(b));
        let g = D, back = [];
        if (backSet.length) {
          const bd = Math.max(3.8, Math.min(6.4, backSet.reduce((a, b) => a + b.area, 0) / W));
          g = D - bd - T.galleryW;
          if (g < 9) continue;
          // الصف الخلفي يمتد بعرض المبنى؛ الرئيسية في الطرف، والعائلية في الوسط
          const ordered = backSet.some(b => b.kind === 'kitchen') ? backSet : orderBackRow(backSet);
          back = row(ordered, 0, W, g + T.galleryW, D, 'y0');
        }
        for (const [L, R] of subsets(rest)) {
          if (!L.length || !R.length) continue;
          if (sp === .5 && L.length && R.length && L[0].id > R[0].id) continue; // نصف التناظر
          L.sort(byRank); R.sort(byRank);
          const pl = [...stack(L, 0, wl, 0, g, 'x1'), ...stack(R, wl + wh, W, 0, g, 'x0'), ...back];
          const svcBack = backSet.some(b => b.kind === 'kitchen') ? { serviceBack: true } : {};
          if (stair && wh < 4.6) continue; // السلم داخل الصالة يحتاج ممرين جانبيين ≥ 1 م
          const f = foyerDepth(pl, wh);
          const circ = [{ id: 'foyer', r: { x0: wl, y0: 0, x1: wl + wh, y1: f } }, { id: 'hall', r: { x0: wl, y0: f, x1: wl + wh, y1: g } }];
          if (backSet.length) circ.push({ id: 'gallery', r: { x0: 0, y0: g, x1: W, y1: g + T.galleryW } });
          // محور أطول من صالة متناسبة: بديل بصالة متناسبة وممر للغرف الخلفية
          if (splitOk && g - f > HALL_LIMITS.ratio * (wh - INT) + INT) for (const v of spineVariants(L, R, wl, wh, W, g, stair, program.hallArea || T.hall)) {
            push(backSet.length ? 'tee' : 'center', [...v.pl, ...back], [...v.circ, ...circ.filter(c => c.id === 'gallery')], { wh, wl, wr, spine: v.h, ...svcBack, ...(v.stairRect ? { stairRect: v.stairRect } : {}) });
          }
          if (g - f < (stair ? stair.len + 3.2 : 3.2)) continue;
          const cx = wl + wh / 2;
          push(backSet.length ? 'tee' : 'center', pl, circ, { wh, wl, wr, ...svcBack, ...(stair ? { stairRect: { x0: cx - 1.3, y0: g - stair.len - .1, x1: cx + 1.3, y1: g - .1 } } : {}) });
        }
      }
    }
  }
  // (5) فناء/حديقة داخلية (مبنى على شكل U): جناحان بكامل العمق حول حديقة في المنتصف مفتوحة على الخلف،
  // الردهة والصالة في مقدمة المحور، وممرا الفناء على جانبيه يصلان غرف الأجنحة الخلفية. الحديقة تُسوَّر من الخلف.
  if (allow('court') && blocks.length <= 15) for (const wh of [7.6, 8.6, 9.6].filter(h => W - h >= 7.2)) for (const sp of [.5, .42, .58]) {
    const wl = snap((W - wh) * sp), wr = W - wh - wl;
    if (wl < 3.6 || wr < 3.6) continue;
    const gw = T.galleryW;
    // أرضي الدورين حول الفناء: الجناحان بكامل العمق أوسع من برنامج الضيافة؛ الفائض جلسة مطلة على الحديقة لا تضخيم للمجلس والمطبخ
    const blocksC = program.twoFloor && stair && !noFiller ? withFiller(blocks0, (wl + wr) * D, blocks0.reduce((a, b) => a + b.area, 0), false, 'court') : blocks0;
    for (const [L, R] of subsets(blocksC)) {
      if (!L.length || !R.length) continue;
      if (sp === .5 && L[0].id > R[0].id) continue;
      L.sort(byRank); R.sort(byRank);
      const pl = [...stack(L, 0, wl, 0, D, 'x1'), ...stack(R, wl + wh, W, 0, D, 'x0')];
      const f = foyerDepth(pl, wh);
      // عمق الصالة يكفي لنسبة ≤ 1:1.55 مع عرض المحور الواسع (لا شريط عريض ضحل)
      const g = snap(f + Math.max(stair ? stair.len + 3.2 : 4.2, (program.hallArea || T.hall) / wh, (wh - INT) / 1.55 + INT));
      if (D - g < 5) continue; // الحديقة بعمق 5 م على الأقل
      const court = { x0: wl + gw, y0: g, x1: wl + wh - gw, y1: D };
      const circ = [{ id: 'foyer', r: { x0: wl, y0: 0, x1: wl + wh, y1: f } }, { id: 'hall', r: { x0: wl, y0: f, x1: wl + wh, y1: g } },
        { id: 'gallery', r: { x0: wl, y0: g, x1: wl + gw, y1: D } }, { id: 'gallery2', r: { x0: wl + wh - gw, y0: g, x1: wl + wh, y1: D } }, { id: 'court', r: court }];
      const cx = wl + wh / 2;
      push('court', pl, circ, { wh, wl, wr, court, ...(stair ? { stairRect: { x0: cx - 1.3, y0: g - stair.len - .1, x1: cx + 1.3, y1: g - .1 } } : {}) });
    }
  }
  // (6) مبنى على شكل L: جناح أمامي بعرض المبنى (على يمين الردهة والصالة)، وذراع خلفي يمتد من الجانب الأيسر حتى a،
  // وممر يمتد بعرض المبنى تحت الجناح الأمامي يصل الصالة بالذراع والجناح الأمامي معًا. الزاوية الباقية (أسفل يمين) ساحة خارجية.
  // بلا سلم داخل المحور (لم يُدعم بعد). الأرض الضيقة (relaxL): مقاسات أدنى للذراع والجناح الأمامي والعمق، وصف من غرفتي نوم
  // ملاصق للممر في الجناح الأمامي بدل تكديس كل كتله في عمود ضيق. المقاسات الأولى تبقى كما هي متى اتسعت الأرض لها.
  const lShape = relaxed => {
    const gw = T.galleryW;
    const aList = relaxed ? [6.4, ...[.55, .7].map(k => snap(W * k)), 8.5, 9, 9.5, 10, 10.5, 11, 11.5] : [.55, .7].map(k => snap(W * k));
    const whList = relaxed ? [3.6, 3.8, 4.4] : [3.8, 4.4, 4.8].filter(h => W - h >= 7.2).slice(-2);
    const bdList = relaxed ? [4.4, 4.8, 5.6, 6.4] : [4.8, 5.6, 6.4];
    const gMin = relaxed ? 7.6 : 8.5;
    const hbList = relaxed ? [0, 4.8, 5.6, 6.4] : [0];
    for (const a of [...new Set(aList)]) {
      if (a < (relaxed ? 6.4 : 7.4) || W - a < 3.4) continue;
      for (const wh of whList) {
        if (W - wh < 7.2) continue;
        for (const bd of bdList) {
          const g = snap(D - gw - bd); if (g < gMin) continue;
          for (const hb of hbList) for (const [F, B] of subsets(blocks)) {
            if (!F.length || !B.length || !B.some(b => b.kind === 'suite')) continue;
            F.sort(byRank); B.sort(byRank);
            let front;
            if (!hb) front = stack(F, wh, W, 0, g, 'x0');
            else {
              // نطاق نوم بعمق hb في آخر الجناح الأمامي، يلامس الممر، والكتل العامة فوقه
              const S = F.filter(b => b.kind === 'suite'), P = F.filter(b => b.kind !== 'suite');
              if (!S.length || S.length > 2 || !P.length) continue;
              const pub = stack(P, wh, W, 0, g - hb, 'x0');
              if (pub.some(p => p.r.y1 > g - hb + .01)) continue; // الكتل العامة لا تتسع فوق النطاق
              front = [...pub, ...row(S, wh, W, g - hb, g, 'y1')];
            }
            const f = foyerDepth(front, wh); if (g - f < 3.2) continue;
            const backRow = row(B, 0, a, g + gw, D, 'y0');
            const pl = [...front, ...backRow];
            const circ = [{ id: 'foyer', r: { x0: 0, y0: 0, x1: wh, y1: f } }, { id: 'hall', r: { x0: 0, y0: f, x1: wh, y1: g } }, { id: 'gallery', r: { x0: 0, y0: g, x1: W, y1: g + gw } }];
            push('L', pl, circ, { wh, wl: 0, wr: W - wh, armW: a });
            // صالة متناسبة: تنتهي عند h، وبعدها ممر ملاصق للجدار الخارجي، وتتمدد كتل الجناح الخلفية على باقي عرض المحور
            if (splitOk && !hb && g - f > HALL_LIMITS.ratio * (wh - INT) + INT) for (const v of sideSpine(F, wh, W, 0, g, 'x0', null, program.hallArea || T.hall)) push('L', [...v.pl, ...backRow], [...v.circ, circ[2]], { wh, wl: 0, wr: W - wh, armW: a, spine: v.h });
          }
        }
      }
    }
  };
  if (allow('L') && blocks.length <= 12 && !stair) lShape(relaxL);
  // (3) صفّان وممر بينهما (للأراضي العريضة قليلة العمق): أمامي عام، خلفي خاص، والصالة في الخلف مقابل الردهة
  if (allow('rows') && W >= 16 && !stair) {
    const front0 = blocks.filter(b => ['majlis', 'office', 'prayer', 'driver'].includes(b.kind) || b.guest), back0 = blocks.filter(b => ['suite', 'family'].includes(b.kind) && !b.guest);
    const flex = blocks.filter(b => ['dining', 'kitchen', 'maid'].includes(b.kind));
    for (const flexFront of [true, false]) {
      const F = [...front0, ...(flexFront ? flex : [])], B = [...back0, ...(flexFront ? [] : flex)];
      const foyer = { id: 'foyer', kind: 'foyer', area: T.foyer * 1.2, rank: -1, name: 'الردهة' };
      const hallB = { id: 'hall', kind: 'hall', area: program.hallArea || T.hall, rank: -1, name: 'الصالة' };
      for (const [FL, FR] of subsets(F)) for (const [BL, BR] of subsets(B)) {
        if (BL.length + BR.length > 0 && Math.abs(BL.length - BR.length) > 2) continue;
        if (flex.length > 1 && !(flex.every(x => FL.includes(x) || BL.includes(x)) || flex.every(x => FR.includes(x) || BR.includes(x)))) continue;
        const fl = [...FL].sort(byRank).reverse(), fr = [...FR].sort(byRank); // المجلس ملاصق للردهة
        const bl = [...BL].sort(byRank).reverse(), br = [...BR].sort(byRank);
        const fA = [...F, foyer].reduce((a, b) => a + b.area, 0), bA = [...B, hallB].reduce((a, b) => a + b.area, 0);
        const gw = T.galleryW, dd = D - gw, fd = Math.max(3.8, Math.min(dd - 3.8, dd * fA / (fA + bA)));
        const fy = row([...fl, foyer, ...fr], 0, W, 0, fd, 'y1'), by = row([...bl, hallB, ...br], 0, W, fd + gw, D, 'y0');
        const fo = fy.find(p => p.block === foyer), ha = by.find(p => p.block === hallB);
        if (touch(fo.r, { x0: ha.r.x0, y0: fd, x1: ha.r.x1, y1: fd + .01 }) < 0 || Math.min(fo.r.x1, ha.r.x1) - Math.max(fo.r.x0, ha.r.x0) < 1.2) continue;
        const pl = [...fy, ...by].filter(p => p.block !== foyer && p.block !== hallB);
        const circ = [{ id: 'foyer', r: fo.r }, { id: 'gallery', r: { x0: 0, y0: fd, x1: W, y1: fd + gw } }, { id: 'hall', r: ha.r }];
        push('rows', pl, circ, {});
      }
    }
  }
  // (4) صالة جانبية للأراضي الضيقة: جناح واحد والصالة على جدار خارجي
  if (allow('side') && W < 13) for (const wh of [3.4, 3.8, 4.2].filter(h => W - h >= 4.4)) {
    const L = [...blocks].sort(byRank);
    for (const side of ['L', 'R']) {
      const wx0 = side === 'L' ? 0 : wh, wx1 = side === 'L' ? W - wh : W, hx0 = side === 'L' ? W - wh : 0;
      const pl = stack(L, wx0, wx1, 0, D, side === 'L' ? 'x1' : 'x0');
      const f = foyerDepth(pl, wh);
      if (stair && wh < 3.6) continue;
      if (D - f < (stair ? stair.len + 3.2 : 3.2)) continue;
      const circ = [{ id: 'foyer', r: { x0: hx0, y0: 0, x1: hx0 + wh, y1: f } }, { id: 'hall', r: { x0: hx0, y0: f, x1: hx0 + wh, y1: D } }];
      // السلم على الجدار الخارجي للصالة الجانبية، والممر على جهة الجناح
      const sx0 = side === 'L' ? W - .1 - 2.5 : .1, sx1 = sx0 + 2.5;
      push('side', pl, circ, { wh, sideAt: side, ...(stair ? { stairRect: { x0: sx0, y0: D - stair.len - .1, x1: sx1, y1: D - .1 } } : {}) });
      if (splitOk && D - f > HALL_LIMITS.ratio * (wh - INT) + INT) for (const v of sideSpine(L, wh, W, side === 'L' ? W - wh : 0, D, side === 'L' ? 'x1' : 'x0', stair, program.hallArea || T.hall)) {
        push('side', v.pl, v.circ, { wh, sideAt: side, spine: v.h, ...(stair ? { stairRect: { x0: sx0, y0: v.h - stair.len - .1, x1: sx1, y1: v.h - .1 } } : {}) });
      }
    }
  }
  out.sort((a, b) => a.pen - b.pen);
  const res = [], seen = new Set(), byMode = {};
  for (const c of out) {
    const key = c.mode + '|' + c.placed.map(p => p.block.id + ':' + Math.round(p.r.x0) + ',' + Math.round(p.r.y0)).sort().join(';');
    const sg = flip => c.placed.map(p => p.block.kind[0] + ((p.r.x0 + p.r.x1) / 2 < W / 2 ? (flip ? 'R' : 'L') : (flip ? 'L' : 'R')) + Math.round(p.r.y0 / 3)).sort().join('');
    const sig = c.mode + '|' + [sg(false), sg(true)].sort()[0];
    if (seen.has(key) || seen.has(sig)) continue; seen.add(key); seen.add(sig); c.pat = sig; c.sig = sig + '|' + Math.round(W) + 'x' + Math.round(D);
    // perMode: بعد أفضل keep ترتيبًا يُضاف أفضل perMode من كل نمط تنظيم لم يبلغها، حتى لا يطرد النمط الأرخص (الصالة المركزية) كل نمط آخر صالح
    if (res.length < keep) { res.push(c); byMode[c.mode] = (byMode[c.mode] || 0) + 1; }
    else if (perMode && (byMode[c.mode] || 0) < perMode) { c.extra = true; res.push(c); byMode[c.mode] = (byMode[c.mode] || 0) + 1; }
    else if (!perMode) break;
  }
  // مع كتلة الفائض قد لا تتسع الأجنحة: يُجرَّب البرنامج بلا إضافة أيضًا، والأقل كلفة يتقدم (التضخم مرفوض في الحالتين)
  if (blocks !== blocks0) { const seenP = new Set(res.map(c => c.sig)); for (const c of searchLayouts(program, W, D, { keep, stair, relaxL, only, noFiller: true })) if (!seenP.has(c.sig)) res.push(c); res.sort((a, b) => a.pen - b.pen); return res.slice(0, keep); }
  return res;
}
/** الدور العلوي على هندسة الأرضي نفسها: المحور صالة علوية ينتهي بالسلم في الموضع ذاته، والأجنحة للنوم. */
function searchUpper(program, W, D, up, keep) {
  // فكرة «التراس العلوي»: فائض الدور العلوي يصير تراسًا مكشوفًا في طرف أحد الجناحين (أمامي على الواجهة أو خلفي على الحوش)
  // فوق جزء من الأرضي، فيصغر العلوي وتتدرج الكتلة بدل غرفة لم يطلبها العميل. بلا فائض كافٍ: لا تراس (لا يُقتطع من المطلوب).
  if (up.terrace) {
    const C = OPEN_CAPS.terrace, area = W * D - (up.mode === 'court' && up.court ? A_(up.court) : 0), need = program.blocks.reduce((a, b) => a + b.area, 0) + (program.hallArea || 24) * 1.3 + 12;
    const surplus = area - need * 1.06; if (surplus < C.min) return [];
    const tb = { id: 'terraceU', kind: 'terrace', open: true, rank: up.terrace === 'front' ? -9 : 9, area: Math.min(C.max, surplus), name: up.terrace === 'front' ? 'تراس أمامي' : 'تراس' };
    // مع التراس: جلسة علوية واحدة على الأكثر إن بقي فائض (لا غرفتان لم تُطلبا فوق تراس)
    const base = [...program.blocks, tb], more0 = withFiller(base, area - tb.area, need, true), more = more0.filter(b => !b.filler || b === more0.find(x => x.filler));
    return [base, ...(more.length > base.length ? [more] : [])].flatMap(v => searchUpper0(program, W, D, up, keep, v)).sort((a, b) => a.pen - b.pen).slice(0, keep).map(c => ({ ...c, terrace: up.terrace }));
  }
  // فائض الدور العلوي (الأرضي أكبر برنامجًا): «جلسة عائلية» مستقلة بدل تضخيم غرفة نوم؛ ويُجرَّب بلا إضافة وبإضافة واحدة أيضًا
  const filled = withFiller(program.blocks, W * D - (up.mode === 'court' && up.court ? A_(up.court) : 0), program.blocks.reduce((a, b) => a + b.area, 0) + (program.hallArea || 24) * 1.3 + 12, true);
  const variants = [filled, ...(filled.filter(b => b.filler).length > 1 ? [filled.filter(b => b.id !== 'fillerU2')] : []), ...(filled !== program.blocks ? [program.blocks] : [])];
  // فوق الفناء (U) كغيره: بسقوف المقاسات، والفائض جلسة مطلة على فراغ الحديقة؛ ما لا يتسع مسقوفًا لا يُعرض متضخمًا
  // الشكل الذي طلبه العميل صراحةً (فناء داخلي) يتقدم على سقوف الميزان الافتراضية كما في الأرضي: يُقيَّم علويّه بلا رفض التضخم
  const all = up.free ? searchUpper0({ ...program, caps: false }, W, D, up, keep, program.blocks) : variants.flatMap(v => searchUpper0(program, W, D, up, keep, v));
  return all.sort((a, b) => a.pen - b.pen).slice(0, keep);
}
function searchUpper0(program, W, D, up, keep, blocks) {
  const out = [], sr = up.stairRect, hb = up.hub, T_ = DESIGN_TARGETS;
  const lounge = { id: 'hall', r: { x0: hb.x0, y0: 0, x1: hb.x1, y1: D } };
  if (up.mode === 'court' && up.court) {
    // الدور العلوي فوق U: صالة علوية فوق الردهة والصالة، وممرا الفناء حول فراغ الحديقة (مفتوح للسماء)
    const c = up.court, lg = { id: 'hall', r: { x0: hb.x0, y0: 0, x1: hb.x1, y1: c.y0 } };
    const circ = [lg, { id: 'gallery', r: { x0: hb.x0, y0: c.y0, x1: c.x0, y1: D } }, { id: 'gallery2', r: { x0: c.x1, y0: c.y0, x1: hb.x1, y1: D } }, { id: 'court', r: c }];
    for (const [L, R] of subsets(blocks)) {
      if (!L.length || !R.length) continue;
      L.sort(byRank); R.sort(byRank);
      const pl = [...stack(L, 0, hb.x0, 0, D, 'x1'), ...stack(R, hb.x1, W, 0, D, 'x0')];
      const sc = score(pl, circ, W, D, program); if (sc !== null) { const rp = rulePenalty(pl, circ, W, D, program.rules, program.entry); out.push({ mode: 'court', placed: pl, circ: circ.filter(x => x.id !== 'court'), court: c, courtVoid: true, raw: sc, rp, pen: sc + rp.base + Math.min(...rp.p), stairRect: sr, upper: true }); }
    }
  } else if (up.mode === 'side') {
    const wx0 = up.sideAt === 'L' ? 0 : hb.x1, wx1 = up.sideAt === 'L' ? hb.x0 : W;
    const pl = stack([...blocks].sort(byRank), wx0, wx1, 0, D, up.sideAt === 'L' ? 'x1' : 'x0');
    const sc = score(pl, [lounge], W, D, program); if (sc !== null) { const rp = rulePenalty(pl, [lounge], W, D, program.rules, program.entry); out.push({ mode: 'side', placed: pl, circ: [lounge], raw: sc, rp, pen: sc + rp.base + Math.min(...rp.p), stairRect: sr, upper: true }); }
  } else {
    // الصالة العلوية لا تمتد بطول المحور كله: مقدمة المحور (على الواجهة) قد تأخذ غرفة فلا تضيع المساحة في صالة طويلة
    const hubW = hb.x1 - hb.x0, hubCands = [null, ...blocks.filter(b => !b.master && ['suite', 'office', 'prayer'].includes(b.kind)).filter((b, i, arr) => arr.findIndex(x => x.kind === b.kind && x.area === b.area && !!x.bath === !!b.bath) === i)];
    // عمق غرفة المقدمة: من مساحتها، أو أعمق ما يُبقي جلسة 3.4 م أمام السلم (حتى لا تطول الصالة العلوية)
    const hubOpts = hubCands.flatMap(b => !b ? [[null, 0]] : [...new Set([snap(Math.max(3.0, Math.min(5.2, b.area / hubW))), ...(sr && sr.y0 - 3.4 >= 3.0 ? [snap(Math.min(5.2, sr.y0 - 3.4))] : []), 3.3])].map(fd => [b, fd]));
    for (const [hb0, fd] of hubOpts) {
      const rest = hb0 ? blocks.filter(b => b !== hb0) : blocks;
      if (hb0 && sr && sr.y0 - fd < 3.4) continue; // تبقى جلسة أمام السلم
      if (hb0 && !sr && D - fd < 4.5) continue;
      const lg = { id: 'hall', r: { x0: hb.x0, y0: fd, x1: hb.x1, y1: D } };
      const front = hb0 ? [{ block: hb0, r: { x0: hb.x0, y0: 0, x1: hb.x1, y1: fd }, door: 'y1' }] : [];
      for (const [L, R] of subsets(rest)) {
        if (!L.length || !R.length) continue;
        L.sort(byRank); R.sort(byRank);
        const pl = [...stack(L, 0, hb.x0, 0, D, 'x1'), ...stack(R, hb.x1, W, 0, D, 'x0'), ...front];
        // غرفة الجناح الأمامية تلامس الصالة (لا غرفة المقدمة فقط) بطول يكفي بابها بعد شريط الحمام
        const frontBad = q => fd && q.some(p => p.block !== hb0 && p.r.y0 < fd && p.r.y1 - Math.max(fd, p.block.bath ? (p.block.master ? T_.masterStripD : T_.stripD) : 0) < 1.5);
        const sc = frontBad(pl) ? null : score(pl, [lg], W, D, program); if (sc !== null) { const rp = rulePenalty(pl, [lg], W, D, program.rules, program.entry); out.push({ mode: up.mode, placed: pl, circ: [lg], raw: sc, rp, pen: sc + rp.base + Math.min(...rp.p), stairRect: sr, upper: true, frontDepth: fd }); }
        // صالة علوية متناسبة: تنتهي بعد فتحة السلم، ويكمل المحور «ممر الغرف» وتتمدد الغرف الخلفية على باقي عرضه
        const hu = sr ? snap(sr.y1 + .1) : null;
        if (!hu || D - hu < 3.2 || hu - fd < 3.4) continue;
        for (const kL of frontCounts(L, hu / D).slice(0, 1)) for (const kR of frontCounts(R, hu / D).slice(0, 1)) {
          const FL = stack(L.slice(0, kL), 0, hb.x0, 0, hu, 'x1'), FR = stack(R.slice(0, kR), hb.x1, W, 0, hu, 'x0');
          if (!fitsRun(FL, hu) || !fitsRun(FR, hu)) continue;
          for (const [eL, eR] of spineSplits(hubW, null, areaOf(L.slice(kL)) < areaOf(R.slice(kR)) ? 'R' : 'L')) {
            const BL = stack(L.slice(kL), 0, hb.x0 + eL, hu, D, 'x1'), BR = stack(R.slice(kR), hb.x1 - eR, W, hu, D, 'x0');
            if (!fitsRun(BL, D) || !fitsRun(BR, D)) continue;
            const pl2 = [...FL, ...FR, ...BL, ...BR, ...front];
            if (frontBad(pl2)) continue;
            const circ2 = [{ id: 'hall', r: { x0: hb.x0, y0: fd, x1: hb.x1, y1: hu } }, { id: 'spine', r: { x0: hb.x0 + eL, y0: hu, x1: hb.x1 - eR, y1: D } }];
            const sc2 = score(pl2, circ2, W, D, program); if (sc2 === null) continue;
            const rp2 = rulePenalty(pl2, circ2, W, D, program.rules, program.entry);
            out.push({ mode: up.mode, placed: pl2, circ: circ2, raw: sc2, rp: rp2, pen: sc2 + rp2.base + Math.min(...rp2.p), stairRect: sr, upper: true, frontDepth: fd, spine: hu });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.pen - b.pen).slice(0, keep);
}
function orderBackRow(set) {
  // الرئيسية في طرف، العائلية في الوسط، وبقية الأجنحة بينهما
  const m = set.filter(b => b.master), f = set.filter(b => b.kind === 'family'), o = set.filter(b => !b.master && b.kind !== 'family');
  const mid = Math.ceil(o.length / 2);
  return [...m, ...o.slice(0, mid), ...f, ...o.slice(mid)];
}
function foyerDepth(placed, wh) {
  const target = Math.min(4.6, Math.max(2.8, DESIGN_TARGETS.foyer / wh));
  const ys = placed.map(p => p.r.y1).filter(y => y > 2.6 && y < 5.4);
  return ys.length ? ys.reduce((b, y) => (Math.abs(y - target) < Math.abs(b - target) ? y : b), ys[0]) : target;
}

// ------------------------------------------------------------------------------------------ تفصيل الكتل
const opp = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };
const isX = s => s === 'x0' || s === 'x1';
/** شريط على جهة side بسماكة t: يعيد [الشريط، الباقي]. */
function cut(r, side, t) {
  if (side === 'x0') return [{ ...r, x1: r.x0 + t }, { ...r, x0: r.x0 + t }];
  if (side === 'x1') return [{ ...r, x0: r.x1 - t }, { ...r, x1: r.x1 - t }];
  if (side === 'y0') return [{ ...r, y1: r.y0 + t }, { ...r, y0: r.y0 + t }];
  return [{ ...r, y0: r.y1 - t }, { ...r, y1: r.y1 - t }];
}
/** يقسم الشريط بطوله: الجزء القريب من جهة near بطول len، والباقي. */
function split(strip, near, len) {
  if (near === 'x0') return [{ ...strip, x1: strip.x0 + len }, { ...strip, x0: strip.x0 + len }];
  if (near === 'x1') return [{ ...strip, x0: strip.x1 - len }, { ...strip, x1: strip.x1 - len }];
  if (near === 'y0') return [{ ...strip, y1: strip.y0 + len }, { ...strip, y0: strip.y0 + len }];
  return [{ ...strip, y0: strip.y1 - len }, { ...strip, y1: strip.y1 - len }];
}
const sideLen = (r, side) => (isX(side) ? H_(r) : W_(r));
const edgeOf = (r, side) => (isX(side) ? { axis: 'x', at: r[side], from: r.y0, to: r.y1 } : { axis: 'y', at: r[side], from: r.x0, to: r.x1 });
/** الحد المشترك بين غرفتين متلامستين. */
function shared(a, b) {
  for (const s of ['x0', 'x1', 'y0', 'y1']) {
    if (Math.abs(a[s] - b[opp[s]]) > 1e-3) continue;
    const e = edgeOf(a, s), o = edgeOf(b, opp[s]); const from = Math.max(e.from, o.from), to = Math.min(e.to, o.to);
    if (to - from > 1e-3) return { axis: e.axis, at: e.at, from, to };
  }
  return null;
}

/** يحوّل الترتيب إلى غرف وأبواب. */
export function realizeLayout(cand, program0, W, D, { secondEntry = null } = {}) {
  let program = program0;
  const T = DESIGN_TARGETS, rooms = [], doors = [], notes = [];
  const add = (r, o) => { const x = { x0: snap(r.x0), y0: snap(r.y0), x1: snap(r.x1), y1: snap(r.y1), ...o }; rooms.push(x); return x; };
  const hallName = cand.upper ? (program.upperHallName || 'الصالة العلوية') : (program.hall ? 'الصالة' : 'صالة الحركة');
  const courtRect = cand.court || null;
  const courtRoom = cand.circ.some(c => c.id === 'court') ? add(cand.circ.find(c => c.id === 'court').r, { id: 'court', type: 'courtyard', name: 'الحديقة الداخلية', kind: 'court', open: 'y1' }) : null;
  const circRooms = cand.circ.filter(c => c.id !== 'court').map(c => add(c.r, { id: c.id, circ: true, type: c.id === 'foyer' ? 'entrance' : c.id === 'hall' ? 'living' : 'corridor', name: c.id === 'foyer' ? (program.blocks.some(b => b.men) ? 'مدخل العائلة' : 'الردهة') : c.id === 'hall' ? hallName : c.id.startsWith('gallery') && courtRect ? 'ممر الحديقة' : c.id === 'gallery' && cand.serviceBack ? 'ممر الخدمة' : 'ممر الغرف' }));
  const realFoyer = circRooms.find(c => c.id === 'foyer'), foyer = realFoyer || circRooms[0];
  if (cand.stairRect) { const h = circRooms.find(c => c.id === 'hall'); if (h) h.stairZone = cand.stairRect; }
  // الأبواب الثابتة للمحور
  if (realFoyer) doors.push({ a: 'foyer', edge: { axis: 'y', at: 0, from: foyer.x0, to: foyer.x1 }, kind: 'door2', w: 1.6, entry: true });
  if (realFoyer) for (const c of circRooms) if (c !== foyer) { const e = shared(foyer, c); if (e) doors.push({ a: 'foyer', b: c.id, edge: e, kind: 'arch', w: Math.min(2.4, e.to - e.from - .4) }); }
  const hall = circRooms.find(c => c.id === 'hall');
  for (const gal of circRooms.filter(c => c.id.startsWith('gallery'))) if (hall) { const e = shared(hall, gal); if (e) doors.push({ a: 'hall', b: gal.id, edge: e, kind: 'arch', w: Math.min(3.2, e.to - e.from - .4) }); }
  // ممر المحور بعد الصالة: فتحة من الصالة، وأخرى إلى الممر العرضي إن وُجد
  for (const sp of circRooms.filter(c => c.id === 'spine')) for (const o of circRooms.filter(c => c.id === 'hall' || c.id.startsWith('gallery'))) { const e = shared(sp, o); if (e && e.to - e.from >= 1.2) doors.push({ a: 'spine', b: o.id, edge: e, kind: 'arch', w: Math.min(1.4, e.to - e.from - .3) }); }
  if (hall && courtRoom) { const e = shared(hall, courtRoom); if (e) { doors.push({ a: 'hall', b: 'court', edge: e, kind: 'door2', w: Math.min(2.4, e.to - e.from - .6) }); notes.push('مبنى على شكل U: حديقة داخلية في المنتصف مفتوحة على الحوش الخلفي بسور، تطل عليها الصالة بباب زجاجي مزدوج وغرف الجناحين بنوافذها، وممرا الحديقة يصلان الغرف الخلفية.'); } }
  if (cand.placed.some(p => p.block.filler)) notes.push(`${cand.upper ? 'الدور العلوي' : 'الدور الأرضي'} أوسع من برنامجه (الدوران بمسطح واحد): خُصّص الفائض ${cand.placed.filter(p => p.block.filler).map(p => '«' + p.block.name + '»').join(' و')} بدل تكبير غرفة واحدة؛ لم يطلبها العميل ويمكن تغيير استعمالها أو حذفها في المرسم.`);
  if (cand.mode === 'L') notes.push('مبنى على شكل L: جناح أمامي بعرض المبنى وذراع خلفي على جانب، والزاوية الباقية ساحة خارجية؛ الممر الخلفي يصل الصالة بالذراع.');
  if (cand.courtVoid) notes.push('الدور العلوي يحيط بفراغ الحديقة (مفتوح للسماء) وتطل عليه الغرف.');
  // أزواج الحمامات: جهة الشريط لكل جناح نوم نحو جاره من الأجنحة
  const suites = cand.placed.filter(p => ['suite', 'maid'].includes(p.block.kind) && p.block.bath !== false);
  const stripSide = new Map();
  for (const p of suites) {
    const perp = isX(p.door) ? ['y0', 'y1'] : ['x0', 'x1'];
    const already = perp.find(s => suites.some(q => q !== p && stripSide.get(q) === opp[s] && Math.abs(p.r[s] - q.r[opp[s]]) < 1e-3 && (isX(s) ? Math.min(p.r.y1, q.r.y1) - Math.max(p.r.y0, q.r.y0) : Math.min(p.r.x1, q.r.x1) - Math.max(p.r.x0, q.r.x0)) > 1));
    if (already) { stripSide.set(p, already); continue; }
    // مع غرفة في مقدمة المحور العلوي: شريط حمام الغرفة الأمامية نحو الواجهة ليبقى جزء النوم ملاصقًا للصالة
    if (cand.frontDepth && p.r.y0 < EPS && perp.includes('y0')) { stripSide.set(p, 'y0'); continue; }
    const mate = perp.find(s => suites.some(q => q !== p && !stripSide.has(q) && Math.abs(p.r[s] - q.r[opp[s]]) < 1e-3));
    // بلا جار: الشريط نحو الجدار الداخلي (ليس الخارجي) ليبقى للغرفة جدار خارجي
    const interior = perp.find(s => !(s === 'x0' && p.r.x0 < EPS) && !(s === 'x1' && p.r.x1 > W - EPS) && !(s === 'y0' && p.r.y0 < EPS) && !(s === 'y1' && p.r.y1 > D - EPS));
    stripSide.set(p, mate || interior || perp[0]);
  }
  let pendingGuestWc = null; const pendingService = [];
  for (const p of cand.placed) detail(p);
  // باب خدمة لمجلس الرجال إلى الطعام أو المطبخ إن جاوره (للضيافة)؛ وإلا يبقى المجلس مستقلًا تمامًا
  for (const m of pendingService) {
    const host = rooms.find(x => ['dining', 'kitchen'].includes(x.kind) && shared(m, x) && (shared(m, x).to - shared(m, x).from) >= 1.2);
    if (host) { const e = shared(m, host); doors.push({ a: m.id, b: host.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .9 }); notes.push(`مجلس الرجال بمدخل خارجي مستقل${m.noWc ? '' : ' ودورة مياه خاصة'}، ولا يمر الضيف بالعائلة؛ له باب خدمة إلى «${host.name}» للضيافة.`); }
    else {
      // الطعام خلف مغاسل المجلس: باب الخدمة من المغاسل إلى الطعام (الضيف يمر بالمغاسل إلى المقلط كما في العرف)، فيتجاوران فعلًا
      const wash = rooms.find(x => x.id === m.id + '-wash'), din = wash && rooms.find(x => x.kind === 'dining' && shared(wash, x) && (shared(wash, x).to - shared(wash, x).from) >= 1.1);
      if (din) { const e = shared(wash, din); doors.push({ a: wash.id, b: din.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .9 }); notes.push(`مجلس الرجال بمدخل خارجي مستقل ودورة مياه خاصة، ولا يمر الضيف بالعائلة؛ مغاسله تفتح على «${din.name}» للضيافة.`); }
      else notes.push(`مجلس الرجال بمدخل خارجي مستقل${m.noWc ? '' : ' ودورة مياه خاصة'}، ومنفصل تمامًا عن العائلة (بلا باب داخلي).`);
    }
  }
  if (pendingGuestWc && !(realFoyer && foyerWc(pendingGuestWc))) { program = { ...program, extraBaths: program.extraBaths + 1 }; notes.push('دورة مياه الضيوف لم تتسع بجوار المجلس فوُضعت مع دورات المياه العامة.'); }
  // باب خارجي مطلوب (مكتب بمدخل خارجي، خادمة بباب على الحوش): على أطول جدار خارجي؛ الخادمة ليس على الواجهة الأمامية
  for (const p of cand.placed.filter(q => q.block.ext)) {
    const room = rooms.find(r => r.id === p.block.id); if (!room) continue;
    const e = exteriorEdges(room, W, D).filter(x => p.block.kind === 'office' || x.side !== 'y0').sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
    if (e && e.to - e.from >= 1.4) { const pos = e.from + Math.min(.9, (e.to - e.from) / 2); doors.push({ a: room.id, edge: e, pos, kind: 'door', w: .9, entry: true }); notes.push(`«${room.name}» بباب خارجي مستقل.`); }
    else notes.push(`«${room.name}»: لم يلامس جدارًا خارجيًا مناسبًا لباب مستقل في هذا البديل.`);
  }
  const kit = rooms.find(r => r.id === 'kitchen1'), din = rooms.find(r => r.id === 'dining1');
  // غسيل ومخزن: شريط في المطبخ على الجهة البعيدة عن الطعام
  if (program.kitchenStrip?.length) { if (!kit || !kitchenStrip(kit, program.kitchenStrip)) notes.push(`${program.kitchenStrip.map(k => k === 'laundry' ? 'غرفة الغسيل' : 'المخزن').join(' و')} لم تتسع بجوار المطبخ في هذا البديل.`); }
  // دورات المياه الإضافية: شريط في المطبخ ثم الصالة العائلية ثم الطعام على جهة الحركة
  let extra = program.extraBaths;
  for (const kind of ['kitchen', 'family', 'dining']) for (const host of rooms.filter(r => r.kind === kind)) {
    if (extra <= 0) break;
    if (bathStrip(host)) extra--;
  }
  if (extra > 0) notes.push(`${extra} دورة مياه إضافية لم تجد موضعًا مناسبًا في هذا البديل.`);
  // المطبخ والطعام: باب عادي أو فتحة واسعة إن طلب العميل مطبخًا مفتوحًا
  if (kit && din) {
    const e = shared(kit, din);
    if (e && e.to - e.from >= 1.2) { const open = program.prefs?.openKitchen; doors.push({ a: kit.id, b: din.id, edge: e, pos: (e.from + e.to) / 2, kind: open ? 'arch' : 'door', w: open ? Math.min(2.6, e.to - e.from - .6) : .95 }); }
    else if (program.prefs?.openKitchen) notes.push('المطبخ المفتوح: المطبخ لا يجاور الطعام في هذا البديل؛ اختر بديلًا آخر أو حرّكهما في المرسم.');
  }
  // مدخل العائلة/النساء: باب خارجي على جانب (ليس الواجهة الرئيسية) في مجلس النساء أو الصالة/الممر أو الصالة العائلية
  if (program.prefs?.familyEntrance) {
    const pick = [rooms.find(r => r.id === 'majlis2'), rooms.find(r => r.id === 'gallery'), rooms.find(r => r.id === 'hall'), ...rooms.filter(r => r.kind === 'family'), din].filter(Boolean);
    let done = false;
    for (const r of pick) {
      const e = exteriorEdges(r, W, D).filter(x => x.side !== 'y0').sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
      if (e && e.to - e.from >= 1.4) { doors.push({ a: r.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: 1.0, family: true }); notes.push(`مدخل العائلة المستقل: باب جانبي إلى «${r.name}».`); done = true; break; }
    }
    if (!done) notes.push('مدخل العائلة المستقل لم يجد جدارًا خارجيًا جانبيًا مناسبًا في هذا البديل.');
  }
  // مدخل ثانٍ للأرض (جهة أخرى على شارع): باب خارجي على تلك الجهة إلى فراغ حركة، وإلا إلى أقرب فراغ عام
  if (secondEntry) {
    const prefer = [...rooms.filter(r => r.circ), ...rooms.filter(r => ['majlis', 'family', 'dining'].includes(r.kind))];
    let done = false;
    for (const r of prefer) {
      const e = exteriorEdges(r, W, D).find(x => x.side === secondEntry);
      if (e && e.to - e.from >= 1.4) { doors.push({ a: r.id, edge: e, pos: (e.from + e.to) / 2, kind: r.circ ? 'door2' : 'door', w: r.circ ? 1.4 : 1.0, entry2: true }); notes.push(`المدخل الثاني للأرض: باب إلى «${r.name}».`); done = true; break; }
    }
    if (!done) notes.push('المدخل الثاني للأرض: لا يلامس فراغًا عامًا مناسبًا على تلك الجهة في هذا البديل؛ يمكن إضافته في المرسم.');
  }
  if (program.prefs?.guestEntrance && !doors.some(d => d.guest || d.men)) notes.push('مدخل الضيوف المستقل: المجلس لا يلامس الواجهة الأمامية في هذا البديل.');
  return { rooms, doors, notes, W, D, mode: cand.mode, court: courtRect, courtOpen: !!courtRoom, upper: !!cand.upper };

  function kitchenStrip(host, items) {
    // شريط على الجهة العمودية لباب المطبخ، بعيدًا عن الطعام؛ الغسيل في الطرف الخارجي (نافذة) والمخزن عند جهة الحركة
    const perp = isX(host.door) ? ['y0', 'y1'] : ['x0', 'x1'];
    const awayDin = perp.filter(z => !(din && Math.abs(host[z] - din[opp[z]]) < 1e-3));
    const side = awayDin[0] || perp[1];
    const depth = isX(side) ? W_(host) : H_(host);
    if (depth - 1.6 < 2.6) return false;
    const L = sideLen(host, side), need = items.length === 2 ? 3.4 : 1.6; if (L < need) return false;
    const [strip, rest] = cut(host, side, 1.6);
    Object.assign(host, { x0: snap(rest.x0), y0: snap(rest.y0), x1: snap(rest.x1), y1: snap(rest.y1) });
    for (const d of doors.filter(d => d.a === host.id && !d.b)) doors.splice(doors.indexOf(d), 1);
    for (const d of doors.filter(d => d.a === host.id && d.service)) doors.splice(doors.indexOf(d), 1);
    circDoor(host.id, host, host.door, 'door', .95);
    const pieces = items.length === 2 ? split(strip, host.door, Math.max(1.6, L * .4)) : [strip];
    const order = items.length === 2 ? ['storage', 'laundry'] : items;
    pieces.forEach((pr, i) => {
      const kind = order[i], x = add(pr, { id: 'kitchen-' + kind, type: kind === 'laundry' ? 'laundry' : 'storage', name: kind === 'laundry' ? 'غرفة الغسيل' : 'المخزن', kind: kind === 'laundry' ? 'laundry' : 'store', door: opp[side] });
      const e = shared(x, host); if (e) doors.push({ a: x.id, b: host.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: Math.min(.85, e.to - e.from - .3) });
    });
    return true;
  }

  function circDoor(id, r, side, kind, w, prefer) {
    // باب على جهة الحركة: داخل جزء يلامس فراغ حركة، أقرب ما يكون إلى النقطة المفضلة
    const e = edgeOf(r, side), spans = [];
    for (const c of circRooms) { const s = shared(r, c); if (s && s.axis === e.axis && Math.abs(s.at - e.at) < 1e-3) spans.push({ ...s, cid: c.id }); }
    if (!spans.length) { notes.push(`تعذّر وصل «${id}» بالحركة.`); return; }
    // غرف النوم ودورات المياه لا تفتح على مدخل العائلة متى أمكن (خصوصية)
    const privateRoom = /^suite|bath|vest/.test(id);
    const okLen = sp => sp.to - sp.from >= Math.min(w, .9) + .45;
    let pool = privateRoom && spans.some(sp => sp.cid !== 'foyer' && okLen(sp)) ? spans.filter(sp => sp.cid !== 'foyer' && okLen(sp)) : spans;
    // «الحمامات ما تفتح على الصالة»: دورة المياه تفتح على الممر متى وُجد
    if (/bath/.test(id) && program.prefs?.bathsOffHall && pool.some(sp => sp.cid !== 'hall' && okLen(sp))) pool = pool.filter(sp => sp.cid !== 'hall' && okLen(sp));
    const best = pool.sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
    const ww = Math.min(w, best.to - best.from - .3); if (ww < .7) return;
    const lo = best.from + .15 + ww / 2, hi = best.to - .15 - ww / 2;
    const pos = prefer === undefined ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, prefer));
    doors.push({ a: id, edge: best, pos, kind, w: ww });
  }
  function detail(p) {
    const b = p.block, r = p.r, side = p.door;
    if (b.kind === 'office' || b.kind === 'prayer') { const o = add(r, { id: b.id, type: b.kind === 'office' ? 'office' : 'other', name: b.name, kind: b.kind, door: side }); circDoor(o.id, o, side, 'door', .95); return; }
    if (b.kind === 'suite' || b.kind === 'maid' || b.kind === 'driver') {
      const type = b.master ? 'master' : b.kind === 'suite' ? 'bedroom' : 'service';
      const bathName = b.kind === 'maid' ? 'حمام الخادمة' : b.kind === 'driver' ? 'حمام السائق' : null;
      if (b.kind === 'driver') {
        // السائق: مدخل من الخارج، ولا يتصل بداخل البيت
        const ext = ['x0', 'x1', 'y0'].filter(z => (z === 'x0' && r.x0 < EPS) || (z === 'x1' && r.x1 > W - EPS) || (z === 'y0' && r.y0 < EPS));
        const room = add(b.bath ? cut(r, isX(side) ? 'y1' : (side === 'y0' ? 'x1' : 'x1'), 1.6)[1] : r, { id: b.id, type, name: b.name, kind: 'driver', door: side });
        if (b.bath) { const [strip] = cut(r, isX(side) ? 'y1' : 'x1', 1.6); const bt = add(strip, { id: b.id + '-bath', type: 'bath', name: bathName, kind: 'bath', door: isX(side) ? 'y0' : 'x0' }); const e = shared(bt, room); if (e) doors.push({ a: bt.id, b: room.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .75 }); }
        if (ext.length) { const e = edgeOf(room, ext[0]); doors.push({ a: room.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .9, service: true, entry: true }); }
        else { circDoor(room.id, room, side, 'door', .9); notes.push('غرفة السائق لم تلامس جدارًا خارجيًا فوُصلت بالداخل؛ يُفضّل نقلها لمدخل خارجي.'); }
        return;
      }
      if (!b.bath) { const bed = add(r, { id: b.id, type, name: b.name, kind: 'suite', door: side }); circDoor(b.id, bed, side, 'door', .95); return; }
      const ss0 = stripSide.get(p), t0 = b.master ? T.masterStripD : T.stripD;
      const bl0 = b.master ? T.masterBathL : b.kind === 'suite' ? T.bathL : 2.2, closetMax = b.master ? 3.4 : b.kind === 'suite' ? 2.6 : 1.4;
      // غرفة عميقة: الشريط الجانبي يصبح خزانة طويلة بلا معنى؛ نستعمل مدخلًا (ممر الجناح) بجوار الحمام على جهة الباب
      if (sideLen(r, ss0) > bl0 + closetMax + .3 && sideLen(r, side) >= 1.3 + bl0 * .9) {
        const td = b.master ? 2.4 : 2.1;
        const [strip, rest] = cut(r, side, td);
        const near = ss0; // الحمام في طرف الجار (ظهر لظهر مع حمام الجار)
        const [bathR, vestR] = split(strip, near, Math.min(bl0, sideLen(r, side) - 1.3));
        const bed = add(rest, { id: b.id, type, name: b.name, kind: 'suite', door: opp[side], strip: side });
        const vest = add(vestR, b.master ? { id: b.id + '-vest', type: 'storage', name: 'غرفة الملابس', kind: 'dress', door: side, walk: true } : { id: b.id + '-vest', type: 'corridor', name: 'مدخل الجناح', kind: 'vest', door: side });
        const bath = add(bathR, { id: b.id + '-bath', type: 'bath', name: bathName || ('حمام ' + (b.master ? 'الرئيسية' : b.name.replace('غرفة نوم ', 'غرفة '))), kind: 'bath', door: opp[near], far: near });
        const ev = edgeOf(vest, side); circDoor(vest.id, vest, side, 'door', .95, (ev.from + ev.to) / 2);
        const eb2 = shared(vest, bed); if (eb2) doors.push({ a: bed.id, b: vest.id, edge: eb2, pos: (eb2.from + eb2.to) / 2, kind: 'arch', w: Math.min(1.1, eb2.to - eb2.from - .3) });
        if (b.bathShared) { bath.name = 'دورة مياه مشتركة'; const eb = edgeOf(bath, side); circDoor(bath.id, bath, side, 'door', .8, (eb.from + eb.to) / 2); }
        else { const eb3 = shared(bath, vest); if (eb3) doors.push({ a: bath.id, b: vest.id, edge: eb3, pos: (eb3.from + eb3.to) / 2, kind: 'door', w: .8 }); }
        return;
      }
      const ss = ss0, t = t0;
      const [strip, rest] = cut(r, ss, t);
      const L = sideLen(r, ss);
      // الرئيسية تحتفظ بغرفة ملابس: يقصر الحمام (حتى 2.4 م) ليتسع لها
      const bl = b.master && L - bl0 < 1.5 && L - 2.4 >= 1.5 ? L - 1.5 : Math.min(bl0, L);
      // الحمام في الطرف البعيد عن باب الغرفة، والخزانة قرب الباب
      const [bathR, closetR] = L - bl >= 1.5 ? split(strip, b.bathShared ? side : opp[side], bl) : [strip, null];
      const bed = add(rest, { id: b.id, type, name: b.name, kind: 'suite', door: side, strip: ss });
      const bath = add(bathR, { id: b.id + '-bath', type: 'bath', name: bathName || ('حمام ' + (b.master ? 'الرئيسية' : b.name.replace('غرفة نوم ', 'غرفة '))), kind: 'bath', door: ss, far: side });
      // باب الغرفة قرب الشريط (مدخل يمرّ بالخزانة)
      const ed = edgeOf(bed, side), nearStrip = (ss === 'x0' || ss === 'y0') ? ed.from : ed.to;
      circDoor(b.id, bed, side, 'door', .95, b.bathShared ? (nearStrip === ed.from ? ed.to - .65 : ed.from + .65) : nearStrip + (nearStrip === ed.from ? .65 : -.65));
      if (b.bathShared) { bath.name = 'دورة مياه مشتركة'; bath.far = opp[side]; const ebs = edgeOf(bath, side); circDoor(bath.id, bath, side, 'door', .8, (ebs.from + ebs.to) / 2); }
      else { const eb = shared(bath, bed); if (eb) doors.push({ a: bath.id, b: b.id, edge: eb, pos: closerTo(eb, edgeOf(r, side).at, eb.axis === 'x' ? 'y' : 'x', .55), kind: 'door', w: .8 }); }
      if (closetR) {
        const cl = add(closetR, { id: b.id + '-dress', type: 'storage', name: b.master ? 'غرفة ملابس' : b.kind === 'suite' ? 'خزانة ملابس' : 'خزانة', kind: 'dress', door: ss });
        const ec = shared(cl, bed); if (ec) doors.push({ a: cl.id, b: b.id, edge: ec, pos: (ec.from + ec.to) / 2, kind: ec.to - ec.from >= 1.6 ? 'arch' : 'door', w: Math.min(1.2, ec.to - ec.from - .3) });
      }
      return;
    }
    if (b.kind === 'terrace') {
      // فراغ خارجي محفور في الكتلة: يُدخل إليه من فراغ الحركة بباب منزلق زجاجي، وجيرانه يطلّون عليه بنوافذهم
      const t = add(r, { id: b.id, type: 'balcony', name: b.name, kind: 'terrace', door: side });
      circDoor(t.id, t, side, 'slider', 2.4);
      notes.push(b.note || (cand.upper ? `«${b.name}» علوي فوق جزء من الدور الأرضي: الدور العلوي أصغر من الأرضي فتتدرج الكتلة، ويُدخل إليه من ${hallName} بباب منزلق زجاجي.` : `«${b.name}»: فراغ خارجي محفور في الكتلة تفتح عليه الصالة بباب منزلق زجاجي وتطل عليه الغرف المجاورة.`));
      return;
    }
    if (b.kind === 'majlis') { majlisZone(b, r, side); return; }
    if (b.kind === 'dining') { const d = add(r, { id: b.id, type: 'dining', name: b.name, kind: 'dining', door: side }); circDoor(d.id, d, side, 'arch', 1.8); return; }
    if (b.kind === 'family') { const d = add(r, { id: b.id, type: 'living', name: b.name, kind: 'family', door: side }); circDoor(d.id, d, side, 'arch', 2.2); return; }
    if (b.kind === 'kitchen') {
      const k = add(r, { id: b.id, type: 'kitchen', name: b.name, kind: 'kitchen', door: side });
      // مطبخ مفتوح على الصالة (طلب صريح): فتحة واسعة بلا باب على جهة الحركة
      if (program.prefs?.kitchenOpenHall && b.id === 'kitchen1') circDoor(k.id, k, side, 'arch', 2.4); else circDoor(k.id, k, side, 'door', .95);
      // باب خدمة على جدار خارجي ليس الواجهة الأمامية
      const ext = [['x0', r.x0 < EPS], ['x1', r.x1 > W - EPS], ['y1', r.y1 > D - EPS]].filter(([, on]) => on).map(([s]) => s);
      const longest = ext.map(sd => edgeOf(r, sd)).sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
      if (longest && longest.to - longest.from >= 4.2) doors.push({ a: k.id, edge: longest, pos: longest.to - .7, kind: 'door', w: .9, service: true });
      return;
    }
  }
  /**
   * مجلس الرجال: مدخل خارجي خاص من الواجهة إلى «ممر الرجال» ثم المجلس، ودورة مياهه من الممر؛ لا يمر الضيف بالعائلة.
   * يبقى باب خدمة واحد من المجلس إلى الداخل لتقديم الضيافة (يُذكر في الملاحظات ويمكن إلغاؤه في المرسم).
   * مجلس النساء: يُدخل إليه من ردهة العائلة، وله ممر ودورة مياه خاصة، ولا يتصل بمنطقة الرجال.
   */
  function majlisZone(b, r, side) {
    const men = b.men, fx = (foyer.x0 + foyer.x1) / 2;
    const xSides = ['x0', 'x1'], interiorX = xSides.filter(z => !(z === 'x0' && r.x0 < EPS) && !(z === 'x1' && r.x1 > W - EPS));
    if (men) {
      const front = r.y0 < EPS;
      const stripSide = isX(side) ? side : (interiorX.sort((a, c) => Math.abs(r[a] - fx) - Math.abs(r[c] - fx))[0] || 'x1');
      const L2 = sideLen(r, stripSide), restW = W_(r) - T.guestStripW;
      if (front && b.guestWc && L2 >= T.guestWcL + 1.6 && restW >= 3.4 && (isX(stripSide) ? menMajlisPlan(W_(r), H_(r)).plan === 'side' : true)) {
        const [strip, rest] = cut(r, stripSide, T.guestStripW);
        const [lobbyR, wcR] = split(strip, 'y0', L2 - T.guestWcL);
        const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
        const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: 'مدخل الرجال', kind: 'lobby', door: 'y0', zone: 'men' });
        const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: 'دورة مياه الرجال', kind: 'wc', door: 'y0', far: 'y1', zone: 'men' });
        doors.push({ a: lobby.id, edge: { axis: 'y', at: 0, from: lobby.x0, to: lobby.x1 }, pos: (lobby.x0 + lobby.x1) / 2, kind: 'door', w: Math.min(1.1, W_(lobby) - .3), entry: true, men: true });
        const em = shared(m, lobby); if (em) doors.push({ a: m.id, b: lobby.id, edge: em, pos: em.from + Math.min(1.2, (em.to - em.from) / 2), kind: 'arch', w: Math.min(1.4, em.to - em.from - .4) });
        const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: .75 });
        serviceDoor(m);
      } else if (front) {
        // بديل: المجلس يُدخل إليه مباشرة من الواجهة، وفي طرفه الخلفي «مغاسل» ثم دورة مياه الرجال
        const canBack = b.guestWc && H_(r) - T.washD >= 3.4 && W_(r) >= T.guestWcL + 1.2;
        const [strip, rest] = canBack ? cut(r, 'y1', T.washD) : [null, r];
        const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
        doors.push({ a: m.id, edge: { axis: 'y', at: 0, from: m.x0, to: m.x1 }, pos: (m.x0 + m.x1) / 2, kind: 'door2', w: 1.4, entry: true, men: true });
        if (canBack) washStrip(m, strip, 'men');
        serviceDoor(m);
        if (b.guestWc && !canBack) { program = { ...program, extraBaths: program.extraBaths + 1 }; m.noWc = true; notes.push('دورة مياه الرجال لم تتسع داخل منطقة المجلس في هذا البديل.'); }
      } else {
        // لا يُفترض أن يحدث (التقييم يرفضه): مجلس رجال بلا واجهة
        const m = add(r, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
        circDoor(m.id, m, side, 'door2', 1.4);
        notes.push('مجلس الرجال لا يلامس الواجهة في هذا البديل فلم يأخذ مدخلًا مستقلًا.');
      }
      return;
    }
    // مجلس النساء (أو مجلس إضافي): من ردهة العائلة، بممر ودورة مياه إن أمكن
    const canStrip = b.guestWc && (isX(side) ? W_(r) : H_(r)) - T.guestStripW >= 3.4 && sideLen(r, side) >= Math.max(3.4, T.guestWcL + 1.5);
    if (canStrip) {
      const [strip, rest] = cut(r, side, T.guestStripW);
      const nearEnd = isX(side) ? (r.y0 <= foyer.y1 ? 'y0' : 'y1') : (Math.abs(r.x0 - fx) < Math.abs(r.x1 - fx) ? 'x0' : 'x1');
      const [lobbyR, wcR] = split(strip, nearEnd, sideLen(r, side) - T.guestWcL);
      const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'women' });
      const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: b.women ? 'ممر النساء' : 'ممر الضيوف', kind: 'lobby', door: side, zone: 'women' });
      const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: b.women ? 'دورة مياه النساء' : 'دورة مياه الضيوف', kind: 'wc', door: nearEnd, far: opp[nearEnd], zone: 'women' });
      const le = edgeOf(lobby, side); circDoor(lobby.id, lobby, side, 'door2', 1.2, nearEnd === 'y0' || nearEnd === 'x0' ? le.from + .9 : le.to - .9);
      const em = shared(m, lobby); if (em) doors.push({ a: m.id, b: lobby.id, edge: em, pos: (em.from + em.to) / 2, kind: 'arch', w: Math.min(1.6, em.to - em.from - .4) });
      const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: .75 });
    } else {
      const backSide = isX(side) ? (r.y0 < EPS ? 'y1' : 'y1') : (side === 'y1' ? 'y0' : 'y1');
      const canBack = b.guestWc && (isX(backSide) ? W_(r) : H_(r)) - T.washD >= 3.4 && sideLen(r, backSide) >= T.guestWcL + 1.2 && backSide !== side;
      const [strip, rest] = canBack ? cut(r, backSide, T.washD) : [null, r];
      const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'women' });
      circDoor(m.id, m, side, 'door2', 1.4);
      if (canBack) washStrip(m, strip, 'women');
      else if (b.guestWc) pendingGuestWc = m;
    }
  }
  /** «مغاسل» ودورة مياه في شريط ملاصق للمجلس: دورة المياه في الطرف الخارجي (نافذة) والمغاسل تفتح على المجلس. */
  function washStrip(m, strip, zone) {
    const along = isX(strip.x0 === m.x1 || strip.x1 === m.x0 ? 'x0' : 'y0') ? 'y' : 'x';
    const ext = along === 'x' ? (strip.x0 < EPS ? 'x0' : strip.x1 > W - EPS ? 'x1' : (strip.x0 + strip.x1 < W ? 'x0' : 'x1')) : (strip.y1 > D - EPS ? 'y1' : 'y0');
    const [wcR, washR] = split(strip, ext, T.guestWcL);
    const wc = add(wcR, { id: m.id + '-wc', type: 'bath', name: zone === 'men' ? 'دورة مياه الرجال' : 'دورة مياه النساء', kind: 'wc', door: opp[ext], far: ext, zone });
    const wash = add(washR, { id: m.id + '-wash', type: 'corridor', name: 'مغاسل', kind: 'lobby', door: 'y0', zone });
    const e1 = shared(wash, m); if (e1) doors.push({ a: wash.id, b: m.id, edge: e1, pos: (e1.from + e1.to) / 2, kind: 'arch', w: Math.min(1.4, e1.to - e1.from - .3) });
    const e2 = shared(wc, wash); if (e2) doors.push({ a: wc.id, b: wash.id, edge: e2, pos: (e2.from + e2.to) / 2, kind: 'door', w: .75 });
  }
  function serviceDoor(m) { pendingService.push(m); }
  function foyerWc(majlis) {
    // دورة مياه الضيوف في طرف الردهة الملاصق للمجلس، تفتح على الردهة
    const fw = W_(foyer), fd = H_(foyer); if (fw < 3.8 || fd < 2.4) return false;
    const towardX0 = (majlis.x0 + majlis.x1) / 2 < (foyer.x0 + foyer.x1) / 2, sd = towardX0 ? 'x0' : 'x1';
    const [strip, rest] = cut(foyer, sd, Math.min(1.5, fw - 2.4));
    const [wcR, gap] = split(strip, 'y1', Math.min(2.0, fd - .1));
    Object.assign(foyer, { x0: snap(rest.x0), x1: snap(rest.x1) });
    // ما تبقى من الشريط أمام دورة المياه يعود للردهة بلا جدار: نجعله جزءًا من الردهة بتمديدها إن كان صغيرًا
    if (H_(gap) > .05) { Object.assign(wcR, { y0: foyer.y0 }); }
    const wc = add(wcR, { id: 'guest-wc', type: 'bath', name: 'دورة مياه الضيوف', kind: 'wc', door: opp[sd], far: 'y1' });
    const e = shared(wc, foyer); if (!e) return false;
    doors.push({ a: wc.id, b: 'foyer', edge: e, pos: e.from + .55, kind: 'door', w: .75 });
    // الباب الرئيسي يبقى في منتصف الردهة المعدّلة
    const main = doors.find(d => d.entry); if (main) main.edge = { axis: 'y', at: 0, from: foyer.x0, to: foyer.x1 };
    for (const d of doors) if (d.a === 'foyer' && d.b && d.edge) { const c = circRooms.find(x => x.id === d.b); const e2 = c && shared(foyer, c); if (e2) { d.edge = e2; d.w = Math.min(d.w, e2.to - e2.from - .4); } }
    return true;
  }
  function bathStrip(host) {
    const side = host.door; if (!side) return false;
    const tw = T.commonStripW, L = sideLen(host, side);
    if ((isX(side) ? W_(host) : H_(host)) - tw < (host.kind === 'kitchen' ? 2.4 : 3.0) || Math.min(W_(host), H_(host)) < 2.4 || L < T.commonBathL + 1.3) return false;
    const [strip, rest] = cut(host, side, tw);
    const far = isX(side) ? (host.y1 > (foyer.y0 + foyer.y1) / 2 ? 'y1' : 'y0') : (Math.abs(host.x1 - (foyer.x0 + foyer.x1) / 2) > Math.abs(host.x0 - (foyer.x0 + foyer.x1) / 2) ? 'x1' : 'x0');
    const [bathR, storeR] = split(strip, far, T.commonBathL);
    const keepDoor = doors.filter(d => d.a === host.id && d.edge && Math.abs(d.edge.at - host[side]) < 1e-3);
    Object.assign(host, { x0: snap(rest.x0), y0: snap(rest.y0), x1: snap(rest.x1), y1: snap(rest.y1) });
    const bath = add(bathR, { id: host.id + '-bath', type: 'bath', name: 'دورة مياه', kind: 'bath', door: side, far });
    // باب المضيف ينتقل إلى ما بقي من الشريط (يصبح ممرًا صغيرًا للمضيف) أو يُلغى إن لم يتسع
    for (const d of keepDoor) doors.splice(doors.indexOf(d), 1);
    if (sideLen(storeR, side) >= 1.2) {
      const lob = add(storeR, { id: host.id + '-lobby', type: 'corridor', name: host.kind === 'kitchen' ? 'ممر الخدمة' : 'ممر', kind: 'lobby', door: side, circ: false });
      const e1 = edgeOf(lob, side); circDoor(lob.id, lob, side, host.kind === 'kitchen' ? 'door' : 'arch', host.kind === 'kitchen' ? .95 : 1.4, (e1.from + e1.to) / 2);
      const e2 = shared(lob, host); if (e2) doors.push({ a: lob.id, b: host.id, edge: e2, pos: (e2.from + e2.to) / 2, kind: 'arch', w: Math.min(1.6, e2.to - e2.from - .3) });
      const e3 = shared(bath, lob); if (e3) doors.push({ a: bath.id, b: lob.id, edge: e3, pos: (e3.from + e3.to) / 2, kind: 'door', w: .75 });
    } else return false;
    return true;
  }
}
/** موضع على حد مشترك قريب من جهة معيّنة (at على المحور الآخر). */
function closerTo(e, at, _axis, m) { return Math.abs(e.from - at) < Math.abs(e.to - at) ? e.from + m : e.to - m; }

// ------------------------------------------------------------------------------------------ المستند
function frame(fp, entry, mirror, W, ox = 0, Wfull = W) {
  return (x, y) => {
    const xc = ox + (mirror ? W - x : x);
    void Wfull;
    if (entry === 's') return { x: fp.x + xc, y: fp.y + y };
    if (entry === 'n') return { x: fp.x + fp.w - xc, y: fp.y + fp.h - y };
    if (entry === 'e') return { x: fp.x + fp.w - y, y: fp.y + xc };
    return { x: fp.x + y, y: fp.y + fp.h - xc };
  };
}
function exteriorEdges(r, W, D, court = null) {
  const out = [];
  if (r.y0 < EPS) out.push({ axis: 'y', at: 0, from: r.x0, to: r.x1, side: 'y0' });
  if (r.y1 > D - EPS) out.push({ axis: 'y', at: D, from: r.x0, to: r.x1, side: 'y1' });
  if (r.x0 < EPS) out.push({ axis: 'x', at: 0, from: r.y0, to: r.y1, side: 'x0' });
  if (r.x1 > W - EPS) out.push({ axis: 'x', at: W, from: r.y0, to: r.y1, side: 'x1' });
  // الحدود المشتركة مع الحديقة الداخلية واجهات خارجية (نوافذ عليها)
  // court: مستطيل الحديقة الداخلية، أو قائمة فراغات خارجية (حديقة + تراسات/جلسات محفورة في الكتلة)
  for (const v of (Array.isArray(court) ? court : court ? [court] : [])) { if (!v || v === r || r.id === 'court' || r.id === v.id) continue; const e = shared(r, v); if (e && e.to - e.from > 1e-3) out.push({ axis: e.axis, at: e.at, from: e.from, to: e.to, side: e.axis === 'x' ? (Math.abs(r.x0 - e.at) < 1e-3 ? 'x0' : 'x1') : (Math.abs(r.y0 - e.at) < 1e-3 ? 'y0' : 'y1'), court: true }); }
  return out;
}

/** يبني مستند المرسم من التخطيط. */
/**
 * النافذة لا تعبر ملتقى جدار داخلي بجدارها (تمر خلف القاطع في المسقط، وتنزاح في المجسم والواجهة فتغطي فتحة مجاورة).
 * تُقاس على المستند النهائي: تُزاح داخل المقطع الحر بين ملتقيين، أو تُصغَّر (النافذة الكبيرة تصير عادية)، أو تُحذف إن لم تتسع
 * أو صادمت فتحة أخرى. غرفة تفقد نافذتها الوحيدة يرفضها فحص الجودة بعد ذلك (لا تُعرض ناقصة).
 */
export function fixWindowJunctions(doc) {
  const MIN = { window: .6, window2: 1.2 }, M = .15, cmds = [];
  for (const o of doc.openings) {
    if (!(o.kind in MIN)) continue;
    const w = doc.walls.find(x => x.id === o.wall); if (!w) continue;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); if (len < 1e-6) continue;
    const ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len, tol = (w.t || .2) / 2 + .02;
    const along = p => { const dx = p.x - w.a.x, dy = p.y - w.a.y; return { t: dx * ux + dy * uy, n: Math.abs(-dx * uy + dy * ux) }; };
    const js = doc.walls.filter(v => v !== w && v.level === w.level && v.kind !== 'fence').flatMap(v => [v.a, v.b].map(along)).filter(q => q.n < tol && q.t > 1e-3 && q.t < len - 1e-3).map(q => q.t);
    let s0 = o.at - o.w / 2, s1 = o.at + o.w / 2;
    if (!js.some(t => t > s0 + .02 && t < s1 - .02)) continue;
    const cuts = [0, ...js, len].sort((a, b) => a - b);
    // المقطع الحر الأوسع تقاطعًا مع النافذة
    let best = null; for (let k = 0; k + 1 < cuts.length; k++) { const lo = cuts[k], hi = cuts[k + 1], ov = Math.min(hi, s1) - Math.max(lo, s0); if (ov > 0 && (!best || ov > best.ov)) best = { lo, hi, ov }; }
    if (!best) { cmds.push({ type: 'delete', ids: [o.id] }); continue; }
    const room = best.hi - best.lo - 2 * M;
    let kind = o.kind, wNew = Math.min(o.w, snap(room - .05));
    if (kind === 'window2' && wNew < MIN.window2) kind = 'window';
    if (wNew < MIN[kind]) { cmds.push({ type: 'delete', ids: [o.id] }); continue; }
    const at = Math.min(best.hi - M - wNew / 2, Math.max(best.lo + M + wNew / 2, o.at));
    s0 = at - wNew / 2; s1 = at + wNew / 2;
    const clash = doc.openings.some(q => q !== o && q.wall === o.wall && Math.min(s1, q.at + q.w / 2) - Math.max(s0, q.at - q.w / 2) > -.1);
    cmds.push(clash ? { type: 'delete', ids: [o.id] } : { type: 'update', id: o.id, patch: { at: +at.toFixed(3), w: +wNew.toFixed(3), ...(kind !== o.kind ? { kind } : {}) } });
  }
  for (const c of cmds) { try { doc = applyCommand(doc, c).doc; } catch { /* يبقى كما هو */ } }
  return doc;
}
export function layoutToDoc(layout, { land, plot, fp, entry, mirror = false, title = 'تصميم شرعاء', ox = 0, Wfull }) {
  const T = frame(fp, entry, mirror, layout.W, ox, Wfull ?? layout.W);
  let doc = createDoc({ title });
  doc = applyCommand(doc, { type: 'set-plot', polygon: [{ x: 0, y: 0 }, { x: plot.width, y: 0 }, { x: plot.width, y: plot.length }, { x: 0, y: plot.length }], setbacks: fp.sb, north: 0, entry }).doc;
  if (land?.streets?.length && land?.entries?.length) doc = applyCommand(doc, { type: 'set-plot', streets: land.streets, entries: land.entries }).doc;
  return drawLevel(doc, layout, { level: LV, T });
}
/** يرسم تخطيطًا في دور من المستند (جدران، فتحات، تسميات، أثاث). T: تحويل الإحداثيات القانونية. */
export function drawLevel(doc0, layout, { level, T }) {
  const { rooms, W, D } = layout, LVL = level;
  let doc = doc0;
  const run = c => { const r = applyCommand(doc, c); doc = r.doc; return r.ids; };
  // الجدران: حواف المستطيلات مدمجة على الخطوط المتسامتة
  const segs = { x: new Map(), y: new Map() };
  const addSeg = (axis, at, a, b) => { const k = r2(at); if (!segs[axis].has(k)) segs[axis].set(k, []); segs[axis].get(k).push([a, b]); };
  const court = layout.court || null;
  // التراس والجلسة الخارجية: فراغ خارجي محفور في الكتلة؛ حدوده مع الغرف جدران خارجية، وحافته الحرة حاجز منخفض لا جدار
  const terraces = rooms.filter(r => r.kind === 'terrace'), voids = [court, ...terraces].filter(Boolean);
  for (const r of rooms) { if (r.kind === 'terrace') continue; addSeg('y', r.y0, r.x0, r.x1); if (!(r.kind === 'court' && r.open === 'y1')) addSeg('y', r.y1, r.x0, r.x1); addSeg('x', r.x0, r.y0, r.y1); addSeg('x', r.x1, r.y0, r.y1); }
  const onCourt = (axis, at, a, b) => !!court && (axis === 'x' ? (Math.abs(at - court.x0) < 1e-3 || Math.abs(at - court.x1) < 1e-3) && Math.min(b, court.y1) - Math.max(a, court.y0) > 1e-3 : Math.abs(at - court.y0) < 1e-3 && Math.min(b, court.x1) - Math.max(a, court.x0) > 1e-3);
  const onTerrace = (axis, at, a, b) => terraces.some(v => (axis === 'x' ? (Math.abs(at - v.x0) < 1e-3 || Math.abs(at - v.x1) < 1e-3) && Math.min(b, v.y1) - Math.max(a, v.y0) > 1e-3 : (Math.abs(at - v.y0) < 1e-3 || Math.abs(at - v.y1) < 1e-3) && Math.min(b, v.x1) - Math.max(a, v.x0) > 1e-3));
  const isExt = (axis, at, a = 0, b = 0) => (axis === 'y' ? Math.abs(at) < EPS || Math.abs(at - D) < 1e-3 : Math.abs(at) < EPS || Math.abs(at - W) < 1e-3) || onCourt(axis, at, a, b) || onTerrace(axis, at, a, b);
  const walls = [];
  for (const axis of ['x', 'y']) for (const [at, list] of segs[axis]) {
    list.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const [a, b] of list) { const last = merged[merged.length - 1]; if (last && a <= last[1] + 1e-3) last[1] = Math.max(last[1], b); else merged.push([a, b]); }
    for (const [a, b] of merged) {
      const pa = axis === 'y' ? T(a, at) : T(at, a), pb = axis === 'y' ? T(b, at) : T(at, b);
      const id = run({ type: 'add-wall', level: LVL, a: pa, b: pb, t: isExt(axis, at, a, b) ? EXT : INT })[0];
      walls.push({ axis, at, a, b, id, pa });
    }
  }
  // حاجز التراس: أجزاء حافته التي لا يغطيها جدار غرفة (الحافة الحرة على محيط الكتلة)
  for (const v of terraces) for (const [axis, at, a0, b0] of [['y', v.y0, v.x0, v.x1], ['y', v.y1, v.x0, v.x1], ['x', v.x0, v.y0, v.y1], ['x', v.x1, v.y0, v.y1]]) {
    const cover = walls.filter(x => x.axis === axis && Math.abs(x.at - at) < 1e-3 && x.b > a0 + 1e-3 && x.a < b0 - 1e-3).map(x => [Math.max(a0, x.a), Math.min(b0, x.b)]).sort((p, q) => p[0] - q[0]);
    let c = a0; const gaps = []; for (const [x0, x1] of cover) { if (x0 > c + .05) gaps.push([c, x0]); c = Math.max(c, x1); } if (c < b0 - .05) gaps.push([c, b0]);
    for (const [g0, g1] of gaps) { const pa = axis === 'y' ? T(g0, at) : T(at, g0), pb = axis === 'y' ? T(g1, at) : T(at, g1); try { run({ type: 'add-wall', level: LVL, a: pa, b: pb, t: .2, h: layout.upper ? OPEN_CAPS.parapet : OPEN_CAPS.seatWall, kind: 'fence' }); } catch { /* حاجز اختياري */ } }
  }
  const opening = (axis, at, pos, kind, extra = {}) => {
    const w = walls.find(x => x.axis === axis && Math.abs(x.at - at) < 1e-3 && pos >= x.a - 1e-3 && pos <= x.b + 1e-3); if (!w) return null;
    const P = v => { const q = axis === 'y' ? T(v, at) : T(at, v); return Math.hypot(q.x - w.pa.x, q.y - w.pa.y); };
    let atDoc = P(pos);
    // النافذة: موضع خالٍ داخل مقطع غرفتها (بين ملتقيي الجدران الداخلية) بعيدًا عن الفتحات القائمة؛ وإلا انزلقت في
    // المستند إلى «أقرب موضع خالٍ» عابرةً القاطع إلى الغرفة المجاورة. تُصغَّر عند الحاجة، وتُترك إن لم تتسع.
    if (kind === 'window' || kind === 'window2') {
      const js = walls.filter(v => v.axis !== axis && v.at > w.a + 1e-3 && v.at < w.b - 1e-3 && at >= v.a - 1e-3 && at <= v.b + 1e-3).map(v => v.at);
      const cuts = [w.a, ...js, w.b].sort((a, b) => a - b); let lo = w.a, hi = w.b;
      for (let i = 0; i + 1 < cuts.length; i++) if (pos >= cuts[i] - 1e-3 && pos <= cuts[i + 1] + 1e-3) { lo = cuts[i]; hi = cuts[i + 1]; break; }
      const M = .15, g = .1, a0 = Math.min(P(lo), P(hi)) + M, a1 = Math.max(P(lo), P(hi)) - M;
      const busyDoc = doc.openings.filter(o => o.wall === w.id).map(o => [o.at - o.w / 2 - g, o.at + o.w / 2 + g]).sort((x, y) => x[0] - y[0]);
      const free = []; let c = a0; for (const [b0, b1] of busyDoc) { if (b0 > c) free.push([c, Math.min(b0, a1)]); c = Math.max(c, b1); } if (c < a1) free.push([c, a1]);
      const minW = kind === 'window2' ? 1.2 : .6, want = extra.w ?? (kind === 'window2' ? 2.2 : 1.4);
      const fits = free.filter(([x0, x1]) => x1 - x0 >= minW - 1e-6).sort((A, B) => Math.min(Math.abs(atDoc - A[0]), Math.abs(atDoc - A[1]), atDoc >= A[0] && atDoc <= A[1] ? 0 : 1e9) - Math.min(Math.abs(atDoc - B[0]), Math.abs(atDoc - B[1]), atDoc >= B[0] && atDoc <= B[1] ? 0 : 1e9));
      if (!fits.length) return null;
      const [x0, x1] = fits[0], ww = Math.min(want, snap(x1 - x0 - .02) || 0) >= minW ? Math.min(want, snap(x1 - x0 - .02)) : x1 - x0;
      extra = { ...extra, w: ww }; atDoc = Math.min(x1 - ww / 2, Math.max(x0 + ww / 2, atDoc));
    }
    try { return run({ type: 'add-opening', wall: w.id, kind, at: atDoc, ...extra })[0]; } catch { return null; }
  };
  // سور الحديقة الداخلية من جهة الحوش الخلفي (2.4 م) يغلق الفناء بلا سقف
  if (court && layout.courtOpen) { const pa = T(court.x0, court.y1), pb = T(court.x1, court.y1); try { run({ type: 'add-wall', level: LVL, a: pa, b: pb, t: EXT, h: 2.4, kind: 'fence' }); } catch { /* سور اختياري */ } }
  const byId = new Map(rooms.map(r => [r.id, r]));
  const doorAt = []; // للأثاث: مواقع الأبواب القانونية
  for (const d of layout.doors) {
    const e = d.edge, pos = d.pos ?? (e.from + e.to) / 2, w = Math.max(.6, d.w ?? .9);
    // الباب يفتح نحو الغرفة a (داخلها)؛ اتجاه الفتح يحسب من الجهة
    const a = byId.get(d.a);
    const into = a ? (e.axis === 'x' ? (a.x0 + a.x1) / 2 > e.at : (a.y0 + a.y1) / 2 > e.at) : true;
    const p0 = e.axis === 'y' ? T(pos - 1, e.at) : T(e.at, pos - 1), pIn = e.axis === 'y' ? T(pos, e.at + (into ? 1 : -1)) : T(e.at + (into ? 1 : -1), pos);
    const id = opening(e.axis, e.at, pos, d.kind, { w, entry: !!(d.entry || d.entry2) });
    if (id && ['door', 'door2'].includes(d.kind)) setSwing(id, pIn);
    void p0;
    doorAt.push({ room: d.a, other: d.b, axis: e.axis, at: e.at, pos, w });
  }
  // النوافذ على الجدران الخارجية
  for (const r of rooms) {
    if (r.id === 'foyer' || r.kind === 'lobby' || r.type === 'storage' || r.kind === 'court' || r.kind === 'terrace') continue;
    for (const e of exteriorEdges(r, W, D, voids)) {
      const len = e.to - e.from, busy = doorAt.filter(d => d.axis === e.axis && Math.abs(d.at - e.at) < 1e-3 && d.pos > e.from && d.pos < e.to);
      if (r.type === 'bath') { if (len >= 1 && !busy.length) opening(e.axis, e.at, (e.from + e.to) / 2, 'window', { w: .6, h: .6, sill: 1.7 }); continue; }
      if (r.type === 'corridor' && e.court) { const n = Math.max(1, Math.floor(len / 3.2)); for (let i = 0; i < n; i++) opening(e.axis, e.at, e.from + len * (i + .5) / n, 'window2', { w: Math.min(2.2, len / n - .6) }); continue; }
      if (r.type === 'corridor') { if (len < 2.5) opening(e.axis, e.at, (e.from + e.to) / 2, 'window', { w: .9 }); continue; }
      if (len < 1.6) continue;
      const big = ['majlis', 'living', 'dining', 'master'].includes(r.type) && len >= 3.4;
      const spots = big && len >= 6.5 ? [e.from + len * .27, e.from + len * .73] : [(e.from + e.to) / 2];
      for (let sp of spots) {
        const ww = big ? 2.2 : 1.4;
        const clash = d => Math.abs(d.pos - sp) < d.w / 2 + ww / 2 + .25;
        if (busy.some(clash)) { const d = busy[0]; const alt = d.pos > (e.from + e.to) / 2 ? e.from + .35 + ww / 2 : e.to - .35 - ww / 2; sp = alt; if (busy.some(clash) || sp - ww / 2 < e.from + .2 || sp + ww / 2 > e.to - .2) { if (len - d.w - .9 >= 1) { const w2 = Math.min(ww, len - d.w - .9); const a2 = d.pos > (e.from + e.to) / 2 ? e.from + .3 + w2 / 2 : e.to - .3 - w2 / 2; opening(e.axis, e.at, a2, 'window', { w: w2 }); } continue; } }
        opening(e.axis, e.at, sp, big ? 'window2' : 'window');
      }
    }
  }
  for (const r of rooms) run({ type: 'add-label', level: LVL, name: r.name, roomType: r.type, seed: T((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) });
  // سلاسل الأبعاد خارج المبنى: الواجهة الأمامية والجانب، ثم البعد الكلي (كما في المساقط المهنية)
  const dimLine = (a, b, outward, off) => {
    const pa = T(a.x, a.y), pb = T(b.x, b.y), po = T(a.x + outward.x, a.y + outward.y);
    const ux = pb.x - pa.x, uy = pb.y - pa.y, L = Math.hypot(ux, uy); if (L < .4) return;
    const n = { x: -uy / L, y: ux / L }, sgn = Math.sign((po.x - pa.x) * n.x + (po.y - pa.y) * n.y) || 1;
    try { run({ type: 'add-dimension', level: LVL, a: pa, b: pb, offset: sgn * off }); } catch { /* بعد غير صالح */ }
  };
  const chain = (vals, mk, outward) => { const v = [...new Set(vals.map(x => r2(x)))].sort((p, q) => p - q); for (let i = 0; i + 1 < v.length; i++) dimLine(mk(v[i]), mk(v[i + 1]), outward, 1.05); dimLine(mk(v[0]), mk(v[v.length - 1]), outward, 2.0); };
  chain(rooms.filter(r => r.y0 < EPS).flatMap(r => [r.x0, r.x1]), x => ({ x, y: 0 }), { x: 0, y: -1 });
  chain(rooms.filter(r => r.x1 > W - 1e-3).flatMap(r => [r.y0, r.y1]), y => ({ x: W, y }), { x: 1, y: 0 });
  furnish(rooms, T, run, doorAt, W, D, LVL);
  // أشجار الحديقة الداخلية
  if (court && layout.courtOpen) { const cw = court.x1 - court.x0, cd = court.y1 - court.y0; for (const [fx, fy] of cd >= 7 ? [[.5, .3], [.5, .72]] : [[.5, .5]]) { const p = T(court.x0 + cw * fx, court.y0 + cd * fy); try { run({ type: 'add-fixture', level: LVL, kind: 'tree', x: p.x, y: p.y, rot: 0 }); } catch { /* شجرة اختيارية */ } } }
  doc = fixWindowJunctions(doc); // حارس أخير: لا يغيّر شيئًا متى وُضعت النوافذ سليمة
  return doc;

  function setSwing(id, pIn) {
    // اجعل الباب يفتح نحو الغرفة: يقارن جهة الفتح الحالية بنقطة داخل الغرفة
    const o = doc.openings.find(x => x.id === id), w = doc.walls.find(x => x.id === o.wall);
    const ux = w.b.x - w.a.x, uy = w.b.y - w.a.y, n = { x: -uy, y: ux };
    const mid = { x: w.a.x + ux * o.at / Math.hypot(ux, uy), y: w.a.y + uy * o.at / Math.hypot(ux, uy) };
    const s = (pIn.x - mid.x) * n.x + (pIn.y - mid.y) * n.y;
    const want = s >= 0 ? 'in' : 'out';
    if (o.swing !== want) run({ type: 'flip-opening', id, what: 'swing' });
  }
}

// ------------------------------------------------------------------------------------------ الأثاث
function furnish(rooms, T, run, doorAt, W, D, LVL = LV) {
  // الظهر نحو الاتجاه القانوني (bx,by)؛ يُحوّل إلى زاوية في المستند
  const rotFor = (bx, by) => { const a = T(0, 0), b = T(bx, by); return Math.atan2(b.x - a.x, -(b.y - a.y)); };
  const F = (kind, x, y, bx, by, extra = {}) => { const p = T(x, y); try { run({ type: 'add-fixture', level: LVL, kind, x: p.x, y: p.y, rot: rotFor(bx, by), ...extra }); } catch { /* لم تتسع */ } };
  const dir = { x0: [-1, 0], x1: [1, 0], y0: [0, -1], y1: [0, 1] };
  const doorsOn = (r, s) => doorAt.filter(d => (d.room === r.id || d.other === r.id) && d.axis === (isX(s) ? 'x' : 'y') && Math.abs(d.at - r[s]) < 1e-3 && d.pos > (isX(s) ? r.y0 : r.x0) - 1e-3 && d.pos < (isX(s) ? r.y1 : r.x1) + 1e-3);
  const freeSides = r => ['x0', 'x1', 'y0', 'y1'].filter(s => !doorsOn(r, s).length);
  // نقطة على الجدار s بإزاحة inset داخل الغرفة، عند الموضع t على طوله
  const onWall = (r, s, inset, t) => (isX(s) ? { x: s === 'x0' ? r.x0 + inset : r.x1 - inset, y: t } : { x: t, y: s === 'y0' ? r.y0 + inset : r.y1 - inset });
  const mid = (r, s) => (isX(s) ? (r.y0 + r.y1) / 2 : (r.x0 + r.x1) / 2);
  const m = .1;
  for (const r of rooms) {
    const w = W_(r), h = H_(r);
    if (r.type === 'master' || r.type === 'bedroom') {
      if (w < 2.6 || h < 2.6) continue;
      // رأس السرير على جدار بلا باب، يفضّل المقابل للشريط (جدار الجار الصلب) ثم الخارجي
      const free = freeSides(r);
      const pref = [r.strip ? opp[r.strip] : null, opp[r.door], ...free].filter(s => s && free.includes(s));
      const s = pref[0]; if (!s) continue;
      const dbl = r.type === 'master' || sideLen(r, s) >= 3.2, bw = dbl ? 1.8 : 1.0, bd = dbl ? 2.1 : 2.0;
      if (sideLen(r, opp[s] === s ? s : s) < bw + .2 || (isX(s) ? w : h) < bd + .8) continue;
      const c = onWall(r, s, m + bd / 2, mid(r, s)), [bx, by] = dir[s];
      F(dbl ? 'bed-double' : 'bed-single', c.x, c.y, bx, by);
      for (const k of dbl ? [-1, 1] : [1]) { const t = mid(r, s) + k * (bw / 2 + .3); const n = onWall(r, s, m + .22, t); if (Math.abs(t - mid(r, s)) + .25 < sideLen(r, s) / 2) F('nightstand', n.x, n.y, bx, by); }
      if (!r.strip && (isX(s) ? h : w) >= 3) { const o2 = [isX(s) ? 'y1' : 'x1', isX(s) ? 'y0' : 'x0'].find(z => free.includes(z)); if (o2) { const c2 = onWall(r, o2, m + .3, mid(r, o2)); F('wardrobe', c2.x, c2.y, ...dir[o2], { w: Math.min(sideLen(r, o2) - .6, 2.2) }); } }
      continue;
    }
    if (r.type === 'majlis') {
      if (w < 3 || h < 3) continue;
      const free = freeSides(r), longS = w >= h ? ['y0', 'y1'] : ['x0', 'x1'];
      for (const s of longS) { const c = onWall(r, s, m + .4, mid(r, s)); F('majlis-sofa', c.x, c.y, ...dir[s], { w: Math.min(sideLen(r, s) - 1.2, 4.4) }); }
      const shortS = (w >= h ? ['x0', 'x1'] : ['y0', 'y1']).filter(s => free.includes(s));
      if (shortS.length) { const s = shortS[0], c = onWall(r, s, m + .4, mid(r, s)); F('majlis-sofa', c.x, c.y, ...dir[s], { w: Math.max(1.2, Math.min(sideLen(r, s) - 2.0, 3.2)) }); }
      F('rug', (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0, -1, { w: Math.max(1.4, Math.min(w - 2.2, 3.6)), d: Math.max(1.2, Math.min(h - 2.2, 2.6)) });
      F('coffee-table', (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0, -1);
      continue;
    }
    if (r.type === 'living' && !r.circ || r.id === 'hall') {
      // السلم داخل الصالة: الجلسة في الجزء الأمامي منها
      const zr = r.stairZone ? { ...r, y1: r.stairZone.y0 - .2 } : r, w = W_(zr), h = H_(zr);
      if (w < 3.2 || h < 3.2) continue;
      const cx = (zr.x0 + zr.x1) / 2, cy = (zr.y0 + zr.y1) / 2, along = w >= h;
      // جلسة في الوسط: كنبتان متقابلتان وطاولة وسجادة (تترك محور الحركة على الأطراف)
      if (along) { F('sofa-3', cx, cy - 1.15, 0, -1); F('sofa-3', cx, cy + 1.15, 0, 1); F('rug', cx, cy, 0, -1, { w: Math.min(w - 1.6, 3.4), d: 2.6 }); }
      else { F('sofa-3', cx - 1.15, cy, -1, 0); F('sofa-3', cx + 1.15, cy, 1, 0); F('rug', cx, cy, -1, 0, { w: Math.min(h - 1.6, 3.4), d: 2.6 }); }
      F('coffee-table', cx, cy, along ? 0 : -1, along ? -1 : 0);
      continue;
    }
    if (r.type === 'dining') {
      if (w < 2.6 || h < 2.6) continue;
      const along = w >= h, len = Math.min(Math.max(w, h) - 1.8, 3.0);
      F('dining-table', (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, along ? 0 : -1, along ? -1 : 0, { w: Math.max(1.4, len), d: 1.0 });
      continue;
    }
    if (r.type === 'kitchen') {
      if (w < 2.2 || h < 2.2) continue;
      const free = freeSides(r), ext = exteriorEdges(r, W, D).map(e => e.side).filter(s => free.includes(s));
      const s = ext[0] || free[0]; if (!s) continue;
      const L = sideLen(r, s), c = onWall(r, s, m + .3, mid(r, s));
      const runW = Math.min(L - 1.15, 4.2), shift = -(.45);
      const cr = isX(s) ? { x: c.x, y: c.y + shift } : { x: c.x + shift, y: c.y };
      F('kitchen-run', cr.x, cr.y, ...dir[s], { w: runW });
      const end = isX(s) ? { x: c.x, y: Math.max(cr.y + runW / 2 + .45, r.y1 - m - .4) } : { x: Math.max(cr.x + runW / 2 + .45, r.x1 - m - .4), y: c.y }; F('fridge', end.x, end.y, ...dir[s]);
      const o = free.find(z => z !== s && z !== opp[s]); if (o && sideLen(r, o) >= 2.4) { const c2 = onWall(r, o, m + .3, mid(r, o)); F('kitchen-run', c2.x, c2.y, ...dir[o], { w: Math.min(sideLen(r, o) - 1.4, 3) }); }
      continue;
    }
    if (r.type === 'bath') {
      if (w < 1 || h < 1) continue;
      // الأدوات على الجدار الطويل البعيد عن الباب؛ الدش في الطرف البعيد
      const doorSides = ['x0', 'x1', 'y0', 'y1'].filter(s => doorsOn(r, s).length);
      const longSides = (w >= h ? ['y0', 'y1'] : ['x0', 'x1']).filter(s => !doorSides.includes(s));
      const s = longSides[0] || ['x0', 'x1', 'y0', 'y1'].find(z => !doorSides.includes(z)); if (!s) continue;
      const L = sideLen(r, s), [lo, hi] = isX(s) ? [r.y0, r.y1] : [r.x0, r.x1];
      // الطرف البعيد عن الباب: يُحسب من موضع الباب الفعلي
      const dAll = ['x0', 'x1', 'y0', 'y1'].flatMap(z => doorsOn(r, z).map(d => ({ z, d })));
      let farEnd = r.far ? ((r.far === 'x1' || r.far === 'y1') ? 'hi' : 'lo') : 'hi';
      if (dAll.length) {
        const { z, d } = dAll[0];
        const along = isX(s) === isX(z) ? null : d.pos; // باب على جدار عمودي على جدار الأدوات: موضعه على محور الأدوات
        if (along !== null) farEnd = along - lo < hi - along ? 'hi' : 'lo';
        else farEnd = (z === 'x1' || z === 'y1') ? 'lo' : 'hi';
      }
      const at = (k) => (farEnd === 'hi' ? lo + k : hi - k);
      const pw = onWall(r, s, m + .32, at(.45)); F('wc', pw.x, pw.y, ...dir[s]);
      const pb = onWall(r, s, m + .25, at(1.15)); if (L >= 1.6) F('basin', pb.x, pb.y, ...dir[s]);
      if (L >= 2.3 && Math.min(w, h) >= 1.2) { const ps = onWall(r, s, .55, farEnd === 'hi' ? hi - .55 : lo + .55); F('shower', ps.x, ps.y, ...dir[s], { w: .9, d: .9 }); }
      continue;
    }
    if (r.kind === 'dress') {
      const free = freeSides(r), s = (w >= h ? ['y0', 'y1'] : ['x0', 'x1']).find(z => free.includes(z)); if (!s) continue;
      const c = onWall(r, s, m + .3, mid(r, s)); F('wardrobe', c.x, c.y, ...dir[s], { w: Math.min(sideLen(r, s) - .3, 2.8) });
      continue;
    }
  }
}

// ------------------------------------------------------------------------------------------ الواجهة العامة
/**
 * يولّد بدائل مخطط فيلا لدور واحد. land: { length, width, streets, entries }، counts كما في buildProgram.
 * يعيد { designs:[{doc, penalty, key, notes, summary, mode}], program, W, D } أو يرمي خطأ بالسبب.
 */
export function generateVillaDesigns({ land, counts, requirements = {}, keep = 4, title = 'تصميم أولي من شرعاء', exclude = [], prefer = null, shown = [], blend = null }) {
  // shown: بصمات بصرية لما عُرض على العميل؛ لا يُعاد ما يشبهها مرئيًا فوق الحد (VISUAL_LIMIT)
  let visLimit = shown.length ? VISUAL_LIMIT.strict : 1, visSkips = 0;
  const tw = requirements.tweaks || {};
  // ذوق العميل: أنماط تنظيم تُقدَّم في الترتيب دون فرضها (ما لا يتسع منها أو يتعيّب لا يُعرض)
  const preferModes = (Array.isArray(tw.preferModes) ? tw.preferModes : []).filter(m => ['center', 'tee', 'court', 'L', 'rows', 'side'].includes(m));
  const prefPat = patCore(prefer?.pat ?? prefer) || null, prefMirror = prefer?.mirror ?? null;
  const shownIdeas = ideaCounts(exclude);
  const program = buildProgram(counts, requirements);
  const plot = validatePlot({ width: Number(land.width), length: Number(land.length), floors: 1, streets: Object.fromEntries((land.streets || []).map(s => [s, true])), entry: land.entries?.[0] || land.entry });
  const fp = footprint(plot), entry = plot.entry; program.entry = entry;
  const W = ['s', 'n'].includes(entry) ? fp.w : fp.h, D = ['s', 'n'].includes(entry) ? fp.h : fp.w;
  const need = program.blocks.reduce((a, b) => a + b.area, 0) + DESIGN_TARGETS.foyer + DESIGN_TARGETS.hall * .6;
  // الغلاف: يُقاس على البرنامج لا على الأرض؛ ما يزيد يبقى ساحات (أمامية/خلفية)
  const target = (program.blocks.reduce((a, b) => a + b.area, 0) + DESIGN_TARGETS.foyer + (program.hall ? program.hallArea : 14)) * 1.18 * (tw.envScale || 1);
  const envelopes = [];
  const addEnv = (w, d, only = null) => {
    w = snap(Math.min(W, w)); d = snap(Math.min(D, d));
    if (w < 8.5 || d < 9) return;
    if (envelopes.some(e => Math.abs(e.w - w) < .6 && Math.abs(e.d - d) < .6)) return;
    envelopes.push({ w, d, ox: snap((W - w) / 2), ...(only ? { only } : {}) });
  };
  for (const rho of [.75, 1, 1.25, 1.55, 1.9]) {
    let w = Math.sqrt(target / rho), d = rho * w;
    if (w > W) { w = W; d = target / w; }
    if (d > D) { d = D; w = target / d; }
    addEnv(w, d); addEnv(w, d * 1.15);
  }
  addEnv(W, target / W); addEnv(W, target / W * 1.2);
  // أغلفة أوسع لنمط الفناء (الحديقة تأخذ من المسطح): تُقاس بالمساحة الفعلية بعد خصم الحديقة
  for (const rho of [1.1, 1.4, 1.75]) { let w = Math.sqrt(target * 1.35 / rho), d = rho * w; if (w > W) { w = W; d = target * 1.35 / w; } if (d > D) { d = D; w = target * 1.35 / d; } addEnv(w, d); }
  addEnv(W, target * 1.35 / W); addEnv(W, target * 1.55 / W); addEnv(W, target * 1.8 / W);
  for (const rho of [2.0, 2.4]) { let w = Math.sqrt(target * 1.45 / rho), d = rho * w; if (w > W) { w = W; d = target * 1.45 / w; } if (d > D) { d = D; w = target * 1.45 / d; } addEnv(w, d); }
  // أغلفة بعرض ثابت لا يتبع عرض الأرض: الأرض العريضة كانت تعطي للفناء غلافًا عريضًا ضحلًا لا يتسع له، فلا يظهر إلا على أرض بعرض معيّن
  for (const wc of COURT_WIDTHS) if (wc <= W - .6) { addEnv(wc, target * 1.35 / wc, ['court']); addEnv(wc, target * 1.6 / wc, ['court']); }
  let cands = [];
  const wrapCand = (env, c) => ({ ...c, env, ...(env.only ? { extra: true } : {}), pen: c.pen + 6 * Math.max(0, (env.w * env.d - (c.court ? A_(c.court) : 0)) / target - 1.25) * 10 - (prefPat && c.pat === prefPat ? 60 : 0) - (preferModes.includes(c.mode) ? PREFER_MODE_BONUS : 0) });
  // prefer: نمط التصميم المعروض؛ تعديل العميل يُطبَّق عليه نفسه متى أمكن بدل توزيع جديد كليًا
  const __t0 = Date.now();
  for (const env of envelopes) for (const c of searchLayouts(program, env.w, env.d, { keep: keep * 3, perMode: 2, only: env.only || null })) cands.push(wrapCand(env, c));
  // فكرة «الجلسة الخارجية المحفورة في الكتلة» (دور واحد): ركن خارجي في طرف أحد الجناحين تفتح عليه الصالة بباب زجاجي منزلق
  // وتطل عليه الغرف المجاورة، فتنكسر الكتلة الصندوقية. فراغ خارجي لم يطلبه العميل ولا يُحسب من المسطح المبني؛ يُعلن في الملاحظات.
  if (!blend && !program.prefs?.shape && program.prefs?.courtyard !== true) {
    const pb = { id: 'patio', kind: 'terrace', open: true, rank: 9, area: OPEN_CAPS.patio.area, name: 'جلسة خارجية', note: '«جلسة خارجية» محفورة في الكتلة (لم تطلبها): ركن خارجي تفتح عليه الصالة بباب منزلق زجاجي وتطل عليه الغرف المجاورة؛ لا تُحسب من المسطح المبني، ويمكن حذفها أو تسقيفها في المرسم.' };
    const progP = { ...program, blocks: [...program.blocks, pb] }, tP = target + pb.area * 1.1, envP = [];
    const addP = (w, d) => { w = snap(Math.min(W, w)); d = snap(Math.min(D, d)); if (w < 8.5 || d < 9) return; if (envP.some(e => Math.abs(e.w - w) < .6 && Math.abs(e.d - d) < .6)) return; envP.push({ w, d, ox: snap((W - w) / 2), only: ['center', 'tee'] }); };
    for (const [rho, k] of [[1, 1], [1.4, 1], [1.2, 1.07]]) { let w = Math.sqrt(tP * k / rho), d = rho * w; if (w > W) { w = W; d = tP * k / w; } if (d > D) { d = D; w = tP * k / d; } addP(w, d); }
    // البحث يتضاعف مع كل كتلة: يُكتفى بثلاثة أغلفة، وبالبرامج التي لا تتجاوز 10 كتل
    if (program.blocks.length <= 10) for (const env of envP) for (const c of searchLayouts(progP, env.w, env.d, { keep: 3, perMode: 1, only: env.only })) cands.push(wrapCand(env, c));
  }
  if (globalThis.__villaDebug) globalThis.__villaDebug.searchMs = Date.now() - __t0;
  const wantMode = program.prefs?.shape ? wantedShape(program) : null;
  const askedMode = wantMode || (program.prefs?.courtyard === true ? 'court' : null);
  // شكل L لم يتسع بالمقاسات الأولى على أي مسطح: نجرّب مقاسات الأرض الضيقة، وتُضاف منها كتل L فقط
  // (تُضاف دائمًا عند طلب L: ترتيبات المقاسات الأولى قد تظهر ولا تُبنى سليمة، فلا تحجب مقاسات الأرض الضيقة)
  if (wantMode === 'L') for (const env of envelopes) for (const c of searchLayouts(program, env.w, env.d, { keep: keep * 3, relaxL: true, only: 'L' })) cands.push(wrapCand(env, c));
  // الشكل الذي طلبه العميل: كل مرشحاته أصلية (لا تُؤجَّل إلى مرحلة التكميل)
  if (wantMode) for (const c of cands) if (c.mode === wantMode) delete c.extra;
  cands.sort((a, b) => a.pen - b.pen);
  const seenSig = new Set(), ex = new Set(exclude.map(patCore)), avoid = new Set([...(tw.avoidModes || []), ...(program.prefs?.noCorridors && !program.prefs?.courtyard ? ['tee', 'rows', 'court'] : []), ...(program.prefs?.courtyard === false ? ['court'] : [])]);
  // الشكل الذي طلبه العميل: تنويعاته مطلوبة فلا يُحدّ عددها بحدّ الفكرة
  for (const c of cands) c.idea = ideaKey(c);
  cands = cands.filter(c => { if (seenSig.has(c.sig) || ex.has(c.pat) || avoid.has(c.mode) || (!prefPat && !blend && c.mode !== askedMode && (shownIdeas.get(c.idea) || 0) >= IDEA_CAP)) return false; seenSig.add(c.sig); return true; });
  // كل ما بقي سبق عرضه (أو بلغت أفكاره حدّها): نفاد لا «الأرض لا تتسع»
  if (!cands.length && exclude.length) { const err = Error(`عرضت عليك ${exclude.length} ${exclude.length > 2 ? 'تصاميم' : 'تصميمين'} ولم يبقَ لهذا البرنامج وهذه الأرض فكرة تنظيم سليمة لم تُعرض؛ لن أكرر الفكرة نفسها بأسماء مختلفة. غيّر طلبًا (شكلًا مثل L أو U، أو عددًا، أو مقاسًا) أو اطلب دمج تصميمين.`); err.code = 'VILLA_EXHAUSTED'; throw err; }
  if (!cands.length) {
    const err = Error(`لم أجد توزيعًا مهنيًا لهذا البرنامج داخل المساحة القابلة للبناء (${r2(W)} × ${r2(D)} م = ${Math.round(W * D)} م²)؛ البرنامج بالمقاسات التصميمية المستهدفة يحتاج نحو ${Math.round(need)} م².`);
    err.code = 'VILLA_NO_FIT'; err.need = need; err.available = W * D; throw err;
  }
  const hasRules = program.rules.length > 0;
  // بناء البدائل من قائمة مرشحة؛ يعيد ما نجح منها
  const build = list0 => {
    const designs = [];
    // المرحلة الأولى بالترتيب كما كان؛ الثانية تكمّل الأنماط الغائبة (عدا الدمج والتعديل على نمط معروض)
    const plan = buildPlan(list0, { modeOf: c => c.idea, topUp: !blend && !prefPat, prefer: preferModes });
    const stop1 = () => designs.length >= (blend ? 36 : keep * 3) + (hasRules ? 4 : 0) || (hasRules && designs.filter(d => !d.fails && !d.softFails).length >= keep * 2);
    for (let cand; (cand = plan.next(designs, stop1));) {
      try {
        // المرآة: تحددها جهات العميل الجانبية (شرق/غرب) إن وُجدت، وإلا تنويع الاتجاه بين البدائل
        const mirror = cand.rp && cand.rp.p[0] !== cand.rp.p[1] ? cand.rp.p[1] < cand.rp.p[0] : prefPat && cand.pat === prefPat && prefMirror !== null ? prefMirror : designs.length % 2 === 1;
        const layout = realizeLayout(cand, program, cand.env.w, cand.env.d, { secondEntry: canonicalSide(entry, land?.entries?.[1], mirror) });
        const doc = layoutToDoc(layout, { land, plot, fp, entry, mirror, title, ox: cand.env.ox, Wfull: W });
        const built = cand.env.w * cand.env.d;
        layout.notes.push(`مسطح الدور ${Math.round(built - (cand.court ? A_(cand.court) : 0))} م²${cand.court ? ` مع حديقة داخلية ${Math.round(A_(cand.court))} م²` : ''} (${r2(cand.env.w)} × ${r2(cand.env.d)} م) من مساحة قابلة للبناء ${Math.round(W * D)} م²؛ الباقي ساحات.`);
        const check = checkDoc(doc);
        if (!check.ok) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: cand.pat, why: check.problems }); continue; }
        const relaxed = relaxFixtures(doc);
        const q = quality(relaxed, { bedrooms: program.counts.bedrooms });
        if (q.reject) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: cand.pat, why: q.issues, doc: relaxed }); continue; }
        const vsig = visualSig(relaxed), vis = shown.length ? Math.max(...shown.map(x => visualSim(vsig, x))) : 0;
        if (vis > visLimit) { visSkips++; continue; }
        // فكرة سبق عرضها: لا تعود إلا مختلفة مرئيًا بوضوح، وتُعلن تنويعًا
        const again = !prefPat && !blend && cand.mode !== askedMode && (shownIdeas.get(cand.idea) || 0) > 0; if (again && vis > IDEA_VARIANT_VIS) { visSkips++; continue; }
        const bl = blendScore(vsig, blend); if (bl === null) continue;
        const ledger = verifyRequest(relaxed, requirements, { entry });
        // مجلس الرجال بلا دورة مياه خاصة: عيب ضيافة يُؤخّر البديل خلف كل بديل سليم
        const wcMissing = layout.notes.some(n => /دورة مياه (?:الضيوف|الرجال) لم تتسع/.test(n)) ? 1 : 0;
        designs.push({ maxBed: maxBedOf(q.metrics), area: cand.env.w * cand.env.d - (cand.court ? A_(cand.court) : 0), doc: relaxed, vsig, visual: r2(vis), blend: bl, penalty: r2(cand.pen), quality: r2(cand.pen + q.cost + SOFT_FAIL_COST * splitFails(ledger, requirements).soft), same: !!prefPat && cand.pat === prefPat, mirror, issues: q.issues, mode: cand.mode, idea: cand.idea, env: cand.env, pat: withIdea(cand.pat, cand.idea), notes: [ideaNote(cand.idea), ...(again ? ['تنويع على فكرة سبق عرضها: التنظيم نفسه بتوزيع مختلف للغرف (لم يبقَ لهذا البرنامج والأرض فكرة تنظيم لم تُعرض).'] : []), ...program.notes, ...layout.notes, ...hallNotes(q.metrics, W, D)].filter(Boolean), summary: describe(cand) + ideaSuffix(cand.idea), rooms: layout.rooms, ledger, fails: splitFails(ledger, requirements).hard, softFails: splitFails(ledger, requirements).soft, newestFail: Math.max(0, ...ledger.filter(x => !x.ok && /^R\d+$/.test(x.id)).map(x => +x.id.slice(1))) + wcMissing, newestFail: Math.max(0, ...ledger.filter(x => !x.ok && /^R\d+$/.test(x.id)).map(x => +x.id.slice(1))) });
      } catch (e) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: cand.pat, why: e.message }); }
    }
  return designs;
  };
  // شكل طلبه العميل صراحةً (L أو T): تُبنى بدائله أولًا؛ إن لم يُبنِ أي منها تُعرض البدائل الأخرى مع إعلان ذلك
  let shapeFallback = false, diff = null, designs = [];
  let shapeExhausted = false, visRelaxed = false;
  const runAll = () => {
    let ds = []; shapeFallback = false; shapeExhausted = false;
    if (wantMode) { const before = visSkips; ds = build((diff = differentFrom(cands.filter(c => c.mode === wantMode), exclude)).list); if (!ds.length && visSkips > before) shapeExhausted = true; }
    if (!ds.length) { if (wantMode) shapeFallback = true; ds = build((diff = differentFrom(cands, exclude)).list); }
    return ds;
  };
  designs = runAll();
  // لم يبقَ ما يختلف ≥ 40٪ عمّا عُرض: يُقبل ما يختلف ≥ 25٪ مع إعلانه، ولا يُعرض ما فوق ذلك
  if (!designs.length && shown.length) { visLimit = VISUAL_LIMIT.relaxed; visRelaxed = true; designs = runAll(); }
  if (!designs.length && shown.length) { const err = Error(`عرضت عليك ${shown.length} ${shown.length > 2 ? 'تصاميم' : 'تصميمين'} ولم يبقَ لهذا البرنامج وهذه الأرض توزيع سليم يختلف عنها بوضوح؛ لن أكرر تصميمًا سبق. غيّر طلبًا (شكلًا مثل L أو U، أو عددًا، أو مقاسًا) أو اطلب دمج تصميمين.`); err.code = 'VILLA_EXHAUSTED'; throw err; }
  if (!designs.length) { const err = Error(exclude.length ? 'لم يبقَ توزيع مختلف عمّا عُرض عليك لهذا البرنامج والأرض؛ غيّر طلبًا (مقاسًا أو عددًا) لأجد توزيعًا جديدًا.' : 'تعذّر بناء أي بديل سليم من التوزيعات المرشحة.'); err.code = exclude.length ? 'VILLA_EXHAUSTED' : 'VILLA_BUILD_FAILED'; throw err; }
  if (!designs.length && blend) { const err = Error('لم أجد توزيعًا سليمًا يجمع بين التصميمين دون أن يكون نسخة من أحدهما؛ جرّب تصميمين آخرين.'); err.code = 'VILLA_NO_BLEND'; throw err; }
  // تنفيذ طلب العميل أولًا، ثم (عند الدمج) الأكثر جمعًا للتصميمين، ثم الجودة
  // عند التساوي في عدد البنود غير المنفّذة: يُقدَّم ما يحفظ أحدث طلبات العميل (يتعارض طلبان فيُضحّى بالأقدم لا بما طلبه الآن)
  designs.sort((a, b) => a.fails - b.fails || (a.newestFail || 0) - (b.newestFail || 0) || (blend ? b.blend - a.blend : 0) || a.quality - b.quality);
  if (globalThis.__villaDebug) globalThis.__villaDebug.built = designs.map(d => ({ mode: d.mode, quality: d.quality, penalty: d.penalty, env: d.env, bad: (d.ledger || []).filter(x => !x.ok).map(x => x.id + ":" + (x.text || x.label || "").slice(0, 40)), fails: d.fails, pat: d.pat, issues: d.issues }));
  const picked = blend ? designs.slice(0, keep) : diversify(designs, keep, { prefer: preferModes });
  if (visRelaxed) picked[0]?.notes.push('لم يبقَ توزيع يختلف عمّا عُرض بأكثر من 40٪؛ هذا أكثر التوزيعات الباقية اختلافًا (يختلف بـ ' + Math.round((1 - (picked[0]?.visual || 0)) * 100) + '٪ على الأقل).');
  if (shapeFallback && shapeExhausted) picked[0]?.notes.push(`عُرضت عليك كل توزيعات «${MODE_AR[wantMode] || wantMode}» المختلفة لهذه الأرض؛ هذا بديل بنمط آخر.`);
  else if (shapeFallback) picked[0]?.notes.push(wantMode === 'L' ? lShapeNote(program, W, D, plot, entry) : `تعذّر توزيع «${MODE_AR[wantMode] || wantMode}» على هذه الأرض وهذا البرنامج؛ هذه أقرب البدائل الأخرى.`);
  if (diff.relaxed) picked[0]?.notes.push('لم يبقَ نمط توزيع مختلف جذريًا لهذا البرنامج والأرض؛ هذا أقرب توزيع غير مطابق لما عُرض.');
  for (const d of picked) d.doc = settleDoors(d.doc);
  applyElevators(picked, requirements);
  applyGardens(picked, requirements);
  return { designs: picked, program, W: r2(W), D: r2(D), engine: VILLA_ENGINE_VERSION };
}
/**
 * ترتيب البناء بالتناوب بين الأنماط (الأفضل من كل نمط أولًا، مع بقاء ترتيب الكلفة داخل النمط): حتى لا تمتلئ حصة البناء
 * بتنويعات نمط واحد متقاربة مرئيًا فيبقى للعميل بديل واحد. الأفضل كلفةً يبقى الأول، والترتيب النهائي بالجودة كما هو.
 */
function interleaveModes(list) {
  const by = new Map(); for (const c of list) { if (!by.has(c.mode)) by.set(c.mode, []); by.get(c.mode).push(c); }
  if (by.size < 2) return list;
  const qs = [...by.values()], out = [];
  for (let i = 0; out.length < list.length; i++) for (const q of qs) if (i < q.length) out.push(q[i]);
  return out;
}
/** أصغر مسطح قابل للبناء يتسع له الشكل L بالبرنامج (بخطوة 0.5 م، بدءًا من المسطح الحالي): أولًا أقل عمق، ثم أقل عرض عنده. */
function lShapeMinimum(program, W, D) {
  for (let dd = 0; dd <= 6 + 1e-9; dd += .5) for (let dw = 0; dw <= 3 + 1e-9; dw += .5) {
    const w2 = r2(W + dw), d2 = r2(D + dd);
    // لا يكفي أن يوجد ترتيب L: يجب أن يُبنى سليمًا (فحص المستند وحدود الجودة) حتى لا تذكر الملاحظة حدًّا لا يتحقق
    const cs = searchLayouts(program, w2, d2, { keep: 3, relaxL: true, only: 'L' });
    if (cs.some(c => quickBuildOk(c, program, w2, d2))) return { w: w2, d: d2 };
  }
  return null;
}
/** بناء سريع لترتيب على مسطح w×d بلا ارتدادات: هل يجتاز فحص المستند وحدود الجودة؟ */
function quickBuildOk(cand, program, w, d) {
  try {
    const layout = realizeLayout(cand, program, w, d);
    const fp = { x: 0, y: 0, w, h: d, sb: { n: 0, s: 0, e: 0, w: 0 } };
    const doc = layoutToDoc(layout, { land: null, plot: { width: w, length: d }, fp, entry: 's' });
    if (!checkDoc(doc).ok) return false;
    return !quality(relaxFixtures(doc), { bedrooms: program.counts?.bedrooms }).reject;
  } catch { return false; }
}
/** ملاحظة الفشل لشكل L: تذكر مقاسات الأرض والحد الأدنى المحسوب للشكل بالأرقام. */
function lShapeNote(program, W, D, plot, entry) {
  const head = `تعذّر توزيع «${MODE_AR.L}» على هذه الأرض (${r2(plot.width)} × ${r2(plot.length)} م، مسطحها القابل للبناء ${r2(W)} × ${r2(D)} م) ولهذا البرنامج؛ هذه أقرب البدائل الأخرى.`;
  const m = lShapeMinimum(program, W, D);
  if (!m) return head + ` الشكل L لا يتسع بهذا البرنامج حتى ${r2(W + 3)} × ${r2(D + 6)} م من المسطح القابل للبناء.`;
  // الأرض = المسطح + الارتدادات (ثابتة لهذا المدخل): عرض الأرض على محور المدخل
  const sn = ['s', 'n'].includes(entry);
  const landW = sn ? m.w + (plot.width - W) : m.d + (plot.width - D);
  const landL = sn ? m.d + (plot.length - D) : m.w + (plot.length - W);
  return head + ` الشكل L يحتاج مسطحًا قابلًا للبناء ${m.w} × ${m.d} م على الأقل، أي أرضًا لا تقل عن ${r2(landW)} × ${r2(landL)} م بالارتدادات الحالية.`;
}
/**
 * دوران: الأرضي للضيافة والخدمة (مجالس، طعام، مطبخ، خادمة، مكتب، غرفة كبار السن) والسلم في نهاية الصالة؛
 * العلوي لأجنحة النوم حول صالة علوية، والسلم في الموضع ذاته. الغلاف واحد للدورين (العلوي فوق الأرضي تمامًا).
 */
export function generateVillaTwoFloors({ land, counts, requirements = {}, keep = 3, title = 'تصميم أولي من شرعاء', exclude = [], prefer = null, shown = [], blend = null }) {
  const tw = requirements.tweaks || {}, exSet = new Set(exclude.map(patCore)), prefPat = patCore(prefer?.pat ?? prefer) || null, prefMirror = prefer?.mirror ?? null;
  // ما رآه العميل: عدد مرات كل فكرة، وتواقيع الأدوار الأرضية المعروضة (الأرضي نفسه بعلوي آخر ليس تصميمًا جديدًا)
  const shownIdeas = ideaCounts(exclude), exGround = new Set(exclude.map(groundPat));
  const preferModes = (Array.isArray(tw.preferModes) ? tw.preferModes : []).filter(m => ['center', 'tee', 'court', 'L', 'rows', 'side'].includes(m));
  const program = buildProgram(counts, requirements);
  const groundKinds = new Set(['majlis', 'dining', 'kitchen', 'maid', 'office', 'prayer', 'driver']);
  const isGround = b => groundKinds.has(b.kind) || b.guest;
  // الدور لكل فراغ: طلب العميل («الماستر في الأرضي»، «المكتب فوق») يتقدم على التوزيع الافتراضي
  const wantG = new Set(), wantU = new Set();
  for (const r of program.rules.filter(x => x.kind === 'floor')) for (const b of blocksFor(r.a, program.blocks)) (r.floor === 'ground' ? wantG : wantU).add(b);
  const upperOk = b => ['suite', 'family', 'office', 'prayer'].includes(b.kind);
  const gBlocks = program.blocks.filter(b => wantG.has(b) || ((isGround(b) || b.elderly) && !(wantU.has(b) && upperOk(b))));
  let uBlocks = program.blocks.filter(b => !gBlocks.includes(b));
  if (!uBlocks.some(b => b.kind === 'suite')) { const e = Error('لا توجد غرف نوم للدور العلوي؛ دور واحد يكفي هذا البرنامج.'); e.code = 'VILLA_NO_UPPER'; throw e; }
  if (!gBlocks.length) { const e = Error('لا توجد فراغات ضيافة أو خدمة للدور الأرضي.'); e.code = 'VILLA_NO_GROUND'; throw e; }
  let upperHallName = 'الصالة العلوية';
  const fam = uBlocks.find(b => b.kind === 'family'); if (fam) { uBlocks = uBlocks.filter(b => b !== fam); upperHallName = fam.name; }
  const gExtra = Math.min(1, program.extraBaths);
  const plot = validatePlot({ width: Number(land.width), length: Number(land.length), floors: 1, streets: Object.fromEntries((land.streets || []).map(x => [x, true])), entry: land.entries?.[0] || land.entry });
  const fp = footprint(plot), entry = plot.entry;
  const W = ['s', 'n'].includes(entry) ? fp.w : fp.h, D = ['s', 'n'].includes(entry) ? fp.h : fp.w;
  const STAIR = { len: 4.0 }, sum = l => l.reduce((a, b) => a + b.area, 0);
  const needG = l => sum(l) + DESIGN_TARGETS.foyer + program.hallArea + 15, needU = l => sum(l) + 24 + 15;
  // توزيع الغرف على الدورين: الافتراضي (النوم كله فوق)، وفكرة «غرفة نوم أرضية»: حين يكون برنامج العلوي أكبر من الأرضي بوضوح
  // تُنقل غرفة نوم عادية (ليست الرئيسية ولا ما حدّد العميل دوره) إلى الأرضي، فيتوازن الدوران ويصغر المسطح ولا يبقى في الأرضي
  // فائض يُملأ بغرف لم تُطلب. بديل يُعلن للعميل (لم يطلبه)، ولا يتصدّر البدائل.
  const splits = [{ id: 'std', g: gBlocks, u: uBlocks }];
  const movable = uBlocks.filter(b => b.kind === 'suite' && !b.master && !wantU.has(b) && !wantG.has(b));
  if (!blend && movable.length >= 2 && needU(uBlocks) - needG(gBlocks) >= BED_DOWN_MIN_GAP) { const b = movable[movable.length - 1]; splits.push({ id: 'bedDown', g: [...gBlocks, b], u: uBlocks.filter(x => x !== b), moved: b }); }
  const pairs = [], __t0 = Date.now(), dbgStats = [], wantTerrace = program.prefs?.terrace === true; // «ابي تراس»: أفكار التراس أصلية تتقدم
  for (const split of splits) {
  const gProg = { ...program, blocks: split.g, extraBaths: gExtra, twoFloor: true, entry };
  const uProg = { ...program, blocks: split.u, extraBaths: program.extraBaths - gExtra, upperHallName, hall: true, guestWc: 0, kitchenStrip: [], prefs: {}, hallArea: 24, upperLounge: true, entry };
  const target = Math.max(needG(split.g), needU(split.u)) * 1.15 * (tw.envScale || 1);
  const envs = [];
  const addEnv = (w, d, only = null) => { w = snap(Math.min(W, w)); d = snap(Math.min(D, d)); if (w < 8.5 || d < 10) return; if (envs.some(e => Math.abs(e.w - w) < .6 && Math.abs(e.d - d) < .6)) return; envs.push({ w, d, ox: snap((W - w) / 2), ...(only ? { only } : {}) }); };
  for (const rho of [.8, 1, 1.25, 1.55, 1.9]) { let w = Math.sqrt(target / rho), d = rho * w; if (w > W) { w = W; d = target / w; } if (d > D) { d = D; w = target / d; } addEnv(w, d); addEnv(w, d * 1.12); }
  if (split.id === 'std') {
  for (const rho of [1.1, 1.4, 1.75]) { let w = Math.sqrt(target * 1.35 / rho), d = rho * w; if (w > W) { w = W; d = target * 1.35 / w; } if (d > D) { d = D; w = target * 1.35 / d; } addEnv(w, d); }
  addEnv(W, target * 1.35 / W); addEnv(W, target * 1.55 / W); addEnv(W, target * 1.8 / W);
  for (const rho of [2.0, 2.4]) { let w = Math.sqrt(target * 1.45 / rho), d = rho * w; if (w > W) { w = W; d = target * 1.45 / w; } if (d > D) { d = D; w = target * 1.45 / d; } addEnv(w, d); }
  }
  // أغلفة بعرض ثابت لا يتبع عرض الأرض (للفناء ولصف الخدمة الخلفي): انظر generateVillaDesigns
  for (const wc of COURT_WIDTHS) if (wc <= W - .6) for (const k of split.id === 'std' ? [1.35, 1.6, 1.8] : [1.35]) addEnv(wc, target * k / wc, ['court', 'tee']);
  const wantG2 = wantedShape(gProg);
  for (const env of envs) for (const g of searchLayouts(gProg, env.w, env.d, { keep: shown.length ? 14 : 6, stair: STAIR, perMode: 2, only: env.only || null })) {
    if ((tw.avoidModes || []).includes(g.mode) || (g.mode === 'court' && program.prefs?.courtyard === false)) continue;
    const hall = g.circ.find(c => c.id === 'hall').r;
    const upPat = x => x.placed.map(p => p.block.kind[0] + ((p.r.x0 + p.r.x1) / 2 < env.w / 2 ? 'L' : 'R') + Math.round(p.r.y0 / 3)).sort().join('');
    const upOpt = { mode: g.mode, stairRect: g.stairRect, sideAt: g.sideAt, hub: { x0: hall.x0, x1: hall.x1 }, court: g.court || null, free: !!wantG2 && g.mode === wantG2 };
    const mk = (us, idea, bias = 0) => {
      const u = us[0]; if (!u) return;
      const pat = g.pat + '/' + upPat(u); if (exSet.has(pat) || (!prefPat && exGround.has(g.pat)) || (!prefPat && g.mode !== wantG2 && (shownIdeas.get(idea) || 0) >= IDEA_CAP)) return;
      const p0 = g.rp.p[0] + u.rp.p[0], p1 = g.rp.p[1] + u.rp.p[1]; const nf = c => c.placed.filter(x => x.block.filler).length, dbl = nf(g) && nf(u) ? ROOM_CAPS.doubleFiller * nf(u) : nf(g) && u.terrace ? ROOM_CAPS.doubleFiller * nf(g) : 0; // أرضي بفراغ فائض مع علوي بتراس = غلاف أوسع من حاجة الدورين: يتأخر خلف الغلاف الأصغر
      pairs.push({ g, u, us, upPat, env, gProg, uProg, split, idea, wantG2, ...(g.extra || env.only || (idea !== g.mode && !(wantTerrace && u.terrace && split.id === 'std')) ? { extra: true } : {}), pen: bias + dbl + g.raw + u.raw + g.rp.base + u.rp.base + Math.min(p0, p1) - (prefPat && pat === prefPat ? 60 : 0) - (preferModes.includes(g.mode) ? PREFER_MODE_BONUS : 0), mirrorPref: p0 !== p1 ? p1 < p0 : null, pat });
    };
    // أفضل ترتيب علوي أولًا؛ يليه بديلان يُجرَّبان فقط إن لم يُبنَ الأول سليمًا (غرفة بلا نافذة مثلًا) فلا يسقط الأرضي كله بسببه
    const bias0 = split.id === 'bedDown' ? BED_DOWN_COST : 0;
    mk(searchLayouts(uProg, env.w, env.d, { upper: upOpt, keep: UPPER_TRIES }), ideaKey(g, split.id), bias0);
    // فكرة التراس العلوي (أمامي على الواجهة، أو خلفي على الحوش): تُجرَّب حيث يفيض العلوي عن برنامجه
    if (!upOpt.free && program.prefs?.terrace !== false) for (const t of ['front', 'back']) mk(searchLayouts(uProg, env.w, env.d, { upper: { ...upOpt, terrace: t }, keep: UPPER_TRIES }), ideaKey(g, split.id, 'terrace-' + t), bias0 - (wantTerrace ? PREFER_MODE_BONUS : 0));
  }
  dbgStats.push({ split: split.id, envs: envs.length, target: Math.round(target) });
  }
  pairs.sort((a, b) => a.pen - b.pen);
  if (globalThis.__villaDebug) globalThis.__villaDebug.searchMs = Date.now() - __t0;
  if (globalThis.__villaDebug) { const st = {}; for (const p of pairs) st[p.idea] = (st[p.idea] || 0) + 1; globalThis.__villaDebug.stats = { splits: dbgStats, pairs: st }; }
  const diff2 = differentFrom(pairs, exclude), pairs2 = diff2.list;
  if (!pairs.length) { const e = Error(exclude.length ? 'لم يبقَ توزيع مختلف عمّا عُرض عليك؛ غيّر طلبًا (مقاسًا أو عددًا) لأجد توزيعًا جديدًا.' : `لم أجد توزيعًا مهنيًا لدورين داخل المساحة القابلة للبناء (${r2(W)} × ${r2(D)} م).`); e.code = exclude.length ? 'VILLA_EXHAUSTED' : 'VILLA_NO_FIT'; throw e; }
  let visLimit = shown.length ? VISUAL_LIMIT.strict : 1, visRelaxed = false;
  const buildPairs = () => {
  const designs = [];
  // المرحلة الأولى بالترتيب كما كان؛ الثانية تكمّل الأنماط الغائبة، وفيها فقط يُجرَّب العلوي الاحتياطي
  const plan = buildPlan(pairs2, { modeOf: x => x.idea, topUp: !blend && !prefPat, perMode: 2, total: 10, prefer: preferModes });
  const stop1 = () => designs.length >= (blend ? 24 : keep * 3) + (program.rules.length ? 3 : 0);
  for (let pr; (pr = plan.next(designs, stop1));) {
    for (const [ui, uCand] of pr.us.entries()) try {
      const uPat = ui ? pr.g.pat + '/' + pr.upPat(uCand) : pr.pat;
      if (ui && (exSet.has(uPat) || uPat === pr.pat)) continue;
      if (ui && plan.phase === 1) break; // العلوي الاحتياطي في مرحلة التكميل فقط
      const mirror = pr.mirrorPref ?? (prefPat && pr.pat === prefPat && prefMirror !== null ? prefMirror : designs.length % 2 === 1), { env } = pr;
      const { gProg, uProg } = pr;
      const gl = realizeLayout(pr.g, gProg, env.w, env.d, { secondEntry: canonicalSide(entry, land?.entries?.[1], mirror) });
      const ul = realizeLayout(uCand, uProg, env.w, env.d);
      let doc = layoutToDoc(gl, { land, plot, fp, entry, mirror, title, ox: env.ox, Wfull: W });
      const T = frame(fp, entry, mirror, env.w, env.ox, W);
      const r = applyCommand(doc, { type: 'add-level', name: 'الدور الأول' }); doc = r.doc; const L2 = r.ids[0];
      doc = drawLevel(doc, ul, { level: L2, T });
      doc = addStair(doc, pr.g.stairRect, T, LV);
      { const sr = pr.g.stairRect, c = T((sr.x0 + sr.x1) / 2, (sr.y0 + sr.y1) / 2); try { doc = applyCommand(doc, { type: 'add-text', level: L2, at: c, text: 'فتحة السلم', size: .35 }).doc; } catch { /* نص اختياري */ } }
      const check = checkDoc(doc); if (!check.ok) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: uPat, why: check.problems }); continue; }
      const relaxed = relaxFixtures(doc), q = quality(relaxed, { bedrooms: program.counts.bedrooms }); if (q.reject) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: uPat, why: q.issues, doc: relaxed }); continue; }
      const vsig = visualSig(relaxed), vis = shown.length ? Math.max(...shown.map(x => visualSim(vsig, x))) : 0;
      const dbg = globalThis.__villaDebug;
      if (vis > visLimit) { if (dbg) dbg.visSkip = (dbg.visSkip || 0) + 1; continue; }
      // فكرة سبق عرضها: لا تعود إلا مختلفة مرئيًا بوضوح، وتُعلن تنويعًا
      const again = !prefPat && !blend && pr.g.mode !== pr.wantG2 && (shownIdeas.get(pr.idea) || 0) > 0; if (again && vis > IDEA_VARIANT_VIS) { if (dbg) dbg.againSkip = (dbg.againSkip || 0) + 1; continue; }
      const bl = blendScore(vsig, blend); if (bl === null) continue;
      const notes = [...new Set([ideaNote(pr.idea), ...(again ? ['تنويع على فكرة سبق عرضها: التنظيم نفسه بتوزيع مختلف للغرف (لم يبقَ لهذا البرنامج والأرض فكرة تنظيم لم تُعرض).'] : []), ...(pr.split.moved ? [`«${pr.split.moved.name}» في الدور الأرضي (لم تطلب ذلك): برنامج الدور العلوي أكبر من الأرضي، فنقلُ غرفة إلى الأرضي يوازن الدورين ويغني عن فراغات لم تُطلب؛ إن أردت كل غرف النوم فوق فاختر بديلًا آخر.`] : []), ...program.notes, ...gl.notes, ...ul.notes, `مسطح كل دور ${Math.round(env.w * env.d - (pr.g.court ? A_(pr.g.court) : 0))} م²${pr.g.court ? ` مع حديقة داخلية ${Math.round(A_(pr.g.court))} م²` : ''} (${r2(env.w)} × ${r2(env.d)} م) من مساحة قابلة للبناء ${Math.round(W * D)} م²؛ الباقي ساحات.`, 'السلم في نهاية الصالة ويصل إلى الصالة العلوية في الموضع نفسه.'])];
      notes.push(...hallNotes(q.metrics, W, D));
      const ledger = verifyRequest(relaxed, requirements, { entry }), pen = pr.pen + (ui ? uCand.pen - pr.u.pen : 0);
      designs.push({ fill: [pr.g, uCand].map(c => c.placed.filter(x => x.block.filler).length), maxBed: maxBedOf(q.metrics), area: env.w * env.d - (pr.g.court ? A_(pr.g.court) : 0), doc: relaxed, vsig, visual: r2(vis), blend: bl, penalty: r2(pen), quality: r2(pen + q.cost + SOFT_FAIL_COST * splitFails(ledger, requirements).soft), same: !!prefPat && uPat === prefPat, mirror, issues: q.issues, mode: pr.g.mode, idea: pr.idea, env, notes: notes.filter(Boolean), pat: withIdea(uPat, pr.idea), summary: describe(pr.g) + ideaSuffix(pr.idea) + ' (دوران)', ledger, fails: splitFails(ledger, requirements).hard, softFails: splitFails(ledger, requirements).soft, newestFail: Math.max(0, ...ledger.filter(x => !x.ok && /^R\d+$/.test(x.id)).map(x => +x.id.slice(1))) });
      break;
    } catch (e) { if (globalThis.__villaDebug) (globalThis.__villaDebug.skips ||= []).push({ pat: pr.pat, why: e.message }); }
  }
  return designs;
  };
  let designs = buildPairs();
  if (!designs.length && shown.length) { visLimit = VISUAL_LIMIT.relaxed; visRelaxed = true; designs = buildPairs(); }
  if (!designs.length && shown.length) { const e = Error(`عرضت عليك ${shown.length} ${shown.length > 2 ? 'تصاميم' : 'تصميمين'} ولم يبقَ لهذا البرنامج وهذه الأرض توزيع سليم لدورين يختلف عنها بوضوح؛ لن أكرر تصميمًا سبق. غيّر طلبًا (شكلًا أو عددًا أو مقاسًا) أو اطلب دمج تصميمين.`); e.code = 'VILLA_EXHAUSTED'; throw e; }
  if (!designs.length && blend) { const e = Error('لم أجد توزيعًا سليمًا لدورين يجمع بين التصميمين دون أن يكون نسخة من أحدهما؛ جرّب تصميمين آخرين.'); e.code = 'VILLA_NO_BLEND'; throw e; }
  if (!designs.length) { const e = Error('تعذّر بناء أي بديل سليم لدورين.'); e.code = 'VILLA_BUILD_FAILED'; throw e; }
  // عند التساوي في عدد البنود غير المنفّذة: يُقدَّم ما يحفظ أحدث طلبات العميل (يتعارض طلبان فيُضحّى بالأقدم لا بما طلبه الآن)
  designs.sort((a, b) => a.fails - b.fails || (a.newestFail || 0) - (b.newestFail || 0) || (blend ? b.blend - a.blend : 0) || a.quality - b.quality);
  // «غرفة نوم أرضية» تغيّر ما يتوقعه العميل دون طلبه: لا تتصدّر متى وُجد بديل بتوزيع الدورين المعتاد ينفّذ الطلب مثلها
  // وكذلك التراس العلوي: البديل الأول هو التنظيم المعتاد بلا إضافات؛ الأفكار الأخرى بدائل بعده
  if (!blend && !prefPat) { const k = designs.findIndex(d => !(wantTerrace ? /bedDown/ : /bedDown|terrace/).test(String(d.idea))); if (k > 0 && designs[k].fails === designs[0].fails) designs.unshift(designs.splice(k, 1)[0]); }
  if (globalThis.__villaDebug) globalThis.__villaDebug.built = designs.map(d => ({ mode: d.mode, quality: d.quality, penalty: d.penalty, env: d.env, bad: (d.ledger || []).filter(x => !x.ok).map(x => x.id + ":" + (x.text || x.label || "").slice(0, 40)), fails: d.fails, pat: d.pat, issues: d.issues }));
  // فراغات لم يطلبها العميل في الدورين معًا = غلاف أوسع من حاجة الدورين: يُحجب متى وُجد للنمط نفسه بديل سليم بغلاف أصغر،
  // ولا يعود إلا لإكمال ثلاثة بدائل (ويُعلن في ملاحظاته)
  const dbl = d => d.fill && d.fill[0] > 0 && d.fill[1] > 0, leanModes = new Set(designs.filter(d => !dbl(d)).map(d => d.mode));
  const lean = blend || prefPat ? designs : designs.filter(d => !(dbl(d) && leanModes.has(d.mode)));
  const picked2 = blend ? designs.slice(0, keep) : diversify(lean, keep, { prefer: preferModes });
  if (!blend && lean.length < designs.length && picked2.length < Math.min(3, keep)) for (const d of diversify(designs, keep, { prefer: preferModes })) { if (picked2.length >= Math.min(3, keep)) break; if (!picked2.includes(d)) picked2.push(d); }
  if (visRelaxed) picked2[0]?.notes.push('لم يبقَ توزيع يختلف عمّا عُرض بأكثر من 40٪؛ هذا أكثر التوزيعات الباقية اختلافًا.');
  if (diff2.relaxed) picked2[0]?.notes.push('لم يبقَ نمط توزيع مختلف جذريًا لهذا البرنامج والأرض؛ هذا أقرب توزيع غير مطابق لما عُرض.');
  for (const d of picked2) d.doc = settleDoors(d.doc);
  applyElevators(picked2, requirements);
  applyGardens(picked2, requirements);
  return { designs: picked2, program, W: r2(W), D: r2(D), engine: VILLA_ENGINE_VERSION, floors: 2 };
}
/**
 * المصعد (requirements.prefs.elevator): بئر متراصّ في الصالة على الدورين بعد اختيار البدائل (فلا يؤثر في ترتيبها).
 * يُقبل الموضع إن سلم checkDoc ولم تزد ملاحظات المراجعة عمّا كانت عليه، عدا إرشادات عرض/مساحة الصالة (يأكلها البئر بطبيعته).
 */
const ELEV_TOLERATED = new Set(['MIN_WIDTH', 'MIN_AREA']);
function applyElevators(picked, requirements) {
  if (!requirements?.prefs?.elevator) return;
  const codes = doc => { const m = {}; for (const i of reviewDoc(doc)) if (!ELEV_TOLERATED.has(i.code)) m[i.code] = (m[i.code] || 0) + 1; return m; };
  for (const d of picked) {
    try {
      const base = codes(d.doc);
      const { doc, report } = planElevator(d.doc, { verify: c => { if (!checkDoc(c).ok) return false; const a = codes(c); return Object.keys(a).every(k => a[k] <= (base[k] || 0)); } });
      d.doc = doc; d.elevator = report;
      if (Array.isArray(d.ledger)) {
        d.ledger = [...d.ledger.filter(x => !/^E-/.test(x.id)), ...verifyRequest(doc, { prefs: { elevator: true } }, { entry: 's' }).filter(x => /^E-/.test(x.id))];
        d.fails = splitFails(d.ledger, requirements).hard;
      }
      if (Array.isArray(d.notes)) d.notes.push(...report.notes);
    } catch (e) { if (Array.isArray(d.notes)) d.notes.push('تعذّر تخطيط المصعد لهذا البديل: ' + e.message); }
  }
}
/** مسبح/شلال/عشب/أحواض بحسب requirements.prefs.outdoor؛ بعد اختيار البدائل فلا تؤثر في ترتيبها ولا في بصمتها. */
function applyGardens(picked, requirements) {
  const want = requirements?.prefs?.outdoor; if (!want) return;
  for (const d of picked) {
    try {
      const { doc, report } = planGarden(d.doc, want);
      d.doc = doc; d.garden = report;
      // السجل حُسب قبل رسم الحوش فبنود G-* فيه قديمة (تقول «لم يتسع» والمسبح مرسوم): أعد حسابها على المستند الجديد
      if (Array.isArray(d.ledger)) {
        d.ledger = [...d.ledger.filter(x => !/^G-/.test(x.id)), ...verifyRequest(doc, { prefs: { outdoor: want } }, { entry: 's' }).filter(x => /^G-/.test(x.id))];
        d.fails = splitFails(d.ledger, requirements).hard;
      }
      if (Array.isArray(d.notes)) d.notes.push(...report.notes);
    } catch (e) { if (Array.isArray(d.notes)) d.notes.push('تعذّر تخطيط الحديقة لهذا البديل: ' + e.message); }
  }
}
/** سلم U داخل غرفة السلم: يبدأ عند طرفها الأمامي ويصعد نحو الخلف. */
function addStair(doc, sr, T, level) {
  const wh = sr.x1 - sr.x0, w = Math.max(.9, Math.min(1.2, (wh - .1) / 2)), ac = sr.x0 + w / 2, y0 = sr.y0;
  const p = T(ac, y0), up = T(ac, y0 + 1), px = T(ac + 1, y0);
  const fx = up.x - p.x, fy = up.y - p.y, rot = Math.atan2(fx, fy), q = { x: Math.cos(rot), y: -Math.sin(rot) };
  const flip = (px.x - p.x) * q.x + (px.y - p.y) * q.y < 0;
  return applyCommand(doc, { type: 'add-stair', level, kind: 'U', x: p.x, y: p.y, rot, w, run: sr.y1 - sr.y0, flip }).doc;
}

/** جهة الأرض (n/s/e/w) في الإطار القانوني للمخطط (y0 = جهة المدخل). */
export function canonicalSide(entry, side, mirror = false) {
  if (!side || side === entry) return null;
  const M = { s: { n: 'y1', e: 'x1', w: 'x0' }, n: { s: 'y1', e: 'x0', w: 'x1' }, e: { w: 'y1', n: 'x1', s: 'x0' }, w: { e: 'y1', s: 'x1', n: 'x0' } };
  let c = M[entry]?.[side] || null;
  if (c && mirror && c[0] === 'x') c = c === 'x0' ? 'x1' : 'x0';
  return c;
}
const MODE_AR = { court: 'مبنى على شكل U حول حديقة داخلية في المنتصف', L: 'مبنى على شكل L: جناح أمامي بعرض المبنى وذراع خلفي على جانب، والزاوية الباقية ساحة', center: 'صالة مركزية بين جناحين', tee: 'صالة مركزية وممر خلفي لأجنحة النوم (شكل T)', rows: 'صف أمامي للضيافة وصف خلفي للعائلة بينهما ممر', side: 'صالة جانبية بطول المبنى' };
/** النمط الذي طلبه العميل صراحةً (U بالفناء، أو L، أو T)؛ null إن لم يطلب شكلًا. */
export function wantedShape(program) {
  if (program?.prefs?.courtyard) return 'court';
  if (program?.prefs?.shape === 'L') return 'L';
  if (program?.prefs?.shape === 'T') return 'tee';
  return null;
}
const ideaSuffix = idea => { const plus = String(idea || '').split('+').filter(x => IDEA_PLUS[x]).map(x => IDEA_PLUS[x][0]); return plus.length ? '، مع ' + plus.join(' و') : ''; };
function describe(c) { return c.serviceBack ? 'صالة مركزية بين جناحي الضيافة، وخلفها ممر خدمة وصف المطبخ والطعام على الحوش الخلفي' : MODE_AR[c.mode] || c.mode; }
/** رموز النمط: نوع الفراغ + الجهة + حزام العمق؛ منها تُقاس المسافة بين توزيعين. */
const patTokens = pat => (String(pat || '').split('|')[1] || '').match(/[a-z][LR]\d+/g) || [];
const patMode = pat => String(pat || '').split('|')[0];
// ------------------------------------------------------------------------------------------ الفكرة المعمارية للبديل
/**
 * «الفكرة المعمارية»: نمط التنظيم وما يميّز البديل فعلًا (صف خدمة خلفي، تراس علوي، غرفة نوم أرضية، جلسة خارجية محفورة).
 * تبديل مواضع الغرف داخل النمط نفسه ليس فكرة جديدة: العميل يراه «المخطط نفسه بأسماء مختلفة». لذلك لا تُعرض الفكرة الواحدة
 * أكثر من IDEA_CAP مرات في كل ما يراه العميل، والمرة الثانية تشترط اختلافًا مرئيًا واضحًا (≤ IDEA_VARIANT_VIS) وتُعلن «تنويعًا».
 * المفتاح يُلحق بتوقيع البديل (pat) بعد «|~» ليبقى في سجل الجلسة؛ التواقيع القديمة بلا مفتاح تُقرأ بنمطها.
 */
export const IDEA_CAP = 2, IDEA_VARIANT_VIS = .5, BED_DOWN_MIN_GAP = 14;
/** كلفة ترتيب لفكرة تغيّر ما يتوقعه العميل دون طلبه (غرفة نوم في الأرضي): تبقى بديلًا ولا تتصدّر. */
export const BED_DOWN_COST = 120;
const IDEA_AR = Object.freeze({
  center: ['الصالة قلب البيت', 'صالة مركزية تتوزع حولها الأجنحة مباشرة، فلا ممرات طويلة'],
  tee: ['جناح نوم خلفي هادئ', 'الضيافة والمعيشة في المقدمة، وغرف النوم صف خلفي على الحوش خلف ممر يعزلها عن الحركة'],
  service: ['صف خدمة خلفي', 'المطبخ والطعام صف خلفي على الحوش بممر خدمة، فتبقى الواجهة للضيافة والصالة'],
  court: ['بيت حول حديقة داخلية', 'مبنى على شكل U يلتف حول حديقة مفتوحة للسماء تطل عليها الصالة والغرف'],
  L: ['شكل L بساحة خارجية', 'جناح أمامي وذراع خلفي، والزاوية الباقية ساحة خارجية خاصة'],
  rows: ['صفّان: ضيافة أمامية وعائلة خلفية', 'صف أمامي للضيافة وصف خلفي للعائلة وبينهما ممر، للأراضي العريضة'],
  side: ['صالة جانبية بطول البيت', 'الصالة على جدار خارجي بطول المبنى والغرف جناح واحد، للأراضي الضيقة'],
});
const IDEA_PLUS = Object.freeze({
  bedDown: ['غرفة نوم أرضية', 'غرفة نوم في الدور الأرضي (تصلح لكبار السن أو الضيوف) فيتوازن الدوران ويصغر المسطح'],
  'terrace-front': ['تراس علوي على الواجهة', 'الدور العلوي أصغر من الأرضي: تراس مكشوف على الواجهة فتتدرج الكتلة'],
  'terrace-back': ['تراس علوي على الحوش', 'الدور العلوي أصغر من الأرضي: تراس مكشوف يطل على الحوش الخلفي'],
  patio: ['جلسة خارجية محفورة في الكتلة', 'ركن خارجي تفتح عليه الصالة بباب زجاجي منزلق وتطل عليه الغرف'],
});
/** مفتاح الفكرة من المرشح: split = توزيع الدورين ('bedDown')، variant = ما يميّز الكتلة ('terrace-front'، 'patio'). */
function ideaKey(c, split = 'std', variant = '') { return [split === 'bedDown' ? 'bedDown' : '', c.mode === 'tee' && c.serviceBack ? 'service' : c.mode, variant || (c.placed?.some(p => p.block.open) && !c.upper ? 'patio' : '')].filter(Boolean).join('+'); }
const IDEA_SEP = '|~';
const withIdea = (pat, idea) => (pat && idea ? pat + IDEA_SEP + idea : pat);
/** التوقيع بلا مفتاح الفكرة (للمقارنة مع تواقيع المرشحين). */
export const patCore = pat => { const p = String(pat || ''), i = p.indexOf(IDEA_SEP); return i < 0 ? p : p.slice(0, i); };
/** مفتاح فكرة بديل معروض من توقيعه؛ التواقيع القديمة: نمطها. */
export const patIdea = pat => { const p = String(pat || ''), i = p.indexOf(IDEA_SEP); return i < 0 ? patMode(p) : p.slice(i + IDEA_SEP.length); };
const groundPat = pat => patCore(pat).split('/')[0];
/** اسم الفكرة وشرحها للعميل. */
export function ideaText(idea) {
  const parts = String(idea || '').split('+'), base = parts.find(x => IDEA_AR[x]), plus = parts.filter(x => IDEA_PLUS[x]);
  const names = [...(base ? [IDEA_AR[base][0]] : []), ...plus.map(x => IDEA_PLUS[x][0])], why = [...(base ? [IDEA_AR[base][1]] : []), ...plus.map(x => IDEA_PLUS[x][1])];
  return { name: names.join(' + '), why: why.join('؛ ') };
}
const ideaNote = idea => { const t = ideaText(idea); return t.name ? `فكرة التصميم: «${t.name}» — ${t.why}.` : null; };
/** عدّاد الأفكار المعروضة من تواقيع ما رآه العميل. */
const ideaCounts = pats => { const m = new Map(); for (const p of pats || []) { const k = patIdea(p); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
/** نسبة الفراغات التي بقيت في مكانها (الجهة والعمق) بين توزيعين: 1 = الشيء نفسه. */
export function patOverlap(a, b) {
  const A = patTokens(a), B = [...patTokens(b)]; if (!A.length || !B.length) return a === b ? 1 : 0;
  let same = 0; for (const t of A) { const i = B.indexOf(t); if (i >= 0) { same++; B.splice(i, 1); } }
  return same / Math.max(A.length, B.length);
}
/**
 * البصمة البصرية للمخطط كما يراه العميل: نوع كل فراغ وخانته في شبكة 3×3 من غلاف دوره (أمام/وسط/خلف × يمين/وسط/يسار).
 * مستقلة عن توقيع المولّد، فتلتقط التشابه المرئي ولو اختلف التوقيع (غلاف مختلف قليلًا، أو ترتيب متقارب).
 */
export function visualSig(doc) {
  const out = [];
  for (const lv of doc.levels || []) {
    const W = (doc.walls || []).filter(w => w.level === lv.id && w.kind !== 'fence'); if (!W.length) continue;
    const xs = W.flatMap(w => [w.a.x, w.b.x]), ys = W.flatMap(w => [w.a.y, w.b.y]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (const l of (doc.labels || []).filter(l => l.level === lv.id && l.seed)) {
      const cx = Math.max(0, Math.min(2, Math.floor(3 * (l.seed.x - x0) / (x1 - x0 + 1e-9)))), cy = Math.max(0, Math.min(2, Math.floor(3 * (l.seed.y - y0) / (y1 - y0 + 1e-9))));
      out.push(`${lv.id}:${l.type}:${cx}${cy}`);
    }
  }
  return out;
}
const sigCount = (A, B0) => { const B = [...B0]; let n = 0; for (const t of A) { const i = B.indexOf(t); if (i >= 0) { n++; B.splice(i, 1); } } return n / Math.max(A.length, B0.length, 1); };
const sigMirror = sig => sig.map(t => t.replace(/:(\d)(\d)$/, (m, x, y) => ':' + (2 - Number(x)) + y));
/** التشابه المرئي بين مخططين (أو بصمتيهما) من 0 إلى 1؛ المخطط المقلوب يمينًا/يسارًا يُعدّ التصميم نفسه. */
export function visualSim(a, b) {
  const A = Array.isArray(a) ? a : visualSig(a), B = Array.isArray(b) ? b : visualSig(b);
  return Math.max(sigCount(A, B), sigCount(sigMirror(A), B));
}
/**
 * درجة الدمج بين تصميمين: يُفضَّل ما يأخذ من كليهما بتوازن (الأدنى بينهما أولًا)، ويُرفض ما هو نسخة من أحدهما (≥ 90٪).
 * بلا دمج: 0. مرفوض: null.
 */
export const BLEND_COPY = .9;
function blendScore(vsig, blend) {
  if (!blend) return 0;
  const a = visualSim(vsig, blend[0]), b = visualSim(vsig, blend[1]);
  if (Math.max(a, b) >= BLEND_COPY) return null;
  // ما أُخذ من كل تصميم وحده (لا المشترك بينهما): الدمج الحقيقي يأخذ من الاثنين
  const A = [...alignSig(blend[0], vsig)], B = [...alignSig(blend[1], vsig)], take = (l, t) => { const i = l.indexOf(t); if (i < 0) return false; l.splice(i, 1); return true; };
  let ua = 0, ub = 0; for (const t of vsig) { const ia = take(A, t), ib = take(B, t); if (ia && !ib) ua++; else if (ib && !ia) ub++; }
  const n = Math.max(1, vsig.length);
  return r2(2 * Math.min(ua, ub) / n + .5 * Math.min(a, b) + .15 * (a + b));
}
/** عناصر البصمة مع أسماء فراغاتها (لشرح ما أُخذ من كل تصميم عند الدمج). */
export function visualItems(doc) {
  const sig = visualSig(doc), labels = [];
  for (const lv of doc.levels || []) { if (!(doc.walls || []).some(w => w.level === lv.id && w.kind !== 'fence')) continue; for (const l of (doc.labels || []).filter(l => l.level === lv.id && l.seed)) labels.push(l); }
  return sig.map((tok, i) => ({ tok, name: labels[i]?.name || '', level: labels[i]?.level || '' }));
}
/** هل البصمة أقرب لصورتها المقلوبة؟ (لمطابقة العناصر عند الدمج) */
export function alignSig(sig, ref) { return sigCount(sigMirror(sig), ref) > sigCount(sig, ref) ? sigMirror(sig) : sig; }
/** حدود التشابه المرئي لـ«تصميم آخر»: المطلوب ≤ 60٪؛ عند نفاد ذلك ≤ 75٪ مع إعلانه؛ وما فوقه لا يُعرض أبدًا. */
export const VISUAL_LIMIT = Object.freeze({ strict: .6, relaxed: .75 });
/**
 * «تصميم آخر» يعني توزيعًا مختلفًا جذريًا لا تبديل غرفتين: يُفضَّل نمط لم يُعرض، ويُرفض ما يشابه المعروض بأكثر من 60٪.
 * إن لم يبقَ شيء بهذا الشرط يُرخَّى إلى استبعاد المطابق فقط (ويُقال ذلك في الملاحظات).
 */
function differentFrom(cands, shown, { get = c => c.pat, maxOverlap = .6 } = {}) {
  if (!shown.length) return { list: cands, relaxed: false };
  const modes = new Set(shown.map(patMode));
  const strict = cands.filter(c => shown.every(p => patOverlap(get(c), p) <= maxOverlap));
  // التخفيف يستبعد المطابق تمامًا لما عُرض (لا يعيده أبدًا)
  const list = strict.length ? strict : cands.filter(c => shown.every(p => patOverlap(get(c), p) < 1));
  for (const c of list) c.pen += modes.has(patMode(get(c))) ? 120 : 0;
  list.sort((a, b) => a.pen - b.pen);
  return { list, relaxed: !strict.length };
}
/** ترتيب البدائل بالتنويع: الأفضل أولًا، ثم ما يختلف عنه نمطًا أو توزيعًا، لا نسخًا متقاربة. */
/** عدد ترتيبات الدور العلوي التي تُجرَّب لكل أرضي (الأول هو الأفضل؛ الباقي احتياط إن لم يُبنَ سليمًا). */
const UPPER_TRIES = 2;
/** عروض أغلفة ثابتة تتسع للفناء الداخلي (محور ≥ 7.6 م وجناحان ≥ 3.6 م). */
const COURT_WIDTHS = Object.freeze([15.5, 17, 18.5]);
/** ما يُخصم من كلفة ترتيب مرشح نمطه من أنماط ذوق العميل (tweaks.preferModes): تقديم لا فرض. */
const PREFER_MODE_BONUS = 60;
/** أكبر غرفة نوم في المخطط (م²) من مقاييس planMetrics. */
const maxBedOf = m => Math.max(0, ...(m?.levels || []).flatMap(l => l.rooms).filter(r => r.type === 'bedroom' || r.type === 'master' || /نوم/.test(r.name || '')).map(r => r.area));
/** حدود قبول بديل من نمط آخر خارج نافذة الجودة: مسطحه نسبةً إلى الأفضل، وأكبر غرفة نوم فيه (م² أو نسبةً إلى الأفضل). */
export const OTHER_MODE_LIMITS = Object.freeze({ areaRatio: 1.7, bed: 32, bedRatio: 1.1 });
/** كلفة عيوب المخطط المبني نفسه (ملاحظات المراجعة والتناسب والأثاث) بلا كلفة مطابقة المساحات للغلاف. */
// عيوب المخطط المبني وحدها: بلا كلفة المطابقة وبلا كلفة العرف غير المتحقق (تلك تؤخّر الترتيب ولا تُعدّ عيبًا في الرسم)
const defectOf = d => (d.quality || 0) - (d.penalty || 0) - SOFT_FAIL_COST * (d.softFails || 0);
/** أقصى عدد من البدائل بالنمط التنظيمي نفسه متى وُجد نمط آخر صالح. */
export const MODE_CAP = 2;
/**
 * خطة بناء المرشحين على مرحلتين:
 * (1) بالترتيب (الأقل كلفة أولًا) كما كان، حتى يتحقق stop1 — فأفضل بديل وما كان يُبنى لا يتغير.
 * (2) تكميل التنوع: لكل نمط تنظيم لم يُثمر بعد بديلًا سليمًا (بأقل إخفاق لبنود الطلب) تُجرَّب أرخص مرشحاته
 *     — ومنها الإضافية (extra: أغلفة خُصّصت لنمط، وما زاد عن حصة كل غلاف) — بحد perMode محاولات للنمط وtotal للكل،
 *     وما تجاوزت كلفته ما يقبله الاختيار (limitOf) لا يُجرَّب أصلًا. بلا المرحلة الثانية يستهلك النمط الأرخص
 *     (الصالة المركزية) كل المحاولات فلا يُعرض غيره.
 * next(designs, stop1) يعيد المرشح التالي أو null. phase: 1 أو 2 (للمتصل).
 */
function buildPlan(list, { modeOf = c => c.mode, topUp = true, perMode = 2, total = 6, prefer = [] } = {}) {
  // بلا تكميل (دمج، أو تعديل على تصميم معروض قد يكون من أفكار التكميل): كل المرشحين في المرحلة الأولى
  const main = topUp ? list.filter(c => !c.extra) : list; let i = 0, used = 0; const tries = {}, done = new Set();
  return {
    phase: 1,
    next(designs, stop1) {
      if (this.phase === 1) { if (i < main.length && !stop1()) { done.add(main[i]); return main[i++]; } this.phase = 2; }
      if (!topUp || used >= total) return null;
      // لم تُثمر المرحلة الأولى شيئًا (كل تنظيماتها عُرضت): تُجرَّب أفكار التكميل بترتيب الكلفة
      if (!designs.length) { const c = list.find(x => !done.has(x)); if (!c) return null; done.add(c); used++; tries[modeOf(c)] = (tries[modeOf(c)] || 0) + 1; return c; }
      const minFails = Math.min(...designs.map(d => d.fails || 0)), goodOnes = designs.filter(d => (d.fails || 0) === minFails);
      const best = goodOnes.reduce((a, b) => (b.quality < a.quality ? b : a)), limit = best.penalty + Math.max(120, Math.abs(best.penalty) * 3);
      const good = m => goodOnes.filter(d => (d.idea || d.mode) === m).length, pats = new Set(goodOnes.map(d => patCore(d.pat)));
      const liked = m => prefer.some(x => String(m).split('+').includes(x));
      let pick = null;
      for (const c of list) {
        if (done.has(c) || pats.has(c.pat)) continue;
        const m = modeOf(c);
        if (good(m) || (tries[m] || 0) >= perMode) continue;
        if (c.pen > limit * (liked(m) ? 2 : 1)) continue;
        // المفضَّل عند العميل أولًا، ثم الأرخص (list مرتبة بالكلفة)
        if (!pick || (liked(m) && !liked(modeOf(pick)))) { pick = c; if (!prefer.length || liked(m)) break; }
      }
      if (!pick) return null;
      done.add(pick); used++; tries[modeOf(pick)] = (tries[modeOf(pick)] || 0) + 1;
      return pick;
    },
  };
}
/**
 * اختيار البدائل المعروضة: الأفضل أولًا، ثم ما يختلف عنه تنظيمًا.
 * - الصالح للعرض: بنود الطلب غير المنفّذة لا تزيد عن الأفضل، وجودته ضمن نافذة الأفضل؛ أو خارجها بشرطين:
 *   عيوب مخططه المبني (defectOf) لا تزيد عن عيوب الأفضل بوضوح، وكلفة مطابقة مساحاته ضمن حد (pMax) —
 *   فاتساع الغلاف لحديقة داخلية ليس عيبًا، وتضخّم الغرف بلا حد ليس تنوّعًا.
 * - لا أكثر من MODE_CAP بدائل بالنمط نفسه متى وُجد نمط آخر صالح؛ ولا حشو: ما لا يصلح لا يُعرض.
 * - prefer: أنماط يُقدَّمها ذوق العميل (requirements.tweaks.preferModes) عند التقارب، دون فرضها.
 */
/** كلفة إخفاق قاعدة عرفية واحدة: تؤخّر البديل خلف من حققها، ولا تحجبه (افتراض تصميمي للميزان). */
export const SOFT_FAIL_COST = 45;
/**
 * فصل الدرجات: «شرط العميل» (ما قاله أو اختاره) إخفاقه يحجب البديل متى وُجد من نفّذه؛ «العرف الافتراضي» القابل للتغيير
 * (قاعدة مكانية custom أضافتها شرعاء من الأعراف، مثل «الطعام بجوار المجلس») إخفاقه يُعلن في السجل ويؤخّر البديل فقط.
 */
export function splitFails(ledger = [], requirements = {}) {
  const custom = new Set((requirements.rules || []).filter(r => r.custom).map(r => r.id));
  let hard = 0, soft = 0; for (const x of ledger) if (!x.ok) (custom.has(x.id) ? soft++ : hard++);
  return { hard, soft };
}
const MODE_OVER_FILL = 4;
function diversify(designs, keep, { prefer = [] } = {}) {
  const best = designs[0];
  if (!best) return [];
  const window = best.quality + Math.max(85, Math.abs(best.quality) * .6 + 40), dBest = defectOf(best), dMax = Math.max(dBest + 45, dBest * 1.5); // سقوف المقاسات جوّدت البديل الأول فضاقت النسبة؛ الهامش المطلق يُبقي نمطًا آخر سليمًا ضمن المقارنة
  // كلفة مطابقة المساحات (غرف أكبر أو أصغر كثيرًا من مقاسها التصميمي): يُتسامح فيها لنمط آخر حتى حد، وما فوقه تضخّم لا تنوّع
  const pMax = best.penalty + Math.max(120, Math.abs(best.penalty) * 1.5);
  const seenOther = {}, spare = [];
  const rest = designs.filter(d => {
    if (d.fails !== best.fails) return false;
    if (d.quality <= window) return true;
    // خارج النافذة: يُقبل أفضل ثلاثة من كل نمط آخر إن لم تزد عيوب مخططه ولا تضخّمت مساحاته (كلفة المطابقة ضمن pMax،
    // أو مسطحه وأكبر غرفة نوم فيه ضمن OTHER_MODE_LIMITS)؛ النمط الذي طلبه ذوق العميل يُتسامح في اتساعه أكثر
    const roomy = d.penalty <= pMax * (prefer.includes(d.mode) ? 2 : 1) || (d.area <= best.area * OTHER_MODE_LIMITS.areaRatio && d.maxBed <= Math.max(OTHER_MODE_LIMITS.bed, best.maxBed * OTHER_MODE_LIMITS.bedRatio));
    if (defectOf(d) <= dMax && roomy) { if (d.mode === best.mode) { spare.push(d); return false; } if ((seenOther[d.mode] = (seenOther[d.mode] || 0) + 1) <= 3) return true; }
    return false;
  });
  const keyOf = d => d.idea || d.mode, out = [], count = k => out.filter(o => keyOf(o) === k).length;
  // ذوق العميل: أفضل بديل صالح من نمط مفضَّل يتقدم إلى الصدارة
  if (prefer.length) { const k = rest.findIndex(d => prefer.includes(d.mode)); if (k > 0) rest.unshift(rest.splice(k, 1)[0]); }
  const sigOf = d => (d.vsig ||= visualSig(d.doc));
  // الأرضي نفسه بعلوي آخر ليس تصميمًا جديدًا عند العميل
  const sameGround = (d, o) => patCore(d.pat).includes('/') && groundPat(d.pat) === groundPat(o.pat);
  while (out.length < keep && rest.length) {
    if (!out.length) { out.push(rest.shift()); continue; }
    const scored = rest.map(d => { const ov = Math.max(...out.map(o => patOverlap(d.pat, o.pat))); const vis = Math.max(...out.map(o => visualSim(sigOf(d), sigOf(o)))); const n = count(keyOf(d)); return { d, vis, n, k: d.fails * 1000 + defectOf(d) + d.penalty * .35 + ov * 160 + vis * 200 - (prefer.includes(d.mode) ? 60 : 0) }; })
      // فكرة جديدة: تكفيها عتبة التشابه المرئي؛ فكرة معروضة: مرة ثانية فقط وبشرط اختلاف مرئي واضح؛ الثالثة «المخطط نفسه بأسماء مختلفة»
      .filter(x => x.vis <= VISUAL_LIMIT.relaxed && x.n < IDEA_CAP && (x.n === 0 || x.vis <= IDEA_VARIANT_VIS) && !out.some(o => sameGround(x.d, o)));
    if (!scored.length) break;
    // فكرة لم تُعرض أولًا، ثم التنويع على فكرة معروضة
    scored.sort((a, b) => Math.min(a.n, 1) - Math.min(b.n, 1) || a.k - b.k);
    const pick = scored[0];
    if (pick.n > 0) pick.d.notes?.unshift('تنويع على فكرة معروضة: التنظيم نفسه بتوزيع مختلف للغرف.');
    out.push(pick.d); rest.splice(rest.indexOf(pick.d), 1);
  }
  // أقل من ثلاثة بدائل: يُكمَّل من فكرة الأفضل نفسها بما خرج عن نافذة الجودة وهو سليم المخطط غير متضخم ومختلف مرئيًا بوضوح — لا حشو بمعيب ولا بمكرر
  for (const d of spare) {
    if (out.length >= Math.min(keep, 3)) break;
    if (count(keyOf(d)) < IDEA_CAP && out.every(o => visualSim(sigOf(d), sigOf(o)) <= IDEA_VARIANT_VIS && !sameGround(d, o))) out.push(d);
  }
  // النقص يُعلن: لا تُكرَّر الفكرة نفسها بأسماء مختلفة لإكمال العدد
  if (out.length < Math.min(keep, 3) && out[0]?.notes && !out[0].notes.some(n => n.startsWith('لهذه الأرض'))) out[0].notes.push(`لهذه الأرض وهذا البرنامج ${out.length === 1 ? 'فكرة تنظيم سليمة واحدة' : out.length + ' أفكار تنظيم سليمة'} حاليًا؛ لا أكرر الفكرة نفسها بأسماء مختلفة لإكمال العدد.`);
  return out;
}

// ------------------------------------------------------------------------------------------ مقاييس جودة المخطط
// حدود تصميمية من التطبيق (ليست اشتراطات نظامية)، مختارة من قياس المولّد ومن الممارسة المهنية العامة:
// - الصالة الرئيسية: صافي عرض ≥ 4.5 م ونسبة ≤ 1:1.6 (HALL_LIMITS).
// - المجلس ≤ 1:1.8، وغرفة النوم ≤ 1:1.5 (كلفة)، وما فوق 1:2.2 لأي منهما يُرفض.
// - الأثاث: سرير كينج 1.8×2.0 م بخلوص 0.6 م على جانبيه وعند قدمه (≥ 3.0 × 2.6 م صافيًا)؛ المجلس جلسة على الجدارين الطويلين
//   بعمق 0.75 م وبينهما خلوص ≥ 3.2 م (عرض صافٍ ≥ 4.7 م)؛ طاولة طعام لـ max(6, 2×غرف النوم) حتى 12 مقعدًا،
//   0.6 م لكل مقعد على الجانبين وعرض 1.0 م، وخلوص 0.9 م حولها للكرسي والمرور.
// - الممرات (corridor) ≤ 15٪ من المسطح الإجمالي، وطول ممر بلا انقطاع ≤ 12 م (كلفة لا رفض).
export const PLAN_LIMITS = Object.freeze({ majlisRatio: 1.8, bedRatio: 1.5, rejectRatio: 2.2, corridorShare: .15, corridorRun: 12, bed: { w: 3.0, d: 2.6 }, majlisClear: 3.2, seatDepth: .75, dinClear: .9 });
const dinSeats = n => Math.max(6, Math.min(12, 2 * (n || 3)));
/**
 * قياس المخطط المرسوم: لكل دور الفراغات الصافية (بعد الجدران) بأبعادها ونسبتها، والصالة الرئيسية، وحصة الممرات،
 * وأطول ممر، وفحص اتساع الأثاث. bedrooms: عدد غرف النوم (لطاولة الطعام).
 */
export function planMetrics(doc, { bedrooms = null, model = null } = {}) {
  const levels = [], M = model || analyzeDoc(doc);
  const nBeds = bedrooms ?? doc.labels.filter(l => l.type === 'bedroom' || l.type === 'master').length;
  const CIRC = new Set(['living', 'entrance', 'corridor']);
  for (const lv of M.levels) {
    const walls = lv.walls.filter(w => w.kind !== 'fence'); if (!walls.length) continue;
    const rooms = [];
    for (const rm of lv.rooms) {
      if (rm.unlabelled) continue;
      const xs = rm.net.map(p => p.x), ys = rm.net.map(p => p.y), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      let a = Math.min(bw, bh), b = Math.max(bw, bh);
      if (rm.area < .85 * a * b) a = rm.area / b; // شكل غير مستطيل: عرض مكافئ
      // طول الممر بلا انقطاع: يقطعه كل اتصال بفراغ حركة آخر (صالة، مدخل، ممر)
      let run = b;
      if (rm.type === 'corridor') {
        const alongX = bw >= bh, lo = alongX ? Math.min(...xs) : Math.min(...ys), hi = lo + b;
        const cuts = lv.openings.filter(o => o.door && (o.left === rm || o.right === rm) && CIRC.has((o.left === rm ? o.right : o.left)?.type)).map(o => (alongX ? o.p.x : o.p.y));
        const pts = [lo, ...cuts.filter(t => t > lo && t < hi).sort((u, v) => u - v), hi];
        run = Math.max(...pts.slice(1).map((t, i) => t - pts[i]));
      }
      rooms.push({ name: rm.name, type: rm.type, w: r2(a), l: r2(b), area: r2(rm.area), ratio: r2(b / Math.max(.1, a)), run: r2(run) });
    }
    const xs = walls.flatMap(w => [w.a.x, w.b.x]), ys = walls.flatMap(w => [w.a.y, w.b.y]);
    const court = rooms.filter(r => r.type === 'courtyard').reduce((s, r) => s + r.area, 0);
    const gross = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) - court;
    const corr = rooms.filter(r => r.type === 'corridor');
    const hall = rooms.filter(r => r.type === 'living').sort((p, q) => q.area - p.area)[0] || null;
    const fails = [];
    for (const r of rooms) {
      if (r.type === 'bedroom' || r.type === 'master') { if (!(r.l >= PLAN_LIMITS.bed.w && r.w >= PLAN_LIMITS.bed.d)) fails.push({ room: r.name, what: 'bed', need: `${PLAN_LIMITS.bed.w} × ${PLAN_LIMITS.bed.d}` }); }
      else if (r.type === 'majlis') { const need = PLAN_LIMITS.majlisClear + 2 * PLAN_LIMITS.seatDepth; if (r.w < need - .01) fails.push({ room: r.name, what: 'majlis', short: r2(need - r.w), need: `${need}` }); }
      else if (r.type === 'dining') { const seats = dinSeats(nBeds), tl = .6 * Math.ceil(seats / 2), nl = tl + 2 * PLAN_LIMITS.dinClear, nw = 1.0 + 2 * PLAN_LIMITS.dinClear; if (!(r.l >= nl - .01 && r.w >= nw - .01)) fails.push({ room: r.name, what: 'dining', seats, need: `${r2(nl)} × ${r2(nw)}` }); }
    }
    const ca = corr.reduce((s, r) => s + r.area, 0);
    levels.push({ id: lv.level.id, name: lv.level.name, rooms, hall, gross: r2(gross), corridorArea: r2(ca), corridorShare: r2(ca / Math.max(1, gross)), corridorRun: r2(Math.max(0, ...corr.map(r => r.run))), fails });
  }
  return { levels };
}
const fmtR = v => String(r2(v));
/** ملاحظة صريحة بالأرقام إن لم تحقق الصالة الرئيسية الحدّ (لا صمت). */
function hallNotes(m, W, D) {
  const out = [];
  for (const lv of m.levels) {
    const h = lv.hall; if (!h) continue;
    const okR = h.ratio <= HALL_LIMITS.ratio + .02, okW = h.w >= HALL_LIMITS.minNetW - .02;
    if (okR && okW) continue;
    const upper = lv !== m.levels[0];
    out.push(`${upper ? 'الصالة العلوية' : 'الصالة الرئيسية'} صافيها ${fmtR(h.w)} × ${fmtR(h.l)} م (نسبة 1:${fmtR(h.ratio)})، دون المستهدف (عرض صافٍ ≥ ${HALL_LIMITS.minNetW} م ونسبة ≤ 1:${HALL_LIMITS.ratio})؛`
      + (!okW ? ` عرض المسطح القابل للبناء ${fmtR(W)} م لا يتسع لمحور أعرض مع جناحي الغرف.` : upper ? ' طولها يضم فتحة السلم (نحو 4.2 م) والوصول إليها؛ جزء الجلسة أمام السلم أقصر.' : ' لم يتسع في هذا البديل تقسيم المحور إلى صالة متناسبة وممر.'));
  }
  return out;
}
const COST = { MIN_WIDTH: 40, MIN_AREA: 14, NO_WINDOW: 18, SWING_BLOCKED: 10, FIXTURE_OVERLAP: 8, FIXTURE_OUTSIDE: 8, UNREACHABLE_ROOM: 200, BATH_PRIVACY: 12, BEDROOM_FROM_ENTRY: 20, CORRIDOR_NARROW: 15, WINDOW_RATIO: 1, OPENING_NEAR_END: 2 };
/** كلفة الجودة من مراجعة المرسم نفسها؛ رفض صريح لغرفة معيشية أضيق من حدها أو فراغ لا يُوصل إليه. */
export function quality(doc, { bedrooms = null } = {}) {
  const model = analyzeDoc(doc), rv = reviewDoc(doc, { model }); let cost = 0, reject = false; const issues = {};
  const flag = code => { issues[code] = (issues[code] || 0) + 1; };
  for (const i of rv) {
    flag(i.code);
    cost += COST[i.code] ?? (i.severity === 'warning' ? 6 : 0);
    if (i.code === 'UNREACHABLE_ROOM') reject = true;
    if (i.code === 'MIN_WIDTH' && /غرفة نوم|مجلس|صالة|مطبخ/.test(i.message)) reject = true;
    // غرفة نوم بلا نافذة على الخارج: مرفوضة (لا تحذير فقط)
    if (i.code === 'NO_WINDOW' && /غرفة نوم/.test(i.message)) reject = true;
  }
  // تناسب الفراغات، والأثاث، والممرات (PLAN_LIMITS)
  const m = planMetrics(doc, { bedrooms, model });
  for (const lv of m.levels) {
    for (const r of lv.rooms) {
      if (r.type === 'bedroom' || r.type === 'master') { if (r.ratio > PLAN_LIMITS.bedRatio) { flag('BED_RATIO'); cost += 40 * (r.ratio - PLAN_LIMITS.bedRatio); } if (r.ratio > PLAN_LIMITS.rejectRatio) reject = true; }
      if (r.type === 'majlis') { if (r.ratio > PLAN_LIMITS.majlisRatio) { flag('MAJLIS_RATIO'); cost += 40 * (r.ratio - PLAN_LIMITS.majlisRatio); } if (r.ratio > PLAN_LIMITS.rejectRatio) reject = true; }
    }
    if (lv.hall) { const h = lv.hall, over = Math.max(0, h.ratio - HALL_LIMITS.ratio), thin = Math.max(0, HALL_LIMITS.minNetW - h.w); if (over > .02 || thin > .02) { flag('HALL_PROPORTION'); cost += 40 * over + 30 * thin; } }
    if (lv.corridorShare > PLAN_LIMITS.corridorShare) { flag('CORRIDOR_SHARE'); cost += 200 * (lv.corridorShare - PLAN_LIMITS.corridorShare); }
    if (lv.corridorRun > PLAN_LIMITS.corridorRun) { flag('CORRIDOR_RUN'); cost += 4 * (lv.corridorRun - PLAN_LIMITS.corridorRun); }
    for (const f of lv.fails) { flag('FURNITURE_' + f.what.toUpperCase()); cost += f.what === 'bed' ? 25 : f.what === 'majlis' ? 10 + 20 * (f.short || 0) : 12; }
  }
  return { cost, reject, issues, metrics: m };
}
/** يزيح قطع الأثاث التي تعترض فتح الأبواب أو تتداخل، على محورها، ثم يحذف ما لم يُحل (عدا الأدوات الأساسية).
 * يبدأ بقلب مفصلة الباب حين تقترح المراجعة ذلك؛ والفحص أثناء الإزاحة محلي سريع بنفس هندسة المراجعة. */
export function relaxFixtures(doc) {
  let cur = doc;
  for (const i of reviewDoc(cur)) {
    if (i.code !== 'SWING_BLOCKED' || !i.fix) continue;
    if (i.fix.commands.every(c => c.what === 'hinge')) { try { for (const c of i.fix.commands) cur = applyCommand(cur, c).doc; } catch { /* يبقى كما هو */ } }
  }
  const sectorsOf = d => d.openings.flatMap(o => { const w = d.walls.find(x => x.id === o.wall); return w ? swingSectors({ o, wall: w }).map(sec => ({ level: o.level, pts: sectorPoints(sec) })) : []; });
  const inPoly = (p, poly) => pointInPolygon(p, poly);
  const conflicts = (d, f, secs) => {
    const R = fixtureRect(f);
    if (f.h >= .1 && secs.some(sc => sc.level === f.level && sc.pts.some(p => inPoly(p, R)))) return true;
    for (const g of d.fixtures) if (g !== f && g.id !== f.id && g.level === f.level && g.h >= .1 && f.h >= .1 && penetration(R, fixtureRect(g)) > .03) return true;
    return false;
  };
  const spacesBy = new Map(cur.levels.map(l => [l.id, analyzeWalls(cur.walls.filter(w => w.level === l.id)).spaces.filter(s => s.net)]));
  const secs = sectorsOf(cur);
  const insideRoom = (f, home) => fixtureRect(f).every(p => pointInPolygon(p, home.net));
  for (const f0 of [...cur.fixtures]) {
    let f = cur.fixtures.find(x => x.id === f0.id); if (!f) continue;
    if (!conflicts(cur, f, secs)) continue;
    const home = (spacesBy.get(f.level) || []).find(sp => pointInPolygon({ x: f.x, y: f.y }, sp.net)); if (!home) continue;
    const ax = { x: Math.cos(f.rot || 0), y: Math.sin(f.rot || 0) }, ay = { x: -Math.sin(f.rot || 0), y: Math.cos(f.rot || 0) };
    let fixed = false;
    for (const [k, v] of [[.35, ax], [-.35, ax], [.7, ax], [-.7, ax], [1.1, ax], [-1.1, ax], [1.5, ax], [-1.5, ax], [.3, ay]]) {
      const g = { ...f, x: f.x + v.x * k, y: f.y + v.y * k };
      if (!insideRoom(g, home)) continue;
      if (conflicts(cur, g, secs)) continue;
      cur = applyCommand(cur, { type: 'update', id: f.id, patch: { x: g.x, y: g.y } }).doc; fixed = true; break;
    }
    if (!fixed && !['wc', 'basin', 'kitchen-run', 'bed-double', 'bed-single'].includes(f.kind)) cur = applyCommand(cur, { type: 'delete', ids: [f.id] }).doc;
  }
  return cur;
}

/**
 * الأبواب التي بقي مسار فتحها تعترضه قطعة ثابتة (مرحاض دورة مياه صغيرة، وحدة مطبخ) بعد إزاحة الأثاث: يُعكس اتجاه الفتح
 * (أو المفصلة) كما يقترح فحص المراجعة، بشرط ألّا يزيد مجموع ملاحظاتها (الباب المعكوس لا يصدم بابًا أو جدارًا أو قطعة أخرى).
 * الباب الخارجي لا يُعكس. يُطبَّق على البدائل المختارة للعرض فقط (فحص المراجعة مكلف).
 */
export function settleDoors(doc) {
  let cur = doc;
  for (let pass = 0; pass < 2; pass++) {
    // عكس الباب لا يُحدث إلا تعارض فتح جديدًا (مع باب أو جدار أو قطعة): يكفي عدّ ملاحظات الفتح
    const all = reviewDoc(cur, { only: ['SWING_BLOCKED'] }), todo = all.filter(i => i.fix); if (!todo.length) break;
    let n0 = all.length, changed = false;
    for (const i of todo) {
      const op = cur.openings.find(o => o.id === i.fix.commands[0]?.id); if (!op || op.entry) continue;
      try { let nxt = cur; for (const c of i.fix.commands) nxt = applyCommand(nxt, c).doc; const n1 = reviewDoc(nxt, { only: ['SWING_BLOCKED'] }).length; if (n1 < n0) { cur = nxt; n0 = n1; changed = true; } } catch { /* يبقى كما هو */ }
    }
    if (!changed) break;
  }
  return cur;
}
/** فحص المستند الناتج: لا خطأ، وكل تسمية في فراغ مغلق خاص بها. */
export function checkDoc(doc) {
  const problems = validateDoc(doc).filter(i => i.severity === 'error').map(e => e.message);
  const byLevel = new Map(doc.levels.map(lv => [lv.id, analyzeWalls(doc.walls.filter(w => w.level === lv.id)).spaces.filter(s => s.net)])), seen = new Map();
  let total = 0; for (const v of byLevel.values()) total += v.length;
  for (const l of doc.labels) {
    const spaces = byLevel.get(l.level) || [];
    const sp = spaces.find(s => pointInPolygon(l.seed, s.net));
    if (!sp) { problems.push(`«${l.name}» خارج أي فراغ مغلق.`); continue; }
    const key = l.level + ':' + sp.id;
    if (seen.has(key)) problems.push(`«${l.name}» و«${seen.get(key)}» في فراغ واحد.`); else seen.set(key, l.name);
  }
  return { ok: !problems.length, problems, spaces: total };
}

export default { generateVillaDesigns, buildProgram, searchLayouts, realizeLayout, layoutToDoc, checkDoc, countsFromRooms, DESIGN_TARGETS, VILLA_ENGINE_VERSION };
