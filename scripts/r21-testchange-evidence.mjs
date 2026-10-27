// (الجولة 21 — أدلة المراجعة، توثيق فقط) يقيس على المستندات المحفوظة نفسها ما غيّرته بوابة الدش واختبارات الخصوصية لكل فراغ في أحكام اختبارات r15/r19.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { showerGate } from '../dist/bath-shower.mjs';
import { planTests } from '../dist/plan-states.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { extractRequirements, applyLiteralReadings } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { CASES } from './acceptance-cases.mjs';
const root = new URL('../', import.meta.url).pathname, ev = (s, id, f) => parseDoc(readFileSync(`${root}evidence/acceptance/${s}/${id}/${f}`, 'utf8'));
const out = { r15: null, r19_c7: null, r19_all: [] };
{ const C6 = CASES.find(c => c.id === 'C6'), doc = ev('after-14', 'C6', 'alt-1.json'), a = presentationStatus({ doc, ledger: [], review: { passed: true } }, { text: C6.text }), b = presentationStatus({ doc, ledger: [], review: { passed: true } }, { text: C6.text, skipShower: true });
  out.r15 = { withShowerGate: { status: a.status, mandatory: a.mandatory, major: a.major }, skipShower: { status: b.status, mandatory: b.mandatory, major: b.major }, shower: showerGate(doc, analyzeDoc(doc)).failing }; }
{ const C = CASES.find(c => c.id === 'C7'), doc = ev('after-18', 'C7', 'alt-1.json'), st = presentationStatus({ doc, ledger: [] }, { text: C.text }); out.r19_c7 = { status: st.status, mandatory: st.mandatory, major: st.major, shower: showerGate(doc, analyzeDoc(doc)).failing }; }
const dir = id => `${root}evidence/acceptance/after-19/${id}/`;
for (const C of CASES) { if (!existsSync(dir(C.id) + 'result.json')) continue;
  const res = JSON.parse(readFileSync(dir(C.id) + 'result.json', 'utf8')), req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts }; const land = { floors: 1, ...C.land }; applyLiteralReadings(req, land);
  const rq = { text: C.text, counts: { ...C.counts, ...req.counts }, land, rules: req.rules || [] };
  res.designs.forEach((d, i) => { const doc = ev('after-19', C.id, d.file), ledger = verifyRequest(doc, req, { entry: land.entries[0] });
    const full = presentationStatus({ doc, ledger, review: d.review }, rq), noShower = presentationStatus({ doc, ledger, review: d.review }, { ...rq, skipShower: true });
    let tf = []; try { tf = planTests(doc).failing_ar; } catch {}
    if (full.status !== d.presentation.status) out.r19_all.push({ case: C.id, n: i + 1, saved: d.presentation.status, measured: full.status, withoutShowerGate: noShower.status, mandatory: full.mandatory, major: full.major, showerFails: showerGate(doc, analyzeDoc(doc)).failing.map(b => b.room + ' ' + b.widthM), planTestsFailing: tf });
  }); }
writeFileSync(root + 'docs/research/r21-acceptance-rework/flip/test-change-evidence.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.r15), JSON.stringify(out.r19_c7)); for (const r of out.r19_all) console.log(JSON.stringify(r));
