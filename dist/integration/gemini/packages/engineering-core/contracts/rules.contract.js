export const DEFAULT_PROJECT_SBC_EDITION = '2024';

export const RuleClassification = {
  STATUTORY_SBC: 'STATUTORY_SBC',
  PRELIMINARY_HEURISTIC: 'PRELIMINARY_HEURISTIC'
};

export const RuleAuthority = {
  SBC_1101_2024: 'SBC_1101_2024',
  SBC_401_2024: 'SBC_401_2024',
  SBC_201_2024: 'SBC_201_2024',
  SBC_701_2024: 'SBC_701_2024',
  UNOFFICIAL_PRACTICE: 'UNOFFICIAL_PRACTICE'
};

export function validateRuleIntegrity(rule, projectSbcEdition = DEFAULT_PROJECT_SBC_EDITION) {
  if (!rule.ruleId || !rule.discipline || !rule.title || !rule.source) {
    throw new Error(`Rule ${rule.ruleId || 'UNKNOWN'} is missing basic mandatory fields.`);
  }

  if (rule.classification === RuleClassification.STATUTORY_SBC) {
    const requiredFields = [
      'documentId',
      'edition',
      'section',
      'subsection',
      'title',
      'reference',
      'effectiveFrom',
      'verifiedAt'
    ];

    for (const field of requiredFields) {
      if (!rule.source[field] || typeof rule.source[field] !== 'string' || rule.source[field].trim() === '') {
        throw new Error(`Rule ${rule.ruleId} is classified as STATUTORY_SBC but is missing mandatory audit field: source.${field}`);
      }
    }

    if (!rule.source.authority || !rule.source.authority.startsWith('SBC')) {
      throw new Error(`Rule ${rule.ruleId} classified as STATUTORY_SBC must cite an SBC authority.`);
    }

    if (rule.source.edition !== projectSbcEdition) {
      if (!rule.source.editionOverrideReason || typeof rule.source.editionOverrideReason !== 'string' || rule.source.editionOverrideReason.trim() === '') {
        throw new Error(`Rule ${rule.ruleId} uses non-default edition "${rule.source.edition}" without a documented source.editionOverrideReason.`);
      }
    }

    if (rule.confidence !== 1.0) {
      throw new Error(`Rule ${rule.ruleId} classified as STATUTORY_SBC must have confidence 1.0.`);
    }
    if (!rule.isStatutoryCode) {
      throw new Error(`Rule ${rule.ruleId} classified as STATUTORY_SBC must set isStatutoryCode=true.`);
    }
  } else if (rule.classification === RuleClassification.PRELIMINARY_HEURISTIC) {
    if (rule.source.authority && rule.source.authority.startsWith('SBC')) {
      throw new Error(`Rule ${rule.ruleId} is a PRELIMINARY_HEURISTIC and MUST NOT be attributed to SBC.`);
    }
    if (rule.isStatutoryCode) {
      throw new Error(`Rule ${rule.ruleId} classified as PRELIMINARY_HEURISTIC cannot have isStatutoryCode=true.`);
    }
    if (rule.confidence >= 1.0) {
      throw new Error(`Rule ${rule.ruleId} heuristic confidence must be < 1.0 (got ${rule.confidence}).`);
    }
  } else {
    throw new Error(`Rule ${rule.ruleId} has unrecognized classification: ${rule.classification}`);
  }

  return true;
}
