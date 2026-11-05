// قوالب الطراز J (معاصر حجري): مكتبة قوالب تغيّر الفتحات والمداخل والكتل والجدران وعدد الأدوار (تفويض المالك 2026-11-05)،
// وتصدّر docTransform(doc, q) الذي يُنتج مسقطًا جديدًا (جدران محيطية + فتحات) من حدود المسقط الأصلي، دون لمس الأصل.
// ملاحظة صريحة: التحويل يستبدل الجدران الداخلية والخارجية بحلقة محيطية جديدة، فلا يطابق المسقط الداخلي الأصلي.
// المفاتيح (كلها اختيارات منفصلة، أي دمج مفتاحًا بمفتاح بين قالبين صالح):
//  بنيوية (docTransform): floors 1..3 | mass 0..7 | entryPos 0..3 | entryType 0..3 | winPattern 0..6 | wallT 0..2
//  عرض (style-j): wallMat 0..5 | frame 0..5 | mull 0..4 | band 0..4 | cap 0..4 | crownZone 0..7 | portal 0..5 | pier 0..3 | accent 0..1 | plinth 0..2 | light 0..2
import { resolveTemplate } from '../templates.mjs';
import { validateDoc as drawValidate } from '../../draw/doc.mjs';
import { facadeGeometry } from '../../facade-styles.mjs';

export const ENUMS = Object.freeze({
  mass: ['صندوق مستطيل', 'كتلة أمامية يمين', 'كتلة أمامية يسار', 'كتلة أمامية وسط', 'مدخل غائر وسط', 'واجهة مدرّجة (نصفان)', 'جناح أمامي يسار', 'ثلاث درجات', 'مكعبان متداخلان'],
  entryPos: ['ثلث يسار', 'وسط', 'ثلث يمين', 'عند الكتلة الغائرة/الوسط'],
  entryType: ['باب مفرد', 'باب مزدوج', 'باب طويل محوري', 'باب زجاجي عريض'],
  winPattern: ['نوافذ منتظمة', 'شريط أفقي', 'ستارة زجاجية', 'شقوق رأسية', 'نافذة كبيرة + علوية', 'جدار صلد بنافذة صغيرة', 'نافذة بانورامية'],
  wallT: [.25, .35, .45],
});
const MASS = [
  [[0, 1, 0]],
  [[0, .55, 0], [.55, 1, 1.6]],
  [[0, .45, 1.6], [.45, 1, 0]],
  [[0, .3, 0], [.3, .7, 1.6], [.7, 1, 0]],
  [[0, .34, 1.4], [.34, .66, 0], [.66, 1, 1.4]],
  [[0, .5, 1.2], [.5, 1, 0]],
  [[0, .4, 2.4], [.4, 1, 0]],
  [[0, .33, 2.0], [.33, .66, 1.0], [.66, 1, 0]],
  [[0, .52, 0], [.52, 1, 2.2]],
];
const GROUND_PLINTH = .45, CAP = 2.75; // أعلى (sill+h) مسموح لتبقى فتحات الأدوار العليا تحت شريط البلاطة
const r2 = v => Math.round(v * 100) / 100, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// عائلات القوالب. كل قالب p كامل (كل المفاتيح)، فيصلح الدمج. الأرقام موثقة أعلاه.
const T = (id, ar, note, p, extra = {}) => ({ id, ar, note, p: { light: 1, accent: 0, plinth: 0, acscreen: 0, joint: 0, twoTone: 0, ...p }, ...extra });
const AC = { acHeights: [1.8, 1.2], acNote: 'دروة متدرجة لحجب وحدات التكييف: قسم 1.8 م وقسم 1.2 م فوق حافة السطح، متصلة بالجدار' };
export const templates = [
  T('J01', 'الصندوق الأسود الكلاسيكي', 'كتلة واحدة، إطارات سوداء بارزة، شريط رمادي، شرائح خشب على الدروة', { floors: 2, mass: 0, entryPos: 1, entryType: 1, winPattern: 0, wallT: 0, wallMat: 0, frame: 0, mull: 0, band: 0, cap: 0, crownZone: 0, portal: 0, pier: 0, accent: 1 }),
  T('J02', 'برج المدخل الحجري', 'كتلة مدخل بارزة بوسط الواجهة، حجر رملي، بوابة حجرية وزعانف حجرية على الدروة', { floors: 2, mass: 3, entryPos: 1, entryType: 2, winPattern: 4, wallT: 1, wallMat: 3, frame: 2, mull: 1, band: 2, cap: 2, crownZone: 2, portal: 3, pier: 0, plinth: 1 }),
  T('J03', 'الواجهة الزجاجية الممتدة', 'ستارة زجاجية بقواطع دقيقة، شفة خرسانية رقيقة، مظلة كابولي، رندر أبيض', { floors: 2, mass: 0, entryPos: 0, entryType: 3, winPattern: 2, wallT: 0, wallMat: 4, frame: 1, mull: 2, band: 1, cap: 1, crownZone: 4, portal: 2, pier: 2, plinth: 2 }),
  T('J04', 'إيقاع الأكتاف الحجرية', 'ترافرتين أفقي، أكتاف حجرية بين الفتحات، شقوق رأسية، مدخل عميق', { floors: 2, mass: 0, entryPos: 1, entryType: 1, winPattern: 3, wallT: 1, wallMat: 1, frame: 0, mull: 3, band: 3, cap: 3, crownZone: 6, portal: 1, pier: 1, light: 2 }),
  T('J05', 'الشريط الأفقي المنخفض', 'دور واحد، نافذة شريطية، سقف كابولي بارز، قوائم خشب عند المدخل', { floors: 1, mass: 0, entryPos: 2, entryType: 0, winPattern: 1, wallT: 0, wallMat: 1, frame: 1, mull: 3, band: 4, cap: 4, crownZone: 5, portal: 4, pier: 0 }),
  T('J06', 'الحجر الداكن والصندوق العميق', 'كتلة جانبية بارزة، بازلت داكن، صناديق إطار عميقة، كاسر فولاذي على الدروة', { floors: 2, mass: 1, entryPos: 2, entryType: 0, winPattern: 6, wallT: 2, wallMat: 2, frame: 3, mull: 4, band: 0, cap: 1, crownZone: 3, portal: 2, pier: 0, plinth: 2, light: 2 }),
  T('J07', 'المدخل الغائر المظلل', 'مدخل غائر بين جناحين بارزين، مظلات علوية للنوافذ، زعانف خشب', { floors: 2, mass: 4, entryPos: 3, entryType: 1, winPattern: 0, wallT: 1, wallMat: 0, frame: 4, mull: 0, band: 1, cap: 0, crownZone: 7, portal: 0, pier: 3, plinth: 1 }),
  T('J08', 'الجناح الأمامي بثلاثة أدوار', 'جناح يساري بارز بارتفاع ثلاثة أدوار، نوافذ كبيرة وصغيرة متبادلة، دروة خشب كاملة', { floors: 3, mass: 6, entryPos: 2, entryType: 2, winPattern: 4, wallT: 1, wallMat: 3, frame: 2, mull: 1, band: 2, cap: 2, crownZone: 1, portal: 4, pier: 1 }),
  T('J09', 'الكتلتان المتدرجتان', 'نصفان متراجعان، جدار صلد شبه أصم بنوافذ صغيرة، إطار خشبي دافئ', { floors: 3, mass: 5, entryPos: 0, entryType: 0, winPattern: 5, wallT: 2, wallMat: 5, frame: 5, mull: 0, band: 3, cap: 3, crownZone: 4, portal: 5, pier: 0, plinth: 1 }),
  T('J10', 'الدرجات الثلاث', 'ثلاث كتل متدرجة، شقوق رأسية بيضاء، بروز كابولي علوي', { floors: 2, mass: 7, entryPos: 2, entryType: 1, winPattern: 3, wallT: 1, wallMat: 4, frame: 0, mull: 2, band: 1, cap: 4, crownZone: 3, portal: 2, pier: 2 }),
  T('J11', 'البرج الزجاجي المتوسط', 'كتلة وسطية بارزة بثلاثة أدوار، ستارة زجاجية، أكتاف خرسانية رمادية', { floors: 3, mass: 3, entryPos: 1, entryType: 3, winPattern: 2, wallT: 0, wallMat: 5, frame: 1, mull: 4, band: 2, cap: 1, crownZone: 6, portal: 1, pier: 1, plinth: 2, light: 2 }),
  T('J12', 'الفيلا الشريطية بدرابزين شرائح', 'دوران، شريط أفقي، مدخل بسقف شرائح خشب على أعمدة، دروة بشرائح أفقية', { floors: 2, mass: 0, entryPos: 2, entryType: 1, winPattern: 1, wallT: 1, wallMat: 3, frame: 5, mull: 0, band: 4, cap: 0, crownZone: 5, portal: 5, pier: 3 }),
  T('J13', 'الجناح الأيمن النافذة البانورامية', 'كتلة بارزة يمينية، نافذة بانورامية، ترافرتين، شفة كابولي', { floors: 2, mass: 1, entryPos: 0, entryType: 2, winPattern: 6, wallT: 1, wallMat: 1, frame: 4, mull: 1, band: 1, cap: 4, crownZone: 0, portal: 3, pier: 0, plinth: 1 }),
  T('J14', 'الرندر الأبيض والمظلات', 'دور واحد، مدخل غائر، رندر أبيض ناعم، إطارات رفيعة، قمة بسيطة', { floors: 1, mass: 4, entryPos: 3, entryType: 3, winPattern: 6, wallT: 0, wallMat: 4, frame: 1, mull: 1, band: 3, cap: 3, crownZone: 6, portal: 2, pier: 0 }),
  T('J15', 'الحصن الحجري الصلد', 'ثلاثة أدوار بجدار شبه صلد، بازلت، شقوق ضيقة، مدخل عميق بخدين حجريين', { floors: 3, mass: 0, entryPos: 3, entryType: 2, winPattern: 5, wallT: 2, wallMat: 2, frame: 3, mull: 0, band: 0, cap: 2, crownZone: 2, portal: 1, pier: 1, plinth: 2, light: 2 }),
  T('J16', 'الواجهة المقسومة بالخشب', 'نصفان متدرجان، دفء الخشب، شرائح وقوائم، نوافذ منتظمة', { floors: 2, mass: 5, entryPos: 2, entryType: 1, winPattern: 0, wallT: 1, wallMat: 3, frame: 5, mull: 2, band: 2, cap: 0, crownZone: 1, portal: 4, pier: 3, accent: 1 }),
  T('J17', 'جناحان وفناء أمامي', 'ثلاث درجات، ستارة زجاجية على الدرجة الغائرة، ترافرتين ودروة LED', { floors: 3, mass: 7, entryPos: 3, entryType: 3, winPattern: 2, wallT: 1, wallMat: 1, frame: 4, mull: 3, band: 4, cap: 1, crownZone: 4, portal: 5, pier: 2, light: 2 }),
  T('J18', 'الكتلة الحجرية الصلدة', 'كتل بازلت كبيرة بفواصل ظل غاطسة، تجاويف شبابيك عميقة منحوتة، شقوق ضيقة', { floors: 2, mass: 0, entryPos: 3, entryType: 2, winPattern: 5, wallT: 2, wallMat: 2, frame: 3, mull: 0, band: 3, cap: 2, crownZone: 2, portal: 1, pier: 0, plinth: 2, joint: 1, acscreen: 1 }, AC),
  T('J19', 'المكعبات المتداخلة', 'مكعب حجري بيج أمامي ومكعب بازلت رمادي داكن متراجع بإزاحة حقيقية وظلال دراماتيكية', { floors: 2, mass: 8, entryPos: 2, entryType: 1, winPattern: 4, wallT: 2, wallMat: 3, frame: 3, mull: 1, band: 2, cap: 3, crownZone: 4, portal: 3, pier: 0, plinth: 1, twoTone: 1, joint: 1 }),
  T('J20', 'الأفق الحجري المعلق', 'بلاطة حجرية ضخمة بكابولي 68 سم فوق واجهة زجاجية ممتدة بدعامات فولاذية واضحة', { floors: 2, mass: 0, entryPos: 0, entryType: 3, winPattern: 2, wallT: 1, wallMat: 1, frame: 1, mull: 2, band: 1, cap: 5, crownZone: 6, portal: 2, pier: 2, plinth: 2, light: 2, acscreen: 1 }, AC),
];
export const meta = Object.freeze({ id: 'J', ar: 'معاصر', templateCount: templates.length });

// ------------------------------------------------------------------ توليد المسقط
const clone = o => JSON.parse(JSON.stringify(o));
function bboxOf(doc) { const xs = [], ys = []; for (const w of doc.walls || []) if (w.kind !== 'fence' && w.kind !== 'parapet') xs.push(w.a.x, w.b.x), ys.push(w.a.y, w.b.y);
  if (!xs.length) return { x0: 0, y0: 0, W: 12, D: 12 }; const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return { x0, y0, W: x1 - x0, D: y1 - y0 }; }

/** يبني مسقطًا جديدًا من الحدود الأصلية ومفاتيح القالب P. */
export function buildDoc(doc, P) {
  const bb = bboxOf(doc), W = r2(clamp(bb.W, 8, 18)), D = r2(clamp(bb.D, 9, 16)), x0 = r2(bb.x0), y0 = r2(bb.y0), T = ENUMS.wallT[P.wallT] ?? .25;
  const L = doc.levels?.[0] || { id: 'L1', name: 'الدور الأرضي' }, lv = L.id;
  const prof = MASS[P.mass] ?? MASS[0], fmax = Math.max(...prof.map(s => s[2]));
  // قطع الواجهة الأمامية (جنوب = y الأصغر): الأمامية أكثر بروزًا
  let segs = prof.map(([a, b, f]) => ({ xa: r2(x0 + a * W), xb: r2(x0 + b * W), y: r2(y0 + fmax - f), f })); segs[0].xa = x0; segs[segs.length - 1].xb = r2(x0 + W);
  for (let i = 1; i < segs.length; i++) segs[i].xa = segs[i - 1].xb;
  const yR = r2(y0 + D), walls = [], openings = [], ring = [];
  const addWall = (a, b) => { const w = { id: 'w' + (walls.length + 1), level: lv, a, b, t: T, h: null, kind: 'wall' }; walls.push(w); return w; };
  const pts = []; for (const s of segs) { pts.push({ x: s.xa, y: s.y }, { x: s.xb, y: s.y }); }
  pts.push({ x: x0 + W, y: yR }, { x: x0, y: yR });
  // حلقة: تجاهل التكرار المتتالي
  const P2 = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return !(Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6); });
  for (let i = 0; i < P2.length; i++) ring.push(addWall(P2[i], P2[(i + 1) % P2.length]));
  const len = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const add = (w, c, wd, h, sill, kind, entry = false) => openings.push({ id: 'o' + (openings.length + 1), level: lv, wall: w.id, kind, at: r2(c), w: r2(wd), h: r2(h), sill: r2(sill), swing: entry || /door|slider/.test(kind) ? 'out' : null, hinge: 'left', entry });
  const frontWalls = ring.filter(w => Math.abs(w.a.y - w.b.y) < 1e-6 && w.b.x > w.a.x && segs.some(s => Math.abs(s.y - w.a.y) < 1e-6 && Math.abs(s.xa - w.a.x) < 1e-6));
  const M = Math.max(.55, T + .3);
  // --- المدخل
  const dt = [{ k: 'door', w: 1.0, h: 2.4 }, { k: 'door2', w: 1.6, h: 2.4 }, { k: 'door2', w: 2.0, h: 2.7 }, { k: 'slider', w: 2.6, h: 2.4 }][P.entryType] || { k: 'door', w: 1, h: 2.4 };
  const fr = [.25, .5, .75][P.entryPos];
  let target = fr != null ? x0 + fr * W : null;
  if (P.entryPos === 3) { const m = frontWalls.slice().sort((a, b) => (a.a.y - b.a.y) * -1 || len(b) - len(a)); // الأكثر غورًا (y الأكبر) ثم الأعرض
    const maxY = Math.max(...frontWalls.map(w => w.a.y)), minY = Math.min(...frontWalls.map(w => w.a.y)); target = null;
    const cand = frontWalls.filter(w => maxY - minY > .1 ? Math.abs(w.a.y - maxY) < 1e-6 : true).sort((a, b) => len(b) - len(a))[0]; target = (cand.a.x + cand.b.x) / 2; }
  let ew = frontWalls.find(w => target >= w.a.x && target <= w.b.x);
  const need = dt.w + 2 * M;
  if (!ew || len(ew) < need) ew = frontWalls.slice().sort((a, b) => len(b) - len(a))[0];
  let dw = dt; if (len(ew) < need) { dw = { ...dt, w: r2(Math.max(.9, len(ew) - 2 * M)), k: dt.w > 1.5 ? 'door2' : 'door' }; }
  const lo = ew.a.x + M + dw.w / 2, hi = ew.b.x - M - dw.w / 2, cx = clamp(target, lo, Math.max(lo, hi));
  add(ew, cx - ew.a.x, dw.w, dw.h, 0, dw.k, true);
  const doorZone = { w: ew, a: cx - dw.w / 2 - .6, b: cx + dw.w / 2 + .6 };
  // --- نوافذ الواجهة الأمامية
  const wins = (s, e) => { const ln = e - s, out = []; if (ln < 1.0) return out; const mid = (s + e) / 2;
    switch (P.winPattern) {
      case 0: { const n = Math.max(1, Math.floor(ln / 2.3)), w = ln / n > 2 ? 1.2 : Math.min(1.0, ln - .3); for (let i = 0; i < n; i++) out.push({ c: s + ln * (i + .5) / n, w, h: 1.5, sill: .9, k: 'window' }); break; }
      case 1: out.push({ c: mid, w: Math.min(ln, 7.5), h: 1.0, sill: 1.5, k: 'window2' }); break;
      case 2: { const n = Math.ceil(ln / 3.4), gap = .5, w = (ln - (n - 1) * gap) / n; for (let i = 0; i < n; i++) out.push({ c: s + w / 2 + i * (w + gap), w, h: 2.55, sill: .2, k: 'window2' }); break; }
      case 3: { const n = Math.floor((ln + .55) / 1.15); if (n < 1) break; const tot = n * .6 + (n - 1) * .55, st = mid - tot / 2; for (let i = 0; i < n; i++) out.push({ c: st + .3 + i * 1.15, w: .6, h: 2.5, sill: .25, k: 'window' }); break; }
      case 4: { if (ln >= 2.8) { const bw = Math.min(ln * .6, 3.0); out.push({ c: s + bw / 2, w: bw, h: 1.9, sill: .6, k: 'window2' }); const r = ln - bw - .8; if (r >= .9) out.push({ c: e - r / 2, w: Math.min(r, 1.0), h: .5, sill: 2.0, k: 'window' }); } else out.push({ c: mid, w: Math.min(ln, 1.6), h: 1.9, sill: .6, k: 'window2' }); break; }
      case 5: if (ln >= 2) out.push({ c: mid, w: .6, h: .6, sill: 1.6, k: 'window' }); break;
      case 6: out.push({ c: mid, w: Math.min(ln * .85, 4.6), h: 1.8, sill: .75, k: 'window2' }); break; }
    return out; };
  for (const w of frontWalls) { let s = w.a.x + M, e = w.b.x - M; const parts = [];
    if (doorZone.w === w) { parts.push([s, Math.min(e, doorZone.a)], [Math.max(s, doorZone.b), e]); } else parts.push([s, e]);
    for (const [ps, pe] of parts) for (const o of wins(ps, pe)) { if (o.w < .4) continue; add(w, o.c - w.a.x, o.w, o.h, o.sill, o.k); } }
  // --- الجوانب والخلف والجدران الراجعة: نوافذ منتظمة بسيطة
  for (const w of ring) { if (frontWalls.includes(w)) continue; const ln = len(w), horiz = Math.abs(w.a.y - w.b.y) < 1e-6, back = horiz && w.a.y > y0 + D - .01;
    const edge = Math.max(.9, T + .6), n = back ? Math.max(0, Math.floor((ln - 2 * edge) / 2.8) + 1) : Math.max(ln > 1.9 ? 1 : 0, Math.floor((ln - 2 * edge) / 3.0) + 1);
    if (ln < 1.9 || n < 1) continue; const wd = ln < 2.6 ? 1.0 : 1.3; for (let i = 0; i < n; i++) add(w, edge + (ln - 2 * edge) * (n === 1 ? .5 : i / (n - 1)), wd, 1.4, .9, 'window'); }
  const out = clone(doc);
  out.levels = [{ ...L, elevation: 0, height: 3.2 }]; out.walls = walls; out.openings = openings; out.entry = 's'; out.entries = ['s'];
  out.roof = { ...(doc.roof || {}), parapet: 1.8, overhang: 0 };
  for (const k of ['labels', 'zones', 'fixtures', 'stairs', 'columns', 'dimensions', 'texts']) out[k] = [];
  out.counters = { levels: 1, walls: walls.length, openings: openings.length };
  out.title = (doc.title || 'تصميم') + ' — قالب ' + (P.__id || '');
  return out;
}

/** تحقق ذاتي: صالح البنية، فتحات داخل الجدران بهامش ≥20 سم دون تقاطع، باب رئيسي على الواجهة الأمامية يصل الأرض، جدران متصلة، أدوار 1-3. */
export function validateDoc(doc, floors = 1) {
  const err = [], walls = new Map(doc.walls.map(w => [w.id, w]));
  for (const i of drawValidate(doc)) if (i.severity === 'error' || i.code === 'OPENING_OUTSIDE' || i.code === 'OPENING_OVERLAP') err.push(i.code + ':' + i.id);
  if (!(floors >= 1 && floors <= 3)) err.push('FLOORS');
  // اتصال الحلقة: كل رأس مشترك بين جدارين بالضبط
  const key = p => p.x.toFixed(3) + ',' + p.y.toFixed(3), deg = new Map(); for (const w of doc.walls) for (const p of [w.a, w.b]) deg.set(key(p), (deg.get(key(p)) || 0) + 1);
  for (const [k, d] of deg) if (d !== 2) err.push('RING:' + k + '=' + d);
  const by = new Map(); for (const o of doc.openings) { const w = walls.get(o.wall); if (!w) { err.push('ORPHAN:' + o.id); continue; } const ln = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (o.at - o.w / 2 < .2 - 1e-6 || o.at + o.w / 2 > ln - .2 + 1e-6) err.push('MARGIN:' + o.id); if (!/door|slider/.test(o.kind) && o.sill + o.h > CAP + 1e-6) err.push('TOOHIGH:' + o.id); if (/door|slider/.test(o.kind) && o.sill !== 0) err.push('DOORSILL:' + o.id);
    (by.get(o.wall) || by.set(o.wall, []).get(o.wall)).push(o); }
  for (const l of by.values()) { l.sort((a, b) => a.at - b.at); for (let i = 1; i < l.length; i++) if (l[i].at - l[i].w / 2 - (l[i - 1].at + l[i - 1].w / 2) < .3 - 1e-6) err.push('GAP:' + l[i].id); }
  let g; try { g = facadeGeometry(doc); } catch (e) { err.push('GEOM:' + e.message); }
  if (g) { if (g.skipped.diagonal) err.push('DIAGONAL'); if (g.exteriorOpenings.length !== doc.openings.length) err.push('UNPLACED:' + (doc.openings.length - g.exteriorOpenings.length));
    const so = g.sides.s.pieces.flatMap(p => p.openings); if (!so.some(o => o.entry && /door|slider/.test(o.kind) && o.z0 <= GROUND_PLINTH + 1e-6)) err.push('NOENTRY'); }
  return err;
}

/** يحلّ tpl مع تسامح: في الرابط يُفكّ «+» إلى فراغ (tpl=A+B ← "A B") فنعيده إلى «+». */
export function resolveJ(q) { const raw = q?.get?.('tpl'); if (!raw) return null; const norm = raw.trim().replace(/[\s+]+/g, '+');
  return resolveTemplate(templates, { get: k => (k === 'tpl' ? norm : q.get(k)) }); }

export function docTransform(doc, q) {
  const T = resolveJ(q); if (!T) return doc;
  const P = { ...T.p, __id: T.id }; const out = buildDoc(doc, P);
  if (q?.set && !q.has('floors')) q.set('floors', String(clamp(P.floors | 0, 1, 3)));
  const bad = validateDoc(out, Number(q?.get?.('floors') || P.floors)); if (bad.length) { console.error('J_TEMPLATE_INVALID', T.id, bad.slice(0, 4).join(',')); return doc; }
  return out;
}
