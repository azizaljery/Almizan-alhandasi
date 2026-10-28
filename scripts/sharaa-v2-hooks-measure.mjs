// قياس: ضغط «موقف موازٍ» ثم «فصل المجلس عن الطعام» على المحرك الحقيقي (أرض طول×عرض من الوسيطين).
import { normalizeLand, generateInitialDesign } from '../dist/home-flow.mjs';
import { SharaFlow } from '../dist/sharaa/flow.mjs';
import { classifyOutcome, buildAlternatives, retryWith } from '../dist/sharaa/alternatives.mjs';
const [length, width] = process.argv.slice(2).map(Number);
const land = normalizeLand({ length, width, streets: ['n'], entries: ['n'], floors: 1 }).land;
const f = new SharaFlow({ land, mode: 'guided' }); f.answer('counts', { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 0 });
const gen = x => generateInitialDesign({ land: x.land, rooms: x.rooms, discovery: x.discovery, idea: x.idea, counts: x.counts, requirements: x.requirements });
let brief = f.brief; const steps = [];
let out = await gen(f.engineInput()).catch(e => e); let oc = classifyOutcome(out, brief); steps.push({ step: 'بدون ضغط', outcome: oc.kind, reasons: (oc.detail_ar || []).map(s => s.slice(0, 110)) });
for (const id of ['accept_parallel_parking', 'majlis_separate_dining']) {
  if (oc.kind === 'SOLVED') break;
  const alts = buildAlternatives(brief, oc); if (![...alts.needsConsent].some(o => o.id === id)) { steps.push({ step: id, skipped: 'غير معروض لهذا السبب' }); continue; }
  const r = await retryWith(brief, alts, id, gen, { consent: true }); brief = r.brief; oc = r.outcome; steps.push({ step: id, outcome: oc.kind, reasons: (oc.detail_ar || []).map(s => s.slice(0, 110)) });
}
console.log(JSON.stringify({ land: `طول ${length} (شمال/جنوب) × عرض ${width} (شرق/غرب)`, steps }, null, 1));
