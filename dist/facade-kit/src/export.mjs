import {GLTFExporter} from '../vendor/GLTFExporter.mjs';
/** Export geometry/materials and optional named cameras ({name,camera}). Environment/light/ground are intentionally external. */
export async function exportFacadeGLB(model,{cameras=[]}={}){
  if(!model?.group)throw new Error('FACADE_MODEL_REQUIRED');
  const binary=await new GLTFExporter().parseAsync([model.group,...cameras.map(({name,camera})=>{const c=camera.clone();c.name=name;c.updateMatrixWorld(true);return c;})],{binary:true,onlyVisible:true});
  return new Blob([binary],{type:'model/gltf-binary'});
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
