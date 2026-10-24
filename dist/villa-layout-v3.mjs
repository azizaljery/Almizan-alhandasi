// (الجولة العشرون — توجيه المالك r20) المحرك الثالث: توليد قائم على العلاقات والقيود بدل القوالب المكتوبة.
//
// لماذا (docs/research/generator-architecture-audit-r20.md): تنظيمات المحرك الثاني شجرات مكتوبة يدويًا لأرض 20×30 تقريبًا؛ على الأرض العريضة
// يتعذّر أدنى أبعاد معظمها، وعلى البرنامج الواسع يطول ممر النوم فيها حتمًا، والدوران يفترض غرفة نوم أرضية. هذا المحرك يركّب التنظيم نفسه:
//
//  (1) البرنامج والمتطلبات (programV2 + rules): البنود الصريحة للعميل قيود صلبة، وقيم الميزان الافتراضية تفضيلات بوزن.
//  (2) رسم العلاقات: لكل فراغ علاقاته (باب لازم، تجاور، فصل، ضوء، واجهة) ومنطقته (ضيافة / عائلة / خدمة / نوم / حركة).
//  (3) شبكة تقريبية على الأرض (أعمدة × صفوف من الشارع إلى الخلف، بعددٍ من نسبة الأرض): يُبحث فيها بحثَ قيود (CSP بالتراجع) عن كل
//      توزيع للوحدات على مستطيلات من الخلايا تتحقق فيه القيود الصلبة: المدخل العائلي على الشارع، والصالة تلامسه، ومجلس الرجال على الشارع
//      أو جانبه ويلامس الطعام (وصلة الضيافة/المقلط)، والطعام يلامس المطبخ ويُبلغ من العائلة، والنوم يلامس الصالة، ولكل فراغ مأهول ضوء من
//      الخارج أو من حديقة/حوش، والمطبخ لا يطل على الشارع، وبنود الموضع الصريحة («المطبخ في الخلف»…) — قبل أي هندسة.
//  (4) التوزيعات الصالحة تُرتّب بالتفضيلات (أوزان) وتُختار منها مجموعة متنوعة في رسم التجاور (لا انعكاسات).
//  (5) كل توزيع يُحوَّل إلى شجرة تقسيم (قطع مقصلي على خطوط الشبكة)، وجناح النوم يُركَّب من موضعه (ممر جانبي / ممر أوسط بغرف على جانبيه /
//      غرف على الصالة مباشرة) بحسب جهة الصالة وجهات الضوء وطول الممر (≤ 12.5 م صلب).
//  (6) الأبعاد بالبحث المحلي (التلدين) والتقييم والتفصيل والبوابات والمراجعة والاختيار: خطوات المحرك الثاني نفسها (withTreeSource) —
//      فلا يُخفَّف أي معيار، ويُقاس الناتج بالمقاييس نفسها.
//  وقبل كل ذلك: كشف الاستحالة (feasibility.mjs) — البرنامج أكبر من المساحة القابلة للبناء، أو مقاس صريح لا يتسع… يُقال للعميل بالعربية.
//
// المحركان الأول والثاني باقيان كما هما وقابلان للاختيار (engine: 'v1' | 'v2' | 'v3').
import * as V2 from './villa-layout-v2.mjs';
import { analyzeFeasibility } from './feasibility.mjs';

export const VILLA_V3_ENGINE_VERSION = 'villa-v3-relations-1';
const K = V2.TREE_KIT;
const { Z, C, X, Y, OV, VOID, COURT, D2 } = K;
const T = K.DESIGN_TARGETS;
const sum = a => a.reduce((s, v) => s + v, 0);
const OPP = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };

// ---------------------------------------------------------------------------------------------- (2) الوحدات والعلاقات
/**
 * وحدات التنظيم من البرنامج: كل وحدة مجموعة فراغات تبقى معًا (منطقة)، بعلاقاتها. لا أرقام حالات هنا: المساحات من البرنامج نفسه.
 * يعيد { units, rel } — rel: قائمة العلاقات الصلبة واللينة بين الوحدات (للتقرير والاختبار).
 */
export function unitsOf(P, { stair = false } = {}) {
  const U = [];
  const add = (key, o) => U.push({ key, ...o });
  const flex = [...P.women.slice(1), P.guest, P.office, P.prayer].filter(Boolean);
  const beds = [...P.family, ...P.wcs.slice(1), ...P.suites];
  if (P.men || (!P.women.length && P.blocks.some(b => b.kind === 'majlis'))) add('M', { zone: 'guest', blocks: [P.men || P.blocks.find(b => b.kind === 'majlis')], area: (P.men || P.blocks.find(b => b.kind === 'majlis')).area, light: true, maxCells: 1 });
  if (P.women[0]) add('W', { zone: 'guest', blocks: [P.women[0]], area: P.women[0].area, light: true, maxCells: 1 });
  if (P.dining.length) add('DN', { zone: P.guestLink ? 'guest' : 'family', blocks: [...P.dining], area: sum(P.dining.map(b => b.area)), light: true, maxCells: 1 });
  const svc = [...P.kitchens, ...(P.maid ? [P.maid] : []), ...(P.driver ? [P.driver] : []), ...P.wcs.slice(0, 1)];
  if (svc.length) add('KS', { zone: 'service', blocks: svc, area: sum(svc.map(b => b.area)), light: true, maxCells: 2 });
  if (flex.length) add('XP', { zone: 'guest', blocks: flex, area: sum(flex.map(b => b.area)), light: true, maxCells: 1 });
  add('F', { zone: 'circ', circ: 'foyer', area: P.dayWc ? K.FOYER_WC_AREA : T.foyer * .85, maxCells: 1 });
  add('H', { zone: 'family', circ: 'hall', area: P.hallArea, light: true, maxCells: (P.rules || []).some(r => r.kind === 'place' && r.a === 'hall' && r.side === 'back') ? 3 : 2 });
  if (stair) add('ST', { zone: 'circ', circ: 'stair', area: 3.8 * 3.7, maxCells: 1 });
  // رواق وصل اختياري بين مدخل العائلة وصالة لا تلامسه (الصالة على الواجهة الخلفية أو بعد حوش): لا يوضع إلا إن لامسهما معًا
  add('LK', { zone: 'circ', circ: 'link', area: 8, maxCells: 2, optional: true });
  // النوم: جناح واحد، أو جناحان حين يطول ممر الجناح الواحد عن حده (لا ممر نوم أطول من 12.5 م)
  if (beds.length && !stair) {
    const runAll = sum(beds.filter(b => !b.master).map(b => K.runOf(b) + .15));
    if (beds.length >= 5 && runAll > K.CORR_SINGLE_HARD - .3) {
      const m = beds.filter(b => b.master), o = beds.filter(b => !b.master), h = Math.ceil(o.length / 2);
      add('S1', { zone: 'sleep', blocks: o.slice(0, h), area: sum(o.slice(0, h).map(b => b.area)), light: true, maxCells: 2, sleep: true });
      add('S2', { zone: 'sleep', blocks: [...o.slice(h), ...m], area: sum([...o.slice(h), ...m].map(b => b.area)), light: true, maxCells: 2, sleep: true });
    } else add('S1', { zone: 'sleep', blocks: beds, area: sum(beds.map(b => b.area)), light: true, maxCells: 3, sleep: true });
  } else if (beds.length && stair) add('S1', { zone: 'sleep', blocks: beds, area: sum(beds.map(b => b.area)), light: true, maxCells: 2, sleep: true });
  const has = k => U.some(u => u.key === k);
  // العلاقات: hard = لا يُقبل توزيع يخالفها؛ soft = تفضيل بوزن (يُوازن)
  const rel = [
    { a: 'F', kind: 'front', hard: true, ar: 'مدخل العائلة على الشارع' },
    { a: 'H', b: ['F', 'LK'], kind: 'touch', hard: true, ar: 'الصالة تلامس مدخل العائلة (أو رواقًا منه)' },
    { a: 'LK', b: 'F', kind: 'touch', hard: true, ar: 'رواق الوصل من مدخل العائلة' },
    { a: 'LK', b: 'H', kind: 'touch', hard: true, ar: 'رواق الوصل إلى الصالة' },
    has('M') && { a: 'M', kind: 'frontOrSide', hard: true, ar: 'مجلس الرجال على الشارع أو على واجهة جانبية (مدخل مستقل)' },
    has('W') && { a: 'W', b: 'F', kind: 'touch', hard: true, ar: 'مجلس النساء من مدخل العائلة' },
    has('DN') && has('KS') && { a: 'DN', b: 'KS', kind: 'touch', hard: true, ar: 'الطعام يلامس المطبخ' },
    has('DN') && { a: 'DN', b: ['H', 'F'], kind: 'touch', hard: true, ar: 'الطعام يُبلغ من العائلة (الصالة أو المدخل)' },
    has('M') && has('DN') && P.guestLink && { a: 'M', b: 'DN', kind: 'touch', hard: true, ar: 'وصلة الضيافة: مجلس الرجال يلامس الطعام (مقلط) فلا يعبر الضيف العائلة' },
    has('KS') && { a: 'KS', kind: 'notFront', hard: !kitchenFront(P), ar: 'المطبخ لا يطل على الشارع' },
    has('XP') && { a: 'XP', b: ['F', 'H'], kind: 'touch', hard: true, ar: 'الفراغات العامة الإضافية من المدخل أو الصالة' },
    has('ST') && { a: 'ST', b: 'F', kind: 'touch', hard: true, ar: 'الدرج من المدخل' },
    has('ST') && { a: 'ST', b: 'H', kind: 'touch', hard: true, ar: 'الدرج يلامس الصالة' },
    ...U.filter(u => u.sleep).map(u => ({ a: u.key, b: 'H', kind: 'touch', hard: true, ar: 'جناح النوم يلامس الصالة (ممره منها)' })),
    ...U.filter(u => u.light).map(u => ({ a: u.key, kind: 'light', hard: true, ar: 'ضوء طبيعي من الخارج أو من حديقة/حوش' })),
    ...U.filter(u => u.sleep).map(u => ({ a: u.key, kind: 'notFront', hard: false, w: 3, ar: 'غرف النوم لا تطل على الشارع' })),
    has('M') && U.some(u => u.sleep) && { a: 'M', b: 'S*', kind: 'apart', hard: false, w: 1, ar: 'المجلس لا يلاصق غرف النوم' },
    has('M') && has('W') && { a: 'M', b: 'W', kind: 'apart', hard: false, w: .6, ar: 'مجلس الرجال لا يلاصق مجلس النساء' },
    { a: 'H', b: 'G', kind: 'touch', hard: false, w: 1.2, ar: 'الصالة تطل على حديقة أو حوش' },
    { a: 'H', kind: 'notFront', hard: false, w: 1, ar: 'الصالة لا تطل على الشارع' },
    has('DN') && { a: 'DN', b: 'F', kind: 'apart', hard: false, w: .4, ar: 'الطعام لا يفتح على مدخل العائلة (ممر عبور)' },
  ].filter(Boolean);
  // بنود الموضع الصريحة من طلب العميل: قيود صلبة على الوحدات
  const MAP = { kitchen: 'KS', dining: 'DN', majlis: 'M', majlis_m: 'M', majlis_w: 'W', hall: 'H', master: 'S*', bedrooms: 'S*', kids: 'S*', maid: 'KS', laundry: 'KS', service: 'KS' };
  for (const r of P.rules || []) if (r.kind === 'place' && MAP[r.a] && (r.side === 'back' || r.side === 'front') && r.mode !== 'avoid' && r.level !== 'prefer')
    if (MAP[r.a] === 'S*' ? U.some(u => u.sleep) : has(MAP[r.a])) rel.push({ a: MAP[r.a], kind: r.side === 'back' ? 'back' : 'front', hard: true, client: true, ar: 'بند العميل: ' + (r.text || r.a) });
  return { units: U, rel };
}
const R14_OFF_V3 = new Set(String(globalThis.process?.env?.R14_OFF || '').split(',').filter(Boolean));
/** دورة المياه اليومية للعائلة (قيمة تصميمية افتراضية للميزان: dayWc) كتلة حقيقية في أشجار المحرك الثالث بجوار الصالة. */
const DAY_WC = Object.freeze({ id: 'wcDay', kind: 'wc', rank: 2, area: 3.6, name: 'دورة مياه' });
const kitchenFront = P => (P.rules || []).some(r => r.kind === 'place' && r.side === 'front' && /kitchen|مطبخ/.test(String(r.a)));

// ---------------------------------------------------------------------------------------------- (3) الشبكة وبحث القيود
/** أبعاد الشبكة المرشحة من نسبة الأرض (أعمدة × صفوف). */
export function gridShapes(W, D, nUnits) {
  // كل شبكة تتسع للوحدات (ومعها حديقتان على الأكثر) وتتسع لها الأرض بأدنى عرض خلية (≈ 4 م عرضًا، 3.6 م عمقًا)، مرتبة بقرب خليتها من
  // المربع ثم بقرب عدد خلاياها من عدد الوحدات + 3 — الأرض الضيقة تأخذ عمودين وصفوفًا أكثر، والعريضة أعمدة أكثر
  const out = [], cMax = Math.max(2, Math.min(5, Math.floor(W / 4.0))), rMax = Math.max(2, Math.min(6, Math.floor(D / 3.6)));
  for (let nc = 2; nc <= cMax; nc++) for (let nr = 2; nr <= rMax; nr++) { const n = nc * nr; if (n < nUnits || n > nUnits + 6) continue; out.push({ nc, nr, k: Math.abs(Math.log((W / nc) / (D / nr))) + .06 * Math.abs(n - nUnits - 3) }); }
  return out.sort((a, b) => a.k - b.k).slice(0, 4).map(o => [o.nc, o.nr]);
}
const adjLen = (a, b) => { // طول الحافة المشتركة بين مستطيلي خلايا (بالخلايا)
  if (a.x1 === b.x0 || b.x1 === a.x0) return Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  if (a.y1 === b.y0 || b.y1 === a.y0) return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  return 0;
};
/** الجهات التي يلامس فيها المستطيل حد الشبكة (الخارج): y0 = الشارع. */
const bnd = (r, nc, nr) => [r.x0 === 0 && 'x0', r.x1 === nc && 'x1', r.y0 === 0 && 'y0', r.y1 === nr && 'y1'].filter(Boolean);
/** جهة مستطيل التي تلامس مستطيلًا آخر. */
function sideTo(a, b) {
  if (a.x1 === b.x0 && adjLen(a, b) > 0) return 'x1'; if (a.x0 === b.x1 && adjLen(a, b) > 0) return 'x0';
  if (a.y1 === b.y0 && adjLen(a, b) > 0) return 'y1'; if (a.y0 === b.y1 && adjLen(a, b) > 0) return 'y0'; return null;
}

/**
 * بحث القيود على الشبكة: يملأ كل خلية بوحدة أو بحديقة (G، حتى اثنتين) بمستطيلات، ويعيد كل التوزيعات التي تجتاز القيود الصلبة.
 * التراجع مع تقليم مبكر (المدخل في الصف الأول، المطبخ ليس فيه، ما ليس له موضع)؛ ميزانية حتمية بعدد العقد.
 */
export function enumerateLayouts(units, rel, nc, nr, { budget = 1500000, gMax = 2, W = Infinity, D = Infinity } = {}) {
  const N = nc * nr, grid = new Array(N).fill(-1), place = new Map(), out = [];
  const keys = units.map(u => u.key);
  const hardFront = new Set(rel.filter(r => r.hard && r.kind === 'front').map(r => r.a));
  const hardNotFront = new Set(rel.filter(r => r.hard && r.kind === 'notFront').map(r => r.a));
  const hardBack = new Set(rel.filter(r => r.hard && r.kind === 'back').map(r => r.a));
  let nodes = 0, gUsed = 0;
  const free = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= nc || y >= nr || grid[y * nc + x] !== -1) return false; return true; };
  const fill = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) grid[y * nc + x] = v; };
  const unitIdx = new Map(units.map((u, i) => [u.key, i]));
  const rec = () => {
    if (++nodes > budget) return;
    const c = grid.indexOf(-1);
    if (c < 0) { if (units.every(u => u.optional || place.has(u.key))) { const L = check(); if (L) out.push(L); } return; }
    const x0 = c % nc, y0 = (c - x0) / nc;
    // الوحدات غير الموضوعة بعد (وحديقة)
    const cand = units.filter(u => !place.has(u.key));
    // تقليم: إن بقيت وحدات أكثر من الخلايا الحرة لا حل
    if (cand.filter(u => !u.optional).length > grid.filter(v => v === -1).length) return;
    for (const u of cand) {
      if (hardNotFront.has(u.key) && y0 === 0) continue; // المطبخ على الشارع
      if (u.key === 'F' && y0 !== 0) continue;
      for (const [w, h] of shapesFor(u)) {
        if (!free(x0, y0, w, h)) continue;
        const r = { x0, y0, x1: x0 + w, y1: y0 + h };
        if (hardFront.has(u.key) && r.y0 !== 0) continue;
        if (hardBack.has(u.key) && r.y1 !== nr) continue;
        fill(x0, y0, w, h, unitIdx.get(u.key)); place.set(u.key, r);
        if (pairsOK(u.key) && dimsOK()) rec();
        place.delete(u.key); fill(x0, y0, w, h, -1);
        if (nodes > budget) return;
      }
    }
    // حديقة/حوش
    if (gUsed < gMax) for (const [w, h] of [[1, 1], [2, 1], [1, 2]]) {
      if (!free(x0, y0, w, h)) continue;
      if (y0 === 0 && h === 1 && w === 1 && false) continue;
      const key = 'G' + gUsed, r = { x0, y0, x1: x0 + w, y1: y0 + h };
      fill(x0, y0, w, h, 100 + gUsed); place.set(key, r); gUsed++;
      rec();
      gUsed--; place.delete(key); fill(x0, y0, w, h, -1);
      if (nodes > budget) return;
    }
  };
  // تقليم: علاقة «تلامس» صلبة بين وحدتين موضوعتين كلتيهما لا تلامس = لا حل في هذا الفرع (المستطيلات لا تتحرك بعد وضعها)
  const touchRel = rel.filter(r => r.hard && r.kind === 'touch' && r.b !== 'S*');
  const pairsOK = k => { for (const r of touchRel) { if (r.a !== k && !(Array.isArray(r.b) ? r.b.includes(k) : r.b === k)) continue; const A = place.get(r.a); if (!A) continue; const bs = Array.isArray(r.b) ? r.b : [r.b]; if (!bs.every(b => place.has(b) || !keys.includes(b))) continue; if (!bs.some(b => place.has(b) && adjLen(A, place.get(b)) > 0)) return false; } return true; };
  // أحجام المستطيل الممكنة لكل وحدة من مساحتها نسبةً إلى متوسط مساحة الخلية (قيد أبعاد في البحث نفسه: لا مجلس في ثلاث خلايا ولا جناح نوم في خلية)
  const cellA = sum(units.filter(u => !u.optional).map(u => u.area)) * 1.12 / (nc * nr - 1);
  // قيد أبعاد لازم لأي ترتيب قطع: كل خط أفقي يقطع الوحدات التي يمر بها جنبًا إلى جنب، فمجموع أدنى عروضها ≤ عرض الأرض؛ وكذلك كل خط
  // رأسي وأدنى أعماقها ≤ عمقها (u.wmin/u.dmin حدود دنيا آمنة من أشجار الوحدة بكل اتجاهاتها) — يقلّم مبكرًا ما لا يتسع
  const dimsOK = () => {
    if (W === Infinity && D === Infinity) return true;
    const P0 = [...place.entries()];
    for (let y = 0; y < nr; y++) { let t = 0; for (const [k, r] of P0) if (r.y0 <= y && r.y1 > y) t += k[0] === 'G' ? 2.4 : (units[unitIdx.get(k)]?.wmin || 0); if (t > W + 1e-6) return false; }
    for (let x = 0; x < nc; x++) { let t = 0; for (const [k, r] of P0) if (r.x0 <= x && r.x1 > x) t += k[0] === 'G' ? 2.4 : (units[unitIdx.get(k)]?.dmin || 0); if (t > D + 1e-6) return false; }
    return true;
  };
  const shapesFor = u => { if (u.key === 'LK') return [[1, 1], [1, 2], [2, 1]]; const s = []; for (const [w, h] of [[1, 1], [1, 2], [2, 1], [1, 3], [3, 1], [2, 2]]) { const n = w * h; if (n > u.maxCells) continue; const ratio = n * cellA / u.area; if (ratio >= (n === 1 ? .4 : .55) && ratio <= (n === 1 ? 3.2 : 2.2)) s.push([w, h]); } return s.length ? s : [[1, 1]]; };
  // القيود الصلبة على توزيع كامل
  const check = () => {
    const R = Object.fromEntries(place), gs = [...place.keys()].filter(k => k[0] === 'G').map(k => R[k]);
    const touch = (a, b) => (Array.isArray(b) ? b : [b]).some(k => k === 'S*' ? keys.filter(x => x[0] === 'S').some(s => adjLen(R[a], R[s]) > 0) : R[k] && adjLen(R[a], R[k]) > 0);
    for (const r of rel) {
      if (!r.hard) continue;
      if (r.a === 'S*') { const ss = keys.filter(x => x[0] === 'S'); if (r.kind === 'back' && !ss.some(s => R[s].y1 === nr)) return null; if (r.kind === 'front' && !ss.some(s => R[s].y0 === 0)) return null; continue; }
      const A = R[r.a]; if (!A) continue;
      if (r.kind === 'front' && A.y0 !== 0) return null;
      if (r.kind === 'back' && A.y1 !== nr) return null;
      if (r.kind === 'notFront' && A.y0 === 0) return null;
      if (r.kind === 'frontOrSide' && !(A.y0 === 0 || ((A.x0 === 0 || A.x1 === nc) && A.y0 <= 1))) return null;
      if (r.kind === 'touch' && !touch(r.a, r.b)) return null;
      if (r.kind === 'light') { const sides = bnd(A, nc, nr).filter(s => s !== 'y0' || !['H'].includes(r.a)); if (!sides.length && !gs.some(g => adjLen(A, g) > 0)) return null;
        // الصالة: ضوء غير الشارع (نافذة الصالة على الشارع عيب خصوصية)، ولا تكفي حافة ضيقة
        if (r.a === 'H' && !sides.length && !gs.some(g => adjLen(A, g) > 0)) return null; }
    }
    // الحديقة: الحوش المغلق يحيط به المبنى؛ والحديقة على الحد مكشوفة. لا حديقة في الصف الأمامي بعرض خلية (فناء أمامي ميت) إلا إن لامست جانبًا
    for (const g of gs) if (g.y0 === 0 && g.x0 !== 0 && g.x1 !== nc) return null;
    // الشبكة المقصلية (يمكن قطعها خطوطًا كاملة) وإلا لا تُحل
    if (!guillotine(Object.values(R), { x0: 0, y0: 0, x1: nc, y1: nr })) return null;
    return { nc, nr, R: { ...R } };
  };
  rec();
  return { layouts: out, nodes, exhausted: nodes <= budget };
}
/** هل يمكن قطع المنطقة بخطوط كاملة حتى تبقى مستطيلات الوحدات (تقسيم مقصلي)؟ يعيد شجرة القطع أو null. */
export function guillotine(rects, reg, order = 'xy') {
  const inside = rects.filter(r => r.x0 >= reg.x0 && r.x1 <= reg.x1 && r.y0 >= reg.y0 && r.y1 <= reg.y1);
  if (inside.length === 1) return { leaf: inside[0] };
  const tryX = () => { for (let x = reg.x0 + 1; x < reg.x1; x++) if (inside.every(r => r.x1 <= x || r.x0 >= x)) { const a = guillotine(inside, { ...reg, x1: x }, order), b = guillotine(inside, { ...reg, x0: x }, order); if (a && b) return { dir: 'x', at: x, k: [a, b] }; } return null; };
  const tryY = () => { for (let y = reg.y0 + 1; y < reg.y1; y++) if (inside.every(r => r.y1 <= y || r.y0 >= y)) { const a = guillotine(inside, { ...reg, y1: y }, order), b = guillotine(inside, { ...reg, y0: y }, order); if (a && b) return { dir: 'y', at: y, k: [a, b] }; } return null; };
  return order === 'xy' ? tryX() || tryY() : tryY() || tryX();
}

// ---------------------------------------------------------------------------------------------- (4) التفضيلات والتنوع
function softScore(L, rel, units) {
  const { R, nc, nr } = L, keys = Object.keys(R), gs = keys.filter(k => k[0] === 'G').map(k => R[k]);
  let s = 0;
  const touch = (a, b) => b === 'G' ? gs.some(g => adjLen(R[a], g) > 0) : b === 'S*' ? keys.filter(x => x[0] === 'S').some(k => adjLen(R[a], R[k]) > 0) : R[b] && adjLen(R[a], R[b]) > 0;
  for (const r of rel) {
    if (r.hard || !R[r.a]) continue;
    if (r.kind === 'notFront' && R[r.a].y0 === 0) s -= r.w;
    if (r.kind === 'apart' && touch(r.a, r.b)) s -= r.w;
    if (r.kind === 'touch' && touch(r.a, r.b)) s += r.w;
  }
  // الحوش الداخلي المغلق والحديقة الخلفية مزيّة مناخية؛ والمساحة التي تأخذها الحدائق من الشبكة كلفة
  for (const g of gs) { const enclosed = !bnd(g, nc, nr).length; s += enclosed ? .6 : g.y1 === nr ? .4 : .1; s -= .25 * (g.x1 - g.x0) * (g.y1 - g.y0); }
  // التناسب: كل خلية تمثل ≈ مساحة متقاربة — وحدة كبيرة في خلية واحدة ووحدة صغيرة في خليتين = بعد عن التوازن
  const cellA = sum(units.filter(u => !u.optional).map(u => u.area)) / (nc * nr - gs.length - (R.LK ? 1 : 0));
  for (const u of units) { const r = R[u.key]; if (!r || u.optional) continue; const n = (r.x1 - r.x0) * (r.y1 - r.y0); s -= .35 * Math.abs(Math.log((u.area / n) / cellA)); }
  if (R.LK) s -= .8; // رواق وصل كلفة حركة
  return s;
}
/** بصمة التنظيم: أزواج التجاور بين الوحدات ومواضعها الطولية (أمام/وسط/خلف) — مستقلة عن الانعكاس. */
function signature(L) {
  const { R, nc, nr } = L, keys = Object.keys(R).sort(), pairs = [];
  const nm = k => (k[0] === 'G' ? (bnd(R[k], nc, nr).length ? 'G' : 'C') : k[0] === 'S' ? 'S' : k);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (adjLen(R[keys[i]], R[keys[j]]) > 0) pairs.push([nm(keys[i]), nm(keys[j])].sort().join('-'));
  const depth = keys.filter(k => k[0] !== 'G').map(k => nm(k) + (R[k].y0 === 0 ? 'f' : R[k].y1 === nr ? 'b' : 'm') + (R[k].y1 - R[k].y0 === nr ? 'F' : '')).sort();
  return new Set([...pairs, ...depth]);
}
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return 1 - i / (a.size + b.size - i || 1); };
/** الصورة المعكوسة (يمين↔يسار) للتوزيع نفسه — لا تُعد تنظيمًا جديدًا. */
const mirrorKey = L => { const { R, nc } = L; const f = r => `${nc - r.x1},${r.y0},${nc - r.x0},${r.y1}`; return Object.keys(R).filter(k => k[0] !== 'G').sort().map(k => k + ':' + f(R[k])).join('|'); };
const plainKey = L => Object.keys(L.R).filter(k => k[0] !== 'G').sort().map(k => { const r = L.R[k]; return `${k}:${r.x0},${r.y0},${r.x1},${r.y1}`; }).join('|');

/** يختار حتى n توزيعات بالتفضيل والتنوع (أدنى بعد جاكارد عن المختار ≥ minD)، بلا انعكاسات. */
export function pickLayouts(layouts, rel, units, n, minD = .22) {
  const seen = new Set(), pool = [];
  for (const L of layouts) { const k = plainKey(L); if (seen.has(k) || seen.has(mirrorKey(L))) continue; seen.add(k); L.score = softScore(L, rel, units); L.sig = signature(L); pool.push(L); }
  pool.sort((a, b) => b.score - a.score);
  const out = [];
  for (const L of pool) { if (out.length >= n) break; if (out.every(o => jaccard(o.sig, L.sig) >= minD)) out.push(L); }
  return { picked: out, distinctTopologies: pool.length };
}

// ---------------------------------------------------------------------------------------------- (5) من التوزيع إلى شجرة
/** أنواع جناح النوم الممكنة في مستطيله: c جهة الصالة، lit جهات الضوء. يعيد [{ tag, tree }]. */
function sleepVariants(blocks, c, lit, idx) {
  const m = blocks.find(b => b.master) || null, rest = blocks.filter(b => b !== m);
  const along = c === 'y0' || c === 'y1' ? 'y' : 'x'; // الممر عموديًا على حد الصالة
  const sA = along === 'y' ? ['x0', 'x1'] : ['y0', 'y1'];
  const run = list => sum(list.map(b => K.runOf(b) + .15));
  const corr = () => C('corr' + idx, { fix: 1.5, area: 14 });
  const L = (list, door, deep = false) => { const z = Z(list, door, along);
    if (deep) z.minCross = Math.max(...list.map(b => (b.kind === 'suite' && b.bath ? (b.master ? 5.9 : 5.3) : 0)));
    else z.runMin = Object.fromEntries(list.map(b => [b.id, K.suiteRun(b, 0)])); // الحمام بجانب الغرفة: امتدادها على الممر = عرض الغرفة + الحمام
    return z; };
  const out = [];
  const withM = (node, mm) => { if (!mm) return node; const mz = Z([mm], along === 'y' ? (c === 'y0' ? 'y0' : 'y1') : (c === 'x0' ? 'x0' : 'x1'), along === 'y' ? 'x' : 'y');
    // الرئيسية في الطرف البعيد عن الصالة
    return along === 'y' ? (c === 'y0' ? Y(node, mz) : Y(mz, node)) : (c === 'x0' ? X(node, mz) : X(mz, node)); };
  const mk = (a, b) => (along === 'y' ? X(a, b) : Y(a, b));
  const mk3 = (a, b, d) => (along === 'y' ? X(a, b, d) : Y(a, b, d));
  // (أ) ممر جانبي والغرف على جهة الضوء
  // (الغرفة «عميقة»: حمامها بينها وبين الممر فيقصر امتدادها على الممر؛ أو «جانبية»: حمامها بجانبها — أيهما يتسع)
  for (const deep of [false, true]) for (const [side, exL] of [[sA[0], sA[1]], [sA[1], sA[0]]]) {
    if (!lit.includes(exL)) continue;
    const list = m && rest.length >= 2 ? rest : blocks, mm = m && rest.length >= 2 ? m : null;
    if (run(list) > K.CORR_SINGLE_HARD - .2 || !list.length) continue;
    const node = side === sA[0] ? mk(corr(), L(list, side, deep)) : mk(L(list, side, deep), corr());
    out.push({ tag: (deep ? 'C' : 'c') + (side === sA[0] ? 'a' : 'b'), tree: withM(node, mm) });
  }
  // (ب) ممر أوسط والغرف على جانبيه (جهتا الضوء متقابلتان)
  if (lit.includes(sA[0]) && lit.includes(sA[1]) && rest.length >= 2) {
    const h = Math.ceil(rest.length / 2), A = rest.slice(0, h), B = rest.slice(h);
    if (Math.max(run(A), run(B)) <= K.CORR_SINGLE_HARD - .2) out.push({ tag: 'p', tree: withM(mk3(L(A, sA[1]), corr(), L(B, sA[0])), m) });
  }
  // (ج) الغرف على الصالة مباشرة (بلا ممر) — ثلاث غرف فأقل، والضوء في الجهة المقابلة للصالة
  // (د) رواق موازٍ لحد الصالة يلاصقها، والغرف صفًا خلفه على جهة الضوء المقابلة، والرئيسية في طرف الرواق بعمق الجناح كله
  if (lit.includes(OPP[c])) {
    const par = along === 'y' ? 'x' : 'y', list = m && rest.length >= 2 ? rest : blocks, mm = m && rest.length >= 2 ? m : null;
    if (run(list) <= K.CORR_SINGLE_HARD - .2 && list.length) {
      const g = C('gal' + idx, { fix: 1.5, area: 12 }), row = Z(list, c, par); if (row.runMin === undefined) row.runMin = Object.fromEntries(list.map(b => [b.id, K.suiteRun(b, 0)]));
      const band = par === 'x' ? (c === 'y0' ? Y(g, row) : Y(row, g)) : (c === 'x0' ? X(g, row) : X(row, g));
      if (!mm) out.push({ tag: 'g', tree: band });
      else for (const end of [0, 1]) { const mz = Z([mm], par === 'x' ? (end ? 'x0' : 'x1') : (end ? 'y0' : 'y1'), par === 'x' ? 'y' : 'x'); out.push({ tag: 'g' + end, tree: par === 'x' ? (end ? X(band, mz) : X(mz, band)) : (end ? Y(band, mz) : Y(mz, band)) }); }
    }
  }
  // (الرئيسية لا تُفتح على الصالة عبر غرفة ملابسها — MASTER_VIA_DRESS: هذا النوع لغرف الأبناء وحدها)
  if (blocks.length <= 3 && !m && lit.includes(OPP[c])) out.push({ tag: 'd', tree: Z(blocks, c, along === 'y' ? 'x' : 'y') });
  return out;
}
/** يحوّل توزيعًا على الشبكة إلى أشجار تقسيم (بأنواع جناح النوم الممكنة). */
export function layoutTrees(L, units, P, { gardenA = 30 } = {}) {
  const { R, nc, nr } = L, U = new Map(units.map(u => [u.key, u]));
  // ترتيبا القطع (أعمدة أولًا: الأعمدة تتشارك عرضها بطول المبنى؛ صفوف أولًا: كل صف يوزّع عرضه مستقلًا) — الترتيب نفسه، وأبعاد مقترنة مختلفة
  const cuts = [guillotine(Object.values(R), { x0: 0, y0: 0, x1: nc, y1: nr }, 'xy'), guillotine(Object.values(R), { x0: 0, y0: 0, x1: nc, y1: nr }, 'yx')].filter(Boolean);
  if (!cuts.length) return [];
  if (cuts.length === 2 && JSON.stringify(cuts[0]) === JSON.stringify(cuts[1])) cuts.pop();
  const keyOf = r => Object.keys(R).find(k => R[k] === r);
  const gs = Object.keys(R).filter(k => k[0] === 'G').map(k => R[k]);
  const litSides = r => [...bnd(r, nc, nr), ...['x0', 'x1', 'y0', 'y1'].filter(s => gs.some(g => sideTo(r, g) === s))];
  const doorTo = (r, ks) => { for (const k of ks) if (R[k] && adjLen(r, R[k]) > 0) return sideTo(r, R[k]); return 'y1'; };
  const leafFixed = (k, r) => {
    const u = U.get(k);
    if (k[0] === 'G') { const enclosed = !bnd(r, nc, nr).length; return enclosed ? COURT(Math.max(K.COURT_MIN ** 2 + 1, gardenA * .6)) : VOID(gardenA * .6); }
    // المدخل: بهو صغير بجانبه فناء مدخل اختياري (يمتص عرض الخلية فلا يتضخم البهو)
    if (u.circ === 'foyer') { const f = C('foyer', P.dayWc ? { area: K.FOYER_WC_AREA, wc: true } : { area: T.foyer * .85 }); return R.M && sideTo(r, R.M) === 'x0' ? X(f, OV(6)) : X(OV(6), f); }
    if (u.circ === 'hall') { const h0 = C('hall', { area: P.hallArea }), ex = bnd(r, nc, nr).filter(sd => sd !== 'y0');
      // دورة مياه العائلة بالبناء (FAMILY_WC): في البرنامج دورة مياه يومية افتراضية — تُوضع بجانب الصالة على جهتها الداخلية وبابها منها
      const inner = ['x0', 'x1'].find(sd => !bnd(r, nc, nr).includes(sd));
      const h = P.dayWc && !R14_OFF_V3.has('r20daywc') ? (inner === 'x0' ? X(Z([DAY_WC], 'x1', 'y'), h0) : inner === 'x1' ? X(h0, Z([DAY_WC], 'x0', 'y')) : Y(h0, Z([DAY_WC], 'y0', 'x'))) : h0;
      // الصالة على حد خارجي: حديقة اختيارية على تلك الجهة تمتص فائض الخلية (لا صالة ممتدة) وتطل عليها
      return ex.includes('y1') ? Y(h, OV(10)) : ex.includes('x1') ? X(h, OV(10)) : ex.includes('x0') ? X(OV(10), h) : h; }
    if (u.circ === 'stair') return C('stair', { fix: 3.7, area: 3.8 * 3.7 });
    if (u.circ === 'link') { const vert = (r.y1 - r.y0) >= (r.x1 - r.x0); const lk = C('link', { fix: 1.8, area: 8 }); return vert ? X(OV(6), lk, OV(6)) : Y(OV(6), lk, OV(6)); }
    const d = k === 'M' ? 'y1' : k === 'W' ? doorTo(r, ['F']) : k === 'DN' ? doorTo(r, ['H', 'F', 'M']) : k === 'KS' ? doorTo(r, ['DN', 'H']) : doorTo(r, ['F', 'H']);
    const z = Z(u.blocks, d, d === 'y0' || d === 'y1' ? 'x' : 'y');
    // المجلس: عرض صافٍ ≥ 4.2 م بجدرانه (قيمة الميزان) — أدنى امتداده في الاتجاهين، لا تقدير 4 م العام
    if (k === 'M' || k === 'W') { z.minCross = 4.45; z.runMin = Object.fromEntries(u.blocks.map(b => [b.id, majRun(b)])); }
    // فراغ خارجي اختياري على جهة خارجية (غير الشارع): يمتص فرق الأبعاد بين الوحدات المقترنة في صف أو عمود فيصير ارتدادًا/حديقة صغيرة،
    // أو يختفي إن قل عن 2.4 م — بدل أن يتضخم المجلس أو الطعام أو المطبخ لملء الخلية
    const ex = bnd(r, nc, nr).filter(sd => sd !== 'y0');
    if (k !== 'M' && ex.includes('y1')) return Y(z, OV(8));
    if (ex.includes('x0')) return X(OV(8), z);
    if (ex.includes('x1')) return X(z, OV(8));
    return z;
  };
  // أنواع النوم لكل جناح: حاصل ضرب صغير (حتى 4 أشجار لكل توزيع)
  const sleepKeys = Object.keys(R).filter(k => k[0] === 'S');
  const sv = sleepKeys.map((k, i) => { const r = R[k], c = doorTo(r, ['H']); const v = sleepVariants(U.get(k).blocks, c, litSides(r), String.fromCharCode(65 + i)); return v.length ? v : null; });
  if (sv.some(v => !v)) return [];
  const combos = []; const rec = (i, acc) => { if (combos.length >= 6) return; if (i === sv.length) { combos.push(acc); return; } for (const v of sv[i]) rec(i + 1, [...acc, v]); }; rec(0, []);
  return cuts.flatMap((cut, ci) => combos.map(cmb => {
    const leaf = r => { const k = keyOf(r); const si = sleepKeys.indexOf(k); return si >= 0 ? K.cloneTree(cmb[si].tree) : leafFixed(k, r); };
    const build = n => (n.leaf ? leaf(n.leaf) : n.dir === 'x' ? X(build(n.k[0]), build(n.k[1])) : Y(build(n.k[0]), build(n.k[1])));
    return { tree: build(cut), vtag: (ci ? 'h' : 'v') + cmb.map(c => c.tag).join('') };
  }));
}

/**
 * تشوه الأبعاد المتوقع لشجرة قبل البحث: تُحل بأوزانها الابتدائية على أغلفة بنسب مختلفة داخل الأرض، ويُقاس بعد مساحة كل فراغ عن هدفه
 * (لوغاريتميًا) ونسبته — شجرة تقرن مجلسًا بعرض جناح نوم كامل (مجلس بثلاثة أضعاف مساحته) تُستبعد قبل أن تستهلك البحث.
 */
export function distortion(tree, P, W, D) {
  const A = (sum(P.blocks.map(b => b.area)) + P.hallArea + 9) * 1.18;
  let best = Infinity;
  for (const rho of [.6, .8, 1, 1.25, 1.6]) {
    let ew = Math.sqrt(A / rho), ed = rho * ew; if (ew > W) { ew = W; ed = A / W; } if (ed > D) { ed = D; ew = Math.min(W, A / D); }
    ew = Math.max(ew, K.minExt(tree, 'x')); ed = Math.max(ed, K.minExt(tree, 'y')); if (ew > W + 1e-6 || ed > D + 1e-6) continue;
    // بالأوزان الابتدائية، ثم بأوزان مضطربة حتميًا (بعض الأشجار لا تُحل بأوزان المساحة وحدها: الغرفة الجانبية أطول من تقديرها)
    let sol = K.solve(K.cloneTree(tree), ew, ed);
    for (let j = 1; !sol && j <= 6; j++) { const tr = K.cloneTree(tree); let q = j; (function walk(n) { if (n.w) n.w = n.w.map((w, i) => w * (1 + .45 * Math.sin(q * 7.3 + i * 3.1))); q += 1.7; if (n.k) n.k.forEach(walk); })(tr); sol = K.solve(tr, ew, ed); }
    if (!sol) continue;
    let d = 0, n = 0;
    for (const p of sol.placed) { const a = (p.r.x1 - p.r.x0) * (p.r.y1 - p.r.y0), s = Math.min(p.r.x1 - p.r.x0, p.r.y1 - p.r.y0), l = Math.max(p.r.x1 - p.r.x0, p.r.y1 - p.r.y0); d += Math.abs(Math.log(a / p.block.area)) + .5 * Math.max(0, l / s - 2.2); n++; }
    const h = sol.circ.find(c => c.id === 'hall'); if (h) { const a = (h.r.x1 - h.r.x0) * (h.r.y1 - h.r.y0); d += Math.abs(Math.log(a / P.hallArea)); n++; }
    best = Math.min(best, d / Math.max(1, n));
  }
  return best;
}
/** أدنى امتداد المجلس على طوله: 4.2 م صافيًا بجدرانه، ومعه شريط الدهليز ودورة المياه للمجلس الذي له دورة مياه (فلا يُفتح الباب الخارجي على المجلس) */
const majRun = b => 4.45 + (b.guestWc ? (T.guestStripW || 1.5) : 0);
/** حدود دنيا آمنة لعرض كل وحدة وعمقها (أصغر ما في أشجارها الممكنة بكل اتجاه) — للتقليم بالأبعاد في بحث القيود. */
export function unitMins(units, P) {
  const all = ['x0', 'x1', 'y0', 'y1'];
  for (const u of units) {
    let trees = [];
    if (u.circ === 'foyer') trees = [C('foyer', { area: 8 })];
    else if (u.circ === 'hall') trees = [C('hall', { area: P.hallArea })];
    else if (u.circ === 'stair') trees = [C('stair', { area: 14 })];
    else if (u.circ === 'link') { u.wmin = 1.8; u.dmin = 1.8; continue; }
    else if (u.sleep) trees = ['y0', 'x0'].flatMap(c => sleepVariants(u.blocks, c, all, 'm').map(v => v.tree));
    else { trees = [Z(u.blocks, 'y1', 'x'), Z(u.blocks, 'x1', 'y')]; if (u.key === 'M' || u.key === 'W') for (const z of trees) { z.minCross = 4.45; z.runMin = Object.fromEntries(u.blocks.map(b => [b.id, majRun(b)])); } }
    u.wmin = trees.length ? Math.min(...trees.map(t => K.minExt(t, 'x'))) : 0; u.dmin = trees.length ? Math.min(...trees.map(t => K.minExt(t, 'y'))) : 0;
  }
  return units;
}
/** وصف عربي للتنظيم المركّب من مواضع وحداته (يُعرض للعميل ملخصًا). */
export function describeLayout(L) {
  const { R, nc, nr } = L;
  const AR = { M: 'مجلس الرجال', W: 'مجلس النساء', DN: 'الطعام', KS: 'المطبخ والخدمة', XP: 'الفراغات العامة الإضافية', F: 'مدخل العائلة', H: 'الصالة', ST: 'الدرج', S1: 'النوم', S2: 'جناح النوم الثاني' };
  const row = k => (R[k].y0 === 0 ? 'أمامًا' : R[k].y1 === nr ? 'خلفًا' : 'في الوسط');
  const side = k => { const c = (R[k].x0 + R[k].x1) / 2; return c < nc / 2 - .01 ? 'على جانب' : c > nc / 2 + .01 ? 'على الجانب المقابل' : 'في المحور'; };
  const parts = Object.keys(R).filter(k => k[0] !== 'G' && AR[k]).map(k => `${AR[k]} ${row(k)} ${side(k)}`);
  const gs = Object.keys(R).filter(k => k[0] === 'G').map(k => (bnd(R[k], nc, nr).length ? 'حديقة' : 'حوش داخلي'));
  return 'تنظيم مركّب من علاقات البرنامج: ' + parts.join('، ') + (gs.length ? '، و' + gs.join(' و') : '') + (R.M && R.DN && adjLen(R.M, R.DN) > 0 ? '؛ الطعام يلاصق المجلس (مقلط)' : '');
}

// ---------------------------------------------------------------------------------------------- (6) مصدر الأشجار للمحرك الثاني
const ESC = s => { let h = 2166136261 >>> 0; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36).slice(0, 5); };
/** يُبنى مرة لكل طلب: الأشجار المركّبة (الأولى للبحث الأول، والباقية «late» للبحث الثاني) وسجل البحث. */
export function synthTrees(P, { W, D, stair = false, nFirst = 14, nLate = 14 } = {}) {
  const { units, rel } = unitsOf(P, { stair });
  unitMins(units, P);
  const log = { units: units.map(u => ({ key: u.key, zone: u.zone, area: Math.round(u.area) })), rel: rel.map(r => ({ ...r })), grids: [] };
  const all = [];
  for (const [nc, nr] of gridShapes(W, D, units.filter(u => !u.optional).length)) {
    const e = enumerateLayouts(units, rel, nc, nr, { W, D });
    log.grids.push({ nc, nr, valid: e.layouts.length, nodes: e.nodes, exhausted: e.exhausted });
    all.push(...e.layouts);
  }
  const gardenA = Math.max(24, Math.min(70, (sum(P.blocks.map(b => b.area)) + P.hallArea) * .14));
  // لكل توزيع: أشجاره التي تتسع بأدنى أبعادها في الأرض، وتشوه أبعادها المتوقع (فحص هندسي قبل البحث، لا بعده)؛ شجرتان على الأكثر بأقل تشوه
  const seen = new Set(), scored = []; let dimFail = 0;
  for (const L of all) {
    const k = plainKey(L); if (seen.has(k) || seen.has(mirrorKey(L))) continue; seen.add(k);
    const ts = layoutTrees(L, units, P, { gardenA }).map(t => ({ ...t, mw: K.minExt(t.tree, 'x'), md: K.minExt(t.tree, 'y') })).filter(t => t.mw <= W + 1e-6 && t.md <= D + 1e-6);
    if (!ts.length) { dimFail++; continue; }
    L.score = softScore(L, rel, units); L.sig = signature(L);
    scored.push({ L, ts, rank: L.score });
  }
  log.distinctTopologies = seen.size; log.dimFit = scored.length;
  // التشوه للأفضل تفضيلًا أولًا (ميزانية حتمية)
  scored.sort((a, b) => b.rank - a.rank);
  for (const S of scored.slice(0, 160)) { S.ts = S.ts.map(t => ({ ...t, dist: distortion(t.tree, P, W, D) })).filter(t => t.dist < 1.2).sort((a, b) => a.dist - b.dist).slice(0, 2); S.rank = S.ts.length ? S.L.score - 3 * S.ts[0].dist : -Infinity; }
  for (const S of scored.slice(160)) S.rank = -Infinity;
  const out = []; let nL = 0;
  scored.sort((a, b) => b.rank - a.rank);
  const chosen = [];
  for (const S of scored) { if (S.rank === -Infinity || chosen.length >= nFirst + nLate) break; if (chosen.every(o => jaccard(o.L.sig, S.L.sig) >= .15)) chosen.push(S); }
  for (const { L, ts: ts0 } of chosen) {
    if (nL >= nFirst + nLate) break;
    const ts = ts0;
    const mode = 'r3' + ESC(plainKey(L)); K.describeAs(mode, describeLayout(L));
    for (const t of ts) out.push({ mode, tag: mode.slice(2) + t.vtag, tree: t.tree, iters: K.DEEP_ITERS, tol: 4, late: nL >= nFirst, hardHall: !!P.men, hardLink: !!(P.guestLink && units.some(u => u.key === 'M') && units.some(u => u.key === 'DN')), v3: { grid: [L.nc, L.nr], R: L.R, score: Math.round(L.score * 100) / 100 } });
    nL++;
  }
  log.picked = nL; log.dimFail = dimFail;
  log.trees = out.length;
  return { trees: out, log };
}

// ---------------------------------------------------------------------------------------------- الدوران: طبقتان على الشبكة نفسها
/**
 * الدوران: الأرضي يُركّب بالوحدات نفسها ومعها الدرج (ST)، ثم يُركّب العلوي على الشبكة نفسها فوق الخلايا المبنية وحدها: الدرج في خليته
 * نفسها، والصالة العلوية تلامسه، وأجنحة النوم تلامسها ولها ضوء (خارج أو سطح مكشوف)، وما بقي سطح. الشجرة المشتركة تُقطع بخطوط لا تقطع
 * مستطيلًا في أي من الدورين (فالدرج والجدران الحاملة على خطوط واحدة)، وما لا يُقطع مشتركًا يُحل لكل دور داخل مستطيله (عقدة مزدوجة).
 */
export function synthTwoFloors(G, U, site, { nOut = 12 } = {}) {
  const gU = unitsOf(G, { stair: true }); unitMins(gU.units, G);
  const sleepU = [...(U.family || []), ...(U.wcs || []), ...U.suites];
  const uUnits = [{ key: 'UH', zone: 'family', circ: 'uhall', area: U.hallArea, light: true, maxCells: 2 }];
  if (sleepU.length) {
    const runAll = sum(sleepU.filter(b => !b.master).map(b => K.runOf(b) + .15));
    if (sleepU.length >= 4) { const m = sleepU.filter(b => b.master), o = sleepU.filter(b => !b.master), h = Math.ceil(o.length / 2);
      uUnits.push({ key: 'S1', sleep: true, blocks: o.slice(0, h), area: sum(o.slice(0, h).map(b => b.area)), light: true, maxCells: 2 }, { key: 'S2', sleep: true, blocks: [...o.slice(h), ...m], area: sum([...o.slice(h), ...m].map(b => b.area)), light: true, maxCells: 2 }); }
    else uUnits.push({ key: 'S1', sleep: true, blocks: sleepU, area: sum(sleepU.map(b => b.area)), light: true, maxCells: 3 });
  }
  unitMins(uUnits.map(u => ({ ...u, circ: u.circ === 'uhall' ? 'hall' : u.circ })), U).forEach((x, i) => { uUnits[i].wmin = x.wmin; uUnits[i].dmin = x.dmin; });
  const out = [], log = { grids: [] };
  const gardenA = 24;
  for (const [nc, nr] of gridShapes(site.W, site.D, gU.units.filter(u => !u.optional).length)) {
    const e = enumerateLayouts(gU.units, gU.rel, nc, nr, { W: site.W, D: site.D, budget: 600000 });
    const { picked } = pickLayouts(e.layouts, gU.rel, gU.units, 30, .15);
    let ok = 0;
    for (const L of picked) {
      if (out.length >= nOut * 2) break;
      const ups = upperLayouts(L, uUnits); log.ups = (log.ups || 0) + ups.length;
      // ترتيب العلوي بتراكب الجدران: أجنحة النوم فوق وحدات أرضية مقسّمة (الخدمة، الطعام، المجلسان) أو فوق جناح نوم أرضي، والصالة العلوية فوق
      // الصالة الأرضية أو المدخل — جدران العلوي على جدران الأرضي ما أمكن (التراكب يُقاس بعدها على المفصّل)
      const under = (r, ks) => { let n = 0, t = 0; for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) { t++; const g = Object.entries(L.R).find(([, q]) => x >= q.x0 && x < q.x1 && y >= q.y0 && y < q.y1)?.[0] || ''; if (ks.some(k => g.startsWith(k))) n++; } return t ? n / t : 0; };
      for (const Lu of ups) Lu.align = Object.entries(Lu.R).reduce((a, [k, r]) => a + (k[0] === 'S' ? under(r, ['KS', 'DN', 'S', 'W', 'M']) : k === 'UH' ? under(r, ['H', 'F', 'LK']) : 0), 0);
      ups.sort((a, b) => b.align - a.align);
      for (const Lu of ups.slice(0, 6)) {
        const tr = jointTree(L, Lu, gU.units, uUnits, G, U, gardenA, site); if (!tr) { log.noTree = (log.noTree || 0) + 1; continue; }
        if (K.minExt(tr, 'x') > site.W + 1e-6 || K.minExt(tr, 'y') > site.D + 1e-6) { log.dimFail = (log.dimFail || 0) + 1; (log.dimEx ||= []).length < 6 && log.dimEx.push([K.minExt(tr, 'x').toFixed(1), K.minExt(tr, 'y').toFixed(1), Object.entries(L.R).map(([k, r]) => k + r.x0 + r.y0 + r.x1 + r.y1).join(' '), Object.entries(Lu.R).map(([k, r]) => k + r.x0 + r.y0 + r.x1 + r.y1).join(' ')]); continue; }
        const mode = 'r3d' + ESC(plainKey(L) + '/' + plainKey(Lu));
        K.describeAs(mode, describeLayout(L)); K.describeAs(mode + ':up', 'العلوي مركّب من علاقاته: الصالة العلوية على الدرج وأجنحة النوم حولها، وما بقي فوق الأرضي سطح مكشوف');
        out.push({ mode, tag: mode.slice(3), org: 'rel', tree: tr, iters: K.DEEP_ITERS, tol: 4, note_ar: 'الدرج في موضعه للدورين، والصالة العلوية عليه، وأجنحة النوم حولها؛ التنظيم مركّب من علاقات البرنامج.' });
        ok++; if (ok % 2 === 0) break;
      }
    }
    log.grids.push({ nc, nr, ground: e.layouts.length, joint: ok });
  }
  return { trees: out.slice(0, nOut), log };
}
/** توزيعات العلوي على شبكة الأرضي: فوق الخلايا المبنية وحدها، والدرج في خليته. */
function upperLayouts(L, uUnits) {
  const { R, nc, nr } = L, N = nc * nr;
  const ground = new Array(N).fill(null);
  for (const [k, r] of Object.entries(R)) for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) ground[y * nc + x] = k;
  const st = R.ST; if (!st) return [];
  const grid = ground.map(k => (k && k[0] !== 'G' ? -1 : -2)); // -2: فوق حديقة/حوش (لا غرف)
  for (let y = st.y0; y < st.y1; y++) for (let x = st.x0; x < st.x1; x++) grid[y * nc + x] = 99;
  const place = new Map([['ST', st]]), out = []; let nodes = 0, tUsed = 0;
  const free = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= nc || y >= nr || grid[y * nc + x] !== -1) return false; return true; };
  const fill = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) grid[y * nc + x] = v; };
  const opens = () => { const v = []; for (let i = 0; i < N; i++) if (grid[i] === -2) { const x = i % nc, y = (i - x) / nc; v.push({ x0: x, y0: y, x1: x + 1, y1: y + 1 }); } return v; };
  const ok = () => {
    const Rr = Object.fromEntries(place), T0 = [...place.keys()].filter(k => k[0] === 'T').map(k => Rr[k]), voids = [...opens(), ...T0];
    const lit = r => bnd(r, nc, nr).length || voids.some(v => adjLen(r, v) > 0);
    if (!Rr.UH || !adjLen(Rr.UH, st)) return false;
    for (const u of uUnits) { const r = Rr[u.key]; if (!r) return false; if (u.sleep && !adjLen(r, Rr.UH)) return false; if (u.light && !lit(r)) return false; }
    return true;
  };
  const rec = () => {
    if (++nodes > 200000 || out.length >= 12) return;
    const c = grid.indexOf(-1);
    if (c < 0) { if (uUnits.every(u => place.has(u.key)) && ok()) out.push({ nc, nr, R: Object.fromEntries(place) }); return; }
    const x0 = c % nc, y0 = (c - x0) / nc;
    for (const u of uUnits.filter(u => !place.has(u.key))) for (const [w, h] of [[1, 1], [1, 2], [2, 1], [1, 3], [3, 1]].filter(([w, h]) => w * h <= u.maxCells)) {
      if (!free(x0, y0, w, h)) continue; const r = { x0, y0, x1: x0 + w, y1: y0 + h };
      fill(x0, y0, w, h, 1); place.set(u.key, r); rec(); place.delete(u.key); fill(x0, y0, w, h, -1);
    }
    if (tUsed < 3) { const r = { x0, y0, x1: x0 + 1, y1: y0 + 1 }; fill(x0, y0, 1, 1, 2); place.set('T' + tUsed, r); tUsed++; rec(); tUsed--; place.delete('T' + (tUsed)); fill(x0, y0, 1, 1, -1); }
  };
  rec();
  return out;
}
/** الشجرة المشتركة للدورين: قطوع مشتركة ثم عقد مزدوجة؛ الدرج ورقة مشتركة. */
function jointTree(L, Lu, gUnits, uUnits, G, U, gardenA, site = { W: 20, D: 20 }) {
  const cellW = site.W / L.nc, cellH = site.D / L.nr;
  const { nc, nr } = L, Ug = new Map(gUnits.map(u => [u.key, u])), Uu = new Map(uUnits.map(u => [u.key, u]));
  const gR = Object.entries(L.R).map(([k, r]) => ({ k, r })), uR = Object.entries(Lu.R).map(([k, r]) => ({ k, r }));
  // خلايا فوق الحديقة أو بلا وحدة علوية: «سطح» مفرد لكل خلية
  const cov = new Set(); for (const { r } of uR) for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) cov.add(y * nc + x);
  for (let i = 0; i < nc * nr; i++) if (!cov.has(i)) { const x = i % nc, y = (i - x) / nc; uR.push({ k: 'T~' + i, r: { x0: x, y0: y, x1: x + 1, y1: y + 1 } }); }
  const gLeaf = ({ k, r }) => {
    if (k === 'ST') return C('stair', { fix: 3.7, area: 3.8 * 3.7 });
    const u = Ug.get(k);
    if (k[0] === 'G') return bnd(r, nc, nr).length ? VOID(gardenA * .6) : COURT(Math.max(K.COURT_MIN ** 2 + 1, gardenA * .6));
    if (u.circ === 'foyer') return C('foyer', G.dayWc ? { area: K.FOYER_WC_AREA, wc: true } : { area: T.foyer * .85 });
    if (u.circ === 'hall') return C('hall', { area: G.hallArea });
    if (u.circ === 'link') return C('link', { area: 8 });
    const z = Z(u.blocks, k === 'M' ? 'y1' : 'x1', k === 'M' ? 'x' : 'y'); if (k === 'M' || k === 'W') { z.minCross = 4.45; z.runMin = Object.fromEntries(u.blocks.map(b => [b.id, majRun(b)])); }
    if (u.sleep) { const v = sleepVariants(u.blocks, 'y0', ['x0', 'x1', 'y0', 'y1'], 'g')[0]; return v ? v.tree : z; }
    return z;
  };
  const uLeaf = ({ k, r }) => {
    if (k === 'ST') return C('stair', { fix: 3.7, area: 3.8 * 3.7 });
    if (k[0] === 'T') return OV(6);
    if (k === 'UH') return C('hall', { area: U.hallArea });
    const u = Uu.get(k), c = sideTo(r, Lu.R.UH) || 'y0';
    const lit = [...bnd(r, nc, nr)];
    const vs = sleepVariants(u.blocks, c, lit.length ? lit : ['x0', 'x1', 'y0', 'y1'], k === 'S1' ? 'U' : 'V');
    // أنسب الأنواع لأبعاد الخلية التقريبية (لا الأول دائمًا)
    const cw = (r.x1 - r.x0) * cellW, ch = (r.y1 - r.y0) * cellH, v = vs.sort((a, b) => Math.max(K.minExt(a.tree, 'x') / cw, K.minExt(a.tree, 'y') / ch) - Math.max(K.minExt(b.tree, 'x') / cw, K.minExt(b.tree, 'y') / ch))[0];
    return v ? v.tree : Z(u.blocks, c, c[0] === 'y' ? 'x' : 'y');
  };
  const inR = (rs, reg) => rs.filter(({ r }) => r.x0 >= reg.x0 && r.x1 <= reg.x1 && r.y0 >= reg.y0 && r.y1 <= reg.y1);
  const sep = (rs, reg, leaf) => { const c = guillotine(rs.map(x => x.r), reg); if (!c) return null; const f = n => (n.leaf ? leaf(rs.find(x => x.r === n.leaf)) : n.dir === 'x' ? X(f(n.k[0]), f(n.k[1])) : Y(f(n.k[0]), f(n.k[1]))); return f(c); };
  const rec = reg => {
    const g = inR(gR, reg), u = inR(uR, reg);
    if (g.length === 1 && u.length === 1) { if (g[0].k === 'ST') return D2(gLeaf(g[0]), uLeaf(u[0])); return D2(gLeaf(g[0]), uLeaf(u[0])); }
    for (let x = reg.x0 + 1; x < reg.x1; x++) if ([...g, ...u].every(({ r }) => r.x1 <= x || r.x0 >= x)) { const a = rec({ ...reg, x1: x }), b = rec({ ...reg, x0: x }); if (a && b) return X(a, b); }
    for (let y = reg.y0 + 1; y < reg.y1; y++) if ([...g, ...u].every(({ r }) => r.y1 <= y || r.y0 >= y)) { const a = rec({ ...reg, y1: y }), b = rec({ ...reg, y0: y }); if (a && b) return Y(a, b); }
    if (g.some(x => x.k === 'ST')) return null; // الدرج لا يُحل منفصلًا في الدورين
    const a = sep(g, reg, gLeaf), b = sep(u, reg, uLeaf); return a && b ? D2(a, b) : null;
  };
  try { return rec({ x0: 0, y0: 0, x1: nc, y1: nr }); } catch { return null; }
}

// ---------------------------------------------------------------------------------------------- الواجهة
/** مصدر الأشجار (withTreeSource): للدور الواحد الأشجار المركّبة؛ والدوران يُترك للمحرك الثاني إلى أن يُدعم (يُذكر). */
function source(log) {
  const memo = new Map();
  return {
    tag: VILLA_V3_ENGINE_VERSION,
    buildMax: 30, spare: 3,
    tfTrees: (G, U, site) => {
      if (!site) return null;
      const r = synthTwoFloors(G, U, site); log.twoFloors = r.log;
      const lib = V2.withTreeSource(null, () => V2.tfTreesLib(G, U, site));
      return [...r.trees, ...lib];
    },
    trees: (P, opts) => {
      const { stair, W, D } = opts;
      if (stair) return null; // الدوران: أشجار المحرك الثاني (tfTrees/الأرضي بالسلم) في هذا الإصدار
      const k = `${W.toFixed(2)}x${D.toFixed(2)}|${P.blocks.map(b => b.id + ':' + Math.round(b.area)).join(',')}`;
      if (!memo.has(k)) {
        const r = synthTrees(P, { W, D }); Object.assign(log, r.log);
        // فضاء البحث = التنظيمات المركّبة من العلاقات ∪ مكتبة الخبرة (أنماط المحرك الثاني) — كلها تمر بالقيود والبوابات نفسها
        const lib = V2.withTreeSource(null, () => V2.partiTrees(P, opts));
        log.library = lib.length; log.synth = r.trees.length;
        memo.set(k, [...r.trees, ...lib]);
      }
      return memo.get(k).map(t => ({ ...t, tree: K.cloneTree(t.tree) }));
    },
  };
}
function attach(out, feas, log) {
  if (!out) return out;
  out.engine3 = { version: VILLA_V3_ENGINE_VERSION, feasibility: feas, search: log };
  return out;
}
/** دور واحد. يكشف الاستحالة أولًا؛ ثم يولّد بالمصدر المركّب. أي فشل يُعاد خطأً يحمل تقريرًا عربيًا (لا نتيجة فارغة بلا تفسير). */
export function generateVillaDesigns(args) {
  const feas = analyzeFeasibility(args);
  if (!feas.feasible) { const e = Error(feas.report_ar); e.code = 'VILLA_INFEASIBLE'; e.feasibility = feas; throw e; }
  const log = {};
  try {
    const out = V2.withTreeSource(source(log), () => V2.generateVillaDesigns(args));
    return attach(out, feas, log);
  } catch (e) { e.feasibility = feas; e.search = log; e.report_ar = failureReport(e, feas, log); throw e; }
}
export function generateVillaTwoFloors(args) {
  const feas = analyzeFeasibility({ ...args, land: { ...args.land, floors: 2 } });
  if (!feas.feasible) { const e = Error(feas.report_ar); e.code = 'VILLA_INFEASIBLE'; e.feasibility = feas; throw e; }
  const log = {};
  try { return attach(V2.withTreeSource(source(log), () => V2.generateVillaTwoFloors(args)), feas, log); }
  catch (e) { e.feasibility = feas; e.search = log; e.report_ar = failureReport(e, feas, log); throw e; }
}
/** تقرير عربي حين لا يُنتج أي بديل: ما الذي جُرّب، وما الذي تعارض، وما الذي يمكن تغييره. */
export function failureReport(e, feas, log) {
  const lines = ['لم يُنتج المحرك أي بديل سليم لهذا الطلب على هذه الأرض.'];
  if (log?.grids?.length) lines.push(`جُرّبت ${log.grids.map(g => `شبكة ${g.nc}×${g.nr} (${g.valid} توزيعًا يحقق القيود الصلبة)`).join('، ')}، واختير منها ${log.picked || 0} تنظيمًا مختلفًا للأبعاد.`);
  if (log?.grids?.length && log.grids.every(g => !g.valid)) lines.push('لا توزيع يحقق القيود الصلبة معًا على هذه الأرض: ' + (log.rel || []).filter(r => r.hard && r.client).map(r => r.ar).join('، ') || '');
  if (feas?.warnings?.length) lines.push('ملاحظات قبل التوليد: ' + feas.warnings.map(w => w.ar).join('؛ '));
  lines.push('السبب من المولّد: ' + String(e.message || e));
  lines.push('ما يمكن تغييره: ' + (feas?.options_ar?.length ? feas.options_ar.join('؛ ') : 'تقليل عدد الغرف أو مساحاتها، أو دور ثانٍ، أو تخفيف بند موضع صريح.'));
  return lines.join('\n');
}
export default { generateVillaDesigns, generateVillaTwoFloors, synthTrees, unitsOf, enumerateLayouts, guillotine, VILLA_V3_ENGINE_VERSION };
