import test from 'node:test';
import assert from 'node:assert';
import { GeometricEquations } from '../src/geometric-equations.js';

test('Geometric Equations: Areas and basic 2D metrics (Equations 1-8)', () => {
  assert.strictEqual(GeometricEquations.areaRectangle(5, 4), 20);
  assert.strictEqual(GeometricEquations.areaSquare(6), 36);
  assert.strictEqual(GeometricEquations.areaTriangle(8, 6), 24);
  assert.strictEqual(Number(GeometricEquations.areaCircle(2).toFixed(2)), 12.57);
  assert.strictEqual(GeometricEquations.areaTrapezoid(10, 6, 4), 32);
  assert.strictEqual(GeometricEquations.areaParallelogram(7, 5), 35);
  assert.strictEqual(GeometricEquations.areaDiamond(8, 6), 24);
  assert.strictEqual(Number(GeometricEquations.areaHexagon(4).toFixed(2)), 41.57);
});

test('Geometric Equations: Volumes and 3D solids (Equations 9-14)', () => {
  assert.strictEqual(GeometricEquations.volumeCube(3), 27);
  assert.strictEqual(GeometricEquations.volumeRectangularPrism(5, 4, 3), 60);
  assert.strictEqual(Number(GeometricEquations.volumeCylinder(0.5, 3).toFixed(2)), 2.36);
  assert.strictEqual(Number(GeometricEquations.volumeSphere(1.5).toFixed(2)), 14.14);
  assert.strictEqual(Math.round(GeometricEquations.volumePyramid(25, 6)), 50);
  assert.strictEqual(Number(GeometricEquations.volumeCone(2, 4).toFixed(2)), 16.76);
});

test('Geometric Equations: Structural sizing and physics (Equations 30-31, 39-40, 50-51)', () => {
  assert.strictEqual(GeometricEquations.slabThickness(6.0), 0.24);
  assert.strictEqual(GeometricEquations.beamHeight(6.0), 0.50);
  assert.strictEqual(GeometricEquations.reinforcementSteel(450, 60), 27.0);
  assert.strictEqual(GeometricEquations.heatLossWatts(100, 1.0, 20), 2000);
  assert.strictEqual(GeometricEquations.energySavingsPercentage(4.0, 0.5), 87.5);
});

test('Geometric Equations: MEP, Fenestration and Proportions (Equations 22, 34-36, 41, 43-45)', () => {
  assert.ok(Math.abs(GeometricEquations.goldenRatio() - 1.618) < 0.001);
  assert.strictEqual(GeometricEquations.goldenRatioLength(5.0), 8.09);
  assert.strictEqual(GeometricEquations.windowArea(20), 2.5);
  const btu = GeometricEquations.coolingCapacityBTU(60, 250);
  assert.strictEqual(btu, 15000);
  assert.strictEqual(GeometricEquations.coolingCapacityKW(btu), 4.4);
  const dailyWater = GeometricEquations.waterConsumptionDaily(6, 175);
  assert.strictEqual(dailyWater, 1050);
  assert.strictEqual(GeometricEquations.waterTankVolume(dailyWater, 1.5), 1.575);
  assert.strictEqual(GeometricEquations.pipeDiameterMm(0.5), 15);
  assert.strictEqual(GeometricEquations.pipeDiameterMm(2.5), 32);
});
