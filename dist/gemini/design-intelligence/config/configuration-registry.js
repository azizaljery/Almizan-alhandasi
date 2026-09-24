/**
 * @file configuration-registry.js
 * @description Versioned Configuration Registry tracking all design intelligence heuristics, weights, and thresholds.
 * Strictly separates engineering heuristics from statutory regulatory rules (SBC).
 */

export const ConfigValueType = Object.freeze({
  HEURISTIC: 'HEURISTIC',
  EXTERNALLY_SOURCED: 'EXTERNALLY_SOURCED',
  STATUTORY_REGULATORY: 'STATUTORY_REGULATORY'
});

export class ConfigEntry {
  constructor({ key, value, version, rationale, type, changedAt, changedBy, isConfigurable = true }) {
    this.key = key;
    this.value = value;
    this.version = version;
    this.rationale = rationale;
    this.type = type;
    this.changedAt = changedAt;
    this.changedBy = changedBy;
    this.isConfigurable = isConfigurable;
  }
}

export class ConfigurationRegistry {
  constructor(initialOverrides = {}) {
    this.registryVersion = '1.1.0';
    this.entries = new Map();
    this.initializeDefaults();

    // Apply any explicit overrides
    for (const [k, v] of Object.entries(initialOverrides)) {
      this.set(k, v, 'Runtime User Override', 'USER');
    }
  }

  initializeDefaults() {
    this.register(new ConfigEntry({
      key: 'COMPATIBILITY_WEIGHTS',
      value: {
        plotArea: 0.12,
        aspectRatio: 0.14,
        street: 0.08,
        entrance: 0.08,
        program: 0.12,
        graph: 0.16,
        privacy: 0.10,
        circulation: 0.06,
        service: 0.05,
        geometry: 0.09
      },
      version: '1.0.0',
      rationale: 'Balanced distribution across 11 spatial dimensions to prevent any single constraint from dominating layout retrieval.',
      type: ConfigValueType.HEURISTIC,
      changedAt: '2026-09-23T05:00:00Z',
      changedBy: 'MIZAN_CORE_DESIGN_TEAM'
    }));

    this.register(new ConfigEntry({
      key: 'DIVERSITY_WEIGHTS',
      value: {
        zoning: 0.28,
        circulation: 0.18,
        entrance: 0.14,
        geometry: 0.12,
        privacy: 0.12,
        service: 0.08,
        topology: 0.08
      },
      version: '1.0.0',
      rationale: 'Prioritizes fundamental typological zoning differences over minor cosmetic geometry variations.',
      type: ConfigValueType.HEURISTIC,
      changedAt: '2026-09-23T05:00:00Z',
      changedBy: 'MIZAN_CORE_DESIGN_TEAM'
    }));

    this.register(new ConfigEntry({
      key: 'DIVERSITY_MIN_THRESHOLD',
      value: 0.42,
      version: '1.0.0',
      rationale: 'Minimum required pairwise Euclidean-like distance to reject cosmetic duplicates.',
      type: ConfigValueType.HEURISTIC,
      changedAt: '2026-09-23T05:00:00Z',
      changedBy: 'MIZAN_CORE_DESIGN_TEAM'
    }));

    this.register(new ConfigEntry({
      key: 'STALE_YEARS_THRESHOLD',
      value: 8,
      version: '1.0.0',
      rationale: 'Saudi residential market practices and lifestyle trends evolve over an 8-year horizon, requiring re-auditing.',
      type: ConfigValueType.HEURISTIC,
      changedAt: '2026-09-23T05:00:00Z',
      changedBy: 'MIZAN_CORE_DESIGN_TEAM'
    }));

    this.register(new ConfigEntry({
      key: 'MIN_PLOT_AREA_RATIO',
      value: 0.70,
      version: '1.0.0',
      rationale: 'Pre-filtering cutoff: if plot area is under 70% of pattern minimum, physical adaptation is unviable.',
      type: ConfigValueType.HEURISTIC,
      changedAt: '2026-09-23T05:00:00Z',
      changedBy: 'MIZAN_CORE_DESIGN_TEAM'
    }));

    this.register(new ConfigEntry({
      key: 'MIN_FRONTAGE_RATIO',
      value: 0.75,
      version: '1.0.0',
      rationale: 'Pre-filtering cutoff: if frontage is under 75% of pattern minimum, wing accommodation fails.',
      type: ConfigValueType.HEURISTIC,
      changedAt: '2026-09-23T05:00:00Z',
      changedBy: 'MIZAN_CORE_DESIGN_TEAM'
    }));

    this.register(new ConfigEntry({
      key: 'QUALITY_PASS_SCORE',
      value: 60,
      version: '1.0.0',
      rationale: 'Minimum benchmark score required for a pattern record to enter active library matching.',
      type: ConfigValueType.HEURISTIC,
      changedAt: '2026-09-23T05:00:00Z',
      changedBy: 'MIZAN_CORE_DESIGN_TEAM'
    }));
  }

  register(entry) {
    this.entries.set(entry.key, entry);
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error(`Configuration key "${key}" not found in ConfigurationRegistry.`);
    }
    return entry.value;
  }

  getEntry(key) {
    return this.entries.get(key);
  }

  set(key, newValue, rationale = 'Runtime adjustment', changedBy = 'CALLER') {
    const existing = this.entries.get(key);
    if (existing) {
      const nextVersion = this.bumpVersion(existing.version);
      this.entries.set(key, new ConfigEntry({
        key,
        value: newValue,
        version: nextVersion,
        rationale,
        type: existing.type,
        changedAt: new Date().toISOString(),
        changedBy,
        isConfigurable: existing.isConfigurable
      }));
    } else {
      this.entries.set(key, new ConfigEntry({
        key,
        value: newValue,
        version: '1.0.0',
        rationale,
        type: ConfigValueType.HEURISTIC,
        changedAt: new Date().toISOString(),
        changedBy,
        isConfigurable: true
      }));
    }
  }

  bumpVersion(v) {
    const parts = v.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }

  exportManifest() {
    const manifest = {};
    for (const [k, v] of this.entries.entries()) {
      manifest[k] = { ...v };
    }
    return manifest;
  }
}

// Global default singleton instance
export const DEFAULT_CONFIG = new ConfigurationRegistry();
