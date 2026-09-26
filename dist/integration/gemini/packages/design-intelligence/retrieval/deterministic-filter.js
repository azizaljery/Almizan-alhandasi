/**
 * @file deterministic-filter.js
 * @description Hard pre-filtering of architectural patterns prior to scoring.
 * Fast, deterministic, zero-AI dependency, integrated with ConfigurationRegistry.
 */

import { DEFAULT_CONFIG } from '../config/configuration-registry.js';

export class DeterministicFilter {
  /**
   * Filters out physically impossible or strictly incompatible patterns.
   * @param {Array<object>} patterns 
   * @param {object} context 
   * @param {object} [config=DEFAULT_CONFIG]
   * @returns {{ filteredPatterns: Array<object>, excludedRecords: Array<object> }}
   */
  static filter(patterns, context, config = DEFAULT_CONFIG) {
    const filteredPatterns = [];
    const excludedRecords = [];
    const { plot, requirements = {} } = context;

    const minPlotAreaRatio = config.get('MIN_PLOT_AREA_RATIO') || 0.70;
    const minFrontageRatio = config.get('MIN_FRONTAGE_RATIO') || 0.75;

    for (const pattern of patterns) {
      let isExcluded = false;
      let reason = '';

      // 1. Hard Plot Area Boundary
      if (plot && plot.areaSqM && pattern.plotConditions?.minPlotArea) {
        if (plot.areaSqM < pattern.plotConditions.minPlotArea * minPlotAreaRatio) {
          isExcluded = true;
          reason = `Plot area ${plot.areaSqM} m² is critically insufficient for ${pattern.name} (min ${pattern.plotConditions.minPlotArea} m²).`;
        }
      }

      // 2. Hard Frontage Boundary
      if (!isExcluded && plot && plot.frontageM && pattern.plotConditions?.minFrontageM) {
        if (plot.frontageM < pattern.plotConditions.minFrontageM * minFrontageRatio) {
          isExcluded = true;
          reason = `Plot frontage ${plot.frontageM} m cannot physically accommodate minimum wing width (${pattern.plotConditions.minFrontageM} m).`;
        }
      }

      // 3. Hard Street Condition Constraint
      if (!isExcluded && plot && plot.streetCondition && pattern.streetConditions && pattern.streetConditions.length > 0) {
        if (pattern.streetConditions.includes('TWO_STREETS_CORNER') && pattern.streetConditions.length === 1 && plot.streetCondition === 'ONE_STREET') {
          isExcluded = true;
          reason = `Pattern requires a corner plot with two intersecting streets; site has only one street.`;
        } else if (pattern.streetConditions.includes('TWO_STREETS_OPPOSITE') && pattern.streetConditions.length === 1 && plot.streetCondition === 'ONE_STREET') {
          isExcluded = true;
          reason = `Pattern strictly requires a through-plot (two opposing streets); site has only one street.`;
        }
      }

      // 4. Hard User Prohibitions
      if (!isExcluded && requirements.disallowedPatternIds && requirements.disallowedPatternIds.includes(pattern.patternId)) {
        isExcluded = true;
        reason = `Explicitly blacklisted by client requirements.`;
      }

      if (isExcluded) {
        excludedRecords.push({ patternId: pattern.patternId, name: pattern.name, reason });
      } else {
        filteredPatterns.push(pattern);
      }
    }

    return { filteredPatterns, excludedRecords };
  }
}
