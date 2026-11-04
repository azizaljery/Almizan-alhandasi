// مفردات معمارية قابلة للتركيب. كل حركة تُرجع مناطق مسطحة [{name,piece,ring,tone,group}] ضمن حدود الجدار — بلا بروز.
// المناطق تتحدد بهندسة الواجهة الفعلية (فتحات/فجوات/ارتفاعات)؛ لا لون ولا اسم خامة هنا (النغمة tone فئة قيمة لا لون).
import { rect } from '../src/polygons.mjs';
const rc=(u0,z0,u1,z1)=>rect(u0,z0,u1,z1);
const inter=(a,b)=>Math.max(0,Math.min(a.u1,b.u1)-Math.max(a.u0,b.u0))*Math.max(0,Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0));
/** يضبط مستطيلًا ليتجنب «قص زاوية» فتحة (تقاطع جزئي في المحورين). المستطيل الذي يحتوي الفتحة أو يمر عبرها بالكامل في محور واحد مقبول. */
function fit(r, ops, keep=null) {
  let b={...r};
  for(let pass=0;pass<4;pass++){ let changed=false;
    for(const o of ops){ const ov=inter(b,o); if(ov<=1e-9) continue;
      const containsU=b.u0<=o.u0+1e-9&&b.u1>=o.u1-1e-9, containsZ=b.z0<=o.z0+1e-9&&b.z1>=o.z1-1e-9;
      if(containsU||containsZ) continue; // تحتويها أو تعبرها في محور: القناع يحفرها بنظافة
      const cx=(b.u0+b.u1)/2;
      if(keep&&o.cu>=keep.u0&&o.cu<=keep.u1){ /* لا نقصّ جهة المدخل الأساسي */ }
      if(o.cu>=cx) b.u1=Math.min(b.u1,o.u0-.08); else b.u0=Math.max(b.u0,o.u1+.08); changed=true; }
    if(!changed) break; }
  return b.u1-b.u0>=.12&&b.z1-b.z0>=.08?b:null;
}
const clampB=(b,bb)=>({u0:Math.max(bb.u0,b.u0),u1:Math.min(bb.u1,b.u1),z0:Math.max(bb.z0,b.z0),z1:Math.min(bb.z1,b.z1)});
export const AXES={
  entrance:['portal-panel','tower-shaft','pilasters','canopy-band','plain','side-block'],
  grouping:['rings','vertical-strips','ribbon','panel','head-line'],
  emphasis:['horizontal-courses','vertical-rhythm','none'],
  zoning:['base','tripartite','side-split','attic','monolithic'],
  roof:['thin-cap','deep-fascia','stepped','none','raised-entry'],
  corner:['posts-both','post-one','quoins','none'],
};
export const PALETTES={ // ترتيب القيمة محفوظ في كل لوحة: light أفتح من mid أفتح من dark؛ الجدار الأساس render ثابت في النواة
  P1:{light:'stone',mid:'beigeStone',dark:'darkRender',accent:'bronze'},
  P2:{light:'beigeStone',mid:'wood',dark:'metal',accent:'bronze'},
  P3:{light:'stone',mid:'bronze',dark:'metal',accent:'wood'},
};
export const TONE_GREY={base:.80,light:.92,mid:.62,dark:.30,accent:.46}; // قيمة رمادية لكل فئة نغمة (اختبار الرمادي)
/** يرجع مناطق مرتبة بالأولوية؛ الأولى تغلب الثانية عند التداخل (يُطرَح لاحقًا في generate). */
export function moves(a, p) { // a: تحليل جهة، p: {entrance,grouping,emphasis,zoning,roof,corner,seed:{h,w,...}}
  const out=[], push=(piece,name,b,tone,group,ring=null)=>{ if(b||ring) out.push({piece:piece.piece,name:`${group}-${name}`,ring:ring||rc(b.u0,b.z0,b.u1,b.z1),tone,group,box:b}); };
  for(const pc of a.pieces){
    const {bb}=pc, ops=pc.ops, W=pc.windows, E=pc.entries;
    const F=(b,k)=>{ if(!b) return null; const c=clampB(b,bb); return c.u1-c.u0>=.12&&c.z1-c.z0>=.08?fit(c,ops,k):null; };
    // ---- المدخل
    for(const e of E){ const k={u0:e.u0,u1:e.u1};
      if(p.entrance==='portal-panel') push(pc,'panel-'+e.id,F({u0:e.u0-.55,u1:e.u1+.55,z0:bb.z0,z1:Math.min(bb.z1,e.z1+.6)},k),'accent','entrance');
      if(p.entrance==='tower-shaft') push(pc,'shaft-'+e.id,F({u0:e.cu-e.w/2-.55,u1:e.cu+e.w/2+.55,z0:bb.z0,z1:bb.z1},k),'accent','entrance');
      if(p.entrance==='pilasters'){ push(pc,'pl-'+e.id,F({u0:e.u0-.5,u1:e.u0-.12,z0:bb.z0,z1:Math.min(bb.z1,e.z1+.4)},k),'mid','entrance'); push(pc,'pr-'+e.id,F({u0:e.u1+.12,u1:e.u1+.5,z0:bb.z0,z1:Math.min(bb.z1,e.z1+.4)},k),'mid','entrance'); push(pc,'lintel-'+e.id,F({u0:e.u0-.5,u1:e.u1+.5,z0:e.z1+.02,z1:e.z1+.4},k),'dark','entrance'); }
      if(p.entrance==='canopy-band') push(pc,'band-'+e.id,F({u0:e.u0-1.5,u1:e.u1+1.5,z0:e.z1+.12,z1:e.z1+.52},k),'dark','entrance');
      if(p.entrance==='plain') push(pc,'ring-'+e.id,F({u0:e.u0-.1,u1:e.u1+.1,z0:bb.z0,z1:Math.min(bb.z1,e.z1+.1)},k),'mid','entrance');
      if(p.entrance==='side-block'){ const left=(e.cu-bb.u0)<(bb.u1-e.cu), target=left?e.u1+1.0:e.u0-1.0;
        const gaps=pc.gapsU.filter(g=>left?g[1]>target:g[0]<target).sort((x,y)=>Math.abs((x[0]+x[1])/2-target)-Math.abs((y[0]+y[1])/2-target)); const cut=gaps.length?Math.min(Math.max((gaps[0][0]+gaps[0][1])/2,left?e.u1+.3:bb.u0),left?bb.u1:e.u0-.3):target;
        push(pc,'block-'+e.id,F(left?{u0:bb.u0,u1:cut,z0:bb.z0,z1:bb.z1}:{u0:cut,u1:bb.u1,z0:bb.z0,z1:bb.z1},k),'mid','entrance'); } }
    // ---- تجميع الفتحات
    if(W.length){
      if(p.grouping==='rings') for(const w of W) push(pc,'ring-'+w.id,F({u0:w.u0-.13,u1:w.u1+.13,z0:w.z0-.13,z1:w.z1+.13}),'mid','opening');
      if(p.grouping==='vertical-strips') for(const w of W) push(pc,'col-'+w.id,F({u0:w.u0-.2,u1:w.u1+.2,z0:bb.z0,z1:bb.z1}),'light','opening');
      if(p.grouping==='ribbon'){ const rows=[]; for(const w of W){ const row=rows.find(r=>Math.min(r.z1,w.z1)-Math.max(r.z0,w.z0)>.5*Math.min(r.z1-r.z0,w.z1-w.z0)); if(row){row.ws.push(w);row.z0=Math.min(row.z0,w.z0);row.z1=Math.max(row.z1,w.z1);} else rows.push({z0:w.z0,z1:w.z1,ws:[w]}); }
        rows.forEach((r,k)=>{ const ws=r.ws.sort((x,y)=>x.u0-y.u0); const split=[]; let cur=[]; for(const w of ws){ const blocked=E.some(e=>e.u0>(cur.at(-1)?.u1??w.u0)&&e.u1<w.u0); if(blocked&&cur.length){split.push(cur);cur=[];} cur.push(w);} if(cur.length)split.push(cur);
          split.forEach((g,j)=>push(pc,`rib-${k}-${j}`,F({u0:g[0].u0-.22,u1:g.at(-1).u1+.22,z0:r.z0-.2,z1:r.z1+.2}),'dark','opening')); }); }
      if(p.grouping==='panel'){ const groups=[]; for(const w of W){ const g=groups.at(-1); if(g&&w.u0-g.u1<2.2) { g.u1=w.u1; g.z0=Math.min(g.z0,w.z0); g.z1=Math.max(g.z1,w.z1);} else groups.push({u0:w.u0,u1:w.u1,z0:w.z0,z1:w.z1}); }
        groups.forEach((g,k)=>push(pc,'pan-'+k,F({u0:g.u0-.35,u1:g.u1+.35,z0:g.z0-.35,z1:g.z1+.35}),'mid','opening')); }
      if(p.grouping==='head-line'){ const slot=pc.freeZ.find(f=>f[0]>=pc.maxHead-.001&&f[1]-f[0]>=.3); if(slot) push(pc,'head',F({u0:bb.u0,u1:bb.u1,z0:slot[0]+.04,z1:Math.min(slot[0]+.26,slot[1]-.02)}),'dark','opening'); }
    }
    // ---- تأكيد أفقي/رأسي
    if(p.emphasis==='horizontal-courses'){ const slots=pc.freeZ.filter(f=>f[0]>.9&&f[1]-f[0]>=.35&&f[1]<bb.z1-.6).slice(0,2); slots.forEach((f,k)=>push(pc,'course-'+k,F({u0:bb.u0,u1:bb.u1,z0:f[0]+.08,z1:f[0]+.08+.2}),'mid','emphasis')); }
    if(p.emphasis==='vertical-rhythm'){ pc.gapsU.filter(g=>g[1]-g[0]>=.8).forEach((g,k)=>{ const c=(g[0]+g[1])/2; push(pc,'rib-'+k,F({u0:c-.16,u1:c+.16,z0:bb.z0,z1:bb.z1}),'mid','emphasis'); }); }
    // ---- تقسيم المواد إلى مناطق
    const lowSill=pc.minSill===null?null:pc.minSill-.12;
    if(p.zoning==='base'||p.zoning==='tripartite'){ const h=Math.min(p.seed.base??.9,lowSill??p.seed.base??.9); if(h>=.4) push(pc,'base',F({u0:bb.u0,u1:bb.u1,z0:bb.z0,z1:bb.z0+h}),'dark','zoning'); }
    if(p.zoning==='tripartite'||p.zoning==='attic'){ const z=(pc.maxHead??bb.z1*.6)+.3, topBand=p.roof==='deep-fascia'?.8:.4; if(bb.z1-z>topBand+.4) push(pc,'attic',F({u0:bb.u0,u1:bb.u1,z0:z,z1:bb.z1-(p.roof==='none'?0:topBand)}),'light','zoning'); }
    if(p.zoning==='side-split'){ const gs=pc.gapsU.filter(g=>g[0]>bb.u0+pc.span*.25&&g[1]<bb.u1-pc.span*.25); const g=gs[0]||pc.gapsU[0]; if(g){ const c=(g[0]+g[1])/2, right=(p.seed.side??0)===1; push(pc,'split',F(right?{u0:c,u1:bb.u1,z0:bb.z0,z1:bb.z1}:{u0:bb.u0,u1:c,z0:bb.z0,z1:bb.z1}),'light','zoning'); } }
    // ---- خط السقف
    const top=bb.z1;
    if(p.roof==='thin-cap') push(pc,'cap',F({u0:bb.u0,u1:bb.u1,z0:top-.14,z1:top}),'dark','roof');
    if(p.roof==='deep-fascia') push(pc,'fascia',F({u0:bb.u0,u1:bb.u1,z0:top-.7,z1:top}),'dark','roof');
    if(p.roof==='stepped'){ const sp=pc.span, a=bb.u0+sp*.42; push(pc,'step',null,'dark','roof',rc(bb.u0,top-.6,a,top).length&&[[bb.u0,top-.6],[a,top-.6],[a,top-.3],[bb.u1,top-.3],[bb.u1,top],[bb.u0,top],[bb.u0,top-.6]]); }
    if(p.roof==='raised-entry'){ push(pc,'cap',F({u0:bb.u0,u1:bb.u1,z0:top-.14,z1:top}),'dark','roof'); for(const e of E) push(pc,'raised-'+e.id,F({u0:e.cu-1.6,u1:e.cu+1.6,z0:top-.75,z1:top}),'accent','roof'); }
    // ---- معالجة الزوايا
    if(p.corner==='posts-both'){ push(pc,'cl',F({u0:bb.u0,u1:bb.u0+.4,z0:bb.z0,z1:bb.z1}),'mid','corner'); push(pc,'cr',F({u0:bb.u1-.4,u1:bb.u1,z0:bb.z0,z1:bb.z1}),'mid','corner'); }
    if(p.corner==='post-one'){ const far=E[0]&&(E[0].cu-bb.u0)<(bb.u1-E[0].cu)?'r':'l'; push(pc,'c1',F(far==='r'?{u0:bb.u1-.5,u1:bb.u1,z0:bb.z0,z1:bb.z1}:{u0:bb.u0,u1:bb.u0+.5,z0:bb.z0,z1:bb.z1}),'dark','corner'); }
    if(p.corner==='quoins'){ for(const [k,side] of [[0,'l'],[1,'r']]) for(let n=0;n<6;n++){ const z0=bb.z0+n*.5; if(z0+.3>bb.z1) break; const wide=n%2?.5:.3; push(pc,`q${side}${n}`,F(side==='l'?{u0:bb.u0,u1:bb.u0+wide,z0,z1:z0+.3}:{u0:bb.u1-wide,u1:bb.u1,z0,z1:z0+.3}),'mid','corner'); } }
  }
  return out;
}
export const GROUP_ORDER=['entrance','opening','roof','corner','emphasis','zoning'];
