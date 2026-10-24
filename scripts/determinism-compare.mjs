// (الجولة العشرون) الحتمية: مقارنة sha256 لكل مستند JSON (البدائل ومستندات التعديل ومقترحاته) بين تشغيلين مستقلين لـ acceptance-run.
// الاستعمال: node scripts/determinism-compare.mjs <مرحلة1> <مرحلة2> [--out evidence/acceptance/<مرحلة1>/determinism.json]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const argv = process.argv.slice(2), oi = argv.indexOf('--out'), pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
const [A, B] = pos, ROOT = new URL('../evidence/acceptance/', import.meta.url).pathname;
const OUT = oi >= 0 ? argv[oi + 1] : `evidence/acceptance/${A}/determinism.json`;
const SKIP = /^(result|captions|summary|experiments)\.json$/;
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const rows = []; let same = 0, diff = 0;
for (const c of readdirSync(ROOT + A).filter(d => statSync(ROOT + A + '/' + d).isDirectory()).sort()) {
  const walk = (rel) => { for (const f of readdirSync(ROOT + A + '/' + c + rel).sort()) { const p = c + rel + '/' + f; if (statSync(ROOT + A + '/' + p).isDirectory()) { walk(rel + '/' + f); continue; }
    if (!f.endsWith('.json') || SKIP.test(f)) continue; const ok = existsSync(ROOT + B + '/' + p) && sha(ROOT + A + '/' + p) === sha(ROOT + B + '/' + p); ok ? same++ : diff++; rows.push([c, (rel + '/' + f).replace(/^\//, ''), ok]); } };
  walk('');
}
const out = { note: `تشغيلان مستقلان لـ acceptance-run (${A} و${B}) — مقارنة sha256 لكل مستند (البدائل ومستندات التعديل ومقترحاته)`, same, diff, rows };
writeFileSync(new URL('../' + OUT, import.meta.url).pathname, JSON.stringify(out, null, 1));
console.log(`same ${same} diff ${diff}`); for (const r of rows.filter(r => !r[2])) console.log('DIFF', r[0], r[1]);
