import test from 'node:test';
import assert from 'node:assert';
import { GeometricEquations } from '../src/geometric-equations.js';
import { AcousticComfort, SmartStorage, MaintenancePrediction } from '../src/analytical-algorithms.js';
import { CustomerBenefits } from '../src/customer-benefits.js';

test('Engineering Math Boundaries: Geometric equations reject negative inputs with clear errors', () => {
  assert.throws(() => GeometricEquations.areaRectangle(-5, 4), /non-negative/);
  assert.throws(() => GeometricEquations.areaCircle(-1), /non-negative/);
  assert.throws(() => GeometricEquations.volumeCube(-2), /non-negative/);
  assert.throws(() => GeometricEquations.pythagoreanTheorem(-3, 4), /non-negative/);
  assert.throws(() => GeometricEquations.polygonAngleSum(2), /at least 3 sides/);
  assert.throws(() => GeometricEquations.slabThickness(0), /positive/);
  assert.throws(() => GeometricEquations.beamHeight(-1), /positive/);
  assert.throws(() => GeometricEquations.windowArea(0), /positive/);
});

test('Engineering Math Boundaries: Acoustic transmission coefficient strict limits', () => {
  assert.throws(() => AcousticComfort.calculateSRI(0), /range \(0, 1\]/);
  assert.throws(() => AcousticComfort.calculateSRI(-0.5), /range \(0, 1\]/);
  assert.throws(() => AcousticComfort.calculateSRI(1.05), /range \(0, 1\]/);

  assert.strictEqual(AcousticComfort.calculateSRI(1.0), 0.0);
  assert.strictEqual(AcousticComfort.calculateSRI(0.0001), 40.0);
});

test('Engineering Math Boundaries: Storage ratio assessment at exact 8% and 10% thresholds', () => {
  const homeVolume = 1000;

  const subMin = SmartStorage.assessStorage(79.9, homeVolume);
  assert.strictEqual(subMin.assessment, 'INSUFFICIENT');

  const atMin = SmartStorage.assessStorage(80.0, homeVolume);
  assert.strictEqual(atMin.assessment, 'IDEAL');

  const atMax = SmartStorage.assessStorage(100.0, homeVolume);
  assert.strictEqual(atMax.assessment, 'IDEAL');

  const aboveMax = SmartStorage.assessStorage(100.1, homeVolume);
  assert.strictEqual(aboveMax.assessment, 'SURPLUS');
});

test('Engineering Math Boundaries: Customer Benefits & Price Verification exact thresholds', () => {
  assert.throws(() => CustomerBenefits.calculateTotalBenefits(0), /positive/);
  assert.throws(() => CustomerBenefits.calculateTotalBenefits(-100), /positive/);

  const atBoundary = CustomerBenefits.priceVerification('CERAMIC_TILES_M2', 130);
  assert.strictEqual(atBoundary.isFair, true);
  assert.strictEqual(atBoundary.verdict, 'COMPLIANT_MARKET_PRICE');

  const oneAboveBoundary = CustomerBenefits.priceVerification('CERAMIC_TILES_M2', 130.01);
  assert.strictEqual(oneAboveBoundary.isFair, false);
  assert.strictEqual(oneAboveBoundary.verdict, 'ABOVE_MARKET_RATE_FLAGGED');
});
