#!/usr/bin/env node
// build.mjs -- Standalone Planner package build. No dependency on the site's old dist/.
// Order: typecheck -> tests -> copy src to dist -> write index + MANIFEST -> verify.
// Any failed step exits non-zero. Nothing in src/ is modified.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const FILES = ['planner.mjs', 'estimates.mjs', 'PlannerOutputContract.mjs', 'migrations.mjs', 'compat-layer.mjs'];
/** @param {string} p */
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** @param {string} name @param {string} cmd @param {string[]} args */
function step(name, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  const code = r.status ?? 1;
  console.log(`[build] ${name}: exit ${code}`);
  if (code !== 0) process.exit(code);
}

// 1. Typecheck
step('typecheck', 'npm', ['run', '-s', 'planner:typecheck']);

// 2. Tests
const tests = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => join('tests', f));
step('tests', process.execPath, ['--test', ...tests]);

// 3. dist: exact copies of src
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const f of FILES) copyFileSync(join(SRC, f), join(DIST, f));

const index = `// Planner ${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version} -- generated package entry point.
export * from './planner.mjs';
export { quantityRows, estimate } from './estimates.mjs';
export { migrateModel, importModel } from './migrations.mjs';
export { generateAlternatives, generateModelLegacy, STRATEGIES, CONCEPT_PROFILES } from './compat-layer.mjs';
`;
writeFileSync(join(DIST, 'index.mjs'), index);

// 4. Verify: dist copies are byte-identical to src
for (const f of FILES) {
  if (sha(join(SRC, f)) !== sha(join(DIST, f))) {
    console.error(`[build] verify: dist/${f} differs from src/${f}`);
    process.exit(1);
  }
}

// 5. Verify: the entry point actually imports and exposes the public API
const api = await import(pathToFileURL(join(DIST, 'index.mjs')).href);
const required = ['generateModel', 'plan', 'quantities', 'validateModel', 'quantityRows', 'estimate', 'TYPES', 'SHAPES', 'GEOMETRY', 'ROOF_POLICIES', 'ROOF_POLICY_SUPPORT', 'MIN_WING_WIDTH', 'normalizeShapeKey', 'footprintDiagnostics', 'migrateModel', 'importModel', 'generateAlternatives', 'generateModelLegacy'];
const missing = required.filter((k) => !(k in api));
if (missing.length) {
  console.error('[build] verify: entry point missing exports: ' + missing.join(', '));
  process.exit(1);
}
console.log('[build] entry point import: OK (' + required.length + ' required exports present)');

// 6. Manifest
const manifest = {
  name: 'planner-pkg',
  version: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version,
  node: process.version,
  files: Object.fromEntries([...FILES, 'index.mjs'].map((f) => [f, sha(join(DIST, f))])),
};
writeFileSync(join(DIST, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('[build] BUILD PASS');
