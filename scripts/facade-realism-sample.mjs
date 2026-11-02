// (طلب المالك 2026-11-02) يكتب واجهات SVG الأمامية للبدائل الثلاثة من الطبقات نفسها، ومرجع composeElevation الحالي (classic) للمقارنة،
// وملف manifest.json بالفحوص والبصمات. يعمل في node بلا متصفح:
//   node scripts/facade-realism-sample.mjs <مجلد-الناتج>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc } from '../dist/draw/doc.mjs';
import * as F from '../dist/facade-styles.mjs';
import * as R from '../dist/facade-realism/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, '..', 'docs', 'research', 'facade-realism-sample');
mkdirSync(out, { recursive: true });
const doc = parseDoc(readFileSync(join(here, '..', 'tests', 'fixtures', 'facade', 'C1.json'), 'utf8'));
const S = R.buildSample(doc);
const manifest = { fixture: 'tests/fixtures/facade/C1.json', side: 's', entry: doc.entry, variants: {}, pairs: S.pairs, reference: null };
for (const id of Object.keys(S.variants)) {
  const v = S.variants[id];
  writeFileSync(join(out, `elevation-${id}.svg`), R.elevationSvgVariant(v.built));
  manifest.variants[id] = { ar: v.built.variant.ar, summary: v.built.variant.summary, layers: v.built.layers.length, planLayers: v.built.layers.filter(l => l.plan).length, proposedLayers: v.built.layers.filter(l => !l.plan).length, fingerprint: v.fingerprint, checks: v.checks };
}
const spec = F.resolveFacade(doc, { style: 'classic' });
writeFileSync(join(out, 'elevation-reference-composeElevation.svg'), F.elevationSvg(doc, 's', spec));
manifest.reference = { file: 'elevation-reference-composeElevation.svg', style: 'classic', note: 'المرجع الحالي من composeElevation، دون تغيير' };
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ pairs: S.pairs, checks: Object.fromEntries(Object.entries(manifest.variants).map(([k, v]) => [k, { openingsDocFront: v.checks.openingsDocFront, sizeErrors: v.checks.sizeErrors.length, untaggedNonPlan: v.checks.untaggedNonPlan.length, fakeHoles: v.checks.fakeHoles }])) }));
