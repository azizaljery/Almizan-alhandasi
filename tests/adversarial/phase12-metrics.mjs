// قياسات BEFORE/AFTER لـ Phase 1.2. مقاييس المختبِر مستقلة التنفيذ (شبكية raster)، لا تستورد قياسات المولّد.
// node phase12-metrics.mjs <out.json>   (يُشغَّل في شجرة قبل وشجرة بعد)
import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const root=process.cwd()+'/'; const imp=async p=>import(pathToFileURL(root+p).href);
const { runBuilding, loadDoc, sourceOf } = await imp('dist/facade-kit/concepts/run.mjs'); const G = await imp('dist/facade-kit/concepts/generate.mjs'); const { analyzeFacade } = await imp('dist/facade-kit/concepts/analyze.mjs');
const S = await imp('dist/facade-kit/concepts/signature.mjs'); const { TONE_GREY } = await imp('dist/facade-kit/concepts/vocabulary.mjs');
let ID=null; try{ ID=await imp('dist/facade-kit/concepts/identity.mjs'); }catch{}
const BAND={lower:.271,upper:.429}; const BUILD=['C1','C4','C7','RECT','L','U'];
const mulberry=a=>()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const TONE={2:'light',3:'mid',4:'dark',5:'accent'}; const grey=v=>TONE_GREY[TONE[v]]??TONE_GREY.base;
// --- مقياس مستقل 1: حجب الفتحة على الشبكة (حلقة قريبة + حلقة أبعد) ---
function occludedOpenings(a,sig){ const {u0,u1,zTop}=a.frame, W=S.GW, H=S.GH, cw=(u1-u0)/W, ch=zTop/H, grid=sig._grid; const at=(u,z)=>{ const c=Math.floor((u-u0)/cw), r=Math.floor((zTop-z)/ch); return (c<0||c>=W||r<0||r>=H)?255:grid[r*W+c]; };
  let n=0,tot=0; for(const p of a.pieces) for(const o of p.ops){ tot++; const og=o.entry?.17:.25; let ringN=0,ringLow=0,farN=0,farLow=0;
    for(let c=Math.floor((o.u0-.6-u0)/cw);c<=Math.ceil((o.u1+.6-u0)/cw);c++)for(let r=Math.floor((zTop-o.z1-.6)/ch);r<=Math.ceil((zTop-o.z0+.6)/ch);r++){ const u=u0+(c+.5)*cw, z=zTop-(r+.5)*ch; const du=Math.max(o.u0-u,0,u-o.u1), dz=Math.max(o.z0-z,0,z-o.z1), d=Math.hypot(du,dz); if(d<=0||d>.6) continue; const v=at(u,z); if(v===255||v===1) continue; const low=v>=2?Math.abs(grey(v)-og)<.15:Math.abs(TONE_GREY.base-og)<.15; if(d<=.12){ringN++; if(low) ringLow++;} else if(d>=.3){farN++; if(low) farLow++;} }
    if(ringN&&ringLow/ringN>=.6&&(!farN||farLow/farN>=.5)) n++; } return {n,tot}; }
// --- مقياس مستقل 2: عنصر عائم مباشر (بلا سلسلة) ---
function floating(a,comps){ let n=0; for(const c of comps){ const p=a.pieces.find(p=>p.piece===c.piece), b=p.bb, t=.06; const datum=c.bb.z0<=b.z0+t||c.bb.z1>=b.z1-t||c.bb.u0<=b.u0+t||c.bb.u1>=b.u1-t||p.ops.some(o=>c.bb.u1>=o.u0-.35&&c.bb.u0<=o.u1+.35&&c.bb.z1>=o.z0-.35&&c.bb.z0<=o.z1+.35); if(!datum) n++; } return n; }
function legacyHidden(a,comps){ let h=0; for(const p of a.pieces) for(const o of p.ops){ const og=o.entry?.17:.25; let mn=1,touch=false; for(const c of comps.filter(c=>c.piece===p.piece)){ const near=c.bb.u1>=o.u0-.2&&c.bb.u0<=o.u1+.2&&c.bb.z1>=o.z0-.2&&c.bb.z0<=o.z1+.2; if(!near) continue; touch=true; mn=Math.min(mn,Math.abs(TONE_GREY[c.tone]-og)); } if(touch&&mn<.15) h++; } return h; }
// --- مقياس مستقل 3: عائلة سائدة بالخلايا (مساحة فقط) ---
function gridFamily(a,sig){ const {u0,u1,zTop}=a.frame, W=S.GW, H=S.GH, cw=(u1-u0)/W, ch=zTop/H, grid=sig._grid, cnt={entrance:0,'opening-rhythm':0,edges:0,'mass-zoning':0};
  for(let r=0;r<H;r++)for(let c=0;c<W;c++){ const v=grid[r*W+c]; if(v<2||v===255) continue; const u=u0+(c+.5)*cw, z=zTop-(r+.5)*ch; const p=a.pieces.find(p=>u>=p.bb.u0-1e-6&&u<=p.bb.u1+1e-6&&z>=p.bb.z0-1e-6&&z<=p.bb.z1+1e-6)||a.pieces[0];
    if(p.entries.some(e=>u>=e.u0-.7&&u<=e.u1+.7&&z<=e.z1+.3)) cnt.entrance++; else if(p.windows.some(w=>u>=w.u0-.2&&u<=w.u1+.2&&z>=w.z0-.2&&z<=w.z1+.2)) cnt['opening-rhythm']++; else if(z>=p.bb.z1-.06||u<=p.bb.u0+.06||u>=p.bb.u1-.06) cnt.edges++; else cnt['mass-zoning']++; }
  return Object.entries(cnt).sort((x,y)=>y[1]-x[1])[0][0]; }
// مقياس مستقل 4: عائلة سائدة بالحواف (البنية التي تراها العين): خلايا الحافة بين المناطق فقط
function gridFamilyEdge(a,sig){ const {u0,u1,zTop}=a.frame, W=S.GW, H=S.GH, cw=(u1-u0)/W, ch=zTop/H, em=S.edgeMask(sig._grid,{zoneOnly:true}), cnt={entrance:0,'opening-rhythm':0,edges:0,'mass-zoning':0};
  for(let r=0;r<H;r++)for(let c=0;c<W;c++){ if(!em[r*W+c]) continue; const u=u0+(c+.5)*cw, z=zTop-(r+.5)*ch; const p=a.pieces.find(p=>u>=p.bb.u0-1e-6&&u<=p.bb.u1+1e-6&&z>=p.bb.z0-1e-6&&z<=p.bb.z1+1e-6)||a.pieces[0];
    if(p.entries.some(e=>u>=e.u0-.7&&u<=e.u1+.7&&z<=e.z1+.3)) cnt.entrance++; else if(p.windows.some(w=>u>=w.u0-.2&&u<=w.u1+.2&&z>=w.z0-.2&&z<=w.z1+.2)) cnt['opening-rhythm']++; else if(z>=p.bb.z1-.06||u<=p.bb.u0+.06||u>=p.bb.u1-.06) cnt.edges++; else cnt['mass-zoning']++; }
  return {dominant:Object.entries(cnt).sort((x,y)=>y[1]-x[1])[0][0],cnt}; }
const out={buildings:{},scen:{},perm:{},totals:{}};
let hiddenLegacy=0,hiddenRaster=0,floatCands=0,nCands=0,uncertain=0,rejectedPairs=0,nearDup=0,pairsAll=0;
const sealed={};
for(const n of BUILD){ const r=await runBuilding(n); const a=analyzeFacade(r.built,r.front), cs=r.gen.candidates; const row={pool:cs.length,selected:r.sel.selected?.ids||null,status:r.sel.status||(r.sel.selected?'OK':'NONE')};
  for(const k of cs){ nCands++; if(legacyHidden(a,k.comps)>0) hiddenLegacy++; if(occludedOpenings(a,k.sig).n>0) hiddenRaster++; if(floating(a,k.comps)>0) floatCands++; }
  for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++){ const c=S.compareSignatures(cs[i].sig,cs[j].sig), v=S.verdict(c); pairsAll++; if(c.novelty>=BAND.lower&&c.novelty<BAND.upper) uncertain++; if(!v.accepted) rejectedPairs++; if(c.novelty<BAND.lower) nearDup++; }
  const pick=ids=>ids?ids.map(i=>cs.find(k=>k.id===i)):null; const sel=pick(row.selected);
  row.gridFamilies=sel?sel.map(k=>gridFamily(a,k.sig)):null; row.gridFamilyDistinct=sel?new Set(row.gridFamilies).size:0; row.edgeFamilies=sel?sel.map(k=>gridFamilyEdge(a,k.sig).dominant):null; row.edgeFamilyDistinct=sel?new Set(row.edgeFamilies).size:0; row.declaredDominant=sel?sel.map(k=>k.profile?.dominant||null):null;
  if(G.exploreDesignSpace && !sel){ const e=await G.exploreDesignSpace(r.built,r.front); row.escalation={status:e.status,stage:e.stage}; if(e.sel.selected){ const es=e.sel.selected.ids.map(i=>e.gen.candidates.find(k=>k.id===i)); row.escalatedGridFamilies=es.map(k=>gridFamily(a,k.sig)); row.escalatedGridFamilyDistinct=new Set(row.escalatedGridFamilies).size; row.escalatedEdgeFamilies=es.map(k=>gridFamilyEdge(a,k.sig).dominant); row.escalatedEdgeFamilyDistinct=new Set(row.escalatedEdgeFamilies).size; } }
  out.buildings[n]=row; sealed[n]=r; }
Object.assign(out.totals,{candidates:nCands,hiddenOpeningLegacy:hiddenLegacy,occludedOpeningRaster:hiddenRaster,floatingDirectDatum:floatCands,pairs:pairsAll,uncertainPairsInBand:uncertain,pairsNotAccepted:rejectedPairs,nearDuplicatePairsBelowBand:nearDup,band:BAND});
// --- هجمات تعديل المصدر ---
const c1=sealed.C1; const escapes=[]; const T=(f)=>structuredClone(f);
{ const t=T(c1.built); t[c1.front].F.pieces[1].openings[0].u0+=.6; let ran=true; try{ await G.generate(t,c1.front,{count:3,maxTries:200}); }catch{ ran=false; } escapes.push({scenario:'مصدر معدّل غير مختوم يُشغَّل بلا بصمة',escaped:ran}); }
{ let ran=true; const t=T(c1.built); t[c1.front].F.pieces[1].openings[0].u0+=.6; try{ const h=ID?await ID.sourceHash(c1.built):'x'; await G.generate(t,c1.front,{count:3,maxTries:200,expectedSourceHash:h}); }catch{ ran=false; } escapes.push({scenario:'مصدر معدّل مع بصمة مرجعية للأصل',escaped:ran}); }
{ let ran=true; const m=T(c1.built); if(ID) await ID.sealSource(m); try{ const g=await G.generate(m,c1.front,{count:3,maxTries:300}); m[c1.front].F.pieces[1].openings[0].u1+=.3; await G.packageConcept(m,c1.transforms,c1.front,g.candidates[0]); }catch{ ran=false; } escapes.push({scenario:'تعديل المصدر بين التوليد والتعبئة',escaped:ran}); }
out.scen={escapes,escapedCount:escapes.filter(e=>e.escaped).length,of:escapes.length};
// --- ثبات الترتيب ---
const { AXES } = await imp('dist/facade-kit/concepts/vocabulary.mjs'); const keyOf=k=>[k.params.entrance,k.params.grouping,k.params.emphasis,k.params.zoning,k.params.roof,k.params.corner].join('|');
let unstable=0, checks=0; const permRows={};
for(const n of ['C1','C4','C7']){ const r=sealed[n], base=r.gen.candidates, selKeys=ids=>ids?ids.map(i=>keyOf(base.find(k=>k.id===i))).sort().join(';'):null; const bk=selKeys(r.sel.selected?.ids);
  const saved={}; for(const a of Object.keys(AXES)) saved[a]=[...AXES[a]]; let overlap,selChanged; try{ for(const a of Object.keys(AXES)) AXES[a].reverse(); const g=await G.generate(r.built,r.front,{count:12}); const s=G.gateAndSelect(g.candidates).selected; const pool=new Set(g.candidates.map(keyOf)), pb=new Set(base.map(keyOf)); overlap=[...pool].filter(x=>pb.has(x)).length; selChanged=(s?s.ids.map(i=>keyOf(g.candidates.find(k=>k.id===i))).sort().join(';'):null)!==bk; } finally{ for(const a of Object.keys(AXES)){ AXES[a].length=0; AXES[a].push(...saved[a]); } }
  const rng=mulberry(3); let shuf=0; for(let t=0;t<10;t++){ const arr=[...base]; for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } const s=G.gateAndSelect(arr).selected; if((s?s.ids.map(i=>keyOf(arr.find(k=>k.id===i))).sort().join(';'):null)!==bk) shuf++; }
  permRows[n]={vocabReversePoolOverlap:`${overlap}/${base.length}`,vocabReverseSelectionChanged:selChanged,candidateShuffleChanged:`${shuf}/10`}; checks+=2; if(overlap<base.length||selChanged) unstable++; if(shuf) unstable++; }
out.perm={rows:permRows,unstable,checks};
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1)); console.log(JSON.stringify({totals:out.totals,scen:out.scen.escapedCount,perm:out.perm.unstable}));
