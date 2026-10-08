export const DESIGN_CHOICES = Object.freeze({
  courtyard_privacy: { label: 'بيت الفناء الخاص المغلق', shape: null },
  family_layout: { label: 'جناحان على شكل L', shape: 'l' },
  concept_comparison: { label: 'بيت الباحة U', shape: 'u' },
  classic_living: { label: 'أجنحة مرتبطة برواق', shape: 'pavilions' },
});
export const DESIGN_SHAPES = Object.freeze(['rect', 'l', 'u', 'pavilions']);
const DEFAULT_SHAPES = ['rect', 'l', 'u'];

export function resolveDesignShapes(discovery = {}, selectedShape = null) {
  const likes = discovery.likes || [], rejects = discovery.rejects || [];
  if (![likes, rejects].every(values => Array.isArray(values) && values.every(v => Object.hasOwn(DESIGN_CHOICES, v)))) throw Error('اختيار شكل البيت غير معروف.');
  if (likes.some(v => rejects.includes(v))) throw Error('الشكل نفسه مختار ومرفوض؛ راجع اختياراتك.');
  const unsupported = likes.filter(v => !DESIGN_CHOICES[v].shape);
  if (unsupported.length) throw Error(`${unsupported.map(v => DESIGN_CHOICES[v].label).join('، ')} غير متاح للتوليد حاليًا. اختر L أو U؛ لم يتم استبدال اختيارك بشكل آخر.`);
  const allowed = new Set(likes.length ? likes.map(v => DESIGN_CHOICES[v].shape) : DEFAULT_SHAPES);
  if (!likes.length && selectedShape === 'pavilions') allowed.add(selectedShape);
  for (const v of rejects) allowed.delete(DESIGN_CHOICES[v].shape);
  if (selectedShape !== null) {
    if (!DESIGN_SHAPES.includes(selectedShape) || !allowed.has(selectedShape)) throw Error('البديل المحدد لا يطابق اختيارات شكل البيت الحالية.');
    return [selectedShape];
  }
  return DESIGN_SHAPES.filter(shape => allowed.has(shape));
}
