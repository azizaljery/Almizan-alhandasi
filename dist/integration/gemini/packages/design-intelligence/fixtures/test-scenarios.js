/**
 * @file test-scenarios.js
 * @description Standardized fixture contexts covering all 20 required benchmark test cases.
 */

import { StreetCondition } from '../contracts/pattern.contract.js';

export const TEST_SCENARIOS = {
  // 1. Rectangular plot with single street
  scenario1_rectangularSingleStreet: {
    plot: { areaSqM: 450, frontageM: 18, depthM: 25, streetCondition: StreetCondition.ONE_STREET },
    requirements: { typology: 'RESIDENTIAL_VILLA' }
  },

  // 2. Plot on two streets (Opposite Through-plot)
  scenario2_twoStreetsOpposite: {
    plot: { areaSqM: 520, frontageM: 16, depthM: 32.5, streetCondition: StreetCondition.TWO_STREETS_OPPOSITE },
    requirements: { typology: 'RESIDENTIAL_VILLA' }
  },

  // 3. Corner plot
  scenario3_cornerPlot: {
    plot: { areaSqM: 480, frontageM: 20, depthM: 24, streetCondition: StreetCondition.TWO_STREETS_CORNER },
    requirements: { typology: 'RESIDENTIAL_VILLA' }
  },

  // 4. Narrow and deep plot
  scenario4_narrowDeep: {
    plot: { areaSqM: 300, frontageM: 10, depthM: 30, streetCondition: StreetCondition.ONE_STREET },
    requirements: { typology: 'RESIDENTIAL_VILLA' }
  },

  // 5. High privacy requirement
  scenario5_highPrivacy: {
    plot: { areaSqM: 500, frontageM: 18, depthM: 27.7, streetCondition: StreetCondition.ONE_STREET },
    requirements: { highPrivacy: true, privacyLevel: 'HIGH', mustIsolateMajlisAcoustically: true }
  },

  // 6. Independent Men Majlis
  scenario6_menMajlis: {
    plot: { areaSqM: 450, frontageM: 18, depthM: 25, streetCondition: StreetCondition.ONE_STREET },
    requirements: { needsMenMajlis: true }
  },

  // 7. Women Majlis
  scenario7_womenMajlis: {
    plot: { areaSqM: 450, frontageM: 18, depthM: 25, streetCondition: StreetCondition.ONE_STREET },
    requirements: { needsWomenMajlis: true }
  },

  // 8. Mother / Elderly Suite
  scenario8_motherSuite: {
    plot: { areaSqM: 500, frontageM: 20, depthM: 25, streetCondition: StreetCondition.ONE_STREET },
    requirements: { needsMotherSuite: true }
  },

  // 9. Kitchen & Service Zone
  scenario9_kitchenService: {
    plot: { areaSqM: 450, frontageM: 18, depthM: 25, streetCondition: StreetCondition.ONE_STREET },
    requirements: { needsDualKitchen: true, needsDirtyKitchen: true, requiresDiscreteServiceAccess: true }
  },

  // 10. Three Entrances
  scenario10_threeEntrances: {
    plot: { areaSqM: 550, frontageM: 20, depthM: 27.5, streetCondition: StreetCondition.ONE_STREET },
    requirements: {
      requestedEntrances: [
        { type: 'GUEST', name: 'Formal Guest Portal' },
        { type: 'FAMILY', name: 'Daily Family Portal' },
        { type: 'SERVICE', name: 'Kitchen & Delivery Service Portal' }
      ]
    }
  },

  // 11. Pattern geometrically feasible but violates privacy
  scenario11_privacyViolationPattern: {
    plot: { areaSqM: 500, frontageM: 20, depthM: 25, streetCondition: StreetCondition.ONE_STREET },
    requirements: {
      highPrivacy: true,
      mustIsolateMajlisAcoustically: true,
      userSpatialGraph: {
        nodes: [
          { id: 'GUEST_MAJLIS', label: 'Guest Majlis' },
          { id: 'BEDROOM_WING', label: 'Family Bedrooms' }
        ],
        edges: [
          { source: 'GUEST_MAJLIS', target: 'BEDROOM_WING', edgeType: 'MUST_SEPARATE' }
        ]
      }
    }
  },

  // 12. Pattern sound architecturally but bad aspect ratio
  scenario12_badAspectRatio: {
    plot: { areaSqM: 500, frontageM: 10, depthM: 50, streetCondition: StreetCondition.ONE_STREET }, // ratio 0.20 (super deep)
    requirements: { targetPatternId: 'PAT-MACRO-WIDE-FRONT' } // wide-front needs 1.4 - 2.2
  },

  // 13. Three similar concepts (Diversity failure test)
  scenario13_threeSimilarConcepts: [
    {
      patternId: 'PAT-VAR-L-1',
      name: 'L-Shaped Villa Var 1',
      circulationStrategy: 'L-Shaped Corridor',
      entranceStrategies: ['SPLIT_GUEST_FAMILY'],
      aspectRatioRange: [0.7, 1.1],
      privacyStrategy: 'Corner Buffer',
      serviceStrategy: 'Side Strip',
      tags: ['l-shape', 'garden']
    },
    {
      patternId: 'PAT-VAR-L-2',
      name: 'L-Shaped Villa Var 2',
      circulationStrategy: 'L-Shaped Corridor',
      entranceStrategies: ['SPLIT_GUEST_FAMILY'],
      aspectRatioRange: [0.72, 1.12],
      privacyStrategy: 'Corner Buffer',
      serviceStrategy: 'Side Strip',
      tags: ['l-shape', 'garden', 'pool']
    },
    {
      patternId: 'PAT-VAR-L-3',
      name: 'L-Shaped Villa Var 3',
      circulationStrategy: 'L-Shaped Corridor',
      entranceStrategies: ['SPLIT_GUEST_FAMILY'],
      aspectRatioRange: [0.68, 1.08],
      privacyStrategy: 'Corner Buffer',
      serviceStrategy: 'Side Strip',
      tags: ['l-shape', 'patio']
    }
  ],

  // 14. Three distinct concepts (Diversity pass test)
  scenario14_threeDiverseConcepts: [
    {
      patternId: 'PAT-MACRO-L-SHAPED',
      name: 'L-Shaped Villa with Private Garden Pocket',
      circulationStrategy: 'Dual-axial circulation with guest foyer facing front street',
      entranceStrategies: ['SPLIT_GUEST_FAMILY', 'TRI_ENTRANCE'],
      aspectRatioRange: [0.6, 1.3],
      privacyStrategy: 'High privacy threshold via L-bend buffer',
      serviceStrategy: 'Peripheral service spine positioned on zero-lot-line',
      tags: ['l-shape', 'private-garden', 'family-privacy']
    },
    {
      patternId: 'PAT-MACRO-COURTYARD',
      name: 'Central Courtyard Inward-Looking House (Al-Finaa)',
      circulationStrategy: 'Peristyle ambulatory cloister surrounding the central court',
      entranceStrategies: ['COURTYARD_CENTRIC'],
      aspectRatioRange: [0.75, 1.4],
      privacyStrategy: 'Absolute internal visual privacy via solid outer perimeter',
      serviceStrategy: 'Dedicated lateral service shaft and back delivery corridor',
      tags: ['courtyard', 'finaa', 'inward-looking', 'ultimate-privacy']
    },
    {
      patternId: 'PAT-MACRO-LINEAR-VILLA',
      name: 'Linear Bar Villa (Single-Loaded Spine)',
      circulationStrategy: 'Linear side gallery with floor-to-ceiling glass wall',
      entranceStrategies: ['SINGLE_PORTAL'],
      aspectRatioRange: [0.55, 0.9],
      privacyStrategy: 'Progressive linear threshold from front to rear',
      serviceStrategy: 'Lateral service core placed on party wall side',
      tags: ['linear-bar', 'contemporary', 'glass-corridor']
    }
  ],

  // 15. Reference without provenance
  scenario15_missingProvenance: {
    patternId: 'PAT-TEST-NO-PROVENANCE',
    name: 'Unattributed Pattern',
    provenance: { source: '', sourceType: '' }
  },

  // 16. Stale reference
  scenario16_staleReference: {
    patternId: 'PAT-TEST-STALE',
    name: 'Ancient Pattern Record',
    provenance: {
      source: 'Old Municipal Archive 2005',
      sourceType: 'HEURISTIC',
      verifiedAt: '2005-01-01'
    }
  },

  // 17. Duplicate pattern test
  scenario17_duplicatePattern: {
    patternId: 'PAT-MACRO-L-SHAPED', // Already exists in library
    name: 'L-Shaped Villa with Private Garden Pocket'
  },

  // 18. Knowledge conflict
  scenario18_knowledgeConflict: {
    plot: { areaSqM: 400, frontageM: 8.0, depthM: 50, streetCondition: StreetCondition.ONE_STREET },
    requirements: { targetPatternId: 'PAT-MACRO-COURTYARD' } // Courtyard requires min 18m frontage
  },

  // 19. No suitable pattern (Extreme tiny parcel)
  scenario19_noSuitablePattern: {
    plot: { areaSqM: 40, frontageM: 4.0, depthM: 10, streetCondition: StreetCondition.ONE_STREET },
    requirements: { typology: 'VILLA' }
  },

  // 20. Multiple equally suitable patterns (Symmetrical 500m² parcel)
  scenario20_multipleEquallySuitable: {
    plot: { areaSqM: 500, frontageM: 20, depthM: 25, streetCondition: StreetCondition.ONE_STREET },
    requirements: { typology: 'VILLA', needsMenMajlis: true }
  }
};
