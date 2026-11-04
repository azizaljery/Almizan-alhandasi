// أدوات مشتركة للاختبارات العدائية. لا تعدّل المولد؛ تبني حالات وتقيس بمقاييس مستقلة عنه.
import { runBuilding } from '../../dist/facade-kit/concepts/run.mjs';
import { analyzeFacade } from '../../dist/facade-kit/concepts/analyze.mjs';
import { moves, GROUP_ORDER, TONE_GREY, AXES } from '../../dist/facade-kit/concepts/vocabulary.mjs';
import { signature, compareSignatures, verdict, dimensionDistances, DIMENSIONS, GW, GH } from '../../dist/facade-kit/concepts/signature.mjs';
import { realize, assess } from '../../dist/facade-kit/concepts/generate.mjs';
import { layerMask, intersection, difference, union, multiArea, bounds, rect } from '../../dist/facade-kit/src/polygons.mjs';
export { signature, compareSignatures, verdict, dimensionDistances, DIMENSIONS, realize, assess, analyzeFacade, moves, TONE_GREY, AXES, GW, GH, runBuilding };
const cache={};
export async function ctx(name){ if(!cache[name]){ const r=await runBuilding(name); const a=analyzeFacade(r.built,r.front); cache[name]={name,r,a,built:r.built,front:r.front,doc:r.doc,transforms:r.transforms}; } return cache[name]; }
export function mulberry(a){ return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
/** مناطق الوصفة كصناديق قابلة للتعديل */
export function zonesOf(a,p){ return moves(a,p).map(z=>({piece:z.piece,name:z.name,group:z.group,tone:z.tone,box:z.box||null,ring:z.ring})); }
const rc=(b)=>rect(b.u0,b.z0,b.u1,b.z1);
/** مناطق → مكوّنات بنفس منطق المولد (أولوية المجموعة، قصّ بقناع الجدار، طرح المتقدّم) */
export function compsOf(a,built,side,zones,{order=true}={}){
  const zs=order?[...zones].sort((x,y)=>GROUP_ORDER.indexOf(x.group)-GROUP_ORDER.indexOf(y.group)):zones;
  const walls=Object.fromEntries(built[side].layers.filter(l=>l.role==='wall').map(l=>[l.piece,layerMask(l)])), taken=[], comps=[];
  for(const z of zs){ const ring=z.ring||rc(z.box); let mp=intersection(walls[z.piece],[[ring]]); if(!mp.length) continue; const full=mp; const prior=taken.filter(t=>t.piece===z.piece).map(t=>t.mp); if(prior.length) mp=difference(mp,union(...prior)); taken.push({piece:z.piece,mp:full});
    mp.forEach((poly,k)=>{ if(multiArea([poly])<5e-2) return; const bb=bounds([poly]); if(Math.min(bb.u1-bb.u0,bb.z1-bb.z0)<.1) return; comps.push({name:`${z.name}#${k}`,piece:z.piece,tone:z.tone,group:z.group,poly,mp:[poly],bb,area:multiArea([poly])}); }); }
  return comps;
}
export const sigOf=(a,comps)=>signature(a,comps);
export const emptySig=a=>signature(a,[]);
export function judge(sa,sb){ const c=compareSignatures(sa,sb), v=verdict(c); return {novelty:c.novelty,differentDims:c.differentDims,movedDims:c.movedDims,edgeZone:c.edgeZone,edgeAll:c.edgeAll,accepted:v.accepted,verdictAr:v.overall,dims:Object.fromEntries(c.dims.map(d=>[d.key,d.distance]))}; }
/** محور القيادة المحقق: البُعد الأعلى مساهمةً مقارنةً بواجهة بلا مناطق (مقياس المختبِر المستقل، لا وسوم المولد) */
export function leadAxis(a,sig){ const d=dimensionDistances(sig,emptySig(a)); const e=Object.entries(d).sort((x,y)=>y[1]-x[1]); return {lead:e[0][0],profile:Object.fromEntries(e.map(([k,v])=>[k,+v.toFixed(3)]))}; }
/** اختلاف الشبكة المصنفة (نسبة الخلايا المختلفة) ومتوسط فرق القيمة الرمادية: «الحقيقة البصرية» التقريبية */
export function gridDiff(sa,sb){ const A=sa._grid,B=sb._grid; let d=0,n=0,v=0; for(let i=0;i<A.length;i++){ if(A[i]===255) continue; n++; if(A[i]!==B[i]) d++; v+=Math.abs(grey(A[i])-grey(B[i])); } return {cellsDiffer:+(d/n).toFixed(4),valueMAD:+(v/n).toFixed(4)}; }
const TONE_BY_ID={0:'base',1:'void',2:'light',3:'mid',4:'dark',5:'accent'};
export const grey=id=>id===1?.2:TONE_GREY[TONE_BY_ID[id]]??.8;
export function jitter(zones,rng,d){ return zones.map(z=>z.box?{...z,box:{u0:z.box.u0+(rng()*2-1)*d,u1:z.box.u1+(rng()*2-1)*d,z0:z.box.z0+(rng()*2-1)*d,z1:z.box.z1+(rng()*2-1)*d}}:z); }
export function mirror(a,comps){ const {u0,u1}=a.frame, m=u=>u0+u1-u, mp=poly=>poly.map(r=>r.map(([u,z])=>[m(u),z]).reverse());
  const a2={...a,pieces:a.pieces.map(p=>({...p,bb:{...p.bb,u0:m(p.bb.u1),u1:m(p.bb.u0)},ops:p.ops.map(o=>({...o,u0:m(o.u1),u1:m(o.u0),cu:m(o.cu)})).sort((x,y)=>x.u0-y.u0),windows:p.windows.map(o=>({...o,u0:m(o.u1),u1:m(o.u0),cu:m(o.cu)})),entries:p.entries.map(o=>({...o,u0:m(o.u1),u1:m(o.u0),cu:m(o.cu)}))}))};
  const c2=comps.map(c=>{ const poly=mp(c.poly); return {...c,poly,mp:[poly],bb:{...c.bb,u0:m(c.bb.u1),u1:m(c.bb.u0)}}; }); return {a:a2,comps:c2}; }
/** فحص وضوح الفتحة (مستقل): أقل تباين قيمة بين زجاج/باب والمنطقة الملاصقة */
export function legibility(a,comps){ let worst=1,viol=0,total=0; for(const p of a.pieces)for(const o of p.ops){ total++; const glass=o.entry?.17:.25; let mn=1,touch=false; for(const c of comps.filter(c=>c.piece===p.piece)){ const near=c.bb.u1>=o.u0-.2&&c.bb.u0<=o.u1+.2&&c.bb.z1>=o.z0-.2&&c.bb.z0<=o.z1+.2; if(!near) continue; touch=true; mn=Math.min(mn,Math.abs(TONE_GREY[c.tone]-glass)); } if(touch&&mn<.15){ viol++; } worst=Math.min(worst,touch?mn:1); } return {worstContrast:+worst.toFixed(3),lowContrastOpenings:viol,openings:total}; }
/** هل كل مكوّن متصل بمرجع معماري (أرض/خط سقف/طرف جدار/فتحة)؟ مقياس مستقل لمنع «الملصقات» */
export function stickers(a,comps){ let n=0; const bad=[]; for(const c of comps){ const p=a.pieces.find(p=>p.piece===c.piece), b=p.bb, t=.06; const datum=c.bb.z0<=b.z0+t||c.bb.z1>=b.z1-t||c.bb.u0<=b.u0+t||c.bb.u1>=b.u1-t||p.ops.some(o=>c.bb.u1>=o.u0-.35&&c.bb.u0<=o.u1+.35&&c.bb.z1>=o.z0-.35&&c.bb.z0<=o.z1+.35); if(!datum){ n++; bad.push(c.name); } } return {floating:n,names:bad}; }
export function scaleDoc(doc,k){ const d=structuredClone(doc); const S=p=>({x:p.x*k,y:p.y}); d.walls=d.walls.map(w=>({...w,a:S(w.a),b:S(w.b)})); d.openings=d.openings.map(o=>({...o,at:o.at*k,w:o.w*k})); d.plot.polygon=d.plot.polygon.map(S); return d; }
export function shuffle(arr,rng){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
import { buildAllSides as _bas, sideTransform as _st } from '../../dist/facade-realism/model.mjs';
export function buildScaled(doc){ let built; for(const v of ['B','A','C']){ try{ built=_bas(doc,v); break; }catch{} } const transforms=Object.fromEntries(Object.keys(built).map(s=>[s,_st(s,built[s].off)])); return {built,transforms,front:doc.entry||'s'}; }
