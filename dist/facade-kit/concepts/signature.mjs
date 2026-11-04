// التوقيع المعماري: يُحسب من هندسة المناطق والفتحات فقط (قناع الوحدات على شبكة). لا لون، لا اسم خامة، لا إضاءة.
// فئة النغمة (tone) قيمة رمادية بنيوية لا لونًا. مناطق متلاصقة بنفس النغمة تُدمج قبل القياس.
import { union, layerMask } from '../src/polygons.mjs';
export const GW=120, GH=60;
function inPoly(poly,x,y){ // poly = [outer, ...holes] (حلقات مغلقة)
  let inside=false; for(const ring of poly){ for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const [xi,yi]=ring[i],[xj,yj]=ring[j]; if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside; } } return inside; }
const TONE_ID={light:2,mid:3,dark:4,accent:5};
/** شبكة تصنيف: 0 جدار أساس، 1 فتحة، ثم فئات النغمة. الصفوف من الأعلى (0) إلى الأسفل. */
export function labelGrid(analysis, comps) {
  const {u0,u1,zTop}=analysis.frame, grid=new Uint8Array(GW*GH), wallMask=new Uint8Array(GW*GH);
  const byTone={}; for(const c of comps) (byTone[c.tone]??=[]).push(c.mp);
  const merged=Object.fromEntries(Object.entries(byTone).map(([t,list])=>[t,union(...list)]));
  const wallPolys=analysis.pieces.map(p=>p.bb);
  for(let r=0;r<GH;r++)for(let c=0;c<GW;c++){
    const u=u0+(c+.5)/GW*(u1-u0), z=zTop-(r+.5)/GH*zTop; let onWall=false;
    for(const b of wallPolys) if(u>=b.u0&&u<=b.u1&&z>=b.z0&&z<=b.z1){ onWall=true; break; }
    if(!onWall){ grid[r*GW+c]=255; continue; }
    let v=0; for(const p of analysis.pieces){ if(u<p.bb.u0||u>p.bb.u1) continue; for(const o of p.ops) if(u>=o.u0&&u<=o.u1&&z>=o.z0&&z<=o.z1){ v=1; break; } if(v) break; }
    if(!v) for(const [t,mp] of Object.entries(merged)){ if(mp.some(poly=>inPoly(poly,u,z))){ v=TONE_ID[t]; break; } }
    grid[r*GW+c]=v;
  }
  return grid;
}
function components(grid, isIn){ // مكوّنات 4-اتصال لخلايا isIn
  const seen=new Int32Array(GW*GH), comps=[]; let id=0;
  for(let s=0;s<GW*GH;s++){ if(seen[s]||!isIn(grid[s])) continue; id++; const st=[s]; seen[s]=id; const cells=[]; while(st.length){ const i=st.pop(); cells.push(i); const r=(i/GW)|0, c=i%GW; for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){ const rr=r+dr, cc=c+dc; if(rr<0||rr>=GH||cc<0||cc>=GW) continue; const j=rr*GW+cc; if(!seen[j]&&isIn(grid[j])&&grid[j]===grid[s]){seen[j]=id;st.push(j);} } }
    comps.push(cells); }
  return {comps,seen};
}
const bbox=cells=>{ let r0=1e9,r1=-1,c0=1e9,c1=-1; for(const i of cells){ const r=(i/GW)|0,c=i%GW; r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c); } return {r0,r1,c0,c1,w:c1-c0+1,h:r1-r0+1}; };
const clamp01=x=>Math.max(0,Math.min(1,x));
const r3=v=>Math.round(v*1000)/1000;
export function edgeMask(grid, {zoneOnly=true}={}) { // خلية حافة = تختلف عن جارتها (يمين/أسفل). zoneOnly: تُهمل الحواف التي تمس الفتحات
  const e=new Uint8Array(GW*GH);
  for(let r=0;r<GH;r++)for(let c=0;c<GW;c++){ const a=grid[r*GW+c]; if(a===255) continue;
    for(const [dr,dc] of [[0,1],[1,0]]){ const rr=r+dr,cc=c+dc; if(rr>=GH||cc>=GW) continue; const b=grid[rr*GW+cc]; if(b===255||a===b) continue; if(zoneOnly&&(a===1||b===1)) continue; e[r*GW+c]=1; e[rr*GW+cc]=1; } }
  return e;
}
export function signature(analysis, comps) {
  const grid=labelGrid(analysis,comps), total=grid.reduce((s,v)=>s+(v!==255?1:0),0), voidN=grid.reduce((s,v)=>s+(v===1?1:0),0);
  const zoneN=grid.reduce((s,v)=>s+(v>=2&&v!==255?1:0),0), wallNet=total-voidN;
  const {u0,u1,zTop}=analysis.frame, cellW=(u1-u0)/GW, cellH=zTop/GH;
  // اتجاه الحواف
  let hEdge=0,vEdge=0; for(let r=0;r<GH;r++)for(let c=0;c<GW;c++){ const a=grid[r*GW+c]; if(a===255) continue; if(c+1<GW){const b=grid[r*GW+c+1]; if(b!==255&&a!==b&&a!==1&&b!==1) vEdge++;} if(r+1<GH){const b=grid[(r+1)*GW+c]; if(b!==255&&a!==b&&a!==1&&b!==1) hEdge++;} }
  const hFrac=hEdge+vEdge?hEdge/(hEdge+vEdge):.5;
  const zones=components(grid,v=>v>=2&&v!==255), compInfo=zones.comps.map(cells=>({cells,bb:bbox(cells)}));
  const verticality=compInfo.length?compInfo.reduce((s,c)=>s+c.cells.length*Math.max(-3,Math.min(3,Math.log2((c.bb.h*cellH)/(c.bb.w*cellW)))),0)/compInfo.reduce((s,c)=>s+c.cells.length,0)/3:0;
  // توزيع المناطق: ثلاثات الارتفاع/العرض
  const zt=[0,0,0],ut=[0,0,0]; for(let r=0;r<GH;r++)for(let c=0;c<GW;c++){ const v=grid[r*GW+c]; if(v>=2&&v!==255){ zt[Math.min(2,(r*3/GH)|0)]++; ut[Math.min(2,(c*3/GW)|0)]++; } }
  const zNorm=zt.map(v=>v/Math.max(1,wallNet)), uNorm=ut.map(v=>v/Math.max(1,wallNet));
  // المدخل
  const ent={area:0,reach:0,width:0,asym:0,present:0};
  const entryOps=analysis.pieces.flatMap(p=>p.entries);
  if(entryOps.length){ const e=entryOps[0], ci=Math.floor((e.cu-u0)/(u1-u0)*GW); const seeds=new Set();
    for(let r=0;r<GH;r++)for(let c=0;c<GW;c++){ const u=u0+(c+.5)*cellW, z=zTop-(r+.5)*cellH; if(u>=e.u0-.3&&u<=e.u1+.3&&z>=e.z0&&z<=e.z1+.3&&grid[r*GW+c]>=2&&grid[r*GW+c]!==255) seeds.add(zones.seen[r*GW+c]); }
    if(seeds.size){ const cells=[]; zones.comps.forEach((cs,k)=>{ if(seeds.has(k+1)) cells.push(...cs); }); const bb=bbox(cells); ent.present=1; ent.area=cells.length/Math.max(1,wallNet); ent.reach=1-bb.r0/GH; ent.width=bb.w/GW; const left=ci-bb.c0, right=bb.c1-ci; ent.asym=Math.abs(left-right)/Math.max(1,left+right); } }
  // تجميع الفتحات
  const wins=analysis.pieces.flatMap(p=>p.windows); const adj=new Map(); let linked=0, ringed=0; const linkComps=new Set();
  for(const w of wins){ const set=new Set(); for(let r=0;r<GH;r++)for(let c=0;c<GW;c++){ const u=u0+(c+.5)*cellW, z=zTop-(r+.5)*cellH; if(u>=w.u0-.2&&u<=w.u1+.2&&z>=w.z0-.2&&z<=w.z1+.2&&grid[r*GW+c]>=2&&grid[r*GW+c]!==255) set.add(zones.seen[r*GW+c]); } adj.set(w.id,set); }
  const compWins=new Map(); for(const [wid,set] of adj) for(const k of set){ if(!compWins.has(k)) compWins.set(k,[]); compWins.get(k).push(wid); }
  let aspectSum=0,aspectN=0; for(const w of wins){ const set=adj.get(w.id); let isLinked=false,isRing=false; for(const k of set){ const n=compWins.get(k).length; if(n>=2){isLinked=true;linkComps.add(k);} else isRing=true; } if(isLinked) linked++; else if(isRing) ringed++; }
  for(const k of linkComps){ const bb=compInfo[k-1].bb; aspectSum+=Math.log2((bb.h*cellH)/(bb.w*cellW)); aspectN++; }
  const group={linkedFrac:wins.length?linked/wins.length:0, ringFrac:wins.length?ringed/wins.length:0, groups:linkComps.size, linkAspect:aspectN?aspectSum/aspectN:0, windows:wins.length};
  // تقسيم الواجهة (أعمدة/صفوف مغطاة)
  const colCov=Array.from({length:GW},(_,c)=>{let n=0,t=0;for(let r=0;r<GH;r++){const v=grid[r*GW+c];if(v===255)continue;t++;if(v>=2)n++;}return t?n/t:0;});
  const rowCov=Array.from({length:GH},(_,r)=>{let n=0,t=0;for(let c=0;c<GW;c++){const v=grid[r*GW+c];if(v===255)continue;t++;if(v>=2)n++;}return t?n/t:0;});
  const runs=(arr,th)=>{const out=[];let s=-1;arr.forEach((v,i)=>{if(v>=th&&s<0)s=i;if((v<th||i===arr.length-1)&&s>=0){const e=v>=th&&i===arr.length-1?i:i-1;out.push([s,e]);s=-1;}});return out;};
  const vDiv=runs(colCov,.85), hDiv=runs(rowCov,.85);
  // خط السقف: سماكة المنطقة العليا لكل عمود
  const thick=[]; for(let c=0;c<GW;c++){ let r=0; while(r<GH&&grid[r*GW+c]===255) r++; let t=0; while(r<GH&&grid[r*GW+c]>=2&&grid[r*GW+c]!==255){t++;r++;} thick.push(t/GH); }
  const tm=thick.reduce((s,v)=>s+v,0)/GW, ts=Math.sqrt(thick.reduce((s,v)=>s+(v-tm)**2,0)/GW);
  // الزوايا
  const endCols=Math.max(2,Math.round(GW*.04)); const endRuns=side=>{ const arr=[];for(let r=0;r<GH;r++){let z=0,t=0;for(let k=0;k<endCols;k++){const c=side==='l'?k:GW-1-k;const v=grid[r*GW+c];if(v===255)continue;t++;if(v>=2)z++;}arr.push(t?z/t:0);} return {cover:arr.reduce((s,v)=>s+v,0)/GH, runs:runs(arr,.5).length}; };
  const cl=endRuns('l'),cr=endRuns('r');
  return { void:r3(voidN/Math.max(1,total)), cover:r3(zoneN/Math.max(1,wallNet)), zoneRegions:compInfo.length, hFrac:r3(hFrac), verticality:r3(verticality), zThirds:zNorm.map(r3), uThirds:uNorm.map(r3),
    entrance:{present:ent.present,area:r3(ent.area),reach:r3(ent.reach),width:r3(ent.width),asym:r3(ent.asym)},
    grouping:{linkedFrac:r3(group.linkedFrac),ringFrac:r3(group.ringFrac),groups:group.groups,linkAspect:r3(group.linkAspect),windows:group.windows},
    divisions:{v:vDiv.length,h:hDiv.length,vPos:vDiv.map(([a,b])=>r3((a+b)/2/GW)),hPos:hDiv.map(([a,b])=>r3((a+b)/2/GH))},
    roof:{thickMean:r3(tm),thickStd:r3(ts)}, corners:{l:{cover:r3(cl.cover),runs:cl.runs},r:{cover:r3(cr.cover),runs:cr.runs}}, _grid:grid };
}
const cap=x=>Math.max(0,Math.min(1,x));
const posDist=(a,b)=>{ if(!a.length&&!b.length) return 0; if(!a.length||!b.length) return 1; const f=(x,y)=>x.reduce((s,v)=>s+Math.min(...y.map(w=>Math.abs(v-w))),0)/x.length; return cap((f(a,b)+f(b,a))/2*4); };
export const DIMENSIONS=[['entrance','استراتيجية المدخل'],['rhythm','إيقاع الفتحات وتجميعها'],['emphasis','الاتجاه الأفقي/الرأسي'],['zoning','توزيع المناطق (المواد كمناطق)'],['blocks','تقسيم الواجهة إلى كتل'],['roof','معالجة السقف'],['corners','معالجة الزوايا']];
export function dimensionDistances(A,B){
  // معايرة: 1 = أقصى اختلاف نمطي ممكن لهذا البُعد؛ لا تُقصّ القيم بسهولة (ثوابت القسمة أوسع من الإصدار الأول).
  const e=a=>a.entrance, g=a=>a.grouping;
  const entrance=(e(A).present||e(B).present)?cap((Math.abs(e(A).area-e(B).area)/.35+Math.abs(e(A).reach-e(B).reach)/1+Math.abs(e(A).width-e(B).width)/.45+Math.abs(e(A).asym-e(B).asym)/1)/4*1.5):0;
  const rhythm=cap((Math.abs(g(A).linkedFrac-g(B).linkedFrac)+Math.abs(g(A).ringFrac-g(B).ringFrac)+Math.abs(g(A).linkAspect-g(B).linkAspect)/2.5+Math.abs(g(A).groups-g(B).groups)/Math.max(2,g(A).windows))/4*1.6);
  const emphasis=cap((Math.abs(A.hFrac-B.hFrac)/.7+Math.abs(A.verticality-B.verticality)/.9)/2);
  const zoning=cap((A.zThirds.reduce((s,v,i)=>s+Math.abs(v-B.zThirds[i]),0)+A.uThirds.reduce((s,v,i)=>s+Math.abs(v-B.uThirds[i]),0))/1.4*.5+Math.abs(A.cover-B.cover)/.8*.5);
  const blocks=cap((Math.abs(A.divisions.v-B.divisions.v)/4+Math.abs(A.divisions.h-B.divisions.h)/3+posDist(A.divisions.vPos,B.divisions.vPos)+posDist(A.divisions.hPos,B.divisions.hPos))/4*1.2);
  const roof=cap((Math.abs(A.roof.thickMean-B.roof.thickMean)/.12+Math.abs(A.roof.thickStd-B.roof.thickStd)/.06)/2);
  const corners=cap(((Math.abs(A.corners.l.cover-B.corners.l.cover)+Math.abs(A.corners.r.cover-B.corners.r.cover))/1.2+(Math.abs(A.corners.l.runs-B.corners.l.runs)+Math.abs(A.corners.r.runs-B.corners.r.runs))/8)/2*1.5);
  return {entrance,rhythm,emphasis,zoning,blocks,roof,corners};
}
export const levelOf=d=>d<.2?'same':d<.45?'moderate':'different';
export const LEVEL_AR={same:'متشابه',moderate:'اختلاف متوسط',different:'مختلف'};
export function edgeDistance(gridA,gridB,opts){ // 1 - IoU للحواف المنفوخة بخلية واحدة
  const ea=edgeMask(gridA,opts), eb=edgeMask(gridB,opts); const dil=m=>{const o=new Uint8Array(m.length);for(let r=0;r<GH;r++)for(let c=0;c<GW;c++)if(m[r*GW+c])for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<GH&&cc>=0&&cc<GW)o[rr*GW+cc]=1;}return o;};
  const da=dil(ea), db=dil(eb); let i=0,u=0; for(let k=0;k<da.length;k++){ if(da[k]&&db[k]) i++; if(da[k]||db[k]) u++; } return u?1-i/u:0; }
export function compareSignatures(A,B){
  const d=dimensionDistances(A,B), dims=DIMENSIONS.map(([k,ar])=>({key:k,ar,distance:r3(d[k]),level:levelOf(d[k])}));
  const novelty=r3(dims.reduce((s,x)=>s+x.distance,0)/dims.length), differentDims=dims.filter(x=>x.level==='different').length, movedDims=dims.filter(x=>x.level!=='same').length;
  const edge=r3(edgeDistance(A._grid,B._grid,{zoneOnly:true}));
  return {dims,novelty,differentDims,movedDims,edgeZone:edge,edgeAll:r3(edgeDistance(A._grid,B._grid,{zoneOnly:false}))};
}
export const NOVELTY_RULE={minNovelty:.35,minDifferentDims:4,minEdge:.35}; // معايرة أولية — موثقة في التقرير
export function verdict(cmp,rule=NOVELTY_RULE){ const ok=cmp.novelty>=rule.minNovelty&&cmp.differentDims>=rule.minDifferentDims&&cmp.edgeZone>=rule.minEdge; return {accepted:ok, overall:ok?(cmp.novelty>=.45?'جيد':'مقبول'):'قريب جدًا (مرفوض كتكرار)'}; }
