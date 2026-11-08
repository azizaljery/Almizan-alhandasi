// مكتبة قوالب الطراز النجدي. كل p اختيارات منفصلة مستقلة (انظر شرح المفاتيح في najdi.mjs وdoc.mjs) فيصح أي دمج مفتاحًا بمفتاح.
// مفاتيح الواجهة: pal(0-5) trim(0-2) finish(0-2) wood(0-2) paint(0-4) leaf(0-2) merlon(0-3) mH/mPitch/mGap(0-2) cap(0-1) crown(0-5) spouts(0-2)
//   frieze(0-3) slab(0-4) corner(0-2) strips(0-2) plinth(0-3) stone(0-1) win(0-4) door(0-5) grille(0-4) lamps(0-1) field(0-3) rows(0-2) ornament(0-3)
// مفاتيح المستند: owin(0-5 نظام النوافذ) epos(0-4 موضع المدخل) etyp(0-3 نوعه) e2(0-1 مدخل ثانٍ) bay(0-3 كتلة/ارتداد/أجنحة) wt(0-2 سماكة) flr(0-3 الأدوار)
const D = { pal: 0, trim: 0, finish: 1, wood: 0, paint: 0, leaf: 2, merlon: 0, mH: 1, mPitch: 1, mGap: 1, cap: 0, crown: 0, spouts: 0, frieze: 2, slab: 1, corner: 0, strips: 0, plinth: 1, stone: 1, win: 0, door: 0, grille: 0, lamps: 1, field: 0, rows: 0, ornament: 2,
  owin: 0, epos: 0, etyp: 0, e2: 0, bay: 0, wt: 0, flr: 0 };
const mk = (id, ar, note, o) => ({ id, ar, note, p: { ...D, ...o } });
export const templates = [
  mk('N01', 'حصن الدروة المثلثة', 'جدار سميك بكوّات عالية صغيرة، شرفات مثلثة عالية فوق شريط مثلثات مقلوبة، قاعدة حجرية وباب بتاج مثلثي', { owin: 1, epos: 2, etyp: 2, wt: 2, flr: 2, crown: 0, mH: 2, frieze: 0, slab: 2, plinth: 2, stone: 1, door: 2, leaf: 0, field: 3, rows: 1, ornament: 3, spouts: 1, pal: 0, trim: 1 }),
  mk('N02', 'الكتلة الصامتة', 'كتلة طينية صماء بلا زخرفة: أغطية مسطحة وفتحات كوّات وجدار سميك', { owin: 1, epos: 1, etyp: 1, wt: 2, flr: 1, crown: 4, frieze: 3, slab: 0, win: 3, door: 0, leaf: 2, field: 0, plinth: 0, ornament: 0, pal: 3, trim: 1, finish: 0 }),
  mk('N03', 'بيت البرج الأمامي', 'كتلة مدخل بارزة إلى الأمام بين جناحين، دروة مزدوجة وأكتاف رأسية', { owin: 2, epos: 1, etyp: 2, bay: 1, wt: 1, flr: 2, crown: 3, merlon: 1, mH: 2, strips: 1, corner: 1, frieze: 1, slab: 1, plinth: 2, win: 2, door: 1, leaf: 1, field: 1, ornament: 2, spouts: 1, pal: 1 }),
  mk('N04', 'القلعة ذات الجناحين', 'جناحان بارزان وفناء مدخل غائر، جدران سميكة وأركان مائلة وميازيب كثيفة', { owin: 3, epos: 1, etyp: 3, bay: 3, wt: 2, flr: 3, crown: 1, spouts: 2, corner: 2, plinth: 3, win: 4, grille: 4, door: 4, leaf: 1, frieze: 2, slab: 4, field: 0, ornament: 0, pal: 2, trim: 2 }),
  mk('N05', 'مجلس الضيافة العريض', 'نوافذ مجلس عريضة وبابان (رئيسي وضيوف) وبوابة سميكة ومشبّك معين', { owin: 4, epos: 3, etyp: 2, e2: 1, wt: 1, flr: 2, crown: 3, merlon: 3, frieze: 1, slab: 2, strips: 0, plinth: 1, win: 4, grille: 1, door: 4, leaf: 0, paint: 1, field: 2, ornament: 3, rows: 2, pal: 5, trim: 1 }),
  mk('N06', 'الأطراف المتعرجة', 'دروة متعرجة غير منتظمة، نهايات جذوع بارزة في البلاطات، مدخل قرب الزاوية', { owin: 2, epos: 4, etyp: 1, wt: 2, flr: 2, crown: 2, spouts: 1, frieze: 3, slab: 3, corner: 1, plinth: 1, stone: 0, win: 1, grille: 2, door: 3, leaf: 2, field: 0, ornament: 1, pal: 4, trim: 2, finish: 2 }),
  mk('N07', 'الرواق المظلل', 'مدخل غائر في رواق مظلل بمظلة جذوع نخل، كورنيش مدرّج وأكتاف كثيفة', { owin: 3, epos: 1, etyp: 2, bay: 2, wt: 1, flr: 2, crown: 5, strips: 2, slab: 0, frieze: 2, win: 0, grille: 1, door: 5, leaf: 0, field: 0, plinth: 2, ornament: 1, pal: 0, trim: 0 }),
  mk('N08', 'الدروة الذهبية', 'يحتفظ بمسقط الواجهة ويُغني الزخرفة: شرفات مثلثة صغيرة متقاربة وكوّات مرصوصة وباب أحمر', { owin: 2, crown: 3, mH: 0, mPitch: 0, frieze: 0, slab: 1, strips: 1, corner: 1, door: 2, leaf: 0, paint: 2, win: 2, field: 1, rows: 2, ornament: 3, pal: 1, trim: 1, plinth: 2 }),
  mk('N09', 'القرية الطينية', 'طين خشن بقاعدة حجرية عالية وأركان مائلة ونوافذ عارية بمصاريع خشبية', { owin: 1, epos: 2, etyp: 1, e2: 1, wt: 2, flr: 1, crown: 2, finish: 2, spouts: 2, plinth: 3, slab: 3, win: 3, grille: 4, door: 3, leaf: 2, corner: 2, field: 0, ornament: 0, pal: 4, trim: 2, wood: 2 }),
  mk('N10', 'الخلوة العالية', 'كتلة مدخل بارزة بنوافذ شريطية عالية وبروز حاد للبلاطات', { owin: 5, epos: 1, etyp: 1, bay: 1, wt: 2, flr: 3, crown: 0, merlon: 1, frieze: 1, slab: 4, plinth: 1, win: 4, grille: 3, door: 0, leaf: 1, paint: 3, field: 2, ornament: 2, pal: 3, trim: 1 }),
  mk('N11', 'الواجهة المؤطرة', 'دروة مصمتة عالية وأكتاف كثيفة وأركان مؤطرة، مدخل يميني وباب أزرق', { owin: 5, epos: 3, etyp: 2, wt: 1, flr: 2, crown: 1, frieze: 1, slab: 2, strips: 2, corner: 1, plinth: 0, win: 2, grille: 2, door: 1, leaf: 1, paint: 3, field: 3, rows: 1, ornament: 2, pal: 5, trim: 0 }),
  mk('N12', 'النجدي الناعم', 'قراءة معاصرة ناعمة: لياسة ملساء ونوافذ عريضة وغطاء منخفض وألواح غائرة', { owin: 4, epos: 1, etyp: 3, wt: 0, flr: 2, crown: 4, frieze: 2, slab: 1, plinth: 1, stone: 0, win: 0, grille: 0, door: 0, leaf: 2, paint: 4, lamps: 0, field: 2, ornament: 0, pal: 3, trim: 1, finish: 0 }),
  mk('N13', 'برج الزاوية', 'كتلة مدخل بارزة بأركان مائلة متدرجة ودروة مدرّجة عالية وكوّات مرصوصة', { owin: 1, epos: 2, etyp: 2, bay: 1, wt: 2, flr: 3, crown: 3, merlon: 3, mH: 1, mPitch: 1, corner: 2, frieze: 0, slab: 1, plinth: 2, win: 1, grille: 4, door: 2, leaf: 0, field: 1, rows: 2, ornament: 3, spouts: 1, pal: 2, trim: 0 }),
  mk('N14', 'ساحة النخيل', 'رواق غائر بمظلة جذوع ونهايات جذوع في البلاطات وميازيب متقاربة', { owin: 2, epos: 1, etyp: 2, e2: 1, bay: 0, wt: 1, flr: 1, crown: 0, merlon: 2, mH: 0, mGap: 2, spouts: 2, slab: 3, strips: 1, frieze: 3, plinth: 1, win: 1, grille: 3, door: 5, leaf: 0, field: 0, ornament: 1, pal: 0, trim: 2 }),
  mk('N15', 'الدروة الثقيلة', 'شرفات مدرّجة ثقيلة متلاصقة وشريط أسنان وباب خشبي مسمّر قرب الزاوية', { owin: 4, epos: 4, etyp: 3, wt: 2, flr: 2, crown: 0, merlon: 1, mH: 2, mPitch: 2, mGap: 0, cap: 1, frieze: 1, slab: 2, corner: 1, plinth: 2, win: 0, grille: 0, door: 3, leaf: 1, field: 3, ornament: 2, pal: 1, trim: 1 }),
  mk('N16', 'الواجهة الغنية', 'أقصى زخرفة منضبطة: بوابة سميكة ونوافذ زوجية ضيقة ومشبّك معين وكوّات رأسية', { owin: 3, epos: 1, etyp: 3, wt: 1, flr: 2, crown: 3, frieze: 0, slab: 2, strips: 2, corner: 1, plinth: 2, win: 0, grille: 1, door: 4, leaf: 0, field: 1, rows: 2, ornament: 3, spouts: 1, pal: 0, trim: 1 }),
];
// ── بدائل محور القوالب (2026-11-08): قالبان إضافيان مشتقان من قالبين قائمين؛ لكل منهما «ما الذي يختلف» في المدخل وإيقاع النوافذ وتوزيع الخامات.
//    القيم كلها من تعدادات الطراز نفسه (فيصح الدمج والتطفير)؛ لا يُدّعى لها مرجع معماري خارجي.
const variant = (id, ar, base, differs, o) => { const b = templates.find(t => t.id === base); return { id, ar, note: differs.entrance + '؛ ' + differs.windows + '؛ ' + differs.materials, variantOf: base, differs, p: { ...b.p, ...o } }; };
templates.push(
  variant('N17', 'مجلس الضيافة بين الجناحين', 'N05', {
    entrance: 'المدخل الرئيسي في الوسط بين جناحين بارزين (كتلة الأجنحة) مع إبقاء باب الضيوف الثاني، بدل الواجهة المستوية في N05',
    windows: 'نظام نوافذ الأجنحة (نظام 3 كما في N04) بدل نوافذ المجلس العريضة',
    materials: 'كورنيش مدرّج (كما في N07) بدل الشرفات، وقاعدة حجرية عالية (كما في N09) تحت لياسة N05' },
    { bay: 3, epos: 1, owin: 3, crown: 5, plinth: 3 }),
  variant('N18', 'النجدي الناعم بمدخل غائر', 'N12', {
    entrance: 'مدخل غائر 1.3 م في وسط الواجهة ببوابة سميكة (كما في N05) بدل الباب المسطح في N12',
    windows: 'نوافذ شريطية عالية (نظام 5 كما في N10/N11) بدل النوافذ العريضة',
    materials: 'لياسة طينية خشنة (كما في N06) فوق قاعدة حجرية ظاهرة، بدل اللياسة الملساء' },
    { bay: 2, epos: 1, etyp: 2, door: 4, owin: 5, finish: 2, stone: 1, plinth: 2 }),
);
