// ربط حزمة واجهات الميزان (dist/facade-kit) بمستند التصميم الفعلي للموقع. للتطوير على فرع العينة؛ لا اعتماد ولا نشر.
// القواعد كلها مشتقة من المستند: جهة المدخل doc.entry، وحدّ البروز من ارتدادات القطعة doc.plot.setbacks ومحيط الجدران.
import { buildAllSides, sideTransform, planBounds } from './facade-realism/model.mjs';
import { validateDoc } from './draw/doc.mjs';
import { connectMizanFacadeAgent } from './facade-kit/integration/mizan-adapter.mjs';
export const SITE_REVISION = 'dev/facade-realism-sample@2bbe9af'; // يُحدَّث عند كل إيداع يُختبر
export const MAX_PROJECTION_CAP_M = 2; // سقف الحزمة نفسها (number(..., 0, 2))

/** (معلوماتي فقط، لا يغذّي التوليد) حدّ البروز لكل جهة = المسافة بين وجه المبنى وخط القطعة ناقص الارتداد، ضمن [0، السقف]. اشتقاق هندسي من المستند، وليس حكمًا نظاميًا. */
export function projectionBudgets(doc) {
  const B = planBounds(doc), S = B.setbacks || {}, pts = (doc.walls || []).filter(w => w.level === (doc.levels?.[0]?.id)).flatMap(w => [w.a, w.b]);
  if (!pts.length || !Number.isFinite(B.minX)) return { s: 0, n: 0, e: 0, w: 0, basis: 'لا جدران أو لا قطعة في المستند: صفر احتياطًا' };
  const f = { minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)) };
  const gap = { s: f.minY - B.minY, n: B.maxY - f.maxY, w: f.minX - B.minX, e: B.maxX - f.maxX };
  const r = {}; for (const k of ['s', 'n', 'e', 'w']) r[k] = Math.round(Math.max(0, Math.min(MAX_PROJECTION_CAP_M, gap[k] - (S[k] ?? 0))) * 1000) / 1000;
  return r;
}
/** الواجهة الأمامية: doc.entry إن كان إحدى الجهات الأربع، وإلا يُرفض التوليد (لا افتراض). */
export const frontSideOf = doc => ['s', 'n', 'e', 'w'].includes(doc.entry) ? doc.entry : null;

/** getDocument: دالة ترجع مستند الموقع الحالي (كائن mizan-draw). */
export function connectSiteFacade({ getDocument }) {
  return connectMizanFacadeAgent({
    getDocument, buildAllSides, sideTransform, validateDoc,
    getFacadeOptions: doc => {
      const front = frontSideOf(doc); if (!front) throw new Error('FRONT_SIDE_UNKNOWN: doc.entry غير محدد');
      // (قرار المالك 2026-11-04) البروزات الجديدة متوقفة في الجهات الأربع: الصفر ليس حدًا نظاميًا، وprojectionBudgets مرجع معلوماتي فقط ولا يُستعمل في التوليد.
      return { frontSide: front, maxProjectionM: { s: 0, n: 0, e: 0, w: 0 }, roofSurfaces: [], sourceRevision: SITE_REVISION, stone: { widthM: .6, heightM: .3, jointM: .008, recessM: .012 } };
    },
  });
}
