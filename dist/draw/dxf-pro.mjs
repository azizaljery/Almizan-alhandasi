// DXF احترافي لحزمة المهندس (نقي: بلا DOM): ملف لكل دور + ملف الموقع العام، بصيغة R2000 (AC1015) نصية.
//   · الوحدة متر ($INSUNITS=6، $MEASUREMENT=1)، 1 وحدة رسم = 1 م، والأصل (0,0) عند ركن الأرض (أو ركن المبنى إن لم تُعرَّف أرض).
//   · طبقات بأسماء معيارية (انظر DXF_LAYERS) بألوان ACI وأوزان خطوط.
//   · الجدران مضلعات مغلقة LWPOLYLINE بسماكتها الحقيقية مقطوعة عند الفتحات (من wall-geometry نفسها التي تبني المجسم).
//   · الأبواب: ضلفة LINE + قوس فتح ARC؛ النوافذ: إطار مغلق + خطا زجاج؛ ولكل فتحة وسم (D01، W01) على طبقة IDEN.
//   · الأبعاد: خطوط وشرطات ونصوص على A-ANNO-DIMS — لا كيانات DIMENSION (تتطلب بلوكات مجهولة الاسم يصعب ضمان صحتها بلا AutoCAD للتحقق).
//   · النص العربي: الملف ASCII صرف؛ كل حرف غير لاتيني يُكتب \U+XXXX (الصيغة التي يقرؤها AutoCAD منذ R2000 وezdxf وLibreCAD) مع
//     $DWGCODEPAGE=ANSI_1256 ونمط نص بخط TrueType (arial.ttf). النص بترتيبه المنطقي؛ التشكيل والاتجاه RTL يتولاهما البرنامج مع خط
//     TrueType (AutoCAD). البرامج التي ترسم بخطوطها الداخلية (LibreCAD) قد تُظهر الحروف منفصلة أو معكوسة؛ لذلك يُكتب بجانب كل اسم
//     فراغ اسم لاتيني مختصر (MAJLIS، BED-1...) على الطبقة نفسها.
// لم يُفتح الناتج في AutoCAD/Revit حقيقيين في بيئة البناء؛ الصحة البنيوية يتحقق منها tests/engineer-pack.test.mjs بمحلّل DXF.
import { buildingModel } from './building-model.mjs';
import { footprint } from './wall-geometry.mjs';
import { analyzeDoc, isWindowKind } from './digest.mjs';
import { dimensionChains, gridAxes, stairInfo, fixtureSymbol, fmtDim } from './plan-annot.mjs';
import { swingSectors } from './review.mjs';
import { siteModel } from './site-sheet.mjs';
import { isOutdoorKind, isDoorKind } from './catalog.mjs';
import { add, sub, mul, norm, perp, dist, insetPolygon } from './geom.mjs';

/** جدول الطبقات: الاسم، لون ACI، وزن الخط (1/100 مم)، نوع الخط، والوصف. يُكتب كما هو في README الحزمة. */
export const DXF_LAYERS = Object.freeze([
  { name: 'A-WALL-EXT', color: 7, lw: 50, lt: 'Continuous', ar: 'الجدران الخارجية (مضلعات مغلقة بالسماكة)', en: 'Exterior walls (closed polylines, true thickness)' },
  { name: 'A-WALL', color: 2, lw: 35, lt: 'Continuous', ar: 'الجدران والقواطع الداخلية', en: 'Interior walls / partitions' },
  { name: 'A-WALL-PRHT', color: 8, lw: 25, lt: 'Continuous', ar: 'جدران جزئية الارتفاع (دروة/حاجز)', en: 'Partial-height walls (parapets)' },
  { name: 'A-DOOR', color: 3, lw: 25, lt: 'Continuous', ar: 'الأبواب: الضلفة وقوس الفتح', en: 'Doors: leaf + swing arc' },
  { name: 'A-DOOR-IDEN', color: 3, lw: 13, lt: 'Continuous', ar: 'وسوم الأبواب (D01…)', en: 'Door tags' },
  { name: 'A-GLAZ', color: 5, lw: 25, lt: 'Continuous', ar: 'النوافذ', en: 'Windows / glazing' },
  { name: 'A-GLAZ-IDEN', color: 5, lw: 13, lt: 'Continuous', ar: 'وسوم النوافذ (W01…)', en: 'Window tags' },
  { name: 'A-FLOR-STRS', color: 6, lw: 18, lt: 'Continuous', ar: 'الدرج', en: 'Stairs' },
  { name: 'A-FLOR-OTLN', color: 8, lw: 18, lt: 'DASHED', ar: 'محيط الأدوار العليا (في الموقع العام)', en: 'Upper floor outline (site plan)' },
  { name: 'A-FURN', color: 9, lw: 13, lt: 'Continuous', ar: 'الأثاث والأجهزة الصحية', en: 'Furniture and sanitary fixtures' },
  { name: 'A-AREA', color: 4, lw: 9, lt: 'Continuous', ar: 'حدود الفراغات الصافية (مضلعات مغلقة لحساب المساحة)', en: 'Net room boundaries (closed polylines)' },
  { name: 'A-AREA-IDEN', color: 7, lw: 18, lt: 'Continuous', ar: 'أسماء الفراغات (عربي + لاتيني) ومساحاتها', en: 'Room names (Arabic + Latin code) and areas' },
  { name: 'A-ANNO-DIMS', color: 1, lw: 13, lt: 'Continuous', ar: 'الأبعاد (خطوط وشرطات ونصوص)', en: 'Dimensions (lines, ticks, text)' },
  { name: 'A-ANNO-TEXT', color: 7, lw: 18, lt: 'Continuous', ar: 'نصوص وملاحظات', en: 'Notes and text' },
  { name: 'A-ANNO-NRTH', color: 7, lw: 25, lt: 'Continuous', ar: 'سهم الشمال', en: 'North arrow' },
  { name: 'A-ANNO-TTLB', color: 7, lw: 35, lt: 'Continuous', ar: 'إطار اللوحة ولوحة العنوان', en: 'Sheet border and title block' },
  { name: 'S-COLS', color: 30, lw: 35, lt: 'Continuous', ar: 'أعمدة مبدئية (تحجيم أولي غير معتمد)', en: 'Preliminary columns (not an approved structural design)' },
  { name: 'S-GRID', color: 8, lw: 9, lt: 'CENTER', ar: 'محاور', en: 'Grid axes' },
  { name: 'C-PROP', color: 1, lw: 50, lt: 'CENTER', ar: 'حدود الأرض', en: 'Property line' },
  { name: 'C-BLDG-SETB', color: 6, lw: 18, lt: 'DASHED', ar: 'خطوط الارتداد المُدخلة', en: 'Setback lines (as entered)' },
  { name: 'L-SITE', color: 3, lw: 25, lt: 'Continuous', ar: 'عناصر الحوش: أسوار، مسبح، مظلات، زراعة', en: 'Site elements: fences, pool, canopies, planting' },
]);
const LAYER_SET = new Set(DXF_LAYERS.map(l => l.name));
const ROOM_CODE = Object.freeze({ bedroom: 'BED', master: 'MASTER-BED', majlis: 'MAJLIS', living: 'LIVING', dining: 'DINING', kitchen: 'KITCHEN', bath: 'WC', laundry: 'LAUNDRY', storage: 'STORE', service: 'SERVICE', office: 'OFFICE', corridor: 'CORRIDOR', entrance: 'ENTRANCE', stairs: 'STAIR', balcony: 'TERRACE', courtyard: 'COURT', elevator: 'LIFT', garage: 'GARAGE', other: 'SPACE' });
const FIXTURE_CODE = Object.freeze({ pool: 'POOL', waterfall: 'WATERFALL', lawn: 'LAWN', planter: 'PLANTER', carport: 'CARPORT', pergola: 'PERGOLA', bbq: 'BBQ', fountain: 'FOUNTAIN', tree: 'TREE' });
const FIXTURE_AR = Object.freeze({ pool: 'مسبح', waterfall: 'شلال', lawn: 'عشب', planter: 'حوض زراعة', carport: 'مظلة سيارات', pergola: 'برجولة', bbq: 'ركن شواء', fountain: 'نافورة', tree: 'شجرة' });
const LEVEL_EN = ['GROUND FLOOR PLAN', 'FIRST FLOOR PLAN', 'SECOND FLOOR PLAN', 'THIRD FLOOR PLAN'];
const SCALES = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
export const DXF_DISCLAIMER_EN = 'PRELIMINARY DESIGN - NOT APPROVED - NOT FOR CONSTRUCTION';
export const DXF_DISCLAIMER_AR = 'تصميم أولي غير معتمد — ليس للترخيص أو التنفيذ';

/** نص DXF آمن: ASCII فقط، وما عداه \U+XXXX (BMP)؛ علامات الاتجاه غير المرئية تُحذف. */
export function dxfText(s) {
  let out = '';
  for (const ch of String(s ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/[\r\n\t]+/g, ' ')) {
    const c = ch.codePointAt(0);
    if (c === 0x5e) out += '^ '; else if (c >= 32 && c < 127) out += ch; else if (c > 0xffff || c < 32) out += '?'; else out += '\\U+' + c.toString(16).toUpperCase().padStart(4, '0');
  }
  return out;
}
/** الرمز اللاتيني لكل فراغ في المبنى كله: النوع + رقم تسلسلي إن تكرر (BED-1، BED-2، WC-1...). */
export function roomCodes(model) {
  const all = model.levels.flatMap(l => l.rooms.filter(r => r.net)), count = {}, seq = {}, codes = new Map();
  for (const r of all) { const k = ROOM_CODE[r.type] || 'SPACE'; count[k] = (count[k] || 0) + 1; }
  for (const r of all) { const k = ROOM_CODE[r.type] || 'SPACE'; seq[k] = (seq[k] || 0) + 1; codes.set(r.levelId + '/' + r.id, count[k] > 1 ? `${k}-${seq[k]}` : k); }
  return codes;
}
const f = v => { const s = (Math.round(v * 1e5) / 1e5).toString(); return s === '-0' ? '0' : s; };

/** كاتب DXF R2000 أدنى صالح: HEADER، CLASSES، TABLES (كل الجداول المطلوبة)، BLOCKS، ENTITIES، OBJECTS. */
class Dxf {
  constructor(origin) { this.o = origin; this.e = []; this.h = 0x100; this.box = null; this.count = {}; }
  hd() { return (this.h++).toString(16).toUpperCase(); }
  X(x) { return x - this.o.x; } Y(y) { return y - this.o.y; }
  grow(x, y) { const b = this.box || (this.box = { x0: x, y0: y, x1: x, y1: y }); if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
  ent(type, layer, sub, body, lt) {
    if (!LAYER_SET.has(layer)) throw new Error('DXF: طبقة غير معرّفة ' + layer);
    this.count[layer] = (this.count[layer] || 0) + 1;
    this.e.push('0', type, '5', this.hd(), '330', '1F', '100', 'AcDbEntity', '8', layer, ...(lt ? ['6', lt] : []), '100', sub, ...body);
  }
  /** نقاط بإحداثيات المستند (تُزاح إلى الأصل). */
  poly(layer, pts, closed = true, lt = null) {
    if (!pts || pts.length < 2) return;
    const b = ['90', String(pts.length), '70', closed ? '1' : '0', '43', '0'];
    for (const p of pts) { const x = this.X(p.x), y = this.Y(p.y); this.grow(x, y); b.push('10', f(x), '20', f(y)); }
    this.ent('LWPOLYLINE', layer, 'AcDbPolyline', b, lt);
  }
  line(layer, a, c, lt = null) {
    const x1 = this.X(a.x), y1 = this.Y(a.y), x2 = this.X(c.x), y2 = this.Y(c.y); this.grow(x1, y1); this.grow(x2, y2);
    this.ent('LINE', layer, 'AcDbLine', ['10', f(x1), '20', f(y1), '30', '0', '11', f(x2), '21', f(y2), '31', '0'], lt);
  }
  circle(layer, c, r) { const x = this.X(c.x), y = this.Y(c.y); this.grow(x - r, y - r); this.grow(x + r, y + r); this.ent('CIRCLE', layer, 'AcDbCircle', ['10', f(x), '20', f(y), '30', '0', '40', f(r)]); }
  /** قوس عكس عقارب الساعة من a0 إلى a1 (درجات). */
  arc(layer, c, r, a0, a1) {
    const x = this.X(c.x), y = this.Y(c.y); this.grow(x - r, y - r); this.grow(x + r, y + r);
    this.ent('ARC', layer, 'AcDbCircle', [ '10', f(x), '20', f(y), '30', '0', '40', f(r), '100', 'AcDbArc', '50', f(((a0 % 360) + 360) % 360), '51', f(((a1 % 360) + 360) % 360)]);
  }
  ellipse(layer, c, rx, ry, rot) {
    if (Math.abs(rx - ry) < 1e-6) return this.circle(layer, c, rx);
    const major = Math.max(rx, ry), ratio = Math.min(rx, ry) / major, ang = rot + (ry > rx ? Math.PI / 2 : 0), x = this.X(c.x), y = this.Y(c.y);
    this.grow(x - major, y - major); this.grow(x + major, y + major);
    this.ent('ELLIPSE', layer, 'AcDbEllipse', ['10', f(x), '20', f(y), '30', '0', '11', f(Math.cos(ang) * major), '21', f(Math.sin(ang) * major), '31', '0', '210', '0', '220', '0', '230', '1', '40', f(ratio), '41', '0', '42', '6.283185307179586']);
  }
  /** align: l|c|r أفقيًا؛ النص متمركز رأسيًا (middle). rot بالدرجات. */
  text(layer, p, h, str, { align = 'c', rot = 0 } = {}) {
    const s = dxfText(str); if (!s.trim()) return;
    const x = this.X(p.x), y = this.Y(p.y), w = String(str).length * h * .6; this.grow(x - (align === 'l' ? 0 : align === 'c' ? w / 2 : w), y - h); this.grow(x + (align === 'r' ? 0 : align === 'c' ? w / 2 : w), y + h);
    this.ent('TEXT', layer, 'AcDbText', ['10', f(x), '20', f(y), '30', '0', '40', f(h), '1', s, '50', f(rot), '7', 'ARABIC', '72', align === 'l' ? '0' : align === 'c' ? '1' : '2', '11', f(x), '21', f(y), '31', '0', '100', 'AcDbText', '73', '2']);
  }
  toString() {
    const b = this.box || { x0: 0, y0: 0, x1: 10, y1: 10 }, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, vh = Math.max(1, (b.y1 - b.y0) * 1.05), asp = Math.max(1, (b.x1 - b.x0) / (b.y1 - b.y0 || 1));
    const out = ['999', 'Al-Mizan Al-Handasi engineer pack - units: metres - preliminary design, not for construction'];
    const hv = (name, ...pairs) => out.push('9', name, ...pairs.map(String));
    out.push('0', 'SECTION', '2', 'HEADER');
    hv('$ACADVER', 1, 'AC1015'); hv('$DWGCODEPAGE', 3, 'ANSI_1256'); hv('$INSBASE', 10, 0, 20, 0, 30, 0);
    hv('$EXTMIN', 10, f(b.x0), 20, f(b.y0), 30, 0); hv('$EXTMAX', 10, f(b.x1), 20, f(b.y1), 30, 0); hv('$LIMMIN', 10, f(b.x0), 20, f(b.y0)); hv('$LIMMAX', 10, f(b.x1), 20, f(b.y1));
    hv('$LTSCALE', 40, 1); hv('$TEXTSTYLE', 7, 'ARABIC'); hv('$CLAYER', 8, '0'); hv('$LUNITS', 70, 2); hv('$LUPREC', 70, 3); hv('$AUNITS', 70, 0); hv('$AUPREC', 70, 2);
    hv('$INSUNITS', 70, 6); hv('$MEASUREMENT', 70, 1); hv('$LWDISPLAY', 290, 1); hv('$HANDSEED', 5, (this.h + 16).toString(16).toUpperCase());
    out.push('0', 'ENDSEC', '0', 'SECTION', '2', 'CLASSES', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES');
    const table = (name, handle, n, extra = []) => out.push('0', 'TABLE', '2', name, '5', handle, '330', '0', '100', 'AcDbSymbolTable', '70', String(n), ...extra);
    const rec = (type, handle, owner, sub, body, hcode = '5') => out.push('0', type, hcode, handle, '330', owner, '100', 'AcDbSymbolTableRecord', '100', sub, ...body.map(String));
    table('VPORT', '8', 1);
    rec('VPORT', '29', '8', 'AcDbViewportTableRecord', ['2', '*ACTIVE', '70', 0, '10', 0, '20', 0, '11', 1, '21', 1, '12', f(cx), '22', f(cy), '13', 0, '23', 0, '14', 1, '24', 1, '15', 1, '25', 1, '16', 0, '26', 0, '36', 1, '17', 0, '27', 0, '37', 0, '40', f(vh), '41', f(asp), '42', 50, '43', 0, '44', 0, '50', 0, '51', 0, '71', 0, '72', 100, '73', 1, '74', 3, '75', 0, '76', 0, '77', 0, '78', 0]);
    out.push('0', 'ENDTAB');
    table('LTYPE', '5', 5);
    rec('LTYPE', '14', '5', 'AcDbLinetypeTableRecord', ['2', 'ByBlock', '70', 0, '3', '', '72', 65, '73', 0, '40', 0]);
    rec('LTYPE', '15', '5', 'AcDbLinetypeTableRecord', ['2', 'ByLayer', '70', 0, '3', '', '72', 65, '73', 0, '40', 0]);
    rec('LTYPE', '16', '5', 'AcDbLinetypeTableRecord', ['2', 'Continuous', '70', 0, '3', 'Solid line', '72', 65, '73', 0, '40', 0]);
    rec('LTYPE', '17', '5', 'AcDbLinetypeTableRecord', ['2', 'DASHED', '70', 0, '3', 'Dashed __ __ __', '72', 65, '73', 2, '40', .45, '49', .3, '74', 0, '49', -.15, '74', 0]);
    rec('LTYPE', '18', '5', 'AcDbLinetypeTableRecord', ['2', 'CENTER', '70', 0, '3', 'Center ____ _ ____', '72', 65, '73', 4, '40', 1.0, '49', .6, '74', 0, '49', -.15, '74', 0, '49', .1, '74', 0, '49', -.15, '74', 0]);
    out.push('0', 'ENDTAB');
    table('LAYER', '2', DXF_LAYERS.length + 1);
    rec('LAYER', '10', '2', 'AcDbLayerTableRecord', ['2', '0', '70', 0, '62', 7, '6', 'Continuous', '370', -3]);
    DXF_LAYERS.forEach((l, i) => rec('LAYER', (0x40 + i).toString(16).toUpperCase(), '2', 'AcDbLayerTableRecord', ['2', l.name, '70', 0, '62', l.color, '6', l.lt, '370', l.lw]));
    out.push('0', 'ENDTAB');
    table('STYLE', '3', 2);
    rec('STYLE', '11', '3', 'AcDbTextStyleTableRecord', ['2', 'Standard', '70', 0, '40', 0, '41', 1, '50', 0, '71', 0, '42', .2, '3', 'txt', '4', '']);
    rec('STYLE', '13', '3', 'AcDbTextStyleTableRecord', ['2', 'ARABIC', '70', 0, '40', 0, '41', 1, '50', 0, '71', 0, '42', .2, '3', 'arial.ttf', '4', '']);
    out.push('0', 'ENDTAB');
    table('VIEW', '6', 0); out.push('0', 'ENDTAB'); table('UCS', '7', 0); out.push('0', 'ENDTAB');
    table('APPID', '9', 1); rec('APPID', '12', '9', 'AcDbRegAppTableRecord', ['2', 'ACAD', '70', 0]); out.push('0', 'ENDTAB');
    table('DIMSTYLE', 'A', 1, ['100', 'AcDbDimStyleTable']); rec('DIMSTYLE', '27', 'A', 'AcDbDimStyleTableRecord', ['2', 'Standard', '70', 0], '105'); out.push('0', 'ENDTAB');
    table('BLOCK_RECORD', '1', 2);
    rec('BLOCK_RECORD', '1F', '1', 'AcDbBlockTableRecord', ['2', '*Model_Space']); rec('BLOCK_RECORD', '1B', '1', 'AcDbBlockTableRecord', ['2', '*Paper_Space']);
    out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'BLOCKS');
    const block = (name, hb, he, owner, paper) => out.push('0', 'BLOCK', '5', hb, '330', owner, '100', 'AcDbEntity', ...(paper ? ['67', '1'] : []), '8', '0', '100', 'AcDbBlockBegin', '2', name, '70', '0', '10', '0', '20', '0', '30', '0', '3', name, '1', '',
      '0', 'ENDBLK', '5', he, '330', owner, '100', 'AcDbEntity', ...(paper ? ['67', '1'] : []), '8', '0', '100', 'AcDbBlockEnd');
    block('*Model_Space', '20', '21', '1F', false); block('*Paper_Space', '1C', '1D', '1B', true);
    out.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...this.e, '0', 'ENDSEC', '0', 'SECTION', '2', 'OBJECTS',
      '0', 'DICTIONARY', '5', 'C', '330', '0', '100', 'AcDbDictionary', '281', '1', '3', 'ACAD_GROUP', '350', 'D',
      '0', 'DICTIONARY', '5', 'D', '330', 'C', '100', 'AcDbDictionary', '281', '1', '0', 'ENDSEC', '0', 'EOF');
    return out.join('\r\n') + '\r\n';
  }
}

const bboxOf = pts => { const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
/** أصل الإحداثيات: ركن الأرض الأدنى (جنوب غرب المستند)، أو ركن المبنى إن لم تُعرَّف أرض. */
export function dxfOrigin(doc) {
  const pts = doc.plot?.polygon?.length >= 3 ? doc.plot.polygon : doc.walls.flatMap(w => [w.a, w.b]);
  if (!pts.length) return { x: 0, y: 0 };
  const b = bboxOf(pts); return { x: b.x0, y: b.y0 };
}
const northVec = doc => { const a = -(Number(doc.north) || 0) * Math.PI / 180; return { x: Math.sin(a), y: Math.cos(a) }; };
const deg = v => Math.atan2(v.y, v.x) * 180 / Math.PI;

function northArrow(D, c, r, doc) {
  const n = northVec(doc), e = { x: n.y, y: -n.x };
  D.circle('A-ANNO-NRTH', c, r);
  D.poly('A-ANNO-NRTH', [add(c, mul(n, r * .85)), add(add(c, mul(n, -r * .6)), mul(e, r * .42)), add(c, mul(n, -r * .3)), add(add(c, mul(n, -r * .6)), mul(e, -r * .42))], true);
  D.text('A-ANNO-NRTH', add(c, mul(n, r * 1.35)), r * .5, 'N');
}
/** إطار A3 أفقي بمقياس يحتوي الرسم + شريط عنوان سفلي؛ كله على A-ANNO-TTLB بإحداثيات الملف (بعد الإزاحة). */
function titleBlock(D, info) {
  const b = D.box, w = b.x1 - b.x0, h = b.y1 - b.y0, STRIP = 30, M = 10;
  const scale = SCALES.find(s => w <= (420 - 2 * M - 10) * s / 1000 && h <= (297 - 2 * M - STRIP - 10) * s / 1000) || SCALES[SCALES.length - 1];
  const k = scale / 1000, FW = (420 - 2 * M) * k, FH = (297 - 2 * M) * k, sh = STRIP * k;
  const o = D.o, cx = (b.x0 + b.x1) / 2 + o.x, cy = (b.y0 + b.y1) / 2 + o.y; // إحداثيات المستند
  const x0 = cx - FW / 2, y0 = cy - (FH - sh) / 2 - sh, x1 = x0 + FW, y1 = y0 + FH, L = 'A-ANNO-TTLB';
  D.poly(L, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], true);
  D.poly(L, [{ x: x0 - M * k / 2, y: y0 - M * k / 2 }, { x: x1 + M * k / 2, y: y0 - M * k / 2 }, { x: x1 + M * k / 2, y: y1 + M * k / 2 }, { x: x0 - M * k / 2, y: y1 + M * k / 2 }], true);
  D.line(L, { x: x0, y: y0 + sh }, { x: x1, y: y0 + sh });
  const cols = [.30, .58, .80].map(t => x0 + FW * t); for (const x of cols) D.line(L, { x, y: y0 }, { x, y: y0 + sh });
  const mm = v => v * k, T = (x, yy, hmm, s, align = 'l') => D.text(L, { x, y: y0 + mm(yy) }, mm(hmm), s, { align });
  const p = mm(3);
  T(x0 + p, 23, 4.2, 'AL-MIZAN AL-HANDASI'); T(x0 + p, 15.5, 3.2, 'الميزان الهندسي — نحو منزلك'); T(x0 + p, 8.5, 2.2, DXF_DISCLAIMER_EN); T(x0 + p, 3.8, 2.2, DXF_DISCLAIMER_AR);
  T(cols[0] + p, 23, 3.6, info.titleEn); T(cols[0] + p, 15.5, 3.2, info.titleAr); T(cols[0] + p, 8.5, 2.4, 'PROJECT: ' + (info.projectLatin || '-')); T(cols[0] + p, 3.8, 2.4, info.project || '');
  T(cols[1] + p, 23, 3, `SCALE 1:${scale} @ A3`); T(cols[1] + p, 16.5, 2.3, 'UNITS: METRES (1 DWG UNIT = 1 m)'); T(cols[1] + p, 11, 2.3, 'ORIGIN 0,0 = ' + (info.hasPlot ? 'PLOT CORNER (SW OF DRAWING)' : 'BUILDING CORNER')); T(cols[1] + p, 5.5, 2.3, 'DATE: ' + (info.date || '-'));
  T(cols[2] + p, 22, 5, info.sheetNo || ''); T(cols[2] + p, 13, 2.2, 'REF: ' + (info.fingerprint || '-')); T(cols[2] + p, 7.5, 2.2, 'APPROVAL BY A LICENSED ENGINEERING OFFICE REQUIRED'); T(cols[2] + p, 3.2, 2.2, 'يلزم اعتماد مكتب هندسي مرخّص');
  return { scale, frame: { x0: x0 - o.x, y0: y0 - o.y, x1: x1 - o.x, y1: y1 - o.y } };
}

/** قطع الجدار في المسقط: أجزاء المقطع بين الفتحات (مضلعات مغلقة بالحواف المشطوفة عند الأركان). */
function wallRuns(seg) {
  const out = []; let cur = 0;
  for (const o of seg.openings) { if (o.x0 - cur > 1e-4) out.push(footprint(seg, cur, o.x0, cur <= 1e-4, false)); cur = o.x1; }
  if (seg.length - cur > 1e-4) out.push(footprint(seg, cur, seg.length, cur <= 1e-4, true));
  return out;
}
/** سور الحوش (في الدور الأرضي) على L-SITE؛ الدروة وحاجز التراس في الأدوار العليا جدران جزئية الارتفاع. */
const wallLayer = (seg, li = 0) => (seg.fence ? (seg.kind === 'fence' && li === 0 ? 'L-SITE' : 'A-WALL-PRHT') : seg.extL || seg.extR ? 'A-WALL-EXT' : 'A-WALL');

/**
 * مسقط دور واحد.
 * @param {object} doc
 * @param {{ levelId?, model?, analysis?, columns?: object[]|null, date?, fingerprint?, sheetNo?, projectLatin? }} [opts]
 * @returns {{ text: string, meta: object }}
 */
export function planDxf(doc, opts = {}) {
  const model = opts.model || buildingModel(doc), A = opts.analysis || analyzeDoc(doc);
  const li = Math.max(0, doc.levels.findIndex(l => l.id === (opts.levelId || doc.levels[0].id))), lvl = doc.levels[li], L = model.levels.find(x => x.id === lvl.id), lv = A.levelById.get(lvl.id);
  const D = new Dxf(dxfOrigin(doc)), codes = opts.codes || roomCodes(A), meta = { level: lvl.id, levelName: lvl.name, doors: 0, windows: 0, rooms: 0, roomArea: 0, wallPolys: 0, arcs: 0, dims: 0, columns: 0, stairs: 0, furniture: 0 };
  // الجدران
  for (const seg of L.solids.segments) for (const p of wallRuns(seg)) { D.poly(wallLayer(seg, li), p, true); meta.wallPolys++; }
  for (const j of L.solids.joints || []) { D.poly('A-WALL-EXT', j.poly, true); meta.wallPolys++; }
  // حدود الفراغات وأسماؤها
  for (const r of lv?.rooms || []) {
    if (!r.net || r.net.length < 3) continue;
    D.poly('A-AREA', r.net, true); meta.rooms++; meta.roomArea += r.area;
    if (r.unlabelled && r.area < 2) continue;
    const c = r.label?.seed || r.inside || r.centroid, k = r.area < 4 ? .62 : r.area < 9 ? .8 : 1, code = codes.get(lvl.id + '/' + r.id) || 'SPACE';
    D.text('A-AREA-IDEN', { x: c.x, y: c.y + .36 * k }, .26 * k, r.name);
    D.text('A-AREA-IDEN', { x: c.x, y: c.y }, .2 * k, code);
    D.text('A-AREA-IDEN', { x: c.x, y: c.y - .32 * k }, .2 * k, r.area.toFixed(2) + ' m2');
  }
  // الفتحات
  let dn = 0, wn = 0, entry = null;
  for (const seg of L.solids.segments) for (const o of seg.openings) {
    const P = (s, off) => add(add(seg.a, mul(seg.dir, s)), mul(seg.left, off)), hw = seg.t / 2;
    if (isWindowKind(o.kind)) {
      D.poly('A-GLAZ', [P(o.x0, -hw), P(o.x1, -hw), P(o.x1, hw), P(o.x0, hw)], true);
      for (const q of [-.35, .35]) D.line('A-GLAZ', P(o.x0, hw * q), P(o.x1, hw * q));
      D.text('A-GLAZ-IDEN', P(o.c, hw + .22), .14, 'W' + String(++wn).padStart(2, '0')); meta.windows++;
      continue;
    }
    if (!isDoorKind(o.kind)) continue;
    const swing = o.reversedSource ? (o.swing === 'out' ? 'in' : 'out') : o.swing;
    const secs = swingSectors({ o: { kind: o.kind, at: o.c, w: o.w, swing, hinge: o.hinge }, wall: { a: seg.a, b: seg.b } });
    for (const s of secs) {
      D.line('A-DOOR', s.hinge, add(s.hinge, mul(s.side, s.r)));
      const a0 = deg(s.closed), a1 = deg(s.side), ccw = s.closed.x * s.side.y - s.closed.y * s.side.x > 0;
      D.arc('A-DOOR', s.hinge, s.r, ccw ? a0 : a1, ccw ? a1 : a0); meta.arcs++;
    }
    if (!secs.length) {
      if (o.kind === 'slider') { D.line('A-DOOR', P(o.x0, hw * .35), P(o.c + .1, hw * .35)); D.line('A-DOOR', P(o.c - .1, -hw * .35), P(o.x1, -hw * .35)); }
      else if (o.kind === 'arch') { D.line('A-DOOR', P(o.x0, hw), P(o.x1, hw), 'DASHED'); D.line('A-DOOR', P(o.x0, -hw), P(o.x1, -hw), 'DASHED'); }
      else D.line('A-DOOR', P(o.x0, 0), P(o.x1, 0));
    }
    const side = swing === 'out' ? -1 : 1;
    D.text('A-DOOR-IDEN', P(o.c, -side * (hw + .22)), .14, 'D' + String(++dn).padStart(2, '0')); meta.doors++;
    if (o.entry && !entry) entry = { p: P(o.c, 0), out: mul(seg.left, -side), hw };
  }
  // الأعمدة المبدئية والمرسومة
  const cols = [...(opts.columns || []), ...doc.columns.filter(c => c.level === lvl.id && !(opts.columns || []).some(q => dist(q, c) < .5))];
  for (const c of cols) { const r = (c.size || .3) / 2; D.poly('S-COLS', [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }], true); meta.columns++; }
  // الدرج
  for (const s of doc.stairs.filter(x => x.level === lvl.id)) {
    const info = stairInfo(s, lvl.height || 3.2);
    for (const t of [...info.treads, ...info.landings]) D.poly('A-FLOR-STRS', t.poly, true);
    const a = info.arrow.from, c = info.arrow.to, u = norm(sub(c, a)), n = perp(u);
    D.line('A-FLOR-STRS', a, c); D.poly('A-FLOR-STRS', [c, add(sub(c, mul(u, .3)), mul(n, .12)), sub(sub(c, mul(u, .3)), mul(n, .12))], true);
    const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    D.text('A-FLOR-STRS', add(m, mul(n, .2)), .16, `UP ${info.N}R`); D.text('A-FLOR-STRS', add(m, mul(n, -.2)), .16, info.text); meta.stairs++;
  }
  const below = doc.levels[li - 1];
  if (below) for (const s of doc.stairs.filter(x => x.level === below.id)) {
    const info = stairInfo(s, below.height || 3.2), b = bboxOf([...info.treads, ...info.landings].flatMap(t => t.poly));
    D.poly('A-FLOR-STRS', [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }], true, 'DASHED');
    D.text('A-FLOR-STRS', { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 + .16 }, .16, `STAIR VOID - DN ${info.N}R`); D.text('A-FLOR-STRS', { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 - .16 }, .16, `فتحة السلم · هبوط ${info.N} قائمة`);
  }
  // الأثاث (قطع الحوش تُرسم في ملف الموقع العام)
  for (const fx of doc.fixtures) { if (fx.level !== lvl.id || isOutdoorKind(fx.kind)) continue; drawFixture(D, 'A-FURN', fx); meta.furniture++; }
  // نصوص وأبعاد المستخدم
  for (const t of doc.texts.filter(x => x.level === lvl.id)) D.text('A-ANNO-TEXT', t.at, t.size || .3, t.text, { rot: -(t.rot || 0) * 180 / Math.PI });
  for (const d of doc.dimensions.filter(x => x.level === lvl.id)) {
    const len = dist(d.a, d.b); if (len < .05) continue;
    const u = norm(sub(d.b, d.a)), n = perp(u), off = d.offset ?? .5, a = add(d.a, mul(n, off)), c = add(d.b, mul(n, off)), sg = Math.sign(off) || 1;
    D.line('A-ANNO-DIMS', a, c); for (const [p, q] of [[d.a, a], [d.b, c]]) { D.line('A-ANNO-DIMS', add(p, mul(n, sg * .1)), add(q, mul(n, sg * .12))); D.line('A-ANNO-DIMS', add(q, mul(add(u, n), -.08)), add(q, mul(add(u, n), .08))); }
    let r = deg(u); if (r > 90 || r <= -90) r += 180;
    D.text('A-ANNO-DIMS', add(mul(add(a, c), .5), mul(n, sg * .16)), .15, fmtDim(len), { rot: r }); meta.dims++;
  }
  // سلاسل الأبعاد الخارجية: ثلاثة مستويات لكل جهة (فتحات، جدران، إجمالي)
  const OFF = i => .9 + .7 * i, far = { n: 0, s: 0, e: 0, w: 0 };
  for (const side of lv?.analysis ? dimensionChains(doc, lvl.id, lv.analysis) : []) {
    const vert = side.axis === 'y', sg = side.sign;
    const pt = (along, across) => (vert ? { x: across, y: along } : { x: along, y: across });
    side.chains.forEach((c, i) => {
      const at = side.extent + sg * OFF(i), t0 = c.ticks[0].pos, t1 = c.ticks[c.ticks.length - 1].pos;
      D.line('A-ANNO-DIMS', pt(t0, at), pt(t1, at));
      for (const t of c.ticks) { D.line('A-ANNO-DIMS', pt(t.pos, t.face + sg * .15), pt(t.pos, at + sg * .12)); D.line('A-ANNO-DIMS', pt(t.pos - .08, at - .08), pt(t.pos + .08, at + .08)); }
      let run = 0;
      for (const s of c.segments) { const short = Math.abs(s.b - s.a) < .55; run = short ? run + 1 : 0; D.text('A-ANNO-DIMS', pt((s.a + s.b) / 2, at + sg * (.17 + (short ? .2 * (run % 2) : 0))), short ? .12 : .16, fmtDim(s.len), { rot: vert ? 90 : 0 }); meta.dims++; }
      far[side.side] = Math.max(far[side.side], OFF(i));
    });
  }
  // وسم المدخل الرئيسي: خارج الباب وبعد سلاسل الأبعاد حتى لا يتراكب معها
  if (entry) { const off = entry.hw + Math.max(far.n, far.s, far.e, far.w) + 1.1, c = add(entry.p, mul(entry.out, off)); D.text('A-ANNO-TEXT', { x: c.x, y: c.y + .2 }, .22, 'MAIN ENTRANCE  +/-0.00'); D.text('A-ANNO-TEXT', { x: c.x, y: c.y - .2 }, .22, 'المدخل الرئيسي'); }
  // المحاور
  const ob = (lv?.analysis?.outlines || []).flatMap(o => o.polygon || []);
  if (ob.length) {
    const b = bboxOf(ob), ax = gridAxes(doc, lvl.id, { columns: opts.columns || null, analysis: lv.analysis }), R = .32;
    const top = b.y1 + far.n + .9, left = b.x0 - far.w - .9, bot = b.y0 - far.s - (entry ? 1.9 : .3), right = b.x1 + far.e + .3;
    for (const a of ax.x) { D.line('S-GRID', { x: a.pos, y: top }, { x: a.pos, y: bot }); D.circle('S-GRID', { x: a.pos, y: top + R }, R); D.text('S-GRID', { x: a.pos, y: top + R }, .26, a.label); }
    for (const a of ax.y) { D.line('S-GRID', { x: left, y: a.pos }, { x: right, y: a.pos }); D.circle('S-GRID', { x: left - R, y: a.pos }, R); D.text('S-GRID', { x: left - R, y: a.pos }, .26, a.label); }
    northArrow(D, { x: b.x1 + far.e + 1.9, y: b.y1 + far.n + 1.2 }, .6, doc);
  }
  const tb = titleBlock(D, { titleEn: LEVEL_EN[li] || `FLOOR ${li + 1} PLAN`, titleAr: 'مسقط ' + lvl.name, project: doc.title, projectLatin: opts.projectLatin, date: opts.date, fingerprint: opts.fingerprint, sheetNo: opts.sheetNo || 'A-' + String(li + 1).padStart(2, '0'), hasPlot: doc.plot?.polygon?.length >= 3 });
  meta.scale = tb.scale; meta.extents = D.box; meta.layers = { ...D.count }; meta.roomArea = Math.round(meta.roomArea * 1000) / 1000;
  return { text: D.toString(), meta };
}

function drawFixture(D, layer, fx) {
  const sym = fixtureSymbol(fx);
  if (sym.outline) D.poly(layer, sym.outline, true);
  for (const r of sym.rects) D.poly(layer, r, true);
  for (const [a, c] of sym.lines) D.line(layer, a, c);
  for (const e of sym.ellipses) D.ellipse(layer, e.c, e.rx, e.ry, e.rot || 0);
}

/** مخطط الموقع العام: حدود الأرض وأطوال أضلاعها، خطوط الارتداد المُدخلة، أثر المبنى، الأسوار، قطع الحوش، الشوارع، الشمال. */
export function siteDxf(doc, opts = {}) {
  const model = opts.model || buildingModel(doc), S = siteModel(doc, { model }), D = new Dxf(dxfOrigin(doc));
  const meta = { plot: !!S.plot, plotArea: S.areas.plot, footprint: S.areas.footprint, coverage: S.areas.coverage, setbackLine: false, siteElements: 0, wallPolys: 0 };
  if (S.plot) {
    D.poly('C-PROP', S.plot, true);
    for (const e of S.edges) {
      const m = mul(add(e.a, e.b), .5), u = norm(sub(e.b, e.a)); let r = deg(u); if (r > 90 || r <= -90) r += 180;
      D.text('C-PROP', add(m, mul(e.out, .45)), .3, fmtDim(e.length), { rot: r });
      if (e.street) { D.text('A-ANNO-TEXT', add(m, mul(e.out, 2.2)), .45, 'STREET', { rot: r }); D.text('A-ANNO-TEXT', add(m, mul(e.out, 3.1)), .45, 'شارع' + (S.streetWidth ? ` ${S.streetWidth} م` : ''), { rot: r }); }
      if (e.required !== null && e.required !== undefined) D.text('C-BLDG-SETB', add(m, mul(e.out, -(e.required + .3))), .2, 'SETBACK ' + fmtDim(e.required), { rot: r });
    }
    if (doc.plot?.setbacks) { const line = insetPolygon(S.plot, S.edges.map(e => e.required ?? 0)); if (line) { D.poly('C-BLDG-SETB', line, true); meta.setbackLine = true; } }
  }
  const L1 = model.levels[0];
  for (const seg of L1.solids.segments) { if (seg.fence || seg.extL || seg.extR) { D.poly(wallLayer(seg), seg.quad, true); meta.wallPolys++; } }
  for (const L of model.levels.slice(1)) {
    for (const o of L.analysis.outlines || []) if (o.polygon?.length >= 3) D.poly('A-FLOR-OTLN', o.polygon, true);
  }
  const bpts = L1.solids.segments.filter(s => !s.fence).flatMap(s => s.quad);
  if (bpts.length) { const b = bboxOf(bpts), c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; D.text('A-ANNO-TEXT', { x: c.x, y: c.y + .4 }, .4, 'BUILDING - ' + model.levels.length + ' FLOOR' + (model.levels.length > 1 ? 'S' : '')); D.text('A-ANNO-TEXT', { x: c.x, y: c.y - .4 }, .4, 'المبنى — ' + model.levels.length + ' دور'); }
  for (const fx of doc.fixtures) {
    if (!isOutdoorKind(fx.kind)) continue;
    drawFixture(D, 'L-SITE', fx); meta.siteElements++;
    if (fx.kind === 'tree') continue;
    D.text('L-SITE', { x: fx.x, y: fx.y + .22 }, .22, FIXTURE_CODE[fx.kind] || fx.kind.toUpperCase()); D.text('L-SITE', { x: fx.x, y: fx.y - .22 }, .22, FIXTURE_AR[fx.kind] || fx.kind);
  }
  for (const e of S.entries.filter(x => x.level === L1.id).slice(0, 1)) D.text('A-ANNO-TEXT', { x: e.p.x, y: e.p.y - .9 }, .26, 'MAIN ENTRANCE');
  const all = [...(S.plot || []), ...bpts], b = all.length ? bboxOf(all) : { x0: 0, y0: 0, x1: 10, y1: 10 };
  northArrow(D, { x: b.x1 + 2.2, y: b.y1 - 1 }, .8, doc);
  const n2 = v => (v === null || v === undefined ? '-' : v.toFixed(2)), tx = b.x1 + 1.2; let ty = b.y1 - 3.4;
  for (const s of [`PLOT AREA: ${n2(S.areas.plot)} m2`, `BUILDING FOOTPRINT: ${n2(S.areas.footprint)} m2`, `COVERAGE: ${S.areas.coverage === null ? '-' : (S.areas.coverage * 100).toFixed(1) + ' %'} (INFO ONLY)`]) { D.text('A-ANNO-TEXT', { x: tx, y: ty }, .24, s, { align: 'l' }); ty -= .5; }
  const tb = titleBlock(D, { titleEn: 'SITE PLAN', titleAr: 'مخطط الموقع العام', project: doc.title, projectLatin: opts.projectLatin, date: opts.date, fingerprint: opts.fingerprint, sheetNo: opts.sheetNo || 'A-00', hasPlot: !!S.plot });
  meta.scale = tb.scale; meta.extents = D.box; meta.layers = { ...D.count };
  return { text: D.toString(), meta };
}

/**
 * كل ملفات DXF للمشروع: الموقع العام (إن وُجدت أرض أو مبنى) ثم ملف لكل دور له جدران.
 * الواجهات والقطاع غير مشمولة: لوحاتها تُرسم بترتيب «الرسام» (الأقرب يغطي الأبعد) لا بإزالة خطوط مخفية، فتحويلها إلى خطوط CAD
 * نظيفة غير متاح بعد؛ تُسلَّم متجهةً بصيغة SVG.
 * @returns {{ name: string, titleAr: string, sheetNo: string, text: string, meta: object }[]}
 */
export function dxfSet(doc, opts = {}) {
  const model = opts.model || buildingModel(doc), analysis = analyzeDoc(doc), codes = roomCodes(analysis), base = { model, analysis, codes, date: opts.date, fingerprint: opts.fingerprint, projectLatin: opts.projectLatin };
  const out = [];
  { const s = siteDxf(doc, { ...base, sheetNo: 'A-00' }); out.push({ name: 'A-00-SITE-PLAN.dxf', titleAr: 'مخطط الموقع العام', sheetNo: 'A-00', ...s }); }
  doc.levels.forEach((lv, i) => {
    if (!doc.walls.some(w => w.level === lv.id)) return;
    const no = 'A-' + String(i + 1).padStart(2, '0'), p = planDxf(doc, { ...base, levelId: lv.id, sheetNo: no, columns: opts.structure?.levels?.find(x => x.id === lv.id)?.columns || null });
    out.push({ name: `${no}-${(LEVEL_EN[i] || `FLOOR-${i + 1}-PLAN`).replace(/\s+/g, '-')}.dxf`, titleAr: 'مسقط ' + lv.name, sheetNo: no, ...p });
  });
  return out;
}
export default { DXF_LAYERS, dxfText, roomCodes, dxfOrigin, planDxf, siteDxf, dxfSet, DXF_DISCLAIMER_AR, DXF_DISCLAIMER_EN };
