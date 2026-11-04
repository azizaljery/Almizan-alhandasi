// صفحة رسم للمفاهيم (تُستعمل من سكربت التقرير). نطاق معزول: لا ربط بالموقع.
import * as THREE from '../vendor/three.module.min.js';
import { createFacadeViewer } from '../src/viewer.mjs';
const GREY={render:.80,stone:.92,beigeStone:.62,darkRender:.30,bronze:.46,metal:.30,wood:.38};
const mk=(THREE,mode)=>lib=>lib; // placeholder
function greyLibrary(THREE,mode){
  const cache=new Map(), mats=[];
  const grey=(v,rough=.9)=>{const m=new THREE.MeshStandardMaterial({color:new THREE.Color(v,v,v),roughness:rough,metalness:0});mats.push(m);return m;};
  const glass=new THREE.MeshStandardMaterial({color:'#20282c',roughness:.1,metalness:0});mats.push(glass);
  const ground=grey(.55,1);const interior=new THREE.MeshStandardMaterial({color:'#101010'});mats.push(interior);
  return {mats:{ground},evidence:[{material:'grey-test',status:'GREY_VALUE_ONLY',representsVerifiedProduct:false}],
    get(name){ if(name==='glass') return glass; if(name==='interior') return interior; if(!cache.has(name)){ const v=mode==='uniform'?.78:(GREY[name]??.7); cache.set(name,grey(v)); } return cache.get(name); },
    dispose(){mats.forEach(m=>m.dispose());}};
}
window.renderConcept=async(packet,{mode='tone',view='front',w=900,h=560}={})=>{
  const canvas=document.getElementById('c');canvas.width=w;canvas.height=h;canvas.style.width=w+'px';canvas.style.height=h+'px';
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const viewer=await createFacadeViewer(THREE,canvas,packet,{materialLibraryFactory:mode==='full'?null:T=>greyLibrary(T,mode),pixelRatio:1});
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const box=viewer.model.bounds, c=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3()), cam=viewer.camera;
  const front=packet.frontSide, f={s:[0,0,1],n:[0,0,-1],e:[1,0,0],w:[-1,0,0]}[front], fv=new THREE.Vector3(...f), right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),fv);
  const width=front==='s'||front==='n'?size.x:size.z, height=size.y;
  cam.fov=view==='front'?24:34; const dist=Math.max(width/(2*Math.tan(THREE.MathUtils.degToRad(cam.fov/2))*(w/h)),height/(2*Math.tan(THREE.MathUtils.degToRad(cam.fov/2))))*1.28;
  const dir=view==='front'?fv.clone().add(new THREE.Vector3(0,.04,0)).normalize():fv.clone().addScaledVector(right,-.55).add(new THREE.Vector3(0,.22,0)).normalize();
  const half=(front==='s'||front==='n'?size.z:size.x)/2; const target=c.clone().addScaledVector(fv,half).add(new THREE.Vector3(0,-height*.02,0)); cam.position.copy(target).addScaledVector(dir,dist); cam.near=.05; cam.far=dist*6; cam.lookAt(target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  viewer.render(); const url=canvas.toDataURL('image/png'); const stats=viewer.stats; viewer.dispose(); return {url,triangles:stats.triangles};
};
window.__LAB_READY=true;
