// Buildless static release: validate the authored output; do not emit or deploy a server.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const manifest = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
assert.equal(manifest.static.directory, 'dist');
const html = readFileSync('dist/index.html', 'utf8');
assert.ok(html.includes('<html lang="ar" dir="rtl">'));
for (const [, name] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) assert.ok(existsSync('dist/' + name), name);
const files = readdirSync('dist');
for (const file of files.filter(name => /\.(mjs|js)$/.test(name))) {
  execFileSync(process.execPath, ['--check', 'dist/' + file]);
  const source = readFileSync('dist/' + file, 'utf8');
  for (const [, name] of source.matchAll(/(?:from\s*|new URL\()'\.\/([^']+)'/g)) assert.ok(existsSync('dist/' + name), file + ' -> ' + name);
  assert.ok(!/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(source), 'Secret-like value in public asset');
}
const assistant = readFileSync('dist/assistant.mjs', 'utf8');
assert.match(assistant, /export const AI_ENABLED = true/);
assert.match(assistant, /https:\/\/al-mizan-api\.ajeryabod\.workers\.dev/);
assert.ok(!existsSync('dist/server'), 'Do not package an obsolete backend in this static release');
console.log('Static Arabic entrypoint, local imports, worker asset and JavaScript syntax verified. AI Worker integration is enabled.');
