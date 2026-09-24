/**
 * @file macro-patterns.js
 * @description The foundational catalogue of 14 macro-architectural layout patterns.
 */

import { PatternCategory, EntranceStrategy, StreetCondition } from '../contracts/pattern.contract.js';
import { ProvenanceLevel, VerificationStatus } from '../contracts/knowledge-taxonomy.contract.js';

export const MACRO_PATTERNS = [
  {
    patternId: 'PAT-MACRO-L-SHAPED',
    version: '1.2.0',
    name: 'L-Shaped Villa with Private Garden Pocket',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Two perpendicular wings embracing a private rear/side garden, enabling direct visual connection while segregating guest from family circulation.',
    applicableBuildingTypes: ['VILLA', 'DUPLEX', 'MANSION'],
    plotConditions: {
      minPlotArea: 350,
      maxPlotArea: 900,
      minFrontageM: 15,
      minDepthM: 22,
      aspectRatioRange: [0.6, 1.3],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [300, 750],
    aspectRatioRange: [0.6, 1.3],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.SPLIT_GUEST_FAMILY, EntranceStrategy.TRI_ENTRANCE],
    zones: ['GUEST_RECEPTION', 'FAMILY_LIVING', 'SERVICE_QUARTERS', 'BEDROOM_WING', 'PRIVATE_GARDEN'],
    spaceRelationships: [
      { from: 'GUEST_RECEPTION', to: 'PRIVATE_GARDEN', type: 'INDIRECT_VIEW' },
      { from: 'FAMILY_LIVING', to: 'PRIVATE_GARDEN', type: 'DIRECT_OPENING' }
    ],
    requiredAdjacencies: [
      ['GUEST_ENTRANCE', 'GUEST_RECEPTION'],
      ['FAMILY_ENTRANCE', 'FAMILY_LIVING'],
      ['KITCHEN', 'SERVICE_ENTRANCE']
    ],
    preferredAdjacencies: [
      ['FAMILY_LIVING', 'PRIVATE_GARDEN'],
      ['GUEST_RECEPTION', 'DINING']
    ],
    forbiddenAdjacencies: [
      ['GUEST_RECEPTION', 'BEDROOM_WING'],
      ['GUEST_ENTRANCE', 'SERVICE_QUARTERS']
    ],
    circulationStrategy: 'Dual-axial circulation with guest foyer facing front street and family corridor hugging garden perimeter.',
    privacyStrategy: 'High privacy threshold via L-bend buffer separating formal reception from internal family living.',
    serviceStrategy: 'Peripheral service spine positioned on zero-lot-line or service setback side with direct dirty kitchen delivery.',
    orientationHints: { idealGardenOrientation: 'NORTH_EAST', bufferWingOrientation: 'WEST' },
    daylightHints: { primaryGlazingFacings: ['NORTH', 'EAST'], bufferSolidFacings: ['WEST'] },
    ventilationHints: { crossVentilationAxis: 'DIAGONAL_CORNER_TO_COURT' },
    geometryHints: { minWingWidthM: 6.5, minGardenDepthM: 6.0 },
    advantages: ['Natural enclosure creates sheltered private courtyard without high interior walls', 'Clear acoustic isolation between formal majlis and family zones'],
    tradeoffs: ['Requires minimum 15m plot frontage', 'Slightly higher envelope surface-to-volume ratio than compact box'],
    limitations: ['Not suitable for extremely narrow deep plots with frontage under 12m'],
    tags: ['l-shape', 'private-garden', 'family-privacy', 'dual-entrance', 'saudi-villa'],
    provenance: {
      source: 'Center for Built Environment & Contemporary Saudi Housing Morphology Study (2024)',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2024.1',
      verifiedAt: '2026-01-15',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.95
  },
  {
    patternId: 'PAT-MACRO-COURTYARD',
    version: '1.4.0',
    name: 'Central Courtyard Inward-Looking House (Al-Finaa)',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Centrally sheltered courtyard archetype maximizing introspective privacy, bioclimatic microclimate cooling, and acoustic isolation from surrounding urban noise.',
    applicableBuildingTypes: ['VILLA', 'TRADITIONAL_MODERN_VILLA', 'MANSION'],
    plotConditions: {
      minPlotArea: 450,
      maxPlotArea: 1400,
      minFrontageM: 18,
      minDepthM: 24,
      aspectRatioRange: [0.75, 1.4],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_OPPOSITE]
    },
    areaRange: [380, 950],
    aspectRatioRange: [0.75, 1.4],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_OPPOSITE],
    entranceStrategies: [EntranceStrategy.COURTYARD_CENTRIC, EntranceStrategy.SPLIT_GUEST_FAMILY],
    zones: ['CENTRAL_COURT', 'GUEST_WING', 'FAMILY_WING', 'SERVICE_WING', 'UPPER_BEDROOMS'],
    spaceRelationships: [
      { from: 'FAMILY_WING', to: 'CENTRAL_COURT', type: 'PANORAMIC_CONNECTION' },
      { from: 'GUEST_WING', to: 'CENTRAL_COURT', type: 'CONTROLLED_GLAZED_SCREEN' }
    ],
    requiredAdjacencies: [
      ['FAMILY_WING', 'CENTRAL_COURT'],
      ['GUEST_ENTRANCE', 'GUEST_WING']
    ],
    preferredAdjacencies: [
      ['DINING', 'CENTRAL_COURT'],
      ['UPPER_BEDROOMS', 'CENTRAL_COURT']
    ],
    forbiddenAdjacencies: [
      ['GUEST_WING', 'FAMILY_PRIVATE_ROOMS'],
      ['KITCHEN_SERVICE', 'GUEST_MAIN_APPROACH']
    ],
    circulationStrategy: 'Peristyle ambulatory cloister surrounding the central court acting as primary thermal and visual buffer.',
    privacyStrategy: 'Absolute internal visual privacy; exterior envelope can be relatively solid while interiors enjoy 100% open glazing towards court.',
    serviceStrategy: 'Dedicated lateral service shaft and back delivery corridor decoupled from internal court ambulatory.',
    orientationHints: { courtyardMicroclimate: 'SHADED_SOUTH_TALL_WALL_NORTH_LOW_MASS' },
    daylightHints: { zenithalTopLighting: 'INDIRECT_REFLECTED_DIFFUSE' },
    ventilationHints: { stackEffectNightPurge: 'THERMAL_CHIMNEY_VENTING' },
    geometryHints: { minCourtyardDimensionsM: [6.0, 7.0] },
    advantages: ['Maximum family privacy with zero line-of-sight exposure to neighbors', 'Traditional bioclimatic cooling via evening thermal siphon'],
    tradeoffs: ['Higher structural perimeter and waterproofing complexity', 'Requires larger plot area to maintain viable room depths around court'],
    limitations: ['Impractical on plots under 400 m² due to minimum courtyard dimensional threshold'],
    tags: ['courtyard', 'finaa', 'inward-looking', 'ultimate-privacy', 'heritage-modern'],
    provenance: {
      source: 'King Saud University Department of Architecture & Najdi Courtyard Typology Archive',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2023.2',
      verifiedAt: '2026-02-10',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.96
  },
  {
    patternId: 'PAT-MACRO-U-SHAPED',
    version: '1.1.0',
    name: 'U-Shaped Villa Embracing Front or Rear Oasis',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Three wings framing a semi-enclosed terrace or swimming pool court, providing sweeping garden vistas from all three distinct functional wings.',
    applicableBuildingTypes: ['VILLA', 'MANSION'],
    plotConditions: {
      minPlotArea: 600,
      maxPlotArea: 1600,
      minFrontageM: 20,
      minDepthM: 28,
      aspectRatioRange: [0.7, 1.2],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [500, 1100],
    aspectRatioRange: [0.7, 1.2],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.SPLIT_GUEST_FAMILY, EntranceStrategy.TRI_ENTRANCE],
    zones: ['CENTRAL_FAMILY_CORE', 'GUEST_RECEPTION_WING', 'SERVICE_WELLNESS_WING', 'UPPER_SLEEPING_DECK'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['GUEST_ENTRANCE', 'GUEST_RECEPTION_WING'],
      ['FAMILY_ENTRANCE', 'CENTRAL_FAMILY_CORE']
    ],
    preferredAdjacencies: [
      ['CENTRAL_FAMILY_CORE', 'TERRACE_POOL'],
      ['DINING', 'GUEST_RECEPTION_WING']
    ],
    forbiddenAdjacencies: [
      ['GUEST_RECEPTION_WING', 'SERVICE_WELLNESS_WING']
    ],
    circulationStrategy: 'Trident circulation with central hub connecting the two lateral wings.',
    privacyStrategy: 'Visual separation between opposite wings via central outdoor terrace width (>10m) or privacy louvers.',
    serviceStrategy: 'Independent outer service alley leading straight into the kitchen wing.',
    orientationHints: { poolCourtFacing: 'NORTH_OR_NORTH_EAST' },
    daylightHints: { deepThreeSidedDaylightPenetration: true },
    ventilationHints: { tunnelBreezeEffect: true },
    geometryHints: { minTerraceWidthM: 8.0 },
    advantages: ['Spectacular panoramic garden vistas from every room', 'Complete volumetric separation of functions'],
    tradeoffs: ['Requires wide plot (>20m frontage)', 'Longer internal walking distances between wing tips'],
    limitations: ['Cannot be built on tight urban plots with frontage under 18m'],
    tags: ['u-shape', 'resort-villa', 'pool-centric', 'panoramic', 'luxury'],
    provenance: {
      source: 'Contemporary Gulf Residential Design Compendium (2025)',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2025.1',
      verifiedAt: '2026-03-01',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.92
  },
  {
    patternId: 'PAT-MACRO-THREE-ZONE',
    version: '1.3.0',
    name: 'Three-Zone Tripartite Villa (Guest / Family / Service)',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'The golden standard of Saudi contemporary villa planning: strict tripartite zoning dividing the floor plate into Public Guest, Private Family, and Operational Service belts.',
    applicableBuildingTypes: ['VILLA', 'DUPLEX'],
    plotConditions: {
      minPlotArea: 320,
      maxPlotArea: 800,
      minFrontageM: 14,
      minDepthM: 20,
      aspectRatioRange: [0.6, 1.2],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [280, 650],
    aspectRatioRange: [0.6, 1.2],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.TRI_ENTRANCE, EntranceStrategy.SPLIT_GUEST_FAMILY],
    zones: ['ZONE_A_GUEST_PUBLIC', 'ZONE_B_FAMILY_PRIVATE', 'ZONE_C_SERVICE_BACKHOUSE'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['GUEST_ENTRANCE', 'ZONE_A_GUEST_PUBLIC'],
      ['FAMILY_ENTRANCE', 'ZONE_B_FAMILY_PRIVATE'],
      ['SERVICE_ENTRANCE', 'ZONE_C_SERVICE_BACKHOUSE']
    ],
    preferredAdjacencies: [
      ['ZONE_B_FAMILY_PRIVATE', 'REAR_GARDEN'],
      ['ZONE_A_GUEST_PUBLIC', 'SHARED_DINING_BUFFER']
    ],
    forbiddenAdjacencies: [
      ['ZONE_A_GUEST_PUBLIC', 'ZONE_B_FAMILY_PRIVATE'],
      ['GUEST_ENTRANCE', 'ZONE_C_SERVICE_BACKHOUSE']
    ],
    circulationStrategy: 'Parallel non-intersecting circulation corridors: Front formal spine, central family nexus, and lateral service delivery route.',
    privacyStrategy: 'Hierarchical multi-layer privacy gates: Zone A and Zone B only meet at a lockable ceremonial dining buffer.',
    serviceStrategy: 'Contained continuous service strip running from garage/gate directly to dirty kitchen, laundry, and maid quarters.',
    orientationHints: { guestFacingStreet: true, familyFacingDeepRear: true },
    daylightHints: { bilateralLighting: true },
    ventilationHints: { independentZonedExhaust: true },
    geometryHints: { zoneWidthProportions: [0.35, 0.45, 0.20] },
    advantages: ['Flawless privacy alignment with traditional Saudi family hospitality requirements', 'Zero acoustic or olfactory contamination between kitchen and guest areas'],
    tradeoffs: ['Requires duplicate reception and dining spaces if fully separated'],
    limitations: ['Less flexible for open-concept European-style living preferences'],
    tags: ['three-zone', 'tripartite', 'saudi-standard', 'optimal-privacy', 'majlis-separation'],
    provenance: {
      source: 'Architectural Standards for Saudi Urban Housing (Riyadh & Eastern Province Practice Analysis)',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2024.2',
      verifiedAt: '2026-02-18',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.98
  },
  {
    patternId: 'PAT-MACRO-NARROW-DEEP',
    version: '1.0.0',
    name: 'Linear Spine for Narrow-Deep Plots',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Longitudinal sequential layout designed specifically for narrow frontages (10m-13m) with deep plots (>25m), organizing spaces along an illuminated axial light-well corridor.',
    applicableBuildingTypes: ['VILLA', 'TOWNHOUSE', 'DUPLEX'],
    plotConditions: {
      minPlotArea: 250,
      maxPlotArea: 500,
      minFrontageM: 10,
      minDepthM: 25,
      aspectRatioRange: [0.35, 0.55],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_OPPOSITE]
    },
    areaRange: [240, 480],
    aspectRatioRange: [0.35, 0.55],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_OPPOSITE],
    entranceStrategies: [EntranceStrategy.SPLIT_GUEST_FAMILY],
    zones: ['FRONT_GUEST_ZONE', 'CENTRAL_LIGHT_WELL_ATRIUM', 'REAR_FAMILY_ZONE', 'UPPER_SLEEPING_SPINE'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['GUEST_ENTRANCE', 'FRONT_GUEST_ZONE'],
      ['FAMILY_ENTRANCE', 'CENTRAL_LIGHT_WELL_ATRIUM']
    ],
    preferredAdjacencies: [
      ['CENTRAL_LIGHT_WELL_ATRIUM', 'STAIR_CORE'],
      ['REAR_FAMILY_ZONE', 'REAR_SETBACK_GARDEN']
    ],
    forbiddenAdjacencies: [
      ['FRONT_GUEST_ZONE', 'REAR_FAMILY_ZONE']
    ],
    circulationStrategy: 'Single continuous longitudinal spine punctuated by central daylight atrium to eliminate dark tunnel effect.',
    privacyStrategy: 'Temporal and physical linear depth: Guests stay in the front third; family occupies the secluded rear two-thirds.',
    serviceStrategy: 'Compact lateral service core stacked alongside staircase to optimize narrow width.',
    orientationHints: { lightWellAtriumCore: true },
    daylightHints: { centralSkywellRequired: true },
    ventilationHints: { stackVentilationThroughSkywell: true },
    geometryHints: { maxInternalCorridorWidthM: 1.4, minLightwellAreaSqM: 9.0 },
    advantages: ['Transforms difficult narrow-deep urban plots into bright, functioning luxury homes', 'Clear front-to-back privacy gradation'],
    tradeoffs: ['Requires internal skywell to bring daylight to core spaces', 'Limited lateral cross-views'],
    limitations: ['Not suited for square plots or wide frontages'],
    tags: ['narrow-plot', 'deep-plot', 'skywell', 'townhouse', 'compact-frontage'],
    provenance: {
      source: 'Urban Infill Housing Methodology (Dammam & Jeddah High-Density Subdivisions)',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2024.1',
      verifiedAt: '2026-03-05',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.91
  },
  {
    patternId: 'PAT-MACRO-WIDE-FRONT',
    version: '1.0.0',
    name: 'Transverse Pavilion for Wide-Front Shallow Plots',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Horizontal linear organization stretching across a wide street frontage (25m+), providing all primary habitable rooms with direct exterior frontage views and natural cross-daylight.',
    applicableBuildingTypes: ['VILLA', 'MANSION'],
    plotConditions: {
      minPlotArea: 400,
      maxPlotArea: 1200,
      minFrontageM: 25,
      minDepthM: 16,
      aspectRatioRange: [1.4, 2.2],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [350, 800],
    aspectRatioRange: [1.4, 2.2],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.TRI_ENTRANCE, EntranceStrategy.SPLIT_GUEST_FAMILY],
    zones: ['EAST_GUEST_PAVILION', 'CENTRAL_FAMILY_PORTAL', 'WEST_SERVICE_GARAGE'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['GUEST_ENTRANCE', 'EAST_GUEST_PAVILION'],
      ['FAMILY_ENTRANCE', 'CENTRAL_FAMILY_PORTAL']
    ],
    preferredAdjacencies: [
      ['CENTRAL_FAMILY_PORTAL', 'REAR_GARDEN_STRIP']
    ],
    forbiddenAdjacencies: [
      ['EAST_GUEST_PAVILION', 'WEST_SERVICE_GARAGE']
    ],
    circulationStrategy: 'Transverse circulation gallery with minimal vertical travel and direct garden permeability.',
    privacyStrategy: 'Horizontal separation: Guest wing occupies far east corner; family spaces command central and private lateral grounds.',
    serviceStrategy: 'End-of-facade garage integration with zero impact on main architectural facade continuity.',
    orientationHints: { wideFacadeSouthOrNorth: true },
    daylightHints: { shallowRoomDepthsMaximizeDaylight: true },
    ventilationHints: { naturalCrossVentilationDirectFrontToBack: true },
    geometryHints: { maxBuildingDepthM: 11.0 },
    advantages: ['Impressive stately street presence', 'Every major room has natural daylight and front garden view'],
    tradeoffs: ['Requires wide plot frontage (>25m)', 'Shallow rear setback limits large private back pool'],
    limitations: ['Cannot be applied to narrow plots'],
    tags: ['wide-frontage', 'shallow-plot', 'transverse', 'impressive-facade', 'palatial'],
    provenance: {
      source: 'Residential Estate Planning Standards (Riyadh North Developments)',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2023.3',
      verifiedAt: '2026-02-28',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.93
  },
  {
    patternId: 'PAT-MACRO-CORNER-PLOT',
    version: '1.2.0',
    name: 'Dual-Aspect Corner Plot Villa (Al-Zawia)',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Capitalizes on corner plot advantages by positioning the guest entrance on primary commercial/main road and family entrance on quiet secondary residential street.',
    applicableBuildingTypes: ['VILLA', 'CORNER_RESIDENCE'],
    plotConditions: {
      minPlotArea: 400,
      maxPlotArea: 1000,
      minFrontageM: 18,
      minDepthM: 20,
      aspectRatioRange: [0.8, 1.3],
      streetConditions: [StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [380, 850],
    aspectRatioRange: [0.8, 1.3],
    streetConditions: [StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.SPLIT_GUEST_FAMILY, EntranceStrategy.TRI_ENTRANCE],
    zones: ['CORNER_GUEST_WING', 'SECONDARY_STREET_FAMILY_CORE', 'INTERNAL_CORNER_PRIVATE_GARDEN'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['MAIN_STREET_ENTRANCE', 'CORNER_GUEST_WING'],
      ['SIDE_STREET_ENTRANCE', 'SECONDARY_STREET_FAMILY_CORE']
    ],
    preferredAdjacencies: [
      ['SECONDARY_STREET_FAMILY_CORE', 'INTERNAL_CORNER_PRIVATE_GARDEN']
    ],
    forbiddenAdjacencies: [
      ['CORNER_GUEST_WING', 'INTERNAL_CORNER_PRIVATE_GARDEN']
    ],
    circulationStrategy: 'Dual street pedestrian approaches preventing any vehicular or pedestrian conflict between guests and family.',
    privacyStrategy: 'Shielding family open areas at the rear inner corner diagonal away from the street intersection vertex.',
    serviceStrategy: 'Service delivery and parking access located at farthest property boundary on secondary street.',
    orientationHints: { cornerChamferOrSculpturalArticulation: true },
    daylightHints: { multiFacetedDaylightExposure: true },
    ventilationHints: { dualOrientationWindScoop: true },
    geometryHints: { cornerSetbackSafetyVisibility: true },
    advantages: ['Complete segregation of guest and family approaches using natural urban perimeter', 'Excellent cross ventilation and natural lighting from two street fronts'],
    tradeoffs: ['Subject to dual setback regulations (reducing total ground buildable footprint)', 'Higher boundary wall perimeter cost'],
    limitations: ['Strictly requires corner plot with two intersecting public streets'],
    tags: ['corner-plot', 'zawia', 'dual-street', 'independent-entrances', 'urban-advantage'],
    provenance: {
      source: 'Municipal Planning & Urban Villa Guidelines (Ministry of Municipal and Rural Affairs & Housing - MOMRAH)',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2024.1',
      verifiedAt: '2026-01-20',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.97
  },
  {
    patternId: 'PAT-MACRO-CENTRAL-HALL',
    version: '1.1.0',
    name: 'Traditional Central Hall Villa (Al-Bahw)',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Double-height grand central reception vestibule serving as the monumental distribution hub connecting surrounding private and public reception suites.',
    applicableBuildingTypes: ['VILLA', 'MANSION'],
    plotConditions: {
      minPlotArea: 500,
      maxPlotArea: 1500,
      minFrontageM: 20,
      minDepthM: 24,
      aspectRatioRange: [0.8, 1.25],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [450, 1000],
    aspectRatioRange: [0.8, 1.25],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.SINGLE_PORTAL, EntranceStrategy.SPLIT_GUEST_FAMILY],
    zones: ['CENTRAL_BAHW_ATRIUM', 'GUEST_SALON', 'FORMAL_DINING', 'FAMILY_SALON', 'EXECUTIVE_SUITES'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['CENTRAL_BAHW_ATRIUM', 'GUEST_SALON'],
      ['CENTRAL_BAHW_ATRIUM', 'FAMILY_SALON'],
      ['CENTRAL_BAHW_ATRIUM', 'GRAND_STAIRCASE']
    ],
    preferredAdjacencies: [
      ['GUEST_SALON', 'FORMAL_DINING']
    ],
    forbiddenAdjacencies: [
      ['CENTRAL_BAHW_ATRIUM', 'KITCHEN_SERVICE']
    ],
    circulationStrategy: 'Centrifugal radial circulation from double-height central grand hall.',
    privacyStrategy: 'Formal screening vestibules buffer private suites off the central rotunda.',
    serviceStrategy: 'Dedicated discrete back-of-house service corridor bypassing the central atrium completely.',
    orientationHints: { skylightAtriumSolarControl: true },
    daylightHints: { centralZenithalDomeOrLantern: true },
    ventilationHints: { centralStackThermodynamicCooling: true },
    geometryHints: { minCentralHallDiameterM: 5.5 },
    advantages: ['Grand, prestigious interior spatial experience', 'Minimal corridor area wastage due to radial room arrangement'],
    tradeoffs: ['Central hall volume requires conditioning (higher HVAC energy footprint)', 'Acoustic reverberation requires intentional acoustic treatment'],
    limitations: ['Not suitable for compact budgets or plots under 450 m²'],
    tags: ['central-hall', 'bahw', 'monumental', 'atrium', 'neoclassical-modern'],
    provenance: {
      source: 'Mansion & Classic Villa Typology Reference Guide',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2023.1',
      verifiedAt: '2026-02-12',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.90
  },
  {
    patternId: 'PAT-MACRO-PAVILION',
    version: '1.0.0',
    name: 'Dispersed Garden Pavilion Layout',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Cluster of distinct architectural volumes (e.g. Independent Majlis Pavilion, Main Family Residence, Wellness/Pool Pavilion) interconnected by covered pergolas and landscaped breezeways.',
    applicableBuildingTypes: ['MANSION', 'RESORT_VILLA', 'LARGE_ESTATE'],
    plotConditions: {
      minPlotArea: 900,
      maxPlotArea: 3500,
      minFrontageM: 28,
      minDepthM: 32,
      aspectRatioRange: [0.75, 1.4],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER, StreetCondition.TWO_STREETS_OPPOSITE]
    },
    areaRange: [700, 2200],
    aspectRatioRange: [0.75, 1.4],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER, StreetCondition.TWO_STREETS_OPPOSITE],
    entranceStrategies: [EntranceStrategy.TRI_ENTRANCE],
    zones: ['INDEPENDENT_GUEST_PAVILION', 'MAIN_FAMILY_PAVILION', 'SERVICE_ANNEX', 'LANDSCAPED_GROUNDS'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['GUEST_PARKING', 'INDEPENDENT_GUEST_PAVILION'],
      ['FAMILY_PARKING', 'MAIN_FAMILY_PAVILION']
    ],
    preferredAdjacencies: [
      ['INDEPENDENT_GUEST_PAVILION', 'WATER_FEATURE']
    ],
    forbiddenAdjacencies: [
      ['INDEPENDENT_GUEST_PAVILION', 'MAIN_FAMILY_PRIVATE_ROOMS']
    ],
    circulationStrategy: 'Resort-style semi-outdoor covered colonnade and glass bridge links between distinct pavilions.',
    privacyStrategy: 'Physical volumetric detachment: Guest pavilion is completely physically separated from family house by lush landscaped courtyard.',
    serviceStrategy: 'Underground service tunnel or secluded peripheral utility ring road.',
    orientationHints: { microclimateCreationThroughWaterAndPlanting: true },
    daylightHints: { fourSidedDaylightForEveryPavilion: true },
    ventilationHints: { maximumBreezeCirculationBetweenVolumes: true },
    geometryHints: { minPavilionSeparationDistanceM: 5.0 },
    advantages: ['Ultimate luxury, acoustic separation, and 360-degree garden integration', 'Majlis guests never set foot inside family residence'],
    tradeoffs: ['High construction and land cost', 'Exposure to exterior heat when transitioning between pavilions during summer'],
    limitations: ['Only viable on large estate parcels (>900 m²)'],
    tags: ['pavilion', 'resort-living', 'dispersed-volumes', 'independent-majlis', 'luxury-estate'],
    provenance: {
      source: 'Contemporary Arabian Gulf Luxury Residential Case Studies (2025)',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2025.2',
      verifiedAt: '2026-03-10',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.94
  },
  {
    patternId: 'PAT-MACRO-COMPACT-VILLA',
    version: '1.2.0',
    name: 'Smart Compact Villa (Urban Efficiency Box)',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'High-efficiency cubical footprint minimizing envelope cost and thermal loss while delivering full Saudi program essentials on modest urban plots (200m² - 350m²).',
    applicableBuildingTypes: ['VILLA', 'DUPLEX', 'URBAN_HOME'],
    plotConditions: {
      minPlotArea: 200,
      maxPlotArea: 350,
      minFrontageM: 10,
      minDepthM: 20,
      aspectRatioRange: [0.5, 0.8],
      streetConditions: [StreetCondition.ONE_STREET]
    },
    areaRange: [220, 380],
    aspectRatioRange: [0.5, 0.8],
    streetConditions: [StreetCondition.ONE_STREET],
    entranceStrategies: [EntranceStrategy.SPLIT_GUEST_FAMILY],
    zones: ['COMPACT_GUEST_RECEPTION', 'OPEN_FAMILY_LIVING', 'COMPACT_SERVICE_CORE', 'ROOF_TERRACE_ANNEX'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['GUEST_ENTRANCE', 'COMPACT_GUEST_RECEPTION'],
      ['FAMILY_ENTRANCE', 'OPEN_FAMILY_LIVING']
    ],
    preferredAdjacencies: [
      ['OPEN_FAMILY_LIVING', 'REAR_SETBACK_PATIO']
    ],
    forbiddenAdjacencies: [
      ['COMPACT_GUEST_RECEPTION', 'FAMILY_BEDROOMS']
    ],
    circulationStrategy: 'Central vertical stair/elevator core with near-zero horizontal hallway wastage.',
    privacyStrategy: 'Vertical privacy stratification: Ground floor formal & living, First floor bedrooms, Roof entertainment/annex.',
    serviceStrategy: 'Stacked vertical wet wall integrating kitchen, laundry, and upper bathrooms along one utility axis.',
    orientationHints: { lowSurfaceAreaToVolumeRatio: true },
    daylightHints: { verticalCourtyardOrRoofSkylight: true },
    ventilationHints: { mechanicalAssistedSupply: true },
    geometryHints: { maxCorridorPercentage: 0.08 },
    advantages: ['Lowest energy consumption and construction cost per square meter', 'Fits modern Sakani and affordable urban subdivision plots'],
    tradeoffs: ['Smaller room proportions', 'Requires vertical living (stair/lift dependency)'],
    limitations: ['Cannot support sprawling single-level elderly suites without compromise'],
    tags: ['compact', 'affordable', 'sakani', 'efficient', 'low-energy'],
    provenance: {
      source: 'National Housing Company (NHC) Standards & Modern Urban Subdivision Matrix',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2024.3',
      verifiedAt: '2026-02-05',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.96
  },
  {
    patternId: 'PAT-MACRO-TWO-STREET-THROUGH',
    version: '1.0.0',
    name: 'Dual-Street Through-Plot Residence (Batn Wa Dahr)',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'For through-plots bounded by opposing streets (front and back), providing full autonomous frontage to guests on one street and private family vehicular/pedestrian entry on opposite street.',
    applicableBuildingTypes: ['VILLA', 'MANSION'],
    plotConditions: {
      minPlotArea: 400,
      maxPlotArea: 1200,
      minFrontageM: 14,
      minDepthM: 26,
      aspectRatioRange: [0.45, 0.9],
      streetConditions: [StreetCondition.TWO_STREETS_OPPOSITE]
    },
    areaRange: [380, 850],
    aspectRatioRange: [0.45, 0.9],
    streetConditions: [StreetCondition.TWO_STREETS_OPPOSITE],
    entranceStrategies: [EntranceStrategy.SPLIT_GUEST_FAMILY, EntranceStrategy.TRI_ENTRANCE],
    zones: ['STREET_A_FORMAL_FACADE', 'CENTRAL_FAMILY_LIVING', 'STREET_B_PRIVATE_FAMILY_FACADE'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['STREET_A_ENTRANCE', 'STREET_A_FORMAL_FACADE'],
      ['STREET_B_ENTRANCE', 'STREET_B_PRIVATE_FAMILY_FACADE']
    ],
    preferredAdjacencies: [
      ['CENTRAL_FAMILY_LIVING', 'STREET_B_PRIVATE_FAMILY_FACADE']
    ],
    forbiddenAdjacencies: [
      ['STREET_A_FORMAL_FACADE', 'STREET_B_PRIVATE_FAMILY_FACADE']
    ],
    circulationStrategy: 'Through-building flow with strict mid-point security/privacy gate.',
    privacyStrategy: '100% street segregation: Guests never see the family street, family never encounters guest parking.',
    serviceStrategy: 'Service garage placed on secondary street with direct side access.',
    orientationHints: { dualFrontageCrossBreeze: true },
    daylightHints: { unobstructedNaturalLightFromBothOpposingStreets: true },
    ventilationHints: { naturalCrossDraftFrontToBack: true },
    geometryHints: { buildingDepthUtilizationM: 18.0 },
    advantages: ['Complete isolation of guest and family traffic without consuming side garden space', 'High resale value due to two exterior frontages'],
    tradeoffs: ['Requires through-plot (Batn Wa Dahr) which is rarer and costlier', 'Requires two distinct facade designs'],
    limitations: ['Only applicable when plot has two opposing street frontages'],
    tags: ['two-street', 'through-plot', 'batn-wa-dahr', 'opposing-streets', 'dual-facade'],
    provenance: {
      source: 'MOMRAH Urban Masterplanning Subdivision Guidelines',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2024.1',
      verifiedAt: '2026-01-30',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.97
  },
  {
    patternId: 'PAT-MACRO-GUEST-FAMILY-SPLIT',
    version: '1.1.0',
    name: 'Bifurcated Guest / Family Split Villa',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Ground floor is strictly divided into two autonomous wings connected only by an acoustic airlock vestibule, allowing large-scale entertaining without disturbing family routine.',
    applicableBuildingTypes: ['VILLA', 'LARGE_FAMILY_VILLA'],
    plotConditions: {
      minPlotArea: 400,
      maxPlotArea: 950,
      minFrontageM: 16,
      minDepthM: 22,
      aspectRatioRange: [0.65, 1.2],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [350, 780],
    aspectRatioRange: [0.65, 1.2],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.SPLIT_GUEST_FAMILY],
    zones: ['INDEPENDENT_GUEST_WING', 'CENTRAL_SOUND_LOCK', 'AUTONOMOUS_FAMILY_WING'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['INDEPENDENT_GUEST_WING', 'CENTRAL_SOUND_LOCK'],
      ['AUTONOMOUS_FAMILY_WING', 'CENTRAL_SOUND_LOCK']
    ],
    preferredAdjacencies: [
      ['AUTONOMOUS_FAMILY_WING', 'KITCHEN_CORE']
    ],
    forbiddenAdjacencies: [
      ['INDEPENDENT_GUEST_WING', 'FAMILY_PRIVATE_ZONES']
    ],
    circulationStrategy: 'Bifurcated parallel circulation with acoustic sound-lock connecting link.',
    privacyStrategy: 'Acoustic and visual isolation: Even high noise from formal events does not penetrate family living spaces.',
    serviceStrategy: 'Dual kitchen strategy: Prep/dirty kitchen serves family directly, while catering pass-through serves dining.',
    orientationHints: { soundLockAcousticBuffering: true },
    daylightHints: { dualWingDaylightOptimization: true },
    ventilationHints: { separateHVACTemperatureZoning: true },
    geometryHints: { soundLockVestibuleLengthM: 2.4 },
    advantages: ['Total peace of mind during large dinner parties or gatherings', 'Preserves family freedom of movement at all times'],
    tradeoffs: ['Slightly larger footprint required for sound-lock vestibule'],
    limitations: ['Requires at least 16m frontage to comfortably accommodate dual wings'],
    tags: ['split-wing', 'acoustic-isolation', 'bifurcated', 'hospitality-focused', 'family-freedom'],
    provenance: {
      source: 'Saudi Residential Social Dynamics & Architecture Survey',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2023.2',
      verifiedAt: '2026-02-14',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.95
  },
  {
    patternId: 'PAT-MACRO-LINEAR-VILLA',
    version: '1.0.0',
    name: 'Linear Bar Villa (Single-Loaded Spine)',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'A sleek, contemporary rectilinear bar configuration maximizing southern or northern exposure while allowing a generous continuous garden along the entire parcel length.',
    applicableBuildingTypes: ['VILLA', 'CONTEMPORARY_MINIMALIST_VILLA'],
    plotConditions: {
      minPlotArea: 350,
      maxPlotArea: 800,
      minFrontageM: 14,
      minDepthM: 24,
      aspectRatioRange: [0.55, 0.9],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [300, 680],
    aspectRatioRange: [0.55, 0.9],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.SPLIT_GUEST_FAMILY],
    zones: ['FRONT_FORMAL_ZONE', 'CENTRAL_GALLERY', 'REAR_LIVING_ZONE', 'CONTINUOUS_SIDE_GARDEN'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['GUEST_ENTRANCE', 'FRONT_FORMAL_ZONE'],
      ['FAMILY_ENTRANCE', 'CENTRAL_GALLERY']
    ],
    preferredAdjacencies: [
      ['REAR_LIVING_ZONE', 'CONTINUOUS_SIDE_GARDEN']
    ],
    forbiddenAdjacencies: [
      ['FRONT_FORMAL_ZONE', 'REAR_LIVING_ZONE']
    ],
    circulationStrategy: 'Linear side gallery with floor-to-ceiling glass wall opening directly to the longitudinal landscape strip.',
    privacyStrategy: 'Progressive threshold from street boundary to deep rear private suite.',
    serviceStrategy: 'Lateral service core placed on party wall side with minimal corridor footprint.',
    orientationHints: { longAxisEastWestForOptimalSolarGain: true },
    daylightHints: { singleLoadedGlazedCorridor: true },
    ventilationHints: { naturalLinearBreezeCorridor: true },
    geometryHints: { buildingWidthM: 7.5, gardenWidthM: 5.5 },
    advantages: ['Clean modern aesthetic with uninterrupted garden view from every ground floor room', 'High natural daylight factor'],
    tradeoffs: ['Requires continuous side setback wider than the statutory minimum'],
    limitations: ['Not efficient on narrow plots under 13m frontage'],
    tags: ['linear-bar', 'contemporary', 'glass-corridor', 'garden-facing', 'minimalist'],
    provenance: {
      source: 'Contemporary Architectural Case Studies (Riyadh Architecture Biennial 2024)',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2024.2',
      verifiedAt: '2026-03-02',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.92
  },
  {
    patternId: 'PAT-MACRO-MULTI-ENTRANCE',
    version: '1.1.0',
    name: 'Multi-Entrance Hierarchy Villa (Four-Portal Architecture)',
    category: PatternCategory.MACRO_LAYOUT,
    description: 'Engineered for sophisticated high-occupancy households requiring 4 discrete dedicated entrance portals: Men Guest, Women Guest, Family Daily, and Service/Logistics.',
    applicableBuildingTypes: ['VILLA', 'MANSION'],
    plotConditions: {
      minPlotArea: 500,
      maxPlotArea: 1500,
      minFrontageM: 18,
      minDepthM: 25,
      aspectRatioRange: [0.7, 1.3],
      streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER]
    },
    areaRange: [450, 1100],
    aspectRatioRange: [0.7, 1.3],
    streetConditions: [StreetCondition.ONE_STREET, StreetCondition.TWO_STREETS_CORNER],
    entranceStrategies: [EntranceStrategy.TRI_ENTRANCE],
    zones: ['MEN_RECEPTION_SUITE', 'WOMEN_RECEPTION_SUITE', 'FAMILY_DAILY_CORE', 'SERVICE_LOGISTICS_HUB'],
    spaceRelationships: [],
    requiredAdjacencies: [
      ['MEN_ENTRANCE', 'MEN_RECEPTION_SUITE'],
      ['WOMEN_ENTRANCE', 'WOMEN_RECEPTION_SUITE'],
      ['FAMILY_ENTRANCE', 'FAMILY_DAILY_CORE'],
      ['SERVICE_ENTRANCE', 'SERVICE_LOGISTICS_HUB']
    ],
    preferredAdjacencies: [
      ['MEN_RECEPTION_SUITE', 'CEREMONIAL_DINING'],
      ['WOMEN_RECEPTION_SUITE', 'CEREMONIAL_DINING']
    ],
    forbiddenAdjacencies: [
      ['MEN_ENTRANCE', 'WOMEN_RECEPTION_SUITE'],
      ['MEN_RECEPTION_SUITE', 'FAMILY_DAILY_CORE']
    ],
    circulationStrategy: 'Four independent ingress paths converging exclusively upon scheduled ceremonial common points.',
    privacyStrategy: 'Maximum privacy security: Complete isolation between gendered guest domains and family inner sanctum.',
    serviceStrategy: 'Backstage logistics route capable of catering both formal reception suites without crossing public halls.',
    orientationHints: { fourWayDispersedEntryPortals: true },
    daylightHints: { independentExteriorOpeningsForEveryEntranceVestibule: true },
    ventilationHints: { independentZonedHVACSystems: true },
    geometryHints: { minFoyerDimensionsM: [2.5, 3.0] },
    advantages: ['Caters effortlessly to concurrent formal gatherings without any cross-visibility or social awkwardness', 'World-class hospitality workflow'],
    tradeoffs: ['Higher square footage allocated to circulation and entry vestibules'],
    limitations: ['Impractical on small parcels under 500 m²'],
    tags: ['multi-entrance', 'four-portals', 'men-women-majlis', 'diplomatic-standard', 'grand-hospitality'],
    provenance: {
      source: 'Saudi High-End Residential Design Manual & Cultural Spatial Practice Code',
      sourceType: ProvenanceLevel.VERIFIED,
      version: '2024.1',
      verifiedAt: '2026-02-22',
      verificationStatus: VerificationStatus.CERTIFIED
    },
    confidence: 0.97
  }
];
