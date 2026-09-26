import test from 'node:test';
import assert from 'node:assert';
import {
  AcousticComfort,
  MaintenancePrediction,
  SmartStorage,
  SeasonalOptimization,
  ErgonomicEfficiency,
  BiophilicDesign,
  SecurityPrivacy
} from '../src/analytical-algorithms.js';

test('Acoustic Comfort: Decibel reduction and Sound Reduction Index (SRI)', () => {
  // SRI = -10 * log10(0.01) = 20 dB
  assert.strictEqual(AcousticComfort.calculateSRI(0.01), 20.0);
  assert.strictEqual(AcousticComfort.calculateSRI(0.001), 30.0);

  const noise = AcousticComfort.calculateNoiseReduction(80, 45);
  assert.strictEqual(noise.reductionDb, 35.0);
  assert.strictEqual(noise.percentReduction, 43.8);

  const score = AcousticComfort.calculateScore(90, 85.5, 100, 80);
  assert.ok(score >= 89 && score <= 91);
});

test('Maintenance Prediction: TCO and degradation lifespan analytics', () => {
  const result = MaintenancePrediction.calculateMaintenance(100000, 10, 3000, 10);
  assert.strictEqual(result.degradationRatePercent, 10.0);
  assert.strictEqual(result.remainingValue, 0);
  assert.strictEqual(result.totalMaintenance, 30000);
  assert.strictEqual(result.TCO, 130000);
  assert.strictEqual(result.annualCost, 13000);

  // Compare ceramic vs marble options
  const comparison = MaintenancePrediction.compareOptions([
    { name: 'Ceramic', cost: 100000, lifespan: 10, maintenance: 3000, years: 10 },
    { name: 'Marble', cost: 180000, lifespan: 50, maintenance: 500, years: 10 }
  ]);
  assert.strictEqual(comparison.bestOption.name, 'Marble', 'Marble has lower amortized annual cost');
});

test('Smart Storage: Volumetric assessment against 8-10% home volume benchmark', () => {
  const homeVolume = 1200; // 400 m² * 3m height
  const ideal = SmartStorage.assessStorage(110, homeVolume);
  assert.strictEqual(ideal.assessment, 'IDEAL');
  assert.strictEqual(ideal.ideals.minimum, 96.0);
  assert.strictEqual(ideal.ideals.maximum, 120.0);

  const insufficient = SmartStorage.assessStorage(60, homeVolume);
  assert.strictEqual(insufficient.assessment, 'INSUFFICIENT');
});

test('Ergonomics and Seasonal Optimization: Correct scoring formulas', () => {
  const ergo = ErgonomicEfficiency.calculateScore(80, 100, 90, 91);
  assert.strictEqual(ergo, 89.7);

  const seasonal = SeasonalOptimization.calculateEfficiency(80, 83, 92, 100);
  assert.strictEqual(seasonal, 88.8);
  const savings = SeasonalOptimization.calculateAnnualSavings(65, 200);
  assert.strictEqual(savings, 13000);
});
