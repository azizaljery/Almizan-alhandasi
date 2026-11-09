import { generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { checkDoc } from '../dist/villa-layout.mjs';
import { planElevator, elevatorCandidates } from '../dist/elevator-plan.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
const cnt = d => { const m = {}; for (const i of reviewDoc(d)) m[i.code] = (m[i.code]||0)+1; return m; };
let ok=0, tot=0;
for (const [w,l,b] of [[20,30,4],[25,30,4],[15,25,3],[30,30,5],[18,28,3],[22,35,5]]) {
  let r; try { r = generateVillaTwoFloors({ land: { width: w, length: l, streets: ['s'], entries: ['s'] }, counts: { bedrooms: b, majlis: 1, baths: b, kitchens: 1 }, requirements: { floors: 2, prefs: {} }, keep: 3 }); } catch(e){ console.log(w,l,'ERR',e.message); continue; }
  for (const d of r.designs) {
    tot++;
    const base = cnt(d.doc);
    const verify = doc => { if(!checkDoc(doc).ok) return false; const a = cnt(doc); return Object.keys(a).every(k => a[k] <= (base[k]||0)); };
    const c = elevatorCandidates(d.doc).length;
    const { doc, report } = planElevator(d.doc, { verify });
    if (report.placed.length) ok++;
    console.log(w,l,b,'cands',c, report.placed.length?'PLACED '+JSON.stringify(report.placed[0]):'MISS', JSON.stringify(cnt(doc)) !== JSON.stringify(base) ? 'review:'+JSON.stringify(cnt(doc)) : '');
  }
}
console.log(ok+'/'+tot);
