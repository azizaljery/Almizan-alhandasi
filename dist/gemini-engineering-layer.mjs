import { CoordinationOrchestrator } from './gemini/engineering-core/core/coordination-orchestrator.js';
import { DesignIntelligenceEngine } from './gemini/design-intelligence/index.js';
import { GeometricEquations } from './gemini/engineering-math/src/index.js';
import { DETERMINISTIC_FINGERPRINT_ALGORITHM, deterministicFingerprint } from './gemini/shared/deterministic-hash.js';

const MM = 1000;
const GROUND_LEVEL = 'LVL-GF';
const ROOM_TYPE_TO_FUNCTION = {
  bedroom: 'BEDROOM', majlis: 'LIVING', living: 'LIVING', dining: 'LIVING',
  kitchen: 'KITCHEN', bath: 'BATHROOM', storage: 'STORAGE', service: 'STORAGE',
  corridor: 'CORRIDOR'
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
      hvacSystem: 'PRELIMINARY_LOAD_ONLY_NO_SELECTED_SYSTEM'
    },
    limitations: [
      'المراجعة مبدئية وليست تصميمًا تنفيذيًا أو اعتمادًا نظاميًا أو رخصة بناء.',
      'لا توجد أعمدة أو قواعد أو أحمال أو تمديدات كهرباء وسباكة أو نظام تكييف فعلي في مخطط المصدر؛ لذلك لا يتم اختلاق فحص لها.',
      'تظهر العلامات على 2D فقط عندما ترتبط الملاحظة بفراغ معروف في المخطط.'
    ],
    traceability: { geometryFingerprintAlgorithm: DETERMINISTIC_FINGERPRINT_ALGORITHM, note: 'Browser fingerprint is deterministic traceability only; it is not SHA-256.' }
  };
}
