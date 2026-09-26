/**
 * @file index.js
 * @description Main export barrel for @mizan/design-intelligence (v1.1.0-dev).
 */

export { DesignIntelligenceEngine } from './engine.js';
export { MACRO_PATTERNS } from './library/macro-patterns.js';
export { MICRO_PATTERNS } from './library/micro-patterns.js';
export { SYNTHETIC_REFERENCE_CASES, VERIFIED_REFERENCE_CASES } from './library/reference-cases.js';
export { KNOWN_NEGATIVE_PATTERNS } from './library/negative-patterns.js';
export { PatternRegistry, ArchitecturalDomain, SaudiArchitecturalRegion } from './library/pattern-registry.js';

export * from './contracts/knowledge-taxonomy.contract.js';
export * from './contracts/pattern.contract.js';
export * from './contracts/graph.contract.js';
export * from './contracts/reference-case.contract.js';
export * from './contracts/reference-import.contract.js';
export * from './contracts/feedback.contract.js';
export * from './contracts/aziz-integration.contract.js';

export { ConfigurationRegistry, DEFAULT_CONFIG, ConfigValueType, ConfigEntry } from './config/configuration-registry.js';
export { ProductionKnowledgeGate } from './gates/production-knowledge-gate.js';
export { GraphBuilder } from './graph/graph-builder.js';
export { GraphMatcher } from './graph/graph-matcher.js';
export { PatternCompatibilityEvaluator } from './evaluators/compatibility-evaluator.js';
export { ConceptDiversityEvaluator } from './evaluators/diversity-evaluator.js';
export { KnowledgeQualityEvaluator } from './evaluators/quality-evaluator.js';
export { KnowledgeConflictDetector } from './evaluators/conflict-evaluator.js';
export { DeterministicFilter } from './retrieval/deterministic-filter.js';
export { ScoringEngine } from './retrieval/scoring-engine.js';
export { HybridRetrievalEngine } from './retrieval/hybrid-retrieval-engine.js';
