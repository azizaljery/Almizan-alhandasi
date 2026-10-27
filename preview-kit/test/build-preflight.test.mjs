import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build-preview-site.mjs';
import { preflight } from '../scripts/site-preflight.mjs';
import { applyInstall, planInstall } from '../scripts/site-install.mjs';
const kit = resolve(fileURLToPath(new URL('..', import.meta.url))), repoRoot = resolve(kit, '..');
const preview = 'https://preview.example.org', prod = 'https://production.example.org';
const ENV_OK = { MIZAN_PREVIEW_DEPLOY: '1', MIZAN_DEPLOY_TARGET: 'staging' };
async function tmpRepo(branch = 'dev/preview-kit') {
  const d = await mkdtemp(join(tmpdir(), 'mizan-r-')); execFileSync('git', ['init', '-q', d]);
  execFileSync('git', ['-C', d, 'config', 'user.name', 'T']); execFileSync('git', ['-C', d, 'config', 'user.email', 't@e.org']);
  await mkdir(join(d, 'dist'), { recursive: true }); await writeFile(join(d, 'dist/home.html'), '<html><head></head><body>h</body></html>');
  await writeFile(join(d, 'dist/index.html'), '<html><head></head><body>i</body></html>'); await writeFile(join(d, 'dist/app.mjs.map'), '{}'); await writeFile(join(d, 'dist/NOTES.md'), 'x'); await writeFile(join(d, 'dist/app.mjs'), 'export {}');
  await mkdir(join(d, 'dist/client'), { recursive: true }); await writeFile(join(d, 'dist/client/old.html'), 'old'); await mkdir(join(d, 'dist/server'), { recursive: true }); await writeFile(join(d, 'dist/server/index.js'), 's');
  execFileSync('git', ['-C', d, 'add', '.']); execFileSync('git', ['-C', d, 'commit', '-qm', 'b']); execFileSync('git', ['-C', d, 'checkout', '-qb', branch]); return d;
}
async function builtSite(d) { const out = join(await mkdtemp(join(tmpdir(), 'mizan-o-')), 'site'); await buildSite({ repo: d, out }); await applyInstall(await planInstall({ repo: d, siteDir: out, previewUrl: preview, productionUrl: prod })); return out; }
test('build excludes client/server/index/.map/.md, writes launcher with the real commit, and never touches dist', async () => {
  const d = await tmpRepo(); const out = join(await mkdtemp(join(tmpdir(), 'mizan-o-')), 'site'); const r = await buildSite({ repo: d, out });
  const names = await readdir(out); assert.ok(names.includes('home.html') && names.includes('app.mjs') && names.includes('launcher.html') && names.includes('version.json'));
  for (const x of ['index.html', 'app.mjs.map', 'NOTES.md', 'client', 'server']) assert.ok(!names.includes(x), x);
  const commit = execFileSync('git', ['-C', d, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.match(await readFile(join(out, 'launcher.html'), 'utf8'), new RegExp(commit.slice(0, 7))); assert.equal(r.commit, commit);
  assert.ok(existsSync(join(d, 'dist/index.html')) && existsSync(join(d, 'dist/client/old.html')));
});
test('build refuses an output inside the repository', async () => { const d = await tmpRepo(); await assert.rejects(buildSite({ repo: d, out: join(d, 'dist/client') }), /outside the repository/); });
test('build refuses to overwrite without --force', async () => { const d = await tmpRepo(); const out = join(await mkdtemp(join(tmpdir(), 'mizan-o-')), 's'); await buildSite({ repo: d, out }); await assert.rejects(buildSite({ repo: d, out }), /--force/); await buildSite({ repo: d, out, force: true }); });
test('build works on the real repository when dist is present', { skip: !existsSync(join(repoRoot, 'dist/home.html')) }, async () => {
  const out = join(await mkdtemp(join(tmpdir(), 'mizan-o-')), 'site'); const r = await buildSite({ repo: repoRoot, out });
  assert.ok(existsSync(join(out, 'home.html')) && existsSync(join(out, 'launcher.html'))); assert.ok(r.files > 50);
});
test('preflight passes only with staging flags, an installed banner and a clean site', async () => {
  const d = await tmpRepo(), s = await builtSite(d); const a = { repo: d, siteDir: s, previewUrl: preview, productionUrl: prod };
  const ok = await preflight(a, ENV_OK); assert.equal(ok.decision, 'STAGING_PREFLIGHT_PASS_ONLY'); assert.equal(ok.status, 'NOT_RELEASE_APPROVED');
  await assert.rejects(preflight(a, {}), /staging-only/);
});
test('preflight blocks a host mismatch, protected branches and a site inside the repo', async () => {
  const d = await tmpRepo(), s = await builtSite(d);
  await assert.rejects(preflight({ repo: d, siteDir: s, previewUrl: 'https://another.example.org', productionUrl: prod }, ENV_OK), /hostname mismatch/);
  const m = await tmpRepo('main'); await assert.rejects(preflight({ repo: m, siteDir: s, previewUrl: preview, productionUrl: prod }, ENV_OK), /Protected/);
  await assert.rejects(preflight({ repo: d, siteDir: join(d, 'dist'), previewUrl: preview, productionUrl: prod }, ENV_OK), /outside the repository/);
});
test('preflight blocks sealed-set files, env files, secret-like values and a missing banner', async () => {
  for (const [name, body, re] of [['heldout3-cases.mjs', 'x', /forbidden file/], ['SAMPLE.json', '{}', /forbidden file/], ['.env', 'A=1', /forbidden file/], ['leak.js', 'const k="sk-proj-' + 'a'.repeat(30) + '"', /secret-like/]]) {
    const d = await tmpRepo(), s = await builtSite(d); await writeFile(join(s, name), body);
    await assert.rejects(preflight({ repo: d, siteDir: s, previewUrl: preview, productionUrl: prod }, ENV_OK), re, name);
  }
  const d = await tmpRepo(), s = await builtSite(d); await writeFile(join(s, 'extra.html'), '<html><head></head><body>no banner</body></html>');
  await assert.rejects(preflight({ repo: d, siteDir: s, previewUrl: preview, productionUrl: prod }, ENV_OK), /banner not installed/);
});
