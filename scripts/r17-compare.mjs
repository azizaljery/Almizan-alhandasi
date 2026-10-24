// (الجولة السابعة عشرة) مقارنة after-16 وafter-17 لكل حالة: العدد/المطلوب، وحالات العرض، والأنماط، والعيوب الجوهرية لكل بديل.
// الاستعمال: node scripts/r17-compare.mjs [before=after-16] [after=after-17] → evidence/acceptance/<after>/compare-<before>.json
import { readFileSync, writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
const [B = 'after-16', A = 'after-17'] = process.argv.slice(2), ROOT = new URL('../', import.meta.url).pathname;
const of = (st, id) => { const r = JSON.parse(readFileSync(ROOT + `evidence/acceptance/${st}/${id}/result.json`, 'utf8')); const ds = r.designs || []; const c = s => ds.filter(d => d.presentation?.status === s).length;
  return { count: ds.length, ready: c('ready'), needsEdits: c('needs-edits'), hidden: c('hidden') + (r.hidden || []).length, alts: ds.map((d, i) => ({ alt: i + 1, pat: d.pat, status: d.presentation?.status, major: d.presentation?.major || [] })), shortfall_ar: r.shortfallReason || null }; };
const rows = CASES.map(C => ({ id: C.id, requested: C.want || 4, before: of(B, C.id), after: of(A, C.id) }));
const tot = k => ({ count: rows.reduce((s, r) => s + r[k].count, 0), ready: rows.reduce((s, r) => s + r[k].ready, 0), needsEdits: rows.reduce((s, r) => s + r[k].needsEdits, 0), hidden: rows.reduce((s, r) => s + r[k].hidden, 0) });
const out = { before: B, after: A, totals: { requested: rows.reduce((s, r) => s + r.requested, 0), before: tot('before'), after: tot('after') }, rows };
writeFileSync(ROOT + `evidence/acceptance/${A}/compare-${B}.json`, JSON.stringify(out, null, 1));
for (const r of rows) console.log(r.id, r.requested, `${r.before.count}/${r.before.ready}/${r.before.needsEdits}/${r.before.hidden}`, '→', `${r.after.count}/${r.after.ready}/${r.after.needsEdits}/${r.after.hidden}`);
console.log(JSON.stringify(out.totals));
