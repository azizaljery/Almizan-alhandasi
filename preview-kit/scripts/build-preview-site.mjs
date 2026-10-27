#!/usr/bin/env node
// يبني «مجلد موقع المعاينة» خارج المستودع من dist المصدري (ما يُنسخ عادةً إلى dist/client)، دون لمس dist نفسه.
// يستبعد: client/server/الملفات المخفية، وخرائط المصدر والمصادر غير المتصفحية (.map .ts .py .md)، وindex.html (الدخول من launcher.html).
// ويكتب launcher.html من القالب بالإيداع والفرع الفعليين. لا ينشر ولا يدمج.
import { readdir, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentBranch, getCommit } from './guards.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(['client', 'server']), SKIP_EXT = new Set(['.map', '.ts', '.py', '.md']);

export function parseBuildArgs(argv) {
  const out = { force: false }, keys = { '--repo': 'repo', '--out': 'out' };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '--force') { out.force = true; continue; } if (keys[a] && argv[i + 1]) { out[keys[a]] = argv[++i]; continue; } throw new Error(`Unknown or incomplete argument: ${a}`); }
  return out;
}
async function walk(dir, base = dir) { const res = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) res.push(...await walk(p, base)); else res.push(p); } return res; }

export async function buildSite({ repo, out, force }) {
  repo = resolve(repo || '.'); if (!out) throw new Error('--out is required');
  out = resolve(out);
  const r = realpathSync(repo); const parent = realpathSync(dirname(out));
  if ((parent + sep).startsWith(r + sep) || out === r) throw new Error('Refusing: --out must be outside the repository');
  if (existsSync(out) && !force) throw new Error('Output exists; pass --force to rebuild it');
  const src = join(repo, 'dist'); if (!existsSync(join(src, 'home.html'))) throw new Error('dist/home.html not found (run from a full checkout)');
  const branch = currentBranch(repo), commit = getCommit(repo);
  if (existsSync(out)) await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const e of await readdir(src, { withFileTypes: true })) {
    if (e.name.startsWith('.') || (e.isDirectory() && SKIP_DIRS.has(e.name)) || e.name === 'index.html') continue;
    await cp(join(src, e.name), join(out, e.name), { recursive: true });
  }
  for (const f of await walk(out)) if (SKIP_EXT.has(extname(f))) await rm(f);
  const tpl = await readFile(resolve(here, '../src/launcher.template.html'), 'utf8');
  await writeFile(join(out, 'launcher.html'), tpl.replaceAll('{{COMMIT}}', commit.slice(0, 7)).replaceAll('{{BRANCH}}', branch));
  await writeFile(join(out, 'version.json'), JSON.stringify({ commit, branch, builtAt: new Date().toISOString(), preview: true }, null, 2) + '\n');
  return { out, commit, branch, files: (await walk(out)).length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildSite(parseBuildArgs(process.argv.slice(2))).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error('REFUSED:', e.message); process.exitCode = 1; });
