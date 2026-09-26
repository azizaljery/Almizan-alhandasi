import { 
  RuleClassification, 
  RuleAuthority, 
  DEFAULT_PROJECT_SBC_EDITION, 
  validateRuleIntegrity 
} from '../contracts/rules.contract.js';

export const ENGINEERING_RULES = [
  {
    ruleId: 'RULE-SBC-1101-CORRIDOR-WIDTH-01',
    discipline: 'ARCHITECTURAL',
    title: 'Minimum Residential Hallway Clear Width',
    statement: 'The minimum clear width of a residential hallway or corridor shall not be less than 900 mm.',
    classification: RuleClassification.STATUTORY_SBC,
    source: {
      authority: RuleAuthority.SBC_1101_2024,
      documentId: 'SBC-1101-2024',
      edition: '2024',
      section: 'Chapter 3: Building Planning',
      subsection: 'Section R311.6',
      title: 'Hallways',
      reference: 'Saudi Residential Building Code (SBC 1101:2024), Chapter 3, Section R311.6 Hallways',
      effectiveFrom: '2025-06-30',
      verifiedAt: '2026-09-23',
      editionOverrideReason: null
    },
    confidence: 1.0,
    severityOnViolation: 'CRITICAL',
    isStatutoryCode: true,
    parameters: { minWidthMm: 900 }
  },
  {
    ruleId: 'RULE-SBC-1101-CEILING-HEIGHT-02',
    discipline: 'ARCHITECTURAL',
    title: 'Minimum Habitable Space Ceiling Height',
    statement: 'Habitable rooms and spaces shall have a ceiling height of not less than 2300 mm.',
    classification: RuleClassification.STATUTORY_SBC,
    source: {
      authority: RuleAuthority.SBC_1101_2024,
      documentId: 'SBC-1101-2024',
      edition: '2024',
      section: 'Chapter 3: Building Planning',
      subsection: 'Section R305.1',
      title: 'Minimum Height',
      reference: 'Saudi Residential Building Code (SBC 1101:2024), Chapter 3, Section R305.1 Ceiling Height',
      effectiveFrom: '2025-06-30',
      verifiedAt: '2026-09-23',
      editionOverrideReason: null
    },
    confidence: 1.0,
    severityOnViolation: 'CRITICAL',
    isStatutoryCode: true,
    parameters: { minClearHeightMm: 2300 }
  },
  {
    ruleId: 'RULE-ARCH-HEURISTIC-DOOR-SWING-03',
    discipline: 'ARCHITECTURAL',
    title: 'Door Swing Corridor Clearance Heuristic',
    statement: 'Door leafs opening into primary circulation corridors should maintain at least 800 mm residual clear passage when fully opened.',
    classification: RuleClassification.PRELIMINARY_HEURISTIC,
    source: {
      authority: RuleAuthority.UNOFFICIAL_PRACTICE,
      documentId: 'HEURISTIC-ARCH-001',
      edition: 'UNVERSIONED_HEURISTIC',
      section: 'Internal Circulation',
      subsection: 'N/A - Preliminary Circulation Guideline',
      title: 'Corridor Residual Passage',
      reference: 'AEC Preliminary Space Planning Guideline (Non-Statutory Heuristic)',
      effectiveFrom: 'N/A',
      verifiedAt: '2026-09-23'
    },
    confidence: 0.70,
    severityOnViolation: 'MINOR',
    isStatutoryCode: false,
    parameters: { minResidualWidthMm: 800 }
  },
  {
    ruleId: 'RULE-STRUCT-HEURISTIC-SPAN-01',
    discipline: 'STRUCTURAL',
    title: 'Preliminary Residential Span Check Heuristic',
    statement: 'Spans between structural supports exceeding 7000 mm in residential construction represent critical zones requiring specific structural sizing and deflection analysis.',
    classification: RuleClassification.PRELIMINARY_HEURISTIC,
    source: {
      authority: RuleAuthority.UNOFFICIAL_PRACTICE,
      documentId: 'HEURISTIC-STRUCT-001',
      edition: 'UNVERSIONED_HEURISTIC',
      section: 'RC Slab Sizing',
      subsection: 'N/A - Preliminary Structural Span Heuristic',
      title: 'Residential Scheme Spans',
      reference: 'Residential Structural Scheme Design Manual (Non-Statutory Rule of Thumb)',
      effectiveFrom: 'N/A',
      verifiedAt: '2026-09-23'
    },
    confidence: 0.70,
    severityOnViolation: 'MAJOR',
    isStatutoryCode: false,
    parameters: { advisoryMaxSpanMm: 7000 }
  },
  {
    ruleId: 'RULE-STRUCT-HEURISTIC-STACKING-02',
    discipline: 'STRUCTURAL',
    title: 'Vertical Column Stacking Alignment Heuristic',
    statement: 'Upper level columns should vertically align within 300 mm of lower level vertical load-bearing elements to prevent unplanned transfer beam requirements.',
    classification: RuleClassification.PRELIMINARY_HEURISTIC,
    source: {
      authority: RuleAuthority.UNOFFICIAL_PRACTICE,
      documentId: 'HEURISTIC-STRUCT-002',
      edition: 'UNVERSIONED_HEURISTIC',
      section: 'Load Path Continuity',
      subsection: 'N/A - Vertical Alignment Scheme Guideline',
      title: 'Column Axial Stacking',
      reference: 'Structural Coordination Standard Practice (Non-Statutory Heuristic)',
      effectiveFrom: 'N/A',
      verifiedAt: '2026-09-23'
    },
    confidence: 0.75,
    severityOnViolation: 'CRITICAL',
    isStatutoryCode: false,
    parameters: { maxPermissibleOffsetMm: 300 }
  },
  {
    ruleId: 'RULE-SBC-401-PANEL-CLEARANCE-01',
    discipline: 'ELECTRICAL',
    title: 'Clear Working Space in Front of Electrical Distribution Equipment',
    statement: 'A clear working space of not less than 900 mm in depth and 750 mm in width must be maintained in front of electrical panels, free from architectural or mechanical obstruction.',
    classification: RuleClassification.STATUTORY_SBC,
    source: {
      authority: RuleAuthority.SBC_401_2024,
      documentId: 'SBC-401-2024',
      edition: '2024',
      section: 'Chapter 1: General Requirements for Electrical Installations',
      subsection: 'Section 110.26(A)(1)',
      title: 'Working Space Depth',
      reference: 'Saudi Electrical Code (SBC 401:2024), Chapter 1, Section 110.26 Spaces About Electrical Equipment',
      effectiveFrom: '2025-06-30',
      verifiedAt: '2026-09-23',
      editionOverrideReason: null
    },
    confidence: 1.0,
    severityOnViolation: 'CRITICAL',
    isStatutoryCode: true,
    parameters: { clearDepthMm: 900, clearWidthMm: 750 }
  },
  {
    ruleId: 'RULE-SBC-401-DEDICATED-SPACE-03',
    discipline: 'ELECTRICAL',
    title: 'Dedicated Electrical Space - Foreign Systems Exclusion',
    statement: 'The space dedicated to electrical equipment shall be kept clear of foreign piping, ducts, and leak-producing systems.',
    classification: RuleClassification.STATUTORY_SBC,
    source: {
      authority: RuleAuthority.SBC_401_2024,
      documentId: 'SBC-401-2024',
      edition: '2024',
      section: 'Chapter 1: General Requirements for Electrical Installations',
      subsection: 'Section 110.26(E)',
      title: 'Dedicated Equipment Space - Foreign Systems',
      reference: 'Saudi Electrical Code (SBC 401:2024), Chapter 1, Section 110.26(E) Dedicated Equipment Space',
      effectiveFrom: '2025-06-30',
      verifiedAt: '2026-09-23',
      editionOverrideReason: null
    },
    confidence: 1.0,
    severityOnViolation: 'CRITICAL',
    isStatutoryCode: true,
    parameters: {}
  },
  {
    ruleId: 'RULE-ELEC-HEURISTIC-LOAD-DENSITY-02',
    discipline: 'ELECTRICAL',
    title: 'Preliminary Residential Power Density Heuristic',
    statement: 'Indicative connected electrical load heuristic for residential villas is 80-120 VA/m² (excluding centralized chillers).',
    classification: RuleClassification.PRELIMINARY_HEURISTIC,
    source: {
      authority: RuleAuthority.UNOFFICIAL_PRACTICE,
      documentId: 'HEURISTIC-ELEC-001',
      edition: 'UNVERSIONED_HEURISTIC',
      section: 'Load Estimation',
      subsection: 'N/A - Preliminary Electrical Scheme Guideline',
      title: 'Residential Unit Power Density',
      reference: 'MEP Preliminary Estimating Handbook (Non-Statutory Heuristic)',
      effectiveFrom: 'N/A',
      verifiedAt: '2026-09-23'
    },
    confidence: 0.65,
    severityOnViolation: 'ADVISORY',
    isStatutoryCode: false,
    parameters: { nominalVAPerSqM: 100 }
  },
  {
    ruleId: 'RULE-PLUMB-HEURISTIC-WATER-OVER-ELEC-01',
    discipline: 'PLUMBING',
    title: 'Plumbing Drainage Route Isolation From Electrical Rooms',
    statement: 'Plumbing wet areas and gravity drainage stacks should not be placed directly above electrical distribution rooms or electrical panel recesses during scheme planning.',
    classification: RuleClassification.PRELIMINARY_HEURISTIC,
    source: {
      authority: RuleAuthority.UNOFFICIAL_PRACTICE,
      documentId: 'HEURISTIC-PLUMB-001',
      edition: 'UNVERSIONED_HEURISTIC',
      section: 'Spatial Zoning Isolation',
      subsection: 'N/A - Cross-Discipline Coordination Guideline',
      title: 'Water Isolation from Electrical Zones',
      reference: 'Cross-Discipline Coordination Standard Practice (Preliminary Heuristic - cross-referencing SBC 401:2024 Section 110.26(E) Dedicated Equipment Space)',
      effectiveFrom: 'N/A',
      verifiedAt: '2026-09-23'
    },
    confidence: 0.75,
    severityOnViolation: 'CRITICAL',
    isStatutoryCode: false,
    parameters: {}
  },
  {
    ruleId: 'RULE-PLUMB-HEURISTIC-WET-STACKING-02',
    discipline: 'PLUMBING',
    title: 'Vertical Stacking of Wet Areas Heuristic',
    statement: 'Upper level wet zones (bathrooms/kitchens) should stack vertically within 1500 mm of lower wet areas to prevent long horizontal drainage runs in living space ceilings.',
    classification: RuleClassification.PRELIMINARY_HEURISTIC,
    source: {
      authority: RuleAuthority.UNOFFICIAL_PRACTICE,
      documentId: 'HEURISTIC-PLUMB-002',
      edition: 'UNVERSIONED_HEURISTIC',
      section: 'Drainage Stacking',
      subsection: 'N/A - Wet Area Coordination Heuristic',
      title: 'Vertical Wet-Area Alignment',
      reference: 'Plumbing Coordination Best Practices (Non-Statutory Heuristic)',
      effectiveFrom: 'N/A',
      verifiedAt: '2026-09-23'
    },
    confidence: 0.70,
    severityOnViolation: 'MAJOR',
    isStatutoryCode: false,
    parameters: { maxAdvisoryOffsetMm: 1500 }
  },
  {
    ruleId: 'RULE-HVAC-HEURISTIC-PLENUM-DEPTH-01',
    discipline: 'HVAC',
    title: 'Concealed Ducted HVAC Ceiling Plenum Depth Heuristic',
    statement: 'Spaces designated for concealed ducted split or FCU systems require an indicative minimum ceiling drop of 350-450 mm for duct routing and drainage slope.',
    classification: RuleClassification.PRELIMINARY_HEURISTIC,
    source: {
      authority: RuleAuthority.UNOFFICIAL_PRACTICE,
      documentId: 'HEURISTIC-HVAC-001',
      edition: 'UNVERSIONED_HEURISTIC',
      section: 'Plenum Spatial Coordination',
      subsection: 'N/A - HVAC Plenum Clearance Heuristic',
      title: 'Concealed Duct Ceiling Plenum Allowance',
      reference: 'HVAC Scheme Design Manual (Non-Statutory Heuristic)',
      effectiveFrom: 'N/A',
      verifiedAt: '2026-09-23'
    },
    confidence: 0.70,
    severityOnViolation: 'MAJOR',
    isStatutoryCode: false,
    parameters: { minPlenumDepthMm: 350 }
  },
  {
    ruleId: 'RULE-HVAC-HEURISTIC-COOLING-RATE-02',
    discipline: 'HVAC',
    title: 'Preliminary Regional Cooling Load Heuristic',
    statement: 'Preliminary cooling capacity in hot arid zones typically ranges from 120 W/m² to 160 W/m² (approx. 20-25 m² per Ton of Refrigeration for standard insulated residential construction).',
    classification: RuleClassification.PRELIMINARY_HEURISTIC,
    source: {
      authority: RuleAuthority.UNOFFICIAL_PRACTICE,
      documentId: 'HEURISTIC-HVAC-002',
      edition: 'UNVERSIONED_HEURISTIC',
      section: 'Preliminary Capacity Estimation',
      subsection: 'N/A - Regional Rule of Thumb',
      title: 'Residential Cooling Load Factor',
      reference: 'Saudi Residential MEP Guidelines (Non-Statutory Heuristic)',
      effectiveFrom: 'N/A',
      verifiedAt: '2026-09-23'
    },
    confidence: 0.65,
    severityOnViolation: 'ADVISORY',
    isStatutoryCode: false,
    parameters: { sqMPerTon: 22 }
  }
];

for (const rule of ENGINEERING_RULES) {
  validateRuleIntegrity(rule, DEFAULT_PROJECT_SBC_EDITION);
}

export class EngineeringRulesRegistry {
  static getAllRules() {
    return ENGINEERING_RULES;
  }

  static getRule(ruleId) {
    const found = ENGINEERING_RULES.find(r => r.ruleId === ruleId);
    if (!found) {
      throw new Error(`Rule ${ruleId} not found in EngineeringRulesRegistry.`);
    }
    return found;
  }

  static getRulesByDiscipline(discipline) {
    return ENGINEERING_RULES.filter(r => r.discipline === discipline);
  }

  static getStatutoryRules() {
    return ENGINEERING_RULES.filter(r => r.classification === RuleClassification.STATUTORY_SBC);
  }

  static getHeuristicRules() {
    return ENGINEERING_RULES.filter(r => r.classification === RuleClassification.PRELIMINARY_HEURISTIC);
  }
}
