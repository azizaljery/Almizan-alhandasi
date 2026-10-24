// (الجولة العشرون — استقلال المراجعة) تجميد المحرك ومعايير التقييم قبل توليد الحالات المحجوزة الثانية H6–H10:
// إيداع المحرك، وبصمة sha256 لملفات المحرك والتقييم والمعيار المجمّد ووثيقته، وبصمة مجموعة الاختبارات، وبصمة ملف الحالات المحجوزة نفسه
// (يُتحقق أنه لم يتغير منذ أودعه المنسّق: 831c937f…). يُكتب في evidence/acceptance/after-20/FREEZE.json ويُودَع وحده؛ ثم تُولَّد
// evidence/acceptance/after-20-heldout2/ مرة واحدة بهذا الإيداع، ولا تُغيَّر شيفرة المحرك بعده في الجولة.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
const ROOT = new URL('../', import.meta.url).pathname, sha = p => createHash('sha256').update(readFileSync(ROOT + p)).digest('hex');
const FILES = ['dist/villa-layout-v3.mjs', 'dist/feasibility.mjs', 'dist/r20-checks.mjs', 'dist/change-guard.mjs', 'dist/client-text.mjs',
  'dist/villa-layout-v2.mjs', 'dist/villa-layout.mjs', 'dist/plan-review.mjs', 'dist/presentation-status.mjs', 'dist/privacy-defects.mjs', 'dist/requirements.mjs', 'dist/arch-difference.mjs',
  'dist/saudi-program.mjs', 'dist/r16-polish.mjs', 'dist/r17-polish.mjs', 'dist/rules.mjs', 'dist/site-parking.mjs', 'dist/stacking.mjs', 'dist/glazing.mjs', 'dist/circulation-proof.mjs',
  'dist/design-session.mjs', 'dist/plan-edit.mjs', 'dist/edit-truth.mjs', 'dist/home-flow.mjs', 'dist/draw/editor/render2d.mjs',
  'dist/arch-criterion.mjs', 'docs/research/arch-difference-criterion-r19.md',
  'scripts/acceptance-cases.mjs', 'scripts/heldout-cases.mjs', 'scripts/heldout2-cases.mjs', 'scripts/dev-cases-r20.mjs', 'scripts/acceptance-run.mjs', 'scripts/mizan-ledger.mjs', 'scripts/innovation-r19.mjs'];
const SEALED_SHA = '831c937f72925d4cc315aa046562597f7ce4d6e6e9f368778b52fd2778d9e732';
const tests = readdirSync(ROOT + 'tests').filter(f => f.endsWith('.mjs')).sort(), th = createHash('sha256'); for (const f of tests) th.update(f + '\0' + readFileSync(ROOT + 'tests/' + f));
const head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(), dirty = execSync('git status --porcelain -- dist scripts tests docs/research/arch-difference-criterion-r19.md', { cwd: ROOT }).toString().trim();
if (dirty) { console.error('شيفرة غير مودعة — أودعها قبل التجميد:\n' + dirty); process.exit(1); }
const sealed = sha('scripts/heldout2-cases.mjs');
if (sealed !== SEALED_SHA) { console.error('ملف الحالات المحجوزة الثانية تغيّر عما أودعه المنسّق: ' + sealed); process.exit(1); }
const out = {
  note_ar: 'تجميد الجولة 20: المحرك الثالث (والثاني والأول كما هما) ومعايير التقييم (القياسات والعتبات وحالة العرض والمعيار المجمّد «مختلف معماريًا» r19 دون تغيير) عند هذا الإيداع؛ الحالات المحجوزة H6–H10 لم تُفتح ولم تُشغَّل قبله، وتُولَّد بعده مرة واحدة في after-20-heldout2 ولا تُغيَّر الشيفرة بعدها في الجولة. التقييم الآلي ليس اعتمادًا هندسيًا ولا إنشائيًا.',
  engineCommit: head, workingTreeCleanForEngine: true,
  engines: { v3: (/VILLA_V3_ENGINE_VERSION = '([^']+)'/.exec(readFileSync(ROOT + 'dist/villa-layout-v3.mjs', 'utf8')) || [])[1], v2: (/VILLA_V2_ENGINE_VERSION = '([^']+)'/.exec(readFileSync(ROOT + 'dist/villa-layout-v2.mjs', 'utf8')) || [])[1], default: 'v3' },
  sealedHeldout2: { file: 'scripts/heldout2-cases.mjs', sha256: sealed, matchesCoordinator: true, openedBeforeFreeze: false },
  sha256: Object.fromEntries(FILES.map(f => [f, sha(f)])), tests: { files: tests.length, sha256: th.digest('hex') }, frozenAt: new Date().toISOString() };
mkdirSync(ROOT + 'evidence/acceptance/after-20', { recursive: true });
writeFileSync(ROOT + 'evidence/acceptance/after-20/FREEZE.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
