// (الجولة الثالثة عشرة) ذاكرة دائمة لنتائج حسابية غالية في ملفات الاختبار (غير نتائج المولّد التي يتولاها _gen-cache.mjs):
// memo(name, { code:[ملفات تُحسب بصمتها تعديًا], files:[ملفات بيانات تُحسب بصمة محتواها], key }, fn) يحسب fn مرة ويقرأها من
// .cache/memo/<name>/<بصمة الشيفرة والبيانات>-<بصمة المفتاح>.json في التشغيلات التالية ما دامت الشيفرة والبيانات لم تتغيّر.
// النتيجة JSON فقط (لا دوال)؛ خارج مشغّل الاختبارات أو مع MIZAN_NO_GEN_CACHE=1 تُحسب دائمًا. القراءة تعطي نسخة جديدة في كل مرة.
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { codeFingerprint } from './_gen-cache.mjs';

const sha = s => createHash('sha256').update(s).digest('hex');
const ROOT = new URL('../', import.meta.url).pathname;
const ON = !!process.env.NODE_TEST_CONTEXT && !process.env.MIZAN_NO_GEN_CACHE;

function dataFingerprint(files) {
  const parts = [];
  for (const f of files) {
    const p = f.startsWith('/') ? f : ROOT + f;
    try {
      if (statSync(p).isDirectory()) { for (const n of readdirSync(p).sort()) { const q = join(p, n); if (statSync(q).isFile()) parts.push(n + ':' + sha(readFileSync(q))); } }
      else parts.push(f + ':' + sha(readFileSync(p)));
    } catch { parts.push(f + ':missing'); }
  }
  return sha(parts.join('|')).slice(0, 12);
}

/** @returns {any} نتيجة fn (من الذاكرة إن وُجدت) */
export function memo(name, { code = [], files = [], key = '' } = {}, fn) {
  if (!ON) return fn();
  const fp = sha(code.map(c => codeFingerprint(c.startsWith('/') ? c : ROOT + c)).join('|') + '|' + dataFingerprint(files)).slice(0, 16);
  const dir = join(process.env.MIZAN_GEN_CACHE_DIR ? join(process.env.MIZAN_GEN_CACHE_DIR, '..', 'memo') : join(ROOT, '.cache', 'memo'), name);
  mkdirSync(dir, { recursive: true });
  // بصمة قديمة = شيفرة أو بيانات تغيّرت: تُحذف
  try { for (const f of readdirSync(dir)) if (!f.startsWith(fp + '-')) rmSync(join(dir, f), { force: true }); } catch { /* لا يهم */ }
  const file = join(dir, `${fp}-${sha(key).slice(0, 16)}.json`);
  if (existsSync(file)) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { /* ملف تالف = غياب */ } }
  const out = fn();
  try { const t = `${file}.${process.pid}`; writeFileSync(t, JSON.stringify(out)); renameSync(t, file); } catch { /* لا يُخزَّن */ }
  return out;
}
export default { memo };
