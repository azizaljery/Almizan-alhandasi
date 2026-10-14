import { CoordinationOrchestrator } from './gemini/engineering-core/core/coordination-orchestrator.js';
import { DesignIntelligenceEngine } from './gemini/design-intelligence/index.js';
import { GeometricEquations } from './gemini/engineering-math/src/index.js';
import { DETERMINISTIC_FINGERPRINT_ALGORITHM, deterministicFingerprint } from './gemini/shared/deterministic-hash.js';
import { unverifiedCheck, toEvidenceRow } from './regulatory-checks.mjs';

// Arabic labels for the fixed, small set of internal rule IDs the Gemini
// engineering-core rules registry can fire. This is a lookup table for known
// IDs, not machine translation of the subsystem.
const ARABIC_RULE_LABELS = {
  'RULE-SBC-1101-CORRIDOR-WIDTH-01': 'الحد الأدنى لعرض الممر (كود البناء السكني SBC 1101)',
  'RULE-SBC-1101-CEILING-HEIGHT-02': 'الحد الأدنى لارتفاع السقف (كود البناء السكني SBC 1101)',
  'RULE-ARCH-HEURISTIC-DOOR-SWING-03': 'مساحة انفتاح الأبواب (قاعدة تخطيطية داخلية، غير نظامية)',
  'RULE-STRUCT-HEURISTIC-SPAN-01': 'تقدير بحر البلاطة الخرسانية (قاعدة إنشائية تقديرية، غير نظامية)',
  'RULE-STRUCT-HEURISTIC-STACKING-02': 'استمرارية مسار الأحمال بين الأدوار (قاعدة إنشائية تقديرية، غير نظامية)',
  'RULE-SBC-401-PANEL-CLEARANCE-01': 'الخلوص الأدنى حول لوحة الكهرباء (كود الكهرباء السعودي SBC 401)',
  'RULE-SBC-401-DEDICATED-SPACE-03': 'مساحة مخصصة لمعدات الكهرباء (كود الكهرباء السعودي SBC 401)',
  'RULE-ELEC-HEURISTIC-LOAD-DENSITY-02': 'كثافة الحمل الكهربائي التقديرية (قاعدة تقديرية، غير نظامية)',
  'RULE-PLUMB-HEURISTIC-WATER-OVER-ELEC-01': 'فصل مسارات المياه عن الكهرباء (قاعدة تنسيقية تقديرية، غير نظامية)',
  'RULE-PLUMB-HEURISTIC-WET-STACKING-02': 'تراصف فراغات السباكة الرطبة بين الأدوار (قاعدة تقديرية، غير نظامية)',
  'RULE-HVAC-HEURISTIC-PLENUM-DEPTH-01': 'عمق فراغ تمديدات التكييف (قاعدة تقديرية، غير نظامية)',
  'RULE-HVAC-HEURISTIC-COOLING-RATE-02': 'معدل التبريد التقديري الإقليمي (قاعدة تقديرية، غير نظامية)',
};
const ruleArabicLabel = rule => ARABIC_RULE_LABELS[rule.ruleId] || ('قاعدة داخلية غير مترجمة (معرّفها: ' + rule.ruleId + ')');

/**
 * Surfaces the rule-source metadata the engineering core already resolves per
 * fired rule (coordination.engineeringProvenance.appliedRules) to the user,
 * split into two lists that must never be merged:
 *  - regulatory: rules the internal registry classifies as citing a real
 *    statutory code (SBC). This module cannot itself confirm those citations
 *    against the current official SBC text, so each one is surfaced as an
 *    honest "لم يتم التحقق" regulatory check that discloses exactly what the
 *    internal registry claims (document, edition, section, its own recorded
 *    verification date) without asserting independent verification or a
 *    pass/fail verdict.
 *  - heuristicRules: rules the registry itself labels as internal,
 *    non-statutory heuristics (RuleClassification.PRELIMINARY_HEURISTIC) —
 *    kept out of the regulatory list so they are never mistaken for a code
 *    citation.
 */
export function describeEngineeringProvenance(coordination) {
  const applied = coordination?.engineeringProvenance?.appliedRules || [];
  const regulatory = applied
    .filter(rule => rule.classification === 'STATUTORY_SBC')
    .map(rule => toEvidenceRow(unverifiedCheck({
      rule: ruleArabicLabel(rule),
      measuredLabel: 'تصنيف القاعدة في سجل محرك Gemini الهندسي الداخلي',
      measuredValue: null,
      verificationNote: 'السجل الداخلي يستشهد بـ' + (rule.reference || rule.documentId || 'مصدر غير محدد') +
        (rule.subsection ? '، ' + rule.subsection : '') +
        (rule.verifiedAt ? ' (تاريخ تحقق داخلي مسجل: ' + rule.verifiedAt + ')' : '') +
        '. لم تُراجع هذه الاستشهادات بشكل مستقل مقابل النص الرسمي الحالي لكود البناء السعودي؛ لذلك لا تُعرض كمطابقة أو مخالفة مؤكدة لهذا الكود.',
    }), {
      id: 'gemini-rule-' + rule.ruleId,
      category: 'استشهادات كود مُدرجة داخليًا في محرك Gemini (غير محققة بشكل مستقل)',
    }));
  const heuristicRules = applied
    .filter(rule => rule.classification === 'PRELIMINARY_HEURISTIC')
    .map(rule => ruleArabicLabel(rule) + ' — قاعدة داخلية غير نظامية' + (rule.reference ? ' (' + rule.reference + ')' : '') + '.');
  return { regulatory, heuristicRules };
}

const MM = 1000;
const GROUND_LEVEL = 'LVL-GF';
const ROOM_TYPE_TO_FUNCTION = {
  bedroom: 'BEDROOM', majlis: 'LIVING', living: 'LIVING', dining: 'LIVING',
  kitchen: 'KITCHEN', bath: 'BATHROOM', storage: 'STORAGE', service: 'STORAGE',
  corridor: 'CORRIDOR', office: 'LIVING'
};

const pointMm = (x, y) => [Math.round(x * MM), Math.round(y * MM)];
const rectanglePolygonMm = ({ x, y, w, h }) => [
  pointMm(x, y), pointMm(x + w, y), pointMm(x + w, y + h), pointMm(x, y + h)
];
const normal = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function roomFunction(room) {
  if (room.type === 'bedroom' && /master|مستر|رئيسية/i.test(room.name)) return 'MASTER_BEDROOM';
  return ROOM_TYPE_TO_FUNCTION[room.type] || 'LIVING';
}

function streetCondition(streets = {}) {
  const enabled = Object.entries(streets).filter(([, on]) => on).map(([side]) => side);
  if (enabled.length <= 1) return 'ONE_STREET';
  if (enabled.length === 2) return (enabled.includes('n') && enabled.includes('s')) || (enabled.includes('e') && enabled.includes('w')) ? 'TWO_STREETS_OPPOSITE' : 'TWO_STREETS_CORNER';
  return enabled.length === 3 ? 'THREE_STREETS' : 'FOUR_STREETS';
}

function openingPositionMm(model, opening) {
  const wall = model.walls.find(item => item.id === opening.wallId);
  return wall ? pointMm(wall.x1 + (wall.x2 - wall.x1) * opening.pos, wall.y1 + (wall.y2 - wall.y1) * opening.pos) : null;
}

function designContext(model) {
  const rooms = model.rooms || [];
  const names = rooms.map(room => room.name).join(' ');
  const frontageM = ['n', 's'].includes(model.plot.entry) ? model.plot.width : model.plot.length;
  return {
    requestId: `MIZAN-${deterministicFingerprint({ plot: model.plot, rooms: rooms.map(room => room.id) }).slice(0, 16)}`,
    plot: {
      areaSqM: normal(model.plot.width) * normal(model.plot.length),
      frontageM,
      depthM: ['n', 's'].includes(model.plot.entry) ? model.plot.length : model.plot.width,
      streetCondition: streetCondition(model.plot.streets)
    },
    requirements: {
      typology: 'RESIDENTIAL_VILLA',
      needsMenMajlis: /رجال|men/i.test(names),
      needsWomenMajlis: /نساء|women/i.test(names),
      needsMotherSuite: /والدة|أم|mother|elderly|كبار السن/i.test(names),
      needsDualKitchen: rooms.filter(room => room.type === 'kitchen').length > 1,
      hasUndifferentiatedMajlis: rooms.some(room => room.type === 'majlis')
    }
  };
}

export function toGeminiGeometry(model) {
  if (!model?.plot || !Array.isArray(model.rooms) || !Array.isArray(model.corridors) || !Array.isArray(model.walls) || !Array.isArray(model.openings)) {
    throw Error('لا يمكن إجراء مراجعة Gemini قبل توليد مخطط صالح.');
  }
  const spaces = [
    ...model.rooms.map(room => ({
      spaceId: `SPACE-${room.id}`, levelId: GROUND_LEVEL, name: room.name,
      functionalType: roomFunction(room), polygon2D: rectanglePolygonMm(room),
      netAreaSqM: Number((normal(room.w) * normal(room.h)).toFixed(3)),
      requiredHeadroomMm: 2600, hvacSystemType: 'UNSPECIFIED'
    })),
    ...model.corridors.map(corridor => ({
      spaceId: `SPACE-${corridor.id}`, levelId: GROUND_LEVEL, name: corridor.name,
      functionalType: 'CORRIDOR', polygon2D: rectanglePolygonMm(corridor),
      netAreaSqM: Number((normal(corridor.w) * normal(corridor.h)).toFixed(3)),
      nominalWidthMm: Math.round(Math.min(normal(corridor.w), normal(corridor.h)) * MM),
      requiredHeadroomMm: 2600, hvacSystemType: 'UNSPECIFIED'
    }))
  ];
  const openings = model.openings.map(opening => {
    const adjacentCorridor = opening.connects?.find(id => model.corridors.some(corridor => corridor.id === id));
    return {
      openingId: `OPENING-${opening.id}`, parentElementId: `WALL-${opening.wallId}`,
      levelId: GROUND_LEVEL, type: opening.type === 'door' ? 'DOOR' : 'WINDOW',
      position: openingPositionMm(model, opening), widthMm: Math.round(normal(opening.w) * MM),
      heightMm: Math.round(normal(opening.h) * MM),
      adjacentCorridorSpaceId: adjacentCorridor ? `SPACE-${adjacentCorridor}` : undefined,
      swingDirection: 'UNSPECIFIED'
    };
  });
  return {
    schemaVersion: 'claude-design-schema-v1.2',
    projectId: `MIZAN-PLAN-${deterministicFingerprint({ plot: model.plot, rooms: model.rooms.map(room => [room.id, room.x, room.y, room.w, room.h]) }).slice(0, 16)}`,
    units: 'METRIC_MM', defaultHVACSystem: 'UNSPECIFIED',
    levels: [{ levelId: GROUND_LEVEL, name: 'Ground Floor', elevationZ: 0, floorToCeilingHeight: 3200, slabThickness: 250 }],
    spaces, structuralElements: [],
    enclosureElements: model.walls.map(wall => ({
      elementId: `WALL-${wall.id}`, levelId: GROUND_LEVEL,
      type: wall.type === 'ext' ? 'EXTERIOR_WALL' : 'INTERIOR_PARTITION',
      startPoint: pointMm(wall.x1, wall.y1), endPoint: pointMm(wall.x2, wall.y2),
      thicknessMm: Math.round(normal(wall.t) * MM)
    })),
    openings, electricalEquipment: [], mepServiceZones: []
  };
}

function allIssues(coordination) {
  return [
    ...coordination.architecturalReview.issues,
    ...coordination.structuralCoordination.issues,
    ...coordination.electricalCoordination.issues,
    ...coordination.plumbingCoordination.issues,
    ...coordination.hvacCoordination.issues,
    ...coordination.crossDisciplineClashes
  ];
}

function markerRooms(model, issues) {
  const available = new Set([...model.rooms, ...model.corridors].map(space => space.id));
  const labels = new Map();
  for (const issue of issues) {
    for (const sourceId of issue.affectedSpaceIds || []) {
      const id = String(sourceId).replace(/^SPACE-/, '');
      if (!available.has(id)) continue;
      const current = labels.get(id);
      const severity = issue.severity === 'CRITICAL' ? 'critical' : issue.severity === 'MAJOR' ? 'major' : 'advisory';
      if (!current || severity === 'critical' || (severity === 'major' && current.severity === 'advisory')) labels.set(id, { id, severity, count: (current?.count || 0) + 1 });
      else current.count++;
    }
  }
  return [...labels.values()];
}

export function analyzeGeminiEngineering(model) {
  const geometry = toGeminiGeometry(model);
  const coordination = CoordinationOrchestrator.coordinate(geometry);
  const intelligence = new DesignIntelligenceEngine().retrieveCandidates(designContext(model), 3);
  const issues = allIssues(coordination);
  const footprintM2 = GeometricEquations.areaRectangle(normal(model.building.w), normal(model.building.h));
  const programmedAreaM2 = model.rooms.reduce((sum, room) => sum + normal(room.w) * normal(room.h), 0);
  const provenance = describeEngineeringProvenance(coordination);
  return {
    version: 'gemini-engineering-bridge-v2',
    status: 'PRELIMINARY_REVIEW',
    coordination,
    intelligence,
    markers: markerRooms(model, issues),
    findings: issues.map(issue => ({
      severity: issue.severity || 'ADVISORY',
      discipline: issue.discipline || (issue.involvedDisciplines || []).join(' / ') || 'COORDINATION',
      title: issue.title || issue.clashType || 'ملاحظة تنسيق',
      description: issue.description || 'ملاحظة تحتاج مراجعة.',
      suggestion: issue.suggestedRemedy || null
    })),
    math: {
      footprintM2: Number(footprintM2.toFixed(2)),
      programmedAreaM2: Number(programmedAreaM2.toFixed(2)),
      areaUtilizationRatio: footprintM2 > 0 ? Number((programmedAreaM2 / footprintM2).toFixed(3)) : 0
    },
    coverage: {
      architecturalGeometry: 'EVALUATED',
      patternIntelligence: 'EVALUATED',
      structuralSystem: 'NOT_EVALUATED_NO_STRUCTURAL_ELEMENTS',
      electricalLayout: 'NOT_EVALUATED_NO_ELECTRICAL_EQUIPMENT',
      plumbingRouting: 'NOT_EVALUATED_NO_VERTICAL_MEP_MODEL',
      hvacSystem: 'PRELIMINARY_LOAD_ONLY_NO_SELECTED_SYSTEM',
      statutoryCompliance: 'NOT_EVALUATED'
    },
    regulatory: provenance.regulatory,
    heuristicRules: provenance.heuristicRules,
    limitations: [
      'المراجعة مبدئية وليست تصميمًا تنفيذيًا أو اعتمادًا نظاميًا أو رخصة بناء.',
      'لا توجد أعمدة أو قواعد أو أحمال أو تمديدات كهرباء وسباكة أو نظام تكييف فعلي في مخطط المصدر؛ لذلك لا يتم اختلاق فحص لها.',
      'تظهر العلامات على 2D فقط عندما ترتبط الملاحظة بفراغ معروف في المخطط.',
      'استشهادات الكود النظامي (SBC) في سجل القواعد الداخلي لم تُراجع بشكل مستقل مقابل النص الرسمي الحالي؛ انظر «الاشتراطات النظامية المستشهد بها داخليًا» أدناه.'
    ],
    traceability: { geometryFingerprintAlgorithm: DETERMINISTIC_FINGERPRINT_ALGORITHM, note: 'Browser fingerprint is deterministic traceability only; it is not SHA-256.' }
  };
}
