import { checkBrowserImports } from './check-browser-imports.mjs';
// Compile the separate Sites archive Worker and verify the authored public assets.
import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const manifest = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
assert.equal(manifest.static, undefined, 'Archive API requires a Worker deployment, not a static-only Site');
assert.equal(manifest.d1, 'DB');
assert.ok(readdirSync('drizzle').some(file => file.endsWith('.sql')), 'D1 schema migration must ship with the source');
const html = readFileSync('dist/index.html', 'utf8');
assert.ok(html.includes('<html lang="ar" dir="rtl">'));
for (const [, name] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) assert.ok(existsSync('dist/' + name), name);
const files = readdirSync('dist');
for (const file of readdirSync('vendor/claude-planner/src')) {
  assert.deepEqual(readFileSync('dist/claude/' + file), readFileSync('vendor/claude-planner/src/' + file), 'Claude source drift: ' + file);
  execFileSync(process.execPath, ['--check', 'dist/claude/' + file]);
}
for (const file of files.filter(name => /\.(mjs|js)$/.test(name))) {
  execFileSync(process.execPath, ['--check', 'dist/' + file]);
  const source = readFileSync('dist/' + file, 'utf8');
  for (const [, name] of source.matchAll(/(?:from\s*|new URL\()'\.\/([^']+)'/g)) assert.ok(existsSync('dist/' + name), file + ' -> ' + name);
  assert.ok(!/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(source), 'Secret-like value in public asset');
}
const assistant = readFileSync('dist/assistant.mjs', 'utf8');
assert.match(assistant, /export const AI_ENABLED = true/);
assert.match(assistant, /X-Mizan-Access-Code/);
assert.ok(!assistant.includes('OPENAI_API_KEY') && !assistant.includes('ANTHROPIC_API_KEY'), 'Provider key must never be referenced by the browser client');
// Keep authored assets in dist/ while packaging only public files in dist/client.
// Server code and deployment metadata must never be served as browser assets.
if (existsSync('dist/client')) rmSync('dist/client', { recursive: true, force: true });
mkdirSync('dist/client', { recursive: true });
for (const entry of readdirSync('dist', { withFileTypes: true })) {
  if (['client', 'server', '.openai'].includes(entry.name) || entry.name.startsWith('.')) continue;
  cpSync(`dist/${entry.name}`, `dist/client/${entry.name}`, { recursive: true });
}
if (existsSync('dist/server')) rmSync('dist/server', { recursive: true, force: true });
mkdirSync('dist/server', { recursive: true });
await build({
  entryPoints: ['worker/site-archive.mjs'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: false,
  minify: false,
});
execFileSync(process.execPath, ['--check', 'dist/server/index.js']);
const server = readFileSync('dist/server/index.js', 'utf8');
assert.ok(!/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(server), 'Secret-like value in archive Worker');
assert.ok(server.includes('oai-authenticated-user-id'), 'Archive Worker must use the Sites forwarded stable user ID');
assert.ok(!server.includes('identity_contract_unverified'), 'Archive Worker must not retain a local-only identity gate after official Sites auth wiring');
console.log('Arabic app, browser imports, D1 migration and separately bundled archive Worker verified.');

console.log(`Browser import graph verified: ${checkBrowserImports()} modules.`);
