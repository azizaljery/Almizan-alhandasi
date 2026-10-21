// مُبلِّغ node --test يسجّل زمن كل ملف اختبار في .cache/test-durations.json (ليس ملف اختبار؛ يضيفه scripts/run-tests.mjs
// كمُبلِّغ ثانٍ؛ وجهته ملف .log فارغ لأن node يُفرغ الوجهة عند البدء، والسجل يُكتب هنا مباشرة). المشغّل يقرأه في التشغيل التالي ليبدأ بالأطول — فلا يبقى ملف طويل وحيدًا في آخر الحزمة.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export const DURATIONS_FILE = new URL('../.cache/test-durations.json', import.meta.url).pathname;

export function readDurations(file = DURATIONS_FILE) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } }

export default async function* durationsReporter(source) {
  const seen = {};
  for await (const ev of source) {
    if (ev.type !== 'test:complete' || !ev.data?.file || ev.data.nesting !== 0) continue;
    const f = ev.data.file, ms = ev.data.details?.duration_ms;
    if (String(ev.data.name).split('/').pop() !== f.split('/').pop() || !(ms > 0)) continue; // اختبار الملف نفسه (اسمه = مساره كما مُرّر) لا اختباراته الداخلية
    const k = 'tests/' + f.split('/').pop(); seen[k] = Math.max(seen[k] || 0, Math.round(ms));
  }
  try {
    const prev = readDurations(), next = { ...prev, ...seen };
    mkdirSync(dirname(DURATIONS_FILE), { recursive: true });
    const t = `${DURATIONS_FILE}.${process.pid}`; writeFileSync(t, JSON.stringify(next, null, 1)); renameSync(t, DURATIONS_FILE);
  } catch { /* لا يُسجَّل */ }
  yield '';
}
