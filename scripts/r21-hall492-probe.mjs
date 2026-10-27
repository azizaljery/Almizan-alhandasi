// (الجولة 21 — أدلة المراجعة، توثيق فقط) محاولة أخيرة لإعادة إنتاج «صالة 5×7 بالضبط» (أضيق موضع 4.92 م) المسجلة في review-02c.md §4. النص الأصلي غير محفوظ: تُجرَّب صيغ معقولة على الأراضي الثلاث المذكورة.
import { extractRequirements } from '../dist/requirements.mjs'; import * as V3 from '../dist/villa-layout-v3.mjs';
const roots = process.argv[2] || '';
const lands = [[22, 30], [24, 32], [24, 30]];
const texts = ['دور واحد، 3 غرف نوم، مجلس 5×6، المطبخ 4×5، صالة 5×7 بالضبط', 'دور واحد، 4 غرف نوم، مجلس 6×5، مطبخ 4×4، صالة 5×7 بالضبط', 'دور واحد، 3 غرف نوم، مجلس 5×6 ومطبخ 4×5 وصالة 5×7 بالضبط'];
const rows = [];
for (const [w, l] of lands) for (const text of texts) {
  const beds = /4 غرف/.test(text) ? 4 : 3, counts = { bedrooms: beds, majlis: 1, baths: beds + 1, kitchens: 1, halls: 1, dining: 1 }, land = { floors: 1, width: w, length: l, streets: ['s'], entries: ['s'] }, req = extractRequirements(text, { counts }); req.counts = { ...req.counts, ...counts }; let out, err = null;
  try { out = V3.generateVillaDesigns({ land, counts: req.counts, requirements: req, keep: 4, _cf: true }); } catch (e) { err = e.code || String(e.message).slice(0, 80); }
  rows.push({ land: `${w}×${l}`, text, error: err, designs: (out?.designs || []).map(d => ({ pat: d.pat, status: d.presentation?.status, hall: (d.ledger || []).filter(x => x.kind === 'dims').map(x => ({ t: x.text, want: x.want, tol: x.tol, actual: x.actual, envelope: x.envelope, ok: x.ok })) })) });
  console.log(JSON.stringify(rows[rows.length - 1]).slice(0, 700));
}
import { writeFileSync } from 'node:fs'; writeFileSync(new URL('../docs/research/r21-acceptance-rework/flip/hall-5x7-probe.json', import.meta.url).pathname, JSON.stringify(rows, null, 1));
