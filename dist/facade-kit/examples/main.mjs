import * as THREE from '../vendor/three.module.min.js';
import {createFacadePackage,createFacadeViewer,exportFacadeGLB,downloadBlob,STYLES} from '../src/index.mjs';
const read=async p=>{const r=await fetch(new URL(p,import.meta.url));if(!r.ok)throw new Error('SOURCE_HTTP_'+r.status);return r.json();};
const grid=document.querySelector('#grid'),status=document.querySelector('#status'),audit=document.querySelector('#audit');let viewers=[],busy=false;
const [built,transforms,roofSurfaces]=await Promise.all(['source-built.json','source-transforms.json','source-roofs.json'].map(read));
const options={transforms,frontSide:'s',maxProjectionM:{s:.7,n:0,e:0,w:0},roofSurfaces,sourceRevision:'c8acdd3e4d14f30c59213d3abcca5625e9f0707e'};
// Shared bounds keep framing and sun position identical across A/B/C after reset.
const frameBounds=new THREE.Box3();for(const [side,b]of Object.entries(built)){const rows=transforms[side],M=new THREE.Matrix4().set(...rows[0],...rows[1],...rows[2],0,0,0,1);for(const L of b.layers)for(const [u,z]of L.outer)for(const o of [L.o0,L.o1+options.maxProjectionM[side]])frameBounds.expandByPoint(new THREE.Vector3(u,z,L.C+o).applyMatrix4(M));}
const config=()=>({side:document.querySelector('#side').value,monochrome:document.querySelector('#mono').checked,stoneMode:document.querySelector('#flat').checked?'flat':'cut'});
async function refresh(){if(busy)return;busy=true;document.querySelectorAll('.controls button,.controls select,.controls input').forEach(e=>e.disabled=true);status.textContent='جاري تجهيز البدائل…';
  const cameras=viewers.map(v=>v.getCameraState());for(const v of viewers)v.dispose();viewers=[];grid.replaceChildren();const evidence=[];
  try{for(const [i,style]of ['A','B','C'].entries()){
    const article=document.createElement('article'),title=document.createElement('h2'),canvas=document.createElement('canvas'),buttons=document.createElement('div'),stats=document.createElement('div');buttons.className='card-controls';stats.className='stats';title.textContent=style+' — '+STYLES[style].nameAr;canvas.setAttribute('aria-label',title.textContent);article.append(title,canvas,buttons,stats);grid.append(article);
    const packet=await createFacadePackage(built,{...options,style,stone:{jointM:Number(document.querySelector('#joint').value)}});
    const viewer=await createFacadeViewer(THREE,canvas,packet,{...config(),frameBounds,cameraState:cameras[i]||null});viewers.push(viewer);
    for(const [label,run]of [['تقريب',()=>zoom(viewer,.82)],['إبعاد',()=>zoom(viewer,1.22)],['PNG',async()=>downloadBlob(await viewer.toBlob(),`mizan-${style}-preview.png`)],['GLB',async()=>downloadBlob(await exportFacadeGLB(viewer.model),`mizan-${style}.glb`)]]){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{try{b.disabled=true;await run();}catch(e){status.textContent='تعذّر الإجراء: '+e.message;}finally{b.disabled=false;}};buttons.append(b);}
    stats.textContent=`ألواح هندسية: ${viewer.stats.stoneTiles} · مثلثات: ${Math.round(viewer.stats.triangles).toLocaleString('ar')} · اعتماد بصري: لم يراجع`;
    evidence.push({style,resultHash:packet.resultHash,sourceHash:packet.sourceHash,sourceGeometryHash:packet.sourceGeometryHash,stats:viewer.stats,cuts:Object.fromEntries(Object.entries(packet.cuts).map(([k,c])=>[k,c.audit])),issues:packet.issues});
  }status.textContent='اكتمل العرض. استخدم الجهات والرمادي لمقارنة التكوين، والتقريب لفحص الفواصل. تصدير GLB لا يضم الأرض والسماء.';audit.textContent=JSON.stringify(evidence,null,2);window.facadeQA={ready:true,evidence,renderers:viewers.length,errors:[]};
  }catch(e){status.textContent='تعذّر العرض: '+e.message+' — الحزمة تحتاج متصفحًا يدعم WebGL. الاختبار الحسابي مستقل عن العرض.';console.error(e);window.facadeQA={ready:false,error:e.message};}
  finally{busy=false;document.querySelectorAll('.controls button,.controls select,.controls input').forEach(e=>e.disabled=false);}
}
function zoom(v,factor){v.camera.position.sub(v.target).multiplyScalar(factor).add(v.target);v.camera.near=.02;v.camera.updateProjectionMatrix();v.camera.lookAt(v.target);v.render();}
document.querySelector('#side').onchange=()=>{for(const v of viewers)v.fit(config().side);};
for(const id of ['mono','flat','joint'])document.getElementById(id).onchange=refresh;
document.querySelector('#reset').onclick=()=>viewers.forEach(v=>v.fit(config().side));
await refresh();
