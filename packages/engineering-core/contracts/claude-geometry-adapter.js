import { computeGeometryHash, deepFreeze } from '../core/geometry-hasher.js';
import { SUPPORTED_CLAUDE_SCHEMA_VERSIONS } from './claude-geometry.contract.js';

export class ClaudeGeometryAdapter {
  static adapt(rawGeometry) {
    if (!rawGeometry || typeof rawGeometry !== 'object') {
      throw new Error('[ClaudeGeometryAdapter] Invalid input: Geometry payload must be a non-null object.');
    }

    const schemaVersion = rawGeometry.schemaVersion || 'claude-design-schema-v1.0';
    if (!SUPPORTED_CLAUDE_SCHEMA_VERSIONS.includes(schemaVersion)) {
      throw new Error(`[ClaudeGeometryAdapter] Unsupported Claude Design Schema version: "${schemaVersion}". Supported versions: ${SUPPORTED_CLAUDE_SCHEMA_VERSIONS.join(', ')}`);
    }

    if (!rawGeometry.projectId) {
      throw new Error('[ClaudeGeometryAdapter] Missing mandatory field: projectId.');
    }
    if (!Array.isArray(rawGeometry.levels) || rawGeometry.levels.length === 0) {
      throw new Error('[ClaudeGeometryAdapter] Geometry must define at least one level in "levels".');
    }
    if (!Array.isArray(rawGeometry.spaces)) {
      throw new Error('[ClaudeGeometryAdapter] Geometry must define "spaces" array.');
    }
    if (!Array.isArray(rawGeometry.structuralElements)) {
      throw new Error('[ClaudeGeometryAdapter] Geometry must define "structuralElements" array.');
    }
    if (!Array.isArray(rawGeometry.enclosureElements)) {
      throw new Error('[ClaudeGeometryAdapter] Geometry must define "enclosureElements" array.');
    }

    const sourceGeometryHash = computeGeometryHash(rawGeometry);
    const units = rawGeometry.units || 'METRIC_MM';
    const unitScaleToMm = (units === 'METRIC_M') ? 1000 : 1;

    const frozenGeometry = deepFreeze(JSON.parse(JSON.stringify(rawGeometry)));

    return {
      geometry: frozenGeometry,
      sourceGeometryHash,
      sourceSchemaVersion: schemaVersion,
      unitScaleToMm
    };
  }
}
