import { createEngineeringPackage, verifyBinding } from './engine.mjs';
import { validateProject } from './model.mjs';
import { hash, fail } from './core.mjs';
import { toSvg, toDxf } from './exports.mjs';
/** Provider-neutral actions for the existing agent. No model calls, secrets, network or publication. */
export function createAgentActions({ getProject, plugins = [] }) {
  if (typeof getProject !== 'function') fail('PROJECT_READER_REQUIRED', 'getProject');
  const current = async expected => {
    const p = validateProject(await getProject());
    if (!expected || await hash(p.architecture) !== expected) fail('ARCHITECTURE_REVISION_CONFLICT', 'expectedArchitectureHash');
    return p;
  };
  return Object.freeze({
    async snapshot() { const p = validateProject(await getProject()); return { projectId: p.projectId, architectureHash: await hash(p.architecture), source: p.architecture.source }; },
    async generate({ expectedArchitectureHash, disciplines }) { const p = await current(expectedArchitectureHash); return createEngineeringPackage(p, { disciplines, plugins }); },
    async render({ expectedArchitectureHash, result, format, levelId, discipline }) {
      const p = await current(expectedArchitectureHash);
      if (!await verifyBinding(result, p)) fail('STALE_RESULT', 'result');
      if (!['svg', 'dxf'].includes(format)) fail('FORMAT_UNSUPPORTED', 'format');
      return format === 'svg' ? toSvg(p, result, { levelId, discipline }) : toDxf(p, result, { levelId, discipline });
    }
  });
}
