const root='/tmp/h3copy/';
const { extractRequirements } = await import(root+'dist/requirements.mjs'), E = await import(root+'dist/villa-layout-v3.mjs');
const { HELDOUT } = await import('/home/claude/wt-r21p/scripts/heldout-cases.mjs'); const C=HELDOUT.find(c=>c.id==='H3');
const req=extractRequirements(C.text,{counts:C.counts});req.counts={...req.counts,...C.counts};
globalThis.__r21hall=1;globalThis.__dumpCG={tag:process.argv[2]};globalThis.__v2only=new Set(process.argv.slice(2)); globalThis.__v2dbg={keepSol:true};
let OUT=null; try{globalThis.__E=null;OUT=E.generateVillaDesigns({land:{floors:1,...C.land},counts:req.counts,requirements:req,keep:4,_cf:true});}catch(e){console.log('ERR',e.code); globalThis.__E=e; console.log('REJKEYS',Object.keys(e.rejected?.[0]||{}).join(',')); console.log('REJ',JSON.stringify((e.rejected||[]).map(r=>({pat:r.pat,why:r.why,hidden:r.hidden})) ).slice(0,3500))}
const d=globalThis.__v2dbg; for(const k of Object.keys(d)) if(/^(tree|why|ms|sol):/.test(k)) console.log(k, JSON.stringify(d[k]).slice(0,1500));
console.log('KEYS', Object.keys(d).filter(k=>!/^(tree|why|ms|sol|min|tr):/.test(k)).join(','));
for (const k of ['local','localFail','localShrunk','pick','buildFail','build','rej']) if (d[k]) console.log(k, JSON.stringify(d[k]).slice(0,1500));
const pool=globalThis.__v2pool; console.log('POOL',pool?pool.length:null);
{ const r=globalThis.__E?.rejected?.[0]; if(r?.doc){ const fs=await import('fs'); fs.writeFileSync('/tmp/hhB-doc.json', JSON.stringify(r.doc)); console.log('saved'); } }
console.log('BUILT', JSON.stringify(d.built||null).slice(0,3000));
console.log('REJ2', JSON.stringify((globalThis.__E?.rejected||[]).map(r=>[r.pat,r.why,r.rejections])).slice(0,3000));
if(globalThis.__E) console.log('EKEYS', Object.keys(globalThis.__E||{}).join(','), String(globalThis.__E?.message).slice(0,300));
if(globalThis.__E) console.log('EREPORT', JSON.stringify(globalThis.__E?.report_ar||globalThis.__E?.reviewRejected||globalThis.__E?.review||null).slice(0,3000));
if(globalThis.__E){ const e=globalThis.__E; console.log('RESKEYS', Object.keys(e.result||{}).join(','), Object.keys(e.search||{}).join(','), Object.keys(e.feasibility||{}).join(','));
 const hv=e.result?.heavyRejected||e.result?.rejected||[]; console.log('HV', JSON.stringify(hv).slice(0,1500));
 const pool=e.result?.pool||[]; console.log('POOLR', JSON.stringify(pool.map(p=>[p.pat,p.heavy])).slice(0,1500)); }
if(globalThis.__E){ const cr=globalThis.__E.result?.candidatesRejected; console.log('CR', JSON.stringify(cr).slice(0,2500)); }
{ const b=globalThis.__builtDocs||[]; console.log('BD',b.length); if(b[0]){ const fs=await import('fs'); fs.writeFileSync('/tmp/hhE-doc.json', JSON.stringify(b[0].doc)); } }
{ const r=(globalThis.__E?.rejected||[]).find(x=>x.pat==='hplan:'+process.argv[2]); if(r){ console.log('WHY', JSON.stringify(r.why)); if(r.doc){const fs=await import('fs'); fs.writeFileSync('/tmp/rej-doc.json', JSON.stringify(r.doc));} } }
for (const r of (globalThis.__E?.rejected||[])) console.log('RJ', r.pat, JSON.stringify((r.why||[]).map(w=>w.slice(0,90))));

if(OUT){ for(const dd of OUT.designs){ console.log('DESIGN', dd.pat, dd.presentation?.status, JSON.stringify((dd.presentation?.hidden_ar||[]).map(x=>x.slice(0,600)))); const fs=await import('fs'); fs.writeFileSync('/tmp/design-'+dd.pat.replace(/[^\w]/g,'_')+'.json', JSON.stringify(dd.doc)); } }
