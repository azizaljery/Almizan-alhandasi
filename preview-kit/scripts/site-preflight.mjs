#!/usr/bin/env node
// فحص ما قبل نشر المعاينة لمجلد موقع منفصل. يمرّر أو يحجب فقط؛ لا ينشر ولا يغيّر شيئًا.
// بديل الميزان لـpreflight.mjs الأصلي (الذي يقرأ public/mizan-preview/status.json داخل المستودع).
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeploymentTargets, currentBranch, validateBranch } from './guards.mjs';
import { validateStatus } from '../src/logic.mjs';
import { parseSiteArgs, assertSiteDirOutsideRepo } from './site-install.mjs';

// أسماء/أنماط يجب ألا تكون في موقع المعاينة: العينات المختومة وبذرة التقييم والأسرار.
const FORBIDDEN_NAME = /(?:heldout3|coverage-r21|SAMPLE\.json|eval-seed|\.env(?:\.|$)|\.dev\.vars|\.git(?:\/|$))/i;
const SECRET_LIKE = /sk-(?:proj-)?[a-zA-Z0-9_-]{20,}|X-Mizan-Access-Code:\s*\S{4,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
async function walk(dir) { const res = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) res.push(...await walk(p)); else res.push(p); } return res; }

export async function preflight(args, env = process.env) {
  const repo = resolve(args.repo || '.');
  const { previewHost } = validateDeploymentTargets(args.previewUrl, args.productionUrl);
  const branch = validateBranch(currentBranch(repo));
  const site = assertSiteDirOutsideRepo(args.siteDir && resolve(args.siteDir), repo);
  const status = validateStatus(JSON.parse(await readFile(join(site, 'mizan-preview/status.json'), 'utf8')));
  if (status.allowedHosts.length !== 1 || status.allowedHosts[0] !== previewHost) throw new Error('Preview hostname mismatch');
  if (status.issues.every(i => i.state === 'resolved')) throw new Error('Preview issues must not all be silently marked resolved');
  if (env.MIZAN_PREVIEW_DEPLOY !== '1' || env.MIZAN_DEPLOY_TARGET !== 'staging') throw new Error('Explicit staging-only environment flags required');
  const files = await walk(site); const problems = [];
  for (const f of files) {
    const rel = relative(site, f);
    if (FORBIDDEN_NAME.test(rel)) problems.push(`forbidden file: ${rel}`);
    else if (/\.(mjs|js|json|html|css|txt)$/.test(f)) { const t = await readFile(f, 'utf8'); if (SECRET_LIKE.test(t)) problems.push(`secret-like value: ${rel}`); }
  }
  const pages = files.filter(f => /^[^/]+\.html$/.test(relative(site, f)));
  for (const p of pages) { const t = await readFile(p, 'utf8'); if (!t.includes('/mizan-preview/preview.js')) problems.push(`banner not installed: ${relative(site, p)}`); }
  if (problems.length) throw new Error('Preview site problems: ' + problems.join('; '));
  return { decision: 'STAGING_PREFLIGHT_PASS_ONLY', branch, previewHost, pages: pages.length, files: files.length, productionUntouched: 'not verifiable by this local script', status: 'NOT_RELEASE_APPROVED', issues: status.issues.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) preflight(parseSiteArgs(process.argv.slice(2))).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error('STAGING PREFLIGHT BLOCKED:', e.message); process.exitCode = 1; });
