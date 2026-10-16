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
import { pointInPolygon } from './draw/geom.mjs';
import { reviewDoc, swingSectors, sectorPoints, fixtureRect, penetration } from './draw/review.mjs';

export const VILLA_ENGINE_VERSION = 'villa-zones-2';
const LV = 'L1', SNAP = .05, EXT = .25, INT = .12, EPS = 1e-6;
const snap = v => Math.round(v / SNAP) * SNAP;
const r2 = v => Math.round(v * 100) / 100;

/** افتراضات تصميمية (م²/م) من التطبيق؛ ليست اشتراطات نظامية. */
export const DESIGN_TARGETS = Object.freeze({
  majlis: 26, majlisMinW: 3.6, guestStripW: 1.6, guestWcL: 1.9,
  foyer: 10, hall: 30, family: 22, dining: 15, kitchen: 13, kitchen2: 8,
  bedroom: 14, master: 19, stripD: 1.7, masterStripD: 2.2, bathL: 2.5, masterBathL: 3.2,
  commonStripW: 1.6, commonBathL: 2.3, galleryW: 1.6,
});
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
  const guestWc = M > 0 && baths > 0 ? 1 : 0; baths -= guestWc;
  const attached = Math.min(N, baths); baths -= attached;
  for (let i = 0; i < M; i++) blocks.push({ id: 'majlis' + (i + 1), kind: 'majlis', rank: i ? .5 : 0, area: T.majlis * (i ? .85 : 1), name: M > 1 ? (i ? 'مجلس النساء' : 'مجلس الرجال') : 'المجلس', guestWc: i === 0 && guestWc === 1 });
  for (let i = 0; i < Dn; i++) blocks.push({ id: 'dining' + (i + 1), kind: 'dining', rank: 1, area: T.dining, name: Dn > 1 ? 'صالة طعام ' + (i + 1) : 'صالة الطعام' });
  for (let i = 0; i < K; i++) blocks.push({ id: 'kitchen' + (i + 1), kind: 'kitchen', rank: 1.5 + i * .05, area: i ? T.kitchen2 : T.kitchen, name: i ? 'مطبخ تحضيري' : 'المطبخ' });
  for (let i = 1; i < H; i++) blocks.push({ id: 'family' + i, kind: 'family', rank: 2.5, area: T.family, name: H > 2 ? 'صالة عائلية ' + i : 'الصالة العائلية' });
  for (let i = 0; i < N; i++) {
    const master = i === 0, bath = i < attached;
    const strip = bath ? (master ? T.masterStripD * 5.2 : T.stripD * 4.4) : 0;
    blocks.push({ id: 'suite' + (i + 1), kind: 'suite', rank: master ? 3.9 : 3 + i * .01, master, bath, area: (master ? T.master : T.bedroom) + strip, name: master ? 'غرفة النوم الرئيسية' : 'غرفة نوم ' + (i + 1) });
  }
  if (attached < N) notes.push(`${N - attached} من غرف النوم بلا حمام ملحق، لأن دورات المياه (${B}) أقل من غرف النوم${guestWc ? ' مع دورة مياه الضيوف' : ''}.`);
  // متطلبات من كلام العميل (requirements.mjs): فراغات إضافية ومقاسات وتفضيلات
  const ex = req.extras || {}, pr = req.prefs || {}, ar = req.areas || {};
  let extraBathsLeft = baths;
  const takeBath = want => { if (!want) return false; if (extraBathsLeft > 0) { extraBathsLeft--; return true; } return false; };
  if (ex.maid) { const bath = takeBath(ex.maid.bath); blocks.push({ id: 'maid', kind: 'maid', rank: 1.7, area: 9 + (bath ? 4 : 0), bath, name: 'غرفة الخادمة' }); if (ex.maid.bath && !bath) notes.push('حمام الخادمة لم يُضف لأن عدد دورات المياه لا يكفي؛ زد العدد واحدًا.'); }
  if (ex.driver) { const bath = takeBath(ex.driver.bath); blocks.push({ id: 'driver', kind: 'driver', rank: .2, area: 9 + (bath ? 3.6 : 0), bath, name: 'غرفة السائق' }); if (ex.driver.bath && !bath) notes.push('حمام السائق لم يُضف لأن عدد دورات المياه لا يكفي؛ زد العدد واحدًا.'); }
  if (ex.office) blocks.push({ id: 'office', kind: 'office', rank: .8, area: 12, name: 'المكتب' });
  if (ex.prayer) blocks.push({ id: 'prayer', kind: 'prayer', rank: .6, area: 8, name: 'المصلى' });
  const kitchenStrip = [...(ex.laundry ? ['laundry'] : []), ...(ex.storage ? ['storage'] : [])];
  // الشريط يُقتطع من المطبخ: نكبّر كتلته بمساحته حتى يبقى المطبخ بمقاسه
  if (kitchenStrip.length) { const k = blocks.find(b => b.id === 'kitchen1'); if (k) k.area += kitchenStrip.length === 2 ? 9 : 5.5; }
  // المقاسات: الصريحة تحل محل الافتراض التصميمي، والوصفية «كبير» تكبّره 30٪
  const setArea = (pred, a) => { for (const b of blocks.filter(pred)) { const strip = b.kind === 'suite' && b.bath ? b.area - (b.master ? T.master : T.bedroom) : 0; b.area = a + strip; b.fixedArea = true; } };
  if (ar.majlis) setArea(b => b.id === 'majlis1', ar.majlis); else if (pr.big_majlis) setArea(b => b.id === 'majlis1', T.majlis * 1.3);
  if (ar.dining) setArea(b => b.kind === 'dining', ar.dining);
  if (ar.kitchen) setArea(b => b.id === 'kitchen1', ar.kitchen); else if (pr.big_kitchen) setArea(b => b.id === 'kitchen1', T.kitchen * 1.3);
  if (ar.master) setArea(b => b.master, ar.master); else if (pr.big_master) setArea(b => b.master, T.master * 1.3);
  if (ar.bedroom) setArea(b => b.kind === 'suite' && !b.master, ar.bedroom);
  const hallArea = ar.hall || (pr.big_hall ? T.hall * 1.35 : T.hall);
  if (pr.elderlyRoom) { const e = blocks.find(b => b.kind === 'suite' && !b.master) || blocks.find(b => b.master); if (e) { e.rank = 1.95; e.elderly = true; e.name = e.master ? e.name : 'غرفة كبار السن'; } }
  // ممر الضيوف ودورة مياههم يُقتطعان من كتلة المجلس: نضيف مساحتهما حتى يبقى المجلس بمقاسه
  for (const b of blocks) if (b.guestWc) b.area += 7;
  return { blocks, hall: H > 0, hallArea, extraBaths: extraBathsLeft, guestWc, attached, notes, prefs: pr, kitchenStrip, counts: { bedrooms: N, majlis: M, baths: B, kitchens: K, halls: H, dining: Dn } };
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
const MIN_RUN = { suite: 3.2, majlis: 3.6, dining: 3.0, kitchen: 2.6, family: 3.4, maid: 2.6, driver: 2.6, office: 2.8, prayer: 2.4, foyer: 2.4, hall: 3.4 };
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
  let pen = 0;
  for (const p of placed) {
    const b = p.block, r = p.r, a = A_(r);
    const ratio = a / b.area;
    pen += 22 * Math.log(ratio) ** 2 * Math.max(1, b.area / 15) * (b.fixedArea ? 5 : 1);
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
      pen += 25 * Math.log(bw * bdp / want) ** 2;
    }
    const asp = Math.max(W_(r), H_(r)) / s;
    if (asp > 2.1) pen += 18 * (asp - 2.1) * Math.max(1, b.area / 15);
    // لا بد من تلامس مع فراغ حركة بطول باب
    const t = Math.max(0, ...circ.map(c => touch(r, c.r)));
    if (t < 1.1) return no('no-circ:' + b.kind);
    // واجهة خارجية للفراغات المعيشية
    const ext = (r.x0 < EPS ? H_(r) : 0) + (r.x1 > W - EPS ? H_(r) : 0) + (r.y0 < EPS ? W_(r) : 0) + (r.y1 > D - EPS ? W_(r) : 0);
    if (ext < 1.5) pen += b.kind === 'family' ? 15 : 60;
  }
  const find = id => placed.find(p => p.block.id === id);
  const k = find('kitchen1'), dn = find('dining1');
  if (k && dn) { if (touch(k.r, dn.r) >= 1.2) pen -= 14; else pen += 16; }
  for (const p of placed) if (p.block.kind === 'majlis') { pen += 4 * Math.max(0, p.r.y0); for (const q of placed) if (q.block.kind === 'suite' && touch(p.r, q.r) > .5) pen += 22; }
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
  if (hall) { const ha = A_(hall.r), ht = program.hallArea || DESIGN_TARGETS.hall; pen += 1.1 * Math.max(0, ha - ht * 1.3) + 2 * Math.max(0, ht * .5 - ha); const as = Math.max(W_(hall.r), H_(hall.r)) / Math.min(W_(hall.r), H_(hall.r)); if (as > 2.6) pen += 10 * (as - 2.6); }
  return pen;
}

/** كل تقسيمات القائمة إلى قسمين، مع معاملة الكتل المتطابقة (غرف النوم العادية مثلًا) كعدد لا كهوية. */
function* subsets(list) {
  const groups = new Map();
  for (const b of list) { const k = [b.kind, !!b.master, !!b.bath, b.area, b.guestWc ? 1 : 0].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
  const gs = [...groups.values()];
  function* rec(i, A, B) {
    if (i === gs.length) { yield [A, B]; return; }
    const g = gs[i];
    for (let c = 0; c <= g.length; c++) yield* rec(i + 1, [...A, ...g.slice(0, c)], [...B, ...g.slice(c)]);
  }
  yield* rec(0, [], []);
}

/** يولّد الترتيبات المرشحة لكل الأنماط ويرتبها. */
export function searchLayouts(program, W, D, { keep = 8, stair = null, upper = null } = {}) {
  if (upper) return searchUpper(program, W, D, upper, keep);
  const T = DESIGN_TARGETS, out = [];
  const blocks = program.blocks, suites = blocks.filter(b => b.kind === 'suite').sort(byRank).reverse(); // الرئيسية أولًا
  const push = (mode, placed, circ, meta) => { const s = score(placed, circ, W, D, program); if (s !== null) out.push({ mode, placed, circ, pen: s, ...meta }); };
  const hubWidths = (stair ? [4.8, 5.2] : [3.6, 4.2, 4.8]).filter(h => W - h >= 7.2);

  // (1) صالة مركزية بين جناحين، و(2) شكل T: جناحان + ممر عرضي + صف خلفي
  if (blocks.length <= 15) for (const wh of hubWidths) for (const sp of [.5, .42, .58]) {
    const wl = snap((W - wh) * sp), wr = W - wh - wl;
    if (wl < 3.6 || wr < 3.6) continue;
    for (let kBack = 0; kBack <= Math.min(suites.length + 1, 4); kBack++) {
      // الصف الخلفي: الرئيسية ثم بقية الأجنحة (وقد تضاف العائلية)
      const fam = blocks.find(b => b.kind === 'family');
      const backSets = kBack === 0 ? [[]] : [suites.slice(0, kBack), ...(fam && kBack <= suites.length ? [[...suites.slice(0, kBack - 1), fam]] : [])].filter(s => s.length === kBack && s.every(Boolean));
      for (const backSet of backSets) {
        const rest = blocks.filter(b => !backSet.includes(b));
        let g = D, back = [];
        if (backSet.length) {
          const bd = Math.max(3.8, Math.min(6.4, backSet.reduce((a, b) => a + b.area, 0) / W));
          g = D - bd - T.galleryW;
          if (g < 9) continue;
          // الصف الخلفي يمتد بعرض المبنى؛ الرئيسية في الطرف، والعائلية في الوسط
          const ordered = orderBackRow(backSet);
          back = row(ordered, 0, W, g + T.galleryW, D, 'y0');
        }
        for (const [L, R] of subsets(rest)) {
          if (!L.length || !R.length) continue;
          if (sp === .5 && L.length && R.length && L[0].id > R[0].id) continue; // نصف التناظر
          L.sort(byRank); R.sort(byRank);
          if (stair && backSet.length) continue; // السلم في نهاية المحور: لا يتوافق مع ممر T
          const pl = [...stack(L, 0, wl, 0, g, 'x1'), ...stack(R, wl + wh, W, 0, g, 'x0'), ...back];
          if (stair && wh < 4.6) continue; // السلم داخل الصالة يحتاج ممرين جانبيين ≥ 1 م
          const f = foyerDepth(pl, wh);
          const circ = [{ id: 'foyer', r: { x0: wl, y0: 0, x1: wl + wh, y1: f } }, { id: 'hall', r: { x0: wl, y0: f, x1: wl + wh, y1: g } }];
          if (backSet.length) circ.push({ id: 'gallery', r: { x0: 0, y0: g, x1: W, y1: g + T.galleryW } });
          if (g - f < (stair ? stair.len + 3.2 : 3.2)) continue;
          const cx = wl + wh / 2;
          push(backSet.length ? 'tee' : 'center', pl, circ, { wh, wl, wr, ...(stair ? { stairRect: { x0: cx - 1.3, y0: g - stair.len - .1, x1: cx + 1.3, y1: g - .1 } } : {}) });
        }
      }
    }
  }
  // (3) صفّان وممر بينهما (للأراضي العريضة قليلة العمق): أمامي عام، خلفي خاص، والصالة في الخلف مقابل الردهة
  if (W >= 16 && !stair) {
    const front0 = blocks.filter(b => ['majlis', 'office', 'prayer', 'driver'].includes(b.kind)), back0 = blocks.filter(b => ['suite', 'family'].includes(b.kind));
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
  if (W < 13) for (const wh of [3.4, 3.8, 4.2].filter(h => W - h >= 4.4)) {
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
    }
  }
  out.sort((a, b) => a.pen - b.pen);
  const res = [], seen = new Set();
  for (const c of out) {
    const key = c.mode + '|' + c.placed.map(p => p.block.id + ':' + Math.round(p.r.x0) + ',' + Math.round(p.r.y0)).sort().join(';');
    const sg = flip => c.placed.map(p => p.block.kind[0] + ((p.r.x0 + p.r.x1) / 2 < W / 2 ? (flip ? 'R' : 'L') : (flip ? 'L' : 'R')) + Math.round(p.r.y0 / 3)).sort().join('');
    const sig = c.mode + '|' + [sg(false), sg(true)].sort()[0];
    if (seen.has(key) || seen.has(sig)) continue; seen.add(key); seen.add(sig); c.sig = sig + '|' + Math.round(W) + 'x' + Math.round(D);
    res.push(c); if (res.length >= keep) break;
  }
  return res;
}
/** الدور العلوي على هندسة الأرضي نفسها: المحور صالة علوية ينتهي بالسلم في الموضع ذاته، والأجنحة للنوم. */
function searchUpper(program, W, D, up, keep) {
  const out = [], sr = up.stairRect, blocks = program.blocks, hb = up.hub;
  const lounge = { id: 'hall', r: { x0: hb.x0, y0: 0, x1: hb.x1, y1: D } };
  if (up.mode === 'side') {
    const wx0 = up.sideAt === 'L' ? 0 : hb.x1, wx1 = up.sideAt === 'L' ? hb.x0 : W;
    const pl = stack([...blocks].sort(byRank), wx0, wx1, 0, D, up.sideAt === 'L' ? 'x1' : 'x0');
    const sc = score(pl, [lounge], W, D, program); if (sc !== null) out.push({ mode: 'side', placed: pl, circ: [lounge], pen: sc, stairRect: sr, upper: true });
  } else {
    for (const [L, R] of subsets(blocks)) {
      if (!L.length || !R.length) continue;
      L.sort(byRank); R.sort(byRank);
      const pl = [...stack(L, 0, hb.x0, 0, D, 'x1'), ...stack(R, hb.x1, W, 0, D, 'x0')];
      const sc = score(pl, [lounge], W, D, program); if (sc !== null) out.push({ mode: up.mode, placed: pl, circ: [lounge], pen: sc, stairRect: sr, upper: true });
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
  const circRooms = cand.circ.map(c => add(c.r, { id: c.id, circ: true, type: c.id === 'foyer' ? 'entrance' : c.id === 'hall' ? 'living' : 'corridor', name: c.id === 'foyer' ? 'الردهة' : c.id === 'hall' ? hallName : 'ممر الغرف' }));
  const realFoyer = circRooms.find(c => c.id === 'foyer'), foyer = realFoyer || circRooms[0];
  if (cand.stairRect) { const h = circRooms.find(c => c.id === 'hall'); if (h) h.stairZone = cand.stairRect; }
  // الأبواب الثابتة للمحور
  if (realFoyer) doors.push({ a: 'foyer', edge: { axis: 'y', at: 0, from: foyer.x0, to: foyer.x1 }, kind: 'door2', w: 1.6, entry: true });
  if (realFoyer) for (const c of circRooms) if (c !== foyer) { const e = shared(foyer, c); if (e) doors.push({ a: 'foyer', b: c.id, edge: e, kind: 'arch', w: Math.min(2.4, e.to - e.from - .4) }); }
  const hall = circRooms.find(c => c.id === 'hall'), gal = circRooms.find(c => c.id === 'gallery');
  if (hall && gal) { const e = shared(hall, gal); if (e) doors.push({ a: 'hall', b: 'gallery', edge: e, kind: 'arch', w: Math.min(3.2, e.to - e.from - .4) }); }
  // أزواج الحمامات: جهة الشريط لكل جناح نوم نحو جاره من الأجنحة
  const suites = cand.placed.filter(p => ['suite', 'maid'].includes(p.block.kind) && p.block.bath !== false);
  const stripSide = new Map();
  for (const p of suites) {
    const perp = isX(p.door) ? ['y0', 'y1'] : ['x0', 'x1'];
    const already = perp.find(s => suites.some(q => q !== p && stripSide.get(q) === opp[s] && Math.abs(p.r[s] - q.r[opp[s]]) < 1e-3 && (isX(s) ? Math.min(p.r.y1, q.r.y1) - Math.max(p.r.y0, q.r.y0) : Math.min(p.r.x1, q.r.x1) - Math.max(p.r.x0, q.r.x0)) > 1));
    if (already) { stripSide.set(p, already); continue; }
    const mate = perp.find(s => suites.some(q => q !== p && !stripSide.has(q) && Math.abs(p.r[s] - q.r[opp[s]]) < 1e-3));
    // بلا جار: الشريط نحو الجدار الداخلي (ليس الخارجي) ليبقى للغرفة جدار خارجي
    const interior = perp.find(s => !(s === 'x0' && p.r.x0 < EPS) && !(s === 'x1' && p.r.x1 > W - EPS) && !(s === 'y0' && p.r.y0 < EPS) && !(s === 'y1' && p.r.y1 > D - EPS));
    stripSide.set(p, mate || interior || perp[0]);
  }
  let pendingGuestWc = null;
  for (const p of cand.placed) detail(p);
  if (pendingGuestWc && !(realFoyer && foyerWc(pendingGuestWc))) { program = { ...program, extraBaths: program.extraBaths + 1 }; notes.push('دورة مياه الضيوف لم تتسع بجوار المجلس فوُضعت مع دورات المياه العامة.'); }
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
  if (program.prefs?.guestEntrance && !doors.some(d => d.guest)) notes.push('مدخل الضيوف المستقل: المجلس لا يلامس الواجهة الأمامية في هذا البديل.');
  return { rooms, doors, notes, W, D, mode: cand.mode };

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
    for (const c of circRooms) { const s = shared(r, c); if (s && s.axis === e.axis && Math.abs(s.at - e.at) < 1e-3) spans.push(s); }
    if (!spans.length) { notes.push(`تعذّر وصل «${id}» بالحركة.`); return; }
    const best = spans.sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
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
        if (ext.length) { const e = edgeOf(room, ext[0]); doors.push({ a: room.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .9, service: true }); }
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
        const eb3 = shared(bath, vest); if (eb3) doors.push({ a: bath.id, b: vest.id, edge: eb3, pos: (eb3.from + eb3.to) / 2, kind: 'door', w: .8 });
        return;
      }
      const ss = ss0, t = t0;
      const [strip, rest] = cut(r, ss, t);
      const L = sideLen(r, ss);
      // الرئيسية تحتفظ بغرفة ملابس: يقصر الحمام (حتى 2.4 م) ليتسع لها
      const bl = b.master && L - bl0 < 1.5 && L - 2.4 >= 1.5 ? L - 1.5 : Math.min(bl0, L);
      // الحمام في الطرف البعيد عن باب الغرفة، والخزانة قرب الباب
      const [bathR, closetR] = L - bl >= 1.5 ? split(strip, opp[side], bl) : [strip, null];
      const bed = add(rest, { id: b.id, type, name: b.name, kind: 'suite', door: side, strip: ss });
      const bath = add(bathR, { id: b.id + '-bath', type: 'bath', name: bathName || ('حمام ' + (b.master ? 'الرئيسية' : b.name.replace('غرفة نوم ', 'غرفة '))), kind: 'bath', door: ss, far: side });
      // باب الغرفة قرب الشريط (مدخل يمرّ بالخزانة)
      const ed = edgeOf(bed, side), nearStrip = (ss === 'x0' || ss === 'y0') ? ed.from : ed.to;
      circDoor(b.id, bed, side, 'door', .95, nearStrip + (nearStrip === ed.from ? .65 : -.65));
      const eb = shared(bath, bed); if (eb) doors.push({ a: bath.id, b: b.id, edge: eb, pos: closerTo(eb, edgeOf(r, side).at, eb.axis === 'x' ? 'y' : 'x', .55), kind: 'door', w: .8 });
      if (closetR) {
        const cl = add(closetR, { id: b.id + '-dress', type: 'storage', name: b.master ? 'غرفة ملابس' : b.kind === 'suite' ? 'خزانة ملابس' : 'خزانة', kind: 'dress', door: ss });
        const ec = shared(cl, bed); if (ec) doors.push({ a: cl.id, b: b.id, edge: ec, pos: (ec.from + ec.to) / 2, kind: ec.to - ec.from >= 1.6 ? 'arch' : 'door', w: Math.min(1.2, ec.to - ec.from - .3) });
      }
      return;
    }
    if (b.kind === 'majlis') {
      const canStrip = b.guestWc && (isX(side) ? W_(r) : H_(r)) - T.guestStripW >= 3.4 && sideLen(r, side) >= Math.max(3.4, T.guestWcL + 1.5);
      if (canStrip) {
        const [strip, rest] = cut(r, side, T.guestStripW);
        // الممر عند الطرف الأقرب للردهة، ودورة المياه في الطرف الآخر
        const fx = (foyer.x0 + foyer.x1) / 2, nearEnd = isX(side) ? (r.y0 <= foyer.y1 ? 'y0' : 'y1') : (Math.abs(r.x0 - fx) < Math.abs(r.x1 - fx) ? 'x0' : 'x1');
        const [lobbyR, wcR] = split(strip, nearEnd, sideLen(r, side) - T.guestWcL);
        const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side });
        const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: 'ممر الضيوف', kind: 'lobby', door: side });
        const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: 'دورة مياه الضيوف', kind: 'wc', door: nearEnd, far: opp[nearEnd] });
        const le = edgeOf(lobby, side); circDoor(lobby.id, lobby, side, 'door', .95, nearEnd === 'y0' || nearEnd === 'x0' ? le.from + .7 : le.to - .7);
        const em = shared(m, lobby); if (em) doors.push({ a: m.id, b: lobby.id, edge: em, pos: (em.from + em.to) / 2, kind: 'arch', w: Math.min(1.6, em.to - em.from - .4) });
        const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: .75 });
        if (r.y0 < EPS) doors.push({ a: m.id, edge: { axis: 'y', at: 0, from: m.x0, to: m.x1 }, pos: (m.x0 + m.x1) / 2, kind: 'door2', w: 1.4, guest: true });
      } else {
        // بديل: شريط على الجهة العمودية البعيدة عن الواجهة: ممر صغير عند جهة الحركة ثم دورة المياه
        const perp = isX(side) ? 'y1' : (Math.abs(r.x0 - (foyer.x0 + foyer.x1) / 2) < Math.abs(r.x1 - (foyer.x0 + foyer.x1) / 2) ? 'x1' : 'x0');
        const L2 = sideLen(r, perp), rest2 = (isX(perp) ? W_(r) : H_(r)) - T.guestStripW;
        if (b.guestWc && L2 >= T.guestWcL + 1.2 && rest2 >= 3.3) {
          const [strip, rest] = cut(r, perp, T.guestStripW);
          const [lobbyR, wcR] = split(strip, side, L2 - T.guestWcL);
          const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side });
          const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: 'ممر الضيوف', kind: 'lobby', door: side });
          const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: 'دورة مياه الضيوف', kind: 'wc', door: side, far: opp[side] });
          circDoor(m.id, m, side, 'door2', 1.4);
          circDoor(lobby.id, lobby, side, 'door', .9);
          const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: .75 });
          if (r.y0 < EPS) doors.push({ a: m.id, edge: { axis: 'y', at: 0, from: m.x0, to: m.x1 }, pos: (m.x0 + m.x1) / 2, kind: 'door2', w: 1.4, guest: true });
        } else {
          const m = add(r, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side });
          circDoor(m.id, m, side, 'door2', 1.4);
          if (b.guestWc) pendingGuestWc = m;
        }
      }
      return;
    }
    if (b.kind === 'dining') { const d = add(r, { id: b.id, type: 'dining', name: b.name, kind: 'dining', door: side }); circDoor(d.id, d, side, 'arch', 1.8); return; }
    if (b.kind === 'family') { const d = add(r, { id: b.id, type: 'living', name: b.name, kind: 'family', door: side }); circDoor(d.id, d, side, 'arch', 2.2); return; }
    if (b.kind === 'kitchen') {
      const k = add(r, { id: b.id, type: 'kitchen', name: b.name, kind: 'kitchen', door: side });
      circDoor(k.id, k, side, 'door', .95);
      // باب خدمة على جدار خارجي ليس الواجهة الأمامية
      const ext = [['x0', r.x0 < EPS], ['x1', r.x1 > W - EPS], ['y1', r.y1 > D - EPS]].filter(([, on]) => on).map(([s]) => s);
      const longest = ext.map(sd => edgeOf(r, sd)).sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
      if (longest && longest.to - longest.from >= 4.2) doors.push({ a: k.id, edge: longest, pos: longest.to - .7, kind: 'door', w: .9, service: true });
      return;
    }
  }
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
function exteriorEdges(r, W, D) {
  const out = [];
  if (r.y0 < EPS) out.push({ axis: 'y', at: 0, from: r.x0, to: r.x1, side: 'y0' });
  if (r.y1 > D - EPS) out.push({ axis: 'y', at: D, from: r.x0, to: r.x1, side: 'y1' });
  if (r.x0 < EPS) out.push({ axis: 'x', at: 0, from: r.y0, to: r.y1, side: 'x0' });
  if (r.x1 > W - EPS) out.push({ axis: 'x', at: W, from: r.y0, to: r.y1, side: 'x1' });
  return out;
}

/** يبني مستند المرسم من التخطيط. */
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
  for (const r of rooms) { addSeg('y', r.y0, r.x0, r.x1); addSeg('y', r.y1, r.x0, r.x1); addSeg('x', r.x0, r.y0, r.y1); addSeg('x', r.x1, r.y0, r.y1); }
  const isExt = (axis, at) => (axis === 'y' ? Math.abs(at) < EPS || Math.abs(at - D) < 1e-3 : Math.abs(at) < EPS || Math.abs(at - W) < 1e-3);
  const walls = [];
  for (const axis of ['x', 'y']) for (const [at, list] of segs[axis]) {
    list.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const [a, b] of list) { const last = merged[merged.length - 1]; if (last && a <= last[1] + 1e-3) last[1] = Math.max(last[1], b); else merged.push([a, b]); }
    for (const [a, b] of merged) {
      const pa = axis === 'y' ? T(a, at) : T(at, a), pb = axis === 'y' ? T(b, at) : T(at, b);
      const id = run({ type: 'add-wall', level: LVL, a: pa, b: pb, t: isExt(axis, at) ? EXT : INT })[0];
      walls.push({ axis, at, a, b, id, pa });
    }
  }
  const opening = (axis, at, pos, kind, extra = {}) => {
    const w = walls.find(x => x.axis === axis && Math.abs(x.at - at) < 1e-3 && pos >= x.a - 1e-3 && pos <= x.b + 1e-3); if (!w) return null;
    const p = axis === 'y' ? T(pos, at) : T(at, pos);
    try { return run({ type: 'add-opening', wall: w.id, kind, at: Math.hypot(p.x - w.pa.x, p.y - w.pa.y), ...extra })[0]; } catch { return null; }
  };
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
    if (r.id === 'foyer' || r.kind === 'lobby' || r.type === 'storage') continue;
    for (const e of exteriorEdges(r, W, D)) {
      const len = e.to - e.from, busy = doorAt.filter(d => d.axis === e.axis && Math.abs(d.at - e.at) < 1e-3 && d.pos > e.from && d.pos < e.to);
      if (r.type === 'bath') { if (len >= 1 && !busy.length) opening(e.axis, e.at, (e.from + e.to) / 2, 'window', { w: .6, h: .6, sill: 1.7 }); continue; }
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
  furnish(rooms, T, run, doorAt, W, D, LVL);
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
export function generateVillaDesigns({ land, counts, requirements = {}, keep = 4, title = 'تصميم أولي من شرعاء' }) {
  const program = buildProgram(counts, requirements);
  const plot = validatePlot({ width: Number(land.width), length: Number(land.length), floors: 1, streets: Object.fromEntries((land.streets || []).map(s => [s, true])), entry: land.entries?.[0] || land.entry });
  const fp = footprint(plot), entry = plot.entry;
  const W = ['s', 'n'].includes(entry) ? fp.w : fp.h, D = ['s', 'n'].includes(entry) ? fp.h : fp.w;
  const need = program.blocks.reduce((a, b) => a + b.area, 0) + DESIGN_TARGETS.foyer + DESIGN_TARGETS.hall * .6;
  // الغلاف: يُقاس على البرنامج لا على الأرض؛ ما يزيد يبقى ساحات (أمامية/خلفية)
  const target = (program.blocks.reduce((a, b) => a + b.area, 0) + DESIGN_TARGETS.foyer + (program.hall ? program.hallArea : 14)) * 1.18;
  const envelopes = [];
  const addEnv = (w, d) => {
    w = snap(Math.min(W, w)); d = snap(Math.min(D, d));
    if (w < 8.5 || d < 9) return;
    if (envelopes.some(e => Math.abs(e.w - w) < .6 && Math.abs(e.d - d) < .6)) return;
    envelopes.push({ w, d, ox: snap((W - w) / 2) });
  };
  for (const rho of [.75, 1, 1.25, 1.55, 1.9]) {
    let w = Math.sqrt(target / rho), d = rho * w;
    if (w > W) { w = W; d = target / w; }
    if (d > D) { d = D; w = target / d; }
    addEnv(w, d); addEnv(w, d * 1.15);
  }
  addEnv(W, target / W); addEnv(W, target / W * 1.2);
  let cands = [];
  for (const env of envelopes) for (const c of searchLayouts(program, env.w, env.d, { keep: keep * 3 })) cands.push({ ...c, env, pen: c.pen + 6 * Math.max(0, env.w * env.d / target - 1.25) * 10 });
  cands.sort((a, b) => a.pen - b.pen);
  const seenSig = new Set(); cands = cands.filter(c => { if (seenSig.has(c.sig)) return false; seenSig.add(c.sig); return true; });
  if (!cands.length) {
    const err = Error(`لم أجد توزيعًا مهنيًا لهذا البرنامج داخل المساحة القابلة للبناء (${r2(W)} × ${r2(D)} م = ${Math.round(W * D)} م²)؛ البرنامج بالمقاسات التصميمية المستهدفة يحتاج نحو ${Math.round(need)} م².`);
    err.code = 'VILLA_NO_FIT'; err.need = need; err.available = W * D; throw err;
  }
  const designs = [];
  for (const cand of cands) {
    if (designs.length >= keep + 2) break;
    try {
      const mirror = designs.length % 2 === 1; // تنويع الاتجاه بين البدائل
      const layout = realizeLayout(cand, program, cand.env.w, cand.env.d, { secondEntry: canonicalSide(entry, land?.entries?.[1], mirror) });
      const doc = layoutToDoc(layout, { land, plot, fp, entry, mirror, title, ox: cand.env.ox, Wfull: W });
      const built = cand.env.w * cand.env.d;
      layout.notes.push(`مسطح الدور ${Math.round(built)} م² (${r2(cand.env.w)} × ${r2(cand.env.d)} م) من مساحة قابلة للبناء ${Math.round(W * D)} م²؛ الباقي ساحات.`);
      const check = checkDoc(doc);
      if (!check.ok) continue;
      const relaxed = relaxFixtures(doc);
      const q = quality(relaxed);
      if (q.reject) continue;
      designs.push({ doc: relaxed, penalty: r2(cand.pen), quality: r2(cand.pen + q.cost), issues: q.issues, mode: cand.mode, env: cand.env, notes: [...program.notes, ...layout.notes], summary: describe(cand), rooms: layout.rooms });
    } catch { /* بديل لم يُبنَ: يُرفض */ }
  }
  if (!designs.length) { const err = Error('تعذّر بناء أي بديل سليم من التوزيعات المرشحة.'); err.code = 'VILLA_BUILD_FAILED'; throw err; }
  designs.sort((a, b) => a.quality - b.quality);
  // تنويع الاتجاه: البدائل الزوجية تُعكس (مرآة) بعد الترتيب فلا يتكرر الشكل نفسه
  designs.length = Math.min(designs.length, keep);
  return { designs, program, W: r2(W), D: r2(D), engine: VILLA_ENGINE_VERSION };
}
/**
 * دوران: الأرضي للضيافة والخدمة (مجالس، طعام، مطبخ، خادمة، مكتب، غرفة كبار السن) والسلم في نهاية الصالة؛
 * العلوي لأجنحة النوم حول صالة علوية، والسلم في الموضع ذاته. الغلاف واحد للدورين (العلوي فوق الأرضي تمامًا).
 */
export function generateVillaTwoFloors({ land, counts, requirements = {}, keep = 3, title = 'تصميم أولي من شرعاء' }) {
  const program = buildProgram(counts, requirements);
  const groundKinds = new Set(['majlis', 'dining', 'kitchen', 'maid', 'office', 'prayer', 'driver']);
  const gBlocks = program.blocks.filter(b => groundKinds.has(b.kind) || b.elderly);
  let uBlocks = program.blocks.filter(b => !gBlocks.includes(b));
  if (!uBlocks.some(b => b.kind === 'suite')) { const e = Error('لا توجد غرف نوم للدور العلوي؛ دور واحد يكفي هذا البرنامج.'); e.code = 'VILLA_NO_UPPER'; throw e; }
  if (!gBlocks.length) { const e = Error('لا توجد فراغات ضيافة أو خدمة للدور الأرضي.'); e.code = 'VILLA_NO_GROUND'; throw e; }
  let upperHallName = 'الصالة العلوية';
  const fam = uBlocks.find(b => b.kind === 'family'); if (fam) { uBlocks = uBlocks.filter(b => b !== fam); upperHallName = fam.name; }
  const gExtra = Math.min(1, program.extraBaths);
  const gProg = { ...program, blocks: gBlocks, extraBaths: gExtra };
  const uProg = { ...program, blocks: uBlocks, extraBaths: program.extraBaths - gExtra, upperHallName, hall: true, guestWc: 0, kitchenStrip: [], prefs: {}, hallArea: 24 };
  const plot = validatePlot({ width: Number(land.width), length: Number(land.length), floors: 1, streets: Object.fromEntries((land.streets || []).map(x => [x, true])), entry: land.entries?.[0] || land.entry });
  const fp = footprint(plot), entry = plot.entry;
  const W = ['s', 'n'].includes(entry) ? fp.w : fp.h, D = ['s', 'n'].includes(entry) ? fp.h : fp.w;
  const STAIR = { len: 4.0 }, sum = l => l.reduce((a, b) => a + b.area, 0);
  const target = Math.max(sum(gBlocks) + DESIGN_TARGETS.foyer + program.hallArea + 15, sum(uBlocks) + 24 + 15) * 1.15;
  const envs = [];
  const addEnv = (w, d) => { w = snap(Math.min(W, w)); d = snap(Math.min(D, d)); if (w < 8.5 || d < 10) return; if (envs.some(e => Math.abs(e.w - w) < .6 && Math.abs(e.d - d) < .6)) return; envs.push({ w, d, ox: snap((W - w) / 2) }); };
  for (const rho of [.8, 1, 1.25, 1.55, 1.9]) { let w = Math.sqrt(target / rho), d = rho * w; if (w > W) { w = W; d = target / w; } if (d > D) { d = D; w = target / d; } addEnv(w, d); addEnv(w, d * 1.12); }
  const pairs = [];
  for (const env of envs) for (const g of searchLayouts(gProg, env.w, env.d, { keep: 6, stair: STAIR })) {
    const hall = g.circ.find(c => c.id === 'hall').r;
    const u = searchLayouts(uProg, env.w, env.d, { upper: { mode: g.mode, stairRect: g.stairRect, sideAt: g.sideAt, hub: { x0: hall.x0, x1: hall.x1 } }, keep: 1 })[0];
    if (u) pairs.push({ g, u, env, pen: g.pen + u.pen });
  }
  pairs.sort((a, b) => a.pen - b.pen);
  if (!pairs.length) { const e = Error(`لم أجد توزيعًا مهنيًا لدورين داخل المساحة القابلة للبناء (${r2(W)} × ${r2(D)} م).`); e.code = 'VILLA_NO_FIT'; throw e; }
  const designs = [];
  for (const pr of pairs) {
    if (designs.length >= keep + 1) break;
    try {
      const mirror = designs.length % 2 === 1, { env } = pr;
      const gl = realizeLayout(pr.g, gProg, env.w, env.d, { secondEntry: canonicalSide(entry, land?.entries?.[1], mirror) });
      const ul = realizeLayout(pr.u, uProg, env.w, env.d);
      let doc = layoutToDoc(gl, { land, plot, fp, entry, mirror, title, ox: env.ox, Wfull: W });
      const T = frame(fp, entry, mirror, env.w, env.ox, W);
      const r = applyCommand(doc, { type: 'add-level', name: 'الدور الأول' }); doc = r.doc; const L2 = r.ids[0];
      doc = drawLevel(doc, ul, { level: L2, T });
      doc = addStair(doc, pr.g.stairRect, T, LV);
      { const sr = pr.g.stairRect, c = T((sr.x0 + sr.x1) / 2, (sr.y0 + sr.y1) / 2); try { doc = applyCommand(doc, { type: 'add-text', level: L2, at: c, text: 'فتحة السلم', size: .35 }).doc; } catch { /* نص اختياري */ } }
      const check = checkDoc(doc); if (!check.ok) continue;
      const relaxed = relaxFixtures(doc), q = quality(relaxed); if (q.reject) continue;
      const notes = [...new Set([...program.notes, ...gl.notes, ...ul.notes, `مسطح كل دور ${Math.round(env.w * env.d)} م² (${r2(env.w)} × ${r2(env.d)} م) من مساحة قابلة للبناء ${Math.round(W * D)} م²؛ الباقي ساحات.`, 'السلم في نهاية الصالة ويصل إلى الصالة العلوية في الموضع نفسه.'])];
      designs.push({ doc: relaxed, penalty: r2(pr.pen), quality: r2(pr.pen + q.cost), issues: q.issues, mode: pr.g.mode, env, notes, summary: describe(pr.g) + ' (دوران)' });
    } catch { /* زوج لم يُبنَ */ }
  }
  if (!designs.length) { const e = Error('تعذّر بناء أي بديل سليم لدورين.'); e.code = 'VILLA_BUILD_FAILED'; throw e; }
  designs.sort((a, b) => a.quality - b.quality); designs.length = Math.min(designs.length, keep);
  return { designs, program, W: r2(W), D: r2(D), engine: VILLA_ENGINE_VERSION, floors: 2 };
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
const MODE_AR = { center: 'صالة مركزية بين جناحين', tee: 'صالة مركزية وممر خلفي لأجنحة النوم (شكل T)', rows: 'صف أمامي للضيافة وصف خلفي للعائلة بينهما ممر', side: 'صالة جانبية بطول المبنى' };
function describe(c) { return MODE_AR[c.mode] || c.mode; }

const COST = { MIN_WIDTH: 40, MIN_AREA: 14, NO_WINDOW: 18, SWING_BLOCKED: 10, FIXTURE_OVERLAP: 8, FIXTURE_OUTSIDE: 8, UNREACHABLE_ROOM: 200, BATH_PRIVACY: 12, BEDROOM_FROM_ENTRY: 20, CORRIDOR_NARROW: 15, WINDOW_RATIO: 1, OPENING_NEAR_END: 2 };
/** كلفة الجودة من مراجعة المرسم نفسها؛ رفض صريح لغرفة معيشية أضيق من حدها أو فراغ لا يُوصل إليه. */
export function quality(doc) {
  const rv = reviewDoc(doc); let cost = 0, reject = false; const issues = {};
  for (const i of rv) {
    issues[i.code] = (issues[i.code] || 0) + 1;
    cost += COST[i.code] ?? (i.severity === 'warning' ? 6 : 0);
    if (i.code === 'UNREACHABLE_ROOM') reject = true;
    if (i.code === 'MIN_WIDTH' && /غرفة نوم|مجلس|صالة|مطبخ/.test(i.message)) reject = true;
  }
  return { cost, reject, issues };
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
