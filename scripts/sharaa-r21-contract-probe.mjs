// (قرار المالك 2026-10-31، أداة قياس غير سلوكية) رحلة شرعاء (حديث حر ← أعداد ← تأكيد العلاقات بأولويتها) ثم المحرك، على شيفرة dist مُمرَّرة،
// لمقارنة ما قبل إصلاح العقد وما بعده. الاستعمال: node scripts/sharaa-r21-contract-probe.mjs <مجلد-dist> <ملف-خرج.json>
import { writeFileSync } from 'node:fs';
const [dist, outFile] = process.argv.slice(2), imp = p => import('file://' + dist.replace(/\/$/, '') + '/' + p);
const { normalizeLand, generateInitialDesign } = await imp('home-flow.mjs');
const { verifyRequest } = await imp('rules.mjs'); const { briefOf } = await imp('shared-brief.mjs');
const B = await imp('sharaa/brief.mjs'); const { SharaFlow } = await imp('sharaa/flow.mjs'); const { classifyOutcome } = await imp('sharaa/alternatives.mjs');
const LAND = { length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 }, COUNTS = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
const CASES = [['door-majlis-dining', 'لازم باب مباشر بين المجلس والطعام'], ['door-opens', 'لازم المجلس يفتح على الطعام بباب مباشر'], ['door-majlis-hall', 'لازم المجلس بباب مباشر على الصالة'],
  ['maqlat-near', 'أبي مقلط قريب من المجلس'], ['maqlat-only', 'أبي مجلس رجال بمقلط'], ['maqlat-door', 'لازم المقلط بباب مباشر على المجلس'], ['count-6', 'أبي ستة تصاميم، ومجلس رجال'], ['count-2', 'أبي تصميمين فقط']];
const rows = [];
for (const [id, text] of CASES) {
  const f = new SharaFlow({ land: normalizeLand(LAND).land, mode: 'free' }); f.answer('free', text); f.answer('counts', COUNTS);
  for (const r of f.brief.relations) f.brief = B.decide(f.brief, 'relation:' + r.id, { priority: r.priority });
  const e = f.engineInput(), req = e.requirements, sb = briefOf(req), t0 = Date.now(); let out = null, err = null;
  try { out = await generateInitialDesign({ land: e.land, rooms: e.rooms, discovery: e.discovery, idea: e.idea, counts: e.counts, requirements: req }); } catch (x) { err = { code: x.code || '', msg: String(x.message).slice(0, 160) }; }
  const alts = out?.alternatives || [], shown = alts.filter(a => a.presentation?.status !== 'hidden');
  const door = shown.map(a => verifyRequest(a.doc, req, { entry: 'n' }).filter(x => /باب مباشر/.test(x.text || '')).map(x => x.ok));
  const oc = classifyOutcome(err ? Object.assign(new Error(err.msg), { code: err.code }) : out, f.brief);
  const r = { id, text, secs: (Date.now() - t0) / 1000, counts: e.counts, want: req.want ?? null, contract: sb.relations.map(x => `${x.kind}:${x.level}${x.directDoor ? ':' + x.directDoor : ''}`), sbOrigin: sb.origin || null,
    rules: req.rules.map(x => `${x.kind}:${x.a}-${x.b}${x.door ? ':door' : ''}:${x.level}`), err, alts: alts.length, shown: shown.length, ready: shown.filter(a => a.presentation?.status === 'ready').length,
    requested: out?.alternativesInfo?.requested ?? null, shortfall: out?.alternativesInfo?.shortfall_ar || null, door, outcome: oc.kind, outcomeDetail: (oc.detail_ar || []).slice(0, 2).map(s => String(s).slice(0, 160)),
    hidden: alts.filter(a => a.presentation?.status === 'hidden').map(a => String((a.presentation.hidden_ar || [])[0] || '').slice(0, 140)) };
  rows.push(r); console.log(JSON.stringify({ id, contract: r.contract, counts: r.counts.dining, want: r.want, alts: r.alts, shown: r.shown, ready: r.ready, requested: r.requested, door, outcome: r.outcome, err: err?.code, secs: r.secs }));
  writeFileSync(outFile, JSON.stringify(rows, null, 1));
}
