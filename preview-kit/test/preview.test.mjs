import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateStatus, isAllowedHost, issueCounts } from '../src/logic.mjs';
import { validateDeploymentTargets, validateBranch } from '../scripts/guards.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const preview = 'https://staging.example.org';
const prod = 'https://production.example.org';
function run(script, args, cwd, env) { return spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } }); }
async function repo(branch='preview/isolated') {
  const dir = await mkdtemp(join(tmpdir(), 'mizan-preview-'));
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.org']);
  await writeFile(join(dir, 'index.html'), '<html><head><title>Mizan</title></head><body><div id="root"></div></body></html>');
  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'baseline']);
  execFileSync('git', ['-C', dir, 'checkout', '-qb', branch]);
  return dir;
}
test('rejects same host even if path differs', () => assert.throws(() => validateDeploymentTargets('https://production.example.org/preview', prod), /distinct/));
test('requires HTTPS', () => assert.throws(() => validateDeploymentTargets('http://staging.example.org', prod), /HTTPS/));
test('accepts isolated HTTPS host', () => assert.equal(validateDeploymentTargets(preview, prod).previewHost, 'staging.example.org'));
test('rejects production branches', () => { for (const b of ['main', 'master', 'deploy', 'production', 'release/v1', '']) assert.throws(() => validateBranch(b)); });
test('accepts isolated branch', () => assert.equal(validateBranch('preview/isolated'), 'preview/isolated'));
test('requires unresolved preview status', () => assert.throws(() => validateStatus({ preview: true, releaseApproved: true, allowedHosts:['staging.example.org'], issues: [{id:'H3', title:'H3', state:'open'}] })));
test('prevents fabricated independent pass', () => assert.throws(() => validateStatus({ preview:true, releaseApproved:false, allowedHosts:['staging.example.org'], issues:[{id:'H3', title:'H3', state:'open'}], independentTests:{state:'passed',exitCode:null,evidence:null} })));
test('host matches exact only', () => assert.equal(isAllowedHost({allowedHosts:['staging.example.org']}, 'evil.staging.example.org'), false));
test('counts issue states', () => assert.deepEqual(issueCounts({issues:[{state:'open'},{state:'open'},{state:'pending'}]}), {open:2,pending:1}));
test('dry-run does not change repo', async () => { const d=await repo(); const r=run('install.mjs',['--repo',d,'--preview-url',preview,'--production-url',prod],d); assert.equal(r.status,0,r.stderr); assert.equal((await readFile(join(d,'index.html'),'utf8')).includes('mizan-preview'),false); });
test('apply installs banner, status and is idempotent', async () => { const d=await repo(); const args=['--repo',d,'--preview-url',preview,'--production-url',prod,'--apply']; const r=run('install.mjs',args,d); assert.equal(r.status,0,r.stderr); assert.equal(run('install.mjs',args,d).status,0); const html=await readFile(join(d,'index.html'),'utf8'); assert.equal((html.match(/mizan-preview\/preview.js/g)||[]).length,1); const status=validateStatus(JSON.parse(await readFile(join(d,'public/mizan-preview/status.json'),'utf8'))); assert.deepEqual(status.allowedHosts,['staging.example.org']); assert.equal(status.issues.length,6); });
test('refuses applying on main', async () => { const d=await repo('main'); const r=run('install.mjs',['--repo',d,'--preview-url',preview,'--production-url',prod,'--apply'],d); assert.notEqual(r.status,0); });
test('preflight blocks without staging flags', async () => { const d=await repo(); run('install.mjs',['--repo',d,'--preview-url',preview,'--production-url',prod,'--apply'],d); const r=run('preflight.mjs',['--repo',d,'--preview-url',preview,'--production-url',prod],d); assert.notEqual(r.status,0); });
test('preflight permits staging only with flags', async () => { const d=await repo(); run('install.mjs',['--repo',d,'--preview-url',preview,'--production-url',prod,'--apply'],d); const r=run('preflight.mjs',['--repo',d,'--preview-url',preview,'--production-url',prod],d,{MIZAN_PREVIEW_DEPLOY:'1',MIZAN_DEPLOY_TARGET:'staging'}); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/STAGING_PREFLIGHT_PASS_ONLY/); });
