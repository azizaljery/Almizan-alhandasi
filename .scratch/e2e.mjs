import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
const txt = process.argv[2] || 'فيلا دورين مجلس وثلاث غرف نوم ومصعد';
let ok = 0, tot = 0;
for (const [w, l] of [[20,30],[25,30],[15,25],[30,30],[18,28],[22,35],[25,40],[30,40],[20,20],[12,25]]) {
  const b = buildBrief(txt, { land: { width: w, length: l, floors: 2 } });
  let out; try { out = await generateInitialDesign({ land: { width: w, length: l, streets: ['s'], entries: ['s'], floors: 2 }, rooms: [], idea: txt, counts: b.counts, requirements: b.requirements }); } catch (e) { console.log(w, l, 'ERR', e.message.slice(0, 80)); continue; }
  const ds = (out.alternatives || []).map(a => ({ ...a, has: a.doc.labels.filter(x => x.type === 'elevator').length, note: (a.notes||[]).find(n => /المصعد|مصعد/.test(n)) })); const ledger = out.ledger;
  const rows = ds.map(d => d.has ? 'E' : '-');
  tot += ds.length; ok += ds.filter(d => d.has).length;
  console.log(w, l, rows.join(' '), (ds[0]?.note||'').slice(0,110), ledger?.find?.(x=>x.id==='E-elevator')?.ok);
}
console.log(ok + '/' + tot);
