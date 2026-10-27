import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertSiteDirOutsideRepo } from '../scripts/site-install.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const preview = 'https://preview.example.org', prod = 'https://production.example.org';
const run = (args, cwd) => spawnSync(process.execPath, [join(root, 'scripts', 'site-install.mjs'), ...args], { cwd, encoding: 'utf8' });
async function repo(branch = 'dev/preview-kit') {
  const dir = await mkdtemp(join(tmpdir(), 'mizan-repo-'));
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'T']); execFileSync('git', ['-C', dir, 'config', 'user.email', 't@example.org']);
  await mkdir(join(dir, 'dist/client'), { recursive: true });
  await writeFile(join(dir, 'dist/client/home.html'), '<html><head></head><body></body></html>');
  execFileSync('git', ['-C', dir, 'add', '.']); execFileSync('git', ['-C', dir, 'commit', '-qm', 'b']);
  execFileSync('git', ['-C', dir, 'checkout', '-qb', branch]);
  return dir;
}
async function site() {
  const dir = await mkdtemp(join(tmpdir(), 'mizan-site-'));
  await writeFile(join(dir, 'home.html'), '<!doctype html><html><head><title>x</title></head><body>h</body></html>');
  await writeFile(join(dir, 'studio.html'), '<html><head></head><body>s</body></html>');
  await writeFile(join(dir, 'nohead.html'), '<p>no head</p>');
  return dir;
}
test('refuses a site directory inside the repository (dist/client)', async () => {
  const d = await repo(); const r = run(['--repo', d, '--site-dir', join(d, 'dist/client'), '--preview-url', preview, '--production-url', prod, '--apply'], d);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /outside the repository/);
  assert.doesNotMatch(await readFile(join(d, 'dist/client/home.html'), 'utf8'), /mizan-preview/);
});
test('refuses the repository itself and any parent of it', async () => {
  const d = await repo(); assert.throws(() => assertSiteDirOutsideRepo(d, d), /outside/); assert.throws(() => assertSiteDirOutsideRepo(resolve(d, '..'), d), /outside/);
});
test('refuses protected branches', async () => {
  for (const b of ['main', 'deploy']) { const d = await repo(b); const s = await site(); const r = run(['--repo', d, '--site-dir', s, '--preview-url', preview, '--production-url', prod, '--apply'], d); assert.notEqual(r.status, 0, b); }
});
test('dry-run changes nothing', async () => {
  const d = await repo(), s = await site(); const before = await readFile(join(s, 'home.html'), 'utf8');
  const r = run(['--repo', d, '--site-dir', s, '--preview-url', preview, '--production-url', prod], d); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).mode, 'dry-run'); assert.equal(await readFile(join(s, 'home.html'), 'utf8'), before);
});
test('apply injects relative tags into every page (at the top when there is no head), writes status, is idempotent', async () => {
  const d = await repo(), s = await site(); const args = ['--repo', d, '--site-dir', s, '--preview-url', preview, '--production-url', prod, '--apply'];
  assert.equal(run(args, d).status, 0); const once = await readFile(join(s, 'home.html'), 'utf8');
  for (const p of ['home.html', 'studio.html']) assert.match(await readFile(join(s, p), 'utf8'), /\.\/mizan-preview\/preview\.js/);
  assert.match(await readFile(join(s, 'nohead.html'), 'utf8'), /^<link rel="stylesheet" href="\.\/mizan-preview\/preview\.css"/); // صفحة بلا <head>: يُحقن في أولها
  const st = JSON.parse(await readFile(join(s, 'mizan-preview/status.json'), 'utf8'));
  assert.deepEqual(st.allowedHosts, ['preview.example.org']); assert.equal(st.releaseApproved, false); assert.equal(st.independentTests.state, 'pending');
  assert.ok(st.issues.some(i => i.id === 'H3' && i.state === 'open')); assert.ok(st.issues.some(i => /لم تُتحقق بعد/.test(i.title)));
  assert.equal(run(args, d).status, 0); assert.equal(await readFile(join(s, 'home.html'), 'utf8'), once);
});
test('reinstall keeps a human-updated issue list but never widens hosts', async () => {
  const d = await repo(), s = await site(); const args = ['--repo', d, '--site-dir', s, '--preview-url', preview, '--production-url', prod, '--apply'];
  run(args, d); const f = join(s, 'mizan-preview/status.json'); const st = JSON.parse(await readFile(f, 'utf8')); st.issues[0].state = 'unverified'; await writeFile(f, JSON.stringify(st));
  run(['--repo', d, '--site-dir', s, '--preview-url', 'https://other.example.org', '--production-url', prod, '--apply'], d);
  const after = JSON.parse(await readFile(f, 'utf8')); assert.equal(after.issues[0].state, 'unverified'); assert.deepEqual(after.allowedHosts, ['other.example.org']);
});
test('status template never claims release approval or a fabricated independent pass', async () => {
  const t = JSON.parse(await readFile(join(root, 'src/status.mizan.json'), 'utf8'));
  assert.equal(t.releaseApproved, false); assert.notEqual(t.independentTests.state, 'passed'); assert.ok(t.issues.every(i => i.state !== 'resolved'));
});
test('preview.js fetches status relative to itself (works under any root)', async () => {
  const js = await readFile(join(root, 'src/preview.js'), 'utf8'); assert.match(js, /new URL\('status\.json', import\.meta\.url\)/); assert.doesNotMatch(js, /fetch\('\/mizan-preview/);
});
