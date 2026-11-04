import { copy, freeze, hash, number, id, fail, unique, issue } from './core.mjs';
import { layerMask, bounds, intersectRect, intersection, multiArea, rect } from './polygons.mjs';
import { stoneConfig, cutStoneLayer } from './stone.mjs';
export const VERSION='0.3.0';
/** إعداد تجريبي للمقارنة فقط (ليس حدًّا نظاميًا ولا موافقة). منفصل تمامًا عن سياسة المشروع. */
export const EXPERIMENT_PRESET=freeze({labelAr:'تجريبي للمقارنة فقط — لا يُعتمد للمشروع',maxProjectionM:{s:.7,n:.3,e:.3,w:.3}});
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
  const layers=B.layers.filter(L=>L.plan===true||L.role==='frame').map(L=>({...copy(L),mat:L.role==='wall'?(style==='A'?'stone':'render'):L.role==='frame'?(style==='C'?'bronze':'metal'):L.role==='glazing'?'glass':L.role==='door'?(style==='C'?'wood':'metal'):L.mat}));
  const add=(wall,ring,name,material,depth,role='proposal')=>{
    if(depth===0)return; // Explicit zero is a no-new-projections policy, not a generation error.
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
    const all=pc?.openings||[],entries=all.filter(o=>o.entry&&!/^window/.test(o.kind)),windows=all.filter(o=>/^window/.test(o.kind));
    const m=(d)=>Math.min(d,budget);
    if(style==='A') { // كلاسيكي حجري: كسوة كاملة، أطر حجرية للنوافذ، أكتاف ورأس للمدخل، قاعدة وكرنيش
      add(wall,rect(bb.u0,bb.z0,bb.u1,bb.z1),'stone-skin','stone',m(.045),'stone-cladding');
      add(wall,rect(bb.u0,bb.z0,bb.u1,bb.z0+.45),'plinth','stone',m(.09),'plinth');
      add(wall,rect(bb.u0,bb.z1-.16,bb.u1,bb.z1),'cornice','stone',m(.14),'cornice');
      for(const o of windows){
        add(wall,rect(o.u0-.14,o.z0-.14,o.u1+.14,o.z1+.14),'win-surround-'+o.id,'stone',m(.07),'surround');
        add(wall,rect(o.u0-.20,o.z0-.20,o.u1+.20,o.z0-.10),'win-sill-'+o.id,'stone',m(.12),'sill');
      }
      for(const o of entries) {
        add(wall,rect(o.u0-.30,o.z0,o.u0,o.z1+.30),'entry-left-'+o.id,'stone',m(.16),'entry-pier');
        add(wall,rect(o.u1,o.z0,o.u1+.30,o.z1+.30),'entry-right-'+o.id,'stone',m(.16),'entry-pier');
        add(wall,rect(o.u0-.30,o.z1,o.u1+.30,o.z1+.30),'entry-head-'+o.id,'stone',m(.16),'entry-head');
      }
    } else if(style==='B') {
      add(wall,rect(bb.u0-.0,bb.z1-.10,bb.u1,bb.z1),'roof-slab','render',m(.28),'roof-edge'); // حديث مظلّل: بياض مع قاعدة بيج، تأطير معدني عميق للنوافذ، بوابة مدخل غائرة داكنة بمظلة
      add(wall,rect(bb.u0,bb.z0,bb.u1,Math.min(bb.z0+.5,bb.z1)),'beige-base','beigeStone',m(.08),'stone-cladding');
      for(const o of windows){
        add(wall,rect(o.u0-.11,o.z0-.11,o.u1+.11,o.z1+.11),'win-frame-'+o.id,'darkRender',m(.06),'reveal');
        add(wall,rect(o.u0-.11,o.z1+.11,o.u1+.11,o.z1+.17),'win-shade-'+o.id,'metal',m(.26),'shade');
      }
      for(const o of entries) {
        add(wall,rect(o.u0-.45,o.z0,o.u0-.04,o.z1+.38),'portal-left-'+o.id,'darkRender',m(.34),'entry-pier');
        add(wall,rect(o.u1+.04,o.z0,o.u1+.45,o.z1+.38),'portal-right-'+o.id,'darkRender',m(.34),'entry-pier');
        add(wall,rect(o.u0-.50,o.z1+.22,o.u1+.50,o.z1+.38),'portal-top-'+o.id,'metal',m(.7),'canopy');
      }
    } else { // خشبي رأسي: حزام متدرج، كاسرات رأسية وظلة نوافذ أفقية، مدخل بزعانف غير متماثلة
      const za=bb.z0+height*.68, zb=Math.min(bb.z1,za+.22);
      const stepped=[[bb.u0,za],[bb.u0+span*.40,za],[bb.u0+span*.40,za-.18],[bb.u1,za-.18],[bb.u1,zb],[bb.u0,zb],[bb.u0,za]];
      add(wall,stepped,'stepped-band','wood',m(.22),'stepped-fascia');
      add(wall,rect(bb.u0,bb.z0,bb.u0+.45,bb.z1),'post-left','darkRender',m(.10),'corner-post');
      add(wall,rect(bb.u1-.45,bb.z0,bb.u1,bb.z1),'post-right','darkRender',m(.10),'corner-post');
      for(const o of windows){
        add(wall,rect(o.u0-.05,o.z1+.04,o.u1+.05,o.z1+.09),'win-hood-'+o.id,'wood',m(.30),'hood');
        for(let n=0;n<3;n++){const u=o.u0+(o.u1-o.u0)*(n+.5)/3-.02;add(wall,rect(u,o.z0+.1,u+.04,o.z1-.1),'win-fin-'+o.id+'-'+n,'wood',m(.08),'vertical-fin');}
      }
      for(const o of entries) {
        const maxWidth=Math.min(1,Math.max(.3,span*.12));
        add(wall,rect(o.u0-maxWidth-.1,o.z0,o.u0-.05,o.z1+.15),'rib-back-'+o.id,'darkRender',m(.04),'entry-panel');
        for(let n=0;n<5;n++){ const u=o.u0-maxWidth-.06+n*(maxWidth/5); add(wall,rect(u,o.z0,u+.055,o.z1+.15),'rib-'+o.id+'-'+n,'wood',m(.25),'vertical-fin'); }
        add(wall,rect(o.u0-.15,o.z1+.03,o.u1+.6,o.z1+.13),'asymmetric-hood-'+o.id,'metal',m(.42),'canopy');
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
  const experiment=options.experiment?copy(options.experiment):null;
  if(experiment){if(options.projectEvidence?.usage==='project')fail('EXPERIMENT_NOT_ALLOWED_IN_PROJECT','experiment');for(const s of SIDES)number(experiment.maxProjectionM?.[s],'experiment.maxProjectionM.'+s,0,2);}
  const budgets=experiment?experiment.maxProjectionM:projections;
  const built=Object.fromEntries(SIDES.map(s=>[s,decorateSide(source[s],style,s,budgets[s],frontSide)]));
  if(await hash(planSignature(built))!==sourceGeometryHash) fail('PLAN_GEOMETRY_CHANGED','built');
  const cuts={},issues=[issue('PROPOSALS_REQUIRE_REVIEW','البروزات ميزانية تصميم مدخلة، ولم تُتحقق اشتراطات الارتدادات أو الإنشاء تلقائيًا.')];
  if(experiment)issues.push(issue('EXPERIMENTAL_PROJECTIONS','بروزات تجريبية للمقارنة البصرية فقط؛ لا تُعتمد للمشروع أو التنفيذ، وسياسة المشروع تبقى دون بروزات جديدة.',{maxProjectionM:experiment.maxProjectionM},'warning'));
  else if(projections[frontSide]===0)issues.push(issue('NEW_PROJECTIONS_DISABLED','البروزات الجديدة متوقفة؛ هذا ليس إثباتًا بأن الحد النظامي صفر، وقد يقل التمايز الهندسي.'));
  if(options.projectEvidence?.stone.status==='VISUAL_ASSUMPTION')issues.push(issue('STONE_VISUAL_ASSUMPTION','مقاسات الحجر والفاصل وعمقه افتراضات عرض وليست مواصفة منتج.'));
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
  const result={schema:'MIZAN-FACADE-KIT/1',version:VERSION,sourceRevision:options.sourceRevision||'UNSPECIFIED',sourceHash,sourceGeometryHash,style:copy(STYLES[style]),frontSide,transforms,built,cuts,stone:config,maxProjectionM:copy(projections),experiment:experiment?{enabled:true,labelAr:'تجريبي للمقارنة فقط — لا يُعتمد للمشروع',maxProjectionM:copy(experiment.maxProjectionM)}:null,roofSurfaces,assets:copy(options.assets||{}),issues,visualApproval:'NOT_REVIEWED',codeCompliance:'NOT_EVALUATED',constructionApproved:false};
  result.projectBinding=copy(options.projectBinding||null);result.projectEvidence=copy(options.projectEvidence||null);
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
