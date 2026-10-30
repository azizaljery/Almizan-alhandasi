#!/usr/bin/env node
// Fast, read-only compatibility check against real Mizan source structure.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = new Set(process.argv.slice(2));
const r21 = args.has('--r21'), combined = args.has('--combined');
const sharaa = !r21 || combined;
const errors = [];
const check = (path, patterns) => {
  const p = join(root, path);
  if (!existsSync(p)) { errors.push(path + ': missing'); return; }
  const s = readFileSync(p, 'utf8');
  for (const [label, re] of patterns) if (!re.test(s)) errors.push(path + ': ' + label);
};
check('package.json', [['native build script', /scripts\/build\.mjs/]]);
check('scripts/build.mjs', [['dist/client asset output', /dist\/client/]]);
if (sharaa) {
  check('dist/home.html', [['land before Sharaa', /id="stageLand"/], ['Sharaa stage', /id="stageShara"/]]);
  check('dist/home.mjs', [['SharaFlow used', /new SharaFlow\(/], ['real generation', /generateInitialDesign/]]);
  check('dist/sharaa/flow.mjs', [['land inherited', /createBrief/], ['mode switch', /id: 'mode'/], ['generate confirmation', /id: 'generate'/]]);
  check('dist/sharaa/adapter.mjs', [['engine input', /export function toEngineInput/], ['no silent hook', /parkingParallel/]]);
  check('dist/requirements.mjs', []);
  check('tests/requirements-direct-door.test.mjs', [['direct door parsing tests', /باب مباشر/]]);
  check('dist/villa-layout-v3.mjs', [['direct door constraint', /r21directdoor/]]);
  check('tests/direct-door-engine.test.mjs', [['real engine test', /generateInitialDesign/]]);
  check('scripts/e2e-sharaa-v2.mjs', [['generate button pressed', /GENERATE-BUTTON-SHOWN/]]);
}
if (r21 || combined) {
  check('dist/villa-layout-v2.mjs', [['shower gate', /r21shower/]]);
  check('dist/villa-layout-v3.mjs', [['guest route patch', /r21linkall/]]);
  check('wrangler.staging.toml', [['independent worker', /almizan-handasi-staging/]]);
  check('.github/workflows/deploy-staging.yml', [['staging branch only', /branches:\s*\[staging-preview\]/]]);
}
if (errors.length) { console.error('SOURCE_CHECK_BLOCKED\n' + errors.map(x=>'- '+x).join('\n')); process.exitCode = 1; }
else console.log('SOURCE_CHECK_PASS — فحص توافق بنيوي فقط؛ لا يغني عن الاختبارات الفعلية');
