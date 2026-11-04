// المرحلة 1.2 — R2: وضوح الفتحات (FRAME/ACCENT/ADJACENT/OCCLUSION) + دعم العناصر (لا عنصر عائم).
import { intersection, multiArea, rect } from '../src/polygons.mjs';
import { TONE_GREY } from './vocabulary.mjs';
export const OPENING_GREY={window:.25,door:.17}; // قيمة الزجاج/الباب كما تُقرأ في اختبار الرمادي
export const LEGIBILITY={lowContrast:.15, nearStrip:.08, frameBand:.30, beyondStrip:.50, swallowedSides:.5};
const greyOf=c=>TONE_GREY[c.tone]??TONE_GREY.base;
function stripCover(comps,piece,box,bb,og){ // نسبة ما في الشريط من منطقة منخفضة التباين مع الفتحة، ونسبة ما تغطيه أي منطقة
  const u0=Math.max(box.u0,bb.u0),u1=Math.min(box.u1,bb.u1),z0=Math.max(box.z0,bb.z0),z1=Math.min(box.z1,bb.z1); if(u1-u0<1e-6||z1-z0<1e-6) return null;
  const R=[[rect(u0,z0,u1,z1)]], area=(u1-u0)*(z1-z0); let low=0,any=0;
  for(const c of comps) if(c.piece===piece){ const a=multiArea(intersection(c.mp,R)); if(a<=0) continue; any+=a; if(Math.abs(greyOf(c)-og)<LEGIBILITY.lowContrast) low+=a; }
  // الجدار الأساس يتباين مع الفتحة؛ إن كان الفرق صغيرًا فهو أيضًا منخفض التباين (لا يحدث بالقيم الحالية)
  const baseLow=Math.abs(TONE_GREY.base-og)<LEGIBILITY.lowContrast; if(baseLow) low+=area-any;
  return {low:low/area,any:any/area,len:Math.max(u1-u0,z1-z0)}; }
/** تصنيف علاقة كل منطقة/مجموعة مع كل فتحة: NONE | ADJACENT | ACCENT | FRAME | OCCLUSION */
export function classifyOpenings(analysis,comps){
  const out=[]; const {nearStrip:n,frameBand:f,beyondStrip:b}=LEGIBILITY;
  for(const p of analysis.pieces) for(const o of p.ops){ const og=o.entry?OPENING_GREY.door:OPENING_GREY.window;
    const sides={ L:[{u0:o.u0-n,u1:o.u0,z0:o.z0,z1:o.z1},{u0:o.u0-f-b,u1:o.u0-f,z0:o.z0,z1:o.z1}], R:[{u0:o.u1,u1:o.u1+n,z0:o.z0,z1:o.z1},{u0:o.u1+f,u1:o.u1+f+b,z0:o.z0,z1:o.z1}],
      B:[{u0:o.u0,u1:o.u1,z0:o.z0-n,z1:o.z0},{u0:o.u0,u1:o.u1,z0:o.z0-f-b,z1:o.z0-f}], T:[{u0:o.u0,u1:o.u1,z0:o.z1,z1:o.z1+n},{u0:o.u0,u1:o.u1,z0:o.z1+f,z1:o.z1+f+b}] };
    let per=0,swallowed=0,lowNear=0,anyNear=0,sidesN=0,sidesLow=0,sidesAny=0;
    for(const [k,[near,beyond]] of Object.entries(sides)){ const a=stripCover(comps,p.piece,near,p.bb,og); if(!a) continue; sidesN++; per+=a.len; const bw=stripCover(comps,p.piece,beyond,p.bb,og);
      if(a.any>.3) sidesAny++; if(a.low>=.6){ sidesLow++; lowNear+=a.len; // ضمن النطاق القريب منخفض التباين: إطار رقيق أم ابتلاع؟
        if(!bw||bw.low>=.5) { swallowed+=a.len; } } }
    const frac=per?swallowed/per:0; let cls='NONE';
    if(frac>=LEGIBILITY.swallowedSides) cls='OCCLUSION'; else if(sidesLow>=3) cls='FRAME'; else if(sidesAny>=1&&sidesAny<=2) cls='ACCENT'; else if(sidesAny>=3) cls='FRAME'; else { const near=comps.some(c=>c.piece===p.piece&&c.bb.u1>=o.u0-.3&&c.bb.u0<=o.u1+.3&&c.bb.z1>=o.z0-.3&&c.bb.z0<=o.z1+.3); if(near) cls='ADJACENT'; }
    out.push({piece:p.piece,id:o.id,entry:o.entry,cls,swallowedFrac:+frac.toFixed(3)}); }
  return out; }
/** دعم العناصر: كل مكوّن يلامس مرجعًا (أرض/خط سقف/طرف جدار/فتحة) أو مكوّنًا مدعومًا؛ وإلا فهو عائم. */
export const SUPPORT_MODE={strict:true}; // strict (الافتراضي، يطابق تعريف المراجِع للعنصر العائم): كل عنصر يلامس مرجعًا مباشرًا؛ strict=false: يكفي الاتصال بسلسلة عناصر مدعومة
export function unsupported(analysis,comps){
  const T=.06,G=.05; const sup=comps.map(c=>{ const p=analysis.pieces.find(p=>p.piece===c.piece), b=p.bb;
    return c.bb.z0<=b.z0+T||c.bb.z1>=b.z1-T||c.bb.u0<=b.u0+T||c.bb.u1>=b.u1-T||p.ops.some(o=>c.bb.u1>=o.u0-.35&&c.bb.u0<=o.u1+.35&&c.bb.z1>=o.z0-.35&&c.bb.z0<=o.z1+.35); });
  const segs=c=>c.poly.flatMap(r=>r.slice(0,-1).map((p,k)=>[p,r[k+1]])), pts=c=>segs(c).flatMap(([a,b])=>{ const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25)); return Array.from({length:n+1},(_,t)=>[a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n]); });
  const dseg=(p,[a,b])=>{ const dx=b[0]-a[0],dz=b[1]-a[1],L2=dx*dx+dz*dz||1e-12; let t=((p[0]-a[0])*dx+(p[1]-a[1])*dz)/L2; t=Math.max(0,Math.min(1,t)); return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz); };
  const cache=new Map(); const P=c=>cache.get(c)||(cache.set(c,{pts:pts(c),segs:segs(c)}),cache.get(c)), cellNear=(a,b)=>a.piece===b.piece&&a.bb.u1>=b.bb.u0-G&&a.bb.u0<=b.bb.u1+G&&a.bb.z1>=b.bb.z0-G&&a.bb.z0<=b.bb.z1+G;
  const near=(a,b)=>{ if(!cellNear(a,b)) return false; const A=P(a),B=P(b); return A.pts.some(p=>B.segs.some(s=>dseg(p,s)<=G))||B.pts.some(p=>A.segs.some(s=>dseg(p,s)<=G)); };
  for(let ch=!SUPPORT_MODE.strict;ch;){ ch=false; for(let i=0;i<comps.length;i++) if(!sup[i]) for(let j=0;j<comps.length;j++) if(sup[j]&&near(comps[i],comps[j])){ sup[i]=true; ch=true; break; } }
  return comps.filter((_,i)=>!sup[i]).map(c=>c.name); }
