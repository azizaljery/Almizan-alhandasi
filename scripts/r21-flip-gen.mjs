// (الجولة 21 — أدلة المراجعة، توثيق فقط) يولّد بدائل حالة على نسختي محرك (قبل/بعد) ويحفظ مستنداتها وحالاتها لمقارنة التراجعات.
//   node scripts/r21-flip-gen.mjs <set|dev> <id> --root <نسخة> --tag before|after
import { mkdirSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const [set, id] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (/^H1[1-5]$/.test(id) || set === 'heldout3') throw Error('H11–H15 مختومة');
const here = new URL('../', import.meta.url).pathname, root = opt('root').replace(/\/$/, '') + '/', tag = opt('tag');
let C;
if (set === 'dev') C = (await import(here + 'scripts/coverage-r21.mjs')).casesFor('dev', 40).find(c => c.id === id);
else { const S = { main: ['acceptance-cases.mjs', 'CASES'], heldout: ['heldout-cases.mjs', 'HELDOUT'], heldout2: ['heldout2-cases.mjs', 'HELDOUT2'] }[set]; C = (await import(here + 'scripts/' + S[0]))[S[1]].find(c => c.id === id); }
const { extractRequirements } = await import(root + 'dist/requirements.mjs'), V3 = await import(root + (process.env.FLIP_V2 ? 'dist/villa-layout-v2.mjs' : 'dist/villa-layout-v3.mjs')), { serialize } = await import(root + 'dist/draw/doc.mjs');
const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts }; const TAGSUF = process.env.FLIP_V2 ? '-v2' : '';
const land = { floors: 1, ...C.land }, two = land.floors >= 2 || req.prefs?.floors === 2, keep = C.want || req.want || 4;
const dir = here + `docs/research/r21-acceptance-rework/flip/${id}/`; mkdirSync(dir, { recursive: true });
const out = (two ? V3.generateVillaTwoFloors : V3.generateVillaDesigns)({ land, counts: req.counts, requirements: req, keep: process.env.FLIP_V2 ? 4 : keep, _cf: true });
const rows = out.designs.map((d, i) => { const f = `${tag}${TAGSUF}-${i + 1}-${String(d.pat).replace(/[^\w:-]/g, '_')}.json`; writeFileSync(dir + f, serialize(d.doc));
  return { file: f, pat: d.pat, status: d.presentation?.status, edits_ar: d.presentation?.edits_ar, hidden_ar: d.presentation?.hidden_ar, notes_ar: d.presentation?.notes_ar }; });
writeFileSync(dir + `${tag}${TAGSUF}.json`, JSON.stringify({ id, text: C.text, land, root, rows }, null, 1));
console.log(id, tag, rows.map(r => `${r.pat}:${r.status}`).join(' | '));
