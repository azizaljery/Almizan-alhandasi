import { copy, freeze, hash, number, id, fail, unique, issue } from './core.mjs';
import { layerMask, bounds, intersectRect, intersection, multiArea, rect } from './polygons.mjs';
import { stoneConfig, cutStoneLayer } from './stone.mjs';
export const VERSION='0.1.0';
export const SIDES=['s','n','e','w'];
export const STYLES=freeze({ A:{id:'A',nameAr:'حجر فاتح ومدخل مؤطّر',materialFamily:'stone'}, B:{id:'B',nameAr:'بوابة مدخل عميقة وتظليل معدني',materialFamily:'shade'}, C:{id:'C',nameAr:'حواف متدرجة وكاسرات رأسية',materialFamily:'vertical'} });
export function validateBuilt(raw) {
  const built=copy(raw);
  for(const side of SIDES) {
    const b=built[side]; if(!b||!Array.isArray(b.layers)||!b.layers.length||b.layers.length>3000) fail('BUILT_SIDE_REQUIRED',side);
    unique(b.layers,side+'.layers');
    for(const L of b.layers) { id(L.id); number(L.C,L.id+'.C'); number(L.o0,L.id+'.o0'); number(L.o1,L.id+'.o1'); if(L.o1<=L.o0) fail('LAYER_DEPTH',L.id); layerMask(L); }
  }
  return built;
}
export function planSignature(built) {
  // Material/style descriptions are excluded; all supplied source plan geometry is preserved.
  return Object.fromEntries(SIDES.map(s=>[s,{pieces:built[s].F?.pieces||null,layers:built[s].layers.filter(l=>l.plan===true||l.role==='frame').map(l=>({id:l.id,role:l.role,opening:l.opening||null,C:l.C,o0:l.o0,o1:l.o1,outer:l.outer,holes:l.holes}))}]));
}
function decorateSide(B,style,side,budget,frontSide) {
  const layers=B.layers.filter(L=>L.plan===true||L.role==='frame').map(L=>({...copy(L),mat:L.role==='wall'?(style==='A'?'stone':'render'):L.role==='frame'?'metal':L.role==='glazing'?'glass':L.role==='door'?(style==='C'?'wood':'metal'):L.mat}));
  const add=(wall,ring,name,material,depth,role='proposal')=>{
    if(depth<=0||depth>budget+1e-9) fail('PROJECTION_BUDGET',side+':'+name);
    const clipped=intersection(layerMask(wall),[ring]);
    for(let k=0;k<clipped.length;k++) {
      if(multiArea([clipped[k]])<1e-8) continue;
      layers.push({id:`${wall.id}:kit:${style}:${name}:${k}`,role,mat:material,plan:false,tag:'اقتراح واجهة يحتاج مراجعة',C:wall.C,o0:wall.o1,o1:wall.o1+depth,outer:clipped[k][0],holes:clipped[k].slice(1),piece:wall.piece??null});
    }
  };
  if(side===frontSide) for(const wall of layers.filter(L=>L.role==='wall')) {
    const mask=layerMask(wall); if(!mask.length) continue; const bb=bounds(mask), span=bb.u1-bb.u0, height=bb.z1-bb.z0;
    const pc=(B.F?.pieces||[]).find(p=>p.i===wall.piece);
    const entries=pc?.openings?.filter(o=>o.entry&&!/^window/.test(o.kind))||[];
    if(style==='A') {
      add(wall,rect(bb.u0,bb.z0,bb.u1,bb.z1),'stone-skin','stone',Math.min(.045,budget),'stone-cladding');
      for(const o of entries) {
        add(wall,rect(o.u0-.22,o.z0,o.u0,o.z1+.25),'entry-left-'+o.id,'stone',Math.min(.16,budget),'entry-pier');
        add(wall,rect(o.u1,o.z0,o.u1+.22,o.z1+.25),'entry-right-'+o.id,'stone',Math.min(.16,budget),'entry-pier');
        add(wall,rect(o.u0-.22,o.z1,o.u1+.22,o.z1+.25),'entry-head-'+o.id,'stone',Math.min(.16,budget),'entry-head');
      }
    } else if(style==='B') {
      add(wall,rect(bb.u0,bb.z0,bb.u1,Math.min(bb.z0+.5,bb.z1)),'beige-base','beigeStone',Math.min(.08,budget),'stone-cladding');
      for(const o of entries) {
        add(wall,rect(o.u0-.32,o.z0,o.u0-.04,o.z1+.38),'portal-left-'+o.id,'darkRender',Math.min(.34,budget),'entry-pier');
        add(wall,rect(o.u1+.04,o.z0,o.u1+.32,o.z1+.38),'portal-right-'+o.id,'darkRender',Math.min(.34,budget),'entry-pier');
        add(wall,rect(o.u0-.36,o.z1+.22,o.u1+.36,o.z1+.38),'portal-top-'+o.id,'metal',Math.min(.7,budget),'canopy');
      }
    } else {
      const za=bb.z0+height*.68, zb=Math.min(bb.z1,za+.22);
      const stepped=[[bb.u0,za],[bb.u0+span*.40,za],[bb.u0+span*.40,za-.18],[bb.u1,za-.18],[bb.u1,zb],[bb.u0,zb],[bb.u0,za]];
      add(wall,stepped,'stepped-band','wood',Math.min(.22,budget),'stepped-fascia');
      for(const o of entries) {
        const maxWidth=Math.min(1,Math.max(.3,span*.12));
        add(wall,rect(o.u0-maxWidth-.1,o.z0,o.u0-.05,o.z1+.15),'rib-back-'+o.id,'darkRender',Math.min(.04,budget),'entry-panel');
        for(let n=0;n<5;n++){ const u=o.u0-maxWidth-.06+n*(maxWidth/5); add(wall,rect(u,o.z0,u+.055,o.z1+.15),'rib-'+o.id+'-'+n,'wood',Math.min(.25,budget),'vertical-fin'); }
        add(wall,rect(o.u0-.15,o.z1+.03,o.u1+.6,o.z1+.13),'asymmetric-hood-'+o.id,'metal',Math.min(.42,budget),'canopy');
      }
    }
  }
  return {...copy(B),layers};
}
export async function createFacadePackage(raw,options) {
  const source=freeze(validateBuilt(raw)); const sourceHash=await hash(source), signature=planSignature(source), sourceGeometryHash=await hash(signature);
  const style=options?.style||'A', frontSide=options?.frontSide;
  if(!STYLES[style]) fail('STYLE_UNKNOWN',style); if(!SIDES.includes(frontSide)) fail('FRONT_SIDE_REQUIRED','frontSide');
  const projections=options?.maxProjectionM; if(!projections)fail('EXPLICIT_PROJECTION_BUDGET_REQUIRED','maxProjectionM');
  for(const s of SIDES) number(projections[s],'maxProjectionM.'+s,0,2);
  const transforms=copy(options.transforms); for(const s of SIDES) { const m=transforms[s]; if(!Array.isArray(m)||m.length!==3||m.some(r=>!Array.isArray(r)||r.length!==4))fail('TRANSFORM_REQUIRED',s); m.flat().forEach(v=>number(v,s+'.transform'));
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){const dot=m[i].slice(0,3).reduce((v,x,k)=>v+x*m[j][k],0);if(Math.abs(dot-(i===j?1:0))>1e-8)fail('TRANSFORM_NOT_RIGID',s);}
    const det=m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);if(Math.abs(det-1)>1e-8)fail('TRANSFORM_REFLECTION',s);
  }
  const built=Object.fromEntries(SIDES.map(s=>[s,decorateSide(source[s],style,s,projections[s],frontSide)]));
  if(await hash(planSignature(built))!==sourceGeometryHash) fail('PLAN_GEOMETRY_CHANGED','built');
  const cuts={},issues=[issue('PROPOSALS_REQUIRE_REVIEW','البروزات ميزانية تصميم مدخلة، ولم تُتحقق اشتراطات الارتدادات أو الإنشاء تلقائيًا.')];
  const config=stoneConfig(options.stone||{});
  for(const side of SIDES)for(const L of built[side].layers)if(L.role==='stone-cladding'||L.role==='wall'&&L.mat==='stone') {
    const thickness=L.o1-L.o0;
    const adapted={...config,recessM:Math.min(config.recessM,thickness*.45),bevelM:Math.min(config.bevelM,thickness*.2)};
    if(thickness<.004){issues.push(issue('THIN_STONE_LAYER','غلاف الكسوة رقيق جدًا لتمثيل عمق الحجر.',{side,layerId:L.id},'error'));continue;}
    cuts[side+':'+L.id]=cutStoneLayer(L,adapted);
  }
  const roofSurfaces=copy(options.roofSurfaces||[]);unique(roofSurfaces,'roofSurfaces');
  for(const roof of roofSurfaces){number(roof.bottomM,roof.id+'.bottomM');number(roof.topM,roof.id+'.topM');if(roof.topM<=roof.bottomM)fail('ROOF_THICKNESS',roof.id);layerMask({id:roof.id,outer:roof.polygon,holes:roof.holes||[]});if(!roof.sourceNote)fail('ROOF_PROVENANCE_REQUIRED',roof.id);}
  if(!roofSurfaces.length)issues.push(issue('ROOF_NOT_SUPPLIED','لا سطح مسقوف مخمّن؛ قد يظهر باطن النموذج من الكاميرا المرتفعة.'));
  const result={schema:'MIZAN-FACADE-KIT/1',version:VERSION,sourceRevision:options.sourceRevision||'UNSPECIFIED',sourceHash,sourceGeometryHash,style:copy(STYLES[style]),frontSide,transforms,built,cuts,stone:config,maxProjectionM:copy(projections),roofSurfaces,assets:copy(options.assets||{}),issues,visualApproval:'NOT_REVIEWED',codeCompliance:'NOT_EVALUATED',constructionApproved:false};
  result.resultHash=await hash(result);return freeze(result);
}
export async function verifyFacadePackage(raw){const r=copy(raw),expected=r.resultHash;delete r.resultHash;return r.schema==='MIZAN-FACADE-KIT/1'&&r.constructionApproved===false&&r.codeCompliance==='NOT_EVALUATED'&&expected===await hash(r);}
export async function verifySource(result,built){return result.sourceHash===await hash(validateBuilt(built));}
export async function fromMizanDraw(doc,{buildAllSides,sideTransform,validateDoc,...options}) {
  if(typeof buildAllSides!=='function'||typeof sideTransform!=='function'||typeof validateDoc!=='function')fail('NATIVE_ADAPTERS_REQUIRED','callbacks');
  const snapshot=copy(doc),before=await hash(snapshot),checks=validateDoc(snapshot);
  if(snapshot.schema!=='mizan-draw/1'||!Array.isArray(checks)||checks.some(x=>x.severity==='error'))fail('INVALID_NATIVE_DOC','doc');
  const built=buildAllSides(snapshot,options.sourceVariant||'A');
  if(await hash(snapshot)!==before)fail('NATIVE_MUTATED_INPUT','doc');
  const transforms=Object.fromEntries(SIDES.map(s=>[s,sideTransform(s,built[s].off)]));
  const result=await createFacadePackage(built,{...options,transforms});
  return {result,sourceDocumentHash:before,sourceBuilt:built};
}
