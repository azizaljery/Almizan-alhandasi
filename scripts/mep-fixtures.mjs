// يولّد بدائل معمارية حقيقية من محركي الفيلا الحاليين (v3 الافتراضي وv2) لاختبارات ربط الأنظمة (tests/mep-integration.test.mjs).
// الحالات من الملف العلني scripts/acceptance-cases.mjs فقط (لا H11–H15 ولا العينات المختومة). لا يغيّر أي محرك.
// التشغيل: node scripts/mep-fixtures.mjs  → tests/fixtures/mep/<الحالة>-<المحرك>.json مع بصمة ملفي المحركين وقت التوليد.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url).pathname;
const { generateInitialDesign } = await import('../dist/home-flow.mjs');
const { extractRequirements } = await import('../dist/requirements.mjs');
const { CASES } = await import('./acceptance-cases.mjs');
export const ENGINE_FILES = ['dist/villa-layout-v2.mjs', 'dist/villa-layout-v3.mjs'];
const engineSha = Object.fromEntries(ENGINE_FILES.map(f => [f, createHash('sha256').update(readFileSync(root + f)).digest('hex')]));
let commit = 'unknown'; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
const RUNS = [['C6', 'auto'], ['C6', 'v2'], ['C7', 'auto'], ['C4', 'v2']];
mkdirSync(root + 'tests/fixtures/mep', { recursive: true });
for (const [id, engine] of RUNS) {
  const C = CASES.find(c => c.id === id);
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const out = await generateInitialDesign({ land: JSON.parse(JSON.stringify(C.land)), counts: req.counts, requirements: req, engine });
  const file = `tests/fixtures/mep/${id}-${out.villaEngine}.json`;
  writeFileSync(root + file, JSON.stringify({ schema: 'mizan-mep-fixture/1', case: id, engineArg: engine, villaEngine: out.villaEngine, engineVersion: out.engine, generatedAtCommit: commit, engineSha, alternatives: out.alternatives.map(a => ({ index: a.index, strategy: a.strategy, presentation: a.presentation?.status || null, doc: a.doc })) }) + '\n');
  console.log(file, out.villaEngine, out.alternatives.length);
}
