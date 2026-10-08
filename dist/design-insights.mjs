// Preliminary, model-derived design indicators. These are comparison aids, not
// building-code, acoustic, daylight, energy, valuation, or security approvals.
import { quantities } from './planner.mjs';
import { assessPlan } from './plan-evidence.mjs';

const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const round = value => Math.round(clamp(value) * 10) / 10;

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

export function designInsights(model) {
  const e = assessPlan(model), q = quantities(model);
  const card = (key, label, axis) => ({ key, label, ...axis });
  const cards = [
    card('privacy', 'فصل حركة الضيافة والعائلة', e.privacy),
    card('ergonomic', 'الحركة عبر الممرات', e.circulation),
    card('social', 'وصول الضيافة والعائلة', e.access),
    card('acoustic', 'العزل الصوتي', e.acoustic),
    card('light', 'الفراغات ذات النوافذ', e.daylight),
    { key: 'storage', label: 'نسبة فراغات التخزين', status: 'ESTIMATE', score: model.rooms.filter(r => r.type === 'storage').reduce((s, r) => s + r.w * r.h, 0) / q.rooms * 100, detail: 'حصة التخزين المخصص من صافي الغرف؛ جودة التنظيم غير مُقيّمة.' },
    { key: 'coverage', label: 'نسبة بصمة الأرض', status: 'ESTIMATE', score: q.footprint / (model.plot.width * model.plot.length) * 100, detail: 'نسبة هندسية مع استبعاد الفناء؛ المطابقة التنظيمية غير مُقيّمة.' },
    { key: 'topography', label: 'مناسيب الموقع', status: 'NOT_EVALUATED', score: null, detail: 'لا يوجد رفع مساحي أو مناسيب أرض فعلية.' }
  ];
  return { overall: null, cards, security: null,
    note: 'مؤشرات مقارنة أولية من البيانات المتاحة؛ المحاور غير المُقيّمة لا تُمنح درجات افتراضية. هذه المؤشرات لا تصلح للاعتماد التنفيذي.' };
}
