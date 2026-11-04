// Served ONLY from dist/facade-kit/integration/ inside the existing repository.
import * as THREE from '../vendor/three.module.min.js';
import {buildAllSides,sideTransform} from '../../facade-realism/model.mjs';
import {buildBuildingScene} from '../../facade-realism/scene.mjs';
import {createRealismMaterials} from '../../facade-realism/materials.mjs';
import {createFacadePackage,EXPERIMENT_PRESET} from '../src/model.mjs';import {createFacadeViewer} from '../src/viewer.mjs';
import {projectOptions} from '../src/project.mjs';import {closeupPlan} from '../src/comparison.mjs';import {BUILD_INFO} from '../config/build-info.mjs';
const read=async p=>{const r=await fetch(new URL(p,import.meta.url));if(!r.ok)throw new Error('SOURCE_HTTP_'+r.status);return r.json();};
document.querySelector('#run').onclick=async()=>{
  const button=document.querySelector('#run'),status=document.querySelector('#status'),out=document.querySelector('#report'),images=document.querySelector('#images'),canvas=document.querySelector('#canvas');button.disabled=true;
  const report={status:'RUNNING',sourceRevision:BUILD_INFO.sourceRevision,shots:[],errors:[],expected:27};let viewer;
  try{const [doc,policy]=await Promise.all([read('../examples/source-C1.json'),read('../config/project-policy.json')]);
    const source=buildAllSides(doc,'A'),transforms=Object.fromEntries(['s','n','e','w'].map(s=>[s,sideTransform(s,source[s].off)]));const plans=closeupPlan(source,transforms),options=projectOptions({policy,buildInfo:BUILD_INFO,projectId:'comparison-only',designId:'C1'});
    const frameBounds=new THREE.Box3(new THREE.Vector3(0,0,-30),new THREE.Vector3(20,6,0));images.replaceChildren();
    for(const style of ['A','B','C']){const packet=await createFacadePackage(source,{...options,transforms,style}),packetExp=await createFacadePackage(source,{...options,transforms,style,experiment:EXPERIMENT_PRESET});
      for(const plan of plans)for(const implementation of ['kit','kit-exp','sample']){
        status.textContent=`${implementation} / ${style} / ${plan.shot}`;
        const extra=implementation==='sample'?{materialLibraryFactory:T=>createRealismMaterials(T),modelFactory:(T,p,lib)=>{
          const S=buildBuildingScene(T,buildAllSides(doc,style),lib,{geo:'block'}),ground=S.group.getObjectByName('ground');if(ground){S.group.remove(ground);ground.geometry.dispose();}
          return {group:S.group,bounds:new T.Box3().setFromObject(S.group),stats:{implementation:'native-sample',triangles:S.tris},dispose(){S.group.traverse(n=>n.geometry?.dispose());S.group.clear();}};
        }}:{};
        viewer=await createFacadeViewer(THREE,canvas,implementation==='kit-exp'?packetExp:packet,{pixelRatio:1,cameraState:plan,frameBounds,...extra});const blob=await viewer.toBlob(),url=URL.createObjectURL(blob),article=document.createElement('article'),img=document.createElement('img'),link=document.createElement('a');img.src=url;img.alt=`${implementation}-${style}-${plan.shot}`;link.href=url;link.download=img.alt+'.png';link.textContent='تنزيل '+img.alt;article.append(img,link);images.append(article);
        report.shots.push({implementation,style,shot:plan.shot,camera:plan,resultHash:(implementation==='kit-exp'?packetExp:packet).resultHash,bytes:blob.size,glError:viewer.renderer.getContext().getError()});viewer.dispose();viewer=null;
      }
    }report.status=report.shots.length===27?'CAPTURED_NOT_VISUALLY_APPROVED':'INCOMPLETE';status.textContent='اكتمل الالتقاط؛ الصور للمراجعة قبل أي نشر.';
  }catch(e){report.status='BLOCKED';report.errors.push(e.message);status.textContent='تعذّر الالتقاط: '+e.message;}
  finally{viewer?.dispose();out.textContent=JSON.stringify(report,null,2);button.disabled=false;}
};
