/**
 * @file reference-cases.js
 * @description Catalog of reference test fixtures.
 * NOTE: All fixtures here are explicitly synthetic test fixtures. They must NEVER be marked VERIFIED or CERTIFIED in production.
 */

import { VisualReference, VisualReferenceType } from '../contracts/reference-case.contract.js';
import { VerificationStatus, ProvenanceLevel } from '../contracts/knowledge-taxonomy.contract.js';

export const SYNTHETIC_REFERENCE_CASES = [
  {
    caseId: 'SYNTHETIC-REFERENCE-001',
    source: 'INTERNAL_SYNTHETIC_TEST_FIXTURE_SUITE',
    projectType: 'SINGLE_FAMILY_RESIDENCE_BENCHMARK',
    location: 'SYNTHETIC_LOCATION_ZONE_A',
    plot: { areaSqM: 600, frontageM: 20, depthM: 30, streets: ['NORTH_15M'] },
    program: { totalBedrooms: 5, hasMenMajlis: true, hasWomenMajlis: true, hasMotherSuite: true, floors: 2.5 },
    designPatternIds: ['PAT-MACRO-L-SHAPED', 'PAT-MICRO-MEN-MAJLIS', 'PAT-MICRO-MOTHER-SUITE', 'PAT-MICRO-KITCHEN-SERVICE'],
    geometrySummary: { footprintAreaSqM: 360, grossFloorAreaSqM: 710, far: 1.18, gardenAreaSqM: 240 },
    zones: ['GUEST_ZONE', 'FAMILY_ZONE', 'SERVICE_ZONE', 'PRIVATE_GARDEN_POOL'],
    verificationStatus: VerificationStatus.SYNTHETIC_TEST_FIXTURE,
    provenance: {
      authoringFirm: 'SYNTHETIC_TEST_STUDIO',
      licenseNumber: 'SYNTHETIC-TEST-LIC-000',
      sourceType: ProvenanceLevel.UNVERIFIED,
      verifiedAt: '2026-01-01',
      isSyntheticFixture: true
    },
    images: [
      new VisualReference({
        id: 'SYNTH-IMG-001',
        type: VisualReferenceType.FACADE_REFERENCE,
        uriOrPath: 'assets/synthetic/benchmark_facade_north.webp',
        caption: 'Synthetic neutral facade reference for benchmark testing'
      })
    ],
    drawings: [
      new VisualReference({
        id: 'SYNTH-DWG-001',
        type: VisualReferenceType.FLOOR_PLAN,
        uriOrPath: 'assets/synthetic/benchmark_ground_floor.pdf',
        caption: 'Synthetic neutral L-shape ground floor arrangement'
      })
    ]
  },
  {
    caseId: 'SYNTHETIC-REFERENCE-002',
    source: 'INTERNAL_SYNTHETIC_TEST_FIXTURE_SUITE',
    projectType: 'COASTAL_COURTYARD_RESIDENCE_BENCHMARK',
    location: 'SYNTHETIC_LOCATION_ZONE_B',
    plot: { areaSqM: 750, frontageM: 25, depthM: 30, streets: ['WEST_20M', 'SOUTH_12M'] },
    program: { totalBedrooms: 6, hasMenMajlis: true, hasWomenMajlis: true, hasMotherSuite: false, floors: 2.0 },
    designPatternIds: ['PAT-MACRO-COURTYARD', 'PAT-MACRO-CORNER-PLOT', 'PAT-MICRO-DINING-CONNECTION'],
    geometrySummary: { footprintAreaSqM: 420, grossFloorAreaSqM: 780, far: 1.04, courtAreaSqM: 110 },
    zones: ['CORNER_GUEST_SUITE', 'CENTRAL_WATER_COURT', 'FAMILY_LIVING_WING'],
    verificationStatus: VerificationStatus.SYNTHETIC_TEST_FIXTURE,
    provenance: {
      authoringFirm: 'SYNTHETIC_TEST_STUDIO',
      licenseNumber: 'SYNTHETIC-TEST-LIC-000',
      sourceType: ProvenanceLevel.UNVERIFIED,
      verifiedAt: '2026-01-01',
      isSyntheticFixture: true
    },
    images: [
      new VisualReference({
        id: 'SYNTH-IMG-002',
        type: VisualReferenceType.RENDER_3D,
        uriOrPath: 'assets/synthetic/benchmark_inner_court.webp',
        caption: 'Synthetic neutral courtyard visual rendering'
      })
    ],
    drawings: []
  }
];

// Alias for backwards compatibility with tests while enforcing synthetic classification
export const VERIFIED_REFERENCE_CASES = SYNTHETIC_REFERENCE_CASES;
