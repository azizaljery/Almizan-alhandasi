/**
 * @file pattern.contract.js
 * @description Strongly typed contract and validator for MIZAN Design Patterns.
 */

import { ProvenanceLevel, VerificationStatus } from './knowledge-taxonomy.contract.js';

export const PatternCategory = {
  MACRO_LAYOUT: 'MACRO_LAYOUT',     // Whole-building morphological archetypes (e.g. L-Shape, Courtyard)
  MICRO_ZONE: 'MICRO_ZONE',         // Sub-system space clusters (e.g. Men Majlis suite, Mother suite)
  CIRCULATION: 'CIRCULATION',       // Vestibule, corridor, stair spine strategies
  SERVICE_CORE: 'SERVICE_CORE'      // Wet zones, kitchen-pantry-maid clusters
};

export const EntranceStrategy = {
  SINGLE_PORTAL: 'SINGLE_PORTAL',
  SPLIT_GUEST_FAMILY: 'SPLIT_GUEST_FAMILY',
  TRI_ENTRANCE: 'TRI_ENTRANCE',                 // Separate Guest, Family, Service
  COURTYARD_CENTRIC: 'COURTYARD_CENTRIC'
};

export const StreetCondition = {
  ONE_STREET: 'ONE_STREET',
  TWO_STREETS_CORNER: 'TWO_STREETS_CORNER',
  TWO_STREETS_OPPOSITE: 'TWO_STREETS_OPPOSITE',
  THREE_STREETS: 'THREE_STREETS',
  FOUR_STREETS: 'FOUR_STREETS'
};

export function validatePattern(pattern) {
  const mandatoryFields = [
    'patternId',
    'version',
    'name',
    'category',
    'description',
    'applicableBuildingTypes',
    'plotConditions',
    'areaRange',
    'aspectRatioRange',
    'streetConditions',
    'entranceStrategies',
    'zones',
    'requiredAdjacencies',
    'preferredAdjacencies',
    'forbiddenAdjacencies',
    'circulationStrategy',
    'privacyStrategy',
    'serviceStrategy',
    'orientationHints',
    'daylightHints',
    'ventilationHints',
    'geometryHints',
    'advantages',
    'tradeoffs',
    'limitations',
    'tags',
    'provenance',
    'confidence'
  ];

  for (const field of mandatoryFields) {
    if (pattern[field] === undefined || pattern[field] === null) {
      throw new Error(`Pattern validation error: Missing mandatory field "${field}" in pattern ${pattern.patternId || 'UNKNOWN'}`);
    }
  }

  if (typeof pattern.confidence !== 'number' || pattern.confidence < 0 || pattern.confidence > 1) {
    throw new Error(`Pattern ${pattern.patternId} has invalid confidence value (must be 0.0 - 1.0)`);
  }

  if (!pattern.provenance.source || !pattern.provenance.sourceType) {
    throw new Error(`Pattern ${pattern.patternId} must have provenance.source and provenance.sourceType`);
  }

  return true;
}
