// مشغّل الحزمة الكاملة (npm test): node --test على كل tests/*.test.mjs بعدد عمليات متوازية = عدد الأنوية.
// الافتراضي في node هو «الأنوية − 1» (عملية واحدة على جهاز بنواتين)، والاختبارات حسابية والمشغّل نفسه خامل —
// فتُشغَّل ملفان معًا على نواتين. نتائج المولّد تُشارَك بين الملفات عبر tests/_gen-cache.mjs (مجلد مؤقت لهذا التشغيل).
// الاستعمال: node scripts/run-tests.mjs [ملفات…] [أعلام node --test…]؛ MIZAN_TEST_CONCURRENCY يغيّر العدد.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('-')), files = argv.filter(a => !a.startsWith('-'));
const root = new URL('../', import.meta.url).pathname;
const list = files.length ? files : readdirSync(root + 'tests').filter(f => f.endsWith('.test.mjs')).sort().map(f => 'tests/' + f);
const n = Number(process.env.MIZAN_TEST_CONCURRENCY) || Math.max(2, availableParallelism());
const child = spawn(process.execPath, ['--test', `--test-concurrency=${n}`, ...flags, ...list], { cwd: root, stdio: 'inherit' });
child.on('exit', (code, sig) => process.exit(sig ? 1 : code));
