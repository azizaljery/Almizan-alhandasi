import {fail,number} from './core.mjs';
import {createMaterialLibrary} from './materials.mjs';
import {buildFacadeScene} from './scene.mjs';
import {installEnvironment} from './environment.mjs';
/** Fit all eight bounding-box corners, rather than assuming a square building. */
export function fitCamera(THREE,camera,box,{side='s',aspect=1,padding=1.18,oblique=.44,elevation=.23}={}){
  number(aspect,'aspect',.05,20);number(padding,'padding',1,3);
  const fronts={s:[0,0,1],n:[0,0,-1],e:[1,0,0],w:[-1,0,0]},f=fronts[side];if(!f)fail('CAMERA_SIDE',side);
  const center=box.getCenter(new THREE.Vector3()),front=new THREE.Vector3(...f),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),front);
  const direction=front.addScaledVector(right,-oblique).add(new THREE.Vector3(0,elevation,0)).normalize();
  camera.aspect=aspect;camera.position.copy(center).add(direction);camera.lookAt(center);camera.updateMatrixWorld();
  const q=camera.quaternion.clone().invert(),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*aspect;
  let distance=1;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(q);distance=Math.max(distance,p.z+Math.abs(p.x)*padding/tanH,p.z+Math.abs(p.y)*padding/tanV);
  }
  const diagonal=box.getSize(new THREE.Vector3()).length();camera.position.copy(center).addScaledVector(direction,distance);camera.near=Math.max(.01,distance-diagonal*1.5);camera.far=distance+diagonal*4+10;camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld();return {target:center,distance};
}
export async function createFacadeViewer(THREE,canvas,packet,{surfaceAssets={},environmentAsset=null,assetOptions={},side=packet.frontSide,stoneMode='cut',monochrome=false,pixelRatio=Math.min(globalThis.devicePixelRatio||1,2),cameraState=null,frameBounds=null,materialLibraryFactory=null,modelFactory=null}={}){
  if(!canvas?.getContext)fail('CANVAS_REQUIRED','canvas');let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});}catch{fail('WEBGL_UNAVAILABLE','canvas');}
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.setPixelRatio(Math.min(2,Math.max(.5,pixelRatio)));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(),library=materialLibraryFactory?materialLibraryFactory(THREE):createMaterialLibrary(THREE,{surfaceAssets,maxAnisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy())});let model,environment,ground;
  try{model=modelFactory?await modelFactory(THREE,packet,library):await buildFacadeScene(THREE,packet,library,{stoneMode,monochrome});scene.add(model.group);environment=await installEnvironment(THREE,renderer,scene,{asset:environmentAsset,assetOptions});
    const box=frameBounds||model.bounds,center=box.getCenter(new THREE.Vector3()),span=box.getSize(new THREE.Vector3()),extent=Math.max(span.x,span.z);
    ground=new THREE.Mesh(new THREE.PlaneGeometry(extent*7,extent*7),library.mats.ground);ground.rotation.x=-Math.PI/2;ground.position.set(center.x,box.min.y-.008,center.z);ground.receiveShadow=true;scene.add(ground);
    const sun=new THREE.DirectionalLight('#fff1dc',3);sun.position.copy(center).add(new THREE.Vector3(-extent*.7,extent*.95,extent*.6));sun.target.position.copy(center);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);const s=extent*.9;Object.assign(sun.shadow.camera,{left:-s,right:s,top:s,bottom:-s,near:.1,far:extent*4});sun.shadow.bias=-.00005;sun.shadow.normalBias=.015;sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
    const camera=new THREE.PerspectiveCamera(cameraState?.fov??38,1,.1,1000);let target,disposed=false,firstResize=true;
    const render=()=>{if(!disposed)renderer.render(scene,camera);};
    const resize=()=>{const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;
      target=fitCamera(THREE,camera,box,{side,aspect:w/h}).target;if(firstResize&&cameraState){camera.position.fromArray(cameraState.position);target.fromArray(cameraState.target);camera.lookAt(target);camera.updateMatrixWorld();}firstResize=false;
      camera.updateProjectionMatrix();render();};
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    const onLost=e=>{e.preventDefault();canvas.dispatchEvent(new CustomEvent('facade-status',{detail:{code:'WEBGL_CONTEXT_LOST'}}));};canvas.addEventListener('webglcontextlost',onLost);
    const onRestored=()=>{render();canvas.dispatchEvent(new CustomEvent('facade-status',{detail:{code:'WEBGL_CONTEXT_RESTORED'}}));};canvas.addEventListener('webglcontextrestored',onRestored);
    return {scene,camera,model,renderer,target,render,resize,stats:{...model.stats,materials:library.evidence,environment:environment.evidence},
      fit(newSide=side){side=newSide;target.copy(fitCamera(THREE,camera,box,{side,aspect:camera.aspect}).target);render();},
      getCameraState(){return {position:camera.position.toArray(),target:target.toArray()};},
      async toBlob(){render();return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG_ENCODE_FAILED')),'image/png'));},
      dispose(){disposed=true;observer.disconnect();canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);sun.shadow.dispose();model.dispose();ground.geometry.dispose();environment.dispose();library.dispose();renderer.dispose();}
    };
  }catch(e){model?.dispose();ground?.geometry.dispose();environment?.dispose();library.dispose();renderer.dispose();throw e;}
}
