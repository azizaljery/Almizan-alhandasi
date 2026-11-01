import { copy, canonical, hash, freeze, unique, fail, identifier, number, issue } from './core.mjs';
import { validateProject } from './model.mjs';
import { point, inRoom, routeLength } from './geometry.mjs';
import { electrical } from './disciplines/electrical.mjs';
import { hvac } from './disciplines/hvac.mjs';
import { plumbing } from './disciplines/plumbing.mjs';
import { fire, lowCurrent, solar } from './disciplines/networks.mjs';
import { coordinate } from './coordination.mjs';
import { quantities } from './quantities.mjs';
import { attachRisers } from './risers.mjs';
export const VERSION = '0.1.0';
export const BUILT_INS = Object.freeze([electrical, hvac, plumbing, fire, lowCurrent, solar]);
function validateDiscipline(result, id, project) {
  const r = copy(result); if (r.id !== id) fail('PLUGIN_ID_MISMATCH', id);
  for (const key of ['devices', 'routes', 'calculations', 'schedules', 'issues', 'limitations']) if (!Array.isArray(r[key])) fail('PLUGIN_OUTPUT_ARRAY_REQUIRED', id + '.' + key);
  const levelIds = new Set(project.architecture.levels.map(l => l.id));
  for (const d of r.devices) {
    identifier(d.id, 'device.id'); point(d.position, d.id, true);
    if (d.discipline !== id || !levelIds.has(d.levelId) || !/^[A-Z][A-Z0-9-]{0,31}$/.test(d.layer)) fail('PLUGIN_DEVICE_INVALID', d.id);
    if (d.roomId && !project.architecture.rooms.some(room => room.id === d.roomId && room.levelId === d.levelId && inRoom(d.position, room))) fail('DEVICE_OUTSIDE_ROOM', d.id);
  }
  for (const route of r.routes) {
    identifier(route.id, 'route.id'); if (route.discipline !== id || !levelIds.has(route.levelId) || !/^[A-Z][A-Z0-9-]{0,31}$/.test(route.layer)) fail('PLUGIN_ROUTE_INVALID', route.id);
    if (!['PROPOSED', 'BLOCKED'].includes(route.status) || !Array.isArray(route.points)) fail('PLUGIN_ROUTE_STATUS_INVALID', route.id);
    if (route.points.length > 2000 || route.status === 'PROPOSED' && route.points.length < 2) fail('PLUGIN_ROUTE_POINT_COUNT', route.id);
    route.points.forEach(p => point(p, route.id, true));
    for (const key of ['widthM', 'heightM']) number(route[key], route.id + '.' + key, { positive: true });
    number(route.clearanceM, route.id + '.clearanceM', { min: 0 });
    if (route.status === 'PROPOSED') route.lengthM = routeLength(route.points);
  }
  unique([...r.devices, ...r.routes, ...r.calculations, ...r.schedules], id + '.outputs');
  return { ...r, stage: 'PRELIMINARY', constructionApproved: false, codeCompliance: 'NOT_EVALUATED' };
}
export async function createEngineeringPackage(raw, options = {}) {
  // Snapshot before the first await: concurrent UI edits cannot rebind this run.
  const project = freeze(validateProject(raw));
  const inputHash = await hash(project), architectureHash = await hash(project.architecture);
  const registry = new Map(BUILT_INS.map(d => [d.id, d]));
  for (const plugin of options.plugins || []) {
    identifier(plugin.id, 'plugin.id'); if (registry.has(plugin.id) || typeof plugin.run !== 'function') fail('INVALID_OR_DUPLICATE_PLUGIN', plugin.id); registry.set(plugin.id, plugin);
  }
  const requested = options.disciplines || ['electrical', 'hvac', 'plumbing', 'fire', 'low_current'];
  if (!Array.isArray(requested) || !requested.length || new Set(requested).size !== requested.length) fail('DISCIPLINES_REQUIRED', 'options.disciplines');
  const results = [];
  for (const id of requested) {
    const plugin = registry.get(id); if (!plugin) fail('UNKNOWN_DISCIPLINE', id);
    const result = copy(await plugin.run(Object.freeze({ project, version: VERSION, inputHash })));
    results.push(result);
  }
  attachRisers(project, results);
  for (let i = 0; i < results.length; i++) results[i] = validateDiscipline(results[i], requested[i], project);
  unique(results.flatMap(r => [...r.devices, ...r.routes, ...r.calculations, ...r.schedules]), 'outputs');
  const devices = new Map(results.flatMap(d => d.devices).map(d => [d.id, d]));
  for (const route of results.flatMap(d => d.routes)) {
    const a = devices.get(route.fromId), b = devices.get(route.toId);
    if (!a || !b || a.discipline !== route.discipline || b.discipline !== route.discipline) fail('ROUTE_ENDPOINT_REFERENCE', route.id);
    if (route.status === 'PROPOSED') {
      const p = route.points[0], q = route.points.at(-1);
      if (Math.hypot(a.position.x - p.x, a.position.y - p.y) > 1e-6 || Math.hypot(b.position.x - q.x, b.position.y - q.y) > 1e-6) fail('ROUTE_ENDPOINT_POSITION', route.id);
    }
  }
  const coordination = coordinate(project, results), issues = [...results.flatMap(r => r.issues), ...coordination.issues];
  for (const level of project.architecture.levels) if (!project.architecture.rooms.some(r => r.levelId === level.id)) issues.push(issue('project', 'LEVEL_ARCHITECTURE_MISSING', 'لا توجد هندسة غرف موثقة لهذا الدور؛ لا يُفترض تكرار الأرضي.', { levelId: level.id }));
  issues.push(issue('project', 'CODE_RULES_NOT_VERIFIED', 'الحزمة لا تطبق جدول اشتراطات نظامية موثّقًا؛ مراجعة الكود والإصدار والبنود المنطبقة مطلوبة.'));
  const result = { schema: 'MIZAN-MEP-RESULT/1', version: VERSION, projectId: project.projectId, inputHash, architectureHash, source: copy(project.architecture.source), stage: 'PRELIMINARY', constructionApproved: false, codeCompliance: 'NOT_EVALUATED', status: issues.some(i => i.severity === 'error') ? 'BLOCKED_PRELIMINARY' : 'PRELIMINARY_REVIEW_REQUIRED', disciplines: results, coordination, quantities: quantities(results, project.rules.rates || {}), issues, ruleProvenance: copy(project.rules.provenance || []), omittedDisciplines: [...registry.keys()].filter(id => !requested.includes(id)) };
  canonical(result); result.resultHash = await hash(result); return freeze(result);
}
export async function verifyBinding(result, raw) { return result.inputHash === await hash(validateProject(raw)); }
export async function verifyResult(raw) { const result = copy(raw), expected = result.resultHash; delete result.resultHash; return result.schema === 'MIZAN-MEP-RESULT/1' && result.constructionApproved === false && result.codeCompliance === 'NOT_EVALUATED' && expected === await hash(result); }
export function comparePackages(before, after) {
  const flat = p => new Map(p.disciplines.flatMap(d => [...d.devices, ...d.routes]).map(x => [x.id, x]));
  const a = flat(before), b = flat(after);
  return { architectureChanged: before.architectureHash !== after.architectureHash, added: [...b.keys()].filter(id => !a.has(id)), removed: [...a.keys()].filter(id => !b.has(id)), changed: [...b.keys()].filter(id => a.has(id) && canonical(a.get(id)) !== canonical(b.get(id))) };
}
