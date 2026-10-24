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
import { createDoc, applyCommand, applyCommandOwned, parseDoc } from './draw/doc.mjs';
import { FIXTURES } from './draw/catalog.mjs';
import { circulationProof, CIRC_GATE_LIMITS } from './circulation-proof.mjs';
import { footprint, validatePlot } from './planner.mjs';
import { buildProgram, checkDoc, relaxFixtures, quality, DESIGN_TARGETS, canonicalSide } from './villa-layout.mjs';
import { rulePenalty, verifyRequest, docRooms, blocksFor, stairPathTo } from './rules.mjs';
import { reviewDoc } from './draw/review.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { norm, sub, dot, pointInPolygon } from './draw/geom.mjs';
import { reviewDesign, reviewDesigns, majlisDiningAsked, heavyGate, HEAVY_GATES } from './plan-review.mjs';
import { chooseStair, risersFor, riseOf } from './stair-geometry.mjs';
import { archSignature, archDifference, THRESHOLDS as ARCH_T, archSignatureV2, archDifferenceV2, explainDifference } from './arch-difference.mjs';
import { stackingGates, stackingReport } from './stacking.mjs';
import { applyLiteralReadings } from './requirements.mjs';
import { planParking, PARKING_RULE } from './site-parking.mjs';
import { frontSetbackFor } from './regulations-sa.mjs';
import { clientGlazing } from './glazing.mjs';
import { presentationStatus, STATUS_AR, PROPOSAL_LABEL_AR, MAJOR_PREFS } from './presentation-status.mjs';
import { measureSaudiProgram } from './saudi-program.mjs';
import { measureR16, MANDATORY_R16 } from './privacy-defects.mjs';
import { polishR17 } from './r17-polish.mjs';
import { polishR16 } from './r16-polish.mjs';

export const VILLA_V2_ENGINE_VERSION = 'villa-v2-partis-16'; // الجولة الثامنة عشرة: مسار ضيف الرجال إلى الطعام دون عبور العائلة شرط افتراضي قوي في الاختيار (يُستبدل البديل أو يُسقط ويُذكر السبب)، والطعام يُغلق على العائلة بباب، والصالة ≥ المجلس تحسينًا موضعيًا للمختار، وغرفة الملابس التي يُمشى عبرها ≥ 1.6 م صافيًا؛ // الجولة السابعة عشرة: الصالة العائلية لا تصغر عن 0.8 من مجلس الرجال ولا تبقى ممرًا عابرًا (جلسة 3.0×3.6 م)، والمجلس يلاصق الطعام (مقلط) جزاءً في البحث، واختيار المجموعة الأقل عيوبًا جوهرية بين المجموعات المختلفة معماريًا، والمقهوي، وغرفة الملابس ≥ 4.5 م² حين تُطلب؛ // الجولة السادسة عشرة: تحسين التصميم لا تخفيف المعيار — المواقف خارج مجال رؤية الغرف الخاصة، ونقل النافذة المكشوفة أو جلستها العالية، وباب الماستر من ممر الغرف، وباب المقلط، وجزاء العيوب التي أثبتتها المراجعة r15؛ // الجولة الخامسة عشرة: ثلاثة تنظيمات جديدة (L حول حديقة عائلية، حوشان، الحوش الجانبي) وملاءمة النمط للأرض والبرنامج، وباب الرئيسية العلوية بمسار المشي من وصول الدرج، والمقاس المطابق أفضل داخل السماح؛ // الجولة الرابعة عشرة: صدق التعديل وحالة العرض، والتفضيلات السعودية جزاءً، والمواقف العمودية بجانب المبنى، والحوش الخلفي للأرض غير المنتظمة، وغرفة الملابس، وأثاث المجلس، وتشطيب الدورين (الترقيم والمنور وباب الرئيسية وقراءة المجالس)؛ // الجولة الثالثة عشرة: الارتداد الأمامي من عرض الشارع (اشتراط نظامي متحقق)، وسقف المطبخ الافتراضي مع اقتطاع غرفة غسيل من المطبخ المفرط، ودورة المياه اليومية من طرف الصالة بممر، والزجاج بهدف مرن لكل غرفة، وممر العلوي في «السلم في المقدمة» بعمق ثابت؛ // الجولة الثانية عشرة: القراءة الحرفية للتعارض غير المجاب، والبرنامج السعودي الافتراضي (مدخل منكسر، دهليز المجلس، المقلط، دورة مياه يومية، حمام الخادمة، مطبخ ≥ 14 م² بباب خدمة، المواقف)، ومنع الشريط على الأرض العريضة، والمنور للعميق، وتنظيم «السلم في المقدمة» لخمس غرف علوية؛ // الجولة الحادية عشرة: الاختيار بالمقياس الوظيفي v2، والبوابات الثقيلة (إنشائية مبدئية، حركة فعلية، تطابق 2D/3D) على المعروض، وفتحات لا تعبر التقاطعات، وأثاث يُتحقق منه، وبحث ثانٍ موجّه بالتنوع؛ // الجولة التاسعة: تنظيمات دورين بموضع سلم مختلف (على جدار الجار ببهو مزدوج الارتفاع، في الخلف، في كتلة عائلية) تُحل للدورين معًا مع اتساق التراكب، والرئيسية الأرضية ≤ 24 م²، وغرف النوم لا تفتح على الصالة إلا في «الصالة الموزِّعة» بباب في طرف الجدار، وأنماط H وL للصالة الخلفية؛ الجولة الثامنة: المجلس الرئيسي ≥ 24 م² حد صلب، مجلس النساء ≥ 20 م² ما أمكن، الطعام ≥ 12 م²، الرئيسية العلوية ≤ 26 م²؛ الجولة السابعة: الحوش فناء لا شق (≥ 4.5 م ونسبة ≤ 2)، لا غرف نوم على الشارع ما لم تُطلب، المجلس ≥ 24 م² والطعام ≥ 3.3 م والخادمة ≥ 2.7 م؛ والسادسة: الاختيار بالاختلاف المعماري، تنظيمات الحوش والصالة الموزِّعة، حدود مهنية للممرات والغرف
// تجارب الجولة الرابعة عشرة: R14_OFF يعطّل تعديلًا بعينه للقياس (لا أثر له في التشغيل العادي)
const R14_OFF = new Set(String(globalThis.process?.env?.R14_OFF || '').split(',').filter(Boolean));
const LV = 'L1', SNAP = .05, EXT = .25, INT = .12, TOL = 1e-3;
// أدنى محور لمدخل/ممر فرعي (مدخل الجناح، ممر دورة المياه): صافيه بعد الجدارين ≥ 1.2 م — لا زوايا دخول ضيقة
const VEST_MIN = 1.4;
// (الجولة الحادية عشرة) أدنى بعد بين حافة الفتحة ووجه جدار يلتقي بخطها (قيمة تصميمية افتراضية للميزان): لا فتحة تعبر تقاطعًا
const JUNC_CLEAR = .15;
// (الجولة الحادية عشرة) باب دورة المياه (ومنها دورة مياه الضيوف) 0.8 م صافيًا — قيمة تصميمية افتراضية للميزان
const GUEST_WC_DOOR = .8;
// تلامس فراغين يُفتح بينهما باب: باب 0.8 م وبعد 0.15 م من وجه الجدار المتقاطع في طرفيه (≈ 1.22 م)، بهامش لجدار خارجي
const DOOR_TOUCH = 1.3;
const SLAB_SPAN_MAX = 5.95;
// تلامس بين 1.1 و DOOR_TOUCH يتسع لباب أضيق فقط أو بلا بعد 0.15 م عن التقاطع: جزاء متدرج يوجّه البحث (والمرسوم يُحكم عليه بالبوابات)
const touchPen = t => (t > 0 && t < DOOR_TOUCH ? 400 * (DOOR_TOUCH - t) : 0);
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
/**
 * طول ما «يرى الشارع» من الحافة الأمامية (y0) لمستطيل: الأجزاء التي لا يحجبها أي فراغ مبني أمامها في امتدادها
 * (مطبخ خلف حديقة جانبية يحدها المجلس من الأمام لا يطل على الشارع؛ مطبخ على الواجهة أو خلف ارتداد مكشوف يطل عليه).
 */
function streetLen(r, solids) {
  let segs = [[r.x0, r.x1]];
  for (const q of solids) {
    if (q === r || q.y1 > r.y0 + TOL) continue;
    const nx = []; for (const [a, b] of segs) { if (q.x1 <= a + TOL || q.x0 >= b - TOL) { nx.push([a, b]); continue; } if (q.x0 > a + TOL) nx.push([a, q.x0]); if (q.x1 < b - TOL) nx.push([q.x1, b]); }
    segs = nx; if (!segs.length) break;
  }
  return sum(segs.map(([a, b]) => b - a));
}
/** مجموع أطوال exposed على الجهات المعطاة — الخوارزمية نفسها بلا كائنات وسيطة (في قلب التقييم). */
function expLen(r, solids, sides = SIDES) {
  let tot = 0;
  for (const side of sides) {
    const x = side === 'x0' || side === 'x1', at = r[side], o = opp[side];
    let segs = [x ? r.y0 : r.x0, x ? r.y1 : r.x1];
    for (const q of solids) {
      if (q === r || Math.abs(q[o] - at) > TOL) continue;
      const a0 = x ? q.y0 : q.x0, a1 = x ? q.y1 : q.x1, nx = [];
      for (let i = 0; i < segs.length; i += 2) { const s = segs[i], t = segs[i + 1]; if (a1 <= s + TOL || a0 >= t - TOL) { nx.push(s, t); continue; } if (a0 > s + TOL) nx.push(s, a0); if (a1 < t - TOL) nx.push(a1, t); }
      segs = nx; if (!segs.length) break;
    }
    for (let i = 0; i < segs.length; i += 2) { const d = segs[i + 1] - segs[i]; if (d > .05) tot += d; }
  }
  return tot;
}

// ------------------------------------------------------------------------------------------ البرنامج
/** البرنامج نفسه في الإصدار الأول (توزيع دورات المياه والإضافات والمقاسات)، مع تجميعه في مناطق. */
export function programV2(counts, req = {}) {
  const P = buildProgram(counts, req), B = P.blocks;
  // (الجولة العاشرة) هل طلب العميل أن يفتح المجلس على الطعام (مقلط)؟ وإلا فالمجلس لا يفتح على الطعام العائلي ولا المطبخ
  P.majlisDining = majlisDiningAsked({ text: req.text || req.idea || '', rules: P.rules || [] });
  // (الجولة التاسعة عشرة) «مجلس رجال على الشارع» بند صريح: شريط الدهليز ودورة المياه جانبي (menStrip) لا أمامي
  P.majlisStreet = (P.rules || []).some(r => r.kind === 'place' && r.side === 'front' && /^majlis/.test(String(r.a || '')));
  P.majlisRuled = (P.rules || []).some(r => r.kind !== 'place' && [r.a, r.b].some(x => /^(majlis|guest)/.test(String(x || ''))));
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
    const tol = Number.isFinite(dm.tol) ? dm.tol : .05, s = Math.min(dm.w, dm.l), l = Math.max(dm.w, dm.l);
    for (const b of dimBlocks(key, P)) {
      const T = DESIGN_TARGETS, core = (s + .2) * (l + .2);
      const strip = b.kind === 'majlis' && b.guestWc ? T.guestStripW * (l + .2) : b.kind === 'suite' && b.bath ? b.area - (b.master ? T.master : T.bedroom) : 0;
      b.area = core + strip; b.fixedArea = true; b.dimFix = { s: s + .2 - tol * .6, l: l + .2 - tol * .6 }; b.dimGross = { s: s + .2, l: l + .2 };
      if (b.kind === 'kitchen' && P.kitchenStrip?.length) b.noPantry = true; // المخزن مطلوب أصلًا شريطًا بجوار المطبخ
    }
  }
  // (الجولة السابعة) المجلس الرئيسي (الرجال، أو الوحيد): صافيه ≥ 24 م² افتراضًا ما لم يحدد العميل مقاسه — بجزاء في
  // التقييم لا برفع مساحته المستهدفة (رفعها غيّر توزيع الأطوال في كل الأنماط وأسقط بدائل سليمة؛ الجزاء وحده بلغ 24 م²
  // في الحالات العشر)، ولا رفض: الأرض الصغيرة قد لا تتسع
  { const pm = P.men || (P.women.length === 0 ? B.find(b => b.kind === 'majlis') : null); if (pm) pm.primary = true; }
  P.tweaks = req.tweaks || {};
  saudiDefaults(P, req);
  P.zoneOf = b => (b.kind === 'majlis' || b.guest || b.kind === 'office' || b.kind === 'prayer' ? 'public' : b.kind === 'suite' ? 'private' : b.kind === 'maid' || b.kind === 'driver' ? 'service' : 'family');
  return P;
}

/**
 * (الجولة الثانية عشرة) البرنامج السعودي الافتراضي — «قيمة تصميمية افتراضية للميزان» تغلبها طلبات العميل دائمًا، ولكل بند ملاحظة
 * معلنة (P.mizanDefaults) تُعرض للعميل ويتحقق منها المراجع (plan-review: بوابة إن طلبه العميل، وملاحظة إن كان افتراضيًا):
 *  - المطبخ ≥ 14 م² صافيًا (هدف المساحة 15.6 م² على المحاور) ما لم يحدد العميل مقاسه أو يصغّره؛
 *  - غرفة الخادمة بحمامها ما لم يقل العميل «بدون حمام»؛
 *  - دورة مياه يومية تُدخل من الصالة/المدخل إن لم يكن في البرنامج دورة مياه على الحركة؛
 *  - باب خدمة (مقلط) بين مجلس الرجال والطعام للضيافة في الدور الواحد ما لم يعارضه العميل («المجلس بعيد عن الطعام»).
 * (مدخل العائلة المنكسر، ودهليز مجلس الرجال، وباب المطبخ الخلفي، ومواقف السيارات: في التفصيل والرسم.)
 */
export const KITCHEN_DEFAULT_AREA = 15.6, KITCHEN_DEFAULT_NET = 14;
function saudiDefaults(P, req = {}) {
  const B = P.blocks, out = (P.mizanDefaults = []);
  const ex = req.extras || {}, pr = req.prefs || {}, rules = P.rules || [];
  // المطبخ
  const k = B.find(b => b.id === 'kitchen1');
  if (k && !k.fixedArea && !P.dims?.kitchen && !(P.tweaks?.kitchenScale && P.tweaks.kitchenScale < 1)) {
    const strip = P.kitchenStrip?.length ? (P.kitchenStrip.length === 2 ? 9 : 5.5) : 0;
    if (k.area - strip < KITCHEN_DEFAULT_AREA) k.area = KITCHEN_DEFAULT_AREA + strip;
    k.minNet = KITCHEN_DEFAULT_NET; out.push({ id: 'kitchen', ar: `مطبخ لا يقل صافيه عن ${KITCHEN_DEFAULT_NET} م² وبباب خدمة إلى الحوش` });
  }
  // حمام الخادمة
  if (P.maid && !P.maid.bath && !ex.maid?.noBath) {
    // لا يصير «جناحًا بحمام» في البحث (أسقط ذلك تنظيمات سليمة: الحمام الجانبي يضيّق الغرفة)؛ تُزاد مساحتها ويُقتطع الحمام عند
    // التفصيل من جانبها البعيد عن بابها متى بقيت الغرفة ≥ 2.7 م صافيًا، وإلا يُذكر أنه لم يتسع
    P.maid.area += 4; P.maid.mizanBath = true;
    // من دورات المياه الزائدة في عدد العميل إن وُجد منها اثنتان فأكثر (تبقى واحدة يومية)، وإلا زيادة معلنة على العدد
    if ((P.wcs || []).length >= 2) { const w = P.wcs.pop(); B.splice(B.indexOf(w), 1); }
    out.push({ id: 'maidBath', ar: 'غرفة الخادمة بحمامها' });
  }
  // دورة مياه يومية على الحركة العائلية (لا داخل جناح نوم ولا في منطقة الضيوف)
  // (تُقتطع عند التفصيل من البهو أو من جانب فراغ عائلي إن لم يكن في البرنامج دورة مياه على الحركة — لا كتلة في البحث: إضافتها كتلةً
  //  أسقطت تنظيمات سليمة كثيرة لتعذّر وصلها بالحركة)
  P.dayWc = !B.some(b => b.kind === 'wc');
  out.push({ id: 'dayWc', ar: 'دورة مياه يومية تُدخل من الصالة أو المدخل' });
  // المقلط: باب بين مجلس الرجال والطعام (الدور الواحد) ما لم يعارضه العميل
  const opposed = rules.some(r => ['far', 'apart'].includes(r.kind) && [r.a, r.b].some(x => /^majlis/.test(String(x || ''))) && [r.a, r.b].includes('dining'));
  // (الجولة السابعة عشرة) والدوران أيضًا: المجلس والطعام في الأرضي (المراجع المستقل r16، C7) — كان للدور الواحد فقط
  P.majlisDiningDefault = !P.majlisDining && !opposed && !!P.men && P.dining.length > 0 && ((pr.floors || 1) === 1 || !R14_OFF.has('r17tf'));
  // (الجولة السابعة عشرة) ضيف الرجال يصل إلى الطعام دون عبور العائلة (GUEST_DINING) — في الدور الواحد والدورين: يوجّه البحث إلى
  // ملاصقة المجلس للطعام (باب مقلط) ما لم يطلب العميل فصلهما
  P.guestLink = !opposed && !!P.men && P.dining.length > 0 && !/مجلس[^،.]{0,20}(?:بعيد|منفصل|مستقل) (?:عن|من) (?:ال)?(?:طعام|سفر)/.test(String(req.text || req.idea || '').replace(/[ةه]/g, 'ه'));
  if (P.majlisDiningDefault) out.push({ id: 'majlisDining', ar: 'باب خدمة (مقلط) من مجلس الرجال إلى الطعام للضيافة، والطعام يُغلق على العائلة بباب' });
  out.push({ id: 'familyEntry', ar: 'مدخل العائلة منكسر أو بحاجز بصري (لا خط رؤية مستقيم من الباب إلى الصالة)' });
  if (P.men) out.push({ id: 'majlisLobby', ar: 'مجلس الرجال بدهليز دخول (لا يُفتح الباب الخارجي على المجلس مباشرة)' });
  out.push({ id: 'parking', ar: 'موقف سيارة أو موقفان في الارتداد الأمامي داخل حدود الأرض' });
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
// (الجولة الثانية عشرة) منور: فناء صغير مكشوف (≥ 2.2 م محورًا، نسبته ≤ 3.5) يضيء عمق المبنى في الأرض الضيقة العميقة
const WELL = area => ({ t: 'court', area, well: true });
const VOID = area => ({ t: 'void', area });
/** فراغ خارجي اختياري في آخر جناح: يمتص فرق العمق بين الأجنحة فيصير حديقة/ركنًا خارجيًا، أو يختفي. */
const OV = (area = 6) => ({ t: 'void', area, opt: true });
function mk(t, kids) {
  const k = kids.filter(n => n && !(n.t === 'zone' && !n.b.length));
  if (!k.length) return null; if (k.length === 1) return k[0];
  for (const c of k) if ((c.t === 'circ' || c.t === 'dual') && c.fix) { c.fixDir = t; if (c.t === 'dual') { c.g.fixDir = t; c.u.fixDir = t; } }
  return { t, k, w: k.map(() => 1) };
}
const X = (...k) => mk('x', k), Y = (...k) => mk('y', k);
/** نسخة من الشجرة بأوزان ومراتب مستقلة (البحث يعدّلها) مع الإبقاء على كتل البرنامج نفسها. */
const cloneTree = n => { const c = n.t === 'zone' ? { ...n, b: [...n.b], w: [...n.w] } : n.k ? { ...n, k: n.k.map(cloneTree), w: [...n.w] } : n.t === 'dual' ? { ...n, g: cloneTree(n.g), u: cloneTree(n.u) } : { ...n }; delete c._mx; delete c._my; return c; };
/** هامش خارجي جانبي (يبقى خارج المبنى) بعرض أدنى 0.6 م؛ عرضه متغير بحث. */
const MARGIN = c => ({ t: 'void', area: Math.max(3, areaOf(c) * .05), min: .6, margin: true });
// أدنى امتداد لكل نوع: على امتداد الصف (run) وبالعمق (dep). افتراضات تصميمية.
// (الجولة السابعة) الطعام ≥ 3.3 م صافيًا (محور 3.5)، وغرفة الخادمة ≥ 2.7 م صافيًا (محور 2.9) — حدود مهنية معلنة
const RUN = { store: 1.2, wc: 1.7, suite: 3.4, majlis: 4.0, dining: 3.5, kitchen: 3.3, family: 3.6, maid: 2.9, driver: 2.6, office: 2.8, prayer: 2.4 };
const DEP = { store: 1.2, wc: 1.9, suite: 3.4, majlis: 4.0, dining: 3.5, kitchen: 3.3, family: 3.4, maid: 2.9, driver: 2.6, office: 2.8, prayer: 2.4 };
// (الجولة السابعة) الحوش فناء لا شق: ضلعه الأقصر ≥ 4.5 م صافيًا (محور 4.75 بجدارين خارجيين) ونسبته الصافية ≤ 2
const COURT_MIN = 4.75, COURT_ASP = 2.0;
const CMIN = { foyer: 2.4, hall: 4.2, stair: 2.6 };
const FOYER_WC_AREA = 8.5; // (الجولة الثالثة عشرة) بهو يتسع لدورة المياه اليومية الافتراضية وخزانتها في طرفه
// الجناح بحمام: عرض الغرفة (≥3.0) + شريط الحمام والخزانة (1.7–2.2) على امتداد الممر
const runOf0 = b => (b.kind === 'suite' && b.bath ? (b.master ? 4.2 : 3.7) : b.kind === 'maid' && b.bath ? 4.5 : RUN[b.kind] || 2.6);
const depOf0 = b => (b.kind === 'suite' ? (b.master ? 3.8 : 3.5) : DEP[b.kind] || 2.6);
// المقاس الصريح يرفع أدنى الامتداد إلى ضلعه الأقصر (لا يُخفض الحد التصميمي)
const runOf = b => Math.max(runOf0(b), b.dimFix && b.kind !== 'suite' ? b.dimFix.s : 0);
const depOf = b => Math.max(depOf0(b), b.dimFix && b.kind !== 'suite' ? b.dimFix.s : 0);
/**
 * أدنى امتداد لكتلة على امتداد منطقتها حين يُعرف عمق المنطقة (cross): الجناح بحمامه يحتاج إما عمقًا يتسع للحمام
 * أمام الغرفة (تنظيم «عميق») أو امتدادًا يتسع لشريط الحمام بجانبها (تنظيم «جانبي») — وإلا تضيق الغرفة عن 3.2 م.
 * المعادلة نفسها في suiteVariant والتقييم؛ هنا تقطع الحلول المستحيلة مبكرًا فيتجه البحث إلى الممكن.
 */
function suiteRun(b, cross) {
  const r0 = runOf(b);
  if (b.kind !== 'suite' || !b.bath || b.nearHall) return r0;
  const T = DESIGN_TARGETS, lim = b.master ? 3.5 : 3.2, td = b.master ? 2.4 : 2.1, sd = b.master ? T.masterStripD : T.stripD;
  const deepRun = Math.max(VEST_MIN + 2.1, 1.25 + (b.master ? T.masterBathL : T.bathL) * .9);
  return Math.max(r0, cross - td >= lim ? deepRun : lim + sd);
}
function minExt(n, dir) {
  // ثابت لكل عقدة أثناء البحث (لا يتغير بالأوزان ولا بترتيب الكتل داخل المنطقة): يُحفظ
  const key = dir === 'x' ? '_mx' : '_my'; if (n[key] !== undefined) return n[key];
  return (n[key] = minExt0(n, dir));
}
function minExt0(n, dir) {
  if (n.t === 'zone') return n.along === dir ? sum(n.b.map(runOf)) : Math.max(n.minCross || 0, ...n.b.map(depOf));
  if (n.t === 'circ') return n.fix && n.fixDir === dir ? n.fix : Math.max(CMIN[n.id] ?? 1.2, dir === 'y' && n.minY ? n.minY : 0);
  if (n.t === 'court') return n.well ? 2.2 : COURT_MIN;
  if (n.t === 'dh') return 3.0;
  if (n.t === 'dual') return n.fix && n.fixDir === dir ? n.fix : Math.max(minExt(n.g, dir), minExt(n.u, dir));
  if (n.t === 'void') return n.opt ? 0 : n.min ?? 3.6; // حديقة صالحة للاستعمال لا شريط (والهامش على أرض غير منتظمة أضيق)
  return n.t === dir ? sum(n.k.map(c => minExt(c, dir))) : Math.max(...n.k.map(c => minExt(c, dir)));
}
function areaOf(n) {
  if (n.t === 'zone') return sum(n.b.map((b, i) => b.area * n.w[i]));
  if (n.t === 'circ' || n.t === 'court' || n.t === 'void') return n.area;
  if (n.t === 'dh') return n.area || 12;
  if (n.t === 'dual') return Math.max(areaOf(n.g), areaOf(n.u));
  return sum(n.k.map((c, i) => areaOf(c) * n.w[i]));
}
/** يوزع الطول L على العناصر بنسبة مساحاتها مع حد أدنى لكل منها وثابت للممرات؛ null إن لم يتسع. */
function dist(L, items) {
  // الخوارزمية نفسها بلا Map ولا مصفوفات وسيطة في كل دورة (في قلب البحث): ترتيب الجمع نفسه (ترتيب الإدراج) فالنتيجة نفسها حرفيًا
  const n = items.length;
  let sm = 0; for (let i = 0; i < n; i++) sm += items[i].fix || items[i].min;
  if (sm > L + 1e-6) return null;
  const isF = new Array(n).fill(false), fv = new Array(n), order = [];
  for (let i = 0; i < n; i++) if (items[i].fix) { isF[i] = true; fv[i] = items[i].fix; order.push(i); }
  for (let k = 0; k <= n; k++) {
    let fs = 0; for (const i of order) fs += fv[i];
    const rest = L - fs;
    let nFree = 0, tot = 0; for (let i = 0; i < n; i++) if (!isF[i]) { nFree++; tot += items[i].a; }
    if (!nFree) {
      const out = new Array(n); for (let i = 0; i < n; i++) out[i] = fv[i];
      let nFlex = 0; for (let i = 0; i < n; i++) if (!items[i].fix) nFlex++;
      if (nFlex) { for (let i = 0; i < n; i++) if (!items[i].fix) out[i] += rest / nFlex; } else out[n - 1] += rest;
      return out;
    }
    tot = tot || 1; let ch = false;
    for (let i = 0; i < n; i++) { if (isF[i]) continue; const d = rest * items[i].a / tot; if (d < items[i].min - 1e-9) { isF[i] = true; fv[i] = items[i].min; order.push(i); ch = true; } }
    if (!ch) { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = isF[i] ? fv[i] : rest * items[i].a / tot; return out; }
  }
  return null;
}
/** يحل الشجرة داخل غلاف ew×ed: يعيد الكتل الموضوعة والحركة والأحواش والفراغات الخارجية، أو null. */
function solve(tree, ew, ed) {
  const out = { placed: [], circ: [], courts: [], voids: [], dh: [] };
  let o = out; // (الجولة التاسعة) عقدة «dual»: الدوران معًا في المستطيل نفسه — الأرضي في out والعلوي في out.up
  const rec = (n, r) => {
    if (n.t === 'dual') {
      if (!rec(n.g, r)) return false;
      const keep = o; o = out.up ||= { placed: [], circ: [], courts: [], voids: [], dh: [] };
      const ok = rec(n.u, r); o = keep; return ok;
    }
    // (الجولة التاسعة) عقدة «إطار» بقطوع ثابتة (إحداثيات مطلقة من الدور الأرضي): جدران العلوي على خطوط جدران الأرضي
    if ((n.t === 'x' || n.t === 'y') && n.at) {
      const dir = n.t, a0 = dir === 'x' ? r.x0 : r.y0, a1 = dir === 'x' ? r.x1 : r.y1, cuts = [a0, ...n.at, a1];
      for (let i = 0; i < n.k.length; i++) {
        const p = cuts[i], q = cuts[i + 1]; if (q - p < .5) return false;
        if (!rec(n.k[i], dir === 'x' ? { x0: p, x1: q, y0: r.y0, y1: r.y1 } : { x0: r.x0, x1: r.x1, y0: p, y1: q })) return false;
      }
      return true;
    }
    if (n.t === 'x' || n.t === 'y') {
      const dir = n.t, L = dir === 'x' ? W_(r) : H_(r);
      const sz = dist(L, n.k.map((c, i) => ({ min: minExt(c, dir), fix: (c.t === 'circ' || c.t === 'dual') && c.fix && c.fixDir === dir ? c.fix : 0, a: areaOf(c) * n.w[i] })));
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
      const dir = n.along, L = dir === 'x' ? W_(r) : H_(r), cross = dir === 'x' ? H_(r) : W_(r);
      const sz = dist(L, n.b.map((b, i) => ({ min: suiteRun(b, cross), fix: 0, a: b.area * n.w[i] }))); if (!sz) return false;
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
          if (extra.pantry && cross - tgt > 2.6) o.bigPantry = (o.bigPantry || 0) + (cross - tgt - 2.6); // مخزن متضخم = مطبخ في عمود أعرض منه بكثير
          // الزائد على جهة الحركة أو الجهة المقابلة (متغير بحث): الغسيل على الحركة يصير مدخل خدمة للخادمة ويبقي نافذتها
          const ps = n.pside ? n.door : opp[n.door], [pan, kit] = cut(slot, ps, snap(cross - tgt));
          o.placed.push({ block: b, r: kit, door: n.door });
          o.placed.push({ block: { ...extra, area: A_(pan) }, r: pan, door: opp[ps] });
          return;
        }
        o.placed.push({ block: b, r: slot, door: n.door });
      });
      return true;
    }
    if (n.t === 'circ') { o.circ.push(n.dh || n.big || n.wc ? { id: n.id, r: { ...r }, dh: !!n.dh, big: !!n.big, wc: !!n.wc } : { id: n.id, r: { ...r } }); return true; }
    if (n.t === 'court') { o.courts.push(n.well ? { ...r, well: true } : { ...r }); return true; }
    if (n.t === 'dh') { o.dh.push({ ...r }); return true; }
    o.voids.push(n.margin ? { ...r, margin: true } : { ...r }); return true;
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
  rearbar: 'شريط خدمة خلفي: الضيافة أمامًا، والصالة وحديقة جانبية في الوسط، والطعام والمطبخ والخادمة صفًا على الواجهة الخلفية، وجناح النوم بطول المبنى',
  courtrear: 'حوش داخلي تطل عليه الصالة والطعام والمطبخ، والخدمة على ضلعه الخلفي، وجناح النوم على ضلعه الآخر',
  splitrear: 'كتلتان: الضيافة والصالة بين فناءين أمامًا، وكتلة خلفية فيها الطعام والمطبخ على الواجهة الخلفية وغرف النوم على ممرها',
  ellfoot: 'شكل L: جناح نوم بطول المبنى، والصالة في المحور، وحديقة جانبية، والمطبخ والخدمة في قدم الـL على الواجهة الخلفية',
  stairback: 'السلم في آخر الصالة: المدخل فالصالة فالسلم في المحور، والخدمة وغرفة الأرضي جناحان على الجانبين؛ فوق المدخل والصالة صالة علوية كبيرة وغرف النوم حولها وخلفها',
  midcourt: 'للأرض الضيقة: حوش في منتصف العمق يفصل الضيافة عن العائلة، وممر جانبي قصير على الحوش يصل إلى جناح النوم الخلفي',
  courtring: 'بيت الحوش: حوش في قلب البيت يحيط به رواقان قصيران، الصالة أمامه والرئيسية خلفه، وغرف الأبناء على جانب والطعام والمطبخ على الجانب المقابل',
  podcore: 'نواة نوم خلف الصالة: المدخل ومجلس النساء أمامًا، فالصالة، فكتلة نوم بممر أوسط قصير تُفتح عليه الغرف من جهتيه والرئيسية في آخره؛ والمجلس والخدمة عمود جانبي',
  splitpod: 'كتلتان بينهما رواق زجاجي وحديقتان: الضيافة والصالة أمامًا، والطعام والمطبخ ونواة النوم (ممر قصير مزدوج) خلفًا',
  centralhall: 'الصالة المركزية الموزِّعة: غرف النوم على جانبيها تُفتح عليها مباشرة بلا ممرات، والضيافة صف أمامي، والطعام والمطبخ صف خلفي على الحديقة',
  rearhall: 'الصالة في وسط الجناح الخلفي تُفتح عليها غرف النوم من جانبيها بلا ممر نوم، والضيافة أمامًا والخدمة صفًا وسطًا',
  tplan: 'شكل T: شريط الضيافة أمامًا بعرض البيت، والصالة العائلية في المحور على الحديقة الخلفية بين جناح الأبناء وجناح الخدمة وكبار السن والرئيسية',
  hplan: 'شكل H: جناحان متوازيان بطول البيت يصلهما جسر الصالة، بفناء أمامي للمدخل وحوش خلفي تطل عليه الصالة',
  lhall: 'شكل L: جناح نوم بطول البيت، وشريط ضيافة أمامي، والصالة في ركن الـL على الحديقة الخلفية وغرفة كبار السن بجوارها',
  // (الجولة الخامسة عشرة)
  gardenl: 'L حول حديقة عائلية: شريط الضيافة بعرض البيت أمامًا، وكتلة العائلة والنوم على جانب واحد، والحديقة في الركن الخلفي المقابل تطل عليها الصالة ونواة النوم',
  twincourt: 'حوشان بلا فرق مناسيب: حوش للضيوف في جناح الضيافة بين المجلس والمقلط، وحوش للعائلة في قلب البيت خلف الصالة يطل عليه ممر النوم',
  sidecourt: 'بيت الحوش الجانبي: شريط ضيافة أمامي، والطعام والمطبخ فالصالة فحوش جانبي مكشوف تطل عليه الصالة ورواق النوم، وصف النوم خلفًا',
  // (الجولة السابعة عشرة)
  guestblock: 'جناح ضيافة أمامي: المجلس والمقلط متجاوران على الواجهة بباب بينهما والمطبخ خلف المقلط يخدمه، والمدخل العائلي والصالة عمود بجانبه، وغرف النوم خلفًا',
});
/** يبني أشجار الأنماط للبرنامج. كل نمط له بديل أو أكثر بالطوبولوجيا (لا بالانعكاس). */
export function partiTrees(P, { stair = false, W = Infinity, irregular = false } = {}) {
  const T = DESIGN_TARGETS, M = P.men, Wm = P.women[0] || null, Wx = P.women.slice(1);
  const Dn = P.dining, K = P.kitchens, Md = P.maid ? [P.maid] : [];
  const pub = [P.guest, P.office, P.prayer, P.driver].filter(Boolean), S = P.suites, Fam = P.family;
  const wcA = P.wcs.slice(0, 1), wcB = P.wcs.slice(1);
  const flex = [...Wx, ...pub], svc = [...flex, ...Dn, ...K, ...Md, ...wcA];
  const A = sum(P.blocks.map(b => b.area)) + P.hallArea + T.foyer;
  const courtA = Math.max(COURT_MIN * COURT_MIN + 1, Math.min(40, A * .08)), gardenA = Math.max(24, Math.min(70, A * .14));
  const Mz = d => (M ? Z([M], d, 'x') : null);
  const Wz = (d, along = 'y') => (Wm ? Z([Wm], d, along) : null);
  // مدخل مضغوط (≈ 8.5 م²): الحركة لا تُهدر في الردهة؛ (الجولة الثالثة عشرة) ومع دورة المياه اليومية الافتراضية يتسع البهو لها (≈ 11.5 م²،
  // عمقه ≥ 2.7 م حين يكون في عمود المحور) فتُقتطع من طرفه عند التفصيل — البهو الباقي بالمساحة المضغوطة نفسها
  const F = () => C('foyer', P.dayWc ? { area: FOYER_WC_AREA, wc: true } : { area: T.foyer * .85 });
  const H = () => C('hall', { area: P.hallArea });
  // السلم U بقلبتين (ارتفاع دور ≈ 3.2 م، درجة ≈ 0.28–0.30 م) يحتاج نحو 3.7 م طولًا؛ عرض فراغه عرض محور الصالة
  const ST = () => (stair ? C('stair', { fix: 3.7, area: 4.4 * 3.7 }) : null);
  const corr = (id = 'corr') => C(id, { fix: 1.5, area: 14 }); // صافي ≥ 1.25 م حتى بين جدارين خارجيين (على حوش)
  const gal = (id = 'gallery') => C(id, { fix: 1.5, area: 24 });
  const beds = [...Fam, ...wcB, ...S];
  // الصف الخلفي يتسع لعدد محدود من الأجنحة بعرض الأرض؛ الزائد (كبار السن أولًا) يذهب إلى صف الصالة أو جناح جانبي
  const rowOrder = [...S].reverse().concat(wcB, Fam); let acc = 0; const bedsRow = [], over = [];
  for (const b of rowOrder) { acc += runOf(b) + .15; (acc <= W - .3 || b.master ? bedsRow : over).push(b); }
  // (الجولة الثامنة) الأنماط ذات صف النوم الخلفي (galBeds(bedsRow)) تضع الزائد (كبار السن أولًا) بجوار الصالة على جهة
  // الحديقة؛ كانت تُسقطه فيُبنى المرشح ثم يُرفض «عدد غرف النوم 4 بدل 5» (C2: split وsidemajlis)
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
  const push = (mode, tag, tree, o = {}) => { const used = svCount > lastSv; lastSv = svCount; if (!tree || (svMode === 'pair' && !used)) return; out.push({ mode, tag: tag + (svMode === 'pair' ? 'p' : ''), tree, ...o }); };
  const gen = () => {
  // الأعمدة الثلاثة: يسار | محور (المدخل ثم الصالة) | يمين. المجلسان على الواجهة في رأسي العمودين الجانبيين؛
  // swap: مجلس الرجال فوق الجناح الآخر (بديل طوبولوجي لعلاقة الضيافة بالنوم والخدمة، لا انعكاس للمخطط)
  const cols = (leftBelow, mid, rightBelow, swap = false) => {
    const L = swap ? (Wm ? Z([Wm], 'x1', 'y') : null) : Mz('x1'), R = swap ? Mz('x0') : Wz('x0');
    // (الجولة السابعة) عمود بلا مجلس في رأسه وفيه غرف نوم: فناء أمامي اختياري يسبقها، فلا تقع غرفة نوم على الشارع إلا مضطرًا
    return X(Y(L || FG(leftBelow), ...leftBelow), Y(F(), ST(), ...mid), Y(R || FG(rightBelow), ...rightBelow));
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
  // جناح نوم يبدأ من الواجهة الأمامية: فناء أمامي اختياري (OV) أمامه — يمتصه البحث حين تُجازى غرفة النوم على الشارع
  const hasSuite = n => !!n && (n.t === 'zone' ? n.b.some(b => b.kind === 'suite') : !!n.k?.some(hasSuite));
  // مساحته الابتدائية كافية ليبدأ البحث بفناء فعلي (≥ 2.4 م عمقًا)؛ إن لم ينفع يصغر فيُضم لجاره ويختفي
  const FG = list => (list.some(hasSuite) ? OV(25) : null);
  const FB = node => (node && hasSuite(node) ? Y(OV(25), node) : node);
  // طلب صريح بالخدمة في الخلف («المطبخ في الخلف»…): تُضاف أنماط تضع المطبخ في موضعها الخلفي بالبناء
  const rearSvc = (P.rules || []).some(r => r.kind === 'place' && r.side === 'back' && ['kitchen', 'dining', 'maid', 'laundry', 'service'].includes(r.a));
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
    // U أرضي: الصالة في المحور خلف السلم تطل على حديقة خلفية بين جناح الخدمة وغرفة الأرضي
    if (gS.length) both('yoo', 'c7', sw => cols([SVZ('x1'), OV()], [H(), VOID(gardenA * .5)], [Z(gS, 'x0', 'y'), OV()], sw));
    // صفّان: أمامي (المجلس | المدخل والسلم | غرفة الأرضي) وخلفي (الطعام والمطبخ | الصالة | الخدمة)
    // صفّان: أمامي (المجلس | المدخل والسلم | الطعام والمطبخ متجاوران خلفه) وخلفي (غرفة الأرضي | الصالة | المطبخ والخدمة)
    if (gS.length) push('rows', 'c8', Y(X(Mz('y1'), Y(F(), ST()), Z([...flex, ...Md, ...wcA], 'y1', 'x')), X(Z(gS, 'x1', 'y'), H(), DK('x0')), OV()));
    // (الجولة السادسة) السلم في آخر الصالة لا بين المدخل والصالة: المدخل فالصالة فالسلم في المحور، فيصير فوق المدخل
    // والصالة صالةٌ علوية كبيرة في الأمام (معيشة عائلية تطل على الشارع) وغرف النوم حولها وخلفها — تنظيم علوي مختلف
    // (والطعام خلف السلم في المحور يُدخل إليه بجانبه، والمطبخ بجواره في الجناح؛ فوق الطعام غرفة أو ممر العلوي)
    const colsB = (leftBelow, rightBelow, back, sw = false) => { const L = sw ? (Wm ? Z([Wm], 'x1', 'y') : null) : Mz('x1'), R = sw ? Mz('x0') : Wz('x0'); return X(Y(L || FG(leftBelow), ...leftBelow), Y(F(), H(), ST(), back), Y(R || FG(rightBelow), ...rightBelow)); };
    if (gS.length && Dn.length) both('stairback', 'c9', sw => colsB([Z([...flex, ...wcA, ...Md, ...K], 'x1', 'y')], [Z(gS, 'x0', 'y'), OV()], Z(Dn, 'y0', 'x'), sw));
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
      push('hallback', 'h2', X(Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), X(VOID(gardenA * .6), Z([eld], 'y0', 'x'))), FB(corrBeds(rest))));
    }
    // (5-ب) الطعام في المحور خلف الصالة مفتوحًا عليها ومطلًّا على الحديقة الخلفية، والمطبخ بجواره في آخر جناح الخدمة
    // (يقصر الصالة حين يطول جناح الخدمة: لا تُمد الصالة لتبلغ طعامًا في آخر الجناح)
    if (Dn.length && K.length) both('yoo', 'u1', sw => cols([Z([...flex, ...wcA, ...Md, ...K], 'x1', 'y'), OV()], [H(), Z(Dn, 'y0', 'x'), OV()], [corrBeds(beds)], sw));
    // (5ب) جناحا نوم منفصلان: الأبناء في جناح، والرئيسية خلف الخدمة في الجناح المقابل بممر قصير من الصالة
    if (S.length >= 2) {
      const kids = [...Fam, ...wcB, ...S.filter(b => !b.master)], mst = S.filter(b => b.master);
      both('wings', 'w0', sw => cols([corrBeds(kids, 'x1')], [H(), VOID(gardenA)], [SVZ('x0'), X(corr('corrB'), Z(mst, 'x0', 'y'))], sw));
      // (الجولة السادسة) وبغرفة كبار السن: الأبناء وحدهم في جناحهم (ممر أقصر)، وكبار السن في الجناح المقابل على الصالة
      // مباشرة بين الخدمة والرئيسية
      const eldW = kids.find(b => b.elderly);
      // U بغرفة كبار السن في جناح الخدمة على الصالة مباشرة، فيقصر جناح النوم (الأبناء والرئيسية في آخره)
      if (eldW && kids.length >= 3) both('yoo', 'u2', sw => cols([Z([eldW], 'x1', 'y'), SVZ('x1'), OV()], [H(), VOID(gardenA)], [corrBeds(beds.filter(b => b !== eldW))], sw));
      if (eldW && kids.length >= 3) both('wings', 'w1', sw => cols([corrBeds(kids.filter(b => b !== eldW), 'x1')], [H(), VOID(gardenA)], [SVZ('x0'), Z([eldW], 'x0', 'y'), X(corr('corrB'), Z(mst, 'x0', 'y'))], sw));
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
    push('hallback', 'h0', X(Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), VOID(gardenA)), FB(corrBeds(beds))));
    // والخدمة أمامًا بجوار المدخل (بدل مجلس النساء) ومجلس النساء خلفها، والصالة خلف المدخل على الحديقة
    if (Wm) push('hallback', 'h1', X(Y(X(Mz('y1'), F(), Z([...flex, ...Md, ...wcA], 'x0', 'x')), X(Y(Z([Wm], 'x1', 'y'), OV()), H(), DK('x0')), VOID(gardenA)), FB(corrBeds(beds))));
    // (6ب) الصالة على الواجهة الجانبية: الضيافة صف أمامي، ثم صف عائلي (الصالة على الجانب، فالطعام والمطبخ متجاوران،
    // فالخادمة والمرافق)، ثم رواق غرف النوم بعرض المبنى؛ و(6ج) الصف العائلي نفسه وجناح النوم بطول المبنى
    push('sideliving', 'z0', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(overZ('x1'), H(), DK('x0'), Z([...flex, ...Md, ...wcA], 'x0', 'y')), galBeds(bedsRow, 'x1')));
    push('sideliving', 'z1', X(Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(H(), DK('x0'), Z([...flex, ...Md, ...wcA], 'x0', 'y')), OV()), FB(corrBeds(beds))));
    // (6د) مجلس الرجال على الواجهة الجانبية بمدخله المستقل من الارتداد الجانبي، خلف مجلس النساء (أو حديقة أمامية)؛
    // النوم رواقًا خلفيًا (j0) أو جناحًا بطول المبنى (j1)
    const WzG = () => (Wm ? Wz('x1') : VOID(gardenA * .4));
    if (M) {
      push('sidemajlis', 'j0', Y(X(Y(WzG(), Z([M], 'x1', 'y')), Y(F(), H()), Y(SVZ('x0'), overZ('x0') || OV())), galBeds(bedsRow)));
      push('sidemajlis', 'j1', X(Y(WzG(), Z([M], 'x1', 'y'), SVZ('x1'), OV()), Y(F(), H(), VOID(gardenA)), FB(corrBeds(beds))));
    }
    // (6هـ) المدخل في ركن الواجهة (لا في المحور): المجلسان على بقية الواجهة، والصالة خلف المدخل على الواجهة الجانبية
    push('cornerentry', 'e0', Y(X(Mz('y1'), Wm ? Z([Wm], 'x1', 'x') : null, F()), X(SVZ('x1'), H(), overZ('x0')), galBeds(bedsRow)));
    push('cornerentry', 'e1', X(FB(corrBeds(beds, 'x1')), Y(X(F(), Wz('x0', 'x'), Mz('y1')), X(H(), SVZ('x0')), OV())));
    // (6و) جناح الخدمة في الأمام بجوار المدخل (الخادمة والمرافق على الواجهة)، والمطبخ والطعام خلفه، والصالة خلف المدخل
    if (!Wm) push('svcfront', 'v0', Y(X(Mz('y1'), F(), Z([...flex, ...Md, ...wcA], 'x0', 'y')), X(overZ('x1'), H(), DK('x0')), galBeds(bedsRow)));
    // (6ز) أنماط «الخدمة في الخلف» بالبناء لا بالترشيح (تُولَّد حين يطلب العميل المطبخ/الطعام/الخدمة في الخلف):
    // المطبخ في موضعه الخلفي من شجرة النمط نفسها، والطعام بجواره يلامس الصالة، والخادمة ملاصقة للمطبخ
    if (rearSvc && K.length && Dn.length) {
      const bedsW = [...wcA, ...beds];
      // (ب) قدم الـL: المطبخ والخادمة في آخر العمود الجانبي على الواجهة الخلفية وحديقة أمامهما، والطعام خلف الصالة بجوار المطبخ
      both('ellfoot', 'f0', sw => cols([VOID(gardenA * .4), Z([...flex, ...Md, ...K], 'x1', 'y')], [H(), Z(Dn, 'y0', 'x')], [corrBeds(bedsW)], sw));
      // (ج) حوش داخلي في المحور خلف الصالة: عمود الخدمة بطول المبنى على جانب (المطبخ في آخره على الواجهة الخلفية)،
      // وجناح النوم على الجانب الآخر، والرئيسية خلف الحوش تُفتح على ممر الجناح — الحوش محاط بالمبنى من جهاته الأربع
      { const mst = beds.find(b => b.master), rest = beds.filter(b => b !== mst);
        if (mst && rest.length) both('courtrear', 'q1', sw => cols([SVZ('x1')], [H(), COURT(courtA), Z([mst], 'x1', 'y')], [X(corr(), Z([...wcA, ...rest], 'x0', 'y'))], sw)); }
      // (الجولة الثالثة عشرة) جُرّب نمط «حوش في القلب والخدمة صفًا خلفيًا على الحوش» لـC8 (المطبخ في الخلف مع بقاء الحوش) ولم يُبنَ:
      // بعرض 16.74 م لا يتسع جناحا نوم بممرّيهما (5.3 م لكل منهما) ورواقا الحوش (4.75 + 2 × 1.5)؛ وبلا ممرّي النوم تُبلغ صالة الطعام
      // الخلفية عبر رواق تُفتح عليه غرف النوم (family-via-beds 170/170 حلًا) وتضيق الغرف (bed-small 249). لم يُترك في الشيفرة.
      // (د2) الخلف مشترك: الطعام والمطبخ والخادمة صفًا على الواجهة الخلفية تحت الصالة والحديقة، والرئيسية في طرفه
      // على نهاية ممر النوم — بقية الغرف في الجناح الجانبي
      { const mst = beds.find(b => b.master), rest = beds.filter(b => b !== mst);
        if (mst && rest.length) both('rearbar', 'r2', sw => Y(cols([VOID(gardenA * .35)], [H()], [X(corr(), Z([...wcA, ...rest], 'x0', 'y'))], sw), X(Z([...flex, ...Md, ...K, ...Dn], 'y0', 'x'), Z([mst], 'y0', 'x')))); }
      // (هـ) كتلتان: الضيافة والصالة بين فناءين أمامًا، وكتلة خلفية: الطعام فالمطبخ والخدمة على الواجهة الخلفية، وجناح النوم على ممره
      both('splitrear', 'p0', sw => Y(cols([VOID(gardenA * .3)], [H()], [VOID(gardenA * .3)], sw), X(Y(Z(Dn, 'y0', 'x'), Z([...K, ...Md, ...flex], 'y0', 'x')), corrBeds(bedsW))));
    }
    // (7) كتلتان: عامة أمامًا وخاصة خلفًا، بينهما ممر زجاجي في امتداد المحور وفناءان جانبيان؛ الطعام والمطبخ معًا
    both('split', 's0', sw => Y(cols([Z([...flex, ...wcA, ...Md], 'x1', 'y'), overZ('x1') || VOID(gardenA * .3)], [H(), C('link', { area: 8 })], [DK('x0'), VOID(gardenA * .3)], sw), galBeds(bedsRow)));
    // ---- (الجولة التاسعة) الصالة في الخلف على الحديقة للبرامج الكبيرة (أربع غرف فأكثر): T وH وL — تنظيمات تضع الصالة العائلية
    // في عمق البيت على الحديقة الخلفية، وغرف الأبناء متجاورة في جناح، وغرفة كبار السن ملاصقة للصالة
    {
      const eldT = S.find(b => b.elderly && !b.master) || null, mstT = S.find(b => b.master) || null;
      const kidsT = beds.filter(b => b !== eldT && b !== mstT);
      // (تُولَّد حين يطلب العميل الصالة على الواجهة الخلفية/الحديقة: لا تزاحم ميزانية البناء في الطلبات الأخرى)
      const hallBackRule = (P.rules || []).some(r => r.kind === 'place' && r.side === 'back' && r.a === 'hall');
      if (hallBackRule && K.length && Dn.length && beds.length >= 4 && mstT) {
        const P9 = (m, t, tree) => push(m, t, tree, { iters: DEEP_ITERS, tol: 4, hardMajlis: true });
        // (H) جناحان متوازيان بطول البيت يصلهما جسر الصالة: فناء أمامي للمدخل، والصالة في الوسط تطل على حوش خلفي بين الجناحين؛
        //     الجناح الأول المجلس فغرف الأبناء على ممر، والثاني الطعام فالمطبخ فكبار السن فالرئيسية
        // (فناء المدخل أمام جسر الصالة: المدخل خلف فناء أمامي بين الجناحين — H حقيقية لا U)
        push('hplan', 'hh0', X(Y(Mz('y1'), corrBeds([...kidsT, mstT], 'x1')), Y(VOID(gardenA * .5), F(), H(), VOID(gardenA)), Y(Z([...flex, ...wcA, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y'), eldT ? Z([eldT], 'x0', 'y') : null, OV(8))), { iters: DEEP_ITERS, tol: 4, hardMajlis: true, foyerYard: true });
        // (الجولة السادسة عشرة) H بجناح ضيافة وخدمة: المجلس على رأس الجناح الثاني فالطعام (مقلطًا يُفتح عليه) فالمطبخ فكبار السن —
        //     ضيف الرجال يصل إلى الطعام دون أن يعبر المدخل العائلي أو الصالة، والمطبخ يخدم الطعام مباشرة؛ وجناح النوم كله في الجناح الأول
        push('hplan', 'hh2', X(Y({ ...VOID(30), min: 3.5 }, corrBeds([...kidsT, mstT], 'x1')), Y(VOID(gardenA * .5), F(), H(), VOID(gardenA * .7)), Y(Mz('y1'), Z([...flex, ...wcA, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y'), eldT ? Z([eldT], 'x0', 'y') : null)), { iters: DEEP_ITERS, tol: 4, hardMajlis: true, foyerYard: true });
        // (L) جناح نوم بطول البيت (الأبناء فالرئيسية على ممر)، وشريط أمامي (المجلس | المدخل | الطعام)، والصالة في ركن الـL
        //     على الحديقة الخلفية وكبار السن بجوارها، والمطبخ خلف الطعام
        P9('hplan', 'hh1', X(Y(Mz('y1'), corrBeds([...kidsT, mstT], 'x1')), Y(F(), H(), VOID(gardenA)), Y(OV(10), Z([...flex, ...wcA, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y'), eldT ? Z([eldT], 'x0', 'y') : null)));
        // (L2) وكبار السن بين جناح النوم والصالة، والطعام فالمطبخ على الجانب المقابل؛ الصالة في عمق البيت على الواجهة الخلفية
        if (eldT) P9('lhall', 'l9c', X(Y(OV(10), corrBeds([...kidsT, mstT], 'x1')), Y(X(OV(8), F(), Wm ? Wz('x0', 'x') : null, Mz('y1')), X(Z([eldT], 'x1', 'y'), H(), Y(Z([...flex, ...wcA, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y'))))));
        P9('lhall', 'l9', X(Y(OV(10), corrBeds([...kidsT, mstT], 'x1')), Y(X(F(), Wm ? Wz('x0', 'x') : null, Mz('y1')), X(H(), Y(Z([...flex, ...wcA, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y'), eldT ? Z([eldT], 'x0', 'y') : null)), VOID(gardenA))));
      }
    }
    // ---- الجولة السادسة: تنظيمات مختلفة فعلًا للبرامج الكبيرة في دور واحد (حركة قصيرة، لا ممر طويل بجانب صف غرف)
    {
      const mst = S.find(b => b.master) || null, kids = beds.filter(b => b !== mst);
      const rearK = rearSvc && K.length && Dn.length;
      // هذه التنظيمات أكثر تقييدًا (حوش مغلق، غرف على الصالة مباشرة): بحث أعمق بالعدد
      const P6 = (m, t, tree) => push(m, t, tree, { iters: DEEP_ITERS, tol: 4 });
      // (الجولة التاسعة عشرة) تنظيمات جديدة تدخل البحث الثاني وحده (حين يقل المعروض عن المطلوب): تضيف ولا تزاحم ميزانية البحث الأول
      // (أدخلتها التجربة الأولى البحث الأول فأسقطت بدائل سليمة في C8 وC9 بميزانية البناء)
      const P6L = (m, t, tree) => push(m, t, tree, { iters: DEEP_ITERS, tol: 4, late: true });
      // منطقة غرف نوم بعمق يتسع للحمام أمام الغرفة (تنظيم «عميق»): امتداد كل غرفة على الممر/الصالة أقصر فلا تطول الحركة
      const Zd = (b, door, along) => { const z = Z(b, door, along); z.minCross = Math.max(...z.b.map(x => (x.kind === 'suite' && x.bath ? (x.master ? 5.9 : 5.3) : 0))); return z; };
      // عمود الخدمة: الطعام أمامًا يلامس الصالة، والمطبخ والخادمة خلفه (على الواجهة الخلفية حين يُطلب المطبخ في الخلف)
      const svcCol = d => (rearK ? Y(Z([...flex, ...wcA, ...Dn], d, 'y'), Z([...K, ...Md], d, 'y')) : SVZ(d));
      // كتلة نوم «نواة»: ممر أوسط قصير تُفتح عليه الغرف من جهتيه، والرئيسية في نهايته بعرض الكتلة
      const pod = (list, m) => { const h = Math.ceil(list.length / 2); return Y(list.length ? X(Zd(list.slice(0, h), 'x1', 'y'), corr('spine2'), list.length > 1 ? Zd(list.slice(h), 'x0', 'y') : null) : null, m ? Z([m], 'y0', 'x') : null); };
      // (أ) بيت الحوش: حوش في القلب، يحيط به رواقان قصيران؛ الصالة أمامه، والرئيسية خلفه، وغرف الأبناء على جانبه،
      //     والطعام والمطبخ على الجانب المقابل
      if (mst && kids.length) P6('courtring', 'cr0', X(Y(Mz('y1'), svcCol('x1')), Y(F(), H(), X(COURT(Math.max(courtA, 26)), corr('ringE')), Z([mst], 'y0', 'x')), Y(Wm ? Wz('x0') : VOID(gardenA * .4), Zd(kids, 'x0', 'y'), OV())));
      // (أ2) الحوش بين المدخل والصالة الخلفية: رواقان على جانبي الحوش — رواق العائلة إلى الصالة بجوار الخدمة، ورواق
      //      النوم بجوار غرف الأبناء — والصالة في الخلف على الحديقة، وكبار السن آخر صف الغرف ملاصقين للصالة، والرئيسية
      //      خلف الخدمة على الصالة
      if (mst && kids.length >= 2 && !rearK) { const kr = [...kids].reverse();
        P6('courtring', 'cr2', X(Y(Mz('y1'), SVZ('x1'), Z([mst], 'x1', 'y')), Y(F(), X(corr('ringW'), COURT(Math.max(courtA, 26)), corr('ringE')), H()), Y(Wm ? Wz('x0') : VOID(gardenA * .4), Zd(kr, 'x0', 'y'))));
        // (الجولة التاسعة) والمدخل بين حديقتين أماميتين صغيرتين (لا بهو بعرض الحوش ورواقيه): للبرامج الكبيرة ذات الصالة الخلفية
        if (kids.length >= 3 && (P.rules || []).some(r => r.kind === 'place' && r.side === 'back' && r.a === 'hall')) push('courtring', 'cr3', X(Y(Mz('y1'), SVZ('x1'), Z([mst], 'x1', 'y')), Y(X(OV(5), F(), OV(5)), X(corr('ringW'), COURT(Math.max(courtA, 26)), corr('ringE')), H()), Y(Wm ? Wz('x0') : VOID(gardenA * .4), Zd(kr, 'x0', 'y'))), { iters: DEEP_ITERS, tol: 4, hardMajlis: true }); }
      // (ب) نواة النوم خلف الصالة: المدخل ومجلس النساء أمامًا، فالصالة بعرض الكتلة، فكتلة النوم بممر أوسط قصير
      //     والرئيسية في آخره؛ والمجلس والخدمة عمود جانبي
      if (mst && kids.length >= 2) P6('podcore', 'pd0', X(Y(Mz('y1'), svcCol('x1')), Y(X(F(), Wm ? Wz('x0', 'x') : VOID(gardenA * .3)), X(H(), OV(8)), pod(kids, mst))));
      // (ب2) الصالة المركزية الموزِّعة: غرف النوم على جانبيها تُفتح عليها مباشرة (بلا ممرات)، والضيافة صف أمامي،
      //      والطعام والمطبخ والخدمة صفًا خلفيًا على الحديقة الخلفية تطل عليها الصالة
      if (beds.length >= 2) { const h = Math.ceil(beds.length / 2), bA = beds.slice(0, h), bB = beds.slice(h);
        const back = rearK || !K.length || !Dn.length ? X(Z([...flex, ...wcA, ...Md, ...K], 'y0', 'x'), Z(Dn, 'y0', 'x'), VOID(gardenA * .4)) : X(Z([...flex, ...wcA, ...Md, ...K], 'y0', 'x'), Z(Dn, 'y0', 'x'), VOID(gardenA * .4));
        P6('centralhall', 'ch0', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(Zd(bA, 'x1', 'y'), H(), Zd(bB, 'x0', 'y')), back));
        // وبفناء أمامي بين مجلس الرجال والمدخل يضيء الصالة من الأمام (الصالة خلف الفناء والمدخل معًا)
        // والرئيسية في الصف الخلفي بجوار الطعام تُفتح على الصالة من خلفها، وغرف الأبناء على جانبي الصالة
        if (mst && kids.length >= 2) { const kh = Math.ceil(kids.length / 2), kA = kids.slice(0, kh), kB = kids.slice(kh);
          P6('centralhall', 'ch2', Y(X(Mz('y1'), VOID(10), F(), Wz('x0', 'x')), X(Zd(kA, 'x1', 'y'), H(), Y(Zd(kB, 'x0', 'y'), OV())), X(Z([...flex, ...wcA, ...Md, ...K], 'y0', 'x'), Z(Dn, 'y0', 'x'), Z([mst], 'y0', 'x')))); }
        P6('centralhall', 'ch1', Y(X(Mz('y1'), VOID(10), F(), Wz('x0', 'x')), X(Zd(bA, 'x1', 'y'), H(), Zd(bB, 'x0', 'y')), X(Z([...flex, ...wcA, ...Md, ...K], 'y0', 'x'), Z(Dn, 'y0', 'x'), OV(8))));
        // (الجولة التاسعة عشرة) جناح الضيافة والخدمة عمود كامل العمق خلف مجلس الرجال: المجلس على الواجهة، فالطعام (مقلط بباب من المجلس)،
        //     فالمطبخ والخادمة على الواجهة الخلفية؛ والصالة الموزِّعة في الوسط تُفتح عليها غرف الأبناء من الجانب المقابل، والرئيسية خلف الصالة.
        //     الضيف يصل الطعام من المجلس مباشرة بالبناء (لا عبر العائلة)، والتقديم من المطبخ خلف الطعام لا يعبر الصالة (C1، C10)
        if (mst && kids.length && K.length && Dn.length && M && !R14_OFF.has('r19ch3')) {
          P6L('centralhall', 'ch3', Y(X(Mz('y1'), F(), Wm ? Wz('x0', 'x') : OV(8)), X(Y(Z([...flex, ...wcA, ...Dn], 'x1', 'y'), Z([...K, ...Md], 'x1', 'y')), Y(H(), Z([mst], 'y0', 'x')), Zd(kids, 'x0', 'y'))));
          P6L('centralhall', 'ch4', X(Y(Mz('y1'), Z([...flex, ...wcA, ...Dn], 'x1', 'y'), Z([...K, ...Md], 'x1', 'y')), Y(F(), H(), Z([mst], 'y0', 'x')), Y(Wm ? Wz('x0') : OV(8), Zd(kids, 'x0', 'y')))); } }

      // ---- (الجولة الخامسة عشرة) ثلاثة تنظيمات جديدة (المراجع المستقل r14: المولّد يعمل من 6–7 أنماط تتكرر عبر الحالات)
      const flexF = [...Wx, ...pub];
      // شريط الضيافة الأمامي للتنظيمات الثلاثة: المجلس | المدخل | مجلس النساء؛ وبمجلس واحد: المجلس | الطعام (مقلطًا يُفتح على المجلس) | المدخل
      const guestBar = () => (Wm ? X(Mz('y1'), F(), Wz('x0', 'x')) : X(Mz('y1'), Z([...flexF, ...Dn], 'y1', 'x'), F()));
      // (و) L حول حديقة عائلية: شريط الضيافة بعرض البيت أمامًا (المجلس | المدخل | مجلس النساء)، وخلفه ساقا الـL: جناح النوم على ممره
      //     بطول البيت على جانب، وعمود العائلة (الطعام خلف المدخل فالمطبخ والخادمة فالصالة في آخره) — والحديقة تملأ الركن الخلفي المقابل
      //     كله فتطل عليها الصالة من جانبها وخلفها، والمطبخ من جانبه (L حقيقية: لا جناح ثالث يغلقها)
      if (K.length && Dn.length)
        P6('gardenl', 'gl0', Y(X(Y(Mz('y1'), Z([...flexF, ...wcA, ...Dn], 'x1', 'y'), Z([...K, ...Md], 'x1', 'y')), Y(F(), H()), Y(Wm ? Wz('x0') : OV(8), { ...VOID(Math.max(courtA, 24)), min: 4.5 })), galBeds(bedsRow)));
      // (ز) حوشان بلا فرق مناسيب: في المحور حوش الضيوف خلف المدخل (تطل عليه نوافذ المجلس والمقلط، ورواق قصير بجانبه إلى الصالة) ثم
      //     الصالة ثم حوش العائلة (يطل عليه ممر النوم) فالرئيسية خلفه؛ وعمود الضيافة والخدمة على جانب، وغرف الأبناء على الجانب المقابل
      if (mst && kids.length && K.length && Dn.length)
        P6('twincourt', 'tc0', X(Y(Mz('y1'), { ...Z([...flexF, ...wcA, ...Dn], 'x1', 'y'), minCross: 4.6 }, Z([...K, ...Md], 'x1', 'y')), Y(F(), X(COURT(Math.max(23, courtA * .8)), corr('ringW')), H(), X(COURT(Math.max(23, courtA * .8)), corr('ringE')), Z([mst], 'y0', 'x')), Y(Wm ? Wz('x0') : OV(6), FB(corrBeds(kids, 'x0')))));
      // (الجولة السابعة عشرة) جناح ضيافة أمامي بأربعة فراغات (المراجع المستقل r16: مجلس الرجال المعزول في 8 من 21 بديلًا): المجلس والمقلط
      //     متجاوران على الواجهة بباب بينهما، والمطبخ خلف المقلط يخدمه مباشرة، والخادمة والمرافق خلف المجلس بجوار المطبخ — الضيف لا يعبر
      //     العائلة والتقديم لا يعبر الصالة؛ والمدخل العائلي (ومجلس النساء) والصالة عمود بجانبه، وغرف النوم رواقًا خلفيًا
      if (M && K.length && Dn.length) {
        // أعمدة: (المجلس وخلفه المرافق) | (المقلط وخلفه المطبخ والخادمة) | (المدخل العائلي ومجلس النساء، وخلفهما الصالة) — المقلط يلامس
        // المدخل العائلي (طعام العائلة من جهتها بباب يُغلق) والمطبخ يلامس الصالة؛ وغرف النوم رواقًا خلفيًا بعرض البيت
        const gRest = [...wcA, ...flexF], c1 = () => Y(Mz('x1'), gRest.length ? Z(gRest, 'x1', 'y') : OV(6)), c2 = () => Y(Z(Dn, 'x1', 'y'), Z([...K, ...Md], 'x1', 'y'));
        P6('guestblock', 'gb0', Y(X(c1(), c2(), Y(Wm ? X(F(), Wz('x0', 'x')) : F(), over.length ? X(H(), overZ('x0')) : H())), galBeds(bedsRow)));
        // (الجولة التاسعة عشرة) المطبخ خلف المجلس على الواجهة الجانبية والمقلط بجوارهما: (المجلس وخلفه المطبخ والخادمة) | (المقلط وخلفه
        //     المرافق) | المدخل العائلي والصالة — المطبخ على جدار خارجي (نافذة وباب خدمة إلى الارتداد الجانبي)؛ في gb0 قد يُحبس المطبخ بين
        //     المجلس والصالة وصف النوم فيُرفض «بلا نافذة» (C1). الضيف يدخل المقلط من المجلس مباشرة، والتقديم من المطبخ بجواره
        if (!R14_OFF.has('r19gb2')) P6L('guestblock', 'gb2', Y(X(Y(Mz('x1'), Z(K, 'x1', 'y')), [...gRest, ...Md].length ? Y(Z(Dn, 'x1', 'y'), Z([...gRest, ...Md], 'x1', 'y')) : Z(Dn, 'x1', 'y'), Y(Wm ? X(F(), Wz('x0', 'x')) : F(), over.length ? X(H(), overZ('x0')) : H())), galBeds(bedsRow)));
        // والنوم جناحًا بطول المبنى على ممره (بلا مجلس نساء)
        if (!Wm) P6('guestblock', 'gb1', X(c1(), c2(), Y(F(), H(), OV(8)), FB(corrBeds(beds))));
      }
      // (ح) بيت الحوش الجانبي (للعرض القابل للبناء 11.5–18.5 م): شريط الضيافة أمامًا، وفي الوسط عمود الطعام والمطبخ فالصالة فحوش جانبي
      //     مكشوف على الارتداد (يغلقه شريط الضيافة أمامه وصف النوم خلفه وسور الأرض جانبه) تطل عليه الصالة ورواق النوم، وصف النوم خلفًا
      if (W >= 11.5 && W <= 18.5 && mst && kids.length && K.length && Dn.length)
        P6('sidecourt', 'sc0', X(Y(Mz('y1'), Z([...flexF, ...wcA, ...Dn], 'x1', 'y'), Z([...K, ...Md], 'x1', 'y')), Y(F(), H(), Z([mst], 'y0', 'x')), Y(Wm ? Wz('x0') : OV(6), { ...VOID(Math.max(courtA, 22)), min: 4.5 }, corrBeds(kids, 'x0'))));
      // (ج) كتلتان (عامة أمامًا، وعائلية خلفًا) بينهما رواق زجاجي وحديقتان: الخلفية فيها الطعام والمطبخ ونواة النوم
      if (mst && kids.length >= 2) P6('splitpod', 'sp1', Y(X(Mz('y1'), Y(F(), H()), Y(Wm ? Wz('x0') : null, rearK ? null : Z([...flex, ...wcA, ...Dn], 'x0', 'y'))), X(VOID(gardenA * .3), C('link', { fix: 1.6, area: 8 }), VOID(gardenA * .3)), X(rearK ? Y(Z([...flex, ...wcA, ...Dn], 'x1', 'y'), Z([...K, ...Md], 'x1', 'y')) : Z([...K, ...Md], 'x1', 'y'), pod(kids, mst))));
      // (د) جناح النوم خلفي بعرض المبنى حول الصالة: الضيافة أمامًا، والخدمة والطعام صفًا وسطًا يعبره ممر قصير،
      //     والصالة في وسط الصف الخلفي تُفتح عليها الغرف من جانبيها (بلا ممر نوم) وتطل على الحديقة الخلفية
      if (!rearK && beds.length >= 2) { const h = Math.ceil(beds.length / 2); P6('rearhall', 'rb0', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(DK('x1'), C('link', { fix: 1.6, area: 8 }), Z([...flex, ...wcA, ...Md], 'x0', 'y')), X(Zd(beds.slice(0, h), 'x1', 'y'), H(), Zd(beds.slice(h), 'x0', 'y')))); }
      // (هـ) للمطبخ الخلفي: الصالة في وسط الصف الخلفي بين غرف النوم والطعام، والمطبخ والخادمة خلف الطعام على الواجهة الخلفية
      if (rearK && beds.length >= 2) P6('rearhall', 'rb1', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(Z(beds, 'x1', 'y'), H(), Y(Z([...flex, ...wcA, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y')))));
    }
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
    // (الجولة الثانية عشرة) المنور: بين الصالة وجناح النوم منور مكشوف يضيء الصالة وممر النوم، والممر يمر بجانبه (المبنى العميق في الأرض الضيقة)
    push('tcore', 'n7w', Y(X(Mz('y1'), F(), Wz('x0', 'x')), X(SVZ('x1'), H()), X(WELL(9), C('link', { fix: 1.6, area: 6 })), X(Z(rest, 'x1', 'y'), corr('spine2')), m ? Z([m], 'y0', 'x') : null), { iters: DEEP_ITERS, tol: 4 });
  }
  // (الجولة السادسة) للأرض الضيقة: حوش في منتصف العمق بين المطبخ وممر جانبي يصل الصالة بجناح النوم الخلفي —
  // المجلس والمدخل أمامًا، فالطعام والصالة، فالمطبخ والحوش، فغرف النوم على ممر قصير والرئيسية في آخره
  if (narrow && beds.length >= 2 && K.length && Dn.length) {
    const m = beds.find(b => b.master), rest = beds.filter(b => b !== m);
    push('midcourt', 'mc0', Y(X(Mz('y1'), F()), X(Z([...flex, ...wcA, ...Dn], 'x1', 'y'), H()), X(Z([...K, ...Md], 'x1', 'y'), COURT(Math.max(courtA, 23)), corr('link')), X(Z(rest, 'x1', 'y'), corr('spine2')), m ? Z([m], 'y0', 'x') : null), { iters: DEEP_ITERS, tol: 4 });
    // والصالة خلف الحوش (الحوش بين الضيافة والعائلة): المجلس والمدخل والطعام أمامًا، الحوش وممر جانبي، ثم الصالة والمطبخ، ثم النوم
    push('midcourt', 'mc1', Y(X(Mz('y1'), F()), X(Z([...flex, ...wcA, ...Dn], 'x1', 'y'), C('link', { fix: 1.6, area: 8 })), X(COURT(Math.max(courtA, 23)), C('link2', { fix: 1.6, area: 8 })), X(Z([...K, ...Md], 'x1', 'y'), H()), X(Z(rest, 'x1', 'y'), corr('spine2')), m ? Z([m], 'y0', 'x') : null), { iters: DEEP_ITERS, tol: 4 });
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
  if (globalThis.__v2only) return out.filter(t => globalThis.__v2only.has(t.tag.replace(/p?r?t?$/, '')) || globalThis.__v2only.has(t.tag));
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
  // مدخل الجناح (أو غرفة الملابس) بجانب الحمام: صافيه ≥ 1.2 م (محوره ≥ VEST_MIN)، والحمام لا يقصر عن 2.1 م
  const deep = along >= Math.max(1.25 + bl0 * .9, VEST_MIN + 2.1) ? { deep: true, bw: along, bdp: dep - td } : null;
  const m = v => Math.min(v.bw, v.bdp);
  if (b.nearHall || b.kind === 'maid') return side; // غرفة كبار السن قرب الصالة / الخادمة قرب المطبخ: لا حمام ولا مدخل بينها وبين جارها
  return deep && m(deep) > m(side) + .3 ? deep : side; // «مدخل الجناح» حركة إضافية: لا يُختار إلا إن كسبت الغرفة عرضًا واضحًا
}
/**
 * شريط ضيافة مجلس الرجال (ممر/مغاسل ودورة مياه): على جانبه (side، بعرض guestStripW) أو في خلفه (back، 1.5 م).
 * يُختار ما يبقي للمجلس عرضًا صافيًا أكبر — الدالة نفسها في التقييم والمقاسات والتفصيل.
 */
const MEN_LOBBY_D = 1.5;
function menStrip(r, P = null) {
  const T = DESIGN_TARGETS, w = W_(r), h = H_(r);
  // (الجولة الثانية عشرة) الشريط العرضي صار أماميًا (دهليز الرجال ودورة مياههم على الواجهة) بعمق MEN_LOBBY_D — كان خلفيًا والباب
  // الخارجي يفتح على المجلس مباشرة؛ الاسم 'back' باقٍ للتوافق (شريط عرضي بعمق ثابت)، والقياس نفسه في التقييم والتفصيل
  const sideOK = w - T.guestStripW >= 3.4 && h >= T.guestWcL + 1.6, backOK = h - MEN_LOBBY_D >= 3.6 && w >= T.guestWcL + 1.5;
  const sideNet = Math.min(w - T.guestStripW, h), backNet = Math.min(w, h - MEN_LOBBY_D);
  // (الجولة التاسعة عشرة) «مجلس الرجال على الشارع» بطلب العميل: الشريط جانبي متى اتسع، فيبقى المجلس نفسه على جدار الواجهة (الشريط
  // الأمامي يبعده 1.6 م عنها فيخالف البند — C3: سبب رفض تنظيمات تصل المجلس بالطعام)
  if (sideOK && (P?.majlisStreet || !backOK || sideNet >= backNet - .3)) return { side: 'side', net: sideNet, w: w - T.guestStripW, h };
  if (backOK) return { side: 'back', net: backNet, w, h: h - MEN_LOBBY_D };
  return { side: null, net: Math.min(w, h), w, h };
}
// ------------------------------------------------------------------------------------------ التقييم
const HABIT_EXP = { suite: 2.6, majlis: 2.2, kitchen: 1.4, maid: 1.2, office: 1.4, family: 2.0, driver: 1.0, prayer: 1.0, dining: 1.6 };
// حدود صلبة لجودة فراغات الأسرة (افتراضات تصميمية): محور المطبخ الأصغر (صافيه ≈ 3.0 م بعد الجدران)، ونسبة الطعام
const KIT_MIN_AXIS = 3.25, DIN_MAX_ASP = 1.8;
// حدود مهنية (افتراضات تصميمية معلنة، لا اشتراطات نظامية): صافي غرفة النوم ≥ 12 م² والرئيسية ≥ 16 م²، والمطبخ ≥ 10 م²؛
// والممر المحمَّل من جهة واحدة ≤ 10 م ما أمكن (جزاء متدرج فوقه)، ولا ممر غرف أطول من 12.5 م (رفض)
const BED_MIN = 12, BED_MIN_MASTER = 16, KIT_MIN_AREA = 10, WALL_NET = .19;
// (الجولة الثالثة عشرة) سقف المطبخ الافتراضي: صافيه ≤ 22 م² (+1 سماحية؛ قيمة تصميمية افتراضية للميزان؛ C7 بلغ 31 م² لامتصاص فائض الأرضي) ما لم يحدد العميل مقاسه
const KIT_MAX_NET = 22, KIT_CAP_TOL = 2;
// (الجولة السابعة) المجلس الرئيسي ≥ 24 م² صافيًا ما أمكن، والطعام ≥ 3.3 م وغرفة الخادمة ≥ 2.7 م صافيًا (حدود)
const MAJLIS_NET = 24, DIN_MIN_NET = 3.3, MAID_MIN_NET = 2.7;
// (الجولة الثامنة) حدود فراغات معلنة (قيم تصميمية لا اشتراطات نظامية): المجلس الرئيسي ≥ 24 م² صافيًا حدٌّ صلب في الاختيار
// (كان جزاءً فخرج 21.6 م² بعد إعادة توزيع في تعديل C8)، ومجلس النساء ≥ 20 م² ما أمكن (جزاء)، والطعام ≥ 12 م² (صلب)،
// والرئيسية في الدور العلوي ≤ 26 م² (صلب) ما لم يطلب العميل مقاسها أو «ماستر كبيرة»
const WOMEN_NET = 20, DIN_MIN_AREA = 12, MASTER_UP_MAX = 26;
// (الجولة التاسعة) الرئيسية في دور واحد (الأرضي) ≤ 24 م² صافيًا ما لم تُطلب كبيرة؛ وغرف النوم لا تفتح على الصالة العائلية
// مباشرة إلا في تنظيم «الصالة الموزِّعة» وبباب في طرف الجدار المشترك (إزاحة للخصوصية ≤ 1.4 م من طرفه) — قيم تصميمية معلنة
const MASTER_GROUND_MAX = 24, HALL_DOOR_OFFSET = 1.4;
/** هل طلب العميل مقاس المجلس الرئيسي أو تصغيره؟ (حينها لا يُفرض حد 24 م²) */
const majlisAsked = P => !!(P.men?.fixedArea || (!P.men && P.blocks.find(b => b.kind === 'majlis')?.fixedArea) || (P.tweaks?.majlisScale && P.tweaks.majlisScale < 1) || P.dims?.majlis);
/** هل طلب العميل غرفة رئيسية كبيرة أو بمقاس؟ (حينها لا سقف 26 م² للعلوية) */
const masterAsked = P => !!(P.blocks.find(b => b.master)?.fixedArea || P.dims?.master || P.prefs?.big_master || (P.tweaks?.bedroomScale && P.tweaks.bedroomScale > 1));
const CORR_SINGLE_MAX = 10, CORR_SINGLE_HARD = 12.5, CORR_DOUBLE_MAX = 14;
// (الجولة العاشرة) قيم تصميمية افتراضية للميزان (لا اشتراطات نظامية؛ ما يطلبه العميل يغلبها): عرض المجلس الصافي ≥ 4.2 م
// (جلستان متقابلتان)، والمجلس لا يتضخم فوق 1.6 من حده (24 م² للرئيسي، 20 للنساء)، والطعام ≤ 23 م²، وحمام الرئيسية ≤ 7 م²،
// والرئيسية العلوية ≥ 18 م² صافية؛ وممر الغرف المحمَّل من جهة واحدة فوق 10.5 م جزاء أشد (إلا في الأرض الضيقة < 13 م عرضًا)
// (الجولة السابعة عشرة) غرفة الملابس: «غرفة» متى بلغ صافيها 4 م²؛ وحين يطلبها العميل ≥ 4.5 م² (قيم تصميمية افتراضية للميزان)
const DRESS_ROOM_NET = 4.0, DRESS_ASKED_NET = 4.5;
// (الجولة الثامنة عشرة) وزن هدف «الصالة ≥ المجلس» في البحث (قيمة تصميمية افتراضية للميزان)
/** (الجولة الثامنة عشرة) جزاء م² الحمام العلوي فوق المجلس/الطعام/المدخل في البحث المشترك للدورين. */
const WET_DRY_W = Number(globalThis.process?.env?.WET_DRY_W ?? 0); // جُرّب 8 و15 و25: لم يُبعد الحمامات عن المجلس والطعام في «السلم في المقدمة» (التراكب من بنية النمط: عمود الأجنحة فوق عمود الضيافة) وأسقط قراءة المجالس بمجلسين عند 15 و25 — معطّل، والتراكب يُذكر في ملاحظات البديل
/** شريط الحمام العلوي بعيدًا عن الفراغ الجاف تحته: جُرّب فأسقط قراءة «المجالس» بمجلسين في C7 وأحدث غرفة بلا حمام — معطّل. */
const R18_WETSTRIP = globalThis.process?.env?.R18_WETSTRIP === '1';
const HALL_EQ_W = Number(globalThis.process?.env?.HALL_EQ_W ?? 0);
const MAJLIS_MIN_W = 4.2, MAJLIS_CAP = 1.6, DIN_MAX_AREA = 23, MASTER_BATH_MAX = 7, MASTER_UP_MIN = 18, CORR_SINGLE_SOFT_HARD = 10.5, NARROW_W = 13;
/**
 * تحميل الممر: طوله، وهل تفتح الغرف عليه من جهة واحدة فقط. «من الجهتين» = على كل جانب طويل غرف (أو فراغات) تلامسه
 * بنصف طوله على الأقل. يُستعمل في التقييم وفي بوابة الجودة على المخطط المرسوم.
 */
function corridorLoad(r, placed) {
  const horiz = W_(r) >= H_(r), len = horiz ? W_(r) : H_(r), sides = horiz ? ['y0', 'y1'] : ['x0', 'x1'];
  const cov = sides.map(sd => sum(placed.map(p => { const e = shared(r, p.r); return e && e.side === sd ? e.to - e.from : 0; })));
  return { len, single: Math.min(...cov) < len * .5, cov };
}
const MAX_ASP = { store: 4.5, wc: 2.6, majlis: 1.8, suite: 1.75, dining: 1.8, kitchen: 2.0, family: 2.0, maid: 2.0, office: 2.0, prayer: 2.2, driver: 2.2 };
/** جزاء ترتيب محلول (أقل = أفضل)، أو null لرفضه. W, D: الغلاف. */
export function scoreV2(sol, P, W, D, ctx = {}) {
  const T = DESIGN_TARGETS, { placed, circ, courts } = sol;
  // الفراغ المزدوج الارتفاع (علوي) يحجب الضوء كفراغ مبني: لا تُحسب حافة غرفة عليه واجهةً خارجية
  const solids = [...placed.map(p => p.r), ...circ.map(c => c.r), ...(sol.dh || [])];
  const cid = id => circ.find(c => c.id === id);
  let pen = 0;
  const no = w => { const d = globalThis.__v2dbg; if (d) d[w] = (d[w] || 0) + 1; return null; };
  // مخالفة قابلة للتحسين: جزاء كبير متدرج بقدر المخالفة، فيتجه البحث نحو الحل المقبول؛ ولا يُقبل حل فيه مخالفة
  let viol = 0; const bad = (w, amt) => { const d = globalThis.__v2dbg; if (d) d[w] = (d[w] || 0) + 1; viol++; pen += 600 + 400 * Math.max(0, amt); };
  if (sol.bigPantry) bad('pantry-big', sol.bigPantry); // المخزن المقتطع من مطبخ بمقاس صريح لا يتجاوز 2.6 م عرضًا
  const hall = cid('hall'), foyer = cid('foyer');
  const root = foyer || cid('stair'); if (!hall || !root) return no('6');
  // الصالة غرفة حقيقية
  { const r = hall.r, s = Math.min(W_(r), H_(r)), l = Math.max(W_(r), H_(r));
    // الصالة غرفة جلوس لا شريط: نسبتها الصافية ≤ 2.0 (محوريًا ≤ 1.92 ليبقى هامش الجدران) في الأرضي؛ والعلوي محوره عرض السلم (≤ 2.3)
    // (الحد الصلب 2.0 للصالة الكبيرة المطلوبة «صالة كبيرة/واسعة»؛ والصالة المعتادة حدها الصلب 2.3 مع جزاء متدرج فوق 2.0)
    const aspMax = ctx.upper ? 2.3 : P.hallArea > 32 ? 1.95 : HALL_ALT_ASPECT - .05; // الجولة السادسة: حد الأرضي نفسه في التقييم والاختيار (لا صالة 2.27 تُبنى ثم تُستبعد) // لا «صالة-ممر»: نسبة الأرضي ≤ 2.15 محوريًا (كانت 2.3)
    if (s < 4.2 - 1e-6) bad('hall-narrow', 4.2 - s); if (l / s > aspMax) bad('hall-aspect', l / s - aspMax);
    pen += 90 * Math.max(0, l / s - 1.6) + 70 * Math.max(0, 5.0 - s);
    const ha = A_(r), ht = P.hallArea; pen += 140 * Math.log(ha / ht) ** 2 * (P.hallFixed ? 4 : 1) + 160 * Math.max(0, l / s - 1.9); const big = ctx.upper || ctx.minDepth ? 1.9 : P.hallArea > 32 ? 1.3 : 1.5; if (ha > ht * big) bad('hall-big', (ha - ht * big) / 8); // مساحة الصالة بقدر البرنامج: لا تمتص فائض الغلاف if (ha < ht * .6) bad('hall-small', (ht * .6 - ha) / 8);
    { const e = expLen(r, solids); if (e < 2.4) bad('hall-dark', (2.4 - e) / 2); } }
  // (الجولة السابعة عشرة) الصالة العائلية لا تصغر عن 0.8 من مجلس الرجال (HALL_SMALL، privacy-defects.mjs؛ المراجع المستقل r16: C9-2
  // صالة 19.5 م² مقابل مجلس 34.6 م²) — جزاء متدرج في البحث لا رفض (قيمة تصميمية افتراضية للميزان؛ هامش 1.5 م² لجدران المرسوم)
  if (!ctx.upper && !P.hallFixed && !R14_OFF.has('r17hall')) { const mj = placed.find(p => p.block.kind === 'majlis' && p.block.men); if (mj) { const need = .8 * (A_(mj.r) - (mj.block.guestWc ? 7 : 0)) + 1.5, ha = A_(hall.r); if (ha < need) pen += 90 * (need - ha);
    // (الجولة الثامنة عشرة) هدف «الصالة ≥ المجلس» جُرّب جزاءً في البحث العام (HALL_EQ_W) فغيّر مسار البحث في كل الأنماط وأسقط بدائل في C5
    // وC9 — صار تحسينًا موضعيًا للبدائل المبنية (refineHall)؛ الوزن هنا 0 افتراضيًا
    if (HALL_EQ_W > 0 && !R14_OFF.has('r18hall')) { const need1 = (Math.max(A_(mj.r), mj.block.area || 0) - (mj.block.guestWc ? 7 : 0)) + 1.5; /* بهدف المجلس لا بمقاسه المحلول: تصغير المجلس لا يُكافأ */ if (ha < need1) pen += HALL_EQ_W * (need1 - Math.max(ha, need)); } } }
  // (جُرّب جزاءً في البحث نفسه فغيّر حلول كل الأنماط وأسقط بدائل جاهزة في C5 — سُحب؛ صار ترتيبًا للبناء داخل كل نمط: guestLinked)
  // (الجولة الحادية عشرة) بحر البلاطة الصافي (الضلع الأقصر للفراغ المستطيل) ≤ 6 م: أكبر منه ملاحظة جسيمة في المراجعة الإنشائية
  // المبدئية (PRECHECK_LIMITS.slabSerious؛ قيمة تصميمية افتراضية للميزان، لا تصميم إنشائي) — مخالفة في البحث لا تُبنى ثم تُرفض
  for (const q of [...placed.map(p => p.r), ...circ.map(c => c.r)]) { const sp = Math.min(W_(q), H_(q)) - WALL_NET; if (sp > SLAB_SPAN_MAX) bad('slab-span', sp - SLAB_SPAN_MAX); }
  // المدخل على الواجهة ويتصل بالصالة (مباشرة أو عبر السلم)
  // المدخل على الواجهة الأمامية — أو خلف فناء مدخل مكشوف يطل على الشارع (جناح ضيافة يتقدم الكتلة العائلية: ctx.foyerYard)
  if (foyer) { const r = foyer.r; if (r.y0 > TOL && !(ctx.foyerYard && streetLen(r, solids) >= 1.4)) return no('foyer-front'); if (Math.min(W_(r), H_(r)) < 2.4 - 1e-6) bad('foyer-small', 2.4 - Math.min(W_(r), H_(r)));
    // المدخل يفتح على الصالة مباشرة، أو عبر عنصر حركة واحد (السلم، أو الرواق في الأرض الضيقة)
    const viaLen = Math.max(0, ...circ.filter(c => c !== hall && c !== foyer).map(c => Math.min(touch(r, c.r), touch(c.r, hall.r))));
    const fh = Math.max(touch(r, hall.r), viaLen); if (fh < 1.4) bad('foyer-hall', 1.4 - fh); else if (touch(r, hall.r) < 1.4) pen += 25;
    // بهو المدخل المزدوج الارتفاع (dh): بهو حقيقي ≈ 15 م² (حتى 26 م²) وعرضه ≥ 3.4 م
    const fT = foyer.dh || foyer.big ? T.foyer * 1.5 : foyer.wc ? FOYER_WC_AREA : T.foyer * .85, fMax = foyer.dh || foyer.big ? T.foyer * 2.6 : T.foyer * 1.6;
    if ((foyer.dh || foyer.big) && Math.min(W_(r), H_(r)) < 3.4) bad('foyer-dh-narrow', 3.4 - Math.min(W_(r), H_(r)));
    const fa = A_(r); if (fa > fMax) bad('foyer-big', (fa - fMax) / 6); pen += 120 * Math.log(fa / fT) ** 2 + 4 * Math.max(0, W_(r) / H_(r) - 2) + 4 * Math.max(0, H_(r) / W_(r) - 2.2); }
  // شبكة الحركة متصلة من المدخل
  { const seen = new Set([root.id]), q = [root.id];
    while (q.length) { const a = cid(q.pop()); for (const c of circ) if (!seen.has(c.id) && touch(a.r, c.r) >= 1.2) { seen.add(c.id); q.push(c.id); pen += touchPen(touch(a.r, c.r)); } }
    // متدرج: كم ينقص كل عنصر حركة منفصل ليلامس الشبكة بعرض باب (1.2 م) — فيتجه البحث إلى وصله
    if (seen.size < circ.length) {
      const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));
      const lack = sum(circ.filter(c => !seen.has(c.id)).map(c => Math.min(...circ.filter(o => seen.has(o.id)).map(o => { const t = touch(c.r, o.r); return t > 0 ? 1.2 - t : 1.2 + gap(c.r, o.r); }))));
      bad('circ-graph', lack);
    } }
  { const st = cid('stair'); if (st) { const a = A_(st.r), mn = Math.min(W_(st.r), H_(st.r)); if (mn < 2.6) bad('stair-narrow', 2.6 - mn); pen += 6 * Math.max(0, a - 14); const amax = mn >= 4.2 ? 20.5 : 18.2; if (a > amax) bad('stair-big', (a - amax) / 4); } } // (الجولة الحادية عشرة) غرفة سلم يُعبر خلالها من البهو إلى الصالة (ضلعاها ≥ 4.2 م) حتى 20.5 م²
  for (const c of circ) if (!['foyer', 'hall', 'stair'].includes(c.id)) {
    const s = Math.min(W_(c.r), H_(c.r)); if (s < 1.2 - 1e-6) bad('corr-narrow', 1.2 - s);
    // ممر بلا غرفة تفتح عليه = هدر
    if (!placed.some(p => touch(p.r, c.r) >= 1.1)) pen += 40;
    // طول الممر: الممر المحمَّل من جهة واحدة (غرف على جانب واحد) لا يتجاوز 10 م ما أمكن، والمحمَّل من الجهتين أفضل
    const cl = corridorLoad(c.r, placed);
    if (cl.single && cl.len > CORR_SINGLE_MAX) pen += 160 * (cl.len - CORR_SINGLE_MAX);
    // (الجولة العاشرة) فوق 10.5 م من جهة واحدة جزاء أشد (لا رفض: الرفض أفقد بدائل سليمة في C1 وC8 وC10)
    if (cl.single && !ctx.narrow && cl.len > CORR_SINGLE_SOFT_HARD) pen += 300 * (cl.len - CORR_SINGLE_SOFT_HARD);
    if (!cl.single && cl.len > CORR_DOUBLE_MAX) pen += 80 * (cl.len - CORR_DOUBLE_MAX);
    // ممر غرف نوم أطول من 12.5 م (من جهة أو جهتين) لا يُقبل: الحركة الطويلة إلى الغرف ليست مخططًا مهنيًا
    if (cl.len > CORR_SINGLE_HARD && placed.some(q => q.block.kind === 'suite' && touch(q.r, c.r) >= 1.1)) bad('corr-long', (cl.len - CORR_SINGLE_HARD) / 2);
    pen += 6 * cl.len; // الحركة أقصر = أفضل
  }
  // الأحواش: مغلقة بالمبنى من كل الجهات، وتطل عليها الصالة
  // (الجولة الثانية عشرة) مبنى أعمق من 18.5 م بلا حوش ولا منور: جزاء متدرج (قيمة تصميمية افتراضية للميزان؛ الملاحظة في المراجعة)
  // (الحوش الخلفي بين جناحين أو الحديقة في ركن L فراغ ضوء أيضًا متى كان ≥ 2.4 م ومساحته ≥ 6 م² — لا الهوامش)
  if (!ctx.upper && D > 18.5 && !courts.length && !(sol.voids || []).some(v => !v.margin && Math.min(W_(v), H_(v)) >= 2.4 && A_(v) >= 6 && (v.y0 > .05 || H_(v) >= 4))) pen += (D > 22 ? 150 : 70) * (D - 18.5);
  for (const ct of courts) if (ct.well) { const cs = Math.min(W_(ct), H_(ct)), cl = Math.max(W_(ct), H_(ct)); if (cs < 2.2) bad('well-small', 2.2 - cs); if (cl / Math.max(.1, cs) > 3.5) bad('well-slot', cl / cs - 3.5); if (A_(ct) > 16) pen += 10 * (A_(ct) - 16); }
  for (const ct of courts.filter(c => !c.well)) { const cs = Math.min(W_(ct), H_(ct)), cl = Math.max(W_(ct), H_(ct)); if (cs < COURT_MIN) bad('court-small', COURT_MIN - cs);
    // حوش لا شق (الجولة السابعة): النسبة الصافية ≤ 2 حدٌّ صلب (كان جزاءً فخرج حوش 3.35 × 9.3 بين رواقين متوازيين)، والأقرب للمربع أفضل
    { const ca = (cl - EXT) / Math.max(.1, cs - EXT); if (ca > COURT_ASP + .02) bad('court-slot', ca - COURT_ASP); else if (ca > 1.5) pen += 40 * (ca - 1.5); }
    if (expLen(ct, solids) > .1) return no('court-open'); pen += touch(ct, hall.r) >= 2 ? -12 : 15; }
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
      // (الجولة الثانية عشرة) أرضي تحت علوي أثقل منه (خمس غرف فوق): المطبخ والطعام يتسعان حتى 2.3 من هدفهما بدل أن يبقى الأرضي فارغًا تحت العلوي
      const bigF = b.kind === 'suite' ? 1.9 : ctx.bigOK && ['kitchen', 'dining'].includes(b.kind) ? 2.3 : 1.7;
      if (['majlis', 'kitchen', 'dining', 'maid', 'family', 'suite'].includes(b.kind) && !b.fixedArea && net > tgt * bigF) bad('big:' + b.kind, (net - tgt * bigF) / 4); }
    const md = DEP[b.kind] || 2.4; if (s < md * .85) bad('min-side', md * .85 - s); if (s < md) pen += 50 * (md - s);
    // المجلس بعد اقتطاع ممر الضيوف ودورة مياههم: عرض صافٍ يتسع لجلسة على جانبين (≥ 3.7 م، والمستحسن 4.2 م)
    if (b.kind === 'majlis' && b.guestWc) {
      const sN = b.men ? menStrip(r, P).net : Math.max(Math.min(w - T.guestStripW, h), Math.min(w, h - T.guestStripW));
      if (sN < 3.7) bad('majlis-net', 3.7 - sN); if (sN < 4.2) pen += 60 * (4.2 - sN);
      // (الجولة التاسعة عشرة) المجلس المطلوب على الشارع: عرضه يتسع لشريط جانبي (لا أمامي يبعده عن الواجهة) — مخالفة في البحث نفسه (لا يُبنى ما يرسب في البند)
      if (b.men && P.majlisStreet && r.y0 < TOL && !R14_OFF.has('r19street') && menStrip(r, P).side !== 'side') bad('majlis-street', 1); // مخالفة: وإلا يرسب البند الصريح في السجل بعد البناء
    }
    // الوصول: لكل فراغ مضيف من الحركة، أو من جار مسموح (المطبخ من الطعام، الخادمة من المطبخ)، ومجلس الرجال من الواجهة
    // في الدور العلوي لا يُفتح باب غرفة على جانب قلبة الدرج: الوصول من الصالة أو البسطة أو الممر فقط
    const cT = Math.max(0, ...circ.filter(c => !(ctx.upper && c.id === 'stair')).map(c => touch(r, c.r))), cNoFoyer = Math.max(0, ...circ.filter(c => c.id !== 'foyer' && !(ctx.upper && c.id === 'stair')).map(c => touch(r, c.r)));
    // مجلس الرجال على الواجهة الأمامية، أو على واجهة جانبية بمدخل مستقل من الارتداد الجانبي (حافة خارجية ≥ 3.4 م)
    if (b.kind === 'majlis' && b.men) { if (r.y0 > TOL) { const sx = Math.max(...['x0', 'x1'].map(sd => sum(exposed(r, sd, solids).map(e => e.to - e.from)))); if (sx < 3.4) bad('men-front', r.y0); else pen += 15; } }
    else if (b.kind === 'kitchen') { const dn = placed.find(q => q.block.kind === 'dining'), td = dn ? touch(r, dn.r) : 0; if (cT < 1.1 && td < 1.2) bad('kitchen-access', 1.1 - cT); else if (Math.max(cT, td) < DOOR_TOUCH) pen += touchPen(Math.max(cT, td)); }
    else if (b.kind === 'maid') { const k = find('kitchen1'); if (cT < 1.1 && !(k && touch(r, k.r) >= 1.0) && !placed.some(q => q.block.laundry && touch(r, q.r) >= 1.0)) bad('maid-access', 1.1 - cT); }
    else if (b.kind === 'store') { const k = find('kitchen1'); if (!(k && touch(r, k.r) >= 1.0) && !(b.laundry && cT >= 1.1)) bad('store-access', 1); }
    else if (cT < 1.1) bad('access:' + b.kind, 1.1 - cT); else pen += touchPen(cT);
    // (الجولة الحادية عشرة) غرفة الغسيل/المخزن التي طلبها العميل شريطًا بعمق 1.6 م بجوار المطبخ: المطبخ يتسع له ويبقى ≥ 3.25 م و10 م² بعده
    if (b.id === 'kitchen1' && P.kitchenStrip?.length) {
      const need = P.kitchenStrip.length === 2 ? 3.4 : 1.6;
      const lack = (a1, a2) => Math.max(0, KIT_MIN_AXIS - (a1 - 1.6)) + Math.max(0, (KIT_MIN_AREA + .3 - (a1 - 1.6 - WALL_NET) * (a2 - WALL_NET)) / 3) + Math.max(0, need - a2);
      const def = Math.min(lack(w, h), lack(h, w)); if (def > 0) pen += 250 + 300 * def;
    }
    // جناح بدورة مياه مشتركة: باب الغرفة وباب دورة المياه كلاهما على الحركة — تلامس يتسع لهما معًا
    if (b.kind === 'suite' && b.bathShared && cNoFoyer < T.stripD + 1.3) bad('shared-bath-access', T.stripD + 1.3 - cNoFoyer);
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
    if (b.kind === 'majlis' && b.guestWc && b.men) { const m = menStrip(r, P); asp = Math.max(m.w, m.h) / Math.max(.1, Math.min(m.w, m.h)); }
    else if (b.kind === 'majlis' && b.guestWc) { const ws = [w - T.guestStripW, h], hs = [w, h - T.guestStripW]; asp = Math.min(Math.max(...ws) / Math.min(...ws), Math.max(...hs) / Math.min(...hs)); }
    if (b.kind === 'suite' || ((b.kind === 'maid' || b.kind === 'driver') && b.bath)) {
      const door = bestDoorSide(p, circ, placed), along = sideLen(r, door), dep = isX(door) ? w : h;
      let bw = along, bdp = dep;
      if (b.bath) ({ bw, bdp } = suiteVariant(b, along, dep));
      const ms = Math.min(bw, bdp), want = b.kind !== 'suite' ? 9 : b.master ? T.master : T.bedroom;
      { const lim = b.master ? 3.5 : b.kind === 'suite' ? 3.2 : b.kind === 'maid' ? MAID_MIN_NET + WALL_NET : 2.5; if (ms < lim) bad('suite-narrow', lim - ms); } // غرفة نوم صافيها ≥ 3.0 م
      if (ms < 3.3) pen += 60 * (3.3 - ms);
      // غرفة ملابس مطلوبة للرئيسية: تتسع في الشريط متى بلغ عمق الجناح 3.9 م (أو في مدخل الجناح العميق). جزاء في البحث العام؛
      // ومخالفة في إعادة الحل الموضعية (ctx.hardDress، refineMajlis) لنمط بُني ولم تتسع فيه
      if (b.master && b.bath && P.prefs?.masterDressing && dep < 3.9 && !suiteVariant(b, along, dep).deep) { if (ctx.hardDress) bad('master-dress', 3.9 - dep); else pen += 70 + 40 * (3.9 - dep); }
      pen += 25 * Math.log(bw * bdp / want) ** 2;
      if (b.kind === 'suite' && !b.guest) bedA.push({ b, a: bw * bdp });
      // حد مهني صلب: صافي غرفة النوم (بعد الحمام والخزانة والجدران) ≥ 12 م²، والرئيسية ≥ 16 م²؛ ويُستحسن هامش فوقه
      if (b.kind === 'suite') { const net = (bw - WALL_NET) * (bdp - WALL_NET), lim = b.master ? BED_MIN_MASTER : BED_MIN; if (net < lim) bad('bed-small', (lim - net) / 2); else if (net < lim + 1.5) pen += 30 * (lim + 1.5 - net);
        // الرئيسية في الدور العلوي لا تتضخم (≤ 26 م² صافيًا) ما لم يطلبها العميل كبيرة
        if (b.master && ctx.upper && !masterAsked(P)) { if (net > MASTER_UP_MAX) bad('master-big', (net - MASTER_UP_MAX) / 2); else if (net > MASTER_UP_MAX - 2) pen += 20 * (net - MASTER_UP_MAX + 2); }
        // (الجولة العاشرة) والرئيسية العلوية ≥ 18 م² صافية (دون الحمام والملابس) ما لم يحدد العميل مقاسها
        if (b.master && ctx.upper && !(b.fixedArea || P.dims?.master) && net < MASTER_UP_MIN + .3) bad('master-small-up', (MASTER_UP_MIN + .3 - net) / 2);
        // (الجولة التاسعة) والرئيسية في الدور الأرضي ≤ 24 م² صافيًا (دون الحمام والملابس) ما لم يطلبها العميل كبيرة أو بمقاس
        // (الزائد حتى شريط 1.4 م يذهب إلى الحمام وغرفة الملابس عند التفصيل؛ ما بعده مخالفة)
        if (b.master && !ctx.upper && !masterAsked(P)) { const cap = MASTER_GROUND_MAX - .4, absorb = Math.max(0, Math.min(1.3, Math.max(bw, bdp) - 3.6)) * (Math.min(bw, bdp) - WALL_NET); if (net > cap + absorb) bad('master-big', (net - cap - absorb) / 2); else if (net > cap - 2) pen += 15 * (net - cap + 2); } }
      // الدوران: غرفة الأرضي (كبار السن) لا تزيد على الرئيسية في العلوي (تقدير الرئيسية: مقاسها المستهدف)
      if (ctx.capSuite && b.kind === 'suite' && !b.master && bw * bdp > ctx.capSuite) bad('suite-over-master', (bw * bdp - ctx.capSuite) / 3);
      asp = Math.max(bw, bdp) / Math.max(.1, Math.min(bw, bdp));
      // الواجهة الخارجية على جهة غير جهة الباب (يبقى للغرفة نافذة بعد الشريط)
      if (expLen(r, solids, SIDES.filter(x => x !== door)) < 2.4) pen += 90;
    }
    const mx = MAX_ASP[b.kind] || 2; { const lim = b.kind === 'suite' ? .25 : ['majlis', 'dining', 'kitchen', 'family'].includes(b.kind) ? .45 : .8; /* غرفة نوم لا تتجاوز نسبتها 2.0 */ if (asp > mx + lim && b.kind !== 'wc') bad('aspect:' + b.kind, asp - mx - lim); } if (asp > mx) pen += 70 * (asp - mx) * Math.max(1, b.area / 15) + 120 * Math.max(0, asp - mx - .5);
    const need = HABIT_EXP[b.kind]; if (need) { const e = expLen(r, solids); if (e < need) pen += b.kind === 'family' ? 25 : 90; if (e < 1.0 && b.kind !== 'family') bad('dark:' + b.kind, 1.0 - e); }
    if (b.kind === 'majlis') { pen += 4 * r.y0; for (const q of placed) if (q.block.kind === 'suite' && !q.block.guest && touch(r, q.r) > .5) pen += 30; }
    // غرفة نوم على واجهة الشارع في الأرضي (الجولة السابعة): خصوصية ضعيفة — جزاء كبير ما لم يطلبها العميل (يتجه البحث إلى
    // فناء أمامي أمام جناح النوم أو غرفة غير النوم على الواجهة)؛ كان 12 فبقيت غرف نوم على الشارع في C6 وC8
    // (فناء أمامي بعمق ≥ 3 م أمام الغرفة يكفي: الغرفة لا تقع على خط الواجهة؛ ودونه جزاء متدرج)
    if (b.kind === 'suite' && !b.guest && !ctx.upper && !ctx.bedFront && r.y0 < 3 - TOL) { const sl = streetLen(r, solids), ex = sum(exposed(r, 'y0', solids).map(e => e.to - e.from)); if (sl > .6 && ex > .6) pen += (r.y0 < 2.4 ? 220 : 220 * (3 - r.y0) / .6) + 40 * Math.min(sl, ex); }
    // (الجولة العاشرة) المجلس: عرض صافٍ ≥ 4.2 م وسقف 1.6 من حده — ما لم يحدد العميل مقاسه
    if (b.kind === 'majlis' && !b.fixedArea && !majlisAsked(P)) {
      let mw = s, na = (w - WALL_NET) * (h - WALL_NET);
      if (b.guestWc && b.men) { const m = menStrip(r, P); mw = Math.min(m.w, m.h); na = (m.w - WALL_NET) * (m.h - WALL_NET); }
      else if (b.guestWc) { mw = Math.max(Math.min(w - T.guestStripW, h), Math.min(w, h - T.guestStripW)); na = Math.max((w - T.guestStripW - WALL_NET) * (h - WALL_NET), (w - WALL_NET) * (h - T.guestStripW - WALL_NET)); }
      // عرض الجلسة المتقابلة للمجلس الرئيسي (الرجال أو الوحيد)؛ ومجلس النساء جزاء فوق حده السابق (3.7 م)
      // (تقدير الشريط هنا تقريبي: رفض تحت الحد بهامش 0.25 م وجزاء حتى الحد؛ الحكم الدقيق على المرسوم في qualityGates)
      // (تقدير الشريط تقريبي: رفض تحت الحد بهامش 0.25 م وجزاء حتى الحد؛ الحكم الدقيق على المرسوم في qualityGates، وحين يتعارض
      // الحد مع بند صريح من الطلب يُقبل مجلس أضيق بملاحظة — admitMajlisBar)
      // وحين يربط العميل المجلس ببند صريح (غرفة الضيوف قرب المجلس…) لا يوجّه الحدُّ الافتراضي البحثَ: بنده يتقدم (توجيه المالك)
      // (الجولة الحادية عشرة) مجلس النساء أيضًا ≥ 4.2 م صافيًا (قيمة تصميمية افتراضية للميزان؛ العميل يغلبها بمقاس أو بند صريح)
      if (!P.majlisRuled) { const dw = MAJLIS_MIN_W - (mw - WALL_NET); if (dw > .25) bad(b.men || b.primary ? 'majlis-width' : 'women-width', dw); else if (dw > 0) pen += 200 * dw; }
      const cap = MAJLIS_CAP * (b.men || b.primary ? MAJLIS_NET : WOMEN_NET);
      if (na > cap) bad('majlis-big', (na - cap) / 4); else if (na > cap - 4) pen += 15 * (na - cap + 4);
    }
    // (تنظيمات الدورين tfJoint تقيس الطعام المفصّل نفسه، فلا يُقدَّر هنا: ctx.dinRealized)
    if (b.kind === 'dining' && !b.fixedArea && !ctx.dinRealized) { const na = (w - WALL_NET) * (h - WALL_NET); const al = .3; if (na > DIN_MAX_AREA + al) bad('dining-big', (na - DIN_MAX_AREA - al) / 4); else if (na > DIN_MAX_AREA - 1 + al) pen += 20 * (na - DIN_MAX_AREA + 1 - al); } // الكتلة قد يُقتطع منها شريط دورة مياه؛ الحد الدقيق على المرسوم (qualityGates، وtfJoint)
    // المجلس الرئيسي صافيه ≥ 24 م² ما أمكن (جزاء لا رفض)
    if (b.kind === 'majlis' && b.primary && !b.fixedArea) {
      let na = (w - WALL_NET) * (h - WALL_NET);
      if (b.guestWc && b.men) { const m = menStrip(r, P); na = (m.w - WALL_NET) * (m.h - WALL_NET); }
      else if (b.guestWc) na = Math.max((w - T.guestStripW - WALL_NET) * (h - WALL_NET), (w - WALL_NET) * (h - T.guestStripW - WALL_NET));
      if (na < MAJLIS_NET) pen += 60 * (MAJLIS_NET - na); // التقدير هنا تقريبي (الشريط)؛ الحد الصلب الدقيق على المرسوم في qualityGates
    }
    // الطعام صافيه ≥ 12 م²: جزاء يوجّه البحث هنا، والحد الصلب على المخطط المرسوم (qualityGates)
    if (b.kind === 'dining' && !b.fixedArea) { const na = (w - WALL_NET) * (h - WALL_NET), m = .2, k = 60; if (na < DIN_MIN_AREA + m) pen += k * (DIN_MIN_AREA + m - na); }
    // الطعام صافيه ≥ 3.3 م، وغرفة الخادمة بلا حمام ≥ 2.7 م (حدّان صلبان)
    if (b.kind === 'dining' && s - WALL_NET < DIN_MIN_NET - 1e-6) bad('dining-narrow', DIN_MIN_NET - (s - WALL_NET));
    if (b.kind === 'maid' && !b.bath && s - WALL_NET < MAID_MIN_NET - 1e-6) bad('maid-narrow', MAID_MIN_NET - (s - WALL_NET));
    // (الجولة الرابعة عشرة) حمام الخادمة الافتراضي يُقتطع عند التفصيل شريطًا 1.65 م: ضلعها الأطول يتسع له مع غرفة ≥ 2.7 م صافيًا (تفضيل: جزاء لا رفض)
    if (!R14_OFF.has('maid') && b.kind === 'maid' && b.mizanBath && Math.max(w, h) < 1.65 + MAID_MIN_NET + WALL_NET) pen += 220 * (1.65 + MAID_MIN_NET + WALL_NET - Math.max(w, h));
    // جودة فراغات الأسرة (حدود صلبة): مطبخ صافي عرضه ≥ 3.0 م (المحور ≥ 3.25)، وطعام لا شريطي (≤ 1.8)،
    // والمطبخ لا يطل على الشارع (الواجهة الأمامية) ما لم يطلبه العميل صراحة
    if (b.id === 'kitchen1') {
      if (s < KIT_MIN_AXIS) bad('kitchen-narrow', KIT_MIN_AXIS - s);
      { const net = (w - WALL_NET) * (h - WALL_NET); if (net < KIT_MIN_AREA) bad('kitchen-small', (KIT_MIN_AREA - net) / 2); // مطبخ صافيه ≥ 10 م²
        // (الجولة الثانية عشرة) قيمة تصميمية افتراضية للميزان: ≥ 14 م² صافيًا (جزاء قوي لا رفض؛ الملاحظة في المراجعة)، والشريط المطلوب يُستثنى
        if (b.minNet && !P.kitchenStrip?.length && net < b.minNet) pen += 140 * (b.minNet - net);
        // (الجولة الثالثة عشرة) سقف افتراضي: فائض الغلاف لا يُمتص في المطبخ (الشريط المطلوب يُستثنى من الحساب)
        if (!b.fixedArea && !P.dims?.kitchen) { const strip = P.kitchenStrip?.length ? (P.kitchenStrip.length === 2 ? 9 : 5.5) : 0, ex = net - strip - KIT_MAX_NET - KIT_CAP_TOL; if (ex > 0) pen += 30 * ex; } }
      if (!ctx.kitchenFront && sum(exposed(r, 'y0', solids).map(e => e.to - e.from)) > .6 && streetLen(r, solids) > .6) bad('kitchen-street', 1);
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
      if (q.block.kind === 'majlis' && q.block.guestWc) { if (q.block.men) { const m = menStrip(q.r, P); if (m.side === 'side') w -= T.guestStripW; else if (m.side === 'back') h -= MEN_LOBBY_D - half('y0') + INT / 2; } else { const d = bestDoorSide(q, circ, placed); if (isX(d)) w -= T.guestStripW; else h -= T.guestStripW; } }
      if (q.block.kind === 'suite' && q.block.bath) { const v = suiteVariant(q.block, Math.max(w, h), Math.min(w, h)); w = v.bw; h = v.bdp; }
      const tol = Math.max(0, (Number.isFinite(dm.tol) ? dm.tol : .05) - .08), a = [Math.min(w, h), Math.max(w, h)], t = [Math.min(dm.w, dm.l), Math.max(dm.w, dm.l)];
      // (الجولة التاسعة عشرة) مجلس الرجال بشريط دهليز: الشريط يمتص حتى 0.9 م من ضلعه (التفصيل يضبطه على المقاس)، فالخطأ بُعد المطلوب عن المجال
      let ex = Math.max(0, Math.abs(a[0] - t[0]) - tol) + Math.max(0, Math.abs(a[1] - t[1]) - tol);
      if (q.block.kind === 'majlis' && q.block.guestWc && q.block.men && !R14_OFF.has('r19dim')) { const m = menStrip(q.r, P), ax = m.side === 'side' ? w : m.side === 'back' ? h : null, ot = m.side === 'side' ? h : w;
        if (ax != null) { const want = Math.abs(ot - t[0]) <= Math.abs(ot - t[1]) ? t[1] : t[0], other = want === t[1] ? t[0] : t[1], gap = d => (d < want - .9 ? want - .9 - d : d > want ? d - want : 0) ; ex = Math.max(0, Math.abs(ot - other) - tol) + Math.max(0, (ax < want ? want - ax : ax - want > .9 ? ax - want - .9 : 0) - tol); void gap; } }
      // داخل السماحية المعلنة = مقبول؛ خارجها مخالفة (المقاس الصريح إلزام، والسجل يقيسه من المستند بالسماحية نفسها)
      pen += 400 * ex; if (ex > .04) bad('dims:' + key, ex);
      // (الجولة الخامسة عشرة) داخل السماحية: المطابق أفضل متى اتسع المكان (المجلس 5.76 م والمطلوب 6 م مقبول، و6 م أفضل)
      pen += 80 * (Math.abs(a[0] - t[0]) + Math.abs(a[1] - t[1]));
    }
  }
  const k = find('kitchen1'), dn = find('dining1');
  // المطبخ يجاور الطعام مباشرة (لا تفصلهما الصالة): حد صلب متى وُجدا معًا
  if (k && dn) { const t = touch(k.r, dn.r); if (t < 1.2) bad('kitchen-dining', 1.2 - t); else { pen += touchPen(t); pen -= 10; } }
  if (P.men && dn && touch(find(P.men.id).r, dn.r) >= 1.2) pen -= 10; // الطعام للضيافة يجاور مجلس الرجال
  // (الجولة الثانية عشرة) المقلط الافتراضي: تجاور المجلس والطعام بطول يتسع لباب خدمة يُكافأ، وغيابه جزاء (لا رفض)
  if (P.majlisDiningDefault && P.men && dn) { const t = touch(find(P.men.id).r, dn.r); pen += t >= DOOR_TOUCH + .4 ? -45 : 35; }
  // (الجولة الرابعة عشرة) جُرّب جزاء «المجلس يشترك في جدار مع غرفة نوم» وجزاء أقوى لغياب المقلط في البحث نفسه: خفّضا عدد البدائل
  // المعروضة (23 ← 20 و22 على تسع حالات) بلا تحسن مقابل في البند — أُزيلا؛ البندان يُقاسان ويُذكران في حالة العرض («يحتاج تعديلات»).
  if (P.men && P.women[0]) { const m = find(P.men.id), wm = find(P.women[0].id); if (m && wm && touch(m.r, wm.r) > .5) pen += 10; }
  if (P.maid && k) pen += touch(find(P.maid.id).r, k.r) >= 1 ? -8 : 12;
  if (k) { const ext = SIDES.filter(s => s !== 'y0').some(s => exposed(k.r, s, solids).some(e => e.to - e.from >= 1.6)); if (!ext) pen += ctx.upper ? 15 : 70; } // باب خدمة إلى الحوش (الجولة الثانية عشرة: قيمة افتراضية للميزان بجزاء أقوى)
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
  // الدور العلوي يحتاج هذا المسطح — (الجولة الثانية عشرة) مبنيًا تحته فعلًا: الحدائق والفراغات المفتوحة في الأرضي لا تحمل غرفًا فوقها
  if (ctx.minEnv) { const sup = W * D - (ctx.minDepth ? sum((sol.voids || []).map(A_)) : 0); if (sup < ctx.minEnv) bad('env-small', (ctx.minEnv - sup) / 10); }
  // (الجولة الثانية عشرة) الدور العلوي بغرف نوم كثيرة (القراءة الحرفية «5 غرف فوق»): أجنحته على جانبي عمود السلم تحتاج عمقًا
  // يتسع لصفها (جناح بشريط حمام جانبي ≈ 4.9 م على امتداد العمود) — عمق الأرضي أقل منه مخالفة يتجه البحث لإزالتها
  if (ctx.minDepth && D < ctx.minDepth - 1e-6) bad('env-shallow', (ctx.minDepth - D) / 2);
  // الدور العلوي يبني محوره (صالة علوية) على عرض فراغ السلم نفسه: لا يقل عن عرض صالة
  if (ctx.minEnv) { const st = cid('stair'); if (st && W_(st.r) < CMIN.hall + .2) bad('stair-hub', CMIN.hall + .2 - W_(st.r)); }
  if (ctx.minEnv) { const st = cid('stair'); if (st) { if (st.r.x0 < 3.7) bad('upper-left', 3.7 - st.r.x0); if (W - st.r.x1 < 3.7) bad('upper-right', 3.7 - (W - st.r.x1)); } } // أجنحة العلوي على جانبي السلم
  // (الجولة السادسة) فراغ مفتوح في الأرضي (حديقة في ركن L) لا تعلوه غرف: يُستحسن أرضي ممتلئ يحمل العلوي كاملًا
  // (والعلوي نفسه لا يبرز فوق فراغ أرضي — upperFor)
  if (ctx.minEnv) { const va = sum((sol.voids || []).map(A_)); if (va > OVERHANG_MAX) pen += 4 * (va - OVERHANG_MAX); }
  // (الجولة السادسة) جناح علوي بعمق يتسع لحمام أمام الغرفة (≥ 5.3 م) يقصر امتداد غرفه فتتسع لتنظيمات علوية مختلفة
  if (ctx.minEnv) { const st = cid('stair'); if (st) for (const sw of [st.r.x0, W - st.r.x1]) pen += 30 * Math.max(0, 5.3 - sw) + 150 * Math.max(0, 4.8 - sw); }
  // «الرئيسية بعيدة عن الدرج» في دورين: يُستحسن عمق خلف السلم يتسع لصالة علوية ثم الجناح الرئيسي خلفها
  if (ctx.backAfterStair) { const st = cid('stair'); if (st && D - st.r.y1 < ctx.backAfterStair) pen += 150 * (ctx.backAfterStair - (D - st.r.y1)); }
  if (ctx.out) ctx.out.viol = viol;
  sol.viol = viol;
  return pen;
}
/** جهة الباب الفعلية لكتلة: الجهة الأطول تلامسًا مع الحركة (غرف النوم تتجنب مدخل العائلة)، وإلا نحو المضيف. */
function bestDoorSide(p, circ, placed) {
  const b = p.block, r = p.r, priv = b.kind === 'suite' || b.kind === 'maid';
  const lens = SIDES.map(s => { let L = 0; for (const c of circ) { if (priv && c.id === 'foyer') continue; const e = shared(r, c.r); if (e && e.side === s) L += e.to - e.from; } return L; });
  const pref = SIDES.indexOf(p.door);
  if (pref >= 0 && lens[pref] >= DOOR_TOUCH) return p.door;
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
function weightNodes(n, acc = []) { if (n.w && n.w.length > 1 && !n.at) acc.push(n); if (n.k) for (const c of n.k) weightNodes(c, acc); if (n.t === 'dual') { weightNodes(n.g, acc); weightNodes(n.u, acc); } return acc; }
/**
 * يبحث عن أفضل أبعاد لشجرة: أوزان التقسيم وعرض الغلاف وعمقه داخل الأرض القابلة للبناء.
 * evalFn(sol, ew, ed) → جزاء أو null. حتمي (بذرة من اسم النمط).
 */
const SA_T0 = 150; // حرارة التلدين الابتدائية (بمقياس الجزاء)
const POLISH_K = 2, DEEP_ITERS = 320, CD_ROUNDS = 4, OVERHANG_MAX = 2; // طول مرحلة الصقل بمضاعفات طول التلدين
function optimize(tree, site, evalFn, opts = {}) { let best = null; for (const b of optimizeSteps(tree, site, evalFn, opts)) best = b; return best; }
/** البحث نفسه خطوةً خطوة: يُسلِّم أفضل حل بعد كل بداية (ليوزّع المجدول ميزانية ثابتة من البدايات بين الأنماط). */
function* optimizeSteps(tree, site, evalFn, { iters = 140, seed = 'x', tol = 2 } = {}) {
  // tol: أقصى عدد مخالفات يُعد معه النمط «قريبًا من القبول» (يستحق بدايات إضافية وصقلًا)
  const nodes = weightNodes(tree), R = rng(hash(seed)), A = areaOf(tree) * 1.04;
  // مناطق بأكثر من كتلة: ترتيب الكتل داخلها قابل للتبديل (المطبخ قبل الطعام أو بعده…) — يبقى النمط نفسه
  const zones = nodes.filter(n => n.t === 'zone' && n.b.length > 1);
  const minW = minExt(tree, 'x'), minD = minExt(tree, 'y');
  if (minW > site.W + 1e-6 || minD > site.D + 1e-6) return null; // لا يتسع بأدنى أبعاده: لا يُستنزف فيه البحث
  // ذاكرة تقييم بالهندسة الناتجة: تغيّر وزن صغير كثيرًا ما يعطي المستطيلات نفسها بعد التقريب إلى 5 سم — لا يُعاد تقييمها
  // (التقييم دالة في المستطيلات وكتلها فقط؛ النتيجة نفسها حرفيًا، أسرع)
  const memo = new Map(), rk = r => Math.round(r.x0 * 20) + ',' + Math.round(r.y0 * 20) + ',' + Math.round(r.x1 * 20) + ',' + Math.round(r.y1 * 20);
  const ev = (ew, ed) => {
    if (ew < minW - 1e-6 || ed < minD - 1e-6 || ew > site.W + 1e-6 || ed > site.D + 1e-6) return null; if (site.fit && !site.fit(ew, ed)) return null;
    const sol = solve(tree, ew, ed); if (!sol) return null;
    const key = ew + 'x' + ed + '|' + sol.placed.map(q => q.block.id + ':' + rk(q.r) + q.door).join(';') + '|' + sol.circ.map(c => c.id + ':' + rk(c.r)).join(';') + '|' + sol.courts.map(rk).join(';') + '|' + (sol.bigPantry || 0) + (sol.up ? '|U' + sol.up.placed.map(q => q.block.id + ':' + rk(q.r) + q.door).join(';') + '|' + sol.up.circ.map(c => c.id + ':' + rk(c.r)).join(';') + '|' + sol.up.voids.map(rk).join(';') + '|' + sol.up.dh.map(rk).join(';') : '');
    const hit = memo.get(key); if (hit !== undefined) { if (globalThis.__v2prof) globalThis.__v2prof.hit = (globalThis.__v2prof.hit || 0) + 1; return hit; }
    const p = evalFn(sol, ew, ed), res = p === null ? null : { p, sol };
    if (memo.size < 20000) memo.set(key, res); return res;
  };
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
    if (tried >= 2 && (!best || best.sol.viol > tol)) break;
    // بداية أولى بخمس مخالفات أو أكثر: النمط بعيد عن هذا البرنامج — لا تُصرف عليه بداية ثانية
    if (tried >= 1 && best && best.sol.viol >= 5 && tol <= 2) break;
    // إعادة البدء العشوائية تُجرَّب فقط إن بقيت مخالفة أو اثنتان (نمط بعيد عن القبول لا يُستنزف فيه الوقت)
    if (!init && (!best || best.sol.viol > tol)) break;
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
    // مرحلتان: تلدين كامل، ثم «صقل» أطول بحرارة أدنى من أفضل ما وُجد إن بقيت مخالفة أو اثنتان فقط (نمط قريب من القبول
    // يحتاج بحثًا أعمق لا بداية جديدة) — حتمي، وبالعدد لا بالزمن
    for (let phase = 0; phase < 2; phase++) {
    // الصقل للأنماط العميقة فقط (tol > 2): الأنماط المعتادة تكفيها البدايات والنزول الإحداثي
    if (phase === 1) { if (tol <= 2 || !(lb.sol.viol >= 1 && lb.sol.viol <= tol)) break; cur = lb; ew = lb.ew; ed = lb.ed; curW = lb.weights; load(curW); }
    const nIt = phase ? iters * (globalThis.__v2cfg?.polish ?? POLISH_K) : iters, T0 = phase ? SA_T0 * .4 : SA_T0;
    for (let it = 0; it < nIt; it++) {
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
      const Tk = T0 * Math.pow(.01, it / nIt);
      if (c && (c.p < cur.p || R() < Math.exp((cur.p - c.p) / Tk))) { cur = c; ew = nw; ed = nd; curW = ws; if (!lb || cur.p < lb.p) lb = { ...cur, ew, ed, weights: curW }; } else load(curW);
    }
    }
    if (lb && lb.p < cur.p) { cur = lb; ew = lb.ew; ed = lb.ed; curW = lb.weights; load(curW); }
    // نزول إحداثي حتمي بعد التلدين لنمط قريب من القبول: كل وزن وكل بُعد للغلاف بخطوات ثابتة، يُقبل الأفضل فقط —
    // يُصلح المخالفة الأخيرة التي تفوتها الخطوات العشوائية (غرفة تنقصها عشرة سنتيمترات لتلامس الممر…)
    if (cur.sol.viol >= 1 && cur.sol.viol <= tol) {
      const moves = [];
      curW.ws.forEach((w, i) => w.forEach((_, j) => { for (const f of [1.3, .77, 1.1, .91]) moves.push({ i, j, f }); }));
      for (const dw of [.5, -.5, .2, -.2]) moves.push({ ew: dw }); for (const dd of [.5, -.5, .2, -.2]) moves.push({ ed: dd });
      for (let round = 0; round < (globalThis.__v2cfg?.cd ?? CD_ROUNDS); round++) {
        let improved = false;
        for (const m of moves) {
          const ws = { ws: curW.ws.map(x => [...x]), ord: curW.ord.map(x => [...x]), ps: [...curW.ps] }; let nw = ew, nd = ed;
          if (m.ew) nw = snap(ew + m.ew); else if (m.ed) nd = snap(ed + m.ed); else ws.ws[m.i][m.j] *= m.f;
          load(ws); const c = ev(nw, nd);
          if (c && c.p < cur.p - 1e-9) { cur = c; ew = nw; ed = nd; curW = ws; improved = true; } else load(curW);
        }
        if (!improved || !cur.sol.viol) break;
      }
      load(curW);
    }
    if (!best || cur.p < best.p) best = { ...cur, ew, ed, weights: curW };
    if (globalThis.__v2dbg) (globalThis.__v2dbg['tr:' + seed] ||= []).push(best.sol.viol);
    load(best.weights); yield best;
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
  // (الجولة الثالثة عشرة) الارتداد الأمامي على شارع المدخل: خُمس عرض الشارع ولا يقل عن 3 م (و6 م لشوارع ≥ 30 م) — اشتراط نظامي
  // متحقق حين يُعرف عرض الشارع (land.streetWidth)؛ وإلا 3 م قيمة تصميمية افتراضية للميزان (يُسأل العميل). ارتداد الجار 1.5 م نظامي كما هو.
  const front = frontSetbackFor(land.streetWidth), frontX = Math.max(0, front.value - plot.streetSetback);
  plot.frontSetback = front.value; plot.frontTier = front.tier; plot.streetWidth = front.known ? Number(land.streetWidth) : null;
  if (!poly) {
    // الوجه الخارجي للجدار (لا محوره) داخل خط الارتداد: يُنقص نصف سماكة الجدار الخارجي من كل جهة
    const f0 = footprint(plot), hw = EXT / 2 + .005, fp = { ...f0, x: f0.x + hw, y: f0.y + hw, w: f0.w - 2 * hw, h: f0.h - 2 * hw };
    f0.sb = { ...f0.sb, [entry]: front.value };
    // (الجولة الثانية عشرة) عمق محجوز أمام المبنى للمواقف المطلوبة نظاميًا (يُطلب حين لا يتسع العدد بغيره) — الارتداد النظامي المرسوم كما هو
    const rsv = Math.max(0, Number(land.parkReserve) || 0) + frontX;
    if (rsv) { if (entry === 's') { fp.y += rsv; fp.h -= rsv; } else if (entry === 'n') fp.h -= rsv; else if (entry === 'w') { fp.x += rsv; fp.w -= rsv; } else fp.w -= rsv; }
    const W = ['s', 'n'].includes(entry) ? fp.w : fp.h, D = ['s', 'n'].includes(entry) ? fp.h : fp.w;
    return { plot, entry, fp, W, D, polygon: [{ x: 0, y: 0 }, { x: plot.width, y: 0 }, { x: plot.width, y: plot.length }, { x: 0, y: plot.length }], setbacks: f0.sb, fit: null, place: (ew) => ({ ox: snap((W - ew) / 2), oy: 0 }), maxBuilt: null, irregular: false, front };
  }
  // مضلع: الإحداثيات تُنقل بحيث يبدأ صندوقه من الصفر
  const P0 = poly.map(p => ({ x: p.x - off.x, y: p.y - off.y }));
  const sbOf = s => (s === entry ? front.value : plot.streets[s] ? plot.streetSetback : plot.neighborSetback);
  const rsv = Math.max(0, Number(land.parkReserve) || 0);
  const { pts: inner } = insetPolygon(P0, s => sbOf(s) + (s === entry ? rsv : 0) + EXT / 2 + .005);
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
  return { plot, entry, fp, W, D, polygon: P0, setbacks: sb, fit: null, place, placeRects, rectW, maxBuilt: polyArea(P0) * plot.coverage, irregular: true, inner, front };
}

// ------------------------------------------------------------------------------------------ التفصيل: غرف وأبواب
const CIRC_TYPE = { foyer: 'entrance', hall: 'living', stair: 'stairs' };
/** يحوّل الترتيب المحلول إلى غرف (مع تقسيم الأجنحة والمجالس) وأبواب. الإحداثيات قانونية داخل الغلاف. */
export function realizeV2(cand, P, { secondEntry = null, upper = false, below = null } = {}) {
  const T = DESIGN_TARGETS, rooms = [], doors = [], notes = [];
  let extraBaths = P.extraBaths;
  const sn = r => ({ x0: snap(r.x0), y0: snap(r.y0), x1: snap(r.x1), y1: snap(r.y1) });
  const add = (r, o) => { const x = { ...sn(r), ...o }; rooms.push(x); return x; };
  const placed = cand.sol.placed.map(p => ({ ...p, r: sn(p.r) })), circ = cand.sol.circ.map(c => ({ ...c, r: sn(c.r) }));
  for (const p of placed) p.door = bestDoorSide(p, circ, placed);
  const dhR = (cand.sol.dh || []).map(sn);
  const parents = [...placed.map(p => p.r), ...circ.map(c => c.r), ...dhR], courtsR = cand.sol.courts.map(sn);
  const container = r => parents.find(q => r.x0 >= q.x0 - TOL && r.x1 <= q.x1 + TOL && r.y0 >= q.y0 - TOL && r.y1 <= q.y1 + TOL);
  /** حواف تطل على الضوء (خارج أو حوش)؛ withCourts=false: الخارج الحقيقي فقط (للمداخل والأبواب الخارجية). */
  const edges = (r, outsideOnly = false) => { const c = container(r), others = [...parents.filter(q => q !== c), ...(outsideOnly ? courtsR : [])]; return SIDES.flatMap(s => (c && Math.abs(r[s] - c[s]) > TOL ? [] : exposed(r, s, others))); };
  const isExtSide = (r, s) => edges(r).some(e => e.side === s && e.to - e.from >= sideLen(r, s) - .05);
  const hallName = upper ? (P.upperHallName || 'الصالة العلوية') : (P.hall ? 'الصالة' : 'صالة الحركة');
  // ممر لا تُفتح عليه غرفة نوم (رواق حول حوش أو ممر يصل الصالة بالمدخل): «رواق» لا «ممر الغرف»
  const bedTouch = r => placed.some(q => q.block.kind === 'suite' && touch(q.r, r) >= 1.1);
  const circName = (id, r) => (id === 'foyer' ? (P.men ? 'مدخل العائلة' : 'الردهة') : id === 'hall' ? hallName : id === 'stair' ? 'الدرج' : /^(ring|link)/.test(id) && !bedTouch(r) ? 'رواق' : 'ممر الغرف');
  const circRooms = circ.map(c => add(c.r, { id: c.id, circ: true, type: CIRC_TYPE[c.id] || 'corridor', name: circName(c.id, c.r), ...(c.dh ? { dhBelow: true } : {}) }));
  // (الجولة التاسعة) الفراغ المزدوج الارتفاع في العلوي: غرفة «void» بلا أبواب، يحدها درابزين (drawPlanV2)
  dhR.forEach((r, i) => add(r, { id: 'dh' + (i + 1), type: 'void', name: 'فراغ مزدوج الارتفاع', dh: true }));
  const foyer = circRooms.find(c => c.id === 'foyer');
  if (foyer?.dhBelow) notes.push('بهو المدخل بارتفاع مزدوج (دوران) يطل عليه رواق الدور العلوي بدرابزين.');
  if (foyer && !upper) doors.push({ a: 'foyer', edge: { axis: 'y', at: foyer.y0, from: foyer.x0, to: foyer.x1 }, kind: 'door2', w: Math.min(1.6, W_(foyer) - .6), entry: true });
  for (let i = 0; i < circRooms.length; i++) for (let j = i + 1; j < circRooms.length; j++) {
    const a = circRooms[i], b = circRooms[j], e = shared(a, b); if (!e || e.to - e.from < 1.2) continue;
    const narrow = [a, b].some(c => !['hall', 'foyer', 'stair'].includes(c.id));
    doors.push({ a: a.id, b: b.id, edge: e, kind: 'arch', w: Math.min(narrow ? 1.4 : 2.6, e.to - e.from - .4) });
  }
  // الأحواش: غرفة مكشوفة يُدخل إليها من الصالة (باب زجاجي) أو من أطول حركة تلامسها
  courtsR.forEach((ct, i) => {
    const c = add(ct, { id: 'court' + (i + 1), type: 'courtyard', name: cand.sol.courts[i]?.well ? 'منور' : 'الحوش الداخلي', open: true });
    // باب الحوش من الصالة إن اتسع حدها معه لباب ونافذة معًا (≥ 4.6 م)، وإلا من رواق يلامسه فتبقى حافة الصالة نافذةً عليه
    const hallFirst = h => h.id === 'hall' && touch(c, h) >= 4.6;
    const host = [...circRooms].sort((a, b) => hallFirst(b) - hallFirst(a) || (a.id === 'hall') - (b.id === 'hall') || touch(c, b) - touch(c, a)).find(h => touch(c, h) >= 1.4);
    if (host) { const e = shared(host, c), w = Math.min(2.0, e.to - e.from - .4); doors.push({ a: c.id, b: host.id, edge: e, pos: e.to - e.from >= 4.2 ? e.from + .35 + w / 2 : (e.from + e.to) / 2, kind: 'slider', w }); }
  });
  // أزواج الحمامات: شريط الجناح نحو جاره من الأجنحة، وإلا نحو جدار داخلي ليبقى للغرفة جدار خارجي
  const suites = placed.filter(p => ['suite', 'maid'].includes(p.block.kind) && p.block.bath);
  const stripSide = new Map();
  for (const p of suites) {
    const perp = isX(p.door) ? ['y0', 'y1'] : ['x0', 'x1'];
    // غرفة الخادمة: حمامها على الجهة البعيدة عن المطبخ، فتلامس الغرفة نفسها المطبخ (لا يفصلهما الحمام)
    if (p.block.kind === 'maid') {
      const k = placed.find(q => q.block.id === 'kitchen1'), e = k && shared(p.r, k.r);
      if (e && e.to - e.from >= .8 && perp.includes(e.side)) { stripSide.set(p, opp[e.side]); continue; }
    }
    // الحركة تلامس جزءًا من جهة الباب فقط (جناح في نهاية ممر): الشريط في الطرف البعيد عن موضع التلامس ليبقى الباب على الحركة
    const spans = circ.map(c => shared(p.r, c.r)).filter(e => e && e.side === p.door && e.to - e.from >= .9);
    let away = null;
    if (spans.length) {
      const e0 = edgeOf(p.r, p.door), cov = sum(spans.map(e => e.to - e.from));
      if (cov < (e0.to - e0.from) - 1.2) { const mid = sum(spans.map(e => (e.from + e.to) / 2 * (e.to - e.from))) / cov; away = mid < (e0.from + e0.to) / 2 ? perp[1] : perp[0]; }
    }
    // الشريط بعيدًا عن موضع تلامس الحركة يسبق مزاوجة الحمامات: الباب يبقى على الحركة
    // دورة مياه مشتركة تُفتح على الحركة نفسها: شريطها في طرف التلامس لا بعيدًا عنه
    if (away) { stripSide.set(p, p.block.bathShared ? opp[away] : away); continue; }
    // التنظيم «العميق» (مدخل جناح بجانب الحمام على جهة الباب): المدخل في الطرف الذي يلامس فيه عنصر حركة واحد بطول باب
    // (لا عند ملتقى ممر وصالة يتقاسمان الجهة)، والحمام في الطرف الآخر
    if (spans.length && p.block.kind === 'suite' && suiteVariant(p.block, sideLen(p.r, p.door), isX(p.door) ? W_(p.r) : H_(p.r)).deep) {
      const e0 = edgeOf(p.r, p.door), seg = VEST_MIN + .2;
      const endC = end => { const lo = end === perp[0] ? e0.from : e0.to - seg, hi = lo + seg; return Math.max(0, ...spans.map(e => Math.min(hi, e.to) - Math.max(lo, e.from))); };
      const c0 = endC(perp[0]), c1 = endC(perp[1]);
      if (Math.max(c0, c1) >= 1.05 && Math.min(c0, c1) < 1.05) { stripSide.set(p, c0 >= c1 ? perp[1] : perp[0]); continue; }
    }
    // (الجولة الحادية عشرة) الدور العلوي: شريط الحمام على الجهة التي تقع فوق فراغ رطب أو خدمي في الأرضي (مطبخ، دورة مياه، غسيل،
    // خادمة، مخزن) ما أمكن — لمسارات الصرف؛ تفضيل لا شرط (الجهة الأخرى تبقى إن لم يكن تحت أي منهما رطب)
    if (below && p.block.kind === 'suite') {
      const t0 = p.block.master ? T.masterStripD : T.stripD, wet = below.filter(q => ['bath', 'kitchen', 'laundry', 'service', 'storage'].includes(q.type));
      const ov = sd => { const [st] = cut(p.r, sd, t0); return sum(wet.map(q => Math.max(0, Math.min(st.x1, q.x1) - Math.max(st.x0, q.x0)) * Math.max(0, Math.min(st.y1, q.y1) - Math.max(st.y0, q.y0)))); };
      // (الجولة الثامنة عشرة) ولا فوق فراغ «جاف» حساس: المجلس والطعام والمدخل (المراجع المستقل r17، C7: حمام فوق الطعام والمجلس والمدخل)
      const dry = !R18_WETSTRIP ? [] : below.filter(q => ['majlis', 'dining', 'entrance'].includes(q.type));
      const ovd = sd => { const [st] = cut(p.r, sd, t0); return sum(dry.map(q => Math.max(0, Math.min(st.x1, q.x1) - Math.max(st.x0, q.x0)) * Math.max(0, Math.min(st.y1, q.y1) - Math.max(st.y0, q.y0)))); };
      const o0 = ov(perp[0]) - ovd(perp[0]), o1 = ov(perp[1]) - ovd(perp[1]);
      if (Math.abs(o0 - o1) >= 1.2) { stripSide.set(p, o0 > o1 ? perp[0] : perp[1]); continue; }
    }
    const already = perp.find(s => suites.some(q => q !== p && stripSide.get(q) === opp[s] && Math.abs(p.r[s] - q.r[opp[s]]) < TOL && touch(p.r, q.r) > 1));
    if (already) { stripSide.set(p, already); continue; }
    const mate = perp.find(s => suites.some(q => q !== p && !stripSide.has(q) && Math.abs(p.r[s] - q.r[opp[s]]) < TOL && touch(p.r, q.r) > 1));
    const interior = perp.find(s => !isExtSide(p.r, s));
    stripSide.set(p, away || mate || interior || perp[0]);
  }
  let pendingGuestWc = null; const pendingService = [];
  for (const p of placed) detail(p);
  // (الجولة الثانية عشرة) حمام الخادمة الافتراضي لم يتسع في غرفتها: غرفة الغسيل التي أضافها المولّد بجوارها (لا غسيل طلبه العميل)
  // تصير «حمام الخادمة والغسيل» يُفتح من غرفتها؛ وإلا يُذكر أنه لم يتسع
  for (const p of placed.filter(q => q.block.kind === 'maid' && q.block._needBath)) {
    delete p.block._needBath;
    const mr = rooms.find(x => x.id === p.block.id), ln = mr && rooms.find(x => x.id === 'svc-laundry' && touch(mr, x) >= 1.2 && Math.min(W_(x), H_(x)) >= 1.65);
    if (ln && !P.kitchenStrip?.includes('laundry')) {
      Object.assign(ln, { type: 'bath', name: 'حمام الخادمة والغسيل', kind: 'bath', maidBath: true });
      for (let i = doors.length - 1; i >= 0; i--) if (doors[i].a === ln.id || doors[i].b === ln.id) doors.splice(i, 1);
      const e = shared(ln, mr); doors.push({ a: ln.id, b: mr.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .8 });
      notes.push('غرفة الخادمة بحمامها (مع الغسيل) بجوارها (قيمة تصميمية افتراضية للميزان).');
    } else notes.push('حمام الخادمة (قيمة تصميمية افتراضية للميزان) لم يتسع في غرفتها في هذا البديل.');
  }
  for (const m of pendingService) {
    // (الجولة العاشرة) باب خدمة من المجلس إلى الطعام فقط إن طلبه العميل («مقلط»، «المجلس على الطعام»)؛ ولا إلى المطبخ أبدًا
    const host = P.majlisDining || P.majlisDiningDefault ? rooms.find(x => x.kind === 'dining' && touch(m, x) >= 1.2) : null;
    // (الجولة الثانية عشرة) المقلط الافتراضي (قيمة تصميمية افتراضية للميزان): الطعام يُسمّى «والمقلط» ويُغلق على العائلة بباب
    if (host && !P.majlisDining) { host.name = host.name.replace(/^صالة الطعام$/, 'صالة الطعام والمقلط'); host.mizanDining = true; }
    if (host) { const e = shared(m, host); doors.push({ a: m.id, b: host.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .9 }); host.guestDoor = true; notes.push(`مجلس الرجال بمدخل خارجي مستقل${m.noWc ? '' : ' ودورة مياه خاصة'}، ولا يمر الضيف بالعائلة؛ له باب خدمة إلى «${host.name}» للضيافة.`); }
    else notes.push(`مجلس الرجال بمدخل خارجي مستقل${m.noWc ? '' : ' ودورة مياه خاصة'}، ومنفصل تمامًا عن العائلة (بلا باب داخلي).${P.majlisDiningDefault ? ' المقلط (باب الضيافة إلى الطعام، قيمة تصميمية افتراضية للميزان) لم يتحقق: الطعام لا يجاور المجلس في هذا البديل.' : ''}`);
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
  // (الجولة الثالثة عشرة) مطبخ أكبر من سقفه الافتراضي (KIT_MAX_NET صافيًا) بلا مقاس من العميل ولا شريط مطلوب — فائض الغلاف (الدورين خاصة)
  // لا يُترك مطبخًا بطول 8 م: يُقتطع من طرفه البعيد عن بابه وعن الطعام غرفة غسيل ومخزن تُفتح من المطبخ (قيمة تصميمية افتراضية للميزان)
  else if (kit && !upper && !kit.dimLocked && !P.dims?.kitchen) { const before = (W_(kit) - WALL_NET) * (H_(kit) - WALL_NET); if (kitchenUtility(kit)) notes.push(`المطبخ كان ${r2(before)} م² صافيًا (فوق السقف الافتراضي ${KIT_MAX_NET} م²) فاقتُطع من طرفه غرفة غسيل ومخزن تُفتح منه (قيمة تصميمية افتراضية للميزان).`); }
  for (const kind of ['kitchen', 'family', 'dining']) for (const host of rooms.filter(r => r.kind === kind && !r.dimLocked)) { if (extraBaths <= 0) break; if (bathStrip(host)) extraBaths--; }
  if (extraBaths > 0) notes.push(`${extraBaths} دورة مياه إضافية لم تجد موضعًا مناسبًا في هذا البديل.`);
  // (الجولة الثانية عشرة) دورة مياه يومية تُدخل من الصالة أو البهو (قيمة تصميمية افتراضية للميزان) إن لم يكن في المخطط دورة مياه على
  // الحركة العائلية: تُقتطع من البهو العريض، وإلا شريطًا بممر من جانب الطعام أو الصالة العائلية أو المطبخ
  if (P.dayWc && !upper) {
    const famCirc = id => { const r = rooms.find(x => x.id === id); return !!r && (r.circ ? !bedTouch(r) || r.id === 'hall' || r.id === 'foyer' : r.kind === 'lobby' && !r.zone); };
    const has = rooms.some(r => r.type === 'bath' && doors.some(d => d.b && ((d.a === r.id && famCirc(d.b)) || (d.b === r.id && famCirc(d.a)))));
    let done = has ? 'existing' : null;
    if (!done && foyer && dayWcFoyer()) done = 'foyer';
    if (!done && foyer && !R14_OFF.has('wcend') && dayWcFoyerEnd()) done = 'foyer';
    if (!done) for (const kind of ['dining', 'family', 'kitchen']) {
      const host = rooms.find(r => r.kind === kind && !r.dimLocked); if (!host) continue;
      // محاولة قابلة للتراجع: إن لم يتصل ممر دورة المياه بالحركة يُعاد كل شيء كما كان (لا فراغ معزول)
      const snapR = rooms.length, snapD = doors.map(d => d), hr = { x0: host.x0, x1: host.x1, y0: host.y0, y1: host.y1 };
      if (bathStrip(host)) {
        const lob = rooms[rooms.length - 1], ok = doors.some(d => d.b && (d.a === lob.id || d.b === lob.id) && [d.a, d.b].some(x => rooms.find(q => q.id === x)?.circ));
        if (ok) { done = kind; rooms[rooms.length - 2].day = true; break; }
        rooms.length = snapR; doors.length = 0; doors.push(...snapD); Object.assign(host, hr);
      }
    }
    // (الجولة الثالثة عشرة) وإلا من طرف الصالة البعيد عن المدخل (دورة مياه الصالة وخزانة بجانبها): أوسع تغطية في الأنماط التي بهوها ضيق
    if (!done) { const hall = rooms.find(r => r.id === 'hall'); if (hall && dayWcHall(hall)) done = 'hall'; }
    if (done && done !== 'existing') notes.push('دورة مياه يومية تُدخل من ' + (done === 'foyer' ? 'بهو المدخل' : done === 'hall' ? 'طرف الصالة البعيد عن المدخل (وبجانبها خزانة)' : 'ممر بجانب ' + (done === 'kitchen' ? 'المطبخ' : done === 'dining' ? 'الطعام' : 'الصالة العائلية')) + ' (قيمة تصميمية افتراضية للميزان).');
    else if (!done) notes.push('لم تتسع دورة مياه يومية تُدخل من الصالة أو البهو في هذا البديل (قيمة تصميمية افتراضية للميزان لم تتحقق).');
  }
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
    // (الجولة التاسعة عشرة) دهليز الرجال قبل المجلس نفسه: الباب الخارجي لا يُفتح على المجلس مباشرة متى لامس الدهليز تلك الجهة
    const prefer = [...circRooms.filter(c => ['foyer', 'hall', 'stair'].includes(c.id)), ...rooms.filter(r => r.kind === 'lobby'), ...rooms.filter(r => ['majlis', 'family', 'dining'].includes(r.kind))];
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
  // (الجولة الثانية عشرة) مدخل العائلة منكسر (قيمة تصميمية افتراضية للميزان): لا خط رؤية مستقيم من الباب الخارجي إلى الصالة —
  // الباب والفتحة المقابلة له في طرفين متقابلين من البهو (كسرة)، وإن لم يتسع البهو لذلك تصير الفتحة بابًا يُغلق (حاجز بصري)
  if (foyer && !upper) screenEntry();
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

  function screenEntry() {
    const E = doors.find(d => d.a === 'foyer' && d.entry && !d.b); if (!E) return;
    const fe = { from: foyer.x0, to: foyer.x1 };
    const back = doors.filter(d => d.b && (d.a === 'foyer' || d.b === 'foyer') && d.kind === 'arch' && d.edge?.axis === 'y' && Math.abs(d.edge.at - foyer.y1) < TOL);
    if (!back.length) { foyer.entryScreen = 'side'; return; }
    E.w = Math.min(E.w ?? 1.4, 1.4);
    const span = (d, pos) => [pos - d.w / 2, pos + d.w / 2];
    let worst = 'dogleg';
    for (const O of back) {
      O.w = Math.min(O.w ?? 1.4, 1.4);
      const oLo = O.edge.from + .15 + O.w / 2, oHi = O.edge.to - .15 - O.w / 2, eLo = fe.from + .15 + E.w / 2, eHi = fe.to - .15 - E.w / 2;
      if (oHi < oLo - 1e-6 || eHi < eLo - 1e-6) continue;
      const opts = [[eLo, oHi], [eHi, oLo]].map(([ep, op]) => { const a = span(E, ep), b = span(O, op); return { ep, op, gap: Math.max(b[0] - a[1], a[0] - b[1]) }; }).sort((x, y) => y.gap - x.gap);
      const cur = (() => { const ep = E.pos ?? (fe.from + fe.to) / 2, op = O.pos ?? (O.edge.from + O.edge.to) / 2, a = span(E, ep), b = span(O, op); return Math.max(b[0] - a[1], a[0] - b[1]); })();
      if (cur >= .25) continue;
      if (opts[0].gap >= .25) { E.pos = opts[0].ep; O.pos = opts[0].op; continue; }
      // البهو أضيق من كسرة: الفتحة باب داخلي يُغلق، في الطرف الأبعد عن الباب الخارجي
      O.kind = 'door'; O.w = Math.min(1.0, O.w); E.pos = opts[0].ep; O.pos = opts[0].op; worst = 'door';
    }
    foyer.entryScreen = worst;
    notes.push(worst === 'door' ? 'مدخل العائلة: البهو أضيق من كسرة، فالفتحة إلى الداخل باب يُغلق في الطرف الأبعد عن الباب الخارجي (حاجز بصري، قيمة تصميمية افتراضية للميزان).' : 'مدخل العائلة منكسر: الباب الخارجي والفتحة إلى الداخل في طرفين متقابلين من البهو، فلا يُرى الداخل من الباب (قيمة تصميمية افتراضية للميزان).');
  }
  function circDoor(id, r, side, kind, w, prefer) {
    const priv = /^suite|bath|vest|maid/.test(id);
    const spansOn = sd => circRooms.map(c => { const s = shared(r, c); return s && s.side === sd ? { ...s, cid: c.id } : null; }).filter(Boolean);
    const okLen = sp => sp.to - sp.from >= Math.min(w, .8) + 2 * (JUNC_CLEAR + .06);
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
    let pos = prefer === undefined || prefer === null ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, prefer));
    // (الجولة التاسعة) غرفة نوم تفتح على الصالة العائلية: الباب في طرف الجدار المشترك لا في وسطه (خصوصية)
    if (priv && best.cid === 'hall' && Math.min(pos - best.from, best.to - pos) > HALL_DOOR_OFFSET - .1) pos = pos - lo <= hi - pos ? lo : hi;
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
        if (b.bath) { const [strip] = cut(r, isX(side) ? 'y1' : 'x1', 1.6); const bt = add(strip, { id: b.id + '-bath', type: 'bath', name: bathName, kind: 'bath', door: isX(side) ? 'y0' : 'x0' }); const e = shared(bt, room); if (e) doors.push({ a: bt.id, b: room.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: GUEST_WC_DOOR }); }
        const e = edges(room, true).sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
        if (e && e.to - e.from >= 1.2) doors.push({ a: room.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: .9, service: true, entry: true });
        else { circDoor(room.id, room, side, 'door', .9); notes.push('غرفة السائق لم تلامس جدارًا خارجيًا فوُصلت بالداخل؛ يُفضّل نقلها لمدخل خارجي.'); }
        return;
      }
      if (!b.bath && b.mizanBath) {
        // (الجولة الثانية عشرة) حمام الخادمة الافتراضي: شريط 1.5 م على الجهة المقابلة لبابها (أو عمودية عليها) إن بقيت الغرفة ≥ 2.9 م محورًا
        const MBW = 1.65; // حمام صافيه ≥ 1.4 م
        const cand = [opp[side], ...(isX(side) ? ['y0', 'y1'] : ['x0', 'x1'])].filter(sd => (isX(sd) ? W_(r) : H_(r)) - MBW >= MAID_MIN_NET + WALL_NET && sideLen(r, sd) >= 1.9);
        const sd = cand.find(z => !isExtSide(r, z)) || cand[0];
        if (sd) {
          const [strip, rest] = cut(r, sd, MBW), L = sideLen(r, sd);
          const [bathR, storeR] = L - 2.2 >= 1.5 ? split(strip, isX(sd) ? (isExtSide(r, 'y1') ? 'y1' : 'y0') : (isExtSide(r, 'x1') ? 'x1' : 'x0'), 2.2) : [strip, null];
          const bed = add(storeR ? { ...rest } : rest, { id: b.id, type, name: b.name, kind: 'maid', door: side });
          const bath = add(bathR, { id: b.id + '-bath', type: 'bath', name: 'حمام الخادمة', kind: 'bath', door: opp[sd], far: sd });
          const eb = shared(bath, bed); if (eb) doors.push({ a: bath.id, b: bed.id, edge: eb, pos: (eb.from + eb.to) / 2, kind: 'door', w: .8 });
          if (storeR) { const st = add(storeR, { id: b.id + '-store', type: 'storage', name: 'خزانة', kind: 'dress', door: opp[sd] }); const es = shared(st, bed); if (es) doors.push({ a: st.id, b: bed.id, edge: es, pos: (es.from + es.to) / 2, kind: 'door', w: Math.min(.8, es.to - es.from - .3) }); }
          connect(bed, side); notes.push('غرفة الخادمة بحمامها (قيمة تصميمية افتراضية للميزان).'); return;
        }
        b._needBath = true;
      }
      if (!b.bath) { const bed = add(r, { id: b.id, type, name: b.name, kind: b.kind === 'maid' ? 'maid' : 'suite', door: side }); connect(bed, side); return; }
      const ss0 = stripSide.get(p) || (isX(side) ? 'y1' : 'x1'), t0 = b.master ? T.masterStripD : b.kind === 'maid' ? 1.6 : T.stripD;
      const bl0 = b.master ? T.masterBathL : b.kind === 'suite' ? T.bathL : 2.2, closetMax = b.master ? 3.4 : b.kind === 'suite' ? 2.6 : 1.4;
      void closetMax;
      // (الجولة التاسعة) الرئيسية أكبر من حدها (24 م² أرضيًا، 26 م² علويًا) ما لم تُطلب كبيرة: الزائد يذهب إلى شريط الحمام وغرفة
      // الملابس (غرفة ملابس أعمق)، لا إلى غرفة النوم — حتى 1.4 م، والغرفة لا يضيق ضلعها عن 3.5 م
      const grow = (cs, base) => {
        if (!b.master || masterAsked(P)) return base;
        const cap = (upper ? MASTER_UP_MAX : MASTER_GROUND_MAX) - .3, rest = cut(r, cs, base)[1], net = (W_(rest) - WALL_NET) * (H_(rest) - WALL_NET);
        if (net <= cap) return base;
        const along = sideLen(r, cs), depth = isX(cs) ? W_(rest) : H_(rest);
        const dt = Math.min(1.4, depth - 3.5, (net - cap) / Math.max(1, along - WALL_NET) + .05);
        return dt > .05 ? snap(base + dt) : base;
      };
      if (suiteVariant(b, sideLen(r, side), sideLen(r, ss0)).deep) {
        const td = grow(side, b.master ? 2.4 : 2.1);
        const [strip, rest] = cut(r, side, td);
        const near = ss0;
        // (الجولة العاشرة) حمام الرئيسية ≤ 7 م² صافيًا ما لم تُطلب كبيرة: الزائد من الشريط لغرفة الملابس
        const bathCap = b.master && !masterAsked(P) ? MASTER_BATH_MAX / Math.max(.5, td - WALL_NET) + WALL_NET : Infinity;
        let bLen = Math.max(1.8, Math.min(bl0, sideLen(r, side) - VEST_MIN, bathCap));
        // (الجولة الثامنة عشرة) غرفة الملابس التي يُمشى عبرها ≥ 1.6 م صافيًا (قيمة تصميمية افتراضية للميزان؛ المراجع المستقل r17: «غرفة
        // الملابس» 1.28 م في C8-1 وC10-1 ممر لا غرفة): يُقصر الحمام إن بقي ≥ 1.8 م و≥ 4 م² صافيًا؛ وإلا فهي «مدخل الجناح» بصدق
        let dressOK = true;
        if (b.master && !R14_OFF.has('r18dress')) { const needV = 1.6 + WALL_NET + .01, Ls = sideLen(r, side);
          if (Ls - bLen < needV) { const b2 = snap(Ls - needV - SNAP / 2); if (b2 >= 1.8 - 1e-6 && (b2 - WALL_NET) * (td - WALL_NET) >= 4.0) bLen = b2; else dressOK = false; } }
        const [bathR, vestR] = split(strip, near, bLen);
        const bed = add(rest, { id: b.id, type, name: b.name, kind: b.kind === 'maid' ? 'maid' : 'suite', door: opp[side], strip: side });
        if (b.master && !dressOK) notes.push(P.prefs?.masterDressing ? `غرفة ملابس الرئيسية المطلوبة أضيق من 1.6 م صافيًا في هذا البديل (قيمة تصميمية افتراضية للميزان): يُمشى عبرها إلى الغرفة والحمام.` : 'مدخل جناح الرئيسية أضيق من أن يكون غرفة ملابس (1.6 م صافيًا، قيمة تصميمية افتراضية للميزان)، فسُمّي مدخل الجناح.');
        const vest = add(vestR, b.master && (dressOK || P.prefs?.masterDressing) ? { id: b.id + '-vest', type: 'storage', name: 'غرفة الملابس', kind: 'dress', door: side, walk: true } : { id: b.id + '-vest', type: 'corridor', name: b.kind === 'maid' ? 'مدخل الخادمة' : 'مدخل الجناح', kind: 'vest', door: side });
        const bath = add(bathR, { id: b.id + '-bath', type: 'bath', name: bathName || ('حمام ' + (b.master ? 'الرئيسية' : b.name.replace('غرفة نوم ', 'غرفة '))), kind: 'bath', door: opp[near], far: near });
        const ev = edgeOf(vest, side);
        if (b.kind === 'maid') { if (!hostDoor(vest, ['kitchen']) && !circDoor(vest.id, vest, side, 'door', .9, (ev.from + ev.to) / 2) && !hostDoor(bed, ['kitchen'])) circDoor(bed.id, bed, opp[side], 'door', .9); } else circDoor(vest.id, vest, side, 'door', .95, (ev.from + ev.to) / 2);
        const eb2 = shared(vest, bed); if (eb2) doors.push({ a: bed.id, b: vest.id, edge: eb2, pos: (eb2.from + eb2.to) / 2, kind: 'arch', w: Math.min(1.1, eb2.to - eb2.from - .3) });
        if (b.bathShared) { bath.name = 'دورة مياه مشتركة'; const eb = edgeOf(bath, side); circDoor(bath.id, bath, side, 'door', .8, (eb.from + eb.to) / 2); }
        else { const eb3 = shared(bath, vest); if (eb3) doors.push({ a: bath.id, b: vest.id, edge: eb3, pos: (eb3.from + eb3.to) / 2, kind: 'door', w: .8 }); }
        return;
      }
      const ss = ss0, L = sideLen(r, ss);
      let t = grow(ss0, t0);
      // (الجولة الثانية عشرة) شريط الرئيسية القصير لا يتسع لحمام وغرفة ملابس: عمقه بقدر حمام ≤ 7 م² صافيًا (لا حمام متضخم)
      if (b.master && !masterAsked(P) && L - (b.master ? T.masterBathL : T.bathL) < .95 && (L - WALL_NET) * (t - WALL_NET) > MASTER_BATH_MAX) t = Math.max(1.8, Math.floor((MASTER_BATH_MAX / Math.max(.5, L - WALL_NET) + WALL_NET) / SNAP) * SNAP);
      let bl = b.master && L - bl0 < 1.5 && L - 2.4 >= 1.5 ? L - 1.5 : Math.min(bl0, L);
      // (الجولة الرابعة عشرة) غرفة ملابس حقيقية للرئيسية الكبيرة (> 20 م²): ≥ 2.0 × 2.5 م صافيًا (قيمة تصميمية افتراضية للميزان؛
      // المراجع المستقل r13: غرف ملابس رمزية 1.38 × 2.02) — يتعمق الشريط إلى 2.25 م ويُقصر الحمام إن بقيت الغرفة ≥ 16 م² وضلعها ≥ 3.4 م
      // (الجولة السابعة عشرة) وحين يطلب العميل «ماستر بغرفة ملابس»: غرفة ملابس ≥ 4.5 م² صافيًا (DRESS_ASKED_NET، قيمة تصميمية افتراضية
      // للميزان يغلبها مقاس العميل) أيًّا كانت مساحة الرئيسية، ما بقيت الغرفة ≥ 14.5 م² صافيًا وضلعها ≥ 3.4 م (المراجع المستقل r16: 2.5–2.9 م²)
      if (b.master && !masterAsked(P) && !R14_OFF.has('dress')) {
        const askedD = !!P.prefs?.masterDressing && !R14_OFF.has('r17dress');
        const tD = 2.25, needL = 2.7, r0 = cut(r, ss, t)[1], restT = cut(r, ss, Math.max(t, tD))[1];
        const big = (W_(r0) - WALL_NET) * (H_(r0) - WALL_NET) > 20, rn = (W_(restT) - WALL_NET) * (H_(restT) - WALL_NET), rmin = Math.min(W_(restT), H_(restT)) - WALL_NET;
        let done = false;
        if ((big && rn >= 16 || askedD && rn >= 14.5) && rmin >= 3.4) { let bl2 = bl; if (L - bl2 < needL && L - needL >= 1.9) bl2 = snap(L - needL); if (L - bl2 >= needL - 1e-6) { t = Math.max(t, tD); bl = bl2; done = true; } }
        // المطلوبة ولم تتسع بالعمق 2.25 م: شريط أعمق (حتى 2.9 م) بطول أقصر — الحمام لا يقصر عن 1.9 م ولا يصغر عن 4 م²
        if (askedD && !done) for (const nl of [2.5, 2.3, 2.1]) {
          if (L - nl < 1.9 - 1e-6) continue;
          const tN = snap(DRESS_ASKED_NET / (nl - WALL_NET) + WALL_NET + .02), t2 = Math.max(t, tN); if (t2 > 2.9) continue;
          if ((L - nl - WALL_NET) * (t2 - WALL_NET) < 4.0) continue; // وحمام الرئيسية لا يصغر عن 4 م² صافيًا
          const rT = cut(r, ss, t2)[1], rn2 = (W_(rT) - WALL_NET) * (H_(rT) - WALL_NET), rm2 = Math.min(W_(rT), H_(rT)) - WALL_NET;
          if (rn2 < 14.5 || rm2 < 3.4) continue;
          t = t2; bl = Math.min(bl, snap(L - nl)); done = true; break;
        }
      }
      const [strip, rest] = cut(r, ss, t);
      // (الجولة العاشرة) حمام الرئيسية ≤ 7 م² صافيًا ما لم تُطلب كبيرة: الزائد لغرفة الملابس (إن بقي لها ≥ 1.5 م)
      // (الجولة الثانية عشرة) وإن بقي أقل من 1.5 م وأكثر من 0.95 م: الزائد خزانة صغيرة تُفتح من الغرفة (لا حمام متضخم)
      if (b.master && !masterAsked(P)) { const cap = Math.max(1.8, MASTER_BATH_MAX / Math.max(.5, t - WALL_NET) + WALL_NET); if (bl > cap && L - cap >= .95) bl = Math.floor(cap / SNAP) * SNAP; }
      const [bathR, closetR] = L - bl >= (b.master ? .95 : 1.5) ? split(strip, b.bathShared ? side : opp[side], bl) : [strip, null];
      const bed = add(rest, { id: b.id, type, name: b.name, kind: b.kind === 'maid' ? 'maid' : 'suite', door: side, strip: ss });
      const bath = add(bathR, { id: b.id + '-bath', type: 'bath', name: bathName || ('حمام ' + (b.master ? 'الرئيسية' : b.name.replace('غرفة نوم ', 'غرفة '))), kind: 'bath', door: ss, far: side });
      const ed = edgeOf(bed, side), nearStrip = (ss === 'x0' || ss === 'y0') ? ed.from : ed.to;
      connect(bed, side, b.bathShared ? (nearStrip === ed.from ? ed.to - .65 : ed.from + .65) : nearStrip + (nearStrip === ed.from ? .65 : -.65));
      if (b.bathShared) { bath.name = 'دورة مياه مشتركة'; bath.far = opp[side]; const ebs = edgeOf(bath, side); circDoor(bath.id, bath, side, 'door', .8, (ebs.from + ebs.to) / 2); }
      else { const eb = shared(bath, bed); if (eb) { const at = edgeOf(r, side).at, pos = Math.abs(eb.from - at) < Math.abs(eb.to - at) ? eb.from + .55 : eb.to - .55; doors.push({ a: bath.id, b: b.id, edge: eb, pos, kind: 'door', w: .8 }); } }
      if (closetR) {
        // (الجولة السابعة عشرة) تسمية صادقة: خزانة الرئيسية الصغيرة (< 4 م² صافيًا) «خزانة ملابس الرئيسية» لا «غرفة ملابس» ما لم يطلب العميل
        // غرفة ملابس (فيبقى اسمها ويُذكر نقصها عن 4.5 م² في ملاحظات البديل)
        const clNet = (W_(closetR) - WALL_NET) * (H_(closetR) - WALL_NET), smallCl = b.master && clNet < DRESS_ROOM_NET && !P.prefs?.masterDressing && !R14_OFF.has('r17dress');
        const cl = add(closetR, { id: b.id + '-dress', type: 'storage', name: b.master ? (smallCl ? 'خزانة ملابس الرئيسية' : 'غرفة ملابس') : b.kind === 'suite' ? 'خزانة ملابس' : 'خزانة', kind: 'dress', door: ss });
        if (b.master && P.prefs?.masterDressing && clNet < DRESS_ASKED_NET - .05) notes.push(`غرفة الملابس المطلوبة ${r2(clNet)} م² صافيًا — أقل من ${DRESS_ASKED_NET} م² (قيمة تصميمية افتراضية للميزان): لم يتسع جناح الرئيسية في هذا البديل لأكثر منها دون أن تضيق الغرفة.`);
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
      // (الجولة الثانية عشرة) باب خدمة من المطبخ إلى الحوش (قيمة تصميمية افتراضية للميزان) متى لامس جدارًا خارجيًا غير الواجهة ≥ 1.6 م
      if (ext && ext.to - ext.from >= 1.6 && !upper && b.id === 'kitchen1') doors.push({ a: k.id, edge: ext, pos: ext.to - Math.min(.7, (ext.to - ext.from) / 2), kind: 'door', w: .9, service: true });
      else if (!upper && b.id === 'kitchen1') notes.push('المطبخ بلا باب خدمة إلى الحوش في هذا البديل: لا يلامس جدارًا خارجيًا خلفيًا أو جانبيًا (قيمة تصميمية افتراضية للميزان لم تتحقق).');
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
      // (الجولة التاسعة عشرة؛ المراجع المستقل r18: C3-1) المدخل الثاني للأرض على جهة المجلس (أرض زاوية): شريط الدهليز على تلك الجهة الخارجية،
      // فيدخل الضيف من الشارع الثاني إلى الدهليز لا إلى المجلس مباشرة
      const side2 = !upper && secondEntry && ['x0', 'x1'].includes(secondEntry) && isExtSide(r, secondEntry) && !R14_OFF.has('r19lobby2') ? secondEntry : null;
      const stripSide = side2 || interiorX.sort((a, c) => Math.abs(r[a] - fx) - Math.abs(r[c] - fx))[0] || (fx > (r.x0 + r.x1) / 2 ? 'x1' : 'x0');
      const L2 = sideLen(r, stripSide), restW = W_(r) - T.guestStripW;
      // (الجولة التاسعة عشرة، توجيه المالك رابعًا) مقاس المجلس الصريح: الشريط (الدهليز ودورة المياه) يأخذ الزائد فيبلغ المجلس الصافي مقاس
      // العميل ضلعًا ضلعًا (±0.05 م) — لا يُقبل «قريب بالمساحة»
      const hf = z => (isExtSide(r, z) ? EXT / 2 : INT / 2), dmj = P.dims?.majlis && b === (P.men || P.blocks.find(x => x.kind === 'majlis')) ? [Math.min(P.dims.majlis.w, P.dims.majlis.l), Math.max(P.dims.majlis.w, P.dims.majlis.l)] : null;
      const fitStrip = (span, other, base, lo, hi) => { if (!dmj) return base; const want = Math.abs(other - dmj[0]) <= Math.abs(other - dmj[1]) ? dmj[1] : dmj[0], d = span - want; return d >= lo - 1e-6 && d <= hi + 1e-6 ? Math.round(d * 1000) / 1000 : base; };
      if (front && b.guestWc && menStrip(r, P).side === 'side' && L2 >= T.guestWcL + 1.6 && restW >= 3.4) {
        const sw = fitStrip(W_(r) - hf(opp[stripSide]) - INT / 2, H_(r) - hf('y0') - hf('y1'), T.guestStripW, T.guestStripW, T.guestStripW + .9);
        const [strip, rest] = cut(r, stripSide, sw);
        const [lobbyR, wcR] = split(strip, 'y0', L2 - T.guestWcL);
        const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
        const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: 'مدخل الرجال', kind: 'lobby', door: 'y0', zone: 'men' });
        const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: 'دورة مياه الرجال', kind: 'wc', door: 'y0', far: 'y1', zone: 'men' });
        doors.push({ a: lobby.id, edge: { axis: 'y', at: lobby.y0, from: lobby.x0, to: lobby.x1 }, pos: (lobby.x0 + lobby.x1) / 2, kind: 'door', w: Math.min(1.1, W_(lobby) - .3), entry: true, men: true });
        const em = shared(m, lobby); if (em) doors.push({ a: m.id, b: lobby.id, edge: em, pos: em.from + Math.min(1.2, (em.to - em.from) / 2), kind: 'arch', w: Math.min(1.4, em.to - em.from - .4) });
        const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: GUEST_WC_DOOR });
        pendingService.push(m);
      } else if (front) {
        // (الجولة الثانية عشرة) دهليز الرجال: شريط أمامي بعمق 1.6 م فيه المدخل والمغاسل ودورة المياه، والمجلس خلفه بفتحة لا تقابل
        // الباب الخارجي — لا يفتح الباب الخارجي على المجلس مباشرة (قيمة تصميمية افتراضية للميزان)
        const canFront = H_(r) - MEN_LOBBY_D >= 3.6 && W_(r) >= (b.guestWc ? T.guestWcL + 1.5 : 2.4);
        if (canFront) {
          const ld = fitStrip(H_(r) - INT / 2 - hf('y1'), W_(r) - hf('x0') - hf('x1'), MEN_LOBBY_D, MEN_LOBBY_D, MEN_LOBBY_D + .9);
          const [strip, rest] = cut(r, 'y0', ld);
          const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
          const extX = ['x0', 'x1'].filter(z => isExtSide(r, z)), wcEnd = b.guestWc ? (extX.length === 1 ? extX[0] : (Math.abs(r.x0 - fx) > Math.abs(r.x1 - fx) ? 'x0' : 'x1')) : null;
          const [wcR, lobbyR] = wcEnd ? split(strip, wcEnd, T.guestWcL) : [null, strip];
          const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: 'مدخل الرجال', kind: 'lobby', door: 'y0', zone: 'men', menLobby: true });
          // الباب الخارجي في طرف الدهليز البعيد عن دورة المياه، والفتحة إلى المجلس في طرفه الآخر (مدخل منكسر)
          const lw = W_(lobby), dw = Math.min(1.1, lw - .4), farEnd = wcEnd === 'x0' ? lobby.x1 : wcEnd === 'x1' ? lobby.x0 : lobby.x0;
          const dPos = farEnd === lobby.x1 ? lobby.x1 - .15 - dw / 2 : lobby.x0 + .15 + dw / 2;
          doors.push({ a: lobby.id, edge: { axis: 'y', at: lobby.y0, from: lobby.x0, to: lobby.x1 }, pos: dPos, kind: 'door', w: dw, entry: true, men: true });
          const em = shared(m, lobby); if (em) { const aw = Math.min(1.4, em.to - em.from - .4), aPos = farEnd === lobby.x1 ? Math.max(em.from + .2 + aw / 2, Math.min(em.to - .2 - aw / 2, dPos - dw / 2 - .3 - aw / 2)) : Math.min(em.to - .2 - aw / 2, Math.max(em.from + .2 + aw / 2, dPos + dw / 2 + .3 + aw / 2)); doors.push({ a: m.id, b: lobby.id, edge: em, pos: aPos, kind: 'arch', w: aw }); }
          if (wcR) { const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: 'دورة مياه الرجال', kind: 'wc', door: opp[wcEnd], far: wcEnd, zone: 'men' }); const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: GUEST_WC_DOOR }); }
          pendingService.push(m);
        } else {
          const canBack = b.guestWc && H_(r) - 1.5 >= 3.6 && W_(r) >= T.guestWcL + 1.2;
          const [strip, rest] = canBack ? cut(r, 'y1', 1.5) : [null, r];
          const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
          doors.push({ a: m.id, edge: { axis: 'y', at: m.y0, from: m.x0, to: m.x1 }, pos: (m.x0 + m.x1) / 2, kind: 'door2', w: 1.4, entry: true, men: true });
          if (canBack) washStrip(m, strip, 'men');
          pendingService.push(m);
          notes.push('مجلس الرجال بلا دهليز في هذا البديل: لم يتسع شريط الدخول أمامه (قيمة تصميمية افتراضية للميزان لم تتحقق).');
          if (b.guestWc && !canBack) { extraBaths++; m.noWc = true; notes.push('دورة مياه الرجال لم تتسع داخل منطقة المجلس في هذا البديل.'); }
        }
      } else if (sideExt(r)) {
        // مجلس على الواجهة الجانبية: مدخل الرجال المستقل من الارتداد الجانبي، والمغاسل ودورة المياه في شريط داخلي
        const ex = sideExt(r);
        // (الجولة الثانية عشرة) دهليز على الواجهة الجانبية: شريط بعرض 1.6 م على جهة المدخل فيه الدخول ودورة المياه
        const canLobby = W_(r) - MEN_LOBBY_D >= 3.6 && H_(r) >= (b.guestWc ? T.guestWcL + 1.6 : 2.4)
          && edges(cut(r, ex.side, MEN_LOBBY_D)[1]).some(e => e.side !== ex.side && e.to - e.from >= 1.6); // يبقى للمجلس جدار خارجي لنافذته
        if (canLobby) {
          const [strip, rest] = cut(r, ex.side, MEN_LOBBY_D);
          const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
          const wcEnd = b.guestWc ? (isExtSide(r, 'y1') ? 'y1' : 'y0') : null;
          const [wcR, lobbyR] = wcEnd ? split(strip, wcEnd, T.guestWcL) : [null, strip];
          const lobby = add(lobbyR, { id: b.id + '-lobby', type: 'corridor', name: 'مدخل الرجال', kind: 'lobby', door: ex.side, zone: 'men', menLobby: true });
          const le = edges(lobby, true).filter(x => x.side === ex.side).sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
          const dw = le ? Math.min(1.1, le.to - le.from - .4) : 0;
          if (le && dw >= .8) doors.push({ a: lobby.id, edge: le, pos: wcEnd === 'y0' ? le.to - .2 - dw / 2 : le.from + .2 + dw / 2, kind: 'door', w: dw, entry: true, men: true });
          const em = shared(m, lobby); if (em) { const aw = Math.min(1.4, em.to - em.from - .4); doors.push({ a: m.id, b: lobby.id, edge: em, pos: wcEnd === 'y0' ? em.from + .2 + aw / 2 : em.to - .2 - aw / 2, kind: 'arch', w: aw }); }
          if (wcR) { const wc = add(wcR, { id: b.id + '-wc', type: 'bath', name: 'دورة مياه الرجال', kind: 'wc', door: opp[wcEnd], far: wcEnd, zone: 'men' }); const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: GUEST_WC_DOOR }); }
          pendingService.push(m);
          notes.push('مجلس الرجال على الواجهة الجانبية بدهليز ومدخل مستقل من الارتداد الجانبي.');
        } else {
          const canStrip = b.guestWc && H_(r) - 1.5 >= 3.6 && W_(r) >= T.guestWcL + 1.2;
          const ss = canStrip ? (isExtSide(r, 'y1') ? 'y0' : 'y1') : null;
          const [strip, rest] = canStrip ? cut(r, ss, 1.5) : [null, r];
          const m = add(rest, { id: b.id, type: 'majlis', name: b.name, kind: 'majlis', door: side, zone: 'men' });
          const e = edges(m, true).filter(x => x.side === ex.side).sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
          if (e && e.to - e.from >= 1.8) doors.push({ a: m.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door2', w: 1.4, entry: true, men: true });
          if (canStrip) washStrip(m, strip, 'men');
          pendingService.push(m);
          notes.push('مجلس الرجال على الواجهة الجانبية بمدخل مستقل من الارتداد الجانبي (بلا دهليز: لم يتسع).');
          if (b.guestWc && !canStrip) { extraBaths++; m.noWc = true; notes.push('دورة مياه الرجال لم تتسع داخل منطقة المجلس في هذا البديل.'); }
        }
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
      const ew = shared(wc, lobby); if (ew) doors.push({ a: wc.id, b: lobby.id, edge: ew, pos: (ew.from + ew.to) / 2, kind: 'door', w: GUEST_WC_DOOR });
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
    const e2 = shared(wc, wash); if (e2) doors.push({ a: wc.id, b: wash.id, edge: e2, pos: (e2.from + e2.to) / 2, kind: 'door', w: GUEST_WC_DOOR });
  }
  /** دورة مياه يومية في طرف البهو البعيد عن الباب الخارجي (البهو ≥ 3.9 م عرضًا ويبقى ≥ 2.4 م). */
  /**
   * (الجولة الرابعة عشرة) بهو مدخل عائلة طويل ضيق (عمقه ≥ 4.6 م، عرضه 2.1–3.6 م): دورة المياه اليومية في طرفه الخلفي بعرضه كله (1.7 م)
   * إن لم تمر بذلك الجزء فتحة إلى غيره — البهو يبقى ≥ 2.9 م عمقًا. يُعاد كل شيء كما كان إن لم يتسع.
   */
  function dayWcFoyerEnd() {
    const fw = W_(foyer), fd = H_(foyer), dWc = 1.7; if (fd < 4.6 || fw < 2.1 || fw > 3.6) return false;
    const wcR = { ...foyer, y0: foyer.y1 - dWc };
    const hit = doors.some(d => (d.a === 'foyer' || d.b === 'foyer') && d.edge && !d.entry && (d.edge.axis === 'y' ? Math.abs(d.edge.at - foyer.y1) < TOL : (() => { const pos = d.pos ?? (d.edge.from + d.edge.to) / 2; return pos + (d.w || .9) / 2 > wcR.y0 - .15; })()));
    if (hit) return false;
    Object.assign(foyer, { y1: snap(wcR.y0) });
    const wc = add(wcR, { id: 'day-wc', type: 'bath', name: 'دورة مياه', kind: 'wc', door: 'y0', far: 'y1', day: true });
    const e = shared(wc, foyer); if (!e) return false;
    doors.push({ a: wc.id, b: 'foyer', edge: e, pos: e.from + Math.min(.6, (e.to - e.from) / 2), kind: 'door', w: GUEST_WC_DOOR });
    for (const d of doors) if ((d.a === 'foyer' || d.b === 'foyer') && d.b && d.edge && !d.entry && d.b !== wc.id && d.a !== wc.id) { const o = rooms.find(x => x.id === (d.a === 'foyer' ? d.b : d.a)); const e2 = o && shared(foyer, o); if (e2) { d.edge = e2; d.w = Math.min(d.w, e2.to - e2.from - .4); } }
    return true;
  }
  function dayWcFoyer() {
    const fw = W_(foyer), fd = H_(foyer); if (fw < 3.6 || fd < 2.6) return false;
    const E = doors.find(d => d.a === 'foyer' && d.entry && !d.b), ep = E?.pos ?? (foyer.x0 + foyer.x1) / 2;
    const sd = ep < (foyer.x0 + foyer.x1) / 2 ? 'x1' : 'x0';
    const [strip, rest] = cut(foyer, sd, Math.min(1.5, fw - 2.1));
    // دورة المياه في طرف الشريط الخلفي، وما أمامه خزانة للبهو تُفتح عليه (لا يُترك فراغ بلا غرفة)؛ الشريط القصير كله دورة مياه
    const [wcR, frontR] = fd - 2.0 >= 1.3 ? split(strip, 'y1', 2.0) : [strip, null];
    // لا يُقتطع من البهو جزء تمر به فتحة إلى الصالة أو فراغ آخر
    if (doors.some(d => (d.a === 'foyer' || d.b === 'foyer') && d.b && d.edge && (d.edge.axis === 'x' ? Math.abs(d.edge.at - foyer[sd]) < TOL && d.edge.to > wcR.y0 && d.edge.from < wcR.y1 : Math.abs(d.edge.at - foyer.y1) < TOL && d.edge.to > wcR.x0 && d.edge.from < wcR.x1 && (d.pos ?? (d.edge.from + d.edge.to) / 2) > wcR.x0 - .6 && (d.pos ?? (d.edge.from + d.edge.to) / 2) < wcR.x1 + .6))) { return false; }
    Object.assign(foyer, { x0: snap(rest.x0), x1: snap(rest.x1) });
    const wc = add(wcR, { id: 'day-wc', type: 'bath', name: 'دورة مياه', kind: 'wc', door: opp[sd], far: 'y1', day: true });
    const e = shared(wc, foyer); if (!e) return false;
    if (frontR) { const cl = add(frontR, { id: 'foyer-store', type: 'storage', name: 'خزانة', kind: 'store', door: opp[sd] }); const ec = shared(cl, foyer); if (ec) doors.push({ a: cl.id, b: 'foyer', edge: ec, pos: (ec.from + ec.to) / 2, kind: 'door', w: Math.min(.8, ec.to - ec.from - .3) }); }
    doors.push({ a: wc.id, b: 'foyer', edge: e, pos: e.from + .55, kind: 'door', w: GUEST_WC_DOOR });
    const main = doors.find(d => d.entry && d.a === 'foyer'); if (main) main.edge = { axis: 'y', at: foyer.y0, from: foyer.x0, to: foyer.x1 };
    for (const d of doors) if ((d.a === 'foyer' || d.b === 'foyer') && d.b && d.edge && !d.entry && d.b !== wc.id && d.a !== wc.id) { const o = rooms.find(x => x.id === (d.a === 'foyer' ? d.b : d.a)); const e2 = o && shared(foyer, o); if (e2) { d.edge = e2; d.w = Math.min(d.w, e2.to - e2.from - .4); } }
    return true;
  }
  /**
   * دورة مياه يومية في طرف الصالة البعيد عن المدخل: شريط 1.6 م بعرض الصالة يُقسم دورة مياه (2.0 م) وخزانة؛ الصالة تبقى ≥ 4.2 م طولًا
   * ونسبتها ≤ 2.1، ولا باب للصالة على الطرف المقتطع ولا على جانبيه داخل الشريط، ويبقى للصالة جدار خارجي للنافذة.
   */
  function dayWcHall(hall) {
    const longY = H_(hall) >= W_(hall), ends = longY ? ['y0', 'y1'] : ['x0', 'x1'], cross = longY ? W_(hall) : H_(hall), L = longY ? H_(hall) : W_(hall);
    const tw = T.commonStripW; if (cross < 3.9 || L - tw < 4.2) return false;
    const fc = foyer ? { x: (foyer.x0 + foyer.x1) / 2, y: (foyer.y0 + foyer.y1) / 2 } : { x: (hall.x0 + hall.x1) / 2, y: hall.y0 - 1 };
    // الطرف الأبعد عن المدخل أولًا؛ لا الواجهة الأمامية
    const order = [...ends].filter(e => e !== 'y0').sort((a, b) => Math.abs(hall[b] - (isX(b) ? fc.x : fc.y)) - Math.abs(hall[a] - (isX(a) ? fc.x : fc.y)));
    const ax = sd => (isX(sd) ? 'y' : 'x'); // المحور العرضي للشريط
    for (const sd of order) {
      const [strip, rest] = cut(hall, sd, tw);
      if (Math.max(W_(rest), H_(rest)) / Math.min(W_(rest), H_(rest)) > 2.1) { continue; }
      const lo = strip[ax(sd) + '0'], hi = strip[ax(sd) + '1'];
      // أبواب الصالة: على جانبي الشريط ممنوعة؛ وعلى طرفه مسموح بباب واحد يُحفظ له ممر 1.2 م داخل الشريط
      const onEnd = d => d.edge && (isX(sd) ? d.edge.axis === 'x' : d.edge.axis === 'y') && Math.abs(d.edge.at - hall[sd]) < TOL;
      const onSide = d => { if (!d.edge) return false; const side = isX(sd) ? d.edge.axis === 'y' : d.edge.axis === 'x'; if (!side) return false; const pos = d.pos ?? (d.edge.from + d.edge.to) / 2; return pos + d.w / 2 > lo - .1 && pos - d.w / 2 < hi + .1; };
      const hd = doors.filter(d => d.a === 'hall' || d.b === 'hall'), endDoors = hd.filter(onEnd);
      // باب جانبي داخل الشريط يُزاح على الحافة المشتركة الباقية إن اتسعت له، وإلا الطرف ممنوع
      const movable = d => { if (!d.b) return false; const o = rooms.find(x => x.id === (d.a === 'hall' ? d.b : d.a)); const e = o && shared(rest, o); return !!e && e.to - e.from >= d.w + .3; };
      if (hd.some(d => onSide(d) && !movable(d)) || endDoors.length > 1) { continue; }
      // الصالة تبقى بجدار خارجي (أو على حوش) ≥ 1.4 م للنافذة
      if (!edges(rest).some(e => e.to - e.from >= 1.4)) { continue; }
      // تقسيم الشريط على محوره العرضي: [قطعة | ممر عند الباب | قطعة] أو [دورة مياه | خزانة]
      const pieces = [];
      if (endDoors.length) {
        const d = endDoors[0], p = d.pos ?? (d.edge.from + d.edge.to) / 2, pw = Math.max(VEST_MIN + WALL_NET + .06, d.w + .3); // صافي الممر ≥ 1.2 م بعد الجدارين
        let a = Math.max(lo, p - pw / 2), b = Math.min(hi, p + pw / 2); if (b - a < pw - 1e-6) { if (a <= lo + 1e-6) b = lo + pw; else a = hi - pw; }
        // حدا الممر على خطوط جدران الغرف المجاورة للطرف إن قربت (≤ 0.3 م): لا جداران متوازيان على بعد سنتيمترات (كشفه تطابق 2D/3D في C4)
        const k0 = ax(sd) + '0', k1 = ax(sd) + '1', beyond = [...rooms.filter(x => x !== hall), ...courtsR].filter(x => Math.abs(x[opp[sd]] - hall[sd]) < .2), cands = beyond.flatMap(x => [x[k0], x[k1]]);
        // على خط جدار قائم تمامًا، وإلا بعيدًا عنه ≥ 0.3 م (لا جداران متوازيان على بعد سنتيمترات: زاوية شائكة في المسقط والمجسّم)
        const snapTo = (v, min, max) => { let best = null; for (const c of cands) if (Math.abs(c - v) < .3 && (best === null || Math.abs(c - v) < Math.abs(best - v)) && c >= min - 1e-6 && c <= max + 1e-6) best = c; if (best !== null) return best; for (const c of cands) if (Math.abs(c - v) < .3) { const w = c + (v >= c ? .3 : -.3); if (w >= min - 1e-6 && w <= max + 1e-6) return snap(w); } return v; };
        const a2 = snapTo(a, lo, b - pw), b2 = snapTo(b, a2 + pw, hi); a = a2; b = b2;
        const left = a - lo, right = hi - b;
        if (Math.max(left, right) < 1.6) { continue; }
        const big = left >= right ? 'left' : 'right', small = big === 'left' ? right : left;
        // القطعة الصغيرة: خزانة إن اتسعت (≥ 0.8 م) وإلا تُضم إلى الممر
        if (small < .8) { if (big === 'left') b = hi; else a = lo; }
        if (big === 'left') { pieces.push(['wc', lo, a]); pieces.push(['pass', a, b]); if (hi - b >= .8) pieces.push(['store', b, hi]); }
        else { if (a - lo >= .8) pieces.push(['store', lo, a]); pieces.push(['pass', a, b]); pieces.push(['wc', b, hi]); }
      } else {
        const far = isX(sd) ? (fc.y > (hall.y0 + hall.y1) / 2 ? 'y0' : 'y1') : (fc.x > (hall.x0 + hall.x1) / 2 ? 'x0' : 'x1');
        if (far.endsWith('0')) { pieces.push(['wc', lo, lo + 2.0]); pieces.push(['store', lo + 2.0, hi]); } else { pieces.push(['store', lo, hi - 2.0]); pieces.push(['wc', hi - 2.0, hi]); }
        if (hi - lo - 2.0 < 1.2) continue;
      }
      const rectOf = (a, b) => (isX(sd) ? { ...strip, y0: a, y1: b } : { ...strip, x0: a, x1: b });
      const made = [];
      for (const [kind, a, b] of pieces) {
        const r = rectOf(a, b);
        if (kind === 'wc') made.push(add(r, { id: 'day-wc', type: 'bath', name: 'دورة مياه', kind: 'wc', door: opp[sd], far: sd, day: true }));
        else if (kind === 'store') made.push(add(r, { id: 'hall-store', type: 'storage', name: 'خزانة', kind: 'store', door: opp[sd] }));
        else made.push(add(r, { id: 'hall-pass', type: 'corridor', name: 'ممر', kind: 'lobby', circ: true, door: opp[sd] }));
      }
      Object.assign(hall, sn(rest));
      const links = made.map(m => [m, shared(m, hall)]);
      if (links.some(([, e]) => !e || e.to - e.from < .9)) { for (const m of made) rooms.splice(rooms.indexOf(m), 1); Object.assign(hall, sn({ ...rest, [sd]: strip[sd] })); continue; }
      for (const [m, e] of links) {
        if (m.kind === 'wc') doors.push({ a: m.id, b: 'hall', edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: GUEST_WC_DOOR });
        else if (m.kind === 'store') doors.push({ a: m.id, b: 'hall', edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: Math.min(.8, e.to - e.from - .3) });
        else doors.push({ a: 'hall', b: m.id, edge: e, pos: (e.from + e.to) / 2, kind: 'arch', w: Math.min(1.2, e.to - e.from - .2) });
      }
      // باب الطرف (إن وُجد) ينتقل من الصالة إلى الممر
      const pass = made.find(m => m.kind === 'lobby');
      for (const d of endDoors) { const other = rooms.find(x => x.id === (d.a === 'hall' ? d.b : d.a)); const e = other && pass && shared(pass, other); if (!e) { doors.splice(doors.indexOf(d), 1); continue; } if (d.a === 'hall') d.a = pass.id; else d.b = pass.id; d.edge = e; d.pos = (e.from + e.to) / 2; d.w = Math.min(d.w, e.to - e.from - .2); }
      // أبواب الصالة الأخرى على الجدار الذي تغيّر طوله: حافتها تُحدَّث
      for (const d of doors) if ((d.a === 'hall' || d.b === 'hall') && d.b && d.edge && !made.some(m => m.id === d.a || m.id === d.b)) { const o = rooms.find(x => x.id === (d.a === 'hall' ? d.b : d.a)); const e = o && shared(hall, o); if (e) { d.edge = e; d.w = Math.min(d.w, e.to - e.from - .3); const p0 = d.pos ?? (e.from + e.to) / 2; d.pos = Math.min(e.to - d.w / 2 - .15, Math.max(e.from + d.w / 2 + .15, p0)); } }
      return true;
    }
    return false;
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
    doors.push({ a: wc.id, b: 'foyer', edge: e, pos: e.from + .55, kind: 'door', w: GUEST_WC_DOOR });
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
    if (host.kind === 'kitchen' && (Math.min(W_(rest), H_(rest)) < KIT_MIN_AXIS || (W_(rest) - WALL_NET) * (H_(rest) - WALL_NET) < Math.max(KIT_MIN_AREA + .3, P.blocks.find(b => b.id === 'kitchen1')?.minNet || 0))) return false;
    const far = isX(side) ? (foyer && host.y1 > (foyer.y0 + foyer.y1) / 2 ? 'y1' : 'y0') : (foyer && Math.abs(host.x1 - (foyer.x0 + foyer.x1) / 2) > Math.abs(host.x0 - (foyer.x0 + foyer.x1) / 2) ? 'x1' : 'x0');
    const [bathR, storeR] = split(strip, far, T.commonBathL);
    if (sideLen(storeR, side) < VEST_MIN) return false; // ممر دورة المياه صافيه ≥ 1.2 م
    const keepDoor = doors.filter(d => (d.a === host.id || d.b === host.id) && d.edge && Math.abs(d.edge.at - host[side]) < TOL && d.edge.axis === (isX(side) ? 'x' : 'y'));
    Object.assign(host, sn(rest));
    for (const d of keepDoor) doors.splice(doors.indexOf(d), 1);
    const bath = add(bathR, { id: host.id + '-bath', type: 'bath', name: 'دورة مياه', kind: 'bath', door: side, far });
    const lob = add(storeR, { id: host.id + '-lobby', type: 'corridor', name: host.kind === 'kitchen' ? 'ممر الخدمة' : 'ممر', kind: 'lobby', door: side });
    const e1 = edgeOf(lob, side); circDoor(lob.id, lob, side, host.kind === 'kitchen' ? 'door' : 'arch', host.kind === 'kitchen' ? .95 : 1.4, (e1.from + e1.to) / 2);
    const e2 = shared(lob, host); if (e2) doors.push({ a: lob.id, b: host.id, edge: e2, pos: (e2.from + e2.to) / 2, kind: 'arch', w: Math.min(1.6, e2.to - e2.from - .3) });
    const e3 = shared(bath, lob); if (e3) doors.push({ a: bath.id, b: lob.id, edge: e3, pos: (e3.from + e3.to) / 2, kind: 'door', w: GUEST_WC_DOOR });
    return true;
  }
  /** يقتطع من طرف المطبخ الطويل غرفة غسيل ومخزن (2.4–3.4 م) إن كان صافيه > KIT_MAX_NET + 3 وبقي المطبخ ≥ 14 م² صافيًا وعرضه ≥ KIT_MIN_AXIS. */
  function kitchenUtility(host) {
    const net = (W_(host) - WALL_NET) * (H_(host) - WALL_NET); if (net <= KIT_MAX_NET + 3) return false;
    const longY = H_(host) >= W_(host), ends = longY ? ['y0', 'y1'] : ['x0', 'x1'];
    const dinSide = din && touch(host, din) > .5 ? shared(host, din)?.side : null;
    const sd = ends.find(x => x !== host.door && x !== dinSide && x !== 'y0') || ends.find(x => x !== host.door && x !== 'y0'); if (!sd) return false;
    const L = sideLen(host, isX(sd) ? 'y0' : 'x0'), cross = isX(sd) ? H_(host) : W_(host);
    const keepL = Math.max(KIT_MIN_AXIS, (KITCHEN_DEFAULT_NET + 5) / (cross - WALL_NET) + WALL_NET);
    const t = snap(Math.min(3.4, Math.max(2.4, L - keepL))); if (L - t < keepL - .05 || t < 2.4) return false;
    const [strip, rest] = cut(host, sd, t);
    // الأبواب: الخارجية تُزال (يُعاد باب الخدمة إن بقي جدار خارجي)، والداخلية تُنقل إلى الحافة المشتركة الباقية أو تُزال
    for (let i = doors.length - 1; i >= 0; i--) { const d = doors[i]; if (!(d.a === host.id || d.b === host.id)) continue; if (!d.b) { doors.splice(i, 1); continue; } const other = rooms.find(x => x.id === (d.a === host.id ? d.b : d.a)); const e = other && shared(rest, other); if (!e || e.to - e.from < .9) { doors.splice(i, 1); continue; } if (d.edge && (d.edge.axis !== e.axis || Math.abs(d.edge.at - e.at) > TOL || (d.pos ?? 0) < e.from + .45 || (d.pos ?? 0) > e.to - .45)) { d.edge = e; d.pos = (e.from + e.to) / 2; d.w = Math.min(d.w, e.to - e.from - .3); } }
    Object.assign(host, sn(rest));
    const u = add(strip, { id: 'kitchen-utility', type: 'laundry', name: 'غرفة الغسيل والمخزن', kind: 'laundry', door: opp[sd], mizanDefault: true });
    const e = shared(u, host); if (e) doors.push({ a: u.id, b: host.id, edge: e, pos: (e.from + e.to) / 2, kind: 'door', w: Math.min(.85, e.to - e.from - .3) });
    const extK = edges(host, true).filter(x => x.side !== 'y0').sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
    if (extK && extK.to - extK.from >= 1.6) doors.push({ a: host.id, edge: extK, pos: extK.to - Math.min(.7, (extK.to - extK.from) / 2), kind: 'door', w: .9, service: true });
    const extU = edges(u, true).filter(x => x.side !== 'y0').sort((a, c) => (c.to - c.from) - (a.to - a.from))[0];
    if (extU && extU.to - extU.from >= 1.2) doors.push({ a: u.id, edge: extU, pos: (extU.from + extU.to) / 2, kind: 'door', w: .85, service: true });
    return true;
  }
  function kitchenStrip(host, items) {
    const perp = isX(host.door) ? ['y0', 'y1'] : ['x0', 'x1'];
    const awayDin = perp.filter(z => !(din && touch(host, din) > .5 && shared(host, din)?.side === z));
    // (الجولة الحادية عشرة) الشريط على جانب عمودي على الباب بعيدًا عن الطعام، وإلا الجانب المقابل للباب، وإلا الجانب العمودي الآخر —
    // كان يجرب جانبًا واحدًا فتسقط غرفة الغسيل التي طلبها العميل في أغلب التنظيمات
    const need = items.length === 2 ? 3.4 : 1.6;
    const fits = z => z && z !== host.door && (isX(z) ? W_(host) : H_(host)) - 1.6 >= KIT_MIN_AXIS
      && ((isX(z) ? W_(host) - 1.6 : W_(host)) - WALL_NET) * ((isX(z) ? H_(host) : H_(host) - 1.6) - WALL_NET) >= KIT_MIN_AREA + .3 // المطبخ بعد الشريط ≥ 10 م²
      && sideLen(host, z) >= need;
    const sd = [...new Set([...awayDin, opp[host.door], ...perp])].find(fits);
    if (!sd) return false;
    const L = sideLen(host, sd);
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
    if (ext && ext.to - ext.from >= 1.6 && !doors.some(d => d.a === host.id && d.service)) doors.push({ a: host.id, edge: ext, pos: ext.to - Math.min(.7, (ext.to - ext.from) / 2), kind: 'door', w: .9, service: true });
    return true;
  }
}

// ------------------------------------------------------------------------------------------ الرسم في المستند
/** يرسم تخطيطًا في دور: جدران (خارجية/داخلية حسب ما على جانبيها)، فتحات، نوافذ على كل حافة تطل على خارج أو حوش، تسميات، أبعاد، أثاث. */
export function drawPlanV2(doc0, lay, { level, T }) {
  // نسخة واحدة يملكها الرسم ثم الأوامر في المكان (لا نسخ للمستند كله مع كل جدار وفتحة)
  const rooms = lay.rooms; let doc = structuredClone(doc0);
  const run = c => applyCommandOwned(doc, c).ids;
  const solid = rooms.filter(r => !r.open);
  const lines = { x: new Map(), y: new Map() };
  const put = (axis, at, a, b, side, open, dh, circ) => { const k = r2(at); if (!lines[axis].has(k)) lines[axis].set(k, []); lines[axis].get(k).push({ a, b, side, open, dh, circ }); };
  for (const r of rooms) { const c = !!r.circ; put('y', r.y0, r.x0, r.x1, 'R', r.open, r.dh, c); put('y', r.y1, r.x0, r.x1, 'L', r.open, r.dh, c); put('x', r.x0, r.y0, r.y1, 'R', r.open, r.dh, c); put('x', r.x1, r.y0, r.y1, 'L', r.open, r.dh, c); }
  const walls = [];
  for (const axis of ['x', 'y']) for (const [at, list] of lines[axis]) {
    const pts = [...new Set(list.flatMap(s => [r2(s.a), r2(s.b)]))].sort((p, q) => p - q);
    let cur = null;
    const flush = () => { if (!cur) return; const pa = axis === 'y' ? T(cur.a, at) : T(at, cur.a), pb = axis === 'y' ? T(cur.b, at) : T(at, cur.b); const id = run({ type: 'add-wall', level, a: pa, b: pb, t: cur.t, ...(cur.rail ? { kind: 'parapet', h: 1.1 } : {}) })[0]; walls.push({ axis, at, a: cur.a, b: cur.b, id, pa, t: cur.t, rail: !!cur.rail }); cur = null; };
    for (let i = 0; i + 1 < pts.length; i++) {
      const m = (pts[i] + pts[i + 1]) / 2, L = list.filter(s => s.side === 'L' && s.a < m && s.b > m), R = list.filter(s => s.side === 'R' && s.a < m && s.b > m);
      if (!L.length && !R.length) { flush(); continue; }
      const t = L.some(s => !s.open) && R.some(s => !s.open) ? INT : EXT;
      // بين الفراغ المزدوج الارتفاع وغرفة داخلية: درابزين (جدار منخفض) لا جدار كامل
      // (الحركة فقط تطل على الفراغ: السلم والصالة والرواق؛ غرفة النوم بجانبه بجدار كامل)
      const rail = L.length && R.length && L.some(s => s.dh) !== R.some(s => s.dh) && [...L, ...R].some(s => !s.dh && s.circ);
      if (cur && cur.t === t && !!cur.rail === !!rail && Math.abs(cur.b - pts[i]) < 1e-6) cur.b = pts[i + 1]; else { flush(); cur = { a: pts[i], b: pts[i + 1], t, rail }; }
    }
    flush();
  }
  // (الجولة الحادية عشرة) لا فتحة تعبر تقاطع جدار داخلي: كل فتحة تبعد ≥ JUNC_CLEAR عن وجه أي جدار يلتقي بخطها وعن طرفي جدارها،
  // ولا تتراكب مع فتحة أخرى على الجدار نفسه، وتبقى داخل حافة غرفتها (range). تُزاح داخل المجال الحر، وتُصغّر النافذة إن لزم
  // (حتى 0.6 م)، وإلا لا تُرسم — لا يُترك لـ fitOpening أن يزلقها فوق تقاطع ولا للمجسّم أن يُسقطها بصمت.
  const placedAt = new Map();
  const freeSpans = (w, lo0, hi0, gap) => {
    let spans = [[Math.max(lo0, w.a), Math.min(hi0, w.b)]];
    const cutOut = (lo, hi) => { spans = spans.flatMap(([a, b]) => (hi <= a || lo >= b ? [[a, b]] : [[a, lo], [hi, b]].filter(([x, y]) => y - x > 1e-6))); };
    cutOut(-Infinity, w.a + JUNC_CLEAR); cutOut(w.b - JUNC_CLEAR, Infinity);
    for (const x of walls) if (x !== w && x.axis !== w.axis && w.at >= x.a - TOL && w.at <= x.b + TOL && x.at > w.a - TOL && x.at < w.b + TOL) cutOut(x.at - (x.t || INT) / 2 - JUNC_CLEAR, x.at + (x.t || INT) / 2 + JUNC_CLEAR);
    for (const o of doc.openings) if (o.wall === w.id) { const c = docToCanon(o, w); cutOut(c - o.w / 2 - gap, c + o.w / 2 + gap); }
    return spans;
  };
  const opening = (axis, at, pos, kind, extra = {}, range = null) => {
    const w = walls.find(x => x.axis === axis && Math.abs(x.at - at) < TOL && pos >= x.a - TOL && pos <= x.b + TOL); if (!w) return null;
    const door = ['door', 'door2', 'arch', 'slider', 'garage'].includes(kind), want = extra.w ?? (kind === 'window2' ? 2.2 : kind === 'window' ? 1.4 : .9);
    const spans = freeSpans(w, range ? range[0] : -Infinity, range ? range[1] : Infinity, door ? .1 : .15);
    const fits = spans.filter(([a, b]) => b - a >= want - 1e-6).sort((p, q) => Math.max(0, p[0] + want / 2 - pos, pos - (p[1] - want / 2)) - Math.max(0, q[0] + want / 2 - pos, pos - (q[1] - want / 2)));
    let c, ww = want;
    if (fits.length) c = Math.max(fits[0][0] + want / 2, Math.min(fits[0][1] - want / 2, pos));
    else {
      const minW = door ? Math.min(want, .8) : .6, big = spans.filter(([a, b]) => b - a >= minW - 1e-6).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
      if (!big) return null;
      ww = Math.floor((big[1] - big[0]) / SNAP) * SNAP; if (ww < minW - 1e-6) return null; c = (big[0] + big[1]) / 2;
    }
    if (door && Math.abs(c - pos) > 1.2) return null; // لا يبتعد الباب عن موضعه المقصود أكثر من 1.2 م (يبقى بين غرفتيه)
    const p = axis === 'y' ? T(c, at) : T(at, c);
    try { const id = run({ type: 'add-opening', wall: w.id, kind, at: Math.hypot(p.x - w.pa.x, p.y - w.pa.y), ...extra, ...(ww !== want || extra.w !== undefined ? { w: ww } : {}) })[0]; placedAt.set(id, { pos: c, w: ww }); return id; } catch { return null; }
  };
  const byId = new Map(rooms.map(r => [r.id, r]));
  const doorAt = [];
  for (const d of lay.doors) {
    const e = d.edge, pos = d.pos ?? (e.from + e.to) / 2, w = Math.max(.6, d.w ?? .9);
    const a = byId.get(d.a);
    const into = a ? (e.axis === 'x' ? (a.x0 + a.x1) / 2 > e.at : (a.y0 + a.y1) / 2 > e.at) : true;
    const pIn = e.axis === 'y' ? T(pos, e.at + (into ? 1 : -1)) : T(e.at + (into ? 1 : -1), pos);
    const id = opening(e.axis, e.at, pos, d.kind, { w, entry: !!(d.entry || d.entry2) }, [e.from, e.to]);
    if (!id && globalThis.__v2dbgOpen) globalThis.__v2dbgOpen.push({ a: d.a, b: d.b, kind: d.kind, w, pos, e: [e.axis, e.at, e.from, e.to], walls: walls.filter(x => x.axis === e.axis && Math.abs(x.at - e.at) < TOL).map(x => [x.a, x.b, x.t]) });
    if (id && ['door', 'door2'].includes(d.kind)) setSwing(id, pIn);
    const got = id ? placedAt.get(id) : null;
    doorAt.push({ room: d.a, other: d.b, axis: e.axis, at: e.at, pos: got ? got.pos : pos, w: got ? got.w : w, id, kind: d.kind });
  }
  const lightOf = r => SIDES.flatMap(s => exposed(r, s, solid));
  /** (قرار المالك) زجاج الغرفة الذي طلبه العميل (م²) إن طلب، ومجموع أطوال حوافها المضيئة؛ بلا طلب = null (سلوك النوافذ الافتراضي كما هو). */
  const glazeOf = r => { const want = clientGlazing({ type: r.type, name: r.name }, lay.glazing || null); if (want === null) return null; const es = lightOf(r).filter(e => e.to - e.from >= 1.6), total = Math.max(.1, es.reduce((a, e) => a + e.to - e.from, 0)); return { need: 1.04 * want / 100 * (W_(r) - WALL_NET) * (H_(r) - WALL_NET), total, want }; };
  for (const r of solid) {
    if (r.kind === 'lobby' || r.type === 'storage' || r.type === 'stairs') continue;
    for (const e of lightOf(r)) {
      const len = e.to - e.from, busy = doorAt.filter(d => d.axis === e.axis && Math.abs(d.at - e.at) < TOL && d.pos > e.from - .1 && d.pos < e.to + .1);
      if (r.type === 'bath') { if (len >= 1 && !busy.length) opening(e.axis, e.at, (e.from + e.to) / 2, 'window', { w: .6, h: .6, sill: 1.7 }, [e.from, e.to]); continue; }
      if (r.type === 'corridor' || r.type === 'entrance') { if (len >= 1.4 && !busy.some(d => Math.abs(d.pos - (e.from + e.to) / 2) < d.w / 2 + .7)) opening(e.axis, e.at, (e.from + e.to) / 2, 'window', { w: Math.min(1.2, len - .5) }, [e.from, e.to]); continue; }
      if (len < 1.6) continue;
      const big = ['majlis', 'living', 'dining', 'master'].includes(r.type) && len >= 3.4;
      const spots = big && len >= 6.5 ? [e.from + len * .27, e.from + len * .73] : [(e.from + e.to) / 2];
      // (الجولة الثالثة عشرة، قرار المالك) إن طلب العميل نسبة زجاج لهذه الغرفة: عرض النافذة يسعى إليها حيث يتسع الجدار — حصة هذه الحافة
      // من الزجاج المطلوب بنسبة طولها موزعة على مواضعها؛ لا تصغير غرفة ولا تجاوز الحافة (opening يضيّقها عند التقاطعات). بلا طلب: الافتراضي
      const gl = glazeOf(r), share = gl ? gl.need * (len / gl.total) / spots.length : 0;
      for (let sp of spots) {
        const wantW = gl ? Math.max(big ? 2.2 : 1.4, Math.min(len - .7, share / (share / 1.5 >= 1.8 ? 1.5 : 1.2))) : (big ? 2.2 : 1.4);
        const ww = r2(wantW), kind = gl ? (ww >= 1.8 ? 'window2' : 'window') : (big ? 'window2' : 'window');
        const clash = d => Math.abs(d.pos - sp) < d.w / 2 + ww / 2 + .25;
        if (busy.some(clash)) { const d = busy[0]; sp = d.pos > (e.from + e.to) / 2 ? e.from + .35 + ww / 2 : e.to - .35 - ww / 2; if (busy.some(clash) || sp - ww / 2 < e.from + .2 || sp + ww / 2 > e.to - .2) { if (len - d.w - .9 >= 1) { const w2 = Math.min(ww, len - d.w - .9); const a2 = d.pos > (e.from + e.to) / 2 ? e.from + .3 + w2 / 2 : e.to - .3 - w2 / 2; opening(e.axis, e.at, a2, 'window', { w: w2 }, [e.from, e.to]); } continue; } }
        opening(e.axis, e.at, sp, kind, ww !== (kind === 'window2' ? 2.2 : 1.4) ? { w: ww } : {}, [e.from, e.to]);
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
      if (opening(e.axis, e.at, sp, 'window', { w: w2 }, [e.from, e.to])) break;
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
  const minY = Math.min(...solid.map(r => r.y0)), maxX = Math.max(...solid.map(r => r.x1)), maxY = Math.max(...solid.map(r => r.y1));
  // (الجولة التاسعة عشرة؛ المراجع المستقل r18: C5-3 وC10-2) سلسلة أبعاد العرض على الواجهة الخلفية لا الأمامية: الارتداد الأمامي ساحة المواقف،
  // فكانت خطوط الأبعاد تقطع رسم السيارات
  if (R14_OFF.has('r19dims')) chain(solid.filter(r => Math.abs(r.y0 - minY) < TOL).flatMap(r => [r.x0, r.x1]), x => ({ x, y: minY }), { x: 0, y: -1 });
  else chain(solid.filter(r => Math.abs(r.y1 - maxY) < TOL).flatMap(r => [r.x0, r.x1]), x => ({ x, y: maxY }), { x: 0, y: 1 });
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

/**
 * الأثاث الاسترشادي (الجولة الحادية عشرة: يُتحقق منه قبل رسمه). لكل غرفة تُجرَّب ترتيبات بالترتيب، ويُرسم أول ترتيب يحقق:
 *  (1) لا قطعة في المنطقة الحرة أمام أي باب أو فتحة للغرفة (عمق DOOR_FRONT)، وفي دورة المياه لا مرحاض ولا مغسلة ولا دش داخل
 *      منطقة فتح بابها (عرض الباب × عمقه)؛
 *  (2) الممرات الرئيسية بين أبواب الغرفة (ومن بابها الوحيد إلى وسطها الحر) بعرض صافٍ ≥ ROUTE_W بين قطع الأثاث.
 * إن لم يتحقق أي ترتيب يُرسم أبسطه الذي يحقق الشرطين، وإلا تُترك الغرفة بلا أثاث (الأثاث استرشادي؛ لا يُرسم ما يسد الحركة).
 * القيم 0.6 م و0.9 م قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا).
 */
// المنطقة الحرة أمام الباب مقيسة من محور الجدار: 0.6 م من وجهه + نصف سماكة الجدار الخارجي (0.125) + هامش
const DOOR_FRONT = .75, ROUTE_W = .9, WALL_GAP = .3;
function furnish(rooms, T, run, doorAt, LVL, outSides) {
  const rotFor = (bx, by) => { const a = T(0, 0), b = T(bx, by); return Math.atan2(b.x - a.x, -(b.y - a.y)); };
  const emit = p => { const q = T(p.x, p.y); try { run({ type: 'add-fixture', level: LVL, kind: p.kind, x: q.x, y: q.y, rot: rotFor(p.bx, p.by), ...p.extra }); } catch { /* لم تتسع */ } };
  const dir = { x0: [-1, 0], x1: [1, 0], y0: [0, -1], y1: [0, 1] };
  const sideOfDoor = (r, d) => (d.axis === 'x' ? (Math.abs(r.x0 - d.at) < TOL ? 'x0' : Math.abs(r.x1 - d.at) < TOL ? 'x1' : null) : (Math.abs(r.y0 - d.at) < TOL ? 'y0' : Math.abs(r.y1 - d.at) < TOL ? 'y1' : null));
  const doorsOf = r => doorAt.filter(d => (d.room === r.id || d.other === r.id) && d.id).map(d => ({ ...d, s: sideOfDoor(r, d) })).filter(d => d.s && d.pos > (isX(d.s) ? r.y0 : r.x0) - TOL && d.pos < (isX(d.s) ? r.y1 : r.x1) + TOL);
  const doorsOn = (r, s) => doorsOf(r).filter(d => d.s === s);
  const freeSides = r => SIDES.filter(s => !doorsOn(r, s).length);
  const onWall = (r, s, inset, t) => (isX(s) ? { x: s === 'x0' ? r.x0 + inset : r.x1 - inset, y: t } : { x: t, y: s === 'y0' ? r.y0 + inset : r.y1 - inset });
  const mid = (r, s) => (isX(s) ? (r.y0 + r.y1) / 2 : (r.x0 + r.x1) / 2);
  const span = (r, s) => (isX(s) ? [r.y0, r.y1] : [r.x0, r.x1]);
  const m = .1;
  const Pc = (kind, x, y, bx, by, extra = {}) => ({ kind, x, y, bx, by, extra, w: extra.w ?? FIXTURES[kind].w, d: extra.d ?? FIXTURES[kind].d });
  const box = p => { const alongX = p.bx === 0, hw = (alongX ? p.w : p.d) / 2, hh = (alongX ? p.d : p.w) / 2; return { x0: p.x - hw, x1: p.x + hw, y0: p.y - hh, y1: p.y + hh }; };
  const hit = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1e-6;
  const zoneOf = (r, d, depth) => { const lo = d.pos - d.w / 2, hi = d.pos + d.w / 2; return isX(d.s) ? { x0: d.s === 'x0' ? r.x0 : r.x1 - depth, x1: d.s === 'x0' ? r.x0 + depth : r.x1, y0: lo, y1: hi } : { x0: lo, x1: hi, y0: d.s === 'y0' ? r.y0 : r.y1 - depth, y1: d.s === 'y0' ? r.y0 + depth : r.y1 }; };
  /** فراغات حرة على جدار s بعد استبعاد امتداد الأبواب (± هامش) والأركان. */
  const freeRuns = (r, s, margin = .25, corner = .1) => {
    let runs = [[span(r, s)[0] + corner, span(r, s)[1] - corner]];
    for (const d of doorsOn(r, s)) { const lo = d.pos - d.w / 2 - margin, hi = d.pos + d.w / 2 + margin; runs = runs.flatMap(([a, b]) => (hi <= a || lo >= b ? [[a, b]] : [[a, lo], [hi, b]].filter(([x, y]) => y - x > .05))); }
    // الأبواب على الجدارين المجاورين تحجز ركنها بعمق المنطقة الحرة
    for (const d of doorsOf(r).filter(x => x.s !== s && x.s !== opp[s])) {
      const z = zoneOf(r, d, DOOR_FRONT), [a0, a1] = isX(s) ? [z.y0, z.y1] : [z.x0, z.x1];
      const nearWall = isX(s) ? (s === 'x0' ? z.x0 <= r.x0 + .9 : z.x1 >= r.x1 - .9) : (s === 'y0' ? z.y0 <= r.y0 + .9 : z.y1 >= r.y1 - .9);
      if (nearWall) runs = runs.flatMap(([a, b]) => (a1 <= a || a0 >= b ? [[a, b]] : [[a, a0], [a1, b]].filter(([x, y]) => y - x > .05)));
    }
    return runs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
  };
  /** التحقق: المناطق الحرة أمام الأبواب، ومنطقة فتح باب دورة المياه، والممرات الرئيسية ≥ ROUTE_W بين الأثاث. */
  const valid = (r, list) => {
    const boxes = list.filter(p => p.kind !== 'rug').map(p => ({ p, b: box(p) })), doors = doorsOf(r);
    // لا قطعتان متداخلتان (وإلا أزاحهما relaxFixtures إلى منطقة باب)، وكل قطعة داخل الغرفة
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i].b; if (b.x0 < r.x0 + .04 || b.x1 > r.x1 - .04 || b.y0 < r.y0 + .04 || b.y1 > r.y1 - .04) return false;
      for (let j = i + 1; j < boxes.length; j++) { const o = boxes[j].b; if (Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0) > .02 && Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0) > .02) return false; }
    }
    for (const d of doors) {
      // عمق المنطقة الحرة: 0.6 م أمام الباب، أو مدى فتح ضلفته إن كان أكبر (فلا يزيح relaxFixtures القطعة إلى منطقة باب آخر)
      const z = zoneOf(r, d, Math.max(DOOR_FRONT, d.kind === 'door' ? d.w + .08 : d.kind === 'door2' ? d.w / 2 + .08 : 0));
      if (boxes.some(({ b }) => hit(b, z))) return false;
      if (r.type === 'bath' && ['door', 'door2'].includes(d.kind)) { const zw = zoneOf(r, d, Math.max(DOOR_FRONT, d.w + .06)); if (boxes.some(({ p, b }) => ['wc', 'basin', 'shower', 'bathtub'].includes(p.kind) && hit(b, zw))) return false; }
    }
    if (!boxes.length || r.type === 'bath' || r.type === 'kitchen' && !doors.length) return true;
    // شبكة 10 سم داخل الغرفة: خلية حرة إن بعدت ≥ ROUTE_W/2 عن كل قطعة و≥ WALL_GAP عن الجدران
    const c = .1, x0 = r.x0 + .06, y0 = r.y0 + .06, nx = Math.max(1, Math.floor((W_(r) - .12) / c)), ny = Math.max(1, Math.floor((H_(r) - .12) / c));
    const free = new Uint8Array(nx * ny), R = ROUTE_W / 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + (i + .5) * c, y = y0 + (j + .5) * c;
      if (x - x0 < WALL_GAP - 1e-9 || x0 + nx * c - x < WALL_GAP - 1e-9 || y - y0 < WALL_GAP - 1e-9 || y0 + ny * c - y < WALL_GAP - 1e-9) continue;
      let ok = true; for (const { b } of boxes) { const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1); if (dx * dx + dy * dy < R * R - 1e-9) { ok = false; break; } }
      if (ok) free[j * nx + i] = 1;
    }
    const cellAt = (x, y) => { const i = Math.floor((x - x0) / c), j = Math.floor((y - y0) / c); return i >= 0 && j >= 0 && i < nx && j < ny ? j * nx + i : -1; };
    // نقطة كل باب: 0.5 م داخل الغرفة أمام وسطه (أقرب خلية حرة ضمن 0.3 م)
    const anchor = d => { const p = isX(d.s) ? { x: d.s === 'x0' ? r.x0 + .5 : r.x1 - .5, y: d.pos } : { x: d.pos, y: d.s === 'y0' ? r.y0 + .5 : r.y1 - .5 }; for (const [dx, dy] of [[0, 0], [.1, 0], [-.1, 0], [0, .1], [0, -.1], [.2, 0], [-.2, 0], [0, .2], [0, -.2], [.3, 0], [-.3, 0], [0, .3], [0, -.3]]) { const k = cellAt(p.x + dx, p.y + dy); if (k >= 0 && free[k]) return k; } return -1; };
    const seeds = doors.map(anchor);
    if (seeds.some(k => k < 0)) return false;
    // البلوغ من أول باب
    const seen = new Uint8Array(nx * ny), q = [seeds[0]]; seen[seeds[0]] = 1;
    while (q.length) { const k = q.pop(), i = k % nx, j = (k - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const kk = b * nx + a; if (free[kk] && !seen[kk]) { seen[kk] = 1; q.push(kk); } } }
    if (!seeds.every(k => seen[k])) return false;
    // غرفة بباب واحد: يبقى من الباب ممر إلى فراغ حر في وسطها أو إلى جانب القطعة الرئيسية (≥ 1 م²)
    if (doors.length === 1) { let n = 0; for (let k = 0; k < nx * ny; k++) n += seen[k]; if (n * c * c < 1) return false; }
    return true;
  };
  const place = (r, layouts) => { for (const L of layouts) { const list = L.filter(Boolean); if (valid(r, list)) { list.forEach(emit); return true; } } return false; };
  for (const r of rooms) {
    const w = W_(r), h = H_(r);
    if (r.type === 'courtyard') { if (Math.min(w, h) >= 3) emit(Pc('tree', (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0, -1)); continue; }
    if (r.type === 'master' || r.type === 'bedroom') {
      if (w < 2.6 || h < 2.6) continue;
      const free = freeSides(r);
      const pref = [...new Set([r.strip ? opp[r.strip] : null, opp[r.door], ...free, ...SIDES].filter(s => s && SIDES.includes(s)))];
      const layouts = [];
      for (const s of pref) for (const full of [true, false]) {
        const run = freeRuns(r, s, .15)[0]; if (!run) continue;
        const dbl = r.type === 'master' || run[1] - run[0] >= 3.2, bw = dbl ? 1.8 : 1.0, bd = dbl ? 2.1 : 2.0;
        if (run[1] - run[0] < bw + .2 || (isX(s) ? w : h) < bd + .8) continue;
        const t = Math.max(run[0] + bw / 2 + (full ? .5 : 0), Math.min(run[1] - bw / 2 - (full ? .5 : 0), mid(r, s)));
        const c = onWall(r, s, m + bd / 2, t), [bx, by] = dir[s], L = [Pc(dbl ? 'bed-double' : 'bed-single', c.x, c.y, bx, by)];
        if (full) for (const k of dbl ? [-1, 1] : [1]) { const tt = t + k * (bw / 2 + .3); if (tt - .25 > run[0] && tt + .25 < run[1]) { const n = onWall(r, s, m + .22, tt); L.push(Pc('nightstand', n.x, n.y, bx, by)); } }
        if (full && !r.strip && (isX(s) ? h : w) >= 3) { const o2 = [isX(s) ? 'y1' : 'x1', isX(s) ? 'y0' : 'x0'].find(z => freeRuns(r, z, .15)[0]?.[1] - freeRuns(r, z, .15)[0]?.[0] >= 1.4); if (o2) { const rr = freeRuns(r, o2, .15)[0], ww2 = Math.min(rr[1] - rr[0] - .2, 2.2), c2 = onWall(r, o2, m + .3, (rr[0] + rr[1]) / 2); L.push(Pc('wardrobe', c2.x, c2.y, ...dir[o2], { w: ww2 })); } }
        layouts.push(L);
      }
      place(r, layouts);
      continue;
    }
    if (r.type === 'majlis') {
      if (w < 3 || h < 3) continue;
      const longS = w >= h ? ['y0', 'y1'] : ['x0', 'x1'], shortS = w >= h ? ['x0', 'x1'] : ['y0', 'y1'];
      const seat = (s, minLen = 1.2, max = 4.4, k = 2, corner = .15) => freeRuns(r, s, .3, corner).filter(([a, b]) => b - a >= minLen).slice(0, k).map(([a, b]) => { const len = Math.min(b - a, max), c = onWall(r, s, m + .4, (a + b) / 2); return Pc('majlis-sofa', c.x, c.y, ...dir[s], { w: len }); });
      const center = [Pc('rug', (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0, -1, { w: Math.max(1.4, Math.min(w - 2.2, 3.6)), d: Math.max(1.2, Math.min(h - 2.2, 2.6)) }), Pc('coffee-table', (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0, -1)];
      place(r, [[...longS.flatMap(s => seat(s)), ...shortS.flatMap(s => seat(s, 1.2, 3.2, 1, .98)), ...center], [...longS.flatMap(s => seat(s)), ...center], [...longS.flatMap(s => seat(s, 1.2, 4.4, 1)), center[0]], [...longS.flatMap(s => seat(s, 1.2, 4.4, 1))],
        // (الجولة الرابعة عشرة) لا مجلس بلا أثاث (المراجع المستقل r13، C9-2): جلسات على الجدارين القصيرين، أو على أي جدار حر، أو السجادة والطاولة وحدهما
        [...shortS.flatMap(s => seat(s, 1.2, 4.4, 1)), ...center], [...SIDES.flatMap(s => seat(s, 1.0, 4.4, 1, .3)), center[0]], [...SIDES.flatMap(s => seat(s, 1.0, 4.4, 1, .3))], [center[0], center[1]], [center[0]]]);
      continue;
    }
    if ((r.type === 'living' && !r.circ) || r.id === 'hall') {
      if (w < 3.2 || h < 3.2) continue;
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, along = w >= h, layouts = [];
      // (أ) جلسة متقابلة في الوسط (كما كانت)، (ب) جلسة على جدار حر بلا أبواب مع كنبة ثنائية أو كرسيين مقابلها، (ج) كنبة على جدار وطاولة فقط
      if (along) layouts.push([Pc('sofa-3', cx, cy - 1.15, 0, -1), Pc('sofa-3', cx, cy + 1.15, 0, 1), Pc('rug', cx, cy, 0, -1, { w: Math.min(w - 1.6, 3.4), d: 2.6 }), Pc('coffee-table', cx, cy, 0, -1)]);
      else layouts.push([Pc('sofa-3', cx - 1.15, cy, -1, 0), Pc('sofa-3', cx + 1.15, cy, 1, 0), Pc('rug', cx, cy, -1, 0, { w: Math.min(h - 1.6, 3.4), d: 2.6 }), Pc('coffee-table', cx, cy, -1, 0)]);
      const sides = [...SIDES].sort((a, b) => (freeRuns(r, b, .3)[0]?.[1] - freeRuns(r, b, .3)[0]?.[0] || 0) - (freeRuns(r, a, .3)[0]?.[1] - freeRuns(r, a, .3)[0]?.[0] || 0));
      for (const s of sides) {
        const run = freeRuns(r, s, .3)[0]; if (!run || run[1] - run[0] < 2.4) continue;
        const t = Math.max(run[0] + 1.1, Math.min(run[1] - 1.1, (run[0] + run[1]) / 2)), [bx, by] = dir[s], deep = isX(s) ? w : h;
        const at = k => onWall(r, s, k, t), sofa = at(m + .48), tab = at(m + .95 + .5 + .3), opp2 = at(m + .95 + .5 + .6 + .5 + .45);
        const base = [Pc('sofa-3', sofa.x, sofa.y, bx, by), Pc('rug', tab.x, tab.y, bx, by, { w: 2.4, d: 1.7 }), Pc('coffee-table', tab.x, tab.y, bx, by)];
        if (deep >= 4.6) layouts.push([...base, Pc('sofa-2', opp2.x, opp2.y, -bx, -by)]);
        if (deep >= 4.4) { const t1 = t - .65, t2 = t + .65, a1 = onWall(r, s, m + .95 + .5 + .6 + .5 + .4, t1), a2 = onWall(r, s, m + .95 + .5 + .6 + .5 + .4, t2); layouts.push([...base, Pc('armchair', a1.x, a1.y, -bx, -by), Pc('armchair', a2.x, a2.y, -bx, -by)]); }
        layouts.push(base, [base[0], base[2]]);
      }
      place(r, layouts);
      continue;
    }
    if (r.type === 'dining') {
      if (w < 2.6 || h < 2.6) continue;
      const along = w >= h, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, layouts = [];
      for (const len of [Math.min(Math.max(w, h) - 1.8, 3.0), 2.2, 1.6]) for (const off of [0, .4, -.4, .7, -.7]) {
        if (len < 1.4) continue;
        const x = along ? cx : cx + off, y = along ? cy + off : cy;
        layouts.push([Pc('dining-table', x, y, along ? 0 : -1, along ? -1 : 0, { w: Math.max(1.4, len), d: 1.0 })]);
      }
      place(r, layouts);
      continue;
    }
    if (r.type === 'kitchen') {
      if (w < 2.2 || h < 2.2) continue;
      const free = freeSides(r), ext = outSides(r).filter(s => free.includes(s)), layouts = [];
      for (const s of [...new Set([...ext, ...free, ...SIDES])]) {
        const run = freeRuns(r, s, .1, .05)[0]; if (!run || run[1] - run[0] < 1.6) continue;
        const L = run[1] - run[0], runW = Math.min(L - .85, 4.2), [bx, by] = dir[s];
        const c = onWall(r, s, m + .3, run[0] + runW / 2 + .02), fr = onWall(r, s, m + .35, run[0] + runW + .45);
        const one = [Pc('kitchen-run', c.x, c.y, bx, by, { w: runW })]; if (L - runW >= .8) one.push(Pc('fridge', fr.x, fr.y, bx, by));
        const o = [isX(s) ? 'y0' : 'x0', isX(s) ? 'y1' : 'x1'].map(z => ({ z, run: freeRuns(r, z, .1, .7)[0] })).filter(x => x.run && x.run[1] - x.run[0] >= 1.6)[0];
        if (o) { const c2 = onWall(r, o.z, m + .3, (o.run[0] + o.run[1]) / 2); layouts.push([...one, Pc('kitchen-run', c2.x, c2.y, ...dir[o.z], { w: Math.min(o.run[1] - o.run[0] - .1, 3) })]); }
        layouts.push(one);
      }
      place(r, layouts);
      continue;
    }
    if (r.type === 'bath') {
      if (w < 1 || h < 1) continue;
      const ds = doorsOf(r), d0 = ds[0];
      const longSides = w >= h ? ['y0', 'y1'] : ['x0', 'x1'], layouts = [];
      // المرحاض على الجدار البعيد عن الباب (خارج منطقة فتحه وعرضه)، والمغسلة قرب الباب خارج منطقته، والدش في الطرف الآخر إن اتسع
      const sidesTry = [...new Set([d0 ? opp[d0.s] : null, ...longSides, ...SIDES].filter(Boolean))].filter(s => !ds.some(d => d.s === s));
      for (const s of sidesTry) {
        const [lo, hi] = span(r, s), L = hi - lo;
        const dp = d0 ? (isX(s) === isX(d0.s) ? null : d0.pos) : null;
        const farHi = dp === null ? (d0 ? !(d0.s === 'x1' || d0.s === 'y1') : (r.far ? (r.far === 'x1' || r.far === 'y1') : true)) : dp - lo < hi - dp;
        for (const k of [.45, .55, .7]) {
          const at = x => (farHi ? hi - x : lo + x);
          const pw = onWall(r, s, m + .32, at(k)), L1 = [Pc('wc', pw.x, pw.y, ...dir[s])];
          if (L >= 1.6) { const pb = onWall(r, s, m + .25, at(k + .7)); L1.push(Pc('basin', pb.x, pb.y, ...dir[s])); }
          if (L >= 2.3 && Math.min(w, h) >= 1.2) { const ps = onWall(r, s, .55, farHi ? lo + .55 : hi - .55); layouts.push([...L1, Pc('shower', ps.x, ps.y, ...dir[s], { w: .9, d: .9 })]); }
          layouts.push(L1, [L1[0]]);
        }
      }
      place(r, layouts);
      continue;
    }
    if (r.kind === 'dress') {
      const s = (w >= h ? ['y0', 'y1'] : ['x0', 'x1']).find(z => freeRuns(r, z, .15)[0]); if (!s) continue;
      const rr = freeRuns(r, s, .15)[0], c = onWall(r, s, m + .3, (rr[0] + rr[1]) / 2);
      place(r, [[Pc('wardrobe', c.x, c.y, ...dir[s], { w: Math.min(rr[1] - rr[0] - .1, 2.8) })]]);
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
export function qualityGates(doc, lay = null, { kitchenFront = false, majlisAsked = false, diningAsked = false, masterAsked = false, hallDistributor = null, narrow = false } = {}) {
  const why = [], { rooms } = docRooms(doc), M = analyzeDoc(doc);
  // «الصالة الموزِّعة» تُستنتج من المرسوم ما لم تُعطَ: لا ممر غرف نوم في الأرضي (الغرف كلها على الصالة/الردهة)
  if (hallDistributor === null) hallDistributor = !rooms.some(r => r.li === 0 && /^ممر الغرف/.test(r.name));
  // (الجولة الثامنة) المجلس الرئيسي (الرجال، أو الوحيد) ≥ 24 م² صافيًا، والطعام ≥ 12 م²، والرئيسية العلوية ≤ 26 م² — مقيسة من المرسوم
  { const mj = rooms.filter(r => r.type === 'majlis' && r.li === 0), pm = mj.find(r => r.name === 'مجلس الرجال') || (mj.length === 1 ? mj[0] : null);
    if (pm && !majlisAsked && pm.area < MAJLIS_NET - .05) why.push(`«${pm.name}» ${r2(pm.area)} م² أصغر من ${MAJLIS_NET} م².`); }
  for (const dn of rooms.filter(r => r.type === 'dining')) if (!diningAsked && dn.area < DIN_MIN_AREA - .05) why.push(`«${dn.name}» ${r2(dn.area)} م² أصغر من ${DIN_MIN_AREA} م².`);
  for (const ms of rooms.filter(r => r.type === 'master' && r.li > 0)) if (!masterAsked && ms.area > MASTER_UP_MAX + .3) why.push(`«${ms.name}» في الدور العلوي ${r2(ms.area)} م² متضخمة (> ${MASTER_UP_MAX} م²).`);
  // (الجولة العاشرة) قيم افتراضية للميزان ما لم يطلب العميل غيرها: الرئيسية العلوية ≥ 18 م²، وحمامها ≤ 7 م²، والمجلس عرضه ≥ 4.2 م
  // ولا يتضخم فوق 1.6 من حده، والطعام ≤ 20 م²، وممر الغرف المحمَّل من جهة واحدة ≤ 10.5 م (إلا في الأرض الضيقة)
  for (const ms of rooms.filter(r => r.type === 'master' && r.li > 0)) if (!masterAsked && ms.area < MASTER_UP_MIN - .05) why.push(`«${ms.name}» في الدور العلوي ${r2(ms.area)} م² أصغر من ${MASTER_UP_MIN} م² (قيمة تصميمية افتراضية للميزان).`);
  for (const mb of rooms.filter(r => r.type === 'bath' && r.name === 'حمام الرئيسية')) if (!masterAsked && mb.area > MASTER_BATH_MAX + .3) why.push(`«${mb.name}» ${r2(mb.area)} م² متضخم (> ${MASTER_BATH_MAX} م²؛ الزائد لغرفة الملابس).`);
  for (const mj of rooms.filter(r => r.type === 'majlis')) {
    if (majlisAsked) continue;
    const w = Math.min(mj.x1 - mj.x0, mj.y1 - mj.y0), cap = MAJLIS_CAP * (/نساء/.test(mj.name) ? WOMEN_NET : MAJLIS_NET);
    // (الجولة الحادية عشرة) الحد نفسه لمجلس النساء (كان للرئيسي فقط فخرج مجلس نساء شريطي 3.82 م في C10)
    if (w < MAJLIS_MIN_W - .05) why.push(`«${mj.name}» عرضه الصافي ${r2(w)} م أقل من ${MAJLIS_MIN_W} م (جلسة متقابلة).`);
    if (mj.area > cap + .3) why.push(`«${mj.name}» ${r2(mj.area)} م² متضخم (> ${r2(cap)} م²).`);
  }
  for (const dn of rooms.filter(r => r.type === 'dining')) if (!diningAsked && dn.area > DIN_MAX_AREA + .3) why.push(`«${dn.name}» ${r2(dn.area)} م² متضخم (> ${DIN_MAX_AREA} م²).`);
  for (const ms of rooms.filter(r => r.type === 'master' && r.li === 0)) if (!masterAsked && ms.area > MASTER_GROUND_MAX + .05) why.push(`«${ms.name}» ${r2(ms.area)} م² متضخمة (> ${MASTER_GROUND_MAX} م² صافية دون الحمام والملابس).`);
  // غرفة نوم تفتح على الصالة العائلية مباشرة (لا ممر ولا مدخل جناح): مقبولة فقط في «الصالة الموزِّعة» وبباب في طرف الجدار
  { const g0 = M.levels[0];
    if (g0) for (const op of g0.openings) {
      if (!op.door || !op.left || !op.right) continue;
      const pr = [op.left, op.right], h = pr.find(r => r.name === 'الصالة'), b = pr.find(r => ['bedroom', 'master'].includes(r.type) && !/^(غرفة كبار السن|غرفة الضيوف)/.test(r.name || ''));
      if (!h || !b) continue;
      if (!hallDistributor) { why.push(`«${b.name}» تفتح على الصالة العائلية مباشرة (بلا ممر ولا مدخل جناح) في تنظيم ليس «الصالة الموزِّعة».`); continue; }
      const B = rooms.find(x => x.li === 0 && x.name === b.name), Hh = rooms.find(x => x.li === 0 && x.name === 'الصالة'); if (!B || !Hh) continue;
      const alongX = Math.abs(op.u.x) > Math.abs(op.u.y), lo = alongX ? Math.max(B.x0, Hh.x0) : Math.max(B.y0, Hh.y0), hi = alongX ? Math.min(B.x1, Hh.x1) : Math.min(B.y1, Hh.y1), c = alongX ? op.p.x : op.p.y;
      const off = Math.min(c - lo, hi - c);
      if (off > HALL_DOOR_OFFSET + .05) why.push(`باب «${b.name}» في وسط جدار الصالة (يبعد ${r2(off)} م عن طرفه؛ المستحسن ≤ ${HALL_DOOR_OFFSET} م للخصوصية).`);
    } }
  const dims = r => { const w = r.x1 - r.x0, d = r.y1 - r.y0; return { s: Math.min(w, d), l: Math.max(w, d) }; };
  const beds = rooms.filter(r => r.type === 'bedroom' || r.type === 'master'), master = beds.find(r => r.type === 'master');
  if (master) { const big = beds.filter(r => r !== master && r.name !== 'غرفة الضيوف').sort((a, b) => b.area - a.area)[0]; if (big && big.area > master.area + .3) why.push(`غرفة النوم الرئيسية ${r2(master.area)} م² أصغر من «${big.name}» ${r2(big.area)} م².`); }
  const kit = rooms.find(r => r.type === 'kitchen' && r.name === 'المطبخ'), din = rooms.find(r => r.type === 'dining');
  if (kit && dims(kit).s < 2.95) why.push(`المطبخ عرضه الصافي ${r2(dims(kit).s)} م أقل من 3.0 م.`);
  if (kit && kit.area < KIT_MIN_AREA - .05) why.push(`المطبخ ${r2(kit.area)} م² أصغر من ${KIT_MIN_AREA} م².`);
  // غرف النوم: صافي ≥ 12 م² والرئيسية ≥ 16 م² (المقيس من المخطط المرسوم كما يُعرض للعميل)
  for (const b of beds) { const lim = b.type === 'master' ? BED_MIN_MASTER : BED_MIN; if (b.area < lim - .05) why.push(`«${b.name}» ${r2(b.area)} م² أصغر من ${lim} م².`); }
  // لا زوايا دخول ضيقة: كل مدخل أو ممر فرعي (مدخل الجناح، المغاسل، ممر النساء، مدخل الرجال…) صافيه ≥ 1.2 م
  for (const c of rooms.filter(r => ['corridor', 'entrance'].includes(r.type))) if (dims(c).s < 1.195) why.push(`«${c.name}» صافيه ${r2(dims(c).s)} م أضيق من 1.2 م.`);
  // ممر غرف محمَّل من جهة واحدة أطول من 12.5 م (المستحسن ≤ 10 م)
  for (const c of planCorridors(rooms)) if (c.len > CORR_SINGLE_HARD) why.push(`«${c.name}» ممر غرف بطول ${r2(c.len)} م (> ${CORR_SINGLE_HARD} م؛ المستحسن ≤ ${CORR_SINGLE_MAX} م).`);
  // (الجولة السابعة) الحوش فناء لا شق، والطعام والخادمة بعرض صافٍ مهني — مقيسة من المخطط المرسوم كما يُعرض
  // (الجولة الثانية عشرة) المنور (بئر ضوء معلن باسمه): صافيه ≥ 1.8 م ونسبته ≤ 3.6 — حدود المنور لا حدود الحوش
  for (const ct of rooms.filter(r => r.type === 'courtyard' && r.name === 'منور')) { const d = dims(ct); if (d.s < 1.8 - .05) why.push(`«منور» ${r2(d.s)}×${r2(d.l)} م: أضيق من 1.8 م.`); else if (d.l / d.s > 3.65) why.push(`«منور» ${r2(d.s)}×${r2(d.l)} م: نسبته ${r2(d.l / d.s)} > 3.6 (شق لا منور).`); }
  for (const ct of rooms.filter(r => r.type === 'courtyard' && r.name !== 'منور')) { const d = dims(ct); if (d.s < COURT_MIN - EXT - .05) why.push(`«${ct.name}» ${r2(d.s)}×${r2(d.l)} م: ضلعه الأقصر أقل من ${COURT_MIN - EXT} م (بئر ضوء أو شق، لا فناء).`); else if (d.l / d.s > COURT_ASP + .05) why.push(`«${ct.name}» ${r2(d.s)}×${r2(d.l)} م: نسبته ${r2(d.l / d.s)} > ${COURT_ASP} (شق طويل لا فناء).`); }
  if (din && dims(din).s < DIN_MIN_NET - .05) why.push(`الطعام عرضه الصافي ${r2(dims(din).s)} م أقل من ${DIN_MIN_NET} م.`);
  for (const md of rooms.filter(r => r.name === 'غرفة الخادمة')) if (dims(md).s < MAID_MIN_NET - .05) why.push(`«${md.name}» عرضها الصافي ${r2(dims(md).s)} م أقل من ${MAID_MIN_NET} م.`);
  for (const st of rooms.filter(r => r.name === 'المخزن' && r.area > 10)) why.push(`«${st.name}» ${r2(st.area)} م² متضخم (فراغ متبقٍ لا مخزن).`);
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
    if (k && sum(exposed(k, 'y0', solids).map(e => e.to - e.from)) > .6 && streetLen(k, solids) > .6) why.push('المطبخ على الواجهة الأمامية (الشارع).');
  }
  return why;
}

/**
 * ممرات المخطط المرسوم (بالمستطيلات الصافية، لكل دور): الطول، وهل الغرف على جانب واحد فقط. غرفة «تلامس» جانب الممر
 * إن فصلها عنه جدار (≤ 0.3 م) وتداخلت معه بطوله. تستعملها بوابة الجودة وأدلة القبول (أطول ممر).
 */
export function planCorridors(rooms) {
  const out = [];
  for (const c of rooms.filter(r => r.type === 'corridor' && /^(ممر الغرف|ممر)$/.test(r.name))) {
    const w = c.x1 - c.x0, d = c.y1 - c.y0, horiz = w >= d, len = Math.max(w, d);
    const others = rooms.filter(o => o !== c && o.li === c.li && o.type !== 'courtyard');
    const cover = sd => sum(others.map(o => {
      const gap = sd === 'y0' ? c.y0 - o.y1 : sd === 'y1' ? o.y0 - c.y1 : sd === 'x0' ? c.x0 - o.x1 : o.x0 - c.x1;
      if (gap < -.05 || gap > .3) return 0;
      return horiz ? Math.max(0, Math.min(c.x1, o.x1) - Math.max(c.x0, o.x0)) : Math.max(0, Math.min(c.y1, o.y1) - Math.max(c.y0, o.y0));
    }));
    const cov = (horiz ? ['y0', 'y1'] : ['x0', 'x1']).map(cover);
    out.push({ name: c.name, li: c.li, len: r2(len), single: Math.min(...cov) < len * .5 });
  }
  return out;
}

// ------------------------------------------------------------------------------------------ الواجهة العامة
function buildDoc(site, land, title) {
  let doc = createDoc({ title });
  // (الجولة الرابعة عشرة) سترة السطح بارتفاع خصوصية 1.8 م — قيمة تصميمية افتراضية للميزان (يغيّرها العميل)
  doc.roof = { ...(doc.roof || {}), parapet: 1.8, parapetTier: 'mizan-default' };
  doc = applyCommand(doc, { type: 'set-plot', polygon: site.polygon, setbacks: site.setbacks, north: 0, entry: site.entry, streetWidth: site.plot?.streetWidth ?? null }).doc;
  if (land?.streets?.length && land?.entries?.length) doc = applyCommand(doc, { type: 'set-plot', streets: land.streets, entries: land.entries }).doc;
  return doc;
}
function transformFor(site, cand, mirror) {
  const F = frameOf(site.fp, site.entry);
  let pl = site.place(cand.ew, cand.ed);
  if (site.placeRects) { const rs = solidRects(cand.sol).map(r => (mirror ? { ...r, x0: cand.ew - r.x1, x1: cand.ew - r.x0 } : r)); const q = site.placeRects(rs, cand.ew, cand.ed); if (q.over > 1e-6) throw Error('المبنى لا يتسع داخل حدود الأرض بهذا الاتجاه.'); pl = q; }
  // (الجولة الثانية عشرة) إزاحة المبنى إلى الخلف لاتساع المواقف المطلوبة نظاميًا في الارتداد الأمامي (أرض مستطيلة فقط)
  if (cand.parkShift && !site.placeRects) pl = { ...pl, oy: pl.oy + cand.parkShift };
  // (الجولة الرابعة عشرة) المبنى على أحد جانبي الأرض (لا في وسطها) ليتسع موقفان عموديان بجانبه خارج ممرات الأبواب ونوافذ الواجهة
  if (cand.parkSide && !site.placeRects) pl = { ...pl, ox: cand.parkSide === 'lo' ? 0 : snap(site.W - cand.ew - .02) };
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
// ميزانيات حتمية (بالعدد لا بالزمن): كم مرشحًا يُبنى ويُراجَع، وكم ترتيبًا أرضيًا يُجرَّب للدورين
// أدنى اختلاف بين أي بديلين معروضين: دونه يكون «البديل» إزاحة للتنظيم نفسه (فُحص بصريًا: 0.13–0.15 = جناح الخدمة
// والصالة وجناح النوم في المواضع نفسها). قرار المالك: عدد أقل مختلف فعلًا خير من عدد مكتمل بنسخ متقاربة
const MIN_ALT_DIFF = .16, HALL_ALT_ASPECT = 2.2, HALL_ALT_DRAWN = 2.15; // الصالة المرسومة في البدائل ≤ 2.15 (كما تقيسها الاختبارات وأدلة القبول؛ كانت 2.2 فتسرب «صالة-ممر» 2.18)
// والحاكم: الاختلاف المعماري (dist/arch-difference.mjs) — دون عتبة «الشكلي» (0.18) البديلان التنظيم نفسه
const MIN_ARCH_DIFF = ARCH_T.cosmetic;
const BUILD_MAX = 18, BUILD_SPARE = 4, BUILD_MAX2 = 8, SCHED_EXTRA = 70, SECOND_MAX = 20; // (الجولة الحادية عشرة) البحث الثاني: حتى 10 أشجار لم يُبنَ من نمطها شيء
function patOf(c) { return c.mode + ':' + c.tag; }

/** يولّد المرشحين لكل نمط ويحل أبعادهم. */
function candidates(P, site, { stair = false, rules = [], entry = 's', iters = 140, avoid = new Set(), exclude = new Set(), prefPat = null, minEnv = 0, minDepth = 0, backAfterStair = 0, trees = null, ruleK = RULE_K, extra = null, capSuite = 0, foyerYard = false } = {}) {
  const kitchenFront = rules.some(r => r.kind === 'place' && r.side === 'front' && /kitchen|مطبخ/.test(String(r.a)));
  // غرف النوم على الواجهة الأمامية بطلب العميل («غرفة النوم على الشارع»): لا جزاء
  const bedFront = rules.some(r => r.kind === 'place' && r.side === 'front' && ['bedrooms', 'master', 'kids', 'elderly', 'onebed'].includes(r.a));
  const out = [], jobs = [], ctx = { maxBuilt: site.maxBuilt, minEnv, minDepth, backAfterStair, kitchenFront, capSuite, bedFront, foyerYard, narrow: site.W < NARROW_W };
  for (const tr of trees || partiTrees(P, { stair, W: site.W, irregular: !!site.placeRects }).filter(t => !t.late)) {
    if (avoid.has(tr.mode) || exclude.has(tr.mode + ':' + tr.tag)) continue;
    let lastRp = null;
    const ctxT = tr.foyerYard || tr.hardDress ? { ...ctx, foyerYard: !!tr.foyerYard || ctx.foyerYard, hardDress: !!tr.hardDress } : ctx;
    const evalFn = (sol, ew, ed) => {
      let s = scoreV2(sol, P, ew, ed, ctxT); if (s === null) return null;
      // (الجولة التاسعة) أنماط تضع المجلس في شريط ضيافة ضيق: حد 24 م² مخالفةٌ في البحث نفسه (لا يُبنى ثم يُرفض)
      if (tr.hardMajlis) { const sh = majlisShort(sol, P); if (sh > 0) { s += 600 + 200 * sh; sol.viol = (sol.viol || 0) + 1; } }
      // (الجولة التاسعة عشرة) إعادة حل قريب: عرض المجلسين الصافي ≥ 4.2 م بهامش 0.15 م (التقدير هنا على الكتلة؛ الحكم على المرسوم)
      if (tr.hardWidth) for (const q of sol.placed) if (q.block.kind === 'majlis' && !q.block.fixedArea) { const w = W_(q.r), h = H_(q.r), b = q.block;
        const mw = b.guestWc && b.men ? (m => Math.min(m.w, m.h))(menStrip(q.r, P)) : b.guestWc ? Math.max(Math.min(w - DESIGN_TARGETS.guestStripW, h), Math.min(w, h - DESIGN_TARGETS.guestStripW)) : Math.min(w, h);
        const dw = MAJLIS_MIN_W + .15 - (mw - WALL_NET); if (dw > 0) { s += 600 + 400 * dw; sol.viol = (sol.viol || 0) + 1; } }
      if (tr.hardDining) for (const q of sol.placed) if (q.block.kind === 'dining' && !q.block.fixedArea) { const na = (W_(q.r) - WALL_NET) * (H_(q.r) - WALL_NET); if (na < DIN_MIN_AREA + .5) { s += 600 + 200 * (DIN_MIN_AREA + .5 - na); sol.viol = (sol.viol || 0) + 1; } }
      if (site.placeRects) {
        // أرض غير منتظمة: كل فراغ مبني داخل المضلع (تجاوز متدرج = مخالفة يتجه البحث لإزالتها)، ومكافأة على
        // استعمال ما لا يتسع له مستطيل كامل (المبنى يتبع شكل الأرض، كجناح خلفي أعرض على أرض تتسع للخلف)
        const pl = site.placeRects(solidRects(sol), ew, ed);
        if (pl.over > 1e-6) { s += 600 + 400 * pl.over; sol.viol = (sol.viol || 0) + 1; }
        else {
          s -= 40 * Math.max(0, ew - site.rectW(ed));
          // (الجولة الرابعة عشرة) لا يُدفع المبنى إلى الخلف تاركًا فناءً أماميًا ميتًا: حوش خلفي ≥ 6 م (4.5 م بعد ارتداد الجار) متى سمح العمق
          // — تفضيل سعودي افتراضي للميزان (جزاء لا رفض؛ المراجع المستقل r13: C5-1/3/4 بفناء أمامي 12–13 م وحوش خلفي 1.7 م)
          if (!R14_OFF.has('yard')) { const rear = site.D - (pl.oy + ed); if (rear < 4.5 && pl.oy > .5) s += 90 * Math.min(4.5 - rear, pl.oy); }
        }
      }
      const rp = rulePenalty(sol.placed, ruleCirc(sol.circ), ew, ed, rules, entry); lastRp = rp; return s + ruleK * (rp.base + Math.min(...rp.p)) + (extra ? extra(sol, ew, ed) : 0);
    };
    jobs.push({ tr, evalFn, it: optimizeSteps(tr.tree, site, evalFn, { iters: globalThis.__v2iters || tr.iters || iters, seed: tr.seed || tr.tag, tol: tr.tol || 2 }), best: null, steps: 0, done: false, ms: 0 });
  }
  // مجدول حتمي: كل نمط بدايتان، ثم يُكمل ما بلغ القبول بداياته المنتظمة، ثم ميزانية ثابتة من البدايات الإضافية
  // للأنماط القريبة من القبول (مخالفة أو اثنتان) بالأقرب أولًا — لا ميزانية زمنية، فالطلب نفسه يعطي النتيجة نفسها
  const step = j => { const t0 = now(), r = j.it.next(); j.ms += now() - t0; if (r.done) j.done = true; else { j.best = r.value; j.steps++; } };
  const rulesOK = j => { const b = j.best; if (!rules.length) return true; if (b._rok === undefined) { const rp = rulePenalty(b.sol.placed, ruleCirc(b.sol.circ), b.ew, b.ed, rules, entry); b._rok = rp.base + Math.min(...rp.p) < 5; } return b._rok; };
  for (const j of jobs) while (!j.done && j.steps < 2) step(j);
  const finish = () => { for (const j of jobs) while (!j.done && j.best && !j.best.sol.viol) step(j); };
  finish();
  for (let b = 0; b < (globalThis.__v2cfg?.sched ?? SCHED_EXTRA); b++) {
    // الاختيار يعرض بديلًا واحدًا على الأكثر من كل نمط تنظيمي (العائلة)، فلا تُصرف البدايات الإضافية على نمط نجح غيره من
    // عائلته — تذهب إلى التنظيمات التي لم ينجح منها شيء بعد (تنوع حقيقي بالميزانية نفسها)
    // (النسخة المتدرجة على أرض غير منتظمة تُعد تنظيمًا مستقلًا هنا: هي التي تتبع شكل الأرض)
    const fam = j => j.tr.mode + (j.tr.stepped ? '#t' : '');
    // (الجولة السابعة) العائلة «نجحت» فقط إن نجح منها نمط بلا مخالفة **وينفّذ قواعد العميل** (عقوبة القواعد ≈ 0): نمط
    // بلا مخالفة يخالف «غرفة الضيوف قرب المجلس» كان يحجب البدايات الإضافية عن نسخة عائلته التي تنفّذه
    const done = new Set(jobs.filter(j => j.best && !j.best.sol.viol && rulesOK(j)).map(fam));
    const open = jobs.filter(j => !j.done && j.best && j.best.sol.viol && j.best.sol.viol <= (j.tr.tol || 2) && !done.has(fam(j))).sort((a, c) => a.steps - c.steps || a.best.sol.viol - c.best.sol.viol || a.best.p - c.best.p);
    if (!open.length) break;
    step(open[0]); finish();
  }
  for (const { tr, best, ms } of jobs) {
    if (globalThis.__v2dbg) globalThis.__v2dbg['ms:' + tr.tag] = Math.round(ms) + (best && !best.sol.viol ? '' : 'x');
    if (!best || best.sol.viol) {
      const d = globalThis.__v2dbg;
      if (d && tr.swaps) (d.localFail ||= []).push({ swaps: tr.swaps, best: !!best, viol: best ? (() => { const o = {}; globalThis.__v2dbg = o; scoreV2(best.sol, P, best.ew, best.ed, ctx); globalThis.__v2dbg = d; return Object.keys(o).join(','); })() : null });
      if (d) { d['tree:' + tr.tag] = best ? best.sol.viol : -1; if (best) { const o = {}; globalThis.__v2dbg = o; scoreV2(best.sol, P, best.ew, best.ed, ctx); globalThis.__v2dbg = d; d['why:' + tr.tag] = Object.keys(o).join(','); if (d.keepSol) d['sol:' + tr.tag] = { sol: best.sol, ew: best.ew, ed: best.ed }; } }
      continue;
    }
    const rp = rulePenalty(best.sol.placed, ruleCirc(best.sol.circ), best.ew, best.ed, rules, entry);
    if (globalThis.__v2dbg?.keepSol) globalThis.__v2dbg['sol:' + tr.tag] = { sol: best.sol, ew: best.ew, ed: best.ed, ok: true };
    out.push({ mode: tr.mode, tag: tr.tag, tree: tr.tree, late: !!tr.late, stepped: !!tr.stepped, sol: best.sol, ew: best.ew, ed: best.ed, pen: best.p - (prefPat && patOf(tr) === prefPat ? PREFER_BONUS : 0), rp, swaps: tr.swaps || null });
  }
  return out.sort((a, b) => a.pen - b.pen);
}

/**
 * يختار حتى keep بدائل: الأول أفضلها (أقل بنود طلب غير منفذة ثم الجودة)، والبقية مجموعة تُعظِّم أدنى اختلاف ثنائي
 * (بحث شامل في المجموعات؛ المرشحون قليلون) مع جزاء للجودة الأضعف وللبنود غير المنفذة.
 */
function pickDiverse(pool, keep) {
  if (!pool.length) return [];
  const mand = c => (R14_OFF.has('r19mand') ? 0 : (c.r16 || []).filter(id => MANDATORY_R16.includes(id)).length);
  pool.sort((a, b) => (a.fails + mand(a)) - (b.fails + mand(b)) || a.fails - b.fails || (a.editDiff ?? 0) - (b.editDiff ?? 0) || a.quality - b.quality);
  // بند موضع أو تباعد صريح («المطبخ في الخلف»، «الماستر بعيدة عن الدرج») ينفّذه الأفضل: لا يُعرض بديل يخالفه أبدًا
  { const hard = x => (x.ledger || []).filter(l => !l.ok && (l.kind === 'place' || l.kind === 'far')).map(l => l.text);
    const okBest = new Set((pool[0].ledger || []).filter(l => l.ok && (l.kind === 'place' || l.kind === 'far')).map(l => l.text));
    pool = pool.filter((c, i) => i === 0 || !hard(c).some(t => okBest.has(t))); }
  // (الجولة السابعة) لا غرفة نوم على واجهة الشارع في البدائل ما لم يطلبها العميل (خصوصية) — إلا إن كان الأفضل نفسه كذلك
  if (!(pool[0].streetBeds || []).length) pool = pool.filter((c, i) => i === 0 || !(c.streetBeds || []).length);
  // (الجولة الثامنة عشرة) مسار ضيف الرجال إلى الطعام دون عبور العائلة شرط افتراضي قوي في كل البدائل (المراجع المستقل r17: العيب المهيمن في
  // 7 من 22): لا يُعرض بديل يعبر فيه الضيف منطقة العائلة ما دام الأفضل لا يعبرها — يحل محله تنظيم يصل المجلس بالطعام إن وُجد (والبحث
  // الثاني يُطلق متى قلّ العدد)، وإلا يقل العدد ويُذكر السبب (لا حشو). العميل الذي طلب فصل المجلس عن الطعام يُعفى (القياس لا ينطبق).
  // (الجولة التاسعة عشرة، توجيه المالك) كل مخالفة إلزامية في الميزان (MANDATORY_R16: مسار الضيف، والموقف الذي لا تدخله السيارة) تُعامل كبند
  // صريح لم يتحقق: الأفضل أولًا ما خلا منها، ولا يدخل الاختيار ما فيه منها ما دام الأفضل خاليًا (وحالة العرض تحجبه في كل الأحوال)
  if (!R14_OFF.has('r19mand')) { if (!mand(pool[0])) pool = pool.filter((c, i) => i === 0 || !mand(c)); }
  else if (!R14_OFF.has('r18guest') && !(pool[0].r16 || []).includes('GUEST_DINING')) pool = pool.filter((c, i) => i === 0 || !(c.r16 || []).includes('GUEST_DINING'));
  // لا «صالة-ممر» في البدائل: الأفضل يبقى (حده الصلب في التقييم)، وأي بديل آخر صالته الصافية بنسبة ≤ 2.2
  { const hallAsp = c => { const h = c.dr?.rooms?.find(r => r.name === 'الصالة' && r.li === 0); if (!h) return 0; const w = h.x1 - h.x0, d = h.y1 - h.y0; return Math.max(w, d) / Math.min(w, d); };
    pool = pool.filter((c, i) => i === 0 || hallAsp(c) <= HALL_ALT_DRAWN); }
  const best = pool[0], q0 = best.quality, edit = pool.some(c => c.editDiff !== undefined);
  if (globalThis.__v2dbg) (globalThis.__v2dbg.pick ||= []).push(pool.map(c => c.pat + ':' + Math.round(c.quality)).join(' '));
  const D = new Map(), d = (a, b) => { const k = a.pat < b.pat ? a.pat + '|' + b.pat : b.pat + '|' + a.pat; if (!D.has(k)) D.set(k, roomsDifference(a.dr, b.dr)); return D.get(k); };
  // الاختلاف المعماري (تجاور + حركة + نطاقات، dist/arch-difference.mjs): المقياس الحاكم للاختيار. يُحسب كسولًا ويُخزَّن،
  // ولا يُحسب أصلًا لزوج مرفوض بالمقياس القديم أو بقاعدة العائلة (لا حاجة إليه، وهو أغلى)
  // (الجولة الحادية عشرة) المقياس الحاكم: الاختلاف الوظيفي v2 (توزيع الوظائف، الحركة، الخصوصية، العلاقات). زوج مقبول معًا فقط إن كان
  // «مختلفًا معماريًا» (بعدان جوهريان على الأقل)؛ «اختلاف جزئي» لا يكفي، وموضع السلم والغلاف لا يُحتسبان بذاتهما. والهدف: أعلى أدنى إجمالي v2
  const AD = new Map(), sigOf = c => (c.sig2 ||= archSignatureV2(c.doc));
  const adv = (a, b) => { const k = a.pat < b.pat ? a.pat + '|' + b.pat : b.pat + '|' + a.pat; if (!AD.has(k)) AD.set(k, archDifferenceV2(sigOf(a), sigOf(b))); return AD.get(k); };
  const ad = (a, b) => adv(a, b).total, distinct = (a, b) => adv(a, b).verdict === 'distinct';
  const famOf = x => String(x.pat).split('/')[0].split(':')[0] + (String(x.pat).includes('/') ? ':' + String(x.pat).split('/')[0].split(':')[1] : '');
  /** زوج مقبول معًا: ليس من العائلة نفسها، والمقياسان فوق عتبتيهما (القديم ≥ 0.16، والمعماري ≥ عتبة «الشكلي» 0.18). */
  // (الجولة التاسعة) الكتلة: بيت تقسمه حديقة/حوش داخل غلافه (كتلتان) تنظيم مختلف عن كتلة مصمتة ولو تتابعت الغرف نفسها —
  // على الأرض الضيقة تتقارب مراكز الغرف حتمًا، فالفرق في الفراغات المكشوفة داخل الغلاف (≥ 12 م²) يقوم مقام إزاحة المراكز
  const openA = c => (c.cand?.sol ? sum([...(c.cand.sol.voids || []), ...(c.cand.sol.courts || [])].filter(v => v.x0 > .05 || v.y0 > .05).map(A_)) : 0);
  const massDiff = (a, b) => Math.abs(openA(a) - openA(b)) >= 12;
  void massDiff; void d;
  // (الجولة الخامسة عشرة) والمقياس الأول (تجاور + حركة + نطاقات) فوق عتبة «الشكلي» أيضًا كما يقول التعليق أعلاه: «الحوش الجانبي» و«المجلس
  // الجانبي» على الأرض نفسها بعمود ضيافة وخدمة وصالة وسطى = v2 «مختلف» لكن v1 0.14 (متشابهان للعين) — لا يُعرضان معًا (لا حشو)
  const V1 = new Map(), v1 = (a, b) => { const k = a.pat < b.pat ? a.pat + '|' + b.pat : b.pat + '|' + a.pat; if (!V1.has(k)) V1.set(k, archDifference(a.sig1 ||= archSignature(a.doc), b.sig1 ||= archSignature(b.doc)).total); return V1.get(k); };
  const okPair = (a, b) => (edit || famOf(a) !== famOf(b)) && distinct(a, b) && (edit || v1(a, b) >= MIN_ARCH_DIFF);
  // المرسى (البديل الأول المعروض): الأفضل، أو بديل قريب منه جودةً وبالبنود نفسها — فلا يقيّد الأفضلُ وحده تنوع المجموعة
  const anchors = new Set(edit ? [best] : pool.filter(c => c.fails === best.fails && c.quality <= q0 + 120).slice(0, 4));
  /** أفضل مجموعة بحجم need من cand (كل زوج ≥ 0.12 وفيها مرسى)، أو null. */
  const search = (cand, need) => {
    let set0 = null, sc0 = -Infinity;
    const rec = (start, set) => {
      if (set.length === need) {
        if (!set.some(c => anchors.has(c))) return;
        // كل زوج مقبول أصلًا (okPair عند الإضافة): نمطان من العائلة نفسها (حوش ونسخته بتبادل المجلسين، أو U ونسخته)
        // لا يُعرضان معًا، ولا بديلان اختلافهما المعماري «شكلي» (< 0.18) — قرار المالك: الاختلاف معماري لا تجميلي
        let mn = Infinity, sm = 0, n = 0;
        for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) { const v = ad(set[i], set[j]); mn = Math.min(mn, v); sm += v; n++; }
        const modes = new Set(set.map(x => x.mode)).size;
        // دوران: تنظيم الدور الأرضي نفسه يختلف بين البدائل ما أمكن (لا علوي مختلف على أرضي واحد)
        const grounds = new Set(set.map(x => String(x.pat).split('/')[0])).size;
        // الهدف: أعلى «أدنى اختلاف معماري» في المجموعة أولًا، ثم متوسطه، ثم الجودة والبنود
        // (الجولة السابعة عشرة) بين مجموعتين بالعدد نفسه ومختلفتين معماريًا: تتقدم التي فيها بدائل أقل تحتاج تعديلات (عيب جوهري مقيس:
        // ضيف يعبر العائلة إلى الطعام، صالة ممر…) — المراجع المستقل r16: البدائل المعزولة المجلس اختيرت للتنوع وحده وفي المرشحين ما يخلو منه
        const sc = (n ? 3 * mn + .5 * sm / n : 0) + .05 * modes + .04 * grounds - sum(set.map(c => .00015 * Math.max(0, c.quality - q0) + .06 * (c.fails - best.fails) + (R14_OFF.has('r17sel') ? 0 : (c.major?.length ? .6 + .2 * (c.major.length - 1) : 0))));
        if (sc > sc0) { sc0 = sc; set0 = set; }
        return;
      }
      for (let i = start; i <= cand.length - (need - set.length); i++) if (set.every(o => okPair(o, cand[i]))) rec(i + 1, [...set, cand[i]]);
    };
    rec(0, []); return set0;
  };
  // بنود الطلب أولًا: البدائل التي تخفق في بند أكثر من الأفضل لا تدخل إلا إن لم يكتمل العدد المطلوب من بدائل مختلفة
  // فعلًا بدونها (وتبقى بنودها غير المنفذة ظاهرة في سجل المطابقة). يُعرض أكبر عدد مختلف فعلًا، لا بدائل متطابقة.
  let bestSet = [best];
  // قرار المالك: لا يُرفع العدد على حساب الجودة — لا يُعرض بديل يخفق في بند لا يخفق فيه الأفضل (لا حشو)
  for (const tolF of [0]) {
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
  // لا يُعرض بديلان شبه متطابقين (بالمقياسين: المراكز ≥ 0.16 والمعماري ≥ 0.18)
  const fin = sel.filter((c, i) => i === 0 || sel.slice(0, i).every(o => distinct(o, c)));
  fin.forEach(c => {
    const others = fin.filter(o => o !== c);
    c.minDiff = others.length ? Math.min(...others.map(o => d(o, c))) : null;
    c.minArchDiff = others.length ? Math.min(...others.map(o => ad(o, c))) : null;
  });
  return fin;
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
  // (الجولة الثانية عشرة) استراتيجيات موضعية أوسع قبل طلب إعادة التوزيع:
  //  (أ) قلب جناح: عكس ترتيب كتل المنطقة التي فيها فراغ البند (المطبخ ينتقل إلى الطرف الآخر من جناحه)؛
  //  (ب) نقل كتلة غرف: تبادل محتوى منطقتين كاملتين من الخدمة/العائلة (لا نوم ولا مجلس) — المناطق الأخرى بأوزانها كما هي.
  const famZone = z => z.b.length && z.b.every(b => SWAP.has(b.kind));
  zs.forEach((z, iz) => {
    if (z.b.length >= 2 && z.b.some(b => ruleIds.has(b.id))) { const tree = cloneTree(base.tree), cz = zonesOf(tree); cz[iz].b.reverse(); cz[iz].w.reverse(); vars.push({ mode: base.mode, tag: base.tag, tree, stepped: base.stepped, swaps: [[z.b.map(b => b.name).join(' و'), 'عكس ترتيبها في جناحها']], wingFlip: true }); }
    if (!famZone(z) || !z.b.some(b => ruleIds.has(b.id))) return;
    zs.forEach((z2, j) => { if (j === iz || !famZone(z2)) return; const tree = cloneTree(base.tree), cz = zonesOf(tree); [cz[iz].b, cz[j].b] = [cz[j].b, cz[iz].b]; [cz[iz].w, cz[j].w] = [cz[j].w, cz[iz].w]; vars.push({ mode: base.mode, tag: base.tag, tree, stepped: base.stepped, swaps: [[z.b.map(b => b.name).join(' و'), z2.b.map(b => b.name).join(' و')]], blockMove: true }); });
  });
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
/**
 * ذاكرة نتائج اختيارية يحقنها المضيف (globalThis.__mizanGenCache = { get(key), set(key, value) }): المولّد حتمي، فالطلب
 * نفسه يعطي البدائل نفسها؛ تستعملها مجموعة الاختبارات لمشاركة النتائج بين ملفاتها في التشغيل الواحد. بلا مضيف = لا شيء.
 */
/**
 * مفتاح الذاكرة: الطلب نفسه بصيغة قانونية — مفاتيح الكائنات مرتبة، والقيم الافتراضية للمعاملات (exclude: []، prefer: null،
 * العنوان الافتراضي) محذوفة؛ فالطلب نفسه من مسارين (generateInitialDesign والمولّد مباشرة) يُحسب مرة واحدة. لا يُحذف شيء
 * من المتطلبات نفسها (السجل يُقاس منها).
 */
function cacheKey(args) {
  const DEF = { exclude: a => Array.isArray(a) && !a.length, prefer: v => v == null, title: v => v === 'تصميم أولي من شرعاء' };
  const canon = (v, top) => {
    if (Array.isArray(v)) return '[' + v.map(x => canon(x)).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined && !(top && DEF[k]?.(v[k]))).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return v === undefined ? 'null' : JSON.stringify(v);
  };
  return canon(args, true);
}
function cached(kind, args, fn) {
  const hook = globalThis.__mizanGenCache; if (!hook) return fn(args);
  let key; try { key = VILLA_V2_ENGINE_VERSION + '|' + kind + '|' + cacheKey(args); } catch { return fn(args); }
  const hit = hook.get(key);
  if (hit) { const P = programV2(args.counts, args.requirements || {}); P.entry = hit.program?.entry; hit.program = P; return hit; }
  const out = fn(args); try { hook.set(key, out); } catch { /* لا يُخزَّن */ } return out;
}
export function generateVillaDesigns(args) { return withPresentation(args, withReadings(interpret(args), a => cached('one', a, x => withParkReserve(x, generateVillaDesigns0)))); }
export function generateVillaTwoFloors(args) {
  const out = withReadings(interpret(args), a => cached('two', a, x => withParkReserve(x, generateVillaTwoFloors0)));
  for (const d of out.designs || []) tfPolish(d, args);
  pluralMajlis(out, args);
  return withPresentation(args, out);
}
/**
 * (الجولة الرابعة عشرة) تشطيب مخطط الدورين بعد التوليد (المراجع المستقل r13، C7):
 *  - ترقيم غرف النوم متتاليًا في كل دور (الرئيسية «1» ضمنًا إن كانت في الدور: 2، 3…؛ وإلا من 1) — لا «3–6» في العلوي؛
 *  - منور سماوي فوق الدرج الداخلي (doc.stairs[].skylight) يُرسم في المجسّم ويُذكر — قيمة تصميمية افتراضية للميزان؛
 *  - باب الرئيسية العلوية في طرف جدارها البعيد عن الدرج (لا على بسطة الوصول) إن بقيت الحركة الفعلية والتطابق سليمين.
 */
function tfPolish(d, args) {
  const doc = d.doc; if (!doc || doc.levels.length < 2 || d._polished) return; d._polished = true;
  // الترقيم
  for (const lv of doc.levels) {
    const L = doc.labels.filter(l => l.level === lv.id), beds = L.filter(l => l.type === 'bedroom' && /^غرفة نوم \d+$/.test(l.name)).sort((a, b) => +a.name.split(' ')[2] - +b.name.split(' ')[2]);
    const start = L.some(l => l.type === 'master') ? 2 : 1, map = new Map(beds.map((l, i) => [l.name.split(' ')[2], String(start + i)]));
    if ([...map].every(([a, b]) => a === b)) continue;
    for (const l of L) { const m = /^(غرفة نوم|حمام غرفة|مدخل غرفة|خزانة غرفة) (\d+)$/.exec(l.name); if (m && map.has(m[2])) l.name = `${m[1]} ${map.get(m[2])}`; }
    d.notes = [...(d.notes || []), `رُقّمت غرف النوم في «${lv.name || lv.id}» متتالية (${[...map.values()].join('، ')}).`];
  }
  // المنور السماوي فوق الدرج
  if ((doc.stairs || []).length && !R14_OFF.has('skylight')) { for (const st of doc.stairs) st.skylight = true; d.notes = [...(d.notes || []), 'منور سماوي فوق الدرج يضيئه طبيعيًا (قيمة تصميمية افتراضية للميزان؛ مقاسه وتفصيله يُعتمدان مع المصمم).']; }
  // باب الرئيسية بعيدًا عن الدرج (بمسار المشي من وصول الدرج — الجولة الخامسة عشرة)
  if (!R14_OFF.has('masterdoor')) { const r = masterDoorFar(doc, reviewRequest(args.requirements || {}, args.land, args.counts)); if (r?.note) d.notes = [...(d.notes || []), r.note]; }
  // (الجولة التاسعة عشرة، توجيه المالك ثالثًا؛ المراجع المستقل r18: C7-1) الرئيسية «بعيدة عن الدرج» لا بمسار المشي وحده: إن كان بابها على
  // الفراغ المفتوح الذي يصل إليه الدرج (قوس بين ردهة الدرج والصالة العلوية) تُغلق الصالة العلوية على الدرج بباب في موضع القوس — صالة
  // عائلية علوية خاصة يُدخل منها إلى الرئيسية، لا ردهة درج — بشرط بقاء الحركة الفعلية والتطابق سليمين
  if (!R14_OFF.has('r19master')) { const r = masterStairDoor(doc, args); if (r) d.notes = [...(d.notes || []), r]; }
  // (الجولة السابعة عشرة) بيت درج للسطح: الوصول إلى السطح متوقع في الفيلا السعودية (الخزانات والتكييف) — المرسم والمجسّم لا يمثّلان دور سطح
  // بعد، فلا يُرسم ولا يُدّعى؛ يُذكر أنه يلزم فوق الدرج نفسه (المراجع المستقل r16، C7)
  if ((doc.stairs || []).length && !R14_OFF.has('r17roof')) d.notes = [...(d.notes || []), 'بيت درج للسطح: يلزم فوق الدرج نفسه إن كان الوصول إلى السطح مطلوبًا (الخزانات والتكييف) — لم يُرسم في هذا المقترح لأن المرسم والمجسّم لا يمثّلان دور السطح بعد؛ يُضاف في التصميم التفصيلي.'];
  // (الجولة التاسعة عشرة) ملاحظة الحمامات العلوية فوق الجاف تُعاد من المستند بعد الترقيم (كانت تُكتب قبله فتسمي «حمام غرفة 3» ما صار «2»)
  { const wd = wetOverDry(doc); d.notes = (d.notes || []).filter(n => !/^حمامات في الدور العلوي فوق فراغات جافة/.test(n)); if (wd.length) d.notes.push(`حمامات في الدور العلوي فوق فراغات جافة في الأرضي: ${wd.map(x => `«${x.bath}» فوق «${x.over}» (${x.pct}٪)`).join('، ')} — عيب معماري، ويحتاج مراجعة صحية وإنشائية متخصصة (الصرف والعزل المائي وفتحة صيانة).`); }
  // السجل بعد التشطيب (الباب والترقيم): يُقاس من المستند النهائي نفسه
  try { const entry = args.land?.entries?.[0] || doc.entry || 's'; d.ledger = verifyRequest(doc, args.requirements || {}, { entry }); d.fails = d.ledger.filter(x => !x.ok).length; } catch { /* يبقى السابق */ }
}
function masterStairDoor(doc, args) {
  try {
    const req = reviewRequest(args.requirements || {}, args.land, args.counts), fail = () => measureR16(doc, req).find(g => g.id === 'MASTER_STAIR_DOOR' && g.applicable && !g.pass);
    const f0 = fail(); if (!f0) return null;
    const M = analyzeDoc(doc), U = M.levels[1], cl = new Set(f0.value.stairSpace), rq = reviewRequest(args.requirements || {}, args.land, args.counts);
    const arches = U.openings.filter(op => op.o?.kind === 'arch' && op.sides.length === 2 && op.sides.every(x => x.other !== 'outside' && cl.has(x.room.name)));
    // الأقرب إلى الرئيسية أولًا (القوس الذي يفصل الصالة العلوية عن ردهة الدرج)
    const mR = U.rooms.find(r => r.type === 'master'); const dist = op => Math.hypot(op.p.x - mR.inside.x, op.p.y - mR.inside.y);
    for (const op of arches.sort((a, b) => dist(a) - dist(b))) {
      const o = doc.openings.find(x => x.id === op.id); if (!o) continue; const old = { ...o };
      const dbl = o.w >= 1.4; Object.assign(o, dbl ? { kind: 'door2', w: Math.min(o.w, 1.6) } : { kind: 'door', w: Math.min(o.w, .9) }, { h: 2.1, sill: 0, swing: 'in', hinge: o.hinge || 'left' });
      if (!fail() && ['CIRCULATION', 'CONSISTENCY_2D3D'].every(id => heavyGate(id, doc, rq).ok)) { const nm = op.sides.map(x => x.room.name); return `الصالة العلوية تُغلق على الدرج ${dbl ? 'بباب مزدوج' : 'بباب'} بين «${nm[0]}» و«${nm[1]}»: باب الغرفة الرئيسية على صالة عائلية خاصة لا على ردهة الدرج المفتوحة (طلبك: الماستر بعيدة عن الدرج).`; }
      for (const k of Object.keys(o)) delete o[k]; Object.assign(o, old);
    }
    return `باب الغرفة الرئيسية على الفراغ المفتوح الذي يصل إليه الدرج (${f0.value.stairSpace.join('، ')}) ولم يُفصل ببابٍ يبقي الحركة سليمة — يبقى عيبًا معماريًا مذكورًا.`;
  } catch { return null; }
}
/**
 * (الجولة الخامسة عشرة) باب الغرفة الرئيسية العلوية في موضع جدارها المشترك مع الصالة/الممر الذي يُبعد مسار المشي من وصول الدرج
 * إلى بابها أكثر ما يمكن (stairPathTo في rules.mjs — المقياس نفسه في سجل المطابقة)، بشرط بقاء الحركة الفعلية والتطابق سليمين.
 * يعيد { moved, before, after, note } أو null.
 */
function masterDoorFar(doc, req) {
  try {
    const M = analyzeDoc(doc), up = M.levels.find(lv => lv.rooms.some(r => r.type === 'master') && lv.levelIndex > 0);
    const master = up?.rooms.find(r => r.type === 'master'); if (!master) return null;
    const op = up.openings.find(o => o.door && o.sides.some(s => s.room.id === master.id) && o.sides.some(s => s.other !== 'outside' && ['living', 'corridor'].includes(up.roomsById.get(s.other)?.type)));
    if (!op) return null;
    const room = { name: master.name, level: up.level.id }, path = () => stairPathTo(doc, room)?.dist ?? null;
    const cur = path(); if (cur == null) return null;
    const other = up.roomsById.get(op.sides.find(s => s.room.id === master.id).other), ids = new Set(other.edges.map(e => e.edgeId));
    const es = master.edges.filter(e => ids.has(e.edgeId) && e.wallIds.includes(op.wall.id)), w = op.wall, u = norm(sub(w.b, w.a));
    const ts = es.flatMap(e => [dot(sub(e.a, w.a), u), dot(sub(e.b, w.a), u)]); if (!ts.length) return null;
    const lo = Math.min(...ts) + op.w / 2 + .2, hi = Math.max(...ts) - op.w / 2 - .2;
    const o = doc.openings.find(x => x.id === op.id), old = o.at, cands = [];
    for (let t = lo; t <= hi + 1e-6; t += .3) { if (doc.openings.some(x => x !== o && x.wall === o.wall && Math.abs(x.at - t) < (x.w + o.w) / 2 + .15)) continue; o.at = Math.round(t * 100) / 100; const pd = path(); if (pd != null && pd > cur + .5) cands.push({ t: o.at, pd }); }
    o.at = old;
    // الأبعد أولًا؛ يُجرَّب حتى 16 موضعًا (الأبعد قد يسده أثاث الصالة فيُقبل التالي الأبعد السليم)
    for (const c of cands.sort((a, b) => b.pd - a.pd).slice(0, 16)) {
      o.at = c.t;
      if (['CIRCULATION', 'CONSISTENCY_2D3D'].every(id => heavyGate(id, doc, req).ok)) return { moved: true, before: cur, after: c.pd, note: `باب الغرفة الرئيسية في موضع جدارها الأبعد عن الدرج: مسار المشي من وصول الدرج إلى بابها ${Math.round(c.pd * 10) / 10} م بدل ${Math.round(cur * 10) / 10} م.` };
      o.at = old;
    }
    return { moved: false, before: cur, after: cur, note: `مسار المشي من وصول الدرج إلى باب الغرفة الرئيسية ${Math.round(cur * 10) / 10} م${cands.length ? ' (المواضع الأبعد على جدارها يسدها أثاث أو تكسر الحركة الفعلية فلم يُنقل إليها)' : ''}.` };
  } catch { return null; }
}
/**
 * (الجولة الرابعة عشرة) «المجالس» بالجمع ولم يُجب السؤال: يبقى السؤال قائمًا، ويُضاف — إن اتسعت المساحة — بديل بمجلسين (رجال ونساء)
 * مُعلَن القراءة، لا يُحتسب تكميلًا شكليًا (برنامج مختلف بقراءة أخرى لكلام العميل). لا يُضاف في التعديل ولا إن طلب العميل عددًا.
 */
function pluralMajlis(out, args) {
  const req = args.requirements || {};
  if (args.prefer || args._plural || !(req.ambiguous || []).some(a => a.type === 'majlis-plural') || req.answers?.['majlis-plural'] || (args.counts?.majlis ?? req.counts?.majlis) !== 1 || R14_OFF.has('plural')) return;
  if ((out.designs || []).length >= (args.keep || 4)) return;
  try {
    const req2 = JSON.parse(JSON.stringify(req)); req2.counts = { ...(req2.counts || {}), majlis: 2, baths: (req2.counts?.baths || args.counts?.baths || 0) + 1 };
    req2.answers = { ...(req2.answers || {}), 'majlis-plural': 2 };
    // بحث مختصر (ميزانية تكرارات أقل) — قراءة ثانية لا تُضاعف زمن التوليد على العميل
    // (الجولة السابعة عشرة) بحث كامل لا مختصر: القراءة الأخرى تنظيم حقيقي يُعرض (C7: مجلسان يتسعان بالبحث الكامل ولا يتسعان بالمختصر)
    const it0 = globalThis.__v2iters; globalThis.__v2iters = R14_OFF.has('r17plural') ? 50 : it0; let o2;
    try { o2 = generateVillaTwoFloors({ ...args, _plural: true, counts: { ...args.counts, majlis: 2, baths: (args.counts?.baths || 0) + 1 }, requirements: req2, keep: 1 }); } finally { globalThis.__v2iters = it0; }
    const d = o2.designs?.[0]; if (!d) return;
    d.notes = [...(d.notes || []), `قراءة «المجالس» بالجمع: مجلس رجال ومجلس نساء (السؤال ما زال قائمًا: مجلسان أم مجلس واحد؟) — بديل بقراءة أخرى لكلامك لا تكملة للعدد.`];
    d.pluralReading = true; out.designs.push(d);
  } catch (e) { if (out.designs?.[0]) out.designs[0].notes = [...(out.designs[0].notes || []), `جُرّب بديل بمجلسين (رجال ونساء) لقراءة «المجالس» بالجمع فلم يتسع في هذه الأرض مع البرنامج نفسه (${String(e.message || e).slice(0, 120)})؛ السؤال ما زال قائمًا.`]; }
}
/**
 * (الجولة الرابعة عشرة، قرار المالك) حالة العرض لكل بديل (dist/presentation-status.mjs): «جاهز للعرض المبدئي» / «يحتاج تعديلات (تُذكر)» /
 * «محجوب (السبب)». المحجوب (يخالف بندًا إلزاميًا من طلب العميل أو رسب في بوابة) لا يُعرض ما دام غيره موجودًا — ويُذكر في out.hidden؛
 * وإن حُجبت كلها يبقى الأول بحالته «محجوب» ظاهرة (لا يُقدَّم جاهزًا). في التوليد الأول يتقدم الجاهز على ما يحتاج تعديلات (ترتيب ثابت بعده).
 */
function withPresentation(args, out) {
  if (!out?.designs?.length) return out;
  const req = reviewRequest(args.requirements || {}, args.land, args.counts);
  for (const d of out.designs) { try { d.presentation = presentationStatus(d, req); } catch (e) { d.presentation = { status: 'needs-edits', label_ar: STATUS_AR['needs-edits'], hidden_ar: [], edits_ar: ['تعذّر حساب حالة العرض: ' + (e.message || e)], prefs: [], proposal_ar: PROPOSAL_LABEL_AR }; } }
  const hid = out.designs.filter(d => d.presentation.status === 'hidden'), vis = out.designs.filter(d => d.presentation.status !== 'hidden');
  if (vis.length && hid.length) {
    out.hidden = [...(out.hidden || []), ...hid.map(d => ({ pat: d.pat, reasons_ar: d.presentation.hidden_ar, pluralReading: !!d.pluralReading }))]; out.designs = vis;
    // (الجولة التاسعة عشرة) يُقال للعميل صراحة كم لم يُعرض ولماذا — ومنه قراءة «المجالس» التي لم تُرسم سليمة
    const one = hid.filter(d => !d.pluralReading && vis.some(v => v.pluralReading)), why = [...new Set(hid.flatMap(d => d.presentation.hidden_ar.map(x => x.replace(/ \(شرط إلزامي في الميزان[^)]*\)$/, ''))))].slice(0, 2).join('؛ ');
    const msg = one.length ? `قراءة «المجالس» بمجلس واحد لم تُعرض: البديل الذي اتسع بها فيه مخالفة إلزامية (${why})؛ عُرضت قراءة المجلسين وحدها، والسؤال قائم: مجلس رجال ومجلس نساء، أم مجلس واحد؟` : `لم يُعرض ${hid.length} ${hid.length === 1 ? 'بديل' : 'بدائل'} فيها مخالفة إلزامية (${why}).`;
    out.shortfall_ar = out.shortfall_ar ? `${out.shortfall_ar} ${msg}` : msg;
    if (out.designs[0]) out.designs[0].notes = [...(out.designs[0].notes || []), msg];
  }
  if (!args.prefer && out.designs.length > 1) { const rk = d => (d.presentation.status === 'ready' ? 0 : 1); const ord = out.designs.map((d, i) => [d, i]).sort((a, b) => rk(a[0]) - rk(b[0]) || a[1] - b[1]).map(x => x[0]); out.designs = ord; }
  out.presentation = { ready: out.designs.filter(d => d.presentation.status === 'ready').length, needsEdits: out.designs.filter(d => d.presentation.status === 'needs-edits').length, hidden: (out.hidden || []).length, label_ar: PROPOSAL_LABEL_AR };
  return out;
}
/**
 * (الجولة الثانية عشرة) عدد المواقف اشتراط نظامي (PARKING_RULE): إن رُفضت كل البدائل ولو واحد منها لعدم اتساع المواقف،
 * يُعاد التوليد بعمق محجوز أمام المبنى (موقف عمودي 5.5 م وهامشاه ناقص الارتداد الأمامي) — يُذكر في الملاحظات.
 */
function withParkReserve(args, gen) {
  try { return gen(args); } catch (e) {
    const pkWhy = /موقف مطلوب نظاميًا/;
    if (e?.code !== 'VILLA_BUILD_FAILED' || args.land?.parkReserve || !(e.rejected || []).some(r => (r.why || []).some(w => pkWhy.test(String(w))))) throw e;
    const rsv = Math.round(Math.max(.5, 5.9 - 3) * 100) / 100;
    try {
      const out = gen({ ...args, land: { ...args.land, parkReserve: rsv } });
      for (const d of out.designs) d.notes = [...(d.notes || []), `حُجز ${rsv} م أمام المبنى فوق الارتداد الأمامي لتتسع المواقف المطلوبة نظاميًا (${PARKING_RULE.source})؛ دون ذلك لم يتسع العدد في أي بديل.`];
      return out;
    } catch (e2) {
      if (e2?.code !== 'VILLA_BUILD_FAILED') throw e2;
      // ولا بالحجز: يُعرض البديل ونقصه النظامي معلن (بوابة المواقف راسبة ظاهرة في مراجعته) — لا يُخفى ولا يُدّعى التحقق
      PARK_SHORT_OK = true;
      try {
        const out = gen(args);
        for (const d of out.designs) { const n = (d.doc.zones || []).filter(z => z.type === 'garage').length; d.parkingShortfall = true; d.notes = [...(d.notes || []), `نقص نظامي معلن: لم يتسع في هذه الأرض لهذا البرنامج إلا ${n} من موقفين مطلوبين نظاميًا لأرض > 400 م² (${PARKING_RULE.source})، ولا بحجز ${rsv} م أمام المبنى (لم يتسع البرنامج حينها). يحتاج قرارك: تصغير البرنامج أو موقف مظلل داخل كتلة المبنى (غير مدعوم بعد).`]; }
        return out;
      } finally { PARK_SHORT_OK = false; }
    }
  }
}
/**
 * (الجولة الثانية عشرة) قبل التوليد: تعارض لم يُجب عنه يُرسم بالقراءة الحرفية لكلام العميل (applyLiteralReadings — يعدّل
 * requirements.counts في مكانه فيقيس السجل والمراجعة البرنامج نفسه)، والأعداد الممرَّرة تتبعه.
 */
function interpret(args) {
  const req = args.requirements;
  if (!req || typeof req !== 'object' || (!req.rules?.length && !req.ambiguous?.length)) return args;
  if (args.counts && req.counts && args.counts !== req.counts) for (const k of Object.keys(args.counts)) if (req.counts[k] === undefined) req.counts[k] = args.counts[k];
  if (args.counts && !req.counts) req.counts = { ...args.counts };
  const before = req.counts?.bedrooms;
  applyLiteralReadings(req, args.land || {});
  if (!args.counts || req.counts.bedrooms === args.counts.bedrooms) return args;
  void before;
  return { ...args, counts: { ...args.counts, bedrooms: req.counts.bedrooms } };
}
/** ملاحظات القراءة الحرفية والغموض على كل بديل (ما رُسم وما زال سؤالًا للعميل). */
function withReadings(args, run) {
  const out = run(args), req = args.requirements || {}, notes = [];
  for (const L of req.literal || []) notes.push(L.answered ? `بجوابك: ${L.reading_ar}.` : `قراءة حرفية لطلبك (سؤال التعارض لم يُجب بعد): ${L.reading_ar}. إن كانت من ضمن العدد قل «من ضمنها».`);
  for (const a of req.ambiguous || []) if (a.type === 'majlis-plural' && !req.answers?.['majlis-plural']) notes.push(`«${a.quote}» بالجمع: رسمت ${req.counts?.majlis >= 2 ? 'مجلسين كما في الأعداد' : 'مجلس رجال واحدًا (قيمة تصميمية افتراضية للميزان)'} — والسؤال قائم: مجلس رجال ومجلس نساء، أم مجلس واحد؟`);
  if (notes.length) for (const d of out.designs || []) d.notes = [...new Set([...(d.notes || []), ...notes])];
  return out;
}
function generateVillaDesigns0({ land, counts, requirements = {}, keep = 4, title = 'تصميم أولي من شرعاء', exclude = [], prefer = null }) {
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
  const prof = globalThis.__v2prof, tp = () => now();
  let tq = tp();
  const cands = candidates(P, site, { rules: P.rules, entry, avoid, exclude: ex, prefPat });
  if (prof) { prof.opt = (prof.opt || 0) + tp() - tq; tq = tp(); }
  if (!cands.length) {
    const need = sum(P.blocks.map(b => b.area)) + DESIGN_TARGETS.foyer + P.hallArea;
    const err = Error(`لم أجد توزيعًا مهنيًا لهذا البرنامج داخل المساحة القابلة للبناء (${r2(site.W)} × ${r2(site.D)} م)؛ البرنامج بالمقاسات التصميمية المستهدفة يحتاج نحو ${Math.round(need)} م².`);
    err.code = ex.size ? 'VILLA_EXHAUSTED' : 'VILLA_NO_FIT'; err.need = need; err.available = site.W * site.D; throw err;
  }
  const built = [], rejected = [], softMajlis = [], nearMiss = []; let tried = 0;
  // ترتيب البناء بالتناوب بين الأنماط (أفضل كل نمط أولًا، ثم ثاني كل نمط…): ميزانية البناء الثابتة تصل إلى
  // تنظيمات مختلفة فعلًا بدل نسخ كثيرة من نمط واحد. المرشح المفضَّل (التعديل) يبقى أولًا.
  // (الجولة السابعة عشرة) جُرّب ترتيب البناء داخل النمط بالنسخة الملاصق مجلسها للطعام أولًا فسُحب: ميزانية البناء صارت تُسقط بدائل
  // مختلفة معماريًا بصمت (C5 عرض مجلسًا جانبيًا بثلاثة عيوب بدل L بعيب واحد) — العدد والاختيار لا يحددهما ترتيب الميزانية
  { const by = new Map(); for (const c of cands) { const k = c.mode + (c.stepped ? '#t' : ''); if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
    const rr = []; for (let r = 0; rr.length < cands.length; r++) for (const L of by.values()) if (L[r]) rr.push(L[r]);
    cands.splice(0, cands.length, ...rr); }
  for (const cand of cands) {
    // ميزانية زمن: يتوقف البناء بعد 8 ث متى وُجد بديلان — إلا إن لم يوجد بعد بديل ينفّذ كل البنود (حتى 14 ث)
    // (يُكمل حتى 14 ث ما لم يوجد ثلاثة بدائل تنفّذ كل البنود — البدائل المخالفة لبند صريح لا تُعرض لسد العدد)
    // حتمي: ميزانية بعدد المرشحين المبنيين لا بالزمن (الطلب نفسه = البدائل نفسها مهما كان حمل الجهاز)
    // (أرض غير منتظمة: مرشحون إضافيون لتظهر النسخ المتدرجة التي تتبع شكل الأرض)
    if (tried >= BUILD_MAX || built.filter(d => d.fails === 0).length >= keep + BUILD_SPARE + (site.rectW ? 3 : 0)) break;
    tried++;
    try {
      const mirror = cand.rp && cand.rp.p[0] !== cand.rp.p[1] ? cand.rp.p[1] < cand.rp.p[0] : prefPat && patOf(cand) === prefPat && prefMirror !== null ? prefMirror : false;
      const d = buildDesign(cand, P, site, land, { title, mirror, requirements, entry });
      if (onlyMajlisBar(d.reject) && gateReview(d, requirements, land, counts)) { softMajlis.push(d); continue; }
      // (الجولة التاسعة) رُفض فقط لصغر المجلس/الطعام عن الحد بقليل: يُعاد حل نمطه نفسه والحدّان مخالفة في البحث (refineMajlis)
      // (الجولة التاسعة عشرة) والعرض الصافي للمجلسين بفارق ≤ 0.35 م (C3/C10: تنظيمات تصل المجلس بالطعام رُفضت بـ 4.02–4.12 م من 4.2 م) —
      // يُعاد حل النمط نفسه والعرض مخالفة بهامش في البحث (hardWidth)؛ لا يُخفَّض الحد، وما لا يبلغه بعد إعادة الحل يبقى مرفوضًا
      if (d.reject.length && d.reject.every(nearMissWhy)) nearMiss.push(d);
      if (d.reject.length) { rejected.push({ pat: patOf(cand), why: [...d.reject, ...d.notes.filter(n => /لم تتسع|لم تجد|تعذّر/.test(n))], doc: d.doc }); continue; }
      if (!gateReview(d, requirements, land, counts)) { rejected.push({ pat: patOf(cand), why: d.review.rejectReasons_ar, gates: d.review.failedGates, by: 'plan-review', doc: d.doc }); continue; }
      built.push(d);
    } catch (e) { rejected.push({ pat: patOf(cand), why: [String(e.message || e)] }); }
  }
  // (الجولة التاسعة) مرشح رُفض فقط لأن المجلس الرئيسي أصغر من 24 م² بقليل: يُعاد حل أبعاد النمط نفسه والحدُّ مخالفةٌ في البحث
  // نفسه (لا جزاء فقط)؛ يُقبل إن اجتاز كل البوابات والمراجعة — تنظيم مختلف لا يضيع بفارق نصف متر مربع
  if (!refDR) refineMajlis(built, softMajlis, P, site, land, { title, requirements, entry, counts, nearMiss });
  admitMajlisBar(built, softMajlis, rejected);
  // (الجولة التاسعة عشرة) موقف لا تدخله السيارة (موازٍ في ارتداد ضحل أمام نافذة — مخالفة إلزامية): يُعاد حل التنظيم نفسه بعمق محجوز أمام
  // المبنى يتسع لموقف عمودي 5.5 م (لا يُرسم الموازي أمام نافذة) — حل معماري للأرض لا إخفاء للبديل
  if (!refDR && !site.placeRects && !R14_OFF.has('r19park')) refineParking(built, P, site, land, { title, requirements, entry, counts });
  if (!built.length) { const err = Error('تعذّر بناء أي بديل سليم من الأنماط المرشحة.'); err.code = 'VILLA_BUILD_FAILED'; err.rejected = rejected; throw err; }
  if (globalThis.__v2dbg) { globalThis.__v2dbg.built = built.map(d => ({ pat: d.pat, quality: d.quality, fails: d.fails })); globalThis.__v2pool = built.map(d => ({ pat: d.pat, dr: d.dr, quality: d.quality, fails: d.fails, streetBeds: d.streetBeds, r16: d.r16, prefFails: d.prefFails, failed: d.ledger.filter(x => !x.ok).map(x => x.text + ': ' + x.why) })); if (globalThis.__v2keepDocs) globalThis.__v2poolDocs = built.map(d => ({ pat: d.pat, doc: d.doc })); globalThis.__v2rej = rejected; }
  if (!refDR) refineWomen(built, P, site, land, { title, requirements, entry, counts });
  // (الجولة الثانية عشرة) إعادة التوزيع بعد تعذّر التعديل الموضعي تحفظ ما يميّز المخطط المعروض: الحوش الداخلي وغرفة ملابس الرئيسية
  // (المراجع المستقل: تعديل C8 أفقد الحوش وغرفة الملابس) — فقدهما يُحتسب بعدًا إضافيًا عن المعروض فيتقدم ما يحفظهما
  if (refDR) { const has = (dr, re) => dr.rooms.some(r => re.test(r.name)), refCourt = has(refDR, /^الحوش الداخلي$/), refDress = has(refDR, /^غرفة (?:ال)?ملابس$/);
    for (const d of built) { d.editDiff = roomsDifference(d.dr, refDR) + (refCourt && !has(d.dr, /^الحوش الداخلي$/) ? .5 : 0) + (refDress && !has(d.dr, /^غرفة (?:ال)?ملابس$/) ? .3 : 0); } }
  // أفضل تعديل موضعي (لم ينفّذ كل البنود) يدخل المقارنة: يُقدَّم ما دام لا يخفق في بنود أكثر من غيره
  if (local.length) { built.push(local[0]); local[0].notes = [...local[0].notes, 'عُدّل المخطط المعروض نفسه قدر الإمكان؛ بعض البنود لم يتحقق في هذا النمط.']; }
  if (prof) { prof.build = (prof.build || 0) + tp() - tq; prof.nbuilt = (prof.nbuilt || 0) + built.length + rejected.length; tq = tp(); }
  // (الجولة الثامنة) مجلس النساء ≥ 20 م² حدٌّ في الاختيار متى أتاحه البرنامج: إن بلغه بديل واحد على الأقل (بعد تحسين
  // refineWomen) لا يُعرض بديل أصغر منه ولو قلّ العدد (الجودة قبل العدد، قرار المالك)؛ وإن لم يبلغه أي بديل يبقى الاختيار كما هو
  let designs = pickReviewed(built, keep, requirements, land, counts);
  // (الجولة الحادية عشرة) بحث ثانٍ موجّه بالتنوع: إن قلّ المعروض عن المطلوب تحت المقياس الوظيفي v2، تُعطى التنظيمات التي لم يُبنَ منها
  // شيء بعد (أنماط بتوزيع وحركة مختلفين: الصالة الموزِّعة، بيت الحوش، نواة النوم، الصف الخلفي…) بحثًا أعمق (DEEP_ITERS، سماحية 4)
  // ثم تُبنى وتمر على البوابات نفسها كاملة ويُعاد الاختيار. لا تُخفَّض أي عتبة؛ ما لا يجتاز يُرفض بسببه.
  if (designs.length < keep && !refDR && !prefPat && !globalThis.__v2noSecond) {
    const have = new Set([...built.map(d => d.mode), ...rejected.map(r => String(r.pat).split(':')[0])]);
    const trees2 = partiTrees(P, { W: site.W, irregular: !!site.placeRects }).filter(t => (!have.has(t.mode) || t.late) && !avoid.has(t.mode)).sort((a, b) => !!b.late - !!a.late).slice(0, SECOND_MAX).flatMap(t => (R14_OFF.has('r19seeds') ? ['#d'] : ['#d', '#d2', '#d3']).map(sd => ({ ...t, tree: cloneTree(t.tree), iters: Math.max(t.iters || 0, DEEP_ITERS), tol: Math.max(t.tol || 2, 4), seed: t.tag + sd })));
    // (الجولة التاسعة عشرة) ثلاث بدايات مستقلة لكل تنظيم في البحث الثاني (كانت بداية واحدة): التلدين يعلق في حل بمخالفة أو اثنتين (عرض
    // مجلس النساء، ممر طويل…) في تنظيمات تصل المجلس بالطعام — البدايات الأخرى تجد الحل السليم أحيانًا. لا عتبة تُخفَّض؛ البوابات نفسها
    const done2 = new Set(), near2 = [];
    let c2 = []; try { c2 = trees2.length ? candidates(P, site, { rules: P.rules, entry, trees: trees2, avoid, exclude: ex }) : []; } catch { c2 = []; }
    for (const cand of c2) {
      const k2 = cand.late ? cand.mode + ':' + cand.tag : cand.mode;
      if (done2.has(k2)) continue; // تنظيم واحد من كل نمط (والتنظيم الجديد بوسمه)
      try {
        const mirror = cand.rp && cand.rp.p[0] !== cand.rp.p[1] ? cand.rp.p[1] < cand.rp.p[0] : false;
        const d = buildDesign(cand, P, site, land, { title, mirror, requirements, entry });
        if (d.reject.length) { if (d.reject.every(nearMissWhy)) near2.push(d); rejected.push({ pat: patOf(cand), why: d.reject, by: 'second-pass', doc: d.doc }); continue; }
        if (!gateReview(d, requirements, land, counts)) { rejected.push({ pat: patOf(cand), why: d.review.rejectReasons_ar, gates: d.review.failedGates, by: 'plan-review', doc: d.doc }); continue; }
        d.secondPass = true; built.push(d); done2.add(k2);
      } catch (e) { rejected.push({ pat: patOf(cand), why: [String(e.message || e)] }); }
    }
    // (الجولة التاسعة عشرة) والقريب من الحد في البحث الثاني يُعاد حل نمطه أيضًا (كان يُرفض بلا إعادة حل)
    if (near2.length && !R14_OFF.has('r19near')) { const n0 = built.length; refineMajlis(built, [], P, site, land, { title, requirements, entry, counts, nearMiss: near2.filter(d => !done2.has(d.mode)) });
      for (const d of built.slice(n0)) { d.secondPass = true; done2.add(d.mode); const i = rejected.findIndex(r => r.pat === d.pat && r.by === 'second-pass'); if (i >= 0) rejected.splice(i, 1); } }
    if (done2.size) {
      // (الجولة التاسعة عشرة) البحث الثاني يضيف ولا يُنقص: إن أعاد الاختيار الكامل عددًا أقل (مرسى جديد أفضل جودة غيّر المجموعة)، يبقى
      // اختيار البحث الأول ويُضاف إليه من الجديد ما كان مختلفًا معماريًا عن كل المعروض (المقياسان والعائلة) واجتاز البوابات الثقيلة
      const prev = designs, next = pickReviewed(built, keep, requirements, land, counts);
      if (next.length >= prev.length) designs = next;
      else if (!R14_OFF.has('r19aug')) {
        designs = [...prev];
        const famOf = x => String(x.pat).split(':')[0], mand = c => (c.r16 || []).filter(id => MANDATORY_R16.includes(id)).length;
        const okWith = c => designs.every(o => famOf(o) !== famOf(c) && archDifferenceV2(o.sig2 ||= archSignatureV2(o.doc), c.sig2 ||= archSignatureV2(c.doc)).verdict === 'distinct' && archDifference(o.sig1 ||= archSignature(o.doc), c.sig1 ||= archSignature(c.doc)).total >= MIN_ARCH_DIFF);
        for (const c of built.filter(d => d.secondPass && !designs.includes(d) && d.fails <= prev[0].fails && !mand(d) && !(d.streetBeds || []).length).sort((a, b) => a.quality - b.quality)) {
          if (designs.length >= keep) break;
          if (okWith(c) && heavyReview(c, requirements, land, counts)) designs.push(c);
        }
      }
    }
    if (globalThis.__v2dbg) globalThis.__v2dbg.second = { trees: trees2.map(t => t.tag), built: [...done2] };
  }
  { const wa = d => (d.dr?.rooms || []).find(r => r.name === 'مجلس النساء')?.area ?? Infinity;
    if (P.women?.length && !P.women[0].fixedArea && !refDR && designs.some(d => wa(d) < WOMEN_NET)) {
      const ok = built.filter(d => wa(d) >= WOMEN_NET && d._heavy !== false);
      const alt = ok.length ? pickReviewed(ok, keep, requirements, land, counts) : [];
      if (alt.length) { for (const d of built) if (wa(d) < WOMEN_NET && designs.includes(d)) d.womenSmall = r2(wa(d)); designs = alt; } } }
  if (!designs.length) throw reviewFailure(built, rejected);
  // (الجولة الثامنة عشرة) الصالة ≥ المجلس: تحسين موضعي للبدائل المختارة نفسها (لا يغيّر الاختيار)، يُقبل إن بقي مختلفًا معماريًا عن الباقين
  if (!refDR) refineHall(designs, P, site, land, { title, requirements, entry, counts });
  if (prof) { prof.pick = (prof.pick || 0) + tp() - tq; tq = tp(); }
  // أرض غير منتظمة: بين المعروض بديل واحد على الأقل يتبع شكل الأرض (أعرض من أي مستطيل يتسع فيها) إن وُجد ناجحًا
  if (site.rectW && !refDR) {
    const follows = d => d.env.w > site.rectW(d.env.d) + .25;
    if (!designs.some(follows)) {
      // (الجولة التاسعة عشرة) ولا يدخل ما فيه مخالفة إلزامية (كان يحل محل بديل سليم ثم يُحجب فيقل العدد: C5)
      const pool2 = built.filter(d => follows(d) && !designs.includes(d) && d.fails <= designs[0].fails && (R14_OFF.has('r19mand') || !(d.r16 || []).some(id => MANDATORY_R16.includes(id)))).sort((a, b) => a.quality - b.quality);
      const okWith = (d, others) => heavyReview(d, requirements, land, counts) && others.every(o => archDifferenceV2(o.sig2 ||= archSignatureV2(o.doc), d.sig2 ||= archSignatureV2(d.doc)).verdict === 'distinct');
      // يُضاف إن بقي مكان، وإلا يحل محل بديل غير الأول (من الآخر) بشرط أن يبقى مختلفًا معماريًا عن كل الباقين
      let done = false;
      if (designs.length < keep) { const c = pool2.find(d => okWith(d, designs)); if (c) { designs.push(c); done = true; } }
      for (let i = designs.length - 1; i >= 1 && !done; i--) {
        const rest = designs.filter((_, j) => j !== i), c = pool2.find(d => okWith(d, rest));
        if (c) { designs.splice(i, 1); designs.push(c); done = true; }
      }
      // (الجولة الحادية عشرة) تحت المقياس v2 قد تكون النسخة المتدرجة «نسخة معدّلة» من الأول نفسه (الغلاف وحده لا يُحتسب): تحل محله
      // — التنظيم نفسه يتبع شكل الأرض — إن لم تخفق في بند أكثر وبقيت مختلفة عن الباقين
      if (!done && designs.length) { const rest = designs.slice(1), c = pool2.find(d => d.fails <= designs[0].fails && okWith(d, rest) && archDifferenceV2(designs[0].sig2 ||= archSignatureV2(designs[0].doc), d.sig2 ||= archSignatureV2(d.doc)).verdict !== 'distinct'); if (c) { c.notes = [...c.notes, 'التنظيم نفسه للبديل الأفضل بغلاف يتبع شكل الأرض (أعرض في الخلف).']; designs[0] = c; done = true; } }
      // وإلا يُقال صراحة: وُجد تنظيم يتبع شكل الأرض لكنه ليس «مختلفًا معماريًا» عن المعروض ولا يحل محل أحدها
      if (!done && designs.length && pool2.some(d => d._heavy !== false)) designs[0].landShapeNote = `يوجد تنظيم يتبع شكل الأرض (${pool2.filter(d => d._heavy !== false).map(d => PARTI_AR[d.mode] ? d.mode : d.pat).join('، ')}) لكنه ليس مختلفًا معماريًا عن البدائل المعروضة (المقياس الوظيفي v2) ولا نسخة من أفضلها فيحل محله؛ لم يُعرض.`;
    }
  }
  designs.forEach(d => { d.same = !!prefPat && d.pat === prefPat; }); // التعديل بقي على التوزيع المعروض نفسه
  // لا انعكاسات لسد العدد: المخطط المعكوس ليس بديلًا تنظيميًا (اختلافه صفر)؛ يُعرض العدد الفعلي ويُذكر السبب
  const finalD = finalReviewSet(designs, requirements, land, counts);
  if (!finalD.length) throw reviewFailure(built, rejected);
  { const ln = designs.find(d => d.landShapeNote); if (ln) finalD[0].notes = [...finalD[0].notes, ln.landShapeNote]; }
  if (prof) { prof.final = (prof.final || 0) + tp() - tq; }
  if (finalD.length < keep) finalD[0].notes = [...finalD[0].notes, `وُجد ${finalD.length} ${finalD.length === 1 ? 'بديل' : 'بدائل'} مختلفة تنظيميًا فقط تجتاز المراجعة وتنفّذ بنود طلبك لهذا البرنامج وهذه الأرض (من ${keep} مطلوبة)؛ لم يُضف مخطط معكوس لأنه ليس بديلًا مختلفًا، ولا بديل يخالف بندًا صريحًا من طلبك.`];
  const shortfall_ar = refDR ? null : shortfallReason(keep, finalD, built, rejected);
  finalD.forEach(d => { delete d.cand; delete d.dr; delete d.reject; delete d.sig; delete d.droppedBy; });
  return { designs: finalD, program: P, W: r2(site.W), D: r2(site.D), engine: VILLA_V2_ENGINE_VERSION, shortfall_ar, rejected: [...rejected.map(({ doc, ...r }) => r), ...heavyRejected(built)], pool: built.map(d => ({ pat: d.pat, quality: d.quality, fails: d.fails, heavy: d._heavy ?? null, env: d.env ? { w: d.env.w, d: d.env.d } : null, follows: site.rectW && d.env ? r2(d.env.w - site.rectW(d.env.d)) : null })), ms: Math.round(now() - t0) };
}
/** البدائل المبنية التي رسبت في البوابات الثقيلة (تُضم إلى «رُفض» بأسبابها). */
const heavyRejected = built => built.filter(d => d.heavyFail).map(d => ({ pat: d.pat, by: 'heavy-gates', gates: d.heavyFail, why: d.heavyGates.filter(g => !g.ok).flatMap(g => g.reasons_ar.slice(0, 3).map(x => `${HEAVY_AR[g.id]}: ${x}`)) }));

function refineMajlis(built, soft, P, site, land, { title, requirements, entry, counts, nearMiss = [] }) {
  const dressFail = d => (d.ledger || []).filter(l => !l.ok).length === 1 && (d.ledger || []).some(l => !l.ok && /غرفة ملابس/.test(l.text));
  const best = built.length ? Math.min(...built.map(d => d.fails)) : 0;
  const redo = [...soft.map(d => ({ d, soft: true })), ...nearMiss.map(d => ({ d, near: true })), ...(P.prefs?.masterDressing ? built.filter(d => d.fails === best + 1 && dressFail(d)).map(d => ({ d, soft: false })) : [])];
  if (!redo.length) return;
  const trees = partiTrees(P, { W: site.W, irregular: !!site.placeRects });
  for (const { d, soft: isSoft, near } of redo) {
    const tr = d.cand && trees.find(t => t.tag === d.cand.tag && t.mode === d.cand.mode && !!t.stepped === !!d.cand.stepped); if (!tr) continue;
    try {
      if (globalThis.__v2dbg) (globalThis.__v2dbg.refine ||= []).push({ try: d.pat });
      const c = candidates(P, site, { rules: P.rules, entry, trees: [{ ...tr, tree: cloneTree(tr.tree), hardMajlis: !!P.men && !majlisAsked(P), hardDress: !!P.prefs?.masterDressing, hardDining: !!near, hardWidth: !!near && !majlisAsked(P) && !P.majlisRuled && !R14_OFF.has('r19near'), seed: tr.tag + '#r', iters: Math.max(tr.iters || 0, DEEP_ITERS), tol: Math.max(tr.tol || 2, 4) }] })[0]; if (!c) continue;
      const n = buildDesign(c, P, site, land, { title, mirror: d.mirror, requirements, entry });
      if (globalThis.__v2dbg) (globalThis.__v2dbg.refine ||= []).push({ pat: d.pat, reject: n.reject.slice(0, 3), fails: n.fails, was: d.fails });
      if (n.reject.length || n.fails >= (isSoft || near ? d.fails + 1 : d.fails) || !gateReview(n, requirements, land, counts)) continue;
      n.notes = [...n.notes, isSoft || near ? 'أُعيد ضبط أبعاد التنظيم نفسه ليبلغ المجلس الرئيسي 24 م² والطعام 12 م² صافية على الأقل.' : 'أُعيد ضبط أبعاد التنظيم نفسه لتتسع غرفة ملابس الرئيسية المطلوبة.'];
      if (isSoft) soft.splice(soft.indexOf(d), 1); else if (!near) built.splice(built.indexOf(d), 1);
      built.push(n);
    } catch { /* يبقى كما هو */ }
  }
}
function refineParking(built, P, site, land, { title, requirements, entry, counts }) {
  const bad = built.filter(d => (d.r16 || []).includes('PARKING_SHALLOW') && d.cand); if (!bad.length) return;
  const front = site.setbacks?.[site.entry] ?? 3, rsv = Math.round(Math.max(.5, 5.5 + .6 - front) * 100) / 100;
  const land2 = { ...land, parkReserve: (Number(land.parkReserve) || 0) + rsv }, site2 = siteOf(land2);
  const trees = partiTrees(P, { W: site2.W, irregular: false });
  for (const d of bad) {
    const tr = trees.find(t => t.tag === d.cand.tag && t.mode === d.cand.mode); if (!tr) continue;
    try {
      const c = candidates(P, site2, { rules: P.rules, entry, trees: [{ ...tr, tree: cloneTree(tr.tree), seed: tr.tag + '#p', iters: Math.max(tr.iters || 0, DEEP_ITERS), tol: Math.max(tr.tol || 2, 4) }] })[0];
      if (globalThis.__v2dbg) (globalThis.__v2dbg.refine ||= []).push({ park: d.pat, cand: !!c });
      if (!c) continue;
      const n = buildDesign(c, P, site2, land2, { title, mirror: d.mirror, requirements, entry });
      if (globalThis.__v2dbg) (globalThis.__v2dbg.refine ||= []).push({ park: d.pat, reject: n.reject.slice(0, 2), r16: n.r16, fails: n.fails });
      if (n.reject.length || n.fails > d.fails || (n.r16 || []).some(id => MANDATORY_R16.includes(id)) || !gateReview(n, requirements, land2, counts)) continue;
      n.notes = [...n.notes, `حُجز ${rsv} م أمام المبنى فوق الارتداد الأمامي ليتسع موقف عمودي على الشارع (5.5 م) بدل موقف موازٍ لا تدخله السيارة عمليًا أمام نافذة.`];
      built.splice(built.indexOf(d), 1, n);
    } catch { /* يبقى كما هو (ويُحجب بمخالفته) */ }
  }
}
/** (الجولة التاسعة عشرة) سبب رفض «قريب»: مساحة المجلس/الطعام دون حدها بقليل، أو عرض المجلس الصافي دون 4.2 م بفارق ≤ 0.35 م. */
function nearMissWhy(w) {
  const a = /^«(?:مجلس الرجال|المجلس|صالة الطعام|مجلس النساء)» ([\d.]+) م² أصغر من (\d+) م²\.$/.exec(w); if (a) return +a[2] - +a[1] <= 2.5;
  const b = /^«(?:مجلس الرجال|المجلس|مجلس النساء)» عرضه الصافي ([\d.]+) م أقل من ([\d.]+) م \(جلسة متقابلة\)\.$/.exec(w); if (b) return !R14_OFF.has('r19near') && +b[2] - +b[1] <= .35;
  return false;
}
/** الرفض الوحيد هو حد المجلس الرئيسي (24 م²)؟ */
const onlyMajlisBar = why => why.length > 0 && why.every(w => /^«(?:مجلس الرجال|المجلس)» [\d.]+ م² أصغر من \d+ م²\.$/.test(w) || /^«(?:مجلس الرجال|المجلس)» عرضه الصافي [\d.]+ م أقل من [\d.]+ م \(جلسة متقابلة\)\.$/.test(w));
/**
 * (الجولة الثامنة) حد المجلس الرئيسي ≥ 24 م² صلب في الاختيار، إلا حين يتعارض مع طلب العميل الصريح: إن كان كل بديل
 * يحقق الحد يخالف بندًا من الطلب (أو لا بديل أصلًا) وبديلٌ تحته ينفّذ بنودًا أكثر، يُقبل الأفضل منها وحده مع ملاحظة
 * صريحة بمساحة المجلس وسببها (البند الصريح يتقدم على الحد التصميمي المعلن). وإلا تُعد المرفوضة في «رُفض».
 */
function admitMajlisBar(built, soft, rejected) {
  if (!soft.length) return;
  const best = built.length ? Math.min(...built.map(d => d.fails)) : Infinity;
  const pick = soft.filter(d => d.fails < best).sort((a, b) => a.fails - b.fails || a.quality - b.quality)[0];
  for (const d of soft) if (d !== pick) rejected.push({ pat: d.pat, why: d.reject, doc: d.doc });
  if (!pick) return;
  pick.notes = [...pick.notes, `${pick.reject[0].replace(/\.$/, '')}: قُبل لأن كل بديل بمجلس ≥ 24 م² ${built.length ? 'يخالف بندًا صريحًا من طلبك' : 'لم يتسع على هذه الأرض'}؛ بندك الصريح يتقدم على الحد التصميمي.`];
  pick.majlisBelowBar = true; pick.reject = [];
  built.push(pick);
}

/**
 * (الجولة الثامنة) مجلس النساء ≥ 20 م² صافيًا ما أمكن: لكل بديل ناجح مجلس نسائه المرسوم أصغر من ذلك، يُعاد حل أبعاد
 * النمط نفسه (الشجرة ذاتها) مع جزاء على صغر مجلس النساء، ويُستبدل به فقط إن اجتاز البوابات والمراجعة ولم يخفق في
 * بنود أكثر ولم يكبر جزاؤه كثيرًا. جزاء عام في التقييم جُرّب فأسقط بديلًا في C3 وC10 (البحث يتغير كله)، فصار تحسينًا
 * موضعيًا للنمط الذي بُني فعلًا. لا رفض: الأرض الصغيرة قد لا تتسع (يبقى الأصل).
 */
function refineWomen(built, P, site, land, { title, requirements, entry, counts }) {
  const W = P.women?.[0]; if (!W || W.fixedArea || (P.tweaks?.majlisScale && P.tweaks.majlisScale < 1)) return;
  const wArea = d => { const r = (d.dr?.rooms || []).find(x => x.name === 'مجلس النساء'); return r ? r.area : Infinity; };
  const T = DESIGN_TARGETS, trees = partiTrees(P, { W: site.W, irregular: !!site.placeRects });
  let margin = .8;
  const extra = sol => { const p = sol.placed.find(q => q.block === W) || sol.placed.find(q => q.block.id === W.id); if (!p) return 0; const w = W_(p.r), h = H_(p.r);
    const na = W.guestWc ? Math.max((w - T.guestStripW - WALL_NET) * (h - WALL_NET), (w - WALL_NET) * (h - T.guestStripW - WALL_NET)) : (w - WALL_NET) * (h - WALL_NET);
    return na < WOMEN_NET + margin ? 90 * (WOMEN_NET + margin - na) : 0; };
  for (let i = 0; i < built.length; i++) {
    const d = built[i]; if (wArea(d) >= WOMEN_NET || !d.cand) continue;
    const tr = trees.find(t => t.tag === d.cand.tag && t.mode === d.cand.mode && !!t.stepped === !!d.cand.stepped); if (!tr) continue;
    // محاولتان بهامش متزايد (التقدير على المحاور، والمرسوم صافٍ من الجدران)؛ تتوقف متى بلغ المرسوم 20 م²
    for (const m of [.8, 1.8]) {
      margin = m;
      try {
        const c = candidates(P, site, { rules: P.rules, entry, trees: [tr], extra })[0]; if (!c) continue;
        const n = buildDesign(c, P, site, land, { title, mirror: d.mirror, requirements, entry });
        const cur = built[i];
        if (n.reject.length || n.fails > d.fails || wArea(n) <= wArea(cur) + .3 || n.quality > d.quality + 400) continue;
        if (!gateReview(n, requirements, land, counts)) continue;
        n.notes = [...n.notes, `كُبّر «مجلس النساء» إلى ${r2(wArea(n))} م² صافيًا (كان ${r2(wArea(d))} م²) بإعادة ضبط أبعاد التنظيم نفسه.`];
        built[i] = n;
        if (wArea(n) >= WOMEN_NET) break;
      } catch { /* يبقى الأصل */ }
    }
  }
}

/**
 * (الجولة الثامنة عشرة) هدف الميزان الافتراضي: الصالة العائلية لا تصغر عن مجلس الرجال متى اتسع البرنامج (المراجع المستقل r17: C4 وC8-1
 * وC8-2). لكل بديل مبني صالته المرسومة أصغر من مجلسه، يُعاد حل أبعاد النمط نفسه بجزاء على نقص الصالة عن هدف المجلس (لا عن مقاسه
 * المحلول وحده: والمجلس لا يصغر عن حده 24 م² — hardMajlis)، ويُستبدل فقط إن اجتاز البوابات ولم يزد عيوبه الجوهرية ولا بنوده المخفقة وصارت الصالة ≥ المجلس.
 * جزاء عام في البحث جُرّب فأسقط بدائل (C5 وC9). قيمة تصميمية افتراضية للميزان؛ القياس HALL_SMALL (0.8) لم يتغير.
 */
function refineHall(built, P, site, land, { title, requirements, entry, counts }) {
  if (!P.men || P.hallFixed || R14_OFF.has('r18hall')) return;
  const ar = d => { const R = d.dr?.rooms || []; const h = R.find(r => r.name === 'الصالة' && r.li === 0), m = R.find(r => r.type === 'majlis' && !/النساء/.test(r.name) && r.li === 0); return h && m ? { h: h.area, m: m.area } : null; };
  const trees = partiTrees(P, { W: site.W, irregular: !!site.placeRects });
  for (let i = 0; i < built.length; i++) {
    const d = built[i], a0 = ar(d); if (!a0 || a0.h >= a0.m || !d.cand) continue;
    const tr = trees.find(t => t.tag === d.cand.tag && t.mode === d.cand.mode && !!t.stepped === !!d.cand.stepped); if (!tr) continue;
    for (const margin of [2, 4, 6, 8]) {
      // (الجولة التاسعة عشرة) والرئيسية لا تتضخم بما يُقتطع من غيرها (C4: حل الصالة الأكبر رُفض «الرئيسية 25.7 م² متضخمة»)
      const extra = sol => { const h = sol.circ.find(c => c.id === 'hall'), mj = sol.placed.find(p => p.block.kind === 'majlis' && p.block.men); if (!h || !mj) return 0;
        const ms = R14_OFF.has('r19hall') ? null : sol.placed.find(p => p.block.master), mx = ms ? Math.max(0, A_(ms.r) - ms.block.area * 1.12) : 0;
        const need = A_(mj.r) - (mj.block.guestWc ? 7 : 0) + margin, ha = A_(h.r); return (ha < need ? 60 * (need - ha) : 0) + 80 * mx; };
      try {
        const c = candidates(P, site, { rules: P.rules, entry, trees: [{ ...tr, tree: cloneTree(tr.tree), hardMajlis: !!P.men && !majlisAsked(P), seed: tr.tag + '#h' }], extra })[0]; if (!c) continue;
        const n = buildDesign(c, P, site, land, { title, mirror: d.mirror, requirements, entry }), a1 = ar(n); n.secondPass = d.secondPass;
        if (globalThis.__v2dbg) (globalThis.__v2dbg.hall ||= []).push({ pat: d.pat, margin, a0, a1, reject: n.reject, fails: [d.fails, n.fails], major: [d.major, n.major], q: [d.quality, n.quality] });
        // يُقبل إن صارت الصالة ≥ المجلس، أو (الجولة التاسعة عشرة) زالت عيوب جوهرية مقيسة (الصالة الصغيرة/الممر) دون عيب جديد ولو بقيت أصغر
        const fewer = !R14_OFF.has('r19hall') && n.major.length < d.major.length;
        if (n.reject.length || n.fails > d.fails || !a1 || (a1.h < a1.m && !fewer) || n.major.some(x => !d.major.includes(x)) || n.major.length > d.major.length || n.quality > d.quality + 400) continue;
        if (!gateReview(n, requirements, land, counts) || !heavyReview(n, requirements, land, counts)) continue;
        if (built.some((o, j) => j !== i && archDifferenceV2(o.sig2 ||= archSignatureV2(o.doc), n.sig2 ||= archSignatureV2(n.doc)).verdict !== 'distinct')) continue;
        n.dr = n.dr || docRooms(n.doc);
        n.notes = [...n.notes, a1.h >= a1.m ? `كُبّرت «الصالة» إلى ${r2(a1.h)} م² فصارت لا تصغر عن «المجلس» ${r2(a1.m)} م² (كانت ${r2(a0.h)} م² مقابل ${r2(a0.m)} م²) بإعادة ضبط أبعاد التنظيم نفسه — هدف تصميمي افتراضي للميزان.` : `أُعيد ضبط أبعاد التنظيم نفسه: «الصالة» ${r2(a1.h)} م² و«المجلس» ${r2(a1.m)} م² (كانت ${r2(a0.h)} م² مقابل ${r2(a0.m)} م²) — زال ${d.major.filter(x => !n.major.includes(x)).join(' و')}، وما زالت الصالة أصغر من المجلس (هدف الميزان الافتراضي لم يتحقق على هذه الأرض الضيقة).`];
        built[i] = n; break;
      } catch { /* يبقى الأصل */ }
    }
  }
}

/**
 * سبب النقص عن العدد المطلوب (نص عربي يُحفظ مع النتيجة): ما الذي بُني وما الذي رُفض ولماذا — مقيس من المرشحين أنفسهم،
 * لا عبارة عامة. built: البدائل التي اجتازت البوابات؛ shown: المعروضة؛ rejected: ما رسب قبل ذلك.
 */
/** لا بديل اجتاز البوابات الثقيلة: خطأ صريح بأسبابها (لا يُعرض بديل راسب لسد الفراغ). */
function reviewFailure(built, rejected) {
  const why = [...new Set(built.flatMap(d => (d.heavyGates || []).filter(g => !g.ok).flatMap(g => g.reasons_ar.slice(0, 2).map(r => `${HEAVY_AR[g.id] || g.id}: ${r}`))))].slice(0, 6);
  const e = Error(`لم يجتز أي بديل مبني (${built.length}) البوابات الثقيلة (المراجعة الإنشائية المبدئية، والحركة الفعلية مع الأثاث، والتطابق 2D/3D)${why.length ? ': ' + why.join('؛ ') : ''}.`);
  e.code = 'VILLA_REVIEW_FAILED'; e.rejected = rejected; Object.defineProperty(e, 'built', { value: built, enumerable: false }); return e;
}
const HEAVY_AR = { STRUCTURAL: 'المراجعة الإنشائية المبدئية', CIRCULATION: 'الحركة الفعلية', CONSISTENCY_2D3D: 'التطابق 2D/3D' };
function shortfallReason(keep, shown, built, rejected0) {
  if (shown.length >= keep) return null;
  // (الجولة التاسعة عشرة) المرفوض يُعدّ بالتنظيم لا بالمحاولة (البدايات الثلاث في البحث الثاني تكرر النمط نفسه)، ولا يُعدّ ما بُني منه بعد إعادة الحل
  const builtPats = new Set(built.map(d => d.pat)), rejected = [...new Map(rejected0.filter(r => !builtPats.has(r.pat)).map(r => [r.pat, r])).values()];
  const parts = [], best = shown[0];
  const sigOf = c => (c.sig2 ||= archSignatureV2(c.doc));
  const famOf = x => String(x.pat).split('/')[0].split(':')[0] + (String(x.pat).includes('/') ? ':' + String(x.pat).split('/')[0].split(':')[1] : '');
  let cosmetic = 0, partial = 0, family = 0, ledger = 0, other = 0, street = 0, heavy = 0, guest = 0, parkBad = 0, women = []; const ledgerWhy = new Set(), heavyWhy = new Map(), guestPat = new Set();
  for (const c of built) {
    if (shown.includes(c)) continue;
    if (c.womenSmall) { women.push(c.womenSmall); continue; }
    if (best && c.fails > best.fails) { ledger++; for (const l of c.ledger || []) if (!l.ok) ledgerWhy.add(l.text); continue; }
    if ((c.streetBeds || []).length && !(best?.streetBeds || []).length) { street++; continue; }
    if (!R14_OFF.has('r18guest') && (c.r16 || []).includes('GUEST_DINING') && !(best?.r16 || []).includes('GUEST_DINING')) { guest++; guestPat.add(PARTI_AR[c.mode] ? c.mode : c.pat); continue; }
    if (!R14_OFF.has('r19mand') && (c.r16 || []).includes('PARKING_SHALLOW') && !(best?.r16 || []).includes('PARKING_SHALLOW')) { parkBad++; continue; }
    if (c.heavyFail) { heavy++; for (const g of c.heavyFail) heavyWhy.set(g, (heavyWhy.get(g) || 0) + 1); continue; }
    if (shown.some(o => famOf(o) === famOf(c))) { family++; continue; }
    const v = shown.map(o => archDifferenceV2(sigOf(o), sigOf(c)).verdict);
    if (v.includes('variant')) cosmetic++; else if (v.includes('partial')) partial++; else other++;
  }
  const rej = new Map();
  // صياغة للعميل: سبب الرفض بجملة سليمة (كانت «رُفض 4 في لا يتسع على الأرض»)
  for (const r of rejected) { const k = r.by === 'plan-review' ? 'في المراجعة المعمارية المستقلة (' + (r.gates || []).join('، ') + ')' : /لا يتسع|لا ترتيب|لا دور علوي/.test((r.why || [])[0] || '') ? (/لا دور علوي/.test((r.why || [])[0] || '') ? 'لأن الدور العلوي لا يتسع فوق مسقطه الأرضي' : 'لأنه لا يتسع على الأرض') : 'في بوابات الجودة والسلامة'; rej.set(k, (rej.get(k) || 0) + 1); }
  parts.push(`عُرض ${shown.length} من ${keep} مطلوبة`);
  parts.push(`المرشحون المبنيون من أنماط تنظيمية مختلفة ${built.length + rejected.length}، اجتاز البوابات منهم ${built.length}`);
  if (rejected.length) parts.push('ورُفض ' + [...rej].map(([k, n]) => `${n} ${k}`).join('، و'));
  if (ledger) parts.push(`${ledger} تخالف بندًا صريحًا من الطلب (${[...ledgerWhy].slice(0, 3).join('، ')})`);
  if (women.length) parts.push(`${women.length} مجلس النساء فيها أصغر من ${WOMEN_NET} م² (${women.join('، ')} م²) والبرنامج يتسع لأكبر منه`);
  if (street) parts.push(`${street} فيها غرفة نوم على واجهة الشارع (لم يطلبها العميل)`);
  if (guest) parts.push(`${guest} لا يصل فيها ضيف الرجال إلى الطعام إلا عبر منطقة العائلة — المجلس والطعام في طرفين من البيت في هذا التنظيم على هذه الأرض (${[...guestPat].map(m => PARTI_AR[m] ? `«${PARTI_AR[m].split(':')[0]}»` : m).join('، ')})`);
  if (parkBad) parts.push(`${parkBad} لا تدخل السيارة موقفها عمليًا (موقف موازٍ في ارتداد ضحل أمام نافذة)`);
  if (family) parts.push(`${family} تنويع على تنظيم معروض نفسه (النمط ذاته بتبادل موضعي)`);
  if (heavy) parts.push(`${heavy} رسبت في البوابات الثقيلة (${[...heavyWhy].map(([g, n]) => `${HEAVY_AR[g] || g} ${n}`).join('، ')})`);
  if (cosmetic) parts.push(`${cosmetic} نسخة معدّلة من بديل معروض (لا بعد جوهري في المقياس الوظيفي v2: موضع السلم أو الغلاف أو مقاسات فقط)`);
  if (partial) parts.push(`${partial} اختلافها عن بديل معروض جزئي (بعد جوهري واحد فقط من توزيع الوظائف والحركة والخصوصية والعلاقات؛ المطلوب بعدان)`);
  if (other) parts.push(`${other} لم تدخل مجموعة تحقق أدنى اختلاف مع كل البدائل المعروضة معًا`);
  return parts.join('؛ ') + '. لا يُكمَّل العدد بنسخ معكوسة أو شكلية ولا ببديل يخالف شرطًا إلزاميًا (قرار المالك).';
}

/**
 * البوابة النهائية المستقلة: محرك المراجعة (plan-review) يحكم على المستند المرسوم وطلب العميل فقط، لا على حالة المولّد.
 * بديل يرسب في أي بوابة صلبة لا يُعرض أبدًا. يعيد true إن نجح، ويرفق المراجعة بالتصميم (بلا AZIZ/Mizan هنا للسرعة).
 */
function reviewRequest(requirements, land, counts) {
  return { text: requirements?.text || requirements?.idea || '', counts: { ...(counts || {}), ...(requirements?.counts || {}) }, land: land || {}, prefs: requirements?.prefs || {}, rules: requirements?.rules || [] };
}
function compactReview(rv) {
  const G = g => ({ id: g.id, ar: g.ar, ok: g.ok, applicable: g.applicable !== false, value: g.value, reasons_ar: g.reasons_ar });
  // بوابات المستند وحده في gates (كما يراجعها reviewDesign)، وبوابة المجموعة (DISTINCT) منفصلة في setGates
  return { version: rv.version, passed: rv.passed, failedGates: rv.failedGates, score: rv.score, rejectReasons_ar: rv.rejectReasons_ar,
    gates: rv.gates.filter(g => g.id !== 'DISTINCT').map(G), setGates: rv.gates.filter(g => g.id === 'DISTINCT').map(G),
    breakdown: rv.breakdown.map(b => ({ id: b.id, ar: b.ar, value: b.value, weight: b.weight })) };
}
function gateReview(d, requirements, land, counts) {
  const rv = reviewDesign(d.doc, reviewRequest(requirements, land, counts), { external: false, heavy: false });
  d.review = compactReview(rv);
  return rv.passed || parkShortOnly(rv);
}
/** (الجولة الثانية عشرة) في وضع «نقص المواقف المعلن» فقط: الراسب الوحيد بوابة المواقف النظامية — يُعرض البديل وبوابته راسبة ظاهرة. */
let PARK_SHORT_OK = false;
const parkShortOnly = rv => PARK_SHORT_OK && rv.failedGates.length > 0 && rv.failedGates.every(g => g === 'PARKING');
/**
 * (الجولة الحادية عشرة) البوابات الثقيلة (المراجعة الإنشائية المبدئية، الحركة الفعلية، التطابق 2D/3D) لبديل واحد، مرة واحدة (مخزّنة).
 * أبطأ من غيرها، فلا تُحسب لكل مرشح بل للمختار فقط في pickReviewed.
 */
function heavyReview(d, requirements, land, counts) {
  if (d._heavy !== undefined) return d._heavy;
  const req = reviewRequest(requirements, land, counts);
  d.heavyGates = HEAVY_GATES.map(id => heavyGate(id, d.doc, req));
  d._heavy = d.heavyGates.every(g => g.ok);
  if (!d._heavy) d.heavyFail = d.heavyGates.filter(g => !g.ok).map(g => g.id);
  return d._heavy;
}
/** يختار بـ pickDiverse ثم يمرر المختار على البوابات الثقيلة؛ الراسب يُستبعد من المجموعة ويُعاد الاختيار (لا يُعرض راسب أبدًا). */
function pickReviewed(pool, keep, requirements, land, counts, pick = pickDiverse) {
  let rest = [...pool];
  for (let guard = 0; guard < 16 && rest.length; guard++) {
    const sel = pick([...rest], keep);
    const bad = sel.filter(d => !heavyReview(d, requirements, land, counts));
    if (globalThis.__v2dbg) (globalThis.__v2dbg.pick ||= []).push('SEL ' + sel.map(d => d.pat).join(' ') + ' BAD ' + bad.map(d => d.pat + ':' + JSON.stringify(d.heavyFail)).join(' '));
    if (!bad.length) return sel;
    rest = rest.filter(d => !bad.includes(d));
  }
  return [];
}
/** مراجعة كاملة (مع AZIZ وMizan بوزنهما المقيس) للبدائل المختارة فقط. */
function finalReview(d, requirements, land, counts) {
  try { d.review = compactReview(reviewDesign(d.doc, reviewRequest(requirements, land, counts))); } catch { /* تبقى مراجعة البوابات */ }
}
/**
 * البوابة النهائية للمجموعة: plan-review على البدائل المختارة معًا ببوابة DISTINCT (reviewDesigns مع distinct:true) —
 * بديل تنظيمه نسخة شكلية من بديل أعلى منه (الاختلاف المعماري < 0.18) أو راسب في أي بوابة لا يُعرض. الأول يبقى دائمًا
 * (هو أفضل ما وُجد، وقد اجتاز بواباته الفردية قبل الاختيار). يعيد البدائل الباقية بترتيبها، مع المراجعة الكاملة مرفقة.
 */
function finalReviewSet(designs, requirements, land, counts) {
  if (!designs.length) return designs;
  let rows = null;
  try { rows = reviewDesigns(designs.map(d => d.doc), reviewRequest(requirements, land, counts), { distinct: true, heavy: false }); } catch { rows = null; }
  if (!rows) { designs.forEach(d => finalReview(d, requirements, land, counts)); return designs; }
  const byIdx = new Map(rows.map(r => [r.index, r]));
  const kept = [];
  designs.forEach((d, i) => {
    const r = byIdx.get(i);
    // البوابات الثقيلة محسوبة في pickReviewed (مرة واحدة)؛ تُضم إلى المراجعة المعروضة
    if (heavyReview(d, requirements, land, counts) === false) { r.passed = false; r.failedGates = [...r.failedGates, ...d.heavyFail]; r.rejectReasons_ar = [...r.rejectReasons_ar, ...d.heavyGates.filter(g => !g.ok).flatMap(g => g.reasons_ar.map(x => `${g.ar}: ${x}`))]; }
    r.gates = [...r.gates.filter(g => g.id !== 'DISTINCT'), ...(d.heavyGates || []), ...r.gates.filter(g => g.id === 'DISTINCT')];
    d.review = compactReview(r);
    if (r.passed || parkShortOnly(r)) kept.push(d);
    else d.droppedBy = r.failedGates;
  });
  if (!kept.length) return kept;
  const dropped = designs.filter(d => !kept.includes(d));
  if (dropped.length) kept[0].notes = [...kept[0].notes, `استُبعد ${dropped.length} من البدائل في المراجعة النهائية للمجموعة (${[...new Set(dropped.flatMap(d => d.droppedBy || []))].join('، ')}): لا يُعرض بديل تنظيمه نسخة شكلية من بديل آخر أو راسب في بوابة.`];
  return kept;
}

/**
 * (الجولة السابعة) غرف النوم الأرضية «على الشارع»: جهتها الأمامية (y0 القانونية) لا يحجبها فراغ مبني، وبُعدها عن خط
 * الواجهة الأمامية للمبنى أقل من 3 م (فناء أمامي أعمق من 3 م يكفي). rooms: غرف التخطيط القانوني للدور الأرضي.
 */
function streetBedrooms(rooms) {
  const solid = rooms.filter(r => !r.open), y0 = Math.min(...solid.map(r => r.y0));
  const ov = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  return solid.filter(r => ['bedroom', 'master'].includes(r.type) && r.name !== 'غرفة الضيوف' && r.y0 - y0 < 3 - TOL && !solid.some(o => o !== r && ov(o, r) > .6 && o.y1 <= r.y0 + .1)).map(r => r.name);
}
/** ما طلبه العميل صراحة فيُعفى من حدود الفراغات المعلنة في بوابة الجودة. */
/** أوزان جزاء التفضيلات السعودية في الاختيار (قيم تصميمية افتراضية للميزان). */
/**
 * (الجولة الخامسة عشرة) ملاءمة التنظيم للأرض والبرنامج (المراجع المستقل r14: التنظيم نفسه يتكرر عبر حالات مختلفة): جزاء معلن في الاختيار
 * لا رفض — الأرض غير المنتظمة تُفضَّل فيها الكتلة المتدرجة التي تتبع شكلها، وجناحا النوم المنفصلان لبرنامج فيه ثلاثة أبناء فأكثر،
 * والحوش الجانبي للعرض القابل للبناء 11.5–18.5 م. قيم تصميمية افتراضية للميزان.
 */
function typologyFit(cand, P, site) {
  let pen = 0;
  if (site.placeRects && !cand.stepped) pen += 300; // أرض شبه منحرفة: المستطيل داخلها لا يستثمر شكلها
  const kids = (P.suites || []).filter(b => !b.master).length;
  if (cand.mode === 'wings' && kids < 3) pen += 80; // جناح رئيسي منفصل لغرفتي أبناء فقط: حركة أطول بلا فائدة خصوصية تُذكر
  return pen;
}
const R16_W = { WINDOW_PARKING: 180, HALL_STREET: 160, MASTER_VIA_DRESS: 200, GUEST_DINING: 170, PARKING_SHALLOW: 180 };
const PREF_W = { MAID_BATH: 150, BED_BATH: 150, SERVE_ROUTE: 120, MAJLIS_BED_WALL: 120, MAJLIS_STREET_ENTRY: 150, DAY_WC: 80, REAR_YARD: 120, PARKING_LAYOUT: 100, MAJLIS_DINING: 40 };
const gateOpts = P => ({ majlisAsked: majlisAsked(P), diningAsked: !!(P.blocks.find(b => b.kind === 'dining')?.fixedArea || P.dims?.dining || (P.tweaks?.kitchenScale && P.tweaks.kitchenScale < 1)), masterAsked: masterAsked(P) });
/** (الجولة التاسعة عشرة) لا خط أبعاد فوق موقف: كل بُعد يقطع خطه (بإزاحته) موقفًا يُبعد خطه حتى يتجاوز المواقف (خطوة 0.5 م حتى 12 م). */
function clearDimsOffParking(doc, bays) {
  if (!bays?.length) return;
  const polys = bays.map(b => b.polygon), segX = (a, b, c, d) => { const r = (p, q, t) => (q.x - p.x) * (t.y - p.y) - (q.y - p.y) * (t.x - p.x); return r(a, b, c) * r(a, b, d) < 0 && r(c, d, a) * r(c, d, b) < 0; };
  const hits = (a, b) => polys.some(P => pointInPolygon(a, P) || pointInPolygon(b, P) || pointInPolygon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, P) || P.some((p, i) => segX(a, b, p, P[(i + 1) % P.length])));
  for (const d of doc.dimensions || []) {
    const ux = d.b.x - d.a.x, uy = d.b.y - d.a.y, L = Math.hypot(ux, uy); if (L < 1e-6) continue;
    const n = { x: -uy / L, y: ux / L }, line = off => [{ x: d.a.x + n.x * off, y: d.a.y + n.y * off }, { x: d.b.x + n.x * off, y: d.b.y + n.y * off }];
    const sg = Math.sign(d.offset ?? .6) || 1; let off = Math.abs(d.offset ?? .6);
    if (!hits(...line(sg * off))) continue;
    while (off < 12 && hits(...line(sg * off))) off += .5;
    d.offset = r2(sg * off);
  }
}
function buildDesign(cand, P, site, land, { title, mirror, requirements, entry, second = null }) {
  const layout = realizeV2(cand, P, { secondEntry: canonicalSide(entry, land?.entries?.[1], mirror) });
  layout.glazing = requirements?.prefs?.glazing || null; // (قرار المالك) نسبة الزجاج التي طلبها العميل إن طلب
  const { T, pl } = transformFor(site, cand, mirror);
  let doc = buildDoc(site, land, title);
  doc = drawPlanV2(doc, layout, { level: LV, T });
  if (second) doc = second(doc);
  // (الجولة الثانية عشرة) مواقف السيارات في الارتداد (قيمة تصميمية افتراضية للميزان): مناطق «garage» يرسمها المسقط والمجسّم ويقيسها المراجع
  // عدد المواقف اشتراط نظامي متحقق (site-parking.mjs PARKING_RULE): إن لم يتسع العدد أمام المبنى وفي الأرض عمق زائد خلفه،
  // يُزاح المبنى إلى الخلف بقدر ما يتسع موقف عمودي على الشارع (5.5 م وهامشاه) ويُعاد بناؤه مرة واحدة
  const parallel = /موقف[^،.]{0,15}(?:موازي|طولي)/.test(String(requirements?.text || requirements?.idea || ''));
  let pk = null; try { pk = planParking(doc, { parallel }); } catch { pk = null; }
  // (الجولة الرابعة عشرة) قبل إزاحة المبنى إلى الخلف (تصغير الحوش الخلفي): يُجرَّب المبنى على أحد جانبي الأرض فيتسع الموقفان
  // العموديان بجانبه — الجهة الأقرب إلى مدخل العائلة أولًا (السيارة قرب باب العائلة لا أمام مجلس الضيوف)
  if (!R14_OFF.has('park') && pk && pk.bays.length < pk.required && cand.parkSide == null && cand.parkShift == null && !site.placeRects && site.W - cand.ew >= 1.55) {
    const tries = [];
    for (const s of ['lo', 'hi']) { try { const c2 = { ...cand, parkSide: s }; const d2 = buildDesign(c2, P, site, land, { title, mirror, requirements, entry, second }); const n = (d2.doc.zones || []).filter(z => z.type === 'garage').length; tries.push({ s, d2, n }); } catch { /* لا يتسع */ } }
    const ok = tries.filter(t => t.n >= pk.required && !t.d2.reject.length).sort((a, b) => a.d2.quality - b.d2.quality);
    if (ok.length) { cand.parkSide = ok[0].s; return ok[0].d2; }
    cand.parkSide = null;
  }
  if (pk && pk.bays.length < pk.required && cand.parkShift == null && !site.placeRects) {
    const front = site.setbacks?.[site.entry] ?? 3, need = Math.max(0, 6.5 - front), room = site.D - cand.ed, shift = snap(Math.min(room, need));
    cand.parkShift = shift >= .5 && room >= need - .05 ? shift : 0;
    if (cand.parkShift) return buildDesign(cand, P, site, land, { title, mirror, requirements, entry, second });
  }
  // تفضيل لا قاعدة (قرار المالك r14): إن لم يتسع العمودي بأي وضع للمبنى يُقبل الموازي ويُذكر لماذا لم يُطبَّق التفضيل
  if (pk && pk.bays.length < pk.required && !parallel) {
    let pk2 = null; try { pk2 = planParking(doc, { parallel: true }); } catch { pk2 = null; }
    if (pk2 && pk2.bays.length > pk.bays.length) { pk = pk2; pk.note_ar += ' (تفضيل الميزان موقف عمودي بعمق 5.5 م لم يتسع في هذه الأرض لهذا المبنى لا بجانبه ولا أمامه، فرُسم موازيًا — قيمة تصميمية افتراضية للميزان لم تُطبَّق، والسبب ضيق الارتداد.)'; }
    // آخر الحلول: العدد النظامي أولًا ولو أمام نافذة (يُذكر ويظهر في «يحتاج تعديلات»)
    if (pk.bays.length < pk.required) { let pk3 = null; try { pk3 = planParking(doc, { parallel: true, windows: false }); } catch { pk3 = null; } if (pk3 && pk3.bays.length > pk.bays.length) { pk = pk3; pk.note_ar += ' (لم يتسع العدد النظامي إلا بموقف أمام نافذة — تفضيل الميزان لم يُطبَّق في هذه الأرض لهذا المبنى.)'; } }
  }
  if (pk && !R14_OFF.has('r19dims')) clearDimsOffParking(doc, pk.bays);
  if (pk) { for (const b of pk.bays) doc = applyCommand(doc, { type: 'add-zone', level: LV, name: 'موقف سيارة', roomType: 'garage', polygon: b.polygon }).doc; layout.notes.push(pk.note_ar + (cand.parkShift ? ` أُزيح المبنى ${cand.parkShift} م إلى الخلف ليتسع العدد المطلوب أمامه.` : '')); }
  // (الجولة السادسة عشرة) تحسين التصميم لا تخفيف المعيار: نوافذ الغرف الخاصة عن المواقف والشارع، وباب الماستر من ممر الغرف،
  // وباب المقلط — حلول معمارية على هذا المخطط لهذه الأرض، مكتوبة في ملاحظاته (dist/r16-polish.mjs)
  if (!R14_OFF.has('r16')) { try { const pol = polishR16(doc); if (pol.notes_ar.length) layout.notes.push(...pol.notes_ar); } catch { /* يبقى كما رُسم */ } }
  // (الجولة السابعة عشرة) الصالة لا تبقى ممرًا عابرًا (إزاحة أبوابها حتى تتسع جلسة عائلية)، و«مقهوي» يخدم مجلس الرجال من المطبخ أو الطعام
  // متى اتسع (dist/r17-polish.mjs) — مكتوبة في الملاحظات
  if (!R14_OFF.has('r17')) { try { const pol = polishR17(doc); if (pol.notes_ar.length) layout.notes.push(...pol.notes_ar); } catch { /* يبقى كما رُسم */ } }
  const relaxed = relaxFixtures(doc), rv = reviewDoc(relaxed), q = quality(relaxed);
  const qg = qualityGates(relaxed, layout, { kitchenFront: (P.rules || []).some(r => r.kind === 'place' && r.side === 'front' && /kitchen|مطبخ/.test(String(r.a))), ...gateOpts(P), narrow: site.W < NARROW_W });
  const reject = [...hardGates(relaxed, P, rv), ...qg];
  // عدد المواقف اشتراط نظامي متحقق: بديل لا يتسع فيه العدد المطلوب أمامه ولا بإزاحة المبنى إلى الخلف لا يُعرض
  if (pk && pk.bays.length < pk.required && !PARK_SHORT_OK) reject.push(`لم يتسع إلا ${pk.bays.length} من ${pk.required} موقف مطلوب نظاميًا داخل الأرض خارج المبنى وممرات الأبواب (${PARKING_RULE.source}).`);
  // (الجولة الثانية عشرة) لا كتلة «شريط ضيق» على أرض عرضها القابل للبناء ≥ 14 م (نموذج الأرض الضيقة لا يناسبها؛ قرار المراجع المستقل)
  if (site.W >= 14 && cand.ew < .6 * site.W && cand.ed > 2 * cand.ew) reject.push(`كتلة «شريط ضيق» ${r2(cand.ew)} × ${r2(cand.ed)} م على أرض عرضها القابل للبناء ${r2(site.W)} م: نموذج الأرض الضيقة لا يستجيب لعرض هذه الأرض.`);
  const ledger = verifyRequest(relaxed, requirements, { entry });
  const builtA = sum(layout.rooms.filter(r => !r.open).map(A_));
  layout.notes.push(`مسطح الدور ${Math.round(builtA)} م² داخل غلاف ${r2(cand.ew)} × ${r2(cand.ed)} م من مساحة قابلة للبناء ${Math.round(site.W * site.D)} م²؛ الباقي ساحات${cand.sol.voids.length ? ' وحديقة داخل كتلة المبنى' : ''}${cand.sol.courts.length ? '، وحوش داخلي مكشوف' : ''}.`);
  if (site.irregular) layout.notes.push('الأرض غير منتظمة: الارتدادات أُزيحت داخل حدود المضلع الفعلية، وكل فراغ مبني داخلها' + (site.rectW && cand.ew > site.rectW(cand.ed) + .05 ? `؛ عرض المبنى ${r2(cand.ew)} م يتجاوز أعرض مستطيل يتسع في الأرض (${r2(site.rectW(cand.ed))} م) لأن الكتلة تتبع شكلها.` : '.'));
  const bedFront = (P.rules || []).some(r => r.kind === 'place' && r.side === 'front' && ['bedrooms', 'master', 'kids', 'elderly', 'onebed'].includes(r.a));
  // (الجولة الرابعة عشرة) التفضيلات السعودية الافتراضية (حمام الخادمة، حمام لكل غرفة، مسار التقديم، فاصل المجلس، مدخل المجلس، دورة المياه
  // اليومية، الحوش الخلفي، المواقف): جزاء في الاختيار لا رفض (قرار المالك: تفضيلات تُدرس لكل أرض، تُذكر إن لم تُطبَّق)
  let prefFails = [], prefG = [], prefMajor = []; try { const all = measureSaudiProgram(relaxed, reviewRequest(requirements, land, null), analyzeDoc(relaxed)).filter(g => g.applicable && !g.pass && !g.clientAsked && !g.regulation); prefG = all.filter(g => PREF_W[g.id]); prefFails = prefG.map(g => g.id); prefMajor = all.filter(g => MAJOR_PREFS.includes(g.id) || (g.id === 'MAJLIS_BED_WALL' && (g.value?.pairs || []).some(p => /الرئيسية/.test(p.bedroom)))).map(g => g.id); } catch { prefFails = []; }
  // (الجولة الخامسة عشرة) العيب الجوهري (ما يجعل البديل «يحتاج تعديلات»، presentation-status.mjs) جزاؤه أثقل من الملاحظة الطفيفة:
  // مجلس يلاصق الرئيسية، أو مدخل مجلس من ارتداد جانبي ضيق — فيتقدم ما لا يحتاج تعديلًا قبل العرض
  const majorExtra = sum(prefG.map(g => (g.id === 'MAJLIS_BED_WALL' && (g.value?.pairs || []).some(p => /الرئيسية/.test(p.bedroom)) ? 180 : g.id === 'MAJLIS_STREET_ENTRY' || g.id === 'BED_BATH' || g.id === 'MAID_BATH' ? 120 : 0)));
  // (الجولة السادسة عشرة) العيوب التي أثبتتها المراجعة المستقلة r15 (privacy-defects.mjs) وبقيت بعد التحسين: جزاء العيب الجوهري
  let r16 = []; try { r16 = measureR16(relaxed, reviewRequest(requirements, land, null), analyzeDoc(relaxed)).filter(g => g.applicable && !g.pass && !g.clientAsked).map(g => g.id); } catch { r16 = []; }
  const r16Pen = R14_OFF.has('r16') ? 0 : sum(r16.map(id => R16_W[id] || 150));
  const prefPen = (R14_OFF.has('prefq') ? 0 : sum(prefFails.map(id => PREF_W[id])) + (R14_OFF.has('fit') ? 0 : majorExtra + typologyFit(cand, P, site))) + r16Pen;
  return { doc: relaxed, cand, dr: docRooms(relaxed), reject, penalty: r2(cand.pen), streetBeds: bedFront ? [] : streetBedrooms(layout.rooms), quality: r2(cand.pen + q.cost + prefPen), prefFails, r16, major: [...new Set([...prefMajor, ...r16])], same: false, mirror, issues: q.issues, mode: cand.mode, parti: cand.tag, env: { w: cand.ew, d: cand.ed, ox: pl.ox, oy: pl.oy }, pat: patOf(cand), notes: [...P.notes, ...layout.notes], summary: describe(cand), rooms: layout.rooms, qgates: qg, ledger, fails: ledger.filter(x => !x.ok).length };
}

/**
 * دوران: الأرضي للضيافة والخدمة (مجالس، طعام، مطبخ، خادمة، كبار السن) والسلم بين المدخل والصالة؛
 * العلوي لأجنحة النوم حول صالة علوية خلف السلم في الموضع ذاته. الغلاف واحد للدورين.
 */
function generateVillaTwoFloors0({ land, counts, requirements = {}, keep = 3, title = 'تصميم أولي من شرعاء', exclude = [], prefer = null }) {
  const t0 = now(), tw = requirements.tweaks || {}, exSet = new Set(exclude);
  land = landWithSite(land, requirements);
  const P = programV2(counts, requirements), site = siteOf(land), entry = site.entry; P.entry = entry;
  const groundKinds = new Set(['majlis', 'dining', 'kitchen', 'maid', 'office', 'prayer', 'driver']);
  const wantG = new Set(), wantU = new Set();
  for (const r of P.rules.filter(x => x.kind === 'floor')) for (const b of blocksFor(r.a, P.blocks)) (r.floor === 'ground' ? wantG : wantU).add(b);
  const upperOk = b => ['suite', 'family', 'office', 'prayer'].includes(b.kind);
  const gBlocks = P.blocks.filter(b => wantG.has(b) || b.id === 'wc1' || b.day || ((groundKinds.has(b.kind) || b.guest || b.elderly) && !(wantU.has(b) && upperOk(b))));
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
  // (الجولة الثانية عشرة) أجنحة العلوي في عمودين على جانبي السلم: عمق الغلاف يتسع لأكثرهما غرفًا (لا يكفي المسطح وحده)
  const nUp = uBlocks.filter(b => b.kind === 'suite').length, perCol = Math.ceil(nUp / 2);
  const minDepth = nUp >= 5 ? Math.min(site.D, perCol * 4.9 + (uBlocks.some(b => b.master) ? .8 : 0)) : 0;
  const farStair = P.rules.some(r => r.kind === 'far' && ((r.a === 'master' && r.b === 'stairs') || (r.b === 'master' && r.a === 'stairs')));
  const pref2 = prefer && typeof prefer === 'object' ? prefer.pat ?? null : prefer;
  const cands = candidates(G, site, { stair: true, rules: P.rules.filter(r => r.kind !== 'floor'), entry, avoid: new Set(tw.avoidModes || []), exclude: new Set(), iters: 160, minEnv, minDepth, capSuite: P.suites.some(b => b.master && uBlocks.includes(b)) ? DESIGN_TARGETS.master - 1 : 0, backAfterStair: farStair ? CMIN.hall + 4.2 : 0, prefPat: pref2 ? String(pref2).split('/')[0] : null });
  const designs = [], rejected = []; let gTried = 0;
  const rules2 = P.rules.filter(r => r.kind !== 'floor'), allP = { ...P, counts: P.counts, upperHallName };
  /** يبني بديلًا بدورين من أرضي محلول g وعلوي محلول up، ويفحصه (البوابات الصلبة، والجودة، والتراكب، والمراجعة المستقلة). */
  const build2 = (g, up, { summary, note }) => {
    const pat = patOf(g) + '/' + up.tag; if (exSet.has(pat)) return;
    try {
      const mirror = g.rp && g.rp.p[0] !== g.rp.p[1] ? g.rp.p[1] < g.rp.p[0] : false;
      // (الجولة الحادية عشرة) حمامات العلوي فوق الرطب في الأرضي ما أمكن: يُعطى العلوي فراغات الأرضي المحققة
      let gRooms = null; try { gRooms = realizeV2(g, G, {}).rooms; } catch { gRooms = null; }
      const ul = realizeV2(up, U, { upper: true, below: gRooms }); ul.glazing = requirements?.prefs?.glazing || null;
      const stairR = g.sol.circ.find(c => c.id === 'stair').r;
      const d = buildDesign(g, G, site, land, {
        title, mirror, requirements, entry, second: doc0 => {
          const { T } = transformFor(site, g, mirror);
          let doc = applyCommand(doc0, { type: 'add-level', name: 'الدور الأول' }).doc; const L2 = doc.levels[doc.levels.length - 1].id;
          doc = drawPlanV2(doc, ul, { level: L2, T });
          doc = addStair(doc, stairR, T, LV, up.sol.stairSide || 'x0', { farMaster: farStair });
          if (farStair) masterDoorFar(doc, reviewRequest(requirements, land, counts));
          return doc;
        },
      });
      // (الجولة التاسعة) اتساق التراكب مقيسًا من المرسوم: لا جدار علوي يمتد > 5 م بلا جدار تحته، ولا غرفة فوق فراغ أرضي
      const reject = [...hardGates(d.doc, allP), ...qualityGates(d.doc, null, { ...gateOpts(allP), narrow: site.W < NARROW_W }).filter(w => !d.qgates.includes(w)), ...d.qgates, ...stackingGates(d.doc)];
      if (reject.length) { rejected.push({ pat, why: reject }); if (globalThis.__v2keepRejDocs) (globalThis.__v2rejDocs ||= []).push({ pat, why: reject, doc: d.doc }); return; }
      if (!gateReview(d, requirements, land, counts)) { rejected.push({ pat, why: d.review.rejectReasons_ar, gates: d.review.failedGates, by: 'plan-review' }); if (globalThis.__v2keepRejDocs) (globalThis.__v2rejDocs ||= []).push({ pat, why: d.review.rejectReasons_ar, doc: d.doc }); return; }
      d.pat = pat; d.summary = summary; d.notes = [...new Set([...d.notes, ...ul.notes, note])];
      d.stacking = stackingReport(d.doc);
      // (الجولة الثامنة عشرة) حمامات علوية فوق المجلس أو الطعام أو المدخل: تُذكر مقيسة من المرسوم (تمديدات صرف فوق فراغ جاف — تحتاج تحققًا
      // صحيًا وإنشائيًا مستقلًا)؛ لم يُحل بالبحث في هذا النمط (المراجع المستقل r17، C7)
      { const wd = wetOverDry(d.doc); if (wd.length) d.notes = [...d.notes, `حمامات في الدور العلوي فوق فراغات جافة في الأرضي: ${wd.map(x => `«${x.bath}» فوق «${x.over}» (${x.pct}٪)`).join('، ')} — تمديدات الصرف تمر فوقها وتحتاج تحققًا صحيًا وإنشائيًا مستقلًا.`]; }
      d.ledger = verifyRequest(d.doc, requirements, { entry }); d.fails = d.ledger.filter(x => !x.ok).length;
      designs.push(d);
    } catch (e) { rejected.push({ pat, why: [String(e.message || e)] }); }
  };
  if (!cands.length) rejected.push({ pat: '*', why: ['لا ترتيب أرضي ناجح'] });
  for (const g of cands) {
    if (designs.length >= keep + 3 || ++gTried > BUILD_MAX2) break; // حتمي: بعدد الترتيبات الأرضية لا بالزمن
    const ups = upperFor(g, U, site, rules2, entry);
    if (globalThis.__v2dbg) { const st = g.sol.circ.find(c => c.id === 'stair').r; globalThis.__v2dbg['g:' + patOf(g)] = [g.ew, g.ed, st.x0, st.x1, st.y0, st.y1, ups.map(u => u.tag).join('/'), 'voids=' + JSON.stringify(g.sol.voids.map(v => [v.x0, v.x1, v.y0, v.y1].map(x => Math.round(x * 10) / 10)))].join(' '); }
    if (!ups.length) { rejected.push({ pat: patOf(g), why: ['لا دور علوي يتسع على هذا الغلاف'] }); continue; }
    for (const up of ups.slice(0, 3)) build2(g, up, { summary: describe(g) + ' (دوران)', note: 'السلم بين مدخل العائلة والصالة، ويصل إلى الصالة العلوية في الموضع نفسه.' });
  }
  // (الجولة التاسعة) تنظيمات الدورين بموضع سلم مختلف (على جدار الجار ببهو مزدوج، في الخلف، كتلة عائلية بدورين وجناح
  // ضيافة بدور واحد، في قلب البيت حول فراغ مزدوج)، ولكل أرضي تنظيمان علويان مختلفان (ممر محوري / ردهة وصالة)
  { const avoidM = new Set(tw.avoidModes || []), ctxG = { narrow: site.W < NARROW_W, dinRealized: true, bigOK: U.suites.length >= 5, maxBuilt: site.maxBuilt, kitchenFront: rules2.some(r => r.kind === 'place' && r.side === 'front' && /kitchen|مطبخ/.test(String(r.a))), capSuite: P.suites.some(b => b.master && uBlocks.includes(b)) ? DESIGN_TARGETS.master - 1 : 0, bedFront: false };
    const doneModes = new Set();
    for (const tr of tfTrees(G, U)) {
      if (avoidM.has(tr.mode) || doneModes.has(tr.mode)) continue;
      let r = null; try { r = tfJoint(tr, G, U, site, rules2, entry, { ...ctxG, foyerYard: !!tr.foyerYard }); } catch { r = null; }
      if (!r) { rejected.push({ pat: tr.mode + ':' + tr.tag, why: ['لا دور علوي يتسع فوق مسقطه الأرضي بهذا التنظيم'] }); continue; }
      const n0 = designs.length;
      build2(r.g, r.up, { summary: `${TF_PARTI_AR[tr.mode]}؛ والعلوي: ${TF_UPPER_AR[tr.org] || ''} (دوران)`, note: tr.mode === 'frontstair' ? 'السلم في المقدمة خلف بهو المدخل، ويصل إلى ردهة علوية فوق البهو وصالة علوية خلفه؛ والرئيسية في الركن الخلفي البعيد.' : tr.mode === 'sidestair' ? 'السلم على جدار الجار بجوار بهو مزدوج الارتفاع، ويصل إلى الدور العلوي في الموضع نفسه.' : tr.mode === 'rearstair' ? 'السلم في الخلف بجوار الصالة، ويصل إلى الدور العلوي في الموضع نفسه.' : tr.mode === 'stairhall' ? 'السلم بين بهو المدخل والصالة، ويصل إلى الدور العلوي بين الصالة العلوية الأمامية والردهة.' : tr.mode === 'guestgarden' ? 'المجلس جناح ضيافة بدور واحد (سطحه مكشوف)، وغرفة كبار السن على حديقة خاصة بعيدة عن الضيافة؛ والسلم في آخر جناح الخدمة يصل إلى الصالة العلوية.' : tr.mode === 'rowsup' ? 'السلم خلف المدخل يصل إلى ردهة علوية بين الصالة العائلية الأمامية ورواق الغرف الخلفي.' : 'المجلس جناح ضيافة بدور واحد (سطحه مكشوف)، والدور العلوي فوق الكتلة العائلية فقط.' });
      if (designs.length > n0) doneModes.add(tr.mode); // بديل واحد من كل تنظيم أرضي يكفي (الاختيار يعرض واحدًا من كل عائلة)
    } }
  if (!designs.length) { const e = Error('تعذّر بناء أي بديل سليم لدورين.'); e.code = 'VILLA_BUILD_FAILED'; e.rejected = rejected; throw e; }
  for (const d of designs) d.dr = docRooms(d.doc);
  if (globalThis.__v2dbg) { globalThis.__v2pool = designs.map(d => ({ pat: d.pat, dr: d.dr, quality: d.quality, fails: d.fails, failed: d.ledger.filter(x => !x.ok).map(x => x.text + ': ' + x.why) })); if (globalThis.__v2keepDocs) globalThis.__v2poolDocs = designs.map(d => ({ pat: d.pat, doc: d.doc })); }
  const out = pickReviewed(designs, keep, requirements, land, counts);
  if (!out.length) throw reviewFailure(designs, rejected);

  const prefPat2 = prefer && typeof prefer === 'object' ? prefer.pat ?? null : prefer;
  out.forEach(d => { d.same = !!prefPat2 && d.pat === prefPat2; });
  const finalD = finalReviewSet(out, requirements, land, counts);
  if (!finalD.length) throw reviewFailure(designs, rejected);
  if (finalD.length < keep) finalD[0].notes = [...finalD[0].notes, `وُجد ${finalD.length} ${finalD.length === 1 ? 'بديل' : 'بدائل'} مختلفة تنظيميًا فقط تجتاز المراجعة وتنفّذ بنود طلبك (من ${keep} مطلوبة)؛ لا يُعرض بديل يخالف بندًا صريحًا من طلبك لسد العدد.`];
  const shortfall_ar = shortfallReason(keep, finalD, designs, rejected);
  finalD.forEach(d => { delete d.cand; delete d.dr; delete d.reject; delete d.sig; delete d.droppedBy; });
  return { designs: finalD, program: P, W: r2(site.W), D: r2(site.D), engine: VILLA_V2_ENGINE_VERSION, floors: 2, shortfall_ar, rejected: [...rejected.map(({ doc, ...r }) => r), ...heavyRejected(designs)], pool: designs.map(d => ({ pat: d.pat, quality: d.quality, fails: d.fails, heavy: d._heavy ?? null })), ms: Math.round(now() - t0) };
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
  // الدور العلوي فوق المبنى الأرضي لا فوق فراغ: مساحة الفراغات العلوية خارج المسقط الأرضي المبني (بروز/كابولي) — يُقبل
  // بروز صغير فقط (OVERHANG_MAX)؛ الحدائق والأحواش والفراغات المفتوحة في الأرضي لا تحمل غرفًا فوقها
  const gSolid = [...g.sol.placed.map(p => p.r), ...g.sol.circ.map(c => c.r)];
  const ovl = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const overhang = sol => sum([...sol.placed.map(p => p.r), ...sol.circ.map(c => c.r)].map(r => Math.max(0, A_(r) - sum(gSolid.map(q => ovl(r, q))))));
  // دورات المياه والمكتب والمصلى المطلوبة فوق: في رأس الجناح مع دورات المياه
  const wcs = [...(U.wcs || []), ...U.blocks.filter(b => ['office', 'prayer'].includes(b.kind))];
  const UP = { ...U, men: null, women: [], hallArea: U.hallArea };
  const master = S.find(b => b.master) || null;
  const bestBy = {};
  const HALL = () => C('hall', { area: U.hallArea });
  // (الجولة الثانية عشرة) deepS: غرفة نوم غير الرئيسية في عمق عمود المحور خلف الصالة العلوية (الدور العلوي بخمس غرف أو أكثر:
  // عمودا الأجنحة لا يتسعان لكل الغرف بعمق الغلاف، والصالة لا تمتد وحدها بطول العمود)
  const backS = n >= 5 ? ([...S].reverse().find(b => !b.master && !b.bath) || [...S].reverse().find(b => !b.master)) : null;
  // ord=1 (خمس غرف أو أكثر بدورة مياه مشتركة): الجناح ذو الدورة المشتركة في آخر الجناح الأيسر (يلامس الصالة خلف السلم بطول يتسع لبابيه)
  const ords = n >= 5 && S.some(b => b.bathShared) ? [0, 1] : [0];
  for (const hub of ['front', 'back', 'landing', 'deep', 'deepK', 'terrace', ...(backS ? ['deepS', 'landingC'] : [])]) for (let kL = 0; kL <= n; kL++) for (const mSide of ['R', 'L']) for (const ord of ords) {
    let best = bestBy[hub] || null;
    let rest = [...S], frontRoom = null;
    if (hub === 'deep' || hub === 'deepK') { if (!master || n < 2 || mSide === 'L') continue; rest = rest.filter(b => b !== master); }
    if (hub === 'deepS') rest = rest.filter(b => b !== backS);
    if (ord) { const sh = rest.filter(b => b.bathShared), o = rest.filter(b => !b.bathShared); if (!sh.length || kL < 1 || kL > o.length + sh.length) continue; rest = [...o.slice(0, kL - 1), ...sh, ...o.slice(kL - 1)]; }
    if (hub === 'back' || hub === 'deepK') { const i = rest.findIndex(b => !b.master); if (i < 0 || rest.length < 3) continue; frontRoom = rest.splice(i, 1)[0]; }
    if (kL > rest.length) continue;
    // الرئيسية في آخر الجناح الأيمن (R) أو آخر الأيسر (L): العمودان قد يختلفان عرضًا بموضع السلم
    let L = rest.slice(0, kL), R = rest.slice(kL);
    if (mSide === 'L') { if (!master || !rest.includes(master) || !kL) continue; const o = rest.filter(b => b !== master); L = [...o.slice(0, kL - 1), master]; R = o.slice(kL - 1); }
    // السلم في النصف الخلفي (السلم في آخر الصالة): الرئيسية في مقدمة جناحها (أبعد ما تكون عن السلم) لا في آخره
    if (sr.y0 > ed / 2) { L = [...L].reverse(); R = [...R].reverse(); }
    if ((L.length && x0 < 3.3) || (R.length && ew - x1 < 3.3) || (!L.length && x0 > .3) || (!R.length && ew - x1 > .3)) continue;
    // terrace: فوق مدخل العائلة سطح مكشوف (الدور العلوي يرتد عن الواجهة في المحور)، والسلم يصعد إلى الصالة خلفه
    const pre = hub === 'front' ? HALL() : hub === 'landingC' ? C('corrF', { area: 8 }) : hub === 'back' || hub === 'deepK' ? Z([frontRoom], 'y1', 'x') : hub === 'terrace' ? VOID(6) : C('corrF', { area: 8 });
    const post = hub === 'front' ? [C('corrB', { area: 10 })] : hub === 'deep' || hub === 'deepK' ? [HALL(), Z([master], 'y0', 'x')] : hub === 'deepS' ? [HALL(), Z([backS], 'y0', 'x')] : hub === 'landingC' ? [HALL(), C('corrB', { area: 6 })] : [HALL()];
    const hubCol = { t: 'y', k: [pre, C('stair', { fix: sr.y1 - sr.y0, area: 1 }), ...post], w: [1, 1, ...post.map(() => 1)], hub: true };
    // الأرضي فيه حديقة/فراغ في آخر جناح: الجناح العلوي فوقه يقف قبلها (سطح مكشوف أو فراغ) — لا غرف فوق الحديقة
    const gv = g.sol.voids.length ? (z => Y(z, OV(6))) : (z => z);
    const tree = X(L.length ? gv(Z([...L, ...(R.length ? [] : [...wcs, ...Fam])], 'x1', 'y')) : null, hubCol, R.length ? gv(Z([...wcs, ...Fam, ...R], 'x0', 'y')) : null);
    if (!tree || tree.t !== 'x') continue;
    const nodes = weightNodes(tree).filter(nd => nd !== tree && (nd !== hubCol || post.length > 1));
    const evalU = () => {
      const sol = solveFixed(tree, ew, ed, x0, x1, sr.y0); if (!sol) return null;
      let s = scoreV2(sol, UP, ew, ed, { upper: true }); if (s === null) return null;
      { const ov = overhang(sol); if (ov > OVERHANG_MAX) { s += 600 + 40 * ov; sol.viol = (sol.viol || 0) + 1; } }
      const ur = upperRules(sol, ew, ed, rules, entry); sol.stairSide = ur.side;
      return { p: s + RULE_K * ur.pen, sol };
    };
    const R0 = rng(hash('u' + hub + kL + mSide + (ord ? 'o' : '')));
    for (let restart = 0; restart < 4; restart++) {
      if (restart) nodes.forEach(nd => { nd.w = nd.w.map(() => Math.exp((R0() - .5) * 1.2)); });
      let cur = evalU();
      for (let it = 0; it < 120 && nodes.length; it++) { const i = Math.floor(R0() * nodes.length), j = Math.floor(R0() * nodes[i].w.length), old = nodes[i].w[j]; nodes[i].w[j] *= Math.exp((R0() - .5) * .8); const c = evalU(); if (c && (!cur || c.p < cur.p)) cur = c; else nodes[i].w[j] = old; }
      // نزول إحداثي حتمي لتنظيم علوي قريب من القبول (مخالفة أو اثنتان)
      if (cur && cur.sol.viol >= 1 && cur.sol.viol <= 2) for (let round = 0; round < CD_ROUNDS; round++) {
        let imp = false;
        for (const nd of nodes) for (let j = 0; j < nd.w.length; j++) for (const f of [1.3, .77, 1.1, .91]) { const old = nd.w[j]; nd.w[j] *= f; const c = evalU(); if (c && c.p < cur.p - 1e-9) { cur = c; imp = true; } else nd.w[j] = old; }
        if (!imp || !cur.sol.viol) break;
      }
      if (cur && !cur.sol.viol && (!best || cur.p < best.p)) best = { ...cur, tag: 'u' + (hub === 'deepK' ? 'k' : hub === 'terrace' ? 'r' : hub === 'deepS' ? 's' : hub === 'landingC' ? 'c' : hub[0]) + kL + (mSide === 'L' ? 'm' : '') };
      if (best) break;
      const d = globalThis.__v2dbg; if (d && restart === 3) { if (!cur) d['up:' + g.tag + ':' + hub + kL + mSide + ord] = 'nosol'; else { const o = {}; globalThis.__v2dbg = o; scoreV2(cur.sol, UP, ew, ed, { upper: true }); globalThis.__v2dbg = d; d['up:' + g.tag + ':' + hub + kL + mSide + ord] = Object.keys(o).join(','); } }
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
      let sc = scoreV2(sol, UP, ew, ed, { upper: true }); if (sc === null) return null;
      { const ov = overhang(sol); if (ov > OVERHANG_MAX) { sc += 600 + 40 * ov; sol.viol = (sol.viol || 0) + 1; } }
      const ur = upperRules(sol, ew, ed, rules, entry); sol.stairSide = ur.side;
      return { p: sc + RULE_K * ur.pen, sol };
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
    if (n.t === 'circ') { out.circ.push(n.wc ? { id: n.id, r, wc: true } : { id: n.id, r }); return true; }
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
function stairFoot(sr, side = 'x0') { const wh = sr.x1 - sr.x0, w = Math.max(.9, Math.min(1.2, (wh - .3) / 2)); return side === 'x1' ? { x0: Math.max(sr.x0, sr.x1 - .15 - 2 * w), x1: sr.x1 - .15, y0: sr.y0 + .16, y1: sr.y1 - .16 } : { x0: sr.x0 + .15, x1: Math.min(sr.x1, sr.x0 + .15 + 2 * w), y0: sr.y0 + .16, y1: sr.y1 - .16 }; }
/** الحركة كما تراها قواعد العميل: السلم بمستطيله المرسوم لا بفراغه كله («الماستر بعيدة عن الدرج» تُقاس من الدرج نفسه). */
const ruleCirc = (circ, side = 'x0') => circ.map(c => (c.id === 'stair' ? { ...c, r: stairFoot(c.r, side) } : c));
/**
 * عقوبة القواعد للدور العلوي مع اختيار جهة رسم السلم داخل فراغه (يسارًا أو يمينًا): الجهة الأبعد عن الجناح الرئيسي
 * («الماستر بعيدة عن الدرج»). يعيد { pen, side }.
 */
function upperRules(sol, ew, ed, rules, entry) {
  let best = null;
  for (const side of ['x0', 'x1']) { const rp = rulePenalty(sol.placed, ruleCirc(sol.circ, side), ew, ed, rules, entry), pen = rp.base + Math.min(...rp.p); if (!best || pen < best.pen - 1e-9) best = { pen, side }; }
  return best;
}
function addStair(doc, sr, T, level, side = 'x0', { farMaster = false } = {}) {
  // (الجولة العاشرة) السلم يُختار من هندسته الفعلية داخل غرفته المرسومة (dist/stair-geometry.mjs): القوائم من ارتفاع الدور
  // (≤ 0.18 م)، والنوائم ≥ 0.28 م، والعرض ≥ 1.0 م، والبسطة ≥ عرض القلبة، والنوع (مستقيم / L / U) الذي يتسع فعلًا، والوصول
  // الحر أمام أول قائمة وبعد آخرها، والفتحة في غرفة السلم العلوية — وهي الفحوص نفسها في بوابة STAIR_GEOMETRY.
  // side: جهة السلم المفضلة في فراغه (x0/x1 القانونية) لقاعدة «الماستر بعيدة عن الدرج»؛ farMaster: الأبعد عن الرئيسية العلوية أولًا.
  const model = analyzeDoc(doc), li = Math.max(0, doc.levels.findIndex(l => l.id === level));
  const mid = T((sr.x0 + sr.x1) / 2, (sr.y0 + sr.y1) / 2), pref = T(side === 'x1' ? sr.x1 - .6 : sr.x0 + .6, (sr.y0 + sr.y1) / 2);
  const ms = farMaster ? (model.levels[li + 1]?.rooms || []).find(r => r.type === 'master') : null;
  // المسافة كما يقيسها سجل المطابقة (rules.mjs): بين مركز صندوق السلم ومركز الرئيسية
  const ctrDist = (b, R) => { const xs = R.net.map(p => p.x), ys = R.net.map(p => p.y); return Math.hypot((b.x0 + b.x1) / 2 - (Math.min(...xs) + Math.max(...xs)) / 2, (b.y0 + b.y1) / 2 - (Math.min(...ys) + Math.max(...ys)) / 2); };
  const prefer = b => (ms ? -Math.round(ctrDist(b, ms) / .25) * 10 : 0) + Math.hypot((b.x0 + b.x1) / 2 - pref.x, (b.y0 + b.y1) / 2 - pref.y) / 10;
  // (الجولة الحادية عشرة) السلم المختار يُمشى فعلًا: من المدخل إلى أول درجة، ومن آخر درجة إلى كل فراغات الدور العلوي
  // (dist/circulation-proof.mjs بحدود البوابة) — لا يُقبل سلم تفصل فتحته بسطة الوصول عن الصالة العلوية
  const walkable = st => { try { const d = applyCommand(doc, { type: 'add-stair', ...st }).doc; return !circulationProof(d, { limits: CIRC_GATE_LIMITS }).findings.some(f => f.severity === 'serious' && /^STAIR_|^UNREACHABLE$|^NO_WALKABLE_PATH$/.test(f.code)); } catch { return false; } };
  const pick = chooseStair(model, li, mid, { level, prefer, accept: globalThis.__noWalk ? null : walkable });
  if (pick) { const { kind, x, y, rot, w, run, flip, steps } = pick.stair; return applyCommand(doc, { type: 'add-stair', level, kind, x, y, rot, w, run, flip, steps }).doc; }
  // لا سلم يتسع ويُوصل إليه: يُرسم السلم السابق (U) بعدد قوائمه الصحيح، فترفضه بوابة STAIR_GEOMETRY ويُذكر السبب
  const wh = sr.x1 - sr.x0, w = Math.max(.9, Math.min(1.2, (wh - .3) / 2)), ac = side === 'x1' ? sr.x1 - .15 - w / 2 : sr.x0 + .15 + w / 2, y0 = sr.y0 + .16;
  const p = T(ac, y0), up = T(ac, y0 + 1), px = T(ac + 1, y0);
  const fx = up.x - p.x, fy = up.y - p.y, rot = Math.atan2(fx, fy), q = { x: Math.cos(rot), y: -Math.sin(rot) };
  const flip0 = (px.x - p.x) * q.x + (px.y - p.y) * q.y < 0, flip = side === 'x1' ? !flip0 : flip0;
  return applyCommand(doc, { type: 'add-stair', level, kind: 'U', x: p.x, y: p.y, rot, w, run: sr.y1 - sr.y0 - .32, flip, steps: risersFor(riseOf(doc.levels, li).rise) }).doc;
}

// ------------------------------------------------------------------------------------------ تنظيمات الدورين (الجولة التاسعة)
// تنظيمات أرضية مختلفة بموضع السلم (على جدار الجار ببهو مزدوج الارتفاع، في الخلف، في كتلة عائلية بدورين وجناح ضيافة
// بدور واحد)، ولكل منها تنظيمات علوية مختلفة (صالة أمامية وممر محوري / ردهة وصالة خلفية). العلوي يُبنى على «إطار» من
// خطوط جدران الأرضي نفسها (قطوع ثابتة)، فتقع جدرانه الرئيسية فوق جدران الأرضي، والسلم في موضعه، والفراغ المزدوج فوق البهو.
export const TF_PARTI_AR = Object.freeze({
  guestgarden: 'جناح ضيافة بدور واحد (المجلس وسطحه مكشوف) في الركن الأمامي، وغرفة كبار السن في الركن الخلفي على حديقتها الخاصة، والكتلة العائلية بدورين والسلم في آخر جناح الخدمة',
  rowsup: 'صفّان: الضيافة والمدخل والسلم والطعام أمامًا، والصالة وكبار السن والمطبخ على الحديقة خلفًا؛ وفي العلوي صالة عائلية أمامية والغرف عنقودًا خلفيًا',
  sidestair: 'السلم على جدار الجار ببهو مدخل مزدوج الارتفاع: المجلس على الواجهة، والصالة خلف البهو، والطعام والمطبخ جناحًا جانبيًا',
  rearstair: 'السلم في الخلف بجوار الصالة: المدخل فالصالة في المحور، والمجلس وغرفة الأرضي جناح، والطعام والمطبخ جناح مقابل',
  guestwing: 'جناح ضيافة بدور واحد (المجلس) أمام كتلة عائلية بدورين، بينهما فناء المدخل',
  frontstair: 'السلم في المقدمة خلف بهو المدخل والصالة خلفه: المجلس وغرفة الأرضي جناح، والطعام والمطبخ جناح مقابل',
  stairhall: 'السلم في قلب البيت بين بهو المدخل والصالة: البهو على الشارع، والصالة خلف السلم على الحديقة، والمجلس وغرفة الأرضي جناح والطعام والمطبخ جناح',
});
const TF_UPPER_AR = Object.freeze({
  front: 'صالة علوية أمامية فوق البهو تطل على الشارع، وردهة خلف السلم إلى الغرف الخلفية، والرئيسية في الركن الخلفي',
  lobby: 'صالة علوية في وسط الكتلة العائلية على السلم، والغرف على جانبيها، وسطح الجناح الضيافي مكشوف',
  gallery: 'رواق على حافة الفراغ المزدوج من السلم إلى صالة علوية خلفية على الحديقة، والغرف حولها',
  spine: 'الصالة العلوية في الأمام وممر محوري إلى الجناح الرئيسي في آخره، والغرف على جانبيه',
  lounge: 'ردهة الدرج تفتح على صالة علوية خلفية تطل على الحديقة، والغرف حولها',
  ring: 'صالة علوية حول فراغ الصالة المزدوج، والغرف على أطرافها',
});
/** حواف مستطيلات مدموجة على الخطوط (للتراكب): { h: Map(c → [[s0,s1]...]), v: … } */
function edgeLines(rects, skip = []) {
  const L = { h: new Map(), v: new Map() };
  const putL = (ax, c, s0, s1) => { const k = Math.round(c * 20) / 20; if (!L[ax].has(k)) L[ax].set(k, []); L[ax].get(k).push([s0, s1]); };
  for (const r of rects) { putL('h', r.y0, r.x0, r.x1); putL('h', r.y1, r.x0, r.x1); putL('v', r.x0, r.y0, r.y1); putL('v', r.x1, r.y0, r.y1); }
  // أجزاء الحواف الواقعة على حافة فراغ مزدوج الارتفاع: درابزين لا جدار يُحمل
  for (const d of skip) for (const [ax, c, s0, s1] of [['h', d.y0, d.x0, d.x1], ['h', d.y1, d.x0, d.x1], ['v', d.x0, d.y0, d.y1], ['v', d.x1, d.y0, d.y1]]) {
    const k = Math.round(c * 20) / 20, list = L[ax].get(k); if (!list) continue;
    L[ax].set(k, list.flatMap(([a, b]) => { const o = []; if (s0 > a + .02) o.push([a, Math.min(b, s0)]); if (s1 < b - .02) o.push([Math.max(a, s1), b]); return o.filter(([p, q]) => q - p > .02); }));
  }
  for (const ax of ['h', 'v']) for (const [k, list] of L[ax]) { list.sort((a, b) => a[0] - b[0]); const m = []; for (const [a, b] of list) { if (m.length && a <= m[m.length - 1][1] + .02) m[m.length - 1][1] = Math.max(m[m.length - 1][1], b); else m.push([a, b]); } L[ax].set(k, m); }
  return L;
}
/** أطول امتداد جدار علوي بلا جدار أرضي تحته ولا ركيزة (تقدير على المستطيلات، كما يقيسه stackingReport على المرسوم). */
function rectStack(GL, ul, exterior = null) {
  let run = 0, free = 0;
  for (const ax of ['h', 'v']) for (const [c, list] of ul[ax]) for (const [s0, s1] of list) {
    if (exterior && exterior(ax, c, s0, s1)) continue;
    const sup = [];
    for (const [gc, gl] of GL[ax]) if (Math.abs(gc - c) <= .2) for (const [a, b] of gl) { const p = Math.max(s0, a), q = Math.min(s1, b); if (q - p > .02) sup.push([p, q]); }
    const ox = ax === 'h' ? 'v' : 'h';
    for (const [gc, gl] of GL[ox]) if (gc >= s0 - .3 && gc <= s1 + .3) for (const [a, b] of gl) if (c >= a - .3 && c <= b + .3) { const p = Math.max(s0, Math.min(s1, gc)); sup.push([p, p]); }
    sup.sort((a, b) => a[0] - b[0]);
    let at = s0; for (const [a, b] of sup) { if (a > at) { run = Math.max(run, a - at); free += a - at; } at = Math.max(at, b); }
    if (s1 > at) { run = Math.max(run, s1 - at); free += s1 - at; }
  }
  return { run, free };
}
/** عقدة «للدورين معًا»: مستطيل واحد، فيه شجرة الأرضي g وشجرة العلوي u (القطوع المشتركة فوقها خطوط جدران للدورين). */
const D2 = (g, u) => { if (!g || !u) return null; const n = { t: 'dual', g, u }; if (g.t === 'circ' && g.fix) n.fix = g.fix; if (g.opt && u.opt) n.opt = true; return n; };
/**
 * تنظيمات الدورين بموضع سلم مختلف: شجرة واحدة للدورين — الأعمدة والصفوف المشتركة (ومنها السلم والفراغ المزدوج فوق
 * البهو) تحدد خطوط الجدران الحاملة للدورين معًا، وداخل كل عمود تقسيم أرضي وتقسيم علوي مستقلان يُحلّان بالبحث نفسه
 * (أوزان مشتركة) ويُقيّمان معًا: الأرضي، والعلوي، والتراكب، وقواعد العميل. G/U: برنامجا الأرضي والعلوي.
 */
/** (الجولة الثامنة عشرة) حمامات الدور العلوي فوق المجلس أو الطعام أو المدخل في الأرضي (≥ 25٪ من مساحة الحمام)، مقيسة من المستند. */
export function wetOverDry(doc) {
  const m = analyzeDoc(doc), [G, U] = m.levels; if (!G || !U) return [];
  const out = [];
  for (const b of U.rooms.filter(r => r.type === 'bath')) {
    const xs = b.net.map(p => p.x), ys = b.net.map(p => p.y), hit = new Map(); let n = 0;
    for (let x = Math.min(...xs) + .1; x < Math.max(...xs); x += .2) for (let y = Math.min(...ys) + .1; y < Math.max(...ys); y += .2) { if (!pointInPolygon({ x, y }, b.net)) continue; n++; const g = G.roomAt({ x, y }); if (g && ['majlis', 'dining', 'entrance', 'living', 'bedroom', 'master'].includes(g.type) && !/مغاسل|ممر/.test(g.name || '')) hit.set(g.name, (hit.get(g.name) || 0) + 1); }
    for (const [k, v] of hit) if (n && v / n >= .25) out.push({ bath: b.name, over: k, pct: Math.round(100 * v / n) });
  }
  return out;
}
function tfTrees(G, U) {
  const T = DESIGN_TARGETS, M = G.men, Wm = G.women[0] || null;
  const Dn = G.dining, K = G.kitchens, Md = G.maid ? [G.maid] : [];
  const flex = [...G.women.slice(1), G.guest, G.office, G.prayer, G.driver].filter(Boolean);
  const back = [...G.suites, ...(G.wcs || [])];
  const Mz = d => (M ? Z([M], d, 'x') : null);
  const H = () => C('hall', { area: G.hallArea }), UH = () => C('hall', { area: U.hallArea });
  const F = () => C('foyer', G.dayWc ? { area: FOYER_WC_AREA, wc: true } : { area: T.foyer * .85 }), FDH = () => C('foyer', { area: T.foyer * 1.5, dh: true });
  const ST = () => D2(C('stair', { fix: 3.7, area: 3.8 * 3.7 }), C('stair', { fix: 3.7, area: 3.8 * 3.7 }));
  const S = U.suites; if (!S.length || !K.length || !Dn.length) return [];
  const master = S.find(b => b.master) || S[S.length - 1], kids = S.filter(b => b !== master);
  const wcs = [...(U.wcs || []), ...U.blocks.filter(b => ['office', 'prayer'].includes(b.kind))];
  const out = [], push = (mode, tag, org, tree, o = {}) => { if (tree) out.push({ mode, tag, org, tree, iters: DEEP_ITERS, tol: 4, ...o }); };
  // ما يحتاجه العلوي من الأعمدة المشتركة: جناح نوم بحمام بعرض ≤ 5 م (جسر الحمل) و≥ 4 م
  const colNeed = (v, min) => 400 * Math.max(0, min - v);
  if (!Wm && M && kids.length) for (let nA = 0; nA <= Math.min(1, kids.length - 1); nA++) {
    // (أ) السلم على جدار الجار خلف بهو مدخل مزدوج الارتفاع، وغرفة الأرضي خلفه تفتح على الصالة؛ المجلس على الواجهة أمام
    //     الصالة، والطعام فالمطبخ جناح جانبي. العلوي: الفراغ المزدوج فوق البهو يطل عليه السلم، والسلم يصل إلى صالة علوية
    //     خلفية على الحديقة تفتح عليها الغرف (غرفة فوق المجلس، وغرفة خلف السلم، والغرف والرئيسية على الجانب المقابل)
    const kA = kids.slice(1, 1 + nA), kC = kids.slice(1 + nA);
    const colA = Y(D2(FDH(), { t: 'dh', area: 14 }), ST(), D2(back.length ? Z(back, 'x1', 'y') : VOID(8), kA.length ? Z(kA, 'x1', 'y') : VOID(8)));
    const colB = D2(Y(Mz('y1'), H()), Y(Z([kids[0]], 'y1', 'x'), UH()));
    const colC = Y(D2(OV(10), OV(10)), D2(Y(Z([...flex, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y')), Z([...wcs, ...kC, master], 'x0', 'y')));
    push('sidestair', 'a' + nA, 'lounge', X(colA, colB, colC), { need: sol => { const st = sol.circ.find(c => c.id === 'stair').r, h = sol.circ.find(c => c.id === 'hall').r; return colNeed(W_(st), 3.6) + colNeed(5.0, W_(st)) + colNeed(W_(h), 4.4) + colNeed(5.0, W_(h)) + colNeed(sol.ew - h.x1, 4.2) + colNeed(5.0, sol.ew - h.x1); } });
  }
  if (M && kids.length) for (let nA = 0; nA <= kids.length - 1; nA++) {
    // (ج) السلم في الركن الخلفي بجوار الصالة: المدخل فالصالة في المحور إلى الحديقة، والمجلس وغرفة الأرضي جناح، والطعام
    //     فالمطبخ فالسلم جناح مقابل. العلوي: الرئيسية فوق المجلس في الركن الأمامي (أبعد ما تكون عن السلم)، وغرفة فوق المدخل،
    //     والصالة العلوية خلفها على الحديقة بجوار السلم تفتح عليها الغرف
    const kA = kids.slice(1, 1 + nA), kC = kids.slice(1 + nA);
    const colA = Y(D2(Mz('y1'), Z([master], 'x1', 'y')), D2(back.length ? Z(back, 'x1', 'y') : OV(6), kA.length ? Z(kA, 'x1', 'y') : VOID(6)));
    const colB = D2(Y(F(), H()), Y(Z([kids[0]], 'y1', 'x'), UH()));
    const colC = Y(D2(Y(Wm ? Z([Wm], 'x0', 'y') : null, Z([...flex, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y')), kC.length || wcs.length ? Y(OV(8), Z([...wcs, ...kC], 'x0', 'y')) : VOID(8)), ST());
    push('rearstair', 'c' + nA, 'lounge', X(colA, colB, colC), { need: sol => { const h = sol.circ.find(c => c.id === 'hall').r; return colNeed(h.x0, 4.2) + colNeed(5.0, h.x0) + colNeed(W_(h), 4.4) + colNeed(5.0, W_(h)) + colNeed(sol.ew - h.x1, 3.8) + colNeed(5.0, sol.ew - h.x1); } });
  }
  // (الجولة الحادية عشرة، توجيه المالك لـ C7) تنظيمان يختلفان في توزيع الوظائف والعلاقات لا في موضع السلم وحده:
  // (هـ) جناح ضيافة بدور واحد: المجلس في الركن الأمامي وسطحه مكشوف، وخلفه حديقة خاصة لغرفة كبار السن في الركن الخلفي (تُفتح عليها،
  //      بعيدة عن الضيافة)، والكتلة العائلية بدورين: المدخل فالصالة في المحور، والطعام والمطبخ جناح مقابل والسلم في آخره. العلوي:
  //      الرئيسية فوق غرفة كبار السن في الركن الخلفي (أبعد ما تكون عن السلم في الركن المقابل)، وغرفة فوق المدخل، والصالة العلوية خلفها
  const eldG = back.find(b => b.elderly) || null;
  if (M && kids.length && eldG) for (let nC = 0; nC <= Math.min(1, kids.length - 1); nC++) {
    const kC = kids.slice(1, kids.length - nC), kB = kids.slice(kids.length - nC);
    const colA = Y(D2(Mz('y1'), VOID(30)), D2(VOID(14), VOID(14)), D2(Y(Z(back, 'x1', 'y'), OV(6)), Z([master], 'x1', 'y')));
    const colB = Y(D2(X(F(), OV(5)), Z([kids[0], ...kB], 'y1', 'x')), D2(H(), UH()), D2(OV(6), OV(6)));
    const colC = Y(D2(Y(Wm ? Z([Wm], 'x0', 'y') : null, Z([...flex, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y')), kC.length || wcs.length ? Y(OV(8), Z([...wcs, ...kC], 'x0', 'y')) : VOID(8)), ST());
    push('guestgarden', 'g' + nC, 'lounge', X(colA, colB, colC), { need: sol => { const h = sol.circ.find(c => c.id === 'hall').r; return colNeed(h.x0, 4.2) + colNeed(5.0, h.x0) + colNeed(W_(h), 4.4) + colNeed(5.0, W_(h)) + colNeed(sol.ew - h.x1, 3.8) + colNeed(5.0, sol.ew - h.x1); } });
  }
  // (و) صالة علوية أمامية والغرف عنقود خلفي: الأرضي صفّان — أمامي (المجلس | المدخل والسلم | الطعام يخدم المجلس) وخلفي على الحديقة
  //      (غرفة كبار السن قرب الصالة | الصالة | المطبخ والخدمة)؛ العلوي: صالة عائلية أمامية فوق المجلس والمدخل تطل على الشارع،
  //      والغرف كلها صفًا خلفيًا على رواق عرضي والرئيسية في الركن الخلفي البعيد عن السلم
  if (M && kids.length >= 2) {
    const front = X(D2(Mz('y1'), UH()), Y(D2(F(), C('lobby', { fix: 1.6, area: 6 })), ST()), D2(Z([...flex, ...Dn], 'y1', 'x'), Z([kids[0]], 'y1', 'x')));
    const rear = X(D2(Y(back.length ? Z(back, 'x1', 'y') : null, OV(6)), Y(C('gallery', { fix: 1.5, area: 10 }), Z([master], 'y0', 'x'))), D2(H(), Y(C('gallery2', { fix: 1.5, area: 8 }), Z([...wcs, ...kids.slice(1, -1)], 'y0', 'x'))), D2(Y(Z([...K, ...Md], 'x0', 'y'), OV(6)), Y(OV(6), Z(kids.slice(-1), 'x0', 'y'))));
    push('rowsup', 'r0', 'front', Y(front, rear));
  }
  if (M && kids.length) for (let nA = 0; nA <= Math.min(2, kids.length - 1); nA++) {
    // (ب) السلم في قلب البيت بين بهو المدخل والصالة الأرضية (الصالة خلفه على الحديقة)، والمجلس وغرفة الأرضي جناح والطعام
    //     والمطبخ جناح. العلوي: صالة علوية أمامية فوق البهو تطل على الشارع، وردهة خلف السلم تفتح عليها غرفة في آخر المحور
    //     والغرف الخلفية؛ والرئيسية في الركن الخلفي (أبعد ما تكون عن السلم)
    const kA = kids.slice(1, 1 + nA), kC = kids.slice(1 + nA);
    // (الجانبان في العلوي: سطح مكشوف اختياري في طرف الجناح فوق فراغ أرضي مبني، لا غرفة مضخمة لملء العمق)
    const colA = D2(Y(Mz('y1'), back.length ? Z(back, 'x1', 'y') : null), Y(OV(8), Z([...kA, master], 'x1', 'y')));
    // (الجولة الحادية عشرة) غرفة السلم هنا يُدخل إليها من البهو أمامها ويُخرج منها إلى الصالة خلفها: تحتاج عمق القلبتين (U بـ 18 قائمة
    // ونائمة 0.28 م ≈ 3.45 م) وممرًا حرًا 0.9 م أمام أول قائمة — 4.4 م لا 3.7 (كانت كل تنظيمات «السلم في القلب» ترسب في هندسة السلم)
    const ST4 = () => D2(C('stair', { fix: 4.4, area: 3.8 * 4.4 }), C('stair', { fix: 4.4, area: 3.8 * 4.4 }));
    // (الجولة الثانية عشرة) خمس غرف علوية أو أكثر: ردهة خلف السلم بطول يتسع لأبواب الغرف على جانبيها (لا 1.4 م ثابتة)
    const colB = Y(D2(C('foyer', { area: 16, big: true }), UH()), ST4(), D2(H(), Y(S.length >= 5 ? C('lobby', { area: 9 }) : C('lobby', { fix: 1.4, area: 6 }), Z([kids[0]], 'y0', 'x'))));
    const colC = D2(Y(Wm ? Z([Wm], 'x0', 'y') : OV(8), Z([...flex, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y'), OV(8)), kC.length || wcs.length ? Y(OV(8), Z([...wcs, ...kC], 'x0', 'y'), OV(8)) : VOID(8));
    // (الجولة الثانية عشرة) خمس غرف علوية والرئيسية بعيدة عن الدرج: عمق يتسع لبعدها عن السلم في القلب (≥ 17.5 م)
    const deepNeed = S.length >= 5 ? 17.5 : 0;
    push('stairhall', 'h' + nA, 'front', X(colA, colB, colC), { need: sol => { const h = sol.circ.find(c => c.id === 'hall').r; return colNeed(h.x0, 4.2) + colNeed(5.0, h.x0) + colNeed(W_(h), 4.3) + colNeed(4.8, W_(h)) + colNeed(sol.ew - h.x1, 4.2) + colNeed(5.0, sol.ew - h.x1) + (deepNeed ? colNeed(sol.ed, deepNeed) : 0); } });
  }
  // (الجولة الثانية عشرة، C7 بالقراءة الحرفية: خمس غرف علوية والرئيسية بعيدة عن الدرج) السلم في المقدمة خلف بهو المدخل مباشرة،
  // والصالة الأرضية خلفه؛ المجلس وغرفة الأرضي جناح، والطعام والمطبخ جناح مقابل. العلوي: ردهة فوق البهو، والسلم، وصالة علوية خلفه
  // وممر قصير، والغرف على الجانبين، والرئيسية في الركن الخلفي فوق المطبخ (أبعد ما تكون عن السلم في المقدمة، وحمامها فوق رطب)
  if (M && kids.length >= 3 && S.length >= 4) for (let nA = 1; nA <= Math.min(3, kids.length - 1); nA++) {
    const kA = kids.slice(0, nA), kC = kids.slice(nA);
    const colA = D2(Y(Mz('y1'), Z(back, 'x1', 'y')), Z(kA, 'x1', 'y'));
    // غرفة السلم يُدخل إليها من البهو ويُخرج منها إلى الصالة: عمق القلبتين وممر حر أمام أول قائمة (4.4 م كما في «السلم في القلب»)
    const STF = () => D2(C('stair', { fix: 4.4, area: 3.8 * 4.4 }), C('stair', { fix: 4.4, area: 3.8 * 4.4 }));
    // (الجولة الثالثة عشرة) ممر العلوي خلف السلم بعمق ثابت 1.45 م (صافيه ≥ 1.2 م): كان بالمساحة فيضيق حين يتسع عمود المحور
    const colB = Y(D2(F(), C('corrF', { area: 6 })), STF(), D2(H(), Y(C('corrB', { fix: 1.45, area: 6 }), UH())));
    // الطعام بجوار المجلس (مقلط) في الجناح الأيسر خلفه، والمطبخ وغرفة الأرضي جناحًا أيمن (المطبخ أمام غرفة كبار السن)
    const colA2 = D2(Y(Mz('y1'), Z([...flex, ...Dn], 'x1', 'y')), Z(kA, 'x1', 'y'));
    const colC = D2(Y(Wm ? Z([Wm], 'x0', 'y') : null, Z([...K, ...Md], 'x0', 'y'), Z(back, 'x0', 'y')), Z([...wcs, ...kC, master], 'x0', 'y'));
    void colA2; void colC;
    const colC1 = D2(Y(Wm ? Z([Wm], 'x0', 'y') : null, Z([...flex, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y')), Z([...wcs, ...kC, master], 'x0', 'y'));
    // (الجولة السابعة عشرة، C7؛ المراجع المستقل r16: المجلس بلا باب داخلي والطعام في الجهة المقابلة) جناح ضيافة وخدمة أيسر: المجلس فالمقلط
    //     فالمطبخ والخادمة متتالية (باب مقلط، والتقديم من المطبخ لا يعبر الصالة)، وغرفة الأرضي (ومجلس النساء أمامها إن طُلب) جناحًا أيمن؛
    //     العلوي كما هو: حمامات غرف الجناح الأيسر فوق المطبخ والخدمة (رطب فوق رطب) لا فوق المجلس، والرئيسية في الركن الخلفي البعيد عن السلم
    const colAg = D2(Y(Mz('y1'), Z([...flex, ...Dn], 'x1', 'y'), Z([...K, ...Md], 'x1', 'y')), Z(kA, 'x1', 'y'));
    const colCg = D2(Y(Wm ? Z([Wm], 'x0', 'y') : OV(8), Z(back, 'x0', 'y')), Z([...wcs, ...kC, master], 'x0', 'y'));
    push('frontstair', 'fsg' + nA, 'spine', X(colAg, colB, colCg), { iters: 2 * DEEP_ITERS, need: sol => { const h = sol.circ.find(c => c.id === 'hall').r; return colNeed(h.x0, 4.75) + colNeed(W_(h), 4.4) + colNeed(5.2, W_(h)) + colNeed(sol.ew - h.x1, 4.2); } });
    // (النسخة الأصلية بعد نسخة جناح الضيافة: تنظيم واحد من كل نمط يُبنى، فتتقدم النسخة التي لا يعبر فيها الضيف العائلة)
    push('frontstair', 'fs' + nA, 'spine', X(colA, colB, colC1), { need: sol => { const h = sol.circ.find(c => c.id === 'hall').r; return colNeed(h.x0, 4.2) + colNeed(W_(h), 4.4) + colNeed(5.2, W_(h)) + colNeed(sol.ew - h.x1, 4.2); } });
  }
  if (!Wm && M && kids.length) for (let nL = 1; nL <= Math.min(2, kids.length); nL++) {
    // (د) جناح الضيافة بدور واحد: المجلس يتقدم الواجهة وسطحه مكشوف، وفناء المدخل بجانبه أمام كتلة عائلية بدورين (المدخل
    //     والسلم في مقدمتها). العلوي فوق الكتلة العائلية فقط: صالة علوية في وسطها على السلم، والغرف على جانبيها
    const kL = kids.slice(0, nL), kR = kids.slice(nL);
    const front = X(D2(Mz('y1'), VOID(30)), Y(D2(OV(14), OV(14)), X(ST(), D2(F(), VOID(8)))));
    const block = D2(X(back.length ? Z(back, 'x1', 'y') : null, H(), Y(Z([...flex, ...Dn], 'x0', 'y'), Z([...K, ...Md], 'x0', 'y'))), X(Z(kL, 'x1', 'y'), UH(), Z([...wcs, ...kR, master], 'x0', 'y')));
    push('guestwing', 'd' + nL, 'lobby', Y(front, block), { foyerYard: true });
  }
  return out;
}
/** عجز المجلس الرئيسي (الرجال) عن 24 م² صافيًا بهامش 0.6 م² (تقدير على المحاور كما يُرسم: الشريط والجدران)؛ 0 إن بلغه. */
function majlisShort(sol, P) {
  const m = P.men && sol.placed.find(p => p.block === P.men); if (!m || P.men.fixedArea || majlisAsked(P)) return 0;
  const ms = menStrip(m.r, P), na = P.men.guestWc ? (ms.w - WALL_NET) * (ms.h - WALL_NET) : (W_(m.r) - WALL_NET) * (H_(m.r) - WALL_NET);
  return Math.max(0, MAJLIS_NET + .6 - na);
}
/** يحل تنظيم دورين (tfTrees) بالبحث المشترك: الأرضي والعلوي والتراكب وقواعد العميل معًا. يعيد { g, up } أو null. */
function tfJoint(tr, G, U, site, rules, entry, ctxG) {
  const UP = { ...U, men: null, women: [], hallArea: U.hallArea };
  const ovl = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const evalFn = (sol, ew, ed) => {
    const u = sol.up; if (!u) return null;
    const sg = scoreV2(sol, G, ew, ed, ctxG); if (sg === null) return null;
    const vg = sol.viol || 0;
    const su = scoreV2(u, UP, ew, ed, { upper: true }); if (su === null) return null;
    let viol = vg + (u.viol || 0), pen = sg + su;
    // المجلس الرئيسي ≥ 24 م² صافيًا حدٌّ صلب على المرسوم (qualityGates): هنا مخالفة بهامش، فلا يُبنى بديل يرسب فيه
    sol._tfwhy = new Set();
    { const sh = majlisShort(sol, G); if (sh > 0) { viol++; pen += 600 + 200 * sh; sol._tfwhy.add('majlis-short'); } }
    const gR = [...sol.placed.map(p => p.r), ...sol.circ.map(c => c.r), ...sol.courts], uR = [...u.placed.map(p => p.r), ...u.circ.map(c => c.r)];
    // لا غرفة علوية فوق فراغ أرضي (حديقة/فناء/خارج الكتلة)
    // (الجولة الثانية عشرة) وجدار علوي فوق فراغ غير مبني ملاحظة جسيمة في المراجعة الإنشائية المبدئية: لا بروز يُترك هنا (كان يُسمح بـ 2 م²)
    const ov = sum(uR.map(r => Math.max(0, A_(r) - sum(gR.map(q => ovl(r, q)))))); if (ov > .3) { viol++; pen += 600 + 40 * ov; (sol._tfwhy ||= new Set()).add('ov'); }
    // التراكب: أطول جدار علوي بلا جدار أرضي تحته ولا ركيزة ≤ 5 م — مقيسًا على الغرف المفصّلة (أشرطة الحمامات) متى خلا الحل
    // من المخالفات، وعلى المستطيلات قبل ذلك
    let st = null;
    if (!viol) try {
      const gL = realizeV2({ sol, ew, ed, mode: tr.mode }, G, {}), uL = realizeV2({ sol: u, ew, ed, mode: 'upper' }, U, { upper: true, below: gL.rooms });
      const gr = gL.rooms.filter(r => !r.open), ur = uL.rooms.filter(r => !r.open && !r.dh); st = rectStack(edgeLines(gr), edgeLines(ur, u.dh || []));
      u._masterRoom = ur.find(r => r.type === 'master') || null;
      // (الجولة الحادية عشرة) على المفصّل كما سيُرسم: المجلس (والنساء) عرضه الصافي ≥ 4.2 م ما لم يحدد العميل مقاسه، وكل غرفة علوية
      // يصلها باب من الحركة (لا غرفة بلا باب بعد تفصيل الأشرطة) — كانا يُكتشفان بعد البناء فيُرفض التنظيم كله
      if (!majlisAsked(G)) for (const mj of gr.filter(r => r.type === 'majlis')) { const w = Math.min(W_(mj), H_(mj)) - WALL_NET; if (w < MAJLIS_MIN_W - .05) { viol++; pen += 600 + 400 * (MAJLIS_MIN_W - w); sol._tfwhy.add('majlis-w'); } }
      { const adj = new Map(); for (const d of uL.doors) if (d.b) { (adj.get(d.a) || adj.set(d.a, []).get(d.a)).push(d.b); (adj.get(d.b) || adj.set(d.b, []).get(d.b)).push(d.a); }
        const seen = new Set(['stair']), q = ['stair']; while (q.length) for (const n of adj.get(q.pop()) || []) if (!seen.has(n)) { seen.add(n); q.push(n); }
        const lost = uL.rooms.filter(r => !r.open && !r.dh && !seen.has(r.id)).length; if (lost) { viol++; pen += 600 + 200 * lost; sol._tfwhy.add('lost'); } }
      // الرئيسية المفصّلة (الغرفة دون حمامها) لا تصغر عن غرفة نوم أخرى في أي دور (غير كبار السن)
      const beds = [...gr, ...ur].filter(r => r.type === 'master' || (r.type === 'bedroom' && !/كبار السن|الضيوف/.test(r.name))), m = beds.find(r => r.type === 'master');
      const netA = r => (W_(r) - WALL_NET) * (H_(r) - WALL_NET);
      // (الجولة العاشرة) الطعام المفصّل لا يتضخم (≤ 23 م²) ما لم يحدد العميل مقاسه
      for (const dn of gr.filter(r => r.type === 'dining')) if (!G.dining.some(b => b.fixedArea) && netA(dn) > DIN_MAX_AREA + .2) { viol++; pen += 600 + 100 * (netA(dn) - DIN_MAX_AREA); sol._tfwhy.add('din-big'); }
      if (m) { const big = Math.max(0, ...beds.filter(r => r !== m).map(netA)); if (big > netA(m) + .1) { viol++; pen += 600 + 100 * (big - netA(m)); sol._tfwhy.add('master-smaller-real'); } }
      // (الجولة الثامنة عشرة) حمام علوي فوق المجلس أو الطعام أو المدخل (تمديدات صرف فوق فراغ جاف حساس): جزاء متدرج لا مخالفة
      if (WET_DRY_W > 0 && !R14_OFF.has('r18wet')) { const dryG = gr.filter(r => ['majlis', 'dining', 'entrance'].includes(r.type)); for (const b of ur.filter(r => r.type === 'bath')) { const o = sum(dryG.map(q => ovl(b, q))); if (o > .3) { pen += WET_DRY_W * o; sol._tfwhy.add('wet-over-dry'); } } }
    } catch { st = null; }
    if (!st) st = rectStack(edgeLines(gR), edgeLines(uR, u.dh || []));
    if (st.run > 5.0) { viol++; pen += 600 + 300 * (st.run - 5.0); sol._tfwhy.add('stack'); } pen += 6 * st.free;
    // الأجنحة العلوية فوق فراغات رطبة أرضية (تراكب التمديدات) أفضل
    const wetG = sol.placed.filter(p => ['kitchen', 'wc', 'maid'].includes(p.block.kind) || (p.block.kind === 'suite' && p.block.bath) || (p.block.kind === 'majlis' && p.block.guestWc)).map(p => p.r);
    for (const p of u.placed) if (p.block.kind === 'suite' && p.block.bath && wetG.some(w => ovl(p.r, w) >= 2)) pen -= 8;
    const rg = rulePenalty(sol.placed, ruleCirc(sol.circ), ew, ed, rules, entry), ur = upperRules(u, ew, ed, rules, entry); u.stairSide = ur.side;
    // (الجولة الثانية عشرة) «الرئيسية بعيدة عن الدرج» شرط العميل: مخالفة متدرجة في البحث المشترك (كما يقيسها السجل: مركز الرئيسية عن
    // مركز الدرج المرسوم ≥ max(7، 0.4 من قطر المبنى) ولا تلامس) — كان جزاءً فقط فخرج بديل يخالفه
    if (rules.some(r => r.kind === 'far' && [r.a, r.b].includes('master') && [r.a, r.b].includes('stairs'))) {
      // على المفصّل إن وُجد (غرفة الرئيسية دون حمامها وملابسها، كما يقيسها السجل)، وإلا على الكتلة بهامش 1 م
      const stc = ruleCirc(u.circ, u.stairSide).find(c => c.id === 'stair'), mR = u._masterRoom || u.placed.find(p => p.block.master)?.r, margin = u._masterRoom ? .1 : 1.0;
      if (mR && stc) { const need = Math.max(7, .4 * Math.hypot(ew + EXT, ed + EXT)) + margin, d = Math.hypot((mR.x0 + mR.x1 - stc.r.x0 - stc.r.x1) / 2, (mR.y0 + mR.y1 - stc.r.y0 - stc.r.y1) / 2);
        if (d < need || touch(mR, stc.r) > .3) { viol++; pen += 600 + 300 * Math.max(.2, need - d); sol._tfwhy.add('far-stair'); } }
      delete u._masterRoom;
    }
    pen += RULE_K * (rg.base + Math.min(...rg.p) + ur.pen) + (tr.need ? tr.need({ ...sol, ew, ed }) : 0);
    sol.viol = viol; sol.stack = st;
    return pen;
  };
  let best = null;
  for (const b of optimizeSteps(tr.tree, site, evalFn, { iters: globalThis.__v2iters || (U.suites.length >= 5 ? 2 * tr.iters : tr.iters), seed: 'tf' + tr.tag, tol: tr.tol })) best = b;
  if (globalThis.__v2dbg) { const d = globalThis.__v2dbg; if (best) { const v0 = best.sol.viol, v1 = best.sol.up?.viol; const o = {}; globalThis.__v2dbg = o; scoreV2(best.sol, G, best.ew, best.ed, ctxG); const o2 = {}; globalThis.__v2dbg = o2; if (best.sol.up) scoreV2(best.sol.up, { ...U, men: null, women: [] }, best.ew, best.ed, { upper: true }); globalThis.__v2dbg = d; best.sol.viol = v0; if (best.sol.up) best.sol.up.viol = v1; d['tfj:' + tr.mode + ':' + tr.tag] = `viol ${best.sol.viol} T[${[...(best.sol._tfwhy || [])]}] G[${Object.keys(o)}] U[${Object.keys(o2)}] st=${r2(best.sol.stack?.run || 0)} env ${r2(best.ew)}x${r2(best.ed)}`; if (d.keepSol) d['tfsol:' + tr.mode + ':' + tr.tag] = { g: best.sol, u: best.sol.up, ew: best.ew, ed: best.ed }; } else d['tfj:' + tr.mode + ':' + tr.tag] = 'none'; }
  if (!best || best.sol.viol) return null;
  const rp = rulePenalty(best.sol.placed, ruleCirc(best.sol.circ), best.ew, best.ed, rules, entry);
  const g = { mode: tr.mode, tag: tr.tag, tree: tr.tree, stepped: false, sol: best.sol, ew: best.ew, ed: best.ed, pen: best.p, rp };
  return { g, up: { mode: 'upper', tag: 'u' + tr.org, org: tr.org, sol: best.sol.up, ew: best.ew, ed: best.ed, pen: best.p } };
}

export default { generateVillaDesigns, generateVillaTwoFloors, programV2, partiTrees, scoreV2, realizeV2, drawPlanV2, siteOf, difference, roomsDifference, hardGates, VILLA_V2_ENGINE_VERSION };
if (globalThis.__v2expose) Object.assign(globalThis.__v2expose, { minExt, solve, areaOf }); // تشخيص فقط (لا أثر بدون الخطاف)
