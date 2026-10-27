// (الجولة 21 — 02c، قرار المالك 2026-10-26) قياس C6 قبل/بعد على مستندات ناتجة من scripts/kit2-case.mjs: المقاسات، الخصوصية (خطوط الرؤية بارتفاعات
// العين، مع الساتر وبدونه)، الإضاءة، التهوية، حركة المواقف والمداخل، وفحص عنصر الموقع. لا يعدّل شيئًا ولا يشغّل بذرة التقييم.
//   node scripts/c6-site-measure.mjs <stage> [<stage>...]   → evidence/c6-site/<stage>.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { windowExposure, acceptanceSnapshot } from '../dist/privacy-gate.mjs';
import { siteElementReport } from '../dist/site-element-check.mjs';
import { measureR16 } from '../dist/privacy-defects.mjs';
const here = new URL('../', import.meta.url).pathname;
mkdirSync(here + 'evidence/c6-site', { recursive: true });
for (const stage of process.argv.slice(2)) {
  const dir = here + `evidence/acceptance/${stage}/C6/`, res = JSON.parse(readFileSync(dir + 'result.json', 'utf8')), out = { stage, case: 'C6', root: res.root, designs: [] };
  for (const d of res.designs) {
    const doc = JSON.parse(readFileSync(dir + d.file, 'utf8')), bare = JSON.parse(JSON.stringify(doc)); bare.walls = bare.walls.filter(w => w.kind !== 'fence');
    const exposure = {};
    for (const [label, dd] of [['withScreen', doc], ['withoutScreen', bare]]) {
      const G = analyzeDoc(dd).levels[0], bays = (dd.zones || []).filter(z => z.type === 'garage' && z.level === G.level.id), rows = [];
      for (const op of G.openings.filter(o => o.window)) {
        const side = op.sides.find(s => s.other === 'outside'); if (!side || (op.o?.sill ?? 0) >= 1.6) continue;
        const e = windowExposure(dd, G, op, side, bays);
        if (e.paths.length || label === 'withScreen') rows.push({ opening: op.id, room: side.room.name, sill: op.o?.sill ?? 0, head: (op.o?.sill ?? 0) + (op.o?.h ?? 1.2), exposedLines: e.paths.length, samples: e.samples, eyes: e.eyes });
      }
      exposure[label] = rows.filter(r => r.exposedLines > 0 || label === 'withScreen').map(r => r);
    }
    const snap = acceptanceSnapshot(doc), by = {};
    for (const [k, c] of Object.entries(snap.checks)) { const g = by[c.category] ||= { pass: 0, fail: 0, failed: [] }; if (c.passed) g.pass++; else { g.fail++; g.failed.push(k + (c.why ? ' — ' + c.why : '')); } }
    let r16 = []; try { r16 = measureR16(doc, { text: res.text, counts: {}, rules: [] }).filter(g => /WINDOW_PARKING|HALL_STREET|BATH_NO_WINDOW/.test(g.id)).map(g => ({ id: g.id, pass: g.pass, applicable: g.applicable, reasons_ar: g.reasons_ar, value: g.value })); } catch { /* */ }
    const G = analyzeDoc(doc).levels[0], bays = (doc.zones || []).filter(z => z.type === 'garage');
    out.designs.push({ file: d.file, pat: d.pat, status: d.status, dims: d.dims.map(x => ({ id: x.id, ok: x.ok, actual: x.actual, envelope: x.envelope, want: x.want, tol: x.tol, deviation: x.deviation })),
      privacy: { exposure, r16 }, acceptance: by, parking: { bays: bays.length, polygons: bays.map(z => z.polygon) }, fences: (doc.walls || []).filter(w => w.kind === 'fence').map(w => ({ id: w.id, a: w.a, b: w.b, h: w.h })),
      site: siteElementReport(doc), edits_ar: d.edits_ar, notes_ar: d.notes_ar, hidden_ar: d.hidden_ar, label_ar: d.label_ar ?? null, regulatory_ar: d.regulatory_ar ?? null });
  }
  writeFileSync(here + `evidence/c6-site/${stage}.json`, JSON.stringify(out, null, 1)); console.log(stage, out.designs.map(x => `${x.status} bays=${x.parking.bays} fences=${x.fences.length}`).join(' | '));
}
