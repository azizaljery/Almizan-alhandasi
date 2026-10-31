const D = process.argv[2] || '/tmp/claude-0/-home-claude/cc220171-1914-572f-b744-f8e0d2357b91/scratchpad/wt-fb/dist';
const { SharaFlow, liveProfile } = await import(D + '/sharaa/flow.mjs');
const { normalizeLand } = await import(D + '/home-flow.mjs');
const text = process.argv[3] || 'أبي ثلاث غرف نوم وأربع دورات مياه ومجلس رجال بمدخل مستقل ومقلط، ولازم مجلس الرجال بباب مباشر على غرفة الطعام، وغرفة كبار سن قرب الصالة، ومطبخ مفتوح على الصالة';
const { land } = normalizeLand({ length: 18, width: 30, streets: ['n'], entries: ['n'], floors: 1 });
const f = new SharaFlow({ land });
f.start(); let out = f.answer('mode', 'free'); out = f.answer('free', text);
const show = list => list.forEach(m => console.log('  ش:', m.text, m.kind || '', m.items ? JSON.stringify(m.items) : '', m.options ? m.options.map(o => o.id).join('|') : ''));
show(out);
for (let i = 0; i < 25; i++) {
  const q = out[out.length - 1]; if (!q?.kind) break;
  if (q.kind === 'counts') out = f.answer('counts', { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 });
  else if (q.kind === 'confirm_items') { const dec = {}; for (const it of q.items) dec[it.ref] = it.suggested || 'preferred'; console.log('  CONFIRM', JSON.stringify(q.items.map(i => [i.ref, i.text, i.suggested]))); out = f.answer('ask', { key: 'confirm', value: { decisions: dec } }); }
  else if (q.kind === 'choice' && q.id === 'ask') { const pick = { guest_entrance: 'must' }[q.key] ?? q.options[q.options.length - 1].id; console.log('  ANS', q.key, pick); out = f.answer('ask', { key: q.key, value: pick }); }
  else if (q.kind === 'household') out = f.answer('ask', { key: 'household', value: { currentMembers: 5, picked: [] } });
  else if (q.kind === 'multi') out = f.answer('ask', { key: q.key, value: [] });
  else break;
  show(out);
}
const P = liveProfile(f.brief);
console.log('CONFIRMED:', P.confirmed.map(r => r.label + ' — ' + r.priority + ' ' + r.support));
console.log('AWAIT:', P.awaiting.map(r => r.label + ' — ' + r.priority));
console.log('READY:', JSON.stringify(f.readiness().state), f.readiness().reasons.map(r=>r.text_ar));
const e = f.engineInput(); console.log('RULES:', JSON.stringify(e.requirements.rules.map(r => [r.kind, r.a, r.b, r.level, r.door])), 'REL:', JSON.stringify(e.requirements.relations.map(r => [r.kind, r.level, r.directDoor])));
console.log('spaces', JSON.stringify(f.brief.spaces.map(s=>[s.id,s.type,s.count,s.priority,s.verification,s.source])));
console.log('relations', JSON.stringify(f.brief.relations.map(s=>[s.id,s.from,s.to,s.relation,s.detail,s.priority,s.verification,s.originalText])));
