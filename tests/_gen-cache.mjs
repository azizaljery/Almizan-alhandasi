// مشاركة نتائج المولّد الثاني بين ملفات الاختبار في التشغيل الواحد (node --test يشغّل كل ملف في عملية مستقلة):
// المولّد حتمي (ميزانيات بالعدد لا بالزمن)، فالطلب نفسه = النتيجة نفسها؛ يُحسب مرة ويُقرأ من مجلد مؤقت خاص بهذا
// التشغيل (رقم عملية المشغّل + بصمة ملفات dist). خارج مشغّل الاختبارات أو مع MIZAN_NO_GEN_CACHE=1 لا يعمل شيء.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

if (process.env.NODE_TEST_CONTEXT && !process.env.MIZAN_NO_GEN_CACHE && !globalThis.__mizanGenCache) {
  const distDir = new URL('../dist/', import.meta.url).pathname;
  const fp = createHash('sha256').update(readdirSync(distDir).filter(f => f.endsWith('.mjs')).sort().map(f => { const st = statSync(join(distDir, f)); return `${f}:${st.size}:${st.mtimeMs}`; }).join('|')).digest('hex').slice(0, 12);
  const dir = join(tmpdir(), `mizan-gen-cache-${process.ppid}-${fp}`);
  mkdirSync(dir, { recursive: true });
  const h = k => createHash('sha256').update(k).digest('hex');
  const mem = new Map();
  // تشخيص الزمن (MIZAN_GEN_LOG=<ملف>): سطر لكل قراءة/حساب بالملف والمفتاح والزمن؛ ومع MIZAN_GEN_KEYS=1 المفاتيح كاملة —
  // به وُجدت الطلبات المكررة بين الملفات (الجولة السابعة)
  const LOG = process.env.MIZAN_GEN_LOG, t0s = new Map();
  const log = (ev, k) => { if (LOG && process.env.MIZAN_GEN_KEYS && ev === 'set') appendFileSync(LOG + '.keys', k + '\n'); if (LOG) appendFileSync(LOG, `${process.argv[1]?.split('/').pop()}\t${ev}\t${h(k).slice(0, 10)}\t${t0s.has(k) ? Math.round(performance.now() - t0s.get(k)) : ''}\t${k.length}\n`); };
  globalThis.__mizanGenCache = {
    get(k) {
      if (!mem.has(k)) { const f = join(dir, h(k)); if (!existsSync(f)) { t0s.set(k, performance.now()); log('miss', k); return null; } mem.set(k, readFileSync(f, 'utf8')); }
      log('hit', k);
      return JSON.parse(mem.get(k)); // نسخة جديدة في كل مرة: لا يتأثر اختبار بتعديل اختبار آخر على النتيجة
    },
    set(k, v) { log('set', k); const s = JSON.stringify(v), f = join(dir, h(k)), t = `${f}.${process.pid}`; mem.set(k, s); writeFileSync(t, s); renameSync(t, f); },
  };
}
