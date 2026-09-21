/**
 * MIZAN ENGINEERING — Home Design Journey & Decision Engine
 * ملف مستقل قابل للإرفاق بالمشروع الرئيسي دون تعديل طبقة AI أو الأمان.
 *
 * الهدف:
 * - إدارة رحلة العميل من تعريف الأرض إلى اعتماد المخطط ثم BOQ.
 * - تحويل رغبات العميل وما لا يريده إلى Constraints قابلة للحساب.
 * - بناء Design DNA للمشروع.
 * - تقييم ومقارنة البدائل.
 * - تحليل الخصوصية والحركة والهدر.
 * - تقدير أثر التعديلات على الكميات والتكلفة.
 *
 * طريقة الدمج المقترحة:
 * import {
 *   createMizanProject,
 *   updateProjectProfile,
 *   addPreference,
 *   addRelationship,
 *   evaluateDesign,
 *   compareDesigns,
 *   estimateChangeImpact,
 *   buildBOQ,
 *   getJourneySteps,
 *   getFeatureRegistry
 * } from './mizan-home-design-engine.mjs';
 *
 * ملاحظة:
 * هذا الملف لا يتعامل مع مفاتيح API ولا Cloudflare Worker ولا OpenAI.
 * يمكن ربطه لاحقًا بمحرك الذكاء الحالي كمصدر قواعد/بيانات فقط.
 */

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const MIZAN_VERSION = '1.0.0';

export const JOURNEY_STAGES = Object.freeze([
  'welcome',
  'site',
  'household',
  'spaces',
  'dislikes',
  'relationships',
  'style',
  'design_dna',
  'concepts',
  'evaluation',
  'edit',
  'simulation',
  'approval',
  'drawings',
  'boq',
  'tender',
  'execution'
]);

export const PRIORITY = Object.freeze({
  REQUIRED: 1.0,
  VERY_IMPORTANT: 0.9,
  IMPORTANT: 0.75,
  OPTIONAL: 0.45,
  NOT_IMPORTANT: 0.2,
  REJECTED: 0.0
});

export const RELATION_TYPES = Object.freeze({
  DIRECT: 'direct',
  NEAR: 'near',
  NEUTRAL: 'neutral',
  FAR: 'far',
  FORBIDDEN: 'forbidden'
});

export const DESIGN_METRICS = Object.freeze([
  'privacy',
  'spaceEfficiency',
  'functionalAdjacency',
  'circulation',
  'daylight',
  'ventilation',
  'solarOrientation',
  'acousticSeparation',
  'futureExpansion',
  'costEfficiency',
  'constructability',
  'wasteControl'
]);

export const DEFAULT_METRIC_WEIGHTS = Object.freeze({
  privacy: 0.14,
  spaceEfficiency: 0.11,
  functionalAdjacency: 0.12,
  circulation: 0.10,
  daylight: 0.08,
  ventilation: 0.07,
  solarOrientation: 0.06,
  acousticSeparation: 0.08,
  futureExpansion: 0.07,
  costEfficiency: 0.07,
  constructability: 0.05,
  wasteControl: 0.05
});

export const SPACE_CATEGORIES = Object.freeze({
  sleeping: ['master_bedroom', 'bedroom', 'parent_suite', 'guest_bedroom', 'nanny_room'],
  hospitality: ['men_majlis', 'women_majlis', 'dining', 'foyer', 'guest_wc', 'washbasins'],
  family: ['family_hall', 'tv_lounge', 'library', 'coffee_bar', 'playroom', 'home_office'],
  service: ['kitchen', 'prep_kitchen', 'pantry', 'laundry', 'maid_room', 'driver_room', 'service_store'],
  outdoor: ['garden', 'outdoor_sitting', 'annex', 'parking', 'service_yard', 'future_roof']
});

// -----------------------------------------------------------------------------
// Feature Registry
// -----------------------------------------------------------------------------

export const FEATURE_REGISTRY = Object.freeze({
  onboarding: {
    title: 'بداية ذكية',
    capabilities: [
      'صمم لي',
      'صمم معي',
      'أعرف ما أريد',
      'استيراد مخطط قائم'
    ]
  },
  siteAnalysis: {
    title: 'تحليل الأرض',
    capabilities: [
      'أبعاد الأرض',
      'الشوارع',
      'اتجاه الشمال',
      'الارتدادات',
      'تحليل الشمس',
      'تحليل الخصوصية',
      'مواقع المداخل',
      'فرص الأرض'
    ]
  },
  customerUnderstanding: {
    title: 'فهم العميل',
    capabilities: [
      'أفراد الأسرة',
      'كبار السن',
      'الأطفال',
      'الضيوف',
      'العاملين',
      'الهوايات',
      'العمل من المنزل',
      'الاحتياجات المستقبلية'
    ]
  },
  preferences: {
    title: 'أريد / لا أريد',
    capabilities: [
      'أريده',
      'لا أريده',
      'مهم جدًا',
      'اختياري',
      'قيود تصميمية تلقائية'
    ]
  },
  relationships: {
    title: 'خريطة العلاقات',
    capabilities: [
      'متصل مباشرة',
      'قريب',
      'محايد',
      'بعيد',
      'ممنوع الاتصال'
    ]
  },
  designDNA: {
    title: 'Design DNA',
    capabilities: [
      'الخصوصية',
      'الانفتاح',
      'الضيافة',
      'العائلة',
      'الحدائق',
      'سهولة الحركة',
      'التوسع المستقبلي',
      'الميزانية'
    ]
  },
  conceptGeneration: {
    title: 'اتجاهات تصميم مختلفة',
    capabilities: [
      'الخصوصية القصوى',
      'قلب البيت',
      'الكفاءة',
      'بدائل متعددة حقيقية لا مجرد نسخ'
    ]
  },
  explainability: {
    title: 'اشرح لي التصميم',
    capabilities: [
      'سبب موقع كل غرفة',
      'سبب العلاقات',
      'سبب اتجاه المداخل',
      'سبب التعديلات المقترحة'
    ]
  },
  simulations: {
    title: 'جرّب حياتك',
    capabilities: [
      'مسار الضيف',
      'مسار العائلة',
      'مسار الخدمة',
      'مسار كبار السن',
      'اختبار المناسبات'
    ]
  },
  overlays: {
    title: 'خرائط التحليل',
    capabilities: [
      'خريطة الخصوصية',
      'خريطة الحركة',
      'خريطة الهدر',
      'خريطة الصوت',
      'خريطة الشمس',
      'قيمة كل متر'
    ]
  },
  editing: {
    title: 'غيّر لي',
    capabilities: [
      'تعديل طبيعي باللغة',
      'حفظ نسخ',
      'قبل/بعد',
      'قياس أثر التغيير'
    ]
  },
  familyMode: {
    title: 'وضع العائلة',
    capabilities: [
      'تصويت أفراد الأسرة',
      'نقاط الاتفاق',
      'نقاط الاختلاف',
      'حل وسط'
    ]
  },
  costing: {
    title: 'التكلفة اللحظية',
    capabilities: [
      'المساحة',
      'التكلفة التقديرية',
      'تكلفة المتر',
      'أثر كل تعديل'
    ]
  },
  boq: {
    title: 'جداول الكميات',
    capabilities: [
      'BOQ مبسط',
      'BOQ احترافي',
      'BOQ مناقصات',
      'Baseline BOQ',
      'Tender BOQ',
      'Contract BOQ',
      'Actual'
    ]
  },
  tendering: {
    title: 'مقارنة المقاولين',
    capabilities: [
      'بنود ناقصة',
      'أسعار شاذة',
      'فروقات الكميات',
      'فروقات الإجمالي'
    ]
  },
  futureHome: {
    title: 'مستقبل البيت',
    capabilities: [
      'دور إضافي',
      'غرفة إضافية',
      'مصعد',
      'والدين',
      'مكتب',
      'توسع مرن'
    ]
  }
});

// -----------------------------------------------------------------------------
// Core Project Factory
// -----------------------------------------------------------------------------

export function createMizanProject(seed = {}) {
  const now = new Date().toISOString();

  return {
    id: seed.id || `mizan_${Date.now()}`,
    version: MIZAN_VERSION,
    createdAt: now,
    updatedAt: now,

    customer: {
      language: seed.language || 'ar',
      mode: seed.mode || 'design_with_me',
      household: {},
      lifestyle: {},
      budget: null,
      futureNeeds: []
    },

    site: {
      dimensions: null,
      streets: [],
      northAngle: 0,
      setbacks: {},
      maxFloors: null,
      metadata: {},
      opportunities: []
    },

    program: {
      spaces: [],
      requiredBuiltArea: null,
      targetBuiltArea: null,
      maxBuiltArea: null
    },

    preferences: [],
    dislikes: [],
    relationships: [],

    designDNA: {
      privacy: 0.8,
      openness: 0.5,
      hospitality: 0.6,
      family: 0.8,
      gardens: 0.5,
      accessibility: 0.7,
      futureExpansion: 0.5,
      budgetSensitivity: 0.6
    },

    metricWeights: { ...DEFAULT_METRIC_WEIGHTS },

    concepts: [],
    approvedConceptId: null,

    versions: [],
    boq: null,
    contractorOffers: [],

    audit: []
  };
}

// -----------------------------------------------------------------------------
// Audit
// -----------------------------------------------------------------------------

function touch(project, action, payload = {}) {
  project.updatedAt = new Date().toISOString();
  project.audit.push({
    at: project.updatedAt,
    action,
    payload
  });
  return project;
}

// -----------------------------------------------------------------------------
// Customer & Site
// -----------------------------------------------------------------------------

export function updateProjectProfile(project, patch = {}) {
  project.customer = deepMerge(project.customer, patch.customer || {});
  project.site = deepMerge(project.site, patch.site || {});
  project.program = deepMerge(project.program, patch.program || {});
  return touch(project, 'update_project_profile', patch);
}

export function analyzeSite(project) {
  const { dimensions, streets = [], northAngle = 0, setbacks = {} } = project.site;

  const opportunities = [];

  if (dimensions?.width && dimensions?.depth) {
    const area = Number(dimensions.width) * Number(dimensions.depth);
    opportunities.push({
      type: 'site_area',
      message: `مساحة الأرض التقريبية ${round(area, 1)} م²`,
      value: area
    });
  }

  if (streets.length >= 2) {
    opportunities.push({
      type: 'multiple_frontages',
      message: 'تعدد الواجهات يسمح بفصل الضيافة والعائلة والخدمة.',
      value: streets.length
    });
  }

  if (northAngle !== null && northAngle !== undefined) {
    opportunities.push({
      type: 'orientation_known',
      message: 'اتجاه الشمال معروف ويمكن استخدامه في تحليل الشمس والواجهات.',
      value: northAngle
    });
  }

  if (Object.keys(setbacks).length) {
    opportunities.push({
      type: 'setbacks_known',
      message: 'الارتدادات مسجلة ويمكن احتساب المسطح المتاح للبناء.',
      value: setbacks
    });
  }

  project.site.opportunities = opportunities;
  return touch(project, 'analyze_site', { opportunities });
}

// -----------------------------------------------------------------------------
// Preferences / Constraints
// -----------------------------------------------------------------------------

export function addPreference(project, input) {
  const item = normalizePreference(input);
  project.preferences.push(item);

  if (item.state === 'rejected') {
    project.dislikes.push(item);
  }

  return touch(project, 'add_preference', item);
}

export function addRelationship(project, input) {
  const rel = {
    from: input.from,
    to: input.to,
    type: input.type || RELATION_TYPES.NEUTRAL,
    priority: normalizePriority(input.priority),
    reason: input.reason || null
  };

  project.relationships.push(rel);
  return touch(project, 'add_relationship', rel);
}

function normalizePreference(input = {}) {
  return {
    key: input.key || input.name || `pref_${Date.now()}`,
    label: input.label || input.name || '',
    state: input.state || 'wanted', // wanted | rejected | optional
    priority: normalizePriority(input.priority),
    metadata: input.metadata || {}
  };
}

function normalizePriority(value) {
  if (typeof value === 'number') return clamp(value, 0, 1);

  switch (String(value || '').toLowerCase()) {
    case 'required': return PRIORITY.REQUIRED;
    case 'very_important': return PRIORITY.VERY_IMPORTANT;
    case 'important': return PRIORITY.IMPORTANT;
    case 'optional': return PRIORITY.OPTIONAL;
    case 'not_important': return PRIORITY.NOT_IMPORTANT;
    case 'rejected': return PRIORITY.REJECTED;
    default: return PRIORITY.IMPORTANT;
  }
}

// -----------------------------------------------------------------------------
// Design DNA
// -----------------------------------------------------------------------------

export function deriveDesignDNA(project) {
  const dna = { ...project.designDNA };

  for (const pref of project.preferences) {
    const p = pref.priority ?? 0.5;
    const key = String(pref.key || '').toLowerCase();

    if (key.includes('privacy')) dna.privacy = max01(dna.privacy, p);
    if (key.includes('garden')) dna.gardens = max01(dna.gardens, p);
    if (key.includes('guest') || key.includes('majlis')) dna.hospitality = max01(dna.hospitality, p);
    if (key.includes('family')) dna.family = max01(dna.family, p);
    if (key.includes('access') || key.includes('elder')) dna.accessibility = max01(dna.accessibility, p);
    if (key.includes('future') || key.includes('expand')) dna.futureExpansion = max01(dna.futureExpansion, p);
  }

  project.designDNA = normalizeDNA(dna);
  return touch(project, 'derive_design_dna', { designDNA: project.designDNA });
}

export function setDesignDNA(project, dnaPatch = {}) {
  project.designDNA = normalizeDNA({
    ...project.designDNA,
    ...dnaPatch
  });

  return touch(project, 'set_design_dna', { designDNA: project.designDNA });
}

function normalizeDNA(dna) {
  const out = {};
  for (const [k, v] of Object.entries(dna)) {
    out[k] = clamp(Number(v) || 0, 0, 1);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Design Evaluation
// -----------------------------------------------------------------------------

export function evaluateDesign(project, design, options = {}) {
  const weights = normalizeWeights(options.weights || project.metricWeights || DEFAULT_METRIC_WEIGHTS);
  const raw = calculateRawMetrics(project, design);

  let weighted = 0;
  for (const metric of DESIGN_METRICS) {
    weighted += (raw[metric] || 0) * (weights[metric] || 0);
  }

  const blockers = detectBlockers(project, design);
  const blockerPenalty = Math.min(35, blockers.length * 7);
  const score = clamp(weighted * 100 - blockerPenalty, 0, 100);

  const result = {
    designId: design.id,
    score: round(score, 1),
    metrics: mapObject(raw, v => round(v * 100, 1)),
    blockers,
    explanations: explainEvaluation(project, design, raw, blockers),
    spaceStats: calculateSpaceStats(design),
    circulation: analyzeCirculation(design),
    privacy: analyzePrivacy(project, design),
    waste: analyzeWaste(design)
  };

  return result;
}

function calculateRawMetrics(project, design) {
  const space = calculateSpaceStats(design);
  const relations = scoreRelationships(project, design);
  const privacy = analyzePrivacy(project, design);
  const circulation = analyzeCirculation(design);
  const waste = analyzeWaste(design);

  return {
    privacy: privacy.score,
    spaceEfficiency: clamp(space.efficiency, 0, 1),
    functionalAdjacency: relations.score,
    circulation: circulation.score,
    daylight: normalizedMetric(design.metrics?.daylight, 0.65),
    ventilation: normalizedMetric(design.metrics?.ventilation, 0.65),
    solarOrientation: normalizedMetric(design.metrics?.solarOrientation, 0.6),
    acousticSeparation: normalizedMetric(design.metrics?.acousticSeparation, 0.65),
    futureExpansion: normalizedMetric(design.metrics?.futureExpansion, project.designDNA.futureExpansion || 0.5),
    costEfficiency: normalizedMetric(design.metrics?.costEfficiency, 0.65),
    constructability: normalizedMetric(design.metrics?.constructability, 0.7),
    wasteControl: 1 - waste.ratio
  };
}

function detectBlockers(project, design) {
  const blockers = [];

  for (const rel of project.relationships || []) {
    if (rel.type !== RELATION_TYPES.FORBIDDEN) continue;
    const distance = getSpaceDistance(design, rel.from, rel.to);
    if (distance !== null && distance < 1.5) {
      blockers.push({
        type: 'forbidden_relationship',
        severity: 'high',
        from: rel.from,
        to: rel.to,
        message: `علاقة ممنوعة بين ${rel.from} و ${rel.to}`
      });
    }
  }

  const maxBuiltArea = project.program?.maxBuiltArea;
  const total = calculateSpaceStats(design).totalBuiltArea;
  if (maxBuiltArea && total > maxBuiltArea) {
    blockers.push({
      type: 'max_built_area_exceeded',
      severity: 'high',
      value: total,
      limit: maxBuiltArea,
      message: `المسطح ${round(total,1)} م² يتجاوز الحد ${maxBuiltArea} م²`
    });
  }

  return blockers;
}

// -----------------------------------------------------------------------------
// Comparison
// -----------------------------------------------------------------------------

export function compareDesigns(project, designs = [], options = {}) {
  const rows = designs.map(design => {
    const evaluation = evaluateDesign(project, design, options);
    return {
      designId: design.id,
      name: design.name || design.id,
      philosophy: design.philosophy || null,
      score: evaluation.score,
      metrics: evaluation.metrics,
      blockers: evaluation.blockers.length,
      totalBuiltArea: evaluation.spaceStats.totalBuiltArea,
      wasteRatio: round(evaluation.waste.ratio * 100, 1),
      estimatedCost: design.cost?.total || null
    };
  });

  return {
    rows,
    generatedAt: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// Relationship Score
// -----------------------------------------------------------------------------

function scoreRelationships(project, design) {
  const rels = project.relationships || [];
  if (!rels.length) return { score: 0.75, details: [] };

  let weightedScore = 0;
  let weightSum = 0;
  const details = [];

  for (const rel of rels) {
    const distance = getSpaceDistance(design, rel.from, rel.to);
    if (distance === null) continue;

    const score = relationshipDistanceScore(rel.type, distance);
    const weight = rel.priority || 0.5;

    weightedScore += score * weight;
    weightSum += weight;

    details.push({
      ...rel,
      distance: round(distance, 2),
      score: round(score * 100, 1)
    });
  }

  return {
    score: weightSum ? weightedScore / weightSum : 0.75,
    details
  };
}

function relationshipDistanceScore(type, distance) {
  switch (type) {
    case RELATION_TYPES.DIRECT:
      return distance <= 1.5 ? 1 : distance <= 4 ? 0.65 : 0.2;
    case RELATION_TYPES.NEAR:
      return distance <= 5 ? 1 : distance <= 10 ? 0.7 : 0.35;
    case RELATION_TYPES.FAR:
      return distance >= 10 ? 1 : distance >= 6 ? 0.7 : 0.3;
    case RELATION_TYPES.FORBIDDEN:
      return distance >= 8 ? 1 : distance >= 5 ? 0.55 : 0;
    default:
      return 0.75;
  }
}

// -----------------------------------------------------------------------------
// Privacy
// -----------------------------------------------------------------------------

export function analyzePrivacy(project, design) {
  const publicSpaces = new Set(['men_majlis', 'women_majlis', 'foyer', 'guest_wc', 'dining']);
  const privateSpaces = new Set(['master_bedroom', 'bedroom', 'parent_suite', 'family_hall']);

  let conflicts = 0;
  let checks = 0;

  for (const pub of publicSpaces) {
    for (const priv of privateSpaces) {
      const d = getSpaceDistance(design, pub, priv);
      if (d === null) continue;
      checks++;
      if (d < 4) conflicts += 1;
    }
  }

  const base = checks ? 1 - conflicts / checks : 0.8;
  const privacyWeight = project.designDNA?.privacy ?? 0.8;

  return {
    score: clamp((base * 0.75) + (privacyWeight * 0.25), 0, 1),
    conflicts,
    checks
  };
}

// -----------------------------------------------------------------------------
// Circulation
// -----------------------------------------------------------------------------

export function analyzeCirculation(design) {
  const circulationArea = Number(design.areas?.circulation || 0);
  const total = Number(design.areas?.totalBuiltArea || sumSpaceAreas(design));

  if (!total) return { score: 0.7, ratio: 0 };

  const ratio = circulationArea / total;

  let score = 1;
  if (ratio > 0.22) score = 0.45;
  else if (ratio > 0.18) score = 0.65;
  else if (ratio > 0.15) score = 0.8;

  return {
    score,
    ratio: clamp(ratio, 0, 1),
    circulationArea
  };
}

// -----------------------------------------------------------------------------
// Waste / Value Per m²
// -----------------------------------------------------------------------------

export function analyzeWaste(design) {
  const total = Number(design.areas?.totalBuiltArea || sumSpaceAreas(design));
  const circulation = Number(design.areas?.circulation || 0);
  const explicitWaste = Number(design.areas?.waste || 0);

  const wasteArea = explicitWaste || Math.max(0, circulation - total * 0.12);
  const ratio = total ? clamp(wasteArea / total, 0, 1) : 0;

  return {
    wasteArea: round(wasteArea, 2),
    ratio,
    recoverableArea: round(wasteArea * 0.7, 2),
    classification: ratio <= 0.05 ? 'excellent'
      : ratio <= 0.09 ? 'good'
      : ratio <= 0.14 ? 'needs_review'
      : 'high_waste'
  };
}

export function calculateValuePerSquareMeter(design) {
  const spaces = design.spaces || [];
  return spaces.map(space => {
    const utility = clamp(Number(space.utilityScore ?? 0.8), 0, 1);
    const frequency = clamp(Number(space.useFrequency ?? 0.7), 0, 1);
    const strategic = clamp(Number(space.strategicValue ?? 0.6), 0, 1);

    return {
      id: space.id,
      name: space.name || space.type,
      area: Number(space.area || 0),
      valueIndex: round((utility * 0.45 + frequency * 0.35 + strategic * 0.20) * 100, 1)
    };
  });
}

// -----------------------------------------------------------------------------
// Space Statistics
// -----------------------------------------------------------------------------

export function calculateSpaceStats(design) {
  const totalBuiltArea = Number(design.areas?.totalBuiltArea || sumSpaceAreas(design));
  const circulation = Number(design.areas?.circulation || 0);
  const waste = analyzeWaste(design);
  const useful = Math.max(0, totalBuiltArea - circulation - waste.wasteArea);

  return {
    totalBuiltArea: round(totalBuiltArea, 2),
    usefulArea: round(useful, 2),
    circulationArea: round(circulation, 2),
    wasteArea: waste.wasteArea,
    efficiency: totalBuiltArea ? clamp(useful / totalBuiltArea, 0, 1) : 0
  };
}

function sumSpaceAreas(design) {
  return (design.spaces || []).reduce((sum, s) => sum + Number(s.area || 0), 0);
}

// -----------------------------------------------------------------------------
// Change Impact
// -----------------------------------------------------------------------------

export function estimateChangeImpact(change, rates = {}) {
  const defaults = {
    floorRate: 180,
    ceilingRate: 130,
    wallFinishRate: 85,
    masonryRate: 120,
    electricalPointRate: 250,
    hvacPerM2Rate: 220
  };

  const r = { ...defaults, ...rates };
  const areaDelta = Number(change.areaDelta || 0);
  const perimeterDelta = Number(change.perimeterDelta || 0);
  const wallHeight = Number(change.wallHeight || 3.2);
  const newDoors = Number(change.newDoors || 0);
  const electricalPoints = Number(change.electricalPoints || 0);

  const wallAreaDelta = Math.max(0, perimeterDelta * wallHeight);

  const items = [
    {
      code: 'FLOOR',
      description: 'أرضيات',
      unit: 'm²',
      quantityDelta: round(areaDelta, 2),
      rate: r.floorRate,
      amountDelta: round(areaDelta * r.floorRate, 2)
    },
    {
      code: 'CEILING',
      description: 'أسقف',
      unit: 'm²',
      quantityDelta: round(areaDelta, 2),
      rate: r.ceilingRate,
      amountDelta: round(areaDelta * r.ceilingRate, 2)
    },
    {
      code: 'WALL_FINISH',
      description: 'تشطيبات جدران',
      unit: 'm²',
      quantityDelta: round(wallAreaDelta * 2, 2),
      rate: r.wallFinishRate,
      amountDelta: round(wallAreaDelta * 2 * r.wallFinishRate, 2)
    },
    {
      code: 'MASONRY',
      description: 'مباني',
      unit: 'm²',
      quantityDelta: round(wallAreaDelta, 2),
      rate: r.masonryRate,
      amountDelta: round(wallAreaDelta * r.masonryRate, 2)
    },
    {
      code: 'ELECTRICAL_POINTS',
      description: 'نقاط كهربائية',
      unit: 'point',
      quantityDelta: electricalPoints,
      rate: r.electricalPointRate,
      amountDelta: round(electricalPoints * r.electricalPointRate, 2)
    },
    {
      code: 'HVAC',
      description: 'تكييف',
      unit: 'm²',
      quantityDelta: round(areaDelta, 2),
      rate: r.hvacPerM2Rate,
      amountDelta: round(areaDelta * r.hvacPerM2Rate, 2)
    },
    {
      code: 'DOORS',
      description: 'أبواب إضافية',
      unit: 'nr',
      quantityDelta: newDoors,
      rate: Number(r.doorRate || 0),
      amountDelta: round(newDoors * Number(r.doorRate || 0), 2)
    }
  ];

  return {
    items,
    totalAmountDelta: round(items.reduce((s, i) => s + i.amountDelta, 0), 2)
  };
}

// -----------------------------------------------------------------------------
// BOQ
// -----------------------------------------------------------------------------

export function buildBOQ(model, rates = {}, mode = 'professional') {
  const areas = model.areas || {};
  const counts = model.counts || {};

  const items = [];

  pushBOQ(items, 'ARCH-FLOOR', 'الأرضيات', 'm²', areas.floor, rates.floor);
  pushBOQ(items, 'ARCH-CEILING', 'الأسقف', 'm²', areas.ceiling, rates.ceiling);
  pushBOQ(items, 'ARCH-WALL-FIN', 'تشطيبات الجدران', 'm²', areas.wallFinish, rates.wallFinish);
  pushBOQ(items, 'ARCH-PAINT', 'الدهانات', 'm²', areas.paint, rates.paint);
  pushBOQ(items, 'ARCH-MASONRY', 'المباني', 'm²', areas.masonry, rates.masonry);
  pushBOQ(items, 'ARCH-WATERPROOF', 'العزل', 'm²', areas.waterproofing, rates.waterproofing);
  pushBOQ(items, 'ARCH-DOOR', 'الأبواب', 'nr', counts.doors, rates.door);
  pushBOQ(items, 'ARCH-WINDOW', 'النوافذ', 'nr', counts.windows, rates.window);

  pushBOQ(items, 'MEP-ELEC', 'النقاط الكهربائية', 'point', counts.electricalPoints, rates.electricalPoint);
  pushBOQ(items, 'MEP-PLUMB', 'النقاط الصحية', 'point', counts.plumbingPoints, rates.plumbingPoint);
  pushBOQ(items, 'MEP-HVAC', 'التكييف', 'm²', areas.hvacServed, rates.hvacPerM2);

  pushBOQ(items, 'EXT-PAVING', 'الأعمال الخارجية', 'm²', areas.externalPaving, rates.externalPaving);

  const normalized = items.filter(i => i.quantity > 0);

  return {
    mode,
    currency: rates.currency || 'SAR',
    items: normalized,
    subtotal: round(normalized.reduce((sum, i) => sum + i.total, 0), 2),
    generatedAt: new Date().toISOString()
  };
}

function pushBOQ(items, code, description, unit, qty = 0, rate = 0) {
  const quantity = Number(qty || 0);
  const unitRate = Number(rate || 0);

  items.push({
    code,
    description,
    unit,
    quantity: round(quantity, 3),
    rate: round(unitRate, 2),
    total: round(quantity * unitRate, 2)
  });
}

// -----------------------------------------------------------------------------
// Contractor Offers
// -----------------------------------------------------------------------------

export function compareContractorOffers(referenceBOQ, offers = []) {
  const ref = new Map((referenceBOQ.items || []).map(i => [i.code, i]));

  return offers.map(offer => {
    const offerMap = new Map((offer.items || []).map(i => [i.code, i]));
    const missing = [];
    const quantityMismatches = [];
    const priceOutliers = [];

    for (const [code, refItem] of ref.entries()) {
      const item = offerMap.get(code);

      if (!item) {
        missing.push(code);
        continue;
      }

      if (Number(item.quantity) !== Number(refItem.quantity)) {
        quantityMismatches.push({
          code,
          reference: refItem.quantity,
          offered: item.quantity
        });
      }

      const rr = Number(refItem.rate || 0);
      const or = Number(item.rate || 0);
      if (rr > 0 && (or > rr * 1.35 || or < rr * 0.65)) {
        priceOutliers.push({
          code,
          referenceRate: rr,
          offeredRate: or
        });
      }
    }

    const total = (offer.items || []).reduce(
      (s, i) => s + Number(i.total ?? Number(i.quantity || 0) * Number(i.rate || 0)),
      0
    );

    return {
      contractor: offer.contractor,
      total: round(total, 2),
      missing,
      quantityMismatches,
      priceOutliers
    };
  });
}

// -----------------------------------------------------------------------------
// Family Mode
// -----------------------------------------------------------------------------

export function summarizeFamilyVotes(votes = []) {
  const byTopic = new Map();

  for (const vote of votes) {
    const key = vote.topic;
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(Number(vote.value || 0));
  }

  const topics = [];

  for (const [topic, values] of byTopic.entries()) {
    const avg = average(values);
    const spread = Math.max(...values) - Math.min(...values);

    topics.push({
      topic,
      agreement: round((1 - clamp(spread / 2, 0, 1)) * 100, 1),
      averagePreference: round(avg, 2),
      conflict: spread >= 1.2
    });
  }

  return {
    topics,
    overallAgreement: topics.length
      ? round(average(topics.map(t => t.agreement)), 1)
      : 100
  };
}

// -----------------------------------------------------------------------------
// Future Home
// -----------------------------------------------------------------------------

export function assessFutureReadiness(project, design) {
  const needs = project.customer?.futureNeeds || [];
  const checks = [];

  for (const need of needs) {
    const supported = Boolean(design.futureReadiness?.[need]);
    checks.push({
      need,
      supported,
      message: supported
        ? `التصميم يدعم المتطلب المستقبلي: ${need}`
        : `يحتاج التصميم إلى معالجة المتطلب المستقبلي: ${need}`
    });
  }

  return {
    score: checks.length ? checks.filter(c => c.supported).length / checks.length : 1,
    checks
  };
}

// -----------------------------------------------------------------------------
// Journey Steps
// -----------------------------------------------------------------------------

export function getJourneySteps() {
  return [
    { id: 'welcome', title: 'البداية', action: 'اختيار طريقة التصميم' },
    { id: 'site', title: 'الأرض', action: 'تعريف الأرض وتحليلها' },
    { id: 'household', title: 'العائلة', action: 'فهم نمط الحياة' },
    { id: 'spaces', title: 'الفراغات', action: 'اختيار ما يريده العميل' },
    { id: 'dislikes', title: 'المرفوضات', action: 'تسجيل ما لا يريده العميل' },
    { id: 'relationships', title: 'العلاقات', action: 'ربط الفراغات وظيفيًا' },
    { id: 'style', title: 'الطراز', action: 'اختيار الهوية البصرية' },
    { id: 'design_dna', title: 'Design DNA', action: 'تلخيص شخصية البيت' },
    { id: 'concepts', title: 'البدائل', action: 'إنتاج اتجاهات تصميم مختلفة' },
    { id: 'evaluation', title: 'التقييم', action: 'تحليل ومقارنة البدائل' },
    { id: 'edit', title: 'التعديل', action: 'تعديل ذكي مع حفظ النسخ' },
    { id: 'simulation', title: 'المحاكاة', action: 'اختبار الحركة والخصوصية والهدر' },
    { id: 'approval', title: 'الاعتماد', action: 'تجميد النسخة المعتمدة' },
    { id: 'drawings', title: 'المخططات', action: 'إخراج المخططات الهندسية' },
    { id: 'boq', title: 'BOQ', action: 'استخراج الكميات والتكلفة' },
    { id: 'tender', title: 'المناقصات', action: 'مقارنة عروض المقاولين' },
    { id: 'execution', title: 'التنفيذ', action: 'ربط الكميات والتكلفة والتنفيذ' }
  ];
}

export function getFeatureRegistry() {
  return structuredCloneSafe(FEATURE_REGISTRY);
}

// -----------------------------------------------------------------------------
// Explanation Layer
// -----------------------------------------------------------------------------

function explainEvaluation(project, design, raw, blockers) {
  const notes = [];

  if (raw.privacy >= 0.8) {
    notes.push('الفصل بين الضيافة والعائلة جيد ويحقق خصوصية مرتفعة.');
  } else if (raw.privacy < 0.6) {
    notes.push('يوجد تقارب زائد بين مناطق الضيافة والمناطق الخاصة.');
  }

  if (raw.spaceEfficiency >= 0.82) {
    notes.push('استغلال المساحة جيد مع نسبة مرتفعة من المساحات المفيدة.');
  } else if (raw.spaceEfficiency < 0.7) {
    notes.push('يوجد هدر أو حركة زائدة يمكن استعادتها لصالح الفراغات الأساسية.');
  }

  if (raw.functionalAdjacency < 0.65) {
    notes.push('بعض العلاقات الوظيفية لا تتوافق مع تفضيلات العميل المسجلة.');
  }

  if (blockers.length) {
    notes.push(`يوجد ${blockers.length} عائق يجب حله قبل اعتماد التصميم.`);
  }

  if (!notes.length) {
    notes.push('التصميم متوازن مبدئيًا وفق البيانات الحالية.');
  }

  return notes;
}

// -----------------------------------------------------------------------------
// Geometry Helpers
// -----------------------------------------------------------------------------

function getSpaceDistance(design, aType, bType) {
  const a = findSpace(design, aType);
  const b = findSpace(design, bType);

  if (!a || !b || !a.center || !b.center) return null;

  const dx = Number(a.center.x || 0) - Number(b.center.x || 0);
  const dy = Number(a.center.y || 0) - Number(b.center.y || 0);

  return Math.sqrt(dx * dx + dy * dy);
}

function findSpace(design, type) {
  return (design.spaces || []).find(s =>
    s.type === type || s.id === type || s.name === type
  );
}

// -----------------------------------------------------------------------------
// Utility
// -----------------------------------------------------------------------------

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const out = Array.isArray(target) ? [...target] : { ...target };

  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] || {}, v);
    } else {
      out[k] = v;
    }
  }

  return out;
}

function normalizeWeights(weights) {
  const out = {};
  let total = 0;

  for (const metric of DESIGN_METRICS) {
    const value = Math.max(0, Number(weights[metric] ?? DEFAULT_METRIC_WEIGHTS[metric] ?? 0));
    out[metric] = value;
    total += value;
  }

  if (!total) return { ...DEFAULT_METRIC_WEIGHTS };

  for (const metric of DESIGN_METRICS) {
    out[metric] = out[metric] / total;
  }

  return out;
}

function normalizedMetric(value, fallback = 0.6) {
  if (value === undefined || value === null) return clamp(fallback, 0, 1);
  const num = Number(value);
  if (num > 1) return clamp(num / 100, 0, 1);
  return clamp(num, 0, 1);
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function mapObject(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v, k)]));
}

function average(values = []) {
  return values.length ? values.reduce((s, v) => s + Number(v || 0), 0) / values.length : 0;
}

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * p) / p;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function max01(a, b) {
  return clamp(Math.max(Number(a || 0), Number(b || 0)), 0, 1);
}

// -----------------------------------------------------------------------------
// Example — يمكن حذفه عند الدمج
// -----------------------------------------------------------------------------

export function createExampleProject() {
  const project = createMizanProject({
    language: 'ar',
    mode: 'design_with_me'
  });

  updateProjectProfile(project, {
    site: {
      dimensions: { width: 25, depth: 50 },
      streets: [
        { side: 'west', width: 25 },
        { side: 'east', width: 8 }
      ],
      northAngle: 0
    },
    program: {
      maxBuiltArea: 500
    },
    customer: {
      futureNeeds: ['future_floor', 'elevator_ready']
    }
  });

  addPreference(project, {
    key: 'privacy_high',
    label: 'خصوصية مرتفعة',
    state: 'wanted',
    priority: 'very_important'
  });

  addPreference(project, {
    key: 'avoid_long_corridors',
    label: 'لا أريد ممرات طويلة',
    state: 'rejected',
    priority: 'very_important'
  });

  addRelationship(project, {
    from: 'kitchen',
    to: 'dining',
    type: RELATION_TYPES.DIRECT,
    priority: 'very_important'
  });

  addRelationship(project, {
    from: 'men_majlis',
    to: 'bedroom',
    type: RELATION_TYPES.FAR,
    priority: 'very_important'
  });

  deriveDesignDNA(project);
  analyzeSite(project);

  return project;
}
