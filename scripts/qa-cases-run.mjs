// تشغيل مجموعة الحالات الثابتة (tests/fixtures/qa-cases.json) على المحركات: legacy وhybrid وreference.
// قياس صادق: لا يعدّل المحركين. الاستعمال: node scripts/qa-cases-run.mjs <outdir> [id1,id2,...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = p => import(path.join(ROOT, 'dist', p));
const out = process.argv[2] || '/tmp/claude-0/work/qa9/out', only = (process.argv[3] || '').split(',').filter(Boolean);
const V = await D('villa-layout.mjs'), { buildBrief } = await D('shara/brief-engine.mjs');
const { reviewDesign } = await D('design-review.mjs'), { parseDoc } = await D('draw/doc.mjs');
const { designSignature, signatureSimilarity } = await D('design-signature.mjs');
const { generateInitialDesign, diagnoseFit } = await D('home-flow.mjs');
const { defectsOfDoc } = await import(path.join(ROOT, 'tests/helpers/qa-defects.mjs'));
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/qa-cases.json'), 'utf8'));
const ENGINES = ['legacy', 'hybrid', 'reference'];
const doc0 = d => (typeof d === 'string' ? d : JSON.stringify(d));
const reserved = [];
for (const f of ['flow-30x20-doc.json', 'flow-court-doc.json', 'mobile-villa-b1.json', 'mobile-villa-b2.json']) {
  try { reserved.push({ f, sig: designSignature(parseDoc(fs.readFileSync(path.join(ROOT, 'tests/fixtures', f), 'utf8'))) }); } catch { /* غير صالح للبصمة */ }
}
const rows = [];
for (const c of fx.cases) {
  if (only.length && !only.includes(c.id)) continue;
  const b = buildBrief(c.text, { land: c.land });
  const row = { id: c.id, group: c.group, conflict: !!c.conflict, engines: {} };
  const firstDocs = {};
  for (const eng of ENGINES) {
    fs.mkdirSync(`${out}/${eng}`, { recursive: true });
    const req = { ...b.requirements, tweaks: { ...(b.requirements.tweaks || {}), engine: eng } };
    const args = { land: c.land, counts: b.counts, requirements: req, keep: 5 };
    const t0 = Date.now(); let r = null, err = null;
    try { r = c.land.floors === 2 ? V.generateVillaTwoFloors(args) : V.generateVillaDesigns(args); } catch (e) { err = { code: e.code || 'ERR', message: String(e.message || e).slice(0, 300) }; }
    const ds = r ? r.designs : [];
    const E = { n: ds.length, ms: Date.now() - t0, err, engineTag: r?.engine || null, modes: ds.map(d => d.refId || d.mode), designs: [] };
    const sigs = [], macros = [];
    for (const [i, d] of ds.entries()) {
      const key = `${c.id}_${i + 1}`; fs.writeFileSync(`${out}/${eng}/${key}.json`, doc0(d.doc));
      const doc = parseDoc(doc0(d.doc)); const X = { i: i + 1, mode: d.refId || d.mode };
      try {
        const rep = reviewDesign(doc, { requirements: b.requirements, land: c.land, entry: c.land.entries[0] });
        const mand = rep.findings.filter(f => f.severity === 'mandatory');
        X.mandViolated = mand.filter(f => f.state === 'violated').map(f => f.id);
        X.mandUnverified = mand.filter(f => f.state === 'unverified').map(f => f.id);
        X.mandVerified = mand.filter(f => f.state === 'verified').length;
        X.reqViolated = mand.filter(f => f.source === 'request' && f.state === 'violated').map(f => f.title);
        X.reqUnverified = mand.filter(f => f.source === 'request' && f.state === 'unverified').map(f => f.title);
        X.reqTotal = mand.filter(f => f.source === 'request').length;
        X.verdict = rep.summary?.verdict; X.allMandatoryMet = !X.mandViolated.length;
        X.requestMet = !X.reqViolated.length && !X.reqUnverified.length;
      } catch (e) { X.reviewError = String(e.message || e).slice(0, 160); }
      try { const df = defectsOfDoc(doc, { maid: c.extras.maid, driver: c.extras.driver }); X.defects = Object.fromEntries(Object.entries(df.codes).map(([k, v]) => [k, v.length])); X.defectEx = Object.fromEntries(Object.entries(df.codes).map(([k, v]) => [k, v.slice(0, 2)])); X.maxWalk = df.maxWalk; X.circ = df.circ; } catch (e) { X.defectError = String(e.message || e).slice(0, 120); }
      try { sigs.push(designSignature(doc)); } catch { sigs.push(null); }
      try { macros.push(V.macroSig(JSON.parse(doc0(d.doc)))); } catch { macros.push(null); }
      E.designs.push(X);
      if (i === 0) firstDocs[eng] = { doc, sig: sigs[0] };
    }
    // تنوع التكوين: عناقيد بالبصمة (نسخة=copy) وبالهيكل الكلي (macroSim > الحد المريح 0.7)
    const keptS = [], keptM = []; let maxWhole = 0, maxMacro = 0;
    sigs.forEach((s, i) => {
      if (s) { if (keptS.every(k => !signatureSimilarity(k, s).copy)) keptS.push(s); for (let j = 0; j < i; j++) if (sigs[j]) maxWhole = Math.max(maxWhole, signatureSimilarity(sigs[j], s).whole); }
      const m = macros[i]; if (m) { if (keptM.every(k => V.macroSim(k, m) <= V.MACRO_LIMIT.relaxed)) keptM.push(m); for (let j = 0; j < i; j++) if (macros[j]) maxMacro = Math.max(maxMacro, V.macroSim(macros[j], m)); }
    });
    E.distinctSig = keptS.length; E.distinctMacro = keptM.length; E.maxWhole = +maxWhole.toFixed(2); E.maxMacro = +maxMacro.toFixed(2);
    E.vsReservedCopy = 0; E.vsReservedMax = 0;
    for (const s of sigs) if (s) for (const rs of reserved) { try { const q = signatureSimilarity(s, rs.sig); if (q.copy) E.vsReservedCopy++; E.vsReservedMax = Math.max(E.vsReservedMax, +q.whole.toFixed(2)); } catch { /* يتخطى */ } }
    E.metDesigns = E.designs.filter(x => x.allMandatoryMet && x.requestMet).length;
    E.requestMetDesigns = E.designs.filter(x => x.requestMet).length;
    row.engines[eng] = E;
  }
  // تشابه عبر المحركين (أول تصميم لكل محرك)
  row.cross = {};
  for (const [a, bb] of [['legacy', 'hybrid'], ['legacy', 'reference']]) if (firstDocs[a]?.sig && firstDocs[bb]?.sig) { const q = signatureSimilarity(firstDocs[a].sig, firstDocs[bb].sig); row.cross[`${a}~${bb}`] = { whole: +q.whole.toFixed(2), copy: q.copy }; }
  // سلوك «الشرح بدل التعديل الصامت» على مستوى الموقع (generateInitialDesign) لكل محرك
  row.site = {};
  if (c.conflict || process.env.SITE_ALL) for (const eng of ['legacy', 'hybrid']) {
    const req = { ...b.requirements, tweaks: { ...(b.requirements.tweaks || {}), engine: eng } };
    const base = { land: c.land, rooms: [], discovery: b.discovery, idea: c.text, counts: b.counts, requirements: req };
    const S = { strictThrows: null, default: null };
    try { await generateInitialDesign({ ...base, strict: true }); S.strictThrows = false; } catch (e) { S.strictThrows = { code: e.code || 'ERR', message: String(e.message || e).slice(0, 260) }; }
    try {
      const r = await generateInitialDesign({ ...base });
      const doc = parseDoc(doc0(r.doc)); const rep = reviewDesign(doc, { requirements: b.requirements, land: c.land, entry: c.land.entries[0] });
      S.default = { ok: true, fitApplied: (r.fit?.applied || []).map(x => (typeof x === 'string' ? x : `${x.id}${x.to !== undefined ? ':' + x.to : ''}`)), fitAppliedRaw: JSON.stringify(r.fit?.applied || []).slice(0, 600), floorsAsked: r.fit?.asked?.floors ?? c.land.floors, floorsGot: rep.levels?.length ?? doc.levels.length, gotBedrooms: doc.labels.filter(l => l.type === 'bedroom' || l.type === 'master').length, gotMajlis: doc.labels.filter(l => l.type === 'majlis').length, askedBedrooms: c.counts.bedrooms, askedMajlis: c.counts.majlis, hasFitStatement: !!r.fit, notes: (r.notes || []).slice(0, 2).map(s => s.slice(0, 160)), requestViolatedOnOriginal: rep.findings.filter(f => f.source === 'request' && f.severity === 'mandatory' && f.state === 'violated').map(f => f.title), alternatives: r.alternatives?.length || 0 };
      fs.mkdirSync(`${out}/site_${eng}`, { recursive: true }); fs.writeFileSync(`${out}/site_${eng}/${c.id}.json`, doc0(r.doc));
    } catch (e) { S.default = { ok: false, code: e.code || 'ERR', message: String(e.message || e).slice(0, 300) }; }
    if (S.strictThrows) { try { const dg = await diagnoseFit({ land: c.land, counts: b.counts, discovery: b.discovery, idea: c.text, engine: eng === 'legacy' ? 'legacy' : 'auto' }); S.diagnose = { options: dg.options.map(o => ({ kind: o.kind, label: o.label, ok: o.ok })), facts: { net: dg.facts.net, required: Math.round(dg.facts.required), share: +dg.facts.share.toFixed(2) } }; } catch (e) { S.diagnose = { error: String(e.message || e).slice(0, 120) }; } }
    row.site[eng] = S;
  }
  rows.push(row);
  console.log(c.id.padEnd(20), ENGINES.map(e => `${e}:${row.engines[e].n}/${row.engines[e].metDesigns}${row.engines[e].err ? '!' + row.engines[e].err.code : ''}`).join(' '));
}
fs.writeFileSync(`${out}/results${only.length ? '-part' : ''}.json`, JSON.stringify({ version: 'qa-run/1', rows }, null, 1));
