import test from 'node:test';
import assert from 'node:assert';
import { CustomerBenefits } from '../src/customer-benefits.js';

test('Customer Benefits: Generates quantitative monetary savings breakdown', () => {
  const benefits = CustomerBenefits.calculateTotalBenefits(1250, 750);
  assert.strictEqual(benefits.projectAreaSqM, 1250);
  assert.strictEqual(benefits.totalProjectEstimatedCost, 937500); // 1250 * 750
  assert.ok(benefits.totalMonetarySavingsSAR > 50000, 'Must produce measurable verified savings');
  assert.ok(benefits.percentageOfProjectValue > 5, 'Savings percentage should be meaningful');
});

test('Automatic BOQ Generation: Yields realistic bill of quantities for residential villa', () => {
  const boq = CustomerBenefits.generateBillOfQuantities(600, 8);
  assert.ok(boq.ceramicTilesUnits > 0);
  assert.ok(boq.paintLiters > 0);
  assert.ok(boq.reinforcementSteelTons > 0);
  assert.ok(boq.concreteVolumeM3 > 0);
  assert.strictEqual(boq.doorsCount, 11); // 8 + 3
});

test('Price Verification: Flags above-market contractor rates accurately', () => {
  const fairCeramic = CustomerBenefits.priceVerification('CERAMIC_TILES_M2', 110);
  assert.strictEqual(fairCeramic.isFair, true);
  assert.strictEqual(fairCeramic.verdict, 'COMPLIANT_MARKET_PRICE');

  const overpricedSteel = CustomerBenefits.priceVerification('REINFORCING_STEEL_TON', 4200);
  assert.strictEqual(overpricedSteel.isFair, false);
  assert.strictEqual(overpricedSteel.verdict, 'ABOVE_MARKET_RATE_FLAGGED');
  assert.ok(overpricedSteel.premiumPercent > 20);
});
