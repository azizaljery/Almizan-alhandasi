// يقارن بصمات مخرجات المحرك (SHA-256 دون حقول الزمن) بين مرجع f8e1844 (= dea4f46، matrix2/merged.json) وهذا الفرع
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')));
const A = new Map(a.map(r => [r.id, r])); let same = 0, diff = [];
for (const r of b) { const o = A.get(r.id); if (o && o.sha === r.sha) same++; else diff.push(r.id); }
console.log(`مطابق بايتًا: ${same} من ${b.length}؛ مختلف: ${diff.join(',') || 'لا شيء'}؛ غائب عن المرجع: ${a.filter(r => !b.some(x => x.id === r.id)).map(r => r.id).join(',') || 'لا شيء'}`);
process.exit(diff.length || b.length !== a.length ? 1 : 0);
