// (الجولة التاسعة عشرة — شرط المالك الثاني: استقلال المراجعة) تجميد المحرك ومعايير التقييم قبل توليد أدلة الحالات المحجوزة:
// إيداع المحرك، وبصمة sha256 لملفات المحرك والتقييم والأوزان، وبصمة مجموعة الاختبارات. يُكتب في evidence/acceptance/after-19/FREEZE.json
// ويُودَع وحده قبل توليد evidence/acceptance/after-19-heldout/؛ ولا تُغيَّر شيفرة المحرك بعده في هذه الجولة.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
const ROOT = new URL('../', import.meta.url).pathname, sha = p => createHash('sha256').update(readFileSync(ROOT + p)).digest('hex');
const FILES = ['dist/villa-layout-v2.mjs', 'dist/plan-review.mjs', 'dist/presentation-status.mjs', 'dist/privacy-defects.mjs', 'dist/requirements.mjs', 'dist/arch-difference.mjs',
  'dist/saudi-program.mjs', 'dist/r16-polish.mjs', 'dist/r17-polish.mjs', 'dist/rules.mjs', 'dist/site-parking.mjs', 'dist/stacking.mjs', 'dist/glazing.mjs', 'dist/circulation-proof.mjs',
  'dist/design-session.mjs', 'dist/plan-edit.mjs', 'dist/edit-truth.mjs', 'dist/villa-layout.mjs', 'dist/draw/editor/render2d.mjs', 'dist/arch-criterion.mjs', 'docs/research/arch-difference-criterion-r19.md', 'scripts/r19-defect-corpus.mjs', 'scripts/acceptance-cases.mjs', 'scripts/heldout-cases.mjs', 'scripts/mizan-ledger.mjs', 'scripts/innovation-r19.mjs'];
const tests = readdirSync(ROOT + 'tests').filter(f => f.endsWith('.mjs')).sort(), th = createHash('sha256'); for (const f of tests) th.update(f + '\0' + readFileSync(ROOT + 'tests/' + f));
const head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(), dirty = execSync('git status --porcelain -- dist scripts tests', { cwd: ROOT }).toString().trim();
const out = { note_ar: 'تجميد الجولة 19: المحرك ومعايير التقييم (الأوزان والعتبات والقياسات) كما هي عند هذا الإيداع؛ أدلة الحالات المحجوزة after-19-heldout تُولَّد بهذا الإيداع ولا تُغيَّر الشيفرة بعده في الجولة. التقييم الآلي ليس اعتمادًا هندسيًا ولا إنشائيًا.',
  engineCommit: head, workingTreeCleanForEngine: !dirty, engineVersion: (/VILLA_V2_ENGINE_VERSION = '([^']+)'/.exec(readFileSync(ROOT + 'dist/villa-layout-v2.mjs', 'utf8')) || [])[1],
  sha256: Object.fromEntries(FILES.map(f => [f, sha(f)])), tests: { files: tests.length, sha256: th.digest('hex') }, frozenAt: new Date().toISOString() };
if (dirty) { console.error('شيفرة غير مودعة في dist/scripts/tests — أودعها قبل التجميد:\n' + dirty); process.exit(1); }
writeFileSync(ROOT + 'evidence/acceptance/after-19/FREEZE.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
