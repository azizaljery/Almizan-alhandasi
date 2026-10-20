// مشاركة نتائج المولّد الثاني بين ملفات الاختبار في التشغيل الواحد (node --test يشغّل كل ملف في عملية مستقلة):
// المولّد حتمي (ميزانيات بالعدد لا بالزمن)، فالطلب نفسه = النتيجة نفسها؛ يُحسب مرة ويُقرأ من مجلد مؤقت خاص بهذا
// التشغيل (رقم عملية المشغّل + بصمة ملفات dist). خارج مشغّل الاختبارات أو مع MIZAN_NO_GEN_CACHE=1 لا يعمل شيء.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, statSync } from 'node:fs';
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
  globalThis.__mizanGenCache = {
    get(k) {
      if (!mem.has(k)) { const f = join(dir, h(k)); if (!existsSync(f)) return null; mem.set(k, readFileSync(f, 'utf8')); }
      return JSON.parse(mem.get(k)); // نسخة جديدة في كل مرة: لا يتأثر اختبار بتعديل اختبار آخر على النتيجة
    },
    set(k, v) { const s = JSON.stringify(v), f = join(dir, h(k)), t = `${f}.${process.pid}`; mem.set(k, s); writeFileSync(t, s); renameSync(t, f); },
  };
}
