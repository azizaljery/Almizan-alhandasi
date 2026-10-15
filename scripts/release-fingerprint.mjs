// بصمة الإصدار وحماية النشر: sha256 لكل ملف في dist/ (و dist/client إن وُجد بعد npm run build)،
// تُكتب في RELEASE-FINGERPRINT.json وتُقارن بسابقتها؛ الرفض (exit 1) إذا:
//   1) حُذف ملف من قائمة الملفات الحرجة، أو غاب الآن ملف كان في البصمة السابقة وهو حرج؛
//   2) نقص عدد الاختبارات عن السابق (العدّ الساكن لتصريحات test()/it()، ومعه عدد التشغيل إن مُرّر --tests-run N).
// للقراءة والحساب فقط: لا ينشر ولا يدفع. عند الرفض لا يُستبدل ملف البصمة السابق.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FINGERPRINT_SCHEMA = 'mizan-release-fingerprint/1';
export const CRITICAL_FILES = Object.freeze(['dist/index.html', 'dist/home.html', 'dist/studio.html', 'dist/planner.mjs', 'dist/draw/doc.mjs']);
const SKIP_DIRS = new Set(['client', 'server', 'node_modules']);

const sha = buf => createHash('sha256').update(buf).digest('hex');
export function walk(dir, root, { skipTop = true } = {}) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (skipTop && dir === root && SKIP_DIRS.has(e.name)) continue; out.push(...walk(p, root, { skipTop })); }
    else if (e.isFile()) out.push(p);
  }
  return out;
}
export function hashTree(rootDir, { skipTop = true, exclude = [] } = {}) {
  const files = {};
  if (!existsSync(rootDir)) return files;
  for (const p of walk(rootDir, rootDir, { skipTop })) {
    const rel = relative(process.cwd(), p).split(sep).join('/');
    if (exclude.includes(rel.split('/').pop())) continue;
    files[rel] = sha(readFileSync(p));
  }
  return files;
}
/** عدّ ساكن لتصريحات الاختبارات في tests/*.test.mjs (حتمي، لا يشغّل الاختبارات). */
export function countTests(dir = 'tests') {
  let n = 0;
  for (const f of readdirSync(dir).filter(x => x.endsWith('.test.mjs'))) n += (readFileSync(join(dir, f), 'utf8').match(/^\s*(?:test|it)(?:\.\w+)?\(/gm) || []).length;
  return n;
}
export function buildFingerprint({ testsRun = null, now = new Date() } = {}) {
  return {
    schema: FINGERPRINT_SCHEMA, createdAt: now.toISOString(),
    tests: { declared: countTests(), run: testsRun },
    critical: CRITICAL_FILES,
    files: hashTree('dist'),
    // version.json يتغير مع كل بناء (وقت/التزام) فيُستثنى من بصمة العميل
    client: hashTree('dist/client', { skipTop: false, exclude: ['version.json'] }),
  };
}
/** يقارن بصمة جديدة بسابقتها. يعيد { errors:[], changes:{added,removed,modified} }. */
export function compareFingerprints(prev, next) {
  const errors = [];
  for (const f of next.critical || CRITICAL_FILES) if (!(f in next.files)) errors.push(`ملف حرج مفقود: ${f}`);
  const pc = prev?.critical || [];
  for (const f of pc) if (!(f in next.files)) errors.push(`ملف حرج حُذف منذ البصمة السابقة: ${f}`);
  if (prev) {
    if (next.tests.declared < prev.tests.declared) errors.push(`نقص عدد الاختبارات المُصرَّح بها: ${prev.tests.declared} ← ${next.tests.declared}`);
    if (prev.tests.run != null && next.tests.run != null && next.tests.run < prev.tests.run) errors.push(`نقص عدد الاختبارات المُشغَّلة: ${prev.tests.run} ← ${next.tests.run}`);
  }
  const pf = prev?.files || {}, nf = next.files;
  const changes = { added: Object.keys(nf).filter(k => !(k in pf)), removed: Object.keys(pf).filter(k => !(k in nf)), modified: Object.keys(nf).filter(k => k in pf && pf[k] !== nf[k]) };
  return { errors, changes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const OUT = 'RELEASE-FINGERPRINT.json', args = process.argv.slice(2);
  const ri = args.indexOf('--tests-run'), testsRun = ri >= 0 ? Number(args[ri + 1]) : null;
  const check = args.includes('--check-only');
  let prev = null; try { prev = JSON.parse(readFileSync(OUT, 'utf8')); } catch { prev = null; }
  const next = buildFingerprint({ testsRun: Number.isFinite(testsRun) ? testsRun : null });
  const { errors, changes } = compareFingerprints(prev, next);
  console.log(`ملفات dist: ${Object.keys(next.files).length} · client: ${Object.keys(next.client).length} · اختبارات مُصرَّح بها: ${next.tests.declared}`);
  console.log(`مقارنة بالسابق: +${changes.added.length} −${changes.removed.length} ~${changes.modified.length}${prev ? '' : ' (لا بصمة سابقة)'}`);
  if (errors.length) { for (const e of errors) console.error('رفض: ' + e); process.exit(1); }
  if (!check) { writeFileSync(OUT, JSON.stringify(next, null, 2) + '\n'); console.log('كُتب ' + OUT); }
}
