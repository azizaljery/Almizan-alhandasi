// سجل أنماط الواجهة. كل نمط وحدة مستقلة تصدّر: meta و apply(THREE, ctx).
// العقد (CONTRACT): ctx = { scene, renderer, S, q, doc, FI, params }
//  - S.meshes: شبكات المبنى؛ لكل شبكة userData = { side:'s|n|e|w', role:'wall|cladding|plate|frame|glazing|door|cornice|surround|sill|projection|pediment|parapet…', opening, part }
//  - params: كائن تنوّع حتمي من variation.mjs (نسب، بذرة، لوحة ألوان، أماكن العناصر)؛ يجب أن تغيّر مخرجات النمط فعلًا.
//  - الممنوع: تحريك جدار أو فتحة أو منسوب؛ البروز المسموح للإطارات 15–25 سم؛ الإضافات أمام وجه الجدار فقط.
//  - الإرجاع: { wallZ, X0, X1 } لوجه الواجهة الجنوبية (يستعملها decorateFloors للأدوار المتعددة).
export const STYLES = Object.freeze({
  J: { ar: 'معاصر حجري', load: () => import('../style-j.mjs').then(m => ({ meta: { id: 'J', ar: 'معاصر' }, apply: (T, c) => m.applyStyleJ(T, c) })) },
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
