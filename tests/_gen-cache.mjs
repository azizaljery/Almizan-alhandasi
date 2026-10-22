// مشاركة نتائج المولّد الثاني بين ملفات الاختبار وبين التشغيلات (node --test يشغّل كل ملف في عملية مستقلة):
// المولّد حتمي (ميزانيات بالعدد لا بالزمن)، فالطلب نفسه = النتيجة نفسها؛ يُحسب مرة ويُقرأ من ذاكرة دائمة على القرص
// .cache/gen/<بصمة الشيفرة>/<بصمة الطلب> (المجلد مُتجاهَل في git بملف .cache/.gitignore يُكتب تلقائيًا).
// بصمة الشيفرة = sha256 لمحتوى dist/villa-layout-v2.mjs وكل ما يستورده من dist تعديًا، فأي تعديل في المولّد أو تابعيه
// يُبطل الذاكرة كلها (المجلدات القديمة تُحذف عند أول تشغيل). بصمة الطلب = sha256 لمفتاح المولّد (إصدار المحرك + النوع +
// الطلب بصيغة قانونية: راجع cacheKey في dist/villa-layout-v2.mjs). خارج مشغّل الاختبارات أو مع MIZAN_NO_GEN_CACHE=1 لا يعمل شيء؛
// MIZAN_GEN_CACHE_DIR يغيّر مكان الذاكرة (مثلًا مجلد مؤقت في CI).
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const sha = s => createHash('sha256').update(s).digest('hex');

/** بصمة شيفرة ملف وكل ما يستورده من dist (استيراد ثابت أو ديناميكي بمسار نسبي)، بالمحتوى لا بزمن التعديل. */
export function codeFingerprint(entry) {
  const seen = new Map(), stack = [entry];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue;
    let src; try { src = readFileSync(f, 'utf8'); } catch { seen.set(f, 'missing'); continue; }
    seen.set(f, sha(src));
    for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) stack.push(new URL(m[1], 'file://' + f).pathname);
  }
  return sha([...seen].sort().map(([f, h]) => f + ':' + h).join('|')).slice(0, 16);
}

if (process.env.NODE_TEST_CONTEXT && !process.env.MIZAN_NO_GEN_CACHE && !globalThis.__mizanGenCache) {
  const root = new URL('../', import.meta.url).pathname;
  // (الجولة الثالثة عشرة) أربع ذاكرات ببصمات مستقلة: المولّد الثاني (المفتاح يبدأ بإصداره villa-v2-…)، والمولّد الأول (villa-zones-…)،
  // والمحرك المتعدد dist/multi-engine.mjs (me|)، والمراجع المستقل dist/plan-review.mjs (rv|) — فتعديل أحدها لا يُبطل ذاكرة الآخرين
  const fps = { v2: codeFingerprint(root + 'dist/villa-layout-v2.mjs'), v1: 'v1-' + codeFingerprint(root + 'dist/villa-layout.mjs'), me: 'me-' + codeFingerprint(root + 'dist/multi-engine.mjs'), rv: 'rv-' + codeFingerprint(root + 'dist/plan-review.mjs') };
  const base = process.env.MIZAN_GEN_CACHE_DIR || join(root, '.cache', 'gen');
  const dirs = Object.fromEntries(Object.entries(fps).map(([k, f]) => [k, join(base, f)]));
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  const dirOf = k => (k.startsWith('me|') ? dirs.me : k.startsWith('rv|') ? dirs.rv : k.startsWith('villa-zones') ? dirs.v1 : dirs.v2);
  const dir = dirs.v2;
  try { const gi = join(root, '.cache', '.gitignore'); if (!existsSync(gi)) writeFileSync(gi, '*\n'); } catch { /* لا يهم */ }
  // بصمة قديمة = شيفرة تغيّرت: تُحذف (عملية أخرى قد تحذفها في اللحظة نفسها، فالفشل مقبول)
  try { const keep = new Set(Object.values(fps)); for (const d of readdirSync(base)) if (!keep.has(d)) rmSync(join(base, d), { recursive: true, force: true }); } catch { /* لا يهم */ }
  // تطبيع المفتاح: land.floors لا يقرؤه المولّد الثاني (عدد الأدوار من نوع النداء one/two)، فالطلب به وبدونه نتيجة واحدة —
  // يُحذف من المفتاح ما دام مصدر المولّد لا يقرؤه (يُتحقق من ذلك هنا لا بالافتراض)
  const normFloors = !/land\??\.floors|floors\s*[,}=][^\n]*\bland\b/.test(readFileSync(root + 'dist/villa-layout-v2.mjs', 'utf8'));
  const norm = k => normFloors ? k.replace(/("land":\{[^{}]*?)"floors":\d+,/, '$1') : k;
  const h = k => sha(norm(k));
  const mem = new Map();
  // تشخيص الزمن (MIZAN_GEN_LOG=<ملف>): سطر لكل قراءة/حساب بالملف والمفتاح والزمن؛ ومع MIZAN_GEN_KEYS=1 المفاتيح كاملة —
  // به وُجدت الطلبات المكررة بين الملفات (الجولة السابعة)
  const LOG = process.env.MIZAN_GEN_LOG, t0s = new Map();
  const log = (ev, k) => { if (LOG && process.env.MIZAN_GEN_KEYS && ev === 'set') appendFileSync(LOG + '.keys', k + '\n'); if (LOG) appendFileSync(LOG, `${process.argv[1]?.split('/').pop()}\t${ev}\t${h(k).slice(0, 10)}\t${t0s.has(k) ? Math.round(performance.now() - t0s.get(k)) : ''}\t${k.length}\n`); };
  globalThis.__mizanGenCache = {
    dir,
    get(k) {
      if (!mem.has(k)) {
        const f = join(dirOf(k), h(k));
        let s = null; try { s = readFileSync(f, 'utf8'); JSON.parse(s); } catch { s = null; } // ملف ناقص أو تالف = غياب
        if (s == null) { t0s.set(k, performance.now()); log('miss', k); return null; }
        mem.set(k, s);
      }
      log('hit', k);
      return JSON.parse(mem.get(k)); // نسخة جديدة في كل مرة: لا يتأثر اختبار بتعديل اختبار آخر على النتيجة
    },
    set(k, v) { log('set', k); const s = JSON.stringify(v), f = join(dirOf(k), h(k)), t = `${f}.${process.pid}`; mem.set(k, s); writeFileSync(t, s); renameSync(t, f); },
  };
}
