// Fetch public production assets, verify exact release bytes, then execute the
// downloaded client-side planner. This is not a browser/WebGL acceptance test.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const run = promisify(execFile);
const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'https:');
const directory = await mkdtemp(join(tmpdir(), 'mizan-live-qa-'));
const files = ['index.html', 'app.mjs', 'layout-worker.mjs', 'project.mjs', 'planner.mjs', 'claude/planner.mjs', 'claude/estimates.mjs', 'claude/PlannerOutputContract.mjs', 'claude/migrations.mjs'];
await Promise.all(files.map(async file => {
  const url = new URL(file, origin); url.searchParams.set('verify', String(Date.now()));
  const { stdout } = await run('curl', ['--fail', '--silent', '--show-error', '--max-time', '45', url.href], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
  assert.deepEqual(stdout, await readFile(new URL('../dist/' + file, import.meta.url)), 'Production differs: ' + file);
  const target = join(directory, file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, stdout);
  console.log('LIVE BYTES OK ' + file);
}));
const api = await import(pathToFileURL(join(directory, 'planner.mjs')));
for (const entry of ['s', 'n', 'e', 'w']) {
  const plot = { width: 30, length: 40, floors: 1, entry, streets: { [entry]: true } };
  const result = api.generateAlternatives(plot, api.defaultRooms(), { includeClaude: true });
  const model = result.models.find(m => m.engineVersion === 'claude-2.2.1');
  assert.ok(model); assert.deepEqual(api.validateModel(model), []);
  assert.ok(Math.abs(api.quantities(model).rooms - 228) < 1e-6);
  console.log('LIVE CLAUDE GENERATION OK ' + entry);
}
console.log('LIVE VERIFICATION PASS: 9 production assets and 4 entry directions; downloaded files: ' + directory);
