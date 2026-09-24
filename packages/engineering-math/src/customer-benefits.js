/**
 * @file customer-benefits.js
 * @description Customer Financial & Operational Benefit Engine, Automatic BOQ Generator, and Price Protection.
 */

export class CustomerBenefits {
  /**
   * Generates quantitative monetary savings and risk mitigations for the client.
   * @param {number} projectAreaSqM
   * @param {number} [avgCostPerM2=750]
   */
  static calculateTotalBenefits(projectAreaSqM, avgCostPerM2 = 750) {
    if (projectAreaSqM <= 0) throw new Error('Project area must be positive.');

    // 1. Time Savings: reduction from 3-4 weeks to immediate computational iterations
    const savedHours = 40 * 4;
    const timeValueSAR = savedHours * 65; // Professional consultation equivalent rate

    // 2. Error & Rework Prevention: physical collision and code compliance
    const errorPreventionSAR = Math.round(projectAreaSqM * 12);

    // 3. Waste Reduction: 12% savings on over-ordered materials
    const materialValueEstimate = projectAreaSqM * avgCostPerM2 * 0.35;
    const wasteReductionSAR = Math.round(materialValueEstimate * 0.08);

    // 4. Contractor Price Transparency Protection
    const priceProtectionSAR = Math.round(projectAreaSqM * avgCostPerM2 * 0.04);

    const totalMonetarySavings = timeValueSAR + errorPreventionSAR + wasteReductionSAR + priceProtectionSAR;
    const totalProjectEstimatedCost = projectAreaSqM * avgCostPerM2;

    return {
      projectAreaSqM,
      totalProjectEstimatedCost,
      breakdown: {
        timeSavingsSAR: timeValueSAR,
        errorPreventionSAR,
        wasteReductionSAR,
        priceProtectionSAR
      },
      totalMonetarySavingsSAR: totalMonetarySavings,
      percentageOfProjectValue: Number(((totalMonetarySavings / totalProjectEstimatedCost) * 100).toFixed(1))
    };
  }

  /**
   * Generates preliminary Automatic Bill of Quantities (BOQ).
   */
  static generateBillOfQuantities(projectAreaSqM, roomCount) {
    if (projectAreaSqM <= 0 || roomCount <= 0) throw new Error('Invalid project area or room count.');

    return {
      ceramicTilesUnits: Math.ceil((projectAreaSqM * 1.05) / 0.36), // 60x60cm tiles with 5% waste
      paintLiters: Math.ceil(((projectAreaSqM * 2.8) / 9) * 2),     // 2 coats on perimeter walls
      reinforcementSteelTons: Number(((projectAreaSqM * 0.22) * 0.070).toFixed(2)),
      concreteVolumeM3: Math.round(projectAreaSqM * 0.35),
      windowsCount: Math.max(roomCount, Math.round(projectAreaSqM / 22)),
      doorsCount: roomCount + 3,
      electricalOutletsCount: Math.round(projectAreaSqM * 0.45),
      plumbingFixturesCount: Math.round(roomCount * 1.8)
    };
  }

  /**
   * Price verification against benchmark fair market prices in Saudi residential construction.
   */
  static priceVerification(itemName, unitPriceSAR) {
    const marketBenchmarks = {
      CERAMIC_TILES_M2: { fair: 85, maxTolerated: 130 },
      INTERIOR_PAINT_LITER: { fair: 45, maxTolerated: 75 },
      REINFORCING_STEEL_TON: { fair: 3100, maxTolerated: 3450 },
      READY_MIX_CONCRETE_M3: { fair: 240, maxTolerated: 285 }
    };

    const key = itemName.toUpperCase();
    const benchmark = marketBenchmarks[key];
    if (!benchmark) {
      return { itemName, status: 'UNTRACKED_ITEM', fairPrice: null };
    }

    const isFair = unitPriceSAR <= benchmark.maxTolerated;
    const premiumPercent = unitPriceSAR > benchmark.fair 
      ? Number((((unitPriceSAR - benchmark.fair) / benchmark.fair) * 100).toFixed(1))
      : 0;

    return {
      itemName,
      unitPriceSAR,
      marketFairSAR: benchmark.fair,
      maxToleratedSAR: benchmark.maxTolerated,
      isFair,
      premiumPercent,
      verdict: isFair ? 'COMPLIANT_MARKET_PRICE' : 'ABOVE_MARKET_RATE_FLAGGED'
    };
  }
}
