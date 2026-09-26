// P1-CLA-01 — local geometry/legacy projection only; MIZAN-IR/1.0.0 semantics.
// Not a complete replacement for the site's editor, persistence or integration adapter.
// The four native engine files are preserved byte-for-byte.
import { generateModel, quantities as quantitiesV2, TYPES, SHAPES, GEOMETRY, validateModel } from './planner.mjs';

/**
 * @typedef {import('./PlannerOutputContract.mjs').PlotInput & {maxBuiltArea?: number|null, maxBuiltAreaM2?: number|null}} PlotInput
 * @typedef {import('./PlannerOutputContract.mjs').RoomRequest} RoomRequest
 * @typedef {import('./PlannerOutputContract.mjs').ValidatedDesignGeometry} ValidatedDesignGeometry
 * @typedef {import('./PlannerOutputContract.mjs').Rect} Rect
 */

/** Old public constant, read by app.mjs for the alternative-card heading. Values unchanged from the live site. */
export const STRATEGIES = { l: 'كتلة L حقيقية', compact: 'المحور المضغوط', balanced: 'الرواق المتوازن', frontage: 'واجهة موسّعة', 'u-court': 'كتلة U حقيقية', courtyard: 'فناء حقيقي' };

/**
 * Old public constant, read by app.mjs as the fallback when a model has no `architecture` of its
 * own. Text copied verbatim from the live site's planner.mjs (not re-authored here).
 */
export const CONCEPT_PROFILES = {
  l: { tag: 'كتلة L حقيقية', form: 'جناحان متعامدان', idea: 'كتلة مشتقة من مضلع L الحقيقي.', bestFor: 'برنامج يسمح بجناحين', tradeoff: 'قد لا يجد المولد حلاً على الأرض المحددة', massing: 'l' },
  compact: { tag: 'محور واضح', form: 'كتلة طولية بإيقاع منتظم ومدخل مقروء', idea: 'يربط المدخل بالفراغات عبر رواق رئيسي واضح، ويضغط مساحة الحركة قدر الإمكان.', bestFor: 'الأراضي العميقة والبرنامج الكبير', tradeoff: 'المحور أطول وقد يحتاج معالجة ضوء في المنتصف', massing: 'spine' },
  balanced: { tag: 'خصوصية متدرجة', form: 'جناحان متوازيان يلتقيان برواق مركزي', idea: 'يفصل الضيافة عن السكن الخاص مع إبقاء الحركة اليومية قصيرة.', bestFor: 'برنامج متوسط يحتاج خصوصية عائلية', tradeoff: 'يحتاج واجهة أعرض قليلًا من المحور المضغوط', massing: 'twin' },
  frontage: { tag: 'واجهة موسّعة', form: 'كتلة عريضة قليلة العمق تبرز الواجهة الأمامية', idea: 'يناسب الأراضي العريضة الضحلة بإبقاء الغرف الرئيسية على الواجهة.', bestFor: 'أرض عريضة قصيرة العمق', tradeoff: 'ممرات أطول عرضيًا مقابل واجهة أوضح', massing: 'frontage' },
  u: { tag: 'كتلة U حقيقية', form: 'جناحان ورواق خلفي يحيطان بباحة', idea: 'مولّد هندسي حقيقي (مضلع فعلي) يبني فناءً بين الأجنحة، لا كتلة واحدة معدَّلة.', bestFor: 'برنامج سكني يحتاج ضوءًا وخصوصية متدرجة', tradeoff: 'زيادة طول الواجهة والجدران مقارنة بالكتلة المدمجة', massing: 'u' },
};

/** Live site's `topology`/`strategy` names that map to the new engine's `shape: 'u'`. */
const TOPOLOGY_KEYS = ['courtyard', 'u-court'];
/** Saved rectangle aliases remain valid; exact geometric duplicates are offered once. */
const RECT_STRATEGY_KEYS = ['compact', 'balanced', 'frontage'];

/**
 * Exact orthogonal polygon slicing in the native plot frame. No room-derived boxes or padding.
 * Slice perpendicular to the entrance direction; shared edges have zero area.
 * @param {ValidatedDesignGeometry} m @returns {Rect[] | undefined}
 */
function massingPartsOf(m) {
  if (m.shape === 'rect') return undefined;
  const swap = ['e', 'w'].includes(m.plot.entry);
  const ring = m.buildingFootprint.map(p => swap ? {x:p.y, y:p.x} : p);
  const levels = [...new Set(ring.map(p => p.y))].sort((a,b) => a-b);
  /** @type {Rect[]} */
  const parts = [];
  for (let k=0; k<levels.length-1; k++) {
    const y=levels[k], top=levels[k+1], mid=(y+top)/2;
    const cuts=[];
    for (let i=0; i<ring.length; i++) {
      const a=ring[i], b=ring[(i+1)%ring.length];
      if (a.x !== b.x && a.y !== b.y) throw Error('NON_ORTHOGONAL_UNSUPPORTED');
      if ((a.y>mid)!==(b.y>mid)) cuts.push(a.x);
    }
    cuts.sort((a,b)=>a-b);
    if (cuts.length%2) throw Error('INVALID_POLYGON');
    for (let i=0;i<cuts.length;i+=2) {
      const r={x:cuts[i],y,w:cuts[i+1]-cuts[i],h:top-y};
      if (!(r.w>0 && r.h>0)) throw Error('INVALID_MASSING_PART');
      parts.push(swap ? {x:r.y,y:r.x,w:r.h,h:r.w} : r);
    }
  }
  return parts;
}

/** @param {PlotInput} plot */
function areaCap(plot) {
  const a=plot.maxBuiltArea, b=plot.maxBuiltAreaM2;
  if (a !== undefined && b !== undefined && a !== b) throw Error('CONFLICTING_AREA_CAP');
  const cap=b !== undefined ? b : a !== undefined ? a : null;
  if (cap !== null && (typeof cap !== 'number' || !Number.isFinite(cap) || cap<=0)) throw Error('INVALID_MAX_BUILT_AREA');
  return cap;
}

/** @param {string} strategy @returns {'rect'|'l'|'u'} */
function shapeFor(strategy) {
  if (TOPOLOGY_KEYS.includes(strategy)) return 'u';
  if (strategy === 'l') return 'l';
  if (RECT_STRATEGY_KEYS.includes(strategy)) return 'rect';
  throw Error('UNKNOWN_STRATEGY: '+strategy);
}

/**
 * One v2.2.1 model -> old-shape model. Never mutates the input; returns a NEW object mixing
 * ValidatedDesignGeometry's own fields (unit consumers reading v2 fields directly still work)
 * with the old fields app.mjs/plan-view.mjs/viewer3d.mjs read.
 * @param {ValidatedDesignGeometry} m @param {string} strategyKey
 */
function toLegacyShape(m, strategyKey) {
  const profileKey = m.shape === 'u' ? 'u' : m.shape === 'l' ? 'l' : /** @type {'compact'|'balanced'|'frontage'} */ (strategyKey);
  const profile = CONCEPT_PROFILES[profileKey];
  const massingParts = massingPartsOf(m);
  return {
    ...m,
    engineVersion: 'polygon-2', // distinct from the old 'rectangular-2'; never collides with a legacy model on disk
    strategy: strategyKey,
    architecture: profile,
    topology: m.shape === 'u' && !m.shapeFallback ? strategyKey : undefined,
    massingParts,
    builtArea: quantitiesV2(m).footprint,
  };
}

/**
 * One genuine result per geometry. Rejected strategies retain their failure reasons.
 * @param {PlotInput} plot @param {RoomRequest[]} rooms
 */
export function generateAlternatives(plot, rooms) {
  areaCap(plot);
  const models=[], failures=[], fingerprints=new Set();
  for (const strategy of [...TOPOLOGY_KEYS, 'l', ...RECT_STRATEGY_KEYS]) {
    try {
      const m=generateModelLegacy(plot, rooms, {strategy});
      // Full geometric content, exact numbers; labels/strategy/area alone never define diversity.
      const key=JSON.stringify({
        buildingFootprint:m.buildingFootprint, rooms:m.rooms, corridors:m.corridors,
        reserves:m.reserves, walls:m.walls, openings:m.openings, courtyards:m.courtyards
      });
      if (!fingerprints.has(key)) { fingerprints.add(key); models.push(m); }
    } catch(error) {
      failures.push({strategy, reason:/** @type {Error} */(error).message});
    }
  }
  if (!models.length) throw Error('لم يجد المولد الحالي حلاً ضمن القيود؛ ليس حكمًا باستحالة البناء. '+(failures[0]?.reason || ''));
  return {models,failures};
}

/**
 * Legacy strategy aliases are retained for restore, but duplicate geometry is offered once.
 * Native fallback is accepted only with explicit permission, always reported.
 * @param {PlotInput} plot @param {RoomRequest[]} rooms
 * @param {{strategy?:string, allowFallback?:boolean}} [opts]
 */
export function generateModelLegacy(plot, rooms, {strategy='compact', allowFallback=false}={}) {
  const cap=areaCap(plot), requestedShape=shapeFor(strategy);
  const m=generateModel({...plot,shape:requestedShape},rooms);
  const errors=validateModel(m);
  if (errors.length) throw Error('NATIVE_VALIDATION_FAILED: '+errors.join('; '));
  const applied=m.shape !== requestedShape;
  const reason=applied ? m.warnings.find(w=>w.startsWith('تعذّر')) || 'لم يجد المولد الحالي الشكل المطلوب.' : null;
  if (applied && !allowFallback) throw Error('SHAPE_FIT_FAILED requested='+requestedShape+' actual='+m.shape+'; '+reason);
  const area=quantitiesV2(m).footprint;
  if (cap !== null && area>cap+Math.max(1e-6,Math.abs(cap)*1e-8)) {
    throw Error('MAX_BUILT_AREA_EXCEEDED: '+area+' > '+cap+'; لم يجد المولد الحالي حلاً ضمن السقف دون تغيير الغرف.');
  }
  const legacy=toLegacyShape(m,applied ? 'compact' : strategy);
  return {
    ...legacy, strategy,
    plot:{...m.plot,maxBuiltArea:cap},
    requestedShape, actualShape:m.shape,
    fallback:{allowed:allowFallback,applied,reason}
  };
}

/** Old `quantities()` read `model.builtArea ?? building.w*building.h`; toLegacyShape() always sets builtArea, so this is quantitiesV2 unchanged -- re-exported under the old import path for app.mjs. */
export const quantities = quantitiesV2;
export { TYPES, SHAPES, GEOMETRY };
