/**
 * @file negative-patterns.js
 * @description Catalog of documented architectural anti-patterns and known spatial failure modes.
 */

import { RejectedPatternCase } from '../contracts/feedback.contract.js';

export const KNOWN_NEGATIVE_PATTERNS = [
  new RejectedPatternCase({
    caseId: 'ANTI-PAT-001',
    patternId: 'GUEST_CROSSING_FAMILY_AXIS',
    context: { typology: 'RESIDENTIAL_VILLA', priority: 'HIGH_PRIVACY' },
    reasonRejected: 'Guest circulation to formal dining crosses directly through daily family living room, destroying domestic privacy during hosting events.',
    hardConflict: true,
    softConflict: false,
    userRejection: true,
    geometryFailure: false,
    privacyFailure: true,
    circulationFailure: true,
    recordedAt: '2025-11-20T10:00:00Z'
  }),
  new RejectedPatternCase({
    caseId: 'ANTI-PAT-002',
    patternId: 'PLUMBING_STACK_OVER_FORMAL_MAJLIS',
    context: { typology: 'LUXURY_VILLA', standard: 'ACOUSTIC_EXCELLENCE' },
    reasonRejected: 'Upper bathroom drainage pipe routed directly above high-end decorative gypsum ceiling of main Men Majlis, causing acoustic noise and water damage vulnerability.',
    hardConflict: false,
    softConflict: true,
    userRejection: true,
    geometryFailure: false,
    privacyFailure: false,
    circulationFailure: false,
    recordedAt: '2025-12-05T14:30:00Z'
  }),
  new RejectedPatternCase({
    caseId: 'ANTI-PAT-003',
    patternId: 'DEEP_PLOT_UNVENTED_BEDROOM',
    context: { plotAspect: 'NARROW_DEEP_NO_LIGHTWELL' },
    reasonRejected: 'Attempting to fit bedrooms in the dark central third of a 30m deep plot without a central courtyard or light-well, violating statutory natural ventilation codes.',
    hardConflict: true,
    softConflict: false,
    userRejection: false,
    geometryFailure: true,
    privacyFailure: false,
    circulationFailure: false,
    recordedAt: '2026-01-14T09:15:00Z'
  }),
  new RejectedPatternCase({
    caseId: 'ANTI-PAT-004',
    patternId: 'UNSCREENED_FRONT_DOOR_SIGHTLINE',
    context: { privacyLevel: 'TRADITIONAL_HIGH' },
    reasonRejected: 'Front exterior door opens directly aligned with internal private family staircase, exposing family movement to street whenever deliveries arrive.',
    hardConflict: false,
    softConflict: true,
    userRejection: true,
    geometryFailure: false,
    privacyFailure: true,
    circulationFailure: false,
    recordedAt: '2026-02-02T11:45:00Z'
  })
];
