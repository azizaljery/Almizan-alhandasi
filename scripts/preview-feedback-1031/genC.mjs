const D = process.argv[2] || '/tmp/claude-0/-home-claude/cc220171-1914-572f-b744-f8e0d2357b91/scratchpad/wt-fb/dist';
const B = await import(D + '/sharaa/brief.mjs');
const { SharaFlow } = await import(D + '/sharaa/flow.mjs');
const { normalizeLand, generateInitialDesign } = await import(D + '/home-flow.mjs');
const { createSession, ledgerFor } = await import(D + '/design-session.mjs');
const text = process.argv[3] || 'أبي ثلاث غرف نوم وأربع دورات مياه ومجلس رجال بمدخل مستقل ومقلط، ولازم مجلس الرجال بباب مباشر على غرفة الطعام، وغرفة كبار السن قريبة من الصالة، ومطبخ مفتوح على الصالة';
const pri = process.argv[4] || 'suggested';
const { land } = normalizeLand({ length: +(process.env.LL||18), width: +(process.env.LW||30), streets: ['n'], entries: ['n'], floors: 1 });
const f = new SharaFlow({ land }); f.start(); f.answer('mode', 'free'); let out = f.answer('free', text);
for (let i = 0; i < 30; i++) {
  const q = out[out.length - 1]; if (!q?.kind) break;
  if (q.kind === 'counts') out = f.answer('counts', { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 });
  else if (q.kind === 'confirm_items') { const dec = {}; for (const it of q.items) dec[it.ref] = pri === 'suggested' ? (it.suggested || 'preferred') : pri; out = f.answer('ask', { key: 'confirm', value: { decisions: dec } }); }
  else if (q.kind === 'choice' && q.id === 'ask') { const pick = { guest_entrance: 'must', elderly: 'yes' }[q.key] ?? q.options[q.options.length - 1].id; out = f.answer('ask', { key: q.key, value: pick }); }
  else if (q.kind === 'household') out = f.answer('ask', { key: 'household', value: { currentMembers: 5, picked: ['seniors'] } });
  else if (q.kind === 'multi') out = f.answer('ask', { key: q.key, value: [] });
  else break;
}
if (f.readiness().state === 'NEEDS_CLARIFICATION') { console.log('DEAD-END:', f.readiness().reasons.map(r => r.text_ar)); f.brief = B.decide(f.brief, 'space:guest_dining', { priority: 'mandatory' }); }
console.log('READY', f.readiness().state);
f.answer('start'); f.answer('go');
const e = f.engineInput();
console.log('RULES', JSON.stringify(e.requirements.rules.map(r => [r.text, r.level])), 'REL', JSON.stringify(e.requirements.relations.map(r => [r.kind, r.level, r.directDoor])), 'prefs', JSON.stringify(e.requirements.prefs));
const t = Date.now();
let res; try { res = await generateInitialDesign({ land: e.land, rooms: e.rooms, discovery: e.discovery, idea: e.idea, counts: e.counts, requirements: e.requirements }); } catch (err) { console.log('ERR', err.code, err.message?.slice(0, 300)); process.exit(0); }
console.log('secs', (Date.now() - t) / 1000, 'alts', res.alternatives.length, JSON.stringify(res.alternatives.map(a => a.presentation?.status)), 'hidden', (res.hidden||[]).length);
const s = createSession({ land, counts: e.counts, requirements: e.requirements, discovery: e.discovery, idea: e.idea, result: res });
for (const x of ledgerFor(s)) console.log('  LEDGER', x.ok, x.status || '', x.level || x.kind, x.text, '|', x.why);
console.log('PRES', JSON.stringify(res.presentation));
const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.OUT || 'genC.json', JSON.stringify({ session: s }));
