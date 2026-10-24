// (الجولة السابعة عشرة) ملاحظات التحسين لكل بديل معروض (ما فعله المولّد في هذا المخطط لهذه الأرض: المقهوي، أبواب الصالة، غرفة الملابس،
// المقلط، النوافذ، بيت درج السطح…) — من المولّد نفسه على حالات القبول. الاستعمال: node scripts/r17-notes.mjs [stage=after-17]
import { writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout-v2.mjs';
const stage = process.argv[2] || 'after-17', ROOT = new URL('../', import.meta.url).pathname, out = {};
const KEEP = /مقهوي|جلسة عائلية|غرفة الملابس|خزانة|مقلط|نافذة|بيت درج|المجلسين|«المجالس»|الماستر|الرئيسية|دورة مياه مشتركة|موقف|المواقف/;
for (const C of CASES) {
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = { floors: 1, ...C.land }, fn = land.floors >= 2 ? generateVillaTwoFloors : generateVillaDesigns;
  const o = fn({ land, counts: req.counts, requirements: req, keep: C.want || 4 });
  out[C.id] = o.designs.map((d, i) => ({ alt: i + 1, pat: d.pat, status: d.presentation?.status, pluralReading: !!d.pluralReading, notes_ar: (d.notes || []).filter(n => KEEP.test(n)) }));
  console.log(C.id, out[C.id].map(x => `${x.alt}:${x.notes_ar.length}`).join(' '));
}
writeFileSync(ROOT + `evidence/acceptance/${stage}/polish-notes.json`, JSON.stringify(out, null, 1));
