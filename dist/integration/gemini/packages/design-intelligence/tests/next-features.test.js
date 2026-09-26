import test from 'node:test';
import assert from 'node:assert';
import {
  ProductionKnowledgeGate,
  ConfigurationRegistry,
  DEFAULT_CONFIG,
  ConfigValueType,
  ReferenceImportPayload,
  DrawingArtifact,
  DrawingType,
  RegulatoryCitation,
  KnowledgePrecedenceLevel,
  KnowledgePrecedenceResolver,
  KnowledgeConflictDetector,
  DesignIntelligenceEngine,
  SYNTHETIC_REFERENCE_CASES,
  MACRO_PATTERNS
} from '../index.js';
import { TEST_SCENARIOS } from '../fixtures/test-scenarios.js';

test('Production Knowledge Gate: Blocks synthetic reference fixtures from production', () => {
  const syntheticCase = SYNTHETIC_REFERENCE_CASES[0];
  const gateResult = ProductionKnowledgeGate.verifyForProduction(syntheticCase);

  assert.strictEqual(gateResult.allowed, false, 'Synthetic fixture MUST be blocked from production');
  assert.ok(
    gateResult.rejectionReasons.some(r => r.includes('SYNTHETIC_FIXTURE_REJECTED')),
    'Rejection reasons must cite SYNTHETIC_FIXTURE_REJECTED'
  );
});

test('Production Knowledge Gate: Blocks items with missing or anonymous provenance', () => {
  const anonymousItem = {
    patternId: 'PAT-ANON-001',
    name: 'Anonymous Pattern',
    provenance: { source: 'ANONYMOUS_FORUM', sourceType: 'UNVERIFIED' }
  };
  const gateResult = ProductionKnowledgeGate.verifyForProduction(anonymousItem);

  assert.strictEqual(gateResult.allowed, false);
  assert.ok(gateResult.rejectionReasons.some(r => r.includes('ANONYMOUS_REFERENCE_REJECTED')));
});

test('Production Knowledge Gate: Rejects unsupported regulatory claims', () => {
  const ungroundedItem = {
    patternId: 'PAT-UNGROUNDED-SBC',
    name: 'Faux SBC Pattern',
    version: '1.0.0',
    verificationStatus: 'CERTIFIED',
    confidence: 0.95,
    tags: ['sbc-mandated'],
    provenance: {
      source: 'Internal team intuition',
      sourceType: 'HEURISTIC',
      verifiedAt: '2026-01-01'
    }
  };
  const gateResult = ProductionKnowledgeGate.verifyForProduction(ungroundedItem);

  assert.strictEqual(gateResult.allowed, false);
  assert.ok(
    gateResult.rejectionReasons.some(r => r.includes('UNSUPPORTED_REGULATORY_CLAIM')),
    'Must reject regulatory claim lacking official SBC citation'
  );
});

test('Configuration Registry: Versioning and audit trail on heuristic changes', () => {
  const customConfig = new ConfigurationRegistry();
  const initialEntry = customConfig.getEntry('DIVERSITY_MIN_THRESHOLD');
  assert.strictEqual(initialEntry.version, '1.0.0');

  customConfig.set('DIVERSITY_MIN_THRESHOLD', 0.50, 'Elevated threshold for strict diversity', 'INTEGRATION_TESTER');
  const updatedEntry = customConfig.getEntry('DIVERSITY_MIN_THRESHOLD');

  assert.strictEqual(updatedEntry.value, 0.50);
  assert.strictEqual(updatedEntry.version, '1.0.1', 'Must increment patch version on change');
  assert.strictEqual(updatedEntry.changedBy, 'INTEGRATION_TESTER');
  assert.ok(updatedEntry.changedAt, 'Must set changedAt timestamp');
});

test('Heuristic vs Regulatory Separation: Internal weights are explicitly classified as HEURISTIC', () => {
  const weightsEntry = DEFAULT_CONFIG.getEntry('COMPATIBILITY_WEIGHTS');
  assert.strictEqual(weightsEntry.type, ConfigValueType.HEURISTIC, 'Compatibility weights must be HEURISTIC');

  const diversityEntry = DEFAULT_CONFIG.getEntry('DIVERSITY_MIN_THRESHOLD');
  assert.strictEqual(diversityEntry.type, ConfigValueType.HEURISTIC, 'Diversity threshold must be HEURISTIC');

  assert.notStrictEqual(weightsEntry.type, ConfigValueType.STATUTORY_REGULATORY);
});

test('Reference Import Contract: Drawings are never EngineeringTruth until certified', () => {
  const payload = new ReferenceImportPayload({
    caseId: 'REF-PROJECT-IMPORT-001',
    projectTitle: 'Verified Contemporary Villa Project',
    location: 'Riyadh',
    buildingTypology: 'VILLA',
    drawings: [
      new DrawingArtifact({
        id: 'DWG-001',
        type: DrawingType.FLOOR_PLAN,
        uriOrPath: 'vault/drawings/dwg_001.dwg',
        description: 'Architectural Ground Floor Plan'
      })
    ],
    regulatoryCitations: [
      new RegulatoryCitation({
        code: 'SBC-201',
        article: 'Section 402.1',
        description: 'Natural light and ventilation statutory requirements'
      })
    ],
    provenance: { source: 'Licensed Architecture Firm Archive' }
  });

  assert.strictEqual(payload.drawings[0].isEngineeringTruth, false, 'Imported drawing must start with isEngineeringTruth: false');

  payload.certifyDrawingTruth('DWG-001', {
    engineerName: 'Eng. Fahad Al-Otaibi',
    licenseNumber: 'SCE-ENG-9941',
    remarks: 'Verified against as-built laser survey.'
  });

  assert.strictEqual(payload.drawings[0].isEngineeringTruth, true, 'Certified drawing becomes EngineeringTruth: true');
  assert.strictEqual(payload.drawings[0].verificationAudit.licenseNumber, 'SCE-ENG-9941');
});

test('Knowledge Precedence: Statutory code, geometry, and user mandates override reference pattern heuristics', () => {
  assert.ok(
    KnowledgePrecedenceResolver.outranks(KnowledgePrecedenceLevel.USER_HARD_REQUIREMENT, KnowledgePrecedenceLevel.REFERENCE_PATTERN),
    'User hard constraint outranks reference pattern'
  );
  assert.ok(
    KnowledgePrecedenceResolver.outranks(KnowledgePrecedenceLevel.VERIFIED_GEOMETRY, KnowledgePrecedenceLevel.REFERENCE_PATTERN),
    'Verified geometry outranks reference pattern'
  );
  assert.ok(
    KnowledgePrecedenceResolver.outranks(KnowledgePrecedenceLevel.VERIFIED_REGULATORY_RULE, KnowledgePrecedenceLevel.REFERENCE_PATTERN),
    'Verified regulatory rule outranks reference pattern'
  );

  const courtyard = MACRO_PATTERNS.find(p => p.patternId === 'PAT-MACRO-COURTYARD');
  const conflicts = KnowledgeConflictDetector.detectConflicts(courtyard, TEST_SCENARIOS.scenario18_knowledgeConflict);

  assert.ok(conflicts.length > 0);
  assert.strictEqual(conflicts[0].precedenceVerdict, 'PATTERN_SURRENDERS');
  assert.strictEqual(conflicts[0].precedenceAudit.dominantLevel, KnowledgePrecedenceLevel.VERIFIED_GEOMETRY);
});

test('Configuration Determinism: Identical inputs yield identical deterministic hashes', () => {
  const engine = new DesignIntelligenceEngine();
  const context = TEST_SCENARIOS.scenario1_rectangularSingleStreet;

  const run1 = engine.retrieveCandidates(context, 3);
  const run2 = engine.retrieveCandidates(context, 3);

  assert.strictEqual(
    run1.executionMetadata.deterministicHash,
    run2.executionMetadata.deterministicHash,
    'Deterministic hashes must match across identical runs'
  );
  assert.strictEqual(
    run1.candidateStrategies[0].matchScore,
    run2.candidateStrategies[0].matchScore,
    'Scores must be bit-level identical'
  );
});

test('Baseline Compatibility: All 14 foundational macro patterns remain fully retrievable in v1.1.0-dev', () => {
  const engine = new DesignIntelligenceEngine();
  assert.strictEqual(engine.macroPatterns.length, 14, 'Must retain all 14 baseline macro patterns');
  assert.strictEqual(engine.patternRegistry.count(), 14 + engine.microPatterns.length, 'Registry must index all patterns');

  const queryAll = engine.patternRegistry.getAll();
  assert.ok(queryAll.some(p => p.patternId === 'PAT-MACRO-L-SHAPED'));
  assert.ok(queryAll.some(p => p.patternId === 'PAT-MACRO-COURTYARD'));
  assert.ok(queryAll.some(p => p.patternId === 'PAT-MACRO-CORNER-PLOT'));
});
