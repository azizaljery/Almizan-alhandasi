// (الجولة 21 — حزمة القبول، أداة قياس) تشغيل طلب واحد من عينة التطوير (dev seed فقط، لا eval) على نسخة محرك، وطباعة بدائله وحالاتها وملاحظاتها.
//   node scripts/r21-dev-case.mjs R35 --root /home/claude/wt-preview
import { casesFor } from './coverage-r21.mjs';
const argv = process.argv.slice(2), id = argv[0], root = (argv[argv.indexOf('--root') + 1] || new URL('../', import.meta.url).pathname).replace(/\/$/, '') + '/';
if (!/^R\d+$/.test(id)) throw Error('معرّف طلب من عينة التطوير فقط (Rn)');
const C = casesFor('dev', 40).find(c => c.id === id);
const { extractRequirements } = await import(root + 'dist/requirements.mjs'), E = await import(root + 'dist/villa-layout-v3.mjs');
const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
const two = C.land.floors >= 2 || req.prefs?.floors === 2, o = (two ? E.generateVillaTwoFloors : E.generateVillaDesigns)({ land: C.land, counts: req.counts, requirements: req, keep: C.want, _cf: true });
console.log(JSON.stringify({ id, text: C.text, land: C.land, designs: o.designs.map(d => ({ pat: d.pat, status: d.presentation?.status, edits: d.presentation?.edits_ar, hidden: d.presentation?.hidden_ar, notes: d.presentation?.notes_ar })) }, null, 1));
