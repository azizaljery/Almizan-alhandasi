// R3 — التغطية المتحققة (Realised Diversity Coverage): تُقاس من الناتج الهندسي النهائي لا من وسوم المولّد.
// كل مكوّن محقَّق يُنسب إلى عائلة استراتيجية بموقعه الهندسي (بالأولوية) ثم تُحسب حصة كل عائلة من «الثقل البصري» (مساحة + محيط).
export const FAMILIES=['entrance','opening-rhythm','edges','mass-zoning'];
export const FAMILY_AR={'entrance':'قيادة المدخل','opening-rhythm':'قيادة إيقاع الفتحات','edges':'قيادة خط السقف/الأطراف','mass-zoning':'قيادة الكتل والتقسيم'};
const G=.06;
function perim(c){ return c.poly.reduce((s,r)=>s+r.slice(0,-1).reduce((q,p,k)=>q+Math.hypot(r[k+1][0]-p[0],r[k+1][1]-p[1]),0),0); }
export function familyOf(analysis,c){
  const p=analysis.pieces.find(p=>p.piece===c.piece), b=p.bb;
  if(p.entries.some(e=>c.bb.u1>=e.u0-.7&&c.bb.u0<=e.u1+.7&&c.bb.z0<=e.z1+.3)) return 'entrance';
  if(p.windows.some(w=>c.bb.u1>=w.u0-.2&&c.bb.u0<=w.u1+.2&&c.bb.z1>=w.z0-.2&&c.bb.z0<=w.z1+.2)) return 'opening-rhythm';
  if(c.bb.z1>=b.z1-G||c.bb.u0<=b.u0+G||c.bb.u1>=b.u1-G) return 'edges';
  return 'mass-zoning'; }
/** الملف الشخصي المتحقق: الاستراتيجية السائدة والثانوية والاتجاه والاتزان وإقليم التغطية */
export function realisedProfile(analysis,comps,sig){
  const w=Object.fromEntries(FAMILIES.map(f=>[f,0])); let tot=0, cu=0, A=0;
  for(const c of comps){ const f=familyOf(analysis,c), s=c.area+.15*perim(c); w[f]+=s; tot+=s; cu+=c.area*(c.bb.u0+c.bb.u1)/2; A+=c.area; }
  const share=Object.fromEntries(FAMILIES.map(f=>[f,tot?+(w[f]/tot).toFixed(3):0])), ranked=FAMILIES.slice().sort((a,b)=>share[b]-share[a]||FAMILIES.indexOf(a)-FAMILIES.indexOf(b));
  const fr=analysis.frame, mid=(fr.u0+fr.u1)/2, asym=A?Math.abs(cu/A-mid)/(fr.u1-fr.u0):0, v=sig?.verticality??0;
  const orientation=v>0.1?'vertical':v<-0.3?'horizontal':'balanced', balance=asym>=.1?'asymmetric':'symmetric';
  return {dominant:ranked[0],secondary:ranked[1],share,orientation,balance,asym:+asym.toFixed(3),region:`${ranked[0]}/${orientation}`}; }
/** ثلاثية تغطي مناطق مختلفة فعلًا: ثلاث عائلات سائدة مختلفة. */
export const coversDistinctRegions=profiles=>new Set(profiles.map(p=>p.dominant)).size===profiles.length;
