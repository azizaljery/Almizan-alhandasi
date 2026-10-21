// مشغّل الحزمة الكاملة (npm test): node --test على كل tests/*.test.mjs بعدد عمليات متوازية = عدد الأنوية.
// الافتراضي في node هو «الأنوية − 1» (عملية واحدة على جهاز بنواتين)، والاختبارات حسابية والمشغّل نفسه خامل —
// فتُشغَّل ملفان معًا على نواتين. نتائج المولّد تُشارَك بين الملفات وبين التشغيلات عبر tests/_gen-cache.mjs (.cache/gen).
// الترتيب: الأطول أولًا (أزمنة التشغيل السابق من .cache/test-durations.json التي يكتبها tests/_durations-reporter.mjs،
// وقبلها القياس المرجعي في tests/_test-durations.mjs) — فلا يبقى ملف طويل وحيدًا على نواة واحدة في آخر الحزمة؛
// وملفات المتصفح (Chromium) تُقدَّم إلى أول الطابور لتأخذ المعالج قبل أن يزدحم.
// الاستعمال: node scripts/run-tests.mjs [ملفات…] [أعلام node --test…]؛ MIZAN_TEST_CONCURRENCY يغيّر العدد،
// MIZAN_TEST_ORDER=name يعيد الترتيب الأبجدي.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { readDurations, DURATIONS_FILE } from '../tests/_durations-reporter.mjs';
import { BASELINE_DURATIONS, BROWSER_FILES } from '../tests/_test-durations.mjs';

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('-')), files = argv.filter(a => !a.startsWith('-'));
const root = new URL('../', import.meta.url).pathname;
let list = files.length ? files : readdirSync(root + 'tests').filter(f => f.endsWith('.test.mjs')).sort().map(f => 'tests/' + f);

if (process.env.MIZAN_TEST_ORDER !== 'name') {
  const measured = readDurations(DURATIONS_FILE), key = f => 'tests/' + f.split('/').pop();
  const dur = f => measured[key(f)] ?? BASELINE_DURATIONS[key(f)] ?? 0;
  const browser = f => BROWSER_FILES.includes(key(f)) ? 1 : 0;
  // مستقر: المتصفح أولًا، ثم الأطول، ثم الاسم
  list = [...list].sort((a, b) => browser(b) - browser(a) || dur(b) - dur(a) || a.localeCompare(b));
}

const n = Number(process.env.MIZAN_TEST_CONCURRENCY) || Math.max(2, availableParallelism());
// مُبلِّغ الأزمنة يُضاف إلى مُبلِّغ المستخدم (أو الافتراضي: spec على طرفية وإلا tap)؛ كل مُبلِّغ يحتاج وجهة عند تعدد المُبلِّغين
const userReps = flags.filter(a => a.startsWith('--test-reporter=')), userDests = flags.filter(a => a.startsWith('--test-reporter-destination='));
const rest = flags.filter(a => !a.startsWith('--test-reporter'));
const reps = userReps.length ? userReps : [`--test-reporter=${process.stdout.isTTY ? 'spec' : 'tap'}`];
const dests = userReps.length ? userDests : [];
while (dests.length < reps.length) dests.push('--test-reporter-destination=stdout');
const reporterArgs = [...reps.flatMap((r, i) => [r, dests[i]]), `--test-reporter=${root}tests/_durations-reporter.mjs`, `--test-reporter-destination=${DURATIONS_FILE}.log`];
const child = spawn(process.execPath, ['--test', `--test-concurrency=${n}`, ...reporterArgs, ...rest, ...list], { cwd: root, stdio: 'inherit' });
child.on('exit', (code, sig) => process.exit(sig ? 1 : code));
