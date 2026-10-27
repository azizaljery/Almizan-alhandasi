import { execFileSync } from 'node:child_process';
import { URL } from 'node:url';
export function parseArgs(argv) {
  const result = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') { result.apply = true; continue; }
    if (['--repo', '--preview-url', '--production-url'].includes(a) && argv[i+1]) { result[a.slice(2).replace(/-([a-z])/g, (_,c)=>c.toUpperCase())] = argv[++i]; continue; }
    throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  return result;
}
export function validateDeploymentTargets(previewUrl, productionUrl) {
  if (!previewUrl || !productionUrl) throw new Error('Both --preview-url and --production-url are required');
  const p = new URL(previewUrl); const live = new URL(productionUrl);
  if (p.protocol !== 'https:' || live.protocol !== 'https:') throw new Error('Both URLs must use HTTPS');
  if (p.origin === live.origin || p.hostname === live.hostname) throw new Error('Preview and production must have distinct hostnames');
  if (!p.hostname || !live.hostname || p.username || p.password || live.username || live.password) throw new Error('Invalid deployment URL');
  return { previewHost: p.hostname, productionHost: live.hostname };
}
export function currentBranch(repo) {
  try { return execFileSync('git', ['-C', repo, 'branch', '--show-current'], { encoding: 'utf8' }).trim(); }
  catch { throw new Error('A Git checkout is required for safe integration'); }
}
export function validateBranch(branch) {
  if (!branch || /^(main|master|deploy|production|release)(\/|$)/i.test(branch)) throw new Error(`Protected or detached branch: ${branch}`);
  return branch;
}
export function getCommit(repo) {
  try { return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { throw new Error('Cannot read HEAD commit'); }
}
