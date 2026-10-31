// (تصحيح 2026-10-31، قرار المالك ثالثًا) source-check يفحص العقود الفعلية: ينجح على المصدر الصحيح، ويفشل عمدًا حين يُكسر عقد حقيقي.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, '../..');
const run = (root, args = [], env = {}) => spawnSync(process.execPath, [join(root, 'scripts/release-kit/source-check.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, R14_OFF: '', ...env } });
const copy = () => { const d = mkdtempSync(join(tmpdir(), 'mizan-srccheck-'));
  for (const p of ['dist', 'scripts/release-kit', 'scripts/build.mjs', 'scripts/e2e-sharaa-v2.mjs', 'package.json', 'wrangler.staging.toml', '.github/workflows/deploy-staging.yml', 'tests/requirements-direct-door.test.mjs', 'tests/direct-door-engine.test.mjs']) { mkdirSync(dirname(join(d, p)), { recursive: true }); cpSync(join(repo, p), join(d, p), { recursive: true, filter: s => !s.includes('dist/client') && !s.includes('dist/server') }); }
  return d; };
test('passes on the real combined source (--combined and --r21)', () => { for (const a of [['--combined'], ['--r21']]) { const r = run(repo, a); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /SOURCE_CHECK_PASS/); } });
test('fails when the owner switch disables the direct door (R14_OFF=r21directdoor)', () => { const r = run(repo, ['--combined'], { R14_OFF: 'r21directdoor' }); assert.equal(r.status, 1); assert.match(r.stderr, /direct door/); });
test('fails when the shower gate contract is broken (showerGate no longer used by presentation-status)', () => {
  const d = copy(), f = join(d, 'dist/presentation-status.mjs'); writeFileSync(f, readFileSync(f, 'utf8').replace(/showerGate/g, 'showerGateX'));
  const r = run(d, ['--r21']); assert.equal(r.status, 1); assert.match(r.stderr, /shower gate/);
});
test('fails when Sharaa stops being wired into home.mjs', () => {
  const d = copy(), f = join(d, 'dist/home.mjs'); writeFileSync(f, readFileSync(f, 'utf8').replace("from './sharaa/flow.mjs'", "from './sharaa/flow-old.mjs'"));
  const r = run(d, ['--combined']); assert.equal(r.status, 1); assert.match(r.stderr, /SharaFlow/);
});
test('fails when the staging workflow is not restricted to staging-preview', () => {
  const d = copy(), f = join(d, '.github/workflows/deploy-staging.yml'); writeFileSync(f, readFileSync(f, 'utf8').replace('branches: [staging-preview]', 'branches: [staging-preview, main]'));
  const r = run(d, ['--r21']); assert.equal(r.status, 1); assert.match(r.stderr, /staging branch only/);
});
