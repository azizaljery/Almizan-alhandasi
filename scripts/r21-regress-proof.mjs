// (الجولة 21 — 02c-rework، قرار المالك 2026-10-26 البند 6، أداة قياس) إثبات هندسي لاستبعاد بديل: يُولَّد طلب التطوير على نسخة محرك قديمة، ثم يُقاس مطبخ كل
// بديل بأداة الأضيق (clear-dims) من نسخة العمل: الصندوق، المستطيل الصافي الأضيق، والانحراف عن المطلوب. لا يعدّل شيئًا.
//   node scripts/r21-regress-proof.mjs R20 --root /home/claude/wt-preview --out evidence/r21-regress/R20-old.json [--want 4x4]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { casesFor } from './coverage-r21.mjs';
import { measureClearDims, toleranceFor } from '../dist/clear-dims.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const id = argv[0], root = opt('root', new URL('../', import.meta.url).pathname).replace(/\/$/, '') + '/', out = opt('out', null), [ws, wl] = opt('want', '4x4').split('x').map(Number), roomRe = new RegExp(opt('room', '^المطبخ'));
const C = casesFor('dev', 40).find(c => c.id === id);
const { extractRequirements } = await import(root + 'dist/requirements.mjs'), E = await import(root + 'dist/villa-layout-v3.mjs');
const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
const o = E.generateVillaDesigns({ land: C.land, counts: req.counts, requirements: req, keep: C.want, _cf: true });
const tol = toleranceFor('default');
const rows = o.designs.map(d => {
  const lv = analyzeDoc(d.doc).levels[0], room = lv.rooms.find(r => roomRe.test(r.name)), m = room ? measureClearDims(room, { s: ws, l: wl }, tol) : null;
  return { pat: d.pat, status: d.presentation?.status, kitchen: room ? { name: room.name, net_area: room.area, ...(m && { envelope: m.envelope, clear: m.clear, deviation: m.deviation, narrowing: m.narrowing, envelopeOK: m.envelopeOK, clearOK: m.clearOK, ok: m.ok }) } : null, doc: d.doc };
});
const summary = rows.map(({ doc, ...r }) => r);
console.log(JSON.stringify({ id, text: C.text, root, tol, designs: summary }, null, 1));
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ id, text: C.text, root, tol, designs: summary }, null, 1)); for (const r of rows) writeFileSync(out.replace(/\.json$/, `-${r.pat.replace(/[^\w]/g, '_')}.json`), JSON.stringify(r.doc)); }
