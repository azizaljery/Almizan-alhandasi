import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import * as F from '../dist/facade-styles.mjs';
import * as R from '../dist/facade-realism/index.mjs';
// (طلب المالك 2026-11-02) يكتب واجهات SVG لكل جهة ولكل بديل وملف manifest.json: node scripts/facade-realism-sample.mjs <مجلد>
const out = process.argv[2] || new URL('../docs/research/facade-realism-sample/v2', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const doc = parseDoc(readFileSync(new URL('../tests/fixtures/facade/C1.json', import.meta.url), 'utf8'));
const S = R.buildSample(doc), ALL = R.buildAll(doc);
const manifest = { fixture: 'tests/fixtures/facade/C1.json', entry_side: 's', side_names: R.SIDE_NAME, variants: {}, pairs_front_fingerprint: S.pairs, pairs_front_shape_2cm: S.shape, reference: 'elevation-reference-composeElevation.svg' };
for (const id of Object.keys(ALL)) {
  manifest.variants[id] = { ar: S.variants[id].built.variant.ar, summary: S.variants[id].built.variant.summary, fingerprint_front: S.variants[id].fingerprint, sides: {} };
  for (const s of ['s', 'n', 'e', 'w']) {
    const x = ALL[id][s];
    writeFileSync(`${out}/elevation-${id}-${s}.svg`, R.elevationSvgVariant(x.built));
    manifest.variants[id].sides[s] = { openings: x.checks.openingsInPlan, size_errors: x.checks.sizeErrors, fake_holes: x.checks.fakeHoles, frame_holes: x.checks.frameHoles, untagged_non_plan: x.checks.untaggedNonPlan.length, plan_mismatches: x.plan.mismatches, plan_checked: x.plan.checked, projections: x.projections.length, projection_violations: x.projections.filter(p => p.status === 'violation'), projections_unverified: x.projections.filter(p => p.status.startsWith('غير')).map(p => ({ id: p.id, protrusion: p.protrusion, dist: p.distFromPlotLine })) };
  }
}
const spec = F.resolveFacade(doc, { style: 'classic' });
writeFileSync(`${out}/elevation-reference-composeElevation.svg`, F.elevationSvg(doc, 's', spec));
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ pairs: S.pairs, shape: S.shape, A_s: manifest.variants.A.sides.s.projection_violations.length, unverifiedFront: Object.fromEntries(Object.keys(ALL).map(id => [id, manifest.variants[id].sides.s.projections_unverified.length])) }));
