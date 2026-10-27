#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs, validateDeploymentTargets, currentBranch, validateBranch } from './guards.mjs';
import { validateStatus } from '../src/logic.mjs';
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = resolve(args.repo || '.');
  const { previewHost } = validateDeploymentTargets(args.previewUrl, args.productionUrl);
  const branch = validateBranch(currentBranch(repo));
  const status = validateStatus(JSON.parse(await readFile(join(repo, 'public/mizan-preview/status.json'), 'utf8')));
  if (status.allowedHosts.length !== 1 || status.allowedHosts[0] !== previewHost) throw new Error('Preview hostname mismatch');
  if (process.env.MIZAN_PREVIEW_DEPLOY !== '1' || process.env.MIZAN_DEPLOY_TARGET !== 'staging') throw new Error('Explicit staging-only environment flags required');
  if (status.issues.every(i => i.state === 'resolved')) throw new Error('Preview issues must not all be silently marked resolved');
  console.log(JSON.stringify({ decision: 'STAGING_PREFLIGHT_PASS_ONLY', branch, previewHost, productionUntouched: 'not verifiable by this local script', status: 'NOT_RELEASE_APPROVED', issues: status.issues.length }, null, 2));
}
main().catch(err => { console.error('STAGING PREFLIGHT BLOCKED:', err.message); process.exitCode = 1; });
