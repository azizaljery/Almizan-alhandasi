#!/usr/bin/env node
import { readFile, mkdir, writeFile, copyFile, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateDeploymentTargets, currentBranch, validateBranch, getCommit } from './guards.mjs';
import { validateStatus } from '../src/logic.mjs';
const here = dirname(fileURLToPath(import.meta.url));
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = resolve(args.repo || '.');
  const { previewHost } = validateDeploymentTargets(args.previewUrl, args.productionUrl);
  const branch = validateBranch(currentBranch(repo));
  const commit = getCommit(repo);
  const indexFile = join(repo, 'index.html');
  await access(indexFile).catch(() => { throw new Error('Root index.html not found. Use the manual integration instructions for this framework.'); });
  const html = await readFile(indexFile, 'utf8');
  const script = '<link rel="stylesheet" href="/mizan-preview/preview.css" />\n    <script type="module" src="/mizan-preview/preview.js"></script>';
  if (!html.includes('</head>')) throw new Error('index.html lacks </head>');
  const updated = html.includes('/mizan-preview/preview.js') ? html : html.replace('</head>', `    ${script}\n  </head>`);
  const status = JSON.parse(await readFile(resolve(here, '../src/status.template.json'), 'utf8'));
  status.allowedHosts = [previewHost];
  status.sourceBaseCommit = commit;
  delete status.sourceCommit;
  validateStatus(status);
  const dest = join(repo, 'public', 'mizan-preview');
  const changed = updated !== html;
  console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', branch, commit, repo, previewHost, indexWillChange: changed, files: ['public/mizan-preview/preview.js', 'public/mizan-preview/preview.css', 'public/mizan-preview/logic.mjs', 'public/mizan-preview/status.json'] }, null, 2));
  if (!args.apply) return;
  await mkdir(dest, { recursive: true });
  for (const name of ['preview.js', 'preview.css', 'logic.mjs']) await copyFile(resolve(here, '../src', name), join(dest, name));
  const statusFile = join(dest, 'status.json');
  // Preserve a human-updated status on reinstallation, but never widen host access.
  let previous;
  try { previous = JSON.parse(await readFile(statusFile, 'utf8')); } catch {}
  if (previous) {
    validateStatus(previous);
    status.issues = previous.issues;
    status.independentTests = previous.independentTests;
  }
  await writeFile(statusFile, JSON.stringify(status, null, 2) + '\n');
  if (changed) await writeFile(indexFile, updated);
  console.log('Preview integration files installed locally. Nothing was deployed or merged.');
}
main().catch(err => { console.error('REFUSED:', err.message); process.exitCode = 1; });
