// مكتبة المساقط المرجعية: كل مرجع هيكل بنيوي مختلف (شكل الكتلة، موضع الفناء، موضع المدخل والسلم والخدمات، ترتيب الأجنحة)
// وليس تحجيمًا لمخطط واحد. المراجع مستنبطة من قواعد عامة في العمارة السكنية السعودية (انظر docs/villa-reference-research.md)
// ومبنية أصلية: لا نسخ لمخطط منشور. حدود المقاسات افتراضات تصميمية من الميزان.
import { X, Y } from './villa-ref-core.mjs';
import { Z } from './villa-ref-engine.mjs';
import { hallLeaf, foyerLeaf, stairLeaf, courtLeaf } from './villa-ref-units.mjs';

const core = (c, o = {}) => ({ foyer: foyerLeaf(c.P, o), hall: hallLeaf(c.P, { narrow: c.narrow }), stair: c.floors === 2 ? stairLeaf() : null });
/** عمود القلب: مدخل ثم صالة ثم (سلم) ثم ما يلحق بها. stair: 'back' خلف الصالة | 'side' بجانبها. */
const spineCol = (c, k, after = [], stair = 'back') => {
  if (!k.stair) return Y(k.foyer, k.hall, ...after);
  if (stair === 'side') return Y(k.foyer, X(k.hall, k.stair), ...after);
  if (stair === 'front') return Y(X(k.foyer, k.stair), k.hall, ...after);
  return Y(k.foyer, k.hall, ...after, k.stair);
};

/**
 * المراجع. كل مرجع: id، name، shape، floors (عدد الأدوار المدعوم)، min/max (أدنى أعراض الأرض المناسبة م، اختياري)، variants (خيارات بنيوية)،
 * build(c) → { tree, zones, core } حيث c = { P, floors, narrow, v } (v = الخيار).
 * ملاحظة التسمية: x عرض الواجهة، y من الواجهة إلى الخلف. الأجنحة: wl يسار، wr يمين.
 */
export const REFERENCES = [
  {
    id: 'spine-rect', name: 'صالة وسطى بجناحين وممرين', shape: 'rect', floors: [1, 2],
    summary: 'عمود وسطي (مدخل ثم صالة ثم سلم) بين جناحين بممرين داخليين؛ الضيافة في جناح والنوم في الجناح المقابل.',
    variants: [{ stair: 'back' }, { stair: 'side' }],
    build(c) {
      const k = core(c), v = c.v;
      const wl = Z('wl', { axis: 'y', corr: 'x1', front: true, pref: ['guest', 'svc'] }), wr = Z('wr', { axis: 'y', corr: 'x0', front: true, pref: ['bed'] });
      const zc = Z('zc', { axis: 'y', pad: false, pref: ['svc', 'guest'], opt: true, empty: 'yard', cap: 1 });
      return { tree: X(wl, spineCol(c, k, [zc], v.stair), wr), zones: [wl, wr, zc], k };
    },
  },
  {
    id: 'spine-U', name: 'بيت U حول فناء خلفي', shape: 'U', floors: [1, 2],
    summary: 'جناحان طويلان على جانبي فناء مكشوف في الخلف، تلتقي ممراتهما عند الصالة؛ الغرف كلها تطل على الفناء أو الخارج.',
    variants: [{ stair: 'back' }, { stair: 'side' }],
    build(c) {
      const k = core(c), v = c.v;
      const wl = Z('wl', { axis: 'y', corr: 'x1', front: true, pref: ['guest', 'svc'] }), wr = Z('wr', { axis: 'y', corr: 'x0', front: true, pref: ['bed'] });
      const court = courtLeaf('court', [3.8, 6.2, 16], [4.5, 7, 16], { name: 'الحديقة الداخلية', fenceH: 2.4 });
      return { tree: X(wl, spineCol(c, k, [court], v.stair), wr), zones: [wl, wr], k };
    },
  },
  {
    id: 'spine-atrium', name: 'بيت بفناء مغلق خلف الصالة', shape: 'atrium', floors: [1, 2],
    summary: 'فناء مسوّر في قلب البيت خلف الصالة، تحيط به الممرات والغرف الخلفية؛ إنارة وتهوية من الفناء دون تعريض الغرف للجار.',
    variants: [{ stair: 'back' }, { stair: 'side' }],
    build(c) {
      const k = core(c), v = c.v;
      const wl = Z('wl', { axis: 'y', corr: 'x1', front: true, pref: ['guest', 'svc'] }), wr = Z('wr', { axis: 'y', corr: 'x0', front: true, pref: ['bed', 'svc'] });
      const zc = Z('zc', { axis: 'y', pad: false, pref: ['bed', 'guest'], cap: 1 });
      const court = courtLeaf('court', [3.6, 5.2, 12], [3.6, 5.2, 12], { name: 'فناء داخلي', fenceH: null });
      return { tree: X(wl, spineCol(c, k, [court, zc], v.stair), wr), zones: [wl, wr, zc], k };
    },
  },
  {
    id: 'spine-T', name: 'كتلة T: واجهة عريضة وجناح نوم خلفي', shape: 'T', floors: [1, 2],
    summary: 'شريط ضيافة وخدمة عريض في الواجهة، ويمتد منه جناح نوم خلفي ضيق تتوسطه الصالة؛ ساحتان خارجيتان على جانبيه.',
    variants: [{ stair: 'front' }, { stair: 'side' }],
    build(c) {
      const k = core(c), v = c.v;
      const fl = Z('fl', { axis: 'y', front: true, pref: ['guest'], cap: 3 }), fr = Z('fr', { axis: 'y', front: true, pref: ['guest', 'svc'], cap: 3 });
      const stem = Z('stem', { axis: 'y', corr: 'x0', pref: ['bed'] });
      const yl = courtLeaf('yardL', [2.6, 4.5, 14], [3, 5, 16], { name: 'ساحة خلفية', fenceH: 1.8, trees: false, court: false });
      const yr = courtLeaf('yardR', [2.6, 4.5, 14], [3, 5, 16], { name: 'ساحة خلفية', fenceH: 1.8, trees: false, court: false });
      return { tree: X(Y(fl, yl), spineCol(c, k, [stem], v.stair), Y(fr, yr)), zones: [fl, fr, stem], k };
    },
  },
  {
    id: 'spine-L', name: 'شكل L بساحة جانبية', shape: 'L', floors: [1, 2],
    summary: 'جناح نوم طويل على جانب واحد، والضيافة والخدمة في الجناح المقابل القصير، وساحة خارجية في الزاوية الخلفية.',
    variants: [{ stair: 'back' }, { stair: 'side' }],
    build(c) {
      const k = core(c), v = c.v;
      const beds = Z('wl', { axis: 'y', corr: 'x1', front: true, pref: ['bed'], cap: 5 });
      const fr = Z('fr', { axis: 'y', front: true, pref: ['guest', 'svc'], cap: 4 });
      const yard = courtLeaf('yard', [3, 5, 16], [3.5, 6, 18], { name: 'ساحة خارجية', fenceH: 1.8, trees: true, court: false });
      const tail = courtLeaf('court', [3.4, 4.6, 9], [2.6, 4.2, 12], { name: 'فناء داخلي', fenceH: null });
      return { tree: X(beds, spineCol(c, k, [tail], v.stair), Y(fr, yard)), zones: [beds, fr], k };
    },
  },
  {
    id: 'rows-T', name: 'ضيافة أمامية وصالة وسطى وصف نوم خلفي', shape: 'rect', floors: [1, 2],
    summary: 'عمودان للضيافة والخدمة على جانبي المدخل والصالة في المقدمة، وخلفهما صف غرف نوم على ممر عرضي يلتقي بالصالة والفناء.',
    variants: [{ stair: 'front', corr: true }, { stair: 'side', corr: false }],
    build(c) {
      const k = core(c), v = c.v;
      const gl = Z('gl', { axis: 'y', front: true, pref: ['guest'], cap: 3, corr: v.corr ? 'x1' : null }), gr = Z('gr', { axis: 'y', front: true, pref: ['guest', 'svc', 'bed'], cap: 3, corr: v.corr ? 'x0' : null });
      const back = Z('back', { axis: 'x', corr: 'y0', pref: ['bed'], cap: 3 });
      const atrium = courtLeaf('court', [3.4, 4.6, 9], [2.6, 4.2, 12], { name: 'فناء داخلي', fenceH: null });
      return { tree: Y(X(gl, spineCol(c, k, [atrium], v.stair), gr), back), zones: [gl, gr, back], k };
    },
  },
  {
    id: 'front-court-U', name: 'فناء أمامي تحيط به الأجنحة', shape: 'U-front', floors: [1, 2],
    summary: 'جناحان يمتدان نحو الواجهة ويحيطان بفناء أمامي يُدخل منه إلى المدخل؛ البيت خلف الفناء بخصوصية أعلى من الشارع.',
    variants: [{ stair: 'front' }, { stair: 'side' }],
    build(c) {
      const k = core(c), v = c.v;
      const wl = Z('wl', { axis: 'y', corr: 'x1', front: true, pref: ['guest', 'svc'] }), wr = Z('wr', { axis: 'y', corr: 'x0', front: true, pref: ['bed'] });
      const court = courtLeaf('courtF', [3.8, 6, 12], [4.5, 6.5, 10], { name: 'الفناء الأمامي', fenceH: 2.2 });
      const zc = Z('zc', { axis: 'y', pad: false, pref: ['svc', 'guest'], opt: true, empty: 'yard', cap: 1 });
      return { tree: X(wl, Y(court, spineCol(c, k, [zc], v.stair)), wr), zones: [wl, wr, zc], k, entryVia: 'courtF' };
    },
  },
  {
    id: 'side-court', name: 'كتلتان يفصلهما فناء جانبي', shape: 'two-block', floors: [1, 2],
    summary: 'كتلة الضيافة (الرجال) بمدخلها المستقل على جانب، وكتلة العائلة على الجانب الآخر، يفصلهما فناء طولي يمنحهما الإنارة والخصوصية.',
    variants: [{ stair: 'front' }, { stair: 'side' }],
    build(c) {
      const k = core(c), v = c.v;
      const men = Z('men', { axis: 'y', front: true, pref: ['guest', 'svc'], cap: 3 });
      const fl = Z('fl', { axis: 'y', corr: 'x1', front: true, pref: ['bed', 'guest'], cap: 4 });
      const fb = Z('fb', { axis: 'x', pref: ['bed'], cap: 3 });
      const court = courtLeaf('court', [3.4, 5, 10], [6, 10, 40], { name: 'فناء جانبي', fenceH: null });
      const tail = courtLeaf('court2', [3.0, 4.2, 9], [2.6, 4, 12], { name: 'فناء داخلي', fenceH: null });
      return { tree: X(men, court, Y(X(fl, spineCol(c, k, [tail], v.stair)), fb)), zones: [men, fl, fb], k };
    },
  },
  {
    id: 'narrow-side', name: 'بيت للأرض الضيقة بممر جانبي', shape: 'bar', floors: [1, 2], narrowOnly: true,
    summary: 'عمود غرف بممر طولي ملاصق لعمود المدخل والصالة؛ المجلس بمدخل جانبي وتتدرج الغرف خلفه.',
    variants: [{ stair: 'back' }, { stair: 'front' }],
    build(c) {
      const k = core(c), v = c.v;
      const rooms = Z('rooms', { axis: 'y', corr: 'x1', front: true, pref: [], cap: 10 });
      const zc = Z('zc', { axis: 'y', pad: false, pref: ['svc', 'guest'], opt: true, empty: 'yard', cap: 1 });
      return { tree: X(rooms, spineCol(c, k, [zc], v.stair)), zones: [rooms, zc], k };
    },
  },
];

/** هل يصلح المرجع لهذه الأرض والبرنامج مبدئيًا (قبل التكييف)؟ */
export function eligible(ref, { floors, W, D, narrow, nBeds }) {
  if (!ref.floors.includes(floors)) return false;
  if (ref.narrowOnly && !narrow) return false;
  if (!ref.narrowOnly && narrow && !ref.allowNarrow) return W >= 8.6;
  return true;
}
