// المنطقة المناخية للفراغات: من doc.north وجهات الجدران الخارجية لكل فراغ (مستند mizan-draw/1).
//  - التصنيف الحراري لكل جهة يُعاد استعماله من facade-j/facade-realism/solar.mjs (analyzeSolar) بتمرير اتجاه الجدار
//    الحقيقي كـ north مع الجهة 'n' (اتجاه +y) فتُصنَّف أي زاوية بالجدول نفسه (0 شمال … 5 غرب).
//  - يقيس: نسبة الزجاج على الجهات الحارة (الغرب والجنوب الغربي والجنوب)، الفراغات طويلة الإشغال على الواجهات الحارة
//    بنوافذ بلا تظليل (التظليل غير ممثَّل في المسقط فيُفترض غيابه)، والمطبخ وغرف الخدمة كحاجز حراري على الغرب.
//  - الدرجة 0-100 بأوزان وعتبات تقديرية غير معايرة (THRESHOLDS). نقي: لا DOM.
import { analyzeDoc } from '../draw/digest.mjs';
import { analyzeSolar } from '../facade-j/facade-realism/solar.mjs';
import { ROOM_TYPES } from '../draw/catalog.mjs';

export const CLIMATE_VERSION = 'climate-zoning/1';
export const CLIMATE_NOTE = 'تصنيف حراري هندسي عام لمناخ السعودية (جدول solar.mjs)؛ ليس محاكاة طاقة ولا اشتراطًا في كود. الأوزان والعتبات تقديرية غير معايرة.';

/** عتبات وأوزان تقديرية غير معايرة. */
export const THRESHOLDS = Object.freeze({
  weights: { hotGlass: 40, longOccupancy: 40, westBuffer: 20 },
  hotLevel: 3,           // مستوى solar.mjs الذي يبدأ منه «حار» (جنوب=3، جنوب غرب=4، غرب=5، شمال غرب=3)
  criticalLevel: 4,      // جنوب غرب والغرب: الواجهات التي تُعدّ «غربية» للحاجز الحراري والإشغال الطويل
  glassRatioLimit: 0.10, // زجاج على جهة حارة / مساحة الأرضية؛ فوقه يُقترح تصغير الفتحة
  minHotLength: 1.0,     // م: أقل طول لجدار خارجي حار يُحسب
});
const LONG_OCCUPANCY = new Set(['bedroom', 'master', 'living', 'majlis', 'office']);
const BUFFER = new Set(['kitchen', 'laundry', 'storage', 'service', 'bath', 'stairs', 'garage', 'corridor']);
const r2 = v => Math.round(v * 100) / 100;

/** تصنيف اتجاه حقيقي (درجات من الشمال الحقيقي) بجدول solar.mjs نفسه. */
export function classifyBearing(bearing) {
  const s = analyzeSolar({ entry: 'n', north: bearing }); // 'n' = +y فيصبح الاتجاه = north
  return { bearing: Math.round(((bearing % 360) + 360) % 360), compass: s.compass, risk: s.risk, level: s.level, note: s.note };
}
const bearingOfVec = (v, north) => ((Math.atan2(v.x, v.y) * 180 / Math.PI + (Number(north) || 0)) % 360 + 360) % 360;

/**
 * @param {object} doc مستند mizan-draw/1
 * @returns {{ score:number|null, criteria:object[], rooms:object[], facades:object[], recommendations:object[], note:string, version:string }}
 */
export function climateZoning(doc, options = {}) {
  const model = options.model || analyzeDoc(doc);
  const north = Number(doc.north) || 0;
  const T = THRESHOLDS, W = T.weights;
  const rooms = [], recommendations = [];
  const facadeLen = {}; // compass -> { length, bufferLength }
  for (const lv of model.levels) {
    for (const room of lv.rooms) {
      if (room.unlabelled) continue;
      // الجدران الخارجية للفراغ بتصنيفها الحراري
      const walls = [];
      for (const e of room.edges) {
        if (!e.exterior || e.length < T.minHotLength) continue;
        const c = classifyBearing(bearingOfVec(e.out, north));
        walls.push({ ...c, length: r2(e.length), wallIds: e.wallIds });
        const f = (facadeLen[c.compass] ||= { compass: c.compass, level: c.level, length: 0, bufferLength: 0 });
        f.length += e.length; if (BUFFER.has(room.type)) f.bufferLength += e.length;
      }
      // الزجاج (نوافذ وأبواب زجاجية منزلقة) على الجدران الخارجية للفراغ
      const glass = [];
      for (const op of lv.openings) {
        if (!(op.window || op.kind === 'slider')) continue;
        const side = op.sides.find(s => s.room.id === room.id && s.exterior);
        if (!side) continue;
        const c = classifyBearing(bearingOfVec(side.outward, north));
        glass.push({ id: op.id, kind: op.kind, area: r2(op.area), ...c });
      }
      const glassTotal = glass.reduce((s, g) => s + g.area, 0);
      const glassHot = glass.filter(g => g.level >= T.hotLevel).reduce((s, g) => s + g.area, 0);
      const glassWest = glass.filter(g => g.level >= T.criticalLevel).reduce((s, g) => s + g.area, 0);
      const glassSouth = glass.filter(g => g.compass === 'جنوب').reduce((s, g) => s + g.area, 0);
      const hotWalls = walls.filter(w => w.level >= T.criticalLevel);
      const longOcc = LONG_OCCUPANCY.has(room.type);
      const worst = walls.reduce((m, w) => (!m || w.level > m.level ? w : m), null);
      const rec = {
        id: room.id, name: room.name, type: room.type, typeName: ROOM_TYPES[room.type]?.ar || room.type, level: lv.level.id, area: r2(room.area),
        longOccupancy: longOcc, buffer: BUFFER.has(room.type), walls, glass,
        glassTotal: r2(glassTotal), glassHot: r2(glassHot), glassWest: r2(glassWest), glassSouth: r2(glassSouth),
        hotGlassRatio: room.area > 0 ? r2(glassHot / room.area) : 0, worst: worst ? worst.compass : null, worstLevel: worst ? worst.level : null,
        exposed: longOcc && hotWalls.length > 0 && glassWest > 0, // فراغ طويل الإشغال على واجهة غربية بزجاج بلا تظليل
        status: 'ok', advice: [],
      };
      if (rec.exposed) {
        rec.status = 'hot';
        rec.advice.push({ kind: 'screen', text: `ساتر مثقب/مشربية أو لوفرات رأسية على نوافذ ${room.name} الغربية (${r2(glassWest)} م²).` });
        if (rec.hotGlassRatio > T.glassRatioLimit) rec.advice.push({ kind: 'shrink', text: `تصغير زجاج ${room.name} على الجهة الحارة من ${r2(glassHot)} م² إلى نحو ${r2(room.area * T.glassRatioLimit)} م² (${Math.round(T.glassRatioLimit * 100)}٪ من الأرضية، عتبة تقديرية).` });
        rec.advice.push({ kind: 'move', text: `نقل ${room.name} إلى واجهة شمالية/شرقية وتبديلها بفراغ خدمي مماثل المساحة.` });
      } else if (longOcc && glassHot > 0 && rec.hotGlassRatio > T.glassRatioLimit) {
        rec.status = 'warm';
        rec.advice.push({ kind: 'shade', text: `حاجب أفقي عميق (كابولي) فوق نوافذ ${room.name} ${worst?.compass ? 'جهة ' + worst.compass : ''}؛ نسبة الزجاج الحار ${Math.round(rec.hotGlassRatio * 100)}٪ من الأرضية.` });
      } else if (BUFFER.has(room.type) && hotWalls.length) {
        rec.status = 'buffer';
      }
      for (const a of rec.advice) recommendations.push({ room: room.name, ...a });
      rooms.push(rec);
    }
  }
  const criteria = [];
  const addCriterion = (id, label, weight, earned, details) => criteria.push({ id, label, weight, earned, status: earned === null ? 'na' : earned >= weight - 1e-9 ? 'ok' : 'violation', details });
  // 1) حصة الزجاج الحار من كل الزجاج، موزونة بالمستوى (غرب=5 أثقل من جنوب=3)
  const allGlass = rooms.flatMap(r => r.glass);
  const total = allGlass.reduce((s, g) => s + g.area, 0);
  if (!total) addCriterion('hotGlass', 'الزجاج بعيد عن الغرب والجنوب', W.hotGlass, null, 'لا نوافذ خارجية مرسومة.');
  else {
    const weighted = allGlass.reduce((s, g) => s + g.area * (g.level >= T.hotLevel ? g.level / 5 : 0), 0) / total; // 0..1
    const west = r2(allGlass.filter(g => g.level >= T.criticalLevel).reduce((s, g) => s + g.area, 0)), south = r2(allGlass.filter(g => g.compass === 'جنوب').reduce((s, g) => s + g.area, 0));
    addCriterion('hotGlass', 'الزجاج بعيد عن الغرب والجنوب', W.hotGlass, r2(W.hotGlass * (1 - weighted)), `إجمالي الزجاج ${r2(total)} م²: على الغرب/الجنوب الغربي ${west} م² (${Math.round(west / total * 100)}٪) وعلى الجنوب ${south} م² (${Math.round(south / total * 100)}٪).`);
  }
  // 2) الفراغات طويلة الإشغال ليست على واجهة غربية بزجاج بلا تظليل
  const occ = rooms.filter(r => r.longOccupancy);
  if (!occ.length) addCriterion('longOccupancy', 'غرف النوم والمعيشة بعيدة عن الواجهات الحارة', W.longOccupancy, null, 'لا فراغات طويلة الإشغال مسمّاة.');
  else {
    const bad = occ.filter(r => r.exposed);
    addCriterion('longOccupancy', 'غرف النوم والمعيشة بعيدة عن الواجهات الحارة', W.longOccupancy, r2(W.longOccupancy * (occ.length - bad.length) / occ.length), bad.length ? `${bad.length} من ${occ.length}: ${bad.map(r => `${r.name} (${r.worst}، زجاج ${r.glassWest} م²)`).join('، ')}.` : `كل الفراغات طويلة الإشغال (${occ.length}) بلا زجاج غربي.`);
  }
  // 3) المطبخ وغرف الخدمة حاجز حراري على الغرب
  const westFacades = Object.values(facadeLen).filter(f => f.level >= T.criticalLevel);
  const westLen = westFacades.reduce((s, f) => s + f.length, 0), bufLen = westFacades.reduce((s, f) => s + f.bufferLength, 0);
  if (westLen < T.minHotLength) addCriterion('westBuffer', 'الخدمات حاجز حراري على الغرب', W.westBuffer, null, 'لا جدران خارجية غربية/جنوبية غربية في المسقط.');
  else addCriterion('westBuffer', 'الخدمات حاجز حراري على الغرب', W.westBuffer, r2(W.westBuffer * bufLen / westLen), `${Math.round(bufLen / westLen * 100)}٪ من طول الواجهة الغربية (${r2(westLen)} م) يشغله مطبخ أو خدمات أو دورات مياه.`);
  if (westLen >= T.minHotLength && bufLen / westLen < 0.5) {
    const order = ['kitchen', 'laundry', 'storage', 'service', 'garage', 'bath'];
    const cand = rooms.filter(r => order.includes(r.type) && !r.walls.some(w => w.level >= T.criticalLevel)).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).map(r => r.name).slice(0, 3);
    recommendations.push({ room: null, kind: 'buffer', text: `زيادة الحاجز الحراري على الغرب: ${cand.length ? 'نقل ' + cand.join(' أو ') + ' إلى الواجهة الغربية' : 'وضع المطبخ أو الغسيل أو دورات المياه على الواجهة الغربية'} بدل الفراغات المأهولة.` });
  }
  const applicable = criteria.filter(c => c.earned !== null);
  const totalW = applicable.reduce((s, c) => s + c.weight, 0), totalE = applicable.reduce((s, c) => s + c.earned, 0);
  return { version: CLIMATE_VERSION, north, score: totalW ? Math.round(totalE / totalW * 100) : null, criteria, rooms, facades: Object.values(facadeLen).map(f => ({ ...f, length: r2(f.length), bufferLength: r2(f.bufferLength) })), recommendations, note: CLIMATE_NOTE };
}

export default { CLIMATE_VERSION, CLIMATE_NOTE, THRESHOLDS, classifyBearing, climateZoning };
