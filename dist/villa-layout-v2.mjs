// مولّد الفيلا — الإصدار الثاني (أنماط تنظيمية حقيقية بدل قوالب تُعكس).
// الفكرة كما في أدوات التوليد الرائدة وأبحاثه (مخطط تجاور بين الفراغات، توليد مرشحين كثر، فحص حتمي، عرض الناجح فقط):
//   (1) مناطق: عامة (مجلس الرجال بمدخله، مجلس النساء، دورات الضيوف، الطعام للضيافة)، عائلية (الصالة، الطعام، المطبخ)،
//       خاصة (غرف النوم والرئيسية)، خدمة (الخادمة، الغسيل، المخزن، باب الخدمة). مسار الضيف لا يمر بالعائلة.
//   (2) أنماط تنظيمية مختلفة بالطوبولوجيا لا بالانعكاس: حوش داخلي، L، U، رواق/ممر طولي، كتلتان (عامة/خاصة)، صالة مركزية
//       مدمجة، صفوف عرضية. كل نمط شجرة تقسيم (slicing tree) أوراقها مناطق أو حركة أو حوش أو فراغ خارجي.
//   (3) أبعاد كل شجرة تُحل ببحث محلي حتمي (أوزان التقسيم وغلاف المبنى) على دالة جزاء: المساحات، النسب، الحدود الدنيا،
//       الواجهة الخارجية لكل فراغ معيشي، التجاور المطلوب والممنوع، وقواعد العميل (rulePenalty).
//   (4) الصالة غرفة حقيقية (عرض ≥ 4.2 م ونسبة ≤ 2.5)، والممرات عناصر مستقلة تُحسب في نسبة الحركة.
//   (5) الأرض مستطيل (عرض × طول) أو مضلع نقاط؛ الارتدادات تُطبَّق إزاحةً داخل المضلع والمبنى داخله فعلًا.
//   (6) مرشحون كثر ← بوابات صارمة (مستند سليم، كل فراغ يُوصل إليه، نوافذ للفراغات المأهولة، الصالة غرفة) ← اختيار
//       بدائل بأقصى اختلاف تنظيمي بالمقياس نفسه المستعمل في أدلة القبول (difference).
// المستند الناتج بصيغة mizan-draw/1 نفسها (+x شرق، +y شمال) فيعمل معه المرسم والعرض ثلاثي الأبعاد والتحليل كما هي.
// المقاسات المستهدفة افتراضات تصميمية من التطبيق قابلة للضبط، وليست اشتراطات نظامية. نقي: لا DOM ولا تخزين ولا شبكة.
import { createDoc, applyCommand, parseDoc } from './draw/doc.mjs';
import { footprint, validatePlot } from './planner.mjs';
import { buildProgram, checkDoc, relaxFixtures, quality, DESIGN_TARGETS, canonicalSide } from './villa-layout.mjs';
import { rulePenalty, verifyRequest, docRooms, blocksFor } from './rules.mjs';
import { reviewDoc } from './draw/review.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { reviewDesign } from './plan-review.mjs';

export const VILLA_V2_ENGINE_VERSION = 'villa-v2-partis-1';
const LV = 'L1', SNAP = .05, EXT = .25, INT = .12, TOL = 1e-3;
const snap = v => Math.round(v / SNAP) * SNAP;
const r2 = v => Math.round(v * 100) / 100;
const sum = a => a.reduce((s, v) => s + v, 0);
const W_ = r => r.x1 - r.x0, H_ = r => r.y1 - r.y0, A_ = r => W_(r) * H_(r);
const SIDES = ['x0', 'x1', 'y0', 'y1'];
const opp = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };
const isX = s => s === 'x0' || s === 'x1';
const sideLen = (r, s) => (isX(s) ? H_(r) : W_(r));
const edgeOf = (r, s) => (isX(s) ? { axis: 'x', at: r[s], from: r.y0, to: r.y1 } : { axis: 'y', at: r[s], from: r.x0, to: r.x1 });
const now = () => (globalThis.performance?.now ? performance.now() : Date.now());

/** الحد المشترك بين مستطيلين متلامسين (أو null). */
function shared(a, b) {
  for (const s of SIDES) {
    if (Math.abs(a[s] - b[opp[s]]) > TOL) continue;
    const e = edgeOf(a, s), o = edgeOf(b, opp[s]); const from = Math.max(e.from, o.from), to = Math.min(e.to, o.to);
    if (to - from > TOL) return { axis: e.axis, at: e.at, from, to, side: s };
  }
  return null;
}
const touch = (a, b) => { const e = shared(a, b); return e ? e.to - e.from : 0; };
function cut(r, side, t) {
  if (side === 'x0') return [{ ...r, x1: r.x0 + t }, { ...r, x0: r.x0 + t }];
  if (side === 'x1') return [{ ...r, x0: r.x1 - t }, { ...r, x1: r.x1 - t }];
  if (side === 'y0') return [{ ...r, y1: r.y0 + t }, { ...r, y0: r.y0 + t }];
  return [{ ...r, y0: r.y1 - t }, { ...r, y1: r.y1 - t }];
}
function split(strip, near, len) {
  if (near === 'x0') return [{ ...strip, x1: strip.x0 + len }, { ...strip, x0: strip.x0 + len }];
  if (near === 'x1') return [{ ...strip, x0: strip.x1 - len }, { ...strip, x1: strip.x1 - len }];
  if (near === 'y0') return [{ ...strip, y1: strip.y0 + len }, { ...strip, y0: strip.y0 + len }];
  return [{ ...strip, y0: strip.y1 - len }, { ...strip, y1: strip.y1 - len }];
}
/** أجزاء حافة المستطيل r على الجهة side التي لا يغطيها أي مستطيل صلب آخر (= تطل على الخارج أو على حوش). */
function exposed(r, side, solids) {
  const e = edgeOf(r, side); let segs = [[e.from, e.to]];
  for (const q of solids) {
    if (q === r || Math.abs(q[opp[side]] - r[side]) > TOL) continue;
    const a0 = isX(side) ? q.y0 : q.x0, a1 = isX(side) ? q.y1 : q.x1, nx = [];
    for (const [s, t] of segs) { if (a1 <= s + TOL || a0 >= t - TOL) { nx.push([s, t]); continue; } if (a0 > s + TOL) nx.push([s, a0]); if (a1 < t - TOL) nx.push([a1, t]); }
    segs = nx; if (!segs.length) break;
  }
  return segs.filter(([a, b]) => b - a > .05).map(([a, b]) => ({ axis: e.axis, at: e.at, from: a, to: b, side }));
}
const expLen = (r, solids, sides = SIDES) => sides.reduce((a, s) => a + sum(exposed(r, s, solids).map(e => e.to - e.from)), 0);

// ------------------------------------------------------------------------------------------ البرنامج
/** البرنامج نفسه في الإصدار الأول (توزيع دورات المياه والإضافات والمقاسات)، مع تجميعه في مناطق. */
export function programV2(counts, req = {}) {
  const P = buildProgram(counts, req), B = P.blocks;
  P.men = B.find(b => b.kind === 'majlis' && b.men) || null;
  P.women = B.filter(b => b.kind === 'majlis' && !b.men);
  P.dining = B.filter(b => b.kind === 'dining');
  P.kitchens = B.filter(b => b.kind === 'kitchen');
  P.maid = B.find(b => b.kind === 'maid') || null;
  if (P.maid && P.kitchenStrip?.includes('laundry')) P.maid.laundryName = 'مخزن الخدمة'; // الغسيل مطلوب شريطًا بجوار المطبخ
  P.driver = B.find(b => b.kind === 'driver') || null;
  P.office = B.find(b => b.kind === 'office') || null;
  P.prayer = B.find(b => b.kind === 'prayer') || null;
  P.guest = B.find(b => b.guest) || null;
  P.family = B.filter(b => b.kind === 'family');
  // ترتيب الأجنحة: كبار السن أقرب للصالة، ثم الأبناء، والرئيسية في الطرف الأبعد
  const su = B.filter(b => b.kind === 'suite' && !b.guest);
  P.suites = [...su.filter(b => b.elderly && !b.master), ...su.filter(b => !b.master && !b.elderly), ...su.filter(b => b.master)];
  // دورات المياه الزائدة عن الأجنحة والضيوف: فراغات حقيقية على الحركة (لا تُقتطع من الصالة لاحقًا)
  P.wcs = [];
  for (let i = 0; i < P.extraBaths; i++) { const b = { id: 'wc' + (i + 1), kind: 'wc', rank: 2, area: 4.6, name: 'دورة مياه' }; P.wcs.push(b); B.push(b); }
  P.extraBaths = 0;
  // أبعاد صريحة من كلام العميل (متطلبات الإصدار الثاني req.dims = { majlis:{w,l,tol}, kitchen:… })؛ إن غابت لا شيء
  P.dims = req.dims && typeof req.dims === 'object' ? req.dims : {};
  // المقاس الصريح يحدد مساحة الكتلة وأدنى امتدادها (لا يُترك للمساحة الافتراضية أن تسحب الفراغ بعيدًا عنه):
  // الصافي المطلوب + نصف جدار من كل جهة (+ شريط ممر الضيوف ودورة مياههم للمجلس، + شريط الحمام للجناح)
  for (const [key, dm] of Object.entries(P.dims)) {
    if (!dm || !(dm.w > 0 && dm.l > 0)) continue;
    const tol = Number.isFinite(dm.tol) ? dm.tol : .3, s = Math.min(dm.w, dm.l), l = Math.max(dm.w, dm.l);
    for (const b of dimBlocks(key, P)) {
      const T = DESIGN_TARGETS, core = (s + .2) * (l + .2);
      const strip = b.kind === 'majlis' && b.guestWc ? T.guestStripW * (l + .2) : b.kind === 'suite' && b.bath ? b.area - (b.master ? T.master : T.bedroom) : 0;
      b.area = core + strip; b.fixedArea = true; b.dimFix = { s: s + .2 - tol * .6, l: l + .2 - tol * .6 }; b.dimGross = { s: s + .2, l: l + .2 };
      if (b.kind === 'kitchen' && P.kitchenStrip?.length) b.noPantry = true; // المخزن مطلوب أصلًا شريطًا بجوار المطبخ
    }
  }
  P.tweaks = req.tweaks || {};
  P.zoneOf = b => (b.kind === 'majlis' || b.guest || b.kind === 'office' || b.kind === 'prayer' ? 'public' : b.kind === 'suite' ? 'private' : b.kind === 'maid' || b.kind === 'driver' ? 'service' : 'family');
  return P;
}

/** الكتل المقصودة بمفتاح مقاس صريح (req.dims): المجلس = مجلس الرجال (أو الأول)، المطبخ = الرئيسي… */
function dimBlocks(key, P) {
  const B = P.blocks;
  if (key === 'majlis') { const m = B.find(b => b.kind === 'majlis' && b.men) || B.find(b => b.kind === 'majlis'); return m ? [m] : []; }
  if (key === 'kitchen') return B.filter(b => b.id === 'kitchen1');
  if (key === 'dining') return B.filter(b => b.kind === 'dining');
  if (key === 'master') return B.filter(b => b.master);
  if (key === 'bedroom') return B.filter(b => b.kind === 'suite' && !b.master && !b.guest);
  return [];
}

// ------------------------------------------------------------------------------------------ شجرة التقسيم
// عقدة: { t:'x'|'y', k:[...], w:[...] } تقسيم أعمدة (x) أو صفوف من الأمام للخلف (y).
// أوراق: zone (كتل البرنامج على امتداد along، بابها نحو door)، circ (حركة: foyer/hall/corr/gallery/spine/link/stair)،
// court (حوش داخلي مكشوف محاط بالمبنى)، void (فراغ خارجي: حديقة في ركن L أو بين جناحي U).
const Z = (b, door, along) => ({ t: 'zone', b: b.filter(Boolean), door, along, w: b.filter(Boolean).map(() => 1) });
const C = (id, o = {}) => ({ t: 'circ', id, ...o });
const COURT = area => ({ t: 'court', area });
const VOID = area => ({ t: 'void', area });
/** فراغ خارجي اختياري في آخر جناح: يمتص فرق العمق بين الأجنحة فيصير حديقة/ركنًا خارجيًا، أو يختفي. */
const OV = (area = 6) => ({ t: 'void', area, opt: true });
function mk(t, kids) {
  const k = kids.filter(n => n && !(n.t === 'zone' && !n.b.length));
  if (!k.length) return null; if (k.length === 1) return k[0];
  for (const c of k) if (c.t === 'circ' && c.fix) c.fixDir = t;
  return { t, k, w: k.map(() => 1) };
}
const X = (...k) => mk('x', k), Y = (...k) => mk('y', k);
/** نسخة من الشجرة بأوزان ومراتب مستقلة (البحث يعدّلها) مع الإبقاء على كتل البرنامج نفسها. */
const cloneTree = n => { const c = n.t === 'zone' ? { ...n, b: [...n.b], w: [...n.w] } : n.k ? { ...n, k: n.k.map(cloneTree), w: [...n.w] } : { ...n }; delete c._mx; delete c._my; return c; };
/** هامش خارجي جانبي (يبقى خارج المبنى) بعرض أدنى 0.6 م؛ عرضه متغير بحث. */
const MARGIN = c => ({ t: 'void', area: Math.max(3, areaOf(c) * .05), min: .6, margin: true });
// أدنى امتداد لكل نوع: على امتداد الصف (run) وبالعمق (dep). افتراضات تصميمية.
const RUN = { store: 1.2, wc: 1.7, suite: 3.4, majlis: 4.0, dining: 3.2, kitchen: 3.3, family: 3.6, maid: 2.7, driver: 2.6, office: 2.8, prayer: 2.4 };
const DEP = { store: 1.2, wc: 1.9, suite: 3.4, majlis: 4.0, dining: 3.1, kitchen: 3.3, family: 3.4, maid: 2.6, driver: 2.6, office: 2.8, prayer: 2.4 };
const CMIN = { foyer: 2.4, hall: 4.2, stair: 2.6 };
// الجناح بحمام: عرض الغرفة (≥3.0) + شريط الحمام والخزانة (1.7–2.2) على امتداد الممر
const runOf0 = b => (b.kind === 'suite' && b.bath ? (b.master ? 4.2 : 3.7) : b.kind === 'maid' && b.bath ? 4.2 : RUN[b.kind] || 2.6);
const depOf0 = b => (b.kind === 'suite' ? (b.master ? 3.8 : 3.5) : DEP[b.kind] || 2.6);
// المقاس الصريح يرفع أدنى الامتداد إلى ضلعه الأقصر (لا يُخفض الحد التصميمي)
const runOf = b => Math.max(runOf0(b), b.dimFix && b.kind !== 'suite' ? b.dimFix.s : 0);
const depOf = b => Math.max(depOf0(b), b.dimFix && b.kind !== 'suite' ? b.dimFix.s : 0);
function minExt(n, dir) {
  // ثابت لكل عقدة أثناء البحث (لا يتغير بالأوزان ولا بترتيب الكتل داخل المنطقة): يُحفظ
  const key = dir === 'x' ? '_mx' : '_my'; if (n[key] !== undefined) return n[key];
  return (n[key] = minExt0(n, dir));
}
function minExt0(n, dir) {
  if (n.t === 'zone') return n.along === dir ? sum(n.b.map(runOf)) : Math.max(...n.b.map(depOf));
  if (n.t === 'circ') return n.fix && n.fixDir === dir ? n.fix : (CMIN[n.id] ?? 1.2);
  if (n.t === 'court') return 3.6;
  if (n.t === 'void') return n.opt ? 0 : n.min ?? 3.6; // حديقة صالحة للاستعمال لا شريط (والهامش على أرض غير منتظمة أضيق)
  return n.t === dir ? sum(n.k.map(c => minExt(c, dir))) : Math.max(...n.k.map(c => minExt(c, dir)));
}
function areaOf(n) {
  if (n.t === 'zone') return sum(n.b.map((b, i) => b.area * n.w[i]));
  if (n.t === 'circ' || n.t === 'court' || n.t === 'void') return n.area;
  return sum(n.k.map((c, i) => areaOf(c) * n.w[i]));
}
/** يوزع الطول L على العناصر بنسبة مساحاتها مع حد أدنى لكل منها وثابت للممرات؛ null إن لم يتسع. */
function dist(L, items) {
  const mins = items.map(x => x.fix || x.min); if (sum(mins) > L + 1e-6) return null;
  const fixed = new Map(); items.forEach((x, i) => { if (x.fix) fixed.set(i, x.fix); });
  for (let k = 0; k <= items.length; k++) {
    const rest = L - sum([...fixed.values()]), free = items.map((_, i) => i).filter(i => !fixed.has(i));
    if (!free.length) { const flex = items.map((x, i) => i).filter(i => !items[i].fix); const out = items.map((_, i) => fixed.get(i)); if (flex.length) for (const i of flex) out[i] += rest / flex.length; else out[out.length - 1] += rest; return out; }
    const tot = sum(free.map(i => items[i].a)) || 1; let ch = false;
    for (const i of free) { const d = rest * items[i].a / tot; if (d < items[i].min - 1e-9) { fixed.set(i, items[i].min); ch = true; } }
    if (!ch) return items.map((x, i) => (fixed.has(i) ? fixed.get(i) : rest * x.a / tot));
  }
  return null;
}
/** يحل الشجرة داخل غلاف ew×ed: يعيد الكتل الموضوعة والحركة والأحواش والفراغات الخارجية، أو null. */
function solve(tree, ew, ed) {
  const out = { placed: [], circ: [], courts: [], voids: [] };
  const rec = (n, r) => {
    if (n.t === 'x' || n.t === 'y') {
      const dir = n.t, L = dir === 'x' ? W_(r) : H_(r);
      const sz = dist(L, n.k.map((c, i) => ({ min: minExt(c, dir), fix: c.t === 'circ' && c.fix && c.fixDir === dir ? c.fix : 0, a: areaOf(c) * n.w[i] })));
      if (!sz) return false;
      // فراغ خارجي اختياري (حديقة/ارتداد يمتص فرق العمق بين الأجنحة): أقل من 2.4 م لا يُترك شريطًا ضيقًا بل يُضم لجاره
      for (let i = 0; i < n.k.length; i++) if (n.k[i].opt && sz[i] < 2.4) { const j = i > 0 && !n.k[i - 1].opt ? i - 1 : n.k.findIndex(c => !c.opt); if (j < 0) return false; sz[j] += sz[i]; sz[i] = 0; }
      const lastI = sz.reduce((a, v, i) => (v > 0 ? i : a), -1);
      let p = dir === 'x' ? r.x0 : r.y0; const end = dir === 'x' ? r.x1 : r.y1;
      for (let i = 0; i < n.k.length; i++) {
        if (sz[i] === 0 && n.k[i].opt) continue;
        const q = i === lastI ? end : snap(p + sz[i]);
        if (q - p < .5) return false;
        if (!rec(n.k[i], dir === 'x' ? { x0: p, x1: q, y0: r.y0, y1: r.y1 } : { x0: r.x0, x1: r.x1, y0: p, y1: q })) return false;
        p = q;
      }
      return true;
    }
    if (n.t === 'zone') {
      const dir = n.along, L = dir === 'x' ? W_(r) : H_(r);
      const sz = dist(L, n.b.map((b, i) => ({ min: runOf(b), fix: 0, a: b.area * n.w[i] }))); if (!sz) return false;
      let p = dir === 'x' ? r.x0 : r.y0; const end = dir === 'x' ? r.x1 : r.y1;
      n.b.forEach((b, i) => {
        const q = i === n.b.length - 1 ? end : snap(p + sz[i]), slot = dir === 'x' ? { x0: p, x1: q, y0: r.y0, y1: r.y1 } : { x0: r.x0, x1: r.x1, y0: p, y1: q };
        p = q;
        // مطبخ بمقاس صريح في عمود أعرض منه: الزائد مخزن حقيقي يُفتح من المطبخ (لا يُمطّ المطبخ عن مقاسه)؛
        // وغرفة خادمة في عمود خدمة عريض: الزائد غرفة غسيل بجوارها تُفتح من المطبخ أو الحركة (لا غرفة خادمة متضخمة)
        const run = dir === 'x' ? W_(slot) : H_(slot), cross = dir === 'x' ? H_(slot) : W_(slot);
        let tgt = null, extra = null;
        if (b.dimGross && b.kind === 'kitchen' && !b.noPantry) { tgt = Math.abs(run - b.dimGross.l) <= Math.abs(run - b.dimGross.s) ? b.dimGross.s : b.dimGross.l; extra = { id: b.id + '-pantry', kind: 'store', name: 'المخزن', pantry: true }; }
        else if (b.kind === 'maid' && cross > 5.0) { tgt = 3.6; extra = { id: 'svc-laundry', kind: 'store', name: b.laundryName || 'غرفة الغسيل', laundry: true }; }
        if (tgt && cross - tgt >= 1.4) {
          // الزائد على جهة الحركة أو الجهة المقابلة (متغير بحث): الغسيل على الحركة يصير مدخل خدمة للخادمة ويبقي نافذتها
          const ps = n.pside ? n.door : opp[n.door], [pan, kit] = cut(slot, ps, snap(cross - tgt));
          out.placed.push({ block: b, r: kit, door: n.door });
          out.placed.push({ block: { ...extra, area: A_(pan) }, r: pan, door: opp[ps] });
          return;
        }
        out.placed.push({ block: b, r: slot, door: n.door });
      });
      return true;
    }
    if (n.t === 'circ') { out.circ.push({ id: n.id, r: { ...r } }); return true; }
    if (n.t === 'court') { out.courts.push({ ...r }); return true; }
    out.voids.push({ ...r }); return true;
  };
  return rec(tree, { x0: 0, y0: 0, x1: ew, y1: ed }) ? out : null;
}

// ------------------------------------------------------------------------------------------ الأنماط التنظيمية
export const PARTI_AR = Object.freeze({
  sideliving: 'الصالة على الواجهة الجانبية: الضيافة صف أمامي، ثم الصالة والطعام والمطبخ صفًا عائليًا، وغرف النوم خلفها أو في جناح',
  spine: 'رواق جانبي: الفراغات صفًا على جانب والحركة (المدخل فالصالة فممر النوم) على الجانب الآخر',
  sidemajlis: 'مجلس الرجال على الواجهة الجانبية بمدخل مستقل من الارتداد الجانبي، والمدخل العائلي في المحور',
  cornerentry: 'المدخل في ركن الواجهة لا في محورها، والمجلس على بقية الواجهة، والصالة خلف المدخل',
  svcfront: 'جناح الخدمة في الأمام بجوار المدخل، والطعام والمطبخ خلفه، والصالة في المحور، وغرف النوم رواقًا خلفيًا',
  hallback: 'الصالة في الخلف على الحديقة: الضيافة صف أمامي، والخدمة والصالة خلفها، وجناح النوم بطول المبنى',
  compact: 'صالة مركزية مدمجة: الضيافة في الأمام، والخدمة في جناح، وغرف النوم في جناح مقابل',
  courtyard: 'حوش داخلي مكشوف تطل عليه الصالة والمطبخ، وغرف النوم خلفه على رواق',
  ell: 'شكل L: جناح نوم جانبي بطول المبنى وحديقة خلفية في الركن تطل عليها الصالة',
  ellback: 'شكل L خلفي: جناح نوم عرضي في الخلف وحديقة جانبية أمامية',
  yoo: 'شكل U: جناحان (نوم وخدمة) حول حديقة خلفية، والضيافة في القاعدة الأمامية',
  wings: 'جناحا نوم منفصلان (الأبناء / الرئيسية) حول حديقة خلفية، والصالة بينهما',
  gallery: 'رواق طولي (ممر محوري) تتوزع عليه الفراغات من الأمام إلى الخلف',
  split: 'كتلتان: عامة في الأمام وخاصة في الخلف بينهما ممر زجاجي وفناءان جانبيان',
  rows: 'صفوف عرضية: الضيافة أمامًا، ثم الصالة والطعام والمطبخ، ثم رواق غرف النوم',
  tcore: 'نواة T: الضيافة والخدمة والصالة أمامًا، وخلفها كتلة النوم بممر أوسط قصير تُفتح عليه الغرف من جهتيه',
  center: 'المجلس في وسط الواجهة فوق الطعام، والمدخل بجواره فوق الصالة، والخدمة والنوم جناحان على الطرفين',
  crosshall: 'صالة عرضية بعرض المبنى خلف الضيافة، ثم الخدمة وممر أوسط لغرف النوم',
  midwing: 'غرف النوم في الوسط على ممر، والصالة والخدمة في الخلف على الحديقة الخلفية',
  sidehall: 'جناح خدمة على جانب وصالة على الجانب المقابل، وغرف النوم خلفهما على ممر',
});
/** يبني أشجار الأنماط للبرنامج. كل نمط له بديل أو أكثر بالطوبولوجيا (لا بالانعكاس). */
export function partiTrees(P, { stair = false, W = Infinity, irregular = false } = {}) {
  const T = DESIGN_TARGETS, M = P.men, Wm = P.women[0] || null, Wx = P.women.slice(1);
  const Dn = P.dining, K = P.kitchens, Md = P.maid ? [P.maid] : [];
  const pub = [P.guest, P.office, P.prayer, P.driver].filter(Boolean), S = P.suites, Fam = P.family;
  const wcA = P.wcs.slice(0, 1), wcB = P.wcs.slice(1);
  const flex = [...Wx, ...pub], svc = [...flex, ...Dn, ...K, ...Md, ...wcA];
  const A = sum(P.blocks.map(b => b.area)) + P.hallArea + T.foyer;
  const courtA = Math.max(16, Math.min(40, A * .08)), gardenA = Math.max(24, Math.min(70, A * .14));
  const Mz = d => (M ? Z([M], d, 'x') : null);
  const Wz = (d, along = 'y') => (Wm ? Z([Wm], d, along) : null);
  const F = () => C('foyer', { area: T.foyer * .85 }); // مدخل مضغوط (≈ 8.5 م²): الحركة لا تُهدر في الردهة
  const H = () => C('hall', { area: P.hallArea });
  // السلم U بقلبتين (ارتفاع دور ≈ 3.2 م، درجة ≈ 0.28–0.30 م) يحتاج نحو 3.7 م طولًا؛ عرض فراغه عرض محور الصالة
  const ST = () => (stair ? C('stair', { fix: 3.7, area: 4.4 * 3.7 }) : null);
  const corr = (id = 'corr') => C(id, { fix: 1.4, area: 14 });
  const gal = (id = 'gallery') => C(id, { fix: 1.5, area: 24 });
  const beds = [...Fam, ...wcB, ...S];
  // الصف الخلفي يتسع لعدد محدود من الأجنحة بعرض الأرض؛ الزائد (كبار السن أولًا) يذهب إلى صف الصالة أو جناح جانبي
  const rowOrder = [...S].reverse().concat(wcB, Fam); let acc = 0; const bedsRow = [], over = [];
  for (const b of rowOrder) { acc += runOf(b) + .15; (acc <= W - .3 || b.master ? bedsRow : over).push(b); }
  const overZ = d => (over.length ? Z(over, d, 'y') : null);
  const out = [];
  // منطقة الخدمة العائلية بتنظيمين: «عمود» (الطعام والمطبخ والخادمة متتالية على امتداد الجناح) أو «زوج»
  // (الطعام على جهة الصالة والمطبخ بجواره على الواجهة الجانبية في صف واحد، والخادمة والمرافق أمامهما) —
  // الثاني يقصر الجناح ويضمن تجاور المطبخ والطعام ويعطي المطبخ عرضًا حقيقيًا وواجهة لباب الخدمة
  let svMode = 'stack', svCount = 0, lastSv = 0;
  const SVZ = d => {
    svCount++;
    if (svMode === 'stack' || !K.length || !Dn.length) return Z(svc, d, 'y');
    const front = [...flex, ...Md], kz = Z(K, d, 'y'), dz = Z([...wcA, ...Dn], d, 'y');
    return Y(front.length ? Z(front, d, 'y') : null, d === 'x1' ? X(kz, dz) : X(dz, kz));
  };
  const push = (mode, tag, tree) => { const used = svCount > lastSv; lastSv = svCount; if (!tree || (svMode === 'pair' && !used)) return; out.push({ mode, tag: tag + (svMode === 'pair' ? 'p' : ''), tree }); };
  const gen = () => {
  // الأعمدة الثلاثة: يسار | محور (المدخل ثم الصالة) | يمين. المجلسان على الواجهة في رأسي العمودين الجانبيين؛
  // swap: مجلس الرجال فوق الجناح الآخر (بديل طوبولوجي لعلاقة الضيافة بالنوم والخدمة، لا انعكاس للمخطط)
  const cols = (leftBelow, mid, rightBelow, swap = false) => {
    const L = swap ? (Wm ? Z([Wm], 'x1', 'y') : null) : Mz('x1'), R = swap ? Mz('x0') : Wz('x0');
    return X(Y(L, ...leftBelow), Y(F(), ST(), ...mid), Y(R, ...rightBelow));
  };
  // بمجلس واحد: البديل الثاني يضع المجلس على رأس الجناح المقابل (فوق النوم بدل الخدمة) فيأخذ عمود الخدمة عمقه كاملًا
  const both = (mode, tag, f) => { push(mode, tag, f(false)); if (M) push(mode, tag + 'r', f(true)); };
  // صف النوم الخلفي على رواق: الرئيسية في طرف الصف بعمق الكتلة الخلفية كاملًا (رواق أقصر بعرضها)، بابها من نهاية الرواق
  const galBeds = (list, end = 'x0') => {
    const m = list.length >= 3 ? list.find(b => b.master) : null; if (!m) return Y(gal(), Z(list, 'y0', 'x'));
    const rest = list.filter(b => b !== m), row = Y(gal(), Z(rest, 'y0', 'x'));
    return end === 'x0' ? X(Z([m], 'x1', 'y'), row) : X(row, Z([m], 'x0', 'y'));
  };
  // جناح النوم على ممر: الرئيسية (آخر القائمة) في نهاية الجناح بعرضه كاملًا يُفتح بابها من نهاية الممر — ممر أقصر
  // بعرض غرفة، وجناح رئيسي أعرض بدل غرفة أخرى على الممر
  const corrBeds = (list, d = 'x0') => {
    if (!list.length) return null;
    const m = list[list.length - 1]?.master && list.length >= 3 ? list[list.length - 1] : null, rest = m ? list.slice(0, -1) : list;
    const run = d === 'x0' ? X(corr(), Z(rest, 'x0', 'y')) : X(Z(rest, 'x1', 'y'), corr());
    return m ? Y(run, Z([m], 'y0', 'x')) : run;
  };
  // الطعام والمطبخ متجاوران في صف واحد (الطعام على جهة الصالة d)
  const DK = d => (K.length && Dn.length ? (d === 'x1' ? X(Z(K, 'x1', 'y'), Z(Dn, 'x1', 'y')) : X(Z(Dn, 'x0', 'y'), Z(K, 'x0', 'y'))) : Z([...Dn, ...K], d, 'y'));
  const narrow = W < 13;
  if (stair) {
    // (1) الأرضي في الدورين: صالة مركزية مدمجة، والخدمة في جناح والنوم الأرضي في المقابل
    both('compact', 'c0', sw => cols([SVZ('x1'), OV()], [H()], [corrBeds(beds)], sw));
    // الفراغات تفتح على محور المدخل–السلم–الصالة بلا ممر
    const gS = [...Fam, ...wcB, ...S];
    // الخدمة (الطعام والمطبخ متجاوران) في جناح، وغرفة الأرضي تُفتح على الصالة مباشرة في الجناح المقابل بلا ممر
    if (gS.length) push('compact', 'c3', cols([SVZ('x1'), OV()], [H()], [Z(gS, 'x0', 'y'), OV()]));
    if (gS.length) push('sidehall', 'c4', cols([Z(gS, 'x1', 'y')], [H()], [Z([...flex, ...Dn, ...K, ...Md, ...wcA], 'x0', 'y')]));
    // صفّان: أمامي (المجلس | المدخل والسلم | الطعام) وخلفي بعرض المبنى (غرفة الأرضي | الصالة | المطبخ والخدمة)
    // — الصالة في الخلف على الحديقة بين جناحين، والطعام أمامي يخدم المجلس
    push('rows', 'c5', Y(X(Mz('y1'), Y(F(), ST()), Z([...flex, ...Dn], 'y1', 'x')), X(gS.length ? Z(gS, 'x1', 'y') : null, H(), Z([...K, ...Md, ...wcA], 'x0', 'y'))));
    // الصالة الخلفية بين غرفة الأرضي والطعام والمطبخ متجاورين على الحديقة، والخدمة أمامًا بجوار المدخل
    push('rows', 'c6', Y(X(Mz('y1'), Y(F(), ST()), Z([...flex, ...Md, ...wcA], 'y1', 'x')), X(gS.length ? Z(gS, 'x1', 'y') : null, H(), DK('x0'))));
    return; // الدوران: الأنماط ذات المحور الأوسط فقط (السلم في الموضع نفسه للدورين)
  }
  if (!narrow) {
    // (2) حوش داخلي خلف الصالة، تطل عليه الصالة والمطبخ، وغرف النوم خلفه على رواق (والزائد في جناح جانبي)
    for (const nSide of [0, 1]) {
      const side = [...over, ...bedsRow.filter(b => !b.master).slice(0, nSide)], back = bedsRow.filter(b => !side.includes(b));
      if (!back.length || (nSide && side.length === over.length)) continue;
      both('courtyard', 'k' + nSide, sw => Y(cols([SVZ('x1'), OV()], [H(), COURT(courtA)], [corrBeds(side) || corr()], sw), galBeds(back)));
    }
    // (3) L: جناح النوم بطول المبنى، والحديقة في الركن الخلفي تطل عليها الصالة والمطبخ
    both('ell', 'l0', sw => cols([SVZ('x1'), VOID(gardenA * .6)], [H(), VOID(gardenA * .4)], [corrBeds(beds)], sw));
    // (4) L خلفي: جناح النوم عرضي في الخلف على رواق، وحديقة جانبية تطل عليها الصالة
    both('ellback', 'b0', sw => Y(cols([SVZ('x1'), OV()], [H()], [overZ('x0'), VOID(gardenA)], sw), galBeds(bedsRow)));
    // (5) U: جناح خدمة وجناح نوم حول حديقة خلفية، والصالة في القاعدة تطل عليها
    both('yoo', 'u0', sw => cols([SVZ('x1'), OV()], [H(), VOID(gardenA)], [corrBeds(beds)], sw));
    // (5-أ) غرفة كبار السن خلف الصالة مباشرة تُفتح عليها (قريبة من الصالة بلا ممر النوم)، وبقية الغرف في الجناح
    const eld = S.find(b => b.elderly && !b.master);
    if (eld) {
      const rest = beds.filter(b => b !== eld);
      push('hallback', 'h2', X(Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), X(VOID(gardenA * .6), Z([eld], 'y0', 'x'))), corrBeds(rest)));
    }
    // (5-ب) الطعام في المحور خلف الصالة مفتوحًا عليها ومطلًّا على الحديقة الخلفية، والمطبخ بجواره في آخر جناح الخدمة
    // (يقصر الصالة حين يطول جناح الخدمة: لا تُمد الصالة لتبلغ طعامًا في آخر الجناح)
    if (Dn.length && K.length) both('yoo', 'u1', sw => cols([Z([...flex, ...wcA, ...Md, ...K], 'x1', 'y'), OV()], [H(), Z(Dn, 'y0', 'x'), OV()], [corrBeds(beds)], sw));
    // (5ب) جناحا نوم منفصلان: الأبناء في جناح، والرئيسية خلف الخدمة في الجناح المقابل بممر قصير من الصالة
    if (S.length >= 2) {
      const kids = [...Fam, ...wcB, ...S.filter(b => !b.master)], mst = S.filter(b => b.master);
      both('wings', 'w0', sw => cols([corrBeds(kids, 'x1')], [H(), VOID(gardenA)], [SVZ('x0'), X(corr('corrB'), Z(mst, 'x0', 'y'))], sw));
    }
    // (5د) نواة T: الصالة في المحور وخلفها ممر قصير تُفتح عليه غرف النوم من الجهتين (ممر مزدوج بدل ممر طويل
    // بجانب صف الغرف) — نصف الغرف خلف الخدمة ونصفها خلف المجلس الثاني/الواجهة، والرئيسية في آخر الممر
    if (beds.length >= 3) {
      const half = Math.floor(beds.length / 2), bA = beds.slice(0, half), bB = beds.slice(half);
      const back = () => X(Z(bA, 'x1', 'y'), corr('spine2'), Z(bB, 'x0', 'y'));
      // بمجلس واحد: حديقة أمامية جانبية مكان مجلس النساء تضيء الصالة وتبقي الممر في المحور تحتها
      push('tcore', 't0', Y(X(Y(Mz('x1'), SVZ('x1'), OV()), Y(F(), H()), Wm ? Y(Wz('x0'), VOID(gardenA * .5)) : VOID(gardenA * .5)), back()));
      if (M && Wm) push('tcore', 't0r', Y(X(Y(Z([Wm], 'x1', 'y'), VOID(gardenA * .5)), Y(F(), H()), Y(Mz('x0'), SVZ('x0'), OV())), back()));
    }
    // (6) الصالة في الخلف على الحديقة: الضيافة صف أمامي (المجلس | المدخل | مجلس النساء)، وخلفه الخدمة والصالة،
    // وحديقة خلفية تطل عليها الصالة، وجناح النوم بطول المبنى على ممره
    push('hallback', 'h0', X(Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), VOID(gardenA)), corrBeds(beds)));
    // والخدمة أمامًا بجوار المدخل (بدل مجلس النساء) ومجلس النساء خلفها، والصالة خلف المدخل على الحديقة
    if (Wm) push('hallback', 'h1', X(Y(X(Mz('y1'), F(), Z([...flex, ...Md, ...wcA], 'x0', 'x')), X(Y(Z([Wm], 'x1', 'y'), OV()), H(), DK('x0')), VOID(gardenA)), corrBeds(beds)));
    // (6ب) الصالة على الواجهة الجانبية: الضيافة صف أمامي، ثم صف عائلي (الصالة على الجانب، فالطعام والمطبخ متجاوران،
    // فالخادمة والمرافق)، ثم رواق غرف النوم بعرض المبنى؛ و(6ج) الصف العائلي نفسه وجناح النوم بطول المبنى
    push('sideliving', 'z0', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(H(), DK('x0'), Z([...flex, ...Md, ...wcA], 'x0', 'y')), galBeds(bedsRow, 'x1')));
    push('sideliving', 'z1', X(Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(H(), DK('x0'), Z([...flex, ...Md, ...wcA], 'x0', 'y')), OV()), corrBeds(beds)));
    // (6د) مجلس الرجال على الواجهة الجانبية بمدخله المستقل من الارتداد الجانبي، خلف مجلس النساء (أو حديقة أمامية)؛
    // النوم رواقًا خلفيًا (j0) أو جناحًا بطول المبنى (j1)
    const WzG = () => (Wm ? Wz('x1') : VOID(gardenA * .4));
    if (M) {
      push('sidemajlis', 'j0', Y(X(Y(WzG(), Z([M], 'x1', 'y')), Y(F(), H()), Y(SVZ('x0'), OV())), galBeds(bedsRow)));
      push('sidemajlis', 'j1', X(Y(WzG(), Z([M], 'x1', 'y'), SVZ('x1'), OV()), Y(F(), H(), VOID(gardenA)), corrBeds(beds)));
    }
    // (6هـ) المدخل في ركن الواجهة (لا في المحور): المجلسان على بقية الواجهة، والصالة خلف المدخل على الواجهة الجانبية
    push('cornerentry', 'e0', Y(X(Mz('y1'), Wm ? Z([Wm], 'x1', 'x') : null, F()), X(SVZ('x1'), H()), galBeds(bedsRow)));
    push('cornerentry', 'e1', X(corrBeds(beds, 'x1'), Y(X(F(), Wz('x0', 'x'), Mz('y1')), X(H(), SVZ('x0')), OV())));
    // (6و) جناح الخدمة في الأمام بجوار المدخل (الخادمة والمرافق على الواجهة)، والمطبخ والطعام خلفه، والصالة خلف المدخل
    if (!Wm) push('svcfront', 'v0', Y(X(Mz('y1'), F(), Z([...flex, ...Md, ...wcA], 'x0', 'y')), X(H(), DK('x0')), galBeds(bedsRow)));
    // (7) كتلتان: عامة أمامًا وخاصة خلفًا، بينهما ممر زجاجي في امتداد المحور وفناءان جانبيان؛ الطعام والمطبخ معًا
    both('split', 's0', sw => Y(cols([Z([...flex, ...wcA, ...Md], 'x1', 'y'), VOID(gardenA * .3)], [H(), C('link', { area: 8 })], [DK('x0'), VOID(gardenA * .3)], sw), galBeds(bedsRow)));
  }
  // (8) رواق طولي: ممر محوري من الأمام للخلف تتوزع عليه الفراغات
  push('gallery', 'g0', X(Y(Mz('y1'), SVZ('x1')), C('spine', { fix: 1.6, area: 30 }), Y(F(), Wz('x0'), H(), Z(beds, 'x0', 'y'))));
  push('gallery', 'g1', X(Y(F(), C('spine', { area: 30 })), Y(Mz('y1'), Wm ? Z([Wm], 'x0', 'y') : null, SVZ('x0'), H(), Z(beds, 'x0', 'y'))));
  // (9) للأرض الضيقة: صالة عرضية بعرض المبنى، وغرف النوم في الوسط، وخدمة جانبية مقابل الصالة
  if (W < 15) {
    push('crosshall', 'n1', Y(X(Mz('y1'), F(), Wz('x0', 'x')), H(), X(Y(Z([...flex, ...Dn], 'y0', 'x'), Z([...K, ...Md, ...wcA], 'x1', 'y')), corr(), Z(beds, 'x0', 'y'))));
    // المدخل في ركن الواجهة والمجلس في وسطها (لا في الركن)، والصالة العرضية خلفهما
    if (M) push('crosshall', 'n1c', Y(X(F(), Wz('x0', 'x'), Mz('y1')), H(), X(Z(beds, 'x1', 'y'), corr(), Y(Z([...flex, ...Dn], 'y0', 'x'), Z([...K, ...Md, ...wcA], 'x0', 'y')))));
  }
  push('midwing', 'n2', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(Z(beds, 'x1', 'y'), corr()), X(Z([...flex, ...Dn, ...K, ...Md, ...wcA], 'x1', 'y'), H())));
  // كتلتان للأرض الضيقة: الضيافة والمعيشة أمامًا، والنوم خلفًا، بينهما ممر زجاجي بجانب حديقة جانبية
  push('split', 's2', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), X(VOID(gardenA * .5), C('link', { fix: 1.6, area: 6 })), X(Z(beds, 'x1', 'y'), corr())));
  push('sidehall', 'n0', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), X(Z(beds, 'x1', 'y'), corr())));
  // للأرض الضيقة: غرف النوم في الخلف على ممر أوسط قصير تُفتح عليه من جهتيه (ممر مزدوج بدل ممر جانبي طويل)
  // (والرئيسية في نهاية الممر بعرض الأرض كاملًا، فلا تُمط غرفة وحيدة على أحد جانبيه)
  if (narrow && beds.length >= 3) {
    const m = beds.find(b => b.master), rest = beds.filter(b => b !== m), h = Math.ceil(rest.length / 2);
    push('tcore', 'n7', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), X(Z(rest.slice(0, h), 'x1', 'y'), corr('spine2'), Z(rest.slice(h), 'x0', 'y')), m ? Z([m], 'y0', 'x') : null));
  }
  if (narrow && beds.length) {
    // رواق جانبي: الفراغات صفًا على جانب (المجلس، فالخدمة، فغرف النوم) ومحور الحركة على الجانب الآخر
    // (المدخل، فالصالة، فممر النوم) — بدل الصفوف العرضية
    push('spine', 'n9', X(Y(Mz('x1'), SVZ('x1'), Z(beds, 'x1', 'y')), Y(F(), Wm ? Z([Wm], 'x0', 'y') : null, H(), corr('spine2'))));
    // جناح نوم أضيق في الخلف بجانب حديقة جانبية خلفية (شكل L)، والصف العائلي بعرض الأرض
    push('ell', 'n10', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), X({ ...VOID(gardenA * .3), min: 2.4 }, Z(beds, 'x1', 'y'), corr())));
    // المجلس على الواجهة الجانبية بمدخله من الارتداد الجانبي، وأمامه حديقة أمامية بجوار المدخل العائلي
    if (M) push('sidemajlis', 'n11', Y(X({ ...VOID(gardenA * .3), min: 2.4 }, F()), X(Y(Z([M], 'x1', 'y'), SVZ('x1')), H()), X(Z(beds, 'x1', 'y'), corr())));
  }
  // للأرض الضيقة: الصالة على الواجهة الجانبية والخدمة مقابلها، وحديقة جانبية بين الضيافة والصالة تضيئهما
  if (narrow) push('sidehall', 'n8', Y(X(F(), Mz('y1')), X(H(), SVZ('x0')), X(corr(), Z(beds, 'x0', 'y'))));
  };
  gen(); svMode = 'pair'; lastSv = svCount; gen();
  // ترتيب الكتل داخل المناطق بطلب العميل قبل البحث: «في الخلف» آخر المنطقة الطولية، «في الأمام» أولها،
  // و«بجوار» يُبقي الكتلتين متتاليتين (البحث المحلي يبدّل جارين فقط، فلا يصل وحده إلى ترتيب بعيد)
  if (P.rules?.length) for (const t of out) orderZones(t.tree, P);
  // «غرفة كبار السن قرب الصالة»: غرفتهم تُفتح على الصالة مباشرة (لا في آخر جناح النوم خلف ممره وحمامه) — لكل نمط
  // تكون فيه ضمن جناح النوم نسختان: خلف الصالة في عمودها (e) أو بجانبها في صفها (f)؛ والنمط الأصلي يُترك
  const eldB = P.suites.find(b => b.elderly && !b.master);
  const eldRule = eldB && (P.rules || []).some(r => ['near', 'adjacent'].includes(r.kind) && ((r.a === 'elderly' && r.b === 'hall') || (r.b === 'elderly' && r.a === 'hall')));
  if (eldRule) eldB.nearHall = true; // غرفة النوم نفسها تلامس الصالة (حمامها على جانب لا بينها وبين الصالة)
  if (eldRule && !stair && P.tweaks?.elderlyVariants) for (const t of out.splice(0)) {
    const variants = elderlyNearHall(t.tree, eldB);
    out.push(t);
    for (const [suf, tree] of variants) out.push({ ...t, tag: t.tag + suf, tree });
  }
  // أرض غير منتظمة: لكل نمط صفوف (جذره تقسيم أمام/خلف) نسخة متدرجة — الصفوف الأمامية أضيق بهامشين جانبيين
  // والصف الخلفي بعرض الغلاف كله، فيتبع المبنى أرضًا تتسع للخلف (شبه منحرف) بدل مستطيل داخلها
  if (irregular) for (const t of [...out]) {
    if (t.tree.t !== 'y' || t.tree.k.length < 2) continue;
    const k = t.tree.k, last = k.length - 1;
    const tree = mk('y', k.map((c, i) => (i === last ? cloneTree(c) : mk('x', [MARGIN(c), cloneTree(c), MARGIN(c)]))));
    out.push({ mode: t.mode, tag: t.tag + 't', tree, stepped: true });
  }
  return out;
}

/**
 * نسخ شجرة النمط بغرفة كبار السن ملاصقة للصالة: تُنزع من منطقتها (جناح النوم) وتوضع خلف الصالة في عمودها (e)
 * أو بجانبها في صفها (f) وبابها على الصالة. يعيد [] إن كانت أصلًا وحدها في منطقة (نمط مخصص لها) أو لم تكن الصالة في عمود.
 */
function elderlyNearHall(tree0, eld) {
  const out = [];
  for (const suf of ['e', 'f']) {
    const tree = cloneTree(tree0);
    let host = null, hallAt = null;
    (function walk(n, parent) {
      if (n.t === 'zone' && n.b.includes(eld)) host = { n, parent };
      if (n.t === 'circ' && n.id === 'hall') hallAt = { n, parent };
      if (n.k) n.k.forEach(c => walk(c, n));
    })(tree, null);
    if (!host || !hallAt || host.n.b.length < 2 || !hallAt.parent || hallAt.parent.t !== 'y') return [];
    const i = host.n.b.indexOf(eld); host.n.b.splice(i, 1); host.n.w.splice(i, 1); delete host.n._mx; delete host.n._my;
    const col = hallAt.parent, hi = col.k.indexOf(hallAt.n);
    // e: خلف الصالة وبجانبها حديقة صغيرة تبقي للصالة واجهة؛ f: بجانب المدخل والصالة معًا بعمقهما (المدخل لا يتسع)
    const fi = col.k.findIndex(c => c.t === 'circ' && c.id === 'foyer'); if (fi < 0 || fi > hi) return [];
    if (suf === 'e') {
      // خلف الصالة: الغرفة وحديقة صغيرة بجانبها (تبقي للصالة واجهة)، والمدخل بجانبه فناء أمامي صغير فلا يتسع بعرض العمود
      col.k.splice(hi + 1, 0, { t: 'x', k: [Z([eld], 'y0', 'x'), { t: 'void', area: 12, min: 3.0 }], w: [1, 1] }); col.w.splice(hi + 1, 0, 1);
      col.k[fi] = { t: 'x', k: [{ t: 'void', area: 8, min: 2.4 }, col.k[fi]], w: [1, 1] };
    } else {
      // بجانب المدخل في صفه وتُفتح على الصالة خلفهما مباشرة (الصالة بعرض العمود كاملًا تبقى على جناحي الخدمة والنوم)
      col.k[fi] = { t: 'x', k: [Z([eld], 'y1', 'x'), col.k[fi]], w: [1, 1] };
    }
    // الذاكرات المحسوبة للأبعاد الدنيا تُمسح (الشجرة تغيّرت)
    (function clr(n) { delete n._mx; delete n._my; if (n.k) n.k.forEach(clr); })(tree);
    out.push([suf, tree]);
  }
  return out;
}

function orderZones(tree, P) {
  const zones = []; (function walk(n) { if (n.t === 'zone' && n.b.length > 1) zones.push(n); if (n.k) n.k.forEach(walk); })(tree);
  const of = id => new Set(blocksFor(id, P.blocks));
  for (const r of P.rules) {
    if (r.kind === 'place' && ['back', 'front'].includes(r.side)) {
      const A = of(r.a);
      for (const z of zones.filter(z => z.along === 'y')) {
        const hit = z.b.filter(b => A.has(b)); if (!hit.length) continue;
        // الجار المطلوب بجوارها يتبعها (الطعام قبل المطبخ في الخلف)
        const mates = new Set(P.rules.filter(q => (q.kind === 'adjacent' || q.kind === 'near') && (q.a === r.a || q.b === r.a)).flatMap(q => [...of(q.a === r.a ? q.b : q.a)]).filter(b => z.b.includes(b) && !A.has(b)));
        const rest = z.b.filter(b => !A.has(b) && !mates.has(b)), mv = [...mates, ...hit];
        // «في الخلف»: بعد بقية المنطقة، لكن فراغات الخدمة (الخادمة ودورة المياه والمخزن) تبقى خلف المطبخ لا أمامه —
        // فالخادمة تجاور المطبخ، ولا تُمد الصالة لتبلغ طعامًا في آخر الجناح
        const kitchenHit = hit.some(b => b.kind === 'kitchen' || b.kind === 'dining');
        const svcT = kitchenHit ? rest.filter(b => ['maid', 'wc', 'store', 'driver'].includes(b.kind) && !A.has(b)) : [], head = rest.filter(b => !svcT.includes(b));
        z.b = r.side === 'back' ? [...head, ...mv, ...svcT] : [...hit, ...mates, ...rest]; z.w = z.b.map(() => 1);
      }
    }
  }
}
/**
 * تنظيم الجناح بحمامه: «عميق» (حمام ومدخل جناح على جهة الباب والغرفة خلفهما) أو «جانبي» (شريط حمام وخزانة
 * عمودي على الباب). يختار ما يعطي الغرفة أكبر بعد أدنى. along: طول جهة الباب، dep: العمق.
 */
function suiteVariant(b, along, dep) {
  const T = DESIGN_TARGETS, bl0 = b.master ? T.masterBathL : b.kind === 'suite' ? T.bathL : 2.2, td = b.master ? 2.4 : 2.1, sd = b.master ? T.masterStripD : b.kind === 'maid' ? 1.6 : T.stripD;
  const side = { deep: false, bw: along - sd, bdp: dep };
  const deep = along >= 1.25 + bl0 * .9 ? { deep: true, bw: along, bdp: dep - td } : null;
  const m = v => Math.min(v.bw, v.bdp);
  if (b.nearHall) return side; // غرفة كبار السن قرب الصالة: لا حمام ولا مدخل جناح بينها وبين الصالة
  return deep && m(deep) > m(side) + .3 ? deep : side; // «مدخل الجناح» حركة إضافية: لا يُختار إلا إن كسبت الغرفة عرضًا واضحًا
}
/**
 * شريط ضيافة مجلس الرجال (ممر/مغاسل ودورة مياه): على جانبه (side، بعرض guestStripW) أو في خلفه (back، 1.5 م).
 * يُختار ما يبقي للمجلس عرضًا صافيًا أكبر — الدالة نفسها في التقييم والمقاسات والتفصيل.
 */
function menStrip(r) {
  const T = DESIGN_TARGETS, w = W_(r), h = H_(r);
  const sideOK = w - T.guestStripW >= 3.4 && h >= T.guestWcL + 1.6, backOK = h - 1.5 >= 3.6 && w >= T.guestWcL + 1.2;
  const sideNet = Math.min(w - T.guestStripW, h), backNet = Math.min(w, h - 1.5);
  if (sideOK && (!backOK || sideNet >= backNet - .3)) return { side: 'side', net: sideNet, w: w - T.guestStripW, h };
  if (backOK) return { side: 'back', net: backNet, w, h: h - 1.5 };
  return { side: null, net: Math.min(w, h), w, h };
}
// ------------------------------------------------------------------------------------------ التقييم
const HABIT_EXP = { suite: 2.6, majlis: 2.2, kitchen: 1.4, maid: 1.2, office: 1.4, family: 2.0, driver: 1.0, prayer: 1.0, dining: 1.6 };
// حدود صلبة لجودة فراغات الأسرة (افتراضات تصميمية): محور المطبخ الأصغر (صافيه ≈ 3.0 م بعد الجدران)، ونسبة الطعام
const KIT_MIN_AXIS = 3.25, DIN_MAX_ASP = 1.8;
const MAX_ASP = { store: 4.5, wc: 2.6, majlis: 1.8, suite: 1.75, dining: 1.8, kitchen: 2.0, family: 2.0, maid: 2.0, office: 2.0, prayer: 2.2, driver: 2.2 };
/** جزاء ترتيب محلول (أقل = أفضل)، أو null لرفضه. W, D: الغلاف. */
export function scoreV2(sol, P, W, D, ctx = {}) {
  const T = DESIGN_TARGETS, { placed, circ, courts } = sol;
  const solids = [...placed.map(p => p.r), ...circ.map(c => c.r)];
  const cid = id => circ.find(c => c.id === id);
  let pen = 0;
  const no = w => { const d = globalThis.__v2dbg; if (d) d[w] = (d[w] || 0) + 1; return null; };
  // مخالفة قابلة للتحسين: جزاء كبير متدرج بقدر المخالفة، فيتجه البحث نحو الحل المقبول؛ ولا يُقبل حل فيه مخالفة
  let viol = 0; const bad = (w, amt) => { const d = globalThis.__v2dbg; if (d) d[w] = (d[w] || 0) + 1; viol++; pen += 600 + 400 * Math.max(0, amt); };
  const hall = cid('hall'), foyer = cid('foyer');
  const root = foyer || cid('stair'); if (!hall || !root) return no('6');
  // الصالة غرفة حقيقية
  { const r = hall.r, s = Math.min(W_(r), H_(r)), l = Math.max(W_(r), H_(r));
    // الصالة غرفة جلوس لا شريط: نسبتها الصافية ≤ 2.0 (محوريًا ≤ 1.92 ليبقى هامش الجدران) في الأرضي؛ والعلوي محوره عرض السلم (≤ 2.3)
    // (الحد الصلب 2.0 للصالة الكبيرة المطلوبة «صالة كبيرة/واسعة»؛ والصالة المعتادة حدها الصلب 2.3 مع جزاء متدرج فوق 2.0)
    const aspMax = ctx.upper ? 2.3 : P.hallArea > 32 ? 1.95 : 2.3;
    if (s < 4.2 - 1e-6) bad('hall-narrow', 4.2 - s); if (l / s > aspMax) bad('hall-aspect', l / s - aspMax);
    pen += 90 * Math.max(0, l / s - 1.6) + 70 * Math.max(0, 5.0 - s);
    const ha = A_(r), ht = P.hallArea; pen += 140 * Math.log(ha / ht) ** 2 * (P.hallFixed ? 4 : 1) + 160 * Math.max(0, l / s - 1.9); const big = ctx.upper ? 1.9 : P.hallArea > 32 ? 1.3 : 1.5; if (ha > ht * big) bad('hall-big', (ha - ht * big) / 8); // مساحة الصالة بقدر البرنامج: لا تمتص فائض الغلاف if (ha < ht * .6) bad('hall-small', (ht * .6 - ha) / 8);
    { const e = expLen(r, solids); if (e < 2.4) bad('hall-dark', (2.4 - e) / 2); } }
  // المدخل على الواجهة ويتصل بالصالة (مباشرة أو عبر السلم)
  if (foyer) { const r = foyer.r; if (r.y0 > TOL) return no('foyer-front'); if (Math.min(W_(r), H_(r)) < 2.4 - 1e-6) bad('foyer-small', 2.4 - Math.min(W_(r), H_(r)));
    // المدخل يفتح على الصالة مباشرة، أو عبر عنصر حركة واحد (السلم، أو الرواق في الأرض الضيقة)
    const viaLen = Math.max(0, ...circ.filter(c => c !== hall && c !== foyer).map(c => Math.min(touch(r, c.r), touch(c.r, hall.r))));
    const fh = Math.max(touch(r, hall.r), viaLen); if (fh < 1.4) bad('foyer-hall', 1.4 - fh); else if (touch(r, hall.r) < 1.4) pen += 25;
    const fa = A_(r); if (fa > T.foyer * 1.6) bad('foyer-big', (fa - T.foyer * 1.6) / 6); pen += 120 * Math.log(fa / (T.foyer * .85)) ** 2 + 4 * Math.max(0, W_(r) / H_(r) - 2) + 4 * Math.max(0, H_(r) / W_(r) - 2.2); }
  // شبكة الحركة متصلة من المدخل
  { const seen = new Set([root.id]), q = [root.id];
    while (q.length) { const a = cid(q.pop()); for (const c of circ) if (!seen.has(c.id) && touch(a.r, c.r) >= 1.2) { seen.add(c.id); q.push(c.id); } }
    // متدرج: كم ينقص كل عنصر حركة منفصل ليلامس الشبكة بعرض باب (1.2 م) — فيتجه البحث إلى وصله
    if (seen.size < circ.length) {
      const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));
      const lack = sum(circ.filter(c => !seen.has(c.id)).map(c => Math.min(...circ.filter(o => seen.has(o.id)).map(o => { const t = touch(c.r, o.r); return t > 0 ? 1.2 - t : 1.2 + gap(c.r, o.r); }))));
      bad('circ-graph', lack);
    } }
  { const st = cid('stair'); if (st) { const a = A_(st.r), mn = Math.min(W_(st.r), H_(st.r)); if (mn < 2.6) bad('stair-narrow', 2.6 - mn); pen += 6 * Math.max(0, a - 14); } }
  for (const c of circ) if (!['foyer', 'hall', 'stair'].includes(c.id)) {
    const s = Math.min(W_(c.r), H_(c.r)); if (s < 1.2 - 1e-6) bad('corr-narrow', 1.2 - s);
    // ممر بلا غرفة تفتح عليه = هدر
    if (!placed.some(p => touch(p.r, c.r) >= 1.1)) pen += 40;
  }
  // الأحواش: مغلقة بالمبنى من كل الجهات، وتطل عليها الصالة
  for (const ct of courts) { if (Math.min(W_(ct), H_(ct)) < 3.4) bad('court-small', 3.4 - Math.min(W_(ct), H_(ct))); if (expLen(ct, solids) > .1) return no('court-open'); pen += touch(ct, hall.r) >= 2 ? -12 : 15; }
  const find = id => placed.find(p => p.block.id === id);
  // ممر غرف النوم: عنصر حركة غير المدخل والصالة والسلم تفتح عليه غرفة نوم
  const bedCorr = c => !['foyer', 'hall', 'stair'].includes(c.id) && placed.some(q => q.block.kind === 'suite' && touch(q.r, c.r) >= 1.1);
  // الصالة تُبلغ من المدخل دون المرور بممر غرف النوم (مسار العائلة إلى الصالة والطعام والمطبخ لا يخترق قسم النوم)
  if (foyer && hall) {
    const seen = new Set([foyer.id]), q = [foyer];
    while (q.length) { const a = q.pop(); for (const c of circ) if (!seen.has(c.id) && !bedCorr(c) && touch(a.r, c.r) >= 1.2) { seen.add(c.id); q.push(c); } }
    if (!seen.has('hall')) bad('hall-via-beds', 1);
  }
  const bedA = []; // مساحة غرفة النوم نفسها (بعد شريط الحمام والخزانة) لكل جناح
  for (const p of placed) {
    const b = p.block, r = p.r, a = A_(r), w = W_(r), h = H_(r), s = Math.min(w, h), l = Math.max(w, h);
    pen += 40 * Math.log(a / b.area) ** 2 * Math.max(1, b.area / 15) * (b.fixedArea ? 5 : 1);
    { const strip = b.kind === 'majlis' && b.guestWc ? 7 : 0, net = a - strip, tgt = b.area - strip;
      if (['majlis', 'suite', 'kitchen', 'dining', 'family'].includes(b.kind) && net < tgt * .75) bad('small:' + b.kind, (tgt * .75 - net) / 4);
      if (['majlis', 'kitchen', 'dining', 'maid', 'family', 'suite'].includes(b.kind) && !b.fixedArea && net > tgt * (b.kind === 'suite' ? 1.9 : 1.7)) bad('big:' + b.kind, (net - tgt * 1.7) / 4); }
    const md = DEP[b.kind] || 2.4; if (s < md * .85) bad('min-side', md * .85 - s); if (s < md) pen += 50 * (md - s);
    // المجلس بعد اقتطاع ممر الضيوف ودورة مياههم: عرض صافٍ يتسع لجلسة على جانبين (≥ 3.7 م، والمستحسن 4.2 م)
    if (b.kind === 'majlis' && b.guestWc) {
      const sN = b.men ? menStrip(r).net : Math.max(Math.min(w - T.guestStripW, h), Math.min(w, h - T.guestStripW));
      if (sN < 3.7) bad('majlis-net', 3.7 - sN); if (sN < 4.2) pen += 60 * (4.2 - sN);
    }
    // الوصول: لكل فراغ مضيف من الحركة، أو من جار مسموح (المطبخ من الطعام، الخادمة من المطبخ)، ومجلس الرجال من الواجهة
    // في الدور العلوي لا يُفتح باب غرفة على جانب قلبة الدرج: الوصول من الصالة أو البسطة أو الممر فقط
    const cT = Math.max(0, ...circ.filter(c => !(ctx.upper && c.id === 'stair')).map(c => touch(r, c.r))), cNoFoyer = Math.max(0, ...circ.filter(c => c.id !== 'foyer' && !(ctx.upper && c.id === 'stair')).map(c => touch(r, c.r)));
    // مجلس الرجال على الواجهة الأمامية، أو على واجهة جانبية بمدخل مستقل من الارتداد الجانبي (حافة خارجية ≥ 3.4 م)
    if (b.kind === 'majlis' && b.men) { if (r.y0 > TOL) { const sx = Math.max(...['x0', 'x1'].map(sd => sum(exposed(r, sd, solids).map(e => e.to - e.from)))); if (sx < 3.4) bad('men-front', r.y0); else pen += 15; } }
    else if (b.kind === 'kitchen') { const dn = placed.find(q => q.block.kind === 'dining'); if (cT < 1.1 && !(dn && touch(r, dn.r) >= 1.2)) bad('kitchen-access', 1.1 - cT); }
    else if (b.kind === 'maid') { const k = find('kitchen1'); if (cT < 1.1 && !(k && touch(r, k.r) >= 1.0) && !placed.some(q => q.block.laundry && touch(r, q.r) >= 1.0)) bad('maid-access', 1.1 - cT); }
    else if (b.kind === 'store') { const k = find('kitchen1'); if (!(k && touch(r, k.r) >= 1.0) && !(b.laundry && cT >= 1.1)) bad('store-access', 1); }
    else if (cT < 1.1) bad('access:' + b.kind, 1.1 - cT);
    if (b.kind === 'suite' && !b.guest && cNoFoyer < 1.2) pen += 45; // غرفة نوم تفتح على مدخل العائلة: خصوصية ضعيفة
    // مجلس النساء من مدخل العائلة مباشرة: مسار الضيفات لا يمر بالصالة ولا بممر النوم
    if (b.kind === 'majlis' && !b.men && foyer && touch(r, foyer.r) < 2.2) bad('women-foyer', 2.2 - touch(r, foyer.r));
    // دورة مياه المجلس تتسع داخله (بنفس شروط التفصيل): عجز متدرج
    if (b.kind === 'majlis' && b.guestWc) {
      const d = bestDoorSide(p, circ, placed), dep = isX(d) ? w : h, L = sideLen(r, d);
      // غير الرجال: شريط على جهة الباب، أو خلفه، أو على جهة عمودية عليه (كما في التفصيل)
      const opts = b.men ? [Math.max(0, 3.5 - h, 5.0 - w), Math.max(0, 5.1 - h, 3.1 - w)] : [Math.max(0, 5.2 - dep, 3.4 - L), Math.max(0, 5.1 - dep, 3.1 - L), Math.max(0, 5.1 - L, 3.1 - dep)];
      const def = Math.min(...opts); if (def > 1e-6) bad('majlis-wc', def);
    }
    // النسبة بعد اقتطاع الشريط (مجلس بممر ودورة مياه، جناح بحمام)
    let asp = l / s;
    if (b.kind === 'majlis' && b.guestWc && b.men) { const m = menStrip(r); asp = Math.max(m.w, m.h) / Math.max(.1, Math.min(m.w, m.h)); }
    else if (b.kind === 'majlis' && b.guestWc) { const ws = [w - T.guestStripW, h], hs = [w, h - T.guestStripW]; asp = Math.min(Math.max(...ws) / Math.min(...ws), Math.max(...hs) / Math.min(...hs)); }
    if (b.kind === 'suite' || ((b.kind === 'maid' || b.kind === 'driver') && b.bath)) {
      const door = bestDoorSide(p, circ, placed), along = sideLen(r, door), dep = isX(door) ? w : h;
      let bw = along, bdp = dep;
      if (b.bath) ({ bw, bdp } = suiteVariant(b, along, dep));
      const ms = Math.min(bw, bdp), want = b.kind !== 'suite' ? 9 : b.master ? T.master : T.bedroom;
      { const lim = b.master ? 3.5 : b.kind === 'suite' ? 3.2 : 2.5; if (ms < lim) bad('suite-narrow', lim - ms); } // غرفة نوم صافيها ≥ 3.0 م
      if (ms < 3.3) pen += 60 * (3.3 - ms);
      if (b.master && b.bath && P.prefs?.masterDressing && dep < 3.9) pen += 70 + 40 * (3.9 - dep);
      pen += 25 * Math.log(bw * bdp / want) ** 2;
      if (b.kind === 'suite' && !b.guest) bedA.push({ b, a: bw * bdp });
      // الدوران: غرفة الأرضي (كبار السن) لا تزيد على الرئيسية في العلوي (تقدير الرئيسية: مقاسها المستهدف)
      if (ctx.capSuite && b.kind === 'suite' && !b.master && bw * bdp > ctx.capSuite) bad('suite-over-master', (bw * bdp - ctx.capSuite) / 3);
      asp = Math.max(bw, bdp) / Math.max(.1, Math.min(bw, bdp));
      // الواجهة الخارجية على جهة غير جهة الباب (يبقى للغرفة نافذة بعد الشريط)
      if (expLen(r, solids, SIDES.filter(x => x !== door)) < 2.4) pen += 90;
    }
    const mx = MAX_ASP[b.kind] || 2; { const lim = b.kind === 'suite' ? .25 : ['majlis', 'dining', 'kitchen', 'family'].includes(b.kind) ? .45 : .8; /* غرفة نوم لا تتجاوز نسبتها 2.0 */ if (asp > mx + lim && b.kind !== 'wc') bad('aspect:' + b.kind, asp - mx - lim); } if (asp > mx) pen += 70 * (asp - mx) * Math.max(1, b.area / 15) + 120 * Math.max(0, asp - mx - .5);
    const need = HABIT_EXP[b.kind]; if (need) { const e = expLen(r, solids); if (e < need) pen += b.kind === 'family' ? 25 : 90; if (e < 1.0 && b.kind !== 'family') bad('dark:' + b.kind, 1.0 - e); }
    if (b.kind === 'majlis') { pen += 4 * r.y0; for (const q of placed) if (q.block.kind === 'suite' && !q.block.guest && touch(r, q.r) > .5) pen += 30; }
    if (b.kind === 'suite' && !b.guest && r.y0 < TOL && D > 14) pen += 12; // غرفة نوم على الشارع
    // جودة فراغات الأسرة (حدود صلبة): مطبخ صافي عرضه ≥ 3.0 م (المحور ≥ 3.25)، وطعام لا شريطي (≤ 1.8)،
    // والمطبخ لا يطل على الشارع (الواجهة الأمامية) ما لم يطلبه العميل صراحة
    if (b.id === 'kitchen1') {
      if (s < KIT_MIN_AXIS) bad('kitchen-narrow', KIT_MIN_AXIS - s);
      if (!ctx.kitchenFront && sum(exposed(r, 'y0', solids).map(e => e.to - e.from)) > .6) bad('kitchen-street', 1);
    }
    if (b.kind === 'dining' && l / s > DIN_MAX_ASP) bad('dining-strip', l / s - DIN_MAX_ASP);
    // الطعام والمطبخ يُبلغان من المدخل أو الصالة لا عبر ممر غرف النوم وحده
    if (b.kind === 'dining' || (b.id === 'kitchen1')) {
      const dn = b.kind === 'kitchen' ? placed.find(q => q.block.kind === 'dining') : null;
      const viaDin = dn && touch(r, dn.r) >= 1.2;
      const ok = viaDin || circ.some(c => touch(r, c.r) >= 1.1 && !bedCorr(c));
      if (!ok) bad('family-via-beds', 1);
    }
  }
  // الأبعاد الصريحة: المقاس الصافي (المحور ناقص الجدار) قريب من المطلوب بأي اتجاه
  for (const [key, dm] of Object.entries(P.dims || {})) {
    if (!dm || !(dm.w > 0 && dm.l > 0)) continue;
    const pick = key === 'majlis' ? placed.filter(q => q.block.kind === 'majlis' && (q.block.men || !P.men)).slice(0, 1) : key === 'kitchen' ? placed.filter(q => q.block.id === 'kitchen1') : key === 'dining' ? placed.filter(q => q.block.kind === 'dining') : key === 'master' ? placed.filter(q => q.block.master) : key === 'bedroom' ? placed.filter(q => q.block.kind === 'suite' && !q.block.master) : key === 'hall' ? [{ block: {}, r: hall.r }] : [];
    for (const q of pick) {
      // الصافي كما يقيسه السجل: نصف سماكة الجدار من كل جهة (خارجي إن كانت الجهة كلها على الخارج، وإلا داخلي)
      const half = s => (expLen(q.r, solids, [s]) >= sideLen(q.r, s) - .05 ? EXT / 2 : INT / 2);
      let w = W_(q.r) - half('x0') - half('x1'), h = H_(q.r) - half('y0') - half('y1');
      // شريط ممر الضيوف ودورة مياههم: في مجلس الرجال على جهة x دائمًا (كما في التفصيل)، وفي غيره على جهة الباب
      if (q.block.kind === 'majlis' && q.block.guestWc) { if (q.block.men) { const m = menStrip(q.r); if (m.side === 'side') w -= T.guestStripW; else if (m.side === 'back') h -= 1.5; } else { const d = bestDoorSide(q, circ, placed); if (isX(d)) w -= T.guestStripW; else h -= T.guestStripW; } }
      if (q.block.kind === 'suite' && q.block.bath) { const v = suiteVariant(q.block, Math.max(w, h), Math.min(w, h)); w = v.bw; h = v.bdp; }
      const tol = Math.max(0, (Number.isFinite(dm.tol) ? dm.tol : .3) - .08), a = [Math.min(w, h), Math.max(w, h)], t = [Math.min(dm.w, dm.l), Math.max(dm.w, dm.l)];
      const ex = Math.max(0, Math.abs(a[0] - t[0]) - tol) + Math.max(0, Math.abs(a[1] - t[1]) - tol);
      // داخل السماحية المعلنة = مقبول؛ خارجها مخالفة (المقاس الصريح إلزام، والسجل يقيسه من المستند بالسماحية نفسها)
      pen += 400 * ex; if (ex > .04) bad('dims:' + key, ex);
    }
  }
  const k = find('kitchen1'), dn = find('dining1');
  // المطبخ يجاور الطعام مباشرة (لا تفصلهما الصالة): حد صلب متى وُجدا معًا
  if (k && dn) { const t = touch(k.r, dn.r); if (t < 1.2) bad('kitchen-dining', 1.2 - t); else pen -= 10; }
  if (P.men && dn && touch(find(P.men.id).r, dn.r) >= 1.2) pen -= 10; // الطعام للضيافة يجاور مجلس الرجال
  if (P.men && P.women[0]) { const m = find(P.men.id), wm = find(P.women[0].id); if (m && wm && touch(m.r, wm.r) > .5) pen += 10; }
  if (P.maid && k) pen += touch(find(P.maid.id).r, k.r) >= 1 ? -8 : 12;
  if (k) { const ext = SIDES.filter(s => s !== 'y0').some(s => exposed(k.r, s, solids).some(e => e.to - e.from >= 1.6)); if (!ext) pen += 15; } // باب خدمة
  // الغرفة الرئيسية أكبر غرف النوم، ولا غرفة أبناء متضخمة على حساب البقية
  { const m = bedA.find(x => x.b.master), others = bedA.filter(x => !x.b.master);
    // الرئيسية لا تصغر عن أي غرفة نوم أخرى (حد صلب)، ويُستحسن أن تزيد عليها بمتر مربع على الأقل
    if (m && others.length) { const big = Math.max(...others.map(x => x.a)); if (big > m.a - 1) pen += 80 + 25 * (big - m.a + 1); if (big > m.a - .2) bad('master-smaller', (big - m.a + .2) / 2); }
    if (others.length > 1) { const as = others.map(x => x.a), mean = sum(as) / as.length; pen += 6 * sum(as.map(a => Math.max(0, a - mean * 1.25))); } }
  const master = placed.find(p => p.block.master);
  if (master) pen += 3 * Math.max(0, D * .55 - (master.r.y0 + master.r.y1) / 2);
  // الحركة: الممرات نسبة من المسطح
  const built = sum(solids.map(A_)), corrA = sum(circ.filter(c => !['hall', 'stair'].includes(c.id)).map(c => A_(c.r)));
  const cr = corrA / built, ck = P.tweaks?.lessCorridors ? 3 : 1; pen += ck * (200 * cr + (cr > .10 ? 900 * (cr - .10) : 0)); // هدف الحركة ≤ 15% من المسطح (الممرات والمدخل)
  const target = sum(P.blocks.map(b => b.area)) + P.hallArea + T.foyer + 12;
  if (built > target * 1.3) pen += 2 * (built - target * 1.3);
  if (ctx.maxBuilt && built > ctx.maxBuilt) bad('coverage', (built - ctx.maxBuilt) / 10);
  if (ctx.minEnv && W * D < ctx.minEnv) bad('env-small', (ctx.minEnv - W * D) / 10); // الدور العلوي يحتاج هذا المسطح
  // الدور العلوي يبني محوره (صالة علوية) على عرض فراغ السلم نفسه: لا يقل عن عرض صالة
  if (ctx.minEnv) { const st = cid('stair'); if (st && W_(st.r) < CMIN.hall + .2) bad('stair-hub', CMIN.hall + .2 - W_(st.r)); }
  if (ctx.minEnv) { const st = cid('stair'); if (st) { if (st.r.x0 < 3.7) bad('upper-left', 3.7 - st.r.x0); if (W - st.r.x1 < 3.7) bad('upper-right', 3.7 - (W - st.r.x1)); } } // أجنحة العلوي على جانبي السلم
  // «الرئيسية بعيدة عن الدرج» في دورين: يُستحسن عمق خلف السلم يتسع لصالة علوية ثم الجناح الرئيسي خلفها
  if (ctx.backAfterStair) { const st = cid('stair'); if (st && D - st.r.y1 < ctx.backAfterStair) pen += 35 * (ctx.backAfterStair - (D - st.r.y1)); }
  if (ctx.out) ctx.out.viol = viol;
  sol.viol = viol;
  return pen;
}
/** جهة الباب الفعلية لكتلة: الجهة الأطول تلامسًا مع الحركة (غرف النوم تتجنب مدخل العائلة)، وإلا نحو المضيف. */
function bestDoorSide(p, circ, placed) {
  const b = p.block, r = p.r, priv = b.kind === 'suite' || b.kind === 'maid';
  const lens = SIDES.map(s => { let L = 0; for (const c of circ) { if (priv && c.id === 'foyer') continue; const e = shared(r, c.r); if (e && e.side === s) L += e.to - e.from; } return L; });
  const pref = SIDES.indexOf(p.door);
  if (pref >= 0 && lens[pref] >= 1.1) return p.door;
  const i = lens.indexOf(Math.max(...lens)); if (lens[i] >= 1.1) return SIDES[i];
  const hostKind = b.kind === 'kitchen' ? 'dining' : b.kind === 'maid' || b.kind === 'store' ? 'kitchen' : null;
  const host = hostKind && placed.find(q => q.block.kind === hostKind && touch(r, q.r) >= 1);
  if (host) return shared(r, host.r).side;
  // مدخل الضيف: لا حركة داخلية؛ الجهة الداخلية الأطول
  return p.door || 'y1';
}

// ------------------------------------------------------------------------------------------ البحث المحلي في الأبعاد
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function weightNodes(n, acc = []) { if (n.w && n.w.length > 1) acc.push(n); if (n.k) for (const c of n.k) weightNodes(c, acc); return acc; }
/**
 * يبحث عن أفضل أبعاد لشجرة: أوزان التقسيم وعرض الغلاف وعمقه داخل الأرض القابلة للبناء.
 * evalFn(sol, ew, ed) → جزاء أو null. حتمي (بذرة من اسم النمط).
 */
const SA_T0 = 150; // حرارة التلدين الابتدائية (بمقياس الجزاء)
function optimize(tree, site, evalFn, { iters = 140, seed = 'x' } = {}) {
  const nodes = weightNodes(tree), R = rng(hash(seed)), A = areaOf(tree) * 1.04;
  // مناطق بأكثر من كتلة: ترتيب الكتل داخلها قابل للتبديل (المطبخ قبل الطعام أو بعده…) — يبقى النمط نفسه
  const zones = nodes.filter(n => n.t === 'zone' && n.b.length > 1);
  const minW = minExt(tree, 'x'), minD = minExt(tree, 'y');
  if (minW > site.W + 1e-6 || minD > site.D + 1e-6) return null; // لا يتسع بأدنى أبعاده: لا يُستنزف فيه البحث
  const ev = (ew, ed) => { if (ew < minW - 1e-6 || ed < minD - 1e-6 || ew > site.W + 1e-6 || ed > site.D + 1e-6) return null; if (site.fit && !site.fit(ew, ed)) return null; const sol = solve(tree, ew, ed); if (!sol) return null; const p = evalFn(sol, ew, ed); return p === null ? null : { p, sol }; };
  // جهة المخزن المقتطع من مطبخ بمقاس صريح (جهة الحركة أو الجهة المقابلة) متغير بحث أيضًا
  const kz = []; (function walk(n) { if (n.t === 'zone' && n.b.some(b => (b.dimGross && b.kind === 'kitchen') || b.kind === 'maid')) kz.push(n); if (n.k) n.k.forEach(walk); })(tree);
  const snapW = () => ({ ws: nodes.map(n => [...n.w]), ord: zones.map(z => [...z.b]), ps: kz.map(z => z.pside || 0) });
  const load = st => { nodes.forEach((n, i) => { n.w = [...st.ws[i]]; }); zones.forEach((z, i) => { z.b = [...st.ord[i]]; }); kz.forEach((z, i) => { z.pside = st.ps[i]; }); };
  let best = null;
  const ord0 = zones.map(z => [...z.b]);
  const inits = [];
  for (const rho of [.8, 1.1, 1.45, 1.9]) { let w = Math.sqrt(A / rho), d = rho * w; w = Math.max(minW, Math.min(site.W, w)); d = Math.max(minD, Math.min(site.D, A / w)); inits.push([snap(w), snap(d)]); }
  inits.push([snap(Math.max(minW, Math.min(site.W, A / Math.min(site.D, Math.max(minD, A / site.W))))), snap(Math.min(site.D, Math.max(minD, A / site.W)))]);
  const seen = new Set();
  // إعادة بدء عشوائية إن بقيت مخالفة بعد البدايات المنتظمة
  for (let k = 0; k < 4; k++) inits.push(null);
  let tried = 0;
  for (const init of inits) {
    if (!init && best && !best.sol.viol) break;
    // بعد بدايتين منتظمتين: نمط بقيت فيه ثلاث مخالفات أو أكثر بعيد عن القبول لهذا البرنامج — يُترك مبكرًا
    if (tried >= 2 && (!best || best.sol.viol >= 3)) break;
    // إعادة البدء العشوائية تُجرَّب فقط إن بقيت مخالفة أو اثنتان (نمط بعيد عن القبول لا يُستنزف فيه الوقت)
    if (!init && (!best || best.sol.viol > 2)) break;
    const [w0, d0] = init || [snap(Math.max(minW, Math.min(site.W, Math.sqrt(A / (.8 + R() * 1.2))))), 0].map((v, i) => i ? snap(Math.max(minD, Math.min(site.D, A / v))) : v);
    const key = w0 + 'x' + d0; if (init && seen.has(key)) continue; seen.add(key);
    zones.forEach((z, i) => { z.b = [...ord0[i]]; });
    nodes.forEach(n => { n.w = n.w.map(() => (init ? 1 : Math.exp((R() - .5) * 1.0))); });
    let ew = w0, ed = d0, cur = ev(ew, ed);
    // إن لم يُقبل: محاولات عشوائية قليلة للأوزان
    for (let t = 0; !cur && t < 40; t++) { nodes.forEach(n => { n.w = n.w.map(() => Math.exp((R() - .5) * 1.2)); }); ew = snap(Math.max(minW, Math.min(site.W, w0 * Math.exp((R() - .5) * .3)))); ed = snap(Math.max(minD, Math.min(site.D, d0 * Math.exp((R() - .5) * .3)))); cur = ev(ew, ed); }
    if (!cur) continue;
    tried++;
    let curW = snapW(), lb = { ...cur, ew, ed, weights: curW };
    for (let it = 0; it < iters; it++) {
      const ws = { ws: curW.ws.map(x => [...x]), ord: curW.ord.map(x => [...x]), ps: [...curW.ps] }; let nw = ew, nd = ed;
      const pick = R();
      if (kz.length && pick > .96) { const i = Math.floor(R() * kz.length); ws.ps[i] = 1 - ws.ps[i]; }
      else if (pick < .18) nw = snap(ew * Math.exp((R() - .5) * .16)); else if (pick < .36) nd = snap(ed * Math.exp((R() - .5) * .16));
      else if (pick < .46 && zones.length) {
        // تبديل كتلتين متجاورتين في منطقة (مع وزنيهما)
        const zi = Math.floor(R() * zones.length), z = zones[zi], ni = nodes.indexOf(z), j = Math.floor(R() * (z.b.length - 1));
        const o = ws.ord[zi];[o[j], o[j + 1]] = [o[j + 1], o[j]]; const w = ws.ws[ni];[w[j], w[j + 1]] = [w[j + 1], w[j]];
      }
      else if (nodes.length) { const i = Math.floor(R() * nodes.length), j = Math.floor(R() * ws.ws[i].length); ws.ws[i][j] *= Math.exp((R() - .5) * .7); }
      load(ws); const c = ev(nw, nd);
      // تلدين محاكى: يُقبل الأسوأ أحيانًا بحرارة تتناقص، فيخرج البحث من حلول محلية (صالة طويلة لأن الطعام في آخر الجناح…)
      const Tk = SA_T0 * Math.pow(.01, it / iters);
      if (c && (c.p < cur.p || R() < Math.exp((cur.p - c.p) / Tk))) { cur = c; ew = nw; ed = nd; curW = ws; if (!lb || cur.p < lb.p) lb = { ...cur, ew, ed, weights: curW }; } else load(curW);
    }
    if (lb && lb.p < cur.p) { cur = lb; ew = lb.ew; ed = lb.ed; curW = lb.weights; load(curW); }
    if (!best || cur.p < best.p) best = { ...cur, ew, ed, weights: curW };
  }
  if (best) load(best.weights);
  return best;
}

// ------------------------------------------------------------------------------------------ الأرض
/** إزاحة مضلع محدب للداخل بارتداد لكل ضلع (حسب جهة الضلع: شارع أو جار). */
function insetPolygon(poly, sbOf) {
  const n = poly.length, area2 = sum(poly.map((p, i) => p.x * poly[(i + 1) % n].y - poly[(i + 1) % n].x * p.y)), ccw = area2 > 0;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n], dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
    const out = ccw ? { x: dy / L, y: -dx / L } : { x: -dy / L, y: dx / L };
    const side = Math.abs(out.x) > Math.abs(out.y) ? (out.x > 0 ? 'e' : 'w') : (out.y > 0 ? 'n' : 's');
    const d = sbOf(side);
    return { p: { x: p.x - out.x * d, y: p.y - out.y * d }, d: { x: dx, y: dy }, side };
  });
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n], b = lines[i], den = a.d.x * b.d.y - a.d.y * b.d.x;
    if (Math.abs(den) < 1e-9) { pts.push(b.p); continue; }
    const t = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / den;
    pts.push({ x: a.p.x + a.d.x * t, y: a.p.y + a.d.y * t });
  }
  return { pts, sides: lines.map(l => l.side) };
}
const polyArea = poly => Math.abs(sum(poly.map((p, i) => p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y))) / 2;
/** مجال x الداخل في المضلع عند المستوى y (مضلع محدب). */
function xRange(poly, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.y - y) * (b.y - y) > 0) continue;
    if (Math.abs(a.y - b.y) < 1e-9) { lo = Math.min(lo, a.x, b.x); hi = Math.max(hi, a.x, b.x); continue; }
    const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y); lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return [lo, hi];
}
/** الإطار القانوني للمولّد: x عبر الواجهة، y من المدخل إلى الخلف، داخل صندوق fp بإحداثيات المستند. */
function frameOf(fp, entry) {
  return (X0, Y0) => (entry === 's' ? { x: fp.x + X0, y: fp.y + Y0 } : entry === 'n' ? { x: fp.x + fp.w - X0, y: fp.y + fp.h - Y0 } : entry === 'e' ? { x: fp.x + fp.w - Y0, y: fp.y + X0 } : { x: fp.x + Y0, y: fp.y + fp.h - X0 });
}
function unframe(fp, entry) {
  return p => (entry === 's' ? { x: p.x - fp.x, y: p.y - fp.y } : entry === 'n' ? { x: fp.x + fp.w - p.x, y: fp.y + fp.h - p.y } : entry === 'e' ? { x: p.y - fp.y, y: fp.x + fp.w - p.x } : { x: fp.y + fp.h - p.y, y: p.x - fp.x });
}
/**
 * أرض شبه منحرف من كلام العميل (متطلبات الإصدار الثاني: req.site = { front, back, depth }) حين لا يُعطى مضلع صريح:
 * الواجهة على جهة المدخل والخلف موازٍ لها، متمركزان. +x شرق، +y شمال. يعيد land نفسه إن لم يكفِ الوصف.
 */
export function landWithSite(land = {}, req = {}) {
  if (Array.isArray(land.polygon) && land.polygon.length >= 3) return land;
  const st = req?.site; const F = Number(st?.front), Bk = Number(st?.back), Dp = Number(st?.depth);
  if (!st || !(F > 0 && Bk > 0 && Dp > 0)) return land;
  const Wm = Math.max(F, Bk), canon = [{ x: (Wm - F) / 2, y: 0 }, { x: (Wm + F) / 2, y: 0 }, { x: (Wm + Bk) / 2, y: Dp }, { x: (Wm - Bk) / 2, y: Dp }];
  const e = land.entries?.[0] || land.entry || 's';
  const map = p => (e === 's' ? p : e === 'n' ? { x: Wm - p.x, y: Dp - p.y } : e === 'e' ? { x: Dp - p.y, y: p.x } : { x: p.y, y: Wm - p.x });
  return { ...land, polygon: canon.map(map) };
}
/**
 * الأرض: مستطيل { width, length } أو مضلع { polygon:[{x,y}...] } (+x شرق، +y شمال)، مع الشوارع والمداخل.
 * يعيد الصندوق القابل للبناء في الإطار القانوني (W×D) ودالة تحقق احتواء الغلاف داخل المضلع المُزاح.
 */
export function siteOf(land = {}) {
  const poly = Array.isArray(land.polygon) && land.polygon.length >= 3 ? land.polygon.map(p => ({ x: Number(p.x), y: Number(p.y) })) : null;
  let width = Number(land.width), length = Number(land.length), off = { x: 0, y: 0 };
  if (poly) { const xs = poly.map(p => p.x), ys = poly.map(p => p.y); off = { x: Math.min(...xs), y: Math.min(...ys) }; width = Math.max(...xs) - off.x; length = Math.max(...ys) - off.y; }
  const plot = validatePlot({ width, length, floors: 1, streets: Object.fromEntries((land.streets || []).map(s => [s, true])), entry: land.entries?.[0] || land.entry });
  const entry = plot.entry;
  if (!poly) {
    // الوجه الخارجي للجدار (لا محوره) داخل خط الارتداد: يُنقص نصف سماكة الجدار الخارجي من كل جهة
    const f0 = footprint(plot), hw = EXT / 2 + .005, fp = { ...f0, x: f0.x + hw, y: f0.y + hw, w: f0.w - 2 * hw, h: f0.h - 2 * hw };
    const W = ['s', 'n'].includes(entry) ? fp.w : fp.h, D = ['s', 'n'].includes(entry) ? fp.h : fp.w;
    return { plot, entry, fp, W, D, polygon: [{ x: 0, y: 0 }, { x: plot.width, y: 0 }, { x: plot.width, y: plot.length }, { x: 0, y: plot.length }], setbacks: f0.sb, fit: null, place: (ew) => ({ ox: snap((W - ew) / 2), oy: 0 }), maxBuilt: null, irregular: false };
  }
  // مضلع: الإحداثيات تُنقل بحيث يبدأ صندوقه من الصفر
  const P0 = poly.map(p => ({ x: p.x - off.x, y: p.y - off.y }));
  const sbOf = s => (plot.streets[s] ? plot.streetSetback : plot.neighborSetback);
  const { pts: inner } = insetPolygon(P0, s => sbOf(s) + EXT / 2 + .005);
  const ix = inner.map(p => p.x), iy = inner.map(p => p.y);
  const fp = { x: Math.min(...ix), y: Math.min(...iy), w: Math.max(...ix) - Math.min(...ix), h: Math.max(...iy) - Math.min(...iy) };
  const toC = unframe(fp, entry), canon = inner.map(toC);
  const W = ['s', 'n'].includes(entry) ? fp.w : fp.h, D = ['s', 'n'].includes(entry) ? fp.h : fp.w;
  const range = (y0, y1) => { let lo = -Infinity, hi = Infinity; for (let k = 0; k <= 4; k++) { const [a, b] = xRange(canon, y0 + (y1 - y0) * k / 4); lo = Math.max(lo, a); hi = Math.min(hi, b); } return [lo, hi]; };
  const cache = new Map();
  const place = (ew, ed) => {
    const key = ew.toFixed(2) + ':' + ed.toFixed(2); if (cache.has(key)) return cache.get(key);
    let res = null;
    for (let oy = 0; oy + ed <= D + 1e-6; oy += .25) {
      const [lo0, hi0] = range(oy, oy + ed), lo = lo0 + .02, hi = hi0 - .02; if (hi - lo < ew - 1e-6) continue;
      let ox = snap(lo + (hi - lo - ew) / 2); if (ox < lo) ox += SNAP; if (ox + ew > hi) ox -= SNAP; if (ox < lo - 1e-9 || ox + ew > hi + 1e-9) continue;
      res = { ox, oy: snap(oy) }; break;
    }
    cache.set(key, res); return res;
  };
  /**
   * احتواء كل فراغ مبني (لا الغلاف كله) داخل المضلع المُزاح: المبنى يتبع شكل الأرض، والفراغات الخارجية
   * (هوامش وحدائق) يجوز أن تقع خارجه. يعيد { ox, oy, over } — over > 0 = أقل تجاوز ممكن (للبحث المتدرج).
   */
  const placeRects = (rects, ew, ed) => {
    let best = null;
    for (let oy = 0; oy + ed <= D + 1e-6; oy += .25) {
      let lo = -Infinity, hi = Infinity;
      for (const r of rects) { const [a, b] = range(oy + r.y0, oy + r.y1); lo = Math.max(lo, a + .02 - r.x0); hi = Math.min(hi, b - .02 - r.x1); }
      if (hi >= lo - 1e-9) { let ox = snap((lo + hi) / 2); if (ox < lo - 1e-9) ox += SNAP; if (ox > hi + 1e-9) ox -= SNAP; if (ox >= lo - 1e-9 && ox <= hi + 1e-9) return { ox, oy: snap(oy), over: 0 }; }
      if (!best || lo - hi < best.over) best = { ox: null, oy, over: lo - hi };
    }
    return best || { ox: null, oy: 0, over: 99 };
  };
  /** أعرض مستطيل كامل بعمق ed يتسع في المضلع (ما كان سيبنيه مولّد يقبل المستطيل فقط). */
  const rectW = ed => { let m = 0; for (let oy = 0; oy + ed <= D + 1e-6; oy += .5) { const [a, b] = range(oy, oy + ed); m = Math.max(m, b - a - .04); } return m; };
  const sb = { s: sbOf('s'), n: sbOf('n'), e: sbOf('e'), w: sbOf('w') };
  return { plot, entry, fp, W, D, polygon: P0, setbacks: sb, fit: null, place, placeRects, rectW, maxBuilt: polyArea(P0) * plot.coverage, irregular: true, inner };
}

// ------------------------------------------------------------------------------------------ التفصيل: غرف وأبواب
const CIRC_TYPE = { foyer: 'entrance', hall: 'living', stair: 'stairs' };
/** يحوّل الترتيب المحلول إلى غرف (مع تقسيم الأجنحة والمجالس) وأبواب. الإحداثيات قانونية داخل الغلاف. */
export function realizeV2(cand, P, { secondEntry = null, upper = false } = {}) {
  const T = DESIGN_TARGETS, rooms = [], doors = [], notes = [];
  let extraBaths = P.extraBaths;
  const sn = r => ({ x0: snap(r.x0), y0: snap(r.y0), x1: snap(r.x1), y1: snap(r.y1) });
  const add = (r, o) => { const x = { ...sn(r), ...o }; rooms.push(x); return x; };
  const placed = cand.sol.placed.map(p => ({ ...p, r: sn(p.r) })), circ = cand.sol.circ.map(c => ({ ...c, r: sn(c.r) }));
  for (const p of placed) p.door = bestDoorSide(p, circ, placed);
  const parents = [...placed.map(p => p.r), ...circ.map(c => c.r)], courtsR = cand.sol.courts.map(sn);
  const container = r => parents.find(q => r.x0 >= q.x0 - TOL && r.x1 <= q.x1 + TOL && r.y0 >= q.y0 - TOL && r.y1 <= q.y1 + TOL);
  /** حواف تطل على الضوء (خارج أو حوش)؛ withCourts=false: الخارج الحقيقي فقط (للمداخل والأبواب الخارجية). */
  const edges = (r, outsideOnly = false) => { const c = container(r), others = [...parents.filter(q => q !== c), ...(outsideOnly ? courtsR : [])]; return SIDES.flatMap(s => (c && Math.abs(r[s] - c[s]) > TOL ? [] : exposed(r, s, others))); };
  const isExtSide = (r, s) => edges(r).some(e => e.side === s && e.to - e.from >= sideLen(r, s) - .05);
  const hallName = upper ? (P.upperHallName || 'الصالة العلوية') : (P.hall ? 'الصالة' : 'صالة الحركة');
  const circName = id => (id === 'foyer' ? (P.men ? 'مدخل العائلة' : 'الردهة') : id === 'hall' ? hallName : id === 'stair' ? 'الدرج' : 'ممر الغرف');
  const circRooms = circ.map(c => add(c.r, { id: c.id, circ: true, type: CIRC_TYPE[c.id] || 'corridor', name: circName(c.id) }));
  const foyer = circRooms.find(c => c.id === 'foyer');
  if (foyer && !upper) doors.push({ a: 'foyer', edge: { axis: 'y', at: foyer.y0, from: foyer.x0, to: foyer.x1 }, kind: 'door2', w: Math.min(1.6, W_(foyer) - .6), entry: true });
  for (let i = 0; i < circRooms.length; i++) for (let j = i + 1; j < circRooms.length; j++) {
    const a = circRooms[i], b = circRooms[j], e = shared(a, b); if (!e || e.to - e.from < 1.2) continue;
    const narrow = [a, b].some(c => !['hall', 'foyer', 'stair'].includes(c.id));
    doors.push({ a: a.id, b: b.id, edge: e, kind: 'arch', w: Math.min(narrow ? 1.4 : 2.6, e.to - e.from - .4) });
  }
  // الأحواش: غرفة مكشوفة يُدخل إليها من الصالة (باب زجاجي) أو من أطول حركة تلامسها
  courtsR.forEach((ct, i) => {
    const c = add(ct, { id: 'court' + (i + 1), type: 'courtyard', name: 'الحوش الداخلي', open: true });
    const host = [...circRooms].sort((a, b) => (b.id === 'hall') - (a.id === 'hall') || touch(c, b) - touch(c, a)).find(h => touch(c, h) >= 1.4);
    if (host) { const e = shared(host, c), w = Math.min(2.0, e.to - e.from - .4); doors.push({ a: c.id, b: host.id, edge: e, pos: e.to - e.from >= 4.2 ? e.from + .35 + w / 2 : (e.from + e.to) / 2, kind: 'slider', w }); }
  });
  // أزواج الحمامات: شريط الجناح نحو جاره من الأجنحة، وإلا نحو جدار داخلي ليبقى للغرفة جدار خارجي
  const suites = placed.filter(p => ['suite', 'maid'].includes(p.block.kind) && p.block.bath);
  const stripSide = new Map();
  for (const p of suites) {
    const perp = isX(p.door) ? ['y0', 'y1'] : ['x0', 'x1'];
    const already = perp.find(s => suites.some(q => q !== p && stripSide.get(q) === opp[s] && Math.abs(p.r[s] - q.r[opp[s]]) < TOL && touch(p.r, q.r) > 1));
    if (already) { stripSide.set(p, already); continue; }
    const mate = perp.find(s => suites.some(q => q !== p && !stripSide.has(q) && Math.abs(p.r[s] - q.r[opp[s]]) < TOL && touch(p.r, q.r) > 1));
    const interior = perp.find(s => !isExtSide(p.r, s));
    // الحركة تلامس جزءًا من جهة الباب فقط (جناح في نهاية ممر): الشريط في الطرف البعيد عن موضع التلامس ليبقى الباب على الحركة
    const spans = circ.map(c => shared(p.r, c.r)).filter(e => e && e.side === p.door && e.to - e.from >= .9);
    let away = null;
    if (spans.length) {
      const e0 = edgeOf(p.r, p.door), cov = sum(spans.map(e => e.to - e.from));
      if (cov < (e0.to - e0.from) - 1.2) { const mid = sum(spans.map(e => (e.from + e.to) / 2 * (e.to - e.from))) / cov; away = mid < (e0.from + e0.to) / 2 ? perp[1] : perp[0]; }
    }
    stripSide.set(p, away || mate || interior || perp[0]);
  }
  let pendingGuestWc = null; const pendingService = [];
  for (const p of placed) detail(p);
  for (const m of pendingService) {
    const host = rooms.find(x => ['dining', 'kitchen'].includes(x.kind) && touch(m, x) >= 1.2);
    if (host) { const e = shared(m, host); doors.push({ a: m.id, b: host.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .9 }); host.guestDoor = true; notes.push(`مجلس الرجال بمدخل خارجي مستقل${m.noWc ? '' : ' ودورة مياه خاصة'}، ولا يمر الضيف بالعائلة؛ له باب خدمة إلى «${host.name}» للضيافة.`); }
    else notes.push(`مجلس الرجال بمدخل خارجي مستقل${m.noWc ? '' : ' ودورة مياه خاصة'}، ومنفصل تمامًا عن العائلة (بلا باب داخلي).`);
  }
  // الطعام الذي يخدم الضيوف: بابه إلى الصالة باب يُغلق (لا فتحة) حتى لا ينكشف القسم العائلي
  for (const d of doors) { const r = rooms.find(x => x.id === d.a); if (r && r.guestDoor && d.b && d.kind === 'arch' && circRooms.some(c => c.id === d.b)) { d.kind = 'door'; d.w = Math.min(1.2, d.w); } }
  if (pendingGuestWc && !(foyer && foyerWc(pendingGuestWc))) { extraBaths++; notes.push('دورة مياه الضيوف لم تتسع بجوار المجلس فوُضعت مع دورات المياه العامة.'); }
  for (const p of placed.filter(q => q.block.ext)) {
    const room = rooms.find(r => r.id === p.block.id); if (!room) continue;
    const e = edges(room, true).filter(x => p.block.kind === 'office' || x.side !== 'y0').sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
    if (e && e.to - e.from >= 1.4) { doors.push({ a: room.id, edge: e, pos: e.from + Math.min(.9, (e.to - e.from) / 2), kind: 'door', w: .9, entry: true }); notes.push(`«${room.name}» بباب خارجي مستقل.`); }
    else notes.push(`«${room.name}»: لم يلامس جدارًا خارجيًا مناسبًا لباب مستقل في هذا البديل.`);
  }
  const kit = rooms.find(r => r.id === 'kitchen1'), din = rooms.find(r => r.id === 'dining1');
  if (P.kitchenStrip?.length) { if (!kit || !kitchenStrip(kit, P.kitchenStrip)) notes.push(`${P.kitchenStrip.map(k => k === 'laundry' ? 'غرفة الغسيل' : 'المخزن').join(' و')} لم تتسع بجوار المطبخ في هذا البديل.`); }
  for (const kind of ['kitchen', 'family', 'dining']) for (const host of rooms.filter(r => r.kind === kind && !r.dimLocked)) { if (extraBaths <= 0) break; if (bathStrip(host)) extraBaths--; }
  if (extraBaths > 0) notes.push(`${extraBaths} دورة مياه إضافية لم تجد موضعًا مناسبًا في هذا البديل.`);
  if (kit && din) {
    const e = shared(kit, din);
    if (e && e.to - e.from >= 1.2) { const open = P.prefs?.openKitchen; doors.push({ a: kit.id, b: din.id, edge: e, pos: (e.from + e.to) / 2, kind: open ? 'arch' : 'door', w: open ? Math.min(2.6, e.to - e.from - .6) : .95 }); }
    else if (P.prefs?.openKitchen) notes.push('المطبخ المفتوح: المطبخ لا يجاور الطعام في هذا البديل؛ اختر بديلًا آخر أو حرّكهما في المرسم.');
  }
  if (!upper && P.prefs?.familyEntrance) {
    const pick = [rooms.find(r => r.id === 'majlis2-lobby'), rooms.find(r => r.id === 'majlis2'), ...circRooms.filter(c => c.id !== 'foyer'), ...rooms.filter(r => r.kind === 'family'), din].filter(Boolean);
    let done = false;
    for (const r of pick) {
      const e = edges(r, true).filter(x => x.side !== 'y0').sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
      if (e && e.to - e.from >= 1.4) { doors.push({ a: r.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: 1.0, family: true }); notes.push(`مدخل العائلة المستقل: باب جانبي إلى «${r.name}».`); done = true; break; }
    }
    if (!done) notes.push('مدخل العائلة المستقل: الباب الأمامي لمدخل العائلة منفصل عن مدخل الرجال؛ لم يتسع باب جانبي إضافي في هذا البديل.');
  }
  if (!upper && secondEntry) {
    // المدخل الثاني: إلى المدخل أو الصالة أو الضيافة — لا إلى ممر غرف النوم
    const prefer = [...circRooms.filter(c => ['foyer', 'hall', 'stair'].includes(c.id)), ...rooms.filter(r => ['majlis', 'family', 'dining'].includes(r.kind) || r.kind === 'lobby')];
    let done = false;
    for (const r of prefer) {
      const e = edges(r, true).find(x => x.side === secondEntry);
      if (e && e.to - e.from >= 1.4) { doors.push({ a: r.id, edge: e, pos: (e.from + e.to) / 2, kind: r.circ ? 'door2' : 'door', w: r.circ ? 1.4 : 1.0, entry2: true }); notes.push(`المدخل الثاني للأرض: باب إلى «${r.name}».`); done = true; break; }
    }
    if (!done) notes.push('المدخل الثاني للأرض: لا يلامس فراغًا عامًا مناسبًا على تلك الجهة في هذا البديل؛ يمكن إضافته في المرسم.');
  }
  // فراغ خدمة بقي بلا باب (غرفة الخادمة بعد اقتطاع حمامها، أو الغسيل): يُوصل بجار خدمي موصول (الغسيل/المطبخ/الممر)
  for (const r of rooms.filter(x => ['maid', 'laundry', 'store'].includes(x.kind))) {
    if (r.kind === 'maid' && r.id !== 'maid') continue;
    const own = id => id === r.id || String(id).startsWith(r.id + '-');
    if (doors.some(d => (own(d.a) && d.b && !own(d.b)) || (own(d.b) && !own(d.a)) || (own(d.a) && !d.b && d.entry))) continue;
    const host = rooms.filter(x => x !== r && !own(x.id) && (['laundry', 'kitchen', 'store'].includes(x.kind) || x.circ || x.kind === 'lobby') && touch(r, x) >= 1.0 && doors.some(d => d.a === x.id || d.b === x.id)).sort((a, b) => touch(r, b) - touch(r, a))[0];
    if (host) { const e = shared(r, host); doors.push({ a: r.id, b: host.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: Math.min(.85, e.to - e.from - .3) }); notes.push(`«${r.name}» يُدخل إليها من «${host.name}».`); }
  }
  // تثبيت نهائي: كل باب داخلي على الحد المشترك الفعلي بين غرفتيه بعد كل الاقتطاعات (وإلا يُحذف)
  const byId = new Map(rooms.map(r => [r.id, r]));
  for (let i = doors.length - 1; i >= 0; i--) {
    const d = doors[i]; if (!d.b) continue;
    const A = byId.get(d.a), B = byId.get(d.b), e = A && B && shared(A, B);
    if (!e || e.to - e.from < .8) { doors.splice(i, 1); continue; }
    const w = Math.min(d.w ?? .9, e.to - e.from - .25); if (w < .6) { doors.splice(i, 1); continue; }
    const lo = e.from + .12 + w / 2, hi = e.to - .12 - w / 2, p0 = d.pos ?? (d.edge.from + d.edge.to) / 2;
    d.edge = e; d.w = w; d.pos = Math.max(lo, Math.min(hi, p0));
  }
  // باب واحد بين كل غرفتين
  const seenPair = new Set();
  for (let i = 0; i < doors.length; i++) { const d = doors[i]; if (!d.b) continue; const k = [d.a, d.b].sort().join('|'); if (seenPair.has(k)) { doors.splice(i--, 1); continue; } seenPair.add(k); }
  return { rooms, doors, notes, W: cand.ew, D: cand.ed, mode: cand.mode };

  function circDoor(id, r, side, kind, w, prefer) {
    const priv = /^suite|bath|vest|maid/.test(id);
    const spansOn = sd => circRooms.map(c => { const s = shared(r, c); return s && s.side === sd ? { ...s, cid: c.id } : null; }).filter(Boolean);
    const okLen = sp => sp.to - sp.from >= Math.min(w, .8) + .25;
    let spans = spansOn(side).filter(okLen);
    if (!spans.length) spans = SIDES.flatMap(spansOn).filter(okLen);
    if (!spans.length) { notes.push(`تعذّر وصل «${id}» بالحركة.`); return false; }
    let pool = priv && spans.some(sp => sp.cid !== 'foyer') ? spans.filter(sp => sp.cid !== 'foyer') : spans;
    if (/bath/.test(id) && P.prefs?.bathsOffHall && pool.some(sp => sp.cid !== 'hall')) pool = pool.filter(sp => sp.cid !== 'hall');
    if (priv && pool.some(sp => sp.cid !== 'stair')) pool = pool.filter(sp => sp.cid !== 'stair'); // لا باب غرفة على قلبة الدرج
    if (priv && pool.some(sp => !['hall', 'foyer'].includes(sp.cid))) pool = pool.filter(sp => !['hall', 'foyer'].includes(sp.cid));
    // الضيافة (مجلس النساء وممره): من مدخل العائلة فقط متى أمكن، فلا يمر الضيف بالصالة
    if (/^majlis/.test(id) && pool.some(sp => sp.cid === 'foyer')) pool = pool.filter(sp => sp.cid === 'foyer');
    const best = pool.sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
    const ww = Math.min(w, best.to - best.from - .25); if (ww < .7) return false;
    const lo = best.from + .12 + ww / 2, hi = best.to - .12 - ww / 2;
    const pos = prefer === undefined || prefer === null ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, prefer));
    doors.push({ a: id, b: best.cid, edge: best, pos, kind, w: ww });
    return true;
  }
  function hostDoor(room, kinds, kind = 'door', w = .9) {
    const host = rooms.filter(x => kinds.includes(x.kind) && touch(room, x) >= 1.0).sort((a, b) => touch(room, b) - touch(room, a))[0];
    if (!host) return false; const e = shared(room, host); doors.push({ a: room.id, b: host.id, edge: e, pos: (e.from + e.to) / 2, kind, w: Math.min(w, e.to - e.from - .3) }); return true;
  }
  function detail(p) {
    const b = p.block, r = p.r, side = p.door;
    if (b.kind === 'office' || b.kind === 'prayer') { const o = add(r, { id: b.id, type: b.kind === 'office' ? 'office' : 'other', name: b.name, kind: b.kind, door: side }); circDoor(o.id, o, side, 'door', .95); return; }
    if (b.kind === 'suite' || b.kind === 'maid' || b.kind === 'driver') {
      const type = b.master ? 'master' : b.kind === 'suite' ? 'bedroom' : 'service';
      const bathName = b.kind === 'maid' ? 'حمام الخادمة' : b.kind === 'driver' ? 'حمام السائق' : null;
      const connect = (room, sd, pos) => (b.kind === 'maid' ? (hostDoor(room, ['kitchen']) || circDoor(room.id, room, sd, 'door', .9, pos)) : circDoor(room.id, room, sd, 'door', .95, pos));
      if (b.kind === 'driver') {
        const room = add(b.bath ? cut(r, isX(side) ? 'y1' : 'x1', 1.6)[1] : r, { id: b.id, type, name: b.name, kind: 'driver', door: side });
        if (b.bath) { const [strip] = cut(r, isX(side) ? 'y1' : 'x1', 1.6); const bt = add(strip, { id: b.id + '-bath', type: 'bath', name: bathName, kind: 'bath', door: isX(side) ? 'y0' : 'x0' }); const e = shared(bt, room); if (e) doors.push({ a: bt.id, b: room.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .75 }); }
        const e = edges(room, true).sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
        if (e && e.to - e.from >= 1.2) doors.push({ a: room.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .9, service: true, entry: true });
        else { circDoor(room.id, room, side, 'door', .9); notes.push('غرفة السائق لم تلامس جدارًا خارجيًا فوُصلت بالداخل؛ يُفضّل نقلها لمدخل خارجي.'); }
        return;
      }
      if (!b.bath) { const bed = add(r, { id: b.id, type, name: b.name, kind: b.kind === 'maid' ? 'maid' : 'suite', door: side }); connect(bed, side); return; }
      const ss0 = stripSide.get(p) || (isX(side) ? 'y1' : 'x1'), t0 = b.master ? T.masterStripD : b.kind === 'maid' ? 1.6 : T.stripD;
      const bl0 = b.master ? T.masterBathL : b.kind === 'suite' ? T.bathL : 2.2, closetMax = b.master ? 3.4 : b.kind === 'suite' ? 2.6 : 1.4;
      void closetMax;
      if (suiteVariant(b, sideLen(r, side), sideLen(r, ss0)).deep) {
        const td = b.master ? 2.4 : 2.1;
        const [strip, rest] = cut(r, side, td);
        const near = ss0;
        const [bathR, vestR] = split(strip, near, Math.min(bl0, sideLen(r, side) - 1.3));
        const bed = add(rest, { id: b.id, type, name: b.name, kind: b.kind === 'maid' ? 'maid' : 'suite', door: opp[side], strip: side });
        const vest = add(vestR, b.master ? { id: b.id + '-vest', type: 'storage', name: 'غرفة الملابس', kind: 'dress', door: side, walk: true } : { id: b.id + '-vest', type: 'corridor', name: b.kind === 'maid' ? 'مدخل الخادمة' : 'مدخل الجناح', kind: 'vest', door: side });
        const bath = add(bathR, { id: b.id + '-bath', type: 'bath', name: bathName || ('حمام ' + (b.master ? 'الرئيسية' : b.name.replace('غرفة نوم ', 'غرفة '))), kind: 'bath', door: opp[near], far: near });
        const ev = edgeOf(vest, side);
        if (b.kind === 'maid') { if (!hostDoor(vest, ['kitchen']) && !circDoor(vest.id, vest, side, 'door', .9, (ev.from + ev.to) / 2) && !hostDoor(bed, ['kitchen'])) circDoor(bed.id, bed, opp[side], 'door', .9); } else circDoor(vest.id, vest, side, 'door', .95, (ev.from + ev.to) / 2);
        const eb2 = shared(vest, bed); if (eb2) doors.push({ a: bed.id, b: vest.id, edge: eb2, pos: (eb2.from + eb2.to) / 2, kind: 'arch', w: Math.min(1.1, eb2.to - eb2.from - .3) });
        if (b.bathShared) { bath.name = 'دورة مياه مشتركة'; const eb = edgeOf(bath, side); circDoor(bath.id, bath, side, 'door', .8, (eb.from + eb.to) / 2); }
        else { const eb3 = shared(bath, vest); if (eb3) doors.push({ a: bath.id, b: vest.id, edge: eb3, pos: (eb3.from + eb3.to) / 2, kind: 'door', w: .8 }); }
        return;
      }
      const ss = ss0, t = t0;
      const [strip, rest] = cut(r, ss, t);
      const L = sideLen(r, ss);
      const bl = b.master && L - bl0 < 1.5 && L - 2.4 >= 1.5 ? L - 1.5 : Math.min(bl0, L);
      const [bathR, closetR] = L - bl >= 1.5 ? split(strip, b.bathShared ? side : opp[side], bl) : [strip, null];
      const bed = add(rest, { id: b.id, type, name: b.name, kind: b.kind === 'maid' ? 'maid' : 'suite', door: side, strip: ss });
      const bath = add(bathR, { id: b.id + '-bath', type: 'bath', name: bathName || ('حمام ' + (b.master ? 'الرئيسية' : b.name.replace('غرفة نوم ', 'غرفة '))), kind: 'bath', door: ss, far: side });
      const ed = edgeOf(bed, side), nearStrip = (ss === 'x0' || ss === 'y0') ? ed.from : ed.to;
      connect(bed, side, b.bathShared ? (nearStrip === ed.from ? ed.to - .65 : ed.from + .65) : nearStrip + (nearStrip === ed.from ? .65 : -.65));
      if (b.bathShared) { bath.name = 'دورة مياه مشتركة'; bath.far = opp[side]; const ebs = edgeOf(bath, side); circDoor(bath.id, bath, side, 'door', .8, (ebs.from + ebs.to) / 2); }
      else { const eb = shared(bath, bed); if (eb) { const at = edgeOf(r, side).at, pos = Math.abs(eb.from - at) < Math.abs(eb.to - at) ? eb.from + .55 : eb.to - .55; doors.push({ a: bath.id, b: b.id, edge: eb, pos, kind: 'door', w: .8 }); } }
      if (closetR) {
        const cl = add(closetR, { id: b.id + '-dress', type: 'storage', name: b.master ? 'غرفة ملابس' : b.kind === 'suite' ? 'خزانة ملابس' : 'خزانة', kind: 'dress', door: ss });
        const ec = shared(cl, bed); if (ec) doors.push({ a: cl.id, b: b.id, edge: ec, pos: (ec.from + ec.to) / 2, kind: ec.to - ec.from >= 1.6 ? 'arch' : 'door', w: Math.min(1.2, ec.to - ec.from - .3) });
      }
      return;
    }
    if (b.kind === 'wc') { const w = add(r, { id: b.id, type: 'bath', name: b.name, kind: 'bath', door: side, far: opp[side] }); circDoor(w.id, w, side, 'door', .8); return; }
    if (b.kind === 'store') { const x = add(r, { id: b.id, type: b.laundry ? 'laundry' : 'storage', name: b.name, kind: b.laundry ? 'laundry' : 'store', door: side }); if (!hostDoor(x, ['kitchen'], 'door', .8)) circDoor(x.id, x, side, 'door', .8); return; }
    if (b.kind === 'majlis') { majlisZone(b, r, side); return; }
    if (b.kind === 'dining') { const d = add(r, { id: b.id, type: 'dining', name: b.name, kind: 'dining', door: side, dimLocked: !!b.dimGross }); circDoor(d.id, d, side, 'arch', 1.8); return; }
    if (b.kind === 'family') { const d = add(r, { id: b.id, type: 'living', name: b.name, kind: 'family', door: side }); circDoor(d.id, d, side, 'arch', 2.2); return; }
    if (b.kind === 'kitchen') {
      const k = add(r, { id: b.id, type: 'kitchen', name: b.name, kind: 'kitchen', door: side, dimLocked: !!b.dimGross });
      const viaCirc = circRooms.some(c => touch(k, c) >= 1.1);
      if (viaCirc) { if (P.prefs?.kitchenOpenHall && b.id === 'kitchen1') circDoor(k.id, k, side, 'arch', 2.4); else circDoor(k.id, k, side, 'door', .95); }
      const ext = edges(k, true).filter(e => e.side !== 'y0' || upper).sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
      if (ext && ext.to - ext.from >= 3.4 && !upper) doors.push({ a: k.id, edge: ext, pos: ext.to - .7, kind: 'door', w: .9, service: true });
      return;
    }
  }
  /** حافة خارجية جانبية (x0/x1) لمجلس ليس على الواجهة الأمامية: الأطول ≥ 3.4 م، أو null. */
  function sideExt(r) { const es = edges(r, true).filter(e => (e.side === 'x0' || e.side === 'x1') && e.to - e.from >= 3.4).sort((a, c) => (c.to - c.from) - (a.to - a.from)); return es[0] || null; }
  function majlisZone(b, r, side) {
    const men = b.men, fx = foyer ? (foyer.x0 + foyer.x1) / 2 : (r.x0 + r.x1) / 2;
    const interiorX = ['x0', 'x1'].filter(z => !isExtSide(r, z));
    if (men) {
      const front = r.y0 < TOL;
      const stripSide = interiorX.sort((a, c) => Math.abs(r[a] - fx) - Math.abs(r[c] - fx))[0] || (fx > (r.x0 + r.x1) / 2 ? 'x1' : 'x0');
      const L2 = sideLen(r, stripSide), restW = W_(r) - T.guestStripW;
      if (front && b.guestWc && menStrip(r).side === 'side' && L2 >= T.guestWcL + 1.6 && restW >= 3.4) {
        const [strip, rest] = cut(r, stripSide, T.guestStripW);
        const [lobbyR, wcR] = split(strip, 'y0', L2 - T.guestWcL);
        const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
        const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: 'مدخل الرجال', kind: 'lobby', door: 'y0', zone: 'men' });
        const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: 'دورة مياه الرجال', kind: 'wc', door: 'y0', far: 'y1', zone: 'men' });
        doors.push({ a: lobby.id, edge: { axis: 'y', at: lobby.y0, from: lobby.x0, to: lobby.x1 }, pos: (lobby.x0 + lobby.x1) / 2, kind: 'door', w: Math.min(1.1, W_(lobby) - .3), entry: true, men: true });
        const em = shared(m, lobby); if (em) doors.push({ a: m.id, b: lobby.id, edge: em, pos: em.from + Math.min(1.2, (em.to - em.from) / 2), kind: 'arch', w: Math.min(1.4, em.to - em.from - .4) });
        const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: .75 });
        pendingService.push(m);
      } else if (front) {
        const canBack = b.guestWc && H_(r) - 1.5 >= 3.6 && W_(r) >= T.guestWcL + 1.2;
        const [strip, rest] = canBack ? cut(r, 'y1', 1.5) : [null, r];
        const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
        doors.push({ a: m.id, edge: { axis: 'y', at: m.y0, from: m.x0, to: m.x1 }, pos: (m.x0 + m.x1) / 2, kind: 'door2', w: 1.4, entry: true, men: true });
        if (canBack) washStrip(m, strip, 'men');
        pendingService.push(m);
        if (b.guestWc && !canBack) { extraBaths++; m.noWc = true; notes.push('دورة مياه الرجال لم تتسع داخل منطقة المجلس في هذا البديل.'); }
      } else if (sideExt(r)) {
        // مجلس على الواجهة الجانبية: مدخل الرجال المستقل من الارتداد الجانبي، والمغاسل ودورة المياه في شريط داخلي
        const ex = sideExt(r), canStrip = b.guestWc && H_(r) - 1.5 >= 3.6 && W_(r) >= T.guestWcL + 1.2;
        const ss = canStrip ? (isExtSide(r, 'y1') ? 'y0' : 'y1') : null;
        const [strip, rest] = canStrip ? cut(r, ss, 1.5) : [null, r];
        const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
        const e = edges(m, true).filter(x => x.side === ex.side).sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
        if (e && e.to - e.from >= 1.8) doors.push({ a: m.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door2', w: 1.4, entry: true, men: true });
        if (canStrip) washStrip(m, strip, 'men');
        pendingService.push(m);
        notes.push('مجلس الرجال على الواجهة الجانبية بمدخل مستقل من الارتداد الجانبي.');
        if (b.guestWc && !canStrip) { extraBaths++; m.noWc = true; notes.push('دورة مياه الرجال لم تتسع داخل منطقة المجلس في هذا البديل.'); }
      } else {
        const m = add(r, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
        circDoor(m.id, m, side, 'door2', 1.4);
        notes.push('مجلس الرجال لا يلامس الواجهة في هذا البديل فلم يأخذ مدخلًا مستقلًا.');
      }
      return;
    }
    const canStrip = b.guestWc && (isX(side) ? W_(r) : H_(r)) - T.guestStripW >= 3.6 && sideLen(r, side) >= Math.max(3.4, T.guestWcL + 1.5);
    if (canStrip) {
      const [strip, rest] = cut(r, side, T.guestStripW);
      const c = foyer || circRooms[0];
      const nearEnd = isX(side) ? (Math.abs(r.y0 - (c.y0 + c.y1) / 2) <= Math.abs(r.y1 - (c.y0 + c.y1) / 2) ? 'y0' : 'y1') : (Math.abs(r.x0 - fx) < Math.abs(r.x1 - fx) ? 'x0' : 'x1');
      const [lobbyR, wcR] = split(strip, nearEnd, sideLen(r, side) - T.guestWcL);
      const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'women' });
      const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: b.women ? 'ممر النساء' : 'ممر الضيوف', kind: 'lobby', door: side, zone: 'women' });
      const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: b.women ? 'دورة مياه النساء' : 'دورة مياه الضيوف', kind: 'wc', door: nearEnd, far: opp[nearEnd], zone: 'women' });
      const le = edgeOf(lobby, side); circDoor(lobby.id, lobby, side, 'door2', 1.2, nearEnd === 'y0' || nearEnd === 'x0' ? le.from + .9 : le.to - .9);
      const em = shared(m, lobby); if (em) doors.push({ a: m.id, b: lobby.id, edge: em, pos: (em.from + em.to) / 2, kind: 'arch', w: Math.min(1.6, em.to - em.from - .4) });
      const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: .75 });
    } else {
      // شريط المغاسل ودورة المياه خلف الباب، أو على جهة عمودية على الباب (داخلية لا تحجب الواجهة) إن لم يتسع خلفه
      const fits = sd => b.guestWc && (isX(sd) ? W_(r) : H_(r)) - 1.5 >= 3.6 && sideLen(r, sd) >= T.guestWcL + 1.2;
      const perp = (isX(side) ? ['y1', 'y0'] : ['x1', 'x0']).filter(sd => !isExtSide(r, sd) || !SIDES.filter(z => z !== sd).every(z => !isExtSide(r, z)));
      const backSide = fits(opp[side]) ? opp[side] : perp.find(fits) || opp[side];
      const canBack = fits(backSide);
      const [strip, rest] = canBack ? cut(r, backSide, 1.5) : [null, r];
      const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'women' });
      circDoor(m.id, m, side, 'door2', 1.4);
      if (canBack) washStrip(m, strip, 'women');
      else if (b.guestWc) pendingGuestWc = m;
    }
  }
  function washStrip(m, strip, zone) {
    const alongX = W_(strip) >= H_(strip), ends = alongX ? ['x0', 'x1'] : ['y0', 'y1'];
    const ext = ends.find(s => edges(strip).some(e => e.side === s)) || ends[0];
    const [wcR, washR] = split(strip, ext, T.guestWcL);
    const wc = add(wcR, { id: m.id + '-wc', type: 'bath', name: zone === 'men' ? 'دورة مياه الرجال' : 'دورة مياه النساء', kind: 'wc', door: opp[ext], far: ext, zone });
    const wash = add(washR, { id: m.id + '-wash', type: 'corridor', name: 'مغاسل', kind: 'lobby', door: 'y0', zone });
    const e1 = shared(wash, m); if (e1) doors.push({ a: wash.id, b: m.id, edge: e1, pos: (e1.from + e1.to) / 2, kind: 'arch', w: Math.min(1.4, e1.to - e1.from - .3) });
    const e2 = shared(wc, wash); if (e2) doors.push({ a: wc.id, b: wash.id, edge: e2, pos: (e2.from + e2.to) / 2, kind: 'door', w: .75 });
  }
  function foyerWc(majlis) {
    const fw = W_(foyer), fd = H_(foyer); if (fw < 3.8 || fd < 2.4) return false;
    const towardX0 = (majlis.x0 + majlis.x1) / 2 < (foyer.x0 + foyer.x1) / 2, sd = towardX0 ? 'x0' : 'x1';
    const [strip, rest] = cut(foyer, sd, Math.min(1.5, fw - 2.4));
    const [wcR] = split(strip, 'y1', Math.min(2.0, fd - .1));
    Object.assign(foyer, { x0: snap(rest.x0), x1: snap(rest.x1) });
    Object.assign(wcR, { y0: foyer.y0 });
    const wc = add(wcR, { id: 'guest-wc', type: 'bath', name: 'دورة مياه الضيوف', kind: 'wc', door: opp[sd], far: 'y1' });
    const e = shared(wc, foyer); if (!e) return false;
    doors.push({ a: wc.id, b: 'foyer', edge: e, pos: e.from + .55, kind: 'door', w: .75 });
    const main = doors.find(d => d.entry && d.a === 'foyer'); if (main) main.edge = { axis: 'y', at: foyer.y0, from: foyer.x0, to: foyer.x1 };
    for (const d of doors) if ((d.a === 'foyer' || d.b === 'foyer') && d.b && d.edge && !d.entry) { const o = rooms.find(x => x.id === (d.a === 'foyer' ? d.b : d.a)); const e2 = o && shared(foyer, o); if (e2) { d.edge = e2; d.w = Math.min(d.w, e2.to - e2.from - .4); } }
    return true;
  }
  function bathStrip(host, forced = null) {
    const side = forced || host.door; if (!side) return false;
    const tw = T.commonStripW, L = sideLen(host, side);
    if ((isX(side) ? W_(host) : H_(host)) - tw < (host.kind === 'kitchen' ? KIT_MIN_AXIS : host.circ ? 4.2 : 3.2) || Math.min(W_(host), H_(host)) < 2.4 || L < T.commonBathL + 1.3) return false;
    const [strip, rest] = cut(host, side, tw);
    // لا يُقتطع شريط يجعل الطعام شريطيًا أو المطبخ أضيق من حده
    if (host.kind === 'dining' && Math.max(W_(rest), H_(rest)) / Math.min(W_(rest), H_(rest)) > DIN_MAX_ASP) return false;
    if (host.kind === 'kitchen' && Math.min(W_(rest), H_(rest)) < KIT_MIN_AXIS) return false;
    const far = isX(side) ? (foyer && host.y1 > (foyer.y0 + foyer.y1) / 2 ? 'y1' : 'y0') : (foyer && Math.abs(host.x1 - (foyer.x0 + foyer.x1) / 2) > Math.abs(host.x0 - (foyer.x0 + foyer.x1) / 2) ? 'x1' : 'x0');
    const [bathR, storeR] = split(strip, far, T.commonBathL);
    if (sideLen(storeR, side) < 1.2) return false;
    const keepDoor = doors.filter(d => (d.a === host.id || d.b === host.id) && d.edge && Math.abs(d.edge.at - host[side]) < TOL && d.edge.axis === (isX(side) ? 'x' : 'y'));
    Object.assign(host, sn(rest));
    for (const d of keepDoor) doors.splice(doors.indexOf(d), 1);
    const bath = add(bathR, { id: host.id + '-bath', type: 'bath', name: 'دورة مياه', kind: 'bath', door: side, far });
    const lob = add(storeR, { id: host.id + '-lobby', type: 'corridor', name: host.kind === 'kitchen' ? 'ممر الخدمة' : 'ممر', kind: 'lobby', door: side });
    const e1 = edgeOf(lob, side); circDoor(lob.id, lob, side, host.kind === 'kitchen' ? 'door' : 'arch', host.kind === 'kitchen' ? .95 : 1.4, (e1.from + e1.to) / 2);
    const e2 = shared(lob, host); if (e2) doors.push({ a: lob.id, b: host.id, edge: e2, pos: (e2.from + e2.to) / 2, kind: 'arch', w: Math.min(1.6, e2.to - e2.from - .3) });
    const e3 = shared(bath, lob); if (e3) doors.push({ a: bath.id, b: lob.id, edge: e3, pos: (e3.from + e3.to) / 2, kind: 'door', w: .75 });
    return true;
  }
  function kitchenStrip(host, items) {
    const perp = isX(host.door) ? ['y0', 'y1'] : ['x0', 'x1'];
    const awayDin = perp.filter(z => !(din && touch(host, din) > .5 && shared(host, din)?.side === z));
    const sd = awayDin[0] || perp[1];
    if ((isX(sd) ? W_(host) : H_(host)) - 1.6 < KIT_MIN_AXIS) return false;
    const L = sideLen(host, sd), need = items.length === 2 ? 3.4 : 1.6; if (L < need) return false;
    const [strip, rest] = cut(host, sd, 1.6);
    Object.assign(host, sn(rest));
    for (const d of doors.filter(d => d.a === host.id && !d.b)) doors.splice(doors.indexOf(d), 1);
    for (const d of doors.filter(d => (d.a === host.id || d.b === host.id) && d.edge && !shared(host, rooms.find(x => x.id === (d.a === host.id ? d.b : d.a)) || host))) doors.splice(doors.indexOf(d), 1);
    if (circRooms.some(c => touch(host, c) >= 1.1)) circDoor(host.id, host, host.door, 'door', .95);
    const pieces = items.length === 2 ? split(strip, host.door, Math.max(1.6, L * .4)) : [strip];
    const order = items.length === 2 ? ['storage', 'laundry'] : items;
    pieces.forEach((pr, i) => {
      const kind = order[i], x = add(pr, { id: 'kitchen-' + kind, type: kind === 'laundry' ? 'laundry' : 'storage', name: kind === 'laundry' ? 'غرفة الغسيل' : 'المخزن', kind: kind === 'laundry' ? 'laundry' : 'store', door: opp[sd] });
      const e = shared(x, host); if (e) doors.push({ a: x.id, b: host.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: Math.min(.85, e.to - e.from - .3) });
    });
    const ext = edges(host, true).filter(e => e.side !== 'y0').sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
    if (ext && ext.to - ext.from >= 3.4 && !doors.some(d => d.a === host.id && d.service)) doors.push({ a: host.id, edge: ext, pos: ext.to - .7, kind: 'door', w: .9, service: true });
    return true;
  }
}

// ------------------------------------------------------------------------------------------ الرسم في المستند
/** يرسم تخطيطًا في دور: جدران (خارجية/داخلية حسب ما على جانبيها)، فتحات، نوافذ على كل حافة تطل على خارج أو حوش، تسميات، أبعاد، أثاث. */
export function drawPlanV2(doc0, lay, { level, T }) {
  const rooms = lay.rooms; let doc = doc0;
  const run = c => { const r = applyCommand(doc, c); doc = r.doc; return r.ids; };
  const solid = rooms.filter(r => !r.open);
  const lines = { x: new Map(), y: new Map() };
  const put = (axis, at, a, b, side, open) => { const k = r2(at); if (!lines[axis].has(k)) lines[axis].set(k, []); lines[axis].get(k).push({ a, b, side, open }); };
  for (const r of rooms) { put('y', r.y0, r.x0, r.x1, 'R', r.open); put('y', r.y1, r.x0, r.x1, 'L', r.open); put('x', r.x0, r.y0, r.y1, 'R', r.open); put('x', r.x1, r.y0, r.y1, 'L', r.open); }
  const walls = [];
  for (const axis of ['x', 'y']) for (const [at, list] of lines[axis]) {
    const pts = [...new Set(list.flatMap(s => [r2(s.a), r2(s.b)]))].sort((p, q) => p - q);
    let cur = null;
    const flush = () => { if (!cur) return; const pa = axis === 'y' ? T(cur.a, at) : T(at, cur.a), pb = axis === 'y' ? T(cur.b, at) : T(at, cur.b); const id = run({ type: 'add-wall', level, a: pa, b: pb, t: cur.t })[0]; walls.push({ axis, at, a: cur.a, b: cur.b, id, pa }); cur = null; };
    for (let i = 0; i + 1 < pts.length; i++) {
      const m = (pts[i] + pts[i + 1]) / 2, L = list.filter(s => s.side === 'L' && s.a < m && s.b > m), R = list.filter(s => s.side === 'R' && s.a < m && s.b > m);
      if (!L.length && !R.length) { flush(); continue; }
      const t = L.some(s => !s.open) && R.some(s => !s.open) ? INT : EXT;
      if (cur && cur.t === t && Math.abs(cur.b - pts[i]) < 1e-6) cur.b = pts[i + 1]; else { flush(); cur = { a: pts[i], b: pts[i + 1], t }; }
    }
    flush();
  }
  const opening = (axis, at, pos, kind, extra = {}) => {
    const w = walls.find(x => x.axis === axis && Math.abs(x.at - at) < TOL && pos >= x.a - TOL && pos <= x.b + TOL); if (!w) return null;
    const p = axis === 'y' ? T(pos, at) : T(at, pos);
    try { return run({ type: 'add-opening', wall: w.id, kind, at: Math.hypot(p.x - w.pa.x, p.y - w.pa.y), ...extra })[0]; } catch { return null; }
  };
  const byId = new Map(rooms.map(r => [r.id, r]));
  const doorAt = [];
  for (const d of lay.doors) {
    const e = d.edge, pos = d.pos ?? (e.from + e.to) / 2, w = Math.max(.6, d.w ?? .9);
    const a = byId.get(d.a);
    const into = a ? (e.axis === 'x' ? (a.x0 + a.x1) / 2 > e.at : (a.y0 + a.y1) / 2 > e.at) : true;
    const pIn = e.axis === 'y' ? T(pos, e.at + (into ? 1 : -1)) : T(e.at + (into ? 1 : -1), pos);
    const id = opening(e.axis, e.at, pos, d.kind, { w, entry: !!(d.entry || d.entry2) });
    if (id && ['door', 'door2'].includes(d.kind)) setSwing(id, pIn);
    doorAt.push({ room: d.a, other: d.b, axis: e.axis, at: e.at, pos, w });
  }
  const lightOf = r => SIDES.flatMap(s => exposed(r, s, solid));
  for (const r of solid) {
    if (r.kind === 'lobby' || r.type === 'storage' || r.type === 'stairs') continue;
    for (const e of lightOf(r)) {
      const len = e.to - e.from, busy = doorAt.filter(d => d.axis === e.axis && Math.abs(d.at - e.at) < TOL && d.pos > e.from - .1 && d.pos < e.to + .1);
      if (r.type === 'bath') { if (len >= 1 && !busy.length) opening(e.axis, e.at, (e.from + e.to) / 2, 'window', { w: .6, h: .6, sill: 1.7 }); continue; }
      if (r.type === 'corridor' || r.type === 'entrance') { if (len >= 1.4 && !busy.some(d => Math.abs(d.pos - (e.from + e.to) / 2) < d.w / 2 + .7)) opening(e.axis, e.at, (e.from + e.to) / 2, 'window', { w: Math.min(1.2, len - .5) }); continue; }
      if (len < 1.6) continue;
      const big = ['majlis', 'living', 'dining', 'master'].includes(r.type) && len >= 3.4;
      const spots = big && len >= 6.5 ? [e.from + len * .27, e.from + len * .73] : [(e.from + e.to) / 2];
      for (let sp of spots) {
        const ww = big ? 2.2 : 1.4;
        const clash = d => Math.abs(d.pos - sp) < d.w / 2 + ww / 2 + .25;
        if (busy.some(clash)) { const d = busy[0]; sp = d.pos > (e.from + e.to) / 2 ? e.from + .35 + ww / 2 : e.to - .35 - ww / 2; if (busy.some(clash) || sp - ww / 2 < e.from + .2 || sp + ww / 2 > e.to - .2) { if (len - d.w - .9 >= 1) { const w2 = Math.min(ww, len - d.w - .9); const a2 = d.pos > (e.from + e.to) / 2 ? e.from + .3 + w2 / 2 : e.to - .3 - w2 / 2; opening(e.axis, e.at, a2, 'window', { w: w2 }); } continue; } }
        opening(e.axis, e.at, sp, big ? 'window2' : 'window');
      }
    }
  }
  // فراغ مأهول بقي بلا نافذة (الباب أخذ حافته): نافذة أصغر في أبعد موضع عن الأبواب على أطول حافة
  const isWin = o => o.kind === 'window' || o.kind === 'window2';
  for (const r of solid) {
    if (!['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'office', 'service'].includes(r.type)) continue;
    const es = lightOf(r).sort((a, b) => (b.to - b.from) - (a.to - a.from));
    const has = es.some(e => doc.openings.some(o => { if (!isWin(o)) return false; const wl = walls.find(w => w.id === o.wall); if (!wl || wl.axis !== e.axis || Math.abs(wl.at - e.at) > TOL) return false; const p = docToCanon(o, wl); return p >= e.from - .05 && p <= e.to + .05; }));
    if (has || !es.length) continue;
    for (const e of es) {
      const busy = doorAt.filter(d => d.axis === e.axis && Math.abs(d.at - e.at) < TOL && d.pos > e.from - .1 && d.pos < e.to + .1);
      const len = e.to - e.from, occ = busy.reduce((a, d) => a + d.w + .3, 0), w2 = Math.min(1.2, len - occ - .3); if (w2 < .6) continue;
      const cands2 = [e.from + .15 + w2 / 2, e.to - .15 - w2 / 2, (e.from + e.to) / 2];
      const sp = cands2.find(c => busy.every(d => Math.abs(d.pos - c) >= d.w / 2 + w2 / 2 + .1)); if (sp === undefined) continue;
      if (opening(e.axis, e.at, sp, 'window', { w: w2 })) break;
    }
  }
  function docToCanon(o, wl) { const B = wl.axis === 'y' ? T(wl.b, wl.at) : T(wl.at, wl.b), L = Math.hypot(B.x - wl.pa.x, B.y - wl.pa.y); return wl.a + (wl.b - wl.a) * o.at / L; }
  for (const r of rooms) run({ type: 'add-label', level, name: r.name, roomType: r.type, seed: T((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) });
  const dimLine = (a, b, outward, off) => {
    const pa = T(a.x, a.y), pb = T(b.x, b.y), po = T(a.x + outward.x, a.y + outward.y);
    const ux = pb.x - pa.x, uy = pb.y - pa.y, L = Math.hypot(ux, uy); if (L < .4) return;
    const n = { x: -uy / L, y: ux / L }, sgn = Math.sign((po.x - pa.x) * n.x + (po.y - pa.y) * n.y) || 1;
    try { run({ type: 'add-dimension', level, a: pa, b: pb, offset: sgn * off }); } catch { /* بعد غير صالح */ }
  };
  const chain = (vals, mk2, outward) => { const v = [...new Set(vals.map(x => r2(x)))].sort((p, q) => p - q); if (v.length < 2) return; for (let i = 0; i + 1 < v.length; i++) dimLine(mk2(v[i]), mk2(v[i + 1]), outward, 1.05); dimLine(mk2(v[0]), mk2(v[v.length - 1]), outward, 2.0); };
  const minY = Math.min(...solid.map(r => r.y0)), maxX = Math.max(...solid.map(r => r.x1));
  chain(solid.filter(r => Math.abs(r.y0 - minY) < TOL).flatMap(r => [r.x0, r.x1]), x => ({ x, y: minY }), { x: 0, y: -1 });
  chain(solid.filter(r => Math.abs(r.x1 - maxX) < TOL).flatMap(r => [r.y0, r.y1]), y => ({ x: maxX, y }), { x: 1, y: 0 });
  furnish(rooms, T, run, doorAt, level, r => SIDES.filter(s => exposed(r, s, solid).length));
  return doc;
  function setSwing(id, pIn) {
    const o = doc.openings.find(x => x.id === id), w = doc.walls.find(x => x.id === o.wall);
    const ux = w.b.x - w.a.x, uy = w.b.y - w.a.y, n = { x: -uy, y: ux };
    const mid = { x: w.a.x + ux * o.at / Math.hypot(ux, uy), y: w.a.y + uy * o.at / Math.hypot(ux, uy) };
    const s = (pIn.x - mid.x) * n.x + (pIn.y - mid.y) * n.y;
    if (o.swing !== (s >= 0 ? 'in' : 'out')) run({ type: 'flip-opening', id, what: 'swing' });
  }
}

/** الأثاث (منقول من المولّد الأول مع جهة خارجية عامة بدل حدود المستطيل). */
function furnish(rooms, T, run, doorAt, LVL, outSides) {
  const rotFor = (bx, by) => { const a = T(0, 0), b = T(bx, by); return Math.atan2(b.x - a.x, -(b.y - a.y)); };
  const F = (kind, x, y, bx, by, extra = {}) => { const p = T(x, y); try { run({ type: 'add-fixture', level: LVL, kind, x: p.x, y: p.y, rot: rotFor(bx, by), ...extra }); } catch { /* لم تتسع */ } };
  const dir = { x0: [-1, 0], x1: [1, 0], y0: [0, -1], y1: [0, 1] };
  const doorsOn = (r, s) => doorAt.filter(d => (d.room === r.id || d.other === r.id) && d.axis === (isX(s) ? 'x' : 'y') && Math.abs(d.at - r[s]) < TOL && d.pos > (isX(s) ? r.y0 : r.x0) - TOL && d.pos < (isX(s) ? r.y1 : r.x1) + TOL);
  const freeSides = r => SIDES.filter(s => !doorsOn(r, s).length);
  const onWall = (r, s, inset, t) => (isX(s) ? { x: s === 'x0' ? r.x0 + inset : r.x1 - inset, y: t } : { x: t, y: s === 'y0' ? r.y0 + inset : r.y1 - inset });
  const mid = (r, s) => (isX(s) ? (r.y0 + r.y1) / 2 : (r.x0 + r.x1) / 2);
  const m = .1;
  for (const r of rooms) {
    const w = W_(r), h = H_(r);
    if (r.type === 'courtyard') { if (Math.min(w, h) >= 3) F('tree', (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0, -1); continue; }
    if (r.type === 'master' || r.type === 'bedroom') {
      if (w < 2.6 || h < 2.6) continue;
      const free = freeSides(r);
      const pref = [r.strip ? opp[r.strip] : null, opp[r.door], ...free].filter(s => s && free.includes(s));
      const s = pref[0]; if (!s) continue;
      const dbl = r.type === 'master' || sideLen(r, s) >= 3.2, bw = dbl ? 1.8 : 1.0, bd = dbl ? 2.1 : 2.0;
      if (sideLen(r, s) < bw + .2 || (isX(s) ? w : h) < bd + .8) continue;
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
    if ((r.type === 'living' && !r.circ) || r.id === 'hall') {
      if (w < 3.2 || h < 3.2) continue;
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, along = w >= h;
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
      const free = freeSides(r), ext = outSides(r).filter(s => free.includes(s));
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
      const doorSides = SIDES.filter(s => doorsOn(r, s).length);
      const longSides = (w >= h ? ['y0', 'y1'] : ['x0', 'x1']).filter(s => !doorSides.includes(s));
      const s = longSides[0] || SIDES.find(z => !doorSides.includes(z)); if (!s) continue;
      const L = sideLen(r, s), [lo, hi] = isX(s) ? [r.y0, r.y1] : [r.x0, r.x1];
      const dAll = SIDES.flatMap(z => doorsOn(r, z).map(d => ({ z, d })));
      let farEnd = r.far ? ((r.far === 'x1' || r.far === 'y1') ? 'hi' : 'lo') : 'hi';
      if (dAll.length) { const { z, d } = dAll[0]; const along = isX(s) === isX(z) ? null : d.pos; if (along !== null) farEnd = along - lo < hi - along ? 'hi' : 'lo'; else farEnd = (z === 'x1' || z === 'y1') ? 'lo' : 'hi'; }
      const at = k => (farEnd === 'hi' ? lo + k : hi - k);
      const pw = onWall(r, s, m + .32, at(.45)); F('wc', pw.x, pw.y, ...dir[s]);
      const pb = onWall(r, s, m + .25, at(1.15)); if (L >= 1.6) F('basin', pb.x, pb.y, ...dir[s]);
      if (L >= 2.3 && Math.min(w, h) >= 1.2) { const ps = onWall(r, s, .55, farEnd === 'hi' ? hi - .55 : lo + .55); F('shower', ps.x, ps.y, ...dir[s], { w: .9, d: .9 }); }
      continue;
    }
    if (r.kind === 'dress') {
      const free = freeSides(r), s = (w >= h ? ['y0', 'y1'] : ['x0', 'x1']).find(z => free.includes(z)); if (!s) continue;
      const c = onWall(r, s, m + .3, mid(r, s)); F('wardrobe', c.x, c.y, ...dir[s], { w: Math.min(sideLen(r, s) - .3, 2.8) });
    }
  }
}

// ------------------------------------------------------------------------------------------ الاختلاف التنظيمي
/** الاختلاف بين بديلين (0..1) بالصيغة نفسها في أدلة القبول: إزاحة مراكز الفراغات المتناظرة بالاسم نسبة لحدود المبنى بعد أفضل انعكاس أفقي. */
export function roomsDifference(A, B) {
  const norm = (R, flip) => new Map(R.rooms.filter(r => r.area >= 6).map(r => { const w = R.B.x1 - R.B.x0, d = R.B.y1 - R.B.y0; let x = ((r.x0 + r.x1) / 2 - R.B.x0) / w; if (flip) x = 1 - x; return [r.name + '@' + r.li, { x, y: ((r.y0 + r.y1) / 2 - R.B.y0) / d }]; }));
  const one = flip => { const p = norm(A, false), q = norm(B, flip); let s = 0, n = 0; for (const [k, v] of p) { const u = q.get(k); if (!u) { s += .5; n++; continue; } s += Math.hypot(v.x - u.x, v.y - u.y) / Math.SQRT2; n++; } for (const k of q.keys()) if (!p.has(k)) { s += .5; n++; } return n ? s / n : 0; };
  return r2(Math.min(one(false), one(true)));
}
export const difference = (a, b) => roomsDifference(docRooms(a), docRooms(b));

// ------------------------------------------------------------------------------------------ البوابات الصارمة
const LIT_TYPES = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'office', 'service']);
const HABITABLE = /^(غرفة نوم|غرفة النوم|غرفة كبار|غرفة الضيوف|مجلس|المجلس|الصالة|المطبخ|غرفة الخادمة|المكتب)/;
/** فحص حتمي للمستند: يعيد قائمة أسباب الرفض (فارغة = مقبول). */
export function hardGates(doc, P, rv = reviewDoc(doc)) {
  const why = [];
  const c = checkDoc(doc); if (!c.ok) why.push(...c.problems.slice(0, 3));
  for (const i of rv) {
    if (i.code === 'UNREACHABLE_ROOM') why.push(i.message);
    if (i.code === 'NO_WINDOW' && HABITABLE.test(i.message.replace(/^«/, ''))) why.push(i.message);
    if (i.code === 'MIN_WIDTH' && /غرفة نوم|مجلس|صالة|مطبخ/.test(i.message)) why.push(i.message);
    if (['GAP', 'ORPHAN_LABEL', 'DUPLICATE_LABEL', 'UNLABELLED_ROOM'].includes(i.code)) why.push(i.message);
  }
  const { rooms } = docRooms(doc);
  for (const h of rooms.filter(r => /^الصالة( العلوية)?$/.test(r.name) || r.name === (P.upperHallName || '#'))) {
    const w = h.x1 - h.x0, d = h.y1 - h.y0, s = Math.min(w, d), l = Math.max(w, d);
    if (s < 4.2 - .3) why.push(`الصالة ${r2(w)}×${r2(d)} أضيق من 4.2 م.`);
    if (l / s > 2.5 + .15) why.push(`الصالة ${r2(w)}×${r2(d)} ممر لا غرفة (نسبة ${r2(l / s)}).`);
  }
  // إضاءة كل فراغ معيشي (ومنه الطعام والخادمة)، ودورات المياه لا تفتح على المطبخ/الطعام/المجلس
  const M = analyzeDoc(doc);
  for (const lv of M.levels) {
    for (const room of lv.rooms) {
      if (room.unlabelled || !LIT_TYPES.has(room.type)) continue;
      if (!lv.openings.some(op => (op.window || op.kind === 'slider') && op.sides.some(sd => sd.room.id === room.id && sd.exterior))) why.push(`«${room.name}» بلا نافذة.`);
    }
    for (const op of lv.openings) if (op.door && op.left && op.right) { const pr = [op.left, op.right], wet = pr.find(r => r.type === 'bath'), o = pr.find(r => r !== wet); if (wet && o && ['kitchen', 'dining', 'majlis'].includes(o.type)) why.push(`«${wet.name}» تفتح على «${o.name}».`); }
  }
  // مسار الضيوف: من أي باب خارجي إلى كل مجلس دون المرور بالصالة أو غرف النوم أو الخدمة أو دورات المياه
  { const g = M.levels[0]; if (g) {
    const doorsOf = room => g.openings.filter(op => op.door && op.sides.some(sd => sd.room.id === room.id));
    const privCirc = room => ['corridor', 'entrance'].includes(room.type) && doorsOf(room).some(op => op.sides.some(sd => sd.room.id !== room.id && ['bedroom', 'master'].includes(sd.room.type)));
    const banned = room => ['living', 'bedroom', 'master', 'kitchen', 'service', 'laundry', 'bath', 'storage'].includes(room.type) || privCirc(room);
    const starts = g.rooms.filter(room => !room.unlabelled && !banned(room) && doorsOf(room).some(op => op.sides.some(sd => sd.room.id === room.id && sd.other === 'outside')));
    const seen = new Set(starts.map(x => x.id)), q = [...starts];
    while (q.length) { const a = q.pop(); for (const op of doorsOf(a)) for (const sd of op.sides) { const o = sd.room; if (o.id === a.id || seen.has(o.id) || banned(o)) continue; seen.add(o.id); q.push(o); } }
    for (const room of g.rooms) if (room.type === 'majlis' && !seen.has(room.id)) why.push(`مسار الضيوف إلى «${room.name}» يمر بالقسم العائلي.`);
  } }
  const nb = rooms.filter(r => r.type === 'bath').length;
  if (Number.isInteger(P.counts.baths) && nb < P.counts.baths) why.push(`دورات المياه المرسومة ${nb} من ${P.counts.baths}.`);
  const beds = rooms.filter(r => (r.type === 'bedroom' || r.type === 'master') && r.name !== 'غرفة الضيوف').length;
  if (beds !== P.counts.bedrooms) why.push(`عدد غرف النوم ${beds} بدل ${P.counts.bedrooms}.`);
  if (P.men && !doc.openings.some(o => o.entry && o.level === doc.levels[0].id)) why.push('لا مدخل.');
  return why;
}

/**
 * بوابات جودة معمارية على المخطط المرسوم نفسه (المقاسات الصافية كما تُعرض للعميل)، لا على تقدير المولّد:
 * الرئيسية لا تصغر عن غرفة نوم أخرى، المطبخ ≥ 3.0 م صافيًا ويجاور الطعام بباب مباشر، الطعام غير شريطي (≤ 1.8)،
 * المطبخ لا يطل على الشارع (ما لم يُطلب)، والطعام والمطبخ يُبلغان من المدخل دون المرور بممر غرف النوم.
 * lay: التخطيط القانوني للدور الأرضي (y0 = الواجهة الأمامية). يعيد أسباب الرفض بالعربية.
 */
export function qualityGates(doc, lay = null, { kitchenFront = false } = {}) {
  const why = [], { rooms } = docRooms(doc), M = analyzeDoc(doc);
  const dims = r => { const w = r.x1 - r.x0, d = r.y1 - r.y0; return { s: Math.min(w, d), l: Math.max(w, d) }; };
  const beds = rooms.filter(r => r.type === 'bedroom' || r.type === 'master'), master = beds.find(r => r.type === 'master');
  if (master) { const big = beds.filter(r => r !== master && r.name !== 'غرفة الضيوف').sort((a, b) => b.area - a.area)[0]; if (big && big.area > master.area + .3) why.push(`غرفة النوم الرئيسية ${r2(master.area)} م² أصغر من «${big.name}» ${r2(big.area)} م².`); }
  const kit = rooms.find(r => r.type === 'kitchen' && r.name === 'المطبخ'), din = rooms.find(r => r.type === 'dining');
  if (kit && dims(kit).s < 2.95) why.push(`المطبخ عرضه الصافي ${r2(dims(kit).s)} م أقل من 3.0 م.`);
  if (din && dims(din).l / dims(din).s > DIN_MAX_ASP + .05) why.push(`الطعام شريطي ${r2(dims(din).s)}×${r2(dims(din).l)} (نسبة ${r2(dims(din).l / dims(din).s)} > ${DIN_MAX_ASP}).`);
  const g = M.levels[0];
  if (g && kit && din) {
    const id = n => g.rooms.find(x => x.name === n)?.id;
    const ki = id(kit.name), di = id(din.name);
    if (!g.openings.some(op => (op.door || op.kind === 'arch') && op.sides.some(sd => sd.room.id === ki) && op.sides.some(sd => sd.room.id === di))) why.push('المطبخ لا يتصل بالطعام مباشرة (تفصلهما الصالة أو فراغ آخر).');
  }
  if (g) {
    // من الباب الرئيسي (مدخل العائلة/الردهة) إلى الطعام والمطبخ دون ممر غرف النوم أو غرفة نوم أو دورة مياه
    const doorsOf = room => g.openings.filter(op => (op.door || op.kind === 'arch') && op.sides.some(sd => sd.room.id === room.id));
    // ممر غرف النوم: «ممر الغرف»، أو ممر تُفتح عليه غرفة نوم أو مدخل جناح أو غرفة ملابس أو حمام جناح
    const suitePart = r => ['bedroom', 'master'].includes(r.type) || /^(مدخل الجناح|غرفة الملابس|غرفة ملابس|خزانة ملابس|حمام غرفة|حمام الرئيسية)/.test(r.name || '');
    const bedCorr = room => ['corridor', 'entrance'].includes(room.type) && /ممر/.test(room.name || '') && (/^ممر الغرف/.test(room.name || '') || doorsOf(room).some(op => op.sides.some(sd => sd.room.id !== room.id && suitePart(sd.room))));
    const banned = room => ['bedroom', 'master', 'bath', 'storage', 'majlis'].includes(room.type) || bedCorr(room);
    const starts = g.rooms.filter(r => /^(مدخل العائلة|الردهة)$/.test(r.name || ''));
    const seen = new Set(starts.map(x => x.id)), q = [...starts];
    while (q.length) { const a = q.pop(); for (const op of doorsOf(a)) for (const sd of op.sides) { const o = sd.room; if (!o || o.id === a.id || seen.has(o.id) || banned(o)) continue; seen.add(o.id); q.push(o); } }
    if (starts.length) for (const r of g.rooms) if ((r.type === 'dining' || (r.type === 'kitchen' && r.name === 'المطبخ')) && !seen.has(r.id)) why.push(`«${r.name}» لا يُبلغ من المدخل إلا عبر ممر غرف النوم.`);
  }
  if (lay && !kitchenFront) {
    const k = lay.rooms.find(r => r.id === 'kitchen1'), solids = lay.rooms.filter(r => !r.open);
    if (k && sum(exposed(k, 'y0', solids).map(e => e.to - e.from)) > .6) why.push('المطبخ على الواجهة الأمامية (الشارع).');
  }
  return why;
}

// ------------------------------------------------------------------------------------------ الواجهة العامة
function buildDoc(site, land, title) {
  let doc = createDoc({ title });
  doc = applyCommand(doc, { type: 'set-plot', polygon: site.polygon, setbacks: site.setbacks, north: 0, entry: site.entry }).doc;
  if (land?.streets?.length && land?.entries?.length) doc = applyCommand(doc, { type: 'set-plot', streets: land.streets, entries: land.entries }).doc;
  return doc;
}
function transformFor(site, cand, mirror) {
  const F = frameOf(site.fp, site.entry);
  let pl = site.place(cand.ew, cand.ed);
  if (site.placeRects) { const rs = solidRects(cand.sol).map(r => (mirror ? { ...r, x0: cand.ew - r.x1, x1: cand.ew - r.x0 } : r)); const q = site.placeRects(rs, cand.ew, cand.ed); if (q.over > 1e-6) throw Error('المبنى لا يتسع داخل حدود الأرض بهذا الاتجاه.'); pl = q; }
  return { T: (x, y) => F(pl.ox + (mirror ? cand.ew - x : x), pl.oy + y), pl };
}
const describe = c => (PARTI_AR[c.mode] || c.mode) + (c.stepped ? '، والكتلة متدرجة: الصفوف الأمامية أضيق والجناح الخلفي بعرض الأرض الأوسع' : '');
const solidRects = sol => [...sol.placed.map(p => p.r), ...sol.circ.map(c => c.r), ...sol.courts];
// عقوبة قواعد العميل (rules.mjs) مصممة على مقياس المولّد الأول؛ جزاء المولّد الثاني أكبر بنحو أربعة أضعاف،
// فتُضاعف حتى لا تغلب جودةُ النمط طلبًا صريحًا («المطبخ في الخلف»، «الماستر بعيدة عن الدرج»)
const RULE_K = 4;
// تعديل على التصميم المعروض («انقل المطبخ…»): النمط نفسه يُفضَّل بقوة متى حقق البنود نفسها (الترتيب بالبنود أولًا)،
// فيُعدَّل المخطط المعروض ولا يُستبدل بنمط آخر إلا إن عجز نمطه عن تنفيذ الطلب
const PREFER_BONUS = 1000;
function patOf(c) { return c.mode + ':' + c.tag; }

/** يولّد المرشحين لكل نمط ويحل أبعادهم. */
function candidates(P, site, { stair = false, rules = [], entry = 's', iters = 140, avoid = new Set(), exclude = new Set(), prefPat = null, minEnv = 0, backAfterStair = 0, trees = null, ruleK = RULE_K, extra = null, capSuite = 0 } = {}) {
  const kitchenFront = rules.some(r => r.kind === 'place' && r.side === 'front' && /kitchen|مطبخ/.test(String(r.a)));
  const out = [], ctx = { maxBuilt: site.maxBuilt, minEnv, backAfterStair, kitchenFront, capSuite };
  for (const tr of trees || partiTrees(P, { stair, W: site.W, irregular: !!site.placeRects })) {
    if (avoid.has(tr.mode) || exclude.has(tr.mode + ':' + tr.tag)) continue;
    let lastRp = null;
    const evalFn = (sol, ew, ed) => {
      let s = scoreV2(sol, P, ew, ed, ctx); if (s === null) return null;
      if (site.placeRects) {
        // أرض غير منتظمة: كل فراغ مبني داخل المضلع (تجاوز متدرج = مخالفة يتجه البحث لإزالتها)، ومكافأة على
        // استعمال ما لا يتسع له مستطيل كامل (المبنى يتبع شكل الأرض، كجناح خلفي أعرض على أرض تتسع للخلف)
        const pl = site.placeRects(solidRects(sol), ew, ed);
        if (pl.over > 1e-6) { s += 600 + 400 * pl.over; sol.viol = (sol.viol || 0) + 1; }
        else s -= 40 * Math.max(0, ew - site.rectW(ed));
      }
      const rp = rulePenalty(sol.placed, ruleCirc(sol.circ), ew, ed, rules, entry); lastRp = rp; return s + ruleK * (rp.base + Math.min(...rp.p)) + (extra ? extra(sol, ew, ed) : 0);
    };
    const tt0 = now(); const best = optimize(tr.tree, site, evalFn, { iters, seed: tr.tag });
    if (globalThis.__v2dbg) globalThis.__v2dbg['ms:' + tr.tag] = Math.round(now() - tt0) + (best && !best.sol.viol ? '' : 'x');
    if (!best || best.sol.viol) {
      const d = globalThis.__v2dbg;
      if (d && tr.swaps) (d.localFail ||= []).push({ swaps: tr.swaps, best: !!best, viol: best ? (() => { const o = {}; globalThis.__v2dbg = o; scoreV2(best.sol, P, best.ew, best.ed, ctx); globalThis.__v2dbg = d; return Object.keys(o).join(','); })() : null });
      if (d) { d['tree:' + tr.tag] = best ? best.sol.viol : -1; if (best) { const o = {}; globalThis.__v2dbg = o; scoreV2(best.sol, P, best.ew, best.ed, ctx); globalThis.__v2dbg = d; d['why:' + tr.tag] = Object.keys(o).join(','); } }
      continue;
    }
    const rp = rulePenalty(best.sol.placed, ruleCirc(best.sol.circ), best.ew, best.ed, rules, entry); void lastRp;
    out.push({ mode: tr.mode, tag: tr.tag, tree: tr.tree, stepped: !!tr.stepped, sol: best.sol, ew: best.ew, ed: best.ed, pen: best.p - (prefPat && patOf(tr) === prefPat ? PREFER_BONUS : 0), rp, swaps: tr.swaps || null });
  }
  return out.sort((a, b) => a.pen - b.pen);
}

/**
 * يختار حتى keep بدائل: الأول أفضلها (أقل بنود طلب غير منفذة ثم الجودة)، والبقية مجموعة تُعظِّم أدنى اختلاف ثنائي
 * (بحث شامل في المجموعات؛ المرشحون قليلون) مع جزاء للجودة الأضعف وللبنود غير المنفذة.
 */
function pickDiverse(pool, keep) {
  if (!pool.length) return [];
  pool.sort((a, b) => a.fails - b.fails || (a.editDiff ?? 0) - (b.editDiff ?? 0) || a.quality - b.quality);
  // بند موضع أو تباعد صريح («المطبخ في الخلف»، «الماستر بعيدة عن الدرج») ينفّذه الأفضل: لا يُعرض بديل يخالفه أبدًا
  { const hard = x => (x.ledger || []).filter(l => !l.ok && (l.kind === 'place' || l.kind === 'far')).map(l => l.text);
    const okBest = new Set((pool[0].ledger || []).filter(l => l.ok && (l.kind === 'place' || l.kind === 'far')).map(l => l.text));
    pool = pool.filter((c, i) => i === 0 || !hard(c).some(t => okBest.has(t))); }
  const best = pool[0], q0 = best.quality, edit = pool.some(c => c.editDiff !== undefined);
  const D = new Map(), d = (a, b) => { const k = a.pat < b.pat ? a.pat + '|' + b.pat : b.pat + '|' + a.pat; if (!D.has(k)) D.set(k, roomsDifference(a.dr, b.dr)); return D.get(k); };
  // المرسى (البديل الأول المعروض): الأفضل، أو بديل قريب منه جودةً وبالبنود نفسها — فلا يقيّد الأفضلُ وحده تنوع المجموعة
  const anchors = new Set(edit ? [best] : pool.filter(c => c.fails === best.fails && c.quality <= q0 + 120).slice(0, 4));
  /** أفضل مجموعة بحجم need من cand (كل زوج ≥ 0.12 وفيها مرسى)، أو null. */
  const search = (cand, need) => {
    let set0 = null, sc0 = -Infinity;
    const rec = (start, set) => {
      if (set.length === need) {
        if (!set.some(c => anchors.has(c))) return;
        let mn = Infinity, sm = 0, n = 0;
        for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) { const v = d(set[i], set[j]); mn = Math.min(mn, v); sm += v; n++; }
        if (n && mn < .12) return; // بديلان شبه متطابقين لا يُعرضان معًا
        const modes = new Set(set.map(x => x.mode)).size;
        // نمطان من العائلة نفسها (مثل U ونسخته بتبادل المجلسين) أضعف تنوعًا من نمطين مختلفين بالاختلاف نفسه
        const sc = (n ? 2 * mn + .25 * sm / n : 0) + .06 * modes - sum(set.map(c => .00015 * Math.max(0, c.quality - q0) + .06 * (c.fails - best.fails)));
        if (sc > sc0) { sc0 = sc; set0 = set; }
        return;
      }
      for (let i = start; i <= cand.length - (need - set.length); i++) rec(i + 1, [...set, cand[i]]);
    };
    rec(0, []); return set0;
  };
  // بنود الطلب أولًا: البدائل التي تخفق في بند أكثر من الأفضل لا تدخل إلا إن لم يكتمل العدد المطلوب من بدائل مختلفة
  // فعلًا بدونها (وتبقى بنودها غير المنفذة ظاهرة في سجل المطابقة). يُعرض أكبر عدد مختلف فعلًا، لا بدائل متطابقة.
  let bestSet = [best];
  for (const tolF of [0, 1, 2]) {
    const cand = pool.filter(c => c.fails <= best.fails + tolF).slice(0, 20);
    let got = null;
    for (let need = Math.min(keep, cand.length); need >= 1 && !got; need--) got = search(cand, need);
    if (got && got.length > bestSet.length) bestSet = got;
    // بديلان مختلفان على الأقل ينفّذان ما ينفّذه الأفضل: لا يُكمَّل العدد ببدائل تخالف بندًا صريحًا زائدًا
    // («المطبخ في الخلف» ومطبخ في وسط البيت) — يُعرض العدد الفعلي ويُذكر السبب
    if (bestSet.length >= keep || bestSet.length >= 2) break;
  }
  // الأول: أفضل مرسى في المجموعة (بنودًا ثم جودة)، ثم البقية بالبنود والجودة
  const ord = [...bestSet].sort((a, b) => (anchors.has(b) - anchors.has(a)) || a.fails - b.fails || a.quality - b.quality);
  const first = ord.filter(c => anchors.has(c)).sort((a, b) => a.fails - b.fails || (a.editDiff ?? 0) - (b.editDiff ?? 0) || a.quality - b.quality)[0] || ord[0];
  const sel = [first, ...ord.filter(c => c !== first).sort((a, b) => a.fails - b.fails || a.quality - b.quality)];
  sel.forEach((c, i) => { c.minDiff = sel.length > 1 ? Math.min(...sel.filter(o => o !== c).map(o => d(o, c))) : null; });
  // لا يُعرض بديلان شبه متطابقين (اختلاف تنظيمي أقل من 0.12 = البديل نفسه تقريبًا)
  return sel.filter((c, i) => i === 0 || sel.slice(0, i).every(o => d(o, c) >= .12));
}

/**
 * تعديل موضعي على التصميم المعروض (طلب مثل «انقل المطبخ بجوار الطعام وخله في الخلف»): النمط التنظيمي نفسه
 * (شجرة التقسيم ذاتها) يُعاد حل أبعاده بالبنود الجديدة، ثم — إن بقي بند لم يتحقق — تُجرَّب مبادلات موضعية بين
 * الكتل المعنية بالبنود وكتل في مناطق أخرى من الشجرة نفسها (تبديل غرفتين بين موضعين). يعيد التصاميم الناجحة
 * مرتبة بالبنود ثم بالقرب من المعروض، أو [] إن لم يوجد النمط. لا يغيّر النمط ولا البرنامج (المجموعة نفسها من الغرف).
 */
function localEdit(P, site, land, prefer, { title, requirements, entry, refDR, prefMirror }) {
  const trees = partiTrees(P, { W: site.W, irregular: !!site.placeRects });
  const base = trees.find(t => patOf(t) === prefer); if (!base) return [];
  const zonesOf = t => { const z = []; (function w(n) { if (n.t === 'zone') z.push(n); if (n.k) n.k.forEach(w); })(t); return z; };
  // القرب من المعروض جزء من الهدف: إزاحة مراكز الغرف المتناظرة بالاسم (بالمقياس نفسه للاختلاف) تُجازى، فيبقى
  // البحث قرب المخطط المعروض ولا يبتعد عنه إلا بقدر ما تطلبه البنود
  const F = frameOf(site.fp, site.entry);
  const ref = new Map(refDR.rooms.filter(r => r.area >= 6).map(r => [r.name, { x: ((r.x0 + r.x1) / 2 - refDR.B.x0) / (refDR.B.x1 - refDR.B.x0), y: ((r.y0 + r.y1) / 2 - refDR.B.y0) / (refDR.B.y1 - refDR.B.y0) }]));
  const circName = { hall: 'الصالة', foyer: P.men ? 'مدخل العائلة' : 'الردهة' };
  const near = (sol, ew) => {
    const items = [...sol.placed.map(p => [p.block.name, p.r]), ...sol.circ.filter(c => circName[c.id]).map(c => [circName[c.id], c.r])].filter(([n]) => ref.has(n));
    if (!items.length) return 0;
    const pts = items.map(([n, r]) => { const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, p = F(prefMirror ? ew - cx : cx, cy); return [n, p]; });
    const xs = [...sol.placed.map(p => p.r), ...sol.circ.map(c => c.r)].flatMap(r => [F(r.x0, r.y0), F(r.x1, r.y1)]);
    const bx0 = Math.min(...xs.map(p => p.x)), bx1 = Math.max(...xs.map(p => p.x)), by0 = Math.min(...xs.map(p => p.y)), by1 = Math.max(...xs.map(p => p.y));
    const one = flip => sum(pts.map(([n, p]) => { let x = (p.x - bx0) / (bx1 - bx0 || 1); if (flip) x = 1 - x; const y = (p.y - by0) / (by1 - by0 || 1), q = ref.get(n); return Math.hypot(x - q.x, y - q.y) / Math.SQRT2; })) / pts.length;
    return Math.min(one(false), one(true));
  };
  const refA = new Map(refDR.rooms.map(r => [r.name, r.area]));
  const build = list => {
    const out = [];
    // بوزن البنود المعتاد ثم بوزن مضاعف (بنود التعديل تغلب جودة الأبعاد) — يُختار الأقرب بين ما ينفّذها
    // ولا تُصغَّر الغرف لتحقيق البند: مساحة كل غرفة (نوم، مطبخ، طعام، مجلس) المقدّرة من شريحتها لا تقل عن 90% منها في المعروض
    const T = DESIGN_TARGETS;
    const frac = b => (b.kind === 'suite' && b.bath ? (b.master ? T.master : T.bedroom) / b.area : b.kind === 'majlis' && b.guestWc ? (b.area - 7) / b.area : 1);
    const keepSize = sol => sum(sol.placed.filter(p => ['suite', 'kitchen', 'dining', 'majlis', 'maid'].includes(p.block.kind) && refA.has(p.block.name)).map(p => Math.max(0, .9 - A_(p.r) * frac(p.block) / refA.get(p.block.name))));
    const extra = (sol, ew) => 1500 * near(sol, ew) + 3000 * keepSize(sol);
    const cs = [...candidates(P, site, { rules: P.rules, entry, trees: list, iters: 160, extra }), ...candidates(P, site, { rules: P.rules, entry, trees: list.map(t => ({ ...t, tree: cloneTree(t.tree) })), iters: 160, ruleK: RULE_K * 8, extra })];
    for (const cand of cs) {
      try {
        const mirror = cand.rp && cand.rp.p[0] !== cand.rp.p[1] ? cand.rp.p[1] < cand.rp.p[0] : prefMirror ?? false;
        const d = buildDesign(cand, P, site, land, { title, mirror, requirements, entry });
        if (globalThis.__v2dbg) (globalThis.__v2dbg.local ||= []).push({ swaps: cand.swaps, reject: d.reject.slice(0, 2), fails: d.ledger.filter(x => !x.ok).map(x => x.text + ': ' + x.why) });
        if (d.reject.length || !gateReview(d, requirements, land, null)) continue;
        d.editDiff = refDR ? roomsDifference(d.dr, refDR) : 0; d.swaps = cand.swaps || [];
        // تعديل يصغّر غرفة نوم أو المطبخ أو الطعام أو المجلس أكثر من 20% ليس تعديلًا موضعيًا مقبولًا (يُفضَّل عليه نمط آخر يحقق الطلب)
        const shrunk = d.dr.rooms.filter(r => ['bedroom', 'master', 'kitchen', 'dining', 'majlis'].includes(r.type) && refA.has(r.name) && r.area < .8 * refA.get(r.name));
        if (shrunk.length) { if (globalThis.__v2dbg) (globalThis.__v2dbg.localShrunk ||= []).push(shrunk.map(r => r.name)); continue; }
        out.push(d);
      } catch { /* بديل لا يتسع */ }
    }
    return out.sort((a, b) => a.fails - b.fails || a.editDiff - b.editDiff || a.quality - b.quality);
  };
  let got = build([{ ...base, swaps: [] }]);
  if (got.length && got[0].fails === 0) return got;
  // المبادلات: كل كتلة يذكرها بند (الموضع/التجاور/القرب) مع كل كتلة في منطقة أخرى — مجلس الرجال يبقى في موضعه
  const ruleIds = new Set(P.rules.filter(r => ['place', 'adjacent', 'near'].includes(r.kind)).flatMap(r => [...blocksFor(r.a, P.blocks), ...(r.b ? blocksFor(r.b, P.blocks) : [])]).map(b => b.id));
  const zs = zonesOf(base.tree), vars = [];
  // المبادلة بين فراغات المنطقة العائلية/الخدمية فقط (مطبخ، طعام، خادمة، دورات مياه، مخزن، معيشة…): لا تُنقل غرفة نوم
  // إلى الشارع ولا مجلس إلى قلب البيت لتحقيق بند في المطبخ — ذلك تغيير تنظيمي لا تعديل موضعي
  const SWAP = new Set(['kitchen', 'dining', 'maid', 'wc', 'store', 'family', 'office', 'prayer', 'driver']);
  zs.forEach((za, ia) => za.b.forEach((X, i) => {
    if (!ruleIds.has(X.id) || !SWAP.has(X.kind)) return;
    zs.forEach((zb, ib) => { if (ib === ia) return; zb.b.forEach((Y, j) => {
      if (!SWAP.has(Y.kind) || (ruleIds.has(Y.id) && ib < ia)) return;
      const tree = cloneTree(base.tree), cz = zonesOf(tree); cz[ia].b[i] = Y; cz[ib].b[j] = X;
      vars.push({ mode: base.mode, tag: base.tag, tree, stepped: base.stepped, swaps: [[X.name, Y.name]] });
    }); });
  }));
  // «المطبخ/الطعام في الخلف» وجناح النوم يشغل الخلف: تبديل كتلة المطبخ (أو المطبخ والطعام معًا) مع موضع غرفة نوم
  // في الخلف داخل النمط نفسه — الغرفة تنتقل إلى موضع الخدمة، والخدمة إلى الخلف. لا يُلجأ إليه إلا إن عجزت المبادلات
  // داخل منطقة الخدمة (ترتيبها بعدها)، ويبقى البرنامج نفسه وشجرة النمط ذاتها
  const placeSvc = P.rules.some(r => r.kind === 'place' && ['back', 'front', 'n', 's', 'e', 'w', 'left', 'right'].includes(r.side) && ['kitchen', 'dining'].includes(r.a));
  if (placeSvc) {
    const svcIdx = [], suiteIdx = [];
    zs.forEach((z, iz) => z.b.forEach((b, i) => { if (b.id === 'kitchen1' || b.kind === 'dining') svcIdx.push([iz, i, b]); else if (b.kind === 'suite' && !b.guest) suiteIdx.push([iz, i, b]); }));
    const k = svcIdx.find(x => x[2].id === 'kitchen1'), dn = svcIdx.find(x => x[2].kind === 'dining');
    const sv = [];
    for (const sA of suiteIdx) {
      if (k && sA[0] !== k[0]) { const tree = cloneTree(base.tree), cz = zonesOf(tree); cz[k[0]].b[k[1]] = sA[2]; cz[sA[0]].b[sA[1]] = k[2]; sv.push({ mode: base.mode, tag: base.tag, tree, stepped: base.stepped, swaps: [[k[2].name, sA[2].name]], suiteSwap: true }); }
      // المطبخ والطعام معًا مع غرفتين متتاليتين في منطقة واحدة (يبقيان متجاورين)
      for (const sB of suiteIdx) {
        if (!k || !dn || sB === sA || sB[0] !== sA[0] || Math.abs(sB[1] - sA[1]) !== 1 || sA[0] === k[0]) continue;
        const tree = cloneTree(base.tree), cz = zonesOf(tree);
        cz[k[0]].b[k[1]] = sA[2]; cz[sA[0]].b[sA[1]] = k[2]; cz[dn[0]].b[dn[1]] = sB[2]; cz[sB[0]].b[sB[1]] = dn[2];
        sv.push({ mode: base.mode, tag: base.tag, tree, stepped: base.stepped, swaps: [[k[2].name, sA[2].name], [dn[2].name, sB[2].name]], suiteSwap: true });
      }
    }
    vars.push(...sv);
  }
  // نقل حديقة/فراغ خارجي داخل الجناح نفسه من طرفه إلى طرفه الآخر (فتنزلق الفراغات خلفه أو أمامه) — تعديل موضعي
  // يغيّر موضع الخدمة على امتداد جناحها دون المساس بترتيب الأجنحة ولا بغرف النوم
  const nodes = []; (function w(n, path) { if (n.k) { nodes.push(path); n.k.forEach((c, i) => w(c, [...path, i])); } })(base.tree, []);
  const at = (t, path) => path.reduce((n, i) => n.k[i], t);
  for (const path of nodes) {
    const n = at(base.tree, path), last = n.k.length - 1; if (n.k.length < 2) continue;
    for (const [from, to] of [[last, 0], [0, last]]) {
      if (n.k[from].t !== 'void' || n.k[to].t === 'void' || n.k[from].margin) continue;
      const tree = cloneTree(base.tree), m = at(tree, path), [v] = m.k.splice(from, 1), [wv] = m.w.splice(from, 1);
      m.k.splice(to, 0, v); m.w.splice(to, 0, wv);
      vars.unshift({ mode: base.mode, tag: base.tag, tree, stepped: base.stepped, swaps: [['الحديقة', to === 0 ? 'أمام الجناح' : 'خلف الجناح']], voidMove: true });
    }
  }
  const plain = vars.filter(v => !v.suiteSwap), sws = vars.filter(v => v.suiteSwap);
  got = [...got, ...build(plain.slice(0, 30))];
  // مبادلة غرفة نوم بالخدمة: فقط إن لم يُنفّذ ما سبق كل البنود
  if (!got.some(d => d.fails === 0) && sws.length) got = [...got, ...build(sws.slice(0, 8))];
  got = got.sort((a, b) => a.fails - b.fails || a.editDiff - b.editDiff || a.quality - b.quality);
  return got;
}

/**
 * بدائل فيلا لدور واحد. التوقيع نفسه في المولّد الأول.
 * land: { width, length } أو { polygon:[{x,y}...] } مع streets وentries. يعيد { designs, program, W, D, engine }.
 */
export function generateVillaDesigns({ land, counts, requirements = {}, keep = 4, title = 'تصميم أولي من شرعاء', exclude = [], prefer = null }) {
  const t0 = now(), tw = requirements.tweaks || {};
  const prefPat = prefer && typeof prefer === 'object' ? prefer.pat ?? null : prefer, prefMirror = prefer?.mirror ?? null;
  // التعديل على التصميم المعروض: بين البدائل التي تنفّذ البنود نفسها يُقدَّم الأقرب إلى المخطط المعروض (أقل تغيير)
  let refDR = null; try { if (prefer?.doc) refDR = docRooms(typeof prefer.doc === 'string' ? parseDoc(prefer.doc) : prefer.doc); } catch { refDR = null; }
  land = landWithSite(land, requirements);
  const P = programV2(counts, requirements), site = siteOf(land), entry = site.entry; P.entry = entry;
  const avoid = new Set([...(tw.avoidModes || [])]), ex = new Set(exclude);
  // تعديل على المعروض: النمط نفسه أولًا (إعادة حل الأبعاد ثم مبادلات موضعية)؛ إن نفّذ كل البنود يُعرض وحده
  let local = [];
  // الطلب متحقق أصلًا في المخطط المعروض (كل بنوده مقيسة «نُفّذ»): يبقى المخطط كما هو حرفيًا
  const localOK = prefer?.local !== false && !(tw.avoidModes || []).includes(String(prefPat).split(':')[0]);
  if (prefPat && prefer?.doc && !ex.size && localOK) {
    try {
      const doc0 = typeof prefer.doc === 'string' ? parseDoc(prefer.doc) : prefer.doc, led = verifyRequest(doc0, requirements, { entry });
      if (led.length && led.every(x => x.ok)) {
        const d = { doc: doc0, pat: prefPat, mode: String(prefPat).split(':')[0], parti: String(prefPat).split(':')[1], same: true, mirror: prefMirror, ledger: led, fails: 0, summary: PARTI_AR[String(prefPat).split(':')[0]] || '', notes: ['طلبك متحقق في المخطط المعروض كما هو (مقيس من المخطط)، فلم يُغيَّر شيء.'], issues: [], unchanged: true };
        finalReview(d, requirements, land, counts);
        return { designs: [d], program: P, W: r2(site.W), D: r2(site.D), engine: VILLA_V2_ENGINE_VERSION, rejected: [], pool: [], local: { kept: true, unchanged: true, swaps: [] }, ms: Math.round(now() - t0) };
      }
    } catch { /* يُكمل بالتعديل */ }
  }
  if (prefPat && refDR && !ex.size && localOK) {
    local = localEdit(P, site, land, prefPat, { title, requirements, entry, refDR, prefMirror });
    if (local.length && local[0].fails === 0) {
      const d = local[0];
      d.same = true; d.notes = [...d.notes, d.swaps?.length ? (d.swaps[0][0] === 'الحديقة' ? `عُدّل المخطط المعروض نفسه (النمط ذاته): نُقلت الحديقة إلى ${d.swaps[0][1]} فانزلقت الخدمة على امتداد جناحها، وبقية الغرف في أماكنها.` : `عُدّل المخطط المعروض نفسه (النمط ذاته): ${d.swaps.map(([a, b]) => `تبادل «${a}» و«${b}» موضعيهما`).join('، و')}، وبقية الغرف في أماكنها.`) : 'عُدّل المخطط المعروض نفسه (النمط ذاته) بإعادة ضبط الأبعاد والترتيب داخل مناطقه.'];
      finalReview(d, requirements, land, counts); delete d.cand; delete d.dr; delete d.reject;
      return { designs: [d], program: P, W: r2(site.W), D: r2(site.D), engine: VILLA_V2_ENGINE_VERSION, rejected: [], pool: [{ pat: d.pat, quality: d.quality, fails: d.fails }], local: { kept: true, swaps: d.swaps || [] }, ms: Math.round(now() - t0) };
    }
  }
  const tG = now(); // زمن التوليد الشامل (بعد محاولة التعديل الموضعي)
  const cands = candidates(P, site, { rules: P.rules, entry, avoid, exclude: ex, prefPat });
  if (!cands.length) {
    const need = sum(P.blocks.map(b => b.area)) + DESIGN_TARGETS.foyer + P.hallArea;
    const err = Error(`لم أجد توزيعًا مهنيًا لهذا البرنامج داخل المساحة القابلة للبناء (${r2(site.W)} × ${r2(site.D)} م)؛ البرنامج بالمقاسات التصميمية المستهدفة يحتاج نحو ${Math.round(need)} م².`);
    err.code = ex.size ? 'VILLA_EXHAUSTED' : 'VILLA_NO_FIT'; err.need = need; err.available = site.W * site.D; throw err;
  }
  const built = [], rejected = [];
  for (const cand of cands) {
    // ميزانية زمن: يتوقف البناء بعد 8 ث متى وُجد بديلان — إلا إن لم يوجد بعد بديل ينفّذ كل البنود (حتى 14 ث)
    // (يُكمل حتى 14 ث ما لم يوجد ثلاثة بدائل تنفّذ كل البنود — البدائل المخالفة لبند صريح لا تُعرض لسد العدد)
    if (now() - tG > 8000 && built.length >= Math.min(keep, 2) && (built.filter(d => d.fails === 0).length >= Math.min(keep, 3) || now() - tG > 14000)) break;
    try {
      const mirror = cand.rp && cand.rp.p[0] !== cand.rp.p[1] ? cand.rp.p[1] < cand.rp.p[0] : prefPat && patOf(cand) === prefPat && prefMirror !== null ? prefMirror : false;
      const d = buildDesign(cand, P, site, land, { title, mirror, requirements, entry });
      if (d.reject.length) { rejected.push({ pat: patOf(cand), why: [...d.reject, ...d.notes.filter(n => /لم تتسع|لم تجد|تعذّر/.test(n))], doc: d.doc }); continue; }
      if (!gateReview(d, requirements, land, counts)) { rejected.push({ pat: patOf(cand), why: d.review.rejectReasons_ar, gates: d.review.failedGates, by: 'plan-review', doc: d.doc }); continue; }
      built.push(d);
    } catch (e) { rejected.push({ pat: patOf(cand), why: [String(e.message || e)] }); }
  }
  if (!built.length) { const err = Error('تعذّر بناء أي بديل سليم من الأنماط المرشحة.'); err.code = 'VILLA_BUILD_FAILED'; err.rejected = rejected; throw err; }
  if (globalThis.__v2dbg) { globalThis.__v2dbg.built = built.map(d => ({ pat: d.pat, quality: d.quality, fails: d.fails })); globalThis.__v2pool = built.map(d => ({ pat: d.pat, dr: d.dr, quality: d.quality, fails: d.fails })); if (globalThis.__v2keepDocs) globalThis.__v2poolDocs = built.map(d => ({ pat: d.pat, doc: d.doc })); globalThis.__v2rej = rejected; }
  if (refDR) for (const d of built) d.editDiff = roomsDifference(d.dr, refDR);
  // أفضل تعديل موضعي (لم ينفّذ كل البنود) يدخل المقارنة: يُقدَّم ما دام لا يخفق في بنود أكثر من غيره
  if (local.length) { built.push(local[0]); local[0].notes = [...local[0].notes, 'عُدّل المخطط المعروض نفسه قدر الإمكان؛ بعض البنود لم يتحقق في هذا النمط.']; }
  const designs = pickDiverse(built, keep);
  // أرض غير منتظمة: بين المعروض بديل واحد على الأقل يتبع شكل الأرض (أعرض من أي مستطيل يتسع فيها) إن وُجد ناجحًا
  if (site.rectW && !refDR) {
    const follows = d => d.env.w > site.rectW(d.env.d) + .3;
    if (!designs.some(follows)) {
      const cand = built.filter(d => follows(d) && !designs.includes(d) && d.fails <= designs[0].fails).sort((a, b) => a.quality - b.quality)
        .find(d => designs.slice(0, Math.max(1, designs.length - 1)).every(o => roomsDifference(o.dr, d.dr) >= .12));
      if (cand) { if (designs.length >= keep) designs.pop(); designs.push(cand); }
    }
  }
  designs.forEach(d => { d.same = !!prefPat && d.pat === prefPat; }); // التعديل بقي على التوزيع المعروض نفسه
  // لا انعكاسات لسد العدد: المخطط المعكوس ليس بديلًا تنظيميًا (اختلافه صفر)؛ يُعرض العدد الفعلي ويُذكر السبب
  if (designs.length < keep) designs[0].notes = [...designs[0].notes, `وُجد ${designs.length} ${designs.length === 1 ? 'بديل' : 'بدائل'} مختلفة تنظيميًا فقط تجتاز المراجعة وتنفّذ بنود طلبك لهذا البرنامج وهذه الأرض (من ${keep} مطلوبة)؛ لم يُضف مخطط معكوس لأنه ليس بديلًا مختلفًا، ولا بديل يخالف بندًا صريحًا من طلبك.`];
  designs.forEach(d => { finalReview(d, requirements, land, counts); delete d.cand; delete d.dr; delete d.reject; });
  return { designs, program: P, W: r2(site.W), D: r2(site.D), engine: VILLA_V2_ENGINE_VERSION, rejected: rejected.map(({ doc, ...r }) => r), pool: built.map(d => ({ pat: d.pat, quality: d.quality, fails: d.fails })), ms: Math.round(now() - t0) };
}

/**
 * البوابة النهائية المستقلة: محرك المراجعة (plan-review) يحكم على المستند المرسوم وطلب العميل فقط، لا على حالة المولّد.
 * بديل يرسب في أي بوابة صلبة لا يُعرض أبدًا. يعيد true إن نجح، ويرفق المراجعة بالتصميم (بلا AZIZ/Mizan هنا للسرعة).
 */
function reviewRequest(requirements, land, counts) {
  return { text: requirements?.text || requirements?.idea || '', counts: { ...(counts || {}), ...(requirements?.counts || {}) }, land: land || {} };
}
function compactReview(rv) {
  return { version: rv.version, passed: rv.passed, failedGates: rv.failedGates, score: rv.score, rejectReasons_ar: rv.rejectReasons_ar,
    gates: rv.gates.map(g => ({ id: g.id, ar: g.ar, ok: g.ok, applicable: g.applicable !== false, value: g.value, reasons_ar: g.reasons_ar })),
    breakdown: rv.breakdown.map(b => ({ id: b.id, ar: b.ar, value: b.value, weight: b.weight })) };
}
function gateReview(d, requirements, land, counts) {
  const rv = reviewDesign(d.doc, reviewRequest(requirements, land, counts), { external: false });
  d.review = compactReview(rv);
  return rv.passed;
}
/** مراجعة كاملة (مع AZIZ وMizan بوزنهما المقيس) للبدائل المختارة فقط. */
function finalReview(d, requirements, land, counts) {
  try { d.review = compactReview(reviewDesign(d.doc, reviewRequest(requirements, land, counts))); } catch { /* تبقى مراجعة البوابات */ }
}

function buildDesign(cand, P, site, land, { title, mirror, requirements, entry, second = null }) {
  const layout = realizeV2(cand, P, { secondEntry: canonicalSide(entry, land?.entries?.[1], mirror) });
  const { T, pl } = transformFor(site, cand, mirror);
  let doc = buildDoc(site, land, title);
  doc = drawPlanV2(doc, layout, { level: LV, T });
  if (second) doc = second(doc);
  const relaxed = relaxFixtures(doc), rv = reviewDoc(relaxed), q = quality(relaxed);
  const qg = qualityGates(relaxed, layout, { kitchenFront: (P.rules || []).some(r => r.kind === 'place' && r.side === 'front' && /kitchen|مطبخ/.test(String(r.a))) });
  const reject = [...hardGates(relaxed, P, rv), ...qg];
  const ledger = verifyRequest(relaxed, requirements, { entry });
  const builtA = sum(layout.rooms.filter(r => !r.open).map(A_));
  layout.notes.push(`مسطح الدور ${Math.round(builtA)} م² داخل غلاف ${r2(cand.ew)} × ${r2(cand.ed)} م من مساحة قابلة للبناء ${Math.round(site.W * site.D)} م²؛ الباقي ساحات${cand.sol.voids.length ? ' وحديقة داخل كتلة المبنى' : ''}${cand.sol.courts.length ? '، وحوش داخلي مكشوف' : ''}.`);
  if (site.irregular) layout.notes.push('الأرض غير منتظمة: الارتدادات أُزيحت داخل حدود المضلع الفعلية، وكل فراغ مبني داخلها' + (site.rectW && cand.ew > site.rectW(cand.ed) + .05 ? `؛ عرض المبنى ${r2(cand.ew)} م يتجاوز أعرض مستطيل يتسع في الأرض (${r2(site.rectW(cand.ed))} م) لأن الكتلة تتبع شكلها.` : '.'));
  return { doc: relaxed, cand, dr: docRooms(relaxed), reject, penalty: r2(cand.pen), quality: r2(cand.pen + q.cost), same: false, mirror, issues: q.issues, mode: cand.mode, parti: cand.tag, env: { w: cand.ew, d: cand.ed, ox: pl.ox, oy: pl.oy }, pat: patOf(cand), notes: [...P.notes, ...layout.notes], summary: describe(cand), rooms: layout.rooms, qgates: qg, ledger, fails: ledger.filter(x => !x.ok).length };
}

/**
 * دوران: الأرضي للضيافة والخدمة (مجالس، طعام، مطبخ، خادمة، كبار السن) والسلم بين المدخل والصالة؛
 * العلوي لأجنحة النوم حول صالة علوية خلف السلم في الموضع ذاته. الغلاف واحد للدورين.
 */
export function generateVillaTwoFloors({ land, counts, requirements = {}, keep = 3, title = 'تصميم أولي من شرعاء', exclude = [], prefer = null }) {
  const t0 = now(), tw = requirements.tweaks || {}, exSet = new Set(exclude);
  land = landWithSite(land, requirements);
  const P = programV2(counts, requirements), site = siteOf(land), entry = site.entry; P.entry = entry;
  const groundKinds = new Set(['majlis', 'dining', 'kitchen', 'maid', 'office', 'prayer', 'driver']);
  const wantG = new Set(), wantU = new Set();
  for (const r of P.rules.filter(x => x.kind === 'floor')) for (const b of blocksFor(r.a, P.blocks)) (r.floor === 'ground' ? wantG : wantU).add(b);
  const upperOk = b => ['suite', 'family', 'office', 'prayer'].includes(b.kind);
  const gBlocks = P.blocks.filter(b => wantG.has(b) || b.id === 'wc1' || ((groundKinds.has(b.kind) || b.guest || b.elderly) && !(wantU.has(b) && upperOk(b))));
  let uBlocks = P.blocks.filter(b => !gBlocks.includes(b));
  if (!uBlocks.some(b => b.kind === 'suite')) { const e = Error('لا توجد غرف نوم للدور العلوي؛ دور واحد يكفي هذا البرنامج.'); e.code = 'VILLA_NO_UPPER'; throw e; }
  if (!gBlocks.length) { const e = Error('لا توجد فراغات ضيافة أو خدمة للدور الأرضي.'); e.code = 'VILLA_NO_GROUND'; throw e; }
  let upperHallName = 'الصالة العلوية';
  const fam = uBlocks.find(b => b.kind === 'family'); if (fam) { uBlocks = uBlocks.filter(b => b !== fam); upperHallName = fam.name; }
  const gExtra = Math.min(1, P.extraBaths);
  const sub = (blocks, o) => { const Q = { ...P, ...o, blocks }; Q.men = blocks.find(b => b.kind === 'majlis' && b.men) || null; Q.women = blocks.filter(b => b.kind === 'majlis' && !b.men); Q.dining = blocks.filter(b => b.kind === 'dining'); Q.kitchens = blocks.filter(b => b.kind === 'kitchen'); Q.maid = blocks.find(b => b.kind === 'maid') || null; Q.driver = blocks.find(b => b.kind === 'driver') || null; Q.office = blocks.find(b => b.kind === 'office') || null; Q.prayer = blocks.find(b => b.kind === 'prayer') || null; Q.guest = blocks.find(b => b.guest) || null; Q.family = blocks.filter(b => b.kind === 'family'); Q.wcs = blocks.filter(b => b.kind === 'wc'); const su = blocks.filter(b => b.kind === 'suite' && !b.guest); Q.suites = [...su.filter(b => b.elderly && !b.master), ...su.filter(b => !b.master && !b.elderly), ...su.filter(b => b.master)]; Q.counts = { ...P.counts, bedrooms: su.length }; return Q; };
  const G = sub(gBlocks, { extraBaths: gExtra });
  const U = sub(uBlocks, { extraBaths: P.extraBaths - gExtra, upperHallName, hall: true, guestWc: 0, kitchenStrip: [], prefs: {}, hallArea: 22 });
  const minEnv = (sum(uBlocks.map(b => b.area)) + U.hallArea + 4.4 * 4.6 + 12) * 1.05;
  const farStair = P.rules.some(r => r.kind === 'far' && ((r.a === 'master' && r.b === 'stairs') || (r.b === 'master' && r.a === 'stairs')));
  const pref2 = prefer && typeof prefer === 'object' ? prefer.pat ?? null : prefer;
  const cands = candidates(G, site, { stair: true, rules: P.rules.filter(r => r.kind !== 'floor'), entry, avoid: new Set(tw.avoidModes || []), exclude: new Set(), iters: 160, minEnv, capSuite: P.suites.some(b => b.master && uBlocks.includes(b)) ? DESIGN_TARGETS.master - 1 : 0, backAfterStair: farStair ? CMIN.hall + 4.2 : 0, prefPat: pref2 ? String(pref2).split('/')[0] : null });
  const designs = [], rejected = [];
  if (!cands.length) rejected.push({ pat: '*', why: ['لا ترتيب أرضي ناجح'] });
  for (const g of cands) {
    if (designs.length >= keep + 2 || now() - t0 > 8500) break;
    const ups = upperFor(g, U, site, P.rules.filter(r => r.kind !== 'floor'), entry);
    if (globalThis.__v2dbg) { const st = g.sol.circ.find(c => c.id === 'stair').r; globalThis.__v2dbg['g:' + patOf(g)] = [g.ew, g.ed, st.x0, st.x1, st.y0, st.y1, ups.map(u => u.tag).join('/')].join(' '); }
    if (!ups.length) { rejected.push({ pat: patOf(g), why: ['لا دور علوي يتسع على هذا الغلاف'] }); continue; }
    for (const up of ups.slice(0, 3)) {
    const pat = patOf(g) + '/' + up.tag; if (exSet.has(pat)) continue;
    try {
      const mirror = g.rp && g.rp.p[0] !== g.rp.p[1] ? g.rp.p[1] < g.rp.p[0] : false;
      const ul = realizeV2(up, U, { upper: true });
      const stairR = g.sol.circ.find(c => c.id === 'stair').r;
      const d = buildDesign(g, G, site, land, {
        title, mirror, requirements, entry, second: doc0 => {
          const { T } = transformFor(site, g, mirror);
          let doc = applyCommand(doc0, { type: 'add-level', name: 'الدور الأول' }).doc; const L2 = doc.levels[doc.levels.length - 1].id;
          doc = drawPlanV2(doc, ul, { level: L2, T });
          doc = addStair(doc, stairR, T, LV);
          return doc;
        },
      });
      const allP = { ...P, counts: P.counts, upperHallName };
      const reject = [...hardGates(d.doc, allP), ...qualityGates(d.doc).filter(w => !d.qgates.includes(w)), ...d.qgates];
      if (reject.length) { rejected.push({ pat, why: reject }); continue; }
      if (!gateReview(d, requirements, land, counts)) { rejected.push({ pat, why: d.review.rejectReasons_ar, gates: d.review.failedGates, by: 'plan-review' }); continue; }
      d.pat = pat; d.summary = describe(g) + ' (دوران)'; d.notes = [...new Set([...d.notes, ...ul.notes, 'السلم بين مدخل العائلة والصالة، ويصل إلى الصالة العلوية في الموضع نفسه.'])];
      d.ledger = verifyRequest(d.doc, requirements, { entry }); d.fails = d.ledger.filter(x => !x.ok).length;
      designs.push(d);
    } catch (e) { rejected.push({ pat, why: [String(e.message || e)] }); }
    }
  }
  if (!designs.length) { const e = Error('تعذّر بناء أي بديل سليم لدورين.'); e.code = 'VILLA_BUILD_FAILED'; e.rejected = rejected; throw e; }
  for (const d of designs) d.dr = docRooms(d.doc);
  if (globalThis.__v2dbg) { globalThis.__v2pool = designs.map(d => ({ pat: d.pat, dr: d.dr, quality: d.quality, fails: d.fails })); if (globalThis.__v2keepDocs) globalThis.__v2poolDocs = designs.map(d => ({ pat: d.pat, doc: d.doc })); }
  const out = pickDiverse(designs, keep);
  if (out.length < keep) out[0].notes = [...out[0].notes, `وُجد ${out.length} ${out.length === 1 ? 'بديل' : 'بدائل'} مختلفة تنظيميًا فقط تجتاز المراجعة وتنفّذ بنود طلبك (من ${keep} مطلوبة)؛ لا يُعرض بديل يخالف بندًا صريحًا من طلبك لسد العدد.`];
  const prefPat2 = prefer && typeof prefer === 'object' ? prefer.pat ?? null : prefer;
  out.forEach(d => { d.same = !!prefPat2 && d.pat === prefPat2; });
  out.forEach(d => { finalReview(d, requirements, land, counts); delete d.cand; delete d.dr; delete d.reject; });
  return { designs: out, program: P, W: r2(site.W), D: r2(site.D), engine: VILLA_V2_ENGINE_VERSION, floors: 2, rejected, ms: Math.round(now() - t0) };
}
/**
 * الدور العلوي على غلاف الأرضي نفسه: عمود المحور بعرض عمود السلم تمامًا والسلم في موضعه، وتنظيمات للمحور:
 *  front: صالة علوية أمامية فوق المدخل وممر خلف السلم؛ back: جناح فوق المدخل وصالة خلف السلم؛
 *  landing: بسطة أمامية وصالة خلفية؛ deep: بسطة، ثم الصالة، ثم الجناح الرئيسي في عمق المحور خلف الصالة
 *  (أبعد ما يكون عن السلم، تُفتح عليه الصالة)؛ deepK: جناح فوق المدخل، والصالة، والرئيسية خلفها.
 * والأجنحة يمينًا ويسارًا بتوزيعات مختلفة تفتح على عمود المحور مباشرة (بلا ممرات). يُقيَّم بالدالة نفسها والقواعد.
 */
function upperFor(g, U, site, rules = [], entry = 's') {
  const sr = g.sol.circ.find(c => c.id === 'stair')?.r; if (!sr) return null;
  const ew = g.ew, ed = g.ed, x0 = sr.x0, x1 = sr.x1;
  const S = U.suites, Fam = U.family, n = S.length;
  // دورات المياه والمكتب والمصلى المطلوبة فوق: في رأس الجناح مع دورات المياه
  const wcs = [...(U.wcs || []), ...U.blocks.filter(b => ['office', 'prayer'].includes(b.kind))];
  const UP = { ...U, men: null, women: [], hallArea: U.hallArea };
  const master = S.find(b => b.master) || null;
  const bestBy = {};
  const HALL = () => C('hall', { area: U.hallArea });
  for (const hub of ['front', 'back', 'landing', 'deep', 'deepK', 'terrace']) for (let kL = 0; kL <= n; kL++) for (const mSide of ['R', 'L']) {
    let best = bestBy[hub] || null;
    let rest = [...S], frontRoom = null;
    if (hub === 'deep' || hub === 'deepK') { if (!master || n < 2 || mSide === 'L') continue; rest = rest.filter(b => b !== master); }
    if (hub === 'back' || hub === 'deepK') { const i = rest.findIndex(b => !b.master); if (i < 0 || rest.length < 3) continue; frontRoom = rest.splice(i, 1)[0]; }
    if (kL > rest.length) continue;
    // الرئيسية في آخر الجناح الأيمن (R) أو آخر الأيسر (L): العمودان قد يختلفان عرضًا بموضع السلم
    let L = rest.slice(0, kL), R = rest.slice(kL);
    if (mSide === 'L') { if (!master || !rest.includes(master) || !kL) continue; const o = rest.filter(b => b !== master); L = [...o.slice(0, kL - 1), master]; R = o.slice(kL - 1); }
    if ((L.length && x0 < 3.3) || (R.length && ew - x1 < 3.3) || (!L.length && x0 > .3) || (!R.length && ew - x1 > .3)) continue;
    // terrace: فوق مدخل العائلة سطح مكشوف (الدور العلوي يرتد عن الواجهة في المحور)، والسلم يصعد إلى الصالة خلفه
    const pre = hub === 'front' ? HALL() : hub === 'back' || hub === 'deepK' ? Z([frontRoom], 'y1', 'x') : hub === 'terrace' ? VOID(6) : C('corrF', { area: 8 });
    const post = hub === 'front' ? [C('corrB', { area: 10 })] : hub === 'deep' || hub === 'deepK' ? [HALL(), Z([master], 'y0', 'x')] : [HALL()];
    const hubCol = { t: 'y', k: [pre, C('stair', { fix: sr.y1 - sr.y0, area: 1 }), ...post], w: [1, 1, ...post.map(() => 1)], hub: true };
    const tree = X(L.length ? Z([...L, ...(R.length ? [] : [...wcs, ...Fam])], 'x1', 'y') : null, hubCol, R.length ? Z([...wcs, ...Fam, ...R], 'x0', 'y') : null);
    if (!tree || tree.t !== 'x') continue;
    const nodes = weightNodes(tree).filter(nd => nd !== tree && (nd !== hubCol || post.length > 1));
    const evalU = () => {
      const sol = solveFixed(tree, ew, ed, x0, x1, sr.y0); if (!sol) return null;
      const s = scoreV2(sol, UP, ew, ed, { upper: true }); if (s === null) return null;
      const rp = rulePenalty(sol.placed, ruleCirc(sol.circ), ew, ed, rules, entry);
      return { p: s + RULE_K * (rp.base + Math.min(...rp.p)), sol };
    };
    const R0 = rng(hash('u' + hub + kL + mSide));
    for (let restart = 0; restart < 4; restart++) {
      if (restart) nodes.forEach(nd => { nd.w = nd.w.map(() => Math.exp((R0() - .5) * 1.2)); });
      let cur = evalU();
      for (let it = 0; it < 120 && nodes.length; it++) { const i = Math.floor(R0() * nodes.length), j = Math.floor(R0() * nodes[i].w.length), old = nodes[i].w[j]; nodes[i].w[j] *= Math.exp((R0() - .5) * .8); const c = evalU(); if (c && (!cur || c.p < cur.p)) cur = c; else nodes[i].w[j] = old; }
      if (cur && !cur.sol.viol && (!best || cur.p < best.p)) best = { ...cur, tag: 'u' + (hub === 'deepK' ? 'k' : hub === 'terrace' ? 'r' : hub[0]) + kL + (mSide === 'L' ? 'm' : '') };
      if (best) break;
      const d = globalThis.__v2dbg; if (d && restart === 3) { if (!cur) d['up:' + hub + kL] = 'nosol'; else { const o = {}; globalThis.__v2dbg = o; scoreV2(cur.sol, UP, ew, ed, { upper: true }); globalThis.__v2dbg = d; d['up:' + hub + kL] = Object.keys(o).join(','); } }
    }
    bestBy[hub] = best;
  }
  // تنظيم «الرواق»: صالة علوية أمامية فوق المدخل، ورواق عرضي بعرض المبنى خلف السلم مباشرة، وغرف النوم صفًا خلفيًا
  // على الرواق (والجناحان الأماميان على جانبي الصالة إن اتسعا) — بديل للأجنحة الجانبية على محور الصالة
  if (sr.y0 >= 2.4) for (let kL = 0; kL <= 1; kL++) for (let kR = 0; kR <= 1; kR++) {
    if ((kL > 0) !== (x0 >= 3.3) || (kR > 0) !== (ew - x1 >= 3.3) || x0 > .3 && !kL || ew - x1 > .3 && !kR) continue;
    const order = [...S.filter(b => !b.master), ...S.filter(b => b.master)];
    const L = order.slice(0, kL), R = order.slice(kL, kL + kR), back = order.slice(kL + kR);
    if (!back.length) continue;
    const fb = sr.y1, gy = fb + 1.5; if (ed - gy < 3.4) continue;
    // الصالة العلوية في وسط الصف الخلفي على الواجهة الخلفية، والغرف على جانبيها؛ فوق المدخل بسطة أمامية
    const half = Math.ceil(back.length / 2), bA = [...wcs, ...back.slice(0, half)], bB = [...Fam, ...back.slice(half)];
    const backZ = X(bA.length ? Z(bA, 'y0', 'x') : null, HALL(), bB.length ? Z(bB, 'y0', 'x') : null), R1 = rng(hash('ug' + kL + kR));
    const wn = weightNodes(backZ);
    const evalG = () => {
      const sol = { placed: [], circ: [], courts: [], voids: [] };
      if (kL) sol.placed.push({ block: L[0], r: { x0: 0, x1: x0, y0: 0, y1: fb }, door: 'y1' });
      if (kR) sol.placed.push({ block: R[0], r: { x0: x1, x1: ew, y0: 0, y1: fb }, door: 'y1' });
      sol.circ.push({ id: 'corrF', r: { x0, x1, y0: 0, y1: sr.y0 } }, { id: 'stair', r: { x0, x1, y0: sr.y0, y1: fb } }, { id: 'gallery', r: { x0: 0, x1: ew, y0: fb, y1: gy } });
      const sub = solve(backZ, ew, ed - gy); if (!sub) return null;
      for (const q of sub.placed) sol.placed.push({ ...q, r: { ...q.r, y0: q.r.y0 + gy, y1: q.r.y1 + gy } });
      for (const q of sub.circ) sol.circ.push({ ...q, r: { ...q.r, y0: q.r.y0 + gy, y1: q.r.y1 + gy } });
      const sc = scoreV2(sol, UP, ew, ed, { upper: true }); if (sc === null) return null;
      const rp = rulePenalty(sol.placed, ruleCirc(sol.circ), ew, ed, rules, entry);
      return { p: sc + RULE_K * (rp.base + Math.min(...rp.p)), sol };
    };
    let cur = evalG();
    for (let it = 0; it < 160 && wn.length; it++) { const nd = wn[Math.floor(R1() * wn.length)], j = Math.floor(R1() * nd.w.length), old = nd.w[j]; nd.w[j] *= Math.exp((R1() - .5) * .8); const c = evalG(); if (c && (!cur || c.p < cur.p)) cur = c; else nd.w[j] = old; }
    if (cur && !cur.sol.viol && (!bestBy.gallery || cur.p < bestBy.gallery.p)) bestBy.gallery = { ...cur, tag: 'ug' + kL + kR };
    else if (globalThis.__v2dbg && cur) { const d = globalThis.__v2dbg, o = {}; globalThis.__v2dbg = o; scoreV2(cur.sol, UP, ew, ed, { upper: true }); globalThis.__v2dbg = d; d['up:gallery' + kL + kR] = Object.keys(o).join(','); }
  }
  return Object.values(bestBy).filter(Boolean).sort((a, b) => a.p - b.p).map(b => ({ mode: 'upper', tag: b.tag, sol: b.sol, ew, ed, pen: b.p }));
}
/** حل شجرة الدور العلوي مع عمود محور مثبت [x0,x1] وسلم يبدأ عند sy0؛ ما قبل السلم أمامه، وما بعده يتوزع خلفه. */
function solveFixed(tree, ew, ed, x0, x1, sy0) {
  const out = { placed: [], circ: [], courts: [], voids: [] };
  const cols = tree.k; let p = 0;
  const putIn = (n, r) => {
    if (n.t === 'circ') { out.circ.push({ id: n.id, r }); return true; }
    if (n.t === 'void') { out.voids.push({ ...r }); return true; }
    const sub = solve(n, W_(r), H_(r)); if (!sub) return false;
    for (const q of sub.placed) out.placed.push({ ...q, r: { x0: q.r.x0 + r.x0, x1: q.r.x1 + r.x0, y0: q.r.y0 + r.y0, y1: q.r.y1 + r.y0 } });
    for (const q of sub.circ) out.circ.push({ ...q, r: { x0: q.r.x0 + r.x0, x1: q.r.x1 + r.x0, y0: q.r.y0 + r.y0, y1: q.r.y1 + r.y0 } });
    return true;
  };
  for (const col of cols) {
    const isHub = col.t === 'y' && col.k.some(c => c.t === 'circ' && c.id === 'stair');
    const a = isHub ? x0 : p, b = isHub ? x1 : (col === cols[cols.length - 1] ? ew : x0);
    if (b - a < .5) return null;
    if (isHub) {
      const si = col.k.findIndex(c => c.t === 'circ' && c.id === 'stair'), st = col.k[si], sy1 = sy0 + st.fix;
      const pre = col.k.slice(0, si), post = col.k.slice(si + 1);
      if (sy0 < 2.4 || ed - sy1 < 3 || pre.length !== 1) return null;
      if (!putIn(pre[0], { x0: a, x1: b, y0: 0, y1: sy0 })) return null;
      out.circ.push({ id: 'stair', r: { x0: a, x1: b, y0: sy0, y1: sy1 } });
      const sz = dist(ed - sy1, post.map((c, i) => ({ min: minExt(c, 'y'), fix: 0, a: areaOf(c) * col.w[si + 1 + i] }))); if (!sz) return null;
      let y = sy1;
      for (let i = 0; i < post.length; i++) { const y2 = i === post.length - 1 ? ed : snap(y + sz[i]); if (y2 - y < .5 || !putIn(post[i], { x0: a, x1: b, y0: y, y1: y2 })) return null; y = y2; }
    } else {
      const sub = solve(col, b - a, ed); if (!sub) return null;
      for (const q of sub.placed) out.placed.push({ ...q, r: { ...q.r, x0: q.r.x0 + a, x1: q.r.x1 + a } });
      for (const q of sub.circ) out.circ.push({ ...q, r: { ...q.r, x0: q.r.x0 + a, x1: q.r.x1 + a } });
    }
    p = b;
  }
  return out;
}
/** المستطيل الفعلي للسلم المرسوم (درجتان متقابلتان على جهة x0 من فراغ السلم) — ما يقيسه السجل من المستند. */
function stairFoot(sr) { const wh = sr.x1 - sr.x0, w = Math.max(.9, Math.min(1.2, (wh - .3) / 2)); return { x0: sr.x0 + .15, x1: Math.min(sr.x1, sr.x0 + .15 + 2 * w), y0: sr.y0 + .16, y1: sr.y1 - .16 }; }
/** الحركة كما تراها قواعد العميل: السلم بمستطيله المرسوم لا بفراغه كله («الماستر بعيدة عن الدرج» تُقاس من الدرج نفسه). */
const ruleCirc = circ => circ.map(c => (c.id === 'stair' ? { ...c, r: stairFoot(c.r) } : c));
function addStair(doc, sr, T, level) {
  // يبدأ بعد نصف سماكة الجدار الخارجي (حين يرتد الدور العلوي فوق المدخل يصبح حد السلم الأمامي واجهة)
  const wh = sr.x1 - sr.x0, w = Math.max(.9, Math.min(1.2, (wh - .3) / 2)), ac = sr.x0 + .15 + w / 2, y0 = sr.y0 + .16;
  const p = T(ac, y0), up = T(ac, y0 + 1), px = T(ac + 1, y0);
  const fx = up.x - p.x, fy = up.y - p.y, rot = Math.atan2(fx, fy), q = { x: Math.cos(rot), y: -Math.sin(rot) };
  const flip = (px.x - p.x) * q.x + (px.y - p.y) * q.y < 0;
  return applyCommand(doc, { type: 'add-stair', level, kind: 'U', x: p.x, y: p.y, rot, w, run: sr.y1 - sr.y0 - .32, flip }).doc;
}

export default { generateVillaDesigns, generateVillaTwoFloors, programV2, partiTrees, scoreV2, realizeV2, drawPlanV2, siteOf, difference, roomsDifference, hardGates, VILLA_V2_ENGINE_VERSION };
