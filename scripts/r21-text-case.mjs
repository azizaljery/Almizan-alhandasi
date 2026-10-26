// (الجولة 21 — حزمة القبول، أداة قياس) تشغيل نص طلب حر على أرض معلنة وطباعة بدائله وبنود المقاس منها (المقيس الصافي والصندوق والانحراف).
//   node scripts/r21-text-case.mjs "<النص>" --w 20 --l 28 [--street s] [--want 3] [--root <نسخة المحرك>]
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const text = argv[0], root = (opt('root', new URL('../', import.meta.url).pathname)).replace(/\/$/, '') + '/';
const { extractRequirements } = await import(root + 'dist/requirements.mjs'), E = await import(root + 'dist/villa-layout-v3.mjs');
const land = { width: Number(opt('w', 20)), length: Number(opt('l', 28)), streets: [opt('street', 's')], entries: [opt('street', 's')], floors: 1 };
const req = extractRequirements(text, { counts: JSON.parse(opt('counts', '{}')) }); req.counts = { ...req.counts, ...JSON.parse(opt('counts', '{}')) };
let o; try { o = E.generateVillaDesigns({ land, counts: req.counts, requirements: req, keep: Number(opt('want', 3)), _cf: true }); } catch (e) { console.log(JSON.stringify({ error: e.code, msg: String(e.message).slice(0, 300), report: String(e.report_ar || '').slice(0, 300) })); process.exit(0); }
console.log(JSON.stringify({ understood: req.understood, designs: o.designs.map(d => ({ pat: d.pat, status: d.presentation?.status, dims: (d.ledger || []).filter(x => x.kind === 'dims').map(x => ({ id: x.id, text: x.text, ok: x.ok, actual: x.actual, envelope: x.envelope, want: x.want, tol: x.tol, deviation: x.deviation, failing: x.failing })), hidden: d.presentation?.hidden_ar })) }, null, 1));
