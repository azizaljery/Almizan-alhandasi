// (الجولة 21 — 02c، قرار المالك 2026-10-26 ثانيًا) حكم الخصوصية لكل فراغ على حدة وفق درجة الخصوصية المطلوبة له، لا بنتيجة الصالة وحدها.
// الدرجات قيم تصميمية افتراضية للميزان (غير نظامية): A عالية (غرف النوم والرئيسية ومجلس النساء والصالة العائلية): لا خط رؤية مكشوفًا من
// المواقف عبر أي نافذة جلستها دون مستوى العين؛ B متوسطة (مجلس الرجال والطعام والمطبخ): تُقاس وتُذكر ولا ترسّب؛ C منخفضة (المداخل والممرات
// ودورات المياه والخدمة): تُقاس وتُذكر ولا ترسّب. خطوط الرؤية ثنائية الأبعاد بأربع تركيبات ارتفاع عين (privacy-gate.mjs). لا اعتماد معماريًا.
import { analyzeDoc } from './draw/digest.mjs';
import { windowExposure, SCREEN_DEFAULTS } from './privacy-gate.mjs';

export const PRIVACY_DEGREES = Object.freeze({ A: 'عالية', B: 'متوسطة', C: 'منخفضة', source: 'قيم تصميمية افتراضية للميزان — غير نظامية وغير متحققة من كود أو بلدية' });
const FAMILY_HALL = r => r.type === 'living' && !/الضيوف|الطعام|مغاسل/.test(r.name || '');
export function degreeOf(room) {
  if (['bedroom', 'master'].includes(room.type) || (room.type === 'majlis' && /النساء/.test(room.name || '')) || FAMILY_HALL(room)) return 'A';
  if (['majlis', 'dining', 'kitchen'].includes(room.type) || room.type === 'living') return 'B';
  return 'C';
}
/** @returns {{spaces:object[], passed:boolean, failing:string[], defaults:object}} لا يعدّل المستند. */
export function spacePrivacy(doc, { levelId } = {}) {
  const model = analyzeDoc(doc), spaces = new Map(), failing = [];
  for (const lv of model.levels) {
    if (levelId && lv.level.id !== levelId) continue;
    const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === lv.level.id);
    for (const op of lv.openings.filter(o => o.window)) for (const side of op.sides.filter(s => s.other === 'outside')) {
      const room = side.room, key = room.id, sill = op.o?.sill ?? 0;
      const sp = spaces.get(key) || { space: room.name, roomId: room.id, type: room.type, degree: degreeOf(room), windows: [], exposedLines: 0, minDistance: null };
      let exposedLines = 0, minDistance = null, samples = 0;
      if (bays.length && sill < SCREEN_DEFAULTS.eyeHeight) { const e = windowExposure(doc, lv, op, side, bays); exposedLines = e.paths.length; samples = e.samples; if (e.paths.length) minDistance = Math.round(Math.min(...e.paths.map(p => Math.hypot(p.outside.x - p.windowHit.x, p.outside.y - p.windowHit.y))) * 100) / 100; }
      sp.windows.push({ opening: op.id, sill, exposedLines, minDistance, samples, byHeight: sill >= SCREEN_DEFAULTS.eyeHeight ? 'جلسة ≥ مستوى العين: لا تُكشف بنموذج العيون' : null });
      sp.exposedLines += exposedLines; if (minDistance !== null && (sp.minDistance === null || minDistance < sp.minDistance)) sp.minDistance = minDistance;
      spaces.set(key, sp);
    }
  }
  const list = [...spaces.values()].map(sp => {
    const fail = sp.degree === 'A' && sp.exposedLines > 0;
    const verdict = fail ? 'fail' : sp.exposedLines > 0 ? 'noted' : 'pass';
    const basis = fail ? `درجة ${PRIVACY_DEGREES[sp.degree]}: ${sp.exposedLines} خط رؤية مكشوف من المواقف (أقرب ${sp.minDistance} م)` : sp.exposedLines ? `درجة ${PRIVACY_DEGREES[sp.degree]}: ${sp.exposedLines} خط رؤية مكشوف يُذكر ولا يرسّب (الدرجة لا تشترط حجبًا)` : 'لا خط رؤية مكشوف';
    if (fail) failing.push(`«${sp.space}»: ${basis}`);
    return { ...sp, degreeLabel: PRIVACY_DEGREES[sp.degree], verdict, basis };
  });
  return { spaces: list, passed: failing.length === 0, failing, defaults: PRIVACY_DEGREES, model: 'خطوط رؤية ثنائية الأبعاد بأربع تركيبات ارتفاع عين (جالس/واقف خارجًا وداخلًا)' };
}
export default { PRIVACY_DEGREES, degreeOf, spacePrivacy };
