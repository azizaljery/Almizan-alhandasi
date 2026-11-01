// Node-only boundary. The calculation and rendering modules do not import node:fs.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { exportArtifacts } from './exports.mjs';
export async function writeDeliverables(project, result, directory, { overwrite = false } = {}) {
  const root = resolve(directory), artifacts = await exportArtifacts(project, result);
  if (!overwrite) {
    for (const name of artifacts.keys()) {
      try { await access(resolve(root, name)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      throw new Error('OUTPUT_EXISTS: ' + name);
    }
  }
  await mkdir(root, { recursive: true });
  for (const [name, content] of artifacts) { const path = resolve(root, name); if (!path.startsWith(root + '/')) throw new Error('UNSAFE_OUTPUT_PATH'); await mkdir(dirname(path), { recursive: true }); await writeFile(path, content, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx' }); }
  return { directory: root, files: [...artifacts.keys()], inputHash: result.inputHash };
}
