import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createEngineeringPackage } from '../src/index.mjs';
import { writeDeliverables } from '../src/write-files.mjs';
const project = JSON.parse(await readFile(new URL('./demo-input.json', import.meta.url), 'utf8'));
const result = await createEngineeringPackage(project, { disciplines: ['electrical', 'hvac', 'plumbing', 'fire', 'low_current', 'solar'] });
// npm run demo regenerates only the bundled demonstration output.
const saved = await writeDeliverables(project, result, fileURLToPath(new URL('../demo-output/', import.meta.url)), { overwrite: true });
process.stdout.write(JSON.stringify({ status: result.status, constructionApproved: false, devices: result.disciplines.reduce((s, d) => s + d.devices.length, 0), routes: result.disciplines.reduce((s, d) => s + d.routes.length, 0), calculations: result.disciplines.reduce((s, d) => s + d.calculations.length, 0), files: saved.files.length, issues: result.issues.length }, null, 2) + '\n');
