// قياس حقيقي لشرعاء V2: يمرّ الحوار بالتسلسل ثم يستدعي generateInitialDesign الحقيقي. الخرج JSON.
import { normalizeLand, generateInitialDesign } from '../dist/home-flow.mjs';
import { SharaFlow } from '../dist/sharaa/flow.mjs';
import { classifyOutcome, buildAlternatives, retryWith, OUTCOME } from '../dist/sharaa/alternatives.mjs';
const [length, width, kind] = process.argv.slice(2);
const land = normalizeLand({ length: +length, width: +width, streets: ['n'], entries: ['n'], floors: 1 }).land;
const f = new SharaFlow({ land, mode: 'guided' });
const questions = f.log.map(m => m.text || m.key).filter(Boolean);
const counts = kind === 'big' ? { bedrooms: 6, majlis: 2, baths: 6, kitchens: 2, halls: 2, dining: 1 } : { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 0 };
f.answer('counts', counts);
const asked = f.log.slice(questions.length).map(m => `${m.kind || 'msg'}${m.key ? ':' + m.key : ''} — ${(m.text || '').slice(0, 90)}`);
const eng = f.engineInput(); const t0 = Date.now(); let out, err;
try { out = await generateInitialDesign({ land: eng.land, rooms: eng.rooms, discovery: eng.discovery, idea: eng.idea, counts: eng.counts, requirements: eng.requirements }); } catch (e) { err = e; }
const oc = classifyOutcome(err || out, f.brief);
const alts = buildAlternatives(f.brief, oc);
const pressed = [];
if (process.env.APPLY) for (const o of alts.auto) { const t1 = Date.now(); const r = await retryWith(f.brief, alts, o.id, x => generateInitialDesign({ land: x.land, rooms: x.rooms, discovery: x.discovery, idea: x.idea, counts: x.counts, requirements: x.requirements })); pressed.push({ pressed: o.label, outcome: r.outcome.kind, detail: (r.outcome.detail_ar || []).map(x => String(x).slice(0, 160)), seconds: (Date.now() - t1) / 1000 }); }
console.log(JSON.stringify({ pressed, land: { length: +length, width: +width, note: 'الطول=شمال/جنوب، العرض=شرق/غرب', areaM2: +length * +width, entrance: 'شمال' }, program: kind, counts, readiness: f.readiness().state, asked, outcome: oc.kind, detail: oc.detail_ar, errorMessage: err?.message?.slice(0, 200), shown: oc.shown, alternatives: { auto: alts.auto.map(o => o.label), needsConsent: alts.needsConsent.map(o => o.label), info: alts.info.map(o => o.label) }, seconds: (Date.now() - t0) / 1000 }, null, 1));
