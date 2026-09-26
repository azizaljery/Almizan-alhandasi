// Preliminary, model-derived design indicators. These are comparison aids, not
// building-code, acoustic, daylight, energy, valuation, or security approvals.
import { quantities } from './planner.mjs';
import { rectangleArea, coverageRatio, occupancyDensity, slabAspectRatio, drainageSlope, weightedScore } from './engineering.mjs';
import { reviewPlan } from './audit.mjs';

const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const round = value => Math.round(clamp(value) * 10) / 10;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const occupiedTypes = new Set(['majlis', 'living', 'dining', 'bedroom']);

export class ErgonomicEfficiency {
  static calculateScore(layoutEfficiency, movementReduction, accessibility, visualComfort) {
    return round(layoutEfficiency * .30 + movementReduction * .25 + accessibility * .25 + visualComfort * .20);
  }
}

export class AcousticComfort {
  static calculateScore(wallInsulation, doorSealing, strategicPlacement, materialAbsorption) {
    return round(wallInsulation * .35 + doorSealing * .25 + strategicPlacement * .25 + materialAbsorption * .15);
  }

  static calculateSRI(transmissionCoefficient) {
    if (!(transmissionCoefficient > 0 && transmissionCoefficient <= 1)) throw Error('معامل النقل الصوتي يجب أن يكون أكبر من صفر وحتى 1.');
    return Math.round(-10 * Math.log10(transmissionCoefficient) * 10) / 10;
  }
}

export class SecurityPrivacy {
  static calculateSecurityScore(entryControl, windowPrivacy, lightingSecurity, perimeterProtection) {
    return Math.round(clamp(entryControl) * .30 + clamp(windowPrivacy) * .25 + clamp(lightingSecurity) * .25 + clamp(perimeterProtection) * .20);
  }

  static calculatePrivacyScore(interiorPrivacy, visualBlocking, soundIsolation, gardenSeclusion) {
    return Math.round(clamp(interiorPrivacy) * .40 + clamp(visualBlocking) * .30 + clamp(soundIsolation) * .20 + clamp(gardenSeclusion) * .10);
  }
}

export class BiophilicDesign {
  static calculateScore(naturalLight, plantIntegration, waterFeatures, naturalMaterials, outdoorConnection) {
    return round(naturalLight * .30 + plantIntegration * .25 + waterFeatures * .15 + naturalMaterials * .20 + outdoorConnection * .10);
  }
}

export class SmartStorage {
  static calculateStorageIndex(builtInStorage, dedicatedSpaces, accessibility, organizationPotential) {
    return round(builtInStorage * .40 + dedicatedSpaces * .30 + accessibility * .20 + organizationPotential * .10);
  }
}

export class SocialFlow {
  static calculateScore(visitorCirculation, gatheringSpace, pathwayEfficiency, zoneSeparation) {
    return round(visitorCirculation * .30 + gatheringSpace * .30 + pathwayEfficiency * .25 + zoneSeparation * .15);
  }
}

export class HolisticLivingExperience {
  static calculateScore(ergonomics, biophilic, socialFlow, privacy, comfort, aesthetics, efficiency) {
    return round(ergonomics * .15 + biophilic * .15 + socialFlow * .15 + privacy * .15 + comfort * .15 + aesthetics * .15 + efficiency * .10);
  }
}

function exteriorWindowRatio(model, rooms) {
  if (!rooms.length) return 0;
  return rooms.filter(room => model.openings.some(opening => opening.type === 'window' && opening.roomId === room.id)).length / rooms.length;
}

function uniquePositions(rooms) {
  return new Set(rooms.map(room => room.position)).size;
}

export function designInsights(model) {
  const review = reviewPlan(model);
  const q = quantities(model);
  const plotArea = rectangleArea(model.plot.width, model.plot.length);
  const builtCoverage = coverageRatio(q.footprint, plotArea);
  const compactness = 100 / Math.max(1, slabAspectRatio(model.plot.width, model.plot.length));
  const routeSlopeProxy = drainageSlope(Math.max(0, model.plot.length - model.building.h), Math.max(model.plot.length, 1));
  const rooms = model.rooms;
  const occupied = rooms.filter(room => occupiedTypes.has(room.type));
  const routes = [...review.routes.guests, ...review.routes.family, ...review.routes.service].filter(route => route.metres !== null);
  const averageRoute = average(routes.map(route => route.metres));
  const warnCount = review.issues.filter(issue => issue.level === 'warn').length;
  const majlis = rooms.filter(room => room.type === 'majlis');
  const bedrooms = rooms.filter(room => room.type === 'bedroom');
  const storage = rooms.filter(room => room.type === 'storage');
  const gathering = rooms.filter(room => ['majlis', 'living', 'dining'].includes(room.type));
  const hasGuestFamilyConflict = review.issues.some(issue => issue.text.includes('الضيوف والعائلة'));
  const exteriorRatio = exteriorWindowRatio(model, occupied);
  const circulationEfficiency = q.footprint ? clamp(100 - Math.max(0, review.circulationRatio - .12) * 400) : 0;
  const movement = clamp(100 - Math.max(0, averageRoute - 8) * 7);
  const accessibility = clamp(100 - (model.corridors.some(corridor => Math.min(corridor.w, corridor.h) < 1.2) ? 25 : 0) - (averageRoute > 15 ? 20 : 0));
  const ergonomic = ErgonomicEfficiency.calculateScore(circulationEfficiency, movement, accessibility, exteriorRatio * 100);
  const privacy = SecurityPrivacy.calculatePrivacyScore(
    hasGuestFamilyConflict ? 35 : (majlis.length && bedrooms.length ? 82 : 60),
    exteriorRatio * 65,
    uniquePositions([...majlis, ...bedrooms]) >= 2 ? 70 : 45,
    0,
  );
  const security = SecurityPrivacy.calculateSecurityScore(
    model.openings.filter(opening => opening.type === 'door' && opening.connects?.includes('outside')).length === 1 ? 75 : 50,
    privacy,
    0,
    0,
  );
  const acoustic = AcousticComfort.calculateScore(0, 0, uniquePositions([...majlis, ...bedrooms]) >= 2 ? 70 : 35, 0);
  const biophilic = BiophilicDesign.calculateScore(exteriorRatio * 100, 0, 0, 0, exteriorRatio * 100);
  const storageIndex = SmartStorage.calculateStorageIndex(
    storage.length ? 55 : 0,
    storage.length ? clamp(storage.reduce((sum, room) => sum + room.area, 0) / Math.max(q.rooms, 1) * 600) : 0,
    storage.length ? 70 : 0,
    storage.length ? 55 : 0,
  );
  const social = SocialFlow.calculateScore(
    hasGuestFamilyConflict ? 40 : 75,
    clamp(gathering.reduce((sum, room) => sum + room.area, 0) / 60 * 100),
    movement,
    hasGuestFamilyConflict ? 35 : 75,
  );
  const overall = weightedScore([{weight: .15, value: ergonomic}, {weight: .15, value: biophilic}, {weight: .15, value: social}, {weight: .15, value: privacy}, {weight: .15, value: average([ergonomic, acoustic])}, {weight: .15, value: compactness}, {weight: .10, value: circulationEfficiency}]);

  const cards = [
    { key: 'privacy', label: 'الخصوصية والحركة', score: privacy, detail: hasGuestFamilyConflict ? 'هناك اشتراك مرصود لمسار الضيوف والعائلة.' : 'فصل الحركة يُقاس من مسارات الممرات المتاحة.' },
    { key: 'ergonomic', label: 'سهولة الاستخدام', score: ergonomic, detail: `متوسط مسار الغرف ${averageRoute ? averageRoute.toFixed(1) : '—'} م عبر الممرات.` },
    { key: 'social', label: 'الضيافة والتجمع', score: social, detail: `${gathering.length} فراغات تجمع ضمن البرنامج.` },
    { key: 'acoustic', label: 'الهدوء النسبي', score: acoustic, detail: 'يقيس فصل مواقع الضيافة والنوم فقط؛ لا يحسب عزل الجدران.' },
    { key: 'light', label: 'الانفتاح الخارجي', score: biophilic, detail: `${Math.round(exteriorRatio * 100)}٪ من الفراغات المأهولة لها نافذة مرسومة.` },
    { key: 'storage', label: 'التخزين', score: storageIndex, detail: storage.length ? `${storage.length} فراغ تخزين مخصص في المخطط.` : 'لا يوجد فراغ تخزين مخصص في البرنامج.' },
    { key: 'coverage', label: 'استغلال الأرض', score: Math.min(100, builtCoverage * 100 / Math.max(model.plot.coverage || .75, .1)), detail: `بصمة البناء ${Math.round(builtCoverage * 100)}٪ من الأرض؛ هذه نسبة هندسية للحساب وليست اعتمادًا تنظيميًا.` },
    { key: 'topography', label: 'فرق العمق', score: Math.max(0, 100 - routeSlopeProxy * 100), detail: `فرق تقريبي بين عمق الأرض والكتلة ${routeSlopeProxy.toFixed(2)}؛ لا يمثل مناسيب الموقع.` },
  ];
  return {
    overall,
    cards,
    note: `مؤشرات مقارنة أولية محسوبة من مخطط الدور الأرضي فقط. لا تحسب المواد، الإضاءة الفعلية، العزل الصوتي، النباتات، الإنارة الأمنية أو حدود الأرض؛ لذلك لا تصلح للاعتماد التنفيذي. ${warnCount ? `يوجد ${warnCount} تنبيه تخطيطي ظاهر أدناه.` : ''}`.trim(),
    security,
  };
}
