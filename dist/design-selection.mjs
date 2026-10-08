export const DESIGN_CHOICES = Object.freeze({
  courtyard_privacy: { label: 'بيت الفناء الخاص المغلق', shape: null },
  family_layout: { label: 'جناحان على شكل L', shape: 'l' },
  concept_comparison: { label: 'بيت الباحة U', shape: 'u' },
  classic_living: { label: 'أجنحة مرتبطة برواق', shape: 'pavilions' },
  staggered_wings: { label: 'جناحان متدرجان مرتبطان', shape: 'staggered' },
});
export const DESIGN_SHAPES = Object.freeze(['rect', 'l', 'u', 'pavilions', 'staggered']);
const DEFAULT_SHAPES = [...DESIGN_SHAPES];

export function resolveDesignShapes(discovery = {}, selectedShape = null) {
  const likes = discovery.likes || [], rejects = discovery.rejects || [];
  if (![likes, rejects].every(values => Array.isArray(values) && values.every(v => Object.hasOwn(DESIGN_CHOICES, v)))) throw Error('اختيار شكل البيت غير معروف.');
  if (likes.some(v => rejects.includes(v))) throw Error('الشكل نفسه مختار ومرفوض؛ راجع اختياراتك.');
  // UI likes are preferences, not a demand to lock the client into one massing template.
  // Only an explicit prompt shape or a chosen existing result narrows generation.
  const allowed = new Set(DEFAULT_SHAPES);
  for (const v of rejects) allowed.delete(DESIGN_CHOICES[v].shape);
  if (selectedShape !== null) {
    if (!DESIGN_SHAPES.includes(selectedShape) || !allowed.has(selectedShape)) throw Error('البديل المحدد لا يطابق اختيارات شكل البيت الحالية.');
    return [selectedShape];
  }
  return DESIGN_SHAPES.filter(shape => allowed.has(shape));
}
