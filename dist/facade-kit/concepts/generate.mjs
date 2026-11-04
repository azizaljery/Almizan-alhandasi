// مولّد المفاهيم + البوابات + الاختيار. نطاق معزول: لا يغيّر المشروع ولا الإنتاج.
import { layerMask, intersection, difference, union, multiArea, bounds } from '../src/polygons.mjs';
import { createFacadePackage, planSignature } from '../src/model.mjs';
import { hash } from '../src/core.mjs';
import { analyzeFacade } from './analyze.mjs';
import { AXES, PALETTES, GROUP_ORDER, moves } from './vocabulary.mjs';
import { signature, compareSignatures, verdict, NOVELTY_RULE, DIMENSIONS } from './signature.mjs';
import { assertSourceIdentity, verifyOutputBinding, SourceIdentityError } from './identity.mjs';
import { classifyOpenings, unsupported } from './gates12.mjs';
import { realisedProfile, coversDistinctRegions } from './coverage.mjs';
const r3=v=>Math.round(v*1000)/1000;
function mulberry(a){ return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export const fingerprint=analysis=>hash({p:analysis.pieces.map(p=>({bb:p.bb,ops:p.ops.map(o=>[o.u0,o.u1,o.z0,o.z1,o.entry])}))});
/** R5: المفردات تُعدَّل قانونيًا (فرز المفاتيح والخيارات) قبل أي سحب؛ فلا يعتمد الفضاء على ترتيب التعداد. */
function canonicalVocab(){ const ax=Object.fromEntries(Object.keys(AXES).sort().map(k=>[k,[...AXES[k]].sort()])); return {ax,palettes:Object.keys(PALETTES).sort()}; }
function sampleParams(rng,V){
  const pick=a=>a[Math.floor(rng()*a.length)];
  return {entrance:pick(V.ax.entrance),grouping:pick(V.ax.grouping),emphasis:pick(V.ax.emphasis),zoning:pick(V.ax.zoning),roof:pick(V.ax.roof),corner:pick(V.ax.corner),palette:pick(V.palettes),seed:{base:pick([.6,.9,1.1]),side:rng()<.5?0:1}};
}
const archKey=p=>[p.entrance,p.grouping,p.emphasis,p.zoning,p.roof,p.corner,p.seed.base,p.seed.side].join('|');
/** يبني مناطق مسطحة غير متداخلة بالأولوية، مقصوصة بقناع الجدار. */
export function realize(analysis, source, side, params){
  const zs=moves(analysis,params).sort((a,b)=>GROUP_ORDER.indexOf(a.group)-GROUP_ORDER.indexOf(b.group));
  const wallsByPiece=Object.fromEntries(source[side].layers.filter(l=>l.role==='wall').map(l=>[l.piece,layerMask(l)]));
  const taken=[], comps=[];
  for(const z of zs){ const mask=wallsByPiece[z.piece]; let mp=intersection(mask,[[z.ring]]); if(!mp.length) continue;
    const full=mp; const prior=taken.filter(t=>t.piece===z.piece).map(t=>t.mp); if(prior.length) mp=difference(mp,union(...prior));
    taken.push({piece:z.piece,mp:full});
    mp.forEach((poly,k)=>{ if(multiArea([poly])<5e-2) return; const ob=bounds([poly]); if(Math.min(ob.u1-ob.u0,ob.z1-ob.z0)<.1) return; /* بقايا قصّ رقيقة بعد طرح المناطق الأعلى أولوية */ comps.push({name:`${z.name}#${k}`,piece:z.piece,tone:z.tone,group:z.group,poly,mp:[poly],bb:ob,area:multiArea([poly])}); }); }
  return comps;
}
const rectOf=o=>[[[o.u0,o.z0],[o.u1,o.z0],[o.u1,o.z1],[o.u0,o.z1],[o.u0,o.z0]]];
function segDist(a,b,o){ let m=1e9; for(let i=0;i<=20;i++){ const x=a[0]+(b[0]-a[0])*i/20,y=a[1]+(b[1]-a[1])*i/20; const dx=Math.max(o.u0-x,0,x-o.u1), dy=Math.max(o.z0-y,0,y-o.z1); m=Math.min(m,Math.hypot(dx,dy)); } return m; }
/** بوابة الأمانة الهندسية + بوابة المعقولية + درجة الواقعية المعمارية. */
export function assess(analysis, comps){
  const fid=[], pla=[]; const ck=(arr,id,ar,ok,detail)=>arr.push({id,ar,ok:!!ok,detail});
  let overlapArea=0, outside=0; const ops=analysis.pieces.flatMap(p=>p.ops.map(o=>({...o,piece:p.piece})));
  for(const c of comps){ const pc=analysis.pieces.find(p=>p.piece===c.piece);
    for(const o of ops.filter(o=>o.piece===c.piece)) overlapArea+=multiArea(intersection(c.mp,rectOf(o)));
    const b=pc.bb; if(c.bb.u0<b.u0-1e-6||c.bb.u1>b.u1+1e-6||c.bb.z0<b.z0-1e-6||c.bb.z1>b.z1+1e-6) outside++; }
  ck(fid,'openings-clear','لا منطقة تغطي أي فتحة (نافذة/باب)',overlapArea<1e-6,`مساحة التداخل=${r3(overlapArea)} م²`);
  ck(fid,'inside-wall','كل المناطق داخل حدود الجدار',outside===0,`خارج الحدود: ${outside}`);
  ck(fid,'flush-zero-projection','لا بروز: وجه المنطقة = وجه الجدار',true,'مبني على o1 = wall.o1 (يُتحقق لاحقًا من حزمة النواة)');
  // معقولية
  const minDim=comps.length?Math.min(...comps.map(c=>Math.min(c.bb.u1-c.bb.u0,c.bb.z1-c.bb.z0))):9;
  ck(pla,'min-feature','أصغر بُعد لعنصر ≥ 8 سم',minDim>=.08,`الأصغر=${r3(minDim)} م`);
  let sliver=0; for(const c of comps){ const outer=c.poly[0]; for(let i=0;i<outer.length-1;i++){ for(const o of ops.filter(o=>o.piece===c.piece)){ const d=segDist(outer[i],outer[i+1],o); if(d>.002&&d<.07) sliver++; } } }
  ck(pla,'no-sliver','لا شريط رفيع جدًا (2–70 مم) بين حافة منطقة وفتحة',sliver===0,`شرائح: ${sliver}`);
  const wallNet=analysis.wallArea-analysis.openingArea, covered=comps.reduce((s,c)=>s+c.area,0)/wallNet;
  ck(pla,'coverage','تغطية المناطق بين 10% و72% من صافي الجدار',covered>=.10&&covered<=.72,`التغطية=${r3(covered)}`);
  const tones=new Set(comps.map(c=>c.tone));
  ck(pla,'restraint','عدد المناطق ≤ 18 وعدد النغمات ≤ 4',comps.length<=18&&tones.size<=4,`مناطق=${comps.length}، نغمات=${tones.size}`);
  const hasEntryZone=analysis.entryCount===0||comps.some(c=>analysis.pieces.some(p=>p.piece===c.piece&&p.entries.some(e=>c.bb.u1>=e.u0-.7&&c.bb.u0<=e.u1+.7&&c.bb.z0<=e.z1)));
  ck(pla,'entry-legible','للمدخل معالجة مقروءة (منطقة ملاصقة له)',hasEntryZone,'');
  // وضوح الباب: لا منطقة داكنة عريضة تلاصق الباب (الباب داكن فيضيع عن العين). الأشرطة الأفقية الرفيعة (عتب/غطاء) مسموحة.
  let lost=0; for(const c of comps) if(c.tone==='dark') for(const e of analysis.pieces.filter(p=>p.piece===c.piece).flatMap(p=>p.entries)){ const touchU=c.bb.u1>=e.u0-.05&&c.bb.u0<=e.u1+.05, zov=Math.min(c.bb.z1,e.z1)-Math.max(c.bb.z0,e.z0); if(touchU&&zov>=.6*(e.z1-e.z0)&&(c.bb.u1-c.bb.u0)>.9) lost++; }
  ck(pla,'entry-contrast','الباب يبقى مقروءًا: لا كتلة داكنة عريضة تلاصقه',lost===0,`كتل مبتلعة: ${lost}`);
  // R2: وضوح الفتحات (إطار/تمييز/معالجة مجاورة مسموحة؛ الحجب مرفوض) + عدم وجود معالجة عائمة بلا دعم
  const cls=classifyOpenings(analysis,comps), occl=cls.filter(o=>o.cls==='OCCLUSION');
  ck(pla,'opening-legible','الفتحات مقروءة: لا حجب بصري (الإطار والتمييز والمجاورة مسموحة)',occl.length===0,`محجوبة: ${occl.length}/${cls.length}`);
  const floating=unsupported(analysis,comps);
  ck(pla,'supported','لا معالجة عائمة: كل عنصر متصل بمرجع (أرض/سقف/طرف/فتحة) أو بعنصر مدعوم',floating.length===0,`عائمة: ${floating.length}`);
  // درجة الواقعية المعمارية
  const thin=comps.filter(c=>{const w=c.bb.u1-c.bb.u0,h=c.bb.z1-c.bb.z0;return Math.min(w,h)<.14;}).length;
  const bad=comps.filter(c=>{const w=c.bb.u1-c.bb.u0,h=c.bb.z1-c.bb.z0;return (w<h&&w>1.7)||(h<w&&h>1.2&&w>3.5&&false);}).length;
  const parts={restraint:Math.max(0,1-Math.max(0,comps.length-10)/10), balance:covered<.12?covered/.12:covered>.55?Math.max(0,1-(covered-.55)/.2):1, cohesion:tones.size<=3?1:.6, delicacy:comps.length?1-thin/comps.length*.5:1, proportion:comps.length?1-bad/comps.length:1};
  const score=r3(Object.values(parts).reduce((s,v)=>s+v,0)/Object.keys(parts).length);
  return {fidelity:{checks:fid,pass:fid.every(c=>c.ok)},plausibility:{checks:pla,pass:pla.every(c=>c.ok)},realism:{score,parts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,r3(v)]))}};
}
export async function generate(source, side, {count=12,seed=1,maxTries=600,expectedSourceHash=null}={}){
  // R1: بصمة المصدر قبل أي توليد؛ فشل مغلق إن لم تُعلَن أو لم تطابق
  const srcHash=await assertSourceIdentity(source,{expectedSourceHash});
  const V=canonicalVocab(), analysis=analyzeFacade(source,side), fp=await fingerprint(analysis), rng=mulberry(parseInt(fp.slice(0,8),16)^(seed*2654435761));
  const seen=new Set(), cands=[], rejected=[]; let tries=0;
  while(cands.length<count&&tries++<maxTries){ const p=sampleParams(rng,V), key=archKey(p); if(seen.has(key)) continue; seen.add(key);
    const comps=realize(analysis,source,side,p); if(!comps.length){ rejected.push({key,reason:'لا مناطق'}); continue; }
    const a=assess(analysis,comps); if(!a.fidelity.pass||!a.plausibility.pass){ rejected.push({key,reason:[...a.fidelity.checks,...a.plausibility.checks].filter(c=>!c.ok).map(c=>c.id).join(',')}); continue; }
    const sig=signature(analysis,comps);
    cands.push({id:'K'+String(cands.length+1).padStart(2,'0'),key,params:p,comps,assess:a,sig,profile:realisedProfile(analysis,comps,sig),sourceHash:srcHash}); }
  // R1: لم يتغير المصدر أثناء المسار
  if(await assertSourceIdentity(source,{expectedSourceHash:srcHash})!==srcHash) throw new SourceIdentityError('SOURCE_MUTATED_DURING_PATH','');
  return {analysis,fingerprint:fp,sourceHash:srcHash,candidates:cands,rejected,tries};
}
/** بوابة التفرد داخل الدفعة + الاختيار: أفضل ثلاثة مجموع (واقعية + تباعد) بشرط قبول كل زوج. */
export function gateAndSelect(candsIn, rule=NOVELTY_RULE){
  // R5: ترتيب قانوني للمرشحين (بمفتاح الوصفة) فلا يتأثر القرار بترتيب الإدخال؛ والتعادل يُحسم بالمفتاح
  const kOf=c=>c.key||archKey(c.params), cands=[...candsIn].sort((a,b)=>kOf(a)<kOf(b)?-1:kOf(a)>kOf(b)?1:0);
  if(new Set(cands.map(c=>c.sourceHash).filter(Boolean)).size>1) throw new SourceIdentityError('MIXED_SOURCES','مرشحون من مصادر مختلفة');
  const pair=new Map(), key=(a,b)=>a<b?a+'|'+b:b+'|'+a;
  for(let i=0;i<cands.length;i++)for(let j=i+1;j<cands.length;j++){ const c=compareSignatures(cands[i].sig,cands[j].sig); pair.set(key(cands[i].id,cands[j].id),{...c,verdict:verdict(c,rule)}); }
  const P=(a,b)=>pair.get(key(a.id,b.id));
  const dupOf={}; const sorted=[...cands].sort((a,b)=>b.assess.realism.score-a.assess.realism.score||(kOf(a)<kOf(b)?-1:1)), kept=[];
  for(const c of sorted){ const clash=kept.find(k=>P(c,k).verdict.zone==='NEAR_DUPLICATE'); if(clash) dupOf[c.id]=clash.id; else kept.push(c); }
  let best=null, pairwiseTriples=0, coverageRejected=0;
  for(let i=0;i<cands.length;i++)for(let j=i+1;j<cands.length;j++)for(let k=j+1;k<cands.length;k++){ const t=[cands[i],cands[j],cands[k]]; const ps=[P(t[0],t[1]),P(t[0],t[2]),P(t[1],t[2])]; if(!ps.every(p=>p.verdict.accepted)) continue; pairwiseTriples++;
    // R3: التغطية على الناتج المتحقق
    if(t.every(c=>c.profile)&&!coversDistinctRegions(t.map(c=>c.profile))){ coverageRejected++; continue; }
    const minN=Math.min(...ps.map(p=>p.novelty)), meanN=ps.reduce((s,p)=>s+p.novelty,0)/3, q=t.reduce((s,c)=>s+c.assess.realism.score,0)/3, minEdge=Math.min(...ps.map(p=>p.edgeZone));
    const score=.45*minN+.15*meanN+.25*q+.15*minEdge; const ids=t.map(c=>c.id), tie=t.map(kOf).join('~');
    if(!best||score>best.score+1e-9||(Math.abs(score-best.score)<=1e-9&&tie<best.tie)) best={ids,tie,score:r3(score),minNovelty:r3(minN),meanNovelty:r3(meanN),meanRealism:r3(q),minEdge:r3(minEdge),regions:t.map(c=>c.profile?.region),dominant:t.map(c=>c.profile?.dominant)}; }
  const uncertainPairs=[...pair.values()].filter(p=>p.verdict.zone==='UNCERTAIN').length, nearDup=[...pair.values()].filter(p=>p.verdict.zone==='NEAR_DUPLICATE').length;
  const status=best?'OK':(pairwiseTriples?'INSUFFICIENT_DESIGN_SPACE_COVERAGE':'NO_DISTINCT_TRIPLE');
  return {pair,dupOf,selected:best,status,stats:{candidates:cands.length,pairwiseTriples,coverageRejected,uncertainPairs,nearDuplicatePairs:nearDup,families:[...new Set(cands.map(c=>c.profile?.dominant))]}};
}
/** تعبئة مفهوم عبر النواة (نمط X) — يرمي إن تغيّرت هندسة المسقط. */
export async function packageConcept(source, transforms, side, cand, {palette=null,roofSurfaces=[]}={}){
  await assertSourceIdentity(source,{expectedSourceHash:cand.sourceHash||null}); // R1: ربط المخرج بالمصدر
  const pal=PALETTES[palette||cand.params.palette];
  const zones=cand.comps.map(c=>({name:c.name.replace(/[^A-Za-z0-9_.:-]/g,'_'),piece:c.piece,ring:c.poly[0].slice(0,-1),holes:c.poly.slice(1).map(h=>h.slice(0,-1)),mat:pal[c.tone],tone:c.tone}));
  const pkg=await createFacadePackage(source,{style:'X',frontSide:side,maxProjectionM:{s:0,n:0,e:0,w:0},transforms,roofSurfaces,sourceRevision:'concept-lab',concept:{id:cand.id,labelAr:conceptLabel(cand.params),zones}});
  await verifyOutputBinding(source,side,pkg); return pkg;
}
export const ENT_AR={'portal-panel':'لوحة مدخل مسطحة','tower-shaft':'عمود مدخل بارتفاع كامل','pilasters':'أكتاف وعتب','canopy-band':'شريط عتب عريض','plain':'مدخل بسيط','side-block':'كتلة جانبية تحتضن المدخل'};
export const GRP_AR={'rings':'أطر فردية','vertical-strips':'أعمدة رأسية','ribbon':'شرائط أفقية','panel':'لوحات مجمّعة','head-line':'خط عتب'};
export const EMP_AR={'horizontal-courses':'مداميك أفقية','vertical-rhythm':'إيقاع رأسي','none':'—'};
export const ZON_AR={'base':'قاعدة','tripartite':'ثلاثي (قاعدة/وسط/علوي)','side-split':'انقسام جانبي','attic':'منطقة علوية','monolithic':'كتلة واحدة'};
export const ROOF_AR={'thin-cap':'غطاء رفيع','deep-fascia':'حزام عريض','stepped':'حزام متدرج','none':'بلا معالجة','raised-entry':'ارتفاع فوق المدخل'};
export const COR_AR={'posts-both':'عمودان طرفيان','post-one':'عمود طرفي واحد','quoins':'حجارة زاوية','none':'بلا'};
export const conceptLabel=p=>`${ENT_AR[p.entrance]} · ${GRP_AR[p.grouping]} · ${ZON_AR[p.zoning]} · ${ROOF_AR[p.roof]} · ${COR_AR[p.corner]}`;
/** تصعيد البحث دون خفض أي عتبة: 12 ثم 36 ثم 96 مرشحًا. فشل الأخير ⇒ DESIGN_SPACE_EXHAUSTED (نتيجة صحيحة لا عيب). */
export async function exploreDesignSpace(source, side, {stages=[12,36,96],seed=1,expectedSourceHash=null}={}){
  const history=[]; let last=null;
  for(const count of stages){ const gen=await generate(source,side,{count,seed,maxTries:count*60,expectedSourceHash}); const sel=gateAndSelect(gen.candidates);
    history.push({count,pool:gen.candidates.length,status:sel.status,stats:sel.stats}); last={gen,sel}; if(sel.selected) return {status:count===stages[0]?'OK':'OK_AFTER_ESCALATION',stage:count,...last,history}; }
  return {status:'DESIGN_SPACE_EXHAUSTED',stage:stages[stages.length-1],...last,history};
}
