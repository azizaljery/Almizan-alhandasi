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

    const units = rawGeometry.units || 'METRIC_MM';
    if (rawGeometry.units !== undefined && !['METRIC_M', 'METRIC_MM'].includes(rawGeometry.units)) throw new Error('UNIT_UNSUPPORTED');
    const sourceGeometryHash = computeGeometryHash(rawGeometry);
    function validateMeasurements(value, path = '$') {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (/Mm$/.test(key) || ['floorToCeilingHeight', 'slabThickness', 'netAreaSqM'].includes(key)) {
          if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) throw new Error(`INVALID_MEASUREMENT: ${path}.${key}`);
        }
        if (['polygon2D', 'boundaryPolygon'].includes(key) && (!Array.isArray(item) || item.some(p => !Array.isArray(p) || p.length < 2 || !p.every(Number.isFinite)))) throw new Error(`INVALID_COORDINATES: ${path}.${key}`);
        if (key === 'position' && (!Array.isArray(item) || item.length < 2 || !item.every(Number.isFinite))) throw new Error(`INVALID_COORDINATES: ${path}.${key}`);
        validateMeasurements(item, `${path}.${key}`);
      }
    }
    validateMeasurements(rawGeometry);
    const unitScaleToMm = (units === 'METRIC_M') ? 1000 : 1;

    const frozenGeometry = deepFreeze(JSON.parse(JSON.stringify(rawGeometry)));

    return {
      geometry: frozenGeometry,
      sourceGeometryHash,
      sourceSchemaVersion: schemaVersion,
      unitScaleToMm,
      assumptions: rawGeometry.units === undefined ? [{source:'assumed',field:'units',value:'METRIC_MM',reason:'Legacy compatibility only; IR requires explicit units.'}] : []
    };
  }
}
