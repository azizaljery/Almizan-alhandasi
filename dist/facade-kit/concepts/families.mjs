// R7 — طبقة العائلة المعمارية (بحثية v0). من الناتج المتحقق فقط: عناصر متصلة على شبكة التوقيع، لا أسماء الوصفات.
// الأسماء بداية بحثية قابلة للتعديل، وليست تصنيفًا نهائيًا.
import { GW, GH } from './signature.mjs';
export const FAMILY_V0=['HORIZONTAL_BANDED','VERTICAL_FRAME','ENTRANCE_DOMINANT','OPENING_RHYTHM','MASS_ZONED'];
export const FAMILY_AR={HORIZONTAL_BANDED:'أشرطة أفقية',VERTICAL_FRAME:'إطار رأسي',ENTRANCE_DOMINANT:'مدخل مسيطر',OPENING_RHYTHM:'إيقاع الفتحات',MASS_ZONED:'تقسيم كتلي',ASYMMETRIC_COMPOSITION:'تكوين غير متماثل'};
export function realisedElements(analysis,sig){ const G=sig._grid, {u0,u1,zTop}=analysis.frame, cw=(u1-u0)/GW, ch=zTop/GH, id=new Int32Array(G.length).fill(-1), els=[];
  const ent=analysis.pieces.flatMap(p=>p.entries), win=analysis.pieces.flatMap(p=>p.windows);
  for(let i=0;i<G.length;i++){ if(G[i]<2||G[i]===255||id[i]>=0) continue; const st=[i], k=els.length; id[i]=k; let n=0,bd=0,r0=GH,r1=0,c0=GW,c1=0,nearE=0,nearW=0,cu=0;
    while(st.length){ const x=st.pop(); n++; const r=(x/GW)|0,c=x%GW; r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c); const u=u0+(c+.5)*cw, z=zTop-(r+.5)*ch; cu+=u; if([c>0?x-1:-1,c<GW-1?x+1:-1,r>0?x-GW:-1,r<GH-1?x+GW:-1].some(y=>y<0||G[y]!==G[x])) bd++;
      if(ent.some(e=>u>=e.u0-.5&&u<=e.u1+.5&&z<=e.z1+.4)) nearE++; else if(win.some(w=>u>=w.u0-.25&&u<=w.u1+.25&&z>=w.z0-.25&&z<=w.z1+.25)) nearW++;
      for(const y of [c>0?x-1:-1,c<GW-1?x+1:-1,r>0?x-GW:-1,r<GH-1?x+GW:-1]) if(y>=0&&id[y]<0&&G[y]===G[x]){ id[y]=k; st.push(y);} }
    const w=(c1-c0+1)*cw, h=(r1-r0+1)*ch; els.push({cells:n,edge:bd,w,h,wFrac:w/(u1-u0),hFrac:h/zTop,entFrac:nearE/n,winFrac:nearW/n,cu:cu/n}); }
  return els; }
/** درجات العائلات = حصة حواف العناصر التي تحمل سمة كل عائلة. الأساسية = الأعلى، الثانوية = التالية إن ≥ 0.15. */
export function classifyFamily(analysis,sig){ const els=realisedElements(analysis,sig), tot=els.reduce((s,e)=>s+e.cells,0)||1, totE=els.reduce((s,e)=>s+e.edge,0)||1, sc=Object.fromEntries(FAMILY_V0.map(f=>[f,0]));
  for(const e of els){ const a=e.edge/totE; // وزن بالحواف: البنية التي تُرى، لا مساحة الخلفية
    if(e.entFrac>=.25) sc.ENTRANCE_DOMINANT+=a;
    else if(e.winFrac>=.35) sc.OPENING_RHYTHM+=a;
    else if(e.w/e.h>=4&&e.wFrac>=.5) sc.HORIZONTAL_BANDED+=a;
    else if(e.h/e.w>=1.5&&e.hFrac>=.7) sc.VERTICAL_FRAME+=a;
    else sc.MASS_ZONED+=a; }
  const ranked=FAMILY_V0.slice().sort((x,y)=>sc[y]-sc[x]||FAMILY_V0.indexOf(x)-FAMILY_V0.indexOf(y));
  const fr=analysis.frame, mid=(fr.u0+fr.u1)/2, cen=els.reduce((s,e)=>s+e.cu*e.cells,0)/tot, asym=Math.abs(cen-mid)/(fr.u1-fr.u0);
  return {primary:ranked[0],secondary:sc[ranked[1]]>=.15?ranked[1]:null,scores:Object.fromEntries(FAMILY_V0.map(f=>[f,+sc[f].toFixed(3)])),asymmetric:asym>=.1,elements:els.length}; }
