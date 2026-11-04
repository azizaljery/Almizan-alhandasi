import {GLTFExporter} from '../vendor/GLTFExporter.mjs';
/** Export geometry/materials only. Environment/light/ground are intentionally external. */
export async function exportFacadeGLB(model){
  if(!model?.group)throw new Error('FACADE_MODEL_REQUIRED');
  const binary=await new GLTFExporter().parseAsync(model.group,{binary:true,onlyVisible:true});
  return new Blob([binary],{type:'model/gltf-binary'});
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
