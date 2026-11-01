#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createEngineeringPackage } from './src/index.mjs';
import { writeDeliverables } from './src/write-files.mjs';
const args = process.argv.slice(2), allowed = new Set(['--input', '--out', '--disciplines', '--overwrite']);
const opts = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i]; if (!allowed.has(key)) throw new Error('Unknown flag: ' + key);
  if (key === '--overwrite') opts.overwrite = true;
  else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + key); opts[key.slice(2)] = args[++i]; }
}
if (!opts.input || !opts.out) { process.stderr.write('Usage: node cli.mjs --input project.json --out new-directory [--disciplines electrical,hvac,plumbing,fire,low_current,solar] [--overwrite]\n'); process.exitCode = 2; }
else {
  const project = JSON.parse(await readFile(opts.input, 'utf8'));
  const result = await createEngineeringPackage(project, opts.disciplines ? { disciplines: opts.disciplines.split(',') } : {});
  const files = await writeDeliverables(project, result, opts.out, { overwrite: opts.overwrite || false });
  process.stdout.write(JSON.stringify({ status: result.status, constructionApproved: false, files: files.files.length, inputHash: result.inputHash }) + '\n');
}
