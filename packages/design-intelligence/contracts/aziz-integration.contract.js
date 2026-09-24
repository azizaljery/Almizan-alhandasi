/**
 * @file aziz-integration.contract.js
 * @description Canonical contract for delivering intelligence to AZIZ Orchestrator (@mizan/aziz-engine).
 */

export const ConflictPrecedence = {
  PATTERN_SURRENDERS: 'PATTERN_SURRENDERS',         // Statutory rules or user hard constraints always override reference
  ADVISORY_NEGOTIATION: 'ADVISORY_NEGOTIATION'     // Soft tradeoff that AZIZ can weigh
};

export class PatternConflict {
  constructor(data) {
    this.conflictId = data.conflictId || `CONF-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    this.patternId = data.patternId;
    this.conflictingDomain = data.conflictingDomain; // 'REGULATORY' | 'GEOMETRY' | 'ARCHITECTURAL' | 'USER'
    this.conflictType = data.conflictType;
    this.description = data.description;
    this.precedenceVerdict = data.precedenceVerdict || ConflictPrecedence.PATTERN_SURRENDERS;
    this.precedenceAudit = data.precedenceAudit || null;
    this.mitigationRecommendation = data.mitigationRecommendation || '';
  }
}

export class DesignIntelligenceResult {
  constructor(data) {
    this.engineId = '@mizan/design-intelligence';
    this.engineVersion = data.engineVersion || '1.1.0-dev';
    this.requestId = data.requestId || `REQ-${Date.now()}`;
    this.retrievedPatterns = data.retrievedPatterns || [];
    this.candidateStrategies = data.candidateStrategies || [];
    this.compatibilityScores = data.compatibilityScores || {};
    this.diversityAnalysis = data.diversityAnalysis || {
      isDiverseEnough: true,
      pairwiseDistanceMatrix: [],
      overallDiversityScore: 1.0,
      notes: []
    };
    this.conflicts = data.conflicts || [];
    this.warnings = data.warnings || [];
    this.assumptions = data.assumptions || [];
    this.unresolved = data.unresolved || [];
    this.confidence = data.confidence !== undefined ? data.confidence : 0.85;
    this.provenance = data.provenance || {
      libraryVersion: '2026.1',
      sourceType: 'MIZAN_VERIFIED_PATTERN_REPOSITORY',
      verifiedAt: new Date().toISOString()
    };
    this.executionMetadata = data.executionMetadata || {
      executionTimeMs: 0,
      deterministicHash: '',
      evaluatedPatternCount: 0
    };
  }
}
