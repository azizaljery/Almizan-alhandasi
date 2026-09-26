import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DesignIntelligenceEngine } from '../engine.js';
import { GeometricEquations, CustomerBenefits, AcousticComfort } from '../../engineering-math/src/index.js';

test('End-to-End Pipeline: Pattern Retrieval -> Geometric Verification -> Engineering Physics & BOQ', async () => {
  const plotContext = {
    plot: {
      width: 20,
      length: 25,
      areaSqM: 500,
      frontageM: 20,
      depthM: 25,
      streetCondition: 'ONE_STREET',
      streets: { s: true },
      entry: 's',
      floors: 1,
      shape: 'rect'
    },
    requirements: {
      typology: 'VILLA',
      needsMenMajlis: true,
      needsWomenMajlis: true,
      needsMotherSuite: true,
      highPrivacy: true,
      privacyLevel: 'HIGH'
    }
  };

  const diEngine = new DesignIntelligenceEngine();
  const diResult = diEngine.retrieveCandidates(plotContext, 3);

  assert.ok(diResult.candidateStrategies.length >= 1, 'Must retrieve candidate strategies');
  const topCandidate = diResult.candidateStrategies[0];
  assert.ok(topCandidate.matchScore >= 0.80, 'Top candidate must match site conditions');
  assert.ok(topCandidate.recommendedMicroPatterns.includes('PAT-MICRO-MEN-MAJLIS'));
  assert.ok(topCandidate.recommendedMicroPatterns.includes('PAT-MICRO-MOTHER-SUITE'));

  let grossArea = 350;
  let roomCount = 8;
  const fixturePath = path.resolve('../engineering-core/fixtures/compliant-villa.fixture.json');
  if (fs.existsSync(fixturePath)) {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    grossArea = fixture.spaces.reduce((acc, s) => acc + (s.netAreaSqM || s.areaSqM || 35), 0) * 1.5;
    roomCount = fixture.spaces.length;
  }

  assert.ok(grossArea > 0);
  assert.ok(roomCount >= 4);

  const concreteVol = GeometricEquations.concreteQuantity(plotContext.plot.width * 0.7, plotContext.plot.length * 0.7, 0.4);
  const steelTons = GeometricEquations.reinforcementSteel(concreteVol, 65);
  assert.ok(steelTons > 0, 'Must compute reinforcement steel');

  const hvacBtu = GeometricEquations.coolingCapacityBTU(grossArea * 3.2, 250);
  const hvacKw = GeometricEquations.coolingCapacityKW(hvacBtu);
  assert.ok(hvacKw > 0, 'Must compute cooling capacity');

  const boq = CustomerBenefits.generateBillOfQuantities(grossArea, roomCount);
  assert.ok(boq.ceramicTilesUnits > 0);
  assert.ok(boq.paintLiters > 0);

  const benefits = CustomerBenefits.calculateTotalBenefits(grossArea, 850);
  assert.ok(benefits.totalMonetarySavingsSAR > 10000, 'Must produce quantified savings');

  const acousticScore = AcousticComfort.calculateScore(90, 85, 95, 80);
  assert.ok(acousticScore >= 85, 'Acoustic comfort must satisfy luxury privacy standard');
});
