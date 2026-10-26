// (الجولة 21 — 02c/01b، أداة قياس وأدلة غير سلوكية) تشغيل حالة واحدة على نسخة محرك وحفظ مستنداتها لرسمها بـ scripts/acceptance-render.mjs:
//   node scripts/kit2-case.mjs <set> <id> --stage <اسم> [--root <نسخة المستودع>]
// يكتب evidence/acceptance/<stage>/<id>/alt-N.json (المعروض، والمحجوب إن وُجد: hidden-N.json لا يُرسم للعميل) وresult.json: حالة العرض،
// والأسباب المُهيكلة، وبنود المقاس من السجل (المقيس والصندوق والانحراف)، وفحوص الخصوصية/الضوء/التهوية، والإشعار. لا يشغّل H11–H15 ولا بذرة التقييم.
import { mkdirSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const [set, id] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (set === 'heldout3' || /^H1[1-5]$/.test(id || '')) throw Error('H11–H15 مختومة');
const here = new URL('../', import.meta.url).pathname, root = (opt('root') || here).replace(/\/$/, '') + '/', stage = opt('stage') || 'kit2';
const SETS = { main: ['scripts/acceptance-cases.mjs', 'CASES'], heldout: ['scripts/heldout-cases.mjs', 'HELDOUT'], heldout2: ['scripts/heldout2-cases.mjs', 'HELDOUT2'] };
const C = (await import(here + SETS[set][0]))[SETS[set][1]].find(c => c.id === id);
const { extractRequirements } = await import(root + 'dist/requirements.mjs');
const V3 = await import(root + 'dist/villa-layout-v3.mjs');
const { serialize } = await import(root + 'dist/draw/doc.mjs');
const CL = await import(root + 'dist/client-text.mjs');
let R16 = null; try { R16 = await import(root + 'dist/privacy-defects.mjs'); } catch { R16 = null; }
const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
const land = { floors: 1, ...C.land }, two = land.floors >= 2 || req.prefs?.floors === 2, keep = C.want || req.want || 4;
const dir = here + `evidence/acceptance/${stage}/${id}/`; mkdirSync(dir, { recursive: true });
let out = null, err = null; const t0 = Date.now();
try { out = (two ? V3.generateVillaTwoFloors : V3.generateVillaDesigns)({ land, counts: req.counts, requirements: req, keep, _cf: true }); } catch (e) { err = e; }
const row = { case: id, root, ms: Date.now() - t0, text: C.text, land, keep, understood: req.understood, unclear: req.unclear, designs: [] };
if (out) {
  out.designs.forEach((d, i) => {
    const name = d.presentation?.status === 'hidden' ? `hidden-${i + 1}.json` : `alt-${i + 1}.json`;
    writeFileSync(dir + name, serialize(d.doc));
    let priv = null; try { priv = R16 ? R16.measureR16(d.doc, { text: C.text, counts: req.counts, rules: req.rules || [] }).filter(g => /WINDOW|HALL_STREET/.test(g.id)).map(g => ({ id: g.id, pass: g.pass, applicable: g.applicable, value: g.value, reasons_ar: g.reasons_ar })) : null; } catch { priv = null; }
    row.designs.push({ file: name, pat: d.pat, status: d.presentation?.status, hidden_ar: d.presentation?.hidden_ar, hiddenReasons: d.presentation?.hiddenReasons, edits_ar: d.presentation?.edits_ar, notes_ar: d.presentation?.notes_ar,
      dims: (d.ledger || []).filter(x => x.kind === 'dims'), privacy: priv, acceptance: d.acceptance || null, rejections: d.rejections || null, notes: (d.notes || []).filter(n => /نافذة|جلسة|الخصوصية|حاجب/.test(n)) });
  });
  row.shortfall_ar = out.shortfall_ar || null; row.result = out.result || null; row.outcome = out.outcome || null;
  row.notice_ar = CL.shortfallNotice({ requested: keep, shown: out.designs.filter(d => d.presentation?.status !== 'hidden').length, shortfall_ar: out.shortfall_client_ar || out.shortfall_ar || '', hidden: out.hidden || [] });
} else {
  row.error = { code: err?.code || null, report_ar: err?.report_ar || null, result: err?.result || null, outcome: err?.outcome || null, message: String(err?.message || err).slice(0, 400) };
  row.notice_ar = CL.shortfallNotice({ requested: keep, shown: 0, report_ar: err?.report_ar || err?.message });
}
// إشعار العميل كصورة (acceptance-render يرسم notice.png من result.json)
if (row.notice_ar) row.notice = row.notice_ar;
writeFileSync(dir + 'result.json', JSON.stringify(row, null, 1));
console.log(JSON.stringify({ id, ms: row.ms, designs: row.designs.map(d => `${d.pat}:${d.status}`), error: row.error?.code || null, dims: row.designs.flatMap(d => d.dims.map(x => `${x.id}:${x.ok ? 'ok' : 'X'}:${x.actual ? x.actual.s + '×' + x.actual.l : ''}${x.envelope ? '/' + x.envelope.s + '×' + x.envelope.l : ''}`)) }));
