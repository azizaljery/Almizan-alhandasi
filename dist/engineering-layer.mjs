import { CoordinationOrchestrator } from './gemini/engineering-core/core/coordination-orchestrator.js';
import { DesignIntelligenceEngine } from './gemini/design-intelligence/index.js';
import { GeometricEquations } from './gemini/engineering-math/src/index.js';
import { DETERMINISTIC_FINGERPRINT_ALGORITHM, deterministicFingerprint } from './gemini/shared/deterministic-hash.js';

const MM = 1000;
const GROUND_LEVEL = 'LVL-GF';

const ROOM_TYPE_TO_FUNCTION = {
  bedroom: 'BEDROOM',
  majlis: 'LIVING',
  living: 'LIVING',
  dining: 'LIVING',
  kitchen: 'KITCHEN',
  bath: 'BATHROOM',
  storage: 'STORAGE',
  service: 'STORAGE',
  corridor: 'CORRIDOR',
};

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
};

const pointMm = (x, y) => [Math.round(x * MM), Math.round(y * MM)];
const rectanglePolygonMm = ({ x, y, w, h }) => [
  pointMm(x, y), pointMm(x + w, y), pointMm(x + w, y + h), pointMm(x, y + h),
];

function openingPositionMm(model, opening) {
  const wall = model.walls.find(item => item.id === opening.wallId);
  if (!wall) return null;
  return pointMm(
    wall.x1 + (wall.x2 - wall.x1) * opening.pos,
    wall.y1 + (wall.y2 - wall.y1) * opening.pos,
  );
}

function roomFunction(room) {
  if (room.type === 'bedroom' && /master|مستر|رئيسية/i.test(room.name)) return 'MASTER_BEDROOM';
  return ROOM_TYPE_TO_FUNCTION[room.type] || 'LIVING';
}

function roomFeatures(rooms) {
  const names = rooms.map(room => room.name).join(' ');
  return {
    hasMenMajlis: /رجال|men/i.test(names),
    hasWomenMajlis: /نساء|women/i.test(names),
    hasMotherSuite: /والدة|أم|mother|elderly|كبار السن/i.test(names),
  };
}

function streetCondition(streets) {
  const enabled = Object.entries(streets).filter(([, active]) => active).map(([side]) => side);
  if (enabled.length <= 1) return 'ONE_STREET';
  if (enabled.length === 2) {
    return enabled.includes('n') && enabled.includes('s') || enabled.includes('e') && enabled.includes('w')
      ? 'TWO_STREETS_OPPOSITE'
      : 'TWO_STREETS_CORNER';
  }
  return enabled.length === 3 ? 'THREE_STREETS' : 'FOUR_STREETS';
}

function designContext(model) {
  const features = roomFeatures(model.rooms);
  const majlisCount = model.rooms.filter(room => room.type === 'majlis').length;
  const kitchenCount = model.rooms.filter(room => room.type === 'kitchen').length;
  const frontageM = ['n', 's'].includes(model.plot.entry) ? model.plot.width : model.plot.length;

  return {
    requestId: `MIZAN-${deterministicFingerprint({ plot: model.plot, program: model.program }).slice(0, 16)}`,
    plot: {
      areaSqM: model.plot.width * model.plot.length,
      frontageM,
      depthM: ['n', 's'].includes(model.plot.entry) ? model.plot.length : model.plot.width,
      streetCondition: streetCondition(model.plot.streets),
    },
    requirements: {
      typology: 'RESIDENTIAL_VILLA',
      needsMenMajlis: features.hasMenMajlis,
      needsWomenMajlis: features.hasWomenMajlis,
      needsMotherSuite: features.hasMotherSuite,
      needsDualKitchen: kitchenCount > 1,
      hasUndifferentiatedMajlis: majlisCount > 0,
    },
  };
}

/**
 * Adapts the existing local planner model to Gemini's published geometry contract.
 * It does not synthesize structure, electrical panels, plumbing paths, or HVAC systems.
 */
export function toGeminiGeometry(model) {
  if (!model?.plot || !Array.isArray(model.rooms) || !Array.isArray(model.corridors)) {
    throw new Error('لا يمكن إجراء مراجعة Gemini قبل توليد مخطط صالح.');
  }

  const spaces = [
    ...model.rooms.map(room => ({
      spaceId: `SPACE-${room.id}`,
      levelId: GROUND_LEVEL,
      name: room.name,
      functionalType: roomFunction(room),
      polygon2D: rectanglePolygonMm(room),
      netAreaSqM: Number((room.w * room.h).toFixed(3)),
      requiredHeadroomMm: 2600,
      hvacSystemType: 'UNSPECIFIED',
    })),
    ...model.corridors.map(corridor => ({
      spaceId: `SPACE-${corridor.id}`,
      levelId: GROUND_LEVEL,
      name: corridor.name,
      functionalType: 'CORRIDOR',
      polygon2D: rectanglePolygonMm(corridor),
      netAreaSqM: Number((corridor.w * corridor.h).toFixed(3)),
      nominalWidthMm: Math.round(Math.min(corridor.w, corridor.h) * MM),
      requiredHeadroomMm: 2600,
      hvacSystemType: 'UNSPECIFIED',
    })),
  ];

  const openings = model.openings.map(opening => {
    const position = openingPositionMm(model, opening);
    const adjacentCorridorId = opening.connects?.find(id => model.corridors.some(corridor => corridor.id === id));
    return {
      openingId: `OPENING-${opening.id}`,
      parentElementId: `WALL-${opening.wallId}`,
      levelId: GROUND_LEVEL,
      type: opening.type === 'door' ? 'DOOR' : 'WINDOW',
      position,
      widthMm: Math.round(opening.w * MM),
      heightMm: Math.round(opening.h * MM),
      adjacentCorridorSpaceId: adjacentCorridorId ? `SPACE-${adjacentCorridorId}` : undefined,
      swingDirection: 'UNSPECIFIED',
    };
  });

  return {
    schemaVersion: 'claude-design-schema-v1.2',
    projectId: `MIZAN-PLAN-${deterministicFingerprint({ plot: model.plot, program: model.program }).slice(0, 16)}`,
    units: 'METRIC_MM',
    defaultHVACSystem: 'UNSPECIFIED',
    levels: [{
      levelId: GROUND_LEVEL,
      name: 'Ground Floor',
      elevationZ: 0,
      floorToCeilingHeight: Math.round(3.2 * MM),
      slabThickness: 250,
    }],
    spaces,
    structuralElements: [],
    enclosureElements: model.walls.map(wall => ({
      elementId: `WALL-${wall.id}`,
      levelId: GROUND_LEVEL,
      type: wall.type === 'ext' ? 'EXTERIOR_WALL' : 'INTERIOR_PARTITION',
      startPoint: pointMm(wall.x1, wall.y1),
      endPoint: pointMm(wall.x2, wall.y2),
      thicknessMm: Math.round(wall.t * MM),
    })),
    openings,
    electricalEquipment: [],
    mepServiceZones: [],
  };
}

export function analyzeEngineeringLayer(model) {
  const geometry = toGeminiGeometry(model);
  const coordination = CoordinationOrchestrator.coordinate(geometry);
  const intelligence = new DesignIntelligenceEngine().retrieveCandidates(designContext(model), 3);
  const footprintM2 = GeometricEquations.areaRectangle(model.building.w, model.building.h);
  const programmedAreaM2 = model.rooms.reduce((total, room) => total + room.w * room.h, 0);

  return freeze({
    version: 'gemini-engineering-bridge-v1',
    status: 'PRELIMINARY_REVIEW',
    geometry,
    coordination,
    intelligence,
    math: {
      footprintM2: Number(footprintM2.toFixed(2)),
      programmedAreaM2: Number(programmedAreaM2.toFixed(2)),
      areaUtilizationRatio: footprintM2 > 0 ? Number((programmedAreaM2 / footprintM2).toFixed(3)) : 0,
    },
    coverage: {
      architecturalGeometry: 'EVALUATED',
      patternIntelligence: 'EVALUATED',
      structuralSystem: 'NOT_EVALUATED_NO_STRUCTURAL_ELEMENTS',
      electricalLayout: 'NOT_EVALUATED_NO_ELECTRICAL_EQUIPMENT',
      plumbingRouting: 'NOT_EVALUATED_NO_VERTICAL_MEP_MODEL',
      hvacSystem: 'NOT_EVALUATED_SYSTEM_NOT_SELECTED',
    },
    limitations: [
      'المراجعة مبدئية وليست تصميماً تنفيذياً أو اعتماداً نظامياً أو رخصة بناء.',
      'لا توجد أعمدة أو قواعد أو أحمال أو تمديدات كهرباء وسباكة أو نظام تكييف فعلي في مخطط المصدر؛ لذلك لا يتم اختلاق فحص لها.',
      'المجالس غير المصنفة رجال/نساء لا تُحوَّل تلقائياً إلى متطلبات خصوصية محددة.',
    ],
    traceability: {
      geometryFingerprintAlgorithm: DETERMINISTIC_FINGERPRINT_ALGORITHM,
      note: 'The browser fingerprint is for deterministic traceability only and is not SHA-256 or a security control.',
    },
  });
}
