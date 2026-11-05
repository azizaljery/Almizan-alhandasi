// سجل أنماط الواجهة. كل نمط وحدة مستقلة تصدّر: meta و apply(THREE, ctx).
// العقد (CONTRACT): ctx = { scene, renderer, S, q, doc, FI, params }
//  - S.meshes: شبكات المبنى؛ لكل شبكة userData = { side:'s|n|e|w', role:'wall|cladding|plate|frame|glazing|door|cornice|surround|sill|projection|pediment|parapet…', opening, part }
//  - params: كائن تنوّع حتمي من variation.mjs (نسب، بذرة، لوحة ألوان، أماكن العناصر)؛ يجب أن تغيّر مخرجات النمط فعلًا.
//  - الممنوع: تحريك جدار أو فتحة أو منسوب؛ البروز المسموح للإطارات 15–25 سم؛ الإضافات أمام وجه الجدار فقط.
//  - الإرجاع: { wallZ, X0, X1 } لوجه الواجهة الجنوبية (يستعملها decorateFloors للأدوار المتعددة).
export const STYLES = Object.freeze({
  J: { ar: 'معاصر حجري', load: () => Promise.all([import('../style-j.mjs'), import('./j-templates.mjs')]).then(([m, t]) => ({ meta: { ...t.meta }, templates: t.templates, apply: (T, c) => m.applyStyleJ(T, c), docTransform: t.docTransform })) },
  N: { ar: 'نجدي', load: () => import('./najdi.mjs') },
  H: { ar: 'حجازي - جدة', load: () => import('./hijazi.mjs') },
  S: { ar: 'سلماني', load: () => import('./salmani.mjs') },
  C: { ar: 'كلاسيكي', load: () => import('./classic.mjs') },
  M: { ar: 'معاصر خفيف (جص وزجاج)', load: () => import('./modern-light.mjs') },
});
export async function applyStyle(id, THREE, ctx) {
  const e = STYLES[id]; if (!e) return null;
  let mod; try { mod = await e.load(); } catch (err) { console.error('STYLE_LOAD_FAIL', id, err?.message); return null; }
  return mod.apply(THREE, ctx);
}

/** خطاف تحويل التصميم (مسموح للقوالب): يُستدعى قبل بناء النموذج. يعدّل الفتحات/الأبواب/المداخل/الجدران/الأدوار.
 *  توقيع النمط: export function docTransform(doc, q) => doc جديد (لا يغيّر الأصل). يجوز أن يضبط q.set('floors', n) (1..3). */
export async function transformDoc(id, doc, q) {
  const e = STYLES[id]; if (!e || !q?.get || !q.get('tpl')) return doc;
  try { const mod = await e.load(); return typeof mod.docTransform === 'function' ? (mod.docTransform(doc, q) || doc) : doc; }
  catch (err) { console.error('DOC_TRANSFORM_FAIL', id, err?.message); return doc; }
}
