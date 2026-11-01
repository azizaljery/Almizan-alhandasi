import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
async function files(dir) { const out = []; for (const f of await readdir(dir, { withFileTypes: true })) { const p = resolve(dir, f.name); if (f.isDirectory() && !['demo-output', 'node_modules'].includes(f.name)) out.push(...await files(p)); else if (f.name.endsWith('.mjs')) out.push(p); } return out; }
const paths = await files('.');
for (const path of paths) { const p = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' }); if (p.status !== 0) { process.stderr.write(p.stderr); process.exit(1); } }
console.log(JSON.stringify({ syntaxFiles: paths.length, status: 'PASS' }));
