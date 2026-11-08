// نمط سلماني (S): إعادة تفسير معاصرة مهذّبة للجذر النجدي، مبنية على السمات الموثّقة فقط (انظر meta.sources و meta.verified/unverified).
// المحقَّق (مصادر ثانوية متقاطعة، لا نصًا رسميًا للميثاق): لوحة ترابية رملية/بيج/ثقيلة غير لامعة؛ حجر جيري محلي بملمس خشن؛ فتحات غائرة عميقة (ظل وتجويف)؛
// أكاليل مثلثية على الأطراف وفوق المدخل فقط (وليس على امتداد الواجهة) بمقياس 30–50 سم وبُعد قمة-قمة = ضعف القاعدة؛ كتل مدرّجة أفقية؛
// حجب/تظليل مُثقَّب (مشربية هندسية) بدل الزجاج الكامل؛ زخرفة مقتصدة؛ أفنية مظلّلة (خارج نطاق الواجهة).
// بدون tpl: ممنوع تحريك جدار أو فتحة أو منسوب، وبروز الإضافات 15–25 سم. مع tpl: docTransform يغيّر مسقط الواجهة الأمامية (فتحات/مدخل/كتل/أدوار)، والبروز ≤ 750 مم. لا أصول خارجية: كل الخامات Canvas إجرائية.
import { resolveTemplate } from '../templates.mjs';
import { facadeGeometry } from '../../facade-styles.mjs';
export const meta = {
  id: 'S', ar: 'سلماني',
  sources: [
    { t: 'سعوديبيديا: العمارة السلمانية', u: 'https://saudipedia.com/article/6088', note: 'تعريف عام: نمط عمراني الرياض مستلهم من التراث؛ لا تفاصيل واجهة' },
    { t: 'المدينة: العمارة السلمانية الأصالة والحداثة', u: 'https://www.al-madina.com/article/1006593', note: 'القيم الست وعدم نسخ الأشكال؛ التظليل والخصوصية والخامات المحلية' },
    { t: 'MDPI Buildings 15(24):4531 Socio-Cultural Sustainability in Contemporary Saudi Architecture', u: 'https://www.mdpi.com/2075-5309/15/24/4531', note: 'كتل مكعبة مبنية بالحجر، تمفصل رأسي، شرفات (شرفات نجدية) مزخرفة، تظليل رمزي، لبن/لياسة' },
    { t: 'Heyazah: Riyadh New Architectural Identity (Salmani vs Contemporary Najdi)', u: 'https://heyazah.com/en/articles/riyadh-architectural-identity-salmani-style', note: 'مقالة ثانوية: بيج/رملي/بني رمادي، كتل مدرّجة، أكاليل مثلثية 30–50 سم عند الأطراف والمداخل، فتحات عميقة، زجاج محدود' },
    { t: 'عقارماب: العمارة السلمانية في السعودية', u: 'https://blog.aqarmap.sa/ar/salmani-architecture-saudi-arabia/', note: 'نوافذ عميقة، مشربيات/فتحات مزخرفة، أقواس مداخل، زخرفة متزنة، حجر وطين' },
    { t: 'Business Today ME: Salmani design guidelines', u: 'https://businesstoday.me/design/what-specific-design-guidelines-define-the-salmani-architecture-movement/', note: 'ثانوي: حجر جيري كثيف خشن، لوحة أوكر/بيج رملي/تيراكوتا مطفأة، فتحات غائرة، حجب مشربية، منع زجاج عاكس' },
  ],
  verified: ['لوحة ترابية رملية مطفأة', 'حجر جيري خشن غير لامع', 'فتحات غائرة عميقة', 'أكاليل مثلثية عند الأطراف والمدخل فقط (مصدر ثانوي واحد للأرقام)', 'كتل مدرّجة', 'حجب مُثقَّب بنمط هندسي', 'زخرفة مقتصدة'],
  unverified: ['قاعدة حجرية (سوكل) داكنة', 'أحزمة مداميك عند البلاطات', 'فواصل/قواعد المدخل وشكل البوابة', 'فوانيس الجدار', 'لون البرونز للإطارات', 'قيم النسب الدقيقة (عرض التجويف، ارتفاع الأبراج)'],
};

const CLASSIC = new Set(['projection', 'surround', 'cornice', 'sill', 'pediment']);
const SIDES = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const mulb = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const texOf = (THREE, renderer, c, srgb, rep) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
function noise2(seed) { const P = new Float32Array(512 * 512), r = mulb(seed); for (let i = 0; i < P.length; i++) P[i] = r();
  const h = (x, y) => P[((y & 511) << 9) | (x & 511)], f = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), u = f(x - X), v = f(y - Y); return h(X, Y) * (1 - u) * (1 - v) + h(X + 1, Y) * u * (1 - v) + h(X, Y + 1) * (1 - u) * v + h(X + 1, Y + 1) * u * v; };
  return (x, y, oct = 4) => { let s = 0, a = .5, k = 1, t = 0; for (let o = 0; o < oct; o++) { s += a * n(x * k + o * 17.3, y * k - o * 9.1); t += a; a *= .5; k *= 2.03; } return s / t; }; }

// لوحات ترابية (أساس الحجر، حجر العناصر المميزة، البرونز). مصدر الألوان: وصف «بيج ترابي، رمل فاتح، بني حمامي» (ثانوي)؛ القيم الدقيقة قرار تصميمي.
const PALETTES = [
  { name: 'رمل', base: [236, 216, 182], accent: [212, 186, 148], joint: '#a89270', bronze: '#4a3b2c', wood: '#5a3d28' },
  { name: 'بيج فاتح', base: [240, 228, 204], accent: [218, 200, 168], joint: '#b0a085', bronze: '#3f372f', wood: '#6a4a33' },
  { name: 'أوكر حجري', base: [226, 198, 152], accent: [198, 164, 118], joint: '#9a8059', bronze: '#3b2e22', wood: '#4f3322' },
  { name: 'بني حمامي', base: [214, 198, 178], accent: [184, 164, 142], joint: '#8e7e69', bronze: '#392f29', wood: '#4a3425' },
];

/** حجر جيري رملي: القماش 2.4×1.2 م (4×4 بلاطات 60×30 مع إزاحة نصف بلاطة للمدماك الفردي، كما في blockGrid). joints=true يرسم فواصل 1 سم للعناصر المضافة. */
function stoneMat(THREE, renderer, pal, { joints = false, tone = 1, seed = 3, name = 'sandstone-S' } = {}) {
  const PX = 512, W = PX * 2.4 | 0, H = PX * 1.2 | 0, [c, x] = cnv(W, H), [bc, bx] = cnv(W, H), N = noise2(seed), N2 = noise2(seed + 41), r = mulb(seed * 7 + 1);
  const img = x.createImageData(W, H), bim = bx.createImageData(W, H), d = img.data, bd = bim.data, tones = [];
  for (let i = 0; i < 64; i++) tones.push({ k: 1 + (r() - .5) * .09, w: (r() - .5) * 9, g: (r() - .5) * .03 });
  for (let py = 0; py < H; py++) { const yv = (H - 1 - py) / PX, row = Math.floor(yv / .3), off = (row & 1) * .3, ry = yv - row * .3;
    for (let px = 0; px < W; px++) { const xu = px / PX, xo = ((xu - off) % 2.4 + 2.4) % 2.4, col = Math.floor(xo / .6), rx = xo - col * .6, b = tones[(row & 3) * 4 + (col & 3)];
      const X = xu * 1.0, Y = yv * 1.0;
      const cloud = N(X * 1.3, Y * 1.3, 4), grain = N2(X * 38, Y * 38, 2), mid = N(X * 9 + 3, Y * 9, 3), bed = N2(X * 1.2, Y * 26, 3);
      let k = b.k * tone * (.95 + (cloud - .5) * .11 + (mid - .5) * .07 + (grain - .5) * .075 + (bed - .5) * .06);
      // فاصل (مدماك) مرسوم فقط للعناصر المضافة
      let jn = 0; if (joints) { const e = Math.min(rx, .6 - rx, ry, .3 - ry); if (e < .005) jn = 1 - e / .005; }
      k *= 1 - jn * .22;
      const i = (py * W + px) * 4, B = pal.base;
      d[i] = Math.min(255, B[0] * k + b.w); d[i + 1] = Math.min(255, B[1] * k + b.w * .8); d[i + 2] = Math.min(255, B[2] * k * (1 - jn * .02) + b.w * .5); d[i + 3] = 255;
      const bump = 150 + (grain - .5) * 110 + (mid - .5) * 70 - jn * 90; bd[i] = bd[i + 1] = bd[i + 2] = Math.max(0, Math.min(255, bump)); bd[i + 3] = 255; } }
  x.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  // نقر دقيقة (مسامات الحجر)
  for (let k = 0; k < 2600; k++) { const px = r() * W, py = r() * H, s = .6 + r() * 1.6; x.fillStyle = `rgba(70,52,34,${.10 + r() * .16})`; x.beginPath(); x.ellipse(px, py, s, s * (.6 + r() * .6), r() * 3, 0, 6.3); x.fill();
    bx.fillStyle = 'rgba(0,0,0,.35)'; bx.beginPath(); bx.ellipse(px, py, s, s * .8, 0, 0, 6.3); bx.fill(); }
  const rep = [1 / 2.4, 1 / 1.2], map = texOf(THREE, renderer, c, true, rep), bump = texOf(THREE, renderer, bc, false, rep);
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: .9, roughness: .96, metalness: 0, envMapIntensity: .35 }); m.name = name; return m; }

/** حجب مُثقَّب بمثلثات (alphaMap): صفوف مثلثات متبادلة (قمة لأعلى/لأسفل)، أبعاد الخلية بالمتر على الخريطة المكررة. */
function screenAlpha(THREE, renderer, motif) { const [c, x] = cnv(256, 256); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#000';
  const tri = (cx, cy, w, h, up) => { x.beginPath(); if (up) { x.moveTo(cx - w / 2, cy + h / 2); x.lineTo(cx + w / 2, cy + h / 2); x.lineTo(cx, cy - h / 2); } else { x.moveTo(cx - w / 2, cy - h / 2); x.lineTo(cx + w / 2, cy - h / 2); x.lineTo(cx, cy + h / 2); } x.closePath(); x.fill(); };
  if (motif === 0) { for (const [cx, cy, up] of [[64, 64, 1], [192, 64, 0], [64, 192, 0], [192, 192, 1]]) tri(cx, cy, 78, 78, up); }
  else { for (const [cx, cy] of [[64, 64], [192, 192]]) { tri(cx, cy - 22, 64, 44, 1); tri(cx, cy + 22, 64, 44, 0); } // معين من مثلثين متقابلين
    for (const [cx, cy] of [[192, 64], [64, 192]]) { x.fillRect(cx - 10, cy - 10, 20, 20); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function aoTexture(THREE) { const [c, x] = cnv(4, 128), g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, '#fff'); g.addColorStop(.25, '#8a8a8a'); g.addColorStop(.6, '#262626'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); }

function bandLevels() { const L = globalThis.__FLOORS?.levels; if (!Array.isArray(L) || !L.length) return [3.55];
  return L.map(l => typeof l === 'number' ? l : l.top ?? ((l.elevation ?? 0) + (l.height ?? 3.2) + .35)).filter(Number.isFinite).sort((a, b) => a - b); }


// ───────────────────────── مكتبة القوالب (S01..S18) ─────────────────────────
// مفاتيح p اختيارات منفصلة متعامدة. مفاتيح المسقط (يحوّلها docTransform): floors, entryPos, entryKind, winSize, winRhythm, massing, thick.
// مفاتيح الواجهة (يقرؤها apply): pal, layer, tower, rise, tsym, crown, tri, triPat, center, parapet, cap, frame, group, sill, hood, pilaster, band, plinth, entrance, lantern, screen, motif.
export const ENUM = Object.freeze({
  floors: [1, 2, 3], entryPos: ['وسط', 'ثلث أيسر', 'ثلث أيمن', 'طرف أيسر', 'طرف أيمن'], entryKind: ['باب مزدوج 1.4', 'باب مفرد 1.1 عريض', 'باب كبير 1.8', 'باب ضيق طويل 1.2'],
  winSize: ['شقّ ضيق عميق', 'قياسي', 'عريض', 'طويل', 'خليج زجاجي كبير', 'شق طولي رشيق'], acscreen: ['بلا', 'دروة متدرجة بارتفاعين 1.8/1.2 م لحجب التكييف'], scrWood: ['مشربية برونزية', 'مشربية خشب طبيعي'], winRhythm: ['منتظم مفرد', 'أزواج', 'ثلاثيات', 'شريط متصل', 'متباعد قليل'],
  massing: ['مستوٍ', 'كتلة مدخل بارزة', 'رواق غائر', 'جناح بارز', 'كتلة وسطى بارزة', 'خليج جانبي بارز', 'تدرّج ثلاثي', 'جناحان متقدمان وفناء غائر'], thick: ['كما المسقط', 'سميك', 'سميك جدًا'],
  pal: ['رمل', 'بيج فاتح', 'أوكر حجري', 'بني حمامي'], layer: ['حجر + بياض متدرج', 'بياض كامل + حلي حجرية', 'حلي داكنة', 'حلي جيرية فاتحة'],
  tower: ['بلا أبراج', 'أبراج نحيلة', 'أبراج متوسطة', 'أبراج عريضة'], rise: ['منخفض', 'متوسط', 'مرتفع'], tsym: ['متماثل', 'ثقل يسار', 'ثقل يمين', 'عريضان'],
  crown: ['مستقيم', 'درجتان', 'هرم ثلاث درجات', 'عمودان توأم'], tri: ['بلا مثلثات', '30 سم', '40 سم', '50 سم'], triPat: ['منتظم', 'متبادل', 'تركيز وسطي'], center: ['بلا', 'فوق المدخل', 'وسط الواجهة'],
  parapet: ['دروة عادية', 'دروة مرتفعة', 'دروة بحشوات غائرة'], cap: ['غطاء رفيع', 'غطاء سميك', 'غطاء مدرّج'], frame: ['إطار قياسي', 'إطار ثقيل عميق', 'عتبة وجلسة فقط', 'لوحة حجرية خلف الإطار', 'تجويف مظلل'],
  group: ['فتحات منفصلة', 'تجميع متوسط', 'تجميع واسع'], sill: ['بلا جلسة', 'جلسة بارزة'], hood: ['بلا', 'حاجب لكل نافذة', 'شريط تظليل متصل'], pilaster: ['بلا', 'زوايا', 'بين الفتحات', 'زوايا وبين الفتحات'],
  band: ['بلا', 'حزام عريض', 'حزام مزدوج رفيع', 'حزام بارز عميق', 'خطّان متباعدان'], plinth: ['بلا', 'قاعدة منخفضة', 'قاعدة عالية', 'قاعدة مدرّجة'],
  entrance: ['ركيزتان وعتبة', 'ركيزتان وعتبة خشبية', 'ركيزتان وغطاء', 'رواق عميق بمظلة', 'مدخل مقوّس', 'بوابة برجية مدرّجة'], lantern: ['بلا', 'فانوسان', 'فانوسان عاليان'], screen: ['بلا', 'مشربية يسار', 'مشربية يمين', 'مشربيتان'], motif: ['مثلثات', 'معينات', 'شقوق مربعة'],
});
const K = (floors, entryPos, entryKind, winSize, winRhythm, massing, thick, pal, layer, tower, rise, tsym, crown, tri, triPat, center, parapet, cap, frame, group, sill, hood, pilaster, band, plinth, entrance, lantern, screen, motif, acscreen = 0, scrWood = 0) =>
  ({ floors, entryPos, entryKind, winSize, winRhythm, massing, thick, pal, layer, tower, rise, tsym, crown, tri, triPat, center, parapet, cap, frame, group, sill, hood, pilaster, band, plinth, entrance, lantern, screen, motif, acscreen, scrWood });
//          fl eP eK wS wR ms th | pl ly tw rs ts cr tr tP ce pa cp fr gr sl hd pi bn pn en ln sc mo
export const templates = [
  { id: 'S01', ar: 'الكتلة المدرّجة', note: 'كتلة مدخل بارزة بين برجين طرفيين مدرّجين وأكاليل مثلثية متبادلة', p: K(2, 0, 0, 1, 0, 1, 1, 0, 0, 2, 1, 0, 1, 2, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0) },
  { id: 'S02', ar: 'الرواق الغائر', note: 'مدخل في رواق غائر مظلل بين جدارين صماوين ثقيلين وفتحات ضيقة عميقة', p: K(2, 0, 2, 0, 4, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 1, 1, 4, 2, 2, 2, 0, 1) },
  { id: 'S03', ar: 'الحزام الأفقي المحجوب', note: 'دور واحد ممتد بشريط نوافذ متصل تحت حاجب حجري متصل ودروة بحشوات', p: K(1, 1, 1, 2, 3, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 2, 1, 3, 2, 0, 2, 0, 0, 3, 1, 0, 2, 2) },
  { id: 'S04', ar: 'الزجاج المحجوب', note: 'خلجان زجاجية كبيرة بين زعانف رأسية حجرية وحاجب عميق ودروة مرتفعة بلا زخرفة', p: K(2, 2, 0, 4, 3, 0, 0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 4, 2, 0, 2, 3, 0, 1, 0, 0, 0, 0) },
  { id: 'S05', ar: 'الكتلة الوسطى البارزة', note: 'كتلة وسطى بارزة بعمل هرمي ثلاثي وجناحان منخفضان بنوافذ مزدوجة', p: K(2, 0, 2, 1, 0, 7, 1, 0, 2, 3, 2, 3, 2, 3, 2, 2, 0, 2, 1, 1, 1, 0, 1, 2, 2, 2, 1, 0, 0) },
  { id: 'S06', ar: 'البرج الجانبي', note: 'ثلاثة أدوار بخليج جانبي بارز وعمودين توأمين عند الطرف ومدخل جانبي', p: K(3, 4, 3, 3, 0, 5, 1, 2, 0, 3, 2, 1, 3, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 2, 0, 1, 1, 1) },
  { id: 'S07', ar: 'المدخل المقوّس', note: 'مدخل بقوس مفصّص وتحيط به نوافذ طويلة في أزواج وإطارات عتبة فقط', p: K(2, 1, 0, 3, 1, 5, 1, 0, 0, 2, 1, 0, 1, 1, 0, 0, 0, 1, 2, 1, 1, 0, 0, 2, 1, 4, 1, 0, 2) },
  { id: 'S08', ar: 'الجدار الحجري الثقيل', note: 'جدار سميك صلب بفتحات صغيرة مجمّعة وقاعدة مدرّجة ومدخل بغطاء وفانوسين', p: K(1, 3, 1, 0, 2, 0, 2, 2, 0, 2, 2, 0, 2, 2, 2, 0, 2, 2, 4, 2, 0, 0, 0, 3, 3, 2, 1, 1, 1) },
  { id: 'S09', ar: 'البيت المنخفض الممتد', note: 'دور واحد بجناح بارز جانبي ودروة مرتفعة وبرجان نحيلان وبوابة بخشب غائر', p: K(1, 0, 0, 2, 0, 3, 0, 3, 0, 1, 0, 1, 0, 1, 0, 1, 1, 2, 0, 0, 1, 0, 0, 1, 1, 1, 1, 2, 0) },
  { id: 'S10', ar: 'واجهة المجلس', note: 'مدخل طرفي بمشربيتين جانبيتين وجناح بارز وأبراج عريضة غير متماثلة', p: K(2, 4, 0, 1, 2, 3, 1, 1, 2, 3, 1, 2, 1, 2, 2, 1, 0, 1, 0, 1, 1, 0, 2, 2, 1, 5, 2, 3, 1) },
  { id: 'S11', ar: 'الرواق المظلل', note: 'رواق عميق بمظلة حجرية وشريط تظليل متصل فوق الدور الأرضي وجدار مستوٍ', p: K(2, 0, 2, 2, 0, 0, 0, 3, 0, 2, 1, 0, 0, 2, 0, 1, 0, 1, 0, 0, 0, 2, 0, 3, 1, 3, 1, 0, 0) },
  { id: 'S12', ar: 'الأعمدة الرأسية', note: 'ثلاثة أدوار بدعامات رأسية عالية بين نوافذ طويلة ودروة بحشوات بلا أبراج', p: K(3, 0, 3, 3, 0, 0, 1, 1, 3, 0, 0, 0, 3, 0, 0, 0, 2, 1, 2, 0, 0, 0, 3, 0, 1, 1, 1, 0, 0) },
  { id: 'S13', ar: 'الحزام الأبيض المزدوج', note: 'حلي جيرية فاتحة على جسم رملي: حزامان رفيعان وكتلة مدخل ونوافذ مجمّعة ثلاثية', p: K(2, 2, 1, 1, 2, 1, 0, 0, 3, 2, 1, 1, 1, 2, 1, 1, 0, 0, 3, 2, 1, 1, 0, 2, 1, 1, 1, 2, 2) },
  { id: 'S14', ar: 'البوابة البرجية', note: 'بوابة برجية مدرّجة بارزة تعلو الواجهة بثلاثة أدوار وجناحان هادئان', p: K(3, 0, 2, 1, 4, 1, 2, 3, 2, 2, 2, 0, 2, 2, 2, 1, 0, 2, 1, 0, 1, 0, 3, 1, 2, 5, 2, 1, 1) },
  { id: 'S15', ar: 'الواجهة الرسمية المتماثلة', note: 'تماثل صارم: نوافذ أزواج ودعامات بين الخلجان وأبراج متساوية وأكاليل منتظمة', p: K(2, 0, 0, 1, 1, 0, 0, 1, 0, 2, 1, 0, 0, 2, 0, 0, 2, 0, 0, 1, 1, 1, 3, 1, 1, 1, 1, 0, 0) },
  { id: 'S16', ar: 'التدرج الجانبي', note: 'ثقل غير متماثل: جناح بارز يسارًا ومدخل يمينًا وبرج واحد عريض وأكاليل بتركيز وسطي', p: K(2, 2, 3, 2, 4, 3, 1, 3, 0, 3, 2, 1, 1, 3, 2, 0, 1, 1, 1, 0, 0, 0, 1, 4, 3, 4, 2, 2, 2) },
  { id: 'S17', ar: 'الجدار المحمّل بالمشربيات', note: 'مشربيتان كبيرتان بزخرفة الشقوق المربعة وفتحات قليلة وكتلة مدخل ودروة مرتفعة', p: K(2, 0, 0, 0, 0, 4, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 2, 4, 0, 0, 1, 0, 2, 2, 2, 2, 3, 2) },
  { id: 'S18', ar: 'خليج المدخل الهادئ', note: 'مدخل بارز بين دعامتين مع بياض كامل وحلي حجرية، نوافذ طويلة وحاجب لكل نافذة', p: K(2, 0, 1, 3, 0, 6, 0, 2, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 2, 0, 1, 2, 1, 0, 0) },
  { id: 'S19', ar: 'السلماني البيئي: مدرجات وادي حنيفة', note: 'كتل متدرجة تتراجع كالمدرجات مع مشربيات خشبية طبيعية وحزام عميق وثلاثة أدوار ودروة متدرجة لحجب التكييف (ربط وادي حنيفة غير متحقق)', p: K(3, 2, 0, 1, 1, 8, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 3, 3, 2, 1, 3, 2, 1, 1) },
  { id: 'S20', ar: 'السلماني التجريدي بفتحات طولية رشيقة', note: 'شقوق طولية ضيقة مجمّعة ثلاثية وبياض كامل وإطارات لوحية ودروة بحشوات بلا مثلثات ولا أبراج ودروة متدرجة', p: K(2, 1, 3, 5, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2, 1, 3, 2, 0, 0, 3, 2, 1, 0, 1, 0, 2, 1, 0) },
];
// ── بدائل محور القوالب (2026-11-08): قالبان إضافيان مشتقان من قالبين قائمين؛ لكل منهما «ما الذي يختلف» في المدخل وإيقاع النوافذ وتوزيع الخامات.
//    القيم كلها من تعدادات الطراز نفسه (فيصح الدمج والتطفير)؛ لا يُدّعى لها مرجع معماري خارجي.
const variantS = (id, ar, base, differs, o) => { const b = templates.find(t => t.id === base); return { id, ar, note: differs.entrance + '؛ ' + differs.windows + '؛ ' + differs.materials, variantOf: base, differs, p: { ...b.p, ...o } }; };
templates.push(
  variantS('S21', 'الفناء الأمامي بين جناحين', 'S11', {
    entrance: 'جناحان متقدمان يحتضنان فناءً غائرًا وباب كبير 1.8 م في عمقه، بدل الرواق المظلل على جدار مستوٍ في S11',
    windows: 'نوافذ طويلة بدل العريضة، وتبقى الشريط المظلل المتصل فوق الدور الأرضي',
    materials: 'حلي جيرية فاتحة على الجسم، مشربيتان على الجناحين وأبراج نحيلة عند الأطراف' },
    { massing: 7, entryKind: 2, winSize: 3, layer: 3, screen: 3, tower: 1 }),
  variantS('S22', 'الجدار الثقيل بالشقوق الرشيقة', 'S08', {
    entrance: 'دوران ومدخل في الثلث الأيسر بباب ضيق طويل 1.2 م، بدل الدور الواحد والمدخل الطرفي في S08',
    windows: 'شقوق طولية رشيقة بتجميع متوسط بدل الفتحات الصغيرة المجمّعة',
    materials: 'بياض كامل مع حلي حجرية ولوحة حجرية خلف إطار كل شق، وزخرفة معينات بدل المثلثات' },
    { floors: 2, entryPos: 1, entryKind: 3, winSize: 5, group: 1, frame: 3, layer: 1, motif: 1 }),
);
meta.templateCount = templates.length;

// ───────────────────────── تحويل المسقط (واجهة أمامية جنوبية: أصغر y) ─────────────────────────
const ENT = [[1.4, 2.3, 'door2'], [1.1, 2.2, 'door'], [1.8, 2.5, 'door2'], [1.2, 2.6, 'door2']];
const WIN = [[.7, 1.5, 1.1], [1.2, 1.4, .9], [1.6, 1.6, .8], [1.2, 2.2, .45], [2.0, 2.4, .25], [.55, 2.0, .5]];
const EPOS = [.5, .3, .7, .14, .86];
const r2 = v => Math.round(v * 100) / 100;
const deep = o => JSON.parse(JSON.stringify(o));

/** يحدد جدار الواجهة الأمامية (الجنوبي الأمامي) الأفقي: يعيد {ids, xa, xb, Y0, level, t} أو null. */
function findFront(doc) {
  let g; try { g = facadeGeometry(doc); } catch { return null; }
  const P = (g.sides.s.pieces || []).filter(p => p.li === 0); if (!P.length) return null;
  const minD = Math.min(...P.map(p => p.depth)), front = P.filter(p => Math.abs(p.depth - minD) < .03);
  const byId = new Map(doc.walls.map(w => [w.id, w])), ids = [...new Set(front.flatMap(p => p.wallIds))].filter(id => { const w = byId.get(id); return w && Math.abs(w.a.y - w.b.y) < 1e-6 && Math.abs(w.a.y - minD) < .03; });
  if (!ids.length) return null;
  const ws = ids.map(id => byId.get(id)), xs = ws.flatMap(w => [w.a.x, w.b.x]);
  return { ids, xa: Math.min(...xs), xb: Math.max(...xs), Y0: ws[0].a.y, level: ws[0].level, t: Math.max(...ws.map(w => w.t || .2)) };
}
/** مقاطع الواجهة [{u0,u1,off}] (off>0 للأمام/الخارج، <0 للداخل) حسب نوع الكتلة. */
function massingSegs(W, ms, ec, ew, ent) {
  const fw = ms === 1 ? Math.max(3.4, ew + 2.4) : ms === 2 ? Math.max(2.8, ew + 1.4) : 0;
  let cuts = [];
  if (ms === 1) cuts = [[ec - fw / 2, ec + fw / 2, .9]];
  else if (ms === 2) cuts = [[ec - fw / 2, ec + fw / 2, -1.1]];
  else if (ms === 3) cuts = ec > W / 2 ? [[0, W * .32, .9]] : [[W * .68, W, .9]];
  else if (ms === 4) cuts = [[W * .24, W * .76, .7]];
  else if (ms === 8) cuts = [[0, W * .3, 1.4], [W * .3, W * .62, .8]];
  else if (ms === 6) cuts = [[0, W * .34, .5], [W * .34, W * .67, 1.0]];
  else if (ms === 7) cuts = [[0, W * .27, .8], [W * .73, W, .8]];
  else if (ms === 5) cuts = ec > W / 2 ? [[W * .08, W * .08 + 2.6, .6]] : [[W * .92 - 2.6, W * .92, .6]];
  const pts = [0, W]; for (const [a, b] of cuts) pts.push(Math.max(0, a), Math.min(W, b)); const xs = [...new Set(pts.map(r2))].sort((a, b) => a - b), segs = [];
  for (let i = 0; i < xs.length - 1; i++) { const m = (xs[i] + xs[i + 1]) / 2, c = cuts.find(c => m > c[0] && m < c[1]); segs.push({ u0: xs[i], u1: xs[i + 1], off: c ? c[2] : 0 }); }
  const out = []; for (const s of segs) { const l = out[out.length - 1]; if (l && l.off === s.off) l.u1 = s.u1; else out.push({ ...s }); } return out;
}
function layoutFront(W, p) {
  const [ew, eh, ekind] = ENT[p.entryKind % 4], [ww0, wh, wsill] = WIN[p.winSize % 6], rhythm = p.winRhythm % 5;
  const ec0 = Math.min(W - ew / 2 - 2.0, Math.max(ew / 2 + 2.0, EPOS[p.entryPos % 5] * W));
  let segs = massingSegs(W, p.massing, ec0, ew), ec = ec0;
  let es = segs.find(s => ec >= s.u0 + ew / 2 + .6 && ec <= s.u1 - ew / 2 - .6);
  if (!es) { es = segs.slice().sort((a, b) => (b.u1 - b.u0) - (a.u1 - a.u0))[0]; ec = (es.u0 + es.u1) / 2; }
  const wins = [], gap = .32;
  for (const s of segs) {
    let zones = [[s.u0 + .6, s.u1 - .6]];
    if (s === es) { const pl = 1.0 + (p.screen === 1 || p.screen === 3 ? 1.8 : 0), pr = 1.0 + (p.screen === 2 || p.screen === 3 ? 1.8 : 0); zones = [[s.u0 + .6, ec - ew / 2 - pl], [ec + ew / 2 + pr, s.u1 - .6]]; }
    for (const [z0, z1] of zones) {
      const Zw = z1 - z0; if (Zw < .75) continue;
      let ww = ww0, k = rhythm === 1 ? 2 : rhythm === 2 ? 3 : 1;
      while (ww > .6 && ww + .3 > Zw) ww = r2(ww - .2);
      if (rhythm === 3) { const m = Math.max(1, Math.floor((Zw + gap) / (ww + gap))); k = m; }
      else while (k > 1 && k * ww + (k - 1) * gap > Zw - .1) k--;
      const bw = k * ww + (k - 1) * gap; if (bw > Zw + .001) continue;
      let nb = rhythm === 3 ? 1 : Math.max(1, Math.floor((Zw + .9) / (bw + .9))); if (rhythm === 4) nb = 1;
      const free = Zw - nb * bw, g = free / (nb + 1);
      for (let b = 0; b < nb; b++) for (let i = 0; i < k; i++) wins.push({ c: r2(z0 + g * (b + 1) + bw * b + ww / 2 + i * (ww + gap)), w: ww, h: wh, sill: wsill, kind: ww >= 1.8 ? 'window2' : 'window', seg: s });
    }
  }
  return { segs, entry: { c: r2(ec), w: ew, h: eh, kind: ekind, seg: es }, wins };
}
/** يعيد نسخة جديدة من المستند بعد تطبيق القالب (مسقط الواجهة الأمامية: فتحات، مدخل، كتل، سماكة، أدوار). */
export function docTransform(doc, q) {
  const T = resolveTemplate(templates, q); if (!T) return doc; const p = T.p, d = deep(doc); if (p.acscreen) d.roof = { ...(d.roof || {}), parapet: 1.2 };
  if (p.floors) q.set('floors', String(Math.max(1, Math.min(3, p.floors)))); q.set('setback', '0');
  const F = findFront(d); if (!F) return d;
  const W = r2(F.xb - F.xa), L = layoutFront(W, p);
  const lim = d.plot?.polygon?.length ? Math.min(...d.plot.polygon.map(v => v.y)) + (d.plot.setbacks?.s ?? 0) : -Infinity;
  const maxFwd = Math.max(0, F.Y0 - lim - .05); for (const s of L.segs) if (s.off > maxFwd) s.off = r2(maxFwd);
  const tN = p.thick === 2 ? .42 : p.thick === 1 ? .32 : 0, tt = tN ? Math.max(F.t, tN) : F.t;
  const segId = i => i === 0 ? F.ids[0] : F.ids[0] + 's' + i, ys = L.segs.map(s => r2(F.Y0 - s.off));
  const oldWalls = d.walls, keep = oldWalls.filter(w => !F.ids.includes(w.id)), news = [];
  L.segs.forEach((s, i) => news.push({ id: segId(i), level: F.level, a: { x: r2(F.xa + s.u0), y: ys[i] }, b: { x: r2(F.xa + s.u1), y: ys[i] }, t: tt, h: null, kind: 'wall' }));
  for (let i = 1; i < L.segs.length; i++) if (Math.abs(ys[i] - ys[i - 1]) > 1e-6) news.push({ id: F.ids[0] + 'r' + i, level: F.level, a: { x: r2(F.xa + L.segs[i].u0), y: ys[i - 1] }, b: { x: r2(F.xa + L.segs[i].u0), y: ys[i] }, t: tt, h: null, kind: 'wall' });
  const yAt = x => { const u = x - F.xa; let k = L.segs.findIndex(s => u >= s.u0 - .02 && u <= s.u1 + .02); if (k < 0) k = 0; return ys[k]; };
  for (const w of keep) for (const e of [w.a, w.b]) if (Math.abs(e.y - F.Y0) < .02 && e.x >= F.xa - .02 && e.x <= F.xb + .02) e.y = yAt(e.x);
  d.walls = [...keep, ...news];
  d.openings = (d.openings || []).filter(o => !F.ids.includes(o.wall));
  const segIdx = s => L.segs.indexOf(s);
  let n = 1; const mk = (o, kind, w, h, sill, c, entry) => d.openings.push({ id: 'T' + (n++), level: F.level, wall: segId(segIdx(o)), kind, at: r2(F.xa + c - (F.xa + L.segs[segIdx(o)].u0)), w, h, sill, swing: entry ? 'in' : null, hinge: 'left', entry: !!entry });
  mk(L.entry.seg, L.entry.kind, L.entry.w, L.entry.h, 0, L.entry.c, true);
  for (const w of L.wins) mk(w.seg, w.kind, w.w, w.h, w.sill, w.c, false);
  d.counters = { ...(d.counters || {}), walls: d.walls.length, openings: d.openings.length };
  return d;
}
/** تحقق ذاتي من سلامة المستند الناتج (واجهة أمامية). يعيد {ok, errors}. */
export function validateDoc(doc, q) {
  const err = [], W = new Map(doc.walls.map(w => [w.id, w])), fl = Number(q?.get?.('floors') || 1);
  if (!(fl >= 1 && fl <= 3)) err.push('floors خارج 1..3');
  const F = findFront(doc); if (!F) { err.push('لا جدار أمامي'); return { ok: false, errors: err }; }
  const base = F.ids[0].replace(/[sr]\d+$/, ''), chain = doc.walls.filter(w => w.id === base || w.id.startsWith(base + 's') || w.id.startsWith(base + 'r'));
  const hz = chain.filter(w => Math.abs(w.a.y - w.b.y) < 1e-6).sort((a, b) => a.a.x - b.a.x);
  for (let i = 1; i < hz.length; i++) { const A = hz[i - 1], B = hz[i]; if (Math.abs(A.b.x - B.a.x) > .02) err.push('فجوة بين مقطعين'); if (Math.abs(A.b.y - B.a.y) > 1e-6 && !chain.some(r => Math.abs(r.a.x - r.b.x) < 1e-6 && Math.abs(r.a.x - A.b.x) < .02 && Math.min(r.a.y, r.b.y) <= Math.min(A.b.y, B.a.y) + .02 && Math.max(r.a.y, r.b.y) >= Math.max(A.b.y, B.a.y) - .02)) err.push('مقطعان متباعدان بلا جدار وصل'); }
  const chIds = new Set(chain.map(w => w.id)), os = doc.openings.filter(o => chIds.has(o.wall));
  for (const o of os) { const w = W.get(o.wall); if (!w) { err.push('جدار مفقود ' + o.id); continue; } const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (o.at - o.w / 2 < .2 - 1e-6 || o.at + o.w / 2 > len - .2 + 1e-6) err.push(`${o.id} خارج هامش 20 سم`); if (o.h + o.sill > 3.1) err.push(o.id + ' يتجاوز الارتفاع'); }
  for (const w of chIds) { const a = os.filter(o => o.wall === w).sort((x, y) => x.at - y.at); for (let i = 1; i < a.length; i++) if (a[i].at - a[i].w / 2 < a[i - 1].at + a[i - 1].w / 2 + .05) err.push('تقاطع فتحتين ' + a[i - 1].id + '/' + a[i].id); }
  const en = os.filter(o => o.entry && o.sill === 0 && /^door/.test(o.kind)); if (!en.length) err.push('لا باب رئيسي أمامي');
  for (const w of doc.walls) if (Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) < .05) err.push('جدار صفري ' + w.id);
  return { ok: !err.length, errors: err };
}

/** حجب مُثقَّب: النمط 2 شقوق مربعة رأسية. (يُستعمل بدل screenAlpha القديمة عند motif=2) */
function screenAlpha2(THREE) { const [c, x] = cnv(256, 256); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#000';
  for (const cx of [32, 96, 160, 224]) for (const [cy, h] of [[56, 76], [184, 76]]) x.fillRect(cx - 14, cy - h / 2, 28, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

/** يبني المتغيرات الفعّالة E: من القالب إن وُجد، وإلا من العشوائية القديمة (السلوك القديم لا يتغير). */
function effective(tp, R, reg, q) {
  const E = {};
  if (!tp) {
    const palI = Math.floor(R(31) * PALETTES.length); E.palI = q.get('pal') != null ? (+q.get('pal') | 0) % PALETTES.length : palI; E.seedP = palI; E.layer = 0;
    E.LIM = .20; E.PRJ = Math.max(.15, Math.min(E.LIM - .02, Number(q.get('proj') ?? [.15, .165, .18][reg.p ?? 1]))); E.RW = (.12 + R(32) * .06) + (reg.t === 1 ? .04 : reg.t === 0 ? -.01 : 0);
    E.frame = 0; E.thr = reg.r === 1 ? 1.1 : reg.r === 2 ? 2.4 : 0; E.sillOn = R(45) > .4 || reg.t === 1; E.hood = 0; E.pilaster = 0; E.parapet = 0; E.cap = 0;
    E.entrance = Math.floor(R(35) * 3); E.pw0 = .24 + R(46) * .06 + (reg.t === 0 ? .1 : 0); E.hhX = .22 + (E.entrance === 1 ? .08 : 0) + (reg.t === 0 ? .1 : 0); E.lantern = 1;
    E.band = R(39) > .5 ? 2 : 1; E.plinth = R(41) > .12 ? 1 : 0; E.plinthH = .38 + R(40) * .22;
    E.screenAny = R(36) > .12; const left = R(37) > .5; E.scrL = E.screenAny && left; E.scrR = E.screenAny && !left; E.motif = R(38) > .5 ? 1 : 0;
    const crownStyle = reg.c ?? 0; E.tierShape = crownStyle === 1 ? 1 : 0; E.triPat = crownStyle; E.triOn = true;
    E.crownBase = .30 + R(48) * .14; E.crownH = Math.min(.5, E.crownBase * (1.0 + R(49) * .25));
    E.towerOn = true; E.tw = 1.0 + R(42) * .55; E.tsc = reg.t === 2 ? 1.2 : 1; E.e = reg.e; E.rise0 = (.32 + R(43) * .24) * (crownStyle === 2 ? 1.35 : crownStyle === 0 ? .8 : 1) * (reg.t === 2 ? 1.2 : 1);
    E.entryPier = reg.t === 0 || reg.e === 0 ? R(44) > .1 : R(44) > .5; E.centerFallback = true; E.centerAny = false;
    E.second = false; E.tpl = false; return E;
  }
  const p = tp; E.palI = p.pal % PALETTES.length; E.seedP = E.palI; E.layer = p.layer; E.tpl = true;
  E.LIM = .20; const fr = p.frame; E.PRJ = [.17, .19, .17, .17, .15][fr]; E.RW = [.15, .15, .15, .15, .13][fr] * (fr === 1 ? 1.3 : 1) + (p.winSize === 4 ? .03 : 0); E.frame = fr; E.thr = [0, 1.1, 2.4][p.group]; if (p.winRhythm >= 1 && p.winRhythm <= 3 && E.thr < 1.1) E.thr = 1.1;
  E.sillOn = !!p.sill; E.hood = p.hood; E.pilaster = p.pilaster; E.parapet = p.parapet; E.cap = p.cap;
  E.entrance = p.entrance; E.pw0 = .27; E.hhX = .22 + (p.entrance === 1 ? .08 : 0) + (p.entrance === 5 ? .1 : 0); E.lantern = p.lantern;
  E.band = p.band; E.plinth = p.plinth; E.plinthH = [0, .45, .9, .6][p.plinth];
  E.screenAny = p.screen > 0; E.scrL = p.screen === 1 || p.screen === 3; E.scrR = p.screen === 2 || p.screen === 3; E.motif = p.motif;
  E.tierShape = p.crown; E.triPat = p.triPat; E.triOn = p.tri > 0; E.crownBase = [.34, .30, .40, .50][p.tri]; E.crownH = Math.min(.5, E.crownBase * 1.12);
  E.towerOn = p.tower > 0; E.tw = [1, .95, 1.25, 1.65][p.tower]; E.tsc = 1; E.e = p.tsym; E.rise0 = [.30, .42, .56][p.rise] * (p.crown === 2 ? 1.3 : 1);
  E.entryPier = p.center === 1; E.centerFallback = false; E.centerAny = p.center === 2; E.second = false; return E;
}

export async function apply(THREE, { scene, renderer, S, q, doc, FI, params }) {
  const R = params?.rnd || (k => { const r = mulb(1234 + k * 977); return r(); });
  const night = q.get('night') === '1';
  const reg = params?.region || { e: Math.floor(R(50) * 4), r: Math.floor(R(51) * 3), t: Math.floor(R(52) * 3), p: Math.floor(R(53) * 3), c: Math.floor(R(34) * 3) }, bld = params?.building || {};
  const TPL = resolveTemplate(templates, q), E = effective(TPL?.p, R, reg, q), pal0 = PALETTES[E.palI];
  let pal = pal0; if (E.layer === 2) pal = { ...pal0, accent: pal0.accent.map(v => v * .8) }; else if (E.layer === 3) pal = { ...pal0, accent: [246, 240, 226] };
  const LIM = E.LIM, PRJ = E.PRJ, RW = E.RW, palI = E.seedP, motif = E.motif;
  for (const m of S.meshes) if (CLASSIC.has(m.userData?.role)) m.visible = false;
  const stone = stoneMat(THREE, renderer, pal0, { seed: 3 + palI }), stoneJ = stoneMat(THREE, renderer, pal0, { joints: true, seed: 3 + palI, name: 'sandstone-joint-S' });
  const accent = stoneMat(THREE, renderer, { ...pal, base: pal.accent }, { joints: true, tone: .96, seed: 9 + palI, name: 'sandstone-accent-S' });
  const bronze = new THREE.MeshStandardMaterial({ color: pal.bronze, metalness: .55, roughness: .45 }); bronze.name = 'bronzeS';
  const darkWood = new THREE.MeshStandardMaterial({ color: pal.wood, roughness: .7 });
  const backing = new THREE.MeshStandardMaterial({ color: '#15100c', roughness: 1, envMapIntensity: .1 });
  const warm = new THREE.MeshStandardMaterial({ color: '#fff2d8', emissive: '#ffd79a', emissiveIntensity: night ? 5 : 1.6 });
  const renderMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...pal0.base.map((v, i) => v / 255 * (E.layer === 1 ? [.97, .91, .80][i] : .93))), roughness: 1 });
  const jointMat = new THREE.MeshStandardMaterial({ color: pal.joint, roughness: .95 });
  const alphaT = motif === 2 ? screenAlpha2(THREE) : screenAlpha(THREE, renderer, motif); alphaT.repeat.set(1, 1);
  const screenMat = new THREE.MeshStandardMaterial({ color: TPL?.p?.scrWood ? '#a8794a' : '#7b5236', metalness: TPL?.p?.scrWood ? 0 : .55, roughness: TPL?.p?.scrWood ? .85 : .5, alphaMap: alphaT, alphaTest: .5, side: THREE.DoubleSide });
  const bodyMat = E.layer === 1 ? renderMat : stone;
  for (const m of S.meshes) { const p = m.userData?.part; if (p === 'plate') m.material = jointMat; else if (p === 'blocks') m.material = bodyMat; else if (m.userData?.role === 'frame') m.material = bronze; else if (p === 'wallcore' || (m.userData?.role === 'wall' && p !== 'blocks' && /render|limestone/.test(m.material?.name || ''))) m.material = renderMat; }
  const AO = aoTexture(THREE), aoMat = a => new THREE.MeshBasicMaterial({ color: '#000', alphaMap: AO, transparent: true, opacity: a * (night ? .5 : 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const box = m => new THREE.Box3().setFromObject(m), levels = bandLevels(), up = new THREE.Vector3(0, 1, 0);
  const plan = {}; let south = null;
  const pilW = .34;
  for (const [side, [nx, nz]] of Object.entries(SIDES)) {
    const sm = S.meshes.filter(m => m.userData?.side === side && m.visible); if (!sm.length) continue;
    const n = new THREE.Vector3(nx, 0, nz), t = new THREE.Vector3().crossVectors(up, n), basis = new THREE.Matrix4().makeBasis(t, up, n);
    const loc = b => { const us = [b.min.x * t.x + b.min.z * t.z, b.max.x * t.x + b.max.z * t.z], ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z];
      return { u0: Math.min(...us), u1: Math.max(...us), y0: b.min.y, y1: b.max.y, d0: Math.min(...ds), d1: Math.max(...ds) }; };
    const place = (geo, mat, u, y, d, o = {}) => { geo.translate(u, y, d); const P = geo.attributes.position, Nn = geo.attributes.normal, UV = geo.attributes.uv, uo = o.uo ?? 0, vo = o.vo ?? 0;
      for (let i = 0; i < P.count; i++) { const ax = Math.abs(Nn.getX(i)), ay = Math.abs(Nn.getY(i)), az = Math.abs(Nn.getZ(i));
        if (az >= ax && az >= ay) UV.setXY(i, P.getX(i) - uo, P.getY(i) - vo); else if (ax >= ay) UV.setXY(i, P.getZ(i), P.getY(i) - vo); else UV.setXY(i, P.getX(i) - uo, P.getZ(i)); }
      geo.applyMatrix4(basis); const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = true; scene.add(m); return m; };
    const add = (su, sy, sd, mat, u, y, d, o) => place(new THREE.BoxGeometry(su, sy, sd), mat, u, y, d, o);
    const P3 = (u, y, d) => t.clone().multiplyScalar(u).addScaledVector(n, d).setY(y);
    const ao = (a, b, away, alpha) => { const A = P3(...a), B = P3(...b), w = new THREE.Vector3().addScaledVector(t, away[0]).addScaledVector(n, away[2]).setY(away[1]);
      const g = new THREE.BufferGeometry(), v = [A, B, B.clone().add(w), A.clone().add(w)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
      const o = new THREE.Mesh(g, aoMat(alpha)); o.renderOrder = 2; scene.add(o); };
    const walls = sm.filter(m => m.userData.role === 'wall' || m.userData.role === 'cladding').map(m => loc(box(m))); if (!walls.length) continue;
    const wd = Math.max(...walls.map(w => w.d1)), face = walls.filter(w => w.d1 > wd - .1);
    // مقاطع الوجه: القديم (وجه واحد أمامي) أو، مع القوالب على الجنوب، عدة مقاطع بأعماق مختلفة (كتل بارزة/غائرة)
    let segs;
    if (E.tpl && side === 's') { const ws = walls.filter(w => w.d1 > wd - 2.3).sort((a, b) => b.d1 - a.d1), groups = [];
      for (const w of ws) { const g = groups.find(g => Math.abs(g.d - w.d1) < .06); if (g) g.items.push(w); else groups.push({ d: w.d1, items: [w] }); }
      segs = []; for (const g of groups) { let cur = null; for (const w of g.items.sort((a, b) => a.u0 - b.u0)) { if (cur && w.u0 <= cur.u1 + .3) { cur.u1 = Math.max(cur.u1, w.u1); cur.top = Math.max(cur.top, w.y1); } else { cur = { u0: w.u0, u1: w.u1, wd: g.d, top: w.y1 }; segs.push(cur); } } }
      segs = segs.filter(s => s.u1 - s.u0 > .8).sort((a, b) => a.u0 - b.u0); // مقاطع مغطاة بالكامل بمقطع أمامي تُهمل
      segs = segs.filter(s => !segs.some(o => o !== s && o.wd > s.wd + .05 && o.u0 <= s.u0 + .05 && o.u1 >= s.u1 - .05));
      if (!segs.length) segs = null; }
    const X0f = Math.min(...face.map(w => w.u0)), X1f = Math.max(...face.map(w => w.u1)), topf = Math.max(...face.map(w => w.y1));
    if (!segs) segs = [{ u0: X0f, u1: X1f, wd, top: topf }];
    const X0 = Math.min(...segs.map(s => s.u0)), X1 = Math.max(...segs.map(s => s.u1)), top = Math.max(...segs.map(s => s.top));
    const segAt = u => segs.find(s => u >= s.u0 - .05 && u <= s.u1 + .05) || segs.reduce((b, s) => Math.abs((s.u0 + s.u1) / 2 - u) < Math.abs((b.u0 + b.u1) / 2 - u) ? s : b, segs[0]);
    const BH = .24, bands = levels.filter(y => y + BH < top - .05);
    const frames = sm.filter(m => m.userData.role === 'frame').map(m => ({ id: m.userData.opening, b: loc(box(m)) }));
    const fbox = (g) => (frames.find(f => f.id && f.id === g.m.userData.opening) || { b: g.b }).b;
    const gl = sm.filter(m => m.userData.role === 'glazing').map(m => ({ m, b: loc(box(m)) })), doors = sm.filter(m => m.userData.role === 'door').map(m => ({ m, b: loc(box(m)) }));
    const mains = frames.filter(f => f.b.d1 > wd - .3).map(f => f.b.d1 - wd).sort((a, b) => a - b), fo = mains.length ? mains[mains.length >> 1] : -.04;
    const spans = [], occ = [], lanterns = [];
    const WDmax = wd, wallFace = f => { const uc = (f.u0 + f.u1) / 2, yc = (f.y0 + f.y1) / 2, c = walls.filter(w => w.u0 - .02 <= uc && uc <= w.u1 + .02 && w.y0 - .02 <= yc && yc <= w.y1 + .02 && Math.abs(w.d1 - f.d1) < .4).map(w => w.d1); return c.length ? Math.max(...c) : f.d1 - fo; };
    // 1) إطارات الفتحات الحجرية
    const items = gl.map(g => { const f = fbox(g), wo = wallFace(f); return { f, wo, main: wo > WDmax - .3 }; }).sort((a, b) => a.f.u0 - b.f.u0);
    const thr = E.thr, groups = [];
    for (const it of items) { const g = groups[groups.length - 1]; const l = g && g[g.length - 1];
      if (thr && l && Math.abs(l.wo - it.wo) < .05 && it.f.u0 - l.f.u1 < thr && it.f.u0 > l.f.u1 && Math.abs(l.f.y0 - it.f.y0) < .35 && Math.abs(l.f.y1 - it.f.y1) < .35) g.push(it); else groups.push([it]); }
    for (const grp of groups) { const wo = grp[0].wo, main = grp[0].main, a = grp[0].f, z = grp[grp.length - 1].f, fw = Math.max(...grp.map(g => g.f.u1 - g.f.u0)), big = fw >= .85 || grp.length > 1,
        fk = big ? E.frame : 0, lim = fk === 1 ? .30 : LIM, rw = (big ? RW : .10), pr = Math.min(lim, big ? (fk === 1 ? PRJ + .08 : PRJ) : .12), th = big ? .06 : .04, gy0 = Math.min(...grp.map(g => g.f.y0)), gy1 = Math.max(...grp.map(g => g.f.y1));
      const x0 = a.u0 - rw, x1 = z.u1 + rw, y0 = gy0 - rw * .8, y1 = gy1 + rw, cx = (x0 + x1) / 2, mat = accent, dc = wo + pr / 2, hs = y1 - y0 - rw * .8 - rw - th, ym = (y0 + rw * .8 + y1 - rw - th) / 2;
      if (fk === 3) { const mx = .17, my = .15, ow = x1 - x0 + 2 * mx; add(ow, my, .035, stoneJ, cx, y1 + my / 2, wo + .0175, { uo: x0 - mx, vo: y1 }); add(ow, my, .035, stoneJ, cx, y0 - my / 2, wo + .0175, { uo: x0 - mx, vo: y0 - my });
        add(mx, y1 - y0, .035, stoneJ, x0 - mx / 2, (y0 + y1) / 2, wo + .0175, { uo: x0 - mx, vo: y0 }); add(mx, y1 - y0, .035, stoneJ, x1 + mx / 2, (y0 + y1) / 2, wo + .0175, { uo: x1, vo: y0 }); }
      add(x1 - x0, rw + th, pr, mat, cx, y1 - (rw + th) / 2, dc, { uo: x0, vo: y1 });
      add(x1 - x0, rw * .8, pr, mat, cx, y0 + rw * .4, dc, { uo: x0, vo: y0 });
      if (fk !== 2 && fk !== 4) { add(rw, hs, pr, mat, x0 + rw / 2, ym, dc, { uo: x0, vo: y0 }); add(rw, hs, pr, mat, x1 - rw / 2, ym, dc, { uo: x1, vo: y0 }); }
      for (let k = 1; k < grp.length; k++) { const ga = grp[k - 1].f.u1, gb = grp[k].f.u0; add(gb - ga, hs, pr, mat, (ga + gb) / 2, ym, dc, { uo: ga, vo: y0 }); }
      if (big && E.sillOn && gy0 > .5) add(x1 - x0 + .1, .05, Math.min(lim, pr + .02), accent, cx, y0 - .025, wo + Math.min(lim, pr + .02) / 2, { uo: x0, vo: y0 });
      if (E.hood === 1 && big && gy0 > .5) { add(x1 - x0 + .24, .07, .40, accent, cx, y1 + .035, wo + .20, { uo: x0, vo: y1 }); for (const sx of [x0 + .08, x1 - .08]) add(.14, .1, .3, accent, sx, y1 - .05, wo + .15, { uo: sx, vo: y1 }); }
      const e = wo + .003, W = fk === 4 ? .26 : .14, al = fk === 4 ? .6 : .4; ao([x0, y1 + .01, e], [x1, y1 + .01, e], [0, W * .6, 0], al * .5); ao([x0, y0, e], [x1, y0, e], [0, -W, 0], al); ao([x0, y0, e], [x0, y1, e], [-W, 0, 0], al * .8); ao([x1, y0, e], [x1, y1, e], [W, 0, 0], al * .8);
      occ.push([x0 - (fk === 3 ? .17 : 0), x1 + (fk === 3 ? .17 : 0)]); if (main) spans.push([x0, x1, y0, y1]); }
    // 2) بوابة المدخل
    let entry = null;
    for (const dr of doors) { const f = fbox(dr), wdr = wallFace(f); if (!E.tpl && wdr < WDmax - .3) continue; const w = f.u1 - f.u0, pw = E.pw0 * (E.entrance === 5 ? 1.3 : 1), hh = f.y1 + E.hhX, pp = E.entrance === 3 ? .6 : Math.min(LIM, PRJ + .03), x0 = f.u0 - pw, x1 = f.u1 + pw, cxd = (x0 + x1) / 2;
      if (E.entrance === 4) { // مدخل مقوّس: إطار حجري بقمة نصف إهليلجية وفتحة الباب ثقب
        const ys0 = f.y1 + .1, xr = (x1 - x0) / 2, yr = Math.max(.35, Math.min(xr, 3.4 - ys0)), sh = new THREE.Shape(); sh.moveTo(x0, 0); sh.lineTo(x1, 0); sh.lineTo(x1, ys0); sh.absellipse(cxd, ys0, xr, yr, 0, Math.PI, false); sh.lineTo(x0, 0);
        const hole = new THREE.Path(); hole.moveTo(f.u0, 0); hole.lineTo(f.u0, f.y1); hole.lineTo(f.u1, f.y1); hole.lineTo(f.u1, 0); hole.lineTo(f.u0, 0); sh.holes.push(hole);
        const g = new THREE.ExtrudeGeometry(sh, { depth: pp, bevelEnabled: false, curveSegments: 20 }), nn = g.toNonIndexed(); nn.computeVertexNormals(); place(nn, accent, 0, 0, wdr, { uo: x0, vo: 0 });
        add(w + .06, .09, pp - .08, darkWood, cxd, f.y1 - .045, wdr + (pp - .08) / 2 - .02, { cast: false }); }
      else {
        add(pw, hh, pp, accent, x0 + pw / 2, hh / 2, wdr + pp / 2, { uo: x0, vo: 0 }); add(pw, hh, pp, accent, x1 - pw / 2, hh / 2, wdr + pp / 2, { uo: x1, vo: 0 });
        add(x1 - x0 + .1, .24, pp, accent, cxd, f.y1 + .12 + .02, wdr + pp / 2, { uo: x0, vo: f.y1 });
        if (E.entrance === 1) add(w + .06, .09, pp - .08, darkWood, (f.u0 + f.u1) / 2, f.y1 - .045, wdr + (pp - .08) / 2 - .02, { cast: false });
        if (E.entrance === 2) add(x1 - x0 + .28, .06, pp, stoneJ, cxd, hh + .03, wdr + pp / 2, { uo: x0, vo: hh });
        if (E.entrance === 3) { add(x1 - x0 + .24, .16, pp, accent, cxd, hh + .08, wdr + pp / 2, { uo: x0, vo: hh }); add(x1 - x0 + .3, .05, pp + .04, stoneJ, cxd, hh + .185, wdr + (pp + .04) / 2, { uo: x0, vo: hh }); ao([x0 + pw, hh, wdr + .003], [x1 - pw, hh, wdr + .003], [0, -.3, 0], .35); }
        if (E.entrance === 5) { add(x1 - x0 + .14, .34, pp, accent, cxd, hh + .17, wdr + pp / 2, { uo: x0, vo: hh }); const nw = (x1 - x0) * .62; add(nw, .3, pp - .04, stoneJ, cxd, hh + .49, wdr + (pp - .04) / 2, { uo: cxd - nw / 2, vo: hh + .34 });
          add(nw + .08, .05, pp, accent, cxd, hh + .665, wdr + pp / 2, { uo: cxd - nw / 2, vo: hh + .64 }); } }
      const e = wdr + .003; ao([x0, hh, e], [x1, hh, e], [0, .14, 0], .22); ao([x0, 0, e], [x0, hh, e], [-.14, 0, 0], .3); ao([x1, 0, e], [x1, hh, e], [.14, 0, 0], .3);
      if (E.lantern) { const ly = E.lantern === 2 ? Math.min(hh - .2, 2.55) : 2.05; for (const sx of [x0 - .32, x1 + .32]) { add(.11, .24, .1, bronze, sx, ly, wdr + .05); add(.07, .15, .06, warm, sx, ly, wdr + .06, { cast: false }); lanterns.push([sx, ly]); } }
      spans.push([x0, x1, 0, hh]); occ.push([x0 - .1, x1 + .1]); entry = { f, x0, x1, hh, pp, wd: wdr, seg: segAt((x0 + x1) / 2) }; }
    const sideSegs = side === 's' ? segs : [segs[0]];
    for (const sg of sideSegs) {
      const SW = sg.wd, len = sg.u1 - sg.u0, cxs = (sg.u0 + sg.u1) / 2, stop = sg.top;
      // أعمدة/دعامات رأسية (غير موثقة تاريخيًا كعنصر سلماني: «غير متحقق»): في الفراغات بين الفتحات والزوايا
      if (E.pilaster) { const pil = (a, b) => { if (b - a < .2) return; add(b - a, stop, .22, accent, (a + b) / 2, stop / 2, SW + .11, { uo: a, vo: 0 }); spans.push([a, b, 0, stop]); };
        const occS = occ.filter(o => o[1] > sg.u0 && o[0] < sg.u1).sort((a, b) => a[0] - b[0]);
        if (E.pilaster === 1 || E.pilaster === 3) { for (const [a, b] of [[sg.u0, sg.u0 + pilW], [sg.u1 - pilW, sg.u1]]) if (!occS.some(o => o[0] < b + .1 && o[1] > a - .1)) pil(a, b); }
        if (E.pilaster >= 2) { let c = sg.u0 + pilW + .12; const lim2 = sg.u1 - pilW - .12; for (const [a, b] of [...occS, [lim2 + 1, lim2 + 2]]) { const g0 = c, g1 = Math.min(a - .1, lim2); if (g1 - g0 >= .55) { const w = Math.min(pilW, g1 - g0 - .3), m = (g0 + g1) / 2; pil(m - w / 2, m + w / 2); } c = Math.max(c, b + .1); } } }
      // 3) أحزمة
      for (const yb of bands) { const bu = (E.band === 3), bw = len + .02;
        if (E.band === 0) continue;
        if (E.band === 2) { add(bw, .16, .06, accent, cxs, yb + .08, SW + .03, { uo: sg.u0, vo: yb }); add(bw, .05, .09, accent, cxs, yb + .205, SW + .045, { uo: sg.u0, vo: yb }); }
        else if (E.band === 3) add(bw, .13, .16, accent, cxs, yb + .065, SW + .08, { uo: sg.u0, vo: yb });
        else if (E.band === 4) { add(bw, .06, .09, accent, cxs, yb + .03, SW + .045, { uo: sg.u0, vo: yb }); add(bw, .06, .09, accent, cxs, yb + .30, SW + .045, { uo: sg.u0, vo: yb + .27 }); }
        else add(bw, BH, .08, accent, cxs, yb + BH / 2, SW + .04, { uo: sg.u0, vo: yb });
        ao([sg.u0, yb, SW + .003], [sg.u1, yb, SW + .003], [0, bu ? -.34 : -.26, 0], bu ? .4 : .3); }
      // حاجب متصل فوق الدور الأرضي (شريط تظليل): يبرز 40 سم متصلًا بالجدار على كامل المقطع
      if (E.hood === 2 && bands.length && side === 's') { const yb = bands[0]; add(len - .04, .12, .40, accent, cxs, yb + .06, SW + .20, { uo: sg.u0, vo: yb }); add(len - .04, .05, .42, stoneJ, cxs, yb + .145, SW + .21, { uo: sg.u0, vo: yb }); ao([sg.u0, yb, SW + .003], [sg.u1, yb, SW + .003], [0, -.5, 0], .38); }
      // 4) قاعدة
      if (E.plinth) { const gaps = doors.map(d => fbox(d)).filter(f => f.u1 > sg.u0 && f.u0 < sg.u1).map(f => [f.u0 - .3, f.u1 + .3]).sort((a, b) => a[0] - b[0]); let c = sg.u0; const segsP = [];
        for (const [a, b] of gaps) { if (a > c + .2) segsP.push([c, Math.min(a, sg.u1)]); c = Math.max(c, b); } if (sg.u1 > c + .2) segsP.push([c, sg.u1]);
        const H = E.plinthH; for (const [a, b] of segsP) { if (E.plinth === 3) { add(b - a, H * .55, .11, accent, (a + b) / 2, H * .275, SW + .055, { uo: a, vo: 0 }); add(b - a - .04, H * .45, .06, accent, (a + b) / 2, H * .55 + H * .225, SW + .03, { uo: a, vo: H * .55 }); }
          else if (E.plinth === 2) add(b - a, H, .1, accent, (a + b) / 2, H / 2, SW + .05, { uo: a, vo: 0 }); else add(b - a, H, .05, accent, (a + b) / 2, H / 2, SW + .025, { uo: a, vo: 0 }); } }
      // 5) دروة مرتفعة وغطاء
      let yTop = stop; if (E.parapet) { const ph = .34; add(len + .02, ph, .26, accent, cxs, stop + ph / 2, SW - .09, { uo: sg.u0, vo: stop }); yTop = stop + ph;
        if (E.parapet === 2) for (let u = sg.u0 + .5; u + 1.1 <= sg.u1 - .4; u += 1.7) add(1.1, .18, .01, jointMat, u + .55, stop + .17, SW + .045, { cast: false }); }
      if (E.cap === 1) add(len + .04, .1, .5, stoneJ, cxs, yTop + .05, SW - .12, { uo: sg.u0, vo: yTop });
      else if (E.cap === 2) { add(len + .02, .07, .42, accent, cxs, yTop + .035, SW - .08, { uo: sg.u0, vo: yTop }); add(len + .06, .06, .52, stoneJ, cxs, yTop + .1, SW - .13, { uo: sg.u0, vo: yTop }); }
      else add(len + .02, .06, .38, stoneJ, cxs, yTop + .03, SW - .12, { uo: sg.u0, vo: yTop });
      if (TPL?.p?.acscreen) { const bw = 2.2, nb = Math.max(1, Math.round(len / bw)), w = len / nb; // دروة متدرجة: ارتفاع منخفض ~1.2 م (من المستند) وأجزاء مرتفعة +0.6 م = ~1.8 م
        for (let i = 0; i < nb; i += 2) { const a = sg.u0 + i * w; add(w - .04, .6, .26, accent, a + w / 2, stop + .3, SW - .09, { uo: a, vo: stop }); add(w + .02, .06, .38, stoneJ, a + w / 2, stop + .63, SW - .12, { uo: a, vo: stop + .6 }); } }
      sg.yTop = yTop;
      // 6) ملامسة الأرض
      ao([sg.u0, .003, SW], [sg.u1, .003, SW], [0, 0, .5], .5); ao([sg.u0, 0, SW + .003], [sg.u1, 0, SW + .003], [0, .4, 0], .3); }
    // 7) حجب مُثقَّب
    const freeSpan = () => { let best = [0, 0, null]; for (const sg of sideSegs) { const iv = spans.filter(s => s[1] > sg.u0 && s[0] < sg.u1).map(s => [s[0], s[1]]).sort((a, b) => a[0] - b[0]); let c = sg.u0 + .3;
        for (const [a, b] of iv) { if (a - c > best[1] - best[0]) best = [c, a, sg]; c = Math.max(c, b); } if (sg.u1 - .3 - c > best[1] - best[0]) best = [c, sg.u1 - .3, sg]; } return best; };
    const screen = (a, b, y0, y1, SW) => { const w = b - a, h = y1 - y0; if (w < .6 || h < 1) return; const cx = (a + b) / 2, cy = (y0 + y1) / 2, rep = [Math.max(1, Math.round(w / .56)), Math.max(1, Math.round(h / .56))];
      const tx = alphaT.clone(); tx.needsUpdate = true; tx.repeat.set(...rep); const sm2 = screenMat.clone(); sm2.alphaMap = tx; sm2.name = 'perforated-screenS';
      add(w + .08, h + .08, .03, backing, cx, cy, SW + .016, { cast: false });
      const g = new THREE.PlaneGeometry(w, h); const pm = new THREE.Mesh(g, sm2); pm.position.copy(P3(cx, cy, SW + .09)); pm.quaternion.setFromRotationMatrix(basis); pm.receiveShadow = true; scene.add(pm);
      for (const [yy, hh2] of [[y1 + .035, .07], [y0 - .035, .07]]) add(w + .14, hh2, .13, bronze, cx, yy, SW + .08); for (const xx of [a - .035, b + .035]) add(.07, h, .13, bronze, xx, cy, SW + .08);
      spans.push([a - .06, b + .06, y0, y1]); };
    const second = E.tpl ? (E.scrL && E.scrR) : (bld.solidVoid ?? 0) > .82;
    if (E.screenAny) { if (side === 's' && entry) { const sg = entry.seg, SW = entry.wd, sw = .85 + R(47) * .35;
        const tryS = (left) => { const a = left ? entry.x0 - .55 - sw : entry.x1 + .55, b = a + sw; if (a > sg.u0 + .3 && b < sg.u1 - .3 && !spans.some(s => a < s[1] && b > s[0] && s[3] > .5)) screen(a, b, .55, entry.f.y1 + .1, SW); };
        if (E.tpl) { if (E.scrL) tryS(true); if (E.scrR) tryS(false); } else { tryS(E.scrL); if (second) tryS(!E.scrL); } }
      else { const [a, b, sg] = freeSpan(); if (sg && b - a > 1.6) { const sw = Math.min(1.3, b - a - .8), c = (a + b) / 2; screen(c - sw / 2, c + sw / 2, .55, 2.9, sg.wd); } } }
    plan[side] = { sm, n, t, basis, X0, X1, top, wd, place, add, P3, doors: doors.map(d => fbox(d)), bands, lanterns, segs: sideSegs, segAt, entry };
    if (side === 's') south = plan[side];
  }
  if (!south) return {};
  // 8) أبراج الأطراف وأكاليل مثلثية (على الأطراف وفوق المدخل فقط)
  const crownBase = E.crownBase, crownH = E.crownH, crownDepth = .2;
  const tri = (pl, u, y, w, h, d0) => { const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]); const g = new THREE.ExtrudeGeometry(sh, { depth: crownDepth, bevelEnabled: false }); g.translate(0, 0, -crownDepth / 2);
    const nn = g.toNonIndexed(); nn.computeVertexNormals(); return pl.place(nn, stoneJ, u, y, d0, { uo: u - w / 2, vo: y }); };
  const crownRow = (pl, a, b, y, d0) => { if (!E.triOn) return; const pitch = crownBase * 2, nC = Math.max(1, Math.floor((b - a + crownBase) / pitch)), tot = (nC - 1) * pitch + crownBase, st = (a + b) / 2 - tot / 2 + crownBase / 2;
    for (let i = 0; i < nC; i++) { const u = st + i * pitch; let h = crownH; if (E.triPat === 1) h = crownH * (i % 2 ? .62 : 1); if (E.triPat === 2 && nC > 1) h = crownH * (i === Math.floor((nC - 1) / 2) ? 1.25 : .5); tri(pl, u, y, crownBase, Math.min(.5, h), d0); } };
  const pierBlock = (pl, a, b, rise, y, d0, dep) => { pl.add(b - a, rise, dep, stoneJ, (a + b) / 2, y + rise / 2, d0, { uo: a, vo: y }); pl.add(b - a + .06, .05, dep + .06, accent, (a + b) / 2, y + rise + .025, d0, { uo: a, vo: y + rise }); return y + rise + .05; };
  const tier = (pl, a, b, rise, wdx, y0, dep) => { const d0 = wdx - dep / 2 + .04, yt = pierBlock(pl, a, b, rise, y0, d0, dep), m = (a + b) / 2;
    if (E.tierShape === 1 && b - a > .9) { const hw = (b - a) * .3; pl.add(hw * 2, .22, dep - .1, stoneJ, m, yt + .11, d0, { uo: m - hw, vo: yt }); crownRow(pl, m - hw, m + hw, yt + .22, wdx); return; }
    if (E.tierShape === 2 && b - a > .9) { const w2 = (b - a) * .74, w3 = (b - a) * .46; pl.add(w2, .2, dep - .08, stoneJ, m, yt + .1, d0, { uo: m - w2 / 2, vo: yt }); pl.add(w3, .2, dep - .16, stoneJ, m, yt + .3, d0, { uo: m - w3 / 2, vo: yt + .2 }); pl.add(w3 + .06, .04, dep - .1, accent, m, yt + .52, d0, { uo: m - w3 / 2, vo: yt + .5 });
      crownRow(pl, m - w3 / 2, m + w3 / 2, yt + .54, wdx); return; }
    if (E.tierShape === 3 && b - a > 1.1) { const sw = (b - a) * .36, gp = (b - a) - 2 * sw; for (const c of [a + sw / 2, b - sw / 2]) { pl.add(sw, rise * .7, dep - .06, stoneJ, c, yt + rise * .35, d0, { uo: c - sw / 2, vo: yt }); pl.add(sw + .05, .05, dep - .01, accent, c, yt + rise * .7 + .025, d0, { uo: c - sw / 2, vo: yt + rise * .7 }); crownRow(pl, c - sw / 2, c + sw / 2, yt + rise * .7 + .05, wdx); } return; }
    crownRow(pl, a, b, yt, wdx); };
  const towerWidths = (e) => [E.tw * (e === 1 ? 1.45 : e === 2 ? .8 : e === 3 ? 1.2 : 1) * E.tsc, E.tw * (e === 2 ? 1.45 : e === 1 ? .8 : e === 3 ? 1.2 : 1) * E.tsc];
  for (const sd of ['s', 'n']) { const pl = plan[sd]; if (!pl) continue; const dep = .38, e = sd === 's' ? E.e : 0, [wL, wR] = towerWidths(e), sL = pl.segs[0], sR = pl.segs[pl.segs.length - 1];
    if (E.towerOn) { tier(pl, sL.u0 - .02, sL.u0 + wL, E.rise0 * (e === 1 ? 1.25 : 1), sL.wd, sL.yTop ?? pl.top, dep); tier(pl, sR.u1 - wR, sR.u1 + .02, E.rise0 * (e === 2 ? 1.25 : 1), sR.wd, sR.yTop ?? pl.top, dep); }
    const lft = E.towerOn ? pl.X0 + wL : pl.X0, rgt = E.towerOn ? pl.X1 - wR : pl.X1;
    if (sd === 's' && E.entryPier && pl.doors.length) { const f = pl.doors[0], sg = pl.entry?.seg || pl.segAt((f.u0 + f.u1) / 2), cw = Math.min(f.u1 - f.u0 + .9, 2.2), a = (f.u0 + f.u1) / 2 - cw / 2, b = a + cw; if (a > lft + .2 && b < rgt - .2) tier(pl, a, b, E.rise0 * .6 * (E.tpl ? 1.3 : 1), sg.wd, sg.yTop ?? pl.top, dep); }
    else if (sd === 's' && (E.tpl ? E.centerAny : E.e === 0)) { const sg = pl.segs.slice().sort((a, b) => (b.u1 - b.u0) - (a.u1 - a.u0))[0], c = (sg.u0 + sg.u1) / 2, a = c - 1.0, b = c + 1.0; if (a > lft + .3 && b < rgt - .3 && !pl.doors.some(f => f.u1 > a - .3 && f.u0 < b + .3)) tier(pl, a, b, E.rise0 * .6 * (E.tpl ? 1.3 : 1), sg.wd, sg.yTop ?? pl.top, dep); } }
  // 9) إنارة ليلية
  if (night) { let cnt = 0; for (const sd of Object.keys(plan)) { const pl = plan[sd]; for (const [sx, y] of pl.lanterns) { if (cnt++ > 8) break; const L = new THREE.SpotLight('#ffd49a', 6, 4.5, 1.1, .6, 2); L.position.copy(pl.P3(sx, y, pl.wd + .1)); L.target.position.copy(pl.P3(sx, 0, pl.wd + .4)); scene.add(L, L.target); } }
    const pl = south; for (const u of [pl.X0 + .4, pl.X1 - .4]) { const L = new THREE.SpotLight('#ffe0ae', 5, 5, .9, .7, 2); L.position.copy(pl.P3(u, pl.top + .05, pl.wd + .35)); L.target.position.copy(pl.P3(u, pl.top - 1.8, pl.wd)); scene.add(L, L.target); } }
  return { wallZ: south.wd, X0: south.X0, X1: south.X1 };
}
