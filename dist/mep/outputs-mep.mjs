// الأنظمة الهندسية لصفحة المخرجات: تُحسب من المخطط الذي تعرضه صفحة المخرجات نفسه (مخطط المرسم المحفوظ، أي المصدر
// STUDIO-… في listSources)، بالمسار نفسه الذي تستخدمه صفحة الأنظمة: الربط بالمصدر نفسه ثم المدخلات المحفوظة في صفحة
// الأنظمة إن وُجدت (تعديلات المستخدم) وإلا المدخلات المولّدة من المخطط. وحدة نقية بلا DOM.
import { listSources, bindArchitecture, computeSystems, loadStore, entityFor, deviceRefs } from './mep-binding.mjs';
import { autoInputs, autoSummary, AUTO_VERSION } from './auto-inputs.mjs';
import { parseDoc } from '../draw/doc.mjs';
import { NOT_COMPUTED_AR } from '../final-outputs.mjs';

export const OUTPUTS_MEP_SCHEMA = 'mizan-mep-outputs/1';
export { NOT_COMPUTED_AR };

/** المصدر الذي تعرضه صفحة المخرجات: مخطط المرسم المحفوظ (لا التصميمات أو البدائل). */
export function outputsSource({ session = null, studioRaw = null } = {}) {
  return listSources({ session, studioRaw }).find(s => s.kind === 'studio') || null;
}

/** حالة «لم تُحسب بعد» صريحة: لا تُعرض كصفر صامت. */
export function notComputed(reasonAr = 'لا توجد مدخلات أنظمة من المخطط') {
  return { schema: OUTPUTS_MEP_SCHEMA, notComputed: true, reasonAr };
}

// ملاحظة لمصادر أخرى حُسبت وحُفظت في صفحة الأنظمة لجلسة التصميم نفسها (تُعرض مع تسميتها فقط)
function otherResults(storeData, sourceId, sessionKey, all) {
  const out = [];
  for (const e of Object.values(storeData?.entities || {})) {
    if (!e || e.alternativeId === sourceId || !e.result) continue;
    if (sessionKey != null && e.sessionKey != null && String(e.sessionKey) !== String(sessionKey)) continue;
    const src = all.find(s => s.id === e.alternativeId);
    let lights = null, circuits = null;
    try { const S = autoSummary(e.result, e.inputs || {}, null); lights = S.lights; circuits = S.circuits; } catch { /* نتيجة غير قابلة للقراءة */ }
    out.push({ id: e.alternativeId, label: src?.label || ('مصدر محفوظ: ' + e.alternativeId), lights, circuits });
  }
  return out;
}

/**
 * يحسب الأنظمة لمخطط صفحة المخرجات. لا يكتب شيئًا في التخزين.
 * @param {{session?:object|null, studioRaw?:string|null, store?:{getItem:(k:string)=>string|null}|null}} src
 * @returns {Promise<object>} ملخص قابل للعرض: summary (من autoSummary) مع source و origin و others، أو notComputed
 */
export async function computeOutputsMep({ session = null, studioRaw = null, store = null } = {}) {
  const src = outputsSource({ session, studioRaw });
  if (!src) return notComputed('لا يوجد مخطط في المرسم لحسابه');
  const sourceLabel = src.label;
  let doc;
  try { doc = parseDoc(src.docText); } catch (e) { return { ...notComputed('تعذرت قراءة مخطط المرسم: ' + String(e.message || e).slice(0, 120)), sourceLabel }; }
  const all = listSources({ session, studioRaw });
  let storeData = null; try { storeData = store ? loadStore(store) : null; } catch { storeData = null; }
  const saved = storeData ? entityFor(storeData, src.id, { sessionKey: src.sessionKey, kind: src.kind }) : null;
  let bind = await bindArchitecture(doc, { alternativeId: src.id, revision: src.revision });
  if (!bind.ok) return { ...notComputed(bind.error?.messageAr || 'تعذر ربط المخطط بالأنظمة'), sourceLabel };
  const fromSystems = !!(saved && deviceRefs(saved.inputs || {}).length);
  const inputs = fromSystems ? saved.inputs : autoInputs(doc, bind.project).inputs;
  bind = await bindArchitecture(doc, { alternativeId: src.id, revision: src.revision, inputs });
  if (!bind.ok) return { ...notComputed(bind.error?.messageAr || 'تعذر ربط المخطط بالأنظمة'), sourceLabel };
  const result = await computeSystems(bind.project);
  const summary = autoSummary(result, inputs, bind.project);
  if (!summary.lights && !summary.sockets && !summary.circuits) return { ...notComputed('المخطط لا يحوي فراغات مربوطة تُولَّد منها الإنارة والمقابس'), sourceLabel };
  return {
    ...summary, schema: OUTPUTS_MEP_SCHEMA, notComputed: false,
    source: { id: src.id, label: sourceLabel, origin: fromSystems ? 'systems-edited' : 'auto', autoVersion: AUTO_VERSION },
    others: otherResults(storeData, src.id, src.sessionKey, all),
  };
}

export default { OUTPUTS_MEP_SCHEMA, NOT_COMPUTED_AR, outputsSource, notComputed, computeOutputsMep };
