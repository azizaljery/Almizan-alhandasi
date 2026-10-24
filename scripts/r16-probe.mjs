// (الجولة السادسة عشرة) يطبّق قياسات العيوب الجديدة (privacy-defects.mjs) على مستندات مرحلة ويطبعها بجانب نتائج المراجع r15.
// الاستعمال: node scripts/r16-probe.mjs [stage=after-15]
import { readFileSync, existsSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { measureR16 } from '../dist/privacy-defects.mjs';
import { CASES } from './acceptance-cases.mjs';

const stage = process.argv[2] || 'after-15';
const V = JSON.parse(readFileSync(new URL('../docs/research/verdicts-r15.json', import.meta.url)));
for (const C of CASES) {
  for (let i = 1; i <= 6; i++) {
    const f = new URL(`../evidence/acceptance/${stage}/${C.id}/alt-${i}.json`, import.meta.url).pathname;
    if (!existsSync(f)) break;
    const doc = parseDoc(readFileSync(f, 'utf8'));
    const m = measureR16(doc, { text: C.text }).filter(g => g.applicable && !g.pass);
    const v = V.find(x => x.case === C.id && x.alt === i);
    console.log(`${C.id}-${i}`, '| rev:', v?.verdict, '| r16:', m.map(g => g.id).join(',') || '—');
    for (const g of m) console.log('     ', g.reasons_ar.join(' ؛ '));
    for (const fd of v?.findings || []) console.log('   R:', fd.tier, fd.text_ar.slice(0, 110));
  }
}
