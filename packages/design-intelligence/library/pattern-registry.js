/**
 * @file pattern-registry.js
 * @description Scalable indexed Pattern Registry designed to support thousands of regional,
 * facade, interior, service, and accessibility patterns with zero architectural bloat.
 */

import { validatePattern } from '../contracts/pattern.contract.js';
import { KnowledgeQualityEvaluator } from '../evaluators/quality-evaluator.js';

export const ArchitecturalDomain = Object.freeze({
  MACRO_LAYOUT: 'MACRO_LAYOUT',
  MICRO_ZONE: 'MICRO_ZONE',
  CIRCULATION: 'CIRCULATION',
  SERVICE_CORE: 'SERVICE_CORE',
  FACADE_TREATMENT: 'FACADE_TREATMENT',
  INTERIOR_PRIVACY: 'INTERIOR_PRIVACY',
  ACCESSIBILITY_UNIVERSAL: 'ACCESSIBILITY_UNIVERSAL'
});

export const SaudiArchitecturalRegion = Object.freeze({
  UNIVERSAL_SAUDI: 'UNIVERSAL_SAUDI',
  NAJDI_CENTRAL: 'NAJDI_CENTRAL',
  HEJAZI_WESTERN: 'HEJAZI_WESTERN',
  EASTERN_GULF: 'EASTERN_GULF',
  SOUTHERN_ASIR: 'SOUTHERN_ASIR'
});

export class PatternRegistry {
  constructor() {
    this.patternsById = new Map();
    this.indexByCategory = new Map();
    this.indexByRegion = new Map();
    this.indexByTag = new Map();
  }

  /**
   * Registers a pattern with strict schema and quality validation.
   * @param {object} pattern
   * @param {boolean} [enforceQuality=true]
   */
  register(pattern, enforceQuality = true) {
    validatePattern(pattern);

    if (enforceQuality) {
      const existingList = Array.from(this.patternsById.values());
      const audit = KnowledgeQualityEvaluator.evaluateItem(pattern, existingList);
      if (!audit.isValid) {
        throw new Error(`Pattern "${pattern.patternId}" failed quality audit: ${audit.blockingIssues.join('; ')}`);
      }
    }

    this.patternsById.set(pattern.patternId, pattern);

    // Index by Category
    const cat = pattern.category || ArchitecturalDomain.MACRO_LAYOUT;
    if (!this.indexByCategory.has(cat)) {
      this.indexByCategory.set(cat, new Set());
    }
    this.indexByCategory.get(cat).add(pattern.patternId);

    // Index by Region
    const region = pattern.region || SaudiArchitecturalRegion.UNIVERSAL_SAUDI;
    if (!this.indexByRegion.has(region)) {
      this.indexByRegion.set(region, new Set());
    }
    this.indexByRegion.get(region).add(pattern.patternId);

    // Index by Tags
    if (pattern.tags) {
      for (const t of pattern.tags) {
        if (!this.indexByTag.has(t)) {
          this.indexByTag.set(t, new Set());
        }
        this.indexByTag.get(t).add(pattern.patternId);
      }
    }

    return true;
  }

  /**
   * Retrieves pattern by unique ID in O(1) time.
   */
  get(patternId) {
    return this.patternsById.get(patternId) || null;
  }

  /**
   * Queries patterns by criteria.
   */
  query({ category, region, tag, buildingType } = {}) {
    let candidateIds = null;

    if (category && this.indexByCategory.has(category)) {
      candidateIds = new Set(this.indexByCategory.get(category));
    }

    if (region && this.indexByRegion.has(region)) {
      const regionSet = this.indexByRegion.get(region);
      candidateIds = candidateIds ? new Set([...candidateIds].filter(id => regionSet.has(id))) : new Set(regionSet);
    }

    if (tag && this.indexByTag.has(tag)) {
      const tagSet = this.indexByTag.get(tag);
      candidateIds = candidateIds ? new Set([...candidateIds].filter(id => tagSet.has(id))) : new Set(tagSet);
    }

    const resultIds = candidateIds ? Array.from(candidateIds) : Array.from(this.patternsById.keys());
    let results = resultIds.map(id => this.patternsById.get(id));

    if (buildingType) {
      results = results.filter(p => !p.applicableBuildingTypes || p.applicableBuildingTypes.includes(buildingType));
    }

    return results;
  }

  getAll() {
    return Array.from(this.patternsById.values());
  }

  count() {
    return this.patternsById.size;
  }
}
