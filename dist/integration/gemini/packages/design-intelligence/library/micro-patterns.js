/**
 * @file micro-patterns.js
 * @description Specialized architectural sub-systems and micro-zone patterns for Saudi residential design.
 */

import { PatternCategory } from '../contracts/pattern.contract.js';
import { ProvenanceLevel, VerificationStatus } from '../contracts/knowledge-taxonomy.contract.js';

export const MICRO_PATTERNS = [
  {
    patternId: 'PAT-MICRO-MEN-MAJLIS',
    version: '1.2.0',
    name: 'Autonomous Men Majlis Suite with Dedicated Restrooms',
    category: PatternCategory.MICRO_ZONE,
    description: 'Self-contained formal hospitality suite with direct street entrance, washroom vestibule, and direct access to formal dining, completely isolated from family corridors.',
    applicableBuildingTypes: ['VILLA', 'MANSION', 'DUPLEX'],
    plotConditions: { minPlotArea: 250, maxPlotArea: 3000, minFrontageM: 10, minDepthM: 18, aspectRatioRange: [0.3, 2.5], streetConditions: [] },
    areaRange: [35, 120],
    aspectRatioRange: [0.3, 2.5],
    streetConditions: [],
    entranceStrategies: [],
    zones: ['MEN_MAJLIS_HALL', 'POWDER_ROOM_VESTIBULE', 'FORMAL_DINING_CONNECTION'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['MEN_ENTRANCE', 'MEN_MAJLIS_HALL'],
      ['MEN_MAJLIS_HALL', 'POWDER_ROOM_VESTIBULE']
    ],
    preferredAdjacencies: [
      ['MEN_MAJLIS_HALL', 'DINING_ROOM']
    ],
    forbiddenAdjacencies: [
      ['MEN_MAJLIS_HALL', 'FAMILY_LIVING'],
      ['MEN_MAJLIS_HALL', 'KITCHEN_DAILY']
    ],
    circulationStrategy: 'Direct frontal approach from external gate to majlis foyer without penetrating building core.',
    privacyStrategy: 'Absolute visual and acoustic cutoff from family living.',
    serviceStrategy: 'Discrete coffee/tea service staging station adjacent to entrance.',
    orientationHints: { streetFacingOrCorner: true },
    daylightHints: { formalDignifiedDaylighting: true },
    ventilationHints: { heavyOccupancyHVACAndSmokeExhaust: true },
    geometryHints: { minClearWidthM: 4.8 },
    advantages: ['Enables hospitality at any hour without compromising family comfort'],
    tradeoffs: ['Requires dedicated plumbing stack and washroom zone'],
    limitations: ['Must be situated near external property boundary or front setback'],
    tags: ['men-majlis', 'hospitality', 'formal-reception', 'guest-suite'],
    provenance: { source: 'Saudi Housing Cultural Guidelines', sourceType: ProvenanceLevel.VERIFIED, version: '2024.1', verifiedAt: '2026-01-10', verificationStatus: VerificationStatus.CERTIFIED },
    confidence: 0.98
  },
  {
    patternId: 'PAT-MICRO-MOTHER-SUITE',
    version: '1.1.0',
    name: 'Ground-Floor Mother / Elderly Suite with Garden Access',
    category: PatternCategory.MICRO_ZONE,
    description: 'Universal-accessibility master suite positioned on the ground floor with zero steps, extra-wide doors (>=900mm), roll-in shower, acoustic tranquility, and direct morning sun garden patio.',
    applicableBuildingTypes: ['VILLA', 'MANSION'],
    plotConditions: { minPlotArea: 320, maxPlotArea: 3000, minFrontageM: 12, minDepthM: 20, aspectRatioRange: [0.4, 2.0], streetConditions: [] },
    areaRange: [28, 55],
    aspectRatioRange: [0.4, 2.0],
    streetConditions: [],
    entranceStrategies: [],
    zones: ['BEDROOM_SANCTUARY', 'ROLL_IN_BATHROOM', 'PRIVATE_TEA_CORNER', 'SHADED_GARDEN_PATIO'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['BEDROOM_SANCTUARY', 'ROLL_IN_BATHROOM'],
      ['BEDROOM_SANCTUARY', 'FAMILY_LIVING']
    ],
    preferredAdjacencies: [
      ['BEDROOM_SANCTUARY', 'SHADED_GARDEN_PATIO'],
      ['BEDROOM_SANCTUARY', 'PRAYER_CORNER']
    ],
    forbiddenAdjacencies: [
      ['BEDROOM_SANCTUARY', 'GUEST_MAJLIS'],
      ['BEDROOM_SANCTUARY', 'DIRTY_KITCHEN_NOISE']
    ],
    circulationStrategy: 'Short, step-free corridor connected gently to family living and dining.',
    privacyStrategy: 'High acoustic shielding from service areas and street noise, while maintaining effortless integration into family gatherings.',
    serviceStrategy: 'Direct caregiver or family assistance proximity.',
    orientationHints: { morningSunEastOrSouthEast: true },
    daylightHints: { biophilicGardenViews: true },
    ventilationHints: { gentleDraftFreeHVAC: true },
    geometryHints: { clearDoorWidthMm: 950, turningRadiusMm: 1500 },
    advantages: ['Lifetime universal accessibility, dignity, and deep emotional comfort for elderly parents'],
    tradeoffs: ['Consumes valuable ground-floor building footprint'],
    limitations: ['Must not be positioned adjacent to high-noise mechanical rooms or garage doors'],
    tags: ['mother-suite', 'elderly-care', 'universal-accessibility', 'ground-floor-master', 'biophilic'],
    provenance: { source: 'Saudi Social Housing & Universal Accessibility Code (SBC 201/1101 & Care Standards)', sourceType: ProvenanceLevel.VERIFIED, version: '2024.1', verifiedAt: '2026-01-25', verificationStatus: VerificationStatus.CERTIFIED },
    confidence: 0.99
  },
  {
    patternId: 'PAT-MICRO-WOMEN-MAJLIS',
    version: '1.0.0',
    name: 'Women Formal Reception Salon (Majlis Al-Nisaa)',
    category: PatternCategory.MICRO_ZONE,
    description: 'Intimate, warm formal reception space designed with direct proximity to family living and dining, featuring sophisticated acoustic isolation from the men majlis.',
    applicableBuildingTypes: ['VILLA', 'MANSION'],
    plotConditions: { minPlotArea: 350, maxPlotArea: 2500, minFrontageM: 14, minDepthM: 20, aspectRatioRange: [0.5, 2.0], streetConditions: [] },
    areaRange: [25, 60],
    aspectRatioRange: [0.5, 2.0],
    streetConditions: [],
    entranceStrategies: [],
    zones: ['WOMEN_SALON', 'POWDER_ROOM', 'CLOAK_VESTIBULE'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['WOMEN_SALON', 'POWDER_ROOM']
    ],
    preferredAdjacencies: [
      ['WOMEN_SALON', 'DINING_ROOM'],
      ['WOMEN_SALON', 'FAMILY_LIVING']
    ],
    forbiddenAdjacencies: [
      ['WOMEN_SALON', 'MEN_MAJLIS_HALL']
    ],
    circulationStrategy: 'Can be entered from either a secondary front portal or through family foyer.',
    privacyStrategy: 'Visual screening from external street and complete acoustic isolation from men majlis.',
    serviceStrategy: 'Smooth catering service path from kitchen.',
    orientationHints: { gardenAspect: true },
    daylightHints: { softDiffuseDaylight: true },
    ventilationHints: { comfortAcousticZoning: true },
    geometryHints: { minWidthM: 4.2 },
    advantages: ['Multi-generational flexibility: can serve as secondary family salon when not hosting'],
    tradeoffs: ['Requires deliberate acoustic buffer walls if sharing a wall with dining'],
    limitations: ['Should not have direct sightlines from men guest foyer'],
    tags: ['women-majlis', 'family-salon', 'reception', 'flexible-living'],
    provenance: { source: 'Contemporary Saudi Architectural Practice Manual', sourceType: ProvenanceLevel.VERIFIED, version: '2024.1', verifiedAt: '2026-02-01', verificationStatus: VerificationStatus.CERTIFIED },
    confidence: 0.94
  },
  {
    patternId: 'PAT-MICRO-KITCHEN-SERVICE',
    version: '1.2.0',
    name: 'Dual Kitchen & Service Backstage (Show Kitchen + Dirty Kitchen + Maid)',
    category: PatternCategory.MICRO_ZONE,
    description: 'Separation of the culinary zone into an aesthetic Show Kitchen (integrated with family living) and an enclosed Heavy/Dirty Cooking Kitchen with direct service entrance, pantry, and maid suite.',
    applicableBuildingTypes: ['VILLA', 'DUPLEX', 'MANSION'],
    plotConditions: { minPlotArea: 250, maxPlotArea: 3000, minFrontageM: 10, minDepthM: 18, aspectRatioRange: [0.3, 2.5], streetConditions: [] },
    areaRange: [30, 80],
    aspectRatioRange: [0.3, 2.5],
    streetConditions: [],
    entranceStrategies: [],
    zones: ['SHOW_KITCHEN', 'DIRTY_HEAVY_KITCHEN', 'PANTRY_STORE', 'MAID_ROOM_ENSUITE', 'LAUNDRY_ROOM'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['SHOW_KITCHEN', 'DIRTY_HEAVY_KITCHEN'],
      ['DIRTY_HEAVY_KITCHEN', 'SERVICE_ENTRANCE'],
      ['MAID_ROOM_ENSUITE', 'LAUNDRY_ROOM']
    ],
    preferredAdjacencies: [
      ['SHOW_KITCHEN', 'FAMILY_LIVING'],
      ['DIRTY_HEAVY_KITCHEN', 'DINING_ROOM']
    ],
    forbiddenAdjacencies: [
      ['DIRTY_HEAVY_KITCHEN', 'GUEST_RECEPTION_FOYER'],
      ['MAID_ROOM_ENSUITE', 'GUEST_MAJLIS']
    ],
    circulationStrategy: 'Independent back-of-house service corridor allowing deliveries and trash removal without crossing living rooms.',
    privacyStrategy: 'Olfactory, visual, and acoustic containment of heavy cooking and laundry machinery.',
    serviceStrategy: 'Direct connection to exterior service setback or garage.',
    orientationHints: { serviceFacingNorthOrWestSetback: true },
    daylightHints: { taskIlluminationWithDedicatedExhaust: true },
    ventilationHints: { highVolumeNegativePressureExhaust: true },
    geometryHints: { minDirtyKitchenWidthM: 2.8 },
    advantages: ['Zero cooking odors in living areas; enables modern open-plan luxury living with realistic heavy cooking capability'],
    tradeoffs: ['Requires duplicate plumbing and cabinetry investments'],
    limitations: ['Requires dedicated exterior wall for high-capacity hood exhaust'],
    tags: ['dual-kitchen', 'dirty-kitchen', 'show-kitchen', 'service-core', 'maid-suite'],
    provenance: { source: 'Saudi Residential MEP & Culinary Ergonomics Standards', sourceType: ProvenanceLevel.VERIFIED, version: '2024.1', verifiedAt: '2026-01-18', verificationStatus: VerificationStatus.CERTIFIED },
    confidence: 0.98
  },
  {
    patternId: 'PAT-MICRO-DINING-CONNECTION',
    version: '1.0.0',
    name: 'Dual-Access Shared Ceremonial Dining Room (Al-Muqlat)',
    category: PatternCategory.MICRO_ZONE,
    description: 'Centrally positioned dining salon accessible from both the Men Majlis (for formal banquets) and the Family Living zone via acoustic pocket sliding partitions.',
    applicableBuildingTypes: ['VILLA', 'MANSION'],
    plotConditions: { minPlotArea: 300, maxPlotArea: 2500, minFrontageM: 12, minDepthM: 20, aspectRatioRange: [0.4, 2.0], streetConditions: [] },
    areaRange: [20, 50],
    aspectRatioRange: [0.4, 2.0],
    streetConditions: [],
    entranceStrategies: [],
    zones: ['DINING_SPACE', 'CATERING_STAGING_PANTRY', 'ACOUSTIC_LOCK_DOORS'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['DINING_SPACE', 'MEN_MAJLIS_HALL'],
      ['DINING_SPACE', 'KITCHEN_SERVICE']
    ],
    preferredAdjacencies: [
      ['DINING_SPACE', 'FAMILY_LIVING']
    ],
    forbiddenAdjacencies: [
      ['DINING_SPACE', 'BEDROOM_HALLWAY']
    ],
    circulationStrategy: 'Dual sliding acoustic door axes allowing either space to absorb dining when needed.',
    privacyStrategy: 'Lockable double-leaf acoustic pocket doors preserve complete separation when dining is in formal guest use.',
    serviceStrategy: 'Discrete side server door from kitchen preventing catering carts from crossing guest rooms.',
    orientationHints: { centralBufferZone: true },
    daylightHints: { sideGardenGlazingOrLightwell: true },
    ventilationHints: { rapidOdorPurgeExhaust: true },
    geometryHints: { minDiningWidthM: 3.8, minTableLengthM: 3.2 },
    advantages: ['Eliminates the cost and square footage wastage of building two separate large dining rooms'],
    tradeoffs: ['Requires high-STC acoustic doors and strict operational scheduling'],
    limitations: ['Must be directly reachable from kitchen service'],
    tags: ['shared-dining', 'muqlat', 'dual-access', 'spatial-efficiency', 'formal-banquet'],
    provenance: { source: 'Saudi Architectural Efficiency Benchmark Studies', sourceType: ProvenanceLevel.VERIFIED, version: '2024.1', verifiedAt: '2026-02-15', verificationStatus: VerificationStatus.CERTIFIED },
    confidence: 0.96
  },
  {
    patternId: 'PAT-MICRO-PRIVACY-VESTIBULE',
    version: '1.0.0',
    name: 'Bent-Axis Privacy Vestibule (Al-Majaz / Screened Entry)',
    category: PatternCategory.CIRCULATION,
    description: 'Traditional bent-entry geometry (90-degree turn) preventing external visitors at the front door from looking into interior living spaces or private corridors.',
    applicableBuildingTypes: ['VILLA', 'DUPLEX', 'APARTMENT'],
    plotConditions: { minPlotArea: 150, maxPlotArea: 3000, minFrontageM: 8, minDepthM: 15, aspectRatioRange: [0.2, 3.0], streetConditions: [] },
    areaRange: [6, 18],
    aspectRatioRange: [0.2, 3.0],
    streetConditions: [],
    entranceStrategies: [],
    zones: ['VESTIBULE_FOYER', 'SIGHTLINE_DEFLECTOR_WALL'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['FRONT_DOOR', 'VESTIBULE_FOYER']
    ],
    preferredAdjacencies: [
      ['VESTIBULE_FOYER', 'GUEST_WARDROBE']
    ],
    forbiddenAdjacencies: [
      ['FRONT_DOOR', 'INTERNAL_STAIRCASE_DIRECT_SIGHTLINE']
    ],
    circulationStrategy: '90-degree orthogonal turn upon entering.',
    privacyStrategy: 'Zero direct sightlines from exterior threshold into domestic zones.',
    serviceStrategy: 'Provides drop-off console for courier deliveries and shoe storage.',
    orientationHints: { frontThreshold: true },
    daylightHints: { indirectAmbientBacklitScreen: true },
    ventilationHints: { thermalAirlockEffect: true },
    geometryHints: { minTurnDepthM: 1.8, minDeflectorWidthM: 1.5 },
    advantages: ['Maintains absolute family privacy even when front door stands wide open for deliveries'],
    tradeoffs: ['Adds 6-12 m² to entry circulation footprint'],
    limitations: ['Must be maintained step-free for wheelchair passage'],
    tags: ['vestibule', 'bent-entry', 'majaz', 'sightline-block', 'privacy-screen'],
    provenance: { source: 'Traditional Najdi & Hejazi Architectural Elements Archive', sourceType: ProvenanceLevel.VERIFIED, version: '2023.1', verifiedAt: '2026-01-12', verificationStatus: VerificationStatus.CERTIFIED },
    confidence: 0.97
  },
  {
    patternId: 'PAT-MICRO-WET-CORE',
    version: '1.0.0',
    name: 'Consolidated Wet-Core Plumbing Spine',
    category: PatternCategory.SERVICE_CORE,
    description: 'Back-to-back vertical stacking of bathrooms, powder rooms, and kitchen plumbing to minimize pipe runs, eliminate water leakage over dry zones, and optimize shaft access.',
    applicableBuildingTypes: ['VILLA', 'DUPLEX', 'TOWNHOUSE'],
    plotConditions: { minPlotArea: 150, maxPlotArea: 3000, minFrontageM: 8, minDepthM: 15, aspectRatioRange: [0.2, 3.0], streetConditions: [] },
    areaRange: [15, 45],
    aspectRatioRange: [0.2, 3.0],
    streetConditions: [],
    entranceStrategies: [],
    zones: ['WET_SHAFT', 'PLUMBING_CHASE', 'BACK_TO_BACK_STACKS'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['WET_SHAFT', 'GROUND_FLOOR_BATH'],
      ['WET_SHAFT', 'FIRST_FLOOR_BATH']
    ],
    preferredAdjacencies: [
      ['WET_SHAFT', 'EXTERNAL_SERVICE_CHASE']
    ],
    forbiddenAdjacencies: [
      ['WET_SHAFT', 'ELECTRICAL_PANEL_WALL']
    ],
    circulationStrategy: 'Purely vertical utility axis requiring zero horizontal slab suspensions.',
    privacyStrategy: 'Acoustic lagging within chase walls prevents flushing sounds from intruding into bedrooms.',
    serviceStrategy: 'Accessible maintenance hatch from service corridor or exterior terrace.',
    orientationHints: { nonOccupiedWallZone: true },
    daylightHints: { canBeInternallyVented: true },
    ventilationHints: { continuousRoofVentTermination: true },
    geometryHints: { minChaseDimensionsMm: [400, 600] },
    advantages: ['Eliminates plumbing leaks over living rooms and reduces piping cost by 35%'],
    tradeoffs: ['Requires architectural discipline in aligning upper and lower wet rooms'],
    limitations: ['Strict vertical alignment discipline required in early schematic design'],
    tags: ['wet-core', 'plumbing-stack', 'leak-prevention', 'mep-optimization', 'vertical-chase'],
    provenance: { source: 'Plumbing Engineering Best Practice Guide', sourceType: ProvenanceLevel.VERIFIED, version: '2024.1', verifiedAt: '2026-02-18', verificationStatus: VerificationStatus.CERTIFIED },
    confidence: 0.96
  }
];
