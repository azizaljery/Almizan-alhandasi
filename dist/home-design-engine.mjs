// Adapter between the attached home-design decision engine and Mizan's
// rectangular planner. The attached engine remains the source of the
// decision rules; this file only translates the planner's model shape.
import {
  createMizanProject,
  updateProjectProfile,
  addPreference,
  addRelationship,
  deriveDesignDNA,
  analyzeSite,
  evaluateDesign,
  compareDesigns,
  getFeatureRegistry,
  getJourneySteps
} from './mizan-home-design-engine.mjs';
import { quantities } from './planner.mjs';

const DISCOVERY_AVOIDS = [
  'الممرات الطويلة والمظلمة',
  'مرور الضيوف عبر خصوصية العائلة',
  'نوافذ كبيرة على شمس العصر الغربية',
  'صدى الصوت في الصالات والمجالس',
  'مطبخ بعيد عن الطعام والخدمات',
  'غرف نوم مكشوفة أو قريبة من الضيافة'
];

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function roomType(room, index) {
  const name = String(room.name || '').toLowerCase();
  if (room.type === 'majlis') return /نساء|women|female/.test(name) ? 'women_majlis' : 'men_majlis';
  if (room.type === 'living') return 'family_hall';
  if (room.type === 'dining') return 'dining';
  if (room.type === 'kitchen') return 'kitchen';
  if (room.type === 'bedroom') return /والدة|parent|mother/.test(name) ? 'parent_suite' : 'bedroom';
  if (room.type === 'bath') return index === 0 ? 'guest_wc' : 'bathroom';
  if (room.type === 'storage') return 'service_store';
  if (room.type === 'service') return 'service_room';
  return room.type || 'space';
}

function streetsFromPlot(plot = {}) {
  return Object.entries(plot.streets || {})
    .filter(([, enabled]) => enabled === true)
    .map(([side]) => ({ side }));
}

function addDiscoveryPreferences(project, discovery = {}) {
  const likes = Array.isArray(discovery.likes) ? discovery.likes : [];
  const rejects = Array.isArray(discovery.rejects) ? discovery.rejects : [];
  const avoids = Array.isArray(discovery.avoids) ? discovery.avoids : [];

  for (const key of likes) addPreference(project, { key: `like_${key}`, label: key, state: 'wanted', priority: 'important' });
  for (const key of rejects) addPreference(project, { key: `reject_${key}`, label: key, state: 'rejected', priority: 'very_important' });
  for (const label of avoids) {
    const index = DISCOVERY_AVOIDS.indexOf(label);
    const key = index === 1 ? 'avoid_guest_family_crossing'
      : index === 4 ? 'kitchen_near_dining'
        : index === 5 ? 'privacy_high'
          : index === 0 ? 'avoid_long_corridors'
            : `avoid_${index >= 0 ? index : label}`;
    addPreference(project, { key, label, state: 'rejected', priority: 'very_important' });
  }
}

function addDiscoveryRelationships(project, discovery = {}) {
  const avoids = Array.isArray(discovery.avoids) ? discovery.avoids : [];
  if (avoids.includes('مرور الضيوف عبر خصوصية العائلة')) {
    addRelationship(project, { from: 'men_majlis', to: 'family_hall', type: 'forbidden', priority: 'very_important', reason: 'منع عبور الضيوف في نطاق العائلة' });
  }
  if (avoids.includes('مطبخ بعيد عن الطعام والخدمات')) {
    addRelationship(project, { from: 'kitchen', to: 'dining', type: 'direct', priority: 'important', reason: 'تقريب المطبخ والطعام' });
  }
  if (avoids.includes('غرف نوم مكشوفة أو قريبة من الضيافة')) {
    addRelationship(project, { from: 'men_majlis', to: 'bedroom', type: 'far', priority: 'very_important', reason: 'إبعاد النوم عن الضيافة' });
  }
  if (discovery.life?.children === 'قريبون من الصالة') {
    addRelationship(project, { from: 'bedroom', to: 'family_hall', type: 'near', priority: 'important', reason: 'قرب غرف الأطفال من الصالة' });
  }
}

export function createEngineeringProject({ plot, rooms, discovery = {}, idea = '' } = {}) {
  const project = createMizanProject({ language: 'ar', mode: 'design_with_me' });
  const site = {
    dimensions: { width: finite(plot?.width), depth: finite(plot?.length) },
    streets: streetsFromPlot(plot),
    northAngle: 0,
    setbacks: { street: finite(plot?.streetSetback, 3), neighbor: finite(plot?.neighborSetback, 1.5) },
    maxFloors: finite(plot?.floors, 1)
  };
  const normalizedRooms = Array.isArray(rooms) ? rooms : [];
  updateProjectProfile(project, {
    customer: {
      language: 'ar',
      lifestyle: discovery.life || {},
      notes: String(idea || '').slice(0, 4000),
      futureNeeds: discovery.life?.future === 'مهمة' ? ['future_floor', 'elevator_ready'] : []
    },
    site,
    program: {
      spaces: normalizedRooms.map((room, index) => ({
        id: room.id || `room-${index}`,
        type: roomType(room, index),
        name: room.name,
        area: finite(room.area),
        position: room.position,
        side: room.side
      })),
      maxBuiltArea: plot?.maxBuiltArea ?? null
    }
  });
  addDiscoveryPreferences(project, discovery);
  addDiscoveryRelationships(project, discovery);
  deriveDesignDNA(project);
  analyzeSite(project);
  return project;
}

export function modelToEngineeringDesign(model, id = `plan-${model?.strategy || 'current'}`) {
  if (!model) throw Error('لا يوجد مخطط لتقييمه.');
  const q = quantities(model);
  const spaces = model.rooms.map((room, index) => ({
    id: room.id,
    type: roomType(room, index),
    name: room.name,
    area: finite(room.w * room.h, room.area),
    center: { x: finite(room.x + room.w / 2), y: finite(room.y + room.h / 2) },
    utilityScore: room.type === 'corridor' ? 0.4 : 0.8,
    useFrequency: ['living', 'kitchen', 'dining'].includes(room.type) ? 0.9 : 0.7,
    strategicValue: ['bedroom', 'living', 'kitchen'].includes(room.type) ? 0.85 : 0.6
  }));
  return {
    id,
    name: model.strategy || id,
    spaces,
    areas: {
      totalBuiltArea: q.footprint,
      circulation: q.circulation,
      waste: q.reserve,
      floor: q.rooms,
      ceiling: q.footprint,
      wallFinish: q.finishArea,
      paint: q.finishArea,
      masonry: q.wallArea,
      waterproofing: q.footprint,
      hvacServed: q.rooms,
      externalPaving: 0
    },
    counts: { doors: q.doors, windows: q.windows },
    metrics: {
      daylight: q.windows >= model.rooms.length ? 0.8 : 0.55,
      ventilation: q.windows >= model.rooms.length ? 0.8 : 0.55,
      constructability: 0.75,
      futureExpansion: 0.5
    },
    sourceModel: model
  };
}

export function evaluateHomeModel({ plot, rooms, discovery = {}, idea = '', model, id } = {}) {
  const project = createEngineeringProject({ plot, rooms, discovery, idea });
  const design = modelToEngineeringDesign(model, id);
  const evaluation = evaluateDesign(project, design);
  return { project, design, evaluation };
}

export function compareHomeModels({ plot, rooms, discovery = {}, idea = '', models = [] } = {}) {
  const rows = models.map((model, index) => evaluateHomeModel({
    plot,
    rooms,
    discovery,
    idea,
    model,
    id: `plan-${index}-${model.strategy || 'current'}`
  }));
  const comparison = rows.length
    ? compareDesigns(rows[0].project, rows.map(row => row.design))
    : { rows: [], generatedAt: new Date().toISOString() };
  const best = rows.reduce((winner, row) => !winner || row.evaluation.score > winner.evaluation.score ? row : winner, null);
  return { rows, comparison, bestId: best?.design.id || null, featureRegistry: getFeatureRegistry(), journey: getJourneySteps() };
}

export function buildEngineeringPromptContext({ plot, rooms, discovery = {}, idea = '', model = null } = {}) {
  const project = createEngineeringProject({ plot, rooms, discovery, idea });
  const current = model ? evaluateDesign(project, modelToEngineeringDesign(model)) : null;
  return {
    designDNA: project.designDNA,
    siteOpportunities: project.site.opportunities,
    preferences: project.preferences.map(({ key, label, state, priority }) => ({ key, label, state, priority })),
    relationships: project.relationships,
    currentEvaluation: current ? {
      score: current.score,
      metrics: current.metrics,
      blockers: current.blockers,
      explanations: current.explanations
    } : null
  };
}

