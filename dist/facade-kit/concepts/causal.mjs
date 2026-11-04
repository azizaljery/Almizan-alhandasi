// R6 — إزالة التلوّث السببي: الفرق بين مفهومين يُنسب إلى «عناصر متحققة» (مكوّنات متصلة بنغمة واحدة على شبكة التوقيع)،
// ولكل عنصر إقليم واحد (مدخل/فتحات/أعلى/أطراف/كتلة) بالأغلبية. عدد الأقاليم المستقلة التي تحمل ≥ 8% من الفرق = عدد الأسباب المستقلة.
// سبب واحد كبير (عمود مدخل بارتفاع كامل، أو تقسيم ثلاثي) يُعدّ سببًا واحدًا مهما حرّك من أبعاد التوقيع.
import { GW, GH } from './signature.mjs';
export const CAUSAL_RULE={minShare:.08,minIndependentCauses:2,version:'v0-experimental'};
const REG_OF_DIM={entrance:'entrance',rhythm:'windows',roof:'top',corners:'ends',zoning:'mass',blocks:'mass',emphasis:'mass'};
const cache=new WeakMap();
function regionMap(a){ if(cache.has(a)) return cache.get(a); const {u0,u1,zTop}=a.frame, cw=(u1-u0)/GW, ch=zTop/GH, m=new Array(GW*GH).fill(null);
  for(let r=0;r<GH;r++)for(let c=0;c<GW;c++){ const u=u0+(c+.5)*cw, z=zTop-(r+.5)*ch; const p=a.pieces.find(p=>u>=p.bb.u0-1e-6&&u<=p.bb.u1+1e-6&&z>=p.bb.z0-1e-6&&z<=p.bb.z1+1e-6); if(!p) continue;
    m[r*GW+c]=p.entries.some(e=>u>=e.u0-.7&&u<=e.u1+.7&&z<=e.z1+.4)?'entrance':p.windows.some(w=>u>=w.u0-.25&&u<=w.u1+.25&&z>=w.z0-.25&&z<=w.z1+.25)?'windows':z>=p.bb.z1-.6?'top':(u<=p.bb.u0+.6||u>=p.bb.u1-.6)?'ends':'mass'; }
  cache.set(a,m); return m; }
function elements(G,m){ const id=new Int32Array(G.length).fill(-1), anchor=[]; let k=0; for(let i=0;i<G.length;i++){ if(G[i]<2||G[i]===255||id[i]>=0) continue; const st=[i], cnt={}; id[i]=k; while(st.length){ const x=st.pop(); if(m[x]) cnt[m[x]]=(cnt[m[x]]||0)+1; const r=(x/GW)|0,c=x%GW; for(const y of [c>0?x-1:-1,c<GW-1?x+1:-1,r>0?x-GW:-1,r<GH-1?x+GW:-1]) if(y>=0&&id[y]<0&&G[y]===G[x]){ id[y]=k; st.push(y);} } anchor.push(Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]?.[0]||'mass'); k++; } return {id,anchor}; }
export function independentCauses(analysis,sa,sb,cmp,rule=CAUSAL_RULE){ const m=regionMap(analysis), A=sa._grid,B=sb._grid, EA=elements(A,m), EB=elements(B,m), cnt={}; let t=0;
  for(let i=0;i<A.length;i++){ if(A[i]===255||A[i]===B[i]) continue; const reg=EB.id[i]>=0?EB.anchor[EB.id[i]]:EA.id[i]>=0?EA.anchor[EA.id[i]]:m[i]; if(!reg) continue; cnt[reg]=(cnt[reg]||0)+1; t++; }
  const share=Object.fromEntries(Object.entries(cnt).map(([k,v])=>[k,+(v/Math.max(1,t)).toFixed(3)])); const d=Object.fromEntries(cmp.dims.map(x=>[x.key,x.distance])); const regs=new Set();
  for(const [dim,reg] of Object.entries(REG_OF_DIM)) if(d[dim]>=.45&&(share[reg]||0)>=rule.minShare) regs.add(reg);
  return {count:regs.size,regions:[...regs].sort(),share,ok:regs.size>=rule.minIndependentCauses}; }
